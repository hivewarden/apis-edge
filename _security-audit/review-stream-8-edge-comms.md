# Security Review: Stream 8 -- Edge Firmware (Comms, Storage, Config, HAL)

**Date:** 2026-02-06
**Reviewer:** Claude Opus 4.6 (adversarial review)
**Scope:** Edge device firmware communication, storage, configuration, hardware abstraction, and build system layers
**Risk Profile:** Embedded C running on physical devices with network connectivity and laser hardware

---

## Files Reviewed

| Category | File | Lines |
|----------|------|-------|
| HTTP Server | `src/http/http_server.c` | ~1318 |
| HTTP Utils | `src/http/http_utils.c` | ~79 |
| Server Communication | `src/server/server_comm.c` | ~798 |
| Clip Uploader | `src/upload/clip_uploader.c` | ~1372 |
| TLS Client | `src/tls/tls_client.c` | ~397 |
| Storage Manager | `src/storage/storage_manager.c` | ~565 |
| Clip Recorder | `src/storage/clip_recorder.c` | ~711 |
| Event Logger | `src/storage/event_logger.c` | ~725 |
| Config Manager | `src/config/config_manager.c` | ~987 |
| LED Controller | `src/led/led_controller.c` | ~465 |
| Logging | `src/log.c` | ~273 |
| Main Entry | `src/main.c` | ~553 |
| HAL: Camera Pi | `hal/pi/camera_pi.c` | ~474 |
| HAL: Camera ESP32 | `hal/esp32/camera_esp32.c` | ~322 |
| HAL: SQLite Pi | `hal/storage/pi/sqlite_pi.c` | ~88 |
| HAL: SQLite ESP32 | `hal/storage/esp32/sqlite_esp32.c` | (reviewed) |
| Headers | `include/*.h` | (all reviewed) |
| Build System | `CMakeLists.txt` | ~636 |
| Tests | `tests/test_*.c` | 5 files |

**Total:** ~8,000+ lines of C code reviewed

---

## CRITICAL

### C-01: TLS Certificate Verification Disabled (MITM Vulnerability)

**File:** `src/tls/tls_client.c:234`

```c
mbedtls_ssl_conf_authmode(&ctx->conf, MBEDTLS_SSL_VERIFY_OPTIONAL);
```

**Description:** The mbedTLS backend sets certificate verification to `MBEDTLS_SSL_VERIFY_OPTIONAL`, which means the TLS handshake will succeed even if the server presents an invalid, expired, or self-signed certificate. The comment on line 233 explicitly acknowledges this: `"/* Use default CA certificates - in production, load from a CA bundle */"` -- but no CA bundle is ever loaded.

**Risk:** A man-in-the-middle attacker on the network path between the edge device and the APIS server can intercept all HTTPS traffic, including API keys transmitted in heartbeat requests and clip uploads. This completely negates the value of TLS. Given that edge devices may operate on shared WiFi networks (beekeeping sites), this is a realistic attack vector.

**Impact:** Complete loss of transport security. API key theft enables unauthorized device impersonation, clip injection, and configuration tampering.

**Recommendation:** Set `MBEDTLS_SSL_VERIFY_REQUIRED` and load a CA certificate bundle. At minimum, embed the Let's Encrypt root CA (or the specific CA for the deployment). Add a `tls_set_ca_cert()` function to the TLS API.

---

### C-02: CORS Origin Header Reflected Without Validation

**File:** `src/http/http_server.c:579-591` and `src/http/http_server.c:910-919`

```c
// Line 579: in http_send_json
const char *cors_origin = (tl_request_origin && tl_request_origin[0]) ? tl_request_origin : NULL;
// ...
"Access-Control-Allow-Origin: %s\r\n"  // reflects any origin

// Line 910-919: in handle_options_preflight
if (req->origin[0]) {
    snprintf(response, sizeof(response),
        "HTTP/1.1 204 No Content\r\n"
        "Access-Control-Allow-Origin: %s\r\n"  // reflects any origin
```

**Description:** The HTTP server takes the Origin header from the incoming request and reflects it verbatim in the `Access-Control-Allow-Origin` response header. There is no allowlist of trusted origins. Any website on the internet can make credentialed cross-origin requests to the edge device's HTTP server.

