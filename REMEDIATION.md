# Remediation Ledger

Single source of truth for all bugs, review findings, and technical debt.

## Engineering Epics

| Code | Epic | Description |
|------|------|-------------|
| SAFETY | Safety & Security Boundaries | Laser safety interlocks, buffer overflows, input validation, API key handling, credential storage |
| MEMORY | Memory & Resource Safety | Buffer overflows, PSRAM allocation errors, stack overflow risks, memory leaks, use-after-free |
| CONCURRENCY | Concurrency & Synchronization | Race conditions, deadlocks, missing mutex guards, FreeRTOS task safety, shared state |
| STATE | State Machine & Workflow Correctness | Device lifecycle states, missing transitions, unreachable paths, dead code, stubs |
| COMMS | Communications & Protocol | Server comm, TLS validation, mDNS, WiFi provisioning, API contract mismatches |
| TEST | Test Coverage & Quality | Missing tests, flaky tests, mock HAL gaps, untested edge cases |

## Status Values

| Status | Meaning |
|--------|---------|
| open | Known issue, not yet fixed |
| in-progress | Fix underway |
| verified-fixed | Fix applied, tested, confirmed working |
| partial | Fix started but incomplete |
| wont-fix | Intentional behavior or out of scope |
| not-reproducible | Cannot reproduce, monitoring |
| superseded | Replaced by another finding |

---

## Issue Tracking

| RC | Issue Link | Status |
|----|------------|--------|

---

## Consolidation Status

| Source | Total Findings | In Ledger | Gap |
|--------|---------------|-----------|-----|

---

## Findings

### SAFETY — Safety & Security Boundaries

| ID | Date | Sev | Context | Summary | Status | Fixed In | Notes |
|----|------|-----|---------|---------|--------|----------|-------|
| R-001 | 2026-03-16 | MED | src/log.c:200 | `log_write` indexes `LEVEL_NAMES[level]` without bounds check — if level is out of range (negative via cast or corrupt), this is OOB read. `log_level_str()` at line 264 has a bounds check but `log_write` does not | open | | |
| R-002 | 2026-03-16 | MED | src/config/config_manager.c:690 | `config_manager_save` puts full API key in `char json[4096]` on stack; `memset(json, 0, ...)` at line 750 is non-volatile and could theoretically be optimized away. Should use `secure_clear()` from `secure_util.h` for consistency | verified-fixed | 11d2c85 | Pattern: sensitive-data-on-stack |
| R-003 | 2026-03-16 | LOW | src/config.c:221-225 | YAML parser uses `atoi()` for uint16/uint8 fields (width, height, fps) — `atoi` has no error detection, returns 0 on non-numeric input, and negative values silently wrap when cast to unsigned types | open | | Pattern: atoi-no-validation |
| R-021 | 2026-03-16 | MED | src/qr/qr_scanner.c:518 | `qr_scanner_parse_payload` uses 512-byte stack buffer `buf` for QR payload — safe for current 256-byte field limits but any future field enlargement could cause stack overflow on ESP32 tasks with tight stacks | open | | Pattern: stack-buffer-near-limit |
| R-022 | 2026-03-16 | MED | src/storage/storage_manager.c:53 | `g_uploaded_clips` is a 25.6KB static array (100 * 256 bytes) allocated in BSS — on ESP32 this consumes ~8% of internal SRAM unconditionally even when storage manager is never initialized | open | | Pattern: static-large-array-esp32 |
| R-023 | 2026-03-16 | MED | src/storage/event_logger.c:424 | `event_logger_get_events` uses `SQLITE_STATIC` for caller-provided `since_timestamp` and `until_timestamp` strings — if the caller's buffer is stack-local and freed before SQLite reads, this is use-after-free | verified-fixed | 11d2c85 | Pattern: sqlite-binding-lifetime |
| R-024 | 2026-03-16 | MED | src/storage/event_logger.c:734 | `event_logger_clear_clip_reference` uses `SQLITE_STATIC` for `clip_path` — if called from storage_manager callback with a stack-local path, the binding may reference freed memory during step() | verified-fixed | 11d2c85 | Pattern: sqlite-binding-lifetime |
| R-041 | 2026-03-16 | MED | src/deterrent/deterrent_state.c:274 | `export_annotated_frame_locked()` calls `malloc(sizeof(*annotated))` for `frame_t` which includes full pixel data. On ESP32 with ~300KB internal SRAM, this should use `heap_caps_malloc(MALLOC_CAP_SPIRAM)` to avoid TLSF heap exhaustion. Violates "design for ESP32" principle | verified-fixed | RC-001 | Pattern: large-alloc-not-psram |
| R-042 | 2026-03-16 | MED | src/laser/targeting.c:299 | `calculate_sweep_offset` casts `period_ms` float to `uint64_t` for modulo. If `period_ms` truncates to 0 after float-to-int conversion, `elapsed % 0` is undefined behavior (division-by-zero crash on ESP32) | open | | |
| R-043 | 2026-03-16 | MED | src/deterrent/shadow_lane_gate.c:20 | `quiet_until_ms` is `uint32_t` — wraps at ~49 days. Comparison `quiet_until_ms > now_ms` produces wrong result after wrap: lane appears still cooling when it should have expired. Use elapsed-time pattern instead | superseded | | shadow_lane_gate.c removed in repo split |
| R-048 | 2026-03-16 | LOW | src/laser/laser_controller.c:421-430 | `laser_controller_off()` transitions to `OFF` (skipping cooldown) when disarmed. A disarm-while-active followed by immediate re-arm allows re-activation without the 5-second cooldown — cooldown bypass via arm/disarm toggle | open | | |

