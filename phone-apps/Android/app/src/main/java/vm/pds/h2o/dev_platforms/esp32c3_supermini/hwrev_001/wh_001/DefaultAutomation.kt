package vm.pds.h2o.dev_platforms.esp32c3_supermini.hwrev_001.wh_001

import vm.pds.h2o.automation.*
import vm.pds.h2o.automation.datamodels.ActionType
import vm.pds.h2o.automation.datamodels.DeviceAutomation

/**
 * Default Automation Configuration for WH-001 (Wall Hugger) Model
 */
object DefaultAutomation {

    fun createDefaultAutomation(): DeviceAutomation {
        val platform = "ESP32C3_SUPERMINI"
        return DeviceAutomation(
            platformType = platform,
            pipelines = listOf(
                createCycleTimerPipeline(
                    id = 0,
                    name = "Watering Cycle",
                    description = "Water 1m every 6h",
                    platformType = platform,
                    timerId = 0,
                    targetPin = 3,
                    targetAction = ActionType.SET_PWM,
                    targetValue = 1023,
                    onSeconds = 60,
                    cycleSeconds = 21600,
                    targetLabel = "Water Pump ON"
                ),
                createGpioStateSafetyPipeline(
                    id = 1,
                    name = "Low Water Safety",
                    description = "Stop pump if water level low",
                    platformType = platform,
                    sensorPin = 2,
                    triggerState = 0, // Low means empty
                    cutoffActions = listOf(
                        createTurnOffAction(3, ActionType.SET_PWM, "Stop Water Pump")
                    ),
                    conditionLabel = "Water Level Low"
                ),
                createCycleTimerPipeline(
                    id = 2,
                    name = "Grow Light Schedule",
                    description = "12h ON / 12h OFF",
                    platformType = platform,
                    timerId = 1,
                    targetPin = 4,
                    targetAction = ActionType.SET_PWM,
                    targetValue = 1023,
                    onSeconds = 43200,
                    cycleSeconds = 86400,
                    targetLabel = "Grow Light ON"
                )
            )
        )
    }
}
