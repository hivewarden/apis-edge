# Stream 7: Edge Firmware -- Detection, Safety, Targeting

**Review Date:** 2026-02-06
**Reviewer:** Claude Opus 4.6 (automated security review)
**Scope:** Safety layer, laser controller, coordinate mapper, targeting, servo controller, button handler, detection pipeline (motion, tracker, classifier), and all associated tests.
**Priority:** LASER SAFETY IS THE HIGHEST PRIORITY

---

## Metrics

| Category | Count |
|----------|-------|
| Files reviewed | 28 |
| Source files | 14 |
| Header files | 8 |
| Test files | 6 |
| **CRITICAL findings** | **5** |
| **HIGH findings** | **6** |
| **MEDIUM findings** | **8** |
| **LOW findings** | **7** |
| **INFO findings** | **5** |

---

## CRITICAL

### C7-CRIT-001: Deadlock in safety_layer.c -- notify_failure() called while holding safety_mutex

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/safety/safety_layer.c:420`

**Risk:** The `notify_failure()` function at line 420 is called from within `safety_check()` while `safety_mutex` is held (acquired at line 293). However, `notify_failure()` itself acquires `safety_mutex` at line 167. Since `PTHREAD_MUTEX_INITIALIZER` creates a non-recursive (normal) mutex, re-locking from the same thread is undefined behavior per POSIX -- on most implementations this causes an immediate deadlock.

This means that whenever a safety check fails and a failure callback is registered, the system will deadlock. The safety layer becomes completely unresponsive, meaning the watchdog never fires, `safety_update()` never runs, and the laser cannot be turned off through the safety layer. On a real device, only the laser controller's own 10-second hardware timeout would eventually cut off the laser.

**Impact:** Complete system deadlock on any safety check failure when a failure callback is registered. Laser may remain on for up to 10 seconds (hardware timeout) with no safety oversight.

**Code path:**
```
safety_check() [holds safety_mutex at line 293]
  -> notify_failure(local_result.status) [line 420]
    -> SAFETY_LOCK() [line 167 -- DEADLOCK: already held]
```

**Fix:** Move `notify_failure()` call to after `SAFETY_UNLOCK()` at line 428. Store the failure status in a local variable and invoke after the lock is released:
```c
done:
    safety_status_t failure_to_notify = SAFETY_OK;
    if (local_result.failed_checks != 0) {
        failure_to_notify = local_result.status;
    }
    if (result) {
        memcpy(result, &local_result, sizeof(safety_result_t));
    }
    SAFETY_UNLOCK();

    if (failure_to_notify != SAFETY_OK) {
        notify_failure(failure_to_notify);
    }
    return local_result.status;
```

---

### C7-CRIT-002: Deadlock in safety_layer.c -- notify_watchdog_warning() called while holding safety_mutex

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/safety/safety_layer.c:495`

**Risk:** `notify_watchdog_warning()` is called at line 495 from within `safety_update()` while `safety_mutex` is held (acquired at line 477). The `notify_watchdog_warning()` function re-acquires `safety_mutex` at line 180. Same non-recursive mutex deadlock as C7-CRIT-001.

This means the watchdog warning can never be delivered. Worse, when the watchdog is approaching timeout and the system tries to warn, the entire safety update loop deadlocks. The watchdog then cannot fire its timeout handler, and the system cannot enter safe mode.

**Impact:** Safety update loop deadlocks when watchdog warning fires. Watchdog timeout cannot trigger safe mode entry. Laser may remain active indefinitely with no safety oversight.

**Fix:** Move `notify_watchdog_warning()` call to after `SAFETY_UNLOCK()`. Store remaining_ms in a local variable:
```c
uint32_t watchdog_warn_remaining = 0;
bool should_notify_watchdog = false;

// ... inside the warning check block:
should_notify_watchdog = true;
watchdog_warn_remaining = remaining;

// After SAFETY_UNLOCK():
if (should_notify_watchdog) {
    notify_watchdog_warning(watchdog_warn_remaining);
}
```

