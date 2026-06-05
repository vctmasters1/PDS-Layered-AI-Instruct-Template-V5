/**
 * Pipeline Codec
 *
 * Decodes L1 (topology) + L3 (settings) binary blobs into a structured
 * JSON representation that the HMI can render as a dynamic settings form.
 *
 * Also re-encodes modified settings back to valid L3 bytes so they can be
 * queued as a new pending-pipeline for the device (L1 and L2 stay unchanged).
 *
 * Binary format reference: Device/pds/pds_pipeline/pds_pipeline.c
 * Struct layouts match blob_packer.py BLOCK_DEFS exactly.
 */

import {
  BLOCK_REGISTRY,
  TYPE_ID_TO_NAME,
  fmtCharSize,
  type FmtChar,
  type BlockRegEntry,
  type FieldMeta,
  type DecodedField,
  type DecodedBlock,
  type DecodedPipeline,
  type DecodedPipelineSettings,
} from "./block-registry.js";

// Re-export so callers can import decoded types from this module too
export type { DecodedField, DecodedBlock, DecodedPipeline, DecodedPipelineSettings } from "./block-registry.js";

// ── L1 sentinels ───────────────────────────────────────────────────────────

const SENTINEL_PIPELINE_START = 0x00;
const SENTINEL_PIPELINE_END   = 0xFE;
const SENTINEL_STREAM_END     = 0xFF;

/**
 * Size in bytes of the L3 global header:
 *   format_version(1) + pipeline_version(1) + update_rate_ms(4 LE) +
 *   ble_enabled(1) + wifi_enabled(1) + reserved(1) = 9 bytes
 */
const L3_HEADER_SIZE = 9;

// ── Struct mini-parser ────────────────────────────────────────────────────

/**
 * Parse a format string (without leading '<') into an ordered sequence of
 * format characters, including 'x' (padding) chars.
 */
function parseFmt(fmt: string): FmtChar[] {
  return [...fmt] as FmtChar[];
}

/** Compute total byte size of a format string. */
function fmtTotalSize(fmt: string): number {
  return parseFmt(fmt).reduce((sum, c) => sum + fmtCharSize(c), 0);
}

/** Read one field value from a Buffer at the given byte offset. */
function readFmtChar(buf: Buffer, offset: number, c: FmtChar): number | boolean {
  switch (c) {
    case 'B': return buf.readUInt8(offset);
    case 'b': return buf.readInt8(offset);
    case 'H': return buf.readUInt16LE(offset);
    case 'h': return buf.readInt16LE(offset);
    case 'I': return buf.readUInt32LE(offset);
    case 'i': return buf.readInt32LE(offset);
    case 'f': return buf.readFloatLE(offset);
    case '?': return buf.readUInt8(offset) !== 0;
    case 'x': return 0;
  }
}

