package vm.pds.h2o.automation.datamodels

/**
 * Platform-agnostic Timer Configuration
 */
data class TimerConfig(
    val id: Int,
    val type: TimerType,
    val onTimeUnix: Int,            // Start time or ON duration
    val offTimeUnix: Int,           // End time or cycle duration
    val enabled: Boolean = true,
    val label: String = ""
) {
    /**
     * Format timer as human-readable string
     */
    fun describe(): String {
        return when (type) {
            TimerType.TIME_OF_DAY -> {
                val onTime = formatTimeOfDay(onTimeUnix)
                val offTime = formatTimeOfDay(offTimeUnix)
                "Daily $onTime to $offTime"
            }
            TimerType.CYCLE -> {
                val onDuration = formatDuration(onTimeUnix)
                val cycleDuration = formatDuration(offTimeUnix)
                "ON $onDuration every $cycleDuration"
            }
            TimerType.NONE -> "No timer"
        }
    }

    private fun formatTimeOfDay(seconds: Int): String {
        val hours = (seconds / 3600) % 24
        val minutes = (seconds % 3600) / 60
        return String.format("%02d:%02d", hours, minutes)
    }

    private fun formatDuration(seconds: Int): String {
        val days = seconds / 86400
        val hours = (seconds % 86400) / 3600
        val minutes = (seconds % 3600) / 60
        return buildString {
            if (days > 0) append("${days}d ")
            if (hours > 0) append("${hours}h ")
            if (minutes > 0) append("${minutes}m")
        }.trim().ifEmpty { "${seconds}s" }
    }
}