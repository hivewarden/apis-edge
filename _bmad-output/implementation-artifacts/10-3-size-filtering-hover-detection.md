# Story 10.3: Size Filtering & Hover Detection

Status: done

## Story

As an **APIS unit**,
I want to identify hornets by size and hovering behavior,
So that I can distinguish them from bees and other insects.

## Acceptance Criteria

### AC1: Size-Based Filtering
**Given** motion regions are detected
**When** size filtering runs
**Then** objects smaller than 18px (at VGA) are ignored
**And** objects matching hornet size (18-50px typical) are flagged
**And** very large objects (>100px, likely not insects) are ignored

### AC2: Hover Detection
**Given** a hornet-sized object is detected
**When** hover detection runs
**Then** the system tracks the object across frames
**And** if the object remains in a ~50px radius for >1 second
**Then** it's classified as "hovering" (high confidence hornet)

### AC3: Transient Classification
**Given** an object moves quickly through frame
**When** analysis runs
**Then** it's logged as "transient" (lower confidence)
**And** still triggers alert but not full laser activation

### AC4: Size Calibration Mode (Deferred)
**Given** size calibration is needed
**When** setup mode is active
**Then** user can place a reference object
**And** system calculates pixels-per-cm for the current distance

> **Note:** Size calibration is deferred to a future story. Default pixel thresholds (18-50px) work well at 1-1.5m camera distance. If field testing shows calibration is needed, create Story 10.X for calibration workflow.

## Tasks / Subtasks

- [x] **Task 1: Size Filter Implementation** (AC: 1)
  - [x] 1.1: Configure min/max pixel size thresholds
  - [x] 1.2: Filter detections by bounding box dimensions
  - [x] 1.3: Add configurable size range

- [x] **Task 2: Object Tracking** (AC: 2, 3)
  - [x] 2.1: Implement simple centroid tracker
  - [x] 2.2: Track objects across frames by nearest centroid
  - [x] 2.3: Maintain track history (last N positions)
  - [x] 2.4: Assign unique IDs to tracked objects

- [x] **Task 3: Hover Analysis** (AC: 2)
  - [x] 3.1: Calculate movement radius over time window
  - [x] 3.2: Detect "stationary" objects (radius < 50px over 1 second)
  - [x] 3.3: Classify as hovering vs transient

- [x] **Task 4: Confidence Scoring** (AC: 2, 3)
  - [x] 4.1: Assign confidence levels (high/medium/low)
  - [x] 4.2: hovering + right size = high confidence
  - [x] 4.3: right size but transient = medium confidence
  - [x] 4.4: Output classification with detection

## Technical Notes

### Project Structure

```
apis-edge/
├── include/
│   ├── detection.h          # From Story 10.2
│   ├── tracker.h            # Centroid tracker interface
│   └── classifier.h         # Hornet classifier interface
├── src/
│   └── detection/
│       ├── motion.c         # From Story 10.2
│       ├── tracker.c        # Centroid tracking
│       └── classifier.c     # Size filter + hover detection
└── tests/
    ├── test_tracker.c
    └── test_classifier.c
```

### Tracker Data Structures

