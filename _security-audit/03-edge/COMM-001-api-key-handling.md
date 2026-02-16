# COMM-001: API Key and Communication Security Vulnerabilities

## Summary

The APIS edge device firmware contains **critical security vulnerabilities** in its API key handling and server communication implementation. The device transmits credentials over unencrypted connections, stores API keys in plaintext without protection, lacks TLS certificate validation, and has no protection against man-in-the-middle attacks.

## Overall Severity: **CRITICAL**

---

## Finding 1: No TLS/SSL Implementation - Plaintext Credential Transmission

### Severity: **CRITICAL**

### CWE Reference
- CWE-319: Cleartext Transmission of Sensitive Information
- CWE-523: Unprotected Transport of Credentials

### Vulnerable Code Locations

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/server/server_comm.c`
**Lines:** 99-187

```c
static int http_post(const char *host, uint16_t port, const char *path,
                     const char *api_key, const char *body,
                     char *response, size_t response_size, int *http_status) {
    // ...

    // Create socket - RAW TCP, NO TLS
    int sock = socket(result->ai_family, result->ai_socktype, result->ai_protocol);

    // Connect using resolved address - PLAINTEXT CONNECTION
    if (connect(sock, result->ai_addr, result->ai_addrlen) < 0) {
        // ...
    }

    // Build request - API KEY SENT IN PLAINTEXT
    char request[HTTP_BUFFER_SIZE];
    int req_len = snprintf(request, sizeof(request),
        "POST %s HTTP/1.1\r\n"
        "Host: %s\r\n"
        "X-API-Key: %s\r\n"  // <-- API KEY IN PLAINTEXT
        "Content-Type: application/json\r\n"
        // ...
        path, host, api_key ? api_key : "", body_len, body ? body : "");

    // Send request - UNENCRYPTED
    if (send(sock, request, req_len, 0) < 0) {
        // ...
    }
}
```

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/upload/clip_uploader.c`
**Lines:** 367-418 (Pi platform), 581-599 (ESP32 platform)

```c
// Pi platform - plaintext socket
int sock = socket(AF_INET, SOCK_STREAM, 0);
// ...
char http_header[1024];
int hdr_len = snprintf(http_header, sizeof(http_header),
    "POST %s HTTP/1.1\r\n"
    "Host: %s\r\n"
    "X-API-Key: %s\r\n"  // <-- API KEY IN PLAINTEXT
    "Content-Type: multipart/form-data; boundary=%s\r\n"
    // ...
    path, host, config->server.api_key, BOUNDARY_STRING, content_length);
```

### Attack Vector

1. Attacker positions themselves on the network path between the edge device and server (LAN, WiFi, ISP level, or any network hop)
2. Using tools like Wireshark, tcpdump, or mitmproxy, attacker captures HTTP traffic
3. API key is visible in plaintext in the `X-API-Key` header
4. Attacker can:
   - Steal the API key and impersonate the device
   - Replay captured requests
   - Modify detection events in transit
   - Inject malicious commands to the device
   - Upload fake clips or delete legitimate ones

### Evidence

No TLS library is included anywhere in the codebase:
```bash
$ grep -r "TLS\|SSL\|mbedtls\|wolfssl\|openssl" apis-edge/
# Returns: No matches found
```

The URL parser accepts `https://` URLs but the transport layer uses raw TCP sockets:

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/http/http_utils.c`
```c
// URL parsing correctly identifies https://
if (strncmp(url, "https://", 8) == 0) {
    start = url + 8;
    *port = 443;  // Sets HTTPS port but...
}
// ...but NO TLS handshake ever occurs!
```

### Impact

- **Complete credential exposure**: Any network observer can steal the API key
- **Device impersonation**: Attacker can send heartbeats and clips as if they were the device
- **Data integrity compromise**: Detection events and clips can be modified in transit
- **Unauthorized device control**: Attacker can arm/disarm the device
- **Privacy violation**: Video clips are transmitted unencrypted

### Remediation

**For Pi Platform (POSIX):**
```c
#include <openssl/ssl.h>
#include <openssl/err.h>

static SSL_CTX *g_ssl_ctx = NULL;

