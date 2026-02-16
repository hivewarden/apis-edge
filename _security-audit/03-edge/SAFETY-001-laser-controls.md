# SAFETY-001: Laser Safety Control Audit

**Audit Date:** 2026-01-31
**Auditor:** Claude Opus 4.5 Security Audit
**Component:** APIS Edge Device Firmware
**Risk Level:** LIFE-SAFETY CRITICAL

---

## Executive Summary

This audit examines the laser safety controls in the APIS edge device firmware. The system controls a laser intended to deter Asian hornets from beehives. Misuse or malfunction could cause **eye damage** or **fire hazards**.

Overall, the safety architecture demonstrates good design principles with multiple layers of protection. However, several vulnerabilities were identified that could allow the laser to fire unexpectedly or fail to turn off under certain conditions.

**Key Findings:**
- 3 CRITICAL vulnerabilities
- 4 HIGH vulnerabilities
- 2 MEDIUM vulnerabilities

---

## Finding 1: Targeting Module Bypasses Safety Layer for Laser Activation

**Severity:** CRITICAL
**CWE:** CWE-284 (Improper Access Control)
**Location:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/laser/targeting.c`

### Description

The targeting module directly calls `laser_controller_on()` instead of going through the safety layer wrapper `safety_laser_on()`. This bypasses all safety checks including tilt validation, detection active check, watchdog status, and brownout detection.

### Vulnerable Code

**File:** `targeting.c`, lines 379-388:
```c
// Activate laser if armed
if (laser_controller_is_armed()) {
    if (!laser_controller_is_active() && !laser_controller_is_in_cooldown()) {
        laser_controller_on();  // DIRECT CALL - BYPASSES SAFETY LAYER
    }

    if (g_state != TARGET_STATE_TRACKING) {
        set_state(TARGET_STATE_TRACKING);
    }
}
```

**File:** `targeting.c`, lines 446-450:
```c
if (g_current_target.active) {
    set_state(TARGET_STATE_TRACKING);
    // Re-activate laser
    laser_controller_on();  // DIRECT CALL - BYPASSES SAFETY LAYER
}
```

### Safety Scenario

1. User arms the system via button
2. Servo malfunctions and tilts laser UPWARD (toward a person's face)
3. Detection triggers on any object
4. Targeting module calls `laser_controller_on()` directly
5. Laser fires at upward angle because tilt safety check was bypassed
6. **POTENTIAL EYE INJURY**

### Remediation

Replace all `laser_controller_on()` calls in targeting.c with `safety_laser_on()`:

```c
// BEFORE (UNSAFE):
laser_controller_on();

// AFTER (SAFE):
if (safety_laser_on() != SAFETY_OK) {
    LOG_DEBUG("Laser activation blocked by safety layer");
    // Continue tracking but laser stays off
}
```

**File modification required:** `targeting.c` lines 382, 450

### Acceptance Criteria

- [ ] All `laser_controller_on()` calls in targeting.c replaced with `safety_laser_on()`
- [ ] Unit test added: laser does not fire when tilt is upward, even during active tracking
- [ ] Unit test added: laser does not fire when safety layer is in safe mode
- [ ] Integration test: targeting module properly handles safety rejection

---

## Finding 2: HTTP API Arm Command Lacks Safety Pre-checks

**Severity:** CRITICAL
**CWE:** CWE-306 (Missing Authentication for Critical Function), CWE-862 (Missing Authorization)
**Location:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/http/http_server.c`

### Description

The `/arm` HTTP endpoint allows any network client to arm the laser system without:
1. Authentication
2. Authorization
3. Safety state verification (system could be in safe mode)
4. Physical button confirmation

A malicious actor on the local network could remotely arm the device.

### Vulnerable Code

