# APIS Edge Device - CMake Build Configuration
# Supports: Raspberry Pi (native) and ESP32 (via ESP-IDF)

cmake_minimum_required(VERSION 3.16)
project(apis-edge C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Platform detection
# Use -DAPIS_PLATFORM=test for building tests on macOS/Linux without Pi dependencies
if(NOT DEFINED APIS_PLATFORM)
    if(ESP_PLATFORM)
        set(APIS_PLATFORM "esp32")
    elseif(CMAKE_SYSTEM_NAME STREQUAL "Darwin")
        # macOS - default to test mode for local development
        set(APIS_PLATFORM "test")
    else()
        set(APIS_PLATFORM "pi")
    endif()
endif()

message(STATUS "Building for platform: ${APIS_PLATFORM}")

# Define platform macro (uppercase for consistency)
if(APIS_PLATFORM STREQUAL "pi")
    add_compile_definitions(APIS_PLATFORM_PI)
elseif(APIS_PLATFORM STREQUAL "esp32")
    add_compile_definitions(APIS_PLATFORM_ESP32)
elseif(APIS_PLATFORM STREQUAL "test")
    add_compile_definitions(APIS_PLATFORM_TEST)
endif()

# cJSON library for JSON parsing
set(CJSON_SOURCES
    lib/cJSON/cJSON.c
)

# Common sources
set(COMMON_SOURCES
    src/main.c
    src/config.c
    src/log.c
    src/config/config_manager.c
    src/detection/motion.c
    src/detection/tracker.c
    src/detection/classifier.c
    src/storage/event_logger.c
    src/storage/schema.c
    src/storage/rolling_buffer.c
    src/storage/clip_recorder.c
    src/storage/storage_manager.c
    ${CJSON_SOURCES}
)

# Platform-specific HAL
if(APIS_PLATFORM STREQUAL "pi")
    list(APPEND COMMON_SOURCES hal/pi/camera_pi.c)

    # Find required packages
    find_package(PkgConfig REQUIRED)
    pkg_check_modules(V4L2 REQUIRED libv4l2)
    pkg_check_modules(YAML REQUIRED yaml-0.1)
    pkg_check_modules(SQLITE3 REQUIRED sqlite3)
    pkg_check_modules(FFMPEG REQUIRED libavcodec libavformat libavutil libswscale)
elseif(APIS_PLATFORM STREQUAL "esp32")
    list(APPEND COMMON_SOURCES hal/esp32/camera_esp32.c)
    # ESP32: esp_tls is available via ESP-IDF components - no extra find_package needed
elseif(APIS_PLATFORM STREQUAL "test")
    # Test mode: stub out hardware dependencies
    # Use sqlite3 from system if available
    find_package(SQLite3)
endif()

# TLS support (optional on Pi/test, built-in on ESP32)
# On Pi/test: try to find mbedTLS. If found, define APIS_HAS_MBEDTLS.
# If not found, the stub implementation in tls_client.c is used (tls_available() returns false).
# On ESP32: esp_tls from ESP-IDF is used directly (no CMake find needed).
if(APIS_PLATFORM STREQUAL "pi" OR APIS_PLATFORM STREQUAL "test")
    find_package(MbedTLS QUIET)
    if(MbedTLS_FOUND)
        message(STATUS "mbedTLS found - TLS support enabled")
        add_compile_definitions(APIS_HAS_MBEDTLS)
        # mbedTLS v4 renamed mbedcrypto to tfpsacrypto. Create alias for compat.
        if(TARGET MbedTLS::tfpsacrypto AND NOT TARGET MbedTLS::mbedcrypto)
            add_library(MbedTLS::mbedcrypto ALIAS MbedTLS::tfpsacrypto)
            message(STATUS "mbedTLS v4 detected - aliased tfpsacrypto as mbedcrypto")
        endif()
    else()
        message(STATUS "mbedTLS not found - TLS stub will be used (tls_available() returns false)")
    endif()
endif()

# Main executable (not built in test mode - requires hardware dependencies)
if(NOT APIS_PLATFORM STREQUAL "test")
    add_executable(apis-edge ${COMMON_SOURCES})

    target_include_directories(apis-edge PRIVATE
        ${CMAKE_SOURCE_DIR}/include
        ${CMAKE_SOURCE_DIR}/hal
        ${CMAKE_SOURCE_DIR}/lib/cJSON
    )

    # Pi-specific linking
    if(APIS_PLATFORM STREQUAL "pi")
        target_link_libraries(apis-edge
            ${V4L2_LIBRARIES}
            ${YAML_LIBRARIES}
            ${SQLITE3_LIBRARIES}
            ${FFMPEG_LIBRARIES}
            pthread
            m
        )
        target_include_directories(apis-edge PRIVATE
            ${V4L2_INCLUDE_DIRS}
            ${YAML_INCLUDE_DIRS}
            ${SQLITE3_INCLUDE_DIRS}
            ${FFMPEG_INCLUDE_DIRS}
        )
    endif()
endif()

# Hardware-dependent tests (not built in test mode)
if(NOT APIS_PLATFORM STREQUAL "test")
    # Test executable
    add_executable(test_camera
        tests/test_camera.c
        src/config.c
        src/log.c
    )

    if(APIS_PLATFORM STREQUAL "pi")
        target_sources(test_camera PRIVATE hal/pi/camera_pi.c)
        target_link_libraries(test_camera
            ${V4L2_LIBRARIES}
            ${YAML_LIBRARIES}
            pthread
            m
        )
        target_include_directories(test_camera PRIVATE
            ${V4L2_INCLUDE_DIRS}
            ${YAML_INCLUDE_DIRS}
        )
    endif()

    target_include_directories(test_camera PRIVATE
        ${CMAKE_SOURCE_DIR}/include
        ${CMAKE_SOURCE_DIR}/hal
    )

    # Motion detection test executable
    add_executable(test_motion
        tests/test_motion.c
        src/detection/motion.c
        src/config.c
        src/log.c
    )

    if(APIS_PLATFORM STREQUAL "pi")
        target_link_libraries(test_motion
            ${YAML_LIBRARIES}
            pthread
            m
        )
        target_include_directories(test_motion PRIVATE
            ${YAML_INCLUDE_DIRS}
        )
    endif()

    target_include_directories(test_motion PRIVATE
        ${CMAKE_SOURCE_DIR}/include
        ${CMAKE_SOURCE_DIR}/hal
    )

    # Tracker test executable
    add_executable(test_tracker
        tests/test_tracker.c
        src/detection/tracker.c
        src/config.c
        src/log.c
    )

    if(APIS_PLATFORM STREQUAL "pi")
        target_link_libraries(test_tracker
            ${YAML_LIBRARIES}
            pthread
            m
        )
        target_include_directories(test_tracker PRIVATE
            ${YAML_INCLUDE_DIRS}
        )
    endif()

    target_include_directories(test_tracker PRIVATE
        ${CMAKE_SOURCE_DIR}/include
        ${CMAKE_SOURCE_DIR}/hal
    )

    # Classifier test executable
    add_executable(test_classifier
        tests/test_classifier.c
        src/detection/tracker.c
        src/detection/classifier.c
        src/config.c
        src/log.c
    )

    if(APIS_PLATFORM STREQUAL "pi")
        target_link_libraries(test_classifier
            ${YAML_LIBRARIES}
            pthread
            m
        )
        target_include_directories(test_classifier PRIVATE
            ${YAML_INCLUDE_DIRS}
        )
    endif()

    target_include_directories(test_classifier PRIVATE
        ${CMAKE_SOURCE_DIR}/include
        ${CMAKE_SOURCE_DIR}/hal
    )

    # Event logger test executable
    add_executable(test_event_logger
        tests/test_event_logger.c
        src/storage/event_logger.c
        src/storage/schema.c
        src/config.c
        src/log.c
    )

    if(APIS_PLATFORM STREQUAL "pi")
        target_link_libraries(test_event_logger
            ${YAML_LIBRARIES}
            ${SQLITE3_LIBRARIES}
            pthread
            m
        )
        target_include_directories(test_event_logger PRIVATE
            ${YAML_INCLUDE_DIRS}
            ${SQLITE3_INCLUDE_DIRS}
        )
    endif()

    target_include_directories(test_event_logger PRIVATE
        ${CMAKE_SOURCE_DIR}/include
        ${CMAKE_SOURCE_DIR}/hal
    )

    # Clip recorder test executable
    add_executable(test_clip_recorder
        tests/test_clip_recorder.c
        src/storage/rolling_buffer.c
        src/storage/clip_recorder.c
        src/storage/storage_manager.c
        src/config.c
        src/log.c
    )

    if(APIS_PLATFORM STREQUAL "pi")
        target_link_libraries(test_clip_recorder
            ${YAML_LIBRARIES}
            ${FFMPEG_LIBRARIES}
            pthread
            m
        )
        target_include_directories(test_clip_recorder PRIVATE
            ${YAML_INCLUDE_DIRS}
            ${FFMPEG_INCLUDE_DIRS}
        )
    endif()

    target_include_directories(test_clip_recorder PRIVATE
        ${CMAKE_SOURCE_DIR}/include
        ${CMAKE_SOURCE_DIR}/hal
    )
endif() # NOT test platform

# S8-I-04: Test files implement their own TEST_ASSERT macros with no shared
# test infrastructure or automatic discovery. Each test_*.c has its own main().
# TODO: Consider adopting a lightweight C test framework (Unity, MinUnit) for
# consistent reporting, fixtures, and automatic test discovery.

# S8-I-05: Enable Address Sanitizer and Undefined Behavior Sanitizer for test
# builds to detect buffer overflows, use-after-free, and undefined behavior.
# Set APIS_ENABLE_SANITIZERS=ON to enable (disabled by default to avoid
# interfering with CI/CD pipelines that may not have sanitizer runtime).
option(APIS_ENABLE_SANITIZERS "Enable ASan/UBSan for test targets" OFF)
if(APIS_ENABLE_SANITIZERS AND APIS_PLATFORM STREQUAL "test")
    set(SANITIZER_FLAGS "-fsanitize=address -fsanitize=undefined -fno-omit-frame-pointer")
    set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} ${SANITIZER_FLAGS}")
    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} ${SANITIZER_FLAGS}")
    message(STATUS "Address Sanitizer and UBSan enabled for test builds")
