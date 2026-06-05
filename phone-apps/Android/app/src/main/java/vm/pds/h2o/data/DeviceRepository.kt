package vm.pds.h2o.data

import android.content.Context
import android.content.SharedPreferences
import com.google.gson.Gson
import vm.pds.h2o.automation.datamodels.DeviceAutomation

class DeviceRepository(context: Context) {

    private val devicesPrefs: SharedPreferences = context.getSharedPreferences("h2o_known_devices", Context.MODE_PRIVATE)
    private val automationPrefs: SharedPreferences = context.getSharedPreferences("h2o_device_automation", Context.MODE_PRIVATE)
    private val gson = Gson()

    // --- Device Management ---

    fun getKnownDevices(): Map<String, String> {
        return devicesPrefs.all.mapNotNull { (key, value) ->
            if (value is String) key to value else null
        }.toMap()
    }

    fun saveDevice(address: String, name: String) {
        devicesPrefs.edit().putString(address, name).apply()
    }

    fun removeDevice(address: String) {
        devicesPrefs.edit().remove(address).apply()
    }

    fun clearAllDevices() {
        devicesPrefs.edit().clear().apply()
    }

    // --- Automation Management ---

    fun saveAutomation(deviceAddress: String, automation: DeviceAutomation) {
        val json = gson.toJson(automation)
        automationPrefs.edit().putString(deviceAddress, json).apply()
    }

    fun getAutomation(deviceAddress: String): DeviceAutomation? {
        val json = automationPrefs.getString(deviceAddress, null) ?: return null
        return try {
            gson.fromJson(json, DeviceAutomation::class.java)
        } catch (e: Exception) {
            null
        }
    }
}
