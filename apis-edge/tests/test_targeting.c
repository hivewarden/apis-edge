/**
 * Unit tests for Targeting System.
 */

#include "targeting.h"
#include "servo_controller.h"
#include "coordinate_mapper.h"
#include "laser_controller.h"
#include "log.h"
#include "platform.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

// ============================================================================
// Test Counters
// ============================================================================

static int tests_passed = 0;
static int tests_failed = 0;

#define TEST_ASSERT(condition, message) do { \
    if (condition) { \
        tests_passed++; \
        printf("  PASS: %s\n", message); \
    } else { \
        tests_failed++; \
        printf("  FAIL: %s (line %d)\n", message, __LINE__); \
    } \
} while(0)

#define TEST_SECTION(name) printf("\n=== %s ===\n", name)

// ============================================================================
// Helper Functions
// ============================================================================

static bool float_eq(float a, float b, float epsilon) {
    return fabsf(a - b) < epsilon;
}

static void init_all_subsystems(void) {
    servo_controller_init();
    coord_mapper_init(NULL);
    laser_controller_init();
}

static void cleanup_all_subsystems(void) {
    targeting_cleanup();
    laser_controller_cleanup();
    coord_mapper_cleanup();
    servo_controller_cleanup();
}

// ============================================================================
// Callback Tracking
// ============================================================================

static int state_callback_count = 0;
static target_state_t last_callback_state = TARGET_STATE_IDLE;

static void state_callback(target_state_t state, void *user_data) {
    (void)user_data;
    state_callback_count++;
    last_callback_state = state;
}

static int acquired_callback_count = 0;
static pixel_coord_t last_acquired_centroid = {0, 0};

static void acquired_callback(const target_info_t *target, void *user_data) {
    (void)user_data;
    acquired_callback_count++;
    if (target) {
        last_acquired_centroid = target->centroid;
    }
}

static int lost_callback_count = 0;
static uint32_t last_lost_duration = 0;

static void lost_callback(uint32_t duration_ms, void *user_data) {
    (void)user_data;
    lost_callback_count++;
    last_lost_duration = duration_ms;
}

static void reset_callback_tracking(void) {
    state_callback_count = 0;
    last_callback_state = TARGET_STATE_IDLE;
    acquired_callback_count = 0;
    last_acquired_centroid = (pixel_coord_t){0, 0};
    lost_callback_count = 0;
    last_lost_duration = 0;
}

// ============================================================================
// Test: Status Names
// ============================================================================

static void test_status_names(void) {
    TEST_SECTION("Status Names");

    TEST_ASSERT(strcmp(target_status_name(TARGET_OK), "OK") == 0,
                "TARGET_OK has correct name");
    TEST_ASSERT(strcmp(target_status_name(TARGET_ERROR_NOT_INITIALIZED), "NOT_INITIALIZED") == 0,
                "TARGET_ERROR_NOT_INITIALIZED has correct name");
    TEST_ASSERT(strcmp(target_status_name(TARGET_ERROR_INVALID_PARAM), "INVALID_PARAM") == 0,
                "TARGET_ERROR_INVALID_PARAM has correct name");
    TEST_ASSERT(strcmp(target_status_name(TARGET_ERROR_NOT_ARMED), "NOT_ARMED") == 0,
                "TARGET_ERROR_NOT_ARMED has correct name");
    TEST_ASSERT(strcmp(target_status_name(TARGET_ERROR_NO_TARGET), "NO_TARGET") == 0,
                "TARGET_ERROR_NO_TARGET has correct name");
    TEST_ASSERT(strcmp(target_status_name(TARGET_ERROR_HARDWARE), "HARDWARE") == 0,
                "TARGET_ERROR_HARDWARE has correct name");
    TEST_ASSERT(strcmp(target_status_name((target_status_t)99), "UNKNOWN") == 0,
                "Unknown status returns UNKNOWN");
}

// ============================================================================
// Test: State Names
// ============================================================================

static void test_state_names(void) {
    TEST_SECTION("State Names");

    TEST_ASSERT(strcmp(target_state_name(TARGET_STATE_IDLE), "IDLE") == 0,
                "IDLE state has correct name");
    TEST_ASSERT(strcmp(target_state_name(TARGET_STATE_ACQUIRING), "ACQUIRING") == 0,
                "ACQUIRING state has correct name");
    TEST_ASSERT(strcmp(target_state_name(TARGET_STATE_TRACKING), "TRACKING") == 0,
                "TRACKING state has correct name");
    TEST_ASSERT(strcmp(target_state_name(TARGET_STATE_LOST), "LOST") == 0,
                "LOST state has correct name");
    TEST_ASSERT(strcmp(target_state_name(TARGET_STATE_COOLDOWN), "COOLDOWN") == 0,
                "COOLDOWN state has correct name");
    TEST_ASSERT(strcmp(target_state_name((target_state_t)99), "UNKNOWN") == 0,
                "Unknown state returns UNKNOWN");
}

