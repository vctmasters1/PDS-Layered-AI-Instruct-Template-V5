#include "pds_block_registry.h"
#ifdef PDS_PERIPH_HAS_SENSOR_ANALOG
#include "pds_fb_sensor_analog.h"
#endif
#ifdef PDS_PERIPH_HAS_DHT22
#include "pds_fb_dht22.h"
#endif
#ifdef PDS_PERIPH_HAS_SENSOR_PH
#include "pds_fb_sensor_ph.h"
#endif
#ifdef PDS_PERIPH_HAS_SENSOR_EC
#include "pds_fb_sensor_ec.h"
#endif
#ifdef PDS_PERIPH_HAS_HX711
#include "pds_fb_hx711.h"
#endif
#ifdef PDS_PERIPH_HAS_ENCODER_QUADRATURE
#include "pds_fb_encoder_quadrature.h"
#endif
#ifdef PDS_PERIPH_HAS_ENCODER_MAPPED
#include "pds_fb_encoder_mapped.h"
#endif
#ifdef PDS_PERIPH_HAS_STEPPER_A4988
#include "pds_fb_stepper_a4988.h"
#endif
#ifdef PDS_PERIPH_HAS_STEPPER_DRV8825
#include "pds_fb_stepper_drv8825.h"
#endif
#ifdef PDS_PERIPH_HAS_STEPPER_TB6600
#include "pds_fb_stepper_tb6600.h"
#endif
#ifdef PDS_PERIPH_HAS_STEPPER_TMC2209
#include "pds_fb_stepper_tmc2209.h"
#endif
#ifdef PDS_PERIPH_HAS_STEPPER_TMC2208
#include "pds_fb_stepper_tmc2208.h"
#endif
#include "pds_fb_hmi_toggle.h"
#include "pds_fb_hmi_momentary.h"
#include "pds_fb_hmi_run_routine.h"
#include "pds_fb_hmi_initiate.h"
#include "pds_fb_delay.h"
#include "pds_fb_pipeline_suspend.h"
#include "pds_fb_pipeline_resume.h"
#include "pds_fb_timer_countdown.h"
#include "pds_fb_timer_countup.h"
#include "pds_fb_timer_cycle.h"
#ifdef PDS_PERIPH_HAS_PID
#include "pds_fb_pid.h"
#endif
#ifdef PDS_PERIPH_HAS_PWM_OUTPUT
#include "pds_fb_pwm_output.h"
#endif
#ifdef PDS_PERIPH_HAS_GPIO_INPUT
#include "pds_fb_gpio_input.h"
#endif
#ifdef PDS_PERIPH_HAS_GPIO_VALUE
#include "pds_fb_gpio_value.h"
#endif
#ifdef PDS_PERIPH_HAS_SWITCH_OUTPUT
#include "pds_fb_switch_output.h"
#endif
#include "pds_fb_limit_analog.h"
#include "pds_fb_ref.h"
#include "pds_fb_sensor_value.h"
#include "pds_fb_fan_float.h"
// #include "pds_fb_fan_bool.h"   /* deprecated: use fan_float (0x70) */
#ifdef PDS_PERIPH_HAS_LED_ADDR
#include "pds_fb_led_addr.h"
#endif
#include "pds_fb_all_stop.h"
#include <stdlib.h>

#ifdef PDS_PERIPH_HAS_SENSOR_ANALOG
/* ═══════════════════════════════════════════════════════════════════════════
   fb_sensor_analog  (0x01)
   Source block: reads ADC hardware. No pipeline input. Float output.
   ═══════════════════════════════════════════════════════════════════════════ */

static esp_err_t s_sensor_analog_init(const void *pins, const void *s, pds_comp_handle_t *out) {
    (void)pins;
    return pds_fb_sensor_analog_init((const pds_fb_sensor_analog_settings_t *)s, out);
}
static pds_comp_status_t s_sensor_analog_run(pds_comp_handle_t h) {
    return pds_fb_sensor_analog_run(h);
}
static void s_sensor_analog_set_settings(pds_comp_handle_t h, const void *s) {
    pds_fb_sensor_analog_set_settings(h, (const pds_fb_sensor_analog_settings_t *)s);
}
static void s_sensor_analog_connect(pds_comp_handle_t h, uint8_t port, const void *src) {
    (void)h; (void)port; (void)src; /* reads ADC, no pipeline input */
}
static const void *s_sensor_analog_output(pds_comp_handle_t h, uint8_t port) {
    if (port == 0) return &pds_fb_sensor_analog_get_state(h)->value;
    return NULL;
}
#endif /* PDS_PERIPH_HAS_SENSOR_ANALOG */

#ifdef PDS_PERIPH_HAS_DHT22
/* ═══════════════════════════════════════════════════════════════════════════
   fb_sensor_dht22_temp  (0x02)  /  fb_sensor_dht22_humid  (0x03)
   Source block: no pipeline input. Single-wire DHT22 / AM2302 sensor.
   0x02 port 0 — state.temperature (°C)
   0x03 port 0 — state.humidity    (%RH)
   ═══════════════════════════════════════════════════════════════════════════ */

static esp_err_t s_dht22_init(const void *pins, const void *s, pds_comp_handle_t *out) {
    (void)pins;
    return pds_fb_dht22_init((const pds_fb_dht22_settings_t *)s, out);
}
static pds_comp_status_t s_dht22_run(pds_comp_handle_t h) {
    return pds_fb_dht22_run(h);
}
static void s_dht22_set_settings(pds_comp_handle_t h, const void *s) {
    pds_fb_dht22_set_settings(h, (const pds_fb_dht22_settings_t *)s);
}
static void s_dht22_connect(pds_comp_handle_t h, uint8_t port, const void *src) {
    (void)h; (void)port; (void)src; /* source block — no pipeline input */
}
static const void *s_dht22_temp_output(pds_comp_handle_t h, uint8_t port) {
    if (port == 0) return &pds_fb_dht22_get_state(h)->temperature;
    return NULL;
}
static const void *s_dht22_humid_output(pds_comp_handle_t h, uint8_t port) {
    if (port == 0) return &pds_fb_dht22_get_state(h)->humidity;
    return NULL;
}
#endif /* PDS_PERIPH_HAS_DHT22 */

#ifdef PDS_PERIPH_HAS_SENSOR_PH
/* ═══════════════════════════════════════════════════════════════════════════
   fb_sensor_ph  (0x0C)
   Source block: no pipeline input. Power-gated analog pH electrode.
   port 0 — state.ph (calibrated pH value, -999.0 until first read)
   Acquires PDS_PERIPH_MUTEX_ADC_PROBE; skips tick if EC sensor holds it.
   ═══════════════════════════════════════════════════════════════════════════ */

static esp_err_t s_sensor_ph_init(const void *pins, const void *s, pds_comp_handle_t *out) {
    (void)pins;
    return pds_fb_sensor_ph_init((const pds_fb_sensor_ph_settings_t *)s, out);
}
static pds_comp_status_t s_sensor_ph_run(pds_comp_handle_t h) {
    return pds_fb_sensor_ph_run(h);
}
static void s_sensor_ph_set_settings(pds_comp_handle_t h, const void *s) {
    pds_fb_sensor_ph_set_settings(h, (const pds_fb_sensor_ph_settings_t *)s);
}
static void s_sensor_ph_connect(pds_comp_handle_t h, uint8_t port, const void *src) {
    (void)h; (void)port; (void)src; /* source block — no pipeline input */
}
static const void *s_sensor_ph_output(pds_comp_handle_t h, uint8_t port) {
    if (port == 0) return &pds_fb_sensor_ph_get_state(h)->ph;
    return NULL;
}
#endif /* PDS_PERIPH_HAS_SENSOR_PH */

#ifdef PDS_PERIPH_HAS_SENSOR_EC
/* ═══════════════════════════════════════════════════════════════════════════
   fb_sensor_ec  (0x0D)
   Source block: no pipeline input. Power-gated analog EC probe.
   port 0 — state.ec_ms_cm (calibrated EC value in mS/cm, -999.0 until first read)
   Acquires PDS_PERIPH_MUTEX_ADC_PROBE; skips tick if PH sensor holds it.
   ═══════════════════════════════════════════════════════════════════════════ */

static esp_err_t s_sensor_ec_init(const void *pins, const void *s, pds_comp_handle_t *out) {
    (void)pins;
    return pds_fb_sensor_ec_init((const pds_fb_sensor_ec_settings_t *)s, out);
}
static pds_comp_status_t s_sensor_ec_run(pds_comp_handle_t h) {
    return pds_fb_sensor_ec_run(h);
}
static void s_sensor_ec_set_settings(pds_comp_handle_t h, const void *s) {
    pds_fb_sensor_ec_set_settings(h, (const pds_fb_sensor_ec_settings_t *)s);
}
static void s_sensor_ec_connect(pds_comp_handle_t h, uint8_t port, const void *src) {
    /* port 0 reserved for optional temperature compensation input */
    if (port == 0) pds_fb_sensor_ec_connect_temp(h, (const float *)src);
}
static const void *s_sensor_ec_output(pds_comp_handle_t h, uint8_t port) {
    if (port == 0) return &pds_fb_sensor_ec_get_state(h)->ec_ms_cm;
    return NULL;
}
#endif /* PDS_PERIPH_HAS_SENSOR_EC */

#ifdef PDS_PERIPH_HAS_ENCODER_QUADRATURE
/* ═══════════════════════════════════════════════════════════════════════════
   fb_encoder_position  (0xA1)  /  fb_encoder_velocity  (0xA2)
   Source block: no pipeline input. Polls two GPIO pins for quadrature decoding.
   0xA1 port 0 — state.position_f (float cast of int32 position count)
   0xA2 port 0 — state.velocity_rpm
   ═══════════════════════════════════════════════════════════════════════════ */

