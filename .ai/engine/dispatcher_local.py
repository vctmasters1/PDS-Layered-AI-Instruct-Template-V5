#!/usr/bin/env python3
"""
Local Model Dispatcher for Phase 2 Executor

Routes generation tasks to local LLM (coder-0 at localhost:1234/v1) or frontier models.
This is a workspace-local version that doesn't depend on PDS-Master-002.

Configuration:
  - Endpoint: localhost:1234/v1 (LM Studio)
  - Model: coder-0 (40GB, local-heavy tier)
  - Timeout: 180 seconds
  - Max tokens: 1024
"""

import requests
import json
from dataclasses import dataclass
from typing import Optional, Dict
import time


@dataclass
class DispatchResult:
    """Result of a dispatch call."""
    success: bool
    tier_used: str
    model_id: str
    response: str
    tokens_used: Optional[int] = None
    latency_ms: Optional[float] = None


class LocalModelDispatcher:
    """Routes tasks to local LLM endpoints."""

    def __init__(self, endpoint: str = "http://localhost:1234/v1"):
        self.endpoint = endpoint
        self.model_id = "coder-0"
        self.timeout = 180
        self.max_tokens = 1024

    def dispatch(
        self,
        prompt: str,
        tier: str = "local-heavy",
        max_tokens: Optional[int] = None,
        timeout: Optional[int] = None,
    ) -> Dict:
        """
        Dispatch a generation task to local LLM.

        Args:
            prompt: The generation prompt
            tier: "local-heavy" (coder-0 only)
            max_tokens: Max output tokens (default 1024)
            timeout: Timeout in seconds (default 180)

        Returns:
            {
                "success": bool,
                "tier_used": str,
                "model_id": str,
                "response": str,
                "tokens_used": int,
                "latency_ms": float
            }
        """
        if tier != "local-heavy":
            return {
                "success": False,
                "tier_used": "none",
                "model_id": "none",
                "response": "",
                "error": f"Unknown tier: {tier}",
            }

        max_tokens = max_tokens or self.max_tokens
        timeout = timeout or self.timeout

        try:
            start_time = time.time()

            # Call LM Studio
            response = requests.post(
                f"{self.endpoint}/chat/completions",
                json={
                    "model": self.model_id,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.3,  # Low temp for deterministic output
                    "max_tokens": max_tokens,
                    "top_p": 0.9,
                },
                timeout=timeout,
            )

            latency_ms = (time.time() - start_time) * 1000

            if response.status_code == 200:
                data = response.json()
                content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                usage = data.get("usage", {})

                return {
                    "success": True,
                    "tier_used": "local-heavy",
                    "model_id": self.model_id,
                    "response": content,
                    "tokens_used": usage.get("completion_tokens", 0),
                    "latency_ms": latency_ms,
                }
            else:
                return {
                    "success": False,
                    "tier_used": "local-heavy",
                    "model_id": self.model_id,
                    "response": "",
                    "error": f"HTTP {response.status_code}: {response.text}",
                }

        except requests.exceptions.Timeout:
            return {
                "success": False,
                "tier_used": "local-heavy",
                "model_id": self.model_id,
                "response": "",
                "error": f"Timeout after {timeout}s",
            }

        except requests.exceptions.ConnectionError:
            return {
                "success": False,
                "tier_used": "local-heavy",
                "model_id": self.model_id,
                "response": "",
                "error": "Connection failed (LM Studio not running?)",
            }

        except Exception as e:
            return {
                "success": False,
                "tier_used": "local-heavy",
                "model_id": self.model_id,
                "response": "",
                "error": str(e),
            }


# Singleton instance
_dispatcher = None


def get_dispatcher(endpoint: Optional[str] = None) -> LocalModelDispatcher:
    """Get or create the dispatcher singleton."""
    global _dispatcher
    if _dispatcher is None:
        _dispatcher = LocalModelDispatcher(endpoint or "http://localhost:1234/v1")
    return _dispatcher
