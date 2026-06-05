#include "pds_pipeline.h"
#include "pds_block_registry.h"
#include "pds_fb_hmi_toggle.h"
#include "pds_fb_hmi_momentary.h"
#include "pds_fb_sensor_value.h"
#ifdef PDS_PERIPH_HAS_GPIO_VALUE
#include "pds_fb_gpio_value.h"
#endif
#ifdef PDS_PERIPH_HAS_GPIO_INPUT
#include "pds_fb_gpio_input.h"
#endif
#ifdef PDS_PERIPH_HAS_PID
#include "pds_fb_pid.h"
#endif
#ifdef PDS_PERIPH_HAS_ENCODER_MAPPED
#include "pds_fb_encoder_mapped.h"
#endif
#include "pds_tel_sink.h"
#include <string.h>
#include <stdlib.h>
#include "esp_log.h"

static const char *TAG = "pds_pipeline";

/* ── Internal types ───────────────────────────────────────────────────────── */

typedef struct {
    uint8_t           type_ids[PDS_MAX_BLOCKS_PER_PIPELINE];
    pds_comp_handle_t handles[PDS_MAX_BLOCKS_PER_PIPELINE];
    uint8_t           block_count;
    bool              suspended;  /**< Set by pipeline_gate; safe_state called on entry */
} pds_pipeline_instance_t;

typedef struct {
    pds_pipeline_instance_t pipelines[PDS_MAX_PIPELINES];
    uint8_t                 pipeline_count;
    uint8_t                 pipeline_version;
    uint32_t                update_rate_ms;
    bool                    loaded;
    bool                    stopped;  /**< Set by all_stop(); cleared by resume() */
} pds_pipeline_engine_t;

static pds_pipeline_engine_t s_engine;

/* ── Global sensor slot registry ─────────────────────────────────────────── */
/* Populated during pipeline build when sensor blocks (0x01-0x03) are init'd.
 * sensor_value (0x51) blocks are wired to these slots in the post-build pass. */
#define PDS_MAX_SENSOR_SLOTS 32
static const float *s_sensor_reg[PDS_MAX_SENSOR_SLOTS];
static uint8_t      s_sensor_reg_count;

/* ── Teardown ─────────────────────────────────────────────────────────────── */

static void engine_teardown(void)
{
    for (int p = 0; p < s_engine.pipeline_count; p++) {
        for (int i = 0; i < s_engine.pipelines[p].block_count; i++) {
            const pds_block_type_entry_t *e =
                pds_block_registry_lookup(s_engine.pipelines[p].type_ids[i]);
            if (e && e->destroy) {
                e->destroy(s_engine.pipelines[p].handles[i]);
            }
            free(s_engine.pipelines[p].handles[i]);
            s_engine.pipelines[p].handles[i] = NULL;
        }
    }
    memset(&s_engine, 0, sizeof(s_engine));
    memset(s_sensor_reg, 0, sizeof(s_sensor_reg));
    s_sensor_reg_count = 0;
    pds_tel_sink_clear();   /* drop all block state pointers */
}

/* ── Build one pipeline ───────────────────────────────────────────────────── */

/*
 * hw_ptr and set_ptr advance continuously across multiple pipeline_build()
 * calls — they are NOT reset per pipeline. This preserves the flat packed
 * layout of Layers 2 and 3 across all pipelines.
 */