static esp_err_t s_encoder_quadrature_init(const void *pins, const void *s, pds_comp_handle_t *out) {
    (void)pins;
    return pds_fb_encoder_quadrature_init((const pds_fb_encoder_quadrature_settings_t *)s, out);
}
static pds_comp_status_t s_encoder_quadrature_run(pds_comp_handle_t h) {
    return pds_fb_encoder_quadrature_run(h);
}
static void s_encoder_quadrature_set_settings(pds_comp_handle_t h, const void *s) {
    pds_fb_encoder_quadrature_set_settings(h, (const pds_fb_encoder_quadrature_settings_t *)s);
}
static void s_encoder_quadrature_connect(pds_comp_handle_t h, uint8_t port, const void *src) {
    (void)h; (void)port; (void)src; /* source block — no pipeline input */
}
static const void *s_encoder_pos_output(pds_comp_handle_t h, uint8_t port) {
    if (port == 0) return &pds_fb_encoder_quadrature_get_state(h)->position_f;
    return NULL;
}
static const void *s_encoder_vel_output(pds_comp_handle_t h, uint8_t port) {
    if (port == 0) return &pds_fb_encoder_quadrature_get_state(h)->velocity_rpm;
    return NULL;
}
#endif /* PDS_PERIPH_HAS_ENCODER_QUADRATURE */

#ifdef PDS_PERIPH_HAS_ENCODER_MAPPED
/* ═══════════════════════════════════════════════════════════════════════════
   fb_encoder_mapped  (0xA3)
   Source block: no pipeline input. Quadrature decode + linear map to range.
   port 0 — state.mapped_value
   ═══════════════════════════════════════════════════════════════════════════ */

static esp_err_t s_encoder_mapped_init(const void *pins, const void *s, pds_comp_handle_t *out) {
    (void)pins;
    return pds_fb_encoder_mapped_init((const pds_fb_encoder_mapped_settings_t *)s, out);
}
static pds_comp_status_t s_encoder_mapped_run(pds_comp_handle_t h) {
    return pds_fb_encoder_mapped_run(h);
}
static void s_encoder_mapped_set_settings(pds_comp_handle_t h, const void *s) {
    pds_fb_encoder_mapped_set_settings(h, (const pds_fb_encoder_mapped_settings_t *)s);
}
static void s_encoder_mapped_connect(pds_comp_handle_t h, uint8_t port, const void *src) {
    (void)h; (void)port; (void)src; /* source block — no pipeline input */
}
static const void *s_encoder_mapped_output(pds_comp_handle_t h, uint8_t port) {
    if (port == 0) return &pds_fb_encoder_mapped_get_state(h)->mapped_value;
    return NULL;
}
#endif /* PDS_PERIPH_HAS_ENCODER_MAPPED */

#ifdef PDS_PERIPH_HAS_HX711
/* ═══════════════════════════════════════════════════════════════════════════
   fb_sensor_hx711  (0xA0)
   Source block: no pipeline input. Two-wire bit-bang HX711 load-cell ADC.
   port 0 — state.value (tared, scaled engineering value)
   ═══════════════════════════════════════════════════════════════════════════ */

static esp_err_t s_hx711_init(const void *pins, const void *s, pds_comp_handle_t *out) {
    (void)pins;
    return pds_fb_hx711_init((const pds_fb_hx711_settings_t *)s, out);
}
static pds_comp_status_t s_hx711_run(pds_comp_handle_t h) {
    return pds_fb_hx711_run(h);
}
static void s_hx711_set_settings(pds_comp_handle_t h, const void *s) {
    pds_fb_hx711_set_settings(h, (const pds_fb_hx711_settings_t *)s);
}
static void s_hx711_connect(pds_comp_handle_t h, uint8_t port, const void *src) {
    (void)h; (void)port; (void)src; /* source block — no pipeline input */
}
static const void *s_hx711_output(pds_comp_handle_t h, uint8_t port) {
    if (port == 0) return &pds_fb_hx711_get_state(h)->value;
    return NULL;
}
#endif /* PDS_PERIPH_HAS_HX711 */

/* ═══════════════════════════════════════════════════════════════════════════
   Stepper drivers  (0x60–0x69)
   Each physical driver file provides BOTH velocity and position modes.
   Velocity: port 0 in = float speed_rpm (±), port 1 in = bool enable.
   Position: port 0 in = float target_steps (cast to int32, ± = direction),
             port 1 in = float trigger (rising edge starts move),
             port 0 out = float done_f (1.0 for one tick on completion).
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── A4988 ──────────────────────────────────────────────────────────────── */
#ifdef PDS_PERIPH_HAS_STEPPER_A4988
static esp_err_t s_stepper_a4988_vel_init(const void *pins, const void *s, pds_comp_handle_t *out) {
    (void)pins; return pds_fb_stepper_a4988_init((const pds_fb_stepper_a4988_settings_t *)s, out); }
static pds_comp_status_t s_stepper_a4988_vel_run(pds_comp_handle_t h) {
    return pds_fb_stepper_a4988_run(h); }
static void s_stepper_a4988_vel_set_settings(pds_comp_handle_t h, const void *s) {
    pds_fb_stepper_a4988_set_settings(h, (const pds_fb_stepper_a4988_settings_t *)s); }
static void s_stepper_a4988_vel_connect(pds_comp_handle_t h, uint8_t port, const void *src) {
    if (port == 0) pds_fb_stepper_a4988_connect_speed(h, (const float *)src);
    else if (port == 1) pds_fb_stepper_a4988_connect_enable(h, (const bool *)src); }
static const void *s_stepper_a4988_vel_output(pds_comp_handle_t h, uint8_t port) {
    (void)h; (void)port; return NULL; /* terminal block */ }
static void s_stepper_a4988_vel_safe(pds_comp_handle_t h) { pds_fb_stepper_a4988_stop(h); }

static esp_err_t s_stepper_a4988_pos_init(const void *pins, const void *s, pds_comp_handle_t *out) {
    (void)pins; return pds_fb_stepper_a4988_position_init((const pds_fb_stepper_a4988_position_settings_t *)s, out); }
static pds_comp_status_t s_stepper_a4988_pos_run(pds_comp_handle_t h) {
    return pds_fb_stepper_a4988_position_run(h); }
static void s_stepper_a4988_pos_set_settings(pds_comp_handle_t h, const void *s) {
    pds_fb_stepper_a4988_position_set_settings(h, (const pds_fb_stepper_a4988_settings_t *)s); }
static void s_stepper_a4988_pos_connect(pds_comp_handle_t h, uint8_t port, const void *src) {
    if (port == 0) pds_fb_stepper_a4988_position_connect_target(h, (const float *)src);
    else if (port == 1) pds_fb_stepper_a4988_position_connect_trigger(h, (const float *)src); }
static const void *s_stepper_a4988_pos_output(pds_comp_handle_t h, uint8_t port) {
    if (port == 0) return &pds_fb_stepper_a4988_position_get_state(h)->done_f;
    return NULL; }
static void s_stepper_a4988_pos_safe(pds_comp_handle_t h) { pds_fb_stepper_a4988_position_stop(h); }
#endif /* PDS_PERIPH_HAS_STEPPER_A4988 */

/* ── DRV8825 ────────────────────────────────────────────────────────────── */
#ifdef PDS_PERIPH_HAS_STEPPER_DRV8825
static esp_err_t s_stepper_drv8825_vel_init(const void *pins, const void *s, pds_comp_handle_t *out) {
    (void)pins; return pds_fb_stepper_drv8825_init((const pds_fb_stepper_drv8825_settings_t *)s, out); }
static pds_comp_status_t s_stepper_drv8825_vel_run(pds_comp_handle_t h) {
    return pds_fb_stepper_drv8825_run(h); }
static void s_stepper_drv8825_vel_set_settings(pds_comp_handle_t h, const void *s) {
    pds_fb_stepper_drv8825_set_settings(h, (const pds_fb_stepper_drv8825_settings_t *)s); }
static void s_stepper_drv8825_vel_connect(pds_comp_handle_t h, uint8_t port, const void *src) {
    if (port == 0) pds_fb_stepper_drv8825_connect_speed(h, (const float *)src);
    else if (port == 1) pds_fb_stepper_drv8825_connect_enable(h, (const bool *)src); }
static const void *s_stepper_drv8825_vel_output(pds_comp_handle_t h, uint8_t port) {
    (void)h; (void)port; return NULL; }
static void s_stepper_drv8825_vel_safe(pds_comp_handle_t h) { pds_fb_stepper_drv8825_stop(h); }

static esp_err_t s_stepper_drv8825_pos_init(const void *pins, const void *s, pds_comp_handle_t *out) {
    (void)pins; return pds_fb_stepper_drv8825_position_init((const pds_fb_stepper_drv8825_position_settings_t *)s, out); }
static pds_comp_status_t s_stepper_drv8825_pos_run(pds_comp_handle_t h) {
    return pds_fb_stepper_drv8825_position_run(h); }
static void s_stepper_drv8825_pos_set_settings(pds_comp_handle_t h, const void *s) {
    pds_fb_stepper_drv8825_position_set_settings(h, (const pds_fb_stepper_drv8825_settings_t *)s); }
static void s_stepper_drv8825_pos_connect(pds_comp_handle_t h, uint8_t port, const void *src) {
    if (port == 0) pds_fb_stepper_drv8825_position_connect_target(h, (const float *)src);
    else if (port == 1) pds_fb_stepper_drv8825_position_connect_trigger(h, (const float *)src); }
static const void *s_stepper_drv8825_pos_output(pds_comp_handle_t h, uint8_t port) {
    if (port == 0) return &pds_fb_stepper_drv8825_position_get_state(h)->done_f;
    return NULL; }
static void s_stepper_drv8825_pos_safe(pds_comp_handle_t h) { pds_fb_stepper_drv8825_position_stop(h); }
#endif /* PDS_PERIPH_HAS_STEPPER_DRV8825 */

/* ── TB6600 ─────────────────────────────────────────────────────────────── */
#ifdef PDS_PERIPH_HAS_STEPPER_TB6600
static esp_err_t s_stepper_tb6600_vel_init(const void *pins, const void *s, pds_comp_handle_t *out) {
    (void)pins; return pds_fb_stepper_tb6600_init((const pds_fb_stepper_tb6600_settings_t *)s, out); }
static pds_comp_status_t s_stepper_tb6600_vel_run(pds_comp_handle_t h) {
    return pds_fb_stepper_tb6600_run(h); }
static void s_stepper_tb6600_vel_set_settings(pds_comp_handle_t h, const void *s) {
    pds_fb_stepper_tb6600_set_settings(h, (const pds_fb_stepper_tb6600_settings_t *)s); }
