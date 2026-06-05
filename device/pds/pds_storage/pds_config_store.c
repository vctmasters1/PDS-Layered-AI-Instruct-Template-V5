/**
 * @file pds_config_store.c
 * @brief NVS storage implementation for runtime configurations
 * 
 * Handles persistent storage of PINMAP, LADDER, and USRSET configurations
 * in NVS flash partition with CRC32 validation.
 */

#include "pds_config_store.h"
#include "nvs_flash.h"
#include "esp_log.h"
#include "esp_crc.h"
#include <string.h>
#include <inttypes.h>

static const char *TAG = "PDS_CONFIG_STORE";

/* ============================================================================
 * CRC32 COMPUTATION
 * ============================================================================ */

uint32_t pds_config_crc32(const uint8_t *data, size_t length) {
    if (!data || length == 0) return 0;
    return esp_crc32_le(0xFFFFFFFF, data, length);
}

/* ============================================================================
 * INITIALIZATION
 * ============================================================================ */

esp_err_t pds_config_store_init(void) {
    esp_err_t ret = nvs_flash_init();
    
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_LOGW(TAG, "NVS flash needs erase, performing nvs_flash_erase()");
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to initialize NVS flash: %s", esp_err_to_name(ret));
        return ret;
    }
    
    ESP_LOGI(TAG, "NVS storage initialized");
    return ESP_OK;
}

/* ============================================================================
 * PINMAP STORAGE
 * ============================================================================ */

esp_err_t pds_config_save_pinmap(const pds_telconf_pinmap_t *pinmap) {
    if (!pinmap) {
        ESP_LOGE(TAG, "Invalid PINMAP pointer");
        return ESP_ERR_INVALID_ARG;
    }
    
    if (pinmap->num_pins == 0 || pinmap->num_pins > PDS_TELCONF_PINMAP_MAX_PINS) {
        ESP_LOGE(TAG, "Invalid pin count: %d", pinmap->num_pins);
        return ESP_ERR_INVALID_ARG;
    }
    
    nvs_handle_t handle;
    esp_err_t ret = nvs_open(PDS_CONFIG_NAMESPACE, NVS_READWRITE, &handle);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to open NVS namespace: %s", esp_err_to_name(ret));
        return ret;
    }
    
    // Compute CRC32
    uint32_t crc = pds_config_crc32((const uint8_t *)pinmap, sizeof(pds_telconf_pinmap_t));
    
    // Store PINMAP
    ret = nvs_set_blob(handle, PDS_CONFIG_KEY_PINMAP, pinmap, sizeof(pds_telconf_pinmap_t));
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to save PINMAP: %s", esp_err_to_name(ret));
        nvs_close(handle);
        return ret;
    }
    
    // Store CRC
    ret = nvs_set_u32(handle, PDS_CONFIG_KEY_PINMAP_CRC, crc);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to save PINMAP CRC: %s", esp_err_to_name(ret));
        nvs_close(handle);
        return ret;
    }
    
    // Commit
    ret = nvs_commit(handle);
    nvs_close(handle);
    
    if (ret == ESP_OK) {
        ESP_LOGI(TAG, "PINMAP saved to NVS: %d pins, CRC=0x%08"PRIx32, pinmap->num_pins, crc);
    } else {
        ESP_LOGE(TAG, "Failed to commit PINMAP: %s", esp_err_to_name(ret));
    }
    
    return ret;
}

