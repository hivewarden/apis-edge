/**
 * Test program for QR scanner module.
 *
 * Tests the JSON payload parser and scanner lifecycle.
 * Does not require real QR-encoded frames — exercises the parser directly.
 */

#include "qr_scanner.h"
#include "log.h"

#include <stdio.h>
#include <string.h>
#include <assert.h>

static int tests_passed = 0;
static int tests_failed = 0;

#define TEST_ASSERT(cond, msg) do { \
    if (cond) { \
        tests_passed++; \
        printf("  PASS: %s\n", msg); \
    } else { \
        tests_failed++; \
        printf("  FAIL: %s\n", msg); \
    } \
} while (0)

// ============================================================================
// Test: Init / Cleanup Lifecycle
// ============================================================================

static void test_lifecycle(void) {
    printf("\n--- Test: Init / Cleanup Lifecycle ---\n");

    TEST_ASSERT(!qr_scanner_is_initialized(), "Not initialized at start");

    qr_scanner_status_t status = qr_scanner_init();
    TEST_ASSERT(status == QR_SCANNER_OK, "Init succeeds");
    TEST_ASSERT(qr_scanner_is_initialized(), "Is initialized after init");

    // Double init should be OK
    status = qr_scanner_init();
    TEST_ASSERT(status == QR_SCANNER_OK, "Double init returns OK");

    qr_scanner_cleanup();
    TEST_ASSERT(!qr_scanner_is_initialized(), "Not initialized after cleanup");

    // Double cleanup should be safe
    qr_scanner_cleanup();
    TEST_ASSERT(!qr_scanner_is_initialized(), "Double cleanup is safe");
}

// ============================================================================
// Test: Valid JSON Payload Parsing
// ============================================================================

static void test_parse_valid_payload(void) {
    printf("\n--- Test: Valid Payload Parsing ---\n");

    qr_scan_result_t result;

    // Standard payload
    const char *payload = "{\"s\":\"http://localhost:3000\",\"k\":\"sk_test_123\"}";
    qr_scanner_status_t status = qr_scanner_parse_payload(
        payload, strlen(payload), &result);
    TEST_ASSERT(status == QR_SCANNER_OK, "Valid payload returns OK");
    TEST_ASSERT(result.found == true, "found is true");
    TEST_ASSERT(strcmp(result.server_url, "http://localhost:3000") == 0,
                "server_url extracted correctly");
    TEST_ASSERT(strcmp(result.api_key, "sk_test_123") == 0,
                "api_key extracted correctly");

    // HTTPS URL
    const char *https_payload = "{\"s\":\"https://hivewarden.eu\",\"k\":\"sk_live_abc\"}";
    status = qr_scanner_parse_payload(
        https_payload, strlen(https_payload), &result);
    TEST_ASSERT(status == QR_SCANNER_OK, "HTTPS payload returns OK");
    TEST_ASSERT(result.found == true, "HTTPS: found is true");
    TEST_ASSERT(strcmp(result.server_url, "https://hivewarden.eu") == 0,
                "HTTPS URL extracted correctly");

    // URL with port
    const char *port_payload = "{\"s\":\"http://192.168.1.100:3000\",\"k\":\"key123\"}";
    status = qr_scanner_parse_payload(
        port_payload, strlen(port_payload), &result);
    TEST_ASSERT(status == QR_SCANNER_OK, "URL with port returns OK");
    TEST_ASSERT(result.found == true, "Port URL: found is true");
    TEST_ASSERT(strcmp(result.server_url, "http://192.168.1.100:3000") == 0,
                "URL with port extracted correctly");
}

// ============================================================================
// Test: Invalid / Missing Fields
// ============================================================================

