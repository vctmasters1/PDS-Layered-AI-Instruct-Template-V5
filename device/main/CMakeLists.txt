# For more information about build system see
# https://docs.espressif.com/projects/esp-idf/en/latest/api-guides/build-system.html
# The following five lines of boilerplate have to be in your project's
# CMakeLists in this exact order for cmake to work correctly
cmake_minimum_required(VERSION 3.5)

# pds_pipeline is found via ../pds (direct subdirectory scan).
# pds_fb is nested inside pds_pipeline — ESP-IDF won't scan deeper unless we list
# its path directly (ESP-IDF registers the dir as a component when CMakeLists.txt
# exists there, so we point straight at the pds_fb component directory).
set(EXTRA_COMPONENT_DIRS
    ../pds
    ../pds/pds_pipeline/pds_fb
    ../pds/pds_hal/peripherals
)

include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(pds-device)