"""
blob_packer.py — Role JSON → L1/L2/L3 binary blobs + NVS partition image

Converts a saved role JSON file (e.g. AERO-002.json) into the binary blobs
the ESP32 firmware reads from NVS at boot:

    Layer 1  ("pipeline")  — pipeline topology: type IDs per pipeline
    Layer 2  ("hw_vars")   — per-block pin assignments (currently only fb_ref)
    Layer 3  ("settings")  — per-block settings_t structs + global header

Outputs to:
    PDS-BuildTools/dist/defaults/<role_id>/
        <role_id>_l1.bin
        <role_id>_l2.bin
        <role_id>_l3.bin
        nvs_defaults.bin   (if nvs_partition_gen is available, else skipped)
        nvs_defaults.csv   (always written — input for manual nvs_partition_gen)

Binary format reference: Device/pds/pds_pipeline/pds_pipeline.c
Struct layouts:          Device/pds/pds_pipeline/pds_fb/include/pds_fb_*.h
Registry sizes:          Device/pds/pds_pipeline/pds_fb/pds_block_registry.c

Usage:
    python blob_packer.py <role_json>                          # auto output dir
    python blob_packer.py <role_json> --output /path/to/dir   # explicit dir
    python blob_packer.py AERO-002                             # looks in saved_roles/
"""

import argparse
import copy
import json
import shutil
import struct
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# ─────────────────────────────────────────────────────────────────────────────
# Constants matching pds_pipeline.h / pds_block_registry.h
# ─────────────────────────────────────────────────────────────────────────────

PDS_PIPELINE_FORMAT_VERSION = 0x01
PDS_PIPELINE_VERSION_DEFAULT = 0x01

# Must match pds_pipeline.h — used to warn when a role exceeds firmware capacity
PDS_MAX_PIPELINES = 16

PDS_SENTINEL_PIPELINE_START = 0x00
PDS_SENTINEL_PIPELINE_END   = 0xFE
PDS_SENTINEL_STREAM_END     = 0xFF

# L3 global header size (bytes before first block settings_t)
_L3_HEADER_SIZE = 9  # matches: const uint8_t *set_ptr = l3 + 9;

# Block type IDs (from pds_block_registry.h) — kept for reference; build_blobs() uses BLOCK_DEFS.
# Blocks marked [stub] have a role-editor definition but no firmware C implementation yet.
TYPE_ID = {
    'sensor_analog':          0x01,
    'sensor_dht22_temp':      0x02,
    'sensor_dht22_humid':     0x03,
    'hmi_toggle':             0x04,
    'hmi_momentary':          0x05,
    'abortable_sub_pipeline': 0x06,   # firmware: hmi_run_routine
    'pipeline_suspend':       0x07,
    'pipeline_resume':        0x08,
    'delay':                  0x0B,
    'sensor_ph':              0x0C,   # power-gated analog pH probe (ADC_PROBE mutex)
    'sensor_ec':              0x0D,   # power-gated analog EC/PPM probe (ADC_PROBE mutex)
    'logic_or':               0x09,   # [stub] defined in firmware enum, no C file yet
    'hmi_initiate':           0x0A,   # [stub] not yet in firmware
    'timer_countdown':        0x10,
    'timer_countup':          0x11,
    'timer_cycle':            0x12,
    'timer_elapsed':          0x13,   # [stub] not yet in firmware
    'timer_tod':              0x14,   # Time-of-Day timer
    'pid_pwm':                0x20,
    'pid':                    0x21,
    'pwm_output':             0x22,
    'gpio_input':             0x30,
    'gpio_output':            0x31,
    'switch_output':          0x31,   # alias for gpio_output
    'gpio_value':             0x32,
    'limit_high':             0x40,
    'limit_low':              0x41,
    'fb_ref':                 0x50,
    'ref':                    0x50,   # alias for fb_ref
    'sensor_value':           0x51,   # [stub] not yet in firmware
    'stepper_a4988_velocity':  0x60,
    'stepper_drv8825_velocity': 0x61,
    'stepper_tb6600_velocity': 0x62,
    'stepper_tmc2209_velocity': 0x63,
    'stepper_tmc2208_velocity': 0x64,
    'stepper_a4988_position':  0x65,
    'stepper_drv8825_position': 0x66,
    'stepper_tb6600_position': 0x67,
    'stepper_tmc2209_position': 0x68,
    'stepper_tmc2208_position': 0x69,
    'servo_set_angle':        0x6A,
    'servo_pid':              0x6B,
    'fan_float':              0x70,
    'fan_bool':               0x71,
    'led_addr':               0x80,
    'all_stop':               0x90,
    'sensor_hx711':           0xA0,
    'encoder_position':       0xA1,
    'encoder_velocity':       0xA2,
    'encoder_mapped':         0xA3,
}

# ─────────────────────────────────────────────────────────────────────────────
# Block definition: struct format + field names + defaults
# ─────────────────────────────────────────────────────────────────────────────
# l2_fmt: struct format for Layer 2 pins_t (empty string = pins_size=0)
# l3_fmt: struct format for Layer 3 settings_t (empty string = settings_size=0)
# Formats use Python struct notation with '<' (little-endian) prefix.
# Padding bytes are represented as 'x' in the format string.
# All field sizes are calculated to match ESP32 natural-alignment C structs.

@dataclass
class BlockDef:
    type_id:    int
    l2_fmt:     str              # '' means pins_size=0
    l2_fields:  List[str] = field(default_factory=list)
    l3_fmt:     str = ''         # '' means settings_size=0
    l3_fields:  List[str] = field(default_factory=list)
    l3_defaults: Dict[str, Any] = field(default_factory=dict)
    # Field name aliases: JSON key → canonical field name
    l3_aliases:  Dict[str, str] = field(default_factory=dict)


# Struct sizes (verified against C header natural alignment on ESP32 / Xtensa 32-bit):
#
#   sensor_analog:   BbHBB?xxffff?xxx  = 1+1+2+1+1+1+2+4+4+4+4+1+3  = 28
#   pid_pwm:         bxxx Ifffffff H??  = 1+3+4+28+2+1+1         = 40
#   timer_countdown: I??xx I?xxx        = 4+1+1+2+4+1+3          = 16
#   timer_countup:   II?xxx I?xxx       = 4+4+1+3+4+1+3          = 20
#   timer_cycle:     IIII?xxx           = 4+4+4+4+1+3            = 20
#   timer_tod:       II?xxx             = 4+4+1+3                =  12
#   gpio_input:      b?H?x              = 1+1+2+1+1              =  6
#   switch_output:   b??                = 1+1+1                  =  3
#   limit_analog:    ff???x             = 4+4+1+1+1+1            = 12
#   fan_float:       ?                  = 1
#   fan_bool:        ?                  = 1
#   stepper_a4988:   bbbbbbHBxxx ff??xx = 6+2+1+3+4+4+1+1+2     = 24
#   stepper_drv8825: bbbbbbb x HBx ff??xx = 7+1+2+1+1+4+4+1+1+2 = 24

