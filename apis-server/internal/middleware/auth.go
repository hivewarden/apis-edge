// Package middleware provides HTTP middleware for the APIS server.
package middleware

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/go-jose/go-jose/v4"
	"github.com/go-jose/go-jose/v4/jwt"
	"github.com/rs/zerolog/log"

	"github.com/jermoo/apis/apis-server/internal/auth"
	"github.com/jermoo/apis/apis-server/internal/config"
	"github.com/jermoo/apis/apis-server/internal/storage"
)

// Claims represents the authenticated user's claims extracted from JWT.
// This struct is used by both local authentication and Keycloak (SaaS) modes.
type Claims struct {
	// UserID is the subject claim (sub) - unique user identifier
	UserID string `json:"sub"`
	// OrgID is the organization/tenant ID from Keycloak claims.
	// In local mode, this is populated from TenantID for backward compatibility.
	OrgID string `json:"org_id"`
	// TenantID is the tenant identifier for local authentication mode.
	// In SaaS mode, this mirrors OrgID for consistent access.
	TenantID string `json:"tenant_id"`
	// Email is the user's email address
	Email string `json:"email"`
	// Name is the user's display name
	Name string `json:"name"`
	// Role is the user's primary role (single role for local mode).
	// In SaaS mode, this is the first role from the Roles array.
	Role string `json:"role"`
	// Roles contains the user's assigned roles
	Roles []string `json:"roles"`
	// ImpersonatorID is set when a super-admin is impersonating this tenant.
	// Contains the original super-admin's user ID for audit purposes.
	ImpersonatorID string `json:"impersonator_id,omitempty"`
	// Impersonating is true when this session is an impersonation session.
	Impersonating bool `json:"impersonating,omitempty"`
	// OriginalTenantID is the super-admin's original tenant ID during impersonation.
	OriginalTenantID string `json:"original_tenant_id,omitempty"`
}

// RealmAccess represents the nested role structure in Keycloak JWTs.
// Keycloak places realm-level roles under the "realm_access" claim
// as a nested object with a "roles" array.
type RealmAccess struct {
	Roles []string `json:"roles"`
}

// KeycloakClaims represents the JWT claims structure from Keycloak.
// AI/LLM Context: This struct is used only in SaaS mode (AUTH_MODE=keycloak).
// The custom claims (org_id, org_name) are added via Keycloak protocol mappers
// configured in the honeybee realm.
type KeycloakClaims struct {
	jwt.Claims
	Email            string      `json:"email,omitempty"`
	EmailVerified    bool        `json:"email_verified,omitempty"`
	Name             string      `json:"name,omitempty"`
	PreferredUsername string     `json:"preferred_username,omitempty"`
	OrgID            string      `json:"org_id,omitempty"`
	OrgName          string      `json:"org_name,omitempty"`
	RealmAccess      RealmAccess `json:"realm_access,omitempty"`
}

// ctxKey is a custom type for context keys to avoid collisions.
type ctxKey string

// ClaimsKey is the context key for storing authenticated claims.
const ClaimsKey ctxKey = "claims"

// jwksCache stores the cached JWKS for token validation.
type jwksCache struct {
	mu               sync.RWMutex
	keySet           *jose.JSONWebKeySet
	lastFetch        time.Time
	lastForceRefresh time.Time
	cacheTTL         time.Duration
	discoveryBaseURL string
	discoveryURL     string
	hostHeader       string
	httpClient       *http.Client
}

