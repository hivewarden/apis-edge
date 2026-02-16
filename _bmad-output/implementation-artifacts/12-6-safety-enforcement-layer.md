# Story 12.6: Safety Enforcement Layer

Status: done

## Story

As an **APIS unit**,
I want multiple safety layers,
So that the laser cannot operate unsafely even with software bugs.

## Acceptance Criteria

**Given** the safety layer is active
**When** any laser command is issued
**Then** it passes through safety checks:
1. Unit must be armed
2. Detection must be active
3. Tilt angle must be downward (never up)
4. Continuous time must be <10 seconds
5. Kill switch must not be engaged

**Given** any safety check fails
**When** laser activation is attempted
**Then** laser remains OFF
**And** failure reason is logged
**And** no error is shown to user (silent enforcement)

**Given** the tilt servo is commanded upward
**When** the command is processed
**Then** it is rejected with logged warning
**And** laser cannot fire at upward angles
**And** maximum tilt is limited to horizontal (0°) or below

**Given** software enters unexpected state
**When** watchdog timer expires (no heartbeat in 30s)
**Then** laser is forced OFF
**And** system enters safe mode
**And** requires manual reset

**Given** power fluctuates or browns out
**When** voltage drops below threshold
**Then** laser is immediately disabled
**And** system enters low-power safe mode

## Technical Notes

- Safety checks: function that wraps ALL laser commands
- Watchdog: software timer, resets every processing loop
- Upward limit: tilt >= 0° is rejected
- Brownout: ADC monitors input voltage (if available on hardware)
- Principle: laser is OFF by default, must be actively enabled
- Integrates with: laser_controller, servo_controller, button_handler

## Tasks / Subtasks

- [x] Create safety_layer.h with interface
- [x] Create safety_layer.c with implementation
- [x] Implement armed state check
- [x] Implement detection active check
- [x] Implement tilt angle validation (reject upward)
- [x] Implement continuous time monitoring
- [x] Implement kill switch check
- [x] Implement watchdog timer (30s timeout)
- [x] Implement brownout detection (if hardware supports)
- [x] Implement safe mode with manual reset
- [x] Create comprehensive tests
- [x] Update CMakeLists.txt

## Dev Agent Record

### Implementation Notes

Files created:
- `include/safety_layer.h` - Interface with multi-layer safety checks
- `src/safety/safety_layer.c` - Implementation with watchdog, brownout, safe mode
- `tests/test_safety_layer.c` - 48 comprehensive tests

Safety checks implemented:
1. Armed state check
2. Detection active check
3. Tilt angle validation (NEVER upward - > 0°)
4. Continuous time monitoring
5. Kill switch check
6. Watchdog timer (30s timeout)
7. Brownout detection

All 48 tests passing.

## Change Log

| Date | Author | Changes |
|------|--------|---------|
| 2026-01-23 | Claude | Story created |
| 2026-01-26 | Claude | Remediation: Fixed 8 issues from code review - added wrapper functions, servo integration, improved tests, documentation |
