#!/usr/bin/env python3
"""
Custom rules validator for project-specific compliance checks.

Allows projects to define their own compliance rules beyond the standard framework.

Example .ai/compliance-rules.yaml:
---
rules:
  python_docstrings:
    enabled: true
    pattern: "all_python_files_must_have_module_docstring"
    description: "Every Python file must start with a docstring"
    paths: ["src/", "api/"]
    exclude: ["tests/", "*_test.py"]

  api_organization:
    enabled: true
    pattern: "api_routes_must_be_in_api_routes_dir"
    description: "All API routes must be in api/routes/ directory"
    severity: "error"

  security_no_hardcoded_secrets:
    enabled: true
    pattern: "no_hardcoded_secrets_in_code"
    description: "Code must not contain hardcoded API keys, passwords, or tokens"
    scan_extensions: [".py", ".js", ".ts", ".env.example"]

  type_hints:
    enabled: false
    pattern: "python_functions_must_have_type_hints"
    description: "Python functions should have type hints (optional)"
    paths: ["src/"]
    severity: "warning"
"""

import re
import json
from pathlib import Path
from typing import List, Dict, Any, Tuple
from dataclasses import dataclass
import yaml


@dataclass
class RuleViolation:
    """Single rule violation."""
    rule_id: str
    rule_description: str
    severity: str  # error, warning, info
    path: str
    line_num: int = 0
    match_text: str = ""
    remediation: str = ""


class CustomRulesValidator:
    """Validates project against custom compliance rules."""

    def __init__(self, project_path: str):
        self.project_path = Path(project_path)
        self.rules_file = self.project_path / ".ai" / "compliance-rules.yaml"
        self.rules = {}
        self.violations: List[RuleViolation] = []

        if self.rules_file.exists():
            self._load_rules()

    def _load_rules(self):
        """Load rules from YAML file."""
        try:
            with open(self.rules_file, 'r') as f:
                config = yaml.safe_load(f)
                self.rules = config.get("rules", {})
        except Exception as e:
            print(f"Warning: Could not load rules from {self.rules_file}: {e}")

    def validate_all(self) -> Tuple[List[RuleViolation], Dict[str, int]]:
        """Run all enabled rules."""
        for rule_id, rule_config in self.rules.items():
            if not rule_config.get("enabled", False):
                continue

            pattern = rule_config.get("pattern", "")

            # Dispatch to specific validator
            if pattern == "all_python_files_must_have_module_docstring":
                self._check_python_docstrings(rule_id, rule_config)
            elif pattern == "api_routes_must_be_in_api_routes_dir":
                self._check_api_routes_location(rule_id, rule_config)
            elif pattern == "no_hardcoded_secrets_in_code":
                self._check_hardcoded_secrets(rule_id, rule_config)
            elif pattern == "python_functions_must_have_type_hints":
                self._check_type_hints(rule_id, rule_config)

        # Count violations by severity
        summary = {
            "error": len([v for v in self.violations if v.severity == "error"]),
            "warning": len([v for v in self.violations if v.severity == "warning"]),
            "info": len([v for v in self.violations if v.severity == "info"]),
            "total": len(self.violations)
        }

        return self.violations, summary

    def _check_python_docstrings(self, rule_id: str, rule_config: Dict):
        """Validate all Python files have module docstrings."""
        paths = rule_config.get("paths", ["src/", "api/"])
        exclude = rule_config.get("exclude", [])
        severity = rule_config.get("severity", "warning")

        for search_path in paths:
            full_path = self.project_path / search_path
            if not full_path.exists():
                continue

            for py_file in full_path.rglob("*.py"):
                # Check if in exclude patterns
                skip = False
                for pattern in exclude:
                    if pattern.startswith("*"):
                        if py_file.name.endswith(pattern.lstrip("*")):
                            skip = True
                    elif pattern in str(py_file):
                        skip = True

                if skip:
                    continue

                try:
                    content = py_file.read_text()

                    # Check if starts with docstring (""" or ''')
                    lines = content.lstrip().split('\n')
                    if not lines or not (lines[0].startswith('"""') or lines[0].startswith("'''")):
                        self.violations.append(RuleViolation(
                            rule_id=rule_id,
                            rule_description=rule_config.get("description"),
                            severity=severity,
                            path=str(py_file.relative_to(self.project_path)),
                            line_num=1,
                            remediation="Add module docstring: \"\"\"Module description.\"\"\""
                        ))
                except:
                    pass

    def _check_api_routes_location(self, rule_id: str, rule_config: Dict):
        """Validate API routes are in api/routes/ directory."""
        severity = rule_config.get("severity", "error")

        # Look for *_routes.py, *_api.py, *_endpoint*.py files outside api/routes/
        for py_file in self.project_path.rglob("*.py"):
            name = py_file.name.lower()

            if any(x in name for x in ["route", "endpoint", "api"]):
                if "api/routes" not in str(py_file) and "api\\routes" not in str(py_file):
                    self.violations.append(RuleViolation(
                        rule_id=rule_id,
                        rule_description=rule_config.get("description"),
                        severity=severity,
                        path=str(py_file.relative_to(self.project_path)),
                        remediation=f"Move {py_file.name} to api/routes/ directory"
                    ))

    def _check_hardcoded_secrets(self, rule_id: str, rule_config: Dict):
        """Scan for hardcoded secrets."""
        severity = rule_config.get("severity", "error")
        scan_exts = rule_config.get("scan_extensions", [".py", ".js", ".ts", ".env"])

        # Patterns that might indicate hardcoded secrets
        patterns = [
            (r'api[_-]?key\s*=\s*["\']sk_.*?["\']', "API key"),
            (r'password\s*=\s*["\'].*?["\']', "Password"),
            (r'secret\s*=\s*["\'].*?["\']', "Secret"),
            (r'token\s*=\s*["\'].*?["\']', "Token"),
            (r'aws[_-]?secret\s*=', "AWS secret"),
            (r'private[_-]?key\s*=', "Private key"),
        ]

        for py_file in self.project_path.rglob("*"):
            if py_file.is_file() and py_file.suffix in scan_exts:
                try:
                    content = py_file.read_text(errors='ignore')
                    for line_num, line in enumerate(content.split('\n'), 1):
                        for pattern, secret_type in patterns:
                            if re.search(pattern, line, re.IGNORECASE):
                                self.violations.append(RuleViolation(
                                    rule_id=rule_id,
                                    rule_description=rule_config.get("description"),
                                    severity=severity,
                                    path=str(py_file.relative_to(self.project_path)),
                                    line_num=line_num,
                                    match_text=line.strip()[:80],
                                    remediation=f"Move {secret_type} to environment variable or .env (gitignored)"
                                ))
                except:
                    pass

    def _check_type_hints(self, rule_id: str, rule_config: Dict):
        """Validate Python functions have type hints."""
        paths = rule_config.get("paths", ["src/"])
        severity = rule_config.get("severity", "warning")

        for search_path in paths:
            full_path = self.project_path / search_path
            if not full_path.exists():
                continue

            for py_file in full_path.rglob("*.py"):
                try:
                    content = py_file.read_text()

                    # Simple regex check for function definitions without type hints
                    # def function_name(param): without -> return type
                    for match in re.finditer(r'def (\w+)\(([^)]*)\):', content):
                        if '->' not in content[match.start():match.start()+200]:
                            self.violations.append(RuleViolation(
                                rule_id=rule_id,
                                rule_description=rule_config.get("description"),
                                severity=severity,
                                path=str(py_file.relative_to(self.project_path)),
                                match_text=match.group(0),
                                remediation="Add type hints: def func(param: str) -> bool:"
                            ))
                except:
                    pass


