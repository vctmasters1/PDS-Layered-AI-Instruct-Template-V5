#!/usr/bin/env python3
"""
Interactive custom rule builder.

Prompts user for rule configuration and generates YAML.

Usage:
  python add_custom_rule.py
"""

import sys
import json
from pathlib import Path
from typing import Dict, Any
import yaml


RULE_TEMPLATES = {
    "python_docstrings": {
        "pattern": "all_python_files_must_have_module_docstring",
        "description": "Every Python file must start with a module docstring",
        "severity": "warning",
        "paths": ["src/", "api/"],
        "exclude": ["tests/", "*_test.py"],
    },
    "api_organization": {
        "pattern": "api_routes_must_be_in_api_routes_dir",
        "description": "All API route definitions must be in api/routes/ directory",
        "severity": "error",
    },
    "hardcoded_secrets": {
        "pattern": "no_hardcoded_secrets_in_code",
        "description": "Scan for hardcoded API keys, passwords, tokens in code",
        "severity": "error",
        "scan_extensions": [".py", ".js", ".ts"],
    },
    "type_hints": {
        "pattern": "python_functions_must_have_type_hints",
        "description": "Python functions should include type hints",
        "severity": "warning",
        "paths": ["src/"],
    },
    "custom": {
        "pattern": "custom_pattern_name",
        "description": "Custom rule description",
        "severity": "warning",
    }
}


