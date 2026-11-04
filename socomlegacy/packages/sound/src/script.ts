import { parseRdr, rdrGet, Zar, type RdrNode } from '@s2u/archive';

/**
 * `RUN/SOUNDRDR.ZAR/sounds.rdr`, the sound script (socomlegacy/docs/research/81 §3): under `SETS`, one list per bank block
 * (`MP2_AM`, `MP2_FX`, `HUDUI` ...) of the sounds that carry parameters, each named by the **CRC-32 of its bank
 * name** -- `.STEP_STONE` is 1440126871 -- and followed by keys: `ONESHOT`, `AMBIENT`, `DOPPLER`, `STREAMING_EFX`,
 * `RANGE (min max)`, `VOLUME`, `MED`/`FAR` (marks on a weapon's distance variants that the game never reads: its
 * key table has no such key, and the variant is chosen by distance, `./rules`' `fireVariant`) ... The reader is `FUN_003435c0`
 * (decomp 242323-242560): `RANGE` lands as two `u16` at +0xc/+0xe, `VOLUME` as a float at +4; the hash is
 * `FUN_003a2370`, a table CRC-32 over the name's bytes (poly 0x04C11DB7 reflected, init and final ~0 -- zlib's), and
 * the name a material or a weapon names is turned into the same number to look its sound up (`FUN_00344f30`).
 *
 * What `RANGE` means is `FUN_00342670` (decomp 241912-241955): full volume inside `min`, falling linearly to 0 at
 * `max`, silent beyond (`./rules`'s `rangeGain`).
 */

export interface SoundParams {
  /** The CRC-32 the script files it under (signed, as the compiled script holds it). */
  hash: number;
  oneShot: boolean;
  ambient: boolean;
  doppler: boolean;
  /** `RANGE`: world units, full inside the first, silent past the second. */
  range: [number, number] | null;
  /** `VOLUME`, when the entry has one. */
  volume: number | null;
  /** The script's `MED`/`FAR` marks (`.M4A1_M` is `MED`, `.M4A1_F` is `FAR`): data only, `FUN_003435c0` reads neither. */
  med: boolean;
  far: boolean;
}

/** One block's entries, by hash. */
export type SoundSet = Map<number, SoundParams>;

const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** `FUN_003a2370`: the CRC-32 of a name's bytes, signed as the script stores it. */
export function soundHash(name: string): number {
  let c = 0xffffffff;
  for (let i = 0; i < name.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ name.charCodeAt(i)) & 0xff]!;
  return ~c | 0;
}

