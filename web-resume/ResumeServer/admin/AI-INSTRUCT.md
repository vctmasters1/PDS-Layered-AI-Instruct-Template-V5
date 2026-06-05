# admin/ — AI-INSTRUCT

**Authority**: DEEP — Authoritative for all work inside `ResumeServer/admin/`
**Parent context**: [../AI-INSTRUCT.md](../AI-INSTRUCT.md)
**Last Updated**: 2026-05-12

---

## Purpose

One-time setup, user seeding, and operational scripts for the Resume-Suite server. These are run manually by the server operator — not invoked by the Express API.

---

## Directory Structure

```
admin/
├── AI-INSTRUCT.md
└── scripts/
    ├── setup.js           ← First-run: init DB tables + create admin user
    └── seed-user.js       ← Create a new user account from the command line
```

---

## What Belongs Here

- First-run setup scripts
- Manual user account management
- Database migration scripts (future)
- Backup/restore scripts (future)

## What Does NOT Belong Here

- API routes → `server/routes/`
- Business logic → `server/services/`
- React code → `client/`

---

## Scripts

### `setup.js`

Run once after cloning. Creates all database tables and seeds the initial admin account.

```
node admin/scripts/setup.js
```

Prompts for admin username, full name, and password if not provided as env vars. Calls `server/database/init-database.js` internally, then creates the admin user with role `admin`.

### `seed-user.js`

Creates a new user account without going through the web UI.

```
node admin/scripts/seed-user.js --username alice --fullname "Alice Smith" --role user
```

Prompts for password interactively. Outputs the API token the user can paste into their Chrome extension settings.

---

## Rules

- Scripts must validate required env vars before doing any work — fail fast with a clear message
- Scripts must never hardcode passwords or secrets
- Scripts must be idempotent where possible (running setup twice should not corrupt the DB)
- All DB access goes through `server/database/database.js` — even in admin scripts

---

## Development Notes

Active dev notes → `.dev.md/`
Stale/superseded docs → `.dev.md/.old.mds/`
See [../../AI-INSTRUCT/AI-MAINTENANCE.md](../../AI-INSTRUCT/AI-MAINTENANCE.md) for full archiving rules.
