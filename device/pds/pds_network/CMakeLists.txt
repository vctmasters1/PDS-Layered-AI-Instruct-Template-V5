# Determine board-specific network implementation
# Board files located in pds_hal/board/{board}/common/

# Map board names to directory structure
if(IDF_TARGET STREQUAL "esp32c3")
    set(HAL_BOARD_DIR "esp32c3_sm")
elseif(IDF_TARGET STREQUAL "esp32" OR IDF_TARGET STREQUAL "esp32s3")
    set(HAL_BOARD_DIR "esp32_node32s")
else()
    message(FATAL_ERROR "pds_network: Unsupported board ${IDF_TARGET}")
endif()

# Construct path to board-specific network implementation
set(PDS_HAL_BOARD_BASE "${CMAKE_CURRENT_SOURCE_DIR}/../pds_hal/board")
set(NETWORK_BOARD_SRCS "${PDS_HAL_BOARD_BASE}/${HAL_BOARD_DIR}/common/pds_network_platform_${IDF_TARGET}.c")

message(STATUS "pds_network: Using board implementation: ${NETWORK_BOARD_SRCS}")

# For ESP32S3, also support ESP32 implementation
if(IDF_TARGET STREQUAL "esp32s3")
    # ESP32-S3 can use ESP32 network driver (same architecture family)
    set(NETWORK_BOARD_SRCS "${PDS_HAL_BOARD_BASE}/${HAL_BOARD_DIR}/common/pds_network_platform_esp32.c")
    message(STATUS "pds_network: Using ESP32 board implementation for ESP32-S3 (compatible)")
endif()

idf_component_register(
    SRCS "pds_provisioning.c" "pds_wifi.c" "pds_https_server.c" 
         "pds_ble_provisioning.c" "pds_http_server.c" "pds_mdns.c"
         "pds_telemetry.c" "pds_https_api.c" "pds_cloud_push.c"
         ${NETWORK_BOARD_SRCS}
    INCLUDE_DIRS "include"
    REQUIRES esp_wifi esp_event esp_netif lwip pds_core pds_validation pds_storage
             esp_http_server esp_https_server esp_http_client esp_https_ota
             nvs_flash mbedtls json mdns
    PRIV_REQUIRES pds_hal pds_pipeline
    EMBED_TXTFILES "certs/servercert.pem" "certs/prvtkey.pem"
)

# DEV MODE: fast polling (5 s telemetry, pipeline checked every cycle).
# Remove this block before production builds.
target_compile_definitions(${COMPONENT_LIB} PRIVATE CONFIG_PDS_DEV_MODE=1)
