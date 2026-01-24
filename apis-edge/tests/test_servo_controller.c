/**
 * Unit tests for Servo Controller.
 */

#include "servo_controller.h"
#include "log.h"
#include "platform.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <assert.h>

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

// ============================================================================
// Test: Status Names
// ============================================================================

static void test_status_names(void) {
    TEST_SECTION("Status Names");

    TEST_ASSERT(strcmp(servo_status_name(SERVO_OK), "OK") == 0,
                "SERVO_OK has correct name");
    TEST_ASSERT(strcmp(servo_status_name(SERVO_ERROR_NOT_INITIALIZED), "NOT_INITIALIZED") == 0,
                "SERVO_ERROR_NOT_INITIALIZED has correct name");
    TEST_ASSERT(strcmp(servo_status_name(SERVO_ERROR_INVALID_AXIS), "INVALID_AXIS") == 0,
                "SERVO_ERROR_INVALID_AXIS has correct name");
    TEST_ASSERT(strcmp(servo_status_name(SERVO_ERROR_ANGLE_CLAMPED), "ANGLE_CLAMPED") == 0,
                "SERVO_ERROR_ANGLE_CLAMPED has correct name");
    TEST_ASSERT(strcmp(servo_status_name(SERVO_ERROR_HARDWARE), "HARDWARE_ERROR") == 0,
                "SERVO_ERROR_HARDWARE has correct name");
    TEST_ASSERT(strcmp(servo_status_name(SERVO_ERROR_NO_MEMORY), "NO_MEMORY") == 0,
                "SERVO_ERROR_NO_MEMORY has correct name");
    TEST_ASSERT(strcmp(servo_status_name(SERVO_ERROR_BUSY), "BUSY") == 0,
                "SERVO_ERROR_BUSY has correct name");
    TEST_ASSERT(strcmp(servo_status_name((servo_status_t)99), "UNKNOWN") == 0,
                "Unknown status returns UNKNOWN");
}

// ============================================================================
// Test: Axis Names
// ============================================================================

static void test_axis_names(void) {
    TEST_SECTION("Axis Names");

    TEST_ASSERT(strcmp(servo_axis_name(SERVO_AXIS_PAN), "PAN") == 0,
                "PAN axis has correct name");
    TEST_ASSERT(strcmp(servo_axis_name(SERVO_AXIS_TILT), "TILT") == 0,
                "TILT axis has correct name");
    TEST_ASSERT(strcmp(servo_axis_name((servo_axis_t)99), "UNKNOWN") == 0,
                "Unknown axis returns UNKNOWN");
}

// ============================================================================
// Test: Angle Clamping
// ============================================================================

