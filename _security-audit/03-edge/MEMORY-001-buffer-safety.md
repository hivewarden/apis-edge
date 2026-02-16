# MEMORY-001: Buffer and Memory Safety Vulnerabilities

**Component:** APIS Edge Device Firmware
**Audit Date:** 2026-01-31
**Auditor:** Security Audit Agent
**Overall Risk:** HIGH

---

## Executive Summary

This audit examined the APIS edge device firmware (C code) in `/Users/jermodelaruelle/Projects/apis/apis-edge/` for memory safety vulnerabilities. The codebase demonstrates generally good practices with consistent use of `snprintf` over `sprintf`, bounded string copies, and proper null termination. However, several vulnerabilities were identified that could lead to denial of service, information disclosure, or potentially remote code execution in certain scenarios.

---

## Findings

### Finding 1: HTTP Request Path Truncation Without Error Handling

**Severity:** MEDIUM
**CWE:** CWE-120 (Buffer Copy without Checking Size of Input), CWE-131 (Incorrect Calculation of Buffer Size)
**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/http/http_server.c`
**Lines:** 455-460

**Vulnerable Code:**
```c
size_t path_len = space2 - path_start;
if (path_len >= sizeof(req->path)) {
    path_len = sizeof(req->path) - 1;  // Silent truncation!
}
memcpy(req->path, path_start, path_len);
req->path[path_len] = '\0';
```

**Attack Vector:**
An attacker could send an HTTP request with an extremely long path (>256 bytes). The path is silently truncated without returning an error. This could cause:
1. Path confusion where `/very_long_path_that_gets_truncated_here.../config` becomes `/very_long_path_that_gets_truncated_here...` matching unintended routes
2. Security bypass if authorization checks are based on full path matching

**Impact:**
- Potential authentication/authorization bypass through path confusion
- Unexpected endpoint matching behavior

**Remediation:**
```c
size_t path_len = space2 - path_start;
if (path_len >= sizeof(req->path)) {
    LOG_WARN("Request path too long: %zu bytes (max %zu)", path_len, sizeof(req->path) - 1);
    return -1;  // Return error instead of silent truncation
}
memcpy(req->path, path_start, path_len);
req->path[path_len] = '\0';
```

**Acceptance Criteria:**
- [ ] HTTP parser returns error for paths exceeding buffer size
- [ ] Error is logged with actual path length for debugging
- [ ] Test: Sending path >256 bytes returns HTTP 400 Bad Request

---

### Finding 2: Missing Bounds Check on Content-Length Header

**Severity:** HIGH
**CWE:** CWE-190 (Integer Overflow or Wraparound), CWE-805 (Buffer Access with Incorrect Length Value)
**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/http/http_server.c`
**Lines:** 502-509

**Vulnerable Code:**
```c
if (strncasecmp(header_start, "Content-Length:", 15) == 0) {
    const char *value = header_start + 15;
    while (*value == ' ') value++;
    req->content_length = strtoul(value, NULL, 10);  // No max check!
    // Cap Content-Length to body buffer size for security
    if (req->content_length > sizeof(req->body) - 1) {
        req->content_length = sizeof(req->body) - 1;
    }
}
```

**Attack Vector:**
1. `strtoul` can return `ULONG_MAX` (typically 4294967295 on 32-bit) for extremely large or invalid values
2. On 32-bit ESP32, `size_t` is 32-bit while `unsigned long` from `strtoul` may be larger on some platforms
3. An attacker could send `Content-Length: 4294967295` which gets capped but the original large value is stored

**Impact:**
- Potential integer overflow/wraparound issues
- Memory allocation confusion in downstream processing

**Remediation:**
```c
if (strncasecmp(header_start, "Content-Length:", 15) == 0) {
    const char *value = header_start + 15;
    while (*value == ' ') value++;

    // Validate Content-Length is reasonable before parsing
    errno = 0;
    char *endptr = NULL;
    unsigned long parsed = strtoul(value, &endptr, 10);

    // Check for parsing errors
    if (errno == ERANGE || parsed > SIZE_MAX || endptr == value) {
        LOG_WARN("Invalid Content-Length header value");
        return -1;
    }

    req->content_length = parsed;
    if (req->content_length > sizeof(req->body) - 1) {
        req->content_length = sizeof(req->body) - 1;
    }
}
```

**Acceptance Criteria:**
- [ ] `strtoul` result is validated for overflow (ERANGE)
- [ ] Invalid Content-Length values reject the request
- [ ] Test: Content-Length: 999999999999 returns HTTP 400

---

### Finding 3: Format String in Error Message (Controlled Input)