const has = (entry: RdrNode[], key: string): boolean => entry.includes(key);
const numbers = (v: RdrNode | undefined): number[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map(Number).filter(Number.isFinite) : typeof v === 'string' ? [Number(v)] : [];

/** Every `SETS` block of a decoded `sounds.rdr`, by block name (`MP2_AM`), its entries by hash. */
export function parseSoundScript(root: RdrNode): Map<string, SoundSet> {
  const sets = rdrGet(root, 'SETS');
  if (!Array.isArray(sets)) throw new Error('sounds.rdr has no SETS');
  const out = new Map<string, SoundSet>();
  for (let i = 0; i + 1 < sets.length; i += 2) {
    const name = sets[i], list = sets[i + 1];
    if (typeof name !== 'string' || !Array.isArray(list)) continue;
    const set: SoundSet = new Map();
    for (const entry of list) {
      if (!Array.isArray(entry) || typeof entry[0] !== 'string') continue;
      const hash = Number(entry[0]);
      if (!Number.isInteger(hash)) continue;
      // `FUN_0032dd80(entry, "RANGE", ...)`: the first RANGE and the two numbers after it.
      const at = entry.indexOf('RANGE');
      const range = at >= 0 ? numbers(entry[at + 1]) : [];
      const vAt = entry.indexOf('VOLUME');
      const volume = vAt >= 0 ? numbers(entry[vAt + 1])[0] ?? null : null;
      set.set(hash, {
        hash, oneShot: has(entry, 'ONESHOT'), ambient: has(entry, 'AMBIENT'), doppler: has(entry, 'DOPPLER'),
        range: range.length >= 2 ? [range[0]!, range[1]!] : null, volume, med: has(entry, 'MED'), far: has(entry, 'FAR'),
      });
    }
    out.set(name, set);
  }
  return out;
}

/** `SOUNDRDR.ZAR`'s one script, decoded. */
export function soundScriptFromArchive(bytes: Uint8Array): Map<string, SoundSet> {
  const zar = Zar.parse(bytes);
  const key = zar.root.children.find((k) => k.name.toLowerCase() === 'sounds.rdr');
  if (!key) throw new Error('SOUNDRDR.ZAR has no sounds.rdr');
  return parseSoundScript(parseRdr(zar.data(key)));
}

/**
 * A `sounds.rdr` entry that streams (socomlegacy/docs/research/124 §3): `ST (N1 <stem> [LOOP ()])`. `FUN_003435c0`
 * (D:L242323-242560) gives an entry the class `MUS` (2) for the key `MUS`, `STREAMING_EFX` (1) for that key, and 3 to
 * any other `ST`; it keeps `N1` at +0x20 (a second stem, `N2`, at +0x24: no entry of the dev disc has one).
 */
export interface StreamEntry {
  /** The CRC-32 the script files it under (signed, as the compiled script holds it). */
  hash: number;
  /** The `SETS` block it is in (`SMUS`, `MULTI` ...). */
  block: string;
  /** `N1`: the VAGSTORE member's stem (`MUMP0004`, `PH_0014`). */
  n1: string;
  /** The `MUS` class, found anywhere in the entry: streamed as a VPK, in group 1. */
  music: boolean;
  /** `LOOP` under `ST` (PLAT-22's: no loop is modelled). */
  loop: boolean;
  /** The `STREAMING_EFX` class. */
  efx: boolean;
}

/** Whether `key` is a string anywhere in `node`, depth-first: `FUN_0032f0d0`'s search, which `FUN_003435c0` uses for `MUS`. */
function hasKey(node: RdrNode, key: string): boolean {
  return Array.isArray(node) ? node.some((c) => hasKey(c, key)) : node === key;
}

/** Every `ST` entry of a decoded `sounds.rdr`, by block, by hash. */
export function parseStreamEntries(root: RdrNode): Map<string, Map<number, StreamEntry>> {
  const sets = rdrGet(root, 'SETS');
  if (!Array.isArray(sets)) throw new Error('sounds.rdr has no SETS');
  const out = new Map<string, Map<number, StreamEntry>>();
  for (let i = 0; i + 1 < sets.length; i += 2) {
    const block = sets[i], list = sets[i + 1];
    if (typeof block !== 'string' || !Array.isArray(list)) continue;
    for (const e of list) {
      if (!Array.isArray(e) || typeof e[0] !== 'string' || !e.includes('ST')) continue;
      const hash = Number(e[0]), st = rdrGet(e, 'ST'), n1 = st === undefined ? undefined : rdrGet(st, 'N1');
      if (!Number.isInteger(hash) || typeof n1 !== 'string') continue;
      let set = out.get(block);
      if (!set) out.set(block, set = new Map());
      // `MUS` is found depth-first (`FUN_0032f0d0`, D:L230210-230299): the menus' music carries it inside `ST` (research 152 §2).
      set.set(hash, { hash, block, n1, music: hasKey(e, 'MUS'), loop: Array.isArray(st) && st.includes('LOOP'), efx: e.includes('STREAMING_EFX') });
    }
  }
  return out;
}

/**
 * The blocks a multiplayer map's load puts in the table (`FUN_00344450`, D:L242783-242818, for a map whose name's second
 * letter is `p`): `HUDUI`, `SMUS`, `TCM_ECHO`, the map's `%s_vc`, `_fx`, `_am`, `_svo`, `_smu`, then `MULTI` and
 * `HOSTAGE` -- upper-cased as `FUN_00344090` looks them up under `SETS` (`FUN_0019afd0`, D:L17306).
 */
export function missionSoundBlocks(map: string): string[] {
  const m = map.toUpperCase();
  return ['HUDUI', 'SMUS', 'TCM_ECHO', ...['VC', 'FX', 'AM', 'SVO', 'SMU'].map((k) => `${m}_${k}`), 'MULTI', 'HOSTAGE'];
}

/**
 * The stream a name plays: its CRC-32 among the `blocks` loaded, the first that holds it (the game's table is one sorted
 * vector and does not tell equal hashes apart: research 122 §2); null plays nothing (`FUN_00344f30` answers no object).
 */
export function streamFor(entries: ReadonlyMap<string, ReadonlyMap<number, StreamEntry>>, blocks: readonly string[], name: string): StreamEntry | null {
  const hash = soundHash(name);
  for (const b of blocks) {
    const e = entries.get(b)?.get(hash);
    if (e) return e;
  }
  return null;
}

/**
 * The member an entry streams: `"%s.VPK"` (ELF 0x3f76e8) for the `MUS` class, else `"%s.VAG"` (0x3f76f0), as
 * `FUN_00342240` formats `N1` (D:L241826-241831). The archive spells its members `.vpk` / `.vag`; the stream table matches
 * them upper-cased (`FUN_0034d5d0` through `FUN_003443c0`, D:L242761, by CRC-32 in `FUN_0034d940`), so a reader matches
 * without case.
 */
export function streamFile(entry: StreamEntry): string {
  return `${entry.n1}.${entry.music ? 'VPK' : 'VAG'}`;
}

/** A sound's parameters out of the first of `sets` that files its name. */
export function soundParams(script: ReadonlyMap<string, SoundSet>, sets: readonly string[], name: string): SoundParams | null {
  const hash = soundHash(name);
  for (const s of sets) {
    const p = script.get(s)?.get(hash);
    if (p) return p;
  }
  return null;
}
