// Package storage provides database access for the APIS server.
package storage

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// BeeBrainConfig represents the BeeBrain configuration for system or tenant.
type BeeBrainConfig struct {
	ID               string    `json:"id"`
	TenantID         *string   `json:"tenant_id,omitempty"` // NULL for system default
	Backend          string    `json:"backend"`             // 'rules', 'local', 'external'
	Provider         *string   `json:"provider,omitempty"`  // 'openai', 'anthropic', 'ollama', etc.
	Endpoint         *string   `json:"endpoint,omitempty"`  // Local model endpoint URL
	APIKeyEncrypted  *string   `json:"-"`                   // Encrypted API key, never exposed in JSON
	Model            *string   `json:"model,omitempty"`     // Model name
	IsTenantOverride bool      `json:"is_tenant_override"`
	UpdatedAt        time.Time `json:"updated_at"`
}

// TenantBeeBrainAccess represents a tenant's access to BeeBrain features.
type TenantBeeBrainAccess struct {
	TenantID   string `json:"tenant_id"`
	TenantName string `json:"tenant_name"`
	Enabled    bool   `json:"enabled"`
	HasBYOK    bool   `json:"has_byok"` // Has Bring-Your-Own-Key config
}

// GetSystemBeeBrainConfig retrieves the system-wide BeeBrain configuration.
// Returns the config with tenant_id = NULL.
func GetSystemBeeBrainConfig(ctx context.Context, pool *pgxpool.Pool) (*BeeBrainConfig, error) {
	query := `
		SELECT id, tenant_id, backend, provider, endpoint, api_key_encrypted, model, is_tenant_override, updated_at
		FROM beebrain_config
		WHERE tenant_id IS NULL
	`

	var config BeeBrainConfig
	err := pool.QueryRow(ctx, query).Scan(
		&config.ID,
		&config.TenantID,
		&config.Backend,
		&config.Provider,
		&config.Endpoint,
		&config.APIKeyEncrypted,
		&config.Model,
		&config.IsTenantOverride,
		&config.UpdatedAt,
	)

	if errors.Is(err, pgx.ErrNoRows) {
		// Return default config if not found
		return &BeeBrainConfig{
			Backend:   "rules",
			UpdatedAt: time.Now(),
		}, nil
	}
	if err != nil {
		return nil, err
	}

	return &config, nil
}

// SetSystemBeeBrainConfigInput is the input for updating system BeeBrain config.
type SetSystemBeeBrainConfigInput struct {
	Backend         string
	Provider        *string
	Endpoint        *string
	APIKeyEncrypted *string
	Model           *string
}

// SetSystemBeeBrainConfig updates the system-wide BeeBrain configuration.
// Uses upsert to handle both insert and update cases.
func SetSystemBeeBrainConfig(ctx context.Context, pool *pgxpool.Pool, input *SetSystemBeeBrainConfigInput) (*BeeBrainConfig, error) {
	query := `
		INSERT INTO beebrain_config (tenant_id, backend, provider, endpoint, api_key_encrypted, model, is_tenant_override, updated_at)
		VALUES (NULL, $1, $2, $3, $4, $5, false, NOW())
		ON CONFLICT (COALESCE(tenant_id, '__SYSTEM_DEFAULT__'))
		DO UPDATE SET
			backend = EXCLUDED.backend,
			provider = EXCLUDED.provider,
			endpoint = EXCLUDED.endpoint,
			api_key_encrypted = COALESCE(EXCLUDED.api_key_encrypted, beebrain_config.api_key_encrypted),
			model = EXCLUDED.model,
			updated_at = NOW()
		RETURNING id, tenant_id, backend, provider, endpoint, api_key_encrypted, model, is_tenant_override, updated_at
	`

	var config BeeBrainConfig
	err := pool.QueryRow(ctx, query,
		input.Backend,
		input.Provider,
		input.Endpoint,
		input.APIKeyEncrypted,
		input.Model,
	).Scan(
		&config.ID,
		&config.TenantID,
		&config.Backend,
		&config.Provider,
		&config.Endpoint,
		&config.APIKeyEncrypted,
		&config.Model,
		&config.IsTenantOverride,
		&config.UpdatedAt,
	)

	if err != nil {
		return nil, err
	}

	return &config, nil
}