**Severity:** LOW
**CWE:** CWE-134 (Use of Externally-Controlled Format String)
**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/http/http_server.c`
**Lines:** 837-839

**Vulnerable Code:**
```c
static void handle_not_found(int client_fd, const http_request_t *req) {
    char message[256];
    snprintf(message, sizeof(message), "Endpoint not found: %s", req->path);
    http_send_error(client_fd, HTTP_NOT_FOUND, message);
}
```

**Attack Vector:**
While `snprintf` is used correctly preventing buffer overflow, the `req->path` is user-controlled input. If `req->path` contained format specifiers like `%s%s%s%s%s%n`, they would be passed through to the JSON serialization but NOT as format strings (since `snprintf` treats `req->path` as a string argument, not a format string).

**Note:** This is NOT a format string vulnerability because `req->path` is passed as an argument, not as the format string. However, the path could contain characters that disrupt JSON output.

**Impact:**
- Minimal - not an actual format string vulnerability
- Potential JSON output corruption if path contains special characters

**Remediation:**
Consider sanitizing the path before including in error messages:
```c
// Truncate and sanitize path for error message
char safe_path[64];
size_t i;
for (i = 0; i < sizeof(safe_path) - 1 && req->path[i] != '\0'; i++) {
    char c = req->path[i];
    // Only allow printable ASCII
    safe_path[i] = (c >= 32 && c < 127) ? c : '?';
}
safe_path[i] = '\0';
```

**Acceptance Criteria:**
- [ ] Error messages sanitize user input before inclusion
- [ ] Non-printable characters are escaped or replaced

---

### Finding 4: Potential Integer Overflow in Config Prune Days Calculation

**Severity:** MEDIUM
**CWE:** CWE-190 (Integer Overflow or Wraparound)
**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/storage/event_logger.c`
**Lines:** 500-503

**Vulnerable Code:**
```c
// Calculate cutoff date
// Use (time_t)86400 to avoid potential integer overflow on 32-bit systems
time_t now = time(NULL);
time_t cutoff = now - ((time_t)days * (time_t)86400);
```

**Analysis:**
The code correctly casts to `time_t` to prevent overflow, which is good. However, the comment indicates awareness of the issue and the fix is properly implemented.

**Status:** MITIGATED - The code already handles this correctly with explicit casts.

---

### Finding 5: strncpy Without Guaranteed Null Termination Pattern

**Severity:** MEDIUM
**CWE:** CWE-170 (Improper Null Termination)
**Files:** Multiple files using strncpy pattern

**Locations:**
- `/Users/jermodelaruelle/Projects/apis/apis-edge/src/http/http_utils.c:19-20`
- `/Users/jermodelaruelle/Projects/apis/apis-edge/src/http/http_utils.c:70-71`
- `/Users/jermodelaruelle/Projects/apis/apis-edge/src/config/config_manager.c:164-165`

**Code Example from http_utils.c:**
```c
strncpy(path, default_path, path_len - 1);
path[path_len - 1] = '\0';
```

**Analysis:**
The codebase consistently follows the pattern of `strncpy` followed by explicit null termination, which is correct. This is the recommended safe pattern.

**Status:** NO ISSUE - The code correctly null-terminates after strncpy calls.

---

### Finding 6: Unbounded File Size in Queue Loading

**Severity:** MEDIUM
**CWE:** CWE-789 (Memory Allocation with Excessive Size Value)
**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/upload/clip_uploader.c`
**Lines:** 166-176

**Vulnerable Code:**
```c
fseek(fp, 0, SEEK_END);
long size = ftell(fp);
fseek(fp, 0, SEEK_SET);

if (size <= 0 || size > 1024 * 1024) {  // Max 1MB
    fclose(fp);
    return -1;
}

char *json_str = malloc(size + 1);
if (!json_str) {
    fclose(fp);
    return -1;
}
```

**Analysis:**
The code properly bounds the file size to 1MB before allocation. This is good practice.

**Status:** NO ISSUE - File size is properly bounded before allocation.

---

### Finding 7: Missing Null Check After malloc in Config Loading

**Severity:** MEDIUM
**CWE:** CWE-476 (NULL Pointer Dereference)
**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/config/config_manager.c`
**Lines:** 454-458

**Vulnerable Code:**
```c
char *json = malloc(size + 1);
if (!json) {
    fclose(fp);
    return -1;
}
```

**Analysis:**
The code correctly checks for malloc failure. This is proper error handling.

**Status:** NO ISSUE - malloc return value is checked.

---

### Finding 8: Server Communication Buffer Size Assumption

