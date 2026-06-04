#!/usr/bin/env python3
"""
Memory Hygiene Tool — Deduplicate, age, and archive knowledge base entries

Scans .ai/knowledge/ for stale, duplicate, or orphaned entries.
Suggests archival per .ai/knowledge/.cleanup-policy.md.

Usage:
  python .ai/engine/memory_hygiene.py . --list
  python .ai/engine/memory_hygiene.py . --search "keyword"
  python .ai/engine/memory_hygiene.py . --older-than 180
  python .ai/engine/memory_hygiene.py . --older-than 180 --dry-run
  python .ai/engine/memory_hygiene.py . --older-than 180 --archive
"""

import sys
import os
from pathlib import Path
from datetime import datetime, timedelta
from dataclasses import dataclass
from typing import List, Dict, Set
import json
import shutil
from difflib import SequenceMatcher


@dataclass
class KnowledgeEntry:
    """Single knowledge base entry."""
    path: Path
    title: str
    content: str
    last_modified: datetime
    size_bytes: int
    owner: str = "unknown"
    keywords: List[str] = None

    def age_days(self) -> int:
        """Days since last modification."""
        return (datetime.now() - self.last_modified).days

    def is_stale(self, threshold_days: int = 180) -> bool:
        """Is this entry older than threshold?"""
        return self.age_days() > threshold_days


