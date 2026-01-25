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

	// Get Zitadel configuration from environment
	zitadelIssuer := os.Getenv("ZITADEL_ISSUER")
	if zitadelIssuer == "" {
		zitadelIssuer = "http://localhost:8080"
		log.Warn().Msg("ZITADEL_ISSUER not set, using default: http://localhost:8080")
	}

	zitadelClientID := os.Getenv("ZITADEL_CLIENT_ID")

	// Create auth middleware with proper error handling (validates config at startup)
	authMiddleware, err := authmw.NewAuthMiddleware(zitadelIssuer, zitadelClientID)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to create auth middleware - check ZITADEL_ISSUER and ZITADEL_CLIENT_ID")
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

	r := chi.NewRouter()

	// Global middleware
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.RealIP)

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
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Requested-With"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	})
	r.Use(corsHandler.Handler)

	// Public routes (no authentication required)
	// Health endpoint uses the new handler with dependency checks
	healthHandler := handlers.NewHealthHandler(storage.DB, zitadelIssuer)
	r.Group(func(r chi.Router) {
		// Health check endpoint - verifies database and Zitadel connectivity
		r.Method(http.MethodGet, "/api/health", healthHandler)

		// Auth configuration endpoint (needed for frontend to configure OIDC)
		r.Get("/api/auth/config", handlers.GetAuthConfig)
	})

	// Protected routes (authentication required)
	r.Group(func(r chi.Router) {
		// Apply JWT authentication middleware
		r.Use(authMiddleware)

		// Apply tenant context middleware (sets app.tenant_id for RLS)
		// Also provisions user on first login
		r.Use(authmw.TenantMiddleware(storage.DB))

		// Current user endpoint - returns authenticated user's info
		r.Get("/api/me", handlers.GetMe)

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
			Str("zitadel_issuer", zitadelIssuer).
			Bool("zitadel_client_id_set", zitadelClientID != "").
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

	// Give outstanding requests 30 seconds to complete
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatal().Err(err).Msg("Server forced to shutdown")
	}

	log.Info().Msg("Server exited gracefully")
}
