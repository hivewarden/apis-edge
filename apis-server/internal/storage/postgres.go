// Package storage provides database access and persistence for the APIS server.
package storage

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"
)

// DB is the global database connection pool.
// Initialized via InitDB and closed via CloseDB.
var DB *pgxpool.Pool

// DefaultDatabaseURL is the default connection string for local development.
const DefaultDatabaseURL = "postgres://yugabyte:yugabyte@localhost:5433/apis"

// InitDB initializes the database connection pool.
// It reads DATABASE_URL from environment or uses the default.
// Returns error if connection cannot be established.
func InitDB(ctx context.Context) error {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		databaseURL = DefaultDatabaseURL
		log.Warn().Msg("DATABASE_URL not set, using default: " + DefaultDatabaseURL)
	}

	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return fmt.Errorf("parse database URL: %w", err)
	}

	// Configure pool settings
	config.MaxConns = 25
	config.MinConns = 5
	config.MaxConnLifetime = time.Hour
	config.MaxConnIdleTime = 30 * time.Minute
	config.HealthCheckPeriod = time.Minute

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
func GenerateID() string {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		// Fallback to timestamp-based ID if random fails
		return fmt.Sprintf("id_%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(bytes)
}
