# Agent Routing Quick Reference

> **Purpose**: One-page cheat sheet for understanding agent ecosystem and routing decisions.
>
> **For**: AI agents, team leads, anyone invoking `/ai-route` or understanding agent flow.

---

## Entry Points (How to Start)

```
User request
    ↓
Router (pds-meta-router)
    • Read .ai/index.md once per session
    • Resolve deepest .ai/instruct.md for affected paths
    • Load governance overlay (if any)
    • Pick next-hop agent
    ↓
[Next Hop → See table below]
```

---

## Agent Routing Table (When Router Decides)

| Request | Next Hop | Via | Why |
|---------|----------|-----|-----|
| "Add new API endpoint" | Supervisor | Scaffolder → Generator → Validator → Tester → Reviewer | Multi-step, needs naming consultation |
| "Check port registry for drift" | ports (manager) | `/ai-ports-check` | Single-step, read-only validation |
| "Audit my rules; am I aligned?" | audit_alignment engine | `/ai-check-yourself` | Meta-check; no code change |
| "Show me metrics and patterns" | Observer (meta) | `/ai-observe` + show_metrics.py | Read-only observability |
| "Refactor imports in api/" | Validator (direct) | API scope validation | Single-step focused task |
| "Archive old test files" | Cleanup | `/ai-archive` | Safe removal (archive-first) |
| "Update .ai/instruct.md after change" | Curator | After Reviewer | Automatic; maintenance rule |
| "Should I install package X?" | environment (manager) | Gate in Supervisor stage 2b | Host-mutation check |
| "What's the KB status?" | Learner + memory_hygiene | `/ai-observe` + tools | Post-task or on-demand |
| "Explore project structure" | Explorer (meta) | `/ai-explore` or free navigation | Read-only discovery |

---

## Agent Capabilities Checklist

### Primary Pipeline (Supervisor Orchestrates)

| Stage | Agent | Can | Cannot | Next |
|-------|-------|-----|--------|------|
| 1 | Scaffolder | Consult naming Mode 3; produce JSON plan | Edit code | → Validator |
| 2 | Generator | Write code/config from scaffold | Deviate from scaffold | → Validator |
| 3 | Validator | Check conventions & naming Mode 4 | Edit files | → Tester (if PASS) |
| 4 | Tester | Write tests | Approve non-passing tests | → Reviewer |
| 5 | Reviewer | Check instruction drift | Merge if issues | → Curator |
| 6 | Curator | Update .ai/instruct.md, .ai/index.md | Edit source code | ✓ Done |

### Management Agents (Always On, Read-Only Detectors)