**Severity:** HIGH
**CWE:** CWE-120 (Buffer Copy without Checking Size of Input)
**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/server/server_comm.c`
**Lines:** 146-157

**Vulnerable Code:**
```c
// Build request
char request[HTTP_BUFFER_SIZE];  // 4096 bytes
size_t body_len = body ? strlen(body) : 0;
int req_len = snprintf(request, sizeof(request),
    "POST %s HTTP/1.1\r\n"
    "Host: %s\r\n"
    "X-API-Key: %s\r\n"
    "Content-Type: application/json\r\n"
    "Content-Length: %zu\r\n"
    "Connection: close\r\n"
    "\r\n"
    "%s",
    path, host, api_key ? api_key : "", body_len, body ? body : "");
```

**Attack Vector:**
If `host`, `path`, `api_key`, or `body` are long strings (from configuration), the combined HTTP request could exceed 4096 bytes, causing truncation. The `snprintf` return value is used for `send()` but truncation is not checked.

**Impact:**
- Truncated HTTP requests could be malformed
- Potential protocol confusion or incomplete data transmission
- If body is truncated, JSON may be invalid causing server errors

**Remediation:**
```c
int req_len = snprintf(request, sizeof(request), /* ... */);

// Check for truncation
if (req_len < 0 || (size_t)req_len >= sizeof(request)) {
    LOG_ERROR("HTTP request too large: %d bytes (max %zu)",
              req_len, sizeof(request));
    close(sock);
    return -1;
}
```

**Acceptance Criteria:**
- [ ] snprintf return value is checked for truncation
- [ ] Truncated requests return error instead of sending partial data
- [ ] Test: Large body content triggers error before sending

---

### Finding 9: gethostbyname Thread Safety Issue

**Severity:** MEDIUM
**CWE:** CWE-362 (Concurrent Execution using Shared Resource with Improper Synchronization)
**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/upload/clip_uploader.c`
**Lines:** 367-369

**Vulnerable Code:**
```c
struct hostent *he = gethostbyname(host);
if (!he) {
    LOG_ERROR("Failed to resolve host: %s", host);
    return UPLOAD_STATUS_NETWORK_ERROR;
}
```

**Attack Vector:**
`gethostbyname` is not thread-safe. It returns a pointer to static storage that can be overwritten by concurrent calls from other threads. The server_comm.c correctly uses `getaddrinfo` which is thread-safe, but clip_uploader.c uses the deprecated `gethostbyname`.

**Impact:**
- Race condition could cause hostname resolution to return wrong address
- Potential connection to unintended host

**Remediation:**
Use `getaddrinfo` instead (as done in server_comm.c):
```c
struct addrinfo hints = {0};
struct addrinfo *result = NULL;
hints.ai_family = AF_INET;
hints.ai_socktype = SOCK_STREAM;

char port_str[8];
snprintf(port_str, sizeof(port_str), "%u", port);

int gai_err = getaddrinfo(host, port_str, &hints, &result);
if (gai_err != 0) {
    LOG_ERROR("Failed to resolve host: %s (%s)", host, gai_strerror(gai_err));
    return UPLOAD_STATUS_NETWORK_ERROR;
}
// ... use result->ai_addr for connect
freeaddrinfo(result);
```

**Acceptance Criteria:**
- [ ] Replace gethostbyname with getaddrinfo in clip_uploader.c
- [ ] Free addrinfo result after use
- [ ] Test: Concurrent uploads don't cause host resolution errors

---

### Finding 10: Potential Memory Leak in cJSON Error Path

**Severity:** LOW
**CWE:** CWE-401 (Missing Release of Memory after Effective Lifetime)
**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/http/http_server.c`
**Lines:** 319-329

**Code:**
```c
int http_send_error(int client_fd, http_status_t status, const char *message) {
    cJSON *response = cJSON_CreateObject();
    cJSON_AddStringToObject(response, "error", message);
    cJSON_AddNumberToObject(response, "code", status);

    char *json = cJSON_PrintUnformatted(response);
    int result = http_send_json(client_fd, status, json);

    free(json);
    cJSON_Delete(response);
    return result;
}
```

**Analysis:**
The code correctly frees both the JSON string and the cJSON object. However, if `cJSON_PrintUnformatted` returns NULL (out of memory), `free(json)` would be called on NULL which is safe, but `cJSON_Delete` would still work correctly.

**Status:** NO ISSUE - Error handling is acceptable (free(NULL) is safe per C standard).

---

### Finding 11: Log Message Buffer Overflow Risk

**Severity:** LOW
**CWE:** CWE-120 (Buffer Copy without Checking Size of Input)
**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/log.c`
**Lines:** 193-198

**Code:**
```c
// Format the message
char message[1024];
va_list args;
va_start(args, fmt);
vsnprintf(message, sizeof(message), fmt, args);
va_end(args);
```

**Analysis:**
The code uses `vsnprintf` with proper size bounds. Long messages will be truncated but no overflow can occur.

**Status:** NO ISSUE - vsnprintf correctly bounds output.

---

