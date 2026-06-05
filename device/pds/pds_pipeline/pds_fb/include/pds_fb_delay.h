/**
 * PDS Function Block — Delay (delay)
 *
 * One-shot rising-edge-triggered delay timer.
 * On a rising edge at the input: starts a timer. After delay_ms elapses,
 * output goes HIGH for exactly one tick, then returns to 0.
 *
 * Use case: "stall for X ms before resuming next block" in a routine pipeline.
 *
 * Pipeline role: pass-through timer — input triggers delay, output fires once.
 * Input port  0: trigger float (>= 0.5 = active)
 * Output port 0: state.active_f (100.0f for one tick after delay expires, else 0.0f)
 *
 * L3 struct: <I?xxx = 8 bytes (uint32 delay_ms, bool enabled, 3 pad bytes)
 *
 * PDS_BLOCK_DELAY = 0x0B
 */

#ifndef PDS_FB_DELAY_H
#define PDS_FB_DELAY_H

#include "pds_component_base.h"
#include <stdbool.h>
#include <stdint.h>

/* ── Settings (Layer 3) ── */
typedef struct {
    uint32_t delay_ms;   /**< How long to wait after rising edge before firing */
    bool     enabled;    /**< false = output forced to 0.0f, no timing */
    uint8_t  _pad[3];    /**< Padding to match <I?xxx packer layout */
} pds_fb_delay_settings_t;

/* ── Runtime State ── */
typedef struct {
    float active_f;  /**< 100.0f for one tick when delay expires, else 0.0f */
} pds_fb_delay_state_t;

/* ── API ── */
esp_err_t pds_fb_delay_init(
    const pds_fb_delay_settings_t *settings,
    pds_comp_handle_t *out_handle);

pds_comp_status_t pds_fb_delay_run(pds_comp_handle_t handle);

/** Wire the upstream trigger input. Called by the pipeline engine. */
void pds_fb_delay_connect_input(pds_comp_handle_t handle, const float *input_ptr);

const pds_fb_delay_state_t *pds_fb_delay_get_state(pds_comp_handle_t handle);

esp_err_t pds_fb_delay_get_settings(pds_comp_handle_t handle, pds_fb_delay_settings_t *out);
esp_err_t pds_fb_delay_set_settings(pds_comp_handle_t handle, const pds_fb_delay_settings_t *settings);

#endif /* PDS_FB_DELAY_H */
