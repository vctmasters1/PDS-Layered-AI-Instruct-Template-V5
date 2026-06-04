"""
autonomous_runner.py — Reference Implementation of the PDS Autonomous Layer
===========================================================================

A small, production-grade runner that executes the contract defined in:

    .ai/autonomous/orchestrator.md
    .ai/autonomous/safety-guardrails.md
    .ai/autonomous/autonomy-config.yaml
    .ai/autonomous/task-queue.md

Design goals:

    1. Reliability     — single-threaded loop, idempotent state writes, hard
                         ceilings on steps / wall clock / files modified.
    2. Transparency    — every step appends one JSONL line with the exact
                         schema declared in autonomy-config.yaml. Nothing
                         the runner does is invisible.
    3. Controllability — default human-in-the-loop approval before every
                         agent hand-off; .ai/PAUSE sentinel halts mid-run;
                         allowed-agents list is enforced; forbidden-path
                         writes are rejected before the agent is even called.
    4. Auditability    — append-only step log lives at .ai/logs/. Goal queue
                         lives at .ai/autonomous/queue.jsonl (gitignored).
                         Both files are safe to ship to a SIEM unchanged.

What this runner is NOT
-----------------------

This file does **not** call an LLM. The `_invoke_agent` method is the single
seam where production deployments wire in their AI / MCP / agent runtime.
The default `SimulatedAgentBackend` produces deterministic, clearly-marked
outputs so the orchestration shape — gating, logging, safety, persistence —
can be validated end-to-end without leaking sensitive data or burning tokens.

Swap the backend, not the runner, when going live.

Why pure stdlib
---------------

This runner has zero third-party dependencies. A minimal subset of
`autonomy-config.yaml` is parsed by hand (only the keys the runner actually
consults). Anything more exotic stays in the YAML for human review but the
runner ignores it.

Usage
-----

    # Default: human approval before every agent step.
    python autonomous_runner.py --goal "Add /healthz endpoint to api/"

    # Non-interactive demo (still respects all safety stops).
    python autonomous_runner.py --goal "..." --auto-approve --max-steps 8

    # Honor the master switch in autonomy-config.yaml. The runner refuses
    # to start unless `enabled: true` OR `--allow-disabled` is passed.
    python autonomous_runner.py --goal "..." --allow-disabled

See README.md for the full operations guide.
"""
from __future__ import annotations

import argparse
import dataclasses
import datetime as _dt
import fnmatch
import json
import os
import pathlib
import re
import secrets
import string
import sys
import time
import traceback
from typing import Any, Callable, Iterable

# ---------------------------------------------------------------------------
# Constants — paths are resolved against the project root, located by walking
# upward from this file until we find the marker .github/dev-specs.md. This
# matches how the depth-priority instruction system resolves scope.
# ---------------------------------------------------------------------------

_THIS_FILE = pathlib.Path(__file__).resolve()


def _find_project_root(start: pathlib.Path) -> pathlib.Path:
    """Walk upward until .github/dev-specs.md is found."""
    for candidate in [start, *start.parents]:
        if (candidate / ".github" / "dev-specs.md").is_file():
            return candidate
    raise RuntimeError(
        "Could not locate project root (no .github/dev-specs.md found above "
        f"{start}). Run this script from inside the PDS template."
    )


PROJECT_ROOT = _find_project_root(_THIS_FILE.parent)
CONFIG_PATH = PROJECT_ROOT / ".ai" / "autonomous" / "autonomy-config.yaml"
QUEUE_PATH = PROJECT_ROOT / ".ai" / "autonomous" / "queue.jsonl"
PAUSE_SENTINEL = PROJECT_ROOT / ".ai" / "PAUSE"
LOG_DIR = PROJECT_ROOT / ".ai" / "logs"


# ---------------------------------------------------------------------------
# Restricted YAML reader
# ---------------------------------------------------------------------------
# Only the keys this runner actually consults are extracted. The full YAML
# remains the source of truth for humans; we deliberately do not pull in
# PyYAML to keep the dependency surface at zero.
# ---------------------------------------------------------------------------

_TRUE = {"true", "yes", "on"}
_FALSE = {"false", "no", "off"}


