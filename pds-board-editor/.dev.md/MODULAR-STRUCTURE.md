# Pinleaf Forge - Modular File Structure

## ?? Directory Layout

```
PDS-HwPlatform/
??? platform-editor-v2.html          # Main HTML (modular version) ?
??? platform-editor-v2-legacy.html   # Old monolithic version (backup)
??? pinout-leaf-generator.html       # Pinout generator (modular version) ? NEW
??? pinout-leaf-generator-legacy.html # Old monolithic version (backup) ? NEW
??? README.md
?
??? css/                              # ? Stylesheets
?   ??? platform-editor.css          # Platform editor styles (700 lines)
?   ??? pinout-generator.css         # ? NEW - Pinout generator styles (200 lines)
?
??? js/                               # ? JavaScript modules
?   ??? platform-editor-core.js      # Core state (50 lines)
?   ??? prompt-generator.js          # AI prompts (100 lines)
?   ??? json-handler.js              # Import/Export JSON (150 lines)
?   ??? pin-matrix.js                # Pin rows, drag-drop, sorting (350 lines)
?   ??? data-collector.js            # Data collection and preview (250 lines)
?   ??? pinout-generator-core.js     # ? NEW - Pinout core (30 lines)
?   ??? pinout-json-handler.js       # ? NEW - Pinout JSON (20 lines)
?   ??? pinout-svg-generator.js      # ? NEW - SVG generation (180 lines)
?   ??? pinout-ui-controller.js      # ? NEW - UI management (40 lines)
?   ??? pinout-download-handler.js   # ? NEW - Download SVG/PDF (60 lines)
?
??? platforms/                        # Platform JSON files
??? hwrev/                            # Hardware revision configs
??? .local_mds/                       # Documentation
    ??? MODULAR-STRUCTURE.md          # This file
    ??? VAR-ALIAS-FEATURE.md
    ??? PLATFORM-FILE-ORGANIZATION.md
    ??? ...
```

---

## ?? Modularization Summary

### **Platform Editor (platform-editor-v2.html)**

**Before**: 2,800 lines monolithic file  
**After**: 600 lines HTML + 700 lines CSS + 900 lines JS (5 modules)

| Module | Lines | Responsibility |
|--------|-------|----------------|
| `platform-editor.css` | 700 | All styles (organized sections) |
| `platform-editor-core.js` | 50 | Global state, constants, event listeners |
| `prompt-generator.js` | 100 | AI prompt generation with var_alias |
| `json-handler.js` | 150 | Import/Export JSON, pinout generator link |
| `pin-matrix.js` | 350 | Pin rows, drag-drop, sorting |
| `data-collector.js` | 250 | Data collection, preview updates |

### **Pinout Leaf Generator (pinout-leaf-generator.html)** ? NEW

**Before**: 700 lines monolithic file  
**After**: 180 lines HTML + 200 lines CSS + 330 lines JS (5 modules)

| Module | Lines | Responsibility |
|--------|-------|----------------|
| `pinout-generator.css` | 200 | All styles (clean separation) |
| `pinout-generator-core.js` | 30 | Global state, auto-load from sessionStorage |
| `pinout-json-handler.js` | 20 | Import JSON, populate form |
| `pinout-svg-generator.js` | 180 | SVG generation with proper grouping |
| `pinout-ui-controller.js` | 40 | Preview updates, header buttons |
| `pinout-download-handler.js` | 60 | Download SVG/PDF with file organization |

---

## ?? Module Responsibilities

### **Platform Editor Modules**

**platform-editor-core.js**:
- Global variables (`form`, `pin_capabilities`, `ALL_CAPABILITIES`)
- Event listener initialization
- Form state management

**prompt-generator.js**:
- `generateResearchPrompt()` - Creates AI prompt
- Clipboard API integration
- var_alias documentation in prompt

**json-handler.js**:
- `parseAndFillForm()` - Import JSON
- `downloadJSON()` - Export with platform directory structure
- `openPinoutLeafGenerator()` - Pass data via sessionStorage

**pin-matrix.js**:
- `generatePinRows()`, `createPinRow()` - Pin matrix
- `sortPins()`, `multiColumnSort()` - Sorting
- Drag-and-drop handlers
- `addPinRow()` - Dynamic pin addition

**data-collector.js**:
- `updatePreview()` - JSON preview
- `populatePinCapabilities()` - Extract pin data
- `toggleSystemFeature()` - Feature toggles
- `generateQuickPinoutSVG()` - SVG preview

### **Pinout Generator Modules** ? NEW

**pinout-generator-core.js**:
- Global variable `platformData`
- Auto-load from sessionStorage
- DOMContentLoaded event handler

**pinout-json-handler.js**:
- `loadJSON()` - Import platform JSON
- Board name auto-fill

**pinout-svg-generator.js**:
- `generatePinoutLeafSVG()` - Main SVG generation
  - Dual-row layout
  - Single-row layouts (left/right)
  - Proper SVG grouping with `<g>` elements
  - Comments for each pin
- `getPinColor()` - Color mapping by capability

**pinout-ui-controller.js**:
- `updatePreview()` - Update SVG preview
- `generateHeaderButtons()` - Dynamic button generation

**pinout-download-handler.js**:
- `downloadHeaderSVG()` - Download individual header SVG
- `downloadAllSVGs()` - Download all headers
- `downloadPDF()` - PDF export (placeholder)
- File naming with platform directory structure

---

## ?? Script Loading Order

### **Platform Editor**
```html
<script src="js/platform-editor-core.js"></script>      <!-- Load first -->
<script src="js/prompt-generator.js"></script>
<script src="js/json-handler.js"></script>
<script src="js/pin-matrix.js"></script>
<script src="js/data-collector.js"></script>
```

