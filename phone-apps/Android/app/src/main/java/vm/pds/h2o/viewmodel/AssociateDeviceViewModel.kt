package vm.pds.h2o.viewmodel

import android.app.Application
import android.bluetooth.le.ScanResult
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import vm.pds.h2o.ble.BluetoothManager
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

class AssociateDeviceViewModel(application: Application) : AndroidViewModel(application) {

    private val bluetoothManager = BluetoothManager(application)

    val scannedDevices: StateFlow<List<ScanResult>> = bluetoothManager.scannedDevices
    val isScanning: StateFlow<Boolean> = bluetoothManager.isScanning
    val connectionStatus: StateFlow<ConnectionStatus> = bluetoothManager.connectionState.map {
        when(it) {
            android.bluetooth.BluetoothProfile.STATE_CONNECTED -> ConnectionStatus.CONNECTED
            android.bluetooth.BluetoothProfile.STATE_CONNECTING -> ConnectionStatus.CONNECTING
            android.bluetooth.BluetoothProfile.STATE_DISCONNECTED -> ConnectionStatus.DISCONNECTED
            else -> ConnectionStatus.FAILED
        }
    }.stateIn(viewModelScope, kotlinx.coroutines.flow.SharingStarted.Eagerly, ConnectionStatus.DISCONNECTED)

    fun startScan() {
        viewModelScope.launch {
            bluetoothManager.startScan()
        }
    }

    fun stopScan() {
        viewModelScope.launch {
            bluetoothManager.stopScan()
        }
    }

    fun connectToDevice(deviceAddress: String) {
        viewModelScope.launch {
            bluetoothManager.connectToDevice(deviceAddress)
        }
    }

    fun sendWifiCredentials(ssid: String, pass: String, isHotspot: Boolean) {
        viewModelScope.launch {
            bluetoothManager.sendWifiCredentials(ssid, pass, isHotspot)
        }
    }
}

enum class ConnectionStatus {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    FAILED
}