---

### C7-CRIT-003: Deadlock in safety_layer.c -- set_state_internal() calls notify_state_change() while holding safety_mutex

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/safety/safety_layer.c:199`

**Risk:** `set_state_internal()` at line 199 calls `notify_state_change()` which acquires `safety_mutex` at line 154. `set_state_internal()` is called from:
- `enter_safe_mode_internal()` (line 220) which is called from `safety_update()` (line 486) while holding safety_mutex
- `safety_feed_watchdog()` (line 441) while holding safety_mutex
- `safety_reset()` (line 613) while holding safety_mutex

All of these paths will deadlock the safety system when a state callback is registered.

**Impact:** Critical safety transitions (entering safe mode, watchdog feed, safety reset) deadlock the system when a state callback is registered. The system cannot enter safe mode, which is the ultimate fail-safe.

**Fix:** Refactor `set_state_internal()` to not invoke the callback directly. Instead, return a flag indicating state changed, and invoke the callback after the lock is released. All callers must be updated:
```c
static bool set_state_internal(safety_state_t new_state, safety_state_t *old_state_out) {
    if (ctx.state == new_state) return false;
    if (old_state_out) *old_state_out = ctx.state;
    ctx.state = new_state;
    return true; // caller should notify outside lock
}
```

---

### C7-CRIT-004: Laser state callback invoked while holding laser_mutex

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/laser/laser_controller.c:116-118`

**Risk:** The `set_state()` function at line 116-118 invokes `g_state_callback` while the caller holds `g_mutex` (laser_mutex). This function is called from:
- `laser_controller_on()` at line 374 (lock held at line 338)
- `laser_controller_off()` at lines 391-396 (lock held at line 385)
- `laser_controller_arm()` at line 415 (lock held at line 405)
- `laser_controller_disarm()` at line 440 (lock held at line 425)
- `laser_controller_kill_switch()` at line 491 (lock held at line 480)
- `laser_controller_reset_kill_switch()` at line 505 (lock held at line 501)
- `laser_controller_update()` at lines 613, 627-632 (lock held at line 586)

If the state callback (registered by another module) calls any laser_controller function that acquires the mutex, a deadlock occurs. This is particularly dangerous because the safety layer or targeting module might register such a callback.

**Impact:** Any module registering a laser state callback that calls back into the laser controller (a reasonable thing to do) will deadlock the laser control system.

**Fix:** Apply the same pattern already used for the timeout callback (lines 591-641): copy the callback pointer under the lock, release the lock, then invoke. This requires restructuring all callers of `set_state()`.

---

### C7-CRIT-005: Targeting calls laser_controller_off() directly, bypassing safety layer

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/laser/targeting.c:391,502,592,692`

**Risk:** The targeting module correctly uses `safety_laser_on()` for laser activation (lines 455 and 531, marked as SAFETY-001-1 fix). However, it calls `laser_controller_off()` directly at lines 391, 502, 592, and 692 instead of using `safety_laser_off()`. While turning the laser off is inherently safe, this creates an inconsistency in the safety audit trail:

1. **Line 391** (`targeting_process_detections`): Target lost, laser off -- bypasses safety layer logging
2. **Line 502** (`targeting_update`): Target timeout, laser off -- bypasses safety layer
3. **Line 592** (`targeting_cancel`): Cancel, laser off -- bypasses safety layer
4. **Line 692** (`targeting_cleanup`): Cleanup, laser off -- bypasses safety layer

More critically, any future changes to `safety_laser_off()` (such as adding state tracking, audit logging, or coordination with other subsystems) will not apply to these code paths. The asymmetry between on/off paths (safety_laser_on but direct laser_controller_off) is a design defect in a safety-critical system.

**Impact:** Incomplete safety audit trail for laser deactivation. Future safety enhancements to the off-path will be silently bypassed. In its current form, the laser is still turned off, so the immediate physical risk is LOW, but the architectural risk to safety invariants is CRITICAL.

**Fix:** Replace all `laser_controller_off()` calls in targeting.c with `safety_laser_off()`:
```c
// Line 391, 502, 592, 692:
safety_laser_off();  // instead of laser_controller_off()
```

---

## HIGH

### C7-HIGH-001: Servo controller violates lock ordering -- acquires laser_mutex while holding servo_mutex

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/servo/servo_controller.c:138-168`