def generate_example_rules_file(output_path: str):
    """Generate an example compliance-rules.yaml file."""
    example = """# Custom Compliance Rules for this Project
#
# These rules extend the standard AI-INSTRUCT framework checks.
# Enable/disable rules to match your project's standards.

rules:
  # Example: Enforce Python docstrings in src/ and api/
  python_docstrings:
    enabled: false
    pattern: "all_python_files_must_have_module_docstring"
    description: "Every Python file must start with a module docstring"
    severity: "warning"
    paths:
      - "src/"
      - "api/"
    exclude:
      - "tests/"
      - "*_test.py"

  # Example: Enforce API route organization
  api_organization:
    enabled: false
    pattern: "api_routes_must_be_in_api_routes_dir"
    description: "All API route definitions must be in api/routes/ directory"
    severity: "error"

  # Example: Prevent hardcoded secrets
  security_no_hardcoded_secrets:
    enabled: false
    pattern: "no_hardcoded_secrets_in_code"
    description: "Scan for hardcoded API keys, passwords, tokens in code"
    severity: "error"
    scan_extensions:
      - ".py"
      - ".js"
      - ".ts"
      - ".env"

  # Example: Enforce type hints (optional, can be strict or lenient)
  type_hints:
    enabled: false
    pattern: "python_functions_must_have_type_hints"
    description: "Python functions should include type hints"
    severity: "warning"
    paths:
      - "src/"

# How to use:
# 1. Copy this file to your project: cp .ai/compliance-rules.example.yaml .ai/compliance-rules.yaml
# 2. Enable only the rules you want: set enabled: true
# 3. Run import tool: pwsh .github/debug/import-project.ps1 -Phase analyze
# 4. The analyzer will check custom rules and report violations
"""

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    Path(output_path).write_text(example)


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python custom_rules.py <project_path>")
        sys.exit(1)

    project_path = sys.argv[1]

    validator = CustomRulesValidator(project_path)
    violations, summary = validator.validate_all()

    print(json.dumps({
        "violations": [
            {
                "rule_id": v.rule_id,
                "description": v.rule_description,
                "severity": v.severity,
                "path": v.path,
                "line": v.line_num,
                "remediation": v.remediation
            }
            for v in violations
        ],
        "summary": summary
    }, indent=2))
