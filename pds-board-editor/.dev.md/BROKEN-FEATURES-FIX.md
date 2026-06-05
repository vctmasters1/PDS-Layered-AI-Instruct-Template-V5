# ?? URGENT FIX NEEDED - Broken Features

## ? **Issue 1: Generate Research Prompt Function Not Working**

### **Problem:**
The `generateResearchPrompt()` function is missing or broken in `platform-editor-v2.html`.

### **Fix Required:**
Add the complete `generateResearchPrompt()` function to the `<script>` section:

```javascript
function generateResearchPrompt() {
    const platformName = document.getElementById('platformSearchInput').value.trim();
    if (!platformName) {
        alert('?? Please enter a platform name first');
        return;
    }

    const prompt = `Research the "${platformName}" microcontroller/processor platform and provide COMPLETE specifications in valid JSON format.

RETURN STRUCTURE (replace all values with accurate research data for ${platformName}):
{
  "id": "string - lowercase identifier with dashes (e.g., esp32c3, stm32f103c8)",
  "name": "string - Official product name from manufacturer",
  "website": "string - Manufacturer product page URL",
  "sku": "string - SKU or part number",
  "description": "string - Brief description of platform and primary use cases",
  "architecture": "string - CPU architecture (e.g., ARM Cortex-M4, Xtensa, RISC-V, AVR)",
  "cores": "number - Actual number of CPU cores",
  "frequency_mhz": "number - Maximum clock frequency in MHz",
  "ram_kb": "number - Total RAM in kilobytes",
  "flash_kb": "number - Total Flash memory in kilobytes",
  "gpio_total": "number - Total number of GPIO pins on the dev board",
  "adc_channels": "number - Number of ADC channels available",
  "pwm_channels": "number - Number of PWM channels available",
  "wifi": "string - MUST be one of: 'none' | '802.11b/g/n' | '802.11b/g/n/ac' | 'WiFi 6' | 'WiFi 7'",
  "ble": "string - MUST be one of: 'none' | '5.0' | '5.1' | '5.2' | '5.3'",
  "supported_interfaces": "array - Communication protocols from: ['I2C', 'SPI', 'UART', 'CAN', 'I2S']",
  "usb_ports": "object - USB port counts like {'usb2': 2, 'usb3': 1}",
  "system_features": "array - System-level peripherals from: ['ethernet', 'sdcard', 'rtc', 'touchscreen', 'camera', 'display']",
  "toolchain": "string - Primary development toolchain",
  "notes": "string - Important specifications, limitations, or special features",
  "pin_capabilities": "array - ALL pins on the development board"
}

PIN CAPABILITIES FORMAT:
Each pin object must have:
- pin: number (0, 1, 2, etc.) - logical GPIO number
- header_id: string - Physical connector/header ID (e.g., "J1", "J2", "Main")
- physical_pin: string - Physical pin number on the board package
- group: string - Functional group from: ['Power', 'GPIO', 'Communication', 'Analog', 'Special']
- var_alias: string - Programming variable name (e.g., "led_status", "btn_start", "sensor_temp")
- name: string - Descriptive name like "GPIO0 / BOOT"
- capabilities: array - PIN-LEVEL electrical functions:
  ["GPIO", "ADC", "PWM", "UART", "RXD", "TXD", "SPI", "MISO", "MOSI", "SCK", "I2C", "SDA", "SCL", "CAN", "VIN", "GND", "3V3", "5V", "RESET", "RMT", "INTERRUPT"]

EXAMPLE PIN OBJECT:
{
  "pin": 0,
  "header_id": "J1",
  "physical_pin": "1",
  "group": "Special",
  "var_alias": "btn_boot",
  "name": "GPIO0 / BOOT",
  "capabilities": ["GPIO", "ADC", "RESET"]
}

Research "${platformName}" thoroughly and provide the complete, accurate JSON now.`;

    // Copy to clipboard
    navigator.clipboard.writeText(prompt).then(() => {
        document.getElementById('promptPreview').textContent = prompt;
        document.getElementById('generatedPromptArea').style.display = 'block';
        document.getElementById('generatedPromptArea').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }).catch(err => {
        console.error('Clipboard error:', err);
        alert('? Could not copy to clipboard. Please copy the prompt manually from the preview below.');
        document.getElementById('promptPreview').textContent = prompt;
        document.getElementById('generatedPromptArea').style.display = 'block';
    });
}
```

