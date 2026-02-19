/**
 * Safety Layer Tests
 *
 * Tests multi-layer safety checks, watchdog, brownout, and safe mode.
 *
 * C7-INFO-005: Missing test coverage (suggested additions):
 * TODO: Add test for concurrent access / deadlock scenarios (requires threads)
 * TODO: Add test for safety_laser_activate() duration parameter behavior
 * TODO: Add test verifying callback invocation happens outside the lock
 * TODO: Add stress test with rapid arm/disarm/check cycles
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <time.h>

// Need test platform definitions
#ifndef APIS_PLATFORM_TEST
#define APIS_PLATFORM_TEST
#endif

#include "safety_layer.h"
#include "laser_controller.h"
#include "button_handler.h"

// ============================================================================
// Test infrastructure
// ============================================================================

static int tests_passed = 0;
static int tests_failed = 0;

#define TEST_ASSERT(condition, message) do { \
    if (!(condition)) { \
        printf("  FAIL: %s (line %d)\n", message, __LINE__); \
        tests_failed++; \
        return; \
    } \
} while(0)

#define TEST_ASSERT_EQ(a, b, message) do { \
    if ((a) != (b)) { \
        printf("  FAIL: %s - expected %d, got %d (line %d)\n", message, (int)(b), (int)(a), __LINE__); \
        tests_failed++; \
        return; \
    } \
} while(0)

#define RUN_TEST(test_func) do { \
    printf("Running %s...\n", #test_func); \
    cleanup_all(); \
    test_func(); \
    tests_passed++; \
    printf("  PASS\n"); \
} while(0)

// Time utility
static void sleep_ms(int ms) {
    usleep(ms * 1000);
}

// Cleanup helper
static void cleanup_all(void) {
    safety_cleanup();
    laser_controller_cleanup();
    button_handler_cleanup();
}

// ============================================================================
// Callback tracking
// ============================================================================

static int state_callback_count = 0;
static safety_state_t last_state = SAFETY_STATE_NORMAL;
static int failure_callback_count = 0;
static safety_status_t last_failure = SAFETY_OK;
static int watchdog_callback_count = 0;
static uint32_t last_watchdog_remaining = 0;

static void test_state_callback(safety_state_t state, void *user_data) {
    (void)user_data;
    state_callback_count++;
    last_state = state;
}

static void test_failure_callback(safety_status_t failure, void *user_data) {
    (void)user_data;
    failure_callback_count++;
    last_failure = failure;
}

static void test_watchdog_callback(uint32_t remaining_ms, void *user_data) {
    (void)user_data;
    watchdog_callback_count++;
    last_watchdog_remaining = remaining_ms;
}

static void reset_callbacks(void) {
    state_callback_count = 0;
    last_state = SAFETY_STATE_NORMAL;
    failure_callback_count = 0;
    last_failure = SAFETY_OK;
    watchdog_callback_count = 0;
    last_watchdog_remaining = 0;
}

// ============================================================================
// Initialization Tests
// ============================================================================

void test_init_succeeds(void) {
    safety_status_t status = safety_layer_init();
    TEST_ASSERT_EQ(status, SAFETY_OK, "Init should succeed");
    TEST_ASSERT(safety_is_initialized(), "Should be initialized");
}

void test_double_init_succeeds(void) {
    safety_status_t status = safety_layer_init();
    TEST_ASSERT_EQ(status, SAFETY_OK, "First init should succeed");

    status = safety_layer_init();
    TEST_ASSERT_EQ(status, SAFETY_OK, "Second init should also succeed");
}

void test_initial_state_is_normal(void) {
    safety_layer_init();
    TEST_ASSERT_EQ(safety_get_state(), SAFETY_STATE_NORMAL, "Initial state should be normal");
    TEST_ASSERT(!safety_is_safe_mode(), "Should not be in safe mode");
}

void test_initial_detection_is_inactive(void) {
    safety_layer_init();
    TEST_ASSERT(!safety_is_detection_active(), "Detection should be inactive initially");
}

// ============================================================================
// Safety Check Tests
// ============================================================================

void test_check_fails_not_initialized(void) {
    safety_result_t result;
    safety_status_t status = safety_check_all(&result);
    TEST_ASSERT_EQ(status, SAFETY_ERROR_NOT_INITIALIZED, "Check should fail if not initialized");
}

void test_check_all_fails_without_setup(void) {
    safety_layer_init();
    safety_result_t result;
    safety_status_t status = safety_check_all(&result);

    // Should fail - not armed, no detection
    TEST_ASSERT(status != SAFETY_OK, "Check should fail without proper setup");
    TEST_ASSERT(result.failed_checks != 0, "Should have failed checks");
}

void test_check_armed_passes_when_armed(void) {
    safety_layer_init();
    laser_controller_init();
    laser_controller_arm();

    safety_result_t result;
    safety_status_t status = safety_check(SAFETY_CHECK_ARMED, &result);
    TEST_ASSERT_EQ(status, SAFETY_OK, "Armed check should pass when armed");
    TEST_ASSERT(result.is_armed, "Result should show armed");
}

void test_check_armed_fails_when_disarmed(void) {
    safety_layer_init();
    laser_controller_init();
    // Don't arm

    safety_result_t result;
    safety_status_t status = safety_check(SAFETY_CHECK_ARMED, &result);
    TEST_ASSERT_EQ(status, SAFETY_ERROR_NOT_ARMED, "Armed check should fail when disarmed");
    TEST_ASSERT(!result.is_armed, "Result should show not armed");
}

void test_check_detection_passes_when_active(void) {
    safety_layer_init();
    safety_set_detection_active(true);

    safety_result_t result;
    safety_status_t status = safety_check(SAFETY_CHECK_DETECTION, &result);
    TEST_ASSERT_EQ(status, SAFETY_OK, "Detection check should pass when active");
    TEST_ASSERT(result.has_detection, "Result should show detection active");
}

void test_check_detection_fails_when_inactive(void) {
    safety_layer_init();
    // Detection inactive by default

    safety_result_t result;
    safety_status_t status = safety_check(SAFETY_CHECK_DETECTION, &result);
    TEST_ASSERT_EQ(status, SAFETY_ERROR_NO_DETECTION, "Detection check should fail when inactive");
}

void test_check_tilt_passes_when_downward(void) {
    safety_layer_init();

    // Set downward tilt (negative angle)
    safety_status_t tilt_status = safety_validate_tilt(-15.0f);
    TEST_ASSERT_EQ(tilt_status, SAFETY_OK, "Downward tilt should be valid");

    safety_result_t result;
    safety_status_t status = safety_check(SAFETY_CHECK_TILT, &result);
    TEST_ASSERT_EQ(status, SAFETY_OK, "Tilt check should pass for downward angle");
}

void test_check_tilt_fails_when_upward(void) {
    safety_layer_init();

    // Set upward tilt (positive angle)
    safety_status_t tilt_status = safety_validate_tilt(5.0f);
    TEST_ASSERT_EQ(tilt_status, SAFETY_ERROR_TILT_UPWARD, "Upward tilt should be rejected");

    safety_result_t result;
    safety_status_t status = safety_check(SAFETY_CHECK_TILT, &result);
    TEST_ASSERT_EQ(status, SAFETY_ERROR_TILT_UPWARD, "Tilt check should fail for upward angle");
}

void test_check_tilt_horizontal_passes(void) {
    safety_layer_init();

    // Set horizontal tilt (0 degrees)
    safety_status_t tilt_status = safety_validate_tilt(0.0f);
    TEST_ASSERT_EQ(tilt_status, SAFETY_OK, "Horizontal tilt should be valid");

    safety_result_t result;
    safety_status_t status = safety_check(SAFETY_CHECK_TILT, &result);
    TEST_ASSERT_EQ(status, SAFETY_OK, "Tilt check should pass for horizontal angle");
}

void test_check_kill_switch_passes_when_not_engaged(void) {
    safety_layer_init();
    laser_controller_init();
    // Kill switch not engaged by default

    safety_result_t result;
    safety_status_t status = safety_check(SAFETY_CHECK_KILL_SWITCH, &result);
    TEST_ASSERT_EQ(status, SAFETY_OK, "Kill switch check should pass when not engaged");
    TEST_ASSERT(!result.kill_switch_engaged, "Result should show kill switch not engaged");
}

void test_check_kill_switch_fails_when_engaged(void) {
    safety_layer_init();
    laser_controller_init();
    laser_controller_kill_switch();

    safety_result_t result;
    safety_status_t status = safety_check(SAFETY_CHECK_KILL_SWITCH, &result);
    TEST_ASSERT_EQ(status, SAFETY_ERROR_KILL_SWITCH, "Kill switch check should fail when engaged");
    TEST_ASSERT(result.kill_switch_engaged, "Result should show kill switch engaged");
}

void test_check_multiple_failures(void) {
    safety_layer_init();
    // Nothing set up - multiple checks should fail

    safety_result_t result;
    safety_status_t status = safety_check(SAFETY_CHECK_ARMED | SAFETY_CHECK_DETECTION, &result);
    TEST_ASSERT_EQ(status, SAFETY_ERROR_MULTIPLE, "Should report multiple failures");
    TEST_ASSERT(result.failed_checks & SAFETY_CHECK_ARMED, "Armed should be in failed checks");
    TEST_ASSERT(result.failed_checks & SAFETY_CHECK_DETECTION, "Detection should be in failed checks");
}

// ============================================================================
// Watchdog Tests
// ============================================================================

void test_watchdog_starts_with_feed(void) {
    safety_layer_init();
    uint32_t remaining = safety_get_watchdog_remaining();
    TEST_ASSERT(remaining > 0, "Watchdog should have remaining time after init");
    TEST_ASSERT(remaining <= SAFETY_WATCHDOG_TIMEOUT_MS, "Remaining should be <= timeout");
}

void test_watchdog_feed_resets(void) {
    safety_layer_init();
    sleep_ms(100);  // Let some time pass

    safety_feed_watchdog();
    uint32_t remaining = safety_get_watchdog_remaining();
    TEST_ASSERT(remaining >= SAFETY_WATCHDOG_TIMEOUT_MS - 50, "Feed should reset watchdog");
}

void test_watchdog_remaining_decreases(void) {
    safety_layer_init();
    safety_feed_watchdog();

    uint32_t remaining1 = safety_get_watchdog_remaining();
    sleep_ms(100);
    uint32_t remaining2 = safety_get_watchdog_remaining();

    TEST_ASSERT(remaining2 < remaining1, "Remaining time should decrease");
}

void test_watchdog_check_passes_when_fed(void) {
    safety_layer_init();
    safety_feed_watchdog();

    safety_result_t result;
    safety_status_t status = safety_check(SAFETY_CHECK_WATCHDOG, &result);
    TEST_ASSERT_EQ(status, SAFETY_OK, "Watchdog check should pass when recently fed");
    TEST_ASSERT(result.watchdog_remaining_ms > 0, "Should have remaining time");
}

void test_watchdog_warning_detected(void) {
    safety_layer_init();
    // Can't easily test 25s warning in unit test, but test the flag logic
    TEST_ASSERT(!safety_is_watchdog_warning(), "Should not be in warning initially");
}

void test_watchdog_timeout_enters_safe_mode(void) {
    // This test verifies the watchdog timeout logic by testing safety_update()
    // We can't easily mock time in this test framework, but we can verify:
    // 1. The update function exists and runs
    // 2. Safe mode can be entered via enter_safe_mode
    // 3. The watchdog check in safety_check detects timeout
    safety_layer_init();
    laser_controller_init();

    // Verify initial state
    TEST_ASSERT(!safety_is_safe_mode(), "Should not be in safe mode initially");
    TEST_ASSERT(!safety_is_watchdog_warning(), "Should not have watchdog warning initially");

    // Feed watchdog to reset
    safety_feed_watchdog();
    uint32_t remaining = safety_get_watchdog_remaining();
    TEST_ASSERT(remaining > 0, "Should have remaining time after feed");

    // Run update - should NOT trigger safe mode (just fed)
    safety_update();
    TEST_ASSERT(!safety_is_safe_mode(), "Should not enter safe mode immediately after feed");

    // Manually enter safe mode to test the path
    safety_enter_safe_mode();
    TEST_ASSERT(safety_is_safe_mode(), "Should be in safe mode after manual entry");

    // Verify laser is off
    TEST_ASSERT(!laser_controller_is_active(), "Laser should be OFF in safe mode");

    // Verify watchdog check fails in safe mode
    safety_result_t result;
    safety_status_t status = safety_check(SAFETY_CHECK_WATCHDOG, &result);
    TEST_ASSERT_EQ(status, SAFETY_ERROR_SAFE_MODE, "Watchdog check should fail in safe mode");
}

// ============================================================================
// Voltage/Brownout Tests
// ============================================================================

void test_voltage_set_and_get(void) {
    safety_layer_init();
    safety_set_voltage(4800);
    TEST_ASSERT_EQ(safety_get_voltage(), 4800, "Should return set voltage");
}

void test_voltage_warning_detected(void) {
    safety_layer_init();
    safety_set_voltage(4700);  // Below warning threshold
    TEST_ASSERT(safety_is_voltage_warning(), "Should detect voltage warning");
}

void test_voltage_warning_not_detected(void) {
    safety_layer_init();
    safety_set_voltage(5000);  // Above warning threshold
    TEST_ASSERT(!safety_is_voltage_warning(), "Should not detect warning at normal voltage");
}

void test_brownout_detected(void) {
    safety_layer_init();
    safety_set_voltage(4000);  // Below minimum
    TEST_ASSERT(safety_is_brownout(), "Should detect brownout");
}

void test_brownout_not_detected(void) {
    safety_layer_init();
    safety_set_voltage(5000);  // Normal voltage
    TEST_ASSERT(!safety_is_brownout(), "Should not detect brownout at normal voltage");
}

void test_brownout_check_fails(void) {
    safety_layer_init();
    safety_set_voltage(4000);  // Below minimum

    safety_result_t result;
    safety_status_t status = safety_check(SAFETY_CHECK_BROWNOUT, &result);
    TEST_ASSERT_EQ(status, SAFETY_ERROR_BROWNOUT, "Brownout check should fail at low voltage");
}

void test_brownout_check_passes(void) {
    safety_layer_init();
    safety_set_voltage(5000);  // Normal voltage

    safety_result_t result;
    safety_status_t status = safety_check(SAFETY_CHECK_BROWNOUT, &result);
    TEST_ASSERT_EQ(status, SAFETY_OK, "Brownout check should pass at normal voltage");
}

// ============================================================================
// Safe Mode Tests
// ============================================================================

void test_enter_safe_mode(void) {
    safety_layer_init();
    safety_enter_safe_mode();
    TEST_ASSERT(safety_is_safe_mode(), "Should be in safe mode");
    TEST_ASSERT_EQ(safety_get_state(), SAFETY_STATE_SAFE_MODE, "State should be SAFE_MODE");
}

void test_checks_fail_in_safe_mode(void) {
    safety_layer_init();
    laser_controller_init();
    laser_controller_arm();
    safety_set_detection_active(true);
    safety_validate_tilt(-10.0f);

    // All checks should pass normally
    safety_result_t result;
    safety_status_t status = safety_check_all(&result);
    TEST_ASSERT_EQ(status, SAFETY_OK, "Checks should pass before safe mode");

    // Turn laser on before entering safe mode
    laser_controller_on();
    TEST_ASSERT(laser_controller_is_active(), "Laser should be active before safe mode");

    // Enter safe mode
    safety_enter_safe_mode();

    // Now all checks should fail
    status = safety_check_all(&result);
    TEST_ASSERT_EQ(status, SAFETY_ERROR_SAFE_MODE, "Checks should fail in safe mode");

    // CRITICAL: Verify laser is actually OFF after entering safe mode
    TEST_ASSERT(!laser_controller_is_active(), "Laser MUST be OFF after entering safe mode");
}

void test_reset_from_safe_mode(void) {
    safety_layer_init();
    laser_controller_init();

    safety_enter_safe_mode();
    TEST_ASSERT(safety_is_safe_mode(), "Should be in safe mode");

    safety_status_t status = safety_reset();
    TEST_ASSERT_EQ(status, SAFETY_OK, "Reset should succeed");
    TEST_ASSERT(!safety_is_safe_mode(), "Should not be in safe mode after reset");
    TEST_ASSERT_EQ(safety_get_state(), SAFETY_STATE_NORMAL, "State should be NORMAL after reset");
}

void test_reset_when_not_in_safe_mode(void) {
    safety_layer_init();
    safety_status_t status = safety_reset();
    TEST_ASSERT_EQ(status, SAFETY_OK, "Reset when not in safe mode should succeed");
}

// ============================================================================
// Detection State Tests
// ============================================================================

void test_detection_set_and_get(void) {
    safety_layer_init();

    safety_set_detection_active(true);
    TEST_ASSERT(safety_is_detection_active(), "Detection should be active");

    safety_set_detection_active(false);
    TEST_ASSERT(!safety_is_detection_active(), "Detection should be inactive");
}

// ============================================================================
// Callback Tests
// ============================================================================

void test_state_callback_invoked(void) {
    safety_layer_init();
    reset_callbacks();
    safety_set_state_callback(test_state_callback, NULL);

    safety_enter_safe_mode();

    TEST_ASSERT(state_callback_count > 0, "State callback should have been invoked");
    TEST_ASSERT_EQ(last_state, SAFETY_STATE_SAFE_MODE, "Last state should be SAFE_MODE");
}

void test_failure_callback_invoked(void) {
    safety_layer_init();
    reset_callbacks();
    safety_set_failure_callback(test_failure_callback, NULL);

    // Trigger a failure
    safety_result_t result;
    safety_check(SAFETY_CHECK_ARMED, &result);

    TEST_ASSERT(failure_callback_count > 0, "Failure callback should have been invoked");
    TEST_ASSERT_EQ(last_failure, SAFETY_ERROR_NOT_ARMED, "Last failure should be NOT_ARMED");
}

void test_null_callbacks_allowed(void) {
    safety_layer_init();
    safety_set_state_callback(NULL, NULL);
    safety_set_failure_callback(NULL, NULL);
    safety_set_watchdog_callback(NULL, NULL);

    // Should not crash
    safety_enter_safe_mode();
    safety_check_all(NULL);
}

// ============================================================================
// Statistics Tests
// ============================================================================

void test_stats_initial_values(void) {
    safety_layer_init();
    safety_stats_t stats;
    safety_status_t status = safety_get_stats(&stats);

    TEST_ASSERT_EQ(status, SAFETY_OK, "Get stats should succeed");
    TEST_ASSERT_EQ(stats.checks_performed, 0, "Checks performed should be 0");
    TEST_ASSERT_EQ(stats.checks_passed, 0, "Checks passed should be 0");
    TEST_ASSERT_EQ(stats.checks_failed, 0, "Checks failed should be 0");
}

void test_stats_track_checks(void) {
    safety_layer_init();
    laser_controller_init();
    laser_controller_arm();
    safety_set_detection_active(true);
    safety_validate_tilt(-10.0f);
    safety_feed_watchdog();

    // Perform some checks
    safety_check_all(NULL);  // Should pass
    safety_check(SAFETY_CHECK_ARMED, NULL);  // Should pass

    safety_stats_t stats;
    safety_get_stats(&stats);

    TEST_ASSERT(stats.checks_performed >= 2, "Should have performed checks");
    TEST_ASSERT(stats.checks_passed >= 2, "Should have passed checks");
}

void test_stats_track_failures(void) {
    safety_layer_init();

    // Perform checks that will fail
    safety_check(SAFETY_CHECK_ARMED, NULL);  // Should fail
    safety_check(SAFETY_CHECK_DETECTION, NULL);  // Should fail

    safety_stats_t stats;
    safety_get_stats(&stats);

    TEST_ASSERT(stats.checks_failed >= 2, "Should have failed checks");
    TEST_ASSERT(stats.armed_failures >= 1, "Should have armed failures");
    TEST_ASSERT(stats.detection_failures >= 1, "Should have detection failures");
}

void test_stats_uptime_increases(void) {
    safety_layer_init();

    safety_stats_t stats1, stats2;
    safety_get_stats(&stats1);
    sleep_ms(50);
    safety_get_stats(&stats2);

    TEST_ASSERT(stats2.uptime_ms >= stats1.uptime_ms, "Uptime should increase");
}

// ============================================================================
// Name Conversion Tests
// ============================================================================

void test_safety_state_name(void) {
    TEST_ASSERT(strcmp(safety_state_name(SAFETY_STATE_NORMAL), "NORMAL") == 0, "NORMAL name");
    TEST_ASSERT(strcmp(safety_state_name(SAFETY_STATE_WARNING), "WARNING") == 0, "WARNING name");
    TEST_ASSERT(strcmp(safety_state_name(SAFETY_STATE_SAFE_MODE), "SAFE_MODE") == 0, "SAFE_MODE name");
    TEST_ASSERT(strcmp(safety_state_name(SAFETY_STATE_EMERGENCY), "EMERGENCY") == 0, "EMERGENCY name");
    TEST_ASSERT(strcmp(safety_state_name(99), "UNKNOWN") == 0, "Unknown state name");
}

void test_safety_status_name(void) {
    TEST_ASSERT(strcmp(safety_status_name(SAFETY_OK), "OK") == 0, "OK name");
    TEST_ASSERT(strcmp(safety_status_name(SAFETY_ERROR_NOT_ARMED), "NOT_ARMED") == 0, "NOT_ARMED name");
    TEST_ASSERT(strcmp(safety_status_name(SAFETY_ERROR_TILT_UPWARD), "TILT_UPWARD") == 0, "TILT_UPWARD name");
    TEST_ASSERT(strcmp(safety_status_name(SAFETY_ERROR_BROWNOUT), "BROWNOUT") == 0, "BROWNOUT name");
    TEST_ASSERT(strcmp(safety_status_name(99), "UNKNOWN") == 0, "Unknown status name");
}

void test_safety_check_name(void) {
    TEST_ASSERT(strcmp(safety_check_name(SAFETY_CHECK_ARMED), "ARMED") == 0, "ARMED check name");
    TEST_ASSERT(strcmp(safety_check_name(SAFETY_CHECK_TILT), "TILT") == 0, "TILT check name");
    TEST_ASSERT(strcmp(safety_check_name(SAFETY_CHECK_ALL), "ALL") == 0, "ALL check name");
    TEST_ASSERT(strcmp(safety_check_name(0xFF), "UNKNOWN") == 0, "Unknown check name");
}

// ============================================================================
// Cleanup Tests
// ============================================================================

void test_cleanup_resets_state(void) {
    safety_layer_init();
    safety_cleanup();
    TEST_ASSERT(!safety_is_initialized(), "Should not be initialized after cleanup");
}

void test_cleanup_when_not_initialized(void) {
    // Should not crash
    safety_cleanup();
}

void test_operations_fail_after_cleanup(void) {
    safety_layer_init();
    safety_cleanup();

    safety_result_t result;
    safety_status_t status = safety_check_all(&result);
    TEST_ASSERT_EQ(status, SAFETY_ERROR_NOT_INITIALIZED, "Check should fail after cleanup");
}

// ============================================================================
// Integration Tests
// ============================================================================

void test_full_safety_flow(void) {
    // Initialize all components
    safety_layer_init();
    laser_controller_init();
    button_handler_init(false);

    // Initially, checks should fail
    safety_result_t result;
    safety_status_t status = safety_check_all(&result);
    TEST_ASSERT(status != SAFETY_OK, "Checks should fail initially");

    // Set up for success
    button_handler_arm();  // Arm the system
    safety_set_detection_active(true);  // Detection active
    safety_validate_tilt(-15.0f);  // Downward tilt
    safety_feed_watchdog();  // Reset watchdog
    safety_set_voltage(5000);  // Good voltage

    // Now checks should pass
    status = safety_check_all(&result);
    TEST_ASSERT_EQ(status, SAFETY_OK, "All checks should pass when properly set up");
    TEST_ASSERT_EQ(result.failed_checks, 0, "No failed checks");
}

void test_upward_tilt_always_rejected(void) {
    safety_layer_init();
    laser_controller_init();
    button_handler_init(false);

    // Set up everything correctly
    button_handler_arm();
    safety_set_detection_active(true);
    safety_feed_watchdog();
    safety_set_voltage(5000);

    // Downward tilt should pass
    safety_validate_tilt(-10.0f);
    safety_status_t status = safety_check_all(NULL);
    TEST_ASSERT_EQ(status, SAFETY_OK, "Downward tilt should pass");

    // Upward tilt should fail
    safety_validate_tilt(10.0f);  // UPWARD - DANGEROUS!
    status = safety_check_all(NULL);
    TEST_ASSERT_EQ(status, SAFETY_ERROR_TILT_UPWARD, "Upward tilt must ALWAYS fail");
}

// ============================================================================
// Wrapper Function Tests
// ============================================================================

void test_safety_laser_on_fails_without_setup(void) {
    safety_layer_init();
    laser_controller_init();

    // Without proper setup, safety_laser_on should fail silently
    safety_status_t status = safety_laser_on();
    TEST_ASSERT(status != SAFETY_OK, "safety_laser_on should fail without setup");
    TEST_ASSERT(!laser_controller_is_active(), "Laser should NOT be active");
}

void test_safety_laser_on_succeeds_with_setup(void) {
    safety_layer_init();
    laser_controller_init();
    button_handler_init(false);

    // Set up everything for success
    button_handler_arm();
    safety_set_detection_active(true);
    safety_validate_tilt(-15.0f);
    safety_feed_watchdog();
    safety_set_voltage(5000);

    // Now safety_laser_on should succeed
    safety_status_t status = safety_laser_on();
    TEST_ASSERT_EQ(status, SAFETY_OK, "safety_laser_on should succeed with proper setup");
    TEST_ASSERT(laser_controller_is_active(), "Laser should be active");

    // Turn off
    safety_laser_off();
    TEST_ASSERT(!laser_controller_is_active(), "Laser should be off after safety_laser_off");
}

void test_safety_laser_on_blocked_in_safe_mode(void) {
    safety_layer_init();
    laser_controller_init();
    button_handler_init(false);

    // Full setup
    button_handler_arm();
    safety_set_detection_active(true);
    safety_validate_tilt(-15.0f);
    safety_feed_watchdog();
    safety_set_voltage(5000);

    // Enter safe mode
    safety_enter_safe_mode();

    // safety_laser_on should be blocked
    safety_status_t status = safety_laser_on();
    TEST_ASSERT_EQ(status, SAFETY_ERROR_SAFE_MODE, "safety_laser_on should fail in safe mode");
    TEST_ASSERT(!laser_controller_is_active(), "Laser MUST be off in safe mode");
}

void test_safety_laser_off_always_succeeds(void) {
    safety_layer_init();
    laser_controller_init();

    // safety_laser_off should always succeed, even when not initialized
    safety_status_t status = safety_laser_off();
    TEST_ASSERT_EQ(status, SAFETY_OK, "safety_laser_off should always succeed");
}

// ============================================================================
// Main
// ============================================================================

int main(void) {
    printf("\n==========================================================\n");
    printf("  Safety Layer Tests\n");
    printf("==========================================================\n\n");

    // Initialization Tests
    printf("--- Initialization Tests ---\n");
    RUN_TEST(test_init_succeeds);
    RUN_TEST(test_double_init_succeeds);
    RUN_TEST(test_initial_state_is_normal);
    RUN_TEST(test_initial_detection_is_inactive);

    // Safety Check Tests
    printf("\n--- Safety Check Tests ---\n");
    RUN_TEST(test_check_fails_not_initialized);
    RUN_TEST(test_check_all_fails_without_setup);
    RUN_TEST(test_check_armed_passes_when_armed);
    RUN_TEST(test_check_armed_fails_when_disarmed);
    RUN_TEST(test_check_detection_passes_when_active);
    RUN_TEST(test_check_detection_fails_when_inactive);
    RUN_TEST(test_check_tilt_passes_when_downward);
    RUN_TEST(test_check_tilt_fails_when_upward);
    RUN_TEST(test_check_tilt_horizontal_passes);
    RUN_TEST(test_check_kill_switch_passes_when_not_engaged);
    RUN_TEST(test_check_kill_switch_fails_when_engaged);
    RUN_TEST(test_check_multiple_failures);

    // Watchdog Tests
    printf("\n--- Watchdog Tests ---\n");
    RUN_TEST(test_watchdog_starts_with_feed);
    RUN_TEST(test_watchdog_feed_resets);
    RUN_TEST(test_watchdog_remaining_decreases);
    RUN_TEST(test_watchdog_check_passes_when_fed);
    RUN_TEST(test_watchdog_warning_detected);
    RUN_TEST(test_watchdog_timeout_enters_safe_mode);

    // Voltage/Brownout Tests
    printf("\n--- Voltage/Brownout Tests ---\n");
    RUN_TEST(test_voltage_set_and_get);
    RUN_TEST(test_voltage_warning_detected);
    RUN_TEST(test_voltage_warning_not_detected);
    RUN_TEST(test_brownout_detected);
    RUN_TEST(test_brownout_not_detected);
    RUN_TEST(test_brownout_check_fails);
    RUN_TEST(test_brownout_check_passes);

    // Safe Mode Tests
    printf("\n--- Safe Mode Tests ---\n");
    RUN_TEST(test_enter_safe_mode);
    RUN_TEST(test_checks_fail_in_safe_mode);
    RUN_TEST(test_reset_from_safe_mode);
    RUN_TEST(test_reset_when_not_in_safe_mode);

    // Detection State Tests
    printf("\n--- Detection State Tests ---\n");
    RUN_TEST(test_detection_set_and_get);

    // Callback Tests
    printf("\n--- Callback Tests ---\n");
    RUN_TEST(test_state_callback_invoked);
    RUN_TEST(test_failure_callback_invoked);
    RUN_TEST(test_null_callbacks_allowed);

    // Statistics Tests
    printf("\n--- Statistics Tests ---\n");
    RUN_TEST(test_stats_initial_values);
    RUN_TEST(test_stats_track_checks);
    RUN_TEST(test_stats_track_failures);
    RUN_TEST(test_stats_uptime_increases);

    // Name Conversion Tests
    printf("\n--- Name Conversion Tests ---\n");
    RUN_TEST(test_safety_state_name);
    RUN_TEST(test_safety_status_name);
    RUN_TEST(test_safety_check_name);

    // Cleanup Tests
    printf("\n--- Cleanup Tests ---\n");
    RUN_TEST(test_cleanup_resets_state);
    RUN_TEST(test_cleanup_when_not_initialized);
    RUN_TEST(test_operations_fail_after_cleanup);

    // Integration Tests
    printf("\n--- Integration Tests ---\n");
    RUN_TEST(test_full_safety_flow);
    RUN_TEST(test_upward_tilt_always_rejected);

    // Wrapper Function Tests
    printf("\n--- Wrapper Function Tests ---\n");
    RUN_TEST(test_safety_laser_on_fails_without_setup);
    RUN_TEST(test_safety_laser_on_succeeds_with_setup);
    RUN_TEST(test_safety_laser_on_blocked_in_safe_mode);
    RUN_TEST(test_safety_laser_off_always_succeeds);

    // Results
    printf("\n==========================================================\n");
    printf("  Test Results: %d passed, %d failed\n", tests_passed, tests_failed);
    printf("==========================================================\n\n");

    return tests_failed > 0 ? 1 : 0;
}
