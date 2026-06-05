# H2O-Tower Device Architecture Diagram

This document provides visual representations of the device firmware architecture.

---

## System Layer Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    ANDROID CONTROLLER APP                       │
│                    (Kotlin on Android OS)                       │
└──────────────┬──────────────────────────────────────────────────┘
               │
               │ WiFi LAN (HTTP/JSON on port 80)
               │ mDNS: h2o-tower.local
               │
┌──────────────▼──────────────────────────────────────────────────┐
│              H2O-TOWER DEVICE (ESP32-C3)                        │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    APP LAYER (main/)                     │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │ app_main()                                         │  │  │
│  │  │  • Initialize hardware (GPIO, ADC, PWM)          │  │  │
│  │  │  • Load config from NVS                          │  │  │
│  │  │  • Coordinate WiFi/BLE startup                   │  │  │
│  │  │  • Run main event loop (50ms cycles)             │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  │                                                          │  │
│  │  ┌──────────────┬──────────────┬───────────────┐        │  │
│  │  │              │              │               │        │  │
│  │  ▼              ▼              ▼               ▼        │  │
│  │ PINS        PIPELINE        TELEMETRY      TIMERS      │  │
│  │ (Config)    (Actions)       (Sensors)      (Schedule)  │  │
│  │  NVS        Validation                                  │  │
│  │  Save/Load                                              │  │
│  └────────────────────────────────────────────────────────┘  │
│                                ▲                              │
│  ┌─────────────────────────────┴──────────────────────────┐   │
│  │           PROPRIETARY DATA SYSTEM - pds/              │   │
│  │            (Reusable Components)                       │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │                                                        │   │
│  │  ┌─────────────────────────────────────────────────┐  │   │
│  │  │ h2o_network/        (WiFi, HTTP, BLE, mDNS)     │  │   │
│  │  │  • H2o_wifi_init()   ◄─ Startup orchestration   │  │   │
│  │  │  • H2o_ble_*()      ◄─ First-time provisioning  │  │   │
│  │  │  • H2o_http_server_*() ◄─ REST API on port 80  │  │   │
│  │  │  • H2o_mdns_*()     ◄─ Device discovery         │  │   │
│  │  └─────────────────────────────────────────────────┘  │   │
│  │                                                        │   │
│  │  ┌─────────────────────────────────────────────────┐  │   │
│  │  │ h2o_storage/        (NVS, persistence)          │  │   │
│  │  │  • WiFi credentials (encrypted)                 │  │   │
│  │  │  • Pin configuration                            │  │   │
│  │  │  • Automation rules                             │  │   │
│  │  └─────────────────────────────────────────────────┘  │   │
│  │                                                        │   │
│  │  ┌─────────────────────────────────────────────────┐  │   │
│  │  │ h2o_hal/            (Hardware drivers)          │  │   │
│  │  │  • H2o_gpio_*()     ◄─ GPIO in/out             │  │   │
│  │  │  • H2o_adc_*()      ◄─ ADC sampling            │  │   │
│  │  │  • H2o_pwm_*()      ◄─ PWM generation          │  │   │
│  │  │  • H2o_spi_*()      ◄─ SPI communication       │  │   │
│  │  └─────────────────────────────────────────────────┘  │   │
│  │                                                        │   │
│  │  ┌─────────────────────────────────────────────────┐  │   │
│  │  │ h2o_control/        (Action pipeline, timers)   │  │   │
│  │  │  • H2o_pipeline_execute()  ◄─ Data flow engine │  │   │
│  │  │  • H2o_timer_check()       ◄─ Scheduling       │  │   │
│  │  │  • H2o_condition_eval()    ◄─ Logic evaluation │  │   │
│  │  └─────────────────────────────────────────────────┘  │   │
│  │                                                        │   │
│  │  ┌─────────────────────────────────────────────────┐  │   │
│  │  │ h2o_telemetry/      (Data collection, JSON)     │  │   │
│  │  │  • H2o_telemetry_collect() ◄─ Sensor data      │  │   │
│  │  │  • H2o_telemetry_to_json() ◄─ Serialization    │  │   │
│  │  └─────────────────────────────────────────────────┘  │   │
│  │                                                        │   │
│  │  ┌─────────────────────────────────────────────────┐  │   │
│  │  │ h2o_validation/     (Input checks, security)    │  │   │
│  │  │  • H2o_validate_pin_config()                    │  │   │
│  │  │  • H2o_validate_timer_config()                  │  │   │
│  │  │  • H2o_sanitize_json_string()                   │  │   │
│  │  └─────────────────────────────────────────────────┘  │   │
│  │                                                        │   │
│  │  ┌─────────────────────────────────────────────────┐  │   │
│  │  │ h2o_core/           (Types, constants)          │  │   │
│  │  │  • Pin enums (ADC, PWM, GPIO_IN, GPIO_OUT)     │  │   │
│  │  │  • Shared data structures                       │  │   │
│  │  │  • Error codes and constants                    │  │   │
│  │  └─────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │            ESP-IDF & Hardware Layer                      │  │
│  │  (WiFi, BLE, GPIO, ADC, PWM, Timer, UART, etc.)         │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   Peripherals                            │  │
│  │  (Relays, solenoids, pumps, sensors, etc.)              │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Device Boot Flow

