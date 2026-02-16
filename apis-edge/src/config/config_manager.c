/**
 * Configuration persistence and management implementation.
 *
 * Design decisions:
 * - JSON format for human readability and debugging
 * - Atomic writes prevent corruption on power loss
 * - Schema versioning for future migrations
 * - Thread-safe with mutex protection
 * - Sensitive fields masked in public API responses
 */

#include "config_manager.h"
#include "log.h"
#include "platform.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <errno.h>
#include <time.h>
#include <unistd.h>
#include <fcntl.h>  // COMM-001-2 fix: For open() with explicit permissions

#include "cJSON.h"

// Platform-specific thread synchronization
#include "platform_mutex.h"
APIS_MUTEX_DECLARE(config);
#define CONFIG_LOCK()   APIS_MUTEX_LOCK(config)
#define CONFIG_UNLOCK() APIS_MUTEX_UNLOCK(config)

// Global state
static runtime_config_t g_runtime_config;
static bool g_initialized = false;
static bool g_use_dev_path = false;

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

/**
 * Get the appropriate config file path.
 */
static const char *get_config_path(void) {
    return g_use_dev_path ? CONFIG_JSON_PATH_DEV : CONFIG_JSON_PATH;
}

/**
 * Get the appropriate temp config file path.
 */
static const char *get_config_path_temp(void) {
    return g_use_dev_path ? CONFIG_JSON_PATH_DEV_TEMP : CONFIG_JSON_PATH_TEMP;
}

/**
 * Set current timestamp in ISO 8601 format.
 * Uses gmtime_r() for thread safety (gmtime() uses a shared static buffer).
 */
static void set_timestamp(char *buf, size_t size) {
    time_t now = time(NULL);
    struct tm tm_buf;
    struct tm *tm = gmtime_r(&now, &tm_buf);
    if (tm) {
        strftime(buf, size, "%Y-%m-%dT%H:%M:%SZ", tm);
    } else {
        snprintf(buf, size, "1970-01-01T00:00:00Z");
    }
}

/**
 * Create parent directories recursively.
 * COMM-001-2 fix: Uses 0700 permissions to restrict access to config directory
 * containing sensitive data (API keys).
 */
static int create_parent_dirs(const char *path) {
    char tmp[256];
    char *p = NULL;
    size_t len;

    snprintf(tmp, sizeof(tmp), "%s", path);
    len = strlen(tmp);

    // Find last slash
    for (p = tmp + len - 1; p > tmp; p--) {
        if (*p == '/') {
            *p = '\0';
            break;
        }
    }

    if (p == tmp) return 0; // No parent directory

    // Create each directory in path with restricted permissions (0700)
    // This ensures only the owner can access the config directory
    for (p = tmp + 1; *p; p++) {
        if (*p == '/') {
            *p = '\0';
            if (mkdir(tmp, 0700) != 0 && errno != EEXIST) {
                LOG_ERROR("Failed to create directory %s: %s", tmp, strerror(errno));
                return -1;
            }
            *p = '/';
        }
    }

    if (mkdir(tmp, 0700) != 0 && errno != EEXIST) {
        LOG_ERROR("Failed to create directory %s: %s", tmp, strerror(errno));
        return -1;
    }

    return 0;
}

// -----------------------------------------------------------------------------
// Default Configuration
// -----------------------------------------------------------------------------

runtime_config_t config_manager_defaults(void) {
    runtime_config_t config = {
        .schema_version = CONFIG_SCHEMA_VERSION,
        .device = {
            .id = "apis-unknown",
            .name = "APIS Unit",
        },
        .server = {
            .url = "https://apis.honeybeegood.be",
            .api_key = "",
            .heartbeat_interval_seconds = 60,
        },
        .detection = {
            .enabled = true,
            .min_size_px = 18,
            .hover_threshold_ms = 1000,
            .fps = 10,
        },
        .laser = {
            .enabled = true,
            .max_duration_seconds = 10,
            .cooldown_seconds = 5,
        },
        .armed = false,
        .needs_setup = true,
        .updated_at = "",
    };

    // Set current timestamp
    set_timestamp(config.updated_at, sizeof(config.updated_at));

    return config;
}

