# PDS-BuildTools Tests

This directory contains test scripts for the build system and platform validation.

---

## Test Scripts

### `test_platform_editor.py`
Tests the Pinleaf Forge board JSON schemas.

**Purpose**: Verify that board spec JSON files in `PDS-BoardEditor/boards/` are valid — correct schema, pin capabilities, required fields.

**Usage**:
```bash
python test_platform_editor.py
```

**What it tests**:
- HTML file integrity
- Platform specification data structure
- Pin capability definitions
- Export functionality

---

### `test_all_platforms.py`
Test suite for multiple platform definitions.

**Purpose**: Validate that all supported platforms are correctly defined in the editor.

**Usage**:
```bash
python test_all_platforms.py <platform_name>
python test_all_platforms.py esp32c3
python test_all_platforms.py efr32mg24
```

**What it tests**:
- Platform specs for completeness
- CPU and memory definitions
- GPIO and ADC counts
- Interface support (I2C, SPI, UART)
- Pin capability mappings

---

### `test_platforms_simple.py`
Quick sanity check for platform data.

**Purpose**: Simple static validation that platform data is present in the editor.

**Usage**:
```bash
python test_platforms_simple.py
```

**What it tests**:
- Platform keys exist in HTML
- Pin capabilities data structure
- Critical JavaScript functions present

---

## Running Tests

From root directory:
```bash
cd PDS-BuildTools
python tests/test_platform_editor.py
python tests/test_all_platforms.py esp32c3
python tests/test_platforms_simple.py
```

Or from tests directory:
```bash
cd PDS-BuildTools/tests
python test_platform_editor.py
```

---

## Test Results

Tests output:
- ✓ for passed checks
- ✗ for failed checks
- Summary at end

Example:
```
Testing Platform: esp32c3
✓ Platform key found in specs: 'esp32c3'
✓ pin_capabilities structure found
✓ populatePinCapabilities() found
✓ Table tbody elements found
==========================================
OVERALL: PASS (4/4 checks passed)
```

---

## Adding New Tests

When adding new functionality to the build system:

1. **Create test file** in this directory: `test_<feature>.py`
2. **Document purpose** at top of file
3. **Add usage instructions** to this README
4. **Run test** to verify before committing

Example test structure:
```python
#!/usr/bin/env python3
"""
Test: <Feature Name>
Purpose: <What this verifies>
Usage: python test_<feature>.py
"""

import sys
import os

def test_<feature>():
    """Test <feature>."""
    print("Testing <feature>...")
    
    # Assertions here
    assert condition, "Error message"
    
    print("✓ Test passed")

if __name__ == "__main__":
    test_<feature>()
```

---

Last updated: February 5, 2026
