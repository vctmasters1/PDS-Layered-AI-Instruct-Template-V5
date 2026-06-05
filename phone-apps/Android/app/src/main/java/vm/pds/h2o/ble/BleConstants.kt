package vm.pds.h2o.ble

import java.util.UUID

object BleConstants {
    // The base UUID for your custom service
    private const val BASE_UUID = "-0000-1000-8000-00805f9b34fb"

    // The custom service for provisioning the H2O-Tower device
    val PROVISIONING_SERVICE_UUID: UUID = UUID.fromString("0000181c$BASE_UUID")

    // Characteristic for writing the Wi-Fi SSID
    val SSID_CHARACTERISTIC_UUID: UUID = UUID.fromString("00002a3d$BASE_UUID")

    // Characteristic for writing the Wi-Fi Password
    val PASSWORD_CHARACTERISTIC_UUID: UUID = UUID.fromString("00002a3e$BASE_UUID")

    // Characteristic to trigger the device to connect to the configured Wi-Fi
    val CONNECT_CHARACTERISTIC_UUID: UUID = UUID.fromString("00002a3f$BASE_UUID")
}
