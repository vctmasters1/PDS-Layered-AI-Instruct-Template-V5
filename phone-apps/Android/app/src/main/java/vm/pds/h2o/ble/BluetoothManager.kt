package vm.pds.h2o.ble

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.ParcelUuid
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

@SuppressLint("MissingPermission")
class BluetoothManager(private val context: Context) {

    private val bluetoothAdapter: BluetoothAdapter? by lazy {
        (context.getSystemService(Context.BLUETOOTH_SERVICE) as? android.bluetooth.BluetoothManager)?.adapter
    }

    private val _scannedDevices = MutableStateFlow<List<ScanResult>>(emptyList())
    val scannedDevices: StateFlow<List<ScanResult>> = _scannedDevices.asStateFlow()

    private val _isScanning = MutableStateFlow(false)
    val isScanning: StateFlow<Boolean> = _isScanning.asStateFlow()

    private val _connectionState = MutableStateFlow<Int>(BluetoothProfile.STATE_DISCONNECTED)
    val connectionState: StateFlow<Int> = _connectionState.asStateFlow()

    private var bluetoothGatt: BluetoothGatt? = null

    private val gattCallback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                _connectionState.value = newState
                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    bluetoothGatt = gatt
                    gatt.discoverServices()
                } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                    gatt.close()
                    bluetoothGatt = null
                }
            } else {
                _connectionState.value = BluetoothProfile.STATE_DISCONNECTED
                gatt.close()
                bluetoothGatt = null
            }
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            // Services discovered, we can now write characteristics
        }
    }

    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            val existingDevice = _scannedDevices.value.find { it.device.address == result.device.address }
            if (existingDevice == null) {
                _scannedDevices.value = _scannedDevices.value + result
            }
        }
    }

    fun startScan() {
        if (bluetoothAdapter?.isEnabled == true) {
            _scannedDevices.value = emptyList()
            _isScanning.value = true
            val scanFilter = ScanFilter.Builder()
                .setServiceUuid(ParcelUuid(BleConstants.PROVISIONING_SERVICE_UUID))
                .build()
            val scanSettings = ScanSettings.Builder().build()
            bluetoothAdapter?.bluetoothLeScanner?.startScan(listOf(scanFilter), scanSettings, scanCallback)
        }
    }

    fun stopScan() {
        _isScanning.value = false
        bluetoothAdapter?.bluetoothLeScanner?.stopScan(scanCallback)
    }

    fun connectToDevice(address: String) {
        val device = bluetoothAdapter?.getRemoteDevice(address)
        _connectionState.value = BluetoothProfile.STATE_CONNECTING
        bluetoothGatt = device?.connectGatt(context, false, gattCallback)
    }

    fun sendWifiCredentials(ssid: String, pass: String, isHotspot: Boolean) {
        val service = bluetoothGatt?.getService(BleConstants.PROVISIONING_SERVICE_UUID)
        if (service != null) {
            val ssidCharacteristic = service.getCharacteristic(BleConstants.SSID_CHARACTERISTIC_UUID)
            val passwordCharacteristic = service.getCharacteristic(BleConstants.PASSWORD_CHARACTERISTIC_UUID)
            val connectCharacteristic = service.getCharacteristic(BleConstants.CONNECT_CHARACTERISTIC_UUID)

            writeCharacteristic(ssidCharacteristic, ssid.toByteArray())
            writeCharacteristic(passwordCharacteristic, pass.toByteArray())
            writeCharacteristic(connectCharacteristic, if (isHotspot) byteArrayOf(1) else byteArrayOf(0))
        }
    }

    private fun writeCharacteristic(characteristic: BluetoothGattCharacteristic?, value: ByteArray) {
        characteristic?.let { 
            it.value = value
            bluetoothGatt?.writeCharacteristic(it)
        }
    }

    fun disconnect() {
        bluetoothGatt?.disconnect()
    }
}
