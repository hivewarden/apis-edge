# Story 12.1: Servo Control Module

Status: done

## Story

As an **APIS unit**,
I want to control pan/tilt servos,
So that I can aim the laser at detected targets.

## Acceptance Criteria

**Given** the unit starts up
**When** servo initialization runs
**Then** both pan and tilt servos are initialized
**And** moved to center/home position
**And** movement range is tested within safe limits

**Given** a target position is requested
**When** the servo command is sent
**Then** servos move smoothly to the target angle
**And** movement completes within ~45ms
**And** position is verified (no overshooting)

**Given** an angle outside safe range is requested
**When** the command is processed
**Then** the angle is clamped to safe limits
**And** a warning is logged
**And** servo moves to nearest safe position

**Given** a servo fails or disconnects
**When** the failure is detected
**Then** laser is immediately disabled
**And** error state is set
**And** LED indicates fault

## Technical Notes

- PWM control: 50Hz frequency, 1ms-2ms pulse width
- Pan range: -45° to +45° (adjustable per installation)
- Tilt range: 0° to -30° (never upward!)
- Libraries: RPi.GPIO (Pi) or ledc (ESP32)
- Smooth movement: interpolate between positions

## Tasks / Subtasks

- [x] Create servo_controller.h with interface
- [x] Create servo_controller.c with implementation
- [x] Implement PWM control for Pi/ESP32/Test platforms
- [x] Implement angle clamping with safety limits
- [x] Implement smooth interpolation for movements
- [x] Create comprehensive tests (139 tests passing)
- [x] Update CMakeLists.txt

## Dev Agent Record

### Implementation Notes

Files created/modified:
- `include/servo_controller.h` - Public API with 15+ functions
- `src/servo/servo_controller.c` - Full implementation with:
  - Pi PWM via sysfs (with mock fallback)
  - ESP32 LEDC PWM
  - Test platform mock
  - Hardware failure detection with watchdog
  - Laser/LED integration for safety
- `tests/test_servo_controller.c` - 139 comprehensive tests

Dependencies:
- `include/platform.h` - Cross-platform sleep and definitions
- `include/log.h` - Logging macros
- `include/laser_controller.h` - Safety integration (disarm on fault)
- `include/led_controller.h` - Status indication (error state on fault)

Build configuration:
- `CMakeLists.txt` - test_servo_controller target (lines 410-435)

## Change Log

| Date | Author | Changes |
|------|--------|---------|
| 2026-01-23 | Claude | Story created and implementation started |
| 2026-01-26 | Claude | Remediation: Fixed 8 issues from code review - hardware failure detection, laser/LED integration, Pi PWM implementation, self-test function |
