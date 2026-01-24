/**
 * LED Controller Tests.
 *
 * Tests all LED states and patterns:
 * - State setting/clearing
 * - Priority system
 * - Detection flash
 * - Pattern timing
 */

#include "led_controller.h"
#include "log.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

// ============================================================================
// Test Framework
// ============================================================================

static int tests_passed = 0;
static int tests_failed = 0;

#define TEST_ASSERT(cond, msg) do { \
    if (cond) { \
        printf("  PASS: %s\n", msg); \
        tests_passed++; \
    } else { \
        printf("  FAIL: %s\n", msg); \
        tests_failed++; \
    } \
} while(0)

// ============================================================================
// Test: Initialization
// ============================================================================

static void test_initialization(void) {
    printf("\n--- Test: Initialization ---\n");

    // Not initialized initially
    TEST_ASSERT(!led_controller_is_initialized(), "Not initialized initially");

    // Init succeeds
    int result = led_controller_init();
    TEST_ASSERT(result == 0, "Init returns 0");
    TEST_ASSERT(led_controller_is_initialized(), "Is initialized after init");

    // Initial state is OFF
    TEST_ASSERT(led_controller_get_state() == LED_STATE_OFF, "Initial state is OFF");

    // Double init is safe
    result = led_controller_init();
    TEST_ASSERT(result == 0, "Double init is safe");

    led_controller_cleanup();
    TEST_ASSERT(!led_controller_is_initialized(), "Not initialized after cleanup");
}

// ============================================================================
// Test: State Names
// ============================================================================

static void test_state_names(void) {
    printf("\n--- Test: State Names ---\n");

    TEST_ASSERT(strcmp(led_state_name(LED_STATE_OFF), "OFF") == 0, "OFF state name");
    TEST_ASSERT(strcmp(led_state_name(LED_STATE_BOOT), "BOOT") == 0, "BOOT state name");
    TEST_ASSERT(strcmp(led_state_name(LED_STATE_DISARMED), "DISARMED") == 0, "DISARMED state name");
    TEST_ASSERT(strcmp(led_state_name(LED_STATE_ARMED), "ARMED") == 0, "ARMED state name");
    TEST_ASSERT(strcmp(led_state_name(LED_STATE_OFFLINE), "OFFLINE") == 0, "OFFLINE state name");
    TEST_ASSERT(strcmp(led_state_name(LED_STATE_DETECTION), "DETECTION") == 0, "DETECTION state name");
    TEST_ASSERT(strcmp(led_state_name(LED_STATE_ERROR), "ERROR") == 0, "ERROR state name");
}

// ============================================================================
// Test: State Setting
// ============================================================================

static void test_state_setting(void) {
    printf("\n--- Test: State Setting ---\n");

    led_controller_init();

    // Set armed state
    led_controller_set_state(LED_STATE_ARMED);
    TEST_ASSERT(led_controller_is_state_active(LED_STATE_ARMED), "Armed state is active");
    TEST_ASSERT(led_controller_get_state() == LED_STATE_ARMED, "Current state is armed");

    // Clear armed state
    led_controller_clear_state(LED_STATE_ARMED);
    TEST_ASSERT(!led_controller_is_state_active(LED_STATE_ARMED), "Armed state is cleared");
    TEST_ASSERT(led_controller_get_state() == LED_STATE_OFF, "Current state is off");

    // Set disarmed state
    led_controller_set_state(LED_STATE_DISARMED);
    TEST_ASSERT(led_controller_is_state_active(LED_STATE_DISARMED), "Disarmed state is active");
    TEST_ASSERT(led_controller_get_state() == LED_STATE_DISARMED, "Current state is disarmed");

    led_controller_cleanup();
}

// ============================================================================
// Test: Priority System
// ============================================================================

static void test_priority(void) {
    printf("\n--- Test: Priority System ---\n");

    led_controller_init();

    // Set armed (lower priority)
    led_controller_set_state(LED_STATE_ARMED);
    TEST_ASSERT(led_controller_get_state() == LED_STATE_ARMED, "Armed is current state");

    // Set error (higher priority) - should override
    led_controller_set_state(LED_STATE_ERROR);
    TEST_ASSERT(led_controller_get_state() == LED_STATE_ERROR, "Error overrides armed");
    TEST_ASSERT(led_controller_is_state_active(LED_STATE_ARMED), "Armed still active");
    TEST_ASSERT(led_controller_is_state_active(LED_STATE_ERROR), "Error is active");

    // Clear error - should fall back to armed
    led_controller_clear_state(LED_STATE_ERROR);
    TEST_ASSERT(led_controller_get_state() == LED_STATE_ARMED, "Falls back to armed");
    TEST_ASSERT(!led_controller_is_state_active(LED_STATE_ERROR), "Error is cleared");

    // Test offline overlay priority
    led_controller_set_state(LED_STATE_OFFLINE);
    TEST_ASSERT(led_controller_get_state() == LED_STATE_OFFLINE, "Offline overrides armed");

    led_controller_clear_state(LED_STATE_OFFLINE);
    TEST_ASSERT(led_controller_get_state() == LED_STATE_ARMED, "Falls back to armed again");

    led_controller_cleanup();
}

// ============================================================================
// Test: Detection Flash
// ============================================================================

