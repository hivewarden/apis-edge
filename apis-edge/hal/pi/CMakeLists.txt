# Pi-specific HAL CMake configuration

# This file is included by the main CMakeLists.txt when building for Pi

set(HAL_PI_SOURCES
    ${CMAKE_CURRENT_SOURCE_DIR}/camera_pi.c
)

# Export sources to parent
set(HAL_SOURCES ${HAL_PI_SOURCES} PARENT_SCOPE)

# Pi-specific compile definitions
add_compile_definitions(APIS_PLATFORM_PI)