| Agent | Input | Output | To | Can | Cannot |
|-------|-------|--------|----|----|--------|
| ports | docker-compose, .env, code | drift_report[] | Curator | Detect collisions, range violations, unregistered services | Modify docker-compose or .ai/ports.md |
| naming | artifact candidates (Mode 3) | proposed_names[] | Scaffolder/Generator | Assign names per registry | Invent names; edit registries directly |
| environment | host-mutation proposal | verdict | Supervisor gate | Block unsafe installs | Proceed without approval |
| curator | change_set after Reviewer | updated_docs | ✓ Done | Update .ai/ files | Edit source code |
| deployment | .deployment/*/instruct.md drift | drift_report[] | Curator | Detect mode misalignment | Modify deployment configs |
| prompt | `.github/prompts/` drift | update_proposal[] | Curator | Propose prompt updates | Modify prompts directly |
| workflow | `.github/workflows/` drift | update_proposal[] | Curator | Propose CI/CD updates | Modify workflows directly |
| todo | task list drift | aged_items[], dedup[] | Owner | Deduplicate, age, archive | Modify tasks directly |

### Meta Agents (System Coordination)

| Agent | Input | Output | Purpose |
|-------|-------|--------|---------|
| Router | User request + context | routing_decision | Entry point; scope resolver |
| Supervisor | scope + task | gate history + change_set | Orchestrates pipeline; manages gates |
| Observer | `.ai/logs/` (all JSONL) | metrics_digest | Anomaly detection; pattern finder |
| Learner | change_set + test results | proposed_KB_entries[] | Post-task reflection; captures insights |
| Compliance | source code + imports | modularity_findings[] | Structural critic; detects drift |
| Explorer | project structure | findings[] | Read-only navigation; discovery |

---

## Fast Decision Tree

**Router uses this logic**:

```
1. Is it multi-step work (generate + validate)?
   YES → Supervisor (full pipeline with gates)
   NO → go to 2

2. Is it naming consultation?
   YES → Scaffolder (calls naming Mode 3)
   NO → go to 3

3. Is it single-step validation?
   YES → Validator (direct)
   NO → go to 4

4. Is it testing?
   YES → Tester (direct)
   NO → go to 5

5. Is it read-only exploration?
   YES → Explorer (meta)
   NO → go to 6

6. Is it management (ports, env check)?
   YES → [port | environment | etc] (manager agent)
   NO → go to 7

7. Is it .ai/ maintenance?
   YES → Curator (direct, after prior stage)
   NO → go to 8

8. Is it observability?
   YES → Observer or foresight engine
   NO → UNKNOWN — ask user to clarify
```

---

## Key Rules

### Hard Rules (Never Break)

1. ✅ **Router resolves scope first** — every request goes through scope resolution
2. ✅ **Supervisor gates between stages** — no direct jumps from generator to reviewer
3. ✅ **Naming consulted at scaffold** — every new artifact gets `naming_source` attribution
4. ✅ **Naming validated again** — validator checks Mode 4 to confirm consultation
5. ✅ **Archive before replace** — cleanup agent uses archive-first protocol
6. ✅ **Management agents don't mutate code** — all propose to Curator
7. ✅ **Environment gate before host mutations** — stage 2b mandatory if command would install/configure
8. ✅ **Governance is additive** — never replaces deepest `.ai/instruct.md`
9. ✅ **Heartbeat every 6 steps** — agents re-read scope and re-align per `agent-config.yaml`
10. ✅ **AI-INSTRUCT Maintenance Rule** — `.ai/instruct.md` updated same operation as architectural change

### Soft Rules (Respect, But Fallback)

- If scope resolution fails → route to nearest ancestor, flag gap
- If governance overlay empty → depth-priority alone is valid
- If naming not yet implemented → scaffolds carry `naming_source` placeholders
- If stage fails twice → escalate to user (don't retry silently)

---

## How to Know If an Agent is Properly Configured

**Checklist**:

- [ ] Agent has a `.agent.md` file in `.github/agents/`
- [ ] Agent has YAML frontmatter: `description:` + `tools:` whitelist
- [ ] Agent knows its inputs (task, scope_path, previous_output)
- [ ] Agent knows its outputs (what gets passed to next agent)
- [ ] Agent cites rule sources (not inventing conventions)
- [ ] Agent routes back to Supervisor or halts (doesn't self-delegate)
- [ ] If manager → proposes to Curator, doesn't commit directly
- [ ] If worker → reads scope's `.ai/instruct.md` first
- [ ] If meta → understands it has no execution authority

---

## Example Routing Trace

**Request**: "Add a new database migration for users table"

```
USER: /ai-route {task: add migration}
  │
  ├─ ROUTER reads:
  │  - .ai/index.md (once per session)
  │  - db/.ai/instruct.md (deepest scope for db/)
  │  - .ai/governance/ (none found)
  │
  ├─ ROUTER decides:
  │  - Scope: db/.ai/instruct.md
  │  - Action: multi-step (generate + test + validate)
  │  - Next hop: Supervisor
  │  - Governance: none
  │
  ├─ ROUTER outputs routing_decision
  │
  └─ SUPERVISOR receives:
     ├─ Calls Scaffolder
     │  ├─ Reads db/.ai/instruct.md + .ai/database-schema.md
     │  ├─ Consults naming Mode 3 for table/column names
     │  └─ Outputs scaffold (JSON)
     │
     ├─ Validator gates scaffold (PASS)
     │
     ├─ Calls Generator
     │  ├─ Reads scaffold + naming approval
     │  ├─ Generates migration.py
     │  └─ Outputs change_set
     │
     ├─ Validator gates generator output
     │  ├─ Checks naming Mode 4 (confirms Mode 3 was consulted)
     │  ├─ Checks .ai/database-schema.md conventions
     │  └─ PASS
     │
     ├─ Calls Tester
     │  ├─ Writes migration_test.py
     │  ├─ Runs tests
     │  └─ PASS
     │
     ├─ Calls Reviewer
     │  ├─ Checks instruction drift in db/.ai/instruct.md
     │  ├─ Checks archive-first protocol was followed
     │  └─ PASS
     │
     ├─ Calls Curator
     │  ├─ Updates db/.ai/instruct.md (if schema changed)
     │  ├─ Runs /ai-update-index (cascade to root)
     │  └─ ✓ Done
     │
     └─ SUPERVISOR outputs final_summary
         └─ Added migration.py, updated db/.ai/instruct.md, tests passing
```

---

## Common Mistakes to Avoid

❌ **Don't**: Skip scope resolution (just pick an agent)
✅ **Do**: Let Router resolve scope first

❌ **Don't**: Have generator bypass validation
✅ **Do**: Let Validator check naming Mode 4 after generator

❌ **Don't**: Have management agent mutate code
✅ **Do**: Have manager propose to Curator

❌ **Don't**: Manually update .ai/ files mid-pipeline
✅ **Do**: Let Curator handle .ai/ updates after Reviewer

❌ **Don't**: Invent names without consulting naming
✅ **Do**: Every artifact in scaffold must have `naming_source`

❌ **Don't**: Skip environment gate before host commands
✅ **Do**: Call environment before any install/config command

---

## See Also

- [AGENT-NETWORK-VERIFICATION.md](AGENT-NETWORK-VERIFICATION.md) — Detailed network map
- [`.ai/index.md`](../../.ai/index.md) — Master index of instructions
- [`.ai/agent-config.yaml`](../../.ai/agent-config.yaml) — Runtime configuration
- [`.ai/heartbeat.md`](../../.ai/heartbeat.md) — Periodic alignment procedure
- [`.github/copilot-instructions.md`](../copilot-instructions.md) — Meta-instructions for AI
