package vm.pds.h2o.automation.datamodels

/**
 * Complete device automation configuration
 */
data class DeviceAutomation(
    val platformType: String,       // Device platform identifier
    val pipelines: List<Pipeline>,
    val timers: Map<Int, TimerConfig> = emptyMap(),  // Timer ID → Config
    val version: Int = 1,
    val lastModified: Long = System.currentTimeMillis()
) {
    /**
     * Validate all pipelines
     */
    fun validateAll(): Map<String, Map<String, List<String>>> {
        return pipelines.associate { pipeline ->
            "pipeline[${pipeline.id}:${pipeline.name}]" to pipeline.validate()
        }.filter { it.value.isNotEmpty() }
    }

    /**
     * Get all unique timer IDs referenced in pipelines
     */
    fun getReferencedTimerIds(): Set<Int> {
        return pipelines.flatMap { pipeline ->
            pipeline.conditions
                .filter { it.type == ConditionType.TIMER }
                .map { it.param1 }
        }.toSet()
    }
}