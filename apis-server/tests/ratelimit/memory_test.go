package ratelimit_test

import (
	"testing"
	"time"

	"github.com/jermoo/apis/apis-server/internal/ratelimit"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMemoryLimiter_AllowsUpToLimit(t *testing.T) {
	config := ratelimit.Config{
		MaxRequests:  3,
		WindowPeriod: 15 * time.Minute,
	}
	limiter := ratelimit.NewMemoryLimiter(config)
	defer limiter.Stop()

	key := "test@example.com"

	// First 3 requests should be allowed
	for i := 0; i < 3; i++ {
		allowed, remaining, _, err := limiter.Check(key)
		require.NoError(t, err)
		assert.True(t, allowed, "request %d should be allowed", i+1)
		assert.Equal(t, 2-i, remaining, "remaining should decrease")
	}

	// 4th request should be denied
	allowed, remaining, _, err := limiter.Check(key)
	require.NoError(t, err)
	assert.False(t, allowed, "request beyond limit should be denied")
	assert.Equal(t, 0, remaining, "remaining should be 0 when denied")
}

func TestMemoryLimiter_DifferentKeysAreIndependent(t *testing.T) {
	config := ratelimit.Config{
		MaxRequests:  2,
		WindowPeriod: 15 * time.Minute,
	}
	limiter := ratelimit.NewMemoryLimiter(config)
	defer limiter.Stop()

	key1 := "user1@example.com"
	key2 := "user2@example.com"

	// Use up all attempts for key1
	for i := 0; i < 2; i++ {
		allowed, _, _, _ := limiter.Check(key1)
		assert.True(t, allowed)
	}

	// Key1 should be blocked
	allowed, _, _, _ := limiter.Check(key1)
	assert.False(t, allowed, "key1 should be blocked")

	// Key2 should still be allowed
	allowed, _, _, _ = limiter.Check(key2)
	assert.True(t, allowed, "key2 should be allowed")
}

func TestMemoryLimiter_Clear(t *testing.T) {
	config := ratelimit.Config{
		MaxRequests:  2,
		WindowPeriod: 15 * time.Minute,
	}
	limiter := ratelimit.NewMemoryLimiter(config)
	defer limiter.Stop()

	key := "test@example.com"

	// Use up all attempts
	for i := 0; i < 2; i++ {
		limiter.Check(key)
	}

	// Should be blocked
	allowed, _, _, _ := limiter.Check(key)
	assert.False(t, allowed)

	// Clear the key
	limiter.Clear(key)

	// Should be allowed again
	allowed, remaining, _, _ := limiter.Check(key)
	assert.True(t, allowed, "should be allowed after clear")
	assert.Equal(t, 1, remaining, "remaining should be reset to max-1")
}

func TestMemoryLimiter_ResetTime(t *testing.T) {
	config := ratelimit.Config{
		MaxRequests:  2,
		WindowPeriod: 15 * time.Minute,
	}
	limiter := ratelimit.NewMemoryLimiter(config)
	defer limiter.Stop()

	key := "test@example.com"
	now := time.Now()

	// Make a request
	_, _, resetAt, err := limiter.Check(key)
	require.NoError(t, err)

	// Reset time should be approximately now + window period
	expectedReset := now.Add(config.WindowPeriod)
	assert.WithinDuration(t, expectedReset, resetAt, 2*time.Second, "reset time should be window period from now")
}

func TestMemoryLimiter_GetAttemptCount(t *testing.T) {
	config := ratelimit.Config{
		MaxRequests:  5,
		WindowPeriod: 15 * time.Minute,
	}
	limiter := ratelimit.NewMemoryLimiter(config)
	defer limiter.Stop()

	key := "test@example.com"

	// Initially 0
	assert.Equal(t, 0, limiter.GetAttemptCount(key))

	// After 3 attempts
	limiter.Check(key)
	limiter.Check(key)
	limiter.Check(key)
	assert.Equal(t, 3, limiter.GetAttemptCount(key))

	// After clear
	limiter.Clear(key)
	assert.Equal(t, 0, limiter.GetAttemptCount(key))
}

func TestMemoryLimiter_GetEntryCount(t *testing.T) {
	config := ratelimit.Config{
		MaxRequests:  5,
		WindowPeriod: 15 * time.Minute,
	}
	limiter := ratelimit.NewMemoryLimiter(config)
	defer limiter.Stop()

	// Initially 0
	assert.Equal(t, 0, limiter.GetEntryCount())

	// After requests to different keys
	limiter.Check("key1")
	limiter.Check("key2")
	limiter.Check("key3")
	assert.Equal(t, 3, limiter.GetEntryCount())

	// Clear one key
	limiter.Clear("key2")
	assert.Equal(t, 2, limiter.GetEntryCount())
}

func TestMemoryLimiter_ConcurrentAccess(t *testing.T) {
	config := ratelimit.Config{
		MaxRequests:  100,
		WindowPeriod: 15 * time.Minute,
	}
	limiter := ratelimit.NewMemoryLimiter(config)
	defer limiter.Stop()

	key := "concurrent-test"
	done := make(chan bool)

	// Run multiple goroutines checking the same key
	for i := 0; i < 50; i++ {
		go func() {
			for j := 0; j < 10; j++ {
				limiter.Check(key)
			}
			done <- true
		}()
	}

	// Wait for all goroutines
	for i := 0; i < 50; i++ {
		<-done
	}

	// Should have recorded attempts without panic
	count := limiter.GetAttemptCount(key)
	assert.LessOrEqual(t, count, 100, "should not exceed max requests")
}

func TestMemoryLimiter_ShortWindow(t *testing.T) {
	// Use a very short window for testing expiration
	config := ratelimit.Config{
		MaxRequests:  2,
		WindowPeriod: 100 * time.Millisecond,
	}
	limiter := ratelimit.NewMemoryLimiter(config)
	defer limiter.Stop()

	key := "test@example.com"

	// Use up all attempts
	limiter.Check(key)
	limiter.Check(key)

	// Should be blocked
	allowed, _, _, _ := limiter.Check(key)
	assert.False(t, allowed)

	// Wait for window to expire
	time.Sleep(150 * time.Millisecond)

	// Should be allowed again
	allowed, _, _, _ = limiter.Check(key)
	assert.True(t, allowed, "should be allowed after window expires")
}

func TestMemoryLimiter_GetConfig(t *testing.T) {
	config := ratelimit.Config{
		MaxRequests:  10,
		WindowPeriod: 30 * time.Minute,
	}
	limiter := ratelimit.NewMemoryLimiter(config)
	defer limiter.Stop()

	retrievedConfig := limiter.GetConfig()
	assert.Equal(t, config.MaxRequests, retrievedConfig.MaxRequests)
	assert.Equal(t, config.WindowPeriod, retrievedConfig.WindowPeriod)
}

func TestRateLimitInfo_RetryAfterSeconds(t *testing.T) {
	tests := []struct {
		name     string
		resetAt  time.Time
		expected int
	}{
		{
			name:     "future reset returns positive seconds",
			resetAt:  time.Now().Add(60 * time.Second),
			expected: 60,
		},
		{
			name:     "past reset returns minimum 1",
			resetAt:  time.Now().Add(-10 * time.Second),
			expected: 1,
		},
		{
			name:     "now returns minimum 1",
			resetAt:  time.Now(),
			expected: 1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			info := ratelimit.RateLimitInfo{ResetAt: tt.resetAt}
			result := info.RetryAfterSeconds()
			// Allow some tolerance for timing
			assert.InDelta(t, tt.expected, result, 2)
		})
	}
}

