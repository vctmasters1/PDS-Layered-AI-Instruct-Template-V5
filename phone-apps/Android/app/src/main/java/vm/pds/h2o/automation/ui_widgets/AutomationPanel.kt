package vm.pds.h2o.automation.ui_widgets

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import vm.pds.h2o.automation.datamodels.DeviceAutomation
import vm.pds.h2o.automation.datamodels.Pipeline
import vm.pds.h2o.automation.datamodels.Condition
import vm.pds.h2o.automation.datamodels.Action
import vm.pds.h2o.automation.datamodels.ActionType
import vm.pds.h2o.automation.datamodels.ConditionType
import vm.pds.h2o.pinconf.Adapter

@Composable
fun AutomationPanel(
    adapter: Adapter,
    automation: DeviceAutomation?,
    onSave: (DeviceAutomation) -> Unit
) {
    if (automation == null) {
        Text("No automation configuration loaded.")
        return
    }
    
    // State for deletion confirmation dialog
    var pipelineToDeleteIndex by remember { mutableStateOf<Int?>(null) }

    if (pipelineToDeleteIndex != null) {
        AlertDialog(
            onDismissRequest = { pipelineToDeleteIndex = null },
            title = { Text("Delete Pipeline?") },
            text = { Text("Are you sure you want to delete this automation pipeline? This action cannot be undone.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        val index = pipelineToDeleteIndex!!
                        val newPipelines = automation.pipelines.toMutableList()
                        if (index in newPipelines.indices) {
                            newPipelines.removeAt(index)
                            onSave(automation.copy(pipelines = newPipelines))
                        }
                        pipelineToDeleteIndex = null
                    }
                ) {
                    Text("Delete", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { pipelineToDeleteIndex = null }) {
                    Text("Cancel")
                }
            }
        )
    }

    Column(modifier = Modifier.fillMaxSize()) {
        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(16.dp),
            modifier = Modifier.weight(1f).fillMaxWidth()
        ) {
            itemsIndexed(automation.pipelines) { index, pipeline ->
                PipelineCard(
                    pipeline = pipeline,
                    adapter = adapter,
                    onUpdate = { updatedPipeline ->
                        val newPipelines = automation.pipelines.toMutableList()
                        newPipelines[index] = updatedPipeline
                        onSave(automation.copy(pipelines = newPipelines))
                    },
                    onDelete = {
                        pipelineToDeleteIndex = index
                    }
                )
            }
            
            // Add Pipeline Button
            item {
                Button(
                    onClick = {
                        val newPipeline = Pipeline(
                            id = automation.pipelines.size + 1, // Simple ID generation
                            name = "New Pipeline ${automation.pipelines.size + 1}",
                            conditions = listOf(Condition(ConditionType.NONE, adapter.getAvailablePins().firstOrNull() ?: 0, 0)),
                            actions = listOf(Action(ActionType.NONE, adapter.getAvailablePins().firstOrNull() ?: 0, 0))
                        )
                        val newPipelines = automation.pipelines + newPipeline
                        onSave(automation.copy(pipelines = newPipelines))
                    },
                    modifier = Modifier.fillMaxWidth().padding(vertical = 16.dp)
                ) {
                    Icon(Icons.Default.Add, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Add New Pipeline")
                }
            }
        }
    }
}
