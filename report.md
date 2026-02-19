# APIS Edge (C) — Code Review Report

Date: 2026-01-22  
Scope reviewed: `apis-edge/src/**/*.c`, `apis-edge/hal/**/*.c`, `apis-edge/include/**/*.h`, `apis-edge/CMakeLists.txt`

## Executive summary

The codebase has a clear modular architecture (camera HAL → motion detection → tracking/classification → event logging → clip recording → storage rotation). The biggest risks are:

- **Memory safety / correctness:** the pipeline hard-codes `FRAME_WIDTH/FRAME_HEIGHT` (640×480) but the configuration and camera HAL accept other resolutions, which can lead to **buffer overflows** and undefined behavior.
- **ESP32 readiness:** the current implementation (frame sizes, rolling buffer, SQLite/FFmpeg assumptions, POSIX usage) is not realistically portable to ESP32 without feature gating and alternative storage/recording implementations.
- **Reliability issues:** sleep implementation, logging init order, and storage cleanup arithmetic can cause incorrect behavior or unwanted deletions.

## Functional requirements (verification box)

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Functional requirements (FR) — use as a review checklist                     │
├──────────────────────────────────────────────────────────────────────────────┤
│ FR-1 Startup: load config, create required directories, then initialize logs  │
│      Check: main startup order, log file actually created                     │
│                                                                              │
│ FR-2 Camera: init/open/read returns valid frames (sequence/timestamp)         │
│      Check: camera_init/open/read + frame metadata fields                     │
│                                                                              │
│ FR-3 Resilience: timeouts don’t crash; disconnect triggers bounded reconnect  │
│      Check: main loop failure handling + reconnect delay/backoff              │
│                                                                              │
│ FR-4 Pipeline: each frame → rolling buffer → motion detect → track → classify │
│      Check: ordering in main loop, fixed vs dynamic dimensions consistency    │
│                                                                              │
│ FR-5 Event logging: hornet detections create DB events with correct fields    │
│      Check: sqlite schema + event_logger_log inputs                           │
│                                                                              │
│ FR-6 Clip recording: detection starts/extends clip with pre/post-roll         │
│      Check: clip_recorder_start/feed_frame/extend/stop and output artifacts   │
│                                                                              │
│ FR-7 Storage rotation: over-threshold clips are deleted oldest-first          │
│      Check: storage_manager_needs_cleanup/cleanup + DB clip reference clearing│
│                                                                              │
│ FR-8 Low storage: DB prunes old synced events when free space is low          │
│      Check: event_logger_get_status/prune + periodic trigger                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Findings (problems + remediations)

### CRITICAL-1 — Fixed frame buffer vs configurable camera resolution (buffer overflow risk)

**Evidence**
- Fixed frame buffer: `apis-edge/include/frame.h:15`–`37` (`FRAME_WIDTH/FRAME_HEIGHT` and `frame_t.data[FRAME_SIZE]`).
- Config allows other sizes: `apis-edge/src/config.c:70`–`80` (allows width up to 1920 and height up to 1080).
- Pi YUYV conversion writes based on config: `apis-edge/hal/pi/camera_pi.c:362`–`366` (uses `g_camera.config.width/height`).
- Motion detector assumes fixed size: `apis-edge/src/detection/motion.c:112` (uses `FRAME_WIDTH * FRAME_HEIGHT`).
- ESP32 conversion writes based on runtime fb size: `apis-edge/hal/esp32/camera_esp32.c:174`–`186`.

**Why it matters**
- If config sets width/height ≠ 640×480 (or camera returns a different size), conversion and downstream indexing can write/read beyond `frame->data`, causing **memory corruption** and crashes.

**Remediation**
- Pick one of these approaches and apply consistently across the full pipeline:
  1) **Enforce fixed resolution**: in `config_validate()` clamp width/height to `FRAME_WIDTH/FRAME_HEIGHT` (and reject mismatches early); in camera HAL, validate negotiated `VIDIOC_S_FMT` / `fb->width/height` match.
  2) **Make frames dynamic**: change `frame_t` to hold `uint8_t *data` + `size_t data_len` + width/height, allocate based on negotiated format, and update motion/tracker/encoder to use runtime dimensions (not macros).
- Add defensive checks: validate `buf.index < NUM_BUFFERS` before indexing in `camera_read()`; validate input byte sizes before conversion.

---

### HIGH-1 — ESP32 target is not currently viable (deps + memory + OS assumptions)

