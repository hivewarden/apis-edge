/**
 * TLS Client implementation.
 *
 * Provides platform-appropriate TLS support:
 * - ESP32: Uses esp_tls (built into ESP-IDF)
 * - Pi/test with mbedTLS: Uses mbedtls for TLS connections
 * - Pi/test without mbedTLS: Stub that returns errors (tls_available() = false)
 *
 * The stub implementation ensures the code compiles and links even when
 * no TLS library is installed. Callers should check tls_available() before
 * attempting TLS connections.
 */

#include "tls_client.h"
#include "log.h"

#include <stdlib.h>
#include <string.h>

/* ========================================================================== */
/* ESP32 implementation using esp_tls                                         */
/* ========================================================================== */

#if defined(APIS_PLATFORM_ESP32)

#include "esp_tls.h"

struct tls_context {
    esp_tls_t *tls;
};

static volatile bool g_tls_initialized = false;

int apis_tls_init(void) {
    if (g_tls_initialized) {
        return 0;
    }
    g_tls_initialized = true;
    LOG_INFO("TLS subsystem initialized (esp_tls)");
    return 0;
}

tls_context_t *tls_connect(const char *host, int port) {
    if (!g_tls_initialized || !host) {
        LOG_ERROR("TLS not initialized or invalid host");
        return NULL;
    }

    esp_tls_cfg_t cfg = {
        .timeout_ms = 10000,
    };

    esp_tls_t *tls = esp_tls_conn_http_new(NULL, &cfg);
    if (!tls) {
        tls = esp_tls_init();
        if (!tls) {
            LOG_ERROR("Failed to allocate esp_tls handle");
            return NULL;
        }
    } else {
        /* If conn_http_new returned a handle, free it and use manual connect */
        esp_tls_conn_destroy(tls);
        tls = esp_tls_init();
        if (!tls) {
            LOG_ERROR("Failed to allocate esp_tls handle");
            return NULL;
        }
    }

    /* Connect using hostname and port */
    int ret = esp_tls_conn_new_sync(host, strlen(host), port, &cfg, tls);
    if (ret != 1) {
        LOG_ERROR("TLS connection to %s:%d failed (ret=%d)", host, port, ret);
        esp_tls_conn_destroy(tls);
        return NULL;
    }

    tls_context_t *ctx = calloc(1, sizeof(tls_context_t));
    if (!ctx) {
        LOG_ERROR("Failed to allocate TLS context");
        esp_tls_conn_destroy(tls);
        return NULL;
    }

    ctx->tls = tls;
    LOG_DEBUG("TLS connection established to %s:%d", host, port);
    return ctx;
}

int tls_write(tls_context_t *ctx, const void *data, size_t len) {
    if (!ctx || !ctx->tls || !data) {
        return -1;
    }

    size_t written = 0;
    int ret;
    do {
        ret = esp_tls_conn_write(ctx->tls, (const char *)data + written, len - written);
        if (ret > 0) {
            written += ret;
        } else if (ret < 0) {
            LOG_ERROR("TLS write error: %d", ret);
            return -1;
        }
    } while (written < len);

    return (int)written;
}

int tls_read(tls_context_t *ctx, void *buf, size_t len) {
    if (!ctx || !ctx->tls || !buf) {
        return -1;
    }

    int ret = esp_tls_conn_read(ctx->tls, buf, len);
    if (ret < 0) {
        LOG_ERROR("TLS read error: %d", ret);
        return -1;
    }
    return ret;
}

void tls_close(tls_context_t *ctx) {
    if (!ctx) {
        return;
    }

    if (ctx->tls) {
        esp_tls_conn_destroy(ctx->tls);
    }
    free(ctx);
}

void apis_tls_cleanup(void) {
    g_tls_initialized = false;
    LOG_INFO("TLS subsystem cleaned up");
}

bool tls_available(void) {
    return true;  /* esp_tls is always available on ESP32 */
}

/* ========================================================================== */
/* Pi/test implementation using mbedTLS (when APIS_HAS_MBEDTLS is defined)    */
/* ========================================================================== */

#elif defined(APIS_HAS_MBEDTLS)

