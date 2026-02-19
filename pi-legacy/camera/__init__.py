"""Camera module - provides hardware abstraction for video capture.

This module provides a unified interface for capturing video frames from
different camera hardware (Pi Camera Module 3 or USB webcams).

Usage:
    from camera import create_camera

    # Auto-detect camera type
    camera = create_camera()

    # Or specify type
    camera = create_camera("usb", device_id=0)
    camera = create_camera("picamera", focus_distance=1.5)

    if camera.open():
        frame = camera.read()
        if frame:
            print(f"Got frame {frame.sequence}: {frame.width}x{frame.height}")
        camera.close()
"""

from .base import Camera, Frame
from .picamera import PiCamera
from .usb import USBCamera

import structlog

logger = structlog.get_logger(__name__)


def create_camera(
    camera_type: str = "auto",
    width: int = 640,
    height: int = 480,
    fps: int = 10,
    device_id: int = 0,
    focus_distance: float = 1.5,
    retry_interval: int = 30,
) -> Camera:
    """Factory function to create appropriate camera instance.

    Args:
        camera_type: "auto", "picamera", or "usb"
        width: Frame width in pixels
        height: Frame height in pixels
        fps: Target frames per second
        device_id: USB camera device ID (for usb type)
        focus_distance: Focus distance in meters (for picamera type)
        retry_interval: Seconds between reconnection attempts

    Returns:
        Camera instance ready to open()

    Raises:
        ValueError: If camera_type is not recognized
    """
    if camera_type == "picamera":
        logger.debug("creating_picamera", width=width, height=height, fps=fps)
        return PiCamera(
            width=width,
            height=height,
            fps=fps,
            focus_distance=focus_distance,
            retry_interval=retry_interval,
        )

    elif camera_type == "usb":
        logger.debug("creating_usb_camera", width=width, height=height, fps=fps)
        return USBCamera(
            device_id=device_id,
            width=width,
            height=height,
            fps=fps,
            retry_interval=retry_interval,
        )

    elif camera_type == "auto":
        # Try Pi Camera first, fall back to USB
        logger.debug("auto_detecting_camera")
        try:
            # Check if picamera2 is available and camera is connected
            from picamera2 import Picamera2

            # Try to instantiate - this will fail if no camera connected
            test_cam = Picamera2()
            test_cam.close()

            logger.info("auto_detect_result", camera_type="picamera")
            return PiCamera(
                width=width,
                height=height,
                fps=fps,
                focus_distance=focus_distance,
                retry_interval=retry_interval,
            )
        except Exception as e:
            logger.debug("picamera_not_available", error=str(e))
            logger.info("auto_detect_result", camera_type="usb")
            return USBCamera(
                device_id=device_id,
                width=width,
                height=height,
                fps=fps,
                retry_interval=retry_interval,
            )

    else:
        raise ValueError(f"Unknown camera type: {camera_type}")


__all__ = ["Camera", "Frame", "PiCamera", "USBCamera", "create_camera"]
