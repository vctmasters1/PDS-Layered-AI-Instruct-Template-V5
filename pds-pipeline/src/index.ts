/**
 * @pds/pipeline — Public API
 *
 * Import everything from here. Do not import directly from sub-files.
 */

export {
  fmtCharSize,
  BLOCK_REGISTRY,
  TYPE_ID_TO_NAME,
} from './block-registry';

export type {
  FmtChar,
  FieldMeta,
  BlockRegEntry,
  AccessLevel,
  MeasurementCategory,
} from './block-registry';

// ── Decoded pipeline output types ─────────────────────────────────────────
//
// These are the pure-data shapes produced by pipeline-codec.ts (API layer)
// and consumed by PipelineBlockPanel.tsx (frontend).  They live here — not in
// the API or the frontend — so both sides share the exact same contract.
//
// Rule: no Node.js built-ins (Buffer, fs, etc.) allowed in this file.

import type { FieldMeta, FmtChar } from './block-registry';

/** A single decoded block field: value + UI metadata + format char */
export interface DecodedField {
  value: number | boolean;
  meta: FieldMeta;
  /** Format char used to pack/unpack — 'B','b','H','h','I','i','f','?' */
  fmtChar: FmtChar;
}

/** One block instance in a pipeline, with all its decoded settings */
export interface DecodedBlock {
  /** Position in the pipeline's flat block list (after fan expansion) */
  index: number;
  /** Block type name, e.g. "timer_cycle" */
  blockType: string;
  /** Human-readable display name */
  displayName: string;
  /** Decoded settings keyed by field name */
  settings: Record<string, DecodedField>;
}

/** One pipeline with its decoded blocks */
export interface DecodedPipeline {
  /** Pipeline index (0-based) */
  index: number;
  /** User-assigned name overlaid from role metadata */
  name?: string;
  blocks: DecodedBlock[];
}

/** Top-level decoded output from the codec — served by GET /pipeline-settings */
export interface DecodedPipelineSettings {
  /** Update rate from L3 global header (ms) */
  updateRateMs: number;
  pipelines: DecodedPipeline[];
}