```c
// include/tracker.h
#ifndef APIS_TRACKER_H
#define APIS_TRACKER_H

#include "detection.h"
#include <stdint.h>
#include <stdbool.h>

#define MAX_TRACKED_OBJECTS 20     // Prevent memory issues
#define MAX_TRACK_HISTORY 30       // ~3 seconds at 10 FPS
#define MAX_DISAPPEARED_FRAMES 30  // Frames before deregistration

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
    track_position_t history[MAX_TRACK_HISTORY];  // Position history
    uint8_t history_count;                    // Valid entries in history
    uint8_t history_head;                     // Ring buffer head
    uint16_t disappeared_frames;              // Frames since last seen
    bool active;                              // Is this slot in use?
    detection_t last_detection;               // Most recent detection
} tracked_object_t;

/**
 * Tracker state.
 */
typedef struct {
    tracked_object_t objects[MAX_TRACKED_OBJECTS];
    uint32_t next_id;
    uint8_t active_count;
} tracker_state_t;

/**
 * Tracker configuration.
 */
typedef struct {
    uint16_t max_distance;        // Max pixels for centroid matching (100 default)
    uint16_t max_disappeared;     // Frames before deregistration (30 default)
    uint8_t history_length;       // Position history length (30 default)
} tracker_config_t;

/**
 * Result of tracking update.
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
 * @return 0 on success
 */
int tracker_init(const tracker_config_t *config);

/**
 * Update tracker with new detections.
 *
 * @param detections Array of detections from motion detector
 * @param count Number of detections
 * @param timestamp_ms Current timestamp
 * @param results Output array (must hold MAX_TRACKED_OBJECTS entries)
 * @return Number of tracked detections
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
 * Get tracker defaults.
 */
tracker_config_t tracker_config_defaults(void);

/**
 * Reset tracker state.
 */
void tracker_reset(void);

/**
 * Cleanup tracker resources.
 */
void tracker_cleanup(void);

#endif // APIS_TRACKER_H
```

### Classifier Data Structures

```c
// include/classifier.h
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
    CLASS_TOO_SMALL = 0,    // Below minimum size
    CLASS_TOO_LARGE = 1,    // Above maximum size
    CLASS_UNKNOWN = 2,      // In size range but unclassified
    CLASS_HORNET = 3,       // Classified as hornet
} classification_t;

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
} classified_detection_t;

/**
 * Classifier configuration.
 */
typedef struct {
    // Size thresholds (in pixels at 640x480)
    uint16_t min_size;         // Minimum dimension (18 default)
    uint16_t max_size;         // Maximum dimension (100 default)
    uint16_t hornet_min;       // Hornet minimum (18 default)
    uint16_t hornet_max;       // Hornet maximum (50 default)

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
 * @return 0 on success
 */
int classifier_init(const classifier_config_t *config);

/**
 * Classify tracked detections.
 *
 * @param tracked Array of tracked detections from tracker
 * @param count Number of tracked detections
 * @param results Output array (must hold same count)
 * @return Number of classified detections
 */
int classifier_classify(
    const tracked_detection_t *tracked,
    int count,
    classified_detection_t *results
);

/**
 * Get classifier defaults.
 */
classifier_config_t classifier_config_defaults(void);

/**
 * Cleanup classifier resources.
 */
void classifier_cleanup(void);

#endif // APIS_CLASSIFIER_H
```

### Centroid Tracker Implementation