**Risk:** `handle_hardware_failure()` at line 138 calls `laser_controller_off()` (line 153) and `laser_controller_disarm()` (line 154), which acquire `g_mutex` (laser_mutex). This function is called from `check_hardware_watchdog()` (line 547) which runs inside `interpolation_thread_func` (line 574) while SERVO_LOCK is held (line 566).

The documented lock ordering in safety_layer.c (lines 11-15) is: safety_mutex -> laser_mutex -> servo_mutex -> button_mutex. The servo controller acquiring laser_mutex while holding servo_mutex violates this order. If another thread holds laser_mutex and attempts to acquire servo_mutex (e.g., safety_validate_tilt -> servo_controller_get_position), a deadlock can occur.

**Impact:** Potential deadlock between the servo interpolation thread and any thread performing safety checks that query servo position.

**Fix:** Release SERVO_LOCK before calling laser functions in `handle_hardware_failure()`. Set a flag under the servo lock, then call laser functions outside the lock:
```c
static void check_hardware_watchdog(void) {
    // ... under SERVO_LOCK ...
    bool should_handle_failure = false;
    // ... detection logic ...
    if (g_consecutive_failures >= MAX_CONSECUTIVE_FAILURES) {
        should_handle_failure = true;
    }
    SERVO_UNLOCK();
    if (should_handle_failure) {
        handle_hardware_failure(SERVO_AXIS_PAN, "Movement timeout exceeded");
    }
    // ... or restructure the interpolation loop
}
```

---

### C7-HIGH-002: Servo failure callback invoked while holding servo_mutex

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/servo/servo_controller.c:165-166`

**Risk:** `handle_hardware_failure()` invokes `g_failure_callback` at line 166 while the caller holds SERVO_LOCK. If the callback calls any servo function that acquires SERVO_LOCK, a deadlock occurs. The callback is a user-registered function with no restrictions documented.

**Impact:** Deadlock if the registered failure callback calls any servo controller function.

**Fix:** Copy the callback pointer under the lock, release the lock, then invoke:
```c
servo_failure_callback_t cb = g_failure_callback;
void *ud = g_failure_user_data;
SERVO_UNLOCK();
if (cb) cb(axis, ud);
```

---

### C7-HIGH-003: Button handler callbacks invoked while holding button_mutex

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/button/button_handler.c:226-236`

**Risk:** `notify_event()` (line 226) and `notify_mode_change()` (line 232) invoke user-registered callbacks without releasing `button_mutex`. These are called from within `button_handler_update()` and mode transition functions that hold the lock. If the callback calls any button handler function, a deadlock occurs.

**Impact:** Deadlock if event or mode change callbacks call back into the button handler.

**Fix:** Apply the copy-under-lock-invoke-outside pattern consistently:
```c
static void notify_event(button_event_t event) {
    button_event_callback_t cb = ctx.event_callback;
    void *ud = ctx.event_user_data;
    BUTTON_UNLOCK();
    if (cb) cb(event, ud);
    BUTTON_LOCK();
}
```

---

### C7-HIGH-004: Targeting state callback invoked while holding TARGET_LOCK

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/laser/targeting.c:140-142`

**Risk:** `set_state()` at line 140-142 invokes `g_state_callback` while the caller holds `TARGET_LOCK`. The targeting module correctly uses unlock/relock for the acquired and lost callbacks (lines 401-404, 471-474, 508-511), but the state callback does NOT get this treatment. If the state callback calls any targeting function, a deadlock occurs.

**Impact:** Deadlock if the state callback calls any targeting function.

**Fix:** Apply the same unlock/relock pattern used for other callbacks:
```c
static void set_state(target_state_t new_state) {
    if (g_state != new_state) {
        g_state = new_state;
        if (g_state_callback != NULL) {
            target_state_callback_t cb = g_state_callback;
            void *ud = g_state_callback_data;
            TARGET_UNLOCK();
            cb(new_state, ud);
            TARGET_LOCK();
        }
    }
}
```

---

### C7-HIGH-005: laser_controller_init() does not hold lock during state initialization

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/laser/laser_controller.c:292-331`

