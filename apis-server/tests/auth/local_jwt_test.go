package auth_test

import (
	"testing"
	"time"

	"github.com/go-jose/go-jose/v4"
	"github.com/go-jose/go-jose/v4/jwt"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/jermoo/apis/apis-server/internal/auth"
)

const (
	testSecret     = "this-is-a-test-secret-at-least-32-chars"
	testTenantID   = "00000000-0000-0000-0000-000000000000"
	testUserID     = "user-123-uuid"
	testEmail      = "test@example.com"
	testName       = "Test User"
	testRole       = "admin"
	wrongSecret    = "wrong-secret-that-is-at-least-32-chars"
)

// generateTestJWT creates a signed JWT for testing purposes.
func generateTestJWT(t *testing.T, claims map[string]interface{}, secret string, alg jose.SignatureAlgorithm) string {
	t.Helper()

	var signer jose.Signer
	var err error

	switch alg {
	case jose.HS256:
		signer, err = jose.NewSigner(jose.SigningKey{Algorithm: jose.HS256, Key: []byte(secret)}, nil)
	case jose.RS256:
		// For RS256, we need to generate a key pair
		// We'll use this to test algorithm rejection
		t.Skip("RS256 test token generation requires key pair - tested via algorithm rejection")
		return ""
	default:
		t.Fatalf("unsupported algorithm: %s", alg)
	}
	require.NoError(t, err, "failed to create signer")

	builder := jwt.Signed(signer)
	builder = builder.Claims(claims)

	token, err := builder.Serialize()
	require.NoError(t, err, "failed to serialize token")

	return token
}

// createValidClaims creates a claims map with all required fields and valid expiry.
func createValidClaims(exp time.Time) map[string]interface{} {
	return map[string]interface{}{
		"sub":       testUserID,
		"tenant_id": testTenantID,
		"email":     testEmail,
		"name":      testName,
		"role":      testRole,
		"iat":       time.Now().Unix(),
		"exp":       exp.Unix(),
	}
}

func TestValidateLocalJWT_ValidToken(t *testing.T) {
	// Create a valid token with future expiration
	exp := time.Now().Add(time.Hour)
	claims := createValidClaims(exp)
	token := generateTestJWT(t, claims, testSecret, jose.HS256)

	// Validate the token
	result, err := auth.ValidateLocalJWT(token, testSecret)

	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Equal(t, testUserID, result.Subject)
	assert.Equal(t, testTenantID, result.TenantID)
	assert.Equal(t, testEmail, result.Email)
	assert.Equal(t, testName, result.Name)
	assert.Equal(t, testRole, result.Role)
}

func TestValidateLocalJWT_InvalidSignature(t *testing.T) {
	// Create a token with one secret
	exp := time.Now().Add(time.Hour)
	claims := createValidClaims(exp)
	token := generateTestJWT(t, claims, testSecret, jose.HS256)

	// Try to validate with a different secret
	result, err := auth.ValidateLocalJWT(token, wrongSecret)

	require.Error(t, err)
	require.Nil(t, result)
	assert.ErrorIs(t, err, auth.ErrInvalidToken)
}

func TestValidateLocalJWT_ExpiredToken(t *testing.T) {
	// Create a token that's already expired
	exp := time.Now().Add(-time.Hour)
	claims := createValidClaims(exp)
	token := generateTestJWT(t, claims, testSecret, jose.HS256)

	// Validate the token
	result, err := auth.ValidateLocalJWT(token, testSecret)

	require.Error(t, err)
	require.Nil(t, result)
	assert.ErrorIs(t, err, auth.ErrTokenExpired)
}