int init_tls(void) {
    SSL_library_init();
    SSL_load_error_strings();

    g_ssl_ctx = SSL_CTX_new(TLS_client_method());
    if (!g_ssl_ctx) {
        LOG_ERROR("Failed to create SSL context");
        return -1;
    }

    // Load system CA certificates
    if (SSL_CTX_set_default_verify_paths(g_ssl_ctx) != 1) {
        LOG_ERROR("Failed to load CA certificates");
        return -1;
    }

    // Require certificate verification
    SSL_CTX_set_verify(g_ssl_ctx, SSL_VERIFY_PEER, NULL);

    // Set minimum TLS version to 1.2
    SSL_CTX_set_min_proto_version(g_ssl_ctx, TLS1_2_VERSION);

    return 0;
}

static int https_post(const char *host, uint16_t port, const char *path,
                      const char *api_key, const char *body,
                      char *response, size_t response_size, int *http_status) {
    // ... socket creation and connect ...

    SSL *ssl = SSL_new(g_ssl_ctx);
    SSL_set_fd(ssl, sock);

    // Set SNI hostname
    SSL_set_tlsext_host_name(ssl, host);

    // Perform TLS handshake
    if (SSL_connect(ssl) != 1) {
        LOG_ERROR("TLS handshake failed: %s",
                  ERR_error_string(ERR_get_error(), NULL));
        SSL_free(ssl);
        close(sock);
        return -1;
    }

    // Verify certificate hostname
    X509 *cert = SSL_get_peer_certificate(ssl);
    if (!cert) {
        LOG_ERROR("No server certificate");
        SSL_free(ssl);
        close(sock);
        return -1;
    }

    // Use SSL_write/SSL_read instead of send/recv
    if (SSL_write(ssl, request, req_len) < 0) {
        // ...
    }

    ssize_t received = SSL_read(ssl, response, response_size - 1);

    SSL_free(ssl);
    close(sock);
    return 0;
}
```

**For ESP32 Platform:**
```c
#include "esp_tls.h"

esp_http_client_config_t http_config = {
    .url = full_url,
    .method = HTTP_METHOD_POST,
    .timeout_ms = UPLOAD_TIMEOUT_SEC * 1000,
    .buffer_size = HTTP_BUFFER_SIZE,
    .cert_pem = server_root_cert_pem,  // Embed or load CA cert
    .skip_cert_common_name_check = false,
    .transport_type = HTTP_TRANSPORT_OVER_SSL,
};
```

### Acceptance Criteria
- [ ] All server communication uses TLS 1.2 or higher
- [ ] Server certificate is validated against trusted CA
- [ ] Certificate hostname verification is enabled
- [ ] Connections fail closed if TLS handshake fails
- [ ] Unit tests verify TLS is required for all server communication

---

## Finding 2: API Key Stored in Plaintext on Filesystem

### Severity: **HIGH**

### CWE Reference
- CWE-312: Cleartext Storage of Sensitive Information
- CWE-522: Insufficiently Protected Credentials

### Vulnerable Code Locations

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/config/config_manager.c`
**Lines:** 499-560

```c
int config_manager_save(void) {
    const char *path = get_config_path();
    // ...

    // Serialize to JSON - API KEY INCLUDED IN PLAINTEXT
    char json[4096];
    if (config_manager_to_json(&g_runtime_config, json, sizeof(json), true) < 0) {
        // ...
    }

    // Write to temp file first (atomic write)
    FILE *fp = fopen(temp_path, "w");  // <-- DEFAULT PERMISSIONS (0644)
    if (!fp) {
        // ...
    }

    // Pretty print for human readability
    cJSON *root = cJSON_Parse(json);
    if (root) {
        char *pretty = cJSON_Print(root);
        if (pretty) {
            fputs(pretty, fp);  // <-- API KEY WRITTEN IN PLAINTEXT
            free(pretty);
        }
        cJSON_Delete(root);
    }

    fclose(fp);
    // ...
}
```

The config file is created with default permissions (typically 0644 - world readable):

**Config File Path:** `/data/apis/config.json`

