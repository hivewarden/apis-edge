/**
 * Unit tests for Coordinate Mapper.
 *
 * NOTE: These tests link against servo_controller.c rather than using mocks.
 * This is intentional integration testing to verify that coordinate_mapper
 * correctly integrates with servo_controller_clamp_angle() for safety limits.
 * The tests depend on the real servo controller implementation.
 */

#include "coordinate_mapper.h"
#include "servo_controller.h"
#include "log.h"
#include "platform.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <unistd.h>

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

// Temporary calibration file for tests
static const char *TEST_CALIBRATION_FILE = "/tmp/apis_test_calibration.json";

static void cleanup_test_file(void) {
    unlink(TEST_CALIBRATION_FILE);
}

// ============================================================================
// Test: Status Names
// ============================================================================

static void test_status_names(void) {
    TEST_SECTION("Status Names");

    TEST_ASSERT(strcmp(coord_status_name(COORD_OK), "OK") == 0,
                "COORD_OK has correct name");
    TEST_ASSERT(strcmp(coord_status_name(COORD_ERROR_NOT_INITIALIZED), "NOT_INITIALIZED") == 0,
                "COORD_ERROR_NOT_INITIALIZED has correct name");
    TEST_ASSERT(strcmp(coord_status_name(COORD_ERROR_INVALID_PARAM), "INVALID_PARAM") == 0,
                "COORD_ERROR_INVALID_PARAM has correct name");
    TEST_ASSERT(strcmp(coord_status_name(COORD_ERROR_FILE_NOT_FOUND), "FILE_NOT_FOUND") == 0,
                "COORD_ERROR_FILE_NOT_FOUND has correct name");
    TEST_ASSERT(strcmp(coord_status_name(COORD_ERROR_FILE_INVALID), "FILE_INVALID") == 0,
                "COORD_ERROR_FILE_INVALID has correct name");
    TEST_ASSERT(strcmp(coord_status_name(COORD_ERROR_IO), "IO_ERROR") == 0,
                "COORD_ERROR_IO has correct name");
    TEST_ASSERT(strcmp(coord_status_name(COORD_ERROR_NO_MEMORY), "NO_MEMORY") == 0,
                "COORD_ERROR_NO_MEMORY has correct name");
    TEST_ASSERT(strcmp(coord_status_name(COORD_ERROR_OUT_OF_BOUNDS), "OUT_OF_BOUNDS") == 0,
                "COORD_ERROR_OUT_OF_BOUNDS has correct name");
    TEST_ASSERT(strcmp(coord_status_name((coord_status_t)99), "UNKNOWN") == 0,
                "Unknown status returns UNKNOWN");
}

// ============================================================================
// Test: Initialization
// ============================================================================

static void test_initialization(void) {
    TEST_SECTION("Initialization");

    // Should not be initialized at start
    TEST_ASSERT(coord_mapper_is_initialized() == false,
                "Not initialized before init()");

    // Initialize with defaults
    coord_status_t status = coord_mapper_init(NULL);
    TEST_ASSERT(status == COORD_OK, "Init with defaults returns OK");
    TEST_ASSERT(coord_mapper_is_initialized() == true,
                "Is initialized after init()");

    // Check default camera params
    camera_params_t params;
    status = coord_mapper_get_camera_params(&params);
    TEST_ASSERT(status == COORD_OK, "Get camera params returns OK");
    TEST_ASSERT(params.width == COORD_DEFAULT_WIDTH, "Default width correct");
    TEST_ASSERT(params.height == COORD_DEFAULT_HEIGHT, "Default height correct");
    TEST_ASSERT(float_eq(params.fov_h_deg, COORD_DEFAULT_FOV_H_DEG, 0.1f),
                "Default horizontal FOV correct");
    TEST_ASSERT(float_eq(params.fov_v_deg, COORD_DEFAULT_FOV_V_DEG, 0.1f),
                "Default vertical FOV correct");

    // Double init should be OK
    status = coord_mapper_init(NULL);
    TEST_ASSERT(status == COORD_OK, "Double init returns OK");

    // Cleanup
    coord_mapper_cleanup();
    TEST_ASSERT(coord_mapper_is_initialized() == false,
                "Not initialized after cleanup");
}

