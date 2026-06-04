# Validation System — Element Prefix Discovery & Testing

**Location**: `validation/` directory
**Purpose**: Metadata-driven test discovery based on element naming conventions
**Last Updated**: 2026-06-02

---

## Overview

This validation system implements a **two-stage approach**:

1. **Discovery** (`discovery.py`): Scan codebase for 2-letter element prefixes and generate a registry
2. **Testing** (`test_facility.py`): Use the registry to apply test strategies (existence checks, accessibility, functional, visual)

The system is **framework-agnostic** — it works with any frontend framework (React, Vue, etc.) and any testing tool (Playwright, Cypress, Jest, etc.).

---

## The Central Controller: GUI Element ID Generator

**Problem**: Developers might mistype prefixes or use inconsistent naming.

**Solution**: `gui_element_id.py` — a central generator that enforces the rules programmatically.

### How it works

Instead of manually typing `id="bu_submit"` and risking mistakes, developers use the tool:

```bash
python validation/gui_element_id.py --type button --name "Submit Form"
# Output: bu_submit_form
```

**Benefits:**
- ✅ No typos — generated IDs are guaranteed to be correct
- ✅ Automatic normalization — handles various input formats (camelCase, kebab-case, spaces)
- ✅ Conflict detection — warns if ID already exists
- ✅ Central control — change the rule once, everywhere updates

**See**: [gui-element-id-guide.md](gui-element-id-guide.md) for full usage and integration examples.

---

## Quick Start

### 1. Discover all prefixed elements in your codebase

```bash
python validation/discovery.py --scan-root ./src --output prefixes-found.json
```

**Output**: `prefixes-found.json` — a registry of all discovered elements with their locations.

**Example output:**
```json
{
  "timestamp": "2026-06-02T14:30:00.000Z",
  "scan_root": "/path/to/project/src",
  "total_elements": 42,
  "elements": [
    {
      "id": "bu_submit",
      "prefix": "bu",
      "type": "Button",
      "file": "components/form.jsx",
      "line": 45,
      "column": 8,
      "context": "onClick={handleSubmit}"
    },
    ...
  ],
  "warnings": []
}
```

### 2. Run test validation

```bash
# Existence checks only (default)
python validation/test_facility.py --registry prefixes-found.json

# Run all strategies
python validation/test_facility.py --registry prefixes-found.json --all --output results.json
```

---

## Element Prefixes

See [`.ai/coding-prefixes.md`](../.ai/coding-prefixes.md) for the complete prefix table.

Quick reference (2-letter prefixes):
- `bu_` = Button
- `tg_` = Toggle
- `in_` = Input field
- `cb_` = Checkbox
- `md_` = Modal dialog
- `cr_` = Card
- ... and 20+ more

---

## Test Strategies

### 1. Existence Checks (✓ Fully Implemented)

Validates that discovered elements:
- ✓ Exist in the codebase
- ✓ Use recognized prefixes
- ⚠️ Detects duplicates

**Status**: Ready to use now.

```bash
python validation/test_facility.py --registry prefixes-found.json --strategy existence
```

### 2. Accessibility Checks (📋 Framework-specific)

Validates ARIA labels, roles, keyboard support. Requires semantic analysis.

**Recommended tools**:
- Playwright: `await expect(page).toHaveNoViolations()` (with axe-core)
- Cypress: `cy.checkA11y()`

**Status**: Stub provided; integrate framework-specific tool.

### 3. Functional Tests (📋 Framework-specific)

Validates click handlers, state changes, event callbacks.

**Recommended tools**:
- Playwright: `locator(id).click()`, `.fill()`
- Jest/Vitest: Mock handlers and verify calls
- Cypress: `cy.get(selector).click()`

**Status**: Stub provided; integrate your test framework.

### 4. Visual Regression (📋 Dedicated tool)

Validates visual consistency via screenshot regression.

**Recommended tools**:
- Percy, Chromatic, or BackstopJS
- Playwright: `page.screenshot()`

**Status**: Stub provided; integrate visual testing service.

---

## Integration Points

### GitHub Actions / CI Pipeline

**Example workflow** (`.github/workflows/test.yml`):

