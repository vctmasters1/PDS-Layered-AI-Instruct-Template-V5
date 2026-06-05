/**
 * @file pds_platform_main.c
 * @brief Platform implementation of pds_platform_init() and pds_platform_loop()
 *        for the EFR32MG24 platform (Silicon Labs GSDK / Simplicity SDK).
 *
 * STATUS: STUB / PLACEHOLDER
 * ─────────────────────────────────────────────────────────────────────────────
 * This file is intentionally minimal.  Port work required before use:
 *
 *   - Replace #include guards below with the GSDK header set for your target
 *   - Implement pds_telemetry_init() equivalent using RAIL or Zigbee stack
 *   - Implement pds_device_pins_init() using EMLIB GPIO (em_gpio.h)
 *   - Implement pds_device_nvs_load_pins() using NVM3 (nvm3_default.h)
 *   - Implement pds_device_wifi_init() or remove if using 802.15.4 / BLE only
 *   - pds_process_action() must be supplied by the role directory
 *
 * Build notes:
 *   - GSDK_DIR must point to your Simplicity SDK installation
 *   - Add "emlib" and "nvm3" components to your .slcp project
 *   - FreeRTOS is optional on EFR32 — replace vTaskDelay() with
 *     sl_sleeptimer_delay_millisecond() or a bare-metal spin if not used
 * ─────────────────────────────────────────────────────────────────────────────
 */

/*
 * Uncomment when GSDK headers are available:
 *
 * #include "em_device.h"
 * #include "em_chip.h"
 * #include "em_gpio.h"
 * #include "sl_sleeptimer.h"
 * #include "nvm3_default.h"
 */

#include "pds_platform.h"
#include "pds_types.h"

/* Role-specific processing — supplied by the role directory */
// TODO PORT-EFR32: Remove pds_process_action — the pipeline engine replaces this.
// pds_platform_loop() should call pds_pipeline_engine_tick() once the following
// are ported to GSDK/EMLIB:
//   - pds_device_nvs_init()  → NVM3 (nvm3_default.h)
//   - PDS_ADC_configure()    → IADC (em_iadc.h)
//   - PDS_GPIO_configure()   → GPIO (em_gpio.h)
//   - PDS_PWM_setup_channel()→ LETIMER or WTIMER
//   - pds_device_wifi_init() → remove or replace with RAIL/BLE stack
extern pds_err_t pds_process_action(void);

/* ── pds_platform_init ────────────────────────────────────────────────────── */

pds_err_t pds_platform_init(void)
{
    /*
     * TODO: chip errata workaround
     * CHIP_Init();
     */

    /*
     * TODO: NVM3 init for persistent pin / config storage
     * nvm3_initDefault();
     */

    /*
     * TODO: GPIO + peripheral init from role pin table
     * pds_device_pins_init();
     */

    /*
     * TODO: networking / radio stack init (RAIL, Zigbee, BLE, etc.)
     * pds_device_radio_init();
     */

    return PDS_OK;
}

/* ── pds_platform_loop ────────────────────────────────────────────────────── */

pds_err_t pds_platform_loop(void)
{
    /*
     * TODO: replace with sl_sleeptimer_delay_millisecond(10) if not using
     * FreeRTOS, or keep vTaskDelay if GSDK FreeRTOS component is enabled.
     */
    return pds_process_action();
}