endif()

# Config manager test executable (can build without hardware dependencies)
add_executable(test_config_manager
    tests/test_config_manager.c
    src/config/config_manager.c
    src/config.c
    src/log.c
    lib/cJSON/cJSON.c
)

if(APIS_PLATFORM STREQUAL "pi")
    target_link_libraries(test_config_manager
        ${YAML_LIBRARIES}
        pthread
        m
    )
    target_include_directories(test_config_manager PRIVATE
        ${YAML_INCLUDE_DIRS}
    )
elseif(APIS_PLATFORM STREQUAL "test")
    # Test platform: minimal dependencies
    target_link_libraries(test_config_manager pthread)
endif()

target_include_directories(test_config_manager PRIVATE
    ${CMAKE_SOURCE_DIR}/include
    ${CMAKE_SOURCE_DIR}/hal
    ${CMAKE_SOURCE_DIR}/lib/cJSON
)

# HTTP server test executable (can build without hardware dependencies)
add_executable(test_http_server
    tests/test_http_server.c
    src/http/http_server.c
    src/http/http_rate_limit.c
    src/http/http_utils.c
    src/led/led_controller.c
    src/config/config_manager.c
    src/safety/safety_layer.c
    src/button/button_handler.c
    src/laser/laser_controller.c
    src/servo/servo_controller.c
    src/storage/storage_manager.c
    src/config.c
    src/log.c
    lib/cJSON/cJSON.c
)

