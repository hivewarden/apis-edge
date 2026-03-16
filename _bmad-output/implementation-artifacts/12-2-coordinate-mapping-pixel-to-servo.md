# Story 12.2: Coordinate Mapping (Pixel to Servo)

Status: done

## Story

As an **APIS unit**,
I want to convert camera coordinates to servo angles,
So that the laser points where the camera sees the hornet.

## Acceptance Criteria

**Given** a detection at pixel (x, y)
**When** coordinate mapping runs
**Then** the pixel position is converted to servo angles (pan, tilt)
**And** the conversion accounts for camera field of view
**And** the laser points at the same physical location the camera sees

**Given** the camera and laser have different positions
**When** calibration is performed
**Then** offset correction is applied
**And** parallax error is minimized for the typical target distance

**Given** I need to calibrate the system
**When** calibration mode is activated
**Then** I can:
- Point laser at a marker
- Click marker position in camera view
- System calculates offset
- Calibration is saved

**Given** calibration data exists
**When** the unit boots
**Then** calibration is loaded automatically
**And** applied to all coordinate transformations

## Technical Notes

- Field of view: ~60° horizontal for typical webcam
- Mapping: linear interpolation (pixel_x → angle_pan)
- Calibration stored in: `/data/apis/calibration.json`
- Includes offset_pan, offset_tilt, scale factors

## Tasks / Subtasks

- [x] Create coordinate_mapper.h with interface
- [x] Create coordinate_mapper.c with implementation
- [x] Implement pixel-to-angle linear mapping
- [x] Implement calibration data structure
- [x] Implement calibration persistence (JSON)
- [x] Create comprehensive tests (~95 assertions across 15 test functions)
- [x] Update CMakeLists.txt

## Dev Agent Record

### Implementation Notes

Files created:
- `apis-edge/include/coordinate_mapper.h`
- `apis-edge/src/laser/coordinate_mapper.c`
- `apis-edge/tests/test_coordinate_mapper.c`

## Change Log

| Date | Author | Changes |
|------|--------|---------|
| 2026-01-23 | Claude | Story created and implementation started |
| 2026-01-26 | Claude | Remediation: Fixed 7 issues from code review |
