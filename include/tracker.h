/**
 * Centroid Tracker API
 *
 * Tracks detected objects across frames using centroid-based matching.
 * Maintains position history for hover detection.
 */

#ifndef APIS_TRACKER_H
#define APIS_TRACKER_H

#include "detection.h"
#include <stdint.h>
#include <stdbool.h>

#define MAX_TRACKED_OBJECTS 20     // Prevent memory issues
#define MAX_TRACK_HISTORY 30       // ~3 seconds at 10 FPS
#define MAX_DISAPPEARED_FRAMES 30  // Frames before deregistration

// Ensure these fit in their respective types
_Static_assert(MAX_TRACKED_OBJECTS <= 255, "MAX_TRACKED_OBJECTS exceeds uint8_t range");
_Static_assert(MAX_TRACK_HISTORY <= 255, "MAX_TRACK_HISTORY exceeds uint8_t range");

/**
 * Tracker status codes.
 */
typedef enum {
    TRACKER_OK = 0,
    TRACKER_ERROR_NOT_INITIALIZED,
    TRACKER_ERROR_INVALID_PARAM,
    TRACKER_ERROR_NO_SLOTS,
} tracker_status_t;

/**
 * Position history entry.
 */
typedef struct {
    uint16_t x;
    uint16_t y;
    uint32_t timestamp_ms;
} track_position_t;

/**
 * A tracked object with history.
 */
typedef struct {
    uint32_t id;                              // Unique track ID
    uint16_t centroid_x;                      // Current centroid x
    uint16_t centroid_y;                      // Current centroid y
    track_position_t history[MAX_TRACK_HISTORY];  // Position history (ring buffer)
    uint8_t history_count;                    // Valid entries in history
    uint8_t history_head;                     // Ring buffer head index
    uint16_t disappeared_frames;              // Frames since last seen
    bool active;                              // Is this slot in use?
    detection_t last_detection;               // Most recent detection
} tracked_object_t;

/**
 * Tracker configuration.
 */
typedef struct {
    uint16_t max_distance;        // Max pixels for centroid matching (100 default)
    uint16_t max_disappeared;     // Frames before deregistration (30 default)
    uint8_t history_length;       // Position history length (30 default)
} tracker_config_t;

/**
 * Result of tracking update for a single detection.
 */
typedef struct {
    uint32_t track_id;            // Assigned track ID
    detection_t detection;        // Original detection
    bool is_new;                  // True if new track
} tracked_detection_t;

/**
 * Initialize the tracker.
 *
 * @param config Tracker configuration (NULL for defaults)
 * @return TRACKER_OK (0) on success, error code otherwise
 */
tracker_status_t tracker_init(const tracker_config_t *config);

/**
 * Update tracker with new detections.
 *
 * @param detections Array of detections from motion detector
 * @param count Number of detections (will be clamped to MAX_DETECTIONS)
 * @param timestamp_ms Current timestamp
 * @param results Output array - MUST hold at least MAX_TRACKED_OBJECTS entries.
 *                Caller is responsible for allocating sufficient buffer space.
 *                Buffer overrun will occur if results array is smaller than
 *                MAX_TRACKED_OBJECTS * sizeof(tracked_detection_t).
 * @return Number of tracked detections (>=0), -1 on error
 */
int tracker_update(
    const detection_t *detections,
    int count,
    uint32_t timestamp_ms,
    tracked_detection_t *results
);

/**
 * Get position history for a tracked object.
 *
 * @param track_id Track ID
 * @param history Output array (must hold MAX_TRACK_HISTORY entries)
 * @return Number of history entries (0 if track not found)
 */
int tracker_get_history(uint32_t track_id, track_position_t *history);

/**
 * Get a tracked object by ID.
 *
 * @param track_id Track ID
 * @return Pointer to tracked object, or NULL if not found
 */
const tracked_object_t *tracker_get_object(uint32_t track_id);

/**
 * Get current number of active tracks.
 *
 * @return Number of active tracks
 */
int tracker_get_active_count(void);

/**
 * Check if tracker is initialized.
 *
 * @return true if initialized
 */
bool tracker_is_initialized(void);

/**
 * Get tracker defaults.
 *
 * @return Default configuration values
 */
tracker_config_t tracker_config_defaults(void);

/**
 * Reset tracker state (deregister all tracks).
 */
void tracker_reset(void);

/**
 * Cleanup tracker resources.
 */
void tracker_cleanup(void);

/**
 * Get human-readable status string.
 *
 * @param status Status code
 * @return Static string description
 */
const char *tracker_status_str(tracker_status_t status);

#endif // APIS_TRACKER_H
