#!/usr/bin/env python3
"""
APIS Edge Device - Main Entry Point

Orchestrates camera capture, motion detection, and clip recording.
This file ties together all modules from Stories 10.1-10.5.

Usage:
    python main.py                      # Run with default config
    python main.py --config myconfig.yaml  # Run with custom config
"""

import argparse
import signal
import sys
import time
from pathlib import Path

import structlog

from config.settings import get_settings, Settings
from camera import create_camera

# These imports will be added as stories are implemented:
# from detection import MotionDetector, HornetClassifier
# from storage import EventLogger, ClipRecorder


def setup_logging(settings: Settings) -> structlog.BoundLogger:
    """Configure structured logging.

    Args:
        settings: Application settings

    Returns:
        Configured logger instance
    """
    log_path = Path(settings.logging.file)
    log_path.parent.mkdir(parents=True, exist_ok=True)

    # Configure structlog processors
    processors = [
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.UnicodeDecoder(),
    ]

    if settings.logging.format == "json":
        processors.append(structlog.processors.JSONRenderer())
    else:
        processors.append(structlog.dev.ConsoleRenderer())

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )

    return structlog.get_logger("apis")


def setup_directories(settings: Settings) -> None:
    """Ensure required directories exist.

    Args:
        settings: Application settings
    """
    Path(settings.storage.data_dir).mkdir(parents=True, exist_ok=True)
    Path(settings.storage.clips_dir).mkdir(parents=True, exist_ok=True)
    Path(settings.logging.file).parent.mkdir(parents=True, exist_ok=True)


def parse_args() -> argparse.Namespace:
    """Parse command line arguments.

    Returns:
        Parsed arguments
    """
    parser = argparse.ArgumentParser(
        description="APIS Edge Device - Hornet detection system"
    )
    parser.add_argument(
        "--config",
        type=str,
        default="config.yaml",
        help="Path to configuration file (default: config.yaml)",
    )
    return parser.parse_args()


def main() -> int:
    """Main entry point.

    Returns:
        Exit code (0 for success, non-zero for error)
    """
    args = parse_args()
    settings = get_settings(args.config)

    logger = setup_logging(settings)
    setup_directories(settings)

    logger.info("apis_starting", version="0.1.0")

    # Initialize camera with retry support
    camera = create_camera(
        settings.camera.type,
        width=settings.camera.width,
        height=settings.camera.height,
        fps=settings.camera.fps,
        device_id=settings.camera.device_id,
        focus_distance=settings.camera.focus_distance,
        retry_interval=settings.camera.retry_interval,
    )

    # Camera initialization with retry
    retry_interval = settings.camera.retry_interval
    while not camera.open():
        logger.error(
            "camera_open_failed",
            retry_in_seconds=retry_interval,
            camera_type=settings.camera.type,
        )
        time.sleep(retry_interval)

    logger.info(
        "camera_opened",
        width=camera.resolution[0],
        height=camera.resolution[1],
        camera_type=type(camera).__name__,
    )

    # Main loop control
    running = True

    def signal_handler(sig: int, frame) -> None:
        """Handle shutdown signals gracefully."""
        nonlocal running
        logger.info("shutdown_signal_received", signal=sig)
        running = False

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # Main capture loop
    frame_count = 0
    last_fps_report = time.time()
    fps_report_interval = 10  # Report FPS every 10 seconds

    try:
        while running:
            frame = camera.read()

            if frame is None:
                # Camera disconnected or failed
                logger.warning("frame_read_failed", attempting_reconnect=True)

                # Attempt reconnection
                camera.close()
                reconnect_start = time.time()

                while running and not camera.open():
                    elapsed = time.time() - reconnect_start
                    logger.warning(
                        "camera_reconnect_attempt",
                        elapsed_seconds=elapsed,
                        retry_in_seconds=retry_interval,
                    )
                    time.sleep(retry_interval)

                if running:
                    logger.info("camera_reconnected")
                    frame_count = 0
                    last_fps_report = time.time()
                continue

            frame_count += 1

            # Periodic FPS reporting
            now = time.time()
            if now - last_fps_report >= fps_report_interval:
                elapsed = now - last_fps_report
                measured_fps = frame_count / elapsed if elapsed > 0 else 0
                logger.info(
                    "fps_report",
                    frames=frame_count,
                    elapsed_seconds=round(elapsed, 1),
                    measured_fps=round(measured_fps, 1),
                )
                frame_count = 0
                last_fps_report = now

            # TODO: Story 10.2 - Pass to motion detector
            # TODO: Story 10.3 - Size filter and hover detection
            # TODO: Story 10.4 - Log detection events
            # TODO: Story 10.5 - Record clips

    except Exception as e:
        logger.exception("unexpected_error", error=str(e))
        return 1

    finally:
        camera.close()
        logger.info("apis_stopped")

    return 0


if __name__ == "__main__":
    sys.exit(main())
