# APIS Edge — Anti-Predator Interference System

Edge device firmware for the Hive Warden hornet detection system. Runs on ESP32-S3 (production) and Raspberry Pi 5 (development). Detects Asian hornets via camera-based motion detection, tracks with servo, deters with laser.

## Quick Start (Test Platform)

```bash
# Build and run tests (no hardware required)
cmake -B build -DAPIS_PLATFORM=test
cmake --build build

# Run a specific test
./build/test_motion
```

## ESP32 Build

```bash
# Set up ESP-IDF (one time)
source ~/esp/esp-idf/export.sh

# Build
cd platforms/esp32
idf.py build

# Flash
idf.py -p /dev/cu.usbmodem1101 flash

# Monitor serial output
idf.py -p /dev/cu.usbmodem1101 monitor
```

## Architecture

```
apis-edge/
├── src/              # Shared C source (all platforms)
├── include/          # Header files
├── hal/              # Hardware Abstraction Layer
│   ├── esp32/        # ESP32-specific (camera, GPIO, WiFi)
│   └── pi/           # Raspberry Pi (libcamera, sysfs GPIO)
├── lib/              # Vendored libraries (cJSON, quirc)
├── platforms/        # Platform build configs
│   └── esp32/        # ESP-IDF project
├── tests/            # Unit tests (test platform)
├── hardware/         # Wiring diagrams, enclosure STL files
└── docs/             # Hardware specification and assembly guides
```

## Device Features

- Camera-based motion detection (Asian hornet identification)
- Servo tracking and laser deterrent
- WiFi provisioning via captive portal
- QR code device claiming (from companion dashboard)
- mDNS service discovery
- Heartbeat and clip upload to server
- LED status indicators
- Fully offline-capable (server is optional)

## Companion Project

The server and dashboard that edge devices connect to are maintained in a separate repository:

- **GitHub**: [hivewarden/hivewarden-saas](https://github.com/hivewarden/hivewarden-saas)
- **Local**: `../hivewarden-saas/` (sibling directory)

Edge devices communicate with the server via REST API using `X-API-Key` authentication. Devices push heartbeats and detection clips.

## Hardware

See `docs/hardware-specification.md` for complete hardware documentation including:
- Component list and specifications
- Wiring diagrams
- Assembly guides
- Enclosure mounting
