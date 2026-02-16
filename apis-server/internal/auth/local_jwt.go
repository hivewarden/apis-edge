// Package auth provides authentication utilities for the APIS server.
package auth

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/go-jose/go-jose/v4"
	"github.com/go-jose/go-jose/v4/jwt"
	"github.com/google/uuid"
)

// Local JWT validation errors
var (
	// ErrInvalidToken is returned when the token is malformed or signature is invalid.
	ErrInvalidToken = errors.New("auth: invalid token")
	// ErrTokenExpired is returned when the token's exp claim is in the past.
	ErrTokenExpired = errors.New("auth: token expired")
	// ErrMissingClaims is returned when required claims are missing from the token.
	ErrMissingClaims = errors.New("auth: missing required claims")
	// ErrInvalidAlgorithm is returned when the token uses an unsupported algorithm (e.g., RS256 in local mode).
	ErrInvalidAlgorithm = errors.New("auth: invalid algorithm")
)

// LocalClaims represents the claims structure for local mode JWTs.
// These JWTs are created by the server for authenticated users.
type LocalClaims struct {
	jwt.Claims
	// TenantID is the tenant/organization identifier (fixed in local mode).
	TenantID string `json:"tenant_id"`
	// Email is the user's email address.
	Email string `json:"email"`
	// Name is the user's display name.
	Name string `json:"name"`
	// Role is the user's role (admin, user, etc.).
	Role string `json:"role"`
	// ImpersonatorID is set when a super-admin is impersonating this tenant.
	// It contains the original super-admin's user ID for audit purposes.
	ImpersonatorID string `json:"impersonator_id,omitempty"`
	// Impersonating is true when this JWT represents an impersonation session.
	Impersonating bool `json:"impersonating,omitempty"`
	// OriginalTenantID is the super-admin's original tenant ID during impersonation.
	OriginalTenantID string `json:"original_tenant_id,omitempty"`
}

// ValidateLocalJWT validates a local mode JWT token and extracts claims.
// It verifies:
// - The token is properly formatted
// - The signature is valid using HS256 algorithm with the provided secret
// - The token has not expired (exp claim)
// - All required claims are present
//
// Only HS256 algorithm is accepted to prevent algorithm confusion attacks.
// RS256 tokens (e.g., from Keycloak) will be rejected with ErrInvalidAlgorithm.
func ValidateLocalJWT(tokenString, secret string) (*LocalClaims, error) {
	if tokenString == "" {
		return nil, ErrInvalidToken
	}
	if secret == "" {
		return nil, fmt.Errorf("%w: secret cannot be empty", ErrInvalidToken)
	}

	// Parse the JWT accepting common algorithms, then verify HS256 was used.
	// This avoids a double-parse while still distinguishing algorithm mismatches
	// from malformed tokens.
	supportedAlgs := []jose.SignatureAlgorithm{jose.HS256, jose.RS256, jose.ES256, jose.HS384, jose.HS512}
	token, err := jwt.ParseSigned(tokenString, supportedAlgs)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidToken, err)
	}

	// Enforce HS256-only policy: reject tokens signed with other algorithms.
	// This prevents algorithm confusion attacks where an attacker might try to use
	// RS256 (asymmetric) with a crafted key.
	if len(token.Headers) == 0 || token.Headers[0].Algorithm != string(jose.HS256) {
		return nil, ErrInvalidAlgorithm
	}

	// Verify signature and extract claims
	var claims LocalClaims
	if err := token.Claims([]byte(secret), &claims); err != nil {
		return nil, fmt.Errorf("%w: signature verification failed", ErrInvalidToken)
	}

	// Validate expiration time
	if claims.Expiry == nil {
		return nil, fmt.Errorf("%w: missing exp claim", ErrMissingClaims)
	}
	// SECURITY FIX (S1-M1): Apply 30-second clock skew tolerance to expiry check,
	// matching the tolerance already applied to the NotBefore check below.
	// In multi-instance deployments, minor clock differences between the token-issuing
	// instance and the validating instance can cause tokens to be rejected prematurely.
	if claims.Expiry.Time().Add(30 * time.Second).Before(time.Now()) {
		return nil, ErrTokenExpired
	}

	// Validate NotBefore claim with 30-second clock skew tolerance
	if claims.NotBefore != nil {
		if time.Now().Add(30 * time.Second).Before(claims.NotBefore.Time()) {
			return nil, fmt.Errorf("%w: token not yet valid", ErrInvalidToken)
		}
	}

	// SECURITY FIX (S1-M2): Validate issuer claim to prevent token confusion across
	// services that may share the same JWT signing secret on shared infrastructure.
	if claims.Issuer != "apis-server" {
		return nil, fmt.Errorf("%w: invalid issuer", ErrInvalidToken)
	}

	// Validate required claims
	if claims.Subject == "" {
		return nil, fmt.Errorf("%w: missing sub claim", ErrMissingClaims)
	}
	if claims.TenantID == "" {
		return nil, fmt.Errorf("%w: missing tenant_id claim", ErrMissingClaims)
	}
	if claims.Email == "" {
		return nil, fmt.Errorf("%w: missing email claim", ErrMissingClaims)
	}

	return &claims, nil
}

