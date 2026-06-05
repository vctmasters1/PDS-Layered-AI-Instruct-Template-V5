#include "esp_log.h"
#include "nvs_flash.h"
#include "esp_bt.h"
#include "esp_blufi_api.h"
#include "driver/twai.h"
#include "esp_gatt_common_api.h"
#include "esp_gap_ble_api.h"

#define TAG "OBD_BLE"
#define OBD_SERVICE_UUID 0x1810  // Custom service UUID
#define OBD_CHAR_UUID 0x2A00      // Characteristic for raw OBD data

static uint16_t obd_handle_table[1];  // Handle for characteristic

static esp_gatt_char_prop_t obd_property = ESP_GATT_CHAR_PROP_BIT_READ | ESP_GATT_CHAR_PROP_BIT_NOTIFY;

// BLE GAP event handler
static void gap_event_handler(esp_gap_ble_cb_event_t event, esp_ble_gap_cb_param_t *param) {
    // Handle advertising, connections, etc. (standard)
}

// BLE GATT event handler
static void gatts_event_handler(esp_gatts_cb_event_t event, esp_gatt_if_t gatts_if, esp_ble_gatts_cb_param_t *param) {
    switch (event) {
        case ESP_GATTS_REG_EVT:
            esp_ble_gatts_create_srv(gatts_if, &obd_service_uuid, 1, ESP_GATT_AUTO_RSP);
            break;
        case ESP_GATTS_CREATE_EVT:
            esp_ble_gatts_add_char(param->create.service_id, &obd_char_uuid, obd_property, ESP_GATT_PERM_READ, NULL);
            break;
        case ESP_GATTS_READ_EVT:
            // Send raw OBD data when read
            char raw_obd[32];
            read_raw_obd(raw_obd, sizeof(raw_obd));
            esp_ble_gatts_send_response(gatts_if, param->read.conn_id, param->read.trans_id, ESP_GATT_OK, (esp_gatt_value_t*)&raw_obd);
            break;
        // Handle notify for real-time
    }
}

// Initialize BLE
void ble_init() {
    esp_bt_controller_config_t bt_cfg = BT_CONTROLLER_INIT_CONFIG_DEFAULT();
    esp_bt_controller_init(&bt_cfg);
    esp_bt_controller_enable(ESP_BT_MODE_BLE);
    esp_bluedroid_init();
    esp_bluedroid_enable();
    esp_ble_gatts_register_callback(gatts_event_handler);
    esp_ble_gap_register_callback(gap_event_handler);
    esp_ble_gatts_app_register(0);
}