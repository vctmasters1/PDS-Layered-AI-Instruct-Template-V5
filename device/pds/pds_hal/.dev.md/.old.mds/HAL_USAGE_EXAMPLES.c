/**
 * PDS HAL Usage Examples
 * 
 * This file demonstrates best practices for using the consolidated PDS HAL.
 * Copy patterns from here into your application code.
 */

#include "pds_hal.h"
#include "esp_log.h"

static const char* TAG = "HAL_EXAMPLES";

/* ============================================================================
 * EXAMPLE 1: Basic Initialization
 * ============================================================================ */

void example_basic_init(void)
{
    ESP_LOGI(TAG, "Example 1: Basic HAL initialization");
    
    // Initialize all enabled subsystems for this platform
    esp_err_t ret = pds_hal_init();
    
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "HAL initialization failed: %s", esp_err_to_name(ret));
        return;
    }
    
    // At this point, all subsystems are initialized and ready
    ESP_LOGI(TAG, "All HAL subsystems initialized successfully");
}

/* ============================================================================
 * EXAMPLE 2: Checking Platform Capabilities
 * ============================================================================ */

void example_capability_check(void)
{
    ESP_LOGI(TAG, "Example 2: Runtime capability checking");
    
    // Get platform information
    const char* platform = pds_hal_get_platform();
    const char* hwrev = pds_hal_get_hwrev();
    ESP_LOGI(TAG, "Running on %s (hwrev: %s)", platform, hwrev);
    
    // Check if specific subsystems are available
    if (pds_hal_is_available("MOTOR_DRV8833")) {
        ESP_LOGI(TAG, "Motor driver available - mist pump control enabled");
    } else {
        ESP_LOGI(TAG, "Motor driver not available - skipping pump control");
    }
    
    if (pds_hal_is_available("ADC")) {
        ESP_LOGI(TAG, "ADC available - sensor readings enabled");
    }
    
    if (pds_hal_is_available("SPI")) {
        ESP_LOGI(TAG, "SPI available - external device communication enabled");
    }
}

/* ============================================================================
 * EXAMPLE 3: Conditional Motor Driver Control
 * ============================================================================ */

void example_motor_control(void)
{
    ESP_LOGI(TAG, "Example 3: Motor control with platform awareness");
    
    // Only compile and execute motor code if DRV8833 is available
    #if PDS_HAL_HAS_MOTOR_DRV8833
    
    // At compile time, we know motor driver is available
    pds_motor_config_t motor_config = {
        .pwm_frequency = 5000,
        .pwm_resolution_bits = 10,
        .enable_current_limiting = false,
    };
    
    if (pds_motor_drv8833_init(&motor_config) == ESP_OK) {
        // Start mist pump forward at 75% speed
        pds_motor_set_speed_percent(PDS_MOTOR_CHANNEL_A, 75);
        pds_motor_set_mode(PDS_MOTOR_CHANNEL_A, PDS_MOTOR_MODE_FORWARD);
        ESP_LOGI(TAG, "Mist pump started");
    }
    
    #else
    
    // Motor driver not available on this platform
    ESP_LOGI(TAG, "Motor driver not available on this platform");
    
    #endif
}

/* ============================================================================
 * EXAMPLE 4: Flexible Motor Control (Runtime Check)
 * ============================================================================ */

void example_flexible_motor_control(void)
{
    ESP_LOGI(TAG, "Example 4: Flexible motor control with runtime check");
    
    if (pds_hal_is_available("MOTOR_DRV8833")) {
        // Motor driver available - use it
        pds_motor_config_t motor_config = {
            .pwm_frequency = 5000,
            .pwm_resolution_bits = 10,
            .enable_current_limiting = false,
        };
        pds_motor_drv8833_init(&motor_config);
        pds_motor_set_speed_percent(PDS_MOTOR_CHANNEL_A, 50);
        ESP_LOGI(TAG, "Using motor driver for pump control");
        
    } else if (pds_hal_is_available("PWM")) {
        // Motor driver not available, but PWM is - use relay with GPIO
        ESP_LOGI(TAG, "Using GPIO relay for pump control");
        // Direct GPIO or simple PWM control here
        
    } else {
        // No motor control available
        ESP_LOGE(TAG, "No motor control available on this platform");
    }
}

