# Pinleaf Forge

**Embedded Platform Specification Editor** - Create and manage hardware platform definitions (CPU specs, pinouts, capabilities) for embedded development

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub](https://img.shields.io/badge/GitHub-PDS--Pinleaf--Forge-blue?logo=github)](https://github.com/vctmasters1/PDS-Pinleaf-Forge)

🔗 **Open via VS Code**: PDS Toolbox panel → **Open Board Editor**

---

## ⚡ What is Pinleaf Forge?

**Pinleaf Forge** is an open-source, web-based editor for defining and visualizing microcontroller/processor platform specifications. Built for embedded developers, hobbyists, and teams maintaining hardware catalogs, it combines:

✨ **AI-assisted data population** — Generate research prompts for tools like Copilot/ChatGPT to fetch accurate specs (CPU, RAM, wireless, interfaces, etc.), then import the JSON directly.

🎨 **Visual pin capability matrix** — Drag-to-reorder rows for physical layout matching, editable pin names, headers, and color-coded toggle buttons for every capability (GPIO, ADC, PWM, UART, SPI, I2C, power pins, interrupts, etc.).

📦 **Structured JSON export** — Clean, standardized output ready for databases, code generation, PlatformIO custom boards, Wokwi simulations, or your own automation workflows.

🔌 **Multi-header support** — Define multiple connectors (J1, J2, etc.) for complex boards with separated power, I/O, and communication headers.

**No more manual datasheet hunting or messy spreadsheets**—forge complete, accurate platform definitions with ease.

**Perfect for:** IoT prototyping, education, documentation, or building internal MCU reference libraries.

---

## 🚀 Quick Start

### **Open via VS Code (recommended)**
PDS Toolbox panel → **Open Board Editor**

The extension opens the pre-built `dist/index.html` (React app, self-contained).

### **Open in browser**
```bash
cd PDS-BoardEditor
npm install   # first time only
npm run build # creates dist/index.html
# Then open dist/index.html in any browser
```

---

## 📋 Key Features

✅ **AI-Assisted Workflow**
- Generate research prompts for Copilot/ChatGPT
- Paste JSON response to auto-fill form
- Saves hours on hardware specifications

✅ **Visual Pin Matrix**
- Drag & drop to reorder pins
- Multi-header support (J1, J2, J3...)
- Color-coded capability buttons
- Sortable columns (Header, Physical, Group, Name)
- Fixed column widths for alignment

✅ **Platform Specifications**
- CPU/MCU architecture, cores, frequency
- RAM, Flash, GPIO counts
- WiFi, BLE, USB, Ethernet support
- System capabilities (I2C, SPI, UART, CAN, I2S)

✅ **Pin Capabilities**
- Power pins (VIN, 5V, 3V3, GND) with gradient colors
- Digital I/O (GPIO, interrupts)
- Analog (ADC, PWM)
- Communication (UART, SPI, I2C, CAN)
- Special functions (RESET, RMT)

✅ **Export & Import**
- Download as JSON file
- Import existing platform definitions
- Share specs across teams
- Ready for automation workflows

✅ **Pinout Visualization**
- Quick preview in editor
- Generate detailed pinout diagrams
- Export as SVG or PNG (via Pinout Leaf Generator)

---

## 📁 Directory Structure

```
PDS-BoardEditor/
├── dist/index.html              # Built React app (self-contained — OPEN THIS)
├── board-editor.html            # Legacy fallback (vanilla JS)
├── src/                         # React 18 source
├── .ai/instruct.md               # Development guidelines
├── README.md                    # This file
│
├── boards/                      # Board spec JSONs (flat)
│   ├── esp32-sm.json
│   └── ...
│
└── css/
    └── platform-editor.css         # Shared stylesheet
    ├── ai-backend.py           # (No longer needed)
    └── ...
```

---

## 🎯 Key Concepts

### **Platform** (CPU/MCU Specifications)
Defines what the **processor** can do:
- Architecture (ARM Cortex-M33, Xtensa, RISC-V, AVR)
- Cores, frequency, RAM, Flash
- GPIO, ADC, PWM channels
- Communication interfaces (I2C, SPI, UART, CAN, I2S)
- WiFi and Bluetooth capabilities
- Toolchain (ESP-IDF, STM32CubeIDE, PlatformIO, Arduino IDE)

**File**: `platforms/<id>.json`

### **hwrev** (Hardware Revision / Board)
Defines the **physical board** layout:
- Which platform it uses
- Pin mapping (GPIO3 → "Water Level ADC", GPIO5 → "Mist Pump")
- Connectors and dimensions
- Schematic references

**File**: `hwrev/<id>/hwrev-config.json`

### **Role** (Automation Behavior)
Defined in **LadderLogicEditor**, NOT here.
- What the device **does** (aeroponics, greenhouse, propagation)
- Same board can run different roles with different `.st` files

---

## 📝 Workflow: Create a New Platform

### **Option 1: AI-Assisted (Recommended)**

1. **Open Editor**
   - VS Code: PDS Toolbox panel → **Open Board Editor**
   - Browser: open `dist/index.html`

2. **Generate Research Prompt**
   - Enter platform name (e.g., "ESP32-C3", "STM32F103", "Renesas R7FA6M5BH2CBG")
   - Click **"📋 Generate & Copy Prompt"**

3. **Get Specifications**
   - Paste prompt in **Copilot Chat**
   - Copy JSON response

4. **Import & Review**
   - Paste JSON in **Step 2: Import JSON**
   - Click **"📥 Import JSON & Fill Form"**
   - Review and adjust as needed

5. **Download**
   - Click **"⬇️ Download as JSON"**
   - Save to `platforms/<id>.json`

### **Option 2: Manual Entry**

1. Open the editor (`dist/index.html` or VS Code extension)
2. Fill in all form fields
3. Click **"⬇️ Download as JSON"**
4. Save to `platforms/<id>.json`

### **Option 3: Direct JSON**

Create `platforms/<id>.json` manually:

```json
{
  "id": "esp32c3",
  "name": "ESP32-C3",
  "description": "Low-cost WiFi + BLE MCU",
  "architecture": "RISC-V",
  "cores": 1,
  "frequency_mhz": 160,
  "ram_kb": 400,
  "flash_kb": 4096,
  "gpio_total": 22,
  "adc_channels": 6,
  "pwm_channels": 6,
  "wifi": "802.11b/g/n",
  "ble": "5.0",
  "supported_interfaces": ["I2C", "SPI", "UART"],
  "toolchain": "ESP-IDF",
  "pin_capabilities": [
    {
      "pin": 0,
      "physical_pin": "1",
      "group": "Power",
      "name": "VIN",
      "capabilities": ["VIN"]
    }
  ]
}
```

---

## 🎨 Pin Capability Colors

| Capability | Color | Description |
|------------|-------|-------------|
| **VIN** | 🔴 Bright Red | Input voltage |
| **5V** | 🔴 Red Gradient | 5V power |
| **3V3** | 🔴 Dark Red | 3.3V power |
| **GND** | ⚫ Black | Ground |
| **GPIO** | 🟣 Purple | General purpose I/O |
| **ADC** | 🟠 Orange | Analog input |
| **PWM** | 🔵 Turquoise | PWM output |
| **I2C/SDA/SCL** | ⚪ Slate Gray | I2C bus |
| **SPI/MISO/MOSI/SCK** | 🔵 Blue | SPI bus |
| **UART/RXD/TXD** | 🟢 Green | Serial UART |
| **CAN** | 🔵 Light Blue | CAN bus |
| **RESET** | 🔵 Dark Turquoise | Reset pin |
| **INTERRUPT** | 🟡 Yellow | Interrupt capable |

---

## 🛠️ Features in Detail

### **Sortable Pin Matrix**
- Click column headers to sort (Physical, Group, Pin Name)
- Multi-column sort: Click **🔀 Sort Pins** button
- Drag & drop to reorder pins manually

### **Group Organization**
- Organize pins by function: Power, GPIO, Communication, Analog, Special
- Filter and sort by group for easy navigation

### **Visual Pinout Preview**
- Quick dual-row board preview
- Shows pin names and physical pin numbers
- Click **"📄 Generate Pinout Leaf"** for full customization

### **JSON Import/Export**
- Export: Download as `<platform-id>.json`
- Import: Paste JSON from Copilot or existing file
- Share platform specs with teams

---

## 🔤 Variable Alias (`var_alias`)

### **What is it?**
The `var_alias` field provides **programming-friendly variable names** for each pin. At the **platform level**, these are generic hardware identifiers. Role-specific names are assigned later at the Role level.

### **Future Use:**
⚠️ **Important:** The `var_alias` will eventually become **C/C++ #define symbols** in auto-generated header files.

### **Platform-Level Naming Convention (Generic)**

At the platform level, use **generic names** based on the GPIO number or bus identity:

| Type | Convention | Examples |
|------|-----------|----------|
| **GPIO** | `gpio_N` (N = GPIO number) | `gpio_0`, `gpio_4`, `gpio_10` |
| **Power** | `pwr_<type>` | `pwr_5v`, `pwr_3v3`, `pwr_gnd` |
| **I2C** | `i2c_<signal>` | `i2c_sda`, `i2c_scl`, `i2c1_sda` |
| **SPI** | `spi_<signal>` | `spi_mosi`, `spi_miso`, `spi_sck` |
| **UART** | `uart_<signal>` | `uart_tx`, `uart_rx`, `uart1_tx` |
| **Special** | descriptive | `rst`, `boot`, `en`, `usb_dp` |

**Example Platform JSON:**
```json
{
  "pin_capabilities": [
    {
      "pin": 2,
      "var_alias": "gpio_2",
      "name": "GPIO2",
      "capabilities": ["GPIO", "ADC", "PWM"]
    },
    {
      "pin": 4,
      "var_alias": "gpio_4",
      "name": "GPIO4",
      "capabilities": ["GPIO", "ADC"]
    },
    {
      "pin": 8,
      "var_alias": "i2c_sda",
      "name": "GPIO8 / I2C SDA",
      "capabilities": ["GPIO", "I2C", "SDA"]
    }
  ]
}
```

### **Role-Level Naming (Application-Specific)**

At the **Role** level (e.g., `aeroponics_core`), pins are remapped to application-specific names in `default_pinmap.json`:

```json
{
  "gpio_2": "led_status",
  "gpio_4": "adc_ph_sensor",
  "i2c_sda": "i2c_sda"
}
```

This separation keeps the platform definition reusable across different roles.

### **Adapting Existing Code**

If you have **existing firmware**, your current pin names belong at the **Role level**, not the platform level:

```c
// Your existing code
#define LED_PIN 2
```

```json
// In default_pinmap.json (Role level)
{"gpio_2": "LED_PIN"}
```

**Result:** No code changes needed when auto-generating headers!

### **Best Practices**

✅ **DO:** Use descriptive names (`led_status`, `btn_start`), follow consistent convention  
❌ **DON'T:** Use generic names (`pin1`, `output1`), reserved keywords, special characters

---

## 📦 Related Components

| Component | Purpose | Uses PDS-BoardEditor |
|-----------|---------|---------------------|
| **LadderLogicEditor** | Automation logic editor | ✅ Platform specs (pin capabilities) |
| **PDS-BuildTools** | Firmware build system | ✅ Toolchain selection |
| **Device/** | Device firmware | ✅ hwrev pinouts |
| **HMI-WEB/** | Web controller | ✅ Protocol specs |

---

## 📚 Documentation

- **[.ai/instruct.md](../.ai/instruct.md)** - Development guidelines and authority document
- **Platform Editor** - Built-in help and tooltips
- **Pinout Leaf Generator** - Visual diagram customization

---

## 🔧 Development

### Project Structure
- **Standalone HTML/CSS/JavaScript** - No build tools required
- **No backend needed** - Pure client-side (backend moved to `.old/`)
- **Editable in any text editor** - Visual Studio, VS Code, Notepad++

### Making Changes
1. Edit source files in `src/`
2. Run `npm run build` to rebuild `dist/index.html`
3. Commit `dist/index.html` along with source changes

---

## 📄 License

MIT License - See [LICENSE](./LICENSE) file for details

---

## 🤝 Contributing

This is part of the **PDS Automation Suite** internal tooling.
For questions or improvements, contact the development team.

---

**Last Updated**: February 4, 2026  
**Version**: 2.0  
**Maintainer**: PDS Development Team
