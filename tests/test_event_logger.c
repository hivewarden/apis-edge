/**
 * Test program for event logging module.
 *
 * Tests:
 * - Database initialization and schema creation
 * - Event logging and retrieval
 * - Date-filtered queries
 * - Sync status tracking
 * - Event pruning
 * - Storage status reporting
 */

#include "event_logger.h"
#include "classifier.h"
#include "log.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

static int tests_passed = 0;
static int tests_failed = 0;

#define TEST_DB_PATH "/tmp/apis_test_events.db"

#define TEST_ASSERT(cond, msg) do { \
    if (!(cond)) { \
        printf("FAIL: %s (line %d)\n", msg, __LINE__); \
        tests_failed++; \
        return; \
    } \
} while(0)

#define TEST_PASS(name) do { \
    printf("PASS: %s\n", name); \
    tests_passed++; \
} while(0)

/**
 * Clean up test database file.
 */
static void cleanup_test_db(void) {
    unlink(TEST_DB_PATH);
    // Also remove WAL and SHM files
    char wal_path[128], shm_path[128];
    snprintf(wal_path, sizeof(wal_path), "%s-wal", TEST_DB_PATH);
    snprintf(shm_path, sizeof(shm_path), "%s-shm", TEST_DB_PATH);
    unlink(wal_path);
    unlink(shm_path);
}

/**
 * Test basic initialization and cleanup.
 */
static void test_init_cleanup(void) {
    printf("\n--- Test: Init/Cleanup ---\n");

    event_logger_close();
    cleanup_test_db();

    event_logger_config_t config = event_logger_config_defaults();
    snprintf(config.db_path, sizeof(config.db_path), "%s", TEST_DB_PATH);

    TEST_ASSERT(!event_logger_is_initialized(), "Should not be initialized yet");

    event_logger_status_t status = event_logger_init(&config);
    TEST_ASSERT(status == EVENT_LOGGER_OK, "Init should succeed");
    TEST_ASSERT(event_logger_is_initialized(), "Should be initialized");

    // Double init should be OK
    status = event_logger_init(&config);
    TEST_ASSERT(status == EVENT_LOGGER_OK, "Double init should be OK");

    event_logger_close();
    TEST_ASSERT(!event_logger_is_initialized(), "Should not be initialized after close");

    cleanup_test_db();
    TEST_PASS("Init/Cleanup");
}

/**
 * Test basic event logging.
 */
static void test_basic_logging(void) {
    printf("\n--- Test: Basic Logging ---\n");

    event_logger_close();
    cleanup_test_db();

    event_logger_config_t config = event_logger_config_defaults();
    snprintf(config.db_path, sizeof(config.db_path), "%s", TEST_DB_PATH);
    event_logger_init(&config);

    // Create test detection
    classified_detection_t det = {
        .detection = {
            .x = 100, .y = 150, .w = 30, .h = 25,
            .area = 750, .centroid_x = 115, .centroid_y = 162
        },
        .track_id = 42,
        .confidence = CONFIDENCE_HIGH,
        .classification = CLASS_HORNET,
        .is_hovering = true,
        .hover_duration_ms = 1500,
        .track_age_ms = 2000,
    };

    // Log event without clip
    int64_t id1 = event_logger_log(&det, false, NULL);
    TEST_ASSERT(id1 > 0, "First event ID should be positive");
    printf("  Logged event ID: %lld\n", (long long)id1);

    // Log event with clip
    int64_t id2 = event_logger_log(&det, true, "clip_20260122_143052.mp4");
    TEST_ASSERT(id2 > id1, "Second event ID should be greater");

    // Log medium confidence event
    det.confidence = CONFIDENCE_MEDIUM;
    det.is_hovering = false;
    det.hover_duration_ms = 0;
    int64_t id3 = event_logger_log(&det, false, NULL);
    TEST_ASSERT(id3 > id2, "Third event ID should be greater");

    // Verify count
    storage_status_t status;
    event_logger_get_status(&status);
    TEST_ASSERT(status.total_events == 3, "Should have 3 events");
    TEST_ASSERT(status.unsynced_events == 3, "All events should be unsynced");

    event_logger_close();
    cleanup_test_db();
    TEST_PASS("Basic Logging");
}