### MEMORY — Memory & Resource Safety

| ID | Date | Sev | Context | Summary | Status | Fixed In | Notes |
|----|------|-----|---------|---------|--------|----------|-------|
| R-004 | 2026-03-16 | MED | src/main.c:118 | `apis_preallocate_frame` uses plain `malloc(sizeof(frame_t))` — frame_t contains FRAME_SIZE data (up to 691KB). On ESP32 this should use `heap_caps_malloc(MALLOC_CAP_SPIRAM)` to avoid exhausting internal SRAM. The comment says "Pre-allocate large PSRAM buffers" but the code does not actually allocate from PSRAM | verified-fixed | RC-001 | Pattern: large-alloc-not-psram |
| R-005 | 2026-03-16 | MED | src/main.c:641 | Fallback `malloc(sizeof(frame_t))` in `run_capture_loop` — same issue as R-004, plain malloc for large frame_t on non-ESP32 platforms is fine but on ESP32 fallback path this could exhaust internal heap | verified-fixed | RC-001 | Pattern: large-alloc-not-psram |
| R-025 | 2026-03-16 | HIGH | src/detection/classifier.c:113 | `analyze_hover` declares `track_position_t history[MAX_TRACK_HISTORY]` (30 * 8 = 240 bytes) on stack; called again at line 214 for non-hornet objects — two calls per classifier_classify invocation can consume 480 bytes of stack per iteration, risky on small ESP32 task stacks | open | | Pattern: stack-array-in-hot-path |
| R-026 | 2026-03-16 | MED | src/storage/rolling_buffer.c:64-65 | `rolling_buffer_init` allocates frame data buffers with `malloc(FRAME_SIZE)` — on ESP32, FRAME_SIZE = 640*360*3 = 691,200 bytes per frame, 20 frames = ~13.8MB total. This MUST use `heap_caps_malloc(MALLOC_CAP_SPIRAM)` for ESP32, but uses generic `malloc` relying on CONFIG_SPIRAM_USE_MALLOC auto-routing which may not be configured | verified-fixed | RC-001 | Pattern: large-alloc-not-psram |
| R-027 | 2026-03-16 | MED | src/storage/rolling_buffer.c:302-303 | `rolling_buffer_alloc_frames` also allocates FRAME_SIZE buffers via `malloc` — same PSRAM concern as R-026 for caller-allocated frames | verified-fixed | RC-001 | Pattern: large-alloc-not-psram |
| R-028 | 2026-03-16 | LOW | src/detection/motion.c:58-60 | `alloc_buffer` uses plain `malloc` for buffers including `g_background_float` (FRAME_WIDTH*FRAME_HEIGHT*4 = ~1.2MB on Pi, ~921KB on ESP32) — comment says ESP32 auto-routes to PSRAM but this depends on `CONFIG_SPIRAM_USE_MALLOC` being enabled in sdkconfig, which is not verified at compile time | verified-fixed | RC-001 | Pattern: large-alloc-not-psram |
| R-029 | 2026-03-16 | LOW | src/qr/qr_scanner.c:84 | `ensure_source_gray_capacity` uses `malloc` for grayscale buffer (up to 640*480 = 307KB) — should use PSRAM-aware allocation on ESP32 | verified-fixed | RC-001 | Pattern: large-alloc-not-psram |

### CONCURRENCY — Concurrency & Synchronization

