package services_test

import (
	"os"
	"testing"

	"github.com/jermoo/apis/apis-server/internal/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewEncryptionService_NoKey(t *testing.T) {
	// Ensure no key is set
	os.Unsetenv(services.BeeBrainEncryptionKeyEnv)

	svc, err := services.NewEncryptionService()
	require.NoError(t, err)
	assert.Nil(t, svc, "service should be nil when no key is set")
}

func TestNewEncryptionService_KeyTooShort(t *testing.T) {
	os.Setenv(services.BeeBrainEncryptionKeyEnv, "short-key")
	defer os.Unsetenv(services.BeeBrainEncryptionKeyEnv)

	svc, err := services.NewEncryptionService()
	assert.Error(t, err)
	assert.Nil(t, svc)
	assert.Equal(t, services.ErrEncryptionKeyTooShort, err)
}

func TestNewEncryptionService_ValidKey(t *testing.T) {
	// 32-byte key
	os.Setenv(services.BeeBrainEncryptionKeyEnv, "12345678901234567890123456789012")
	defer os.Unsetenv(services.BeeBrainEncryptionKeyEnv)

	svc, err := services.NewEncryptionService()
	require.NoError(t, err)
	assert.NotNil(t, svc)
	assert.True(t, svc.IsConfigured())
}

func TestNewEncryptionService_LongerKey(t *testing.T) {
	// Key longer than 32 bytes should work (truncated)
	os.Setenv(services.BeeBrainEncryptionKeyEnv, "1234567890123456789012345678901234567890")
	defer os.Unsetenv(services.BeeBrainEncryptionKeyEnv)

	svc, err := services.NewEncryptionService()
	require.NoError(t, err)
	assert.NotNil(t, svc)
	assert.True(t, svc.IsConfigured())
}

func TestEncryptDecrypt_RoundTrip(t *testing.T) {
	os.Setenv(services.BeeBrainEncryptionKeyEnv, "12345678901234567890123456789012")
	defer os.Unsetenv(services.BeeBrainEncryptionKeyEnv)

	svc, err := services.NewEncryptionService()
	require.NoError(t, err)

	testCases := []struct {
		name      string
		plaintext string
	}{
		{"simple", "sk-abc123"},
		{"empty", ""},
		{"long", "sk-verylongapikey1234567890abcdefghijklmnopqrstuvwxyz"},
		{"special chars", "sk-key!@#$%^&*()_+-=[]{}|;':\",./<>?"},
		{"unicode", "sk-key-日本語-한국어-中文"},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			encrypted, err := svc.EncryptAPIKey(tc.plaintext)
			require.NoError(t, err)

			if tc.plaintext == "" {
				assert.Empty(t, encrypted)
				return
			}

			assert.NotEqual(t, tc.plaintext, encrypted, "ciphertext should differ from plaintext")
			assert.NotEmpty(t, encrypted)

			decrypted, err := svc.DecryptAPIKey(encrypted)
			require.NoError(t, err)
			assert.Equal(t, tc.plaintext, decrypted)
		})
	}
}

func TestEncrypt_ProducesDifferentCiphertexts(t *testing.T) {
	os.Setenv(services.BeeBrainEncryptionKeyEnv, "12345678901234567890123456789012")
	defer os.Unsetenv(services.BeeBrainEncryptionKeyEnv)

	svc, err := services.NewEncryptionService()
	require.NoError(t, err)

	plaintext := "sk-abc123"

	// Encrypt the same plaintext multiple times
	ciphertexts := make(map[string]bool)
	for i := 0; i < 10; i++ {
		encrypted, err := svc.EncryptAPIKey(plaintext)
		require.NoError(t, err)
		ciphertexts[encrypted] = true
	}

	// All ciphertexts should be unique (random nonce)
	assert.Equal(t, 10, len(ciphertexts), "each encryption should produce unique ciphertext due to random nonce")
}

func TestDecrypt_InvalidCiphertext(t *testing.T) {
	os.Setenv(services.BeeBrainEncryptionKeyEnv, "12345678901234567890123456789012")
	defer os.Unsetenv(services.BeeBrainEncryptionKeyEnv)

	svc, err := services.NewEncryptionService()
	require.NoError(t, err)

	testCases := []struct {
		name       string
		ciphertext string
	}{
		{"not base64", "not-valid-base64!!!"},
		{"too short", "YWJj"}, // "abc" in base64, too short for nonce
		{"corrupted", "dGVzdGluZzEyMzQ1Njc4OTAxMjM0NTY3ODkwYWJjZGVm"}, // valid base64, but invalid ciphertext
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := svc.DecryptAPIKey(tc.ciphertext)
			assert.Error(t, err)
		})
	}
}

func TestEncrypt_NoService(t *testing.T) {
	var svc *services.EncryptionService = nil

	_, err := svc.EncryptAPIKey("test")
	assert.Error(t, err)
	assert.Equal(t, services.ErrEncryptionKeyNotSet, err)
}

func TestDecrypt_NoService(t *testing.T) {
	var svc *services.EncryptionService = nil

	_, err := svc.DecryptAPIKey("test")
	assert.Error(t, err)
	assert.Equal(t, services.ErrEncryptionKeyNotSet, err)
}

func TestValidateEncryptionKey(t *testing.T) {
	testCases := []struct {
		name    string
		backend string
		key     string
		wantErr bool
	}{
		{"rules backend, no key", "rules", "", false},
		{"local backend, no key", "local", "", false},
		{"external backend, no key", "external", "", true},
		{"external backend, short key", "external", "short", true},
		{"external backend, valid key", "external", "12345678901234567890123456789012", false},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			if tc.key != "" {
				os.Setenv(services.BeeBrainEncryptionKeyEnv, tc.key)
				defer os.Unsetenv(services.BeeBrainEncryptionKeyEnv)
			} else {
				os.Unsetenv(services.BeeBrainEncryptionKeyEnv)
			}

			err := services.ValidateEncryptionKey(tc.backend)
			if tc.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestIsConfigured(t *testing.T) {
	// Nil service
	var nilSvc *services.EncryptionService
	assert.False(t, nilSvc.IsConfigured())

	// Valid service
	os.Setenv(services.BeeBrainEncryptionKeyEnv, "12345678901234567890123456789012")
	defer os.Unsetenv(services.BeeBrainEncryptionKeyEnv)

	svc, err := services.NewEncryptionService()
	require.NoError(t, err)
	assert.True(t, svc.IsConfigured())
}