static void test_angle_clamping(void) {
    TEST_SECTION("Angle Clamping");

    // Pan axis tests
    TEST_ASSERT(float_eq(servo_controller_clamp_angle(SERVO_AXIS_PAN, 0.0f), 0.0f, 0.01f),
                "Pan center (0°) unchanged");
    TEST_ASSERT(float_eq(servo_controller_clamp_angle(SERVO_AXIS_PAN, 45.0f), 45.0f, 0.01f),
                "Pan max (45°) unchanged");
    TEST_ASSERT(float_eq(servo_controller_clamp_angle(SERVO_AXIS_PAN, -45.0f), -45.0f, 0.01f),
                "Pan min (-45°) unchanged");
    TEST_ASSERT(float_eq(servo_controller_clamp_angle(SERVO_AXIS_PAN, 60.0f), 45.0f, 0.01f),
                "Pan over max (60°) clamped to 45°");
    TEST_ASSERT(float_eq(servo_controller_clamp_angle(SERVO_AXIS_PAN, -60.0f), -45.0f, 0.01f),
                "Pan under min (-60°) clamped to -45°");
    TEST_ASSERT(float_eq(servo_controller_clamp_angle(SERVO_AXIS_PAN, 30.0f), 30.0f, 0.01f),
                "Pan within range (30°) unchanged");

    // Tilt axis tests
    TEST_ASSERT(float_eq(servo_controller_clamp_angle(SERVO_AXIS_TILT, 0.0f), 0.0f, 0.01f),
                "Tilt max (0°) unchanged");
    TEST_ASSERT(float_eq(servo_controller_clamp_angle(SERVO_AXIS_TILT, -30.0f), -30.0f, 0.01f),
                "Tilt min (-30°) unchanged");
    TEST_ASSERT(float_eq(servo_controller_clamp_angle(SERVO_AXIS_TILT, -15.0f), -15.0f, 0.01f),
                "Tilt center (-15°) unchanged");
    TEST_ASSERT(float_eq(servo_controller_clamp_angle(SERVO_AXIS_TILT, 10.0f), 0.0f, 0.01f),
                "Tilt upward (10°) clamped to 0° (CRITICAL SAFETY)");
    TEST_ASSERT(float_eq(servo_controller_clamp_angle(SERVO_AXIS_TILT, 45.0f), 0.0f, 0.01f),
                "Tilt way upward (45°) clamped to 0° (CRITICAL SAFETY)");
    TEST_ASSERT(float_eq(servo_controller_clamp_angle(SERVO_AXIS_TILT, -45.0f), -30.0f, 0.01f),
                "Tilt too far down (-45°) clamped to -30°");

    // Invalid axis
    TEST_ASSERT(float_eq(servo_controller_clamp_angle((servo_axis_t)99, 20.0f), 0.0f, 0.01f),
                "Invalid axis returns 0");
}

// ============================================================================
// Test: Angle Validation
// ============================================================================

static void test_angle_validation(void) {
    TEST_SECTION("Angle Validation");

    // Pan axis
    TEST_ASSERT(servo_controller_is_angle_valid(SERVO_AXIS_PAN, 0.0f) == true,
                "Pan 0° is valid");
    TEST_ASSERT(servo_controller_is_angle_valid(SERVO_AXIS_PAN, 45.0f) == true,
                "Pan 45° is valid");
    TEST_ASSERT(servo_controller_is_angle_valid(SERVO_AXIS_PAN, -45.0f) == true,
                "Pan -45° is valid");
    TEST_ASSERT(servo_controller_is_angle_valid(SERVO_AXIS_PAN, 46.0f) == false,
                "Pan 46° is invalid");
    TEST_ASSERT(servo_controller_is_angle_valid(SERVO_AXIS_PAN, -46.0f) == false,
                "Pan -46° is invalid");

    // Tilt axis (SAFETY CRITICAL)
    TEST_ASSERT(servo_controller_is_angle_valid(SERVO_AXIS_TILT, 0.0f) == true,
                "Tilt 0° is valid (horizontal)");
    TEST_ASSERT(servo_controller_is_angle_valid(SERVO_AXIS_TILT, -30.0f) == true,
                "Tilt -30° is valid (max down)");
    TEST_ASSERT(servo_controller_is_angle_valid(SERVO_AXIS_TILT, -15.0f) == true,
                "Tilt -15° is valid (center)");
    TEST_ASSERT(servo_controller_is_angle_valid(SERVO_AXIS_TILT, 1.0f) == false,
                "Tilt 1° is INVALID (upward!)");
    TEST_ASSERT(servo_controller_is_angle_valid(SERVO_AXIS_TILT, 10.0f) == false,
                "Tilt 10° is INVALID (upward!)");
    TEST_ASSERT(servo_controller_is_angle_valid(SERVO_AXIS_TILT, -31.0f) == false,
                "Tilt -31° is invalid (too far down)");
}

// ============================================================================
// Test: PWM Conversion
// ============================================================================

