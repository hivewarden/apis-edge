# APIS Edge Device

Hornet detection and laser deterrent firmware for Raspberry Pi and ESP32 platforms.

## Overview

The APIS (Anti-Predator Interference System) edge device captures video frames, detects hovering hornets using motion analysis, and triggers deterrent responses. This codebase uses a Hardware Abstraction Layer (HAL) to support both Raspberry Pi and ESP32 platforms from a single source tree.

## Platforms

| Platform | Camera | Status |
|----------|--------|--------|
| Raspberry Pi 5 | USB webcam / Pi Camera Module 3 | Primary development |
| ESP32-CAM | OV2640 | Future |
| XIAO ESP32-S3 Sense | Built-in camera | Future |

## Building

### Raspberry Pi

```bash
# Install dependencies
sudo apt-get install -y build-essential cmake libv4l-dev libyaml-dev v4l-utils

# Build
mkdir build && cd build
cmake ..
make

# Run tests
./test_camera --duration 10 --save

# Run main program
./apis-edge
```

### ESP32 (Future)

```bash
# Using ESP-IDF
cd platforms/esp32
idf.py build
idf.py flash
```

## Project Structure

```
apis-edge/
├── CMakeLists.txt         # Top-level build config
├── README.md              # This file
├── config.yaml            # Runtime configuration (Pi only)
├── include/               # Public headers
│   ├── config.h           # Configuration structures
│   ├── frame.h            # Frame data structure
│   ├── log.h              # Logging macros
│   └── platform.h         # Platform detection
├── src/                   # Core source files
│   ├── main.c             # Entry point
│   ├── config.c           # Config loader
│   └── log.c              # Logging implementation
├── hal/                   # Hardware Abstraction Layer
│   ├── camera.h           # Abstract camera interface
│   ├── pi/                # Pi implementations
│   │   └── camera_pi.c    # V4L2 camera
│   └── esp32/             # ESP32 implementations
│       └── camera_esp32.c # esp_camera
├── detection/             # Motion detection (Story 10.2+)
├── storage/               # Event logging (Story 10.4+)
├── platforms/             # Platform-specific build configs
│   ├── pi/
│   └── esp32/
└── tests/                 # Test programs
    └── test_camera.c
```

## Configuration

Edit `config.yaml` to customize the device settings:

```yaml
camera:
  device_path: /dev/video0    # Camera device
  width: 640                  # Frame width
  height: 480                 # Frame height
  fps: 10                     # Target FPS

detection:
  motion_threshold: 0.02      # Motion sensitivity
  hover_duration: 2.0         # Seconds to confirm hover
```

## Hardware Setup

### Pi Camera Module 3

1. Use the 22-pin to 15-pin adapter cable (Pi 5 specific)
2. Connect to CAM/DISP 0 port on Pi 5
3. Enable camera in `/boot/firmware/config.txt` if needed
4. Test with `libcamera-hello -t 5000`

### USB Webcam

1. Connect to USB 3.0 port for best performance
2. Verify with `v4l2-ctl --list-devices`
3. Device should appear as `/dev/video0` or `/dev/video1`

### Permissions

If you get permission errors:

```bash
# Add user to video group
sudo usermod -aG video $USER

# Log out and back in for changes to take effect
```

## Testing

```bash
# Run camera test for 10 seconds
./test_camera --duration 10

# Save sample frames
./test_camera --duration 5 --save

# Use specific device
./test_camera --device /dev/video1

# Verbose output
./test_camera --verbose
```

## Troubleshooting

| Issue | Symptom | Fix |
|-------|---------|-----|
| Camera not found | "Failed to open /dev/video0" | Check cable, try different USB port |
| Permission denied | Can't access camera | Add user to video group |
| Low FPS | <5 FPS | Reduce resolution, check CPU load |
| V4L2 format error | VIDIOC_S_FMT failed | Camera may not support BGR24, code falls back to YUYV |

## Memory Usage

- Frame buffer (640x480 BGR): ~900 KB
- Pre-roll buffer (20 frames): ~18 MB
- SQLite cache: ~1-5 MB

**Total: ~25 MB** (acceptable for Pi 5 with 8GB RAM)

## License

See main repository LICENSE file.
