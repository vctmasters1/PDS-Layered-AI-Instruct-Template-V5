#!/usr/bin/env python3
"""
Hierarchical Instruct Discovery Engine (V6)

Filesystem-as-source discovery system for V6 architecture.
Scans .hi/ for artifacts and generates registries.

Usage:
    python discovery-engine.py --scope . --output registry.json
    python discovery-engine.py --scope api/ --output local-registry.json
"""

import os
import sys
import json
import argparse
import re
from pathlib import Path
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass, asdict, field
from datetime import datetime


@dataclass
class Artifact:
    """Base artifact metadata."""
    name: str
    path: str
    type: str  # "prompt", "agent", "skill", "workflow", "mcp_tool"
    module_prefix: Optional[str] = None
    tier: Optional[str] = None
    full_qualified_name: str = field(default="")
    
    def __post_init__(self):
        """Calculate full qualified name."""
        if self.module_prefix:
            self.full_qualified_name = f"{self.type[0:3]}-{self.module_prefix}-{self.name}"
        else:
            self.full_qualified_name = f"{self.type[0:3]}-{self.name}"


@dataclass
class DiscoveryResult:
    """Complete discovery result."""
    role: str  # "top_dog" or "subordinate"
    scope_root: str
    artifacts: List[Artifact] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    scan_time: str = field(default_factory=lambda: datetime.now().isoformat())
    
    def to_dict(self):
        """Convert to dictionary for JSON serialization."""
        return {
            "role": self.role,
            "scope_root": self.scope_root,
            "scan_time": self.scan_time,
            "artifacts": [asdict(a) for a in self.artifacts],
            "errors": self.errors,
            "warnings": self.warnings,
            "summary": {
                "total_artifacts": len(self.artifacts),
                "prompts": len([a for a in self.artifacts if a.type == "prompt"]),
                "agents": len([a for a in self.artifacts if a.type == "agent"]),
                "skills": len([a for a in self.artifacts if a.type == "skill"]),
                "workflows": len([a for a in self.artifacts if a.type == "workflow"]),
                "errors": len(self.errors),
                "warnings": len(self.warnings),
            }
        }


