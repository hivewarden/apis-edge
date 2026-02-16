/**
 * Configuration persistence and management.
 *
 * This module handles runtime configuration that:
 * - Persists to JSON at /data/apis/config.json
 * - Can be updated via HTTP API
 * - Can be updated from server heartbeat responses
 * - Survives reboots
 *
 * This is separate from config.h which handles static YAML configuration.
 * config_manager handles dynamic, persistable state like:
 * - Device identity (id, name)
 * - Server connection (url, api_key)
 * - Armed state
 * - Setup mode flag
 */

#ifndef APIS_CONFIG_MANAGER_H
#define APIS_CONFIG_MANAGER_H

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

// Configuration paths
#define CONFIG_JSON_PATH "/data/apis/config.json"
#define CONFIG_JSON_PATH_TEMP "/data/apis/config.json.tmp"
#define CONFIG_JSON_PATH_DEV "./data/apis/config.json"
#define CONFIG_JSON_PATH_DEV_TEMP "./data/apis/config.json.tmp"

// Schema version for future migrations
#define CONFIG_SCHEMA_VERSION 1

// String length limits
#define CFG_MAX_STRING_LEN 128
#define CFG_MAX_URL_LEN 256
#define CFG_MAX_API_KEY_LEN 64
#define CFG_MAX_TIMESTAMP_LEN 32

/**
 * Device identification configuration.
 */
typedef struct {
    char id[CFG_MAX_STRING_LEN];
    char name[CFG_MAX_STRING_LEN];
} cfg_device_t;

/**
 * Server communication configuration.
 * COMM-001-5: Added fields for API key rotation support.
 */
typedef struct {
    char url[CFG_MAX_URL_LEN];
    char api_key[CFG_MAX_API_KEY_LEN];
    char api_key_next[CFG_MAX_API_KEY_LEN];   // Pending rotation key (COMM-001-5)
    int64_t key_issued_at;                     // When current key was issued (COMM-001-5)
    int64_t key_expires_at;                    // When key should be rotated (COMM-001-5)
    uint16_t heartbeat_interval_seconds;
} cfg_server_t;

/**
 * Detection parameters (mirrors some values from static config).
 * These can be overridden at runtime.
 */
typedef struct {
    bool enabled;
    uint16_t min_size_px;
    uint16_t hover_threshold_ms;
    uint8_t fps;
} cfg_detection_t;

/**
 * Laser deterrent configuration.
 */
typedef struct {
    bool enabled;
    uint8_t max_duration_seconds;
    uint8_t cooldown_seconds;
} cfg_laser_t;

/**
 * Complete runtime configuration.
 */
typedef struct {
    uint8_t schema_version;
    cfg_device_t device;
    cfg_server_t server;
    cfg_detection_t detection;
    cfg_laser_t laser;
    bool armed;
    bool needs_setup;
    char updated_at[CFG_MAX_TIMESTAMP_LEN];
} runtime_config_t;

/**
 * Configuration validation result.
 */
typedef struct {
    bool valid;
    char error_field[64];
    char error_message[128];
} cfg_validation_t;

/**
 * Initialize configuration manager.
 * Loads config from file or creates defaults if missing.
 *
 * @param use_dev_path If true, use ./data/ instead of /data/
 * @return 0 on success, -1 on error
 */
int config_manager_init(bool use_dev_path);

/**
 * Get current runtime configuration (read-only).
 *
 * @return Pointer to current config (do not modify)
 */
const runtime_config_t *config_manager_get(void);

/**
 * Get public configuration (sensitive fields masked).
 * Safe for API responses.
 *
 * @param out Output config structure
 */
void config_manager_get_public(runtime_config_t *out);

/**
 * Get a thread-safe snapshot of the full configuration (including sensitive fields).
 * S8-C3 fix: This is the safe replacement for config_manager_get() when callers
 * need access to sensitive fields like api_key.
 * Caller receives a local copy; the returned data is safe to use without locks.
 *
 * @param out Output config structure (caller-owned)
 */
