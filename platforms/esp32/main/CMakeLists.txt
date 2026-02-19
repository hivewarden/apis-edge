# Main component - APIS Edge source files
# Aggregates all C source code from src/ and HAL layers

# Get the base directory of the APIS edge project
# CMAKE_CURRENT_LIST_DIR = platforms/esp32/main, so we go up 3 levels to project root
get_filename_component(APIS_EDGE_DIR ${CMAKE_CURRENT_LIST_DIR}/../../.. ABSOLUTE)

set(APIS_SOURCES
    # ESP32 entry point (app_main)
    "${CMAKE_CURRENT_LIST_DIR}/main.c"

    # Core initialization and configuration
    "${APIS_EDGE_DIR}/src/main.c"
    "${APIS_EDGE_DIR}/src/config.c"
    "${APIS_EDGE_DIR}/src/log.c"
    "${APIS_EDGE_DIR}/src/config/config_manager.c"

    # Motion detection pipeline
    "${APIS_EDGE_DIR}/src/detection/motion.c"
    "${APIS_EDGE_DIR}/src/detection/tracker.c"
    "${APIS_EDGE_DIR}/src/detection/classifier.c"

    # Storage and logging
    # event_logger and schema use SQLite (not available on ESP32) - use stub
    "${APIS_EDGE_DIR}/hal/esp32/event_logger_stub.c"
    "${APIS_EDGE_DIR}/src/storage/rolling_buffer.c"
    "${APIS_EDGE_DIR}/src/storage/clip_recorder.c"
    "${APIS_EDGE_DIR}/src/storage/storage_manager.c"

    # Server communication
    "${APIS_EDGE_DIR}/src/server/server_comm.c"
    "${APIS_EDGE_DIR}/src/upload/clip_uploader.c"
    "${APIS_EDGE_DIR}/src/http/http_server.c"
    "${APIS_EDGE_DIR}/src/http/http_utils.c"
    "${APIS_EDGE_DIR}/src/http/http_rate_limit.c"
    "${APIS_EDGE_DIR}/src/tls/tls_client.c"

    # Physical controls
    "${APIS_EDGE_DIR}/src/button/button_handler.c"
    "${APIS_EDGE_DIR}/src/led/led_controller.c"
    "${APIS_EDGE_DIR}/src/servo/servo_controller.c"
    "${APIS_EDGE_DIR}/src/laser/laser_controller.c"
    "${APIS_EDGE_DIR}/src/laser/coordinate_mapper.c"
    "${APIS_EDGE_DIR}/src/laser/targeting.c"
    "${APIS_EDGE_DIR}/src/safety/safety_layer.c"

    # WiFi provisioning (ESP32 only)
    "${APIS_EDGE_DIR}/src/wifi/wifi_provision.c"

    # Captive portal DNS server (ESP32 only, AP mode)
    "${APIS_EDGE_DIR}/src/dns/captive_dns.c"

    # mDNS service discovery (ESP32 only, STA mode)
    "${APIS_EDGE_DIR}/src/mdns/mdns_discovery.c"

    # Hardware abstraction layer (ESP32 specific)
    "${APIS_EDGE_DIR}/hal/esp32/camera_esp32.c"
    # "${APIS_EDGE_DIR}/hal/storage/esp32/sqlite_esp32.c"

    # QR code scanner
    "${APIS_EDGE_DIR}/src/qr/qr_scanner.c"

    # Third-party libraries
    "${APIS_EDGE_DIR}/lib/cJSON/cJSON.c"
    "${APIS_EDGE_DIR}/lib/quirc/quirc.c"
    "${APIS_EDGE_DIR}/lib/quirc/identify.c"
    "${APIS_EDGE_DIR}/lib/quirc/decode.c"
    "${APIS_EDGE_DIR}/lib/quirc/version_db.c"
)

# Register as ESP-IDF component
idf_component_register(
    SRCS ${APIS_SOURCES}
    INCLUDE_DIRS
        "${APIS_EDGE_DIR}/include"
        "${APIS_EDGE_DIR}/hal"
        "${APIS_EDGE_DIR}/lib/cJSON"
        "${APIS_EDGE_DIR}/lib/quirc"
    REQUIRES
        driver
        nvs_flash
        spiffs
        esp_wifi
        esp_netif
        esp_event
        esp_http_client
        esp_timer
        esp_psram
        esp-tls
        vfs
        espressif__esp32-camera
        espressif__mdns
)

# Compiler flags for APIS code
target_compile_options(${COMPONENT_LIB} PRIVATE
    -DAPIS_PLATFORM_ESP32
    -Wall
    -Wextra
    -Wno-unused-parameter
    -Wno-unused-variable
    -Wno-format-truncation
    -Wno-maybe-uninitialized
)

# quirc PSRAM allocation is handled by inline macros in quirc.c
# (QUIRC_MALLOC/QUIRC_CALLOC/QUIRC_FREE, gated on APIS_PLATFORM_ESP32).