**Evidence**
- SQLite included for ESP32: `apis-edge/src/storage/event_logger.c:25`–`28` (`#include <sqlite3.h>` and SPIFFS include).
- Clip recorder claims ESP32 support but only logs: `apis-edge/src/storage/clip_recorder.c:1`–`6` and `apis-edge/src/storage/clip_recorder.c:480`–`482`.
- Rolling buffer stores full raw frames: `apis-edge/include/rolling_buffer.h:11`–`17` and `apis-edge/src/storage/rolling_buffer.c:46`–`79` (allocates `g_max_frames * FRAME_SIZE`).
- Main uses POSIX signals: `apis-edge/src/main.c:30`–`58`.

**Why it matters**
- A 640×480×3 frame is ~0.9MB; buffering/processing multiple frames and running background models is **far beyond typical ESP32 RAM** unless aggressively redesigned (PSRAM + lower res + JPEG).
- The ESP32 build will likely fail or behave incorrectly without a proper ESP-IDF component structure and alternative implementations for storage/recording.

**Remediation**
- Introduce feature flags (e.g., `APIS_FEATURE_SQLITE`, `APIS_FEATURE_FFMPEG`, `APIS_FEATURE_FILESYSTEM`) and provide ESP32-specific implementations:
  - Use `PIXFORMAT_JPEG` on ESP32 and store JPEG frames (or short MJPEG) rather than expanding to BGR.
  - Replace SQLite with a lightweight log (NVS/CBOR lines / ring buffer in flash) or an optional SQLite component if truly required.
  - Replace POSIX signal handling with an RTOS-friendly shutdown mechanism.
- Define an explicit supported feature set per platform in docs and CI-build each target.

---

### HIGH-2 — `apis_sleep_ms()` uses `usleep()` with out-of-range values

**Evidence**
- `apis-edge/include/platform.h:35` defines `apis_sleep_ms(ms)` as `usleep((ms) * 1000)`.
- Reconnect delay uses 30 seconds: `apis-edge/src/main.c:39`–`43` and `apis-edge/src/main.c:109`.

**Why it matters**
- `usleep()` is obsolete and (per POSIX) the argument is expected to be `< 1,000,000` microseconds; passing 30,000,000µs makes behavior **unspecified** (may fail or sleep incorrectly).

**Remediation**
- Replace the macro with an inline function that uses `nanosleep()` on Pi (or loops on `usleep()` in 1s chunks), and keeps the FreeRTOS implementation on ESP32.

---

### HIGH-3 — Logging init order prevents log file creation on first boot

**Evidence**
- Logging initialized before directories exist: `apis-edge/src/main.c:533`–`538`.
- If log file can’t be opened, logger falls back to stdout: `apis-edge/src/log.c:144`–`151`.

**Why it matters**
- On a fresh device, `./logs/` may not exist yet, so logs silently go to stdout instead of the intended file.

**Remediation**
- Call `setup_directories(config)` **before** `init_logging(config)` (or make `log_init()` create the parent directory).

---

### MEDIUM-1 — Logger timestamp generation is not thread-safe; missing header for `strcasecmp`

**Evidence**
- `localtime()` used: `apis-edge/src/log.c:46`. `log_write()` calls it before taking the mutex: `apis-edge/src/log.c:187`–`202`.
- `strcasecmp()` used without `<strings.h>`: `apis-edge/src/log.c:266`.

**Why it matters**
- `localtime()` is not thread-safe; in multi-threaded use, timestamps can be corrupted or wrong.
- Missing header can produce warnings or build failures on stricter toolchains.

**Remediation**
- Use `localtime_r()` (or `gmtime_r()`) and/or move timestamp formatting under the mutex.
- Add `#include <strings.h>` for `strcasecmp()`.

---

### MEDIUM-2 — Camera API semantics and status codes are inconsistent

**Evidence**
- Timeout semantics confusing: `apis-edge/hal/camera.h:61` (“0 = no wait, blocks…”).
- Pi `camera_open()` returns NOT_FOUND for any `open()` failure: `apis-edge/hal/pi/camera_pi.c:149`–`155`.
- ESP32 `camera_close()` clears initialization state: `apis-edge/hal/esp32/camera_esp32.c:241`–`246` (Pi implementation does not).

**Why it matters**
- Callers can’t reliably reason about behavior across platforms (especially reconnect logic).