/**
 * Test event retrieval and filtering.
 */
static void test_event_retrieval(void) {
    printf("\n--- Test: Event Retrieval ---\n");

    event_logger_close();
    cleanup_test_db();

    event_logger_config_t config = event_logger_config_defaults();
    snprintf(config.db_path, sizeof(config.db_path), "%s", TEST_DB_PATH);
    event_logger_init(&config);

    // Log several events
    classified_detection_t det = {
        .detection = {.x = 100, .y = 100, .w = 30, .h = 25, .area = 750,
                      .centroid_x = 115, .centroid_y = 112},
        .confidence = CONFIDENCE_HIGH,
        .hover_duration_ms = 1000,
    };

    for (int i = 0; i < 5; i++) {
        det.detection.x = 100 + i * 10;
        event_logger_log(&det, i % 2 == 0, NULL);
    }

    // Get all events
    event_record_t events[MAX_EVENTS_PER_QUERY];
    int count = event_logger_get_events(NULL, NULL, events);
    TEST_ASSERT(count == 5, "Should retrieve 5 events");

    // Verify first event (most recent due to DESC order)
    printf("  First event: id=%lld, confidence=%s, x=%d\n",
           (long long)events[0].id, events[0].confidence, events[0].x);
    TEST_ASSERT(strcmp(events[0].confidence, "high") == 0, "Confidence should be 'high'");

    // Test unsynced query
    count = event_logger_get_unsynced(events, 10);
    TEST_ASSERT(count == 5, "All 5 events should be unsynced");

    event_logger_close();
    cleanup_test_db();
    TEST_PASS("Event Retrieval");
}

/**
 * Test sync status marking.
 */
static void test_sync_marking(void) {
    printf("\n--- Test: Sync Marking ---\n");

    event_logger_close();
    cleanup_test_db();

    event_logger_config_t config = event_logger_config_defaults();
    snprintf(config.db_path, sizeof(config.db_path), "%s", TEST_DB_PATH);
    event_logger_init(&config);

    // Log events
    classified_detection_t det = {
        .detection = {.x = 100, .y = 100, .w = 30, .h = 25, .area = 750,
                      .centroid_x = 115, .centroid_y = 112},
        .confidence = CONFIDENCE_MEDIUM,
    };

    int64_t ids[5];
    for (int i = 0; i < 5; i++) {
        ids[i] = event_logger_log(&det, false, NULL);
    }

    // Verify all unsynced
    event_record_t events[10];
    int count = event_logger_get_unsynced(events, 10);
    TEST_ASSERT(count == 5, "Should have 5 unsynced events");

    // Mark one synced
    int rc = event_logger_mark_synced(ids[0]);
    TEST_ASSERT(rc == 0, "mark_synced should succeed");

    count = event_logger_get_unsynced(events, 10);
    TEST_ASSERT(count == 4, "Should have 4 unsynced events after marking one");

    // Mark batch synced
    int marked = event_logger_mark_synced_batch(&ids[1], 2);
    TEST_ASSERT(marked == 2, "Should mark 2 events");

    count = event_logger_get_unsynced(events, 10);
    TEST_ASSERT(count == 2, "Should have 2 unsynced events after batch");

    // Verify status
    storage_status_t status;
    event_logger_get_status(&status);
    TEST_ASSERT(status.total_events == 5, "Total should still be 5");
    TEST_ASSERT(status.unsynced_events == 2, "Unsynced should be 2");

    event_logger_close();
    cleanup_test_db();
    TEST_PASS("Sync Marking");
}

/**
 * Test event pruning.
 */
