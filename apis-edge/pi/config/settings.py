"""Unified configuration loader for APIS edge device.

Loads configuration from YAML file with sensible defaults.
All paths are relative to the apis-edge/pi/ directory.
"""

from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional
import yaml


@dataclass
class CameraConfig:
    """Camera configuration settings."""
    type: str = "auto"           # auto, picamera, usb
    width: int = 640             # Frame width
    height: int = 480            # Frame height
    fps: int = 10                # Target FPS
    device_id: int = 0           # USB camera device ID
    focus_distance: float = 1.5  # Pi Camera focus (meters)
    retry_interval: int = 30     # Reconnection retry interval (seconds)


@dataclass
class StorageConfig:
    """Storage path configuration."""
    data_dir: str = "./data"
    clips_dir: str = "./data/clips"
    db_path: str = "./data/detections.db"


@dataclass
class LoggingConfig:
    """Logging configuration."""
    level: str = "INFO"
    file: str = "./logs/apis.log"
    format: str = "json"  # json or text


@dataclass
class Settings:
    """Main settings container with all configuration sections."""
    camera: CameraConfig = field(default_factory=CameraConfig)
    storage: StorageConfig = field(default_factory=StorageConfig)
    logging: LoggingConfig = field(default_factory=LoggingConfig)

    @classmethod
    def load(cls, config_path: str = "config.yaml") -> "Settings":
        """Load settings from YAML file with defaults.

        Args:
            config_path: Path to YAML config file (relative or absolute)

        Returns:
            Settings instance with values from file merged with defaults
        """
        path = Path(config_path)
        if not path.exists():
            # Return defaults if no config file
            return cls()

        with open(path, encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}

        # Merge loaded data with defaults
        camera_data = data.get("camera", {})
        storage_data = data.get("storage", {})
        logging_data = data.get("logging", {})

        return cls(
            camera=CameraConfig(**camera_data),
            storage=StorageConfig(**storage_data),
            logging=LoggingConfig(**logging_data),
        )


# Global settings instance (singleton pattern)
_settings: Optional[Settings] = None


def get_settings(config_path: str = "config.yaml") -> Settings:
    """Get or load global settings instance.

    Args:
        config_path: Path to config file (only used on first call)

    Returns:
        Shared Settings instance
    """
    global _settings
    if _settings is None:
        _settings = Settings.load(config_path)
    return _settings


def reset_settings() -> None:
    """Reset global settings (useful for testing)."""
    global _settings
    _settings = None
