// Package storage provides database access and persistence for the APIS server.
//
// TODO (DL-M05): Several RLS policies (detections, hives, insights, hive_losses,
// season_recaps, overwintering_records, task_suggestions) use FOR ALL USING (...)
// without explicit WITH CHECK (...) clauses. While PostgreSQL applies the USING
// expression for both reads and writes when WITH CHECK is omitted, adding explicit
// WITH CHECK would improve auditability and defense-in-depth consistency. This
// should be done in a new migration (not by modifying existing migrations).
package storage

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jermoo/apis/apis-server/internal/secrets"
	"github.com/rs/zerolog/log"
)

// DB is the global database connection pool.
// Initialized via InitDB and closed via CloseDB.
//
// SECURITY NOTE (DL-M01): This is a package-level mutable global. Access is safe
// during normal operation because InitDB is called once at startup before any HTTP
// handlers run (happens-before via ListenAndServe), and CloseDB is called during
// graceful shutdown after the HTTP server has stopped accepting new requests.
// RequireConn panics if DB is nil, which is appropriate since it indicates a
// programming error (handler called without middleware or before initialization).
// TODO: For stricter Go memory model compliance, consider wrapping in sync.Once
// or passing the pool explicitly through the middleware chain.
var DB *pgxpool.Pool

// DefaultDatabaseURL is the default connection string for local development.
const DefaultDatabaseURL = "postgres://yugabyte:yugabyte@localhost:5433/apis"

// InitDB initializes the database connection pool.
// It prefers OpenBao-backed configuration when SECRETS_SOURCE=openbao, and
// deterministically falls back to environment variables when OpenBao is unavailable.
// Returns error if connection cannot be established.
func InitDB(ctx context.Context) error {
	databaseURL := os.Getenv("DATABASE_URL")

	secretsClient := secrets.NewClient()
	if strings.EqualFold(secretsClient.Source(), "env") && databaseURL != "" {
		log.Info().Msg("Using database config from DATABASE_URL (SECRETS_SOURCE=env)")
	} else {
		dbConfig, err := secretsClient.GetDatabaseConfig()
		if err != nil {
			return fmt.Errorf("resolve database config: %w", err)
		}
		databaseURL = dbConfig.ConnectionString()
	}

	if databaseURL == "" {
		databaseURL = DefaultDatabaseURL
		log.Warn().Msg("DATABASE_URL not set, using default: " + DefaultDatabaseURL)
	}

	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return fmt.Errorf("parse database URL: %w", err)
	}

	// Apply pool profile defaults, then allow env var overrides.
	// DB_POOL_PROFILE selects a preset: small (default), medium, large.
	// DB_MAX_CONNS / DB_MIN_CONNS env vars override the profile values.
	profMaxConns, profMinConns := poolProfileDefaults(os.Getenv("DB_POOL_PROFILE"))
	config.MaxConns = int32(envInt("DB_MAX_CONNS", profMaxConns))
	config.MinConns = int32(envInt("DB_MIN_CONNS", profMinConns))
	config.MaxConnLifetime = time.Duration(envInt("DB_MAX_CONN_LIFETIME_MINUTES", 60)) * time.Minute
	config.MaxConnIdleTime = time.Duration(envInt("DB_MAX_CONN_IDLE_MINUTES", 30)) * time.Minute
	config.HealthCheckPeriod = time.Duration(envInt("DB_HEALTH_CHECK_SECONDS", 60)) * time.Second

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return fmt.Errorf("create connection pool: %w", err)
	}

	// Verify connection
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return fmt.Errorf("ping database: %w", err)
	}

	DB = pool

	log.Info().
		Str("host", config.ConnConfig.Host).
		Uint16("port", config.ConnConfig.Port).
		Str("database", config.ConnConfig.Database).
		Int32("max_conns", config.MaxConns).
		Msg("Database connection pool initialized")

	return nil
}

// CloseDB closes the database connection pool.
// Should be called during graceful shutdown.
func CloseDB() {
	if DB != nil {
		DB.Close()
		log.Info().Msg("Database connection pool closed")
	}
}

// ctxKey is a custom type for context keys to avoid collisions.
type ctxKey string

// ConnKey is the context key for storing the database connection.
const ConnKey ctxKey = "db_conn"

// GetConn retrieves the database connection from the request context.
// Returns nil if no connection is set (e.g., for unauthenticated requests).
func GetConn(ctx context.Context) *pgxpool.Conn {
	conn, _ := ctx.Value(ConnKey).(*pgxpool.Conn)
	return conn
}

// RequireConn retrieves the database connection from the request context.
// Panics if no connection is set - use only in handlers that are protected
// by the tenant middleware which sets the connection.
func RequireConn(ctx context.Context) *pgxpool.Conn {
	conn := GetConn(ctx)
	if conn == nil {
		panic("RequireConn called without database connection in context")
	}
	return conn
}

// WithConn returns a new context with the database connection attached.
func WithConn(ctx context.Context, conn *pgxpool.Conn) context.Context {
	return context.WithValue(ctx, ConnKey, conn)
}

// GenerateID generates a random ID for use in temporary file paths.
// For database IDs, use gen_random_uuid() in PostgreSQL instead.
// SECURITY FIX (DL-M03): Panic instead of falling back to a predictable
// timestamp-based ID. If crypto/rand is unavailable, the system is in a
// critically degraded state and should not continue generating IDs.
func GenerateID() string {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		panic("storage: crypto/rand unavailable, cannot generate secure IDs: " + err.Error())
	}
	return hex.EncodeToString(bytes)
}

// poolProfileDefaults returns (maxConns, minConns) for the given profile name.
// Supported profiles:
//   - "small"  (default): MaxConns=5,  MinConns=1  — standalone / dev
//   - "medium":           MaxConns=15, MinConns=3  — production standalone
//   - "large":            MaxConns=30, MinConns=5  — SaaS multi-tenant
func poolProfileDefaults(profile string) (maxConns, minConns int) {
	switch strings.ToLower(strings.TrimSpace(profile)) {
	case "medium":
		return 15, 3
	case "large":
		return 30, 5
	default: // "small" or unset
		return 5, 1
	}
}

// envInt reads an integer from an environment variable, returning the default if unset or invalid.
func envInt(key string, defaultVal int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	return defaultVal
}
