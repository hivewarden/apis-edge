/**
 * QR Code Scanner implementation.
 *
 * Uses the quirc library to detect and decode QR codes from camera frames.
 * Parses the claiming payload and extracts server URL + API key.
 */

#include "qr_scanner.h"
#include "log.h"
#include "psram_alloc.h"
#include "secure_util.h"
#include "platform_mutex.h"
#include "quirc.h"
#include "cJSON.h"

#include <string.h>
#include <stdio.h>
#include <ctype.h>
#include <stdlib.h>

APIS_MUTEX_DECLARE(qr_scanner);
#define QR_LOCK()   APIS_MUTEX_LOCK(qr_scanner)
#define QR_UNLOCK() APIS_MUTEX_UNLOCK(qr_scanner)

// Forward declaration — internal process function, caller must hold QR_LOCK
static qr_scanner_status_t qr_scanner_process_locked(qr_scan_result_t *result);

// ============================================================================
// Global State
// ============================================================================

static struct quirc *g_qr = NULL;
static bool g_initialized = false;
static int g_width = 0;
static int g_height = 0;
static bool g_grayscale_fed = false;  // True after feed_grayscale(), cleared by process()
static uint8_t *g_source_gray = NULL;
static size_t g_source_gray_capacity = 0;
static qr_scanner_diagnostics_t g_diag = {0};

typedef enum {
    QR_IMAGE_PASS_RAW = 0,
    QR_IMAGE_PASS_CONTRAST,
    QR_IMAGE_PASS_BINARY,
} qr_image_pass_t;

static bool is_claim_token_payload(const char *value, size_t len) {
    if (!value || len < 8 || len >= sizeof(((qr_scan_result_t *)0)->claim_token)) {
        return false;
    }
    if (strncmp(value, "HWC1", 4) != 0) {
        return false;
    }
    for (size_t i = 4; i < len; i++) {
        unsigned char c = (unsigned char)value[i];
        if (!(isdigit(c) || (c >= 'A' && c <= 'Z'))) {
            return false;
        }
    }
    return true;
}

static void set_claim_token_result(qr_scan_result_t *result, const char *token) {
    snprintf(result->claim_token, sizeof(result->claim_token), "%s", token);
    result->claim_type = QR_CLAIM_TOKEN;
    result->found = true;
}

static void set_api_key_result(qr_scan_result_t *result, const char *api_key) {
    snprintf(result->api_key, sizeof(result->api_key), "%s", api_key);
    result->claim_type = QR_CLAIM_API_KEY;
    result->found = true;
}

static void reset_diagnostics(void) {
    memset(&g_diag, 0, sizeof(g_diag));
    g_diag.initialized = g_initialized;
    g_diag.width = g_width;
    g_diag.height = g_height;
    snprintf(g_diag.last_decode_pass, sizeof(g_diag.last_decode_pass), "%s", "none");
    snprintf(g_diag.operator_hint, sizeof(g_diag.operator_hint), "%s",
             "Show the full QR code on screen");
}

static bool ensure_source_gray_capacity(size_t bytes) {
    if (bytes == 0) {
        return false;
    }
    if (g_source_gray && g_source_gray_capacity >= bytes) {
        return true;
    }

    uint8_t *new_buf = (uint8_t *)psram_malloc(bytes);
    if (!new_buf) {
        LOG_ERROR("QR scanner: failed to allocate source grayscale buffer (%zu bytes)", bytes);
        return false;
    }

    psram_free(g_source_gray);
    g_source_gray = new_buf;
    g_source_gray_capacity = bytes;
    return true;
}

static const char *qr_image_pass_name(qr_image_pass_t pass) {
    switch (pass) {
        case QR_IMAGE_PASS_RAW:
            return "raw";
        case QR_IMAGE_PASS_CONTRAST:
            return "contrast";
        case QR_IMAGE_PASS_BINARY:
            return "binary";
        default:
            return "unknown";
    }
}

static void update_operator_hint(const char *hint) {
    if (!hint || !hint[0]) {
        g_diag.operator_hint[0] = '\0';
        return;
    }

    snprintf(g_diag.operator_hint, sizeof(g_diag.operator_hint), "%s", hint);
}