| ID | Date | Sev | Context | Summary | Status | Fixed In | Notes |
|----|------|-----|---------|---------|--------|----------|-------|
| R-006 | 2026-03-16 | HIGH | src/config/config_manager.c:817-820 | `config_manager_init` reads `g_runtime_config.device.id`, `.armed`, `.needs_setup` in LOG_INFO after CONFIG_UNLOCK — data race if another thread calls config_manager_update concurrently (unlikely at init, but the pattern is unsafe) | verified-fixed | 553678b | Pattern: read-after-unlock |
| R-007 | 2026-03-16 | HIGH | src/config/config_manager.c:832-836 | `config_manager_get()` returns raw pointer to `g_runtime_config` without any locking — any caller reading through this pointer has a data race with writers. Marked DEPRECATED but still present and callable | open | | Pattern: unprotected-shared-state |
| R-008 | 2026-03-16 | MED | src/led/led_controller.c:67-73 | LED globals `g_initialized`, `g_running`, `g_active_states`, `g_detection_flash_end` are `volatile` but accessed from multiple threads without mutex in some paths — `volatile` alone does not guarantee atomicity on 32-bit platforms for 64-bit `g_detection_flash_end` (not atomic on ESP32 Xtensa). `g_running` is set in cleanup without lock while pattern thread reads it | open | | Pattern: volatile-not-atomic |
| R-009 | 2026-03-16 | MED | src/led/led_controller.c:416-417 | `led_controller_init` sets `g_initialized = true` outside the LED mutex — pattern thread starts before this flag is set, creating a window where `led_controller_set_state` calls are silently dropped | open | | |
| R-010 | 2026-03-16 | MED | src/button/button_handler.c:477-478 | `button_handler_update` reads `ctx.initialized` without lock at line 478 — if another thread calls `button_handler_cleanup` concurrently, this is a data race on the initialized flag | verified-fixed | c0dde57 | Pattern: init-flag-no-lock |
| R-011 | 2026-03-16 | MED | src/button/button_handler.c:660-662 | `button_handler_is_initialized` reads `ctx.initialized` without lock — same pattern as R-010, concurrent cleanup creates a race | verified-fixed | c0dde57 | Pattern: init-flag-no-lock |
| R-012 | 2026-03-16 | LOW | src/led/led_controller.c:575-577 | `led_controller_is_initialized` reads `g_initialized` without lock — same volatile-but-not-atomic pattern | verified-fixed | c0dde57 | Pattern: init-flag-no-lock |
| R-030 | 2026-03-16 | HIGH | src/detection/tracker.c:21-23 | `tracker_state_t g_state`, `g_config`, `g_initialized` accessed without mutex — `tracker_update`, `tracker_get_history`, `tracker_get_object` can race if called from different threads (e.g., detection thread vs HTTP status query) | verified-fixed | RC-004 | Pattern: missing-mutex-global-state |
| R-031 | 2026-03-16 | HIGH | src/detection/classifier.c:19-20 | `classifier_classify` reads `g_config` and `g_initialized` without mutex — races possible if classifier_init/cleanup called from a different thread than classify | verified-fixed | RC-004 | Pattern: missing-mutex-global-state |
| R-032 | 2026-03-16 | MED | src/detection/motion.c:33-50 | All motion detection global state unprotected by mutex — documented single-thread-only, but `motion_reset_background` (line 496) could be called from HTTP control task while detection thread is in `motion_detect`, corrupting background model | verified-fixed | RC-004 | Pattern: missing-mutex-global-state |
| R-033 | 2026-03-16 | MED | src/qr/qr_scanner.c:23-30 | QR scanner uses `volatile bool g_initialized` but no mutex — `qr_scanner_cleanup` can race with `qr_scanner_scan_frame`/`qr_scanner_process`, causing use-after-free of `g_qr` or `g_source_gray` | verified-fixed | RC-004 | Pattern: volatile-not-mutex |
| R-034 | 2026-03-16 | MED | src/storage/clip_recorder.c:1121-1126 | `clip_recorder_get_current_path` returns pointer to internal `g_current_clip` after releasing mutex — buffer can be overwritten by another thread starting a new clip before caller copies the string | open | | Pattern: return-internal-ptr-after-unlock |
| R-044 | 2026-03-16 | HIGH | src/laser/targeting.c:631 | `targeting_update()` reads `g_state` after `TARGET_UNLOCK()` to pass to `st_cb3` callback. State can change between unlock and read, delivering wrong state to callback consumer. Must capture state into local var before unlocking | verified-fixed | 553678b | Pattern: read-after-unlock |
| R-045 | 2026-03-16 | HIGH | src/laser/laser_controller.c:869 | `laser_controller_cleanup()` sets `g_initialized = false` AFTER releasing the lock (line 861). Between unlock and this assignment, another thread can see `g_initialized == true`, acquire the lock, and call `gpio_set_laser(true)` on already-cleaned-up GPIO — use-after-cleanup race | verified-fixed | 553678b | Pattern: cleanup-race |
| R-046 | 2026-03-16 | MED | src/laser/laser_controller.c:370-371 | `laser_controller_on()` logs `get_cooldown_remaining_internal()` AFTER `LASER_UNLOCK()` on line 369. Reads `g_deactivation_time` without the lock, racing with concurrent writes. Log may show incorrect cooldown value | verified-fixed | 553678b | Pattern: read-after-unlock |
| R-047 | 2026-03-16 | MED | src/laser/coordinate_mapper.c:239-241 | `coord_mapper_load_calibration()` logs `g_calibration` fields after `COORD_UNLOCK()`. Reads of shared state without the lock are a data race, though impact is limited to incorrect log output | verified-fixed | 553678b | Pattern: read-after-unlock |
| R-121 | 2026-03-16 | MED | src/laser/targeting.c:752-774 | `targeting_cleanup()` deletes ESP32 mutex BEFORE setting `g_initialized = false` — if another thread checks `g_initialized` (true) then tries to lock the deleted mutex, undefined behavior | open | | Pattern: cleanup-race |
| R-122 | 2026-03-16 | MED | src/laser/targeting.c:392-524 | `targeting_update()` holds TARGET_LOCK while calling laser/servo APIs that acquire their own locks. Implicit lock ordering (TARGET→LASER, TARGET→SERVO) — deadlock risk if reverse path ever added | open | | Pattern: implicit-lock-ordering |
| R-123 | 2026-03-16 | MED | src/button/button_handler.c:305-308 | `button_handler` holds BUTTON_LOCK while calling LED/laser APIs. Same implicit lock ordering concern (BUTTON→LED, BUTTON→LASER) | open | | Pattern: implicit-lock-ordering |
| R-124 | 2026-03-16 | LOW | src/laser/targeting.c (multiple) | All targeting functions read `g_initialized` without lock as early-return guard. TOCTOU race with R-121 cleanup | open | | Pattern: init-flag-no-lock |
| R-125 | 2026-03-16 | LOW | src/laser/coordinate_mapper.c:665-681 | Same cleanup-race as R-121 — deletes mutex before clearing init flag | open | | Pattern: cleanup-race |

