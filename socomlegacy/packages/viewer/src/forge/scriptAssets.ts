import type { EffectProgram } from '@s2u/scene';
import type { SwitchStep } from '@s2u/creator-contracts';
import type { SoundEmitter } from '../soundData';

/**
 * The sounds and effects a switch's script may play, from every disc map (the owner, 2026-11-10: "on the switch's play a
 * sound and effect, I want all sounds/effects from all maps listed, not just the local map"; a browser adaptation, FG.R2
 * -- the game plays only its own map's). Read off a map's mission set (`MapMeta.scene.programs`, `MZANIM.ZAR`):
 *
 * - its **sounds**: every name its programs' `SOUND` commands play (`EffectOp` `sound`);
 * - its **effects**: the names its programs call that its set does not hold -- the common set's (`CZANIM.ZAR`), on
 *   every map -- and its own programs rooted at no node (`EffectProgram.root` 0: they play where they are called, as a
 *   common effect does) that draw something (a `PARTICLE_SOURCE` or a `LIGHT`, theirs or a program's they call); a
 *   program rooted at one of the map's own nodes plays there, a node another map has not, so it is left out.
 *
 * A step naming another map's (`SwitchStep.from`) is lent into the match (`lentScriptAssets`): its sound out of that
 * map's banks (`../soundData` `borrowMissing`), its effect out of that map's mission set (`../effectData` `borrow`).
 */

/** The script's names a file may hold (`../../creator-contracts` `SWITCH_SOUND`). */
export const SCRIPT_ASSET_NAME = /^[A-Za-z0-9_. -]{1,48}$/;
/** The call strikes' two (research 171 s4): offered on every map, as Crossroads' set calls them. */
export const COMMON_SCRIPT_EFFECTS: readonly string[] = ['fire_explode_med', 'dust_explode_long'];

/**
 * A blast step's look (FORGE_SCRIPT_BLAST_ADAPTATION, `./placedAccess` `SCRIPT_BLAST_WEAPON`): Demolition's
 * `base_explosion1` lent from MP1, one of the six Demolition maps whose mission set holds it (research 173), so the
 * match's effects read MPBOMB's record (`../effectData` reads the rounds its programs fire) and draw its `satchel`.
 */
export const SCRIPT_BLAST_DONOR = 'MP1';
export const SCRIPT_BLAST_PROGRAM = 'base_explosion1';

/** A map's programs' sounds, each once, sorted. */
export function scriptSoundsOf(programs: readonly EffectProgram[]): string[] {
  const out = new Set<string>();
  for (const p of programs) for (const sq of p.sequences) for (const op of sq.ops) if (op.op === 'sound' && SCRIPT_ASSET_NAME.test(op.sound)) out.add(op.sound);
  return [...out].sort();
}

/** A map's effects a script may call: the common set's its programs call, and its own node-less programs that draw. */
export function scriptEffectsOf(programs: readonly EffectProgram[]): string[] {
  const byName = new Map(programs.map((p) => [p.name.toLowerCase(), p]));
  const draws = (p: EffectProgram | undefined, depth = 0): boolean => !!p && depth <= 4
    && p.sequences.some((s) => s.ops.some((o) => o.op === 'particles' || o.op === 'light' || (o.op === 'call' && draws(byName.get(o.anim.toLowerCase()), depth + 1))));
  const out = new Set<string>(COMMON_SCRIPT_EFFECTS);
  for (const p of programs) {
    if (p.root === 0 && SCRIPT_ASSET_NAME.test(p.name) && draws(p)) out.add(p.name);
    for (const sq of p.sequences) for (const op of sq.ops) {
      if (op.op === 'call' && !byName.has(op.anim.toLowerCase()) && SCRIPT_ASSET_NAME.test(op.anim)) out.add(op.anim);
    }
  }
  return [...out].sort();
}

/**
 * What a match lends for a layout (`../soundData` `soundFromDisc` `lend`, `../effectData` `borrow`): sounds and effects,
 * each by the map it is from.
 */
export interface LentScriptAssets {
  sounds: { from: string; names: string[] }[];
  effects: { from: string; names: string[] }[];
  /** The layout's ambient effects' loops (`./forgeObjects` `forgeAmbientEmitters`): the sound's emitters beside the map's. */
  emitters?: SoundEmitter[];
}