static void analyze_grayscale_levels(const uint8_t *gray, size_t pixels,
                                     uint8_t *low_out, uint8_t *high_out) {
    uint32_t hist[256] = {0};
    size_t clip = pixels / 100U;  // Trim 1% from each tail for stretch.
    size_t accum = 0;
    uint8_t low = 0;
    uint8_t high = 255;

    if (!gray || pixels == 0) {
        *low_out = 0;
        *high_out = 255;
        return;
    }

    for (size_t i = 0; i < pixels; i++) {
        hist[gray[i]]++;
    }

    for (int i = 0; i < 256; i++) {
        accum += hist[i];
        if (accum > clip) {
            low = (uint8_t)i;
            break;
        }
    }

    accum = 0;
    for (int i = 255; i >= 0; i--) {
        accum += hist[i];
        if (accum > clip) {
            high = (uint8_t)i;
            break;
        }
    }

    if (high <= (uint8_t)(low + 8U)) {
        low = 0;
        high = 255;
    }

    *low_out = low;
    *high_out = high;
}

static inline uint8_t stretch_pixel(uint8_t value, uint8_t low, uint8_t high) {
    if (high <= low) {
        return value;
    }
    if (value <= low) {
        return 0;
    }
    if (value >= high) {
        return 255;
    }
    return (uint8_t)(((int)(value - low) * 255) / (int)(high - low));
}

static void prepare_pass_image(qr_image_pass_t pass, const uint8_t *src, uint8_t *dst,
                               size_t pixels, uint8_t low, uint8_t high) {
    if (pass == QR_IMAGE_PASS_RAW) {
        memcpy(dst, src, pixels);
        return;
    }

    for (size_t i = 0; i < pixels; i++) {
        uint8_t stretched = stretch_pixel(src[i], low, high);
        if (pass == QR_IMAGE_PASS_BINARY) {
            dst[i] = stretched >= 128U ? 255U : 0U;
        } else {
            dst[i] = stretched;
        }
    }
}

static quirc_decode_error_t decode_code_with_retry(struct quirc_code *code,
                                                   struct quirc_data *data,
                                                   bool *used_flip) {
    quirc_decode_error_t err = quirc_decode(code, data);
    if (used_flip) {
        *used_flip = false;
    }

    if (err == QUIRC_SUCCESS) {
        return err;
    }

    if (err == QUIRC_ERROR_DATA_ECC || err == QUIRC_ERROR_FORMAT_ECC) {
        struct quirc_code flipped = *code;
        quirc_flip(&flipped);
        err = quirc_decode(&flipped, data);
        if (err == QUIRC_SUCCESS && used_flip) {
            *used_flip = true;
        }
    }

    return err;
}

static bool qr_run_decode_pass(qr_image_pass_t pass, uint8_t low, uint8_t high,
                               qr_scan_result_t *result, bool *saw_candidates) {
    int w = 0;
    int h = 0;
    uint8_t *qr_buf = quirc_begin(g_qr, &w, &h);
    size_t pixel_count = (size_t)g_width * (size_t)g_height;

    if (!qr_buf || w != g_width || h != g_height) {
        quirc_end(g_qr);
        return false;
    }

    prepare_pass_image(pass, g_source_gray, qr_buf, pixel_count, low, high);
    quirc_end(g_qr);

    int num_codes = quirc_count(g_qr);
    if (num_codes > g_diag.last_code_count) {
        g_diag.last_code_count = num_codes;
    }
    if (num_codes > 0) {
        *saw_candidates = true;
    }

    for (int i = 0; i < num_codes; i++) {
        struct quirc_code code;
        struct quirc_data data;
        bool used_flip = false;

        quirc_extract(g_qr, i, &code);

        quirc_decode_error_t err = decode_code_with_retry(&code, &data, &used_flip);
        if (err != QUIRC_SUCCESS) {
            if (g_diag.last_decode_error[0] == '\0') {
                snprintf(g_diag.last_decode_error, sizeof(g_diag.last_decode_error),
                         "%s", quirc_strerror(err));
                snprintf(g_diag.last_decode_pass, sizeof(g_diag.last_decode_pass),
                         "%s", qr_image_pass_name(pass));
            }
            LOG_DEBUG("QR code %d decode error on %s pass: %s",
                      i, qr_image_pass_name(pass), quirc_strerror(err));
            continue;
        }

        if (qr_scanner_parse_payload((const char *)data.payload,
                                      data.payload_len, result) == QR_SCANNER_OK &&
            result->found) {
            snprintf(g_diag.last_decode_pass, sizeof(g_diag.last_decode_pass),
                     "%s%s", qr_image_pass_name(pass), used_flip ? "_flip" : "");
            g_diag.last_decode_error[0] = '\0';
            return true;
        }

        if (g_diag.last_decode_error[0] == '\0') {
            snprintf(g_diag.last_decode_error, sizeof(g_diag.last_decode_error),
                     "Payload invalid");
            snprintf(g_diag.last_decode_pass, sizeof(g_diag.last_decode_pass),
                     "%s%s", qr_image_pass_name(pass), used_flip ? "_flip" : "");
        }
    }

    return false;
}