static void test_parse_missing_fields(void) {
    printf("\n--- Test: Missing Fields ---\n");

    qr_scan_result_t result;

    // Missing "s" field
    const char *no_server = "{\"k\":\"sk_test_123\"}";
    qr_scanner_status_t status = qr_scanner_parse_payload(
        no_server, strlen(no_server), &result);
    TEST_ASSERT(status == QR_SCANNER_ERROR_DECODE, "Missing 's' returns DECODE_ERROR");
    TEST_ASSERT(result.found == false, "Missing 's': found is false");

    // Missing "k" field
    const char *no_key = "{\"s\":\"http://localhost:3000\"}";
    status = qr_scanner_parse_payload(
        no_key, strlen(no_key), &result);
    TEST_ASSERT(status == QR_SCANNER_ERROR_DECODE, "Missing 'k' returns DECODE_ERROR");
    TEST_ASSERT(result.found == false, "Missing 'k': found is false");

    // Empty "s" field
    const char *empty_server = "{\"s\":\"\",\"k\":\"sk_test_123\"}";
    status = qr_scanner_parse_payload(
        empty_server, strlen(empty_server), &result);
    TEST_ASSERT(status == QR_SCANNER_ERROR_DECODE, "Empty 's' returns DECODE_ERROR");

    // Empty "k" field
    const char *empty_key = "{\"s\":\"http://localhost:3000\",\"k\":\"\"}";
    status = qr_scanner_parse_payload(
        empty_key, strlen(empty_key), &result);
    TEST_ASSERT(status == QR_SCANNER_ERROR_DECODE, "Empty 'k' returns DECODE_ERROR");

    // Not JSON at all
    const char *not_json = "Hello, World!";
    status = qr_scanner_parse_payload(
        not_json, strlen(not_json), &result);
    TEST_ASSERT(status == QR_SCANNER_ERROR_DECODE, "Non-JSON returns DECODE_ERROR");

    // Empty string
    const char *empty = "";
    status = qr_scanner_parse_payload(
        empty, strlen(empty), &result);
    TEST_ASSERT(status == QR_SCANNER_ERROR_DECODE, "Empty string returns DECODE_ERROR");
}

// ============================================================================
// Test: Non-HTTP URL Rejected
// ============================================================================

static void test_parse_bad_url_scheme(void) {
    printf("\n--- Test: Non-HTTP URL Rejected ---\n");

    qr_scan_result_t result;

    // FTP URL
    const char *ftp = "{\"s\":\"ftp://server.com\",\"k\":\"key\"}";
    qr_scanner_status_t status = qr_scanner_parse_payload(
        ftp, strlen(ftp), &result);
    TEST_ASSERT(status == QR_SCANNER_ERROR_DECODE, "FTP URL rejected");
    TEST_ASSERT(result.found == false, "FTP: found is false");

    // No scheme
    const char *no_scheme = "{\"s\":\"server.com\",\"k\":\"key\"}";
    status = qr_scanner_parse_payload(
        no_scheme, strlen(no_scheme), &result);
    TEST_ASSERT(status == QR_SCANNER_ERROR_DECODE, "No-scheme URL rejected");

    // JavaScript injection attempt
    const char *js = "{\"s\":\"javascript:alert(1)\",\"k\":\"key\"}";
    status = qr_scanner_parse_payload(
        js, strlen(js), &result);
    TEST_ASSERT(status == QR_SCANNER_ERROR_DECODE, "JavaScript URL rejected");
}

// ============================================================================
// Test: Oversized Strings Truncated Safely
// ============================================================================

static void test_parse_oversized_strings(void) {
    printf("\n--- Test: Oversized Strings Truncated ---\n");

    qr_scan_result_t result;

    // Build a payload with a very long URL (300+ chars)
    char long_payload[1024];
    snprintf(long_payload, sizeof(long_payload),
        "{\"s\":\"http://");
    for (int i = 0; i < 260; i++) {
        strncat(long_payload, "x", sizeof(long_payload) - strlen(long_payload) - 1);
    }
    strncat(long_payload, "\",\"k\":\"key123\"}", sizeof(long_payload) - strlen(long_payload) - 1);

    qr_scanner_status_t status = qr_scanner_parse_payload(
        long_payload, strlen(long_payload), &result);
    TEST_ASSERT(status == QR_SCANNER_OK, "Long URL parses without crash");
    TEST_ASSERT(result.found == true, "Long URL: found is true");
    TEST_ASSERT(strlen(result.server_url) < sizeof(result.server_url),
                "server_url does not overflow buffer");
    TEST_ASSERT(result.server_url[sizeof(result.server_url) - 1] == '\0',
                "server_url is null-terminated");

    // Build a payload with a very long API key (100+ chars)
    char long_key_payload[512];
    snprintf(long_key_payload, sizeof(long_key_payload),
        "{\"s\":\"http://localhost:3000\",\"k\":\"");
    for (int i = 0; i < 80; i++) {
        strncat(long_key_payload, "k", sizeof(long_key_payload) - strlen(long_key_payload) - 1);
    }
    strncat(long_key_payload, "\"}", sizeof(long_key_payload) - strlen(long_key_payload) - 1);

    status = qr_scanner_parse_payload(
        long_key_payload, strlen(long_key_payload), &result);
    TEST_ASSERT(status == QR_SCANNER_OK, "Long key parses without crash");
    TEST_ASSERT(result.found == true, "Long key: found is true");
    TEST_ASSERT(strlen(result.api_key) < sizeof(result.api_key),
                "api_key does not overflow buffer");
}

