import type { PackRef } from '@s2u/creator-contracts';

/**
 * FP-5 item 4 (FP.R4, FP.R12; product track, a browser adaptation with no original): the one home of a custom map's
 * readiness words -- MODS' row (`../console/adapters/mods`) says them now, and FP-6's Forge caption and toast reuse
 * them, so a player reads one sentence for one fact everywhere. A map is ready when it needs no pack; otherwise it
 * needs each pack this device lacks, by id and version (the hash is a machine's word, not a player's): FP-6 makes the
 * one sentence FP.R4 names (`readinessSentence`).
 */

/** "<id> <version>": one pack, as a player reads it. */
export const packWords = (ref: Pick<PackRef, 'id' | 'version'>): string => `${ref.id} ${ref.version}`;

/** Each missing pack's words, in the list's order; empty when the map is ready. */
export const readinessWords = (missing: readonly Pick<PackRef, 'id' | 'version'>[]): string[] => missing.map(packWords);

const packs = (n: number): string => `${n} pack${n === 1 ? '' : 's'}`;

/**
 * FP-6 item 2 (FP.R4, design ~215): THE readiness sentence -- "Ready", or "Needs <n> pack(s) not here: <id> <version>, ...".
 * MODS' row ends in it, the Forge's base-list row carries it as its title, and the Forge's switch toast says it.
 */
export const readinessSentence = (missing: readonly Pick<PackRef, 'id' | 'version'>[]): string =>
  missing.length ? `Needs ${packs(missing.length)} not here: ${readinessWords(missing).join(', ')}` : 'Ready';

/** The sentence's short form for a select row's caption: "Ready", or "needs <n> pack(s)" (the full one is the row's title). */
export const readinessCaption = (missing: readonly unknown[]): string => (missing.length ? `needs ${packs(missing.length)}` : 'Ready');

/** MODS' detail of a custom map: `<name> · <n> pack(s) · <the readiness sentence>`. */
export function customMapDetail(name: string, count: number, missing: readonly Pick<PackRef, 'id' | 'version'>[]): string {
  return [name, packs(count), readinessSentence(missing)].join(' · ');
}
