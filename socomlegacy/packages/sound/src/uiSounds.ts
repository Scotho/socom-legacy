import { parseRdr, Zar, type RdrNode } from '@s2u/archive';
import type { SoundBank } from './bank';
import { soundHash } from './script';

/**
 * The front end's sound table: how a menu's sound name finds a bank and an index, a stream, a group or the console's
 * silence (PLAT-23; web research 122). `D:L<line>` is a line of `socom2_game.elf.decomp.c`; every `FUN_` is retail.
 *
 * - **The table** (R122.1): one vector of sound objects sorted by the CRC-32 of a name (`FUN_00344f30` D:L243197-243210
 *   hashes the name's bytes as they stand -- the sigil, the case and any trailing whitespace included -- and
 *   binary-searches it, `FUN_00344ee0` -> `FUN_00344bf0`). A name no loaded entry carries answers null and every
 *   caller then plays nothing. No fallback, no trimming, no second table: `SND_DINK` is not `.DINK`, `".SLIDE\t"` is
 *   not `.SLIDE`.
 * - **A block** (`FUN_00344090` D:L242656-242758, R122.2): the bank of its name is loaded (`FUN_00343dd0`; a bank the
 *   disc lacks leaves its record at status -1), then one object per entry of `sounds.rdr` `SETS/<BLOCK>`
 *   (`FUN_003435c0` D:L242313-242552): **+0x10 the bank slot** (`DAT_0048db40`, one per block load, D:L242549) and
 *   **+0x12 the entry's ordinal in the block** (`DAT_0048db38`, reset to 0 at each load, D:L242547; D:L242675), so the index a
 *   play names is the entry's position, not a name looked up in the bank. A block `SETS` lacks still takes its slot.
 * - **The groups** (`FUN_003448e0` -> `FUN_00348130` D:L244929-244986, R122.3): `sounds.rdr` `GROUPS/<name>`, an
 *   object per group keyed by the hash of its name (`FUN_00347f00` D:L244833-244870). "UI" is such a block, not a bank.
 * - **The front end's table** (the menu init `FUN_001f4860` D:L54850-54853, strings 0x3e2df8-0x3e2e20 read off the ELF):
 *   `HUDUI`, `SMUS`, `UIVOICE`, then the groups `UI` (`FRONT_END_SOUND_BLOCKS`, `FRONT_END_SOUND_GROUPS`).
 * - **The play** (`FUN_00343140` D:L242175-242252, R122.4): the guard -- the slot below the bank count and its bank
 *   loaded, or the entry streamed (`ST`); an `HS` entry while `DAT_0045a0c1` is 0 goes to the headset queue
 *   (`HEADSET_ROUTE_READING`); a `ONESHOT` entry that does not stream is 989snd `SL_PLAYSOUND_A` (0x12,
 *   `FUN_003403b0` D:L240670-240689); any other entry not streamed is `SL_PLAYSOUND` (0x11) with a handle
 *   (`FUN_00340360` D:L240646-240665); a streamed one is a VAG stream (`FUN_00342240`). The six words: the slot's bank,
 *   the object's +0x12, `(int)(volume x 1024 x VOLUME x DAT_003e0070)` (that float is 1.0, read off the ELF), the
 *   caller's pan (-1: 989snd takes the sound's own) and pitch, bend 0.
 *
 * A key of an entry is found the way the engine finds it: `FUN_0032f0d0` / `FUN_0032f0e0` (D:L230210-230299), the
 * node after the first string equal to the key, searched depth-first (so `HS` and `MUS` inside `ST` count), compared
 * with `strcmp` (`FUN_00198f18`, case-sensitive).
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** The blocks the menu init loads, in its order (`FUN_001f4860` D:L54850-54852; ELF 0x3e2e08, 0x3e2e10, 0x3e2e18). */
export const FRONT_END_SOUND_BLOCKS = ['HUDUI', 'SMUS', 'UIVOICE'] as const;
/** The group block the menu init loads after them (D:L54853, ELF 0x3e2e20): `sounds.rdr` `GROUPS/UI`, not a bank. */
export const FRONT_END_SOUND_GROUPS = 'UI';

