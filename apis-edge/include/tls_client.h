/**
 * TLS Client for APIS Edge Device.
 *
 * Provides a simple TLS wrapper for secure communication with the APIS server.
 * Supports multiple backends:
 * - mbedTLS on Pi/test platforms (when available)
 * - esp_tls on ESP32 (built into ESP-IDF)
 * - Stub implementation when no TLS library is available
 *
 * Usage:
 *   tls_init();
 *   if (tls_available()) {
 *       tls_context_t *ctx = tls_connect("server.example.com", 443);
 *       tls_write(ctx, data, len);
 *       tls_read(ctx, buf, buf_len);
 *       tls_close(ctx);
 *   }
 *   tls_cleanup();
 */

#ifndef APIS_TLS_CLIENT_H
#define APIS_TLS_CLIENT_H

#include <stdbool.h>
#include <stddef.h>

/**
 * Opaque TLS connection context.
 * Internal structure depends on platform and TLS backend.
 */
typedef struct tls_context tls_context_t;

/**
 * Initialize TLS subsystem (call once at startup).
 * @return 0 on success, -1 on error (or if TLS is not available)
 */
int tls_init(void);

/**
 * Create a TLS connection to host:port.
 * Performs TLS handshake and certificate verification.
 *
 * @param host Hostname to connect to
 * @param port Port number (typically 443)
 * @return TLS context on success, NULL on failure
 */
tls_context_t *tls_connect(const char *host, int port);

/**
 * Write data over a TLS connection.
 *
 * @param ctx TLS context from tls_connect()
 * @param data Data to write
 * @param len Length of data in bytes
 * @return Number of bytes written, or -1 on error
 */
int tls_write(tls_context_t *ctx, const void *data, size_t len);

/**
 * Read data from a TLS connection.
 *
 * @param ctx TLS context from tls_connect()
 * @param buf Buffer to read into
 * @param len Maximum bytes to read
 * @return Number of bytes read, or -1 on error
 */
int tls_read(tls_context_t *ctx, void *buf, size_t len);

/**
 * Close and free a TLS connection.
 * Safe to call with NULL context (no-op).
 *
 * @param ctx TLS context to close
 */
void tls_close(tls_context_t *ctx);

/**
 * Cleanup TLS subsystem (call once at shutdown).
 */
void tls_cleanup(void);

/**
 * Check if TLS is available on this platform.
 * When false, tls_connect() will always return NULL.
 *
 * @return true if TLS is available, false otherwise
 */
bool tls_available(void);

#endif /* APIS_TLS_CLIENT_H */
