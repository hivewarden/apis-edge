/**
 * P0 Targeting Thread-Safety Tests
 *
 * Verifies that concurrent access to the targeting module is safe.
 * Tests R-004 (callback deadlock in targeting) and concurrent state access.
 *
 * Risk: Score 6 (Prob=2, Impact=3)
 * Priority: P0 — run on every commit
 */

#include "targeting.h"
#include "servo_controller.h"
#include "coordinate_mapper.h"
#include "laser_controller.h"
#include "safety_layer.h"
#include "led_controller.h"
#include "button_handler.h"

#include <pthread.h>
#include <string.h>

/* ── Callback tracking (atomic-friendly counters) ── */
static volatile int g_state_cb_count = 0;
static volatile int g_acquired_cb_count = 0;
static volatile int g_lost_cb_count = 0;
static volatile int g_callback_reentry_detected = 0;
static volatile int g_callback_in_progress = 0;

static void ts_state_cb(target_state_t state, void *data) {
    (void)state;
    (void)data;
    /* Detect reentrancy: if callback is already in progress on same thread */
    if (__sync_fetch_and_add(&g_callback_in_progress, 1) > 0) {
        g_callback_reentry_detected = 1;
    }
    __sync_fetch_and_add(&g_state_cb_count, 1);
    __sync_fetch_and_sub(&g_callback_in_progress, 1);
}

static void ts_acquired_cb(const target_info_t *target, void *data) {
    (void)data;
    if (__sync_fetch_and_add(&g_callback_in_progress, 1) > 0) {
        g_callback_reentry_detected = 1;
    }
    /* Verify we get a valid snapshot */
    if (target != NULL && target->area > 0) {
        __sync_fetch_and_add(&g_acquired_cb_count, 1);
    }
    __sync_fetch_and_sub(&g_callback_in_progress, 1);
}

static void ts_lost_cb(uint32_t duration_ms, void *data) {
    (void)data;
    (void)duration_ms;
    __sync_fetch_and_add(&g_lost_cb_count, 1);
}

/* ── Setup/Teardown ── */
static void reset_counters(void) {
    g_state_cb_count = 0;
    g_acquired_cb_count = 0;
    g_lost_cb_count = 0;
    g_callback_reentry_detected = 0;
    g_callback_in_progress = 0;
}

#define TEST_SETUP() do { \
    targeting_cleanup(); \
    laser_controller_cleanup(); \
    safety_cleanup(); \
    led_controller_cleanup(); \
    servo_controller_cleanup(); \
    button_handler_cleanup(); \
    coord_mapper_cleanup(); \
    servo_controller_init(); \
    coord_mapper_init(NULL); \
    laser_controller_init(); \
    led_controller_init(); \
    button_handler_init(false); \
    safety_layer_init(); \
    targeting_init(); \
    targeting_test_reset_mock_time(); \
    targeting_test_set_mock_time(1000); \
    reset_counters(); \
    targeting_set_state_callback(ts_state_cb, NULL); \
    targeting_set_acquired_callback(ts_acquired_cb, NULL); \
    targeting_set_lost_callback(ts_lost_cb, NULL); \
} while(0)

#define TEST_TEARDOWN() do { \
    targeting_cleanup(); \
    safety_cleanup(); \
    laser_controller_cleanup(); \
    coord_mapper_cleanup(); \
    servo_controller_cleanup(); \
    led_controller_cleanup(); \
    button_handler_cleanup(); \
} while(0)

#include "test_framework.h"

/* ── Helper: create a detection ── */
static detection_box_t make_detection(int x, int y, int w, int h, float conf) {
    detection_box_t d = { .x = x, .y = y, .width = w, .height = h,
                          .confidence = conf, .id = 0 };
    return d;
}

/* ══════════════════════════════════════════════════════════════════
 * R-004: Callback deadlock prevention — copy-under-lock pattern
 * ══════════════════════════════════════════════════════════════════ */

void test_callbacks_not_reentrant(void) {
    /* Callbacks must be invoked outside the mutex.
     * If they were inside the lock, concurrent calls would deadlock.
     * We verify no reentrancy is detected. */
    detection_box_t det = make_detection(100, 100, 50, 50, 0.9f);

    /* Arm the system so targeting can proceed */
    button_handler_arm();
    laser_controller_arm();
    safety_set_detection_active(true);
    safety_feed_watchdog();
    safety_validate_tilt(-5.0f);

    targeting_process_detections(&det, 1);

    ASSERT_FALSE(g_callback_reentry_detected,
        "callbacks must not re-enter (would indicate lock held during callback)");
    ASSERT_GT(g_state_cb_count, 0, "state callback should have fired");
}

