// Package services provides business logic services for the APIS server.
package services

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"os"
)

const (
	// BeeBrainEncryptionKeyEnv is the environment variable for the encryption key.
	BeeBrainEncryptionKeyEnv = "BEEBRAIN_ENCRYPTION_KEY"

	// MinKeyLength is the minimum required key length for AES-256.
	MinKeyLength = 32
)

var (
	// ErrEncryptionKeyNotSet is returned when the encryption key is not configured.
	ErrEncryptionKeyNotSet = errors.New("BEEBRAIN_ENCRYPTION_KEY environment variable not set")

	// ErrEncryptionKeyTooShort is returned when the encryption key is too short.
	ErrEncryptionKeyTooShort = errors.New("BEEBRAIN_ENCRYPTION_KEY must be at least 32 bytes")

	// ErrDecryptionFailed is returned when decryption fails.
	ErrDecryptionFailed = errors.New("failed to decrypt data")

	// ErrInvalidCiphertext is returned when the ciphertext is invalid.
	ErrInvalidCiphertext = errors.New("invalid ciphertext format")
)

// EncryptionService provides AES-256-GCM encryption for sensitive data.
type EncryptionService struct {
	key []byte
}

// NewEncryptionService creates a new encryption service using the key from environment.
// Returns nil if no key is configured (allows rules-only mode without encryption).
func NewEncryptionService() (*EncryptionService, error) {
	keyStr := os.Getenv(BeeBrainEncryptionKeyEnv)
	if keyStr == "" {
		// No key configured - service will be nil, only rules backend allowed
		return nil, nil
	}

	key := []byte(keyStr)
	if len(key) < MinKeyLength {
		return nil, ErrEncryptionKeyTooShort
	}

	// Use first 32 bytes if key is longer
	if len(key) > MinKeyLength {
		key = key[:MinKeyLength]
	}

	return &EncryptionService{key: key}, nil
}

// IsConfigured returns true if the encryption service is available.
func (s *EncryptionService) IsConfigured() bool {
	return s != nil && len(s.key) >= MinKeyLength
}

// EncryptAPIKey encrypts a plaintext API key using AES-256-GCM.
// Returns a base64-encoded ciphertext string.
func (s *EncryptionService) EncryptAPIKey(plaintext string) (string, error) {
	if s == nil || len(s.key) < MinKeyLength {
		return "", ErrEncryptionKeyNotSet
	}

	if plaintext == "" {
		return "", nil
	}

	block, err := aes.NewCipher(s.key)
	if err != nil {
		return "", fmt.Errorf("failed to create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("failed to create GCM: %w", err)
	}

	// Create a random nonce
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("failed to generate nonce: %w", err)
	}

	// Encrypt and prepend nonce to ciphertext
	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)

	// Return base64-encoded result
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// DecryptAPIKey decrypts a base64-encoded ciphertext back to plaintext.
func (s *EncryptionService) DecryptAPIKey(ciphertext string) (string, error) {
	if s == nil || len(s.key) < MinKeyLength {
		return "", ErrEncryptionKeyNotSet
	}

	if ciphertext == "" {
		return "", nil
	}

	// Decode from base64
	data, err := base64.StdEncoding.DecodeString(ciphertext)
	if err != nil {
		return "", fmt.Errorf("failed to decode base64: %w", err)
	}

	block, err := aes.NewCipher(s.key)
	if err != nil {
		return "", fmt.Errorf("failed to create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("failed to create GCM: %w", err)
	}

	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return "", ErrInvalidCiphertext
	}

	nonce, ciphertextBytes := data[:nonceSize], data[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertextBytes, nil)
	if err != nil {
		return "", ErrDecryptionFailed
	}

	return string(plaintext), nil
}

// ValidateEncryptionKey checks if a valid encryption key is configured.
// Returns an error if external backend is requested but no key is available.
func ValidateEncryptionKey(backend string) error {
	if backend != "external" {
		// No encryption key required for rules or local backends
		return nil
	}

	keyStr := os.Getenv(BeeBrainEncryptionKeyEnv)
	if keyStr == "" {
		return ErrEncryptionKeyNotSet
	}

	if len(keyStr) < MinKeyLength {
		return ErrEncryptionKeyTooShort
	}

	return nil
}
