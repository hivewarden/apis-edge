# ESP32 platform build configuration for ESP-IDF
#
# Usage:
#   cd platforms/esp32
#   idf.py set-target esp32
#   idf.py build
#   idf.py flash

cmake_minimum_required(VERSION 3.16)

# ESP-IDF project setup
include($ENV{IDF_PATH}/tools/cmake/project.cmake)

project(apis-edge)

# Set platform
set(APIS_PLATFORM "esp32" CACHE STRING "Target platform")
