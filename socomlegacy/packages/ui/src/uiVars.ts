/**
 * The UI variables: `CUIVariable` and `CUIVarManager` (PLAT-09; research 104 §4-§6).
 *
 * Read from the retail decompilation (`D:L<line>` = a line of `socom2_game.elf.decomp.c`; names from
 * `recomp/socom2_names.csv`; reCOM `zUI/zui.h:27-52` names the class and the longevity enum, which the code's own words
 * agree with):
 * - **The manager** is one global at 0x437e80: a vector of 0x30-byte `CUIVariable`s sized to **256** at start-up
 *   (`FUN_002b1390(0x437e80, 0x100)`, D:L328198). A slot whose longevity (+0x24) is 0 is dormant: free, and skipped by
 *   every lookup. A var's name is +0x14, matched with `strcasecmp` (0x198b80).
 * - **A var's value** is a reader node (`_zrdr`, +0..+7): integer (1), real (2), string (3) or array (4) -- the types
 *   `FUN_003860f0` (D:L279730-279791) prints as `%d`, `%f`, `%s` and element by element -- or the empty node (0) a
 *   never-used slot holds (the vector's template `FUN_002b17e0`, D:L155185-155198).
 * - **The longevity** (+0x24): 0 dormant, 1 temporary, 2 permanent, 3 persistent. Temporary vars are made dormant at
 *   the state changes that call `FUN_00385c30`; persistent ones are what `CUIVarManager_Serialize` writes.
 *
 * What reaches the card is OPT-02's: the JSON record in PLAT-25's slot (R7; PLAT-27 and its codec dropped).
 * `uiVarsToSerialize` hands OPT-02 the ordered, typed list.
 */
import { VALVE_TYPE, type ValveStore } from './valves';

/** `UIVAR_LONGEVITY` (zui.h; the words of `CUIVariableSpec`, FUN_00386ff0 D:L280328-280346). */
export const UIVAR_LONGEVITY = { DORMANT: 0, TEMPORARY: 1, PERMANENT: 2, PERSISTENT: 3 } as const;
export type UiVarLongevity = (typeof UIVAR_LONGEVITY)[keyof typeof UIVAR_LONGEVITY];
/** A held var's longevity: never dormant. */
export type LiveLongevity = Exclude<UiVarLongevity, 0>;

/** The manager's slots (`FUN_002b1390(0x437e80, 0x100)`, D:L328198). */
export const UIVAR_SLOTS = 256;

/** The reader node types a var holds (reCOM `zrdr.h` ZRDR_TYPE; `FUN_003860f0`). */
export const UIVAR_TYPE = { int: 1, real: 2, string: 3, array: 4 } as const;

/**
 * A var's value: a reader node. A real is an f32 (`Math.fround`; the manager stores it so). `none` is the type-0 node
 * of a slot never used: the template `FUN_002b17e0` (D:L155185-155198) clears the type byte and the length and never
 * writes the value word, and `FUN_002b1390` copies it into every slot (D:L155042-155053); a copy of it
 * (`FUN_0032f390` D:L230360-230440, which Serialize uses) carries the type and length only, so it has no value.
 */
export type UiVarValue =
  | { readonly type: 'none' }
  | { readonly type: 'int'; readonly value: number }
  | { readonly type: 'real'; readonly value: number }
  | { readonly type: 'string'; readonly value: string }
  | { readonly type: 'array'; readonly value: readonly UiVarValue[] };

/** A held var. Change its value through `UiVarManager.set` so the attached items hear of it. */
export interface UiVariable {
  readonly name: string;
  value: UiVarValue;
  longevity: LiveLongevity;
}

/** An item bound to a var (a dialog object's `UpdateUIVar`, vtable +0xc), told the var when its value changes. */
export type UiVarListener = (v: UiVariable) => void;

/** A UiVars entry (`mission.rdr` `UiVars`, `CUIVariableSpec`): `NAME`, `VALUE`, the optional `LONGEVITY` word. */
export interface UiVarEntry { name: string; value: UiVarValue | null; longevity?: string }

/** The empty node of a slot never used (`FUN_002b17e0` D:L155185-155198): type 0, no value. */
export const UIVAR_NONE: UiVarValue = { type: 'none' };

/**
 * The value of a var added without one in a slot `clearTemporary` freed: `FUN_00386b00` (D:L280167-280186) sets the
 * node's type to integer and leaves its value word as the old var's (an integer, an f32's bits, a string's pointer).
 * Reading: integer 0 -- the stale word is not carried. [reading]
 */
export const UIVAR_REUSED_VALUE_READING: UiVarValue = { type: 'int', value: 0 };

