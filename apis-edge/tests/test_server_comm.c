/**
 * Server Communication Tests.
 *
 * Tests heartbeat functionality:
 * - Initialization and lifecycle
 * - Status tracking
 * - URL parsing
 *
 * Note: Actual network tests require a mock server or are skipped
 * when server is not configured.
 */

#include "server_comm.h"
#include "config_manager.h"
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
    TEST_ASSERT(!server_comm_is_initialized(), "Not initialized initially");
    TEST_ASSERT(!server_comm_is_running(), "Not running initially");

    // Init succeeds
    int result = server_comm_init();
    TEST_ASSERT(result == 0, "Init returns 0");
    TEST_ASSERT(server_comm_is_initialized(), "Is initialized after init");
    TEST_ASSERT(!server_comm_is_running(), "Not running after init (need start)");

    // Status is unknown initially
    TEST_ASSERT(server_comm_get_status() == SERVER_STATUS_UNKNOWN, "Initial status is UNKNOWN");

    // Double init is safe
    result = server_comm_init();
    TEST_ASSERT(result == 0, "Double init is safe");

    // Cleanup
    server_comm_cleanup();
    TEST_ASSERT(!server_comm_is_initialized(), "Not initialized after cleanup");
}

// ============================================================================
// Test: Status Names
// ============================================================================

static void test_status_names(void) {
    printf("\n--- Test: Status Names ---\n");

    TEST_ASSERT(strcmp(server_status_name(SERVER_STATUS_UNKNOWN), "UNKNOWN") == 0, "UNKNOWN status name");
    TEST_ASSERT(strcmp(server_status_name(SERVER_STATUS_ONLINE), "ONLINE") == 0, "ONLINE status name");
    TEST_ASSERT(strcmp(server_status_name(SERVER_STATUS_OFFLINE), "OFFLINE") == 0, "OFFLINE status name");
    TEST_ASSERT(strcmp(server_status_name(SERVER_STATUS_AUTH_FAILED), "AUTH_FAILED") == 0, "AUTH_FAILED status name");
}

// ============================================================================
// Test: Seconds Since Heartbeat
// ============================================================================

static void test_seconds_since_heartbeat(void) {
    printf("\n--- Test: Seconds Since Heartbeat ---\n");

    server_comm_init();

    // No successful heartbeat yet
    int64_t seconds = server_comm_seconds_since_heartbeat();
    TEST_ASSERT(seconds == -1, "Returns -1 when never successful");

    server_comm_cleanup();
}

// ============================================================================
// Test: Start/Stop Lifecycle
// ============================================================================

static void test_start_stop(void) {
    printf("\n--- Test: Start/Stop Lifecycle ---\n");

    server_comm_init();

    // Start without server config - thread will run but heartbeat will fail
    int result = server_comm_start();
    TEST_ASSERT(result == 0, "Start returns 0");
    TEST_ASSERT(server_comm_is_running(), "Is running after start");

    // Wait a moment for thread to start
    usleep(100000);  // 100ms

    // Stop
    server_comm_stop();
    TEST_ASSERT(!server_comm_is_running(), "Not running after stop");

    server_comm_cleanup();
}

// ============================================================================
// Test: No Server Config
// ============================================================================

static void test_no_server_config(void) {
    printf("\n--- Test: No Server Config ---\n");

    // Initialize config manager with explicitly empty server config
    config_manager_init(true);

    // Clear server URL
    const char *empty_config = "{\"server\": {\"url\": \"\", \"api_key\": \"\"}}";
    config_manager_update(empty_config, NULL);

    server_comm_init();

    // Manual heartbeat should fail gracefully
    int result = server_comm_send_heartbeat(NULL);
    TEST_ASSERT(result == -1, "Heartbeat fails without server config");

    // Status should remain unknown (not offline, since we didn't try network)
    server_status_t status = server_comm_get_status();
    TEST_ASSERT(status == SERVER_STATUS_UNKNOWN, "Status remains UNKNOWN");

    server_comm_cleanup();
    config_manager_cleanup();
}

// ============================================================================
// Test: Network Failure (mock)
// ============================================================================

static void test_network_failure(void) {
    printf("\n--- Test: Network Failure ---\n");

    // Configure with invalid server (will fail to connect)
    config_manager_init(true);

    // Set a server URL that will fail
    const char *config_json = "{"
        "\"server\": {"
        "  \"url\": \"http://127.0.0.1:59999\","
        "  \"api_key\": \"test_key\""
        "}"
    "}";
    config_manager_update(config_json, NULL);

    server_comm_init();
    led_controller_init();

    // Try heartbeat - should fail (no server listening)
    int result = server_comm_send_heartbeat(NULL);
    TEST_ASSERT(result == -1, "Heartbeat fails with unreachable server");

    // Status should be offline
    server_status_t status = server_comm_get_status();
    TEST_ASSERT(status == SERVER_STATUS_OFFLINE, "Status is OFFLINE after failure");

    // LED should show offline
    TEST_ASSERT(led_controller_is_state_active(LED_STATE_OFFLINE), "LED shows offline state");

    led_controller_cleanup();
    server_comm_cleanup();
    config_manager_cleanup();
}

// ============================================================================
// Test: Cleanup
// ============================================================================

static void test_cleanup(void) {
    printf("\n--- Test: Cleanup ---\n");

    server_comm_init();
    server_comm_start();

    // Wait for thread to start
    usleep(100000);

    // Cleanup
    server_comm_cleanup();

    TEST_ASSERT(!server_comm_is_initialized(), "Not initialized after cleanup");
    TEST_ASSERT(!server_comm_is_running(), "Not running after cleanup");

    // Re-init should work
    int result = server_comm_init();
    TEST_ASSERT(result == 0, "Re-init after cleanup works");

    server_comm_cleanup();
}

// ============================================================================
// Main
// ============================================================================

int main(void) {
    // Initialize logging (suppress during tests)
    log_init(NULL, LOG_LEVEL_ERROR, false);

    printf("=== Server Communication Tests ===\n");

    test_initialization();
    test_status_names();
    test_seconds_since_heartbeat();
    test_start_stop();
    test_no_server_config();
    test_network_failure();
    test_cleanup();

    printf("\n=== Results: %d passed, %d failed ===\n",
           tests_passed, tests_failed);

    return tests_failed > 0 ? 1 : 0;
}
