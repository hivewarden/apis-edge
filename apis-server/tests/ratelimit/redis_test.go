package ratelimit_test

import (
	"os"
	"testing"
	"time"

	"github.com/jermoo/apis/apis-server/internal/ratelimit"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// skipIfNoRedis skips the test if Redis is not available.
// Set REDIS_URL environment variable to run these tests.
func skipIfNoRedis(t *testing.T) {
	t.Helper()
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		t.Skip("REDIS_URL not set, skipping Redis rate limiter tests")
	}
}

func getRedisURL(t *testing.T) string {
	t.Helper()
	skipIfNoRedis(t)
	return os.Getenv("REDIS_URL")
}

func TestRedisLimiter_AllowsUpToLimit(t *testing.T) {
	redisURL := getRedisURL(t)

	config := ratelimit.Config{
		MaxRequests:  3,
		WindowPeriod: 15 * time.Minute,
	}
	redisConfig := ratelimit.RedisConfig{
		URL:       redisURL,
		KeyPrefix: "test:allowuptolimit",
	}

	limiter, err := ratelimit.NewRedisLimiter(config, redisConfig)
	require.NoError(t, err)
	defer limiter.Stop()

	key := "test@example.com"
	// Clear any existing data
	limiter.Clear(key)

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

	// Cleanup
	limiter.Clear(key)
}

func TestRedisLimiter_DifferentKeysAreIndependent(t *testing.T) {
	redisURL := getRedisURL(t)

	config := ratelimit.Config{
		MaxRequests:  2,
		WindowPeriod: 15 * time.Minute,
	}
	redisConfig := ratelimit.RedisConfig{
		URL:       redisURL,
		KeyPrefix: "test:diffkeys",
	}

	limiter, err := ratelimit.NewRedisLimiter(config, redisConfig)
	require.NoError(t, err)
	defer limiter.Stop()

	key1 := "user1@example.com"
	key2 := "user2@example.com"

	// Clear any existing data
	limiter.Clear(key1)
	limiter.Clear(key2)

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

	// Cleanup
	limiter.Clear(key1)
	limiter.Clear(key2)
}

func TestRedisLimiter_Clear(t *testing.T) {
	redisURL := getRedisURL(t)

	config := ratelimit.Config{
		MaxRequests:  2,
		WindowPeriod: 15 * time.Minute,
	}
	redisConfig := ratelimit.RedisConfig{
		URL:       redisURL,
		KeyPrefix: "test:clear",
	}

	limiter, err := ratelimit.NewRedisLimiter(config, redisConfig)
	require.NoError(t, err)
	defer limiter.Stop()

	key := "test@example.com"
	// Clear any existing data
	limiter.Clear(key)

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

	// Cleanup
	limiter.Clear(key)
}

func TestRedisLimiter_ResetTime(t *testing.T) {
	redisURL := getRedisURL(t)

	config := ratelimit.Config{
		MaxRequests:  2,
		WindowPeriod: 15 * time.Minute,
	}
	redisConfig := ratelimit.RedisConfig{
		URL:       redisURL,
		KeyPrefix: "test:resettime",
	}

	limiter, err := ratelimit.NewRedisLimiter(config, redisConfig)
	require.NoError(t, err)
	defer limiter.Stop()

	key := "test@example.com"
	// Clear any existing data
	limiter.Clear(key)
	now := time.Now()

	// Make a request
	_, _, resetAt, err := limiter.Check(key)
	require.NoError(t, err)

	// Reset time should be approximately now + window period
	expectedReset := now.Add(config.WindowPeriod)
	assert.WithinDuration(t, expectedReset, resetAt, 5*time.Second, "reset time should be window period from now")

	// Cleanup
	limiter.Clear(key)
}

func TestRedisLimiter_InvalidURL(t *testing.T) {
	config := ratelimit.Config{
		MaxRequests:  5,
		WindowPeriod: 15 * time.Minute,
	}
	redisConfig := ratelimit.RedisConfig{
		URL:       "invalid-url",
		KeyPrefix: "test",
	}

	_, err := ratelimit.NewRedisLimiter(config, redisConfig)
	assert.Error(t, err, "should fail with invalid URL")
}