static esp_err_t pipeline_build(
    const uint8_t *type_ids, int n,
    const uint8_t **hw_ptr,
    const uint8_t **set_ptr,
    pds_pipeline_instance_t *out)
{
    pds_comp_handle_t handles[PDS_MAX_BLOCKS_PER_PIPELINE] = {0};
    uint8_t ref_source[PDS_MAX_BLOCKS_PER_PIPELINE] = {0};

    /* Pass 1 — allocate and initialise each block */
    for (int i = 0; i < n; i++) {
        const pds_block_type_entry_t *e = pds_block_registry_lookup(type_ids[i]);
        if (!e) {
            ESP_LOGE(TAG, "Unknown block type 0x%02x at position %d", type_ids[i], i);
            return ESP_ERR_NOT_FOUND;
        }

        const void *pins = NULL;
        if (e->pins_size > 0) {
            pins = *hw_ptr;
            /* Record fb_ref source index for use in the wiring pass */
            if (type_ids[i] == (uint8_t)PDS_BLOCK_REF) {
                ref_source[i] = (*hw_ptr)[0];
            }
            *hw_ptr += e->pins_size;
        }

        const void *settings = NULL;
        if (e->settings_size > 0) {
            settings = *set_ptr;
            *set_ptr += e->settings_size;
        }

        esp_err_t ret = e->init(pins, settings, &handles[i]);
        if (ret != ESP_OK) {
            ESP_LOGE(TAG, "Block init failed type=0x%02x idx=%d err=0x%x",
                     type_ids[i], i, ret);
            /* Free already-allocated handles in this pipeline */
            for (int k = 0; k < i; k++) free(handles[k]);
            return ret;
        }

        /* Register sensor block outputs for cross-pipeline sensor_value references.
         * Sensor types: sensor_analog (0x01), dht22_temp (0x02), dht22_humid (0x03).
         * Encoder source types: encoder_position (0xA1), encoder_velocity (0xA2),
         *                       encoder_mapped (0xA3) — registered for sensor_value wiring. */
        bool is_sensor = (type_ids[i] >= 0x01 && type_ids[i] <= 0x03);
        bool is_encoder_src = (type_ids[i] >= 0xA1 && type_ids[i] <= 0xA3);
        if (is_sensor || is_encoder_src) {
            if (e->output_ptr && s_sensor_reg_count < PDS_MAX_SENSOR_SLOTS) {
                const void *out = e->output_ptr(handles[i], 0);
                if (out) {
                    s_sensor_reg[s_sensor_reg_count++] = (const float *)out;
                }
            }
        }
    }

    /* Pass 2 — wire connections (linear sequential + fb_ref fan-out) */
    for (int i = 1; i < n; i++) {
        const pds_block_type_entry_t *e = pds_block_registry_lookup(type_ids[i]);

        /* sensor_value (0x51): source is set later via post-build wiring pass */
        if (type_ids[i] == (uint8_t)PDS_BLOCK_SENSOR_VALUE) continue;

        /* fb_ref: source is ref_source[i], not i-1 */
        int src_idx = (type_ids[i] == (uint8_t)PDS_BLOCK_REF) ? (int)ref_source[i] : i - 1;
        if (src_idx < 0 || src_idx >= n) continue;

        const pds_block_type_entry_t *src_e = pds_block_registry_lookup(type_ids[src_idx]);
        if (!src_e || !src_e->output_ptr) continue;

        const void *src_out = src_e->output_ptr(handles[src_idx], 0);
        if (src_out && e->connect) {
            e->connect(handles[i], 0, src_out);
        }
    }

    memcpy(out->type_ids, type_ids, (size_t)n * sizeof(uint8_t));
    memcpy(out->handles,  handles,  (size_t)n * sizeof(pds_comp_handle_t));
    out->block_count = (uint8_t)n;
    return ESP_OK;
}

#ifdef PDS_PERIPH_HAS_ENCODER_MAPPED
/* Wire encoder_mapped control_point targets.  Called from engine_load() and
 * apply_settings() so the pointer survives in-place settings updates. */
static void _wire_encoder_control_points(uint8_t count)
{
    for (int pi = 0; pi < (int)count; pi++) {
        const pds_pipeline_instance_t *pl = &s_engine.pipelines[pi];
        for (int i = 0; i < pl->block_count; i++) {
            if (pl->type_ids[i] != (uint8_t)PDS_BLOCK_ENCODER_MAPPED) continue;
            pds_fb_encoder_mapped_settings_t es;
            if (pds_fb_encoder_mapped_get_settings(pl->handles[i], &es) != ESP_OK) continue;
            if (es.target_pipeline_idx == 0xFF) continue;
            if (es.target_pipeline_idx >= count) {
                ESP_LOGW(TAG, "enc_mapped p=%d b=%d: target pipeline %u out of range",
                         pi, i, es.target_pipeline_idx);
                continue;
            }
            const pds_pipeline_instance_t *tgt_pl = &s_engine.pipelines[es.target_pipeline_idx];
            if (es.target_block_idx >= tgt_pl->block_count) {
                ESP_LOGW(TAG, "enc_mapped p=%d b=%d: target block %u out of range in pl %u",
                         pi, i, es.target_block_idx, es.target_pipeline_idx);
                continue;
            }
            uint8_t tgt_type = tgt_pl->type_ids[es.target_block_idx];
            float  *tgt_ptr  = NULL;
            if (tgt_type == (uint8_t)PDS_BLOCK_PID && es.target_field_idx == 0) {
                tgt_ptr = pds_fb_pid_get_setpoint_ptr(tgt_pl->handles[es.target_block_idx]);
            }
            if (tgt_ptr) {
                pds_fb_encoder_mapped_set_target(pl->handles[i], tgt_ptr);
                ESP_LOGI(TAG, "enc_mapped p=%d b=%d wired → pl=%u blk=%u field=%u",
                         pi, i, es.target_pipeline_idx, es.target_block_idx, es.target_field_idx);
            } else {
                ESP_LOGW(TAG, "enc_mapped p=%d b=%d: unsupported target type=0x%02x field=%u",
                         pi, i, tgt_type, es.target_field_idx);
            }
        }
    }
}
#endif /* PDS_PERIPH_HAS_ENCODER_MAPPED */

