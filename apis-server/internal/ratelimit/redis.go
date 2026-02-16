// Package ratelimit provides rate limiting implementations for auth endpoints.
package ratelimit

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
)

// RedisLimiter implements the Limiter interface using Redis.
// It uses sorted sets with timestamps for sliding window rate limiting.
// This implementation is suitable for multi-instance deployments (SaaS mode)
// where rate limits need to be shared across all server instances.
type RedisLimiter struct {
	client *redis.Client
	config Config
	prefix string // Key prefix to namespace different rate limiters
}

// RedisConfig holds Redis connection configuration.
type RedisConfig struct {
	// URL is the Redis connection URL (e.g., "redis://localhost:6379")
	URL string

	// KeyPrefix is prepended to all keys for namespacing
	KeyPrefix string
}

// NewRedisLimiter creates a new Redis-backed rate limiter.
// Returns nil if Redis is not available or not configured.
func NewRedisLimiter(config Config, redisConfig RedisConfig) (*RedisLimiter, error) {
	if redisConfig.URL == "" {
		return nil, fmt.Errorf("ratelimit: Redis URL not configured")
	}

	opts, err := redis.ParseURL(redisConfig.URL)
	if err != nil {
		return nil, fmt.Errorf("ratelimit: failed to parse Redis URL: %w", err)
	}

	client := redis.NewClient(opts)

	// Test connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("ratelimit: failed to connect to Redis: %w", err)
	}

	prefix := redisConfig.KeyPrefix
	if prefix == "" {
		prefix = "ratelimit"
	}

	log.Info().
		Str("prefix", prefix).
		Int("max_requests", config.MaxRequests).
		Dur("window_period", config.WindowPeriod).
		Msg("Redis rate limiter initialized")

	return &RedisLimiter{
		client: client,
		config: config,
		prefix: prefix,
	}, nil
}

// luaScript is the Lua script for atomic sliding window rate limiting.
// It removes expired entries, checks the count, and adds a new entry if allowed.
var luaScript = redis.NewScript(`
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local window_start = now - window

-- Remove expired entries
redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)

-- Count current entries
local count = redis.call('ZCARD', key)

-- Calculate reset time (oldest entry + window, or now + window if empty)
local reset_time = now + window
local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
if #oldest > 0 then
    reset_time = tonumber(oldest[2]) + window
end

if count >= limit then
    -- Rate limited - return denial info
    return {0, limit - count, reset_time}
end

-- Add new entry with unique score (timestamp + random suffix to avoid collisions)
local score = now
local member = tostring(now) .. '-' .. tostring(math.random(1000000))
redis.call('ZADD', key, score, member)

-- Set TTL to ensure cleanup of abandoned keys
redis.call('EXPIRE', key, math.ceil(window / 1000000000) + 60)

return {1, limit - count - 1, reset_time}
`)

// Check implements Limiter.Check using Redis sorted sets for sliding window.
func (rl *RedisLimiter) Check(key string) (allowed bool, remaining int, resetAt time.Time, err error) {
	ctx := context.Background()
	fullKey := fmt.Sprintf("%s:%s", rl.prefix, key)
	now := time.Now()
	nowNanos := now.UnixNano()
	windowNanos := int64(rl.config.WindowPeriod)

	result, err := luaScript.Run(ctx, rl.client, []string{fullKey}, nowNanos, windowNanos, rl.config.MaxRequests).Slice()
	if err != nil {
		// SECURITY FIX (S1-M5): Enhanced fail-open logging with prominent warning.
		// When Redis is unavailable, rate limiting is effectively disabled. This is
		// intentional for availability (fail-open), but operators must be alerted.
		// In production, set up alerting on this log message.
		log.Warn().Err(err).
			Str("key", key).
			Str("prefix", rl.prefix).
			Msg("RATE LIMITING DEGRADED: Redis unavailable, allowing request without rate limit check. " +
				"Rate limiting is effectively disabled until Redis recovers. " +
				"Consider using RATE_LIMIT_BACKEND=memory as fallback.")
		return true, rl.config.MaxRequests - 1, now.Add(rl.config.WindowPeriod), nil
	}

	// Parse Lua script result: [allowed, remaining, reset_timestamp_nanos]
	allowedInt := result[0].(int64)
	remainingInt := result[1].(int64)
	resetNanos := result[2].(int64)

	allowed = allowedInt == 1
	remaining = int(remainingInt)
	if remaining < 0 {
		remaining = 0
	}
	resetAt = time.Unix(0, resetNanos)

	return allowed, remaining, resetAt, nil
}

// Clear implements Limiter.Clear by removing all tracking for a key.
func (rl *RedisLimiter) Clear(key string) {
	ctx := context.Background()
	fullKey := fmt.Sprintf("%s:%s", rl.prefix, key)

	if err := rl.client.Del(ctx, fullKey).Err(); err != nil {
		log.Error().Err(err).Str("key", key).Msg("Redis rate limit clear failed")
	}
}

// Stop implements Limiter.Stop by closing the Redis connection.
func (rl *RedisLimiter) Stop() {
	if rl.client != nil {
		if err := rl.client.Close(); err != nil {
			log.Error().Err(err).Msg("Failed to close Redis connection")
		}
	}
}

// GetConfig implements Limiter.GetConfig.
func (rl *RedisLimiter) GetConfig() Config {
	return rl.config
}

// Backend is the type of rate limiter backend.
type Backend string

const (
	// BackendMemory uses in-memory rate limiting (default, single instance).
	BackendMemory Backend = "memory"
	// BackendRedis uses Redis rate limiting (scalable, multi-instance).
	BackendRedis Backend = "redis"
)

// NewLimiter creates a rate limiter based on configuration.
// If RATE_LIMIT_BACKEND=redis and REDIS_URL is set, uses Redis.
// Otherwise, uses in-memory backend.
// The keyPrefix is used for namespacing in both Redis and memory backends.
func NewLimiter(config Config, keyPrefix string) Limiter {
	backend := Backend(os.Getenv("RATE_LIMIT_BACKEND"))
	redisURL := os.Getenv("REDIS_URL")

	if backend == BackendRedis && redisURL != "" {
		limiter, err := NewRedisLimiter(config, RedisConfig{
			URL:       redisURL,
			KeyPrefix: keyPrefix,
		})
		if err != nil {
			log.Warn().Err(err).Msg("Failed to create Redis rate limiter, falling back to memory")
		} else {
			return limiter
		}
	}

	// Default to memory backend with keyPrefix
	return NewMemoryLimiterWithPrefix(config, keyPrefix)
}