if(APIS_PLATFORM STREQUAL "pi")
    target_link_libraries(test_http_server
        ${YAML_LIBRARIES}
        pthread
        m
    )
    target_include_directories(test_http_server PRIVATE
        ${YAML_INCLUDE_DIRS}
    )
elseif(APIS_PLATFORM STREQUAL "test")
    # Test platform: minimal dependencies
    target_link_libraries(test_http_server pthread ${SQLITE3_LIBRARIES})
    target_include_directories(test_http_server PRIVATE ${SQLITE3_INCLUDE_DIRS})
endif()

target_include_directories(test_http_server PRIVATE
    ${CMAKE_SOURCE_DIR}/include
    ${CMAKE_SOURCE_DIR}/hal
    ${CMAKE_SOURCE_DIR}/lib/cJSON
)

# LED controller test executable (can build without hardware dependencies)
add_executable(test_led_controller
    tests/test_led_controller.c
    src/led/led_controller.c
    src/config.c
    src/log.c
)

if(APIS_PLATFORM STREQUAL "pi")
    target_link_libraries(test_led_controller
        ${YAML_LIBRARIES}
        pthread
        m
    )
    target_include_directories(test_led_controller PRIVATE
        ${YAML_INCLUDE_DIRS}
    )
elseif(APIS_PLATFORM STREQUAL "test")
    # Test platform: minimal dependencies
    target_link_libraries(test_led_controller pthread)
