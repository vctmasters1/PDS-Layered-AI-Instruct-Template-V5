# API Endpoint Generator — Usage Guide

**Tool**: `api/endpoint_generator.py`
**Purpose**: Central controller for consistent API endpoint naming and discovery
**Last Updated**: 2026-06-02

---

## Overview

The endpoint generator **enforces** naming conventions programmatically. Instead of ad-hoc endpoint names, developers use the tool:

```bash
python api/endpoint_generator.py --resource user --action create
# Output: user_create
#         HTTP: POST
#         Path: /api/v1/users
```

### Why?

✅ **Consistency** — all endpoints follow `{resource}_{action}[_{detail}]` pattern
✅ **Searchability** — grep for all user endpoints, all list endpoints, etc.
✅ **Auto-discovery** — discovery tool finds and catalogs all endpoints
✅ **Type safety** — central controller prevents naming mistakes
✅ **Documentation** — metadata extracted automatically

---

## Quick Start

### 1. Generate an endpoint name

```bash
cd api/

# Simple: resource + action
python endpoint_generator.py --resource user --action list
# Output: user_list (GET /api/v1/users)

python endpoint_generator.py --resource user --action create
# Output: user_create (POST /api/v1/users)

python endpoint_generator.py --resource user --action detail
# Output: user_detail (GET /api/v1/users/{id})
```

### 2. Generate with detail/qualifier

```bash
# Bulk import users
python endpoint_generator.py --resource user --action batch --detail import
# Output: user_batch_import (POST /api/v1/users/batch)

# Export users as CSV
python endpoint_generator.py --resource user --action export --detail csv
# Output: user_export_csv (GET /api/v1/users/export.csv)
```

### 3. Get HTTP methods and suggested path

```bash
python endpoint_generator.py --resource product --action update --verbose

# Output shows:
# Resource: product
# Action: update
# HTTP Methods: PUT, PATCH
# Suggested path: /api/v1/products/{id}
```

### 4. Validate an existing endpoint

```bash
python endpoint_generator.py --validate user_create
# ✓ Valid endpoint: user_create

python endpoint_generator.py --validate user_list_v1
# ❌ Invalid format
```

### 5. List all known actions

```bash
python endpoint_generator.py --list-actions

# Output:
# list             HTTP GET                Read collection
# create           HTTP POST               Create resource
# detail           HTTP GET                Read single resource
# update           HTTP PUT, PATCH         Update resource
# delete           HTTP DELETE             Remove resource
# search           HTTP GET, POST          Query/filter collection
# export           HTTP GET                Generate/download file
# import           HTTP POST               Bulk upload data
# batch            HTTP POST               Bulk create/modify
# ... and more
```

---

## Usage in Code

### Express.js Example

```javascript
// routes/user.js
const express = require('express');
const router = express.Router();

// Run: python endpoint_generator.py --resource user --action list
// Get: user_list
router.get('/', (req, res) => {
  // user_list endpoint
  res.json({users: []});
});

// Run: python endpoint_generator.py --resource user --action create
// Get: user_create
router.post('/', (req, res) => {
  // user_create endpoint
  res.status(201).json({id: 1});
});

// Run: python endpoint_generator.py --resource user --action detail
// Get: user_detail
router.get('/:id', (req, res) => {
  // user_detail endpoint
  res.json({id: req.params.id});
});
```

### FastAPI Example

```python
# api/users.py
from fastapi import APIRouter

router = APIRouter(prefix="/users", tags=["users"])

# Run: python endpoint_generator.py --resource user --action list
# Get: user_list
@router.get("/")
async def user_list():
    """List all users"""
    return {"users": []}

# Run: python endpoint_generator.py --resource user --action create
# Get: user_create
@router.post("/")
async def user_create(name: str, email: str):
    """Create a new user"""
    return {"id": 1, "name": name, "email": email}

# Run: python endpoint_generator.py --resource user --action detail
# Get: user_detail
@router.get("/{user_id}")
async def user_detail(user_id: int):
    """Get a user by ID"""
    return {"id": user_id}
```

### Django Example

```python
# urls.py
from django.urls import path
from . import views

urlpatterns = [
    # user_list: python endpoint_generator.py --resource user --action list
    path('users/', views.user_list, name='user_list'),

    # user_create: python endpoint_generator.py --resource user --action create
    path('users/create/', views.user_create, name='user_create'),

    # user_detail: python endpoint_generator.py --resource user --action detail
    path('users/<int:user_id>/', views.user_detail, name='user_detail'),
]
```

---

## Integration Examples

### Pre-commit Hook

Validate all endpoints before committing:

```bash
#!/bin/bash
# .git/hooks/pre-commit

for file in $(git diff --cached --name-only); do
  if [[ $file =~ \.(py|js|ts)$ ]]; then
    # Find all endpoint names
    ENDPOINTS=$(grep -o '[a-z][a-z0-9]*_[a-z][a-z0-9]*_[a-z0-9]*' "$file" | sort -u)

    for endpoint in $ENDPOINTS; do
      python api/endpoint_generator.py --validate "$endpoint" > /dev/null
      if [ $? -ne 0 ]; then
        echo "❌ Invalid endpoint in $file: $endpoint"
        exit 1
      fi
    done
  fi
done
```

### GitHub Actions

```yaml
name: Validate API Endpoints

on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'

      - name: Discover endpoints
        run: python api/endpoint_discovery.py --scan-root ./src --output endpoints.json

      - name: Report endpoints
        run: cat endpoints.json
```