/** `FUN_00345620`'s `RANGE` default (D:L243424-243425): an entry without `RANGE` gets 160..430. */
export const SOUND_DEFAULT_RANGE: readonly [number, number] = [160, 430];

/** `DAT_003e0070`, the play's master factor (0x3f800000 in the ELF: 1.0). */
export const SOUND_PLAY_FACTOR = 1;

/** 989snd's two play calls the sound object makes (`common/common.h`): with a handle, and the one-shot. */
export const SL_PLAYSOUND = 0x11;
export const SL_PLAYSOUND_A = 0x12;
/** `SL_STOPALLSOUNDS` (24): `StopAllSounds` (`FUN_00346c00` -> `FUN_00340270`). */
export const SL_STOPALLSOUNDS = 24;

/**
 * SOUND_OFF_SWITCH_READING: the byte `DAT_0048dd28` every function of the chain tests first (the lookup, the block
 * load, the object fill, the plays, the group load: research 122 §2). No writer was found by name in the decompilation
 * and every recomp log plays sounds, so it reads 0 (sound on); `UiSoundTable.off` stands for it. [reading]
 */
export const SOUND_OFF_SWITCH_READING = false;

/**
 * HEADSET_ROUTE_READING: an `ST` entry carrying `HS` (`+0x1c` bit 3; the 12 `SND_HST_01..12` of `UIVOICE`) is handed,
 * while `DAT_0045a0c1` is 0, to `FUN_0034b6c0` (D:L246909-246944) instead of being streamed, which queues it while the
 * queue object's byte +0xb is set (set at construction D:L247015, on reset and flush; research 186 §3.1). With no USB
 * headset the queue's tick pops it and plays it as an ordinary VAGSTORE stream on the TV (`FUN_0034afd0`), one line at
 * a time (`./headsetQueue`, research 233 §2): a play of one is reported as `headset` and streamed through the queue.
 * Was `'not streamed'` (research 122 §3). [reading]
 */
export const HEADSET_ROUTE_READING = 'streamed';

/**
 * UI_GROUP_PICK_READING: a `GROUPS` group (`SND_HS_OPDV`, `SND_VO_OPDV`) resolves to an object, but which member it
 * plays (`FUN_00347f00`'s weights, the group's play at vtable 0x406b50 +0xc `FUN_00348710`) was not read: a play of one
 * is reported as `group` with its members and plays nothing here. [reading]
 */
export const UI_GROUP_PICK_READING = 'no member chosen';

/** `FUN_003435c0`'s class (+0x1d >> 5): 1 `TYPE_CONVERSATIONAL`, 2 `TYPE_SITREP`, 3 `TYPE_DEATH_DAMAGE`, else 0. */
export type SoundClass = 0 | 1 | 2 | 3;

/** One `SETS` entry's object (`FUN_003435c0`), the fields a play reads. */
export interface SoundObject {
  kind: 'sound';
  /** +0x18: the CRC-32 (signed, as `soundHash` gives it). */
  hash: number;
  /** The block it was loaded from (`HUDUI`). */
  block: string;
  /** +0x10: the bank slot, one per block load in load order. */
  slot: number;
  /** +0x12: the entry's ordinal in its block: the bank index a play names. */
  index: number;
  /** `ONESHOT` (+0x1c bit 2). */
  oneShot: boolean;
  /** `ST` (+0x1c bit 0): streamed. */
  streamed: boolean;
  /** `HS` inside `ST` (+0x1c bit 3): the headset route. */
  headset: boolean;
  /** `PD` inside `ST` (+0x1c bit 6). */
  pd: boolean;
  /** `HQ` / `VQ` inside `ST` (+0x1c bits 4 and 5): the zAnim's unplaced play hands these to `FUN_003428f0` instead. */
  hq: boolean;
  vq: boolean;
  /**
   * `MUS` anywhere in the entry (D:L242409-242412, the search is depth-first): the music class, streamed as a VPK. On
   * the disc 8 of SMUS's entries carry it inside `ST` (`MUS_MENU_THEME`, `MUS_ONLINE_MENU`, `MUS_ARMORY` among them).
   */
  music: boolean;
  /** `LOOP` inside `ST` (D:L242468-242471). */
  loop: boolean;
  /** `N1` inside `ST`: the stream's stem (`MUUI0004`; SMUS's first entry spells it `""`), null without one. */
  n1: string | null;
  /** `VOLUME` (+4), 1 by default. */
  volume: number;
  /** `RANGE` (+0xc, +0xe), truncated to u16; `SOUND_DEFAULT_RANGE` by default. */
  range: [number, number];
  class: SoundClass;
}