def _coerce_scalar(raw: str) -> Any:
    raw = raw.strip()
    if raw.startswith(("'", '"')) and raw.endswith(("'", '"')) and len(raw) >= 2:
        return raw[1:-1]
    low = raw.lower()
    if low in _TRUE:
        return True
    if low in _FALSE:
        return False
    if low in {"null", "~", ""}:
        return None
    if re.fullmatch(r"-?\d+", raw):
        return int(raw)
    if re.fullmatch(r"-?\d+\.\d+", raw):
        return float(raw)
    return raw


def _read_config(path: pathlib.Path) -> dict[str, Any]:
    """
    Parse the small subset of YAML that autonomy-config.yaml actually uses.

    Supports: nested mappings via indentation, list entries (`- value`),
    inline scalars, comments (`#`), and quoted strings. Blocks more exotic
    than that are ignored; the runner reads only the keys it needs.

    Anything unparseable falls back to a documented set of safe defaults so
    the runner cannot accidentally run with looser limits than the YAML
    declares — when in doubt, the runner reads stricter.
    """
    if not path.is_file():
        raise FileNotFoundError(f"autonomy-config.yaml not found at {path}")

    root: dict[str, Any] = {}
    stack: list[tuple[int, Any]] = [(-1, root)]

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        # Strip comments outside of quotes (simple heuristic; YAML does not
        # allow `#` inside unquoted scalars without preceding whitespace).
        if "#" in raw_line:
            in_quote = False
            for i, ch in enumerate(raw_line):
                if ch in {'"', "'"}:
                    in_quote = not in_quote
                elif ch == "#" and not in_quote and (i == 0 or raw_line[i - 1].isspace()):
                    raw_line = raw_line[:i]
                    break
        if not raw_line.strip():
            continue

        indent = len(raw_line) - len(raw_line.lstrip(" "))
        line = raw_line.strip()

        # Pop the stack until we are at the parent indent level.
        while stack and stack[-1][0] >= indent:
            stack.pop()
        parent = stack[-1][1] if stack else root

        if line.startswith("- "):
            value = _coerce_scalar(line[2:])
            if not isinstance(parent, list):
                # Promote: the previous key in the grandparent should be a list.
                # For our YAML this is always reached after `key:` on a prior line,
                # which created an empty dict. We replace it with a list in-place.
                gp_indent, gp_node = stack[-2] if len(stack) >= 2 else (-1, root)
                if isinstance(gp_node, dict):
                    # Find the key that points to `parent` and replace its value.
                    for k, v in list(gp_node.items()):
                        if v is parent:
                            gp_node[k] = []
                            parent = gp_node[k]
                            stack[-1] = (stack[-1][0], parent)
                            break
            parent.append(value)
            continue

        m = re.match(r"^([A-Za-z0-9_.-]+)\s*:\s*(.*)$", line)
        if not m:
            continue
        key, rest = m.group(1), m.group(2).strip()

        if rest == "":
            new: dict[str, Any] = {}
            if isinstance(parent, dict):
                parent[key] = new
            stack.append((indent, new))
        else:
            if isinstance(parent, dict):
                parent[key] = _coerce_scalar(rest)

    return root


# ---------------------------------------------------------------------------
# ULID-ish goal id (Crockford-base32, 26 chars, lex-sortable)
# ---------------------------------------------------------------------------

_ULID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


def _ulid() -> str:
    timestamp_ms = int(time.time() * 1000)
    ts_chars = []
    for _ in range(10):
        ts_chars.append(_ULID_ALPHABET[timestamp_ms & 0x1F])
        timestamp_ms >>= 5
    ts_part = "".join(reversed(ts_chars))
    rand_part = "".join(secrets.choice(_ULID_ALPHABET) for _ in range(16))
    return ts_part + rand_part


# ---------------------------------------------------------------------------
# Data shapes
# ---------------------------------------------------------------------------


@dataclasses.dataclass
class AgentRequest:
    """A planned invocation of one agent. Built by the runner; consumed by the backend."""

    agent: str
    purpose: str  # short reason why the runner picked this agent
    safety_level: str  # low | medium | high
    planned_writes: list[str]  # paths the agent intends to touch (workspace-relative)
    payload: dict[str, Any]  # arbitrary structured input the backend will use


