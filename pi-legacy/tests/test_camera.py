#!/usr/bin/env python3
"""
Test script for APIS camera module.

Run this to verify your camera setup works. Can be run both as a pytest
test module and as a standalone script for manual testing.

Standalone usage:
    python -m tests.test_camera              # Auto-detect camera
    python -m tests.test_camera --usb        # Force USB webcam
    python -m tests.test_camera --picamera   # Force Pi Camera
    python -m tests.test_camera --save       # Save test frames
    python -m tests.test_camera --duration 10  # Run for 10 seconds

Pytest usage:
    pytest tests/test_camera.py -v
    pytest tests/test_camera.py -v -k "test_usb"  # USB tests only
"""

import argparse
import os
import sys
import tempfile
import time
from pathlib import Path
from unittest.mock import MagicMock, patch

import cv2
import numpy as np
import pytest

# Add parent directory to path for imports when running as script
sys.path.insert(0, str(Path(__file__).parent.parent))

from camera import create_camera, Camera, Frame
from camera.base import Frame as BaseFrame
from camera.usb import USBCamera


# =============================================================================
# Pytest Unit Tests
# =============================================================================


class TestFrame:
    """Unit tests for the Frame dataclass."""

    def test_frame_create_with_defaults(self):
        """Frame.create should set timestamp and dimensions automatically."""
        data = np.zeros((480, 640, 3), dtype=np.uint8)
        frame = Frame.create(data, sequence=1)

        assert frame.sequence == 1
        assert frame.width == 640
        assert frame.height == 480
        assert frame.timestamp is not None
        assert len(frame.timestamp) > 0  # ISO format timestamp

    def test_frame_create_with_custom_timestamp(self):
        """Frame.create should accept custom timestamp."""
        from datetime import datetime

        data = np.zeros((480, 640, 3), dtype=np.uint8)
        custom_time = datetime(2024, 1, 15, 12, 30, 45)
        frame = Frame.create(data, sequence=5, timestamp=custom_time)

        assert "2024-01-15T12:30:45" in frame.timestamp

    def test_frame_dimensions_from_data(self):
        """Frame should derive dimensions from actual data shape."""
        # Non-standard resolution
        data = np.zeros((720, 1280, 3), dtype=np.uint8)
        frame = Frame.create(data, sequence=1)

        assert frame.width == 1280
        assert frame.height == 720


class TestUSBCamera:
    """Unit tests for USBCamera class."""

    def test_usb_camera_init_defaults(self):
        """USBCamera should initialize with default values."""
        camera = USBCamera()

        assert camera._device_id == 0
        assert camera._width == 640
        assert camera._height == 480
        assert camera._target_fps == 10
        assert camera.is_open() is False

    def test_usb_camera_init_custom(self):
        """USBCamera should accept custom configuration."""
        camera = USBCamera(device_id=1, width=1280, height=720, fps=30)

        assert camera._device_id == 1
        assert camera._width == 1280
        assert camera._height == 720
        assert camera._target_fps == 30

    def test_usb_camera_resolution_property(self):
        """resolution property should return configured dimensions."""
        camera = USBCamera(width=800, height=600)

        # Before open, returns requested dimensions
        assert camera.resolution == (800, 600)

    def test_usb_camera_target_fps_property(self):
        """target_fps property should return configured FPS."""
        camera = USBCamera(fps=15)

        assert camera.target_fps == 15

    def test_usb_camera_is_open_initially_false(self):
        """is_open should return False before open() is called."""
        camera = USBCamera()

        assert camera.is_open() is False

    def test_usb_camera_read_when_closed_returns_none(self):
        """read() should return None if camera is not open."""
        camera = USBCamera()

        frame = camera.read()

        assert frame is None

    def test_usb_camera_close_when_already_closed(self):
        """close() should be safe to call when already closed."""
        camera = USBCamera()

        # Should not raise
        camera.close()
        camera.close()