// ============================================================================
// Test: Null Pointer Handling
// ============================================================================

static void test_null_pointers(void) {
    printf("\n--- Test: Null Pointer Handling ---\n");

    qr_scan_result_t result;

    // Null payload
    qr_scanner_status_t status = qr_scanner_parse_payload(NULL, 0, &result);
    TEST_ASSERT(status == QR_SCANNER_ERROR_NULL, "Null payload returns NULL error");

    // Null result
    const char *payload = "{\"s\":\"http://x\",\"k\":\"y\"}";
    status = qr_scanner_parse_payload(payload, strlen(payload), NULL);
    TEST_ASSERT(status == QR_SCANNER_ERROR_NULL, "Null result returns NULL error");

    // scan_frame with null frame (scanner must be initialized first)
    qr_scanner_init();
    status = qr_scanner_scan_frame(NULL, &result);
    TEST_ASSERT(status == QR_SCANNER_ERROR_NULL, "Null frame returns NULL error");

    status = qr_scanner_scan_frame((const frame_t *)0x1, NULL);
    TEST_ASSERT(status == QR_SCANNER_ERROR_NULL, "Null result in scan_frame returns NULL error");
    qr_scanner_cleanup();

    // scan_frame when not initialized
    status = qr_scanner_scan_frame((const frame_t *)0x1, &result);
    TEST_ASSERT(status == QR_SCANNER_ERROR_NOT_INIT, "scan_frame when not init returns NOT_INIT");
}

// ============================================================================
// Test: Status String Helper
// ============================================================================

static void test_status_strings(void) {
    printf("\n--- Test: Status Strings ---\n");

    TEST_ASSERT(strcmp(qr_scanner_status_str(QR_SCANNER_OK), "OK") == 0,
                "OK status string");
    TEST_ASSERT(strcmp(qr_scanner_status_str(QR_SCANNER_ERROR_INIT), "INIT_ERROR") == 0,
                "INIT_ERROR status string");
    TEST_ASSERT(strcmp(qr_scanner_status_str(QR_SCANNER_ERROR_NULL), "NULL_POINTER") == 0,
                "NULL_POINTER status string");
    TEST_ASSERT(strcmp(qr_scanner_status_str(QR_SCANNER_ERROR_NOT_INIT), "NOT_INITIALIZED") == 0,
                "NOT_INITIALIZED status string");
    TEST_ASSERT(strcmp(qr_scanner_status_str(QR_SCANNER_ERROR_DECODE), "DECODE_ERROR") == 0,
                "DECODE_ERROR status string");
    TEST_ASSERT(strcmp(qr_scanner_status_str(99), "UNKNOWN") == 0,
                "Unknown status returns UNKNOWN");
}

// ============================================================================
// Test: Payload Too Large
// ============================================================================

static void test_parse_payload_too_large(void) {
    printf("\n--- Test: Payload Too Large ---\n");

    qr_scan_result_t result;

    // Create a payload larger than the 512 byte internal buffer
    char huge[600];
    memset(huge, 'A', sizeof(huge));
    huge[sizeof(huge) - 1] = '\0';

    qr_scanner_status_t status = qr_scanner_parse_payload(
        huge, sizeof(huge) - 1, &result);
    TEST_ASSERT(status == QR_SCANNER_ERROR_DECODE, "Oversized payload returns DECODE_ERROR");
    TEST_ASSERT(result.found == false, "Oversized payload: found is false");
}

// ============================================================================
// Main
// ============================================================================

int main(void) {
    printf("QR Scanner Tests\n");
    printf("================\n");

    // Initialize logging (minimal, to stderr)
    log_init(NULL, LOG_LEVEL_WARN, false);

    test_lifecycle();
    test_parse_valid_payload();
    test_parse_missing_fields();
    test_parse_bad_url_scheme();
    test_parse_oversized_strings();
    test_null_pointers();
    test_status_strings();
    test_parse_payload_too_large();

    printf("\n================================\n");
    printf("Results: %d passed, %d failed\n", tests_passed, tests_failed);
    printf("================================\n");

    return tests_failed > 0 ? 1 : 0;
}
