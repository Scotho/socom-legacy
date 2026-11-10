import { missingPackRefs, samePackRef, type ContentRef, type CreatorLayoutRecord, type PackRef } from '@s2u/creator-contracts';
import { customMapMissing, customMapRequires, type CustomMapRecord } from '../packs/customMaps';
import { readinessCaption, readinessSentence } from '../packs/readiness';
import type { NamedSave } from './saves';

/**
 * FP-6 item 1 (FP.R4; product track, a browser adaptation with no original -- the original has no custom maps): the
 * Custom Maps group of the Forge's base list (Crispy's picker, OT.R112: one group added after his, nothing of his
 * changed). A pure listing over what the page already reads:
 * (a) the installed bundles -- the registry's custom-map records (`../packs/customMaps`), each a read-only base, value
 *     `custom:<digest>`;
 * (b) the bare content maps of installed packs no bundle stands on -- the content source's `mapIndex()`
 *     (`../packs/content/source`), value `content:<pack id>@<version>/<map id>` (the page's `contentBaseValue` words);
 * (c) the player's saved layouts -- the named saves (`./saves`), value `save:<id>`.
 * Empty when nothing is installed and nothing is saved: the page then adds no group at all.
 */
export const CUSTOM_MAPS_GROUP = 'Custom Maps';

export type CustomMapRowKind = 'bundle' | 'content' | 'save';
export interface CustomMapRow {
  kind: CustomMapRowKind;
  /** The base list's option value. */
  value: string;
  /** The row's own name (the record's, the map's, the save's). */
  name: string;
  /**
   * Item 2 (FP.R4): the packs it stands on that this device lacks now -- a bundle's and a save's by its record (its
   * `requires` and its content base, `customMapRequires`); a content map listed here is installed, so none.
   */
  missing: PackRef[];
}
/** Item 2: the select row's label, `<name> · <short caption>` (`../packs/readiness`). */
export const customRowLabel = (r: Pick<CustomMapRow, 'name' | 'missing'>): string => `${r.name} \u00b7 ${readinessCaption(r.missing)}`;
/** Item 2: the row's title and the switch toast: the one readiness sentence. */
export const customRowSentence = (r: Pick<CustomMapRow, 'missing'>): string => readinessSentence(r.missing);
export interface CustomMapListInput {
  records: readonly Pick<CustomMapRecord, 'digest' | 'name' | 'layout'>[];
  mapIndex: readonly { ref: ContentRef; name: string }[];
  saves: readonly Pick<NamedSave, 'id' | 'name' | 'record'>[];
  /** The packs this device holds (readiness, item 2). */
  available: readonly PackRef[];
}

export const CUSTOM_VALUE_PREFIX = 'custom:';
export const SAVE_VALUE_PREFIX = 'save:';
export const CONTENT_VALUE_PREFIX = 'content:';
/** The content map's value: the page's `contentBaseValue` words for the same base. */
export const contentMapValue = (ref: ContentRef): string => `${CONTENT_VALUE_PREFIX}${ref.pack.id}@${ref.pack.version}/${ref.assetId}`;

/** Whether a bundle's layout stands on `ref` (its `contentBase`: the same pack, by id, version and hash, and the same map). */
const covers = (layout: Pick<CreatorLayoutRecord, 'contentBase'>, ref: ContentRef): boolean =>
  !!layout.contentBase && layout.contentBase.mapId === ref.assetId && samePackRef(layout.contentBase.ref, ref.pack);

export function customMapRows(input: CustomMapListInput): CustomMapRow[] {
  const rows: CustomMapRow[] = [];
  for (const r of input.records) rows.push({ kind: 'bundle', value: `${CUSTOM_VALUE_PREFIX}${r.digest}`, name: r.name, missing: customMapMissing(r, input.available) });
  for (const m of input.mapIndex) {
    if (input.records.some((r) => covers(r.layout, m.ref))) continue;
    rows.push({ kind: 'content', value: contentMapValue(m.ref), name: m.name, missing: [] });
  }
  for (const s of input.saves) {
    const needs = missingPackRefs(customMapRequires(s.record as Pick<CreatorLayoutRecord, 'requires' | 'contentBase'>), input.available);
    rows.push({ kind: 'save', value: `${SAVE_VALUE_PREFIX}${s.id}`, name: s.name, missing: needs });
  }
  return rows;
}
