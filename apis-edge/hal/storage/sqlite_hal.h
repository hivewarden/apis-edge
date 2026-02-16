/**
 * SQLite Hardware Abstraction Layer
 *
 * Provides platform-specific initialization for SQLite storage.
 * Pi uses standard SQLite, ESP32 uses SPIFFS/LittleFS backend.
 */

#ifndef APIS_SQLITE_HAL_H
#define APIS_SQLITE_HAL_H

#include <stdbool.h>

/**
 * Initialize platform-specific storage for SQLite.
 *
 * On Pi: No-op (standard filesystem)
 * On ESP32: Mount SPIFFS/LittleFS filesystem
 *
 * @return 0 on success, -1 on failure
 */
int sqlite_hal_init(void);

/**
 * Check if the storage HAL is initialized.
 *
 * @return true if initialized, false otherwise
 */
bool sqlite_hal_is_initialized(void);

/**
 * Get the platform-appropriate database path.
 *
 * On Pi: Returns the filename as-is (assumes writable directory)
 * On ESP32: Prepends SPIFFS mount point
 *
 * @param filename Database filename (e.g., "detections.db")
 * @return Full path to database file (static buffer, do not free)
 */
const char *sqlite_hal_get_db_path(const char *filename);

/**
 * Clean up platform-specific storage resources.
 *
 * On Pi: No-op
 * On ESP32: Unmount SPIFFS filesystem
 */
void sqlite_hal_cleanup(void);

/**
 * Get available storage space in bytes.
 *
 * @param free_bytes Output: available free space
 * @param total_bytes Output: total storage space
 * @return 0 on success, -1 on failure
 */
int sqlite_hal_get_storage_info(uint64_t *free_bytes, uint64_t *total_bytes);

#endif // APIS_SQLITE_HAL_H