```
                         ┌──────────────┐
                         │ ESP32 Powers │
                         │    On        │
                         └──────┬───────┘
                                │
                         ┌──────▼───────┐
                         │ Bootloader   │
                         │ ESP-IDF Init │
                         └──────┬───────┘
                                │
                         ┌──────▼───────┐
                         │ app_main()   │
                         │ Called       │
                         └──────┬───────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
         ┌──────────▼──────────┐  ┌────────▼──────────┐
         │ Initialize GPIO,    │  │ H2o_device_       │
         │ ADC, PWM, timers    │  │  nvs_load()       │
         │ (H2o_hal_*)         │  │ Load config       │
         └──────────┬──────────┘  └────────┬──────────┘
                    │                      │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼──────────┐
                    │ H2o_device_wifi_    │
                    │ init()              │
                    └──────────┬──────────┘
                               │
                   ┌───────────┴───────────┐
                   │                       │
        ┌──────────▼──────────┐  ┌────────▼──────────┐
        │ WiFi Credentials   │  │ WiFi Credentials  │
        │ Found in NVS?      │  │ Not Found         │
        │ YES                │  │ NO                │
        └──────────┬──────────┘  └────────┬──────────┘
                   │                      │
         ┌─────────▼──────┐     ┌────────▼──────────┐
         │ Connect to     │     │ H2o_ble_          │
         │ WiFi (SSID,    │     │ provisioning_     │
         │ Password)      │     │ init()            │
         └────────┬───────┘     │ Start BLE         │
                  │             │ Advertising       │
                  │             └────────┬──────────┘
                  │                      │
                  │             ┌────────▼──────────┐
                  │             │ Wait for Android  │
                  │             │ BLE Connection    │
                  │             │ (Block)           │
                  │             └────────┬──────────┘
                  │                      │
                  │             ┌────────▼──────────┐
                  │             │ Receive SSID/     │
                  │             │ Password via BLE  │
                  │             └────────┬──────────┘
                  │                      │
                  │             ┌────────▼──────────┐
                  │             │ H2o_storage_     │
                  │             │ save_wifi_cred() │
                  │             │ (Encrypt, NVS)   │
                  │             └────────┬──────────┘
                  │                      │
                  │             ┌────────▼──────────┐
                  │             │ Connect to WiFi  │
                  │             └────────┬──────────┘
                  │                      │
                  └──────────┬───────────┘
                             │
                    ┌────────▼──────────┐
                    │ WiFi Connected    │
                    │ & IP Assigned     │
                    └────────┬──────────┘
                             │
                    ┌────────▼──────────┐
                    │ H2o_http_server_  │
                    │ start()           │
                    │ Listen on port 80 │
                    └────────┬──────────┘
                             │
                    ┌────────▼──────────┐
                    │ H2o_mdns_start()  │
                    │ Advertise:        │
                    │ h2o-tower.local   │
                    └────────┬──────────┘
                             │
                    ┌────────▼──────────┐
                    │ Main Event Loop   │
                    │ (50ms cycles)     │
                    │                   │
                    │ • Read ADC        │
                    │ • Eval conditions │
                    │ • Execute actions │
                    │ • Update outputs  │
                    │ • Collect metrics │
                    │ • Handle HTTP req │
                    └───────────────────┘
```

---

## Main Event Loop Detail

