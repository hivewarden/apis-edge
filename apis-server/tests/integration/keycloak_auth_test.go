// Package integration contains integration tests for the APIS server.
// keycloak_auth_test.go — P0-014 to P0-016: Keycloak OIDC authentication tests.
//
// These tests validate:
// - P0-014: Keycloak token structure validation (JWT parsing, signature algorithms)
// - P0-015: Keycloak org_id claim extraction (tenant isolation via OIDC claims)
// - P0-016: Keycloak role mapping (realm_access.roles -> Claims.Role with priority)
//
// These tests do NOT require a running Keycloak instance. They test the middleware
// logic using crafted JWTs signed with test keys, verifying that the middleware
// correctly parses, validates, and extracts claims from Keycloak-format tokens.
package integration

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-jose/go-jose/v4"
	"github.com/go-jose/go-jose/v4/jwt"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/jermoo/apis/apis-server/internal/middleware"
)

// testKeycloakSetup holds the RSA key pair and JWKS test server
// used to simulate a Keycloak issuer for JWT validation.
type testKeycloakSetup struct {
	privateKey *rsa.PrivateKey
	publicKey  *rsa.PublicKey
	kid        string
	issuer     string
	clientID   string
	jwksServer *httptest.Server
}

// newTestKeycloakSetup creates a test RSA key pair and starts an HTTP server
// that serves OIDC discovery and JWKS endpoints, simulating Keycloak.
func newTestKeycloakSetup(t *testing.T) *testKeycloakSetup {
	t.Helper()

	// Generate RSA key pair for test JWT signing
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)

	kid := "test-key-1"
	clientID := "apis-dashboard"

	// Create JWK from public key
	jwk := jose.JSONWebKey{
		Key:       &privateKey.PublicKey,
		KeyID:     kid,
		Algorithm: string(jose.RS256),
		Use:       "sig",
	}

	jwks := jose.JSONWebKeySet{
		Keys: []jose.JSONWebKey{jwk},
	}

	// Start OIDC mock server that serves discovery and JWKS
	mux := http.NewServeMux()
	mux.HandleFunc("/.well-known/openid-configuration", func(w http.ResponseWriter, r *http.Request) {
		// Return discovery document pointing to JWKS URI
		disco := map[string]string{
			"issuer":   "", // Will be set after server starts
			"jwks_uri": "", // Will be set after server starts
		}
		// Dynamically use the server URL
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(disco)
	})
	mux.HandleFunc("/protocol/openid-connect/certs", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(jwks)
	})

	server := httptest.NewServer(mux)

	// Update discovery endpoint to return correct URLs
	issuer := server.URL
	server.Config.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/.well-known/openid-configuration":
			disco := map[string]string{
				"issuer":   issuer,
				"jwks_uri": issuer + "/protocol/openid-connect/certs",
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(disco)
		case "/protocol/openid-connect/certs":
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(jwks)
		default:
			http.NotFound(w, r)
		}
	})

	return &testKeycloakSetup{
		privateKey: privateKey,
		publicKey:  &privateKey.PublicKey,
		kid:        kid,
		issuer:     issuer,
		clientID:   clientID,
		jwksServer: server,
	}
}

// cleanup stops the test JWKS server.
func (s *testKeycloakSetup) cleanup() {
	s.jwksServer.Close()
}

// signToken creates a signed JWT with the given claims.
func (s *testKeycloakSetup) signToken(t *testing.T, claims interface{}) string {
	t.Helper()

	signer, err := jose.NewSigner(
		jose.SigningKey{Algorithm: jose.RS256, Key: s.privateKey},
		(&jose.SignerOptions{}).WithType("JWT").WithHeader("kid", s.kid),
	)
	require.NoError(t, err)

	raw, err := jwt.Signed(signer).Claims(claims).Serialize()
	require.NoError(t, err)

	return raw
}

// keycloakTokenClaims is a helper struct for building test Keycloak JWTs.
type keycloakTokenClaims struct {
	jwt.Claims
	Email            string                 `json:"email,omitempty"`
	Name             string                 `json:"name,omitempty"`
	PreferredUser    string                 `json:"preferred_username,omitempty"`
	OrgID            string                 `json:"org_id,omitempty"`
	OrgName          string                 `json:"org_name,omitempty"`
	RealmAccess      map[string]interface{} `json:"realm_access,omitempty"`
}

// --- P0-014: Keycloak Token Validation Tests ---

