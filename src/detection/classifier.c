/**
 * Hornet classifier implementation.
 *
 * Classifies tracked detections based on:
 * 1. Size filtering (18-50px for hornet-sized objects at VGA)
 * 2. Hover detection (stationary in ~50px radius for >1 second)
 *
 * Confidence levels:
 * - HIGH: Hornet-sized + hovering behavior
 * - MEDIUM: Hornet-sized but transient (moving through)
 * - LOW: Wrong size or insufficient data
 */

#include "classifier.h"
#include "tracker.h"
#include "log.h"
#include "platform_mutex.h"
#include <string.h>

APIS_MUTEX_DECLARE(classifier);
#define CLASSIFIER_LOCK()   APIS_MUTEX_LOCK(classifier)
#define CLASSIFIER_UNLOCK() APIS_MUTEX_UNLOCK(classifier)

static classifier_config_t g_config;
static bool g_initialized = false;

classifier_config_t classifier_config_defaults(void) {
    return (classifier_config_t){
        .min_size = 18,
        .max_size = 100,
        .hornet_min = 18,
        .hornet_max = 50,
        .hover_radius = 50,
        .hover_time_ms = 1000,
        .fps = 10,
    };
}

classifier_status_t classifier_init(const classifier_config_t *config) {
    CLASSIFIER_LOCK();

    if (config == NULL) {
        g_config = classifier_config_defaults();
    } else {
        g_config = *config;
    }

    // Validate config
    if (g_config.min_size > g_config.max_size) {
        LOG_WARN("classifier_init: min_size > max_size, swapping");
        uint16_t tmp = g_config.min_size;
        g_config.min_size = g_config.max_size;
        g_config.max_size = tmp;
    }

    if (g_config.hornet_min > g_config.hornet_max) {
        LOG_WARN("classifier_init: hornet_min > hornet_max, swapping");
        uint16_t tmp = g_config.hornet_min;
        g_config.hornet_min = g_config.hornet_max;
        g_config.hornet_max = tmp;
    }

    if (g_config.hover_time_ms == 0) {
        LOG_WARN("classifier_init: hover_time_ms is 0, using default");
        g_config.hover_time_ms = 1000;
    }

    if (g_config.fps == 0) {
        LOG_WARN("classifier_init: fps is 0, using default");
        g_config.fps = 10;
    }

    g_initialized = true;

    uint16_t h_min = g_config.hornet_min;
    uint16_t h_max = g_config.hornet_max;
    uint16_t h_rad = g_config.hover_radius;
    uint32_t h_time = g_config.hover_time_ms;
    CLASSIFIER_UNLOCK();

    LOG_INFO("Classifier initialized (hornet size: %u-%u px, hover: %u px / %u ms)",
             h_min, h_max, h_rad, h_time);

    return CLASSIFIER_OK;
}

bool classifier_is_initialized(void) {
    CLASSIFIER_LOCK();
    bool init = g_initialized;
    CLASSIFIER_UNLOCK();
    return init;
}

/**
 * Classify detection by size.
 */
static classification_t classify_by_size(const detection_t *det, const classifier_config_t *cfg) {
    // Use max dimension for size comparison
    uint16_t size = (det->w > det->h) ? det->w : det->h;

    if (size < cfg->min_size) {
        return CLASS_TOO_SMALL;
    }

    if (size > cfg->max_size) {
        return CLASS_TOO_LARGE;
    }

    // Check if in hornet size range
    if (size >= cfg->hornet_min && size <= cfg->hornet_max) {
        return CLASS_HORNET;
    }

    return CLASS_UNKNOWN;
}

/**
 * Analyze position history to detect hovering.
 *
 * An object is hovering if it stays within hover_radius
 * for at least hover_time_ms.
 *
 * @param track_id Track ID to analyze
 * @param duration_ms Output: how long the object has been tracked
 * @return true if object is hovering
 */
