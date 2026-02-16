package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/rs/cors"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	"github.com/jermoo/apis/apis-server/internal/config"
	"github.com/jermoo/apis/apis-server/internal/handlers"
	authmw "github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/services"
	"github.com/jermoo/apis/apis-server/internal/storage"
)

func main() {
	// Configure zerolog
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr})

	// Log startup
	log.Info().
		Str("version", config.Version).
		Str("service", "apis-server").
		Msg("APIS server starting")

	// Initialize auth configuration first (validates environment variables)
	if err := config.InitAuthConfig(); err != nil {
		log.Fatal().Err(err).Msg("Failed to initialize auth configuration")
	}

	// Log the current auth mode
	log.Info().
		Str("auth_mode", config.AuthMode()).
		Bool("local_auth", config.IsLocalAuth()).
		Bool("saas_mode", config.IsSaaSMode()).
		Bool("auth_disabled", config.IsAuthDisabled()).
		Msg("Auth mode configured")

	// E15-M2: Warn about deprecated Zitadel environment variables
	for _, envVar := range []string{"ZITADEL_MASTERKEY", "ZITADEL_ISSUER", "ZITADEL_CLIENT_ID"} {
		if os.Getenv(envVar) != "" {
			log.Info().Str("variable", envVar).
				Msg("Deprecated environment variable set — Zitadel has been replaced by Keycloak. This variable is no longer used.")
		}
	}

	// Initialize database connection pool
	ctx := context.Background()
	if err := storage.InitDB(ctx); err != nil {
		log.Fatal().Err(err).Msg("Failed to initialize database")
	}
	defer storage.CloseDB()

	// Run database migrations
	if err := storage.RunMigrations(ctx); err != nil {
		log.Fatal().Err(err).Msg("Failed to run migrations")
	}

	// In local mode, ensure the default tenant exists
	if config.IsLocalAuth() {
		if err := storage.EnsureDefaultTenantExists(ctx, storage.DB); err != nil {
			log.Fatal().Err(err).Msg("Failed to ensure default tenant exists")
		}
	}

	// Get Keycloak configuration from config package (or env vars for discovery URL)
	// KEYCLOAK_ISSUER should match the issuer claim in tokens (typically the browser-visible URL).
	// KEYCLOAK_DISCOVERY_URL (optional) is the base URL used by the server to fetch OIDC discovery/JWKS,
	// which may differ inside Docker networking.
	keycloakIssuer := config.KeycloakIssuer()
	if keycloakIssuer == "" {
		keycloakIssuer = "http://localhost:8080"
	}
	keycloakDiscoveryURL := os.Getenv("KEYCLOAK_DISCOVERY_URL")
	if keycloakDiscoveryURL == "" {
		keycloakDiscoveryURL = keycloakIssuer
	}
	keycloakClientID := config.KeycloakClientID()

	// Create mode-aware auth middleware
	// This selects the appropriate auth strategy based on AUTH_MODE and DISABLE_AUTH:
	// - DISABLE_AUTH=true: DevAuthMiddleware (bypasses all auth)
	// - AUTH_MODE=local: LocalAuthMiddleware (validates HS256 JWTs)
	// - AUTH_MODE=keycloak: Keycloak JWKS middleware (validates RS256 JWTs)
	authMiddleware, err := authmw.NewModeAwareAuthMiddleware(keycloakIssuer, keycloakDiscoveryURL, keycloakClientID)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to create auth middleware")
	}

	// Initialize BeeBrain service
	// Look for rules.yaml in the internal/beebrain directory relative to the executable
	// or use BEEBRAIN_RULES_PATH environment variable
	rulesPath := os.Getenv("BEEBRAIN_RULES_PATH")
	if rulesPath == "" {
		// Default path relative to project structure
		rulesPath = filepath.Join("internal", "beebrain", "rules.yaml")
	}
	beeBrainService, err := services.NewBeeBrainService(rulesPath)
	if err != nil {
		log.Warn().Err(err).Str("rules_path", rulesPath).Msg("BeeBrain service initialization failed - BeeBrain endpoints will be unavailable")
		beeBrainService = nil
	}
	beeBrainHandler := handlers.NewBeeBrainHandler(beeBrainService)

	// Initialize encryption service for BeeBrain API key storage
	// If BEEBRAIN_ENCRYPTION_KEY is not set, only 'rules' backend will be available
	encryptionService, err := services.NewEncryptionService()
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to initialize encryption service")
	}
	if encryptionService == nil {
		log.Info().Msg("Encryption service not configured - BeeBrain external backend unavailable")
	} else {
		log.Info().Msg("Encryption service configured")
	}

	// Initialize audit service for logging data modifications
	// Epic 13, Story 13.16
	auditService := services.NewAuditService(storage.DB)
	log.Info().Msg("Audit service initialized")

	// Make audit service available globally via package-level variable
	handlers.SetAuditService(auditService)

	r := chi.NewRouter()

	// Global middleware
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.RealIP)

	// Security headers middleware - adds X-Content-Type-Options, X-Frame-Options, X-XSS-Protection
	// Must be early in the chain to apply to all responses including errors
	r.Use(authmw.SecurityHeaders)

	// Request body size limits - default 1MB for JSON endpoints, with explicit
	// larger limits for known upload routes.
	r.Use(authmw.MaxBodySizeWithOverrides(authmw.DefaultMaxBodySize, []authmw.BodySizeOverride{
		{Method: http.MethodPost, Path: "/api/units/clips", MaxBytes: authmw.LargeMaxBodySize},
		{Method: http.MethodPost, Path: "/api/transcribe", MaxBytes: authmw.LargeMaxBodySize},
		{Method: http.MethodPost, Path: "/api/milestones/photos", MaxBytes: authmw.LargeMaxBodySize},
	}))

	// CORS configuration for dashboard
	// Default origins for local development, override with CORS_ALLOWED_ORIGINS env var
	corsOrigins := []string{"http://localhost:5173", "http://localhost:3000"}
	if envOrigins := os.Getenv("CORS_ALLOWED_ORIGINS"); envOrigins != "" {
		corsOrigins = strings.Split(envOrigins, ",")
		// Trim whitespace from each origin
		for i := range corsOrigins {
			corsOrigins[i] = strings.TrimSpace(corsOrigins[i])
		}
		log.Info().Strs("cors_origins", corsOrigins).Msg("CORS origins configured from environment")
	}

	corsHandler := cors.New(cors.Options{
		AllowedOrigins:   corsOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Requested-With", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	})
	r.Use(corsHandler.Handler)
	log.Info().Strs("origins", corsOrigins).Msg("CORS configured")

	// Initialize rate limiters for auth endpoints
	// Login: 5 attempts per email AND 20 attempts per IP per 15 minutes
	loginRateLimiters := handlers.NewLoginRateLimiters()
	// Setup: 3 attempts per IP per 15 minutes
	setupRateLimiter := handlers.NewSetupRateLimiter()
	// Invite accept: 5 attempts per IP per 15 minutes
	inviteAcceptRateLimiter := handlers.NewInviteAcceptRateLimiter()
	// Change password: 5 attempts per user_id per 15 minutes
	changePasswordRateLimiter := handlers.NewChangePasswordRateLimiter()

	// Public routes (no authentication required)
	// Health endpoint uses the new handler with dependency checks
	healthHandler := handlers.NewHealthHandler(storage.DB, keycloakDiscoveryURL)
	r.Group(func(r chi.Router) {
		// Health check endpoint - verifies database and OIDC provider connectivity
		r.Method(http.MethodGet, "/api/health", healthHandler)
		r.Method(http.MethodHead, "/api/health", healthHandler)

		// Auth configuration endpoint (needed for frontend to configure auth)
		// Returns mode-aware response (local mode with setup_required, or keycloak mode with authority/client_id)
		r.Get("/api/auth/config", handlers.GetAuthConfigFunc(storage.DB))

		// Setup endpoint (local mode only, first admin creation)
		// Only accessible when AUTH_MODE=local AND no users exist
		// Rate limited: 3 attempts per IP per 15 minutes
		r.Post("/api/auth/setup", handlers.Setup(storage.DB, setupRateLimiter))

		// Login endpoint (local mode only) - Epic 13, Story 13.8
		// Authenticates user with email and password, sets session cookie
		// Rate limited: 5 attempts per email AND 20 attempts per IP per 15 minutes
		r.Post("/api/auth/login", handlers.Login(storage.DB, loginRateLimiters))

		// Public invite endpoints - Epic 13, Story 13.10
		// These do not require authentication (used by invitees)
		r.Get("/api/invite/{token}", handlers.GetInviteInfo(storage.DB))
		// Rate limited: 5 attempts per IP per 15 minutes
		r.Post("/api/invite/{token}/accept", handlers.AcceptInvite(storage.DB, inviteAcceptRateLimiter))
	})

	// Protected routes (authentication required)
	r.Group(func(r chi.Router) {
		// Apply JWT authentication middleware
		r.Use(authMiddleware)

		// Apply tenant context middleware (sets app.tenant_id for RLS)
		// Also provisions user on first login
		r.Use(authmw.TenantMiddleware(storage.DB))

		// Apply audit context middleware (Epic 13, Story 13.16)
		// Extracts tenant_id, user_id, IP for audit logging
		r.Use(authmw.AuditContextMiddleware())

		// Apply CSRF protection for state-changing requests (POST/PUT/PATCH/DELETE)
		// Must be after auth middleware so CSRF cookies can be validated
		// Skip in dev mode (DISABLE_AUTH) since there's no login flow to set CSRF cookies
		if os.Getenv("DISABLE_AUTH") != "true" {
			r.Use(authmw.CSRFProtection)
		}

		// Logout endpoint - clears session cookie and revokes token
		// SECURITY FIX (S1-H1): Moved inside protected routes so token revocation
		// has access to the authenticated user context
		r.Post("/api/auth/logout", handlers.Logout())

		// Current user endpoint - returns authenticated user's info
		r.Get("/api/me", handlers.GetMe)

		// Auth me endpoint - returns current user info from session (Epic 13, Story 13.8)
		r.Get("/api/auth/me", handlers.Me())

		// Change password endpoint (local mode only) - Epic 13, Story 13.20
		// Rate limited: 5 attempts per user_id per 15 minutes
		r.Post("/api/auth/change-password", handlers.ChangePassword(storage.DB, changePasswordRateLimiter))

		// User management endpoints - Epic 13, Story 13.9 (Admin only)
		r.Route("/api/users", func(r chi.Router) {
			r.Use(handlers.AdminOnly)
			r.Get("/", handlers.ListUsers)
			r.Post("/", handlers.CreateUser)
			r.Get("/{id}", handlers.GetUser)
			r.Put("/{id}", handlers.UpdateUser)
			r.Delete("/{id}", handlers.DeleteUser)
			r.Post("/{id}/reset-password", handlers.ResetPassword)

			// Invite endpoints - Epic 13, Story 13.10
			r.Post("/invite", handlers.CreateInvite(storage.DB))
			r.Get("/invites", handlers.ListInvites)
			r.Delete("/invites/{id}", handlers.DeleteInvite)
		})

		// Sites endpoints - Epic 2, Story 2.1
		r.Get("/api/sites", handlers.ListSites)
		r.Post("/api/sites", handlers.CreateSite)
		r.Get("/api/sites/{id}", handlers.GetSite)
		r.Put("/api/sites/{id}", handlers.UpdateSite)
		r.Delete("/api/sites/{id}", handlers.DeleteSite)

		// Units endpoints - Epic 2, Story 2.2
		r.Get("/api/units", handlers.ListUnits)
		r.Post("/api/units", handlers.CreateUnit)
		r.Get("/api/units/{id}", handlers.GetUnit)
		r.Put("/api/units/{id}", handlers.UpdateUnit)
		r.Delete("/api/units/{id}", handlers.DeleteUnit)
		r.Post("/api/units/{id}/regenerate-key", handlers.RegenerateUnitKey)

		// WebSocket stream endpoint - Epic 2, Story 2.5
		// Proxies MJPEG video from unit to dashboard via WebSocket
		r.Get("/ws/stream/{id}", handlers.Stream)

		// Detection endpoints - Epic 3, Story 3.1
		r.Get("/api/detections", handlers.ListDetections)
		r.Get("/api/detections/stats", handlers.GetDetectionStats)
		r.Get("/api/detections/temperature-correlation", handlers.GetTemperatureCorrelation)
		r.Get("/api/detections/trend", handlers.GetTrendData)
		r.Get("/api/detections/{id}", handlers.GetDetectionByID)

		// Weather endpoint - Epic 3, Story 3.3
		r.Get("/api/sites/{id}/weather", handlers.GetSiteWeather)

		// Nest estimate endpoint - Epic 4, Story 4.5
		r.Get("/api/sites/{id}/nest-estimate", handlers.GetNestEstimate)

		// Hives endpoints - Epic 5, Story 5.1
		r.Get("/api/hives", handlers.ListHives)
		r.Get("/api/hives/{id}", handlers.GetHive)
		r.Put("/api/hives/{id}", handlers.UpdateHive)
		r.Delete("/api/hives/{id}", handlers.DeleteHive)
		r.Post("/api/hives/{id}/replace-queen", handlers.ReplaceQueen)
		r.Get("/api/sites/{site_id}/hives", handlers.ListHivesBySite)
		r.Post("/api/sites/{site_id}/hives", handlers.CreateHive)

		// Hive Loss endpoints - Epic 9, Story 9.3
		r.Post("/api/hives/{id}/loss", handlers.CreateHiveLoss)
		r.Get("/api/hives/{id}/loss", handlers.GetHiveLoss)
		r.Get("/api/hive-losses", handlers.ListHiveLosses)
		r.Get("/api/hive-losses/stats", handlers.GetHiveLossStats)

		// Tasks endpoints - Epic 14, Story 14.2
		// Note: /api/tasks/overdue and /api/tasks/stats must be registered BEFORE /api/tasks/{id}
		// to avoid "overdue" or "stats" being matched as an ID
		r.Get("/api/tasks", handlers.ListTasks)
		r.Post("/api/tasks", handlers.CreateTask)
		r.Get("/api/tasks/stats", handlers.GetTaskStats) // Epic 14, Story 14.14
		r.Get("/api/tasks/overdue", handlers.ListOverdueTasks)
		r.Get("/api/tasks/{id}", handlers.GetTask)
		r.Patch("/api/tasks/{id}", handlers.UpdateTask)
		r.Delete("/api/tasks/{id}", handlers.DeleteTask)
		r.Post("/api/tasks/{id}/complete", handlers.CompleteTask)
		r.Get("/api/hives/{id}/tasks", handlers.ListTasksByHive)

		// Task Suggestions endpoints - Epic 14, Story 14.15
		r.Get("/api/hives/{id}/suggestions", handlers.ListHiveSuggestions)
		r.Post("/api/hives/{id}/suggestions/{suggestion_id}/accept", handlers.AcceptSuggestion)
		r.Delete("/api/hives/{id}/suggestions/{suggestion_id}", handlers.DismissSuggestion)

		// Hive Activity Log endpoint - Epic 14, Story 14.13
		r.Get("/api/hives/{id}/activity", handlers.ListHiveActivity)

		// Task Templates endpoints - Epic 14, Story 14.3
		r.Get("/api/task-templates", handlers.ListTaskTemplates)
		r.Post("/api/task-templates", handlers.CreateTaskTemplate)
		r.Delete("/api/task-templates/{id}", handlers.DeleteTaskTemplate)

		// Inspections endpoints - Epic 5, Stories 5.3, 5.4, 5.5
		r.Get("/api/hives/{hive_id}/inspections", handlers.ListInspectionsByHive)
		r.Get("/api/hives/{hive_id}/inspections/export", handlers.ExportInspections)
		r.Get("/api/hives/{hive_id}/frame-history", handlers.GetFrameHistory)
		r.Post("/api/hives/{hive_id}/inspections", handlers.CreateInspection)
		r.Get("/api/inspections/{id}", handlers.GetInspection)
		r.Put("/api/inspections/{id}", handlers.UpdateInspection)
		r.Delete("/api/inspections/{id}", handlers.DeleteInspection)

		// Treatments endpoints - Epic 6, Story 6.1
		r.Post("/api/treatments", handlers.CreateTreatment)
		r.Get("/api/hives/{hive_id}/treatments", handlers.ListTreatmentsByHive)
		r.Get("/api/treatments/{id}", handlers.GetTreatment)
		r.Put("/api/treatments/{id}", handlers.UpdateTreatment)
		r.Delete("/api/treatments/{id}", handlers.DeleteTreatment)

		// Feedings endpoints - Epic 6, Story 6.2
		r.Post("/api/feedings", handlers.CreateFeeding)
		r.Get("/api/hives/{hive_id}/feedings", handlers.ListFeedingsByHive)
		r.Get("/api/hives/{hive_id}/feedings/season-totals", handlers.GetFeedingSeasonTotals)
		r.Get("/api/feedings/{id}", handlers.GetFeeding)
		r.Put("/api/feedings/{id}", handlers.UpdateFeeding)
		r.Delete("/api/feedings/{id}", handlers.DeleteFeeding)

		// Harvests endpoints - Epic 6, Story 6.3
		r.Post("/api/harvests", handlers.CreateHarvest)
		r.Get("/api/hives/{hive_id}/harvests", handlers.ListHarvestsByHive)
		r.Get("/api/sites/{site_id}/harvests", handlers.ListHarvestsBySite)
		r.Get("/api/harvests/analytics", handlers.GetHarvestAnalytics)
		r.Get("/api/harvests/{id}", handlers.GetHarvest)
		r.Put("/api/harvests/{id}", handlers.UpdateHarvest)
		r.Delete("/api/harvests/{id}", handlers.DeleteHarvest)

		// Equipment endpoints - Epic 6, Story 6.4
		r.Post("/api/hives/{hive_id}/equipment", handlers.CreateEquipmentLog)
		r.Get("/api/hives/{hive_id}/equipment", handlers.ListEquipmentByHive)
		r.Get("/api/hives/{hive_id}/equipment/current", handlers.GetCurrentlyInstalled)
		r.Get("/api/hives/{hive_id}/equipment/history", handlers.GetEquipmentHistory)
		r.Get("/api/equipment/{id}", handlers.GetEquipmentLog)
		r.Put("/api/equipment/{id}", handlers.UpdateEquipmentLog)
		r.Delete("/api/equipment/{id}", handlers.DeleteEquipmentLog)

		// Custom Labels endpoints - Epic 6, Story 6.5
		r.Get("/api/labels", handlers.ListLabels)
		r.Post("/api/labels", handlers.CreateLabel)
		r.Get("/api/labels/{id}", handlers.GetLabel)
		r.Put("/api/labels/{id}", handlers.UpdateLabel)
		r.Delete("/api/labels/{id}", handlers.DeleteLabel)
		r.Get("/api/labels/{id}/usage", handlers.GetLabelUsage)

		// Calendar endpoints - Epic 6, Story 6.6
		r.Get("/api/calendar", handlers.GetCalendar)
		r.Post("/api/calendar/snooze-treatment", handlers.SnoozeTreatmentDue)
		r.Post("/api/calendar/skip-treatment", handlers.SkipTreatmentDue)

		// Reminders endpoints - Epic 6, Story 6.6
		r.Get("/api/reminders", handlers.ListReminders)
		r.Post("/api/reminders", handlers.CreateReminder)
		r.Get("/api/reminders/{id}", handlers.GetReminder)
		r.Put("/api/reminders/{id}", handlers.UpdateReminder)
		r.Delete("/api/reminders/{id}", handlers.DeleteReminder)
		r.Post("/api/reminders/{id}/snooze", handlers.SnoozeReminder)
		r.Post("/api/reminders/{id}/complete", handlers.CompleteReminder)

		// Treatment Intervals settings - Epic 6, Story 6.6
		r.Get("/api/settings/treatment-intervals", handlers.GetTreatmentIntervals)
		r.Put("/api/settings/treatment-intervals", handlers.UpdateTreatmentIntervals)

		// BeeBrain Settings endpoints - Epic 13, Story 13.18 (BYOK)
		// Tenant-facing endpoints for configuring BeeBrain (system/custom/rules_only)
		r.Get("/api/settings/beebrain", handlers.GetTenantBeeBrainSettings(storage.DB))
		r.Put("/api/settings/beebrain", handlers.UpdateTenantBeeBrainSettings(storage.DB, encryptionService))

		// Tenant Settings endpoints - Epic 13, Story 13.19
		// Returns tenant info with usage stats and limits
		r.Get("/api/settings/tenant", handlers.GetTenantSettings(storage.DB))
		r.Put("/api/settings/profile", handlers.UpdateUserProfile(storage.DB))

		// Clips endpoints - Epic 4, Stories 4.2-4.4
		r.Get("/api/clips", handlers.ListClips)
		r.Get("/api/clips/{id}/thumbnail", handlers.GetClipThumbnail)
		r.Get("/api/clips/{id}/video", handlers.GetClipVideo)
		r.Delete("/api/clips/{id}", handlers.DeleteClip)

		// BeeBrain endpoints - Epic 8, Story 8.1
		if beeBrainService != nil {
			r.Get("/api/beebrain/dashboard", beeBrainHandler.GetDashboard)
			r.Get("/api/beebrain/hive/{id}", beeBrainHandler.GetHiveAnalysis)
			r.Get("/api/beebrain/maintenance", beeBrainHandler.GetMaintenance)
			r.Post("/api/beebrain/refresh", beeBrainHandler.RefreshAnalysis)
			r.Post("/api/beebrain/insights/{id}/dismiss", beeBrainHandler.DismissInsight)
			r.Post("/api/beebrain/insights/{id}/snooze", beeBrainHandler.SnoozeInsight)
		}

		// Export endpoints - Epic 9, Story 9.1
		// Export preset endpoints (no rate limit)
		r.Get("/api/export/presets", handlers.ListExportPresets)
		r.Post("/api/export/presets", handlers.CreateExportPreset)
		r.Delete("/api/export/presets/{id}", handlers.DeleteExportPreset)

		// Milestones endpoints - Epic 9, Story 9.2
		r.Post("/api/milestones/photos", handlers.UploadMilestonePhoto)
		r.Get("/api/milestones/photos", handlers.ListMilestonePhotos)
		r.Delete("/api/milestones/photos/{id}", handlers.DeleteMilestonePhoto)
		r.Get("/api/milestones/flags", handlers.GetMilestoneFlags)
		r.Post("/api/milestones/flags/{flag}", handlers.SetMilestoneFlag)

		// Season Recap endpoints - Epic 9, Story 9.4
		r.Get("/api/recap", handlers.GetRecap)
		r.Get("/api/recap/seasons", handlers.GetAvailableSeasons)
		r.Post("/api/recap/regenerate", handlers.RegenerateRecap)
		r.Get("/api/recap/text", handlers.GetRecapText)
		r.Get("/api/recap/is-time", handlers.IsRecapTime)

		// Overwintering endpoints - Epic 9, Story 9.5
		r.Get("/api/overwintering/prompt", handlers.GetOverwinteringPrompt)
		r.Get("/api/overwintering/hives", handlers.GetOverwinteringHives)
		r.Post("/api/overwintering", handlers.CreateOverwinteringRecord)
		r.Get("/api/overwintering/report", handlers.GetWinterReport)
		r.Get("/api/overwintering/trends", handlers.GetSurvivalTrends)
		r.Get("/api/overwintering/seasons", handlers.GetOverwinteringSeasons)

		// Data export endpoint with rate limiting (10 requests per minute per tenant)
		r.Group(func(r chi.Router) {
			exportLimiter := authmw.NewRateLimiter(10, time.Minute)
			r.Use(authmw.RateLimitMiddleware(exportLimiter))
			r.Post("/api/export", handlers.GenerateExport)
		})

		// Voice transcription endpoint with rate limiting (10 requests per minute per tenant)
		// Epic 7, Story 7.5: Voice Input for Notes
		r.Group(func(r chi.Router) {
			transcribeLimiter := authmw.NewRateLimiter(10, time.Minute)
			r.Use(authmw.RateLimitMiddleware(transcribeLimiter))
			r.Post("/api/transcribe", handlers.Transcribe)
		})

		// Audit log endpoints - Epic 13, Story 13.16
		// Admin role required (checked in handlers), tenant-scoped via RLS
		r.Get("/api/audit", handlers.ListAuditLog(storage.DB))
		r.Get("/api/audit/entity/{type}/{id}", handlers.GetEntityHistory(storage.DB))

		// Activity feed endpoint - Epic 13, Story 13.17
		// Available to all authenticated users (no admin role required)
		r.Get("/api/activity", handlers.ListActivity(storage.DB))
	})

	// Super-admin routes (SaaS mode only, SUPER_ADMIN_EMAILS env var)
	// Epic 13, Story 13.12: Super-Admin Tenant List & Management
	// These routes require:
	// 1. JWT authentication (same as protected routes)
	// 2. SaaS mode (AUTH_MODE=keycloak)
	// 3. User email in SUPER_ADMIN_EMAILS
	// Note: No TenantMiddleware here - admin routes bypass RLS to see all tenants
	r.Route("/api/admin", func(r chi.Router) {
		r.Use(authMiddleware)
		r.Use(authmw.SuperAdminOnly)

		// Tenant management endpoints
		r.Get("/tenants", handlers.AdminListTenants(storage.DB))
		r.Post("/tenants", handlers.AdminCreateTenant(storage.DB))
		r.Get("/tenants/{id}", handlers.AdminGetTenant(storage.DB))
		r.Put("/tenants/{id}", handlers.AdminUpdateTenant(storage.DB))
		r.Delete("/tenants/{id}", handlers.AdminDeleteTenant(storage.DB))

		// Tenant limits endpoints - Epic 13, Story 13.13
		r.Get("/tenants/{id}/limits", handlers.AdminGetTenantLimits(storage.DB))
		r.Put("/tenants/{id}/limits", handlers.AdminUpdateTenantLimits(storage.DB))

		// Tenant impersonation logs - Epic 13, Story 13.14
		r.Get("/tenants/{id}/impersonation-logs", handlers.AdminListImpersonationLogs(storage.DB))

		// Impersonation endpoints - Epic 13, Story 13.14
		r.Post("/impersonate/{tenant_id}", handlers.AdminStartImpersonation(storage.DB))
		r.Post("/impersonate/stop", handlers.AdminStopImpersonation(storage.DB))
		r.Get("/impersonate/status", handlers.AdminImpersonationStatus(storage.DB))

		// BeeBrain configuration endpoints - Epic 13, Story 13.15
		r.Get("/beebrain", handlers.AdminGetBeeBrainConfig(storage.DB))
		r.Put("/beebrain", handlers.AdminUpdateBeeBrainConfig(storage.DB, encryptionService))
		r.Put("/tenants/{id}/beebrain", handlers.AdminSetTenantBeeBrainAccess(storage.DB))

		// Clip purge endpoint - Epic 4, Story 4.4 AC3
		// Permanently removes soft-deleted clips older than 30 days
		r.Post("/clips/purge", handlers.PurgeOldClips)
	})

	// Unit-authenticated routes (X-API-Key header for device-to-server communication)
	// These routes use UnitAuth middleware instead of JWT, for APIS hardware units.
	r.Group(func(r chi.Router) {
		// Apply unit authentication middleware (validates X-API-Key header)
		r.Use(authmw.UnitAuth(storage.DB))

		// Heartbeat endpoint - Epic 2, Story 2.3
		// Units send heartbeats to update last_seen, ip_address, status, and optional telemetry
		r.Post("/api/units/heartbeat", handlers.Heartbeat)

		// Detection endpoint - Epic 3, Story 3.1
		// Units report hornet detection events
		r.Post("/api/units/detections", handlers.CreateDetection)

		// Clip upload endpoint - Epic 4, Story 4.1
		// Units upload detection clips for archive
		r.Post("/api/units/clips", handlers.UploadClip)
	})

	portStr := os.Getenv("PORT")
	if portStr == "" {
		portStr = "3000"
	}
	port, err := strconv.Atoi(portStr)
	if err != nil {
		log.Fatal().Err(err).Str("PORT", portStr).Msg("Invalid PORT value")
	}

	// Create server with timeouts
	// WriteTimeout is set to 120s to accommodate video streaming (up to 10MB on slow connections)
	// For a 10MB file at 1 Mbps, streaming takes ~80 seconds
	//
	// Note on WebSocket streaming (Story 2.5): The gorilla/websocket library manages
	// its own write deadlines per-message via ws.SetWriteDeadline(). The server's
	// WriteTimeout applies to the initial HTTP upgrade handshake. Long-running
	// WebSocket connections are not affected by this timeout after the upgrade.
	// If issues occur with long streams, consider using ws.SetWriteDeadline(time.Time{})
	// to disable per-message timeouts in the Stream handler.
	srv := &http.Server{
		Addr:         fmt.Sprintf(":%d", port),
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 120 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server in goroutine
	go func() {
		log.Info().
			Str("event", "server_started").
			Str("version", config.Version).
			Int("port", port).
			Str("keycloak_issuer", keycloakIssuer).
			Bool("keycloak_client_id_set", keycloakClientID != "").
			Msg("Server listening")

		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal().Err(err).Msg("Server failed to start")
		}
	}()

	// Wait for interrupt signal for graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info().Msg("Server shutting down...")

	// Stop rate limiters to cleanup background goroutines
	log.Debug().Msg("Stopping rate limiters")
	loginRateLimiters.Stop()
	setupRateLimiter.Stop()
	inviteAcceptRateLimiter.Stop()
	changePasswordRateLimiter.Stop()
	log.Debug().Msg("Rate limiters stopped")

	// Give outstanding requests 30 seconds to complete
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatal().Err(err).Msg("Server forced to shutdown")
	}

	log.Info().Msg("Server exited gracefully")
}
