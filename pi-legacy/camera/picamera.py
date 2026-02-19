"""Pi Camera Module 3 implementation using picamera2.

This implementation uses the libcamera-based picamera2 library which is
the recommended way to use cameras on Raspberry Pi OS Bookworm and later.

Note: This module requires a Raspberry Pi with a connected camera module.
It will not work on non-Pi systems.
"""

import time
from datetime import datetime
from typing import Optional

import numpy as np
import structlog

from .base import Camera, Frame

logger = structlog.get_logger(__name__)


class PiCamera(Camera):
    """Pi Camera Module 3 implementation using picamera2.

    Uses the modern picamera2 library with libcamera backend.
    Supports autofocus control and fixed focus distance for optimal
    hornet detection at typical distances (1-2 meters).
    """

    def __init__(
        self,
        width: int = 640,
        height: int = 480,
        fps: int = 10,
        focus_distance: float = 1.5,
        retry_interval: int = 30,
    ):
        """Initialize Pi Camera configuration.

        Args:
            width: Frame width in pixels
            height: Frame height in pixels
            fps: Target frames per second
            focus_distance: Focus distance in meters (0 = infinity, higher = closer)
            retry_interval: Seconds between reconnection attempts (unused here but
                          kept for interface consistency)
        """
        self._picam = None
        self._width = width
        self._height = height
        self._target_fps = fps
        self._focus_distance = focus_distance
        self._retry_interval = retry_interval

        # Frame tracking
        self._sequence = 0
        self._frame_times: list[float] = []
        self._fps_window = 30  # Average over last 30 frames
        self._measured_fps = 0.0

    def open(self) -> bool:
        """Initialize and open the Pi Camera.

        Configures the camera for video capture with the specified resolution
        and frame rate. Sets focus to manual mode at the configured distance
        for consistent hornet detection.

        Returns:
            True if camera opened successfully, False otherwise
        """
        try:
            # Import here to allow module to load on non-Pi systems
            from picamera2 import Picamera2

            logger.debug(
                "opening_picamera",
                width=self._width,
                height=self._height,
                fps=self._target_fps,
            )

            self._picam = Picamera2()

            # Create video configuration
            config = self._picam.create_video_configuration(
                main={"size": (self._width, self._height), "format": "RGB888"},
                controls={"FrameRate": self._target_fps},
            )
            self._picam.configure(config)

            # Set focus to manual mode at configured distance
            # LensPosition: 0.0 = infinity, higher values = closer focus
            # ~1.5 corresponds to roughly 1 meter focus distance
            try:
                from libcamera import controls

                self._picam.set_controls(
                    {
                        "AfMode": controls.AfModeEnum.Manual,
                        "LensPosition": self._focus_distance,
                    }
                )
                logger.debug("focus_set", distance_meters=self._focus_distance)
            except Exception as e:
                # Some cameras don't support focus control
                logger.warning("focus_control_not_supported", error=str(e))

            self._picam.start()
            self._sequence = 0
            self._frame_times = []

            logger.info(
                "picamera_opened",
                width=self._width,
                height=self._height,
                fps=self._target_fps,
            )
            return True

        except ImportError as e:
            logger.error("picamera2_not_installed", error=str(e))
            return False
        except Exception as e:
            logger.error("picamera_open_failed", error=str(e))
            self._cleanup()
            return False

    def read(self) -> Optional[Frame]:
        """Capture a single frame from the Pi Camera.

        Returns:
            Frame object with RGB image data converted to BGR for OpenCV
            compatibility, or None if capture fails.
        """
        if not self.is_open():
            return None

        try:
            # Capture frame as numpy array
            # picamera2 returns RGB, we need BGR for OpenCV compatibility
            rgb_array = self._picam.capture_array()

            # Convert RGB to BGR
            bgr_array = rgb_array[:, :, ::-1].copy()

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
            logger.error("picamera_read_failed", error=str(e))
            return None

    def close(self) -> None:
        """Release Pi Camera resources."""
        self._cleanup()
        logger.debug("picamera_closed")

    def _cleanup(self) -> None:
        """Internal cleanup helper."""
        if self._picam is not None:
            try:
                self._picam.stop()
                self._picam.close()
            except Exception:
                pass  # Ignore errors during cleanup
            self._picam = None

    def is_open(self) -> bool:
        """Check if camera is currently open and working.

        Returns:
            True if camera is open and ready to capture
        """
        return self._picam is not None

    @property
    def resolution(self) -> tuple[int, int]:
        """Get current resolution.

        Returns:
            Tuple of (width, height) in pixels
        """
        return (self._width, self._height)

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
