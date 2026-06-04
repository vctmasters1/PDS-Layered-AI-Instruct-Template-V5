# GUI Element ID Generator — Usage Guide

**Tool**: `validation/gui_element_id.py`
**Purpose**: Central controller ensuring all element IDs follow the prefix convention
**Last Updated**: 2026-06-02

---

## Overview

The ID generator **enforces** naming rules programmatically. Instead of developers remembering prefixes, they use the tool to generate IDs:

```bash
python validation/gui_element_id.py --type button --name "Submit Form"
# Output: bu_submit_form
```

### Why?

✅ **No mistakes** — can't mistype a prefix
✅ **Automatic conflict detection** — finds duplicate IDs
✅ **Consistent formatting** — normalizes various input formats
✅ **Central enforcement** — change the rule once, everywhere updates

---

## Quick Start

### 1. Generate an ID

```bash
cd validation/

# Simple: type + name
python gui_element_id.py --type button --name "Submit"
# Output: bu_submit

# Complex: various input formats (all produce the same result)
python gui_element_id.py --type button --name "Submit Form"
python gui_element_id.py --type button --name "SubmitForm"
python gui_element_id.py --type button --name "submit-form"
python gui_element_id.py --type button --name "SUBMIT_FORM"
# All output: bu_submit_form
```

### 2. Check for conflicts

```bash
# Check if this ID already exists in your codebase
python gui_element_id.py --type input --name "Email" --check-exists ../src

# Output includes:
# - Generated ID: in_email
# - Conflicts found (if any)
# - File locations
```

### 3. Validate an existing ID

```bash
python gui_element_id.py --validate bu_submit
# Output: ✓ Valid ID: bu_submit (Button)

python gui_element_id.py --validate invalid_id
# Output: ❌ Invalid format
```

### 4. List all known prefixes

```bash
python gui_element_id.py --list-prefixes

# Output:
# ac_ → Accordion         (aliases: accordion)
# bd_ → Badge              (aliases: badge)
# br_ → Breadcrumb         (aliases: breadcrumb)
# ... etc
```

---

## Usage in Code

### As a Python Library

```python
from validation.gui_element_id import IDGenerator

gen = IDGenerator()

# Generate an ID
button_id = gen.generate('button', 'Save Changes')
print(button_id)  # Output: bu_save_changes

# Validate an ID
is_valid, msg = gen.validate('bu_submit')
print(msg)  # ✓ Valid ID: bu_submit (Button)

# Check for conflicts
from pathlib import Path
conflicts = gen.find_conflicts('bu_submit', Path('./src'))
if conflicts:
    print(f"Found {len(conflicts)} existing use(s)")
```

### In Your React/Vue Component

```jsx
// Old way (error-prone):
<button id="btn_submit">Submit</button>  // Wrong prefix!

// New way (with generator):
// Run: python gui_element_id.py --type button --name "Submit"
// Get: bu_submit
<button id="bu_submit" onClick={handleSubmit}>Submit</button>  // ✓ Correct!
```

---

## Integration Examples

### Pre-commit Hook

Validate all generated IDs before committing:

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Check staged files for element IDs
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACMR)

for file in $STAGED_FILES; do
  if [[ $file =~ \.(jsx|tsx|js|ts|vue|html)$ ]]; then
    # Find all IDs in the file
    IDS=$(grep -o '[a-z]{2}_[a-zA-Z0-9_]*' "$file" | sort -u)

    for id in $IDS; do
      # Validate each ID
      python validation/gui_element_id.py --validate "$id" > /dev/null
      if [ $? -ne 0 ]; then
        echo "❌ Invalid ID in $file: $id"
        exit 1
      fi
    done
  fi
done
```

### VS Code Snippets

Create `.vscode/gui-elements.code-snippets`:

```json
{
  "Generate Button ID": {
    "prefix": "gen-bu",
    "body": [
      "<!-- Run: python validation/gui_element_id.py --type button --name \"${1:action}\" -->",
      "<button id=\"bu_${2:generated_id}\">$1</button>"
    ],
    "description": "Generate a button ID using the CLI"
  },
  "Generate Input ID": {
    "prefix": "gen-in",
    "body": [
      "<!-- Run: python validation/gui_element_id.py --type input --name \"${1:field}\" -->",
      "<input id=\"in_${2:generated_id}\" type=\"text\" />"
    ],
    "description": "Generate an input ID using the CLI"
  }
}
```

### GitHub Actions

Add to `.github/workflows/validate.yml`:

```yaml
name: Validate Element IDs

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

      - name: Find all element IDs
        run: |
          grep -r "[a-z]{2}_[a-zA-Z0-9_]*" src/ --include="*.jsx" --include="*.tsx" --include="*.js" --include="*.vue" --include="*.html" | \
          awk -F: '{print $NF}' | \
          grep -o '[a-z]{2}_[a-zA-Z0-9_]*' | \
          sort -u > found_ids.txt

      - name: Validate each ID
        run: |
          while read id; do
            python validation/gui_element_id.py --validate "$id" || exit 1
          done < found_ids.txt
```

### Build-Time Script

Generate a report of all elements (for testing):

```python
#!/usr/bin/env python3
# scripts/generate-element-registry.py

from pathlib import Path
from validation.gui_element_id import IDGenerator
import re
import json

gen = IDGenerator()
elements = {}

