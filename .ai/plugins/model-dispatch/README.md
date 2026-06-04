# Model Dispatch Plugin

**Status**: disabled (default — adopters opt in)
**Version**: 0.1.0
**Last Updated**: 2026-06-04

> Optional plugin. The AI-INSTRUCT framework is fully functional without it.
> Enable only if you want to declare per-agent or per-task model preferences
> against a tier table you define.

---

## Contents

| Section | What's here |
|---------|-------------|
| [What it does](#what-it-does) | Capabilities the plugin provides |
| [What it does NOT do](#what-it-does-not-do) | Out-of-scope items |
| [Enable](#enable) | Adopter steps to activate |
| [Disable](#disable) | How to turn off |
| [Files](#files) | Inventory of plugin contents |

---

## What it does

- Reserves a `model:` YAML frontmatter key that any agent or prompt MAY declare (e.g. `model: local-strong`).
- Defines a **tier table** ([tiers.example.yaml](tiers.example.yaml)) mapping tier names to concrete model endpoints (local LM Studio / Ollama / cloud APIs).
- Ships a **discovery script** ([scripts/detect-local-llms.ps1](scripts/detect-local-llms.ps1)) that inventories the adopter's local LLM stack and machine specs, so tier assignments are evidence-based.
- Provides a **model dispatcher** ([dispatcher.py](dispatcher.py)) that routes work to loaded models without reloading them—avoiding the startup overhead of large model weights.
- Wires a validator check (`model-tier-resolves`) that flags any `model:` value that doesn't exist in the active tier table.
- Supports per-GPU device isolation (e.g. exclude display-only GPUs from compute tiers).

## Dispatcher (Runtime)

The `dispatcher.py` module enables real work dispatch:

- **Probes** LM Studio / Ollama to see which tier models are currently loaded
- **Routes** a prompt to a specific tier (or falls back to the next available tier if not loaded)
- **Executes** inference without triggering model reload
- **Supports GPU device selection** — restricts tiers to specific GPUs (e.g., `gpu_devices: [0, 1, 3]` excludes GPU 2)

### Test the dispatcher

```pwsh
# Probe: see which models are loaded
pwsh .github/debug/dispatch-test.ps1 -Command probe

# Status: list available (loaded) tiers
pwsh .github/debug/dispatch-test.ps1 -Command status

# Dispatch: route a test prompt
pwsh .github/debug/dispatch-test.ps1 -Command dispatch -Tier local-fast -Prompt "Say hello"
```

### Optimize tier configuration

```pwsh
# Analyze hardware + loaded models, get tier recommendations
pwsh .github/debug/suggest-tiers.ps1
```

The advisor shows:
- Your hardware (CPU cores, RAM, GPU count/VRAM)
- Currently-loaded models and their sizes
- Recommended tier assignments for best space/performance utilization
- GPU device restrictions (excludes display-only cards)
- VRAM % utilization + headroom for expansion
- Copy-paste config block ready for `tiers.yaml`

Or use the slash command:
```
/ai-suggest-tiers
```

### Use in your workflows

1. **Pre-load models** in LM Studio (or Ollama) on your desired GPUs
2. **Configure tiers.yaml** with model IDs that match what you've loaded
3. **Call the dispatcher** from agents, scripts, or external tools:
   ```python
   from dispatcher import ModelDispatcher

   dispatcher = ModelDispatcher(".ai/plugins/model-dispatch")
   result = dispatcher.dispatch(
       tier="local-fast",
       prompt="Your task here",
       fallback=True  # try next tier if not loaded
   )
   ```

## What it does NOT do

- It does **not** auto-load or unload models. Models must be pre-loaded via LM Studio or Ollama.
- It does **not** require any specific provider. Tier values are arbitrary strings the adopter defines.
- It does **not** modify the 19 core agents. `model:` is optional everywhere.

---

## Enable

1. Install Python dependencies:
   ```pwsh
   pip install pyyaml requests
   ```

2. **Copy your machine config** (adopter-specific, NOT committed):
   ```pwsh
   cp .ai/plugins/model-dispatch/load_strategy.example.yaml .ai/plugins/model-dispatch/load_strategy.yaml
   cp .ai/plugins/model-dispatch/tiers.example.yaml .ai/plugins/model-dispatch/tiers.yaml
   ```

3. **Edit your load_strategy.yaml** (which models to load, which tiers):
   - Set `enabled: true` for models you want loaded
   - Assign each to a tier (local-fast, local-strong, local-heavy, local-embed, local-vision)
   - Set `gpu_devices:` per model to avoid display-only GPUs

4. **Load models into LM Studio**:
   - Manually load each enabled model via LM Studio UI
   - Or run the loader script (when implemented):
     ```pwsh
     pwsh .github/debug/load-models.ps1
     ```

5. **Verify state**:
   ```pwsh
   pwsh .github/debug/verify-loaded-models.ps1
   ```

6. **Optimize tier assignments**:
   ```pwsh
   pwsh .github/debug/suggest-tiers.ps1
   ```

7. **Open [plugin.yaml](plugin.yaml) and flip** `status: disabled` → `status: experimental`.

8. **Test the dispatcher**:
   ```pwsh
   pwsh .github/debug/dispatch-test.ps1 -Command dispatch -Tier local-fast -Prompt "hello"
   ```

Promote to `status: stable` once satisfied.

## Machine-Specific Configuration

The following files are **NOT committed** (added to `.gitignore`):
- `load_strategy.yaml` — your team's model loading strategy (copy from `.example.yaml`)
- `tiers.yaml` — your GPU and tier assignments (copy from `.example.yaml`)
- `state/` — runtime state (ephemeral)

**Why?** Different team members have different hardware, different deployments have different model availability. These configs are machine-specific.

**Adopter workflow:**
```
1. Copy example files to live config
2. Edit to match your hardware / preferences
3. Never commit (they're in .gitignore)
4. Share strategy via documentation or team wiki
```

## Configuration Management (Save, Switch, Compare)

You can save multiple configurations and switch between them instantly:

```powershell
# List all saved configurations
pwsh .github/debug/config-swap.ps1 -Command list
→ production | 2026-06-04 06:04:08 | tiers=✓ | strategy=✓
  experimental | 2026-06-04 05:30:22 | tiers=✓ | strategy=✓

# Save current configuration as a named snapshot
pwsh .github/debug/config-swap.ps1 -Command save -Name "experiment-v2"

# Switch to a saved configuration
# (If current differs from latest backup, you'll be prompted to save first)
pwsh .github/debug/config-swap.ps1 -Command switch -Name "production"

# Apply a tier configuration from file
pwsh .github/debug/config-swap.ps1 -Command apply -ConfigFile tiers-new.yaml
```

**Key benefit**: You can now **experiment safely**. Save a config, try a new model assignment, and revert in seconds if you want to compare.

Snapshots are timestamped and **machine-specific** (all in `.gitignore`). Auto-backups prevent accidental loss if you switch without saving.

## Disable

Flip `status:` back to `disabled`, or delete this entire directory.

---

## Files

| File | Purpose | Committed? |
|---|---|---|
| [plugin.yaml](plugin.yaml) | Manifest. Defines status, capabilities, dependencies. | ✓ |
| [instruct.md](instruct.md) | Depth-priority instructions for work inside this plugin directory. | ✓ |
| [dispatcher.py](dispatcher.py) | Runtime model dispatcher. Routes work to loaded models; no reload overhead. | ✓ |
| [suggest_tiers.py](suggest_tiers.py) | Configuration advisor. Analyzes hardware + models, recommends tier assignments. | ✓ |
| [tiers.example.yaml](tiers.example.yaml) | **Template** tier table. Copy to `tiers.yaml` and edit per machine. | ✓ |
| **tiers.yaml** | **Live tier configuration** (machine-specific, `.gitignore`d). | ✗ |
| [load_strategy.example.yaml](load_strategy.example.yaml) | **Template** model loading strategy. Copy to `load_strategy.yaml` and edit per machine. | ✓ |
| **load_strategy.yaml** | **Live model loading strategy** (machine-specific, `.gitignore`d). | ✗ |
| [adapters/lmstudio.md](adapters/lmstudio.md) | Contract for talking to a local LM Studio server. | ✓ |
| [adapters/ollama.md](adapters/ollama.md) | Contract for talking to a local Ollama server. | ✓ |
| [adapters/cloud.md](adapters/cloud.md) | Contract for cloud-frontier fallback (Copilot, Anthropic, OpenAI, etc.). | ✓ |
| [scripts/detect-local-llms.ps1](scripts/detect-local-llms.ps1) | Read-only inventory probe. Never installs anything. | ✓ |
| [config/index.md](config/index.md) | Documentation for configuration snapshots and swapping. | ✓ |
| **config/active.txt** | Current active configuration name (machine-specific, `.gitignore`d). | ✗ |
| **config/snapshots/** | Directory of saved tier + load-strategy configurations (machine-specific, `.gitignore`d). | ✗ |