// ============================================================================
// Test: Custom Camera Params
// ============================================================================

static void test_custom_camera_params(void) {
    TEST_SECTION("Custom Camera Params");

    camera_params_t custom = {
        .width = 1280,
        .height = 720,
        .fov_h_deg = 90.0f,
        .fov_v_deg = 50.0f
    };

    coord_status_t status = coord_mapper_init(&custom);
    TEST_ASSERT(status == COORD_OK, "Init with custom params returns OK");

    camera_params_t params;
    coord_mapper_get_camera_params(&params);
    TEST_ASSERT(params.width == 1280, "Custom width set");
    TEST_ASSERT(params.height == 720, "Custom height set");
    TEST_ASSERT(float_eq(params.fov_h_deg, 90.0f, 0.1f), "Custom horizontal FOV set");
    TEST_ASSERT(float_eq(params.fov_v_deg, 50.0f, 0.1f), "Custom vertical FOV set");

    // Update params
    custom.width = 800;
    custom.height = 600;
    status = coord_mapper_set_camera_params(&custom);
    TEST_ASSERT(status == COORD_OK, "Set camera params returns OK");

    coord_mapper_get_camera_params(&params);
    TEST_ASSERT(params.width == 800, "Updated width");
    TEST_ASSERT(params.height == 600, "Updated height");

    coord_mapper_cleanup();
}

// ============================================================================
// Test: Basic Pixel to Angle Mapping
// ============================================================================

static void test_basic_mapping(void) {
    TEST_SECTION("Basic Pixel to Angle Mapping");

    // Use 640x480 with 60° horizontal, 45° vertical FOV
    camera_params_t params = {
        .width = 640,
        .height = 480,
        .fov_h_deg = 60.0f,
        .fov_v_deg = 45.0f
    };

    coord_status_t status = coord_mapper_init(&params);
    TEST_ASSERT(status == COORD_OK, "Init for mapping tests");

    servo_position_t angles;

    // Center pixel should map to center angle (0, 0)
    // But tilt center is -15°, so center maps to ~middle of tilt range
    pixel_coord_t center = { .x = 320, .y = 240 };
    status = coord_mapper_pixel_to_angle(center, &angles);
    TEST_ASSERT(status == COORD_OK, "Map center pixel returns OK");
    TEST_ASSERT(float_eq(angles.pan_deg, 0.0f, 1.0f), "Center pixel -> pan ~0°");
    // Tilt at center should be 0° (horizontal) since norm_y = 0
    TEST_ASSERT(float_eq(angles.tilt_deg, 0.0f, 1.0f), "Center pixel -> tilt ~0°");

    // Left edge (x=0) should be negative pan
    pixel_coord_t left = { .x = 0, .y = 240 };
    coord_mapper_pixel_to_angle(left, &angles);
    TEST_ASSERT(angles.pan_deg < -25.0f, "Left edge -> negative pan");
    TEST_ASSERT(float_eq(angles.pan_deg, -30.0f, 2.0f), "Left edge -> pan ~ -30°");

    // Right edge (x=639) should be positive pan
    pixel_coord_t right = { .x = 639, .y = 240 };
    coord_mapper_pixel_to_angle(right, &angles);
    TEST_ASSERT(angles.pan_deg > 25.0f, "Right edge -> positive pan");
    TEST_ASSERT(float_eq(angles.pan_deg, 30.0f, 2.0f), "Right edge -> pan ~ +30°");

    // Top edge (y=0) should be positive tilt (horizontal/upward)
    // But clamped to 0° since tilt can't go upward
    pixel_coord_t top = { .x = 320, .y = 0 };
    coord_mapper_pixel_to_angle(top, &angles);
    TEST_ASSERT(angles.tilt_deg >= 0.0f, "Top edge -> tilt at horizontal (clamped)");

    // Bottom edge (y=479) should be negative tilt (downward)
    pixel_coord_t bottom = { .x = 320, .y = 479 };
    coord_mapper_pixel_to_angle(bottom, &angles);
    TEST_ASSERT(angles.tilt_deg < -20.0f, "Bottom edge -> negative tilt");

    coord_mapper_cleanup();
}

