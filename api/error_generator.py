#!/usr/bin/env python3
"""
Error Code Generator — Central Controller for Error Creation

Enforces error code naming (ERR_{DOMAIN}_{REASON}) and HTTP status mapping at creation time.

Usage:
    python error_generator.py --domain user --reason not_found --verbose
    python error_generator.py --domain payment --reason declined --http 402
    python error_generator.py --list-domains
    python error_generator.py --list-reasons
    python error_generator.py --validate ERR_USER_NOT_FOUND
    python error_generator.py --find-conflicts --code ERR_USER_NOT_FOUND
"""

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path


# Domain registry
DOMAIN_REGISTRY = {
    "USER": "User account errors",
    "PRODUCT": "Product catalog errors",
    "ORDER": "Order processing errors",
    "PAYMENT": "Payment transaction errors",
    "AUTH": "Authentication/authorization errors",
    "VALIDATION": "Input validation errors",
    "SYSTEM": "System/infrastructure errors",
}

# Reason registry
REASON_REGISTRY = {
    "NOT_FOUND": (404, "Resource doesn't exist"),
    "INVALID": (400, "Data format/value invalid"),
    "ALREADY_EXISTS": (409, "Unique constraint violated"),
    "OUT_OF_STOCK": (400, "Inventory unavailable"),
    "INVALID_STATE": (400, "State transition not allowed"),
    "UNAUTHORIZED": (403, "User lacks permission"),
    "INVALID_TOKEN": (401, "Token malformed/expired"),
    "DECLINED": (402, "External service rejected"),
    "SCHEMA": (400, "Request validation failed"),
    "INTERNAL": (500, "Unhandled exception"),
}

ERROR_PREFIX = "ERR_"
ERROR_REGISTRY_FILE = Path("./.errors-registry.json")


class ErrorGenerator:
    """Central error code generator enforcing naming conventions."""

    def __init__(self, verbose=False):
        self.verbose = verbose
        self.load_registry()

    def load_registry(self):
        """Load existing error registry."""
        if ERROR_REGISTRY_FILE.exists():
            self.registry = json.loads(ERROR_REGISTRY_FILE.read_text())
        else:
            self.registry = {}

    def save_registry(self):
        """Save error registry."""
        ERROR_REGISTRY_FILE.write_text(json.dumps(self.registry, indent=2))

    def generate_error_code(self, domain, reason, http_status=None):
        """Generate error code from domain and reason."""
        domain_upper = domain.upper()
        reason_upper = reason.upper()

        # Validate domain
        if domain_upper not in DOMAIN_REGISTRY:
            return None, f"Domain '{domain}' not in registry. Use --list-domains"

        # Validate reason or use provided http_status
        if reason_upper in REASON_REGISTRY:
            expected_http = REASON_REGISTRY[reason_upper][0]
            if http_status and http_status != expected_http:
                print(f"⚠ Warning: Reason '{reason}' typically uses HTTP {expected_http}, not {http_status}")
            http_status = http_status or expected_http
        elif not http_status:
            return None, f"Reason '{reason}' not in registry and no --http provided"

        code = f"{ERROR_PREFIX}{domain_upper}_{reason_upper}"

        if self.verbose:
            print(f"   ✓ Domain: {domain_upper}")
            print(f"   ✓ Reason: {reason_upper}")
            print(f"   ✓ HTTP Status: {http_status}")
            print(f"   ✓ Generated: {code}")

        return (code, http_status), None

    def validate_error_code(self, code):
        """Validate error code format."""
        if not code.startswith(ERROR_PREFIX):
            return False, f"Error code must start with '{ERROR_PREFIX}' prefix"

        parts = code.split("_")
        if len(parts) < 3:
            return False, "Error code must have format: ERR_{DOMAIN}_{REASON}"

        domain = parts[1]
        if domain not in DOMAIN_REGISTRY:
            return False, f"Domain '{domain}' not in registry"

        return True, None

    def find_conflicts(self, code):
        """Check if error code already registered."""
        if code in self.registry:
            return False, f"Error code '{code}' already registered: {self.registry[code]}"
        return True, None

    def list_domains(self):
        """List available domains."""
        print("\n" + "=" * 70)
        print("ERROR CODE DOMAINS")
        print("=" * 70)
        for domain, description in DOMAIN_REGISTRY.items():
            print(f"  {domain:<20} {description}")
        print()

    def list_reasons(self):
        """List available reasons."""
        print("\n" + "=" * 70)
        print("ERROR CODE REASONS (with HTTP Status)")
        print("=" * 70)
        for reason, (status, description) in REASON_REGISTRY.items():
            print(f"  {reason:<20} {status:<3}   {description}")
        print()

    def register_error(self, code, http_status, message_template):
        """Register an error code."""
        if code in self.registry:
            return False, f"Error code '{code}' already exists"

        self.registry[code] = {
            "http_status": http_status,
            "message_template": message_template,
            "created_at": datetime.utcnow().isoformat() + "Z"
        }
        self.save_registry()
        return True, code


