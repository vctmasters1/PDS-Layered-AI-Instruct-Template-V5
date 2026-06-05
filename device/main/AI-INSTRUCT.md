# Main Directory - AI Instructions

## Directory Purpose

This directory contains **H2O-Tower device application code** - the orchestration layer that ties together reusable pds components.

**Key Principle**: This directory should remain **generic** and work for ANY role without modification. Application-specific logic belongs in the role directory, not here.

## Naming Conventions

This level inherits naming conventions from root `AI-INSTRUCT.md`. Key conventions:
- **Application files**: `pds_{name}.{c,h}` (e.g., `pds_platform_main.c`)
- **Application functions**: `pds_{subsystem}_{action}()` (e.g., `pds_platform_init()`)
- **PDS package code** (from `../pds/`): Uses `pds_` prefix
- **Protocol structs** (wire format): `PDS_TELDATA_*` and `PDS_TELCONF_*` (UPPERCASE)

See root `AI-INSTRUCT.md` for complete naming rules.

## Responsibilities (What Belongs Here)

- Device-specific orchestration logic
- `app_main()` and initialization sequence
- Main event loop timing/coordination
- Device-specific configuration aggregation
- Integration glue code between pds components

## What Does NOT Belong Here

- HAL drivers → `../pds/pds_hal/`
- Network stack → `../pds/pds_network/`
- Storage layer → `../pds/pds_storage/`
- Pipeline engine / function blocks → `../pds/pds_pipeline/`
- Validation utilities → `../pds/pds_validation/`
- **Application-specific logic** → Role directory (e.g., `../pds/pds_hal/platform/esp32c3_sm/hwrev_001/h2o_001/pds_process_action.c`)

## Integration Pattern

The main entry point resides in `main.c` as `app_main()`. This function:
1. Initializes NVS flash
2. Loads persistent configuration from pds storage components
3. Initializes pds subsystems (telemetry, HAL, control, network)
4. Calls `pds_role_init()` once at startup — this is role-specific and lives in the role directory
5. Runs the main event loop, driving `pds_pipeline_engine_tick()` for all automation logic

## Key Points

- **main.c must remain generic**: It should NOT contain role-specific automation logic, sensor processing, or actuator control
- **Role-specific behavior**: The only role hook is `pds_role_init()` in `pds_process_action.c` within the role directory. It loads usrset defaults and registers the telemetry provider.
- **Automation logic**: Composed as function blocks in the PDS Role Editor and uploaded as binary blobs; `pds_pipeline_engine_tick()` drives execution in the loop
- **This design allows**: Same firmware binary to support multiple roles by changing which `pds_process_action.c` is compiled — there is NO `pds_pins.c`, pin assignments are hw_vars blobs (Layer 2)


## File Naming

- **main.c**: Entry point — stays as `main.c`
- **New application files**: Use `pds_{name}.{c,h}` pattern
- **Example**: `pds_platform_main.c`, `pds_platform_config.c`

## ESP-IDF Component Manager (`idf_component.yml`)

Some ESP-IDF components were removed from the bundled IDF tree in v5.x and moved to the
Espressif component registry. They must be declared in `Device/main/idf_component.yml` so
the component manager fetches them at build time.

**Known managed components required by this project**:

| Component | `idf_component.yml` key | Source |
|-----------|------------------------|--------|
| mDNS | `espressif/mdns` | Espressif registry (`>=1.3.2`) |
| LED Strip | `espressif/led_strip` | Vendored locally at `Device/pds/led_strip/` — registry API broken |

**led_strip is vendored**: The Espressif component registry API returns errors for `led_strip`.
The component is cloned from `idf-extra-components` and lives at `Device/pds/led_strip/`.
`idf_component.yml` declares it as `path: ../pds/led_strip` (local path, no registry needed).
Do NOT change this to a registry version spec.

**Note**: The container build copies `/src/main` → `/build/main` and `/src/pds` → `/build/pds`,
so the local path resolves correctly at build time.

