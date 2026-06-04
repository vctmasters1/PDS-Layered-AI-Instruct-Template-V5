#!/usr/bin/env python3
"""
Config Variables Generator — Central Controller for Environment Variable Creation

Enforces typed environment variables ({MODULE}_{RESOURCE}_{PROPERTY}) with validation at creation time.

Usage:
    python config_generator.py --name DATABASE_URL --type url --required --verbose
    python config_generator.py --name JWT_SECRET --type secret
    python config_generator.py --name LOG_LEVEL --type enum --values debug,info,warn,error
    python config_generator.py --list-types
    python config_generator.py --validate DATABASE_URL
    python config_generator.py --find-conflicts --name STRIPE_API_KEY
"""

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path


# Variable type registry
VARIABLE_TYPES = {
    "string": {
        "description": "Text values",
        "example": "api_endpoint",
        "validator": "str(value)"
    },
    "number": {
        "description": "Numeric values (int or float)",
        "example": "3.14",
        "validator": "float(value)"
    },
    "boolean": {
        "description": "True/false values",
        "example": "true|false",
        "validator": "value.lower() in ['true', 'false']"
    },
    "enum": {
        "description": "Predefined set of values",
        "example": "development|staging|production",
        "validator": "value in allowed_values"
    },
    "secret": {
        "description": "Sensitive credentials (never logged)",
        "example": "api-key-xyz",
        "validator": "len(value) > 0 and not ' ' in value"
    },
    "url": {
        "description": "URL/URI values",
        "example": "https://example.com",
        "validator": "value.startswith(('http://', 'https://', 'postgresql://'))"
    },
    "integer": {
        "description": "Whole number values",
        "example": "8080",
        "validator": "int(value)"
    },
}

# Environment tiers
TIERS = ["dev", "staging", "production"]

CONFIG_REGISTRY_FILE = Path("./.config-registry.json")