void config_manager_get_snapshot(runtime_config_t *out);

/**
 * Load configuration from file.
 *
 * @return 0 on success, -1 on error (keeps previous config)
 */
int config_manager_load(void);

/**
 * Save current configuration to file.
 * Uses atomic write (temp file + rename).
 *
 * @return 0 on success, -1 on error
 */
int config_manager_save(void);

/**
 * Update configuration fields from JSON.
 * Validates before applying. On validation failure,
 * previous config is retained.
 *
 * @param json_updates JSON string with fields to update
 * @param validation Output validation result
 * @return 0 on success, -1 on validation/parse error
 */
int config_manager_update(const char *json_updates, cfg_validation_t *validation);

/**
 * Validate a configuration structure.
 *
 * @param config Configuration to validate
 * @param validation Output validation result
 * @return true if valid
 */
bool config_manager_validate(const runtime_config_t *config, cfg_validation_t *validation);

/**
 * Reset configuration to defaults.
 * Does NOT save to file.
 */
void config_manager_reset_defaults(void);

/**
 * Check if device needs initial setup.
 */
bool config_manager_needs_setup(void);

/**
 * Set armed state and persist.
 *
 * @param armed New armed state
 * @return 0 on success
 */
int config_manager_set_armed(bool armed);

/**
 * Get armed state.
 */
bool config_manager_is_armed(void);

/**
 * Mark setup as complete.
 * Sets needs_setup to false and saves.
 *
 * @return 0 on success
 */
int config_manager_complete_setup(void);

/**
 * Set device identity.
 *
 * @param id Device ID
 * @param name Device name
 * @return 0 on success
 */
int config_manager_set_device(const char *id, const char *name);

/**
 * Set server configuration.
 *
 * @param url Server URL
 * @param api_key API key
 * @return 0 on success
 */
int config_manager_set_server(const char *url, const char *api_key);

/**
 * Get default configuration.
 */
runtime_config_t config_manager_defaults(void);

/**
 * Serialize config to JSON string.
 *
 * @param config Configuration to serialize
 * @param buf Output buffer
 * @param buf_size Buffer size
 * @param include_sensitive Include API key etc.
 * @return 0 on success, -1 on error
 */
int config_manager_to_json(const runtime_config_t *config, char *buf, size_t buf_size,
                           bool include_sensitive);

/**
 * Parse JSON string to config structure.
 *
 * @param json JSON string
 * @param config Output configuration
 * @return 0 on success, -1 on parse error
 */
int config_manager_from_json(const char *json, runtime_config_t *config);

/**
 * Cleanup configuration manager resources.
 */
void config_manager_cleanup(void);

/**
 * Set a pending API key for rotation.
 * The key will be activated when key_expires_at time is reached.
 * COMM-001-5: Implements API key rotation support.
 *
 * @param new_key New API key to rotate to
 * @param activate_at Unix timestamp when the new key should become active
 * @return 0 on success
 */
int config_manager_set_pending_key(const char *new_key, int64_t activate_at);

/**
 * Activate the pending API key if rotation time has passed.
 * Should be called before each server request.
 * COMM-001-5: Implements API key rotation support.
 *
 * @return true if a key rotation occurred
 */
bool config_manager_check_key_rotation(void);

/**
 * Clear the API key (for security on persistent auth failures).
 * COMM-001-6: Implements secure handling of authentication failures.
 *
 * @return 0 on success
 */
int config_manager_clear_api_key(void);

/**
 * Set needs_setup flag to require re-provisioning.
 * COMM-001-6: Implements secure handling of authentication failures.
 *
 * @param needs_setup New needs_setup value
 * @return 0 on success
 */
int config_manager_set_needs_setup(bool needs_setup);

#endif // APIS_CONFIG_MANAGER_H