// GetTenantBeeBrainAccess checks if a tenant has BeeBrain access enabled.
// Returns true if the tenant is in the access list, false otherwise.
func GetTenantBeeBrainAccess(ctx context.Context, pool *pgxpool.Pool, tenantID string) (bool, error) {
	// Check tenant_limits table for beebrain_enabled column
	// First, let's check if a tenant-specific beebrain_config exists with enabled status
	// For simplicity, we'll use a convention: if tenant has a row in beebrain_config with
	// is_tenant_override = false, they have access enabled.

	// For now, use a simpler approach: check tenant_limits for a beebrain_enabled field
	// If that doesn't exist, we'll use a default behavior (all tenants enabled)

	// Check if tenant exists in beebrain access control
	// We'll add a beebrain_access table for this purpose
	query := `
		SELECT enabled FROM tenant_beebrain_access WHERE tenant_id = $1
	`

	var enabled bool
	err := pool.QueryRow(ctx, query, tenantID).Scan(&enabled)
	if errors.Is(err, pgx.ErrNoRows) {
		// Default: tenants are enabled if no explicit record exists
		return true, nil
	}
	if err != nil {
		return false, err
	}

	return enabled, nil
}

// SetTenantBeeBrainAccess enables or disables BeeBrain access for a tenant.
func SetTenantBeeBrainAccess(ctx context.Context, pool *pgxpool.Pool, tenantID string, enabled bool) error {
	query := `
		INSERT INTO tenant_beebrain_access (tenant_id, enabled, updated_at)
		VALUES ($1, $2, NOW())
		ON CONFLICT (tenant_id)
		DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()
	`

	_, err := pool.Exec(ctx, query, tenantID, enabled)
	return err
}