/* ============================================================================
 * EXAMPLE 5: ADC Sensor Reading
 * ============================================================================ */

void example_adc_reading(void)
{
    ESP_LOGI(TAG, "Example 5: ADC sensor reading");
    
    #if PDS_HAL_HAS_ADC
    
    // Configure ADC channel for water level sensor
    esp_err_t ret = PDS_ADC_configure(
        3,                          // ADC channel (GPIO 3 on ESP32-C3)
        PDS_ADC_ATTEN_11DB,        // 0-3.9V range
        PDS_ADC_WIDTH_12BIT         // 0-4095 steps
    );
    
    if (ret == ESP_OK) {
        // Read sensor value
        int32_t raw_value = PDS_ADC_read_raw(3);
        if (raw_value >= 0) {
            ESP_LOGI(TAG, "Water level ADC: %ld (0-4095)", raw_value);
        }
    }
    
    #else
    
    ESP_LOGW(TAG, "ADC not available on this platform");
    
    #endif
}

/* ============================================================================
 * EXAMPLE 6: Multiple Subsystems with Error Handling
 * ============================================================================ */

void example_multi_subsystem(void)
{
    ESP_LOGI(TAG, "Example 6: Multiple subsystems");
    
    // Use ADC for sensor readings
    #if PDS_HAL_HAS_ADC
    {
        int32_t water_level = PDS_ADC_read_raw(3);
        ESP_LOGI(TAG, "Water level: %ld", water_level);
    }
    #endif
    
    // Use PWM for fan control
    #if PDS_HAL_HAS_PWM
    {
        PDS_PWM_setup_channel(8, 1000, 10);  // 1kHz, 10-bit (0-1023)
        PDS_PWM_set_duty_percent(8, 50);     // 50% speed
        ESP_LOGI(TAG, "Fan running at 50%");
    }
    #endif
    
    // Use GPIO for relay control
    #if PDS_HAL_HAS_GPIO
    {
        PDS_GPIO_configure(2, PDS_GPIO_MODE_OUTPUT, PDS_GPIO_PULL_NONE);
        PDS_GPIO_write(2, 1);  // Turn on relay
        ESP_LOGI(TAG, "Relay activated");
    }
    #endif
    
    // Use motor driver if available
    #if PDS_HAL_HAS_MOTOR_DRV8833
    {
        pds_motor_config_t cfg = {.pwm_frequency = 5000, .pwm_resolution_bits = 10};
        pds_motor_drv8833_init(&cfg);
        pds_motor_set_speed_percent(PDS_MOTOR_CHANNEL_A, 75);
        ESP_LOGI(TAG, "Pump running at 75%");
    }
    #endif
}

/* ============================================================================
 * EXAMPLE 7: Application Main Loop Pattern
 * ============================================================================ */

typedef struct {
    int32_t water_level;
    uint32_t pump_speed;
    bool relay_active;
} system_state_t;

system_state_t g_system_state = {0};

void example_main_loop_setup(void)
{
    ESP_LOGI(TAG, "Example 7: Application main loop setup");
    
    // Initialize HAL subsystems
    if (pds_hal_init() != ESP_OK) {
        ESP_LOGE(TAG, "Failed to initialize HAL");
        return;
    }
    
    ESP_LOGI(TAG, "Setup complete. Ready for main loop");
}

void example_main_loop_iteration(void)
{
    // Read sensors
    #if PDS_HAL_HAS_ADC
    g_system_state.water_level = PDS_ADC_read_raw(3);
    #endif
    
    // Evaluate conditions and control actuators
    if (g_system_state.water_level < 1000) {
        // Water level low - activate pump
        #if PDS_HAL_HAS_MOTOR_DRV8833
        pds_motor_set_speed_percent(PDS_MOTOR_CHANNEL_A, 80);
        pds_motor_set_mode(PDS_MOTOR_CHANNEL_A, PDS_MOTOR_MODE_FORWARD);
        g_system_state.pump_speed = 80;
        #endif
    } else if (g_system_state.water_level > 3500) {
        // Water level high - deactivate pump
        #if PDS_HAL_HAS_MOTOR_DRV8833
        pds_motor_stop_all(PDS_MOTOR_MODE_COAST);
        g_system_state.pump_speed = 0;
        #endif
    }
    
    // Control relay based on time of day
    if (is_night_time()) {
        #if PDS_HAL_HAS_GPIO
        PDS_GPIO_write(2, 0);  // Turn off lighting relay
        g_system_state.relay_active = false;
        #endif
    } else {
        #if PDS_HAL_HAS_GPIO
        PDS_GPIO_write(2, 1);  // Turn on lighting relay
        g_system_state.relay_active = true;
        #endif
    }
}

