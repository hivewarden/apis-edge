/**
 * Hornet Classifier API
 *
 * Classifies tracked detections by size and hovering behavior.
 * Distinguishes hornets from bees based on size and movement patterns.
 */

#ifndef APIS_CLASSIFIER_H
#define APIS_CLASSIFIER_H

#include "detection.h"
#include "tracker.h"
#include <stdint.h>
#include <stdbool.h>

/**
 * Confidence levels for hornet classification.
 */
typedef enum {
    CONFIDENCE_LOW = 0,     // Wrong size or too brief
    CONFIDENCE_MEDIUM = 1,  // Right size, transient
    CONFIDENCE_HIGH = 2,    // Right size, hovering
} confidence_level_t;

/**
 * Classification result for a detection.
 */
typedef enum {
    CLASS_TOO_SMALL = 0,    // Below minimum size (likely bee)
    CLASS_TOO_LARGE = 1,    // Above maximum size (likely not insect)
    CLASS_UNKNOWN = 2,      // In size range but unclassified
    CLASS_HORNET = 3,       // Classified as potential hornet
} classification_t;

/**
 * Classifier status codes.
 */
typedef enum {
    CLASSIFIER_OK = 0,
    CLASSIFIER_ERROR_NOT_INITIALIZED,
    CLASSIFIER_ERROR_INVALID_PARAM,
} classifier_status_t;

/**
 * A classified detection with full context.
 */
typedef struct {
    detection_t detection;          // Original detection
    uint32_t track_id;              // Tracking ID
    confidence_level_t confidence;  // Confidence level
    classification_t classification; // Classification result
    bool is_hovering;               // True if hovering detected
    uint32_t hover_duration_ms;     // How long hovering (if applicable)
    uint32_t track_age_ms;          // Total time tracked
} classified_detection_t;

/**
 * Classifier configuration.
 */
typedef struct {
    // Size thresholds (in pixels at 640x480)
    uint16_t min_size;         // Minimum dimension to consider (18 default)
    uint16_t max_size;         // Maximum dimension to consider (100 default)
    uint16_t hornet_min;       // Hornet minimum dimension (18 default)
    uint16_t hornet_max;       // Hornet maximum dimension (50 default)

    // Hover detection
    uint16_t hover_radius;     // Max movement radius for "hovering" (50 default)
    uint32_t hover_time_ms;    // Time to confirm hover (1000 default)

    // FPS for timing calculations
    uint8_t fps;               // Expected FPS (10 default)
} classifier_config_t;

/**
 * Initialize the classifier.
 *
 * @param config Classifier configuration (NULL for defaults)
 * @return CLASSIFIER_OK on success
 */
classifier_status_t classifier_init(const classifier_config_t *config);

/**
 * Classify tracked detections.
 *
 * @param tracked Array of tracked detections from tracker
 * @param count Number of tracked detections
 * @param results Output array (must hold same count)
 * @return Number of classified detections (>=0), -1 on error
 */
int classifier_classify(
    const tracked_detection_t *tracked,
    int count,
    classified_detection_t *results
);

/**
 * Check if classifier is initialized.
 *
 * @return true if initialized
 */
bool classifier_is_initialized(void);

/**
 * Get classifier defaults.
 *
 * @return Default configuration values
 */
classifier_config_t classifier_config_defaults(void);

/**
 * Cleanup classifier resources.
 */
void classifier_cleanup(void);

/**
 * Get human-readable status string.
 *
 * @param status Status code
 * @return Static string description
 */
const char *classifier_status_str(classifier_status_t status);

/**
 * Get human-readable confidence level string.
 *
 * @param level Confidence level
 * @return Static string description
 */
const char *confidence_level_str(confidence_level_t level);

/**
 * Get human-readable classification string.
 *
 * @param cls Classification
 * @return Static string description
 */
const char *classification_str(classification_t cls);

#endif // APIS_CLASSIFIER_H