# Scan all component files
for file_path in Path('src').rglob('*.jsx'):
    with open(file_path, 'r') as f:
        content = f.read()
        # Find all element IDs
        ids = re.findall(r'id="([a-z]{2}_[a-zA-Z0-9_]*)"', content)
        for elem_id in ids:
            is_valid, _ = gen.validate(elem_id)
            if elem_id not in elements:
                elements[elem_id] = {
                    'valid': is_valid,
                    'files': [],
                }
            elements[elem_id]['files'].append(str(file_path))

# Write registry
with open('build/element-registry.json', 'w') as f:
    json.dump(elements, f, indent=2)

# Report
invalid = [e for e, v in elements.items() if not v['valid']]
if invalid:
    print(f"❌ {len(invalid)} invalid IDs found:")
    for elem_id in invalid:
        print(f"   {elem_id}")
    exit(1)
else:
    print(f"✓ All {len(elements)} element IDs are valid")
```

---

## Element Types & Prefixes

The tool recognizes these element types (aliases):

| Type | Aliases | Prefix | Example |
|------|---------|--------|---------|
| button | btn | `bu_` | `bu_submit` |
| input | text, email, password, number, textbox | `in_` | `in_email_address` |
| toggle | — | `tg_` | `tg_dark_mode` |
| checkbox | — | `cb_` | `cb_accept_terms` |
| radio | — | `rd_` | `rd_gender_male` |
| dropdown | select, option | `dd_` | `dd_country` |
| modal | — | `md_` | `md_confirm_delete` |
| form | fieldset | `fd_` | `fd_login` |
| card | — | `cr_` | `cr_product_card` |
| table | grid | `tb_` | `tb_users` |

See full list: `python gui_element_id.py --list-prefixes`

---

## Naming Best Practices

The tool normalizes various input formats to snake_case:

| Input | Output | Notes |
|-------|--------|-------|
| `submit` | `bu_submit` | Simple |
| `Submit Form` | `bu_submit_form` | Spaces → underscores |
| `submitForm` | `bu_submit_form` | camelCase → snake_case |
| `submit-form` | `bu_submit_form` | Hyphens → underscores |
| `SUBMIT_FORM` | `bu_submit_form` | Uppercase → lowercase |
| `Submit!@# Form` | `bu_submit_form` | Special chars removed |

**Rules:**
- ✅ Descriptive: `bu_delete_account` (good)
- ❌ Too generic: `bu_btn` (bad)
- ✅ Clear: `in_email_address` (good)
- ❌ Ambiguous: `in_ph` (bad)

---

## Workflow Example

### Step 1: Design your form

```jsx
// components/SignupForm.jsx
export function SignupForm() {
  return (
    <form>
      <input type="text" placeholder="Full name" />
      <input type="email" placeholder="Email" />
      <input type="password" placeholder="Password" />
      <button type="submit">Create Account</button>
      <label>
        <input type="checkbox" />
        I agree to terms
      </label>
    </form>
  );
}
```

### Step 2: Generate IDs for each element

```bash
cd validation/

# Generate all the IDs you need
python gui_element_id.py --type input --name "Full Name"
# Output: in_full_name

python gui_element_id.py --type input --name "Email Address"
# Output: in_email_address

python gui_element_id.py --type input --name "Password"
# Output: in_password

python gui_element_id.py --type button --name "Create Account"
# Output: bu_create_account

python gui_element_id.py --type checkbox --name "Accept Terms"
# Output: cb_accept_terms
```

### Step 3: Update your component with generated IDs

```jsx
// components/SignupForm.jsx
export function SignupForm() {
  return (
    <form id="fd_signup">
      <input id="in_full_name" type="text" placeholder="Full name" />
      <input id="in_email_address" type="email" placeholder="Email" />
      <input id="in_password" type="password" placeholder="Password" />
      <button id="bu_create_account" type="submit">Create Account</button>
      <label>
        <input id="cb_accept_terms" type="checkbox" />
        I agree to terms
      </label>
    </form>
  );
}
```

### Step 4: Your test can now discover and validate everything

```bash
# Run discovery (finds all IDs)
python discovery.py --scan-root ../src --output registry.json

# Run tests (validates them)
python test_facility.py --registry registry.json --strategy existence
```

---

## Troubleshooting

### "Unrecognized element type: 'custom'"

**Fix**: Use one of the known types or add it to `TYPE_TO_PREFIX` in `gui_element_id.py`:

```python
TYPE_TO_PREFIX = {
    ...
    'custom_widget': 'xp',  # Add your custom type
}
```

### "No existing uses found" but I know the ID is used

**Fix**: The tool only scans common file extensions. Check `_is_scannable()` in `gui_element_id.py` and add your file type.

### ID generation produces unexpected results

**Fix**: Use `--verbose` to see each normalization step:

```bash
python gui_element_id.py --type button --name "Submit-Form!" --verbose

# Output shows:
# ✓ Element type: button
# ✓ Prefix: bu_
# ✓ Name: submit_form (special char removed)
# ✓ Generated: bu_submit_form
```

---

## Summary

**The tool gives you:**

✅ Centralized ID generation (one source of truth)
✅ Automatic format normalization (any input → correct output)
✅ Conflict detection (can't accidentally reuse IDs)
✅ CLI + library interface (use how you want)
✅ Extensibility (add new types/prefixes easily)

**Workflow**: Generate → Validate → Test → Ship

See [`.ai/coding-prefixes.md`](../.ai/coding-prefixes.md) for the complete prefix reference.