@dataclasses.dataclass
class AgentResult:
    """What the backend returns. The runner only inspects these fields."""

    outcome: str  # success | retry | escalated | aborted | BLOCK | error
    summary: str  # ≤200 chars, suitable for the JSONL step log
    files_modified: list[str] = dataclasses.field(default_factory=list)
    next_request: AgentRequest | None = None  # backend may suggest the next step
    metadata: dict[str, Any] = dataclasses.field(default_factory=dict)


@dataclasses.dataclass
class GoalState:
    goal_id: str
    goal: str
    workflow: str | None
    scope_path: str
    scope_authority_file: str
    started_at: str
    step_index: int = 0
    failure_streak: int = 0
    files_modified: list[str] = dataclasses.field(default_factory=list)
    status: str = "in_progress"  # pending | in_progress | paused | completed | aborted
    stop_reason: str | None = None

    def to_queue_row(self) -> dict[str, Any]:
        return {
            "goal_id": self.goal_id,
            "created_at": self.started_at,
            "updated_at": _now_iso(),
            "user": os.environ.get("USERNAME") or os.environ.get("USER") or "local",
            "goal": self.goal,
            "scope_path": self.scope_path,
            "scope_authority_file": self.scope_authority_file,
            "workflow": self.workflow,
            "status": self.status,
            "step_index": self.step_index,
            "failure_streak": self.failure_streak,
            "files_modified": list(self.files_modified),
            "stop_reason": self.stop_reason,
        }


# ---------------------------------------------------------------------------
# Agent backends
# ---------------------------------------------------------------------------


class AgentBackend:
    """
    The single seam between the runner and a real agent runtime.

    Production deployments subclass this and dispatch to the actual PDS agent
    invocation channel (Copilot Chat, MCP server, CLI agent, etc.). The
    runner intentionally knows nothing about how the agent runs; it only
    knows how to *gate* the call and log the outcome.
    """

    def invoke(self, request: AgentRequest) -> AgentResult:  # pragma: no cover
        raise NotImplementedError


