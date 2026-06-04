# `.deployment/` — Deployment Modes as First-Class Scopes

> **Pattern**: Each deployment mode owns its own `.ai/instruct.md`. The active mode is selected by the `DEPLOY_MODE` environment variable. When agents work in a deployment context, the deepest `.ai/instruct.md` (the mode's) is authoritative — same depth-priority rule as every other module.

---

## Why this exists

Deployment is the only "module" of a project where **the same code base behaves differently** depending on environment. A monolithic `.ai/instruct.md` that tries to cover dev-local, LAN-shared, managed-cloud, and self-hosted-public ends up either contradictory or vague. This convention solves that by giving each mode its own scope, so an agent reasoning about "how do I expose port 443 here?" gets a single, unambiguous answer.

## Conventions

| Rule | Detail |
|---|---|
| **One subdirectory per mode** | `.deployment/<mode>/` where `<mode>` is kebab-case and matches `DEPLOY_MODE` exactly |
| **Each mode is a depth-priority scope** | `.deployment/<mode>/.ai/instruct.md` is authoritative when that mode is active |
| **Mode names are registered** | The `naming` agent enforces uniqueness and convention. Consult Mode 3 before adding a new mode |
| **Self-contained** | A mode's `instruct.md` answers: what runs, on what ports, with what env vars, accessed how, with what cert story, with what troubleshooting checklist |
| **Cross-link, don't restate** | When two modes share a fact (e.g., the same `JWT_SECRET` rotation procedure), one is canonical and the others link to it |
| **Never delete a retired mode** | Archive it per [`.ai/maintenance.md`](../.ai/maintenance.md) |

## Required structure of a mode file

Every `.deployment/<mode>/.ai/instruct.md` contains, in order:

1. **Mode Overview** table (URL, access, TLS, database, use case, setup time)
2. **Prerequisites** (accounts, CLIs, ports)
3. **Quick Start** (3–6 commands)
4. **What Runs** (services × tech × access × port table)
5. **Access URLs**
6. **Environment Configuration** (`.env` template — never real secrets)
7. **Operational tasks** (logs, restart, backup, restore)
8. **Security Notes**
9. **Troubleshooting**
10. **Operational Checklist** (verifiable end-state)
11. **Next Steps** (links to sibling modes)
12. **Files in This Mode** (table of every file the mode owns)

## Mode selection

Agents and humans both rely on a single signal:

```bash
# Check current mode
echo $DEPLOY_MODE       # POSIX
echo $env:DEPLOY_MODE   # PowerShell
```

Setting it (typically before `docker compose up` or `npm run start`):

```bash
export DEPLOY_MODE=dev-local                # POSIX
$env:DEPLOY_MODE = "dev-local"              # PowerShell
```

Or use the `/ai-deploy-mode` slash command, which prints the active mode and the path to its authoritative `.ai/instruct.md`.

## Reference modes shipped with this template

| Mode | Use case | Setup | Cost |
|---|---|---|---|
| [`dev-local`](dev-local/.ai/instruct.md) | Daily local development | < 2 min | $0 |
| [`dev-lan`](dev-lan/.ai/instruct.md) | LAN sharing, self-signed HTTPS | ~5 min | $0 |
| [`prod-railway`](prod-railway/.ai/instruct.md) | Managed cloud, hands-off | ~10 min | Free tier → paid |
| [`prod-self-serve`](prod-self-serve/.ai/instruct.md) | Public internet, DDNS + Let's Encrypt | ~30 min | $0 (your hardware) |

These are **starting points**. Edit, replace, or add modes during onboarding (`/ai-onboard`). The `deployment-manager` agent watches for drift between modes and the codebase.

## Maintenance

The [`deployment-manager`](../.github/agents/pds-man-deployment.agent.md) agent owns this surface:

- Watches recent code changes for impact on any active mode (new env var, new service, new port, new domain).
- Diffs each `.deployment/<mode>/.ai/instruct.md` against reality.
- Proposes update / add / retire / rename per mode.
- Hands index updates to the `curator` and registry rows to `naming`.

Run `/ai-deploy-mode` to inspect or switch modes. Run the deployment-manager agent (or wait for it to be triggered by the workflow-manager / curator) when you change anything that affects how the project is built or run.
