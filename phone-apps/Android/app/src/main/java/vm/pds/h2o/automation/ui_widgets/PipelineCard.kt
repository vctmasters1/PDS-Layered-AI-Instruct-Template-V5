package vm.pds.h2o.automation.ui_widgets

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import vm.pds.h2o.automation.datamodels.Pipeline
import vm.pds.h2o.automation.datamodels.Condition
import vm.pds.h2o.automation.datamodels.Action
import vm.pds.h2o.automation.datamodels.ConditionType
import vm.pds.h2o.automation.datamodels.ActionType
import vm.pds.h2o.pinconf.Adapter

@Composable
fun PipelineCard(
    pipeline: Pipeline,
    adapter: Adapter,
    onUpdate: (Pipeline) -> Unit,
    onDelete: () -> Unit
) {
    var expanded by remember { mutableStateOf(false) }

    Card(
        modifier = Modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            // Header Row: Name + Expand/Collapse
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (expanded) {
                    OutlinedTextField(
                        value = pipeline.name,
                        onValueChange = { onUpdate(pipeline.copy(name = it)) },
                        label = { Text("Pipeline Name") },
                        modifier = Modifier.weight(1f)
                    )
                } else {
                    Text(
                        text = pipeline.name,
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.weight(1f)
                    )
                }
                
                Row {
                    IconButton(onClick = onDelete) {
                        Icon(Icons.Default.Delete, contentDescription = "Delete Pipeline", tint = MaterialTheme.colorScheme.error)
                    }
                    IconButton(onClick = { expanded = !expanded }) {
                        Icon(
                            imageVector = if (expanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                            contentDescription = if (expanded) "Collapse" else "Expand"
                        )
                    }
                }
            }

            AnimatedVisibility(
                visible = expanded,
                enter = expandVertically(),
                exit = shrinkVertically()
            ) {
                Column {
                    Spacer(modifier = Modifier.height(16.dp))
                    
                    // Timer Configuration
                    if (pipeline.timer != null) {
                        Text("Timer Settings", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
                        Spacer(modifier = Modifier.height(4.dp))
                        TimerConfigWidget(
                            timerConfig = pipeline.timer,
                            onTimerChanged = { newTimer ->
                                onUpdate(pipeline.copy(timer = newTimer))
                            },
                            modifier = Modifier.padding(top = 4.dp)
                        )
                        HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))
                    }

                    // Conditions Section
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("Conditions", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
                    }
                    Spacer(modifier = Modifier.height(4.dp))
                    
                    pipeline.conditions.forEachIndexed { index, condition ->
                        Row(
                            verticalAlignment = Alignment.Top,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Box(modifier = Modifier.weight(1f)) {
                                ConditionWidget(
                                    condition = condition,
                                    adapter = adapter,
                                    onUpdate = { newCondition ->
                                        val newConditions = pipeline.conditions.toMutableList()
                                        newConditions[index] = newCondition
                                        onUpdate(pipeline.copy(conditions = newConditions))
                                    }
                                )
                            }
                            IconButton(
                                onClick = {
                                    val newConditions = pipeline.conditions.toMutableList()
                                    newConditions.removeAt(index)
                                    onUpdate(pipeline.copy(conditions = newConditions))
                                }
                            ) {
                                Icon(Icons.Default.Delete, contentDescription = "Remove Condition", tint = MaterialTheme.colorScheme.error)
                            }
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                    }
                    
                    Button(
                        onClick = {
                            val newCondition = Condition(
                                type = ConditionType.NONE,
                                sourcePin = adapter.getAvailablePins().firstOrNull() ?: 0,
                                param1 = 0
                            )
                            val newConditions = pipeline.conditions + newCondition
                            onUpdate(pipeline.copy(conditions = newConditions))
                        },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(Icons.Default.Add, contentDescription = null)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Add Condition")
                    }
                    
                    HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))

                    // Actions Section
                    Text("Actions", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
                    Spacer(modifier = Modifier.height(4.dp))
                    
                    pipeline.actions.forEachIndexed { index, action ->
                        Row(
                            verticalAlignment = Alignment.Top,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Box(modifier = Modifier.weight(1f)) {
                                ActionWidget(
                                    action = action,
                                    adapter = adapter,
                                    onUpdate = { newAction ->
                                        val newActions = pipeline.actions.toMutableList()
                                        newActions[index] = newAction
                                        onUpdate(pipeline.copy(actions = newActions))
                                    }
                                )
                            }
                            IconButton(
                                onClick = {
                                    val newActions = pipeline.actions.toMutableList()
                                    newActions.removeAt(index)
                                    onUpdate(pipeline.copy(actions = newActions))
                                }
                            ) {
                                Icon(Icons.Default.Delete, contentDescription = "Remove Action", tint = MaterialTheme.colorScheme.error)
                            }
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                    }
                    
                    Button(
                        onClick = {
                            val newAction = Action(
                                type = ActionType.NONE,
                                targetPin = adapter.getAvailablePins().firstOrNull() ?: 0,
                                value = 0
                            )
                            val newActions = pipeline.actions + newAction
                            onUpdate(pipeline.copy(actions = newActions))
                        },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(Icons.Default.Add, contentDescription = null)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Add Action")
                    }
                }
            }
        }
    }
}
