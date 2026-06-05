/**
 * @file pds_usrset.c
 * @brief Runtime registry for user-settable variables
 *
 * Internal storage is a flat array of pds_telconf_setting_entry_t — the
 * same struct used by the wire format — so serialization is a memcpy.
 */

#include "pds_usrset.h"
#include "pds_config_store.h"
#include "nvs.h"
#include "esp_log.h"
#include <string.h>
#include <stddef.h>

static const char *TAG = "PDS_USRSET";

/* ============================================================================
 * INTERNAL STATE
 * ============================================================================ */

#define PDS_USRSET_MAX_ENTRIES  64  /* matches pds_telconf_usrset_t.settings[64] */

static pds_telconf_setting_entry_t _registry[PDS_USRSET_MAX_ENTRIES];
static uint16_t                    _count        = 0;
static bool                        _initialized  = false;

/* ============================================================================
 * HELPERS
 * ============================================================================ */

/**
 * Find the index of a named entry in the registry.
 * Returns -1 if not found.
 */
static int _find_entry(const char *name)
{
    if (!name) return -1;
    for (int i = 0; i < _count; i++) {
        if (strncmp(_registry[i].var_name, name, sizeof(_registry[i].var_name)) == 0) {
            return i;
        }
    }
    return -1;
}

/* ============================================================================
 * LIFECYCLE
 * ============================================================================ */

esp_err_t pds_usrset_init(const pds_usrset_default_t *defaults, uint16_t count)
{
    if (!defaults || count == 0) {
        ESP_LOGE(TAG, "pds_usrset_init: null defaults or zero count");
        return ESP_ERR_INVALID_ARG;
    }
    if (count > PDS_USRSET_MAX_ENTRIES) {
        ESP_LOGE(TAG, "pds_usrset_init: count %u exceeds max %d", count, PDS_USRSET_MAX_ENTRIES);
        return ESP_ERR_NO_MEM;
    }

    memset(_registry, 0, sizeof(_registry));
    _count = 0;

    for (uint16_t i = 0; i < count; i++) {
        if (!defaults[i].name || defaults[i].name[0] == '\0') {
            ESP_LOGW(TAG, "Skipping empty default entry at index %u", i);
            continue;
        }
        strncpy(_registry[_count].var_name, defaults[i].name,
                sizeof(_registry[_count].var_name) - 1);
        _registry[_count].float_value = defaults[i].value;
        _count++;
    }

    _initialized = true;
    ESP_LOGI(TAG, "Initialized with %u default entries", _count);
    return ESP_OK;
}

esp_err_t pds_usrset_load_nvs(void)
{
    if (!_initialized) {
        ESP_LOGE(TAG, "pds_usrset_load_nvs: not initialized — call pds_usrset_init() first");
        return ESP_ERR_INVALID_STATE;
    }

    pds_telconf_usrset_t stored;
    esp_err_t ret = pds_config_load_usrset(&stored);

    if (ret == ESP_ERR_NVS_NOT_FOUND) {
        ESP_LOGI(TAG, "No saved usrset in NVS — using compiled defaults");
        return ESP_OK;
    }
    if (ret != ESP_OK) {
        ESP_LOGW(TAG, "NVS usrset load failed (%s) — using compiled defaults",
                 esp_err_to_name(ret));
        return ret;
    }

    /* Apply stored values to registry, matching by name */
    uint16_t applied = 0;
    for (uint16_t i = 0; i < stored.num_settings; i++) {
        int idx = _find_entry(stored.settings[i].var_name);
        if (idx >= 0) {
            _registry[idx].float_value = stored.settings[i].float_value;
            applied++;
        } else {
            ESP_LOGD(TAG, "NVS entry '%s' not in registry — ignored",
                     stored.settings[i].var_name);
        }
    }

    ESP_LOGI(TAG, "Loaded %u/%u entries from NVS", applied, stored.num_settings);
    return ESP_OK;
}