static void test_pruning(void) {
    printf("\n--- Test: Pruning ---\n");

    event_logger_close();
    cleanup_test_db();

    event_logger_config_t config = event_logger_config_defaults();
    snprintf(config.db_path, sizeof(config.db_path), "%s", TEST_DB_PATH);
    event_logger_init(&config);

    // Log events
    classified_detection_t det = {
        .detection = {.x = 100, .y = 100, .w = 30, .h = 25, .area = 750,
                      .centroid_x = 115, .centroid_y = 112},
        .confidence = CONFIDENCE_LOW,
    };

    int64_t ids[5];
    for (int i = 0; i < 5; i++) {
        ids[i] = event_logger_log(&det, false, NULL);
    }

    storage_status_t status;
    event_logger_get_status(&status);
    TEST_ASSERT(status.total_events == 5, "Should have 5 events");

    // Pruning with 0 days should delete nothing (events are not synced)
    int pruned = event_logger_prune(0);
    TEST_ASSERT(pruned == 0, "Should prune 0 (nothing synced)");

    // Mark all synced
    for (int i = 0; i < 5; i++) {
        event_logger_mark_synced(ids[i]);
    }

    // Prune with 0 days should delete all synced
    pruned = event_logger_prune(0);
    TEST_ASSERT(pruned == 5, "Should prune all 5 synced events");

    event_logger_get_status(&status);
    TEST_ASSERT(status.total_events == 0, "Should have 0 events after prune");

    event_logger_close();
    cleanup_test_db();
    TEST_PASS("Pruning");
}

/**
 * Test date-range filtering (since_timestamp, until_timestamp).
 */
static void test_date_filtering(void) {
    printf("\n--- Test: Date Filtering ---\n");

    event_logger_close();
    cleanup_test_db();

    event_logger_config_t config = event_logger_config_defaults();
    snprintf(config.db_path, sizeof(config.db_path), "%s", TEST_DB_PATH);
    event_logger_init(&config);

    // Log several events - we'll test filtering by timestamp
    // Note: timestamps are auto-generated, so we'll query events by their order
    classified_detection_t det = {
        .detection = {.x = 100, .y = 100, .w = 30, .h = 25, .area = 750,
                      .centroid_x = 115, .centroid_y = 112},
        .confidence = CONFIDENCE_HIGH,
        .hover_duration_ms = 1000,
    };

    // Log 5 events
    for (int i = 0; i < 5; i++) {
        det.detection.x = 100 + i * 10;
        event_logger_log(&det, false, NULL);
        // Small delay to ensure different timestamps
        usleep(10000); // 10ms
    }

    // Get all events first to know the timestamp range
    event_record_t all_events[MAX_EVENTS_PER_QUERY];
    int total = event_logger_get_events(NULL, NULL, all_events);
    TEST_ASSERT(total == 5, "Should retrieve 5 events");

    // Events are returned in DESC order, so:
    // all_events[0] = newest (highest timestamp)
    // all_events[4] = oldest (lowest timestamp)

    // Test 1: Filter with since_timestamp only (should get events >= timestamp)
    // Use the oldest event's timestamp - should get all events
    event_record_t filtered[MAX_EVENTS_PER_QUERY];
    int count = event_logger_get_events(all_events[4].timestamp, NULL, filtered);
    TEST_ASSERT(count == 5, "Since oldest timestamp should return all 5 events");

    // Test 2: Filter with until_timestamp only (should get events <= timestamp)
    // Use the newest event's timestamp - should get all events
    count = event_logger_get_events(NULL, all_events[0].timestamp, filtered);
    TEST_ASSERT(count == 5, "Until newest timestamp should return all 5 events");

    // Test 3: Filter with both since and until (range query)
    // Use a range that should include all events
    count = event_logger_get_events(all_events[4].timestamp, all_events[0].timestamp, filtered);
    TEST_ASSERT(count == 5, "Range from oldest to newest should return all 5 events");

    // Test 4: Filter with a narrow range (middle 3 events)
    // Use timestamps of events[1] (2nd newest) to events[3] (4th newest, 2nd oldest)
    count = event_logger_get_events(all_events[3].timestamp, all_events[1].timestamp, filtered);
    TEST_ASSERT(count >= 2 && count <= 4, "Middle range should return 2-4 events");
    printf("  Middle range query returned %d events\n", count);

    // Test 5: Filter with future timestamp - should return 0 events
    count = event_logger_get_events("2099-01-01T00:00:00Z", NULL, filtered);
    TEST_ASSERT(count == 0, "Future since_timestamp should return 0 events");

    // Test 6: Filter with past timestamp as until - should return 0 events
    count = event_logger_get_events(NULL, "1970-01-02T00:00:00Z", filtered);
    TEST_ASSERT(count == 0, "Ancient until_timestamp should return 0 events");

    event_logger_close();
    cleanup_test_db();
    TEST_PASS("Date Filtering");
}