```c
// src/detection/tracker.c
/**
 * Centroid-based object tracking.
 *
 * Uses Hungarian algorithm approximation for optimal assignment
 * of new detections to existing tracks.
 */

#include "tracker.h"
#include "log.h"
#include <string.h>
#include <stdlib.h>
#include <math.h>

static tracker_state_t g_state;
static tracker_config_t g_config;
static bool g_initialized = false;

tracker_config_t tracker_config_defaults(void) {
    return (tracker_config_t){
        .max_distance = 100,
        .max_disappeared = 30,
        .history_length = 30,
    };
}

int tracker_init(const tracker_config_t *config) {
    if (config == NULL) {
        g_config = tracker_config_defaults();
    } else {
        g_config = *config;
    }

    memset(&g_state, 0, sizeof(g_state));
    g_state.next_id = 1;
    g_initialized = true;

    LOG_INFO("Tracker initialized (max_distance=%d, max_disappeared=%d)",
             g_config.max_distance, g_config.max_disappeared);

    return 0;
}

/**
 * Calculate Euclidean distance between two points.
 */
static float distance(int x1, int y1, int x2, int y2) {
    int dx = x2 - x1;
    int dy = y2 - y1;
    return sqrtf((float)(dx * dx + dy * dy));
}

/**
 * Register a new tracked object.
 */
static tracked_object_t *register_object(const detection_t *det, uint32_t timestamp_ms) {
    // Find empty slot
    for (int i = 0; i < MAX_TRACKED_OBJECTS; i++) {
        if (!g_state.objects[i].active) {
            tracked_object_t *obj = &g_state.objects[i];

            obj->id = g_state.next_id++;
            obj->centroid_x = det->centroid_x;
            obj->centroid_y = det->centroid_y;
            obj->history_count = 1;
            obj->history_head = 0;
            obj->history[0].x = det->centroid_x;
            obj->history[0].y = det->centroid_y;
            obj->history[0].timestamp_ms = timestamp_ms;
            obj->disappeared_frames = 0;
            obj->active = true;
            obj->last_detection = *det;

            g_state.active_count++;

            LOG_DEBUG("Registered new track: id=%d at (%d,%d)",
                     obj->id, obj->centroid_x, obj->centroid_y);

            return obj;
        }
    }

    LOG_WARN("No free slots for new track");
    return NULL;
}

/**
 * Deregister a tracked object.
 */
static void deregister_object(tracked_object_t *obj) {
    LOG_DEBUG("Deregistered track: id=%d", obj->id);
    obj->active = false;
    g_state.active_count--;
}

/**
 * Update a tracked object with new detection.
 */
static void update_object(tracked_object_t *obj, const detection_t *det, uint32_t timestamp_ms) {
    obj->centroid_x = det->centroid_x;
    obj->centroid_y = det->centroid_y;
    obj->disappeared_frames = 0;
    obj->last_detection = *det;

    // Add to history (ring buffer)
    uint8_t next = (obj->history_head + 1) % MAX_TRACK_HISTORY;
    obj->history[next].x = det->centroid_x;
    obj->history[next].y = det->centroid_y;
    obj->history[next].timestamp_ms = timestamp_ms;
    obj->history_head = next;

    if (obj->history_count < MAX_TRACK_HISTORY) {
        obj->history_count++;
    }
}

int tracker_update(
    const detection_t *detections,
    int count,
    uint32_t timestamp_ms,
    tracked_detection_t *results
) {
    if (!g_initialized) return -1;

    // Handle no detections - mark all as disappeared
    if (count == 0) {
        for (int i = 0; i < MAX_TRACKED_OBJECTS; i++) {
            if (g_state.objects[i].active) {
                g_state.objects[i].disappeared_frames++;
                if (g_state.objects[i].disappeared_frames > g_config.max_disappeared) {
                    deregister_object(&g_state.objects[i]);
                }
            }
        }
        return 0;
    }

    // Handle no existing objects - register all new
    if (g_state.active_count == 0) {
        int result_count = 0;
        for (int i = 0; i < count && result_count < MAX_TRACKED_OBJECTS; i++) {
            tracked_object_t *obj = register_object(&detections[i], timestamp_ms);
            if (obj) {
                results[result_count].track_id = obj->id;
                results[result_count].detection = detections[i];
                results[result_count].is_new = true;
                result_count++;
            }
        }
        return result_count;
    }

    // Greedy assignment: for each detection, find nearest unassigned track
    bool det_assigned[MAX_DETECTIONS] = {false};
    bool obj_assigned[MAX_TRACKED_OBJECTS] = {false};
    int result_count = 0;

    // For each active object, find nearest detection
    for (int o = 0; o < MAX_TRACKED_OBJECTS; o++) {
        if (!g_state.objects[o].active) continue;

        tracked_object_t *obj = &g_state.objects[o];
        float min_dist = (float)g_config.max_distance;
        int best_det = -1;

        for (int d = 0; d < count; d++) {
            if (det_assigned[d]) continue;

            float dist = distance(
                obj->centroid_x, obj->centroid_y,
                detections[d].centroid_x, detections[d].centroid_y
            );

            if (dist < min_dist) {
                min_dist = dist;
                best_det = d;
            }
        }

        if (best_det >= 0) {
            // Match found
            update_object(obj, &detections[best_det], timestamp_ms);
            det_assigned[best_det] = true;
            obj_assigned[o] = true;

            results[result_count].track_id = obj->id;
            results[result_count].detection = detections[best_det];
            results[result_count].is_new = false;
            result_count++;
        }
    }

    // Handle unmatched objects (disappeared)
    for (int o = 0; o < MAX_TRACKED_OBJECTS; o++) {
        if (g_state.objects[o].active && !obj_assigned[o]) {
            g_state.objects[o].disappeared_frames++;
            if (g_state.objects[o].disappeared_frames > g_config.max_disappeared) {
                deregister_object(&g_state.objects[o]);
            }
        }
    }

    // Handle unmatched detections (new objects)
    for (int d = 0; d < count; d++) {
        if (!det_assigned[d] && result_count < MAX_TRACKED_OBJECTS) {
            tracked_object_t *obj = register_object(&detections[d], timestamp_ms);
            if (obj) {
                results[result_count].track_id = obj->id;
                results[result_count].detection = detections[d];
                results[result_count].is_new = true;
                result_count++;
            }
        }
    }

    return result_count;
}

int tracker_get_history(uint32_t track_id, track_position_t *history) {
    for (int i = 0; i < MAX_TRACKED_OBJECTS; i++) {
        if (g_state.objects[i].active && g_state.objects[i].id == track_id) {
            tracked_object_t *obj = &g_state.objects[i];

            // Copy history in chronological order
            int count = obj->history_count;
            int start = (obj->history_head - count + 1 + MAX_TRACK_HISTORY) % MAX_TRACK_HISTORY;

            for (int j = 0; j < count; j++) {
                int idx = (start + j) % MAX_TRACK_HISTORY;
                history[j] = obj->history[idx];
            }

            return count;
        }
    }
    return 0;
}

void tracker_reset(void) {
    memset(&g_state, 0, sizeof(g_state));
    g_state.next_id = 1;
    LOG_INFO("Tracker reset");
}

void tracker_cleanup(void) {
    g_initialized = false;
    LOG_INFO("Tracker cleanup complete");
}
```