// ============================================================================
// Public API
// ============================================================================

qr_scanner_status_t qr_scanner_init_with_size(int width, int height) {
    QR_LOCK();

    if (g_initialized) {
        QR_UNLOCK();
        return QR_SCANNER_OK;
    }

    if (width <= 0 || height <= 0) {
        QR_UNLOCK();
        LOG_ERROR("QR scanner: invalid dimensions %dx%d", width, height);
        return QR_SCANNER_ERROR_INIT;
    }

    g_qr = quirc_new();
    if (!g_qr) {
        QR_UNLOCK();
        LOG_ERROR("QR scanner: failed to allocate quirc instance");
        return QR_SCANNER_ERROR_INIT;
    }

    // Pre-allocate quirc pixel buffer at the requested resolution.
    // This MUST happen before camera_init() because camera DMA uses the
    // MSPI bus for PSRAM access. Allocating from PSRAM while DMA
    // is active causes MSPI bus starvation and hangs.
    if (quirc_resize(g_qr, width, height) < 0) {
        LOG_ERROR("QR scanner: failed to resize to %dx%d", width, height);
        quirc_destroy(g_qr);
        g_qr = NULL;
        QR_UNLOCK();
        return QR_SCANNER_ERROR_INIT;
    }

    if (!ensure_source_gray_capacity((size_t)width * (size_t)height)) {
        quirc_destroy(g_qr);
        g_qr = NULL;
        QR_UNLOCK();
        return QR_SCANNER_ERROR_INIT;
    }

    g_initialized = true;
    g_width = width;
    g_height = height;
    reset_diagnostics();
    g_diag.initialized = true;
    g_diag.width = width;
    g_diag.height = height;
    QR_UNLOCK();

    LOG_INFO("QR scanner initialized (%dx%d, ~%dKB)",
             width, height, (width * height) / 1024);
    return QR_SCANNER_OK;
}

qr_scanner_status_t qr_scanner_init(void) {
    return qr_scanner_init_with_size(FRAME_WIDTH, FRAME_HEIGHT);
}

qr_scanner_status_t qr_scanner_scan_frame(const frame_t *frame,
                                           qr_scan_result_t *result) {
    if (!frame || !result) {
        return QR_SCANNER_ERROR_NULL;
    }

    QR_LOCK();

    if (!g_initialized || !g_qr) {
        QR_UNLOCK();
        return QR_SCANNER_ERROR_NOT_INIT;
    }

    // Zero result
    memset(result, 0, sizeof(*result));

    int fw = g_width;
    int fh = g_height;
    int pixel_count = fw * fh;

    if (!ensure_source_gray_capacity((size_t)pixel_count)) {
        QR_UNLOCK();
        return QR_SCANNER_ERROR_INIT;
    }

    const uint8_t *src = frame->data;
    for (int i = 0; i < pixel_count; i++) {
        size_t offset = (size_t)i * FRAME_CHANNELS;
        g_source_gray[i] = (uint8_t)(
            (src[offset + 2] * 77 +    // R * 0.299 * 256
             src[offset + 1] * 150 +   // G * 0.587 * 256
             src[offset + 0] * 29      // B * 0.114 * 256
            ) >> 8
        );
    }

    g_grayscale_fed = true;
    qr_scanner_status_t status = qr_scanner_process_locked(result);
    QR_UNLOCK();
    return status;
}

