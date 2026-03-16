/**
 * QR Code Scanner for APIS Edge Device.
 *
 * Scans camera frames for QR codes containing device claiming data.
 * Used during the UNCLAIMED state to allow zero-typing device setup:
 * the user shows a QR code (from the dashboard) to the device's camera,
 * and the device extracts the server URL and API key automatically.
 *
 * Expected QR payload (JSON): {"s":"https://server.url","k":"api_key_here"}
 *
 * Uses the quirc library (~15KB binary, ~500KB RAM at 640x480).
 * Only active while the device is unclaimed — once claimed, QR scanning stops.
 *
 * Thread-safe. All state is module-internal.
 */

#ifndef APIS_QR_SCANNER_H
#define APIS_QR_SCANNER_H

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include "frame.h"

/**
 * QR scanner status codes.
 */
typedef enum {
    QR_SCANNER_OK = 0,          // Success
    QR_SCANNER_ERROR_INIT,      // Initialization failed (alloc/resize)
    QR_SCANNER_ERROR_NULL,      // NULL pointer argument
    QR_SCANNER_ERROR_NOT_INIT,  // Scanner not initialized
    QR_SCANNER_ERROR_DECODE,    // QR decode error (not fatal)
} qr_scanner_status_t;

typedef enum {
    QR_CLAIM_NONE = 0,
    QR_CLAIM_API_KEY,
    QR_CLAIM_TOKEN,
} qr_claim_type_t;

/**
 * Result of a QR code scan.
 */
typedef struct {
    bool found;                 // True if a valid claiming QR was decoded
    qr_claim_type_t claim_type; // What kind of claim material was decoded
    char server_url[256];       // Server URL from "s" field
    char api_key[64];           // API key from "k" field
    char claim_token[64];       // Optional short-lived claim token from "t" field
} qr_scan_result_t;

typedef struct {
    bool initialized;
    int width;
    int height;
    int last_code_count;
    char last_decode_error[48];
    char last_decode_pass[32];
    char operator_hint[64];
    uint32_t frames_processed;
    uint32_t frames_with_candidates;
    uint32_t frames_with_payload;
} qr_scanner_diagnostics_t;

/**
 * Initialize the QR scanner with custom resolution.
 * Allocates quirc instance and resizes to specified dimensions.
 * Use QVGA (320x240) on ESP32 for QR-only phase (~75KB PSRAM).
 *
 * @param width  Image width in pixels
 * @param height Image height in pixels
 * @return QR_SCANNER_OK on success, error code on failure
 */
qr_scanner_status_t qr_scanner_init_with_size(int width, int height);

/**
 * Initialize the QR scanner at default frame resolution (640x480).
 * Convenience wrapper for qr_scanner_init_with_size(FRAME_WIDTH, FRAME_HEIGHT).
 *
 * @return QR_SCANNER_OK on success, error code on failure
 */
qr_scanner_status_t qr_scanner_init(void);

/**
 * Scan a camera frame for QR codes.
 *
 * Converts the BGR frame to grayscale directly into the quirc buffer,
 * detects QR codes, and parses the claiming JSON payload.
 *
 * @param frame Camera frame (BGR, 640x480)
 * @param result Output scan result (zeroed if no QR found)
 * @return QR_SCANNER_OK on success (check result->found), error on failure
 */
qr_scanner_status_t qr_scanner_scan_frame(const frame_t *frame,
                                           qr_scan_result_t *result);

/**
 * Check if scanner is initialized.
 * @return true if initialized and ready to scan
 */
bool qr_scanner_is_initialized(void);

/**
 * Clean up QR scanner resources.
 * Safe to call even if not initialized.
 */
void qr_scanner_cleanup(void);

/**
 * Get status name for logging.
 * @param status The status code
 * @return Static string name
 */
const char *qr_scanner_status_str(qr_scanner_status_t status);

/**
 * Feed raw grayscale data directly into the quirc buffer.
 *
 * Called from camera_read() on ESP32 while holding the camera framebuffer,
 * BEFORE the grayscale→BGR expansion. This copies 307KB (vs 921KB for BGR)
 * with minimal PSRAM/DMA contention since one fb is locked by the caller.
 *
 * Must be followed by qr_scanner_process() to run detection and decoding.
 *
 * @param gray   Raw grayscale pixel data (1 byte per pixel)
 * @param width  Image width (must match init dimensions)
 * @param height Image height (must match init dimensions)
 * @return QR_SCANNER_OK on success
 */
qr_scanner_status_t qr_scanner_feed_grayscale(const uint8_t *gray,
                                               int width, int height);

/**
 * Process previously fed grayscale data for QR codes.
 *
 * Runs quirc detection and decoding on data fed via qr_scanner_feed_grayscale().
 * Separating feed from process allows the heavy PSRAM copy to happen during
 * camera_read() (low DMA contention) and quirc processing to happen later.
 *
 * @param result Output scan result (zeroed if no QR found)
 * @return QR_SCANNER_OK on success (check result->found)
 */
qr_scanner_status_t qr_scanner_process(qr_scan_result_t *result);

/**
 * Get current QR scanner diagnostics for operator feedback/debugging.
 *
 * @param out Output diagnostics snapshot
 */
void qr_scanner_get_diagnostics(qr_scanner_diagnostics_t *out);

/* ── Internal / testable helpers (not part of public API) ──────────── */

/**
 * Parse a QR claiming JSON payload.
 * Exported for unit testing only — not intended for external use.
 *
 * @param payload  Raw QR payload string (null-terminated)
 * @param len      Length of payload
 * @param result   Output scan result
 * @return QR_SCANNER_OK if valid claiming payload, error otherwise
 */
qr_scanner_status_t qr_scanner_parse_payload(const char *payload, size_t len,
                                              qr_scan_result_t *result);

#endif // APIS_QR_SCANNER_H