func TestRedisLimiter_EmptyURL(t *testing.T) {
	config := ratelimit.Config{
		MaxRequests:  5,
		WindowPeriod: 15 * time.Minute,
	}
	redisConfig := ratelimit.RedisConfig{
		URL:       "",
		KeyPrefix: "test",
	}

	_, err := ratelimit.NewRedisLimiter(config, redisConfig)
	assert.Error(t, err, "should fail with empty URL")
	assert.Contains(t, err.Error(), "not configured")
}

func TestRedisLimiter_DefaultKeyPrefix(t *testing.T) {
	redisURL := getRedisURL(t)

	config := ratelimit.Config{
		MaxRequests:  5,
		WindowPeriod: 15 * time.Minute,
	}
	redisConfig := ratelimit.RedisConfig{
		URL:       redisURL,
		KeyPrefix: "", // Should default to "ratelimit"
	}

	limiter, err := ratelimit.NewRedisLimiter(config, redisConfig)
	require.NoError(t, err)
	defer limiter.Stop()

	// Just verify it works with default prefix
	key := "test-default-prefix"
	limiter.Clear(key)
	allowed, _, _, err := limiter.Check(key)
	require.NoError(t, err)
	assert.True(t, allowed)

	// Cleanup
	limiter.Clear(key)
}

func TestRedisLimiter_ShortWindow(t *testing.T) {
	redisURL := getRedisURL(t)

	// Use a very short window for testing expiration
	config := ratelimit.Config{
		MaxRequests:  2,
		WindowPeriod: 200 * time.Millisecond,
	}
	redisConfig := ratelimit.RedisConfig{
		URL:       redisURL,
		KeyPrefix: "test:shortwindow",
	}

	limiter, err := ratelimit.NewRedisLimiter(config, redisConfig)
	require.NoError(t, err)
	defer limiter.Stop()

	key := "test@example.com"
	// Clear any existing data
	limiter.Clear(key)

	// Use up all attempts
	limiter.Check(key)
	limiter.Check(key)

	// Should be blocked
	allowed, _, _, _ := limiter.Check(key)
	assert.False(t, allowed)

	// Wait for window to expire
	time.Sleep(250 * time.Millisecond)

	// Should be allowed again
	allowed, _, _, _ = limiter.Check(key)
	assert.True(t, allowed, "should be allowed after window expires")

	// Cleanup
	limiter.Clear(key)
}

func TestRedisLimiter_ConcurrentAccess(t *testing.T) {
	redisURL := getRedisURL(t)

	config := ratelimit.Config{
		MaxRequests:  100,
		WindowPeriod: 15 * time.Minute,
	}
	redisConfig := ratelimit.RedisConfig{
		URL:       redisURL,
		KeyPrefix: "test:concurrent",
	}

	limiter, err := ratelimit.NewRedisLimiter(config, redisConfig)
	require.NoError(t, err)
	defer limiter.Stop()

	key := "concurrent-test"
	// Clear any existing data
	limiter.Clear(key)

	done := make(chan bool)

	// Run multiple goroutines checking the same key
	for i := 0; i < 20; i++ {
		go func() {
			for j := 0; j < 5; j++ {
				limiter.Check(key)
			}
			done <- true
		}()
	}

	// Wait for all goroutines
	for i := 0; i < 20; i++ {
		<-done
	}

	// Should have handled concurrent requests without panic
	// Final check should work
	_, _, _, err = limiter.Check(key)
	assert.NoError(t, err)

	// Cleanup
	limiter.Clear(key)
}

func TestNewLimiter_MemoryBackend(t *testing.T) {
	// Ensure we get memory backend when RATE_LIMIT_BACKEND is not "redis"
	originalBackend := os.Getenv("RATE_LIMIT_BACKEND")
	originalRedisURL := os.Getenv("REDIS_URL")
	defer func() {
		os.Setenv("RATE_LIMIT_BACKEND", originalBackend)
		os.Setenv("REDIS_URL", originalRedisURL)
	}()

	// Unset Redis configuration
	os.Setenv("RATE_LIMIT_BACKEND", "memory")
	os.Setenv("REDIS_URL", "")

	config := ratelimit.Config{
		MaxRequests:  5,
		WindowPeriod: 15 * time.Minute,
	}

	limiter := ratelimit.NewLimiter(config, "test")
	require.NotNil(t, limiter)
	defer limiter.Stop()

	// Verify it works
	allowed, remaining, _, err := limiter.Check("test-key")
	require.NoError(t, err)
	assert.True(t, allowed)
	assert.Equal(t, 4, remaining)
}

