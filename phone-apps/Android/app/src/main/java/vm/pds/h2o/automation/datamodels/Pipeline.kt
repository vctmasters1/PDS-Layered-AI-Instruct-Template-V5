package vm.pds.h2o.automation.datamodels

import vm.pds.h2o.automation.datamodels.Action

/**
 * Platform-agnostic Pipeline
 *
 * Complete automation rule: IF [conditions] THEN [actions]
 */
data class Pipeline(
    val id: Int = -1,               // Pipeline ID (-1 = not registered)
    val name: String,
    val description: String = "",
    val conditions: List<Condition>,
    val actions: List<Action>,
    val timer: TimerConfig? = null,
    val enabled: Boolean = true,
    val platformType: String = ""   // e.g., "ESP32C3_SUPERMINI"
) {
    /**
     * Validate pipeline structure
     */
    fun validate(): Map<String, List<String>> {
        val errors = mutableMapOf<String, List<String>>()

        if (name.isBlank()) {
            errors["name"] = listOf("Pipeline name cannot be empty")
        }

        if (conditions.isEmpty()) {
            errors["conditions"] = listOf("Must have at least one condition")
        } else {
            conditions.forEachIndexed { index, condition ->
                val condErrors = condition.validate()
                if (condErrors.isNotEmpty()) {
                    errors["condition[$index]"] = condErrors
                }
            }
        }

        if (actions.isEmpty()) {
            errors["actions"] = listOf("Must have at least one action")
        } else {
            actions.forEachIndexed { index, action ->
                val actionErrors = action.validate()
                if (actionErrors.isNotEmpty()) {
                    errors["action[$index]"] = actionErrors
                }
            }
        }

        return errors
    }

    /**
     * Summary description
     */
    fun summarize(): String {
        val condDesc = if (conditions.size == 1) {
            conditions[0].describe()
        } else {
            "${conditions.size} conditions"
        }

        val actionDesc = if (actions.size == 1) {
            actions[0].describe()
        } else {
            "${actions.size} actions"
        }

        return "IF $condDesc THEN $actionDesc"
    }
}