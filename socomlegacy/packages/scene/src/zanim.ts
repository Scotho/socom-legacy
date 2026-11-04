import { Reader, type Zar, type ZarKey } from '@s2u/archive';

/**
 * The zAnim command archives -- `RUN/CZANIM.ZAR` (the common set), each map's `MZANIM.ZAR` (its `mission` set) and
 * `RUN/LDZANIM.ZAR` (the loading screen's) -- read the way `CZAnimMain::LoadZAR` 0x267ab0, `CZAnimNameTable::Load`
 * 0x268c00, `CZAnimSet::Load` 0x26bc50 and `CZAnim::Load` 0x26d370 walk them (the names are recomp/socom2_names.csv's;
 * their bodies are `FUN_00267ab0` D:L113462, `FUN_0026bc50` D:L115894 and `FUN_0026d370` D:L116925, research 319 §1.1;
 * *PAR-92, was:* "their bodies are not in the tree"). The structures are reCOM's (`zAnim/zanim.h`), and
 * socomlegacy/docs/research/77 §9 checks every field read here on all 66 archives of the 22 multiplayer maps: every count
 * equals its list, every animation's name index names its own key, every command stream tiles into sequences and
 * commands to the byte. The twelve campaign archives read too since PAR-92 (research 319 §4.2).
 *
 * These are the engine's effect, sound, camera and interface scripts, not the body's motions: no name table of any
 * of the 66 carries a clip of `MOTION_S.ZAR` or `MOTION_P.ZAR`, and the SoftImage scripts some maps carry are the
 * helicopter and F-18 flight paths (77 §9).
 */

/** `_zanim_main_params` (reCOM zAnim/zanim.h:357-364), `Anim_Main_Params`: 72, -98, 0, 0 on all 66 archives. */
export interface ZAnimMainParams {
  version: number;
  /** -98 on every archive: reCOM's `Open` default is -9.8 (anim_main.cpp:24), in metres. */
  gravity: number;
  /** `m_search_external_nodes` in bit 0 (zanim.h:361). */
  flags: number;
  userActionAnimIndex: number;
}

/** A `SoftImage_Script`'s `Script_Params`, 24 bytes (reCOM's `_zanim_si_script`, zanim.h:396-404, plus a frame time). */
export interface ZAnimSiScript {
  /** The `.anm` path and the object it drives, through the set's name table. */
  path: string;
  object: string;
  /** The word at +4: 0x19 or 0x11 on the 30 scripts; reCOM puts `spline_interp` here. Not decoded. */
  word: number;
  /** Seconds per frame, the f32 at +8: 1/30, 1/20, 1/15, 1/40 on the 30. */
  frameTime: number;
  frameCount: number;
  /** The `Script_Data` key's length, which it must equal. */
  dataSize: number;
}

/** `_zanim_anim_params` (zanim.h:366-394), `Anim_Params`: 24 bytes. */
export interface ZAnimParams {
  /** Into the animation's own name table: it names the animation's key on all 9,912 (77 §9). */
  nameIndex: number;
  rootNodeIndex: number;
  paused: number;
  state: number;
  /** reCOM's bitfield: activation (2), network (1), node search scope (2), the copy/instance bits, max copies (6). */
  flags: number;
  timer: number;
  priority: number;
  /** Damage, activation, execution, cleanup: byte offsets into `Seq_Data`, each a sequence's start. */
  seqOffsets: [number, number, number, number];
}

/**
 * ZANIM_PARENT_SENTINEL_READING (PAR-92, research 319 §1.2-§1.3, §2.2): a node reference's parent byte means what a
 * command's node byte means -- the resolver is one function, `FUN_0026f4e0`: 0 none (D:L118159-118160); 0xf9 the
 * animation's own instance node (+0x3c), else its root reference's node (D:L118170-118179); 0xfa the caller's node
 * through the context (`FUN_00272390`, D:L118164-118169); any other byte an index into the animation's references. The
 * byte arrives zero-extended (`lbu` at 0x26f600; compared whole with 250 and 249 at 0x26f518-0x26f544), so 0xf9 is 249,
 * never -7. The commands' `NODE_ROOT` / `NODE_CALLER` (`./effects`) are the same two values read signed [reading:
 * source inspection of the decompilation and the ELF's instructions, reviewed at research 319's PASS WITH FINDINGS;
 * one memory read of `otc_posechar`'s reference-2 slot after a campaign round's start would prove it].
 */