class RuleBuilder:
    """Interactive custom rule builder."""

    def __init__(self, project_path: str = "."):
        self.project_path = Path(project_path)
        self.rules_file = self.project_path / ".ai" / "compliance-rules.yaml"
        self.existing_rules = {}

        if self.rules_file.exists():
            with open(self.rules_file, 'r') as f:
                config = yaml.safe_load(f) or {}
                self.existing_rules = config.get("rules", {})

    def print_welcome(self):
        """Print welcome message."""
        print("\n" + "=" * 70)
        print("CUSTOM COMPLIANCE RULE BUILDER")
        print("=" * 70)
        print("\nAdd a new custom compliance rule to your project.")
        print("Rules are stored in: .ai/compliance-rules.yaml")
        print()

    def select_rule_type(self) -> str:
        """Ask user which type of rule to add."""
        print("What type of rule would you like to add?\n")

        options = list(RULE_TEMPLATES.keys())
        for i, option in enumerate(options, 1):
            template = RULE_TEMPLATES[option]
            print(f"  {i}. {option}")
            print(f"     Pattern: {template.get('pattern')}")
            print(f"     Description: {template.get('description')}")
            print()

        while True:
            try:
                choice = input("Enter number (1-5): ").strip()
                idx = int(choice) - 1
                if 0 <= idx < len(options):
                    return options[idx]
            except (ValueError, IndexError):
                pass
            print("Invalid choice. Try again.")

    def get_rule_name(self, rule_type: str) -> str:
        """Ask user for rule ID/name."""
        template = RULE_TEMPLATES[rule_type]
        default_name = template.get("pattern", "custom_rule")

        print(f"\nRule ID (identifier in your config):")
        print(f"  Default: {default_name}")

        name = input("Enter name (or press Enter for default): ").strip()

        if not name:
            name = default_name

        if name in self.existing_rules:
            print(f"\nWarning: Rule '{name}' already exists!")
            overwrite = input("Overwrite? (y/n): ").strip().lower()
            if overwrite != 'y':
                return self.get_rule_name(rule_type)

        return name

    def customize_rule(self, rule_type: str, rule_id: str) -> Dict[str, Any]:
        """Ask user to customize rule details."""
        template = RULE_TEMPLATES[rule_type].copy()

        print(f"\nCustomize rule '{rule_id}':")
        print()

        # Enable/disable
        default_enabled = "y"
        enabled_str = input(f"Enable this rule? [{default_enabled}]: ").strip().lower() or default_enabled
        template["enabled"] = enabled_str == 'y'

        # Description
        if "description" in template:
            print(f"\nDescription: {template['description']}")
            new_desc = input("Customize description (or press Enter to keep): ").strip()
            if new_desc:
                template["description"] = new_desc

        # Severity
        if "severity" in template:
            print(f"\nSeverity (info, warning, error):")
            print(f"  Current: {template['severity']}")
            severity = input("Enter severity (or press Enter to keep): ").strip().lower()
            if severity in ["info", "warning", "error"]:
                template["severity"] = severity

        # Paths
        if "paths" in template:
            print(f"\nPaths to scan:")
            print(f"  Current: {', '.join(template['paths'])}")
            paths_str = input("Enter paths (comma-separated, or press Enter to keep): ").strip()
            if paths_str:
                template["paths"] = [p.strip() for p in paths_str.split(",")]

        # Exclude patterns
        if "exclude" in template:
            print(f"\nExclude patterns:")
            print(f"  Current: {', '.join(template['exclude'])}")
            exclude_str = input("Enter patterns (comma-separated, or press Enter to keep): ").strip()
            if exclude_str:
                template["exclude"] = [p.strip() for p in exclude_str.split(",")]

        # Scan extensions
        if "scan_extensions" in template:
            print(f"\nFile extensions to scan:")
            print(f"  Current: {', '.join(template['scan_extensions'])}")
            exts_str = input("Enter extensions (comma-separated, or press Enter to keep): ").strip()
            if exts_str:
                template["scan_extensions"] = [e.strip() for e in exts_str.split(",")]

        return template

    def save_rule(self, rule_id: str, rule_config: Dict[str, Any]) -> bool:
        """Save rule to compliance-rules.yaml."""
        # Load existing config
        if self.rules_file.exists():
            with open(self.rules_file, 'r') as f:
                config = yaml.safe_load(f) or {"rules": {}}
        else:
            config = {"rules": {}}

        # Add/update rule
        config["rules"][rule_id] = rule_config

        # Write back
        try:
            self.rules_file.parent.mkdir(parents=True, exist_ok=True)
            with open(self.rules_file, 'w') as f:
                yaml.dump(config, f, default_flow_style=False, sort_keys=False)
            return True
        except Exception as e:
            print(f"Error saving rule: {e}")
            return False

    def show_preview(self, rule_id: str, rule_config: Dict[str, Any]):
        """Show YAML preview."""
        print("\n" + "=" * 70)
        print("PREVIEW")
        print("=" * 70)
        print(f"\n{rule_id}:")

        yaml_str = yaml.dump({rule_id: rule_config}, default_flow_style=False)
        for line in yaml_str.split('\n'):
            if line:
                print(f"  {line}")

    def run(self):
        """Run interactive builder."""
        self.print_welcome()

        # Select type
        rule_type = self.select_rule_type()
        print(f"\nSelected: {rule_type}")

        # Get name
        rule_id = self.get_rule_name(rule_type)
        print(f"Rule ID: {rule_id}")

        # Customize
        rule_config = self.customize_rule(rule_type, rule_id)

        # Preview
        self.show_preview(rule_id, rule_config)

        # Confirm
        confirm = input("\nSave this rule? (y/n): ").strip().lower()

        if confirm != 'y':
            print("Cancelled.")
            return False

        # Save
        if self.save_rule(rule_id, rule_config):
            print(f"\n[OK] Rule '{rule_id}' saved to {self.rules_file}")
            print("\nNext steps:")
            print("  1. Review .ai/compliance-rules.yaml")
            print("  2. Run analyzer: pwsh .github/debug/import-project.ps1 -Phase analyze")
            print("  3. Check for violations matching your new rule")
            return True
        else:
            print("[ERROR] Failed to save rule")
            return False


def main():
    project_path = "."
    if len(sys.argv) > 1:
        project_path = sys.argv[1]

    builder = RuleBuilder(project_path)
    success = builder.run()

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nCancelled.")
        sys.exit(1)
