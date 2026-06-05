#!/usr/bin/env python3
"""
Test script to verify platform editor pin capabilities table population
"""
import requests
from bs4 import BeautifulSoup
import json
import time

# Give the server a moment to start
time.sleep(1)

BASE_URL = "http://localhost:8000"

print("=" * 80)
print("PLATFORM EDITOR PIN CAPABILITIES TEST")
print("=" * 80)

# Fetch the HTML
print("\n[1] Fetching platform-editor.html...")
try:
    response = requests.get(f"{BASE_URL}/platform-editor.html")
    response.raise_for_status()
    print(f"✓ Status: {response.status_code}")
except Exception as e:
    print(f"✗ ERROR: {e}")
    exit(1)

# Parse HTML
html_content = response.text
soup = BeautifulSoup(html_content, 'html.parser')

# Check for table tbody elements
print("\n[2] Checking for table tbody elements...")
left_tbody = soup.find('tbody', {'id': 'headerLeftTableBody'})
right_tbody = soup.find('tbody', {'id': 'headerRightTableBody'})

if left_tbody:
    print(f"✓ Found headerLeftTableBody")
    print(f"  Content: {left_tbody.prettify()[:200]}")
else:
    print("✗ headerLeftTableBody NOT FOUND")

if right_tbody:
    print(f"✓ Found headerRightTableBody")
    print(f"  Content: {right_tbody.prettify()[:200]}")
else:
    print("✗ headerRightTableBody NOT FOUND")

# Check pinoutDisplay element
print("\n[3] Checking pinoutDisplay element...")
pinout_display = soup.find('div', {'id': 'pinoutDisplay'})
if pinout_display:
    print(f"✓ Found pinoutDisplay")
    classes = pinout_display.get('class', [])
    print(f"  Classes: {classes}")
    if 'hide' in classes:
        print("  ✓ Has 'hide' class (correct for initial state)")
    else:
        print("  ✗ Missing 'hide' class (should be hidden initially)")
else:
    print("✗ pinoutDisplay NOT FOUND")

# Check for CSS .hide definition
print("\n[4] Checking CSS for .pinout-display.hide...")
if '.pinout-display.hide' in html_content:
    print("✓ Found CSS .pinout-display.hide definition")
else:
    print("✗ CSS .pinout-display.hide NOT FOUND")

# Extract and check JavaScript functions
print("\n[5] Checking JavaScript functions...")
if 'function populatePinCapabilities' in html_content:
    print("✓ populatePinCapabilities() function found")
else:
    print("✗ populatePinCapabilities() NOT FOUND")

if 'function createCapabilityRow' in html_content:
    print("✓ createCapabilityRow() function found")
else:
    print("✗ createCapabilityRow() NOT FOUND")

if 'function fillFormFromAI' in html_content:
    print("✓ fillFormFromAI() function found")
else:
    print("✗ fillFormFromAI() NOT FOUND")

# Check for Arduino Nano pin capabilities data
print("\n[6] Checking for Arduino Nano pin_capabilities data...")
if "'Nano-ATmega328-000005'" in html_content or '"Nano-ATmega328-000005"' in html_content or 'nano-atmega328' in html_content.lower():
    print("✓ Found platform reference for Nano")
else:
    print("⚠ Platform name not exactly 'Nano-ATmega328-000005', but may use different key")

# Search for pin_capabilities in JavaScript
if 'pin_capabilities' in html_content:
    print("✓ pin_capabilities found in JavaScript")
    # Extract the Arduino Nano section
    if 'header_left' in html_content and 'header_right' in html_content:
        print("  ✓ header_left and header_right arrays found")
        # Count pins
        left_count = html_content.count('"position":')
        print(f"  ✓ Found {left_count} pin position entries")
    else:
        print("  ✗ header_left or header_right NOT FOUND")
else:
    print("✗ pin_capabilities NOT FOUND in JavaScript")

print("\n" + "=" * 80)
print("TEST SUMMARY")
print("=" * 80)

# Final checks
all_good = (
    left_tbody is not None and 
    right_tbody is not None and 
    pinout_display is not None and
    'hide' in (pinout_display.get('class', []) if pinout_display else []) and
    'function populatePinCapabilities' in html_content and
    'pin_capabilities' in html_content
)

if all_good:
    print("\n✓ All structural checks PASSED")
    print("\nThe issue is likely in the JavaScript execution flow.")
    print("Check browser console for runtime errors.")
else:
    print("\n✗ Some structural issues found - see above")

print("\n" + "=" * 80)