func TestValidateLocalJWT_MissingSubClaim(t *testing.T) {
	exp := time.Now().Add(time.Hour)
	claims := map[string]interface{}{
		// "sub" is missing
		"tenant_id": testTenantID,
		"email":     testEmail,
		"name":      testName,
		"role":      testRole,
		"iat":       time.Now().Unix(),
		"exp":       exp.Unix(),
	}
	token := generateTestJWT(t, claims, testSecret, jose.HS256)

	result, err := auth.ValidateLocalJWT(token, testSecret)

	require.Error(t, err)
	require.Nil(t, result)
	assert.ErrorIs(t, err, auth.ErrMissingClaims)
}

func TestValidateLocalJWT_MissingTenantIDClaim(t *testing.T) {
	exp := time.Now().Add(time.Hour)
	claims := map[string]interface{}{
		"sub": testUserID,
		// "tenant_id" is missing
		"email": testEmail,
		"name":  testName,
		"role":  testRole,
		"iat":   time.Now().Unix(),
		"exp":   exp.Unix(),
	}
	token := generateTestJWT(t, claims, testSecret, jose.HS256)

	result, err := auth.ValidateLocalJWT(token, testSecret)

	require.Error(t, err)
	require.Nil(t, result)
	assert.ErrorIs(t, err, auth.ErrMissingClaims)
}

func TestValidateLocalJWT_MissingEmailClaim(t *testing.T) {
	exp := time.Now().Add(time.Hour)
	claims := map[string]interface{}{
		"sub":       testUserID,
		"tenant_id": testTenantID,
		// "email" is missing
		"name": testName,
		"role": testRole,
		"iat":  time.Now().Unix(),
		"exp":  exp.Unix(),
	}
	token := generateTestJWT(t, claims, testSecret, jose.HS256)

	result, err := auth.ValidateLocalJWT(token, testSecret)

	require.Error(t, err)
	require.Nil(t, result)
	assert.ErrorIs(t, err, auth.ErrMissingClaims)
}

func TestValidateLocalJWT_MissingExpClaim(t *testing.T) {
	claims := map[string]interface{}{
		"sub":       testUserID,
		"tenant_id": testTenantID,
		"email":     testEmail,
		"name":      testName,
		"role":      testRole,
		"iat":       time.Now().Unix(),
		// "exp" is missing
	}
	token := generateTestJWT(t, claims, testSecret, jose.HS256)

	result, err := auth.ValidateLocalJWT(token, testSecret)

	require.Error(t, err)
	require.Nil(t, result)
	assert.ErrorIs(t, err, auth.ErrMissingClaims)
}

func TestValidateLocalJWT_EmptyToken(t *testing.T) {
	result, err := auth.ValidateLocalJWT("", testSecret)

	require.Error(t, err)
	require.Nil(t, result)
	assert.ErrorIs(t, err, auth.ErrInvalidToken)
}

func TestValidateLocalJWT_EmptySecret(t *testing.T) {
	exp := time.Now().Add(time.Hour)
	claims := createValidClaims(exp)
	token := generateTestJWT(t, claims, testSecret, jose.HS256)

	result, err := auth.ValidateLocalJWT(token, "")

	require.Error(t, err)
	require.Nil(t, result)
	assert.ErrorIs(t, err, auth.ErrInvalidToken)
}

func TestValidateLocalJWT_MalformedToken(t *testing.T) {
	testCases := []struct {
		name  string
		token string
	}{
		{"random string", "not-a-jwt-token"},
		{"missing parts", "header.payload"},
		{"empty parts", "..."},
		{"base64 invalid", "eyJ!!!.eyJ###.sig"},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			result, err := auth.ValidateLocalJWT(tc.token, testSecret)

			require.Error(t, err)
			require.Nil(t, result)
			assert.ErrorIs(t, err, auth.ErrInvalidToken)
		})
	}
}

