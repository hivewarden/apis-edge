// Package handlers provides HTTP request handlers for the APIS server.
package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/mail"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jermoo/apis/apis-server/internal/auth"
	"github.com/jermoo/apis/apis-server/internal/config"
	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/ratelimit"
	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/rs/zerolog/log"
)

// SetupRateLimiter holds the rate limiter for the setup endpoint.
type SetupRateLimiter struct {
	Limiter ratelimit.Limiter
}

// NewSetupRateLimiter creates a rate limiter for the setup endpoint.
// Limits: 3 attempts per IP per 15 minutes.
// Backend is selected via RATE_LIMIT_BACKEND env var (memory or redis).
func NewSetupRateLimiter() *SetupRateLimiter {
	config := ratelimit.Config{
		MaxRequests:  3,
		WindowPeriod: 15 * time.Minute,
	}
	return &SetupRateLimiter{
		Limiter: ratelimit.NewLimiter(config, "setup"),
	}
}

// Stop stops the rate limiter's background cleanup goroutine.
func (sr *SetupRateLimiter) Stop() {
	sr.Limiter.Stop()
}

// SetupRequest represents the request body for the initial setup endpoint.
type SetupRequest struct {
	// DisplayName is the user's display name (required)
	DisplayName string `json:"display_name"`
	// Email is the user's email address (required, must be valid format)
	Email string `json:"email"`
	// Password is the user's password (required, minimum 8 characters)
	Password string `json:"password"`
}

// SetupResponse represents the response from the setup endpoint.
type SetupResponse struct {
	User SetupUserResponse `json:"user"`
}

// SetupUserResponse represents user data in the setup response.
type SetupUserResponse struct {
	ID       string `json:"id"`
	Email    string `json:"email"`
	Name     string `json:"name"`
	Role     string `json:"role"`
	TenantID string `json:"tenant_id"`
}

// SessionCookieName is the name of the session cookie.
const SessionCookieName = "apis_session"