static void s_stepper_tb6600_vel_connect(pds_comp_handle_t h, uint8_t port, const void *src) {
    if (port == 0) pds_fb_stepper_tb6600_connect_speed(h, (const float *)src);
    else if (port == 1) pds_fb_stepper_tb6600_connect_enable(h, (const bool *)src); }
static const void *s_stepper_tb6600_vel_output(pds_comp_handle_t h, uint8_t port) {
    (void)h; (void)port; return NULL; }
static void s_stepper_tb6600_vel_safe(pds_comp_handle_t h) { pds_fb_stepper_tb6600_stop(h); }

static esp_err_t s_stepper_tb6600_pos_init(const void *pins, const void *s, pds_comp_handle_t *out) {
    (void)pins; return pds_fb_stepper_tb6600_position_init((const pds_fb_stepper_tb6600_position_settings_t *)s, out); }
static pds_comp_status_t s_stepper_tb6600_pos_run(pds_comp_handle_t h) {
    return pds_fb_stepper_tb6600_position_run(h); }
static void s_stepper_tb6600_pos_set_settings(pds_comp_handle_t h, const void *s) {
    pds_fb_stepper_tb6600_position_set_settings(h, (const pds_fb_stepper_tb6600_settings_t *)s); }
static void s_stepper_tb6600_pos_connect(pds_comp_handle_t h, uint8_t port, const void *src) {
    if (port == 0) pds_fb_stepper_tb6600_position_connect_target(h, (const float *)src);
    else if (port == 1) pds_fb_stepper_tb6600_position_connect_trigger(h, (const float *)src); }
static const void *s_stepper_tb6600_pos_output(pds_comp_handle_t h, uint8_t port) {
    if (port == 0) return &pds_fb_stepper_tb6600_position_get_state(h)->done_f;
    return NULL; }
static void s_stepper_tb6600_pos_safe(pds_comp_handle_t h) { pds_fb_stepper_tb6600_position_stop(h); }
#endif /* PDS_PERIPH_HAS_STEPPER_TB6600 */

/* ── TMC2209 ────────────────────────────────────────────────────────────── */
#ifdef PDS_PERIPH_HAS_STEPPER_TMC2209
static esp_err_t s_stepper_tmc2209_vel_init(const void *pins, const void *s, pds_comp_handle_t *out) {
    (void)pins; return pds_fb_stepper_tmc2209_init((const pds_fb_stepper_tmc2209_settings_t *)s, out); }
static pds_comp_status_t s_stepper_tmc2209_vel_run(pds_comp_handle_t h) {
    return pds_fb_stepper_tmc2209_run(h); }
static void s_stepper_tmc2209_vel_set_settings(pds_comp_handle_t h, const void *s) {
    pds_fb_stepper_tmc2209_set_settings(h, (const pds_fb_stepper_tmc2209_settings_t *)s); }
static void s_stepper_tmc2209_vel_connect(pds_comp_handle_t h, uint8_t port, const void *src) {
    if (port == 0) pds_fb_stepper_tmc2209_connect_speed(h, (const float *)src);
    else if (port == 1) pds_fb_stepper_tmc2209_connect_enable(h, (const bool *)src); }
static const void *s_stepper_tmc2209_vel_output(pds_comp_handle_t h, uint8_t port) {
    (void)h; (void)port; return NULL; }
static void s_stepper_tmc2209_vel_safe(pds_comp_handle_t h) { pds_fb_stepper_tmc2209_stop(h); }

static esp_err_t s_stepper_tmc2209_pos_init(const void *pins, const void *s, pds_comp_handle_t *out) {
    (void)pins; return pds_fb_stepper_tmc2209_position_init((const pds_fb_stepper_tmc2209_position_settings_t *)s, out); }
static pds_comp_status_t s_stepper_tmc2209_pos_run(pds_comp_handle_t h) {
    return pds_fb_stepper_tmc2209_position_run(h); }
static void s_stepper_tmc2209_pos_set_settings(pds_comp_handle_t h, const void *s) {
    pds_fb_stepper_tmc2209_position_set_settings(h, (const pds_fb_stepper_tmc2209_settings_t *)s); }
static void s_stepper_tmc2209_pos_connect(pds_comp_handle_t h, uint8_t port, const void *src) {
    if (port == 0) pds_fb_stepper_tmc2209_position_connect_target(h, (const float *)src);
    else if (port == 1) pds_fb_stepper_tmc2209_position_connect_trigger(h, (const float *)src); }
static const void *s_stepper_tmc2209_pos_output(pds_comp_handle_t h, uint8_t port) {
    if (port == 0) return &pds_fb_stepper_tmc2209_position_get_state(h)->done_f;
    return NULL; }
static void s_stepper_tmc2209_pos_safe(pds_comp_handle_t h) { pds_fb_stepper_tmc2209_position_stop(h); }
#endif /* PDS_PERIPH_HAS_STEPPER_TMC2209 */

/* ── TMC2208 ────────────────────────────────────────────────────────────── */
#ifdef PDS_PERIPH_HAS_STEPPER_TMC2208
static esp_err_t s_stepper_tmc2208_vel_init(const void *pins, const void *s, pds_comp_handle_t *out) {
    (void)pins; return pds_fb_stepper_tmc2208_init((const pds_fb_stepper_tmc2208_settings_t *)s, out); }
static pds_comp_status_t s_stepper_tmc2208_vel_run(pds_comp_handle_t h) {
    return pds_fb_stepper_tmc2208_run(h); }
static void s_stepper_tmc2208_vel_set_settings(pds_comp_handle_t h, const void *s) {
    pds_fb_stepper_tmc2208_set_settings(h, (const pds_fb_stepper_tmc2208_settings_t *)s); }
static void s_stepper_tmc2208_vel_connect(pds_comp_handle_t h, uint8_t port, const void *src) {
    if (port == 0) pds_fb_stepper_tmc2208_connect_speed(h, (const float *)src);
    else if (port == 1) pds_fb_stepper_tmc2208_connect_enable(h, (const bool *)src); }
static const void *s_stepper_tmc2208_vel_output(pds_comp_handle_t h, uint8_t port) {
    (void)h; (void)port; return NULL; }
static void s_stepper_tmc2208_vel_safe(pds_comp_handle_t h) { pds_fb_stepper_tmc2208_stop(h); }

static esp_err_t s_stepper_tmc2208_pos_init(const void *pins, const void *s, pds_comp_handle_t *out) {
    (void)pins; return pds_fb_stepper_tmc2208_position_init((const pds_fb_stepper_tmc2208_position_settings_t *)s, out); }
static pds_comp_status_t s_stepper_tmc2208_pos_run(pds_comp_handle_t h) {
    return pds_fb_stepper_tmc2208_position_run(h); }
static void s_stepper_tmc2208_pos_set_settings(pds_comp_handle_t h, const void *s) {
    pds_fb_stepper_tmc2208_position_set_settings(h, (const pds_fb_stepper_tmc2208_settings_t *)s); }
static void s_stepper_tmc2208_pos_connect(pds_comp_handle_t h, uint8_t port, const void *src) {
    if (port == 0) pds_fb_stepper_tmc2208_position_connect_target(h, (const float *)src);
    else if (port == 1) pds_fb_stepper_tmc2208_position_connect_trigger(h, (const float *)src); }
static const void *s_stepper_tmc2208_pos_output(pds_comp_handle_t h, uint8_t port) {
    if (port == 0) return &pds_fb_stepper_tmc2208_position_get_state(h)->done_f;
    return NULL; }
static void s_stepper_tmc2208_pos_safe(pds_comp_handle_t h) { pds_fb_stepper_tmc2208_position_stop(h); }
#endif /* PDS_PERIPH_HAS_STEPPER_TMC2208 */
/* ═══════════════════════════════════════════════════════════════════════════ */

static esp_err_t s_hmi_toggle_init(const void *pins, const void *s, pds_comp_handle_t *out) {
    (void)pins;
    return pds_fb_hmi_toggle_init((const pds_fb_hmi_toggle_settings_t *)s, out);
}
static pds_comp_status_t s_hmi_toggle_run(pds_comp_handle_t h) {
    return pds_fb_hmi_toggle_run(h);
}
static void s_hmi_toggle_set_settings(pds_comp_handle_t h, const void *s) {
    pds_fb_hmi_toggle_set_settings(h, (const pds_fb_hmi_toggle_settings_t *)s);
}
static void s_hmi_toggle_connect(pds_comp_handle_t h, uint8_t port, const void *src) {
    (void)h; (void)port; (void)src; /* source block — no pipeline input */
}
static const void *s_hmi_toggle_output(pds_comp_handle_t h, uint8_t port) {
    if (port == 0) return &pds_fb_hmi_toggle_get_state(h)->active_f;
    return NULL;
}

/* ═══════════════════════════════════════════════════════════════════════════
   fb_hmi_momentary  (0x05)
   Source block: no pipeline input. Float active_f output (port 0).
   HMI fires via pds_fb_hmi_momentary_trigger(); re-triggerable.
   ═══════════════════════════════════════════════════════════════════════════ */

static esp_err_t s_hmi_momentary_init(const void *pins, const void *s, pds_comp_handle_t *out) {
    (void)pins;
    return pds_fb_hmi_momentary_init((const pds_fb_hmi_momentary_settings_t *)s, out);
}
static pds_comp_status_t s_hmi_momentary_run(pds_comp_handle_t h) {
    return pds_fb_hmi_momentary_run(h);
}
static void s_hmi_momentary_set_settings(pds_comp_handle_t h, const void *s) {
    pds_fb_hmi_momentary_set_settings(h, (const pds_fb_hmi_momentary_settings_t *)s);
}
static void s_hmi_momentary_connect(pds_comp_handle_t h, uint8_t port, const void *src) {
    (void)h; (void)port; (void)src; /* source block — no pipeline input */
}
static const void *s_hmi_momentary_output(pds_comp_handle_t h, uint8_t port) {
    if (port == 0) return &pds_fb_hmi_momentary_get_state(h)->active_f;
    return NULL;
}