/**
 * A UiVars entry's `LONGEVITY` word (`CUIVariableSpec` FUN_00386ff0 D:L280328-280346): `PERSISTENT` 3, `PERMANENT` 2,
 * `TEMPORARY` 1, matched with `strcasecmp`; none, or another word, is 1.
 */
export function uiVarLongevityOf(word: string | undefined): LiveLongevity {
  const w = word?.toUpperCase();
  return w === 'PERSISTENT' ? 3 : w === 'PERMANENT' ? 2 : 1;
}

/**
 * Whether two values are the same (`FUN_00335e20` D:L234579-234631, per element `FUN_003352f0`
 * D:L234114-234247): the same type and an equal value -- strings by `strcmp`, reals as f32s (D:L234624-234626),
 * arrays element by element and only when non-empty (two empty arrays are never the same). Two type-0 nodes are never
 * the same: no branch handles type 0 (D:L234599-234628).
 */
export function sameUiVarValue(a: UiVarValue, b: UiVarValue): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case 'none': return false;
    case 'array': {
      const bv = (b as Extract<UiVarValue, { type: 'array' }>).value;
      return a.value.length !== 0 && a.value.length === bv.length && a.value.every((e, i) => sameUiVarValue(e, bv[i]!));
    }
    case 'real': return Math.fround(a.value) === Math.fround((b as Extract<UiVarValue, { type: 'real' }>).value);
    default: return a.value === (b as { value: unknown }).value;
  }
}

/** A value as the node holds it: every real (an array's too) rounded to its f32. */
function asStored(v: UiVarValue): UiVarValue {
  if (v.type === 'real') return { type: 'real', value: Math.fround(v.value) };
  if (v.type === 'array') return { type: 'array', value: v.value.map(asStored) };
  return v;
}

interface Slot { name: string; value: UiVarValue; longevity: UiVarLongevity; attached: UiVarListener[] }

/** A slot never used: the template's empty node. */
const fresh = (): Slot => ({ name: '', value: UIVAR_NONE, longevity: 0, attached: [] });
/** A slot `clearTemporary` freed (`FUN_00386b00`): an integer node, `UIVAR_REUSED_VALUE_READING`. */
const freed = (): Slot => ({ name: '', value: UIVAR_REUSED_VALUE_READING, longevity: 0, attached: [] });

/** The manager. One per game, as the original's global. */
export class UiVarManager {
  private readonly slots: Slot[] = Array.from({ length: UIVAR_SLOTS }, fresh);

  /** The live var of `name` (`FUN_00385900` D:L279445-279465: strcasecmp, the first live slot), or undefined. */
  find(name: string): UiVariable | undefined {
    return this.live(name) as UiVariable | undefined;
  }

  /** Every live var, in slot order -- the order `CUIVarManager_Serialize` walks. */
  all(): UiVariable[] {
    return this.slots.filter((s) => s.longevity !== 0) as UiVariable[];
  }

  /**
   * `CUIVarManager_Add` (FUN_003857c0 D:L279409-279443). A held name: its value is set only while it is temporary
   * (D:L279434-279436), and its longevity raised to `longevity` if that is higher (D:L279438-279440). A new name takes
   * the first dormant slot (`FUN_003859d0` D:L279467-279487, `FUN_00386b80` D:L280188-280203); with none left the
   * original has no slot to give (it writes through a null pointer), and this throws.
   */
  add(name: string, value: UiVarValue | null, longevity: LiveLongevity): UiVariable {
    let s = this.live(name);
    if (!s) {
      s = this.slots.find((x) => x.longevity === 0);
      if (!s) throw new Error(`no dormant UI var slot for ${name} (${UIVAR_SLOTS} held)`);
      s.name = name;
      s.longevity = longevity;
      if (value) this.write(s, value);
    } else if (value && s.longevity !== 3 && s.longevity !== 2) {
      this.write(s, value);
    }
    if (s.longevity < longevity) s.longevity = longevity;
    return s as UiVariable;
  }

  /** Set a var's value (`FUN_00386460` D:L279844-279889): the same value does nothing; another tells the items. */
  set(v: UiVariable | string, value: UiVarValue): void {
    const s = this.slotOf(v);
    if (s) this.write(s, value);
  }

  /**
   * Bind an item to a var (`FUN_00385df0` D:L279605-279624 through `FUN_003869f0`): appended to its list once. The
   * returned function unbinds it (`FUN_00385d90` D:L279582-279603).
   */
  attach(v: UiVariable | string, listener: UiVarListener): () => void {
    const s = this.slotOf(v);
    if (!s) throw new Error(`no UI var ${typeof v === 'string' ? v : v.name}`);
    if (!s.attached.includes(listener)) s.attached.push(listener);
    return () => { const i = s.attached.indexOf(listener); if (i >= 0) s.attached.splice(i, 1); };
  }

