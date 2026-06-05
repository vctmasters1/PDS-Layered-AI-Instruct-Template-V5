/* ads1115.h — ADS1115 16-bit I2C ADC driver
 *
 * 4-channel, 16-bit, programmable-gain I2C ADC.
 * Supports up to 4 devices (one per I2C address variant).
 *
 * Registry integration
 * ────────────────────
 * ads1115_read() and ads1115_raw_to_mv() match pds_adc_read_fn_t and
 * pds_adc_raw_to_mv_fn_t respectively, so channels can be registered
 * as external ADC backends:
 *
 *   // In pds_process_action.c (role init):
 *   ads1115_config_t cfg = {
 *       .i2c_port = 0,
 *       .i2c_addr = ADS1115_ADDR_GND,
 *       .gain     = ADS1115_GAIN_2048,
 *       .sps_code = ADS1115_SPS_128,
 *   };
 *   ads1115_init(&cfg);
 *   pds_adc_reg_register_ext(ADS1115_CHANNEL(0, 0), ads1115_read, ads1115_raw_to_mv, "ADS0");
 *
 * Channel encoding: ADS1115_CHANNEL(dev_idx, ain) = 100 + dev_idx*4 + ain
 *   dev_idx 0..3  (up to 4 ADS1115 devices)
 *   ain     0..3  (AIN0..AIN3, single-ended vs GND)
 *
 * Timing note: ads1115_read() is blocking. At 128 SPS (default) each read
 * takes ~15 ms.  At 860 SPS each read takes ~3 ms.  Use ADS1115_SPS_860 in
 * high-throughput pipelines to minimise pre-sweep latency.
 *
 * Prerequisites: the I2C bus must be installed (i2c_driver_install) before
 * calling ads1115_init(). The I2C bus is NOT installed by this driver.
 */

#ifndef ADS1115_H
#define ADS1115_H

#include "esp_err.h"
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ── I2C address variants ── */
#define ADS1115_ADDR_GND  0x48u   /* ADDR pin → GND */
#define ADS1115_ADDR_VDD  0x49u   /* ADDR pin → VDD */
#define ADS1115_ADDR_SDA  0x4Au   /* ADDR pin → SDA */
#define ADS1115_ADDR_SCL  0x4Bu   /* ADDR pin → SCL */

/* ── Channel encoding ── */
/** Encode a (device index, AIN channel) pair to a registry channel number. */
#define ADS1115_CHANNEL(dev, ain)  ((uint32_t)(100u + (uint32_t)(dev) * 4u + (uint32_t)(ain)))

/* ── Gain (PGA) settings ── */
typedef enum {
    ADS1115_GAIN_6144 = 0,  /* ±6.144 V  — 187.5 µV/LSB */
    ADS1115_GAIN_4096 = 1,  /* ±4.096 V  — 125.0 µV/LSB */
    ADS1115_GAIN_2048 = 2,  /* ±2.048 V  —  62.5 µV/LSB (default) */
    ADS1115_GAIN_1024 = 3,  /* ±1.024 V  —  31.25 µV/LSB */
    ADS1115_GAIN_0512 = 4,  /* ±0.512 V  —  15.625 µV/LSB */
    ADS1115_GAIN_0256 = 5,  /* ±0.256 V  —   7.8125 µV/LSB */
} ads1115_gain_t;

/* ── Data rate codes ── */
#define ADS1115_SPS_8    0u   /*   8 SPS — ~125 ms/conversion */
#define ADS1115_SPS_16   1u   /*  16 SPS — ~63 ms  */
#define ADS1115_SPS_32   2u   /*  32 SPS — ~31 ms  */
#define ADS1115_SPS_64   3u   /*  64 SPS — ~16 ms  */
#define ADS1115_SPS_128  4u   /* 128 SPS — ~8 ms   (default) */
#define ADS1115_SPS_250  5u   /* 250 SPS — ~4 ms   */
#define ADS1115_SPS_475  6u   /* 475 SPS — ~2 ms   */
#define ADS1115_SPS_860  7u   /* 860 SPS — ~1.2 ms (fastest) */

/* ── Device configuration ── */
typedef struct {
    int            i2c_port;   /**< ESP-IDF I2C port number (0 or 1) */
    uint8_t        i2c_addr;   /**< I2C address: ADS1115_ADDR_* */
    ads1115_gain_t gain;       /**< PGA gain setting */
    uint8_t        sps_code;   /**< Data rate: ADS1115_SPS_* */
} ads1115_config_t;

/**
 * Register one ADS1115 device.
 * The I2C bus must already be installed before calling this.
 * Up to 4 devices supported (one per address variant).
 *
 * @param cfg  Device configuration
 * @return ESP_OK or ESP_ERR_INVALID_ARG / ESP_ERR_NO_MEM
 */
esp_err_t ads1115_init(const ads1115_config_t *cfg);

/**
 * Single-shot blocking read for one channel.
 *
 * Compatible with pds_adc_read_fn_t — register as backend in pds_adc_registry:
 *   pds_adc_reg_register_ext(ADS1115_CHANNEL(0,0), ads1115_read, ads1115_raw_to_mv, "ADS0");
 *
 * @param channel  ADS1115_CHANNEL(dev_idx, ain) encoded value
 * @return 16-bit signed raw value (cast to int), or -1 on error
 */
int ads1115_read(uint32_t channel);

/**
 * Convert ADS1115 raw value to millivolts using the configured gain.
 * Compatible with pds_adc_raw_to_mv_fn_t.
 *
 * @param channel  ADS1115_CHANNEL(dev_idx, ain) encoded value
 * @param raw      16-bit signed raw value from ads1115_read()
 * @return Millivolts (integer)
 */
int ads1115_raw_to_mv(uint32_t channel, int raw);

#ifdef __cplusplus
}
#endif
#endif /* ADS1115_H */
