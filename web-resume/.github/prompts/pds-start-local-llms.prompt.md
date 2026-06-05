---
description: "Start LM Studio model instances on the host machine for multi-GPU parallel LLM routing (GPUs 0, 2, 3 — RTX 5090s). Runs start-lms-instances.ps1."
name: "pds-start-local-llms"
agent: agent
tools: [run_in_terminal, get_terminal_output]
---

Run `k:\PDS_AutomationSuite\WEB-Resume\ResumeServer\start-lms-instances.ps1` to start the LM Studio server and load the three named model instances (`qwen-0`, `qwen-1`, `qwen-2`) on the host machine's RTX 5090s.

```powershell
& 'k:\PDS_AutomationSuite\WEB-Resume\ResumeServer\start-lms-instances.ps1'
```

Wait for the script to finish. Report any errors. When done, remind the user to ensure `.env` has `LLM_MODEL_IDS=qwen-0,qwen-1,qwen-2` set and the Docker container is up.