BLOCK_DEFS: Dict[str, BlockDef] = {

    'sensor_analog': BlockDef(
        type_id=0x01,
        l2_fmt='',
        # Layout (28 bytes): uint8 adc_channel | int8 pin_power | uint16 sample_interval_ms |
        #                    uint8 oversample_count | bool power_active_low |
        #                    uint16 settling_time_ms | float×4 | bool enabled | 3-pad
        l3_fmt='<BbHB?Hffff?xxx',
        l3_fields=['adc_channel', 'pin_power', 'sample_interval_ms', 'oversample_count',
                   'power_active_low', 'settling_time_ms',
                   'Vmin', 'Vmax', 'scale_min', 'scale_max', 'enabled'],
        l3_defaults={
            'adc_channel': 0, 'pin_power': -1, 'sample_interval_ms': 1000,
            'oversample_count': 4, 'power_active_low': True, 'settling_time_ms': 500,
            'Vmin': 0.0, 'Vmax': 3.3, 'scale_min': 0.0, 'scale_max': 1.0, 'enabled': True,
        },
    ),

    # ── DHT22 sensor blocks (0x02 / 0x03) ────────────────────────────────────
    # Both share pds_fb_dht22_settings_t layout: int8_t pin_data | pad | uint16 sample_interval_ms | bool enabled | pad
    # Struct: <bxH?x = 6 bytes

    'sensor_dht22_temp': BlockDef(
        type_id=0x02,
        l2_fmt='',
        l3_fmt='<bxH?x',
        l3_fields=['pin_data', 'sample_interval_ms', 'enabled'],
        l3_defaults={'pin_data': -1, 'sample_interval_ms': 2000, 'enabled': True},
    ),

    'sensor_dht22_humid': BlockDef(
        type_id=0x03,
        l2_fmt='',
        l3_fmt='<bxH?x',
        l3_fields=['pin_data', 'sample_interval_ms', 'enabled'],
        l3_defaults={'pin_data': -1, 'sample_interval_ms': 2000, 'enabled': True},
    ),

    # ── HMI source blocks (0x04 / 0x05 / 0x06) ───────────────────────────────

    'hmi_toggle': BlockDef(
        # pds_fb_hmi_toggle_settings_t: bool value | bool enabled = 2 bytes
        type_id=0x04,
        l2_fmt='',
        l3_fmt='<??',
        l3_fields=['value', 'enabled'],
        l3_defaults={'value': False, 'enabled': True},
    ),

    'hmi_momentary': BlockDef(
        # pds_fb_hmi_momentary_settings_t: uint16 pulse_ms | bool enabled | pad = 4 bytes
        type_id=0x05,
        l2_fmt='',
        l3_fmt='<H?x',
        l3_fields=['pulse_ms', 'enabled'],
        l3_defaults={'pulse_ms': 500, 'enabled': True},
    ),

    'abortable_sub_pipeline': BlockDef(
        # Maps to pds_fb_hmi_run_routine_settings_t (firmware id 0x06 = hmi_run_routine)
        # uint32 duration_ms | bool enabled | 3 pad = 8 bytes
        type_id=0x06,
        l2_fmt='',
        l3_fmt='<I?xxx',
        l3_fields=['duration_ms', 'enabled'],
        l3_defaults={'duration_ms': 0, 'enabled': True},
    ),

    # ── Routine-control pass-through blocks (0x07 / 0x08) ────────────────────

    'pipeline_suspend': BlockDef(
        # pds_fb_pipeline_suspend_settings_t: uint8 pipeline_index | bool enabled = 2 bytes
        type_id=0x07,
        l2_fmt='',
        l3_fmt='<B?',
        l3_fields=['pipeline_index', 'enabled'],
        l3_defaults={'pipeline_index': 0, 'enabled': True},
    ),

    'pipeline_resume': BlockDef(
        # pds_fb_pipeline_resume_settings_t: uint8 pipeline_index | bool enabled = 2 bytes
        type_id=0x08,
        l2_fmt='',
        l3_fmt='<B?',
        l3_fields=['pipeline_index', 'enabled'],
        l3_defaults={'pipeline_index': 0, 'enabled': True},
    ),

    # ── Delay (0x0B) ─────────────────────────────────────────────────────────
    # Rising edge on input starts a one-shot timer. After delay_ms the output
    # fires a single pulse. Used to stagger pipeline_resume steps in a routine.
    # Layout (8 bytes):
    #   offset 0: uint32 delay_ms
    #   offset 4: bool   enabled
    #   offset 5-7: pad
    # fmt: '<I?xxx'
    'delay': BlockDef(
        type_id=0x0B,
        l2_fmt='',
        l3_fmt='<I?xxx',
        l3_fields=['delay_ms', 'enabled'],
        l3_defaults={'delay_ms': 1000, 'enabled': True},
    ),

    # ── sensor_ph (0x0C) — power-gated analog pH probe ────────────────────
    # Peripheral-sourced: settings merged from peripherals[] entry at pack time.
    # Layout (36 bytes, natural alignment ESP32):
    #   offset  0: uint8  adc_channel  (JSON: pin_adc — alias mapped below)
    #   offset  1: int8   pin_power
    #   offset  2: uint16 sample_interval_s
    #   offset  4: uint8  oversample
    #   offset  5: uint8  settling_time_s
    #   offset  6: uint8  response_time_s
    #   offset  7: bool   power_active_low
    #   offset  8: float  Vmin
    #   offset 12: float  Vmax
    #   offset 16: float  scale_min
    #   offset 20: float  scale_max
    #   offset 24: float  alarm_low
    #   offset 28: float  alarm_high
    #   offset 32: bool   alarm_enabled
    #   offset 33: bool   enabled
    #   offset 34: [2 pad]
    # fmt: '<BbHBBB?ffffff??xx' = 36 bytes

    'sensor_ph': BlockDef(
        type_id=0x0C,
        l2_fmt='',
        l3_fmt='<BbHBBB?ffffff??xx',
        l3_fields=['adc_channel', 'pin_power', 'sample_interval_s',
                   'oversample', 'settling_time_s', 'response_time_s',
                   'power_active_low',
                   'Vmin', 'Vmax', 'scale_min', 'scale_max',
                   'alarm_low', 'alarm_high',
                   'alarm_enabled', 'enabled'],
        l3_defaults={
            'adc_channel': 0, 'pin_power': -1, 'sample_interval_s': 120,
            'oversample': 4, 'settling_time_s': 60, 'response_time_s': 5,
            'power_active_low': False,
            'Vmin': 0.0, 'Vmax': 3.3, 'scale_min': 0.0, 'scale_max': 14.0,
            'alarm_low': 4.0, 'alarm_high': 8.0,
            'alarm_enabled': True, 'enabled': True,
        },
        l3_aliases={'pin_adc': 'adc_channel',             # peripheral pin slot → struct field
                    'interval': 'sample_interval_s',       # role-editor short name → struct field
                    'settling_time': 'settling_time_s',
                    'response_time': 'response_time_s'},   # peripheral JSON key → C struct field
    ),

    # ── sensor_ec (0x0D) — power-gated analog EC/PPM probe ────────────────
    # Peripheral-sourced: settings merged from peripherals[] entry at pack time.
    # Layout (48 bytes, natural alignment ESP32):
    #   offset  0: uint8  adc_channel  (JSON: pin_adc — alias mapped below)
    #   offset  1: int8   pin_power
    #   offset  2: uint16 sample_interval_s
    #   offset  4: uint8  oversample
    #   offset  5: uint8  settling_time_s
    #   offset  6: uint8  response_time_s
    #   offset  7: bool   power_active_low
    #   offset  8: float  Vmin
    #   offset 12: float  Vmax
    #   offset 16: float  scale_min
    #   offset 20: float  scale_max
    #   offset 24: bool   temp_comp_enabled
    #   offset 25: [3 pad]
    #   offset 28: float  temp_coeff
    #   offset 32: float  temp_reference_c
    #   offset 36: float  alarm_low
    #   offset 40: float  alarm_high
    #   offset 44: bool   alarm_enabled
    #   offset 45: bool   enabled
    #   offset 46: [2 pad]
    # fmt: '<BbHBBB?ffff?xxxffff??xx' = 48 bytes

    'sensor_ec': BlockDef(
        type_id=0x0D,
        l2_fmt='',
        l3_fmt='<BbHBBB?ffff?xxxffff??xx',
        l3_fields=['adc_channel', 'pin_power', 'sample_interval_s',
                   'oversample', 'settling_time_s', 'response_time_s',
                   'power_active_low',
                   'Vmin', 'Vmax', 'scale_min', 'scale_max',
                   'temp_comp_enabled',
                   'temp_coeff', 'temp_reference_c',
                   'alarm_low', 'alarm_high',
                   'alarm_enabled', 'enabled'],
        l3_defaults={
            'adc_channel': 0, 'pin_power': -1, 'sample_interval_s': 60,
            'oversample': 8, 'settling_time_s': 2, 'response_time_s': 2,
            'power_active_low': False,
            'Vmin': 0.0, 'Vmax': 2.3, 'scale_min': 0.0, 'scale_max': 1000.0,
            'temp_comp_enabled': True, 'temp_coeff': 2.0, 'temp_reference_c': 25.0,
            'alarm_low': 400.0, 'alarm_high': 2000.0,
            'alarm_enabled': True, 'enabled': True,
        },
        l3_aliases={'pin_adc': 'adc_channel',             # peripheral pin slot → struct field
                    'interval': 'sample_interval_s',       # role-editor short name → struct field
                    'settling_time': 'settling_time_s',
                    'response_time': 'response_time_s'},   # peripheral JSON key → C struct field
    ),

    # ── Logic blocks (0x09) ───────────────────────────────────────────────────
    # logic_or: enum defined in firmware (0x09) but no C implementation yet.
    # Placeholder: single enabled byte.

    'logic_or': BlockDef(
        type_id=0x09,
        l2_fmt='',
        l3_fmt='<?',
        l3_fields=['enabled'],
        l3_defaults={'enabled': True},
    ),

    # ── HMI initiate (0x0A) — firmware not yet implemented ───────────────────
    # New block in the role editor. Firmware stub TBD.
    # Minimal struct: bool confirm | bool enabled = 2 bytes

    'hmi_initiate': BlockDef(
        type_id=0x0A,
        l2_fmt='',
        l3_fmt='<??',
        l3_fields=['confirm', 'enabled'],
        l3_defaults={'confirm': False, 'enabled': True},
    ),

    'timer_countdown': BlockDef(
        type_id=0x10,
        l2_fmt='',
        l3_fmt='<I??xxI?xxx',
        l3_fields=['duration_ms', 'retrigger', 'any_edge', 'cooldown_ms', 'enabled'],
        l3_defaults={
            'duration_ms': 5000, 'retrigger': False, 'any_edge': False,
            'cooldown_ms': 0, 'enabled': True,
        },
    ),

    'timer_countup': BlockDef(
        type_id=0x11,
        l2_fmt='',
        # mode is enum (int32): 0=EVENTS, 1=HOLD_TIME_MS
        l3_fmt='<II?xxxI?xxx',
        l3_fields=['mode', 'threshold', 'auto_reset', 'hold_duration_ms', 'enabled'],
        l3_defaults={
            'mode': 0, 'threshold': 1, 'auto_reset': False,
            'hold_duration_ms': 0, 'enabled': True,
        },
    ),

    'timer_cycle': BlockDef(
        type_id=0x12,
        l2_fmt='',
        l3_fmt='<IIII?xxx',
        l3_fields=['on_duration_ms', 'off_duration_ms', 'initial_delay_ms',
                   'max_on_count', 'enabled'],
        l3_defaults={
            'on_duration_ms': 3600000, 'off_duration_ms': 3600000,
            'initial_delay_ms': 0, 'max_on_count': 0, 'enabled': True,
        },
        # Support abbreviated field names used by the role editor
        l3_aliases={
            'on_ms':  'on_duration_ms',
            'off_ms': 'off_duration_ms',
        },
    ),

    'timer_elapsed': BlockDef(
        # Edge-triggered countdown. Same struct as timer_countdown.
        # Firmware id 0x13 (not yet implemented — placeholder).
        type_id=0x13,
        l2_fmt='',
        l3_fmt='<I?xxx',
        l3_fields=['duration_ms', 'enabled'],
        l3_defaults={'duration_ms': 5000, 'enabled': True},
    ),

    'timer_tod': BlockDef(
        # Time-of-Day timer. Outputs 1.0 during the configured ON window (local time).
        # tz_offset_min is a system_pref — NOT packed here; written as a separate NVS key.
        # Struct: uint32 on_time_sec | uint32 off_time_sec | bool enabled | 3 pad = 12 bytes
        type_id=0x14,
        l2_fmt='',
        l3_fmt='<II?xxx',
        l3_fields=['on_time_sec', 'off_time_sec', 'enabled'],
        l3_defaults={'on_time_sec': 21600, 'off_time_sec': 79200, 'enabled': True},
    ),

    'pid_pwm': BlockDef(
        type_id=0x20,
        l2_fmt='',
        l3_fmt='<bxxxIfffffffH??',
        l3_fields=['pin_pwm', 'pwm_frequency_hz', 'setpoint',
                   'kp', 'ki', 'kd',
                   'output_min', 'output_max', 'deadband',
                   'sample_interval_ms', 'reverse_acting', 'enabled'],
        l3_defaults={
            'pin_pwm': -1, 'pwm_frequency_hz': 1000, 'setpoint': 0.0,
            'kp': 1.0, 'ki': 0.0, 'kd': 0.0,
            'output_min': 0.0, 'output_max': 100.0, 'deadband': 0.0,
            'sample_interval_ms': 100, 'reverse_acting': False, 'enabled': True,
        },
    ),

    'pid': BlockDef(
        # pds_fb_pid_settings_t: 7 floats | uint16 sample_interval_ms | bool×2 | 4-pad
        # <fffffffH??xxxx = 7*4 + 2 + 1 + 1 + 4 = 36 bytes
        # Note: byte at offset 32 is reserved padding (was setpoint_src_idx — removed).
        # Use encoder_mapped control_point instead to drive setpoint from a physical encoder.
        type_id=0x21,
        l2_fmt='',
        l3_fmt='<fffffffH??xxxx',
        l3_fields=['setpoint', 'kp', 'ki', 'kd', 'output_min', 'output_max', 'deadband',
                   'sample_interval_ms', 'reverse_acting', 'enabled'],
        l3_defaults={
            'setpoint': 0.0, 'kp': 1.0, 'ki': 0.0, 'kd': 0.0,
            'output_min': 0.0, 'output_max': 100.0, 'deadband': 0.0,
            'sample_interval_ms': 100, 'reverse_acting': False, 'enabled': True,
        },
    ),

    'pwm_output': BlockDef(
        # pds_fb_pwm_output_settings_t:
        # int8 pin_pwm | 3 pad | uint32 pwm_frequency_hz | float ratio | float func_min |
        # float func_max | float count_rate_at_full | bool enabled | 3 pad = 28 bytes
        # NOTE: New role format uses output_pin_ref (resolved by pack_role to fill
        #       pin_pwm/pwm_frequency_hz/func_min/func_max/count_rate_at_full before pack).
        type_id=0x22,
        l2_fmt='',
        l3_fmt='<bxxxIffff?xxx',
        l3_fields=['pin_pwm', 'pwm_frequency_hz', 'ratio', 'func_min', 'func_max',
                   'count_rate_at_full', 'enabled'],
        l3_defaults={
            'pin_pwm': -1, 'pwm_frequency_hz': 1000, 'ratio': 100.0,
            'func_min': 0.0, 'func_max': 100.0, 'count_rate_at_full': 0.0,
            'enabled': True,
        },
    ),

    'gpio_input': BlockDef(
        type_id=0x30,
        l2_fmt='',
        # Layout (12 bytes): int8 pin_input | int8 pin_power | uint16 debounce_ms |
        #                    uint16 settling_time_ms | uint16 sample_interval_ms |
        #                    bool active_low | bool power_active_low | bool enabled | 1-pad
        l3_fmt='<bbHHH???x',
        l3_fields=['pin_input', 'pin_power', 'debounce_ms',
                   'settling_time_ms', 'sample_interval_ms',
                   'active_low', 'power_active_low', 'enabled'],
        l3_defaults={
            'pin_input': -1, 'pin_power': -1,
            'debounce_ms': 50, 'settling_time_ms': 500, 'sample_interval_ms': 1000,
            'active_low': False, 'power_active_low': True, 'enabled': True,
        },
        l3_aliases={
            'gpio_pin':   'pin_input',   # backward compat: pre-rename saves
            'active_high': 'active_low', # NOTE: value is inverted at resolve time (see _pack_block_settings)
        },
    ),

    'gpio_output': BlockDef(
        type_id=0x31,
        l2_fmt='',
        l3_fmt='<b??',
        l3_fields=['pin_output', 'active_low', 'enabled'],
        l3_defaults={
            'pin_output': -1, 'active_low': False, 'enabled': True,
        },
    ),

    'switch_output': BlockDef(   # firmware alias for gpio_output
        type_id=0x31,
        l2_fmt='',
        l3_fmt='<b??',
        l3_fields=['pin_output', 'active_low', 'enabled'],
        l3_defaults={
            'pin_output': -1, 'active_low': False, 'enabled': True,
        },
    ),

    'gpio_value': BlockDef(
        # Cross-pipeline GPIO input reference.
        # Consumes the pre-debounced bool state from a gpio_input block in a sensor pipeline.
        # Layout: uint8 pipeline_idx | uint8 block_idx | bool enabled | 1-pad = 4 bytes
        type_id=0x32,
        l2_fmt='',
        l3_fmt='<BB?x',
        l3_fields=['pipeline_idx', 'block_idx', 'enabled'],
        l3_defaults={'pipeline_idx': 0, 'block_idx': 0, 'enabled': True},
    ),

    'limit_high': BlockDef(
        type_id=0x40,
        l2_fmt='',
        l3_fmt='<ff???x',
        l3_fields=['threshold', 'hysteresis', 'trip_on_high', 'alarm_enabled', 'enabled'],
        l3_defaults={
            'threshold': 0.0, 'hysteresis': 0.0,
            'trip_on_high': True, 'alarm_enabled': False, 'enabled': True,
        },
    ),

    'limit_low': BlockDef(
        type_id=0x41,
        l2_fmt='',
        l3_fmt='<ff???x',
        l3_fields=['threshold', 'hysteresis', 'trip_on_high', 'alarm_enabled', 'enabled'],
        l3_defaults={
            'threshold': 0.0, 'hysteresis': 0.0,
            'trip_on_high': False, 'alarm_enabled': False, 'enabled': True,
        },
    ),

    'fb_ref': BlockDef(
        type_id=0x50,
        # pins_size=1: source_block_idx stored in Layer 2
        l2_fmt='<B',
        l2_fields=['source_block_idx'],
        l3_fmt='',   # settings_size=0
    ),

    'ref': BlockDef(
        # Alias for fb_ref (same struct, same firmware type_id 0x50)
        type_id=0x50,
        l2_fmt='<B',
        l2_fields=['source_block_idx'],
        l3_fmt='',
    ),

    'sensor_value': BlockDef(
        # Cross-pipeline sensor reference. Firmware type 0x51 not yet implemented.
        # Encodes a uint8 sensor_ref index. JSON 'sensor_ref' is resolved to an index
        # by the role encoder before calling build_blobs().
        # Placeholder: uint8 sensor_index | bool enabled = 2 bytes
        type_id=0x51,
        l2_fmt='',
        l3_fmt='<B?',
        l3_fields=['sensor_index', 'enabled'],
        l3_defaults={'sensor_index': 0, 'enabled': True},
    ),

    'fan_float': BlockDef(
        type_id=0x70,
        l2_fmt='',
        l3_fmt='<?',
        l3_fields=['enabled'],
        l3_defaults={'enabled': True},
    ),

    'fan_bool': BlockDef(
        type_id=0x71,
        l2_fmt='',
        l3_fmt='<?',
        l3_fields=['enabled'],
        l3_defaults={'enabled': True},
    ),

    # ── Addressable LED output ─────────────────────────────────────────────
    # Layout: int8 pin_data | uint8 led_type | uint16 num_leds |
    #         uint8×5 (r,g,b,w,brightness) | bool enabled = 10 bytes

    'led_addr': BlockDef(
        type_id=0x80,
        l2_fmt='',
        l3_fmt='<bBHBBBBB?',
        l3_fields=['pin_data', 'led_type', 'num_leds',
                   'color_r', 'color_g', 'color_b', 'color_w',
                   'brightness', 'enabled'],
        l3_defaults={
            'pin_data': -1, 'led_type': 0, 'num_leds': 1,
            'color_r': 255, 'color_g': 255, 'color_b': 255, 'color_w': 0,
            'brightness': 100, 'enabled': True,
        },
    ),

    # ── System blocks ──────────────────────────────────────────────────────
    # all_stop layout: int8 pin_input | bool active_low | uint16 debounce_ms |
    #                  bool enabled | 1-pad = 6 bytes (same layout as gpio_input)

    'all_stop': BlockDef(
        type_id=0x90,
        l2_fmt='',
        l3_fmt='<b?H?x',
        l3_fields=['pin_input', 'active_low', 'debounce_ms', 'enabled'],
        l3_defaults={
            'pin_input': -1, 'active_low': True,   # NC button: trigger on LOW
            'debounce_ms': 50, 'enabled': True,
        },
    ),

    # ── HX711 24-bit load-cell ADC (0xA0) ─────────────────────────────────
    # Layout (20 bytes):
    #   offset  0: int8   pin_clk
    #   offset  1: int8   pin_dat
    #   offset  2: uint8  gain              128 | 64 | 32
    #   offset  3: bool   enabled
    #   offset  4: uint16 sample_interval_ms
    #   offset  6: 2-pad
    #   offset  8: int32  tare_raw
    #   offset 12: float  scale_factor
    #   offset 16: float  scale_offset
    # blob_packer fmt: '<bbB?Hxxiff'  = 20 bytes

    'sensor_hx711': BlockDef(
        type_id=0xA0,
        l2_fmt='',
        l3_fmt='<bbB?Hxxiff',
        l3_fields=['pin_clk', 'pin_dat', 'gain', 'enabled',
                   'sample_interval_ms', 'tare_raw', 'scale_factor', 'scale_offset'],
        l3_defaults={
            'pin_clk': -1, 'pin_dat': -1, 'gain': 128, 'enabled': True,
            'sample_interval_ms': 100, 'tare_raw': 0,
            'scale_factor': 1.0, 'scale_offset': 0.0,
        },
    ),

    # ── Quadrature Encoder — position (0xA1) / velocity (0xA2) ────────────
    # Both block types share the same pds_fb_encoder_settings_t struct.
    # Layout (16 bytes, natural alignment on ESP32):
    #   offset  0: int8   pin_a
    #   offset  1: int8   pin_b
    #   offset  2: int8   pin_index         (-1 = not used)
    #   offset  3: int8   _pad0
    #   offset  4: float  counts_per_rev
    #   offset  8: uint16 velocity_interval_ms
    #   offset 10: bool   active_low
    #   offset 11: bool   reset_on_index
    #   offset 12: bool   invert_direction
    #   offset 13: bool   enabled
    #   offset 14-15: 2 pad bytes (struct rounds to float alignment = 16 bytes)
    # blob_packer fmt: '<bbbxfH????xx'  = 16 bytes

    'encoder_position': BlockDef(
        type_id=0xA1,
        l2_fmt='',
        l3_fmt='<bbbBfH????bx',
        l3_fields=['pin_a', 'pin_b', 'pin_index', 'pull',
                   'counts_per_rev', 'velocity_interval_ms',
                   'active_low', 'reset_on_index', 'invert_direction', 'enabled',
                   'pin_gnd'],
        l3_defaults={
            'pin_a': -1, 'pin_b': -1, 'pin_index': -1,
            'pull': 1,  # 0=none, 1=pull-up, 2=pull-down
            'counts_per_rev': 1000.0, 'velocity_interval_ms': 200,
            'active_low': False, 'reset_on_index': False,
            'invert_direction': False, 'enabled': True,
            'pin_gnd': -1,
        },
    ),
    'encoder_velocity': BlockDef(
        type_id=0xA2,
        l2_fmt='',
        l3_fmt='<bbbBfH????bx',
        l3_fields=['pin_a', 'pin_b', 'pin_index', 'pull',
                   'counts_per_rev', 'velocity_interval_ms',
                   'active_low', 'reset_on_index', 'invert_direction', 'enabled',
                   'pin_gnd'],
        l3_defaults={
            'pin_a': -1, 'pin_b': -1, 'pin_index': -1,
            'pull': 1,  # 0=none, 1=pull-up, 2=pull-down
            'counts_per_rev': 1000.0, 'velocity_interval_ms': 200,
            'active_low': False, 'reset_on_index': False,
            'invert_direction': False, 'enabled': True,
            'pin_gnd': -1,
        },
    ),
    # ── Encoder Mapped (0xA3) — quadrature base + linear map parameters —————————
    # Layout (36 bytes, natural alignment on ESP32):
    #   offset  0–13: same as encoder_position/velocity (bbbBfH????xx = 16 bytes)
    #   offset 16: float map_in_min
    #   offset 20: float map_in_max
    #   offset 24: float map_out_min
    #   offset 28: float map_out_max
    #   offset 32: bool  clamp
    #   offset 33–35: 3 pad bytes
    # fmt: '<bbbBfH????xxffff?xxx' = 36 bytes
    # ── Encoder Mapped (0xA3) ── 40 bytes ─────────────────────────────────────
    # Layout:
    #   0–13:  bbbBfH????bx  — hardware (pins, pull, counts_per_rev, bools, pin_gnd, pad)
    #   16–35: ffff?xxx      — linear map parameters + clamp + 3-pad
    #   36–39: BBBx          — control_point triple (target_pipeline_idx/block_idx/field_idx + pad)
    # fmt: '<bbbBfH????bxffff?xxxBBBx' = 40 bytes
    # Note: control_point bytes are injected by _resolve_sensor_refs() at pack time.
    'encoder_mapped': BlockDef(
        type_id=0xA3,
        l2_fmt='',
        l3_fmt='<bbbBfH????bxffff?xxxBBBx',
        l3_fields=['pin_a', 'pin_b', 'pin_index', 'pull',
                   'counts_per_rev', 'velocity_interval_ms',
                   'active_low', 'reset_on_index', 'invert_direction', 'enabled',
                   'pin_gnd',
                   'map_in_min', 'map_in_max', 'map_out_min', 'map_out_max', 'clamp',
                   'target_pipeline_idx', 'target_block_idx', 'target_field_idx'],
        l3_defaults={
            'pin_a': -1, 'pin_b': -1, 'pin_index': -1,
            'pull': 1,  # 0=none, 1=pull-up, 2=pull-down
            'counts_per_rev': 1000.0, 'velocity_interval_ms': 200,
            'active_low': False, 'reset_on_index': False,
            'invert_direction': False, 'enabled': True,
            'pin_gnd': -1,
            'map_in_min': 0.0, 'map_in_max': 1000.0,
            'map_out_min': 0.0, 'map_out_max': 100.0,
            'clamp': True,
            'target_pipeline_idx': 0xFF, 'target_block_idx': 0, 'target_field_idx': 0,
        },
    ),

    # ── Stepper drivers ────────────────────────────────────────────────────
    # Velocity and position modes share the same hardware settings struct.
    # Position mode uses max_rpm as the move speed; accel_rpm_s is reserved.
    #
    # A4988 velocity/position: 24 bytes
    # Layout: 6 × int8 pins | uint16 steps_per_rev | uint8 microstep |
    #         3-pad | float max_rpm | float accel_rpm_s | bool×2 | 2-pad

    'stepper_a4988_velocity': BlockDef(
        type_id=0x60,
        l2_fmt='',
        l3_fmt='<bbbbbbHBxxxff??xx',
        l3_fields=['pin_step', 'pin_dir', 'pin_enable',
                   'pin_ms1', 'pin_ms2', 'pin_ms3',
                   'steps_per_rev', 'microstep_divisor',
                   'max_rpm', 'accel_rpm_s',
                   'invert_dir', 'enabled'],
        l3_defaults={
            'pin_step': -1, 'pin_dir': -1, 'pin_enable': -1,
            'pin_ms1': -1, 'pin_ms2': -1, 'pin_ms3': -1,
            'steps_per_rev': 200, 'microstep_divisor': 1,
            'max_rpm': 60.0, 'accel_rpm_s': 0.0,
            'invert_dir': False, 'enabled': True,
        },
    ),
    'stepper_a4988_position': BlockDef(
        type_id=0x65,
        l2_fmt='',
        l3_fmt='<bbbbbbHBxxxff??xx',
        l3_fields=['pin_step', 'pin_dir', 'pin_enable',
                   'pin_ms1', 'pin_ms2', 'pin_ms3',
                   'steps_per_rev', 'microstep_divisor',
                   'max_rpm', 'accel_rpm_s',
                   'invert_dir', 'enabled'],
        l3_defaults={
            'pin_step': -1, 'pin_dir': -1, 'pin_enable': -1,
            'pin_ms1': -1, 'pin_ms2': -1, 'pin_ms3': -1,
            'steps_per_rev': 200, 'microstep_divisor': 1,
            'max_rpm': 60.0, 'accel_rpm_s': 0.0,
            'invert_dir': False, 'enabled': True,
        },
    ),

    # DRV8825: adds pin_fault after pin_ms3 (7 int8 pins → 1 extra byte + 1 pad)
    'stepper_drv8825_velocity': BlockDef(
        type_id=0x61,
        l2_fmt='',
        l3_fmt='<bbbbbbbxHBxff??xx',
        l3_fields=['pin_step', 'pin_dir', 'pin_enable',
                   'pin_ms1', 'pin_ms2', 'pin_ms3', 'pin_fault',
                   'steps_per_rev', 'microstep_divisor',
                   'max_rpm', 'accel_rpm_s',
                   'invert_dir', 'enabled'],
        l3_defaults={
            'pin_step': -1, 'pin_dir': -1, 'pin_enable': -1,
            'pin_ms1': -1, 'pin_ms2': -1, 'pin_ms3': -1, 'pin_fault': -1,
            'steps_per_rev': 200, 'microstep_divisor': 1,
            'max_rpm': 60.0, 'accel_rpm_s': 0.0,
            'invert_dir': False, 'enabled': True,
        },
    ),
    'stepper_drv8825_position': BlockDef(
        type_id=0x66,
        l2_fmt='',
        l3_fmt='<bbbbbbbxHBxff??xx',
        l3_fields=['pin_step', 'pin_dir', 'pin_enable',
                   'pin_ms1', 'pin_ms2', 'pin_ms3', 'pin_fault',
                   'steps_per_rev', 'microstep_divisor',
                   'max_rpm', 'accel_rpm_s',
                   'invert_dir', 'enabled'],
        l3_defaults={
            'pin_step': -1, 'pin_dir': -1, 'pin_enable': -1,
            'pin_ms1': -1, 'pin_ms2': -1, 'pin_ms3': -1, 'pin_fault': -1,
            'steps_per_rev': 200, 'microstep_divisor': 1,
            'max_rpm': 60.0, 'accel_rpm_s': 0.0,
            'invert_dir': False, 'enabled': True,
        },
    ),

    # TB6600: 3 signal pins (step/dir/enable), no microstepping pins
    # Layout: 3 × int8 | 1-pad | uint16 steps_per_rev | uint8 microstep | 1-pad |
    #         float max_rpm | float accel_rpm_s | bool×2 | 2-pad  = 20 bytes
    'stepper_tb6600_velocity': BlockDef(
        type_id=0x62,
        l2_fmt='',
        l3_fmt='<bbbxHBxff??xx',
        l3_fields=['pin_step', 'pin_dir', 'pin_enable',
                   'steps_per_rev', 'microstep_divisor',
                   'max_rpm', 'accel_rpm_s',
                   'invert_dir', 'enabled'],
        l3_defaults={
            'pin_step': -1, 'pin_dir': -1, 'pin_enable': -1,
            'steps_per_rev': 200, 'microstep_divisor': 1,
            'max_rpm': 60.0, 'accel_rpm_s': 0.0,
            'invert_dir': False, 'enabled': True,
        },
    ),
    'stepper_tb6600_position': BlockDef(
        type_id=0x67,
        l2_fmt='',
        l3_fmt='<bbbxHBxff??xx',
        l3_fields=['pin_step', 'pin_dir', 'pin_enable',
                   'steps_per_rev', 'microstep_divisor',
                   'max_rpm', 'accel_rpm_s',
                   'invert_dir', 'enabled'],
        l3_defaults={
            'pin_step': -1, 'pin_dir': -1, 'pin_enable': -1,
            'steps_per_rev': 200, 'microstep_divisor': 1,
            'max_rpm': 60.0, 'accel_rpm_s': 0.0,
            'invert_dir': False, 'enabled': True,
        },
    ),

    # TMC2209: step/dir/enable/uart pins + UART address + current/stealthchop
    # Layout: 4 × int8 | uint8 uart_addr | 1-pad | uint16 × 4 | 2-pad |
    #         float × 2 | bool × 3 | 1-pad = 28 bytes
    'stepper_tmc2209_velocity': BlockDef(
        type_id=0x63,
        l2_fmt='',
        l3_fmt='<bbbbBxHHHHxxff???x',
        l3_fields=['pin_step', 'pin_dir', 'pin_enable', 'pin_uart',
                   'uart_addr',
                   'steps_per_rev', 'microstep_divisor',
                   'run_current_ma', 'hold_current_ma',
                   'max_rpm', 'accel_rpm_s',
                   'stealthchop', 'invert_dir', 'enabled'],
        l3_defaults={
            'pin_step': -1, 'pin_dir': -1, 'pin_enable': -1, 'pin_uart': -1,
            'uart_addr': 0,
            'steps_per_rev': 200, 'microstep_divisor': 16,
            'run_current_ma': 800, 'hold_current_ma': 200,
            'max_rpm': 60.0, 'accel_rpm_s': 0.0,
            'stealthchop': True, 'invert_dir': False, 'enabled': True,
        },
    ),
    'stepper_tmc2209_position': BlockDef(
        type_id=0x68,
        l2_fmt='',
        l3_fmt='<bbbbBxHHHHxxff???x',
        l3_fields=['pin_step', 'pin_dir', 'pin_enable', 'pin_uart',
                   'uart_addr',
                   'steps_per_rev', 'microstep_divisor',
                   'run_current_ma', 'hold_current_ma',
                   'max_rpm', 'accel_rpm_s',
                   'stealthchop', 'invert_dir', 'enabled'],
        l3_defaults={
            'pin_step': -1, 'pin_dir': -1, 'pin_enable': -1, 'pin_uart': -1,
            'uart_addr': 0,
            'steps_per_rev': 200, 'microstep_divisor': 16,
            'run_current_ma': 800, 'hold_current_ma': 200,
            'max_rpm': 60.0, 'accel_rpm_s': 0.0,
            'stealthchop': True, 'invert_dir': False, 'enabled': True,
        },
    ),

    # TMC2208: step/dir/enable/uart pins (no uart_addr), current, stealthchop
    # Layout: 4 × int8 | uint16 × 4 | float × 2 | bool × 3 | 1-pad = 24 bytes
    'stepper_tmc2208_velocity': BlockDef(
        type_id=0x64,
        l2_fmt='',
        l3_fmt='<bbbbHHHHff???x',
        l3_fields=['pin_step', 'pin_dir', 'pin_enable', 'pin_uart',
                   'steps_per_rev', 'microstep_divisor',
                   'run_current_ma', 'hold_current_ma',
                   'max_rpm', 'accel_rpm_s',
                   'stealthchop', 'invert_dir', 'enabled'],
        l3_defaults={
            'pin_step': -1, 'pin_dir': -1, 'pin_enable': -1, 'pin_uart': -1,
            'steps_per_rev': 200, 'microstep_divisor': 16,
            'run_current_ma': 800, 'hold_current_ma': 200,
            'max_rpm': 60.0, 'accel_rpm_s': 0.0,
            'stealthchop': True, 'invert_dir': False, 'enabled': True,
        },
    ),
    'stepper_tmc2208_position': BlockDef(
        type_id=0x69,
        l2_fmt='',
        l3_fmt='<bbbbHHHHff???x',
        l3_fields=['pin_step', 'pin_dir', 'pin_enable', 'pin_uart',
                   'steps_per_rev', 'microstep_divisor',
                   'run_current_ma', 'hold_current_ma',
                   'max_rpm', 'accel_rpm_s',
                   'stealthchop', 'invert_dir', 'enabled'],
        l3_defaults={
            'pin_step': -1, 'pin_dir': -1, 'pin_enable': -1, 'pin_uart': -1,
            'steps_per_rev': 200, 'microstep_divisor': 16,
            'run_current_ma': 800, 'hold_current_ma': 200,
            'max_rpm': 60.0, 'accel_rpm_s': 0.0,
            'stealthchop': True, 'invert_dir': False, 'enabled': True,
        },
    ),
    # ── Servo — Set Angle (0x6A) ─────────────────────────────────────────────
    # settings_t: int8 pin_signal | 1pad | uint16 frequency_hz |
    #   uint16 pulse_min_us | uint16 pulse_max_us | float min_angle |
    #   float max_angle | float target_angle | bool enabled | 3pad  → 24 bytes
    'servo_set_angle': BlockDef(
        type_id=0x6A,
        l2_fmt='',
        l3_fmt='<bxHHHfff?xxx',
        l3_fields=['pin_signal', 'frequency_hz', 'pulse_min_us', 'pulse_max_us',
                   'min_angle', 'max_angle', 'target_angle', 'enabled'],
        l3_defaults={
            'pin_signal':   -1,
            'frequency_hz': 50,
            'pulse_min_us': 1000,
            'pulse_max_us': 2000,
            'min_angle':    0.0,
            'max_angle':    180.0,
            'target_angle': 90.0,
            'enabled':      True,
        },
    ),
    # ── Servo — PID Modulated (0x6B) ─────────────────────────────────────────
    # settings_t: int8 pin_signal | 1pad | uint16 frequency_hz |
    #   uint16 pulse_min_us | uint16 pulse_max_us |
    #   float setpoint | float kp | float ki | float kd |
    #   bool enabled | 3pad  → 28 bytes
    'servo_pid': BlockDef(
        type_id=0x6B,
        l2_fmt='',
        l3_fmt='<bxHHHffff?xxx',
        l3_fields=['pin_signal', 'frequency_hz', 'pulse_min_us', 'pulse_max_us',
                   'setpoint', 'kp', 'ki', 'kd', 'enabled'],
        l3_defaults={
            'pin_signal':   -1,
            'frequency_hz': 50,
            'pulse_min_us': 1000,
            'pulse_max_us': 2000,
            'setpoint':     50.0,
            'kp':           1.0,
            'ki':           0.1,
            'kd':           0.05,
            'enabled':      True,
        },
    ),

}


