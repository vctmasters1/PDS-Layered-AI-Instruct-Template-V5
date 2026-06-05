/**
 * promptGenerator.js
 * Pure function: generates the AI research prompt for a board name.
 * No DOM dependencies.
 */

export function generateBoardPrompt(boardName) {
  const boardId = boardName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  return `I need complete hardware specifications for the "${boardName}" microcontroller development board in JSON format for a board specification editor.

## COMPLETENESS REQUIREMENT
**The pin_capabilities array MUST include every single physical pin on the board. Do not omit any pin. If the board has 20 physical pins total, there must be exactly 20 entries.**

Please provide the JSON object with this structure:

` + '```json' + `
{
  "id": "${boardId}",
  "name": "${boardName}",
  "boardId": "${boardId}",
  "boardAlias": "${boardName}",
  "mcuTarget": "firmware HAL target (e.g. rp2040, stm32f4, esp32c3_sm)",
  "hwrev": "hwrev_001",
  "website": "manufacturer or product page URL",
  "sku": "part number or SKU",
  "description": "Brief description",
  "architecture": "CPU architecture (e.g. ARM Cortex-M0+, RISC-V, Xtensa LX7)",
  "cores": 1,
  "frequency_mhz": 120,
  "ram_kb": 264,
  "flash_kb": 2048,
  "gpio_total": 26,
  "adc_channels": 3,
  "pwm_channels": 16,
  "wifi": null,
  "ble": null,
  "supported_interfaces": ["UART", "SPI", "I2C", "PWM", "ADC"],
  "usb_ports": { "usb1": 1 },
  "system_features": ["USB", "PIO", "DMA"],
  "toolchain": "pico-sdk / Arduino",
  "notes": "Important details or errata",
  "pin_capabilities": [
    { "pin": -1, "header_id": "J1", "physical_pin": "1",  "group": "Power",   "var_alias": "pwr_3v3",  "name": "3.3V",  "capabilities": ["3V3"] },
    { "pin": 0,  "header_id": "J1", "physical_pin": "2",  "group": "GPIO",    "var_alias": "gpio_0",   "name": "GPIO0", "capabilities": ["GPIO", "PWM"] },
    { "pin": 1,  "header_id": "J1", "physical_pin": "3",  "group": "UART",    "var_alias": "uart_tx",  "name": "TX",    "capabilities": ["GPIO", "UART-TX"] },
    { "pin": 2,  "header_id": "J1", "physical_pin": "4",  "group": "UART",    "var_alias": "uart_rx",  "name": "RX",    "capabilities": ["GPIO", "UART-RX"] },
    { "pin": 3,  "header_id": "J1", "physical_pin": "5",  "group": "I2C",     "var_alias": "i2c_sda",  "name": "SDA",   "capabilities": ["GPIO", "I2C-SDA"] },
    { "pin": 4,  "header_id": "J1", "physical_pin": "6",  "group": "I2C",     "var_alias": "i2c_scl",  "name": "SCL",   "capabilities": ["GPIO", "I2C-SCL"] },
    { "pin": 5,  "header_id": "J1", "physical_pin": "7",  "group": "SPI",     "var_alias": "spi_mosi", "name": "MOSI",  "capabilities": ["GPIO", "SPI-MOSI"] },
    { "pin": 6,  "header_id": "J1", "physical_pin": "8",  "group": "SPI",     "var_alias": "spi_miso", "name": "MISO",  "capabilities": ["GPIO", "SPI-MISO"] },
    { "pin": -1, "header_id": "J1", "physical_pin": "9",  "group": "Power",   "var_alias": "pwr_gnd",  "name": "GND",   "capabilities": ["GND"] },
    { "pin": 7,  "header_id": "J2", "physical_pin": "10", "group": "GPIO",    "var_alias": "gpio_7",   "name": "GPIO7", "capabilities": ["GPIO", "ADC"] },
    { "pin": 8,  "header_id": "J2", "physical_pin": "11", "group": "GPIO",    "var_alias": "gpio_8",   "name": "GPIO8", "capabilities": ["GPIO", "ADC"] },
    { "pin": -1, "header_id": "J2", "physical_pin": "12", "group": "Special", "var_alias": "rst",      "name": "RUN",   "capabilities": ["RESET"] },
    { "pin": -1, "header_id": "J2", "physical_pin": "13", "group": "Power",   "var_alias": "pwr_gnd",  "name": "GND",   "capabilities": ["GND"] },
    { "pin": -1, "header_id": "J2", "physical_pin": "14", "group": "Power",   "var_alias": "pwr_vin",  "name": "VSYS",  "capabilities": ["VIN"] }
  ]
}
` + '```' + `

## Field Reference

**id / boardId**: identical lowercase slug
**name / boardAlias**: identical human-readable label
**mcuTarget**: firmware HAL identifier inferred from the chip family
**hwrev**: always "hwrev_001" for first revision

**Per-pin fields**:
- **pin**: integer GPIO number; -1 for VIN, GND, 3V3, 5V, RESET, BOOT pads
- **header_id**: "J1" = left/first header, "J2" = right/second header (top view, CCW)
- **physical_pin**: string position number on the header (1, 2, 3...) — NOT the GPIO number
- **group**: one of "Power", "GPIO", "I2C", "SPI", "UART", "Special"
- **var_alias**: snake_case — e.g. "gpio_4", "i2c_sda", "spi_mosi", "pwr_gnd", "uart_tx", "rst", "boot"
- **name**: human-readable — e.g. "GPIO4", "3.3V", "GND", "TX", "MOSI"

**Physical pin order — top view, counterclockwise**:
- physical_pin 1 = top-left corner (J1), count down the left side, then up the right side (J2)
- physical_pin values increase monotonically: 1, 2, 3... across all headers

**Capabilities** — use only these strings:
- Power: VIN, 5V, 3V3, GND
- Digital: GPIO, INTERRUPT
- Analog: ADC, PWM
- UART: UART-RX, UART-TX
- SPI: SPI-MISO, SPI-MOSI, SPI-SCK
- I2C: I2C-SDA, I2C-SCL
- Other: CAN, RMT
- Special: RESET, BOOT, STRAPPING

Research the official datasheet and pinout diagram for "${boardName}". Return ONLY the JSON object inside one code block — include every physical pin.`
}

