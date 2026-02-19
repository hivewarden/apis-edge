/**
 * QR Code Scanner implementation.
 *
 * Uses the quirc library to detect and decode QR codes from camera frames.
 * Parses the claiming JSON payload and extracts server URL + API key.
 */

#include "qr_scanner.h"
#include "log.h"
#include "secure_util.h"
#include "quirc.h"
#include "cJSON.h"

#include <string.h>
#include <stdio.h>

// ============================================================================
// Global State
// ============================================================================

static struct quirc *g_qr = NULL;
static volatile bool g_initialized = false;
static int g_width = 0;
static int g_height = 0;
static bool g_grayscale_fed = false;  // True after feed_grayscale(), cleared by process()

// ============================================================================
// Public API
// ============================================================================

qr_scanner_status_t qr_scanner_init(void) {
    if (g_initialized) {
        return QR_SCANNER_OK;
    }

    g_qr = quirc_new();
    if (!g_qr) {
        LOG_ERROR("QR scanner: failed to allocate quirc instance");
        return QR_SCANNER_ERROR_INIT;
    }

    // Pre-allocate quirc pixel buffer at VGA resolution.
    // This MUST happen before camera_init() because camera DMA uses the
    // MSPI bus for PSRAM access. Allocating 307KB from PSRAM while DMA
    // is active causes MSPI bus starvation and hangs.
    if (quirc_resize(g_qr, FRAME_WIDTH, FRAME_HEIGHT) < 0) {
        LOG_ERROR("QR scanner: failed to resize to %dx%d", FRAME_WIDTH, FRAME_HEIGHT);
        quirc_destroy(g_qr);
        g_qr = NULL;
        return QR_SCANNER_ERROR_INIT;
    }

    g_initialized = true;
    g_width = FRAME_WIDTH;
    g_height = FRAME_HEIGHT;
    LOG_INFO("QR scanner initialized (%dx%d, ~%dKB)",
             FRAME_WIDTH, FRAME_HEIGHT, (FRAME_WIDTH * FRAME_HEIGHT) / 1024);
    return QR_SCANNER_OK;
}

qr_scanner_status_t qr_scanner_scan_frame(const frame_t *frame,
                                           qr_scan_result_t *result) {
    if (!frame || !result) {
        return QR_SCANNER_ERROR_NULL;
    }
    if (!g_initialized || !g_qr) {
        return QR_SCANNER_ERROR_NOT_INIT;
    }

    // Zero result
    memset(result, 0, sizeof(*result));

    // Use pre-configured dimensions (internal SRAM), NOT frame->width/height
    // (PSRAM). On ESP32-S3, camera DMA causes PSRAM cache corruption that
    // makes frame metadata unreliable after grayscale_to_bgr24 writes 921KB.
    int fw = g_width;
    int fh = g_height;

    // Get quirc pixel buffer — quirc_begin returns a pointer to its internal
    // grayscale buffer. We write directly into it to avoid an extra allocation.
    int w = 0, h = 0;
    uint8_t *qr_buf = quirc_begin(g_qr, &w, &h);
    if (!qr_buf || w != fw || h != fh) {
        quirc_end(g_qr);
        return QR_SCANNER_ERROR_INIT;
    }

    // Convert BGR frame to grayscale directly into quirc buffer.
    // Same luminance formula as frame.h:frame_to_grayscale()
    const uint8_t *src = frame->data;
    int pixel_count = fw * fh;
    for (int i = 0; i < pixel_count; i++) {
        size_t offset = (size_t)i * FRAME_CHANNELS;
        qr_buf[i] = (uint8_t)(
            (src[offset + 2] * 77 +    // R * 0.299 * 256
             src[offset + 1] * 150 +   // G * 0.587 * 256
             src[offset + 0] * 29      // B * 0.114 * 256
            ) >> 8
        );
    }

    // Process the image — detect QR finder patterns and extract grids
    quirc_end(g_qr);

    // Check each detected QR code
    int num_codes = quirc_count(g_qr);
    for (int i = 0; i < num_codes; i++) {
        struct quirc_code code;
        struct quirc_data data;

        quirc_extract(g_qr, i, &code);

        quirc_decode_error_t err = quirc_decode(&code, &data);
        if (err != QUIRC_SUCCESS) {
            LOG_DEBUG("QR code %d decode error: %s", i, quirc_strerror(err));
            continue;
        }

        // Try to parse as claiming payload
        if (qr_scanner_parse_payload((const char *)data.payload,
                                      data.payload_len, result) == QR_SCANNER_OK) {
            if (result->found) {
                // Mask API key for logging (show first 4 chars)
                char masked_key[16];
                size_t key_len = strlen(result->api_key);
                if (key_len > 4) {
                    snprintf(masked_key, sizeof(masked_key), "%.4s***",
                             result->api_key);
                } else {
                    snprintf(masked_key, sizeof(masked_key), "***");
                }
                LOG_INFO("QR claiming payload found: server=%s, key=%s",
                         result->server_url, masked_key);
                return QR_SCANNER_OK;
            }
        }
    }

    return QR_SCANNER_OK;
}

qr_scanner_status_t qr_scanner_feed_grayscale(const uint8_t *gray,
                                               int width, int height) {
    if (!g_initialized || !g_qr) {
        return QR_SCANNER_ERROR_NOT_INIT;
    }
    if (!gray) {
        return QR_SCANNER_ERROR_NULL;
    }
    if (width != g_width || height != g_height) {
        return QR_SCANNER_ERROR_INIT;
    }

    // Get quirc pixel buffer and copy raw grayscale directly into it.
    // This is a 307KB PSRAM→PSRAM memcpy — much less MSPI bus contention
    // than the 921KB BGR→gray conversion in scan_frame().
    int w = 0, h = 0;
    uint8_t *qr_buf = quirc_begin(g_qr, &w, &h);
    if (!qr_buf || w != width || h != height) {
        quirc_end(g_qr);
        return QR_SCANNER_ERROR_INIT;
    }

    memcpy(qr_buf, gray, (size_t)width * (size_t)height);
    g_grayscale_fed = true;
    return QR_SCANNER_OK;
}

