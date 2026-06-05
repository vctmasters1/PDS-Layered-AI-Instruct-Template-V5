#!/usr/bin/env python3
"""
Infrastructure Analyzer — Discovers, analyzes, and adapts project infrastructure
(prompts, agents, skills, MCP tools) to comply with template paradigm and routing.

Usage:
  python infrastructure_analyzer.py --scope . --discover
  python infrastructure_analyzer.py --scope . --analyze
  python infrastructure_analyzer.py --scope . --full --output report.json
"""

import os
import json
import re
from pathlib import Path
from typing import Dict, List, Tuple
from datetime import datetime
import sys

class InfrastructureAnalyzer:
    def __init__(self, scope_path: str = "."):
        self.scope = Path(scope_path).resolve()
        self.errors = []
        self.warnings = []
        self.info = []
        self.timestamp = datetime.now().isoformat()
    
    def discover(self) -> Dict[str, List[Path]]:
        """Discover all infrastructure files in scope."""
        results = {
            'prompts': [],
            'agents': [],
            'skills': [],
            'mcp_tools': [],
        }
        
        # Find prompts in .github/prompts/
        prompts_dir = self.scope / '.github' / 'prompts'
        if prompts_dir.exists():
            results['prompts'] = list(prompts_dir.glob('*.prompt.md'))
        
        # Find agents in .github/agents/
        agents_dir = self.scope / '.github' / 'agents'
        if agents_dir.exists():
            results['agents'] = list(agents_dir.glob('*.agent.md'))
        
        # Find skills in .github/skills/
        skills_dir = self.scope / '.github' / 'skills'
        if skills_dir.exists():
            results['skills'] = list(skills_dir.glob('*/SKILL.md'))
        
        # Find MCP tools in .ai/agents/tools/ and .ai/mcp/tools/
        tools_dir_1 = self.scope / '.ai' / 'agents' / 'tools'
        tools_dir_2 = self.scope / '.ai' / 'mcp' / 'tools'
        if tools_dir_1.exists():
            results['mcp_tools'].extend(tools_dir_1.glob('*.json'))
        if tools_dir_2.exists():
            results['mcp_tools'].extend(tools_dir_2.glob('*.json'))
        
        return results
    
    def parse_frontmatter(self, content: str) -> Tuple[Dict, str]:
        """Extract YAML frontmatter from markdown. Returns (dict, body)."""
        if not content.startswith('---'):
            return {}, content
        
        try:
            parts = content.split('---', 2)
            if len(parts) < 3:
                return {}, content
            
            fm_text = parts[1]
            body = parts[2] if len(parts) > 2 else ''
            
            # Simple YAML parsing (no external dependency)
            fm = {}
            for line in fm_text.strip().split('\n'):
                if ':' in line:
                    key, value = line.split(':', 1)
                    key = key.strip()
                    value = value.strip()
                    # Remove quotes
                    if value.startswith('"') and value.endswith('"'):
                        value = value[1:-1]
                    elif value.startswith("'") and value.endswith("'"):
                        value = value[1:-1]
                    fm[key] = value
            
            return fm, body
        except Exception as e:
            self.errors.append(f"Frontmatter parse error: {e}")
            return {}, content
    
    def is_kebab_case(self, name: str) -> bool:
        """Check if name is kebab-case."""
        return bool(re.match(r'^[a-z0-9]+(-[a-z0-9]+)*$', name))
    
    def analyze_prompt(self, path: Path) -> Dict:
        """Analyze a .prompt.md file for compliance."""
        result = {
            'file': str(path.relative_to(self.scope)),
            'type': 'prompt',
            'issues': [],
        }
        
        try:
            content = path.read_text()
            frontmatter, body = self.parse_frontmatter(content)
            
            # Check required fields
            if 'mode' not in frontmatter:
                result['issues'].append(('ERROR', 'Missing "mode" field in frontmatter'))
            elif frontmatter['mode'] not in ['ask', 'edit', 'agent']:
                result['issues'].append(('ERROR', f"Invalid mode: {frontmatter['mode']}. Must be ask/edit/agent."))
            
            if 'description' not in frontmatter:
                result['issues'].append(('ERROR', 'Missing "description" field in frontmatter'))
            elif len(frontmatter.get('description', '')) < 10:
                result['issues'].append(('WARNING', 'Description too short (< 10 chars). Be more specific.'))
            
            # Check naming
            filename = path.stem.replace('.prompt', '')
            if not self.is_kebab_case(filename):
                result['issues'].append(('WARNING', f"Filename not kebab-case: {filename}"))
            
            # Check routing for orchestration workflows
            if frontmatter.get('mode') == 'agent' and 'major workflow' in frontmatter.get('description', '').lower():
                if '/ai-route' not in body:
                    result['issues'].append(('WARNING', 'Orchestration prompt should route through /ai-route. Consider adding routing step.'))
            
            result['frontmatter'] = frontmatter
            
        except Exception as e:
            result['issues'].append(('ERROR', f"Failed to read file: {e}"))
        
        return result
    
    def analyze_agent(self, path: Path) -> Dict:
        """Analyze a .agent.md file for compliance."""
        result = {
            'file': str(path.relative_to(self.scope)),
            'type': 'agent',
            'issues': [],
        }
        
        try:
            content = path.read_text()
            frontmatter, body = self.parse_frontmatter(content)
            
            # Check required fields
            if 'description' not in frontmatter:
                result['issues'].append(('ERROR', 'Missing "description" field in frontmatter'))
            elif len(frontmatter.get('description', '')) < 20:
                result['issues'].append(('WARNING', 'Description too short (< 20 chars). Be more specific about agent purpose.'))
            
            # Check naming
            filename = path.stem.replace('.agent', '')
            if not self.is_kebab_case(filename):
                result['issues'].append(('WARNING', f"Filename not kebab-case: {filename}"))
            
            if not filename.startswith('pds-'):
                result['issues'].append(('WARNING', f"Agent should follow pds-* naming convention: {filename}"))
            
            # Check tools field if present
            if 'tools' in frontmatter:
                tools_str = frontmatter['tools'].strip()
                if not (tools_str.startswith('[') and tools_str.endswith(']')):
                    result['issues'].append(('WARNING', 'Tools field should be array format [tool1, tool2], not comma-separated'))
            
            result['frontmatter'] = frontmatter
            
        except Exception as e:
            result['issues'].append(('ERROR', f"Failed to read file: {e}"))
        
        return result
    
    def analyze_skill(self, path: Path) -> Dict:
        """Analyze a SKILL.md file for compliance."""
        result = {
            'file': str(path.relative_to(self.scope)),
            'type': 'skill',
            'issues': [],
        }
        
        try:
            content = path.read_text()
            frontmatter, body = self.parse_frontmatter(content)
            
            # Check parent directory naming
            parent_name = path.parent.name
            if not self.is_kebab_case(parent_name):
                result['issues'].append(('WARNING', f"Parent directory not kebab-case: {parent_name}"))
            
            # Check required fields
            if 'description' not in frontmatter:
                result['issues'].append(('ERROR', 'Missing "description" field in frontmatter'))
            elif len(frontmatter.get('description', '')) < 20:
                result['issues'].append(('WARNING', 'Description too short (< 20 chars). Explain when/how to use this skill.'))
            
            result['frontmatter'] = frontmatter
            
        except Exception as e:
            result['issues'].append(('ERROR', f"Failed to read file: {e}"))
        
        return result
    
    def analyze_mcp_tool(self, path: Path) -> Dict:
        """Analyze an MCP tool .json file for compliance."""
        result = {
            'file': str(path.relative_to(self.scope)),
            'type': 'mcp_tool',
            'issues': [],
        }
        
        try:
            content = path.read_text()
            tool_def = json.loads(content)
            
            # Check required fields
            required = ['name', 'description', 'schema', 'checklist', 'safety_level']
            for field in required:
                if field not in tool_def:
                    result['issues'].append(('ERROR', f"Missing required field: {field}"))
            
            # Check naming
            filename = path.stem
            tool_name = tool_def.get('name', '')
            if filename != tool_name:
                result['issues'].append(('WARNING', f"Filename doesn't match tool name. File: {filename}, Tool: {tool_name}"))
            
            if not self.is_kebab_case(filename):
                result['issues'].append(('WARNING', f"Tool name not kebab-case: {filename}"))
            
            # Check location (should be .ai/agents/tools for built-in, .ai/mcp/tools for project)
            if '.ai/agents/tools' in str(path) and not tool_name.startswith('built-in-'):
                result['issues'].append(('INFO', f"Built-in tool location detected. Ensure this is a core template tool, not project-specific."))
            
            result['tool_def'] = tool_def
            
        except json.JSONDecodeError as e:
            result['issues'].append(('ERROR', f"Invalid JSON: {e}"))
        except Exception as e:
            result['issues'].append(('ERROR', f"Failed to read file: {e}"))
        
        return result
    
    def analyze_all(self, discovered: Dict[str, List[Path]]) -> List[Dict]:
        """Analyze all discovered infrastructure."""
        results = []
        
        for prompt in discovered['prompts']:
            results.append(self.analyze_prompt(prompt))
        
        for agent in discovered['agents']:
            results.append(self.analyze_agent(agent))
        
        for skill in discovered['skills']:
            results.append(self.analyze_skill(skill))
        
        for tool in discovered['mcp_tools']:
            results.append(self.analyze_mcp_tool(tool))
        
        return results
    
    def generate_report(self, analysis_results: List[Dict]) -> Dict:
        """Generate compliance report."""
        errors = []
        warnings = []
        info = []
        
        for result in analysis_results:
            for severity, message in result.get('issues', []):
                issue = {'file': result['file'], 'type': result['type'], 'message': message}
                if severity == 'ERROR':
                    errors.append(issue)
                elif severity == 'WARNING':
                    warnings.append(issue)
                else:
                    info.append(issue)
        
        total_files = len(analysis_results)
        files_with_errors = len([r for r in analysis_results if any(s == 'ERROR' for s, _ in r.get('issues', []))])
        
        return {
            'timestamp': self.timestamp,
            'scope': str(self.scope),
            'total_files_analyzed': total_files,
            'files_with_errors': files_with_errors,
            'files_with_warnings': len([r for r in analysis_results if any(s == 'WARNING' for s, _ in r.get('issues', []))]),
            'compliance_score': f"{((total_files - files_with_errors) / total_files * 100):.1f}%" if total_files > 0 else "0%",
            'errors': errors,
            'warnings': warnings,
            'info': info,
            'analysis_results': analysis_results,
        }
    
    def run(self, output_file: str = None) -> Dict:
        """Run full analysis pipeline."""
        print(f"Scanning {self.scope} for infrastructure...")
        discovered = self.discover()
        
        print(f"Found {len(discovered['prompts'])} prompts, {len(discovered['agents'])} agents, "
              f"{len(discovered['skills'])} skills, {len(discovered['mcp_tools'])} MCP tools")
        
        print("Analyzing compliance...")
        analysis_results = self.analyze_all(discovered)
        
        report = self.generate_report(analysis_results)
        
        if output_file:
            with open(output_file, 'w') as f:
                json.dump(report, f, indent=2)
            print(f"Report written to {output_file}")
        
        return report


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='Infrastructure Analyzer')
    parser.add_argument('--scope', default='.', help='Scope path (default: current directory)')
    parser.add_argument('--output', help='Output JSON report file')
    
    args = parser.parse_args()
    
    analyzer = InfrastructureAnalyzer(args.scope)
    report = analyzer.run(args.output)
    
    # Print summary
    print(f"\n{'='*60}")
    print(f"Compliance Score: {report['compliance_score']}")
    print(f"Files with Errors: {report['files_with_errors']}")
    print(f"Files with Warnings: {len(report['warnings'])}")
    print(f"{'='*60}")
    
    if report['errors']:
        print(f"\nERRORS ({len(report['errors'])}):")
        for err in report['errors']:
            print(f"  {err['file']}: {err['message']}")
    
    if report['warnings']:
        print(f"\nWARNINGS ({len(report['warnings'])}):")
        for warn in report['warnings']:
            print(f"  {warn['file']}: {warn['message']}")
    
    # Exit with error code if issues found
    sys.exit(1 if report['files_with_errors'] > 0 else 0)


if __name__ == '__main__':
    main()