/* ═══════════════════════════════════════════════════════════════════════════
   fb_hmi_run_routine  (0x06)
   Source block: no pipeline input.
   port 0 — running_f (1.0f while executing)
   port 1 — done_f    (1.0f for one tick on normal completion)
   HMI fires via pds_fb_hmi_run_routine_start(); cannot re-start while running.
   ═══════════════════════════════════════════════════════════════════════════ */

static esp_err_t s_hmi_run_routine_init(const void *pins, const void *s, pds_comp_handle_t *out) {
    (void)pins;
    return pds_fb_hmi_run_routine_init((const pds_fb_hmi_run_routine_settings_t *)s, out);
}
static pds_comp_status_t s_hmi_run_routine_run(pds_comp_handle_t h) {
    return pds_fb_hmi_run_routine_run(h);
}
static void s_hmi_run_routine_set_settings(pds_comp_handle_t h, const void *s) {
    pds_fb_hmi_run_routine_set_settings(h, (const pds_fb_hmi_run_routine_settings_t *)s);
}
static void s_hmi_run_routine_connect(pds_comp_handle_t h, uint8_t port, const void *src) {
    (void)h; (void)port; (void)src; /* source block — no pipeline input */
}
static const void *s_hmi_run_routine_output(pds_comp_handle_t h, uint8_t port) {
    if (port == 0) return &pds_fb_hmi_run_routine_get_state(h)->running_f;
    if (port == 1) return &pds_fb_hmi_run_routine_get_state(h)->done_f;
    return NULL;
}

/* ═══════════════════════════════════════════════════════════════════════════
   fb_hmi_initiate  (0x0A)
   Source block: no pipeline input. Float active_f output (port 0).
   HMI sets confirm=true via set_settings(); fires for one tick then auto-clears.
   ═══════════════════════════════════════════════════════════════════════════ */

static esp_err_t s_hmi_initiate_init(const void *pins, const void *s, pds_comp_handle_t *out) {
    (void)pins;
    return pds_fb_hmi_initiate_init((const pds_fb_hmi_initiate_settings_t *)s, out);
}
static pds_comp_status_t s_hmi_initiate_run(pds_comp_handle_t h) {
    return pds_fb_hmi_initiate_run(h);
}
static void s_hmi_initiate_set_settings(pds_comp_handle_t h, const void *s) {
    pds_fb_hmi_initiate_set_settings(h, (const pds_fb_hmi_initiate_settings_t *)s);
}
static void s_hmi_initiate_connect(pds_comp_handle_t h, uint8_t port, const void *src) {
    (void)h; (void)port; (void)src; /* source block — no pipeline input */
}
static const void *s_hmi_initiate_output(pds_comp_handle_t h, uint8_t port) {
    if (port == 0) return &pds_fb_hmi_initiate_get_state(h)->active_f;
    return NULL;
}

/* ═══════════════════════════════════════════════════════════════════════════
   fb_delay  (0x0B)
   Rising-edge-triggered one-shot delay. Float trigger in (port 0).
   Output active_f = 1.0f for exactly one tick after delay_ms elapses.
   ═══════════════════════════════════════════════════════════════════════════ */

static esp_err_t s_delay_init(const void *pins, const void *s, pds_comp_handle_t *out) {
    (void)pins;
    return pds_fb_delay_init((const pds_fb_delay_settings_t *)s, out);
}
static pds_comp_status_t s_delay_run(pds_comp_handle_t h) {
    return pds_fb_delay_run(h);
}
static void s_delay_set_settings(pds_comp_handle_t h, const void *s) {
    pds_fb_delay_set_settings(h, (const pds_fb_delay_settings_t *)s);
}
static void s_delay_connect(pds_comp_handle_t h, uint8_t port, const void *src) {
    if (port == 0) pds_fb_delay_connect_input(h, (const float *)src);
}
static const void *s_delay_output(pds_comp_handle_t h, uint8_t port) {
    if (port == 0) return &pds_fb_delay_get_state(h)->active_f;
    return NULL;
}

/* ═══════════════════════════════════════════════════════════════════════════
   fb_pipeline_suspend  (0x07)
   Pass-through: float in → float out. Rising edge suspends target pipeline.
   ═══════════════════════════════════════════════════════════════════════════ */

static esp_err_t s_pipeline_suspend_init(const void *pins, const void *s, pds_comp_handle_t *out) {
    (void)pins;
    return pds_fb_pipeline_suspend_init((const pds_fb_pipeline_suspend_settings_t *)s, out);
}
static pds_comp_status_t s_pipeline_suspend_run(pds_comp_handle_t h) {
    return pds_fb_pipeline_suspend_run(h);
}
static void s_pipeline_suspend_set_settings(pds_comp_handle_t h, const void *s) {
    pds_fb_pipeline_suspend_set_settings(h, (const pds_fb_pipeline_suspend_settings_t *)s);
}
static void s_pipeline_suspend_connect(pds_comp_handle_t h, uint8_t port, const void *src) {
    if (port == 0) pds_fb_pipeline_suspend_connect_trigger(h, (const float *)src);
}
static const void *s_pipeline_suspend_output(pds_comp_handle_t h, uint8_t port) {
    if (port == 0) return &pds_fb_pipeline_suspend_get_state(h)->trigger_f;
    return NULL;
}

/* ═══════════════════════════════════════════════════════════════════════════
   fb_pipeline_resume  (0x08)
   Pass-through: float in → float out. Rising edge resumes target pipeline.
   ═══════════════════════════════════════════════════════════════════════════ */

static esp_err_t s_pipeline_resume_init(const void *pins, const void *s, pds_comp_handle_t *out) {
    (void)pins;
    return pds_fb_pipeline_resume_init((const pds_fb_pipeline_resume_settings_t *)s, out);
}
static pds_comp_status_t s_pipeline_resume_run(pds_comp_handle_t h) {
    return pds_fb_pipeline_resume_run(h);
}
static void s_pipeline_resume_set_settings(pds_comp_handle_t h, const void *s) {
    pds_fb_pipeline_resume_set_settings(h, (const pds_fb_pipeline_resume_settings_t *)s);
}
static void s_pipeline_resume_connect(pds_comp_handle_t h, uint8_t port, const void *src) {
    if (port == 0) pds_fb_pipeline_resume_connect_trigger(h, (const float *)src);
}
static const void *s_pipeline_resume_output(pds_comp_handle_t h, uint8_t port) {
    if (port == 0) return &pds_fb_pipeline_resume_get_state(h)->trigger_f;
    return NULL;
}

/* ═══════════════════════════════════════════════════════════════════════════
   fb_timer_countdown  (0x10)
   Bool trigger input (rising edge). Bool active output.
   ═══════════════════════════════════════════════════════════════════════════ */

static esp_err_t s_timer_countdown_init(const void *pins, const void *s, pds_comp_handle_t *out) {
    (void)pins;
    return pds_fb_timer_countdown_init((const pds_fb_timer_countdown_settings_t *)s, out);
}
static pds_comp_status_t s_timer_countdown_run(pds_comp_handle_t h) {
    return pds_fb_timer_countdown_run(h);
}
static void s_timer_countdown_set_settings(pds_comp_handle_t h, const void *s) {
    pds_fb_timer_countdown_set_settings(h, (const pds_fb_timer_countdown_settings_t *)s);
}
static void s_timer_countdown_connect(pds_comp_handle_t h, uint8_t port, const void *src) {
    if (port == 0) pds_fb_timer_countdown_connect_trigger(h, (const float *)src);
}
static const void *s_timer_countdown_output(pds_comp_handle_t h, uint8_t port) {
    if (port == 0) return &pds_fb_timer_countdown_get_state(h)->active_f;
    return NULL;
}

/* ═══════════════════════════════════════════════════════════════════════════
   fb_timer_countup  (0x11)
   Bool trigger input (edge/hold). Bool active output.
   ═══════════════════════════════════════════════════════════════════════════ */

static esp_err_t s_timer_countup_init(const void *pins, const void *s, pds_comp_handle_t *out) {
    (void)pins;
    return pds_fb_timer_countup_init((const pds_fb_timer_countup_settings_t *)s, out);
}
static pds_comp_status_t s_timer_countup_run(pds_comp_handle_t h) {
    return pds_fb_timer_countup_run(h);
}
static void s_timer_countup_set_settings(pds_comp_handle_t h, const void *s) {
    pds_fb_timer_countup_set_settings(h, (const pds_fb_timer_countup_settings_t *)s);
}
static void s_timer_countup_connect(pds_comp_handle_t h, uint8_t port, const void *src) {
    if (port == 0) pds_fb_timer_countup_connect_trigger(h, (const float *)src);
}
static const void *s_timer_countup_output(pds_comp_handle_t h, uint8_t port) {
    if (port == 0) return &pds_fb_timer_countup_get_state(h)->active_f;
    return NULL;
}

/* ═══════════════════════════════════════════════════════════════════════════
   fb_timer_cycle  (0x12)
   Free-running: no pipeline input. Bool active output.
   ═══════════════════════════════════════════════════════════════════════════ */

static esp_err_t s_timer_cycle_init(const void *pins, const void *s, pds_comp_handle_t *out) {
    (void)pins;
    return pds_fb_timer_cycle_init((const pds_fb_timer_cycle_settings_t *)s, out);
}
static pds_comp_status_t s_timer_cycle_run(pds_comp_handle_t h) {
    return pds_fb_timer_cycle_run(h);
}
static void s_timer_cycle_set_settings(pds_comp_handle_t h, const void *s) {
    pds_fb_timer_cycle_set_settings(h, (const pds_fb_timer_cycle_settings_t *)s);
}
static void s_timer_cycle_connect(pds_comp_handle_t h, uint8_t port, const void *src) {
    (void)h; (void)port; (void)src; /* free-running, no pipeline input */
}
static const void *s_timer_cycle_output(pds_comp_handle_t h, uint8_t port) {
    if (port == 0) return &pds_fb_timer_cycle_get_state(h)->active_f;
    return NULL;
}

#ifdef PDS_PERIPH_HAS_PID
/* ═══════════════════════════════════════════════════════════════════════════
   fb_pid  (0x21)
   Naked PID. Float PV input (port 0), optional bool enable (port 1). Float output_pct.
   No pin/PWM — fan out to pwm_output blocks.
   ═══════════════════════════════════════════════════════════════════════════ */

