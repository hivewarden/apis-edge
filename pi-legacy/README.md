# APIS Edge Device - Raspberry Pi 5

Python-based hornet detection system for Raspberry Pi 5. Captures video, detects motion, identifies hornets, and triggers laser deterrent.

## Requirements

- Raspberry Pi 5 (4GB+ RAM recommended)
- Pi Camera Module 3 OR USB webcam
- Python 3.11+
- Raspberry Pi OS (64-bit recommended)

## Quick Start

```bash
# 1. Create virtual environment
python3 -m venv venv
source venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Test camera
python -m tests.test_camera --duration 5

# 4. Run APIS
python main.py
```

## Camera Setup

### Pi Camera Module 3

1. **Connect the ribbon cable** to the MIPI CSI port (between HDMI and USB-C)
   - Note: Pi 5 requires a 22-pin to 15-pin adapter cable (NOT the Pi 4 cable)
   - Lift the plastic clip, insert cable with contacts facing the HDMI ports, push clip down

2. **Test the camera:**
   ```bash
   libcamera-hello -t 5000
   ```

3. **No raspi-config needed** - Modern Pi OS enables camera by default

### USB Webcam

1. Plug into any USB port
2. Test: `python -m tests.test_camera --usb`

## Configuration

Edit `config.yaml` to customize settings:

```yaml
camera:
  type: auto          # auto, picamera, usb
  width: 640
  height: 480
  fps: 10
  device_id: 0        # For USB cameras
  focus_distance: 1.5 # Pi Camera focus (meters)

storage:
  data_dir: ./data
  clips_dir: ./data/clips
  db_path: ./data/detections.db

logging:
  level: INFO
  file: ./logs/apis.log
  format: json
```

## Project Structure

```
apis-edge/pi/
├── README.md           # This file
├── requirements.txt    # Python dependencies
├── config.yaml         # Configuration
├── main.py             # Entry point
├── config/
│   ├── __init__.py
│   └── settings.py     # Config loader
├── camera/
│   ├── __init__.py     # Factory function
│   ├── base.py         # Abstract interface
│   ├── picamera.py     # Pi Camera implementation
│   └── usb.py          # USB webcam implementation
├── detection/          # Motion detection (Story 10.2+)
├── storage/            # Event logging (Story 10.4+)
├── tests/
│   └── test_camera.py  # Camera test script
├── logs/               # Log files (created at runtime)
└── data/               # Detection data (created at runtime)
```

## Testing

```bash
# Test camera auto-detection
python -m tests.test_camera

# Force USB webcam
python -m tests.test_camera --usb

# Force Pi Camera
python -m tests.test_camera --picamera

# Save test frames
python -m tests.test_camera --save --duration 10
```

## Troubleshooting

| Issue | Symptom | Fix |
|-------|---------|-----|
| Camera not found | "Failed to open" | Check ribbon cable (Pi), try different USB port |
| Low FPS | <5 FPS | Reduce resolution, check CPU load |
| Blurry image | Detection fails | Lock focus with `focus_distance` setting |
| Permission denied | Can't access camera | `sudo usermod -aG video $USER` then reboot |
| Pi Camera error | libcamera error | Check ribbon cable orientation, try `libcamera-hello` |

## Hardware Reference

See `docs/hardware-specification.md` for:
- Section 4.5 Step 6: Pi Camera ribbon cable connection
- Section 10.2: Pi Camera Module 3 specs and focus lock
- Section 10.3: USB webcam fallback

## License

Part of the APIS (Anti-Predator Interference System) project.
