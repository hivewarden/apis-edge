# APIS Hardware Specification

**Version:** 1.4

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
16. [Recommended Spare Parts](#16-recommended-spare-parts)
17. [Software Setup Reference](#17-software-setup-reference)

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

   ├──────── 20ms ────────┤  (50Hz = 50 pulses per second)
```

**PWM Frequency:** Standard servos expect pulses at **50Hz** (one pulse every 20ms). The pulse width (1-2ms) determines position; the remaining time (~18-19ms) is "off" time.

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

**For APIS:** The arm/disarm button uses the MCU's built-in pull-up resistor (enabled in software) — no external resistor needed.

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

### 3.1 Bill of Materials

**Shared across ALL paths:**

| Component | Specification | Why This One | Approx. Cost | Example Part |
|-----------|---------------|--------------|--------------|--------------|
| **Pan Servo** | SG90 or MG90S | Small, cheap, sufficient torque for laser | €2-4 | Tower Pro SG90 |
| **Laser Module** | 5mW 650nm (red) Class 3R | Common consumer class; still hazardous — see §9.1 | €3-5 | KY-008 module |
| **Push Button** | Momentary, normally open | Arm/disarm control | €0.30 | 6mm tactile |
| **Wires** | Dupont jumper wires | Connections | €3 | 40-pin M-F, M-M |

**Alternative Shared Components:**

| Component | Alternatives | Notes |
|-----------|--------------|-------|
| **SG90 Servo** | MG90S (metal gears), FS90R (continuous rotation) | MG90S more durable; FS90R for pan-only tracking |
| **KY-008 Laser** | HW-493, generic 650nm module | Any 5mW red laser module works; avoid bare diodes |
| **Tactile Button** | 12mm button, panel-mount button | Larger buttons easier to press with gloves |
| **Dupont Wires** | Silicone wires, solid-core hookup wire | Silicone more flexible in cold; solid-core for breadboard |

**Path A & C only (external RGB LED):**

| Component | Specification | Why This One | Approx. Cost | Example Part |
|-----------|---------------|--------------|--------------|--------------|
| **Status LED** | 5mm RGB common cathode | Shows system state | €0.50 | Any RGB LED |
| **Resistors** | 330Ω × 3 (for LED) | Current limiting for each LED channel | €0.10 | 1/4W through-hole |

**Alternative LED Options:**

| Component | Alternative | Notes |
|-----------|-------------|-------|
| **5mm RGB LED** | NeoPixel (WS2812B) | Single wire, programmable colors, but needs library |
| **5mm RGB LED** | Common anode RGB | Requires inverted logic (HIGH = off) |
| **330Ω Resistors** | 220Ω (brighter), 470Ω (dimmer) | Adjust brightness vs current draw |

⚠️ **Path B (ESP32-CAM) uses the built-in red LED on GPIO 33** — do not purchase an external RGB LED unless you redesign GPIO usage. The ESP32-CAM has very limited available pins.

**Total shared components:** ~€12-20 (excluding power supply)

**Power Supply (per path):**

| Path | Requirement | Why | Approx. Cost |
|------|-------------|-----|--------------|
| **A (Pi 5)** | Official Pi 5 PSU (5V 5A USB-C PD) | Pi 5 is power hungry; cheap adapters cause brownouts | €12-15 |
| **B (ESP32-CAM)** | 5V 3A USB adapter | Servo stall + WiFi TX can exceed 1.6A; 2A is marginal | €5-10 |
| **C (XIAO)** | 5V 3A USB adapter | Same reason as Path B | €5-10 |

⚠️ **Do not use a generic 2A adapter for Path B/C.** While 2A may work during testing with servo idle, a stalled servo draws 1.2A alone — add WiFi transmission and you'll brownout.

### 3.2 Path A: Raspberry Pi 5 Specific

| Component | Specification | Part Number | Suppliers | Approx. Cost |
|-----------|---------------|-------------|-----------|--------------|
| **Raspberry Pi 5 4GB** | 4GB RAM recommended | SC1111 | [Pimoroni](https://shop.pimoroni.com/products/raspberry-pi-5?variant=42151829741651), [Amazon](https://www.amazon.com/dp/B0CPWH8FL9) | €60-70 |
| **Raspberry Pi 5 8GB** | 8GB for larger models | SC1112 | [Pimoroni](https://shop.pimoroni.com/products/raspberry-pi-5?variant=42151829774419), [Amazon](https://www.amazon.com/dp/B0CTQ3BQLS) | €80-90 |
| **Pi Camera Module 3** | 12MP, autofocus, IMX708 | SC0872 | [Pimoroni](https://shop.pimoroni.com/products/raspberry-pi-camera-module-3), [Adafruit](https://www.adafruit.com/product/5657) | €25-30 |
| **Pi Camera Module 3 NoIR** | 12MP, no IR filter (optional) | SC0873 | [Pimoroni](https://shop.pimoroni.com/products/raspberry-pi-camera-module-3-noir), [Adafruit](https://www.adafruit.com/product/5658) | €25-30 |
| **Pi 5 Camera Cable** | 22-pin to 15-pin FFC, 300mm | SC1085 | [Pimoroni](https://shop.pimoroni.com/products/camera-cable-for-raspberry-pi-5-300mm), [Adafruit](https://www.adafruit.com/product/5818) | €4-6 |
| **microSD Card 32GB** | Class 10 / A1 rated | — | [SanDisk Extreme](https://www.amazon.com/dp/B09X7BK27V), [Samsung EVO](https://www.amazon.com/dp/B09B1HMJ9Z) | €8-12 |
| **Active Cooler for Pi 5** | Official heatsink + fan | SC1148 | [Pimoroni](https://shop.pimoroni.com/products/active-cooler-for-raspberry-pi-5), [Adafruit](https://www.adafruit.com/product/5815) | €5-7 |

**Alternative Parts:**

| Component | Alternative | Notes |
|-----------|-------------|-------|
| **Pi Camera Module 3** | ArduCam 12MP IMX708 | Compatible, often in stock when official is sold out |
| **Pi Camera Module 3** | USB Webcam (Logitech C920) | Easier to source but uses USB bandwidth |
| **Pi 5 Camera Cable** | Generic FFC 22-15 pin | Check orientation; cheaper but may have fitment issues |
| **Active Cooler** | Pimoroni Heatsink Case | Passive cooling option if fan noise is a concern |
| **microSD Card** | Any Class 10/A1 brand | Avoid counterfeit no-name brands on Amazon |

**Path A total:** ~€115-155

### 3.3 Path B: ESP32-CAM Specific

| Component | Specification | Why This One | Approx. Cost |
|-----------|---------------|--------------|--------------|
| **ESP32-CAM** | AI-Thinker module | Camera built-in, cheap | €6-10 |
| **FTDI USB-Serial** | FT232RL or CP2102 | For programming (no USB on board) | €3-5 |
| **External antenna** | 2.4GHz with IPEX | Better WiFi range | €2 |

**⚠️ IMPORTANT: External Antenna Requires Hardware Modification**

The ESP32-CAM (AI-Thinker) uses the on-board PCB antenna by default. Simply screwing on an external antenna does **NOT** automatically switch to it — and may actually make WiFi **worse** due to impedance mismatch!

**To enable external antenna, you must move a tiny 0Ω resistor:**

```
ESP32-CAM Antenna Selection (look near IPEX connector):

Before (default - PCB antenna):
    ┌────────────────────────────────┐
    │                                │
    │   IPEX        0Ω Resistor      │
    │   ┌─┐            ┌─┐           │
    │   │ │            │█│────► PCB Antenna
    │   └─┘            └─┘           │
    │    │              │            │
    │    └──────────────┘            │
    │      (disconnected)            │
    └────────────────────────────────┘

After (external antenna):
    ┌────────────────────────────────┐
    │                                │
    │   IPEX        0Ω Resistor      │
    │   ┌─┐            ┌─┐           │
    │   │█│────────────│ │           │
    │   └─┘            └─┘           │
    │    │              │            │
    │    └──► External  └──► PCB Antenna
    │        Antenna       (disconnected)
    └────────────────────────────────┘
```

**How to move the resistor:**
1. You need a **soldering iron** with a fine tip and good lighting (magnifying glass helps)
2. The 0Ω resistor is a tiny SMD component — looks like a small black or grey rectangle
3. Heat one end, slide the resistor toward the IPEX pad
4. Re-solder to the IPEX antenna pad

**Alternative if you can't solder SMD:**
- Use the on-board PCB antenna (good for short range)
- For outdoor use, position the device for line-of-sight to your router
- Consider Path C (XIAO) which has better antenna design

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
| **LED Blue** | GPIO 12 | 32 | Use as simple on/off; for dimming use software PWM. |
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

⚠️ IMPORTANT: Check for SPLIT POWER RAILS on your breadboard!

Many breadboards have power rails that are SPLIT in the middle:

    Full-length rail (continuous):
    +━━━━━━━━━━━━━━━━━━━━━━━━━━━━━+

    Split rail (COMMON - watch out!):
    +━━━━━━━━━━━━━+    +━━━━━━━━━━━+
                 ↑    ↑
           Gap or break in the rail

If your breadboard has split rails:
- Power connected at one end does NOT reach the other end
- Components on the "unpowered" half won't work
- This looks like a dead component but it's just a wiring issue

How to check:
1. Use your multimeter in continuity mode
2. Touch probes to both ends of the power rail
3. If it beeps: rail is continuous
4. If no beep: rail is split — you need a jumper wire to bridge the gap

Steps:
1. Connect a jumper from Pi Pin 2 (5V) to your breadboard + rail
2. Connect a jumper from Pi Pin 6 (GND) to your breadboard - rail
3. If rails are split, add jumper wires to bridge the gap in both + and - rails

Verify: AFTER powering on the Pi, measure voltage between + and - rails.
        Should read ~5V. Check BOTH HALVES if your rails are split.
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

What could go wrong and how to fix it:
┌──────────────────────────────────────────────────────────────────────┐
│ Symptom                    │ Cause                │ Fix              │
├──────────────────────────────────────────────────────────────────────┤
│ Servo twitches randomly    │ Insufficient power   │ Use 5V 3A supply │
│                            │ Loose connection     │ Reseat wires     │
│ Servo doesn't move at all  │ Wrong GPIO pin       │ Verify GPIO 18   │
│                            │ Dead servo           │ Test with 5V/GND │
│ Servo moves but jerky      │ PWM frequency wrong  │ Check code (50Hz)│
│ Servo makes grinding noise │ Mechanical block     │ Don't force past │
│                            │                      │ 0-180° range     │
│ Servo gets very hot        │ Stalled motor        │ Power off, check │
│                            │                      │ obstruction      │
└──────────────────────────────────────────────────────────────────────┘
```

**Step 3: Laser Module Connection**

```
Why: Laser needs power and an on/off signal from GPIO.

⚠️ SAFETY: Never look into laser. Even 5mW can damage eyes.

Most laser modules (like KY-008) have 3 pins:
- GND/- = Ground
- VCC/+ = Power (usually 5V, check your module!)
- S/Signal = Enable (HIGH = on, LOW = off)

Connections:
1. Laser GND → Breadboard - rail (GND)
2. Laser VCC → Breadboard + rail (5V)
3. Laser S → Pi GPIO 23 (Pin 16) — direct connection is fine

Note: Unlike LEDs, laser modules have built-in current limiting.
The signal pin just enables/disables the internal driver.
A series resistor is optional (for GPIO protection if the module misbehaves).

Test: Laser should be OFF (GPIO 23 defaults to LOW/input on boot).
If laser is ON at boot: Your module might be "active low" — we'll handle in software.

What could go wrong:
- Laser always ON: Check if module is active-low (invert logic in software)
- No laser output: Verify VCC is 5V (some modules need exactly 5V)
- Dim laser: Check power supply current capacity
```

**Understanding Transistors and MOSFETs (Educational)**

```
Why are we NOT using a transistor or MOSFET for the laser?

The KY-008 laser module has a built-in driver circuit that handles all the
current. The signal pin draws almost no current (microamps) — it just tells
the internal driver to switch on/off. So direct GPIO connection is safe.

BUT, if you're using a "bare" laser diode without a driver module,
you MUST use a transistor or MOSFET. Here's why:

GPIO Current Limits:
- Pi 5 GPIO can source: ~16mA per pin, 50mA total for all pins
- ESP32 GPIO can source: ~12mA per pin
- Typical laser diode draws: 20-40mA (exceeds GPIO limits!)

Without external driver:
  GPIO ────► Laser ────► GND
                 ↑
         Drawing 30mA directly = GPIO pin damage!

With transistor/MOSFET driver:
  GPIO ────► Transistor Gate ────► Laser ────► GND
                    ↑                   ↑
            GPIO draws ~0.1mA    Power supply provides 30mA

How a MOSFET works (N-channel, logic-level):
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│           Drain (D) ← Power flows OUT to load               │
│               │                                             │
│           ┌───┴───┐                                         │
│   Gate ───┤ MOSFET ├── Think of it like a water valve       │
│   (G)     └───┬───┘    GPIO opens/closes the valve          │
│               │                                             │
│           Source (S) ← Connect to GND                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘

Circuit for bare laser diode (if you ever need it):

                    5V
                     │
                     ├─── Laser Diode (+)
                     │    (with current-limiting resistor)
                     │
         GPIO 23 ───[10kΩ]───┬───► MOSFET Gate
                             │
                             └───[10kΩ]───► GND (pull-down)
                                     │
                    Laser Diode (-) ─┤
                                     │
                    MOSFET Source ───┴───► GND

Recommended logic-level MOSFETs:
- IRLZ44N (55V, 47A — overkill but cheap and easy)
- IRLB8721 (30V, 62A — popular for LEDs)
- 2N7000 (60V, 200mA — for small loads only)

When to use MOSFET vs Transistor:
- MOSFET: Higher efficiency, no base current, better for PWM
- BJT Transistor (like 2N2222): Simpler, works for low-power loads
- For APIS laser: Neither needed — KY-008 has built-in driver

Summary: The KY-008 module simplifies everything. If you ever upgrade to a
more powerful laser (10mW+), you'll need a proper driver circuit like above.
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

What could go wrong and how to fix it:
┌──────────────────────────────────────────────────────────────────────┐
│ Symptom                    │ Cause                │ Fix              │
├──────────────────────────────────────────────────────────────────────┤
│ LED doesn't light at all   │ Cathode not grounded │ Check longest    │
│                            │                      │ leg → GND        │
│ Only some colors work      │ Wrong LED type       │ Verify common    │
│                            │ (common anode vs     │ cathode; if anode│
│                            │ common cathode)      │ invert wiring    │
│ LED is very dim            │ Resistor too high    │ Try 220Ω instead │
│                            │ or LED reversed      │ of 330Ω          │
│ Blue is much dimmer        │ Normal! Blue needs   │ Use 220Ω for all │
│ than red/green             │ ~3V, only 0.3V left  │ or accept it     │
│ LED burns out quickly      │ Missing resistor     │ ALWAYS use 330Ω+ │
│ Colors look wrong          │ Pins mixed up        │ Verify R/G/B to  │
│                            │                      │ correct GPIO     │
└──────────────────────────────────────────────────────────────────────┘
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

Note on button "bounce":
Mechanical buttons produce multiple rapid on/off transitions when pressed
(electrical contact bounces for 1-10ms). This is normal hardware behavior.
The software includes a debounce delay to treat these as a single press.
If you see double-triggering, the debounce delay may need adjustment in code.

What could go wrong and how to fix it:
┌──────────────────────────────────────────────────────────────────────┐
│ Symptom                    │ Cause                │ Fix              │
├──────────────────────────────────────────────────────────────────────┤
│ Button always reads LOW    │ Button stuck/shorted │ Check wiring,    │
│                            │ or wrong pins used   │ try diagonal pins│
│ Button always reads HIGH   │ Pull-up not enabled  │ Enable in code:  │
│                            │ in software          │ GPIO.PUD_UP      │
│ Button triggers twice      │ Bounce not debounced │ Increase delay   │
│ per press                  │ in software          │ to 50-100ms      │
│ Button triggers randomly   │ Floating pin (no     │ Enable internal  │
│ without pressing           │ pull-up/pull-down)   │ pull-up resistor │
│ Need to press very hard    │ Oxidized contacts    │ Press rapidly    │
│                            │ or loose breadboard  │ 10x or reseat    │
│ Continuity test fails      │ Wrong pair of pins   │ Use 1&3 or 2&4   │
│                            │ (diagonal not same)  │ pairs, not 1&2   │
└──────────────────────────────────────────────────────────────────────┘
```

**Step 6: Camera Connection**

```
Why: This is how we see the hornets!

⚠️ IMPORTANT: Pi 5 uses DIFFERENT camera connectors than Pi 4!

Pi 5 Camera Connection Details:
- Pi 5 has TWO small 22-pin camera/display connectors (labeled CAM0, CAM1)
- The Pi Camera Module 3 has a 15-pin connector
- You NEED a "Pi 5 camera cable" (22-pin to 15-pin adapter cable)
- Standard Pi 4 cables will NOT physically fit

Using the WRONG cable is the #1 beginner mistake with Pi 5 cameras.

Step-by-step:
1. Power OFF the Pi (unplug completely — important!)
2. Locate the camera port labeled "CAM0" or "CAM1" (either works)
   - These are the small FFC connectors, NOT the large ribbon connector
   - CAM0 is typically closer to the USB-C power port
3. The connector has a small plastic latch — gently pull it UP (not out)
4. Insert the 22-pin end of the cable with:
   - Metal contacts facing DOWN (toward the PCB)
   - Blue backing facing UP
5. While holding cable in place, push latch back DOWN to lock
6. Connect the 15-pin end to the camera module the same way

Verification before powering on:
- Cable clicks into both connectors (no loose wiggle)
- No bent pins visible
- Cable not twisted or kinked

⚠️ Ribbon cables are delicate. Don't bend sharply or crease.

Test: Will verify with software after OS setup.
```

### 4.6 Pi 5 Pre-Power Verification Checklist

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

### 4.7 Pi 5 Component Test Procedures

After assembly, test each component individually before running the full system.

**Prerequisites:**
- Raspberry Pi OS installed and booted
- SSH access or monitor/keyboard connected
- Python 3 with gpiozero installed: `sudo apt install python3-gpiozero`

**Test 1: Pi Power-On Test**

```bash
# Boot the Pi and verify it starts correctly
# Green LED = SD card activity (blinking is good)
# Red LED = Power (solid is good)

# Check temperature (should be <70°C with active cooler)
vcgencmd measure_temp
```

| Result | Meaning | Action |
|--------|---------|--------|
| temp=45.0'C | Normal | Continue |
| temp=70.0'C+ | Too hot | Check cooler is attached |
| No output | Pi not booting | Check SD card, power supply |

**Test 2: Servo Movement Test**

```python
# Save as servo_test.py and run with: python3 servo_test.py
from gpiozero import Servo
from time import sleep

servo = Servo(18)  # GPIO 18

print("Testing servo movement...")
print("Moving to center (0)")
servo.mid()
sleep(1)

print("Moving to minimum (-1)")
servo.min()
sleep(1)

print("Moving to maximum (1)")
servo.max()
sleep(1)

print("Back to center")
servo.mid()
sleep(1)

print("Servo test complete!")
```

| Result | Meaning | Action |
|--------|---------|--------|
| Servo moves smoothly | Pass | Continue |
| Servo doesn't move | Check wiring to GPIO 18 | Verify orange wire |
| Servo twitches | Insufficient power | Use 5V 3A supply |
| Servo moves but jerky | PWM timing issue | Check no other PWM in use |

**Test 3: Laser Activation Test**

```python
# Save as laser_test.py and run with: python3 laser_test.py
# ⚠️ SAFETY: Wear laser safety glasses and never look at beam!
from gpiozero import LED
from time import sleep

laser = LED(23)  # GPIO 23

print("⚠️ LASER TEST - Look away from laser!")
sleep(2)

print("Laser ON for 2 seconds...")
laser.on()
sleep(2)

print("Laser OFF")
laser.off()

print("Blinking test (5 times)...")
for i in range(5):
    laser.on()
    sleep(0.2)
    laser.off()
    sleep(0.2)

print("Laser test complete!")
```

| Result | Meaning | Action |
|--------|---------|--------|
| Laser lights up on command | Pass | Continue |
| Laser doesn't light | Check VCC (5V) and signal | Verify wiring |
| Laser always on | Module is active-low | Invert logic in code |
| Laser very dim | Insufficient power | Check 5V rail voltage |

**Test 4: RGB LED Color Test**

```python
# Save as led_test.py and run with: python3 led_test.py
from gpiozero import RGBLED
from time import sleep

led = RGBLED(red=24, green=25, blue=12)  # GPIO pins

print("Testing RGB LED...")

print("RED")
led.color = (1, 0, 0)
sleep(1)

print("GREEN")
led.color = (0, 1, 0)
sleep(1)

print("BLUE")
led.color = (0, 0, 1)
sleep(1)

print("WHITE (all on)")
led.color = (1, 1, 1)
sleep(1)

print("YELLOW (red + green)")
led.color = (1, 1, 0)
sleep(1)

print("OFF")
led.off()

print("LED test complete!")
```

| Result | Meaning | Action |
|--------|---------|--------|
| All colors work | Pass | Continue |
| One color missing | Check that color's GPIO | Verify resistor connection |
| Colors look wrong | Pins swapped | Rewire to correct GPIOs |
| Blue very dim | Normal (needs 3V) | Accept or use 220Ω |

**Test 5: Button Input Test**

```python
# Save as button_test.py and run with: python3 button_test.py
from gpiozero import Button
from time import sleep

button = Button(20, pull_up=True)  # GPIO 20 with internal pull-up

print("Button test - press the button within 10 seconds...")
print("Current state:", "PRESSED" if button.is_pressed else "NOT PRESSED")

timeout = 10
while timeout > 0:
    if button.is_pressed:
        print("✓ Button press detected!")
        break
    sleep(0.1)
    timeout -= 0.1
else:
    print("✗ No button press detected in 10 seconds")

print("Button test complete!")
```

| Result | Meaning | Action |
|--------|---------|--------|
| Press detected | Pass | Continue |
| Always shows PRESSED | Button shorted or wrong pins | Check wiring |
| Never detects press | Wrong GPIO or no pull-up | Verify GPIO 20, pull_up=True |

**Test 6: Camera Test**

```bash
# Test camera detection
libcamera-hello --list-cameras

# If camera detected, take a test photo
libcamera-still -o test.jpg

# View the photo (if GUI available)
# Or copy to another machine to verify
```

| Result | Meaning | Action |
|--------|---------|--------|
| Camera detected, photo saved | Pass | Continue |
| "No cameras available" | Cable not seated | Reseat ribbon cable |
| "Failed to start camera" | Wrong cable type | Use Pi 5 specific cable |
| Image is black | Lens cap on / no light | Remove cap, add light |

**Test 7: Full System Integration Test**

After all individual tests pass, run the full APIS software to verify everything works together:

```bash
# Start APIS edge software (from apis-edge directory)
./apis-edge --test-mode

# Test mode will:
# 1. Flash LED green 3 times (LED working)
# 2. Move servo left-center-right (servo working)
# 3. Flash laser 3 times (laser working)
# 4. Wait for button press (button working)
# 5. Capture and display camera feed (camera working)
# 6. Report all test results
```

| Component | Test Result | Notes |
|-----------|-------------|-------|
| LED | ☐ Pass / ☐ Fail | |
| Servo | ☐ Pass / ☐ Fail | |
| Laser | ☐ Pass / ☐ Fail | |
| Button | ☐ Pass / ☐ Fail | |
| Camera | ☐ Pass / ☐ Fail | |
| **Overall** | ☐ All Pass | Ready for deployment |

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

**Problem:** The ESP32-CAM (AI-Thinker) has very few available GPIOs because pins are shared between camera, SD card, flash, and boot strapping.

⚠️ **CRITICAL: Understand what each GPIO does before using it!**

| GPIO | Primary Function | Boot Behavior | Available for APIS? |
|------|------------------|---------------|---------------------|
| 0 | Camera XCLK (clock) + Boot mode | Must be HIGH at boot or enters flash mode | ❌ No — breaks camera |
| 1 | Serial TX | — | ⚠️ Only after debugging done |
| 2 | SD card (DATA0) + Boot strap | **Must be LOW at boot** or enters wrong mode | ❌ No — boot-critical pin |
| 3 | Serial RX | — | ⚠️ Only after debugging done |
| 4 | Flash LED | — | ✅ Yes — we use for laser |
| 12 | SD card (DATA2) + Boot voltage | **Must be LOW at boot** or sets wrong voltage | ⚠️ Dangerous — can prevent boot |
| 13 | SD card (DATA3) | — | ⚠️ Usable if no SD card |
| 14 | SD card (CLK) | — | ⚠️ Usable if no SD card |
| 15 | SD card (CMD) | Must be HIGH at boot for normal boot messages | ⚠️ Usable if no SD card |
| 16 | PSRAM (CS) | — | ❌ No — breaks PSRAM |
| 33 | On-board red LED | — | ✅ Yes — built-in status LED |

**Legend:**
- ❌ = Do not use — will break essential functionality
- ⚠️ = Can use with caveats — read warnings carefully
- ✅ = Safe to use

**Boot Strapping Pins Explained:**

The ESP32 reads certain GPIO states at power-on to decide how to boot:
- **GPIO 0**: LOW = enter flashing mode, HIGH = normal boot
- **GPIO 12**: Sets internal voltage regulator. If HIGH at boot, can cause crashes or brown-outs on some boards
- **GPIO 15**: Controls boot log output

**Why beginners brick ESP32-CAMs:**
If you connect a button or pull-up resistor to GPIO 12 and it's HIGH when power is applied, the ESP32 may not boot correctly. This looks like a dead board but it's actually a wiring problem.

**SD Card vs GPIO Trade-off:**

GPIO 12, 13, 14, 15 are the SD card interface (SDMMC). Since APIS streams clips via WiFi instead of storing on SD card, we can safely use GPIO 13 and GPIO 14 for other purposes — but NOT GPIO 12 (boot sensitive) or GPIO 15 (boot messages).

**Our safe GPIO choices for APIS:**
- **GPIO 4** — Laser control (flash LED also lights up — acceptable)
- **GPIO 13** — Button input (SD DATA3 — we're not using SD card)
- **GPIO 33** — Built-in red LED for status (internal, always safe)

### 5.4 ESP32-CAM Pin Assignments

Given the GPIO constraints, here's our pin plan:

| Function | GPIO | Notes |
|----------|------|-------|
| **Servo PWM** | GPIO 14 | SD card CLK pin — safe since we're not using SD card |
| **Laser Control** | GPIO 4 | Shared with flash LED (LED lights up = boot self-test) |
| **Button** | GPIO 13 | SD card DATA3 — safe since we're not using SD card |
| **Status LED** | GPIO 33 | Built-in red LED (no wiring needed) |

**⚠️ CRITICAL: Do NOT use GPIO 2 for anything!**
GPIO 2 is a boot-strapping pin that must be LOW at power-on. A servo or other device can pull it HIGH and prevent the ESP32 from booting. Many tutorials incorrectly suggest GPIO 2 is available — it is NOT safe on ESP32-CAM.

**Trade-off:** We're not using the SD card slot because:
1. APIS streams clips to the server via WiFi — no local storage needed
2. This frees GPIO 13 for the button and GPIO 14 for the servo
3. If you later want SD card storage, you must move servo/button to serial pins (GPIO 1/3) after debugging is complete

**Flash LED as Boot Self-Test:**
When the laser activates, the on-board flash LED (GPIO 4) also lights up. This is actually useful — at power-on, a brief flash confirms the system is alive. To prevent false detections from the bright LED:
- Cover the flash LED with opaque tape (electrical tape works well)
- Or desolder the LED if you're comfortable with SMD work
- The laser still works fine with LED disabled

### 5.5 ESP32-CAM Wiring

⚠️ **CRITICAL: FTDI Adapter Voltage Selection**

Many FTDI adapters have a voltage jumper or switch. **Check yours before connecting!**

| FTDI Setting | What It Does | Safe for ESP32-CAM? |
|--------------|--------------|---------------------|
| **3.3V** | Powers and signals at 3.3V | ✅ SAFE — use this |
| **5V** | Powers and signals at 5V | ⚠️ DANGEROUS for signals |

**What can go wrong:**
- ESP32 GPIO pins are **3.3V only**. They cannot tolerate 5V logic.
- If your FTDI sends 5V signals on TX, you will **permanently damage** the ESP32's RX pin.
- Some cheap FTDI clones output 5V on TX even when set to "3.3V mode."

**How to check:**
1. Set FTDI to 3.3V mode (jumper or switch)
2. With FTDI plugged into USB but NOT connected to ESP32:
   - Measure voltage between FTDI GND and FTDI TX pin
   - Should read 3.3V (acceptable: 3.0-3.6V)
   - If it reads ~5V, don't use that adapter without a level shifter

**Power from FTDI — COMMON MISTAKE:**

⚠️ **Most FTDI boards tie logic level to the VCC jumper!** Setting VCC to 5V usually means TX outputs 5V too, which will damage the ESP32.

**Recommended beginner setup (safest):**

Use **separate power** for the ESP32-CAM and connect **FTDI for signals only**:
- Power ESP32-CAM from external **5V 3A** USB supply (shared with servo/laser)
- FTDI provides **only GND, TX, RX, and GPIO0→GND jumper** (for flashing)
- **Leave FTDI VCC disconnected** — do not connect any wire to FTDI VCC

This approach avoids all voltage mixing problems and ensures reliable 5V power for the servo.

**Alternative (experienced users only):**
If your FTDI has truly independent logic/VCC settings AND you've measured TX=3.3V, you may power from FTDI at 3.3V during programming — but the servo won't work until you switch to external 5V.

```
                     ESP32-CAM          FTDI Adapter
                   ┌───────────┐       ┌───────────┐
                   │           │       │           │
              5V ──┤  ●        │       │ VCC       │  ← DO NOT CONNECT
             GND ──┤  ●     ●  ├───────┤ GND       │  ← Required
                   │           │       │           │
          GPIO 1 ──┤  ●     ●  ├───────┤ RX        │  ← TX→RX
          GPIO 3 ──┤  ●     ●  ├───────┤ TX        │  ← RX←TX
                   │           │       │           │
          GPIO 0 ──┤  ●        │       └───────────┘
                   │  │        │
                   │  └────────┼──► Connect to GND during upload ONLY
                   │           │
         GPIO 14 ──┤──────────►│──► Servo Signal (Orange)
                   │           │
          GPIO 4 ──┤──[330Ω]──►│──► Laser Signal
                   │           │
         GPIO 13 ──┤──────────►│──► Button (uses internal pull-up)
                   │           │
                   │           │
                   └───────────┘

Power (from external 5V 3A USB supply):
    5V  ──────────► ESP32-CAM 5V pin
    GND ──────────► ESP32-CAM GND (common with FTDI GND)
```

**⚠️ CRITICAL: TX/RX Crossover**

Serial communication requires crossing TX and RX:
- ESP32-CAM **TX** (GPIO 1) connects to FTDI **RX**
- ESP32-CAM **RX** (GPIO 3) connects to FTDI **TX**

Why? The transmitter of one device must connect to the receiver of the other. This is the #1 beginner mistake — if upload fails, check this first!

**Power for Servo and Laser (ESP32-CAM Path)**

The ESP32-CAM cannot supply enough current for the servo. You need a separate power connection:

```
USB Power Supply (5V 3A minimum)
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
- **CRITICAL: Connect GND wires together!**

**⚠️ Why Ground Must Be Connected (Common Beginner Mistake)**

Ground (GND) is the voltage reference point — like sea level for electricity. Without a shared ground:
- The ESP32 thinks "0V" is one level
- The servo thinks "0V" is a different level
- GPIO signals appear as random noise to the servo
- The servo ignores commands completely

**Correct procedure:**
1. **BEFORE powering anything:** Connect all GND wires together at one point
2. Then connect signal wires (servo orange to GPIO 14)
3. Then power on both supplies

**If you forget ground:**
- Servo won't respond to commands
- You might see random twitching
- In worst case, voltage difference between grounds can damage GPIO pins

**⚠️ Back-Feed Warning (Two 5V Supplies)**

If you have FTDI connected AND an external 5V supply:
- Disconnect FTDI VCC wire — use only GND/TX/RX/GPIO0
- Two 5V sources can "fight" each other
- Current can flow backwards through FTDI into your computer's USB port
- This can damage the USB port or FTDI adapter

### 5.6 ESP32-CAM Programming Mode

**Critical:** ESP32-CAM has no USB. You need an FTDI adapter.

**⚠️ Safety: Disconnect or cover laser during programming!**
GPIOs may glitch during boot/flash, briefly activating the laser. Either:
- Unplug the laser module
- Cover the laser lens with opaque tape
- Keep laser safety glasses on

**To enter programming mode:**
1. Disconnect laser (or cover it) and servo power
2. Connect GPIO 0 to GND (use a jumper wire)
3. Power cycle the board (unplug and replug power)
4. Upload your code
5. Disconnect GPIO 0 from GND
6. Reconnect laser/servo
7. Power cycle again to run normally

**Common problems:**
- "Failed to connect": GPIO 0 not grounded during boot
- "Wrong boot mode": GPIO 0 still grounded after upload
- "Brownout": Power supply too weak
- "No serial port": Using a charge-only USB cable (see §12.1.1)

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
 D5 ─┤●              │
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

| Component | Voltage | Current (typical) | Current (peak/stall) |
|-----------|---------|-------------------|----------------------|
| Raspberry Pi 5 | 5V | 600mA (idle) | 2500mA (load) |
| ESP32-CAM | 5V | 180mA | 310mA (WiFi TX) |
| XIAO ESP32S3 | 5V | 150mA | 280mA (WiFi TX) |
| Servo SG90 | 5V | 10mA (idle) | **1200mA (stall)** |
| Laser 5mW | 5V | 30mA | 40mA |
| RGB LED | 3.3V | ~4mA per channel* | 12mA (all on) |

*LED current note: With 330Ω resistors as specified in §4.5 Step 4, actual current is ~4mA per channel (calculated from voltage drop). The 20mA "max rated" figure often seen is the LED's absolute maximum — our design runs well under that for long life.

**⚠️ Servo Stall Current Warning:**
The 500mA figure often quoted is for *normal movement*. If the servo hits an obstacle or mechanical stop, it can draw **800-1200mA continuously** until it overheats. Size your power supply for stall current, not movement current.

**Total for each path (with servo stall):**

| Path | Typical | Peak (stall) |
|------|---------|--------------|
| A (Pi 5) | 680mA | 3800mA |
| B (ESP32-CAM) | 240mA | 1600mA |
| C (XIAO) | 210mA | 1580mA |

### 7.2 Power Supply Selection

**Path A (Pi 5):** Use official Pi 5 power supply (5V 5A USB-C)
- Pi 5 is power hungry. Cheap adapters cause problems.
- Must be USB-C PD (Power Delivery) capable.

**Path B & C:** Use 5V 3A USB adapter (or dedicated 5V BEC)
- A 2A adapter is marginal — stalled servo + WiFi TX can exceed 1.6A
- For reliability, use 3A supply or separate servo power (5V 2A BEC)
- Add a 1000µF capacitor near ESP32 when sharing supply with servo

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
1. **Stripe marking**: Look for the stripe with minus signs (─) on the body — this indicates the NEGATIVE lead
2. **Lead length**: Longer lead = positive (only reliable on NEW capacitors — trimmed leads don't count)
3. **Can marking**: Some capacitors show an arrow pointing to negative

**⚠️ Note:** A multimeter in capacitance mode does NOT tell you polarity — it only measures capacitance value. You must identify polarity from the markings on the capacitor body or check the datasheet.

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

**Horn Attachment Procedure (Do This Right!):**

The servo horn must be attached at the correct angle, or your "center" will be off:

1. **Power the servo** and command it to center position (90°) using test code
2. **While powered at center**, press the horn onto the splined shaft (don't screw yet)
3. **Rotate the horn** so it points straight forward (perpendicular to servo body)
4. **Insert the tiny screw** through the center hole into the shaft
5. **Don't overtighten** — these screws strip easily in plastic

⚠️ **Common mistake:** Attaching the horn while servo is unpowered. The servo shaft can be at any random angle. When you later command "center", the horn points the wrong way and your sweep range is asymmetric.

⚠️ **If you stripped the gears:** Forcing the horn onto the wrong position can strip the plastic gears inside. The servo will buzz but not move. Unfortunately, this means you need a new servo.

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
- Even brief exposure can cause damage — do NOT rely on blink reflex
- NOT safe for prolonged exposure
- NOT safe if focused with optics
- Specular reflections (mirrors, shiny metal, glass) are also hazardous

**⚠️ DO NOT assume "it's only 5mW, it's safe."** Treat any direct beam exposure as hazardous.

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

For additional safety, wire the laser through a relay MODULE (not a bare relay!).

**⚠️ WARNING: You cannot drive a bare relay coil with a GPIO pin!**
- A relay coil needs 50-150mA — GPIO pins provide only 10-20mA
- The inductive kickback from a coil can destroy GPIO pins
- You MUST use a relay MODULE (has driver transistor and flyback diode built-in)

**Relay Module Wiring (Correct):**
```
                    Relay Module (3-pin or 4-pin)
                   ┌─────────────────────────┐
    5V ────────────┤ VCC                     │
   GND ────────────┤ GND                     │
  GPIO ────────────┤ IN (Signal)             │
                   │                         │
                   │    ┌──────┐             │
                   │    │ Relay│──── COM ────┼──► Laser VCC
                   │    │      │──── NO  ────┼──► +5V Power
                   │    └──────┘             │
                   └─────────────────────────┘

How it works:
- GPIO HIGH → Relay energizes → NO (Normally Open) closes → Laser gets power
- GPIO LOW or MCU loses power → Relay de-energizes → Contact opens → Laser OFF
```

**Important notes:**
- Use a "5V relay module" (often blue PCB, ~€2)
- Most relay modules are "active LOW" — check yours!
- Active LOW: GPIO LOW = relay ON, GPIO HIGH = relay OFF (inverted)
- Active HIGH: GPIO HIGH = relay ON (matches our logic)

**What this failsafe does:**
- If software crashes: GPIO goes to default state (usually LOW) → laser OFF
- If microcontroller loses power: relay de-energizes → laser OFF
- If firmware hangs with GPIO stuck HIGH: laser STAYS ON (watchdog timer in firmware is the solution here)

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
        └──────────── S → GPIO (control pin)

Note on resistors:
- The 330Ω resistors listed in the BOM are for the RGB LED channels (current limiting)
- For KY-008 signal pin: a series resistor is OPTIONAL (for GPIO protection only)
- The laser diode current is controlled by the module's built-in driver — NOT by any resistor you add

⚠️ IMPORTANT: Only use laser modules with built-in drivers (like KY-008) that specify "5V operation with signal/enable input." NEVER use bare laser diodes — they require precise constant-current drivers and will be destroyed by direct 5V.
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
1. Connect ribbon cable to CSI port (metal contacts facing DOWN — see §4.5 Step 6 for details)
2. On modern Pi OS (Bookworm and later), camera is enabled by default — **no `raspi-config` step needed**
3. Test with `libcamera-hello`

**If `libcamera-hello` fails:**
- Command not found → Install with: `sudo apt install libcamera-apps`
- "No cameras available" → Re-seat ribbon cable; verify 22-to-15 pin cable (§4.5); confirm latch is closed
- Black image → Remove lens protective sticker if present

**Locking Focus for Fixed Distance (Important!):**

The Pi Camera Module 3 has autofocus (PDAF) that continuously hunts for focus. For hornet detection at a fixed 1-2m distance, this causes problems:
- Frame-to-frame focus changes confuse detection algorithm
- Blurry captures if AF locks on background
- Wasted processing time

**To set fixed focus:**

```bash
# Find the right focus value for your distance:
libcamera-hello -t 0 --lens-position 0    # Start at infinity
# Adjust --lens-position until image is sharp at your hive distance
# Typical value for 1.5m distance: --lens-position 1.8

# In Python code (picamera2):
from picamera2 import Picamera2
picam2 = Picamera2()
picam2.set_controls({"AfMode": 0, "LensPosition": 1.8})  # 0 = Manual mode
```

**Lens position reference:**
- 0.0 = Infinity focus
- 1.0 = ~1m distance
- 2.0 = ~0.5m distance
- Adjust based on your actual hive-to-camera distance

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

#### What a "Good" Camera View Looks Like

Your camera frame should capture the area where hornets hover before attacking:

```
Ideal camera frame composition:
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│    Sky / Background (minimal)                               │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│░░░░░░░░░░░░░░░ DETECTION ZONE (60-70% of frame) ░░░░░░░░░░░░│
│░░░░░░░░░░░░░░░ This is where hornets hover  ░░░░░░░░░░░░░░░░│
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│    ╔═══════════════════════════════════════════╗            │
│    ║           Hive entrance                   ║ ◄── Bottom │
│    ║           (landing board visible)         ║     1/4    │
│    ╚═══════════════════════════════════════════╝            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Good view checklist:**
- [ ] Hive entrance visible in bottom quarter of frame
- [ ] Hovering zone (30-60cm in front of entrance) fills middle of frame
- [ ] Frame not pointing at sky (wastes detection area)
- [ ] No obstructions (branches, other hives) blocking view
- [ ] Hornets at this distance appear as ~50+ pixels wide

**Bad views to avoid:**

```
Too far (hornet too small):        Too close (misses hover zone):
┌─────────────────────────┐        ┌─────────────────────────┐
│                         │        │  ╔═════════════════╗    │
│                         │        │  ║                 ║    │
│         · ◄── 10 pixels │        │  ║  Hive entrance  ║    │
│         (too small!)    │        │  ║  (only entrance ║    │
│  ╔══╗                   │        │  ║   visible)      ║    │
│  ║  ║ ◄── Tiny hive     │        │  ║                 ║    │
│  ╚══╝                   │        │  ╚═════════════════╝    │
└─────────────────────────┘        └─────────────────────────┘

Aimed at sky:                       Obstructed view:
┌─────────────────────────┐        ┌─────────────────────────┐
│  ☁️  ☁️     ☁️          │        │         ╱╲              │
│                         │        │        ╱  ╲ ◄── Branch  │
│         ☁️              │        │       ╱    ╲            │
│                         │        │  ╔════════════════╗     │
│                         │        │  ║                ║     │
│  ╔═════════════════╗    │        │  ║   Hive blocked ║     │
│  ║ Hive (too low)  ║    │        │  ╚════════════════╝     │
└─────────────────────────┘        └─────────────────────────┘
```

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

#### Understanding IP Ratings (Ingress Protection)

IP ratings tell you how well an enclosure protects against dust and water. The rating format is **IP[X][Y]** where:

- **First digit (X)** = Solid particle protection (0-6)
- **Second digit (Y)** = Liquid/water protection (0-9)

**Common ratings explained:**

| Rating | Dust Protection | Water Protection | Good for APIS? |
|--------|-----------------|------------------|----------------|
| IP54 | Dust-protected (some entry OK) | Splash-proof from any direction | Minimum acceptable |
| IP65 | Dust-tight (no entry) | Water jets from any direction | Recommended |
| IP66 | Dust-tight | Powerful water jets | Overkill but fine |
| IP67 | Dust-tight | Temporary immersion (1m, 30 min) | Unnecessary |
| IPX4 | Not rated for dust | Splash-proof | Only water rating given |

**What IPX4 means:** The "X" means dust protection wasn't tested. The "4" means protected against water splashes from any direction. Many cheap enclosures only list water rating.

**Recommended for beehive deployment:** Aim for **IP65** minimum. This ensures:
- Complete dust protection (important near hives with pollen, propolis debris)
- Protection against rain, even driven rain from storms
- Survives being sprayed with a hose if needed for cleaning

**How to evaluate enclosure ratings:**
1. Check the product listing for IP rating
2. If no rating listed, assume IP40 or less (indoor use only)
3. 3D printed enclosures without gaskets are typically IP40-IP54
4. Adding silicone gaskets to 3D prints can achieve IP65

**Where to verify ratings:**
- IEC 60529 is the international standard defining IP ratings
- Manufacturers should test and certify their ratings

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

#### Commercial Enclosure Options

If you don't have a 3D printer or prefer a ready-made solution:

**Junction Box Style (Recommended for beginners):**

| Product | Dimensions (LxWxH) | IP Rating | Approx. Price | Notes |
|---------|-------------------|-----------|---------------|-------|
| Gewiss GW44206 | 150x110x70mm | IP56 | €8-12 | Good for ESP32 + servo |
| Spelsberg TK PS | 180x130x77mm | IP65 | €12-18 | Larger, fits Pi + camera |
| Hammond 1554W | 160x160x90mm | IP66 | €15-25 | Polycarbonate, very robust |
| LeMotech ABS Box | 200x120x75mm | IP65 | €10-15 | Amazon/AliExpress, value option |

**Where to buy:**
- **Amazon:** Search "IP65 junction box" or "weatherproof electronics enclosure"
- **AliExpress:** Search "IP65 project box" (cheaper, 2-4 week shipping)
- **RS Components / Mouser / Digi-Key:** Professional enclosures, higher quality
- **Local electrical supply:** Industrial junction boxes work perfectly

**What to look for:**
1. **Dimensions:** At least 150x100x60mm internal for ESP32-CAM + servo
2. **IP rating:** IP65 or better (see Section 11.1 for rating explanation)
3. **Material:** ABS or polycarbonate (avoid cheap thin plastic)
4. **Mounting tabs:** Built-in flanges or ears for easy pole/wall mounting
5. **Pre-molded cable entry points:** Many boxes have knockouts for cable glands

**Modifications needed:**
1. **Camera window:** Cut or drill hole for camera lens, seal with acrylic/glass
2. **Cable gland holes:** Drill and install PG7/PG9 cable glands
3. **Servo mount:** Either external (recommended) or cut slot for servo horn

**DIY Alternative - Repurposed Containers:**

For the budget-conscious:
- Waterproof food containers (Lock & Lock style) - IP rating varies
- Outdoor light fixture housings - Often IP65+
- CCTV camera housings - Perfect size, already has window

### 11.4 3D Print Files

STL files will be provided in `hardware/enclosure/`:
- `main_housing.stl` — Main electronics enclosure
- `camera_window.stl` — Clear acrylic/polycarbonate window holder
- `servo_mount.stl` — Servo bracket
- `laser_holder.stl` — Laser module mount for servo horn
- `mounting_bracket.stl` — Pole/surface mounting

**Note:** STL files are under development. Check the `hardware/enclosure/` directory for current availability.

### 11.5 Cable Management for Outdoor Installation

Getting power and data cables to your outdoor APIS unit safely is critical. Poor cable management leads to water ingress, shorts, and fire hazards.

#### Weather-Resistant Cable Entry

**The problem:** Any hole in your enclosure is a potential water entry point. Even "waterproof" connectors can fail if not installed correctly.

**Cable Glands (Recommended)**

Cable glands (also called "cord grips" or "cable connectors") seal around cables entering an enclosure:

```
Cross-section of cable gland:
        ┌─────────────────┐
        │  Locknut (hex)  │ ◄── Tightens against enclosure wall
        ├─────────────────┤
        │  Rubber seal    │ ◄── Compresses around cable
╍╍╍╍╍╍╍╍│  ╭─────────╮    │╍╍╍╍╍ Cable
        │  │  Cable  │    │
        │  ╰─────────╯    │
        │  Body (threads) │ ◄── Screws into enclosure hole
        └─────────────────┘
```

**Recommended cable glands:**
- **PG7** (3-6.5mm cable) - For small sensor wires, ~€0.30 each
- **PG9** (4-8mm cable) - For USB cables, ~€0.40 each
- **PG11** (5-10mm cable) - For thicker power cables, ~€0.50 each

**Suppliers:**
- Amazon: Search "PG7 cable gland waterproof IP68" (packs of 20-50)
- AliExpress: "PG7 PG9 cable gland set" (much cheaper, longer shipping)
- Local electrical supply: "NPT cable connectors" (US) or "metric cable glands" (EU)

**Installation steps:**
1. Drill hole matching gland thread size (PG7 needs 12.5mm hole)
2. Thread cable through gland body BEFORE inserting into enclosure
3. Screw gland into enclosure hole, tighten locknut inside
4. Tighten compression nut until rubber seals around cable
5. Tug cable gently to verify it won't pull out

#### Strain Relief

**What is strain relief?** When a cable is pulled or tugged, the force should NOT transfer to the electrical connections inside. Strain relief anchors the cable's outer jacket so internal wires stay connected.

**Why it matters:** A cable that pulls out of its solder joint or connector creates an open circuit (device stops working) or worse, a short circuit (fire/damage).

**Methods:**
1. **Cable glands** provide strain relief automatically when tightened
2. **Cable ties** - Anchor cable to an internal mount point after it enters enclosure
3. **Hot glue** - Secure cable jacket to enclosure wall (last resort)

```
Good strain relief setup:
              Enclosure wall
                    │
     ╭──────────────┼──────────────╮
     │              │              │
─────┼──○──────────●│              │
     │  │          ││              │
     │  └── Cable  ││◄── Cable    │
     │      gland  ││    tie to   │
     │             ││    internal │
     │             ││    mount    │
     ╰─────────────┼┴─────────────╯
                   │
```

#### Cable Routing Best Practices

**Outside the enclosure:**

1. **Drip loops** - Route cables so water runs away from entry point:
   ```
   Bad:                  Good:
   ─────╮                      ╭─────
        │                      │
        ╰→ Entry point    ╭────╯
                          │
                          ╰→ Entry point
                          (water drips off loop)
   ```

2. **UV protection** - Use outdoor-rated (UV-resistant) cable or protect with:
   - Conduit (PVC or flexible metal)
   - UV-resistant cable wrap/sleeve
   - Route in shade where possible

3. **Rodent protection** - In rural areas, rodents chew cables. Use:
   - Metal conduit (not PVC alone)
   - Armored cable (steel jacket)
   - Rodent-resistant cable (exists but expensive)

4. **Burial** - If running cable underground:
   - Use direct-burial rated cable (marked "DB" or "direct burial")
   - Minimum 30cm depth (12 inches)
   - Use conduit for easier future replacement
   - Mark cable location

#### Bringing Power Outdoors Safely

**⚠️ ELECTRICAL SAFETY WARNING:** Outdoor electrical work requires following local codes. When in doubt, consult a licensed electrician. Mistakes can cause fire, shock, or death.

**GFCI/RCD Protection (REQUIRED)**

All outdoor outlets MUST be protected by:
- **USA/Canada:** GFCI (Ground Fault Circuit Interrupter)
- **Europe:** RCD (Residual Current Device), min 30mA
- **UK:** RCD in consumer unit OR RCD adapter

**What it does:** Detects when current leaks to ground (like through a wet connection or a person) and cuts power in milliseconds. This prevents electrocution.

**How to verify:**
1. Your outdoor outlet should have "Test" and "Reset" buttons
2. Press "Test" - outlet should cut power
3. Press "Reset" - power returns
4. Test monthly

**Power Options (in order of safety):**

| Option | Safety | Complexity | Cost |
|--------|--------|------------|------|
| Existing outdoor outlet | Best | None | Free |
| Weatherproof outlet box extension | Good | Medium | €20-50 |
| Long indoor extension (temporary) | Risky | Low | €15-30 |
| Solar + battery | Best | High | €100-200 |

**Weatherproof Outlet Boxes:**

If adding a new outdoor outlet or protecting an existing one:

- Use IP65 or better rated enclosure
- "In-use" covers allow outlet to stay covered while cable plugged in
- Examples:
  - US: TayMac MR420CG (in-use cover, 2-gang)
  - EU: Kopp Nautic weatherproof socket

**Cable from outlet to APIS:**

1. Use outdoor-rated extension cable (marked "W" or "Outdoor use")
2. Keep connections off the ground (water pooling)
3. All outdoor connections should be inside weatherproof junction boxes
4. Never use indoor power strips outdoors

**Low Voltage Alternative (Safer):**

Instead of running mains power (120V/230V) to your APIS unit:
1. Mount a weatherproof 5V/12V power supply indoors or in weatherproof box
2. Run low-voltage DC cable to APIS unit
3. Low voltage (under 50V DC) is much safer if cable gets damaged

Example setup:
```
Indoor/Covered area              Outdoor (APIS unit)
┌──────────────────┐            ┌──────────────────┐
│ Mains outlet     │            │ APIS enclosure   │
│      ↓           │  DC cable  │      ↓           │
│ 5V/3A PSU ───────┼────────────┼─── APIS unit     │
│ (in dry location)│            │                  │
└──────────────────┘            └──────────────────┘
```

#### Connector Recommendations

**For power connections:**
- **XT60** connectors (common in RC hobby) - Weatherproof when mated, easy to solder
- **Anderson Powerpole** - Professional, modular, available with weatherproof housings
- **Barrel jacks** (5.5x2.1mm) - Common but NOT weatherproof; cover with heat shrink

**For data/signal:**
- **M12 connectors** (industrial standard) - IP67, robust, but expensive
- **Waterproof USB** - Available from marine/outdoor suppliers
- **Avoid:** Standard USB, JST, Dupont connectors outdoors without weatherproofing

### 11.6 Sun and Shade Considerations

Outdoor electronics must handle both heat buildup from sun and potential camera glare issues.

#### Camera Glare from Direct Sunlight

**The problem:** If the sun shines directly into the camera lens:
- Image is washed out/overexposed
- Detection fails
- Lens/sensor can be damaged over time

**Solutions:**

1. **Position facing away from sun's path:**
   - Northern hemisphere: Face camera **north** (sun is always to the south)
   - Southern hemisphere: Face camera **south** (sun is always to the north)
   - This is often impossible if your hive entrance faces the "wrong" way

2. **Add a lens hood/visor:**
   ```
   Side view with lens hood:
   ┌──────────────────────┐
   │    Enclosure         │
   │  ┌─────┐             │
   │  │ Cam │━━━━╸        │ ◄── Hood blocks sun from above
   │  │ Lens│             │
   │  └─────┘             │
   └──────────────────────┘
   ```
   - 3D print or buy a small lens hood
   - Angle should block sun but not obstruct camera's view of detection zone
   - Matte black interior to prevent reflections

3. **Recessed camera mount:**
   - Mount camera 1-2cm inside enclosure window
   - Enclosure lip provides natural shade

#### Heat Management in Sunny Conditions

**The problem:** A sealed dark enclosure in direct sun can reach 60-80°C internally. Electronics typically max out at 50-70°C.

**Signs of heat problems:**
- Random reboots (thermal protection triggering)
- Camera image has artifacts/glitches
- Unit stops working midday but works morning/evening
- Shortened component lifespan

**Solutions:**

1. **Enclosure color:**
   - **White or light colors** reflect heat (can be 20°C cooler inside)
   - Black absorbs maximum heat - avoid if possible
   - If 3D printing: Use white or light gray filament

2. **Ventilation:**
   - Add shaded vents (louvered to keep rain out)
   - Position vents at bottom and top for convection flow
   - Cover vents with fine mesh to keep insects out
   ```
   Ventilation layout:
   ┌────────────────────┐
   │  ░░░░ Top vent ░░░ │ ◄── Hot air exits
   │                    │
   │    Electronics     │
   │                    │
   │  ░░ Bottom vent ░░ │ ◄── Cool air enters
   └────────────────────┘
   ```

3. **Shade mounting:**
   - Mount on north side of structures (northern hemisphere)
   - Under eaves or overhangs
   - Consider adding a shade roof over the unit

4. **Active cooling (last resort):**
   - Small 5V fan (40mm)
   - Only needed in very hot climates
   - Increases power consumption

### 11.7 Mounting Options

#### Pole Mount (Most Common)

Standard mounting on a pole near the hive:

```
        ┌─────────────────┐
        │  APIS Enclosure │
        │  ┌─────┐        │
        │  │ Cam │◄─────────── Points at hive entrance
        │  └─────┘        │
        └────────┬────────┘
                 │
        ┌────────┴────────┐
        │ Mounting bracket│ ◄── U-bolts or hose clamps
        └────────┬────────┘
                 │
                 │
         ╱       │       ╲
        ╱        │        ╲
       ╱         │         ╲  ◄── Pole in ground
      ╱──────────┴──────────╲
```

**Pole options:**
- Fence post (wooden, already have many in apiaries)
- Metal conduit (EMT, 3/4" or 1")
- PVC pipe (less durable in sun)
- Camera/antenna pole (with ground stake)

**Mounting hardware:**
- U-bolts with nuts (most secure)
- Stainless steel hose clamps (easier to adjust)
- Pole mounting brackets (from CCTV/antenna suppliers)

**Height:** Eye level or slightly below - you'll need to access it for maintenance.

#### Suspended/Hanging Mount

For roof or structure-mounted units where a pole isn't practical:

```
    Roof/Beam/Branch
    ════════════════════════
          │
          │ Mounting hook or
          │ carabiner
          │
    ┌─────┴─────────────────┐
    │                       │
    │   APIS Enclosure      │
    │   ┌─────┐             │
    │   │ Cam │◄───────────────── Points down at hive
    │   └─────┘             │
    └───────────────────────┘
```

**Suspension options:**

1. **Eye bolt + carabiner:**
   - Install eye bolt into enclosure top
   - Hang from roof beam with carabiner or S-hook
   - Allows easy removal for maintenance

2. **Straps/rope:**
   - Loop through enclosure mounting points
   - Tie to beam or branch
   - Use UV-resistant rope or straps

3. **Bracket attached to overhead structure:**
   - L-bracket screwed to roof/beam
   - Enclosure hangs from bracket

**Considerations for suspended mounting:**
- Enclosure must have mounting point on TOP
- Camera points downward instead of forward
- May need to adjust detection zone in software
- Ensure suspension can handle wind load
- Check swing doesn't affect laser aiming

**Recommended hardware:**
- M6 or M8 stainless steel eye bolt
- Stainless steel carabiner (rated for at least 5kg, actual load ~0.5kg)
- UV-resistant straps or paracord as backup

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

**USB Cable Verification (Important!):**

Many USB cables are "charge-only" — they have power wires but no data wires. With a charge-only cable:
- FTDI adapter won't be detected by your computer
- You'll see "no serial port found" errors
- Everything looks connected but nothing works

**How to identify data cables:**
- Data cables have 4 wires inside (red, black, green, white)
- Charge-only cables have only 2 wires (red, black)
- Quick test: Plug in a USB device (phone, keyboard). If your computer makes a sound or shows a notification, it's a data cable.

**Recommendation:** Find a known-good data cable and label it with tape so you don't grab the wrong one later.

**Wire Gauge Recommendations:**

| Connection | Current Draw | Recommended Wire |
|------------|--------------|------------------|
| 5V power rail | 1-3A | 20 AWG or thicker |
| Servo power | 500mA-1.2A | 22 AWG minimum |
| Signal wires | <20mA | 24-26 AWG is fine |
| Ground bus | Sum of all | Match power wire gauge |

Dupont jumper wires (typically 22-24 AWG) are fine for prototyping but marginal for permanent installation with servo. For production, use thicker wires for power connections.

### 12.2 Assembly Sequence

**Phase 1: Verify Components (30 min)**

1. ☐ Lay out all components
2. ☐ Verify each component powers on (plug in microcontroller, LED should blink)
3. ☐ Test servo with power AND a known-good PWM signal (see §13.1); without PWM, servo may be limp or jitter — this is normal
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
6. Done — take a break, you've earned it

### 12.3 Checkpoint Tests

After each phase, verify:

| Checkpoint | Test Method | Expected Result |
|------------|-------------|-----------------|
| Power | Measure voltage at rails | 5V ± 0.25V |
| Servo | Send test PWM | Smooth movement over calibrated safe range (§8.4) |
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

**Before troubleshooting:** Run component tests from Section 13 to isolate which subsystem has issues. This helps determine whether you have a hardware connection problem, a power issue, or a software configuration problem.

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
| Limited range | Servo limits | See Section 8.4 for calibration procedure. Adjust SERVO_MIN/MAX_PULSE in firmware config. |

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

### 14.6 Software-Related Symptoms

Sometimes hardware appears faulty but the problem is actually firmware configuration. These symptoms can be confusing because they look like hardware issues:

| Symptom | Likely Cause | How to Check |
|---------|--------------|--------------|
| Servo doesn't respond | Wrong GPIO pin in code | Compare firmware GPIO_SERVO constant with physical wiring |
| Laser always on/off | Inverted logic in code | Check if your laser module is active-high or active-low |
| Camera shows nothing | Wrong camera driver | For Pi: ensure `libcamera-apps` installed; for ESP32: check camera init code |
| Device resets when servo moves | GPIO conflict or boot pin issue | ESP32: Ensure servo not on GPIO2 (boot pin). See GPIO table in Section 5.2 |
| Nothing works after flash | Firmware didn't upload | Check serial output during boot for error messages |

**How to verify firmware is running:**
1. **Look for LED blink pattern** — Default firmware blinks LED on startup (see Section 13.1)
2. **Check serial output** — Connect FTDI adapter and monitor at 115200 baud
3. **Expected boot message:** `APIS Edge v1.0 starting...`

**Where to check GPIO pin assignments:**
- **Pi:** Look in `apis-edge/pi/config.h` for PIN_SERVO, PIN_LASER, etc.
- **ESP32:** Look in `apis-edge/esp32/config.h` for same constants
- **Verify** your physical wiring matches these numbers EXACTLY

**Common software mistakes:**
- GPIO numbers ≠ physical pin numbers (see pinout diagrams in Sections 4.5, 5.2, 6.2)
- Forgetting to set GPIO as OUTPUT before writing
- PWM frequency wrong for servo (should be 50Hz, not default)
- Camera resolution set too high for available memory

### 14.7 General Debugging Workflow

When you encounter a problem NOT listed in the tables above, follow this systematic approach:

**Step 1: Power Verification**
- [ ] Is the power LED on?
- [ ] Is the power supply rated for sufficient current? (See Section 3 for requirements)
- [ ] Try a different USB cable (some are charge-only, not data)
- [ ] Try a different USB port or power adapter

**Step 2: Isolate the Problem**
- [ ] Does the problem affect ONE component or EVERYTHING?
- [ ] Run individual component tests from Section 13
- [ ] If one component fails, focus troubleshooting there
- [ ] If everything fails, it's likely power or firmware

**Step 3: Check Physical Connections**
- [ ] Are all wires seated firmly in headers?
- [ ] Do Dupont connectors have good contact? (wiggle test)
- [ ] Are solder joints shiny and smooth (not cold or cracked)?
- [ ] Is the correct voltage reaching the component? (measure with multimeter)

**Step 4: Check Software Configuration**
- [ ] Is the correct firmware flashed?
- [ ] Do GPIO pin numbers in code match your wiring?
- [ ] Is WiFi SSID/password correct?
- [ ] Check serial output for error messages

**Step 5: Signal Tracing**
If a specific component doesn't respond:
1. Check power to the component (VCC and GND)
2. Check signal from microcontroller with multimeter or oscilloscope
3. For PWM signals: LED on signal line should dim (not full brightness)
4. For digital signals: should read 0V or 3.3V cleanly

**Step 6: When to Seek Help**
If you've verified all the above and the problem persists:
- Check the project GitHub Issues for similar problems
- Post a new issue with: symptoms, what you tried, serial output, photos of wiring
- Community Discord/forum (if available)

**Pro tip:** Take photos of your wiring BEFORE asking for help. 90% of issues are visible in a good photo.

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
| 2026-01-21 | 1.2 | **Critical fixes from GPT-5.2 review:** Pi 5 camera connector (22-pin FFC), ESP32-CAM GPIO table corrected (SD/boot pins not camera), relay MODULE diagram (not bare coil), removed dangerous "blink reflex" advice, FTDI 3.3V/5V voltage warning, capacitor polarity test correction, ESP32-CAM antenna 0Ω resistor mod, breadboard split rails warning, TOC updated |
| 2026-01-21 | 1.3 | **Dual audit fixes (Opus 4.5 + GPT-5.1):** GPIO 2→14 for ESP32-CAM servo (boot-critical fix), ground reference explanation, FTDI voltage guidance corrected (can't mix 5V power with 3.3V logic), servo stall current updated (500→1200mA), power supply upgraded to 3A, FTDI back-feed warning, Pi Camera autofocus lock procedure, flash LED disable as boot self-test, button debounce note, servo horn attachment procedure, USB data cable diagnostics, wire gauge table, pull-up resistor clarification, PWM frequency spec, version header added |
| 2026-01-22 | 1.4 | **Final GPT-5.2 review fixes:** FTDI diagram fixed (VCC removed, single clear recommendation), power supply BOM made path-specific (5A for Pi, 3A for ESP32/XIAO), Pi Camera install updated for modern Pi OS (no raspi-config needed), PWM channel note corrected (GPIO12 is PWM0), camera ribbon references unified to §4.5, servo test clarified (needs PWM signal), BOM split into shared vs path-specific (ESP32-CAM uses built-in LED), laser resistor guidance clarified (LED vs signal), LED power budget corrected to actual current with 330Ω, "safe-ish" language replaced with proper safety reference |

---

## 18. Shopping List: Lab + Outdoor Testing Kit

**Purpose:** Complete parts list for building 3 test units (1 lab breadboard setup + 2 outdoor deployment units) to cover 4 Dadant beehives.

**Last Updated:** 2026-01-25

### 18.1 Coverage Calculations for 4 Hives

**Dadant Hive Dimensions:**
- Single hive width: ~51 cm (Dadant-Blatt)
- 4 hives + 20cm spacing between: **2.5-3.0 meters** total width

**Can ONE device cover 4 hives?**

| Component | Spec Needed | Coverage at 2.5m | Verdict |
|-----------|-------------|------------------|---------|
| Stock camera (66° FOV) | 53° horizontal | ~2.5m | ⚠️ Tight margins |
| Wide-angle camera (100° FOV) | 80° horizontal | ~4.2m | ✓ Comfortable |
| Laser 30° fan | — | 1.3m line | ❌ Not enough |
| Laser 90° fan | — | 5.0m line | ✓ Good coverage |

**Conclusion:** One device CAN cover 4 hives with:
- 90° fan angle laser (not 30°)
- Wide-angle camera lens upgrade recommended

**Mounting Position:**
```
                   APIS Device (centered)
                        ▼
                       ╔═╗
                       ║█║  ← 1.5-2m height, angled 15-20° down
                       ╚═╝
                        │
                    2.5-3m distance
                        │
    ┌───┐    ┌───┐    ┌───┐    ┌───┐
    │ H1│    │ H2│    │ H3│    │ H4│
    └───┘    └───┘    └───┘    └───┘

    ◄──────── 2.5-3.0m total ────────►
```

### 18.2 Green Laser Selection (Updated from Red)

**Why green instead of red (as in original spec):**
- Asian hornets perceive green light (520-530nm) extremely well
- Hornet green photoreceptor peaks at ~528nm — almost exact match
- Hornets barely see red (650nm)
- Green is the correct choice for deterrence

**Line Pattern Rationale:**
- Line laser covers vertical axis automatically
- Only need horizontal (pan) servo movement
- Simplifies hardware to single-axis control

**Power Recommendation:**

| Power | Line Visibility in Sunlight | Hornet Perception | Recommendation |
|-------|----------------------------|-------------------|----------------|
| <5mW | Invisible | Weak | ❌ Too weak |
| 10mW | Invisible | Moderate | ⚠️ Marginal |
| 20mW | Invisible | Better | ⚠️ Borderline |
| **50mW** | Invisible to humans | Good | ✓ **Recommended** |
| 100mW+ | Faint | Excellent | Overkill, eye hazard |

**Key insight:** Line lasers are invisible to humans in direct sunlight regardless of power (beam spreads too thin). But hornets can perceive the light hitting them. 50mW compensates for the power spread across the line.

**Recommended Laser Specs:**
- Wavelength: 520nm (green)
- Pattern: LINE (not dot, not cross)
- Power: 50mW
- Fan angle: 90° (covers 5m line at 2.5m distance)
- Voltage: Accepts 5V DC (or comes with adapter)
- Focus: Adjustable preferred

### 18.3 Complete Shopping List

**For: 1 Lab Unit + 2 Outdoor Units (covers 4 hives)**

#### Microcontroller (XIAO ESP32S3 Sense)

| Item | Qty | Unit Price | Total | Notes |
|------|-----|------------|-------|-------|
| XIAO ESP32S3 Sense | 3 | ~€13 | ~€39 | From Seeed Studio German warehouse |
| Wide-angle OV2640 lens (100°+) | 3 | ~€5 | ~€15 | Optional but recommended for 4-hive coverage |

**Best source:** Seeed Studio DE warehouse (no customs, ~€13/unit)

#### Laser Modules

| Item | Qty | Unit Price | Total | Notes |
|------|-----|------------|-------|-------|
| Green line laser 520nm 50mW 90° | 3 | ~€16 | ~€48 | TYLASER or similar, with EU adapter |
| DC Jack Female 5.5mm to Terminal Block | 3 | ~€1 | ~€3 | Connect laser barrel jack without cutting |

**Laser selection criteria:**
- Must be 515-532nm (green)
- Must be LINE pattern
- 50mW power (minimum 30mW)
- 90° fan angle (minimum 60°)
- 5V operation or included power adapter

#### Servos

| Item | Qty | Unit Price | Total | Notes |
|------|-----|------------|-------|-------|
| SG90 Servo (plastic gears) | 1 | ~€3 | ~€3 | You have 2 already |

**You already have:** 2 servos (1× SG90 plastic, 1× MG90S metal) — sufficient for 3 units with 1 spare.

#### Power System (Battery-Powered)

| Item | Qty | Unit Price | Total | Notes |
|------|-----|------------|-------|-------|
| 4× AA Battery Holder with leads | 3 | ~€1 | ~€3 | 6V output |
| LM2596 Buck Converter (adjustable, screw terminals) | 3 | ~€3 | ~€9 | Steps 6V→5V, screw terminals = no soldering |
| AA Batteries | 24+ | ~€0.30 | ~€8 | Get 30 for spares |

**Why 4× AA + buck converter:**
- 4× AA = 6V (better servo performance than 3× AA = 4.5V)
- 6V is too high for XIAO/laser directly
- Buck converter steps down to clean 5V
- Screw terminal version = no soldering required

#### Switches & Buttons

| Item | Qty | Unit Price | Total | Notes |
|------|-----|------------|-------|-------|
| Toggle Switch with screw terminals (E-TEN1021) | 3 | ~€1.75 | ~€5.25 | Power on/off, no soldering |
| Tactile push buttons 6mm | 10 pack | ~€1 | ~€1 | User input / arm-disarm |

#### Connectors & Wiring

| Item | Qty | Unit Price | Total | Notes |
|------|-----|------------|-------|-------|
| Wago 3-way push connectors | 50 pack | ~€8 | ~€8 | Wire-to-wire connections, no soldering |
| Jumper wires M-F | — | — | — | You have these |
| Jumper wires M-M | — | — | — | You have these |

#### Enclosures (Outdoor Units Only)

| Item | Qty | Unit Price | Total | Notes |
|------|-----|------------|-------|-------|
| ABS Project Box ~100×60×25mm | 2 | ~€3 | ~€6 | For outdoor units |
| Zip ties | 1 pack | ~€2 | ~€2 | Mounting laser to servo |

#### Lab Equipment

| Item | Qty | Unit Price | Total | Notes |
|------|-----|------------|-------|-------|
| Breadboard | 1 | ~€3 | ~€3 | If you don't have one |
| Multimeter (ANENG AN8205C or similar) | 1 | ~€14 | ~€14 | Essential for setting buck converter |
| USB-C cable (data, not charge-only) | 1 | ~€3 | ~€3 | For programming XIAO |

#### Optional but Recommended

| Item | Qty | Unit Price | Total | Notes |
|------|-----|------------|-------|-------|
| Soldering iron kit | 1 | ~€20 | ~€20 | For permanent connections later |
| Lead solder 60/40 | 1 | ~€5 | ~€5 | Easier for beginners than lead-free |
| Spare XIAO ESP32S3 Sense | 1 | ~€13 | ~€13 | In case of ESD damage |
| Spare laser module | 1 | ~€16 | ~€16 | Variable quality control |

### 18.4 Shopping Summary

**Essential Items:**

| Category | Cost |
|----------|------|
| XIAO ESP32S3 Sense × 3 | €39 |
| Wide-angle lenses × 3 | €15 |
| Green line lasers × 3 | €48 |
| DC jack adapters × 3 | €3 |
| Servo × 1 (have 2 already) | €3 |
| Battery holders × 3 | €3 |
| Buck converters × 3 | €9 |
| AA Batteries (30) | €8 |
| Toggle switches × 3 | €5 |
| Push buttons (10 pack) | €1 |
| Wago connectors (50 pack) | €8 |
| Project boxes × 2 | €6 |
| Zip ties | €2 |
| Multimeter | €14 |
| USB-C cable | €3 |
| Breadboard | €3 |
| **TOTAL ESSENTIAL** | **~€170** |

**Optional (Recommended):**

| Category | Cost |
|----------|------|
| Soldering iron + solder | €25 |
| Spare XIAO | €13 |
| Spare laser | €16 |
| **TOTAL OPTIONAL** | **~€54** |

**Grand Total: ~€170 essential, ~€224 with spares**

### 18.5 Recommended Suppliers (EU)

| Component | Recommended Supplier | Notes |
|-----------|---------------------|-------|
| XIAO ESP32S3 Sense | Seeed Studio (DE warehouse) | No customs, official source |
| Lasers | AliExpress / Amazon.de | Search "520nm green line laser 50mW 90°" |
| Electronics (switches, Wago, etc.) | TinyTronics.nl | Fast shipping within EU |
| Multimeter | AliExpress / Amazon.de | ANENG brand good value |
| Project boxes | TinyTronics / Conrad | Local stock |

### 18.6 Assembly Notes

**Lab Setup (Breadboard):**
1. XIAO on breadboard
2. Servo connects via jumper wires
3. Laser connects via DC jack adapter + Wago
4. Power from USB-C (for programming) or batteries + buck converter
5. No enclosure needed — exposed for easy debugging

**Outdoor Setup (Enclosed):**
```
4× AA Battery Box
       │
       ▼
[Toggle Switch] ──► [Buck Converter 6V→5V] ──► [Wago 3-way]
                                                    │
                                    ┌───────────────┼───────────────┐
                                    ▼               ▼               ▼
                                  XIAO           Servo           Laser
                                    │                              ▲
                                    └──────── Signal wires ────────┘
```

**Wiring inside project box:**
1. Battery box outside (replaceable) → wires through hole
2. Toggle switch mounted on box lid
3. Buck converter inside, set to 5.0V with multimeter
4. XIAO mounted inside
5. Servo body inside, horn protrudes through slot
6. Laser mounted on servo horn with zip ties

---

## 19. Laser Safety Update (Green Line Laser)

**This section supplements §9 for the green line laser option.**

### 19.1 Green Laser Safety Classification

A 50mW green laser is **Class 3B** (higher than the 5mW Class 3R in original spec):

| Class | Power | Hazard Level | Our Laser |
|-------|-------|--------------|-----------|
| 3R | 1-5mW | Low risk, avoid direct eye | Original red spec |
| **3B** | 5-500mW | **Immediate eye hazard** | **Green 50mW** |
| 4 | >500mW | Burn hazard, fire risk | Not used |

**Class 3B means:**
- Direct beam causes **instant, permanent eye damage**
- Diffuse reflections (matte surfaces) are generally safe
- Specular reflections (mirrors, shiny metal, water) are hazardous
- Must NEVER point at people, animals (except target hornets), or aircraft

### 19.2 Required Safety Measures

1. **Laser safety glasses** — OD4+ at 520nm (green), ~€15-30
2. **Never operate at eye level** — mount high, angle downward
3. **Limit servo range in software** — prevent upward sweep
4. **Physical beam block** — cover lens during maintenance
5. **Warning labels** — "Class 3B Laser" on enclosure
6. **Software interlocks** — max 3 second burst, cooldown period

### 19.3 Why 50mW is Acceptable for This Application

- Laser points at hornets in flight, not at humans
- Mounted high (1.5-2m), angled down toward hive entrance
- Servo physically limited to ~120° horizontal sweep
- Detection zone is away from human activity areas
- Software limits activation to detected threats only

**Installation requirement:** Device must be positioned so the laser beam path is ALWAYS above head height or aimed at the ground. Never install where people could walk through the beam.

---

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-21 | 1.0 | Initial comprehensive hardware specification |
| 2026-01-21 | 1.1 | Added: TX/RX crossover warning, capacitor polarity, laser safety glasses, hardware failsafe, ESD protection, servo calibration, spare parts list, software reference |
| 2026-01-21 | 1.2 | **Critical fixes from GPT-5.2 review:** Pi 5 camera connector (22-pin FFC), ESP32-CAM GPIO table corrected (SD/boot pins not camera), relay MODULE diagram (not bare coil), removed dangerous "blink reflex" advice, FTDI 3.3V/5V voltage warning, capacitor polarity test correction, ESP32-CAM antenna 0Ω resistor mod, breadboard split rails warning, TOC updated |
| 2026-01-21 | 1.3 | **Dual audit fixes (Opus 4.5 + GPT-5.1):** GPIO 2→14 for ESP32-CAM servo (boot-critical fix), ground reference explanation, FTDI voltage guidance corrected (can't mix 5V power with 3.3V logic), servo stall current updated (500→1200mA), power supply upgraded to 3A, FTDI back-feed warning, Pi Camera autofocus lock procedure, flash LED disable as boot self-test, button debounce note, servo horn attachment procedure, USB data cable diagnostics, wire gauge table, pull-up resistor clarification, PWM frequency spec, version header added |
| 2026-01-22 | 1.4 | **Final GPT-5.2 review fixes:** FTDI diagram fixed (VCC removed, single clear recommendation), power supply BOM made path-specific (5A for Pi, 3A for ESP32/XIAO), Pi Camera install updated for modern Pi OS (no raspi-config needed), PWM channel note corrected (GPIO12 is PWM0), camera ribbon references unified to §4.5, servo test clarified (needs PWM signal), BOM split into shared vs path-specific (ESP32-CAM uses built-in LED), laser resistor guidance clarified (LED vs signal), LED power budget corrected to actual current with 330Ω, "safe-ish" language replaced with proper safety reference |
| 2026-01-25 | 1.5 | **Added:** §18 Complete shopping list for lab + outdoor testing (3 units, 4 hives), §19 Green line laser safety update, coverage calculations for Dadant hives, 4×AA + buck converter power system, Wago/screw terminal no-solder approach, EU supplier recommendations |

---

**End of Hardware Specification**

*This document will guide your build from zero electronics experience to a working hornet deterrent system. Take your time, test at each checkpoint, and don't hesitate to revisit earlier sections if something isn't clear.*
