package storage

import (
	"context"
	"embed"
	"fmt"
	"sort"
	"strings"

	"github.com/rs/zerolog/log"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// RunMigrations executes all pending migrations in order.
// Migrations are embedded SQL files in the migrations/ directory.
// Each migration runs in a transaction for atomicity.
// Already-applied migrations are tracked in the schema_migrations table.
//
// Note: Migrations run as the database superuser (e.g., yugabyte) which
// has BYPASSRLS privileges. This allows migrations to operate on data
// even after RLS is enabled. Application queries use a connection with
// tenant context set via SET LOCAL app.tenant_id.
func RunMigrations(ctx context.Context) error {
	if DB == nil {
		return fmt.Errorf("database not initialized")
	}

	// Ensure schema_migrations table exists (idempotent)
	if err := ensureMigrationsTable(ctx); err != nil {
		return fmt.Errorf("create migrations table: %w", err)
	}

	// Read all migration files
	entries, err := migrationsFS.ReadDir("migrations")
	if err != nil {
		return fmt.Errorf("read migrations directory: %w", err)
	}

	// Sort by filename to ensure correct order
	var files []string
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".sql") {
			files = append(files, entry.Name())
		}
	}
	sort.Strings(files)

	if len(files) == 0 {
		log.Info().Msg("No migration files found")
		return nil
	}

	// Get already-applied migrations
	applied, err := getAppliedMigrations(ctx)
	if err != nil {
		return fmt.Errorf("get applied migrations: %w", err)
	}

	// Filter to only pending migrations
	var pending []string
	for _, file := range files {
		if !applied[file] {
			pending = append(pending, file)
		}
	}

	if len(pending) == 0 {
		log.Info().Int("total", len(files)).Msg("All migrations already applied")
		return nil
	}

	log.Info().Int("pending", len(pending)).Int("total", len(files)).Msg("Running migrations")

	// Execute each pending migration
	for _, file := range pending {
		content, err := migrationsFS.ReadFile("migrations/" + file)
		if err != nil {
			return fmt.Errorf("read migration %s: %w", file, err)
		}

		// Execute migration in a transaction
		tx, err := DB.Begin(ctx)
		if err != nil {
			return fmt.Errorf("begin transaction for %s: %w", file, err)
		}

		// Run the migration SQL
		_, err = tx.Exec(ctx, string(content))
		if err != nil {
			tx.Rollback(ctx)
			return fmt.Errorf("execute migration %s: %w", file, err)
		}

		// Record the migration as applied
		_, err = tx.Exec(ctx,
			`INSERT INTO schema_migrations (filename) VALUES ($1)`,
			file,
		)
		if err != nil {
			tx.Rollback(ctx)
			return fmt.Errorf("record migration %s: %w", file, err)
		}

		if err := tx.Commit(ctx); err != nil {
			return fmt.Errorf("commit migration %s: %w", file, err)
		}

		log.Info().Str("file", file).Msg("Migration applied")
	}

	log.Info().Int("applied", len(pending)).Msg("Migrations completed")
	return nil
}

// ensureMigrationsTable creates the schema_migrations table if it doesn't exist.
// This table tracks which migrations have been applied to prevent re-running them.
func ensureMigrationsTable(ctx context.Context) error {
	_, err := DB.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			filename TEXT PRIMARY KEY,
			applied_at TIMESTAMPTZ DEFAULT NOW()
		)
	`)
	return err
}

// getAppliedMigrations returns a set of migration filenames that have been applied.
func getAppliedMigrations(ctx context.Context) (map[string]bool, error) {
	rows, err := DB.Query(ctx, `SELECT filename FROM schema_migrations`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	applied := make(map[string]bool)
	for rows.Next() {
		var filename string
		if err := rows.Scan(&filename); err != nil {
			return nil, err
		}
		applied[filename] = true
	}
	return applied, rows.Err()
}
