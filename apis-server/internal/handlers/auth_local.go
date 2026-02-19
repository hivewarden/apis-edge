// Package handlers provides HTTP request handlers for the APIS server.
package handlers

import (
	"encoding/json"
	"net/http"
	"net/mail"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"

	"github.com/jermoo/apis/apis-server/internal/auth"
	"github.com/jermoo/apis/apis-server/internal/config"
	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/ratelimit"
	"github.com/jermoo/apis/apis-server/internal/storage"
)

// LoginRateLimiters holds the rate limiters for login endpoints.
// Login uses compound rate limiting: both per-email and per-IP limits must be satisfied.
// Additionally, account lockout is applied after N failed login attempts per email.
type LoginRateLimiters struct {
	// EmailLimiter limits login attempts per email address (5/email/15min)
	EmailLimiter ratelimit.Limiter

	// IPLimiter limits login attempts per IP address (20/IP/15min)
	IPLimiter ratelimit.Limiter

	// AccountLockout tracks failed login attempts and locks accounts temporarily
	// after exceeding the failure threshold (5 failures -> 15 min lockout)
	AccountLockout *ratelimit.AccountLockout
}

// NewLoginRateLimiters creates rate limiters for login endpoint.
// Uses compound rate limiting: 5 attempts per email AND 20 attempts per IP per 15 minutes.
// Additionally implements account lockout after 5 failed login attempts.
// Backend is selected via RATE_LIMIT_BACKEND env var (memory or redis).
func NewLoginRateLimiters() *LoginRateLimiters {
	maxEmail, maxIP, maxFailures := 5, 20, 5
	// Relax rate limits in development mode to support automated testing
	if os.Getenv("GO_ENV") == "development" {
		maxEmail, maxIP, maxFailures = 1000, 5000, 1000
	}

	emailConfig := ratelimit.Config{
		MaxRequests:  maxEmail,
		WindowPeriod: 15 * time.Minute,
	}
	ipConfig := ratelimit.Config{
		MaxRequests:  maxIP,
		WindowPeriod: 15 * time.Minute,
	}

	// Account lockout configuration
	lockoutConfig := ratelimit.LockoutConfig{
		MaxFailures:     maxFailures,
		LockoutDuration: 15 * time.Minute,
		FailureWindow:   15 * time.Minute,
	}

	return &LoginRateLimiters{
		EmailLimiter:   ratelimit.NewLimiter(emailConfig, "login:email"),
		IPLimiter:      ratelimit.NewLimiter(ipConfig, "login:ip"),
		AccountLockout: ratelimit.NewAccountLockout(lockoutConfig, "login:lockout"),
	}
}

// Stop stops all rate limiters' background cleanup goroutines.
func (lr *LoginRateLimiters) Stop() {
	lr.EmailLimiter.Stop()
	lr.IPLimiter.Stop()
	if lr.AccountLockout != nil {
		lr.AccountLockout.Stop()
	}
}

// LoginRequest represents the request body for POST /api/auth/login.
type LoginRequest struct {
	// Email is the user's email address (required)
	Email string `json:"email"`
	// Password is the user's password (required)
	Password string `json:"password"`
	// RememberMe extends the session duration to 30 days if true (default: 7 days)
	RememberMe bool `json:"remember_me"`
}

// LoginResponse represents the response from POST /api/auth/login.
type LoginResponse struct {
	User LoginUserResponse `json:"user"`
}

// LoginUserResponse represents user data in the login response.
type LoginUserResponse struct {
	ID       string `json:"id"`
	Email    string `json:"email"`
	Name     string `json:"name"`
	Role     string `json:"role"`
	TenantID string `json:"tenant_id"`
}

// AuthMeResponse represents the response from GET /api/auth/me.
type AuthMeResponse struct {
	User AuthMeUserResponse `json:"user"`
}

// AuthMeUserResponse represents the current user's data.
type AuthMeUserResponse struct {
	ID       string `json:"id"`
	Email    string `json:"email"`
	Name     string `json:"name"`
	Role     string `json:"role"`
	TenantID string `json:"tenant_id"`
}