esp_err_t pds_config_load_pinmap(pds_telconf_pinmap_t *pinmap) {
    if (!pinmap) {
        ESP_LOGE(TAG, "Invalid PINMAP output buffer");
        return ESP_ERR_INVALID_ARG;
    }
    
    nvs_handle_t handle;
    esp_err_t ret = nvs_open(PDS_CONFIG_NAMESPACE, NVS_READONLY, &handle);
    if (ret != ESP_OK) {
        ESP_LOGW(TAG, "Failed to open NVS namespace: %s", esp_err_to_name(ret));
        return ret;
    }
    
    // Load PINMAP
    size_t required_size = sizeof(pds_telconf_pinmap_t);
    ret = nvs_get_blob(handle, PDS_CONFIG_KEY_PINMAP, pinmap, &required_size);
    
    if (ret == ESP_ERR_NVS_NOT_FOUND) {
        ESP_LOGW(TAG, "PINMAP not found in NVS");
        nvs_close(handle);
        return ret;
    }
    
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to load PINMAP: %s", esp_err_to_name(ret));
        nvs_close(handle);
        return ret;
    }
    
    // Load and verify CRC
    uint32_t stored_crc = 0;
    ret = nvs_get_u32(handle, PDS_CONFIG_KEY_PINMAP_CRC, &stored_crc);
    nvs_close(handle);
    
    if (ret == ESP_ERR_NVS_NOT_FOUND) {
        ESP_LOGW(TAG, "PINMAP CRC not found");
        return ret;
    }
    
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to load PINMAP CRC: %s", esp_err_to_name(ret));
        return ret;
    }
    
    uint32_t computed_crc = pds_config_crc32((const uint8_t *)pinmap, sizeof(pds_telconf_pinmap_t));
    
    if (stored_crc != computed_crc) {
        ESP_LOGE(TAG, "PINMAP CRC mismatch: stored=0x%08"PRIx32", computed=0x%08"PRIx32, stored_crc, computed_crc);
        return ESP_ERR_INVALID_CRC;
    }
    
    ESP_LOGI(TAG, "PINMAP loaded from NVS: %d pins, CRC=0x%08"PRIx32" ✓", pinmap->num_pins, computed_crc);
    return ESP_OK;
}

bool pds_config_has_pinmap(void) {
    pds_telconf_pinmap_t pinmap;
    return pds_config_load_pinmap(&pinmap) == ESP_OK;
}

esp_err_t pds_config_erase_pinmap(void) {
    nvs_handle_t handle;
    esp_err_t ret = nvs_open(PDS_CONFIG_NAMESPACE, NVS_READWRITE, &handle);
    if (ret != ESP_OK) return ret;
    
    nvs_erase_key(handle, PDS_CONFIG_KEY_PINMAP);
    nvs_erase_key(handle, PDS_CONFIG_KEY_PINMAP_CRC);
    ret = nvs_commit(handle);
    nvs_close(handle);
    
    ESP_LOGI(TAG, "PINMAP erased from NVS");
    return ret;
}

/* ============================================================================
 * LADDER STORAGE
 * ============================================================================ */

esp_err_t pds_config_save_ladder(const pds_telconf_ladder_t *ladder) {
    if (!ladder) {
        ESP_LOGE(TAG, "Invalid LADDER pointer");
        return ESP_ERR_INVALID_ARG;
    }
    
    if (ladder->payload_size > 4096) {
        ESP_LOGE(TAG, "LADDER payload too large: %"PRIu32" bytes", ladder->payload_size);
        return ESP_ERR_INVALID_ARG;
    }
    
    nvs_handle_t handle;
    esp_err_t ret = nvs_open(PDS_CONFIG_NAMESPACE, NVS_READWRITE, &handle);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to open NVS namespace: %s", esp_err_to_name(ret));
        return ret;
    }
    
    // Compute CRC32
    uint32_t crc = pds_config_crc32((const uint8_t *)ladder, sizeof(pds_telconf_ladder_t));
    
    // Store LADDER
    ret = nvs_set_blob(handle, PDS_CONFIG_KEY_LADDER, ladder, sizeof(pds_telconf_ladder_t));
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to save LADDER: %s", esp_err_to_name(ret));
        nvs_close(handle);
        return ret;
    }
    
    // Store CRC
    ret = nvs_set_u32(handle, PDS_CONFIG_KEY_LADDER_CRC, crc);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to save LADDER CRC: %s", esp_err_to_name(ret));
        nvs_close(handle);
        return ret;
    }
    
    // Commit
    ret = nvs_commit(handle);
    nvs_close(handle);
    
    if (ret == ESP_OK) {
        ESP_LOGI(TAG, "LADDER saved to NVS: %"PRIu32" bytes, type=%d, CRC=0x%08"PRIx32, 
                 ladder->payload_size, ladder->bytecode_type, crc);
    } else {
        ESP_LOGE(TAG, "Failed to commit LADDER: %s", esp_err_to_name(ret));
    }
    
    return ret;
}