# ─────────────────────────────────────────────────────────────────────────────
# Internal: flattened block representation after fan expansion
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class _FlatBlock:
    block_type:  str
    settings:    Dict[str, Any]
    l2_overrides: Dict[str, Any] = field(default_factory=dict)   # for fb_ref: {'source_block_idx': N}


def _resolve_field(settings: Dict[str, Any], field_name: str,
                   block_def: BlockDef, default_val: Any) -> Any:
    """Resolve a field value: check aliases, then direct name, then default."""
    # Check canonical name first
    if field_name in settings:
        return settings[field_name]
    # Check if there's a reverse alias mapping (JSON uses shortened names)
    for alias, canonical in block_def.l3_aliases.items():
        if canonical == field_name and alias in settings:
            return settings[alias]
    return default_val


def _pack_block_settings(block_type: str, settings: Dict[str, Any]) -> bytes:
    """Pack a block's settings_t struct into bytes (Layer 3 payload)."""
    bdef = BLOCK_DEFS[block_type]
    if not bdef.l3_fmt:
        return b''

    # Note: sensor_ref → sensor_index and encoder_mapped control_point refs are resolved
    # BEFORE _pack_block_settings is called (in build_blobs_from_pipelines) via
    # _resolve_sensor_refs().  Nothing to do here.

    values = []
    for fname in bdef.l3_fields:
        default = bdef.l3_defaults.get(fname, 0)
        val = _resolve_field(settings, fname, bdef, default)

        # Coerce types to match struct format
        if isinstance(val, bool):
            pass  # struct '?' handles bool directly
        elif isinstance(val, float):
            pass
        elif isinstance(val, str):
            try:
                val = int(val)
            except ValueError:
                val = 0
        values.append(val)

    try:
        return struct.pack(bdef.l3_fmt, *values)
    except struct.error as e:
        raise ValueError(
            f"Struct pack error for block '{block_type}' with values {list(zip(bdef.l3_fields, values))}: {e}"
        )