// ============================================================================
// Test: Out of Bounds Handling
// ============================================================================

static void test_out_of_bounds(void) {
    TEST_SECTION("Out of Bounds Handling");

    coord_status_t status = coord_mapper_init(NULL);
    TEST_ASSERT(status == COORD_OK, "Init for bounds tests");

    servo_position_t angles;

    // Negative coordinates
    pixel_coord_t neg = { .x = -10, .y = -10 };
    status = coord_mapper_pixel_to_angle(neg, &angles);
    TEST_ASSERT(status == COORD_ERROR_OUT_OF_BOUNDS, "Negative coords return OUT_OF_BOUNDS");

    // Beyond width/height
    pixel_coord_t beyond = { .x = 1000, .y = 1000 };
    status = coord_mapper_pixel_to_angle(beyond, &angles);
    TEST_ASSERT(status == COORD_ERROR_OUT_OF_BOUNDS, "Beyond bounds returns OUT_OF_BOUNDS");

    // Check statistics
    coord_stats_t stats;
    coord_mapper_get_stats(&stats);
    TEST_ASSERT(stats.out_of_bounds_count >= 2, "Out of bounds count tracked");

    coord_mapper_cleanup();
}

// ============================================================================
// Test: Calibration Offsets
// ============================================================================

static void test_calibration_offsets(void) {
    TEST_SECTION("Calibration Offsets");

    coord_status_t status = coord_mapper_init(NULL);
    TEST_ASSERT(status == COORD_OK, "Init for calibration tests");

    // Initially no calibration
    TEST_ASSERT(coord_mapper_is_calibrated() == false, "Not calibrated initially");

    // Set offsets
    coord_mapper_set_offsets(5.0f, -3.0f);
    TEST_ASSERT(coord_mapper_is_calibrated() == true, "Calibrated after setting offsets");

    // Get offsets
    float offset_pan, offset_tilt;
    coord_mapper_get_offsets(&offset_pan, &offset_tilt);
    TEST_ASSERT(float_eq(offset_pan, 5.0f, 0.01f), "Pan offset correct");
    TEST_ASSERT(float_eq(offset_tilt, -3.0f, 0.01f), "Tilt offset correct");

    // Verify offset is applied to mapping
    pixel_coord_t center = { .x = 320, .y = 240 };
    servo_position_t angles;
    coord_mapper_pixel_to_angle(center, &angles);
    TEST_ASSERT(float_eq(angles.pan_deg, 5.0f, 1.0f), "Pan offset applied");
    // Tilt: base 0° - 3° offset = -3°
    TEST_ASSERT(float_eq(angles.tilt_deg, -3.0f, 1.0f), "Tilt offset applied");

    // Reset calibration
    coord_mapper_reset_calibration();
    TEST_ASSERT(coord_mapper_is_calibrated() == false, "Not calibrated after reset");

    coord_mapper_get_offsets(&offset_pan, &offset_tilt);
    TEST_ASSERT(float_eq(offset_pan, 0.0f, 0.01f), "Pan offset reset to 0");
    TEST_ASSERT(float_eq(offset_tilt, 0.0f, 0.01f), "Tilt offset reset to 0");

    coord_mapper_cleanup();
}

// ============================================================================
// Test: Calibration Scales
// ============================================================================

