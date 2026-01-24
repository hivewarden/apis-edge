/**
 * Unit tests for Laser Controller.
 */

#include "laser_controller.h"
#include "log.h"
#include "platform.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

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
// Callback Tracking
// ============================================================================

static int state_callback_count = 0;
static laser_state_t last_callback_state = LASER_STATE_OFF;

static void state_callback(laser_state_t state, void *user_data) {
    (void)user_data;
    state_callback_count++;
    last_callback_state = state;
}

static int timeout_callback_count = 0;
static uint32_t last_timeout_duration = 0;

static void timeout_callback(uint32_t duration_ms, void *user_data) {
    (void)user_data;
    timeout_callback_count++;
    last_timeout_duration = duration_ms;
}

static void reset_callback_tracking(void) {
    state_callback_count = 0;
    last_callback_state = LASER_STATE_OFF;
    timeout_callback_count = 0;
    last_timeout_duration = 0;
}

// ============================================================================
// Test: Status Names
// ============================================================================

static void test_status_names(void) {
    TEST_SECTION("Status Names");

    TEST_ASSERT(strcmp(laser_status_name(LASER_OK), "OK") == 0,
                "LASER_OK has correct name");
    TEST_ASSERT(strcmp(laser_status_name(LASER_ERROR_NOT_INITIALIZED), "NOT_INITIALIZED") == 0,
                "LASER_ERROR_NOT_INITIALIZED has correct name");
    TEST_ASSERT(strcmp(laser_status_name(LASER_ERROR_NOT_ARMED), "NOT_ARMED") == 0,
                "LASER_ERROR_NOT_ARMED has correct name");
    TEST_ASSERT(strcmp(laser_status_name(LASER_ERROR_COOLDOWN), "COOLDOWN") == 0,
                "LASER_ERROR_COOLDOWN has correct name");
    TEST_ASSERT(strcmp(laser_status_name(LASER_ERROR_MAX_TIME), "MAX_TIME") == 0,
                "LASER_ERROR_MAX_TIME has correct name");
    TEST_ASSERT(strcmp(laser_status_name(LASER_ERROR_KILL_SWITCH), "KILL_SWITCH") == 0,
                "LASER_ERROR_KILL_SWITCH has correct name");
    TEST_ASSERT(strcmp(laser_status_name(LASER_ERROR_HARDWARE), "HARDWARE") == 0,
                "LASER_ERROR_HARDWARE has correct name");
    TEST_ASSERT(strcmp(laser_status_name((laser_status_t)99), "UNKNOWN") == 0,
                "Unknown status returns UNKNOWN");
}

// ============================================================================
// Test: State Names
// ============================================================================

static void test_state_names(void) {
    TEST_SECTION("State Names");

    TEST_ASSERT(strcmp(laser_state_name(LASER_STATE_OFF), "OFF") == 0,
                "OFF state has correct name");
    TEST_ASSERT(strcmp(laser_state_name(LASER_STATE_ARMED), "ARMED") == 0,
                "ARMED state has correct name");
    TEST_ASSERT(strcmp(laser_state_name(LASER_STATE_ACTIVE), "ACTIVE") == 0,
                "ACTIVE state has correct name");
    TEST_ASSERT(strcmp(laser_state_name(LASER_STATE_COOLDOWN), "COOLDOWN") == 0,
                "COOLDOWN state has correct name");
    TEST_ASSERT(strcmp(laser_state_name(LASER_STATE_EMERGENCY_STOP), "EMERGENCY_STOP") == 0,
                "EMERGENCY_STOP state has correct name");
    TEST_ASSERT(strcmp(laser_state_name(LASER_STATE_ERROR), "ERROR") == 0,
                "ERROR state has correct name");
    TEST_ASSERT(strcmp(laser_state_name((laser_state_t)99), "UNKNOWN") == 0,
                "Unknown state returns UNKNOWN");
}

// ============================================================================
// Test: Initialization
// ============================================================================

static void test_initialization(void) {
    TEST_SECTION("Initialization");

    TEST_ASSERT(laser_controller_is_initialized() == false,
                "Not initialized before init()");

    laser_status_t status = laser_controller_init();
    TEST_ASSERT(status == LASER_OK, "Init returns OK");
    TEST_ASSERT(laser_controller_is_initialized() == true,
                "Is initialized after init()");

    // Check initial state
    TEST_ASSERT(laser_controller_get_state() == LASER_STATE_OFF,
                "Initial state is OFF");
    TEST_ASSERT(laser_controller_is_armed() == false,
                "Initially not armed");
    TEST_ASSERT(laser_controller_is_active() == false,
                "Initially not active");
    TEST_ASSERT(laser_controller_is_kill_switch_engaged() == false,
                "Kill switch not engaged initially");

    // Double init
    status = laser_controller_init();
    TEST_ASSERT(status == LASER_OK, "Double init returns OK");

    laser_controller_cleanup();
    TEST_ASSERT(laser_controller_is_initialized() == false,
                "Not initialized after cleanup");
}