/** One `GROUPS` group's object (`FUN_00347f00`). */
export interface SoundGroupObject {
  kind: 'group';
  hash: number;
  /** The group block (`UI`). */
  block: string;
  name: string;
  /** `ENTRIES`: the member names, in order. */
  members: string[];
}

export type SoundTableObject = SoundObject | SoundGroupObject;

/** `FUN_00344090`'s bank record (0x18 bytes at `DAT_0048dbf0`): the name and whether the bank loaded (status 1). */
export interface SoundBankRecord {
  name: string;
  loaded: boolean;
  /** The bank the viewer holds for it, when loaded: its own name table maps an index back to a name. */
  bank: Pick<SoundBank, 'names'> | null;
}

/** `FUN_0032f0d0` / `FUN_0032f0e0`: the node after the first string equal to `key`, depth-first; undefined when none. */
export function soundRdrFind(node: RdrNode | undefined, key: string): RdrNode | undefined {
  if (!Array.isArray(node)) return undefined;
  for (let i = 0; i < node.length; i++) {
    const c = node[i]!;
    if (Array.isArray(c)) {
      const hit = soundRdrFind(c, key);
      if (hit !== undefined) return hit;
    } else if (c === key) return node[i + 1] ?? [];
  }
  return undefined;
}

/** `FUN_0032ee10`: a found string, or the first element of a found list when it is a string; else null. */
export function soundRdrString(node: RdrNode | undefined, key: string): string | null {
  const v = soundRdrFind(node, key);
  if (typeof v === 'string') return v;
  return Array.isArray(v) && typeof v[0] === 'string' ? v[0] : null;
}

/** `FUN_0032ea80` / `FUN_0032dd80`: `n` floats when the found node is a list of at least `n`, else null. */
function floats(node: RdrNode, key: string, n: number): number[] | null {
  const v = soundRdrFind(node, key);
  if (!Array.isArray(v) || v.length < n) return null;
  return v.slice(0, n).map((x) => (typeof x === 'string' && Number.isFinite(Number(x)) ? Math.fround(Number(x)) : 0));
}

/** The list's elements, as `FUN_00344090` walks them (a non-list holds none). */
const elements = (n: RdrNode | undefined): RdrNode[] => (Array.isArray(n) ? n : []);

/** `FUN_003435c0`'s hash: an int first word as it stands, a float truncated, a string hashed (`FUN_003a2370`), else 0. */
function entryHash(entry: RdrNode): number {
  const first = Array.isArray(entry) ? entry[0] : undefined;
  if (typeof first !== 'string') return 0;
  if (/^-?\d+$/.test(first)) return Number(first) | 0;
  const f = Number(first);
  if (first.trim() !== '' && Number.isFinite(f)) return Math.trunc(f) | 0;
  return soundHash(first);
}

