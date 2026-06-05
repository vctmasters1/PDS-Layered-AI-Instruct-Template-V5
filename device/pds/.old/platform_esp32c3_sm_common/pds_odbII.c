

// Initialize TWAI (CAN bus for OBD-II)
void pds_odbii_twai_init() {
    twai_general_config_t g_config = TWAI_GENERAL_CONFIG_DEFAULT(GPIO_NUM_4, GPIO_NUM_5, TWAI_MODE_NORMAL);
    twai_timing_config_t t_config = TWAI_TIMING_CONFIG_500KBITS();
    twai_filter_config_t f_config = TWAI_FILTER_CONFIG_ACCEPT_ALL();
    twai_driver_install(&g_config, &t_config, &f_config);
    twai_start();
}

// Read raw OBD-II (example for RPM PID 0x010C)
void pds_odbii_read_raw(char *raw, size_t size) {
    twai_message_t tx_msg = {.identifier = 0x7DF, .data_length_code = 8, .data = {0x02, 0x01, 0x0C, 0x00, 0x00, 0x00, 0x00, 0x00}};  // PID query
    twai_transmit(&tx_msg, pdMS_TO_TICKS(1000));
    
    twai_message_t rx_msg;
    if (twai_receive(&rx_msg, pdMS_TO_TICKS(1000)) == ESP_OK) {
        snprintf(raw, size, "%02X %02X %02X %02X", rx_msg.data[3], rx_msg.data[4], rx_msg.data[5], rx_msg.data[6]);  // Raw hex from response
        ESP_LOGI(TAG, "Raw OBD: %s", raw);
    }
}