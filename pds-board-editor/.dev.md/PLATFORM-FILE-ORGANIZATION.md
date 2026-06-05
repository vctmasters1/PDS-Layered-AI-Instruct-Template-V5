# Platform File Organization

**Version**: 2.2  
**Last Updated**: February 4, 2026

---

## ?? Directory Structure

### **Recommended Organization**

```
./platforms/
??? esp32c3/
?   ??? esp32c3.json                      # Platform specification
?   ??? esp32c3_J1_pinout.svg            # Main header pinout diagram
?   ??? esp32c3_datasheet.pdf            # (optional) Reference datasheet
?
??? stm32f407/
?   ??? stm32f407.json
?   ??? stm32f407_J1_pinout.svg
?   ??? stm32f407_J2_pinout.svg          # Secondary header (if applicable)
?   ??? stm32f407_schematic.pdf
?
??? renesas-ra6m5/
?   ??? renesas-ra6m5.json
?   ??? renesas-ra6m5_J1_pinout.svg
?   ??? renesas-ra6m5_J2_pinout.svg
?   ??? renesas-ra6m5_J3_pinout.svg
?   ??? renesas-ra6m5_reference.pdf
?
??? arduino-nano/
    ??? arduino-nano.json
    ??? arduino-nano_Main_pinout.svg
    ??? arduino-nano_icsp_pinout.svg
```

---

## ?? File Naming Conventions

### **Platform JSON**
```
{platform-id}.json
```
**Examples:**
- `esp32c3.json`
- `stm32f407.json`
- `renesas-ra6m5.json`

**Rules:**
- Must match the `id` field in JSON
- Lowercase only
- Use hyphens for multi-word names
- No spaces or special characters

### **Pinout SVG Files**
```
{platform-id}_{header-id}_pinout_{optional-timestamp}.svg
```
**Examples:**
- `esp32c3_J1_pinout.svg`
- `stm32f407_J2_pinout.svg`
- `renesas-ra6m5_Main_pinout_2026-02-04.svg`

**Rules:**
- Start with platform ID
- Include header ID (J1, J2, Main, etc.)
- Suffix with `_pinout`
- Optional timestamp for versioning

### **Supplementary Files**
```
{platform-id}_{description}.{ext}
```
**Examples:**
- `esp32c3_datasheet.pdf`
- `stm32f407_schematic.pdf`
- `renesas-ra6m5_reference.pdf`

---

## ?? Download Workflow

### **From Platform Editor**

**Step 1: Generate JSON**
1. Complete platform specification
2. Click "?? Download JSON File"
3. Browser downloads: `platforms_{platform-id}_{platform-id}.json`

**Step 2: Organize**
```bash
# Create platform directory
mkdir platforms/{platform-name}

# Move JSON file
mv Downloads/platforms_esp32c3_esp32c3.json platforms/esp32c3/esp32c3.json
```

### **From Pinout Leaf Generator**

**Step 1: Generate Pinout Diagrams**
1. Click "?? Generate Pinout Leaf" from Platform Editor
2. Adjust layout settings
3. Click "?? Download All SVGs (Grouped by Header)"
4. Browser downloads multiple SVG files

**Step 2: Organize**
```bash
# Files downloaded:
# - platforms_esp32c3_esp32c3_J1_pinout_2026-02-04.svg

# Move to platform directory
mv Downloads/platforms_esp32c3_*.svg platforms/esp32c3/

# Optional: Rename to remove timestamp
mv platforms/esp32c3/platforms_esp32c3_esp32c3_J1_pinout_2026-02-04.svg \
   platforms/esp32c3/esp32c3_J1_pinout.svg
```

---

## ?? Filename Prefixes

### **Why `platforms_` prefix?**

**Problem**: Browser downloads go to a common folder  
**Solution**: Prefix helps identify and filter files

**Benefits:**
- Easy to find in Downloads folder
- Sort by name to group platform files
- Filter by prefix: `platforms_*`
- Prevents filename collisions

### **Removing the Prefix**

**Manual Method:**
```bash
# Original download
platforms_esp32c3_esp32c3.json

# Rename when moving
mv Downloads/platforms_esp32c3_esp32c3.json \
   platforms/esp32c3/esp32c3.json
```

**Batch Script (Windows)**
```cmd
@echo off
REM Create platform directory
set PLATFORM=esp32c3
mkdir platforms\%PLATFORM%

REM Move and rename JSON
move Downloads\platforms_%PLATFORM%_%PLATFORM%.json platforms\%PLATFORM%\%PLATFORM%.json

REM Move SVG files
move Downloads\platforms_%PLATFORM%_*.svg platforms\%PLATFORM%\
```

**Bash Script (Linux/Mac)**
```bash
#!/bin/bash
PLATFORM="esp32c3"

# Create directory
mkdir -p platforms/$PLATFORM

# Move and rename files
mv ~/Downloads/platforms_${PLATFORM}_${PLATFORM}.json \
   platforms/$PLATFORM/$PLATFORM.json

mv ~/Downloads/platforms_${PLATFORM}_*.svg \
   platforms/$PLATFORM/
```

---

## ?? Example: Complete Workflow

### **Platform: ESP32-C3**

**1. Define Platform**
```
Platform Editor ? Complete form ? Download JSON
Downloads: platforms_esp32c3_esp32c3.json
```