// ============================================================================
// Test: Initialization
// ============================================================================

static void test_initialization(void) {
    TEST_SECTION("Initialization");

    init_all_subsystems();

    TEST_ASSERT(targeting_is_initialized() == false,
                "Not initialized before init()");

    target_status_t status = targeting_init();
    TEST_ASSERT(status == TARGET_OK, "Init returns OK");
    TEST_ASSERT(targeting_is_initialized() == true,
                "Is initialized after init()");

    // Check initial state
    TEST_ASSERT(targeting_get_state() == TARGET_STATE_IDLE,
                "Initial state is IDLE");
    TEST_ASSERT(targeting_is_tracking() == false,
                "Not tracking initially");

    // Double init
    status = targeting_init();
    TEST_ASSERT(status == TARGET_OK, "Double init returns OK");

    cleanup_all_subsystems();
    TEST_ASSERT(targeting_is_initialized() == false,
                "Not initialized after cleanup");
}

// ============================================================================
// Test: Sweep Configuration
// ============================================================================

static void test_sweep_configuration(void) {
    TEST_SECTION("Sweep Configuration");

    init_all_subsystems();
    targeting_init();

    // Default values
    TEST_ASSERT(float_eq(targeting_get_sweep_amplitude(), TARGET_SWEEP_AMPLITUDE_DEG, 0.1f),
                "Default sweep amplitude");
    TEST_ASSERT(float_eq(targeting_get_sweep_frequency(), TARGET_SWEEP_FREQUENCY_HZ, 0.1f),
                "Default sweep frequency");

    // Set amplitude
    targeting_set_sweep_amplitude(15.0f);
    TEST_ASSERT(float_eq(targeting_get_sweep_amplitude(), 15.0f, 0.1f),
                "Sweep amplitude set to 15°");

    // Clamp amplitude
    targeting_set_sweep_amplitude(100.0f);
    TEST_ASSERT(float_eq(targeting_get_sweep_amplitude(), 45.0f, 0.1f),
                "Sweep amplitude clamped to 45°");

    targeting_set_sweep_amplitude(-10.0f);
    TEST_ASSERT(float_eq(targeting_get_sweep_amplitude(), 0.0f, 0.1f),
                "Negative amplitude clamped to 0°");

    // Set frequency
    targeting_set_sweep_frequency(3.5f);
    TEST_ASSERT(float_eq(targeting_get_sweep_frequency(), 3.5f, 0.1f),
                "Sweep frequency set to 3.5 Hz");

    // Clamp frequency
    targeting_set_sweep_frequency(10.0f);
    TEST_ASSERT(float_eq(targeting_get_sweep_frequency(), 5.0f, 0.1f),
                "Sweep frequency clamped to 5 Hz");

    targeting_set_sweep_frequency(0.1f);
    TEST_ASSERT(float_eq(targeting_get_sweep_frequency(), 0.5f, 0.1f),
                "Sweep frequency clamped to 0.5 Hz");

    cleanup_all_subsystems();
}

// ============================================================================
// Test: Target Acquisition
// ============================================================================

static void test_target_acquisition(void) {
    TEST_SECTION("Target Acquisition");

    init_all_subsystems();
    targeting_init();
    laser_controller_arm();

    reset_callback_tracking();
    targeting_set_acquired_callback(acquired_callback, NULL);

    // Process detection
    detection_box_t det = {
        .x = 300,
        .y = 200,
        .width = 50,
        .height = 50,
        .confidence = 0.9f,
        .id = 1
    };

    target_status_t status = targeting_process_detections(&det, 1);
    TEST_ASSERT(status == TARGET_OK, "Process detection returns OK");
    TEST_ASSERT(targeting_is_tracking() == true, "Now tracking");
    TEST_ASSERT(acquired_callback_count == 1, "Acquired callback invoked");
    TEST_ASSERT(last_acquired_centroid.x == 325, "Acquired centroid x correct");
    TEST_ASSERT(last_acquired_centroid.y == 225, "Acquired centroid y correct");

    // Get current target
    target_info_t info;
    status = targeting_get_current_target(&info);
    TEST_ASSERT(status == TARGET_OK, "Get current target returns OK");
    TEST_ASSERT(info.active == true, "Target is active");
    TEST_ASSERT(info.area == 2500, "Target area correct (50x50)");

    cleanup_all_subsystems();
}