static void test_calibration_scales(void) {
    TEST_SECTION("Calibration Scales");

    coord_status_t status = coord_mapper_init(NULL);
    TEST_ASSERT(status == COORD_OK, "Init for scale tests");

    // Default scales should be 1.0
    float scale_pan, scale_tilt;
    coord_mapper_get_scales(&scale_pan, &scale_tilt);
    TEST_ASSERT(float_eq(scale_pan, 1.0f, 0.01f), "Default pan scale is 1.0");
    TEST_ASSERT(float_eq(scale_tilt, 1.0f, 0.01f), "Default tilt scale is 1.0");

    // Set scales
    coord_mapper_set_scales(0.8f, 1.2f);

    coord_mapper_get_scales(&scale_pan, &scale_tilt);
    TEST_ASSERT(float_eq(scale_pan, 0.8f, 0.01f), "Pan scale set to 0.8");
    TEST_ASSERT(float_eq(scale_tilt, 1.2f, 0.01f), "Tilt scale set to 1.2");

    // Invalid scales should be clamped to 1.0
    coord_mapper_set_scales(-1.0f, 0.0f);
    coord_mapper_get_scales(&scale_pan, &scale_tilt);
    TEST_ASSERT(float_eq(scale_pan, 1.0f, 0.01f), "Negative pan scale clamped to 1.0");
    TEST_ASSERT(float_eq(scale_tilt, 1.0f, 0.01f), "Zero tilt scale clamped to 1.0");

    coord_mapper_cleanup();
}

// ============================================================================
// Test: Calibration Points
// ============================================================================

static void test_calibration_points(void) {
    TEST_SECTION("Calibration Points");

    coord_status_t status = coord_mapper_init(NULL);
    TEST_ASSERT(status == COORD_OK, "Init for point tests");

    // Need at least 1 point to compute calibration
    status = coord_mapper_compute_calibration();
    TEST_ASSERT(status == COORD_ERROR_INVALID_PARAM, "Compute without points fails");

    // Add a calibration point
    pixel_coord_t pixel = { .x = 320, .y = 240 };
    servo_position_t angle = { .pan_deg = 10.0f, .tilt_deg = -5.0f };
    status = coord_mapper_add_point(pixel, angle);
    TEST_ASSERT(status == COORD_OK, "Add calibration point OK");

    // Compute calibration
    status = coord_mapper_compute_calibration();
    TEST_ASSERT(status == COORD_OK, "Compute calibration OK");
    TEST_ASSERT(coord_mapper_is_calibrated() == true, "Calibrated after compute");

    // Verify calibration is applied
    // Center pixel should now map to (10, -5) due to offset
    servo_position_t result;
    coord_mapper_pixel_to_angle(pixel, &result);
    TEST_ASSERT(float_eq(result.pan_deg, 10.0f, 1.0f), "Calibrated pan correct");
    TEST_ASSERT(float_eq(result.tilt_deg, -5.0f, 1.0f), "Calibrated tilt correct");

    // Clear points
    coord_mapper_clear_points();

    // Add maximum points
    for (int i = 0; i < COORD_MAX_CALIBRATION_POINTS; i++) {
        pixel_coord_t p = { .x = 100 * i, .y = 100 * i };
        servo_position_t a = { .pan_deg = (float)i, .tilt_deg = -(float)i };
        status = coord_mapper_add_point(p, a);
        TEST_ASSERT(status == COORD_OK, "Add point within limit OK");
    }

    // Try to add one more (should fail)
    pixel_coord_t extra = { .x = 500, .y = 500 };
    servo_position_t extra_angle = { .pan_deg = 5.0f, .tilt_deg = -5.0f };
    status = coord_mapper_add_point(extra, extra_angle);
    TEST_ASSERT(status == COORD_ERROR_INVALID_PARAM, "Add point beyond limit fails");

    coord_mapper_cleanup();
}

// ============================================================================
// Test: Angle to Pixel (Inverse)
// ============================================================================

