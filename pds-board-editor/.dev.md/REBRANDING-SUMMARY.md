# ? Pinleaf Forge - Rebranding Complete

## ? Changes Implemented

### 1?? **Project Renamed**
- **Old Name:** PDS Platform Editor
- **New Name:** ? **Pinleaf Forge** - Embedded Platform Specification Editor

### 2?? **Updated Files**

#### **`platform-editor-v2.html`**
- ? Title: "Pinleaf Forge - Platform Specification Editor"
- ? Header: "? Pinleaf Forge" with "Embedded Platform Specification Editor" subtitle
- ? **New Synopsis Section** at top of page with:
  - What is Pinleaf Forge?
  - Key features overview
  - Use cases
  - Target audience
- ? **Fixed column widths:**
  - Header: 70px
  - Physical: 70px
  - Group: 120px
  - Pin Name: 140px
  - Capabilities: flex (remaining space)

#### **`README.md`**
- ? Updated branding throughout
- ? New synopsis section
- ? Reorganized features list
- ? Added key capabilities

#### **`GIT-SETUP.md`**
- ? Updated with Pinleaf Forge branding
- ? Updated commit message template
- ? Updated GitHub settings recommendations

---

## ?? Column Width Specifications

| Column | Width | Purpose |
|--------|-------|---------|
| **Header** | 70px | Connector/header ID (J1, J2, etc.) |
| **Physical** | 70px | Physical pin number (1, 2, PA0, etc.) |
| **Group** | 120px | Functional group (Power, GPIO, etc.) |
| **Pin Name** | 140px | Descriptive name (GPIO0 / BOOT, etc.) |
| **Capabilities** | flex | Capability button row (scrollable) |

**Benefits:**
- ? Consistent alignment across all rows
- ? No text wrapping or layout shifts
- ? Professional appearance
- ? Easy to scan visually
- ? Text overflow handled with ellipsis

---

## ?? Visual Improvements

### **Before:**
```
Header     Physical    Group          Pin Name       Capabilities
J1         1          Power          VIN            [Buttons...]
J123       123        Communication  GPIO0 / BOOT / ... [Buttons...]
```
*(Inconsistent column widths, text wrapping)*

### **After:**
```
Header  Physical  Group        Pin Name                Capabilities
J1      1         Power        VIN                     [Buttons...]
J123    123       Commu...     GPIO0 / BOOT / ...      [Buttons...]
```
*(Fixed widths, ellipsis for overflow, clean alignment)*

---

## ?? Synopsis Text

**Added to top of editor page:**

> **Pinleaf Forge** is an open-source, web-based editor for defining and visualizing microcontroller/processor platform specifications. Built for embedded developers, hobbyists, and teams maintaining hardware catalogs, it combines:
>
> - **AI-assisted data population** — Generate research prompts for tools like Copilot/ChatGPT to fetch accurate specs (CPU, RAM, wireless, interfaces, etc.), then import the JSON directly.
> - **Visual pin capability matrix** — Drag-to-reorder rows for physical layout matching, editable pin names, headers, and color-coded toggle buttons for every capability (GPIO, ADC, PWM, UART, SPI, I2C, power pins, interrupts, etc.).
> - **Structured JSON export** — Clean, standardized output ready for databases, code generation, PlatformIO custom boards, Wokwi simulations, or your own automation workflows.
> - **Multi-header support** — Define multiple connectors (J1, J2, etc.) for complex boards with separated power, I/O, and communication headers.
>
> *No more manual datasheet hunting or messy spreadsheets—forge complete, accurate platform definitions with ease. Perfect for IoT prototyping, education, documentation, or building internal MCU reference libraries.*

---

## ?? Branding Strategy

### **Name Meaning:**
- **Pinleaf** ? Classic "pinout leaf" diagrams (folded reference cards)
- **Forge** ? Create/build something from raw materials
- **Combined** ? "Forge pinout leaves" = Create professional hardware references

### **Target Audience:**
1. **Embedded developers** — Building custom boards
2. **Hobbyists** — Documenting their projects
3. **Teams** — Maintaining hardware catalogs
4. **Educators** — Teaching microcontroller concepts
5. **Makers** — Prototyping IoT devices

### **Key Differentiators:**
- ? AI-assisted (no manual datasheet hunting)
- ?? Visual (drag & drop, color-coded)
- ?? Structured (clean JSON output)
- ?? Multi-header (complex boards supported)
- ?? Zero install (pure HTML/CSS/JS)

---

## ?? GitHub Repository Recommendations

### **Repository Name Options:**
1. `PinleafForge` (CamelCase)
2. `pinleaf-forge` (kebab-case) ? **Recommended**
3. `pinleaf_forge` (snake_case)

### **Description:**
```
? Pinleaf Forge - Open-source embedded platform specification editor with AI assistance and visual pin matrix
```

### **Topics:**
```
embedded hardware microcontroller esp32 platform-editor automation iot pinout 
stm32 arduino raspberry-pi mcu specifications datasheet documentation tool
```

### **GitHub Pages URL:**
```
https://yourusername.github.io/pinleaf-forge/platform-editor-v2.html
```

### **README Badges:**
```markdown
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/username/pinleaf-forge?style=social)](https://github.com/username/pinleaf-forge)
[![Open in Browser](https://img.shields.io/badge/Open-Live%20Demo-blue)](https://yourusername.github.io/pinleaf-forge/platform-editor-v2.html)
```

---

## ?? Version History

| Version | Date | Changes |
|---------|------|---------|
| **2.1** | Feb 4, 2026 | Rebranded to Pinleaf Forge, fixed column widths, added synopsis |
| **2.0** | Feb 4, 2026 | Added HEADER_ID support, multi-header diagrams |
| **1.0** | Feb 2, 2026 | Initial platform editor with AI research |

---

## ? Ready for Git Push

All changes complete! Run:

```bash
git add .
git commit -m "feat: Rebrand to Pinleaf Forge with fixed column widths and synopsis"
git push
```

---

**Last Updated**: February 4, 2026  
**Version**: 2.1  
**Status**: Ready for GitHub release ??
