/**
 * HTTP response receive helpers.
 *
 * Reads complete HTTP responses by looping until the connection closes
 * or the buffer is full. Handles TCP fragmentation for both plain
 * sockets and TLS connections.
 *
 * These helpers use "Connection: close" semantics — the server closes
 * the connection when the response is complete. No Content-Length
 * parsing or chunked transfer encoding support is needed because all
 * APIS server endpoints use Connection: close.
 */

#ifndef HTTP_RECV_H
#define HTTP_RECV_H

#include <stddef.h>
#include "tls_client.h"

/**
 * Read a full HTTP response over a TLS connection.
 *
 * Loops on tls_read() until the connection closes (returns 0),
 * an error occurs, or the buffer is full.
 *
 * @param ctx       TLS context (must be connected)
 * @param buf       Buffer to read into
 * @param buf_size  Total buffer capacity (response is NUL-terminated)
 * @return          Bytes read on success (>0), or -1 on error
 */
int tls_recv_full(tls_context_t *ctx, char *buf, size_t buf_size);

/**
 * Read a full HTTP response over a plain TCP socket.
 *
 * Loops on recv() until the connection closes, an error occurs,
 * or the buffer is full. Handles EINTR.
 *
 * @param sockfd    Connected socket descriptor
 * @param buf       Buffer to read into
 * @param buf_size  Total buffer capacity (response is NUL-terminated)
 * @return          Bytes read on success (>0), or -1 on error
 */
int plain_recv_full(int sockfd, char *buf, size_t buf_size);

#endif /* HTTP_RECV_H */