def _pack_block_pins(block_type: str, l2_data: Dict[str, Any]) -> bytes:
    """Pack a block's pins_t struct into bytes (Layer 2 payload)."""
    bdef = BLOCK_DEFS[block_type]
    if not bdef.l2_fmt:
        return b''

    values = [l2_data.get(f, 0) for f in bdef.l2_fields]
    return struct.pack(bdef.l2_fmt, *values)


# ─────────────────────────────────────────────────────────────────────────────
# Pipeline flattener: JSON → list of _FlatBlock per pipeline
# ─────────────────────────────────────────────────────────────────────────────

def _flatten_pipeline(blocks_json: List[Dict]) -> List[_FlatBlock]:
    """
    Convert a pipeline's block list (from JSON) to a flat ordered list
    of _FlatBlock objects with explicit fb_ref insertions for fan-out.

    Fan block linearization:
        fan_float/fan_bool with N fan_outputs becomes:
            [fan_block, output_0, ref(src=fan_idx), output_1, ref(src=fan_idx), ...]
        The first output connects directly (no ref needed).
        Each subsequent output is preceded by a ref pointing back to the fan block.
    """
    flat: List[_FlatBlock] = []

    for block_json in blocks_json:
        block_type = block_json.get('blockType', '')
        if block_type not in BLOCK_DEFS:
            raise ValueError(
                f"Unknown blockType '{block_type}'. "
                f"Known types: {sorted(BLOCK_DEFS.keys())}"
            )

        settings   = block_json.get('settings', {})
        fan_outputs = block_json.get('fan_outputs', [])

        if fan_outputs:
            # --- Fan block: insert fan, then output blocks with refs ---
            fan_idx = len(flat)   # index of the fan block itself
            flat.append(_FlatBlock(block_type=block_type, settings=settings))

            for i, out_block in enumerate(fan_outputs):
                out_type = out_block.get('blockType', '')
                if out_type not in BLOCK_DEFS:
                    raise ValueError(f"Unknown fan output blockType '{out_type}'")

                if i > 0:
                    # Insert ref pointing back to the fan block
                    flat.append(_FlatBlock(
                        block_type='fb_ref',
                        settings={},
                        l2_overrides={'source_block_idx': fan_idx},
                    ))

                flat.append(_FlatBlock(
                    block_type=out_type,
                    settings=out_block.get('settings', {}),
                ))
        else:
            flat.append(_FlatBlock(block_type=block_type, settings=settings))

    return flat


