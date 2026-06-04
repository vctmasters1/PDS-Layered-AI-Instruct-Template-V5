# API Endpoint System — Documentation

**Location**: `api/` directory
**Purpose**: Metadata-driven API endpoint discovery and validation
**Last Updated**: 2026-06-02

---

## Overview

The API endpoint system mirrors the UI element system but for backend APIs. It enables:

1. **Centralized naming** — `{resource}_{action}[_{detail}]` pattern
2. **Auto-discovery** — find all endpoints across your codebase
3. **Validation** — ensure consistency in endpoint definitions
4. **Documentation** — extract metadata automatically
5. **Searchability** — grep for all user endpoints, all list endpoints, etc.

---

## Quick Start

### 1. Generate an endpoint name

```bash
python api/endpoint_generator.py --resource user --action create
# Output: user_create (POST /api/v1/users)
```

### 2. Discover all endpoints in your code

```bash
python api/endpoint_discovery.py --scan-root ./src --output endpoints.json
```

### 3. Check results

```bash
cat endpoints.json
# Lists all discovered endpoints with resource, action, HTTP method, path
```

---

## Naming Convention

**Pattern**: `{resource}_{action}[_{detail}]`

| Pattern | HTTP | Path | Example |
|---------|------|------|---------|
| `user_list` | GET | `/api/v1/users` | List all users |
| `user_create` | POST | `/api/v1/users` | Create user |
| `user_detail` | GET | `/api/v1/users/{id}` | Get user by ID |
| `user_update` | PUT | `/api/v1/users/{id}` | Update user |
| `user_delete` | DELETE | `/api/v1/users/{id}` | Delete user |
| `user_search` | GET | `/api/v1/users/search` | Search users |
| `user_batch_import` | POST | `/api/v1/users/batch` | Bulk import |
| `invoice_export_pdf` | GET | `/api/v1/invoices/export.pdf` | Export as PDF |

### Key Features

✅ **Searchable**: `grep "user_"` finds all user endpoints
✅ **Consistent**: all endpoints follow the same pattern
✅ **Framework-agnostic**: works with Express, FastAPI, Django, etc.
✅ **Automatable**: tools can discover and validate all endpoints

---

## Tools

### 1. Endpoint Generator (`endpoint_generator.py`)

**Purpose**: Generate valid endpoint names (central controller)

```bash
# Generate endpoint name
python api/endpoint_generator.py --resource user --action create
# Output: user_create

# With detail/qualifier
python api/endpoint_generator.py --resource invoice --action export --detail pdf
# Output: invoice_export_pdf

# List all known actions
python api/endpoint_generator.py --list-actions

# Validate an endpoint
python api/endpoint_generator.py --validate user_create
# ✓ Valid endpoint: user_create
```

**Features**:
- Generates endpoint names with correct format
- Maps to HTTP methods automatically
- Suggests paths
- Validates existing endpoint names
- Detects conflicts in codebase

**Use cases**:
- Developers run this when designing new endpoints
- Pre-commit hooks validate all endpoints
- Build scripts check for consistency

### 2. Endpoint Discovery (`endpoint_discovery.py`)

**Purpose**: Scan codebase and catalog all endpoints

```bash
# Scan source code
python api/endpoint_discovery.py --scan-root ./src --output endpoints.json

# Auto-detect framework (Express, FastAPI, Django)
python api/endpoint_discovery.py --scan-root . --framework auto --output registry.json

# Specific framework
python api/endpoint_discovery.py --scan-root ./api --framework fastapi
```

**Features**:
- Supports Express, FastAPI, Django, and generic patterns
- Extracts: path, HTTP method, resource, action
- Records: file location, line number
- Framework-agnostic detection

**Output**: JSON registry with all endpoints

---

## Supported Frameworks

The discovery tool auto-detects and extracts patterns from:

| Framework | Patterns | Example |
|-----------|----------|---------|
| **Express** | `app.get()`, `router.post()` | `app.get('/users', getUserList)` |
| **FastAPI** | `@app.get()`, `@router.post()` | `@app.get("/users")` |
| **Django** | `path()`, `re_path()` | `path('users/', views.user_list)` |
| **Generic** | `@route`, `@endpoint`, endpoint names | `def user_create():` |

---

## Naming Best Practices

### Resources (Singular)

```
✅ user_list       (singular resource)
✅ product_create  (singular resource)
❌ users_list      (plural)
❌ products_create (plural)
```

### Actions (Standard)

Use standard actions from the registry:

```
list, create, detail, update, delete, search, export, import, batch, validate
```

### Detail/Qualifier (Optional)

Add detail for variants:

```
user_batch_create       (bulk create)
invoice_export_pdf      (export as PDF)
product_list_archived   (list archived products)
```

### Searchability

Naming enables powerful searches:

```bash
grep -r "user_"        # All user endpoints
grep -r "*_list"       # All list endpoints
grep -r "*_delete"     # All delete operations
grep -r "*_export"     # All export operations
```

---

## Integration

### Pre-commit Validation

```bash
#!/bin/bash
# .git/hooks/pre-commit

for endpoint in $(grep -r "[a-z_]*_[a-z_]*" src/api/ | grep -o '[a-z][a-z_]*_[a-z][a-z_]*'); do
  python api/endpoint_generator.py --validate "$endpoint" || exit 1
done
```

### CI/CD Pipeline

```yaml
# .github/workflows/validate-endpoints.yml
steps:
  - run: python api/endpoint_discovery.py --scan-root ./src --output endpoints.json
  - run: python api/endpoint_generator.py --validate $(jq -r '.endpoints[].name' endpoints.json)
```

### Documentation Generation

```bash
# Generate API documentation from discovered endpoints
python api/endpoint_discovery.py --scan-root ./src --output endpoints.json

# Use endpoints.json to generate OpenAPI spec, markdown docs, etc.
```

---

## File Structure

```
api/
├── endpoint_generator.py       ← Generate valid endpoint names
├── endpoint_discovery.py       ← Discover all endpoints in code
├── endpoint-generator-guide.md ← Usage guide
├── README.md                   ← This file
└── [.ai/api-conventions.md]    ← Convention reference
```

---

## Workflow Example

### 1. Design endpoints

Plan your API:
```
GET    /api/v1/users           → user_list
POST   /api/v1/users           → user_create
GET    /api/v1/users/{id}      → user_detail
PUT    /api/v1/users/{id}      → user_update
DELETE /api/v1/users/{id}      → user_delete
GET    /api/v1/users/search    → user_search
```

### 2. Generate names

```bash
for action in list create detail update delete search; do
  python api/endpoint_generator.py --resource user --action $action
done
```

### 3. Implement with generated names

```python
@router.get("/users")
async def user_list(): pass

@router.post("/users")
async def user_create(): pass

@router.get("/users/{user_id}")
async def user_detail(): pass

# etc...
```

### 4. Discover & validate

```bash
python api/endpoint_discovery.py --scan-root ./src --output endpoints.json
```

---

## Next Steps

1. **Review** [API Endpoint Naming Conventions](../.ai/api-conventions.md)
2. **Start using** the generator when designing endpoints
3. **Integrate discovery** into your CI/CD
4. **Generate documentation** from the endpoint registry

---

## Resources

- [API Endpoint Naming Conventions](../.ai/api-conventions.md) — Detailed convention reference
- [Endpoint Generator Guide](endpoint-generator-guide.md) — Full usage and examples
- [Endpoint Generator Tool](endpoint_generator.py) — The generator
- [Endpoint Discovery Tool](endpoint_discovery.py) — The scanner