### STATE — State Machine & Workflow Correctness

| ID | Date | Sev | Context | Summary | Status | Fixed In | Notes |
|----|------|-----|---------|---------|--------|----------|-------|
| R-013 | 2026-03-16 | MED | src/main.c:1613-1614 | AP timeout standalone fallback calls `motion_init(NULL)` — passing NULL config pointer may crash depending on motion_init implementation; should pass `&motion_cfg` with defaults like the normal path does | superseded | | AP timeout fallback path removed in repo split |
| R-014 | 2026-03-16 | MED | src/main.c:1714-1715 | After mDNS/default/fallback discovery, `config_manager_get_public(&cfg_snap)` masks api_key to "***" — the check `strlen(cfg_snap.server.api_key) == 0` on line 1715 will be FALSE for any claimed device since the masked value "***" has length 3, meaning the unclaimed check is always wrong for the public snapshot. However, this only matters if the api_key was already set, so it works by coincidence | open | | Pattern: masked-field-check |
| R-015 | 2026-03-16 | LOW | src/main.c:1482-1484 | `main()` ignores argc/argv — the `config_load(NULL)` hardcodes "config.yaml". No way to specify a different config file path from the command line on Pi platform | open | | |
| R-016 | 2026-03-16 | LOW | src/config/config_manager.c:1417-1422 | `config_manager_cleanup` sets `g_initialized = false` outside the lock — concurrent calls to config_manager functions that check `g_initialized` could see stale state | verified-fixed | 553678b | Pattern: init-flag-no-lock |
| R-035 | 2026-03-16 | MED | src/storage/clip_recorder.c:1044-1046 | `clip_recorder_feed_capture` does not handle `RECORD_STATE_ERROR` — if encoder fails mid-clip (sets state to ERROR at line 1045), subsequent `feed_capture` calls silently drop frames without recovery or finalization | open | | |
| R-036 | 2026-03-16 | LOW | src/storage/storage_manager.c:157 | `storage_manager_get_stats` only counts `.mp4` files but ESP32 uses `.avi` extension — on ESP32, `get_stats` will always report 0 clips, preventing cleanup from triggering | open | | Pattern: mp4-only-file-filter |
| R-037 | 2026-03-16 | LOW | src/storage/storage_manager.c:256 | `storage_manager_cleanup` also only scans for `.mp4` — same ESP32 `.avi` blind spot as R-036, cleanup will never delete ESP32 clips | open | | Pattern: mp4-only-file-filter |

### COMMS — Communications & Protocol

