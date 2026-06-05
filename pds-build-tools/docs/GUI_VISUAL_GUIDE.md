# PDS Build System - GUI Visual Guide

## Screenshot Description

```
╔═══════════════════════════════════════════════════════════════════════════╗
║                                                                            ║
║  ┌─────────────────────────────────────────────────────────────────────┐  ║
║  │ PDS-AutomationSuite Build System                                    │  ║
║  │ Select platform, hardware revision, and device role to build        │  ║
║  └─────────────────────────────────────────────────────────────────────┘  ║
║                                                                            ║
║  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ║
║                                                                            ║
║  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────────┐   ║
║  │ PLATFORM         │  │ HARDWARE REV.    │  │ DEVICE ROLE         │   ║
║  ├──────────────────┤  ├──────────────────┤  ├─────────────────────┤   ║
║  │▶ esp32c3         │  │▶ 001             │  │▶ aeroponics         │   ║
║  │  silabs          │  │  002             │  │  greenhouse         │   ║
║  │                  │  │                  │  │  generic            │   ║
║  │                  │  │                  │  │  sensor_hub         │   ║
║  │                  │  │                  │  │                     │   ║
║  │                  │  │                  │  │                     │   ║
║  │                  │  │                  │  │                     │   ║
║  │                  │  │                  │  │                     │   ║
║  ├──────────────────┤  ├──────────────────┤  ├─────────────────────┤   ║
║  │ Espressif ESP32  │  │ H2O Tower v1     │  │ Complete aeroponics │   ║
║  │ with WiFi & BLE  │  │ with sensors     │  │ system controller   │   ║
║  └──────────────────┘  └──────────────────┘  └─────────────────────┘   ║
║                                                                            ║
║  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ║
║                                                                            ║
║  ┌─────────────────────┐  ┌─────────────────────┐  ┌──────────────────┐ ║
║  │ 🔨 COMPILE          │  │ 📋 List Platforms   │  │ ❌ Clear Output   │ ║
║  └─────────────────────┘  └─────────────────────┘  └──────────────────┘ ║
║                                                                            ║
║  ┌──────────────────┐  ┌────────────────────────────────────────────────┐ ║
║  │ ⚙️ Settings       │  │ ❓ Help                                        │ ║
║  └──────────────────┘  └────────────────────────────────────────────────┘ ║
║                                                                            ║
║  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ║
║                                                                            ║
║  ┌────────────────────────────────────────────────────────────────────┐  ║
║  │                                                                     │  ║
║  │ [*] Starting build process...                                      │  ║
║  │ [*] Platform: esp32c3                                              │  ║
║  │ [*] Hardware Revision: 001                                         │  ║
║  │ [*] Role: aeroponics                                               │  ║
║  │                                                                     │  ║
║  │ [*] Running: python build_selector.py --platform esp32c3 ...       │  ║
║  │                                                                     │  ║
║  │ I (XXX) H2O_BUILD: Validating configuration...                     │  ║
║  │ I (XXX) H2O_BUILD: Loading platform esp32c3                        │  ║
║  │ I (XXX) H2O_BUILD: Selected role: aeroponics                       │  ║
║  │ I (XXX) H2O_BUILD: Delegating to build_espidf.py                   │  ║
║  │                                                                     │  ║
║  │ Executing idf.py build...                                          │  ║
║  │ Compiling firmware for ESP32-C3...                                 │  ║
║  │ [ 25%] Building component: pds_core                                │  ║
║  │ [ 50%] Building component: pds_hal                                 │  ║
║  │ [ 75%] Building component: pds_network                             │  ║
║  │ [100%] Linking binary...                                           │  ║
║  │                                                                     │  ║
║  │ [+] Build completed successfully!                                  │  ║
║  │                                                                     │  ║
║  │ ▲ (Scroll to see more)                                             │  ║
║  ├────────────────────────────────────────────────────────────────────┤  ║
║  │ Green text on black background = Terminal output display           │  ║
║  └────────────────────────────────────────────────────────────────────┘  ║
║                                                                            ║
║  Ready                                                                    ║
║                                                                            ║
╚═══════════════════════════════════════════════════════════════════════════╝
```

## UI Element Reference

### Three-Column Selector

