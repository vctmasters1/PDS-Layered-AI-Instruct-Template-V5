/**
 * pds_ui_oled.c — SSD1306 128×32 I2C OLED driver for pds_ui subsystem
 *
 * Single-buffer: framebuf[0] (512 bytes) is always written to GDDRAM pages 0–3.
 * GDDRAM is cleared to zero during init (before display-on) to avoid power-on garbage.
 * Start line is fixed at 0. No page-flip needed for 128×32 panels.
 */

#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include "esp_log.h"
#include "esp_timer.h"
#include "driver/i2c_master.h"
#include "pds_ui_oled.h"
#include "pds_ui_fonts.h"
/* Telemetry sink lookup — provided by pds_network component */
extern const float *pds_tel_sink_lookup(const char *key);

#define TAG "pds_ui_oled"

/* ── SSD1306 I2C protocol ──────────────────────────────────────────────── */

#define SSD1306_I2C_TIMEOUT_MS   50
#define SSD1306_CMD_BYTE         0x00  /* Co=0, D/C=0 */
#define SSD1306_DATA_BYTE        0x40  /* Co=0, D/C=1 */
#define SSD1306_STARTLINE(page)  (0x40 | ((page) * 8))

/* ── Context ───────────────────────────────────────────────────────────── */

typedef struct {
    pds_ui_oled_hw_t  hw;
    pds_ui_oled_elem_t screens[PDS_UI_OLED_MAX_SCREENS][PDS_UI_OLED_MAX_ELEMS];
    const float       *tel_ptrs[PDS_UI_OLED_MAX_SCREENS][PDS_UI_OLED_MAX_ELEMS];
    uint8_t           framebuf[1][PDS_UI_OLED_BUF_SIZE]; /* single framebuffer — always written to pages 0-3 */
    uint8_t           display_screen;   /* which logical screen (0 or 1) to render */
    i2c_master_bus_handle_t  i2c_bus;
    i2c_master_dev_handle_t  i2c_dev;
    int64_t           last_render_us;
    int64_t           last_cycle_us;
    bool              initialized;
} _pds_ui_oled_ctx_t;

/* ── I2C helpers ───────────────────────────────────────────────────────── */

static esp_err_t _oled_write_cmd(const _pds_ui_oled_ctx_t *ctx, uint8_t cmd)
{
    uint8_t buf[2] = { SSD1306_CMD_BYTE, cmd };
    return i2c_master_transmit(ctx->i2c_dev, buf, sizeof(buf),
                               SSD1306_I2C_TIMEOUT_MS);
}

static esp_err_t _oled_write_data(const _pds_ui_oled_ctx_t *ctx,
                                   const uint8_t *data, size_t len)
{
    /* Prepend data control byte */
    uint8_t *buf = malloc(len + 1);
    if (!buf) return ESP_ERR_NO_MEM;
    buf[0] = SSD1306_DATA_BYTE;
    memcpy(buf + 1, data, len);
    esp_err_t err = i2c_master_transmit(ctx->i2c_dev, buf, len + 1,
                                        SSD1306_I2C_TIMEOUT_MS);
    free(buf);
    return err;
}

/* ── SSD1306 initialisation sequence ──────────────────────────────────── */

static esp_err_t _oled_init_display(const _pds_ui_oled_ctx_t *ctx)
{
    const uint8_t flip = ctx->hw.flip;

    /* Commands matching SSD1306 datasheet for 128×32, 3.3V charge pump */
    const uint8_t cmds[] = {
        0xAE,        /* display off */
        0xD5, 0x80,  /* set display clock divide ratio / oscillator freq */
        0xA8, 0x1F,  /* set multiplex ratio: 32 rows - 1 = 0x1F */
        0xD3, 0x00,  /* set display offset = 0 */
        0x40,        /* set start line = 0 */
        0x8D, 0x14,  /* charge pump ON (internal VCC) */
        0x20, 0x00,  /* memory addressing mode: horizontal */
        (uint8_t)(flip ? 0xA0 : 0xA1), /* segment remap */
        (uint8_t)(flip ? 0xC0 : 0xC8), /* COM output scan direction */
        0xDA, 0x02,  /* set COM pins hardware config: sequential, no remap (for 32px) */
        0x81, 0xCF,  /* set contrast */
        0xD9, 0xF1,  /* set pre-charge period */
        0xDB, 0x40,  /* set Vcomh deselect level */
        0xA4,        /* entire display ON: resume to RAM content */
        0xA6,        /* set normal display (not inverted) */
        /* 0xAF sent after GDDRAM clear below */
    };

    for (size_t i = 0; i < sizeof(cmds); i++) {
        esp_err_t err = _oled_write_cmd(ctx, cmds[i]);
        if (err != ESP_OK) return err;
    }

    /* Clear GDDRAM pages 0-3 before display-on — avoids showing power-on garbage */
    const uint8_t col_end = PDS_UI_OLED_WIDTH - 1;
    _oled_write_cmd(ctx, 0x21); _oled_write_cmd(ctx, 0x00); _oled_write_cmd(ctx, col_end);
    _oled_write_cmd(ctx, 0x22); _oled_write_cmd(ctx, 0x00); _oled_write_cmd(ctx, PDS_UI_OLED_PAGES - 1);
    uint8_t zeros[PDS_UI_OLED_WIDTH] = {0};
    for (int p = 0; p < PDS_UI_OLED_PAGES; p++) {
        esp_err_t err = _oled_write_data(ctx, zeros, PDS_UI_OLED_WIDTH);
        if (err != ESP_OK) return err;
    }

    return _oled_write_cmd(ctx, 0xAF); /* display on */
}