// ============================================================================
// Test: Target Prioritization
// ============================================================================

static void test_target_prioritization(void) {
    TEST_SECTION("Target Prioritization");

    init_all_subsystems();
    targeting_init();
    laser_controller_arm();

    // Multiple detections - should select largest
    detection_box_t dets[3] = {
        { .x = 100, .y = 100, .width = 30, .height = 30, .confidence = 0.9f },
        { .x = 300, .y = 200, .width = 80, .height = 80, .confidence = 0.8f },  // Largest
        { .x = 400, .y = 100, .width = 50, .height = 50, .confidence = 0.95f }
    };

    target_status_t status = targeting_process_detections(dets, 3);
    TEST_ASSERT(status == TARGET_OK, "Process multiple detections OK");

    target_info_t info;
    targeting_get_current_target(&info);

    // Should have selected the largest (80x80 at 300,200)
    TEST_ASSERT(info.centroid.x == 340, "Selected largest target (x)");
    TEST_ASSERT(info.centroid.y == 240, "Selected largest target (y)");
    TEST_ASSERT(info.area == 6400, "Selected target area is 6400 (80x80)");

    // Check multi-target stat
    target_stats_t stats;
    targeting_get_stats(&stats);
    TEST_ASSERT(stats.multi_target_count == 1, "Multi-target count is 1");

    cleanup_all_subsystems();
}

// ============================================================================
// Test: Target Lost
// ============================================================================

static void test_target_lost(void) {
    TEST_SECTION("Target Lost");

    init_all_subsystems();
    targeting_init();
    laser_controller_arm();

    reset_callback_tracking();
    targeting_set_lost_callback(lost_callback, NULL);

    // Acquire target
    detection_box_t det = {
        .x = 300, .y = 200, .width = 50, .height = 50, .confidence = 0.9f
    };
    targeting_process_detections(&det, 1);
    TEST_ASSERT(targeting_is_tracking() == true, "Tracking target");

    // Wait for lost timeout
    apis_sleep_ms(TARGET_LOST_TIMEOUT_MS + 100);
    targeting_update();

    TEST_ASSERT(targeting_is_tracking() == false, "No longer tracking");
    TEST_ASSERT(targeting_get_state() == TARGET_STATE_IDLE, "State is IDLE");
    TEST_ASSERT(lost_callback_count == 1, "Lost callback invoked");
    TEST_ASSERT(last_lost_duration > 0, "Lost duration tracked");

    // Check stats
    target_stats_t stats;
    targeting_get_stats(&stats);
    TEST_ASSERT(stats.lost_count == 1, "Lost count is 1");
    TEST_ASSERT(stats.total_track_time_ms > 0, "Track time recorded");

    cleanup_all_subsystems();
}

// ============================================================================
// Test: Cancel Targeting
// ============================================================================

static void test_cancel_targeting(void) {
    TEST_SECTION("Cancel Targeting");

    init_all_subsystems();
    targeting_init();
    laser_controller_arm();

    // Acquire target
    detection_box_t det = {
        .x = 300, .y = 200, .width = 50, .height = 50, .confidence = 0.9f
    };
    targeting_process_detections(&det, 1);
    TEST_ASSERT(targeting_is_tracking() == true, "Tracking target");

    // Cancel
    targeting_cancel();

    TEST_ASSERT(targeting_is_tracking() == false, "No longer tracking");
    TEST_ASSERT(targeting_get_state() == TARGET_STATE_IDLE, "State is IDLE");
    TEST_ASSERT(laser_controller_is_active() == false, "Laser is off");

    cleanup_all_subsystems();
}

// ============================================================================
// Test: Small Target Rejected
// ============================================================================

static void test_small_target_rejected(void) {
    TEST_SECTION("Small Target Rejected");

    init_all_subsystems();
    targeting_init();

    // Detection too small (area < TARGET_MIN_AREA_PX)
    detection_box_t det = {
        .x = 300, .y = 200, .width = 5, .height = 5, .confidence = 0.9f  // Area = 25 < 100
    };

    targeting_process_detections(&det, 1);
    TEST_ASSERT(targeting_is_tracking() == false, "Small target rejected");

    cleanup_all_subsystems();
}

// ============================================================================
// Test: No Detection
// ============================================================================