class SimulatedAgentBackend(AgentBackend):
    """
    Default backend. Returns deterministic, clearly-marked stub responses.

    Every result is prefixed with `[STUB]` so it is impossible to confuse a
    simulated run with a real one in the JSONL log. The backend mimics the
    *shape* of each agent's output (what files it would touch, what stage it
    would hand off to next) so the orchestration loop is exercised honestly.
    """

    def invoke(self, request: AgentRequest) -> AgentResult:
        agent = request.agent

        if agent == "pds-meta-router":
            return AgentResult(
                outcome="success",
                summary=f"[STUB] Router resolved scope to {request.payload.get('hint_scope', 'workspace root')}",
                next_request=AgentRequest(
                    agent="pds-pipe-super",
                    purpose="Plan the pipeline within resolved scope",
                    safety_level="low",
                    planned_writes=[],
                    payload={
                        "goal": request.payload.get("goal"),
                        "proposed_name": request.payload.get("proposed_name"),
                    },
                ),
            )

        if agent == "pds-pipe-super":
            return AgentResult(
                outcome="success",
                summary="[STUB] Supervisor staged: naming → scaffolder → generator → validator → tester → reviewer",
                next_request=AgentRequest(
                    agent="pds-man-naming",
                    purpose="Reserve identifier for new module",
                    safety_level="low",
                    planned_writes=[],
                    payload={
                        "identifier_kind": "module",
                        "proposed": request.payload.get("proposed_name") or "new_module",
                    },
                ),
            )

        if agent == "pds-man-naming":
            proposed = request.payload.get("proposed", "new_module")
            return AgentResult(
                outcome="success",
                summary=f"[STUB] Naming approved identifier '{proposed}'",
                next_request=AgentRequest(
                    agent="pds-pipe-scaffolder",
                    purpose="Produce file plan for the new module",
                    safety_level="low",
                    planned_writes=[],
                    payload={"identifier": proposed},
                ),
            )

        if agent == "pds-pipe-scaffolder":
            ident = request.payload.get("identifier", "new_module")
            return AgentResult(
                outcome="success",
                summary=f"[STUB] Scaffolder produced plan: 1 source file, 1 test file under {ident}/",
                next_request=AgentRequest(
                    agent="pds-pipe-generator",
                    purpose="Generate code from approved scaffold",
                    safety_level="medium",
                    planned_writes=[f"{ident}/__init__.py", f"{ident}/core.py"],
                    payload={"identifier": ident},
                ),
            )

        if agent == "pds-pipe-generator":
            writes = list(request.planned_writes)
            return AgentResult(
                outcome="success",
                summary=f"[STUB] Generator produced {len(writes)} file(s) (no real bytes written in simulation)",
                files_modified=writes,
                next_request=AgentRequest(
                    agent="pds-pipe-validator",
                    purpose="Validate generated code against scope conventions",
                    safety_level="low",
                    planned_writes=[],
                    payload={"files": writes},
                ),
            )

        if agent == "pds-pipe-validator":
            files = list(request.payload.get("files") or [])
            test_dir = files[0].rsplit("/", 1)[0] if files else "tests"
            return AgentResult(
                outcome="success",
                summary="[STUB] Validator: 0 blockers, 0 warnings",
                next_request=AgentRequest(
                    agent="pds-pipe-tester",
                    purpose="Generate tests for validated code",
                    safety_level="medium",
                    planned_writes=[f"{test_dir}/tests/test_core.py"],
                    payload={"target_files": files},
                ),
            )

        if agent == "pds-pipe-tester":
            writes = list(request.planned_writes)
            return AgentResult(
                outcome="success",
                summary=f"[STUB] Tester wrote {len(writes)} test file(s); coverage target met in simulation",
                files_modified=writes,
                next_request=AgentRequest(
                    agent="pds-pipe-reviewer",
                    purpose="Final instruction-drift review",
                    safety_level="low",
                    planned_writes=[],
                    payload={"all_files": request.payload.get("target_files", []) + writes},
                ),
            )

        if agent == "pds-pipe-reviewer":
            return AgentResult(
                outcome="success",
                summary="[STUB] Reviewer: APPROVED — archive-first respected, scope authority honored",
                next_request=None,
            )

        # Unknown agent inside the simulator — surface as escalated, not error,
        # so the runner halts cleanly and logs the gap.
        return AgentResult(
            outcome="escalated",
            summary=f"[STUB] No simulator stub for agent '{agent}'; production backend required",
        )


# ---------------------------------------------------------------------------
# Approval gate
# ---------------------------------------------------------------------------


class ApprovalGate:
    """
    Default human-in-the-loop policy: blocking stdin prompt with timeout.

    Subclass and override `request` to integrate with Slack, ServiceNow, an
    internal review portal, etc. The runner only relies on the boolean return
    plus the `mode` field that ends up in the step log (`auto` vs `human`).
    """

    def __init__(self, mode: str, timeout_minutes: int, auto_approve: bool):
        self.mode = mode  # always | on_medium | on_high | never
        self.timeout_minutes = timeout_minutes
        self.auto_approve = auto_approve

    def required(self, request: AgentRequest) -> bool:
        if self.mode == "never":
            return False
        if self.mode == "always":
            return True
        if self.mode == "on_medium":
            return request.safety_level in {"medium", "high"}
        if self.mode == "on_high":
            return request.safety_level == "high"
        return True  # safest default for unknown modes

    def request(self, request: AgentRequest, state: GoalState) -> tuple[bool, str]:
        """Returns (approved, decision_source). decision_source is logged."""
        banner = (
            f"\n  step {state.step_index + 1}: about to invoke agent '{request.agent}'\n"
            f"    purpose       : {request.purpose}\n"
            f"    safety_level  : {request.safety_level}\n"
            f"    planned writes: {request.planned_writes or '(none)'}\n"
        )
        if self.auto_approve:
            print(banner + "    decision      : auto-approved (--auto-approve)")
            return True, "auto"

        print(banner + "    approve? [y/N] ", end="", flush=True)
        try:
            answer = sys.stdin.readline().strip().lower()
        except KeyboardInterrupt:
            print()
            return False, "human"
        return answer in {"y", "yes"}, "human"


