"""
go.py — CLI entry point for PDS Role Builder.

Mirrors the pattern of PDS-BuildTools/go.py.
"""

import sys
from pathlib import Path

# Add PDS-Role root to path so tools package is importable
sys.path.insert(0, str(Path(__file__).parent))

from tools.role_builder import main

if __name__ == "__main__":
    main()