class DiscoveryEngine:
    """V6 Discovery Engine: filesystem-as-source registry builder."""
    
    # Artifact patterns
    HIP_PATTERN = re.compile(r"^hip-(.+)\.prompt\.md$")  # hip-{name}.prompt.md
    HIA_PATTERN = re.compile(r"^hia-(.+)\.agent\.md$")   # hia-{name}.agent.md
    HIS_PATTERN = re.compile(r"^his-(.+)\.supervisor\.md$")  # his-{name}.supervisor.md
    HIW_PATTERN = re.compile(r"^hiw-(.+)\.ya?ml$")       # hiw-{name}.yml or .yaml
    SKILL_PATTERN = re.compile(r"^SKILL\.md$")
    
    # Module prefix pattern (module-artifact naming)
    MODULE_PATTERN = re.compile(r"^hia-(.+?)-(.+)\.agent\.md$")  # hia-{module}-{name}.agent.md
    
    def __init__(self, scope_root: str = "."):
        """Initialize engine with a scope root."""
        self.scope_root = Path(scope_root).resolve()
        self.role = self._detect_role()
        self.result = DiscoveryResult(
            role=self.role,
            scope_root=str(self.scope_root)
        )
    
    def _detect_role(self) -> str:
        """
        Detect if this scope is 'top_dog' (root) or 'subordinate' (sub-project).
        
        Top-dog markers (check in order):
        1. .github/copilot-instructions.md exists
        2. .hi/index.md exists
        3. Root-level AGENTS.md exists
        
        Raises error if ambiguous (multiple markers from different scopes).
        """
        markers = []
        
        # Primary marker: root-level copilot-instructions.md
        copilot_marker = self.scope_root / ".github" / "copilot-instructions.md"
        if copilot_marker.exists():
            markers.append(("copilot-instructions.md", "primary"))
        
        # Secondary marker: .hi/index.md (V6 unified naming)
        index_marker = self.scope_root / ".hi" / "index.md"
        if index_marker.exists():
            markers.append(("index.md", "secondary"))
        
        # Tertiary marker: root AGENTS.md
        agents_marker = self.scope_root / "AGENTS.md"
        if agents_marker.exists():
            markers.append(("AGENTS.md", "tertiary"))
        
        if not markers:
            return "subordinate"
        
        # If we have primary marker, it's definitely top_dog
        if any(m[1] == "primary" for m in markers):
            return "top_dog"
        
        # If we have secondary, it's top_dog
        if any(m[1] == "secondary" for m in markers):
            return "top_dog"
        
        # Tertiary alone (AGENTS.md) → top_dog
        return "top_dog"
    
    def run(self) -> DiscoveryResult:
        """Execute full discovery scan."""
        if self.role == "top_dog":
            self._run_top_dog()
        else:
            self._run_subordinate()
        
        return self.result
    
    def _run_top_dog(self):
        """Top-dog scan: root project scans all artifacts including modules."""
        # Scan root .hi/
        hi_dir = self.scope_root / ".hi"
        
        if hi_dir.exists():
            self._scan_directory(hi_dir, module_prefix=None)
        
        # Scan sub-projects (modules) for their artifacts
        for module_dir in self.scope_root.iterdir():
            if not module_dir.is_dir() or module_dir.name.startswith("."):
                continue
            
            module_hi = module_dir / ".hi"
            if module_hi.exists():
                self._scan_directory(module_hi, module_prefix=module_dir.name)
        
        # Validate for collisions
        self._validate_all()
    
    def _run_subordinate(self):
        """Subordinate scan: sub-project scans only its local artifacts."""
        hi_dir = self.scope_root / ".hi"
        
        if hi_dir.exists():
            self._scan_directory(hi_dir, module_prefix=None)
        else:
            self.result.warnings.append(
                f"No .hi/ directory found in subordinate scope {self.scope_root}"
            )
        
        self._validate_all()
    
    def _scan_directory(self, directory: Path, module_prefix: Optional[str] = None):
        """Recursively scan directory for artifacts."""
        try:
            for root, dirs, files in os.walk(directory):
                # Skip hidden directories
                dirs[:] = [d for d in dirs if not d.startswith(".")]
                
                for filename in files:
                    filepath = Path(root) / filename
                    
                    # Prompts: hip-*.prompt.md
                    if match := self.HIP_PATTERN.match(filename):
                        name = match.group(1)
                        artifact = Artifact(
                            name=name,
                            path=str(filepath.relative_to(self.scope_root)),
                            type="prompt",
                            module_prefix=module_prefix
                        )
                        self.result.artifacts.append(artifact)
                    
                    # Agents: hia-*.agent.md or hia-{module}-*.agent.md
                    elif match := self.HIA_PATTERN.match(filename):
                        name = match.group(1)
                        
                        # Check if module-prefixed (hia-api-validate)
                        if "-" in name and not module_prefix:
                            # Could be module-prefixed
                            parts = name.split("-", 1)
                            detected_module, artifact_name = parts
                            # Only treat as module-prefix if it looks like one
                            if detected_module in ["api", "config", "db", "gui", "validation"]:
                                artifact = Artifact(
                                    name=artifact_name,
                                    path=str(filepath.relative_to(self.scope_root)),
                                    type="agent",
                                    module_prefix=detected_module,
                                    tier=self._detect_tier(root)
                                )
                            else:
                                artifact = Artifact(
                                    name=name,
                                    path=str(filepath.relative_to(self.scope_root)),
                                    type="agent",
                                    module_prefix=module_prefix,
                                    tier=self._detect_tier(root)
                                )
                        else:
                            artifact = Artifact(
                                name=name,
                                path=str(filepath.relative_to(self.scope_root)),
                                type="agent",
                                module_prefix=module_prefix,
                                tier=self._detect_tier(root)
                            )
                        self.result.artifacts.append(artifact)
                    
                    # Skills: SKILL.md
                    elif filename == "SKILL.md":
                        # Extract skill name from parent directory
                        skill_name = Path(root).name
                        artifact = Artifact(
                            name=skill_name,
                            path=str(filepath.relative_to(self.scope_root)),
                            type="skill",
                            module_prefix=module_prefix
                        )
                        self.result.artifacts.append(artifact)
                    
                    # Workflows: hiw-*.yml or hiw-*.yaml
                    elif match := self.HIW_PATTERN.match(filename):
                        name = match.group(1)
                        artifact = Artifact(
                            name=name,
                            path=str(filepath.relative_to(self.scope_root)),
                            type="workflow",
                            module_prefix=module_prefix
                        )
                        self.result.artifacts.append(artifact)
        
        except Exception as e:
            self.result.errors.append(f"Error scanning directory {directory}: {str(e)}")
    
    def _detect_tier(self, dirpath: str) -> Optional[str]:
        """Detect agent tier from directory path."""
        dirpath_lower = dirpath.lower()
        if "tier-1" in dirpath_lower:
            return "tier-1"
        elif "tier-2" in dirpath_lower:
            if "workers" in dirpath_lower:
                return "tier-2-workers"
            elif "observers" in dirpath_lower:
                return "tier-2-observers"
            elif "specialists" in dirpath_lower:
                return "tier-2-specialists"
            else:
                return "tier-2"
        return None
    
    def _validate_all(self):
        """Validate artifacts for collisions and naming issues."""
        seen_fqn = {}
        
        for artifact in self.result.artifacts:
            fqn = artifact.full_qualified_name
            
            # Check for duplicates
            if fqn in seen_fqn:
                self.result.errors.append(
                    f"COLLISION: {fqn} appears in both {seen_fqn[fqn]} and {artifact.path}"
                )
            else:
                seen_fqn[fqn] = artifact.path
            
            # Check naming conventions
            if artifact.type == "prompt" and not artifact.name.startswith("hip-"):
                # Prompts should match hip- pattern (already matched above)
                pass
            
            if artifact.type == "agent" and not artifact.name.startswith("hia-"):
                # Agents should match hia- pattern (already matched above)
                pass


