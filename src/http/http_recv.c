/**
 * HTTP response receive helpers.
 *
 * Loops on recv/tls_read to handle TCP fragmentation.
 * All APIS server endpoints use "Connection: close", so we read
 * until the peer closes the connection (returns 0).
 */

#include "http_recv.h"
#include "log.h"

#include <errno.h>
#include <string.h>

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
#include <sys/socket.h>
#endif

int tls_recv_full(tls_context_t *ctx, char *buf, size_t buf_size) {
    if (!ctx || !buf || buf_size < 2) {
        return -1;
    }

    size_t total = 0;
    while (total < buf_size - 1) {
        int chunk = tls_read(ctx, buf + total, buf_size - 1 - total);
        if (chunk < 0) {
            if (total > 0) break;  /* Got some data, use it */
            return -1;
        }
        if (chunk == 0) break;  /* Connection closed — response complete */
        total += (size_t)chunk;
    }

    if (total == 0) {
        LOG_ERROR("Empty TLS response");
        return -1;
    }

    buf[total] = '\0';
    return (int)total;
}

int plain_recv_full(int sockfd, char *buf, size_t buf_size) {
    if (sockfd < 0 || !buf || buf_size < 2) {
        return -1;
    }

    size_t total = 0;
    while (total < buf_size - 1) {
#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
        ssize_t chunk = recv(sockfd, buf + total, buf_size - 1 - total, 0);
        if (chunk < 0) {
            if (errno == EINTR) continue;
            if (total > 0) break;
            LOG_ERROR("recv error: %s", strerror(errno));
            return -1;
        }
#else
        /* ESP32 — should not be called (uses esp_http_client) */
        int chunk = -1;
        (void)sockfd;
        return -1;
#endif
        if (chunk == 0) break;  /* Connection closed */
        total += (size_t)chunk;
    }

    if (total == 0) {
        LOG_ERROR("Empty HTTP response");
        return -1;
    }

    buf[total] = '\0';
    return (int)total;
}