static void test_angle_to_pixel(void) {
    TEST_SECTION("Angle to Pixel (Inverse)");

    coord_status_t status = coord_mapper_init(NULL);
    TEST_ASSERT(status == COORD_OK, "Init for inverse tests");

    pixel_coord_t pixel;

    // Center angle should map to center pixel
    servo_position_t center = { .pan_deg = 0.0f, .tilt_deg = 0.0f };
    status = coord_mapper_angle_to_pixel(center, &pixel);
    TEST_ASSERT(status == COORD_OK, "Angle to pixel returns OK");
    TEST_ASSERT(abs(pixel.x - 320) < 10, "Center angle -> center x");
    TEST_ASSERT(abs(pixel.y - 240) < 10, "Center angle -> center y");

    // Round-trip test
    pixel_coord_t original = { .x = 400, .y = 300 };
    servo_position_t angles;
    coord_mapper_pixel_to_angle(original, &angles);
    coord_mapper_angle_to_pixel(angles, &pixel);
    TEST_ASSERT(abs(pixel.x - original.x) < 5, "Round-trip preserves x");
    TEST_ASSERT(abs(pixel.y - original.y) < 5, "Round-trip preserves y");

    coord_mapper_cleanup();
}

// ============================================================================
// Test: Calibration Persistence
// ============================================================================

static void test_calibration_persistence(void) {
    TEST_SECTION("Calibration Persistence");

    cleanup_test_file();

    coord_status_t status = coord_mapper_init(NULL);
    TEST_ASSERT(status == COORD_OK, "Init for persistence tests");

    // Set calibration values
    coord_mapper_set_offsets(7.5f, -2.5f);
    coord_mapper_set_scales(0.95f, 1.05f);

    // Save calibration
    status = coord_mapper_save_calibration(TEST_CALIBRATION_FILE);
    TEST_ASSERT(status == COORD_OK, "Save calibration OK");

    // Reset and verify
    coord_mapper_reset_calibration();
    float offset_pan, offset_tilt;
    coord_mapper_get_offsets(&offset_pan, &offset_tilt);
    TEST_ASSERT(float_eq(offset_pan, 0.0f, 0.01f), "Offset reset before load");

    // Load calibration
    status = coord_mapper_load_calibration(TEST_CALIBRATION_FILE);
    TEST_ASSERT(status == COORD_OK, "Load calibration OK");

    // Verify loaded values
    coord_mapper_get_offsets(&offset_pan, &offset_tilt);
    TEST_ASSERT(float_eq(offset_pan, 7.5f, 0.01f), "Loaded pan offset correct");
    TEST_ASSERT(float_eq(offset_tilt, -2.5f, 0.01f), "Loaded tilt offset correct");

    float scale_pan, scale_tilt;
    coord_mapper_get_scales(&scale_pan, &scale_tilt);
    TEST_ASSERT(float_eq(scale_pan, 0.95f, 0.01f), "Loaded pan scale correct");
    TEST_ASSERT(float_eq(scale_tilt, 1.05f, 0.01f), "Loaded tilt scale correct");

    // Load non-existent file
    status = coord_mapper_load_calibration("/nonexistent/path/calibration.json");
    TEST_ASSERT(status == COORD_ERROR_FILE_NOT_FOUND, "Load non-existent returns FILE_NOT_FOUND");

    coord_mapper_cleanup();
    cleanup_test_file();
}

// ============================================================================
// Test: Get Calibration Data
// ============================================================================

static void test_get_calibration_data(void) {
    TEST_SECTION("Get Calibration Data");

    coord_status_t status = coord_mapper_init(NULL);
    TEST_ASSERT(status == COORD_OK, "Init for calibration data tests");

    coord_mapper_set_offsets(3.0f, -1.5f);
    coord_mapper_set_scales(0.9f, 1.1f);

    calibration_data_t data;
    status = coord_mapper_get_calibration(&data);
    TEST_ASSERT(status == COORD_OK, "Get calibration returns OK");
    TEST_ASSERT(float_eq(data.offset_pan_deg, 3.0f, 0.01f), "Data has correct pan offset");
    TEST_ASSERT(float_eq(data.offset_tilt_deg, -1.5f, 0.01f), "Data has correct tilt offset");
    TEST_ASSERT(float_eq(data.scale_pan, 0.9f, 0.01f), "Data has correct pan scale");
    TEST_ASSERT(float_eq(data.scale_tilt, 1.1f, 0.01f), "Data has correct tilt scale");
    TEST_ASSERT(data.valid == true, "Data marked as valid");

    // Null pointer test
    status = coord_mapper_get_calibration(NULL);
    TEST_ASSERT(status == COORD_ERROR_INVALID_PARAM, "Get calibration with NULL fails");

    coord_mapper_cleanup();
}

