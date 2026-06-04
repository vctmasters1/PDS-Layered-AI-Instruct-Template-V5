# Tool Definitions for Governing/Supervisor Agents

## 1. get_applicable_rules
- state (required)
- district (required)
- school (optional)
- subject (optional)

## 2. delegate_task
- agent_name
- task_description
- previous_output
- rules_context

## 3. review_output
- agent_name
- output
- stage

## 4. route_to_domain (Gateway only)
- domain
- scoped_context