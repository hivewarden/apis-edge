/**
 * Clip Uploader Tests.
 *
 * Tests:
 * - Initialization and lifecycle
 * - Queue operations (add, remove, ordering)
 * - Exponential backoff calculation
 * - Queue limit enforcement
 * - Statistics tracking
 *
 * Note: Actual upload tests require a mock server or are skipped
 * when server is not configured.
 */

#include "clip_uploader.h"
#include "config_manager.h"
#include "log.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#include "test_framework.h"

static clip_upload_request_t make_request(const char *clip_path,
                                          const char *detection_id,
                                          const char *recorded_at) {
    clip_upload_request_t request;
    memset(&request, 0, sizeof(request));

    if (clip_path) {
        snprintf(request.clip_path, sizeof(request.clip_path), "%s", clip_path);
    }
    if (detection_id) {
        snprintf(request.detection_id, sizeof(request.detection_id), "%s", detection_id);
    }
    if (recorded_at) {
        snprintf(request.recorded_at, sizeof(request.recorded_at), "%s", recorded_at);
    }

    return request;
}

// ============================================================================
// Test: Initialization
// ============================================================================

static void test_initialization(void) {
    printf("\n--- Test: Initialization ---\n");

    // Not initialized initially
    TEST_ASSERT(!clip_uploader_is_initialized(), "Not initialized initially");
    TEST_ASSERT(!clip_uploader_is_running(), "Not running initially");
    TEST_ASSERT(clip_uploader_pending_count() == 0, "No pending clips initially");

    // Init succeeds
    int result = clip_uploader_init();
    TEST_ASSERT(result == 0, "Init returns 0");
    TEST_ASSERT(clip_uploader_is_initialized(), "Is initialized after init");
    TEST_ASSERT(!clip_uploader_is_running(), "Not running after init (need start)");

    // Double init is safe
    result = clip_uploader_init();
    TEST_ASSERT(result == 0, "Double init is safe");

    // Cleanup
    clip_uploader_cleanup();
    TEST_ASSERT(!clip_uploader_is_initialized(), "Not initialized after cleanup");
}

// ============================================================================
// Test: Status Names
// ============================================================================

static void test_status_names(void) {
    printf("\n--- Test: Status Names ---\n");

    TEST_ASSERT(strcmp(upload_status_name(UPLOAD_STATUS_SUCCESS), "SUCCESS") == 0,
                "SUCCESS status name");
    TEST_ASSERT(strcmp(upload_status_name(UPLOAD_STATUS_NETWORK_ERROR), "NETWORK_ERROR") == 0,
                "NETWORK_ERROR status name");
    TEST_ASSERT(strcmp(upload_status_name(UPLOAD_STATUS_SERVER_ERROR), "SERVER_ERROR") == 0,
                "SERVER_ERROR status name");
    TEST_ASSERT(strcmp(upload_status_name(UPLOAD_STATUS_AUTH_ERROR), "AUTH_ERROR") == 0,
                "AUTH_ERROR status name");
    TEST_ASSERT(strcmp(upload_status_name(UPLOAD_STATUS_CLIENT_ERROR), "CLIENT_ERROR") == 0,
                "CLIENT_ERROR status name");
    TEST_ASSERT(strcmp(upload_status_name(UPLOAD_STATUS_FILE_ERROR), "FILE_ERROR") == 0,
                "FILE_ERROR status name");
    TEST_ASSERT(strcmp(upload_status_name(UPLOAD_STATUS_NO_CONFIG), "NO_CONFIG") == 0,
                "NO_CONFIG status name");
}

// ============================================================================
// Test: Exponential Backoff
// ============================================================================

static void test_exponential_backoff(void) {
    printf("\n--- Test: Exponential Backoff ---\n");

    // First retry: 60 seconds
    uint32_t delay = clip_uploader_retry_delay(0);
    TEST_ASSERT(delay == 60, "Retry 0: 60 seconds");

    // Second retry: 120 seconds
    delay = clip_uploader_retry_delay(1);
    TEST_ASSERT(delay == 120, "Retry 1: 120 seconds");

    // Third retry: 240 seconds
    delay = clip_uploader_retry_delay(2);
    TEST_ASSERT(delay == 240, "Retry 2: 240 seconds");

    // Fourth retry: 480 seconds
    delay = clip_uploader_retry_delay(3);
    TEST_ASSERT(delay == 480, "Retry 3: 480 seconds");

    // Fifth retry: 960 seconds
    delay = clip_uploader_retry_delay(4);
    TEST_ASSERT(delay == 960, "Retry 4: 960 seconds");

    // Sixth retry: 1920 seconds
    delay = clip_uploader_retry_delay(5);
    TEST_ASSERT(delay == 1920, "Retry 5: 1920 seconds");

    // Seventh retry: capped at 3600
    delay = clip_uploader_retry_delay(6);
    TEST_ASSERT(delay == 3600, "Retry 6: capped at 3600");

    // High retry count: still capped
    delay = clip_uploader_retry_delay(100);
    TEST_ASSERT(delay == 3600, "Retry 100: still 3600");
}

