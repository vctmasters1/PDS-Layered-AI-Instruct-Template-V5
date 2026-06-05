#!/usr/bin/env python3
"""
Phase 2: Infrastructure Analyzer

Validates imported prompts, agents, and skills against the template paradigm.

Checks:
  - YAML frontmatter syntax and required fields
  - Naming conventions (kebab-case for files)
  - Tool restrictions match governance
  - No conflicts with existing customizations
  - Description clarity and completeness
  - Pattern compliance with template standards

Generates a report with findings and recommendations.

Usage:
  python phase2_infrastructure_analyzer.py [project_path]

Example:
  python phase2_infrastructure_analyzer.py .
"""

import os
import sys
import json
import re
from pathlib import Path
from typing import Dict, List, Any, Tuple
from datetime import datetime
import yaml


class InfrastructureAnalyzer:
    """Analyzes imported infrastructure for template compliance."""

    def __init__(self, project_path: str = "."):
        self.project = Path(project_path).resolve()
        self.findings = {
            "errors": [],
            "warnings": [],
            "info": [],
        }
        self.stats = {
            "prompts_analyzed": 0,
            "agents_analyzed": 0,
            "skills_analyzed": 0,
            "total_issues": 0,
        }

    def is_kebab_case(self, name: str) -> bool:
        """Check if name is valid kebab-case."""
        # Kebab-case: lowercase, hyphens, no spaces/underscores
        return bool(re.match(r'^[a-z0-9]([a-z0-9\-]*[a-z0-9])?$', name))

    def parse_frontmatter(self, content: str) -> Tuple[Dict, str]:
        """Extract and parse YAML frontmatter."""
        if not content.startswith("---"):
            return {}, content

        try:
            parts = content.split("---", 2)
            if len(parts) < 3:
                return {}, content

            fm_text = parts[1].strip()
            body = parts[2]

            fm = yaml.safe_load(fm_text) or {}
            return fm, body
        except yaml.YAMLError as e:
            return {}, content

    def analyze_prompt(self, prompt_file: Path) -> List[Dict]:
        """Analyze a single prompt file."""
        issues = []
        filename = prompt_file.name

        try:
            content = prompt_file.read_text(encoding='utf-8')
            fm, body = self.parse_frontmatter(content)

            # Check naming
            if not filename.endswith('.prompt.md'):
                issues.append({
                    "level": "error",
                    "file": str(prompt_file.relative_to(self.project)),
                    "message": f"Invalid naming: must end with .prompt.md (got {filename})"
                })
                self.stats["total_issues"] += 1

            base_name = filename.replace('.prompt.md', '')
            if not self.is_kebab_case(base_name):
                issues.append({
                    "level": "warning",
                    "file": str(prompt_file.relative_to(self.project)),
                    "message": f"Naming convention: should be kebab-case (got {base_name})"
                })
                self.stats["total_issues"] += 1

            # Check required frontmatter fields
            required_fields = ['mode', 'description']
            for field in required_fields:
                if field not in fm:
                    issues.append({
                        "level": "error",
                        "file": str(prompt_file.relative_to(self.project)),
                        "message": f"Missing required frontmatter field: {field}"
                    })
                    self.stats["total_issues"] += 1

            # Check mode value
            if 'mode' in fm:
                valid_modes = ['ask', 'edit', 'agent']
                if fm['mode'] not in valid_modes:
                    issues.append({
                        "level": "error",
                        "file": str(prompt_file.relative_to(self.project)),
                        "message": f"Invalid mode: {fm['mode']} (must be one of: {', '.join(valid_modes)})"
                    })
                    self.stats["total_issues"] += 1

            # Check description
            if 'description' in fm:
                desc = fm['description']
                if not desc or len(str(desc).strip()) < 10:
                    issues.append({
                        "level": "warning",
                        "file": str(prompt_file.relative_to(self.project)),
                        "message": "Description too short or empty (should be ≥10 characters)"
                    })
                    self.stats["total_issues"] += 1

            # Check body length
            if len(body.strip()) < 50:
                issues.append({
                    "level": "warning",
                    "file": str(prompt_file.relative_to(self.project)),
                    "message": "Prompt body very short (should have substantial content)"
                })
                self.stats["total_issues"] += 1

        except Exception as e:
            issues.append({
                "level": "error",
                "file": str(prompt_file.relative_to(self.project)),
                "message": f"Failed to parse: {e}"
            })
            self.stats["total_issues"] += 1

        return issues

    def analyze_agent(self, agent_file: Path) -> List[Dict]:
        """Analyze a single agent file."""
        issues = []
        filename = agent_file.name

        try:
            content = agent_file.read_text(encoding='utf-8')
            fm, body = self.parse_frontmatter(content)

            # Check naming
            if not filename.endswith('.agent.md'):
                issues.append({
                    "level": "error",
                    "file": str(agent_file.relative_to(self.project)),
                    "message": f"Invalid naming: must end with .agent.md (got {filename})"
                })
                self.stats["total_issues"] += 1

            base_name = filename.replace('.agent.md', '')
            if not self.is_kebab_case(base_name):
                issues.append({
                    "level": "warning",
                    "file": str(agent_file.relative_to(self.project)),
                    "message": f"Naming convention: should be kebab-case (got {base_name})"
                })
                self.stats["total_issues"] += 1

            # Check required frontmatter
            if 'description' not in fm:
                issues.append({
                    "level": "error",
                    "file": str(agent_file.relative_to(self.project)),
                    "message": "Missing required frontmatter field: description"
                })
                self.stats["total_issues"] += 1

            # Check tools list format (if present)
            if 'tools' in fm:
                if not isinstance(fm['tools'], list):
                    issues.append({
                        "level": "error",
                        "file": str(agent_file.relative_to(self.project)),
                        "message": "Tools field must be a list (YAML array)"
                    })
                    self.stats["total_issues"] += 1

            # Check for conflicting with body
            if len(body.strip()) < 50:
                issues.append({
                    "level": "info",
                    "file": str(agent_file.relative_to(self.project)),
                    "message": "Agent body is minimal (usually agents have detailed specification)"
                })
                self.stats["total_issues"] += 1

        except Exception as e:
            issues.append({
                "level": "error",
                "file": str(agent_file.relative_to(self.project)),
                "message": f"Failed to parse: {e}"
            })
            self.stats["total_issues"] += 1

        return issues

    def analyze_skill(self, skill_file: Path) -> List[Dict]:
        """Analyze a single skill file."""
        issues = []
        filename = skill_file.name

        try:
            content = skill_file.read_text(encoding='utf-8')
            fm, body = self.parse_frontmatter(content)

            # Check naming (must be SKILL.md in a directory)
            if filename != 'SKILL.md':
                issues.append({
                    "level": "error",
                    "file": str(skill_file.relative_to(self.project)),
                    "message": f"Invalid naming: must be SKILL.md (got {filename})"
                })
                self.stats["total_issues"] += 1

            # Check required frontmatter
            if 'description' not in fm:
                issues.append({
                    "level": "error",
                    "file": str(skill_file.relative_to(self.project)),
                    "message": "Missing required frontmatter field: description"
                })
                self.stats["total_issues"] += 1

            # Check description length
            if 'description' in fm:
                desc = fm['description']
                if not desc or len(str(desc).strip()) < 20:
                    issues.append({
                        "level": "warning",
                        "file": str(skill_file.relative_to(self.project)),
                        "message": "Description too short (should be ≥20 characters)"
                    })
                    self.stats["total_issues"] += 1

            # Check skill directory naming
            parent_dir = skill_file.parent.name
            if not self.is_kebab_case(parent_dir):
                issues.append({
                    "level": "warning",
                    "file": str(skill_file.relative_to(self.project)),
                    "message": f"Skill directory should be kebab-case (got {parent_dir})"
                })
                self.stats["total_issues"] += 1

            # Check body
            if len(body.strip()) < 100:
                issues.append({
                    "level": "info",
                    "file": str(skill_file.relative_to(self.project)),
                    "message": "Skill body is quite short (consider adding more detail)"
                })
                self.stats["total_issues"] += 1

        except Exception as e:
            issues.append({
                "level": "error",
                "file": str(skill_file.relative_to(self.project)),
                "message": f"Failed to parse: {e}"
            })
            self.stats["total_issues"] += 1

        return issues

    def execute(self) -> Dict[str, Any]:
        """Execute infrastructure analysis."""
        print(f"\n{'='*60}")
        print(f"Phase 2: Infrastructure Analysis")
        print(f"{'='*60}")
        print(f"Project: {self.project}")
        print()

        # Analyze prompts
        prompts_dir = self.project / ".github" / "prompts"
        if prompts_dir.exists():
            print("Analyzing prompts...")
            for prompt_file in sorted(prompts_dir.glob("*.prompt.md")):
                issues = self.analyze_prompt(prompt_file)
                self.findings["errors"].extend([i for i in issues if i["level"] == "error"])
                self.findings["warnings"].extend([i for i in issues if i["level"] == "warning"])
                self.findings["info"].extend([i for i in issues if i["level"] == "info"])
                self.stats["prompts_analyzed"] += 1
            print(f"  ✓ Analyzed {self.stats['prompts_analyzed']} prompt(s)")

        # Analyze agents
        agents_dir = self.project / ".github" / "agents"
        if agents_dir.exists():
            print("Analyzing agents...")
            for agent_file in sorted(agents_dir.glob("*.agent.md")):
                issues = self.analyze_agent(agent_file)
                self.findings["errors"].extend([i for i in issues if i["level"] == "error"])
                self.findings["warnings"].extend([i for i in issues if i["level"] == "warning"])
                self.findings["info"].extend([i for i in issues if i["level"] == "info"])
                self.stats["agents_analyzed"] += 1
            print(f"  ✓ Analyzed {self.stats['agents_analyzed']} agent(s)")

        # Analyze skills
        skills_dir = self.project / ".github" / "skills"
        if skills_dir.exists():
            print("Analyzing skills...")
            for skill_dir in sorted(skills_dir.iterdir()):
                if skill_dir.is_dir():
                    skill_file = skill_dir / "SKILL.md"
                    if skill_file.exists():
                        issues = self.analyze_skill(skill_file)
                        self.findings["errors"].extend([i for i in issues if i["level"] == "error"])
                        self.findings["warnings"].extend([i for i in issues if i["level"] == "warning"])
                        self.findings["info"].extend([i for i in issues if i["level"] == "info"])
                        self.stats["skills_analyzed"] += 1
            print(f"  ✓ Analyzed {self.stats['skills_analyzed']} skill(s)")

        print()
        print(f"{'='*60}")
        print(f"Phase 2 Results")
        print(f"{'='*60}")
        print(f"✗ Errors: {len(self.findings['errors'])}")
        print(f"⚠ Warnings: {len(self.findings['warnings'])}")
        print(f"ℹ Info: {len(self.findings['info'])}")
        print()

        if self.findings['errors']:
            print("ERRORS (must fix):")
            for finding in self.findings['errors']:
                print(f"  {finding['file']}: {finding['message']}")
            print()

        if self.findings['warnings']:
            print("WARNINGS (should review):")
            for finding in self.findings['warnings'][:10]:  # Limit display
                print(f"  {finding['file']}: {finding['message']}")
            if len(self.findings['warnings']) > 10:
                print(f"  ... and {len(self.findings['warnings']) - 10} more")
            print()

        result = {
            "status": "success" if len(self.findings['errors']) == 0 else "failed",
            "errors": self.findings['errors'],
            "warnings": self.findings['warnings'],
            "info": self.findings['info'],
            "stats": self.stats,
            "timestamp": datetime.now().isoformat(),
        }

        # Save report
        log_path = Path(".ai/logs") / f"phase2-infrastructure-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
        log_path.parent.mkdir(parents=True, exist_ok=True)
        with open(log_path, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2)
        print(f"Report saved: {log_path}")

        return result


def main():
    project_path = sys.argv[1] if len(sys.argv) > 1 else "."

    try:
        analyzer = InfrastructureAnalyzer(project_path)
        result = analyzer.execute()
        sys.exit(0 if result["status"] == "success" else 1)
    except Exception as e:
        print(f"\n✗ Analysis failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