class ConfigGenerator:
    """Central config variable generator enforcing typing and validation."""

    def __init__(self, verbose=False):
        self.verbose = verbose
        self.load_registry()

    def load_registry(self):
        """Load existing config registry."""
        if CONFIG_REGISTRY_FILE.exists():
            self.registry = json.loads(CONFIG_REGISTRY_FILE.read_text())
        else:
            self.registry = {}

    def save_registry(self):
        """Save config registry."""
        CONFIG_REGISTRY_FILE.write_text(json.dumps(self.registry, indent=2))

    def normalize_name(self, name):
        """Normalize variable name to uppercase with underscores."""
        return name.upper().replace("-", "_")

    def validate_naming(self, name):
        """Validate variable naming pattern."""
        normalized = self.normalize_name(name)

        # Check uppercase
        if not normalized.isupper() and "_" in normalized:
            return False, "Variable must be uppercase with underscores"

        # Check for {MODULE}_{RESOURCE}_{PROPERTY} pattern
        parts = normalized.split("_")
        if len(parts) < 2:
            return False, "Variable should follow {MODULE}_{RESOURCE}_{PROPERTY} pattern (minimum 2 parts)"

        return True, normalized

    def validate_type(self, var_type):
        """Validate variable type."""
        if var_type not in VARIABLE_TYPES:
            available = ", ".join(VARIABLE_TYPES.keys())
            return False, f"Type must be one of: {available}"
        return True, None

    def find_conflicts(self, name):
        """Check if variable already registered."""
        normalized = self.normalize_name(name)
        if normalized in self.registry:
            return False, f"Variable '{normalized}' already registered"
        return True, None

    def generate_validator(self, var_type, enum_values=None):
        """Generate validator code snippet."""
        if var_type == "enum":
            if not enum_values:
                return "# ERROR: enum type requires --values"
            values = ",".join(f"'{v}'" for v in enum_values)
            return f"value in [{values}]"
        elif var_type == "url":
            return "value.startswith(('http://', 'https://', 'postgresql://'))"
        elif var_type == "secret":
            return "len(value) > 0"
        elif var_type == "integer":
            return "value.isdigit()"
        elif var_type == "number":
            return "float(value) is not None"
        elif var_type == "boolean":
            return "value.lower() in ['true', 'false']"
        else:
            return f"isinstance(value, str)"

    def list_types(self):
        """List available types."""
        print("\n" + "=" * 70)
        print("CONFIGURATION VARIABLE TYPES")
        print("=" * 70)
        for var_type, info in VARIABLE_TYPES.items():
            print(f"\n  {var_type:<15}")
            print(f"    Description: {info['description']}")
            print(f"    Example: {info['example']}")
        print()

    def register_variable(self, name, var_type, default=None, required=False, enum_values=None, description=None):
        """Register a configuration variable."""
        valid, normalized = self.validate_naming(name)
        if not valid:
            return False, normalized

        valid, error = self.validate_type(var_type)
        if not valid:
            return False, error

        exists, error = self.find_conflicts(normalized)
        if not exists:
            return False, error

        self.registry[normalized] = {
            "type": var_type,
            "required": required,
            "default": default,
            "enum_values": enum_values or [],
            "description": description or "",
            "validator": self.generate_validator(var_type, enum_values),
            "created_at": datetime.utcnow().isoformat() + "Z"
        }

        self.save_registry()
        return True, normalized

    def generate_env_example_entry(self, name, var_type, description=None):
        """Generate .env.example entry."""
        normalized = self.normalize_name(name)
        parts = normalized.split("_")

        # Generate example value based on type
        examples = {
            "string": '"example-value"',
            "number": "42",
            "boolean": "false",
            "enum": "development",
            "secret": "your-secret-key-here",
            "url": "https://example.com",
            "integer": "8000",
        }

        example_value = examples.get(var_type, "value")

        lines = [f"\n# {description or normalized}"]
        lines.append(f"{normalized}={example_value}")

        return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="Config Variable Generator — Central Controller for Environment Variables"
    )

    parser.add_argument(
        "--name",
        type=str,
        help="Variable name (e.g., DATABASE_URL, JWT_SECRET)"
    )
    parser.add_argument(
        "--type",
        type=str,
        help="Variable type (string, number, boolean, enum, secret, url, integer)"
    )
    parser.add_argument(
        "--default",
        type=str,
        help="Default value (optional)"
    )
    parser.add_argument(
        "--required",
        action="store_true",
        help="Mark as required (no default)"
    )
    parser.add_argument(
        "--values",
        type=str,
        help="Comma-separated enum values (required for enum type): dev,staging,prod"
    )
    parser.add_argument(
        "--description",
        type=str,
        help="Variable description"
    )
    parser.add_argument(
        "--list-types",
        action="store_true",
        help="List available types"
    )
    parser.add_argument(
        "--validate",
        type=str,
        help="Validate a variable name"
    )
    parser.add_argument(
        "--find-conflicts",
        action="store_true",
        help="Check if variable exists (use with --name)"
    )
    parser.add_argument(
        "--check-exists",
        type=str,
        help="Check if variable exists"
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Verbose output"
    )

    args = parser.parse_args()
    generator = ConfigGenerator(verbose=args.verbose)

    # Handle commands
    if args.list_types:
        generator.list_types()
        return 0

    if args.validate:
        valid, error = generator.validate_naming(args.validate)
        if valid:
            print(f"✓ Variable name '{error}' format is valid")
        else:
            print(f"✗ {error}")
        return 0 if valid else 1

    if args.check_exists:
        exists, error = generator.find_conflicts(args.check_exists)
        if not exists:
            print(f"✓ Variable '{args.check_exists}' already exists")
            return 1
        else:
            print(f"✓ Variable '{args.check_exists}' is unique")
            return 0

    if args.find_conflicts and args.name:
        exists, error = generator.find_conflicts(args.name)
        if exists:
            print(f"✓ Variable '{args.name}' is unique")
        else:
            print(f"✗ {error}")
        return 0 if exists else 1

    if args.name and args.type:
        enum_values = None
        if args.values:
            enum_values = [v.strip() for v in args.values.split(",")]

        success, result = generator.register_variable(
            args.name,
            args.type,
            default=args.default,
            required=args.required,
            enum_values=enum_values,
            description=args.description
        )

        if success:
            normalized = result
            print(f"\n✓ Configuration variable registered")
            print(f"  Name: {normalized}")
            print(f"  Type: {args.type}")
            print(f"  Required: {args.required}")
            print(f"  Default: {args.default or 'none (required)'}")
            if args.description:
                print(f"  Description: {args.description}")

            # Generate .env.example entry
            env_entry = generator.generate_env_example_entry(
                normalized,
                args.type,
                args.description
            )
            print(f"\n.env.example entry:")
            print(env_entry)

            print(f"\nNext steps:")
            print(f"  1. Add entry to .env.example")
            print(f"  2. Run config_discovery.py to find all uses")
            print(f"  3. Validate with config_validator.py")

            return 0
        else:
            print(f"✗ {result}")
            return 1

    print("No command specified. Use --help for usage.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