func TestDefaultConfig(t *testing.T) {
	config := ratelimit.DefaultConfig()
	assert.Equal(t, 5, config.MaxRequests)
	assert.Equal(t, 15*time.Minute, config.WindowPeriod)
}

func TestMemoryLimiter_WithPrefix(t *testing.T) {
	config := ratelimit.Config{
		MaxRequests:  2,
		WindowPeriod: 15 * time.Minute,
	}

	// Create two limiters with different prefixes
	limiter1 := ratelimit.NewMemoryLimiterWithPrefix(config, "login:email")
	defer limiter1.Stop()
	limiter2 := ratelimit.NewMemoryLimiterWithPrefix(config, "login:ip")
	defer limiter2.Stop()

	// Verify prefix is stored
	assert.Equal(t, "login:email", limiter1.GetPrefix())
	assert.Equal(t, "login:ip", limiter2.GetPrefix())

	// Same key should be independent between limiters with different prefixes
	key := "test@example.com"

	// Use up all attempts on limiter1
	limiter1.Check(key)
	limiter1.Check(key)
	allowed, _, _, _ := limiter1.Check(key)
	assert.False(t, allowed, "limiter1 should block the key")

	// limiter2 should still allow the same key
	allowed, _, _, _ = limiter2.Check(key)
	assert.True(t, allowed, "limiter2 should allow the same key (different prefix)")
}

func TestMemoryLimiter_WithEmptyPrefix(t *testing.T) {
	config := ratelimit.Config{
		MaxRequests:  2,
		WindowPeriod: 15 * time.Minute,
	}

	// NewMemoryLimiter should create a limiter with empty prefix
	limiter := ratelimit.NewMemoryLimiter(config)
	defer limiter.Stop()

	assert.Equal(t, "", limiter.GetPrefix())

	// It should still work normally
	key := "test@example.com"
	allowed, remaining, _, _ := limiter.Check(key)
	assert.True(t, allowed)
	assert.Equal(t, 1, remaining)
}

func TestMemoryLimiter_PrefixAffectsAllOperations(t *testing.T) {
	config := ratelimit.Config{
		MaxRequests:  3,
		WindowPeriod: 15 * time.Minute,
	}

	limiter := ratelimit.NewMemoryLimiterWithPrefix(config, "test:prefix")
	defer limiter.Stop()

	key := "mykey"

	// Check should use prefix
	limiter.Check(key)
	limiter.Check(key)
	assert.Equal(t, 2, limiter.GetAttemptCount(key))

	// Clear should use prefix
	limiter.Clear(key)
	assert.Equal(t, 0, limiter.GetAttemptCount(key))
}