static esp_err_t s_pid_init(const void *pins, const void *s, pds_comp_handle_t *out) {
    (void)pins;
    return pds_fb_pid_init((const pds_fb_pid_settings_t *)s, out);
}
static pds_comp_status_t s_pid_run(pds_comp_handle_t h) {
    return pds_fb_pid_run(h);
}
static void s_pid_set_settings(pds_comp_handle_t h, const void *s) {
    pds_fb_pid_set_settings(h, (const pds_fb_pid_settings_t *)s);
}
static void s_pid_connect(pds_comp_handle_t h, uint8_t port, const void *src) {
    if (port == 0) pds_fb_pid_connect_pv(h, (const float *)src);
    else if (port == 1) pds_fb_pid_connect_enable(h, (const bool *)src);
}
static const void *s_pid_output(pds_comp_handle_t h, uint8_t port) {
    if (port == 0) return &pds_fb_pid_get_state(h)->output_pct;
    return NULL;
}
#endif /* PDS_PERIPH_HAS_PID */

#ifdef PDS_PERIPH_HAS_PWM_OUTPUT
/* ═══════════════════════════════════════════════════════════════════════════
   fb_pwm_output  (0x22)
   Float value input (port 0), optional bool enable (port 1). Drives PWM pin.
   ratio setting portions the signal; outputs count_rate.
   ═══════════════════════════════════════════════════════════════════════════ */

static esp_err_t s_pwm_output_init(const void *pins, const void *s, pds_comp_handle_t *out) {
    (void)pins;
    return pds_fb_pwm_output_init((const pds_fb_pwm_output_settings_t *)s, out);
}
static pds_comp_status_t s_pwm_output_run(pds_comp_handle_t h) {
    return pds_fb_pwm_output_run(h);
}
static void s_pwm_output_set_settings(pds_comp_handle_t h, const void *s) {
    pds_fb_pwm_output_set_settings(h, (const pds_fb_pwm_output_settings_t *)s);
}
static void s_pwm_output_connect(pds_comp_handle_t h, uint8_t port, const void *src) {
    if (port == 0) pds_fb_pwm_output_connect_value(h, (const float *)src);
    else if (port == 1) pds_fb_pwm_output_connect_enable(h, (const bool *)src);
}
static const void *s_pwm_output_output(pds_comp_handle_t h, uint8_t port) {
    if (port == 0) return &pds_fb_pwm_output_get_state(h)->count_rate;
    return NULL;
}
#endif /* PDS_PERIPH_HAS_PWM_OUTPUT */

#ifdef PDS_PERIPH_HAS_GPIO_INPUT
/* ═══════════════════════════════════════════════════════════════════════════
   fb_gpio_input  (0x30)
   Source block: reads GPIO hardware. No pipeline input. Bool active output.
   ═══════════════════════════════════════════════════════════════════════════ */

static esp_err_t s_gpio_input_init(const void *pins, const void *s, pds_comp_handle_t *out) {
    (void)pins;
    return pds_fb_gpio_input_init((const pds_fb_gpio_input_settings_t *)s, out);
}
static pds_comp_status_t s_gpio_input_run(pds_comp_handle_t h) {
    return pds_fb_gpio_input_run(h);
}
static void s_gpio_input_set_settings(pds_comp_handle_t h, const void *s) {
    pds_fb_gpio_input_set_settings(h, (const pds_fb_gpio_input_settings_t *)s);
}
static void s_gpio_input_connect(pds_comp_handle_t h, uint8_t port, const void *src) {
    (void)h; (void)port; (void)src; /* reads GPIO, no pipeline input */
}
static const void *s_gpio_input_output(pds_comp_handle_t h, uint8_t port) {
    if (port == 0) return &pds_fb_gpio_input_get_state(h)->active_f;
    return NULL;
}
#endif /* PDS_PERIPH_HAS_GPIO_INPUT */

#ifdef PDS_PERIPH_HAS_GPIO_VALUE
/* ═══════════════════════════════════════════════════════════════════════════
   fb_gpio_value  (0x32)
   Source block: reads cached bool state from a gpio_input in another pipeline.
   No GPIO ownership. Bool output via active_f. Wired by engine post-build pass.
   ═══════════════════════════════════════════════════════════════════════════ */

static esp_err_t s_gpio_value_init(const void *pins, const void *s, pds_comp_handle_t *out) {
    (void)pins;
    return pds_fb_gpio_value_init((const pds_fb_gpio_value_settings_t *)s, out);
}
static pds_comp_status_t s_gpio_value_run(pds_comp_handle_t h) {
    return pds_fb_gpio_value_run(h);
}
static void s_gpio_value_set_settings(pds_comp_handle_t h, const void *s) {
    pds_fb_gpio_value_set_settings(h, (const pds_fb_gpio_value_settings_t *)s);
}
static void s_gpio_value_connect(pds_comp_handle_t h, uint8_t port, const void *src) {
    (void)h; (void)port; (void)src; /* source block — connected via engine post-build pass */
}
static const void *s_gpio_value_output(pds_comp_handle_t h, uint8_t port) {
    if (port == 0) return &pds_fb_gpio_value_get_state(h)->active_f;
    return NULL;
}
#endif /* PDS_PERIPH_HAS_GPIO_VALUE */

#ifdef PDS_PERIPH_HAS_SWITCH_OUTPUT
/* ═══════════════════════════════════════════════════════════════════════════
   fb_gpio_output / fb_switch_output  (0x31)
   Bool signal input (port 0). Terminal block — no pipeline output.
   ═══════════════════════════════════════════════════════════════════════════ */

static esp_err_t s_gpio_output_init(const void *pins, const void *s, pds_comp_handle_t *out) {
    (void)pins;
    return pds_fb_switch_output_init((const pds_fb_switch_output_settings_t *)s, out);
}
static pds_comp_status_t s_gpio_output_run(pds_comp_handle_t h) {
    return pds_fb_switch_output_run(h);
}
static void s_gpio_output_set_settings(pds_comp_handle_t h, const void *s) {
    pds_fb_switch_output_set_settings(h, (const pds_fb_switch_output_settings_t *)s);
}
static void s_gpio_output_connect(pds_comp_handle_t h, uint8_t port, const void *src) {
    if (port == 0) pds_fb_switch_output_connect_signal(h, (const float *)src);
}
static const void *s_gpio_output_output(pds_comp_handle_t h, uint8_t port) {
    (void)h; (void)port;
    return NULL; /* terminal block */
}
#endif /* PDS_PERIPH_HAS_SWITCH_OUTPUT */

/* ═══════════════════════════════════════════════════════════════════════════
   fb_limit_analog  (0x40 = limit_high, 0x41 = limit_low)
   Same functions for both types. trip_on_high in settings_t distinguishes them.
   Float PV input (port 0). Bool tripped output.
   ═══════════════════════════════════════════════════════════════════════════ */

static esp_err_t s_limit_analog_init(const void *pins, const void *s, pds_comp_handle_t *out) {
    (void)pins;
    return pds_fb_limit_analog_init((const pds_fb_limit_analog_settings_t *)s, out);
}
static pds_comp_status_t s_limit_analog_run(pds_comp_handle_t h) {
    return pds_fb_limit_analog_run(h);
}
static void s_limit_analog_set_settings(pds_comp_handle_t h, const void *s) {
    pds_fb_limit_analog_set_settings(h, (const pds_fb_limit_analog_settings_t *)s);
}
static void s_limit_analog_connect(pds_comp_handle_t h, uint8_t port, const void *src) {
    if (port == 0) pds_fb_limit_analog_connect_pv(h, (const float *)src);
}
static const void *s_limit_analog_output(pds_comp_handle_t h, uint8_t port) {
    if (port == 0) return &pds_fb_limit_analog_get_state(h)->tripped_f;
    return NULL;
}

/* ═══════════════════════════════════════════════════════════════════════════
   fb_ref  (0x50)
   Zero-logic fan-out passthrough. pins_size=1 (source_block_idx in Layer 2).
   Output pointer set by pipeline engine via pds_fb_ref_set_source() after init.
   ═══════════════════════════════════════════════════════════════════════════ */

static esp_err_t s_fb_ref_init(const void *pins, const void *settings, pds_comp_handle_t *out) {
    (void)pins; (void)settings;
    return pds_fb_ref_init(out);
}
static pds_comp_status_t s_fb_ref_run(pds_comp_handle_t h) {
    return pds_fb_ref_run(h);
}
static void s_fb_ref_set_settings(pds_comp_handle_t h, const void *s) {
    (void)h; (void)s; /* no settings */
}
static void s_fb_ref_connect(pds_comp_handle_t h, uint8_t port, const void *src) {
    if (port == 0) pds_fb_ref_set_source(h, src);
}
static const void *s_fb_ref_output(pds_comp_handle_t h, uint8_t port) {
    if (port == 0) return ((const pds_fb_ref_t *)h)->state.output;
    return NULL;
}

/* ═══════════════════════════════════════════════════════════════════════════
   fb_sensor_value  (0x51)
   Source block: no pipeline input. Float value output.
   Cross-pipeline sensor reference — set_source() wired by engine post-build.
   ═══════════════════════════════════════════════════════════════════════════ */

static esp_err_t s_sensor_value_init(const void *pins, const void *s, pds_comp_handle_t *out) {
    (void)pins;
    return pds_fb_sensor_value_init((const pds_fb_sensor_value_settings_t *)s, out);
}
static pds_comp_status_t s_sensor_value_run(pds_comp_handle_t h) {
    return pds_fb_sensor_value_run(h);
}
static void s_sensor_value_set_settings(pds_comp_handle_t h, const void *s) {
    pds_fb_sensor_value_set_settings(h, (const pds_fb_sensor_value_settings_t *)s);
}
static void s_sensor_value_connect(pds_comp_handle_t h, uint8_t port, const void *src) {
    (void)h; (void)port; (void)src; /* source block — connected via engine post-build pass */
}
static const void *s_sensor_value_output(pds_comp_handle_t h, uint8_t port) {
    if (port == 0) return &pds_fb_sensor_value_get_state(h)->value;
    return NULL;
}