// Helper function (not part of HAL)
bool is_night_time(void)
{
    // Placeholder
    return false;
}

/* ============================================================================
 * EXAMPLE 8: Platform-Agnostic Driver Library
 * ============================================================================ */

/**
 * A library function that works on any platform
 * by using only universally-available subsystems
 */
void example_universal_library_function(void)
{
    ESP_LOGI(TAG, "Example 8: Platform-agnostic library");
    
    // This code works on any platform because GPIO is universal
    #if PDS_HAL_HAS_GPIO
    
    PDS_GPIO_configure(5, PDS_GPIO_MODE_OUTPUT, PDS_GPIO_PULL_NONE);
    PDS_GPIO_write(5, 1);
    ESP_LOGI(TAG, "GPIO subsystem available - output set");
    
    #else
    
    ESP_LOGE(TAG, "GPIO not available!");
    
    #endif
}

/**
 * Another library that gracefully degrades
 */
void example_graceful_degradation(void)
{
    ESP_LOGI(TAG, "Example 9: Graceful degradation");
    
    // Try to use motor driver
    if (pds_hal_is_available("MOTOR_DRV8833")) {
        ESP_LOGI(TAG, "Using advanced motor control");
        // Use motor driver features...
        
    } else if (pds_hal_is_available("PWM")) {
        ESP_LOGI(TAG, "Using PWM-based motor control");
        // Use PWM directly...
        
    } else if (pds_hal_is_available("GPIO")) {
        ESP_LOGI(TAG, "Using GPIO-based relay control");
        // Use GPIO on/off control...
        
    } else {
        ESP_LOGE(TAG, "No motor control available");
    }
}

/* ============================================================================
 * EXAMPLE 10: Compile-Time vs Runtime Checks
 * ============================================================================ */

void example_compile_vs_runtime(void)
{
    ESP_LOGI(TAG, "Example 10: Compile-time vs runtime checks");
    
    // COMPILE-TIME CHECK: Motor code not included at all if unavailable
    // Reduces binary size, but must know at build time
    #if PDS_HAL_HAS_MOTOR_DRV8833
    {
        pds_motor_set_speed_percent(PDS_MOTOR_CHANNEL_A, 50);
        ESP_LOGI(TAG, "Compile-time: Motor driver used");
    }
    #endif
    
    // RUNTIME CHECK: Code always included, decision made at runtime
    // Larger binary, but flexible deployment
    if (pds_hal_is_available("MOTOR_DRV8833")) {
        ESP_LOGI(TAG, "Runtime: Motor driver is available");
    } else {
        ESP_LOGI(TAG, "Runtime: Motor driver is NOT available");
    }
}

/* ============================================================================
 * MAIN APPLICATION ENTRY POINT PATTERN
 * ============================================================================ */

void app_main_pattern(void)
{
    // 1. Initialize HAL subsystems
    if (pds_hal_init() != ESP_OK) {
        ESP_LOGE(TAG, "HAL initialization failed");
        return;
    }
    
    // 2. Check what's available (optional logging)
    ESP_LOGI(TAG, "Platform: %s, Hardware: %s", 
        pds_hal_get_platform(), 
        pds_hal_get_hwrev());
    
    // 3. Application initialization
    // ... your app init code ...
    
    // 4. Main loop
    while (1) {
        // ... your main loop code ...
        vTaskDelay(pdMS_TO_TICKS(100));
    }
}

/**
 * Usage summary:
 * 
 * 1. Always start with: #include "pds_hal.h"
 * 2. Early in init: pds_hal_init()
 * 3. Use subsystems directly: PDS_ADC_read_raw(), pds_motor_set_speed_percent(), etc.
 * 4. Wrap platform-specific code in #if PDS_HAL_HAS_* or runtime checks
 * 5. Check platform: pds_hal_is_available() for graceful degradation
 */
