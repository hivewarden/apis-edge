package middleware

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/rs/zerolog/log"
)

// unitContextKey is the context key for storing unit information.
type unitContextKey struct{}

// UnitAuth returns middleware that validates X-API-Key header for unit authentication.
// On success, the unit information is added to the request context.
// On failure, responds with 401 Unauthorized.
func UnitAuth(pool *pgxpool.Pool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			apiKey := r.Header.Get("X-API-Key")
			if apiKey == "" {
				log.Debug().Msg("unit auth: missing X-API-Key header")
				respondUnitAuthError(w, "API key required", http.StatusUnauthorized)
				return
			}

			// Get a connection from pool
			conn, err := pool.Acquire(r.Context())
			if err != nil {
				log.Error().Err(err).Msg("unit auth: failed to acquire connection")
				respondUnitAuthError(w, "Authentication failed", http.StatusUnauthorized)
				return
			}
			defer conn.Release()

			// Look up the unit by API key (using pooled connection)
			unit, err := storage.GetUnitByAPIKey(r.Context(), conn, apiKey)
			if err != nil {
				log.Debug().Err(err).Msg("unit auth: invalid API key")
				respondUnitAuthError(w, "Invalid API key", http.StatusUnauthorized)
				return
			}

			// Set tenant context in database session for RLS
			// Using SET LOCAL so it only applies to this connection's session.
			// The tenant_id comes from the validated unit, so it's trusted.
			_, err = conn.Exec(r.Context(), "SET LOCAL app.tenant_id = $1", unit.TenantID)
			if err != nil {
				log.Error().Err(err).Str("tenant_id", unit.TenantID).Msg("unit auth: failed to set tenant context")
				respondUnitAuthError(w, "Authentication failed", http.StatusInternalServerError)
				return
			}

			// Store connection in context for handlers
			ctx := storage.WithConn(r.Context(), conn)
			// Add unit to context
			ctx = context.WithValue(ctx, unitContextKey{}, unit)

			log.Debug().
				Str("unit_id", unit.ID).
				Str("serial", unit.Serial).
				Msg("unit auth: authenticated")

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// GetUnit retrieves the authenticated unit from the request context.
// Returns nil if no unit is in context (middleware not applied or auth failed).
func GetUnit(ctx context.Context) *storage.Unit {
	unit, ok := ctx.Value(unitContextKey{}).(*storage.Unit)
	if !ok {
		return nil
	}
	return unit
}

// RequireUnit retrieves the authenticated unit from context or panics.
// Use this only in handlers where UnitAuth middleware is guaranteed to be applied.
func RequireUnit(ctx context.Context) *storage.Unit {
	unit := GetUnit(ctx)
	if unit == nil {
		panic("RequireUnit called without UnitAuth middleware")
	}
	return unit
}

// respondUnitAuthError sends a JSON error response for unit auth errors.
func respondUnitAuthError(w http.ResponseWriter, message string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]any{
		"error": message,
		"code":  code,
	})
}
