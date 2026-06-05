package vm.pds.h2o.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import vm.pds.h2o.ble.BluetoothManager
import vm.pds.h2o.data.DeviceRepository
import vm.pds.h2o.data.DeviceStatus
import vm.pds.h2o.automation.datamodels.DeviceAutomation
import vm.pds.h2o.dev_platforms.abstract.DevicePinMap
import vm.pds.h2o.network.NetworkManager
import vm.pds.h2o.dev_platforms.abstract.DefaultAutomationProvider

class MainViewModel(application: Application) : AndroidViewModel(application) {

    private val deviceRepository = DeviceRepository(application)
    private val bluetoothManager = BluetoothManager(application)
    private val networkManager = NetworkManager()

    private val _knownDevices = MutableStateFlow<Map<String, String>>(emptyMap())
    val knownDevices: StateFlow<Map<String, String>> = _knownDevices

    private val _selectedDevice = MutableStateFlow<Pair<String, String>?>(null)
    val selectedDevice: StateFlow<Pair<String, String>?> = _selectedDevice

    private val _deviceStatus = MutableStateFlow<DeviceStatus?>(null)
    val deviceStatus: StateFlow<DeviceStatus?> = _deviceStatus

    // List of statuses for ALL known devices (for Home Screen)
    private val _allDevicesStatus = MutableStateFlow<List<DeviceStatus>>(emptyList())
    val allDevicesStatus: StateFlow<List<DeviceStatus>> = _allDevicesStatus
    
    // UI Event for showng messages (like "Device unavailable, saved locally")
    private val _uiMessage = MutableStateFlow<String?>(null)
    val uiMessage: StateFlow<String?> = _uiMessage

    init {
        loadKnownDevices()
        viewModelScope.launch {
            updateAllDevicesStatus()
        }
    }

    private fun loadKnownDevices() {
        _knownDevices.value = deviceRepository.getKnownDevices()
    }
    
    private suspend fun updateDeviceStatus(address: String) {
        _deviceStatus.value = networkManager.getDeviceStatus(address)
    }

    private suspend fun updateAllDevicesStatus() {
        val statuses = _knownDevices.value.keys.mapNotNull { address ->
            networkManager.getDeviceStatus(address)
        }
        _allDevicesStatus.value = statuses
    }

    fun addDevice(address: String, name: String) {
        deviceRepository.saveDevice(address, name)
        loadKnownDevices()
        viewModelScope.launch {
            updateAllDevicesStatus()
        }
    }

    fun removeAllDummyDevices() {
        // Implementation that clears all devices from repository
        deviceRepository.clearAllDevices() 
        loadKnownDevices()
        _selectedDevice.value = null
        _deviceStatus.value = null
        _allDevicesStatus.value = emptyList()
    }

    fun selectDevice(address: String, name: String) {
        _selectedDevice.value = address to name
        viewModelScope.launch {
            updateDeviceStatus(address)
            // Load local automation if available
            val localAutomation = deviceRepository.getAutomation(address)
            if (localAutomation != null) {
                // In a real app we might want to merge or prompt, 
                // but for now local overrides "default" state if we had one.
                // However, AutomationScreen currently maintains its own state 
                // initialized from defaults. We should ideally expose this.
            }
        }
    }
    
    fun deselectDevice() {
        _selectedDevice.value = null
        _deviceStatus.value = null
    }

    fun forgetDevice(address: String) {
        deviceRepository.removeDevice(address)
        loadKnownDevices()
        if (_selectedDevice.value?.first == address) {
            _selectedDevice.value = null
            _deviceStatus.value = null
        }
        viewModelScope.launch {
            updateAllDevicesStatus()
        }
    }
    
    fun clearUiMessage() {
        _uiMessage.value = null
    }

    fun savePinMap(pinMap: DevicePinMap) {
        viewModelScope.launch {
            selectedDevice.value?.first?.let { networkManager.postPinConfiguration(it, pinMap) }
        }
    }

    fun saveAutomation(automation: DeviceAutomation) {
        val deviceAddress = selectedDevice.value?.first ?: return
        
        // Always save locally first
        deviceRepository.saveAutomation(deviceAddress, automation)
        
        viewModelScope.launch {
            // Check connectivity (simplified check via status or ping)
            val isConnected = _deviceStatus.value != null // Crude check, ideally verify ping
            
            if (isConnected) {
                val success = networkManager.postAutomation(deviceAddress, automation)
                if (success) {
                    _uiMessage.value = "Automation saved to device!"
                } else {
                    _uiMessage.value = "Device unreachable. Saved locally, will upload later."
                }
            } else {
                _uiMessage.value = "Device unavailable. Saved locally, will upload when connected."
            }
        }
    }
    
    /**
     * Get automation configuration for current device.
     * Returns local copy if exists, otherwise null (caller falls back to default).
     */
    fun getSavedAutomation(): DeviceAutomation? {
        val (address, name) = selectedDevice.value ?: return null
        
        // 1. Try to load from local storage
        val saved = deviceRepository.getAutomation(address)
        if (saved != null) return saved
        
        // 2. Fallback to default based on Platform ID inferred from Address/Name
        val platformId = getPlatformIdForDevice(address, name)
        return DefaultAutomationProvider.get(platformId)
    }

    /**
     * Helper to determine platform ID for a device.
     * In a real app, this would be stored in the device record or fetched from the device.
     */
    fun getPlatformIdForDevice(address: String, name: String? = null): String {
        // Dummy Device Mapping
        return when {
            address.equals("12:34:56:78:9A:BC", ignoreCase = true) -> "ESP32_NODE32S_H2O_001" // H2O-001-Node32S
            address.equals("AA:BB:CC:DD:EE:FF", ignoreCase = true) -> "ESP32C3_SUPERMINI_WH_001" // WH-001-Dummy
            address.equals("00:11:22:33:44:55", ignoreCase = true) -> "ESP32C3_SUPERMINI_H2O_001" // H2O-Tower-Dummy
            else -> "ESP32C3_SUPERMINI_H2O_001" // Default fallback
        }
    }
}