**Risk:** A malicious website visited by a user on the same network as the edge device can silently interact with the device's API: reading detection data, changing configuration, arming/disarming the laser, or exfiltrating the local auth token. Combined with the local network exposure of the edge device, this is especially dangerous.

**Impact:** Cross-origin attacks against the edge device from any web page. Browser-based reconnaissance and control of physical laser hardware.

**Recommendation:** Implement an explicit origin allowlist. At minimum, restrict to the dashboard's known origin or to `null` (blocking all CORS). If the device needs to be accessed from the dashboard on an unknown origin, use a configurable allowed-origins list in the config manager.

---

### C-03: `config_manager_get()` Returns Unprotected Pointer to Shared Mutable State

**File:** `src/config/config_manager.c:665-667`

```c
const runtime_config_t *config_manager_get(void) {
    return &g_runtime_config;
}
```

**Description:** This function returns a direct pointer to the global `g_runtime_config` struct without any locking. The struct is modified by `config_manager_update()`, `config_manager_set_server()`, `config_manager_set_armed()`, etc., all of which hold a mutex during modification. However, any caller reading through this pointer reads unprotected memory that may be mid-write.

**Callers at risk include:**
- `server_comm.c:291-303` -- reads `api_key` via raw pointer for heartbeat auth
- `http_server.c` -- reads config values for status endpoints
- `main.c` -- reads config during main loop

**Risk:** Data races on multi-field struct reads. A partial write (e.g., `api_key` being updated via server command while `server_comm.c` copies it character-by-character) can produce corrupted data. On ARM platforms (Raspberry Pi, ESP32), non-atomic reads of multi-byte fields can return torn values.

**Impact:** Corrupted API key causing authentication failures, inconsistent configuration state, potential undefined behavior from torn reads on ARM.

**Recommendation:** Either (a) remove `config_manager_get()` entirely and force all callers to use `config_manager_get_public()` (which takes a lock and copies), or (b) add a read-lock to `config_manager_get()` with a corresponding unlock call, or (c) document that callers must immediately copy needed fields and not hold the pointer across operations (as `server_comm.c` partially attempts but then accesses the raw pointer for `api_key` on line 303).

---

## HIGH

### H-01: Silent Fallback from HTTPS to Plain HTTP

**File:** `src/server/server_comm.c:327-334`

```c
if (strncmp(config_local.server.url, "https://", 8) == 0) {
    if (tls_available()) {
        use_tls = true;
    } else {
        LOG_WARN("Server URL uses HTTPS but TLS is not available on this platform, "
                 "falling back to plain HTTP");
    }
}
```

**Description:** When the server URL is configured as HTTPS but TLS is not available (stub implementation or mbedTLS not installed), the code silently falls back to plain HTTP. The downgrade is only logged as a warning, not treated as a fatal error.

**Risk:** The API key is transmitted in cleartext over HTTP. An administrator who configured HTTPS may believe their connection is encrypted when it is not. This is a classic downgrade attack enabler.

**Impact:** Credential exposure on the network. The same pattern exists in `clip_uploader.c` for clip upload connections.

**Recommendation:** When the URL scheme is `https://` and TLS is not available, refuse to connect instead of falling back. Return an error code and let the caller decide whether to retry or alert the user via LED status.

---

### H-02: `storage_manager.c` and `event_logger.c` Use `pthread` Directly -- Won't Compile on ESP32

**File:** `src/storage/storage_manager.c:15,35` and `src/storage/event_logger.c:34`

```c
// storage_manager.c:15
#include <pthread.h>

// storage_manager.c:35
static pthread_mutex_t g_mutex = PTHREAD_MUTEX_INITIALIZER;

// event_logger.c:34
static pthread_mutex_t g_mutex = PTHREAD_MUTEX_INITIALIZER;
```

**Description:** Both `storage_manager.c` and `event_logger.c` use POSIX `pthread_mutex_t` directly, without any ESP32 platform conditional compilation. ESP32 uses FreeRTOS semaphores (`xSemaphoreCreateMutex`, `xSemaphoreTake/Give`), not pthreads. While ESP-IDF provides a limited pthread compatibility layer, using raw pthreads in components that will run on ESP32 violates the HAL abstraction pattern used elsewhere in the codebase.