// JWT expiration constants
// SECURITY FIX (AUTH-001-3): Reduced token expiration times to limit exposure window
const (
	// DefaultTokenExpiry is the default JWT expiration time (24 hours).
	// Previously 7 days - reduced to 24 hours to limit token exposure window.
	DefaultTokenExpiry = 24 * time.Hour
	// RememberMeTokenExpiry is the extended expiration for "remember me" sessions (7 days).
	// Previously 30 days - reduced to 7 days to balance convenience with security.
	RememberMeTokenExpiry = 7 * 24 * time.Hour
)

// CreateLocalJWT creates a signed HS256 JWT for local authentication mode.
// The token contains user identity claims and is signed with the provided secret.
//
// Parameters:
//   - userID: The unique user identifier (will be set as "sub" claim)
//   - tenantID: The tenant identifier
//   - email: The user's email address
//   - name: The user's display name
//   - role: The user's role (e.g., "admin", "member")
//   - secret: The HS256 signing secret
//   - rememberMe: If true, token expires in 30 days; otherwise 7 days
//
// Returns the signed JWT string or an error if signing fails.
func CreateLocalJWT(userID, tenantID, email, name, role, secret string, rememberMe bool) (string, error) {
	if secret == "" {
		return "", fmt.Errorf("auth: JWT secret cannot be empty")
	}

	// Determine expiration time
	expiry := DefaultTokenExpiry
	if rememberMe {
		expiry = RememberMeTokenExpiry
	}

	now := time.Now()
	claims := LocalClaims{
		Claims: jwt.Claims{
			// SECURITY FIX (AUTH-001-2): Added JTI (JWT ID) for token revocation support
			// Each token now has a unique identifier that can be tracked and revoked
			ID:        uuid.New().String(),
			Subject:   userID,
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			Expiry:    jwt.NewNumericDate(now.Add(expiry)),
			Issuer:    "apis-server",
		},
		TenantID: tenantID,
		Email:    email,
		Name:     name,
		Role:     role,
	}

	// Create signer with HS256 algorithm
	signer, err := jose.NewSigner(
		jose.SigningKey{Algorithm: jose.HS256, Key: []byte(secret)},
		(&jose.SignerOptions{}).WithType("JWT"),
	)
	if err != nil {
		return "", fmt.Errorf("auth: failed to create JWT signer: %w", err)
	}

	// Sign and serialize the token
	token, err := jwt.Signed(signer).Claims(claims).Serialize()
	if err != nil {
		return "", fmt.Errorf("auth: failed to sign JWT: %w", err)
	}

	return token, nil
}

