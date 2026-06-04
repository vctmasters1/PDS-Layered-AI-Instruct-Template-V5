#!/usr/bin/env python3
"""
Phase 2 Executor — Hybrid LLM-Assisted Execution

Routes tasks to local LLM (coder-0) or frontier model (GPT-4/Claude) based on complexity:
- Local LLM: Templating, .ai/instruct.md generation, README.md, .gitignore
- Frontier Model: Conflict resolution, security review, architecture validation

Requires:
  - Dispatcher plugin at k:\\PDS-Master-002\\.ai\\plugins\\model-dispatch\\
  - LM Studio running at localhost:1234/v1
  - Plan JSON from phase2_plan_generator.py

Usage:
  python phase2_executor.py <plan_json> [--dry-run] [--approve]

Examples:
  python phase2_executor.py .github/tmp/phase2-plan-20260604.json --dry-run
  python phase2_executor.py .github/tmp/phase2-plan-20260604.json --approve
"""

import json
import sys
import os
from pathlib import Path
from dataclasses import dataclass
from typing import Dict, List, Tuple, Optional
from datetime import datetime
import subprocess


# Import dispatcher from shared plugin location
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / "PDS-Master-002" / ".ai" / "plugins" / "model-dispatch"))
try:
    from dispatcher import ModelDispatcher, DispatchConfig
except ImportError:
    # Fallback to local dispatcher
    try:
        from dispatcher_local import get_dispatcher
        ModelDispatcher = get_dispatcher
        DispatchConfig = None
        print("ℹ️  Using local dispatcher (PDS-Master-002 not available)", file=sys.stderr)
    except ImportError:
        print("⚠️  Model dispatcher not found. Using stub mode (no LLM routing).", file=sys.__stderr__)
        ModelDispatcher = None


@dataclass
class GenerationTask:
    """Represents a file generation task."""
    module: str
    file_type: str  # instruct_md, readme_md, gitignore
    path: str
    content: str
    llm_tier: str  # local, frontier