class TestCameraFactory:
    """Unit tests for camera factory function."""

    def test_create_camera_unknown_type_raises(self):
        """create_camera should raise ValueError for unknown type."""
        with pytest.raises(ValueError, match="Unknown camera type"):
            create_camera("invalid_type")

    def test_create_camera_usb_type(self):
        """create_camera('usb') should return USBCamera instance."""
        camera = create_camera("usb")

        assert isinstance(camera, USBCamera)

    def test_create_camera_passes_parameters(self):
        """create_camera should pass parameters to camera instance."""
        camera = create_camera("usb", width=1280, height=720, fps=30, device_id=2)

        assert camera._width == 1280
        assert camera._height == 720
        assert camera._target_fps == 30
        assert camera._device_id == 2


class TestCameraIntegration:
    """Integration tests that require actual camera hardware.

    These tests are skipped if no camera is available.
    """

    @pytest.fixture
    def usb_camera(self):
        """Fixture to provide a USB camera, skip if unavailable."""
        camera = USBCamera(width=640, height=480, fps=10)
        if not camera.open():
            pytest.skip("No USB camera available")
        yield camera
        camera.close()

    @pytest.mark.skipif(
        os.environ.get("CI") == "true", reason="No camera in CI environment"
    )
    def test_usb_camera_capture_frames(self, usb_camera):
        """USB camera should capture frames with correct format."""
        frame = usb_camera.read()

        assert frame is not None
        assert isinstance(frame, Frame)
        assert frame.data is not None
        assert frame.data.shape[2] == 3  # BGR channels
        assert frame.sequence == 1

    @pytest.mark.skipif(
        os.environ.get("CI") == "true", reason="No camera in CI environment"
    )
    def test_usb_camera_fps_measurement(self, usb_camera):
        """USB camera should measure FPS over multiple frames."""
        # Capture some frames
        for _ in range(20):
            usb_camera.read()

        # FPS should now be calculated
        assert usb_camera.fps > 0

    @pytest.mark.skipif(
        os.environ.get("CI") == "true", reason="No camera in CI environment"
    )
    def test_usb_camera_sequence_incrementing(self, usb_camera):
        """Frame sequence should increment with each capture."""
        frame1 = usb_camera.read()
        frame2 = usb_camera.read()
        frame3 = usb_camera.read()

        assert frame1.sequence == 1
        assert frame2.sequence == 2
        assert frame3.sequence == 3


# =============================================================================
# Standalone Test Script
# =============================================================================


