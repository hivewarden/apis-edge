// Package handlers provides HTTP request handlers for the APIS server.
package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/mail"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"

	"github.com/jermoo/apis/apis-server/internal/auth"
	"github.com/jermoo/apis/apis-server/internal/config"
	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/ratelimit"
	"github.com/jermoo/apis/apis-server/internal/storage"
)

// InviteAcceptRateLimiter holds the rate limiter for the invite accept endpoint.
type InviteAcceptRateLimiter struct {
	Limiter ratelimit.Limiter
}

// NewInviteAcceptRateLimiter creates a rate limiter for the invite accept endpoint.
// Limits: 5 attempts per IP per 15 minutes.
// Backend is selected via RATE_LIMIT_BACKEND env var (memory or redis).
func NewInviteAcceptRateLimiter() *InviteAcceptRateLimiter {
	config := ratelimit.Config{
		MaxRequests:  5,
		WindowPeriod: 15 * time.Minute,
	}
	return &InviteAcceptRateLimiter{
		Limiter: ratelimit.NewLimiter(config, "inviteaccept"),
	}
}

// Stop stops the rate limiter's background cleanup goroutine.
func (ir *InviteAcceptRateLimiter) Stop() {
	ir.Limiter.Stop()
}

// CreateInviteRequest represents the request body for POST /api/users/invite.
type CreateInviteRequest struct {
	// Method specifies the invitation method: "temp_password", "email", or "link"
	Method string `json:"method"`
	// Email is required for "email" method, optional for "temp_password"
	Email string `json:"email,omitempty"`
	// Role is the role to assign to the invited user ("admin" or "member")
	Role string `json:"role"`
	// Password is required for "temp_password" method
	Password string `json:"password,omitempty"`
	// DisplayName is required for "temp_password" method
	DisplayName string `json:"display_name,omitempty"`
	// ExpiryDays is optional, defaults to 7 days
	ExpiryDays int `json:"expiry_days,omitempty"`
}

// CreateInviteResponse represents the response for different invite methods.
type CreateInviteResponse struct {
	// For temp_password method: returns created user
	User *UserResponse `json:"user,omitempty"`
	// For email/link methods: returns token info
	Token     string `json:"token,omitempty"`
	ExpiresAt string `json:"expires_at,omitempty"`
	// For link method: returns the full invite URL
	InviteURL string `json:"invite_url,omitempty"`
}

// InviteInfoResponse represents the response for GET /api/invite/{token}.
type InviteInfoResponse struct {
	Role       string `json:"role"`
	TenantName string `json:"tenant_name"`
	Email      string `json:"email,omitempty"`
	ExpiresAt  string `json:"expires_at"`
}

// AcceptInviteRequest represents the request body for POST /api/invite/{token}/accept.
type AcceptInviteRequest struct {
	Email       string `json:"email"`
	DisplayName string `json:"display_name"`
	Password    string `json:"password"`
}

// AcceptInviteResponse represents the response for accepting an invite.
type AcceptInviteResponse struct {
	User AcceptInviteUserResponse `json:"user"`
}

// AcceptInviteUserResponse represents user data in the accept invite response.
type AcceptInviteUserResponse struct {
	ID       string `json:"id"`
	Email    string `json:"email"`
	Name     string `json:"name"`
	Role     string `json:"role"`
	TenantID string `json:"tenant_id"`
}

const defaultDashboardURL = "http://localhost:5173"

func resolveInviteBaseURL() string {
	baseURL := strings.TrimSpace(os.Getenv("DASHBOARD_URL"))
	if baseURL == "" {
		return defaultDashboardURL
	}

	parsed, err := url.Parse(baseURL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		log.Warn().Str("dashboard_url", baseURL).Msg("Invalid DASHBOARD_URL; using default invite URL base")
		return defaultDashboardURL
	}

	cleaned := &url.URL{
		Scheme: parsed.Scheme,
		Host:   parsed.Host,
		Path:   strings.TrimRight(parsed.Path, "/"),
	}

	return cleaned.String()
}