/* ── Public API ───────────────────────────────────────────────────────────── */

esp_err_t pds_pipeline_engine_load(
    const uint8_t *l1, size_t l1_len,
    const uint8_t *l2, size_t l2_len,
    const uint8_t *l3, size_t l3_len)
{
    if (!l1 || !l2 || !l3 || l1_len < 2 || l2_len < 2 || l3_len < 9) {
        return ESP_ERR_INVALID_ARG;
    }

    if (l1[0] != PDS_PIPELINE_FORMAT_VERSION) {
        ESP_LOGE(TAG, "Layer 1 format_version=0x%02x expected 0x%02x",
                 l1[0], PDS_PIPELINE_FORMAT_VERSION);
        return ESP_ERR_INVALID_VERSION;
    }

    uint8_t pver = l1[1];
    if (l2[1] != pver || l3[1] != pver) {
        ESP_LOGE(TAG, "pipeline_version mismatch: L1=%u L2=%u L3=%u", pver, l2[1], l3[1]);
        return ESP_ERR_INVALID_STATE;
    }

    engine_teardown();

    /* Global header from Layer 3 */
    uint32_t rate_ms = 0;
    memcpy(&rate_ms, l3 + 2, sizeof(rate_ms));  /* little-endian uint32 at byte 2 */

    /* Walk Layer 1 sentinel stream — hw_ptr and set_ptr advance across all pipelines */
    const uint8_t *p       = l1 + 2;
    const uint8_t *hw_ptr  = l2 + 2;
    const uint8_t *set_ptr = l3 + 9;
    uint8_t count = 0;

    while (*p != 0xFF && count < PDS_MAX_PIPELINES) {
        if (*p != 0x00) {
            ESP_LOGE(TAG, "Expected START sentinel 0x00, got 0x%02x at offset %td",
                     *p, (ptrdiff_t)(p - l1));
            engine_teardown();
            return ESP_ERR_INVALID_ARG;
        }
        p++;  /* consume 0x00 */

        uint8_t type_ids[PDS_MAX_BLOCKS_PER_PIPELINE];
        int n = 0;
        while (*p != 0xFE && n < PDS_MAX_BLOCKS_PER_PIPELINE) {
            type_ids[n++] = *p++;
        }
        if (*p != 0xFE) {
            ESP_LOGE(TAG, "Pipeline %u exceeds %d-block limit or missing 0xFE",
                     count, PDS_MAX_BLOCKS_PER_PIPELINE);
            engine_teardown();
            return ESP_ERR_INVALID_SIZE;
        }
        p++;  /* consume 0xFE */

        esp_err_t ret = pipeline_build(type_ids, n, &hw_ptr, &set_ptr,
                                       &s_engine.pipelines[count]);
        if (ret != ESP_OK) {
            engine_teardown();
            return ret;
        }
        count++;
    }

    s_engine.pipeline_count   = count;
    s_engine.pipeline_version = pver;
    s_engine.update_rate_ms   = rate_ms;
    s_engine.loaded           = true;

    /* Post-build: wire sensor_value (0x51) blocks to their registered sensor slots.
     * Done after ALL pipelines are built so that the sensors pipeline (which may come
     * last in the L1 stream) has already populated s_sensor_reg[]. */
    for (int p = 0; p < count; p++) {
        const pds_pipeline_instance_t *pl = &s_engine.pipelines[p];
        for (int i = 0; i < pl->block_count; i++) {
            if (pl->type_ids[i] != (uint8_t)PDS_BLOCK_SENSOR_VALUE) continue;
            uint8_t sidx = pds_fb_sensor_value_get_sensor_index(pl->handles[i]);
            if (sidx < s_sensor_reg_count && s_sensor_reg[sidx]) {
                pds_fb_sensor_value_set_source(pl->handles[i], s_sensor_reg[sidx]);
                ESP_LOGD(TAG, "sensor_value p=%d b=%d wired → slot %u", p, i, sidx);
            } else {
                ESP_LOGW(TAG, "sensor_value p=%d b=%d: slot %u not available (reg_count=%u)",
                         p, i, sidx, s_sensor_reg_count);
            }
        }
    }

    /* Post-build: wire gpio_value (0x32) blocks to the active_f output of the
     * referenced gpio_input block in the target pipeline. */
#ifdef PDS_PERIPH_HAS_GPIO_VALUE
    for (int p = 0; p < count; p++) {
        const pds_pipeline_instance_t *pl = &s_engine.pipelines[p];
        for (int i = 0; i < pl->block_count; i++) {
            if (pl->type_ids[i] != (uint8_t)PDS_BLOCK_GPIO_VALUE) continue;
            uint8_t ref_pl_idx = 0, ref_blk_idx = 0;
            pds_fb_gpio_value_get_ref(pl->handles[i], &ref_pl_idx, &ref_blk_idx);
            if (ref_pl_idx >= count) {
                ESP_LOGW(TAG, "gpio_value p=%d b=%d: ref pipeline %u out of range (%u)",
                         p, i, ref_pl_idx, count);
                continue;
            }
            const pds_pipeline_instance_t *src_pl = &s_engine.pipelines[ref_pl_idx];
            if (ref_blk_idx >= src_pl->block_count) {
                ESP_LOGW(TAG, "gpio_value p=%d b=%d: ref block %u out of range in pl %u",
                         p, i, ref_blk_idx, ref_pl_idx);
                continue;
            }
            if (src_pl->type_ids[ref_blk_idx] != (uint8_t)PDS_BLOCK_GPIO_INPUT) {
                ESP_LOGW(TAG, "gpio_value p=%d b=%d: ref pl=%u blk=%u is type 0x%02x, not gpio_input",
                         p, i, ref_pl_idx, ref_blk_idx, src_pl->type_ids[ref_blk_idx]);
                continue;
            }
            const pds_fb_gpio_input_state_t *src_state =
                pds_fb_gpio_input_get_state(src_pl->handles[ref_blk_idx]);
            if (src_state) {
                pds_fb_gpio_value_set_source(pl->handles[i], &src_state->active_f);
                ESP_LOGD(TAG, "gpio_value p=%d b=%d wired → pl=%u blk=%u active_f",
                         p, i, ref_pl_idx, ref_blk_idx);
            }
        }
    }
#endif /* PDS_PERIPH_HAS_GPIO_VALUE */

#ifdef PDS_PERIPH_HAS_ENCODER_MAPPED
    /* Post-build: wire encoder_mapped (0xA3) control_point targets. */
    _wire_encoder_control_points(count);
#endif

    /* Post-build: register settable float fields in the telemetry sink so the OLED
     * screen designer can display them.  Key format: "cp:<pl_idx>:<blk_idx>:<field>".
     * Currently: PID setpoint (type_id=0x21, field_idx=0). */
#ifdef PDS_PERIPH_HAS_PID
    for (int pi = 0; pi < count; pi++) {
        const pds_pipeline_instance_t *pl = &s_engine.pipelines[pi];
        for (int i = 0; i < pl->block_count; i++) {
            if (pl->type_ids[i] == (uint8_t)PDS_BLOCK_PID) {
                float *sp = pds_fb_pid_get_setpoint_ptr(pl->handles[i]);
                if (sp) {
                    pds_tel_slot_t slot = {
                        .kind     = PDS_TEL_PIPELINE,
                        .pin      = 0,
                        .pipeline = { .value = sp },
                    };
                    snprintf(slot.label, sizeof(slot.label), "cp:%d:%d:setpoint", pi, i);
                    pds_tel_sink_register(&slot);
                }
            }
        }
    }
#endif /* PDS_PERIPH_HAS_PID */

    ESP_LOGI(TAG, "Loaded %u pipeline(s) | version=%u | rate=%"PRIu32"ms | sensors=%u",
             count, pver, rate_ms, s_sensor_reg_count);
    return ESP_OK;
}

