# APIS Edge — Anti-Predator Interference System

Edge device firmware for the Hive Warden hornet detection system. Detects Asian hornets via motion detection, tracks with servo, deters with laser. Runs on ESP32 (production) and Raspberry Pi (development). Written in C with a hardware abstraction layer.

## Companion Project: Hive Warden SaaS Platform

The server and dashboard that edge devices connect to are maintained separately:
- **GitHub**: https://github.com/hivewarden/hivewarden-saas
- **Local**: ../hivewarden-saas/ (sibling directory)

### API Contract
This device communicates with the Hive Warden server via REST API:
- `POST /api/devices/{id}/heartbeat` — Device health (every 60s)
- `POST /api/clips` — Upload detection clips
- Auth: `X-API-Key` header
- QR claiming payload: `{"s":"server_url","k":"api_key"}`
- mDNS: `_hivewarden._tcp` service discovery

## Critical Design Principles

1. **Design for ESP32** — Pi 5 is dev board only. Never add features that won't work on ESP32.
2. **Offline-first** — Edge device works with zero connectivity. Server is optional.
3. **HAL abstraction** — All hardware access goes through `hal/` layer. Three platforms: `APIS_PLATFORM_ESP32`, `APIS_PLATFORM_PI`, `APIS_PLATFORM_TEST`.

## Build Commands

```bash
# Test platform (macOS/Linux, for unit tests and CI)
rm -rf build && cmake -B build -DAPIS_PLATFORM=test && cmake --build build

# ESP32 (requires ESP-IDF toolchain)
source ~/esp/esp-idf/export.sh
cd platforms/esp32 && idf.py build

# Flash ESP32
idf.py -p /dev/cu.usbmodem1101 flash

# Flash with NVS wipe (factory reset)
idf.py -p /dev/cu.usbmodem1101 erase-flash flash
```

## Repository Structure

```
apis-edge/
├── src/                  # Shared C source code
│   ├── main.c            # Core initialization
│   ├── detection/        # Motion detection pipeline
│   ├── server/           # Server communication
│   ├── http/             # Captive portal HTTP server
│   ├── wifi/             # WiFi provisioning
│   ├── dns/              # Captive portal DNS
│   ├── mdns/             # mDNS service discovery
│   ├── qr/               # QR code scanner
│   ├── tls/              # TLS client
│   ├── led/              # LED status controller
│   ├── servo/            # Servo tracking
│   ├── laser/            # Laser targeting + safety
│   ├── button/           # Reset button handler
│   ├── storage/          # Rolling buffer, clip recorder
│   └── upload/           # Clip uploader
├── include/              # Header files
├── hal/                  # Hardware Abstraction Layer
│   ├── esp32/            # ESP32-specific implementations
│   ├── pi/               # Pi-specific implementations
│   └── camera.h          # HAL interface definitions
├── lib/                  # Vendored libraries
│   ├── cJSON/            # JSON parser
│   └── quirc/            # QR code decoder (ISC license)
├── platforms/            # Platform-specific build configs
│   └── esp32/            # ESP-IDF project (CMakeLists, sdkconfig)
├── tests/                # Unit tests
├── hardware/             # Wiring diagrams, STL files
├── docs/                 # Hardware specification and assembly guides
├── data/                 # Test data (QR images, etc.)
└── CMakeLists.txt        # Top-level CMake (test platform build)
```

## ESP32 Gotchas

- **PSRAM required for large allocations**: quirc image buffers (~300KB) MUST use `heap_caps_malloc(MALLOC_CAP_SPIRAM)` — internal SRAM is only ~300KB total. Regular `malloc` causes TLSF heap assert crash.
- **FreeRTOS task stack sizes**: DNS=8192, heartbeat=8192, HTTP=16384, LED=2048, servo=2048, upload=8192. Too-small stacks cause silent crashes.
- **Symbol name collisions**: ESP-IDF's wpa_supplicant exports `tls_init`/`tls_cleanup` — ours are renamed to `apis_tls_init`/`apis_tls_cleanup`.
- **Missing FreeRTOS includes**: `mdns_discovery.c` needs `freertos/FreeRTOS.h` + `freertos/task.h` for `vTaskDelay`/`pdMS_TO_TICKS`.
- **Captive portal**: HTTP server MUST be on port 80 (not 8080) for auto-popup. All paths must redirect to `/setup` BEFORE auth check.
- **AP mode**: Uses `WIFI_AUTH_OPEN` (no password) for easier DIY setup.
- **NVS persistence**: WiFi creds survive `idf.py flash` but NOT `idf.py erase-flash`.
- **macOS build**: needs `#define _DARWIN_C_SOURCE` before `<time.h>` for `timegm()`.

