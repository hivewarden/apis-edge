/**
 * Captive Portal DNS Server for APIS Edge Device.
 *
 * Minimal DNS server that responds to ALL DNS A-record queries with
 * a single IP address (the device's AP IP). This triggers captive
 * portal detection on iOS, Android, Windows, and macOS.
 *
 * DNS protocol reference (simplified for our use case):
 *
 * DNS Query format:
 *   [Header: 12 bytes] [Question section: variable]
 *
 * DNS Header (12 bytes):
 *   - Transaction ID (2 bytes): Copied to response
 *   - Flags (2 bytes): QR=0 for query, QR=1 for response
 *   - QDCOUNT (2 bytes): Number of questions (usually 1)
 *   - ANCOUNT (2 bytes): Number of answers (0 in query, 1 in our response)
 *   - NSCOUNT (2 bytes): 0
 *   - ARCOUNT (2 bytes): 0
 *
 * Question section:
 *   - QNAME: Domain name in label format (e.g., \x07example\x03com\x00)
 *   - QTYPE (2 bytes): 1 = A record (IPv4)
 *   - QCLASS (2 bytes): 1 = IN (Internet)
 *
 * Our response appends an answer after the question:
 *   - NAME: Pointer to QNAME (0xC00C = offset 12, the start of question)
 *   - TYPE (2 bytes): 1 = A record
 *   - CLASS (2 bytes): 1 = IN
 *   - TTL (4 bytes): 60 seconds (short, since this is temporary)
 *   - RDLENGTH (2 bytes): 4 (IPv4 = 4 bytes)
 *   - RDATA (4 bytes): The redirect IP address
 *
 * Only responds to A-record (Type 1) queries. AAAA, MX, etc. are ignored
 * so we don't interfere with non-captive-portal traffic more than needed.
 */

#ifdef APIS_PLATFORM_ESP32

#include "captive_dns.h"
#include "log.h"

#include <string.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <errno.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

// ============================================================================
// Constants
// ============================================================================

#define DNS_PORT            53
#define DNS_RECV_BUF_SIZE   512   // DNS over UDP max is 512 bytes (RFC 1035)
#define DNS_HEADER_SIZE     12
#define DNS_QTYPE_A         1     // A record (IPv4 address)
#define DNS_QCLASS_IN       1     // Internet class
#define DNS_TTL             60    // 60 seconds (short — setup is temporary)
#define DNS_TASK_STACK_SIZE 8192
#define DNS_TASK_PRIORITY   4     // Below HTTP server (5)

// DNS header flags
#define DNS_FLAG_QR         0x8000  // Query Response (1 = response)
#define DNS_FLAG_AA         0x0400  // Authoritative Answer
#define DNS_FLAG_RD         0x0100  // Recursion Desired (copy from query)

// ============================================================================
// State
// ============================================================================

static int g_dns_fd = -1;
static volatile bool g_dns_running = false;
static uint32_t g_redirect_ip = 0;
static TaskHandle_t g_dns_task = NULL;

// ============================================================================
// DNS Parsing Helpers
// ============================================================================

/**
 * Skip over a DNS name in label format.
 *
 * DNS names are encoded as a sequence of labels:
 *   \x07example\x03com\x00
 * Each label starts with a length byte, followed by that many chars.
 * The name ends with a zero-length label (\x00).
 *
 * Also handles compression pointers (0xC0XX) which point to an earlier
 * position in the message.
 *
 * @param buf    Start of the DNS name
 * @param buf_end End of the buffer (for bounds checking)
 * @return Pointer to the byte after the name, or NULL on error
 */
static const uint8_t *skip_dns_name(const uint8_t *buf, const uint8_t *buf_end) {
    while (buf < buf_end) {
        uint8_t len = *buf;
        if (len == 0) {
            return buf + 1;  // Past the terminating zero
        }
        if ((len & 0xC0) == 0xC0) {
            // Compression pointer: 2 bytes total
            return buf + 2;
        }
        buf += 1 + len;  // Skip length byte + label content
    }
    return NULL;  // Ran off the end
}

/**
 * Build a DNS response for an A-record query.
 *
 * Takes the original query and constructs a response that says
 * "whatever you asked about resolves to [redirect_ip]".
 *
 * @param query      Original DNS query
 * @param query_len  Length of query
 * @param response   Output buffer (must be >= query_len + 16)
 * @param ip         IPv4 address to return (network byte order)
 * @return Length of response, or -1 if query should be ignored
 */