/** Names grouped by their map (stems upper-cased), each map once, by stem, its names once, sorted. */
function grouped(pairs: Iterable<readonly [string, string]>): { from: string; names: string[] }[] {
  const by = new Map<string, Set<string>>();
  for (const [from, name] of pairs) { const k = from.toUpperCase(); if (!by.has(k)) by.set(k, new Set()); by.get(k)!.add(name); }
  return [...by].sort((a, b) => a[0].localeCompare(b[0])).map(([from, n]) => ({ from, names: [...n].sort() }));
}

/**
 * The steps' sounds, each by its map (`from`, else `base`: the base's own streams are read for it too, its banks being
 * in already), and their effects `from` another map than `base` (the base's own are in its sets already).
 */
export function lentScriptAssets(steps: Iterable<SwitchStep>, base: string): LentScriptAssets {
  const sounds: [string, string][] = [], effects: [string, string][] = [];
  for (const st of steps) {
    if (st.do === 'sound') sounds.push([st.from ?? base, st.name]);
    else if (st.do === 'effect' && st.from && st.from.toUpperCase() !== base.toUpperCase()) effects.push([st.from, st.name]);
    else if (st.do === 'blast' && SCRIPT_BLAST_DONOR !== base.toUpperCase()) effects.push([SCRIPT_BLAST_DONOR, SCRIPT_BLAST_PROGRAM]);
  }
  return { sounds: grouped(sounds), effects: grouped(effects) };
}

/** Every step of a layout's switches' scripts, both lists. */
export function scriptSteps(switches: readonly { script?: { steps: readonly SwitchStep[] } }[] | undefined): SwitchStep[] {
  return (switches ?? []).flatMap((s) => s.script?.steps ?? []);
}

/**
 * What a placed copy of another map's damage trigger or gate plays (the owner, 2026-11-10: a copy "not part of my base
 * map" must "properly run its logic/sound/animation"): its deaths', its actions' and their called programs' sounds, and
 * the effects they call that its own map's set does not hold (that map's common or mission effects), lent as a
 * switch's are. A copy of the base map's own lends nothing.
 */
export function lentAccessAssets(copies: Iterable<{ lib: { archive: string }; programs: readonly EffectProgram[]; set: ReadonlySet<string> }>, base: string): LentScriptAssets {
  const sounds: [string, string][] = [], effects: [string, string][] = [];
  for (const c of copies) {
    const from = c.lib.archive;
    if (from.toUpperCase() === base.toUpperCase()) continue;
    for (const p of c.programs) for (const sq of p.sequences) for (const op of sq.ops) {
      if (op.op === 'sound') sounds.push([from, op.sound]);
      if (op.op === 'call' && !c.set.has(op.anim.toLowerCase())) effects.push([from, op.anim]);
    }
  }
  return { sounds: grouped(sounds), effects: grouped(effects) };
}

/** Two lendings as one: each map once, its names together. */
export function mergeLent(a: LentScriptAssets, b: LentScriptAssets): LentScriptAssets {
  const pairs = (l: LentScriptAssets['sounds']) => l.flatMap((e) => e.names.map((n) => [e.from, n] as const));
  const emitters = [...(a.emitters ?? []), ...(b.emitters ?? [])];
  return { sounds: grouped([...pairs(a.sounds), ...pairs(b.sounds)]), effects: grouped([...pairs(a.effects), ...pairs(b.effects)]), ...(emitters.length ? { emitters } : {}) };
}

/**
 * What every map has (the owner, 2026-11-10: "move all the common sounds/effects across all the maps into a single
 * category"): the sounds and the effects in every one of `lists` (each a map's, `../forge/archives` `scriptNames`),
 * sorted. None of none.
 */
export function commonScriptNames(lists: readonly { sounds: readonly string[]; effects: readonly string[] }[]): { sounds: string[]; effects: string[] } {
  const every = (pick: (l: { sounds: readonly string[]; effects: readonly string[] }) => readonly string[]): string[] => {
    if (!lists.length) return [];
    const rest = lists.slice(1).map((l) => new Set(pick(l)));
    return [...new Set(pick(lists[0]!))].filter((n) => rest.every((s) => s.has(n))).sort();
  };
  return { sounds: every((l) => l.sounds), effects: every((l) => l.effects) };
}
