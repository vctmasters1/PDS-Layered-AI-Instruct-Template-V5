/**
 * H20-Tower SPI HAL Implementation for ESP32-C3 (HWVER_001)
 * 
 * Platform-specific SPI driver for ESP32-C3 microcontroller.
 * Uses ESP-IDF SPI Master driver.
 */

// Suppress format string warnings for typedef'd types that vary by platform
#pragma GCC diagnostic ignored "-Wformat"

#include "pds_spi.h"
#include "driver/spi_master.h"
#include "esp_log.h"
#include <inttypes.h>
#include <string.h>

static const char *TAG = "pds_SPI_ESP32C3";

// SPI bus handles (ESP32-C3 has SPI1 and SPI2, SPI0 is reserved for flash)
static spi_host_device_t spi_buses[2] = {
    SPI1_HOST,
    SPI2_HOST,
};

static spi_device_handle_t spi_devices[8] = {NULL};  // Support up to 8 SPI devices
static uint8_t spi_device_count = 0;

/**
 * Initialize SPI bus
 */
esp_err_t pds_spi_bus_init(pds_spi_bus_t bus, uint32_t clk_pin, uint32_t mosi_pin, uint32_t miso_pin) {
    if (bus >= 2) {
        ESP_LOGE(TAG, "Invalid SPI bus: %d", bus);
        return ESP_ERR_INVALID_ARG;
    }

    spi_bus_config_t bus_config = {
        .mosi_io_num = mosi_pin,
        .miso_io_num = miso_pin,
        .sclk_io_num = clk_pin,
        .quadwp_io_num = -1,
        .quadhd_io_num = -1,
        .max_transfer_sz = 4094,
    };

    esp_err_t ret = spi_bus_initialize(spi_buses[bus], &bus_config, SPI_DMA_CH_AUTO);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to initialize SPI bus %d: %s", bus, esp_err_to_name(ret));
        return ret;
    }

    ESP_LOGI(TAG, "Initialized SPI bus %d (CLK=%" PRIu32 ", MOSI=%" PRIu32 ", MISO=%" PRIu32 ")", bus, clk_pin, mosi_pin, miso_pin);
    return ESP_OK;
}

/**
 * Add SPI device to bus
 */
esp_err_t pds_spi_device_add(pds_spi_bus_t bus, const pds_spi_device_config_t *config,
                             pds_spi_device_handle_t *handle) {
    if (bus >= 3) {
        ESP_LOGE(TAG, "Invalid SPI bus: %d", bus);
        return ESP_ERR_INVALID_ARG;
    }

    if (config == NULL || handle == NULL) {
        ESP_LOGE(TAG, "Invalid arguments");
        return ESP_ERR_INVALID_ARG;
    }

    if (spi_device_count >= 8) {
        ESP_LOGE(TAG, "Maximum number of SPI devices reached");
        return ESP_ERR_NO_MEM;
    }

    // Convert SPI mode
    int mode = config->mode & 0x03;  // Mode 0-3

    spi_device_interface_config_t device_config = {
        .mode = mode,
        .clock_speed_hz = config->clock_speed_hz,
        .spics_io_num = config->cs_pin,
        .queue_size = config->queue_size > 0 ? config->queue_size : 7,
    };

    spi_device_handle_t device_handle = NULL;
    esp_err_t ret = spi_bus_add_device(spi_buses[bus], &device_config, &device_handle);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to add SPI device: %s", esp_err_to_name(ret));
        return ret;
    }

    spi_devices[spi_device_count] = device_handle;
    *handle = (pds_spi_device_handle_t)(uintptr_t)spi_device_count;
    spi_device_count++;

    ESP_LOGD(TAG, "Added SPI device (speed=%" PRIu32 " Hz, mode=%d)", config->clock_speed_hz, mode);
    return ESP_OK;
}

/**
 * Remove SPI device from bus
 */
esp_err_t pds_spi_device_remove(pds_spi_device_handle_t handle) {
    uintptr_t dev_idx = (uintptr_t)handle;
    if (dev_idx >= spi_device_count) {
        ESP_LOGE(TAG, "Invalid SPI device handle");
        return ESP_ERR_INVALID_ARG;
    }

    esp_err_t ret = spi_bus_remove_device(spi_devices[dev_idx]);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to remove SPI device: %s", esp_err_to_name(ret));
        return ret;
    }

    spi_devices[dev_idx] = NULL;
    ESP_LOGD(TAG, "Removed SPI device");
    return ESP_OK;
}

/**
 * Transmit data over SPI
 */
esp_err_t pds_spi_transmit(pds_spi_device_handle_t handle, const uint8_t *tx_data,
                           uint32_t tx_len, uint8_t *rx_data, uint32_t rx_len) {
    uintptr_t dev_idx = (uintptr_t)handle;
    if (dev_idx >= spi_device_count || spi_devices[dev_idx] == NULL) {
        ESP_LOGE(TAG, "Invalid SPI device handle");
        return ESP_ERR_INVALID_ARG;
    }

    if (tx_data == NULL || tx_len == 0) {
        ESP_LOGE(TAG, "Invalid transmit data");
        return ESP_ERR_INVALID_ARG;
    }

    spi_transaction_t trans = {
        .tx_buffer = tx_data,
        .rx_buffer = rx_data,
        .length = tx_len * 8,
        .rxlength = rx_len > 0 ? rx_len * 8 : 0,
    };

    esp_err_t ret = spi_device_polling_transmit(spi_devices[dev_idx], &trans);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "SPI transmit failed: %s", esp_err_to_name(ret));
        return ret;
    }

    return ESP_OK;
}