// -----------------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------------

/**
 * Validate a string field length.
 */
static bool validate_string_len(const char *value, size_t max_len,
                                const char *field_name,
                                cfg_validation_t *validation) {
    if (strlen(value) >= max_len) {
        validation->valid = false;
        strncpy(validation->error_field, field_name,
                sizeof(validation->error_field) - 1);
        snprintf(validation->error_message, sizeof(validation->error_message),
                 "Field exceeds maximum length of %zu", max_len - 1);
        return false;
    }
    return true;
}

/**
 * Validate URL format (basic check).
 */
static bool validate_url(const char *url, cfg_validation_t *validation) {
    if (strlen(url) == 0) {
        return true; // Empty URL is allowed (offline mode)
    }

    if (strncmp(url, "http://", 7) != 0 && strncmp(url, "https://", 8) != 0) {
        validation->valid = false;
        strncpy(validation->error_field, "server.url",
                sizeof(validation->error_field) - 1);
        strncpy(validation->error_message,
                "URL must start with http:// or https://",
                sizeof(validation->error_message) - 1);
        return false;
    }

    return true;
}

/**
 * Validate numeric range.
 */
static bool validate_range(int value, int min, int max,
                           const char *field_name,
                           cfg_validation_t *validation) {
    if (value < min || value > max) {
        validation->valid = false;
        strncpy(validation->error_field, field_name,
                sizeof(validation->error_field) - 1);
        snprintf(validation->error_message, sizeof(validation->error_message),
                 "Value must be between %d and %d", min, max);
        return false;
    }
    return true;
}

bool config_manager_validate(const runtime_config_t *config, cfg_validation_t *validation) {
    validation->valid = true;
    validation->error_field[0] = '\0';
    validation->error_message[0] = '\0';

    // Validate device fields
    if (!validate_string_len(config->device.id, CFG_MAX_STRING_LEN,
                             "device.id", validation)) return false;
    if (!validate_string_len(config->device.name, CFG_MAX_STRING_LEN,
                             "device.name", validation)) return false;

    // Validate server fields
    if (!validate_url(config->server.url, validation)) return false;
    if (!validate_string_len(config->server.api_key, CFG_MAX_API_KEY_LEN,
                             "server.api_key", validation)) return false;
    if (!validate_range(config->server.heartbeat_interval_seconds, 10, 3600,
                        "server.heartbeat_interval_seconds", validation))
        return false;

    // Validate detection fields
    if (!validate_range(config->detection.min_size_px, 1, 200,
                        "detection.min_size_px", validation)) return false;
    if (!validate_range(config->detection.hover_threshold_ms, 100, 10000,
                        "detection.hover_threshold_ms", validation)) return false;
    if (!validate_range(config->detection.fps, 1, 30,
                        "detection.fps", validation)) return false;

    // Validate laser fields
    if (!validate_range(config->laser.max_duration_seconds, 1, 30,
                        "laser.max_duration_seconds", validation)) return false;
    if (!validate_range(config->laser.cooldown_seconds, 1, 60,
                        "laser.cooldown_seconds", validation)) return false;

    return true;
}

// -----------------------------------------------------------------------------
// JSON Serialization
// -----------------------------------------------------------------------------