**Risk:** Compilation failure or incorrect behavior when building for ESP32. The `clip_recorder.c` has the same issue (line 17: `#include <pthread.h>`).

**Impact:** These modules cannot be used on the primary target platform (ESP32) without modification.

**Recommendation:** Use the `platform.h` abstraction layer or create a mutex HAL that maps to pthreads on Pi/test and FreeRTOS semaphores on ESP32, consistent with how other modules handle platform differences.

---

### H-03: `localtime()` Used Instead of `localtime_r()` -- Not Thread-Safe

**File:** `src/log.c:46`

```c
struct tm *tm = localtime(&tv.tv_sec);
```

**Description:** `localtime()` returns a pointer to a static internal buffer that is shared across all threads. In a multi-threaded application (which the edge firmware is -- HTTP server, upload thread, main loop), concurrent calls to `localtime()` cause data races.

**Risk:** Corrupted timestamps in log output. In the worst case, the returned `struct tm *` pointer is dereferenced while another thread is writing to the same static buffer, producing garbage values that are then formatted into log strings.

**Impact:** Incorrect log timestamps, potential buffer overrun if corrupted `tm_year` or `tm_mon` values are used in `snprintf` format. Low probability of a crash, but high probability of incorrect timestamps.

**Recommendation:** Replace with `localtime_r()` which writes to a caller-supplied buffer: `struct tm tm_buf; localtime_r(&tv.tv_sec, &tm_buf);`

---

### H-04: Single `recv()` Call for HTTP Responses May Get Partial Data

**Files:** `src/server/server_comm.c:262` and `src/upload/clip_uploader.c:742`

```c
// server_comm.c
ssize_t received = recv(sock, response, sizeof(response) - 1, 0);

// clip_uploader.c
ssize_t received = recv(sock, response, sizeof(response) - 1, 0);
```

**Description:** Both modules perform a single `recv()` call to read the entire HTTP response. TCP is a stream protocol; a single `recv()` may return only part of the response, especially under network congestion or when the response is larger than the TCP window. The code assumes the first `recv()` contains the complete HTTP status line and headers.

**Risk:** Partial reads cause response parsing failures (the `sscanf` for HTTP status on the next line may fail). The clip uploader then incorrectly treats this as a network error and retries. The heartbeat handler may miss server-issued commands (e.g., API key rotation, config updates) contained in the response body.

**Impact:** Intermittent upload failures, missed server commands, unnecessary retry storms.

**Recommendation:** Implement a response reader that loops on `recv()` until either: (a) the full `Content-Length` is received, (b) a timeout occurs, or (c) the connection is closed. At minimum, loop until the HTTP headers are fully received (terminated by `\r\n\r\n`).

---

### H-05: `rand()` Fallback for Token Generation is Cryptographically Weak

**File:** `src/http/http_server.c:322-327,330-334`

```c
// Line 322-327: Fallback when /dev/urandom unavailable
LOG_WARN("Could not open /dev/urandom, falling back to rand() - NOT cryptographically secure");
srand((unsigned int)(time(NULL) ^ getpid()));
for (size_t i = 0; i < bytes_needed; i++) {
    random_bytes[i] = (unsigned char)(rand() & 0xFF);
}

// Line 330-334: Unknown platform fallback (always uses rand())
srand((unsigned int)(time(NULL) ^ getpid()));
for (size_t i = 0; i < bytes_needed; i++) {
    random_bytes[i] = (unsigned char)(rand() & 0xFF);
}
```

**Description:** On platforms where `/dev/urandom` is unavailable (including the `#else` fallback for unknown platforms), the local auth token is generated using `rand()` seeded with `time(NULL) ^ getpid()`. This seed has very low entropy -- typically 32 bits total, of which the PID contributes maybe 16 bits of entropy and the time is predictable.

**Risk:** An attacker who knows the approximate device boot time can brute-force the generated auth token by exhaustively trying all possible seeds. `rand()` itself uses a linear congruential generator with well-known internal state progression, making recovery trivial with a few known output bytes.