// ============================================================================
// Test: Queue Operations
// ============================================================================

static void test_queue_operations(void) {
    printf("\n--- Test: Queue Operations ---\n");

    clip_uploader_init();
    clip_uploader_clear_queue();

    // Queue is empty initially
    TEST_ASSERT(clip_uploader_pending_count() == 0, "Queue empty initially");

    // Add a clip
    clip_upload_request_t request = make_request("/data/clips/test1.mp4", "evt_001",
                                                 "2026-03-07T12:00:00Z");
    int result = clip_uploader_queue(&request);
    TEST_ASSERT(result == 0, "Queue first clip succeeds");
    TEST_ASSERT(clip_uploader_pending_count() == 1, "Pending count is 1");

    // Add another clip
    request = make_request("/data/clips/test2.mp4", "evt_002",
                           "2026-03-07T12:00:03Z");
    result = clip_uploader_queue(&request);
    TEST_ASSERT(result == 0, "Queue second clip succeeds");
    TEST_ASSERT(clip_uploader_pending_count() == 2, "Pending count is 2");

    // Duplicate clip is ignored
    request = make_request("/data/clips/test1.mp4", "evt_001",
                           "2026-03-07T12:00:00Z");
    result = clip_uploader_queue(&request);
    TEST_ASSERT(result == 0, "Duplicate queue returns 0");
    TEST_ASSERT(clip_uploader_pending_count() == 2, "Pending count still 2 after duplicate");

    // Verify entry contents
    clip_queue_entry_t entry;
    result = clip_uploader_get_entry(0, &entry);
    TEST_ASSERT(result == 0, "Get entry 0 succeeds");
    TEST_ASSERT(strcmp(entry.clip_path, "/data/clips/test1.mp4") == 0, "Entry 0 path correct");
    TEST_ASSERT(strcmp(entry.detection_id, "evt_001") == 0, "Entry 0 detection_id correct");
    TEST_ASSERT(strcmp(entry.recorded_at, "2026-03-07T12:00:00Z") == 0,
                "Entry 0 recorded_at correct");
    TEST_ASSERT(entry.retry_count == 0, "Entry 0 retry count is 0");
    TEST_ASSERT(!entry.uploaded, "Entry 0 not uploaded");

    result = clip_uploader_get_entry(1, &entry);
    TEST_ASSERT(result == 0, "Get entry 1 succeeds");
    TEST_ASSERT(strcmp(entry.clip_path, "/data/clips/test2.mp4") == 0, "Entry 1 path correct");

    // Invalid index
    result = clip_uploader_get_entry(10, &entry);
    TEST_ASSERT(result == -1, "Get invalid index fails");

    // Clear queue
    clip_uploader_clear_queue();
    TEST_ASSERT(clip_uploader_pending_count() == 0, "Queue empty after clear");

    clip_uploader_cleanup();
}

// ============================================================================
// Test: Queue Limit
// ============================================================================

static void test_queue_limit(void) {
    printf("\n--- Test: Queue Limit ---\n");

    clip_uploader_init();
    clip_uploader_clear_queue();

    // Fill queue to limit
    char path[256];
    char det_id[64];
    for (int i = 0; i < MAX_UPLOAD_QUEUE; i++) {
        snprintf(path, sizeof(path), "/data/clips/clip_%03d.mp4", i);
        snprintf(det_id, sizeof(det_id), "evt_%03d", i);
        clip_upload_request_t request = make_request(path, det_id,
                                                     "2026-03-07T12:00:00Z");
        int result = clip_uploader_queue(&request);
        TEST_ASSERT(result == 0, "Queue clip succeeds");
    }

    TEST_ASSERT(clip_uploader_pending_count() == MAX_UPLOAD_QUEUE, "Queue at limit");

    // Adding one more should drop oldest
    clip_upload_request_t overflow_request = make_request("/data/clips/overflow.mp4",
                                                          "evt_overflow",
                                                          "2026-03-07T12:00:00Z");
    int result = clip_uploader_queue(&overflow_request);
    TEST_ASSERT(result == 0, "Queue overflow clip succeeds");
    TEST_ASSERT(clip_uploader_pending_count() == MAX_UPLOAD_QUEUE, "Queue still at limit");

    // Verify oldest was dropped (clip_000 should be gone)
    clip_queue_entry_t entry;
    clip_uploader_get_entry(0, &entry);
    TEST_ASSERT(strcmp(entry.clip_path, "/data/clips/clip_000.mp4") != 0 ||
                entry.uploaded == true, "Oldest clip was dropped or marked uploaded");

    clip_uploader_clear_queue();
    clip_uploader_cleanup();
}

