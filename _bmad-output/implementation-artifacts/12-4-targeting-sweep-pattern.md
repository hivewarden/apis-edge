# Story 12.4: Targeting & Sweep Pattern

Status: done

## Story

As an **APIS unit**,
I want to sweep the laser across the target zone,
So that the deterrent effect is maximized.

## Acceptance Criteria

**Given** a hornet is detected
**When** targeting begins
**Then** servos aim at the detection centroid
**And** laser activates after aim is confirmed
**And** sweep pattern begins

**Given** the laser is aimed at target
**When** sweep mode is active
**Then** laser sweeps in a pattern around the target:
- Horizontal sweep: ±10° around centroid
- Sweep speed: ~2 sweeps per second
- Pattern continues while detection persists

**Given** the hornet moves
**When** new coordinates are received
**Then** sweep pattern recenters on new position
**And** transition is smooth (no jerky movement)

**Given** multiple hornets are detected
**When** targeting runs
**Then** the largest/closest is prioritized
**And** system tracks one target at a time
**And** logs multiple detections for statistics

**Given** the target leaves frame
**When** tracking is lost
**Then** laser deactivates
**And** servos return to ready position
**And** system resumes monitoring

## Technical Notes

- Sweep amplitude: ±10° (configurable)
- Sweep frequency: 2 Hz
- Tracking update rate: match detection FPS (5-10 Hz)
- Priority: largest bounding box if multiple detections

## Tasks / Subtasks

- [x] Create targeting.h with interface
- [x] Create targeting.c with implementation
- [x] Implement sweep pattern generation
- [x] Implement target prioritization (largest)
- [x] Integrate servo, coordinate mapper, and laser controller
- [x] Create comprehensive tests
- [x] Update CMakeLists.txt

## Dev Agent Record

### Implementation Notes

Files created:
- `include/targeting.h`
- `src/laser/targeting.c`
- `tests/test_targeting.c`

## Change Log

| Date | Author | Changes |
|------|--------|---------|
| 2026-01-23 | Claude | Story created and implementation started |