static int build_dns_response(const uint8_t *query, int query_len,
                               uint8_t *response, uint32_t ip) {
    // Need at least a complete header + 1 byte of question
    if (query_len < DNS_HEADER_SIZE + 1) {
        return -1;
    }

    // Parse question count from header
    uint16_t qdcount = (query[4] << 8) | query[5];
    if (qdcount == 0) {
        return -1;  // No questions to answer
    }

    // Find the end of the first question (skip QNAME + QTYPE + QCLASS)
    const uint8_t *qname_start = query + DNS_HEADER_SIZE;
    const uint8_t *buf_end = query + query_len;
    const uint8_t *after_qname = skip_dns_name(qname_start, buf_end);
    if (!after_qname || after_qname + 4 > buf_end) {
        return -1;  // Malformed question
    }

    // Check QTYPE (2 bytes after QNAME)
    uint16_t qtype = (after_qname[0] << 8) | after_qname[1];
    if (qtype != DNS_QTYPE_A) {
        return -1;  // Only respond to A-record queries
    }

    // Question section ends after QTYPE (2) + QCLASS (2)
    int question_end = (int)(after_qname + 4 - query);

    // Copy the entire query (header + question) as the basis of our response
    memcpy(response, query, question_end);

    // Modify header flags:
    // - Set QR bit (this is a response)
    // - Set AA bit (we are authoritative)
    // - Preserve RD bit from query
    uint16_t flags = (query[2] << 8) | query[3];
    flags |= DNS_FLAG_QR | DNS_FLAG_AA;
    response[2] = (flags >> 8) & 0xFF;
    response[3] = flags & 0xFF;

    // Set answer count to 1
    response[6] = 0;
    response[7] = 1;

    // Zero out NS and AR counts
    response[8] = 0; response[9] = 0;
    response[10] = 0; response[11] = 0;

    // Append answer section after the question
    int pos = question_end;

    // NAME: Use compression pointer to QNAME at offset 12
    response[pos++] = 0xC0;
    response[pos++] = 0x0C;

    // TYPE: A record (1)
    response[pos++] = 0x00;
    response[pos++] = DNS_QTYPE_A;

    // CLASS: IN (1)
    response[pos++] = 0x00;
    response[pos++] = DNS_QCLASS_IN;

    // TTL: 60 seconds (4 bytes, big-endian)
    response[pos++] = 0x00;
    response[pos++] = 0x00;
    response[pos++] = 0x00;
    response[pos++] = DNS_TTL;

    // RDLENGTH: 4 bytes (IPv4 address)
    response[pos++] = 0x00;
    response[pos++] = 0x04;

    // RDATA: IPv4 address (already in network byte order)
    memcpy(&response[pos], &ip, 4);
    pos += 4;

    return pos;
}

// ============================================================================
// DNS Server Task
// ============================================================================

static void dns_server_task(void *arg) {
    (void)arg;

    uint8_t recv_buf[DNS_RECV_BUF_SIZE];
    uint8_t resp_buf[DNS_RECV_BUF_SIZE + 16];  // Room for answer section
    struct sockaddr_in client_addr;
    socklen_t addr_len;

    LOG_INFO("Captive DNS server started on port %d", DNS_PORT);

    while (g_dns_running) {
        addr_len = sizeof(client_addr);
        int recv_len = recvfrom(g_dns_fd, recv_buf, sizeof(recv_buf), 0,
                                (struct sockaddr *)&client_addr, &addr_len);

        if (recv_len <= 0) {
            if (g_dns_running) {
                // Brief delay before retrying to avoid busy-loop on error
                vTaskDelay(pdMS_TO_TICKS(100));
            }
            continue;
        }

        // Build response (returns -1 for non-A-record queries)
        int resp_len = build_dns_response(recv_buf, recv_len, resp_buf,
                                           g_redirect_ip);
        if (resp_len <= 0) {
            continue;  // Silently ignore non-A queries
        }

        // Send response back to the querying client
        sendto(g_dns_fd, resp_buf, resp_len, 0,
               (struct sockaddr *)&client_addr, addr_len);
    }

    LOG_INFO("Captive DNS server stopped");
    vTaskDelete(NULL);
}

// ============================================================================
// Public API
// ============================================================================

int captive_dns_start(uint32_t redirect_ip) {
    if (g_dns_running) {
        LOG_WARN("Captive DNS server already running");
        return 0;
    }

    g_redirect_ip = redirect_ip;

    // Create UDP socket
    g_dns_fd = socket(AF_INET, SOCK_DGRAM, 0);
    if (g_dns_fd < 0) {
        LOG_ERROR("DNS: Failed to create socket: %s", strerror(errno));
        return -1;
    }

    // Allow address reuse
    int opt = 1;
    setsockopt(g_dns_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    // Bind to port 53
    struct sockaddr_in addr = {
        .sin_family = AF_INET,
        .sin_addr.s_addr = INADDR_ANY,
        .sin_port = htons(DNS_PORT),
    };

    if (bind(g_dns_fd, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        LOG_ERROR("DNS: Failed to bind to port %d: %s", DNS_PORT, strerror(errno));
        close(g_dns_fd);
        g_dns_fd = -1;
        return -1;
    }

    // Set receive timeout so the task can check g_dns_running periodically
    struct timeval tv = { .tv_sec = 1, .tv_usec = 0 };
    setsockopt(g_dns_fd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));

    g_dns_running = true;

    // Start DNS server as a FreeRTOS task
    BaseType_t ret = xTaskCreate(
        dns_server_task,
        "captive_dns",
        DNS_TASK_STACK_SIZE,
        NULL,
        DNS_TASK_PRIORITY,
        &g_dns_task);

    if (ret != pdPASS) {
        LOG_ERROR("DNS: Failed to create task");
        g_dns_running = false;
        close(g_dns_fd);
        g_dns_fd = -1;
        return -1;
    }

    char ip_str[16];
    struct in_addr in = { .s_addr = redirect_ip };
    inet_ntoa_r(in, ip_str, sizeof(ip_str));
    LOG_INFO("Captive DNS: all queries → %s", ip_str);

    return 0;
}

void captive_dns_stop(void) {
    if (!g_dns_running) {
        return;
    }

    g_dns_running = false;

    if (g_dns_fd >= 0) {
        close(g_dns_fd);
        g_dns_fd = -1;
    }

    // Task will self-delete via vTaskDelete(NULL)
    // Give it a moment to clean up
    vTaskDelay(pdMS_TO_TICKS(200));
    g_dns_task = NULL;

    LOG_INFO("Captive DNS server stopped");
}

#endif // APIS_PLATFORM_ESP32