func TestNewLimiter_RedisBackend(t *testing.T) {
	redisURL := getRedisURL(t)

	originalBackend := os.Getenv("RATE_LIMIT_BACKEND")
	originalRedisURL := os.Getenv("REDIS_URL")
	defer func() {
		os.Setenv("RATE_LIMIT_BACKEND", originalBackend)
		os.Setenv("REDIS_URL", originalRedisURL)
	}()

	// Set Redis configuration
	os.Setenv("RATE_LIMIT_BACKEND", "redis")
	os.Setenv("REDIS_URL", redisURL)

	config := ratelimit.Config{
		MaxRequests:  5,
		WindowPeriod: 15 * time.Minute,
	}

	limiter := ratelimit.NewLimiter(config, "test:newlimiter")
	require.NotNil(t, limiter)
	defer limiter.Stop()

	// Clear and verify it works
	limiter.Clear("test-key")
	allowed, remaining, _, err := limiter.Check("test-key")
	require.NoError(t, err)
	assert.True(t, allowed)
	assert.Equal(t, 4, remaining)

	// Cleanup
	limiter.Clear("test-key")
}

func TestNewLimiter_FallbackToMemory(t *testing.T) {
	// Ensure we fall back to memory when Redis is configured but unavailable
	originalBackend := os.Getenv("RATE_LIMIT_BACKEND")
	originalRedisURL := os.Getenv("REDIS_URL")
	defer func() {
		os.Setenv("RATE_LIMIT_BACKEND", originalBackend)
		os.Setenv("REDIS_URL", originalRedisURL)
	}()

	// Set Redis configuration with invalid URL
	os.Setenv("RATE_LIMIT_BACKEND", "redis")
	os.Setenv("REDIS_URL", "redis://localhost:9999") // Invalid port, should fail to connect

	config := ratelimit.Config{
		MaxRequests:  5,
		WindowPeriod: 15 * time.Minute,
	}

	// Should fall back to memory limiter without panic
	limiter := ratelimit.NewLimiter(config, "test")
	require.NotNil(t, limiter)
	defer limiter.Stop()

	// Verify it works (using memory backend)
	allowed, remaining, _, err := limiter.Check("test-key")
	require.NoError(t, err)
	assert.True(t, allowed)
	assert.Equal(t, 4, remaining)
}

func TestNewLimiter_RedisBackendWithEmptyURL(t *testing.T) {
	// Ensure we fall back to memory when RATE_LIMIT_BACKEND=redis but REDIS_URL is empty
	originalBackend := os.Getenv("RATE_LIMIT_BACKEND")
	originalRedisURL := os.Getenv("REDIS_URL")
	defer func() {
		os.Setenv("RATE_LIMIT_BACKEND", originalBackend)
		os.Setenv("REDIS_URL", originalRedisURL)
	}()

	// Set Redis backend but leave URL empty
	os.Setenv("RATE_LIMIT_BACKEND", "redis")
	os.Setenv("REDIS_URL", "") // Empty URL should fall back to memory

	config := ratelimit.Config{
		MaxRequests:  5,
		WindowPeriod: 15 * time.Minute,
	}

	// Should fall back to memory limiter without panic or error
	limiter := ratelimit.NewLimiter(config, "test:emptyurl")
	require.NotNil(t, limiter)
	defer limiter.Stop()

	// Verify it works (using memory backend)
	allowed, remaining, _, err := limiter.Check("test-key")
	require.NoError(t, err)
	assert.True(t, allowed)
	assert.Equal(t, 4, remaining)

	// Verify it's actually a memory limiter by checking prefix behavior
	// (Memory limiter with prefix should namespace keys correctly)
	limiter.Clear("test-key")
	allowed, remaining, _, err = limiter.Check("test-key")
	require.NoError(t, err)
	assert.True(t, allowed)
	assert.Equal(t, 4, remaining, "After clear, remaining should be max-1")
}