**Example File Contents:**
```json
{
    "schema_version": 1,
    "device": {
        "id": "apis-unit-001",
        "name": "Hive Protector"
    },
    "server": {
        "url": "https://apis.honeybeegood.be",
        "api_key": "sk_live_abc123xyz789",  // <-- PLAINTEXT!
        "heartbeat_interval_seconds": 60
    },
    "armed": true
}
```

### Attack Vector

1. Attacker gains local access to the device (physical access, SSH, exploited vulnerability)
2. Reads config file: `cat /data/apis/config.json`
3. Extracts API key directly from the file
4. Uses API key to impersonate device or access server API

### Evidence

No file permission restriction is applied:
```bash
$ grep -r "chmod\|0600\|fchmod" apis-edge/
# Returns: No matches found
```

Directory creation uses 0755 (world-readable):
```c
// config_manager.c line 98
if (mkdir(tmp, 0755) != 0 && errno != EEXIST) {
```

### Impact

- Any user on the system can read the API key
- If device is compromised via other vulnerability, API key is immediately accessible
- Physical access to SD card exposes credentials
- Backups contain plaintext credentials

### Remediation

**Restrict file permissions:**
```c
#include <sys/stat.h>

int config_manager_save(void) {
    // ...

    // Open file with restricted permissions (owner read/write only)
    int fd = open(temp_path, O_WRONLY | O_CREAT | O_TRUNC, 0600);
    if (fd < 0) {
        LOG_ERROR("Failed to create config file: %s", strerror(errno));
        return -1;
    }

    FILE *fp = fdopen(fd, "w");
    if (!fp) {
        close(fd);
        return -1;
    }

    // ... write content ...

    fclose(fp);  // Also closes fd

    // Ensure directory is also protected
    chmod("/data/apis", 0700);

    return 0;
}
```

**For enhanced security, consider encrypting sensitive fields:**
```c
#include <sodium.h>  // libsodium

// Derive key from device-specific secret (e.g., MAC address + factory key)
int derive_encryption_key(uint8_t *key) {
    // Use device-unique identifier
    uint8_t device_secret[32];
    get_device_secret(device_secret);  // From secure element or fuses

    return crypto_kdf_derive_from_key(key, 32, 1, "apikey__", device_secret);
}

// Encrypt API key before storage
int encrypt_api_key(const char *plaintext, char *ciphertext, size_t max_len) {
    uint8_t key[32];
    uint8_t nonce[crypto_secretbox_NONCEBYTES];

    derive_encryption_key(key);
    randombytes_buf(nonce, sizeof(nonce));

    // Encrypt and base64 encode for JSON storage
    // ...
}
```

### Acceptance Criteria
- [ ] Config file created with 0600 permissions (owner read/write only)
- [ ] Config directory protected with 0700 permissions
- [ ] API key is encrypted at rest (stretch goal)
- [ ] File permissions verified after every save operation
- [ ] Unit tests verify config file is not world-readable

---

## Finding 3: No Certificate Pinning or Validation

### Severity: **CRITICAL**

### CWE Reference
- CWE-295: Improper Certificate Validation
- CWE-297: Improper Validation of Certificate with Host Mismatch

### Vulnerable Code Locations

Since TLS is not implemented at all (Finding 1), there is no certificate validation. However, even the ESP32 code that uses `esp_http_client` does not configure certificate pinning:

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/upload/clip_uploader.c`
**Lines:** 581-587

```c
// Configure ESP HTTP client - NO CERTIFICATE CONFIGURATION
esp_http_client_config_t http_config = {
    .url = full_url,
    .method = HTTP_METHOD_POST,
    .timeout_ms = UPLOAD_TIMEOUT_SEC * 1000,
    .buffer_size = HTTP_BUFFER_SIZE,
    // MISSING: .cert_pem = ...
    // MISSING: .skip_cert_common_name_check = false (defaults to true!)
};
```

### Attack Vector

1. Attacker performs ARP spoofing or DNS hijacking on local network
2. Redirects device traffic to attacker-controlled server
3. Attacker presents self-signed or fraudulent certificate
4. Device accepts certificate without validation
5. Attacker can:
   - Steal API key and all transmitted data
   - Modify commands sent to device
   - Inject malicious firmware updates

### Impact

- Man-in-the-middle attacks are trivially possible
- Even with TLS, without proper validation, encryption provides no security
- Attacker on same network can completely compromise device

### Remediation

**Certificate Pinning for Production:**
```c
// Embed server certificate or public key hash
static const char server_cert_pem[] =
"-----BEGIN CERTIFICATE-----\n"
"MIIDXTCCAkWgAwIBAgIJAJC1HiIAZAiUMA0Gcz...\n"
// ... full certificate ...
"-----END CERTIFICATE-----\n";