def main():
    parser = argparse.ArgumentParser(
        description="Error Code Generator — Central Controller for Errors"
    )

    parser.add_argument(
        "--domain",
        type=str,
        help="Error domain (USER, PRODUCT, ORDER, PAYMENT, AUTH, VALIDATION, SYSTEM)"
    )
    parser.add_argument(
        "--reason",
        type=str,
        help="Error reason (NOT_FOUND, INVALID, ALREADY_EXISTS, UNAUTHORIZED, etc.)"
    )
    parser.add_argument(
        "--http",
        type=int,
        help="HTTP status code (optional; inferred from reason if available)"
    )
    parser.add_argument(
        "--message",
        type=str,
        help="Error message template"
    )
    parser.add_argument(
        "--list-domains",
        action="store_true",
        help="List available domains"
    )
    parser.add_argument(
        "--list-reasons",
        action="store_true",
        help="List available reasons"
    )
    parser.add_argument(
        "--validate",
        type=str,
        help="Validate an error code"
    )
    parser.add_argument(
        "--find-conflicts",
        action="store_true",
        help="Check if error code exists (use with --code)"
    )
    parser.add_argument(
        "--code",
        type=str,
        help="Error code to check"
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Verbose output"
    )

    args = parser.parse_args()
    generator = ErrorGenerator(verbose=args.verbose)

    # Handle commands
    if args.list_domains:
        generator.list_domains()
        return 0

    if args.list_reasons:
        generator.list_reasons()
        return 0

    if args.validate:
        valid, error = generator.validate_error_code(args.validate)
        if valid:
            print(f"✓ Error code '{args.validate}' format is valid")
        else:
            print(f"✗ {error}")
        return 0 if valid else 1

    if args.find_conflicts and args.code:
        exists, error = generator.find_conflicts(args.code)
        if exists:
            print(f"✓ Error code '{args.code}' is unique")
        else:
            print(f"✗ {error}")
        return 0 if exists else 1

    if args.domain and args.reason:
        result, error = generator.generate_error_code(args.domain, args.reason, args.http)

        if error:
            print(f"✗ {error}")
            return 1

        code, http_status = result

        # Check conflicts
        exists, conflict_error = generator.find_conflicts(code)
        if not exists:
            print(f"✗ {conflict_error}")
            return 1

        # Register if message provided
        if args.message:
            success, msg = generator.register_error(code, http_status, args.message)
            if success:
                print(f"\n✓ Error code generated and registered")
                print(f"  Code: {code}")
                print(f"  HTTP Status: {http_status}")
                print(f"  Message Template: {args.message}")
            else:
                print(f"✗ {msg}")
                return 1
        else:
            print(f"\n✓ Error code generated")
            print(f"  Code: {code}")
            print(f"  HTTP Status: {http_status}")
            print(f"\nNext steps:")
            print(f"  1. Create error class with code '{code}'")
            print(f"  2. Use error_discovery.py to find all errors in code")
            print(f"  3. Validate with error_validator.py")

        return 0

    print("No command specified. Use --help for usage.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