```
                    ┌─────────────────────┐
                    │ 50ms Cycle Start    │
                    └──────────┬──────────┘
                               │
        ┌──────────────────────┴──────────────────────┐
        │                                             │
┌───────▼────────┐  ┌──────────────┐  ┌────────────┐ │
│ Read Sensors   │  │ Evaluate     │  │ Execute    │ │
│ • ADC values   │→→│ Conditions   │→→│ Actions    │ │
│ • GPIO inputs  │  │ • Limits     │  │ • Set GPIO │ │
│ • Timing       │  │ • PID        │  │ • Set PWM  │ │
└────────────────┘  │ • Timers     │  │ • Save log │ │
                    └──────────────┘  └────────────┘ │
        │                                             │
        └─────────────────┬──────────────────────────┘
                          │
                    ┌─────▼────────┐
                    │ Every 500ms  │
                    │ (4 cycles):  │
                    │ Collect      │
                    │ telemetry    │
                    └─────┬────────┘
                          │
                    ┌─────▼────────┐
                    │ Check HTTP   │
                    │ requests     │
                    │ (non-block)  │
                    └─────┬────────┘
                          │
                    ┌─────▼────────┐
                    │ Sleep        │
                    │ remainder of │
                    │ cycle        │
                    └─────┬────────┘
                          │
                    ┌─────▼────────┐
                    │ 50ms Cycle   │
                    │ Complete     │
                    └──────────────┘
```

---

## Data Flow: HTTP Request Example

```
Android App (on WiFi LAN)
     │
     ├─→ (discovers device via mDNS)
     │
     ├─→ GET /status HTTP/1.1
     │   Host: h2o-tower.local:80
     │
     │   ┌──────────────────────────────────┐
     │   │ Device Receives HTTP Request     │
     │   └────────────┬─────────────────────┘
     │               │
     │               ├─→ H2o_http_server_init()
     │               │   (registered handler for /status)
     │               │
     │               ├─→ H2o_device_telemetry_collect()
     │               │   ├─→ H2o_hal_adc_read_all()
     │               │   ├─→ H2o_hal_gpio_read_all()
     │               │   ├─→ H2o_device_timer_get_state()
     │               │   └─→ Return H2O_TELDATA_status_t
     │               │
     │               ├─→ H2o_telemetry_to_json()
     │               │   └─→ Return JSON string
     │               │
     │               └─→ httpd_resp_send()
     │
     ◄───────────────┘
     
     HTTP/1.1 200 OK
     Content-Type: application/json
     
     {
       "timestamp_ms": 1702756800000,
       "connected": true,
       "uptime_seconds": 3600,
       "telemetry": [
         {
           "pin_id": 0,
           "functionality": "ADC",
           "value_raw": 2048,
           "value_calibrated": 52.3
         },
         {
           "pin_id": 5,
           "functionality": "PWM",
           "duty_cycle": 75
         }
       ]
     }
```

---

## PDS Component Dependencies

```
                        ┌─────────────────┐
                        │  h2o_core/      │
                        │  (Types, Consts)│
                        └────────┬────────┘
                                 │
                    ┌────────────┼────────────┐
                    │            │            │
            ┌───────▼─┐  ┌──────▼──┐  ┌─────▼─────┐
            │h2o_hal/ │  │h2o_ctrl/│  │h2o_store/ │
            │(Drivers)│  │(Pipeline)│  │(NVS)      │
            └────┬────┘  └────┬─────┘  └─────┬─────┘
                 │            │              │
                 │      ┌─────▼──────┐       │
                 │      │h2o_validation/    │
                 │      │(Validation) │      │
                 │      └─────┬──────┘       │
                 │            │              │
                 └────────────┼──────────────┘
                              │
                    ┌─────────▼─────────┐
                    │ h2o_telemetry/    │
                    │ (Sensor Data)     │
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │ h2o_network/      │
                    │ (WiFi, HTTP, BLE) │
                    │                   │
                    │ • h2o_wifi        │
                    │ • h2o_http_server │
                    │ • h2o_ble_prov    │
                    │ • h2o_mdns        │
                    └───────────────────┘
                              ▲
                              │
                         Depends on
                         all above
                         components
```

---

## Configuration & Persistence Flow

