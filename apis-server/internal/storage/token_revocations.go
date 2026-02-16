package storage

import (
	"sync"
	"time"
)

// tokenRevocation represents a revoked JWT token entry.
type tokenRevocation struct {
	ExpiresAt time.Time
}

// TokenRevocationStore provides in-memory token revocation tracking.
// Revoked tokens are tracked until their natural expiry time, after which
// the entry is automatically cleaned up.
//
// SECURITY LIMITATION (S1-H3): This store is in-memory only. Revoked tokens
// will be "un-revoked" on server restart. This is acceptable because:
// 1. JWT lifetimes are short (24h default / 7d remember-me) per local_jwt.go
// 2. Persistent revocation requires database storage (adds latency to every request)
// 3. Server restarts are infrequent in production
//
// TODO: For high-security deployments, implement persistent token revocation
// using a database table (e.g., revoked_tokens) or Redis with TTL-based expiry.
// The persistent store should be checked in the auth middleware alongside this
// in-memory store for defense in depth.
type TokenRevocationStore struct {
	mu       sync.RWMutex
	revoked  map[string]tokenRevocation
	stopCh   chan struct{}
}

var globalRevocationStore *TokenRevocationStore
var revocationOnce sync.Once

// GetRevocationStore returns the singleton token revocation store.
func GetRevocationStore() *TokenRevocationStore {
	revocationOnce.Do(func() {
		globalRevocationStore = &TokenRevocationStore{
			revoked: make(map[string]tokenRevocation),
			stopCh:  make(chan struct{}),
		}
		go globalRevocationStore.cleanupLoop()
	})
	return globalRevocationStore
}

// RevokeToken marks a token as revoked until its natural expiry.
func (s *TokenRevocationStore) RevokeToken(jti string, expiresAt time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.revoked[jti] = tokenRevocation{ExpiresAt: expiresAt}
}

// IsRevoked checks if a token has been revoked.
func (s *TokenRevocationStore) IsRevoked(jti string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	_, exists := s.revoked[jti]
	return exists
}

// RevokeAllForUser revokes all tokens by adding a per-user marker.
// Since we don't track user->JTI mappings, this uses a convention:
// store a marker with key "user:<userID>" that handlers can check.
func (s *TokenRevocationStore) RevokeAllForUser(userID string, maxExpiry time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.revoked["user:"+userID] = tokenRevocation{ExpiresAt: maxExpiry}
}

// IsUserRevoked checks if all tokens for a user have been revoked.
func (s *TokenRevocationStore) IsUserRevoked(userID string, tokenIssuedAt time.Time) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	rev, exists := s.revoked["user:"+userID]
	if !exists {
		return false
	}
	// Token is revoked if it was issued before the revocation marker's expiry
	// (the marker was set at password change time, tokens issued before that are invalid)
	return tokenIssuedAt.Before(rev.ExpiresAt)
}

// cleanupLoop periodically removes expired revocation entries.
func (s *TokenRevocationStore) cleanupLoop() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			s.cleanup()
		case <-s.stopCh:
			return
		}
	}
}

func (s *TokenRevocationStore) cleanup() {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	for jti, rev := range s.revoked {
		if now.After(rev.ExpiresAt) {
			delete(s.revoked, jti)
		}
	}
}

// Stop halts the cleanup goroutine.
func (s *TokenRevocationStore) Stop() {
	close(s.stopCh)
}