/**
 * Test persistence across restarts.
 */
static void test_persistence(void) {
    printf("\n--- Test: Persistence ---\n");

    event_logger_close();
    cleanup_test_db();

    event_logger_config_t config = event_logger_config_defaults();
    snprintf(config.db_path, sizeof(config.db_path), "%s", TEST_DB_PATH);

    // First session: create events
    event_logger_init(&config);

    classified_detection_t det = {
        .detection = {.x = 200, .y = 200, .w = 35, .h = 30, .area = 1050,
                      .centroid_x = 217, .centroid_y = 215},
        .confidence = CONFIDENCE_HIGH,
        .hover_duration_ms = 2500,
    };

    int64_t id1 = event_logger_log(&det, true, "persist_test.mp4");
    TEST_ASSERT(id1 > 0, "Should log event in first session");

    event_logger_close();

    // Second session: verify data persisted
    event_logger_init(&config);

    storage_status_t status;
    event_logger_get_status(&status);
    TEST_ASSERT(status.total_events == 1, "Event should persist");

    event_record_t events[10];
    int count = event_logger_get_events(NULL, NULL, events);
    TEST_ASSERT(count == 1, "Should retrieve persisted event");
    TEST_ASSERT(events[0].id == id1, "Event ID should match");
    TEST_ASSERT(strcmp(events[0].confidence, "high") == 0, "Confidence should persist");
    TEST_ASSERT(events[0].hover_duration_ms == 2500, "Hover duration should persist");
    TEST_ASSERT(strcmp(events[0].clip_file, "persist_test.mp4") == 0, "Clip file should persist");

    // Log another event - ID should continue from where we left off
    int64_t id2 = event_logger_log(&det, false, NULL);
    TEST_ASSERT(id2 > id1, "New ID should be greater after restart");

    event_logger_close();
    cleanup_test_db();
    TEST_PASS("Persistence");
}

/**
 * Test auto-pruning on storage warning (AC3).
 *
 * This test verifies that when storage is low (warning flag set),
 * the event_logger_log() function automatically triggers pruning
 * of old synced events.
 *
 * Note: In a real scenario, storage low condition would be detected
 * via statvfs. This test verifies the logic flow is correct.
 */
static void test_auto_prune_on_storage_warning(void) {
    printf("\n--- Test: Auto-Prune on Storage Warning ---\n");

    event_logger_close();
    cleanup_test_db();

    // Configure with very high min_free_mb to simulate "low storage" condition
    // This will cause storage warning to trigger on most systems
    event_logger_config_t config = event_logger_config_defaults();
    snprintf(config.db_path, sizeof(config.db_path), "%s", TEST_DB_PATH);
    config.min_free_mb = 999999; // 999 GB - will always trigger warning
    config.prune_days = 0;       // Prune all synced events immediately

    event_logger_init(&config);

    // Log several events and mark them as synced
    classified_detection_t det = {
        .detection = {.x = 100, .y = 100, .w = 30, .h = 25, .area = 750,
                      .centroid_x = 115, .centroid_y = 112},
        .confidence = CONFIDENCE_HIGH,
    };

    int64_t ids[3];
    for (int i = 0; i < 3; i++) {
        ids[i] = event_logger_log(&det, false, NULL);
        // Mark as synced so they're eligible for pruning
        event_logger_mark_synced(ids[i]);
    }

    storage_status_t status;
    event_logger_get_status(&status);
    printf("  Before auto-prune: %d total events, warning=%d\n",
           status.total_events, status.warning);

    TEST_ASSERT(status.total_events == 3, "Should have 3 events before auto-prune");
    TEST_ASSERT(status.warning, "Storage warning should be true (min_free_mb=999999)");

    // Log one more event - this should trigger auto-prune
    // because storage is "low" (warning flag set) and prune_days=0
    int64_t new_id = event_logger_log(&det, true, NULL);
    TEST_ASSERT(new_id > 0, "Should log new event");

    // Give it a moment for the prune to complete
    usleep(50000); // 50ms

    // Check that old synced events were pruned
    event_logger_get_status(&status);
    printf("  After auto-prune trigger: %d total events\n", status.total_events);

    // The 3 old synced events should have been pruned, leaving only the new one
    // Note: The new event is unsynced, so it won't be pruned
    TEST_ASSERT(status.total_events == 1, "Should have 1 event after auto-prune (old synced ones pruned)");
    TEST_ASSERT(status.unsynced_events == 1, "The remaining event should be unsynced (the new one)");

    event_logger_close();
    cleanup_test_db();
    TEST_PASS("Auto-Prune on Storage Warning");
}