void test_callback_receives_valid_snapshot(void) {
    /* The acquired callback must receive a valid target_info_t copy,
     * not a pointer into mutable shared state. */
    detection_box_t det = make_detection(200, 150, 60, 40, 0.85f);

    button_handler_arm();
    laser_controller_arm();
    safety_set_detection_active(true);
    safety_feed_watchdog();
    safety_validate_tilt(-5.0f);

    targeting_process_detections(&det, 1);

    ASSERT_GT(g_acquired_cb_count, 0,
        "acquired callback should fire with valid target data");
}

/* ══════════════════════════════════════════════════════════════════
 * Concurrent access: process_detections + get_current_target
 * ══════════════════════════════════════════════════════════════════ */

#define CONCURRENT_ITERATIONS 500

static volatile int g_reader_errors = 0;
static volatile int g_reader_done = 0;

static void *reader_thread(void *arg) {
    (void)arg;
    target_info_t info;

    for (int i = 0; i < CONCURRENT_ITERATIONS; i++) {
        target_status_t status = targeting_get_current_target(&info);
        /* Should never crash or return garbage */
        if (status == TARGET_OK) {
            /* Basic consistency: area should be non-negative */
            if (info.area < 0) {
                __sync_fetch_and_add(&g_reader_errors, 1);
            }
        }
    }
    g_reader_done = 1;
    return NULL;
}

void test_concurrent_read_during_update(void) {
    /* One thread writes detections, another reads current target.
     * Must not crash, no torn reads. */
    g_reader_errors = 0;
    g_reader_done = 0;

    button_handler_arm();
    laser_controller_arm();
    safety_set_detection_active(true);
    safety_feed_watchdog();
    safety_validate_tilt(-5.0f);

    pthread_t reader;
    pthread_create(&reader, NULL, reader_thread, NULL);

    detection_box_t det = make_detection(100, 100, 50, 50, 0.9f);
    for (int i = 0; i < CONCURRENT_ITERATIONS; i++) {
        targeting_process_detections(&det, 1);
        /* Vary the detection slightly */
        det.x = 100 + (i % 20);
        det.width = 40 + (i % 30);
    }

    pthread_join(reader, NULL);

    ASSERT_EQ(0, g_reader_errors,
        "no torn reads during concurrent access");
}

/* ══════════════════════════════════════════════════════════════════
 * Concurrent: process_detections + targeting_update
 * ══════════════════════════════════════════════════════════════════ */

static volatile int g_update_done = 0;

static void *update_thread(void *arg) {
    (void)arg;
    for (int i = 0; i < CONCURRENT_ITERATIONS; i++) {
        targeting_update();
    }
    g_update_done = 1;
    return NULL;
}

void test_concurrent_process_and_update(void) {
    /* process_detections and targeting_update called from different threads.
     * Must not deadlock or corrupt state. */
    g_update_done = 0;

    button_handler_arm();
    laser_controller_arm();
    safety_set_detection_active(true);
    safety_feed_watchdog();
    safety_validate_tilt(-5.0f);

    pthread_t updater;
    pthread_create(&updater, NULL, update_thread, NULL);

    detection_box_t det = make_detection(150, 120, 45, 45, 0.88f);
    for (int i = 0; i < CONCURRENT_ITERATIONS; i++) {
        targeting_process_detections(&det, 1);
        targeting_test_advance_time(10);
    }

    pthread_join(updater, NULL);

    /* If we got here without deadlock/crash, test passes */
    ASSERT_TRUE(g_update_done, "update thread completed without deadlock");
}

/* ══════════════════════════════════════════════════════════════════
 * Concurrent: config set + sweep calculation
 * ══════════════════════════════════════════════════════════════════ */

static void *config_writer_thread(void *arg) {
    (void)arg;
    for (int i = 0; i < CONCURRENT_ITERATIONS; i++) {
        float amp = 5.0f + (float)(i % 20);
        float freq = 1.0f + (float)(i % 4);
        targeting_set_sweep_amplitude(amp);
        targeting_set_sweep_frequency(freq);
    }
    return NULL;
}

void test_concurrent_config_and_update(void) {
    /* One thread changes sweep config while another runs update loop.
     * Must not read torn float values or crash. */
    button_handler_arm();
    laser_controller_arm();
    safety_set_detection_active(true);
    safety_feed_watchdog();
    safety_validate_tilt(-5.0f);

    /* Start tracking so sweep is active */
    detection_box_t det = make_detection(160, 120, 50, 50, 0.9f);
    targeting_process_detections(&det, 1);

    pthread_t writer;
    pthread_create(&writer, NULL, config_writer_thread, NULL);

    for (int i = 0; i < CONCURRENT_ITERATIONS; i++) {
        targeting_update();
        targeting_test_advance_time(20);
    }

    pthread_join(writer, NULL);

    /* Verify config is within valid bounds after concurrent writes */
    float amp = targeting_get_sweep_amplitude();
    float freq = targeting_get_sweep_frequency();
    ASSERT_TRUE(amp >= 0.0f && amp <= 45.0f,
        "sweep amplitude within valid range after concurrent writes");
    ASSERT_TRUE(freq >= 0.5f && freq <= 5.0f,
        "sweep frequency within valid range after concurrent writes");
}

