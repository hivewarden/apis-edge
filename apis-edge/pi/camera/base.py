"""Abstract camera interface for different hardware implementations.

This module defines the base Camera class and Frame dataclass that all
camera implementations must follow.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from typing import Optional
import numpy as np


@dataclass
class Frame:
    """A captured video frame with metadata.

    Attributes:
        data: BGR image array in OpenCV format (numpy array)
        timestamp: ISO 8601 formatted capture time
        sequence: Frame number since camera opened
        width: Frame width in pixels
        height: Frame height in pixels
    """

    data: np.ndarray  # BGR image array (OpenCV format)
    timestamp: str  # ISO 8601 formatted timestamp
    sequence: int  # Frame number since start
    width: int
    height: int

    @classmethod
    def create(
        cls, data: np.ndarray, sequence: int, timestamp: Optional[datetime] = None
    ) -> "Frame":
        """Create a Frame with automatic timestamping.

        Args:
            data: BGR image array
            sequence: Frame sequence number
            timestamp: Optional capture time (defaults to now)

        Returns:
            New Frame instance
        """
        if timestamp is None:
            timestamp = datetime.now()

        height, width = data.shape[:2]
        return cls(
            data=data,
            timestamp=timestamp.isoformat(),
            sequence=sequence,
            width=width,
            height=height,
        )


class Camera(ABC):
    """Abstract camera interface for different hardware.

    All camera implementations (Pi Camera, USB webcam) must inherit from
    this class and implement all abstract methods.

    Typical usage:
        camera = SomeCameraImpl(width=640, height=480, fps=10)
        if camera.open():
            while True:
                frame = camera.read()
                if frame:
                    process(frame)
        camera.close()
    """

    @abstractmethod
    def open(self) -> bool:
        """Initialize and open the camera.

        Returns:
            True if camera opened successfully, False otherwise
        """
        pass

    @abstractmethod
    def read(self) -> Optional[Frame]:
        """Capture a single frame.

        Returns:
            Frame object with image data and metadata, or None on failure
        """
        pass

    @abstractmethod
    def close(self) -> None:
        """Release camera resources.

        Should be safe to call multiple times.
        """
        pass

    @abstractmethod
    def is_open(self) -> bool:
        """Check if camera is currently open and working.

        Returns:
            True if camera is open and ready to capture
        """
        pass

    @property
    @abstractmethod
    def resolution(self) -> tuple[int, int]:
        """Get current resolution.

        Returns:
            Tuple of (width, height) in pixels
        """
        pass

    @property
    @abstractmethod
    def fps(self) -> float:
        """Get current measured FPS.

        Returns:
            Measured frames per second (may differ from target)
        """
        pass

    @property
    @abstractmethod
    def target_fps(self) -> int:
        """Get target FPS setting.

        Returns:
            Target frames per second as configured
        """
        pass