  /**
   * Store a longevity directly, as `InitSystemTuners` does over `Add`'s (D:L282255): no raise-only rule, so a
   * persistent var can be lowered.
   */
  setLongevity(v: UiVariable | string, longevity: LiveLongevity): void {
    const s = this.slotOf(v);
    if (s) s.longevity = longevity;
  }

  /**
   * Make every temporary var dormant (`FUN_00385c30` D:L279534-279555, through `FUN_00386b00`): its items unbound
   * (`FUN_00386660` D:L279891-279915), its name dropped, its slot free for the next `add`.
   */
  clearTemporary(): void {
    this.slots.forEach((s, i) => { if (s.longevity === 1) this.slots[i] = freed(); });
  }

  /**
   * Read a persistent var back (`FUN_00385610` D:L279351-279372): `add` at 3, then `set` (D:L279368-279369). The
   * original is handed the saved **record** -- an array node, as Serialize wraps each var (`FUN_003339b0`,
   * `FUN_00333540`, D:L279395-279396) -- and passes on its **first element** when it is an array with a non-zero count,
   * else nothing (D:L279361-279367: `add` with no value, then `set` with a null node). `value` here is that first
   * element: a caller unwraps the record first. The no-element case is not expressible here; no caller needs it yet
   * (OPT-02's).
   */
  restore(name: string, value: UiVarValue): UiVariable {
    const v = this.add(name, value, 3);
    this.set(v, value);
    return v;
  }

  /** A mission's `UiVars` (`FUN_002acc10` D:L152356-152382): each entry `add`ed at its longevity word's level. */
  loadUiVars(entries: Iterable<UiVarEntry>): void {
    for (const e of entries) this.add(e.name, e.value, uiVarLongevityOf(e.longevity));
  }

  private live(name: string): Slot | undefined {
    const n = name.toUpperCase();
    return this.slots.find((s) => s.longevity !== 0 && s.name.toUpperCase() === n);
  }

  private slotOf(v: UiVariable | string): Slot | undefined {
    if (typeof v === 'string') return this.live(v);
    return this.slots.find((s) => s === v && s.longevity !== 0);
  }

  private write(s: Slot, value: UiVarValue): void {
    if (sameUiVarValue(s.value, value)) return;
    s.value = asStored(value);
    for (const l of [...s.attached]) l(s as UiVariable);
  }
}

/** One entry of the card's UI vars, as `CUIVarManager_Serialize` hands it on: the name and the typed value. */
export interface SerializedUiVar { name: string; value: UiVarValue }

/** The two names the serialize rule holds back (0x3fa490, 0x3fa4a0; D:L279391-279392). */
const PASSWORD_VARS = ['PLAYERPASSWORD', 'STORE_PASSWORD'];

/**
 * The vars `CUIVarManager_Serialize` (FUN_00385670 D:L279374-279407) writes, in its order: every live var of
 * longevity 3 with a name -- a non-null name pointer (D:L279390), so a var named "" is written; only a dormant slot
 * has none (`FUN_00386b00`) -- in slot order (D:L279386-279389), except `PLAYERPASSWORD` and `STORE_PASSWORD` (strcasecmp)
 * unless the valve `SecurePassword` is non-zero (D:L279384-279385, D:L279390-279394). Each becomes a record keyed by
 * its name (`FUN_0033d250`, D:L279398); OPT-02 keeps it in the slot's JSON (R7).
 */
export function uiVarsToSerialize(vars: readonly UiVariable[], securePassword: number): SerializedUiVar[] {
  return vars
    .filter((v) => v.longevity === 3)
    .filter((v) => securePassword !== 0 || !PASSWORD_VARS.includes(v.name.toUpperCase()))
    .map((v) => ({ name: v.name, value: v.value }));
}

/**
 * The same over the live stores: `SecurePassword` is read through `FUN_00351ff0` at PERM (D:L279384), which makes it
 * at 0 when it is absent.
 */
export function serializeUiVars(manager: UiVarManager, valves: ValveStore): SerializedUiVar[] {
  return uiVarsToSerialize(manager.all(), valves.acquire('SecurePassword', VALVE_TYPE.PERM).value);
}

