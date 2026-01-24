package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
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
	})

	// Unit-authenticated routes (X-API-Key header for device-to-server communication)
	// These routes use UnitAuth middleware instead of JWT, for APIS hardware units.
	r.Group(func(r chi.Router) {
		// Apply unit authentication middleware (validates X-API-Key header)
		r.Use(authmw.UnitAuth(storage.DB))

		// Heartbeat endpoint - Epic 2, Story 2.3
		// Units send heartbeats to update last_seen, ip_address, status, and optional telemetry
		r.Post("/api/units/heartbeat", handlers.Heartbeat)
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
	srv := &http.Server{
		Addr:         fmt.Sprintf(":%d", port),
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
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