void pds_pipeline_engine_tick(void)
{
    if (!s_engine.loaded) return;

    for (int p = 0; p < s_engine.pipeline_count; p++) {
        pds_pipeline_instance_t *pl = &s_engine.pipelines[p];

        /* Suspended pipelines are skipped entirely (safe_state already called on entry). */
        if (pl->suspended) continue;

        for (int i = 0; i < pl->block_count; i++) {
            const pds_block_type_entry_t *e = pds_block_registry_lookup(pl->type_ids[i]);
            if (!e || !e->run) continue;

            /* ALL-STOP blocks always run so they can detect trigger release
             * and call pds_pipeline_engine_resume() themselves. */
            bool is_all_stop_block = (pl->type_ids[i] == (uint8_t)PDS_BLOCK_ALL_STOP);
            if (s_engine.stopped && !is_all_stop_block) continue;

            e->run(pl->handles[i]);
        }
    }
}

esp_err_t pds_pipeline_engine_apply_settings(const uint8_t *l3, size_t l3_len)
{
    if (!s_engine.loaded)  return ESP_ERR_INVALID_STATE;
    if (!l3 || l3_len < 9) return ESP_ERR_INVALID_ARG;

    if (l3[1] != s_engine.pipeline_version) {
        ESP_LOGE(TAG, "apply_settings version mismatch: engine=%u blob=%u",
                 s_engine.pipeline_version, l3[1]);
        return ESP_ERR_INVALID_STATE;
    }

    uint32_t rate_ms = 0;
    memcpy(&rate_ms, l3 + 2, sizeof(rate_ms));
    s_engine.update_rate_ms = rate_ms;

    const uint8_t *ptr = l3 + 9;
    const uint8_t *end = l3 + l3_len;
    for (int p = 0; p < s_engine.pipeline_count; p++) {
        const pds_pipeline_instance_t *pl = &s_engine.pipelines[p];
        for (int i = 0; i < pl->block_count; i++) {
            const pds_block_type_entry_t *e = pds_block_registry_lookup(pl->type_ids[i]);
            if (e && e->settings_size > 0 && e->set_settings) {
                if (ptr + e->settings_size > end) {
                    /* L3 is truncated — server blob is missing later pipelines.
                     * Stop here; remaining blocks keep their current settings. */
                    ESP_LOGE(TAG, "apply_settings: L3 truncated at p%d b%d (need %zu, have %td)",
                             p, i, e->settings_size, end - ptr);
                    goto done;
                }
                e->set_settings(pl->handles[i], ptr);
                ptr += e->settings_size;
            }
        }
    }
done:
#ifdef PDS_PERIPH_HAS_ENCODER_MAPPED
    _wire_encoder_control_points(s_engine.pipeline_count);
#endif
    return ESP_OK;
}