// For ESP32
esp_http_client_config_t http_config = {
    .url = full_url,
    .cert_pem = server_cert_pem,
    .skip_cert_common_name_check = false,
    .transport_type = HTTP_TRANSPORT_OVER_SSL,
};

// For OpenSSL (Pi)
int verify_callback(int preverify_ok, X509_STORE_CTX *ctx) {
    if (!preverify_ok) {
        X509 *err_cert = X509_STORE_CTX_get_current_cert(ctx);
        int err = X509_STORE_CTX_get_error(ctx);
        LOG_ERROR("Certificate verification failed: %s",
                  X509_verify_cert_error_string(err));
        return 0;  // Reject
    }

    // Additional pin check (optional, for defense in depth)
    X509 *cert = X509_STORE_CTX_get_current_cert(ctx);
    if (X509_STORE_CTX_get_error_depth(ctx) == 0) {
        // Leaf certificate - verify public key hash
        if (!verify_public_key_pin(cert)) {
            LOG_ERROR("Certificate public key pin mismatch");
            return 0;
        }
    }

    return 1;  // Accept
}
```

### Acceptance Criteria
- [ ] Server certificate is validated against trusted CA bundle
- [ ] Hostname verification is enabled and enforced
- [ ] Certificate pinning implemented for production server
- [ ] Connection fails if certificate validation fails
- [ ] Pinned certificate can be updated via secure channel

---

## Finding 4: API Key Potentially Logged on Errors

### Severity: **MEDIUM**

### CWE Reference
- CWE-532: Insertion of Sensitive Information into Log File

### Vulnerable Code Locations

While direct API key logging was not found, the HTTP request buffer containing the API key could be logged during error conditions:

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/server/server_comm.c`
**Lines:** 145-162

```c
// Build request - contains API key
char request[HTTP_BUFFER_SIZE];
int req_len = snprintf(request, sizeof(request),
    "POST %s HTTP/1.1\r\n"
    "Host: %s\r\n"
    "X-API-Key: %s\r\n"  // API key in buffer
    // ...
    path, host, api_key ? api_key : "", body_len, body ? body : "");

// If debugging is enabled, this buffer could be logged
// Also, buffer remains in memory and could appear in core dumps
```

### Attack Vector

1. Debug logging is enabled in development or accidentally in production
2. HTTP request buffer is logged for debugging
3. Logs are stored to file or sent to log aggregation service
4. Attacker with log access obtains API key

### Impact

- API keys may appear in log files
- Log aggregation services receive credentials
- Core dumps after crashes may contain credentials

### Remediation

**Ensure API keys are never logged:**
```c
// Add sensitive data masking function
static void mask_sensitive_headers(char *buffer) {
    char *api_key_start = strstr(buffer, "X-API-Key:");
    if (api_key_start) {
        char *value_start = api_key_start + 11;  // Skip "X-API-Key: "
        while (*value_start && *value_start != '\r') {
            *value_start = '*';
            value_start++;
        }
    }
}

// Clear sensitive data from memory after use
static void secure_clear(void *ptr, size_t size) {
    volatile unsigned char *p = ptr;
    while (size--) {
        *p++ = 0;
    }
}

// In http_post after sending:
send(sock, request, req_len, 0);
secure_clear(request, sizeof(request));  // Clear API key from memory
```

### Acceptance Criteria
- [ ] API keys are never written to log files at any log level
- [ ] HTTP buffers containing credentials are zeroed after use
- [ ] Log output is reviewed for credential leakage
- [ ] Core dump generation disabled in production