// newJWKSCache creates a new JWKS cache with the specified TTL.
func newJWKSCache(discoveryBaseURL, hostHeader string, cacheTTL time.Duration) *jwksCache {
	// Construct discovery URL from the provided base URL.
	// This allows separating the expected token issuer (e.g. http://localhost:8080)
	// from the URL the server can reach inside Docker networking (e.g. http://keycloak:8080).
	discoveryBaseURL = strings.TrimSuffix(discoveryBaseURL, "/")
	discoveryURL := discoveryBaseURL + "/.well-known/openid-configuration"

	return &jwksCache{
		discoveryBaseURL: discoveryBaseURL,
		discoveryURL:     discoveryURL,
		cacheTTL:         cacheTTL,
		hostHeader:       hostHeader,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// discoveryResponse represents the OIDC discovery document.
type discoveryResponse struct {
	JWKSURI string `json:"jwks_uri"`
	Issuer  string `json:"issuer"`
}

// getKeySet returns the cached JWKS, refreshing if expired.
func (c *jwksCache) getKeySet(ctx context.Context) (*jose.JSONWebKeySet, error) {
	c.mu.RLock()
	if c.keySet != nil && time.Since(c.lastFetch) < c.cacheTTL {
		ks := c.keySet
		c.mu.RUnlock()
		return ks, nil
	}
	c.mu.RUnlock()

	// Need to refresh - acquire write lock
	c.mu.Lock()
	defer c.mu.Unlock()

	// Double-check after acquiring write lock
	if c.keySet != nil && time.Since(c.lastFetch) < c.cacheTTL {
		return c.keySet, nil
	}

	// Fetch discovery document
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.discoveryURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create discovery request: %w", err)
	}
	if c.hostHeader != "" {
		req.Host = c.hostHeader
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch discovery document: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("discovery document returned status %d", resp.StatusCode)
	}

	var discovery discoveryResponse
	if err := json.NewDecoder(resp.Body).Decode(&discovery); err != nil {
		return nil, fmt.Errorf("decode discovery document: %w", err)
	}

	// Fetch JWKS
	jwksURI := discovery.JWKSURI
	if parsedJWKS, err := url.Parse(discovery.JWKSURI); err == nil {
		if base, err := url.Parse(c.discoveryBaseURL); err == nil && base.Host != "" {
			parsedJWKS.Scheme = base.Scheme
			parsedJWKS.Host = base.Host
			jwksURI = parsedJWKS.String()
		}
	}

	jwksReq, err := http.NewRequestWithContext(ctx, http.MethodGet, jwksURI, nil)
	if err != nil {
		return nil, fmt.Errorf("create JWKS request: %w", err)
	}
	if c.hostHeader != "" {
		jwksReq.Host = c.hostHeader
	}

	jwksResp, err := c.httpClient.Do(jwksReq)
	if err != nil {
		return nil, fmt.Errorf("fetch JWKS: %w", err)
	}
	defer jwksResp.Body.Close()

	if jwksResp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("JWKS returned status %d", jwksResp.StatusCode)
	}

	var keySet jose.JSONWebKeySet
	if err := json.NewDecoder(jwksResp.Body).Decode(&keySet); err != nil {
		return nil, fmt.Errorf("decode JWKS: %w", err)
	}

	c.keySet = &keySet
	c.lastFetch = time.Now()

	log.Debug().
		Str("jwks_uri", jwksURI).
		Int("keys_count", len(keySet.Keys)).
		Msg("JWKS cache refreshed")

	return c.keySet, nil
}

// getKeyForKID returns the JWKS, forcing a refresh if the specified kid is not found.
// This handles key rotation: when Keycloak rotates keys, the server may receive
// a JWT signed with a new kid that's not yet in the cached JWKS. A force-refresh
// (rate-limited to once per 30 seconds) fetches the updated JWKS.
func (c *jwksCache) getKeyForKID(ctx context.Context, kid string) (*jose.JSONWebKeySet, error) {
	ks, err := c.getKeySet(ctx)
	if err != nil {
		return nil, err
	}

	// If no kid specified or kid is found, return as-is
	if kid == "" || len(ks.Key(kid)) > 0 {
		return ks, nil
	}

	// kid not found — try a force-refresh (rate-limited)
	c.mu.Lock()
	if time.Since(c.lastForceRefresh) <= 30*time.Second {
		// Rate-limited: return stale keyset
		c.mu.Unlock()
		log.Debug().Str("kid", kid).Msg("JWKS kid not found, force-refresh rate-limited")
		return ks, nil
	}
	c.lastForceRefresh = time.Now()
	c.lastFetch = time.Time{} // zero to force expiry
	c.mu.Unlock()

	log.Info().Str("kid", kid).Msg("JWKS kid not found, forcing cache refresh")
	return c.getKeySet(ctx)
}

