import os
from pathlib import Path

def get_effective_instructions(current_path: str) -> str:
    """Depth-priority instruction merging - deepest .ai/instruct.md wins"""
    path = Path(current_path)
    instructions = []
    
    # Walk from root to current path (deepest wins)
    for parent in reversed(list(path.parents) + [path]):
        instruct_file = parent / ".ai" / "instruct.md"
        if instruct_file.exists():
            with open(instruct_file, 'r') as f:
                content = f.read().strip()
                if content:
                    instructions.append(f"# Instructions from {instruct_file}\n{content}\n")
    
    return "\n".join(reversed(instructions))  # Deepest last = highest priority