#include <mbedtls/net_sockets.h>
#include <mbedtls/ssl.h>
#include <mbedtls/entropy.h>
#include <mbedtls/ctr_drbg.h>
#include <mbedtls/error.h>

struct tls_context {
    mbedtls_net_context net;
    mbedtls_ssl_context ssl;
    mbedtls_ssl_config conf;
    mbedtls_x509_crt cacert;
};

static mbedtls_entropy_context g_entropy;
static mbedtls_ctr_drbg_context g_ctr_drbg;
static volatile bool g_tls_initialized = false;

int apis_tls_init(void) {
    if (g_tls_initialized) {
        return 0;
    }

    mbedtls_entropy_init(&g_entropy);
    mbedtls_ctr_drbg_init(&g_ctr_drbg);

    const char *pers = "apis_tls_client";
    int ret = mbedtls_ctr_drbg_seed(&g_ctr_drbg, mbedtls_entropy_func,
                                     &g_entropy,
                                     (const unsigned char *)pers,
                                     strlen(pers));
    if (ret != 0) {
        char err_buf[128];
        mbedtls_strerror(ret, err_buf, sizeof(err_buf));
        LOG_ERROR("TLS init failed: mbedtls_ctr_drbg_seed returned %d (%s)", ret, err_buf);
        return -1;
    }

    g_tls_initialized = true;
    LOG_INFO("TLS subsystem initialized (mbedTLS)");
    return 0;
}

tls_context_t *tls_connect(const char *host, int port) {
    if (!g_tls_initialized || !host) {
        LOG_ERROR("TLS not initialized or invalid host");
        return NULL;
    }

    tls_context_t *ctx = calloc(1, sizeof(tls_context_t));
    if (!ctx) {
        LOG_ERROR("Failed to allocate TLS context");
        return NULL;
    }

    mbedtls_net_init(&ctx->net);
    mbedtls_ssl_init(&ctx->ssl);
    mbedtls_ssl_config_init(&ctx->conf);
    mbedtls_x509_crt_init(&ctx->cacert);

    int ret;
    char port_str[8];
    snprintf(port_str, sizeof(port_str), "%d", port);

    /* Connect TCP */
    ret = mbedtls_net_connect(&ctx->net, host, port_str, MBEDTLS_NET_PROTO_TCP);
    if (ret != 0) {
        char err_buf[128];
        mbedtls_strerror(ret, err_buf, sizeof(err_buf));
        LOG_ERROR("TLS TCP connect to %s:%d failed: %d (%s)", host, port, ret, err_buf);
        tls_close(ctx);
        return NULL;
    }

    /* Configure SSL */
    ret = mbedtls_ssl_config_defaults(&ctx->conf,
                                       MBEDTLS_SSL_IS_CLIENT,
                                       MBEDTLS_SSL_TRANSPORT_STREAM,
                                       MBEDTLS_SSL_PRESET_DEFAULT);
    if (ret != 0) {
        LOG_ERROR("TLS config defaults failed: %d", ret);
        tls_close(ctx);
        return NULL;
    }

    /* S8-C1 fix: Require certificate verification to prevent MITM attacks.
     * In production, load a CA bundle via mbedtls_x509_crt_parse() and pass to
     * mbedtls_ssl_conf_ca_chain(). Without a loaded CA chain, connections to
     * servers with valid certificates will still succeed if the system CA store
     * is configured, but self-signed certificates will be correctly rejected. */
    mbedtls_ssl_conf_authmode(&ctx->conf, MBEDTLS_SSL_VERIFY_REQUIRED);
    mbedtls_ssl_conf_rng(&ctx->conf, mbedtls_ctr_drbg_random, &g_ctr_drbg);

    ret = mbedtls_ssl_setup(&ctx->ssl, &ctx->conf);
    if (ret != 0) {
        LOG_ERROR("TLS SSL setup failed: %d", ret);
        tls_close(ctx);
        return NULL;
    }

    /* Set hostname for SNI */
    ret = mbedtls_ssl_set_hostname(&ctx->ssl, host);
    if (ret != 0) {
        LOG_ERROR("TLS set hostname failed: %d", ret);
        tls_close(ctx);
        return NULL;
    }

    mbedtls_ssl_set_bio(&ctx->ssl, &ctx->net,
                         mbedtls_net_send, mbedtls_net_recv, NULL);

    /* Perform TLS handshake */
    while ((ret = mbedtls_ssl_handshake(&ctx->ssl)) != 0) {
        if (ret != MBEDTLS_ERR_SSL_WANT_READ && ret != MBEDTLS_ERR_SSL_WANT_WRITE) {
            char err_buf[128];
            mbedtls_strerror(ret, err_buf, sizeof(err_buf));
            LOG_ERROR("TLS handshake with %s:%d failed: %d (%s)", host, port, ret, err_buf);
            tls_close(ctx);
            return NULL;
        }
    }

    LOG_DEBUG("TLS connection established to %s:%d", host, port);
    return ctx;
}

