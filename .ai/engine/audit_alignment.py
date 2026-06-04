#!/usr/bin/env python3
"""
AI Instruction Alignment Audit — Generate a rules refresh summary

Used by /ai-check-yourself to produce a digest of authoritative rules
for the current scope. Reads effective instructions, conventions, and
generates a checklist of key rules the AI should remember.

Usage:
  python .ai/engine/audit_alignment.py .
  python .ai/engine/audit_alignment.py . --json
"""

import sys
import json
from pathlib import Path
from datetime import datetime


def load_file_section(filepath: Path, max_lines: int = 50) -> str:
    """Load first N lines of a file as a summary."""
    try:
        with open(filepath, 'r', errors='ignore') as f:
            lines = f.readlines()[:max_lines]
            return ''.join(lines)
    except FileNotFoundError:
        return ""


def get_project_mode(project_path: Path) -> str:
    """Extract Project Mode from dev-specs.md"""
    dev_specs = project_path / '.github' / 'dev-specs.md'
    if dev_specs.exists():
        with open(dev_specs, 'r') as f:
            content = f.read()
            if '[x]' in content and 'Template Development' in content:
                return 'TEMPLATE DEVELOPMENT'
            elif '[x]' in content and 'Production/Adoption' in content:
                return 'PRODUCTION/ADOPTION'
    return 'UNKNOWN'


def get_effective_scope(project_path: Path) -> Path:
    """Find the deepest .ai/instruct.md in the current hierarchy."""
    cwd = project_path.resolve()
    deepest = None

    # Walk from root down to find all .ai/instruct.md files
    for parent in [cwd] + list(cwd.parents):
        instruct = parent / '.ai' / 'instruct.md'
        if instruct.exists():
            deepest = parent

    return deepest or project_path


def generate_alignment_audit(project_path: str = '.') -> dict:
    """Generate a rules refresh summary."""
    project_path = Path(project_path).resolve()

    audit = {
        'timestamp': datetime.now().isoformat(),
        'project_path': str(project_path),
        'project_mode': get_project_mode(project_path),
        'effective_scope': str(get_effective_scope(project_path)),
        'key_rules': [],
        'files_loaded': [],
        'warnings': [],
    }

    # 1. Load dev-specs (CRITICAL)
    dev_specs = project_path / '.github' / 'dev-specs.md'
    if dev_specs.exists():
        audit['key_rules'].append({
            'priority': 'CRITICAL',
            'rule': 'Read dev-specs.md FIRST',
            'details': f'Project Mode: {audit["project_mode"]}',
            'file': 'dev-specs.md'
        })
        audit['files_loaded'].append(str(dev_specs))
    else:
        audit['warnings'].append('dev-specs.md not found')

    # 2. Depth-priority paradigm
    audit['key_rules'].append({
        'priority': 'CRITICAL',
        'rule': 'Depth-priority hierarchy',
        'details': 'Deeper .ai/instruct.md files are authoritative; shallower files provide context only',
        'file': '.github/copilot-instructions.md'
    })

    # 3. Template vs Production
    if audit['project_mode'] == 'TEMPLATE DEVELOPMENT':
        audit['key_rules'].append({
            'priority': 'HIGH',
            'rule': 'Template Development Mode',
            'details': 'Can modify .ai/, .github/, create plugins; commit framework improvements',
            'file': '.github/dev-specs.md'
        })
    elif audit['project_mode'] == 'PRODUCTION/ADOPTION':
        audit['key_rules'].append({
            'priority': 'HIGH',
            'rule': 'Production/Adoption Mode',
            'details': 'Never commit adopter machine configs (.env, tiers.yaml, load_strategy.yaml); only project source',
            'file': '.github/dev-specs.md'
        })

    # 4. Naming conventions
    audit['key_rules'].append({
        'priority': 'HIGH',
        'rule': 'Naming conventions',
        'details': 'Python=snake_case, PowerShell=kebab-case, Markdown=kebab-case, directories=kebab-case',
        'file': '.ai/conventions.md'
    })

    # 5. Credentials
    audit['key_rules'].append({
        'priority': 'CRITICAL',
        'rule': 'Never commit credentials',
        'details': 'No .env (only .env.example), .pem, .key, or secrets in git ever',
        'file': '.ai/credentials.md'
    })

    # 6. Archive-first
    audit['key_rules'].append({
        'priority': 'HIGH',
        'rule': 'Archive-first, never delete',
        'details': 'Delete via archive pattern: mirror path under .archive/ or .old/; never permanently remove',
        'file': '.ai/maintenance.md'
    })

    # 7. AI-INSTRUCT Maintenance
    audit['key_rules'].append({
        'priority': 'HIGH',
        'rule': 'AI-INSTRUCT Maintenance Rule',
        'details': 'Update .ai/instruct.md with every architectural change; run /ai-update-index after',
        'file': '.github/copilot-instructions.md'
    })

    # 8. Environment isolation
    audit['key_rules'].append({
        'priority': 'HIGH',
        'rule': 'Detect-then-ask for host mutations',
        'details': 'Never silently install packages; always check if in venv/container/WSL first',
        'file': '.ai/environment.md'
    })

    # 9. Port registry
    audit['key_rules'].append({
        'priority': 'MEDIUM',
        'rule': 'Port registry is authoritative',
        'details': 'All services listed in .ai/ports.md; validator detects collisions and drift',
        'file': '.ai/ports.md'
    })

    # 10. No duplication rule
    audit['key_rules'].append({
        'priority': 'HIGH',
        'rule': 'No duplication of rules',
        'details': 'One source of truth per topic; other files link to canonical source',
        'file': '.ai/conventions.md'
    })

    # Load canonical files for file_loaded audit trail
    canonical_files = [
        '.ai/conventions.md',
        '.ai/credentials.md',
        '.ai/environment.md',
        '.ai/maintenance.md',
        '.ai/ports.md',
        '.github/copilot-instructions.md',
    ]

    for fname in canonical_files:
        fpath = project_path / fname
        if fpath.exists():
            audit['files_loaded'].append(fname)

    return audit


