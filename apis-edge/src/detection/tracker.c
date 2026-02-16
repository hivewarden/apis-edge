/**
 * Centroid-based object tracking implementation.
 *
 * Uses greedy nearest-neighbor assignment for matching new detections
 * to existing tracks. Maintains position history in a ring buffer
 * for hover analysis.
 */

#include "tracker.h"
#include "log.h"
#include <string.h>
#include <math.h>

// Tracker state
typedef struct {
    tracked_object_t objects[MAX_TRACKED_OBJECTS];
    uint32_t next_id;
    uint8_t active_count;
} tracker_state_t;

static tracker_state_t g_state;
static tracker_config_t g_config;
static bool g_initialized = false;

tracker_config_t tracker_config_defaults(void) {
    return (tracker_config_t){
        .max_distance = 100,
        .max_disappeared = MAX_DISAPPEARED_FRAMES,
        .history_length = MAX_TRACK_HISTORY,
    };
}

tracker_status_t tracker_init(const tracker_config_t *config) {
    if (config == NULL) {
        g_config = tracker_config_defaults();
    } else {
        g_config = *config;
    }

    // Validate config
    if (g_config.max_distance == 0) {
        LOG_WARN("tracker_init: max_distance is 0, using default");
        g_config.max_distance = 100;
    }

    memset(&g_state, 0, sizeof(g_state));
    // Start IDs at 1; 0 is reserved for "no track".
    // Note: next_id will wrap after 4 billion tracks. At 1000 tracks/day,
    // this takes ~11,700 years. Acceptable for typical device uptime.
    g_state.next_id = 1;
    g_initialized = true;

    LOG_INFO("Tracker initialized (max_distance=%u, max_disappeared=%u)",
             g_config.max_distance, g_config.max_disappeared);

    return TRACKER_OK;
}

bool tracker_is_initialized(void) {
    return g_initialized;
}

/**
 * Calculate squared Euclidean distance between two points.
 * Using squared distance avoids sqrt for comparison purposes.
 */
static uint32_t distance_squared(int x1, int y1, int x2, int y2) {
    int dx = x2 - x1;
    int dy = y2 - y1;
    // Cast to int64_t before multiplication to prevent overflow
    // (e.g., 640*640 + 480*480 = 640000 fits uint32_t but intermediate can overflow)
    return (uint32_t)((int64_t)dx * dx + (int64_t)dy * dy);
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
            // C7-MED-007: Skip ID 0 on wrap - 0 is reserved for "no track"
            if (g_state.next_id == 0) {
                g_state.next_id = 1;
            }
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

            LOG_DEBUG("Registered new track: id=%u at (%u,%u)",
                     obj->id, obj->centroid_x, obj->centroid_y);

            return obj;
        }
    }

    LOG_WARN("tracker: No free slots for new track (active=%u)", g_state.active_count);
    return NULL;
}

/**
 * Deregister a tracked object.
 */
static void deregister_object(tracked_object_t *obj) {
    LOG_DEBUG("Deregistered track: id=%u (disappeared for %u frames)",
             obj->id, obj->disappeared_frames);
    obj->active = false;
    if (g_state.active_count > 0) {
        g_state.active_count--;
    }
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
    if (!g_initialized) {
        LOG_WARN("tracker_update called before initialization");
        return -1;
    }

    if (results == NULL) {
        LOG_WARN("tracker_update: results is NULL");
        return -1;
    }

    // Clamp count to valid range
    if (count < 0) {
        count = 0;
    }
    if (count > MAX_DETECTIONS) {
        LOG_WARN("tracker_update: count %d exceeds MAX_DETECTIONS, clamping", count);
        count = MAX_DETECTIONS;
    }

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

    // Greedy assignment: for each active object, find nearest unassigned detection
    bool det_assigned[MAX_DETECTIONS] = {false};
    bool obj_assigned[MAX_TRACKED_OBJECTS] = {false};
    int result_count = 0;

    // Pre-compute squared max distance for comparison
    uint32_t max_dist_sq = (uint32_t)g_config.max_distance * g_config.max_distance;

    // For each active object, find nearest detection
    for (int o = 0; o < MAX_TRACKED_OBJECTS; o++) {
        if (!g_state.objects[o].active) continue;

        tracked_object_t *obj = &g_state.objects[o];
        uint32_t min_dist_sq = max_dist_sq;
        int best_det = -1;

        for (int d = 0; d < count; d++) {
            if (det_assigned[d]) continue;

            uint32_t dist_sq = distance_squared(
                obj->centroid_x, obj->centroid_y,
                detections[d].centroid_x, detections[d].centroid_y
            );

            if (dist_sq < min_dist_sq) {
                min_dist_sq = dist_sq;
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
    if (!g_initialized || history == NULL) {
        return 0;
    }

    for (int i = 0; i < MAX_TRACKED_OBJECTS; i++) {
        if (g_state.objects[i].active && g_state.objects[i].id == track_id) {
            tracked_object_t *obj = &g_state.objects[i];

            // Copy history in chronological order (oldest to newest)
            int count = obj->history_count;
            if (count == 0) return 0;

            // Calculate starting index (oldest entry)
            // If buffer is not full, start at 0
            // If buffer is full, start at (head + 1) % size
            int start;
            if (count < MAX_TRACK_HISTORY) {
                start = 0;
            } else {
                start = (obj->history_head + 1) % MAX_TRACK_HISTORY;
            }

            for (int j = 0; j < count; j++) {
                int idx = (start + j) % MAX_TRACK_HISTORY;
                history[j] = obj->history[idx];
            }

            return count;
        }
    }
    return 0;
}

// C7-MED-008: This function returns a pointer to mutable internal state.
// Callers must NOT cache this pointer across update cycles, as the object
// may be deregistered or reassigned. For thread-safe usage, callers should
// copy the returned struct immediately. A future API revision could accept
// a caller-provided output struct to eliminate this risk entirely.
// TODO: Add tracker_get_object_copy(uint32_t track_id, tracked_object_t *out)
const tracked_object_t *tracker_get_object(uint32_t track_id) {
    if (!g_initialized) {
        return NULL;
    }

    for (int i = 0; i < MAX_TRACKED_OBJECTS; i++) {
        if (g_state.objects[i].active && g_state.objects[i].id == track_id) {
            return &g_state.objects[i];
        }
    }
    return NULL;
}

int tracker_get_active_count(void) {
    return g_initialized ? g_state.active_count : 0;
}

void tracker_reset(void) {
    if (!g_initialized) {
        LOG_WARN("tracker_reset called before initialization");
        return;
    }
    memset(&g_state, 0, sizeof(g_state));
    g_state.next_id = 1;
    LOG_INFO("Tracker reset");
}

void tracker_cleanup(void) {
    g_initialized = false;
    memset(&g_state, 0, sizeof(g_state));
    LOG_INFO("Tracker cleanup complete");
}

const char *tracker_status_str(tracker_status_t status) {
    switch (status) {
        case TRACKER_OK:                    return "OK";
        case TRACKER_ERROR_NOT_INITIALIZED: return "Not initialized";
        case TRACKER_ERROR_INVALID_PARAM:   return "Invalid parameter";
        case TRACKER_ERROR_NO_SLOTS:        return "No free slots";
        default:                            return "Unknown error";
    }
}