// Login handles POST /api/auth/login - authenticates a user with email and password.
// This endpoint is only available in local authentication mode (AUTH_MODE=local).
//
// Rate limiting: 5 attempts per email AND 20 attempts per IP per 15 minutes.
// Both limits must be satisfied; if either is exceeded, the request is denied.
//
// Request body:
//
//	{
//	  "email": "user@example.com",
//	  "password": "userpassword",
//	  "remember_me": false
//	}
//
// Response (200 OK):
//
//	{
//	  "user": {
//	    "id": "uuid",
//	    "email": "user@example.com",
//	    "name": "User Name",
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
// The response also sets an `apis_session` cookie with a JWT token.
//
// Errors:
// - 400: Invalid request body or missing required fields
// - 401: Invalid credentials
// - 403: Not in local auth mode
// - 429: Rate limit exceeded (too many failed attempts)
// - 500: Internal server error
func Login(pool *pgxpool.Pool, rateLimiters *LoginRateLimiters) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		// Check if we're in local auth mode
		if !config.IsLocalAuth() {
			log.Debug().Msg("handler: login attempted in non-local auth mode")
			respondError(w, "Login is only available in local authentication mode", http.StatusForbidden)
			return
		}

		// Parse request body
		var req LoginRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			respondError(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		// Validate required fields
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

		if req.Password == "" {
			respondError(w, "Password is required", http.StatusBadRequest)
			return
		}

		// Extract client IP for IP-based rate limiting
		clientIP := ratelimit.ExtractIP(r)

		// SECURITY FIX (API-001-1): Check account lockout FIRST before rate limiting
		// This prevents brute force attacks by locking accounts after N failed attempts
		if rateLimiters.AccountLockout != nil {
			lockoutResult := rateLimiters.AccountLockout.Check(req.Email)
			if lockoutResult.Locked {
				log.Warn().
					Str("email", req.Email).
					Str("ip", clientIP).
					Int("seconds_until_unlock", lockoutResult.SecondsUntilUnlock()).
					Msg("Login attempt on locked account")
				w.Header().Set("Retry-After", strconv.Itoa(lockoutResult.SecondsUntilUnlock()))
				respondError(w, "Account temporarily locked due to too many failed attempts. Please try again later.", http.StatusTooManyRequests)
				return
			}
		}

		// Check compound rate limits BEFORE attempting authentication
		// Both email and IP limits must be satisfied
		checks := []ratelimit.LimiterWithKey{
			{Limiter: rateLimiters.EmailLimiter, Key: req.Email, Config: rateLimiters.EmailLimiter.GetConfig()},
			{Limiter: rateLimiters.IPLimiter, Key: clientIP, Config: rateLimiters.IPLimiter.GetConfig()},
		}
		result := ratelimit.CompoundCheck(checks)

		// Always add rate limit headers (even on success)
		ratelimit.AddRateLimitHeaders(w, result.Info)

		if !result.Allowed {
			log.Warn().
				Str("email", req.Email).
				Str("ip", clientIP).
				Int("retry_after", result.Info.RetryAfterSeconds()).
				Msg("Login rate limit exceeded")
			ratelimit.RespondRateLimited(w, result.Info, "Too many login attempts. Please try again later.")
			return
		}

		// Nil pool check
		if pool == nil {
			log.Error().Msg("handler: database pool is nil")
			respondError(w, "Database not configured", http.StatusInternalServerError)
			return
		}

		// Get tenant ID for local mode
		tenantID := config.DefaultTenantUUID()

		// Acquire a connection from the pool
		conn, err := pool.Acquire(ctx)
		if err != nil {
			log.Error().Err(err).Msg("handler: failed to acquire database connection")
			respondError(w, "Database connection error", http.StatusInternalServerError)
			return
		}
		defer conn.Release()

		// Look up user by email
		// Use GetUserByEmailWithPassword which bypasses RLS (uses explicit tenant_id filter)
		user, err := storage.GetUserByEmailWithPassword(ctx, conn, tenantID, req.Email)
		if err != nil {
			if err == storage.ErrNotFound {
				// Timing equalization: perform a dummy bcrypt comparison to prevent
				// user enumeration via response time differences
				auth.DummyPasswordCheck(req.Password)
				// User not found - use generic error message to prevent enumeration
				// SECURITY FIX (API-001-1): Record failure for lockout tracking
				if rateLimiters.AccountLockout != nil {
					lockoutResult := rateLimiters.AccountLockout.RecordFailure(req.Email)
					if lockoutResult.Locked {
						log.Warn().
							Str("email", req.Email).
							Str("ip", clientIP).
							Msg("Account locked after failed login attempts (user not found)")
						w.Header().Set("Retry-After", strconv.Itoa(lockoutResult.SecondsUntilUnlock()))
						respondError(w, "Account temporarily locked due to too many failed attempts. Please try again later.", http.StatusTooManyRequests)
						return
					}
				}
				log.Debug().
					Str("email", req.Email).
					Msg("Login failed: user not found")
				respondError(w, "Invalid credentials", http.StatusUnauthorized)
				return
			}
			log.Error().Err(err).Str("email", req.Email).Msg("handler: failed to look up user")
			respondError(w, "Authentication error", http.StatusInternalServerError)
			return
		}

		// Check if user is active
		if !user.IsActive {
			// SECURITY FIX (API-001-1): Record failure for lockout tracking
			if rateLimiters.AccountLockout != nil {
				lockoutResult := rateLimiters.AccountLockout.RecordFailure(req.Email)
				if lockoutResult.Locked {
					log.Warn().
						Str("email", req.Email).
						Str("ip", clientIP).
						Msg("Account locked after failed login attempts (user inactive)")
					w.Header().Set("Retry-After", strconv.Itoa(lockoutResult.SecondsUntilUnlock()))
					respondError(w, "Account temporarily locked due to too many failed attempts. Please try again later.", http.StatusTooManyRequests)
					return
				}
			}
			log.Debug().
				Str("email", req.Email).
				Str("user_id", user.ID).
				Msg("Login failed: user is inactive")
			respondError(w, "Invalid credentials", http.StatusUnauthorized)
			return
		}

		// Check if user has a password (local auth users)
		if user.PasswordHash == "" {
			// SECURITY FIX (API-001-1): Record failure for lockout tracking
			if rateLimiters.AccountLockout != nil {
				lockoutResult := rateLimiters.AccountLockout.RecordFailure(req.Email)
				if lockoutResult.Locked {
					log.Warn().
						Str("email", req.Email).
						Str("ip", clientIP).
						Msg("Account locked after failed login attempts (no password)")
					w.Header().Set("Retry-After", strconv.Itoa(lockoutResult.SecondsUntilUnlock()))
					respondError(w, "Account temporarily locked due to too many failed attempts. Please try again later.", http.StatusTooManyRequests)
					return
				}
			}
			log.Debug().
				Str("email", req.Email).
				Str("user_id", user.ID).
				Msg("Login failed: user has no password (likely Keycloak OIDC user)")
			respondError(w, "Invalid credentials", http.StatusUnauthorized)
			return
		}

		// Verify password
		if err := auth.VerifyPassword(req.Password, user.PasswordHash); err != nil {
			// SECURITY FIX (API-001-1): Record failure for lockout tracking
			if rateLimiters.AccountLockout != nil {
				lockoutResult := rateLimiters.AccountLockout.RecordFailure(req.Email)
				if lockoutResult.Locked {
					log.Warn().
						Str("email", req.Email).
						Str("ip", clientIP).
						Str("user_id", user.ID).
						Msg("Account locked after failed login attempts (invalid password)")
					w.Header().Set("Retry-After", strconv.Itoa(lockoutResult.SecondsUntilUnlock()))
					respondError(w, "Account temporarily locked due to too many failed attempts. Please try again later.", http.StatusTooManyRequests)
					return
				}
			}
			log.Debug().
				Str("email", req.Email).
				Str("user_id", user.ID).
				Msg("Login failed: invalid password")
			respondError(w, "Invalid credentials", http.StatusUnauthorized)
			return
		}

		// Login successful - clear rate limit counter for this email (but NOT IP)
		// IP limit is not cleared on success to prevent credential stuffing attacks
		// where an attacker tries many different email/password combinations from one IP
		rateLimiters.EmailLimiter.Clear(req.Email)

		// SECURITY FIX (API-001-1): Clear lockout on successful login
		if rateLimiters.AccountLockout != nil {
			rateLimiters.AccountLockout.RecordSuccess(req.Email)
		}

		// Update last_login_at timestamp
		if err := storage.UpdateUserLastLogin(ctx, conn, tenantID, user.ID); err != nil {
			// Log but don't fail - updating last login is not critical
			log.Warn().Err(err).Str("user_id", user.ID).Msg("handler: failed to update last login timestamp")
		}

		// Get JWT secret
		jwtSecret := config.JWTSecret()
		if jwtSecret == "" {
			log.Error().Msg("handler: JWT secret not configured")
			respondError(w, "Server configuration error", http.StatusInternalServerError)
			return
		}

		// Create JWT token
		token, err := auth.CreateLocalJWT(user.ID, tenantID, user.Email, user.Name, user.Role, jwtSecret, req.RememberMe)
		if err != nil {
			log.Error().Err(err).Msg("handler: failed to create JWT for login")
			respondError(w, "Failed to create session", http.StatusInternalServerError)
			return
		}

		// Set session cookie
		setSessionCookie(w, r, token, req.RememberMe)

		// SECURITY FIX (CSRF-001-1): Set CSRF token cookie for state-changing request protection
		if err := middleware.SetCSRFCookie(w, r); err != nil {
			log.Warn().Err(err).Msg("handler: failed to set CSRF cookie on login")
			// Non-fatal: continue with login success
		}

		log.Info().
			Str("user_id", user.ID).
			Str("email", user.Email).
			Str("tenant_id", tenantID).
			Bool("remember_me", req.RememberMe).
			Msg("User logged in successfully")

		// Return success response
		respondJSON(w, LoginResponse{
			User: LoginUserResponse{
				ID:       user.ID,
				Email:    user.Email,
				Name:     user.Name,
				Role:     user.Role,
				TenantID: tenantID,
			},
		}, http.StatusOK)
	}
}