uint32_t pds_pipeline_engine_get_update_rate_ms(void)
{
    return s_engine.update_rate_ms;
}

bool pds_pipeline_engine_is_loaded(void)
{
    return s_engine.loaded;
}

void pds_pipeline_engine_suspend_pipeline(uint8_t idx)
{
    if (!s_engine.loaded || idx >= s_engine.pipeline_count) return;
    pds_pipeline_instance_t *pl = &s_engine.pipelines[idx];
    if (pl->suspended) return;  /* already suspended — idempotent */
    pl->suspended = true;
    /* Drive every output block in this pipeline to its safe/resting state */
    for (int i = 0; i < pl->block_count; i++) {
        const pds_block_type_entry_t *e = pds_block_registry_lookup(pl->type_ids[i]);
        if (e && e->safe_state) {
            e->safe_state(pl->handles[i]);
        }
    }
}

void pds_pipeline_engine_resume_pipeline(uint8_t idx)
{
    if (!s_engine.loaded || idx >= s_engine.pipeline_count) return;
    s_engine.pipelines[idx].suspended = false;
}

void pds_pipeline_engine_all_stop(void)
{
    if (!s_engine.loaded) return;
    s_engine.stopped = true;
    /* Drive every output block to its safe/resting state */
    for (int p = 0; p < s_engine.pipeline_count; p++) {
        const pds_pipeline_instance_t *pl = &s_engine.pipelines[p];
        for (int i = 0; i < pl->block_count; i++) {
            const pds_block_type_entry_t *e = pds_block_registry_lookup(pl->type_ids[i]);
            if (e && e->safe_state) {
                e->safe_state(pl->handles[i]);
            }
        }
    }
}

void pds_pipeline_engine_resume(void)
{
    s_engine.stopped = false;
}

bool pds_pipeline_engine_is_stopped(void)
{
    return s_engine.stopped;
}