/** `FUN_003435c0` (D:L242313-242552): one entry's object; `slot` and `index` are the load's counters. */
export function soundObjectOf(entry: RdrNode, block: string, slot: number, index: number): SoundObject {
  const has = (k: string): boolean => soundRdrFind(entry, k) !== undefined;
  const st = soundRdrFind(entry, 'ST');
  const inSt = (k: string): boolean => st !== undefined && soundRdrFind(st, k) !== undefined;
  // The class: TYPE_CONVERSATIONAL 1, TYPE_SITREP 2, TYPE_DEATH_DAMAGE 3, the last one present winning (D:L242381-242392).
  let cls: SoundClass = 0;
  if (has('TYPE_CONVERSATIONAL')) cls = 1;
  if (has('TYPE_SITREP')) cls = 2;
  if (has('TYPE_DEATH_DAMAGE')) cls = 3;
  const range = floats(entry, 'RANGE', 2) ?? [...SOUND_DEFAULT_RANGE];
  const u16 = (f: number): number => Math.trunc(f >= 2147483648 ? f - 2147483648 : f) & 0xffff;   // D:L242499-242512
  const volume = floats(entry, 'VOLUME', 1)?.[0] ?? 1;
  const n1 = st === undefined ? null : soundRdrString(st, 'N1');
  return {
    kind: 'sound', hash: entryHash(entry), block, slot, index,
    oneShot: has('ONESHOT'), streamed: st !== undefined, music: has('MUS'), loop: inSt('LOOP'), headset: inSt('HS'), pd: inSt('PD'), hq: inSt('HQ'), vq: inSt('VQ'),
    n1, volume, range: [u16(range[0]!), u16(range[1]!)], class: cls,
  };
}

/** What a name comes to in the table (research 122 §§3, 8). */
export type UiSoundResolution =
  /** A sound of a loaded bank: the slot's bank, the index, and the name the bank files at that index. */
  | { kind: 'bank'; name: string; object: SoundObject; bank: string; bankName: string | null; index: number; oneShot: boolean }
  /** An `ST` entry: a VAG stream (research 81 §1, 124). */
  | { kind: 'stream'; name: string; object: SoundObject }
  /** An `ST` + `HS` entry while `DAT_0045a0c1` is 0: the headset queue (`HEADSET_ROUTE_READING`). */
  | { kind: 'headset'; name: string; object: SoundObject }
  /** A `GROUPS` group (`UI_GROUP_PICK_READING`). */
  | { kind: 'group'; name: string; group: SoundGroupObject }
  /** The console's silence: no object (`no-entry`), the whole system off (`off`), or an object the guard refuses (`no-bank`). */
  | { kind: 'silent'; name: string; why: 'no-entry' | 'off' | 'no-bank'; object?: SoundObject };

/** The 989snd play a bank resolution comes to (`FUN_00343140` with the caller's arguments). */
export interface UiSoundWords {
  /** `SL_PLAYSOUND_A` (0x12) for a one-shot, `SL_PLAYSOUND` (0x11) with a handle otherwise. */
  call: typeof SL_PLAYSOUND | typeof SL_PLAYSOUND_A;
  /** The bank slot (989snd's word is that slot's handle, the IOP's: 0x00a00000 for HUDUI in the recomp's logs). */
  slot: number;
  sound: number;
  vol: number;
  /** -1: the sound's own `Pan` (`blocksnd.c` 97-99, 135-137). */
  pan: number;
  pitchMod: number;
  bend: 0;
}

/** The caller's half of a play: the volume factor, the pan and the pitch modifier (the zAnim's or the code's). */
export interface UiSoundPlayArgs {
  volume: number;
  pan: number;
  pitchMod: number;
  /** `FUN_00342aa0`: the call forces the one-shot bit (the `+0x1c` path: SELECTION, TELETYPE, the keyboard, `.METAL`). */
  forceOneShot?: boolean;
}

/**
 * `FUN_00343140`'s volume word, as single-precision floats and the `cvt.w.s` truncation: `volume x 1024`, times
 * `VOLUME`, times `DAT_003e0070`. 1.2 -> 0x4cc, 0.8 -> 0x333, 0.7 -> 0x2cc: the recomp logs' words (research 122 §9).
 */
export function uiSoundVolumeWord(volume: number, entryVolume = 1): number {
  const a = Math.fround(Math.fround(volume) * 1024);
  const b = Math.fround(a * Math.fround(entryVolume));
  return Math.trunc(Math.fround(b * SOUND_PLAY_FACTOR));
}

/** The 989snd words of a bank play (a `bank` resolution and the caller's arguments). */
export function uiSoundWords(r: Extract<UiSoundResolution, { kind: 'bank' }>, args: UiSoundPlayArgs): UiSoundWords {
  const oneShot = args.forceOneShot === true || r.object.oneShot;
  return {
    call: oneShot ? SL_PLAYSOUND_A : SL_PLAYSOUND, slot: r.object.slot, sound: r.index,
    vol: uiSoundVolumeWord(args.volume, r.object.volume), pan: args.pan, pitchMod: args.pitchMod, bend: 0,
  };
}

