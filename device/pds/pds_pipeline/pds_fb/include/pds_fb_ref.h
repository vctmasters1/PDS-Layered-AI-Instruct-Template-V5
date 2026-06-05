/**
 * PDS Function Block — Signal Reference (fb_ref)
 *
 * Zero-logic passthrough for fan-out. Holds a pointer to a prior block's
 * float output and re-exposes it as its own output, allowing a single source
 * to drive multiple downstream blocks in a linear pipeline.
 *
 * fb_ref is NEVER manually authored. The host tool (role editor / serializer)
 * inserts ref blocks automatically when a block has more than one consumer.
 * On the device, fb_ref has no run() work — it is init-only.
 *
 * Layer 2 (pins_t) for fb_ref:
 *   uint8_t source_block_idx   — index into the current pipeline's block array
 *
 * Layer 3 (settings_t): none (settings_size = 0)
 *
 * Pipeline type ID: 0x50
 */

#ifndef PDS_FB_REF_H
#define PDS_FB_REF_H

#include "pds_component_base.h"

/* ── Pins (Layer 2) ── */
typedef struct {
    uint8_t source_block_idx;   /**< Index of the upstream block whose output to mirror */
} pds_fb_ref_pins_t;

/* ── Runtime State ── */
typedef struct {
    const void *output;         /**< Opaque pointer to upstream block's primary output */
} pds_fb_ref_state_t;

/* ── Handle ── */
typedef struct {
    pds_fb_ref_pins_t  pins;
    pds_fb_ref_state_t state;
} pds_fb_ref_t;

/**
 * @brief Allocate and initialise an fb_ref block (heap).
 *        The source output pointer is wired separately by the pipeline engine
 *        via pds_fb_ref_set_source() after all blocks are initialised.
 *
 * @param out_handle  Receives the allocated handle.
 * @return ESP_OK, or ESP_ERR_NO_MEM.
 */
esp_err_t pds_fb_ref_init(pds_comp_handle_t *out_handle);

/**
 * @brief Set the upstream output pointer this ref block re-exposes.
 *        Called by the pipeline engine during the wiring pass.
 *
 * @param handle        fb_ref handle.
 * @param source_output Pointer to upstream block's primary output field.
 */
void pds_fb_ref_set_source(pds_comp_handle_t handle, const void *source_output);

/**
 * @brief No-op tick. fb_ref has no runtime logic.
 *        Present so the pipeline engine can call run() uniformly on all blocks.
 */
pds_comp_status_t pds_fb_ref_run(pds_comp_handle_t handle);

#endif /* PDS_FB_REF_H */