func TestKeycloak_ValidTokenPassesMiddleware(t *testing.T) {
	setup := newTestKeycloakSetup(t)
	defer setup.cleanup()

	authMiddleware, err := middleware.NewAuthMiddleware(setup.issuer, setup.clientID)
	require.NoError(t, err)

	// Build valid Keycloak-style claims
	now := time.Now()
	claims := keycloakTokenClaims{
		Claims: jwt.Claims{
			Subject:  "user-uuid-001",
			Issuer:   setup.issuer,
			Audience: jwt.Audience{setup.clientID},
			IssuedAt: jwt.NewNumericDate(now),
			Expiry:   jwt.NewNumericDate(now.Add(1 * time.Hour)),
		},
		Email:   "beekeeper@example.com",
		Name:    "Test Beekeeper",
		OrgID:   "org-tenant-001",
		OrgName: "Beekeeper Cooperative",
		RealmAccess: map[string]interface{}{
			"roles": []string{"user"},
		},
	}

	token := setup.signToken(t, claims)

	// Track whether the handler was called
	var capturedClaims *middleware.Claims
	handler := authMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedClaims = middleware.GetClaims(r.Context())
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/api/me", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code, "Valid Keycloak token should pass middleware")
	require.NotNil(t, capturedClaims, "Claims should be set in context")
	assert.Equal(t, "user-uuid-001", capturedClaims.UserID)
	assert.Equal(t, "beekeeper@example.com", capturedClaims.Email)
	assert.Equal(t, "Test Beekeeper", capturedClaims.Name)
}

func TestKeycloak_ExpiredTokenIsRejected(t *testing.T) {
	setup := newTestKeycloakSetup(t)
	defer setup.cleanup()

	authMiddleware, err := middleware.NewAuthMiddleware(setup.issuer, setup.clientID)
	require.NoError(t, err)

	// Build expired token
	pastTime := time.Now().Add(-2 * time.Hour)
	claims := keycloakTokenClaims{
		Claims: jwt.Claims{
			Subject:  "user-uuid-expired",
			Issuer:   setup.issuer,
			Audience: jwt.Audience{setup.clientID},
			IssuedAt: jwt.NewNumericDate(pastTime),
			Expiry:   jwt.NewNumericDate(pastTime.Add(1 * time.Hour)), // Expired 1 hour ago
		},
		OrgID: "org-expired",
	}

	token := setup.signToken(t, claims)

	handler := authMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("Handler should not be called for expired token")
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/api/me", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code, "Expired token should be rejected")
}

func TestKeycloak_WrongAudienceIsRejected(t *testing.T) {
	setup := newTestKeycloakSetup(t)
	defer setup.cleanup()

	authMiddleware, err := middleware.NewAuthMiddleware(setup.issuer, setup.clientID)
	require.NoError(t, err)

	now := time.Now()
	claims := keycloakTokenClaims{
		Claims: jwt.Claims{
			Subject:  "user-uuid-wrong-aud",
			Issuer:   setup.issuer,
			Audience: jwt.Audience{"wrong-client-id"}, // Wrong audience
			IssuedAt: jwt.NewNumericDate(now),
			Expiry:   jwt.NewNumericDate(now.Add(1 * time.Hour)),
		},
		OrgID: "org-wrong-aud",
	}

	token := setup.signToken(t, claims)

	handler := authMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("Handler should not be called for wrong audience")
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/api/me", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code, "Wrong audience should be rejected")
}

func TestKeycloak_WrongIssuerIsRejected(t *testing.T) {
	setup := newTestKeycloakSetup(t)
	defer setup.cleanup()

	authMiddleware, err := middleware.NewAuthMiddleware(setup.issuer, setup.clientID)
	require.NoError(t, err)

	now := time.Now()
	claims := keycloakTokenClaims{
		Claims: jwt.Claims{
			Subject:  "user-uuid-wrong-iss",
			Issuer:   "http://evil-issuer.example.com", // Wrong issuer
			Audience: jwt.Audience{setup.clientID},
			IssuedAt: jwt.NewNumericDate(now),
			Expiry:   jwt.NewNumericDate(now.Add(1 * time.Hour)),
		},
		OrgID: "org-wrong-iss",
	}

	token := setup.signToken(t, claims)

	handler := authMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("Handler should not be called for wrong issuer")
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/api/me", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code, "Wrong issuer should be rejected")
}