### Classifier Implementation

```c
// src/detection/classifier.c
/**
 * Hornet classification based on size and hover behavior.
 */

#include "classifier.h"
#include "tracker.h"
#include "log.h"
#include <string.h>
#include <math.h>

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

int classifier_init(const classifier_config_t *config) {
    if (config == NULL) {
        g_config = classifier_config_defaults();
    } else {
        g_config = *config;
    }

    g_initialized = true;

    LOG_INFO("Classifier initialized (hornet size: %d-%d px, hover: %d px / %d ms)",
             g_config.hornet_min, g_config.hornet_max,
             g_config.hover_radius, g_config.hover_time_ms);

    return 0;
}

/**
 * Check if size is in hornet range.
 */
static classification_t classify_by_size(const detection_t *det) {
    uint16_t size = (det->w > det->h) ? det->w : det->h;  // Max dimension

    if (size < g_config.min_size) {
        return CLASS_TOO_SMALL;
    }

    if (size > g_config.max_size) {
        return CLASS_TOO_LARGE;
    }

    if (size >= g_config.hornet_min && size <= g_config.hornet_max) {
        return CLASS_HORNET;
    }

    return CLASS_UNKNOWN;
}

/**
 * Analyze position history to detect hovering.
 *
 * An object is hovering if it stays within hover_radius
 * for at least hover_time_ms.
 */
static bool analyze_hover(uint32_t track_id, uint32_t *duration_ms) {
    track_position_t history[MAX_TRACK_HISTORY];
    int count = tracker_get_history(track_id, history);

    if (count < 2) {
        *duration_ms = 0;
        return false;
    }

    // Calculate bounding box of movement
    uint16_t min_x = history[0].x, max_x = history[0].x;
    uint16_t min_y = history[0].y, max_y = history[0].y;

    for (int i = 1; i < count; i++) {
        if (history[i].x < min_x) min_x = history[i].x;
        if (history[i].x > max_x) max_x = history[i].x;
        if (history[i].y < min_y) min_y = history[i].y;
        if (history[i].y > max_y) max_y = history[i].y;
    }

    uint16_t movement_x = max_x - min_x;
    uint16_t movement_y = max_y - min_y;
    uint16_t movement_radius = (movement_x > movement_y) ? movement_x : movement_y;

    // Calculate duration
    uint32_t oldest_ts = history[0].timestamp_ms;
    uint32_t newest_ts = history[count - 1].timestamp_ms;
    uint32_t track_duration = newest_ts - oldest_ts;

    *duration_ms = track_duration;

    // Hovering = small movement over sufficient time
    bool is_hovering = (movement_radius < g_config.hover_radius) &&
                       (track_duration >= g_config.hover_time_ms);

    return is_hovering;
}

int classifier_classify(
    const tracked_detection_t *tracked,
    int count,
    classified_detection_t *results
) {
    if (!g_initialized) return -1;

    for (int i = 0; i < count; i++) {
        classified_detection_t *result = &results[i];

        result->detection = tracked[i].detection;
        result->track_id = tracked[i].track_id;

        // Size classification
        result->classification = classify_by_size(&tracked[i].detection);

        // Hover analysis (only for hornet-sized objects)
        result->is_hovering = false;
        result->hover_duration_ms = 0;

        if (result->classification == CLASS_HORNET) {
            result->is_hovering = analyze_hover(
                tracked[i].track_id,
                &result->hover_duration_ms
            );
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
    g_initialized = false;
    LOG_INFO("Classifier cleanup complete");
}
```