class Phase2Executor:
    """Orchestrates Phase 2 execution with hybrid LLM routing."""

    def __init__(self, plan_path: str, dry_run: bool = False):
        self.plan_path = Path(plan_path)
        self.dry_run = dry_run
        self.plan = self._load_plan()
        if callable(ModelDispatcher):
            # If ModelDispatcher is the function get_dispatcher
            self.dispatcher = ModelDispatcher()
        else:
            self.dispatcher = ModelDispatcher() if ModelDispatcher else None
        self.generated_files = []
        self.errors = []

    def _load_plan(self) -> Dict:
        """Load the Phase 2 plan JSON."""
        if not self.plan_path.exists():
            raise FileNotFoundError(f"Plan not found: {self.plan_path}")
        with open(self.plan_path, "r", encoding="utf-8") as f:
            return json.load(f)

    def _route_generation_task(self, task: GenerationTask) -> Tuple[str, str]:
        """
        Route a generation task to appropriate LLM tier.

        Local LLM tier for:
          - .ai/instruct.md generation (templating + linking)
          - README.md generation (standard format)
          - .gitignore generation (pattern-based)

        Frontier model for:
          - Conflict resolution across multiple fixes
          - Security review of fixes
          - Architecture validation

        Returns: (tier_used, content_generated)
        """
        if task.llm_tier == "local":
            return self._generate_with_local_llm(task)
        else:
            return self._generate_with_frontier_model(task)

    def _generate_with_local_llm(self, task: GenerationTask) -> Tuple[str, str]:
        """Generate content using local LLM (coder-0)."""
        if not self.dispatcher:
            print(f"[WARN] Dispatcher unavailable; using template fallback for {task.path}", file=sys.stderr)
            return ("template-fallback", self._template_fallback(task))

        prompt = self._build_generation_prompt(task)

        try:
            result = self.dispatcher.dispatch(
                prompt=prompt,
                tier="local-heavy",  # coder-0 exclusively
                max_tokens=1024,
                timeout=180,
            )

            if result.get("success"):
                model_id = result.get("model_id", "unknown")
                print(
                    f"[OK] Local LLM ({model_id}): {task.file_type} for {task.module}",
                    file=sys.stderr,
                )
                return (model_id, result.get("response", ""))
            else:
                error = result.get("error", "unknown error")
                print(
                    f"[WARN] Local LLM failed ({error}); using template fallback for {task.path}",
                    file=sys.stderr,
                )
                return ("template-fallback", self._template_fallback(task))

        except Exception as e:
            print(f"[WARN] Dispatcher error: {e}; using template fallback", file=sys.stderr)
            return ("template-fallback", self._template_fallback(task))

    def _generate_with_frontier_model(self, task: GenerationTask) -> Tuple[str, str]:
        """Generate content using frontier model (GPT-4/Claude)."""
        # For now, frontier routing is disabled (test run uses local only)
        # In production, this would call OpenAI API or similar
        print(
            f"[INFO] Frontier model routing deferred (test run); using template fallback",
            file=sys.stderr,
        )
        return ("template-fallback", self._template_fallback(task))

    def _build_generation_prompt(self, task: GenerationTask) -> str:
        """Build a prompt for the LLM to generate file content."""
        if task.file_type == "instruct_md":
            return f"""Generate a scoped .ai/instruct.md file for module '{task.module}'.

Include sections:
1. Module Overview: What does {task.module} do?
2. Key Directories: Subdirectories and their purpose
3. Global Rules Reference: Links to .ai/conventions.md, .ai/maintenance.md, .ai/credentials.md
4. Coding Conventions: Element prefixes for test discovery (if applicable)
5. AI-INSTRUCT Maintenance Rule: When/how to update this file

Format: Markdown with proper frontmatter.
Be concise but complete. Link to canonical rules, don't duplicate.

Output only the raw Markdown content, no code blocks."""

        elif task.file_type == "readme_md":
            return f"""Generate a README.md for module '{task.module}'.

Include sections:
1. Overview: What does this module do?
2. Architecture: Key components and how they interact
3. Getting Started: How to set up / run this module
4. Testing: How to run tests
5. Deployment: How to deploy
6. Troubleshooting: Common issues
7. References: Links to related docs

Format: Markdown, professional tone.
Keep it practical and developer-focused.

Output only the raw Markdown content, no code blocks."""

        elif task.file_type == "gitignore":
            return f"""Generate .gitignore entries for module '{task.module}'.

Include patterns for:
- Environment files: .env, .env.local, .env.*.local
- Credentials: *.pem, *.key, *.cert, cert.pem, key.pem
- Build artifacts (language-specific)
- Node: node_modules, dist, .next
- Python: __pycache__, *.pyc, .pytest_cache, .venv
- IDE: .vscode, .idea, *.swp

Format: Standard .gitignore format (one pattern per line).
Include comments explaining each section.

Output only the raw .gitignore content, no code blocks."""

        return ""

    def _template_fallback(self, task: GenerationTask) -> str:
        """Fallback template generation if LLM unavailable."""
        if task.file_type == "instruct_md":
            return f"""# {task.module.replace('-', ' ').title()} — Module Instructions

**Scope**: Module-scoped
**Last Updated**: {datetime.now().strftime('%Y-%m-%d')}

## Contents

| Section | What's here |
|---------|-------------|
| [Module Overview](#module-overview) | What this module does |
| [Key Directories](#key-directories) | Directory structure |
| [Global Rules Reference](#global-rules-reference) | Links to canonical rules |

## Module Overview

[Describe what {task.module} does]

## Key Directories

[List subdirectories and purposes]

## Global Rules Reference

- [Conventions](../../.ai/conventions.md) — Naming and file organization
- [Maintenance](../../.ai/maintenance.md) — Archive and safety rules
- [Credentials](../../.ai/credentials.md) — Credential warehousing rules

## AI-INSTRUCT Maintenance Rule

Update this file whenever the module's architecture changes.
"""

        elif task.file_type == "readme_md":
            return f"""# {task.module.replace('-', ' ').title()}

## Overview

[What does this module do?]

## Architecture

[Key components and how they interact]

## Getting Started

[Setup instructions]

## Testing

[How to run tests]

## Deployment

[How to deploy]

## Troubleshooting

[Common issues and solutions]
"""

        elif task.file_type == "gitignore":
            return """# Environment variables
.env
.env.local
.env.*.local

# Credentials
*.pem
*.key
*.cert
cert.pem
key.pem
prvtkey.pem
servercert.pem
deployment.env

# Build artifacts
node_modules/
dist/
build/
.next/
__pycache__/
*.pyc
.pytest_cache/
.venv/

# IDE
.vscode/
.idea/
*.swp
*~
"""

        return ""

    def plan_generation_tasks(self) -> List[GenerationTask]:
        """Convert plan into generation tasks with LLM tier routing."""
        tasks = []

        for module_plan in self.plan.get("module_plans", []):
            module_name = module_plan["name"]

            # .ai/instruct.md — local LLM (templating + linking)
            if ".ai/instruct.md" in module_plan.get("files_to_create", []):
                tasks.append(
                    GenerationTask(
                        module=module_name,
                        file_type="instruct_md",
                        path=f"{module_name}/.ai/instruct.md",
                        content="",  # To be generated
                        llm_tier="local",
                    )
                )

            # README.md — local LLM (standard format)
            if "README.md" in module_plan.get("files_to_create", []):
                tasks.append(
                    GenerationTask(
                        module=module_name,
                        file_type="readme_md",
                        path=f"{module_name}/README.md",
                        content="",  # To be generated
                        llm_tier="local",
                    )
                )

            # .gitignore — local LLM (pattern-based, deterministic)
            if ".gitignore" in module_plan.get("files_to_create", []):
                tasks.append(
                    GenerationTask(
                        module=module_name,
                        file_type="gitignore",
                        path=f"{module_name}/.gitignore",
                        content="",  # To be generated
                        llm_tier="local",
                    )
                )

        return tasks

    def execute(self, approval_token: Optional[str] = None) -> bool:
        """Execute Phase 2 with LLM assistance."""
        if not approval_token and not self.dry_run:
            print("❌ Approval token required. Use --approve flag.", file=sys.stderr)
            return False

        print("\n" + "=" * 80)
        print("PHASE 2 EXECUTOR -- HYBRID LLM ROUTING")
        print("=" * 80)

        # Plan generation tasks
        tasks = self.plan_generation_tasks()
        print(f"\n[PLAN] {len(tasks)} generation tasks:")
        for task in tasks:
            print(f"   * {task.file_type:15} -> {task.path:40} (tier: {task.llm_tier})")

        # Execute each task with LLM routing
        print(f"\n[EXEC] Executing tasks with LLM routing...")
        for task in tasks:
            tier, content = self._route_generation_task(task)
            task.content = content

            # In dry-run mode, just print; otherwise write
            if self.dry_run:
                print(f"   [DRY-RUN] {task.path}")
            else:
                output_path = Path(task.path)
                output_path.parent.mkdir(parents=True, exist_ok=True)
                with open(output_path, "w", encoding="utf-8") as f:
                    f.write(task.content)
                self.generated_files.append(task.path)
                print(f"   [OK] {task.path}")

        # Summary
        print(f"\n{'=' * 80}")
        print(f"SUMMARY")
        print(f"{'=' * 80}")
        print(f"Files generated: {len(self.generated_files)}")
        if self.errors:
            print(f"Errors: {len(self.errors)}")
            for err in self.errors:
                print(f"  [ERR] {err}")

        print(f"\n[OK] Phase 2 execution complete")
        return True


def main():
    """Main entry point."""
    if len(sys.argv) < 2:
        print("Usage: python phase2_executor.py <plan_json> [--dry-run] [--approve]")
        sys.exit(1)

    plan_path = sys.argv[1]
    dry_run = "--dry-run" in sys.argv
    approve = "--approve" in sys.argv

    try:
        executor = Phase2Executor(plan_path, dry_run=dry_run)
        approval_token = "user-approved" if (approve or dry_run) else None
        success = executor.execute(approval_token=approval_token)
        sys.exit(0 if success else 1)

    except Exception as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