// ============================================================================
// Test: Arm and Disarm
// ============================================================================

static void test_arm_disarm(void) {
    TEST_SECTION("Arm and Disarm");

    laser_controller_init();

    // Arm
    laser_controller_arm();
    TEST_ASSERT(laser_controller_is_armed() == true, "Armed after arm()");
    TEST_ASSERT(laser_controller_get_state() == LASER_STATE_ARMED,
                "State is ARMED");

    // Disarm
    laser_controller_disarm();
    TEST_ASSERT(laser_controller_is_armed() == false, "Not armed after disarm()");
    TEST_ASSERT(laser_controller_get_state() == LASER_STATE_OFF,
                "State is OFF after disarm");

    laser_controller_cleanup();
}

// ============================================================================
// Test: Laser On/Off
// ============================================================================

static void test_laser_on_off(void) {
    TEST_SECTION("Laser On/Off");

    laser_controller_init();

    // Try to turn on without arming
    laser_status_t status = laser_controller_on();
    TEST_ASSERT(status == LASER_ERROR_NOT_ARMED, "On without arm fails");
    TEST_ASSERT(laser_controller_is_active() == false, "Laser not active");

    // Arm and turn on
    laser_controller_arm();
    status = laser_controller_on();
    TEST_ASSERT(status == LASER_OK, "On after arm succeeds");
    TEST_ASSERT(laser_controller_is_active() == true, "Laser is active");
    TEST_ASSERT(laser_controller_get_state() == LASER_STATE_ACTIVE,
                "State is ACTIVE");

    // Double on is OK
    status = laser_controller_on();
    TEST_ASSERT(status == LASER_OK, "Double on returns OK");

    // Turn off
    laser_controller_off();
    TEST_ASSERT(laser_controller_is_active() == false, "Laser not active after off");

    // State should be COOLDOWN since we're still armed
    TEST_ASSERT(laser_controller_get_state() == LASER_STATE_COOLDOWN,
                "State is COOLDOWN after off");

    laser_controller_cleanup();
}

// ============================================================================
// Test: Cooldown Period
// ============================================================================

static void test_cooldown(void) {
    TEST_SECTION("Cooldown Period");

    laser_controller_init();
    laser_controller_arm();

    // Turn on and off
    laser_controller_on();
    laser_controller_off();

    // Should be in cooldown
    TEST_ASSERT(laser_controller_is_in_cooldown() == true, "In cooldown");
    TEST_ASSERT(laser_controller_get_cooldown_remaining() > 0, "Cooldown remaining > 0");

    // Try to turn on during cooldown
    laser_status_t status = laser_controller_on();
    TEST_ASSERT(status == LASER_ERROR_COOLDOWN, "On during cooldown fails");

    // Get statistics
    laser_stats_t stats;
    laser_controller_get_stats(&stats);
    TEST_ASSERT(stats.cooldown_block_count == 1, "Cooldown block counted");

    laser_controller_cleanup();
}

// ============================================================================
// Test: Kill Switch
// ============================================================================

static void test_kill_switch(void) {
    TEST_SECTION("Kill Switch");

    laser_controller_init();
    laser_controller_arm();
    laser_controller_on();

    TEST_ASSERT(laser_controller_is_active() == true, "Laser active before kill switch");

    // Engage kill switch
    laser_controller_kill_switch();

    TEST_ASSERT(laser_controller_is_active() == false, "Laser off after kill switch");
    TEST_ASSERT(laser_controller_is_kill_switch_engaged() == true, "Kill switch engaged");
    TEST_ASSERT(laser_controller_get_state() == LASER_STATE_EMERGENCY_STOP,
                "State is EMERGENCY_STOP");
    TEST_ASSERT(laser_controller_is_armed() == false, "Not armed after kill switch");

    // Cannot arm while kill switch engaged
    laser_controller_arm();
    TEST_ASSERT(laser_controller_is_armed() == false, "Cannot arm with kill switch");

    // Cannot turn on
    laser_status_t status = laser_controller_on();
    TEST_ASSERT(status == LASER_ERROR_KILL_SWITCH, "On with kill switch fails");

    // Reset kill switch
    laser_controller_reset_kill_switch();
    TEST_ASSERT(laser_controller_is_kill_switch_engaged() == false, "Kill switch reset");
    TEST_ASSERT(laser_controller_get_state() == LASER_STATE_OFF, "State is OFF after reset");

    // Can arm again
    laser_controller_arm();
    TEST_ASSERT(laser_controller_is_armed() == true, "Can arm after kill switch reset");

    // Get statistics
    laser_stats_t stats;
    laser_controller_get_stats(&stats);
    TEST_ASSERT(stats.kill_switch_count == 1, "Kill switch count is 1");

    laser_controller_cleanup();
}