**Impact:** Complete bypass of local authentication on non-Linux platforms.

**Recommendation:** On ESP32, use `esp_fill_random()` which uses the hardware RNG. On Pi, `/dev/urandom` should always be available; make the fallback a fatal error rather than silently degrading security. Remove the `#else` branch entirely since the two target platforms (Pi and ESP32) are both covered.

---

### H-06: ESP32 Camera Callback Set Without Memory Barrier or Lock

**File:** `hal/esp32/camera_esp32.c:316-318`

```c
void camera_set_callback(camera_frame_callback_t callback, void *user_data) {
    g_callback = callback;
    g_callback_user_data = user_data;
}
```

And the read side (`camera_esp32.c:262-266`):
```c
camera_frame_callback_t cb = g_callback;
void *cb_data = g_callback_user_data;
if (cb) {
    cb(frame, cb_data);
}
```

**Description:** The callback function pointer and user data are written without any lock, atomic operation, or memory barrier. On the ESP32 (dual-core Xtensa), if `camera_set_callback()` is called from one core while the camera task runs on another core, the reading side may see a new callback pointer but stale user data (or vice versa), because the two stores are not atomic as a pair.

Note: The Pi HAL (`hal/pi/camera_pi.c`) correctly uses a separate `g_callback_mutex` for this operation. The ESP32 HAL does not.

**Risk:** Calling a callback with mismatched user data can cause crashes, memory corruption, or data being sent to the wrong handler.

**Impact:** Race condition on dual-core ESP32 during callback registration. Low probability in normal operation but can be triggered during reconfiguration.

**Recommendation:** Use a FreeRTOS mutex or critical section around the callback set/get operations, mirroring the Pi HAL implementation.

---

## MEDIUM

### M-01: Rate Limit Table is Only 16 Entries, Trivially Exhaustible

**File:** `src/http/http_server.c:434-447`

```c
#define RATE_LIMIT_MAX_ENTRIES  16

static rate_limit_entry_t g_rate_limits[RATE_LIMIT_MAX_ENTRIES];
static int g_rate_limit_count = 0;
```

**Description:** The rate limiting table has a fixed capacity of 16 entries. The `rate_limit_find_or_create()` function (line 453) will try to evict the oldest entry when the table is full. An attacker can exhaust the table by sending auth failures from 16+ different source IPs, effectively evicting legitimate rate-limit tracking entries.

**Risk:** Rate limiting becomes ineffective when an attacker spoofs or rotates source IPs. On a local network, this may be less of a concern, but if the device is port-forwarded or accessible from the internet, it enables unlimited brute-force attempts.

**Impact:** Bypass of authentication rate limiting.

**Recommendation:** Increase the table size or use a hash table with LRU eviction. Consider a global rate limit (across all IPs) in addition to per-IP tracking.

---

### M-02: `_Thread_local` May Not Be Available on All ESP32 Toolchains

**File:** `src/http/http_server.c:568`

```c
static _Thread_local const char *tl_request_origin = NULL;
```

**Description:** `_Thread_local` is a C11 feature. While modern GCC and Clang support it, the ESP-IDF toolchain (xtensa-esp32-elf-gcc) has limited C11 support, and thread-local storage on FreeRTOS requires special handling (`__thread` may not work as expected with FreeRTOS tasks).

**Risk:** Compilation failure or incorrect behavior on ESP32. If the variable is not truly thread-local, the CORS origin from one request will leak into another request being processed on a different thread.

**Impact:** Potential CORS header injection from one request to another. On ESP32, may cause build failures.

**Recommendation:** Use a thread-safe mechanism that works on both platforms, such as passing the origin through function parameters rather than thread-local storage.

---

### M-03: `clip_recorder_start()` Returns Pointer to Static Buffer with TOCTOU Risk

**File:** `src/storage/clip_recorder.c:477-479,531`

```c
// Line 477-479: Existing clip case
return g_current_clip;

// Line 531: New clip case
return g_current_clip;
```

