# ── Peripheral drivers (role-specific, conditionally compiled) ───────────────
# When the role builder generates pds_periph_drivers.cmake for a role, it sets
# PDS_PERIPH_TYPES to the list of peripheral type keys present (e.g. "dht22").
# We include that file here and map each type to its .c source and compile def.
# Source files and compile defs are conditional; component REQUIRES are NOT.
#
# WHY unconditional PRIV_REQUIRES:
#   ESP-IDF's component requirement-collection phase runs each CMakeLists.txt in
#   a stripped cmake subprocess where IDF_TARGET is not yet set. Conditional
#   REQUIRES that depend on IDF_TARGET (to derive the role dir path) cannot fire
#   at that phase — only at full cmake configure time. The safe, supported pattern
#   is to declare all possible peripheral drivers in PRIV_REQUIRES and rely on the
#   linker's dead-code-elimination (-ffunction-sections + --gc-sections) to strip
#   unused driver symbols. This is exactly what IDF recommends in its own error
#   message ("add dht22 to PRIV_REQUIRES").
#
# Peripheral type → source file + compile definition:
#   dht22          → pds_fb_dht22.c           + PDS_PERIPH_HAS_DHT22=1
#   hx711          → pds_fb_hx711.c           + PDS_PERIPH_HAS_HX711=1
#   ads1115        → (no fb block)             + PDS_PERIPH_HAS_ADS1115=1  (role init in pds_hal)
#   encoder_quadrature → pds_fb_encoder_quadrature.c + PDS_PERIPH_HAS_ENCODER_QUADRATURE=1
#   encoder_mapped     → pds_fb_encoder_mapped.c    + PDS_PERIPH_HAS_ENCODER_MAPPED=1
#   stepper_a4988  → pds_fb_stepper_a4988.c   + PDS_PERIPH_HAS_STEPPER_A4988=1
#   stepper_drv8825→ pds_fb_stepper_drv8825.c + PDS_PERIPH_HAS_STEPPER_DRV8825=1
#   stepper_tb6600 → pds_fb_stepper_tb6600.c  + PDS_PERIPH_HAS_STEPPER_TB6600=1
#   stepper_tmc2209→ pds_fb_stepper_tmc2209.c + PDS_PERIPH_HAS_STEPPER_TMC2209=1
#   stepper_tmc2208→ pds_fb_stepper_tmc2208.c + PDS_PERIPH_HAS_STEPPER_TMC2208=1
#   pid_pwm        → pds_fb_pid_pwm.c         + PDS_PERIPH_HAS_PID_PWM=1
#   sensor_analog  → pds_fb_sensor_analog.c   + PDS_PERIPH_HAS_SENSOR_ANALOG=1
#   pid            → pds_fb_pid.c             + PDS_PERIPH_HAS_PID=1
#   pwm_output     → pds_fb_pwm_output.c      + PDS_PERIPH_HAS_PWM_OUTPUT=1
#   gpio_input     → pds_fb_gpio_input.c      + PDS_PERIPH_HAS_GPIO_INPUT=1
#   gpio_value     → pds_fb_gpio_value.c      + PDS_PERIPH_HAS_GPIO_VALUE=1
#   switch_output  → pds_fb_switch_output.c   + PDS_PERIPH_HAS_SWITCH_OUTPUT=1
#   led_addr       → pds_fb_led_addr.c        + PDS_PERIPH_HAS_LED_ADDR=1

set(PDS_PERIPH_SRCS "")
set(PDS_PERIPH_DEFS "")
set(PDS_PERIPH_REQUIRES "")
set(PDS_PERIPH_INCLUDE_DIRS "")