**2. Generate Pinout**
```
Pinout Leaf Generator ? Download All SVGs
Downloads: platforms_esp32c3_esp32c3_J1_pinout_2026-02-04.svg
```

**3. Organize Files**
```bash
# Create directory
mkdir platforms/esp32c3

# Move JSON
mv Downloads/platforms_esp32c3_esp32c3.json \
   platforms/esp32c3/esp32c3.json

# Move SVG
mv Downloads/platforms_esp32c3_esp32c3_J1_pinout_2026-02-04.svg \
   platforms/esp32c3/esp32c3_J1_pinout.svg
```

**4. Final Structure**
```
platforms/esp32c3/
??? esp32c3.json
??? esp32c3_J1_pinout.svg
```

---

## ?? Multi-Header Platforms

### **Example: Raspberry Pi**

**Headers:**
- J1: 40-pin GPIO header
- J2: Camera connector (CSI)
- J3: Display connector (DSI)
- J4: Power input

**Download:**
```
platforms_raspberry-pi-4_raspberry-pi-4_J1_pinout.svg
platforms_raspberry-pi-4_raspberry-pi-4_J2_pinout.svg
platforms_raspberry-pi-4_raspberry-pi-4_J3_pinout.svg
platforms_raspberry-pi-4_raspberry-pi-4_J4_pinout.svg
```

**Organized:**
```
platforms/raspberry-pi-4/
??? raspberry-pi-4.json
??? raspberry-pi-4_J1_pinout.svg     # GPIO header
??? raspberry-pi-4_J2_pinout.svg     # Camera
??? raspberry-pi-4_J3_pinout.svg     # Display
??? raspberry-pi-4_J4_pinout.svg     # Power
```

---

## ?? Automation Scripts

### **Organize Downloads (Python)**

```python
import os
import shutil
from pathlib import Path

DOWNLOADS = Path.home() / "Downloads"
PLATFORMS = Path("platforms")

def organize_platform_files():
    # Find all platform files
    json_files = list(DOWNLOADS.glob("platforms_*_*.json"))
    svg_files = list(DOWNLOADS.glob("platforms_*_*.svg"))
    
    for json_file in json_files:
        # Extract platform ID
        parts = json_file.stem.split('_')
        if len(parts) >= 3 and parts[0] == 'platforms':
            platform_id = parts[1]
            
            # Create platform directory
            platform_dir = PLATFORMS / platform_id
            platform_dir.mkdir(parents=True, exist_ok=True)
            
            # Move JSON
            dest = platform_dir / f"{platform_id}.json"
            shutil.move(str(json_file), str(dest))
            print(f"Moved: {json_file.name} ? {dest}")
            
            # Move matching SVG files
            for svg_file in svg_files:
                if svg_file.stem.startswith(f"platforms_{platform_id}_"):
                    # Remove timestamp if present
                    svg_dest_name = svg_file.name.replace(f"platforms_{platform_id}_", "")
                    svg_dest_name = svg_dest_name.replace("_2026-02-04", "")  # Remove date
                    
                    svg_dest = platform_dir / svg_dest_name
                    shutil.move(str(svg_file), str(svg_dest))
                    print(f"Moved: {svg_file.name} ? {svg_dest}")

if __name__ == "__main__":
    organize_platform_files()
    print("? Platform files organized!")
```

**Usage:**
```bash
python organize_platforms.py
```

---

## ?? Integration with Other Tools

### **LadderLogicEditor**
```
Reads: platforms/{platform-id}/{platform-id}.json
Uses: Pin names, var_alias for symbol generation
```

### **Device Firmware**
```
Reads: hwrev/{hwrev-id}/hwrev-config.json
References: platforms/{platform-id}/{platform-id}.json
Uses: Pin mappings, capabilities
```

### **Documentation**
```
References: platforms/{platform-id}/{platform-id}_J1_pinout.svg
Embeds: SVG diagrams in Markdown/HTML docs
```

---

## ? Checklist: Adding New Platform

- [ ] Define platform in Platform Editor
- [ ] Download JSON file
- [ ] Create `platforms/{platform-id}/` directory
- [ ] Move JSON to platform directory, rename if needed
- [ ] Generate pinout diagrams (if applicable)
- [ ] Download SVG files
- [ ] Move SVG files to platform directory
- [ ] Add supplementary files (datasheet, schematic)
- [ ] Commit to version control
- [ ] Update documentation (if project-wide platform)

---

## ?? Troubleshooting

### **Problem: Downloads folder is messy**
**Solution**: Use the Python script to auto-organize

### **Problem: Can't find downloaded files**
**Solution**: Check browser default download location, search for `platforms_*`

### **Problem: Wrong filename after rename**
**Solution**: Use batch script or manual rename with correct convention

### **Problem: Multiple versions of same file**
**Solution**: Use timestamps to distinguish, keep latest in platform directory

---

**See Also:**
- [AI-INSTRUCT.md](../AI-INSTRUCT.md) - Development guidelines
- [MODULAR-STRUCTURE.md](./MODULAR-STRUCTURE.md) - Code organization
- [VAR-ALIAS-FEATURE.md](./VAR-ALIAS-FEATURE.md) - Variable aliasing

---

**Last Updated**: February 4, 2026  
**Maintainer**: PDS Development Team