| ID | Date | Sev | Context | Summary | Status | Fixed In | Notes |
|----|------|-----|---------|---------|--------|----------|-------|
| R-061 | 2026-03-16 | CRIT | src/tls/tls_client.c:62-75 | ESP32 TLS path sets `timeout_ms` but never assigns `crt_bundle_attach` or any CA certificate — connections proceed with no server identity verification, enabling full MITM of heartbeat and clip-upload traffic. Pi/test mbedTLS path sets `MBEDTLS_SSL_VERIFY_REQUIRED` (line 168) but never calls `mbedtls_x509_crt_parse` or `mbedtls_ssl_conf_ca_chain`, so verification will always fail or be silently skipped | verified-fixed | 11d2c85 | Pattern: missing-cert-validation |
| R-062 | 2026-03-16 | HIGH | src/http/http_server.c:436 | `init_local_auth_token` logs the full auth token: `LOG_INFO("Local auth token: %s", g_local_auth_token)`. On ESP32 UART output is visible to anyone with physical serial access; on Pi the token persists in log files. Credential exposure via log | verified-fixed | 11d2c85 | Pattern: credential-in-log |
| R-063 | 2026-03-16 | HIGH | src/http/http_server.c:447-448 | `verify_local_auth` returns `true` when `g_local_auth_token[0] == '\0'` — if `init_local_auth_token` fails (RNG failure, HAL error), every request passes auth. Auth bypass on token generation failure | verified-fixed | 11d2c85 | |
| R-064 | 2026-03-16 | MED | src/server/server_comm.c:70-86 | `apis_timegm` sets `TZ=""` via `setenv`/`tzset`, calls `mktime`, then restores TZ. `setenv`/`tzset` modify process-global state — if another thread calls `localtime_r` or `mktime` concurrently, it sees the wrong timezone. Not thread-safe | open | | Pattern: global-env-mutation |
| R-065 | 2026-03-16 | MED | src/server/server_comm.c:230-241 | TLS response path calls `tls_read()` once and treats the result as the complete response. HTTP responses can be fragmented across multiple TCP segments; a large JSON heartbeat response or slow network could return a partial read, causing JSON parse failure or truncated status | verified-fixed | RC-007 | Pattern: single-recv-partial-response |
| R-066 | 2026-03-16 | MED | src/server/journal_sync.c:141 | `journal_sync_task` declares `char response[JOURNAL_SYNC_HTTP_BUFFER]` (8192 bytes) on stack inside a FreeRTOS task with 12288-byte stack. Combined with other locals and call depth (~200+ bytes for `build_payload` locals), peak stack usage approaches ~10KB of 12KB limit — ~83% utilization with no safety margin | verified-fixed | RC-006 | Pattern: large-stack-buffer-net-task |
| R-067 | 2026-03-16 | MED | src/server/journal_sync.c:153-155 | After `config_manager_get_snapshot`, `api_key` is copied to local `char api_key[]` then the snapshot is used. When the function exits, `api_key` remains on stack without `secure_clear()` — sensitive credential left in uncleared stack memory | verified-fixed | 11d2c85 | Pattern: api-key-not-cleared |
| R-068 | 2026-03-16 | MED | src/server/journal_sync.c:221 | Plain HTTP path uses single `recv()` call for server response — same partial-read issue as R-065 but for the non-TLS path | verified-fixed | RC-007 | Pattern: single-recv-partial-response |
| R-069 | 2026-03-16 | MED | src/server/journal_sync.c:185-190 | No HTTPS-downgrade refusal check — `server_comm.c` refuses to send API key over plain HTTP (line 170), but `journal_sync` will send telemetry journal payloads (which contain encounter IDs and clip IDs) over plain HTTP without warning | open | | |
| R-070 | 2026-03-16 | MED | src/upload/clip_uploader.c:581-620 | `do_upload` declares `char http_header[1024]`, `char body_header[1536]`, and `char response[8192]` on stack — combined ~10.7KB in a task with configurable but typically 8-12KB stack. Stack overflow risk under deep call chains (TLS handshake adds ~2KB) | verified-fixed | RC-006 | Pattern: large-stack-buffer-net-task |
| R-071 | 2026-03-16 | MED | src/upload/clip_uploader.c:746-747 | TLS upload response uses single `tls_read()` — same partial-read risk as R-065. Server response confirming upload success could be truncated, causing retry of already-successful uploads | verified-fixed | RC-007 | Pattern: single-recv-partial-response |
| R-072 | 2026-03-16 | LOW | src/dns/captive_dns.c:89-120 | `build_dns_response` copies the DNS question section into a 528-byte response buffer then appends a 16-byte answer record. If the question section is near 512 bytes (max DNS UDP), the answer write overflows the buffer. Unlikely with normal queries but possible with crafted packets | open | | |
| R-073 | 2026-03-16 | LOW | src/http/http_server.c:460-475 | `http_rate_limit.c` state is not self-protected by a mutex — it relies on callers holding `HTTP_LOCK`. If any future HTTP path calls rate-limit functions without the lock, the per-IP counters have data races. Fragile implicit contract | open | | |
| R-074 | 2026-03-16 | LOW | src/server/journal_sync.c:57 | `build_payload` declares `telemetry_journal_entry_t entries[JOURNAL_SYNC_MAX_ENTRIES]` on stack — at 20 entries x ~300 bytes each = ~6KB, adding to the already-pressured 12KB task stack from R-066 | verified-fixed | RC-006 | Pattern: large-stack-buffer-net-task |
| R-075 | 2026-03-16 | LOW | src/upload/clip_uploader.c:890-900 | API key from config snapshot is copied to local buffer but not `secure_clear()`'d before function return — same pattern as R-067, credential residue on stack | verified-fixed | 11d2c85 | Pattern: api-key-not-cleared |
| R-076 | 2026-03-16 | LOW | src/server/server_comm.c:115-120 | API key from `config_manager_get_snapshot` stored in local `api_key` buffer, not cleared with `secure_clear()` on function exit — consistent with R-067/R-075 pattern across all three network modules | verified-fixed | 11d2c85 | Pattern: api-key-not-cleared |

### TEST — Test Coverage & Quality