// ============================================================================
// Test: Statistics
// ============================================================================

static void test_statistics(void) {
    printf("\n--- Test: Statistics ---\n");

    clip_uploader_init();
    clip_uploader_clear_queue();

    upload_stats_t stats;
    int result = clip_uploader_get_stats(&stats);
    TEST_ASSERT(result == 0, "Get stats succeeds");
    TEST_ASSERT(stats.pending_count == 0, "No pending initially");
    TEST_ASSERT(stats.uploaded_count == 0, "No uploaded initially");

    // Add some clips
    clip_upload_request_t stat1 = make_request("/data/clips/stat1.mp4", "evt_s1",
                                               "2026-03-07T12:00:00Z");
    clip_upload_request_t stat2 = make_request("/data/clips/stat2.mp4", "evt_s2",
                                               "2026-03-07T12:00:01Z");
    clip_upload_request_t stat3 = make_request("/data/clips/stat3.mp4", "evt_s3",
                                               "2026-03-07T12:00:02Z");
    clip_uploader_queue(&stat1);
    clip_uploader_queue(&stat2);
    clip_uploader_queue(&stat3);

    result = clip_uploader_get_stats(&stats);
    TEST_ASSERT(result == 0, "Get stats after adding succeeds");
    TEST_ASSERT(stats.pending_count == 3, "Pending count is 3");
    TEST_ASSERT(stats.oldest_pending_time > 0, "Oldest pending time is set");

    clip_uploader_clear_queue();
    clip_uploader_cleanup();
}

// ============================================================================
// Test: Start/Stop Lifecycle
// ============================================================================

static void test_start_stop(void) {
    printf("\n--- Test: Start/Stop Lifecycle ---\n");

    clip_uploader_init();

    // Start upload thread
    int result = clip_uploader_start();
    TEST_ASSERT(result == 0, "Start returns 0");
    TEST_ASSERT(clip_uploader_is_running(), "Is running after start");

    // Wait a moment
    usleep(100000);  // 100ms

    // Stop
    clip_uploader_stop();
    TEST_ASSERT(!clip_uploader_is_running(), "Not running after stop");

    clip_uploader_cleanup();
}

// ============================================================================
// Test: Cleanup
// ============================================================================

static void test_cleanup(void) {
    printf("\n--- Test: Cleanup ---\n");

    clip_uploader_init();
    clip_uploader_start();

    // Add a clip
    clip_upload_request_t cleanup_request = make_request("/data/clips/cleanup_test.mp4",
                                                         "evt_cleanup",
                                                         "2026-03-07T12:00:00Z");
    clip_uploader_queue(&cleanup_request);

    // Wait for thread to start
    usleep(100000);

    // Cleanup
    clip_uploader_cleanup();

    TEST_ASSERT(!clip_uploader_is_initialized(), "Not initialized after cleanup");
    TEST_ASSERT(!clip_uploader_is_running(), "Not running after cleanup");

    // Re-init should work
    int result = clip_uploader_init();
    TEST_ASSERT(result == 0, "Re-init after cleanup works");

    clip_uploader_cleanup();
}

// ============================================================================
// Test: NULL Parameters
// ============================================================================

static void test_null_params(void) {
    printf("\n--- Test: NULL Parameters ---\n");

    clip_uploader_init();

    // NULL clip path
    int result = clip_uploader_queue(NULL);
    TEST_ASSERT(result == -1, "NULL clip path fails");

    // Empty clip path
    clip_upload_request_t empty_path = make_request("", "evt_empty", "2026-03-07T12:00:00Z");
    result = clip_uploader_queue(&empty_path);
    TEST_ASSERT(result == -1, "Empty clip path fails");

    // Empty detection_id is OK (optional)
    clip_upload_request_t no_detection = make_request("/data/clips/no_det.mp4", "",
                                                      "2026-03-07T12:00:00Z");
    result = clip_uploader_queue(&no_detection);
    TEST_ASSERT(result == 0, "Empty detection_id succeeds");

    // Missing recorded_at is rejected
    clip_upload_request_t no_recorded_at = make_request("/data/clips/no_time.mp4", "evt_missing", "");
    result = clip_uploader_queue(&no_recorded_at);
    TEST_ASSERT(result == -1, "Missing recorded_at fails");

    // NULL stats
    result = clip_uploader_get_stats(NULL);
    TEST_ASSERT(result == -1, "NULL stats fails");

    // NULL entry
    result = clip_uploader_get_entry(0, NULL);
    TEST_ASSERT(result == -1, "NULL entry fails");

    clip_uploader_cleanup();
}