esp_err_t pds_config_load_ladder(pds_telconf_ladder_t *ladder) {
    if (!ladder) {
        ESP_LOGE(TAG, "Invalid LADDER output buffer");
        return ESP_ERR_INVALID_ARG;
    }
    
    nvs_handle_t handle;
    esp_err_t ret = nvs_open(PDS_CONFIG_NAMESPACE, NVS_READONLY, &handle);
    if (ret != ESP_OK) {
        ESP_LOGW(TAG, "Failed to open NVS namespace: %s", esp_err_to_name(ret));
        return ret;
    }
    
    // Load LADDER
    size_t required_size = sizeof(pds_telconf_ladder_t);
    ret = nvs_get_blob(handle, PDS_CONFIG_KEY_LADDER, ladder, &required_size);
    
    if (ret == ESP_ERR_NVS_NOT_FOUND) {
        ESP_LOGW(TAG, "LADDER not found in NVS");
        nvs_close(handle);
        return ret;
    }
    
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to load LADDER: %s", esp_err_to_name(ret));
        nvs_close(handle);
        return ret;
    }
    
    // Load and verify CRC
    uint32_t stored_crc = 0;
    ret = nvs_get_u32(handle, PDS_CONFIG_KEY_LADDER_CRC, &stored_crc);
    nvs_close(handle);
    
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to load LADDER CRC: %s", esp_err_to_name(ret));
        return ret;
    }
    
    uint32_t computed_crc = pds_config_crc32((const uint8_t *)ladder, sizeof(pds_telconf_ladder_t));
    
    if (stored_crc != computed_crc) {
        ESP_LOGE(TAG, "LADDER CRC mismatch: stored=0x%08"PRIx32", computed=0x%08"PRIx32, stored_crc, computed_crc);
        return ESP_ERR_INVALID_CRC;
    }
    
    ESP_LOGI(TAG, "LADDER loaded from NVS: %"PRIu32" bytes, type=%d, CRC=0x%08"PRIx32" ✓", 
             ladder->payload_size, ladder->bytecode_type, computed_crc);
    return ESP_OK;
}

bool pds_config_has_ladder(void) {
    pds_telconf_ladder_t ladder;
    return pds_config_load_ladder(&ladder) == ESP_OK;
}

esp_err_t pds_config_erase_ladder(void) {
    nvs_handle_t handle;
    esp_err_t ret = nvs_open(PDS_CONFIG_NAMESPACE, NVS_READWRITE, &handle);
    if (ret != ESP_OK) return ret;
    
    nvs_erase_key(handle, PDS_CONFIG_KEY_LADDER);
    nvs_erase_key(handle, PDS_CONFIG_KEY_LADDER_CRC);
    ret = nvs_commit(handle);
    nvs_close(handle);
    
    ESP_LOGI(TAG, "LADDER erased from NVS");
    return ret;
}

/* ============================================================================
 * USER SETTINGS STORAGE
 * ============================================================================ */

