/**
 * PDS Pipeline Engine
 *
 * Loads the three binary blobs from NVS (passed in by the caller),
 * builds the pipeline graph, and provides a tick function for the main loop.
 *
 * Usage:
 *   1. Read all three blobs from NVS.
 *   2. Call pds_pipeline_engine_load() once.
 *   3. Call pds_pipeline_engine_tick() every update_rate_ms from main loop.
 *   4. To apply fresh user settings: call pds_pipeline_engine_apply_settings()
 *      with a new Layer 3 blob (same pipeline_version — topology unchanged).
 *   5. To change topology: call pds_pipeline_engine_load() again with all
 *      three new blobs (pipeline_version must be incremented in all three).
 */

#ifndef PDS_PIPELINE_H
#define PDS_PIPELINE_H

#include "pds_component_base.h"
#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

#define PDS_MAX_PIPELINES           16
#define PDS_MAX_BLOCKS_PER_PIPELINE 16
#define PDS_PIPELINE_FORMAT_VERSION 0x01u

/**
 * @brief Load all three binary layers and build the pipeline graph.
 *
 * Validates format_version and pipeline_version consistency across all three
 * blobs. Any currently loaded pipelines are torn down first.
 *
 * @param l1      Layer 1 blob (pipeline byte stream from NVS key "pipeline")
 * @param l1_len  Length of l1 in bytes
 * @param l2      Layer 2 blob (hw vars from NVS key "hw_vars")
 * @param l2_len  Length of l2 in bytes
 * @param l3      Layer 3 blob (user settings from NVS key "settings")
 * @param l3_len  Length of l3 in bytes (must be >= 9 for global header)
 * @return ESP_OK on success
 *         ESP_ERR_INVALID_VERSION  if format_version != PDS_PIPELINE_FORMAT_VERSION
 *         ESP_ERR_INVALID_STATE    if pipeline_version mismatches between layers
 *         ESP_ERR_NOT_FOUND        if a block type ID is not in the registry
 *         ESP_ERR_NO_MEM           if heap allocation fails
 */
esp_err_t pds_pipeline_engine_load(
    const uint8_t *l1, size_t l1_len,
    const uint8_t *l2, size_t l2_len,
    const uint8_t *l3, size_t l3_len);

/**
 * @brief Tick all pipelines once.
 *
 * Calls run() on every block in every pipeline in sequential order.
 * Call this from the main loop at the rate returned by
 * pds_pipeline_engine_get_update_rate_ms().
 * No-op if no pipeline is loaded.
 */
void pds_pipeline_engine_tick(void);

/**
 * @brief Apply fresh Layer 3 settings without full reload.
 *
 * Safe to call when only tunable settings have changed and the pipeline
 * topology (Layer 1) has not changed. The blob's pipeline_version must
 * match the currently loaded pipeline.
 *
 * @return ESP_ERR_INVALID_STATE if not loaded or pipeline_version mismatches.
 */
esp_err_t pds_pipeline_engine_apply_settings(const uint8_t *l3, size_t l3_len);

/** @return Pipeline tick rate in ms from the last loaded Layer 3 global header. */
uint32_t pds_pipeline_engine_get_update_rate_ms(void);

/** @return true if a valid pipeline is loaded and ready to tick. */
bool pds_pipeline_engine_is_loaded(void);

/**
 * @brief Suspend a single pipeline by index, calling safe_state on all its blocks.
 *
 * The suspended pipeline's tick is skipped until resume_pipeline() is called.
 * Idempotent — safe to call if already suspended.
 * Used by pipeline_gate blocks to surgically suspend target pipelines while
 * leaving all others running normally.
 */
void pds_pipeline_engine_suspend_pipeline(uint8_t idx);

/**
 * @brief Resume a previously suspended pipeline.
 *
 * The next engine tick will run the pipeline normally again.
 * No-op if the pipeline was not suspended.
 */
void pds_pipeline_engine_resume_pipeline(uint8_t idx);

/**
 * @brief Immediately stop all hardware outputs and suppress pipeline ticks.
 *
 * Calls safe_state() on every block that has one, then sets the engine's
 * stopped flag. Ticks are suppressed for all blocks except ALL-STOP blocks,
 * which continue running so they can detect trigger release and auto-resume.
 *
 * Safe to call from any context (ISR-safe: only sets a flag and iterates
 * the already-allocated block list; no malloc/free).
 */
void pds_pipeline_engine_all_stop(void);

/**
 * @brief Resume normal pipeline execution after an ALL-STOP.
 *
 * Clears the stopped flag. The next tick will run all blocks normally.
 * Called automatically by the all_stop block when its trigger clears.
 */
void pds_pipeline_engine_resume(void);

/** @return true if the engine is currently in the ALL-STOP state. */
bool pds_pipeline_engine_is_stopped(void);

/**
 * @brief Set the runtime value of an hmi_toggle block without re-encoding L3.
 *
 * Updates settings.value in RAM only — takes effect on the next pipeline tick.
 * Does NOT write to NVS; the block resets to its L3 default on reboot.
 *
 * @return ESP_ERR_INVALID_STATE  if the engine is not loaded.
 * @return ESP_ERR_INVALID_ARG   if indices are out of range or the addressed
 *                               block is not an hmi_toggle (type 0x04).
 */
esp_err_t pds_pipeline_engine_hmi_set_toggle(uint8_t pipeline_idx, uint8_t block_idx, bool value);

/**
 * @brief Fire the pulse on an hmi_momentary block.
 *
 * Calls pds_fb_hmi_momentary_trigger() on the addressed block.
 * The output stays active for the block's configured pulse_ms then
 * auto-resets — no NVS write, no L3 change.
 *
 * @return ESP_ERR_INVALID_STATE  if the engine is not loaded.
 * @return ESP_ERR_INVALID_ARG   if indices are out of range or the addressed
 *                               block is not an hmi_momentary (type 0x05).
 */
esp_err_t pds_pipeline_engine_hmi_trigger_momentary(uint8_t pipeline_idx, uint8_t block_idx);

/**
 * @brief Patch a float setting in a running block (called by encoder_mapped control_point
 *        or a server-side settings-report push).
 *
 * Currently supports PID (0x21) setpoint (field_idx = 0).
 * Writes the new value directly into the block's settings struct in RAM.
 *
 * @return ESP_ERR_INVALID_STATE  if the engine is not loaded.
 * @return ESP_ERR_INVALID_ARG   if indices are out of range or the block/field
 *                               combination is not supported.
 */
esp_err_t pds_pipeline_engine_patch_float_field(uint8_t pipeline_idx, uint8_t block_idx,
                                                 uint8_t field_idx, float value);

/**
 * Poll all encoder_mapped blocks for settled control-point values and invoke
 * callback for each pending save.
 *
 * A value is "settled" when it has not changed for ≥10 s and the block is
 * wired to a control-point target.  If callback returns ESP_OK the block's
 * settle state is acknowledged (cleared until the next change).
 *
 * @param callback  Called as callback(pipeline_idx, block_idx, field_idx, value, user_ctx)
 * @param user_ctx  Passed through to callback unchanged
 */
esp_err_t pds_pipeline_engine_poll_cp_settle(
    esp_err_t (*callback)(uint8_t pl, uint8_t blk, uint8_t field, float value, void *ctx),
    void *user_ctx);

#endif /* PDS_PIPELINE_H */