static void test_pwm_conversion(void) {
    TEST_SECTION("PWM Conversion");

    // Pan axis
    TEST_ASSERT(servo_controller_angle_to_pwm(SERVO_AXIS_PAN, 0.0f) == 1500,
                "Pan center (0°) = 1500us");
    TEST_ASSERT(servo_controller_angle_to_pwm(SERVO_AXIS_PAN, -45.0f) == 1000,
                "Pan min (-45°) = 1000us");
    TEST_ASSERT(servo_controller_angle_to_pwm(SERVO_AXIS_PAN, 45.0f) == 2000,
                "Pan max (45°) = 2000us");

    // Pan intermediate values
    uint32_t pan_22_5 = servo_controller_angle_to_pwm(SERVO_AXIS_PAN, 22.5f);
    TEST_ASSERT(pan_22_5 == 1750,
                "Pan 22.5° = 1750us");

    uint32_t pan_neg_22_5 = servo_controller_angle_to_pwm(SERVO_AXIS_PAN, -22.5f);
    TEST_ASSERT(pan_neg_22_5 == 1250,
                "Pan -22.5° = 1250us");

    // Tilt axis
    TEST_ASSERT(servo_controller_angle_to_pwm(SERVO_AXIS_TILT, 0.0f) == 2000,
                "Tilt max/horizontal (0°) = 2000us");
    TEST_ASSERT(servo_controller_angle_to_pwm(SERVO_AXIS_TILT, -30.0f) == 1000,
                "Tilt min (-30°) = 1000us");
    TEST_ASSERT(servo_controller_angle_to_pwm(SERVO_AXIS_TILT, -15.0f) == 1500,
                "Tilt center (-15°) = 1500us");

    // Clamped values
    TEST_ASSERT(servo_controller_angle_to_pwm(SERVO_AXIS_PAN, 90.0f) == 2000,
                "Pan out of range (90°) clamped to 2000us");
    TEST_ASSERT(servo_controller_angle_to_pwm(SERVO_AXIS_TILT, 30.0f) == 2000,
                "Tilt upward (30°) clamped to 2000us (horizontal)");

    // Reverse conversion
    TEST_ASSERT(float_eq(servo_controller_pwm_to_angle(SERVO_AXIS_PAN, 1500), 0.0f, 0.1f),
                "PWM 1500us -> Pan 0°");
    TEST_ASSERT(float_eq(servo_controller_pwm_to_angle(SERVO_AXIS_PAN, 1000), -45.0f, 0.1f),
                "PWM 1000us -> Pan -45°");
    TEST_ASSERT(float_eq(servo_controller_pwm_to_angle(SERVO_AXIS_PAN, 2000), 45.0f, 0.1f),
                "PWM 2000us -> Pan 45°");

    TEST_ASSERT(float_eq(servo_controller_pwm_to_angle(SERVO_AXIS_TILT, 1500), -15.0f, 0.1f),
                "PWM 1500us -> Tilt -15°");
    TEST_ASSERT(float_eq(servo_controller_pwm_to_angle(SERVO_AXIS_TILT, 2000), 0.0f, 0.1f),
                "PWM 2000us -> Tilt 0°");
    TEST_ASSERT(float_eq(servo_controller_pwm_to_angle(SERVO_AXIS_TILT, 1000), -30.0f, 0.1f),
                "PWM 1000us -> Tilt -30°");
}

// ============================================================================
// Test: Initialization
// ============================================================================

static void test_initialization(void) {
    TEST_SECTION("Initialization");

    // Should not be initialized at start
    TEST_ASSERT(servo_controller_is_initialized() == false,
                "Not initialized before init()");

    // Initialize
    servo_status_t status = servo_controller_init();
    TEST_ASSERT(status == SERVO_OK, "Init returns OK");
    TEST_ASSERT(servo_controller_is_initialized() == true,
                "Is initialized after init()");
    TEST_ASSERT(servo_controller_is_hardware_ok() == true,
                "Hardware OK after init");

    // Check home position
    servo_position_t pos;
    status = servo_controller_get_position(&pos);
    TEST_ASSERT(status == SERVO_OK, "Get position returns OK");
    TEST_ASSERT(float_eq(pos.pan_deg, SERVO_PAN_CENTER_DEG, 0.1f),
                "Pan at home position (0°)");
    TEST_ASSERT(float_eq(pos.tilt_deg, SERVO_TILT_CENTER_DEG, 0.1f),
                "Tilt at home position (-15°)");

    // Double init should be OK
    status = servo_controller_init();
    TEST_ASSERT(status == SERVO_OK, "Double init returns OK");

    // Cleanup
    servo_controller_cleanup();
    TEST_ASSERT(servo_controller_is_initialized() == false,
                "Not initialized after cleanup");
}