static bool analyze_hover(uint32_t track_id, uint32_t *duration_ms, const classifier_config_t *cfg) {
    track_position_t history[MAX_TRACK_HISTORY];
    int count = tracker_get_history(track_id, history);

    *duration_ms = 0;

    if (count < 2) {
        return false;
    }

    // Calculate bounding box of all positions
    uint16_t min_x = history[0].x, max_x = history[0].x;
    uint16_t min_y = history[0].y, max_y = history[0].y;

    for (int i = 1; i < count; i++) {
        if (history[i].x < min_x) min_x = history[i].x;
        if (history[i].x > max_x) max_x = history[i].x;
        if (history[i].y < min_y) min_y = history[i].y;
        if (history[i].y > max_y) max_y = history[i].y;
    }

    // Movement "radius" is max of x and y range (bounding box approach).
    // C7-LOW-006: This uses Chebyshev distance (max of |dx|, |dy|) rather than
    // Euclidean distance. This is intentional: a) it's faster (no sqrt),
    // b) it's more lenient for diagonal movement which matches real hornet
    // hovering patterns, and c) for small radii the difference is negligible.
    // Note: Effective diagonal radius is hover_radius * sqrt(2) ~ 1.41x the
    // configured value (e.g., 50px configured = ~71px effective diagonally).
    uint16_t movement_x = max_x - min_x;
    uint16_t movement_y = max_y - min_y;
    uint16_t movement_radius = (movement_x > movement_y) ? movement_x : movement_y;

    // Calculate track duration
    // History is in chronological order (oldest to newest)
    uint32_t oldest_ts = history[0].timestamp_ms;
    uint32_t newest_ts = history[count - 1].timestamp_ms;

    // Handle timestamp wraparound (after ~49 days)
    uint32_t track_duration;
    if (newest_ts >= oldest_ts) {
        track_duration = newest_ts - oldest_ts;
    } else {
        // Wraparound occurred
        track_duration = (UINT32_MAX - oldest_ts) + newest_ts + 1;
    }

    *duration_ms = track_duration;

    // Hovering = small movement over sufficient time
    bool is_hovering = (movement_radius <= cfg->hover_radius) &&
                       (track_duration >= cfg->hover_time_ms);

    return is_hovering;
}

int classifier_classify(
    const tracked_detection_t *tracked,
    int count,
    classified_detection_t *results
) {
    CLASSIFIER_LOCK();

    if (!g_initialized) {
        CLASSIFIER_UNLOCK();
        LOG_WARN("classifier_classify called before initialization");
        return -1;
    }

    if (tracked == NULL || results == NULL) {
        CLASSIFIER_UNLOCK();
        LOG_WARN("classifier_classify: NULL parameter");
        return -1;
    }

    if (count < 0) {
        CLASSIFIER_UNLOCK();
        return 0;
    }

    // Copy config under lock for use during classification
    classifier_config_t cfg = g_config;
    CLASSIFIER_UNLOCK();

    for (int i = 0; i < count; i++) {
        classified_detection_t *result = &results[i];

        // Copy basic info
        result->detection = tracked[i].detection;
        result->track_id = tracked[i].track_id;

        // Size classification
        result->classification = classify_by_size(&tracked[i].detection, &cfg);

        // Initialize hover fields
        result->is_hovering = false;
        result->hover_duration_ms = 0;
        result->track_age_ms = 0;

        // Hover analysis (only for hornet-sized objects)
        if (result->classification == CLASS_HORNET) {
            result->is_hovering = analyze_hover(
                tracked[i].track_id,
                &result->track_age_ms,
                &cfg
            );

            // If hovering, the duration is the track age
            if (result->is_hovering) {
                result->hover_duration_ms = result->track_age_ms;
            }
        } else {
            // Still get track age for non-hornet objects
            track_position_t history[MAX_TRACK_HISTORY];
            int hist_count = tracker_get_history(tracked[i].track_id, history);
            if (hist_count >= 2) {
                uint32_t oldest = history[0].timestamp_ms;
                uint32_t newest = history[hist_count - 1].timestamp_ms;
                if (newest >= oldest) {
                    result->track_age_ms = newest - oldest;
                } else {
                    result->track_age_ms = (UINT32_MAX - oldest) + newest + 1;
                }
            }
        }

        // Confidence scoring
        if (result->classification != CLASS_HORNET) {
            result->confidence = CONFIDENCE_LOW;
        } else if (result->is_hovering) {
            result->confidence = CONFIDENCE_HIGH;
        } else {
            result->confidence = CONFIDENCE_MEDIUM;
        }
    }

    return count;
}

void classifier_cleanup(void) {
    CLASSIFIER_LOCK();
    g_initialized = false;
    CLASSIFIER_UNLOCK();
    LOG_INFO("Classifier cleanup complete");
}

const char *classifier_status_str(classifier_status_t status) {
    switch (status) {
        case CLASSIFIER_OK:                    return "OK";
        case CLASSIFIER_ERROR_NOT_INITIALIZED: return "Not initialized";
        case CLASSIFIER_ERROR_INVALID_PARAM:   return "Invalid parameter";
        default:                               return "Unknown error";
    }
}

const char *confidence_level_str(confidence_level_t level) {
    switch (level) {
        case CONFIDENCE_LOW:    return "LOW";
        case CONFIDENCE_MEDIUM: return "MEDIUM";
        case CONFIDENCE_HIGH:   return "HIGH";
        default:                return "UNKNOWN";
    }
}

const char *classification_str(classification_t cls) {
    switch (cls) {
        case CLASS_TOO_SMALL: return "TOO_SMALL";
        case CLASS_TOO_LARGE: return "TOO_LARGE";
        case CLASS_UNKNOWN:   return "UNKNOWN";
        case CLASS_HORNET:    return "HORNET";
        default:              return "INVALID";
    }
}