### VS Code Snippet

```json
{
  "Generate Endpoint": {
    "prefix": "gen-ep",
    "body": [
      "// endpoint: ${1:resource}_${2:action}",
      "// python api/endpoint_generator.py --resource $1 --action $2"
    ]
  }
}
```

---

## Naming Patterns

### Standard REST Endpoints

```
{resource}_list         GET     /api/v1/{resource}s
{resource}_create       POST    /api/v1/{resource}s
{resource}_detail       GET     /api/v1/{resource}s/{id}
{resource}_update       PUT     /api/v1/{resource}s/{id}
{resource}_delete       DELETE  /api/v1/{resource}s/{id}
```

### Search & Filtering

```
{resource}_search       GET|POST    /api/v1/{resource}s/search
{resource}_list_{type}  GET        /api/v1/{resource}s?type={type}
```

### Bulk Operations

```
{resource}_batch_create POST  /api/v1/{resource}s/batch
{resource}_batch_update PATCH /api/v1/{resource}s/batch
{resource}_import_csv   POST  /api/v1/{resource}s/import
{resource}_export_csv   GET   /api/v1/{resource}s/export.csv
```

### Special Actions

```
{resource}_validate     POST|GET   /api/v1/{resource}s/validate
{resource}_subscribe    POST       /api/v1/{resource}s/subscribe
{resource}_webhook      POST       /webhooks/{resource}.created
```

---

## Searchability Examples

```bash
# All user endpoints
grep -r "user_" src/api/

# All list endpoints
grep -r "*_list" src/api/

# All create/batch operations
grep -r "*_create\|*_batch" src/api/

# All export operations
grep -r "*_export" src/api/

# All endpoints for a specific resource
grep -r "product_" src/api/
```

---

## Action Reference

| Action | HTTP | Semantics | Example | Notes |
|--------|------|-----------|---------|-------|
| `list` | GET | Read collection | `user_list` | Often paginated |
| `create` | POST | Create resource | `user_create` | Single item |
| `detail` | GET | Get single resource | `user_detail` | By ID |
| `update` | PUT/PATCH | Modify resource | `user_update` | Existing item |
| `delete` | DELETE | Remove resource | `user_delete` | Soft or hard delete |
| `search` | GET/POST | Complex query | `product_search` | With filters |
| `export` | GET | Generate file | `invoice_export_pdf` | CSV, PDF, etc. |
| `import` | POST | Bulk upload | `user_import_csv` | File upload |
| `batch` | POST | Bulk ops | `order_batch_create` | Multiple items |
| `validate` | POST/GET | Check validity | `email_validate` | Pre-submission |
| `subscribe` | POST | Join collection | `user_subscribe_list` | Add to group |
| `unsubscribe` | DELETE | Leave collection | `user_unsubscribe_list` | Remove from group |

---

## Workflow Example

### Step 1: Plan your endpoints

```
User API:
- List users
- Create user
- Get user by ID
- Update user
- Delete user
- Search users
```

### Step 2: Generate names for each

```bash
python api/endpoint_generator.py --resource user --action list
# user_list

python api/endpoint_generator.py --resource user --action create
# user_create

python api/endpoint_generator.py --resource user --action detail
# user_detail

python api/endpoint_generator.py --resource user --action update
# user_update

python api/endpoint_generator.py --resource user --action delete
# user_delete

python api/endpoint_generator.py --resource user --action search
# user_search
```

### Step 3: Implement with generated names

```python
@router.get("/users")
async def user_list(): ...

@router.post("/users")
async def user_create(): ...

@router.get("/users/{user_id}")
async def user_detail(): ...

@router.put("/users/{user_id}")
async def user_update(): ...

@router.delete("/users/{user_id}")
async def user_delete(): ...

@router.get("/users/search")
async def user_search(): ...
```

### Step 4: Discover & validate

```bash
python api/endpoint_discovery.py --scan-root ./src --output endpoints.json
# Finds all endpoints in your code

cat endpoints.json
# Shows all endpoints organized by resource/action
```

---

## Troubleshooting

### "Unknown action: 'custom'"

Use a standard action or add custom action to `.ai/api-conventions.md`:

```bash
python api/endpoint_generator.py --list-actions  # See all valid actions
```

### "Validation failed" on custom endpoints

Make sure endpoint follows pattern: `{resource}_{action}[_{detail}]`

```bash
✓ Valid:     user_create, product_list, invoice_export_pdf
❌ Invalid:  createUser, product_list_v1, users_delete
```

### Discovery finds 0 endpoints

Check file types are scanned (`.py`, `.js`, `.ts`, etc.):

```bash
python api/endpoint_discovery.py --scan-root ./src --verbose
```

---

## Best Practices

✅ **Do:**
- Use singular resource names: `user_list`, not `users_list`
- Keep action names simple: `create`, `update`, `delete`
- Use detail for variants: `user_export_pdf`, `order_batch_create`
- Follow the `{resource}_{action}[_{detail}]` pattern consistently

❌ **Don't:**
- Mix conventions: `users_list` + `product_create`
- Duplicate info: `user_get_detail` (just use `user_detail`)
- Use version in endpoint name: `user_list_v1` (put version in path)
- Abbreviate: `usr_lst` (be clear)

---

## API Conventions Reference

→ [API Endpoint Naming Conventions](../.ai/api-conventions.md) — Full reference
→ [Endpoint Discovery Tool](endpoint_discovery.py) — Finding all endpoints
→ [Endpoint Generator](`api/endpoint_generator.py) — This tool
