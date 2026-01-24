"""USB webcam implementation using OpenCV.

This implementation uses OpenCV's VideoCapture to interface with USB webcams.
It works on any system with OpenCV installed, making it suitable for both
development (macOS/Linux) and production (Raspberry Pi) environments.
"""

import time
from datetime import datetime
from typing import Optional

import cv2
import numpy as np
import structlog

from .base import Camera, Frame

logger = structlog.get_logger(__name__)


class USBCamera(Camera):
    """USB webcam implementation using OpenCV VideoCapture.

    Uses OpenCV's platform-independent VideoCapture to access USB cameras.
    Works on Linux, macOS, and Windows with appropriate video drivers.
    """

    def __init__(
        self,
        device_id: int = 0,
        width: int = 640,
        height: int = 480,
        fps: int = 10,
        retry_interval: int = 30,
    ):
        """Initialize USB camera configuration.

        Args:
            device_id: Video device ID (0 = first camera, 1 = second, etc.)
            width: Frame width in pixels
            height: Frame height in pixels
            fps: Target frames per second
            retry_interval: Seconds between reconnection attempts (unused here but
                          kept for interface consistency)
        """
        self._cap: Optional[cv2.VideoCapture] = None
        self._device_id = device_id
        self._width = width
        self._height = height
        self._target_fps = fps
        self._retry_interval = retry_interval

        # Frame tracking
        self._sequence = 0
        self._frame_times: list[float] = []
        self._fps_window = 30  # Average over last 30 frames
        self._measured_fps = 0.0

        # Actual resolution (may differ from requested)
        self._actual_width = width
        self._actual_height = height

    def open(self) -> bool:
        """Initialize and open the USB camera.

        Attempts to open the camera at the configured device ID and set
        the requested resolution and frame rate. Note that not all cameras
        support all resolutions/frame rates - OpenCV will use the closest
        available settings.

        Returns:
            True if camera opened successfully, False otherwise
        """
        try:
            logger.debug(
                "opening_usb_camera",
                device_id=self._device_id,
                width=self._width,
                height=self._height,
                fps=self._target_fps,
            )

            self._cap = cv2.VideoCapture(self._device_id)

            if not self._cap.isOpened():
                logger.error("usb_camera_not_found", device_id=self._device_id)
                return False

            # Set resolution and FPS
            self._cap.set(cv2.CAP_PROP_FRAME_WIDTH, self._width)
            self._cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self._height)
            self._cap.set(cv2.CAP_PROP_FPS, self._target_fps)

            # Get actual values (may differ from requested)
            self._actual_width = int(self._cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            self._actual_height = int(self._cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            actual_fps = self._cap.get(cv2.CAP_PROP_FPS)

            # Read a test frame to verify camera works
            ret, frame = self._cap.read()
            if not ret or frame is None:
                logger.error("usb_camera_test_frame_failed")
                self._cleanup()
                return False

            # Reset counters
            self._sequence = 0
            self._frame_times = []

            logger.info(
                "usb_camera_opened",
                device_id=self._device_id,
                requested_resolution=f"{self._width}x{self._height}",
                actual_resolution=f"{self._actual_width}x{self._actual_height}",
                requested_fps=self._target_fps,
                actual_fps=actual_fps,
            )
            return True

        except Exception as e:
            logger.error("usb_camera_open_failed", error=str(e))
            self._cleanup()
            return False

    def read(self) -> Optional[Frame]:
        """Capture a single frame from the USB camera.

        Returns:
            Frame object with BGR image data, or None if capture fails.
        """
        if not self.is_open():
            return None

        try:
            ret, bgr_array = self._cap.read()

            if not ret or bgr_array is None:
                logger.warning("usb_camera_read_failed")
                return None

            # Update FPS tracking
            now = time.time()
            self._frame_times.append(now)

            # Keep only recent frames for FPS calculation
            if len(self._frame_times) > self._fps_window:
                self._frame_times = self._frame_times[-self._fps_window :]

            # Calculate FPS from frame times
            if len(self._frame_times) >= 2:
                elapsed = self._frame_times[-1] - self._frame_times[0]
                if elapsed > 0:
                    self._measured_fps = (len(self._frame_times) - 1) / elapsed

            self._sequence += 1
            return Frame.create(bgr_array, self._sequence)

        except Exception as e:
            logger.error("usb_camera_read_error", error=str(e))
            return None

    def close(self) -> None:
        """Release USB camera resources."""
        self._cleanup()
        logger.debug("usb_camera_closed")

    def _cleanup(self) -> None:
        """Internal cleanup helper."""
        if self._cap is not None:
            try:
                self._cap.release()
            except Exception:
                pass  # Ignore errors during cleanup
            self._cap = None

    def is_open(self) -> bool:
        """Check if camera is currently open and working.

        Returns:
            True if camera is open and ready to capture
        """
        return self._cap is not None and self._cap.isOpened()

    @property
    def resolution(self) -> tuple[int, int]:
        """Get current resolution.

        Returns the actual resolution which may differ from requested
        if the camera doesn't support the exact resolution requested.

        Returns:
            Tuple of (width, height) in pixels
        """
        return (self._actual_width, self._actual_height)

    @property
    def fps(self) -> float:
        """Get current measured FPS.

        Returns:
            Measured frames per second averaged over recent frames
        """
        return self._measured_fps

    @property
    def target_fps(self) -> int:
        """Get target FPS setting.

        Returns:
            Target frames per second as configured
        """
        return self._target_fps