# ─────────────────────────────────────────────────────────────────────────────
# Blob builders
# ─────────────────────────────────────────────────────────────────────────────

def build_blobs(
    pipelines: List[Dict],
    update_rate_ms: int = 1000,
    pipeline_version: int = PDS_PIPELINE_VERSION_DEFAULT,
) -> Tuple[bytes, bytes, bytes]:
    """
    Build L1, L2, L3 binary blobs from the pipelines list.

    Returns (l1_bytes, l2_bytes, l3_bytes).

    Empty pipelines list → valid minimal blobs:
        L1: 0x01 0x01 0xFF          (header + stream-end sentinel)
        L2: 0x01 0x01               (header only, no pin data)
        L3: 9-byte global header    (no per-block settings)
    """
    # ── Layer 1 — topology stream ─────────────────────────────────────────
    enabled_pipelines = [p for p in pipelines if p.get('enabled', True)]
    if len(enabled_pipelines) > PDS_MAX_PIPELINES:
        import sys
        print(
            f"WARNING: Role has {len(enabled_pipelines)} enabled pipelines but firmware "
            f"supports a maximum of {PDS_MAX_PIPELINES} (PDS_MAX_PIPELINES). "
            f"Pipelines beyond index {PDS_MAX_PIPELINES - 1} will be silently dropped at runtime.",
            file=sys.stderr,
        )

    l1 = bytearray()
    l1.append(PDS_PIPELINE_FORMAT_VERSION)
    l1.append(pipeline_version)

    # ── Layer 2 — pins data ───────────────────────────────────────────────
    l2 = bytearray()
    l2.append(PDS_PIPELINE_FORMAT_VERSION)
    l2.append(pipeline_version)

    # ── Layer 3 — settings + global header ───────────────────────────────
    # Global header: format_version(1) + pipeline_version(1) +
    #                update_rate_ms(4, LE) + ble_enabled(1) + wifi_enabled(1) +
    #                reserved(1)  = 9 bytes
    l3 = bytearray()
    l3.extend(struct.pack('<BBIBBx',
                          PDS_PIPELINE_FORMAT_VERSION,
                          pipeline_version,
                          update_rate_ms,
                          0,   # ble_enabled  — WiFi/BLE credentials excluded from defaults
                          0,   # wifi_enabled
                          ))

    # Pre-build lookup maps for sensor-slot and control_point resolution.
    # All maps traverse enabled pipelines in L1 order (same order as the main pack loop).
    _sensor_slot_map:    Dict[tuple, int] = {}  # (pl_id, blk_idx) → sensor slot
    _pipeline_index_map: Dict[str, int]   = {}  # pipeline_id → 0-based L1 index
    _block_type_map:     Dict[tuple, str] = {}  # (pl_id, blk_idx) → block_type name
    _sensor_reg_count = 0
    for _pl in pipelines:
        if not _pl.get('enabled', True):
            continue
        _pl_id = _pl.get('id', '')
        _pipeline_index_map[_pl_id] = len(_pipeline_index_map)
        for _bi, _fb in enumerate(_flatten_pipeline(_pl.get('blocks', []))):
            _block_type_map[(_pl_id, _bi)] = _fb.block_type
            if _fb.block_type in _SENSOR_REG_BLOCK_TYPES:
                _sensor_slot_map[(_pl_id, _bi)] = _sensor_reg_count
                _sensor_reg_count += 1

    for pipeline in pipelines:
        if not pipeline.get('enabled', True):
            continue

        pipeline_id = pipeline.get('id', '')
        flat_blocks = _flatten_pipeline(pipeline.get('blocks', []))

        # L1: 0x00 [type_id...] 0xFE
        l1.append(PDS_SENTINEL_PIPELINE_START)
        for fb in flat_blocks:
            l1.append(BLOCK_DEFS[fb.block_type].type_id)
        l1.append(PDS_SENTINEL_PIPELINE_END)

        # L2: append pin bytes for each block (in L1 positional order)
        for fb in flat_blocks:
            l2.extend(_pack_block_pins(fb.block_type, fb.l2_overrides or {}))

        # L3: append settings bytes for each block (in L1 positional order)
        for blk_idx, fb in enumerate(flat_blocks):
            resolved = _resolve_sensor_refs(fb.block_type, fb.settings,
                                            pipeline_id, blk_idx, _sensor_slot_map,
                                            _pipeline_index_map, _block_type_map)
            l3.extend(_pack_block_settings(fb.block_type, resolved))

    # L1: stream-end sentinel
    l1.append(PDS_SENTINEL_STREAM_END)

    return bytes(l1), bytes(l2), bytes(l3)


# ─────────────────────────────────────────────────────────────────────────────
# NVS image generation
# ─────────────────────────────────────────────────────────────────────────────