/* ── Font rendering ────────────────────────────────────────────────────── */

/* Set a single pixel in the framebuffer (column-page layout) */
static void _fb_set_pixel(uint8_t *fb, int x, int y)
{
    if (x < 0 || x >= PDS_UI_OLED_WIDTH || y < 0 || y >= PDS_UI_OLED_HEIGHT) return;
    int page   = y / 8;
    int bit    = y % 8;
    int offset = page * PDS_UI_OLED_WIDTH + x;
    fb[offset] |= (1u << bit);
}

/* Blit a glyph at (x, y) into framebuffer. Returns advance width. */
static int _fb_blit_glyph(uint8_t *fb, int x, int y,
                           pds_ui_oled_font_t font, char c)
{
    if (c < 0x20 || c > 0x7E) c = '?';
    int idx = c - 0x20;
    const pds_ui_font_desc_t *desc = &PDS_UI_FONT_DESC[font];

    if (font == PDS_UI_FONT_16x16) {
        /* 16×16: blit 8×16 glyph with each column doubled */
        const uint8_t *glyph = &PDS_FONT_8x16[idx][0];
        for (int col = 0; col < 8; col++) {
            uint8_t p0 = glyph[col];     /* top page */
            uint8_t p1 = glyph[col + 8]; /* bottom page */
            for (int row = 0; row < 8; row++) {
                if (p0 & (1u << row)) {
                    _fb_set_pixel(fb, x + col * 2,     y + row);
                    _fb_set_pixel(fb, x + col * 2 + 1, y + row);
                }
                if (p1 & (1u << row)) {
                    _fb_set_pixel(fb, x + col * 2,     y + 8 + row);
                    _fb_set_pixel(fb, x + col * 2 + 1, y + 8 + row);
                }
            }
        }
        return 16;
    }

    if (font == PDS_UI_FONT_8x16) {
        const uint8_t *glyph = &PDS_FONT_8x16[idx][0];
        for (int col = 0; col < 8; col++) {
            uint8_t p0 = glyph[col];
            uint8_t p1 = glyph[col + 8];
            for (int row = 0; row < 8; row++) {
                if (p0 & (1u << row)) _fb_set_pixel(fb, x + col, y + row);
                if (p1 & (1u << row)) _fb_set_pixel(fb, x + col, y + 8 + row);
            }
        }
        return 8;
    }

    /* 6×8 and 8×8: same glyph data, 5 active columns + spacing */
    const uint8_t *glyph = &PDS_FONT_6x8[idx][0];
    int col_count = (font == PDS_UI_FONT_8x8) ? 5 : 6; /* 8×8 adds blank col at end */
    for (int col = 0; col < 5; col++) {
        uint8_t bits = glyph[col];
        for (int row = 0; row < 8; row++) {
            if (bits & (1u << row)) _fb_set_pixel(fb, x + col, y + row);
        }
    }
    (void)col_count; /* spacing col is always 0x00 — no explicit clear needed */
    return desc->w;
}

/* Render a null-terminated string, return x position after last char */
static int _fb_draw_string(uint8_t *fb, int x, int y,
                            pds_ui_oled_font_t font, const char *str)
{
    while (*str) {
        x += _fb_blit_glyph(fb, x, y, font, *str++);
        if (x >= PDS_UI_OLED_WIDTH) break;
    }
    return x;
}

/* ── Element rendering ─────────────────────────────────────────────────── */