| ID | Date | Sev | Context | Summary | Status | Fixed In | Notes |
|----|------|-----|---------|---------|--------|----------|-------|
| R-081 | 2026-03-16 | HIGH | CMakeLists.txt:154-308 | 6 test targets (test_camera, test_motion, test_tracker, test_classifier, test_event_logger, test_clip_recorder) only build when `NOT APIS_PLATFORM STREQUAL "test"` — they are excluded from CI/test builds entirely. Detection pipeline (tracker, classifier, motion) has zero CI coverage | verified-fixed | 08b8c91 | Pattern: tests-excluded-from-ci |
| R-082 | 2026-03-16 | MED | tests/test_safety_layer.c:51-57 | RUN_TEST macro unconditionally increments `tests_passed` and prints PASS after calling test function — if TEST_ASSERT fails and returns early, the test is still counted as passed. Masks real failures in safety-critical test suite | verified-fixed | 6db83cc | Pattern: run-test-always-pass |
| R-083 | 2026-03-16 | MED | tests/test_button_handler.c (RUN_TEST macro) | Same RUN_TEST always-pass bug as R-082 — test_button_handler.c defines its own RUN_TEST that always increments tests_passed after test_func() returns, regardless of whether TEST_ASSERT fired | verified-fixed | 6db83cc | Pattern: run-test-always-pass |
| R-084 | 2026-03-16 | MED | tests/test_server_comm.c:30-38 | TEST_ASSERT macro does not return on failure — both PASS and FAIL branches increment their counters but execution continues to subsequent assertions. A failing assertion does not abort the test, so later assertions may operate on invalid state and produce misleading results | verified-fixed | 6db83cc | Pattern: test-assert-no-early-return |
| R-085 | 2026-03-16 | MED | tests/test_servo_controller.c:22-30 | Same non-aborting TEST_ASSERT pattern as R-084 — test continues after failure, subsequent assertions may be meaningless | verified-fixed | 6db83cc | Pattern: test-assert-no-early-return |
| R-086 | 2026-03-16 | MED | tests/test_targeting.c:29-37 | Same non-aborting TEST_ASSERT pattern as R-084 — targeting tests continue after assertion failures | verified-fixed | 6db83cc | Pattern: test-assert-no-early-return |
| R-087 | 2026-03-16 | MED | tests/test_edge_telemetry.c:12-20 | Same non-aborting TEST_ASSERT pattern as R-084 — edge telemetry tests continue after assertion failures | not-reproducible | | File does not exist in repository |
| R-088 | 2026-03-16 | MED | tests/test_shadow_lane_gate.c:8-16 | Same non-aborting TEST_ASSERT pattern as R-084 — shadow lane gate tests continue after assertion failures | not-reproducible | | File does not exist in repository |
| R-089 | 2026-03-16 | MED | tests/test_clip_uploader.c (TEST_ASSERT macro) | Same non-aborting TEST_ASSERT pattern as R-084 — clip uploader tests continue after assertion failures | verified-fixed | 6db83cc | Pattern: test-assert-no-early-return |
| R-090 | 2026-03-16 | LOW | hal/esp32/camera_esp32.c:129 | `ensure_qr_preview_capacity()` uses `malloc()` for QR preview buffer instead of `heap_caps_malloc(MALLOC_CAP_SPIRAM)` — QR preview at QVGA is 320*240*3 = 230KB, dangerously large for internal SRAM on ESP32 | verified-fixed | RC-001 | Pattern: large-alloc-not-psram |
| R-091 | 2026-03-16 | MED | hal/esp32/camera_esp32.c:update_last_qr_frame() | Lock-free odd/even versioning for QR frame sharing — writer sets version to odd, copies data, sets version to even. Reader checks version before and after memcpy. On ESP32 Xtensa with no memory barriers between version write and memcpy, compiler or CPU reordering can produce torn reads. Needs `__sync_synchronize()` or volatile stores | open | | Pattern: lock-free-no-barrier |
| R-092 | 2026-03-16 | LOW | hal/pi/camera_pi.c:camera_read_capture() | `camera_read_capture` does not populate the `jpeg_frame` output parameter — initializes it to empty (data=NULL, size=0) without any actual JPEG encoding. Callers expecting JPEG data from Pi platform will silently get nothing | superseded | | camera_read_capture function removed |
| R-093 | 2026-03-16 | LOW | platforms/esp32/main/CMakeLists.txt:106-113 | ESP32 build suppresses `-Wno-maybe-uninitialized` and `-Wno-format-truncation` warnings — these can mask real bugs. `-Wno-maybe-uninitialized` in particular can hide use of uninitialized variables in safety-critical code paths | open | | Pattern: suppressed-warnings |
| R-094 | 2026-03-16 | MED | tests/test_safety_layer.c:20-21 | test_safety_layer.c force-defines `APIS_PLATFORM_TEST` at line 20-21 even though it should be set by the build system — if the build system changes, this hardcoded define may conflict or mask platform detection issues | open | | Pattern: hardcoded-platform-define |
| R-095 | 2026-03-16 | LOW | tests/test_deterrent_state.c (single test) | test_deterrent_state has only 1 test function covering snapshot and export — no tests for state transitions, concurrent access, or edge cases in the deterrent state machine. Minimal coverage for a module that gates laser activation decisions | superseded | | test_deterrent_state.c removed in repo split |
| R-096 | 2026-03-16 | LOW | tests/test_edge_telemetry.c (single test) | test_edge_telemetry has only 1 test function — no tests for journal overflow, concurrent detection events, error paths, or telemetry journal batch edge cases | superseded | | test_edge_telemetry.c removed in repo split |

---

## Root Cause Clusters

### RC-001: large-alloc-not-psram

**Findings:** R-004, R-005, R-026, R-027, R-028, R-029, R-041, R-090
**Epic:** MEMORY
**Root Cause:** Large allocations (100KB–13.8MB) use plain `malloc()` instead of `heap_caps_malloc(MALLOC_CAP_SPIRAM)`. The code relies on ESP-IDF's `CONFIG_SPIRAM_USE_MALLOC` auto-routing, which may not be configured and is not verified at compile time. On ESP32 with only ~300KB internal SRAM, these allocations exhaust the heap and trigger TLSF assert crashes.
**Architectural Fix:** Create a `psram_alloc.h` helper macro/inline that wraps allocation: on ESP32 platform, uses `heap_caps_malloc(MALLOC_CAP_SPIRAM)` for any allocation >10KB; on other platforms, falls back to `malloc`. Replace all 8 call sites. Add a compile-time assert in the ESP32 platform build that verifies `CONFIG_SPIRAM_USE_MALLOC` is enabled as a safety net.
**Scope:** src/main.c, src/storage/rolling_buffer.c, src/detection/motion.c, src/qr/qr_scanner.c, src/deterrent/deterrent_state.c, hal/esp32/camera_esp32.c
**Effort:** S
**Risk:** Low — straightforward wrapper, no behavioral change
**Status:** verified-fixed

### RC-002: read-after-unlock