**Description:** `clip_recorder_start()` returns a pointer to the static buffer `g_current_clip`. If the clip recorder starts a new clip or is cleaned up while the caller is still using the returned pointer, the data changes underneath the caller. The code acknowledges this in comments (line 477-478): `"Return path to static buffer - see clip_recorder.h POINTER LIFETIME notes."` but this is an error-prone pattern.

**Risk:** The caller in `main.c:464` calls `clip_recorder_get_current_path()` and passes the result to `event_logger_log()` as the `clip_file` parameter. SQLite binds this with `SQLITE_STATIC` (event_logger.c:219), meaning SQLite assumes the string remains valid until the statement is finalized. If the clip recorder modifies `g_current_clip` between the `sqlite3_bind_text` and `sqlite3_step` calls, the database receives corrupted data.

**Impact:** Corrupted clip file references in the event database.

**Recommendation:** Return a copy of the path (caller-freed), or have callers copy immediately before passing to other modules.

---

### M-04: Event Logger Holds Mutex During `VACUUM` Operation

**File:** `src/storage/event_logger.c:587-589`

```c
if (deleted > 100) {
    sqlite3_exec(g_db, "VACUUM;", NULL, NULL, NULL);
}
```

**Description:** The `event_logger_prune()` function holds `g_mutex` (acquired earlier in the function) while executing `VACUUM`. SQLite `VACUUM` rewrites the entire database file and can take several seconds on a large database, especially on SD card storage with slow write speeds.

**Risk:** All other event logger operations (logging, querying, sync marking) are blocked for the duration of the VACUUM. On an SD card, this could be 5-30 seconds, during which new detections cannot be logged.

**Impact:** Dropped detection events during VACUUM. If a hornet is actively attacking during auto-prune, detection events are lost.

**Recommendation:** Release the mutex before VACUUM, or use `PRAGMA incremental_vacuum` with `PRAGMA auto_vacuum = INCREMENTAL`, which avoids the long pause. Alternatively, run VACUUM on a separate thread with its own database connection.

---

### M-05: No Maximum Retry Limit on Clip Uploads

**File:** `src/upload/clip_uploader.c` (upload processing loop)

**Description:** The clip uploader uses exponential backoff with a cap at 3600 seconds (1 hour), but there is no maximum retry count. A clip that consistently fails to upload (e.g., due to a permanent server-side rejection like 413 Payload Too Large, or a corrupt file) will retry indefinitely.

**Risk:** Permanent upload failures consume queue slots indefinitely. With a queue size of `MAX_UPLOAD_QUEUE` entries, a few permanently-failing clips can prevent new clips from being uploaded. The backoff delay caps at 1 hour, so each failing clip still generates one retry per hour, forever.

**Impact:** Upload queue starvation. New detection clips are dropped (oldest-eviction) while permanently-failing clips occupy queue slots.

**Recommendation:** Add a maximum retry count (e.g., 20 retries = roughly 24 hours of attempts). After exhausting retries, move the entry to a "dead letter" state and free the queue slot. Log the permanent failure for manual investigation.

---

### M-06: Queue Persistence Only Compiled for `APIS_PLATFORM_PI`

**File:** `src/upload/clip_uploader.c:129`

```c
#if defined(APIS_PLATFORM_PI)
static int save_queue_to_disk(void) {
```

**Description:** The queue persistence functions (`save_queue_to_disk`, `load_queue_from_disk`) are only compiled for `APIS_PLATFORM_PI`. On ESP32 (the production target), the upload queue is lost on reboot.

**Risk:** All pending clip uploads are lost when the ESP32 reboots (due to power failure, watchdog reset, OTA update, etc.). On a beekeeping site with unreliable power, this could mean losing days of detection clips.

**Impact:** Loss of queued clips on ESP32 reboot.

**Recommendation:** Implement ESP32 queue persistence using NVS (Non-Volatile Storage) or SPIFFS/LittleFS. The existing JSON serialization code can be reused with an ESP32 filesystem backend.

---

### M-07: `sqlite3_bind_text` with `SQLITE_STATIC` on Stack-Local Buffers

**File:** `src/storage/event_logger.c:206-207`

