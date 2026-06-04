# Adapter: LM Studio

**Last Updated**: 2026-06-04

> Contract only. No code. Describes how a runtime should talk to a local
> LM Studio server when a tier's `provider: lmstudio`.

## Contents

| Section | What's here |
|---------|-------------|
| [Endpoint](#endpoint) | Base URL and protocol |
| [Detection](#detection) | How to tell if the server is up |
| [Request shape](#request-shape) | API surface |
| [Authentication](#authentication) | Auth requirements |
| [Known limitations](#known-limitations) | Operational caveats |
| [Failure behaviour](#failure-behaviour) | What runtimes must do when unreachable |

## Endpoint

- Default base: `http://localhost:1234/v1`
- OpenAI-compatible REST API.
- Server must be started via **LM Studio → Developer → Start Server** (or `lms server start`).

## Detection

- HTTP GET `<base>/models` returns 200 with `{ "data": [ { "id": "..." } ] }` when up.
- CLI: `lms ps` shows loaded models; `lms ls` shows downloaded models.

## Request shape

- `POST <base>/chat/completions` — OpenAI-compatible payload.
- `POST <base>/embeddings` — for `local-embed` tier.

## Authentication

- None by default (local).

## Known limitations

- Server may unload a model under memory pressure; first call after a cold start incurs load time.
- Concurrent requests are queued per model unless multiple model instances are loaded.
- Sharded GGUF models (e.g. `*-00001-of-00003.gguf`) must all be present in the cache directory.
- GPU device selection: If a tier specifies `gpu_devices: [0, 1, 3]` to exclude GPU 2, the runtime MUST enforce this via `CUDA_VISIBLE_DEVICES=0,1,3` before invoking LM Studio (or equivalent per-provider mechanism). The HTTP API itself does not filter GPUs; enforcement is the caller's responsibility.

## Failure behaviour

- If `<base>/models` is unreachable: tier is **unavailable**. Runtime should fall back per tier policy (and refuse fallback for `privacy.local_only: true` tiers).
