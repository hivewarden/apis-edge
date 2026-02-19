/**
 * Test program for configuration manager.
 */

#include "config_manager.h"
#include "log.h"

#include <stdio.h>
#include <string.h>
#include <assert.h>
#include <unistd.h>
#include <sys/stat.h>

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

static void test_defaults(void) {
    printf("\n--- Test: Default Configuration ---\n");

    runtime_config_t defaults = config_manager_defaults();

    TEST_ASSERT(defaults.schema_version == CONFIG_SCHEMA_VERSION,
                "Schema version set");
    TEST_ASSERT(defaults.needs_setup == true,
                "needs_setup defaults to true");
    TEST_ASSERT(defaults.armed == false,
                "armed defaults to false");
    TEST_ASSERT(defaults.detection.enabled == true,
                "detection enabled by default");
    TEST_ASSERT(defaults.detection.min_size_px == 18,
                "min_size_px default is 18");
    TEST_ASSERT(defaults.detection.fps == 10,
                "fps default is 10");
    TEST_ASSERT(defaults.laser.max_duration_seconds == 10,
                "laser max duration default is 10");
    TEST_ASSERT(defaults.server.heartbeat_interval_seconds == 60,
                "heartbeat interval default is 60");
    TEST_ASSERT(strlen(defaults.updated_at) > 0,
                "updated_at timestamp set");
}

static void test_validation(void) {
    printf("\n--- Test: Configuration Validation ---\n");

    runtime_config_t config = config_manager_defaults();
    cfg_validation_t validation;

    // Valid config
    TEST_ASSERT(config_manager_validate(&config, &validation),
                "Default config is valid");

    // Invalid heartbeat interval (too low)
    config.server.heartbeat_interval_seconds = 5;
    TEST_ASSERT(!config_manager_validate(&config, &validation),
                "Heartbeat interval 5 is invalid");
    TEST_ASSERT(strcmp(validation.error_field,
                       "server.heartbeat_interval_seconds") == 0,
                "Error field is correct");

    // Invalid heartbeat interval (too high)
    config.server.heartbeat_interval_seconds = 5000;
    TEST_ASSERT(!config_manager_validate(&config, &validation),
                "Heartbeat interval 5000 is invalid");

    // Reset and test URL validation
    config = config_manager_defaults();
    strcpy(config.server.url, "ftp://invalid.com");
    TEST_ASSERT(!config_manager_validate(&config, &validation),
                "FTP URL is invalid");

    // Valid URL
    config = config_manager_defaults();
    strcpy(config.server.url, "https://valid.example.com");
    TEST_ASSERT(config_manager_validate(&config, &validation),
                "HTTPS URL is valid");

    // Empty URL is allowed (offline mode)
    config = config_manager_defaults();
    config.server.url[0] = '\0';
    TEST_ASSERT(config_manager_validate(&config, &validation),
                "Empty URL is valid (offline mode)");

    // Invalid detection FPS
    config = config_manager_defaults();
    config.detection.fps = 100;
    TEST_ASSERT(!config_manager_validate(&config, &validation),
                "FPS 100 is invalid");

    // Invalid laser duration
    config = config_manager_defaults();
    config.laser.max_duration_seconds = 50;
    TEST_ASSERT(!config_manager_validate(&config, &validation),
                "Laser duration 50 is invalid");
}

static void test_json_serialization(void) {
    printf("\n--- Test: JSON Serialization ---\n");

    runtime_config_t config = config_manager_defaults();
    strcpy(config.device.id, "test-unit-001");
    strcpy(config.device.name, "Test Unit");
    strcpy(config.server.api_key, "sk_test_12345");
    config.armed = true;

    char json[4096];

    // Serialize with sensitive data
    TEST_ASSERT(config_manager_to_json(&config, json, sizeof(json), true) == 0,
                "Serialization with sensitive data succeeds");
    TEST_ASSERT(strstr(json, "test-unit-001") != NULL,
                "Device ID in JSON");
    TEST_ASSERT(strstr(json, "sk_test_12345") != NULL,
                "API key in JSON (sensitive mode)");

    // Serialize without sensitive data
    TEST_ASSERT(config_manager_to_json(&config, json, sizeof(json), false) == 0,
                "Serialization without sensitive data succeeds");
    TEST_ASSERT(strstr(json, "sk_test_12345") == NULL,
                "API key masked (public mode)");
    TEST_ASSERT(strstr(json, "***") != NULL,
                "API key shows mask");

    // Deserialize
    runtime_config_t parsed;
    TEST_ASSERT(config_manager_from_json(json, &parsed) == 0,
                "Deserialization succeeds");
    TEST_ASSERT(strcmp(parsed.device.id, "test-unit-001") == 0,
                "Device ID preserved");
    TEST_ASSERT(parsed.armed == true,
                "Armed state preserved");
}