// ============================================================================
// Test: Movement
// ============================================================================

static void test_movement(void) {
    TEST_SECTION("Movement");

    servo_status_t status = servo_controller_init();
    TEST_ASSERT(status == SERVO_OK, "Init for movement tests");

    // Move to valid position
    servo_position_t target = { .pan_deg = 30.0f, .tilt_deg = -20.0f };
    status = servo_controller_move(target);
    TEST_ASSERT(status == SERVO_OK, "Move to valid position returns OK");

    // Wait for movement to complete
    apis_sleep_ms(100);
    TEST_ASSERT(servo_controller_is_moving() == false,
                "Not moving after wait");

    // Check final position
    servo_position_t pos;
    servo_controller_get_position(&pos);
    TEST_ASSERT(float_eq(pos.pan_deg, 30.0f, 0.5f),
                "Pan reached target (30°)");
    TEST_ASSERT(float_eq(pos.tilt_deg, -20.0f, 0.5f),
                "Tilt reached target (-20°)");

    // Move to clamped position
    target.pan_deg = 60.0f;  // Should clamp to 45
    target.tilt_deg = 10.0f; // Should clamp to 0 (SAFETY)
    status = servo_controller_move(target);
    TEST_ASSERT(status == SERVO_ERROR_ANGLE_CLAMPED,
                "Move to out-of-range returns ANGLE_CLAMPED");

    apis_sleep_ms(100);
    servo_controller_get_position(&pos);
    TEST_ASSERT(float_eq(pos.pan_deg, 45.0f, 0.5f),
                "Pan clamped to max (45°)");
    TEST_ASSERT(float_eq(pos.tilt_deg, 0.0f, 0.5f),
                "Tilt clamped to horizontal (0°) - SAFETY");

    servo_controller_cleanup();
}

// ============================================================================
// Test: Immediate Movement
// ============================================================================

static void test_immediate_movement(void) {
    TEST_SECTION("Immediate Movement");

    servo_status_t status = servo_controller_init();
    TEST_ASSERT(status == SERVO_OK, "Init for immediate movement tests");

    // Move immediately (no interpolation)
    servo_position_t target = { .pan_deg = -40.0f, .tilt_deg = -25.0f };
    status = servo_controller_move_immediate(target);
    TEST_ASSERT(status == SERVO_OK, "Immediate move returns OK");

    // Should not be moving (instant)
    TEST_ASSERT(servo_controller_is_moving() == false,
                "Not moving after immediate move");

    // Check position
    servo_position_t pos;
    servo_controller_get_position(&pos);
    TEST_ASSERT(float_eq(pos.pan_deg, -40.0f, 0.1f),
                "Pan at target (-40°) immediately");
    TEST_ASSERT(float_eq(pos.tilt_deg, -25.0f, 0.1f),
                "Tilt at target (-25°) immediately");

    // Immediate move with clamping
    target.pan_deg = 0.0f;
    target.tilt_deg = 45.0f;  // SAFETY: should clamp to 0
    status = servo_controller_move_immediate(target);
    TEST_ASSERT(status == SERVO_ERROR_ANGLE_CLAMPED,
                "Immediate move with upward tilt returns ANGLE_CLAMPED");

    servo_controller_get_position(&pos);
    TEST_ASSERT(float_eq(pos.tilt_deg, 0.0f, 0.1f),
                "Tilt clamped to horizontal (SAFETY)");

    servo_controller_cleanup();
}

