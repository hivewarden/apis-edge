// Package handlers provides HTTP request handlers for the APIS server.
package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"

	"github.com/jermoo/apis/apis-server/internal/auth"
	"github.com/jermoo/apis/apis-server/internal/config"
	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/storage"
)

// ImpersonateRequest represents the request body for starting impersonation.
type ImpersonateRequest struct {
	Reason string `json:"reason,omitempty"` // Optional reason for audit purposes
}

// ImpersonationStatusResponse represents the response for impersonation status/start/stop.
type ImpersonationStatusResponse struct {
	Data ImpersonationData `json:"data"`
}

// ImpersonationData contains the impersonation state details.
type ImpersonationData struct {
	Impersonating    bool    `json:"impersonating"`
	TenantID         string  `json:"tenant_id,omitempty"`
	TenantName       string  `json:"tenant_name,omitempty"`
	OriginalTenantID string  `json:"original_tenant_id,omitempty"`
	StartedAt        *string `json:"started_at,omitempty"`
	SessionDuration  string  `json:"session_duration,omitempty"`
}

// AdminStartImpersonation returns a handler that starts impersonation of a tenant.
// POST /api/admin/impersonate/{tenant_id}
//
// Super-admin only. Requires SaaS mode (AUTH_MODE=keycloak).
// Creates an impersonation session and issues a new JWT with the target tenant.
func AdminStartImpersonation(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		claims := middleware.GetClaims(ctx)

		// Get target tenant ID from URL
		tenantID := chi.URLParam(r, "tenant_id")
		if tenantID == "" {
			respondError(w, "Tenant ID is required", http.StatusBadRequest)
			return
		}

		// Validate UUID format
		if _, err := uuid.Parse(tenantID); err != nil {
			respondError(w, "Invalid tenant ID format", http.StatusBadRequest)
			return
		}

		// Check if already impersonating
		if claims.Impersonating {
			respondError(w, "Already impersonating a tenant. Stop current session first.", http.StatusBadRequest)
			return
		}

		// Parse optional reason from request body
		var req ImpersonateRequest
		if r.Body != nil && r.ContentLength > 0 {
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				// Ignore decode errors - reason is optional
				log.Debug().Err(err).Msg("handler: failed to decode impersonation request body")
			}
		}

		// Verify target tenant exists and is not deleted
		conn, err := pool.Acquire(ctx)
		if err != nil {
			log.Error().Err(err).Msg("handler: failed to acquire connection for impersonation")
			respondError(w, "Database error", http.StatusInternalServerError)
			return
		}
		defer conn.Release()

		tenant, err := storage.GetTenantByID(ctx, conn, tenantID)
		if errors.Is(err, storage.ErrNotFound) {
			respondError(w, "Tenant not found", http.StatusNotFound)
			return
		}
		if err != nil {
			log.Error().Err(err).Str("tenant_id", tenantID).Msg("handler: failed to get tenant for impersonation")
			respondError(w, "Failed to verify tenant", http.StatusInternalServerError)
			return
		}

		// Check tenant status
		if tenant.Status == "deleted" {
			respondError(w, "Cannot impersonate a deleted tenant", http.StatusBadRequest)
			return
		}

		// Create impersonation log entry
		session, err := storage.CreateImpersonationLog(ctx, pool, claims.UserID, tenantID)
		if errors.Is(err, storage.ErrAlreadyImpersonating) {
			respondError(w, "Already impersonating a tenant", http.StatusBadRequest)
			return
		}
		if err != nil {
			log.Error().Err(err).
				Str("super_admin_id", claims.UserID).
				Str("target_tenant_id", tenantID).
				Msg("handler: failed to create impersonation log")
			respondError(w, "Failed to start impersonation", http.StatusInternalServerError)
			return
		}

		// Get JWT secret
		jwtSecret := config.JWTSecret()
		if jwtSecret == "" {
			log.Error().Msg("handler: JWT secret not configured")
			respondError(w, "Server configuration error", http.StatusInternalServerError)
			return
		}

		// Create impersonation JWT
		token, err := auth.CreateImpersonationJWT(auth.ImpersonationParams{
			UserID:           claims.UserID,
			TargetTenantID:   tenantID,
			OriginalTenantID: claims.TenantID,
			Email:            claims.Email,
			Name:             claims.Name,
			Role:             claims.Role,
		}, jwtSecret)
		if err != nil {
			log.Error().Err(err).Msg("handler: failed to create impersonation JWT")
			respondError(w, "Failed to create session", http.StatusInternalServerError)
			return
		}

		// Set session cookie
		setSessionCookie(w, r, token, false) // Never "remember me" for impersonation

		// SECURITY FIX (CSRF-001-1): Refresh CSRF token on impersonation start
		if err := middleware.SetCSRFCookie(w, r); err != nil {
			log.Warn().Err(err).Msg("handler: failed to set CSRF cookie on impersonation start")
		}

		log.Info().
			Str("super_admin_id", claims.UserID).
			Str("super_admin_email", claims.Email).
			Str("target_tenant_id", tenantID).
			Str("target_tenant_name", tenant.Name).
			Str("reason", req.Reason).
			Str("session_id", session.ID).
			Msg("Super-admin started tenant impersonation")

		// Return success response
		startedAt := session.StartedAt.Format(time.RFC3339)
		respondJSON(w, ImpersonationStatusResponse{
			Data: ImpersonationData{
				Impersonating:    true,
				TenantID:         tenantID,
				TenantName:       tenant.Name,
				OriginalTenantID: claims.TenantID,
				StartedAt:        &startedAt,
			},
		}, http.StatusOK)
	}
}

