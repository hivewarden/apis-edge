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

# Product Requirements Document - APIS: Anti-Predator Interference System

**Author:** Jermoo
**Date:** 2026-01-22
**Version:** 2.0
**Status:** Draft

---

## Executive Summary

An open-source, camera-based detection system that identifies Asian hornets (Vespa velutina) hovering near beehive entrances and deters them using a low-power green laser. The system aims to protect honeybee colonies from this invasive predator using affordable, widely available components that hobbyist beekeepers can replicate.

**Primary Deliverable:** Edge hardware device (3 development paths)
**Supporting Infrastructure:** Companion portal for monitoring, analysis, and hive management

**Primary User:** Jermoo (beekeeper with 2 hives, project creator)
**Target Audience:** Hobbyist beekeepers willing to build DIY electronics projects
**Distribution Model:** Open source (GitHub, documentation, bill of materials)

### Product Vision Evolution

The core mission remains **hornet detection and laser deterrent hardware**. During UX design, the companion portal expanded from a simple dashboard to a **complete beekeeping management portal** — the philosophy being: *"If you're going to attach technology to beekeeping, it all goes through one portal."*

| Component | Priority | Description |
|-----------|----------|-------------|
| **Edge Hardware** | P1 — Core | Detection + deterrent device (Pi 5 → ESP32) |
| **Hornet Dashboard** | P1 — Core | Monitor protection, view patterns, review clips |
| **Hive Diary** | P2 — Supporting | Inspection records, treatments, harvests |
| **BeeBrain AI** | P3 — Enhancement | Pattern analysis, recommendations |
| **Future Sensors** | P4 — Future | Weight, temperature, humidity, sound |

---

## Table of Contents

