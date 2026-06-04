#!/usr/bin/env python3
"""
Metrics Dashboard — Show recent patterns, risks, and task breakdown

Aggregates observable logs (foresight, heartbeat, knowledge capture)
and displays anomalies, patterns, and trends.

Usage:
  python .ai/engine/show_metrics.py . --window 7d
  python .ai/engine/show_metrics.py . --window 24h
  python .ai/engine/show_metrics.py . --window 30d
"""

import sys
import json
from pathlib import Path
from datetime import datetime, timedelta
from collections import defaultdict
from typing import Dict, List


class MetricsDashboard:
    """Aggregate and display observable metrics."""

    def __init__(self, project_path: str = '.'):
        self.project_path = Path(project_path).resolve()
        self.logs_dir = self.project_path / '.ai' / 'logs'
        self.foresight_logs = []
        self.heartbeat_logs = []
        self.knowledge_logs = []

        self._load_logs()

    def _load_logs(self):
        """Load all observable log files."""
        if not self.logs_dir.exists():
            return

        # Load foresight logs
        for log_file in self.logs_dir.glob('foresight-*.jsonl'):
            try:
                with open(log_file, 'r') as f:
                    for line in f:
                        if line.strip():
                            self.foresight_logs.append(json.loads(line))
            except Exception:
                pass

        # Load heartbeat logs
        for log_file in self.logs_dir.glob('heartbeat-*.jsonl'):
            try:
                with open(log_file, 'r') as f:
                    for line in f:
                        if line.strip():
                            self.heartbeat_logs.append(json.loads(line))
            except Exception:
                pass

        # Load knowledge capture logs
        for log_file in self.logs_dir.glob('knowledge-capture-*.jsonl'):
            try:
                with open(log_file, 'r') as f:
                    for line in f:
                        if line.strip():
                            self.knowledge_logs.append(json.loads(line))
            except Exception:
                pass

    def _filter_by_window(self, logs: List[dict], window_str: str) -> List[dict]:
        """Filter logs by time window."""
        if window_str == 'all':
            return logs

        # Parse window: "7d", "24h", "30d"
        if window_str.endswith('d'):
            days = int(window_str[:-1])
            cutoff = datetime.now() - timedelta(days=days)
        elif window_str.endswith('h'):
            hours = int(window_str[:-1])
            cutoff = datetime.now() - timedelta(hours=hours)
        else:
            cutoff = datetime.now() - timedelta(days=7)

        filtered = []
        for log in logs:
            try:
                ts = datetime.fromisoformat(log.get('timestamp', ''))
                if ts > cutoff:
                    filtered.append(log)
            except:
                pass

        return filtered

    def show_dashboard(self, window: str = '7d'):
        """Print metrics dashboard."""

        # Filter logs
        foresight = self._filter_by_window(self.foresight_logs, window)
        heartbeat = self._filter_by_window(self.heartbeat_logs, window)
        knowledge = self._filter_by_window(self.knowledge_logs, window)

        print("\n" + "="*70)
        print(f"METRICS DASHBOARD — Last {window}")
        print("="*70)

        # Summary
        print(f"\n[SUMMARY]")
        print(f"  Foresight analyses: {len(foresight)}")
        print(f"  Heartbeat checks: {len(heartbeat)}")
        print(f"  Knowledge captures: {len(knowledge)}")

        # Foresight metrics
        if foresight:
            self._show_foresight_metrics(foresight)

        # Heartbeat metrics
        if heartbeat:
            self._show_heartbeat_metrics(heartbeat)

        # Knowledge metrics
        if knowledge:
            self._show_knowledge_metrics(knowledge)

        # Top risks
        self._show_top_risks(foresight)

        # Top gaps
        self._show_top_gaps(foresight)

        print("\n" + "="*70)

    def _show_foresight_metrics(self, logs: List[dict]):
        """Show foresight-specific metrics."""
        print(f"\n[FORESIGHT ANALYSIS]")

        total_gaps = sum(log.get('gaps_count', 0) for log in logs)
        total_risks = sum(log.get('risks_count', 0) for log in logs)

        print(f"  Total gaps found: {total_gaps}")
        print(f"  Total risks identified: {total_risks}")
        print(f"  Avg gaps per task: {total_gaps / len(logs):.1f}")

        # Task scopes
        scopes = defaultdict(int)
        for log in logs:
            scopes[log.get('scope', 'unknown')] += 1

        print(f"  Tasks by scope:")
        for scope in sorted(scopes.keys()):
            print(f"    {scope}: {scopes[scope]}")

    def _show_heartbeat_metrics(self, logs: List[dict]):
        """Show heartbeat check metrics."""
        print(f"\n[HEARTBEAT CHECKS]")

        # Parse heartbeat results
        passed = sum(1 for log in logs if log.get('status') == 'pass')
        failed = sum(1 for log in logs if log.get('status') == 'fail')

        print(f"  Checks passed: {passed}")
        print(f"  Checks failed: {failed}")
        print(f"  Pass rate: {100 * passed / len(logs):.0f}%")

    def _show_knowledge_metrics(self, logs: List[dict]):
        """Show knowledge capture metrics."""
        print(f"\n[KNOWLEDGE CAPTURE]")

        # Parse categories
        categories = defaultdict(int)
        for log in logs:
            cat = log.get('category', 'unknown')
            categories[cat] += 1

        print(f"  Total entries captured: {len(logs)}")
        print(f"  By category:")
        for cat in sorted(categories.keys()):
            print(f"    {cat}: {categories[cat]}")

    def _show_top_risks(self, foresight_logs: List[dict]):
        """Show most common risk types."""
        if not foresight_logs:
            return

        print(f"\n[TOP RISKS IDENTIFIED]")

        risk_counts = defaultdict(int)
        for log in foresight_logs:
            for risk in log.get('risks', []):
                title = risk.get('title', 'unknown')
                risk_counts[title] += 1

        if not risk_counts:
            return

        for title, count in sorted(risk_counts.items(), key=lambda x: x[1], reverse=True)[:5]:
            print(f"  {count:2}x {title}")

    def _show_top_gaps(self, foresight_logs: List[dict]):
        """Show most common gap types."""
        if not foresight_logs:
            return

        print(f"\n[TOP GAPS ANTICIPATED]")

        gap_counts = defaultdict(int)
        for log in foresight_logs:
            for gap in log.get('gaps', []):
                title = gap.get('title', 'unknown')
                gap_counts[title] += 1

        if not gap_counts:
            return

        for title, count in sorted(gap_counts.items(), key=lambda x: x[1], reverse=True)[:5]:
            print(f"  {count:2}x {title}")


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='Show metrics dashboard')
    parser.add_argument('project_path', nargs='?', default='.', help='Project path')
    parser.add_argument('--window', type=str, default='7d', help='Time window (7d, 24h, 30d, all)')

    args = parser.parse_args()

    dashboard = MetricsDashboard(args.project_path)
    dashboard.show_dashboard(args.window)
