# APIS Hardware Specification

**Document Purpose:** Complete hardware build guide for the APIS (Anti-Predator Interference System). Written for someone with minimal electronics experience — every concept is explained, every decision has rationale.

**Document Status:** Living document — update as you learn and build.

---

## Table of Contents

1. [Electronics Fundamentals](#1-electronics-fundamentals)
2. [System Overview](#2-system-overview)
3. [Component Selection](#3-component-selection)
4. [Hardware Path A: Raspberry Pi 5](#4-hardware-path-a-raspberry-pi-5)
5. [Hardware Path B: ESP32-CAM](#5-hardware-path-b-esp32-cam)
6. [Hardware Path C: Seeed XIAO ESP32S3](#6-hardware-path-c-seeed-xiao-esp32s3)
7. [Power System Design](#7-power-system-design)
8. [Servo System](#8-servo-system)
9. [Laser System](#9-laser-system)
10. [Camera System](#10-camera-system)
11. [Enclosure Design](#11-enclosure-design)
12. [Assembly Guide](#12-assembly-guide)
13. [Testing & Validation](#13-testing--validation)
14. [Troubleshooting](#14-troubleshooting)
15. [Glossary](#15-glossary)

---

## 1. Electronics Fundamentals

Before we build anything, let's understand the basics. Skip this section if you're comfortable with basic electronics.

### 1.1 Voltage, Current, and Resistance

**Analogy: Water in pipes**

Think of electricity like water flowing through pipes:
- **Voltage (V)** = Water pressure. Higher voltage pushes electricity harder. Measured in Volts.
- **Current (A)** = Water flow rate. How much electricity flows per second. Measured in Amps (A) or milliamps (mA). 1000mA = 1A.
- **Resistance (Ω)** = Pipe narrowness. Restricts flow. Measured in Ohms.

**Ohm's Law:** V = I × R (Voltage = Current × Resistance)

**Why this matters:** Your components need specific voltages. Too high = damage. Too low = won't work. Current determines how much power you need.

### 1.2 GPIO Pins

**GPIO = General Purpose Input/Output**

These are the pins on your microcontroller (Pi, ESP32) that you can program to:
- **Output:** Send voltage out (turn on LED, activate laser)
- **Input:** Read voltage coming in (button pressed, sensor triggered)

**Digital vs Analog:**
- **Digital:** On or Off. 3.3V or 0V. Like a light switch.
- **Analog:** Variable. 0V to 3.3V range. Like a dimmer.

### 1.3 PWM (Pulse Width Modulation)

**What:** Rapidly switching a pin on/off to simulate variable voltage.

**Analogy:** Flipping a light switch really fast. If it's on 50% of the time, the light appears half-bright.

**Why we need it:** Servos use PWM to know what angle to move to. The "width" of each pulse tells the servo the position.

```
PWM Signal for Servo:
   ┌──┐      ┌──┐      ┌──┐
   │  │      │  │      │  │
───┘  └──────┘  └──────┘  └───
   1ms = 0°   1.5ms = 90°   2ms = 180°
```

### 1.4 I2C and SPI (Communication Protocols)

These are ways for chips to talk to each other.

**I2C (Inter-Integrated Circuit):**
- Uses 2 wires: SDA (data) and SCL (clock)
- Multiple devices can share the same wires
- Slower but simpler

**SPI (Serial Peripheral Interface):**
- Uses 4 wires: MOSI, MISO, CLK, CS
- Faster but needs more wires
- One wire per device for selection

**For APIS:** We mainly use GPIO directly. I2C only if adding sensors later.

### 1.5 Pull-up and Pull-down Resistors

**Problem:** When a GPIO input pin is not connected to anything, it "floats" — random values.

**Solution:**
- **Pull-up resistor:** Connects pin to 3.3V through a resistor. Default = HIGH. Button pulls to GND.
- **Pull-down resistor:** Connects pin to GND through a resistor. Default = LOW. Button pulls to 3.3V.

```
Pull-up resistor:
    3.3V ──┬── 10kΩ ──┬── GPIO Pin
           │          │
         Button      (reads HIGH normally)
           │
          GND        (reads LOW when pressed)
```

**For APIS:** The arm/disarm button needs a pull-up resistor.

### 1.6 Power Supply Basics

**Voltage Regulators:** Convert one voltage to another.
- Example: 5V input → 3.3V output for ESP32

**Why 5V vs 3.3V:**
- USB provides 5V
- Most modern microcontrollers run internally on 3.3V
- Servos typically need 5V-6V
- Lasers vary (check your specific module)

**Current Capacity:**
- Power supply must provide MORE current than your total draw
- If components need 800mA total, use at least 1A (1000mA) supply
- Insufficient current = brownouts, resets, erratic behavior

---

## 2. System Overview

### 2.1 What We're Building

A standalone device that:
1. **Sees** — Camera watches the hive entrance
2. **Detects** — Software identifies hovering Asian hornets
3. **Aims** — Servo moves laser to track the hornet
4. **Deters** — Laser beam startles hornet away
5. **Records** — Saves video clip of the incident
6. **Reports** — Sends clip to companion server (optional)

### 2.2 System Block Diagram

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

### 2.3 Three Hardware Paths

We support three microcontroller options. Choose based on your needs:

| Path | Board | Cost | Difficulty | Best For |
|------|-------|------|------------|----------|
| **A** | Raspberry Pi 5 | ~€80 | Easy | Development, prototyping, learning |
| **B** | ESP32-CAM | ~€8 | Medium | Production, lowest cost |
| **C** | XIAO ESP32S3 Sense | ~€15 | Medium | Production, better quality |

**Important:** Path A (Pi 5) is for development only. The final goal is Path B or C for actual deployment because they're cheap enough to put on every hive.

---

## 3. Component Selection

### 3.1 Bill of Materials (All Paths)

These components are shared across all hardware paths:

| Component | Specification | Why This One | Approx. Cost | Example Part |
|-----------|---------------|--------------|--------------|--------------|
| **Pan Servo** | SG90 or MG90S | Small, cheap, sufficient torque for laser | €2-4 | Tower Pro SG90 |
| **Laser Module** | 5mW 650nm (red) Class 3R | Legal limit, visible, safe-ish | €3-5 | KY-008 module |
| **Status LED** | 5mm RGB common cathode | Shows system state | €0.50 | Any RGB LED |
| **Push Button** | Momentary, normally open | Arm/disarm control | €0.30 | 6mm tactile |
| **Resistors** | 330Ω × 4 (LED, laser) | Current limiting | €0.10 | 1/4W through-hole |
| **Wires** | Dupont jumper wires | Connections | €3 | 40-pin M-F, M-M |
| **Power Supply** | 5V 2A USB-C | Powers everything | €5-10 | Any quality USB-C |

**Total shared components:** ~€15-25

### 3.2 Path A: Raspberry Pi 5 Specific

| Component | Specification | Why This One | Approx. Cost |
|-----------|---------------|--------------|--------------|
| **Raspberry Pi 5** | 4GB or 8GB RAM | Runs OpenCV, has GPIO | €60-80 |
| **Pi Camera Module 3** | 12MP, autofocus | Official, well-supported | €25-35 |
| **Camera ribbon cable** | 15-pin, 30cm | Connects camera to Pi | €3 |
| **microSD Card** | 32GB+ Class 10 | Stores OS and clips | €8-15 |
| **Heatsink/Fan** | Active cooling | Pi 5 runs hot | €5-10 |

**Path A total:** ~€115-155

### 3.3 Path B: ESP32-CAM Specific

| Component | Specification | Why This One | Approx. Cost |
|-----------|---------------|--------------|--------------|
| **ESP32-CAM** | AI-Thinker module | Camera built-in, cheap | €6-10 |
| **FTDI USB-Serial** | FT232RL or CP2102 | For programming (no USB on board) | €3-5 |
| **External antenna** | 2.4GHz with IPEX | Better WiFi range | €2 |

**Path B total:** ~€25-40

### 3.4 Path C: XIAO ESP32S3 Sense Specific

| Component | Specification | Why This One | Approx. Cost |
|-----------|---------------|--------------|--------------|
| **XIAO ESP32S3 Sense** | With camera module | USB-C, good camera, tiny | €13-18 |
| **Expansion board** | Seeed XIAO expansion | Easier prototyping | €5 (optional) |

**Path C total:** ~€30-45

---

## 4. Hardware Path A: Raspberry Pi 5

### 4.1 Why Start with Pi 5

**Advantages for learning:**
- Full Linux OS — familiar environment
- Easy debugging with monitor/keyboard
- Powerful enough to run any detection algorithm
- Excellent documentation and community
- GPIO library (gpiozero) is beginner-friendly

**Disadvantages for production:**
- Expensive (~€70 vs €8 for ESP32)
- Power hungry (~5W vs ~0.5W)
- Overkill for the task

### 4.2 Pi 5 GPIO Pinout

```
                    Pi 5 GPIO Header (40 pins)
                    ┌───────────────────────┐
              3.3V  │ 1  ●  ●  2 │  5V
   (SDA1) GPIO 2    │ 3  ●  ●  4 │  5V
   (SCL1) GPIO 3    │ 5  ●  ●  6 │  GND
         GPIO 4     │ 7  ●  ●  8 │  GPIO 14 (TXD)
              GND   │ 9  ●  ● 10 │  GPIO 15 (RXD)
         GPIO 17    │11  ●  ● 12 │  GPIO 18 (PWM0) ← SERVO
         GPIO 27    │13  ●  ● 14 │  GND
         GPIO 22    │15  ●  ● 16 │  GPIO 23       ← LASER
              3.3V  │17  ●  ● 18 │  GPIO 24       ← LED Red
         GPIO 10    │19  ●  ● 20 │  GND
         GPIO 9     │21  ●  ● 22 │  GPIO 25       ← LED Green
         GPIO 11    │23  ●  ● 24 │  GPIO 8
              GND   │25  ●  ● 26 │  GPIO 7
         GPIO 0     │27  ●  ● 28 │  GPIO 1
         GPIO 5     │29  ●  ● 30 │  GND
         GPIO 6     │31  ●  ● 32 │  GPIO 12       ← LED Blue
         GPIO 13    │33  ●  ● 34 │  GND
         GPIO 19    │35  ●  ● 36 │  GPIO 16
         GPIO 26    │37  ●  ● 38 │  GPIO 20       ← BUTTON
              GND   │39  ●  ● 40 │  GPIO 21
                    └───────────────────────┘
```

### 4.3 Pi 5 Pin Assignments

| Function | GPIO | Pin # | Why This Pin |
|----------|------|-------|--------------|
| **Servo PWM** | GPIO 18 | 12 | Hardware PWM channel 0. Precise timing without CPU load. |
| **Laser Control** | GPIO 23 | 16 | Any GPIO works. Close to servo for neat wiring. |
| **LED Red** | GPIO 24 | 18 | Near other LED pins. |
| **LED Green** | GPIO 25 | 22 | Near other LED pins. |
| **LED Blue** | GPIO 12 | 32 | Hardware PWM1 if we want brightness control. |
| **Button** | GPIO 20 | 38 | Has internal pull-up available. |

### 4.4 Pi 5 Wiring Diagram

```
                        Raspberry Pi 5
                    ┌───────────────────────┐
                    │                       │
    5V (Pin 2) ─────┤►──┬─────────────────►─┤ Servo Red (V+)
                    │   │                   │
   GND (Pin 6) ─────┤►──┼──┬──────────────►─┤ Servo Brown (GND)
                    │   │  │                │
  GPIO 18 (Pin 12) ─┤►──┼──┼──────────────►─┤ Servo Orange (Signal)
                    │   │  │                │
  GPIO 23 (Pin 16) ─┤►──┼──┼──┬───[330Ω]──►─┤ Laser Module Signal
                    │   │  │  │             │
   GND (Pin 14) ────┤►──┼──┼──┼───────────►─┤ Laser Module GND
                    │   │  │  │             │
    5V (Pin 4) ─────┤►──┼──┼──┼───────────►─┤ Laser Module V+
                    │   │  │  │             │
  GPIO 24 (Pin 18) ─┤►──┼──┼──┼──[330Ω]──►──┤ LED Red Anode
                    │   │  │  │             │
  GPIO 25 (Pin 22) ─┤►──┼──┼──┼──[330Ω]──►──┤ LED Green Anode
                    │   │  │  │             │
  GPIO 12 (Pin 32) ─┤►──┼──┼──┼──[330Ω]──►──┤ LED Blue Anode
                    │   │  │  │             │
   GND (Pin 34) ────┤►──┼──┼──┼───────────►─┤ LED Common Cathode
                    │   │  │  │             │
  GPIO 20 (Pin 38) ─┤►──┼──┼──┼───────────►─┤ Button Pin 1
                    │   │  │  │             │
   GND (Pin 39) ────┤►──┴──┴──┴───────────►─┤ Button Pin 2
                    │                       │
                    │   ┌─────────────┐     │
                    │   │ Camera      │     │
                    │   │ Ribbon      │─────┤ CSI Port
                    │   └─────────────┘     │
                    └───────────────────────┘
```

### 4.5 Pi 5 Wiring Step-by-Step

**Tools needed:**
- Dupont jumper wires (male-to-female for Pi, male-to-male for breadboard)
- Small breadboard (optional, for testing)
- Wire stripper (if using custom wires)

**Step 1: Power Rails (do this first, with Pi OFF)**

```
Why: Establish power distribution before connecting components.

1. Connect a jumper from Pi Pin 2 (5V) to your breadboard + rail
2. Connect a jumper from Pi Pin 6 (GND) to your breadboard - rail

Verify: Use multimeter between + and - rails. Should read ~5V.
```

**Step 2: Servo Connection**

```
Why: Servo needs 5V power and a PWM signal for position.

Servo wire colors (standard):
- Brown/Black = GND (negative)
- Red = V+ (positive, 5V)
- Orange/Yellow = Signal (PWM)

Connections:
1. Servo Brown → Breadboard - rail (GND)
2. Servo Red → Breadboard + rail (5V)
3. Servo Orange → Pi GPIO 18 (Pin 12)

Test: Servo should NOT move yet (no code running).
If servo twitches or moves erratically: power supply issue.
```

**Step 3: Laser Module Connection**

```
Why: Laser needs power and an on/off signal from GPIO.

⚠️ SAFETY: Never look into laser. Even 5mW can damage eyes.

Most laser modules have 3 pins:
- GND/- = Ground
- VCC/+ = Power (usually 5V, check your module!)
- S/Signal = Enable (HIGH = on, LOW = off)

Connections:
1. Laser GND → Breadboard - rail (GND)
2. Laser VCC → Breadboard + rail (5V)
3. Laser S → 330Ω resistor → Pi GPIO 23 (Pin 16)

Why the resistor? Current limiting. Protects both GPIO and laser input.

Test: Laser should be OFF (GPIO 23 defaults to LOW/input on boot).
If laser is ON at boot: Your module might be "active low" — we'll handle in software.
```

**Step 4: RGB LED Connection**

```
Why: Visual feedback for system state.

Common cathode RGB LED pinout (looking at flat side, pins down):
  ┌──────────────┐
  │              │
  │   ┌──────┐   │
  │   │ LED  │   │
  │   │      │   │
  │   └──────┘   │
  └──┬──┬──┬──┬──┘
     R  C  G  B
     │  │  │  │
    Red │ Grn Blue
    Anode │ Anode
          │
      Cathode (longest leg, to GND)

Connections:
1. LED Cathode (longest leg) → Breadboard - rail (GND)
2. LED Red anode → 330Ω resistor → Pi GPIO 24 (Pin 18)
3. LED Green anode → 330Ω resistor → Pi GPIO 25 (Pin 22)
4. LED Blue anode → 330Ω resistor → Pi GPIO 12 (Pin 32)

Why 330Ω? Limits current to safe levels. LED is bright enough, won't burn out.

Current calculation for each color (different LEDs have different voltage drops):
- Red:   (3.3V - 2.0V) / 330Ω = 3.9mA ✓
- Green: (3.3V - 2.2V) / 330Ω = 3.3mA ✓
- Blue:  (3.3V - 3.0V) / 330Ω = 0.9mA (dimmer, but visible)

Note: Blue will be noticeably dimmer than red/green because blue LEDs
need ~3V, leaving little headroom from 3.3V GPIO. This is normal.
If you want brighter blue, use 220Ω resistors for all colors instead.

Test: LED should be OFF at boot.
```

**Step 5: Button Connection**

```
Why: Physical arm/disarm control.

Tactile button has 4 pins in 2 connected pairs:
  ┌─────────┐
  │ ┌─────┐ │
  │ │     │ │
  │ └─────┘ │
  └─┬─────┬─┘
    1     2  ← These two connect when pressed
    │     │
  ┌─┴─────┴─┐
    3     4  ← These two connect when pressed

Pins 1&3 are always connected. Pins 2&4 are always connected.
Pressing button connects 1&3 to 2&4.

Connections:
1. Button Pin 1 → Pi GPIO 20 (Pin 38)
2. Button Pin 2 → Breadboard - rail (GND)

We use the INTERNAL pull-up resistor (no external 10kΩ needed):
- The Pi, ESP32-CAM, and XIAO all have built-in pull-up resistors
- Software enables it with one line of code
- This simplifies wiring — just button to GPIO and GND

How it works with internal pull-up enabled:
- Not pressed: GPIO 20 reads HIGH (3.3V through internal pull-up)
- Pressed: GPIO 20 reads LOW (connected to GND through button)

Test: Use multimeter continuity mode. Beeps when button pressed.
```

**Step 6: Camera Connection**

```
Why: This is how we see the hornets!

Pi Camera Module 3 uses a ribbon cable to the CSI port.

1. Power OFF the Pi (important!)
2. Locate CSI port (between HDMI ports)
3. Gently lift the black plastic clip on the CSI connector
4. Insert ribbon cable with blue side facing USB ports
5. Push clip back down to lock cable

⚠️ Ribbon cables are delicate. Don't bend sharply.

Test: Will verify with software after OS setup.
```

### 4.6 Pi 5 Verification Checklist

Before powering on, verify each connection:

| Check | Status |
|-------|--------|
| 5V rail has 5V from Pin 2 | ☐ |
| GND rail has GND from Pin 6 | ☐ |
| Servo brown to GND rail | ☐ |
| Servo red to 5V rail | ☐ |
| Servo orange to GPIO 18 | ☐ |
| Laser GND to GND rail | ☐ |
| Laser VCC to 5V rail | ☐ |
| Laser S through resistor to GPIO 23 | ☐ |
| LED cathode to GND rail | ☐ |
| LED R through resistor to GPIO 24 | ☐ |
| LED G through resistor to GPIO 25 | ☐ |
| LED B through resistor to GPIO 12 | ☐ |
| Button to GPIO 20 and GND | ☐ |
| Camera ribbon cable secure | ☐ |
| No loose wires or shorts | ☐ |

---

## 5. Hardware Path B: ESP32-CAM

### 5.1 Why ESP32-CAM for Production

**Advantages:**
- Incredibly cheap (~€8)
- Camera built-in (OV2640)
- WiFi built-in
- Low power (~0.5W)
- Small form factor

**Disadvantages:**
- No USB port — need FTDI adapter for programming
- Limited GPIO (many used by camera)
- Less powerful — need optimized detection code
- 4MB flash — limited storage for clips

### 5.2 ESP32-CAM Pinout

```
ESP32-CAM Board (AI-Thinker)
                    ┌─────────────────┐
                    │    ┌───────┐    │
                    │    │Camera │    │
                    │    │OV2640 │    │
                    │    └───────┘    │
                    │                 │
              5V ───┤●              ●├─── GND
             GND ───┤●              ●├─── GPIO 0 (Boot mode)
            IO12 ───┤●              ●├─── GPIO 16
            IO13 ───┤●  ┌───────┐  ●├─── GPIO 4 (Flash LED)
            IO15 ───┤●  │       │  ●├─── GPIO 2
            IO14 ───┤●  │ESP32  │  ●├─── GPIO 15
             IO2 ───┤●  │       │  ●├─── GPIO 13
             IO4 ───┤●  └───────┘  ●├─── GPIO 12
             GND ───┤●              ●├─── GPIO 14
             5V  ───┤●              ●├─── VCC (3.3V out)
                    │     ┌────┐    │
                    │     │Ant │    │
                    └─────┴────┴────┘
                           │
                           └── IPEX antenna connector
```

### 5.3 ESP32-CAM GPIO Availability

**Problem:** Most GPIOs are used by the camera.

| GPIO | Used By | Available? |
|------|---------|------------|
| 0 | Boot mode select | ⚠️ Must be HIGH during boot |
| 2 | Built-in LED + camera | ❌ No |
| 4 | Flash LED | ⚠️ Use carefully |
| 12 | Camera | ❌ No |
| 13 | Camera | ❌ No |
| 14 | Camera | ❌ No |
| 15 | Camera | ❌ No |
| 16 | PSRAM | ⚠️ Avoid if using PSRAM |
| 1 | TX (Serial) | ⚠️ Needed for debugging |
| 3 | RX (Serial) | ⚠️ Needed for debugging |

**Legend:**
- ❌ = Cannot use — will break camera functionality
- ⚠️ = Can use with caveats — read notes carefully

**What the caveats mean:**
- **GPIO 0**: Must be HIGH (not connected to GND) when board powers on, or it enters programming mode. You can use it AFTER boot.
- **GPIO 4**: Controls both the flash LED AND your laser. When you turn on the laser, the flash LED also lights up. This is fine for APIS — the flash LED just adds more light.
- **GPIO 16**: Used by PSRAM (extra memory). If you use it, you can't use high resolutions. APIS uses 640x480, so this is acceptable.
- **GPIO 1/3**: Serial TX/RX. You can repurpose them, but you lose USB serial debugging. Keep them for debugging during development.

**Available GPIOs for our use:**
- **GPIO 4** — We use this for laser (the flash LED turning on is acceptable side-effect)
- **GPIO 14** — We reclaim this for servo (firmware configures camera to not use it)
- **GPIO 13** — We use this for button

### 5.4 ESP32-CAM Pin Assignments

Given the constraints, we'll use:

| Function | GPIO | Notes |
|----------|------|-------|
| **Servo PWM** | GPIO 14 | Reclaimed from camera (reduces quality slightly) |
| **Laser Control** | GPIO 4 | Shared with flash LED |
| **Button** | GPIO 13 | |
| **Status LED** | (Use built-in) | GPIO 33 (red on-board) |

**Trade-off:** We sacrifice one camera data line (GPIO 14) to get a GPIO for the servo. This limits max resolution but is acceptable.

### 5.5 ESP32-CAM Wiring

```
                     ESP32-CAM          FTDI Adapter
                   ┌───────────┐       ┌───────────┐
                   │           │       │           │
              5V ──┤  ●     ●  ├───────┤ VCC (5V)  │
             GND ──┤  ●     ●  ├───────┤ GND       │
                   │           │       │           │
          GPIO 1 ──┤  ●     ●  ├───────┤ RX        │  ← TX crosses to RX!
          GPIO 3 ──┤  ●     ●  ├───────┤ TX        │  ← RX crosses to TX!
                   │           │       │           │
          GPIO 0 ──┤  ●        │       └───────────┘
                   │  │        │
                   │  └────────┼──► Connect to GND during upload
                   │           │
         GPIO 14 ──┤──────────►│──► Servo Signal (Orange)
                   │           │
          GPIO 4 ──┤──[330Ω]──►│──► Laser Signal
                   │           │
         GPIO 13 ──┤──────────►│──► Button
                   │           │
                   │           │
                   └───────────┘
```

**⚠️ CRITICAL: TX/RX Crossover**

Serial communication requires crossing TX and RX:
- ESP32-CAM **TX** (GPIO 1) connects to FTDI **RX**
- ESP32-CAM **RX** (GPIO 3) connects to FTDI **TX**

Why? The transmitter of one device must connect to the receiver of the other. This is the #1 beginner mistake — if upload fails, check this first!

**Power for Servo and Laser (ESP32-CAM Path)**

The ESP32-CAM cannot supply enough current for the servo. You need a separate power connection:

```
USB Power Supply (5V 2A)
         │
         ├──► ESP32-CAM 5V pin
         │
         ├──► Servo Red wire (V+)
         │
         └──► Laser VCC

All GND wires connect together (common ground)
```

**Option A: USB Breakout Board (Recommended for beginners)**
- Buy a "USB breakout board" (~€2)
- Solder or connect servo/laser power to the 5V and GND pads
- Connect ESP32-CAM to the same 5V and GND

**Option B: Cut and splice USB cable**
- Cut a spare USB cable
- Red wire = 5V, Black wire = GND
- Splice to power all devices

**Option C: Separate power supplies**
- One USB for ESP32-CAM
- One USB for servo/laser
- Connect GND wires together!

### 5.6 ESP32-CAM Programming Mode

**Critical:** ESP32-CAM has no USB. You need an FTDI adapter.

**To enter programming mode:**
1. Connect GPIO 0 to GND (use a jumper wire)
2. Power cycle the board (unplug and replug power)
3. Upload your code
4. Disconnect GPIO 0 from GND
5. Power cycle again to run normally

**Common problems:**
- "Failed to connect": GPIO 0 not grounded during boot
- "Wrong boot mode": GPIO 0 still grounded after upload
- "Brownout": Power supply too weak

---

## 6. Hardware Path C: Seeed XIAO ESP32S3

### 6.1 Why XIAO for Production

**Advantages:**
- USB-C built-in — easy programming!
- Better camera (OV2640 but dedicated connector)
- More available GPIOs
- Very small (21×17.5mm)
- 8MB flash + 8MB PSRAM

**Disadvantages:**
- Costs more than ESP32-CAM (~€15 vs €8)
- Newer, less community support

### 6.2 XIAO ESP32S3 Sense Pinout

```
XIAO ESP32S3 Sense (with camera expansion)

        USB-C Port
           ┌──┐
     ┌─────┴──┴─────┐
     │              │
 D0 ─┤●            ●├─ D10
 D1 ─┤●            ●├─ D9
 D2 ─┤●            ●├─ D8
 D3 ─┤●            ●├─ D7
 D4 ─┤●            ●├─ D6
 D5 ─┤●            ●├─ D5
     │              │
GND ─┤●            ●├─ 3V3
5V  ─┤●            ●├─ GND
     │  ┌────────┐ │
     │  │ Camera │ │
     │  │ Module │ │
     │  └────────┘ │
     └─────────────┘
```

### 6.3 XIAO Pin Assignments

| Function | Pin | GPIO | Notes |
|----------|-----|------|-------|
| **Servo PWM** | D0 | GPIO 1 | Hardware PWM |
| **Laser Control** | D1 | GPIO 2 | |
| **LED Red** | D2 | GPIO 3 | |
| **LED Green** | D3 | GPIO 4 | |
| **LED Blue** | D4 | GPIO 5 | |
| **Button** | D5 | GPIO 6 | Use internal pull-up |

### 6.4 XIAO Wiring

```
                     XIAO ESP32S3
                   ┌───────────────┐
                   │   USB-C       │
                   │   ┌───┐       │
                   │   └───┘       │
                   │               │
            D0 ────┤●─────────────►├── Servo Signal (Orange)
            D1 ────┤●──[330Ω]────►├── Laser Signal
            D2 ────┤●──[330Ω]────►├── LED Red
            D3 ────┤●──[330Ω]────►├── LED Green
            D4 ────┤●──[330Ω]────►├── LED Blue
            D5 ────┤●─────────────►├── Button
                   │               │
           GND ────┤●─────────────►├── Common ground
            5V ────┤●─────────────►├── Servo V+ (red)
                   │               │
                   └───────────────┘

Power: USB-C provides power to board.
       External 5V may be needed for servo if USB can't supply enough current.
```

---

## 7. Power System Design

### 7.1 Power Budget Calculation

**What draws power:**

| Component | Voltage | Current (typical) | Current (peak) |
|-----------|---------|-------------------|----------------|
| Raspberry Pi 5 | 5V | 600mA (idle) | 2500mA (load) |
| ESP32-CAM | 5V | 180mA | 310mA (WiFi TX) |
| XIAO ESP32S3 | 5V | 150mA | 280mA (WiFi TX) |
| Servo SG90 | 5V | 10mA (idle) | 500mA (moving) |
| Laser 5mW | 5V | 30mA | 40mA |
| RGB LED | 3.3V | 20mA | 60mA (all on) |

**Total for each path:**

| Path | Typical | Peak |
|------|---------|------|
| A (Pi 5) | 680mA | 3100mA |
| B (ESP32-CAM) | 240mA | 910mA |
| C (XIAO) | 210mA | 880mA |

### 7.2 Power Supply Selection

**Path A (Pi 5):** Use official Pi 5 power supply (5V 5A USB-C)
- Pi 5 is power hungry. Cheap adapters cause problems.
- Must be USB-C PD (Power Delivery) capable.

**Path B & C:** Any quality 5V 2A USB adapter works
- The ESP32 boards are efficient.
- Add 50% headroom: 1A needed → use 2A supply.

### 7.3 Power Distribution

**Single-point grounding:**
All GND wires should connect at one point to avoid ground loops.

```
Power Supply 5V ──┬── Microcontroller 5V
                  ├── Servo V+
                  └── Laser V+

Power Supply GND ──┬── Microcontroller GND ──┬── LED Cathode
                   │                         └── Button GND
                   ├── Servo GND
                   └── Laser GND
```

### 7.4 Power Problems and Solutions

| Symptom | Likely Cause | Solution |
|---------|--------------|----------|
| Board resets randomly | Insufficient current | Use higher amperage supply |
| Servo jitters at rest | Voltage drop under load | Add capacitor (1000µF) across servo power |
| WiFi disconnects | Brownout during TX | Separate power rail for WiFi heavy devices |
| Laser dim or flickering | Voltage drop | Check all connections, use thicker wires |

### 7.5 Adding a Capacitor (If Needed)

If your servo jitters, add a 1000µF electrolytic capacitor across the servo power:

```
Servo Power Wires:
     5V ──────┬──────── Servo Red
              │
          ┌───┴───┐
          │  ───  │ ← Capacitor (1000µF 16V or higher)
          │  ───  │
          └───┬───┘
              │    Negative stripe on capacitor
     GND ─────┴──────── Servo Brown
```

**⚠️ CRITICAL: Electrolytic Capacitor Polarity**

Electrolytic capacitors are POLARIZED — they have a positive and negative lead:
- **Negative (-)**: Marked with a stripe on the capacitor body. Connect to GND.
- **Positive (+)**: The other lead (usually longer on new capacitors). Connect to 5V.

**What happens if installed backwards?**
The capacitor can EXPLODE or catch fire. This is not a gentle failure — it can spray hot electrolyte. Always double-check polarity before powering on.

**How to identify polarity:**
1. Look for the stripe with minus signs (─) — this is NEGATIVE
2. Longer lead = positive (on new capacitors)
3. When in doubt, check with multimeter in capacitance mode

---

## 8. Servo System

### 8.1 How Servos Work

A servo is a motor that moves to a specific angle and holds position.

**Inside a servo:**
- DC motor
- Gearbox (increases torque)
- Potentiometer (senses current angle)
- Control circuit (compares desired vs actual angle)

**PWM Control:**
The control circuit expects a PWM signal every 20ms (50Hz):
- 1ms pulse = 0° (full left)
- 1.5ms pulse = 90° (center)
- 2ms pulse = 180° (full right)

```
PWM Signal:
    ┌──┐                    ┌──┐
    │  │                    │  │
────┘  └────────────────────┘  └────
    1ms         19ms
    │←──────── 20ms ─────────►│

    Position: 0° (full left)

    ┌─────┐                 ┌─────┐
    │     │                 │     │
────┘     └─────────────────┘     └─
    2ms        18ms

    Position: 180° (full right)
```

### 8.2 SG90 Servo Specifications

| Spec | Value | Notes |
|------|-------|-------|
| Operating voltage | 4.8V - 6V | 5V is perfect |
| Stall torque | 1.8 kg·cm @ 4.8V | Enough for lightweight laser |
| Operating speed | 0.1s / 60° @ 4.8V | Fast enough for tracking |
| Rotation range | 0° - 180° | Some servos are limited to 120° |
| Dead band | 10µs | Minimum signal change to cause movement |
| Pulse range | 500µs - 2400µs | Check your specific servo |

### 8.3 Servo Mounting

**The laser will be mounted on the servo horn (the white/black cross-shaped piece).**

Mounting considerations:
1. **Balance:** Laser should be centered over servo axis to reduce torque
2. **Secure attachment:** Use screws through servo horn holes
3. **Range of motion:** Ensure laser can sweep the detection zone
4. **Cable management:** Laser wires shouldn't tangle when servo moves

```
Front View:
                ┌──────────┐
                │  Laser   │
                │  Module  │
                └────┬─────┘
                     │
              ┌──────┴──────┐
              │  Servo Horn │
              └──────┬──────┘
                     │
              ┌──────┴──────┐
              │    Servo    │
              │   (SG90)    │
              └─────────────┘
```

### 8.4 Servo Calibration

**Every servo is slightly different.** Before final assembly, calibrate your specific servo.

**Step 1: Find the center position**
```python
# Python test for Pi
from gpiozero import Servo
servo = Servo(18)
servo.mid()  # Should be 90° / center
```
- Observe where the horn points
- If not centered, note the offset

**Step 2: Find the actual range**
```python
servo.min()  # Should be 0° / full left
# Note: some cheap servos can't reach full 0°

servo.max()  # Should be 180° / full right
# Note: some servos are limited to ~120° total travel
```

**Step 3: Test with pulse widths directly**
If your servo doesn't respond correctly to min/mid/max:
```python
from gpiozero import Servo
from gpiozero.pins.pigpio import PiGPIOFactory

# Use pigpio for more precise PWM
factory = PiGPIOFactory()
servo = Servo(18, min_pulse_width=0.5/1000, max_pulse_width=2.5/1000,
              pin_factory=factory)
```

Adjust `min_pulse_width` and `max_pulse_width` until the servo uses its full range.

**Common issues:**
- Servo buzzes/vibrates at endpoints: pulse width beyond servo's actual range
- Servo doesn't reach full rotation: pulse width range too narrow
- Servo moves opposite direction: swap min and max values

### 8.5 Pan-Only vs Pan-Tilt

**Our design: Pan only (horizontal movement)**

Why no tilt (vertical)?
- Simpler, cheaper, fewer failure points
- Hornets hover at consistent height
- Laser beam diverges — covers vertical range anyway
- Can angle entire unit for elevation adjustment

**If you later want tilt:**
- Add second servo perpendicular to first
- Mount pan servo on tilt servo
- Increases complexity, cost, and failure modes

---

## 9. Laser System

### 9.1 Laser Safety

**⚠️ CRITICAL SAFETY INFORMATION ⚠️**

We use a Class 3R laser (5mW, 650nm red).

**Class 3R means:**
- Can cause eye injury if beam enters eye directly
- Safe if viewed briefly (blink reflex protects)
- NOT safe for prolonged exposure
- NOT safe if focused with optics

**Safety rules:**
1. NEVER look directly into the beam
2. NEVER point at people or animals (except target hornets)
3. NEVER aim toward sky (aircraft hazard)
4. ALWAYS include software safety interlocks
5. Mount at downward angle (toward ground)
6. Add physical beam block for maintenance
7. Label device with laser warning
8. **Wear laser safety glasses during testing and assembly**

**⚠️ During Testing: Wear Eye Protection**

When testing the laser at close range on your workbench:
- Wear laser safety glasses rated for 650nm (red) wavelengths
- OD2+ (Optical Density 2 or higher) is sufficient for 5mW
- Cost: €10-20 for basic glasses
- Position laser to point at non-reflective surface (matte black cardboard)
- Never look at the dot from beam-level angle

**Software interlocks (built into firmware):**
- Laser ONLY activates when target detected
- Maximum ON time: 3 seconds continuous
- Cooldown period between activations
- Master enable from dashboard/button
- Failsafe: laser OFF if software crashes

**Hardware Failsafe Option (Recommended)**

For additional safety, wire the laser through a normally-open relay:

```
GPIO Pin ────► Relay Coil ────► GND
                   │
                   └── Relay contacts in series with laser power

When GPIO is LOW or microcontroller loses power:
  → Relay opens → Laser power cut → Laser OFF
```

This ensures the laser cannot stay on if the software crashes or power is lost. A small 5V relay module (~€2) provides this protection.

**Aircraft Safety**

Install the device so the laser CANNOT aim above horizontal:
- Mount at least 1.5m above ground
- Angle unit 10-15° downward
- Limit servo range in software to prevent upward sweep
- Consider physical servo stops as backup

A 5mW laser is visible to aircraft at long distances. Even brief illumination of an aircraft is a serious criminal offense in most countries.

### 9.2 Laser Module Selection

**KY-008 Module (recommended):**
- 5mW, 650nm (red), Class 3R
- 5V operation
- 3-pin: VCC, GND, Signal
- Signal: HIGH = ON, LOW = OFF
- Built-in current limiting resistor

**Alternatives:**
- Any 5mW 650nm module with signal pin
- Avoid: modules without current limiting (need external resistor)

### 9.3 Laser Wiring

```
Laser Module (KY-008):
     ┌─────────────────┐
     │     ┌─────┐     │
     │     │Lens │     │
     │     └─────┘     │
     └──┬────┬────┬────┘
        S    V    G
        │    │    │
        │    │    └── GND → Power supply GND
        │    └─────── VCC → Power supply 5V
        └──────────── S → [330Ω] → GPIO (control pin)

Why 330Ω resistor?
The signal pin controls a transistor. The resistor limits base current.
Some modules have this built-in. Extra resistor doesn't hurt.
```

### 9.4 Laser Aiming

**The laser must be aimed at the detection zone.**

Detection zone geometry:
- Camera field of view: ~60° horizontal
- Hornet hover zone: 0.5m - 1.5m from hive entrance
- Servo sweep: ~120° (more than camera FOV)

```
Top View:
                          Detection Zone
                    ╱                       ╲
                   ╱                         ╲
                  ╱                           ╲
                 ╱    Hornets hover here      ╲
                ╱                              ╲
     ┌─────────┼──────────────────────────────┼───┐
     │         │                              │   │
     │         │      ▲ Camera + Laser        │   │
     │         │      │                       │   │
     └─────────┴──────┴───────────────────────┴───┘
              Beehive entrance

Side View:
                              Laser/Camera unit
                                    │
     1.8m ─────────────────────────►┼◄─── Mounted on pole
                                    │
                             10° ───┤ Angled down
                                    │
            Detection zone          │
            ┌───────────────────────┤
            │  ╲                    │
            │   ╲                   │
            │    ╲                  │
     0.3m ──┼─────╲─────────────────┤
            └──────────────────────►
                    1.5m
```

---

## 10. Camera System

### 10.1 Camera Requirements

**Minimum specs for hornet detection:**
- Resolution: 640×480 (VGA) minimum, 1280×720 preferred
- Frame rate: 15 FPS minimum, 30 FPS preferred
- Field of view: 60°+ horizontal
- Focus: Fixed focus at 0.5-2m range
- Light sensitivity: Works in daylight (no night vision needed)

### 10.2 Path A: Pi Camera Module 3

**Specs:**
- 12MP sensor (but we'll use 720p or lower for speed)
- Autofocus (can be set to fixed)
- 66° horizontal FOV (standard), 102° (wide)
- Excellent OpenCV support

**Installation:**
1. Connect ribbon cable to CSI port (blue side toward USB)
2. Enable camera in `raspi-config`
3. Test with `libcamera-hello`

### 10.3 Path B: ESP32-CAM OV2640

**Specs:**
- 2MP sensor
- Fixed focus (preset at factory)
- 60° FOV typical
- Built into the board

**Limitations:**
- Lower quality than Pi camera
- Some units have focus issues
- JPEG compression artifacts

### 10.4 Path C: XIAO OV2640

**Specs:**
- Same OV2640 sensor as ESP32-CAM
- Dedicated connector (not integrated)
- Slightly easier to replace if faulty

### 10.5 Camera Positioning

**Mounting angle:**
- Point toward hive entrance
- Slight downward angle (10-15°)
- Detection zone should fill most of frame

**Distance from hive:**
- 1-2 meters typical
- Adjust based on field of view
- Hornets should appear as ~50+ pixel objects for reliable detection

---

## 11. Enclosure Design

### 11.1 Requirements

The enclosure must:
1. **Protect electronics** from weather (rain, direct sun)
2. **Allow camera view** through window or lens hole
3. **Allow servo movement** for laser aiming
4. **Dissipate heat** (ventilation)
5. **Mount securely** to pole or hive structure
6. **Allow access** for maintenance

### 11.2 Design Approach

**Two-part enclosure:**

1. **Main housing** — Contains microcontroller, camera
2. **Servo/laser turret** — External, weather-sealed movement

```
Side View:
         ┌──────────────────────────────────┐
         │         Main Housing             │
         │  ┌──────────┐                    │
         │  │ Camera   │◄── Window          │
         │  │ Lens     │                    │
         │  └──────────┘                    │
         │                                  │
         │  ┌──────────────────────────┐   │
         │  │   Microcontroller        │   │
         │  │   (Pi/ESP32)             │   │
         │  └──────────────────────────┘   │
         │                                  │
         │  ┌──────────────────────────┐   │
         │  │   Status LED │ Button    │◄── Panel
         │  └──────────────────────────┘   │
         │                                  │
         └────────────┬─────────────────────┘
                      │ Cable passthrough
         ┌────────────┴─────────────────────┐
         │       Servo/Laser Turret         │
         │  ┌────────────────────────┐      │
         │  │  Servo │ Laser Module  │      │
         │  └────────────────────────┘      │
         └──────────────────────────────────┘
```

### 11.3 Materials

**Recommended:**
- 3D printed PETG (weather resistant, easy to print)
- ABS (more weather resistant, harder to print)
- Off-the-shelf weatherproof box + modifications

**Avoid:**
- PLA (degrades in sunlight and heat)
- Cardboard or wood (not weatherproof)

### 11.4 3D Print Files

STL files will be provided in `hardware/enclosure/`:
- `main_housing.stl` — Main electronics enclosure
- `camera_window.stl` — Clear acrylic/polycarbonate window holder
- `servo_mount.stl` — Servo bracket
- `laser_holder.stl` — Laser module mount for servo horn
- `mounting_bracket.stl` — Pole/surface mounting

---

## 12. Assembly Guide

### 12.1 Before You Start

**Gather:**
- All components from BOM
- Soldering iron (for permanent connections) OR breadboard (for prototyping)
- Multimeter
- Wire strippers
- Small screwdrivers
- Heat shrink tubing or electrical tape
- Zip ties for cable management
- **Laser safety glasses** (OD2+ at 650nm)

**⚠️ ESD (Electrostatic Discharge) Protection — IMPORTANT**

The ESP32, XIAO, and camera modules are sensitive to static electricity. A static shock that you can't even feel (under 3000V) can permanently damage these chips.

**Minimum precautions:**
1. Before touching any board, touch a grounded metal object (computer case, water pipe, unpainted radiator)
2. Work on a non-carpeted surface
3. Avoid wearing wool or synthetic clothing
4. Handle boards by the edges, not the components
5. Don't work in very dry conditions (humidity < 40%)

**Better protection:**
- Use an anti-static wrist strap connected to ground (~€5)
- Work on an anti-static mat (~€15)
- Store components in their anti-static bags until ready to use

**If you don't have ESD protection:**
Touch something grounded every few minutes. It's not perfect, but much better than nothing.

**What to do if you smell burning or see smoke:**
1. IMMEDIATELY disconnect power (unplug USB)
2. Do NOT reconnect until you identify the problem
3. Check for: reversed polarity, short circuits (bare wires touching), wrong voltage
4. A burnt component may need replacement

**Workspace:**
- Well-lit area
- Anti-static mat (optional but recommended)
- Magnifying glass helpful for small components

### 12.2 Assembly Sequence

**Phase 1: Verify Components (30 min)**

1. ☐ Lay out all components
2. ☐ Verify each component powers on (plug in microcontroller, LED should blink)
3. ☐ Test servo with power only (should hold position)
4. ☐ Test laser briefly with power (SAFETY: aim at wall)
5. ☐ Test button continuity with multimeter

**Phase 2: Breadboard Prototype (2 hours)**

1. ☐ Connect power rails
2. ☐ Wire servo (GND, 5V, signal)
3. ☐ Wire laser (GND, 5V, signal through resistor)
4. ☐ Wire RGB LED (GND, 3 pins through resistors)
5. ☐ Wire button (GPIO, GND)
6. ☐ Connect camera
7. ☐ Power on and test basic code

**Phase 3: Enclosure Preparation (1 hour)**

1. ☐ Print or obtain enclosure parts
2. ☐ Drill holes for cables if needed
3. ☐ Mount servo in turret
4. ☐ Attach laser to servo horn
5. ☐ Fit camera in window

**Phase 4: Permanent Assembly (2 hours)**

1. ☐ Solder wires (or use permanent connectors)
2. ☐ Apply heat shrink to joints
3. ☐ Mount microcontroller in enclosure
4. ☐ Route cables neatly
5. ☐ Connect turret cables through passthrough
6. ☐ Close enclosure

**Phase 5: Installation (1 hour)**

1. ☐ Mount near hive (1-2m distance)
2. ☐ Aim camera at entrance
3. ☐ Verify laser sweep covers detection zone
4. ☐ Connect power
5. ☐ Run software tests
6. ☐ Celebrate! 🎉

### 12.3 Checkpoint Tests

After each phase, verify:

| Checkpoint | Test Method | Expected Result |
|------------|-------------|-----------------|
| Power | Measure voltage at rails | 5V ± 0.25V |
| Servo | Send test PWM | Smooth movement 0-180° |
| Laser | Toggle GPIO | Laser on/off cleanly |
| LED | Toggle each color | R, G, B individually |
| Button | Read GPIO | LOW when pressed, HIGH when released |
| Camera | Run test capture | Image saves correctly |
| WiFi | Connect to network | IP address assigned |
| Full system | Run detection test | Servo tracks movement, laser activates |

---

## 13. Testing & Validation

### 13.1 Component Tests

**Servo Test:**
```python
# Pi Python test
from gpiozero import Servo
from time import sleep

servo = Servo(18)
servo.min()    # Should move to 0°
sleep(1)
servo.mid()    # Should move to 90°
sleep(1)
servo.max()    # Should move to 180°
```

**Laser Test:**
```python
# ⚠️ AIM SAFELY BEFORE RUNNING
from gpiozero import LED
from time import sleep

laser = LED(23)
laser.on()     # Laser should turn on
sleep(1)
laser.off()    # Laser should turn off
```

**LED Test:**
```python
from gpiozero import RGBLED
from time import sleep

led = RGBLED(24, 25, 12)
led.red = 1    # Red only
sleep(1)
led.green = 1  # Red + Green = Yellow
sleep(1)
led.blue = 1   # All on = White
sleep(1)
led.off()
```

### 13.2 Integration Tests

**Detection Test:**
1. Run detection software
2. Wave hand in front of camera
3. Verify: motion detected, servo tracks, laser activates briefly

**Network Test:**
1. Confirm WiFi connection
2. Ping companion server
3. Trigger detection
4. Verify clip appears on dashboard

### 13.3 Field Test

**In actual deployment conditions:**
1. Mount device near hive
2. Arm system
3. Wait for hornet (or simulate with object)
4. Verify complete cycle: detect → track → deter → record → upload

---

## 14. Troubleshooting

### 14.1 Power Issues

| Symptom | Cause | Solution |
|---------|-------|----------|
| Nothing powers on | No power | Check power supply, USB cable |
| Board resets randomly | Brownout | Use higher capacity power supply |
| Servo twitches | Voltage drop | Add 1000µF capacitor across servo power |
| Laser dim | Insufficient current | Check wiring, use thicker wires |

### 14.2 Servo Issues

| Symptom | Cause | Solution |
|---------|-------|----------|
| No movement | Wrong pin | Verify GPIO number matches code |
| Jitters constantly | No PWM signal | Check PWM code running |
| Moves wrong direction | Wiring reversed | Check brown=GND, red=VCC, orange=signal |
| Limited range | Servo limits | Calibrate min/max pulse width in code |

### 14.3 Laser Issues

| Symptom | Cause | Solution |
|---------|-------|----------|
| Always on | Wrong polarity | Some modules are active-low. Invert in code. |
| Never on | Wrong pin | Verify GPIO matches code |
| Flickers | Loose connection | Check solder joints |
| Weak beam | Faulty module | Replace laser module |

### 14.4 Camera Issues

| Symptom | Cause | Solution |
|---------|-------|----------|
| No image | Not connected | Reseat ribbon cable (Pi) |
| Dark image | Lens cap | Remove protective sticker |
| Blurry | Wrong focus | Adjust focus ring (if available) |
| Low FPS | Resolution too high | Reduce resolution in code |

### 14.5 Network Issues

| Symptom | Cause | Solution |
|---------|-------|----------|
| No WiFi | Wrong credentials | Check SSID and password |
| Intermittent | Weak signal | Add external antenna, move closer |
| Can't reach server | Firewall | Check port 8080 open |

---

## 15. Glossary

| Term | Definition |
|------|------------|
| **GPIO** | General Purpose Input/Output. Programmable pins on microcontroller. |
| **PWM** | Pulse Width Modulation. Rapid on/off switching to simulate variable voltage. |
| **I2C** | Inter-Integrated Circuit. Two-wire communication protocol. |
| **SPI** | Serial Peripheral Interface. Four-wire communication protocol. |
| **Servo** | Motor that moves to a commanded angle and holds position. |
| **Brownout** | Voltage drop causing device reset. |
| **Pull-up resistor** | Resistor connecting pin to VCC. Default state = HIGH. |
| **Pull-down resistor** | Resistor connecting pin to GND. Default state = LOW. |
| **FTDI** | Company making USB-serial adapters. Generic term for such adapters. |
| **Class 3R laser** | Laser class. 1-5mW. Low risk but avoid direct eye exposure. |
| **OV2640** | Common 2MP camera sensor used in ESP32-CAM and XIAO. |
| **CSI** | Camera Serial Interface. Ribbon cable connection for Pi cameras. |
| **mDNS** | Multicast DNS. Allows finding devices by name (e.g., `apis.local`). |
| **Stall torque** | Maximum torque servo can exert before motor stalls. |
| **Dead band** | Minimum signal change needed to cause servo movement. |
| **Heat shrink** | Plastic tubing that shrinks when heated. Used to insulate connections. |
| **Dupont connectors** | Standard 2.54mm pitch connectors with pins/sockets. |
| **PETG** | Polyethylene Terephthalate Glycol. 3D printing filament, weather resistant. |
| **ABS** | Acrylonitrile Butadiene Styrene. Stronger but harder to print filament. |

---

## 16. Recommended Spare Parts

When building alone, having backups saves time and frustration. These components are cheap and commonly fail or get damaged:

| Component | Qty | Why |
|-----------|-----|-----|
| SG90 Servo | 2 | Cheap servos often arrive DOA or fail early |
| Laser module | 2 | Variable quality control |
| ESP32-CAM | 2 | ESD damage, defective units common |
| FTDI adapter | 1 | Easy to fry with wrong voltage |
| Dupont wires | 40+ | Break easily, lose some |
| Resistors (330Ω) | 10 | Lose them, wrong value mistakes |
| RGB LEDs | 3 | Burn out if wired wrong |
| Push buttons | 3 | Cheap, break easily |
| USB cables | 2 | Data vs charge-only confusion |

**Total extra cost: ~€15-20** — worth it to avoid waiting for replacement shipments.

---

## 17. Software Setup Reference

**This document covers HARDWARE ONLY.**

For software installation and configuration, see:
- `docs/software-setup.md` — OS installation, environment setup (created during implementation)
- `apis-edge/pi/README.md` — Pi-specific software setup
- `apis-edge/esp32/README.md` — ESP32 flashing instructions

**Before running hardware tests:**
1. Complete OS installation (Pi) or Arduino/PlatformIO setup (ESP32)
2. Install required libraries
3. Run basic "blink" test to verify board works
4. Then proceed to component tests in Section 13

---

## Document History

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-21 | 1.0 | Initial comprehensive hardware specification |
| 2026-01-21 | 1.1 | Added: TX/RX crossover warning, capacitor polarity, laser safety glasses, hardware failsafe, ESD protection, servo calibration, spare parts list, software reference |

---

**End of Hardware Specification**

*This document will guide your build from zero electronics experience to a working hornet deterrent system. Take your time, test at each checkpoint, and don't hesitate to revisit earlier sections if something isn't clear.*
