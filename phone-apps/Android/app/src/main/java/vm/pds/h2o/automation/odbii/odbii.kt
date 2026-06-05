package vm.pds.h2o.automation.odbii

import android.Manifest
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.content.Context
import android.util.Log
import androidx.annotation.RequiresPermission
import java.util.UUID

class OBDIntegrator(private val context: Context) {
    private var gatt: BluetoothGatt? = null

    @RequiresPermission(Manifest.permission.BLUETOOTH_CONNECT)
    fun connect(deviceAddress: String) {
        val bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
        val adapter = bluetoothManager.adapter
        val device = adapter.getRemoteDevice(deviceAddress)
        gatt = device.connectGatt(context, false, gattCallback)
    }

    private val gattCallback = object : BluetoothGattCallback() {
        @RequiresPermission(Manifest.permission.BLUETOOTH_CONNECT)
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                gatt.discoverServices()
            }
        }

        @RequiresPermission(Manifest.permission.BLUETOOTH_CONNECT)
        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            val service = gatt.getService(UUID.fromString("00001810-0000-1000-8000-00805f9b34fb"))
            val char = service.getCharacteristic(UUID.fromString("00002a00-0000-1000-8000-00805f9b34fb"))
            gatt.readCharacteristic(char)
            gatt.setCharacteristicNotification(char, true)  // For real-time
        }

        override fun onCharacteristicRead(gatt: BluetoothGatt, char: BluetoothGattCharacteristic, status: Int) {
            val rawHex = char.value.toHexString()  // Raw "41 0C 1F FF"
            val rpm = decodeRPM(rawHex)  // Your decoding logic
            Log.d("OBD", "RPM: $rpm")
        }
    }

    private fun ByteArray.toHexString(): String = joinToString(" ") { "%02X".format(it) }

    private fun decodeRPM(raw: String): Int {
        val bytes = raw.split(" ").drop(2).map { it.toInt(16) }  // Drop "41 0C"
        return (bytes[0] * 256 + bytes[1]) / 4  // RPM formula
    }
}