if(DEFINED PDS_HWREV AND DEFINED PDS_ROLE)
    # Derive the target sub-directory from the IDF target (matches pds_hal logic)
    if(IDF_TARGET STREQUAL "esp32c3")
        set(_PDS_FB_TARGET_SUBDIR "esp32c3_sm")
    elseif(IDF_TARGET STREQUAL "esp32")
        set(_PDS_FB_TARGET_SUBDIR "esp32_node32s")
    elseif(IDF_TARGET STREQUAL "esp32s3")
        set(_PDS_FB_TARGET_SUBDIR "esp32s3")
    else()
        set(_PDS_FB_TARGET_SUBDIR "unknown")
    endif()

    set(_PERIPH_CMAKE
        "${CMAKE_CURRENT_SOURCE_DIR}/../../pds_hal/board/${_PDS_FB_TARGET_SUBDIR}/${PDS_HWREV}/${PDS_ROLE}/pds_periph_drivers.cmake")

    if(EXISTS "${_PERIPH_CMAKE}")
        include("${_PERIPH_CMAKE}")
        # PDS_PERIPH_TYPES is now set by the included file
        foreach(_TYPE ${PDS_PERIPH_TYPES})
            if(_TYPE STREQUAL "dht22")
                list(APPEND PDS_PERIPH_SRCS "pds_fb_dht22.c")
                list(APPEND PDS_PERIPH_DEFS "PDS_PERIPH_HAS_DHT22=1")
                list(APPEND PDS_PERIPH_REQUIRES dht22)
            elseif(_TYPE STREQUAL "hx711")
                list(APPEND PDS_PERIPH_SRCS "pds_fb_hx711.c")
                list(APPEND PDS_PERIPH_DEFS "PDS_PERIPH_HAS_HX711=1")
                list(APPEND PDS_PERIPH_REQUIRES hx711)
            elseif(_TYPE STREQUAL "stepper_a4988")
                list(APPEND PDS_PERIPH_SRCS "pds_fb_stepper_a4988.c")
                list(APPEND PDS_PERIPH_DEFS "PDS_PERIPH_HAS_STEPPER_A4988=1")
            elseif(_TYPE STREQUAL "stepper_drv8825")
                list(APPEND PDS_PERIPH_SRCS "pds_fb_stepper_drv8825.c")
                list(APPEND PDS_PERIPH_DEFS "PDS_PERIPH_HAS_STEPPER_DRV8825=1")
            elseif(_TYPE STREQUAL "stepper_tb6600")
                list(APPEND PDS_PERIPH_SRCS "pds_fb_stepper_tb6600.c")
                list(APPEND PDS_PERIPH_DEFS "PDS_PERIPH_HAS_STEPPER_TB6600=1")
            elseif(_TYPE STREQUAL "stepper_tmc2209")
                list(APPEND PDS_PERIPH_SRCS "pds_fb_stepper_tmc2209.c")
                list(APPEND PDS_PERIPH_DEFS "PDS_PERIPH_HAS_STEPPER_TMC2209=1")
            elseif(_TYPE STREQUAL "stepper_tmc2208")
                list(APPEND PDS_PERIPH_SRCS "pds_fb_stepper_tmc2208.c")
                list(APPEND PDS_PERIPH_DEFS "PDS_PERIPH_HAS_STEPPER_TMC2208=1")
            elseif(_TYPE STREQUAL "pid_pwm")
                list(APPEND PDS_PERIPH_SRCS "pds_fb_pid_pwm.c")
                list(APPEND PDS_PERIPH_DEFS "PDS_PERIPH_HAS_PID_PWM=1")
            elseif(_TYPE STREQUAL "sensor_ph")
                list(APPEND PDS_PERIPH_SRCS "pds_fb_sensor_ph.c")
                # Compile ph_001 HAL directly into pds_fb to avoid cross-component
                # static library link-order issues with ESP-IDF's linker.
                list(APPEND PDS_PERIPH_SRCS "${CMAKE_CURRENT_SOURCE_DIR}/../../pds_hal/peripherals/ph_001/ph_001.c")
                list(APPEND PDS_PERIPH_DEFS "PDS_PERIPH_HAS_SENSOR_PH=1")
                list(APPEND PDS_PERIPH_INCLUDE_DIRS "${CMAKE_CURRENT_SOURCE_DIR}/../../pds_hal/peripherals/ph_001/include")
            elseif(_TYPE STREQUAL "sensor_ec")
                list(APPEND PDS_PERIPH_SRCS "pds_fb_sensor_ec.c")
                # Same as sensor_ph — compile ec_001 HAL directly into pds_fb.
                list(APPEND PDS_PERIPH_SRCS "${CMAKE_CURRENT_SOURCE_DIR}/../../pds_hal/peripherals/ec_001/ec_001.c")
                list(APPEND PDS_PERIPH_DEFS "PDS_PERIPH_HAS_SENSOR_EC=1")
                list(APPEND PDS_PERIPH_INCLUDE_DIRS "${CMAKE_CURRENT_SOURCE_DIR}/../../pds_hal/peripherals/ec_001/include")
            elseif(_TYPE STREQUAL "encoder_quadrature")
                list(APPEND PDS_PERIPH_SRCS "pds_fb_encoder_quadrature.c")
                list(APPEND PDS_PERIPH_DEFS "PDS_PERIPH_HAS_ENCODER_QUADRATURE=1")
            elseif(_TYPE STREQUAL "encoder_mapped")
                list(APPEND PDS_PERIPH_SRCS "pds_fb_encoder_quadrature.c" "pds_fb_encoder_mapped.c")
                list(APPEND PDS_PERIPH_DEFS "PDS_PERIPH_HAS_ENCODER_QUADRATURE=1" "PDS_PERIPH_HAS_ENCODER_MAPPED=1")
            elseif(_TYPE STREQUAL "ads1115")
                # ads1115 has no fb block — init is role-level in pds_process_action.c (pds_hal)
                # Compile def is emitted so pds_hal's pds_process_action.c can #ifdef-guard init code
                list(APPEND PDS_PERIPH_DEFS "PDS_PERIPH_HAS_ADS1115=1")
            elseif(_TYPE STREQUAL "sensor_analog")
                list(APPEND PDS_PERIPH_SRCS "pds_fb_sensor_analog.c")
                list(APPEND PDS_PERIPH_DEFS "PDS_PERIPH_HAS_SENSOR_ANALOG=1")
            elseif(_TYPE STREQUAL "pid")
                list(APPEND PDS_PERIPH_SRCS "pds_fb_pid.c")
                list(APPEND PDS_PERIPH_DEFS "PDS_PERIPH_HAS_PID=1")
            elseif(_TYPE STREQUAL "pwm_output")
                list(APPEND PDS_PERIPH_SRCS "pds_fb_pwm_output.c")
                list(APPEND PDS_PERIPH_DEFS "PDS_PERIPH_HAS_PWM_OUTPUT=1")
            elseif(_TYPE STREQUAL "gpio_input")
                list(APPEND PDS_PERIPH_SRCS "pds_fb_gpio_input.c")
                list(APPEND PDS_PERIPH_DEFS "PDS_PERIPH_HAS_GPIO_INPUT=1")
            elseif(_TYPE STREQUAL "gpio_value")
                list(APPEND PDS_PERIPH_SRCS "pds_fb_gpio_value.c")
                list(APPEND PDS_PERIPH_DEFS "PDS_PERIPH_HAS_GPIO_VALUE=1")
            elseif(_TYPE STREQUAL "switch_output")
                list(APPEND PDS_PERIPH_SRCS "pds_fb_switch_output.c")
                list(APPEND PDS_PERIPH_DEFS "PDS_PERIPH_HAS_SWITCH_OUTPUT=1")
            elseif(_TYPE STREQUAL "led_addr")
                list(APPEND PDS_PERIPH_SRCS "pds_fb_led_addr.c")
                list(APPEND PDS_PERIPH_DEFS "PDS_PERIPH_HAS_LED_ADDR=1")
            else()
                message(WARNING "pds_fb: unknown peripheral type '${_TYPE}' in ${_PERIPH_CMAKE}")
            endif()
        endforeach()
        if(PDS_PERIPH_SRCS)
            message(STATUS "pds_fb: peripheral drivers: ${PDS_PERIPH_SRCS}")
        endif()
    endif()