**Part A: Edge Hardware (Core Product)**
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
13. [Bill of Materials](#13-bill-of-materials)

**Part B: Companion Portal (Supporting Infrastructure)**
14. [Portal Overview](#14-portal-overview)
15. [Hornet Dashboard](#15-hornet-dashboard)
16. [Hive Diary Module](#16-hive-diary-module)
17. [BeeBrain AI](#17-beebrain-ai)
18. [Mobile PWA Requirements](#18-mobile-pwa-requirements)
19. [Data Architecture](#19-data-architecture)
20. [Portal Technical Stack](#20-portal-technical-stack)

**Part C: Future & Research**
21. [Future Sensors](#21-future-sensors)
22. [Research Sources](#22-research-sources)

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

### 2.4 Expanded Vision: One Portal for All Beekeeping Tech

During UX design, the companion server evolved from a simple dashboard to a comprehensive beekeeping management portal. The philosophy:

> *"If you're going to attach technology to beekeeping, it all goes through one portal."*

**Core (supports hardware):**
- Hornet detection dashboard with pattern visualization
- Activity Clock (24-hour polar chart of hornet activity)
- Temperature correlation charts
- Nest radius estimation from hornet timing
- Clip archive with search/filter

**Extended (hive management):**
- Full hive diary with inspections
- Frame-level tracking (brood, honey, empty)
- Treatment and feeding logs
- Harvest tracking (Flow Hive support)
- Equipment inventory per hive

**AI-Powered:**
- BeeBrain: Mini AI model for pattern analysis
- Per-section insights with recommendations
- Exportable data for external LLM analysis

**Mobile-First:**
- Glove-friendly PWA (64px tap targets)
- Voice input via Whisper
- Offline-first with sync queue
- QR code hive navigation

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

### 3.3 Expanded User Needs (from UX Design)

| Need | Context |
|------|---------|
| **Trust at a glance** | Know hives are protected in 2 seconds |
| **Pattern learning** | Understand when/why hornets come |
| **Field recording** | Log inspections with gloves on |
| **Offline operation** | Apiaries often have no signal |
| **Voice input** | Can't type with bee suit gloves |
| **One portal** | All beekeeping tech in one place |
| **Long-term data** | Track hive development over years |
| **Seasonal insights** | Learn from each season's patterns |

### 3.4 User Tiers (UI Modes)

| Mode | Target User | UI Approach |
|------|-------------|-------------|
| **Hobby** (default) | 1-10 hives | Clean, simple, contextual feature reveal |
| **Enterprise** | 50+ hives | Dense tables, bulk operations, team access |

Features are not paywalled — tiers control UI density only. All features available to all users.

### 3.5 Success Metric for Users

> "Can someone with Jermoo's skill level (no electronics experience) replicate this from the documentation?"

> "Does the portal feel like a warm beekeeping companion, not a clinical IoT dashboard?"

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

## 13. Bill of Materials

### 13.1 Path C: Prototype (Jermoo's Build)

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
| USB-C Power Supply | 5V 5A (official Pi 5 PSU) | 1 | ❓ | 0-15 | If not owned |
| **TOTAL** | | | | **~€10-25** | |

### 13.2 Path A: ESP32-CAM Production Version

| Item | Specification | Qty | Est. Cost (€) |
|------|---------------|-----|---------------|
| ESP32-CAM-MB | With USB programmer board | 1 | 10-12 |
| SG90 Servo | 9g micro servo | 1 | 2-3 |
| Green Line Laser | 5mW 520-532nm | 1 | 5-10 |
| 2N2222 Transistor | NPN | 1 | 0.50 |
| Resistors/Capacitors | Assorted | - | 1 |
| Jumper Wires | | 10 | 2 |
| USB Power Supply | 5V 3A | 1 | 5-10 |
| **TOTAL** | | | **~€25-40** |

---

# Part B: Companion Portal (Supporting Infrastructure)

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

## 14. Portal Overview

The companion portal runs on user's infrastructure (old PC, NAS, Raspberry Pi, or cloud). It provides monitoring, analysis, and complete hive management.

### 14.1 Portal Purpose

| Purpose | Description |
|---------|-------------|
| **Support hardware** | Monitor device status, view detections, review clips |
| **Enable learning** | Visualize patterns, correlations, insights |
| **Manage hives** | Record inspections, treatments, harvests |
| **Work anywhere** | Mobile-friendly, offline-capable PWA |

### 14.2 Portal Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      APIS PORTAL                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Hornet     │  │    Hive      │  │   BeeBrain   │          │
│  │  Dashboard   │  │    Diary     │  │      AI      │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│         │                 │                 │                   │
│         └─────────────────┼─────────────────┘                   │
│                           │                                     │
│                    ┌──────┴──────┐                              │
│                    │  Unified    │                              │
│                    │  Data Layer │                              │
│                    └──────┬──────┘                              │
│                           │                                     │
│         ┌─────────────────┼─────────────────┐                   │
│         │                 │                 │                   │
│  ┌──────┴──────┐  ┌───────┴───────┐  ┌─────┴─────┐             │
│  │ Edge Device │  │   Weather     │  │  Manual   │             │
│  │    Data     │  │     API       │  │   Entry   │             │
│  └─────────────┘  └───────────────┘  └───────────┘             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 14.3 Data Hierarchy

```
User Account
└── Sites (physical locations)
    └── Site "Home Apiary" (GPS coordinates)
        ├── Units (APIS hardware devices)
        │   ├── Unit A → covers Hives 1, 2
        │   └── Unit B → covers Hives 3, 4
        └── Hives
            └── Hive 1
                ├── Inspections
                ├── Treatments
                ├── Harvests
                └── Sensor data (from Unit A)
```

### 14.4 Navigation Structure (Sidebar Layout)

```
┌─────────────────────────────────────────────────────────────────┐
│ ┌─────────┐                                                     │
│ │ 🐝 APIS │                    Main Content Area                │
│ ├─────────┤                                                     │
│ │         │  ┌───────────────────────────────────────────────┐  │
│ │ □ Dash  │  │                                               │  │
│ │ □ Hives │  │   [Site ▼] [Unit ▼] [Hive ▼]                 │  │
│ │ □ Diary │  │   [< Day >] [Week] [Month] [Season] [Year]   │  │
│ │ □ Clips │  │                                               │  │
│ │ □ Stats │  │   Content...                                  │  │
│ │         │  │                                               │  │
│ ├─────────┤  └───────────────────────────────────────────────┘  │
│ │ ⚙ Set.  │                                                     │
│ │ 👤 User │                                                     │
│ └─────────┘                                                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 15. Hornet Dashboard

### 15.1 Dashboard Purpose

The dashboard is primarily a **learning tool** — helping beekeepers understand hornet behavior patterns at their specific location. Video clips validate the system initially but become archive material for ongoing use.

**Two-Phase Usage Model:**

| Phase | When | Focus | Video Role |
|-------|------|-------|------------|
| **Validation** | First 3 days | Verify system works | Primary — watch clips |
| **Ongoing** | Rest of season | Learn patterns, monitor trends | Archive — accessible but secondary |

### 15.2 Daily Glance (Top Section)

| Card | Content |
|------|---------|
| **Weather** | Current temperature, conditions |
| **Hornets** | "7 deterred today" — simple count |
| **Hardware** | "OK" or "Needs attention" — click for details |

Hardware status leads to detailed page showing all units, sensor readings, storage, temperature.

### 15.3 Activity Clock (Hero Visualization)

24-hour polar/radar chart showing hornet activity by hour of day:

```
              12:00
                ▲
          11  / | \  13
            /  |  \
       10 /    |    \ 14    ← Peak activity visible
         |     ●     |         at 14:00-16:00
    09 ──|───────────|── 15
         |           |
        8 \         / 16
            \     /
          7  \   /  17
              \ /
              18:00

Radius = detection count per hour
```

**Chart:** `@ant-design/charts` Radar or Rose chart

### 15.4 Pattern Insight Charts

| Chart | Type | What Users Learn |
|-------|------|------------------|
| **Temperature Correlation** | Scatter | "Hornets prefer 18-24°C" |
| **Daily/Weekly Trend** | Line/Area | Activity patterns over time |
| **Weather Overlay** | Custom | Sunny vs cloudy comparison |

### 15.5 Time Range Selector

Global control affecting all charts:

```
[< Day >]  [Week]  [Month]  [Season]  [Year]  [All Time]
```

- `<` and `>` arrows navigate to previous/next period
- All charts update together when range changes
- **Component:** Ant Design `Segmented` with custom navigation

### 15.6 Nest Radius Estimator

Optional map feature calculating estimated nest distance:

- User enables map, sets site GPS location
- System tracks hornet departure/return timing
- Calculates flight distance (~20-25 km/h)
- Displays radius circle on map showing probable nest area
- Aggregates data from all units at a site

### 15.7 Clip Archive

- Recent clips list with thumbnails
- Date filter/search
- Easy access for validation phase users
- Secondary to pattern insights in ongoing phase

---

## 16. Hive Diary Module

### 16.1 Purpose

Full hive inspection tracking — what every beekeeper already does on paper, digitized with APIS integration.

### 16.2 Hive Configuration

| Field | Description |
|-------|-------------|
| Hive name/number | "Hive 3" |
| Queen age | When introduced |
| Queen source | Breeder, swarm, split, purchased |
| Brood boxes | Number of boxes |
| Honey supers | Number of supers |
| Box history | When added/removed |

### 16.3 Inspection Form (V1)

Quick-entry fields optimized for field use:

| Section | Fields | Input Type |
|---------|--------|------------|
| **Queen** | Seen / Eggs / Q-cells | Toggles |
| **Brood** | Frames count + Pattern | Stepper + Select |
| **Stores** | Honey / Pollen | Low/Med/High |
| **Space** | Tight/OK/Plenty + Needs super? | Select + Toggle |
| **Varroa** | Estimate | Low/Med/High |
| **Temperament** | Calm/Nervous/Defensive | Select |
| **Issues** | DWV, Chalkbrood, Wax moth, AFB | Checkboxes |
| **Actions** | +Super, Fed, Treated | Checkboxes |
| **Notes** | Free text | Voice input |
| **Photos** | Attach images | Camera/Library |

### 16.4 Frame-Level Tracking

Per-box frame inventory:

| Field | Description |
|-------|-------------|
| Total frames | How many in box |
| Drawn comb | Frames with comb built |
| Brood frames | Frames with brood |
| Honey frames | Frames with capped honey |
| Pollen frames | Frames with pollen |
| Empty/foundation | Auto-calculated |

**Long-term graphs:** Track frame development over season and across years.

### 16.5 Treatment & Feeding Logs

**Feeding:**
- Date, hive, feed type, amount, concentration
- Feed types: Sugar syrup, Fondant, Pollen patty, Custom...

**Treatments:**
- Date, hive, treatment type, method, dose
- Treatment types: Oxalic acid, Formic acid, Apivar, MAQS, Custom...
- Mite count before/after (optional)

**Custom Labels:** Users can create their own categories for feeds, treatments, equipment, issues.

### 16.6 Treatment Calendar

- Reminders for scheduled treatments
- "Last treatment X days ago" warnings
- History log of all treatments

### 16.7 Equipment Tracking

Track what's installed on each hive:

| Equipment | When Added | When Removed |
|-----------|------------|--------------|
| Entrance reducer | Oct 15 | — |
| Mouse guard | Nov 1 | — |
| Queen excluder | May 10 | Sep 20 |

### 16.8 Harvest Tracking (Flow Hive Support)

| Field | Description |
|-------|-------------|
| Date | When extracted |
| Hive | Which hive |
| Frame(s) | Which frames (for Flow Hive) |
| Amount | kg or liters |
| Notes | Quality, color, taste |

**Analytics:** Yield per hive per season, year-over-year comparison.

### 16.9 Emotional Moments

| Moment | App Response |
|--------|--------------|
| **First harvest** | Celebration screen + photo prompt |
| **Successful overwintering** | Winter report |
| **Swarm capture** | "New hive" quick-add |
| **Losing a hive** | Post-mortem wizard |
| **Queen introduction** | Queen profile creation |
| **Season end** | Season recap with stats |

---

## 17. BeeBrain AI

### 17.1 Purpose

BeeBrain is APIS's built-in AI — a small, purpose-built model that understands beekeeping and YOUR data.

### 17.2 Implementation Phases

| Phase | Implementation |
|-------|----------------|
| **MVP** | Rule engine (hardcoded patterns, zero download) |
| **Phase 2** | Mini ML model (~300-500MB, fine-tuned) |
| **Future** | Community learning (anonymized patterns) |

### 17.3 Per-Section Analysis

BeeBrain provides contextual analysis in each portal section:

| Section | BeeBrain Analyzes |
|---------|-------------------|
| **Dashboard** | Today's summary + concerns |
| **Hive Detail** | Health + recommendations |
| **Financial** | Profitability, cost per kg |
| **Maintenance** | Priority actions |
| **Season Review** | Year summary, next year prep |
| **Hornet Patterns** | Correlations found |

### 17.4 Analysis UI Pattern

```
┌──────────────────────────────────────────┐
│ 🧠 BeeBrain Analysis                     │
│ Last updated: 2 hours ago  [↻ Refresh]   │
│                                          │
│ "Your cost per kg of honey is €4.20,     │
│  which is below average. Hive 2 is your  │
│  most profitable at €2.80/kg."           │
└──────────────────────────────────────────┘
```

- Timestamp shows when analysis ran
- Refresh button for on-demand re-analysis
- Runs async (can queue overnight on slow hardware)

### 17.5 Proactive Insights

BeeBrain surfaces insights without waiting for questions:

```
💡 BeeBrain noticed:
"Queen is entering her 3rd year and productivity dropped 23%.
 Consider requeening in spring."
[Dismiss]  [Add to reminders]  [Tell me more]
```

### 17.6 Data Export for External LLMs

Configurable export with checkbox selection:

| Format | Use Case |
|--------|----------|
| **Quick summary** | Post on Reddit/forums |
| **Detailed markdown** | Paste into ChatGPT/Claude |
| **Full JSON** | Programmatic analysis |

Users select what to include: basics, inspections, hornet data, weight, weather, BeeBrain insights, financials.

---

## 18. Mobile PWA Requirements

### 18.1 Glove-Friendly Design

Beekeepers wear gloves that reduce touch precision:

| Standard | APIS Mobile |
|----------|-------------|
| 44px tap targets | **64px minimum** |
| Small checkboxes | Large toggle switches |
| Keyboard input | Voice input primary |
| Precise gestures | Swipe navigation |
| 16px body text | 18px body text |

### 18.2 Inspection Flow (Mobile)

```
Select Hive (or scan QR)
        ↓
Quick Entry Cards (swipe through)
        ↓
Notes + Photos (voice input)
        ↓
Review Summary
        ↓
[SAVE] ← 64px full-width button
```

### 18.3 Voice Input Options

| Option | Accuracy | Offline | Implementation |
|--------|----------|---------|----------------|
| **Native dictation** | Good | ✅ | Browser SpeechRecognition API (Android/iOS built-in) |
| **Server Whisper** | Best | ❌ | Stream audio to APIS server, Whisper transcribes |

**Approach:** Mobile web (not native app). Voice input uses either:
1. Native browser dictation (Android/iOS built-in) — works offline, good accuracy
2. Server-side Whisper — for users wanting better accuracy when online

No local WASM model — too heavy for mobile browsers.

### 18.4 Offline-First Architecture

```
┌─────────────────────────────────────────────┐
│              Phone Browser (PWA)            │
├─────────────────────────────────────────────┤
│  Service Worker (app shell, cached)         │
│  IndexedDB (Dexie.js) for local data        │
│  Sync Queue (background sync when online)   │
└─────────────────────────────────────────────┘
```

| Feature | Offline Behavior |
|---------|------------------|
| View dashboard | Cached data from last sync |
| Create inspection | Saved locally, synced later |
| Voice transcription | Local Whisper if downloaded |
| Photos | Stored locally, synced later |

### 18.5 Sync Status Indicator

```
⚡ Offline — 3 inspections pending
```

```
✓ Synced
```

### 18.6 QR Code Navigation

For large apiaries (50+ hives):

- Dashboard generates printable QR codes per hive
- User scans QR → instant hive page
- Format: `apis://hive/{site_id}/{hive_id}`

---

## 19. Data Architecture

### 19.1 Core Entities

```sql
-- Sites (apiaries)
sites: id, name, gps_lat, gps_lng, timezone

-- Units (APIS hardware devices)
units: id, site_id, serial, name, last_seen, status

-- Hives
hives: id, site_id, name, queen_age, queen_source, notes

-- Unit-Hive coverage (which units protect which hives)
unit_hives: unit_id, hive_id

-- Inspections
inspections: id, hive_id, date, queen_seen, brood_frames, ...

-- Treatments
treatments: id, hive_id, date, type, method, dose, notes

-- Feedings
feedings: id, hive_id, date, type, amount, notes

-- Harvests
harvests: id, hive_id, date, frames, amount_kg, notes

-- Hornet detections (from device)
detections: id, unit_id, timestamp, clip_path, confidence

-- Daily stats (aggregated)
daily_stats: id, unit_id, date, detections, weather_temp, weather_desc
```

### 19.2 Custom Labels

```sql
-- User-defined categories
custom_labels: id, user_id, category, label
-- category: 'feed_type', 'treatment_type', 'equipment', 'issue'
```

---

## 20. Portal Technical Stack

### 20.1 Technology Choices

| Component | Technology | Rationale |
|-----------|------------|-----------|
| **Backend** | Go 1.22 + Chi | Idiomatic, no frameworks, per CLAUDE.md |
| **Frontend** | React + Refine + Ant Design | Dashboard framework with data management |
| **Charts** | @ant-design/charts | Themed with Honey Beegood colors |
| **Database** | SQLite (modernc.org/sqlite) | Pure Go, no CGO |
| **PWA** | Service Worker + IndexedDB | Offline-first |
| **Voice** | Whisper (local WASM or server) | Transcription |

### 20.2 Visual Design

**Honey Beegood Palette:**
- Sea Buckthorn `#f7a42d` — Primary
- Coconut Cream `#fbf9e7` — Background
- Brown Bramble `#662604` — Text
- Salomie `#fcd483` — Cards

**Style:** Warm, natural, soft corners (8-12px radius), not clinical IoT.

### 20.3 Deployment Options

| Option | Pros | Cons |
|--------|------|------|
| Old PC/laptop | Free | Power consumption |
| Raspberry Pi 4 | Low power | Setup required |
| NAS (Docker) | Already running | Docker knowledge |
| Cloud VM | Accessible anywhere | Monthly cost |

---

# Part C: Future & Research

## 21. Future Sensors

### 21.1 Planned Sensor Expansion

| Sensor | Hardware | Data | Beekeeper Insight |
|--------|----------|------|-------------------|
| **Inside temp** | DHT22/BME280 | °C continuous | Brood health, cluster |
| **Outside temp** | DHT22/BME280 | °C continuous | Weather correlation |
| **Humidity** | DHT22/BME280 | % continuous | Ventilation |
| **Weight** | HX711 + load cells | kg continuous | Nectar flow, stores |
| **Sound** | USB microphone | Frequency | Queen status, swarming |

### 21.2 Implementation Priority

| Priority | Sensor | Effort | Hardware Cost | Value |
|----------|--------|--------|---------------|-------|
| P1 | Temp/Humidity | 2 hours | €8 | High |
| P2 | Weight | 8 hours | €20 | High |
| P3 | Sound | 16 hours | €15 | Medium |

### 21.3 Per-Hive Sensor Dashboard

When sensors available, each hive gets sensor graphs with same time range selector:

- Temperature (inside vs outside)
- Weight with trend analysis
- Humidity with alerts
- Sound frequency patterns (future)

### 21.4 Automated Alerts

| Alert | Trigger | Risk Level |
|-------|---------|------------|
| Sudden weight drop >1.5kg | Swarm or robbing | High |
| Inside temp drop | Cluster shrinking | Medium |
| Humidity >80% | Ventilation issue | Medium |
| Weight plateau | Nectar flow ended | Info |

---

## 22. Research Sources

### 22.1 Asian Hornet Behavior
- Tan et al. (2007). "Bee-hawking by Vespa velutina" - Naturwissenschaften
- PMC Studies on Hornet-Bee interactions
- CABI Compendium - Vespa velutina
- EPPO Global Database - 2024 spread updates

### 22.2 Laser Safety
- IEC 60825-1 / EN 60825-1 - Laser classification standards
- EN 50689:2021 - Consumer laser product safety
- EU regulations on laser pointer sales

### 22.3 Existing Projects
- VespAI - University of Exeter (Nature Communications Biology, 2024)
- Hornet Sentry Gun - Hackaday.io
- hornet3000 - GitHub (vespCV)
- BeeAlarmed - GitHub

### 22.4 Hardware Specifications
- OV2640 Datasheet - Omnivision
- ESP32-CAM benchmarks - arXiv study
- Raspberry Pi 5 specifications - raspberrypi.com
- SG90 Servo specifications - ServoDatabase

### 22.5 Insect Vision
- Hymenoptera spectral sensitivity studies
- MDPI Animals (2024) - Vespinae LED wavelength response
- Journal of Experimental Biology - Compound eye spatial resolution

---

## Appendix A: Prototype Wiring Detail

*To be added with actual wiring photos during build*

## Appendix B: Software Architecture

*See architecture.md for detailed software architecture*

## Appendix C: UX Design Specification

*See ux-design-specification.md for complete UX design*

---

**Document Status:** Ready for Review
**Version:** 2.0
**Last Updated:** 2026-01-22
**Next Step:** Review architecture alignment, then create Epics & Stories
