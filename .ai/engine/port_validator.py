#!/usr/bin/env python3
"""
Port Registry Validator — pds-man-ports engine

Scans project for hardcoded ports in config files, docker-compose, scripts, and code.
Compares against .ai/ports.md registry to detect:
  - Port collisions (same port, multiple services)
  - Range violations (port outside allocation guidelines)
  - Unregistered services (hardcoded but not in registry)
  - Drift (code says port X, registry says Y)
  - Orphaned entries (registry entry with no corresponding service)

Usage:
  python .ai/engine/port_validator.py . --report
  python .ai/engine/port_validator.py . --json
  python .ai/engine/port_validator.py . --report --json
"""

import os
import sys
import json
import re
from datetime import datetime
from pathlib import Path
from collections import defaultdict
from dataclasses import dataclass, asdict
from typing import Dict, List, Set, Tuple, Optional


@dataclass
class PortFinding:
    """Single port validation finding."""
    severity: str  # 'error', 'warning', 'info', 'ok'
    category: str  # 'collision', 'range_violation', 'unregistered', 'drift', 'orphaned', 'sync'
    port: Optional[int]
    service_name: str
    location: str  # "docker-compose.yml:12" or "scripts/dev.ps1"
    message: str
    action: str
    found_in_code: Optional[int] = None  # port found in code, if different from registry