## Device Lifecycle State Machine

```
┌──────────────────────────────────────────────────────────────────────┐
│ State                │ WiFi      │ Camera         │ QR? │ Motion?   │
├──────────────────────────────────────────────────────────────────────┤
│ 1. First boot        │ AP hotspot│ QVGA grayscale │ YES │ NO        │
│    (no WiFi saved)   │ (timeout) │                │     │           │
├──────────────────────────────────────────────────────────────────────┤
│ 2. AP timeout,       │ Radio OFF │ VGA BGR        │ NO  │ YES       │
│    no config saved   │           │                │     │(standalone)│
├──────────────────────────────────────────────────────────────────────┤
│ 3. WiFi connected,   │ Station   │ QVGA grayscale │ YES │ NO        │
│    no API key yet    │ mode      │                │     │           │
├──────────────────────────────────────────────────────────────────────┤
│ 4. Fully claimed     │ Station   │ VGA BGR        │ NO  │ YES       │
│    (has API key)     │ mode      │                │     │           │
└──────────────────────────────────────────────────────────────────────┘

Transitions:
  1→2: AP timeout (5 min, no client connected)
  1→3: User completes captive portal with WiFi creds (no API key)
  1→4: User completes captive portal with WiFi creds + API key (or QR scan)
  2→1: Reset button long-press or double power cycle within 5s
  3→4: QR code scanned successfully (or API key entered via captive portal)
  4→1: Factory reset (erase NVS)
```

**Key design rules:**
- **No WiFi = no server = no QR needed.** Standalone devices just detect hornets.
- **WiFi implies server intent.** If someone configured WiFi, they want a server.
- **AP hotspot has a timeout.** If nobody connects within 5 min, device assumes standalone.
- **Camera reinit between phases.** esp32-camera requires deinit/reinit to change frame_size in grayscale mode.
- **QVGA (320x240) for QR, VGA (640x480) for detection.** 75KB vs 307KB.
- **QR + motion detection NEVER run simultaneously** — PSRAM bus contention on ESP32.

## QR Code Claiming

The dashboard displays a QR code containing `{"s":"server_url","k":"api_key"}`. During states 1 and 3, the device camera scans for this QR code at QVGA resolution. On successful scan, the device stores the server URL and API key, then transitions to state 4.

- QR scanning uses quirc library (vendored in `lib/quirc/`, ISC license)
- Camera runs at PIXFORMAT_GRAYSCALE, FRAMESIZE_QVGA, fb_count=1
- No motion detection, rolling buffer, or other PSRAM-heavy subsystems during QR phase

## Server Discovery Chain (after WiFi connected)

```
1. Saved config     → User typed a URL or QR scanned one during setup
2. mDNS discovery   → Query _hivewarden._tcp on local network (standalone)
3. Default URL      → ONBOARDING_DEFAULT_URL ("https://hivewarden.eu")
4. Fallback URL     → ONBOARDING_FALLBACK_URL (optional, for self-hosters)
5. No server        → Runs detection locally, no uploads
```

### Self-Hosters

Edit `include/onboarding_defaults.h` before building:
```c
#define ONBOARDING_DEFAULT_URL   "https://bees.myclub.be"
#define ONBOARDING_FALLBACK_URL  "https://hivewarden.eu"  // optional backup
```

## Architecture Patterns

- **Config access**: use `config_manager_get_public()` for thread-safe snapshots, copy to local vars.
- **ESP32 critical sections**: use `xSemaphoreTake/Give` not `portENTER/EXIT_CRITICAL` for task context.
- **Safety layer callbacks**: copy function pointer under lock, invoke outside lock to prevent deadlock.
- **Device communication**: device pushes to server (works through NAT). Server never initiates connection.

## Documentation Philosophy

**USER CONTEXT:** The user has very little electronics experience. All hardware documentation must:
- Teach concepts, not just list steps
- Explain WHY each connection is made
- Define terminology when first used (GPIO, PWM, pull-up resistor, etc.)
- Include "what could go wrong" sections with symptoms and fixes
- Never assume prior knowledge of voltages, currents, or pin functions

## Testing

- Tests use `APIS_PLATFORM=test` mock HAL
- Test binaries built with cmake
- Pre-existing test failures: test_targeting (2) — known issue, not a regression

## What NOT to Do

- Don't add features that won't work on ESP32
- Don't run QR scanning and motion detection simultaneously (PSRAM crash)
- Don't use SSH for device management (ESP32 can't do it)
- Don't design pull-based communication (device pushes only)
- Don't proxy MJPEG through server (connect directly to device)
- Don't allocate large buffers (>10KB) on stack — use PSRAM via heap_caps_malloc