```yaml
name: Validation

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

      - name: Discover prefixed elements
        run: python validation/discovery.py --scan-root ./src --output prefixes-found.json

      - name: Run existence checks
        run: python validation/test_facility.py --registry prefixes-found.json --strategy existence --output existence-results.json

      - name: Report results
        run: cat existence-results.json
```

### Pre-commit Hook

Ensure all new elements follow the naming convention:

```bash
#!/bin/bash
# .git/hooks/pre-commit (or use git-hooks package)

python validation/discovery.py --scan-root . --strict 2>/dev/null
if [ $? -ne 0 ]; then
  echo "❌ Unrecognized element prefix detected. See .ai/coding-prefixes.md"
  exit 1
fi
```

### During Development

**Run discovery after adding new components:**

```bash
# After creating new form components
python validation/discovery.py --scan-root ./src/forms --output forms-registry.json

# Check what you've added
cat forms-registry.json
```

---

## Extending the System

### Add a Custom Prefix

1. Update [`.ai/coding-prefixes.md`](../.ai/coding-prefixes.md)
2. Update `MASTER_PREFIXES` dict in `discovery.py`
3. Re-run discovery
4. Add test strategy (optional)

**Example**: Add `cm_` (custom modal) prefix:

```python
# In discovery.py
MASTER_PREFIXES = {
    ...
    'cm': 'Custom modal',
}
```

### Add a Module-Specific Prefix

Create `[module]/.ai/coding-prefixes.md`:

```markdown
# Module-Specific Prefixes

| Prefix | Type | Example |
|--------|------|---------|
| `xp_` | Experimental | `xp_new_algorithm` |
```

### Implement a Custom Test Strategy

Create a new validator class in `test_facility.py`:

```python
class CustomValidator:
    def __init__(self, report):
        self.report = report

    def validate(self):
        # Your logic here
        return {...}
```

---

## File Reference

| File | Purpose |
|------|---------|
| `gui_element_id.py` | **Central controller**: generates & validates element IDs |
| `discovery.py` | Scans codebase for prefixed elements; generates registry |
| `test_facility.py` | Reads registry; applies test strategies |
| `gui-element-id-guide.md` | How to use the ID generator |
| `README.md` | This file |
| `.ai/coding-prefixes.md` | Master prefix table |

---

## Troubleshooting

### "Unrecognized prefix 'xx_' in element 'xx_something'"

**Cause**: Discovered an element with a prefix not in the master table.

**Fix**:
1. Check the spelling (`bu_` vs `bo_`)
2. If it's a new element type, add it to `.ai/coding-prefixes.md`
3. Update `MASTER_PREFIXES` in `discovery.py`

### Discovery runs but finds 0 elements

**Cause**: No files with `.jsx`, `.tsx`, `.js`, etc. extensions in scan path.

**Fix**:
- Verify file extensions in `SCANNABLE_EXTENSIONS` in `discovery.py`
- Verify your scan-root path: `python discovery.py --scan-root ./src`
- Check that your elements actually use the naming convention

### Test facility says "status: deferred"

**Cause**: You're running a strategy that requires a specific test framework.

**Fix**:
- For **accessibility**: Use `axe-core` in Playwright or Cypress
- For **functional**: Use your E2E or component test framework
- For **visual**: Use Percy, Chromatic, or similar service

---

## Best Practices

✅ **Do:**
- Run discovery on every commit or PR
- Use the registry to auto-generate test suites
- Keep prefixes consistent across the project
- Document custom prefixes in module `.ai/coding-prefixes.md`

❌ **Don't:**
- Manually create the registry — let discovery.py do it
- Ignore validation warnings in CI
- Create ad-hoc prefixes outside the registry
- Assume duplicates are OK — investigate them

---

## Next Steps

1. **Integrate into CI/CD**: Add discovery to your GitHub Actions or other CI system
2. **Framework-specific tests**: Wire test strategies to your E2E test runner
3. **Module prefixes**: Create `[module]/.ai/coding-prefixes.md` for specialized element types
4. **Visual testing**: Integrate a visual regression service for `cr_`, `md_`, `dl_` components
