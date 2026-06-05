package vm.pds.h2o.dev_platforms.esp32_node32s.hwrev001.h2o001

import vm.pds.h2o.automation.*
import vm.pds.h2o.automation.datamodels.ActionType
import vm.pds.h2o.automation.datamodels.DeviceAutomation

/**
 * Default Automation Configuration for the H2O-Tower (h2o001) using ESP32-Node32S
 */
object DefaultAutomation {

    fun createDefaultAutomation(): DeviceAutomation {
        val platformId = "ESP32_NODE32S_H2O_001"

        return DeviceAutomation(
            platformType = platformId,
            pipelines = listOf(
                // 1. Air Circulation: Fan/Air Pump cycle (e.g., ON 5m, OFF 10m)
                createCycleTimerPipeline(
                    id = 1,
                    name = "Air Circulation",
                    description = "Cycles air pump for oxygenation",
                    platformType = platformId,
                    timerId = 1,
                    targetPin = 7, // Air Pump
                    targetAction = ActionType.SET_GPIO,
                    targetValue = 1, // High/On
                    onSeconds = 300,  // 5 mins
                    cycleSeconds = 900, // 15 mins total period
                    targetLabel = "Air Pump ON"
                ),

                // 2. Mist/Nebulizer Schedule: e.g., ON 10m, OFF 50m (Hourly)
                createCycleTimerPipeline(
                    id = 2,
                    name = "Mist Schedule",
                    description = "Cycles nebulizer for humidity",
                    platformType = platformId,
                    timerId = 2,
                    targetPin = 8, // Nebulizer
                    targetAction = ActionType.SET_GPIO,
                    targetValue = 1, // High/On
                    onSeconds = 600,   // 10 mins
                    cycleSeconds = 3600, // 60 mins total
                    targetLabel = "Nebulizer ON"
                ),

                // 3. LED Lighting Schedule: 16h ON / 8h OFF
                createCycleTimerPipeline(
                    id = 3,
                    name = "Grow Light Schedule",
                    description = "16h daylight cycle",
                    platformType = platformId,
                    timerId = 3,
                    targetPin = 9, // LED Strip
                    targetAction = ActionType.SET_PWM, // Assuming RMT/PWM control
                    targetValue = 200, // Moderate brightness
                    onSeconds = 57600, // 16 hours
                    cycleSeconds = 86400, // 24 hours
                    targetLabel = "LEDs ON"
                ),

                // 4. Low Water Safety: Stop Lift Pump if Float Switch (Pin 11) is triggered
                // Assuming Switch Open (High due to Pull-up) = Empty
                createGpioStateSafetyPipeline(
                    id = 4,
                    name = "Low Water Safety",
                    description = "Stop lift pump if water level low",
                    platformType = platformId,
                    sensorPin = 11, // Float Switch
                    triggerState = 1, // High = Empty (assuming NC switch that opens on empty)
                    cutoffActions = listOf(
                        createTurnOffAction(6, ActionType.SET_PWM, "Stop Lift Pump")
                    ),
                    conditionLabel = "Water Tank Empty"
                ),

                // 5. Motor Fault Safety: Stop all motors if nFAULT (Pin 17) is Low (Active Low)
                createGpioStateSafetyPipeline(
                    id = 5,
                    name = "Motor Fault Protection",
                    description = "Stop pumps on driver fault",
                    platformType = platformId,
                    sensorPin = 17, // nFAULT
                    triggerState = 0, // Low = Fault
                    cutoffActions = listOf(
                        createTurnOffAction(1, ActionType.SET_PWM, "Stop Nutrient A"),
                        createTurnOffAction(2, ActionType.SET_PWM, "Stop Nutrient B"),
                        createTurnOffAction(3, ActionType.SET_PWM, "Stop Nutrient C"),
                        createTurnOffAction(4, ActionType.SET_PWM, "Stop Fill Fwd"),
                        createTurnOffAction(5, ActionType.SET_PWM, "Stop Fill Rev"),
                        createTurnOffAction(6, ActionType.SET_PWM, "Stop Lift Pump")
                    ),
                    conditionLabel = "Motor Driver Fault"
                )
            ),
            version = 1
        )
    }
}