/**
 * Test error handling.
 */
static void test_error_handling(void) {
    printf("\n--- Test: Error Handling ---\n");

    event_logger_close();
    cleanup_test_db();

    // Operations before init should fail gracefully
    TEST_ASSERT(!event_logger_is_initialized(), "Should not be initialized");

    classified_detection_t det = {
        .detection = {.x = 100, .y = 100, .w = 30, .h = 25, .area = 750,
                      .centroid_x = 115, .centroid_y = 112},
        .confidence = CONFIDENCE_HIGH,
    };

    int64_t id = event_logger_log(&det, false, NULL);
    TEST_ASSERT(id == -1, "Log before init should return -1");

    event_record_t events[10];
    int count = event_logger_get_events(NULL, NULL, events);
    TEST_ASSERT(count == -1, "get_events before init should return -1");

    count = event_logger_get_unsynced(events, 10);
    TEST_ASSERT(count == -1, "get_unsynced before init should return -1");

    int rc = event_logger_mark_synced(1);
    TEST_ASSERT(rc == -1, "mark_synced before init should return -1");

    int pruned = event_logger_prune(30);
    TEST_ASSERT(pruned == -1, "prune before init should return -1");

    storage_status_t status;
    rc = event_logger_get_status(&status);
    TEST_ASSERT(rc == -1, "get_status before init should return -1");

    // Init with valid config
    event_logger_config_t config = event_logger_config_defaults();
    snprintf(config.db_path, sizeof(config.db_path), "%s", TEST_DB_PATH);
    event_logger_init(&config);

    // NULL detection should fail
    id = event_logger_log(NULL, false, NULL);
    TEST_ASSERT(id == -1, "Log with NULL detection should return -1");

    // NULL events array should fail
    count = event_logger_get_events(NULL, NULL, NULL);
    TEST_ASSERT(count == -1, "get_events with NULL should return -1");

    count = event_logger_get_unsynced(NULL, 10);
    TEST_ASSERT(count == -1, "get_unsynced with NULL should return -1");

    // Zero/negative max_count should handle gracefully
    count = event_logger_get_unsynced(events, 0);
    TEST_ASSERT(count == -1, "get_unsynced with 0 count should return -1");

    event_logger_close();
    cleanup_test_db();
    TEST_PASS("Error Handling");
}

/**
 * Test string conversion functions.
 */
static void test_status_strings(void) {
    printf("\n--- Test: Status Strings ---\n");

    TEST_ASSERT(strcmp(event_logger_status_str(EVENT_LOGGER_OK), "OK") == 0,
               "OK status string");
    TEST_ASSERT(strcmp(event_logger_status_str(EVENT_LOGGER_ERROR_NOT_INITIALIZED),
               "Not initialized") == 0, "Not initialized status string");
    TEST_ASSERT(strcmp(event_logger_status_str(EVENT_LOGGER_ERROR_DB_OPEN),
               "Database open failed") == 0, "DB open error string");
    TEST_ASSERT(strcmp(event_logger_status_str((event_logger_status_t)999),
               "Unknown error") == 0, "Unknown error string");

    TEST_PASS("Status Strings");
}

int main(void) {
    log_init(NULL, LOG_LEVEL_INFO, false);

    printf("=== Event Logger Module Tests ===\n");

    test_init_cleanup();
    test_basic_logging();
    test_event_retrieval();
    test_date_filtering();
    test_sync_marking();
    test_pruning();
    test_auto_prune_on_storage_warning();
    test_persistence();
    test_error_handling();
    test_status_strings();

    printf("\n=== Test Summary ===\n");
    printf("Passed: %d\n", tests_passed);
    printf("Failed: %d\n", tests_failed);

    // Final cleanup
    cleanup_test_db();

    return tests_failed > 0 ? 1 : 0;
}
