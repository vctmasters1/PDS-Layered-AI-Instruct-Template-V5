package vm.pds.h2o.automation

import vm.pds.h2o.automation.datamodels.Condition
import vm.pds.h2o.automation.datamodels.Action
import vm.pds.h2o.automation.datamodels.Pipeline
import vm.pds.h2o.automation.datamodels.ActionType
import vm.pds.h2o.automation.datamodels.ConditionType
import vm.pds.h2o.automation.datamodels.TimerType

/**
 * Platform Interface
 * 
 * Each device platform (ESP32-C3, ESP32-S3, etc.) implements this interface
 * to translate generic automation concepts to device-specific formats.
 */
interface PlatformInterface {
    /**
     * Platform identifier (e.g., "ESP32C3_SUPERMINI")
     */
    val platformId: String
    
    /**
     * Get available pins for the platform
     */
    fun getAvailablePins(): List<Int>
    
    /**
     * Check if pin supports ADC
     */
    fun isPinAdcCapable(pin: Int): Boolean
    
    /**
     * Check if pin supports PWM
     */
    fun isPinPwmCapable(pin: Int): Boolean
    
    /**
     * Get pin label/name
     */
    fun getPinLabel(pin: Int): String
    
    /**
     * Validate condition for this platform
     */
    fun validateCondition(condition: Condition): List<String>
    
    /**
     * Validate action for this platform
     */
    fun validateAction(action: Action): List<String>
    
    /**
     * Convert generic condition to device-specific enum value
     */
    fun mapConditionType(type: ConditionType): Int
    
    /**
     * Convert generic action to device-specific enum value
     */
    fun mapActionType(type: ActionType): Int
    
    /**
     * Convert generic timer to device-specific enum value
     */
    fun mapTimerType(type: TimerType): Int
    
    /**
     * Serialize condition to binary format for device
     */
    fun serializeCondition(condition: Condition): ByteArray
    
    /**
     * Serialize action to binary format for device
     */
    fun serializeAction(action: Action): ByteArray
    
    /**
     * Serialize complete pipeline to binary format for device
     */
    fun serializePipeline(pipeline: Pipeline): ByteArray
}
