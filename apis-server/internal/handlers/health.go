// Package handlers provides HTTP request handlers for the APIS server.
package handlers

import (
	"context"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/jermoo/apis/apis-server/internal/config"
	"github.com/rs/zerolog/log"
)

// HealthData represents the health check data.
type HealthData struct {
	Status  string            `json:"status"`  // "ok" or "degraded"
	Version string            `json:"version"` // Application version
	Checks  map[string]string `json:"checks"`  // Per-dependency status
}

// HealthResponse represents the health check response structure per CLAUDE.md format.
type HealthResponse struct {
	Data HealthData `json:"data"`
}

// Pinger is an interface for testing database health checks.
// pgxpool.Pool satisfies this interface.
type Pinger interface {
	Ping(ctx context.Context) error
}

// HealthHandler handles health check requests.
type HealthHandler struct {
	pool           Pinger
	oidcIssuer     string
	hostHeader     string
	httpClient     *http.Client
}

// NewHealthHandler creates a new health handler with the given dependencies.
// pool can be nil (will report database error), useful for testing.
// oidcIssuer is the OIDC provider (Keycloak) URL for health check.
func NewHealthHandler(pool Pinger, oidcIssuer string) *HealthHandler {
	hostHeader := ""
	if issuerEnv := os.Getenv("KEYCLOAK_ISSUER"); issuerEnv != "" {
		if u, err := url.Parse(issuerEnv); err == nil {
			hostHeader = u.Host
		}
	}
	if hostHeader == "" {
		if u, err := url.Parse(oidcIssuer); err == nil {
			hostHeader = u.Host
		}
	}

	return &HealthHandler{
		pool:       pool,
		oidcIssuer: oidcIssuer,
		hostHeader: hostHeader,
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

	// OIDC provider health check
	go func() {
		defer wg.Done()
		status := h.checkOIDCProvider(r.Context())
		mu.Lock()
		checks["oidc"] = status
		mu.Unlock()
	}()

	wg.Wait()

	// Determine overall health
	allHealthy := checks["database"] == "ok" && checks["oidc"] == "ok"

	// Build response per CLAUDE.md format: {"data": {...}}
	status := "ok"
	if !allHealthy {
		status = "degraded"
	}

	resp := HealthResponse{
		Data: HealthData{
			Status:  status,
			Version: config.Version,
			Checks:  checks,
		},
	}

	// Send response with appropriate status code
	statusCode := http.StatusOK
	if !allHealthy {
		statusCode = http.StatusServiceUnavailable
	}
	respondJSON(w, resp, statusCode)
}

// checkDatabase verifies database connectivity using a simple ping.
// SECURITY FIX (S3A-H2): Returns generic status strings only. Error details
// are logged server-side but not exposed in the API response.
func (h *HealthHandler) checkDatabase(ctx context.Context) string {
	if h.pool == nil {
		log.Warn().Msg("health: database pool not initialized")
		return "unhealthy"
	}

	// Use short timeout to prevent blocking
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	if err := h.pool.Ping(ctx); err != nil {
		log.Warn().Err(err).Msg("health: database ping failed")
		return "unhealthy"
	}

	return "ok"
}

// checkOIDCProvider verifies OIDC provider (Keycloak) connectivity by fetching
// the OIDC discovery endpoint. Uses the same endpoint as auth middleware to
// ensure consistency.
// In local auth mode, OIDC is not used so this check is skipped.
// SECURITY FIX (S3A-H2): Returns generic status strings only. Error details
// are logged server-side but not exposed in the API response.
func (h *HealthHandler) checkOIDCProvider(ctx context.Context) string {
	// Skip OIDC check in local auth mode — Keycloak is not used
	if config.AuthMode() == "local" {
		return "ok"
	}

	if h.oidcIssuer == "" {
		log.Warn().Msg("health: OIDC issuer not configured")
		return "unhealthy"
	}

	// Use short timeout to prevent blocking
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	// Use openid-configuration (same as auth middleware) for consistency
	// Trim trailing slash to prevent double-slash URLs
	discoveryURL := strings.TrimSuffix(h.oidcIssuer, "/") + "/.well-known/openid-configuration"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, discoveryURL, nil)
	if err != nil {
		log.Warn().Err(err).Str("url", discoveryURL).Msg("health: failed to create OIDC request")
		return "unhealthy"
	}
	if h.hostHeader != "" {
		req.Host = h.hostHeader
	}

	resp, err := h.httpClient.Do(req)
	if err != nil {
		log.Warn().Err(err).Str("url", discoveryURL).Msg("health: OIDC provider check failed")
		return "unhealthy"
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Warn().
			Int("status", resp.StatusCode).
			Str("url", discoveryURL).
			Msg("health: OIDC provider returned non-200")
		return "unhealthy"
	}

	return "ok"
}
