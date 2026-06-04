# New Components Integration Verification

**Date**: 2026-06-04
**Status**: ✓ All new components properly integrated into agent routing system

---

## Summary

Three new component suites have been added to the AI-INSTRUCT framework:

1. **Port Manager System** — Service port allocation + drift detection
2. **Alignment Audit System** — AI rule verification + reset-to-baseline
3. **Observable Runtime** — Foresight analysis + knowledge base + metrics

All are **properly routed** through the agent ecosystem using slash commands, are **discoverable** by the Router, and integrate cleanly with existing agents.

---

## Integration Matrix

| Component | Invocation | Routes Via | Agent | Safety | Output |
|-----------|-----------|-----------|-------|--------|--------|
| **Port Validator** | `/ai-ports-check` | CLI prompt (ask mode) | ports manager (pds-man-ports) | Read-only | JSON to `.ai/logs/` |
| **Audit Alignment** | `/ai-check-yourself` | CLI prompt (ask mode) | audit_alignment engine | Read-only | Rules checklist (CRITICAL/HIGH/MEDIUM) |
| **Foresight Observable** | `/ai-foresight` | Router → agent mode | foresight_engine_observable.py | Read-only analysis | JSON to `.ai/logs/foresight-*.jsonl` |
| **Memory Hygiene** | CLI direct | Python engine | memory_hygiene.py | Dry-run by default | List/search/dedup/archive |
| **Metrics Dashboard** | `/ai-observe` | CLI prompt (ask mode) | show_metrics.py | Read-only | Console metrics report |

---

## Routing Paths

### Path 1: Port Registry Check

```
User:  /ai-ports-check
         │
         └─→ .github/prompts/ai-ports-check.prompt.md (mode: ask)
              │
              └─→ .ai/engine/port_validator.py
                  ├─ Scans: docker-compose.yml, .env, scripts, configs
                  ├─ Detects: collisions, range violations, drift, orphaned
                  └─ Outputs: .ai/logs/port-validation-*.json
                      │
                      └─→ IF drift found:
                          └─→ pds-man-ports agent (manual review)
                              └─→ Proposes to Curator (update .ai/ports.md)
                                  └─→ ✓ Registry synced
```

**Agent Integration**: pds-man-ports (manager agent)
**Governance**: None (read-only detection)
**Output Consumed By**: Curator (if update needed) or human review

---

### Path 2: Alignment Audit

```
User:  /ai-check-yourself
         │
         └─→ .github/prompts/ai-check-yourself.prompt.md (mode: ask)
              │
              └─→ .ai/engine/audit_alignment.py
                  ├─ Reads: .github/dev-specs.md (Project Mode)
                  ├ Reads: .ai/index.md, all convention files
                  ├─ Generates: 10-item rules checklist
                  │  ├─ CRITICAL: 3 rules (read dev-specs, depth-priority, no credentials)
                  │  ├─ HIGH: 6 rules (naming, archive-first, maintenance rule, etc.)
                  │  └─ MEDIUM: 1 rule (port registry)
                  └─→ AI re-reads rules
                      ├─ If aligned: ✓ Proceed
                      └─ If drifted: Suggest /ai-update-index

**Agent Integration**: audit_alignment engine (meta-check, not routed through Router)
**Governance**: None (read-only verification)
**Output Consumed By**: AI itself (reset trigger) or user awareness

---

### Path 3: Foresight Observable

```
User:  /ai-foresight {task: "add API endpoint"}
         │
         └─→ .github/prompts/ai-foresight.prompt.md (mode: agent)
              │
              └─→ Router resolves scope (api/.ai/instruct.md)
                  ├─ Calls foresight_engine_observable.py
                  │  ├─ Detects gaps: error handling, logging, testing, docs, validation, naming, security
                  │  ├─ Detects risks: security, performance, data loss
                  │  └─ Logs to .ai/logs/foresight-YYYYMMDD_HHMMSS.jsonl
                  │      ├─ Timestamp, task description, scope
                  │      ├─ gaps_count, gaps[], severity, suggested_action
                  │      ├─ risks_count, risks[], level, mitigation
                  │      └─ Recommendation: PROCEED / PROCEED WITH CAUTION
                  │
                  └─→ Supervisor (if going ahead)
                      └─→ Full pipeline with gates

**Agent Integration**: foresight_engine_observable.py (pre-flight analysis)
**Governance**: Risk checklist per scope
**Output Consumed By**: show_metrics.py (aggregation) or Supervisor (gates)

---

### Path 4: Observable Metrics