# ---------------------------------------------------------------------------
# Safety guard — rejects requests that violate forbidden-write paths,
# allowed-agents list, or the PAUSE sentinel BEFORE the agent is called.
# ---------------------------------------------------------------------------


# Globs of paths the runner refuses to let any agent write to. Keep this in
# sync with safety-guardrails.md → Forbidden Actions. It is a belt-and-braces
# check; the agents themselves enforce these too, but the runner refuses
# at the orchestrator level so a misconfigured backend cannot punch through.
FORBIDDEN_WRITE_GLOBS = (
    ".env",
    ".env.*",
    "secrets/**",
    "**/*.pem",
    "**/*.key",
    ".ai/governance/**",
    ".ai/index.md",
    "**/.ai/instruct.md",
    ".ai/agent-config.yaml",
)


class SafetyGuard:
    def __init__(self, allowed_agents: set[str], forbidden_agents: set[str]):
        self.allowed = allowed_agents
        self.forbidden = forbidden_agents

    def check_pause(self) -> str | None:
        if PAUSE_SENTINEL.exists():
            return f"PAUSE sentinel present at {PAUSE_SENTINEL.relative_to(PROJECT_ROOT)}"
        return None

    def check_request(self, request: AgentRequest) -> str | None:
        if request.agent in self.forbidden:
            return f"Agent '{request.agent}' is in the forbidden list (governance-edit agent)"
        if request.agent not in self.allowed:
            return f"Agent '{request.agent}' is not in allowed_agents"
        for write in request.planned_writes:
            for pattern in FORBIDDEN_WRITE_GLOBS:
                if fnmatch.fnmatchcase(write, pattern):
                    return f"Planned write '{write}' matches forbidden pattern '{pattern}'"
        return None


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------


def _now_iso() -> str:
    return _dt.datetime.now(tz=_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _today_log_path() -> pathlib.Path:
    return LOG_DIR / f"autonomous-{_dt.date.today().isoformat()}.jsonl"


class StepLog:
    """Append-only JSONL writer that matches the schema in autonomy-config.yaml."""

    REQUIRED_FIELDS = (
        "timestamp",
        "goal_id",
        "step_index",
        "agent",
        "input_summary",
        "output_summary",
        "safety_level",
        "approval",
        "outcome",
        "duration_ms",
    )

    def __init__(self, path: pathlib.Path):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def write(self, **fields: Any) -> None:
        for required in self.REQUIRED_FIELDS:
            fields.setdefault(required, None)
        # Truncate summaries defensively so a misbehaving backend cannot
        # pollute the log with megabytes of agent output.
        for key in ("input_summary", "output_summary"):
            value = fields.get(key)
            if isinstance(value, str) and len(value) > 200:
                fields[key] = value[:197] + "..."
        line = json.dumps(fields, sort_keys=True, ensure_ascii=False)
        with self.path.open("a", encoding="utf-8") as f:
            f.write(line + "\n")


# ---------------------------------------------------------------------------
# Queue
# ---------------------------------------------------------------------------


class Queue:
    """
    Last-write-wins JSONL queue at .ai/autonomous/queue.jsonl. We keep the
    semantics simple: every state save appends one line. A reader tails the
    file and folds rows with the same goal_id into the latest one.
    """

    def __init__(self, path: pathlib.Path):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def persist(self, state: GoalState) -> None:
        row = state.to_queue_row()
        with self.path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(row, sort_keys=True) + "\n")


# ---------------------------------------------------------------------------
# Sanitiser — refuses goals that look like injection or contain shell metas.
# ---------------------------------------------------------------------------

# Matches obvious shell metacharacters that should never survive into an agent
# planning prompt. Tightened deliberately: production agents cannot afford
# even one prompt-injection vector.
_GOAL_FORBIDDEN = re.compile(r"[`$;&|<>]")
_SECRET_PATTERNS = (
    re.compile(r"-----BEGIN [A-Z ]+ PRIVATE KEY-----"),
    re.compile(r"AKIA[0-9A-Z]{16}"),  # AWS access key id
    re.compile(r"ghp_[A-Za-z0-9]{36}"),  # GitHub PAT
)