/* ── HMI Runtime Triggers ─────────────────────────────────────────────────── */

esp_err_t pds_pipeline_engine_hmi_set_toggle(uint8_t pipeline_idx, uint8_t block_idx, bool value)
{
    if (!s_engine.loaded) return ESP_ERR_INVALID_STATE;
    if (pipeline_idx >= s_engine.pipeline_count) return ESP_ERR_INVALID_ARG;

    pds_pipeline_instance_t *pl = &s_engine.pipelines[pipeline_idx];
    if (block_idx >= pl->block_count) return ESP_ERR_INVALID_ARG;
    if (pl->type_ids[block_idx] != (uint8_t)PDS_BLOCK_HMI_TOGGLE) return ESP_ERR_INVALID_ARG;

    pds_fb_hmi_toggle_settings_t settings;
    esp_err_t ret = pds_fb_hmi_toggle_get_settings(pl->handles[block_idx], &settings);
    if (ret != ESP_OK) return ret;

    settings.value = value;
    return pds_fb_hmi_toggle_set_settings(pl->handles[block_idx], &settings);
}

esp_err_t pds_pipeline_engine_hmi_trigger_momentary(uint8_t pipeline_idx, uint8_t block_idx)
{
    if (!s_engine.loaded) return ESP_ERR_INVALID_STATE;
    if (pipeline_idx >= s_engine.pipeline_count) return ESP_ERR_INVALID_ARG;

    pds_pipeline_instance_t *pl = &s_engine.pipelines[pipeline_idx];
    if (block_idx >= pl->block_count) return ESP_ERR_INVALID_ARG;
    if (pl->type_ids[block_idx] != (uint8_t)PDS_BLOCK_HMI_MOMENTARY) return ESP_ERR_INVALID_ARG;

    return pds_fb_hmi_momentary_trigger(pl->handles[block_idx]);
}

esp_err_t pds_pipeline_engine_patch_float_field(uint8_t pipeline_idx, uint8_t block_idx,
                                                 uint8_t field_idx, float value)
{
    if (!s_engine.loaded) return ESP_ERR_INVALID_STATE;
    if (pipeline_idx >= s_engine.pipeline_count) return ESP_ERR_INVALID_ARG;
    const pds_pipeline_instance_t *pl = &s_engine.pipelines[pipeline_idx];
    if (block_idx >= pl->block_count) return ESP_ERR_INVALID_ARG;

    uint8_t type = pl->type_ids[block_idx];
#ifdef PDS_PERIPH_HAS_PID
    if (type == (uint8_t)PDS_BLOCK_PID && field_idx == 0) {
        float *sp = pds_fb_pid_get_setpoint_ptr(pl->handles[block_idx]);
        if (!sp) return ESP_ERR_INVALID_ARG;
        *sp = value;
        return ESP_OK;
    }
#endif
    return ESP_ERR_INVALID_ARG;
}

esp_err_t pds_pipeline_engine_poll_cp_settle(
    esp_err_t (*callback)(uint8_t pl, uint8_t blk, uint8_t field, float value, void *ctx),
    void *user_ctx)
{
    if (!callback) return ESP_ERR_INVALID_ARG;
    if (!s_engine.loaded) return ESP_OK;  /* nothing to poll if engine not running */

    for (int pi = 0; pi < (int)s_engine.pipeline_count; pi++) {
        const pds_pipeline_instance_t *pl = &s_engine.pipelines[pi];
        for (int bi = 0; bi < (int)pl->block_count; bi++) {
#ifdef PDS_PERIPH_HAS_ENCODER_MAPPED
            if (pl->type_ids[bi] != (uint8_t)PDS_BLOCK_ENCODER_MAPPED) continue;

            float val;
            if (pds_fb_encoder_mapped_poll_settle(pl->handles[bi], &val) != ESP_OK) continue;

            pds_fb_encoder_mapped_settings_t es;
            if (pds_fb_encoder_mapped_get_settings(pl->handles[bi], &es) != ESP_OK) continue;

            esp_err_t cb_err = callback(
                es.target_pipeline_idx, es.target_block_idx, es.target_field_idx,
                val, user_ctx);
            if (cb_err == ESP_OK)
                pds_fb_encoder_mapped_ack_settle(pl->handles[bi]);
#endif /* PDS_PERIPH_HAS_ENCODER_MAPPED */
        }
    }
    return ESP_OK;
}