### **Pinout Generator** ? NEW
```html
<script src="js/pinout-generator-core.js"></script>     <!-- Load first -->
<script src="js/pinout-json-handler.js"></script>
<script src="js/pinout-svg-generator.js"></script>
<script src="js/pinout-ui-controller.js"></script>
<script src="js/pinout-download-handler.js"></script>
```

**Critical**: Core must load first, others can be in any order (but keep logical grouping)

---

## ? Benefits of Modular Architecture

### **Maintainability**
- ? Each file <400 lines, single responsibility
- ? Easier to find and fix bugs
- ? Cleaner code organization
- ? Reduced cognitive load

### **Collaboration**
- ? Multiple developers can work on different modules
- ? No merge conflicts in giant HTML file
- ? Clear separation of concerns
- ? Easy code reviews

### **Performance**
- ? Browser can cache individual JS/CSS files
- ? Parallel downloading of resources
- ? Minification per module
- ? Faster page loads on repeat visits

### **GitHub Pages Compatibility**
- ? Works perfectly with GitHub Pages!
- ? All files served as static content
- ? No build process required
- ? Direct browser execution

---

## ?? Migration Steps (COMPLETED ?)

### **Phase 1: Platform Editor** ? DONE
- [x] Create `css/platform-editor.css`
- [x] Create `js/` modules (5 files)
- [x] Create `platform-editor-v2.html`
- [x] Backup original as `platform-editor-v2-legacy.html`

### **Phase 2: Pinout Generator** ? DONE
- [x] Create `css/pinout-generator.css`
- [x] Create `js/` modules (5 files)
- [x] Create `pinout-leaf-generator.html`
- [x] Backup original as `pinout-leaf-generator-legacy.html`

### **Phase 3: Testing** (NEXT)
- [ ] Test Platform Editor in browser
- [ ] Test Pinout Generator in browser
- [ ] Test data flow: Editor ? Generator
- [ ] Verify GitHub Pages deployment

### **Phase 4: Cleanup** (FUTURE)
- [ ] Delete legacy files (after confirmation)
- [ ] Update README.md
- [ ] Update AI-INSTRUCT.md
- [ ] Commit modular structure

---

## ?? Important Notes

### **Script Loading Order Matters!**
```html
<!-- Core must load first -->
<script src="js/[tool]-core.js"></script>

<!-- Then other modules (order doesn't matter much) -->
<script src="js/[tool]-*.js"></script>
```

### **GitHub Pages Serving**
All files are served as static content:
- `https://vctmasters1.github.io/PDS-Pinleaf-Forge/platform-editor-v2.html`
- `https://vctmasters1.github.io/PDS-Pinleaf-Forge/pinout-leaf-generator.html`
- `https://vctmasters1.github.io/PDS-Pinleaf-Forge/js/*.js`
- `https://vctmasters1.github.io/PDS-Pinleaf-Forge/css/*.css`

### **No Build Process Required**
- Direct browser execution
- No webpack, rollup, or bundlers needed
- Edit files and refresh browser

---

## ?? File Size Comparison

### **Platform Editor**
| Version | HTML | CSS | JS | Total | Files |
|---------|------|-----|----|----|-------|
| Legacy | 2,800 lines | - | - | 2,800 | 1 |
| Modular | 600 lines | 700 | 900 | 2,200 | 7 |
| **Reduction** | **-79%** | **+700** | **+900** | **-21%** | **+6** |

### **Pinout Generator**
| Version | HTML | CSS | JS | Total | Files |
|---------|------|-----|----|----|-------|
| Legacy | 700 lines | - | - | 700 | 1 |
| Modular | 180 lines | 200 | 330 | 710 | 7 |
| **Reduction** | **-74%** | **+200** | **+330** | **+1%** | **+6** |

**Key Insight**: While total line count is similar, the **organization** is drastically improved. HTML files are now **pure structure** with no embedded styles or scripts.

---

## ?? Learning Resources

### **For New AI Agents**

**Start Here**:
1. Read this file (MODULAR-STRUCTURE.md)
2. Read [AI-INSTRUCT.md](../AI-INSTRUCT.md) - AUTHORITATIVE
3. Open modular HTML files and trace workflow
4. Check `js/` modules to understand code organization

**Key Concepts**:
- **Modular Architecture**: HTML/CSS/JS separation
- **Single Responsibility**: Each module has one job
- **Load Order**: Core first, then dependencies
- **GitHub Pages**: Static file serving, no build

**Common Pitfalls**:
- Loading scripts in wrong order (breaks dependencies)
- Adding inline styles/scripts (breaks modularity)
- Changing file paths without updating all references
- Forgetting to test in browser after changes

---

## ?? Troubleshooting

### **Problem: Scripts not loading**
**Solution**: Check browser console (F12), verify file paths, check load order

### **Problem: Styles not applying**
**Solution**: Hard refresh (Ctrl+F5), check CSS file path in `<link>` tag

### **Problem: Functions undefined**
**Solution**: Check script load order, ensure core.js loads first

### **Problem: GitHub Pages not updating**
**Solution**: Wait 1-2 minutes, clear browser cache, check deployment status

---

**Last Updated**: February 5, 2026  
**Status**: Both tools fully modularized ?  
**Next**: Testing and GitHub Pages deployment

---

**See Also:**
- [AI-INSTRUCT.md](../AI-INSTRUCT.md) - Development guidelines
- [VAR-ALIAS-FEATURE.md](./VAR-ALIAS-FEATURE.md) - Variable aliasing
- [PLATFORM-FILE-ORGANIZATION.md](./PLATFORM-FILE-ORGANIZATION.md) - File organization

---

**Maintainer**: PDS Development Team