esp_err_t pds_config_save_usrset(const pds_telconf_usrset_t *usrset) {
    if (!usrset) {
        ESP_LOGE(TAG, "Invalid USRSET pointer");
        return ESP_ERR_INVALID_ARG;
    }
    
    if (usrset->num_settings > 64) {
        ESP_LOGE(TAG, "Too many settings: %d", usrset->num_settings);
        return ESP_ERR_INVALID_ARG;
    }
    
    nvs_handle_t handle;
    esp_err_t ret = nvs_open(PDS_CONFIG_NAMESPACE, NVS_READWRITE, &handle);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to open NVS namespace: %s", esp_err_to_name(ret));
        return ret;
    }
    
    // Compute CRC32
    uint32_t crc = pds_config_crc32((const uint8_t *)usrset, sizeof(pds_telconf_usrset_t));
    
    // Store USRSET
    ret = nvs_set_blob(handle, PDS_CONFIG_KEY_USRSET, usrset, sizeof(pds_telconf_usrset_t));
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to save USRSET: %s", esp_err_to_name(ret));
        nvs_close(handle);
        return ret;
    }
    
    // Store CRC
    ret = nvs_set_u32(handle, PDS_CONFIG_KEY_USRSET_CRC, crc);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to save USRSET CRC: %s", esp_err_to_name(ret));
        nvs_close(handle);
        return ret;
    }
    
    // Commit
    ret = nvs_commit(handle);
    nvs_close(handle);
    
    if (ret == ESP_OK) {
        ESP_LOGI(TAG, "USRSET saved to NVS: %d settings, CRC=0x%08"PRIx32, usrset->num_settings, crc);
    } else {
        ESP_LOGE(TAG, "Failed to commit USRSET: %s", esp_err_to_name(ret));
    }
    
    return ret;
}

esp_err_t pds_config_load_usrset(pds_telconf_usrset_t *usrset) {
    if (!usrset) {
        ESP_LOGE(TAG, "Invalid USRSET output buffer");
        return ESP_ERR_INVALID_ARG;
    }
    
    nvs_handle_t handle;
    esp_err_t ret = nvs_open(PDS_CONFIG_NAMESPACE, NVS_READONLY, &handle);
    if (ret != ESP_OK) {
        ESP_LOGW(TAG, "Failed to open NVS namespace: %s", esp_err_to_name(ret));
        return ret;
    }
    
    // Load USRSET
    size_t required_size = sizeof(pds_telconf_usrset_t);
    ret = nvs_get_blob(handle, PDS_CONFIG_KEY_USRSET, usrset, &required_size);
    
    if (ret == ESP_ERR_NVS_NOT_FOUND) {
        ESP_LOGW(TAG, "USRSET not found in NVS");
        nvs_close(handle);
        return ret;
    }
    
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to load USRSET: %s", esp_err_to_name(ret));
        nvs_close(handle);
        return ret;
    }
    
    // Load and verify CRC
    uint32_t stored_crc = 0;
    ret = nvs_get_u32(handle, PDS_CONFIG_KEY_USRSET_CRC, &stored_crc);
    nvs_close(handle);
    
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to load USRSET CRC: %s", esp_err_to_name(ret));
        return ret;
    }
    
    uint32_t computed_crc = pds_config_crc32((const uint8_t *)usrset, sizeof(pds_telconf_usrset_t));
    
    if (stored_crc != computed_crc) {
        ESP_LOGE(TAG, "USRSET CRC mismatch: stored=0x%08"PRIx32", computed=0x%08"PRIx32, stored_crc, computed_crc);
        return ESP_ERR_INVALID_CRC;
    }
    
    ESP_LOGI(TAG, "USRSET loaded from NVS: %d settings, CRC=0x%08"PRIx32" ✓", usrset->num_settings, computed_crc);
    return ESP_OK;
}

bool pds_config_has_usrset(void) {
    pds_telconf_usrset_t usrset;
    return pds_config_load_usrset(&usrset) == ESP_OK;
}

esp_err_t pds_config_erase_usrset(void) {
    nvs_handle_t handle;
    esp_err_t ret = nvs_open(PDS_CONFIG_NAMESPACE, NVS_READWRITE, &handle);
    if (ret != ESP_OK) return ret;
    
    nvs_erase_key(handle, PDS_CONFIG_KEY_USRSET);
    nvs_erase_key(handle, PDS_CONFIG_KEY_USRSET_CRC);
    ret = nvs_commit(handle);
    nvs_close(handle);
    
    ESP_LOGI(TAG, "USRSET erased from NVS");
    return ret;
}

/* ============================================================================
 * BULK OPERATIONS
 * ============================================================================ */