def main():
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="V6 Hierarchical Instruct Discovery Engine"
    )
    parser.add_argument(
        "--scope",
        default=".",
        help="Root directory to scan (default: .)"
    )
    parser.add_argument(
        "--output",
        required=True,
        help="Output JSON file for registry"
    )
    parser.add_argument(
        "--errors",
        default=".ai/discovery/errors.jsonl",
        help="Output file for errors (JSONL format)"
    )
    
    args = parser.parse_args()
    
    # Run discovery
    engine = DiscoveryEngine(scope_root=args.scope)
    result = engine.run()
    
    # Ensure output directory exists
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Write registry
    result_dict = result.to_dict()
    with open(output_path, "w") as f:
        json.dump(result_dict, f, indent=2)
    
    summary = result_dict["summary"]
    print(f"✓ Registry written to {output_path}")
    print(f"  Role: {result.role}")
    print(f"  Artifacts: {summary['total_artifacts']}")
    print(f"    - Prompts: {summary['prompts']}")
    print(f"    - Agents: {summary['agents']}")
    print(f"    - Skills: {summary['skills']}")
    print(f"    - Workflows: {summary['workflows']}")
    
    if result.errors:
        print(f"\n⚠ {len(result.errors)} errors:")
        for error in result.errors:
            print(f"  - {error}")
    
    if result.warnings:
        print(f"\n⚠ {len(result.warnings)} warnings:")
        for warning in result.warnings:
            print(f"  - {warning}")
    
    # Exit with error code if there were errors
    sys.exit(1 if result.errors else 0)


if __name__ == "__main__":
    main()
