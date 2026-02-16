# XIAO ESP32S3 Sense Assembly Manual

> **Skill Level:** Beginner-friendly
> **Time Required:** 1-2 hours
> **Cost:** ~€30-45 total

This guide walks you through assembling an APIS unit using the Seeed XIAO ESP32S3 Sense. The XIAO is the "balanced" production option - more capable than ESP32-CAM, easier to program, with better camera quality.

---

## Table of Contents

1. [Before You Start](#1-before-you-start)
2. [Parts List (BOM)](#2-parts-list-bom)
3. [Preparing Your Workspace](#3-preparing-your-workspace)
4. [Step-by-Step Assembly](#4-step-by-step-assembly)
5. [Camera Module Installation](#5-camera-module-installation)
6. [USB Flashing Guide](#6-usb-flashing-guide)
7. [Pre-Power Checklist](#7-pre-power-checklist)
8. [Testing Your Build](#8-testing-your-build)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Before You Start

### Why XIAO ESP32S3 Sense?

| Feature | XIAO | ESP32-CAM | Why It Matters |
|---------|------|-----------|----------------|
| **USB-C** | Built-in | Needs adapter | Just plug in and flash - no FTDI needed |
| **Camera** | Dedicated connector | Onboard | Better ribbon cable connection |
| **GPIOs** | 11 available | 4 available | More room for components |
| **Size** | 21 x 17.5mm | 27 x 40mm | Smaller enclosure possible |
| **Flash** | 8MB | 4MB | More storage for clips |
| **Cost** | ~€15 | ~€8 | Worth it for the convenience |

### What You'll Build

```
                    ┌─────────────────────────────────┐
                    │       APIS XIAO Unit            │
                    │                                 │
    Camera ─────────│ [OV2640]                        │
                    │     │                           │
                    │     ▼                           │
    USB-C Power ────│ [XIAO ESP32S3] ───► Servo ──► Laser
                    │     │                           │
                    │     ├──► Status LED             │
                    │     └──► Arm/Disarm Button      │
                    └─────────────────────────────────┘
```

### Required Skills

- Plugging wires into pins (no soldering for basic build)
- Using a computer to flash firmware
- Following step-by-step instructions

### Safety Reminders

1. **Never look directly at the laser** - even 5mW can damage your eyes
2. **Work on an anti-static surface** - ESP32 chips are ESD sensitive
3. **Double-check connections before powering on** - wrong connections can damage components

---

## 2. Parts List (BOM)

### XIAO-Specific Components

| Component | Specification | Qty | Est. Cost | Notes |
|-----------|---------------|-----|-----------|-------|
| **XIAO ESP32S3 Sense** | With camera module included | 1 | €13-18 | [Seeed Studio](https://www.seeedstudio.com/XIAO-ESP32S3-Sense-p-5639.html) |
| **Expansion Board** (optional) | Seeed XIAO expansion | 1 | €5 | Makes prototyping easier |

**XIAO subtotal:** €13-23

### Shared Components (all paths use these)

| Component | Specification | Qty | Est. Cost | Notes |
|-----------|---------------|-----|-----------|-------|
| **Pan Servo** | SG90 or MG90S | 1 | €2-4 | Tower Pro SG90 recommended |
| **Laser Module** | 5mW 650nm red (KY-008) | 1 | €3-5 | Class 3R laser |
| **Push Button** | 6mm tactile, momentary | 1 | €0.30 | Normally open |
| **RGB LED** | 5mm common cathode | 1 | €0.50 | For status display |
| **Resistors** | 330Ω (1/4W) | 4 | €0.20 | 3 for LED, 1 for laser |
| **Dupont Wires** | M-F jumper set | 1 | €3 | 10-20 wires needed |
| **Breadboard** (optional) | Half-size | 1 | €2 | For prototyping |

**Shared subtotal:** €11-15

### Power Supply

| Component | Specification | Qty | Est. Cost | Notes |
|-----------|---------------|-----|-----------|-------|
| **USB-C Cable** | Data-capable (not charge-only) | 1 | €3 | For power + programming |
| **5V 3A USB Adapter** | Good quality | 1 | €5-10 | Servo can draw 1.2A when stalled |

**Power subtotal:** €8-13

### Total Cost Summary

| Category | Cost Range |
|----------|------------|
| XIAO + camera | €13-18 |
| Shared components | €11-15 |
| Power supply | €8-13 |
| **Total** | **€32-46** |

> **Note:** The "~€22-25" figure sometimes quoted refers to XIAO + shared components only, without power supply. With a quality power supply included, expect €30-45.

---

## 3. Preparing Your Workspace

### What You Need

1. **Anti-static mat or surface** - A large plastic bag works in a pinch
2. **Good lighting** - You'll be working with small components
3. **Small screwdriver** (if using enclosure)
4. **Multimeter** (optional but helpful for debugging)
5. **Computer** with USB-C port or adapter

### Organize Your Parts

Lay out all components and verify you have everything before starting:

```
┌─────────────────────────────────────────────────────────┐
│                    YOUR WORKSPACE                        │
│                                                          │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐         │
│  │   XIAO     │  │   Servo    │  │   Laser    │         │
│  │  + Camera  │  │   SG90     │  │   Module   │         │
│  └────────────┘  └────────────┘  └────────────┘         │
│                                                          │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐         │
│  │  RGB LED   │  │  Button    │  │ Resistors  │         │
│  │            │  │            │  │  330Ω x4   │         │
│  └────────────┘  └────────────┘  └────────────┘         │
│                                                          │
│  ┌────────────────────────────────────────────┐         │
│  │            Dupont Wires                     │         │
│  └────────────────────────────────────────────┘         │
│                                                          │
│  ┌───────────────────┐  ┌───────────────────┐           │
│  │   USB-C Cable     │  │   Power Adapter   │           │
│  └───────────────────┘  └───────────────────┘           │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Step-by-Step Assembly

### Understanding the XIAO Pinout

```
XIAO ESP32S3 Sense (top view, USB-C facing up)

        ┌──── USB-C Port ────┐
        │   ┌──────────┐     │
        │   └──────────┘     │
        │                    │
   D0 ──┤●                  ●├── D10   (not used)
   D1 ──┤●                  ●├── D9    (not used)
   D2 ──┤●                  ●├── D8    (not used)
   D3 ──┤●                  ●├── D7    (not used)
   D4 ──┤●                  ●├── D6    (not used)
   D5 ──┤●                   │
        │                    │
  GND ──┤●                  ●├── 3V3   (3.3V output)
   5V ──┤●                  ●├── GND
        │   ┌────────────┐   │
        │   │   Camera   │   │
        │   │   Module   │   │
        │   └────────────┘   │
        └────────────────────┘
```

### Pin Assignments for APIS

| Function | XIAO Pin | GPIO | Why This Pin |
|----------|----------|------|--------------|
| **Servo PWM** | D0 | GPIO 1 | Hardware PWM support |
| **Laser Control** | D1 | GPIO 2 | Near servo for clean wiring |
| **LED Red** | D2 | GPIO 3 | Grouped LED pins |
| **LED Green** | D3 | GPIO 4 | Grouped LED pins |
| **LED Blue** | D4 | GPIO 5 | Grouped LED pins |
| **Button** | D5 | GPIO 6 | Has internal pull-up |

### Step 1: Power Distribution (XIAO OFF - Not Connected)

**What:** Set up the power rails on your breadboard.

**Why:** All components share power and ground. Setting this up first prevents mistakes.

```
Breadboard Layout:
         + Rail (5V) ═══════════════════════════════════
         - Rail (GND) ═══════════════════════════════════

    From XIAO:
    5V pin  ────────►  + Rail
    GND pin ────────►  - Rail
```

**Connections:**
1. Insert a wire from XIAO's **5V** pin to the breadboard **+** (positive) rail
2. Insert a wire from XIAO's **GND** pin to the breadboard **-** (negative) rail

**Verify before proceeding:**
- [ ] 5V connected to + rail
- [ ] GND connected to - rail
- [ ] No power applied yet (USB not connected)

### Step 2: Servo Connection

**What:** Connect the servo that will aim the laser.

**Why:** The servo needs 5V power and a control signal from the XIAO.

**Servo Wire Colors:**
- **Brown/Black** = GND (Ground, negative)
- **Red** = VCC (Power, positive, 5V)
- **Orange/Yellow** = Signal (PWM control)

```
Wiring:
    XIAO D0 ─────────────────────► Servo Orange (Signal)
    Breadboard + Rail (5V) ──────► Servo Red (VCC)
    Breadboard - Rail (GND) ─────► Servo Brown (GND)
```

**Connections:**
1. Servo **Orange** wire → XIAO pin **D0**
2. Servo **Red** wire → Breadboard **+** rail (5V)
3. Servo **Brown** wire → Breadboard **-** rail (GND)

**Verify:**
- [ ] Signal to D0 (not D1 or other pin)
- [ ] Red to + rail
- [ ] Brown to - rail

### Step 3: Laser Module Connection

**What:** Connect the laser deterrent module.

**Why:** The laser scares hornets away. It needs power and a control signal.

**Laser Module Pinout (KY-008):**
- **S** = Signal (control)
- **+** or VCC = Power (5V)
- **-** or GND = Ground

```
Wiring:
    XIAO D1 ──[330Ω]──────────────► Laser S (Signal)
    Breadboard + Rail (5V) ───────► Laser + (VCC)
    Breadboard - Rail (GND) ──────► Laser - (GND)
```

**Why the resistor?** The 330Ω resistor limits current to the laser control circuit, protecting both the XIAO and the laser module.

**Connections:**
1. XIAO pin **D1** → 330Ω resistor → Laser **S** pin
2. Laser **+** pin → Breadboard **+** rail (5V)
3. Laser **-** pin → Breadboard **-** rail (GND)

**Verify:**
- [ ] 330Ω resistor between D1 and laser signal
- [ ] VCC to + rail
- [ ] GND to - rail

### Step 4: RGB LED Connection

**What:** Connect the status LED that shows system state.

**Why:** Visual feedback - green = ready, red = detecting, blue = armed, etc.

**RGB LED (Common Cathode) Pinout:**

```
Looking at the LED (flat side or longest leg indicates cathode):

    LED Pins (from left to right, typical):
    ┌─────────────────┐
    │  R   K   G   B  │
    │  │   │   │   │  │
    └──┼───┼───┼───┼──┘
       │   │   │   │
       │   │   │   └── Blue anode
       │   │   └────── Green anode
       │   └────────── Common Cathode (longest leg) → GND
       └────────────── Red anode

    Note: Pin order varies by manufacturer. If colors are wrong,
    swap the R/G/B wires until correct.
```

```
Wiring:
    XIAO D2 ──[330Ω]──────────────► LED Red anode
    XIAO D3 ──[330Ω]──────────────► LED Green anode
    XIAO D4 ──[330Ω]──────────────► LED Blue anode
    Breadboard - Rail (GND) ──────► LED Cathode (longest leg)
```

**Connections:**
1. XIAO **D2** → 330Ω resistor → LED **Red** anode
2. XIAO **D3** → 330Ω resistor → LED **Green** anode
3. XIAO **D4** → 330Ω resistor → LED **Blue** anode
4. LED **Cathode** (longest leg) → Breadboard **-** rail (GND)

**Why the resistors?** Each LED channel needs current limiting to prevent burnout. 330Ω gives ~4mA per channel - bright enough to see, safe for long-term operation.

**Verify:**
- [ ] Three 330Ω resistors (one per color)
- [ ] Cathode (longest leg) to GND
- [ ] D2→Red, D3→Green, D4→Blue (can swap later if needed)

### Step 5: Button Connection

**What:** Connect the arm/disarm button.

**Why:** Safety feature - system only actively deters when armed by button press.

```
Wiring:
    XIAO D5 ──────────────────────► Button Pin 1
    Breadboard - Rail (GND) ──────► Button Pin 2
```

**How it works:** When the button is pressed, it connects D5 to GND. The XIAO's internal pull-up resistor keeps D5 HIGH when not pressed.

**Connections:**
1. XIAO **D5** → One leg of the button
2. Other leg of button → Breadboard **-** rail (GND)

**Verify:**
- [ ] Only two wires to button
- [ ] No external resistor needed (XIAO has internal pull-up)

### Complete Wiring Diagram

```
                        XIAO ESP32S3 Sense
                      ┌────────────────────┐
                      │   [USB-C Port]     │
                      │                    │
            ┌─────────┤ D0            D10  ├─────────┐
            │         │                    │         │
            │    ┌────┤ D1             D9  ├         │
            │    │    │                    │         │
            │    │ ┌──┤ D2             D8  ├         │
            │    │ │  │                    │         │
            │    │ │ ─┤ D3             D7  ├         │
            │    │ │ ││                    │         │
            │    │ │ │┤ D4             D6  ├         │
            │    │ │ ││                    │         │
            │    │ │ │└┤ D5               │         │
            │    │ │ │ │                   │         │
            │    │ │ │ │  ┌───────────┐    │         │
    ┌───────┼────┼─┼─┼─┼──┤ GND   3V3 ├────┼─────────┘
    │       │    │ │ │ │  │           │    │
    │   ┌───┼────┼─┼─┼─┼──┤ 5V    GND ├────┼───┐
    │   │   │    │ │ │ │  └───────────┘    │   │
    │   │   │    │ │ │ │                   │   │
    │   │   │    │ │ │ │    [Camera]       │   │
    │   │   │    │ │ │ │                   │   │
    │   │   │    │ │ │ │                   │   │
    ▼   ▼   ▼    ▼ ▼ ▼ ▼                   │   │
   GND  5V  │    │ │ │ │                   │   │
   ─────────┴────┼─┼─┼─┼───────────────────┴───┴─
       (- Rail)  │ │ │ │  (+ Rail not shown)
                 │ │ │ │
    ┌────────────┘ │ │ │
    │ [330Ω]       │ │ └──── [Button]
    │    │         │ │           │
    ▼    ▼         │ │           ▼
 Laser  Laser      │ │         GND (- Rail)
 Signal VCC→5V     │ │
       GND→-Rail   │ │
                   │ │
    ┌──────────────┘ └───┐
    │ [330Ω] [330Ω] [330Ω]
    │    │      │      │
    ▼    ▼      ▼      ▼
   LED  LED    LED    LED
   Red  Green  Blue  Cathode→GND

    SERVO:
    ┌─────────┐
    │  SG90   │
    │ Signal ─┼──────► D0
    │   VCC ──┼──────► + Rail (5V)
    │   GND ──┼──────► - Rail (GND)
    └─────────┘
```

---

## 5. Camera Module Installation

The XIAO ESP32S3 Sense comes with an OV2640 camera module. Here's how to connect it properly.

### Understanding the Ribbon Cable

The camera connects via a **FPC (Flexible Printed Circuit)** ribbon cable. This is the thin, flat cable attached to the camera module.

```
Camera Module (top view):
    ┌─────────────────────┐
    │    ┌───────────┐    │
    │    │   Lens    │    │ ← Focus adjustable
    │    │   (O)     │    │
    │    └───────────┘    │
    │                     │
    │   ┌─────────────┐   │
    │   │ Image       │   │
    │   │ Sensor      │   │
    │   └─────────────┘   │
    │                     │
    └──────────┬──────────┘
               │
    ┌──────────┴──────────┐
    │   Ribbon Cable      │ ← Contacts on one side only
    │   ═══════════════   │
    └─────────────────────┘
```

### Ribbon Cable Orientation

**CRITICAL: Getting the orientation wrong will result in no camera image!**

The ribbon cable has **contacts on one side only** (the side with visible metal traces). This side must face the correct direction.

```
Correct Orientation:

                    XIAO Board
                  ┌────────────┐
                  │  [USB-C]   │
                  │            │
                  │   Camera   │
                  │  Connector │
                  │   ┌────┐   │
                  │   │    │   │ ← Flip-up latch (pull gently toward you)
    Contacts ─────│───│████│   │
    face DOWN     │   └────┘   │
                  │            │
                  └────────────┘

Side View:
    ┌─────┐ ← Ribbon cable
    │█████│ ← Contacts facing DOWN (toward board)
    └─────┘
       │
    ┌──┴──┐ ← Connector with latch
    │     │
    └─────┘
```

### Step-by-Step Camera Installation

1. **Locate the camera connector** on the XIAO board (bottom side, opposite USB-C port)

2. **Open the connector latch:**
   - Gently pull the black/brown flip-latch toward you
   - It should flip up about 90 degrees
   - Do NOT pull hard or it will break

3. **Identify ribbon cable orientation:**
   - Look at the ribbon cable - one side has visible metal contacts (shiny)
   - The OTHER side is plain (matte/plastic)

4. **Insert the ribbon cable:**
   - Slide the cable into the connector with **contacts facing DOWN** (toward the board)
   - Insert until the cable is fully seated (about 3-4mm depth)

5. **Close the connector latch:**
   - Gently push the latch back down
   - It should click into place
   - The cable should be held firmly - gentle tug should NOT pull it out

6. **Verify the connection:**
   - Cable is fully inserted
   - Latch is closed
   - No visible contacts showing outside the connector

### Focus Adjustment

The OV2640 camera has an **adjustable focus lens**. The lens can be rotated to change focus distance.

```
Lens Adjustment:
    ┌─────────────────┐
    │   ┌───────────┐ │
    │   │   Lens    │ │
    │   │   ┌───┐   │ │ ← Rotate lens clockwise or counter-clockwise
    │   │   │(O)│   │ │    to adjust focus
    │   │   └───┘   │ │
    │   └───────────┘ │
    └─────────────────┘

Rotation Direction:
    ↺ Counter-clockwise = Focus CLOSER (near objects sharp)
    ↻ Clockwise = Focus FARTHER (distant objects sharp)
```

**For APIS (hornet detection):**
- Hornets hover 1-3 meters from the hive entrance
- Set focus for approximately 1.5-2 meters distance
- Fine-tune after first test by viewing live camera feed

**How to adjust:**
1. Power on the XIAO and start camera preview (see Testing section)
2. Point camera at an object ~2 meters away
3. Gently rotate the lens until the image is sharp
4. The lens is threaded - it will feel slightly "gritty" as you turn

### Camera Verification

After installation, verify the camera works:

```bash
# Quick test: After flashing APIS firmware
# The camera test mode will show if camera is detected

# Or use Arduino IDE Serial Monitor to see:
# "Camera initialized: OV2640" = Success
# "Camera init failed" = Check ribbon cable
```

**If camera doesn't work:**

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| "Camera not found" | Ribbon cable not seated | Re-seat cable, ensure contacts face down |
| Black image | Ribbon cable backwards | Flip cable orientation |
| Blurry image | Focus not set | Rotate lens to adjust focus |
| Image has lines/noise | Loose cable | Re-seat cable, close latch firmly |

---

## 6. USB Flashing Guide

The XIAO ESP32S3 has **native USB** - you can flash firmware directly without any adapter. This is much simpler than ESP32-CAM!

### What You Need

- **USB-C cable** (must be data-capable, not charge-only)
- **Computer** with USB-C port (or USB-A with adapter)
- **PlatformIO** (recommended) or **Arduino IDE**

### Verify Your USB Cable

Many USB cables are "charge only" and won't work for programming.

**How to test your cable:**
1. Connect XIAO to computer
2. On Windows: Open Device Manager → Look for "USB Serial Device" or "COM" port
3. On macOS: Open Terminal → Run `ls /dev/cu.*` → Look for `/dev/cu.usbmodem*`
4. On Linux: Run `ls /dev/ttyACM*` or `ls /dev/ttyUSB*`

**If no device appears:** Try a different USB cable - you likely have a charge-only cable.

### Installing PlatformIO (Recommended)

PlatformIO is a development platform that makes ESP32 development easier.

1. **Install VS Code:**
   - Download from https://code.visualstudio.com/
   - Install for your operating system

2. **Install PlatformIO Extension:**
   - Open VS Code
   - Click Extensions icon (left sidebar) or press Ctrl+Shift+X
   - Search for "PlatformIO IDE"
   - Click Install
   - Wait for installation (may take a few minutes)

3. **Verify Installation:**
   - You should see a PlatformIO icon in the left sidebar (alien head)
   - Click it to open PlatformIO Home

### Flashing APIS Firmware

1. **Clone the APIS repository:**
   ```bash
   git clone https://github.com/jermoo/apis.git
   cd apis/apis-edge
   ```

2. **Connect XIAO via USB-C**

3. **Open in VS Code/PlatformIO:**
   ```bash
   code .
   ```

4. **Select the XIAO environment:**
   - Open `platformio.ini`
   - Ensure `[env:xiao_esp32s3]` is present
   - PlatformIO will auto-detect the board

5. **Build and Upload:**
   - Click the PlatformIO icon in sidebar
   - Click "Build" (checkmark icon) to compile
   - Click "Upload" (arrow icon) to flash
   - Watch the terminal for progress

   ```
   Expected output:
   Building...
   Compiling .pio/build/xiao_esp32s3/src/main.cpp.o
   Linking .pio/build/xiao_esp32s3/firmware.elf
   Writing at 0x00010000... (100 %)
   Hard resetting via RTS pin...
   ============== [SUCCESS] ==============
   ```

### Boot Mode (If Upload Fails)

If upload fails with "Failed to connect", you may need to put XIAO in boot mode:

1. **Hold the BOOT button** (tiny button on XIAO board)
2. **While holding BOOT, press and release RESET**
3. **Release BOOT button**
4. XIAO is now in bootloader mode
5. Try upload again

```
XIAO Button Locations:
        ┌──── USB-C ────┐
        │   ┌──────┐    │
        │   └──────┘    │
        │               │
   D0 ──┤●             ●├── D10
   D1 ──┤●             ●├── D9
        │  [RESET]      │  ← RESET button (labeled R or RST)
   D2 ──┤●             ●├── D8
        │  [BOOT]       │  ← BOOT button (labeled B or BOOT)
   D3 ──┤●             ●├── D7
        │               │
```

### Alternative: Arduino IDE

If you prefer Arduino IDE:

1. **Install Arduino IDE 2.0+** from https://www.arduino.cc/en/software

2. **Add ESP32 Board Support:**
   - File → Preferences
   - Add to "Additional Board Manager URLs":
     ```
     https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
     ```
   - Tools → Board → Boards Manager
   - Search "esp32" and install "esp32 by Espressif Systems"

3. **Select Board:**
   - Tools → Board → esp32 → "XIAO_ESP32S3"

4. **Select Port:**
   - Tools → Port → Select the COM/ttyUSB port that appeared

5. **Upload:**
   - Sketch → Upload (or Ctrl+U)

### Verifying Successful Flash

After flashing, the XIAO should:
1. Auto-reset and start running
2. Status LED may blink (depends on firmware)
3. Serial output visible in terminal:

```bash
# PlatformIO: Click "Serial Monitor" icon
# Arduino IDE: Tools → Serial Monitor

# Expected output:
APIS Edge v1.0 starting...
Camera initialized: OV2640
WiFi connecting...
System ready!
```

---

## 7. Pre-Power Checklist

Before connecting USB power for the first time, verify all connections:

### Visual Inspection

| Check | Status |
|-------|--------|
| All wires firmly seated | [ ] |
| No bare wire touching other bare wire | [ ] |
| Resistors in correct places (LED, laser) | [ ] |
| Servo wires correct (Brown=GND, Red=5V, Orange=D0) | [ ] |
| Camera ribbon cable fully inserted | [ ] |
| Camera ribbon cable latch closed | [ ] |

### Connection Verification

| Connection | From | To | Check |
|------------|------|-----|-------|
| Power | XIAO 5V | + Rail | [ ] |
| Ground | XIAO GND | - Rail | [ ] |
| Servo signal | D0 | Servo Orange | [ ] |
| Servo power | + Rail | Servo Red | [ ] |
| Servo ground | - Rail | Servo Brown | [ ] |
| Laser signal | D1 | 330Ω → Laser S | [ ] |
| Laser power | + Rail | Laser + | [ ] |
| Laser ground | - Rail | Laser - | [ ] |
| LED Red | D2 | 330Ω → LED R | [ ] |
| LED Green | D3 | 330Ω → LED G | [ ] |
| LED Blue | D4 | 330Ω → LED B | [ ] |
| LED Ground | - Rail | LED Cathode | [ ] |
| Button | D5 | Button pin 1 | [ ] |
| Button ground | - Rail | Button pin 2 | [ ] |

### Ready to Power On

Once all checks pass:
1. Connect USB-C cable to XIAO
2. Connect USB cable to computer or power adapter
3. Observe LED behavior (should flash during startup)
4. If something smokes or gets hot, disconnect immediately and check wiring!

---

## 8. Testing Your Build

### Test 1: Power-On

**What to expect:**
- XIAO power LED lights up (small blue LED near USB port)
- No smoke or burning smell
- Components are not hot

**If something is wrong:**
1. Disconnect immediately
2. Check for reversed polarity on laser or LED
3. Check for short circuits (bare wires touching)

### Test 2: Serial Monitor

Connect via serial monitor to verify firmware is running:

```
Expected output:
================================
APIS Edge v1.0
Hardware: XIAO ESP32S3 Sense
================================
Initializing...
  [OK] GPIO configured
  [OK] Camera detected: OV2640
  [OK] Servo centered
  [OK] LED initialized
  [OK] Button ready

System Status: DISARMED
Waiting for button press to arm...
```

### Test 3: LED Test

The firmware includes a test mode. Enter via serial command:

```
> test led
Testing LED...
  RED ON ... [press Enter]
  GREEN ON ... [press Enter]
  BLUE ON ... [press Enter]
  WHITE ON (all) ... [press Enter]
  LED OFF
LED test complete!
```

Verify each color is correct. If colors are swapped, adjust the wire connections on D2/D3/D4.

### Test 4: Servo Test

```
> test servo
Testing servo...
  Moving to 0° (left) ... [2 second pause]
  Moving to 90° (center) ... [2 second pause]
  Moving to 180° (right) ... [2 second pause]
  Returning to center
Servo test complete!
```

**Expected:** Smooth movement left → center → right → center

**If jittery:** Power supply may be insufficient. Try a 5V 3A adapter.

### Test 5: Laser Test

**WARNING: Do not look directly at the laser!**

```
> test laser
Testing laser (DO NOT LOOK DIRECTLY)...
  Laser ON ... [1 second]
  Laser OFF
  Blink test (5x)...
Laser test complete!
```

Point the laser at a wall to verify it lights up.

### Test 6: Camera Test

```
> test camera
Starting camera stream...
Connect to http://192.168.x.x/stream
Press Ctrl+C to stop.
```

Open the URL in a browser to see live camera feed. Adjust focus if blurry.

### Test 7: Button Test

```
> test button
Waiting for button press...
  [press the button]
Button press detected!
Button test complete!
```

### Full System Test

```
> test all
Running full system test...
  [1/6] Power: OK
  [2/6] LED: OK
  [3/6] Servo: OK
  [4/6] Laser: OK
  [5/6] Camera: OK
  [6/6] Button: OK

All tests passed! System ready for deployment.
```

---

## 9. Troubleshooting

### Power Issues

| Symptom | Likely Cause | Solution |
|---------|--------------|----------|
| Nothing lights up | No power / bad cable | Try different USB cable |
| XIAO LED on, nothing else works | Wrong wiring | Check 5V/GND rail connections |
| Servo jitters constantly | Insufficient power | Use 5V 3A adapter |
| Random resets | Brownout during servo stall | Add 1000µF capacitor across servo power |

### Camera Issues

| Symptom | Likely Cause | Solution |
|---------|--------------|----------|
| "Camera not detected" | Ribbon cable loose | Re-seat cable, close latch |
| Black image | Cable backwards | Flip ribbon cable orientation |
| Image very blurry | Focus needs adjustment | Rotate lens |
| Weird colors / lines | Bad cable connection | Check ribbon cable seating |

### Servo Issues

| Symptom | Likely Cause | Solution |
|---------|--------------|----------|
| Doesn't move | Wrong pin or no power | Check D0 and 5V/GND |
| Moves wrong direction | Code configuration | Adjust in firmware |
| Makes grinding noise | Hitting mechanical stop | Don't over-rotate past 0° or 180° |
| Very jerky movement | PWM frequency wrong or power issues | Check firmware settings, power supply |

### LED Issues

| Symptom | Likely Cause | Solution |
|---------|--------------|----------|
| One color missing | Wrong wire or resistor | Check specific color's resistor and wire |
| Wrong colors | Wires swapped | Swap D2/D3/D4 connections |
| Very dim | Wrong resistor value | Verify 330Ω resistors |
| All colors very bright | Missing resistors | Add 330Ω resistors (required!) |

### Button Issues

| Symptom | Likely Cause | Solution |
|---------|--------------|----------|
| Always reads "pressed" | Wrong button pins / shorted | Check wiring, use correct button legs |
| Never detects press | Pull-up not enabled | Verify firmware has `pull_up=True` |
| Erratic behavior | Floating input | Ensure button connects D5 to GND |

### Communication Issues

| Symptom | Likely Cause | Solution |
|---------|--------------|----------|
| Can't flash firmware | Charge-only USB cable | Use data-capable USB-C cable |
| Port not appearing | Driver missing | Install ESP32 drivers |
| Upload fails | Not in boot mode | Hold BOOT, press RESET, release BOOT |
| Serial garbled | Wrong baud rate | Use 115200 baud |

---

## Next Steps

Once all tests pass:

1. **Configure WiFi** (if connecting to APIS server)
2. **Mount in enclosure** (see `docs/hardware/05-enclosure.md`)
3. **Position at hive** with camera facing entrance
4. **Arm the system** and start protecting your bees!

---

## See Also

- `docs/hardware-specification.md` - Complete hardware reference
- `docs/hardware/01-concepts.md` - Electronics fundamentals
- Section 6 of hardware-specification.md - XIAO technical reference

---

*Document created for Story 11.4 - XIAO ESP32S3 Assembly Manual*