**Risk:** `laser_controller_init()` resets all state variables (lines 311-327) and sets `g_initialized = true` (line 327) without holding `g_mutex`. On ESP32 where the mutex is dynamically created (lines 299-305), the mutex IS created before state reset, but the state reset itself is not protected. If another thread calls any laser function between lines 308 and 327, it could observe partially initialized state.

While `g_initialized` is checked first in most functions, the check itself is unprotected (reads a volatile variable without the lock), and on Pi/Test platforms the static mutex is available but not used during init.

**Impact:** Race condition during initialization could cause another thread to see partially initialized laser state.

**Fix:** Acquire the lock before resetting state:
```c
LASER_LOCK();
g_state = LASER_STATE_OFF;
// ... all state resets ...
g_initialized = true;
LASER_UNLOCK();
```

---

### C7-HIGH-006: ESP32 buzzer tone blocks while potentially holding button_mutex

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/button/button_handler.c:207-216`

**Risk:** On ESP32, `buzzer_tone()` calls `vTaskDelay(pdMS_TO_TICKS(duration_ms))` which blocks the calling task. The emergency stop buzzer plays for 500ms. If `buzzer_tone()` is called from a code path that holds `button_mutex` (which it is -- via `set_mode_internal()` -> mode transition -> buzzer), the mutex is held for 500ms. During this time, no other task can read button state, process events, or check system mode.

The file comment at lines 196-199 acknowledges this but dismisses it as acceptable. For a safety-critical system, holding a mutex for 500ms is a significant concern.

**Impact:** On ESP32, the button handler is unresponsive for up to 500ms during emergency stop tone, preventing immediate re-assessment of button state.

**Fix:** Release the mutex before playing the tone, or implement a non-blocking timer-based buzzer.

---

## MEDIUM

### C7-MED-001: safety_laser_activate() does not auto-off after duration

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/include/safety_layer.h:376-387` and `/Users/jermodelaruelle/Projects/apis/apis-edge/src/safety/safety_layer.c:779-817`

**Risk:** The `safety_laser_activate()` function accepts a `duration_ms` parameter but only uses it for logging and validation (capping). It does NOT automatically turn off the laser after the duration. The caller must manage timing and call `safety_laser_off()`. If the caller has a bug and fails to turn off the laser, only the 10-second hardware timeout saves the system.

The header documentation (lines 376-387) does clearly document this behavior, but the function name `safety_laser_activate` with a duration parameter strongly implies auto-off semantics. The deprecated alias `safety_laser_pulse` makes this even more misleading, as "pulse" implies a defined on/off cycle.

**Impact:** If the caller fails to manage timing, the laser stays on until the 10-second hardware timeout. This is a defense-in-depth concern, not a direct vulnerability.

**Fix:** Consider implementing actual timed deactivation, or rename the function to make the behavior clearer (e.g., `safety_laser_start()`). At minimum, add a compile-time warning or LOG_WARN when `safety_laser_activate` is used without a subsequent `safety_laser_off()` within the expected duration.

---