func TestKeycloak_MissingSubjectIsRejected(t *testing.T) {
	setup := newTestKeycloakSetup(t)
	defer setup.cleanup()

	authMiddleware, err := middleware.NewAuthMiddleware(setup.issuer, setup.clientID)
	require.NoError(t, err)

	now := time.Now()
	claims := keycloakTokenClaims{
		Claims: jwt.Claims{
			Subject:  "", // Missing subject
			Issuer:   setup.issuer,
			Audience: jwt.Audience{setup.clientID},
			IssuedAt: jwt.NewNumericDate(now),
			Expiry:   jwt.NewNumericDate(now.Add(1 * time.Hour)),
		},
		OrgID: "org-no-sub",
	}

	token := setup.signToken(t, claims)

	handler := authMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("Handler should not be called for missing subject")
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/api/me", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code, "Missing subject should be rejected")
}

func TestKeycloak_InvalidSignatureIsRejected(t *testing.T) {
	setup := newTestKeycloakSetup(t)
	defer setup.cleanup()

	authMiddleware, err := middleware.NewAuthMiddleware(setup.issuer, setup.clientID)
	require.NoError(t, err)

	// Generate a DIFFERENT key (not in the JWKS)
	otherKey, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)

	now := time.Now()
	claims := keycloakTokenClaims{
		Claims: jwt.Claims{
			Subject:  "user-uuid-bad-sig",
			Issuer:   setup.issuer,
			Audience: jwt.Audience{setup.clientID},
			IssuedAt: jwt.NewNumericDate(now),
			Expiry:   jwt.NewNumericDate(now.Add(1 * time.Hour)),
		},
		OrgID: "org-bad-sig",
	}

	// Sign with the wrong key
	signer, err := jose.NewSigner(
		jose.SigningKey{Algorithm: jose.RS256, Key: otherKey},
		(&jose.SignerOptions{}).WithType("JWT").WithHeader("kid", "unknown-kid"),
	)
	require.NoError(t, err)
	token, err := jwt.Signed(signer).Claims(claims).Serialize()
	require.NoError(t, err)

	handler := authMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("Handler should not be called for invalid signature")
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/api/me", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code, "Invalid signature should be rejected")
}

// --- P0-015: Keycloak org_id Claim Extraction Tests ---

func TestKeycloak_OrgIDExtractedForTenantIsolation(t *testing.T) {
	setup := newTestKeycloakSetup(t)
	defer setup.cleanup()

	authMiddleware, err := middleware.NewAuthMiddleware(setup.issuer, setup.clientID)
	require.NoError(t, err)

	now := time.Now()
	orgID := "org-apiary-belgium-001"
	claims := keycloakTokenClaims{
		Claims: jwt.Claims{
			Subject:  "user-uuid-org-test",
			Issuer:   setup.issuer,
			Audience: jwt.Audience{setup.clientID},
			IssuedAt: jwt.NewNumericDate(now),
			Expiry:   jwt.NewNumericDate(now.Add(1 * time.Hour)),
		},
		Email:   "org@example.com",
		Name:    "Org Test User",
		OrgID:   orgID,
		OrgName: "Belgian Beekeepers",
		RealmAccess: map[string]interface{}{
			"roles": []string{"user"},
		},
	}

	token := setup.signToken(t, claims)

	var capturedClaims *middleware.Claims
	handler := authMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedClaims = middleware.GetClaims(r.Context())
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/api/me", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.NotNil(t, capturedClaims)

	// Verify org_id is extracted and mapped to both OrgID and TenantID
	assert.Equal(t, orgID, capturedClaims.OrgID, "OrgID should match Keycloak org_id claim")
	assert.Equal(t, orgID, capturedClaims.TenantID, "TenantID should mirror OrgID for consistent access")
}