```c
sqlite3_bind_text(stmt, 1, timestamp, -1, SQLITE_STATIC);
sqlite3_bind_text(stmt, 2, confidence_to_db_string(detection->confidence), -1, SQLITE_STATIC);
```

**Description:** `SQLITE_STATIC` tells SQLite that the bound string will remain valid until the statement is finalized. The `timestamp` buffer is stack-local (declared on line 190). In the current code, `sqlite3_step()` is called immediately after binding, so the stack frame is still active and this is technically safe. However, it is a fragile pattern: any future refactoring that moves the `sqlite3_step()` call (e.g., to a helper function, or after the stack frame returns) would cause a use-after-free.

**Risk:** Currently safe but fragile. Any code reorganization could introduce a use-after-free vulnerability.

**Impact:** Potential memory corruption if code is refactored.

**Recommendation:** Use `SQLITE_TRANSIENT` instead, which causes SQLite to make its own copy of the string. The performance impact is negligible for single-row inserts.

---

### M-08: `test_clip_recorder.c` Uses `system("rm -rf ...")` for Cleanup

**File:** `tests/test_clip_recorder.c:107-109`

```c
char cmd[256];
snprintf(cmd, sizeof(cmd), "rm -rf %s", g_test_dir);
(void)system(cmd);
```

**Description:** The test cleanup code constructs a shell command with `snprintf` and passes it to `system()`. If `g_test_dir` were to contain shell metacharacters (e.g., from a crafted `mkdtemp` result or buffer overflow), this could execute arbitrary commands.

**Risk:** In the current code, `g_test_dir` is set from `mkdtemp()` with a known prefix, so exploitation is unlikely in practice. However, the pattern is dangerous and sets a bad precedent.

**Impact:** Low in current context; the test code is not deployed to production devices.

**Recommendation:** Use the POSIX `unlink()`/`rmdir()` approach (as done in the `#ifdef APIS_PLATFORM_PI` branch) for all platforms instead of calling `system()`.

---

## LOW

### L-01: `atoi()` Used for Port Parsing with Limited Validation

**File:** `src/http/http_utils.c:55`

```c
int parsed_port = atoi(host_end + 1);
if (parsed_port <= 0 || parsed_port > 65535) {
```

**Description:** `atoi()` does not distinguish between a zero return due to "0" input and a zero return due to non-numeric input. While the subsequent range check rejects port 0, a string like `:abc` will parse as port 0 and be correctly rejected. However, a string like `:99999999999` may cause integer overflow in `atoi()` (undefined behavior on overflow in C).

**Risk:** Undefined behavior on malformed URLs with extremely large port numbers. The range check after `atoi()` mitigates the practical impact since overflow typically wraps to a negative value which is rejected.

**Impact:** Minimal in practice due to the range check, but technically undefined behavior.

**Recommendation:** Use `strtol()` with error checking for robust port parsing.

---

### L-02: `sqlite_hal_get_db_path()` Returns Pointer to Static Buffer

**File:** `hal/storage/pi/sqlite_pi.c:42-57`

```c
static char g_db_path[256];

const char *sqlite_hal_get_db_path(const char *filename) {
    // ...
    snprintf(g_db_path, sizeof(g_db_path), "%s", filename);
    return g_db_path;
}
```

**Description:** Returns a pointer to a static buffer. Concurrent calls from different threads would overwrite the buffer. Additionally, calling the function twice and using both returned pointers results in aliased data.

**Risk:** Thread safety issue if called from multiple threads; currently only called during initialization, so low practical risk.

**Impact:** Low -- currently single-threaded usage pattern.

**Recommendation:** Accept a caller-provided buffer instead of returning a static one.

---

### L-03: `clip_recorder.c` Uses `uint32_t` Timer That Overflows After ~49.7 Days

**File:** `src/storage/clip_recorder.c:129-142`

```c
static uint32_t get_time_ms(void) {
    // ...
    return (uint32_t)(ts.tv_sec * 1000 + ts.tv_nsec / 1000000);
}
```