**File:** `http_server.c`, lines 653-677:
```c
static void handle_arm(int client_fd, const http_request_t *req) {
    (void)req;

    // NO AUTHENTICATION CHECK
    // NO AUTHORIZATION CHECK
    // NO SAFETY STATE CHECK

    if (config_manager_set_armed(true) < 0) {
        http_send_error(client_fd, HTTP_INTERNAL_ERROR, "Failed to arm device");
        return;
    }

    // Update LED state
    if (led_controller_is_initialized()) {
        led_controller_clear_state(LED_STATE_DISARMED);
        led_controller_set_state(LED_STATE_ARMED);
    }

    // LASER CAN NOW FIRE - no confirmation required
    // ...
}
```

### Safety Scenario

1. Attacker connects to local network
2. Attacker discovers APIS device (port 8080)
3. Attacker sends `POST /arm` with no credentials
4. Device is armed and laser can now fire
5. If detection triggers, laser activates without user knowledge

### Remediation

Add multiple safety layers to arm endpoint:

```c
static void handle_arm(int client_fd, const http_request_t *req) {
    (void)req;

    // 1. Check if remote arming is enabled in config
    const runtime_config_t *cfg = config_manager_get();
    if (!cfg || !cfg->allow_remote_arm) {
        http_send_error(client_fd, HTTP_FORBIDDEN,
            "Remote arming disabled - use physical button");
        return;
    }

    // 2. Verify API key authentication (if configured)
    const char *api_key = http_get_header(req, "X-API-Key");
    if (cfg->require_api_key && !verify_api_key(api_key, cfg->api_key_hash)) {
        http_send_error(client_fd, HTTP_UNAUTHORIZED, "Invalid API key");
        return;
    }

    // 3. Check safety layer state
    if (safety_is_safe_mode()) {
        http_send_error(client_fd, HTTP_CONFLICT,
            "Cannot arm - system in safe mode. Reset required.");
        return;
    }

    // 4. Log the arm request with source IP
    LOG_WARN("Remote arm request from %s", client_ip);

    // Proceed with arming...
}
```

### Acceptance Criteria

- [ ] Remote arming requires explicit config enable (default: disabled)
- [ ] API key authentication option added
- [ ] Safety mode check prevents arming while in safe mode
- [ ] All arm/disarm requests logged with source IP
- [ ] Rate limiting added to prevent brute force

---

## Finding 3: Race Condition Between Disarm and Laser Fire

**Severity:** CRITICAL
**CWE:** CWE-362 (Concurrent Execution using Shared Resource with Improper Synchronization)
**Location:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/laser/laser_controller.c`

### Description

A race condition exists between the disarm operation and laser activation. The targeting module can call `laser_controller_on()` between the time `laser_controller_disarm()` sets `g_armed = false` and when it turns off the laser.

### Vulnerable Code

**File:** `laser_controller.c`, lines 422-438:
```c
void laser_controller_disarm(void) {
    if (!g_initialized) return;

    LASER_LOCK();

    // Turn off laser first if active
    if (g_laser_on) {
        turn_off_internal();
    }

    g_armed = false;  // *** WINDOW: Other thread could see armed=true here
    set_state(LASER_STATE_OFF);

    LASER_UNLOCK();

    LOG_INFO("Laser disarmed");
}
```

**Concurrent path in targeting.c:**
```c
if (laser_controller_is_armed()) {  // Reads armed state
    // RACE: disarm() could be called here
    if (!laser_controller_is_active() && !laser_controller_is_in_cooldown()) {
        laser_controller_on();  // Could succeed if disarm not complete
    }
}
```

### Safety Scenario

1. User presses button to disarm (SYSTEM_MODE_ARMED -> SYSTEM_MODE_DISARMED)
2. Button handler calls `laser_controller_disarm()`
3. Simultaneously, targeting thread has just passed `laser_controller_is_armed()` check
4. Disarm acquires lock, turns off laser, sets armed=false
5. Targeting thread calls `laser_controller_on()` - check inside sees armed=false, blocks
6. **IN WORSE TIMING:** targeting reads is_armed() as true, then on() check sees armed=true before disarm completes

The actual window is small but exists because `is_armed()` releases the lock before `on()` acquires it.

### Remediation

Add atomic disarm sequence that prevents concurrent activation:

```c
void laser_controller_disarm(void) {
    if (!g_initialized) return;

    LASER_LOCK();

    // Set disarmed FIRST to block any concurrent on() attempts
    g_armed = false;

    // NOW turn off if active (no race possible - already disarmed)
    if (g_laser_on) {
        turn_off_internal();
    }

    set_state(LASER_STATE_OFF);

    LASER_UNLOCK();

    LOG_INFO("Laser disarmed");
}
```

Additionally, targeting.c should use atomic check-and-activate pattern:

```c
// In targeting.c - use safety layer which does atomic check
safety_status_t status = safety_laser_on();
if (status != SAFETY_OK) {
    // Laser not activated - this is expected when disarmed
}
```

### Acceptance Criteria

- [ ] Disarm sets armed=false BEFORE turning off laser
- [ ] Test: concurrent disarm during targeting does not allow laser activation
- [ ] Test: rapid arm/disarm cycling never leaves laser in unexpected state
- [ ] Targeting uses safety_laser_on() for atomic check-and-activate

---

## Finding 4: No Hardware Watchdog for Laser GPIO

**Severity:** HIGH
**CWE:** CWE-703 (Improper Check or Handling of Exceptional Conditions)
**Location:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/laser/laser_controller.c`

