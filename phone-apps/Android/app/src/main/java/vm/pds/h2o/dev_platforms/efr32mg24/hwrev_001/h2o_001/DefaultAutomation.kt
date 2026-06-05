package vm.pds.h2o.dev_platforms.efr32mg24.hwrev_001.h2o_001

import vm.pds.h2o.automation.*
import vm.pds.h2o.automation.datamodels.ActionType
import vm.pds.h2o.automation.datamodels.DeviceAutomation

/**
 * Default Automation Configuration for EFR32MG24 - H2O Tower Model 001
 */
object DefaultAutomation {

    fun createDefaultAutomation(): DeviceAutomation {
        val platform = "EFR32MG24_DK"
        return DeviceAutomation(
            platformType = platform,
            pipelines = listOf(
                createCycleTimerPipeline(
                    id = 0,
                    name = "Mist Cycle",
                    description = "Mist 5s every 5m",
                    platformType = platform,
                    timerId = 0,
                    targetPin = 4,
                    targetAction = ActionType.SET_PWM,
                    targetValue = 1023,
                    onSeconds = 5,
                    cycleSeconds = 300,
                    targetLabel = "Mist Pump ON"
                ),
                createThresholdSafetyPipeline(
                    id = 1,
                    name = "Low Water Safety",
                    description = "Stop pumps if < 20%",
                    platformType = platform,
                    sensorPin = 0, // Water Level (ADC)
                    threshold = 20,
                    isBelowThreshold = true,
                    cutoffActions = listOf(
                        createTurnOffAction(4, ActionType.SET_PWM, "Stop Mist Pump"),
                        createTurnOffAction(5, ActionType.SET_PWM, "Stop Nutrient Pump")
                    ),
                    conditionLabel = "Water Level < 20%"
                ),
                createCycleTimerPipeline(
                    id = 2,
                    name = "UV Light Schedule",
                    description = "12h ON / 12h OFF",
                    platformType = platform,
                    timerId = 1,
                    targetPin = 7,
                    targetAction = ActionType.SET_GPIO,
                    targetValue = 1,
                    onSeconds = 43200,
                    cycleSeconds = 86400,
                    targetLabel = "UV Light ON"
                )
            )
        )
    }
}