qr_scanner_status_t qr_scanner_process(qr_scan_result_t *result) {
    if (!result) {
        return QR_SCANNER_ERROR_NULL;
    }
    if (!g_initialized || !g_qr) {
        return QR_SCANNER_ERROR_NOT_INIT;
    }
    if (!g_grayscale_fed) {
        memset(result, 0, sizeof(*result));
        return QR_SCANNER_OK;  // No data to process — not an error
    }

    memset(result, 0, sizeof(*result));
    g_grayscale_fed = false;

    // Process the image — detect QR finder patterns and extract grids
    quirc_end(g_qr);

    // Check each detected QR code
    int num_codes = quirc_count(g_qr);
    for (int i = 0; i < num_codes; i++) {
        struct quirc_code code;
        struct quirc_data data;

        quirc_extract(g_qr, i, &code);

        quirc_decode_error_t err = quirc_decode(&code, &data);
        if (err != QUIRC_SUCCESS) {
            LOG_DEBUG("QR code %d decode error: %s", i, quirc_strerror(err));
            continue;
        }

        // Try to parse as claiming payload
        if (qr_scanner_parse_payload((const char *)data.payload,
                                      data.payload_len, result) == QR_SCANNER_OK) {
            if (result->found) {
                char masked_key[16];
                size_t key_len = strlen(result->api_key);
                if (key_len > 4) {
                    snprintf(masked_key, sizeof(masked_key), "%.4s***",
                             result->api_key);
                } else {
                    snprintf(masked_key, sizeof(masked_key), "***");
                }
                LOG_INFO("QR claiming payload found: server=%s, key=%s",
                         result->server_url, masked_key);
                return QR_SCANNER_OK;
            }
        }
    }

    return QR_SCANNER_OK;
}

bool qr_scanner_is_initialized(void) {
    return g_initialized;
}

void qr_scanner_cleanup(void) {
    if (g_qr) {
        quirc_destroy(g_qr);
        g_qr = NULL;
    }
    g_initialized = false;
    LOG_INFO("QR scanner cleanup complete");
}

const char *qr_scanner_status_str(qr_scanner_status_t status) {
    switch (status) {
        case QR_SCANNER_OK:           return "OK";
        case QR_SCANNER_ERROR_INIT:   return "INIT_ERROR";
        case QR_SCANNER_ERROR_NULL:   return "NULL_POINTER";
        case QR_SCANNER_ERROR_NOT_INIT: return "NOT_INITIALIZED";
        case QR_SCANNER_ERROR_DECODE: return "DECODE_ERROR";
        default:                      return "UNKNOWN";
    }
}

// ============================================================================
// Payload Parser (testable independently)
// ============================================================================

qr_scanner_status_t qr_scanner_parse_payload(const char *payload, size_t len,
                                              qr_scan_result_t *result) {
    if (!payload || !result) {
        return QR_SCANNER_ERROR_NULL;
    }

    memset(result, 0, sizeof(*result));

    // Ensure null-terminated for cJSON (payload from quirc may not be)
    char buf[512];
    if (len >= sizeof(buf)) {
        LOG_DEBUG("QR payload too large: %zu bytes", len);
        return QR_SCANNER_ERROR_DECODE;
    }
    memcpy(buf, payload, len);
    buf[len] = '\0';

    // Parse JSON
    cJSON *root = cJSON_Parse(buf);
    if (!root) {
        LOG_DEBUG("QR payload is not valid JSON");
        // Clear the buffer that may contain sensitive data
        secure_clear(buf, sizeof(buf));
        return QR_SCANNER_ERROR_DECODE;
    }

    // Extract "s" (server URL)
    cJSON *server = cJSON_GetObjectItem(root, "s");
    if (!server || !cJSON_IsString(server) || strlen(server->valuestring) == 0) {
        LOG_DEBUG("QR payload missing 's' (server URL) field");
        cJSON_Delete(root);
        secure_clear(buf, sizeof(buf));
        return QR_SCANNER_ERROR_DECODE;
    }

    // Extract "k" (API key)
    cJSON *key = cJSON_GetObjectItem(root, "k");
    if (!key || !cJSON_IsString(key) || strlen(key->valuestring) == 0) {
        LOG_DEBUG("QR payload missing 'k' (API key) field");
        cJSON_Delete(root);
        secure_clear(buf, sizeof(buf));
        return QR_SCANNER_ERROR_DECODE;
    }

    // Validate URL starts with http:// or https://
    const char *url = server->valuestring;
    if (strncmp(url, "http://", 7) != 0 && strncmp(url, "https://", 8) != 0) {
        LOG_WARN("QR payload URL is not HTTP/HTTPS: %.20s...", url);
        cJSON_Delete(root);
        secure_clear(buf, sizeof(buf));
        return QR_SCANNER_ERROR_DECODE;
    }

    // Copy fields with bounds checking
    strncpy(result->server_url, url, sizeof(result->server_url) - 1);
    result->server_url[sizeof(result->server_url) - 1] = '\0';

    strncpy(result->api_key, key->valuestring, sizeof(result->api_key) - 1);
    result->api_key[sizeof(result->api_key) - 1] = '\0';

    result->found = true;

    cJSON_Delete(root);
    secure_clear(buf, sizeof(buf));
    return QR_SCANNER_OK;
}