qr_scanner_status_t qr_scanner_feed_grayscale(const uint8_t *gray,
                                               int width, int height) {
    QR_LOCK();

    if (!g_initialized || !g_qr) {
        QR_UNLOCK();
        return QR_SCANNER_ERROR_NOT_INIT;
    }
    if (!gray) {
        QR_UNLOCK();
        return QR_SCANNER_ERROR_NULL;
    }
    if (width != g_width || height != g_height) {
        QR_UNLOCK();
        return QR_SCANNER_ERROR_INIT;
    }

    if (!ensure_source_gray_capacity((size_t)width * (size_t)height)) {
        QR_UNLOCK();
        return QR_SCANNER_ERROR_INIT;
    }

    memcpy(g_source_gray, gray, (size_t)width * (size_t)height);
    g_grayscale_fed = true;
    QR_UNLOCK();
    return QR_SCANNER_OK;
}

/**
 * Internal process implementation — caller must hold QR_LOCK.
 */
static qr_scanner_status_t qr_scanner_process_locked(qr_scan_result_t *result) {
    if (!g_grayscale_fed) {
        memset(result, 0, sizeof(*result));
        return QR_SCANNER_OK;  // No data to process — not an error
    }

    memset(result, 0, sizeof(*result));
    g_grayscale_fed = false;
    g_diag.frames_processed++;
    g_diag.last_code_count = 0;
    g_diag.last_decode_error[0] = '\0';
    snprintf(g_diag.last_decode_pass, sizeof(g_diag.last_decode_pass), "%s", "none");
    update_operator_hint("Scanning for the claim QR code");

    uint8_t low = 0;
    uint8_t high = 255;
    bool saw_candidates = false;

    analyze_grayscale_levels(g_source_gray, (size_t)g_width * (size_t)g_height, &low, &high);

    if (qr_run_decode_pass(QR_IMAGE_PASS_RAW, low, high, result, &saw_candidates)) {
        g_diag.frames_with_candidates++;
        g_diag.frames_with_payload++;
    } else if (saw_candidates &&
               qr_run_decode_pass(QR_IMAGE_PASS_CONTRAST, low, high, result, &saw_candidates)) {
        g_diag.frames_with_candidates++;
        g_diag.frames_with_payload++;
    } else if (saw_candidates &&
               qr_run_decode_pass(QR_IMAGE_PASS_BINARY, low, high, result, &saw_candidates)) {
        g_diag.frames_with_candidates++;
        g_diag.frames_with_payload++;
    } else if (!saw_candidates && (g_diag.frames_processed % 4U) == 0U &&
               qr_run_decode_pass(QR_IMAGE_PASS_CONTRAST, low, high, result, &saw_candidates)) {
        g_diag.frames_with_candidates++;
        g_diag.frames_with_payload++;
    } else if (!saw_candidates && (g_diag.frames_processed % 7U) == 0U &&
               qr_run_decode_pass(QR_IMAGE_PASS_BINARY, low, high, result, &saw_candidates)) {
        g_diag.frames_with_candidates++;
        g_diag.frames_with_payload++;
    } else if (saw_candidates) {
        g_diag.frames_with_candidates++;
    }

    if (result->found) {
        char masked_key[16];
        size_t key_len = strlen(result->api_key);
        if (key_len > 4) {
            snprintf(masked_key, sizeof(masked_key), "%.4s***", result->api_key);
        } else {
            snprintf(masked_key, sizeof(masked_key), "***");
        }
        update_operator_hint("QR decoded; claiming device");
        LOG_INFO("QR claiming payload found via %s: server=%s, key=%s",
                 g_diag.last_decode_pass, result->server_url, masked_key);
        return QR_SCANNER_OK;
    }

    if (!saw_candidates) {
        update_operator_hint("Center the full QR code and keep the white border visible");
    } else if (strstr(g_diag.last_decode_error, "ECC") != NULL) {
        update_operator_hint("QR candidate found; hold steady and reduce screen glare");
    } else if (strcmp(g_diag.last_decode_error, "Payload invalid") == 0) {
        update_operator_hint("QR decoded, but the claim payload is invalid");
    } else {
        update_operator_hint("QR candidate found; trying alternate screen profiles");
    }

    return QR_SCANNER_OK;
}

qr_scanner_status_t qr_scanner_process(qr_scan_result_t *result) {
    if (!result) {
        return QR_SCANNER_ERROR_NULL;
    }

    QR_LOCK();

    if (!g_initialized || !g_qr) {
        QR_UNLOCK();
        return QR_SCANNER_ERROR_NOT_INIT;
    }

    qr_scanner_status_t status = qr_scanner_process_locked(result);
    QR_UNLOCK();
    return status;
}