// ============================================================================
// Test: Disarm Turns Off Laser
// ============================================================================

static void test_disarm_turns_off(void) {
    TEST_SECTION("Disarm Turns Off Laser");

    laser_controller_init();
    laser_controller_arm();
    laser_controller_on();

    TEST_ASSERT(laser_controller_is_active() == true, "Laser active");

    // Disarm should turn off laser
    laser_controller_disarm();

    TEST_ASSERT(laser_controller_is_active() == false, "Laser off after disarm");
    TEST_ASSERT(laser_controller_is_armed() == false, "Not armed");
    TEST_ASSERT(laser_controller_get_state() == LASER_STATE_OFF, "State is OFF");

    laser_controller_cleanup();
}

// ============================================================================
// Test: On-Time Tracking
// ============================================================================

static void test_on_time_tracking(void) {
    TEST_SECTION("On-Time Tracking");

    laser_controller_init();
    laser_controller_arm();

    // Not active - should be 0
    TEST_ASSERT(laser_controller_get_current_on_time() == 0,
                "On time is 0 when not active");
    TEST_ASSERT(laser_controller_get_on_time_remaining() == 0,
                "Remaining time is 0 when not active");

    // Turn on
    laser_controller_on();

    // Wait a bit
    apis_sleep_ms(100);

    uint32_t on_time = laser_controller_get_current_on_time();
    TEST_ASSERT(on_time >= 50 && on_time <= 200, "On time is approximately correct");

    uint32_t remaining = laser_controller_get_on_time_remaining();
    TEST_ASSERT(remaining > 0 && remaining < LASER_MAX_ON_TIME_MS,
                "Remaining time is reasonable");
    TEST_ASSERT(on_time + remaining >= LASER_MAX_ON_TIME_MS - 100,
                "On time + remaining ≈ max time");

    laser_controller_off();

    laser_controller_cleanup();
}

// ============================================================================
// Test: Statistics
// ============================================================================

static void test_statistics(void) {
    TEST_SECTION("Statistics");

    laser_controller_init();

    laser_stats_t stats;
    laser_status_t status = laser_controller_get_stats(&stats);
    TEST_ASSERT(status == LASER_OK, "Get stats returns OK");
    TEST_ASSERT(stats.activation_count == 0, "Initial activation count is 0");
    TEST_ASSERT(stats.safety_timeout_count == 0, "Initial timeout count is 0");

    // Do some activations
    laser_controller_arm();

    laser_controller_on();
    apis_sleep_ms(50);
    laser_controller_off();

    // Wait for cooldown
    apis_sleep_ms(LASER_COOLDOWN_MS + 100);
    laser_controller_update();

    laser_controller_on();
    apis_sleep_ms(50);
    laser_controller_off();

    laser_controller_get_stats(&stats);
    TEST_ASSERT(stats.activation_count == 2, "Activation count is 2");
    TEST_ASSERT(stats.total_on_time_ms >= 100, "Total on time tracked");
    TEST_ASSERT(stats.last_activation > 0, "Last activation timestamp set");

    // Null pointer test
    status = laser_controller_get_stats(NULL);
    TEST_ASSERT(status == LASER_ERROR_HARDWARE, "Get stats with NULL fails");

    laser_controller_cleanup();
}

// ============================================================================
// Test: State Callback
// ============================================================================

static void test_state_callback(void) {
    TEST_SECTION("State Callback");

    reset_callback_tracking();

    laser_controller_init();
    laser_controller_set_state_callback(state_callback, NULL);

    laser_controller_arm();
    TEST_ASSERT(state_callback_count == 1, "Callback invoked on arm");
    TEST_ASSERT(last_callback_state == LASER_STATE_ARMED, "Callback got ARMED state");

    laser_controller_on();
    TEST_ASSERT(state_callback_count == 2, "Callback invoked on on");
    TEST_ASSERT(last_callback_state == LASER_STATE_ACTIVE, "Callback got ACTIVE state");

    laser_controller_off();
    TEST_ASSERT(state_callback_count == 3, "Callback invoked on off");
    TEST_ASSERT(last_callback_state == LASER_STATE_COOLDOWN, "Callback got COOLDOWN state");

    // Clear callback
    laser_controller_set_state_callback(NULL, NULL);
    laser_controller_disarm();
    TEST_ASSERT(state_callback_count == 3, "No callback after cleared");

    laser_controller_cleanup();
}

