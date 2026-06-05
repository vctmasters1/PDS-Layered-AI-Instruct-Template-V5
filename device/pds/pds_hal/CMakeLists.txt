# Determine board capabilities based on target
if(IDF_TARGET STREQUAL "esp32c3")
    set(TARGET_PLATFORM "ESP32C3")
    set(PDS_TARGET_SUBDIR "esp32c3_sm")
    set(PDS_HAL_CAPS 
        -DPDS_HAL_HAS_ADC=1
        -DPDS_HAL_HAS_PWM=1
        -DPDS_HAL_HAS_GPIO=1
        -DPDS_HAL_HAS_SPI=1
        -DPDS_HAL_HAS_MOTOR_DRV8833=1
    )
    set(PDS_LEDC_SPEED_MODE "LEDC_LOW_SPEED_MODE")
    set(HAL_SRCS
        # Shared ESP32-family drivers (GPIO/ADC/PWM are identical on c3/s3/esp32)
        "board/common/esp32/pds_adc_esp32.c"
        "board/common/esp32/pds_pwm_esp32.c"
        "board/common/esp32/pds_gpio_esp32.c"
        # NOTE: pds_platform_main.c compiled in main/main to avoid circular dep
        # pds_hal → pds_pipeline → pds_fb → pds_hal
        # C3-specific peripherals
        "board/esp32c3_sm/common/pds_spi_esp32c3.c"
        "board/esp32c3_sm/common/pds_motor_DRV8833_esp32c3.c"
    )
elseif(IDF_TARGET STREQUAL "esp32")
    set(TARGET_PLATFORM "ESP32")
    set(PDS_TARGET_SUBDIR "esp32_node32s")
    set(PDS_HAL_CAPS 
        -DPDS_HAL_HAS_ADC=1
        -DPDS_HAL_HAS_PWM=1
        -DPDS_HAL_HAS_GPIO=1
        -DPDS_HAL_HAS_SPI=1
        -DPDS_HAL_HAS_MOTOR_DRV8833=1
    )
    # ESP32 has both speed modes; high-speed LEDC gives better frequency accuracy
    set(PDS_LEDC_SPEED_MODE "LEDC_HIGH_SPEED_MODE")
    set(HAL_SRCS
        "board/common/esp32/pds_adc_esp32.c"
        "board/common/esp32/pds_pwm_esp32.c"
        "board/common/esp32/pds_gpio_esp32.c"
        # NOTE: pds_platform_main.c compiled in main/main to avoid circular dep
        "board/esp32_node32s/common/pds_spi_esp32.c"
        "board/esp32_node32s/common/pds_motor_DRV8833_esp32.c"
    )
elseif(IDF_TARGET STREQUAL "esp32s3")
    set(TARGET_PLATFORM "ESP32S3")
    set(PDS_TARGET_SUBDIR "esp32s3")
    set(PDS_HAL_CAPS 
        -DPDS_HAL_HAS_ADC=1
        -DPDS_HAL_HAS_PWM=1
        -DPDS_HAL_HAS_GPIO=1
        -DPDS_HAL_HAS_SPI=1
        -DPDS_HAL_HAS_MOTOR_DRV8833=0
    )
    set(PDS_LEDC_SPEED_MODE "LEDC_LOW_SPEED_MODE")
    set(HAL_SRCS
        "board/common/esp32/pds_adc_esp32.c"
        "board/common/esp32/pds_pwm_esp32.c"
        "board/common/esp32/pds_gpio_esp32.c"
        # NOTE: pds_platform_main.c compiled in main/main to avoid circular dep
    )
else()
    message(WARNING "PDS_HAL: Unknown IDF_TARGET '${IDF_TARGET}', using defaults")
    set(TARGET_PLATFORM "UNKNOWN")
    set(PDS_TARGET_SUBDIR "unknown")
    set(PDS_HAL_CAPS)
endif()

# Registry implementations — backend-agnostic peripheral ownership + caching
list(APPEND HAL_SRCS
    "registries/pds_adc_registry.c"
    "registries/pds_gpio_registry.c"
    "registries/pds_pwm_registry.c"
)

# ── Role-specific files ──────────────────────────────────────────────────────
# When building with a specific hwrev+role, the build system passes:
#   -DPDS_HWREV=hwrev_001 -DPDS_ROLE=h2o_001
# This adds the role directory's generated files to the build.
# Files are optional (EXISTS guard) so the project still configures without them.

set(PDS_HAL_EXTRA_REQUIRES "")
set(PDS_HAL_EXTRA_DEFS "")

if(DEFINED PDS_HWREV AND DEFINED PDS_ROLE AND DEFINED PDS_TARGET_SUBDIR)
    set(_ROLE_DIR "board/${PDS_TARGET_SUBDIR}/${PDS_HWREV}/${PDS_ROLE}")
    foreach(_ROLE_FILE "pds_process_action.c")
        if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/${_ROLE_DIR}/${_ROLE_FILE}")
            list(APPEND HAL_SRCS "${_ROLE_DIR}/${_ROLE_FILE}")
            message(STATUS "PDS_HAL: including role file: ${_ROLE_DIR}/${_ROLE_FILE}")
        else()
            message(WARNING "PDS_HAL: role file not found (run Generate in PDS Toolbox): ${_ROLE_DIR}/${_ROLE_FILE}")
        endif()
    endforeach()

    # Read the same pds_periph_drivers.cmake that pds_fb uses.
    # Any peripheral that requires role-level init in pds_process_action.c
    # (e.g. ads1115) needs its component in REQUIRES and its compile def here.
    set(_PERIPH_CMAKE
        "${CMAKE_CURRENT_SOURCE_DIR}/${_ROLE_DIR}/pds_periph_drivers.cmake")
    if(EXISTS "${_PERIPH_CMAKE}")
        include("${_PERIPH_CMAKE}")
        foreach(_TYPE ${PDS_PERIPH_TYPES})
            if(_TYPE STREQUAL "ads1115")
                list(APPEND PDS_HAL_EXTRA_REQUIRES ads1115)
                list(APPEND PDS_HAL_EXTRA_DEFS "PDS_PERIPH_HAS_ADS1115=1")
            endif()
        endforeach()
    endif()
endif()

# Export board directory path for child components to reference
set(PDS_HAL_BOARD_DIR "${CMAKE_CURRENT_SOURCE_DIR}/board")

idf_component_register(
    SRCS ${HAL_SRCS}
    INCLUDE_DIRS "abstract"
    REQUIRES pds_core driver esp_timer pds_storage nvs_flash ${PDS_HAL_EXTRA_REQUIRES}
    PRIV_REQUIRES esp_adc
)

# Set board-target compile definitions
target_compile_definitions(${COMPONENT_LIB} PRIVATE
    ${PDS_HAL_CAPS}
    ${PDS_HAL_EXTRA_DEFS}
    -DTARGET_PLATFORM=\"${TARGET_PLATFORM}\"
    -DPDS_LEDC_SPEED_MODE=${PDS_LEDC_SPEED_MODE}
)

# Suppress format warnings for HAL common files where typedef'd types may vary by board
# This is acceptable for board-specific HAL implementation where we handle type portability
# The -Wno-error=format suppresses format string warnings for all files in this component
target_compile_options(${COMPONENT_LIB} PRIVATE 
    "-Wno-error=format"
)
# For GCC 9+, also need to suppress the warning itself, not just treat it as error
add_compile_options("-Wno-error=format")