// AdminStopImpersonation returns a handler that stops the current impersonation session.
// POST /api/admin/impersonate/stop
//
// Super-admin only. Requires an active impersonation session.
// Ends the impersonation session and issues a new JWT with the original tenant.
func AdminStopImpersonation(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		claims := middleware.GetClaims(ctx)

		// Verify currently impersonating
		if !claims.Impersonating {
			respondError(w, "Not currently impersonating", http.StatusBadRequest)
			return
		}

		// End the impersonation session in the database
		session, err := storage.EndImpersonationLog(ctx, pool, claims.ImpersonatorID)
		if errors.Is(err, storage.ErrNotImpersonating) {
			// Session may have expired or been ended elsewhere
			log.Warn().
				Str("user_id", claims.UserID).
				Msg("handler: impersonation stop requested but no active session found")
		} else if err != nil {
			log.Error().Err(err).
				Str("user_id", claims.UserID).
				Msg("handler: failed to end impersonation log")
			// Continue anyway - we still want to clear the impersonation JWT
		}

		// Calculate session duration if we have the session
		var sessionDuration string
		if session != nil && session.EndedAt != nil {
			duration := session.EndedAt.Sub(session.StartedAt)
			sessionDuration = formatDuration(duration)
		}

		// Get JWT secret
		jwtSecret := config.JWTSecret()
		if jwtSecret == "" {
			log.Error().Msg("handler: JWT secret not configured")
			respondError(w, "Server configuration error", http.StatusInternalServerError)
			return
		}

		// Create a new regular JWT with the original tenant
		token, err := auth.CreateLocalJWT(
			claims.UserID,
			claims.OriginalTenantID,
			claims.Email,
			claims.Name,
			claims.Role,
			jwtSecret,
			false, // Regular expiry
		)
		if err != nil {
			log.Error().Err(err).Msg("handler: failed to create post-impersonation JWT")
			respondError(w, "Failed to restore session", http.StatusInternalServerError)
			return
		}

		// Set session cookie with the new token
		setSessionCookie(w, r, token, false)

		// SECURITY FIX (CSRF-001-1): Refresh CSRF token on impersonation stop
		if err := middleware.SetCSRFCookie(w, r); err != nil {
			log.Warn().Err(err).Msg("handler: failed to set CSRF cookie on impersonation stop")
		}

		log.Info().
			Str("super_admin_id", claims.ImpersonatorID).
			Str("super_admin_email", claims.Email).
			Str("impersonated_tenant_id", claims.TenantID).
			Str("session_duration", sessionDuration).
			Msg("Super-admin stopped tenant impersonation")

		// Return success response
		respondJSON(w, ImpersonationStatusResponse{
			Data: ImpersonationData{
				Impersonating:   false,
				TenantID:        claims.OriginalTenantID,
				SessionDuration: sessionDuration,
			},
		}, http.StatusOK)
	}
}

