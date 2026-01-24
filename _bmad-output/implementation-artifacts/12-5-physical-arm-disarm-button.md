# Story 12.5: Physical Arm/Disarm Button

Status: done

## Story

As a **beekeeper**,
I want a physical button to arm/disarm the unit,
So that I can control it without needing my phone.

## Acceptance Criteria

**Given** the unit has a physical button wired
**When** I press the button briefly (<1 second)
**Then** the armed state toggles
**And** LED changes to reflect new state
**And** audio feedback (beep) confirms change

**Given** I press and hold the button (>3 seconds)
**When** the hold is detected
**Then** the unit enters emergency stop mode
**And** laser is disabled until reset
**And** LED shows error state (red rapid blink)

**Given** the unit is in emergency stop
**When** I press the button
**Then** emergency stop is cleared
**And** unit returns to disarmed state
**And** must be explicitly re-armed

**Given** the button is accidentally pressed
**When** I press again within 2 seconds
**Then** the second press undoes the first
**And** debounce logic prevents rapid toggling

## Technical Notes

- Button: normally open, connected to GPIO with pull-up
- Debounce: 50ms minimum
- Long press: 3 seconds for emergency stop
- Audio feedback: optional buzzer on separate GPIO
- Integrate with laser_controller arm/disarm functions
- Integrate with led_controller for status feedback

## Tasks / Subtasks

- [x] Create button_handler.h with interface
- [x] Create button_handler.c with implementation
- [x] Implement debounce logic (50ms)
- [x] Implement short press detection (<1s)
- [x] Implement long press detection (>3s)
- [x] Implement emergency stop mode
- [x] Add rapid toggle protection (2s undo)
- [x] Add optional buzzer feedback
- [x] Integrate with laser_controller and led_controller
- [x] Create comprehensive tests
- [x] Update CMakeLists.txt

## Dev Agent Record

### Implementation Notes

Files created:
- `include/button_handler.h` - Interface with debounce, short/long press, emergency stop
- `src/button/button_handler.c` - Implementation with GPIO, laser, and LED integration
- `tests/test_button_handler.c` - 40 comprehensive tests

All 40 tests passing.

## Change Log

| Date | Author | Changes |
|------|--------|---------|
| 2026-01-23 | Claude | Story created |
