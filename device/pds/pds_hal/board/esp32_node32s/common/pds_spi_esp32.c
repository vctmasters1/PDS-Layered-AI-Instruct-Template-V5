/**
 * H20-Tower SPI HAL Implementation for ESP32 (Node32S)
 * 
 * Platform-specific SPI driver for ESP32 microcontroller.
 * Uses ESP-IDF SPI driver for Serial Peripheral Interface communication.
 * Note: ESP32 has 4 SPI buses (SPI0/SPI1 for flash, SPI2/SPI3 available)
 */

// Suppress format string warnings for typedef'd types that vary by platform
#pragma GCC diagnostic ignored "-Wformat"

#include "pds_spi.h"
#include "driver/spi_master.h"
#include "esp_log.h"
#include <string.h>

static const char *TAG = "PDS_SPI_ESP32";

// SPI bus configuration storage
typedef struct {
    spi_host_device_t host;
    bool initialized;
} PDS_SPI_host_info_t;

// ESP32 has 4 SPI buses: SPI0 (flash), SPI1 (also flash), SPI2 (HSPI), SPI3 (VSPI)
// We use SPI2 and SPI3 for user applications
#define NUM_SPI_BUSES 2
static PDS_SPI_host_info_t spi_buses[NUM_SPI_BUSES] = {
    {.host = SPI2_HOST, .initialized = false},
    {.host = SPI3_HOST, .initialized = false},
};

/**
 * Initialize SPI subsystem
 */
esp_err_t PDS_SPI_init(void) {
    ESP_LOGI(TAG, "SPI subsystem initialized");
    return ESP_OK;
}

/**
 * Initialize SPI bus
 */
esp_err_t PDS_SPI_bus_init(uint8_t bus_id, uint32_t clock_hz, uint8_t mode) {
    if (bus_id >= NUM_SPI_BUSES) {
        ESP_LOGE(TAG, "Invalid SPI bus ID: %" PRIu8, bus_id);
        return ESP_ERR_INVALID_ARG;
    }

    if (spi_buses[bus_id].initialized) {
        ESP_LOGW(TAG, "SPI bus %" PRIu8 " already initialized", bus_id);
        return ESP_OK;
    }

    // Configure SPI bus
    spi_bus_config_t buscfg = {
        .mosi_io_num = -1,  // Set by caller per transaction
        .miso_io_num = -1,
        .sclk_io_num = -1,
        .quadwp_io_num = -1,
        .quadhd_io_num = -1,
        .max_transfer_sz = 4092,
    };

    esp_err_t ret = spi_bus_initialize(spi_buses[bus_id].host, &buscfg, SPI_DMA_CH_AUTO);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to initialize SPI bus %" PRIu8 ": %s", bus_id, esp_err_to_name(ret));
        return ret;
    }

    spi_buses[bus_id].initialized = true;
    ESP_LOGI(TAG, "SPI bus %" PRIu8 " initialized at %" PRIu32 "Hz, mode %" PRIu8, bus_id, clock_hz, mode);
    return ESP_OK;
}

/**
 * Add SPI device
 */
esp_err_t PDS_SPI_device_add(uint8_t bus_id, uint8_t cs_pin, uint32_t clock_hz, 
                             uint8_t mode, spi_device_handle_t* handle) {
    if (!handle) {
        return ESP_ERR_INVALID_ARG;
    }

    if (bus_id >= NUM_SPI_BUSES || !spi_buses[bus_id].initialized) {
        ESP_LOGE(TAG, "SPI bus %" PRIu8 " not initialized", bus_id);
        return ESP_ERR_INVALID_STATE;
    }

    // Configure SPI device
    spi_device_interface_config_t devcfg = {
        .mode = mode,
        .clock_speed_hz = clock_hz,
        .spics_io_num = cs_pin,
        .queue_size = 7,
    };

    esp_err_t ret = spi_bus_add_device(spi_buses[bus_id].host, &devcfg, handle);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to add SPI device on bus %" PRIu8 ": %s", bus_id, esp_err_to_name(ret));
        return ret;
    }

    ESP_LOGI(TAG, "SPI device added on bus %" PRIu8 ", CS=%" PRIu8 ", clock=%" PRIu32 "Hz",
             bus_id, cs_pin, clock_hz);
    return ESP_OK;
}

/**
 * Transmit data on SPI
 */
esp_err_t PDS_SPI_transmit(spi_device_handle_t handle, const uint8_t* data, size_t len) {
    if (!handle || !data) {
        return ESP_ERR_INVALID_ARG;
    }

    spi_transaction_t trans = {
        .tx_buffer = data,
        .length = len * 8,  // Length in bits
    };

    esp_err_t ret = spi_device_polling_transmit(handle, &trans);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "SPI transmit failed: %s", esp_err_to_name(ret));
        return ret;
    }

    return ESP_OK;
}

/**
 * Receive data from SPI
 */
esp_err_t PDS_SPI_receive(spi_device_handle_t handle, uint8_t* buffer, size_t len) {
    if (!handle || !buffer) {
        return ESP_ERR_INVALID_ARG;
    }

    spi_transaction_t trans = {
        .rx_buffer = buffer,
        .length = len * 8,  // Length in bits
    };

    esp_err_t ret = spi_device_polling_transmit(handle, &trans);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "SPI receive failed: %s", esp_err_to_name(ret));
        return ret;
    }

    return ESP_OK;
}

/**
 * Cleanup SPI subsystem
 */
esp_err_t PDS_SPI_deinit(void) {
    for (int i = 0; i < NUM_SPI_BUSES; i++) {
        if (spi_buses[i].initialized) {
            spi_bus_free(spi_buses[i].host);
            spi_buses[i].initialized = false;
        }
    }

    ESP_LOGI(TAG, "SPI subsystem deinitialized");
    return ESP_OK;
}
