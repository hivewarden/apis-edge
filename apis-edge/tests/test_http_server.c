/**
 * HTTP Server Tests.
 *
 * Tests all HTTP endpoints:
 * - GET /status
 * - POST /arm, POST /disarm
 * - GET /config, POST /config
 * - GET /stream
 * - Error handling (404, 400)
 */

#include "http_server.h"
#include "config_manager.h"
#include "log.h"
#include "platform.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <pthread.h>

#include "cJSON.h"
#include "event_logger.h"

// ============================================================================
// Stubs for event_logger (avoid pulling in sqlite3 dependency)
// ============================================================================

bool event_logger_is_initialized(void) { return false; }
int event_logger_get_status(storage_status_t *status) {
    (void)status;
    return -1;
}

// ============================================================================
// Test Framework
// ============================================================================

static int tests_passed = 0;
static int tests_failed = 0;

#define TEST_ASSERT(cond, msg) do { \
    if (cond) { \
        printf("  PASS: %s\n", msg); \
        tests_passed++; \
    } else { \
        printf("  FAIL: %s\n", msg); \
        tests_failed++; \
    } \
} while(0)

// ============================================================================
// HTTP Client Helper
// ============================================================================

typedef struct {
    int status_code;
    char body[4096];
    size_t body_len;
    char content_type[128];
} http_response_t;