def print_alignment_summary(audit: dict):
    """Print a human-readable alignment summary."""
    print("\n" + "="*70)
    print("AI INSTRUCTION ALIGNMENT AUDIT")
    print("="*70)

    print(f"\nProject: {audit['project_path'].split(chr(92))[-1]}")
    print(f"Project Mode: {audit['project_mode']}")
    print(f"Effective Scope: {audit['effective_scope'].split(chr(92))[-1] if chr(92) in audit['effective_scope'] else audit['effective_scope']}")

    print(f"\n[OK] Files Re-Read ({len(audit['files_loaded'])}):")
    for fname in audit['files_loaded']:
        print(f"  ✓ {fname}")

    if audit['warnings']:
        print(f"\n[WARN] Missing Files ({len(audit['warnings'])}):")
        for warn in audit['warnings']:
            print(f"  ⚠ {warn}")

    # Group rules by priority
    critical = [r for r in audit['key_rules'] if r['priority'] == 'CRITICAL']
    high = [r for r in audit['key_rules'] if r['priority'] == 'HIGH']
    medium = [r for r in audit['key_rules'] if r['priority'] == 'MEDIUM']

    if critical:
        print(f"\n[CRITICAL] Must Remember ({len(critical)}):")
        for rule in critical:
            print(f"  ✓ {rule['rule']}: {rule['details']}")

    if high:
        print(f"\n[HIGH] Important Rules ({len(high)}):")
        for rule in high:
            print(f"  ✓ {rule['rule']}: {rule['details']}")

    if medium:
        print(f"\n[MEDIUM] Additional Rules ({len(medium)}):")
        for rule in medium:
            print(f"  ✓ {rule['rule']}: {rule['details']}")

    print("\n" + "="*70)
    print("READY TO PROCEED WITH CORRECTED UNDERSTANDING")
    print("="*70)
    print("\nWhat would you like me to do next?")


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='Audit AI instruction alignment')
    parser.add_argument('project_path', nargs='?', default='.', help='Project path')
    parser.add_argument('--json', action='store_true', help='Output JSON instead of human-readable')

    args = parser.parse_args()

    audit = generate_alignment_audit(args.project_path)

    if args.json:
        print(json.dumps(audit, indent=2))
    else:
        print_alignment_summary(audit)
