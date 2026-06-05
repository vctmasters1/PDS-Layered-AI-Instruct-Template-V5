package vm.pds.h2o.data

/**
 * Represents the current status of a connected device.
 */
data class DeviceStatus(
    val address: String,
    val name: String,
    val isOnline: Boolean,
    val lastQueried: Long,
    val ph: Float,
    val ec: Float,
    val ppm: Float,
    val timerCountdown: Int, // in seconds
    val isFirmwareUpdateAvailable: Boolean = false // New field
)
