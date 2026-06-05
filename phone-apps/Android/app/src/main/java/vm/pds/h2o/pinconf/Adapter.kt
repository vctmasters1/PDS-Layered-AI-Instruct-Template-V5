package vm.pds.h2o.pinconf

import vm.pds.h2o.automation.datamodels.Action
import vm.pds.h2o.automation.datamodels.ActionType
import vm.pds.h2o.automation.datamodels.Condition
import vm.pds.h2o.automation.datamodels.ConditionType
import vm.pds.h2o.automation.datamodels.Pipeline
import vm.pds.h2o.automation.PlatformInterface
import vm.pds.h2o.automation.datamodels.TimerType
import vm.pds.h2o.dev_platforms.abstract.PlatformPinCapabilities
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Generic Platform Adapter
 * 
 * Adapts the generic automation framework to specific hardware platforms using
 * the PlatformDefinition interface. Handles validation and serialization.
 */
class Adapter(
    private val platformDef: PlatformPinCapabilities,
    private val pinLabelProvider: ((Int) -> String)? = null
) : PlatformInterface {

    override val platformId: String = platformDef.platformId

    override fun getAvailablePins(): List<Int> {
        return platformDef.availablePins
    }

    override fun isPinAdcCapable(pin: Int): Boolean {
        return platformDef.isPinAdcCapable(pin)
    }

    override fun isPinPwmCapable(pin: Int): Boolean {
        // Assuming strictly available pins are PWM capable for now, or relying on specific config
        // In the future, PlatformDefinition could expose pwmPins list.
        return platformDef.isPinAvailable(pin)
    }

    override fun getPinLabel(pin: Int): String {
        return pinLabelProvider?.invoke(pin)?.takeIf { it.isNotBlank() } ?: "GPIO $pin"
    }

    override fun validateCondition(condition: Condition): List<String> {
        val errors = mutableListOf<String>()

        when (condition.type) {
            ConditionType.THRESHOLD_ABOVE,
            ConditionType.THRESHOLD_BELOW,
            ConditionType.RANGE -> {
                if (!isPinAdcCapable(condition.sourcePin)) {
                    errors.add("Pin ${condition.sourcePin} does not support ADC")
                }
            }
            ConditionType.GPIO_STATE -> {
                if (!platformDef.isPinAvailable(condition.sourcePin)) {
                    val reason = platformDef.getPinRestriction(condition.sourcePin)
                    errors.add("Pin ${condition.sourcePin} unavailable: $reason")
                }
            }
            else -> {}
        }

        return errors
    }

    override fun validateAction(action: Action): List<String> {
        val errors = mutableListOf<String>()

        if (!platformDef.isPinAvailable(action.targetPin)) {
            val reason = platformDef.getPinRestriction(action.targetPin)
            errors.add("Pin ${action.targetPin} unavailable: $reason")
        }

        if (action.type == ActionType.SET_PWM) {
            if (action.value > 1023) {
                // Assuming 10-bit default for generic validation, ideally comes from platformDef
                errors.add("PWM duty exceeds 10-bit maximum (1023)")
            }
        }

        return errors
    }

    override fun mapConditionType(type: ConditionType): Int {
        // Maps generic automation types to device protocol values
        // This mapping assumes the Abstract/Common enums match the device protocol
        return when (type) {
            ConditionType.NONE -> 0
            ConditionType.THRESHOLD_ABOVE -> 1
            ConditionType.THRESHOLD_BELOW -> 2
            ConditionType.RANGE -> 3
            ConditionType.GPIO_STATE -> 4
            ConditionType.TIMER -> 5
            ConditionType.PID_SLEW_LOW -> 6
            ConditionType.PID_SLEW_HIGH -> 7
            ConditionType.MANUAL_BUTTON -> 10 // Assign ID 10 for Manual Button
            ConditionType.AND -> 8
            ConditionType.OR -> 9
        }
    }

    override fun mapActionType(type: ActionType): Int {
        return when (type) {
            ActionType.NONE -> 0
            ActionType.SET_PWM -> 1
            ActionType.SET_GPIO -> 2
            ActionType.TOGGLE_GPIO -> 3
            ActionType.TRIGGER_ACTION -> 4
            ActionType.SET_DAC -> 5
            ActionType.SERVO -> 6
        }
    }

    override fun mapTimerType(type: TimerType): Int {
        return when (type) {
            TimerType.NONE -> 0
            TimerType.TIME_OF_DAY -> 1
            TimerType.CYCLE -> 2
        }
    }

    override fun serializeCondition(condition: Condition): ByteArray {
        return ByteBuffer.allocate(20).apply {
            order(ByteOrder.LITTLE_ENDIAN)
            putInt(mapConditionType(condition.type))
            put(condition.sourcePin.toByte())
            put(0)
            put(0)
            put(0)
            putInt(condition.param1)
            putInt(condition.param2)
            putInt(condition.delayOnMakeMs)
            putInt(condition.delayOnBreakMs)
            put(if (condition.enabled) 1 else 0)
        }.array()
    }

    override fun serializeAction(action: Action): ByteArray {
        return ByteBuffer.allocate(16).apply {
            order(ByteOrder.LITTLE_ENDIAN)
            putInt(mapActionType(action.type))
            put(action.targetPin.toByte())
            put(0)
            put(0)
            put(0)
            putInt(action.value)
            put(if (action.enabled) 1 else 0)
            put(0)
            put(0)
            put(0)
        }.array()
    }

    override fun serializePipeline(pipeline: Pipeline): ByteArray {
        val buffer = ByteBuffer.allocate(4096).apply {
            order(ByteOrder.LITTLE_ENDIAN)

            putInt(pipeline.id)
            put(if (pipeline.enabled) 1 else 0)
            put(pipeline.conditions.size.toByte())
            put(pipeline.actions.size.toByte())
            put(0)  // reserved

            pipeline.conditions.forEach { condition ->
                put(serializeCondition(condition))
                put(if (condition.enabled) 1 else 0)
                put(0); put(0); put(0)  // padding
            }

            pipeline.actions.forEach { action ->
                put(serializeAction(action))
            }
        }

        val size = buffer.position()
        return ByteArray(size).also {
            buffer.rewind()
            buffer.get(it)
        }
    }
}