export const ZANIM_PARENT_SENTINEL_READING = { root: 0xf9, caller: 0xfa } as const;

/**
 * ZANIM_PARENT_OUT_OF_TABLE_PLACEHOLDER (PAR-92, research 319 §1.2, §5): a parent byte at or past the animation's count
 * that is neither sentinel. The original refuses nothing there: for count .. 254 its resolver appends blank references
 * until the index is inside the table (D:L118182-118184, the append D:L117501-117531) and the last resolves by the
 * animation's name 0, a lookup not traced; for 255 the growth never ends (the one-byte count wraps, D:L117514,
 * D:L117527). The port keeps the archive and leaves such a reference unresolved (`ZAnimNodeRef.unresolved`). Untraced;
 * no reference on the disc carries one (research 319 §4.2, U3 and U4), so it is a guard that never runs on retail data.
 */
export const ZANIM_PARENT_OUT_OF_TABLE_PLACEHOLDER = 'unresolvable' as const;

/**
 * A node reference's parent (`ZANIM_PARENT_SENTINEL_READING`): 0 none; an index into the same animation's references;
 * `root` (0xf9) the animation's instance, else its root reference's node; `caller` (0xfa) the caller's node; or
 * `ZANIM_PARENT_OUT_OF_TABLE_PLACEHOLDER`, a byte past the table that is no sentinel.
 */
export type ZAnimNodeParent = number | 'root' | 'caller' | typeof ZANIM_PARENT_OUT_OF_TABLE_PLACEHOLDER;

/** A `Node_Ref_List` record, 8 bytes: `_zanim_node_ref`'s bitfield (zanim.h:417-435), then a word. */
export interface ZAnimNodeRef {
  /**
   * Bits 0-7, typed (`ZAnimNodeParent`; the raw byte is `word & 0xff`). On the 22 multiplayer maps' 11,418 every
   * parent is 0 or an index below its animation's count (22 in-range non-zero, on MP10, MP11 and MP62); on the twelve
   * campaign maps 636 read 0xf9 (the four `otc_` character animations, `otc_posechar`'s references 2-26 among them) and
   * 27 an index (research 319 §4.2). *PAR-92, was:* "an index into the same list (below its length on all 11,418)".
   */
  parent: ZAnimNodeParent;
  /** Bits 8-18, resolved through the animation's name table. */
  name: string;
  /** Bits 19-21. */
  search: number;
  word: number;
  /**
   * The second word: reCOM's `node_ptr` (zanim.h:434), the slot the resolver fills -- `CZAnim::Load` zeroes it after
   * the read (D:L116961-116969), so the disc's value is never used (research 319 §1.6). Non-zero on 264 of the 11,418
   * multiplayer references. *PAR-92, was:* "0 on 11,154 of 11,418; not decoded".
   */
  flags: number;
  /** The initialisation/reset bits of `word` (`nodeRefInit`). */
  init: ZAnimNodeRefInit;
  /** Present when `parent` is `ZANIM_PARENT_OUT_OF_TABLE_PLACEHOLDER`: the line that says which byte of which count. */
  unresolved?: string;
}

/** The parent byte typed (`ZANIM_PARENT_SENTINEL_READING`): the sentinels first, then an index inside `count`. */
export function nodeRefParent(byte: number, count: number): ZAnimNodeParent {
  if (byte === ZANIM_PARENT_SENTINEL_READING.root) return 'root';
  if (byte === ZANIM_PARENT_SENTINEL_READING.caller) return 'caller';
  return byte < count ? byte : ZANIM_PARENT_OUT_OF_TABLE_PLACEHOLDER;
}

