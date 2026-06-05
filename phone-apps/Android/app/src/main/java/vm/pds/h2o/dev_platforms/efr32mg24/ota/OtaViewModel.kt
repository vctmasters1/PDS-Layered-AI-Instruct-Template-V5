package vm.pds.h2o.dev_platforms.efr32mg24.ota

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import vm.pds.h2o.dev_platforms.abstract.FirmwareInfo
import vm.pds.h2o.dev_platforms.abstract.OtaResult

/**
 * EFR32MG24 OTA ViewModel
 * Manages firmware list and update state for EFR32MG24 device
 */
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

    private val _currentProgress = MutableStateFlow(0)
    val currentProgress: StateFlow<Int> = _currentProgress.asStateFlow()

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
            addLog("Device: EFR32MG24 (${firmware.hwRevision ?: "unknown revision"})")
            addLog("Selected firmware: ${firmware.version}")

            // Validate first
            val validation = otaManager.validateFirmware(firmware)
            if (validation is OtaResult.Error) {
                addLog("ERROR: Validation failed - ${validation.exception.message}")
                _updateResult.value = validation
                return@launch
            }
            addLog("✓ Firmware validation passed")
            addLog("")
            addLog("Preparing Gecko Bootloader upload...")
            addLog("NOTE: Ensure device is in bootloader mode")
            addLog("")

            // Start update with progress callback
            val updateFlow = otaManager.startUpdate(firmware) { progress ->
                _currentProgress.value = progress
                addLog("Progress: $progress%")
            }

            // Collect final result
            updateFlow.collect { result ->
                _updateResult.value = result
                when (result) {
                    is OtaResult.Success -> {
                        addLog("")
                        addLog("✓ ${result.message}")
                        addLog("Device will reboot with new firmware")
                    }
                    is OtaResult.Error -> {
                        addLog("")
                        addLog("✗ Update failed: ${result.exception.message}")
                    }
                    is OtaResult.InProgress -> {} // Progress already logged
                    else -> {}
                }
            }
        }
    }

    fun cancelUpdate() {
        viewModelScope.launch {
            val result = otaManager.cancelUpdate()
            addLog("")
            addLog("Update cancelled by user")
            _updateResult.value = result
        }
    }

    private fun addLog(message: String) {
        _logMessages.value = _logMessages.value + message
    }
}
