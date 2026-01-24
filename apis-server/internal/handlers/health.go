// Package handlers provides HTTP request handlers for the APIS server.
package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/jermoo/apis/apis-server/internal/config"
	"github.com/rs/zerolog/log"
)

// HealthResponse represents the health check response structure.
type HealthResponse struct {
	Status  string            `json:"status"`  // "ok" or "degraded"
	Version string            `json:"version"` // Application version
	Checks  map[string]string `json:"checks"`  // Per-dependency status
}

// Pinger is an interface for testing database health checks.
// pgxpool.Pool satisfies this interface.
type Pinger interface {
	Ping(ctx context.Context) error
}

// HealthHandler handles health check requests.
type HealthHandler struct {
	pool          Pinger
	zitadelIssuer string
	httpClient    *http.Client
}

// NewHealthHandler creates a new health handler with the given dependencies.
// pool can be nil (will report database error), useful for testing.
// zitadelIssuer is the Zitadel instance URL for OIDC health check.
func NewHealthHandler(pool Pinger, zitadelIssuer string) *HealthHandler {
	return &HealthHandler{
		pool:          pool,
		zitadelIssuer: zitadelIssuer,
		httpClient: &http.Client{
			Timeout: 5 * time.Second,
		},
	}
}

// ServeHTTP handles the health check request.
func (h *HealthHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	checks := make(map[string]string)
	var mu sync.Mutex
	var wg sync.WaitGroup

	// Run health checks in parallel for faster response
	wg.Add(2)

	// Database health check
	go func() {
		defer wg.Done()
		status := h.checkDatabase(r.Context())
		mu.Lock()
		checks["database"] = status
		mu.Unlock()
	}()

	// Zitadel health check
	go func() {
		defer wg.Done()
		status := h.checkZitadel(r.Context())
		mu.Lock()
		checks["zitadel"] = status
		mu.Unlock()
	}()

	wg.Wait()

	// Determine overall health
	allHealthy := checks["database"] == "ok" && checks["zitadel"] == "ok"

	// Build response
	resp := HealthResponse{
		Status:  "ok",
		Version: config.Version,
		Checks:  checks,
	}

	if !allHealthy {
		resp.Status = "degraded"
	}

	// Set response headers and status code
	w.Header().Set("Content-Type", "application/json")
	if allHealthy {
		w.WriteHeader(http.StatusOK)
	} else {
		w.WriteHeader(http.StatusServiceUnavailable)
	}

	// Encode response
	if err := json.NewEncoder(w).Encode(resp); err != nil {
		log.Error().Err(err).Msg("handler: failed to encode health response")
	}
}

// checkDatabase verifies database connectivity using a simple ping.
// Returns "ok" on success or "error: <message>" on failure.
func (h *HealthHandler) checkDatabase(ctx context.Context) string {
	if h.pool == nil {
		return "error: database pool not initialized"
	}

	// Use short timeout to prevent blocking
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	if err := h.pool.Ping(ctx); err != nil {
		log.Warn().Err(err).Msg("health: database ping failed")
		return "error: " + err.Error()
	}

	return "ok"
}

// checkZitadel verifies Zitadel connectivity by fetching the OIDC discovery endpoint.
// Uses the same endpoint as auth middleware to ensure consistency.
// Returns "ok" on success or "error: <message>" on failure.
func (h *HealthHandler) checkZitadel(ctx context.Context) string {
	if h.zitadelIssuer == "" {
		return "error: zitadel issuer not configured"
	}

	// Use short timeout to prevent blocking
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	// Use openid-configuration (same as auth middleware) for consistency
	// Trim trailing slash to prevent double-slash URLs
	discoveryURL := strings.TrimSuffix(h.zitadelIssuer, "/") + "/.well-known/openid-configuration"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, discoveryURL, nil)
	if err != nil {
		return "error: " + err.Error()
	}

	resp, err := h.httpClient.Do(req)
	if err != nil {
		log.Warn().Err(err).Str("url", discoveryURL).Msg("health: zitadel check failed")
		return "error: " + err.Error()
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		msg := fmt.Sprintf("error: HTTP %d", resp.StatusCode)
		log.Warn().
			Int("status", resp.StatusCode).
			Str("url", discoveryURL).
			Msg("health: zitadel returned non-200")
		return msg
	}

	return "ok"
}