// ListTenantBeeBrainAccess returns all tenants with their BeeBrain access status.
// Uses AdminListTenants to get all tenants, then joins with access and BYOK info.
func ListTenantBeeBrainAccess(ctx context.Context, pool *pgxpool.Pool) ([]TenantBeeBrainAccess, error) {
	query := `
		SELECT
			t.id AS tenant_id,
			t.name AS tenant_name,
			COALESCE(tba.enabled, true) AS enabled,
			EXISTS(SELECT 1 FROM beebrain_config bc WHERE bc.tenant_id = t.id AND bc.is_tenant_override = true) AS has_byok
		FROM tenants t
		LEFT JOIN tenant_beebrain_access tba ON tba.tenant_id = t.id
		WHERE t.status != 'deleted'
		ORDER BY t.name
	`

	rows, err := pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []TenantBeeBrainAccess
	for rows.Next() {
		var access TenantBeeBrainAccess
		if err := rows.Scan(&access.TenantID, &access.TenantName, &access.Enabled, &access.HasBYOK); err != nil {
			return nil, err
		}
		result = append(result, access)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return result, nil
}

// HasAPIKeyConfigured checks if the system BeeBrain config has an API key configured.
func HasAPIKeyConfigured(ctx context.Context, pool *pgxpool.Pool) (bool, error) {
	config, err := GetSystemBeeBrainConfig(ctx, pool)
	if err != nil {
		return false, err
	}
	return config.APIKeyEncrypted != nil && *config.APIKeyEncrypted != "", nil
}

// GetTenantBeeBrainConfig retrieves a tenant's BYOK BeeBrain configuration.
// Returns the config if the tenant has a custom override, or nil if not found.
func GetTenantBeeBrainConfig(ctx context.Context, pool *pgxpool.Pool, tenantID string) (*BeeBrainConfig, error) {
	query := `
		SELECT id, tenant_id, backend, provider, endpoint, api_key_encrypted, model, is_tenant_override, updated_at
		FROM beebrain_config
		WHERE tenant_id = $1 AND is_tenant_override = true
	`

	var config BeeBrainConfig
	err := pool.QueryRow(ctx, query, tenantID).Scan(
		&config.ID,
		&config.TenantID,
		&config.Backend,
		&config.Provider,
		&config.Endpoint,
		&config.APIKeyEncrypted,
		&config.Model,
		&config.IsTenantOverride,
		&config.UpdatedAt,
	)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	return &config, nil
}

// SetTenantBeeBrainConfigInput is the input for creating/updating a tenant's BYOK config.
type SetTenantBeeBrainConfigInput struct {
	Backend         string
	Provider        *string
	Endpoint        *string
	APIKeyEncrypted *string
	Model           *string
}

// SetTenantBeeBrainConfig creates or updates a tenant's BYOK BeeBrain configuration.
// Sets is_tenant_override = true to mark this as a custom tenant config.
func SetTenantBeeBrainConfig(ctx context.Context, pool *pgxpool.Pool, tenantID string, input *SetTenantBeeBrainConfigInput) (*BeeBrainConfig, error) {
	query := `
		INSERT INTO beebrain_config (tenant_id, backend, provider, endpoint, api_key_encrypted, model, is_tenant_override, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, true, NOW())
		ON CONFLICT (tenant_id) WHERE tenant_id IS NOT NULL
		DO UPDATE SET
			backend = EXCLUDED.backend,
			provider = EXCLUDED.provider,
			endpoint = EXCLUDED.endpoint,
			api_key_encrypted = COALESCE(EXCLUDED.api_key_encrypted, beebrain_config.api_key_encrypted),
			model = EXCLUDED.model,
			is_tenant_override = true,
			updated_at = NOW()
		RETURNING id, tenant_id, backend, provider, endpoint, api_key_encrypted, model, is_tenant_override, updated_at
	`

	var config BeeBrainConfig
	err := pool.QueryRow(ctx, query,
		tenantID,
		input.Backend,
		input.Provider,
		input.Endpoint,
		input.APIKeyEncrypted,
		input.Model,
	).Scan(
		&config.ID,
		&config.TenantID,
		&config.Backend,
		&config.Provider,
		&config.Endpoint,
		&config.APIKeyEncrypted,
		&config.Model,
		&config.IsTenantOverride,
		&config.UpdatedAt,
	)

	if err != nil {
		return nil, err
	}

	return &config, nil
}

// DeleteTenantBeeBrainConfig removes a tenant's custom BYOK configuration.
// After deletion, the tenant will use the system default config.
func DeleteTenantBeeBrainConfig(ctx context.Context, pool *pgxpool.Pool, tenantID string) error {
	query := `
		DELETE FROM beebrain_config
		WHERE tenant_id = $1 AND is_tenant_override = true
	`

	result, err := pool.Exec(ctx, query, tenantID)
	if err != nil {
		return err
	}

	if result.RowsAffected() == 0 {
		return ErrNotFound
	}

	return nil
}

// EffectiveBeeBrainConfig represents the resolved configuration for a tenant.
// This includes the mode (system/custom/rules_only) and effective settings.
type EffectiveBeeBrainConfig struct {
	Mode               string    `json:"mode"`                           // "system", "custom", or "rules_only"
	Backend            string    `json:"backend"`                        // "rules", "local", "external"
	Provider           *string   `json:"provider,omitempty"`             // Provider name if applicable
	Endpoint           *string   `json:"endpoint,omitempty"`             // Endpoint URL for local/ollama
	Model              *string   `json:"model,omitempty"`                // Model name
	APIKeyEncrypted    *string   `json:"-"`                              // Encrypted API key, never exposed
	CustomConfigStatus string    `json:"custom_config_status"`           // "configured" or "not_configured"
	SystemAvailable    bool      `json:"system_available"`               // Whether system default is available
	UpdatedAt          time.Time `json:"updated_at"`
}

// GetEffectiveBeeBrainConfig resolves the effective BeeBrain configuration for a tenant.
// Resolution order:
// 1. Tenant BYOK override (if is_tenant_override = true)
// 2. Tenant access check (if disabled, return rules_only)
// 3. System default config
func GetEffectiveBeeBrainConfig(ctx context.Context, pool *pgxpool.Pool, tenantID string) (*EffectiveBeeBrainConfig, error) {
	// 1. Check if tenant has BYOK override
	tenantConfig, err := GetTenantBeeBrainConfig(ctx, pool, tenantID)
	if err != nil && !errors.Is(err, ErrNotFound) {
		return nil, err
	}

	// Get system config to check availability
	systemConfig, sysErr := GetSystemBeeBrainConfig(ctx, pool)
	if sysErr != nil {
		return nil, sysErr
	}
	systemAvailable := systemConfig.Backend != "" && systemConfig.Backend != "rules"

	if tenantConfig != nil && tenantConfig.IsTenantOverride {
		// Tenant has custom config - use it
		return &EffectiveBeeBrainConfig{
			Mode:               "custom",
			Backend:            tenantConfig.Backend,
			Provider:           tenantConfig.Provider,
			Endpoint:           tenantConfig.Endpoint,
			Model:              tenantConfig.Model,
			APIKeyEncrypted:    tenantConfig.APIKeyEncrypted,
			CustomConfigStatus: "configured",
			SystemAvailable:    systemAvailable,
			UpdatedAt:          tenantConfig.UpdatedAt,
		}, nil
	}

	// 2. Check tenant access
	hasAccess, err := GetTenantBeeBrainAccess(ctx, pool, tenantID)
	if err != nil {
		return nil, err
	}

	if !hasAccess {
		// Tenant disabled - use rules only
		return &EffectiveBeeBrainConfig{
			Mode:               "rules_only",
			Backend:            "rules",
			CustomConfigStatus: "not_configured",
			SystemAvailable:    systemAvailable,
			UpdatedAt:          time.Now(),
		}, nil
	}

	// 3. Use system default
	return &EffectiveBeeBrainConfig{
		Mode:               "system",
		Backend:            systemConfig.Backend,
		Provider:           systemConfig.Provider,
		Endpoint:           systemConfig.Endpoint,
		Model:              systemConfig.Model,
		APIKeyEncrypted:    systemConfig.APIKeyEncrypted,
		CustomConfigStatus: "not_configured",
		SystemAvailable:    systemAvailable,
		UpdatedAt:          systemConfig.UpdatedAt,
	}, nil
}