// selectPrimaryRole deterministically selects the highest-priority role from a list.
// Priority order: admin > user > viewer. If no recognized role is found, returns
// the first role. Returns empty string for empty input.
// CRITICAL: Claims.Role is used for authorization decisions in handlers
// (e.g., settings_beebrain.go, users.go), not just display.
func selectPrimaryRole(roles []string) string {
	priority := map[string]int{"admin": 3, "user": 2, "viewer": 1}
	best, bestPri := "", -1
	for _, r := range roles {
		if pri, ok := priority[r]; ok && pri > bestPri {
			best, bestPri = r, pri
		}
	}
	if best == "" && len(roles) > 0 {
		return roles[0]
	}
	return best
}

// ErrMissingIssuer is returned when KEYCLOAK_ISSUER is not configured.
var ErrMissingIssuer = fmt.Errorf("KEYCLOAK_ISSUER environment variable is required")

// ErrMissingClientID is returned when KEYCLOAK_CLIENT_ID is not configured.
var ErrMissingClientID = fmt.Errorf("KEYCLOAK_CLIENT_ID environment variable is required")

// NewAuthMiddleware creates JWT validation middleware for Keycloak tokens.
// It validates the token signature using the issuer's JWKS and extracts claims.
//
// Parameters:
//   - issuer: The Keycloak instance URL (e.g., "http://localhost:8080")
//   - clientID: The application's client ID for audience validation
//
// The middleware:
//   - Extracts Bearer token from Authorization header
//   - Validates token signature against JWKS (cached for 1 hour)
//   - Verifies token expiration and audience
//   - Extracts claims and adds them to request context
//
// Returns an error if issuer or clientID are empty. This allows the caller
// to handle configuration errors gracefully during startup.
//
// On authentication failure, returns 401 Unauthorized with JSON error body.
func NewAuthMiddleware(issuer, clientID string) (func(http.Handler) http.Handler, error) {
	return NewAuthMiddlewareWithDiscovery(issuer, issuer, clientID)
}

// NewAuthMiddlewareWithDiscovery creates the same middleware as NewAuthMiddleware but allows
// separating the token issuer from the URL used to fetch OIDC discovery and JWKS.
//
// This is necessary when the issuer is only reachable from the browser (e.g. http://localhost:8080),
// but the server runs inside Docker and must use a different hostname to reach Keycloak (e.g. http://keycloak:8080).
func NewAuthMiddlewareWithDiscovery(issuer, discoveryBaseURL, clientID string) (func(http.Handler) http.Handler, error) {
	if issuer == "" {
		return nil, ErrMissingIssuer
	}
	if discoveryBaseURL == "" {
		discoveryBaseURL = issuer
	}
	if clientID == "" {
		return nil, ErrMissingClientID
	}

	hostHeader := ""
	if u, err := url.Parse(issuer); err == nil {
		hostHeader = u.Host
	}

	// Initialize JWKS cache with 1-hour TTL
	cache := newJWKSCache(discoveryBaseURL, hostHeader, time.Hour)

	return createAuthMiddleware(cache, issuer, clientID), nil
}

// AuthMiddleware creates JWT validation middleware for Keycloak tokens.
// DEPRECATED: Use NewAuthMiddleware instead for graceful error handling.
// This function calls log.Fatal() on missing configuration which prevents
// graceful shutdown. It is kept for backwards compatibility.
func AuthMiddleware(issuer, clientID string) func(http.Handler) http.Handler {
	middleware, err := NewAuthMiddleware(issuer, clientID)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to create auth middleware")
	}
	return middleware
}