static void test_detection_flash(void) {
    printf("\n--- Test: Detection Flash ---\n");

    led_controller_init();

    // Set armed state
    led_controller_set_state(LED_STATE_ARMED);
    TEST_ASSERT(led_controller_get_state() == LED_STATE_ARMED, "Initial state is armed");

    // Trigger detection flash
    led_controller_flash_detection();

    // Should be in detection state immediately
    TEST_ASSERT(led_controller_get_state() == LED_STATE_DETECTION, "Detection flash active");

    // Wait for flash to end (200ms + margin)
    usleep(300000);  // 300ms

    // Should be back to armed
    TEST_ASSERT(led_controller_get_state() == LED_STATE_ARMED, "Falls back to armed after flash");

    led_controller_cleanup();
}

// ============================================================================
// Test: Boot State
// ============================================================================

static void test_boot_state(void) {
    printf("\n--- Test: Boot State ---\n");

    led_controller_init();

    // Set boot state
    led_controller_set_state(LED_STATE_BOOT);
    TEST_ASSERT(led_controller_is_state_active(LED_STATE_BOOT), "Boot state is active");
    TEST_ASSERT(led_controller_get_state() == LED_STATE_BOOT, "Current state is boot");

    // Wait a bit for breathing animation
    usleep(100000);  // 100ms

    // Still in boot state
    TEST_ASSERT(led_controller_get_state() == LED_STATE_BOOT, "Still in boot state");

    // Clear boot, set armed
    led_controller_clear_state(LED_STATE_BOOT);
    led_controller_set_state(LED_STATE_ARMED);
    TEST_ASSERT(led_controller_get_state() == LED_STATE_ARMED, "Transitioned to armed");

    led_controller_cleanup();
}

// ============================================================================
// Test: Multiple States
// ============================================================================

static void test_multiple_states(void) {
    printf("\n--- Test: Multiple States ---\n");

    led_controller_init();

    // Set multiple states at once
    led_controller_set_state(LED_STATE_ARMED);
    led_controller_set_state(LED_STATE_OFFLINE);

    // Both should be active
    TEST_ASSERT(led_controller_is_state_active(LED_STATE_ARMED), "Armed is active");
    TEST_ASSERT(led_controller_is_state_active(LED_STATE_OFFLINE), "Offline is active");

    // Offline has higher priority
    TEST_ASSERT(led_controller_get_state() == LED_STATE_OFFLINE, "Offline has priority");

    // Add error - highest priority
    led_controller_set_state(LED_STATE_ERROR);
    TEST_ASSERT(led_controller_get_state() == LED_STATE_ERROR, "Error has highest priority");

    // All three still active
    TEST_ASSERT(led_controller_is_state_active(LED_STATE_ARMED), "Armed still active");
    TEST_ASSERT(led_controller_is_state_active(LED_STATE_OFFLINE), "Offline still active");
    TEST_ASSERT(led_controller_is_state_active(LED_STATE_ERROR), "Error is active");

    // Clear all
    led_controller_clear_state(LED_STATE_ERROR);
    led_controller_clear_state(LED_STATE_OFFLINE);
    led_controller_clear_state(LED_STATE_ARMED);

    TEST_ASSERT(led_controller_get_state() == LED_STATE_OFF, "Back to off state");

    led_controller_cleanup();
}

// ============================================================================
// Test: Edge Cases
// ============================================================================

static void test_edge_cases(void) {
    printf("\n--- Test: Edge Cases ---\n");

    led_controller_init();

    // Invalid state
    led_controller_set_state(LED_STATE_COUNT);  // Invalid
    TEST_ASSERT(led_controller_get_state() == LED_STATE_OFF, "Invalid state ignored");

    // Clear non-active state
    led_controller_clear_state(LED_STATE_ERROR);  // Was never set
    TEST_ASSERT(led_controller_get_state() == LED_STATE_OFF, "Clearing inactive state is safe");

    // Set and clear same state
    led_controller_set_state(LED_STATE_DISARMED);
    led_controller_clear_state(LED_STATE_DISARMED);
    TEST_ASSERT(!led_controller_is_state_active(LED_STATE_DISARMED), "Set then clear works");

    led_controller_cleanup();

    // Operations on uninitialized controller are safe
    led_controller_set_state(LED_STATE_ARMED);  // Should not crash
    led_controller_clear_state(LED_STATE_ARMED);
    led_controller_flash_detection();
    TEST_ASSERT(led_controller_get_state() == LED_STATE_OFF, "Operations on uninitialized are safe");
}

// ============================================================================
// Test: Cleanup
// ============================================================================

static void test_cleanup(void) {
    printf("\n--- Test: Cleanup ---\n");

    led_controller_init();

    // Set some states
    led_controller_set_state(LED_STATE_ARMED);
    led_controller_set_state(LED_STATE_OFFLINE);

    // Cleanup
    led_controller_cleanup();

    TEST_ASSERT(!led_controller_is_initialized(), "Not initialized after cleanup");
    TEST_ASSERT(led_controller_get_state() == LED_STATE_OFF, "State is off after cleanup");

    // Re-init should work
    int result = led_controller_init();
    TEST_ASSERT(result == 0, "Re-init after cleanup works");
    TEST_ASSERT(led_controller_get_state() == LED_STATE_OFF, "Fresh state after re-init");

    led_controller_cleanup();
}

// ============================================================================
// Main
// ============================================================================

int main(void) {
    // Initialize logging (suppress during tests)
    log_init(NULL, LOG_LEVEL_ERROR, false);

    printf("=== LED Controller Tests ===\n");

    test_initialization();
    test_state_names();
    test_state_setting();
    test_priority();
    test_detection_flash();
    test_boot_state();
    test_multiple_states();
    test_edge_cases();
    test_cleanup();

    printf("\n=== Results: %d passed, %d failed ===\n",
           tests_passed, tests_failed);

    return tests_failed > 0 ? 1 : 0;
}