static void test_json_roundtrip(void) {
    printf("\n--- Test: JSON Roundtrip ---\n");

    runtime_config_t original = config_manager_defaults();
    strcpy(original.device.id, "roundtrip-test");
    strcpy(original.device.name, "Roundtrip Test Device");
    strcpy(original.server.url, "https://test.example.com");
    strcpy(original.server.api_key, "sk_roundtrip_key");
    original.server.heartbeat_interval_seconds = 120;
    original.detection.enabled = false;
    original.detection.min_size_px = 25;
    original.detection.hover_threshold_ms = 2000;
    original.detection.fps = 15;
    original.laser.enabled = false;
    original.laser.max_duration_seconds = 15;
    original.laser.cooldown_seconds = 10;
    original.armed = true;
    original.needs_setup = false;

    char json[4096];
    TEST_ASSERT(config_manager_to_json(&original, json, sizeof(json), true) == 0,
                "Serialize original");

    runtime_config_t parsed;
    TEST_ASSERT(config_manager_from_json(json, &parsed) == 0,
                "Parse JSON");

    // Verify all fields
    TEST_ASSERT(strcmp(parsed.device.id, original.device.id) == 0,
                "device.id matches");
    TEST_ASSERT(strcmp(parsed.device.name, original.device.name) == 0,
                "device.name matches");
    TEST_ASSERT(strcmp(parsed.server.url, original.server.url) == 0,
                "server.url matches");
    TEST_ASSERT(strcmp(parsed.server.api_key, original.server.api_key) == 0,
                "server.api_key matches");
    TEST_ASSERT(parsed.server.heartbeat_interval_seconds ==
                original.server.heartbeat_interval_seconds,
                "server.heartbeat_interval_seconds matches");
    TEST_ASSERT(parsed.detection.enabled == original.detection.enabled,
                "detection.enabled matches");
    TEST_ASSERT(parsed.detection.min_size_px == original.detection.min_size_px,
                "detection.min_size_px matches");
    TEST_ASSERT(parsed.detection.hover_threshold_ms ==
                original.detection.hover_threshold_ms,
                "detection.hover_threshold_ms matches");
    TEST_ASSERT(parsed.detection.fps == original.detection.fps,
                "detection.fps matches");
    TEST_ASSERT(parsed.laser.enabled == original.laser.enabled,
                "laser.enabled matches");
    TEST_ASSERT(parsed.laser.max_duration_seconds ==
                original.laser.max_duration_seconds,
                "laser.max_duration_seconds matches");
    TEST_ASSERT(parsed.laser.cooldown_seconds ==
                original.laser.cooldown_seconds,
                "laser.cooldown_seconds matches");
    TEST_ASSERT(parsed.armed == original.armed,
                "armed matches");
    TEST_ASSERT(parsed.needs_setup == original.needs_setup,
                "needs_setup matches");
}

static void test_init_and_persistence(void) {
    printf("\n--- Test: Init and Persistence ---\n");

    // Clean up any existing test config
    unlink("./data/apis/config.json");
    unlink("./data/apis/config.json.tmp");

    // Initialize (should create defaults)
    TEST_ASSERT(config_manager_init(true) == 0,
                "Init succeeds (first boot)");

    const runtime_config_t *config = config_manager_get();
    TEST_ASSERT(config != NULL,
                "Config pointer not null");
    TEST_ASSERT(config->needs_setup == true,
                "First boot needs_setup is true");

    // Set some values
    TEST_ASSERT(config_manager_set_device("persistence-test", "Test Device") == 0,
                "Set device succeeds");
    TEST_ASSERT(config_manager_set_server("https://test.apis.local", "sk_test_persist") == 0,
                "Set server succeeds");
    TEST_ASSERT(config_manager_set_armed(true) == 0,
                "Set armed succeeds");

    // Cleanup and reinit (should load persisted values)
    config_manager_cleanup();
    TEST_ASSERT(config_manager_init(true) == 0,
                "Reinit succeeds");

    config = config_manager_get();
    TEST_ASSERT(strcmp(config->device.id, "persistence-test") == 0,
                "Device ID persisted");
    TEST_ASSERT(strcmp(config->server.url, "https://test.apis.local") == 0,
                "Server URL persisted");
    TEST_ASSERT(strcmp(config->server.api_key, "sk_test_persist") == 0,
                "API key persisted");
    TEST_ASSERT(config->armed == true,
                "Armed state persisted");

    config_manager_cleanup();
}

static void test_partial_update(void) {
    printf("\n--- Test: Partial Configuration Update ---\n");

    // Clean up and initialize
    unlink("./data/apis/config.json");
    config_manager_init(true);

    // Update just detection settings
    const char *update_json = "{\"detection\": {\"min_size_px\": 25, \"fps\": 15}}";
    cfg_validation_t validation;

    TEST_ASSERT(config_manager_update(update_json, &validation) == 0,
                "Partial update succeeds");

    const runtime_config_t *config = config_manager_get();
    TEST_ASSERT(config->detection.min_size_px == 25,
                "min_size_px updated to 25");
    TEST_ASSERT(config->detection.fps == 15,
                "fps updated to 15");
    TEST_ASSERT(config->detection.hover_threshold_ms == 1000,
                "hover_threshold_ms unchanged");
    TEST_ASSERT(config->detection.enabled == true,
                "enabled unchanged");

    // Try invalid update
    const char *invalid_json = "{\"detection\": {\"fps\": 200}}";
    TEST_ASSERT(config_manager_update(invalid_json, &validation) != 0,
                "Invalid update rejected");
    TEST_ASSERT(!validation.valid,
                "Validation failed");
    TEST_ASSERT(strcmp(validation.error_field, "detection.fps") == 0,
                "Error field is detection.fps");

    // Config should be unchanged after invalid update
    TEST_ASSERT(config->detection.fps == 15,
                "fps unchanged after invalid update");

    config_manager_cleanup();
}