/* ══════════════════════════════════════════════════════════════════
 * Concurrent: stats read while tracking
 * ══════════════════════════════════════════════════════════════════ */

static volatile int g_stats_errors = 0;

static void *stats_reader_thread(void *arg) {
    (void)arg;
    target_stats_t stats;

    for (int i = 0; i < CONCURRENT_ITERATIONS; i++) {
        targeting_get_stats(&stats);
        /* Sanity check: lost_count should never exceed target_count */
        if (stats.lost_count > stats.target_count + 1) {
            __sync_fetch_and_add(&g_stats_errors, 1);
        }
    }
    return NULL;
}

void test_concurrent_stats_read(void) {
    /* Read stats while targeting is actively tracking. */
    g_stats_errors = 0;

    button_handler_arm();
    laser_controller_arm();
    safety_set_detection_active(true);
    safety_feed_watchdog();
    safety_validate_tilt(-5.0f);

    pthread_t reader;
    pthread_create(&reader, NULL, stats_reader_thread, NULL);

    detection_box_t det = make_detection(100, 100, 50, 50, 0.9f);
    for (int i = 0; i < CONCURRENT_ITERATIONS; i++) {
        if (i % 5 == 0) {
            targeting_process_detections(&det, 1);
        } else {
            targeting_update();
        }
        targeting_test_advance_time(50);
    }

    pthread_join(reader, NULL);

    ASSERT_EQ(0, g_stats_errors,
        "stats remain consistent during concurrent access");
}

/* ══════════════════════════════════════════════════════════════════
 * Cleanup race: cleanup while update running
 * ══════════════════════════════════════════════════════════════════ */

void test_cleanup_during_idle(void) {
    /* Cleanup from idle state should always be safe. */
    ASSERT_EQ(TARGET_STATE_IDLE, targeting_get_state(),
        "should start in idle state");

    targeting_cleanup();

    /* Re-init and verify clean state */
    servo_controller_init();
    coord_mapper_init(NULL);
    laser_controller_init();
    targeting_init();

    ASSERT_EQ(TARGET_STATE_IDLE, targeting_get_state(),
        "should be idle after re-init");
}

void test_cleanup_during_tracking(void) {
    /* Cleanup while actively tracking — laser must turn off. */
    button_handler_arm();
    laser_controller_arm();
    safety_set_detection_active(true);
    safety_feed_watchdog();
    safety_validate_tilt(-5.0f);

    detection_box_t det = make_detection(100, 100, 50, 50, 0.9f);
    targeting_process_detections(&det, 1);

    /* Now cleanup mid-track */
    targeting_cleanup();

    ASSERT_FALSE(laser_controller_is_active(),
        "laser must be off after cleanup during tracking");
}

/* ══════════════════════════════════════════════════════════════════
 * Double-fire prevention: lost handler from two paths
 * ══════════════════════════════════════════════════════════════════ */

void test_lost_callback_not_doubled(void) {
    /* When target is lost, the lost callback should fire exactly once,
     * not doubled from both process_detections and targeting_update paths. */
    button_handler_arm();
    laser_controller_arm();
    safety_set_detection_active(true);
    safety_feed_watchdog();
    safety_validate_tilt(-5.0f);

    /* Acquire a target */
    detection_box_t det = make_detection(100, 100, 50, 50, 0.9f);
    targeting_process_detections(&det, 1);

    int initial_lost = g_lost_cb_count;

    /* Advance time past lost timeout (~500ms) and send no detections */
    targeting_test_advance_time(600);
    targeting_update();

    /* Advance more to make sure we don't get a second lost callback */
    targeting_test_advance_time(200);
    targeting_update();
    targeting_test_advance_time(200);
    targeting_update();

    int lost_fires = g_lost_cb_count - initial_lost;
    ASSERT_TRUE(lost_fires <= 1,
        "lost callback should fire at most once per lost event");
}

/* ══════════════════════════════════════════════════════════════════
 * Main
 * ══════════════════════════════════════════════════════════════════ */

int main(void) {
    TEST_BEGIN("targeting_threadsafe [P0]");

    /* R-004: Callback safety */
    RUN_TEST(test_callbacks_not_reentrant);
    RUN_TEST(test_callback_receives_valid_snapshot);

    /* Concurrent access */
    RUN_TEST(test_concurrent_read_during_update);
    RUN_TEST(test_concurrent_process_and_update);
    RUN_TEST(test_concurrent_config_and_update);
    RUN_TEST(test_concurrent_stats_read);

    /* Cleanup safety */
    RUN_TEST(test_cleanup_during_idle);
    RUN_TEST(test_cleanup_during_tracking);

    /* Double-fire prevention */
    RUN_TEST(test_lost_callback_not_doubled);

    TEST_END();
}
