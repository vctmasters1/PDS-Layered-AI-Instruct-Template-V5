#!/usr/bin/env python3
"""
Simple test - just check if platforms are in the HTML file
"""

html_path = r"k:\PDS_AutomationSuite\PDS-HwSpecs\platform-editor.html"

with open(html_path, 'r', encoding='utf-8') as f:
    html_content = f.read()

platforms = {
    "Nano-ATmega328-000005": "nano-atmega328-000005",
    "PortentaC33-ABX00074": "portentac33-abx00074",
    "Arduino Nano": "arduino nano",
    "ESP32": "esp32",
}

print("\n" + "="*80)
print("PLATFORM EDITOR - STATIC TEST")
print("="*80)

all_good = True

for display_name, search_key in platforms.items():
    print(f"\nTesting: {display_name}")
    print(f"  Looking for key: '{search_key}'")
    
    if f"'{search_key}'" in html_content:
        print(f"  ✓ Found in specs")
        
        # Check if this entry has pin_capabilities
        # Find the section for this platform
        start_idx = html_content.find(f"'{search_key}':")
        if start_idx > 0:
            # Look ahead for pin_capabilities
            end_idx = html_content.find("},", start_idx) + 2
            platform_section = html_content[start_idx:end_idx]
            
            if "pin_capabilities" in platform_section:
                print(f"  ✓ Has pin_capabilities data")
                
                # Count pins
                header_left_count = platform_section.count('"position":')
                print(f"  ✓ Found {header_left_count} pin entries")
            else:
                print(f"  ⚠ No pin_capabilities data for this platform")
    else:
        print(f"  ✗ NOT FOUND in specs")
        all_good = False

# Check for critical functions
print("\n" + "-"*80)
print("Checking critical functions:")
functions = ["populatePinCapabilities", "createCapabilityRow", "fillFormFromAI"]
for func in functions:
    if f"function {func}" in html_content:
        print(f"  ✓ {func}()")
    else:
        print(f"  ✗ {func}() MISSING")
        all_good = False

# Check for table structure
print("\n" + "-"*80)
print("Checking HTML structure:")
if 'id="headerLeftTableBody"' in html_content:
    print(f"  ✓ headerLeftTableBody element")
else:
    print(f"  ✗ headerLeftTableBody MISSING")
    all_good = False

if 'id="headerRightTableBody"' in html_content:
    print(f"  ✓ headerRightTableBody element")
else:
    print(f"  ✗ headerRightTableBody MISSING")
    all_good = False

if ".pinout-display.hide" in html_content:
    print(f"  ✓ CSS .hide class defined")
else:
    print(f"  ✗ CSS .hide class MISSING")
    all_good = False

# Summary
print("\n" + "="*80)
if all_good:
    print("✓ ALL CHECKS PASSED")
    print("\nYou can now test in the browser:")
    print("  1. Go to: http://localhost:8000/platform-editor.html")
    print("  2. Enter platform name (e.g., 'PortentaC33-ABX00074')")
    print("  3. Click 'Ask AI'")
    print("  4. Click 'Request specs'")
    print("  5. Scroll down - you should see the Pin Capabilities Matrix!")
else:
    print("✗ SOME CHECKS FAILED")
print("="*80 + "\n")
