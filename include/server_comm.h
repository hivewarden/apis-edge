/**
 * Server Communication for APIS Edge Device.
 *
 * Handles heartbeat communication with the APIS server:
 * - Periodic heartbeats every 60 seconds
 * - Reports device status (armed, uptime, storage, pending clips)
 * - Receives config updates from server
 * - Handles offline mode gracefully
 *
 * Thread-safe. Runs a background thread for heartbeats.
 */

#ifndef APIS_SERVER_COMM_H
#define APIS_SERVER_COMM_H

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

/**
 * Heartbeat request body (sent to server).
 */
typedef struct {
    bool armed;
    uint32_t uptime_seconds;
    uint32_t free_storage_mb;
    uint32_t pending_clips;
    const char *firmware_version;
} heartbeat_request_t;

/**
 * Heartbeat response from server.
 */
typedef struct {
    char server_time[32];       // ISO 8601 format
    bool has_config;            // Whether config section present
    bool armed;                 // Config: armed state
    bool detection_enabled;     // Config: detection enabled
    int64_t time_drift_ms;      // Local - server time difference
} heartbeat_response_t;

/**
 * Server communication status.
 */
typedef enum {
    SERVER_STATUS_UNKNOWN,      // Not yet tried
    SERVER_STATUS_ONLINE,       // Last heartbeat succeeded
    SERVER_STATUS_OFFLINE,      // Last heartbeat failed (network)
    SERVER_STATUS_AUTH_FAILED,  // API key rejected (401)
} server_status_t;

/**
 * Initialize server communication.
 * Does NOT start heartbeat thread - call server_comm_start() for that.
 * @return 0 on success, -1 on error
 */
int server_comm_init(void);

/**
 * Start heartbeat thread.
 * Sends initial heartbeat immediately, then every interval.
 * @return 0 on success, -1 on error
 */
int server_comm_start(void);

/**
 * Send immediate heartbeat (bypasses interval).
 * Blocks until complete.
 * @param response Optional pointer to receive response
 * @return 0 on success, -1 on error
 */
int server_comm_send_heartbeat(heartbeat_response_t *response);

/**
 * Get current server status.
 * @return Current status
 */
server_status_t server_comm_get_status(void);

/**
 * Get status name for logging.
 * @param status The status
 * @return Static string name
 */
const char *server_status_name(server_status_t status);

/**
 * Get seconds since last successful heartbeat.
 * @return Seconds, or -1 if never successful
 */
int64_t server_comm_seconds_since_heartbeat(void);

/**
 * Stop heartbeat thread.
 */
void server_comm_stop(void);

/**
 * Cleanup server communication.
 */
void server_comm_cleanup(void);

/**
 * Check if server communication is initialized.
 * @return true if initialized
 */
bool server_comm_is_initialized(void);

/**
 * Check if server communication is running (heartbeat thread active).
 * @return true if running
 */
bool server_comm_is_running(void);

/**
 * Validate an API key against a server by sending a heartbeat.
 * Used during QR claiming to verify the key before saving it.
 * Does NOT require server_comm_init() — uses its own HTTP connection.
 *
 * @param url    Server URL (e.g., "https://hivewarden.eu")
 * @param api_key API key to validate
 * @return 0 if valid (HTTP 200), -1 if invalid or network error
 */
int server_comm_validate_key(const char *url, const char *api_key);

// ============================================================================
// Configuration Constants
// ============================================================================

#define HEARTBEAT_INTERVAL_SEC      60      // Normal heartbeat interval
#define HEARTBEAT_TIMEOUT_SEC       10      // HTTP request timeout
#define BOOT_RETRY_COUNT            3       // Retries on initial boot
#define BOOT_RETRY_DELAY_SEC        5       // Delay between boot retries
#define CLOCK_DRIFT_THRESHOLD_SEC   5       // When to log drift warning

#endif // APIS_SERVER_COMM_H