### Description

If the main firmware crashes or hangs while the laser is active, there is no hardware watchdog to ensure the laser turns off. The software watchdog in the safety layer only works if `safety_update()` is being called.

### Vulnerable Code

The laser GPIO is controlled via direct GPIO writes with no hardware failsafe:

```c
// laser_controller.c - gpio_set_laser()
static void gpio_set_laser(bool on) {
    if (g_gpio_value_fd >= 0) {
        const char *val = on ? "1" : "0";
        if (write(g_gpio_value_fd, val, 1) < 0) {
            LOG_ERROR("Failed to set GPIO %d: %s", GPIO_LASER_CONTROL, strerror(errno));
        }
    }
    g_laser_on = on;  // If crash happens here, GPIO stays HIGH
}
```

### Safety Scenario

1. Laser is activated during detection
2. Firmware crashes due to memory corruption or stack overflow
3. `safety_update()` stops being called
4. Software watchdog cannot trigger
5. **LASER REMAINS ON INDEFINITELY**

### Remediation

Implement hardware watchdog using ESP32/Pi hardware timer:

```c
// For ESP32:
#include "esp_task_wdt.h"

void laser_init_hardware_watchdog(void) {
    // Configure hardware watchdog - will reset system if not fed
    esp_task_wdt_config_t wdt_config = {
        .timeout_ms = LASER_MAX_ON_TIME_MS + 1000,  // 11 seconds
        .trigger_panic = true,
    };
    esp_task_wdt_init(&wdt_config);
    esp_task_wdt_add(NULL);  // Add current task
}

// In laser_controller_on():
void laser_controller_on(void) {
    // ... existing code ...

    // Feed watchdog when laser turns on - must be fed regularly or system resets
    esp_task_wdt_reset();
}

// In laser_controller_update() - called regularly:
void laser_controller_update(void) {
    // ... existing code ...

    // Only feed watchdog if laser is OFF or within time limit
    if (!g_laser_on || get_on_time() < LASER_MAX_ON_TIME_MS) {
        esp_task_wdt_reset();
    }
    // If laser on too long - don't feed - system will reset
}
```

Alternative: Use external watchdog IC that physically cuts laser power if not toggled.

### Acceptance Criteria

- [ ] Hardware watchdog implemented for ESP32 (esp_task_wdt)
- [ ] Pi implementation uses /dev/watchdog or pigpio watchdog
- [ ] System auto-resets if laser_controller_update() not called for 11 seconds
- [ ] Test: induce firmware crash while laser active, verify laser turns off

---

## Finding 5: Missing Mutex Protection for safety_is_initialized() Check

