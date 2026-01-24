package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetAuthConfig(t *testing.T) {
	t.Run("returns configured values", func(t *testing.T) {
		// Set environment variables
		os.Setenv("ZITADEL_ISSUER", "https://auth.example.com")
		os.Setenv("ZITADEL_CLIENT_ID", "test-client-123")
		defer func() {
			os.Unsetenv("ZITADEL_ISSUER")
			os.Unsetenv("ZITADEL_CLIENT_ID")
		}()

		req := httptest.NewRequest(http.MethodGet, "/api/auth/config", nil)
		w := httptest.NewRecorder()

		GetAuthConfig(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Equal(t, "application/json", w.Header().Get("Content-Type"))

		var config AuthConfig
		err := json.NewDecoder(w.Body).Decode(&config)
		require.NoError(t, err)

		assert.Equal(t, "https://auth.example.com", config.Issuer)
		assert.Equal(t, "test-client-123", config.ClientID)
	})

	t.Run("returns empty values when env vars not set", func(t *testing.T) {
		// Clear environment variables
		os.Unsetenv("ZITADEL_ISSUER")
		os.Unsetenv("ZITADEL_CLIENT_ID")

		req := httptest.NewRequest(http.MethodGet, "/api/auth/config", nil)
		w := httptest.NewRecorder()

		GetAuthConfig(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var config AuthConfig
		err := json.NewDecoder(w.Body).Decode(&config)
		require.NoError(t, err)

		assert.Empty(t, config.Issuer)
		assert.Empty(t, config.ClientID)
	})

	t.Run("returns JSON content type", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/auth/config", nil)
		w := httptest.NewRecorder()

		GetAuthConfig(w, req)

		assert.Equal(t, "application/json", w.Header().Get("Content-Type"))
	})
}

func TestAuthConfigStruct(t *testing.T) {
	t.Run("JSON serialization", func(t *testing.T) {
		config := AuthConfig{
			Issuer:   "https://auth.example.com",
			ClientID: "client-123",
		}

		data, err := json.Marshal(config)
		require.NoError(t, err)

		var decoded AuthConfig
		err = json.Unmarshal(data, &decoded)
		require.NoError(t, err)

		assert.Equal(t, config.Issuer, decoded.Issuer)
		assert.Equal(t, config.ClientID, decoded.ClientID)
	})

	t.Run("JSON field names", func(t *testing.T) {
		config := AuthConfig{
			Issuer:   "https://auth.example.com",
			ClientID: "client-123",
		}

		data, err := json.Marshal(config)
		require.NoError(t, err)

		// Verify JSON field names
		jsonStr := string(data)
		assert.Contains(t, jsonStr, `"issuer"`)
		assert.Contains(t, jsonStr, `"client_id"`)
	})
}