**Remediation**
- Clarify and enforce consistent semantics:
  - Define `timeout_ms == 0` as either “wait forever” or “non-blocking”; implement the same everywhere.
  - Map `errno` to appropriate status codes (NOT_FOUND vs OPEN_FAILED vs CONFIG_FAILED).
  - Decide whether `camera_close()` preserves initialization or requires re-`camera_init()`; document + implement consistently.

---

### MEDIUM-3 — Camera stats fields exist but are not maintained

**Evidence**
- Pi has `frames_dropped` and `reconnect_count` fields: `apis-edge/hal/pi/camera_pi.c:39`–`51`, but they are never incremented.
- ESP32 stats always set `reconnect_count = 0`: `apis-edge/hal/esp32/camera_esp32.c:226`–`239`.

**Why it matters**
- Telemetry/monitoring will mislead operators (e.g., frames are “never dropped”).

**Remediation**
- Increment `frames_dropped` on timeouts/EAGAINs and buffer overruns.
- Increment `reconnect_count` in `reconnect_camera()` (or in camera module on successful reopen).

---

### MEDIUM-4 — First detection event is not linked to the clip in SQLite

**Evidence**
- Clip path is fetched before recording starts: `apis-edge/src/main.c:462`–`479` (`clip_recorder_get_current_path()` → `event_logger_log()` → then `clip_recorder_start()`).

**Why it matters**
- The first event that triggers a new clip is stored with `clip_file = NULL`, so it’s harder to correlate events to video evidence.

**Remediation**
- Start the clip first (or at least generate the clip path), then insert the event with the correct `clip_file`, OR update the event record after starting the clip.
- Consider updating *all* linked events when the clip finalizes (using `clip_recorder_get_linked_events()`).

---

### HIGH-4 — Storage cleanup arithmetic can underflow; “unlimited” is not handled

**Evidence**
- `needs_cleanup` is set even when `max_size_mb == 0`: `apis-edge/src/storage/storage_manager.c:136`.
- Potential underflow: `target_bytes = (max_size_mb - target_free_mb) ...`: `apis-edge/src/storage/storage_manager.c:266`.

**Why it matters**
- Misconfiguration can cause aggressive deletion (up to deleting every clip).
- `max_size_mb == 0` is a common way to mean “unlimited”, but currently causes “always clean up”.

**Remediation**
- Treat `max_size_mb == 0` as unlimited (never triggers cleanup).
- Validate `target_free_mb <= max_size_mb` and clamp/saturate arithmetic.

---

### MEDIUM-5 — Config values are not consistently applied to modules

**Evidence**
- Clip recorder uses defaults and only sets output dir: `apis-edge/src/main.c:232`–`247` (ignores `config->recording.*`).
- Storage manager uses defaults and only sets clips dir: `apis-edge/src/main.c:249`–`266` (ignores `config->storage.max_storage_mb`, retention, etc).
- DB path is hard-coded to `data_dir/detections.db`: `apis-edge/src/main.c:203`–`206` (ignores `config->storage.db_path`).

**Why it matters**
- `config.yaml` cannot reliably control runtime behavior; operators may think settings applied when they aren’t.

**Remediation**
- Propagate `config_t` settings into module configs (and validate them):
  - recording: pre/post-roll, max duration, format
  - storage: max size, retention, DB path
  - camera: enforce/validate negotiated size, fps

---

### LOW-1 — Clip path buffer sizes mismatch between modules (truncation risk)

**Evidence**
- Event record clip path max is 64: `apis-edge/include/event_logger.h:21` and `:48`.
- Clip recorder paths are up to 128: `apis-edge/include/clip_recorder.h:18` and `:57`.

**Why it matters**
- Paths can be truncated when reading events, reducing traceability.

**Remediation**
- Align `EVENT_CLIP_PATH_MAX` with `CLIP_PATH_MAX` (or use a single shared constant).

---

### LOW-2 — Clip recording ignores encoding errors and can block capture

**Evidence**
- Encoder return values are ignored: `apis-edge/src/storage/clip_recorder.c:468`–`472` and `:507`–`510`.

**Why it matters**
- Encoder failures won’t be surfaced; you may think clips are recorded when they aren’t.
- Writing pre-roll frames inside `clip_recorder_start()` can stall the main capture loop, risking frame drops.

**Remediation**
- Check and handle `encode_frame()` return value (transition to `RECORD_STATE_ERROR`, log, stop).
- Consider moving encoding into a dedicated worker thread/queue so capture is not blocked.
