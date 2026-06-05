/* ads1115.c — ADS1115 16-bit I2C ADC driver
 * See include/ads1115.h for API contract and registry integration notes.
 */

#include "ads1115.h"
#include "driver/i2c.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include <string.h>

static const char *TAG = "ads1115";

#define ADS1115_REG_CONVERSION  0x00u
#define ADS1115_REG_CONFIG      0x01u
#define ADS1115_MAX_DEVICES     4u
#define ADS1115_I2C_TIMEOUT_MS  50u

/* µV per LSB for each gain setting (nV stored as uint32_t to keep integer maths). */
static const uint32_t s_lsb_nv[6] = {
    187500u,  /* GAIN_6144: 187.5 µV */
    125000u,  /* GAIN_4096: 125.0 µV */
     62500u,  /* GAIN_2048:  62.5 µV (default) */
     31250u,  /* GAIN_1024:  31.25 µV */
     15625u,  /* GAIN_0512:  15.625 µV */
      7813u,  /* GAIN_0256:   7.8125 µV ≈ 7813 nV */
};

/* Conversion time in ms per SPS code (2× period + 2 ms margin). */
static const uint16_t s_conv_ms[8] = {
    252u,  /* SPS_8:   2*125 + 2 */
    127u,  /* SPS_16:  2*63  + 1 */
     64u,  /* SPS_32:  2*31  + 2 */
     33u,  /* SPS_64:  2*16  + 1 */
     18u,  /* SPS_128: 2*8   + 2 */
     10u,  /* SPS_250: 2*4   + 2 */
      6u,  /* SPS_475: 2*2   + 2 */
      4u,  /* SPS_860: 2*1   + 2 */
};

static ads1115_config_t s_devices[ADS1115_MAX_DEVICES];
static uint8_t          s_count = 0;

/* ── Internal helpers ───────────────────────────────────────────────────── */

static uint8_t _dev_idx(uint32_t channel) { return (uint8_t)((channel - 100u) / 4u); }
static uint8_t _ain(uint32_t channel)     { return (uint8_t)((channel - 100u) % 4u); }

static esp_err_t _write_config(const ads1115_config_t *d, uint8_t ain)
{
    /* Build 16-bit config: OS=1 (start), MUX=1xx (single-ended), PGA, MODE=1 (single-shot), DR */
    uint8_t mux = (uint8_t)(0x04u + ain);        /* 0b100=AIN0 ... 0b111=AIN3 */
    uint8_t pga = (uint8_t)((unsigned)d->gain & 0x07u);
    uint8_t dr  = (uint8_t)(d->sps_code & 0x07u);

    uint16_t cfg = (uint16_t)(
        (1u    << 15) |   /* OS: start single-shot conversion */
        (mux   << 12) |   /* MUX: single-ended AINx vs GND */
        (pga   <<  9) |   /* PGA: gain */
        (1u    <<  8) |   /* MODE: single-shot */
        (dr    <<  5) |   /* DR: data rate */
        0x0003u           /* COMP_QUE: disable comparator */
    );

    uint8_t buf[3] = {
        ADS1115_REG_CONFIG,
        (uint8_t)(cfg >> 8),
        (uint8_t)(cfg & 0xFFu),
    };

    i2c_cmd_handle_t cmd = i2c_cmd_link_create();
    i2c_master_start(cmd);
    i2c_master_write_byte(cmd, (uint8_t)((d->i2c_addr << 1) | I2C_MASTER_WRITE), true);
    i2c_master_write(cmd, buf, sizeof(buf), true);
    i2c_master_stop(cmd);
    esp_err_t ret = i2c_master_cmd_begin(d->i2c_port, cmd,
                                          pdMS_TO_TICKS(ADS1115_I2C_TIMEOUT_MS));
    i2c_cmd_link_delete(cmd);
    return ret;
}