// CreateInvite handles POST /api/users/invite - creates an invitation.
// Admin only. Supports three methods:
// - temp_password: Creates user immediately with must_change_password=true
// - email: Creates token for email invite (stub - no actual email sent)
// - link: Creates shareable link token (reusable)
func CreateInvite(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		conn := storage.RequireConn(ctx)
		claims := middleware.GetClaims(ctx)
		tenantID := middleware.GetTenantID(ctx)

		// Parse request body
		var req CreateInviteRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			respondError(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		// Validate method
		req.Method = strings.TrimSpace(strings.ToLower(req.Method))
		if req.Method != "temp_password" && req.Method != "email" && req.Method != "link" {
			respondError(w, "Method must be 'temp_password', 'email', or 'link'", http.StatusBadRequest)
			return
		}

		// Validate role
		if req.Role == "" {
			req.Role = "member" // default
		}
		if req.Role != "admin" && req.Role != "member" {
			respondError(w, "Role must be 'admin' or 'member'", http.StatusBadRequest)
			return
		}

		// Handle each method differently
		switch req.Method {
		case "temp_password":
			handleTempPasswordInvite(w, r, ctx, conn, claims, tenantID, &req)
		case "email":
			handleEmailInvite(w, ctx, conn, pool, claims, tenantID, &req)
		case "link":
			handleLinkInvite(w, r, ctx, conn, pool, claims, tenantID, &req)
		}
	}
}

