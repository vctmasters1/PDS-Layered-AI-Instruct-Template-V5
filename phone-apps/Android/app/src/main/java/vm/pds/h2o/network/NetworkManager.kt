package vm.pds.h2o.network

import vm.pds.h2o.data.DeviceStatus
import vm.pds.h2o.automation.datamodels.DeviceAutomation
import vm.pds.h2o.dev_platforms.abstract.DevicePinMap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

/**
 * Manages network communication with H2O-Tower devices.
 *
 * Modes:
 *  - Cloud mode (default): calls WEB-HMI REST API with JWT auth.
 *    Set [apiBaseUrl] and [jwtToken] before use.
 *  - Local relay mode: calls device directly using [X-Device-Token] header.
 *    Call [setLocalRelay] with the device's local IP and device token.
 *  - Mock mode: returns hard-coded dummy devices (development only).
 *    Activated automatically when [apiBaseUrl] is empty and [useMocks] == true.
 */
class NetworkManager {

    var apiBaseUrl: String = ""
    var jwtToken: String = ""

    private var localRelayIp: String = ""
    private var deviceToken: String = ""
    var useMocks: Boolean = false

    fun setLocalRelay(ip: String, token: String) {
        localRelayIp = ip
        deviceToken = token
    }

    fun clearLocalRelay() {
        localRelayIp = ""
        deviceToken = ""
    }

    // ─────────────────────────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────────────────────────

    /**
     * Fetch device status/info from cloud API.
     * @param deviceId The UUID of the device on the cloud.
     * @return [DeviceStatus] or null on failure.
     */
    suspend fun getDeviceStatus(deviceId: String): DeviceStatus? = withContext(Dispatchers.IO) {
        if (apiBaseUrl.isEmpty()) {
            if (useMocks) return@withContext mockDevice(deviceId)
            return@withContext null
        }
        try {
            val url = URL("$apiBaseUrl/v1/devices/$deviceId")
            val conn = openAuthenticatedGet(url)
            if (conn.responseCode != 200) return@withContext null
            val body = conn.inputStream.bufferedReader().readText()
            conn.disconnect()
            parseDeviceStatus(JSONObject(body))
        } catch (e: Exception) {
            null
        }
    }

    /**
     * Fetch latest telemetry snapshot for a device from cloud API.
     * @param deviceId The UUID of the device.
     * @return Raw JSON string of the telemetry snapshot, or null.
     */
    suspend fun getDeviceTelemetry(deviceId: String): String? = withContext(Dispatchers.IO) {
        if (apiBaseUrl.isEmpty()) return@withContext null
        try {
            val url = URL("$apiBaseUrl/v1/devices/$deviceId/telemetry?limit=1")
            val conn = openAuthenticatedGet(url)
            if (conn.responseCode != 200) return@withContext null
            val body = conn.inputStream.bufferedReader().readText()
            conn.disconnect()
            body
        } catch (e: Exception) {
            null
        }
    }

    /**
     * Send a local relay command (PWM or GPIO) directly to the device on LAN.
     * Requires [setLocalRelay] to have been called first.
     * @param type  "pwm" or "gpio"
     * @param pin   Hardware pin number
     * @param value Duty cycle (0–1000 for PWM) or 0/1 for GPIO
     */
    suspend fun sendLocalCommand(type: String, pin: Int, value: Int): Boolean = withContext(Dispatchers.IO) {
        if (localRelayIp.isEmpty()) return@withContext false
        try {
            val url = URL("http://$localRelayIp/command")
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("X-Device-Token", deviceToken)
            conn.doOutput = true
            conn.connectTimeout = 3000
            conn.readTimeout = 5000
            val payload = JSONObject().apply {
                put("type", type); put("pin", pin); put("value", value)
            }.toString()
            OutputStreamWriter(conn.outputStream).use { it.write(payload) }
            val ok = conn.responseCode in 200..204
            conn.disconnect()
            ok
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Sends the pin configuration to a device.
     * @param deviceId Cloud device UUID or local IP for relay mode.
     * @param pinMap The [DevicePinMap] to send.
     */
    suspend fun postPinConfiguration(deviceId: String, pinMap: DevicePinMap) {
        // Cloud: PATCH /v1/devices/:id/pipeline-settings (owner only)
        // Local relay: POST http://{ip}/pipeline — not yet implemented on firmware side
        println("NETWORK: postPinConfiguration for $deviceId (not yet implemented)")
    }

    /**
     * Sends the automation configuration to a device.
     * @param deviceId Cloud device UUID.
     * @param automation The [DeviceAutomation] to send.
     * @return True if successful, false otherwise.
     */
    suspend fun postAutomation(deviceId: String, automation: DeviceAutomation): Boolean {
        // Cloud: no direct automation endpoint yet; use pipeline push
        println("NETWORK: postAutomation for $deviceId (not yet implemented)")
        return false
    }

    // ─────────────────────────────────────────────────────────────────
    // Private helpers
    // ─────────────────────────────────────────────────────────────────

    private fun openAuthenticatedGet(url: URL): HttpURLConnection {
        val conn = url.openConnection() as HttpURLConnection
        conn.requestMethod = "GET"
        conn.setRequestProperty("Authorization", "Bearer $jwtToken")
        conn.setRequestProperty("Accept", "application/json")
        conn.connectTimeout = 5000
        conn.readTimeout = 10000
        return conn
    }

    private fun parseDeviceStatus(json: JSONObject): DeviceStatus {
        return DeviceStatus(
            address    = json.optString("id"),
            name       = json.optString("name", "Unknown"),
            isOnline   = json.optBoolean("isOnline", false),
            lastQueried = System.currentTimeMillis(),
            ph         = 0f,
            ec         = 0f,
            ppm        = 0f,
            timerCountdown = 0,
            isFirmwareUpdateAvailable = json.has("pendingOtaVersion") && !json.isNull("pendingOtaVersion")
        )
    }

    // ─────────────────────────────────────────────────────────────────
    // Mock devices (development only — useMocks flag must be true)
    // ─────────────────────────────────────────────────────────────────

    private fun mockDevice(deviceId: String): DeviceStatus? {
        val mocks = mapOf(
            "00:11:22:33:44:55" to DeviceStatus(
                "00:11:22:33:44:55", "H2O-Tower-Dummy", true,
                System.currentTimeMillis(), 6.2f, 1.8f, 900f, 120, true
            ),
            "AA:BB:CC:DD:EE:FF" to DeviceStatus(
                "AA:BB:CC:DD:EE:FF", "WH-001-Dummy", true,
                System.currentTimeMillis(), 5.8f, 2.1f, 1050f, 3600, false
            ),
            "12:34:56:78:9A:BC" to DeviceStatus(
                "12:34:56:78:9A:BC", "H2O-001-Node32S", true,
                System.currentTimeMillis(), 6.0f, 2.0f, 1000f, 7200, false
            ),
        )
        return mocks[deviceId]
    }
}