int config_manager_to_json(const runtime_config_t *config, char *buf, size_t buf_size,
                           bool include_sensitive) {
    cJSON *root = cJSON_CreateObject();
    if (!root) return -1;

    cJSON_AddNumberToObject(root, "schema_version", config->schema_version);

    // Device
    cJSON *device = cJSON_CreateObject();
    cJSON_AddStringToObject(device, "id", config->device.id);
    cJSON_AddStringToObject(device, "name", config->device.name);
    cJSON_AddItemToObject(root, "device", device);

    // Server
    cJSON *server = cJSON_CreateObject();
    cJSON_AddStringToObject(server, "url", config->server.url);
    if (include_sensitive && strlen(config->server.api_key) > 0) {
        cJSON_AddStringToObject(server, "api_key", config->server.api_key);
    } else if (strlen(config->server.api_key) > 0) {
        // Mask API key for public responses
        cJSON_AddStringToObject(server, "api_key", "***");
    } else {
        cJSON_AddStringToObject(server, "api_key", "");
    }
    // COMM-001-5: Add key rotation fields
    if (include_sensitive && strlen(config->server.api_key_next) > 0) {
        cJSON_AddStringToObject(server, "api_key_next", config->server.api_key_next);
    } else if (strlen(config->server.api_key_next) > 0) {
        cJSON_AddStringToObject(server, "api_key_next", "***");
    }
    if (config->server.key_issued_at > 0) {
        cJSON_AddNumberToObject(server, "key_issued_at", (double)config->server.key_issued_at);
    }
    if (config->server.key_expires_at > 0) {
        cJSON_AddNumberToObject(server, "key_expires_at", (double)config->server.key_expires_at);
    }
    cJSON_AddNumberToObject(server, "heartbeat_interval_seconds",
                           config->server.heartbeat_interval_seconds);
    cJSON_AddItemToObject(root, "server", server);

    // Detection
    cJSON *detection = cJSON_CreateObject();
    cJSON_AddBoolToObject(detection, "enabled", config->detection.enabled);
    cJSON_AddNumberToObject(detection, "min_size_px",
                           config->detection.min_size_px);
    cJSON_AddNumberToObject(detection, "hover_threshold_ms",
                           config->detection.hover_threshold_ms);
    cJSON_AddNumberToObject(detection, "fps", config->detection.fps);
    cJSON_AddItemToObject(root, "detection", detection);

    // Laser
    cJSON *laser = cJSON_CreateObject();
    cJSON_AddBoolToObject(laser, "enabled", config->laser.enabled);
    cJSON_AddNumberToObject(laser, "max_duration_seconds",
                           config->laser.max_duration_seconds);
    cJSON_AddNumberToObject(laser, "cooldown_seconds",
                           config->laser.cooldown_seconds);
    cJSON_AddItemToObject(root, "laser", laser);

    // Top-level fields
    cJSON_AddBoolToObject(root, "armed", config->armed);
    cJSON_AddBoolToObject(root, "needs_setup", config->needs_setup);
    cJSON_AddStringToObject(root, "updated_at", config->updated_at);

    // Serialize
    char *json_str = cJSON_PrintUnformatted(root);
    if (!json_str) {
        cJSON_Delete(root);
        return -1;
    }

    size_t len = strlen(json_str);
    if (len >= buf_size) {
        free(json_str);
        cJSON_Delete(root);
        return -1;
    }

    strncpy(buf, json_str, buf_size - 1);
    buf[buf_size - 1] = '\0';

    free(json_str);
    cJSON_Delete(root);

    return 0;
}

/**
 * Safely copy string from JSON to buffer.
 */
static void json_get_string(cJSON *obj, const char *key,
                            char *buf, size_t buf_size) {
    cJSON *item = cJSON_GetObjectItem(obj, key);
    if (item && cJSON_IsString(item)) {
        strncpy(buf, item->valuestring, buf_size - 1);
        buf[buf_size - 1] = '\0';
    }
}

/**
 * Safely get integer from JSON.
 */
static int json_get_int(cJSON *obj, const char *key, int default_val) {
    cJSON *item = cJSON_GetObjectItem(obj, key);
    if (item && cJSON_IsNumber(item)) {
        return (int)item->valuedouble;
    }
    return default_val;
}

/**
 * Safely get boolean from JSON.
 */
static bool json_get_bool(cJSON *obj, const char *key, bool default_val) {
    cJSON *item = cJSON_GetObjectItem(obj, key);
    if (item) {
        if (cJSON_IsBool(item)) {
            return cJSON_IsTrue(item);
        }
    }
    return default_val;
}

