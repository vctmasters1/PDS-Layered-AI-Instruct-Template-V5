idf_component_register(
    SRCS
        "../main.c"
        "../../pds/pds_hal/board/common/esp32/pds_platform_main.c"
    INCLUDE_DIRS "."
    REQUIRES
        freertos
        pds_hal
        pds_pipeline
        pds_storage
        nvs_flash
        esp_timer
        pds_network
        pds_ui
)

# pds_platform_main.c uses TARGET_PLATFORM define; default "ESP32" via #ifndef guard
