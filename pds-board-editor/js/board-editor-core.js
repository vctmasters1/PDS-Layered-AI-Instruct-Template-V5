// Pinleaf Forge - Core Functions
// Form state and global variables

const form = document.getElementById('boardForm');
let pin_capabilities = [];

// All available capabilities (pin-level functions)
const ALL_CAPABILITIES = ['VIN', 'GND', '3V3', '5V', 'RESET', 'GPIO', 'ADC-1', 'ADC-2', 'PWM', 'UART', 'RXD', 'TXD', 'SPI', 'MISO', 'MOSI', 'SCK', 'I2C', 'SDA', 'SCL', 'CAN', 'RMT', 'INTERRUPT'];

const PIN_GROUPS = ['Power', 'GPIO', 'Communication', 'Analog', 'Special', 'Uncategorized'];
let currentSortColumn = null;
let currentSortDirection = 'asc';

// Initialize event listeners
if (form) {
    form.addEventListener('input', updatePreview);
    form.addEventListener('change', updatePreview);
}