/**
 * The bits of a node reference's first word that set up and restore the node (research 209 s4, 171 s4). reCOM's
 * `_zanim_node_ref` (zanim.h:417-435) names them after the 22-bit `parent_index`/`name_index`/`node_search` field, in
 * this order: `is_light`, `created_here`, `stop_on_exit`, `on_world_lightlist` (bits 22-25), `save_translation` (26),
 * `save_rotation` (27), `save_active` (28), `save_parent` (29), `is_local_light` (30), `set_inactive` (31). reCOM
 * declares them as `bool`s, so the bit numbers are its declaration order packed into the disc's word -- a reading
 * that agrees with the retail code on the two the code was read for: `FUN_0026b5e0` (D:L115740-115750) clears the
 * node's active state under bit 31 before saving it under bit 28; `FUN_0026b430` (D:L115690-115721) and `FUN_0026c4f0`
 * restore what was saved, at the round's reset (`FUN_002ac0e0` D:L151976-151991).
 */
export interface ZAnimNodeRefInit {
  /** Bit 31, `set_inactive`: the node is made inactive when the animation set initialises. */
  deactivate: boolean;
  /** Bit 28, `save_active`: its active state (after bit 31) is saved and restored at a reset. */
  saveActive: boolean;
  /** Bit 26, `save_translation`. */
  saveTranslation: boolean;
  /** Bit 27, `save_rotation`. */
  saveRotation: boolean;
  /** Bit 29, `save_parent`: its parent is saved and restored (the debris reparented to the world). */
  saveParent: boolean;
}

/** A node reference's init bits (`ZAnimNodeRefInit`), out of its first word. */
export function nodeRefInit(word: number): ZAnimNodeRefInit {
  const bit = (n: number): boolean => ((word >>> n) & 1) === 1;
  return { deactivate: bit(31), saveActive: bit(28), saveTranslation: bit(26), saveRotation: bit(27), saveParent: bit(29) };
}

/** One command: `_zanim_cmd_hdr` (zanim.h:342-348), its payload not decoded. */
export interface ZAnimCommand {
  /** Byte offset in `Seq_Data`. */
  offset: number;
  /** The 16-bit data type: `cmd` in the low byte, the registered command `set` in the high (`zanim_cmd_index`). */
  type: number;
  set: number;
  cmd: number;
  quadAlign: boolean;
  timeless: boolean;
  /** Bytes, the header included (bits 18-31). */
  size: number;
  /**
   * The command's own bytes, its header included: a view into the animation's `Seq_Data`, not a copy. The effect
   * commands' payloads are decoded from it (`./effects`, socomlegacy/docs/research/89).
   */
  bytes: Uint8Array;
}

/** A sequence: a 28-byte `_zsequence` head (zanim.h:463-481) and its commands. */
export interface ZAnimSequence {
  offset: number;
  /** Through the animation's name table: `NA` for most, `fire_rotate`, `light_at_muzzle` ... for the named. */
  name: string;
  /** The second word (paused, activation, state, ...): 0x102 or 0x104 on most. */
  word: number;
  /** Bytes, the head included. */
  size: number;
  commands: ZAnimCommand[];
}

/**
 * An animation's `Anim_Health` key, 24 bytes (MAP-06; research 174 s3, 173 s4, 203 s7): the damage block a kind-3
 * animation's destructible is built from. `FUN_002740e0` (D:L121135-121218) builds the interface at the target node's
 * `+0x94` (vtable 0x406090): the target is the u8 node reference at +0 (D:L121150-121151; +1..+3 padding), the shield
 * the f32 at +0x14 (D:L121195-121208); `FUN_00273960` (D:L120884-120888) restores health and armour from their reset
 * pairs. The runtime object's members (reCOM `zAnim/zanim.h:625-638`): shield +0x10, armour +0x14/+0x18, health
 * +0x1c/+0x20. On the 22 maps the reset health equals the health and the armour reads 0 (research 203 s7).
 */