static void test_no_detection(void) {
    TEST_SECTION("No Detection");

    init_all_subsystems();
    targeting_init();

    // Process empty detection list
    target_status_t status = targeting_process_detections(NULL, 0);
    TEST_ASSERT(status == TARGET_OK, "Process empty list OK");
    TEST_ASSERT(targeting_is_tracking() == false, "Not tracking");

    cleanup_all_subsystems();
}

// ============================================================================
// Test: Statistics
// ============================================================================

static void test_statistics(void) {
    TEST_SECTION("Statistics");

    init_all_subsystems();
    targeting_init();

    target_stats_t stats;
    target_status_t status = targeting_get_stats(&stats);
    TEST_ASSERT(status == TARGET_OK, "Get stats returns OK");
    TEST_ASSERT(stats.target_count == 0, "Initial target count is 0");
    TEST_ASSERT(stats.lost_count == 0, "Initial lost count is 0");
    TEST_ASSERT(stats.multi_target_count == 0, "Initial multi-target count is 0");

    // Null pointer test
    status = targeting_get_stats(NULL);
    TEST_ASSERT(status == TARGET_ERROR_INVALID_PARAM, "Get stats with NULL fails");

    cleanup_all_subsystems();
}

// ============================================================================
// Test: State Callback
// ============================================================================

static void test_state_callback(void) {
    TEST_SECTION("State Callback");

    init_all_subsystems();
    targeting_init();
    laser_controller_arm();

    reset_callback_tracking();
    targeting_set_state_callback(state_callback, NULL);

    // Acquire target
    detection_box_t det = {
        .x = 300, .y = 200, .width = 50, .height = 50, .confidence = 0.9f
    };
    targeting_process_detections(&det, 1);

    TEST_ASSERT(state_callback_count >= 1, "State callback invoked on acquire");

    // Clear callback
    targeting_set_state_callback(NULL, NULL);
    int prev_count = state_callback_count;

    targeting_cancel();
    TEST_ASSERT(state_callback_count == prev_count, "No callback after cleared");

    cleanup_all_subsystems();
}

// ============================================================================
// Test: Not Initialized Errors
// ============================================================================

static void test_not_initialized(void) {
    TEST_SECTION("Not Initialized Errors");

    if (targeting_is_initialized()) {
        targeting_cleanup();
    }

    detection_box_t det = { .x = 100, .y = 100, .width = 50, .height = 50 };
    target_status_t status = targeting_process_detections(&det, 1);
    TEST_ASSERT(status == TARGET_ERROR_NOT_INITIALIZED,
                "Process before init fails");

    target_info_t info;
    status = targeting_get_current_target(&info);
    TEST_ASSERT(status == TARGET_ERROR_NOT_INITIALIZED,
                "Get target before init fails");

    target_stats_t stats;
    status = targeting_get_stats(&stats);
    TEST_ASSERT(status == TARGET_ERROR_NOT_INITIALIZED,
                "Get stats before init fails");

    TEST_ASSERT(targeting_is_tracking() == false,
                "Is tracking returns false");
    TEST_ASSERT(targeting_get_state() == TARGET_STATE_IDLE,
                "Get state returns IDLE");
}

// ============================================================================
// Test: Cleanup Safety
// ============================================================================

static void test_cleanup_safety(void) {
    TEST_SECTION("Cleanup Safety");

    // Cleanup when not initialized
    targeting_cleanup();
    TEST_ASSERT(targeting_is_initialized() == false, "Cleanup when not init is safe");

    // Initialize subsystems and targeting
    init_all_subsystems();
    targeting_init();
    targeting_cleanup();
    TEST_ASSERT(targeting_is_initialized() == false, "Cleanup after init works");

    // Double cleanup
    targeting_cleanup();
    TEST_ASSERT(targeting_is_initialized() == false, "Double cleanup is safe");

    cleanup_all_subsystems();
}

// ============================================================================
// Main Test Runner
// ============================================================================

int main(int argc, char *argv[]) {
    (void)argc;
    (void)argv;

    printf("\n");
    printf("==========================================================\n");
    printf("  APIS Edge - Targeting System Unit Tests\n");
    printf("==========================================================\n");

    // Run all tests
    test_status_names();
    test_state_names();
    test_not_initialized();
    test_initialization();
    test_sweep_configuration();
    test_target_acquisition();
    test_target_prioritization();
    test_target_lost();
    test_cancel_targeting();
    test_small_target_rejected();
    test_no_detection();
    test_statistics();
    test_state_callback();
    test_cleanup_safety();

    // Summary
    printf("\n==========================================================\n");
    printf("  Test Results: %d passed, %d failed\n",
           tests_passed, tests_failed);
    printf("==========================================================\n\n");

    return tests_failed > 0 ? 1 : 0;
}