**Findings:** R-006, R-044, R-046, R-047
**Epic:** CONCURRENCY
**Root Cause:** Multiple modules read shared global state (for logging or callback arguments) AFTER releasing the mutex. The pattern is: lock → modify → unlock → read for log/callback. Between unlock and read, another thread can modify the state, causing stale/incorrect values. In targeting.c (R-044) this delivers wrong state to safety-critical callbacks.
**Architectural Fix:** Establish a project-wide convention: capture any values needed after unlock into local variables BEFORE unlocking. For each affected site, copy the relevant fields to stack locals inside the critical section, then use the locals for logging/callbacks after unlock.
**Scope:** src/config/config_manager.c, src/laser/targeting.c, src/laser/laser_controller.c, src/laser/coordinate_mapper.c
**Effort:** S
**Risk:** Low — mechanical refactor, no API changes
**Status:** verified-fixed

### RC-003: init-flag-no-lock

**Findings:** R-010, R-011, R-012, R-016, R-045
**Epic:** CONCURRENCY
**Root Cause:** Module init/cleanup functions set or read `g_initialized` flags outside their mutex. Concurrent calls to module functions that check this flag can see stale state, leading to use-after-cleanup races. The worst case is R-045 (laser_controller) where GPIO hardware can be accessed after cleanup.
**Architectural Fix:** For each affected module, ensure `g_initialized` is always read and written under the module's mutex. For cleanup functions, set `g_initialized = false` INSIDE the critical section BEFORE releasing resources. For `is_initialized()` query functions, acquire the lock, read the flag, release the lock.
**Scope:** src/button/button_handler.c, src/led/led_controller.c, src/config/config_manager.c, src/laser/laser_controller.c
**Effort:** S
**Risk:** Low — adding lock around flag access
**Status:** verified-fixed

### RC-004: missing-mutex-global-state

**Findings:** R-030, R-031, R-032, R-033
**Epic:** CONCURRENCY
**Root Cause:** Four modules (tracker, classifier, motion, QR scanner) have global state with zero mutex protection. They were written assuming single-thread access, but the HTTP control API can call `motion_reset_background` or query tracker/classifier state from a different task, creating data races and potential use-after-free.
**Architectural Fix:** Add a module-level mutex to each of the 4 modules following the same pattern used in config_manager (lock/unlock macros). Protect all access to global state. For motion module, add a mutex around `motion_detect` and `motion_reset_background`. For QR scanner, replace `volatile bool` with proper mutex.
**Scope:** src/detection/tracker.c, src/detection/classifier.c, src/detection/motion.c, src/qr/qr_scanner.c
**Effort:** M
**Risk:** Medium — adding locks to hot path could affect detection frame rate; must verify no deadlock with existing locks
**Status:** verified-fixed

### RC-005: test-assert-no-early-return

**Findings:** R-082, R-083, R-084, R-085, R-086, R-087, R-088, R-089
**Epic:** TEST
**Root Cause:** Two different broken test macro patterns: (1) `RUN_TEST` macro always counts test as passed regardless of assertion failures (R-082, R-083). (2) `TEST_ASSERT` macro doesn't `return` on failure — execution continues with invalid state, producing misleading results (R-084–R-089). Both patterns mask real test failures.
**Architectural Fix:** Create a single shared `test_framework.h` (or fix the existing one) with correct macros: `TEST_ASSERT` must `return` on failure. `RUN_TEST` must check a test-level failure flag before counting pass. Replace all per-file macro definitions with `#include "test_framework.h"`. This also prevents future test files from redefining broken macros.
**Scope:** tests/test_safety_layer.c, tests/test_button_handler.c, tests/test_server_comm.c, tests/test_servo_controller.c, tests/test_targeting.c, tests/test_edge_telemetry.c, tests/test_shadow_lane_gate.c, tests/test_clip_uploader.c
**Effort:** M
**Risk:** Medium — fixing assertions may reveal currently-hidden test failures that need investigation
**Status:** verified-fixed (6db83cc). R-087/R-088 files do not exist — marked not-reproducible. Fix exposed 2 pre-existing failures in test_targeting.

### RC-006: large-stack-buffer-net-task

**Findings:** R-066, R-070, R-074
**Epic:** COMMS
**Root Cause:** Network tasks (journal_sync, clip_uploader) declare 8–11KB of buffers on stack inside FreeRTOS tasks with 8–12KB stacks. Combined with TLS handshake call depth (~2KB), peak usage exceeds safe limits. Stack overflow on ESP32 causes silent crash with no backtrace.
**Architectural Fix:** Move large response/header buffers from stack to heap (PSRAM-aware allocation from RC-001 helper). Allocate at task start, free at task end. Alternatively, increase task stack sizes, but heap allocation is the better fix since it also reduces peak stack usage for all call paths.
**Scope:** src/server/journal_sync.c, src/upload/clip_uploader.c
**Effort:** S
**Risk:** Low — straightforward buffer relocation
**Status:** verified-fixed

### RC-007: single-recv-partial-response

**Findings:** R-065, R-068, R-071
**Epic:** COMMS
**Root Cause:** All three network modules (server_comm, journal_sync, clip_uploader) treat a single `tls_read()`/`recv()` call as the complete HTTP response. TCP can fragment responses across multiple segments; slow networks or large responses will be truncated, causing JSON parse failures or missed upload confirmations.
**Architectural Fix:** Create a shared `http_recv_full()` helper that reads until Content-Length is satisfied or connection closes (parsing HTTP headers to determine expected body length). Use this helper in all three modules.
**Scope:** src/server/server_comm.c, src/server/journal_sync.c, src/upload/clip_uploader.c
**Effort:** M
**Risk:** Medium — must handle chunked transfer encoding, timeouts, and partial header reads correctly
**Status:** verified-fixed