---

## Finding 5: No Key Rotation Support

### Severity: **MEDIUM**

### CWE Reference
- CWE-324: Use of a Key Past its Expiration Date
- CWE-798: Use of Hard-coded Credentials

### Vulnerable Code Locations

The API key is stored as a static string with no rotation mechanism:

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/include/config_manager.h`
**Lines:** 51-55

```c
typedef struct {
    char url[CFG_MAX_URL_LEN];
    char api_key[CFG_MAX_API_KEY_LEN];  // Single, static key
    uint16_t heartbeat_interval_seconds;
} cfg_server_t;
```

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/server/server_comm.c`
**Lines:** 364-389

```c
// When auth fails, just logs error - no rotation attempt
if (http_status == 401 || http_status == 403) {
    COMM_LOCK();
    g_status = SERVER_STATUS_AUTH_FAILED;
    COMM_UNLOCK();

    LOG_ERROR("Heartbeat failed: authentication error (HTTP %d)", http_status);
    return -1;  // No key rotation, no recovery
}
```

### Attack Vector

1. API key is compromised (any of the above vulnerabilities)
2. Device continues to use compromised key
3. No mechanism to detect key compromise or rotate automatically
4. Attacker maintains persistent access even after breach is detected

### Impact

- Compromised keys cannot be easily rotated without manual intervention
- No automatic key refresh before expiration
- Long-lived credentials increase exposure window

### Remediation

**Implement key rotation protocol:**
```c
typedef struct {
    char url[CFG_MAX_URL_LEN];
    char api_key[CFG_MAX_API_KEY_LEN];
    char api_key_next[CFG_MAX_API_KEY_LEN];  // Pending rotation key
    int64_t key_issued_at;                    // When current key was issued
    int64_t key_expires_at;                   // When key should be rotated
    uint16_t heartbeat_interval_seconds;
} cfg_server_t;

// In heartbeat response handling
cJSON *key_rotation = cJSON_GetObjectItem(resp_json, "key_rotation");
if (key_rotation) {
    cJSON *new_key = cJSON_GetObjectItem(key_rotation, "new_key");
    cJSON *activate_at = cJSON_GetObjectItem(key_rotation, "activate_at");

    if (new_key && cJSON_IsString(new_key)) {
        strncpy(config->server.api_key_next, new_key->valuestring,
                CFG_MAX_API_KEY_LEN - 1);
        config->server.key_expires_at = /* parse activate_at */;
        config_manager_save();
        LOG_INFO("New API key received, will activate at %lld",
                 config->server.key_expires_at);
    }
}

// Before each request, check if rotation is needed
static const char* get_active_api_key(void) {
    const runtime_config_t *config = config_manager_get();

    if (config->server.key_expires_at > 0 &&
        time(NULL) >= config->server.key_expires_at &&
        strlen(config->server.api_key_next) > 0) {

        // Promote next key to current
        config_manager_rotate_key();
    }

    return config->server.api_key;
}
```

### Acceptance Criteria
- [ ] Server can send new API key in heartbeat response
- [ ] Device stores pending key and activates at specified time
- [ ] Old key is securely erased after rotation
- [ ] Device attempts re-auth with new key on 401/403
- [ ] Key age tracking enables proactive rotation

---

## Finding 6: Insecure Fallback on Authentication Failure

### Severity: **MEDIUM**

### CWE Reference
- CWE-636: Not Failing Securely ('Fail Open')

### Vulnerable Code Locations

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/server/server_comm.c`
**Lines:** 267-283

```c
// Check HTTP status
if (http_status == 401 || http_status == 403) {
    COMM_LOCK();
    g_status = SERVER_STATUS_AUTH_FAILED;
    COMM_UNLOCK();

    LOG_ERROR("Heartbeat failed: authentication error (HTTP %d)", http_status);
    return -1;  // Returns error but...
}

