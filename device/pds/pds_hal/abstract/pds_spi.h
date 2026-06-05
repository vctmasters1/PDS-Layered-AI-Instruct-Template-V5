#ifndef PDS_PDS_SPI_H
#define PDS_PDS_SPI_H

#include <stdint.h>
#include "esp_err.h"

/**
 * H20-Tower SPI Abstraction Layer
 * 
 * Platform-agnostic interface for SPI communication.
 * Implementations are platform-specific in platform/{chip}/{hwver}/
 */

// SPI bus identifiers
typedef enum {
    pds_SPI_BUS_1 = 0,
    pds_SPI_BUS_2 = 1,
    pds_SPI_BUS_3 = 2,
} pds_spi_bus_t;

// SPI mode (clock polarity and phase)
typedef enum {
    pds_SPI_MODE_0 = 0,  // CPOL=0, CPHA=0
    pds_SPI_MODE_1 = 1,  // CPOL=0, CPHA=1
    pds_SPI_MODE_2 = 2,  // CPOL=1, CPHA=0
    pds_SPI_MODE_3 = 3,  // CPOL=1, CPHA=1
} pds_spi_mode_t;

// SPI device configuration
typedef struct {
    uint32_t clock_speed_hz;    // Clock frequency in Hz
    pds_spi_mode_t mode;        // SPI mode (0-3)
    uint32_t cs_pin;            // Chip select GPIO pin
    uint32_t spics_io_num;      // CS signal level (or -1 for no CS)
    uint8_t queue_size;         // Transaction queue size
} pds_spi_device_config_t;

// SPI device handle
typedef void* pds_spi_device_handle_t;

/**
 * Initialize SPI bus
 * @param bus SPI bus identifier
 * @param clk_pin Clock GPIO pin
 * @param mosi_pin Master-Out-Slave-In GPIO pin
 * @param miso_pin Master-In-Slave-Out GPIO pin
 * @return ESP_OK on success
 */
esp_err_t pds_spi_bus_init(pds_spi_bus_t bus, uint32_t clk_pin, uint32_t mosi_pin, uint32_t miso_pin);

/**
 * Add SPI device to bus
 * @param bus SPI bus identifier
 * @param config Device configuration
 * @param handle Output device handle
 * @return ESP_OK on success
 */
esp_err_t pds_spi_device_add(pds_spi_bus_t bus, const pds_spi_device_config_t *config, 
                             pds_spi_device_handle_t *handle);

/**
 * Remove SPI device from bus
 * @param handle Device handle from pds_spi_device_add
 * @return ESP_OK on success
 */
esp_err_t pds_spi_device_remove(pds_spi_device_handle_t handle);

/**
 * Transmit data over SPI
 * @param handle Device handle
 * @param tx_data Data to transmit
 * @param tx_len Length of data in bytes
 * @param rx_data Receive buffer (optional, can be NULL)
 * @param rx_len Length of receive buffer
 * @return ESP_OK on success
 */
esp_err_t pds_spi_transmit(pds_spi_device_handle_t handle, const uint8_t *tx_data, 
                           uint32_t tx_len, uint8_t *rx_data, uint32_t rx_len);

/**
 * Receive data over SPI (transmit zeros)
 * @param handle Device handle
 * @param rx_data Receive buffer
 * @param rx_len Length to receive in bytes
 * @return ESP_OK on success
 */
esp_err_t pds_spi_receive(pds_spi_device_handle_t handle, uint8_t *rx_data, uint32_t rx_len);

/**
 * Write register via SPI
 * @param handle Device handle
 * @param reg Register address
 * @param data Data to write
 * @param data_len Length of data in bytes
 * @return ESP_OK on success
 */
esp_err_t pds_spi_write_register(pds_spi_device_handle_t handle, uint8_t reg, 
                                 const uint8_t *data, uint32_t data_len);

/**
 * Read register via SPI
 * @param handle Device handle
 * @param reg Register address
 * @param data Receive buffer
 * @param data_len Length to read in bytes
 * @return ESP_OK on success
 */
esp_err_t pds_spi_read_register(pds_spi_device_handle_t handle, uint8_t reg, 
                                uint8_t *data, uint32_t data_len);

#endif // pds_SPI_H