### RC-008: api-key-not-cleared

**Findings:** R-002, R-067, R-075, R-076
**Epic:** SAFETY
**Root Cause:** All three network modules plus config_manager copy the API key to stack-local buffers but don't call `secure_clear()` before function return. The `secure_clear()` function already exists in `secure_util.h` but isn't used consistently. Credential residue remains in stack memory.
**Architectural Fix:** Add `secure_clear()` calls for all API key stack buffers at every function exit path (including error returns). Use a `goto cleanup` pattern with `secure_clear()` in the cleanup block to ensure it's always called. Consider a helper macro `DECLARE_SENSITIVE_BUFFER(name, size)` that auto-clears via compiler destructor attribute if available.
**Scope:** src/config/config_manager.c, src/server/server_comm.c, src/server/journal_sync.c, src/upload/clip_uploader.c
**Effort:** S
**Risk:** Low — adding cleanup calls, no behavioral change
**Status:** verified-fixed (11d2c85)

### RC-009: sqlite-binding-lifetime

**Findings:** R-023, R-024
**Epic:** SAFETY
**Root Cause:** SQLite bindings use `SQLITE_STATIC` for caller-provided strings. If the caller passes stack-local buffers that go out of scope before `sqlite3_step()` executes, this is use-after-free. `SQLITE_TRANSIENT` forces SQLite to copy the string immediately, which is the safe default.
**Architectural Fix:** Replace `SQLITE_STATIC` with `SQLITE_TRANSIENT` for all externally-provided string bindings in event_logger.c. Keep `SQLITE_STATIC` only for string literals or module-owned persistent buffers.
**Scope:** src/storage/event_logger.c
**Effort:** S
**Risk:** Low — `SQLITE_TRANSIENT` is slightly slower (extra copy) but eliminates lifetime bugs
**Status:** verified-fixed (11d2c85)

### RC-010: tests-excluded-from-ci

**Findings:** R-081
**Epic:** TEST
**Root Cause:** 6 test targets are gated behind `NOT APIS_PLATFORM STREQUAL "test"` in CMakeLists.txt — they only build on non-test platforms, meaning they never run in CI. The entire detection pipeline (tracker, classifier, motion) has zero CI coverage.
**Architectural Fix:** Fix the CMake condition to build these tests on the test platform. They likely need mock HAL stubs for camera/sensor functions — create minimal stubs in the test HAL to satisfy linker requirements.
**Scope:** CMakeLists.txt, tests/ (may need new mock stubs)
**Effort:** M
**Risk:** Medium — tests may fail when first enabled, revealing bugs hidden by lack of CI coverage
**Status:** verified-fixed (08b8c91). Added test-platform HAL stub (hal/test/camera_test.c). All 6 targets build and run. test_event_logger has 3 pre-existing failures now exposed.

### Standalone Findings (no cluster)

The following findings don't form a 3+ instance cluster but are still actionable:

- **R-061** (CRIT): Missing TLS cert validation — standalone, highest priority fix
- **R-062** (HIGH): Auth token logged at INFO level
- **R-063** (HIGH): Auth bypass on token generation failure
- **R-007** (HIGH): Deprecated `config_manager_get()` still callable
- **R-025** (HIGH): Stack arrays in classifier hot path
- **R-042** (MED): Division by zero in targeting sweep
- **R-043** (MED): Timer wrap in shadow lane gate
- **R-064** (MED): Thread-unsafe `apis_timegm` (global TZ mutation)
- **R-069** (MED): HTTPS downgrade not refused in journal_sync
- **R-034** (MED): Return internal pointer after unlock in clip_recorder
- **R-035** (MED): Clip recorder ERROR state not handled
- **R-013** (MED): NULL config passed to motion_init
- **R-014** (MED): Masked API key check always wrong
- **R-036/R-037** (LOW): MP4-only file filter misses ESP32 .avi clips
- **R-072** (LOW): DNS response buffer overflow with crafted packets
- **R-091** (MED): Lock-free QR frame sharing lacks memory barriers
- **R-092–R-096**: Various LOW severity HAL/test quality items

---

## Feature Gaps (Not Bugs)

_Pages, routes, or features that don't exist yet. These belong in sprint planning, not remediation._

---

## Superseded / Duplicate Findings

| Old ID | Superseded By | Notes |
|--------|---------------|-------|

---

## Definition of Done (per root cause fix)

- [ ] Root cause identified and documented
- [ ] Fix addresses ALL findings in the cluster, not just one
- [ ] Solution is at the right abstraction level (middleware, convention, abstraction — not per-file patches)
- [ ] Regression tests cover the pattern, not just one instance
- [ ] Security review done for safety/memory/concurrency impact
- [ ] No fake success states — if not implemented, return an error or disable the feature
- [ ] CI passes (build + test suite)
- [ ] All R-IDs in the cluster updated to verified-fixed with commit hash

## Process

- Every fix references the RC-ID in its commit message: fix(safety): centralize laser interlock checks [RC-001]
- Every fix updates this file: change status, add commit hash
- One cluster per PR — tight scope, real tests, clear rollback path
- No individual symptom patches — fix the root cause or don't fix at all