**Severity:** HIGH
**CWE:** CWE-362 (Race Condition), CWE-366 (Race Condition within a Thread)
**Location:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/safety/safety_layer.c`

### Description

The `safety_is_initialized()` function reads `ctx.initialized` without mutex protection. During initialization or cleanup, another thread could see a partially initialized/cleaned state.

### Vulnerable Code

**File:** `safety_layer.c`, lines 653-655:
```c
bool safety_is_initialized(void) {
    return ctx.initialized;  // NO LOCK - reads shared state unsafely
}
```

This is called by various functions without protection:

```c
safety_status_t safety_check(uint32_t checks, safety_result_t *result) {
    if (!ctx.initialized) {  // NO LOCK - check could be stale
        if (result) {
            memset(result, 0, sizeof(safety_result_t));
            result->status = SAFETY_ERROR_NOT_INITIALIZED;
        }
        return SAFETY_ERROR_NOT_INITIALIZED;
    }

    SAFETY_LOCK();  // Lock acquired AFTER initialized check
    // ...
}
```

### Safety Scenario

1. Thread A calls `safety_cleanup()` - acquires lock, sets initialized=false
2. Thread B calls `safety_check()` - sees initialized=true (stale read)
3. Thread A releases lock, context is zeroed
4. Thread B acquires lock, operates on zeroed context
5. **UNDEFINED BEHAVIOR** - callbacks could point to freed memory

### Remediation

Use atomic operations or acquire lock before checking:

```c
bool safety_is_initialized(void) {
    SAFETY_LOCK();
    bool result = ctx.initialized;
    SAFETY_UNLOCK();
    return result;
}

// Or use atomic:
#include <stdatomic.h>
static atomic_bool g_initialized = false;
```

For all public functions, check inside the lock:

```c
safety_status_t safety_check(uint32_t checks, safety_result_t *result) {
    SAFETY_LOCK();

    if (!ctx.initialized) {
        SAFETY_UNLOCK();
        if (result) {
            memset(result, 0, sizeof(safety_result_t));
            result->status = SAFETY_ERROR_NOT_INITIALIZED;
        }
        return SAFETY_ERROR_NOT_INITIALIZED;
    }

    // Continue with check...
}
```

### Acceptance Criteria

- [ ] All public safety_layer functions check initialized inside lock
- [ ] `safety_is_initialized()` acquires lock or uses atomic read
- [ ] Test: concurrent init/cleanup/check operations are safe
- [ ] No TSAN (Thread Sanitizer) warnings

---

## Finding 6: Button Handler Emergency Stop Could Be Bypassed via HTTP

**Severity:** HIGH
**CWE:** CWE-287 (Improper Authentication)
**Location:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/http/http_server.c`, `/Users/jermodelaruelle/Projects/apis/apis-edge/src/button/button_handler.c`

### Description

The HTTP `/arm` endpoint does not check if the system is in emergency stop mode. A user could press the emergency stop button, then a remote attacker could re-arm via HTTP, defeating the physical safety control.

### Vulnerable Code

**http_server.c** `/arm` handler:
```c
static void handle_arm(int client_fd, const http_request_t *req) {
    (void)req;

    // NO CHECK FOR EMERGENCY STOP STATE

    if (config_manager_set_armed(true) < 0) {
        http_send_error(client_fd, HTTP_INTERNAL_ERROR, "Failed to arm device");
        return;
    }
    // ...
}
```

**button_handler.c** - emergency stop via long press:
```c
static void handle_long_press(void) {
    ctx.stats.long_press_count++;
    // Emergency stop regardless of current mode
    set_mode_internal(SYSTEM_MODE_EMERGENCY_STOP, true);
    // ...
}
```

The emergency stop mode is local to button_handler - HTTP handler doesn't check it.

### Safety Scenario