### C7-MED-002: Targeting unlock/relock pattern allows state mutation between unlock and relock

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/laser/targeting.c:401-404,471-474,508-511`

**Risk:** The targeting module uses an unlock/relock pattern to invoke callbacks:
```c
TARGET_UNLOCK();
g_lost_callback((uint32_t)track_duration, g_lost_callback_data);
TARGET_LOCK();
```
Between `TARGET_UNLOCK()` and `TARGET_LOCK()`, another thread could modify targeting state (e.g., a new detection arrives, or targeting is cancelled). After the callback returns and the lock is reacquired, the function continues with potentially stale assumptions about the state.

At line 406, after the unlock/relock for the lost callback, `set_state(TARGET_STATE_IDLE)` is called without re-checking whether the state is still valid. A new target could have been acquired during the callback.

**Impact:** Potential state inconsistency between targeting state and actual system state after callbacks.

**Fix:** After reacquiring the lock, re-check relevant state before continuing:
```c
TARGET_LOCK();
// Re-check state after callback
if (g_current_target.active) {
    // A new target was acquired during callback, don't go to IDLE
} else {
    set_state(TARGET_STATE_IDLE);
}
```

---

### C7-MED-003: Motion detection pipeline has no thread safety

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/detection/motion.c` (entire file)

**Risk:** The motion detection module uses global static buffers (`g_background_float`, `g_background`, `g_fg_mask`, `g_gray`, `g_visited`, `g_stack`) with no mutex protection. If `motion_detect()` is called from multiple threads (or if `motion_cleanup()` is called while `motion_detect()` is running), the buffers could be freed while in use, causing use-after-free or double-free.

The tracker and classifier modules have the same issue -- all use global state with no synchronization.

**Impact:** Memory corruption if detection pipeline functions are called from multiple threads. Currently, the detection pipeline is likely single-threaded, but this is a landmine for future development.

**Fix:** Add a mutex to the motion, tracker, and classifier modules, or clearly document that they are single-threaded-only with compile-time assertions or runtime checks.

---

### C7-MED-004: Flood fill stack capacity may cause incomplete detections silently

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/detection/motion.c:353-359`

**Risk:** The flood fill algorithm in `find_connected_components()` uses a fixed-size stack (`g_stack_size = 8192` entries, so 16384 ints). When the stack approaches capacity (line 353: `sp + 2 > max_stack_entries - 8`), neighbors are silently skipped. The warning is only logged once per session (line 354: `stack_overflow_warned` is static).

For large connected regions (e.g., a large shadow or lighting change), the region will be partially counted, producing an incorrect area and centroid. This could cause a large region to pass the area filter when it shouldn't (because only part was counted), or produce an incorrect centroid that points the servo/laser at the wrong location.

**Impact:** Incorrect detection coordinates could cause the laser to aim at the wrong position. The safety layer's tilt check provides a backstop for vertical errors, but horizontal aiming errors are not safety-checked.

**Fix:** When stack overflow occurs, either: (a) discard the entire component rather than partially counting it, or (b) mark the detection with a quality flag so downstream consumers can decide whether to trust it.

---

### C7-MED-005: Coordinate mapper calibration file is parsed with no integrity validation

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/laser/coordinate_mapper.c` (calibration loading)

**Risk:** The calibration file is loaded from the filesystem and parsed as JSON. While the file size is capped at 64KB and scale factors are validated (must be > 0), there is no checksum or signature verification. A corrupted or maliciously modified calibration file could set extreme scale factors (e.g., 0.001 or 1000.0) that cause the coordinate mapping to produce wildly incorrect servo angles.

The servo controller's angle clamping prevents angles outside the physical range, but within the valid range, incorrect mapping could cause the laser to consistently aim in the wrong direction.

**Impact:** Corrupted calibration could cause systematic aiming errors within the safe angle range.

**Fix:** Add a CRC32 or hash field to the calibration file format. Validate on load. If validation fails, fall back to default identity calibration and log an error.

---