static void test_api_key_protection(void) {
    printf("\n--- Test: API Key Protection ---\n");

    // Clean up and initialize
    unlink("./data/apis/config.json");
    config_manager_init(true);

    // Set API key
    const char *set_key = "{\"server\": {\"api_key\": \"sk_real_secret_key\"}}";
    cfg_validation_t validation;
    config_manager_update(set_key, &validation);

    const runtime_config_t *config = config_manager_get();
    TEST_ASSERT(strcmp(config->server.api_key, "sk_real_secret_key") == 0,
                "API key stored correctly");

    // Get public config
    runtime_config_t public_config;
    config_manager_get_public(&public_config);
    TEST_ASSERT(strcmp(public_config.server.api_key, "***") == 0,
                "API key masked in public config");

    // Update with masked value should NOT overwrite
    const char *masked_update = "{\"server\": {\"api_key\": \"***\", \"url\": \"https://new.url.com\"}}";
    config_manager_update(masked_update, &validation);

    TEST_ASSERT(strcmp(config->server.api_key, "sk_real_secret_key") == 0,
                "API key NOT overwritten by mask");
    TEST_ASSERT(strcmp(config->server.url, "https://new.url.com") == 0,
                "URL was updated");

    config_manager_cleanup();
}

static void test_setup_completion(void) {
    printf("\n--- Test: Setup Completion ---\n");

    // Clean up and initialize
    unlink("./data/apis/config.json");
    config_manager_init(true);

    TEST_ASSERT(config_manager_needs_setup() == true,
                "Initially needs setup");

    // Complete setup
    TEST_ASSERT(config_manager_complete_setup() == 0,
                "Complete setup succeeds");

    TEST_ASSERT(config_manager_needs_setup() == false,
                "No longer needs setup");

    // Verify persisted
    config_manager_cleanup();
    config_manager_init(true);

    TEST_ASSERT(config_manager_needs_setup() == false,
                "Setup complete state persisted");

    config_manager_cleanup();
}

static void test_armed_toggle(void) {
    printf("\n--- Test: Armed State Toggle ---\n");

    // Clean up and initialize
    unlink("./data/apis/config.json");
    config_manager_init(true);

    TEST_ASSERT(config_manager_is_armed() == false,
                "Initially disarmed");

    // Arm
    TEST_ASSERT(config_manager_set_armed(true) == 0,
                "Arm succeeds");
    TEST_ASSERT(config_manager_is_armed() == true,
                "Now armed");

    // Disarm
    TEST_ASSERT(config_manager_set_armed(false) == 0,
                "Disarm succeeds");
    TEST_ASSERT(config_manager_is_armed() == false,
                "Now disarmed");

    // Arm again and verify persistence
    config_manager_set_armed(true);
    config_manager_cleanup();
    config_manager_init(true);

    TEST_ASSERT(config_manager_is_armed() == true,
                "Armed state persisted");

    config_manager_cleanup();
}

static void test_invalid_json(void) {
    printf("\n--- Test: Invalid JSON Handling ---\n");

    config_manager_init(true);

    cfg_validation_t validation;

    // Completely invalid JSON
    const char *bad_json = "{ this is not valid json }";
    TEST_ASSERT(config_manager_update(bad_json, &validation) != 0,
                "Invalid JSON rejected");
    TEST_ASSERT(!validation.valid,
                "Validation shows invalid");
    TEST_ASSERT(strcmp(validation.error_field, "_json") == 0,
                "Error field is _json");

    // Empty JSON (valid but no updates)
    const char *empty_json = "{}";
    TEST_ASSERT(config_manager_update(empty_json, &validation) == 0,
                "Empty JSON accepted (no-op)");

    config_manager_cleanup();
}

int main(void) {
    // Suppress log output during tests
    log_init(NULL, LOG_LEVEL_ERROR, false);

    printf("=== Configuration Manager Tests ===\n");

    // Clean up any leftover files from previous failed test runs
    unlink("./data/apis/config.json");
    unlink("./data/apis/config.json.tmp");

    // Create test directory
    mkdir("./data", 0755);
    mkdir("./data/apis", 0755);

    test_defaults();
    test_validation();
    test_json_serialization();
    test_json_roundtrip();
    test_init_and_persistence();
    test_partial_update();
    test_api_key_protection();
    test_setup_completion();
    test_armed_toggle();
    test_invalid_json();

    printf("\n=== Results: %d passed, %d failed ===\n",
           tests_passed, tests_failed);

    // Cleanup test files
    unlink("./data/apis/config.json");
    unlink("./data/apis/config.json.tmp");

    return tests_failed > 0 ? 1 : 0;
}
