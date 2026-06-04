# Quick Start: Element Prefixes & Testing

**You've just set up a metadata-driven testing system.** This document is a 5-minute cheat sheet.

---

## The Idea in 30 Seconds

Instead of hunting for elements in your codebase to test, **you name them with prefixes** that the system recognizes:

```jsx
<button id="bu_submit">Submit</button>        {/* Button: bu_ */}
<input id="in_email" type="email" />         {/* Input: in_ */}
<input id="tg_darkmode" type="checkbox" />   {/* Toggle: tg_ */}
```

Then your validation tooling **automatically finds them**, generates a registry, and runs tests.

---

## Workflow

### 1. Name your elements with prefixes

```jsx
// Component file: forms/LoginForm.jsx
export function LoginForm() {
  return (
    <>
      <input id="in_username" type="text" />
      <input id="in_password" type="password" />
      <button id="bu_login" onClick={handleLogin}>Login</button>
      <label>
        <input id="cb_remember_me" type="checkbox" />
        Remember me
      </label>
    </>
  );
}
```

### 2. Run discovery

```bash
cd validation/
python discovery.py --scan-root ../src --output prefixes-found.json
```

**Output**: `prefixes-found.json` lists all discovered elements with file/line locations.

### 3. Run tests

```bash
python test_facility.py --registry prefixes-found.json --strategy existence
```

**Output**: Validation report showing:
- ✓ Elements found
- ⚠️ Duplicates detected
- ❌ Unrecognized prefixes

### 4. Integrate into CI/CD

Add to `.github/workflows/test.yml`:
```yaml
- run: python validation/discovery.py --scan-root ./src --output prefixes-found.json
- run: python validation/test_facility.py --registry prefixes-found.json --strategy existence
```

---

## Prefix Cheat Sheet

| Prefix | Type | Example |
|--------|------|---------|
| `bu_` | Button | `bu_submit`, `bu_cancel` |
| `tg_` | Toggle | `tg_darkmode` |
| `in_` | Input | `in_email`, `in_search` |
| `cb_` | Checkbox | `cb_subscribe` |
| `rd_` | Radio | `rd_gender_male` |
| `dd_` | Dropdown | `dd_country` |
| `md_` | Modal | `md_confirm` |
| `cr_` | Card | `cr_product` |
| `tb_` | Table | `tb_users` |
| `nd_` | Notification | `nd_error` |

**Full table**: See [`.ai/coding-prefixes.md`](.ai/coding-prefixes.md)

---

## Test Strategies (Roadmap)

| Strategy | Status | How to use |
|----------|--------|-----------|
| **Existence** | ✅ Ready now | `--strategy existence` — finds and verifies elements |
| **Accessibility** | 📋 Deferred | Use Playwright with axe-core or Cypress `checkA11y()` |
| **Functional** | 📋 Deferred | Use your E2E framework (Playwright, Cypress) or component tests |
| **Visual** | 📋 Deferred | Use Percy, Chromatic, or BackstopJS |

Start with **existence checks** now; add framework-specific tests later.

---

## Common Tasks

### Find all buttons in the codebase

```bash
# Using grep
grep -r "bu_" src/

# Using discovery (better)
python validation/discovery.py --scan-root ./src --output report.json
# Then filter report.json for "prefix": "bu"
```

### Add a custom prefix for your module

1. Create `[module]/.ai/coding-prefixes.md`
2. Add your prefix to the table:
   ```markdown
   | `xp_` | Experimental widget | `xp_ai_chatbox` |
   ```
3. Update `discovery.py` `MASTER_PREFIXES` dict (or module-specific scanner)

### Check if I'm using prefixes correctly

```bash
python validation/discovery.py --scan-root ./src --strict 2>&1 | head -20
```

If it complains: check [`.ai/coding-prefixes.md`](.ai/coding-prefixes.md) for valid prefixes.

### Generate a report by element type

```bash
python validation/discovery.py --scan-root ./src --output full-report.json

# Group by prefix (Python one-liner)
python -c "import json; r=json.load(open('full-report.json'));
from collections import Counter;
print(Counter(e['prefix'] for e in r['elements']))"
```

---

## Files You'll Work With

| File | Purpose |
|------|---------|
| `validation/discovery.py` | Scan codebase; generate registry |
| `validation/test_facility.py` | Read registry; run tests |
| `.ai/coding-prefixes.md` | Prefix table (don't edit lightly) |
| `[module]/.ai/coding-prefixes.md` | Module-specific prefixes (optional) |
| Your component files | Use prefixes when naming elements |

---

## Example: React Component

```jsx
// Form.jsx
export function SignupForm() {
  const [isSubscribed, setIsSubscribed] = useState(false);

  return (
    <form id="fd_signup" onSubmit={handleSubmit}>
      <input id="in_full_name" type="text" placeholder="Full name" />
      <input id="in_email" type="email" placeholder="Email" />
      <select id="dd_country">
        <option>Select country</option>
        {/* options */}
      </select>
      <label>
        <input id="cb_terms" type="checkbox" />
        I agree to terms
      </label>
      <label>
        <input
          id="tg_newsletter"
          type="checkbox"
          checked={isSubscribed}
          onChange={(e) => setIsSubscribed(e.target.checked)}
        />
        Subscribe to newsletter
      </label>
      <button id="bu_signup" type="submit">Create Account</button>
    </form>
  );
}
```

Run discovery:
```bash
python validation/discovery.py --scan-root . --output report.json
```

Report will show:
```json
{
  "elements": [
    { "id": "fd_signup", "prefix": "fd", "type": "Form/Fieldset", ... },
    { "id": "in_full_name", "prefix": "in", "type": "Input field", ... },
    { "id": "in_email", "prefix": "in", "type": "Input field", ... },
    { "id": "dd_country", "prefix": "dd", "type": "Dropdown/Select", ... },
    { "id": "cb_terms", "prefix": "cb", "type": "Checkbox", ... },
    { "id": "tg_newsletter", "prefix": "tg", "type": "Toggle", ... },
    { "id": "bu_signup", "prefix": "bu", "type": "Button", ... }
  ]
}
```

---

## Next Steps

1. **Name your first components** using prefixes
2. **Run discovery** to verify they're found
3. **Add to your CI/CD** pipeline for automated checks
4. **Extend prefixes** as your project grows

---

**Questions?** See [`.ai/coding-prefixes.md`](.ai/coding-prefixes.md) or [`validation/README.md`](validation/README.md).