/**
 * The tuners `InitSystemTuners` (FUN_0038a7a0 D:L282238-282472) makes, in order: the var each binds (strings at
 * 0x3fa918-0x3fa9a0) and the real it writes when the var does not already hold it (D:L282262, 282287, 282312, 282433,
 * 282458; f32 words 0x3f800000, 0x3f3d70a4, 0x3f000000, 0x3f800000, 0x3f400000). The three stick vars are bound twice
 * (the tuner's third word 0, then 1) and get no default here.
 */
export const SYSTEM_TUNERS: ReadonlyArray<{ name: string; default: number | null }> = [
  { name: 'SOUND_VOLUME', default: 1 },
  { name: 'MUSIC_VOLUME', default: Math.fround(0.74) },
  { name: 'BRIGHTNESS', default: 0.5 },
  { name: 'STICK_SENSITIVITY', default: null },
  { name: 'STICK_INERTIA', default: null },
  { name: 'STICK_DEADZONE', default: null },
  { name: 'STICK_SENSITIVITY', default: null },
  { name: 'STICK_INERTIA', default: null },
  { name: 'STICK_DEADZONE', default: null },
  { name: 'DIALOG_VOLUME', default: 1 },
  { name: 'HEADSET_CONTROLLER', default: 0.75 },
];

/**
 * `InitSystemTuners` on the manager: each tuner's var `add`ed at 1, then longevity **2 stored over it** (e.g.
 * D:L282254-282255), then its default written if the var does not hold that real. Called from
 * `COurGame::StartEngine` (FUN_001e7430, D:L47894). The tuner objects themselves (their `UpdateUIVar`) are the
 * options screen's (OPT-03).
 */
export function initSystemTuners(manager: UiVarManager): void {
  for (const t of SYSTEM_TUNERS) {
    const v = manager.add(t.name, null, 1);
    manager.setLongevity(v, 2);
    if (t.default !== null) manager.set(v, { type: 'real', value: t.default });
  }
}

/**
 * The card's `CUIVarManager` module as R7's JSON (web research 301 §6; research 102 R102.9): `serializeUiVars`' list in
 * its order, one key a variable -- its name, as `FUN_0033d250` keys each record (D:L279398) -- holding the typed value.
 * It is written into the save file `BASCUS-97275SOCOMII` beside `CValveSaveManager` and `CAcctDB`. A password-class
 * variable is never in it, whatever `SecurePassword` says (`CARD_PASSWORD_UI_VARS_PLACEHOLDER`, the port's rule).
 */
export type UiVarModule = Record<string, UiVarValue>;

/**
 * CARD_PASSWORD_UI_VARS_PLACEHOLDER: the UI variables the card's `CUIVarManager` module never holds -- the port's rule,
 * not the original's (W15.R6, the merge controller in the owner's stead, 2026-10-09; OT.R17: no password on the card;
 * MISSION R7: no password client-side). The original's serialize holds back only `PLAYERPASSWORD` and `STORE_PASSWORD`
 * (0x3fa490, 0x3fa4a0; strcasecmp, D:L279391-279392) and only while the valve `SecurePassword` is 0 (D:L279384-279394);
 * `global_valves.rdr` makes `SecurePassword` 1 PERSIST, and SAVE PASSWORD: YES sets it 1, so the original would write
 * them. Here they are never written, nor the game passwords the keyboard types (`PlayerGamePassword`,
 * `SpectatorGamePassword`, research 119); matched case-blind as the original's test is. The list may grow: a screen not
 * yet built (a clan's, LAN's) may type another password into a UI variable. `uiVarsToSerialize` stays the original's
 * transcription; this filter is at the card's module (`uiVarModule`). `SecurePassword`'s own valve is kept as the
 * original keeps it (the flag, in `CValveSaveManager`), and the persona record holds at most SAVEPASSWORD and the
 * password's length (`@s2u/card` `persona.ts`; SAVE PASSWORD: YES honoured through the remember cookie since
 * 2026-10-17, MISSION OT.R61 -- the saved password's stand-in in PLAYERPASSWORD is held back here with it). [placeholder]
 */
export const CARD_PASSWORD_UI_VARS_PLACEHOLDER: readonly string[] = ['PLAYERPASSWORD', 'STORE_PASSWORD', 'PlayerGamePassword', 'SpectatorGamePassword'];

const CARD_PASSWORD_UI_VARS = new Set(CARD_PASSWORD_UI_VARS_PLACEHOLDER.map((n) => n.toUpperCase()));

export function uiVarModule(list: readonly SerializedUiVar[]): UiVarModule {
  const out: UiVarModule = {};
  for (const v of list) if (!CARD_PASSWORD_UI_VARS.has(v.name.toUpperCase())) out[v.name] = v.value;   // CARD_PASSWORD_UI_VARS_PLACEHOLDER
  return out;
}