```
┌────────────────────────────────────────────────────────┐
│ PLATFORM              │ HARDWARE REV.    │ DEVICE ROLE │
├────────────────────────────────────────────────────────┤
│                       │                 │             │
│ ▶ esp32c3             │ ▶ 001            │ ▶ aeroponics │
│   silabs              │   002            │   greenhouse│
│                       │                 │   generic    │
│                       │                 │   sensor_hub │
│                       │                 │             │
│ (12-item scrollable list per column)    │             │
│                       │                 │             │
├────────────────────────────────────────────────────────┤
│ Espressif...          │ H2O Tower...     │ Complete... │
│ Description of        │ Description of   │ Description │
│ selected platform     │ hardware rev     │ of role     │
└────────────────────────────────────────────────────────┘
```

**Features:**
- ✅ Independently scrollable lists
- ✅ Auto-selected first item in each column
- ✅ Descriptions update on selection
- ✅ Click any item to select
- ✅ Colors: Green text for descriptions

### Button Bar

```
┌──────────────┐  ┌──────────────────┐  ┌──────────────┐  ┌──────────────┐
│ 🔨 COMPILE   │  │ 📋 List Platforms│  │ ❌ Clear Out │  │ ⚙️ Settings  │
│ (Big Green)  │  │ (Gray)           │  │ (Gray)       │  │ (Gray)       │
└──────────────┘  └──────────────────┘  └──────────────┘  └──────────────┘

┌────────────────────────────────────────┐
│ ❓ Help                                │
│ (Gray)                                 │
└────────────────────────────────────────┘
```

**Button Functions:**

| Button | Icon | Purpose | Color |
|--------|------|---------|-------|
| COMPILE | 🔨 | Start build with current selection | Green |
| List Platforms | 📋 | Show all available platforms | Gray |
| Clear Output | ❌ | Clear terminal output window | Gray |
| Settings | ⚙️ | Configure application | Gray |
| Help | ❓ | Show help dialog | Gray |

### Output Terminal

```
┌─────────────────────────────────────────────┐
│ [*] Starting build process...               │ ◄─ Build start
│ [*] Platform: esp32c3                       │ ◄─ Configuration
│ [*] Hardware Revision: 001                  │ ◄─ Configuration
│ [*] Role: aeroponics                        │ ◄─ Configuration
│                                              │
│ [*] Running: python build_selector.py ...   │ ◄─ Command line
│                                              │
│ I (XXX) MSG: Normal output                  │ ◄─ Build output
│ W (XXX) MSG: Warning message                │ ◄─ Build output
│ E (XXX) MSG: Error message                  │ ◄─ Build output
│                                              │
│ [+] Build completed successfully!           │ ◄─ Success message
│ [+] Binary saved to: build/firmware.bin     │ ◄─ Result info
│                                              │
│ ▲ (Scroll up to see earlier output)         │
└─────────────────────────────────────────────┘
  Green text on black background (terminal theme)
```

**Features:**
- ✅ Real-time output streaming
- ✅ Auto-scrolls to new lines
- ✅ Green-on-black color scheme
- ✅ Monospace font (Courier)
- ✅ Copy/paste support
- ✅ Scrollbar for history

### Status Bar

```
┌────────────────────────────────────────┐
│ Ready                                  │
└────────────────────────────────────────┘
```

**Indicators:**

| Status | Color | Meaning |
|--------|-------|---------|
| Ready | 🟢 Green | GUI idle, ready for input |
| 🔨 Building... | 🟡 Yellow | Build in progress |

---

## Interaction Flows

### Flow 1: Select and Build

```
User Action          GUI Response              Build System
─────────────────────────────────────────────────────────
Click platform list  → Column highlights        ─────────
Select "esp32c3"     → HWREV column updates     ─────────
Click HWREV list     → Column highlights        ─────────
Select "001"         → Role column updates      ─────────
Click Role list      → Column highlights        ─────────
Select "aeroponics"  → Descriptions show        ─────────
Click 🔨 COMPILE    → Status: "🔨 Building..."  
                       (Build thread starts)
                       │
                       ├─→ Validates config
                       ├─→ Calls build_selector.py
                       ├─→ Streams output
                       └─→ Returns exit code
                                                 Build completes
                       Status: "Ready"
                       Output: "[+] Success!"
```

### Flow 2: Clear and Rebuild

```
User Action           GUI Response
──────────────────────────────────
Click ❌ Clear Output → Terminal cleared
(Select new config)  → Lists update
Click 🔨 COMPILE    → New build starts
```

### Flow 3: View Information

```
User Action             GUI Response
───────────────────────────────────
Click 📋 List Platforms → Popup window shows:
                          • All platforms
                          • HWREV options
                          • Available roles
Close popup            → Return to main window
```

---

## Color Scheme

### Theme: DarkBlue3