// handleTempPasswordInvite creates a user immediately with must_change_password=true.
func handleTempPasswordInvite(w http.ResponseWriter, r *http.Request, ctx context.Context, conn *pgxpool.Conn, claims *middleware.Claims, tenantID string, req *CreateInviteRequest) {
	// Validate required fields for temp_password
	if strings.TrimSpace(req.Email) == "" {
		respondError(w, "Email is required for temp_password method", http.StatusBadRequest)
		return
	}
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))

	// Validate email format
	if _, err := mail.ParseAddress(req.Email); err != nil {
		respondError(w, "Invalid email format", http.StatusBadRequest)
		return
	}

	// Validate email max length
	if len(req.Email) > 254 {
		respondError(w, "Email must be 254 characters or less", http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(req.DisplayName) == "" {
		respondError(w, "Display name is required for temp_password method", http.StatusBadRequest)
		return
	}
	req.DisplayName = strings.TrimSpace(req.DisplayName)

	// Validate display name max length
	if len(req.DisplayName) > 100 {
		respondError(w, "Display name must be 100 characters or less", http.StatusBadRequest)
		return
	}

	// Validate password strength (length + common password check)
	if err := auth.ValidatePasswordStrength(req.Password); err != nil {
		respondError(w, strings.TrimPrefix(err.Error(), "auth: "), http.StatusBadRequest)
		return
	}

	// Hash the password
	passwordHash, err := auth.HashPassword(req.Password)
	if err != nil {
		log.Error().Err(err).Msg("handler: failed to hash password for invite")
		respondError(w, "Failed to create user", http.StatusInternalServerError)
		return
	}

	// Create the user with must_change_password=true
	input := &storage.CreateLocalUserInput{
		TenantID:     tenantID,
		Email:        req.Email,
		DisplayName:  req.DisplayName,
		PasswordHash: passwordHash,
		Role:         req.Role,
	}

	user, err := storage.CreateLocalUserWithMustChange(ctx, conn, input, claims.UserID)
	if err != nil {
		// Check for unique constraint violation
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			respondError(w, "Email already exists", http.StatusConflict)
			return
		}
		log.Error().Err(err).Str("email", req.Email).Msg("handler: failed to create user via temp_password invite")
		respondError(w, "Failed to create user", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("user_id", user.ID).
		Str("email", user.Email).
		Str("role", user.Role).
		Str("invited_by", claims.UserID).
		Str("method", "temp_password").
		Msg("User created via temp_password invite")

	respondJSON(w, map[string]interface{}{
		"data": CreateInviteResponse{
			User: &UserResponse{
				ID:                 user.ID,
				Email:              user.Email,
				DisplayName:        user.Name,
				Role:               user.Role,
				IsActive:           user.IsActive,
				MustChangePassword: user.MustChangePassword,
				CreatedAt:          user.CreatedAt.Format(time.RFC3339),
			},
		},
	}, http.StatusCreated)
}

// handleEmailInvite creates a token for email invite (single-use).
func handleEmailInvite(w http.ResponseWriter, ctx context.Context, conn *pgxpool.Conn, pool *pgxpool.Pool, claims *middleware.Claims, tenantID string, req *CreateInviteRequest) {
	// Validate required fields for email
	if strings.TrimSpace(req.Email) == "" {
		respondError(w, "Email is required for email method", http.StatusBadRequest)
		return
	}
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))

	// Validate email format
	if _, err := mail.ParseAddress(req.Email); err != nil {
		respondError(w, "Invalid email format", http.StatusBadRequest)
		return
	}

	// Check if user already exists
	existingUser, err := storage.GetUserByEmailWithPassword(ctx, conn, tenantID, req.Email)
	if err == nil && existingUser != nil {
		respondError(w, "A user with this email already exists", http.StatusConflict)
		return
	}
	if err != nil && !errors.Is(err, storage.ErrNotFound) {
		log.Error().Err(err).Msg("handler: failed to check existing user")
		respondError(w, "Failed to create invite", http.StatusInternalServerError)
		return
	}

	// Generate token
	token, err := storage.GenerateInviteToken()
	if err != nil {
		log.Error().Err(err).Msg("handler: failed to generate invite token")
		respondError(w, "Failed to create invite", http.StatusInternalServerError)
		return
	}

	// Calculate expiry
	expiryDays := req.ExpiryDays
	if expiryDays <= 0 {
		expiryDays = 7
	}
	expiresAt := time.Now().Add(time.Duration(expiryDays) * 24 * time.Hour)

	// Create token
	input := &storage.InviteTokenInput{
		TenantID:  tenantID,
		Email:     req.Email,
		Role:      req.Role,
		Type:      "email",
		ExpiresAt: expiresAt,
		CreatedBy: claims.UserID,
	}

	inviteToken, err := storage.CreateInviteToken(ctx, conn, token, input)
	if err != nil {
		log.Error().Err(err).Msg("handler: failed to create invite token")
		respondError(w, "Failed to create invite", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("token_id", inviteToken.ID).
		Str("email", req.Email).
		Str("role", req.Role).
		Str("created_by", claims.UserID).
		Str("method", "email").
		Time("expires_at", expiresAt).
		Msg("Email invite token created")

	// TODO: Send email with token (stub for now)
	// In a real implementation, this would send an email via SMTP

	respondJSON(w, map[string]interface{}{
		"data": CreateInviteResponse{
			Token:     token,
			ExpiresAt: expiresAt.Format(time.RFC3339),
		},
	}, http.StatusCreated)
}

// handleLinkInvite creates a shareable link token (reusable).
func handleLinkInvite(w http.ResponseWriter, r *http.Request, ctx context.Context, conn *pgxpool.Conn, pool *pgxpool.Pool, claims *middleware.Claims, tenantID string, req *CreateInviteRequest) {
	// SECURITY FIX (S3B-M2): Cap the number of pending invites per tenant to prevent abuse.
	// A malicious admin could create unlimited invite tokens, exhausting storage and
	// creating a large attack surface of valid bearer tokens.
	existingTokens, err := storage.ListInviteTokensByTenant(ctx, conn)
	if err != nil {
		log.Error().Err(err).Msg("handler: failed to check existing invites")
		respondError(w, "Failed to create invite", http.StatusInternalServerError)
		return
	}
	pendingCount := 0
	for _, t := range existingTokens {
		if t.UsedAt == nil && time.Now().Before(t.ExpiresAt) {
			pendingCount++
		}
	}
	if pendingCount >= 50 {
		respondError(w, "Too many pending invites (maximum 50). Delete unused invites first.", http.StatusBadRequest)
		return
	}

	// Generate token
	token, err := storage.GenerateInviteToken()
	if err != nil {
		log.Error().Err(err).Msg("handler: failed to generate invite token")
		respondError(w, "Failed to create invite", http.StatusInternalServerError)
		return
	}

	// Calculate expiry
	expiryDays := req.ExpiryDays
	if expiryDays <= 0 {
		expiryDays = 7
	}
	expiresAt := time.Now().Add(time.Duration(expiryDays) * 24 * time.Hour)

	// Create token (no email for link invites)
	input := &storage.InviteTokenInput{
		TenantID:  tenantID,
		Email:     "", // Empty for link invites
		Role:      req.Role,
		Type:      "link",
		ExpiresAt: expiresAt,
		CreatedBy: claims.UserID,
	}

	inviteToken, err := storage.CreateInviteToken(ctx, conn, token, input)
	if err != nil {
		log.Error().Err(err).Msg("handler: failed to create invite token")
		respondError(w, "Failed to create invite", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("token_id", inviteToken.ID).
		Str("role", req.Role).
		Str("created_by", claims.UserID).
		Str("method", "link").
		Time("expires_at", expiresAt).
		Msg("Link invite token created")

	// Build invite URL from validated server configuration.
	// Never derive it from request headers/host.
	inviteURL := resolveInviteBaseURL() + "/invite/" + token

	respondJSON(w, map[string]interface{}{
		"data": CreateInviteResponse{
			Token:     token,
			ExpiresAt: expiresAt.Format(time.RFC3339),
			InviteURL: inviteURL,
		},
	}, http.StatusCreated)
}

// GetInviteInfo handles GET /api/invite/{token} - returns invite info for the accept page.
// This is a public endpoint (no authentication required).
func GetInviteInfo(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		token := chi.URLParam(r, "token")

		if token == "" {
			respondError(w, "Token is required", http.StatusBadRequest)
			return
		}

		// Get token with tenant info
		inviteToken, tenant, err := storage.GetInviteTokenByTokenWithTenant(ctx, pool, token)
		if errors.Is(err, storage.ErrNotFound) {
			respondError(w, "Invite not found", http.StatusNotFound)
			return
		}
		if err != nil {
			log.Error().Err(err).Str("token", token[:8]+"...").Msg("handler: failed to get invite token")
			respondError(w, "Failed to retrieve invite", http.StatusInternalServerError)
			return
		}

		// Check if token is expired
		if time.Now().After(inviteToken.ExpiresAt) {
			respondError(w, "Invite has expired", http.StatusGone)
			return
		}

		// For non-link tokens, check if already used
		isLinkType := inviteToken.Email == ""
		if !isLinkType && inviteToken.UsedAt != nil {
			respondError(w, "Invite has already been used", http.StatusGone)
			return
		}

		respondJSON(w, map[string]interface{}{
			"data": InviteInfoResponse{
				Role:       inviteToken.Role,
				TenantName: tenant.Name,
				Email:      inviteToken.Email,
				ExpiresAt:  inviteToken.ExpiresAt.Format(time.RFC3339),
			},
		}, http.StatusOK)
	}
}

// AcceptInvite handles POST /api/invite/{token}/accept - accepts an invite and creates user.
// This is a public endpoint (no authentication required).
//
// Rate limiting: 5 attempts per IP per 15 minutes.
//
// Rate limit headers are included in all responses:
// - X-RateLimit-Limit: Maximum requests allowed
// - X-RateLimit-Remaining: Requests remaining in window
// - X-RateLimit-Reset: Unix timestamp when window resets
func AcceptInvite(pool *pgxpool.Pool, rateLimiter *InviteAcceptRateLimiter) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		token := chi.URLParam(r, "token")

		if token == "" {
			respondError(w, "Token is required", http.StatusBadRequest)
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
				Str("token_prefix", token[:8]+"...").
				Int("retry_after", result.Info.RetryAfterSeconds()).
				Msg("Invite accept rate limit exceeded")
			ratelimit.RespondRateLimited(w, result.Info, "Too many invite accept attempts. Please try again later.")
			return
		}

		// Parse request body
		var req AcceptInviteRequest
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

		// Validate email max length
		if len(req.Email) > 254 {
			respondError(w, "Email must be 254 characters or less", http.StatusBadRequest)
			return
		}

		if strings.TrimSpace(req.DisplayName) == "" {
			respondError(w, "Display name is required", http.StatusBadRequest)
			return
		}
		req.DisplayName = strings.TrimSpace(req.DisplayName)

		// Validate display name max length
		if len(req.DisplayName) > 100 {
			respondError(w, "Display name must be 100 characters or less", http.StatusBadRequest)
			return
		}

		// Validate password strength (length + common password check)
		if err := auth.ValidatePasswordStrength(req.Password); err != nil {
			respondError(w, strings.TrimPrefix(err.Error(), "auth: "), http.StatusBadRequest)
			return
		}

		// Get invite token
		inviteToken, err := storage.GetInviteTokenByToken(ctx, pool, token)
		if errors.Is(err, storage.ErrNotFound) {
			respondError(w, "Invite not found", http.StatusNotFound)
			return
		}
		if err != nil {
			log.Error().Err(err).Str("token", token[:8]+"...").Msg("handler: failed to get invite token")
			respondError(w, "Failed to accept invite", http.StatusInternalServerError)
			return
		}

		// Check if token is expired
		if time.Now().After(inviteToken.ExpiresAt) {
			respondError(w, "Invite has expired", http.StatusGone)
			return
		}

		// Determine if this is a link-type invite (reusable)
		isLinkType := inviteToken.Email == ""

		// For non-link tokens, check if already used
		if !isLinkType && inviteToken.UsedAt != nil {
			respondError(w, "Invite has already been used", http.StatusGone)
			return
		}

		// For email invites, verify the email matches
		if inviteToken.Email != "" && inviteToken.Email != req.Email {
			respondError(w, "Email does not match the invite", http.StatusBadRequest)
			return
		}

		// Hash the password
		passwordHash, err := auth.HashPassword(req.Password)
		if err != nil {
			log.Error().Err(err).Msg("handler: failed to hash password for invite accept")
			respondError(w, "Failed to create account", http.StatusInternalServerError)
			return
		}

		// Create user from invite (atomic operation)
		userInput := &storage.CreateLocalUserInput{
			TenantID:     inviteToken.TenantID,
			Email:        req.Email,
			DisplayName:  req.DisplayName,
			PasswordHash: passwordHash,
			Role:         inviteToken.Role,
		}

		user, err := storage.CreateUserFromInvite(ctx, pool, inviteToken, userInput, isLinkType)
		if err != nil {
			// Check for unique constraint violation
			var pgErr *pgconn.PgError
			if errors.As(err, &pgErr) && pgErr.Code == "23505" {
				respondError(w, "A user with this email already exists", http.StatusConflict)
				return
			}
			if strings.Contains(err.Error(), "token already used") {
				respondError(w, "Invite has already been used", http.StatusGone)
				return
			}
			log.Error().Err(err).Str("email", req.Email).Msg("handler: failed to create user from invite")
			respondError(w, "Failed to create account", http.StatusInternalServerError)
			return
		}

		log.Info().
			Str("user_id", user.ID).
			Str("email", user.Email).
			Str("role", user.Role).
			Str("tenant_id", inviteToken.TenantID).
			Bool("is_link_type", isLinkType).
			Msg("User created from invite")

		// Create JWT and set session cookie
		jwtSecret := config.JWTSecret()
		if jwtSecret == "" {
			log.Error().Msg("handler: JWT secret not configured")
			respondError(w, "Server configuration error", http.StatusInternalServerError)
			return
		}

		jwtToken, err := auth.CreateLocalJWT(user.ID, inviteToken.TenantID, user.Email, user.Name, user.Role, jwtSecret, false)
		if err != nil {
			log.Error().Err(err).Msg("handler: failed to create JWT for invite accept")
			respondError(w, "Failed to create session", http.StatusInternalServerError)
			return
		}

		// Set session cookie
		setSessionCookie(w, r, jwtToken, false)

		// SECURITY FIX (CSRF-001-1): Set CSRF token cookie for state-changing request protection
		if err := middleware.SetCSRFCookie(w, r); err != nil {
			log.Warn().Err(err).Msg("handler: failed to set CSRF cookie on invite accept")
		}

		respondJSON(w, map[string]interface{}{
			"data": AcceptInviteResponse{
				User: AcceptInviteUserResponse{
					ID:       user.ID,
					Email:    user.Email,
					Name:     user.Name,
					Role:     user.Role,
					TenantID: inviteToken.TenantID,
				},
			},
		}, http.StatusCreated)
	}
}

// ListInvites handles GET /api/users/invites - lists all invite tokens.
// Admin only.
func ListInvites(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())

	tokens, err := storage.ListInviteTokensByTenant(r.Context(), conn)
	if err != nil {
		log.Error().Err(err).Msg("handler: failed to list invite tokens")
		respondError(w, "Failed to list invites", http.StatusInternalServerError)
		return
	}

	// Convert to response format
	// SECURITY FIX (S3B-H2): Token values are masked in list responses to prevent
	// exposure. The full token is only shown at creation time in CreateInvite.
	type InviteTokenResponse struct {
		ID          string  `json:"id"`
		TokenPrefix string  `json:"token_prefix"` // Masked: only last 4 chars shown
		Email       string  `json:"email,omitempty"`
		Role        string  `json:"role"`
		UsedAt      *string `json:"used_at,omitempty"`
		ExpiresAt   string  `json:"expires_at"`
		CreatedBy   string  `json:"created_by"`
		CreatedAt   string  `json:"created_at"`
	}

	responses := make([]InviteTokenResponse, 0, len(tokens))
	for _, t := range tokens {
		// Mask token: show only last 4 characters
		maskedToken := "****"
		if len(t.Token) >= 4 {
			maskedToken = "****" + t.Token[len(t.Token)-4:]
		}
		resp := InviteTokenResponse{
			ID:          t.ID,
			TokenPrefix: maskedToken,
			Email:       t.Email,
			Role:        t.Role,
			ExpiresAt:   t.ExpiresAt.Format(time.RFC3339),
			CreatedBy:   t.CreatedBy,
			CreatedAt:   t.CreatedAt.Format(time.RFC3339),
		}
		if t.UsedAt != nil {
			s := t.UsedAt.Format(time.RFC3339)
			resp.UsedAt = &s
		}
		responses = append(responses, resp)
	}

	respondJSON(w, map[string]interface{}{
		"data": responses,
		"meta": MetaResponse{Total: len(responses)},
	}, http.StatusOK)
}

// DeleteInvite handles DELETE /api/users/invites/{id} - deletes an invite token.
// Admin only.
func DeleteInvite(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tokenID := chi.URLParam(r, "id")

	if tokenID == "" {
		respondError(w, "Invite ID is required", http.StatusBadRequest)
		return
	}

	err := storage.DeleteInviteToken(r.Context(), conn, tokenID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Invite not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("token_id", tokenID).Msg("handler: failed to delete invite token")
		respondError(w, "Failed to delete invite", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("token_id", tokenID).
		Msg("Invite token deleted")

	w.WriteHeader(http.StatusNoContent)
}