export interface AnimHealth {
  /** Into the animation's `nodeRefs`: the node the destructible hangs on. */
  nodeRef: number;
  health: number;
  healthReset: number;
  armor: number;
  armorReset: number;
  /** The damage eligibility threshold: a hit or a charge qualifies at a rating at least this. */
  shield: number;
}

/** One animation of a set's `Animation_List`. */
export interface ZAnimAnimation {
  name: string;
  params: ZAnimParams;
  /** Its `Name_Index_Table` resolved through the set's name table: index 0 is `NA`. */
  names: string[];
  nodeRefs: ZAnimNodeRef[];
  /** The `Anim_Health` block, decoded (`AnimHealth`), or null where the animation has none. */
  health: AnimHealth | null;
  sequences: ZAnimSequence[];
}

/**
 * Whether the engine builds a destructible from this animation (`FUN_002713f0` D:L119312-119335): its state is 1 or 5,
 * its `Anim_Params` flags' low three bits read 3 (activation by damage), and it carries an `Anim_Health` block.
 */
export function isDestructibleAnim(a: Pick<ZAnimAnimation, 'params' | 'health'>): boolean {
  return a.health !== null && (a.params.state === 1 || a.params.state === 5) && (a.params.flags & 7) === 3;
}

/** One set of `Anim_Sets`. */
export interface ZAnimSet {
  name: string;
  names: string[];
  rdrPaths: string[];
  siScripts: ZAnimSiScript[];
  anims: ZAnimAnimation[];
}

/** A whole zAnim archive. */
export interface ZAnimArchive {
  main: ZAnimMainParams;
  /** The top-level `Name_Table`: empty on all 66. */
  names: string[];
  sets: ZAnimSet[];
}

const SEQ_HEAD = 28, ANIM_PARAMS = 24, SI_PARAMS = 24, NODE_REF = 8, ANIM_HEALTH = 24;

/** Reads a zAnim archive (77 §9); throws where a count, a name, a size or a stream disagrees. */
export function parseAnimSets(zar: Zar): ZAnimArchive {
  const need = (parent: ZarKey, name: string, path: string): ZarKey => {
    const k = zar.child(parent, name);
    if (!k) throw new Error(`zAnim ${path}: no ${name} key`);
    return k;
  };
  const u32Of = (parent: ZarKey, name: string, path: string): number => {
    const k = need(parent, name, path);
    if (k.size !== 4) throw new Error(`zAnim ${path}/${name}: ${k.size} bytes, expected 4`);
    return new Reader(zar.data(k)).u32(0);
  };
  /** A `*_Count` key and the list it counts: the list's children are the names (77 §9). */
  const countedNames = (parent: ZarKey, count: string, listName: string, path: string): string[] => {
    const n = u32Of(parent, count, path);
    const listKey = zar.child(parent, listName);
    const names = (listKey?.children ?? []).map((k) => k.name);
    if (names.length !== n) throw new Error(`zAnim ${path}: ${count} ${n} but ${names.length} in ${listName}`);
    return names;
  };

  const mainKey = need(zar.root, 'Anim_Main_Params', '');
  if (mainKey.size !== 16) throw new Error(`zAnim Anim_Main_Params: ${mainKey.size} bytes, expected 16`);
  const m = new Reader(zar.data(mainKey));
  const main: ZAnimMainParams = { version: m.u32(0), gravity: m.f32(4), flags: m.u32(8), userActionAnimIndex: m.i32(12) };
  const names = countedNames(zar.root, 'Name_Table_Count', 'Name_Table', '');
  const setsKey = need(zar.root, 'Anim_Sets', '');
  const setCount = u32Of(zar.root, 'Anim_Set_Count', '');
  if (setsKey.children.length !== setCount) throw new Error(`zAnim: Anim_Set_Count ${setCount} but ${setsKey.children.length} sets`);

  const sets = setsKey.children.map((setKey): ZAnimSet => {
    const path = setKey.name;
    const setNames = countedNames(setKey, 'Name_Table_Count', 'Name_Table', path);
    const nameAt = (i: number, what: string): string => {
      const s = setNames[i];
      if (s === undefined) throw new Error(`zAnim ${path}: ${what} names index ${i} of ${setNames.length}`);
      return s;
    };
    // `RdrPath_*` is absent from the loading screen's empty `Anim_Set`s (77 §9).
    const rdrPaths = zar.child(setKey, 'RdrPath_Count') ? countedNames(setKey, 'RdrPath_Count', 'RdrPath_List', path) : [];

    const siCount = u32Of(setKey, 'SoftImage_Script_Count', path);
    const siKeys = zar.child(setKey, 'SoftImage_Script_List')?.children ?? [];
    if (siKeys.length !== siCount) throw new Error(`zAnim ${path}: SoftImage_Script_Count ${siCount} but ${siKeys.length} scripts`);
    const siScripts = siKeys.map((k, i): ZAnimSiScript => {
      const p = need(k, 'Script_Params', `${path}/script ${i}`);
      if (p.size !== SI_PARAMS) throw new Error(`zAnim ${path}/script ${i}: Script_Params ${p.size} bytes`);
      const r = new Reader(zar.data(p));
      const dataSize = r.i32(16), data = zar.child(k, 'Script_Data');
      if ((data?.size ?? 0) !== dataSize) throw new Error(`zAnim ${path}/script ${i}: size ${dataSize} but Script_Data holds ${data?.size ?? 0}`);
      return { path: nameAt(r.u16(0), 'a script path'), object: nameAt(r.u16(2), 'a script object'), word: r.u32(4), frameTime: r.f32(8), frameCount: r.i32(12), dataSize };
    });

    const animCount = u32Of(setKey, 'Animation_List_Count', path);
    const animKeys = zar.child(setKey, 'Animation_List')?.children ?? [];
    if (animKeys.length !== animCount) throw new Error(`zAnim ${path}: Animation_List_Count ${animCount} but ${animKeys.length} animations`);
    const anims = animKeys.map((a) => readAnimation(zar, a, `${path}/${a.name}`, nameAt, need, u32Of));
    return { name: setKey.name, names: setNames, rdrPaths, siScripts, anims };
  });
  return { main, names, sets };
}