func TestKeycloak_DifferentOrgsGetDifferentTenantIDs(t *testing.T) {
	setup := newTestKeycloakSetup(t)
	defer setup.cleanup()

	authMiddleware, err := middleware.NewAuthMiddleware(setup.issuer, setup.clientID)
	require.NoError(t, err)

	now := time.Now()

	// User from Org A
	claimsA := keycloakTokenClaims{
		Claims: jwt.Claims{
			Subject:  "user-org-a",
			Issuer:   setup.issuer,
			Audience: jwt.Audience{setup.clientID},
			IssuedAt: jwt.NewNumericDate(now),
			Expiry:   jwt.NewNumericDate(now.Add(1 * time.Hour)),
		},
		OrgID: "org-alpha",
		RealmAccess: map[string]interface{}{
			"roles": []string{"user"},
		},
	}
	tokenA := setup.signToken(t, claimsA)

	// User from Org B
	claimsB := keycloakTokenClaims{
		Claims: jwt.Claims{
			Subject:  "user-org-b",
			Issuer:   setup.issuer,
			Audience: jwt.Audience{setup.clientID},
			IssuedAt: jwt.NewNumericDate(now),
			Expiry:   jwt.NewNumericDate(now.Add(1 * time.Hour)),
		},
		OrgID: "org-beta",
		RealmAccess: map[string]interface{}{
			"roles": []string{"admin"},
		},
	}
	tokenB := setup.signToken(t, claimsB)

	var capturedA, capturedB *middleware.Claims

	handlerA := authMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedA = middleware.GetClaims(r.Context())
		w.WriteHeader(http.StatusOK)
	}))

	handlerB := authMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedB = middleware.GetClaims(r.Context())
		w.WriteHeader(http.StatusOK)
	}))

	// Request as Org A user
	reqA := httptest.NewRequest("GET", "/api/me", nil)
	reqA.Header.Set("Authorization", "Bearer "+tokenA)
	recA := httptest.NewRecorder()
	handlerA.ServeHTTP(recA, reqA)
	require.Equal(t, http.StatusOK, recA.Code)

	// Request as Org B user
	reqB := httptest.NewRequest("GET", "/api/me", nil)
	reqB.Header.Set("Authorization", "Bearer "+tokenB)
	recB := httptest.NewRecorder()
	handlerB.ServeHTTP(recB, reqB)
	require.Equal(t, http.StatusOK, recB.Code)

	require.NotNil(t, capturedA)
	require.NotNil(t, capturedB)

	assert.Equal(t, "org-alpha", capturedA.TenantID)
	assert.Equal(t, "org-beta", capturedB.TenantID)
	assert.NotEqual(t, capturedA.TenantID, capturedB.TenantID,
		"Different orgs must produce different tenant IDs")
}

// --- P0-016: Keycloak Role Mapping Tests ---

func TestKeycloak_RolePriorityAdminOverUser(t *testing.T) {
	setup := newTestKeycloakSetup(t)
	defer setup.cleanup()

	authMiddleware, err := middleware.NewAuthMiddleware(setup.issuer, setup.clientID)
	require.NoError(t, err)

	now := time.Now()
	claims := keycloakTokenClaims{
		Claims: jwt.Claims{
			Subject:  "user-admin-priority",
			Issuer:   setup.issuer,
			Audience: jwt.Audience{setup.clientID},
			IssuedAt: jwt.NewNumericDate(now),
			Expiry:   jwt.NewNumericDate(now.Add(1 * time.Hour)),
		},
		OrgID: "org-role-test",
		RealmAccess: map[string]interface{}{
			"roles": []string{"user", "admin", "viewer"}, // admin should win
		},
	}

	token := setup.signToken(t, claims)

	var capturedClaims *middleware.Claims
	handler := authMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedClaims = middleware.GetClaims(r.Context())
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/api/me", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.NotNil(t, capturedClaims)

	assert.Equal(t, "admin", capturedClaims.Role,
		"admin should be selected as primary role (admin > user > viewer)")
	assert.Contains(t, capturedClaims.Roles, "admin")
	assert.Contains(t, capturedClaims.Roles, "user")
	assert.Contains(t, capturedClaims.Roles, "viewer")
}

func TestKeycloak_RolePriorityUserOverViewer(t *testing.T) {
	setup := newTestKeycloakSetup(t)
	defer setup.cleanup()

	authMiddleware, err := middleware.NewAuthMiddleware(setup.issuer, setup.clientID)
	require.NoError(t, err)

	now := time.Now()
	claims := keycloakTokenClaims{
		Claims: jwt.Claims{
			Subject:  "user-role-uv",
			Issuer:   setup.issuer,
			Audience: jwt.Audience{setup.clientID},
			IssuedAt: jwt.NewNumericDate(now),
			Expiry:   jwt.NewNumericDate(now.Add(1 * time.Hour)),
		},
		OrgID: "org-role-uv",
		RealmAccess: map[string]interface{}{
			"roles": []string{"viewer", "user"}, // user should win over viewer
		},
	}

	token := setup.signToken(t, claims)

	var capturedClaims *middleware.Claims
	handler := authMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedClaims = middleware.GetClaims(r.Context())
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/api/me", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.NotNil(t, capturedClaims)
	assert.Equal(t, "user", capturedClaims.Role, "user should be selected over viewer")
}