endif()

target_include_directories(test_led_controller PRIVATE
    ${CMAKE_SOURCE_DIR}/include
    ${CMAKE_SOURCE_DIR}/hal
)

# Server communication test executable (can build without hardware dependencies)
add_executable(test_server_comm
    tests/test_server_comm.c
    src/server/server_comm.c
    src/upload/clip_uploader.c
    src/http/http_utils.c
    src/tls/tls_client.c
    src/storage/storage_manager.c
    src/led/led_controller.c
    src/config/config_manager.c
    src/config.c
    src/log.c
    lib/cJSON/cJSON.c
)

if(APIS_PLATFORM STREQUAL "pi")
    target_link_libraries(test_server_comm
        ${YAML_LIBRARIES}
        pthread
        m
    )
    target_include_directories(test_server_comm PRIVATE
        ${YAML_INCLUDE_DIRS}
    )
elseif(APIS_PLATFORM STREQUAL "test")
    # Test platform: minimal dependencies
    target_link_libraries(test_server_comm pthread)
endif()

# Link mbedTLS if available (Pi/test platforms)
if(MbedTLS_FOUND)
    target_link_libraries(test_server_comm MbedTLS::mbedtls MbedTLS::mbedcrypto MbedTLS::mbedx509)
endif()

target_include_directories(test_server_comm PRIVATE
    ${CMAKE_SOURCE_DIR}/include
    ${CMAKE_SOURCE_DIR}/hal
    ${CMAKE_SOURCE_DIR}/lib/cJSON
)

# Clip uploader test executable (can build without hardware dependencies)
add_executable(test_clip_uploader
    tests/test_clip_uploader.c
    src/upload/clip_uploader.c
    src/http/http_utils.c
    src/tls/tls_client.c
    src/storage/storage_manager.c
    src/config/config_manager.c
    src/config.c
    src/log.c
    lib/cJSON/cJSON.c
)

if(APIS_PLATFORM STREQUAL "pi")
    target_link_libraries(test_clip_uploader
        ${YAML_LIBRARIES}
        pthread
        m
    )
    target_include_directories(test_clip_uploader PRIVATE
        ${YAML_INCLUDE_DIRS}
    )
elseif(APIS_PLATFORM STREQUAL "test")
    # Test platform: minimal dependencies
    target_link_libraries(test_clip_uploader pthread)
endif()

# Link mbedTLS if available (Pi/test platforms)
if(MbedTLS_FOUND)
    target_link_libraries(test_clip_uploader MbedTLS::mbedtls MbedTLS::mbedcrypto MbedTLS::mbedx509)
endif()

target_include_directories(test_clip_uploader PRIVATE
    ${CMAKE_SOURCE_DIR}/include
    ${CMAKE_SOURCE_DIR}/hal
    ${CMAKE_SOURCE_DIR}/lib/cJSON
)

# Servo controller test executable (can build without hardware dependencies)
add_executable(test_servo_controller
    tests/test_servo_controller.c
    src/servo/servo_controller.c
    src/laser/laser_controller.c
    src/led/led_controller.c
    src/config.c
    src/log.c
)

if(APIS_PLATFORM STREQUAL "pi")
    target_link_libraries(test_servo_controller
        ${YAML_LIBRARIES}
        pthread
        m
    )
    target_include_directories(test_servo_controller PRIVATE
        ${YAML_INCLUDE_DIRS}
    )
elseif(APIS_PLATFORM STREQUAL "test")
    # Test platform: minimal dependencies
    target_link_libraries(test_servo_controller pthread m)
endif()

target_include_directories(test_servo_controller PRIVATE
    ${CMAKE_SOURCE_DIR}/include
    ${CMAKE_SOURCE_DIR}/hal
)

# Coordinate mapper test executable (can build without hardware dependencies)
add_executable(test_coordinate_mapper
    tests/test_coordinate_mapper.c
    src/laser/coordinate_mapper.c
    src/servo/servo_controller.c
    src/laser/laser_controller.c
    src/led/led_controller.c
    src/config.c
    src/log.c
    lib/cJSON/cJSON.c
)

if(APIS_PLATFORM STREQUAL "pi")
    target_link_libraries(test_coordinate_mapper
        ${YAML_LIBRARIES}
        pthread
        m
    )
    target_include_directories(test_coordinate_mapper PRIVATE
        ${YAML_INCLUDE_DIRS}
    )