function readAnimation(
  zar: Zar, key: ZarKey, path: string, nameAt: (i: number, what: string) => string,
  need: (parent: ZarKey, name: string, path: string) => ZarKey, u32Of: (parent: ZarKey, name: string, path: string) => number,
): ZAnimAnimation {
  const pk = need(key, 'Anim_Params', path);
  if (pk.size !== ANIM_PARAMS) throw new Error(`zAnim ${path}: Anim_Params ${pk.size} bytes, expected ${ANIM_PARAMS}`);
  const p = new Reader(zar.data(pk));
  const params: ZAnimParams = {
    nameIndex: p.u8(0), rootNodeIndex: p.u8(1), paused: p.u8(2), state: p.u8(3), flags: p.u32(4),
    timer: p.f32(8), priority: p.f32(12), seqOffsets: [p.u16(16), p.u16(18), p.u16(20), p.u16(22)],
  };

  // The animation's own name table: u16 indices into the set's (index 0 `NA`).
  const count = u32Of(key, 'Name_Index_Table_Count', path);
  const tk = need(key, 'Name_Index_Table', path);
  if (tk.size !== 2 * count) throw new Error(`zAnim ${path}: Name_Index_Table_Count ${count} but ${tk.size} bytes`);
  const t = new Reader(zar.data(tk));
  const names = Array.from({ length: count }, (_, i) => nameAt(t.u16(2 * i), `${key.name}'s name table`));
  const local = (i: number, what: string): string => {
    const s = names[i];
    if (s === undefined) throw new Error(`zAnim ${path}: ${what} ${i} outside its ${names.length}-name table`);
    return s;
  };
  if (local(params.nameIndex, 'name index') !== key.name) throw new Error(`zAnim ${path}: Anim_Params names itself ${names[params.nameIndex]}`);

  const refCount = u32Of(key, 'Node_Ref_Count', path);
  const rk = zar.child(key, 'Node_Ref_List');
  if ((rk?.size ?? 0) !== NODE_REF * refCount) throw new Error(`zAnim ${path}: Node_Ref_Count ${refCount} but ${rk?.size ?? 0} bytes of references`);
  const rr = rk ? new Reader(zar.data(rk)) : null;
  // PAR-92 (research 319 §1.1): `CZAnim::Load` checks no parent (D:L116957-116981); the byte is typed, never refused --
  // the sentinels 0xf9 / 0xfa, an index, or past the table (`ZANIM_PARENT_OUT_OF_TABLE_PLACEHOLDER`, kept unresolved).
  const nodeRefs = Array.from({ length: refCount }, (_, i): ZAnimNodeRef => {
    const word = rr!.u32(NODE_REF * i);
    const byte = word & 0xff, parent = nodeRefParent(byte, refCount);
    const ref: ZAnimNodeRef = { parent, name: local((word >>> 8) & 0x7ff, 'node reference name'), search: (word >>> 19) & 7, word, flags: rr!.u32(NODE_REF * i + 4), init: nodeRefInit(word) };
    if (parent === ZANIM_PARENT_OUT_OF_TABLE_PLACEHOLDER) ref.unresolved = `zAnim ${path}: node reference ${i}'s parent ${byte} of ${refCount}: unresolved (ZANIM_PARENT_OUT_OF_TABLE_PLACEHOLDER)`;
    return ref;
  });

  const size = u32Of(key, 'Seq_Data_Size', path);
  const sk = zar.child(key, 'Seq_Data');
  if ((sk?.size ?? 0) !== size) throw new Error(`zAnim ${path}: Seq_Data_Size ${size} but ${sk?.size ?? 0} bytes`);
  const sequences = sk ? readSequences(new Reader(zar.data(sk)), path, local) : [];
  const starts = new Set(sequences.map((s) => s.offset));
  for (const o of params.seqOffsets) if (size && !starts.has(o)) throw new Error(`zAnim ${path}: a sequence offset ${o} starts no sequence`);
  const hk = zar.child(key, 'Anim_Health');
  if (hk && hk.size !== ANIM_HEALTH) throw new Error(`zAnim ${path}: Anim_Health ${hk.size} bytes, expected ${ANIM_HEALTH}`);
  const hr = hk ? new Reader(zar.data(hk)) : null;
  const health: AnimHealth | null = hr
    ? { nodeRef: hr.u8(0), health: hr.f32(4), healthReset: hr.f32(8), armor: hr.f32(0xc), armorReset: hr.f32(0x10), shield: hr.f32(0x14) }
    : null;
  return { name: key.name, params, names, nodeRefs, health, sequences };
}