func TestKeycloak_ViewerOnlyRole(t *testing.T) {
	setup := newTestKeycloakSetup(t)
	defer setup.cleanup()

	authMiddleware, err := middleware.NewAuthMiddleware(setup.issuer, setup.clientID)
	require.NoError(t, err)

	now := time.Now()
	claims := keycloakTokenClaims{
		Claims: jwt.Claims{
			Subject:  "user-role-viewer",
			Issuer:   setup.issuer,
			Audience: jwt.Audience{setup.clientID},
			IssuedAt: jwt.NewNumericDate(now),
			Expiry:   jwt.NewNumericDate(now.Add(1 * time.Hour)),
		},
		OrgID: "org-role-viewer",
		RealmAccess: map[string]interface{}{
			"roles": []string{"viewer"},
		},
	}

	token := setup.signToken(t, claims)

	var capturedClaims *middleware.Claims
	handler := authMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedClaims = middleware.GetClaims(r.Context())
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/api/me", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.NotNil(t, capturedClaims)
	assert.Equal(t, "viewer", capturedClaims.Role)
}

func TestKeycloak_UnknownRoleFallsBackToFirst(t *testing.T) {
	setup := newTestKeycloakSetup(t)
	defer setup.cleanup()

	authMiddleware, err := middleware.NewAuthMiddleware(setup.issuer, setup.clientID)
	require.NoError(t, err)

	now := time.Now()
	claims := keycloakTokenClaims{
		Claims: jwt.Claims{
			Subject:  "user-role-unknown",
			Issuer:   setup.issuer,
			Audience: jwt.Audience{setup.clientID},
			IssuedAt: jwt.NewNumericDate(now),
			Expiry:   jwt.NewNumericDate(now.Add(1 * time.Hour)),
		},
		OrgID: "org-role-unknown",
		RealmAccess: map[string]interface{}{
			"roles": []string{"beekeeper_specialist"}, // Not a recognized role
		},
	}

	token := setup.signToken(t, claims)

	var capturedClaims *middleware.Claims
	handler := authMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedClaims = middleware.GetClaims(r.Context())
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/api/me", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.NotNil(t, capturedClaims)
	assert.Equal(t, "beekeeper_specialist", capturedClaims.Role,
		"Unknown roles should fall back to the first role in the array")
}

func TestKeycloak_EmptyRolesArrayProducesEmptyRole(t *testing.T) {
	setup := newTestKeycloakSetup(t)
	defer setup.cleanup()

	authMiddleware, err := middleware.NewAuthMiddleware(setup.issuer, setup.clientID)
	require.NoError(t, err)

	now := time.Now()
	claims := keycloakTokenClaims{
		Claims: jwt.Claims{
			Subject:  "user-no-roles",
			Issuer:   setup.issuer,
			Audience: jwt.Audience{setup.clientID},
			IssuedAt: jwt.NewNumericDate(now),
			Expiry:   jwt.NewNumericDate(now.Add(1 * time.Hour)),
		},
		OrgID: "org-no-roles",
		RealmAccess: map[string]interface{}{
			"roles": []string{}, // Empty roles
		},
	}

	token := setup.signToken(t, claims)

	var capturedClaims *middleware.Claims
	handler := authMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedClaims = middleware.GetClaims(r.Context())
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/api/me", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.NotNil(t, capturedClaims)
	assert.Equal(t, "", capturedClaims.Role, "Empty roles array should produce empty primary role")
}

func TestKeycloak_MissingRealmAccessProducesEmptyRole(t *testing.T) {
	setup := newTestKeycloakSetup(t)
	defer setup.cleanup()

	authMiddleware, err := middleware.NewAuthMiddleware(setup.issuer, setup.clientID)
	require.NoError(t, err)

	now := time.Now()
	// No RealmAccess field at all
	claims := keycloakTokenClaims{
		Claims: jwt.Claims{
			Subject:  "user-no-realm-access",
			Issuer:   setup.issuer,
			Audience: jwt.Audience{setup.clientID},
			IssuedAt: jwt.NewNumericDate(now),
			Expiry:   jwt.NewNumericDate(now.Add(1 * time.Hour)),
		},
		OrgID: "org-no-realm-access",
		// RealmAccess intentionally omitted
	}

	token := setup.signToken(t, claims)

	var capturedClaims *middleware.Claims
	handler := authMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedClaims = middleware.GetClaims(r.Context())
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/api/me", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.NotNil(t, capturedClaims)
	assert.Equal(t, "", capturedClaims.Role, "Missing realm_access should produce empty primary role")
	assert.Empty(t, capturedClaims.Roles, "Missing realm_access should produce empty roles array")
}