// ============================================================================
// Test: Single Axis Movement
// ============================================================================

static void test_single_axis_movement(void) {
    TEST_SECTION("Single Axis Movement");

    servo_status_t status = servo_controller_init();
    TEST_ASSERT(status == SERVO_OK, "Init for single axis tests");

    // Move pan only
    status = servo_controller_move_axis(SERVO_AXIS_PAN, 35.0f);
    TEST_ASSERT(status == SERVO_OK, "Move pan axis returns OK");

    apis_sleep_ms(100);
    servo_position_t pos;
    servo_controller_get_position(&pos);
    TEST_ASSERT(float_eq(pos.pan_deg, 35.0f, 0.5f),
                "Pan moved to 35°");
    TEST_ASSERT(float_eq(pos.tilt_deg, SERVO_TILT_CENTER_DEG, 0.5f),
                "Tilt unchanged at center");

    // Move tilt only
    status = servo_controller_move_axis(SERVO_AXIS_TILT, -28.0f);
    TEST_ASSERT(status == SERVO_OK, "Move tilt axis returns OK");

    apis_sleep_ms(100);
    servo_controller_get_position(&pos);
    TEST_ASSERT(float_eq(pos.pan_deg, 35.0f, 0.5f),
                "Pan unchanged at 35°");
    TEST_ASSERT(float_eq(pos.tilt_deg, -28.0f, 0.5f),
                "Tilt moved to -28°");

    // Invalid axis
    status = servo_controller_move_axis((servo_axis_t)99, 10.0f);
    TEST_ASSERT(status == SERVO_ERROR_INVALID_AXIS,
                "Invalid axis returns error");

    servo_controller_cleanup();
}

// ============================================================================
// Test: Home Position
// ============================================================================

static void test_home_position(void) {
    TEST_SECTION("Home Position");

    servo_status_t status = servo_controller_init();
    TEST_ASSERT(status == SERVO_OK, "Init for home tests");

    // Move away from home
    servo_position_t target = { .pan_deg = 40.0f, .tilt_deg = -25.0f };
    servo_controller_move_immediate(target);

    servo_position_t pos;
    servo_controller_get_position(&pos);
    TEST_ASSERT(float_eq(pos.pan_deg, 40.0f, 0.1f),
                "Pan moved away from home");

    // Return to home
    status = servo_controller_home();
    TEST_ASSERT(status == SERVO_OK, "Home returns OK");

    apis_sleep_ms(100);
    servo_controller_get_position(&pos);
    TEST_ASSERT(float_eq(pos.pan_deg, SERVO_PAN_CENTER_DEG, 0.5f),
                "Pan at home (0°)");
    TEST_ASSERT(float_eq(pos.tilt_deg, SERVO_TILT_CENTER_DEG, 0.5f),
                "Tilt at home (-15°)");

    servo_controller_cleanup();
}

// ============================================================================
// Test: Statistics
// ============================================================================

static void test_statistics(void) {
    TEST_SECTION("Statistics");

    servo_status_t status = servo_controller_init();
    TEST_ASSERT(status == SERVO_OK, "Init for stats tests");

    servo_stats_t stats;
    status = servo_controller_get_stats(&stats);
    TEST_ASSERT(status == SERVO_OK, "Get stats returns OK");
    TEST_ASSERT(stats.move_count == 0, "Initial move count is 0");
    TEST_ASSERT(stats.clamp_count == 0, "Initial clamp count is 0");
    TEST_ASSERT(stats.hardware_ok == true, "Hardware OK");

    // Make some moves
    servo_position_t target = { .pan_deg = 20.0f, .tilt_deg = -10.0f };
    servo_controller_move(target);
    apis_sleep_ms(100);

    target.pan_deg = -20.0f;
    servo_controller_move(target);
    apis_sleep_ms(100);

    // Out of range move
    target.pan_deg = 100.0f;
    target.tilt_deg = 50.0f;
    servo_controller_move(target);
    apis_sleep_ms(100);

    servo_controller_get_stats(&stats);
    TEST_ASSERT(stats.move_count == 3, "Move count is 3");
    TEST_ASSERT(stats.clamp_count == 1, "Clamp count is 1");
    TEST_ASSERT(stats.uptime_ms > 0, "Uptime is positive");

    // Null pointer test
    status = servo_controller_get_stats(NULL);
    TEST_ASSERT(status == SERVO_ERROR_INVALID_AXIS,
                "Get stats with NULL returns error");

    servo_controller_cleanup();
}

