#pragma once
/**
 * pds_ui_oled.h — SSD1306 I2C OLED display driver for pds_ui subsystem
 *
 * One driver, N instances. Each OLED gets its own heap-allocated context.
 * Binary format of device data: Device/pds/pds_ui/AI-INSTRUCT.md §SSD1306
 */

#include <stddef.h>
#include <stdint.h>
#include "esp_err.h"
#include "pds_ui.h"

#ifdef __cplusplus
extern "C" {
#endif

/* ── Display geometry ──────────────────────────────────────────────────── */

#define PDS_UI_OLED_WIDTH    128
#define PDS_UI_OLED_HEIGHT   32
#define PDS_UI_OLED_PAGES    (PDS_UI_OLED_HEIGHT / 8)   /* 4 pages */
#define PDS_UI_OLED_BUF_SIZE (PDS_UI_OLED_WIDTH * PDS_UI_OLED_PAGES)  /* 512 bytes */
#define PDS_UI_OLED_MAX_ELEMS  8   /* elements per screen */
#define PDS_UI_OLED_MAX_SCREENS 2  /* screen A and screen B */

/* ── Element types ─────────────────────────────────────────────────────── */

typedef enum {
    PDS_UI_ELEM_NONE  = 0,
    PDS_UI_ELEM_LABEL = 1,  /* static text (prefix only) */
    PDS_UI_ELEM_VALUE = 2,  /* telemetry value with optional prefix and format */
    PDS_UI_ELEM_BAR   = 3,  /* progress bar scaled to [range_min, range_max] */
    PDS_UI_ELEM_HLINE = 4,  /* horizontal rule (y=row, x=start, width=len) */
} pds_ui_oled_elem_type_t;

/* ── Font IDs ──────────────────────────────────────────────────────────── */

typedef enum {
    PDS_UI_FONT_6x8   = 0,  /* 21 chars/row × 4 rows on 128×32 */
    PDS_UI_FONT_8x8   = 1,  /* 16 chars/row × 4 rows */
    PDS_UI_FONT_8x16  = 2,  /* 16 chars/row × 2 rows */
    PDS_UI_FONT_16x16 = 3,  /*  8 chars/row × 2 rows */
} pds_ui_oled_font_t;

/* ── Value format codes ─────────────────────────────────────────────────── */

typedef enum {
    PDS_UI_FMT_F2   = 0,  /* %.2f */
    PDS_UI_FMT_F1   = 1,  /* %.1f */
    PDS_UI_FMT_F0   = 2,  /* %.0f */
    PDS_UI_FMT_INT  = 3,  /* %d   (cast to int) */
    PDS_UI_FMT_BOOL = 4,  /* "ON" / "OFF" */
    PDS_UI_FMT_PCT  = 5,  /* "%.0f%%" */
} pds_ui_oled_fmt_t;

/* ── Element struct (48 bytes, naturally aligned) ──────────────────────── */

typedef struct {
    uint8_t  type;         /* pds_ui_oled_elem_type_t */
    uint8_t  x;            /* pixel column 0–127 */
    uint8_t  y;            /* pixel row    0–31  */
    uint8_t  font;         /* pds_ui_oled_font_t */
    uint8_t  fmt;          /* pds_ui_oled_fmt_t (VALUE/BAR) */
    uint8_t  width;        /* BAR: pixel width; 0 = full remaining width */
    uint8_t  _pad[2];
    float    range_min;    /* BAR: value that maps to 0% */
    float    range_max;    /* BAR: value that maps to 100% */
    char     prefix[8];    /* LABEL/VALUE: static text before value (null-terminated) */
    char     tel_key[24];  /* telemetry sink key e.g. "periph:4:velocity_rpm" */
} pds_ui_oled_elem_t;  /* 48 bytes */

/* ── OLED hardware config (first 8 bytes of device data) ──────────────── */

typedef struct __attribute__((packed)) {
    uint8_t  i2c_addr;    /* 0x3C or 0x3D */
    int8_t   pin_sda;
    int8_t   pin_scl;
    uint8_t  flip;        /* 1 = rotate 180° */
    uint16_t refresh_ms;  /* render interval */
    uint16_t cycle_ms;    /* screen A↔B cycle interval; 0 = no cycling */
} pds_ui_oled_hw_t;  /* 8 bytes */

/* ── Opaque handle ─────────────────────────────────────────────────────── */

typedef void *pds_ui_oled_handle_t;

/* ── Public API ────────────────────────────────────────────────────────── */

/**
 * Initialise one OLED instance from raw device-data bytes (the payload after
 * pds_ui_dev_hdr_t in the L4 blob).
 *
 * @param data      Pointer to pds_ui_oled_hw_t followed by screens[][] elements.
 * @param data_len  Byte count (must be >= sizeof(pds_ui_oled_hw_t)).
 * @param out       Receives the allocated handle on success.
 */
esp_err_t pds_ui_oled_init(const uint8_t *data, size_t data_len,
                            pds_ui_oled_handle_t *out);

/**
 * Drive the render timer for one OLED instance. Call from pds_ui_tick().
 */
void pds_ui_oled_tick(pds_ui_oled_handle_t handle);

#ifdef __cplusplus
}
#endif