1. User detects dangerous situation, holds button for 3 seconds
2. Emergency stop engages - laser turns off, LED shows error
3. User believes system is safely stopped
4. Attacker sends `POST /arm` via HTTP
5. **SYSTEM RE-ARMS WHILE USER BELIEVES IT'S STOPPED**
6. Laser could fire unexpectedly

### Remediation

HTTP arm handler must check button handler emergency state:

```c
static void handle_arm(int client_fd, const http_request_t *req) {
    // Check if emergency stop is active
    if (button_handler_is_initialized() && button_handler_is_emergency_stop()) {
        http_send_error(client_fd, HTTP_CONFLICT,
            "Cannot arm - emergency stop active. Clear via physical button.");
        return;
    }

    // Also check safety layer
    if (safety_is_safe_mode()) {
        http_send_error(client_fd, HTTP_CONFLICT,
            "Cannot arm - system in safe mode. Physical reset required.");
        return;
    }

    // Proceed with arming...
}
```

### Acceptance Criteria

- [ ] HTTP `/arm` checks button_handler emergency stop state
- [ ] HTTP `/arm` checks safety_layer safe mode state
- [ ] Emergency stop can only be cleared via physical button (not HTTP)
- [ ] Test: HTTP arm fails while in emergency stop mode

---

## Finding 7: Callback Invocation Outside Mutex Could Cause Use-After-Free

**Severity:** HIGH
**CWE:** CWE-416 (Use After Free), CWE-362 (Race Condition)
**Location:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/laser/laser_controller.c`

### Description

The timeout callback is invoked after releasing and re-acquiring the mutex. If the callback is changed by another thread during this window, the old callback could be called with invalid user_data pointer.

### Vulnerable Code

**File:** `laser_controller.c`, lines 600-606:
```c
// Invoke timeout callback
if (g_timeout_callback != NULL) {
    LASER_UNLOCK();  // *** RELEASE LOCK
    g_timeout_callback(duration, g_timeout_callback_data);  // *** CALL WITH OLD VALUES
    LASER_LOCK();   // *** REACQUIRE - callback pointer could have changed
}
```

### Safety Scenario

1. Thread A is in `laser_controller_update()`, laser times out
2. Thread A sees `g_timeout_callback != NULL`, releases lock
3. Thread B calls `laser_controller_set_timeout_callback(NULL, NULL)`
4. Thread B frees the old `user_data` structure
5. Thread A calls old callback with freed `g_timeout_callback_data`
6. **USE-AFTER-FREE** - undefined behavior, potential crash or security issue

### Remediation

Copy callback pointers under lock before invoking:

```c
// In laser_controller_update():
if (g_timeout_callback != NULL) {
    // Copy callback info while holding lock
    laser_timeout_callback_t cb = g_timeout_callback;
    void *user_data = g_timeout_callback_data;

    LASER_UNLOCK();
    cb(duration, user_data);  // Call with copied values
    LASER_LOCK();
}
```

This doesn't fully solve the race but reduces the window. For complete safety, use reference counting or disallow callback changes while active.

### Acceptance Criteria

- [ ] All callback invocations copy function pointer under lock
- [ ] Document that callbacks must not be changed while laser is active
- [ ] Consider reference counting for user_data lifetimes
- [ ] Test: callback change during active laser doesn't crash

---

## Finding 8: No Validation of Network-Received Detection Boxes

**Severity:** MEDIUM
**CWE:** CWE-20 (Improper Input Validation)
**Location:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/laser/targeting.c`

### Description

The targeting system processes detection boxes without validating that coordinates are within valid camera frame bounds. Malformed or malicious detection data could cause out-of-bounds pixel-to-angle calculations.

### Vulnerable Code

**File:** `targeting.c`, lines 293-399 (targeting_process_detections):
```c
target_status_t targeting_process_detections(const detection_box_t *detections, uint32_t count) {
    // ...
    int best_idx = select_best_target(detections, count);

    if (best_idx < 0) {
        // No valid targets
        // ...
    }

    // NO VALIDATION of detection box coordinates
    const detection_box_t *det = &detections[best_idx];
    pixel_coord_t centroid = box_to_centroid(det);  // Could be negative or huge

    // Convert to servo angles - what if coordinates are way off?
    servo_position_t target_angle;
    coord_mapper_pixel_to_angle(centroid, &target_angle);
    // ...
}
```