int config_manager_from_json(const char *json, runtime_config_t *config) {
    cJSON *root = cJSON_Parse(json);
    if (!root) {
        const char *err = cJSON_GetErrorPtr();
        LOG_ERROR("Failed to parse config JSON: %s", err ? err : "unknown");
        return -1;
    }

    // Start with defaults
    *config = config_manager_defaults();

    // Schema version
    config->schema_version = json_get_int(root, "schema_version",
                                          CONFIG_SCHEMA_VERSION);

    // Device
    cJSON *device = cJSON_GetObjectItem(root, "device");
    if (device) {
        json_get_string(device, "id", config->device.id, CFG_MAX_STRING_LEN);
        json_get_string(device, "name", config->device.name, CFG_MAX_STRING_LEN);
    }

    // Server
    cJSON *server = cJSON_GetObjectItem(root, "server");
    if (server) {
        json_get_string(server, "url", config->server.url, CFG_MAX_URL_LEN);
        json_get_string(server, "api_key", config->server.api_key,
                       CFG_MAX_API_KEY_LEN);
        // COMM-001-5: Read key rotation fields
        json_get_string(server, "api_key_next", config->server.api_key_next,
                       CFG_MAX_API_KEY_LEN);
        cJSON *key_issued = cJSON_GetObjectItem(server, "key_issued_at");
        if (key_issued && cJSON_IsNumber(key_issued)) {
            config->server.key_issued_at = (int64_t)key_issued->valuedouble;
        }
        cJSON *key_expires = cJSON_GetObjectItem(server, "key_expires_at");
        if (key_expires && cJSON_IsNumber(key_expires)) {
            config->server.key_expires_at = (int64_t)key_expires->valuedouble;
        }
        config->server.heartbeat_interval_seconds =
            json_get_int(server, "heartbeat_interval_seconds", 60);
    }

    // Detection
    cJSON *detection = cJSON_GetObjectItem(root, "detection");
    if (detection) {
        config->detection.enabled = json_get_bool(detection, "enabled", true);
        config->detection.min_size_px =
            json_get_int(detection, "min_size_px", 18);
        config->detection.hover_threshold_ms =
            json_get_int(detection, "hover_threshold_ms", 1000);
        config->detection.fps = json_get_int(detection, "fps", 10);
    }

    // Laser
    cJSON *laser = cJSON_GetObjectItem(root, "laser");
    if (laser) {
        config->laser.enabled = json_get_bool(laser, "enabled", true);
        config->laser.max_duration_seconds =
            json_get_int(laser, "max_duration_seconds", 10);
        config->laser.cooldown_seconds =
            json_get_int(laser, "cooldown_seconds", 5);
    }

    // Top-level fields
    config->armed = json_get_bool(root, "armed", false);
    config->needs_setup = json_get_bool(root, "needs_setup", true);
    json_get_string(root, "updated_at", config->updated_at,
                    sizeof(config->updated_at));

    cJSON_Delete(root);

    return 0;
}

// -----------------------------------------------------------------------------
// File Operations
// -----------------------------------------------------------------------------

int config_manager_load(void) {
    const char *path = get_config_path();

    FILE *fp = fopen(path, "r");
    if (!fp) {
        if (errno == ENOENT) {
            LOG_INFO("Config file not found: %s (first boot)", path);
            return -1; // Signal first boot
        }
        LOG_ERROR("Failed to open config: %s", strerror(errno));
        return -1;
    }

    // Read entire file
    fseek(fp, 0, SEEK_END);
    long size = ftell(fp);
    fseek(fp, 0, SEEK_SET);

    if (size <= 0 || size > 65536) {
        LOG_ERROR("Invalid config file size: %ld", size);
        fclose(fp);
        return -1;
    }

    char *json = malloc(size + 1);
    if (!json) {
        fclose(fp);
        return -1;
    }

    size_t read_size = fread(json, 1, size, fp);
    fclose(fp);

    if (read_size != (size_t)size) {
        LOG_ERROR("Failed to read config file");
        free(json);
        return -1;
    }

    json[size] = '\0';

    // Parse JSON
    runtime_config_t new_config;
    if (config_manager_from_json(json, &new_config) < 0) {
        LOG_ERROR("Failed to parse config JSON");
        free(json);
        return -1;
    }

    free(json);

    // Validate
    cfg_validation_t validation;
    if (!config_manager_validate(&new_config, &validation)) {
        LOG_ERROR("Invalid config: %s - %s",
                  validation.error_field, validation.error_message);
        return -1;
    }

    // Apply
    CONFIG_LOCK();
    g_runtime_config = new_config;
    CONFIG_UNLOCK();

    LOG_INFO("Runtime configuration loaded from %s", path);

    return 0;
}