/** The table: the objects by hash, the bank records by slot. */
export class UiSoundTable {
  private readonly objects = new Map<number, SoundTableObject>();
  /** The bank records, by slot (`DAT_0048dbf0`). */
  readonly banks: SoundBankRecord[] = [];
  /** `DAT_0048dd28` (`SOUND_OFF_SWITCH_READING`): while true every lookup answers null and nothing loads. */
  off: boolean = SOUND_OFF_SWITCH_READING;
  /** `DAT_0045a0c1`, read by the `HS` test (D:L242200): 0 sends an `HS` entry to the headset queue. */
  netFlag = false;

  /** Equal hashes are not told apart by the original's sorted vector; the first loaded is kept and the rest counted. */
  readonly collisions: { hash: number; kept: SoundTableObject; dropped: SoundTableObject }[] = [];

  private insert(o: SoundTableObject): void {
    const had = this.objects.get(o.hash);
    if (had) this.collisions.push({ hash: o.hash, kept: had, dropped: o });
    else this.objects.set(o.hash, o);
  }

  /**
   * `FUN_00344090(parent, block)`: the bank record (`bank` null: not on the disc, status -1), then `SETS`' block, found
   * by its upper-cased name; a block `SETS` lacks adds nothing and still takes its slot. Answers the slot.
   */
  loadBlock(script: RdrNode, block: string, bank: Pick<SoundBank, 'names'> | null): number {
    if (this.off) return 0;
    const slot = this.banks.length;
    this.banks.push({ name: block, loaded: bank !== null, bank });
    const list = soundRdrFind(soundRdrFind(script, 'SETS'), block.toUpperCase());
    elements(list).forEach((entry, i) => this.insert(soundObjectOf(entry, block, slot, i)));
    return slot;
  }

  /** `FUN_00348130(name)`: every group of `GROUPS/<name>`, an object each, keyed by the hash of its name. */
  loadGroups(script: RdrNode, name: string): number {
    if (this.off) return 0;
    let n = 0;
    for (const g of elements(soundRdrFind(soundRdrFind(script, 'GROUPS'), name))) {
      const gname = Array.isArray(g) && typeof g[0] === 'string' ? g[0] : null;
      if (gname === null || gname === '') continue;
      const members = elements(soundRdrFind(g, 'ENTRIES')).flatMap((e) => (Array.isArray(e) && typeof e[0] === 'string' ? [e[0]] : []));
      this.insert({ kind: 'group', hash: soundHash(gname), block: name, name: gname, members });
      n++;
    }
    return n;
  }

  /** `FUN_00344f30`: the object a name hashes to, or null (none, or the system off). */
  lookup(name: string): SoundTableObject | null {
    if (this.off) return null;
    return this.objects.get(soundHash(name)) ?? null;
  }

  /** Every object, in load order. */
  all(): SoundTableObject[] { return [...this.objects.values()]; }

  /** How many objects the table holds. */
  get size(): number { return this.objects.size; }

  /** What a play of `name` comes to: `lookup`, then `FUN_00343140`'s guard and branches. */
  resolve(name: string): UiSoundResolution {
    if (this.off) return { kind: 'silent', name, why: 'off' };
    const o = this.lookup(name);
    if (!o) return { kind: 'silent', name, why: 'no-entry' };
    if (o.kind === 'group') return { kind: 'group', name, group: o };
    const rec = this.banks[o.slot];
    if (!rec || !(rec.loaded || o.streamed)) return { kind: 'silent', name, why: 'no-bank', object: o };   // D:L242194-242196
    if (o.headset && !this.netFlag) return { kind: 'headset', name, object: o };                          // D:L242200-242203
    if (o.streamed) return { kind: 'stream', name, object: o };
    let bankName: string | null = null;
    for (const [n, i] of rec.bank?.names ?? []) if (i === o.index) { bankName = n; break; }
    return { kind: 'bank', name, object: o, bank: rec.name, bankName, index: o.index, oneShot: o.oneShot };
  }
}