### C7-MED-006: calculate_sweep_offset() has potential floating point issues with very low frequency

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/laser/targeting.c:267-284`

**Risk:** At line 273:
```c
float period_ms = 1000.0f / g_sweep_frequency;
float phase = (float)(elapsed % (uint64_t)period_ms) / period_ms * 2.0f * (float)M_PI;
```
If `g_sweep_frequency` is very small (approaching 0), `period_ms` becomes very large. The cast `(uint64_t)period_ms` from float to uint64_t for the modulo operation is safe for reasonable values, but if `period_ms` exceeds `UINT64_MAX` (not possible with clamped frequency >= 0.5 Hz), or if `period_ms` is NaN/Inf due to floating point issues, the behavior is undefined.

The frequency is clamped to [0.5, 5.0] Hz at line 620-621, so `period_ms` is in [200, 2000] ms. This is safe in practice. However, the clamping happens in `targeting_set_sweep_frequency()` but the initial value is set from a `#define` (TARGET_SWEEP_FREQUENCY_HZ = 2.0f) which is also safe.

**Impact:** LOW in practice due to clamping, but the code lacks a defensive check at the point of use.

**Fix:** Add a guard at the point of use:
```c
if (g_sweep_frequency < 0.1f) g_sweep_frequency = 0.5f; // defensive
float period_ms = 1000.0f / g_sweep_frequency;
```

---

### C7-MED-007: Tracker uses greedy nearest-neighbor assignment which can cause incorrect track swaps

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/detection/tracker.c:195-236`

**Risk:** The tracker uses a greedy nearest-neighbor algorithm: for each existing track, it finds the nearest unassigned detection. This is O(n*m) and can produce suboptimal assignments when tracks are close together. Two hornets crossing paths could swap track IDs, causing the targeting system to suddenly aim at a different hornet.

While this is not directly a safety issue (the safety layer still validates all laser activations), it could cause the laser to rapidly change aim direction, which increases mechanical wear on servos and could produce unexpected laser sweep patterns.

**Impact:** Track ID swaps during close encounters could cause erratic servo movement.

**Fix:** Consider implementing the Hungarian algorithm for optimal assignment, or at minimum document this limitation and add a maximum velocity check to reject implausible track assignments.

---

### C7-MED-008: Targeting acquired callback receives pointer to global state that may be modified

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/laser/targeting.c:471-473`

**Risk:** At line 472:
```c
TARGET_UNLOCK();
g_acquired_callback(&g_current_target, g_acquired_callback_data);
TARGET_LOCK();
```
The callback receives `&g_current_target`, a pointer to the global state. While the lock is released for the callback, another thread could call `targeting_process_detections()` or `targeting_update()` which modifies `g_current_target`. The callback would observe a partially modified struct (torn read).

**Impact:** Callback could read inconsistent target data, potentially causing incorrect decisions by the callback handler.

**Fix:** Pass a copy of the target info instead of a pointer to the global:
```c
target_info_t target_copy = g_current_target;
TARGET_UNLOCK();
g_acquired_callback(&target_copy, g_acquired_callback_data);
TARGET_LOCK();
```

---

## LOW

### C7-LOW-001: detection_result_t.count is uint8_t but find_connected_components returns int

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/detection/motion.c:457-459`

**Risk:** `find_connected_components()` returns `int` but the result is cast to `uint8_t` at line 457:
```c
result->count = (uint8_t)find_connected_components(result->detections, MAX_DETECTIONS);
```
The `_Static_assert` at detection.h:17 ensures `MAX_DETECTIONS <= 255`, so the cast is safe in practice. However, if `find_connected_components()` were to return a negative value (which it never does in current code), the cast would produce a large positive number.

**Impact:** No current issue due to static assert, but the implicit contract could be violated by future changes.

**Fix:** Add an explicit check before the cast:
```c
int raw_count = find_connected_components(result->detections, MAX_DETECTIONS);
result->count = (raw_count > 0) ? (uint8_t)raw_count : 0;
```

---

### C7-LOW-002: Tracker next_id will wrap after 4 billion tracks

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/detection/tracker.c:47-49`

**Risk:** The comment at line 48-49 acknowledges that `g_state.next_id` (uint32_t) wraps after ~4 billion tracks. At 1000 tracks/day, this is ~11,700 years, which is acceptable. However, when it wraps to 0, track ID 0 is used, which is documented as "reserved for no track" at line 47. The wrap to 0 would create a track with ID 0, violating the invariant.

