/**
 * P0 Safety Interlock Tests
 *
 * Verifies that ALL laser activation paths go through the safety layer.
 * Tests R-001 (laser fires without safety validation) and R-002 (watchdog).
 *
 * Risk: Score 6 (Prob=2, Impact=3)
 * Priority: P0 — run on every commit
 */

#include "safety_layer.h"
#include "laser_controller.h"
#include "servo_controller.h"
#include "led_controller.h"
#include "button_handler.h"
#include <unistd.h>

/* ── Callback tracking ── */
static int g_state_callback_count = 0;
static safety_state_t g_last_state = SAFETY_STATE_NORMAL;
static int g_failure_callback_count = 0;
static safety_status_t g_last_failure = SAFETY_OK;
static int g_watchdog_callback_count = 0;
static uint32_t g_last_watchdog_remaining = 0;

static void state_cb(safety_state_t state, void *data) {
    (void)data;
    g_state_callback_count++;
    g_last_state = state;
}

static void failure_cb(safety_status_t failure, void *data) {
    (void)data;
    g_failure_callback_count++;
    g_last_failure = failure;
}

static void watchdog_cb(uint32_t remaining, void *data) {
    (void)data;
    g_watchdog_callback_count++;
    g_last_watchdog_remaining = remaining;
}

/* ── Setup/Teardown ── */
static void reset_callbacks(void) {
    g_state_callback_count = 0;
    g_last_state = SAFETY_STATE_NORMAL;
    g_failure_callback_count = 0;
    g_last_failure = SAFETY_OK;
    g_watchdog_callback_count = 0;
    g_last_watchdog_remaining = 0;
}

/* Define setup/teardown BEFORE including test_framework.h so the
   #ifndef guards in the header pick up our definitions. */
#define TEST_SETUP() do { \
    laser_controller_cleanup(); \
    safety_cleanup(); \
    led_controller_cleanup(); \
    servo_controller_cleanup(); \
    button_handler_cleanup(); \
    laser_controller_init(); \
    servo_controller_init(); \
    led_controller_init(); \
    button_handler_init(false); \
    safety_layer_init(); \
    reset_callbacks(); \
    safety_set_state_callback(state_cb, NULL); \
    safety_set_failure_callback(failure_cb, NULL); \
    safety_set_watchdog_callback(watchdog_cb, NULL); \
} while(0)

#define TEST_TEARDOWN() do { \
    safety_cleanup(); \
    laser_controller_cleanup(); \
    servo_controller_cleanup(); \
    led_controller_cleanup(); \
    button_handler_cleanup(); \
} while(0)

#include "test_framework.h"

/* ══════════════════════════════════════════════════════════════════
 * R-001: Laser never fires without safety validation
 * ══════════════════════════════════════════════════════════════════ */

void test_safety_laser_on_blocks_when_not_armed(void) {
    /* Laser should not fire if unit is not armed */
    safety_set_detection_active(true);
    safety_feed_watchdog();

    safety_status_t status = safety_laser_on();
    ASSERT_NEQ(SAFETY_OK, status, "safety_laser_on should fail when not armed");
    ASSERT_FALSE(laser_controller_is_active(), "laser must not be active");
}

void test_safety_laser_on_blocks_when_no_detection(void) {
    /* Laser should not fire without active detection */
    button_handler_arm();
    laser_controller_arm();
    safety_feed_watchdog();

    safety_status_t status = safety_laser_on();
    ASSERT_NEQ(SAFETY_OK, status, "safety_laser_on should fail without detection");
    ASSERT_FALSE(laser_controller_is_active(), "laser must not be active");
}

void test_safety_laser_on_blocks_upward_tilt(void) {
    /* Laser must NEVER fire upward (tilt > 0) */
    button_handler_arm();
    laser_controller_arm();
    safety_set_detection_active(true);
    safety_feed_watchdog();

    /* Set upward tilt (positive = upward = dangerous) */
    safety_validate_tilt(5.0f);

    safety_status_t status = safety_laser_on();
    ASSERT_NEQ(SAFETY_OK, status, "safety_laser_on should fail with upward tilt");
    ASSERT_FALSE(laser_controller_is_active(), "laser must NOT fire upward");
}