// ============================================================================
// Test: Not Initialized Errors
// ============================================================================

static void test_not_initialized(void) {
    TEST_SECTION("Not Initialized Errors");

    if (laser_controller_is_initialized()) {
        laser_controller_cleanup();
    }

    laser_status_t status = laser_controller_on();
    TEST_ASSERT(status == LASER_ERROR_NOT_INITIALIZED, "On before init fails");

    laser_stats_t stats;
    status = laser_controller_get_stats(&stats);
    TEST_ASSERT(status == LASER_ERROR_NOT_INITIALIZED, "Get stats before init fails");

    TEST_ASSERT(laser_controller_is_armed() == false, "Is armed returns false");
    TEST_ASSERT(laser_controller_is_active() == false, "Is active returns false");
    TEST_ASSERT(laser_controller_get_state() == LASER_STATE_OFF, "Get state returns OFF");
    TEST_ASSERT(laser_controller_is_kill_switch_engaged() == false, "Kill switch returns false");
    TEST_ASSERT(laser_controller_is_in_cooldown() == false, "Cooldown returns false");
    TEST_ASSERT(laser_controller_get_cooldown_remaining() == 0, "Cooldown remaining is 0");
    TEST_ASSERT(laser_controller_get_on_time_remaining() == 0, "On time remaining is 0");
    TEST_ASSERT(laser_controller_get_current_on_time() == 0, "Current on time is 0");
}

// ============================================================================
// Test: Cleanup Safety
// ============================================================================

static void test_cleanup_safety(void) {
    TEST_SECTION("Cleanup Safety");

    // Cleanup when not initialized
    laser_controller_cleanup();
    TEST_ASSERT(laser_controller_is_initialized() == false, "Cleanup when not init is safe");

    // Initialize and cleanup
    laser_controller_init();
    laser_controller_cleanup();
    TEST_ASSERT(laser_controller_is_initialized() == false, "Cleanup after init works");

    // Double cleanup
    laser_controller_cleanup();
    TEST_ASSERT(laser_controller_is_initialized() == false, "Double cleanup is safe");
}

// ============================================================================
// Test: Off is Always Safe
// ============================================================================

static void test_off_always_safe(void) {
    TEST_SECTION("Off is Always Safe");

    // Off when not initialized - should not crash
    laser_controller_off();

    laser_controller_init();

    // Off when not on - should not crash
    laser_controller_off();

    // Off when armed but not active
    laser_controller_arm();
    laser_controller_off();

    TEST_ASSERT(laser_controller_get_state() == LASER_STATE_ARMED,
                "Still armed after off when not active");

    laser_controller_cleanup();
}

// ============================================================================
// Test: Multiple Arm/Disarm
// ============================================================================

static void test_multiple_arm_disarm(void) {
    TEST_SECTION("Multiple Arm/Disarm");

    laser_controller_init();

    // Multiple arms
    laser_controller_arm();
    laser_controller_arm();
    laser_controller_arm();
    TEST_ASSERT(laser_controller_is_armed() == true, "Still armed after multiple arms");

    // Multiple disarms
    laser_controller_disarm();
    laser_controller_disarm();
    TEST_ASSERT(laser_controller_is_armed() == false, "Not armed after multiple disarms");

    laser_controller_cleanup();
}

// ============================================================================
// Main Test Runner
// ============================================================================

int main(int argc, char *argv[]) {
    (void)argc;
    (void)argv;

    printf("\n");
    printf("==========================================================\n");
    printf("  APIS Edge - Laser Controller Unit Tests\n");
    printf("==========================================================\n");

    // Run all tests
    test_status_names();
    test_state_names();
    test_not_initialized();
    test_initialization();
    test_arm_disarm();
    test_laser_on_off();
    test_cooldown();
    test_kill_switch();
    test_disarm_turns_off();
    test_on_time_tracking();
    test_statistics();
    test_state_callback();
    test_off_always_safe();
    test_multiple_arm_disarm();
    test_cleanup_safety();

    // Summary
    printf("\n==========================================================\n");
    printf("  Test Results: %d passed, %d failed\n",
           tests_passed, tests_failed);
    printf("==========================================================\n\n");

    return tests_failed > 0 ? 1 : 0;
}