/** `Seq_Data`: sequences back to back, each a 28-byte head whose size covers its commands (77 §9). */
function readSequences(r: Reader, path: string, local: (i: number, what: string) => string): ZAnimSequence[] {
  const out: ZAnimSequence[] = [];
  let o = 0;
  while (o < r.length) {
    if (o + SEQ_HEAD > r.length) throw new Error(`zAnim ${path}: sequence at ${o} has no room for its head`);
    const size = r.i32(o + 12);
    if (size < SEQ_HEAD || o + size > r.length) throw new Error(`zAnim ${path}: sequence at ${o} claims ${size} bytes of ${r.length - o}`);
    const commands: ZAnimCommand[] = [];
    let c = o + SEQ_HEAD;
    while (c < o + size) {
      const h = r.u32(c), bytes = h >>> 18;
      if (bytes < 4 || c + bytes > o + size) throw new Error(`zAnim ${path}: command at ${c} claims ${bytes} bytes`);
      commands.push({
        offset: c, type: h & 0xffff, set: (h >>> 8) & 0xff, cmd: h & 0xff, quadAlign: (h & 1 << 16) !== 0, timeless: (h & 1 << 17) !== 0,
        size: bytes, bytes: r.bytes.subarray(c, c + bytes),
      });
      c += bytes;
    }
    out.push({ offset: o, name: local(r.u16(o), 'sequence name'), word: r.u32(o + 4), size, commands });
    o += size;
  }
  return out;
}
