# Story 12.3: Laser Activation Control

Status: done

## Story

As an **APIS unit**,
I want to control laser activation safely,
So that the laser only fires when appropriate.

## Acceptance Criteria

**Given** a hornet is detected and unit is armed
**When** laser activation is requested
**Then** laser turns on via MOSFET/transistor control
**And** GPIO pin goes HIGH to enable laser module

**Given** the laser is active
**When** 10 seconds continuous on-time is reached
**Then** laser is automatically turned OFF
**And** cooldown period begins (5 seconds minimum)
**And** event is logged as "safety timeout"

**Given** detection ends (hornet leaves frame)
**When** laser was active
**Then** laser turns OFF immediately
**And** system returns to monitoring state

**Given** the unit is disarmed
**When** a detection occurs
**Then** laser remains OFF regardless of detection
**And** detection is still logged for statistics

**Given** a kill switch signal is received
**When** the emergency stop activates
**Then** laser is immediately disabled
**And** cannot be re-enabled until kill switch is reset

## Technical Notes

- Laser control: single GPIO pin through MOSFET driver
- Max continuous: 10 seconds (configurable, safety limit)
- Cooldown: 5 seconds between activations
- Kill switch: physical hardware interrupt

## Tasks / Subtasks

- [x] Create laser_controller.h with interface
- [x] Create laser_controller.c with implementation
- [x] Implement GPIO control for Pi/ESP32/Test platforms
- [x] Implement max on-time safety limit (10s)
- [x] Implement cooldown period (5s)
- [x] Implement kill switch integration
- [x] Create comprehensive tests (90 tests passing)
- [x] Update CMakeLists.txt

## Dev Agent Record

### Implementation Notes

Files created/modified:
- `apis-edge/include/laser_controller.h`
- `apis-edge/src/laser/laser_controller.c`
- `apis-edge/tests/test_laser_controller.c`
- `apis-edge/CMakeLists.txt` (modified - added test_laser_controller target)

## Change Log

| Date | Author | Changes |
|------|--------|---------|
| 2026-01-23 | Claude | Story created and implementation started |
| 2026-01-26 | Claude | Remediation: Fixed 7 issues from code review (Pi GPIO, event logging, tests, docs) |
