#!/usr/bin/env python3
"""
Model dispatcher: routes work to loaded local LLMs without reloading.

Reads tiers.yaml, probes LM Studio / Ollama for loaded models,
and executes inference via the configured endpoint + model_id.

Usage:
  from dispatcher import ModelDispatcher

  dispatcher = ModelDispatcher('.ai/plugins/model-dispatch')
  status = dispatcher.probe()  # Check what's loaded

  # Route to a specific tier
  response = dispatcher.dispatch(
    tier='local-fast',
    prompt='Hello',
    fallback=True  # try next tier if not loaded
  )
"""

import os
import sys
import json
import yaml
from pathlib import Path
from typing import Optional, Dict, List, Any
import requests
from dataclasses import dataclass


@dataclass
class TierStatus:
    """Status of a single tier."""
    name: str
    loaded: bool
    provider: str
    model_id: str
    endpoint: str
    reason: Optional[str] = None


class ModelDispatcher:
    """Route work to loaded models; avoid reload overhead."""

    def __init__(self, plugin_dir: str):
        """Initialize from plugin directory (contains tiers.yaml)."""
        self.plugin_dir = Path(plugin_dir)
        self.tiers_file = self.plugin_dir / "tiers.yaml"
        self.tiers: Dict[str, Any] = {}
        self.tier_order = ["local-fast", "local-strong", "local-heavy", "local-vision", "local-embed", "cloud-frontier"]
        self._load_config()

    def _load_config(self):
        """Load tiers.yaml."""
        if not self.tiers_file.exists():
            raise FileNotFoundError(f"tiers.yaml not found at {self.tiers_file}")
        with open(self.tiers_file) as f:
            config = yaml.safe_load(f) or {}
        # tiers.yaml has a 'tiers:' parent key
        self.tiers = config.get("tiers", {})

    def probe(self) -> Dict[str, TierStatus]:
        """
        Check which models are loaded in each tier's provider.
        Returns dict of tier_name -> TierStatus.
        """
        results = {}
        for tier_name, tier_config in self.tiers.items():
            provider = tier_config.get("provider", "unknown")
            endpoint = tier_config.get("endpoint", "")
            model_id = tier_config.get("model_id", "")

            if provider == "lmstudio":
                loaded = self._check_lmstudio(endpoint, model_id)
            elif provider == "ollama":
                loaded = self._check_ollama(endpoint, model_id)
            elif provider == "cloud":
                loaded = True  # Cloud is always "available"
            else:
                loaded = False

            reason = None
            if not loaded:
                reason = f"{provider} endpoint not responding or model not loaded"

            results[tier_name] = TierStatus(
                name=tier_name,
                loaded=loaded,
                provider=provider,
                model_id=model_id,
                endpoint=endpoint,
                reason=reason,
            )

        return results

    def _check_lmstudio(self, endpoint: str, model_id: str) -> bool:
        """Check if model_id is loaded in LM Studio at endpoint."""
        try:
            resp = requests.get(f"{endpoint}/models", timeout=2)
            if resp.status_code != 200:
                return False
            data = resp.json()
            loaded_models = [m.get("id") for m in data.get("data", [])]
            return model_id in loaded_models
        except Exception:
            return False

    def _check_ollama(self, endpoint: str, model_id: str) -> bool:
        """Check if model_id is loaded in Ollama at endpoint."""
        try:
            resp = requests.get(f"{endpoint}/api/tags", timeout=2)
            if resp.status_code != 200:
                return False
            data = resp.json()
            loaded_models = [m.get("name") for m in data.get("models", [])]
            return model_id in loaded_models
        except Exception:
            return False

    def get_available_tiers(self) -> List[str]:
        """Return list of tier names with loaded models, in preference order."""
        status = self.probe()
        available = [name for name in self.tier_order if name in status and status[name].loaded]
        return available

    def dispatch(
        self,
        tier: str,
        prompt: str,
        fallback: bool = True,
        max_tokens: int = 512,
    ) -> Dict[str, Any]:
        """
        Route prompt to a tier's loaded model.

        Args:
            tier: tier name (e.g., 'local-fast')
            prompt: text to send to the model
            fallback: if tier's model not loaded, try next available tier
            max_tokens: max tokens in response

        Returns:
            dict with keys:
              - success (bool): True if dispatch succeeded
              - tier_used (str): which tier was actually used
              - response (str): model response (or error message)
              - model_id (str): model ID that responded
        """
        if tier not in self.tiers:
            return {
                "success": False,
                "tier_used": None,
                "response": f"Tier '{tier}' not found in tiers.yaml",
                "model_id": None,
            }

        status = self.probe()

        # Try requested tier first
        if tier in status and status[tier].loaded:
            return self._call_model(tier, prompt, max_tokens)

        # If not loaded and fallback enabled, try next available
        if fallback:
            available = self.get_available_tiers()
            if available and tier != available[0]:
                return self._call_model(available[0], prompt, max_tokens)

        # No model available
        return {
            "success": False,
            "tier_used": tier,
            "response": f"Tier '{tier}' model not loaded and no fallback available",
            "model_id": self.tiers[tier].get("model_id"),
        }

    def _call_model(self, tier: str, prompt: str, max_tokens: int) -> Dict[str, Any]:
        """Execute inference call to a specific tier."""
        tier_config = self.tiers[tier]
        provider = tier_config.get("provider")
        endpoint = tier_config.get("endpoint")
        model_id = tier_config.get("model_id")

        if provider == "lmstudio":
            return self._call_lmstudio(endpoint, model_id, prompt, max_tokens)
        elif provider == "ollama":
            return self._call_ollama(endpoint, model_id, prompt, max_tokens)
        elif provider == "cloud":
            return {
                "success": True,
                "tier_used": tier,
                "response": "(cloud fallback not yet implemented)",
                "model_id": model_id,
            }
        else:
            return {
                "success": False,
                "tier_used": tier,
                "response": f"Unknown provider: {provider}",
                "model_id": model_id,
            }

    def _call_lmstudio(self, endpoint: str, model_id: str, prompt: str, max_tokens: int) -> Dict[str, Any]:
        """Call LM Studio /v1/chat/completions endpoint."""
        try:
            resp = requests.post(
                f"{endpoint}/chat/completions",
                json={
                    "model": model_id,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": max_tokens,
                    "temperature": 0.7,
                },
                timeout=60,
            )
            if resp.status_code != 200:
                return {
                    "success": False,
                    "tier_used": model_id,
                    "response": f"LM Studio returned {resp.status_code}: {resp.text}",
                    "model_id": model_id,
                }
            data = resp.json()
            response_text = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            return {
                "success": True,
                "tier_used": model_id,
                "response": response_text,
                "model_id": model_id,
            }
        except Exception as e:
            return {
                "success": False,
                "tier_used": model_id,
                "response": f"LM Studio call failed: {str(e)}",
                "model_id": model_id,
            }

    def _call_ollama(self, endpoint: str, model_id: str, prompt: str, max_tokens: int) -> Dict[str, Any]:
        """Call Ollama /api/generate endpoint."""
        try:
            resp = requests.post(
                f"{endpoint}/api/generate",
                json={
                    "model": model_id,
                    "prompt": prompt,
                    "stream": False,
                },
                timeout=60,
            )
            if resp.status_code != 200:
                return {
                    "success": False,
                    "tier_used": model_id,
                    "response": f"Ollama returned {resp.status_code}: {resp.text}",
                    "model_id": model_id,
                }
            data = resp.json()
            response_text = data.get("response", "")
            return {
                "success": True,
                "tier_used": model_id,
                "response": response_text,
                "model_id": model_id,
            }
        except Exception as e:
            return {
                "success": False,
                "tier_used": model_id,
                "response": f"Ollama call failed: {str(e)}",
                "model_id": model_id,
            }


if __name__ == "__main__":
    # CLI for testing
    if len(sys.argv) < 2:
        print("Usage: dispatcher.py probe|status|dispatch <tier> <prompt>")
        sys.exit(1)

    cmd = sys.argv[1]
    dispatcher = ModelDispatcher(".ai/plugins/model-dispatch")

    if cmd == "probe":
        status = dispatcher.probe()
        print("\n=== Model Availability ===")
        for tier_name, info in status.items():
            loaded_str = "✓ LOADED" if info.loaded else "✗ not loaded"
            print(f"{tier_name:20} {loaded_str:15} {info.provider:10} {info.model_id}")
            if info.reason:
                print(f"  → {info.reason}")

    elif cmd == "status":
        available = dispatcher.get_available_tiers()
        print(f"\nAvailable tiers (with loaded models): {available}")

    elif cmd == "dispatch":
        if len(sys.argv) < 4:
            print("Usage: dispatcher.py dispatch <tier> <prompt>")
            sys.exit(1)
        tier = sys.argv[2]
        prompt = " ".join(sys.argv[3:])
        result = dispatcher.dispatch(tier, prompt)
        print(f"\nDispatched to: {result['tier_used']}")
        print(f"Success: {result['success']}")
        print(f"Response:\n{result['response']}")
