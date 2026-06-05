/**
 * Block Registry — re-export shim
 *
 * PDS-Pipeline/src/block-registry.ts is the SINGLE SOURCE OF TRUTH.
 * Do not add block definitions here. Edit PDS-Pipeline/src/block-registry.ts.
 *
 * @pds/pipeline resolves via: WEB-HMI/api/package.json -> "file:../../PDS-Pipeline"
 */

export {
  fmtCharSize,
  BLOCK_REGISTRY,
  TYPE_ID_TO_NAME,
} from '@pds/pipeline';

export type {
  FmtChar,
  FieldMeta,
  BlockRegEntry,
  AccessLevel,
  DecodedField,
  DecodedBlock,
  DecodedPipeline,
  DecodedPipelineSettings,
} from '@pds/pipeline';