static int http_request(uint16_t port, const char *method, const char *path,
                        const char *body, http_response_t *response) {
    // Create socket
    int sock = socket(AF_INET, SOCK_STREAM, 0);
    if (sock < 0) {
        perror("socket");
        return -1;
    }

    // Connect
    struct sockaddr_in addr = {
        .sin_family = AF_INET,
        .sin_port = htons(port),
    };
    inet_pton(AF_INET, "127.0.0.1", &addr.sin_addr);

    if (connect(sock, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        perror("connect");
        close(sock);
        return -1;
    }

    // Build request
    char request[2048];
    int req_len;
    if (body && strlen(body) > 0) {
        req_len = snprintf(request, sizeof(request),
            "%s %s HTTP/1.1\r\n"
            "Host: localhost\r\n"
            "Content-Type: application/json\r\n"
            "Content-Length: %zu\r\n"
            "Connection: close\r\n"
            "\r\n"
            "%s",
            method, path, strlen(body), body);
    } else {
        req_len = snprintf(request, sizeof(request),
            "%s %s HTTP/1.1\r\n"
            "Host: localhost\r\n"
            "Connection: close\r\n"
            "\r\n",
            method, path);
    }

    // Send request
    if (send(sock, request, req_len, 0) < 0) {
        perror("send");
        close(sock);
        return -1;
    }

    // Receive response
    char buffer[8192];
    ssize_t received = recv(sock, buffer, sizeof(buffer) - 1, 0);
    close(sock);

    if (received <= 0) {
        return -1;
    }
    buffer[received] = '\0';

    // Parse response
    memset(response, 0, sizeof(*response));

    // Parse status line
    if (sscanf(buffer, "HTTP/1.1 %d", &response->status_code) != 1) {
        return -1;
    }

    // Find Content-Type header
    const char *ct = strstr(buffer, "Content-Type:");
    if (ct) {
        ct += 13;
        while (*ct == ' ') ct++;
        const char *ct_end = strstr(ct, "\r\n");
        if (ct_end) {
            size_t ct_len = ct_end - ct;
            if (ct_len >= sizeof(response->content_type)) {
                ct_len = sizeof(response->content_type) - 1;
            }
            memcpy(response->content_type, ct, ct_len);
            response->content_type[ct_len] = '\0';
        }
    }

    // Find body
    const char *body_start = strstr(buffer, "\r\n\r\n");
    if (body_start) {
        body_start += 4;
        size_t body_len = received - (body_start - buffer);
        if (body_len >= sizeof(response->body)) {
            body_len = sizeof(response->body) - 1;
        }
        memcpy(response->body, body_start, body_len);
        response->body[body_len] = '\0';
        response->body_len = body_len;
    }

    return 0;
}

// ============================================================================
// Test: Status Endpoint
// ============================================================================

static void test_status_endpoint(uint16_t port) {
    printf("\n--- Test: Status Endpoint ---\n");

    http_response_t response;
    int result = http_request(port, "GET", "/status", NULL, &response);

    TEST_ASSERT(result == 0, "Request succeeded");
    TEST_ASSERT(response.status_code == 200, "Status code is 200");
    TEST_ASSERT(strstr(response.content_type, "application/json") != NULL, "Content-Type is JSON");

    // Parse JSON response
    cJSON *json = cJSON_Parse(response.body);
    TEST_ASSERT(json != NULL, "Response is valid JSON");

    if (json) {
        cJSON *armed = cJSON_GetObjectItem(json, "armed");
        TEST_ASSERT(armed != NULL && cJSON_IsBool(armed), "armed field is boolean");

        cJSON *detection = cJSON_GetObjectItem(json, "detection_enabled");
        TEST_ASSERT(detection != NULL && cJSON_IsBool(detection), "detection_enabled field is boolean");

        cJSON *uptime = cJSON_GetObjectItem(json, "uptime_seconds");
        TEST_ASSERT(uptime != NULL && cJSON_IsNumber(uptime), "uptime_seconds field is number");

        cJSON *detections = cJSON_GetObjectItem(json, "detections_today");
        TEST_ASSERT(detections != NULL && cJSON_IsNumber(detections), "detections_today field is number");

        cJSON *storage = cJSON_GetObjectItem(json, "storage_free_mb");
        TEST_ASSERT(storage != NULL && cJSON_IsNumber(storage), "storage_free_mb field is number");

        cJSON *version = cJSON_GetObjectItem(json, "firmware_version");
        TEST_ASSERT(version != NULL && cJSON_IsString(version), "firmware_version field is string");

        cJSON_Delete(json);
    }
}

// ============================================================================
// Test: Arm/Disarm Endpoints
// ============================================================================

static void test_arm_disarm_endpoints(uint16_t port) {
    printf("\n--- Test: Arm/Disarm Endpoints ---\n");

    http_response_t response;

    // Test POST /arm
    int result = http_request(port, "POST", "/arm", NULL, &response);
    TEST_ASSERT(result == 0, "Arm request succeeded");
    TEST_ASSERT(response.status_code == 200, "Arm status code is 200");

    cJSON *json = cJSON_Parse(response.body);
    if (json) {
        cJSON *armed = cJSON_GetObjectItem(json, "armed");
        TEST_ASSERT(armed != NULL && cJSON_IsTrue(armed), "Armed response shows true");
        cJSON_Delete(json);
    }

    // Verify armed state via status
    result = http_request(port, "GET", "/status", NULL, &response);
    json = cJSON_Parse(response.body);
    if (json) {
        cJSON *armed = cJSON_GetObjectItem(json, "armed");
        TEST_ASSERT(armed != NULL && cJSON_IsTrue(armed), "Status shows armed=true");
        cJSON_Delete(json);
    }

    // Test POST /disarm
    result = http_request(port, "POST", "/disarm", NULL, &response);
    TEST_ASSERT(result == 0, "Disarm request succeeded");
    TEST_ASSERT(response.status_code == 200, "Disarm status code is 200");

    json = cJSON_Parse(response.body);
    if (json) {
        cJSON *armed = cJSON_GetObjectItem(json, "armed");
        TEST_ASSERT(armed != NULL && cJSON_IsFalse(armed), "Disarmed response shows false");
        cJSON_Delete(json);
    }

    // Verify disarmed state via status
    result = http_request(port, "GET", "/status", NULL, &response);
    json = cJSON_Parse(response.body);
    if (json) {
        cJSON *armed = cJSON_GetObjectItem(json, "armed");
        TEST_ASSERT(armed != NULL && cJSON_IsFalse(armed), "Status shows armed=false");
        cJSON_Delete(json);
    }

    // Test wrong method
    result = http_request(port, "GET", "/arm", NULL, &response);
    TEST_ASSERT(result == 0 && response.status_code == 405, "GET /arm returns 405");
}

// ============================================================================
// Test: Config Endpoints
// ============================================================================

static void test_config_endpoints(uint16_t port) {
    printf("\n--- Test: Config Endpoints ---\n");

    http_response_t response;

    // Test GET /config
    int result = http_request(port, "GET", "/config", NULL, &response);
    TEST_ASSERT(result == 0, "Get config request succeeded");
    TEST_ASSERT(response.status_code == 200, "Get config status code is 200");

    cJSON *json = cJSON_Parse(response.body);
    TEST_ASSERT(json != NULL, "Config response is valid JSON");

    if (json) {
        // Check that API key is masked (should be "***" for non-empty keys, or empty if never set)
        cJSON *server = cJSON_GetObjectItem(json, "server");
        TEST_ASSERT(server != NULL, "Config has server section");
        if (server) {
            cJSON *api_key = cJSON_GetObjectItem(server, "api_key");
            if (api_key && cJSON_IsString(api_key)) {
                // If API key was set, it should be masked; if empty, that's also acceptable
                bool masked_or_empty = (strcmp(api_key->valuestring, "***") == 0 ||
                                       strlen(api_key->valuestring) == 0);
                TEST_ASSERT(masked_or_empty, "API key is masked or empty");
            }
        }
        cJSON_Delete(json);
    }

    // Test POST /config with valid update
    const char *update_json = "{\"detection\": {\"fps\": 15}}";
    result = http_request(port, "POST", "/config", update_json, &response);
    TEST_ASSERT(result == 0, "Update config request succeeded");
    TEST_ASSERT(response.status_code == 200, "Update config status code is 200");

    // Verify FPS was updated
    result = http_request(port, "GET", "/config", NULL, &response);
    json = cJSON_Parse(response.body);
    if (json) {
        cJSON *detection = cJSON_GetObjectItem(json, "detection");
        if (detection) {
            cJSON *fps = cJSON_GetObjectItem(detection, "fps");
            TEST_ASSERT(fps != NULL && fps->valueint == 15, "FPS was updated to 15");
        }
        cJSON_Delete(json);
    }

    // Test POST /config with invalid update
    const char *invalid_json = "{\"detection\": {\"fps\": 100}}"; // Invalid: max is 30
    result = http_request(port, "POST", "/config", invalid_json, &response);
    TEST_ASSERT(result == 0, "Invalid config request completed");
    TEST_ASSERT(response.status_code == 400, "Invalid config returns 400");

    json = cJSON_Parse(response.body);
    if (json) {
        cJSON *error = cJSON_GetObjectItem(json, "error");
        TEST_ASSERT(error != NULL && cJSON_IsString(error), "Error message present");
        cJSON_Delete(json);
    }

    // Test POST /config with empty body
    result = http_request(port, "POST", "/config", "", &response);
    TEST_ASSERT(result == 0 && response.status_code == 400, "Empty body returns 400");
}

// ============================================================================
// Test: Stream Endpoint
// ============================================================================

static void test_stream_endpoint(uint16_t port) {
    printf("\n--- Test: Stream Endpoint ---\n");

    // Create socket and connect
    int sock = socket(AF_INET, SOCK_STREAM, 0);
    TEST_ASSERT(sock >= 0, "Socket created");

    struct sockaddr_in addr = {
        .sin_family = AF_INET,
        .sin_port = htons(port),
    };
    inet_pton(AF_INET, "127.0.0.1", &addr.sin_addr);

    int result = connect(sock, (struct sockaddr *)&addr, sizeof(addr));
    TEST_ASSERT(result == 0, "Connected to server");

    // Send request
    const char *request =
        "GET /stream HTTP/1.1\r\n"
        "Host: localhost\r\n"
        "Connection: close\r\n"
        "\r\n";
    send(sock, request, strlen(request), 0);

    // Read response - may need multiple reads to get header + first frame
    char buffer[8192];
    size_t total_received = 0;

    // Set receive timeout
    struct timeval timeout = { .tv_sec = 2, .tv_usec = 0 };
    setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));

    // Read until we have enough data or timeout
    while (total_received < sizeof(buffer) - 1) {
        ssize_t received = recv(sock, buffer + total_received,
                                sizeof(buffer) - 1 - total_received, 0);
        if (received <= 0) break;
        total_received += received;

        // Check if we have a complete first frame
        buffer[total_received] = '\0';
        if (strstr(buffer, "--frame") && strstr(buffer, "image/jpeg")) {
            break; // Got what we need
        }
    }

    TEST_ASSERT(total_received > 0, "Received response");

    if (total_received > 0) {
        buffer[total_received] = '\0';

        // Check for MJPEG content type
        TEST_ASSERT(strstr(buffer, "multipart/x-mixed-replace") != NULL,
                    "Content-Type is multipart/x-mixed-replace");
        TEST_ASSERT(strstr(buffer, "boundary=frame") != NULL,
                    "Boundary marker present");

        // Check for first frame (may be in subsequent data)
        TEST_ASSERT(strstr(buffer, "--frame") != NULL,
                    "Frame boundary found");
        TEST_ASSERT(strstr(buffer, "image/jpeg") != NULL,
                    "JPEG content type in frame");
    }

    close(sock);
}