def run_camera_test(
    camera_type: str = "auto",
    duration: int = 10,
    save_frames: bool = False,
    save_dir: str = ".",
    verbose: bool = True,
) -> dict:
    """Run a camera capture test.

    Args:
        camera_type: "auto", "usb", or "picamera"
        duration: Test duration in seconds
        save_frames: Whether to save test frames
        save_dir: Directory to save frames
        verbose: Print progress to stdout

    Returns:
        Dict with test results:
        - success: bool
        - total_frames: int
        - duration_seconds: float
        - average_fps: float
        - min_fps: float
        - max_fps: float
        - error: str or None
    """
    results = {
        "success": False,
        "total_frames": 0,
        "duration_seconds": 0.0,
        "average_fps": 0.0,
        "min_fps": 0.0,
        "max_fps": 0.0,
        "camera_type": camera_type,
        "resolution": (0, 0),
        "error": None,
    }

    if verbose:
        print(f"Opening camera (type={camera_type})...")

    camera = create_camera(camera_type)

    if not camera.open():
        results["error"] = "Failed to open camera"
        if verbose:
            print(f"ERROR: {results['error']}")
        return results

    results["camera_type"] = type(camera).__name__
    results["resolution"] = camera.resolution

    if verbose:
        print(f"Camera opened: {camera.resolution[0]}x{camera.resolution[1]}")
        print(f"Running for {duration} seconds...")

    frame_count = 0
    fps_samples = []
    start_time = time.time()
    last_fps_time = start_time
    fps_interval = 1.0  # Sample FPS every second

    try:
        while time.time() - start_time < duration:
            frame = camera.read()

            if frame is None:
                if verbose:
                    print("\nWARNING: Failed to read frame")
                continue

            frame_count += 1
            elapsed = time.time() - start_time
            instant_fps = frame_count / elapsed if elapsed > 0 else 0

            # Sample FPS periodically
            if time.time() - last_fps_time >= fps_interval:
                fps_samples.append(camera.fps)
                last_fps_time = time.time()

            if verbose:
                print(f"\rFrame {frame.sequence}: {instant_fps:.1f} FPS", end="")

            # Save frames periodically
            if save_frames and frame_count % 30 == 0:
                filename = Path(save_dir) / f"frame_{frame_count:04d}.jpg"
                cv2.imwrite(str(filename), frame.data)
                if verbose:
                    print(f" [Saved {filename.name}]", end="")

    except KeyboardInterrupt:
        if verbose:
            print("\nStopped by user")
    finally:
        camera.close()

    # Calculate results
    elapsed = time.time() - start_time
    results["success"] = frame_count > 0
    results["total_frames"] = frame_count
    results["duration_seconds"] = round(elapsed, 2)
    results["average_fps"] = round(frame_count / elapsed, 1) if elapsed > 0 else 0

    if fps_samples:
        results["min_fps"] = round(min(fps_samples), 1)
        results["max_fps"] = round(max(fps_samples), 1)

    if verbose:
        print(f"\n\nResults:")
        print(f"  Camera type: {results['camera_type']}")
        print(f"  Resolution: {results['resolution'][0]}x{results['resolution'][1]}")
        print(f"  Total frames: {results['total_frames']}")
        print(f"  Duration: {results['duration_seconds']}s")
        print(f"  Average FPS: {results['average_fps']}")
        if fps_samples:
            print(f"  FPS range: {results['min_fps']} - {results['max_fps']}")

    return results


def main() -> int:
    """Main entry point for standalone test script.

    Returns:
        Exit code (0 for success, non-zero for failure)
    """
    parser = argparse.ArgumentParser(
        description="Test APIS camera module",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python -m tests.test_camera              # Auto-detect camera
  python -m tests.test_camera --usb        # Force USB webcam
  python -m tests.test_camera --picamera   # Force Pi Camera
  python -m tests.test_camera --save       # Save test frames
  python -m tests.test_camera --duration 30  # Run for 30 seconds
""",
    )
    parser.add_argument(
        "--usb", action="store_true", help="Force USB webcam (OpenCV)"
    )
    parser.add_argument(
        "--picamera", action="store_true", help="Force Pi Camera Module"
    )
    parser.add_argument(
        "--save", action="store_true", help="Save test frames to current directory"
    )
    parser.add_argument(
        "--save-dir",
        type=str,
        default=".",
        help="Directory to save test frames (default: current)",
    )
    parser.add_argument(
        "--duration",
        type=int,
        default=10,
        help="Test duration in seconds (default: 10)",
    )
    parser.add_argument(
        "--quiet", action="store_true", help="Suppress output (for scripting)"
    )
    parser.add_argument(
        "--json", action="store_true", help="Output results as JSON"
    )
    args = parser.parse_args()

    # Determine camera type
    camera_type = "auto"
    if args.usb:
        camera_type = "usb"
    elif args.picamera:
        camera_type = "picamera"

    # Run test
    results = run_camera_test(
        camera_type=camera_type,
        duration=args.duration,
        save_frames=args.save,
        save_dir=args.save_dir,
        verbose=not args.quiet,
    )

    # Output results
    if args.json:
        import json

        print(json.dumps(results, indent=2))

    # Check acceptance criteria
    # AC2: frames are captured at >=5 FPS consistently
    if results["average_fps"] < 5:
        if not args.quiet:
            print(f"\nWARNING: FPS ({results['average_fps']}) is below minimum (5)")

    return 0 if results["success"] else 1


if __name__ == "__main__":
    sys.exit(main())