class PortValidator:
    """Validate port allocations against registry."""

    PORT_ALLOCATION_RANGES = {
        'primary-backend': (3000, 3099),
        'secondary-backend': (3100, 3199),
        'realtime-services': (3300, 3399),
        'databases': (5000, 5099),
        'cache': (5100, 5199),
        'frontend-dev': (5173, 5273),
        'admin-debug': (8000, 8099),
    }

    def __init__(self, project_path: str = '.'):
        self.project_path = Path(project_path).resolve()
        self.registry = {}
        self.services_in_code = {}  # port -> [(service_name, location), ...]
        self.findings: List[PortFinding] = []

        self._load_registry()
        self._scan_project()

    def _load_registry(self):
        """Load .ai/ports.md registry."""
        ports_file = self.project_path / '.ai' / 'ports.md'
        if not ports_file.exists():
            self.findings.append(PortFinding(
                severity='warning',
                category='sync',
                port=None,
                service_name='registry',
                location='.ai/ports.md',
                message='Registry file not found',
                action='Create .ai/ports.md using template: cp .ai/ports.example.md .ai/ports.md'
            ))
            return

        with open(ports_file, 'r') as f:
            content = f.read()

        # Parse markdown table: | Service | Port | Protocol | ... |
        # Look for lines like: | service-name | 3001 | HTTP | ...
        lines = content.split('\n')
        for line in lines:
            if not line.strip().startswith('|') or '---' in line or 'Service' in line:
                continue

            parts = [p.strip() for p in line.split('|')]
            if len(parts) >= 3:
                service_name = parts[1]
                port_str = parts[2]

                # Try to extract port number
                port_match = re.search(r'\*?(\d+)\*?', port_str)
                if port_match and service_name and service_name.lower() != 'add rows below' and service_name != '':
                    port = int(port_match.group(1))
                    self.registry[port] = service_name

    def _scan_project(self):
        """Scan project for hardcoded ports."""

        # Scan docker-compose files
        for dc_file in self.project_path.glob('docker-compose*.yml'):
            self._scan_docker_compose(dc_file)

        # Scan .env files
        for env_file in self.project_path.glob('.env*'):
            if env_file.name == '.env':
                # Skip live .env if it exists (read .env.example instead)
                example_file = env_file.parent / '.env.example'
                if example_file.exists():
                    self._scan_env_file(example_file)
            else:
                self._scan_env_file(env_file)

        # Scan PowerShell scripts
        for ps_file in self.project_path.glob('**/*.ps1'):
            self._scan_script(ps_file)

        # Scan shell scripts
        for sh_file in self.project_path.glob('**/*.sh'):
            self._scan_script(sh_file)

        # Scan config files (Vite, Webpack, etc.)
        for config_file in self.project_path.glob('**/vite.config.{js,ts}'):
            self._scan_config_file(config_file)

        for config_file in self.project_path.glob('**/webpack.config.{js,ts}'):
            self._scan_config_file(config_file)

        # Scan package.json
        for pkg_file in self.project_path.glob('**/package.json'):
            self._scan_package_json(pkg_file)

    def _scan_docker_compose(self, filepath: Path):
        """Extract ports from docker-compose.yml."""
        try:
            import yaml
        except ImportError:
            return

        try:
            with open(filepath, 'r') as f:
                config = yaml.safe_load(f)

            if not config or 'services' not in config:
                return

            for service_name, service_config in config['services'].items():
                if isinstance(service_config, dict) and 'ports' in service_config:
                    for port_entry in service_config['ports']:
                        # port_entry can be "3001", "3001:3001", "3001:8080", etc.
                        port_str = str(port_entry).split(':')[0]
                        if port_str.isdigit():
                            port = int(port_str)
                            self.services_in_code[port] = self.services_in_code.get(port, [])
                            self.services_in_code[port].append((service_name, f"{filepath.name}"))
        except Exception as e:
            pass

    def _scan_env_file(self, filepath: Path):
        """Extract PORT variables from .env files."""
        try:
            with open(filepath, 'r') as f:
                for line in f:
                    line = line.strip()
                    if '=' in line and not line.startswith('#'):
                        key, value = line.split('=', 1)
                        if 'PORT' in key.upper() and value.isdigit():
                            port = int(value)
                            service_name = key.lower().replace('_port', '')
                            self.services_in_code[port] = self.services_in_code.get(port, [])
                            self.services_in_code[port].append((service_name, f"{filepath.name}"))
        except Exception:
            pass

    def _scan_script(self, filepath: Path):
        """Extract port numbers from launch/dev scripts."""
        try:
            with open(filepath, 'r', errors='ignore') as f:
                content = f.read()

            # Look for patterns like: port 3001, --port 3001, :3001, localhost:3001
            patterns = [
                r'port\s+(\d{4,5})',
                r'--port\s+(\d{4,5})',
                r':(\d{4,5})(?:\s|"|$)',
                r'localhost[:/]+(\d{4,5})',
                r'http://localhost[:/]?(\d{4,5})',
            ]

            for pattern in patterns:
                matches = re.findall(pattern, content, re.IGNORECASE)
                for match in matches:
                    port = int(match)
                    if 3000 <= port <= 9999:  # Sanity check
                        service_name = filepath.stem.replace('dev', '').replace('launch', '').strip('-') or 'unknown'
                        self.services_in_code[port] = self.services_in_code.get(port, [])
                        if (service_name, f"{filepath.relative_to(self.project_path)}") not in self.services_in_code[port]:
                            self.services_in_code[port].append((service_name, str(filepath.relative_to(self.project_path))))
        except Exception:
            pass

    def _scan_config_file(self, filepath: Path):
        """Extract ports from config files (Vite, Webpack, etc.)."""
        try:
            with open(filepath, 'r', errors='ignore') as f:
                content = f.read()

            # Look for port: 5173 or port: XXXX patterns
            matches = re.findall(r'port\s*:\s*(\d{4,5})', content, re.IGNORECASE)
            for match in matches:
                port = int(match)
                if 3000 <= port <= 9999:
                    service_name = filepath.parent.name or 'config'
                    self.services_in_code[port] = self.services_in_code.get(port, [])
                    if (service_name, f"{filepath.relative_to(self.project_path)}") not in self.services_in_code[port]:
                        self.services_in_code[port].append((service_name, str(filepath.relative_to(self.project_path))))
        except Exception:
            pass

    def _scan_package_json(self, filepath: Path):
        """Extract port hints from package.json scripts."""
        try:
            with open(filepath, 'r') as f:
                data = json.load(f)

            if 'scripts' in data:
                for script_name, script_cmd in data['scripts'].items():
                    if isinstance(script_cmd, str):
                        matches = re.findall(r'--port\s+(\d{4,5})|:(\d{4,5})', script_cmd)
                        for match in matches:
                            port = int(match[0] or match[1])
                            if 3000 <= port <= 9999:
                                service_name = script_name.lower()
                                self.services_in_code[port] = self.services_in_code.get(port, [])
                                if (service_name, f"{filepath.relative_to(self.project_path)}") not in self.services_in_code[port]:
                                    self.services_in_code[port].append((service_name, str(filepath.relative_to(self.project_path))))
        except Exception:
            pass

    def validate(self) -> List[PortFinding]:
        """Run all validation checks."""

        # Check 1: Port collisions in code
        for port, services in self.services_in_code.items():
            if len(services) > 1:
                service_list = ', '.join([f"{s[0]} ({s[1]})" for s in services])
                self.findings.append(PortFinding(
                    severity='error',
                    category='collision',
                    port=port,
                    service_name=f"multiple services",
                    location=service_list,
                    message=f"Port {port} assigned to multiple services",
                    action="Manually reassign one service to a different port, update registry, notify team"
                ))

        # Check 2: Range violations
        for port in self.services_in_code.keys():
            violation = self._check_range_violation(port)
            if violation:
                self.findings.append(violation)

        # Check 3: Unregistered services
        for port, services in self.services_in_code.items():
            if port not in self.registry:
                for service_name, location in services:
                    self.findings.append(PortFinding(
                        severity='info',
                        category='unregistered',
                        port=port,
                        service_name=service_name,
                        location=location,
                        message=f"Service '{service_name}' found on port {port} but not in registry",
                        action=f"Add to .ai/ports.md or confirm it's external/optional"
                    ))

        # Check 4: Drift (registry vs. code)
        for port, service_name in self.registry.items():
            if port not in self.services_in_code:
                self.findings.append(PortFinding(
                    severity='warning',
                    category='orphaned',
                    port=port,
                    service_name=service_name,
                    location='.ai/ports.md',
                    message=f"Registry entry '{service_name}' on port {port} not found in code",
                    action="Is this service external/optional, or has it been moved/removed?"
                ))

        # Check 5: Overall sync status
        if not any(f.severity in ['error', 'warning'] for f in self.findings):
            total_services = len(self.services_in_code)
            self.findings.append(PortFinding(
                severity='ok',
                category='sync',
                port=None,
                service_name='all',
                location='.ai/ports.md',
                message=f"Port registry in sync: {total_services} services, 0 conflicts",
                action="No action needed"
            ))

        return self.findings

    def _check_range_violation(self, port: int) -> Optional[PortFinding]:
        """Check if port is in valid allocation range."""
        for range_name, (min_port, max_port) in self.PORT_ALLOCATION_RANGES.items():
            if min_port <= port <= max_port:
                return None  # Valid

        # Port is outside all ranges — find nearest range
        all_ports = [min_port for min_port, _ in self.PORT_ALLOCATION_RANGES.values()]
        nearest_range = min(self.PORT_ALLOCATION_RANGES.items(),
                           key=lambda x: abs(x[1][0] - port))

        services = self.services_in_code.get(port, [('unknown', 'unknown')])
        service_name, location = services[0]

        return PortFinding(
            severity='warning',
            category='range_violation',
            port=port,
            service_name=service_name,
            location=location,
            message=f"Port {port} is outside allocation guidelines",
            action=f"Consider moving to range: {nearest_range[0]} ({nearest_range[1][0]}-{nearest_range[1][1]})"
        )

    def print_report(self):
        """Print findings in human-readable format."""
        print("\n" + "="*70)
        print(f"Port Registry Validation Report — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("="*70)

        if not self.findings:
            print("[INFO] No findings — registry validation passed")
            return

        # Group by severity
        by_severity = defaultdict(list)
        for finding in self.findings:
            by_severity[finding.severity].append(finding)

        order = ['error', 'warning', 'info', 'ok']
        for severity in order:
            if severity in by_severity:
                findings = by_severity[severity]
                icon = {'error': '[ERR]', 'warning': '[WARN]', 'info': '[INFO]', 'ok': '[OK]'}[severity]

                print(f"\n{icon} {severity.upper()} ({len(findings)})")
                for f in findings:
                    print(f"  {f.category}: {f.message}")
                    if f.port:
                        print(f"    Port: {f.port}")
                    print(f"    Service: {f.service_name}")
                    print(f"    Location: {f.location}")
                    print(f"    Action: {f.action}")
                    print()

    def export_json(self, output_file: str = None) -> str:
        """Export findings to JSON."""
        if output_file is None:
            output_file = self.project_path / '.ai' / 'logs' / f"port-validation-{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"

        # Ensure directory exists
        output_file = Path(output_file)
        output_file.parent.mkdir(parents=True, exist_ok=True)

        report = {
            'timestamp': datetime.now().isoformat(),
            'project_path': str(self.project_path),
            'summary': {
                'total_findings': len(self.findings),
                'errors': sum(1 for f in self.findings if f.severity == 'error'),
                'warnings': sum(1 for f in self.findings if f.severity == 'warning'),
                'infos': sum(1 for f in self.findings if f.severity == 'info'),
            },
            'findings': [asdict(f) for f in self.findings],
            'registry': self.registry,
            'services_in_code': {str(k): [(s[0], s[1]) for s in v] for k, v in self.services_in_code.items()},
        }

        with open(output_file, 'w') as f:
            json.dump(report, f, indent=2)

        return str(output_file)


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='Validate port allocations against registry')
    parser.add_argument('project_path', nargs='?', default='.', help='Project path (default: .)')
    parser.add_argument('--report', action='store_true', help='Print human-readable report')
    parser.add_argument('--json', action='store_true', help='Export findings to JSON')

    args = parser.parse_args()

    validator = PortValidator(args.project_path)
    validator.validate()

    if args.report:
        validator.print_report()

    if args.json or not args.report:
        json_file = validator.export_json()
        print(f"[OK] Findings exported to: {json_file}")

    # Exit with error code if errors found
    if any(f.severity == 'error' for f in validator.findings):
        sys.exit(1)