// Setup handles POST /api/auth/setup - creates the first admin user.
// This endpoint is only available when:
// - AUTH_MODE=local
// - No users exist in the default tenant
//
// Rate limiting: 3 attempts per IP per 15 minutes.
//
// It creates the first admin user, generates a JWT, and sets a session cookie.
//
// Request body:
//
//	{
//	  "display_name": "Admin User",
//	  "email": "admin@example.com",
//	  "password": "securepassword123"
//	}
//
// Response (201 Created):
//
//	{
//	  "user": {
//	    "id": "uuid",
//	    "email": "admin@example.com",
//	    "name": "Admin User",
//	    "role": "admin",
//	    "tenant_id": "00000000-0000-0000-0000-000000000000"
//	  }
//	}
//
// Rate limit headers are included in all responses:
// - X-RateLimit-Limit: Maximum requests allowed
// - X-RateLimit-Remaining: Requests remaining in window
// - X-RateLimit-Reset: Unix timestamp when window resets
//
// Errors:
// - 400: Invalid request body or validation errors
// - 403: Not in local auth mode
// - 404: Setup not available (users already exist)
// - 429: Rate limit exceeded
// - 500: Internal server error
func Setup(pool *pgxpool.Pool, rateLimiter *SetupRateLimiter) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		// Check if we're in local auth mode
		if !config.IsLocalAuth() {
			log.Debug().Msg("handler: setup attempted in non-local auth mode")
			respondError(w, "Setup is only available in local authentication mode", http.StatusForbidden)
			return
		}

		// Check rate limit BEFORE processing request
		clientIP := ratelimit.ExtractIP(r)
		result := ratelimit.CheckWithConfig(rateLimiter.Limiter, clientIP, rateLimiter.Limiter.GetConfig())

		// Always add rate limit headers
		ratelimit.AddRateLimitHeaders(w, result.Info)

		if !result.Allowed {
			log.Warn().
				Str("ip", clientIP).
				Int("retry_after", result.Info.RetryAfterSeconds()).
				Msg("Setup rate limit exceeded")
			ratelimit.RespondRateLimited(w, result.Info, "Too many setup attempts. Please try again later.")
			return
		}

		// Parse and validate request body FIRST (before any DB operations)
		// This allows validation errors to be returned even without a database connection
		var req SetupRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			respondError(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		// Validate required fields
		if strings.TrimSpace(req.DisplayName) == "" {
			respondError(w, "Display name is required", http.StatusBadRequest)
			return
		}
		req.DisplayName = strings.TrimSpace(req.DisplayName)

		// Validate display name length (max 100 characters)
		if len(req.DisplayName) > 100 {
			respondError(w, "Display name must be 100 characters or less", http.StatusBadRequest)
			return
		}

		if strings.TrimSpace(req.Email) == "" {
			respondError(w, "Email is required", http.StatusBadRequest)
			return
		}
		req.Email = strings.TrimSpace(strings.ToLower(req.Email))

		// Validate email format
		if _, err := mail.ParseAddress(req.Email); err != nil {
			respondError(w, "Invalid email format", http.StatusBadRequest)
			return
		}

		// Validate password strength (length + common password check)
		if err := auth.ValidatePasswordStrength(req.Password); err != nil {
			respondError(w, err.Error(), http.StatusBadRequest)
			return
		}

		// Nil pool check to provide graceful error in tests and misconfigured environments
		if pool == nil {
			log.Error().Msg("handler: database pool is nil")
			respondError(w, "Database not configured", http.StatusInternalServerError)
			return
		}

		// Hash the password before the transaction
		passwordHash, err := auth.HashPassword(req.Password)
		if err != nil {
			log.Error().Err(err).Msg("handler: failed to hash password for setup")
			respondError(w, "Failed to process password", http.StatusInternalServerError)
			return
		}

		// Ensure default tenant exists
		defaultTenantID := config.DefaultTenantUUID()
		if err := storage.EnsureDefaultTenantExists(ctx, pool); err != nil {
			log.Error().Err(err).Msg("handler: failed to ensure default tenant exists")
			respondError(w, "Failed to initialize tenant", http.StatusInternalServerError)
			return
		}

		// Create the admin user atomically (prevents race condition with concurrent setup requests)
		// Uses SELECT FOR UPDATE on tenant row to serialize setup attempts
		user, err := storage.CreateFirstAdminAtomic(ctx, pool, &storage.CreateLocalUserInput{
			TenantID:     defaultTenantID,
			Email:        req.Email,
			DisplayName:  req.DisplayName,
			PasswordHash: passwordHash,
			Role:         "admin",
		})
		if err != nil {
			if errors.Is(err, storage.ErrSetupAlreadyComplete) {
				log.Debug().Msg("handler: setup attempted but users already exist")
				respondError(w, "Setup is not available - an admin account already exists", http.StatusNotFound)
				return
			}
			log.Error().Err(err).Msg("handler: failed to create admin user")
			respondError(w, "Failed to create admin account", http.StatusInternalServerError)
			return
		}

		// Get JWT secret
		jwtSecret := config.JWTSecret()
		if jwtSecret == "" {
			log.Error().Msg("handler: JWT secret not configured")
			respondError(w, "Server configuration error", http.StatusInternalServerError)
			return
		}

		// Create JWT token
		token, err := auth.CreateLocalJWT(user.ID, defaultTenantID, user.Email, user.Name, "admin", jwtSecret, false)
		if err != nil {
			log.Error().Err(err).Msg("handler: failed to create JWT for setup")
			respondError(w, "Failed to create session", http.StatusInternalServerError)
			return
		}

		// Set session cookie
		setSessionCookie(w, r, token, false)

		// SECURITY FIX (CSRF-001-1): Set CSRF token cookie for state-changing request protection
		if err := middleware.SetCSRFCookie(w, r); err != nil {
			log.Warn().Err(err).Msg("handler: failed to set CSRF cookie on setup")
			// Non-fatal: continue with setup success
		}

		log.Info().
			Str("user_id", user.ID).
			Str("email", user.Email).
			Str("tenant_id", defaultTenantID).
			Msg("Initial admin account created via setup wizard")

		// Return success response
		respondJSON(w, SetupResponse{
			User: SetupUserResponse{
				ID:       user.ID,
				Email:    user.Email,
				Name:     user.Name,
				Role:     "admin",
				TenantID: defaultTenantID,
			},
		}, http.StatusCreated)
	}
}

// setSessionCookie sets the JWT session cookie with appropriate security settings.
func setSessionCookie(w http.ResponseWriter, r *http.Request, token string, rememberMe bool) {
	// Determine if we should set Secure flag
	// In production (HTTPS), always set Secure
	// In development (HTTP), don't set Secure or cookie won't be sent
	secure := r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https"

	// Check for explicit override (useful for local dev behind reverse proxy)
	if os.Getenv("SECURE_COOKIES") == "true" {
		secure = true
	} else if os.Getenv("SECURE_COOKIES") == "false" {
		secure = false
	}

	// Set cookie expiration
	maxAge := int(auth.DefaultTokenExpiry.Seconds())
	if rememberMe {
		maxAge = int(auth.RememberMeTokenExpiry.Seconds())
	}

	cookie := &http.Cookie{
		Name:     SessionCookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   maxAge,
		Expires:  time.Now().Add(time.Duration(maxAge) * time.Second),
	}

	http.SetCookie(w, cookie)
}