def _generate_partitions_csv(workspace: Path, role_id: str, flash_size_kb: int,
                              app_size_kb: int) -> None:
    """
    Generate Device/main/partitions.csv from role flash settings.

    Fixed overhead layout (all sizes in KB):
      nvs(24) + phy_init(4) + otadata(8) + pds_l1(64) + pds_l2(64) + pds_l3(64) = 228 K
      ota_0 + ota_1 = 2 * app_size_kb
      pds_log = flash_size_kb - 228 - 2*app_size_kb  (uses all remaining space)
    """
    from datetime import date as _date

    ALIGN = 0x1000  # 4 KB
    flash_bytes = flash_size_kb * 1024

    # Fixed offsets
    nvs_off      = 0x9000;  nvs_kb      = 24
    phy_off      = 0xF000;  phy_kb      = 4
    ota0_off     = 0x10000; ota0_kb     = app_size_kb
    ota1_off     = ota0_off + app_size_kb * 1024
    ota1_kb      = app_size_kb
    otadata_off  = ota1_off + app_size_kb * 1024
    otadata_kb   = 8
    l1_off       = otadata_off + otadata_kb * 1024;  l1_kb = 64
    l2_off       = l1_off + 64 * 1024;               l2_kb = 64
    l3_off       = l2_off + 64 * 1024;               l3_kb = 64
    l4_off       = l3_off + 64 * 1024;               l4_kb = 64
    log_off      = l4_off + 64 * 1024
    log_kb       = flash_size_kb - (log_off // 1024)  # remaining flash

    def _h(n): return f"0x{n:X}"

    partitions = [
        ("nvs",      "data", "nvs",    nvs_off,     nvs_kb,      "WiFi creds / usrset"),
        ("phy_init", "data", "phy",    phy_off,      phy_kb,     "RF calibration"),
        ("ota_0",    "app",  "ota_0",  ota0_off,     ota0_kb,    f"App slot A ({app_size_kb} K)"),
        ("ota_1",    "app",  "ota_1",  ota1_off,     ota1_kb,    "App slot B"),
        ("otadata",  "data", "ota",    otadata_off,  otadata_kb, "Boot slot selector"),
        ("pds_l1",   "data", "0x40",   l1_off,       l1_kb,      "L1 pipeline byte stream"),
        ("pds_l2",   "data", "0x41",   l2_off,       l2_kb,      "L2 hw_vars blobs"),
        ("pds_l3",   "data", "0x42",   l3_off,       l3_kb,      "L3 settings blobs"),
        ("pds_l4",   "data", "0x44",   l4_off,       l4_kb,      "L4 ui_params blobs"),
        ("pds_log",  "data", "0x43",   log_off,      log_kb,     "Diagnostic log ring buffer (remaining flash)"),
    ]

    lines = [
        f"# H2o-Tower custom partition table — {flash_size_kb // 1024} MB flash",
        f"# Generated by: PDS-BuildTools / Role Editor (flash_size_kb={flash_size_kb}, app_size_kb={app_size_kb})",
        f"#",
        f"# Offset layout:",
    ]
    for name, _, _, off, kb, desc in partitions:
        lines.append(f"#   {_h(off):<12} {name:<10} ({kb} K{' — ' + desc if desc else ''})")
    lines.append(f"#   {_h(flash_bytes):<12} end        (used: {flash_size_kb} K of {flash_size_kb} K — 0 free)")
    lines.append("#")
    lines.append("# Name,     Type, SubType, Offset,   Size")

    for name, typ, sub, off, kb, _ in partitions:
        lines.append(f"{name+',':<13}{typ+',':<6}{sub+',':<8}{_h(off)+',':<10}{kb}K,")

    csv_path = workspace / "Device" / "main" / "partitions.csv"
    csv_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


# ─────────────────────────────────────────────────────────────────────────────

_NVS_CSV_HEADER = "key,type,encoding,value\n"

def _write_nvs_csv(out_dir: Path, role_id: str,
                    extra_rows: Optional[List[str]] = None,
                    l4_path: Optional[Path] = None) -> Path:
    """Write the NVS CSV file referencing the binary blobs.

    Args:
        extra_rows: Optional additional CSV row strings to append inside pds_config namespace.
        l4_path:    Optional path to L4 ui_params blob; if provided, adds ui_params entry.
    """
    l1_path = out_dir / f"{role_id}_l1.bin"
    l2_path = out_dir / f"{role_id}_l2.bin"
    l3_path = out_dir / f"{role_id}_l3.bin"

    csv_lines = [
        _NVS_CSV_HEADER,
        f"pds_config,namespace,,\n",
        f"pipeline,file,binary,{l1_path.as_posix()}\n",
        f"hw_vars,file,binary,{l2_path.as_posix()}\n",
        f"settings,file,binary,{l3_path.as_posix()}\n",
    ]
    if l4_path is not None:
        csv_lines.append(f"ui_params,file,binary,{l4_path.as_posix()}\n")
    if extra_rows:
        for row in extra_rows:
            csv_lines.append(row.rstrip('\n') + '\n')
    csv_path = out_dir / "nvs_defaults.csv"
    csv_path.write_text("".join(csv_lines), encoding="utf-8")
    return csv_path


def _try_generate_nvs_image(out_dir: Path, csv_path: Path,
                             nvs_size_kb: int = 24) -> bool:
    """
    Attempt to generate nvs_defaults.bin using nvs_partition_gen.

    Tries three locations in order:
    1. Python package: esp_idf_nvs_partition_gen (pip install esp-idf-nvs-partition-gen)
    2. ESP-IDF path from environment variable IDF_PATH
    3. Bundled copy in PDS-BuildTools/scripts/

    Returns True if the image was successfully generated.
    """
    nvs_out = out_dir / "nvs_defaults.bin"
    nvs_size_bytes = nvs_size_kb * 1024

    # Attempt 1: pip-installed package (esp-idf-nvs-partition-gen)
    # Invocation: python -m esp_idf_nvs_partition_gen.nvs_partition_gen generate <in> <out> <size>
    try:
        result = subprocess.run(
            [sys.executable, '-m', 'esp_idf_nvs_partition_gen.nvs_partition_gen',
             'generate', str(csv_path), str(nvs_out), hex(nvs_size_bytes)],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode == 0:
            return True
        # Fallback: try older --input/--output style
        result2 = subprocess.run(
            [sys.executable, '-m', 'esp_idf_nvs_partition_gen.nvs_partition_gen',
             '--input', str(csv_path),
             '--output', str(nvs_out),
             '--size', hex(nvs_size_bytes)],
            capture_output=True, text=True, timeout=30
        )
        if result2.returncode == 0:
            return True
        print(f"  [warn] esp_idf_nvs_partition_gen failed: {result.stderr.strip()}",
              file=sys.stderr)
    except FileNotFoundError:
        pass  # module not installed
    except Exception as e:
        print(f"  [warn] esp_idf_nvs_partition_gen error: {e}", file=sys.stderr)

    # Attempt 2: IDF_PATH environment variable
    import os
    idf_path = os.environ.get('IDF_PATH', '')
    if idf_path:
        tool = Path(idf_path) / 'components' / 'nvs_flash' / \
               'nvs_partition_generator' / 'nvs_partition_generator.py'
        if tool.exists():
            try:
                result = subprocess.run(
                    [sys.executable, str(tool),
                     'generate', str(csv_path), str(nvs_out), hex(nvs_size_bytes)],
                    capture_output=True, text=True, timeout=30
                )
                if result.returncode == 0:
                    return True
                print(f"  [warn] nvs_partition_generator.py failed: {result.stderr.strip()}",
                      file=sys.stderr)
            except Exception as e:
                print(f"  [warn] nvs_partition_generator.py error: {e}", file=sys.stderr)

    # Attempt 3: look for bundled copy in PDS-BuildTools/scripts/
    here = Path(__file__).resolve()
    # PDS-Role/tools/blob_packer.py → go up 2 to workspace root
    workspace = here.parent.parent.parent
    bundled = workspace / 'PDS-BuildTools' / 'scripts' / 'nvs_partition_generator.py'
    if bundled.exists():
        try:
            result = subprocess.run(
                [sys.executable, str(bundled),
                 'generate', str(csv_path), str(nvs_out), hex(nvs_size_bytes)],
                capture_output=True, text=True, timeout=30
            )
            if result.returncode == 0:
                return True
            print(f"  [warn] bundled nvs_partition_generator.py failed: {result.stderr.strip()}",
                  file=sys.stderr)
        except Exception as e:
            print(f"  [warn] bundled nvs_partition_generator.py error: {e}", file=sys.stderr)

    return False


# ─────────────────────────────────────────────────────────────────────────────
# Stepper peripheral reference resolution
# ─────────────────────────────────────────────────────────────────────────────

# Block types whose settings come from the referenced stepper peripheral
_STEPPER_BLOCK_TYPES = {
    'stepper_a4988_velocity', 'stepper_a4988_position',
    'stepper_drv8825_velocity', 'stepper_drv8825_position',
    'stepper_tb6600_velocity', 'stepper_tb6600_position',
    'stepper_tmc2209_velocity', 'stepper_tmc2209_position',
    'stepper_tmc2208_velocity', 'stepper_tmc2208_position',
}

# Block types whose settings come from the referenced servo peripheral
_SERVO_BLOCK_TYPES = {'servo_set_angle', 'servo_pid'}


def _resolve_gpio_input_ref(block_json: Dict, pipeline_idx_by_id: Dict[str, int]) -> None:
    """
    Resolve gpio_value block's input_ref string ("pipeline_id:block_index") into
    integer fields pipeline_idx and block_idx for packing.
    """
    if block_json.get('blockType') != 'gpio_value':
        return
    ref = block_json.get('settings', {}).get('input_ref', '')
    if not ref:
        return
    parts = str(ref).split(':')
    if len(parts) < 2:
        return
    pl_id = parts[0]
    try:
        block_idx = int(parts[1])
    except ValueError:
        block_idx = 0
    pl_idx = pipeline_idx_by_id.get(pl_id, 0)
    block_json.setdefault('settings', {})
    block_json['settings']['pipeline_idx'] = pl_idx
    block_json['settings']['block_idx'] = block_idx


_DHT22_BLOCK_TYPES = {'sensor_dht22_temp', 'sensor_dht22_humid'}


def _resolve_dht22_peripheral_ref(block_json: Dict, periph_by_id: Dict) -> None:
    """
    Merge a DHT22 peripheral's pins + config into the block settings so that
    blob_packer can pack all L3 fields (pin_data, sample_interval_ms, enabled).

    The role editor stores only {'peripheral_id': 'periph_xyz', 'enabled': true}.
    At pack time we look up the peripheral and inject pin_data and sample_interval_ms
    so _pack_block_settings finds them exactly as if they had been entered inline.
    """
    block_type = block_json.get("blockType", "")
    if block_type not in _DHT22_BLOCK_TYPES:
        return

    settings = block_json.get("settings", {})
    periph_id = settings.get("peripheral_id", "")
    if not periph_id:
        return

    periph = periph_by_id.get(periph_id)
    if periph is None:
        print(
            f"  [warn] {block_type}.peripheral_id='{periph_id}' not found in peripherals; "
            f"block will use hardware defaults (pin_data=-1, disabled).",
            file=sys.stderr,
        )
        return

    merged = {}
    merged.update(periph.get("pins", {}))    # pin_data
    merged.update(periph.get("config", {}))  # sample_interval_ms, enabled
    merged["enabled"] = settings.get("enabled", merged.get("enabled", True))
    block_json["settings"] = merged


_ANALOG_PROBE_BLOCK_TYPES = {'sensor_ph', 'sensor_ec'}


def _resolve_analog_probe_peripheral_ref(block_json: Dict, periph_by_id: Dict) -> None:
    """
    Merge a sensor_ph / sensor_ec peripheral's pins + config into the block
    settings so blob_packer can pack all L3 fields.

    The role editor stores only {'peripheral_id': 'periph_xyz', 'enabled': true}.
    At pack time we look up the peripheral and inject pin_adc, pin_power, and all
    calibration/timing fields. The BlockDef l3_aliases map handles pin_adc → adc_channel.
    """
    block_type = block_json.get("blockType", "")
    if block_type not in _ANALOG_PROBE_BLOCK_TYPES:
        return

    settings = block_json.get("settings", {})
    periph_id = settings.get("peripheral_id", "")
    if not periph_id:
        return

    periph = periph_by_id.get(periph_id)
    if periph is None:
        print(
            f"  [warn] {block_type}.peripheral_id='{periph_id}' not found in peripherals; "
            f"block will use hardware defaults.",
            file=sys.stderr,
        )
        return

    merged = {}
    merged.update(periph.get("pins", {}))    # pin_adc, pin_power
    merged.update(periph.get("config", {}))  # interval, oversample, calibration, alarms, …
    merged["enabled"] = settings.get("enabled", merged.get("enabled", True))
    block_json["settings"] = merged


def _resolve_stepper_peripheral_ref(block_json: Dict, periph_by_id: Dict) -> None:
    """
    Merge a stepper peripheral's pins + config into the block settings so that
    blob_packer can pack all L3 fields from a single settings dict.

    The role editor stores only {'peripheral_id': 'periph_xyz', 'enabled': true}.
    At pack time we look up the peripheral and inject all hardware fields so
    _pack_block_settings finds them exactly as if they had been entered inline.
    """
    block_type = block_json.get("blockType", "")
    if block_type not in _STEPPER_BLOCK_TYPES:
        return

    settings = block_json.get("settings", {})
    periph_id = settings.get("peripheral_id", "")
    if not periph_id:
        # No peripheral linked — leave all fields at BlockDef defaults
        return

    periph = periph_by_id.get(periph_id)
    if periph is None:
        print(
            f"  [warn] {block_type}.peripheral_id='{periph_id}' not found in peripherals; "
            f"block will use hardware defaults.",
            file=sys.stderr,
        )
        return

    # Build merged settings: peripheral pins + config override defaults;
    # block-level 'enabled' takes precedence over peripheral 'enabled'.
    merged = {}
    merged.update(periph.get("pins", {}))    # pin_step, pin_dir, etc.
    merged.update(periph.get("config", {}))  # steps_per_rev, max_rpm, currents, …
    merged["enabled"] = settings.get("enabled", merged.get("enabled", True))
    block_json["settings"] = merged


def _resolve_servo_peripheral_ref(block_json: Dict, periph_by_id: Dict) -> None:
    """
    Merge a servo peripheral's pins + config into the block settings so that
    blob_packer can pack all L3 fields (pin_signal, frequency_hz, pulse widths,
    angle limits) from a single settings dict.

    Role editor stores only {'peripheral_id': 'periph_xyz', 'enabled': true}.
    """
    block_type = block_json.get("blockType", "")
    if block_type not in _SERVO_BLOCK_TYPES:
        return

    settings = block_json.get("settings", {})
    periph_id = settings.get("peripheral_id", "")
    if not periph_id:
        return

    periph = periph_by_id.get(periph_id)
    if periph is None:
        print(
            f"  [warn] {block_type}.peripheral_id='{periph_id}' not found in peripherals; "
            f"block will use hardware defaults.",
            file=sys.stderr,
        )
        return

    merged = {}
    merged.update(periph.get("pins", {}))    # pin_signal
    merged.update(periph.get("config", {}))  # frequency_hz, pulse_min_us, pulse_max_us, angles
    merged["enabled"] = settings.get("enabled", merged.get("enabled", True))
    block_json["settings"] = merged


# ─────────────────────────────────────────────────────────────────────────────
# Sensor slot map & sensor_ref resolution
# ─────────────────────────────────────────────────────────────────────────────

# Block types that register into s_sensor_reg[] in firmware (pds_pipeline.c).
# Mirrors: sensor types 0x01-0x03 and encoder source types 0xA1-0xA3.
_SENSOR_REG_BLOCK_TYPES = {
    'sensor_analog', 'dht22_temp', 'dht22_humid',           # 0x01-0x03
    'encoder_position', 'encoder_velocity', 'encoder_mapped', # 0xA1-0xA3
}


def _resolve_sensor_refs(
    block_type: str,
    settings: Dict[str, Any],
    pipeline_id: str,
    block_idx: int,
    slot_map: Dict[tuple, int],
    pipeline_index_map: Optional[Dict[str, int]] = None,
    block_type_map: Optional[Dict[tuple, str]] = None,
) -> Dict[str, Any]:
    """
    Resolve sensor_ref strings (format: "pipeline_id:block_idx:port") to global
    slot indices using the pre-built slot_map.  Also resolves encoder_mapped
    control_point refs (format: "pipeline_id:block_idx:field_name") to the three
    index bytes using pipeline_index_map and block_type_map.
    Returns a copy of settings with the resolved integer fields injected.

    Handles:
      sensor_value   — sensor_ref  → sensor_index
      encoder_mapped — control_point → target_pipeline_idx / target_block_idx / target_field_idx
    """
    if block_type == 'sensor_value' and 'sensor_index' not in settings and 'sensor_ref' in settings:
        ref = str(settings.get('sensor_ref', ''))
        try:
            parts = ref.split(':')
            sl = slot_map.get((parts[0], int(parts[1])), 0) if len(parts) >= 2 else 0
        except (ValueError, IndexError):
            sl = 0
        settings = dict(settings, sensor_index=sl)

    if (block_type == 'encoder_mapped'
            and 'control_point' in settings
            and 'target_pipeline_idx' not in settings
            and pipeline_index_map is not None):
        ref = str(settings.get('control_point', ''))
        parts = ref.split(':') if ref else []
        if len(parts) >= 3:
            try:
                tgt_pl_id   = parts[0]
                tgt_blk_idx = int(parts[1])
                tgt_fld_name = parts[2]
                tgt_pl_idx  = pipeline_index_map.get(tgt_pl_id, 0xFF)
                tgt_blk_type = (block_type_map or {}).get((tgt_pl_id, tgt_blk_idx), '')
                tgt_fld_idx = 0
                if tgt_blk_type and tgt_blk_type in BLOCK_DEFS:
                    try:
                        tgt_fld_idx = BLOCK_DEFS[tgt_blk_type].l3_fields.index(tgt_fld_name)
                    except ValueError:
                        tgt_fld_idx = 0
                settings = dict(settings,
                                target_pipeline_idx=tgt_pl_idx,
                                target_block_idx=tgt_blk_idx,
                                target_field_idx=tgt_fld_idx)
            except (ValueError, IndexError):
                pass

    return settings


# ─────────────────────────────────────────────────────────────────────────────
# Encoder peripheral pin resolution
# ─────────────────────────────────────────────────────────────────────────────

_ENCODER_BLOCK_TYPES = {'encoder_position', 'encoder_velocity', 'encoder_mapped'}


def _resolve_encoder_peripheral_ref(block_json: Dict, periph_by_id: Dict) -> None:
    """
    Merge an encoder peripheral's pins (pin_a, pin_b, pin_index) and config
    (counts_per_rev, velocity_interval_ms, etc.) into encoder_position /
    encoder_velocity / encoder_mapped block settings.

    For encoder_mapped, all peripheral config fields (including map_in_min,
    map_in_max, map_out_min, map_out_max, clamp) are merged the same way.

    The role editor stores only {'peripheral_id': 'periph_xyz', 'enabled': true}.
    At pack time we look up the peripheral and inject all L3 fields so the
    blob_packer finds them exactly as if they had been entered inline.
    """
    block_type = block_json.get("blockType", "")
    if block_type not in _ENCODER_BLOCK_TYPES:
        return

    settings = block_json.get("settings", {})
    periph_id = settings.get("peripheral_id", "")
    if not periph_id:
        return

    periph = periph_by_id.get(periph_id)
    if periph is None:
        print(
            f"  [warn] {block_type}.peripheral_id='{periph_id}' not found in peripherals; "
            f"block will use hardware defaults (pins=-1, disabled).",
            file=sys.stderr,
        )
        return

    merged = {}
    merged.update(periph.get("pins", {}))    # pin_a, pin_b, pin_index, pin_gnd
    merged.update(periph.get("config", {}))  # counts_per_rev, velocity_interval_ms, …
    merged["enabled"] = settings.get("enabled", merged.get("enabled", True))
    # Preserve any block-level fields not sourced from the peripheral (e.g. control_point)
    for key, val in settings.items():
        if key not in ('peripheral_id', 'enabled'):
            merged.setdefault(key, val)
    block_json["settings"] = merged


# ─────────────────────────────────────────────────────────────────────────────
# HX711 peripheral pin resolution
# ─────────────────────────────────────────────────────────────────────────────

def _resolve_hx711_peripheral_ref(
    block_json: Dict, pipeline_periph_id: str, periph_by_id: Dict
) -> None:
    """
    Merge an HX711 peripheral's pins (pin_clk, pin_dat) into the sensor_hx711
    block settings.

    Unlike stepper/servo blocks, the peripheral linkage lives on the *pipeline*
    (pl.peripheral_id), not on the block itself.  The pipeline_periph_id arg
    carries that value down to the per-block resolver.
    """
    if block_json.get("blockType") != "sensor_hx711":
        return
    if not pipeline_periph_id:
        return
    periph = periph_by_id.get(pipeline_periph_id)
    if periph is None:
        print(
            f"  [warn] sensor_hx711 pipeline.peripheral_id='{pipeline_periph_id}' "
            f"not found in peripherals; block will use pin defaults.",
            file=sys.stderr,
        )
        return
    # Inject pin_clk / pin_dat (overrides -1 placeholders stored in the JSON)
    settings = block_json.setdefault("settings", {})
    for pin_name, gpio in periph.get("pins", {}).items():
        settings[pin_name] = gpio


# ─────────────────────────────────────────────────────────────────────────────
# Output pin reference resolution
# ─────────────────────────────────────────────────────────────────────────────

def _resolve_output_pin_ref(block_json: Dict, pin_by_id: Dict) -> None:
    """
    Resolve output-pin string references to concrete hardware fields:
      - pwm_output:   output_pin_ref → pin_pwm, pwm_frequency_hz, func_min/max, count_rate_at_full
      - gpio_output / switch_output: pin_output (string ID) → pin_output (GPIO int)

    This is a denormalization step run at pack time — the role JSON stays
    normalised (each pin definition lives once in output_pins[]).
    """
    block_type = block_json.get("blockType", "")
    settings   = block_json.get("settings", {})

    if block_type == "pwm_output":
        ref_id = settings.get("output_pin_ref", "")
        if not ref_id:
            return  # old-format block already has pin_pwm etc. — leave untouched
        pin = pin_by_id.get(ref_id)
        if pin is None:
            print(
                f"  [warn] pwm_output references unknown output_pin_ref='{ref_id}'; "
                f"block will use defaults (GPIO=-1).",
                file=sys.stderr,
            )
            return
        resolved = dict(settings)
        resolved["pin_pwm"]            = int(pin.get("gpio", -1))
        resolved["pwm_frequency_hz"]   = int(pin.get("frequency", 1000))
        resolved["func_min"]           = float(pin.get("func_min", 0.0))
        resolved["func_max"]           = float(pin.get("func_max", 100.0))
        resolved["count_rate_at_full"] = float(pin.get("count_rate_at_full", 0.0))
        block_json["settings"] = resolved

    elif block_type in ("gpio_output", "switch_output"):
        ref_id = settings.get("pin_output", "")
        if not ref_id or not isinstance(ref_id, str):
            return  # already a GPIO integer — old-format save
        pin = pin_by_id.get(ref_id)
        resolved = dict(settings)
        if pin is None:
            print(
                f"  [warn] {block_type}.pin_output='{ref_id}' not found in output_pins; "
                f"block will use GPIO=-1.",
                file=sys.stderr,
            )
            resolved["pin_output"] = -1
        else:
            resolved["pin_output"] = int(pin.get("gpio", -1))
        block_json["settings"] = resolved


def _resolve_gpio_power_ref(block_json: Dict, pin_by_id: Dict) -> None:
    """
    Resolve pin_power string references (gpio_output_ref type) to GPIO integers.
    Applies to any block type that has a pin_power field (sensor_analog, gpio_input).
    """
    settings = block_json.get("settings", {})
    ref_id   = settings.get("pin_power", "")
    if not ref_id or not isinstance(ref_id, str):
        return  # absent, empty, or already an integer

    pin = pin_by_id.get(ref_id)
    resolved = dict(settings)
    if pin is None:
        print(
            f"  [warn] {block_json.get('blockType', '?')}.pin_power='{ref_id}' "
            f"not found in output_pins; using -1.",
            file=sys.stderr,
        )
        resolved["pin_power"] = -1
    else:
        resolved["pin_power"] = int(pin.get("gpio", -1))
    block_json["settings"] = resolved


# ─────────────────────────────────────────────────────────────────────────────
# Layer 4 (ui_params) blob packer
# ─────────────────────────────────────────────────────────────────────────────

_L4_MAGIC           = 0x50445534  # 'P','D','S','4'
_L4_VERSION         = 1
_L4_DEV_OLED_SSD1306 = 0x01

_OLED_HW_FMT   = '<BbbBHH'       # 8 bytes: i2c_addr, pin_sda, pin_scl, flip, refresh_ms, cycle_ms
_OLED_ELEM_FMT = '<BBBBBBxxff8s24s'  # 48 bytes: type,x,y,font,fmt,width,pad,rmin,rmax,prefix,tel_key
_OLED_MAX_ELEMS   = 8
_OLED_MAX_SCREENS = 2


def _fnv1a(s: str) -> int:
    """FNV-1a 32-bit hash — must match pds_ui_fnv1a() in pds_ui.h."""
    h = 0x811c9dc5
    for b in s.encode('utf-8'):
        h = ((h ^ b) * 0x01000193) & 0xFFFFFFFF
    return h


def _pack_oled_element(elem: Dict) -> bytes:
    """Pack one pds_ui_oled_elem_t (48 bytes)."""
    _type_map = {'none': 0, 'label': 1, 'value': 2, 'sensor value': 2, 'bar': 3, 'hline': 4}
    _font_map = {'6x8': 0, '8x8': 1, '8x16': 2, '16x16': 3}
    _fmt_map  = {
        'f2': 0, 'F2': 0, 'f1': 1, 'F1': 1, 'f0': 2, 'F0': 2,
        'int': 3, 'INT': 3, 'bool': 4, 'BOOL': 4, 'pct': 5, 'PCT': 5,
    }
    elem_type = elem.get('type', 0)
    if isinstance(elem_type, str):
        elem_type = _type_map.get(elem_type.lower(), 0)
    font = elem.get('font', 0)
    if isinstance(font, str):
        font = _font_map.get(font, 0)
    fmt = elem.get('fmt', 0)
    if isinstance(fmt, str):
        fmt = _fmt_map.get(fmt, 0)
    prefix  = elem.get('prefix', '')[:8].encode('utf-8').ljust(8, b'\x00')
    tel_key = elem.get('tel_key', '')[:24].encode('utf-8').ljust(24, b'\x00')
    return struct.pack(
        _OLED_ELEM_FMT,
        int(elem_type),
        int(elem.get('x', 0)),
        int(elem.get('y', 0)),
        int(font),
        int(fmt),
        int(elem.get('width', 0)),
        float(elem.get('range_min', 0.0)),
        float(elem.get('range_max', 100.0)),
        prefix,
        tel_key,
    )


def _pack_oled_device(periph: Dict) -> bytes:
    """
    Pack pds_ui_oled_hw_t + screens[2][8] elements for one OLED peripheral.
    Returns 8 + 2*8*48 = 776 bytes.
    """
    cfg  = periph.get('config', {})
    pins = periph.get('pins', {})
    ui   = periph.get('ui_params', {})

    hw = struct.pack(
        _OLED_HW_FMT,
        int(cfg.get('i2c_addr', 0x3C)) & 0xFF,
        int(pins.get('pin_sda', -1)),
        int(pins.get('pin_scl', -1)),
        1 if cfg.get('flip', False) else 0,
        int(cfg.get('refresh_ms', 250)),
        int(cfg.get('cycle_ms', 0)),
    )

    screens_bytes = b''
    screens = ui.get('screens', [])
    for s_idx in range(_OLED_MAX_SCREENS):
        screen = screens[s_idx] if s_idx < len(screens) else {}
        elements = screen.get('elements', []) if isinstance(screen, dict) else []
        for e_idx in range(_OLED_MAX_ELEMS):
            elem = elements[e_idx] if e_idx < len(elements) else {}
            screens_bytes += _pack_oled_element(elem)

    return hw + screens_bytes


def _resolve_tel_key_for_l4(tel_key: str, periph_by_id: Dict,
                             pipeline_idx_by_id: Dict | None = None) -> str:
    """
    Translate role-editor tel_key strings to firmware-compatible lookup keys.

    Supported translations:
      'periph:<periph_id>:<field>' → 'periph:<pin>:<field>'
          Firmware registers as 'periph:<pin_a>:<field>' (pin number, not ID).
      'cp:<pipeline_id>:<block_idx>:<field>' → 'cp:<pl_numeric_idx>:<block_idx>:<field>'
          Firmware registers as 'cp:<pl_idx>:<blk_idx>:<field>' (numeric indices).
    """
    if tel_key.startswith('periph:'):
        parts = tel_key.split(':', 2)
        if len(parts) != 3:
            return tel_key
        periph_id, field = parts[1], parts[2]
        periph = periph_by_id.get(periph_id)
        if not periph:
            return tel_key  # already pin-number-based or unknown — leave as-is
        pins  = periph.get('pins', {})
        ptype = periph.get('type', '')
        # Primary pin: encoders use pin_a; DHT22 uses pin_data; HX711 uses pin_dout
        if ptype in ('encoder', 'encoder_mapped', 'encoder_quadrature'):
            pin = pins.get('pin_a', -1)
        elif ptype == 'dht22':
            pin = pins.get('pin_data', -1)
        elif ptype == 'hx711':
            pin = pins.get('pin_dout', -1)
        else:
            pin = next((pins[k] for k in ('pin_a', 'pin_data', 'pin_dout') if k in pins), -1)
        if pin < 0:
            return tel_key
        return f'periph:{pin}:{field}'

    if tel_key.startswith('cp:') and pipeline_idx_by_id is not None:
        # Format: 'cp:<pipeline_id>:<block_idx>:<field_name>'
        parts = tel_key.split(':', 3)
        if len(parts) != 4:
            return tel_key
        pl_id, blk_idx, field = parts[1], parts[2], parts[3]
        pl_idx = pipeline_idx_by_id.get(pl_id)
        if pl_idx is None:
            return tel_key  # unknown pipeline ID — leave as-is
        return f'cp:{pl_idx}:{blk_idx}:{field}'

    return tel_key


def _resolve_oled_tel_keys(periph: Dict, periph_by_id: Dict,
                            pipeline_idx_by_id: Dict | None = None) -> Dict:
    """Return a deep copy of an OLED peripheral with all tel_keys resolved to firmware keys."""
    p = copy.deepcopy(periph)
    for screen in p.get('ui_params', {}).get('screens', []):
        for elem in screen.get('elements', []) if isinstance(screen, dict) else []:
            if 'tel_key' in elem and elem['tel_key']:
                elem['tel_key'] = _resolve_tel_key_for_l4(
                    elem['tel_key'], periph_by_id, pipeline_idx_by_id)
    return p


def pack_l4(role_raw: Dict) -> bytes:
    """
    Build the L4 ui_params blob from a parsed role JSON dict.
    Returns the complete blob bytes, or empty bytes if no UI devices are present.
    """
    peripherals  = role_raw.get('peripherals', [])
    periph_by_id = {p['id']: p for p in peripherals if 'id' in p}
    oled_periphs = [p for p in peripherals if p.get('type') == 'oled_ssd1306']
    if not oled_periphs:
        return b''

    # Build pipeline_id → numeric index map for cp: key resolution
    pipelines = role_raw.get('pipelines', [])
    pipeline_idx_by_id = {pl['id']: idx for idx, pl in enumerate(pipelines) if 'id' in pl}

    dev_count = len(oled_periphs)
    hdr = struct.pack('<IBBH', _L4_MAGIC, _L4_VERSION, dev_count, 0)

    body = b''
    for periph in oled_periphs:
        periph_id = periph.get('id', '')
        h         = _fnv1a(periph_id)
        dev_data  = _pack_oled_device(
            _resolve_oled_tel_keys(periph, periph_by_id, pipeline_idx_by_id))
        dev_hdr   = struct.pack('<IBBH', h, _L4_DEV_OLED_SSD1306, 0, len(dev_data))
        body += dev_hdr + dev_data

    return hdr + body


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def pack_role(role_json_path: Path, output_dir: Optional[Path] = None) -> Path:
    """
    Pack a role JSON file into L1/L2/L3 blobs + NVS defaults image.

    Args:
        role_json_path: Path to the role JSON (e.g. saved_roles/AERO-002.json).
        output_dir:     Directory to write outputs.  If None, defaults to
                        <workspace>/PDS-BuildTools/dist/defaults/<role_id>/

    Returns:
        The output directory path.
    """
    role_json_path = Path(role_json_path).resolve()
    raw = json.loads(role_json_path.read_text(encoding="utf-8"))

    role_id        = raw.get("role_id", role_json_path.stem)
    update_rate_ms = 1000  # pipeline_interval_ms default

    # Extract pipeline_interval_ms from variables if present
    for var in raw.get("variables", {}).get("pds_control", []):
        if var.get("name") == "pipeline_interval_ms":
            update_rate_ms = int(var.get("default", 1000))
            break

    # Workspace root: always tools/ → PDS-Role/ → workspace/
    workspace = Path(__file__).resolve().parent.parent.parent

    # Derive output directory
    if output_dir is None:
        output_dir = workspace / "PDS-BuildTools" / "dist" / "defaults" / role_id

    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    pipelines = raw.get("pipelines", [])

    # ── Resolve output-pin and gpio-power string references ──────────────
    # New role format stores normalised string IDs (e.g. "op_abc123").
    # Old format already stores concrete integers — both paths are safe.
    output_pins = raw.get("output_pins", [])
    pin_by_id   = {op["id"]: op for op in output_pins if "id" in op}
    peripherals = raw.get("peripherals", [])
    periph_by_id = {p["id"]: p for p in peripherals if "id" in p}
    pipeline_idx_by_id = {pl.get("id", ""): i for i, pl in enumerate(pipelines)}
    for pl in pipelines:
        pl_periph_id = pl.get("peripheral_id") or ""
        for blk in pl.get("blocks", []):
            _resolve_hx711_peripheral_ref(blk, pl_periph_id, periph_by_id)
            _resolve_encoder_peripheral_ref(blk, periph_by_id)
            _resolve_dht22_peripheral_ref(blk, periph_by_id)
            _resolve_analog_probe_peripheral_ref(blk, periph_by_id)
            _resolve_stepper_peripheral_ref(blk, periph_by_id)
            _resolve_servo_peripheral_ref(blk, periph_by_id)
            _resolve_gpio_input_ref(blk, pipeline_idx_by_id)
            _resolve_output_pin_ref(blk, pin_by_id)
            _resolve_gpio_power_ref(blk, pin_by_id)
            for fo in blk.get("fan_outputs", []):
                _resolve_output_pin_ref(fo, pin_by_id)
                _resolve_gpio_power_ref(fo, pin_by_id)

    print(f"Packing blobs for role: {role_id}")
    print(f"  Pipelines:     {len(pipelines)}")
    print(f"  Output dir:    {output_dir}")

    # ── Build blobs ───────────────────────────────────────────────────────
    l1, l2, l3 = build_blobs(pipelines, update_rate_ms=update_rate_ms)

    l1_path = output_dir / f"{role_id}_l1.bin"
    l2_path = output_dir / f"{role_id}_l2.bin"
    l3_path = output_dir / f"{role_id}_l3.bin"

    l1_path.write_bytes(l1)
    l2_path.write_bytes(l2)
    l3_path.write_bytes(l3)

    # ── L4 (ui_params) blob ──────────────────────────────────────────────
    l4 = pack_l4(raw)
    l4_path_out: Optional[Path] = None
    if l4:
        l4_path_out = output_dir / f"{role_id}_l4.bin"
        l4_path_out.write_bytes(l4)

    json_dest = output_dir / role_json_path.name
    shutil.copy2(role_json_path, json_dest)

    print(f"  L1 (pipeline): {len(l1):>5} bytes -> {l1_path.name}")
    print(f"  L2 (hw_vars):  {len(l2):>5} bytes -> {l2_path.name}")
    print(f"  L3 (settings): {len(l3):>5} bytes -> {l3_path.name}")
    if l4:
        print(f"  L4 (ui_params):{len(l4):>5} bytes -> {l4_path_out.name}")
    else:
        print(f"  L4 (ui_params): (none -- no OLED peripherals in role)")
    print(f"  Role JSON:           -> {json_dest.name}")

    # ── NVS CSV ───────────────────────────────────────────────────────────
    nvs_size_kb = 24  # default; read from role if available
    for var in raw.get("variables", {}).get("pds_storage", []):
        if var.get("name") == "nvs_size_kb":
            nvs_size_kb = int(var.get("default", 24))
            break

    # Read system_prefs for device-level NVS keys
    system_prefs = raw.get("system_prefs", {})
    tz_offset_min = int(system_prefs.get("tz_offset_min", 0))
    extra_nvs_rows = [f"tz_offset_min,data,i16,{tz_offset_min}"]

    csv_path = _write_nvs_csv(output_dir, role_id, extra_rows=extra_nvs_rows, l4_path=l4_path_out)
    print(f"  NVS CSV:       {csv_path.name}  (tz_offset_min={tz_offset_min})")

    # ── partitions.csv ────────────────────────────────────────────────────
    flash_size_kb = raw.get("flash_size_kb", 4096)
    app_size_kb   = raw.get("app_size_kb", 1408)
    _generate_partitions_csv(workspace, role_id, flash_size_kb, app_size_kb)
    print(f"  partitions.csv -> Device/main/partitions.csv  "
          f"({flash_size_kb} K flash, {app_size_kb} K app, pds_log=remaining)")

    # ── NVS binary image (best-effort) ────────────────────────────────────
    nvs_out = output_dir / "nvs_defaults.bin"
    if _try_generate_nvs_image(output_dir, csv_path, nvs_size_kb):
        print(f"  NVS image:     nvs_defaults.bin  ({nvs_out.stat().st_size} bytes)")
    else:
        print(
            f"\n  [info] nvs_defaults.bin not generated — nvs_partition_gen not found.\n"
            f"  To generate it, run one of:\n"
            f"    pip install esp-idf-nvs-partition-gen\n"
            f"    python -m esp_idf_nvs_partition_gen.nvs_partition_gen "
            f"--input \"{csv_path}\" --output \"{nvs_out}\" "
            f"--size {hex(nvs_size_kb * 1024)}\n"
            f"  Or download nvs_partition_generator.py from ESP-IDF and place it in\n"
            f"  PDS-BuildTools/scripts/"
        )

    print(f"\nDone. {role_id} blobs written to {output_dir}")
    return output_dir


# ─────────────────────────────────────────────────────────────────────────────
# CLI entry point
# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="PDS Role Blob Packer — converts role JSON to L1/L2/L3 NVS blobs"
    )
    parser.add_argument("role",
                        help="Role JSON path or role_id (looks in saved_roles/)")
    parser.add_argument("--output", "-o", type=str, default=None,
                        help="Output directory (default: PDS-BuildTools/dist/defaults/<role_id>/)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Show blob sizes without writing files")

    args = parser.parse_args()

    # Resolve the role JSON path
    role_path = Path(args.role)
    if not role_path.exists():
        # Try saved_roles/ relative to this file's parent (PDS-Role/)
        saved = Path(__file__).parent.parent / "saved_roles" / f"{args.role}.json"
        if saved.exists():
            role_path = saved
        else:
            print(f"ERROR: Role file not found: {args.role}", file=sys.stderr)
            sys.exit(1)

    if args.dry_run:
        raw = json.loads(role_path.read_text(encoding="utf-8"))
        role_id = raw.get("role_id", role_path.stem)
        pipelines = raw.get("pipelines", [])
        peripherals = raw.get("peripherals", [])
        periph_by_id = {p["id"]: p for p in peripherals if "id" in p}
        output_pins = raw.get("output_pins", [])
        pin_by_id = {op["id"]: op for op in output_pins if "id" in op}
        pipeline_idx_by_id = {pl.get("id", ""): i for i, pl in enumerate(pipelines)}
        for pl in pipelines:
            pl_periph_id = pl.get("peripheral_id") or ""
            for blk in pl.get("blocks", []):
                _resolve_hx711_peripheral_ref(blk, pl_periph_id, periph_by_id)
                _resolve_encoder_peripheral_ref(blk, periph_by_id)
                _resolve_stepper_peripheral_ref(blk, periph_by_id)
                _resolve_servo_peripheral_ref(blk, periph_by_id)
                _resolve_gpio_input_ref(blk, pipeline_idx_by_id)
                _resolve_output_pin_ref(blk, pin_by_id)
                _resolve_gpio_power_ref(blk, pin_by_id)
        print(f"[DRY RUN] Role: {role_id}")
        l1, l2, l3 = build_blobs(pipelines)
        l4 = pack_l4(raw)
        print(f"  L1: {len(l1)} bytes")
        print(f"  L2: {len(l2)} bytes")
        print(f"  L3: {len(l3)} bytes")
        print(f"  L4: {len(l4)} bytes" if l4 else "  L4: (no OLED peripherals)")
        print(f"  L1 hex: {l1.hex(' ')}")
        print(f"  L2 hex: {l2.hex(' ')}")
        print(f"  L3 hex: {l3.hex(' ')[:120]}{'...' if len(l3) > 60 else ''}")
        return

    out_dir = Path(args.output) if args.output else None
    pack_role(role_path, out_dir)


if __name__ == "__main__":
    main()