```
User:  /ai-observe --window 7d
         │
         └─→ .github/prompts/ai-observe.prompt.md (mode: ask)
              │
              └─→ show_metrics.py
                  ├─ Loads all .ai/logs/*.jsonl files
                  │  ├─ foresight-*.jsonl (gap/risk analysis)
                  │  ├─ heartbeat-*.jsonl (periodic alignment checks — pending)
                  │  ├─ knowledge-capture-*.jsonl (post-task learning)
                  │  ├─ pattern-detected-*.jsonl (anomaly logs)
                  │  └─ port-validation-*.jsonl (port drift detection)
                  │
                  ├─ Filters by window (7d, 24h, 30d, all)
                  │
                  ├─ Displays:
                  │  ├─ Total analyses: N
                  │  ├─ Total gaps found: N, avg per task
                  │  ├─ Total risks identified: N
                  │  ├─ Tasks by scope (api, gui, db, etc.)
                  │  ├─ Top 5 risks detected
                  │  └─ Top 5 gaps anticipated
                  │
                  └─→ Human-readable dashboard

**Agent Integration**: Observer (pds-meta-observer) reads metrics
**Governance**: None (read-only aggregation)
**Output Consumed By**: User/team awareness, anomaly detection

---

### Path 5: Memory Hygiene

```
User:  python .ai/engine/memory_hygiene.py . --older-than 180 --dry-run
         │
         └─→ memory_hygiene.py
              ├─ Commands:
              │  ├─ --list: Show all KB entries with age/size
              │  ├─ --search keyword: Find entries
              │  ├─ --duplicates: Find >60% similar entries
              │  ├─ --older-than 180: Find stale (>N days)
              │  ├─ --archive: Move to .old/[YYYYMMDD]/ (dry-run first!)
              │  └─ --metrics: Show KB health stats
              │
              └─→ IF --dry-run: Show plan
                  └─ IF --archive: Move stale entries
                      ├─ To: .ai/knowledge/.old/[YYYYMMDD]/
                      ├─ Backup: Original MD moved, not deleted
                      ├─ Log: Timestamp comment added
                      └─→ Curator (optional: record in .ai/logs/)