// Logout handles POST /api/auth/logout - clears the session cookie.
// This endpoint works in any authentication mode as it simply clears the cookie.
//
// Response (200 OK):
//
//	{
//	  "message": "Logged out successfully"
//	}
func Logout() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Revoke the current token if possible (server-side invalidation)
		claims := middleware.GetClaims(r.Context())
		if claims != nil {
			// Extract JTI from the raw token for revocation
			var cookieValue string
			if cookie, err := r.Cookie("apis_session"); err == nil {
				cookieValue = cookie.Value
			}
			authHeader := r.Header.Get("Authorization")
			if tokenString, found := auth.ExtractTokenFromCookieOrHeader(cookieValue, authHeader); found {
				secret := config.JWTSecret()
				if localClaims, err := auth.ValidateLocalJWT(tokenString, secret); err == nil && localClaims.ID != "" {
					revStore := storage.GetRevocationStore()
					if localClaims.Expiry != nil {
						revStore.RevokeToken(localClaims.ID, localClaims.Expiry.Time())
					}
				}
			}
		}

		// Clear the session cookie by setting MaxAge to -1
		// This tells the browser to delete the cookie immediately
		cookie := &http.Cookie{
			Name:     SessionCookieName,
			Value:    "",
			Path:     "/",
			HttpOnly: true,
			Secure:   r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https",
			SameSite: http.SameSiteStrictMode,
			MaxAge:   -1, // Delete cookie
		}
		http.SetCookie(w, cookie)

		// SECURITY FIX (CSRF-001-1): Clear CSRF cookie on logout
		middleware.ClearCSRFCookie(w, r)

		log.Debug().Msg("User logged out")

		respondJSON(w, map[string]string{
			"message": "Logged out successfully",
		}, http.StatusOK)
	}
}