// ============================================================================
// Test: Statistics
// ============================================================================

static void test_statistics(void) {
    TEST_SECTION("Statistics");

    coord_status_t status = coord_mapper_init(NULL);
    TEST_ASSERT(status == COORD_OK, "Init for stats tests");

    coord_stats_t stats;
    status = coord_mapper_get_stats(&stats);
    TEST_ASSERT(status == COORD_OK, "Get stats returns OK");
    TEST_ASSERT(stats.map_count == 0, "Initial map count is 0");
    TEST_ASSERT(stats.out_of_bounds_count == 0, "Initial out of bounds count is 0");
    TEST_ASSERT(stats.calibrated == false, "Not calibrated initially");

    // Do some mappings
    servo_position_t angles;
    pixel_coord_t pixel = { .x = 100, .y = 100 };
    coord_mapper_pixel_to_angle(pixel, &angles);
    coord_mapper_pixel_to_angle(pixel, &angles);
    coord_mapper_pixel_to_angle(pixel, &angles);

    // Out of bounds
    pixel_coord_t oob = { .x = -1, .y = -1 };
    coord_mapper_pixel_to_angle(oob, &angles);

    coord_mapper_get_stats(&stats);
    TEST_ASSERT(stats.map_count == 4, "Map count is 4");
    TEST_ASSERT(stats.out_of_bounds_count == 1, "Out of bounds count is 1");
    TEST_ASSERT(stats.uptime_ms >= 0, "Uptime is non-negative");

    // Null pointer test
    status = coord_mapper_get_stats(NULL);
    TEST_ASSERT(status == COORD_ERROR_INVALID_PARAM, "Get stats with NULL fails");

    coord_mapper_cleanup();
}

// ============================================================================
// Test: Not Initialized Errors
// ============================================================================

static void test_not_initialized(void) {
    TEST_SECTION("Not Initialized Errors");

    // Ensure not initialized
    if (coord_mapper_is_initialized()) {
        coord_mapper_cleanup();
    }

    coord_status_t status;
    servo_position_t angles;
    pixel_coord_t pixel = { .x = 0, .y = 0 };

    status = coord_mapper_pixel_to_angle(pixel, &angles);
    TEST_ASSERT(status == COORD_ERROR_NOT_INITIALIZED,
                "Pixel to angle before init returns NOT_INITIALIZED");

    status = coord_mapper_angle_to_pixel(angles, &pixel);
    TEST_ASSERT(status == COORD_ERROR_NOT_INITIALIZED,
                "Angle to pixel before init returns NOT_INITIALIZED");

    status = coord_mapper_load_calibration(NULL);
    TEST_ASSERT(status == COORD_ERROR_NOT_INITIALIZED,
                "Load calibration before init returns NOT_INITIALIZED");

    status = coord_mapper_save_calibration(NULL);
    TEST_ASSERT(status == COORD_ERROR_NOT_INITIALIZED,
                "Save calibration before init returns NOT_INITIALIZED");

    status = coord_mapper_add_point(pixel, angles);
    TEST_ASSERT(status == COORD_ERROR_NOT_INITIALIZED,
                "Add point before init returns NOT_INITIALIZED");

    status = coord_mapper_compute_calibration();
    TEST_ASSERT(status == COORD_ERROR_NOT_INITIALIZED,
                "Compute calibration before init returns NOT_INITIALIZED");

    camera_params_t params;
    status = coord_mapper_get_camera_params(&params);
    TEST_ASSERT(status == COORD_ERROR_NOT_INITIALIZED,
                "Get camera params before init returns NOT_INITIALIZED");

    status = coord_mapper_set_camera_params(&params);
    TEST_ASSERT(status == COORD_ERROR_NOT_INITIALIZED,
                "Set camera params before init returns NOT_INITIALIZED");

    coord_stats_t stats;
    status = coord_mapper_get_stats(&stats);
    TEST_ASSERT(status == COORD_ERROR_NOT_INITIALIZED,
                "Get stats before init returns NOT_INITIALIZED");

    calibration_data_t cal;
    status = coord_mapper_get_calibration(&cal);
    TEST_ASSERT(status == COORD_ERROR_NOT_INITIALIZED,
                "Get calibration before init returns NOT_INITIALIZED");

    TEST_ASSERT(coord_mapper_is_calibrated() == false,
                "Is calibrated returns false when not initialized");
}

