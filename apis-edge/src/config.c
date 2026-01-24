/**
 * Configuration loader implementation.
 *
 * Pi: Parses YAML configuration files using libyaml
 * ESP32: Uses compile-time defaults (NVS support in future story)
 */

#include "config.h"
#include "log.h"
#include "platform.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifdef APIS_PLATFORM_PI
#include <yaml.h>
#endif

// Default configuration values
static config_t g_config = {
    .camera = {
        .device_path = "/dev/video0",
        .width = 640,
        .height = 480,
        .fps = 10,
        .focus_distance = 1.5f,
    },
    .storage = {
        .data_dir = "./data",
        .clips_dir = "./data/clips",
        .db_path = "./data/detections.db",
        .max_storage_mb = 0,           // Unlimited
        .clip_retention_days = 30,
    },
    .logging = {
        .level = "INFO",
        .file_path = "./logs/apis.log",
        .json_format = true,
    },
    .server = {
        .server_url = "",
        .api_key = "",
        .heartbeat_interval_s = 60,
        .upload_retry_delay_s = 30,
    },
    .detection = {
        .motion_threshold = 0.02f,     // 2% change threshold
        .min_contour_area = 100,       // Minimum blob size
        .max_contour_area = 50000,     // Maximum blob size
        .hover_duration_s = 2.0f,      // 2 second hover threshold
        .hover_radius_px = 30.0f,      // Max 30px movement for hover
    },
    .recording = {
        .pre_roll_frames = 20,         // ~2 seconds at 10 FPS
        .post_roll_s = 3,              // 3 seconds after detection
        .max_clip_duration_s = 30,     // Max 30 second clips
        .clip_format = "mp4",
    },
};

const config_t *config_defaults(void) {
    return &g_config;
}

bool config_validate(config_t *config) {
    bool valid = true;

    // Validate camera settings
    if (config->camera.width < 320 || config->camera.width > 1920) {
        LOG_WARN("Invalid camera width %d, using 640", config->camera.width);
        config->camera.width = 640;
        valid = false;
    }

    if (config->camera.height < 240 || config->camera.height > 1080) {
        LOG_WARN("Invalid camera height %d, using 480", config->camera.height);
        config->camera.height = 480;
        valid = false;
    }

    if (config->camera.fps < 1 || config->camera.fps > 60) {
        LOG_WARN("Invalid FPS %d, using 10", config->camera.fps);
        config->camera.fps = 10;
        valid = false;
    }

    // Validate detection settings
    if (config->detection.motion_threshold < 0.0f || config->detection.motion_threshold > 1.0f) {
        LOG_WARN("Invalid motion threshold %.2f, using 0.02", config->detection.motion_threshold);
        config->detection.motion_threshold = 0.02f;
        valid = false;
    }

    if (config->detection.hover_duration_s < 0.5f || config->detection.hover_duration_s > 30.0f) {
        LOG_WARN("Invalid hover duration %.1f, using 2.0", config->detection.hover_duration_s);
        config->detection.hover_duration_s = 2.0f;
        valid = false;
    }

    // Validate recording settings
    if (config->recording.pre_roll_frames > 100) {
        LOG_WARN("Pre-roll frames %d too high, using 20", config->recording.pre_roll_frames);
        config->recording.pre_roll_frames = 20;
        valid = false;
    }

    if (config->recording.max_clip_duration_s < 5 || config->recording.max_clip_duration_s > 300) {
        LOG_WARN("Invalid max clip duration %d, using 30", config->recording.max_clip_duration_s);
        config->recording.max_clip_duration_s = 30;
        valid = false;
    }

    return valid;
}

#ifdef APIS_PLATFORM_PI
/**
 * YAML parsing state machine for Pi platform.
 */
typedef enum {
    PARSE_STATE_START,
    PARSE_STATE_SECTION,
    PARSE_STATE_KEY,
    PARSE_STATE_VALUE,
} parse_state_t;