/* ═══════════════════════════════════════════════════════════════════════════
   fb_fan_float  (0x70)
   ═══════════════════════════════════════════════════════════════════════════ */

static esp_err_t s_fan_float_init(const void *pins, const void *s, pds_comp_handle_t *out) {
    (void)pins;
    return pds_fb_fan_float_init((const pds_fb_fan_float_settings_t *)s, out);
}
static pds_comp_status_t s_fan_float_run(pds_comp_handle_t h) {
    return pds_fb_fan_float_run(h);
}
static void s_fan_float_set_settings(pds_comp_handle_t h, const void *s) {
    pds_fb_fan_float_set_settings(h, (const pds_fb_fan_float_settings_t *)s);
}
static void s_fan_float_connect(pds_comp_handle_t h, uint8_t port, const void *src) {
    if (port == 0) pds_fb_fan_float_connect_input(h, (const float *)src);
}
static const void *s_fan_float_output(pds_comp_handle_t h, uint8_t port) {
    if (port == 0) {
        const pds_fb_fan_float_state_t *st = pds_fb_fan_float_get_state(h);
        return st ? &st->value : NULL;
    }
    return NULL;
}

#if 0   /* fan_bool (0x71) deprecated — use fan_float (0x70) */
/* ═══════════════════════════════════════════════════════════════════════════
   fb_fan_bool  (0x71)
   ═══════════════════════════════════════════════════════════════════════════ */

static esp_err_t s_fan_bool_init(const void *pins, const void *s, pds_comp_handle_t *out) {
    (void)pins;
    return pds_fb_fan_bool_init((const pds_fb_fan_bool_settings_t *)s, out);
}
static pds_comp_status_t s_fan_bool_run(pds_comp_handle_t h) {
    return pds_fb_fan_bool_run(h);
}
static void s_fan_bool_set_settings(pds_comp_handle_t h, const void *s) {
    pds_fb_fan_bool_set_settings(h, (const pds_fb_fan_bool_settings_t *)s);
}
static void s_fan_bool_connect(pds_comp_handle_t h, uint8_t port, const void *src) {
    if (port == 0) pds_fb_fan_bool_connect_input(h, (const float *)src);
}
static const void *s_fan_bool_output(pds_comp_handle_t h, uint8_t port) {
    if (port == 0) {
        const pds_fb_fan_bool_state_t *st = pds_fb_fan_bool_get_state(h);
        return st ? &st->value : NULL;
    }
    return NULL;
}
#endif  /* fan_bool deprecated */

#ifdef PDS_PERIPH_HAS_LED_ADDR
/* ═══════════════════════════════════════════════════════════════════════════
   fb_led_addr  (0x80)
   Bool signal input (port 0). Terminal block — no pipeline output.
   ═══════════════════════════════════════════════════════════════════════════ */

static esp_err_t s_led_addr_init(const void *pins, const void *s, pds_comp_handle_t *out) {
    (void)pins;
    return pds_fb_led_addr_init((const pds_fb_led_addr_settings_t *)s, out);
}
static pds_comp_status_t s_led_addr_run(pds_comp_handle_t h) {
    return pds_fb_led_addr_run(h);
}
static void s_led_addr_set_settings(pds_comp_handle_t h, const void *s) {
    pds_fb_led_addr_set_settings(h, (const pds_fb_led_addr_settings_t *)s);
}
static void s_led_addr_connect(pds_comp_handle_t h, uint8_t port, const void *src) {
    if (port == 0) pds_fb_led_addr_connect_signal(h, (const float *)src);
}
static const void *s_led_addr_output(pds_comp_handle_t h, uint8_t port) {
    (void)h; (void)port; return NULL; /* terminal block */
}
static void s_led_addr_safe_state(pds_comp_handle_t h) {
    pds_fb_led_addr_safe_state(h);
}
static void s_led_addr_destroy(pds_comp_handle_t h) {
    pds_fb_led_addr_destroy(h);
}
#endif /* PDS_PERIPH_HAS_LED_ADDR */

/* ═══════════════════════════════════════════════════════════════════════════
   fb_all_stop  (0x90)
   Bool pipeline trigger (port 0) OR physical pin → ALL-STOP / resume.
   Always runs even when engine is stopped (so it can detect release).
   ═══════════════════════════════════════════════════════════════════════════ */

static esp_err_t s_all_stop_init(const void *pins, const void *s, pds_comp_handle_t *out) {
    (void)pins;
    return pds_fb_all_stop_init((const pds_fb_all_stop_settings_t *)s, out);
}
static pds_comp_status_t s_all_stop_run(pds_comp_handle_t h) {
    return pds_fb_all_stop_run(h);
}
static void s_all_stop_set_settings(pds_comp_handle_t h, const void *s) {
    pds_fb_all_stop_set_settings(h, (const pds_fb_all_stop_settings_t *)s);
}
static void s_all_stop_connect(pds_comp_handle_t h, uint8_t port, const void *src) {
    if (port == 0) pds_fb_all_stop_connect_trigger(h, (const float *)src);
}
static const void *s_all_stop_output(pds_comp_handle_t h, uint8_t port) {
    (void)h; (void)port; return NULL; /* terminal block */
}

/* ── safe_state for output blocks ─────────────────────────────────────────── */

#ifdef PDS_PERIPH_HAS_SWITCH_OUTPUT
static void s_gpio_output_safe_state(pds_comp_handle_t h) {
    pds_fb_switch_output_force(h, false);
}
#endif /* PDS_PERIPH_HAS_SWITCH_OUTPUT */
#ifdef PDS_PERIPH_HAS_PID
static void s_pid_safe_state(pds_comp_handle_t h) {
    pds_fb_pid_reset(h);  /* reset integral so PID resumes from clean state */
}
#endif /* PDS_PERIPH_HAS_PID */
#ifdef PDS_PERIPH_HAS_PWM_OUTPUT
static void s_pwm_output_safe_state(pds_comp_handle_t h) {
    pds_fb_pwm_output_safe_state(h);
}
#endif /* PDS_PERIPH_HAS_PWM_OUTPUT */

/* ═══════════════════════════════════════════════════════════════════════════
   Registry Table
   ═══════════════════════════════════════════════════════════════════════════ */