// ============================================================================
// Test: Servo Safety Integration
// ============================================================================

static void test_servo_safety(void) {
    TEST_SECTION("Servo Safety Integration");

    coord_status_t status = coord_mapper_init(NULL);
    TEST_ASSERT(status == COORD_OK, "Init for safety tests");

    servo_position_t angles;

    // Map a pixel at top edge - tilt should be clamped to 0° (not upward)
    pixel_coord_t top = { .x = 320, .y = 0 };
    coord_mapper_pixel_to_angle(top, &angles);
    TEST_ASSERT(angles.tilt_deg <= 0.0f, "Top pixel tilt clamped (not upward)");

    // Even with large positive offset, tilt should be clamped
    coord_mapper_set_offsets(0.0f, 30.0f);  // Try to force upward
    coord_mapper_pixel_to_angle(top, &angles);
    TEST_ASSERT(angles.tilt_deg <= 0.0f, "Tilt still clamped with upward offset");

    // Pan should also be clamped to servo limits
    coord_mapper_set_offsets(100.0f, 0.0f);  // Large pan offset
    pixel_coord_t right = { .x = 639, .y = 240 };
    coord_mapper_pixel_to_angle(right, &angles);
    TEST_ASSERT(angles.pan_deg <= SERVO_PAN_MAX_DEG, "Pan clamped to max");

    coord_mapper_cleanup();
}

// ============================================================================
// Test: Cleanup Safety
// ============================================================================

static void test_cleanup_safety(void) {
    TEST_SECTION("Cleanup Safety");

    // Cleanup when not initialized - should not crash
    coord_mapper_cleanup();
    TEST_ASSERT(coord_mapper_is_initialized() == false,
                "Cleanup when not initialized is safe");

    // Initialize and cleanup
    coord_mapper_init(NULL);
    coord_mapper_cleanup();
    TEST_ASSERT(coord_mapper_is_initialized() == false,
                "Cleanup after init works");

    // Double cleanup - should not crash
    coord_mapper_cleanup();
    TEST_ASSERT(coord_mapper_is_initialized() == false,
                "Double cleanup is safe");
}

// ============================================================================
// Main Test Runner
// ============================================================================

int main(int argc, char *argv[]) {
    (void)argc;
    (void)argv;

    printf("\n");
    printf("==========================================================\n");
    printf("  APIS Edge - Coordinate Mapper Unit Tests\n");
    printf("==========================================================\n");

    // Run all tests
    test_status_names();
    test_not_initialized();
    test_initialization();
    test_custom_camera_params();
    test_basic_mapping();
    test_out_of_bounds();
    test_calibration_offsets();
    test_calibration_scales();
    test_calibration_points();
    test_angle_to_pixel();
    test_calibration_persistence();
    test_get_calibration_data();
    test_statistics();
    test_servo_safety();
    test_cleanup_safety();

    // Summary
    printf("\n==========================================================\n");
    printf("  Test Results: %d passed, %d failed\n",
           tests_passed, tests_failed);
    printf("==========================================================\n\n");

    // Cleanup test file
    cleanup_test_file();

    return tests_failed > 0 ? 1 : 0;
}