bool qr_scanner_is_initialized(void) {
    QR_LOCK();
    bool init = g_initialized;
    QR_UNLOCK();
    return init;
}

void qr_scanner_cleanup(void) {
    QR_LOCK();

    if (g_qr) {
        quirc_destroy(g_qr);
        g_qr = NULL;
    }
    psram_free(g_source_gray);
    g_source_gray = NULL;
    g_source_gray_capacity = 0;
    g_initialized = false;
    g_width = 0;
    g_height = 0;
    reset_diagnostics();

    QR_UNLOCK();
    LOG_INFO("QR scanner cleanup complete");
}

void qr_scanner_get_diagnostics(qr_scanner_diagnostics_t *out) {
    if (!out) {
        return;
    }

    QR_LOCK();
    *out = g_diag;
    out->initialized = g_initialized;
    out->width = g_width;
    out->height = g_height;
    QR_UNLOCK();
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

    // Support compact non-JSON payloads first so cJSON does not treat a
    // leading-digit hex suffix as partial numeric JSON.
    if (strncmp(buf, "apis_", 5) == 0 && strlen(buf) > 5) {
        set_api_key_result(result, buf);
        secure_clear(buf, sizeof(buf));
        return QR_SCANNER_OK;
    }

    if (is_claim_token_payload(buf, len)) {
        set_claim_token_result(result, buf);
        secure_clear(buf, sizeof(buf));
        return QR_SCANNER_OK;
    }

    if (len == 32) {
        bool is_hex = true;
        for (size_t i = 0; i < len; i++) {
            if (!isxdigit((unsigned char)buf[i])) {
                is_hex = false;
                break;
            }
        }

        if (is_hex) {
            char api_key[64];
            snprintf(api_key, sizeof(api_key), "apis_%.*s", (int)len, buf);
            for (size_t i = 5; api_key[i] != '\0'; i++) {
                api_key[i] = (char)tolower((unsigned char)api_key[i]);
            }
            set_api_key_result(result, api_key);
            secure_clear(buf, sizeof(buf));
            return QR_SCANNER_OK;
        }
    }

    // Parse JSON first. The standard payload is {"s":"...","k":"..."}.
    // A shorter {"k":"..."} payload is also accepted for local-first
    // onboarding flows where the device already knows its home server.
    cJSON *root = cJSON_Parse(buf);
    if (!root) {
        LOG_DEBUG("QR payload is not valid JSON");
        secure_clear(buf, sizeof(buf));
        return QR_SCANNER_ERROR_DECODE;
    }

    // Extract optional "s" (server URL)
    cJSON *server = cJSON_GetObjectItem(root, "s");
    bool has_server =
        server && cJSON_IsString(server) && strlen(server->valuestring) > 0;

    // Extract either "k" (API key) or "t" (short-lived claim token).
    cJSON *key = cJSON_GetObjectItem(root, "k");
    cJSON *token = cJSON_GetObjectItem(root, "t");
    bool has_key = key && cJSON_IsString(key) && strlen(key->valuestring) > 0;
    bool has_token = token && cJSON_IsString(token) &&
                     is_claim_token_payload(token->valuestring, strlen(token->valuestring));
    if (!has_key && !has_token) {
        LOG_DEBUG("QR payload missing supported claim field ('k' or 't')");
        cJSON_Delete(root);
        secure_clear(buf, sizeof(buf));
        return QR_SCANNER_ERROR_DECODE;
    }

    if (has_server) {
        const char *url = server->valuestring;
        if (strncmp(url, "http://", 7) != 0 && strncmp(url, "https://", 8) != 0) {
            LOG_WARN("QR payload URL is not HTTP/HTTPS: %.20s...", url);
            cJSON_Delete(root);
            secure_clear(buf, sizeof(buf));
            return QR_SCANNER_ERROR_DECODE;
        }

        strncpy(result->server_url, url, sizeof(result->server_url) - 1);
        result->server_url[sizeof(result->server_url) - 1] = '\0';
    }

    if (has_key) {
        set_api_key_result(result, key->valuestring);
    } else {
        set_claim_token_result(result, token->valuestring);
    }

    cJSON_Delete(root);
    secure_clear(buf, sizeof(buf));
    return QR_SCANNER_OK;
}