/**
 * Generate a sanity-check review prompt from the current board JSON.
 * The AI returns plain text — bullet-point issues, not JSON.
 */
export function generateSanityCheckPrompt(boardJson) {
  return `You are a hardware specification reviewer. Audit the following board specification JSON and report any problems. Be concise — use short bullet points, group by category. If a section looks correct, say "✓ OK". Do not rewrite the JSON.

Check for:
- **Required fields**: id, name, boardId, boardAlias, mcuTarget, hwrev — present and non-empty?
- **gpio_total**: does it match the actual count of GPIO pins in pin_capabilities?
- **adc_channels / pwm_channels**: plausible for this architecture?
- **pin_capabilities completeness**: are there likely missing pins (e.g. header count seems low for the board)?
- **Duplicate physical_pin values**: any two pins sharing the same physical_pin?
- **GPIO numbers (pin field)**: should be -1 for power/ground/special pads; should be a valid integer for GPIO pads
- **var_alias format**: snake_case, no spaces? Consistent naming convention?
- **Capability assignments**: power pins should only have power capabilities (VIN/GND/3V3/5V); GPIO pads should have GPIO; UART-RX/UART-TX for UART direction; I2C-SDA/I2C-SCL for I2C; SPI-MOSI/SPI-MISO/SPI-SCK for SPI; strapping pins should have STRAPPING
- **Duplicate var_alias values**: any two pins sharing the same var_alias?
- **id vs boardId**: should be identical lowercase slug
- **name vs boardAlias**: should be identical human-readable label

Board JSON:
` + '```json' + `
${JSON.stringify(boardJson, null, 2)}
` + '```'
}