elseif(APIS_PLATFORM STREQUAL "test")
    # Test platform: minimal dependencies
    target_link_libraries(test_coordinate_mapper pthread m)
endif()

target_include_directories(test_coordinate_mapper PRIVATE
    ${CMAKE_SOURCE_DIR}/include
    ${CMAKE_SOURCE_DIR}/hal
    ${CMAKE_SOURCE_DIR}/lib/cJSON
)

# Laser controller test executable (can build without hardware dependencies)
add_executable(test_laser_controller
    tests/test_laser_controller.c
    src/laser/laser_controller.c
    src/config.c
    src/log.c
)

if(APIS_PLATFORM STREQUAL "pi")
    target_link_libraries(test_laser_controller
        ${YAML_LIBRARIES}
        pthread
        m
    )
    target_include_directories(test_laser_controller PRIVATE
        ${YAML_INCLUDE_DIRS}
    )
elseif(APIS_PLATFORM STREQUAL "test")
    # Test platform: minimal dependencies
    target_link_libraries(test_laser_controller pthread m)
endif()

target_include_directories(test_laser_controller PRIVATE
    ${CMAKE_SOURCE_DIR}/include
    ${CMAKE_SOURCE_DIR}/hal
)

# Targeting system test executable (can build without hardware dependencies)
add_executable(test_targeting
    tests/test_targeting.c
    src/laser/targeting.c
    src/laser/coordinate_mapper.c
    src/laser/laser_controller.c
    src/servo/servo_controller.c
    src/led/led_controller.c
    src/safety/safety_layer.c
    src/button/button_handler.c
    src/config.c
    src/log.c
    lib/cJSON/cJSON.c
)

if(APIS_PLATFORM STREQUAL "pi")
    target_link_libraries(test_targeting
        ${YAML_LIBRARIES}
        pthread
        m
    )
    target_include_directories(test_targeting PRIVATE
        ${YAML_INCLUDE_DIRS}
    )
elseif(APIS_PLATFORM STREQUAL "test")
    # Test platform: minimal dependencies
    target_link_libraries(test_targeting pthread m)
endif()

target_include_directories(test_targeting PRIVATE
    ${CMAKE_SOURCE_DIR}/include
    ${CMAKE_SOURCE_DIR}/hal
    ${CMAKE_SOURCE_DIR}/lib/cJSON
)

# Button handler test executable (can build without hardware dependencies)
add_executable(test_button_handler
    tests/test_button_handler.c
    src/button/button_handler.c
    src/laser/laser_controller.c
    src/led/led_controller.c
    src/config.c
    src/log.c
)

if(APIS_PLATFORM STREQUAL "pi")
    target_link_libraries(test_button_handler
        ${YAML_LIBRARIES}
        pthread
        m
    )
    target_include_directories(test_button_handler PRIVATE
        ${YAML_INCLUDE_DIRS}
    )
elseif(APIS_PLATFORM STREQUAL "test")
    # Test platform: minimal dependencies
    target_link_libraries(test_button_handler pthread m)
endif()

target_include_directories(test_button_handler PRIVATE
    ${CMAKE_SOURCE_DIR}/include
    ${CMAKE_SOURCE_DIR}/hal
)

# Safety layer test executable (can build without hardware dependencies)
add_executable(test_safety_layer
    tests/test_safety_layer.c
    src/safety/safety_layer.c
    src/button/button_handler.c
    src/laser/laser_controller.c
    src/led/led_controller.c
    src/servo/servo_controller.c
    src/config.c
    src/log.c
)

if(APIS_PLATFORM STREQUAL "pi")
    target_link_libraries(test_safety_layer
        ${YAML_LIBRARIES}
        pthread
        m
    )
    target_include_directories(test_safety_layer PRIVATE
        ${YAML_INCLUDE_DIRS}
    )
elseif(APIS_PLATFORM STREQUAL "test")
    # Test platform: minimal dependencies
    target_link_libraries(test_safety_layer pthread m)
endif()

target_include_directories(test_safety_layer PRIVATE
    ${CMAKE_SOURCE_DIR}/include
    ${CMAKE_SOURCE_DIR}/hal
)

# Install targets (not available in test mode)
if(NOT APIS_PLATFORM STREQUAL "test")
    install(TARGETS apis-edge DESTINATION bin)
    install(FILES config.yaml DESTINATION etc/apis)
endif()
