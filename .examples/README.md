# .examples/ — Filled-In Module Showcase

> **Read-only reference.** These are realistic, filled-in module examples that show what a healthy `.ai/instruct.md` looks like in three common project shapes. They are **not** wired into any build — copy what you need into a real module and delete the rest.

The bare scaffold for a brand-new module lives in [`.example-module/`](../.example-module/). This directory complements it with *worked* examples.

---

## What's here

| Example | Stack | Demonstrates |
|---------|-------|--------------|
| [`auth-api/`](auth-api/) | Node.js · Express · JWT · Postgres | Backend service with route/service/repository layering, security rules, and a CI gate. **Includes real TypeScript code** — see [`auth-api/README.md`](auth-api/README.md) for the reading order. |
| [`data-layer/`](data-layer/) | TypeScript · TypeORM · Postgres | Shared data-access module with repository pattern, migration discipline, transaction rules |
| [`ui-component/`](ui-component/) | React · TypeScript · Tailwind · Storybook | Frontend component library with naming, accessibility, and styling rules |

Each module ships with:

- `.ai/instruct.md` — the **filled-in** module instructions (the headline artifact)
- `before-after.md` — a short side-by-side showing how AI behavior shifts once the layered instructions are in place
- `.dev-docs/index.md` — the dev-docs scaffold (empty, as expected)
- `.env.example` — only where the module has its own runtime config

---

## How to use these examples

1. **Read the `.ai/instruct.md`** in the example whose shape most resembles a real module you're about to build.
2. **Read `before-after.md`** to see the concrete behavior change the rules cause when the AI is working inside that directory.
3. **Copy the `.ai/instruct.md`** into your real module, then **delete or override** every rule that doesn't apply.
4. **Run `/ai-update-index`** so the new module shows up in [`.ai/index.md`](../.ai/index.md).

Once you're confident the team is using the system, you can archive this directory via `/ai-archive` — it ships with the template, but isn't load-bearing.

---

## What these examples are **not**

- Not wired into any build — `auth-api/` ships compilable TypeScript but its dependencies aren't installed and its repository is stubbed; the other examples are instructions-only.
- Not a recommended file layout for any specific framework — directory layouts here are illustrative.
- Not authoritative for the rest of this template. The canonical rules still live in [`.ai/conventions.md`](../.ai/conventions.md), [`.ai/maintenance.md`](../.ai/maintenance.md), and [`.ai/credentials.md`](../.ai/credentials.md).
