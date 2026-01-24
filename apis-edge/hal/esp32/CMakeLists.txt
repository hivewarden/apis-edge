# ESP32-specific HAL CMake configuration

# This file is used when building with ESP-IDF

idf_component_register(
    SRCS "camera_esp32.c"
    INCLUDE_DIRS "."
    REQUIRES esp_camera driver
)