// Me handles GET /api/auth/me - returns the current authenticated user's info.
// This endpoint requires authentication (must be behind auth middleware).
//
// Response (200 OK):
//
//	{
//	  "user": {
//	    "id": "uuid",
//	    "email": "user@example.com",
//	    "name": "User Name",
//	    "role": "admin",
//	    "tenant_id": "00000000-0000-0000-0000-000000000000"
//	  }
//	}
//
// Errors:
// - 401: Not authenticated (handled by middleware)
func Me() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Get claims from context (set by auth middleware)
		claims := middleware.GetClaims(r.Context())
		if claims == nil {
			// This shouldn't happen if middleware is configured correctly
			respondError(w, "Authentication required", http.StatusUnauthorized)
			return
		}

		respondJSON(w, AuthMeResponse{
			User: AuthMeUserResponse{
				ID:       claims.UserID,
				Email:    claims.Email,
				Name:     claims.Name,
				Role:     claims.Role,
				TenantID: claims.TenantID,
			},
		}, http.StatusOK)
	}
}

// ChangePasswordRateLimiter holds the rate limiter for the change password endpoint.
type ChangePasswordRateLimiter struct {
	Limiter ratelimit.Limiter
}

// NewChangePasswordRateLimiter creates a rate limiter for the change password endpoint.
// Limits: 5 attempts per user_id per 15 minutes.
// Backend is selected via RATE_LIMIT_BACKEND env var (memory or redis).
func NewChangePasswordRateLimiter() *ChangePasswordRateLimiter {
	config := ratelimit.Config{
		MaxRequests:  5,
		WindowPeriod: 15 * time.Minute,
	}
	return &ChangePasswordRateLimiter{
		Limiter: ratelimit.NewLimiter(config, "changepassword"),
	}
}