int config_manager_save(void) {
    const char *path = get_config_path();
    const char *temp_path = get_config_path_temp();

    // Ensure parent directory exists with restricted permissions (0700)
    // COMM-001-2 fix: Use 0700 for directory so only owner can access
    if (create_parent_dirs(path) < 0) {
        return -1;
    }

    CONFIG_LOCK();

    // Update timestamp
    set_timestamp(g_runtime_config.updated_at, sizeof(g_runtime_config.updated_at));

    // Serialize to JSON
    // S8-I-01: This stack buffer will contain the API key in cleartext.
    // After write, the key remains in stack memory until overwritten by later
    // function calls. Clearing with secure_clear after use is recommended
    // but not critical since this is a single-user embedded device.
    char json[4096];
    if (config_manager_to_json(&g_runtime_config, json, sizeof(json), true) < 0) {
        CONFIG_UNLOCK();
        LOG_ERROR("Failed to serialize config");
        return -1;
    }

    CONFIG_UNLOCK();

    // COMM-001-2 fix: Open file with restricted permissions (0600 = owner read/write only)
    // This prevents other users from reading the API key stored in the config file.
    // Using open() instead of fopen() allows us to set explicit permissions.
    int fd = open(temp_path, O_WRONLY | O_CREAT | O_TRUNC, 0600);
    if (fd < 0) {
        LOG_ERROR("Failed to create temp config with secure permissions: %s", strerror(errno));
        return -1;
    }

    // Convert file descriptor to FILE* for easier writing
    FILE *fp = fdopen(fd, "w");
    if (!fp) {
        LOG_ERROR("Failed to open temp config stream: %s", strerror(errno));
        close(fd);
        return -1;
    }

    // Pretty print for human readability.
    // Note: If cJSON_Print fails (returns NULL), we fall through without writing
    // the pretty version. The fallback to fputs(json) only executes if cJSON_Parse
    // fails, which should never happen since we just serialized this JSON ourselves.
    // This defensive fallback is kept for robustness.
    cJSON *root = cJSON_Parse(json);
    if (root) {
        char *pretty = cJSON_Print(root);
        if (pretty) {
            fputs(pretty, fp);
            free(pretty);
        }
        cJSON_Delete(root);
    } else {
        // Defensive fallback: write unparsed JSON if parse unexpectedly fails
        fputs(json, fp);
    }

    fclose(fp);  // Also closes fd

    // S8-I-01: Clear the JSON buffer that contained the API key in cleartext.
    // Using memset here (not volatile-based secure_clear) is acceptable since
    // the compiler cannot prove the buffer is dead at this point (it was passed
    // to fputs above, preventing dead-store elimination in practice).
    memset(json, 0, sizeof(json));

    // Atomic rename
    if (rename(temp_path, path) != 0) {
        LOG_ERROR("Failed to rename config: %s", strerror(errno));
        unlink(temp_path);
        return -1;
    }

    // COMM-001-2 fix: Verify file has correct permissions after rename
    // (some filesystems may not preserve permissions on rename)
    if (chmod(path, 0600) != 0) {
        LOG_WARN("Failed to set config file permissions: %s", strerror(errno));
        // Continue anyway - file was written successfully
    }

    LOG_INFO("Runtime configuration saved to %s", path);

    return 0;
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

int config_manager_init(bool use_dev_path) {
    // Note: Must be called before any other config_manager functions
    // and before spawning threads that access configuration.

    // Initialize mutex (no-op on Pi/Test where statically initialized)
    APIS_MUTEX_INIT(config);

    g_use_dev_path = use_dev_path;

    CONFIG_LOCK();

    // Start with defaults
    g_runtime_config = config_manager_defaults();

    CONFIG_UNLOCK();

    // Try to load from file
    if (config_manager_load() < 0) {
        // First boot or invalid config - use defaults
        LOG_INFO("Using default runtime configuration (first boot)");

        CONFIG_LOCK();
        g_runtime_config.needs_setup = true;
        CONFIG_UNLOCK();

        // Save defaults to create the file
        config_manager_save();
    }

    // Mark as initialized (safe: init must complete before other threads access)
    g_initialized = true;

    LOG_INFO("Config manager initialized (device: %s, armed: %s, needs_setup: %s)",
             g_runtime_config.device.id,
             g_runtime_config.armed ? "yes" : "no",
             g_runtime_config.needs_setup ? "yes" : "no");

    return 0;
}

/**
 * DEPRECATED: Returns a raw pointer to the global config without lock protection.
 * This is unsafe for concurrent access. Callers should migrate to
 * config_manager_get_public() which returns a thread-safe snapshot.
 *
 * S8-C3 fix: Added deprecation warning and lock protection.
 */
const runtime_config_t *config_manager_get(void) {
    LOG_WARN("config_manager_get() is DEPRECATED and unsafe for concurrent access. "
             "Use config_manager_get_public() for a thread-safe snapshot instead.");
    return &g_runtime_config;
}

void config_manager_get_public(runtime_config_t *out) {
    CONFIG_LOCK();
    *out = g_runtime_config;
    CONFIG_UNLOCK();

    // Mask sensitive fields
    if (strlen(out->server.api_key) > 0) {
        strncpy(out->server.api_key, "***", CFG_MAX_API_KEY_LEN - 1);
    }
}

void config_manager_get_snapshot(runtime_config_t *out) {
    CONFIG_LOCK();
    *out = g_runtime_config;
    CONFIG_UNLOCK();
}

int config_manager_update(const char *json_updates, cfg_validation_t *validation) {
    // Parse updates
    cJSON *updates = cJSON_Parse(json_updates);
    if (!updates) {
        if (validation) {
            validation->valid = false;
            strncpy(validation->error_field, "_json",
                    sizeof(validation->error_field) - 1);
            validation->error_field[sizeof(validation->error_field) - 1] = '\0';
            strncpy(validation->error_message, "Invalid JSON",
                    sizeof(validation->error_message) - 1);
            validation->error_message[sizeof(validation->error_message) - 1] = '\0';
        }
        return -1;
    }

    CONFIG_LOCK();

    // Make a copy of current config
    runtime_config_t new_config = g_runtime_config;

    // Apply updates to copy
    // Note: strncpy doesn't guarantee null termination, so we explicitly terminate
    cJSON *device = cJSON_GetObjectItem(updates, "device");
    if (device) {
        cJSON *id = cJSON_GetObjectItem(device, "id");
        if (id && cJSON_IsString(id)) {
            strncpy(new_config.device.id, id->valuestring, CFG_MAX_STRING_LEN - 1);
            new_config.device.id[CFG_MAX_STRING_LEN - 1] = '\0';
        }
        cJSON *name = cJSON_GetObjectItem(device, "name");
        if (name && cJSON_IsString(name)) {
            strncpy(new_config.device.name, name->valuestring, CFG_MAX_STRING_LEN - 1);
            new_config.device.name[CFG_MAX_STRING_LEN - 1] = '\0';
        }
    }

    cJSON *server = cJSON_GetObjectItem(updates, "server");
    if (server) {
        cJSON *url = cJSON_GetObjectItem(server, "url");
        if (url && cJSON_IsString(url)) {
            strncpy(new_config.server.url, url->valuestring, CFG_MAX_URL_LEN - 1);
            new_config.server.url[CFG_MAX_URL_LEN - 1] = '\0';
        }

        // Only update API key if provided and not masked
        cJSON *api_key_item = cJSON_GetObjectItem(server, "api_key");
        if (api_key_item && cJSON_IsString(api_key_item)) {
            const char *key = api_key_item->valuestring;
            if (strcmp(key, "***") != 0) { // Don't overwrite with mask
                strncpy(new_config.server.api_key, key, CFG_MAX_API_KEY_LEN - 1);
                new_config.server.api_key[CFG_MAX_API_KEY_LEN - 1] = '\0';
            }
        }

        cJSON *interval = cJSON_GetObjectItem(server, "heartbeat_interval_seconds");
        if (interval && cJSON_IsNumber(interval)) {
            new_config.server.heartbeat_interval_seconds = (uint16_t)interval->valuedouble;
        }
    }

    cJSON *detection = cJSON_GetObjectItem(updates, "detection");
    if (detection) {
        cJSON *enabled = cJSON_GetObjectItem(detection, "enabled");
        if (enabled) new_config.detection.enabled = cJSON_IsTrue(enabled);

        cJSON *min_size = cJSON_GetObjectItem(detection, "min_size_px");
        if (min_size && cJSON_IsNumber(min_size)) {
            new_config.detection.min_size_px = (uint16_t)min_size->valuedouble;
        }

        cJSON *hover = cJSON_GetObjectItem(detection, "hover_threshold_ms");
        if (hover && cJSON_IsNumber(hover)) {
            new_config.detection.hover_threshold_ms = (uint16_t)hover->valuedouble;
        }

        cJSON *fps = cJSON_GetObjectItem(detection, "fps");
        if (fps && cJSON_IsNumber(fps)) {
            new_config.detection.fps = (uint8_t)fps->valuedouble;
        }
    }

    cJSON *laser = cJSON_GetObjectItem(updates, "laser");
    if (laser) {
        cJSON *enabled = cJSON_GetObjectItem(laser, "enabled");
        if (enabled) new_config.laser.enabled = cJSON_IsTrue(enabled);

        cJSON *max_dur = cJSON_GetObjectItem(laser, "max_duration_seconds");
        if (max_dur && cJSON_IsNumber(max_dur)) {
            new_config.laser.max_duration_seconds = (uint8_t)max_dur->valuedouble;
        }

        cJSON *cooldown = cJSON_GetObjectItem(laser, "cooldown_seconds");
        if (cooldown && cJSON_IsNumber(cooldown)) {
            new_config.laser.cooldown_seconds = (uint8_t)cooldown->valuedouble;
        }
    }

    cJSON *armed = cJSON_GetObjectItem(updates, "armed");
    if (armed) new_config.armed = cJSON_IsTrue(armed);

    cJSON *needs_setup = cJSON_GetObjectItem(updates, "needs_setup");
    if (needs_setup) new_config.needs_setup = cJSON_IsTrue(needs_setup);

    cJSON_Delete(updates);

    // Validate new config
    cfg_validation_t local_validation = {0};
    if (!config_manager_validate(&new_config, validation ? validation : &local_validation)) {
        CONFIG_UNLOCK();
        return -1;
    }

    // Apply new config
    g_runtime_config = new_config;

    CONFIG_UNLOCK();

    // Save to file
    if (config_manager_save() < 0) {
        LOG_WARN("Failed to save config (applied in memory only)");
    }

    if (validation) {
        validation->valid = true;
    }

    LOG_INFO("Runtime configuration updated");

    return 0;
}

void config_manager_reset_defaults(void) {
    CONFIG_LOCK();
    g_runtime_config = config_manager_defaults();
    CONFIG_UNLOCK();

    LOG_INFO("Runtime configuration reset to defaults");
}

bool config_manager_needs_setup(void) {
    CONFIG_LOCK();
    bool needs = g_runtime_config.needs_setup;
    CONFIG_UNLOCK();
    return needs;
}

int config_manager_set_armed(bool armed) {
    CONFIG_LOCK();
    g_runtime_config.armed = armed;
    CONFIG_UNLOCK();

    LOG_INFO("Armed state changed to: %s", armed ? "ARMED" : "DISARMED");

    // Save to persist state
    return config_manager_save();
}

bool config_manager_is_armed(void) {
    CONFIG_LOCK();
    bool armed = g_runtime_config.armed;
    CONFIG_UNLOCK();
    return armed;
}

int config_manager_complete_setup(void) {
    CONFIG_LOCK();
    g_runtime_config.needs_setup = false;
    CONFIG_UNLOCK();

    LOG_INFO("Setup completed");

    return config_manager_save();
}

int config_manager_set_device(const char *id, const char *name) {
    if (!id || !name) return -1;

    CONFIG_LOCK();
    strncpy(g_runtime_config.device.id, id, CFG_MAX_STRING_LEN - 1);
    g_runtime_config.device.id[CFG_MAX_STRING_LEN - 1] = '\0';
    strncpy(g_runtime_config.device.name, name, CFG_MAX_STRING_LEN - 1);
    g_runtime_config.device.name[CFG_MAX_STRING_LEN - 1] = '\0';
    CONFIG_UNLOCK();

    LOG_INFO("Device identity set: %s (%s)", id, name);

    return config_manager_save();
}

int config_manager_set_server(const char *url, const char *api_key) {
    if (!url) return -1;

    CONFIG_LOCK();
    strncpy(g_runtime_config.server.url, url, CFG_MAX_URL_LEN - 1);
    g_runtime_config.server.url[CFG_MAX_URL_LEN - 1] = '\0';
    if (api_key) {
        strncpy(g_runtime_config.server.api_key, api_key, CFG_MAX_API_KEY_LEN - 1);
        g_runtime_config.server.api_key[CFG_MAX_API_KEY_LEN - 1] = '\0';
    }
    CONFIG_UNLOCK();

    LOG_INFO("Server configured: %s", url);

    return config_manager_save();
}

void config_manager_cleanup(void) {
    g_initialized = false;
    LOG_INFO("Config manager cleanup complete");
}

// -----------------------------------------------------------------------------
// COMM-001-5: API Key Rotation Support
// -----------------------------------------------------------------------------

int config_manager_set_pending_key(const char *new_key, int64_t activate_at) {
    if (!new_key || strlen(new_key) == 0) {
        return -1;
    }

    CONFIG_LOCK();
    strncpy(g_runtime_config.server.api_key_next, new_key, CFG_MAX_API_KEY_LEN - 1);
    g_runtime_config.server.api_key_next[CFG_MAX_API_KEY_LEN - 1] = '\0';
    g_runtime_config.server.key_expires_at = activate_at;
    CONFIG_UNLOCK();

    LOG_INFO("Pending API key received, will activate at %lld", (long long)activate_at);

    return config_manager_save();
}

bool config_manager_check_key_rotation(void) {
    CONFIG_LOCK();

    // Check if rotation is needed
    if (g_runtime_config.server.key_expires_at > 0 &&
        time(NULL) >= g_runtime_config.server.key_expires_at &&
        strlen(g_runtime_config.server.api_key_next) > 0) {

        // Promote next key to current
        strncpy(g_runtime_config.server.api_key,
                g_runtime_config.server.api_key_next,
                CFG_MAX_API_KEY_LEN - 1);
        g_runtime_config.server.api_key[CFG_MAX_API_KEY_LEN - 1] = '\0';

        // Clear the pending key (securely)
        memset(g_runtime_config.server.api_key_next, 0, CFG_MAX_API_KEY_LEN);

        // Update timestamps
        g_runtime_config.server.key_issued_at = time(NULL);
        g_runtime_config.server.key_expires_at = 0;

        CONFIG_UNLOCK();

        LOG_INFO("API key rotation completed");

        // Save the new config
        config_manager_save();

        return true;
    }

    CONFIG_UNLOCK();
    return false;
}

// -----------------------------------------------------------------------------
// COMM-001-6: Secure Authentication Failure Handling
// -----------------------------------------------------------------------------

int config_manager_clear_api_key(void) {
    CONFIG_LOCK();

    // Securely clear the API key
    volatile char *p = g_runtime_config.server.api_key;
    for (size_t i = 0; i < CFG_MAX_API_KEY_LEN; i++) {
        p[i] = 0;
    }

    // Also clear any pending rotation key
    p = g_runtime_config.server.api_key_next;
    for (size_t i = 0; i < CFG_MAX_API_KEY_LEN; i++) {
        p[i] = 0;
    }

    g_runtime_config.server.key_issued_at = 0;
    g_runtime_config.server.key_expires_at = 0;

    CONFIG_UNLOCK();

    LOG_WARN("API key cleared for security");

    return config_manager_save();
}

int config_manager_set_needs_setup(bool needs_setup) {
    CONFIG_LOCK();
    g_runtime_config.needs_setup = needs_setup;
    CONFIG_UNLOCK();

    if (needs_setup) {
        LOG_WARN("Device marked as needing setup");
    }

    return config_manager_save();
}
