# APIS Hardware Concepts Guide

**Who is this for?** A smart person with no electronics experience who wants to understand what they're building and why.

**How to use this guide:** Read this first before any assembly. Every concept is explained once clearly, with analogies and examples. Reference the [complete hardware specification](../hardware-specification.md) for full build details.

---

## Table of Contents

1. [Electricity Basics](#1-electricity-basics)
2. [GPIO Pins](#2-gpio-pins)
3. [PWM - Controlling Servos](#3-pwm---controlling-servos)
4. [Pull-up and Pull-down Resistors](#4-pull-up-and-pull-down-resistors)
5. [Power Requirements](#5-power-requirements)
6. [Laser Safety](#6-laser-safety)
7. [System Overview](#7-system-overview)
8. [Glossary](#8-glossary)

---

## 1. Electricity Basics

### The Water Pipe Analogy

Think of electricity like water flowing through pipes:

| Electrical Term | Water Analogy | What It Means |
|-----------------|---------------|---------------|
| **Voltage (V)** | Water pressure | How hard electricity is pushed. Higher voltage = more force. |
| **Current (A)** | Water flow rate | How much electricity flows per second. Measured in Amps (A) or milliamps (mA). |
| **Resistance (Ω)** | Pipe narrowness | What restricts flow. Measured in Ohms. |

**Key relationship:** Voltage = Current × Resistance (Ohm's Law)

### Why This Matters

Your components need specific voltages:
- **Too high voltage:** Damages the component (magic smoke escapes)
- **Too low voltage:** Component won't work properly

Current determines how much power you need from your power supply.

### 3.3V vs 5V

Two voltage levels you'll encounter constantly:

| Voltage | Used For | Notes |
|---------|----------|-------|
| **5V** | USB power, servos, some lasers | What comes from USB ports and adapters |
| **3.3V** | Microcontroller logic, sensors | Modern chips run internally on 3.3V |

**Critical rule:** Never connect 5V to a pin that expects 3.3V. This will permanently damage the chip.

---

## 2. GPIO Pins

### What is GPIO?

**GPIO = General Purpose Input/Output**

These are the programmable pins on your microcontroller (Pi, ESP32) that you control with code:

- **Output mode:** Send voltage out (turn on LED, activate laser)
- **Input mode:** Read voltage coming in (button pressed, sensor triggered)

### Digital vs Analog

| Type | Description | Example |
|------|-------------|---------|
| **Digital** | On or Off only. 3.3V or 0V. | Light switch |
| **Analog** | Variable. 0V to 3.3V range. | Dimmer switch |

### Pin Capability Diagram

Here's a simplified view of Raspberry Pi GPIO pins showing which pins do what:

```
Raspberry Pi GPIO Header (simplified - key pins only):
┌─────────────────────────────────────────────────────────────┐
│  Pin 1 (3.3V Power)          Pin 2 (5V Power)               │
│  Pin 3 (GPIO 2/I2C-SDA)      Pin 4 (5V Power)               │
│  Pin 5 (GPIO 3/I2C-SCL)      Pin 6 (GND)                    │
│  ...                                                         │
│  Pin 11 (GPIO 17)            Pin 12 (GPIO 18/PWM0) ◄─ SERVO │
│  ...                                                         │
│  Pin 29 (GPIO 5)             Pin 30 (GND)                   │
│  Pin 31 (GPIO 6)             Pin 32 (GPIO 12/PWM0)          │
│  Pin 33 (GPIO 13/PWM1)       Pin 34 (GND)                   │
│  Pin 35 (GPIO 19/PWM1)       Pin 36 (GPIO 16)               │
│  Pin 37 (GPIO 26)            Pin 38 (GPIO 20)               │
│  Pin 39 (GND)                Pin 40 (GPIO 21)               │
└─────────────────────────────────────────────────────────────┘

Legend:
  PWM0/PWM1 = Hardware PWM capable (use for servos)
  I2C-SDA/SCL = Reserved for I2C sensors
  GND = Ground connections (0V reference)
  3.3V/5V = Power output pins (NOT for signals!)
```

For ESP32-CAM and XIAO ESP32S3 pin diagrams, see the [hardware specification](../hardware-specification.md).

### Not All Pins Are Equal

Some pins have special functions:
- **PWM pins:** Can generate precise timing signals (needed for servos)
- **I2C pins:** Reserved for sensor communication
- **Boot pins:** Must be in certain states when power is applied

### Why We Chose GPIO 18 for the Servo

On the Raspberry Pi, **GPIO 18** supports hardware PWM, which means the chip itself generates the precise timing signals. This is important because:

- **Hardware PWM:** Chip handles timing, rock-solid pulses, CPU free for other tasks
- **Software PWM:** CPU generates pulses, can jitter if CPU busy, servo may twitch

GPIO 18 is one of only a few pins with hardware PWM capability. That's why we use it for servo control.

On ESP32, **GPIO 13** (ESP32-CAM) and **GPIO 5** (XIAO ESP32S3) serve the same purpose — they support LEDC hardware PWM channels.

### What Happens If You Connect to the Wrong Pin

| Wrong Connection | What Happens |
|------------------|--------------|
| **Signal wire to 5V power pin** | Component receives constant 5V instead of signal. May overheat or burn out immediately. |
| **Signal wire to GND** | Component receives no signal. Won't work but usually no damage. |
| **Signal to boot-strapping pin (GPIO 0, 2 on ESP32)** | Device may fail to boot at all, or boot into wrong mode. |
| **Servo to non-PWM GPIO** | Software PWM may work poorly. Servo jitters, moves erratically, or barely moves. |
| **5V component to 3.3V output** | Component may not work (underpowered). |
| **3.3V input receives 5V** | **PERMANENT DAMAGE.** The chip's input protection fails and fries the pin or entire chip. |
| **Power polarity reversed (+ to -, - to +)** | **IMMEDIATE DESTRUCTION.** Component releases magic smoke. Sometimes with sparks. |

**Golden rule:** Triple-check every connection against the wiring diagram before applying power.

**For APIS:** We carefully selected pins that are safe to use. Follow the pin assignments in the assembly guides exactly.

---

## 3. PWM - Controlling Servos

### What is PWM?

**PWM = Pulse Width Modulation**

Imagine rapidly flipping a light switch on and off. If it's on 50% of the time, the light appears half-bright. That's the basic idea.

### How Servos Use PWM

Servos expect a pulse every 20 milliseconds (50 times per second). The **width** of each pulse tells the servo where to move:

```
PWM Signal:
   ┌──┐                    ┌──┐
   │  │                    │  │
───┘  └────────────────────┘  └────
   1ms         19ms
   │←──────── 20ms ─────────►│

   Pulse width: 1ms → Servo at 0° (far left)


   ┌────┐                  ┌────┐
   │    │                  │    │
───┘    └──────────────────┘    └──
   1.5ms       18.5ms

   Pulse width: 1.5ms → Servo at 90° (center)


   ┌──────┐                ┌──────┐
   │      │                │      │
───┘      └────────────────┘      └─
    2ms        18ms

   Pulse width: 2ms → Servo at 180° (far right)
```

### Why This Matters

Only certain GPIO pins support hardware PWM (precise timing without loading the CPU). We use these pins for the servo to ensure smooth movement.

---

## 4. Pull-up and Pull-down Resistors

### The Problem

When a GPIO input pin is not connected to anything, it "floats" — the voltage can be anything, causing random readings.

### The Solution

Resistors that give the pin a defined default state:

**Pull-up resistor:** Connects pin to 3.3V through a resistor
- Default state: HIGH (3.3V)
- Pressing button pulls to GND (LOW)

**Pull-down resistor:** Connects pin to GND through a resistor
- Default state: LOW (0V)
- Pressing button pulls to 3.3V (HIGH)

```
Pull-up resistor example:

    3.3V ──┬── 10kΩ ──┬── GPIO Pin
           │          │
         Button      (reads HIGH normally)
           │
          GND        (reads LOW when pressed)
```

### For APIS

Good news: The Pi, ESP32-CAM, and XIAO all have **built-in** pull-up resistors. We enable them in software — no external resistor needed for the arm/disarm button.

---

## 5. Power Requirements

### Understanding Power Consumption

Each component draws a certain amount of current (amps). Let's start with a simple example.

### Simple Power Calculation

Here's how to calculate your total power needs:

1. **Servo draws:** 500mA
2. **Laser draws:** 200mA
3. **Microcontroller draws:** 300mA
4. **Total:** 500 + 200 + 300 = 1000mA = 1A

A 2A USB adapter provides enough headroom (double what we need). Always leave margin for safety.

### Real-World Values

The simple example above illustrates the concept. Here are actual peak values for our components:

| Component | Typical Current | Peak Current | Notes |
|-----------|-----------------|--------------|-------|
| ESP32-CAM | 180mA | 310mA | Peak during WiFi transmission |
| XIAO ESP32S3 | 150mA | 280mA | Peak during WiFi transmission |
| Raspberry Pi 5 | 600mA | 2500mA | Varies with CPU load |
| Servo (SG90) | 10mA | **1200mA** | Stall current is massive! |
| Laser (5mW) | 30mA | 40mA | Relatively small |
| RGB LED | 4mA/channel | 12mA | All three colors on |

### Calculating Total Power Needed

Add up the peak currents for worst-case scenario:

**ESP32-CAM path:**
- ESP32: 310mA (WiFi TX)
- Servo: 1200mA (stalled)
- Laser: 40mA
- **Total: ~1550mA** → Need at least 2A power supply (3A recommended)

### What Happens If Underpowered?

| Symptom | Cause |
|---------|-------|
| Board randomly resets | "Brownout" - voltage dropped too low |
| Servo jitters | Voltage instability under load |
| WiFi disconnects | Not enough power for transmission |
| Erratic behavior | Insufficient current for all components |

### Servo Stall Warning

The 500mA figure often quoted for servos is for **normal movement**. If the servo hits an obstacle or mechanical stop, it can draw **800-1200mA continuously**. Always size your power supply for stall current.

---

## 6. Laser Safety

### Class 3R - What It Means

Our laser is Class 3R (5mW, 650nm red). In plain language:

| Risk | Explanation |
|------|-------------|
| **Eye damage** | Can cause injury if beam enters eye directly |
| **No blink reflex protection** | Damage happens faster than you can blink |
| **Reflection hazard** | Mirrors, shiny metal, glass can redirect beam |

**Do not assume "it's only 5mW, it's safe."** Treat any direct beam exposure as hazardous.

### Safety Rules

1. **NEVER** look directly into the beam
2. **NEVER** point at people or animals (except target hornets)
3. **NEVER** aim toward sky (aircraft hazard - serious criminal offense)
4. **ALWAYS** mount at downward angle (toward ground)
5. **WEAR** laser safety glasses during testing (OD2+ at 650nm)
6. **COVER** laser when not in use

### Software Safety Features

The firmware includes multiple safety interlocks:
- Laser ONLY activates when target detected
- Maximum ON time: 10 seconds continuous
- Cooldown period between activations
- Master enable from dashboard/button
- Failsafe: laser OFF if software crashes

### Aircraft Safety

A 5mW laser is visible to aircraft at long distances. Illuminating an aircraft is a **serious criminal offense** in most countries. Our mounting guidelines ensure the laser cannot aim above horizontal.

---

## 7. System Overview

### What We're Building

A standalone device that:

1. **Sees** — Camera watches the hive entrance
2. **Detects** — Software identifies hovering Asian hornets
3. **Aims** — Servo moves laser to track the hornet
4. **Deters** — Laser beam startles hornet away
5. **Records** — Saves video clip of the incident
6. **Reports** — Sends clip to companion server (optional)

### System Diagram

```
                    ┌─────────────────────────────────────┐
                    │           APIS Edge Device          │
                    │                                     │
  ┌──────────┐      │  ┌──────────────────────────────┐  │
  │  Camera  │──────┼──│  Microcontroller             │  │
  └──────────┘      │  │  (Pi 5 / ESP32-CAM / XIAO)   │  │
                    │  │                              │  │
  ┌──────────┐      │  │  • Detection Algorithm       │  │
  │  Servo   │◄─────┼──│  • Servo Control             │  │
  │ (Pan)    │      │  │  • Laser Safety Logic        │  │
  └──────────┘      │  │  • Clip Recording            │  │
                    │  │  • Network Communication     │  │
  ┌──────────┐      │  │                              │  │
  │  Laser   │◄─────┼──│                              │  │
  │  Module  │      │  └──────────────────────────────┘  │
  └──────────┘      │                                     │
                    │  ┌──────────┐  ┌──────────┐        │
  ┌──────────┐      │  │  Status  │  │  Arm/    │        │
  │  Power   │──────┼──│  LED     │  │  Disarm  │        │
  │  Supply  │      │  └──────────┘  │  Button  │        │
  └──────────┘      │                └──────────┘        │
                    └─────────────────────────────────────┘
                                     │
                                     │ WiFi (optional)
                                     ▼
                    ┌─────────────────────────────────────┐
                    │        APIS Companion Server        │
                    │  (Dashboard, Clip Archive, Stats)   │
                    └─────────────────────────────────────┘
```

### Three Hardware Paths

| Path | Board | Cost | Best For |
|------|-------|------|----------|
| **A** | Raspberry Pi 5 | ~€80 | Development, learning |
| **B** | ESP32-CAM | ~€15 | Production, lowest cost |
| **C** | XIAO ESP32S3 | ~€25 | Production, better quality |

**Path A (Pi 5)** is for development only. The goal is Path B or C for actual deployment — cheap enough to put on every hive.

---

## 8. Glossary

| Term | Pronunciation | Definition |
|------|---------------|------------|
| **650nm** | "six-fifty nanometers" | Wavelength of red laser light. nm = nanometers (billionths of a meter). |
| **Brownout** | "brown-out" | Voltage drop causing device reset or malfunction. |
| **Class 3R** | "class three R" | Laser class. 1-5mW. Hazardous to eyes with direct exposure. |
| **CSI** | "C-S-I" | Camera Serial Interface. Ribbon cable connection for Pi cameras. |
| **Dupont** | "doo-pont" | Standard 2.54mm pitch connectors with pins/sockets. |
| **ESD** | "E-S-D" | Electrostatic Discharge. Static shock that can damage electronics. |
| **FTDI** | "F-T-D-I" | Company making USB-serial adapters. Generic term for such adapters. |
| **GPIO** | "G-P-I-O" or "gee-pee-eye-oh" | General Purpose Input/Output. Programmable pins on microcontroller. |
| **mDNS** | "M-D-N-S" | Multicast DNS. Allows finding devices by name (e.g., `apis.local`). |
| **OD2+** | "O-D two plus" | Optical Density 2+. Laser safety glasses rating. OD2 blocks 99% of laser light at specified wavelength. |
| **Ohm (Ω)** | "ohm" | Unit of electrical resistance. Higher ohms = more restriction to current flow. |
| **Pull-up** | "pull-up" | Resistor connecting pin to power. Default state = HIGH. |
| **PWM** | "P-W-M" | Pulse Width Modulation. Rapid on/off switching to simulate variable voltage. |
| **Servo** | "sir-voh" | Motor that moves to a commanded angle and holds position. |
| **Stall current** | "stall current" | Maximum current a motor draws when blocked from moving. Much higher than running current. |
| **Stall torque** | "stall tork" | Maximum torque servo can exert before motor stalls. |
| **WiFi TX** | "why-fye tee-ex" | WiFi Transmission. When the device is actively sending data wirelessly (uses more power). |

---

## Next Steps

Now that you understand the concepts:

1. **Choose your hardware path** (A, B, or C)
2. **Order components** from the Bill of Materials
3. **Read the assembly guide** for your chosen path
4. **Build incrementally**, testing at each checkpoint

See the [complete hardware specification](../hardware-specification.md) for detailed assembly instructions.

---

*This document teaches the concepts. The hardware-specification.md shows you exactly what to build.*
