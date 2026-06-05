// Pinleaf Forge - AI Research Prompt Generator

function generateResearchPrompt() {
    const platformName = document.getElementById('platformSearchInput').value.trim();
    
    if (!platformName) {
        alert('?? Please enter a platform name first');
        return;
    }
    
    const prompt = `I need complete hardware specifications for the "${platformName}" microcontroller development board in JSON format for my embedded board specification editor.

Please provide a comprehensive JSON object with the following structure:

\`\`\`json
{
  "boardId": "lowercase-board-id",
  "mcuTarget": "firmware target id (e.g. esp32c3_sm, esp32_node32s)",
  "boardAlias": "${platformName}",
  "website": "manufacturer or product page URL",
  "sku": "part number or SKU",
  "description": "Brief description of the board and use cases",
  "architecture": "CPU architecture name",
  "cores": <number>,
  "frequency_mhz": <number>,
  "ram_kb": <number>,
  "flash_kb": <number>,
  "gpio_total": <number>,
  "adc_channels": <number>,
  "pwm_channels": <number>,
  "wifi": "specification or none",
  "ble": "version or none",
  "supported_interfaces": ["array of interfaces"],
  "usb_ports": {
    "usb1": <count>,
    "usb2": <count>,
    "usb3": <count>,
    "usb4": <count>
  },
  "system_features": ["array of features"],
  "toolchain": "Primary development toolchain",
  "notes": "Important details",
  "pin_capabilities": [
    {
      "pin": <gpio_number or -1 for power>,
      "header_id": "header identifier",
      "physical_pin": "physical pin number",
      "group": "functional group name",
      "var_alias": "variable_alias_name",
      "name": "Full pin name",
      "capabilities": ["array of capabilities"]
    }
  ]
}
\`\`\`

## Critical Requirements:

### 1. Pin Capabilities
- **Include ALL pins** on the development board (power, ground, GPIO, communication)
- **header_id**: Use "J1" for main header, "J2", "J3" for additional headers
- **physical_pin**: Physical pin number on board (1, 2, 3... or PA0, PB1, etc.)
- **pin**: GPIO number (use -1 for power/ground pins like VIN, GND, 3V3, 5V)

### 2. group Field (Functional Grouping)
The **group** field should reflect the **hardware capability** of the pin at the board level. Application-specific grouping happens at the ROLE level.

**Power Pins:**
- \`Power\` - For VIN, 5V, 3V3, GND pins

**Hardware Bus Groups:**
- \`I2C\` - I2C bus pins (SDA, SCL)
- \`SPI\` - SPI bus pins (MOSI, MISO, SCK, CS)
- \`UART\` - UART pins (TX, RX)
- \`CAN\` - CAN bus pins
- \`USB\` - USB data pins

**Capability Groups:**
- \`ADC\` - Pins with analog-to-digital capability
- \`PWM\` - Pins with PWM output capability
- \`GPIO\` - General purpose digital I/O
- \`Special\` - Reset, boot, enable pins

**Examples:**
- GPIO2 is the default I2C SDA → group: \`I2C\`
- GPIO4 has ADC capability → group: \`GPIO\`
- VIN pin → group: \`Power\`
- Reset pin → group: \`Special\`

### 3. var_alias Naming Convention (CRITICAL)
At the **board level**, use **generic capability-based naming**. Specific role assignments happen later at the HWREV/ROLE level.

**Power Pins:**
- \`pwr_vin\` - Input voltage
- \`pwr_5v\` - 5V output
- \`pwr_3v3\` - 3.3V output
- \`pwr_gnd\` - Ground (can suffix with number: pwr_gnd1, pwr_gnd2)

**GPIO Pins (GENERIC — use this for all general-purpose pins):**
- \`gpio_N\` - Use the GPIO number, e.g., \`gpio_0\`, \`gpio_1\`, \`gpio_2\`, etc.
- This maps directly to the hardware GPIO number

**Communication Bus Pins (keep bus identity):**
- \`i2c_sda\` / \`i2c_scl\` - Default I2C bus
- \`i2c1_sda\` / \`i2c1_scl\` - Second I2C bus
- \`spi_mosi\` / \`spi_miso\` / \`spi_sck\` / \`spi_cs\` - Default SPI bus
- \`uart_tx\` / \`uart_rx\` - Default UART
- \`uart1_tx\` / \`uart1_rx\` - Second UART

**Special Pins:**
- \`rst\` - Reset pin
- \`boot\` - Boot mode select
- \`en\` - Enable pin
- \`usb_dp\` / \`usb_dn\` - USB data pins

**Important:** Do NOT assign application-level names like `adc_ph`, `step0_dir`, `gpio_relay`, etc. Those are role-level mappings. At the board level, a GPIO-capable pin on GPIO4 should simply be `gpio_4`.

**Examples:**
- GPIO2 with I2C capability as default SDA → var_alias: \`i2c_sda\`
- GPIO4 with ADC capability → var_alias: \`gpio_4\` (NOT \`adc_ph\`)
- GPIO10 general purpose → var_alias: \`gpio_10\`
- 5V power pin → var_alias: \`pwr_5v\`

### 4. Pin Capabilities Array
Available options:
- Power: VIN, 5V, 3V3, GND
- Digital: GPIO, DIO, INTERRUPT
- Analog: ADC, PWM
- Communication: UART, RXD, TXD, SPI, MISO, MOSI, SCK, I2C, SDA, SCL, CAN
- Special: RESET, RMT, BOOT

Please research the official datasheet for "${platformName}" and provide accurate specifications. Return ONLY the JSON object with no additional explanation or markdown formatting outside the JSON.`;

    const area = document.getElementById('generatedPromptArea');
    const label = area.querySelector('label');
    area.style.display = 'block';
    document.getElementById('promptPreview').textContent = prompt;

    // If running inside VS Code webview, send directly to Copilot via extension
    if (window.__isVSCodeWebview && typeof window.askCopilot === 'function') {
        label.textContent = '⏳ Asking Copilot... please wait';
        label.style.color = '#667eea';

        // Disable button and show spinner while waiting
        const btn = document.getElementById('askCopilotBtn');
        if (btn) {
            btn.disabled = true;
            btn.classList.add('btn-loading');
            btn.textContent = 'Asking Copilot...';
        }

        // Listen for the result (one-time)
        const handler = function(e) {
            window.removeEventListener('copilot-done', handler);
            if (btn) {
                btn.disabled = false;
                btn.classList.remove('btn-loading');
                btn.textContent = '🚀 Ask Copilot';
            }

            if (e.detail.success) {
                label.textContent = '✅ Copilot research complete — form auto-filled!';
                label.style.color = '#28a745';
            } else {
                label.textContent = '❌ ' + (e.detail.error || 'Copilot request failed');
                label.style.color = '#e74c3c';
            }
        };
        window.addEventListener('copilot-done', handler);

        window.askCopilot(prompt);
    } else {
        // Browser fallback: copy to clipboard
        navigator.clipboard.writeText(prompt).then(() => {
            label.textContent = '✅ Prompt copied to clipboard!';
            label.style.color = '#28a745';
        }).catch(() => {
            label.textContent = '⚠️ Could not copy. Select and copy the prompt below manually.';
            label.style.color = '#e67e22';
        });

        const fallbackNote = area.querySelector('.copilot-fallback');
        if (fallbackNote) fallbackNote.style.display = 'block';
    }

    area.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