static esp_err_t _read_conversion(const ads1115_config_t *d, int16_t *out)
{
    /* Point to conversion register */
    uint8_t reg = ADS1115_REG_CONVERSION;
    i2c_cmd_handle_t cmd = i2c_cmd_link_create();
    i2c_master_start(cmd);
    i2c_master_write_byte(cmd, (uint8_t)((d->i2c_addr << 1) | I2C_MASTER_WRITE), true);
    i2c_master_write_byte(cmd, reg, true);
    i2c_master_stop(cmd);
    esp_err_t ret = i2c_master_cmd_begin(d->i2c_port, cmd,
                                          pdMS_TO_TICKS(ADS1115_I2C_TIMEOUT_MS));
    i2c_cmd_link_delete(cmd);
    if (ret != ESP_OK) return ret;

    /* Read 2 bytes MSB-first */
    uint8_t buf[2] = {0};
    cmd = i2c_cmd_link_create();
    i2c_master_start(cmd);
    i2c_master_write_byte(cmd, (uint8_t)((d->i2c_addr << 1) | I2C_MASTER_READ), true);
    i2c_master_read(cmd, buf, sizeof(buf), I2C_MASTER_LAST_NACK);
    i2c_master_stop(cmd);
    ret = i2c_master_cmd_begin(d->i2c_port, cmd,
                                pdMS_TO_TICKS(ADS1115_I2C_TIMEOUT_MS));
    i2c_cmd_link_delete(cmd);
    if (ret != ESP_OK) return ret;

    *out = (int16_t)(((uint16_t)buf[0] << 8) | buf[1]);
    return ESP_OK;
}

/* ── Public API ─────────────────────────────────────────────────────────── */

esp_err_t ads1115_init(const ads1115_config_t *cfg)
{
    if (!cfg) return ESP_ERR_INVALID_ARG;
    if (s_count >= ADS1115_MAX_DEVICES) {
        ESP_LOGE(TAG, "Max %u devices reached", ADS1115_MAX_DEVICES);
        return ESP_ERR_NO_MEM;
    }
    s_devices[s_count++] = *cfg;
    ESP_LOGI(TAG, "ADS1115 dev%u registered: addr=0x%02X port=%d gain=%u sps=%u",
             s_count - 1u, cfg->i2c_addr, cfg->i2c_port,
             (unsigned)cfg->gain, (unsigned)cfg->sps_code);
    return ESP_OK;
}

int ads1115_read(uint32_t channel)
{
    if (channel < 100u) {
        ESP_LOGE(TAG, "Invalid channel %u — use ADS1115_CHANNEL(dev, ain)", (unsigned)channel);
        return -1;
    }
    uint8_t dev_idx = _dev_idx(channel);
    uint8_t ain     = _ain(channel);

    if (dev_idx >= s_count || ain > 3u) {
        ESP_LOGE(TAG, "Channel %u out of range (dev=%u registered=%u)",
                 (unsigned)channel, dev_idx, s_count);
        return -1;
    }

    const ads1115_config_t *d = &s_devices[dev_idx];

    /* Start single-shot conversion */
    esp_err_t ret = _write_config(d, ain);
    if (ret != ESP_OK) {
        ESP_LOGW(TAG, "Write config failed on dev%u: %s", dev_idx, esp_err_to_name(ret));
        return -1;
    }

    /* Wait for conversion — time-based to avoid blocking I2C polling loop */
    uint8_t sps_idx = (d->sps_code < 8u) ? d->sps_code : ADS1115_SPS_128;
    vTaskDelay(pdMS_TO_TICKS(s_conv_ms[sps_idx]));

    int16_t raw = 0;
    ret = _read_conversion(d, &raw);
    if (ret != ESP_OK) {
        ESP_LOGW(TAG, "Read conversion failed on dev%u: %s", dev_idx, esp_err_to_name(ret));
        return -1;
    }

    return (int)raw;
}

int ads1115_raw_to_mv(uint32_t channel, int raw)
{
    if (channel < 100u) return raw;
    uint8_t dev_idx = _dev_idx(channel);
    if (dev_idx >= s_count) return raw;

    unsigned gain_idx = (unsigned)s_devices[dev_idx].gain;
    if (gain_idx >= 6u) gain_idx = (unsigned)ADS1115_GAIN_2048;

    /* mV = (int64_t)raw * lsb_nV / 1,000,000
     * raw range: -32768..32767 (int16_t cast to int)
     * lsb_nv max: 187500 nV
     * max product: 32767 * 187500 = 6,143,812,500 — fits in int64_t  */
    int64_t mv = ((int64_t)(int16_t)raw * (int64_t)s_lsb_nv[gain_idx]) / 1000000LL;
    return (int)mv;
}