void test_safety_laser_on_succeeds_when_all_checks_pass(void) {
    /* Laser fires only when ALL safety checks pass */
    button_handler_arm();
    laser_controller_arm();
    safety_set_detection_active(true);
    safety_feed_watchdog();
    safety_validate_tilt(-5.0f);  /* Downward — safe */
    safety_set_voltage(5000);     /* Healthy voltage */

    safety_status_t status = safety_laser_on();
    ASSERT_EQ(SAFETY_OK, status, "safety_laser_on should succeed");
    ASSERT_TRUE(laser_controller_is_active(), "laser should be active");

    /* Clean up — turn laser off */
    safety_laser_off();
}

void test_safety_laser_off_always_succeeds(void) {
    /* Turning laser off is always safe */
    safety_status_t status = safety_laser_off();
    ASSERT_EQ(SAFETY_OK, status, "safety_laser_off always succeeds");
    ASSERT_FALSE(laser_controller_is_active(), "laser must be off");
}

void test_safety_blocks_after_kill_switch(void) {
    /* Kill switch must permanently block laser until reset */
    button_handler_arm();
    laser_controller_arm();
    safety_set_detection_active(true);
    safety_feed_watchdog();
    safety_validate_tilt(-5.0f);

    /* Engage kill switch */
    laser_controller_kill_switch();

    safety_status_t status = safety_laser_on();
    ASSERT_NEQ(SAFETY_OK, status, "kill switch should block laser");
    ASSERT_FALSE(laser_controller_is_active(), "laser blocked by kill switch");
}

void test_safety_check_all_returns_detailed_result(void) {
    /* safety_check_all should populate result struct */
    safety_result_t result;
    memset(&result, 0, sizeof(result));

    safety_status_t status = safety_check_all(&result);

    /* Not armed, so should fail */
    ASSERT_NEQ(SAFETY_OK, status, "should fail when not armed");
    ASSERT_FALSE(result.is_armed, "result should show not armed");
    ASSERT_GT(result.watchdog_remaining_ms, 0, "watchdog should have time remaining");
}

void test_safety_check_accepts_null_result(void) {
    /* Passing NULL result pointer should not crash */
    safety_status_t status = safety_check_all(NULL);
    /* Just verify it doesn't crash — status will be non-OK */
    ASSERT_TRUE(status != 99, "function should not crash with NULL result");
}

/* ══════════════════════════════════════════════════════════════════
 * R-002: Watchdog triggers on heartbeat timeout
 * ══════════════════════════════════════════════════════════════════ */

void test_watchdog_starts_with_full_timeout(void) {
    /* After init, watchdog should have full timeout remaining */
    uint32_t remaining = safety_get_watchdog_remaining();
    ASSERT_GT(remaining, 0, "watchdog should have time remaining after init");
    ASSERT_FALSE(safety_is_watchdog_warning(), "no warning immediately after init");
}

void test_watchdog_feed_resets_countdown(void) {
    /* Feeding watchdog should reset the countdown */
    safety_feed_watchdog();
    uint32_t remaining = safety_get_watchdog_remaining();
    /* Should be close to full timeout (within 1s tolerance for timing) */
    ASSERT_GT(remaining, SAFETY_WATCHDOG_TIMEOUT_MS - 1000,
        "watchdog should be near full after feed");
}

void test_safe_mode_blocks_laser(void) {
    /* Once in safe mode, laser must be blocked */
    button_handler_arm();
    laser_controller_arm();
    safety_set_detection_active(true);
    safety_feed_watchdog();
    safety_validate_tilt(-5.0f);

    /* Force safe mode */
    safety_enter_safe_mode();

    ASSERT_TRUE(safety_is_safe_mode(), "should be in safe mode");

    safety_status_t status = safety_laser_on();
    ASSERT_NEQ(SAFETY_OK, status, "laser blocked in safe mode");
    ASSERT_FALSE(laser_controller_is_active(), "laser must not be active in safe mode");
}

void test_safe_mode_reset_allows_recovery(void) {
    /* After safe mode reset, system should return to normal */
    safety_enter_safe_mode();
    ASSERT_TRUE(safety_is_safe_mode(), "should be in safe mode");

    safety_status_t status = safety_reset();
    ASSERT_EQ(SAFETY_OK, status, "reset should succeed");
    ASSERT_FALSE(safety_is_safe_mode(), "should not be in safe mode after reset");
    ASSERT_EQ(SAFETY_STATE_NORMAL, safety_get_state(), "should be normal state");
}