/** `sounds.rdr` out of `RUN/SOUNDRDR.ZAR`, undecoded into blocks: the tree `UiSoundTable` reads. */
export function soundScriptRoot(soundRdrZar: Uint8Array): RdrNode {
  const zar = Zar.parse(soundRdrZar);
  const key = zar.root.children.find((k) => k.name.toLowerCase() === 'sounds.rdr');
  if (!key) throw new Error('SOUNDRDR.ZAR has no sounds.rdr');
  return parseRdr(zar.data(key));
}

/**
 * The menu init's table (`FUN_001f4860` D:L54850-54853): `HUDUI`, `SMUS`, `UIVOICE` with the banks the caller holds
 * (by block name; the disc has `HUDUI.bnk` alone), then `GROUPS/UI`.
 */
export function frontEndSoundTable(script: RdrNode, banks: ReadonlyMap<string, Pick<SoundBank, 'names'>>): UiSoundTable {
  const t = new UiSoundTable();
  for (const b of FRONT_END_SOUND_BLOCKS) t.loadBlock(script, b, banks.get(b) ?? null);
  t.loadGroups(script, FRONT_END_SOUND_GROUPS);
  return t;
}

// ---------------------------------------------------------------------------------------------------------------------
// The names the code reads out of the dialog files.

/** `uisounds.rdr`'s three (`RUN/UI/READERC.ZAR`, `data/common/dialog`): `SOUNDS (TELETYPE BACK SELECTION)`. */
export interface UiSoundNames {
  /** `TELETYPE` (menu state +0x14), resolved at each use. */
  teletype: string;
  /** `BACK` (+0x20), resolved at each use (`SwitchMenu PREVIOUS_SCREEN`). */
  back: string;
  /** `SELECTION`, resolved once into `DAT_00408564`. */
  selection: string;
}

/**
 * The menu init's read of `uisounds.rdr` (D:L54829-54848 and D:L54857-54880): `SOUNDS`, then each key's string
 * (`FUN_0032ee10`); a key that is absent leaves an empty name (`FUN_001ee780`), and `SELECTION`'s absent default is the
 * literal `""` at 0x3e2d98 -- hash 0, no entry. A file with no `SOUNDS` reads three empty names.
 */
export function uiSoundNames(uisounds: RdrNode): UiSoundNames {
  const s = soundRdrFind(uisounds, 'SOUNDS');
  return {
    teletype: soundRdrString(s, 'TELETYPE') ?? '',
    back: soundRdrString(s, 'BACK') ?? '',
    selection: soundRdrString(s, 'SELECTION') ?? '',
  };
}

/** The soft keyboard's six sounds by `FUN_00395de0`'s slot (D:L289054-289088). */
export const KEYBOARD_SOUND_KEYS = ['ScaleUpSound', 'ScaleDownSound', 'NavigationSound', 'KeyPressSound', 'KeyPressEnterSound', 'NegativeSound'] as const;
export type KeyboardSoundKey = (typeof KEYBOARD_SOUND_KEYS)[number];

/**
 * `UiParams.rdr` `CommonSoftKeyboardProps`' six names (`FUN_00397070` D:L289706-289795, keys at ELF 0x3fb6c0-0x3fb720),
 * in `FUN_00395de0`'s slot order (`FUN_00397bc0` D:L290055-290094 resolves each into the slot's pointer); an absent
 * key leaves an empty name. The strings stand as the file spells them: `ScaleDownSound` is `".SLIDE\t"`.
 */
export function keyboardSoundNames(uiParams: RdrNode): string[] {
  const props = soundRdrFind(uiParams, 'CommonSoftKeyboardProps');
  return KEYBOARD_SOUND_KEYS.map((k) => soundRdrString(props, k) ?? '');
}

/** The front end's code literals (research 122 §1.4): `PopUpDialog`'s `.METAL` (ELF 0x3ef3c0) and `SND_NEG` (0x3f7858). */
export const UI_POPUP_SOUND = '.METAL';
export const UI_REFUSAL_SOUND = 'SND_NEG';