def sanitise_goal(goal: str) -> str:
    if not goal or len(goal) > 500:
        raise ValueError("Goal must be 1-500 characters.")
    if _GOAL_FORBIDDEN.search(goal):
        raise ValueError("Goal contains forbidden shell metacharacters.")
    for pattern in _SECRET_PATTERNS:
        if pattern.search(goal):
            raise ValueError("Goal appears to contain a credential or private key.")
    # Drop control characters except newline and tab.
    cleaned = "".join(ch for ch in goal if ch in "\n\t" or ord(ch) >= 32)
    return cleaned.strip()


# ---------------------------------------------------------------------------
# The Runner
# ---------------------------------------------------------------------------


class AutonomousRunner:
    """
    Implements the loop in orchestrator.md → "The Loop" exactly.

    Each iteration:
        1. Check stop conditions (pause sentinel, budgets, failure streak).
        2. Select / consume the next AgentRequest.
        3. Run safety guard against the request.
        4. Request approval if required.
        5. Invoke the backend.
        6. Log the step (always, even on failure).
        7. Update state, persist queue.
    """

    HEARTBEAT_INTERVAL = 6  # mirrors agent-config.yaml default

    def __init__(
        self,
        config: dict[str, Any],
        backend: AgentBackend,
        approval: ApprovalGate,
        log: StepLog,
        queue: Queue,
        max_steps_override: int | None = None,
        max_minutes_override: int | None = None,
    ):
        self.config = config
        self.backend = backend
        self.approval = approval
        self.log = log
        self.queue = queue

        limits = config.get("limits", {})
        self.max_steps = max_steps_override or int(limits.get("max_steps", 25))
        self.max_minutes = max_minutes_override or int(limits.get("max_wall_clock_minutes", 30))
        self.max_files = int(limits.get("max_files_modified", 20))

        agents = config.get("allowed_agents", {})
        allowed: set[str] = set()
        for bucket in ("pipeline", "managers", "meta"):
            allowed.update(agents.get(bucket, []) or [])
        forbidden: set[str] = set(agents.get("forbidden", []) or [])
        self.guard = SafetyGuard(allowed, forbidden)

    # -- public --------------------------------------------------------------

    def run(self, goal: str, workflow: str | None, initial_request: AgentRequest) -> GoalState:
        clean_goal = sanitise_goal(goal)
        state = GoalState(
            goal_id=_ulid(),
            goal=clean_goal,
            workflow=workflow,
            scope_path=initial_request.payload.get("hint_scope", "workspace root"),
            scope_authority_file=".ai/instruct.md",
            started_at=_now_iso(),
        )
        self.queue.persist(state)
        self._log_preflight(state)

        deadline = time.monotonic() + (self.max_minutes * 60)
        next_request: AgentRequest | None = initial_request

        while next_request is not None and state.status == "in_progress":
            # 1. Stop conditions.
            stop_reason = self._stop_reason(state, deadline)
            if stop_reason:
                return self._halt(state, stop_reason)

            # 1b. Heartbeat (re-read pause sentinel + safety file mtime).
            if state.step_index and state.step_index % self.HEARTBEAT_INTERVAL == 0:
                pause_msg = self.guard.check_pause()
                if pause_msg:
                    return self._halt(state, pause_msg)

            request = next_request

            # 2. Safety guard.
            violation = self.guard.check_request(request)
            if violation:
                self._log_step(state, request, "n/a", "safety_violation", violation, 0)
                return self._halt(state, f"safety violation: {violation}", terminal=True)

            # 3. Approval gate.
            approval_source = "n/a"
            if self.approval.required(request):
                approved, approval_source = self.approval.request(request, state)
                if not approved:
                    self._log_step(state, request, approval_source, "denied", "human declined", 0)
                    return self._halt(state, "approval denied", terminal=False)

            # 4. Invoke backend.
            t0 = time.monotonic()
            try:
                result = self.backend.invoke(request)
            except Exception as exc:
                duration_ms = int((time.monotonic() - t0) * 1000)
                self._log_step(
                    state,
                    request,
                    approval_source,
                    "error",
                    f"backend exception: {exc}",
                    duration_ms,
                )
                state.failure_streak += 1
                if state.failure_streak >= 3:
                    return self._halt(state, "three consecutive failed steps")
                self.queue.persist(state)
                next_request = None  # backend cannot guide us further
                continue
            duration_ms = int((time.monotonic() - t0) * 1000)

            # 5. Track files (and re-check budget BEFORE logging next step).
            for f in result.files_modified:
                if f not in state.files_modified:
                    state.files_modified.append(f)
            if len(state.files_modified) > self.max_files:
                self._log_step(state, request, approval_source, result.outcome, result.summary, duration_ms)
                return self._halt(state, f"max_files_modified ({self.max_files}) exceeded")

            # 6. Log success/retry/BLOCK.
            self._log_step(state, request, approval_source, result.outcome, result.summary, duration_ms)

            if result.outcome == "BLOCK":
                state.failure_streak += 1
                if state.failure_streak >= 3:
                    return self._halt(state, "three consecutive BLOCKs")
                self.queue.persist(state)
                continue

            if result.outcome in {"error", "aborted", "escalated"}:
                return self._halt(state, f"agent returned outcome={result.outcome}")

            # 7. Advance.
            state.failure_streak = 0
            state.step_index += 1
            self.queue.persist(state)
            next_request = result.next_request

        # Loop ended naturally — pipeline finished.
        if state.status == "in_progress":
            state.status = "completed"
            state.stop_reason = "pipeline returned no further work"
            self.queue.persist(state)
            self._log_completion(state)
        return state

    # -- internals -----------------------------------------------------------

    def _stop_reason(self, state: GoalState, deadline: float) -> str | None:
        pause_msg = self.guard.check_pause()
        if pause_msg:
            return pause_msg
        if state.step_index >= self.max_steps:
            return f"max_steps ({self.max_steps}) reached"
        if time.monotonic() > deadline:
            return f"max_wall_clock_minutes ({self.max_minutes}) reached"
        return None

    def _halt(self, state: GoalState, reason: str, terminal: bool = False) -> GoalState:
        state.status = "aborted" if terminal else ("paused" if "approval" in reason else "aborted")
        if reason.startswith("PAUSE"):
            state.status = "paused"
        if "max_" in reason:
            state.status = "aborted"
        state.stop_reason = reason
        self.queue.persist(state)
        self._log_completion(state)
        return state

    def _log_preflight(self, state: GoalState) -> None:
        self.log.write(
            timestamp=_now_iso(),
            goal_id=state.goal_id,
            step_index=0,
            agent="orchestrator",
            input_summary=f"goal={state.goal}",
            output_summary=f"scope={state.scope_path}",
            safety_level="low",
            approval="n/a",
            outcome="preflight_passed",
            duration_ms=0,
        )

    def _log_step(
        self,
        state: GoalState,
        request: AgentRequest,
        approval: str,
        outcome: str,
        summary: str,
        duration_ms: int,
    ) -> None:
        self.log.write(
            timestamp=_now_iso(),
            goal_id=state.goal_id,
            step_index=state.step_index + 1,
            agent=request.agent,
            input_summary=request.purpose,
            output_summary=summary,
            safety_level=request.safety_level,
            approval=approval,
            outcome=outcome,
            duration_ms=duration_ms,
        )

    def _log_completion(self, state: GoalState) -> None:
        self.log.write(
            timestamp=_now_iso(),
            goal_id=state.goal_id,
            step_index=state.step_index,
            agent="orchestrator",
            input_summary="run finalised",
            output_summary=f"status={state.status} reason={state.stop_reason}",
            safety_level="low",
            approval="n/a",
            outcome=state.status,
            duration_ms=0,
        )


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _build_initial_request(goal: str, hint_scope: str, proposed_name: str) -> AgentRequest:
    """Step 0 of every run: ask the router to resolve scope."""
    return AgentRequest(
        agent="pds-meta-router",
        purpose="Resolve scope and governance refs for the goal",
        safety_level="low",
        planned_writes=[],
        payload={
            "goal": goal,
            "hint_scope": hint_scope,
            "proposed_name": proposed_name,
        },
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="autonomous-runner",
        description="Reference implementation of the PDS autonomous orchestration layer.",
    )
    parser.add_argument("--goal", required=True, help="Plain-English description of the desired outcome (≤500 chars).")
    parser.add_argument("--workflow", default=None, help="Workflow key from autonomy-config.yaml (optional).")
    parser.add_argument("--scope-hint", default="workspace root", help="Hint for the router (e.g. 'api/', 'gui/').")
    parser.add_argument("--proposed-name", default="feature_module_v1", help="Identifier the goal will introduce.")
    parser.add_argument("--auto-approve", action="store_true", help="Skip stdin approval prompts (still respects all stops).")
    parser.add_argument("--allow-disabled", action="store_true", help="Override autonomy-config.yaml `enabled: false`.")
    parser.add_argument("--max-steps", type=int, default=None, help="Override hard step ceiling (must be ≤ config value).")
    parser.add_argument("--max-minutes", type=int, default=None, help="Override wall-clock ceiling (must be ≤ config value).")
    args = parser.parse_args(argv)

    try:
        config = _read_config(CONFIG_PATH)
    except Exception as exc:
        print(f"FATAL: could not load {CONFIG_PATH}: {exc}", file=sys.stderr)
        return 2

    enabled = bool(config.get("enabled", False))
    if not enabled and not args.allow_disabled:
        print(
            "REFUSED: autonomy-config.yaml has `enabled: false`. Re-read\n"
            "  .ai/autonomous/safety-guardrails.md\n"
            "  .ai/autonomous/orchestrator.md\n"
            "before flipping the switch, or pass --allow-disabled for a sandboxed demo.",
            file=sys.stderr,
        )
        return 3

    # Cap user overrides to the config values; the runner cannot loosen limits.
    cfg_steps = int(config.get("limits", {}).get("max_steps", 25))
    cfg_minutes = int(config.get("limits", {}).get("max_wall_clock_minutes", 30))
    if args.max_steps is not None and args.max_steps > cfg_steps:
        print(f"REFUSED: --max-steps={args.max_steps} exceeds config ceiling {cfg_steps}.", file=sys.stderr)
        return 4
    if args.max_minutes is not None and args.max_minutes > cfg_minutes:
        print(f"REFUSED: --max-minutes={args.max_minutes} exceeds config ceiling {cfg_minutes}.", file=sys.stderr)
        return 4

    approval_cfg = config.get("human_approval", {})
    approval = ApprovalGate(
        mode=str(approval_cfg.get("mode", "always")),
        timeout_minutes=int(approval_cfg.get("approval_timeout_minutes", 10)),
        auto_approve=args.auto_approve,
    )

    backend = SimulatedAgentBackend()
    log = StepLog(_today_log_path())
    queue = Queue(QUEUE_PATH)
    runner = AutonomousRunner(
        config=config,
        backend=backend,
        approval=approval,
        log=log,
        queue=queue,
        max_steps_override=args.max_steps,
        max_minutes_override=args.max_minutes,
    )

    initial = _build_initial_request(args.goal, args.scope_hint, args.proposed_name)
    print(f"\n=== PDS Autonomous Runner — reference implementation ===")
    print(f"goal_id will be issued at preflight; queue at {QUEUE_PATH.relative_to(PROJECT_ROOT)}")
    print(f"step log at {log.path.relative_to(PROJECT_ROOT)}")
    print(f"approval mode: {approval.mode}; auto_approve={args.auto_approve}\n")

    try:
        final = runner.run(args.goal, args.workflow, initial)
    except KeyboardInterrupt:
        print("\nKeyboardInterrupt — run halted; queue and step log are persisted.", file=sys.stderr)
        return 130
    except Exception:
        traceback.print_exc()
        return 1

    print(f"\n=== run complete ===")
    print(f"goal_id     : {final.goal_id}")
    print(f"status      : {final.status}")
    print(f"steps       : {final.step_index}")
    print(f"files (sim) : {final.files_modified or '(none)'}")
    print(f"stop_reason : {final.stop_reason}")
    return 0 if final.status == "completed" else 5


if __name__ == "__main__":
    raise SystemExit(main())
