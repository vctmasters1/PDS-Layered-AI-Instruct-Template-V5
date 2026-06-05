/**
 * PDS Function Block — Pipeline Resume (pipeline_resume)
 *
 * Edge-triggered block that resumes one named target pipeline on a
 * rising edge of its input signal. Counterpart to pipeline_suspend.
 *
 * Pipeline role: pass-through block.
 *   Input  port 0: trigger_f — float signal from upstream
 *   Output port 0: trigger_f — same float value, passed through unmodified.
 *                   Chain multiple pipeline_resume blocks in series to
 *                   resume multiple pipelines from one upstream signal.
 *
 * Behaviour:
 *   Rising edge (< 0.5 → ≥ 0.5): calls engine resume on target pipeline.
 *                                  Target's next tick runs normally.
 *   Falling edge / steady state:  no action.
 *
 * PDS_BLOCK_PIPELINE_RESUME = 0x08
 *
 * HAL dependencies: none
 */

#ifndef PDS_FB_PIPELINE_RESUME_H
#define PDS_FB_PIPELINE_RESUME_H

#include "pds_component_base.h"

/* ── Settings ── */
typedef struct {
    uint8_t pipeline_index; /**< 0-based index of the pipeline to resume.
                             *   Resolved from pipeline name at role-encode time. */
    bool    enabled;        /**< false = rising edge is a no-op */
} pds_fb_pipeline_resume_settings_t;

/* ── Runtime State ── */
typedef struct {
    float trigger_f;    /**< Pass-through of the input signal. */
} pds_fb_pipeline_resume_state_t;

/* ── API ── */
esp_err_t pds_fb_pipeline_resume_init(
    const pds_fb_pipeline_resume_settings_t *settings,
    pds_comp_handle_t *out_handle);

pds_comp_status_t pds_fb_pipeline_resume_run(pds_comp_handle_t handle);

esp_err_t pds_fb_pipeline_resume_connect_trigger(
    pds_comp_handle_t handle,
    const float *trigger_ptr);

const pds_fb_pipeline_resume_state_t *pds_fb_pipeline_resume_get_state(
    pds_comp_handle_t handle);

esp_err_t pds_fb_pipeline_resume_get_settings(
    pds_comp_handle_t handle,
    pds_fb_pipeline_resume_settings_t *out);

esp_err_t pds_fb_pipeline_resume_set_settings(
    pds_comp_handle_t handle,
    const pds_fb_pipeline_resume_settings_t *settings);

#endif /* PDS_FB_PIPELINE_RESUME_H */