---

## ?? **Issue 2: Missing var_alias Documentation**

### **Problem:**
README.md doesn't explain the `var_alias` field and its future use as code symbols.

### **Fix Required:**
Add this section to README.md under "Key Concepts" or create a new "Variable Alias (var_alias)" section:

```markdown
## ?? Variable Alias (`var_alias`)

### **What is it?**
The `var_alias` field provides **programming-friendly variable names** for each pin, making it easier to generate code and maintain consistency across firmware.

### **Future Use:**
?? **Important:** The `var_alias` will eventually become **C/C++ #define symbols** in auto-generated header files.

**Example:**
```c
// Auto-generated from platform JSON
#define led_status    GPIO2
#define btn_start     GPIO5
#define sensor_temp   GPIO4

digitalWrite(led_status, HIGH);  // Instead of digitalWrite(2, HIGH)
```

### **Naming Convention Recommendations**

To make your aliases instantly recognizable and compatible with existing code, consider using **prefixes** based on pin function:

| Prefix | Function | Examples |
|--------|----------|----------|
| **g** | GPIO (General Digital I/O) | `gPin1`, `gLed`, `gRelay` |
| **a** | ADC (Analog Input) | `aPin1`, `aSensor`, `aVoltage` |
| **p** | PWM (Pulse Width Modulation) | `pPin1`, `pMotor`, `pLed` |
| **u** | UART (Serial Communication) | `uRx`, `uTx`, `uDebug` |
| **i** | I2C | `iSda`, `iScl` |
| **s** | SPI | `sMiso`, `sMosi`, `sSck` |

**Example Platform:**
```json
{
  "pin_capabilities": [
    {
      "pin": 2,
      "var_alias": "gLedStatus",
      "name": "GPIO2 / Status LED",
      "capabilities": ["GPIO", "PWM"]
    },
    {
      "pin": 4,
      "var_alias": "aTempSensor",
      "name": "GPIO4 / ADC1_CH0 / Temp",
      "capabilities": ["GPIO", "ADC"]
    },
    {
      "pin": 5,
      "var_alias": "gBtnStart",
      "name": "GPIO5 / Start Button",
      "capabilities": ["GPIO", "INTERRUPT"]
    }
  ]
}
```

### **Adapting Existing Code**

If you have **existing firmware** you want to adapt:

1. **Identify your current pin definitions**:
   ```c
   #define LED_PIN     2
   #define TEMP_PIN    4
   #define BUTTON_PIN  5
   ```

2. **Use those names as `var_alias`** in Pinleaf Forge:
   ```json
   {"var_alias": "LED_PIN", "pin": 2}
   {"var_alias": "TEMP_PIN", "pin": 4}
   {"var_alias": "BUTTON_PIN", "pin": 5}
   ```

3. **Auto-generate header file** (future feature):
   ```c
   // pins.h (auto-generated)
   #define LED_PIN    2
   #define TEMP_PIN   4
   #define BUTTON_PIN 5
   ```

4. **No code changes needed!** Your existing firmware works as-is.

### **Best Practices**

? **DO:**
- Use descriptive, meaningful names: `led_status`, `btn_start`, `relay_pump`
- Follow consistent naming convention
- Match existing code symbols if adapting firmware
- Use snake_case or camelCase consistently

? **DON'T:**
- Use generic names: `pin1`, `pin2`, `output1`
- Mix naming styles inconsistently
- Use reserved keywords: `int`, `void`, `return`
- Include special characters: `@`, `#`, `$`

---

**Remember:** Choose your `var_alias` names carefully—they will become part of your codebase!
```

---

## ? **Action Items:**

1. **Fix `generateResearchPrompt()` function** in `platform-editor-v2.html`
2. **Add var_alias documentation** to `README.md`
3. **Update research prompt** to include `var_alias` field request
4. **Test prompt generation** with browser console open
5. **Commit changes** with message:
   ```
   fix: Restore generateResearchPrompt function and add var_alias documentation
   
   - Fixed broken AI prompt generation
   - Added var_alias to research prompt template
   - Documented var_alias naming conventions in README
   - Added best practices for code symbol generation
   ```

---

**Priority:** HIGH - Prompt generation is core functionality!