**Impact:** After billions of tracks, a single track would have the reserved ID 0, potentially confusing lookup functions.

**Fix:** Skip ID 0 on wrap:
```c
obj->id = g_state.next_id++;
if (g_state.next_id == 0) g_state.next_id = 1;
```

---

### C7-LOW-003: Motion detection uses malloc without checking platform-specific behavior on ESP32

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/detection/motion.c:53-60`

**Risk:** The `alloc_buffer()` function tries PSRAM first on ESP32, then falls back to regular malloc. The `free_buffer()` function uses `heap_caps_free()` on ESP32 for all buffers. However, `heap_caps_free()` should work correctly for both PSRAM and regular heap allocations on ESP32 (it's the standard free for all heap types). The issue is that on ESP32, if PSRAM is not available, the fallback to regular `malloc()` will allocate from the 520KB internal SRAM, which may not have enough contiguous space for the large buffers (320K for float background alone).

**Impact:** Potential allocation failure on ESP32 without PSRAM, handled by the existing NULL check at line 122-127.

**Fix:** Log which memory type was allocated and calculate total memory requirement upfront:
```c
size_t total_needed = pixels * sizeof(float) + pixels * 4 + g_stack_size * 2 * sizeof(int);
LOG_INFO("Motion detection needs %zu bytes", total_needed);
```

---

### C7-LOW-004: Button handler GPIO 0 on ESP32 conflicts with boot mode

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/include/button_handler.h` (GPIO_BUTTON_PIN = 0 for ESP32)

**Risk:** GPIO 0 on ESP32 is the boot mode selection pin. Holding it LOW during power-on enters download mode. If the physical button is held during a power cycle (e.g., during a brownout-induced reboot), the device may not boot into normal firmware.

**Impact:** Device may fail to boot if button is held during power-on. Not a laser safety issue, but an availability concern.

**Fix:** Use a different GPIO pin for the button, or add a note in the hardware documentation about not holding the button during boot. Alternatively, add a startup delay before configuring GPIO 0 as input.

---

### C7-LOW-005: Pi GPIO button and buzzer implementations are stubs

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/button/button_handler.c:121-134,157-164`

**Risk:** The Pi platform's `gpio_read_button()` always returns `false` and `gpio_init_buzzer()` is a no-op. The `#warning` directives document this, but if someone deploys on Pi, the physical button will never work, and there will be no audible feedback for emergency stop.

**Impact:** On Pi platform, physical emergency stop via button does not function. The system can only be stopped via software or power removal.

**Fix:** Implement using libgpiod or pigpio library. Document the Pi platform limitation clearly in CLAUDE.md or hardware docs.

---

### C7-LOW-006: Classifier hover analysis uses Chebyshev distance, not Euclidean

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/detection/classifier.c:133-140`

**Risk:** The hover detection uses `max(|dx|, |dy|)` (Chebyshev distance) instead of Euclidean distance. The comment at lines 134-137 explains this is intentional for performance and leniency. However, this means an object moving diagonally up to `hover_radius * sqrt(2)` pixels could still be classified as hovering, making the effective hover radius ~41% larger than configured for diagonal movement.

**Impact:** Slightly more lenient hover detection than the configured radius implies, potentially classifying some non-hovering objects as hovering (false positive).

**Fix:** This is a design choice, not a bug. Document the effective diagonal radius in the configuration defaults comment. No code change needed unless tighter hover detection is required.

---

### C7-LOW-007: Frame timestamp wraparound after ~49 days

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/include/frame.h:27-28`

**Risk:** The `frame_t.timestamp_ms` field is `uint32_t`, which wraps after ~49.7 days. The comment at lines 27-28 acknowledges this. The classifier (classifier.c:147-154) handles wraparound correctly. However, if any other consumer of `frame_t.timestamp_ms` does not handle wraparound, they could compute negative durations or very large values.

**Impact:** Incorrect time calculations for consumers that don't handle wraparound, but only after 49+ days of continuous operation.