// createAuthMiddleware creates the actual middleware handler.
func createAuthMiddleware(cache *jwksCache, issuer, clientID string) func(http.Handler) http.Handler {

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Extract Authorization header
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				log.Debug().
					Str("path", r.URL.Path).
					Msg("Missing authentication token")
				respondErrorJSON(w, "Authentication required", http.StatusUnauthorized)
				return
			}

			// Validate Bearer token format
			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
				log.Debug().
					Str("path", r.URL.Path).
					Msg("Invalid authorization header format")
				respondErrorJSON(w, "invalid authorization header format", http.StatusUnauthorized)
				return
			}
			tokenString := parts[1]

			// Parse the JWT first to extract kid for targeted JWKS lookup
			token, err := jwt.ParseSigned(tokenString, []jose.SignatureAlgorithm{jose.RS256, jose.ES256})
			if err != nil {
				log.Debug().
					Err(err).
					Str("path", r.URL.Path).
					Msg("Failed to parse JWT")
				respondErrorJSON(w, "invalid token format", http.StatusUnauthorized)
				return
			}

			// Extract kid from token header for targeted key lookup
			var kid string
			if len(token.Headers) > 0 {
				kid = token.Headers[0].KeyID
			}

			// Get JWKS for validation, with kid-aware refresh
			keySet, err := cache.getKeyForKID(r.Context(), kid)
			if err != nil {
				log.Error().Err(err).Msg("Failed to get JWKS")
				respondErrorJSON(w, "authentication service unavailable", http.StatusUnauthorized)
				return
			}

			// Find the key to verify with
			var claims KeycloakClaims
			var verified bool

			// If kid is specified, only try matching keys for efficiency
			if kid != "" {
				for _, key := range keySet.Key(kid) {
					if err := token.Claims(key, &claims); err == nil {
						verified = true
						break
					}
				}
			}
			// Fallback: try all keys (handles tokens without kid)
			if !verified {
				for _, key := range keySet.Keys {
					if err := token.Claims(key, &claims); err == nil {
						verified = true
						break
					}
				}
			}

			if !verified {
				log.Debug().
					Str("path", r.URL.Path).
					Msg("JWT signature verification failed")
				respondErrorJSON(w, "invalid token signature", http.StatusUnauthorized)
				return
			}

			// Verify standard claims including audience
			expectedClaims := jwt.Expected{
				Issuer:      issuer,
				AnyAudience: jwt.Audience{clientID},
				Time:        time.Now(),
			}

			if err := claims.Claims.Validate(expectedClaims); err != nil {
				log.Debug().
					Err(err).
					Str("path", r.URL.Path).
					Msg("JWT claims validation failed")
				respondErrorJSON(w, "invalid token claims", http.StatusUnauthorized)
				return
			}

			// Validate required claims for multi-tenant security
			if validationErr := ValidateRequiredClaims(&claims); validationErr != "" {
				log.Debug().
					Str("path", r.URL.Path).
					Str("user_id", claims.Subject).
					Str("validation_error", validationErr).
					Msg("JWT claims validation failed")
				respondErrorJSON(w, validationErr, http.StatusUnauthorized)
				return
			}

			// Derive primary role from realm_access.roles
			// Keycloak places realm-level roles in a nested "realm_access" object.
			// Uses deterministic priority selection (admin>user>viewer) instead of
			// relying on array order, since Claims.Role is used for authorization.
			roles := claims.RealmAccess.Roles
			primaryRole := selectPrimaryRole(roles)

			// Extract user claims
			// Populate both OrgID and TenantID for consistency with local mode
			userClaims := &Claims{
				UserID:   claims.Subject,
				OrgID:    claims.OrgID,
				TenantID: claims.OrgID, // Mirror OrgID for consistent access
				Email:    claims.Email,
				Name:     claims.Name,
				Role:     primaryRole,
				Roles:    roles,
			}

			// Use preferred_username as fallback for name
			if userClaims.Name == "" {
				userClaims.Name = claims.PreferredUsername
			}

			// Log successful authentication (without token)
			log.Info().
				Str("user_id", userClaims.UserID).
				Str("tenant_id", userClaims.TenantID).
				Str("auth_mode", "keycloak").
				Str("path", r.URL.Path).
				Str("method", r.Method).
				Msg("Request authenticated")

			// Add claims to context
			ctx := context.WithValue(r.Context(), ClaimsKey, userClaims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// ValidateRequiredClaims checks that all required claims are present for multi-tenant security.
// Returns an error message if validation fails, empty string if valid.
func ValidateRequiredClaims(claims *KeycloakClaims) string {
	if claims.Subject == "" {
		return "invalid token: missing user identity"
	}
	if claims.OrgID == "" {
		log.Warn().Str("user_id", claims.Subject).
			Msg("Keycloak token missing org_id claim — will attempt fallback in tenant middleware")
	}
	return ""
}

// GetClaims retrieves the authenticated user's claims from the request context.
// Returns nil if the request is not authenticated.
func GetClaims(ctx context.Context) *Claims {
	claims, _ := ctx.Value(ClaimsKey).(*Claims)
	return claims
}

// RequireClaims is a helper that returns the claims or panics if not authenticated.
// Use this only in handlers that are protected by AuthMiddleware.
func RequireClaims(ctx context.Context) *Claims {
	claims := GetClaims(ctx)
	if claims == nil {
		panic("RequireClaims called on unauthenticated request")
	}
	return claims
}

// DevAuthMiddleware returns a middleware that bypasses authentication and injects mock claims.
// DEV MODE ONLY - This should NEVER be used in production!
// It allows accessing all protected endpoints without authentication setup.
func DevAuthMiddleware() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// DEV MODE: Injecting mock claims - authentication is bypassed!
			mockClaims := &Claims{
				UserID:   "dev-user-001",
				OrgID:    "00000000-0000-0000-0000-000000000000",
				TenantID: "00000000-0000-0000-0000-000000000000",
				Email:    "dev@apis.local",
				Name:     "Dev User",
				Role:     "admin",
				Roles:    []string{"admin"},
			}

			log.Debug().
				Str("path", r.URL.Path).
				Str("method", r.Method).
				Msg("DEV MODE: Request authenticated with mock claims")

			ctx := context.WithValue(r.Context(), ClaimsKey, mockClaims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// LocalAuthMiddleware creates JWT validation middleware for local authentication mode.
// It validates HS256-signed JWTs created by the local login system.
//
// Token extraction order:
// 1. apis_session cookie (for browser requests)
// 2. Authorization: Bearer header (for API clients)
//
// On successful validation, claims are added to the request context.
// On failure, returns 401 Unauthorized with JSON error body.
func LocalAuthMiddleware() func(http.Handler) http.Handler {
	secret := config.JWTSecret()

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Extract token from cookie or header
			var cookieValue string
			if cookie, err := r.Cookie("apis_session"); err == nil {
				cookieValue = cookie.Value
			}
			authHeader := r.Header.Get("Authorization")

			tokenString, found := auth.ExtractTokenFromCookieOrHeader(cookieValue, authHeader)
			if !found {
				log.Debug().
					Str("path", r.URL.Path).
					Msg("Missing authentication token")
				respondErrorJSON(w, "Authentication required", http.StatusUnauthorized)
				return
			}

			// Validate the token
			localClaims, err := auth.ValidateLocalJWT(tokenString, secret)
			if err != nil {
				log.Debug().
					Err(err).
					Str("path", r.URL.Path).
					Msg("JWT validation failed")

				// Map error to appropriate response message
				var message string
				switch {
				case errors.Is(err, auth.ErrTokenExpired):
					message = "Token expired"
				case errors.Is(err, auth.ErrMissingClaims):
					message = "Invalid token"
				case errors.Is(err, auth.ErrInvalidAlgorithm):
					message = "Invalid token"
				default:
					message = "Invalid token"
				}
				respondErrorJSON(w, message, http.StatusUnauthorized)
				return
			}

			// Check if token has been revoked (e.g., after logout or password change)
			revStore := storage.GetRevocationStore()
			if localClaims.ID != "" && revStore.IsRevoked(localClaims.ID) {
				log.Debug().
					Str("jti", localClaims.ID).
					Str("path", r.URL.Path).
					Msg("Token has been revoked")
				respondErrorJSON(w, "Token revoked", http.StatusUnauthorized)
				return
			}
			// Check if all tokens for this user have been revoked (e.g., after password change)
			if localClaims.IssuedAt != nil && revStore.IsUserRevoked(localClaims.Subject, localClaims.IssuedAt.Time()) {
				log.Debug().
					Str("user_id", localClaims.Subject).
					Str("path", r.URL.Path).
					Msg("All tokens for user have been revoked")
				respondErrorJSON(w, "Token revoked", http.StatusUnauthorized)
				return
			}

			// Convert to middleware Claims struct
			// Populate both OrgID and TenantID for backward compatibility
			var roles []string
			if localClaims.Role != "" {
				roles = []string{localClaims.Role}
			}
			userClaims := &Claims{
				UserID:           localClaims.Subject,
				OrgID:            localClaims.TenantID, // Backward compatibility: handlers using OrgID still work
				TenantID:         localClaims.TenantID,
				Email:            localClaims.Email,
				Name:             localClaims.Name,
				Role:             localClaims.Role,
				Roles:            roles,
				ImpersonatorID:   localClaims.ImpersonatorID,
				Impersonating:    localClaims.Impersonating,
				OriginalTenantID: localClaims.OriginalTenantID,
			}

			// Log successful authentication
			logEvent := log.Info().
				Str("user_id", userClaims.UserID).
				Str("tenant_id", userClaims.TenantID).
				Str("auth_mode", "local").
				Str("path", r.URL.Path).
				Str("method", r.Method)

			// Add impersonation context to log if applicable
			if userClaims.Impersonating {
				logEvent = logEvent.
					Bool("impersonating", true).
					Str("impersonator_id", userClaims.ImpersonatorID).
					Str("original_tenant_id", userClaims.OriginalTenantID)
			}
			logEvent.Msg("Request authenticated")

			// Add claims to context
			ctx := context.WithValue(r.Context(), ClaimsKey, userClaims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// NewModeAwareAuthMiddleware creates the appropriate authentication middleware based on
// the current AUTH_MODE configuration.
//
// Mode selection:
// - DISABLE_AUTH=true: Returns DevAuthMiddleware (bypasses all auth)
// - AUTH_MODE=local: Returns LocalAuthMiddleware (validates HS256 JWTs)
// - AUTH_MODE=keycloak: Returns Keycloak middleware (validates RS256 JWTs via JWKS)
//
// This function should be called once at startup. It reads configuration from
// environment variables via the config package.
//
// For SaaS mode, the keycloakIssuer and keycloakClientID parameters are used.
// For local mode, these parameters are ignored.
//
// SECURITY: If DISABLE_AUTH=true in production (GO_ENV=production), this function
// will panic to prevent accidental deployment with authentication disabled.
// Additionally, I_UNDERSTAND_AUTH_DISABLED=yes must be set to acknowledge the risk.
func NewModeAwareAuthMiddleware(keycloakIssuer, keycloakDiscoveryURL, keycloakClientID string) (func(http.Handler) http.Handler, error) {
	// Check for dev mode first (highest priority)
	if config.IsAuthDisabled() {
		// SECURITY FIX (AUTH-001-1): Prevent auth bypass in production environments
		goEnv := strings.ToLower(strings.TrimSpace(os.Getenv("GO_ENV")))
		if goEnv != "development" && goEnv != "test" {
			// Critical security violation: authentication cannot be disabled in production
			log.Fatal().
				Str("GO_ENV", goEnv).
				Msg("SECURITY VIOLATION: DISABLE_AUTH=true is not allowed when GO_ENV=production. " +
					"Remove DISABLE_AUTH or change GO_ENV to continue.")
			panic("SECURITY VIOLATION: Cannot disable authentication in production environment")
		}

		// SECURITY FIX (AUTH-001-1): Require explicit acknowledgment of security risk
		ackEnv := os.Getenv("I_UNDERSTAND_AUTH_DISABLED")
		if ackEnv != "yes" {
			log.Fatal().
				Msg("SECURITY: DISABLE_AUTH=true requires explicit acknowledgment. " +
					"Set I_UNDERSTAND_AUTH_DISABLED=yes to confirm you understand the security implications.")
			panic("DISABLE_AUTH requires I_UNDERSTAND_AUTH_DISABLED=yes acknowledgment")
		}

		// Log prominent warning about disabled authentication
		log.Warn().
			Str("GO_ENV", goEnv).
			Msg("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
		log.Warn().
			Msg("!! SECURITY WARNING: Authentication is DISABLED                !!")
		log.Warn().
			Msg("!! All requests will be authenticated with mock dev credentials !!")
		log.Warn().
			Msg("!! DO NOT use this configuration in production!                 !!")
		log.Warn().
			Msg("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")

		return DevAuthMiddleware(), nil
	}

	// Local mode: Use local JWT validation
	if config.IsLocalAuth() {
		log.Info().Msg("Local auth mode: Using LocalAuthMiddleware with HS256 JWT validation")
		return LocalAuthMiddleware(), nil
	}

	// SaaS mode: Use Keycloak OIDC authentication
	log.Info().
		Str("issuer", keycloakIssuer).
		Bool("client_id_set", keycloakClientID != "").
		Msg("SaaS auth mode: Using Keycloak JWKS validation")

	return NewAuthMiddlewareWithDiscovery(keycloakIssuer, keycloakDiscoveryURL, keycloakClientID)
}