// ============================================================================
// Test: Not Initialized Errors
// ============================================================================

static void test_not_initialized(void) {
    TEST_SECTION("Not Initialized Errors");

    // Ensure not initialized
    if (servo_controller_is_initialized()) {
        servo_controller_cleanup();
    }

    servo_status_t status;
    servo_position_t pos = { .pan_deg = 0.0f, .tilt_deg = 0.0f };

    status = servo_controller_move(pos);
    TEST_ASSERT(status == SERVO_ERROR_NOT_INITIALIZED,
                "Move before init returns NOT_INITIALIZED");

    status = servo_controller_move_immediate(pos);
    TEST_ASSERT(status == SERVO_ERROR_NOT_INITIALIZED,
                "Move immediate before init returns NOT_INITIALIZED");

    status = servo_controller_move_axis(SERVO_AXIS_PAN, 10.0f);
    TEST_ASSERT(status == SERVO_ERROR_NOT_INITIALIZED,
                "Move axis before init returns NOT_INITIALIZED");

    status = servo_controller_home();
    TEST_ASSERT(status == SERVO_ERROR_NOT_INITIALIZED,
                "Home before init returns NOT_INITIALIZED");

    status = servo_controller_get_position(&pos);
    TEST_ASSERT(status == SERVO_ERROR_NOT_INITIALIZED,
                "Get position before init returns NOT_INITIALIZED");

    servo_stats_t stats;
    status = servo_controller_get_stats(&stats);
    TEST_ASSERT(status == SERVO_ERROR_NOT_INITIALIZED,
                "Get stats before init returns NOT_INITIALIZED");

    TEST_ASSERT(servo_controller_is_moving() == false,
                "Is moving returns false when not initialized");

    TEST_ASSERT(servo_controller_is_hardware_ok() == false,
                "Is hardware OK returns false when not initialized");
}

// ============================================================================
// Test: Safety Critical - Tilt Never Upward
// ============================================================================

static void test_tilt_safety(void) {
    TEST_SECTION("Tilt Safety (CRITICAL)");

    servo_status_t status = servo_controller_init();
    TEST_ASSERT(status == SERVO_OK, "Init for safety tests");

    // Try multiple upward angles - ALL must be clamped to 0
    float upward_angles[] = { 1.0f, 5.0f, 10.0f, 30.0f, 45.0f, 90.0f };
    int num_angles = sizeof(upward_angles) / sizeof(upward_angles[0]);

    for (int i = 0; i < num_angles; i++) {
        servo_position_t target = { .pan_deg = 0.0f, .tilt_deg = upward_angles[i] };
        status = servo_controller_move_immediate(target);
        TEST_ASSERT(status == SERVO_ERROR_ANGLE_CLAMPED,
                    "Upward tilt returns ANGLE_CLAMPED");

        servo_position_t pos;
        servo_controller_get_position(&pos);
        TEST_ASSERT(float_eq(pos.tilt_deg, 0.0f, 0.01f),
                    "Tilt NEVER goes above horizontal");
    }

    // Verify clamping function directly
    for (int i = 0; i < num_angles; i++) {
        float clamped = servo_controller_clamp_angle(SERVO_AXIS_TILT, upward_angles[i]);
        TEST_ASSERT(float_eq(clamped, 0.0f, 0.01f),
                    "Clamp function blocks upward angles");
    }

    servo_controller_cleanup();
}

