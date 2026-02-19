/**
 * Button Handler Tests
 *
 * Tests debounce, short/long press detection, mode transitions, and callbacks.
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
    button_handler_cleanup(); \
    test_func(); \
    tests_passed++; \
    printf("  PASS\n"); \
} while(0)

// Test-only function declarations (defined in implementation)
extern void button_handler_test_simulate_press(bool pressed);
extern uint64_t button_handler_test_get_press_start(void);

// Time utility
static void sleep_ms(int ms) {
    usleep(ms * 1000);
}

// ============================================================================
// Callback tracking
// ============================================================================

static int event_callback_count = 0;
static button_event_t last_event = BUTTON_EVENT_NONE;
static int mode_callback_count = 0;
static system_mode_t last_old_mode = SYSTEM_MODE_DISARMED;
static system_mode_t last_new_mode = SYSTEM_MODE_DISARMED;

static void test_event_callback(button_event_t event, void *user_data) {
    (void)user_data;
    event_callback_count++;
    last_event = event;
}

static void test_mode_callback(system_mode_t old_mode, system_mode_t new_mode, void *user_data) {
    (void)user_data;
    mode_callback_count++;
    last_old_mode = old_mode;
    last_new_mode = new_mode;
}

static void reset_callbacks(void) {
    event_callback_count = 0;
    last_event = BUTTON_EVENT_NONE;
    mode_callback_count = 0;
    last_old_mode = SYSTEM_MODE_DISARMED;
    last_new_mode = SYSTEM_MODE_DISARMED;
}

// ============================================================================
// Initialization Tests
// ============================================================================

void test_init_without_buzzer(void) {
    button_status_t status = button_handler_init(false);
    TEST_ASSERT_EQ(status, BUTTON_OK, "Init should succeed");
    TEST_ASSERT(button_handler_is_initialized(), "Should be initialized");
    TEST_ASSERT(!button_handler_is_buzzer_enabled(), "Buzzer should be disabled");
}

void test_init_with_buzzer(void) {
    button_status_t status = button_handler_init(true);
    TEST_ASSERT_EQ(status, BUTTON_OK, "Init should succeed");
    TEST_ASSERT(button_handler_is_initialized(), "Should be initialized");
    TEST_ASSERT(button_handler_is_buzzer_enabled(), "Buzzer should be enabled");
}

void test_double_init_fails(void) {
    button_status_t status = button_handler_init(false);
    TEST_ASSERT_EQ(status, BUTTON_OK, "First init should succeed");

    status = button_handler_init(false);
    TEST_ASSERT_EQ(status, BUTTON_ERROR_ALREADY_INIT, "Second init should fail");
}

void test_initial_state_is_disarmed(void) {
    button_handler_init(false);
    TEST_ASSERT_EQ(button_handler_get_system_mode(), SYSTEM_MODE_DISARMED, "Initial mode should be disarmed");
    TEST_ASSERT(!button_handler_is_armed(), "Should not be armed");
    TEST_ASSERT(!button_handler_is_emergency_stop(), "Should not be emergency stop");
}

void test_initial_button_state_is_released(void) {
    button_handler_init(false);
    TEST_ASSERT_EQ(button_handler_get_button_state(), BUTTON_STATE_RELEASED, "Initial button state should be released");
}

// ============================================================================
// Mode Transition Tests
// ============================================================================

void test_arm_from_disarmed(void) {
    button_handler_init(false);
    button_status_t status = button_handler_arm();
    TEST_ASSERT_EQ(status, BUTTON_OK, "Arm should succeed");
    TEST_ASSERT_EQ(button_handler_get_system_mode(), SYSTEM_MODE_ARMED, "Mode should be armed");
    TEST_ASSERT(button_handler_is_armed(), "is_armed should be true");
}

void test_disarm_from_armed(void) {
    button_handler_init(false);
    button_handler_arm();
    button_status_t status = button_handler_disarm();
    TEST_ASSERT_EQ(status, BUTTON_OK, "Disarm should succeed");
    TEST_ASSERT_EQ(button_handler_get_system_mode(), SYSTEM_MODE_DISARMED, "Mode should be disarmed");
    TEST_ASSERT(!button_handler_is_armed(), "is_armed should be false");
}

void test_emergency_stop_from_armed(void) {
    button_handler_init(false);
    button_handler_arm();
    button_status_t status = button_handler_emergency_stop();
    TEST_ASSERT_EQ(status, BUTTON_OK, "Emergency stop should succeed");
    TEST_ASSERT_EQ(button_handler_get_system_mode(), SYSTEM_MODE_EMERGENCY_STOP, "Mode should be emergency stop");
    TEST_ASSERT(button_handler_is_emergency_stop(), "is_emergency_stop should be true");
}

void test_emergency_stop_from_disarmed(void) {
    button_handler_init(false);
    button_status_t status = button_handler_emergency_stop();
    TEST_ASSERT_EQ(status, BUTTON_OK, "Emergency stop should succeed");
    TEST_ASSERT(button_handler_is_emergency_stop(), "Should be in emergency stop");
}

void test_clear_emergency(void) {
    button_handler_init(false);
    button_handler_emergency_stop();
    button_status_t status = button_handler_clear_emergency();
    TEST_ASSERT_EQ(status, BUTTON_OK, "Clear emergency should succeed");
    TEST_ASSERT_EQ(button_handler_get_system_mode(), SYSTEM_MODE_DISARMED, "Mode should be disarmed after clearing");
    TEST_ASSERT(!button_handler_is_emergency_stop(), "Should not be emergency stop");
}

void test_clear_emergency_when_not_in_emergency(void) {
    button_handler_init(false);
    button_handler_arm();
    button_status_t status = button_handler_clear_emergency();
    TEST_ASSERT_EQ(status, BUTTON_OK, "Clear emergency should succeed even if not in emergency");
    TEST_ASSERT_EQ(button_handler_get_system_mode(), SYSTEM_MODE_ARMED, "Mode should remain armed");
}

void test_set_mode_directly(void) {
    button_handler_init(false);

    button_handler_set_mode(SYSTEM_MODE_ARMED);
    TEST_ASSERT_EQ(button_handler_get_system_mode(), SYSTEM_MODE_ARMED, "Mode should be armed");

    button_handler_set_mode(SYSTEM_MODE_EMERGENCY_STOP);
    TEST_ASSERT_EQ(button_handler_get_system_mode(), SYSTEM_MODE_EMERGENCY_STOP, "Mode should be emergency stop");

    button_handler_set_mode(SYSTEM_MODE_DISARMED);
    TEST_ASSERT_EQ(button_handler_get_system_mode(), SYSTEM_MODE_DISARMED, "Mode should be disarmed");
}

// ============================================================================
// Button Press Simulation Tests
// ============================================================================

void test_button_press_detection(void) {
    button_handler_init(false);

    // Simulate button press
    button_handler_test_simulate_press(true);
    sleep_ms(BUTTON_DEBOUNCE_MS + 10);
    button_handler_update();

    TEST_ASSERT_EQ(button_handler_get_button_state(), BUTTON_STATE_PRESSED, "Button should be pressed");
}

void test_button_release_detection(void) {
    button_handler_init(false);

    // Press and release
    button_handler_test_simulate_press(true);
    sleep_ms(BUTTON_DEBOUNCE_MS + 10);
    button_handler_update();

    button_handler_test_simulate_press(false);
    sleep_ms(BUTTON_DEBOUNCE_MS + 10);
    button_handler_update();

    TEST_ASSERT_EQ(button_handler_get_button_state(), BUTTON_STATE_RELEASED, "Button should be released");
}

void test_short_press_toggles_arm_state(void) {
    button_handler_init(false);
    reset_callbacks();
    button_handler_set_event_callback(test_event_callback, NULL);

    // Initial state: disarmed
    TEST_ASSERT_EQ(button_handler_get_system_mode(), SYSTEM_MODE_DISARMED, "Should start disarmed");

    // Short press to arm
    button_handler_test_simulate_press(true);
    sleep_ms(BUTTON_DEBOUNCE_MS + 10);
    button_handler_update();

    sleep_ms(100);  // Short press duration
    button_handler_test_simulate_press(false);
    sleep_ms(BUTTON_DEBOUNCE_MS + 10);
    button_handler_update();

    TEST_ASSERT_EQ(button_handler_get_system_mode(), SYSTEM_MODE_ARMED, "Should be armed after short press");
    TEST_ASSERT_EQ(last_event, BUTTON_EVENT_SHORT_PRESS, "Event should be short press");

    // Wait for undo window to expire
    sleep_ms(BUTTON_UNDO_WINDOW_MS + 100);

    // Short press to disarm
    reset_callbacks();
    button_handler_test_simulate_press(true);
    sleep_ms(BUTTON_DEBOUNCE_MS + 10);
    button_handler_update();

    sleep_ms(100);
    button_handler_test_simulate_press(false);
    sleep_ms(BUTTON_DEBOUNCE_MS + 10);
    button_handler_update();

    TEST_ASSERT_EQ(button_handler_get_system_mode(), SYSTEM_MODE_DISARMED, "Should be disarmed after second short press");
}

void test_long_press_triggers_emergency_stop(void) {
    button_handler_init(false);
    reset_callbacks();
    button_handler_set_event_callback(test_event_callback, NULL);

    // Long press
    button_handler_test_simulate_press(true);
    sleep_ms(BUTTON_DEBOUNCE_MS + 10);
    button_handler_update();

    // Wait for long press duration
    sleep_ms(BUTTON_LONG_PRESS_MS + 100);
    button_handler_update();

    TEST_ASSERT_EQ(button_handler_get_button_state(), BUTTON_STATE_HELD, "Button state should be HELD");
    TEST_ASSERT_EQ(button_handler_get_system_mode(), SYSTEM_MODE_EMERGENCY_STOP, "Should be in emergency stop");
    TEST_ASSERT_EQ(last_event, BUTTON_EVENT_LONG_PRESS, "Event should be long press");
}

void test_short_press_clears_emergency(void) {
    button_handler_init(false);
    button_handler_emergency_stop();

    // Short press to clear emergency
    button_handler_test_simulate_press(true);
    sleep_ms(BUTTON_DEBOUNCE_MS + 10);
    button_handler_update();

    sleep_ms(100);
    button_handler_test_simulate_press(false);
    sleep_ms(BUTTON_DEBOUNCE_MS + 10);
    button_handler_update();

    TEST_ASSERT_EQ(button_handler_get_system_mode(), SYSTEM_MODE_DISARMED, "Should be disarmed after clearing emergency");
}

void test_emergency_stop_when_armed(void) {
    button_handler_init(false);
    reset_callbacks();
    button_handler_set_event_callback(test_event_callback, NULL);

    // First arm the system
    button_handler_arm();
    TEST_ASSERT(button_handler_is_armed(), "Should be armed");

    // Trigger long press for emergency stop while armed (most critical use case)
    button_handler_test_simulate_press(true);
    sleep_ms(BUTTON_DEBOUNCE_MS + 10);
    button_handler_update();

    // Wait for long press duration
    sleep_ms(BUTTON_LONG_PRESS_MS + 100);
    button_handler_update();

    TEST_ASSERT(button_handler_is_emergency_stop(), "Should be in emergency stop");
    TEST_ASSERT(!button_handler_is_armed(), "Should no longer be armed");
    TEST_ASSERT_EQ(last_event, BUTTON_EVENT_LONG_PRESS, "Event should be long press");
}

void test_debounce_rejects_rapid_changes(void) {
    button_handler_init(false);
    button_stats_t stats;

    // Very rapid press/release (faster than debounce)
    button_handler_test_simulate_press(true);
    sleep_ms(10);  // Less than debounce time
    button_handler_update();
    button_handler_test_simulate_press(false);
    sleep_ms(10);
    button_handler_update();

    button_handler_get_stats(&stats);
    TEST_ASSERT(stats.debounce_reject_count > 0, "Debounce should have rejected some changes");
}

void test_undo_within_window(void) {
    button_handler_init(false);
    reset_callbacks();
    button_handler_set_event_callback(test_event_callback, NULL);

    // First short press - arm
    button_handler_test_simulate_press(true);
    sleep_ms(BUTTON_DEBOUNCE_MS + 10);
    button_handler_update();
    sleep_ms(100);
    button_handler_test_simulate_press(false);
    sleep_ms(BUTTON_DEBOUNCE_MS + 10);
    button_handler_update();

    TEST_ASSERT_EQ(button_handler_get_system_mode(), SYSTEM_MODE_ARMED, "Should be armed");

    // Quick second press (within undo window) - should undo
    reset_callbacks();
    sleep_ms(500);  // Within undo window (2000ms)

    button_handler_test_simulate_press(true);
    sleep_ms(BUTTON_DEBOUNCE_MS + 10);
    button_handler_update();
    sleep_ms(100);
    button_handler_test_simulate_press(false);
    sleep_ms(BUTTON_DEBOUNCE_MS + 10);
    button_handler_update();

    TEST_ASSERT_EQ(button_handler_get_system_mode(), SYSTEM_MODE_DISARMED, "Should be back to disarmed (undo)");
    TEST_ASSERT_EQ(last_event, BUTTON_EVENT_UNDO, "Event should be undo");
}

// ============================================================================
// Callback Tests
// ============================================================================

void test_event_callback_invoked(void) {
    button_handler_init(false);
    reset_callbacks();
    button_handler_set_event_callback(test_event_callback, NULL);

    // Trigger a short press
    button_handler_test_simulate_press(true);
    sleep_ms(BUTTON_DEBOUNCE_MS + 10);
    button_handler_update();
    sleep_ms(100);
    button_handler_test_simulate_press(false);
    sleep_ms(BUTTON_DEBOUNCE_MS + 10);
    button_handler_update();

    TEST_ASSERT(event_callback_count > 0, "Event callback should have been invoked");
    TEST_ASSERT_EQ(last_event, BUTTON_EVENT_SHORT_PRESS, "Last event should be short press");
}

void test_mode_callback_invoked(void) {
    button_handler_init(false);
    reset_callbacks();
    button_handler_set_mode_callback(test_mode_callback, NULL);

    button_handler_arm();

    TEST_ASSERT(mode_callback_count > 0, "Mode callback should have been invoked");
    TEST_ASSERT_EQ(last_old_mode, SYSTEM_MODE_DISARMED, "Old mode should be disarmed");
    TEST_ASSERT_EQ(last_new_mode, SYSTEM_MODE_ARMED, "New mode should be armed");
}

void test_null_callbacks_allowed(void) {
    button_handler_init(false);
    button_handler_set_event_callback(NULL, NULL);
    button_handler_set_mode_callback(NULL, NULL);

    // Should not crash
    button_handler_arm();
    button_handler_disarm();
}

// ============================================================================
// Buzzer Tests
// ============================================================================

void test_buzzer_enable_disable(void) {
    button_handler_init(true);
    TEST_ASSERT(button_handler_is_buzzer_enabled(), "Buzzer should be enabled initially");

    button_handler_set_buzzer_enabled(false);
    TEST_ASSERT(!button_handler_is_buzzer_enabled(), "Buzzer should be disabled");

    button_handler_set_buzzer_enabled(true);
    TEST_ASSERT(button_handler_is_buzzer_enabled(), "Buzzer should be enabled again");
}

void test_buzzer_function_does_not_crash(void) {
    button_handler_init(true);
    button_handler_buzzer(1000, 100);  // Should not crash

    button_handler_set_buzzer_enabled(false);
    button_handler_buzzer(1000, 100);  // Should not crash when disabled
}

// ============================================================================
// Statistics Tests
// ============================================================================

void test_stats_initial_values(void) {
    button_handler_init(false);
    button_stats_t stats;
    button_status_t status = button_handler_get_stats(&stats);

    TEST_ASSERT_EQ(status, BUTTON_OK, "Get stats should succeed");
    TEST_ASSERT_EQ(stats.short_press_count, 0, "Short press count should be 0");
    TEST_ASSERT_EQ(stats.long_press_count, 0, "Long press count should be 0");
    TEST_ASSERT_EQ(stats.undo_count, 0, "Undo count should be 0");
    TEST_ASSERT_EQ(stats.arm_count, 0, "Arm count should be 0");
    TEST_ASSERT_EQ(stats.disarm_count, 0, "Disarm count should be 0");
    TEST_ASSERT_EQ(stats.emergency_count, 0, "Emergency count should be 0");
}

void test_stats_tracks_arm_disarm(void) {
    button_handler_init(false);

    button_handler_arm();
    button_handler_disarm();
    button_handler_arm();
    button_handler_emergency_stop();

    button_stats_t stats;
    button_handler_get_stats(&stats);

    TEST_ASSERT_EQ(stats.arm_count, 2, "Arm count should be 2");
    TEST_ASSERT_EQ(stats.disarm_count, 1, "Disarm count should be 1");
    TEST_ASSERT_EQ(stats.emergency_count, 1, "Emergency count should be 1");
}

void test_stats_uptime_increases(void) {
    button_handler_init(false);

    button_stats_t stats1, stats2;
    button_handler_get_stats(&stats1);
    sleep_ms(100);
    button_handler_get_stats(&stats2);

    TEST_ASSERT(stats2.uptime_ms >= stats1.uptime_ms, "Uptime should increase over time");
}

void test_stats_not_initialized_error(void) {
    button_stats_t stats;
    button_status_t status = button_handler_get_stats(&stats);
    TEST_ASSERT_EQ(status, BUTTON_ERROR_NOT_INITIALIZED, "Should return not initialized error");
}

void test_stats_null_param_error(void) {
    button_handler_init(false);
    button_status_t status = button_handler_get_stats(NULL);
    TEST_ASSERT_EQ(status, BUTTON_ERROR_INVALID_PARAM, "Should return invalid param error");
}

// ============================================================================
// Name Conversion Tests
// ============================================================================

void test_button_state_name(void) {
    TEST_ASSERT(strcmp(button_state_name(BUTTON_STATE_RELEASED), "RELEASED") == 0, "RELEASED name");
    TEST_ASSERT(strcmp(button_state_name(BUTTON_STATE_PRESSED), "PRESSED") == 0, "PRESSED name");
    TEST_ASSERT(strcmp(button_state_name(BUTTON_STATE_HELD), "HELD") == 0, "HELD name");
    TEST_ASSERT(strcmp(button_state_name(99), "UNKNOWN") == 0, "Unknown state name");
}

void test_system_mode_name(void) {
    TEST_ASSERT(strcmp(system_mode_name(SYSTEM_MODE_DISARMED), "DISARMED") == 0, "DISARMED name");
    TEST_ASSERT(strcmp(system_mode_name(SYSTEM_MODE_ARMED), "ARMED") == 0, "ARMED name");
    TEST_ASSERT(strcmp(system_mode_name(SYSTEM_MODE_EMERGENCY_STOP), "EMERGENCY_STOP") == 0, "EMERGENCY_STOP name");
    TEST_ASSERT(strcmp(system_mode_name(99), "UNKNOWN") == 0, "Unknown mode name");
}

void test_button_event_name(void) {
    TEST_ASSERT(strcmp(button_event_name(BUTTON_EVENT_NONE), "NONE") == 0, "NONE name");
    TEST_ASSERT(strcmp(button_event_name(BUTTON_EVENT_SHORT_PRESS), "SHORT_PRESS") == 0, "SHORT_PRESS name");
    TEST_ASSERT(strcmp(button_event_name(BUTTON_EVENT_LONG_PRESS), "LONG_PRESS") == 0, "LONG_PRESS name");
    TEST_ASSERT(strcmp(button_event_name(BUTTON_EVENT_UNDO), "UNDO") == 0, "UNDO name");
    TEST_ASSERT(strcmp(button_event_name(99), "UNKNOWN") == 0, "Unknown event name");
}

void test_button_status_name(void) {
    TEST_ASSERT(strcmp(button_status_name(BUTTON_OK), "OK") == 0, "OK name");
    TEST_ASSERT(strcmp(button_status_name(BUTTON_ERROR_NOT_INITIALIZED), "NOT_INITIALIZED") == 0, "NOT_INITIALIZED name");
    TEST_ASSERT(strcmp(button_status_name(BUTTON_ERROR_INVALID_PARAM), "INVALID_PARAM") == 0, "INVALID_PARAM name");
    TEST_ASSERT(strcmp(button_status_name(BUTTON_ERROR_HARDWARE), "HARDWARE") == 0, "HARDWARE name");
    TEST_ASSERT(strcmp(button_status_name(BUTTON_ERROR_ALREADY_INIT), "ALREADY_INIT") == 0, "ALREADY_INIT name");
    TEST_ASSERT(strcmp(button_status_name(99), "UNKNOWN") == 0, "Unknown status name");
}

// ============================================================================
// Cleanup Tests
// ============================================================================

void test_cleanup_resets_state(void) {
    button_handler_init(false);
    button_handler_arm();
    button_handler_cleanup();

    TEST_ASSERT(!button_handler_is_initialized(), "Should not be initialized after cleanup");
}

void test_cleanup_when_not_initialized(void) {
    // Should not crash
    button_handler_cleanup();
    TEST_ASSERT(!button_handler_is_initialized(), "Should not be initialized");
}

void test_operations_fail_after_cleanup(void) {
    button_handler_init(false);
    button_handler_cleanup();

    button_status_t status = button_handler_arm();
    TEST_ASSERT_EQ(status, BUTTON_ERROR_NOT_INITIALIZED, "Arm should fail after cleanup");
}

// ============================================================================
// Edge Cases
// ============================================================================

void test_medium_press_ignored(void) {
    button_handler_init(false);
    reset_callbacks();
    button_handler_set_event_callback(test_event_callback, NULL);

    // Initial state: disarmed
    system_mode_t initial_mode = button_handler_get_system_mode();

    // Press for medium duration (between 1s and 3s - not short, not long)
    button_handler_test_simulate_press(true);
    sleep_ms(BUTTON_DEBOUNCE_MS + 10);
    button_handler_update();

    sleep_ms(1500);  // 1.5 seconds - longer than short, shorter than long
    button_handler_update();  // Check for long press (shouldn't trigger yet)

    button_handler_test_simulate_press(false);
    sleep_ms(BUTTON_DEBOUNCE_MS + 10);
    button_handler_update();

    // Mode should not have changed (medium press is ignored)
    TEST_ASSERT_EQ(button_handler_get_system_mode(), initial_mode, "Mode should not change on medium press");
    TEST_ASSERT_EQ(event_callback_count, 0, "No event should be generated for medium press");
}

void test_rapid_presses_debounced(void) {
    button_handler_init(false);

    // Simulate very rapid presses
    for (int i = 0; i < 10; i++) {
        button_handler_test_simulate_press(true);
        button_handler_update();
        button_handler_test_simulate_press(false);
        button_handler_update();
    }

    button_stats_t stats;
    button_handler_get_stats(&stats);

    // Most should have been rejected by debounce
    TEST_ASSERT(stats.debounce_reject_count > 0, "Should have debounce rejections");
}

void test_update_when_not_initialized(void) {
    // Should not crash
    button_handler_update();
}

void test_undo_not_triggered_after_window(void) {
    button_handler_init(false);
    reset_callbacks();
    button_handler_set_event_callback(test_event_callback, NULL);

    // First short press - arm
    button_handler_test_simulate_press(true);
    sleep_ms(BUTTON_DEBOUNCE_MS + 10);
    button_handler_update();
    sleep_ms(100);
    button_handler_test_simulate_press(false);
    sleep_ms(BUTTON_DEBOUNCE_MS + 10);
    button_handler_update();

    TEST_ASSERT_EQ(button_handler_get_system_mode(), SYSTEM_MODE_ARMED, "Should be armed");

    // Wait for undo window to expire
    sleep_ms(BUTTON_UNDO_WINDOW_MS + 100);

    // Second press should toggle, not undo
    reset_callbacks();
    button_handler_test_simulate_press(true);
    sleep_ms(BUTTON_DEBOUNCE_MS + 10);
    button_handler_update();
    sleep_ms(100);
    button_handler_test_simulate_press(false);
    sleep_ms(BUTTON_DEBOUNCE_MS + 10);
    button_handler_update();

    TEST_ASSERT_EQ(button_handler_get_system_mode(), SYSTEM_MODE_DISARMED, "Should be disarmed (toggled)");
    TEST_ASSERT_EQ(last_event, BUTTON_EVENT_SHORT_PRESS, "Event should be short press, not undo");
}

// ============================================================================
// Main
// ============================================================================

int main(void) {
    printf("\n==========================================================\n");
    printf("  Button Handler Tests\n");
    printf("==========================================================\n\n");

    // Initialization Tests
    printf("--- Initialization Tests ---\n");
    RUN_TEST(test_init_without_buzzer);
    RUN_TEST(test_init_with_buzzer);
    RUN_TEST(test_double_init_fails);
    RUN_TEST(test_initial_state_is_disarmed);
    RUN_TEST(test_initial_button_state_is_released);

    // Mode Transition Tests
    printf("\n--- Mode Transition Tests ---\n");
    RUN_TEST(test_arm_from_disarmed);
    RUN_TEST(test_disarm_from_armed);
    RUN_TEST(test_emergency_stop_from_armed);
    RUN_TEST(test_emergency_stop_from_disarmed);
    RUN_TEST(test_clear_emergency);
    RUN_TEST(test_clear_emergency_when_not_in_emergency);
    RUN_TEST(test_set_mode_directly);

    // Button Press Simulation Tests
    printf("\n--- Button Press Simulation Tests ---\n");
    RUN_TEST(test_button_press_detection);
    RUN_TEST(test_button_release_detection);
    RUN_TEST(test_short_press_toggles_arm_state);
    RUN_TEST(test_long_press_triggers_emergency_stop);
    RUN_TEST(test_emergency_stop_when_armed);
    RUN_TEST(test_short_press_clears_emergency);
    RUN_TEST(test_debounce_rejects_rapid_changes);
    RUN_TEST(test_undo_within_window);

    // Callback Tests
    printf("\n--- Callback Tests ---\n");
    RUN_TEST(test_event_callback_invoked);
    RUN_TEST(test_mode_callback_invoked);
    RUN_TEST(test_null_callbacks_allowed);

    // Buzzer Tests
    printf("\n--- Buzzer Tests ---\n");
    RUN_TEST(test_buzzer_enable_disable);
    RUN_TEST(test_buzzer_function_does_not_crash);

    // Statistics Tests
    printf("\n--- Statistics Tests ---\n");
    RUN_TEST(test_stats_initial_values);
    RUN_TEST(test_stats_tracks_arm_disarm);
    RUN_TEST(test_stats_uptime_increases);
    RUN_TEST(test_stats_not_initialized_error);
    RUN_TEST(test_stats_null_param_error);

    // Name Conversion Tests
    printf("\n--- Name Conversion Tests ---\n");
    RUN_TEST(test_button_state_name);
    RUN_TEST(test_system_mode_name);
    RUN_TEST(test_button_event_name);
    RUN_TEST(test_button_status_name);

    // Cleanup Tests
    printf("\n--- Cleanup Tests ---\n");
    RUN_TEST(test_cleanup_resets_state);
    RUN_TEST(test_cleanup_when_not_initialized);
    RUN_TEST(test_operations_fail_after_cleanup);

    // Edge Cases
    printf("\n--- Edge Cases ---\n");
    RUN_TEST(test_medium_press_ignored);
    RUN_TEST(test_rapid_presses_debounced);
    RUN_TEST(test_update_when_not_initialized);
    RUN_TEST(test_undo_not_triggered_after_window);

    // Results
    printf("\n==========================================================\n");
    printf("  Test Results: %d passed, %d failed\n", tests_passed, tests_failed);
    printf("==========================================================\n\n");

    return tests_failed > 0 ? 1 : 0;
}
