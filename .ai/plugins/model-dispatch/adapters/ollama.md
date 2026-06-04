# Adapter: Ollama

**Last Updated**: 2026-06-04

> Contract only. No code.

## Contents

| Section | What's here |
|---------|-------------|
| [Endpoint](#endpoint) | Base URL and protocol |
| [Detection](#detection) | How to tell if the server is up |
| [Authentication](#authentication) | Auth requirements |
| [Known limitations](#known-limitations) | Operational caveats |
| [Failure behaviour](#failure-behaviour) | What runtimes must do when unreachable |

## Endpoint

- Default base: `http://localhost:11434`
- Native API: `POST /api/generate`, `POST /api/chat`, `POST /api/embeddings`.
- OpenAI-compatible shim: `http://localhost:11434/v1` (newer versions).

## Detection

- HTTP GET `/api/tags` returns `{ "models": [ { "name": "...", "size": ... } ] }`.
- CLI: `ollama list`.

## Authentication

- None by default (local).

## Known limitations

- Model names include a tag (e.g. `qwen2.5-coder:7b`). Tier `model_id:` must include the tag.
- First call after install pulls the model from the registry; can be slow.

## Failure behaviour

- If `/api/tags` is unreachable: tier unavailable; fall back per tier policy.
