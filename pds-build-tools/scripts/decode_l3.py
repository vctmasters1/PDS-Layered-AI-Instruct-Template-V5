"""Decode L3 binary block-by-block for a given role — diagnostic tool."""
import json, struct, sys
sys.path.insert(0, 'k:/PDS_AutomationSuite/PDS-Role/tools')
from blob_packer import BLOCK_DEFS, _flatten_pipeline, _L3_HEADER_SIZE

role = sys.argv[1] if len(sys.argv) > 1 else 'AERO-003'
base = f'k:/PDS_AutomationSuite/PDS-BuildTools/dist/defaults/{role}'

with open(f'{base}/{role}.json') as f:
    j = json.load(f)

l3 = open(f'{base}/{role}_l3.bin', 'rb').read()
offset = _L3_HEADER_SIZE

for pi, pipeline in enumerate(j.get('pipelines', [])):
    if not pipeline.get('enabled', True):
        continue
    flat = _flatten_pipeline(pipeline.get('blocks', []))
    name = pipeline['name']
    print(f'Pipeline {pi} ({name}):')
    for bi, fb in enumerate(flat):
        bdef = BLOCK_DEFS[fb.block_type]
        tid = f'0x{bdef.type_id:02x}'
        if not bdef.l3_fmt:
            print(f'  [{bi}] {fb.block_type} ({tid}) — no L3')
            continue
        size = struct.calcsize(bdef.l3_fmt)
        raw = l3[offset:offset+size]
        vals = struct.unpack(bdef.l3_fmt, raw)
        parsed = dict(zip(bdef.l3_fields, vals))
        print(f'  [{bi}] {fb.block_type} ({tid}) @L3+{offset} ({size}B): {parsed}')
        offset += size
    print()

print(f'Total L3 consumed: {offset} of {len(l3)} bytes')
