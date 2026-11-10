import { missingPackRefs, sortPackRefs, type CreatorLayoutRecord, type PackRef } from '@s2u/creator-contracts';

/**
 * FP-5 (FP.R12; product track, a browser adaptation with no original): a custom map -- a forge-map bundle (FP-4's
 * `validateForgeBundle`) kept by MODS as a read-only record, keyed by the bundle's digest, in the common pack database's
 * own scope `custom-maps` (`./storage` `PackStoreKind`). Its packs are installed as v2 packs beside it (`./registry`);
 * the record keeps their references, never their bytes, so removing the map keeps its packs (they may serve other
 * layouts). A custom map never reaches a lobby match (H273: `onlineCreatorLayoutRefusal` stands); the Forge and the test
 * room open it (FP-6).
 */

/** The record kept for one imported bundle (FP.R12). */
export interface CustomMapRecord {
  /** The bundle's digest (the registry's path + SHA-256 digest over its entries, as rooted): the record's key. */
  digest: string;
  /** The layout's own name. */
  name: string;
  /** The bundle's layout, a Forge layout record version 3 as FP-4 read it. */
  layout: CreatorLayoutRecord;
  /** The packs the bundle carried, by reference. */
  packs: PackRef[];
  /** The packs the layout requires that the bundle did not carry, as at import (readiness is recomputed at list time). */
  missing: PackRef[];
  /** When it was imported (ms since the epoch). */
  importedAt: number;
}
/** The `custom-maps` scope's data. */
export interface CustomMapData { records: CustomMapRecord[] }
export const emptyCustomMaps = async (): Promise<CustomMapData> => ({ records: [] });

/** The registry id of a custom map. */
export const customMapId = (digest: string): string => `custom-map:${digest}`;
export const CUSTOM_MAP_PREFIX = 'custom-map:';

/** The packs a layout stands on: its `requires` and its content base's pack, each once, sorted (FP-4's `missing` reads the same). */
export function customMapRequires(layout: Pick<CreatorLayoutRecord, 'requires' | 'contentBase'>): PackRef[] {
  const all = [...(layout.requires ?? []), ...(layout.contentBase ? [layout.contentBase.ref] : [])];
  const once = all.filter((r, i) => all.findIndex((q) => q.id === r.id && q.version === r.version && q.hash === r.hash) === i);
  return sortPackRefs(once.map((r) => ({ id: r.id, version: r.version, hash: r.hash })));
}

/** FP-5 item 6: what a custom map still needs, recomputed against the packs this device holds now. */
export const customMapMissing = (record: Pick<CustomMapRecord, 'layout'>, available: readonly PackRef[]): PackRef[] =>
  missingPackRefs(customMapRequires(record.layout), available);

/** A re-import of a bundle already kept: a note on the result, nothing changed. */
export const CUSTOM_MAP_ALREADY_HERE = 'CUSTOM_MAP_ALREADY_HERE';
/** A custom map's removal: its packs are kept (they may serve other layouts). */
export const CUSTOM_MAP_PACKS_KEPT = 'CUSTOM_MAP_PACKS_KEPT';