class MemoryHygiene:
    """Analyze and maintain knowledge base."""

    def __init__(self, project_path: str = '.'):
        self.project_path = Path(project_path).resolve()
        self.kb_path = self.project_path / '.ai' / 'knowledge'
        self.old_path = self.kb_path / '.old'
        self.entries: List[KnowledgeEntry] = []

        self._scan_kb()

    def _scan_kb(self):
        """Scan all .md files in knowledge base."""
        if not self.kb_path.exists():
            return

        for md_file in self.kb_path.glob('**/*.md'):
            # Skip cleanup policy itself and .old/ entries
            if '.old' in str(md_file) or md_file.name == 'README.md':
                continue

            try:
                with open(md_file, 'r', errors='ignore') as f:
                    content = f.read()

                # Extract title from H1
                title = md_file.stem
                for line in content.split('\n'):
                    if line.startswith('# '):
                        title = line[2:].strip()
                        break

                # Extract owner if present
                owner = 'unknown'
                for line in content.split('\n'):
                    if '**Owner**:' in line or 'owner:' in line:
                        owner = line.split(':', 1)[1].strip()
                        break

                # Extract keywords
                keywords = []
                for line in content.split('\n'):
                    if 'keywords:' in line.lower():
                        kw_str = line.split(':', 1)[1].strip()
                        keywords = [k.strip() for k in kw_str.split(',')]
                        break

                stat = md_file.stat()
                entry = KnowledgeEntry(
                    path=md_file,
                    title=title,
                    content=content,
                    last_modified=datetime.fromtimestamp(stat.st_mtime),
                    size_bytes=stat.st_size,
                    owner=owner,
                    keywords=keywords or []
                )
                self.entries.append(entry)
            except Exception as e:
                pass

    def list_entries(self):
        """List all entries with metadata."""
        print(f"\n[OK] Knowledge Base Entries ({len(self.entries)})")
        print("="*80)

        # Sort by module/type
        by_type = {}
        for entry in self.entries:
            type_name = entry.path.parent.name
            if type_name not in by_type:
                by_type[type_name] = []
            by_type[type_name].append(entry)

        for type_name in sorted(by_type.keys()):
            entries = by_type[type_name]
            print(f"\n{type_name}/ ({len(entries)})")
            for entry in sorted(entries, key=lambda e: e.last_modified, reverse=True):
                age = entry.age_days()
                stale_mark = " [STALE]" if entry.is_stale() else ""
                print(f"  {entry.path.name:50} | {age:3}d old | {entry.size_bytes:6}B{stale_mark}")

    def search(self, keyword: str):
        """Search entries by keyword."""
        matches = []
        keyword_lower = keyword.lower()

        for entry in self.entries:
            if (keyword_lower in entry.title.lower() or
                keyword_lower in entry.content.lower() or
                keyword_lower in ' '.join(entry.keywords).lower()):
                matches.append(entry)

        print(f"\n[OK] Search Results: '{keyword}' ({len(matches)} matches)")
        print("="*80)

        for entry in matches:
            print(f"\n{entry.path.relative_to(self.project_path)}")
            print(f"  Title: {entry.title}")
            print(f"  Age: {entry.age_days()} days")
            print(f"  Owner: {entry.owner}")
            if entry.keywords:
                print(f"  Keywords: {', '.join(entry.keywords)}")

    def find_stale(self, threshold_days: int = 180) -> List[KnowledgeEntry]:
        """Find entries older than threshold."""
        stale = [e for e in self.entries if e.is_stale(threshold_days)]
        return sorted(stale, key=lambda e: e.age_days(), reverse=True)

    def find_duplicates(self) -> List[tuple]:
        """Find likely duplicate entries using string similarity."""
        duplicates = []
        seen = set()

        for i, entry1 in enumerate(self.entries):
            if i in seen:
                continue

            for j, entry2 in enumerate(self.entries[i+1:], start=i+1):
                if j in seen:
                    continue

                # Simple similarity check
                similarity = SequenceMatcher(None, entry1.content, entry2.content).ratio()

                if similarity > 0.6:  # > 60% similar
                    duplicates.append((entry1, entry2, similarity))
                    seen.add(j)

        return sorted(duplicates, key=lambda x: x[2], reverse=True)

    def show_stale_report(self, threshold_days: int = 180, dry_run: bool = True):
        """Show entries ready for archival."""
        stale = self.find_stale(threshold_days)

        print(f"\n[STALE ENTRIES] Older than {threshold_days} days ({len(stale)} found)")
        print("="*80)

        if not stale:
            print("[OK] No stale entries found")
            return

        for entry in stale:
            print(f"\n{entry.path.relative_to(self.project_path)}")
            print(f"  Last modified: {entry.last_modified.strftime('%Y-%m-%d')}")
            print(f"  Age: {entry.age_days()} days")
            print(f"  Owner: {entry.owner}")
            print(f"  Action: Archive → .old/{datetime.now().strftime('%Y%m%d')}/{entry.path.name}")

        if not dry_run:
            print("\n[ARCHIVING...]")
            self._archive_entries(stale)

    def _archive_entries(self, entries: List[KnowledgeEntry]):
        """Archive entries to .old/[YYYYMMDD]/"""
        archive_date = datetime.now().strftime('%Y%m%d')
        archive_dir = self.old_path / archive_date
        archive_dir.mkdir(parents=True, exist_ok=True)

        for entry in entries:
            dest = archive_dir / entry.path.name
            print(f"  Archiving: {entry.path.name} → .old/{archive_date}/")

            # Add archival note to file
            with open(entry.path, 'r') as f:
                content = f.read()

            with open(dest, 'w') as f:
                f.write(f"<!-- Archived: {datetime.now().isoformat()} -->\n\n")
                f.write(content)

            # Remove from active KB
            entry.path.unlink()

        print(f"[OK] Archived {len(entries)} entries to .old/{archive_date}/")

    def show_duplicates_report(self):
        """Show likely duplicate entries."""
        dups = self.find_duplicates()

        print(f"\n[DUPLICATES] Potential duplicates ({len(dups)} found)")
        print("="*80)

        if not dups:
            print("[OK] No duplicates found")
            return

        for entry1, entry2, similarity in dups:
            print(f"\n[{similarity:.0%} similar]")
            print(f"  1. {entry1.path.relative_to(self.project_path)}")
            print(f"     Title: {entry1.title}")
            print(f"  2. {entry2.path.relative_to(self.project_path)}")
            print(f"     Title: {entry2.title}")
            print(f"  Action: Review and merge manually; archive the duplicate")

    def show_metrics(self, window_days: int = 7):
        """Show recent metrics and patterns."""
        recent = [e for e in self.entries if e.age_days() <= window_days]
        by_type = {}
        by_owner = {}

        for entry in recent:
            type_name = entry.path.parent.name
            by_type[type_name] = by_type.get(type_name, 0) + 1
            by_owner[entry.owner] = by_owner.get(entry.owner, 0) + 1

        print(f"\n[METRICS] Last {window_days} days")
        print("="*80)

        print(f"\nTotal Entries: {len(self.entries)}")
        print(f"Recent (< {window_days}d): {len(recent)}")
        print(f"Stale (> 180d): {len(self.find_stale())}")

        print(f"\nBy Type:")
        for type_name in sorted(by_type.keys()):
            print(f"  {type_name}: {by_type[type_name]}")

        print(f"\nBy Owner:")
        for owner in sorted(by_owner.keys()):
            print(f"  {owner}: {by_owner[owner]}")

        print(f"\nSize: {sum(e.size_bytes for e in self.entries) / 1024:.1f} KB")


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='Knowledge base hygiene tool')
    parser.add_argument('project_path', nargs='?', default='.', help='Project path')
    parser.add_argument('--list', action='store_true', help='List all entries')
    parser.add_argument('--search', type=str, help='Search by keyword')
    parser.add_argument('--older-than', type=int, help='Find entries older than N days')
    parser.add_argument('--dry-run', action='store_true', help='Show archival plan without executing')
    parser.add_argument('--archive', action='store_true', help='Execute archival')
    parser.add_argument('--duplicates', action='store_true', help='Find duplicate entries')
    parser.add_argument('--metrics', action='store_true', help='Show metrics')
    parser.add_argument('--window', type=int, default=7, help='Metrics window (days)')

    args = parser.parse_args()

    hygiene = MemoryHygiene(args.project_path)

    if args.list:
        hygiene.list_entries()
    elif args.search:
        hygiene.search(args.search)
    elif args.duplicates:
        hygiene.show_duplicates_report()
    elif args.metrics:
        hygiene.show_metrics(args.window)
    elif args.older_than:
        dry_run = not args.archive
        hygiene.show_stale_report(args.older_than, dry_run)
    else:
        # Default: show metrics
        hygiene.show_metrics()