// ... device continues to operate normally!
// No lockdown, no re-provisioning attempt
```

The device continues operating normally even when authentication fails, potentially with a compromised or invalid key.

### Attack Vector

1. Attacker compromises API key and rotates it on server
2. Device's key becomes invalid (401/403)
3. Device continues operating in "offline" mode
4. Attacker uses valid key to impersonate device to server
5. Device-server trust is completely broken but device doesn't alert user

### Impact

- Device operates in compromised state without user awareness
- No visual indicator of authentication failure to beekeeper
- Attacker can fully impersonate device to server

### Remediation

```c
// Add escalating response to auth failures
static int g_auth_fail_count = 0;
#define MAX_AUTH_FAILURES 3

if (http_status == 401 || http_status == 403) {
    COMM_LOCK();
    g_status = SERVER_STATUS_AUTH_FAILED;
    g_auth_fail_count++;
    COMM_UNLOCK();

    LOG_ERROR("Heartbeat failed: authentication error (HTTP %d)", http_status);

    // Visual alert to user
    if (led_controller_is_initialized()) {
        led_controller_set_state(LED_STATE_AUTH_FAILED);
    }

    // After repeated failures, require re-provisioning
    if (g_auth_fail_count >= MAX_AUTH_FAILURES) {
        LOG_ERROR("Multiple auth failures - requiring re-provisioning");
        config_manager_set_needs_setup(true);

        // Disable sensitive operations
        config_manager_set_armed(false);

        // Clear potentially compromised key
        config_manager_clear_api_key();
    }

    return -1;
}

// On successful auth, reset counter
g_auth_fail_count = 0;
```

### Acceptance Criteria
- [ ] Visual indicator (LED pattern) shows auth failure
- [ ] After N auth failures, device requires re-provisioning
- [ ] Compromised device is automatically disarmed
- [ ] Auth failure state is persisted across reboots
- [ ] Recovery path documented for users

---

## Finding 7: Local HTTP API Lacks Authentication

### Severity: **HIGH**

### CWE Reference
- CWE-306: Missing Authentication for Critical Function
- CWE-287: Improper Authentication

### Vulnerable Code Locations

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/http/http_server.c`
**Lines:** 531-592

```c
static void route_request(int client_fd, const http_request_t *req) {
    // Handle CORS preflight for all endpoints
    if (strcmp(req->method, "OPTIONS") == 0) {
        handle_options_preflight(client_fd);
        return;
    }

    // NO AUTHENTICATION CHECK!

    // Status endpoint - exposes device state
    if (strcmp(req->path, "/status") == 0) {
        handle_status(client_fd, req);  // Anyone can read status
        return;
    }

    // Arm endpoint - CRITICAL FUNCTION, NO AUTH
    if (strcmp(req->path, "/arm") == 0) {
        handle_arm(client_fd, req);  // Anyone can arm device!
        return;
    }

    // Disarm endpoint - CRITICAL FUNCTION, NO AUTH
    if (strcmp(req->path, "/disarm") == 0) {
        handle_disarm(client_fd, req);  // Anyone can disarm!
        return;
    }

    // Config endpoint - CAN CHANGE API KEY, NO AUTH
    if (strcmp(req->path, "/config") == 0) {
        if (strcmp(req->method, "POST") == 0) {
            handle_config_post(client_fd, req);  // Anyone can reconfigure!
        }
        // ...
    }
    // ...
}
```

### Attack Vector

1. Attacker on same network discovers device (mDNS, network scan)
2. Sends POST to `http://device:8080/config` with new API key
3. Device is reconfigured to report to attacker's server
4. Attacker has full control of device

### Impact

- Any device on local network can arm/disarm the system
- Configuration can be changed including API key and server URL
- Device can be hijacked to report to malicious server
- MJPEG stream accessible without authentication

### Remediation

