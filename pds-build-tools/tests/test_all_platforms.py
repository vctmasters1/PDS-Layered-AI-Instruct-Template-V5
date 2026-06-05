#!/usr/bin/env python3
"""
Test platform editor with different platform names
"""
import requests
from bs4 import BeautifulSoup
import json
import re

BASE_URL = "http://localhost:8000"

def test_platform(platform_name):
    print(f"\n{'='*80}")
    print(f"Testing Platform: {platform_name}")
    print(f"{'='*80}")
    
    # Fetch the HTML
    try:
        response = requests.get(f"{BASE_URL}/platform-editor.html", timeout=5)
        response.raise_for_status()
    except Exception as e:
        print(f"✗ ERROR fetching page: {e}")
        return False
    
    html_content = response.text
    
    # Look for the platform in the JavaScript specs
    platform_lower = platform_name.lower()
    
    # Search for the platform spec in JavaScript
    if f"'{platform_lower}'" in html_content or f'"{platform_lower}"' in html_content:
        print(f"✓ Platform key found in specs: '{platform_lower}'")
    else:
        # Try to find it by searching for the SKU or variant
        first_word = platform_lower.split('-')[0]
        if f"'{first_word}" in html_content or f'"{first_word}"' in html_content:
            print(f"✓ Platform prefix found: '{first_word}'")
        else:
            print(f"✗ Platform NOT found in specs")
            return False
    
    # Check for pin_capabilities data
    if 'pin_capabilities' in html_content:
        print(f"✓ pin_capabilities structure found")
        
        # Count occurrences
        header_left_count = html_content.count('"header_left"')
        header_right_count = html_content.count('"header_right"')
        print(f"  - header_left arrays: {header_left_count}")
        print(f"  - header_right arrays: {header_right_count}")
    else:
        print(f"✗ pin_capabilities NOT found")
        return False
    
    # Check for required JavaScript functions
    functions = ['populatePinCapabilities', 'createCapabilityRow', 'fillFormFromAI']
    all_found = True
    for func in functions:
        if f"function {func}" in html_content:
            print(f"✓ {func}() found")
        else:
            print(f"✗ {func}() NOT found")
            all_found = False
    
    # Check table structure
    soup = BeautifulSoup(html_content, 'html.parser')
    left_tbody = soup.find('tbody', {'id': 'headerLeftTableBody'})
    right_tbody = soup.find('tbody', {'id': 'headerRightTableBody'})
    
    if left_tbody and right_tbody:
        print(f"✓ Table tbody elements found (ready for population)")
    else:
        print(f"✗ Table tbody elements missing")
        all_found = False
    
    # Check CSS for hide class
    if '.pinout-display.hide' in html_content:
        print(f"✓ CSS .hide class for visibility control found")
    else:
        print(f"✗ CSS .hide class NOT found")
    
    return all_found

# Test all platforms
platforms_to_test = [
    "Nano-ATmega328-000005",
    "PortentaC33-ABX00074",
    "Arduino Nano",
    "ESP32",
]

print("\n" + "="*80)
print("PLATFORM EDITOR COMPREHENSIVE TEST")
print("="*80)

results = {}
for platform in platforms_to_test:
    results[platform] = test_platform(platform)

# Summary
print(f"\n{'='*80}")
print("TEST SUMMARY")
print(f"{'='*80}")
for platform, passed in results.items():
    status = "✓ PASS" if passed else "✗ FAIL"
    print(f"{status} - {platform}")

all_pass = all(results.values())
print(f"\n{'='*80}")
if all_pass:
    print("✓ ALL TESTS PASSED - Platform editor is ready!")
else:
    print("✗ Some tests failed - check output above")
print(f"{'='*80}\n")