static void _render_element(uint8_t *fb, const pds_ui_oled_elem_t *elem,
                             const float *tel_val)
{
    char text[64];

    switch (elem->type) {
        case PDS_UI_ELEM_LABEL:
            _fb_draw_string(fb, elem->x, elem->y,
                            (pds_ui_oled_font_t)elem->font, elem->prefix);
            break;

        case PDS_UI_ELEM_VALUE: {
            /* Prefix + formatted value */
            size_t plen = strnlen(elem->prefix, sizeof(elem->prefix));
            memcpy(text, elem->prefix, plen);
            if (tel_val) {
                float v = *tel_val;
                switch (elem->fmt) {
                    case PDS_UI_FMT_F2:  snprintf(text + plen, sizeof(text) - plen, "%.2f", v); break;
                    case PDS_UI_FMT_F1:  snprintf(text + plen, sizeof(text) - plen, "%.1f", v); break;
                    case PDS_UI_FMT_F0:  snprintf(text + plen, sizeof(text) - plen, "%.0f", v); break;
                    case PDS_UI_FMT_INT: snprintf(text + plen, sizeof(text) - plen, "%d", (int)v); break;
                    case PDS_UI_FMT_BOOL:snprintf(text + plen, sizeof(text) - plen, "%s", v >= 0.5f ? "ON" : "OFF"); break;
                    case PDS_UI_FMT_PCT: snprintf(text + plen, sizeof(text) - plen, "%.0f%%", v); break;
                    default:             snprintf(text + plen, sizeof(text) - plen, "%.1f", v); break;
                }
            } else {
                snprintf(text + plen, sizeof(text) - plen, "---");
            }
            _fb_draw_string(fb, elem->x, elem->y,
                            (pds_ui_oled_font_t)elem->font, text);
            break;
        }

        case PDS_UI_ELEM_BAR: {
            int bar_w = elem->width ? elem->width : (PDS_UI_OLED_WIDTH - elem->x);
            int bar_h = PDS_UI_FONT_DESC[elem->font].h;
            float pct = 0.0f;
            if (tel_val && elem->range_max > elem->range_min) {
                pct = (*tel_val - elem->range_min) / (elem->range_max - elem->range_min);
                if (pct < 0.0f) pct = 0.0f;
                if (pct > 1.0f) pct = 1.0f;
            }
            int fill = (int)(pct * bar_w);
            /* Draw filled portion */
            for (int px = 0; px < fill; px++) {
                for (int py = 0; py < bar_h; py++) {
                    _fb_set_pixel(fb, elem->x + px, elem->y + py);
                }
            }
            /* Draw outline for empty portion */
            for (int px = fill; px < bar_w; px++) {
                _fb_set_pixel(fb, elem->x + px, elem->y);
                _fb_set_pixel(fb, elem->x + px, elem->y + bar_h - 1);
            }
            /* Left/right edges */
            for (int py = 0; py < bar_h; py++) {
                _fb_set_pixel(fb, elem->x,           elem->y + py);
                _fb_set_pixel(fb, elem->x + bar_w - 1, elem->y + py);
            }
            break;
        }

        case PDS_UI_ELEM_HLINE: {
            int line_w = elem->width ? elem->width : (PDS_UI_OLED_WIDTH - elem->x);
            for (int px = 0; px < line_w; px++) {
                _fb_set_pixel(fb, elem->x + px, elem->y);
            }
            break;
        }

        case PDS_UI_ELEM_NONE:
        default:
            break;
    }
}

/* ── Render one logical screen into the back buffer, then flip ─────────── */

static void _render_screen(_pds_ui_oled_ctx_t *ctx)
{
    uint8_t *fb = ctx->framebuf[0];

    /* Clear framebuffer */
    memset(fb, 0x00, PDS_UI_OLED_BUF_SIZE);

    /* Render all elements for the current logical screen */
    uint8_t lsc = ctx->display_screen;
    for (int i = 0; i < PDS_UI_OLED_MAX_ELEMS; i++) {
        const pds_ui_oled_elem_t *elem = &ctx->screens[lsc][i];
        if (elem->type == PDS_UI_ELEM_NONE) continue;
        /* Lazy re-resolve: cp: keys are registered after pipeline build, so
         * the pointer may have been NULL at init time. Retry on each render
         * tick until it resolves (costs one strncmp per NULL slot per tick). */
        if (!ctx->tel_ptrs[lsc][i] && elem->tel_key[0] != '\0')
            ctx->tel_ptrs[lsc][i] = pds_tel_sink_lookup(elem->tel_key);
        _render_element(fb, elem, ctx->tel_ptrs[lsc][i]);
    }

    /* Write framebuffer to GDDRAM pages 0-3 (always; no double-buffer needed) */
    _oled_write_cmd(ctx, 0x21);       /* set column address */
    _oled_write_cmd(ctx, 0x00);
    _oled_write_cmd(ctx, 0x7F);
    _oled_write_cmd(ctx, 0x22);       /* set page address */
    _oled_write_cmd(ctx, 0x00);
    _oled_write_cmd(ctx, PDS_UI_OLED_PAGES - 1);

    /* Write all 512 bytes in one I2C transaction */
    _oled_write_data(ctx, fb, PDS_UI_OLED_BUF_SIZE);
}

