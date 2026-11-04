import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Zar } from '@s2u/archive';
import { readSkeleton, type Skeleton } from '../src/index';
import { cat, f32, i16, u32 } from './syntheticZar';
import { nparams, u32 as u32One, writeZar, type ZarTree } from './skeletonZar';

/**
 * The character area's golden pins (TA.R3): values decoded from the disc by the repository's own readers, written to
 * `test/golden/character-*.json`, each naming its source in `_source`. The `*.parity.test.ts` files drive the engine
 * code from them with no game data (what holds parity on the local gate) and re-derive them from the fixtures where present.
 */

const GOLDEN = resolve(dirname(fileURLToPath(import.meta.url)), 'golden');
/** A JSON pin, read with readFileSync + JSON.parse (TA.R3: no import assertions). */
export const readPin = <T>(name: string): T => JSON.parse(readFileSync(resolve(GOLDEN, name), 'utf8')) as T;

export interface SkeletonPartPin { name: string; parent: number; bindLocal: number[]; bbox: number[]; type: number; flags: number }
export interface SkeletonPin {
  _source: string;
  model: string;
  modelMatrix: number[];
  parts: SkeletonPartPin[];
  frostfireModels: { name: string; names: string; parents: string; bindSha1: string }[];
}

export interface MotionPin {
  _source: string;
  victoryPartNames: string[];
  victory: { name: string; keySize: number; frames: number; duration: number; flags: string; payloadSha1: string; decodedSha1: string }[];
  backflipHeadWords: string[];
  backflipConstants: Record<string, { t?: number[]; r?: number[] }>;
  packKeys: number;
  packPartSets: string[];
  /** name, keySize, frames, partSet, flags, decodedSha1 */
  pack: [string, number, number, number, string, string][];
  sealRunRootRaw: number[];
}

export interface GearPin {
  _source: string;
  angleUnits: 'DEG' | 'RAD';
  bodyItems: string[];
  gearCount: number;
  character: string;
  model: string;
  defaultGear: { name: string; model: string; part: string; translation: [number, number, number]; rotation: [number, number, number] }[];
}

/**
 * A `CLIB_GEO.ZED` holding one character model built from the skeleton pin: the model node (`vtype` 1) and below it
 * one node a part (`vtype` 2, `matrix_id` its slot, its pinned `nparams`), children in slot order -- which is the
 * pre-order the pin was read in (78 §3.1).
 */
export function geoFromPin(pin: SkeletonPin): Zar {
  const vis = (id: number | null): ZarTree => ({
    name: 'visuals', children: [{ name: 'vis', children: [
      { name: 'vtype', data: u32One(id === null ? 1 : 2) },
      ...(id === null ? [] : [{ name: 'matrix_id', data: u32One(id) }]),
      { name: 'vparams', data: new Uint8Array(24) },
    ] }],
  });
  const nodeOf = (i: number): ZarTree => {
    const p = pin.parts[i]!;
    const kids = pin.parts.map((q, j) => (q.parent === i ? j : -1)).filter((j) => j >= 0).map(nodeOf);
    const out: ZarTree[] = [{ name: 'nparams', data: nparams(p.bindLocal, { bbox: p.bbox, type: p.type, flags: p.flags }) }, vis(i)];
    if (kids.length) out.push({ name: 'children', children: kids });
    return { name: p.name, children: out };
  };
  const roots = pin.parts.map((p, i) => (p.parent < 0 ? i : -1)).filter((i) => i >= 0).map(nodeOf);
  const model: ZarTree = { name: pin.model, children: [{ name: 'nparams', data: nparams(pin.modelMatrix) }, vis(null), { name: 'children', children: roots }] };
  return Zar.parse(writeZar([{ name: 'models', children: [model] }]));
}

/** seal_A_scuba's skeleton, read by `readSkeleton` out of a GEO built from the pin. */
export const skeletonFromPin = (pin: SkeletonPin = readPin<SkeletonPin>('character-skeleton.json')): Skeleton => readSkeleton(geoFromPin(pin), pin.model);

/** A clip track as 77 §5 stores it: int16 keys, an animated channel `n + 1` keys, a constant one once (with its 4th lane). */
export interface ClipTrack { name: string; flags: number; t: number[]; r: number[] }

/**
 * One clip laid out as research 77 §2-§5 describe it: the 0x20 head, 16-byte object records, the '-'-padded name
 * table, then per track a flag word, the translation channel (zero-padded to 4 after an odd key count), the
 * rotation channel. Keys default to zero (rotation keys to the identity) where a track gives none.
 */
export function layOutClip(frames: number, duration: number, tracks: ClipTrack[]): Uint8Array {
  const names: number[] = [];
  for (const t of tracks) {
    for (const ch of t.name) names.push(ch.charCodeAt(0));
    names.push(0);
    while (names.length % 4) names.push(0x2d);
  }
  const namesAt = 0x20 + 16 * tracks.length, dataAt = namesAt + names.length;
  const head = cat(u32(5), f32(duration), u32(frames, tracks.length), f32(-1, 1), u32(namesAt, dataAt));
  const records = new Uint8Array(16 * tracks.length);
  const body: Uint8Array[] = [];
  let at = dataAt;
  const push = (b: Uint8Array): void => { body.push(b); at += b.length; };
  const keys = frames + 1;
  for (const t of tracks) {
    push(u32(t.flags));
    if (t.flags & 0x20) push(i16(...(t.t.length ? t.t : [0, 0, 0, 0])));
    else {
      push(i16(...(t.t.length ? t.t : new Array<number>(3 * keys).fill(0))));
      if (at % 4) push(new Uint8Array(4 - (at % 4)));
    }
    const rk = t.flags & 0x10 ? 1 : keys;
    push(i16(...(t.r.length ? t.r : Array.from({ length: 4 * rk }, (_, i) => (i % 4 === 3 ? 32767 : 0)))));
  }
  return cat(head, records, Uint8Array.from(names), ...body);
}

/** A pinned flag string (one hex digit a part, `flags >> 4`) back to the flag words. */
export const flagsOf = (s: string): number[] => Array.from(s, (c) => 0x0c | (parseInt(c, 16) << 4));
