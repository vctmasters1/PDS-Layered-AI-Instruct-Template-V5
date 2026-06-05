package vm.pds.h2o.dev_platforms.esp32c3_supermini.ota

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import vm.pds.h2o.dev_platforms.abstract.FirmwareInfo
import vm.pds.h2o.dev_platforms.abstract.OtaResult

class OtaViewModel(application: Application) : AndroidViewModel(application) {

    private val otaManager = OtaManager(application)

    private val _firmwareList = MutableStateFlow<List<FirmwareInfo>>(emptyList())
    val firmwareList: StateFlow<List<FirmwareInfo>> = _firmwareList.asStateFlow()

    private val _selectedFirmware = MutableStateFlow<FirmwareInfo?>(null)
    val selectedFirmware: StateFlow<FirmwareInfo?> = _selectedFirmware.asStateFlow()

    private val _logMessages = MutableStateFlow<List<String>>(emptyList())
    val logMessages: StateFlow<List<String>> = _logMessages.asStateFlow()

    private val _updateResult = MutableStateFlow<OtaResult>(OtaResult.Idle)
    val updateResult: StateFlow<OtaResult> = _updateResult.asStateFlow()

    init {
        loadFirmwareList()
    }

    private fun loadFirmwareList() {
        viewModelScope.launch {
            _firmwareList.value = otaManager.getAvailableFirmware()
            _selectedFirmware.value = _firmwareList.value.firstOrNull()
        }
    }

    fun selectFirmware(firmware: FirmwareInfo) {
        _selectedFirmware.value = firmware
    }

    fun startOtaUpdate() {
        val firmware = _selectedFirmware.value ?: return
        viewModelScope.launch {
            _logMessages.value = emptyList()
            addLog("Starting OTA update...")
            addLog("Selected firmware: ${firmware.version}")
            
            // Validate first
            val validation = otaManager.validateFirmware(firmware)
            if (validation is OtaResult.Error) {
                addLog("Validation failed: ${validation.exception.message}")
                _updateResult.value = validation
                return@launch
            }
            addLog("Firmware validation passed")

            // Start update with progress callback
            otaManager.startUpdate(firmware) { progress ->
                addLog("Progress: $progress%")
            }
        }
    }

    fun cancelUpdate() {
        viewModelScope.launch {
            val result = otaManager.cancelUpdate()
            addLog("Update cancelled")
            _updateResult.value = result
        }
    }

    private fun addLog(message: String) {
        _logMessages.value = _logMessages.value + "[${System.currentTimeMillis() % 1000}] $message"
    }
}
