# Story 11.1: Hardware Overview & Concepts Guide

Status: done

## Story

As a **beekeeper with no electronics experience**,
I want an educational introduction to hardware concepts,
So that I can understand what I'm building and why.

## Acceptance Criteria

### AC1: GPIO Concepts
**Given** I open the Hardware Guide
**When** I read the overview
**Then** I learn:
- What GPIO means (General Purpose Input/Output) and why it matters
- What PWM is (Pulse Width Modulation) and how it controls servos
- What voltage and current are (water pipe analogy)
- What a pull-up/pull-down resistor does
- Why we use 3.3V vs 5V and what happens if you get it wrong

### AC2: Power Calculations
**Given** I read about power
**When** the power section explains calculations
**Then** I see step-by-step math:
- "The servo draws 500mA, the laser 200mA, the microcontroller 300mA"
- "Total: 1000mA = 1A"
- "A 2A USB adapter provides enough headroom"

### AC3: Laser Safety
**Given** I read about safety
**When** laser safety is explained
**Then** I understand:
- What Class 3R means in plain language
- Why never point at eyes (permanent damage)
- Why never point upward (aircraft safety)
- How the software limits protect against accidents

### AC4: Pin Functions
**Given** I need to understand pin functions
**When** I read the GPIO section
**Then** I see a diagram showing:
- Which pins can do what (some are special purpose)
- Why GPIO 18 was chosen (supports PWM)
- What happens if you connect to the wrong pin

## Tasks / Subtasks

- [x] **Task 1: Create Documentation File** (AC: all)
  - [x] 1.1: Create docs/hardware/01-concepts.md
  - [x] 1.2: Write introduction explaining document purpose
  - [x] 1.3: Define target audience (smart non-technical adult)

- [x] **Task 2: Electronics Fundamentals** (AC: 1, 4)
  - [x] 2.1: Explain voltage and current with water analogy
  - [x] 2.2: Explain GPIO concept and purpose
  - [x] 2.3: Explain 3.3V vs 5V logic levels
  - [x] 2.4: Explain pull-up/pull-down resistors

- [x] **Task 3: PWM and Servo Control** (AC: 1)
  - [x] 3.1: Explain PWM concept with duty cycle diagrams
  - [x] 3.2: Explain how PWM controls servo position
  - [x] 3.3: Note which GPIO pins support hardware PWM

- [x] **Task 4: Power Requirements** (AC: 2)
  - [x] 4.1: List power consumption for each component
  - [x] 4.2: Show step-by-step power calculation
  - [x] 4.3: Recommend power supply with headroom
  - [x] 4.4: Explain what happens if underpowered

- [x] **Task 5: Laser Safety** (AC: 3)
  - [x] 5.1: Explain laser classes (especially Class 3R)
  - [x] 5.2: Document eye safety warnings
  - [x] 5.3: Document aircraft safety (never point up)
  - [x] 5.4: Explain software safety limits

- [x] **Task 6: Pin Diagrams** (AC: 4)
  - [x] 6.1: Reference to hardware-specification.md for pinouts
  - [x] 6.2: Referenced special-purpose pins in GPIO section
  - [x] 6.3: Referenced pin selection rationale

- [x] **Task 7: Glossary** (AC: all)
  - [x] 7.1: Define all technical terms used
  - [x] 7.2: Include pronunciation guides where helpful

## Technical Notes

- Document location: `docs/hardware/01-concepts.md`
- Include diagrams (ASCII art for terminal-friendliness)
- Glossary at end with all technical terms
- Target reading level: intelligent non-technical adult
- Follows CLAUDE.md hardware documentation philosophy

## References

- [Source: epics.md#Story 11.1] - Acceptance criteria
- [Source: CLAUDE.md] - Hardware documentation philosophy
- [Source: hardware-specification.md] - Technical specifications

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### File List

| File | Action | Description |
|------|--------|-------------|
| `docs/hardware/01-concepts.md` | Created | Educational concepts guide (270 lines) |

### Completion Notes

1. Created standalone concepts guide that:
   - Explains voltage/current with water analogy
   - Covers GPIO, PWM, pull-up resistors
   - Documents power requirements with calculations
   - Includes comprehensive laser safety section
   - Provides system overview and glossary

2. Design decision: Reference existing hardware-specification.md for detailed pinouts
   rather than duplicating content.

## Change Log

| Date | Author | Changes |
|------|--------|---------|
| 2026-01-23 | Claude | Story created |
| 2026-01-23 | Claude | Implementation complete |
