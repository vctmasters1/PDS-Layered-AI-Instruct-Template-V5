#!/usr/bin/env python3
"""
Tier configuration advisor: analyzes hardware + loaded models,
recommends optimal tier assignments for best space/performance utilization.

Usage:
  python suggest-tiers.py

Output:
  - Hardware summary (CPU, RAM, GPUs)
  - Loaded models + sizes
  - Optimization analysis (throughput, latency, VRAM utilization)
  - Recommended tier assignments
  - Copy-paste config block for tiers.yaml
"""

import os
import sys
import yaml
import requests
import json
from pathlib import Path
from typing import Dict, List, Tuple, Any
from dataclasses import dataclass


@dataclass
class GPU:
    """GPU device info."""
    index: int
    name: str
    vram_gb: int
    compute_tier: bool  # True if available for compute, False if display-only


@dataclass
class LoadedModel:
    """Model currently loaded in inference server."""
    name: str
    model_id: str
    size_gb: float
    provider: str
    endpoint: str

    def __hash__(self):
        return hash(self.model_id)

    def __eq__(self, other):
        if not isinstance(other, LoadedModel):
            return False
        return self.model_id == other.model_id


class TierAdvisor:
    """Recommend optimal tier configuration based on hardware."""

    def __init__(self, plugin_dir: str = ".ai/plugins/model-dispatch"):
        self.plugin_dir = Path(plugin_dir)
        self.tiers_file = self.plugin_dir / "tiers.yaml"
        self.current_config = {}
        self._load_current_config()

    def _load_current_config(self):
        """Load current tiers.yaml if it exists."""
        if self.tiers_file.exists():
            with open(self.tiers_file) as f:
                config = yaml.safe_load(f) or {}
            self.current_config = config.get("tiers", {})

    def get_hardware_summary(self) -> Dict[str, Any]:
        """Gather hardware info from system."""
        import platform
        import psutil

        cpus = psutil.cpu_count(logical=False) or 1
        cpu_threads = psutil.cpu_count(logical=True) or 1
        ram_gb = psutil.virtual_memory().total / (1024**3)

        return {
            "os": platform.system(),
            "cpu_cores": cpus,
            "cpu_threads": cpu_threads,
            "ram_gb": ram_gb,
        }

    def get_gpus(self) -> List[GPU]:
        """Get GPU info from tiers.yaml first, then try nvidia-smi."""
        gpus = []

        # Try to read from tiers.yaml first (already probed and committed)
        try:
            with open(self.tiers_file) as f:
                content = f.read()

            # Parse GPU comment block: "# GPU N: Name (size) [display-only?]"
            for line in content.split('\n'):
                if line.startswith('#') and 'GPU ' in line and ':' in line:
                    # Example: "# GPU 2: NVIDIA GeForce RTX 4060 Ti (16 GB VRAM) — DISPLAY ONLY"
                    try:
                        gpu_idx_part = line.split(':')[0].replace('#', '').replace('GPU', '').strip()
                        if gpu_idx_part.isdigit():
                            idx = int(gpu_idx_part)
                            remainder = line[line.index(':') + 1:]

                            # Extract name (before first paren)
                            name = remainder.split('(')[0].strip()

                            # Extract VRAM
                            vram_gb = 32.0  # default
                            if '16 GB' in remainder or '16GB' in remainder:
                                vram_gb = 16.0
                            elif '32 GB' in remainder or '32GB' in remainder:
                                vram_gb = 32.0
                            elif '24 GB' in remainder or '24GB' in remainder:
                                vram_gb = 24.0

                            # Check if display-only (case-insensitive)
                            is_compute = (
                                'display' not in remainder.lower()
                                and 'display-only' not in remainder.lower()
                            )
                            gpus.append(GPU(idx, name, vram_gb, is_compute))
                    except Exception:
                        pass

            if gpus:
                return gpus
        except Exception:
            pass

        # Fallback: try nvidia-smi (Windows)
        try:
            import subprocess

            result = subprocess.run(
                ["nvidia-smi", "--query-gpu=index,name,memory.total", "--format=csv,noheader"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if result.returncode == 0 and result.stdout:
                for line in result.stdout.strip().split('\n'):
                    if not line:
                        continue
                    parts = [p.strip() for p in line.split(',')]
                    if len(parts) >= 3:
                        try:
                            idx = int(parts[0])
                            name = parts[1]
                            vram_mb = int(parts[2].split()[0])
                            vram_gb = vram_mb / 1024

                            # Mark 4060 Ti as display-only
                            is_compute = '4060' not in name
                            gpus.append(GPU(idx, name, vram_gb, is_compute))
                        except (ValueError, IndexError):
                            pass
                if gpus:
                    return gpus
        except Exception:
            pass

        return gpus

    def probe_lmstudio_models(self, endpoint: str) -> List[LoadedModel]:
        """Query LM Studio for loaded models + their sizes."""
        models = []
        try:
            resp = requests.get(f"{endpoint}/models", timeout=2)
            if resp.status_code == 200:
                data = resp.json()
                for model_data in data.get("data", []):
                    model_id = model_data.get("id", "unknown")
                    # Estimate size from name heuristics (27B, 35B, 70B, etc.)
                    size_gb = self._estimate_model_size(model_id)
                    models.append(
                        LoadedModel(
                            name=model_id.split('/')[-1],
                            model_id=model_id,
                            size_gb=size_gb,
                            provider="lmstudio",
                            endpoint=endpoint,
                        )
                    )
        except Exception:
            pass
        return models

    def _estimate_model_size(self, model_id: str) -> float:
        """Rough estimate of model size in GB based on name and params."""
        model_id_lower = model_id.lower()

        # Embedding models
        if 'embedding' in model_id_lower or 'embed' in model_id_lower:
            return 0.5

        # Size-based heuristics (approximate quantized size)
        if '1b' in model_id_lower or '1-b' in model_id_lower:
            return 0.7
        if '3b' in model_id_lower or '3-b' in model_id_lower:
            return 2.0
        if '7b' in model_id_lower or '7-b' in model_id_lower:
            return 4.5
        if '13b' in model_id_lower or '13-b' in model_id_lower:
            return 8.0
        if '27b' in model_id_lower or '27-b' in model_id_lower:
            return 16.0
        if '32b' in model_id_lower or '32-b' in model_id_lower:
            return 19.0
        if '35b' in model_id_lower or '35-b' in model_id_lower:
            # MoE models are typically smaller than dense
            if 'moe' in model_id_lower or 'a3b' in model_id_lower:
                return 20.0  # Qwen 35B MoE is ~20GB
            return 21.0
        if '70b' in model_id_lower or '70-b' in model_id_lower:
            return 42.0
        if '80b' in model_id_lower or '80-b' in model_id_lower:
            return 48.0

        # Check for LM Studio naming (qwen-0, qwen-1, etc.)
        # These are typically medium to large models
        if 'coder' in model_id_lower or 'code' in model_id_lower:
            return 40.0  # Code models tend to be large

        # Default conservative guess
        return 18.0

    def recommend_tier_assignments(
        self, gpus: List[GPU], models: List[LoadedModel]
    ) -> Dict[str, Dict[str, Any]]:
        """
        Recommend which model should go to which tier,
        optimized for space/performance utilization.

        Strategy:
        - Prioritize tiers by performance role (fast → strong → heavy)
        - Assign models to tiers based on their size class and capability
        - Maximize VRAM utilization across all compute GPUs
        - Use fallback suggestions if not enough models loaded
        """
        recommendations = {}

        # Filter to compute GPUs
        compute_gpus = [g for g in gpus if g.compute_tier]
        total_compute_vram = sum(g.vram_gb for g in compute_gpus)

        if not compute_gpus or not models:
            # Return empty recommendations if no compute GPUs
            return {
                "local-fast": {"model": None, "note": "No compute GPUs available"},
                "local-strong": {"model": None, "note": "No compute GPUs available"},
                "local-heavy": {"model": None, "note": "No compute GPUs available"},
                "local-vision": {"model": None, "note": "No compute GPUs available"},
                "local-embed": {"model": None, "note": "No compute GPUs available"},
                "cloud-frontier": {
                    "model": "copilot-chat",
                    "note": "Cloud always available",
                },
            }

        # Sort models by size for smart assignment
        sorted_by_size = sorted(models, key=lambda m: m.size_gb)

        # Tier assignment priorities (in order of assignment)
        tier_specs = [
            # (tier_name, predicate_fn, target_size_range)
            ("local-embed", lambda m: "embed" in m.model_id.lower(), (0, 2)),
            (
                "local-vision",
                lambda m: any(
                    x in m.model_id.lower() for x in ["vision", "llava", "qwen-vl", "multimodal"]
                ),
                (10, 20),
            ),
            ("local-fast", lambda m: True, (5, 15)),  # Any small-to-mid model
            ("local-strong", lambda m: True, (15, 30)),  # Balanced
            ("local-heavy", lambda m: "coder" in m.model_id.lower(), (40, 100)),  # Large
        ]

        used_models = set()

        for tier_name, predicate, size_range in tier_specs:
            # Find best model for this tier
            candidates = [
                m
                for m in sorted_by_size
                if m not in used_models
                and predicate(m)
                and size_range[0] <= m.size_gb <= size_range[1]
            ]

            if not candidates:
                # If no models match the predicate in range, pick any unused of that size
                candidates = [
                    m
                    for m in sorted_by_size
                    if m not in used_models
                    and size_range[0] <= m.size_gb <= size_range[1]
                ]

            if candidates:
                # Pick the best fit (closest to middle of range)
                target = (size_range[0] + size_range[1]) / 2
                best = min(candidates, key=lambda m: abs(m.size_gb - target))
                used_models.add(best)

                # Estimate GPU assignment based on model size
                if best.size_gb > 30:
                    # Large model: use all compute GPUs
                    gpu_indices = [g.index for g in compute_gpus]
                elif best.size_gb > 15:
                    # Medium model: use first 2 GPUs or 1 if only 1 available
                    gpu_indices = [g.index for g in compute_gpus[:2]]
                else:
                    # Small model: use single GPU
                    gpu_indices = [compute_gpus[0].index]

                recommendations[tier_name] = {
                    "model": best.model_id,
                    "size_gb": best.size_gb,
                    "gpu_indices": gpu_indices,
                    "description": tier_name,
                    "current": self.current_config.get(tier_name, {}).get("model_id", "—"),
                }
            else:
                recommendations[tier_name] = {
                    "model": None,
                    "size_gb": 0,
                    "gpu_indices": [],
                    "description": tier_name,
                    "current": self.current_config.get(tier_name, {}).get("model_id", "—"),
                    "note": f"No model in range {size_range[0]}-{size_range[1]}GB loaded",
                }

        # Cloud fallback
        recommendations["cloud-frontier"] = {
            "model": "copilot-chat",
            "size_gb": 0,
            "gpu_indices": [],
            "description": "Cloud fallback",
            "current": self.current_config.get("cloud-frontier", {}).get("model_id", "—"),
            "note": "Always available",
        }

        return recommendations

    def analyze_utilization(
        self, gpus: List[GPU], models: List[LoadedModel], recommendations: Dict
    ) -> Dict[str, Any]:
        """Analyze space/performance utilization with recommendations."""
        compute_gpus = [g for g in gpus if g.compute_tier]
        total_compute_vram = sum(g.vram_gb for g in compute_gpus)
        total_model_size = sum(m.size_gb for m in models if m in [
            recommendations.get(t, {}).get("model") for t in recommendations
        ])

        assigned_size = sum(
            r.get("size_gb", 0) for r in recommendations.values() if r.get("model")
        )

        return {
            "compute_gpus": len(compute_gpus),
            "total_compute_vram_gb": total_compute_vram,
            "total_model_size_gb": total_model_size,
            "assigned_size_gb": assigned_size,
            "utilization_pct": (assigned_size / total_compute_vram * 100)
            if total_compute_vram > 0
            else 0,
            "headroom_gb": total_compute_vram - assigned_size,
        }


def main():
    advisor = TierAdvisor()

    print("=" * 70)
    print("TIER CONFIGURATION ADVISOR".center(70))
    print("Based on hardware, GPU space, and loaded models".center(70))
    print("=" * 70)

    # Hardware
    hw = advisor.get_hardware_summary()
    print(f"\n=== HARDWARE ===")
    print(f"CPU:  {hw['cpu_cores']} cores / {hw['cpu_threads']} threads")
    print(f"RAM:  {hw['ram_gb']:.1f} GB")

    # GPUs
    gpus = advisor.get_gpus()
    print(f"\n=== GPUs ===")
    compute_gpus = [g for g in gpus if g.compute_tier]
    display_gpus = [g for g in gpus if not g.compute_tier]

    if gpus:
        for gpu in gpus:
            tag = "(compute)" if gpu.compute_tier else "(display-only)"
            print(f"GPU {gpu.index}: {gpu.name:40} {gpu.vram_gb:6.1f} GB  {tag}")
    else:
        print("No GPUs detected")

    total_compute = sum(g.vram_gb for g in compute_gpus)
    print(f"\nTotal compute VRAM: {total_compute:.1f} GB")
    if display_gpus:
        print(f"Display-only GPUs: {', '.join([f'GPU {g.index}' for g in display_gpus])}")

    # Models
    print(f"\n=== LOADED MODELS (LM Studio) ===")
    models = advisor.probe_lmstudio_models("http://localhost:1234/v1")

    if models:
        total_size = sum(m.size_gb for m in models)
        for model in sorted(models, key=lambda m: m.size_gb):
            print(
                f"  {model.name:35} {model.size_gb:6.1f} GB  ({model.model_id})"
            )
        print(f"\nTotal loaded: {total_size:.1f} GB")
    else:
        print("  (No models detected — is LM Studio running on localhost:1234?)")
        return

    # Recommendations
    print(f"\n=== RECOMMENDATIONS ===")
    recommendations = advisor.recommend_tier_assignments(gpus, models)
    utilization = advisor.analyze_utilization(gpus, models, recommendations)

    for tier_name, rec in recommendations.items():
        if rec.get("model"):
            model = rec["model"]
            size = rec["size_gb"]
            gpu_str = f"GPUs {rec['gpu_indices']}"
            print(
                f"\n{tier_name:20}  =>  {model:35}  ({size:5.1f} GB, {gpu_str})"
            )
            print(f"  Current:  {rec['current']}")
        else:
            print(f"\n{tier_name:20}  =>  (no suitable model loaded)")
            if rec.get("note"):
                print(f"  {rec['note']}")

    # GPU device restrictions (excludes display-only cards from compute tiers)
    print(f"\n=== SPACE UTILIZATION ===")
    print(f"Compute GPUs:       {utilization['compute_gpus']}")
    print(f"Total compute VRAM: {utilization['total_compute_vram_gb']:.1f} GB")
    print(f"Assigned to tiers:  {utilization['assigned_size_gb']:.1f} GB")
    print(f"Utilization:        {utilization['utilization_pct']:.1f}%")
    print(f"Headroom:           {utilization['headroom_gb']:.1f} GB (available for expansion)")

    # Generate config block
    print(f"\n=== SUGGESTED TIERS.YAML CONFIG ===")
    print("Copy the tier definitions below into tiers.yaml:\n")

    for tier_name, rec in recommendations.items():
        if rec.get("model"):
            model_id = rec["model"]
            gpu_devices = rec["gpu_indices"]
            print(f"  {tier_name}:")
            print(f"    provider: lmstudio")
            print(f"    model_id: {model_id}")
            print(f"    gpu_devices: {gpu_devices}")
            print()


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
