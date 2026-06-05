/**
 * PDS Function Block — Pipeline Suspend (pipeline_suspend)
 *
 * Edge-triggered block that suspends one named target pipeline on a
 * rising edge of its input signal. The target stays suspended until a
 * separate pipeline_resume block fires for the same target.
 *
 * Pipeline role: pass-through block.
 *   Input  port 0: trigger_f — float signal from upstream
 *   Output port 0: trigger_f — same float value, passed through unmodified.
 *                   Chain multiple pipeline_suspend blocks in series to
 *                   suspend multiple pipelines from one upstream signal.
 *
 * Behaviour:
 *   Rising edge (< 0.5 → ≥ 0.5): calls engine suspend on target pipeline.
 *                                  Target's safe_state is called; its tick
 *                                  is suppressed until resumed.
 *   Falling edge / steady state:  no action — target stays suspended.
 *
 * IMPORTANT: Do NOT set pipeline_index to the index of the pipeline that
 * contains this block — that would cause immediate self-suspension.
 *
 * PDS_BLOCK_PIPELINE_SUSPEND = 0x07
 *
 * HAL dependencies: none
 */

#ifndef PDS_FB_PIPELINE_SUSPEND_H
#define PDS_FB_PIPELINE_SUSPEND_H

#include "pds_component_base.h"

/* ── Settings ── */
typedef struct {
    uint8_t pipeline_index; /**< 0-based index of the pipeline to suspend.
                             *   Resolved from pipeline name at role-encode time. */
    bool    enabled;        /**< false = rising edge is a no-op */
} pds_fb_pipeline_suspend_settings_t;

/* ── Runtime State ── */
typedef struct {
    float trigger_f;    /**< Pass-through of the input signal. */
} pds_fb_pipeline_suspend_state_t;

/* ── API ── */
esp_err_t pds_fb_pipeline_suspend_init(
    const pds_fb_pipeline_suspend_settings_t *settings,
    pds_comp_handle_t *out_handle);

pds_comp_status_t pds_fb_pipeline_suspend_run(pds_comp_handle_t handle);

esp_err_t pds_fb_pipeline_suspend_connect_trigger(
    pds_comp_handle_t handle,
    const float *trigger_ptr);

const pds_fb_pipeline_suspend_state_t *pds_fb_pipeline_suspend_get_state(
    pds_comp_handle_t handle);

esp_err_t pds_fb_pipeline_suspend_get_settings(
    pds_comp_handle_t handle,
    pds_fb_pipeline_suspend_settings_t *out);

esp_err_t pds_fb_pipeline_suspend_set_settings(
    pds_comp_handle_t handle,
    const pds_fb_pipeline_suspend_settings_t *settings);

#endif /* PDS_FB_PIPELINE_SUSPEND_H */