/* ── Public API ────────────────────────────────────────────────────────── */

esp_err_t pds_ui_oled_init(const uint8_t *data, size_t data_len,
                            pds_ui_oled_handle_t *out)
{
    if (!data || data_len < sizeof(pds_ui_oled_hw_t) || !out) {
        return ESP_ERR_INVALID_ARG;
    }

    _pds_ui_oled_ctx_t *ctx = calloc(1, sizeof(_pds_ui_oled_ctx_t));
    if (!ctx) return ESP_ERR_NO_MEM;

    /* Copy hw config */
    memcpy(&ctx->hw, data, sizeof(pds_ui_oled_hw_t));

    /* Copy element data for both screens (if present) */
    const size_t elem_block = sizeof(pds_ui_oled_elem_t) * PDS_UI_OLED_MAX_ELEMS;
    for (int s = 0; s < PDS_UI_OLED_MAX_SCREENS; s++) {
        size_t offset = sizeof(pds_ui_oled_hw_t) + s * elem_block;
        if (offset + elem_block <= data_len) {
            memcpy(ctx->screens[s], data + offset, elem_block);
        }
        /* Resolve telemetry pointers */
        for (int i = 0; i < PDS_UI_OLED_MAX_ELEMS; i++) {
            const char *key = ctx->screens[s][i].tel_key;
            if (key[0] != '\0') {
                ctx->tel_ptrs[s][i] = pds_tel_sink_lookup(key);
                if (!ctx->tel_ptrs[s][i]) {
                    ESP_LOGW(TAG, "tel_key not found: %.24s", key);
                }
            }
        }
    }

    /* Initialise I2C master bus */
    i2c_master_bus_config_t bus_cfg = {
        .i2c_port     = -1,  /* auto-assign */
        .sda_io_num   = ctx->hw.pin_sda,
        .scl_io_num   = ctx->hw.pin_scl,
        .clk_source   = I2C_CLK_SRC_DEFAULT,
        .glitch_ignore_cnt = 7,
        .flags.enable_internal_pullup = true,
    };
    esp_err_t err = i2c_new_master_bus(&bus_cfg, &ctx->i2c_bus);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "i2c bus init failed: %s", esp_err_to_name(err));
        free(ctx);
        return err;
    }

    i2c_device_config_t dev_cfg = {
        .dev_addr_length = I2C_ADDR_BIT_LEN_7,
        .device_address  = ctx->hw.i2c_addr,
        .scl_speed_hz    = 400000,
    };
    err = i2c_master_bus_add_device(ctx->i2c_bus, &dev_cfg, &ctx->i2c_dev);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "i2c device add failed: %s", esp_err_to_name(err));
        i2c_del_master_bus(ctx->i2c_bus);
        free(ctx);
        return err;
    }

    /* Send SSD1306 init sequence */
    err = _oled_init_display(ctx);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "SSD1306 init sequence failed: %s", esp_err_to_name(err));
        i2c_master_bus_rm_device(ctx->i2c_dev);
        i2c_del_master_bus(ctx->i2c_bus);
        free(ctx);
        return err;
    }

    ctx->display_screen = 0;
    ctx->last_render_us = esp_timer_get_time();
    ctx->last_cycle_us  = ctx->last_render_us;
    ctx->initialized    = true;

    *out = ctx;
    ESP_LOGI(TAG, "OLED SSD1306 @ 0x%02X ready (SDA=%d SCL=%d)",
             ctx->hw.i2c_addr, ctx->hw.pin_sda, ctx->hw.pin_scl);
    return ESP_OK;
}

void pds_ui_oled_tick(pds_ui_oled_handle_t handle)
{
    _pds_ui_oled_ctx_t *ctx = (_pds_ui_oled_ctx_t *)handle;
    if (!ctx || !ctx->initialized) return;

    int64_t now_us = esp_timer_get_time();
    uint16_t refresh_ms = ctx->hw.refresh_ms ? ctx->hw.refresh_ms : 250;

    /* Screen cycling */
    if (ctx->hw.cycle_ms > 0) {
        int64_t cycle_elapsed = (now_us - ctx->last_cycle_us) / 1000;
        if (cycle_elapsed >= ctx->hw.cycle_ms) {
            ctx->display_screen = 1 - ctx->display_screen;
            ctx->last_cycle_us  = now_us;
        }
    }

    /* Render on refresh interval */
    int64_t render_elapsed = (now_us - ctx->last_render_us) / 1000;
    if (render_elapsed >= refresh_ms) {
        _render_screen(ctx);
        ctx->last_render_us = now_us;
    }
}