const pds_block_type_entry_t pds_block_registry[] = {
#ifdef PDS_PERIPH_HAS_SENSOR_ANALOG
    {
        .type_id       = PDS_BLOCK_SENSOR_ANALOG,
        .pins_size     = 0,
        .settings_size = sizeof(pds_fb_sensor_analog_settings_t),
        .init          = s_sensor_analog_init,
        .run           = s_sensor_analog_run,
        .set_settings  = s_sensor_analog_set_settings,
        .connect       = s_sensor_analog_connect,
        .output_ptr    = s_sensor_analog_output,
        .safe_state    = NULL,
    },
#endif /* PDS_PERIPH_HAS_SENSOR_ANALOG */
#ifdef PDS_PERIPH_HAS_DHT22
    {
        .type_id       = PDS_BLOCK_SENSOR_DHT22_TEMP,
        .pins_size     = 0,
        .settings_size = sizeof(pds_fb_dht22_settings_t),
        .init          = s_dht22_init,
        .run           = s_dht22_run,
        .set_settings  = s_dht22_set_settings,
        .connect       = s_dht22_connect,
        .output_ptr    = s_dht22_temp_output,
        .safe_state    = NULL,
    },
    {
        .type_id       = PDS_BLOCK_SENSOR_DHT22_HUMID,
        .pins_size     = 0,
        .settings_size = sizeof(pds_fb_dht22_settings_t),
        .init          = s_dht22_init,
        .run           = s_dht22_run,
        .set_settings  = s_dht22_set_settings,
        .connect       = s_dht22_connect,
        .output_ptr    = s_dht22_humid_output,
        .safe_state    = NULL,
    },
#endif /* PDS_PERIPH_HAS_DHT22 */
#ifdef PDS_PERIPH_HAS_SENSOR_PH
    {
        .type_id       = PDS_BLOCK_SENSOR_PH,
        .pins_size     = 0,
        .settings_size = sizeof(pds_fb_sensor_ph_settings_t),
        .init          = s_sensor_ph_init,
        .run           = s_sensor_ph_run,
        .set_settings  = s_sensor_ph_set_settings,
        .connect       = s_sensor_ph_connect,
        .output_ptr    = s_sensor_ph_output,
        .safe_state    = NULL,
    },
#endif /* PDS_PERIPH_HAS_SENSOR_PH */
#ifdef PDS_PERIPH_HAS_SENSOR_EC
    {
        .type_id       = PDS_BLOCK_SENSOR_EC,
        .pins_size     = 0,
        .settings_size = sizeof(pds_fb_sensor_ec_settings_t),
        .init          = s_sensor_ec_init,
        .run           = s_sensor_ec_run,
        .set_settings  = s_sensor_ec_set_settings,
        .connect       = s_sensor_ec_connect,
        .output_ptr    = s_sensor_ec_output,
        .safe_state    = NULL,
    },
#endif /* PDS_PERIPH_HAS_SENSOR_EC */
    {
        .type_id       = PDS_BLOCK_HMI_TOGGLE,
        .pins_size     = 0,
        .settings_size = sizeof(pds_fb_hmi_toggle_settings_t),
        .init          = s_hmi_toggle_init,
        .run           = s_hmi_toggle_run,
        .set_settings  = s_hmi_toggle_set_settings,
        .connect       = s_hmi_toggle_connect,
        .output_ptr    = s_hmi_toggle_output,
        .safe_state    = NULL,
    },
    {
        .type_id       = PDS_BLOCK_HMI_MOMENTARY,
        .pins_size     = 0,
        .settings_size = sizeof(pds_fb_hmi_momentary_settings_t),
        .init          = s_hmi_momentary_init,
        .run           = s_hmi_momentary_run,
        .set_settings  = s_hmi_momentary_set_settings,
        .connect       = s_hmi_momentary_connect,
        .output_ptr    = s_hmi_momentary_output,
        .safe_state    = NULL,
    },
    {
        .type_id       = PDS_BLOCK_HMI_RUN_ROUTINE,
        .pins_size     = 0,
        .settings_size = sizeof(pds_fb_hmi_run_routine_settings_t),
        .init          = s_hmi_run_routine_init,
        .run           = s_hmi_run_routine_run,
        .set_settings  = s_hmi_run_routine_set_settings,
        .connect       = s_hmi_run_routine_connect,
        .output_ptr    = s_hmi_run_routine_output,
        .safe_state    = NULL,
    },
    {
        .type_id       = PDS_BLOCK_HMI_INITIATE,
        .pins_size     = 0,
        .settings_size = sizeof(pds_fb_hmi_initiate_settings_t),
        .init          = s_hmi_initiate_init,
        .run           = s_hmi_initiate_run,
        .set_settings  = s_hmi_initiate_set_settings,
        .connect       = s_hmi_initiate_connect,
        .output_ptr    = s_hmi_initiate_output,
        .safe_state    = NULL,
    },
    {
        .type_id       = PDS_BLOCK_DELAY,
        .pins_size     = 0,
        .settings_size = sizeof(pds_fb_delay_settings_t),
        .init          = s_delay_init,
        .run           = s_delay_run,
        .set_settings  = s_delay_set_settings,
        .connect       = s_delay_connect,
        .output_ptr    = s_delay_output,
        .safe_state    = NULL,
    },
    {
        .type_id       = PDS_BLOCK_PIPELINE_SUSPEND,
        .pins_size     = 0,
        .settings_size = sizeof(pds_fb_pipeline_suspend_settings_t),
        .init          = s_pipeline_suspend_init,
        .run           = s_pipeline_suspend_run,
        .set_settings  = s_pipeline_suspend_set_settings,
        .connect       = s_pipeline_suspend_connect,
        .output_ptr    = s_pipeline_suspend_output,
        .safe_state    = NULL,
    },
    {
        .type_id       = PDS_BLOCK_PIPELINE_RESUME,
        .pins_size     = 0,
        .settings_size = sizeof(pds_fb_pipeline_resume_settings_t),
        .init          = s_pipeline_resume_init,
        .run           = s_pipeline_resume_run,
        .set_settings  = s_pipeline_resume_set_settings,
        .connect       = s_pipeline_resume_connect,
        .output_ptr    = s_pipeline_resume_output,
        .safe_state    = NULL,
    },
    {
        .type_id       = PDS_BLOCK_TIMER_COUNTDOWN,
        .pins_size     = 0,
        .settings_size = sizeof(pds_fb_timer_countdown_settings_t),
        .init          = s_timer_countdown_init,
        .run           = s_timer_countdown_run,
        .set_settings  = s_timer_countdown_set_settings,
        .connect       = s_timer_countdown_connect,
        .output_ptr    = s_timer_countdown_output,
        .safe_state    = NULL,
    },
    {
        .type_id       = PDS_BLOCK_TIMER_COUNTUP,
        .pins_size     = 0,
        .settings_size = sizeof(pds_fb_timer_countup_settings_t),
        .init          = s_timer_countup_init,
        .run           = s_timer_countup_run,
        .set_settings  = s_timer_countup_set_settings,
        .connect       = s_timer_countup_connect,
        .output_ptr    = s_timer_countup_output,
        .safe_state    = NULL,
    },
    {
        .type_id       = PDS_BLOCK_TIMER_CYCLE,
        .pins_size     = 0,
        .settings_size = sizeof(pds_fb_timer_cycle_settings_t),
        .init          = s_timer_cycle_init,
        .run           = s_timer_cycle_run,
        .set_settings  = s_timer_cycle_set_settings,
        .connect       = s_timer_cycle_connect,
        .output_ptr    = s_timer_cycle_output,
        .safe_state    = NULL,
    },
#ifdef PDS_PERIPH_HAS_PID
    {
        .type_id       = PDS_BLOCK_PID,
        .pins_size     = 0,
        .settings_size = sizeof(pds_fb_pid_settings_t),
        .init          = s_pid_init,
        .run           = s_pid_run,
        .set_settings  = s_pid_set_settings,
        .connect       = s_pid_connect,
        .output_ptr    = s_pid_output,
        .safe_state    = s_pid_safe_state,
    },
#endif /* PDS_PERIPH_HAS_PID */
#ifdef PDS_PERIPH_HAS_PWM_OUTPUT
    {
        .type_id       = PDS_BLOCK_PWM_OUTPUT,
        .pins_size     = 0,
        .settings_size = sizeof(pds_fb_pwm_output_settings_t),
        .init          = s_pwm_output_init,
        .run           = s_pwm_output_run,
        .set_settings  = s_pwm_output_set_settings,
        .connect       = s_pwm_output_connect,
        .output_ptr    = s_pwm_output_output,
        .safe_state    = s_pwm_output_safe_state,
    },
#endif /* PDS_PERIPH_HAS_PWM_OUTPUT */
#ifdef PDS_PERIPH_HAS_GPIO_INPUT
    {
        .type_id       = PDS_BLOCK_GPIO_INPUT,
        .pins_size     = 0,
        .settings_size = sizeof(pds_fb_gpio_input_settings_t),
        .init          = s_gpio_input_init,
        .run           = s_gpio_input_run,
        .set_settings  = s_gpio_input_set_settings,
        .connect       = s_gpio_input_connect,
        .output_ptr    = s_gpio_input_output,
        .safe_state    = NULL,
    },
#endif /* PDS_PERIPH_HAS_GPIO_INPUT */
#ifdef PDS_PERIPH_HAS_SWITCH_OUTPUT
    {
        .type_id       = PDS_BLOCK_GPIO_OUTPUT,
        .pins_size     = 0,
        .settings_size = sizeof(pds_fb_switch_output_settings_t),
        .init          = s_gpio_output_init,
        .run           = s_gpio_output_run,
        .set_settings  = s_gpio_output_set_settings,
        .connect       = s_gpio_output_connect,
        .output_ptr    = s_gpio_output_output,
        .safe_state    = s_gpio_output_safe_state,
    },
#endif /* PDS_PERIPH_HAS_SWITCH_OUTPUT */
#ifdef PDS_PERIPH_HAS_GPIO_VALUE
    {
        .type_id       = PDS_BLOCK_GPIO_VALUE,
        .pins_size     = 0,
        .settings_size = sizeof(pds_fb_gpio_value_settings_t),
        .init          = s_gpio_value_init,
        .run           = s_gpio_value_run,
        .set_settings  = s_gpio_value_set_settings,
        .connect       = s_gpio_value_connect,
        .output_ptr    = s_gpio_value_output,
        .safe_state    = NULL,
    },
#endif /* PDS_PERIPH_HAS_GPIO_VALUE */
    {
        .type_id       = PDS_BLOCK_LIMIT_HIGH,
        .pins_size     = 0,
        .settings_size = sizeof(pds_fb_limit_analog_settings_t),
        .init          = s_limit_analog_init,
        .run           = s_limit_analog_run,
        .set_settings  = s_limit_analog_set_settings,
        .connect       = s_limit_analog_connect,
        .output_ptr    = s_limit_analog_output,
        .safe_state    = NULL,
    },
    {
        .type_id       = PDS_BLOCK_LIMIT_LOW,
        .pins_size     = 0,
        .settings_size = sizeof(pds_fb_limit_analog_settings_t),
        .init          = s_limit_analog_init,
        .run           = s_limit_analog_run,
        .set_settings  = s_limit_analog_set_settings,
        .connect       = s_limit_analog_connect,
        .output_ptr    = s_limit_analog_output,
        .safe_state    = NULL,
    },
    {
        .type_id       = PDS_BLOCK_REF,
        .pins_size     = 1,  /* source_block_idx byte in Layer 2 */
        .settings_size = 0,
        .init          = s_fb_ref_init,
        .run           = s_fb_ref_run,
        .set_settings  = s_fb_ref_set_settings,
        .connect       = s_fb_ref_connect,
        .output_ptr    = s_fb_ref_output,
        .safe_state    = NULL,
    },
    {
        .type_id       = PDS_BLOCK_SENSOR_VALUE,
        .pins_size     = 0,
        .settings_size = sizeof(pds_fb_sensor_value_settings_t),
        .init          = s_sensor_value_init,
        .run           = s_sensor_value_run,
        .set_settings  = s_sensor_value_set_settings,
        .connect       = s_sensor_value_connect,
        .output_ptr    = s_sensor_value_output,
        .safe_state    = NULL,
    },
    /* ──────────────────────────────────────────────────────────────────────
       fb_fan_float  (0x70)
       Distributes a float input to N downstream blocks via shared pointer.
       connect: port 0 = input source
       output:  port 0 = &state.value  (downstream blocks read from here)
       ────────────────────────────────────────────────────────────────────── */
    {
        .type_id       = PDS_BLOCK_FAN_FLOAT,
        .pins_size     = 0,
        .settings_size = sizeof(pds_fb_fan_float_settings_t),
        .init          = s_fan_float_init,
        .run           = s_fan_float_run,
        .set_settings  = s_fan_float_set_settings,
        .connect       = s_fan_float_connect,
        .output_ptr    = s_fan_float_output,
        .safe_state    = NULL,
    },
#if 0   /* fan_bool (0x71) deprecated — use fan_float (0x70) */
    /* ──────────────────────────────────────────────────────────────────────
       fb_fan_bool  (0x71)
       ────────────────────────────────────────────────────────────────────── */
    {
        .type_id       = PDS_BLOCK_FAN_BOOL,
        .pins_size     = 0,
        .settings_size = sizeof(pds_fb_fan_bool_settings_t),
        .init          = s_fan_bool_init,
        .run           = s_fan_bool_run,
        .set_settings  = s_fan_bool_set_settings,
        .connect       = s_fan_bool_connect,
        .output_ptr    = s_fan_bool_output,
        .safe_state    = NULL,
    },
#endif  /* fan_bool deprecated */
#ifdef PDS_PERIPH_HAS_LED_ADDR
    /* ──────────────────────────────────────────────────────────────────────────
       fb_led_addr  (0x80)
       ────────────────────────────────────────────────────────────────────────── */
    {
        .type_id       = PDS_BLOCK_LED_ADDR,
        .pins_size     = 0,
        .settings_size = sizeof(pds_fb_led_addr_settings_t),
        .init          = s_led_addr_init,
        .run           = s_led_addr_run,
        .set_settings  = s_led_addr_set_settings,
        .connect       = s_led_addr_connect,
        .output_ptr    = s_led_addr_output,
        .safe_state    = s_led_addr_safe_state,
        .destroy       = s_led_addr_destroy,
    },
#endif /* PDS_PERIPH_HAS_LED_ADDR */
    /* ──────────────────────────────────────────────────────────────────────────
       fb_all_stop  (0x90)
       Always runs even when engine is stopped (engine tick() special-cases this
       type_id so it can detect trigger release and auto-resume).
       ────────────────────────────────────────────────────────────────────────── */
    {
        .type_id       = PDS_BLOCK_ALL_STOP,
        .pins_size     = 0,
        .settings_size = sizeof(pds_fb_all_stop_settings_t),
        .init          = s_all_stop_init,
        .run           = s_all_stop_run,
        .set_settings  = s_all_stop_set_settings,
        .connect       = s_all_stop_connect,
        .output_ptr    = s_all_stop_output,
        .safe_state    = NULL,  /* all_stop itself has no hardware output */
    },
#ifdef PDS_PERIPH_HAS_ENCODER_QUADRATURE
    /* ─────────────────────────────────────────────────────────────────────
       fb_encoder_position  (0xA1)  /  fb_encoder_velocity  (0xA2)
       ───────────────────────────────────────────────────────────────────── */
    {
        .type_id       = PDS_BLOCK_ENCODER_POSITION,
        .pins_size     = 0,
        .settings_size = sizeof(pds_fb_encoder_quadrature_settings_t),
        .init          = s_encoder_quadrature_init,
        .run           = s_encoder_quadrature_run,
        .set_settings  = s_encoder_quadrature_set_settings,
        .connect       = s_encoder_quadrature_connect,
        .output_ptr    = s_encoder_pos_output,
        .safe_state    = NULL,
    },
    {
        .type_id       = PDS_BLOCK_ENCODER_VELOCITY,
        .pins_size     = 0,
        .settings_size = sizeof(pds_fb_encoder_quadrature_settings_t),
        .init          = s_encoder_quadrature_init,
        .run           = s_encoder_quadrature_run,
        .set_settings  = s_encoder_quadrature_set_settings,
        .connect       = s_encoder_quadrature_connect,
        .output_ptr    = s_encoder_vel_output,
        .safe_state    = NULL,
    },
#endif /* PDS_PERIPH_HAS_ENCODER_QUADRATURE */
#ifdef PDS_PERIPH_HAS_ENCODER_MAPPED
    /* ─────────────────────────────────────────────────────────────────────
       fb_encoder_mapped  (0xA3)
       ───────────────────────────────────────────────────────────────────── */
    {
        .type_id       = PDS_BLOCK_ENCODER_MAPPED,
        .pins_size     = 0,
        .settings_size = sizeof(pds_fb_encoder_mapped_settings_t),
        .init          = s_encoder_mapped_init,
        .run           = s_encoder_mapped_run,
        .set_settings  = s_encoder_mapped_set_settings,
        .connect       = s_encoder_mapped_connect,
        .output_ptr    = s_encoder_mapped_output,
        .safe_state    = NULL,
    },
#endif /* PDS_PERIPH_HAS_ENCODER_MAPPED */
#ifdef PDS_PERIPH_HAS_HX711
    /* ─────────────────────────────────────────────────────────────────────
       fb_sensor_hx711  (0xA0)
       ───────────────────────────────────────────────────────────────────── */
    {
        .type_id       = PDS_BLOCK_SENSOR_HX711,
        .pins_size     = 0,
        .settings_size = sizeof(pds_fb_hx711_settings_t),
        .init          = s_hx711_init,
        .run           = s_hx711_run,
        .set_settings  = s_hx711_set_settings,
        .connect       = s_hx711_connect,
        .output_ptr    = s_hx711_output,
        .safe_state    = NULL,
    },
#endif /* PDS_PERIPH_HAS_HX711 */
    /* ─────────────────────────────────────────────────────────────────────
       Stepper drivers — velocity (0x60–0x64) and position (0x65–0x69)
       ───────────────────────────────────────────────────────────────────── */
#ifdef PDS_PERIPH_HAS_STEPPER_A4988
    { .type_id=PDS_BLOCK_STEPPER_A4988_VELOCITY, .pins_size=0,
      .settings_size=sizeof(pds_fb_stepper_a4988_settings_t),
      .init=s_stepper_a4988_vel_init, .run=s_stepper_a4988_vel_run,
      .set_settings=s_stepper_a4988_vel_set_settings, .connect=s_stepper_a4988_vel_connect,
      .output_ptr=s_stepper_a4988_vel_output, .safe_state=s_stepper_a4988_vel_safe },
    { .type_id=PDS_BLOCK_STEPPER_A4988_POSITION, .pins_size=0,
      .settings_size=sizeof(pds_fb_stepper_a4988_position_settings_t),
      .init=s_stepper_a4988_pos_init, .run=s_stepper_a4988_pos_run,
      .set_settings=s_stepper_a4988_pos_set_settings, .connect=s_stepper_a4988_pos_connect,
      .output_ptr=s_stepper_a4988_pos_output, .safe_state=s_stepper_a4988_pos_safe },
#endif
#ifdef PDS_PERIPH_HAS_STEPPER_DRV8825
    { .type_id=PDS_BLOCK_STEPPER_DRV8825_VELOCITY, .pins_size=0,
      .settings_size=sizeof(pds_fb_stepper_drv8825_settings_t),
      .init=s_stepper_drv8825_vel_init, .run=s_stepper_drv8825_vel_run,
      .set_settings=s_stepper_drv8825_vel_set_settings, .connect=s_stepper_drv8825_vel_connect,
      .output_ptr=s_stepper_drv8825_vel_output, .safe_state=s_stepper_drv8825_vel_safe },
    { .type_id=PDS_BLOCK_STEPPER_DRV8825_POSITION, .pins_size=0,
      .settings_size=sizeof(pds_fb_stepper_drv8825_position_settings_t),
      .init=s_stepper_drv8825_pos_init, .run=s_stepper_drv8825_pos_run,
      .set_settings=s_stepper_drv8825_pos_set_settings, .connect=s_stepper_drv8825_pos_connect,
      .output_ptr=s_stepper_drv8825_pos_output, .safe_state=s_stepper_drv8825_pos_safe },
#endif
#ifdef PDS_PERIPH_HAS_STEPPER_TB6600
    { .type_id=PDS_BLOCK_STEPPER_TB6600_VELOCITY, .pins_size=0,
      .settings_size=sizeof(pds_fb_stepper_tb6600_settings_t),
      .init=s_stepper_tb6600_vel_init, .run=s_stepper_tb6600_vel_run,
      .set_settings=s_stepper_tb6600_vel_set_settings, .connect=s_stepper_tb6600_vel_connect,
      .output_ptr=s_stepper_tb6600_vel_output, .safe_state=s_stepper_tb6600_vel_safe },
    { .type_id=PDS_BLOCK_STEPPER_TB6600_POSITION, .pins_size=0,
      .settings_size=sizeof(pds_fb_stepper_tb6600_position_settings_t),
      .init=s_stepper_tb6600_pos_init, .run=s_stepper_tb6600_pos_run,
      .set_settings=s_stepper_tb6600_pos_set_settings, .connect=s_stepper_tb6600_pos_connect,
      .output_ptr=s_stepper_tb6600_pos_output, .safe_state=s_stepper_tb6600_pos_safe },
#endif
#ifdef PDS_PERIPH_HAS_STEPPER_TMC2209
    { .type_id=PDS_BLOCK_STEPPER_TMC2209_VELOCITY, .pins_size=0,
      .settings_size=sizeof(pds_fb_stepper_tmc2209_settings_t),
      .init=s_stepper_tmc2209_vel_init, .run=s_stepper_tmc2209_vel_run,
      .set_settings=s_stepper_tmc2209_vel_set_settings, .connect=s_stepper_tmc2209_vel_connect,
      .output_ptr=s_stepper_tmc2209_vel_output, .safe_state=s_stepper_tmc2209_vel_safe },
    { .type_id=PDS_BLOCK_STEPPER_TMC2209_POSITION, .pins_size=0,
      .settings_size=sizeof(pds_fb_stepper_tmc2209_position_settings_t),
      .init=s_stepper_tmc2209_pos_init, .run=s_stepper_tmc2209_pos_run,
      .set_settings=s_stepper_tmc2209_pos_set_settings, .connect=s_stepper_tmc2209_pos_connect,
      .output_ptr=s_stepper_tmc2209_pos_output, .safe_state=s_stepper_tmc2209_pos_safe },
#endif
#ifdef PDS_PERIPH_HAS_STEPPER_TMC2208
    { .type_id=PDS_BLOCK_STEPPER_TMC2208_VELOCITY, .pins_size=0,
      .settings_size=sizeof(pds_fb_stepper_tmc2208_settings_t),
      .init=s_stepper_tmc2208_vel_init, .run=s_stepper_tmc2208_vel_run,
      .set_settings=s_stepper_tmc2208_vel_set_settings, .connect=s_stepper_tmc2208_vel_connect,
      .output_ptr=s_stepper_tmc2208_vel_output, .safe_state=s_stepper_tmc2208_vel_safe },
    { .type_id=PDS_BLOCK_STEPPER_TMC2208_POSITION, .pins_size=0,
      .settings_size=sizeof(pds_fb_stepper_tmc2208_position_settings_t),
      .init=s_stepper_tmc2208_pos_init, .run=s_stepper_tmc2208_pos_run,
      .set_settings=s_stepper_tmc2208_pos_set_settings, .connect=s_stepper_tmc2208_pos_connect,
      .output_ptr=s_stepper_tmc2208_pos_output, .safe_state=s_stepper_tmc2208_pos_safe },
#endif
};
const uint8_t pds_block_registry_count =
    (uint8_t)(sizeof(pds_block_registry) / sizeof(pds_block_registry[0]));

const pds_block_type_entry_t *pds_block_registry_lookup(uint8_t type_id)
{
    for (uint8_t i = 0; i < pds_block_registry_count; i++) {
        if (pds_block_registry[i].type_id == type_id) {
            return &pds_block_registry[i];
        }
    }
    return NULL;
}