**Description:** The 32-bit millisecond counter overflows after approximately 49.7 days. The code comment (lines 126-128) acknowledges this and states it is acceptable for relative duration comparison. However, the overflow can cause incorrect post-roll timing at the wrap point: if `g_record_start_ms` is near `UINT32_MAX` and `g_extend_until_ms` wraps to a small value, the comparison `get_time_ms() > g_extend_until_ms` may trigger immediately, causing a clip to finalize prematurely.

**Risk:** Once every ~49.7 days, a single clip may be truncated (finalized immediately instead of waiting for post-roll).

**Impact:** Rare clip truncation. Acceptable for the stated use case but worth documenting.

**Recommendation:** Document the wrap-around behavior explicitly. Consider using a 64-bit timer or unsigned subtraction arithmetic that handles wrap correctly: `(current_ms - start_ms) >= duration_ms`.

---

### L-04: `g_uploaded_clips` Array Uses Linear Search with 256-byte Entries

**File:** `src/storage/storage_manager.c:42-44`

```c
#define MAX_UPLOADED_CLIPS 100
static char g_uploaded_clips[MAX_UPLOADED_CLIPS][256];
static int g_uploaded_count = 0;
```

**Description:** The uploaded clips tracking uses a fixed 100-entry array with 256-byte strings (25.6 KB total static allocation) and linear search. While functional, this wastes memory on the ESP32 (which has limited RAM) and becomes slow at capacity.

**Risk:** Memory waste on constrained ESP32 platform. Performance degradation at 100 entries (O(n) search for each clip check).

**Impact:** Low -- 25.6 KB is not critical on Pi, somewhat wasteful on ESP32.

**Recommendation:** Use a hash set or reduce the entry size (store only the filename, not the full path). Alternatively, use a Bloom filter for approximate membership testing with much less memory.

---

### L-05: Duplicate `secure_clear()` Implementations

**Files:** `src/server/server_comm.c` and `src/upload/clip_uploader.c` (both contain local static implementations)

**Description:** Both `server_comm.c` and `clip_uploader.c` define their own `secure_clear()` function with the same implementation using `volatile char *` and byte-by-byte zeroing. This duplicated code is a maintenance burden.

**Risk:** If one copy is updated (e.g., to use `explicit_bzero()` where available) and the other is not, the security guarantee becomes inconsistent.

**Impact:** No current security issue, but maintenance risk.

**Recommendation:** Extract to a shared utility header/source file (e.g., `src/util/secure_clear.c`).

---

### L-06: `signal()` Used Instead of `sigaction()` in Main

**File:** `src/main.c:542-543`

```c
signal(SIGINT, signal_handler);
signal(SIGTERM, signal_handler);
```

**Description:** `signal()` has implementation-defined behavior regarding signal mask restoration and handler persistence after invocation. On some systems, the handler is reset to `SIG_DFL` after the first invocation (System V behavior). `sigaction()` provides portable, well-defined behavior.

**Risk:** On System V-style systems, a second signal during shutdown could terminate the process with the default handler instead of being caught.

**Impact:** Low -- edge devices run Linux (Pi) or FreeRTOS (ESP32, where signals are irrelevant). Pi uses glibc which has BSD-style `signal()` semantics.

**Recommendation:** Use `sigaction()` for portability, or add a comment documenting the platform assumption.

---

### L-07: Constant-Time Comparison Iterates Over `min_len` Not `max_len`

**File:** `src/http/http_server.c:420-427`

```c
volatile unsigned char result = (token_len != provided_len) ? 1 : 0;
size_t min_len = token_len < provided_len ? token_len : provided_len;
for (size_t i = 0; i < min_len; i++) {
    result |= (unsigned char)(g_local_auth_token[i] ^ provided[i]);
}
```

**Description:** The constant-time comparison loop iterates over `min_len` bytes. If the provided token is shorter than the stored token, the loop completes faster. This timing difference reveals the length of the stored token.