// Stop stops the rate limiter's background cleanup goroutine.
func (cr *ChangePasswordRateLimiter) Stop() {
	cr.Limiter.Stop()
}

// ChangePasswordRequest represents the request body for POST /api/auth/change-password.
type ChangePasswordRequest struct {
	// CurrentPassword is the user's current password (required)
	CurrentPassword string `json:"current_password"`
	// NewPassword is the new password to set (required, minimum 8 characters)
	NewPassword string `json:"new_password"`
}

// ChangePassword handles POST /api/auth/change-password - allows authenticated users to change their password.
// This endpoint requires authentication (must be behind auth middleware).
//
// Rate limiting: 5 attempts per user_id per 15 minutes.
//
// Request body:
//
//	{
//	  "current_password": "oldpassword",
//	  "new_password": "newsecurepassword123"
//	}
//
// Response (200 OK):
//
//	{
//	  "message": "Password changed successfully"
//	}
//
// Rate limit headers are included in all responses:
// - X-RateLimit-Limit: Maximum requests allowed
// - X-RateLimit-Remaining: Requests remaining in window
// - X-RateLimit-Reset: Unix timestamp when window resets
//
// Errors:
// - 400: Invalid request body or validation errors
// - 401: Not authenticated or current password incorrect
// - 403: Not in local auth mode
// - 429: Rate limit exceeded
// - 500: Internal server error
func ChangePassword(pool *pgxpool.Pool, rateLimiter *ChangePasswordRateLimiter) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		// Check if we're in local auth mode
		if !config.IsLocalAuth() {
			log.Debug().Msg("handler: change password attempted in non-local auth mode")
			respondError(w, "Change password is only available in local authentication mode", http.StatusForbidden)
			return
		}

		// Get claims from context (set by auth middleware)
		claims := middleware.GetClaims(ctx)
		if claims == nil {
			respondError(w, "Authentication required", http.StatusUnauthorized)
			return
		}

		// Check rate limit per user_id BEFORE processing request
		result := ratelimit.CheckWithConfig(rateLimiter.Limiter, claims.UserID, rateLimiter.Limiter.GetConfig())

		// Always add rate limit headers
		ratelimit.AddRateLimitHeaders(w, result.Info)

		if !result.Allowed {
			log.Warn().
				Str("user_id", claims.UserID).
				Int("retry_after", result.Info.RetryAfterSeconds()).
				Msg("Change password rate limit exceeded")
			ratelimit.RespondRateLimited(w, result.Info, "Too many password change attempts. Please try again later.")
			return
		}

		// Parse request body
		var req ChangePasswordRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			respondError(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		// Validate required fields
		if req.CurrentPassword == "" {
			respondError(w, "Current password is required", http.StatusBadRequest)
			return
		}
		if req.NewPassword == "" {
			respondError(w, "New password is required", http.StatusBadRequest)
			return
		}

		// Validate new password strength (length + common password check)
		if err := auth.ValidatePasswordStrength(req.NewPassword); err != nil {
			respondError(w, err.Error(), http.StatusBadRequest)
			return
		}

		// Prevent using the same password
		if req.CurrentPassword == req.NewPassword {
			respondError(w, "New password must be different from current password", http.StatusBadRequest)
			return
		}

		// Nil pool check
		if pool == nil {
			log.Error().Msg("handler: database pool is nil")
			respondError(w, "Database not configured", http.StatusInternalServerError)
			return
		}

		// Acquire a connection from the pool
		conn, err := pool.Acquire(ctx)
		if err != nil {
			log.Error().Err(err).Msg("handler: failed to acquire database connection")
			respondError(w, "Database connection error", http.StatusInternalServerError)
			return
		}
		defer conn.Release()

		// Get tenant ID for local mode
		tenantID := config.DefaultTenantUUID()

		// Get user with password hash
		user, err := storage.GetUserByEmailWithPassword(ctx, conn, tenantID, claims.Email)
		if err != nil {
			if err == storage.ErrNotFound {
				log.Error().Str("user_id", claims.UserID).Msg("handler: user not found for change password")
				respondError(w, "User not found", http.StatusUnauthorized)
				return
			}
			log.Error().Err(err).Str("user_id", claims.UserID).Msg("handler: failed to get user for change password")
			respondError(w, "Failed to verify credentials", http.StatusInternalServerError)
			return
		}

		// Verify current password
		if err := auth.VerifyPassword(req.CurrentPassword, user.PasswordHash); err != nil {
			log.Debug().
				Str("user_id", claims.UserID).
				Msg("Change password failed: incorrect current password")
			respondError(w, "Current password is incorrect", http.StatusUnauthorized)
			return
		}

		// Hash the new password
		newPasswordHash, err := auth.HashPassword(req.NewPassword)
		if err != nil {
			log.Error().Err(err).Msg("handler: failed to hash new password")
			respondError(w, "Failed to process password", http.StatusInternalServerError)
			return
		}

		// Update the password (must_change_password = false since user is voluntarily changing)
		err = storage.SetUserPassword(ctx, conn, claims.UserID, newPasswordHash, false)
		if err != nil {
			log.Error().Err(err).Str("user_id", claims.UserID).Msg("handler: failed to update password")
			respondError(w, "Failed to change password", http.StatusInternalServerError)
			return
		}

		// Revoke all existing tokens for this user (forces re-login with new password)
		revStore := storage.GetRevocationStore()
		revStore.RevokeAllForUser(claims.UserID, time.Now().Add(auth.RememberMeTokenExpiry))

		// Clear rate limit on success
		rateLimiter.Limiter.Clear(claims.UserID)

		log.Info().
			Str("user_id", claims.UserID).
			Str("email", claims.Email).
			Msg("User changed password successfully")

		respondJSON(w, map[string]string{
			"message": "Password changed successfully",
		}, http.StatusOK)
	}
}