endif()

idf_component_register(
    SRCS
        "pds_tel_sink.c"
        "pds_periph_mutex.c"
        "pds_fb_pwr_group.c"
        "pds_fb_hmi_toggle.c"
        "pds_fb_hmi_momentary.c"
        "pds_fb_hmi_run_routine.c"
        "pds_fb_hmi_initiate.c"
        "pds_fb_delay.c"
        "pds_fb_pipeline_suspend.c"
        "pds_fb_pipeline_resume.c"
        "pds_fb_timer_countdown.c"
        "pds_fb_timer_countup.c"
        "pds_fb_timer_cycle.c"
        "pds_fb_limit_analog.c"
        "pds_fb_ref.c"
        "pds_fb_sensor_value.c"
        "pds_fb_fan_float.c"
        # "pds_fb_fan_bool.c"   # deprecated: use fan_float (0x70)
        "pds_fb_all_stop.c"
        "pds_block_registry.c"
        ${PDS_PERIPH_SRCS}
    INCLUDE_DIRS
        "include"
        ${PDS_PERIPH_INCLUDE_DIRS}
    REQUIRES
        pds_hal
        pds_core
        driver
        esp_timer
        led_strip
        esp_driver_rmt
    # Peripheral driver headers — always declared so fb blocks can include them
    # when compiled conditionally via PDS_PERIPH_SRCS. IDF's requirement-collection
    # phase runs before IDF_TARGET is set, so these cannot be conditional.
    # Unused drivers are dead-code-eliminated at link time (-ffunction-sections + --gc-sections).
    PRIV_REQUIRES
        dht22
        hx711
        # ph_001 and ec_001 are compiled directly into pds_fb via PDS_PERIPH_SRCS
        # (see sensor_ph/sensor_ec blocks above) — no separate component dependency needed.
)

# Apply peripheral compile definitions — PUBLIC so pds_pipeline.c inherits them
# via its REQUIRES dependency on pds_fb and can guard encoder/sensor calls.
if(PDS_PERIPH_DEFS)
    target_compile_definitions(${COMPONENT_LIB} PUBLIC ${PDS_PERIPH_DEFS})
endif()