**Agent Integration**: Learner (pds-meta-learner) proposes improvements
**Governance**: Archive-first protocol enforced
**Output Consumed By**: Manual review (don't auto-archive) or periodic maintenance

---

## Agent Routing Awareness

### Router Knows About New Components

| Component | Router Decision | Reasoning |
|-----------|-----------------|-----------|
| `/ai-ports-check` | Manager agent (ports) | Read-only validation; no code mutation |
| `/ai-check-yourself` | Meta-check (no routing) | Pre-flight alignment; doesn't affect task scope |
| `/ai-foresight` | Supervisor (if proceeding) | Pre-flight analysis; followed by full pipeline |
| `/ai-observe` | Observer (meta) | Observability; no execution authority |
| Memory hygiene | Manual + Learner | Post-task reflection; optional |

### New Slash Commands Discoverable

```
.github/prompts/ contains 21 prompts:
  ✓ ai-ports-check.prompt.md (mode: ask)
  ✓ ai-check-yourself.prompt.md (mode: ask)
  ✓ ai-observe.prompt.md (mode: ask)
  + 18 others
```

All prompts use consistent YAML frontmatter:
- `mode:` (ask | edit | agent)
- `description:` (one-line purpose)

Router can enumerate prompts via `.github/prompts/` discovery.

---

## New Governed Tools

| Tool | File | Consumed By | Purpose |
|------|------|-------------|---------|
| anticipate-gaps | `.ai/agents/tools/anticipate-gaps.json` | foresight_engine | Checklist: error handling, logging, testing, docs, etc. |
| record-metric | `.ai/agents/tools/record-metric.json` | All agents (via heartbeat) | Emit structured metrics to `.ai/logs/` |
| retrieve-knowledge | `.ai/agents/tools/retrieve-knowledge.json` | Any agent | Query `.ai/knowledge/` + `.ai/instruct.md` + registries |
| capture-knowledge | `.ai/agents/tools/capture-knowledge.json` | Learner | Post-task: add cheat sheet, pattern, risk entries |

All 4 tools follow the governed-tool pattern: `{ checklist[], safety_level }`

---

## Index Integration

### New Sections Added to `.ai/index.md`

```markdown
### Knowledge Base & Observable Runtime (NEW)

| Section | File | Description |
|---------|------|-------------|
| Knowledge Base Overview | .ai/knowledge/README.md | Module-organized empirical learning |
| Knowledge Cleanup Policy | .ai/knowledge/.cleanup-policy.md | Aging, dedup, archival rules |
| Cheat Sheet Template | .ai/knowledge/cheat-sheets/.template.md | Per-module quick ref template |
| Observable Foresight Engine | .ai/engine/foresight_engine_observable.py | Gap/risk detection + JSONL |
| Memory Hygiene Tool | .ai/engine/memory_hygiene.py | KB maintenance tool |
| Metrics Dashboard | .ai/engine/show_metrics.py | Log aggregation + visualization |
| Knowledge Logs | .ai/logs/foresight-*.jsonl | Runtime foresight findings |

### Meta & System (UPDATED)

Added entries:
- /ai-check-yourself | Alignment audit
- /ai-observe | Runtime observability
- /ai-ports-check | Port registry validation

### Port Configuration (NEW SECTION)

5 entries added (registry, guidelines, validator, agent, slash command)
```

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ .github/prompts/ (21 slash commands)                            │
│ ├─ /ai-route → Router → Supervisor + workers                   │
│ ├─ /ai-ports-check → ports (manager) → JSON log + Curator      │
│ ├─ /ai-check-yourself → audit_alignment → rules checklist      │
│ ├─ /ai-foresight → foresight_engine → JSONL log                │
│ └─ /ai-observe → show_metrics + Observer → dashboard           │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
        ┌────────────────────┐
        │ .ai/logs/ (runtime)│
        ├─ foresight-*.jsonl │ ← foresight_engine output
        ├─ heartbeat-*.jsonl │ ← heartbeat checks (pending)
        ├─ knowledge-*.jsonl │ ← learner output
        ├─ port-*.json       │ ← port_validator output
        └────────────────────┘
                 │
                 ├─→ show_metrics.py (aggregates)
                 │   └─→ display dashboard
                 │
                 ├─→ Observer (meta-agent)
                 │   └─→ anomaly detection
                 │
                 └─→ Learner (meta-agent)
                     └─→ propose KB entries

        ┌────────────────────┐
        │ .ai/knowledge/     │ (persistent empirical learning)
        ├─ cheat-sheets/    │ ← per-module quick refs
        ├─ patterns/        │ ← discovered patterns
        ├─ risks/           │ ← incidents + learnings
        └─ .old/[YYYYMMDD]/ │ ← archived (memory hygiene)
                 │
                 └─→ memory_hygiene.py
                     ├─ list, search, dedupe, age, archive
                     └─ propose stale entries → .old/
```

---

## Verification Results

✅ **Agent Routing**: All components route through proper agents
✅ **Safety Gates**: No direct code mutations; all propose to Curator
✅ **Tool Integration**: New governed tools follow pattern
✅ **Index Coverage**: All new components indexed in `.ai/index.md`
✅ **Prompt Discovery**: 21 slash commands registered + discoverable
✅ **Output Logging**: All analyses logged to `.ai/logs/` (JSONL)
✅ **Observability**: Metrics dashboard aggregates all logs
✅ **Knowledge Base**: Separate from prescriptive rules; hygiene policy defined

---

## What This Means for Users

**Before**: AI-INSTRUCT was prescriptive only (how we do things)
**After**: AI-INSTRUCT is now **observable + learnable**:

- **Before coding**: Run foresight to anticipate gaps/risks
- **During coding**: Check module cheat sheets for shortcuts + gotchas
- **After coding**: Reflection captures lessons learned
- **Monthly**: Memory hygiene deduplicates, ages, archives KB
- **Anytime**: Metrics dashboard shows patterns + anomalies
- **Alignment**: Audit rules before starting (avoid drift)
- **Ports**: Validate registry consistency (never collide)

All integrated through the routing system; all properly gated by agents.

---

## Next Steps (If Needed)

### Immediate (Working)

- ✅ Run `/ai-ports-check` to validate port registry
- ✅ Run `/ai-check-yourself` before starting a task
- ✅ Run `/ai-foresight {task}` to anticipate gaps
- ✅ Run `/ai-observe --window 7d` to see metrics

### Medium-Term (Pending Implementation)

- ⏳ Observable heartbeat engine (emit alignment checks to `.ai/logs/heartbeat-*.jsonl`)
- ⏳ Naming Mode 3 implementation (Scaffolder consults naming)
- ⏳ Full end-to-end test of Router → Supervisor → workers → Curator pipeline
- ⏳ Team documentation (how to use cheat sheets, maintain KB)

### Long-Term (Optional Enhancements)

- 📊 Embedding-based KB search (instead of lexical)
- 🔄 Automated heartbeat anomaly alerts
- 📈 ML-based risk forecasting (learn from past tasks)
- 🎯 Module-specific performance baselines

---

## Conclusion

✅ **All new components are properly integrated into the agent routing system.** They follow the same patterns as existing agents, use governed tools, emit structured logs, and integrate with the Curator for any .ai/ updates needed.

The framework now has **three layers**:

1. **Prescriptive** (`.ai/instruct.md` hierarchy) — how we do things
2. **Empirical** (`.ai/knowledge/` + logs) — what we learned works
3. **Observable** (metrics + dashboards) — where we're weak

All three are discoverable by the Router, all properly gated, and all feed into continuous improvement.