### Safety Scenario

1. Attacker discovers network protocol for sending detections
2. Attacker sends detection with coordinates (99999, 99999)
3. Coordinate mapper produces extreme angles outside safe range
4. Servo clamps but unexpected behavior occurs
5. Or: Detection with (0, -1000) causes arithmetic overflow

### Remediation

Add input validation for detection coordinates:

```c
#define FRAME_WIDTH  640  // From camera config
#define FRAME_HEIGHT 480

static bool validate_detection(const detection_box_t *det) {
    if (det->x < 0 || det->y < 0) return false;
    if (det->width <= 0 || det->height <= 0) return false;
    if (det->x + det->width > FRAME_WIDTH) return false;
    if (det->y + det->height > FRAME_HEIGHT) return false;
    return true;
}

target_status_t targeting_process_detections(...) {
    // Validate all detections first
    for (uint32_t i = 0; i < count; i++) {
        if (!validate_detection(&detections[i])) {
            LOG_WARN("Invalid detection box rejected: (%d,%d) %dx%d",
                     detections[i].x, detections[i].y,
                     detections[i].width, detections[i].height);
            return TARGET_ERROR_INVALID_PARAM;
        }
    }
    // Continue...
}
```

### Acceptance Criteria

- [ ] Detection coordinates validated against camera frame bounds
- [ ] Invalid detections logged and rejected
- [ ] Coordinate mapper validates input ranges
- [ ] Test: malformed detection data doesn't cause crash or unexpected behavior

---

## Finding 9: safety_laser_pulse Does Not Actually Pulse - Requires Caller Timing