/** Write one field value into a Buffer at the given byte offset. */
function writeFmtChar(buf: Buffer, offset: number, c: FmtChar, val: number | boolean): void {
  const v = typeof val === 'boolean' ? (val ? 1 : 0) : val;
  switch (c) {
    case 'B': buf.writeUInt8(v & 0xFF, offset); break;
    case 'b': buf.writeInt8(v, offset); break;
    case 'H': buf.writeUInt16LE(v & 0xFFFF, offset); break;
    case 'h': buf.writeInt16LE(v, offset); break;
    case 'I': buf.writeUInt32LE(v >>> 0, offset); break;
    case 'i': buf.writeInt32LE(v | 0, offset); break;
    case 'f': buf.writeFloatLE(v, offset); break;
    case '?': buf.writeUInt8(v ? 1 : 0, offset); break;
    case 'x': break; // padding — leave as zero
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Unpack a block's settings_t from `l3Bytes` starting at `offset`.
 * Returns the decoded fields and the number of bytes consumed.
 */
function unpackBlockSettings(
  entry: BlockRegEntry,
  l3Bytes: Buffer,
  offset: number,
): { fields: Record<string, DecodedField>; bytesConsumed: number } {
  const fields: Record<string, DecodedField> = {};

  if (!entry.l3Fmt) {
    return { fields, bytesConsumed: 0 };
  }

  const fmtChars = parseFmt(entry.l3Fmt);
  let fieldIdx = 0;
  let byteOffset = offset;

  for (const c of fmtChars) {
    if (c === 'x') {
      byteOffset++;
      continue;
    }

    const fieldName = entry.l3Fields[fieldIdx++];
    if (fieldName === undefined) break;

    if (byteOffset + fmtCharSize(c) > l3Bytes.length) break;

    fields[fieldName] = {
      value: readFmtChar(l3Bytes, byteOffset, c),
      // Spread-copy so per-request overlay (Object.assign) never mutates the shared registry object
      meta: { ...(entry.fieldMeta[fieldName] ?? { label: fieldName, level: 'user' as const }) },
      fmtChar: c,
    };

    byteOffset += fmtCharSize(c);
  }

  return {
    fields,
    bytesConsumed: fmtTotalSize(entry.l3Fmt),
  };
}

/**
 * Re-pack a block's settings_t from a decoded-fields map.
 * Missing fields fall back to zeros (safe default).
 */
function packBlockSettings(
  entry: BlockRegEntry,
  fields: Record<string, DecodedField>,
): Buffer {
  if (!entry.l3Fmt) return Buffer.alloc(0);

  const totalSize = fmtTotalSize(entry.l3Fmt);
  const buf = Buffer.alloc(totalSize, 0);
  const fmtChars = parseFmt(entry.l3Fmt);
  let fieldIdx = 0;
  let byteOffset = 0;

  for (const c of fmtChars) {
    if (c === 'x') {
      byteOffset++;
      continue;
    }

    const fieldName = entry.l3Fields[fieldIdx++];
    const df = fields[fieldName];
    const val = df !== undefined ? df.value : 0;
    writeFmtChar(buf, byteOffset, c, val);
    byteOffset += fmtCharSize(c);
  }

  return buf;
}

// ── L1 Parser ─────────────────────────────────────────────────────────────

/**
 * Parse L1 bytes into an ordered list of block-type-name arrays (one per
 * enabled pipeline).
 *
 * L1 layout:
 *   [format_version:1][pipeline_version:1]
 *   For each enabled pipeline:
 *     [0x00 PIPELINE_START][type_id...][0xFE PIPELINE_END]
 *   [0xFF STREAM_END]
 */
export function parseL1(l1: Buffer): { blockNames: string[] }[] {
  const pipelines: { blockNames: string[] }[] = [];

  if (l1.length < 3) return pipelines;

  let i = 2; // skip format_version + pipeline_version
  while (i < l1.length) {
    const b = l1[i++];
    if (b === SENTINEL_STREAM_END) break;
    if (b !== SENTINEL_PIPELINE_START) continue;

    const blockNames: string[] = [];
    while (i < l1.length) {
      const typeId = l1[i++];
      if (typeId === SENTINEL_PIPELINE_END) break;

      const name = TYPE_ID_TO_NAME[typeId];
      if (!name) {
        // Unknown type — still need to advance L3 pointer, store placeholder
        blockNames.push(`unknown_0x${typeId.toString(16).padStart(2, '0')}`);
      } else {
        blockNames.push(name);
      }
    }
    pipelines.push({ blockNames });
  }

  return pipelines;
}

// ── Decode ────────────────────────────────────────────────────────────────

/**
 * Decode L1 + L3 into a structured settings tree.
 *
 * @param l1  Layer 1 bytes (pipeline topology)
 * @param l3  Layer 3 bytes (settings structs, preceded by 9-byte global header)
 */
export function decodeSettings(l1: Buffer, l3: Buffer): DecodedPipelineSettings {
  const pipelineTopology = parseL1(l1);

  // Read L3 global header
  const updateRateMs = l3.length >= L3_HEADER_SIZE
    ? l3.readUInt32LE(2)   // offset 2 = after format_version + pipeline_version
    : 1000;

  let l3Offset = L3_HEADER_SIZE;

  const decodedPipelines: DecodedPipeline[] = pipelineTopology.map(
    ({ blockNames }, pipelineIndex) => {
      const blocks: DecodedBlock[] = blockNames.map((blockName, blockIndex) => {
        const entry = BLOCK_REGISTRY[blockName];

        if (!entry || !entry.l3Fmt) {
          return {
            index: blockIndex,
            blockType: blockName,
            displayName: entry?.displayName ?? blockName,
            settings: {},
          };
        }

        const { fields, bytesConsumed } = unpackBlockSettings(entry, l3, l3Offset);
        l3Offset += bytesConsumed;

        return {
          index: blockIndex,
          blockType: blockName,
          displayName: entry.displayName,
          settings: fields,
        };
      });

      return { index: pipelineIndex, blocks };
    },
  );

  return { updateRateMs, pipelines: decodedPipelines };
}

// ── Re-encode ─────────────────────────────────────────────────────────────

/**
 * Re-encode a modified settings tree back to a new L3 buffer.
 *
 * Preserves the original L3 global header byte-for-byte.
 * For each block, if updated values are provided they override the decoded
 * values; missing keys retain their decoded (original) values.
 *
 * @param l1           Original L1 bytes (used to determine block order)
 * @param originalL3   Original L3 bytes (global header + original settings)
 * @param updatedPipelines  Caller-supplied settings overrides (same structure
 *                          as DecodedPipelineSettings.pipelines, but `value`
 *                          fields may be number|boolean|undefined)
 */
export function encodeSettings(
  l1: Buffer,
  originalL3: Buffer,
  updatedPipelines: Array<{
    index: number;
    blocks: Array<{
      index: number;
      blockType: string;
      settings: Record<string, { value: number | boolean }>;
    }>;
  }>,
): Buffer {
  // Start with a copy of the original L3 header
  const headerSize = Math.min(L3_HEADER_SIZE, originalL3.length);
  const parts: Buffer[] = [originalL3.subarray(0, headerSize)];

  // Decode original L3 so we can use it as fallback for unmodified fields
  const original = decodeSettings(l1, originalL3);

  const patchMap = new Map<string, Record<string, { value: number | boolean }>>();
  for (const pl of updatedPipelines) {
    for (const bl of pl.blocks) {
      patchMap.set(`${pl.index}:${bl.index}`, bl.settings);
    }
  }

  for (const pipeline of original.pipelines) {
    for (const block of pipeline.blocks) {
      const entry = BLOCK_REGISTRY[block.blockType];
      if (!entry || !entry.l3Fmt) continue;

      // Merge: decoded fields + override patch
      const patch = patchMap.get(`${pipeline.index}:${block.index}`) ?? {};
      const merged: Record<string, DecodedField> = { ...block.settings };

      for (const [key, override] of Object.entries(patch)) {
        if (key in merged) {
          merged[key] = { ...merged[key], value: override.value };
        }
      }

      parts.push(packBlockSettings(entry, merged));
    }
  }

  return Buffer.concat(parts);
}

// ── Unframe helper ────────────────────────────────────────────────────────

/**
 * Unframe the stored pipeline binary (framed L1+L2+L3) into its three
 * constituent layers.
 *
 * Frame format: [len:4LE][L1][len:4LE][L2][len:4LE][L3]
 */
export function unframePipeline(framed: Buffer): {
  l1: Buffer;
  l2: Buffer;
  l3: Buffer;
} {
  let offset = 0;

  function readLayer(): Buffer {
    if (offset + 4 > framed.length) return Buffer.alloc(0);
    const len = framed.readUInt32LE(offset);
    offset += 4;
    const slice = framed.subarray(offset, offset + len);
    offset += len;
    return slice;
  }

  const l1 = readLayer();
  const l2 = readLayer();
  const l3 = readLayer();

  return { l1, l2, l3 };
}

/**
 * Re-frame L1 + L2 + L3 into the binary format the server stores and the
 * device downloads.
 */
export function framePipeline(l1: Buffer, l2: Buffer, l3: Buffer): Buffer {
  const lenBuf = (n: number): Buffer => {
    const b = Buffer.allocUnsafe(4);
    b.writeUInt32LE(n, 0);
    return b;
  };
  return Buffer.concat([lenBuf(l1.length), l1, lenBuf(l2.length), l2, lenBuf(l3.length), l3]);
}