/** Whether `x` is a value as the module holds it: a typed node, an array's elements too. */
function isUiVarValue(x: unknown): x is UiVarValue {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return false;
  const v = x as { type?: unknown; value?: unknown };
  switch (v.type) {
    case 'none': return Object.keys(v).length === 1;
    case 'int': return Number.isSafeInteger(v.value);
    case 'real': return typeof v.value === 'number' && Number.isFinite(v.value);
    case 'string': return typeof v.value === 'string';
    case 'array': return Array.isArray(v.value) && v.value.every(isUiVarValue);
    default: return false;
  }
}

/**
 * The keys a card's module is read back for: the ten a card gains online (research 102 R102.9; `one.bin`, `two.bin`),
 * `MPLOCALSOP1-5` and `MPTAUNTMSG1-5`. Any other key of the module is dropped: a card's data is not trusted to fill the
 * manager's 256 slots (a slot short, `add` throws) -- the review of web research 301's rework. [reading]
 */
export const UI_VAR_MODULE_KEYS_READING: readonly string[] = [1, 2, 3, 4, 5].map((n) => `MPLOCALSOP${n}`).concat([1, 2, 3, 4, 5].map((n) => `MPTAUNTMSG${n}`));

/**
 * The system tuners a card's module is read back for too (web research 302 §4; R104.10 as revised 2026-10-07):
 * OPTIONS' sliders bind them with a `UIVAR` spec of `LONGEVITY PERSISTENT` (`dlgOptions_Audio.rdr`'s four,
 * `dlgOptions_Video.rdr`'s BRIGHTNESS, `dlgControllerSelection.rdr`'s three, read on the disc); the slider's set-up
 * `FUN_003724f0` adds its var at D:L269307 through `CUIVarManager_Add` (`FUN_003857c0`), which raises a longevity
 * (D:L279438-279440, R104.7), so once a page's slider is built its var is persistent and `CUIVarManager_Serialize`
 * writes it (R104.9). Each is read back as a real in the slider's range (`TUNER_RANGE`); a stick var never set (`none`)
 * and a record of another type are skipped, the module's other keys read back regardless. Decided by the code; OPT-03's
 * save-and-relaunch run of the original is the proven level. [reading]
 */
export const UI_VAR_MODULE_TUNERS_READING: readonly string[] = [...new Set(SYSTEM_TUNERS.map((t) => t.name))];

/**
 * A slider-bound tuner's range: the knob's position is held in [0, 1] (`FUN_00371d00`'s clamps, `SliderWidget.move`) and
 * `sliderToUiVar` maps [0, 1] onto [0, 1] through any `CENTER_VALUE` in (0, 1); `SetValue` writes n / 100 of the
 * scripts' 0..100. Every one of the eight tuners is a slider's, so each is read back clamped into it.
 */
export const TUNER_RANGE: readonly [number, number] = [0, 1];

/**
 * The module's known variables read back (`UI_VAR_MODULE_KEYS_READING`, `UI_VAR_MODULE_TUNERS_READING`; `CUIVarManager`'s load: each record
 * `FUN_00385610`, `UiVarManager.restore` -- `add` at 3, then `set`; D:L279351-279372), in the file's order; the module's
 * other keys dropped. A module that is not an object, or a known key that is not a string value, restores nothing and
 * answers false, so the defaults (`dlgNetLogin`'s ONSTART) stand; no module (a card never online) is true with nothing
 * restored. It never throws: a manager that cannot take a value leaves the defaults and answers false.
 */
export function restoreUiVarModule(manager: UiVarManager, data: unknown): boolean {
  if (data === undefined) return true;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return false;
  const named = (list: readonly string[]) => Object.entries(data as Record<string, unknown>)
    .filter(([name]) => list.some((k) => k.toUpperCase() === name.toUpperCase()));
  const known = named(UI_VAR_MODULE_KEYS_READING), tuners = named(UI_VAR_MODULE_TUNERS_READING);
  if (!known.every(([, value]) => isUiVarValue(value) && value.type === 'string')) return false;
  try {
    for (const [name, value] of known) manager.restore(name, value as UiVarValue);
    // A tuner only as a real, clamped into the slider's range; any other record of a tuner is skipped (the ten stand).
    for (const [name, value] of tuners) {
      if (!isUiVarValue(value) || value.type !== 'real') continue;
      manager.restore(name, { type: 'real', value: Math.min(TUNER_RANGE[1], Math.max(TUNER_RANGE[0], value.value)) });
    }
  } catch {
    return false;
  }
  return true;
}
