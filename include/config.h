/**
 * Configuration structures and loader.
 *
 * Pi: Loads from config.yaml using libyaml
 * ESP32: Uses compile-time defaults (NVS in future story)
 */

#ifndef APIS_CONFIG_H
#define APIS_CONFIG_H

#include <stdint.h>
#include <stdbool.h>

// Path length limits
#define CONFIG_PATH_MAX 128
#define CONFIG_STR_MAX  64

/**
 * Camera configuration.
 *
 * NOTE: Named apis_camera_config_t to avoid collision with ESP-IDF's
 * camera_config_t type defined in esp_camera.h.
 */
typedef struct {
    char device_path[CONFIG_PATH_MAX];  // e.g., "/dev/video0"
    uint16_t width;                      // Frame width (default: 640)
    uint16_t height;                     // Frame height (default: 480)
    uint8_t fps;                         // Target FPS (default: 10)
    float focus_distance;                // Pi Camera only (meters)
} apis_camera_config_t;

/**
 * Storage configuration.
 */
typedef struct {
    char data_dir[CONFIG_PATH_MAX];      // Base data directory
    char clips_dir[CONFIG_PATH_MAX];     // Clip storage directory
    char db_path[CONFIG_PATH_MAX];       // SQLite database path
    uint32_t max_storage_mb;             // Max storage in MB (0 = unlimited)
    uint32_t clip_retention_days;        // Days to keep clips (0 = forever)
} storage_config_t;

/**
 * Logging configuration.
 */
typedef struct {
    char level[CONFIG_STR_MAX];          // "DEBUG", "INFO", "WARN", "ERROR"
    char file_path[CONFIG_PATH_MAX];     // Log file path (NULL = stdout)
    bool json_format;                    // Use JSON log format
} logging_config_t;

/**
 * Server connection configuration (for later stories).
 */
typedef struct {
    char server_url[CONFIG_PATH_MAX];    // APIS server URL
    char api_key[CONFIG_STR_MAX];        // Device API key
    uint32_t heartbeat_interval_s;       // Heartbeat interval (seconds)
    uint32_t upload_retry_delay_s;       // Retry delay for uploads
} server_config_t;

/**
 * Detection configuration (for Story 10.2+).
 */
typedef struct {
    float motion_threshold;              // Motion sensitivity (0.0-1.0)
    uint32_t min_contour_area;           // Minimum blob size (pixels)
    uint32_t max_contour_area;           // Maximum blob size (pixels)
    float hover_duration_s;              // Hover time threshold
    float hover_radius_px;               // Maximum movement for hover
} detection_config_t;

/**
 * Recording configuration (for Story 10.5).
 */
typedef struct {
    uint32_t pre_roll_frames;            // Frames before detection
    uint32_t post_roll_s;                // Seconds after detection
    uint32_t max_clip_duration_s;        // Maximum clip length
    char clip_format[CONFIG_STR_MAX];    // "mp4" or "jpeg_sequence"
} recording_config_t;

/**
 * Top-level configuration structure.
 */
typedef struct {
    apis_camera_config_t camera;
    storage_config_t storage;
    logging_config_t logging;
    server_config_t server;
    detection_config_t detection;
    recording_config_t recording;
} config_t;

/**
 * Load configuration from YAML file.
 * Falls back to defaults if file not found.
 *
 * @param path Path to config.yaml (NULL for default "config.yaml")
 * @return Pointer to static config (do not free)
 */
const config_t *config_load(const char *path);

/**
 * Get default configuration values.
 *
 * @return Pointer to static default config
 */
const config_t *config_defaults(void);

/**
 * Validate configuration values.
 * Logs warnings for invalid values and applies safe defaults.
 *
 * @param config Config to validate
 * @return true if config is valid, false if corrections were made
 */
bool config_validate(config_t *config);

#endif // APIS_CONFIG_H
