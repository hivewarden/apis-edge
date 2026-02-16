package auth

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCreateLocalJWT(t *testing.T) {
	secret := "test-secret-that-is-at-least-32-chars-long"

	tests := []struct {
		name        string
		userID      string
		tenantID    string
		email       string
		displayName string
		role        string
		rememberMe  bool
		shouldError bool
	}{
		{
			name:        "valid JWT creation",
			userID:      "user-123",
			tenantID:    "tenant-456",
			email:       "test@example.com",
			displayName: "Test User",
			role:        "admin",
			rememberMe:  false,
			shouldError: false,
		},
		{
			name:        "valid JWT with remember me",
			userID:      "user-789",
			tenantID:    "tenant-abc",
			email:       "remember@example.com",
			displayName: "Remember User",
			role:        "member",
			rememberMe:  true,
			shouldError: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			token, err := CreateLocalJWT(tt.userID, tt.tenantID, tt.email, tt.displayName, tt.role, secret, tt.rememberMe)
			if tt.shouldError {
				assert.Error(t, err)
				assert.Empty(t, token)
			} else {
				require.NoError(t, err)
				assert.NotEmpty(t, token)

				// Verify the token can be validated
				claims, err := ValidateLocalJWT(token, secret)
				require.NoError(t, err)
				assert.Equal(t, tt.userID, claims.Subject)
				assert.Equal(t, tt.tenantID, claims.TenantID)
				assert.Equal(t, tt.email, claims.Email)
				assert.Equal(t, tt.displayName, claims.Name)
				assert.Equal(t, tt.role, claims.Role)
			}
		})
	}
}

func TestCreateLocalJWTEmptySecret(t *testing.T) {
	token, err := CreateLocalJWT("user-123", "tenant-456", "test@example.com", "Test", "admin", "", false)
	assert.Error(t, err)
	assert.Empty(t, token)
	assert.Contains(t, err.Error(), "secret cannot be empty")
}

func TestCreateLocalJWTExpiry(t *testing.T) {
	secret := "test-secret-that-is-at-least-32-chars-long"

	// Test default expiry (7 days)
	token, err := CreateLocalJWT("user-123", "tenant-456", "test@example.com", "Test", "admin", secret, false)
	require.NoError(t, err)

	claims, err := ValidateLocalJWT(token, secret)
	require.NoError(t, err)

	// Expiry should be approximately 7 days from now
	expectedExpiry := time.Now().Add(DefaultTokenExpiry)
	actualExpiry := claims.Expiry.Time()
	// Allow 1 minute tolerance
	assert.WithinDuration(t, expectedExpiry, actualExpiry, time.Minute)

	// Test remember me expiry (30 days)
	token, err = CreateLocalJWT("user-123", "tenant-456", "test@example.com", "Test", "admin", secret, true)
	require.NoError(t, err)

	claims, err = ValidateLocalJWT(token, secret)
	require.NoError(t, err)

	expectedExpiry = time.Now().Add(RememberMeTokenExpiry)
	actualExpiry = claims.Expiry.Time()
	assert.WithinDuration(t, expectedExpiry, actualExpiry, time.Minute)
}

func TestValidateLocalJWT(t *testing.T) {
	secret := "test-secret-that-is-at-least-32-chars-long"
	wrongSecret := "wrong-secret-that-is-also-long-enough"

	// Create a valid token
	token, err := CreateLocalJWT("user-123", "tenant-456", "test@example.com", "Test User", "admin", secret, false)
	require.NoError(t, err)

	tests := []struct {
		name        string
		token       string
		secret      string
		shouldError bool
		errType     error
	}{
		{
			name:        "valid token",
			token:       token,
			secret:      secret,
			shouldError: false,
		},
		{
			name:        "wrong secret",
			token:       token,
			secret:      wrongSecret,
			shouldError: true,
			errType:     ErrInvalidToken,
		},
		{
			name:        "empty token",
			token:       "",
			secret:      secret,
			shouldError: true,
			errType:     ErrInvalidToken,
		},
		{
			name:        "empty secret",
			token:       token,
			secret:      "",
			shouldError: true,
			errType:     ErrInvalidToken,
		},
		{
			name:        "malformed token",
			token:       "not.a.valid.jwt",
			secret:      secret,
			shouldError: true,
			errType:     ErrInvalidToken,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			claims, err := ValidateLocalJWT(tt.token, tt.secret)
			if tt.shouldError {
				assert.Error(t, err)
				assert.Nil(t, claims)
				if tt.errType != nil {
					assert.ErrorIs(t, err, tt.errType)
				}
			} else {
				require.NoError(t, err)
				assert.NotNil(t, claims)
			}
		})
	}
}

func TestExtractTokenFromCookieOrHeader(t *testing.T) {
	tests := []struct {
		name          string
		cookieValue   string
		authHeader    string
		expectedToken string
		expectedFound bool
	}{
		{
			name:          "cookie takes priority",
			cookieValue:   "cookie-token",
			authHeader:    "Bearer header-token",
			expectedToken: "cookie-token",
			expectedFound: true,
		},
		{
			name:          "header fallback when no cookie",
			cookieValue:   "",
			authHeader:    "Bearer header-token",
			expectedToken: "header-token",
			expectedFound: true,
		},
		{
			name:          "case insensitive bearer",
			cookieValue:   "",
			authHeader:    "bearer token-lowercase",
			expectedToken: "token-lowercase",
			expectedFound: true,
		},
		{
			name:          "BEARER uppercase",
			cookieValue:   "",
			authHeader:    "BEARER token-uppercase",
			expectedToken: "token-uppercase",
			expectedFound: true,
		},
		{
			name:          "no token found",
			cookieValue:   "",
			authHeader:    "",
			expectedToken: "",
			expectedFound: false,
		},
		{
			name:          "invalid header format",
			cookieValue:   "",
			authHeader:    "Basic credentials",
			expectedToken: "",
			expectedFound: false,
		},
		{
			name:          "bearer without token",
			cookieValue:   "",
			authHeader:    "Bearer ",
			expectedToken: "",
			expectedFound: false, // "Bearer " with no token is not valid
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			token, found := ExtractTokenFromCookieOrHeader(tt.cookieValue, tt.authHeader)
			assert.Equal(t, tt.expectedFound, found)
			assert.Equal(t, tt.expectedToken, token)
		})
	}
}

func TestJWTRoundTrip(t *testing.T) {
	secret := "test-secret-that-is-at-least-32-chars-long"
	userID := "user-abc-123"
	tenantID := "tenant-xyz-789"
	email := "roundtrip@example.com"
	name := "Round Trip User"
	role := "admin"

	// Create token
	token, err := CreateLocalJWT(userID, tenantID, email, name, role, secret, false)
	require.NoError(t, err)

	// Validate and extract claims
	claims, err := ValidateLocalJWT(token, secret)
	require.NoError(t, err)

	// Verify all claims match
	assert.Equal(t, userID, claims.Subject)
	assert.Equal(t, tenantID, claims.TenantID)
	assert.Equal(t, email, claims.Email)
	assert.Equal(t, name, claims.Name)
	assert.Equal(t, role, claims.Role)
	assert.Equal(t, "apis-server", claims.Issuer)
}