```
┌──────────────────────────────────────────┐
│ Background: Dark blue                    │
│ Text: Light (white/gray)                │
│ Buttons: Blue (primary) / Gray (secondary)│
│ Terminal: Black background, green text  │
│ Descriptions: Green text                │
│ Error: Red text                         │
│ Success: Green text                     │
│ Status: Green (ready) / Yellow (busy)   │
└──────────────────────────────────────────┘
```

### Alternative Themes

Available (change line 15 in `go_gui.py`):
- `DarkBlue3` (current, professional)
- `Dark` (very dark, high contrast)
- `LightBlue2` (light theme)
- `DarkGreen6` (green theme)

---

## Keyboard Navigation

| Key | Action |
|-----|--------|
| ↑ / ↓ | Navigate list items |
| Enter | Select highlighted item |
| Tab | Move to next field |
| Shift+Tab | Move to previous field |
| Space | Activate button |
| Alt+Underline | Quick button access |
| Escape | Close dialog (if open) |

---

## Common Scenarios

### Scenario 1: First-Time User

```
1. User sees three empty columns → "What do I click?"
2. Click left column → Platform list appears
3. Select "esp32c3" → Middle and right columns populate
4. See descriptions → "Ah, I understand now"
5. Select hwrev and role → All filled in
6. Click 🔨 COMPILE → Build starts
7. Watch terminal → "I can see what's happening"
8. Build completes → Success message appears
9. Click ⚙️ Settings → "I can customize this"
```

### Scenario 2: Quick Rebuild

```
1. User launches GUI → Last selection is loaded
   (esp32c3 / 001 / aeroponics)
2. Click 🔨 COMPILE immediately → Build starts
3. Watch output → Done in 2 minutes
4. Modify code → Close GUI
5. Launch GUI again → Same selections loaded
6. Rebuild → 10 seconds total time
```

### Scenario 3: Explore Available Options

```
1. User curious about capabilities
2. Click 📋 List Platforms → Popup shows all options
3. Read descriptions → "I can use this role too"
4. Close popup → Return to main
5. Select different role → See new description
6. Build with new configuration
```

---

## Error Messages

### Configuration Error
```
┌─────────────────────────────────────────┐
│ [ERROR]                                 │
│                                          │
│ Configuration file not found:            │
│ C:\path\to\config\platforms.json        │
│                                          │
│ [OK]                                    │
└─────────────────────────────────────────┘
```

### Selection Error
```
┌─────────────────────────────────────────┐
│ [ERROR]                                 │
│                                          │
│ Please select platform, hardware         │
│ revision, and role!                      │
│                                          │
│ [OK]                                    │
└─────────────────────────────────────────┘
```

### Build Already Running
```
┌─────────────────────────────────────────┐
│ [WARNING]                               │
│                                          │
│ Build already in progress!              │
│                                          │
│ [OK]                                    │
└─────────────────────────────────────────┘
```

---

## Terminal Output Examples

### Successful Build

```
[*] Starting build process...
[*] Platform: esp32c3
[*] Hardware Revision: 001
[*] Role: aeroponics

[*] Running: python build_selector.py --platform esp32c3 --hwrev 001 --role aeroponics

I (XXX) ESP_IDF: Starting build...
I (XXX) COMPILER: Compiling main.c
I (XXX) COMPILER: Compiling network.c
I (XXX) LINKER: Linking firmware...
I (XXX) SIZE: Firmware size: 245KB / 256KB

[+] Build completed successfully!
```

### Build Failure

```
[*] Starting build process...
[*] Platform: esp32c3
...
E (XXX) COMPILER: Error in main.c line 42
E (XXX) COMPILER: Undefined reference to 'h2o_init()'

[-] Build failed with exit code 1
```

---

## Window Size & Responsiveness

### Minimum Window Size
```
1200 x 900 pixels

This ensures:
• Three columns visible side-by-side
• Readable text
• Terminal output visible
• All buttons accessible
```

### Resizable
✅ Users can maximize window  
✅ Terminal output expands  
✅ Lists remain usable  
✅ Buttons stay accessible  

---

## Performance Indicators

### Load Time
```
Launch → 1-2 seconds
Config load → < 100ms
Display update → Real-time
```

### Build Display
```
Output streaming → Live (< 10ms delay)
Status update → Instant
Auto-scroll → Smooth
Memory usage → 50-80MB during build
```

---

## Next Steps for Users

1. **Launch GUI**: `python go_gui.py` or `launch_gui.bat`
2. **Read GUI_QUICKSTART.md** for detailed help
3. **Select your configuration**
4. **Click COMPILE**
5. **Watch the magic happen!**

---

**Last Updated**: February 1, 2026  
**Visual Guide Version**: 1.0
