# Imagine Learning Agent Architecture

Multi-agent system designed for education with heavy variation across states, districts, and schools.

## Architecture Layers
- Gateway Agent (Router)
- Domain Supervisor (e.g. Education Supervisor)
- Specialized Worker Agents (Scaffolding, Security, Code/Content Generator, Validation, Test Generator)

Key Principles:
- Focused agents with minimal context for better token efficiency
- Strong governance and review at each handoff
- Scoped rule sets (state/district/school)

Created for Victor's interview prep.