### Hornet vs Bee Size Comparison

At 1-1.5m camera distance (640x480 resolution):
- **Honeybee**: 12-15mm body → ~10-15 pixels
- **Asian Hornet**: 25-35mm body → **18-50 pixels**
- **European Hornet**: 25-35mm body → 18-50 pixels (similar to Asian)

**Key differentiator**: Asian hornets **hover** in front of hive entrance. Bees fly in/out quickly.

### Confidence Levels

| Confidence | Criteria | Laser Activation |
|------------|----------|------------------|
| **HIGH** | Hornet size (18-50px) + hovering >1s | Yes, full sweep |
| **MEDIUM** | Hornet size, transient (moving through) | Yes, brief pulse |
| **LOW** | Wrong size or too brief | No, log only |

### Test Program

```c
// tests/test_classifier.c
/**
 * Test program for tracker and classifier modules.
 */

#include "detection.h"
#include "tracker.h"
#include "classifier.h"
#include "log.h"

#include <stdio.h>
#include <string.h>

// Simulate a hovering object
static void test_hover_detection(void) {
    printf("Testing hover detection...\n");

    tracker_init(NULL);
    classifier_init(NULL);

    tracked_detection_t tracked[MAX_TRACKED_OBJECTS];
    classified_detection_t classified[MAX_TRACKED_OBJECTS];

    // Simulate 20 frames of a hovering object (slight movement)
    for (int frame = 0; frame < 20; frame++) {
        detection_t det = {
            .x = 100 + (frame % 3) * 2,  // Slight jitter
            .y = 100 + (frame % 2) * 2,
            .w = 30,  // Hornet size
            .h = 25,
            .area = 750,
            .centroid_x = 115 + (frame % 3) * 2,
            .centroid_y = 112 + (frame % 2) * 2,
        };

        uint32_t timestamp = frame * 100;  // 10 FPS = 100ms per frame

        int tracked_count = tracker_update(&det, 1, timestamp, tracked);
        int classified_count = classifier_classify(tracked, tracked_count, classified);

        if (frame == 19) {  // Last frame
            printf("Frame %d: track_id=%d, hovering=%d, duration=%d ms, confidence=%d\n",
                   frame,
                   classified[0].track_id,
                   classified[0].is_hovering,
                   classified[0].hover_duration_ms,
                   classified[0].confidence);
        }
    }

    // Should be classified as HIGH confidence (hovering)
    if (classified[0].confidence == CONFIDENCE_HIGH && classified[0].is_hovering) {
        printf("PASS: Hover detection works\n");
    } else {
        printf("FAIL: Expected HIGH confidence hovering\n");
    }

    tracker_cleanup();
    classifier_cleanup();
}

// Simulate a transient object
static void test_transient_detection(void) {
    printf("Testing transient detection...\n");

    tracker_init(NULL);
    classifier_init(NULL);

    tracked_detection_t tracked[MAX_TRACKED_OBJECTS];
    classified_detection_t classified[MAX_TRACKED_OBJECTS];

    // Simulate 5 frames of a fast-moving object
    for (int frame = 0; frame < 5; frame++) {
        detection_t det = {
            .x = 100 + frame * 50,  // Moving fast
            .y = 100 + frame * 30,
            .w = 30,  // Hornet size
            .h = 25,
            .area = 750,
            .centroid_x = 115 + frame * 50,
            .centroid_y = 112 + frame * 30,
        };

        uint32_t timestamp = frame * 100;

        int tracked_count = tracker_update(&det, 1, timestamp, tracked);
        int classified_count = classifier_classify(tracked, tracked_count, classified);
    }

    // Should be MEDIUM confidence (not hovering)
    if (classified[0].confidence == CONFIDENCE_MEDIUM && !classified[0].is_hovering) {
        printf("PASS: Transient detection works\n");
    } else {
        printf("FAIL: Expected MEDIUM confidence transient\n");
    }

    tracker_cleanup();
    classifier_cleanup();
}

// Test size filtering
static void test_size_filter(void) {
    printf("Testing size filter...\n");

    classifier_init(NULL);
    tracker_init(NULL);

    tracked_detection_t tracked[3];
    classified_detection_t classified[3];

    // Small object (bee)
    detection_t small = {.x = 100, .y = 100, .w = 12, .h = 10, .area = 120,
                         .centroid_x = 106, .centroid_y = 105};

    // Hornet-sized object
    detection_t hornet = {.x = 200, .y = 100, .w = 30, .h = 25, .area = 750,
                          .centroid_x = 215, .centroid_y = 112};

    // Large object (not insect)
    detection_t large = {.x = 300, .y = 100, .w = 120, .h = 100, .area = 12000,
                         .centroid_x = 360, .centroid_y = 150};

    detection_t dets[3] = {small, hornet, large};

    int tracked_count = tracker_update(dets, 3, 0, tracked);
    classifier_classify(tracked, tracked_count, classified);

    printf("Small (w=%d): class=%d (expected TOO_SMALL=0)\n",
           classified[0].detection.w, classified[0].classification);
    printf("Hornet (w=%d): class=%d (expected HORNET=3)\n",
           classified[1].detection.w, classified[1].classification);
    printf("Large (w=%d): class=%d (expected TOO_LARGE=1)\n",
           classified[2].detection.w, classified[2].classification);

    tracker_cleanup();
    classifier_cleanup();
}

int main(void) {
    log_init(NULL, LOG_LEVEL_INFO, false);

    test_size_filter();
    test_hover_detection();
    test_transient_detection();

    return 0;
}
```