```c
// Add local authentication token
#define LOCAL_AUTH_TOKEN_LEN 32
static char g_local_auth_token[LOCAL_AUTH_TOKEN_LEN + 1];

int http_server_init(const http_config_t *config) {
    // Generate random local auth token on first boot
    if (strlen(g_local_auth_token) == 0) {
        generate_random_token(g_local_auth_token, LOCAL_AUTH_TOKEN_LEN);
        // Display on LED or serial for initial setup
        LOG_INFO("Local auth token generated - see device display");
    }
    // ...
}

static bool verify_local_auth(const http_request_t *req) {
    // Check Authorization header
    const char *auth_header = get_header(req, "Authorization");
    if (!auth_header) {
        return false;
    }

    // Expect: "Bearer <token>"
    if (strncmp(auth_header, "Bearer ", 7) != 0) {
        return false;
    }

    return strcmp(auth_header + 7, g_local_auth_token) == 0;
}

static void route_request(int client_fd, const http_request_t *req) {
    // Allow OPTIONS without auth (CORS)
    if (strcmp(req->method, "OPTIONS") == 0) {
        handle_options_preflight(client_fd);
        return;
    }

    // Status is safe to expose (no sensitive data)
    if (strcmp(req->path, "/status") == 0 && strcmp(req->method, "GET") == 0) {
        handle_status(client_fd, req);
        return;
    }

    // All other endpoints require authentication
    if (!verify_local_auth(req)) {
        http_send_error(client_fd, HTTP_UNAUTHORIZED, "Authentication required");
        return;
    }

    // ... rest of routing ...
}
```

### Acceptance Criteria
- [ ] Local API requires authentication token
- [ ] Token generated randomly per device
- [ ] Token displayed during setup for user to record
- [ ] Unauthenticated requests to sensitive endpoints return 401
- [ ] CORS headers don't bypass authentication

---

## Audit Summary

| Finding | Severity | Status | Priority |
|---------|----------|--------|----------|
| F1: No TLS - Plaintext Transmission | CRITICAL | Open | P0 |
| F2: Plaintext API Key Storage | HIGH | **Resolved** | P1 |
| F3: No Certificate Validation | CRITICAL | Open | P0 |
| F4: API Key in Logs | MEDIUM | **Resolved** | P2 |
| F5: No Key Rotation | MEDIUM | **Resolved** | P2 |
| F6: Insecure Auth Failure Handling | MEDIUM | **Resolved** | P2 |
| F7: Local API No Authentication | HIGH | **Resolved** | P1 |

## Resolved Findings (2026-01-31)

### F2: Plaintext API Key Storage - RESOLVED
- Config file now created with 0600 permissions (owner read/write only)
- Config directory created with 0700 permissions
- Implemented in config_manager_save() using open() with explicit permissions

### F4: API Key in Logs - RESOLVED
- Added secure_clear() function to zero out memory containing API keys
- HTTP request buffers cleared after sending
- No LOG_ calls include API key values

### F5: No Key Rotation - RESOLVED
- Added api_key_next field for pending rotation key
- Added key_issued_at and key_expires_at timestamps
- Implemented config_manager_set_pending_key() and config_manager_check_key_rotation()

### F6: Insecure Auth Failure Handling - RESOLVED
- Track consecutive auth failures with g_auth_fail_count
- After 3 failures: disarm device, clear API key, require re-provisioning
- Added LED_STATE_AUTH_FAILED visual alert
- Auth failure count resets on success

### F7: Local API No Authentication - RESOLVED
- Generate random 32-char hex token on first boot
- Token persisted to /data/apis/local_auth_token with 0600 permissions
- All control endpoints require "Authorization: Bearer <token>" header
- Constant-time comparison prevents timing attacks
- GET /status allowed without auth (no sensitive data)

## Immediate Actions Required (Remaining)

1. **CRITICAL**: Implement TLS for all server communication
2. **CRITICAL**: Add certificate validation with pinning option

## Testing Requirements

After remediation, the following tests must pass:

```bash
# Verify TLS is required
$ curl -k http://device:8080/status
# Should fail or redirect to HTTPS

# Verify certificate validation
$ curl --cacert /wrong/ca.pem https://device/status
# Should fail with certificate error

# Verify local auth
$ curl http://device:8080/arm -X POST
# Should return 401 Unauthorized

# Verify file permissions
$ ls -la /data/apis/config.json
# Should show -rw------- (0600)

# Verify no credential logging
$ grep -i "api_key\|sk_" /var/log/apis/*.log
# Should return no matches
```

---

*Security Audit Conducted: 2026-01-31*
*Auditor: Claude Code Security Analysis*
*Firmware Version Analyzed: 1.0.0*