// ============================================================================
// Test: Error Handling
// ============================================================================

static void test_error_handling(uint16_t port) {
    printf("\n--- Test: Error Handling ---\n");

    http_response_t response;

    // Test 404 - Not Found
    int result = http_request(port, "GET", "/nonexistent", NULL, &response);
    TEST_ASSERT(result == 0, "404 request completed");
    TEST_ASSERT(response.status_code == 404, "Unknown endpoint returns 404");

    cJSON *json = cJSON_Parse(response.body);
    if (json) {
        cJSON *error = cJSON_GetObjectItem(json, "error");
        TEST_ASSERT(error != NULL && cJSON_IsString(error), "404 has error message");

        cJSON *code = cJSON_GetObjectItem(json, "code");
        TEST_ASSERT(code != NULL && code->valueint == 404, "404 has code field");
        cJSON_Delete(json);
    }

    // Test 405 - Method Not Allowed
    result = http_request(port, "DELETE", "/status", NULL, &response);
    TEST_ASSERT(result == 0, "405 request completed");
    TEST_ASSERT(response.status_code == 405, "Wrong method returns 405");
}

// ============================================================================
// Test: Server Lifecycle
// ============================================================================

static void test_server_lifecycle(void) {
    printf("\n--- Test: Server Lifecycle ---\n");

    // Test default config
    http_config_t config = http_server_default_config();
    TEST_ASSERT(config.port == 8080, "Default port is 8080");
    TEST_ASSERT(config.max_connections == 4, "Default max_connections is 4");
    TEST_ASSERT(config.timeout_ms == 5000, "Default timeout is 5000ms");

    // Test not running initially
    TEST_ASSERT(!http_server_is_running(), "Server not running initially");

    // Test init with ephemeral port
    http_config_t test_config = {
        .port = 0, // Ephemeral
        .max_connections = 2,
        .timeout_ms = 2000,
    };

    int result = http_server_init(&test_config);
    TEST_ASSERT(result == 0, "Server init succeeded");

    uint16_t port = http_server_get_port();
    TEST_ASSERT(port > 0, "Got ephemeral port");
    printf("    Using port: %d\n", port);

    // Test start
    result = http_server_start(true);
    TEST_ASSERT(result == 0, "Server start succeeded");
    TEST_ASSERT(http_server_is_running(), "Server is running");

    // Give server time to start
    apis_sleep_ms(100);

    // Run endpoint tests
    test_status_endpoint(port);
    test_arm_disarm_endpoints(port);
    test_config_endpoints(port);
    test_stream_endpoint(port);
    test_error_handling(port);

    // Test stop
    http_server_stop();
    TEST_ASSERT(!http_server_is_running(), "Server stopped");

    // Test cleanup
    http_server_cleanup();
}

// ============================================================================
// Main
// ============================================================================

int main(void) {
    // Initialize logging (suppress during tests)
    log_init(NULL, LOG_LEVEL_ERROR, false);

    // Initialize config manager (needed for arm/disarm and config endpoints)
    config_manager_init(true); // Use dev path

    printf("=== HTTP Server Tests ===\n");

    test_server_lifecycle();

    printf("\n=== Results: %d passed, %d failed ===\n",
           tests_passed, tests_failed);

    config_manager_cleanup();

    return tests_failed > 0 ? 1 : 0;
}