uint8_t pds_config_load_all(
    pds_telconf_pinmap_t *pinmap,
    pds_telconf_ladder_t *ladder,
    pds_telconf_usrset_t *usrset) {
    
    uint8_t loaded = 0;
    
    if (pinmap && pds_config_load_pinmap(pinmap) == ESP_OK) {
        loaded |= 0x01;
    }
    
    if (ladder && pds_config_load_ladder(ladder) == ESP_OK) {
        loaded |= 0x02;
    }
    
    if (usrset && pds_config_load_usrset(usrset) == ESP_OK) {
        loaded |= 0x04;
    }
    
    ESP_LOGI(TAG, "Loaded configs bitmask: 0x%02X (PINMAP=%d LADDER=%d USRSET=%d)",
             loaded, !!(loaded & 0x01), !!(loaded & 0x02), !!(loaded & 0x04));
    
    return loaded;
}

esp_err_t pds_config_erase_all(void) {
    ESP_LOGW(TAG, "Erasing ALL runtime configurations (factory reset)");
    
    pds_config_erase_pinmap();
    pds_config_erase_ladder();
    pds_config_erase_usrset();
    
    return ESP_OK;
}

esp_err_t pds_config_get_stats(pds_config_stats_t *stats) {
    if (!stats) {
        return ESP_ERR_INVALID_ARG;
    }
    
    nvs_stats_t nvs_stats;
    ESP_ERROR_CHECK(nvs_get_stats(NULL, &nvs_stats));
    
    stats->used_entries = nvs_stats.used_entries;
    stats->free_entries = nvs_stats.free_entries;
    stats->total_entries = nvs_stats.total_entries;
    stats->namespace_count = nvs_stats.namespace_count;
    
    ESP_LOGI(TAG, "NVS Stats: used=%d, free=%d, total=%d, namespaces=%d",
             stats->used_entries, stats->free_entries, stats->total_entries,
             stats->namespace_count);
    
    return ESP_OK;
}

esp_err_t pds_config_format_nvs(void) {
    ESP_LOGW(TAG, "Formatting entire NVS partition (destructive!)");
    return nvs_flash_erase();
}

/* ============================================================================
 * VALIDATION HELPERS
 * ============================================================================ */

bool pds_config_validate_pinmap_crc(const pds_telconf_pinmap_t *pinmap) {
    if (!pinmap) return false;
    uint32_t computed = pds_config_crc32((const uint8_t *)pinmap, sizeof(pds_telconf_pinmap_t));
    nvs_handle_t handle;
    if (nvs_open(PDS_CONFIG_NAMESPACE, NVS_READONLY, &handle) != ESP_OK) return false;
    uint32_t stored = 0;
    esp_err_t ret = nvs_get_u32(handle, PDS_CONFIG_KEY_PINMAP_CRC, &stored);
    nvs_close(handle);
    if (ret != ESP_OK) return false;
    return computed == stored;
}

bool pds_config_validate_ladder_crc(const pds_telconf_ladder_t *ladder) {
    if (!ladder) return false;
    uint32_t computed = pds_config_crc32((const uint8_t *)ladder, sizeof(pds_telconf_ladder_t));
    nvs_handle_t handle;
    if (nvs_open(PDS_CONFIG_NAMESPACE, NVS_READONLY, &handle) != ESP_OK) return false;
    uint32_t stored = 0;
    esp_err_t ret = nvs_get_u32(handle, PDS_CONFIG_KEY_LADDER_CRC, &stored);
    nvs_close(handle);
    if (ret != ESP_OK) return false;
    return computed == stored;
}

bool pds_config_validate_usrset_crc(const pds_telconf_usrset_t *usrset) {
    if (!usrset) return false;
    uint32_t computed = pds_config_crc32((const uint8_t *)usrset, sizeof(pds_telconf_usrset_t));
    nvs_handle_t handle;
    if (nvs_open(PDS_CONFIG_NAMESPACE, NVS_READONLY, &handle) != ESP_OK) return false;
    uint32_t stored = 0;
    esp_err_t ret = nvs_get_u32(handle, PDS_CONFIG_KEY_USRSET_CRC, &stored);
    nvs_close(handle);
    if (ret != ESP_OK) return false;
    return computed == stored;
}