const config_t *config_load(const char *path) {
    if (path == NULL) {
        path = "config.yaml";
    }

    FILE *file = fopen(path, "r");
    if (!file) {
        LOG_WARN("Config file not found: %s (using defaults)", path);
        return &g_config;
    }

    yaml_parser_t parser;
    yaml_event_t event;

    if (!yaml_parser_initialize(&parser)) {
        LOG_ERROR("Failed to initialize YAML parser");
        fclose(file);
        return &g_config;
    }

    yaml_parser_set_input_file(&parser, file);

    // Parsing state
    char current_section[32] = "";
    char current_key[64] = "";
    parse_state_t state = PARSE_STATE_START;

    while (1) {
        if (!yaml_parser_parse(&parser, &event)) {
            LOG_ERROR("YAML parse error at line %zu: %s",
                      parser.problem_mark.line + 1,
                      parser.problem);
            break;
        }

        if (event.type == YAML_STREAM_END_EVENT) {
            yaml_event_delete(&event);
            break;
        }

        switch (event.type) {
            case YAML_MAPPING_START_EVENT:
                if (state == PARSE_STATE_KEY) {
                    // Entering a section
                    state = PARSE_STATE_SECTION;
                }
                break;

            case YAML_MAPPING_END_EVENT:
                if (state == PARSE_STATE_SECTION) {
                    current_section[0] = '\0';
                    state = PARSE_STATE_START;
                }
                break;

            case YAML_SCALAR_EVENT: {
                const char *value = (const char *)event.data.scalar.value;

                if (state == PARSE_STATE_START || state == PARSE_STATE_SECTION) {
                    // Check if this is a section name
                    if (strcmp(value, "camera") == 0 ||
                        strcmp(value, "storage") == 0 ||
                        strcmp(value, "logging") == 0 ||
                        strcmp(value, "server") == 0 ||
                        strcmp(value, "detection") == 0 ||
                        strcmp(value, "recording") == 0) {
                        snprintf(current_section, sizeof(current_section), "%s", value);
                        state = PARSE_STATE_KEY;
                    } else if (current_section[0] != '\0') {
                        // This is a key within a section
                        snprintf(current_key, sizeof(current_key), "%s", value);
                        state = PARSE_STATE_VALUE;
                    }
                } else if (state == PARSE_STATE_VALUE) {
                    // Apply the value to the appropriate config field
                    if (strcmp(current_section, "camera") == 0) {
                        if (strcmp(current_key, "device_path") == 0) {
                            snprintf(g_config.camera.device_path,
                                    sizeof(g_config.camera.device_path), "%s", value);
                        } else if (strcmp(current_key, "width") == 0) {
                            g_config.camera.width = (uint16_t)atoi(value);
                        } else if (strcmp(current_key, "height") == 0) {
                            g_config.camera.height = (uint16_t)atoi(value);
                        } else if (strcmp(current_key, "fps") == 0) {
                            g_config.camera.fps = (uint8_t)atoi(value);
                        } else if (strcmp(current_key, "focus_distance") == 0) {
                            g_config.camera.focus_distance = (float)atof(value);
                        }
                    } else if (strcmp(current_section, "storage") == 0) {
                        if (strcmp(current_key, "data_dir") == 0) {
                            snprintf(g_config.storage.data_dir,
                                    sizeof(g_config.storage.data_dir), "%s", value);
                        } else if (strcmp(current_key, "clips_dir") == 0) {
                            snprintf(g_config.storage.clips_dir,
                                    sizeof(g_config.storage.clips_dir), "%s", value);
                        } else if (strcmp(current_key, "db_path") == 0) {
                            snprintf(g_config.storage.db_path,
                                    sizeof(g_config.storage.db_path), "%s", value);
                        } else if (strcmp(current_key, "max_storage_mb") == 0) {
                            g_config.storage.max_storage_mb = (uint32_t)atoi(value);
                        } else if (strcmp(current_key, "clip_retention_days") == 0) {
                            g_config.storage.clip_retention_days = (uint32_t)atoi(value);
                        }
                    } else if (strcmp(current_section, "logging") == 0) {
                        if (strcmp(current_key, "level") == 0) {
                            snprintf(g_config.logging.level,
                                    sizeof(g_config.logging.level), "%s", value);
                        } else if (strcmp(current_key, "file") == 0 ||
                                   strcmp(current_key, "file_path") == 0) {
                            snprintf(g_config.logging.file_path,
                                    sizeof(g_config.logging.file_path), "%s", value);
                        } else if (strcmp(current_key, "json_format") == 0) {
                            g_config.logging.json_format =
                                (strcmp(value, "true") == 0 || strcmp(value, "1") == 0);
                        }
                    } else if (strcmp(current_section, "server") == 0) {
                        if (strcmp(current_key, "url") == 0 ||
                            strcmp(current_key, "server_url") == 0) {
                            snprintf(g_config.server.server_url,
                                    sizeof(g_config.server.server_url), "%s", value);
                        } else if (strcmp(current_key, "api_key") == 0) {
                            snprintf(g_config.server.api_key,
                                    sizeof(g_config.server.api_key), "%s", value);
                        } else if (strcmp(current_key, "heartbeat_interval") == 0) {
                            g_config.server.heartbeat_interval_s = (uint32_t)atoi(value);
                        }
                    } else if (strcmp(current_section, "detection") == 0) {
                        if (strcmp(current_key, "motion_threshold") == 0) {
                            g_config.detection.motion_threshold = (float)atof(value);
                        } else if (strcmp(current_key, "min_contour_area") == 0) {
                            g_config.detection.min_contour_area = (uint32_t)atoi(value);
                        } else if (strcmp(current_key, "max_contour_area") == 0) {
                            g_config.detection.max_contour_area = (uint32_t)atoi(value);
                        } else if (strcmp(current_key, "hover_duration") == 0) {
                            g_config.detection.hover_duration_s = (float)atof(value);
                        } else if (strcmp(current_key, "hover_radius") == 0) {
                            g_config.detection.hover_radius_px = (float)atof(value);
                        }
                    } else if (strcmp(current_section, "recording") == 0) {
                        if (strcmp(current_key, "pre_roll_frames") == 0) {
                            g_config.recording.pre_roll_frames = (uint32_t)atoi(value);
                        } else if (strcmp(current_key, "post_roll") == 0) {
                            g_config.recording.post_roll_s = (uint32_t)atoi(value);
                        } else if (strcmp(current_key, "max_duration") == 0) {
                            g_config.recording.max_clip_duration_s = (uint32_t)atoi(value);
                        } else if (strcmp(current_key, "format") == 0) {
                            snprintf(g_config.recording.clip_format,
                                    sizeof(g_config.recording.clip_format), "%s", value);
                        }
                    }

                    state = PARSE_STATE_SECTION;
                }
                break;
            }

            default:
                break;
        }

        yaml_event_delete(&event);
    }

    yaml_parser_delete(&parser);
    fclose(file);

    // Validate loaded config
    config_validate(&g_config);

    LOG_INFO("Loaded config from %s", path);
    return &g_config;
}

#else
// ESP32 / Test: Use compile-time defaults
const config_t *config_load(const char *path) {
    (void)path;
#ifdef APIS_PLATFORM_TEST
    LOG_INFO("Using default configuration (test mode)");
#else
    LOG_INFO("Using default configuration (ESP32)");
#endif
    return &g_config;
}
#endif