// --- P0-015 continued: Email and Name propagation ---

func TestKeycloak_EmailAndNamePropagated(t *testing.T) {
	setup := newTestKeycloakSetup(t)
	defer setup.cleanup()

	authMiddleware, err := middleware.NewAuthMiddleware(setup.issuer, setup.clientID)
	require.NoError(t, err)

	now := time.Now()
	claims := keycloakTokenClaims{
		Claims: jwt.Claims{
			Subject:  "user-props-test",
			Issuer:   setup.issuer,
			Audience: jwt.Audience{setup.clientID},
			IssuedAt: jwt.NewNumericDate(now),
			Expiry:   jwt.NewNumericDate(now.Add(1 * time.Hour)),
		},
		Email:         "jermoo@honeybeegood.be",
		Name:          "Jermoo de la Ruelle",
		PreferredUser: "jermoo",
		OrgID:         "org-props",
		RealmAccess: map[string]interface{}{
			"roles": []string{"admin"},
		},
	}

	token := setup.signToken(t, claims)

	var capturedClaims *middleware.Claims
	handler := authMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedClaims = middleware.GetClaims(r.Context())
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/api/me", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.NotNil(t, capturedClaims)
	assert.Equal(t, "jermoo@honeybeegood.be", capturedClaims.Email)
	assert.Equal(t, "Jermoo de la Ruelle", capturedClaims.Name)
}

func TestKeycloak_PreferredUsernameFallbackForName(t *testing.T) {
	setup := newTestKeycloakSetup(t)
	defer setup.cleanup()

	authMiddleware, err := middleware.NewAuthMiddleware(setup.issuer, setup.clientID)
	require.NoError(t, err)

	now := time.Now()
	claims := keycloakTokenClaims{
		Claims: jwt.Claims{
			Subject:  "user-no-name",
			Issuer:   setup.issuer,
			Audience: jwt.Audience{setup.clientID},
			IssuedAt: jwt.NewNumericDate(now),
			Expiry:   jwt.NewNumericDate(now.Add(1 * time.Hour)),
		},
		Email:         "noname@example.com",
		Name:          "", // Empty name
		PreferredUser: "preferred_user_42",
		OrgID:         "org-no-name",
		RealmAccess: map[string]interface{}{
			"roles": []string{"user"},
		},
	}

	token := setup.signToken(t, claims)

	var capturedClaims *middleware.Claims
	handler := authMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedClaims = middleware.GetClaims(r.Context())
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/api/me", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.NotNil(t, capturedClaims)
	assert.Equal(t, "preferred_user_42", capturedClaims.Name,
		"When name is empty, preferred_username should be used as fallback")
}

// --- Additional Security Tests ---

func TestKeycloak_MalformedTokenIsRejected(t *testing.T) {
	setup := newTestKeycloakSetup(t)
	defer setup.cleanup()

	authMiddleware, err := middleware.NewAuthMiddleware(setup.issuer, setup.clientID)
	require.NoError(t, err)

	handler := authMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("Handler should not be called for malformed token")
		w.WriteHeader(http.StatusOK)
	}))

	tests := []struct {
		name  string
		token string
	}{
		{"completely invalid", "not-a-jwt"},
		{"missing parts", "part1.part2"},
		{"empty token", ""},
		{"only dots", "..."},
		{"random base64", "eyJhbGciOiJSUzI1NiJ9.invalid.signature"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/api/me", nil)
			if tt.token == "" {
				req.Header.Set("Authorization", "Bearer ")
			} else {
				req.Header.Set("Authorization", "Bearer "+tt.token)
			}
			rec := httptest.NewRecorder()

			handler.ServeHTTP(rec, req)

			assert.Equal(t, http.StatusUnauthorized, rec.Code,
				"Malformed token '%s' should be rejected", tt.name)
		})
	}
}

// ignoreContext is a helper for tests that don't need context.
var _ = context.Background