esp_err_t pds_usrset_save_nvs(void)
{
    if (!_initialized) {
        return ESP_ERR_INVALID_STATE;
    }

    pds_telconf_usrset_t pkt;
    esp_err_t ret = pds_usrset_to_packet(&pkt);
    if (ret != ESP_OK) return ret;

    ret = pds_config_save_usrset(&pkt);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to save usrset to NVS: %s", esp_err_to_name(ret));
    }
    return ret;
}

/* ============================================================================
 * GET / SET
 * ============================================================================ */

esp_err_t pds_usrset_get(const char *name, float *out_value)
{
    if (!name || !out_value) return ESP_ERR_INVALID_ARG;
    if (!_initialized)       return ESP_ERR_INVALID_STATE;

    int idx = _find_entry(name);
    if (idx < 0) {
        ESP_LOGD(TAG, "pds_usrset_get: '%s' not found", name);
        return ESP_ERR_NOT_FOUND;
    }

    *out_value = _registry[idx].float_value;
    return ESP_OK;
}

esp_err_t pds_usrset_set(const char *name, float value)
{
    if (!name)         return ESP_ERR_INVALID_ARG;
    if (!_initialized) return ESP_ERR_INVALID_STATE;

    int idx = _find_entry(name);
    if (idx < 0) {
        ESP_LOGW(TAG, "pds_usrset_set: '%s' not in registry", name);
        return ESP_ERR_NOT_FOUND;
    }

    _registry[idx].float_value = value;
    return ESP_OK;
}

/* ============================================================================
 * WIRE FORMAT
 * ============================================================================ */

esp_err_t pds_usrset_apply_packet(const pds_telconf_usrset_t *pkt)
{
    if (!pkt)          return ESP_ERR_INVALID_ARG;
    if (!_initialized) return ESP_ERR_INVALID_STATE;

    if (pkt->version != PDS_TELEMETRY_VERSION) {
        ESP_LOGE(TAG, "apply_packet: version mismatch (got 0x%04X, want 0x%04X)",
                 pkt->version, PDS_TELEMETRY_VERSION);
        return ESP_ERR_INVALID_ARG;
    }
    if (pkt->num_settings == 0 || pkt->num_settings > PDS_USRSET_MAX_ENTRIES) {
        ESP_LOGE(TAG, "apply_packet: invalid num_settings %u", pkt->num_settings);
        return ESP_ERR_INVALID_ARG;
    }

    uint16_t applied = 0;
    for (uint16_t i = 0; i < pkt->num_settings; i++) {
        int idx = _find_entry(pkt->settings[i].var_name);
        if (idx >= 0) {
            _registry[idx].float_value = pkt->settings[i].float_value;
            applied++;
            ESP_LOGD(TAG, "  set '%s' = %.4f", pkt->settings[i].var_name,
                     (double)pkt->settings[i].float_value);
        } else {
            ESP_LOGW(TAG, "  unknown variable '%s' — ignored",
                     pkt->settings[i].var_name);
        }
    }

    ESP_LOGI(TAG, "Applied %u/%u settings from packet", applied, pkt->num_settings);

    /* Auto-persist: caller can skip pds_usrset_save_nvs() separately */
    return pds_usrset_save_nvs();
}

esp_err_t pds_usrset_to_packet(pds_telconf_usrset_t *pkt)
{
    if (!pkt)          return ESP_ERR_INVALID_ARG;
    if (!_initialized) return ESP_ERR_INVALID_STATE;

    memset(pkt, 0, sizeof(pds_telconf_usrset_t));
    pkt->version      = PDS_TELEMETRY_VERSION;
    pkt->num_settings = _count;

    for (uint16_t i = 0; i < _count; i++) {
        pkt->settings[i] = _registry[i];
    }

    /* Compute and store CRC */
    pkt->checksum = pds_config_crc32((const uint8_t *)pkt,
                                      offsetof(pds_telconf_usrset_t, checksum));

    return ESP_OK;
}

/* ============================================================================
 * UTILITY
 * ============================================================================ */

uint16_t pds_usrset_count(void)
{
    return _count;
}

bool pds_usrset_is_initialized(void)
{
    return _initialized;
}