/**
 * Receive data over SPI (transmit zeros)
 */
esp_err_t pds_spi_receive(pds_spi_device_handle_t handle, uint8_t *rx_data, uint32_t rx_len) {
    uintptr_t dev_idx = (uintptr_t)handle;
    if (dev_idx >= spi_device_count || spi_devices[dev_idx] == NULL) {
        ESP_LOGE(TAG, "Invalid SPI device handle");
        return ESP_ERR_INVALID_ARG;
    }

    if (rx_data == NULL || rx_len == 0) {
        ESP_LOGE(TAG, "Invalid receive buffer");
        return ESP_ERR_INVALID_ARG;
    }

    // Create a zero-filled transmit buffer for receive-only operations
    uint8_t *tx_zeros = (uint8_t *)malloc(rx_len);
    if (tx_zeros == NULL) {
        ESP_LOGE(TAG, "Failed to allocate transmit buffer");
        return ESP_ERR_NO_MEM;
    }

    memset(tx_zeros, 0, rx_len);

    spi_transaction_t trans = {
        .tx_buffer = tx_zeros,
        .rx_buffer = rx_data,
        .length = rx_len * 8,
    };

    esp_err_t ret = spi_device_polling_transmit(spi_devices[dev_idx], &trans);
    free(tx_zeros);

    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "SPI receive failed: %s", esp_err_to_name(ret));
        return ret;
    }

    return ESP_OK;
}

/**
 * Write register via SPI
 */
esp_err_t pds_spi_write_register(pds_spi_device_handle_t handle, uint8_t reg,
                                 const uint8_t *data, uint32_t data_len) {
    uintptr_t dev_idx = (uintptr_t)handle;
    if (dev_idx >= spi_device_count || spi_devices[dev_idx] == NULL) {
        ESP_LOGE(TAG, "Invalid SPI device handle");
        return ESP_ERR_INVALID_ARG;
    }

    if (data == NULL || data_len == 0) {
        ESP_LOGE(TAG, "Invalid data");
        return ESP_ERR_INVALID_ARG;
    }

    // Create buffer: [register_address | data]
    uint8_t *tx_buffer = (uint8_t *)malloc(1 + data_len);
    if (tx_buffer == NULL) {
        ESP_LOGE(TAG, "Failed to allocate transmit buffer");
        return ESP_ERR_NO_MEM;
    }

    tx_buffer[0] = reg;
    memcpy(&tx_buffer[1], data, data_len);

    spi_transaction_t trans = {
        .tx_buffer = tx_buffer,
        .length = (1 + data_len) * 8,
    };

    esp_err_t ret = spi_device_polling_transmit(spi_devices[dev_idx], &trans);
    free(tx_buffer);

    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "SPI register write failed: %s", esp_err_to_name(ret));
        return ret;
    }

    ESP_LOGD(TAG, "Wrote %" PRIu32 " bytes to register 0x%02x", data_len, reg);
    return ESP_OK;
}

/**
 * Read register via SPI
 */
esp_err_t pds_spi_read_register(pds_spi_device_handle_t handle, uint8_t reg,
                                uint8_t *data, uint32_t data_len) {
    uintptr_t dev_idx = (uintptr_t)handle;
    if (dev_idx >= spi_device_count || spi_devices[dev_idx] == NULL) {
        ESP_LOGE(TAG, "Invalid SPI device handle");
        return ESP_ERR_INVALID_ARG;
    }

    if (data == NULL || data_len == 0) {
        ESP_LOGE(TAG, "Invalid data buffer");
        return ESP_ERR_INVALID_ARG;
    }

    // Create transmit buffer with register address
    uint8_t *tx_buffer = (uint8_t *)malloc(1 + data_len);
    if (tx_buffer == NULL) {
        ESP_LOGE(TAG, "Failed to allocate transmit buffer");
        return ESP_ERR_NO_MEM;
    }

    tx_buffer[0] = reg | 0x80;  // Set read bit (MSB typically indicates read)
    memset(&tx_buffer[1], 0, data_len);

    // Create receive buffer
    uint8_t *rx_buffer = (uint8_t *)malloc(1 + data_len);
    if (rx_buffer == NULL) {
        free(tx_buffer);
        ESP_LOGE(TAG, "Failed to allocate receive buffer");
        return ESP_ERR_NO_MEM;
    }

    spi_transaction_t trans = {
        .tx_buffer = tx_buffer,
        .rx_buffer = rx_buffer,
        .length = (1 + data_len) * 8,
    };

    esp_err_t ret = spi_device_polling_transmit(spi_devices[dev_idx], &trans);

    if (ret == ESP_OK) {
        // Skip first byte (register address echo), copy data
        memcpy(data, &rx_buffer[1], data_len);
    } else {
        ESP_LOGE(TAG, "SPI register read failed: %s", esp_err_to_name(ret));
    }

    free(tx_buffer);
    free(rx_buffer);

    ESP_LOGD(TAG, "Read %" PRIu32 " bytes from register 0x%02x", data_len, reg);
    return ret;
}