## Build Configuration

Add to `CMakeLists.txt`:

```cmake
# Tracking and classification modules
list(APPEND DETECTION_SOURCES
    src/detection/tracker.c
    src/detection/classifier.c
)

# Link math library
target_link_libraries(apis-edge m)

# Test executables
add_executable(test_tracker tests/test_tracker.c src/detection/tracker.c)
target_link_libraries(test_tracker m)

add_executable(test_classifier
    tests/test_classifier.c
    src/detection/tracker.c
    src/detection/classifier.c
)
target_link_libraries(test_classifier m)
```

## Files to Create

```
apis-edge/
├── include/
│   ├── tracker.h           # Centroid tracker interface
│   └── classifier.h        # Hornet classifier interface
├── src/
│   └── detection/
│       ├── tracker.c       # Tracking implementation
│       └── classifier.c    # Classification implementation
└── tests/
    ├── test_tracker.c      # Tracking tests
    └── test_classifier.c   # Classification tests
```

## Dependencies

- Story 10.1 (Camera Capture Module)
- Story 10.2 (Motion Detection Pipeline)

## Change Log

| Date | Author | Changes |
|------|--------|---------|
| 2026-01-22 | Claude | Story created |
| 2026-01-22 | Claude | Rewritten from Python to C with HAL abstraction |