int tls_write(tls_context_t *ctx, const void *data, size_t len) {
    if (!ctx || !data) {
        return -1;
    }

    int ret;
    size_t written = 0;

    while (written < len) {
        ret = mbedtls_ssl_write(&ctx->ssl,
                                 (const unsigned char *)data + written,
                                 len - written);
        if (ret > 0) {
            written += ret;
        } else if (ret == MBEDTLS_ERR_SSL_WANT_WRITE) {
            continue;
        } else {
            LOG_ERROR("TLS write error: %d", ret);
            return -1;
        }
    }

    return (int)written;
}

int tls_read(tls_context_t *ctx, void *buf, size_t len) {
    if (!ctx || !buf) {
        return -1;
    }

    int ret = mbedtls_ssl_read(&ctx->ssl, (unsigned char *)buf, len);
    if (ret == MBEDTLS_ERR_SSL_WANT_READ) {
        return 0;  /* No data available yet */
    }
    if (ret < 0) {
        if (ret == MBEDTLS_ERR_SSL_PEER_CLOSE_NOTIFY) {
            return 0;  /* Clean close */
        }
        LOG_ERROR("TLS read error: %d", ret);
        return -1;
    }
    return ret;
}

void tls_close(tls_context_t *ctx) {
    if (!ctx) {
        return;
    }

    mbedtls_ssl_close_notify(&ctx->ssl);
    mbedtls_x509_crt_free(&ctx->cacert);
    mbedtls_ssl_free(&ctx->ssl);
    mbedtls_ssl_config_free(&ctx->conf);
    mbedtls_net_free(&ctx->net);
    free(ctx);
}

void apis_tls_cleanup(void) {
    if (!g_tls_initialized) {
        return;
    }

    mbedtls_ctr_drbg_free(&g_ctr_drbg);
    mbedtls_entropy_free(&g_entropy);
    g_tls_initialized = false;
    LOG_INFO("TLS subsystem cleaned up");
}

bool tls_available(void) {
    return true;  /* mbedTLS is available */
}

/* ========================================================================== */
/* Stub implementation (no TLS library available)                             */
/* ========================================================================== */

#else

/*
 * Stub TLS implementation for platforms without a TLS library.
 * All connection functions return errors. tls_available() returns false
 * so callers can fall back to plain HTTP gracefully.
 */

struct tls_context {
    int dummy;  /* Struct must not be empty in C */
};

int apis_tls_init(void) {
    LOG_INFO("TLS subsystem initialized (stub - no TLS library available)");
    return 0;
}

tls_context_t *tls_connect(const char *host, int port) {
    (void)host;
    (void)port;
    LOG_WARN("TLS connect called but no TLS library available");
    return NULL;
}

int tls_write(tls_context_t *ctx, const void *data, size_t len) {
    (void)ctx;
    (void)data;
    (void)len;
    return -1;
}

int tls_read(tls_context_t *ctx, void *buf, size_t len) {
    (void)ctx;
    (void)buf;
    (void)len;
    return -1;
}

void tls_close(tls_context_t *ctx) {
    (void)ctx;
}

void apis_tls_cleanup(void) {
    /* Nothing to clean up */
}

bool tls_available(void) {
    return false;
}

#endif