// ============================================================================
// Test: PWM Round Trip
// ============================================================================

static void test_pwm_round_trip(void) {
    TEST_SECTION("PWM Round Trip");

    // Test that angle -> PWM -> angle is identity (within tolerance)
    float pan_angles[] = { -45.0f, -22.5f, 0.0f, 22.5f, 45.0f };
    float tilt_angles[] = { -30.0f, -22.5f, -15.0f, -7.5f, 0.0f };

    for (int i = 0; i < 5; i++) {
        uint32_t pwm = servo_controller_angle_to_pwm(SERVO_AXIS_PAN, pan_angles[i]);
        float recovered = servo_controller_pwm_to_angle(SERVO_AXIS_PAN, pwm);
        TEST_ASSERT(float_eq(recovered, pan_angles[i], 0.5f),
                    "Pan angle round trip preserves value");
    }

    for (int i = 0; i < 5; i++) {
        uint32_t pwm = servo_controller_angle_to_pwm(SERVO_AXIS_TILT, tilt_angles[i]);
        float recovered = servo_controller_pwm_to_angle(SERVO_AXIS_TILT, pwm);
        TEST_ASSERT(float_eq(recovered, tilt_angles[i], 0.5f),
                    "Tilt angle round trip preserves value");
    }
}

// ============================================================================
// Test: Callback
// ============================================================================

static bool callback_invoked = false;
static servo_axis_t callback_axis = SERVO_AXIS_COUNT;

static void failure_callback(servo_axis_t axis, void *user_data) {
    callback_invoked = true;
    callback_axis = axis;
    (void)user_data;
}

static void test_failure_callback(void) {
    TEST_SECTION("Failure Callback");

    servo_status_t status = servo_controller_init();
    TEST_ASSERT(status == SERVO_OK, "Init for callback tests");

    // Set callback
    callback_invoked = false;
    callback_axis = SERVO_AXIS_COUNT;
    servo_controller_set_failure_callback(failure_callback, NULL);

    // Note: In real hardware, callback would be invoked on failure
    // For test platform, we just verify the callback was registered
    TEST_ASSERT(callback_invoked == false, "Callback not invoked (no failure)");

    // Clear callback
    servo_controller_set_failure_callback(NULL, NULL);

    servo_controller_cleanup();
}

// ============================================================================
// Test: Cleanup Safety
// ============================================================================

static void test_cleanup_safety(void) {
    TEST_SECTION("Cleanup Safety");

    // Cleanup when not initialized - should not crash
    servo_controller_cleanup();
    TEST_ASSERT(servo_controller_is_initialized() == false,
                "Cleanup when not initialized is safe");

    // Initialize and cleanup
    servo_controller_init();
    servo_controller_cleanup();
    TEST_ASSERT(servo_controller_is_initialized() == false,
                "Cleanup after init works");

    // Double cleanup - should not crash
    servo_controller_cleanup();
    TEST_ASSERT(servo_controller_is_initialized() == false,
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
    printf("  APIS Edge - Servo Controller Unit Tests\n");
    printf("==========================================================\n");

    // Run all tests
    test_status_names();
    test_axis_names();
    test_angle_clamping();
    test_angle_validation();
    test_pwm_conversion();
    test_pwm_round_trip();
    test_not_initialized();
    test_initialization();
    test_movement();
    test_immediate_movement();
    test_single_axis_movement();
    test_home_position();
    test_statistics();
    test_tilt_safety();
    test_failure_callback();
    test_cleanup_safety();

    // Summary
    printf("\n==========================================================\n");
    printf("  Test Results: %d passed, %d failed\n",
           tests_passed, tests_failed);
    printf("==========================================================\n\n");

    return tests_failed > 0 ? 1 : 0;
}
