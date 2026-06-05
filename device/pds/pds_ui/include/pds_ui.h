#pragma once
/**
 * pds_ui.h — Layer 4 UI parameters subsystem public API
 *
 * Call pds_ui_init() once from pds_platform_main.c after pipeline init.
 * Call pds_ui_tick() on every main loop iteration.
 *
 * Binary format: Device/pds/pds_ui/AI-INSTRUCT.md
 */

#include <stddef.h>
#include <stdint.h>
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/* ── L4 blob constants ─────────────────────────────────────────────────── */

#define PDS_UI_L4_MAGIC    0x50445534u  /* 'P','D','S','4' */
#define PDS_UI_L4_VERSION  1

/* ── Device type enum ──────────────────────────────────────────────────── */

typedef enum {
    PDS_UI_DEV_OLED_SSD1306 = 0x01,
    /* 0x02+ reserved */
} pds_ui_dev_type_t;

/* ── L4 blob header ────────────────────────────────────────────────────── */

typedef struct __attribute__((packed)) {
    uint32_t magic;
    uint8_t  version;
    uint8_t  dev_count;
    uint16_t _pad;
} pds_ui_l4_hdr_t;  /* 8 bytes */

/* ── Per-device record header ──────────────────────────────────────────── */

typedef struct __attribute__((packed)) {
    uint32_t periph_id_hash;  /* FNV-1a hash of peripheral string ID */
    uint8_t  dev_type;        /* pds_ui_dev_type_t */
    uint8_t  _pad;
    uint16_t data_len;        /* bytes of device data that follow */
} pds_ui_dev_hdr_t;  /* 8 bytes */

/* ── Peripheral hardware map entry ────────────────────────────────────── */
/* Passed to pds_ui_init() so it can cross-reference peripherals to L4 records. */

typedef struct {
    uint32_t periph_id_hash;
    int8_t   pin_sda;
    int8_t   pin_scl;
    uint8_t  i2c_addr;
    uint8_t  flip;
} pds_ui_periph_map_t;

/* ── Public API ────────────────────────────────────────────────────────── */

/**
 * Parse the L4 blob and initialise all UI devices found in it.
 * If l4_blob is NULL or too small, logs a warning and returns ESP_OK (UI inactive).
 * Hardware config (pins, I2C address) is read directly from the L4 blob.
 *
 * @param l4_blob  Raw bytes from NVS "ui_params" key (may be NULL).
 * @param l4_len   Byte count of l4_blob.
 * @return ESP_OK on success or when UI is inactive; ESP_ERR_INVALID_ARG if blob is malformed.
 */
esp_err_t pds_ui_init(const uint8_t *l4_blob, size_t l4_len);

/**
 * Drive render timers for all registered UI devices.
 * Call from pds_platform_loop() on every iteration.
 */
void pds_ui_tick(void);

/* ── FNV-1a hash utility (used by blob_packer.py and firmware) ─────────── */

static inline uint32_t pds_ui_fnv1a(const char *s) {
    uint32_t h = 0x811c9dc5u;
    while (*s) { h ^= (uint8_t)*s++; h *= 0x01000193u; }
    return h;
}

#ifdef __cplusplus
}
#endif