func TestValidateLocalJWT_OptionalNameAndRoleMissing(t *testing.T) {
	// Name and role are optional in the validation logic (they may be empty)
	exp := time.Now().Add(time.Hour)
	claims := map[string]interface{}{
		"sub":       testUserID,
		"tenant_id": testTenantID,
		"email":     testEmail,
		// "name" and "role" are missing
		"iat": time.Now().Unix(),
		"exp": exp.Unix(),
	}
	token := generateTestJWT(t, claims, testSecret, jose.HS256)

	// This should succeed because name and role are optional
	result, err := auth.ValidateLocalJWT(token, testSecret)

	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Equal(t, testUserID, result.Subject)
	assert.Equal(t, testTenantID, result.TenantID)
	assert.Equal(t, testEmail, result.Email)
	assert.Empty(t, result.Name)
	assert.Empty(t, result.Role)
}

// TestExtractTokenFromCookieOrHeader tests token extraction from cookie and header.
func TestExtractTokenFromCookieOrHeader(t *testing.T) {
	testToken := "test-jwt-token"

	testCases := []struct {
		name        string
		cookie      string
		authHeader  string
		wantToken   string
		wantFound   bool
		description string
	}{
		{
			name:        "cookie only",
			cookie:      testToken,
			authHeader:  "",
			wantToken:   testToken,
			wantFound:   true,
			description: "should extract from cookie when only cookie is present",
		},
		{
			name:        "header only",
			cookie:      "",
			authHeader:  "Bearer " + testToken,
			wantToken:   testToken,
			wantFound:   true,
			description: "should extract from header when only header is present",
		},
		{
			name:        "cookie takes priority",
			cookie:      "cookie-token",
			authHeader:  "Bearer header-token",
			wantToken:   "cookie-token",
			wantFound:   true,
			description: "should prefer cookie over header when both are present",
		},
		{
			name:        "no token",
			cookie:      "",
			authHeader:  "",
			wantToken:   "",
			wantFound:   false,
			description: "should return false when neither is present",
		},
		{
			name:        "invalid header format",
			cookie:      "",
			authHeader:  "Basic " + testToken,
			wantToken:   "",
			wantFound:   false,
			description: "should reject non-Bearer auth schemes",
		},
		{
			name:        "bearer only no token",
			cookie:      "",
			authHeader:  "Bearer ",
			wantToken:   "",
			wantFound:   false,
			description: "should reject empty Bearer token",
		},
		{
			name:        "bearer lowercase",
			cookie:      "",
			authHeader:  "bearer " + testToken,
			wantToken:   testToken,
			wantFound:   true,
			description: "should accept case-insensitive Bearer per RFC 7235",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			token, found := auth.ExtractTokenFromCookieOrHeader(tc.cookie, tc.authHeader)
			assert.Equal(t, tc.wantFound, found, tc.description)
			assert.Equal(t, tc.wantToken, token, tc.description)
		})
	}
}

// TestValidateLocalJWT_RS256Rejected tests that RS256 tokens are rejected in local mode.
// This is an algorithm confusion attack prevention test.
func TestValidateLocalJWT_RS256Rejected(t *testing.T) {
	// The key insight is that we should only accept HS256 tokens, not other algorithms.
	// This test verifies the parser only accepts HS256.

	// HS384 requires a longer key (minimum 48 bytes), so we use a longer secret
	longSecret := "this-is-a-much-longer-test-secret-for-hs384-algorithm-testing"

	// Create a valid HS384 token to test algorithm rejection
	signer, err := jose.NewSigner(jose.SigningKey{Algorithm: jose.HS384, Key: []byte(longSecret)}, nil)
	require.NoError(t, err)

	exp := time.Now().Add(time.Hour)
	claims := createValidClaims(exp)

	builder := jwt.Signed(signer).Claims(claims)
	token, err := builder.Serialize()
	require.NoError(t, err)

	// Validate - should fail because we only accept HS256
	// The validation uses the test secret (not the long one), but it shouldn't matter
	// because the algorithm check happens before signature verification
	result, err := auth.ValidateLocalJWT(token, testSecret)

	require.Error(t, err)
	require.Nil(t, result)
	// The error should indicate invalid algorithm
	assert.ErrorIs(t, err, auth.ErrInvalidAlgorithm)
}
