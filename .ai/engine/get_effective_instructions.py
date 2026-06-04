import os
from pathlib import Path


def get_effective_instructions(current_path: str) -> str:
    """Depth-priority instruction merging — deepest .ai/instruct.md wins.

    Returns instructions concatenated shallowest-first so the deepest
    (highest-priority) section appears last in the output.
    """
    path = Path(current_path)
    instructions = []

    # Walk from root to current path (shallowest first, deepest last)
    chain = list(reversed(path.parents)) + [path]
    for directory in chain:
        instruct_file = directory / ".ai" / "instruct.md"
        if instruct_file.exists():
            content = instruct_file.read_text(encoding="utf-8").strip()
            if content:
                instructions.append(
                    f"# Instructions from {instruct_file}\n{content}\n"
                )

    return "\n".join(instructions)