**Severity:** MEDIUM
**CWE:** CWE-672 (Operation on a Resource after Expiration or Release)
**Location:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/safety/safety_layer.c`

### Description

The `safety_laser_pulse()` function is documented to perform a timed pulse but actually just turns the laser on and expects the caller to manage timing. If the caller forgets to turn off the laser, it will fire for the full 10-second timeout.

### Vulnerable Code

**File:** `safety_layer.c`, lines 745-780:
```c
safety_status_t safety_laser_pulse(uint32_t duration_ms) {
    // ...

    // All checks passed - activate laser
    if (!laser_controller_is_initialized()) {
        return SAFETY_ERROR_NOT_INITIALIZED;
    }

    laser_status_t laser_status = laser_controller_on();
    if (laser_status != LASER_OK) {
        return SAFETY_ERROR_NOT_INITIALIZED;
    }

    // Note: Actual timing should be handled by caller with safety_update() calls
    // This function just validates and initiates - caller must manage duration
    log_debug("safety_laser_pulse: pulse initiated for %u ms", duration_ms);
    return SAFETY_OK;

    // *** NEVER TURNS OFF LASER - relies on caller
}
```

### Safety Scenario

1. Developer calls `safety_laser_pulse(100)` expecting 100ms pulse
2. Function returns SAFETY_OK
3. Developer assumes pulse is done or will auto-stop
4. **LASER STAYS ON** until 10-second timeout

### Remediation

Either implement actual pulse timing or clearly document and rename:

**Option A:** Implement actual pulse (recommended):
```c
safety_status_t safety_laser_pulse(uint32_t duration_ms) {
    // ... safety checks ...

    laser_status_t laser_status = laser_controller_on();
    if (laser_status != LASER_OK) {
        return SAFETY_ERROR_NOT_INITIALIZED;
    }

    // Sleep for duration
    apis_sleep_ms(duration_ms);

    // Always turn off
    laser_controller_off();

    return SAFETY_OK;
}
```

**Option B:** Rename to be explicit:
```c
// Rename function to indicate it doesn't auto-stop
safety_status_t safety_laser_initiate(uint32_t max_duration_ms);
// Document: "Caller MUST call safety_laser_off() to stop laser"
```

### Acceptance Criteria

- [ ] `safety_laser_pulse()` either implements actual timed pulse OR
- [ ] Function renamed and documented that caller must stop laser
- [ ] Test: pulse function behavior matches documentation
- [ ] No code path leaves laser on unintentionally

---

## Positive Findings

The following security controls are **correctly implemented**:

### 1. Tilt Safety Check (CORRECT)
**Location:** `safety_layer.c`, lines 316-322, 503-537

The system correctly prevents laser firing when tilt angle is upward (positive). The check is performed both on the requested angle AND verifies against actual servo position if available.

```c
if (ctx.current_tilt_deg > SAFETY_TILT_MAX_DEG) {
    local_result.failed_checks |= SAFETY_CHECK_TILT;
    ctx.stats.tilt_failures++;
    log_warn("Safety check failed: tilt angle %.1f° is UPWARD (max %.1f°)",
             ctx.current_tilt_deg, SAFETY_TILT_MAX_DEG);
}
```

### 2. Maximum On-Time Enforcement (CORRECT)
**Location:** `laser_controller.c`, lines 576-621

The laser controller correctly enforces a 10-second maximum continuous on-time and automatically turns off the laser when exceeded.

### 3. Cooldown Period (CORRECT)
**Location:** `laser_controller.c`, lines 262-286, 354-359

A 5-second cooldown period is enforced between laser activations, preventing thermal damage.

### 4. Kill Switch (CORRECT)
**Location:** `laser_controller.c`, lines 470-489

The kill switch immediately turns off the laser and prevents re-activation until manually reset.

### 5. Fail-Safe GPIO Initialization (CORRECT)
**Location:** `laser_controller.c`, lines 166-169

GPIO is initialized to OFF state at startup before any other code runs.

### 6. Thread Safety (MOSTLY CORRECT)
**Location:** All modules

Most operations are properly protected with mutexes. Lock ordering is documented to prevent deadlocks.

### 7. Emergency Stop Physical Override (CORRECT)
**Location:** `button_handler.c`, lines 359-365

Long button press triggers emergency stop regardless of software state.

---

## Summary of Required Changes

| Priority | Finding | Fix Complexity |
|----------|---------|----------------|
| CRITICAL | #1 targeting.c bypasses safety layer | LOW - replace function calls |
| CRITICAL | #2 HTTP arm lacks authentication | MEDIUM - add auth checks |
| CRITICAL | #3 Race condition in disarm | LOW - reorder operations |
| HIGH | #4 No hardware watchdog | MEDIUM - platform-specific |
| HIGH | #5 Mutex-less initialized check | LOW - add lock |
| HIGH | #6 Emergency stop bypass via HTTP | LOW - add state check |
| HIGH | #7 Callback use-after-free | LOW - copy pointers |
| MEDIUM | #8 No detection validation | LOW - add bounds check |
| MEDIUM | #9 Pulse function misleading | LOW - implement or rename |

---

## Test Plan

To verify remediation of these findings, the following tests MUST pass:

1. **Safety Layer Integration Test:**
   - Arm system, set upward tilt, trigger detection
   - Verify laser does NOT fire (currently FAILS - Finding #1)

2. **HTTP Security Test:**
   - Attempt `/arm` without API key when required
   - Verify rejection (currently no API key support - Finding #2)

3. **Race Condition Test:**
   - Rapid arm/disarm while targeting is active
   - Verify no unexpected laser activations (Finding #3)

4. **Watchdog Test:**
   - Induce firmware hang while laser active
   - Verify laser turns off within 11 seconds (Finding #4)

5. **Thread Safety Test:**
   - Run with Thread Sanitizer enabled
   - Verify no data races reported (Findings #5, #7)

6. **Emergency Override Test:**
   - Press emergency stop, then send HTTP `/arm`
   - Verify arm is rejected (Finding #6)

---

*End of Audit Report*