// AdminImpersonationStatus returns a handler that returns the current impersonation status.
// GET /api/admin/impersonate/status
//
// Super-admin only. Returns current impersonation state from JWT claims.
func AdminImpersonationStatus(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		claims := middleware.GetClaims(ctx)

		// Check if currently impersonating
		if !claims.Impersonating {
			respondJSON(w, ImpersonationStatusResponse{
				Data: ImpersonationData{
					Impersonating: false,
				},
			}, http.StatusOK)
			return
		}

		// Get tenant name for display
		var tenantName string
		conn, err := pool.Acquire(ctx)
		if err == nil {
			defer conn.Release()
			tenant, err := storage.GetTenantByID(ctx, conn, claims.TenantID)
			if err == nil {
				tenantName = tenant.Name
			}
		}

		// Get active session for started_at time
		var startedAt *string
		activeSession, err := storage.GetActiveImpersonation(ctx, pool, claims.ImpersonatorID)
		if err == nil && activeSession != nil {
			ts := activeSession.StartedAt.Format(time.RFC3339)
			startedAt = &ts
		}

		respondJSON(w, ImpersonationStatusResponse{
			Data: ImpersonationData{
				Impersonating:    true,
				TenantID:         claims.TenantID,
				TenantName:       tenantName,
				OriginalTenantID: claims.OriginalTenantID,
				StartedAt:        startedAt,
			},
		}, http.StatusOK)
	}
}

// AdminListImpersonationLogs returns a handler that lists impersonation logs for a tenant.
// GET /api/admin/tenants/{id}/impersonation-logs
//
// Super-admin only. Returns impersonation audit trail for a specific tenant.
func AdminListImpersonationLogs(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		claims := middleware.GetClaims(ctx)

		tenantID := chi.URLParam(r, "id")
		if tenantID == "" {
			respondError(w, "Tenant ID is required", http.StatusBadRequest)
			return
		}

		// List impersonation logs
		logs, err := storage.ListImpersonationLogs(ctx, pool, tenantID, 50)
		if err != nil {
			log.Error().Err(err).
				Str("super_admin_id", claims.UserID).
				Str("tenant_id", tenantID).
				Msg("handler: failed to list impersonation logs")
			respondError(w, "Failed to list impersonation logs", http.StatusInternalServerError)
			return
		}

		// Convert to response format
		type LogEntry struct {
			ID           string  `json:"id"`
			SuperAdminID string  `json:"super_admin_id"`
			StartedAt    string  `json:"started_at"`
			EndedAt      *string `json:"ended_at,omitempty"`
			ActionsTaken int     `json:"actions_taken"`
		}

		entries := make([]LogEntry, 0, len(logs))
		for _, l := range logs {
			entry := LogEntry{
				ID:           l.ID,
				SuperAdminID: l.SuperAdminID,
				StartedAt:    l.StartedAt.Format(time.RFC3339),
				ActionsTaken: l.ActionsTaken,
			}
			if l.EndedAt != nil {
				endedAt := l.EndedAt.Format(time.RFC3339)
				entry.EndedAt = &endedAt
			}
			entries = append(entries, entry)
		}

		respondJSON(w, map[string]any{
			"data": entries,
			"meta": map[string]any{"total": len(entries)},
		}, http.StatusOK)
	}
}

// formatDuration formats a duration as HH:MM:SS.
func formatDuration(d time.Duration) string {
	h := d / time.Hour
	d -= h * time.Hour
	m := d / time.Minute
	d -= m * time.Minute
	s := d / time.Second
	return fmt.Sprintf("%02d:%02d:%02d", h, m, s)
}

// ImpersonationMiddleware adds impersonation context to requests.
// This middleware should be applied to protected routes to track actions
// performed during impersonation sessions.
//
// Note: This is optional and can be added later if action tracking is needed.
func ImpersonationMiddleware(pool *pgxpool.Pool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims := middleware.GetClaims(r.Context())

			// Only track mutating operations during impersonation
			if claims != nil && claims.Impersonating {
				method := strings.ToUpper(r.Method)
				if method == "POST" || method == "PUT" || method == "DELETE" || method == "PATCH" {
					// Increment action counter in background with dedicated context
					go func() {
						bgCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
						defer cancel()
						if err := storage.IncrementImpersonationActions(bgCtx, pool, claims.ImpersonatorID); err != nil {
							log.Warn().Err(err).
								Str("impersonator_id", claims.ImpersonatorID).
								Msg("handler: failed to increment impersonation actions")
						}
					}()
				}
			}

			next.ServeHTTP(w, r)
		})
	}
}
