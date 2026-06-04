# Adapter: Cloud Frontier

**Last Updated**: 2026-06-04

> Contract only. No code. Generic placeholder for any cloud provider
> (GitHub Copilot, Anthropic, OpenAI, Google, etc.).

## Contents

| Section | What's here |
|---------|-------------|
| [Endpoint](#endpoint) | Base URL pattern |
| [Detection](#detection) | Availability assumptions |
| [Authentication](#authentication) | API-key rules |
| [Privacy](#privacy) | Why this adapter is unsuitable for `local_only` tiers |
| [Cost](#cost) | Per-call cost considerations |
| [Failure behaviour](#failure-behaviour) | Retry policy |

## Endpoint

- Provider-specific. Document the exact base URL in the tier entry.

## Detection

- Treat as **always available** unless the runtime is offline.
- The runtime SHOULD respect rate limits and surface failures to the user.

## Authentication

- API key via environment variable. NEVER hardcode.
- Variable naming: see [.ai/credentials.md](../../../credentials.md) and the
  config-vars registry.

## Privacy

- This adapter is **not** suitable for tiers with `privacy.local_only: true`.
- The validator should refuse to associate a `local_only` tier with `provider: cloud`.

## Cost

- Per-call cost applies. Adopters SHOULD set a budget cap (e.g. via the
  `observer` agent's metrics + budget thresholds).

## Failure behaviour

- On 4xx (auth, quota): surface the error to the user; do not silently retry.
- On 5xx / timeout: a single retry is acceptable; then surface the error.