**Risk:** An attacker can determine the token length by measuring response times with tokens of different lengths. However, since the token length is fixed at generation time (and the length is not a secret -- it's defined by the code), this is a theoretical weakness rather than a practical one.

**Impact:** Token length disclosure via timing side channel. Low severity because the token length is deterministic (not random).

**Recommendation:** Always iterate over the maximum of the two lengths (reading a padding byte for the shorter string), or iterate over a fixed known length.

---

## INFO

### I-01: `config_manager_save()` Serializes API Key to Stack Buffer

**File:** `src/config/config_manager.c:548-549`

The config serialization creates a JSON string containing the API key on a stack-allocated buffer. After the function returns, the key remains in stack memory until overwritten by subsequent function calls. While the code uses `secure_clear()` on explicit API key copies, the JSON serialization buffer is not cleared.

**Note:** This is inherent to the architecture of saving config with sensitive fields and is not easily avoided without restructuring the save path.

---

### I-02: No CSRF Protection on Edge Device HTTP Server

The edge device's HTTP server accepts POST requests for state-changing operations (arm/disarm, config update) without any CSRF token. Combined with the CORS origin reflection issue (C-02), a malicious web page could make authenticated requests to the device.

**Note:** For an embedded device on a local network, CSRF protection via tokens is unusual. However, the CORS fix (C-02) would mitigate this by preventing cross-origin requests.

---

### I-03: Main Loop Cleanup Uses Manual Reverse-Order Resource Deallocation

**File:** `src/main.c:271-333`

The error handling in `run_capture_loop()` manually lists all previously-initialized resources to clean up on each failure path. This creates 8 copies of increasingly long cleanup sequences. While functionally correct, adding a new resource requires updating all error paths.

**Note:** Consider using a goto-based cleanup pattern (standard in Linux kernel C style) to centralize cleanup.

---

### I-04: Test Framework Does Not Use a Standard Test Runner

All test files (`test_http_server.c`, `test_server_comm.c`, `test_clip_uploader.c`, etc.) implement their own test framework with `TEST_ASSERT` macros. There is no shared test infrastructure, and test discovery requires manually adding each test function to `main()`.

**Note:** Consider adopting a lightweight C test framework (e.g., Unity, MinUnit) for consistent test reporting, fixtures, and automatic test discovery.

---

### I-05: Build System Does Not Enable Address Sanitizer for Tests

**File:** `CMakeLists.txt`

The test build configuration does not enable `-fsanitize=address` or `-fsanitize=undefined`. These compiler sanitizers would automatically detect buffer overflows, use-after-free, and undefined behavior during test execution.

**Note:** Adding `target_compile_options(test_xxx PRIVATE -fsanitize=address -fsanitize=undefined)` and corresponding link flags to test targets would improve vulnerability detection.

---

## Summary

| Severity | Count | Key Themes |
|----------|-------|------------|
| CRITICAL | 3 | TLS bypass, CORS bypass, data race on config |
| HIGH | 6 | HTTPS downgrade, platform portability, thread safety, weak RNG |
| MEDIUM | 8 | Rate limit bypass, timer overflow, retry exhaustion, build portability |
| LOW | 7 | Code quality, memory efficiency, API fragility |
| INFO | 5 | Architecture observations, test infrastructure |
| **Total** | **29** | |

### Risk Assessment

The most dangerous combination of findings is **C-01 + H-01**: TLS certificate verification is disabled, AND the code silently falls back to plain HTTP when TLS is unavailable. This means that regardless of the configured server URL scheme, the API key is effectively transmitted without adequate protection.

The **C-02** CORS reflection issue is independently critical because it enables browser-based attacks against the edge device's physical hardware controls (arm/disarm laser).

The **C-03** config race condition is a latent bug that will become exploitable under load or when adding features that increase concurrent access to the config.

### Priority Remediation Order

1. **C-01** -- Fix TLS certificate verification (load CA bundle, set VERIFY_REQUIRED)
2. **C-02** -- Implement CORS origin allowlist
3. **H-01** -- Fail on HTTPS downgrade instead of falling back
4. **C-03** -- Fix config_manager_get() to use locking or copy semantics
5. **H-03** -- Replace localtime() with localtime_r()
6. **H-05** -- Remove rand() fallback, use platform-specific secure RNG
7. **H-02** -- Abstract mutex usage for ESP32 compatibility
8. **H-04** -- Implement complete HTTP response reading
9. **H-06** -- Add lock to ESP32 camera callback registration
10. **M-01 through M-08** -- Address in priority order based on deployment timeline