```
              Android App
              (Sends JSON)
                   │
                   ├─→ POST /config
                   │   { "pins": [...], "timers": [...] }
                   │
        ┌──────────▼───────────────┐
        │ H2o_http_server_*()      │
        │ Handler for /config      │
        └──────────┬───────────────┘
                   │
        ┌──────────▼───────────────┐
        │ Parse JSON               │
        │ cJSON_Parse()            │
        └──────────┬───────────────┘
                   │
        ┌──────────▼───────────────┐
        │ H2o_device_validate_     │
        │ config()                 │
        │ • Check ranges           │
        │ • Check conflicts        │
        │ • Validate logic         │
        └──────────┬───────────────┘
                   │
          ┌────────┴─────────┐
          │                  │
      ┌───▼─────┐  ┌────────▼──────┐
      │ INVALID │  │ VALID         │
      └─────────┘  └───────┬───────┘
          │                │
      Return         ┌──────▼──────────┐
      Error          │ H2o_device_nvs_ │
                     │ save_config()   │
                     │ (Encrypt, NVS)  │
                     └───────┬─────────┘
                             │
                     ┌───────▼────────┐
                     │ Config Saved   │
                     │ Persisted      │
                     └─────────────────┘

On Boot:
              ┌──────────────────┐
              │ app_main()       │
              │ called           │
              └────────┬─────────┘
                       │
              ┌────────▼────────┐
              │ H2o_device_nvs_ │
              │ load_config()   │
              │ (Decrypt, NVS)  │
              └────────┬────────┘
                       │
              ┌────────▼────────┐
              │ Restore Pin     │
              │ Configuration   │
              │ to Hardware     │
              └────────────────┘
```

---

## WiFi Connection Flow

```
                   Device Boot
                       │
         ┌─────────────┴─────────────┐
         │                           │
    ┌────▼────┐              ┌──────▼──────┐
    │ WiFi    │              │ WiFi        │
    │ Creds   │              │ Creds       │
    │ in NVS? │              │ NOT in NVS  │
    └────┬────┘              └──────┬──────┘
    YES  │                         │  NO
         │                  ┌──────▼──────────┐
         │                  │ H2o_ble_prov_   │
         │                  │ init()          │
         │                  │ Start BLE       │
         │                  │ Advertising     │
         │                  └──────┬──────────┘
         │                         │
         │                  Android discovers
         │                  "H2O-TOWER-xxxx"
         │                  via BLE scan
         │                         │
         │                  BLE GATT Connect
         │                         │
         │                  ┌──────▼──────────┐
         │                  │ Receive:        │
         │                  │ • SSID          │
         │                  │ • Password      │
         │                  │ • Connect Cmd   │
         │                  └──────┬──────────┘
         │                         │
         │                  Save to NVS
         │                  (Encrypted)
         │                         │
         └──────────┬──────────────┘
                    │
         ┌──────────▼───────────┐
         │ Connect to WiFi      │
         │ (SSID, Password)     │
         └──────────┬───────────┘
                    │
         ┌──────────▼───────────┐
         │ WiFi Connected       │
         │ IP Assigned          │
         └──────────┬───────────┘
                    │
         ┌──────────▼───────────┐
         │ H2o_http_server_init()│
         │ Listen port 80       │
         └──────────┬───────────┘
                    │
         ┌──────────▼───────────┐
         │ H2o_mdns_start()     │
         │ Advertise            │
         │ h2o-tower.local      │
         └──────────┬───────────┘
                    │
         ┌──────────▼───────────┐
         │ Ready for Requests   │
         │ from Android App     │
         └──────────────────────┘
```

---

## File Organization Decision Tree

```
                    I need to add
                    new code...
                         │
             ┌───────────┴───────────┐
             │                       │
      ┌──────▼──────┐        ┌──────▼──────┐
      │ Is it       │        │ Is it       │
      │ device-     │        │ platform-   │
      │ specific    │        │ agnostic    │
      │ aero logic? │        │ & reusable? │
      └──────┬──────┘        └──────┬──────┘
      YES    │                      │    YES
             │                      │
      ┌──────▼──────┐        ┌──────▼──────┐
      │ main/       │        │ Where does  │
      │             │        │ it fit?     │
      │ H2O_device_ │        │             │
      │ {name}.c    │        │             │
      └─────────────┘        └──────┬──────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
            ┌───────▼──────┐ ┌──────▼────┐ ┌──────▼──────┐
            │ Network/     │ │ Hardware  │ │ Storage/    │
            │ WiFi/HTTP?   │ │ drivers?  │ │ NVS/Config? │
            │              │ │           │ │             │
            │ pds/         │ │ pds/      │ │ pds/        │
            │ h2o_network/ │ │ h2o_hal/  │ │ h2o_storage/│
            └──────────────┘ └───────────┘ └─────────────┘
                    │               │
                    └───────┬───────┘
                            │
            File pattern:
            h2o_{module}_{name}.c/h
```

---

This architecture ensures:
- ✅ Clear separation of concerns
- ✅ Reusable components (can be used in other projects)
- ✅ Device-specific logic isolated in `main/`
- ✅ Consistent naming conventions
- ✅ Maintainable and scalable design