// ImpersonationTokenExpiry is the expiration time for impersonation sessions (4 hours).
// This is shorter than regular tokens for security purposes.
const ImpersonationTokenExpiry = 4 * time.Hour

// ImpersonationParams contains parameters for creating an impersonation JWT.
type ImpersonationParams struct {
	// UserID is the super-admin's user ID (stored as impersonator_id claim for audit)
	UserID string
	// TargetTenantID is the tenant being impersonated (stored as tenant_id)
	TargetTenantID string
	// OriginalTenantID is the super-admin's original tenant
	OriginalTenantID string
	// Email is the super-admin's email
	Email string
	// Name is the super-admin's display name
	Name string
	// Role is the super-admin's role (typically "admin")
	Role string
}

// CreateImpersonationJWT creates a signed HS256 JWT for impersonation sessions.
// The token contains special claims indicating this is an impersonation session
// with the original admin's ID preserved in ImpersonatorID for audit purposes.
//
// SECURITY: The JWT Subject is set to a synthetic impersonation session ID
// (not the admin's user ID) to prevent confusion with real users of the target
// tenant. The admin's identity is preserved in the ImpersonatorID claim.
//
// Returns the signed JWT string or an error if signing fails.
func CreateImpersonationJWT(params ImpersonationParams, secret string) (string, error) {
	if secret == "" {
		return "", fmt.Errorf("auth: JWT secret cannot be empty")
	}

	now := time.Now()
	// Use a synthetic subject to distinguish impersonation sessions from real users.
	// The admin's actual user ID is stored in ImpersonatorID for audit trail.
	impersonationSubject := "impersonate:" + params.UserID
	claims := LocalClaims{
		Claims: jwt.Claims{
			// SECURITY FIX (AUTH-001-2): Added JTI (JWT ID) for token revocation support
			// Impersonation tokens also need unique IDs for audit and revocation
			ID:        uuid.New().String(),
			Subject:   impersonationSubject,
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			Expiry:    jwt.NewNumericDate(now.Add(ImpersonationTokenExpiry)),
			Issuer:    "apis-server",
		},
		TenantID:         params.TargetTenantID,
		Email:            params.Email,
		Name:             params.Name,
		Role:             params.Role,
		ImpersonatorID:   params.UserID,
		Impersonating:    true,
		OriginalTenantID: params.OriginalTenantID,
	}

	// Create signer with HS256 algorithm
	signer, err := jose.NewSigner(
		jose.SigningKey{Algorithm: jose.HS256, Key: []byte(secret)},
		(&jose.SignerOptions{}).WithType("JWT"),
	)
	if err != nil {
		return "", fmt.Errorf("auth: failed to create JWT signer: %w", err)
	}

	// Sign and serialize the token
	token, err := jwt.Signed(signer).Claims(claims).Serialize()
	if err != nil {
		return "", fmt.Errorf("auth: failed to sign JWT: %w", err)
	}

	return token, nil
}

// ExtractTokenFromCookieOrHeader extracts a JWT token from the request.
// It first checks the apis_session cookie, then falls back to the Authorization header.
// Returns the token string and a boolean indicating if it was found.
//
// Cookie format: apis_session=<token>
// Header format: Authorization: Bearer <token>
func ExtractTokenFromCookieOrHeader(cookieValue, authHeader string) (string, bool) {
	// Cookie takes priority (for browser requests)
	if cookieValue != "" {
		return cookieValue, true
	}

	// Fall back to Authorization header (for API clients)
	// Use case-insensitive comparison for "Bearer" prefix (RFC 7235 allows case-insensitive)
	if authHeader != "" {
		const bearerPrefix = "bearer "
		if len(authHeader) > len(bearerPrefix) && strings.EqualFold(authHeader[:len(bearerPrefix)], bearerPrefix) {
			return authHeader[len(bearerPrefix):], true
		}
	}

	return "", false
}
