# Raspberry Pi platform build configuration
#
# Usage:
#   mkdir build && cd build
#   cmake -DCMAKE_TOOLCHAIN_FILE=../platforms/pi/toolchain.cmake ..
#   make
#
# Or for native build on Pi:
#   cmake ..
#   make

cmake_minimum_required(VERSION 3.16)

# Set platform
set(APIS_PLATFORM "pi" CACHE STRING "Target platform")

# Include main project
include(${CMAKE_CURRENT_SOURCE_DIR}/../../CMakeLists.txt)
