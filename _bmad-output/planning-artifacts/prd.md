---
stepsCompleted:
  - step-01-init
inputDocuments:
  - conversation-context
  - user-introduction-document
workflowType: prd
researchCompleted:
  - asian-hornet-behavior
  - laser-deterrent-effectiveness
  - vespai-similar-projects
  - eu-laser-regulations
  - detection-feasibility
  - esp32-cam-capabilities
  - servo-specifications
documentCounts:
  briefs: 0
  research: 7
  projectDocs: 0
---

# Product Requirements Document - Hornet Detection Laser Deterrent System

**Author:** Jermoo
**Date:** 2026-01-21
**Version:** 1.0
**Status:** Draft

---

## Executive Summary

An open-source, camera-based detection system that identifies Asian hornets (Vespa velutina) hovering near beehive entrances and deters them using a low-power green laser. The system aims to protect honeybee colonies from this invasive predator using affordable, widely available components that hobbyist beekeepers can replicate.

**Primary User:** Jermoo (beekeeper with 2 hives, project creator)
**Target Audience:** Hobbyist beekeepers willing to build DIY electronics projects
**Distribution Model:** Open source (GitHub, documentation, bill of materials)

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Solution Overview](#2-solution-overview)
3. [User Profile](#3-user-profile)
4. [System Architecture](#4-system-architecture)
5. [Functional Requirements](#5-functional-requirements)
6. [Technical Requirements](#6-technical-requirements)
7. [Hardware Paths](#7-hardware-paths)
8. [Detection Algorithm](#8-detection-algorithm)
9. [Laser Deterrent System](#9-laser-deterrent-system)
10. [Risk Assessment](#10-risk-assessment)
11. [Success Criteria](#11-success-criteria)
12. [Implementation Strategy](#12-implementation-strategy)
13. [Future Considerations](#13-future-considerations)
14. [Companion Server Application](#14-companion-server-application)
15. [Bill of Materials](#15-bill-of-materials)
16. [Gap Analysis: Beehive Monitoring Features](#16-gap-analysis-beehive-monitoring-features)
17. [Research Sources](#17-research-sources)

---

## 1. Problem Statement

### 1.1 The Threat

Asian hornets (Vespa velutina) are an invasive species spreading across Europe that prey on honeybees. First detected in France in 2004, they have spread to Germany, Spain, Belgium, Portugal, Italy, UK, and are currently expanding eastward through Central Europe.

**Verified hunting behavior:**
- Hornets adopt a stationary hovering position ("hawking") in front of beehive entrances
- They face outward, targeting returning foragers laden with pollen (slower, less agile)
- A single hornet can hover for 25+ minutes, defending a ~0.5m² territory
- When one hornet catches a bee and departs, it is replaced within 3-7 seconds
- Up to 50 hornets can be present at heavily attacked hives
- Success rate against European honeybees (A. mellifera) is 8x higher than against Asian honeybees

**Why European honeybees are vulnerable:**
- A. mellifera lacks co-evolved defenses against V. velutina
- European bees slow down near entrances ("sashaying") making them easier to catch
- They do not have the "heat balling" defense that Asian honeybees use

**Sources:** Tan et al. (2007) Naturwissenschaften, PMC Studies on hornet predation behavior

### 1.2 Current Solutions and Their Limitations

| Solution | Effectiveness | Limitations |
|----------|--------------|-------------|
| Spring trapping | Moderate | Only 1.35-3.65% selectivity; catches non-target species |
| Entrance reducers | Low | Hornets adapt; doesn't stop hawking |
| Electric harps (ApiProtection) | High | €300+; requires mains power |
| VespAI detection | High (99%) | Detection only; no active deterrent |
| Manual intervention | Variable | Requires constant presence |

### 1.3 Gap in Market

No affordable, automated, non-lethal deterrent system exists for hobbyist beekeepers. This project aims to fill that gap.

---

## 2. Solution Overview

### 2.1 Core Concept

A camera-based system that:
1. **Detects** flying insects near the hive entrance using motion detection
2. **Identifies** potential hornets using size filtering (hornets are ~2x larger than bees)
3. **Tracks** hovering behavior (hornets hover; bees move quickly)
4. **Deters** confirmed hornets by sweeping a green laser line across them

### 2.2 Design Principles

| Principle | Implementation |
|-----------|----------------|
| **Affordable** | Total cost <€50 for production version |
| **Accessible** | Uses common components available globally |
| **Open Source** | All code, schematics, 3D models published |
| **Non-lethal** | 5mW laser startles, does not harm |
| **Portable** | Can be mounted/unmounted for testing |
| **Extensible** | Future: solar power, IoT hub, data logging |

### 2.3 What This Project Will NOT Do (Initially)

- Kill hornets (non-lethal deterrent only)
- Work autonomously on solar power (grid-powered for prototype)
- Provide weatherproof enclosure (deferred until hardware finalized)
- Use machine learning for classification (simple size/behavior filtering)
- Connect to cloud services (local operation only)

---

## 3. User Profile

### 3.1 Primary User

**Name:** Jermoo
**Role:** Project creator, first tester, primary user
**Experience:**
- Owns 2 beehives
- No electronics experience
- Has Raspberry Pi 5, camera, and ribbon cable
- Has access to 3D printer (friend)

**Needs:**
- Protect bees from Asian hornets
- Learn if laser deterrence works
- Create something others can replicate

### 3.2 Secondary Users (Open Source Community)

**Profile:** Hobbyist beekeepers affected by Asian hornets
**Technical Level:** Willing to follow instructions, varying electronics experience
**Geographic:** Primarily Europe (France, Germany, Spain, Belgium, UK, etc.)

**Needs:**
- Clear build instructions
- Affordable bill of materials
- "Flash and go" software (minimal configuration)
- Multiple hardware options for different budgets

### 3.3 Success Metric for Users

> "Can someone with Jermoo's skill level (no electronics experience) replicate this from the documentation?"

---

## 4. System Architecture

### 4.1 Design Philosophy: Standalone Device + Optional Server

The device operates **completely standalone** - no external server required for core functionality. WiFi enables optional features that enhance usability but are not required for the primary mission (detect and deter hornets).

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           SYSTEM ARCHITECTURE                            │
└──────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────┐              ┌─────────────────────────────┐
│      EDGE DEVICE            │              │    USER'S SERVER            │
│      (At beehive)           │              │    (Optional)               │
├─────────────────────────────┤              ├─────────────────────────────┤
│                             │     WiFi     │                             │
│  ✅ Detection (local)       │ ──────────►  │  📹 Stream viewer           │
│  ✅ Laser control (local)   │              │  💾 Clip archive            │
│  ✅ Servo control (local)   │  ◄────────── │  📊 Dashboard               │
│  ✅ Local clip storage      │   Commands   │  🔔 Notification routing    │
│  ✅ Physical on/off button  │              │  ⚙️  Remote configuration   │
│  ✅ WiFi on/off endpoint    │              │                             │
│  ✅ Health heartbeat        │              │  Runs on: old PC, NAS,      │
│  ✅ Failure alerts          │              │  Raspberry Pi, or cloud     │
│                             │              │                             │
│  CRITICAL PATH              │              │  NICE TO HAVE               │
│  (Must work offline)        │              │  (Can fail gracefully)      │
└─────────────────────────────┘              └─────────────────────────────┘
```

### 4.2 Device Responsibilities (Standalone)

| Function | Runs On | Network Required? |
|----------|---------|-------------------|
| Motion detection | Device | ❌ No |
| Size/hover classification | Device | ❌ No |
| Servo control | Device | ❌ No |
| Laser activation | Device | ❌ No |
| Save clips to local storage | Device | ❌ No |
| Physical arm/disarm button | Device | ❌ No |
| WiFi arm/disarm endpoint | Device | ✅ Yes (LAN only) |
| Health heartbeat | Device | ✅ Yes |
| Failure notification | Device | ✅ Yes |

### 4.3 Server Responsibilities (Optional)

| Function | Runs On | Notes |
|----------|---------|-------|
| Live stream viewing | Server | Device streams on request |
| Clip archival | Server | Device pushes clips |
| Dashboard & analytics | Server | Server aggregates data |
| Notification routing | Server | Telegram, email, etc. |
| Multi-hive management | Server | If multiple devices |
| Remote configuration UI | Server | Web interface |

### 4.4 Control Interfaces

**Physical Button (GPIO):**
- ARM/DISARM toggle button on device
- LED indicator: Green = armed, Red = disarmed
- Optional: Main power switch

**WiFi API (HTTP):**
```
GET  /status        → {"armed": true, "uptime": 3600, "detections_today": 5}
POST /arm           → Start detection and deterrent
POST /disarm        → Stop detection and deterrent
GET  /stream        → MJPEG live video stream
GET  /health        → {"status": "ok", "temp": 55, "storage_pct": 23}
GET  /clips         → List of saved incident clips
GET  /clips/{id}    → Download specific clip
```

### 4.5 Failure Notifications

Device sends alerts via webhook when:

| Event | Priority | Payload |
|-------|----------|---------|
| Device boot | Info | "Hornet Detector online" |
| Camera error | Critical | "Camera failed - check connection" |
| Storage >90% full | Warning | "Storage nearly full - clear clips" |
| Temperature >70°C | Warning | "Temperature warning: 72°C" |
| Detection triggered | Info | "Hornet detected" + clip URL |
| Graceful shutdown | Info | "Device shutting down" |

### 4.6 Compute Budget (Pi 5)

| Task | CPU Usage | Can Run Simultaneously? |
|------|-----------|------------------------|
| Video capture (VGA @ 10fps) | ~5-10% | ✅ Yes |
| Motion detection (OpenCV) | ~10-20% | ✅ Yes |
| Servo PWM control | <1% | ✅ Yes |
| Laser GPIO control | <1% | ✅ Yes |
| MJPEG streaming | ~5-10% | ✅ Yes |
| **Total at peak** | **~30-40%** | **Plenty of headroom** |

**Temperature under load:** ~60-65°C (safe, throttles at 85°C)

---

## 5. Functional Requirements

### 5.1 Detection Requirements

| ID | Requirement | Priority | Verification |
|----|-------------|----------|--------------|
| F-DET-01 | System shall detect moving objects in camera field of view | Must Have | Motion detected within 500ms |
| F-DET-02 | System shall estimate object size in pixels | Must Have | Size measured ±20% accuracy |
| F-DET-03 | System shall distinguish large objects (>18px at VGA) from small objects | Must Have | 90% correct classification |
| F-DET-04 | System shall detect hovering behavior (object stationary for >1 second) | Must Have | Hover detected within 2 seconds |
| F-DET-05 | System shall operate at minimum 5 FPS for motion detection | Must Have | Measured FPS ≥5 |
| F-DET-06 | Camera shall be positioned 1-1.5 meters from hive entrance | Must Have | Installation requirement |

### 5.2 Deterrent Requirements

| ID | Requirement | Priority | Verification |
|----|-------------|----------|--------------|
| F-DET-07 | System shall aim laser at detected hornet position | Must Have | Laser within 30° of target |
| F-DET-08 | System shall sweep laser line across target zone | Must Have | Sweep covers ±15° range |
| F-DET-09 | System shall activate laser only when hornet detected | Must Have | No false activations on bees |
| F-DET-10 | System shall limit laser activation to 10 seconds continuous | Should Have | Prevents overheating |
| F-DET-11 | System shall log detection events with timestamp | Should Have | Log file created |

### 5.3 Safety Requirements

| ID | Requirement | Priority | Verification |
|----|-------------|----------|--------------|
| F-SAF-01 | Laser shall be Class 3R or below (≤5mW) | Must Have | Laser specification |
| F-SAF-02 | System shall include kill switch for laser | Must Have | Physical switch present |
| F-SAF-03 | Laser shall not point upward (aircraft safety) | Must Have | Mounting constraint |
| F-SAF-04 | Documentation shall include laser safety warnings | Must Have | Warnings in README |

### 5.4 Operational Requirements

| ID | Requirement | Priority | Verification |
|----|-------------|----------|--------------|
| F-OPS-01 | System shall operate during daylight hours (09:00-17:00) | Must Have | Matches hornet activity |
| F-OPS-02 | System shall be powered via European mains (230V via USB adapter) | Must Have | USB-C power |
| F-OPS-03 | System shall survive outdoor temperatures (5-35°C) | Should Have | Component ratings |
| F-OPS-04 | System shall be mountable on pole or suspended from roof | Must Have | Mounting points |

### 5.5 Control & Connectivity Requirements

| ID | Requirement | Priority | Verification |
|----|-------------|----------|--------------|
| F-CTL-01 | System shall operate standalone without network connection | Must Have | Core functions work offline |
| F-CTL-02 | System shall include physical arm/disarm button | Must Have | Button present, functional |
| F-CTL-03 | System shall provide WiFi arm/disarm via HTTP endpoint | Must Have | API responds correctly |
| F-CTL-04 | System shall provide HTTP endpoint for status query | Must Have | Returns JSON status |
| F-CTL-05 | System shall provide MJPEG video stream endpoint | Should Have | Stream accessible via browser |
| F-CTL-06 | System shall save incident clips to local storage | Should Have | Clips saved on detection |
| F-CTL-07 | System shall send heartbeat to configured webhook URL | Should Have | Ping every 60 seconds |
| F-CTL-08 | System shall send failure alerts to configured webhook URL | Should Have | Alert on camera/storage error |
| F-CTL-09 | System shall provide LED indicator for armed/disarmed state | Should Have | Visual status confirmation |

---

## 6. Technical Requirements

### 6.1 Camera Specifications

| Parameter | Requirement | Rationale |
|-----------|-------------|-----------|
| Resolution | VGA (640x480) minimum | Sufficient for size discrimination |
| Frame rate | ≥5 FPS for motion detection | Detect hover behavior |
| Field of view | 50-70 degrees | Cover hive entrance at 1m |
| Interface | CSI (Pi) or built-in (ESP32-CAM) | Standard connections |

**Verification:** At 1 meter distance with 53° FOV:
- 30mm hornet = 48 pixels (at full res) / 24 pixels (at VGA)
- 15mm bee = 24 pixels (at full res) / 12 pixels (at VGA)
- Difference: 2:1 ratio - sufficient for threshold-based discrimination

### 6.2 Servo Specifications

| Parameter | Requirement | Rationale |
|-----------|-------------|-----------|
| Type | Micro servo (9g class) | Lightweight, sufficient torque |
| Speed | ≤0.12s/60° | Track hovering target |
| Range | 30° sweep minimum | Cover hive entrance zone |
| Voltage | 4.8-6V | Standard hobby servo |

**Verified:** SG90 servo achieves 0.08-0.12s/60°, response time 44.5ms ± 2.3ms. Adequate for tracking stationary hovering hornet.

### 6.3 Laser Specifications

| Parameter | Requirement | Rationale |
|-----------|-------------|-----------|
| Wavelength | 520-532nm (green) | High visibility, insect-visible |
| Power | ≤5mW (Class 3R) | Non-lethal, regulatory limit |
| Beam type | Line (not dot) | Covers larger area |
| Duty cycle | Max 45s on, 15s off | Prevent overheating |

**Note:** 5mW Class 3R is at EU regulatory boundary. Documentation must include appropriate warnings.

### 6.4 Processing Requirements

| Parameter | Path C (Pi 5) | Path A/B (ESP32) |
|-----------|---------------|------------------|
| Motion detection FPS | 50+ | 25 (QVGA downsampled) |
| Frame differencing | OpenCV | Custom implementation |
| Size calculation | OpenCV contours | Pixel counting |
| Servo control | GPIO PWM | GPIO PWM |
| Laser control | GPIO + transistor | GPIO + transistor |

---

## 7. Hardware Paths

### 6.1 Path C: Raspberry Pi 5 Prototype (CURRENT)

**Purpose:** Fast prototyping, validate concept, develop algorithms

| Component | Jermoo Has? | Approx. Cost |
|-----------|-------------|--------------|
| Raspberry Pi 5 | ✅ Yes | (€0) |
| Pi Camera (OV5647) | ✅ Yes | (€0) |
| CSI Ribbon Cable | ✅ Yes | (€0) |
| SG90 Servo | ❌ Need | €2-3 |
| 5mW Green Line Laser | ❌ Need | €5-10 |
| Jumper wires | ❌ Need | €2-3 |
| USB-C Power Supply (5V 3A+) | ❓ Maybe | €12-15 |
| **Total to purchase** | | **~€10-20** |

**Advantages:**
- Python + OpenCV for easy development
- Full debugging capability (SSH, logs, display)
- Powerful enough for experimentation
- Jermoo already owns most components

**Limitations:**
- Power hungry (~7.5W active) - not suitable for solar
- Expensive for replication by others
- Boot time ~20-40 seconds

### 6.2 Path A: ESP32-CAM (Future Production)

**Purpose:** Cheapest option for open source replication

| Component | Approx. Cost |
|-----------|--------------|
| ESP32-CAM-MB (with USB programmer) | €10-12 |
| SG90 Servo | €2-3 |
| 5mW Green Line Laser | €5-10 |
| Wires, transistor, capacitor | €2 |
| USB Power Supply | €5-10 |
| **Total** | **~€25-35** |

**Advantages:**
- Lowest cost for replicators
- Deep sleep capable (solar potential)
- Small form factor
- Arduino IDE (familiar to makers)

**Limitations:**
- Limited processing (no OpenCV)
- Frame differencing only at QVGA
- Harder to debug

### 6.3 Path B: XIAO ESP32-S3 Sense (Future Production)

**Purpose:** Better IoT hub potential, easier programming

| Component | Approx. Cost |
|-----------|--------------|
| XIAO ESP32-S3 Sense | €14 |
| SG90 Servo | €2-3 |
| 5mW Green Line Laser | €5-10 |
| Wires, transistor, capacitor | €2 |
| USB Power Supply | €5-10 |
| **Total** | **~€30-40** |

**Advantages:**
- USB-C built-in (easy programming)
- BLE 5.0 (future: Bluetooth scale integration)
- More GPIO for expansion
- Camera detachable

**Limitations:**
- Slightly more expensive than ESP32-CAM
- Same processing limitations

### 6.4 Hardware Path Decision Matrix

| Factor | Path C (Pi 5) | Path A (ESP32-CAM) | Path B (XIAO) |
|--------|--------------|-------------------|---------------|
| Prototype speed | ⭐⭐⭐ | ⭐ | ⭐⭐ |
| Production cost | ⭐ | ⭐⭐⭐ | ⭐⭐ |
| Solar capability | ⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| IoT hub potential | ⭐⭐ | ⭐ | ⭐⭐⭐ |
| Ease for replicators | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| Processing power | ⭐⭐⭐ | ⭐ | ⭐ |

**Strategy:** Start with Path C (Pi 5), validate concept, then port to Path A or B for open source release.

---

## 8. Detection Algorithm

### 7.1 Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    DETECTION PIPELINE                           │
├─────────────────────────────────────────────────────────────────┤
│  Camera Frame (VGA 640x480)                                     │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────┐                                           │
│  │ Motion Detection │ ← Frame differencing                     │
│  │ (Background Sub) │                                           │
│  └────────┬────────┘                                           │
│           │ Motion detected?                                    │
│           ▼                                                     │
│  ┌─────────────────┐                                           │
│  │  Size Filtering  │ ← Contour area > threshold               │
│  │  (Hornet vs Bee) │   Hornet: >18px, Bee: <15px              │
│  └────────┬────────┘                                           │
│           │ Large object?                                       │
│           ▼                                                     │
│  ┌─────────────────┐                                           │
│  │ Hover Detection  │ ← Object in same area for >1 second      │
│  │ (Behavior Filter)│                                           │
│  └────────┬────────┘                                           │
│           │ Hovering?                                           │
│           ▼                                                     │
│  ┌─────────────────┐                                           │
│  │ HORNET CONFIRMED │ → Activate laser deterrent               │
│  └─────────────────┘                                           │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 Algorithm Details

**Motion Detection:**
- Method: Frame differencing (current - previous)
- Threshold: Configurable (start at 25/255)
- Preprocessing: Grayscale conversion, Gaussian blur

**Size Filtering:**
- Find contours in motion mask
- Calculate contour area in pixels
- Threshold: Object > 300 pixels (at VGA, 1m) = potential hornet
- Objects < 150 pixels likely bees

**Hover Detection:**
- Track centroid of large objects across frames
- If centroid moves < 50 pixels over 1 second = hovering
- Bees typically cross frame in <0.5 seconds

**Confidence Scoring:**
- Size score: 0-1 based on pixel area
- Hover score: 0-1 based on stationary duration
- Combined score > 0.7 = trigger deterrent

### 7.3 Inspiration from Existing Projects

**VespAI Approach:**
- Uses ViBe background subtraction (lightweight)
- Size pre-filter before ML classification
- Only passes candidates to neural network

**Hornet Sentry Gun Learning:**
- Open-air tracking is very difficult
- Constrained environment (tunnel) improves reliability
- Consider future: tunnel at hive entrance

---

## 9. Laser Deterrent System

### 8.1 Laser Module

| Specification | Value |
|---------------|-------|
| Type | Green line laser module |
| Wavelength | 520-532nm |
| Power | ≤5mW (Class 3R) |
| Voltage | 3-5V DC |
| Current | 100-300mA |
| Line angle | 60-120° fan |

### 8.2 Servo Control

| Specification | Value |
|---------------|-------|
| Model | SG90 or MG90S |
| Control | PWM (50Hz, 1-2ms pulse) |
| Range | 30° sweep (±15° from center) |
| Speed | 0.08-0.12s per 60° |
| Response time | ~45ms |

### 8.3 Deterrent Behavior

When hornet confirmed:
1. Calculate target position from contour centroid
2. Map pixel position to servo angle
3. Command servo to target angle
4. Activate laser
5. Sweep laser ±10° around target (2-3 oscillations)
6. Deactivate laser after 5 seconds
7. Return to center position
8. Cooldown: 2 seconds before next activation

### 8.4 Wiring Diagram

```
Raspberry Pi 5 GPIO Header
──────────────────────────
Pin 2  (5V)     ────┬──────────► Servo VCC (red)
                    │
                    └──────────► Laser VCC (+) via transistor

Pin 6  (GND)    ────┬──────────► Servo GND (brown)
                    │
                    └──────────► Laser GND (-) / Transistor Emitter

Pin 12 (GPIO18) ───────────────► Servo Signal (orange)

Pin 11 (GPIO17) ────[1kΩ]──────► Transistor Base (2N2222)
                                        │
                               Collector ─► Laser (-)

Note: 100µF capacitor across servo power (5V to GND) to reduce jitter
```

---

## 10. Risk Assessment

### 9.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Laser does not deter hornets** | Medium | High | Prototype is the test; pivot to detection-only if fails |
| **Laser attracts/aggravates hornets** | Low | High | Observe behavior carefully; abort if aggressive response |
| **False positives (bees trigger laser)** | Medium | Medium | Tune size thresholds; add hover duration check |
| **False negatives (miss hornets)** | Low | Medium | Tune sensitivity; accept some misses over false positives |
| **Servo too slow for tracking** | Low | Low | Research shows 45ms adequate for hovering target |
| **Detection fails in varying light** | Medium | Medium | Test in different conditions; may need IR for low light |

### 9.2 Safety Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Laser damages human eyes** | Low | High | 5mW is low risk; include warnings; aim downward |
| **Laser affects aircraft** | Very Low | Critical | Mount to point downward only; not near airports |
| **Electrical shock** | Very Low | Medium | All components are low voltage (5V) |

### 9.3 Regulatory Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **5mW laser restricted in some regions** | Medium | Medium | Document as Class 3R; include regulatory warnings |
| **Open source liability** | Low | Medium | Include disclaimers; document as experimental |

### 9.4 Critical Unknown: Laser Deterrence Effectiveness

**Research Finding:** No scientific studies exist on using low-power lasers to deter (not kill) insects.

**Known:**
- Hornets CAN see 532nm green light (peak at 535nm receptor)
- Bird laser deterrents work (birds flee threats)
- Insects have visual startle responses

**Unknown:**
- Whether laser triggers any behavioral response in hornets
- Whether response is avoidance or aggression
- Whether hornets habituate to the stimulus
- Whether the laser affects bees (also sensitive to 532nm)

**Approach:** The prototype IS the experiment. Build, deploy, observe, learn.

---

## 11. Success Criteria

### 10.1 Prototype Success (Path C)

| Metric | Target | How to Measure |
|--------|--------|----------------|
| System boots and runs | 100% | Manual test |
| Detects motion in frame | >95% | Test with hand movement |
| Distinguishes large vs small objects | >80% | Test with objects of known size |
| Servo responds to detection | 100% | Observe servo movement |
| Laser activates on command | 100% | Observe laser |
| End-to-end: large hovering object triggers laser | >80% | Test with hornet-sized object |

### 10.2 Field Trial Success

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Detects real hornets | To be measured | Camera logs + observation |
| Laser activates for hornets | To be measured | Event logs |
| Hornets leave after laser | **Unknown - this is the experiment** | Video observation |
| False positives (laser on bees) | <10% | Event logs + observation |
| System runs 8+ hours without failure | 100% | Uptime logs |

### 10.3 Open Source Success

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Complete documentation | Yes | All build steps documented |
| Code published on GitHub | Yes | Repository public |
| Bill of materials available | Yes | With purchase links |
| Someone else builds it successfully | ≥1 person | Community feedback |

---

## 12. Implementation Strategy

### 12.1 Development Prioritization

Development order optimized for AI-assisted development while subscription is available:

| Priority | Component | Rationale |
|----------|-----------|-----------|
| **P1** | Companion Server & Dashboard | Pure software, no hardware needed, can develop immediately with AI |
| **P2** | Core Detection Software | Algorithm, servo control - can develop and test on Pi with simulated inputs |
| **P3** | Hardware Integration | Requires physical assembly, real-world testing, calibration |

### 12.2 Hardware Integration Deliverable Format

Because hardware integration will be executed later (potentially with a smaller/cheaper AI model), deliverables must be **pre-reasoned execution plans**, not just stories.

**Required format for hardware tasks:**

```
DETAILED EXECUTION PLAN
├── Step-by-step instructions (exact commands, code)
├── WHAT to do at each step
├── WHY this approach (captured reasoning)
├── Expected outputs at each checkpoint
├── Troubleshooting: If X happens → do Y
└── Verification criteria before proceeding
```

**Goal:** A "cookbook" that requires minimal reasoning to execute. The expensive AI does the thinking now; a smaller model follows the recipe later.

### 12.3 Hardware Paths Execution

| Path | When to Execute | AI Requirements |
|------|-----------------|-----------------|
| Path C (Pi 5 Prototype) | First - validates concept | Detailed plan needed |
| Path A (ESP32-CAM) | After prototype validated | Port guide from Path C |
| Path B (XIAO ESP32-S3) | Optional optimization | Port guide from Path C |

---

## 13. Future Considerations

### 13.1 Deferred to Future Versions


| Feature | Rationale for Deferral |
|---------|----------------------|
| Solar power | Need to finalize hardware and power budget first |
| Weatherproof enclosure | Design after controller/power decisions |
| Machine learning classification | Simple algorithm first; ML if needed |
| Cloud connectivity | Local operation sufficient for prototype |
| Mobile app | Not needed for initial testing |
| Multiple camera angles | Single camera first |

### 11.2 IoT Hub Potential (Path B)

If using XIAO ESP32-S3 Sense:
- Bluetooth Low Energy 5.0 for connecting:
  - Hive scale (weight monitoring)
  - Temperature/humidity sensors
  - Additional cameras
- WiFi for data upload to local server
- Mesh networking between multiple hives

### 11.3 Alternative Deterrent Methods

If laser deterrence fails, consider:
- Ultrasonic deterrent (sound-based)
- Automated physical barrier (servo-controlled gate)
- Detection + alert only (human intervention)
- Integration with ApiProtection electric harp

### 12.4 Data Collection for Research

Even if deterrence fails, the detection system provides value:
- Log hornet activity patterns (time of day, frequency)
- Measure colony stress during attacks
- Contribute data to hornet spread research
- Share detection algorithm with VespAI community

---

## 14. Companion Server Application

The device pushes clips and telemetry to a separate server application that runs on the user's infrastructure (old PC, NAS, Raspberry Pi, or cloud). This provides the web dashboard, clip storage, and historical analytics.

### 13.1 Dashboard Features

| Feature | Description |
|---------|-------------|
| **Live video** | Embedded MJPEG stream from device |
| **Device health** | Online/offline status, temperature, storage, armed state |
| **Today's stats** | Detection count, laser activations, clips saved |
| **Weather integration** | Temperature and conditions from OpenWeatherMap API |
| **Clip browser** | List, play, download saved incident clips |
| **History view** | Day-by-day log with weather, detection counts |
| **Search/filter** | Find incidents by date range |
| **Multi-device** | Support multiple hives (future) |

### 13.2 Dashboard Wireframe

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  🐝 HORNET DETECTOR DASHBOARD                          [Jermoo] [Settings]  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────┐  ┌─────────────────────────────────────────┐   │
│  │                         │  │  DEVICE STATUS                          │   │
│  │    [LIVE VIDEO FEED]    │  │  ● Online (last ping: 2s ago)          │   │
│  │                         │  │  Armed: YES                             │   │
│  │                         │  │  Temp: 52°C | Storage: 23% used        │   │
│  └─────────────────────────┘  └─────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  TODAY: January 21, 2026          ☀️ Sunny, 12°C                       ││
│  │  Detections: 7    |    Laser activations: 7    |    Clips saved: 7     ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  RECENT INCIDENTS                                                       ││
│  │  📹 14:32:05 - hornet_2026-01-21_14-32-05.mp4  [▶ Play] [⬇ Download]   ││
│  │  📹 11:47:22 - hornet_2026-01-21_11-47-22.mp4  [▶ Play] [⬇ Download]   ││
│  │  📹 10:15:03 - hornet_2026-01-21_10-15-03.mp4  [▶ Play] [⬇ Download]   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  HISTORY                                          [Filter] [Export]     ││
│  │  Date          Weather      Detections    Clips                         ││
│  │  2026-01-21    ☀️ 12°C        7            7    [View]                  ││
│  │  2026-01-20    🌧️ 8°C         2            2    [View]                  ││
│  │  2026-01-19    ⛅ 10°C        5            5    [View]                  ││
│  │  ...                                                                    ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────────┘
```

### 13.3 Technical Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| **Backend** | Python + FastAPI | Async, good for video streaming |
| **Database** | SQLite | No setup needed, file-based |
| **Frontend** | HTML + HTMX + TailwindCSS | Lightweight, no complex JS |
| **Video player** | HTML5 `<video>` | Built into browsers |
| **Weather API** | OpenWeatherMap (free tier) | Simple integration |
| **Auth** | Simple password | Single-user, basic security |

### 13.4 Data Model

```sql
-- Devices (for multi-hive support)
CREATE TABLE devices (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    ip_address TEXT,
    last_seen DATETIME,
    status TEXT DEFAULT 'offline'
);

-- Incident recordings
CREATE TABLE incidents (
    id INTEGER PRIMARY KEY,
    device_id INTEGER REFERENCES devices(id),
    timestamp DATETIME NOT NULL,
    clip_path TEXT NOT NULL,
    thumbnail_path TEXT,
    duration_sec REAL
);

-- Daily statistics with weather
CREATE TABLE daily_stats (
    id INTEGER PRIMARY KEY,
    device_id INTEGER REFERENCES devices(id),
    date DATE NOT NULL,
    detections INTEGER DEFAULT 0,
    laser_activations INTEGER DEFAULT 0,
    weather_temp REAL,
    weather_desc TEXT,
    weather_icon TEXT
);

-- Device logs (boots, errors, etc.)
CREATE TABLE device_logs (
    id INTEGER PRIMARY KEY,
    device_id INTEGER REFERENCES devices(id),
    timestamp DATETIME NOT NULL,
    event_type TEXT NOT NULL,
    message TEXT
);
```

### 13.5 API Endpoints (Device → Server)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/device/register` | Device announces itself on boot |
| POST | `/api/heartbeat` | Periodic health check (every 60s) |
| POST | `/api/incident` | Upload incident clip + metadata |
| POST | `/api/log` | Send log entry (boot, error, etc.) |

### 13.6 API Endpoints (Dashboard → Server)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/` | Dashboard HTML page |
| GET | `/api/status` | Current device status |
| GET | `/api/incidents` | List incidents (paginated) |
| GET | `/api/incidents/{id}` | Get incident details |
| GET | `/api/clips/{filename}` | Stream/download clip file |
| GET | `/api/history` | Daily stats for date range |
| GET | `/api/stream` | Proxy live stream from device |
| POST | `/api/device/arm` | Send arm command to device |
| POST | `/api/device/disarm` | Send disarm command to device |

### 13.7 Deployment Options

| Option | Pros | Cons |
|--------|------|------|
| **Old PC/laptop** | Free, always on | Power consumption |
| **Raspberry Pi 4** | Low power (~5W), cheap | Need to set up |
| **Synology/QNAP NAS** | Already running 24/7 | Docker setup |
| **Cloud VM (Hetzner, OVH)** | €3-5/month, accessible anywhere | Monthly cost |
| **Home Assistant add-on** | Integrates with existing smart home | Requires HA |

### 13.8 Clip Storage

**Naming convention:**
```
/clips/
  2026/
    01/
      21/
        hornet_2026-01-21_14-32-05.mp4
        hornet_2026-01-21_14-32-05.jpg  (thumbnail)
        hornet_2026-01-21_11-47-22.mp4
        ...
```

**Storage estimate:**
- 10-second clip at VGA: ~2-5 MB
- 10 detections/day × 5 MB = 50 MB/day
- 30 days = 1.5 GB/month
- 1 year = ~18 GB (very manageable)

---

## 15. Bill of Materials

### 12.1 Path C: Prototype (Jermoo's Build)

| Item | Specification | Qty | Have? | Est. Cost (€) | Source |
|------|---------------|-----|-------|---------------|--------|
| Raspberry Pi 5 | 4GB or 8GB | 1 | ✅ | 0 | - |
| Pi Camera | OV5647 5MP | 1 | ✅ | 0 | - |
| CSI Ribbon Cable | 15-pin to 22-pin for Pi 5 | 1 | ✅ | 0 | - |
| SG90 Servo | 9g micro servo | 1 | ❌ | 2-3 | Amazon/AliExpress |
| Green Line Laser | 5mW 520-532nm | 1 | ❌ | 5-10 | Amazon/AliExpress |
| 2N2222 Transistor | NPN for laser switching | 1 | ❌ | 0.50 | Electronics shop |
| 1kΩ Resistor | For transistor base | 1 | ❌ | 0.10 | Electronics shop |
| 100µF Capacitor | Servo power smoothing | 1 | ❌ | 0.50 | Electronics shop |
| Jumper Wires | Female-to-female | 10 | ❌ | 2-3 | Amazon |
| USB-C Power Supply | 5V 3A+ (27W recommended) | 1 | ❓ | 0-15 | If not owned |
| Extension Cord | Outdoor rated | 1 | ❓ | 0-15 | If not owned |
| **TOTAL** | | | | **~€10-25** | |

### 12.2 Path A: ESP32-CAM Production Version

| Item | Specification | Qty | Est. Cost (€) |
|------|---------------|-----|---------------|
| ESP32-CAM-MB | With USB programmer board | 1 | 10-12 |
| SG90 Servo | 9g micro servo | 1 | 2-3 |
| Green Line Laser | 5mW 520-532nm | 1 | 5-10 |
| 2N2222 Transistor | NPN | 1 | 0.50 |
| Resistors/Capacitors | Assorted | - | 1 |
| Jumper Wires | | 10 | 2 |
| USB Power Supply | 5V 2A | 1 | 5-10 |
| **TOTAL** | | | **~€25-40** |

### 12.3 3D Printed Parts (Request for Jermoo's Friend)

| Part | Description | Material |
|------|-------------|----------|
| Servo Mount Bracket | Holds SG90, has mounting holes | PLA |
| Laser Holder | Clips to servo horn, holds 6-12mm laser tube | PLA |
| Camera Mount (optional) | Adjustable angle for Pi camera | PLA |

**Dimensions:**
- Servo cavity: 23mm x 12mm x 29mm (SG90 body)
- Laser tube: Measure actual module (common: 6mm, 9mm, 12mm diameter)

---

## 16. Gap Analysis: Beehive Monitoring Features

This section compares features offered by commercial beehive monitoring systems (HiveTracks, BroodMinder, 3Bee Hive-tech) with what our hardware (Pi 5 + camera + servo + laser) could potentially support as future expansions.

### 15.1 Market Comparison Overview

| Feature Category | HiveTracks | BroodMinder | 3Bee Hive-tech | Our System (Potential) |
|-----------------|------------|-------------|----------------|------------------------|
| **Hive Weight** | ❌ App only | ✅ Load cells | ✅ Aluminum rails | ⚠️ Requires add-on |
| **Temperature** | ❌ App only | ✅ Sensor | ✅ Internal/External | ✅ Easy GPIO add |
| **Humidity** | ❌ App only | ✅ Sensor | ✅ Sensor | ✅ Easy GPIO add |
| **Sound/Acoustics** | ❌ | ❌ | ✅ Intensity | ✅ USB mic possible |
| **Visual Monitoring** | ❌ | ❌ | ❌ | ✅ **Native** |
| **Predator Detection** | ❌ | ❌ | ❌ | ✅ **Core feature** |
| **Active Deterrent** | ❌ | ❌ | ❌ | ✅ **Core feature** |
| **Inspection Records** | ✅ App | ❌ | ✅ App | ⚠️ Dashboard add |
| **AI/ML Features** | ✅ Plant ID | ❌ | ❌ | ⚠️ Extensible |
| **Weather Integration** | ✅ Historical | ✅ Basic | ✅ External | ✅ API-ready |
| **Alerts/Notifications** | ✅ Email | ✅ Email/SMS | ✅ Daily | ✅ Companion server |
| **Offline Operation** | ✅ Sync | ✅ Local log | ⚠️ GSM req. | ✅ **Core design** |

**Legend:** ✅ Supported | ⚠️ Requires add-on/future | ❌ Not available

### 15.2 Unique Differentiators

Our system offers capabilities no commercial solution currently provides:

| Feature | Competition | Our System |
|---------|-------------|------------|
| Real-time predator detection | None | ✅ Camera-based motion/size/hover |
| Active deterrent response | None | ✅ Servo-aimed laser |
| Video clip recording | None | ✅ Per-incident clips |
| Entrance monitoring camera | None | ✅ Continuous visual |
| Open source hardware | None | ✅ Full BOM + STL files |
| Zero ongoing costs | €5-15/mo subscriptions | ✅ Self-hosted |

### 15.3 Feature Gap: Add-on Potential

With our existing hardware, these features could be added with minimal extra components:

#### 15.3.1 Temperature & Humidity (LOW effort)

**Components:** DHT22 or BME280 sensor (~€5-10)

**Implementation:**
- Connect to Pi GPIO (I2C for BME280, single-wire for DHT22)
- BME280 preferred: ±0.5°C accuracy, also measures pressure
- Log to companion server dashboard
- Alert thresholds: <10°C (cluster), >40°C (overheating), >80% humidity

**Value:** Monitor brood nest conditions, detect swarming preparation (temp rise)

#### 15.3.2 Hive Weight (MEDIUM effort)

**Components:** HX711 load cell amplifier + 50kg load cells (~€15-25)

**Implementation:**
- 4x load cells in Wheatstone bridge configuration
- HX711 connects to GPIO
- Resolution: ~10g (sufficient for honey flow detection)
- Log daily weight curve to companion server

**Value:**
- Honey flow detection (weight gain pattern)
- Robbing detection (rapid weight loss)
- Winter stores monitoring
- Swarm departure (~2-3kg sudden loss)

#### 15.3.3 Acoustic Monitoring (MEDIUM effort)

**Components:** USB microphone (~€10-20)

**Implementation:**
- Record short samples (10s every hour)
- FFT analysis for frequency patterns
- Key signatures: 200-300Hz worker piping, 400-500Hz queen piping

**Value:**
- Queenlessness detection
- Pre-swarm behavior (increased 400Hz activity)
- Winter cluster activity verification

#### 15.3.4 Bee Counter (HIGH effort)

**Components:** IR break-beam sensors or second camera

**Implementation:**
- Entrance tunnel with directional sensors
- Count in/out traffic patterns
- Alternative: ML model on existing camera for bee counting

**Value:**
- Forager activity levels
- Orientation flight patterns
- Colony strength estimation
- Pesticide incident detection (mass forager loss)

### 15.4 Software Feature Gaps

Features requiring only software updates to companion server:

| Feature | HiveTracks Has | Implementation Effort |
|---------|----------------|----------------------|
| Inspection templates | ✅ | Low - web form |
| Weather historical data | ✅ | Low - OpenWeather API |
| Plant/flora calendar | ✅ | Low - regional database |
| Task reminders | ✅ | Low - notification system |
| PDF/CSV export | ✅ | Low - data formatting |
| Multi-hive dashboard | ✅ | Medium - device registry |
| Seasonal comparison | ✅ | Medium - data visualization |
| Community data sharing | ✅ | High - authentication/privacy |

### 15.5 Roadmap Priority

Based on value vs. effort, recommended expansion order:

| Priority | Feature | Effort | Hardware Cost | Value Add |
|----------|---------|--------|---------------|-----------|
| **P1** | Temp/Humidity | 2 hours | €8 | High |
| **P2** | Weather API | 1 hour | €0 | Medium |
| **P3** | Inspection forms | 4 hours | €0 | Medium |
| **P4** | Hive weight | 8 hours | €20 | High |
| **P5** | Acoustic analysis | 16 hours | €15 | Medium |
| **P6** | Bee counting | 40+ hours | €0-30 | High |

### 15.6 Cost Comparison

| System | Initial Cost | Annual Subscription | 5-Year TCO |
|--------|-------------|---------------------|------------|
| **BroodMinder TH** | ~€50-80 | €50-100 | €300-580 |
| **BroodMinder W (weight)** | ~€150 | €50-100 | €400-650 |
| **3Bee Hive-tech** | ~€200 | Unknown | Unknown |
| **HiveTracks Pro** | €0 | €60-120 | €300-600 |
| **Our System (base)** | ~€40-50 | €0 | €40-50 |
| **Our System + sensors** | ~€80-100 | €0 | €80-100 |

**Advantage:** Our system costs less and does more (predator detection + deterrent), with no ongoing subscription fees.

### 15.7 Research Sources

- [HiveTracks App Store](https://apps.apple.com/us/app/hivetracks/id1667408004)
- [BroodMinder Hobbyist Features](https://broodminder.com/pages/mybroodminderfeatures-hobby)
- [3Bee Hive-tech Technology](https://www.3bee.com/en/technology/)
- [Smart Hive Monitoring Trends 2025](https://beekeepingideas.com/smart-hive-monitoring/)

---

## 17. Research Sources

### 16.1 Asian Hornet Behavior
- Tan et al. (2007). "Bee-hawking by Vespa velutina" - Naturwissenschaften
- PMC Studies on Hornet-Bee interactions
- CABI Compendium - Vespa velutina
- EPPO Global Database - 2024 spread updates

### 16.2 Laser Safety
- IEC 60825-1 / EN 60825-1 - Laser classification standards
- EN 50689:2021 - Consumer laser product safety
- EU regulations on laser pointer sales

### 16.3 Existing Projects
- VespAI - University of Exeter (Nature Communications Biology, 2024)
- Hornet Sentry Gun - Hackaday.io
- hornet3000 - GitHub (vespCV)
- BeeAlarmed - GitHub

### 16.4 Hardware Specifications
- OV2640 Datasheet - Omnivision
- ESP32-CAM benchmarks - arXiv study
- Raspberry Pi 5 specifications - raspberrypi.com
- SG90 Servo specifications - ServoDatabase

### 16.5 Insect Vision
- Hymenoptera spectral sensitivity studies
- MDPI Animals (2024) - Vespinae LED wavelength response
- Journal of Experimental Biology - Compound eye spatial resolution

---

## Appendix A: Prototype Wiring Detail

*To be added with actual wiring photos during build*

## Appendix B: Software Architecture

*To be added during development*

## Appendix C: Installation Guide

*To be added after prototype validation*

---

**Document Status:** Ready for Review
**Next Step:** Begin prototype build with available components
