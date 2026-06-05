package vm.pds.h2o.dev_platforms.abstract

// This file serves as the abstraction layer for device platforms.
// These constants and interfaces define the contract that all specific
// platform implementations (e.g., ESP32-C3, EFR32) must adhere to.

// Pin function types (must match device H2o_pin_function_t enum)
enum class PinFunction(val value: Int, val displayName: String) {
    SYSTEM(0, "System Pin"),
    SYS_STRAP(1, "System Strapping"),
    RESET(2, "Reboot"),
    BRD_BTN1(3, "Board Button 1"),
    BRD_BTN2(4, "Board Button 2"),

    UNASSIGNED(5, "Unassigned"),

    ADC(10, "ADC (Analog Input)"),
    DAC(11, "DAC (Digital to Analog Converter)"),

    PWM(20, "PWM (Pulse Width Modulation)"),

    GPIO_IN(30, "GPIO Input"),
    GPIO_OUT(31, "GPIO Output"),
    GPIO_INT(32, "GPIO Interrupt"),

    I2C_SDA(40, "I2C SDA"),
    I2C_SCL(41, "I2C SCL"),

    UART_TX(50, "UART TX"),
    UART_RX(51, "UART RX"),

    SPI_MOSI(50, "SPI MOSI"),
    SPI_MISO(51, "SPI MISO"),
    SPI_CLK(52, "SPI CLK"),
    SPI_CS(53, "SPI CS"),

    RMT_TX(60, "RMT TX"),
    RMT_RX(61, "RMT RX"),

    // === Other Common Peripherals ===
    ONE_WIRE(70, "1-Wire (e.g., DS18B20)"),

    HALL_SENSOR(80, "Hall Effect Sensor"),

    PULSE_COUNTER(90, "Pulse Counter"),

    TWAI_TX(100, "TWAI/CAN TX"),
    TWAI_RX(101, "TWAI/CAN RX"),

    USB_D_P(110, "USB Data Positive"),
    USB_D_N(111, "USB Data Negative"),

    // keypad (matrix) ------------------
    KP_R0(180, "Keypad Matrix Row-0"),
    KP_R1(181, "Keypad Matrix Row-1"),
    KP_R2(182, "Keypad Matrix Row-2"),
    KP_R3(183, "Keypad Matrix Row-3"),
    KP_R4(184, "Keypad Matrix Row-4"),
    KP_R5(185, "Keypad Matrix Row-5"),

    KP_C0(190, "Keypad Matrix Col-0"),
    KP_C1(191, "Keypad Matrix Col-1"),
    KP_C2(192, "Keypad Matrix Col-2"),
    KP_C3(193, "Keypad Matrix Col-3"),
    KP_C4(194, "Keypad Matrix Col-4"),
    KP_C5(195, "Keypad Matrix Col-5"),

    KP_INT(200, "Keypad Interrupt Pin"),
    KP_POWER(201, "Keypad Power Pin"),
    // ----------------------------------

    TOUCH_X_POS(210, "Touch X - Positive"),
    TOUCH_X_NEG(211, "Touch X - Negative"),
    TOUCH_Y_POS(212, "Touch Y - Positive"),
    TOUCH_Y_NEG(213, "Touch Y - Negative"),

    // === Display / Graphics ===
    LCD_DC(220, "LCD Data/Command"),
    LCD_RST(221, "LCD Reset"),
    LCD_CS(222, "LCD Chip Select"),
    LCD_BL(223, "LCD Backlight"),

    // === Audio ===
    I2S_BCLK(230, "I2S Bit Clock"),
    I2S_WS(231, "I2S Word Select"),
    I2S_DOUT(232, "I2S Data Out"),
    I2S_DIN(233, "I2S Data In"),

    // === Other Specialized ===
    SD_CARD_CLK(240, "SD Card Clock"),
    SD_CARD_CMD(241, "SD Card Command"),
    SD_CARD_DATA0(242, "SD Card Data 0"),
    SD_CARD_DATA1(243, "SD Card Data 1"),
    SD_CARD_DATA2(244, "SD Card Data 2"),
    SD_CARD_DATA3(245, "SD Card Data 3"),

    // === Safety / Control ===
    EMERGENCY_STOP(254, "Emergency Stop Input"),
    WATCHDOG_RESET(255, "Watchdog Reset Input"),
}

// GPIO interrupt types
enum class GpioInterruptType(val value: Int, val displayName: String) {
    DISABLE(0, "Disabled"),
    POSEDGE(1, "Rising Edge"),
    NEGEDGE(2, "Falling Edge"),
    ANYEDGE(3, "Both Edges"),
    LOW_LEVEL(4, "Low Level"),
    HIGH_LEVEL(5, "High Level")
}

// UART baud rate presets
val UART_BAUD_RATES = listOf(
    9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600
)

// UART parity options
enum class UartParity(val value: Int, val displayName: String) {
    DISABLE(0, "None"),
    EVEN(1, "Even"),
    ODD(2, "Odd")
}

// UART stop bits
enum class UartStopBits(val value: Int, val displayName: String) {
    ONE(1, "1 bit"),
    ONE_HALF(2, "1.5 bits"),
    TWO(3, "2 bits")
}

// I2C clock speed presets (Hz)
val I2C_CLOCK_SPEEDS = listOf(
    100000 to "100 kHz (Standard Mode)",
    400000 to "400 kHz (Fast Mode)",
    1000000 to "1 MHz (Fast Mode Plus)"
)

// NOTE: ConditionType, ActionType, and TimerType have been moved to 
// vm.pds.h2o.automation.datamodels to serve as the single source of truth
// for the automation system.

// Pin configuration flags
object PinFlags {
    const val PULL_UP = 1 shl 0      // 0x01
    const val PULL_DOWN = 1 shl 1    // 0x02
    const val ENABLED = 1 shl 2      // 0x04
}

// Common Adc options
enum class AdcCalibration(val value: Int, val displayName: String) {
    NONE(0, "No Calibration"),
    // Add generic types if needed, otherwise platform specific ones can extend or be separate
    DEFAULT(1, "Default Calibration")
}

// Common PWM duty resolution options
// Many platforms support bits 1-14 or 1-16.
enum class PwmDutyResolution(val value: Int, val displayName: String, val maxDuty: Int) {
    BIT_8(8, "8-bit (256 levels)", 255),
    BIT_10(10, "10-bit (1024 levels)", 1023),
    BIT_12(12, "12-bit (4096 levels)", 4095);
    // Platform specific extensions can happen if we use interfaces or just separate enums
}

// Common PWM frequencies
val PWM_FREQUENCY_PRESETS = listOf(
    50 to "50 Hz (Servo Motors)",
    1000 to "1 kHz (LED Dimming)",
    5000 to "5 kHz (Motor Control)",
    25000 to "25 kHz (High-freq PWM)"
)