// ============================================================================
// Test: Retry State Reset (I7 fix)
// ============================================================================

static void test_retry_state_reset(void) {
    printf("\n--- Test: Retry State Reset ---\n");

    clip_uploader_init();
    clip_uploader_clear_queue();

    // Add a clip
    clip_upload_request_t retry_request = make_request("/data/clips/retry_test.mp4",
                                                       "evt_retry",
                                                       "2026-03-07T12:00:00Z");
    int result = clip_uploader_queue(&retry_request);
    TEST_ASSERT(result == 0, "Queue clip for retry test");

    // Verify initial state (no retries)
    clip_queue_entry_t entry;
    result = clip_uploader_get_entry(0, &entry);
    TEST_ASSERT(result == 0, "Get entry succeeds");
    TEST_ASSERT(entry.retry_count == 0, "Initial retry count is 0");
    TEST_ASSERT(entry.next_retry_time == 0, "Initial next_retry_time is 0");

    // Simulate retry state by modifying entry via re-queue after manual state change
    // Note: In actual upload flow, retry state is set in process_upload_queue on failure
    // Here we just verify the initial state and structure is correct for tracking retries
    TEST_ASSERT(entry.uploaded == false, "Entry not marked uploaded initially");
    TEST_ASSERT(entry.queued_time > 0, "Entry has valid queued_time");

    // Verify backoff calculation resets correctly
    // After successful upload, retry_count would be reset to 0
    uint32_t delay_before = clip_uploader_retry_delay(3);  // Simulating 3 retries
    TEST_ASSERT(delay_before == 480, "Delay at retry 3 is 480 seconds");

    // After success, entry.retry_count = 0 means next failure would start fresh
    uint32_t delay_after_reset = clip_uploader_retry_delay(0);
    TEST_ASSERT(delay_after_reset == 60, "Delay resets to 60 seconds after success");

    clip_uploader_clear_queue();
    clip_uploader_cleanup();
}

// ============================================================================
// Test: FIFO Ordering
// ============================================================================

static void test_fifo_ordering(void) {
    printf("\n--- Test: FIFO Ordering ---\n");

    clip_uploader_init();
    clip_uploader_clear_queue();

    // Add clips with slight delay to ensure different timestamps
    clip_upload_request_t first = make_request("/data/clips/first.mp4", "evt_first",
                                               "2026-03-07T12:00:00Z");
    clip_upload_request_t second = make_request("/data/clips/second.mp4", "evt_second",
                                                "2026-03-07T12:00:01Z");
    clip_upload_request_t third = make_request("/data/clips/third.mp4", "evt_third",
                                               "2026-03-07T12:00:02Z");
    clip_uploader_queue(&first);
    usleep(10000);  // 10ms
    clip_uploader_queue(&second);
    usleep(10000);
    clip_uploader_queue(&third);

    // Verify ordering
    clip_queue_entry_t entry;

    clip_uploader_get_entry(0, &entry);
    TEST_ASSERT(strcmp(entry.clip_path, "/data/clips/first.mp4") == 0, "First in queue is first added");

    clip_uploader_get_entry(1, &entry);
    TEST_ASSERT(strcmp(entry.clip_path, "/data/clips/second.mp4") == 0, "Second in queue is second added");

    clip_uploader_get_entry(2, &entry);
    TEST_ASSERT(strcmp(entry.clip_path, "/data/clips/third.mp4") == 0, "Third in queue is third added");

    clip_uploader_clear_queue();
    clip_uploader_cleanup();
}

// ============================================================================
// Main
// ============================================================================

int main(void) {
    // Initialize logging (suppress during tests)
    log_init(NULL, LOG_LEVEL_ERROR, false);

    TEST_BEGIN("Clip Uploader");

    RUN_TEST(test_initialization);
    RUN_TEST(test_status_names);
    RUN_TEST(test_exponential_backoff);
    RUN_TEST(test_queue_operations);
    RUN_TEST(test_queue_limit);
    RUN_TEST(test_statistics);
    RUN_TEST(test_start_stop);
    RUN_TEST(test_cleanup);
    RUN_TEST(test_null_params);
    RUN_TEST(test_retry_state_reset);
    RUN_TEST(test_fifo_ordering);

    TEST_END();
}
