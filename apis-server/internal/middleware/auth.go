// Package middleware provides HTTP middleware for the APIS server.
package middleware

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/go-jose/go-jose/v4"
	"github.com/go-jose/go-jose/v4/jwt"
	"github.com/rs/zerolog/log"
)

// Claims represents the authenticated user's claims extracted from JWT.
type Claims struct {
	// UserID is the subject claim (sub) - unique user identifier
	UserID string `json:"sub"`
	// OrgID is the organization/tenant ID from Zitadel claims
	OrgID string `json:"org_id"`
	// Email is the user's email address
	Email string `json:"email"`
	// Name is the user's display name
	Name string `json:"name"`
	// Roles contains the user's assigned roles
	Roles []string `json:"roles"`
}

// ZitadelClaims represents the JWT claims structure from Zitadel.
type ZitadelClaims struct {
	jwt.Claims
	Email             string   `json:"email,omitempty"`
	EmailVerified     bool     `json:"email_verified,omitempty"`
	Name              string   `json:"name,omitempty"`
	PreferredUsername string   `json:"preferred_username,omitempty"`
	OrgID             string   `json:"urn:zitadel:iam:org:id,omitempty"`
	OrgName           string   `json:"urn:zitadel:iam:org:name,omitempty"`
	Roles             []string `json:"urn:zitadel:iam:user:roles,omitempty"`
}

// ctxKey is a custom type for context keys to avoid collisions.
type ctxKey string

// ClaimsKey is the context key for storing authenticated claims.
const ClaimsKey ctxKey = "claims"

// jwksCache stores the cached JWKS for token validation.
type jwksCache struct {
	mu         sync.RWMutex
	keySet     *jose.JSONWebKeySet
	lastFetch  time.Time
	cacheTTL   time.Duration
	jwksURL    string
	httpClient *http.Client
}

// newJWKSCache creates a new JWKS cache with the specified TTL.
func newJWKSCache(issuer string, cacheTTL time.Duration) *jwksCache {
	// Construct JWKS URL from issuer
	jwksURL := strings.TrimSuffix(issuer, "/") + "/.well-known/openid-configuration"

	return &jwksCache{
		jwksURL:  jwksURL,
		cacheTTL: cacheTTL,
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
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.jwksURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create discovery request: %w", err)
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
	jwksReq, err := http.NewRequestWithContext(ctx, http.MethodGet, discovery.JWKSURI, nil)
	if err != nil {
		return nil, fmt.Errorf("create JWKS request: %w", err)
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
		Str("jwks_uri", discovery.JWKSURI).
		Int("keys_count", len(keySet.Keys)).
		Msg("JWKS cache refreshed")

	return c.keySet, nil
}

// ErrMissingIssuer is returned when ZITADEL_ISSUER is not configured.
var ErrMissingIssuer = fmt.Errorf("ZITADEL_ISSUER environment variable is required")

// ErrMissingClientID is returned when ZITADEL_CLIENT_ID is not configured.
var ErrMissingClientID = fmt.Errorf("ZITADEL_CLIENT_ID environment variable is required")

// NewAuthMiddleware creates JWT validation middleware for Zitadel tokens.
// It validates the token signature using the issuer's JWKS and extracts claims.
//
// Parameters:
//   - issuer: The Zitadel instance URL (e.g., "http://localhost:8080")
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
	if issuer == "" {
		return nil, ErrMissingIssuer
	}
	if clientID == "" {
		return nil, ErrMissingClientID
	}

	// Initialize JWKS cache with 1-hour TTL
	cache := newJWKSCache(issuer, time.Hour)

	return createAuthMiddleware(cache, issuer, clientID), nil
}

// AuthMiddleware creates JWT validation middleware for Zitadel tokens.
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
					Msg("Missing authorization header")
				respondUnauthorized(w, "missing authorization header")
				return
			}

			// Validate Bearer token format
			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
				log.Debug().
					Str("path", r.URL.Path).
					Msg("Invalid authorization header format")
				respondUnauthorized(w, "invalid authorization header format")
				return
			}
			tokenString := parts[1]

			// Get JWKS for validation
			keySet, err := cache.getKeySet(r.Context())
			if err != nil {
				log.Error().Err(err).Msg("Failed to get JWKS")
				respondUnauthorized(w, "authentication service unavailable")
				return
			}

			// Parse the JWT
			token, err := jwt.ParseSigned(tokenString, []jose.SignatureAlgorithm{jose.RS256, jose.ES256})
			if err != nil {
				log.Debug().
					Err(err).
					Str("path", r.URL.Path).
					Msg("Failed to parse JWT")
				respondUnauthorized(w, "invalid token format")
				return
			}

			// Find the key to verify with
			var claims ZitadelClaims
			var verified bool
			for _, key := range keySet.Keys {
				if err := token.Claims(key, &claims); err == nil {
					verified = true
					break
				}
			}

			if !verified {
				log.Debug().
					Str("path", r.URL.Path).
					Msg("JWT signature verification failed")
				respondUnauthorized(w, "invalid token signature")
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
				respondUnauthorized(w, "invalid token claims")
				return
			}

			// Validate required claims for multi-tenant security
			if validationErr := ValidateRequiredClaims(&claims); validationErr != "" {
				log.Debug().
					Str("path", r.URL.Path).
					Str("user_id", claims.Subject).
					Str("validation_error", validationErr).
					Msg("JWT claims validation failed")
				respondUnauthorized(w, validationErr)
				return
			}

			// Extract user claims
			userClaims := &Claims{
				UserID: claims.Subject,
				OrgID:  claims.OrgID,
				Email:  claims.Email,
				Name:   claims.Name,
				Roles:  claims.Roles,
			}

			// Use preferred_username as fallback for name
			if userClaims.Name == "" {
				userClaims.Name = claims.PreferredUsername
			}

			// Log successful authentication (without token)
			log.Info().
				Str("user_id", userClaims.UserID).
				Str("org_id", userClaims.OrgID).
				Str("path", r.URL.Path).
				Str("method", r.Method).
				Msg("Request authenticated")

			// Add claims to context
			ctx := context.WithValue(r.Context(), ClaimsKey, userClaims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// respondUnauthorized sends a 401 response with JSON error body.
func respondUnauthorized(w http.ResponseWriter, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	json.NewEncoder(w).Encode(map[string]any{
		"error": message,
		"code":  http.StatusUnauthorized,
	})
}

// ValidateRequiredClaims checks that all required claims are present for multi-tenant security.
// Returns an error message if validation fails, empty string if valid.
func ValidateRequiredClaims(claims *ZitadelClaims) string {
	if claims.Subject == "" {
		return "invalid token: missing user identity"
	}
	if claims.OrgID == "" {
		return "invalid token: missing organization"
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