### Finding 12: Missing Return Value Check for cJSON_Parse

**Severity:** MEDIUM
**CWE:** CWE-252 (Unchecked Return Value)
**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/config/config_manager.c`
**Lines:** 535-546

**Code:**
```c
// Pretty print for human readability.
cJSON *root = cJSON_Parse(json);
if (root) {
    char *pretty = cJSON_Print(root);
    if (pretty) {
        fputs(pretty, fp);
        free(pretty);
    }
    cJSON_Delete(root);
} else {
    // Defensive fallback: write unparsed JSON if parse unexpectedly fails
    fputs(json, fp);
}
```

**Analysis:**
The code has a fallback for when cJSON_Parse fails, but the fallback writes potentially malformed JSON to the config file. This is acceptable defensive programming since the JSON was just serialized and should be valid.

**Status:** ACCEPTABLE - Defensive fallback is reasonable.

---

### Finding 13: Unsafe memcpy Without Source Bounds Validation

**Severity:** MEDIUM
**CWE:** CWE-125 (Out-of-bounds Read)
**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/upload/clip_uploader.c`
**Lines:** 391-393

**Vulnerable Code:**
```c
memcpy(&addr.sin_addr, he->h_addr, he->h_length);
```

**Attack Vector:**
After replacing gethostbyname with getaddrinfo (Finding 9), this becomes moot. However, with current code:
- `he->h_length` comes from DNS response
- A malicious DNS server could return corrupted length
- Could cause out-of-bounds read

**Impact:**
- Potential information disclosure
- Crash from invalid memory access

**Remediation:**
Use getaddrinfo which handles address structure safely, or validate h_length:
```c
if (he->h_length > sizeof(addr.sin_addr)) {
    LOG_ERROR("Invalid address length from DNS");
    close(sock);
    return UPLOAD_STATUS_NETWORK_ERROR;
}
memcpy(&addr.sin_addr, he->h_addr, he->h_length);
```

**Acceptance Criteria:**
- [ ] Migrate to getaddrinfo (preferred, fixes Finding 9 too)
- [ ] Or validate h_length before memcpy

---

## Summary of Findings

| ID | Severity | Description | Status |
|----|----------|-------------|--------|
| 1 | MEDIUM | HTTP path truncation without error | Needs Fix |
| 2 | HIGH | Missing Content-Length validation | Needs Fix |
| 3 | LOW | Error message path sanitization | Optional |
| 4 | - | Integer overflow in prune calculation | Already Mitigated |
| 5 | - | strncpy null termination | No Issue |
| 6 | - | File size bounds check | No Issue |
| 7 | - | malloc null check | No Issue |
| 8 | HIGH | HTTP request truncation not detected | Needs Fix |
| 9 | MEDIUM | gethostbyname thread safety | Needs Fix |
| 10 | - | cJSON memory handling | No Issue |
| 11 | - | Log buffer bounds | No Issue |
| 12 | - | cJSON parse fallback | Acceptable |
| 13 | MEDIUM | memcpy bounds from DNS | Needs Fix (with #9) |

## Recommendations Summary

### Critical (Fix Immediately)
1. **Finding 2**: Add proper Content-Length header validation with overflow checks
2. **Finding 8**: Check snprintf return value for truncation in HTTP request building

### High Priority
3. **Finding 1**: Return error on path truncation instead of silent truncation
4. **Finding 9 & 13**: Replace gethostbyname with getaddrinfo in clip_uploader.c

### Medium Priority
5. **Finding 3**: Sanitize user input in error messages (defense in depth)

## Positive Observations

The codebase demonstrates several good security practices:

1. **Consistent use of snprintf**: The code uses `snprintf` instead of `sprintf` throughout
2. **Proper null termination**: strncpy calls are consistently followed by explicit null termination
3. **Bounded string copies**: Most string operations include proper size limits
4. **Null pointer checks**: malloc results are checked before use
5. **Thread safety**: Most modules use proper mutex protection
6. **Input validation**: Configuration values are validated within acceptable ranges
7. **Safe JSON parsing**: cJSON library handles JSON parsing safely

## Test Plan

To verify fixes:

```bash
# Test 1: Path truncation
curl -v "http://device:8080/$(python3 -c 'print("A"*300)')"
# Expected: HTTP 400 Bad Request

# Test 2: Content-Length overflow
curl -v -H "Content-Length: 99999999999999999" http://device:8080/config
# Expected: HTTP 400 Bad Request

# Test 3: Large body
curl -v -X POST -d "$(python3 -c 'print("{" + "\"x\":1," * 1000 + "\"y\":2}")')" http://device:8080/config
# Expected: Graceful handling (truncation error or success)
```

---

**Document Version:** 1.0
**Classification:** Internal Security Document