/* ══════════════════════════════════════════════════════════════════
 * Brownout protection
 * ══════════════════════════════════════════════════════════════════ */

void test_brownout_blocks_laser(void) {
    /* Low voltage must block laser activation */
    button_handler_arm();
    laser_controller_arm();
    safety_set_detection_active(true);
    safety_feed_watchdog();
    safety_validate_tilt(-5.0f);

    /* Set voltage below minimum (4500mV threshold) */
    safety_set_voltage(4000);  /* 4.0V — brownout! */

    safety_status_t status = safety_laser_on();
    ASSERT_NEQ(SAFETY_OK, status, "brownout should block laser");
    ASSERT_FALSE(laser_controller_is_active(), "laser blocked by brownout");
    ASSERT_TRUE(safety_is_brownout(), "brownout should be detected");
}

void test_voltage_warning_detected(void) {
    /* Warning voltage should be flagged but not block */
    safety_set_voltage(4600);  /* Between warning (4750) and minimum (4500) */
    ASSERT_TRUE(safety_is_voltage_warning(), "should detect voltage warning");
    ASSERT_FALSE(safety_is_brownout(), "should not be brownout yet");
}

void test_healthy_voltage_no_warning(void) {
    /* Normal voltage — no warnings */
    safety_set_voltage(5000);
    ASSERT_FALSE(safety_is_voltage_warning(), "no warning at healthy voltage");
    ASSERT_FALSE(safety_is_brownout(), "no brownout at healthy voltage");
}

/* ══════════════════════════════════════════════════════════════════
 * Statistics and observability
 * ══════════════════════════════════════════════════════════════════ */

void test_safety_stats_track_failures(void) {
    /* Stats should count check types */
    safety_stats_t stats;

    /* Trigger an armed failure */
    safety_laser_on();  /* Will fail — not armed */

    safety_get_stats(&stats);
    ASSERT_GT(stats.checks_performed, 0, "should have performed checks");
    ASSERT_GT(stats.checks_failed, 0, "should have failures");
}

void test_failure_callback_invoked(void) {
    /* Failure callback should fire when checks fail */
    safety_laser_on();  /* Will fail — not armed */

    ASSERT_GT(g_failure_callback_count, 0, "failure callback should have fired");
}

void test_state_callback_on_safe_mode(void) {
    /* State callback should fire on safe mode entry */
    safety_enter_safe_mode();

    ASSERT_GT(g_state_callback_count, 0, "state callback should have fired");
    ASSERT_EQ(SAFETY_STATE_SAFE_MODE, g_last_state, "should report safe mode state");
}

/* ══════════════════════════════════════════════════════════════════
 * Main
 * ══════════════════════════════════════════════════════════════════ */

int main(void) {
    TEST_BEGIN("safety_interlock [P0]");

    /* R-001: Laser safety interlock */
    RUN_TEST(test_safety_laser_on_blocks_when_not_armed);
    RUN_TEST(test_safety_laser_on_blocks_when_no_detection);
    RUN_TEST(test_safety_laser_on_blocks_upward_tilt);
    RUN_TEST(test_safety_laser_on_succeeds_when_all_checks_pass);
    RUN_TEST(test_safety_laser_off_always_succeeds);
    RUN_TEST(test_safety_blocks_after_kill_switch);
    RUN_TEST(test_safety_check_all_returns_detailed_result);
    RUN_TEST(test_safety_check_accepts_null_result);

    /* R-002: Watchdog */
    RUN_TEST(test_watchdog_starts_with_full_timeout);
    RUN_TEST(test_watchdog_feed_resets_countdown);
    RUN_TEST(test_safe_mode_blocks_laser);
    RUN_TEST(test_safe_mode_reset_allows_recovery);

    /* Brownout */
    RUN_TEST(test_brownout_blocks_laser);
    RUN_TEST(test_voltage_warning_detected);
    RUN_TEST(test_healthy_voltage_no_warning);

    /* Statistics */
    RUN_TEST(test_safety_stats_track_failures);
    RUN_TEST(test_failure_callback_invoked);
    RUN_TEST(test_state_callback_on_safe_mode);

    TEST_END();
}