**Fix:** Document wraparound handling requirement in the frame.h header comment. Consider using uint64_t for the timestamp.

---

## INFO

### C7-INFO-001: Good -- Safety layer uses _Static_assert for compile-time constant validation

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/safety/safety_layer.c:49-50`

The `_Static_assert(LASER_MAX_ON_TIME_MS == 10000, ...)` ensures that the laser controller and safety layer agree on the maximum on-time. This is excellent practice for safety-critical code. Similarly, detection.h uses `_Static_assert(MAX_DETECTIONS <= 255, ...)` and tracker.h uses similar assertions.

---

### C7-INFO-002: Good -- Servo tilt hard-limited to never point upward

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/include/servo_controller.h`

`SERVO_TILT_MAX_DEG = 0.0f` ensures the servo physically cannot point the laser upward. Combined with `servo_controller_clamp_angle()` at every angle application point, this provides a robust hardware-level safety limit. The safety layer's tilt check at `SAFETY_TILT_MAX_DEG = 0.0f` provides a redundant software check.

---

### C7-INFO-003: Good -- Targeting uses safety_laser_on() for laser activation

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/laser/targeting.c:455,531`

The SAFETY-001-1 fix is properly applied at the two laser activation points. All safety checks (armed, detection active, tilt, time, kill switch, watchdog, brownout) are performed before the laser can fire. This is the correct approach.

---

### C7-INFO-004: Good -- Laser timeout callback uses copy-under-lock pattern

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/laser/laser_controller.c:591-641`

The timeout callback in `laser_controller_update()` correctly copies the callback pointer under the lock, releases the lock, then invokes the callback. This prevents both deadlock and use-after-free. This pattern should be applied to the state callback as well (see C7-CRIT-004).

---

### C7-INFO-005: Good -- Detection pipeline has comprehensive test coverage

**Files:** `/Users/jermodelaruelle/Projects/apis/apis-edge/tests/test_motion.c`, `test_tracker.c`, `test_classifier.c`

The detection pipeline tests cover initialization, detection with synthetic data, area/aspect filtering, error handling (NULL params, uninitialized state), history ring buffer wraparound, timestamp wraparound, and full pipeline integration. The classifier tests verify all confidence levels and classification results.

**Missing test coverage (suggested additions):**
- Safety layer: No test for concurrent access or the deadlock scenarios identified above
- Safety layer: No test for `safety_laser_activate()` duration parameter behavior
- Laser controller: No test for state callback invocation timing (under lock vs. outside)
- Targeting: No test that verifies safety_laser_on() is called instead of laser_controller_on()
- Motion: No benchmark test for ESP32 memory pressure

---

## Summary of Most Critical Findings

The edge firmware has a well-designed multi-layer safety architecture with appropriate hardware limits (servo angle clamping, laser timeout, kill switch). However, there are **five CRITICAL deadlock bugs** in the callback notification system that could render the entire safety layer inoperative. These are the most urgent findings:

1. **C7-CRIT-001, C7-CRIT-002, C7-CRIT-003**: The safety_layer.c `notify_*` functions re-acquire `safety_mutex` while callers already hold it. This will deadlock whenever a callback is registered and the corresponding notification fires. On a real device with callbacks registered, the first safety check failure would freeze the entire safety system.

2. **C7-CRIT-004**: The laser controller's state callback has the same issue with `g_mutex`.

3. **C7-CRIT-005**: Inconsistent use of safety_laser_off() vs. laser_controller_off() in the targeting module undermines the safety audit trail.

**Recommended remediation priority:**
1. Fix all deadlock bugs (C7-CRIT-001 through C7-CRIT-004, C7-HIGH-001 through C7-HIGH-004)
2. Fix targeting safety consistency (C7-CRIT-005)
3. Address servo lock ordering violation (C7-HIGH-001)
4. Add thread safety to detection pipeline (C7-MED-003)
5. Improve test coverage for the identified gaps
