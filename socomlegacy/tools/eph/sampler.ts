/**
 * The PCSX2 side's per-frame sampler of the emulator parity harness (EPH-2 step 3;
 * docs/specs/2026-10-30-emulator-parity-harness-design.md, "Per-frame records"). Product track (OT.R53): a validation
 * instrument, an adaptation, never in a build and never changing the game's behaviour.
 *
 * Ported from the desktop recompilation, read only, never run from here:
 * - desktop@be5578311:tools_py/parity/seal_speed_probe.py:363-395 -- `_f` (a word as a little-endian float) and
 *   `Sampler.sample`: the guest clock, the local actor (a null actor is counted and gives no row), its position words
 *   at +actor_pos, the root node's word 1 (NaN with no node), MoveScale, then the clock again -- a row whose two clock
 *   reads differ straddled a game frame and is dropped, counted as torn;
 * - desktop@be5578311:tools_py/parity/guest_addresses.py:57-62 (PROBE_ADDRESSES) and :376-380 (PROBE_OFFSETS), one
 *   column per revision (GUEST_ADDRESSES below). Its header, :10-15: "Falling back to r0001 without evidence is the one
 *   thing this must not do" -- another build's addresses read as silence or as a number (2026-10-31's first smoke: the
 *   r0001 clock word stood at 0 on the r0004 guest, every row constant garbage). So the build is detected at connect
 *   (detectRevision: the one whose guest clock advances), never assumed, and a field a column has no source for is
 *   null and not read;
 * - desktop@be5578311:tools_py/parity/seal_speed_probe.py:40-41 -- the wished stance byte at actor+0x374 (the probe's
 *   docstring, citing PlayerUpd in the decompilation; r0001, the probe's DEFAULT_REVISION at :89), read here as one byte
 *   before the second clock read, so a torn row covers it too;
 * - desktop@be5578311:tools_py/parity/seal_speed_probe.py:422-429 -- `Recorder.run`: a failed sample is counted and
 *   the sampling goes on after 50 ms (Recorder below; its stop after PINE_ERROR_LIMIT in a row is the harness's own).
 * These are instrument addresses for two disc revisions, not game values; a value read through them that reaches a
 * research note goes through `derive-from-desktop` first.
 */

/** The builds the table has a column for: the disc as shipped (r0001) and the online update (r0004). */
export type Revision = 'r0001' | 'r0004';
export const REVISIONS: readonly Revision[] = ['r0001', 'r0004'];

/** One build's instrument addresses: guest addresses, then displacements inside the local actor. */
export interface AddressColumn {
  /** The guest clock, a float of seconds. */
  readonly guestClock: number;
  /** A pointer to the local actor. */
  readonly playerActor: number;
  /** The actor's x, y, z floats. */
  readonly actorPos: number;
  /** A pointer to the skeleton root node; its word 1 is its y. */
  readonly rootNode: number;
  /** MoveScale, a float. */
  readonly moveScale: number;
  /** The wished stance byte (the stance request); null where no source gives it: then never read. */
  readonly stanceRequest: number | null;
}

/**
 * The stance request byte's evidence per build (item 6). r0004: +0x374 as r0001 -- below the +0x1334 word, 30 of 30
 * evidence-twinned +0x374 sites unchanged (agent-mail/evidence/eph-hunt-2026-11-01/r0004-offsets, the vote), its writer
 * FUN_00594cf0 not placed; live on the r0004 M51 state it reads 0, 1, 2 standing, crouched, prone. Inferred (no twin of
 * its own function), live-checked.
 */
export const STANCE_REQUEST_EVIDENCE: Readonly<Record<Revision, string>> = {
  r0001: 'seal_speed_probe.py:40-41 (desktop@be5578311); FUN_00594cf0 D:L453360-453425',
  r0004: 'inferred: 30 of 30 evidence-twinned +0x374 sites unchanged (r0004-offsets disp_vote); live: 0, 1, 2 on stand, crouch, prone (r0004-offsets/live c03, c11)',
};

/** desktop@be5578311:tools_py/parity/guest_addresses.py, both columns, value for value; see each line. */
export const GUEST_ADDRESSES: Readonly<Record<Revision, AddressColumn>> = {
  r0001: {
    guestClock: 0x004365c0,   // :60 PROBE_ADDRESSES["guest_clock"]["r0001"]
    playerActor: 0x00408c58,  // :59 PROBE_ADDRESSES["player_actor"]["r0001"]
    actorPos: 0x1c,           // :379 PROBE_OFFSETS["actor_pos"]["r0001"]
    rootNode: 0x2e8,          // :377 PROBE_OFFSETS["root_node"]["r0001"]
    moveScale: 0x1368,        // :378 PROBE_OFFSETS["move_scale"]["r0001"]
    stanceRequest: 0x374,     // seal_speed_probe.py:40-41 (r0001)
  },
  r0004: {
    guestClock: 0x00442fd0,   // :60 ["r0004"]; data-via-twin, 50 twinned of 57 sites, unanimous (:47-49)
    playerActor: 0x00435618,  // :59 ["r0004"]; data-via-twin, 15 twinned of 16 sites, unanimous (:44-46)
    actorPos: 0x1c,           // :379 ["r0004"]; 2755 twinned uses, unchanged (:373-375)
    rootNode: 0x2e8,          // :377 ["r0004"]; all 31 twinned uses read 0x2e8 (:355-357)
    moveScale: 0x136c,        // :378 ["r0004"]; MOVED from 0x1368, six twinned uses (:358-368)
    stanceRequest: 0x374,     // item 6: STANCE_REQUEST_EVIDENCE.r0004
  },
};

/** A field a build's column cannot read, and why: for record.json (its column in pcsx2.csv is left empty). */
export interface UnreadField {
  readonly field: 'stanceRequest';
  readonly why: string;
}

export function unreadFields(rev: Revision): UnreadField[] {
  return GUEST_ADDRESSES[rev].stanceRequest === null
    ? [{ field: 'stanceRequest', why: `no ${rev} offset (./sampler GUEST_ADDRESSES); not read, its column left empty` }]
    : [];
}

/**
 * EPH-TILT: the words the prone body's tilt rule reads and writes, at the local actor -- `FUN_00548090` (D:L413181-413287),
 * run each actor tick after the mover (research 217 s7 on agent/prone-tilt). Instrument addresses read off the r0001 ELF's
 * decompilation (game/analysis/socom2_game.elf.decomp.c), each cited where it is declared; not game values, and nothing
 * here writes. Displacements are inside the actor unless said otherwise.
 */
export interface TiltColumn {
  /** The skeleton root's quaternion x, y, z, w, inside the node `*(actor+rootNode)`: the rule writes it (D:L413275-413279). */
  readonly rootQuat: number;
  /** The floor hit's normal x, y, z the rule lerps toward (`piVar4 + 0x104`, D:L413259). */
  readonly floorNormal: number;
  /** The saved floor normal x, y, z: `FUN_0059b440` copies the hit's +0x10..+0x18 here (D:L456531-456533). */
  readonly savedNormal: number;
  /** `DAT_0066acd0..d8`, a global: the root's last up the settled prone step eases from (D:L413267), copied each tick by
   *  `FUN_005483d0` from the vtable +0x88 node's matrix +0x10..+0x18 (D:L413948-413952). */
  readonly easeBasis: number;
  /** The actor's quaternion x, y, z, w; the rule turns the normal by its conjugate (`piVar4[0x14..0x17]`, D:L413260-413263). */
  readonly actorQuat: number;
  /** Posture word, a short (`(short)piVar4[0x5d]`; 2 = prone, D:L413265). Read as the word's low half (little-endian). */
  readonly posture: number;
  /** The action id `FUN_00577e40` compares (0x13 Crouch -> Prone, 0x19 Stand -> Prone), a short (D:L437404; D:L413265-413266). */
  readonly action: number;
  /** A flag byte; bit 5 set is off the ground, where the rule writes nothing but for the dead (D:L413208). */
  readonly airFlags: number;
  /** The play stack: `FUN_00555170(actor+0x1c0)` (D:L413207) gives `*(*(s) + *(s+8) * 4)`, none when `*(s+8)` < 0
   *  (D:L419945-419956). */
  readonly playStack: number;
  /** The top play's phase, a float, in the play (`uVar2 + 0x1c`, D:L413225). */
  readonly playPhase: number;
  /** In the play: `FUN_0028c1e0` (D:L134107-134119) reads `*(*(play+0x34)+4)` (copying +0x34 into +0x3c first, which
   *  the sampler does not); its `+4` is the motion entry the window is read from (D:L413217-413218). */
  readonly playMotion: number;
  /** In the motion entry: the `Normalize` window's A and B floats (D:L413217-413218). */
  readonly windowA: number;
  readonly windowB: number;
}

/**
 * The r0004 columns (item 6, OT.R97: r0004 is the spec from 2026-11-01): placed by the twin scans saved under
 * R0004_OFFSET_EVIDENCE (socom_pc at 9c7c8ffc, read-only) -- each field's evidence in COLUMN_EVIDENCE, the ones taken by
 * layout, a vote or a single referrer rather than in their own function's twin in COLUMN_INFERRED. The actor gained a
 * word at +0x1334 (guest_addresses.py:350-353, desktop@be5578311): the fields above it moved up by four.
 */

/** Where the r0004 offset scans are saved (the scripts and their output; socom_pc at 9c7c8ffc, read-only). */
export const R0004_OFFSET_EVIDENCE = 'agent-mail/evidence/eph-hunt-2026-11-01/r0004-offsets';

export const TILT_ADDRESSES: Readonly<Record<Revision, TiltColumn | null>> = {
  r0001: {
    rootQuat: 0x20,           // FUN_00548090 D:L413275-413279: iVar1 = piVar4[0xba] (actor+0x2e8), +0x20..+0x2c
    floorNormal: 0x410,       // D:L413259: FUN_00308fc0(w, &up, piVar4 + 0x104, ...)
    savedNormal: 0x1344,      // FUN_0059b440 D:L456531-456533
    easeBasis: 0x0066acd0,    // D:L413267 (read); FUN_005483d0 D:L413950-413952 (written)
    actorQuat: 0x50,          // D:L413260-413263: piVar4[0x14..0x17]
    posture: 0x174,           // D:L413265: (short)piVar4[0x5d] == 2
    action: 0x534,            // FUN_00577e40 D:L437404: *(short *)(param_1 + 0x534)
    airFlags: 0x105e,         // D:L413208: *(byte *)(piVar4 + 0x105e) << 0x3a < 0, bit 5
    playStack: 0x1c0,         // D:L413207: FUN_00555170(piVar4 + 0x70); FUN_00555170 D:L419945-419956
    playPhase: 0x1c,          // D:L413225
    playMotion: 0x34,         // FUN_0028c1e0 D:L134107-134119
    windowA: 0x24,            // D:L413217
    windowB: 0x28,            // D:L413218
  },
  r0004: {
    rootQuat: 0x20, floorNormal: 0x410, savedNormal: 0x1348, easeBasis: 0x0066a650, actorQuat: 0x50, posture: 0x174,
    action: 0x534, airFlags: 0x105e, playStack: 0x1c0, playPhase: 0x1c, playMotion: 0x34, windowA: 0x24, windowB: 0x28,
  },
};

/**
 * The SEAL's move axes as the ground driver reads them each tick, inside the actor: `FUN_00586570` reads +0x240, +0x244
 * and +0x23c (D:L444830-444832) and writes +0x244 and +0x240 back (D:L444868-444869). +0x240 is the forward axis: the
 * crouch walk's threshold on it is asymmetric, forward against back (D:L444900), and `FUN_00550ef0` keeps it while
 * zeroing +0x23c and +0x244 on posture 5 (D:L418256-418258); +0x244 the lateral; +0x23c the turn (the yaw rate scales it,
 * D:L418340). +0x248 is not among them. The port's `Walker.cutStick` holds the same two move axes (viewer mover.ts).
 */
export interface StickColumn {
  readonly turn: number;
  readonly forward: number;
  readonly lateral: number;
  /**
   * A global holding the pad object `FUN_002da930` (D:L179484) fills each frame: `FUN_002d9e40` calls it under
   * `DAT_0044f108` (D:L179058-179062) and `FUN_00592ac0` clears that object's +0xb4/+0xb5 before its call
   * (D:L451824-451831). [The decompiler drops the pad argument at both calls; the global as the object is the reading.]
   */
  readonly padObject: number;
  /** In the pad object: the four analog bytes of the pad buffer, libpad indices 0x12, 0x13, 0x10, 0x11 (D:L179548-179555). */
  readonly padRaw: number;
  /** In the pad object: the move stick's two floats, (127.5 - byte) / 127.5 of indices 0x12 and 0x13 (D:L179556-179559),
   *  zeroed under the dead zone at +0x288 (D:L179564-179577). */
  readonly padMove: number;
  /** In the pad object: the +0 byte; `FUN_005966a0` writes the controller's axes only when it is set (D:L453768; its pad
   *  argument is `DAT_0044f108`'s object, D:L451666, D:L451672). Read as the low byte of the aligned word at +0. */
  readonly padFlag: number;
  /** In the actor: the controller object `FUN_00551ec0` takes (`param_2[0x30]`, D:L418509; under a mount, +0xeac, the
   *  mount's own +0xc0 instead, D:L418529 -- not followed here). */
  readonly controller: number;
  /** In the controller: words [2], [3], [4], copied to the actor's +0x240, +0x244, +0x23c (D:L418613-418615). */
  readonly ctlForward: number;
  readonly ctlLateral: number;
  readonly ctlTurn: number;
}


export const STICK_ADDRESSES: Readonly<Record<Revision, StickColumn | null>> = {
  r0001: {
    turn: 0x23c,      // FUN_00586570 D:L444832; FUN_00550ef0 D:L418340
    forward: 0x240,   // D:L444830, D:L444869; D:L444900
    lateral: 0x244,   // D:L444831, D:L444868
    padObject: 0x0044f108,   // FUN_002d9e40 D:L179058-179062; FUN_00592ac0 D:L451824-451831
    padRaw: 0x240,           // FUN_002da930 D:L179548-179555
    padMove: 0x210,          // FUN_002da930 D:L179556-179559
    padFlag: 0,              // FUN_005966a0 D:L453768
    controller: 0xc0,        // FUN_00551ec0 D:L418509
    ctlForward: 0x08,        // D:L418614 (piVar5[2] -> +0x240)
    ctlLateral: 0x0c,        // D:L418615 (piVar5[3] -> +0x244)
    ctlTurn: 0x10,           // D:L418613 (piVar5[4] -> +0x23c)
  },
  r0004: {
    turn: 0x23c, forward: 0x240, lateral: 0x244, padObject: 0x004524d8, padRaw: 0x240, padMove: 0x210, padFlag: 0,
    controller: 0xc0, ctlForward: 0x08, ctlLateral: 0x0c, ctlTurn: 0x10,
  },
};

const EV = (f: string): string => `${R0004_OFFSET_EVIDENCE}/${f}`;
const ALIGNED_548090 = `twin: FUN_00548090 (relinked-body, r0004 0x54cbf0), the same instruction at the same offset (${EV('disp_twin.out')})`;

/** Each column field's evidence, per build (review F1; the r0004 twin scans of item 6). */
export const COLUMN_EVIDENCE: Readonly<Record<Revision, { readonly tilt: Readonly<Record<string, string>>; readonly stick: Readonly<Record<string, string>> }>> = {
  r0001: {
    tilt: Object.fromEntries(['rootQuat', 'floorNormal', 'savedNormal', 'easeBasis', 'actorQuat', 'posture', 'action', 'airFlags', 'playStack', 'playPhase', 'playMotion', 'windowA', 'windowB'].map((k) => [k, 'decompilation: TILT_ADDRESSES.r0001 line comments'])),
    stick: Object.fromEntries(['turn', 'forward', 'lateral', 'padObject', 'padRaw', 'padMove', 'padFlag', 'controller', 'ctlForward', 'ctlLateral', 'ctlTurn'].map((k) => [k, 'decompilation: STICK_ADDRESSES.r0001 line comments'])),
  },
  r0004: {
    tilt: {
      rootQuat: ALIGNED_548090, actorQuat: ALIGNED_548090, posture: ALIGNED_548090, airFlags: ALIGNED_548090,
      playStack: ALIGNED_548090, playPhase: ALIGNED_548090, windowA: ALIGNED_548090, windowB: ALIGNED_548090,
      action: `twin: FUN_00577e40 (exact, r0004 0x57d220), both +0x534 sites unchanged (${EV('disp_twin.out')})`,
      savedNormal: `twin: FUN_0059b440 placed by masked body at r0004 0x5a0f60, +0x1344 -> +0x1348 (${EV('body_find.out')})`,
      floorNormal: `layout and vote: below +0x1334; 58 of 61 evidence-twinned +0x410 sites unchanged (${EV('disp_vote.out')}); FUN_00548090 forms it by address arithmetic and FUN_005483d0 did not place; live: a unit normal that follows the slope walked (${EV('live/c02-walk-fwd.txt')})`,
      easeBasis: `vote of one: data_via_twin 0x66acd0 -> 0x66a650 from 1 of 2 sites, FUN_00548090 (${EV('data_twin.out')}); live: (0,1,0) throughout, not yet seen to move`,
      playMotion: `vote: 2122 of 2122 evidence-twinned +0x34 sites unchanged (${EV('disp_vote.out')}); FUN_0028c1e0 is seed+delta; live: the top action ids through it read 1, 2, 17, 18, 19, 26, 27, 320 (the dive, 0x140) as the stance and move changed (${EV('live')})`,
    },
    stick: {
      turn: `twin: FUN_00586570 (relinked-body, r0004 0x58bba0) aligned (${EV('disp_twin.out')})`,
      forward: `twin: FUN_00586570 (relinked-body, r0004 0x58bba0) aligned (${EV('disp_twin.out')})`,
      lateral: `twin: FUN_00586570 (relinked-body, r0004 0x58bba0) aligned (${EV('disp_twin.out')})`,
      padObject: `twin: data_via_twin 0x44f108 -> 0x4524d8, 38 of 46 sites evidence-twinned in 34 functions, unanimous (${EV('data_twin.out')})`,
      padRaw: `twin: FUN_002da930 (relinked-body, r0004 0x2f7920) aligned (${EV('disp_twin.out')})`,
      padMove: `twin: FUN_002da930 (relinked-body, r0004 0x2f7920) aligned, 19 sites (${EV('disp_twin.out')})`,
      padFlag: 'layout: the pad object word 0 (FUN_005966a0 D:L453768) not twin-checked',
      controller: `twin: FUN_00551ec0 placed by masked body at r0004 0x557080, its +0xc0 sites unchanged (${EV('body_find.out')})`,
      ctlForward: `twin: FUN_00551ec0 at r0004 0x557080, the copy D:L418613-418615 unchanged under the mask (${EV('body_find.out')})`,
      ctlLateral: `twin: FUN_00551ec0 at r0004 0x557080, the copy D:L418613-418615 unchanged under the mask (${EV('body_find.out')})`,
      ctlTurn: `twin: FUN_00551ec0 at r0004 0x557080, the copy D:L418613-418615 unchanged under the mask (${EV('body_find.out')})`,
    },
  },
};

/** The column fields taken by layout, a vote or a single referrer, not their own function's twin (review F1). */
export const COLUMN_INFERRED: Readonly<Record<Revision, { readonly tilt: readonly string[]; readonly stick: readonly string[] }>> = {
  r0001: { tilt: [], stick: [] },
  r0004: { tilt: ['floorNormal', 'easeBasis', 'playMotion'], stick: ['padFlag'] },
};

/** pcsx2.csv's stick columns, in order. */
export const PCSX_STICK_COLUMNS = ['stickTurn', 'stickForward', 'stickLateral', 'padRaw0', 'padRaw1', 'padRaw2', 'padRaw3', 'padMoveA', 'padMoveB', 'padFlag0', 'ctlForward', 'ctlLateral', 'ctlTurn'] as const;

export interface PcsxStick {
  stickTurn: number | null;
  stickForward: number | null;
  stickLateral: number | null;
  /** The pad object's raw analog bytes at +0x240..+0x243 (indices 0x12, 0x13, 0x10, 0x11), off one aligned word. */
  padRaw0: number | null;
  padRaw1: number | null;
  padRaw2: number | null;
  padRaw3: number | null;
  /** The pad object's move stick floats, +0x210 and +0x214. */
  padMoveA: number | null;
  padMoveB: number | null;
  /** The pad object's +0 byte (FUN_005966a0's test). */
  padFlag0: number | null;
  /** The controller object's three axes (words [2], [3], [4]). */
  ctlForward: number | null;
  ctlLateral: number | null;
  ctlTurn: number | null;
}

/** A tilt or stick field set a build's column cannot read, and why: record.json's `tiltUnread`. */
export interface UnreadTiltField {
  readonly field: 'tilt' | 'stick';
  readonly why: string;
}

export function unreadTiltFields(rev: Revision): UnreadTiltField[] {
  const out: UnreadTiltField[] = [];
  if (TILT_ADDRESSES[rev] === null) out.push({ field: 'tilt', why: `no ${rev} tilt offsets (./sampler TILT_ADDRESSES); not read, the tilt columns left empty` });
  if (STICK_ADDRESSES[rev] === null) out.push({ field: 'stick', why: `no ${rev} stick offsets (./sampler STICK_ADDRESSES); not read, the stick columns left empty` });
  return out;
}

/**
 * The PS2's EE main RAM ends here (32 MB): a guest pointer is non-zero, word aligned and under it. An instrument bound,
 * the console's memory map, not a game value: a word that fails it is recorded as no pointer, never followed.
 */
export const EE_RAM_END = 0x02000000;

export function guestPointer(p: number): boolean {
  return p > 0 && p < EE_RAM_END && (p & 3) === 0;
}

/** The tilt fields of a PCSX2 row (null: not read on this build, or behind a bad pointer). */
export interface PcsxTilt {
  rootQx: number | null; rootQy: number | null; rootQz: number | null; rootQw: number | null;
  floorNx: number | null; floorNy: number | null; floorNz: number | null;
  savedNx: number | null; savedNy: number | null; savedNz: number | null;
  easeX: number | null; easeY: number | null; easeZ: number | null;
  actorQx: number | null; actorQy: number | null; actorQz: number | null; actorQw: number | null;
  /** Posture word (2 prone). */
  posture: number | null;
  /** The actor's action id (+0x534). */
  actionId: number | null;
  /** 1 off the ground (+0x105e bit 5), else 0. */
  airborne: number | null;
  /** The top play's phase. */
  playPhase: number | null;
  /** The top play's motion entry address: the clip's identity (no name is read). */
  playClip: number | null;
  playWindowA: number | null;
  playWindowB: number | null;
  /** The whole +0x105e flag byte: bit 2 the jump flag (FUN_005469c0 D:L412326, called from FUN_00594cf0 D:L453214),
   *  bit 5 off the ground (D:L413208). */
  flags105e: number | null;
  /** The top action's id: the short at +0x22 of the record `FUN_0028c1e0` gives for the +0x1c0 stack's top, which
   *  D:L440388-440391 copy to actor+0x534; read as the high half of the aligned word at +0x20. */
  topActionId: number | null;
}

/** pcsx2.csv's tilt columns, in order (EPH-TILT). */
export const PCSX_TILT_COLUMNS: readonly (keyof PcsxTilt)[] = [
  'rootQx', 'rootQy', 'rootQz', 'rootQw', 'floorNx', 'floorNy', 'floorNz', 'savedNx', 'savedNy', 'savedNz',
  'easeX', 'easeY', 'easeZ', 'actorQx', 'actorQy', 'actorQz', 'actorQw', 'posture', 'actionId', 'airborne',
  'playPhase', 'playClip', 'playWindowA', 'playWindowB', 'flags105e', 'topActionId',
];

export function noTilt(): PcsxTilt {
  return Object.fromEntries(PCSX_TILT_COLUMNS.map((k) => [k, null])) as unknown as PcsxTilt;
}

/** A 32-bit word's low half as a signed short (little-endian: the short at the word's own address). */
const short = (w: number): number => ((w & 0xffff) << 16) >> 16;

/**
 * One safe guest read for the optional fields (tilt, stick): PINE is asked one word at a time -- never two requests in
 * flight, as the base sampler always did (the 2026-10-31 live pass issued the tilt reads together and every row timed
 * out: runs 20261031T160305Z..160707Z) -- a read32 only on a 4-byte boundary and a read8 anywhere, inside the EE RAM.
 * A read refused here or failed by PINE is null and counted (`onError`), never thrown: it never costs the base row.
 */
export class SafeReads {
  errors = 0;
  constructor(private readonly pine: PineReads) {}

  private bad(): null {
    this.errors++;
    return null;
  }

  async word(a: number): Promise<number | null> {
    if (!(a >= 0 && a + 4 <= EE_RAM_END && (a & 3) === 0)) return this.bad();
    try { return await this.pine.read32(a); } catch { return this.bad(); }
  }

  async byte(a: number): Promise<number | null> {
    if (!(a >= 0 && a < EE_RAM_END)) return this.bad();
    try { return await this.pine.read8(a); } catch { return this.bad(); }
  }

  async float(a: number): Promise<number | null> {
    const w = await this.word(a);
    return w === null ? null : f32(w);
  }

  /** `n` floats from `a`, one read each, in order. */
  async floats(a: number, n: number): Promise<(number | null)[]> {
    const out: (number | null)[] = [];
    for (let i = 0; i < n; i++) out.push(await this.float(a + 4 * i));
    return out;
  }
}

/**
 * The tilt words at `actor` on a build's column, one read at a time (SafeReads). Every displacement is word aligned but
 * the flag byte (+0x105e, read as a byte: FUN_00548090 D:L413208 tests it as a byte); a pointer on the way to the root
 * or the top play is checked by guestPointer (non-zero, word aligned, in RAM), and what lies behind a bad one is null.
 */
export async function readTilt(g: SafeReads, c: TiltColumn, actor: number, rootNode: number): Promise<PcsxTilt> {
  const node = await g.word(actor + rootNode);
  const q = node !== null && guestPointer(node) ? await g.floats(node + c.rootQuat, 4) : [null, null, null, null];
  const floor = await g.floats(actor + c.floorNormal, 3);
  const saved = await g.floats(actor + c.savedNormal, 3);
  const ease = await g.floats(c.easeBasis, 3);
  const aq = await g.floats(actor + c.actorQuat, 4);
  const postureW = await g.word(actor + c.posture);
  const actionW = await g.word(actor + c.action);
  const air = await g.byte(actor + c.airFlags);
  let playPhase: number | null = null, playClip: number | null = null, wa: number | null = null, wb: number | null = null;
  let topActionId: number | null = null;
  const stack = await g.word(actor + c.playStack);
  const index = stack !== null && guestPointer(stack) ? await g.word(actor + c.playStack + 8) : null;
  if (stack !== null && index !== null && (index | 0) >= 0 && guestPointer(stack + (index | 0) * 4)) {
    const play = await g.word(stack + (index | 0) * 4);
    if (play !== null && guestPointer(play)) {
      playPhase = await g.float(play + c.playPhase);
      const ref = await g.word(play + c.playMotion);
      const rec = ref !== null && guestPointer(ref) ? await g.word(ref + 4) : null;
      if (rec !== null && guestPointer(rec)) {
        const w = await g.word(rec + 0x20);   // the short at +0x22: the word's high half (little-endian)
        if (w !== null) topActionId = (w >>> 16 << 16) >> 16;
      }
      const entry = rec !== null && guestPointer(rec) ? await g.word(rec + 4) : null;
      if (entry !== null && guestPointer(entry)) {
        playClip = entry;
        wa = await g.float(entry + c.windowA);
        wb = await g.float(entry + c.windowB);
      }
    }
  }
  return {
    rootQx: q[0]!, rootQy: q[1]!, rootQz: q[2]!, rootQw: q[3]!,
    floorNx: floor[0]!, floorNy: floor[1]!, floorNz: floor[2]!,
    savedNx: saved[0]!, savedNy: saved[1]!, savedNz: saved[2]!,
    easeX: ease[0]!, easeY: ease[1]!, easeZ: ease[2]!,
    actorQx: aq[0]!, actorQy: aq[1]!, actorQz: aq[2]!, actorQw: aq[3]!,
    posture: postureW === null ? null : short(postureW), actionId: actionW === null ? null : short(actionW),
    airborne: air === null ? null : (air >> 5) & 1,
    playPhase, playClip, playWindowA: wa, playWindowB: wb, flags105e: air, topActionId,
  };
}

/**
 * The extra words (item 6(b), the gameplay seat's reads: agent-mail/evidence/move-reads/READS-2026-11-01.md, C1a and
 * MOVE-6), read only with the Sampler's `extra` option. Displacements inside the actor unless said otherwise:
 * - `velocity` +0x2c/+0x30/+0x34: the actor's velocity, the triple FUN_00581c10's speed test squares (|+0x2c|^2 > 100,
 *   D:L442633-442637) and FUN_0054d9a0 adds the top play's vector to (D:L416435-416455). r0004: the same +0x2c, below
 *   the word r0004's actor gained at +0x1334 (desktop@be5578311:tools_py/parity/guest_addresses.py:352-354) and
 *   twin-checked in the functions that use it (EXTRA_EVIDENCE).
 * - `diveVelocity` +0x1350/+0x1354/+0x1358: the dive's saved world velocity, y zeroed (FUN_0057e540 D:L440899-440907),
 *   moved by FUN_0054d9a0 (D:L416510-416531); the world-contact and body-against-body projections write it
 *   (FUN_005483d0 D:L413588-413594, piVar15[0x4d4]; D:L417619-417626). r0004: +0x1354, above +0x1334, moved up by four
 *   (guest_addresses.py:352-354), twin-checked in FUN_0057e540 and FUN_0054d9a0 (EXTRA_EVIDENCE).
 * - `actorList` (a guest address): the game's actor list -- word 0 the count, +8 the first node, the list's +4 its end;
 *   a node's +4 the next node, +8 its object (FUN_0029e470 D:L144674-144684, FUN_002269a0 D:L77345-77362); an object's
 *   +0x10 byte its type (2 a character, D:L412598) and +0x1c its position. r0001 0x004362e0; r0004 0x00442ce8 by the
 *   desktop's data-via-twin scan (socom_pc tools_py/data_via_twin.py, run 2026-11-01: 127 of 142 sites evidence-twinned
 *   in 62 functions, unanimous; its control 0x408c58 -> 0x435618 reproduced in the same run).
 * The contact normal is not on the actor: the projections take it from a stack local (fStack_78..70, D:L413577-413594),
 * so it is not read; a projection shows as a turn of `diveVelocity`.
 */
export interface ExtraColumn {
  readonly velocity: number;
  readonly diveVelocity: number;
  readonly actorList: number;
  readonly actorType: number;
}

export const EXTRA_ADDRESSES: Readonly<Record<Revision, ExtraColumn>> = {
  r0001: { velocity: 0x2c, diveVelocity: 0x1350, actorList: 0x004362e0, actorType: 0x10 },
  r0004: { velocity: 0x2c, diveVelocity: 0x1354, actorList: 0x00442ce8, actorType: 0x10 },
};

/** Each extra address's evidence, per build (review F1): what record.json's extra block cites. */
export const EXTRA_EVIDENCE: Readonly<Record<Revision, Readonly<Record<keyof ExtraColumn, string>>>> = {
  r0001: {
    velocity: 'decompilation: FUN_00581c10 D:L442633-442637; FUN_0054d9a0 D:L416435-416455',
    diveVelocity: 'decompilation: FUN_0057e540 D:L440899-440907; FUN_0054d9a0 D:L416510-416531',
    actorList: 'decompilation: FUN_0029e470 D:L144674-144684; FUN_002269a0 D:L77345-77362',
    actorType: 'decompilation: D:L412598 (+0x10 == 2, a character)',
  },
  r0004: {
    velocity: `twin-checked: FUN_0054d9a0 (r0004 0x552790), FUN_0057e540 (0x5838a0), FUN_00551ec0 (0x557080) by masked body, FUN_00581c10 (0x587210) aligned -- every +0x2c site unchanged (${R0004_OFFSET_EVIDENCE}/body_find.out, disp_twin.out)`,
    diveVelocity: `twin-checked: FUN_0057e540 (r0004 0x5838a0) and FUN_0054d9a0 (0x552790) by masked body -- every +0x1350 site reads +0x1354 (${R0004_OFFSET_EVIDENCE}/body_find.out)`,
    actorList: `twin-checked: data_via_twin 0x4362e0 -> 0x442ce8, 127 of 142 sites evidence-twinned in 62 functions, unanimous (${R0004_OFFSET_EVIDENCE}/data_twin.out); live: three type-2 actors 32-56 u from the player on the r0004 M51 state`,
    actorType: 'live: the r0004 M51 state lists its three teammates as type 2 (the boot check, 2026-11-01); the decompilation offset by layout (below +0x1334)',
  },
};

/** The extra addresses taken by layout or a single source rather than twin-checked, per build (review F1). */
export const EXTRA_INFERRED: Readonly<Record<Revision, readonly (keyof ExtraColumn)[]>> = {
  r0001: [],
  r0004: ['actorType'],
};

export const PCSX_EXTRA_COLUMNS =['velX', 'velY', 'velZ', 'diveVelX', 'diveVelY', 'diveVelZ', 'nearCount', 'near'] as const;

export interface PcsxExtra {
  readonly velX: number | null;
  readonly velY: number | null;
  readonly velZ: number | null;
  readonly diveVelX: number | null;
  readonly diveVelY: number | null;
  readonly diveVelZ: number | null;
  /** The actors (not the player) within `nearRadius` of the player's feet. */
  readonly nearCount: number;
  /** Each as `0x<object>:<type>:<x>/<y>/<z>/<distance>`, joined by `;` (no comma: the CSVs are plain). */
  readonly near: string;
}

/**
 * The press probes (6d, before the cancel reruns): the pad object's button bytes from +0 and pressure floats from +0x10,
 * one per button index -- FUN_00594cf0 reads Triangle's digital at pad+7 and its pressure at pad+0x2c (index 7,
 * D:L453334-453340) -- and the Triangle peak it keeps, DAT_0066b410 (D:L453337-453345: firm when the peak is >= 0.3,
 * decided on the first frame the pressure falls under it). r0004: FUN_00594cf0 placed at 0x59a6e0 by its neighbours'
 * delta, 1635 of 1642 instructions in order under the mask; its peak 0x66ad90, its pad object 0x4524d8 (the control)
 * (agent-mail/evidence/eph-hunt-2026-11-01/r0004-offsets/place_594cf0.out).
 */
export interface PadProbeColumn {
  readonly peak: number;
  readonly digital: number;
  readonly pressure: number;
  readonly buttons: number;
}

export const PAD_PROBE_ADDRESSES: Readonly<Record<Revision, PadProbeColumn>> = {
  r0001: { peak: 0x0066b410, digital: 0, pressure: 0x10, buttons: 16 },
  r0004: { peak: 0x0066ad90, digital: 0, pressure: 0x10, buttons: 16 },
};

export const PCSX_PAD_PROBE_COLUMNS = ['padButtons', 'padPressure', 'triPressure', 'triPeak'] as const;

/** Triangle's button index in the pad object (FUN_00594cf0: pad+7, pad+0x2c). */
export const PAD_TRIANGLE = 7;

export interface PcsxPadProbe {
  /** The 16 button bytes, hex, in address order. */
  readonly padButtons: string | null;
  /** The 16 pressure floats, `/`-joined (two decimals). */
  readonly padPressure: string | null;
  readonly triPressure: number | null;
  readonly triPeak: number | null;
}

/**
 * The floor probe's origin (the origin option; the jump-air trace, 2026-11-08): the vertical probe record FUN_005b0840
 * queues each actor tick (socom_pc research 23 s1.1-1.3, all r0001; D:L467199-467290). It starts from
 * (A+0xf54, max(A+0xf58, DAT_0066aab8 = A+0x20), A+0xf5c) (D:L467215-467220; FUN_005506a0 sets the global just before
 * the call), adds the bone translation `*(A->vtbl[0x88]() + 0xc) + 0x30` turned by `*(A+0x28)` (D:L467221-467251; in
 * posture 3 only its y, D:L467252-467257), takes record `DAT_0044d598` of the array of record pointers `DAT_0044d588`
 * (length `DAT_0044d590`, grown by one when full, D:L467258-467274), writes the origin at its +4..+0xc
 * (D:L467278-467280), the slot at A+0x2cc (D:L467275) and the actor's self object at its +0x3c (FUN_0029ed20,
 * D:L467289-467290). FUN_005b0420 sets A+0x2cc back to -1 after the take (-999 when the queue returned early), so a
 * row never sees the slot: it finds the player's record by its origin's x/z within ORIGIN_MATCH_XZ of the feet, then
 * keeps it by its self object (the record's index can change, the owner cannot).
 *
 * r0004: FUN_005b0840 has no twin in match.json; placed at 0x5b6620 (217 of 217 r0001 instructions aligned in order
 * under the mask, a 20-word insert after the lift; its only caller is FUN_005506a0's twin at 0x555848), every actor
 * displacement unchanged; the globals by data_via_twin (R0004_OFFSET_EVIDENCE/probe_origin_place.out). Instrument
 * addresses, not game values: what the column measures reaches a research note through `derive-from-desktop` first.
 */
export interface OriginColumn {
  /** The global holding the array of probe record pointers (DAT_0044d588). */
  readonly recordArray: number;
  /** The global holding that array's length (DAT_0044d590; the records allocated, not this frame's count). */
  readonly recordCount: number;
  /** In a record: the origin x, y, z. */
  readonly recOrigin: number;
  /** In a record: the excluded self object. */
  readonly recSelf: number;
  /** In the actor: the probe base x, y, z (+0xf54..+0xf5c; y is max'd with the actor's y). */
  readonly probeBase: number;
  /** In the actor: the record slot (an int; -1 after the take, -999 when the queue returned early). */
  readonly probeSlot: number;
  /** In the actor: the flag byte the queue tests (bit 3 skips the probe; bit 1 the jump's own airborne flag). */
  readonly flags1061: number;
  /** The global DAT_0066aab8: the y FUN_005506a0 hands the queue (the last actor's to probe). */
  readonly probeY: number;
}

export const ORIGIN_ADDRESSES: Readonly<Record<Revision, OriginColumn>> = {
  r0001: { recordArray: 0x0044d588, recordCount: 0x0044d590, recOrigin: 4, recSelf: 0x3c, probeBase: 0xf54, probeSlot: 0x2cc, flags1061: 0x1061, probeY: 0x0066aab8 },
  r0004: { recordArray: 0x00450920, recordCount: 0x00450928, recOrigin: 4, recSelf: 0x3c, probeBase: 0xf54, probeSlot: 0x2cc, flags1061: 0x1061, probeY: 0x0066a438 },
};

const ORIGIN_PLACE = `${R0004_OFFSET_EVIDENCE}/probe_origin_place.out`;

/** Each origin address's evidence, per build: what probe.json cites. */
export const ORIGIN_EVIDENCE: Readonly<Record<Revision, Readonly<Record<keyof OriginColumn, string>>>> = {
  r0001: {
    recordArray: 'decompilation: FUN_005b0840 D:L467258-467276; socom_pc research 23 s1.1',
    recordCount: 'decompilation: FUN_005b0840 D:L467258, D:L467272',
    recOrigin: 'decompilation: FUN_005b0840 D:L467278-467280; research 23 s1.3',
    recSelf: 'decompilation: FUN_005b0840 D:L467289-467290 (FUN_0029ed20)',
    probeBase: 'decompilation: FUN_005b0840 D:L467215-467220 (piVar8[0x3d5..0x3d7])',
    probeSlot: 'decompilation: FUN_005b0840 D:L467199, D:L467275 (piVar8[0xb3]); research 23 s1.1 (FUN_005b0420 sets -1)',
    flags1061: 'decompilation: FUN_005b0840 D:L467200 (bit 3 returns early)',
    probeY: 'decompilation: FUN_005b0840 D:L467218-467219; research 23 s1.1 (FUN_005506a0 sets it = A+0x20)',
  },
  r0004: {
    recordArray: `data_via_twin 0x44d588 -> 0x450920, 4 of 9 sites evidence-twinned in 2 functions, unanimous; the placed queue reads it at 0x5b68ac/0x5b6914 (${ORIGIN_PLACE})`,
    recordCount: `data_via_twin 0x44d590 -> 0x450928, 3 of 8 sites evidence-twinned, unanimous; the placed queue reads it at 0x5b6854 (${ORIGIN_PLACE})`,
    recOrigin: `the placed queue (r0004 0x5b6620): its stores +4/+8/+0xc at 0x5b6938-0x5b694c unchanged (${ORIGIN_PLACE})`,
    recSelf: `the placed queue: its store +0x3c at 0x5b69b8 unchanged (${ORIGIN_PLACE})`,
    probeBase: `the placed queue: its loads +0xf54/+0xf58/+0xf5c at 0x5b66e8-0x5b6700 unchanged (${ORIGIN_PLACE})`,
    probeSlot: `the placed queue: +0x2cc at 0x5b6634/0x5b6904 unchanged; FUN_005b0420 by masked body at 0x5b6200, both +0x2cc sites unchanged (${ORIGIN_PLACE})`,
    flags1061: `the placed queue: +0x1061 at 0x5b6638 unchanged; FUN_005b0420's twin, every +0x1061 site unchanged (${ORIGIN_PLACE})`,
    probeY: `data_via_twin 0x66aab8 -> 0x66a438 (1 site, in FUN_005506a0's twin); the placed queue reads it at 0x5b6704 (${ORIGIN_PLACE})`,
  },
};

/** The origin addresses taken by layout, a vote or a single referrer rather than their own function's twin, per build
 *  (the EXTRA_INFERRED convention; what probe.json cites beside ORIGIN_EVIDENCE). None: r0001's are the decompilation's,
 *  r0004's the placed queue's own sites, 0x66a438 its twin site plus the placed queue's read at 0x5b6704. */
export const ORIGIN_INFERRED: Readonly<Record<Revision, readonly (keyof OriginColumn)[]>> = {
  r0001: [],
  r0004: [],
};

/** The slot FUN_005b0840 leaves at A+0x2cc when it returns early (D:L467199, before the bit 3 test at D:L467200);
 *  FUN_005b0420 resets only a slot >= 0 to -1, so it survives to the row. The queue's records are never cleared, so a
 *  record kept by its self object then holds an earlier frame's origin: the row blanks the origin columns and sets
 *  probeOriginStale. */
export const ORIGIN_SLOT_SKIPPED = -999;

/** World units of x/z within which a record is taken as the player's before its self object is known (an adaptation:
 *  the origin's x/z is the probe base's plus the turned bone's, a unit or two off the feet; the M51 state's teammates
 *  stand 32-56 u away). */
export const ORIGIN_MATCH_XZ = 8;
/** The most records a row scans (an adaptation, the instrument's bound against a bad length). A frame whose length
 *  passes it with no record matched within it is counted in the Sampler's originBeyondCap (probe.json). */
export const ORIGIN_RECORDS_MAX = 64;

export const PCSX_ORIGIN_COLUMNS = ['probeRecs', 'probeIdx', 'probeSelf', 'probeOx', 'probeOy', 'probeOz', 'probeLift', 'probeDxz',
  'probeBaseX', 'probeBaseY', 'probeBaseZ', 'probeYGlobal', 'probeSlot', 'flags1061', 'originTorn', 'probeOriginStale'] as const;

export interface PcsxOrigin {
  /** The record array's length (DAT_0044d590). */
  readonly probeRecs: number | null;
  /** The player's record's index; null when none was found. */
  readonly probeIdx: number | null;
  /** The record's self object, hex. */
  readonly probeSelf: string | null;
  readonly probeOx: number | null;
  readonly probeOy: number | null;
  readonly probeOz: number | null;
  /** probeOy less the row's feet y (the actor's +0x20, read at the row's start). */
  readonly probeLift: number | null;
  /** The record's x/z distance from the feet. probeOx..probeDxz are null in a stale row (probeOriginStale 1). */
  readonly probeDxz: number | null;
  readonly probeBaseX: number | null;
  readonly probeBaseY: number | null;
  readonly probeBaseZ: number | null;
  readonly probeYGlobal: number | null;
  readonly probeSlot: number | null;
  readonly flags1061: number | null;
  /** 1 when the guest clock moved during the origin reads, 0 when not, null when unread. */
  readonly originTorn: number | null;
  /** 1 when probeSlot reads ORIGIN_SLOT_SKIPPED in an un-torn row (the queue returned early this frame: the kept record
   *  is an earlier frame's, its origin columns blanked), 0 when not, null when the slot or the clock is unread or the
   *  row is torn. A record left stale by a drop of the player's queue index is not detected by it. */
  readonly probeOriginStale: number | null;
}

/** The Sampler's options: the extra words, off by default. */
export interface SamplerOptions {
  /** The press probe's pad columns (PAD_PROBE_ADDRESSES), off by default. */
  readonly padProbe?: boolean;
  readonly extra?: boolean;
  /** World units around the player an actor is listed within (default 30). */
  readonly nearRadius?: number;
  /** Rows between walks of the actor list (default 30); between them only the kept actors' positions are read. */
  readonly nearRefreshRows?: number;
  /** The floor probe's origin columns (ORIGIN_ADDRESSES), off by default. */
  readonly origin?: boolean;
}

/** The longest list walk: a guard against a broken list, never reached by the game's own (adaptation). */
export const ACTOR_LIST_MAX = 256;

/** seal_speed_probe.py _f: struct.unpack("<f", struct.pack("<I", bits)). */
export function f32(bits: number): number {
  const v = new DataView(new ArrayBuffer(4));
  v.setUint32(0, bits >>> 0, true);
  return v.getFloat32(0, true);
}

/** As much of a PINE client as the sampler reads (./pine PineClient fits). */
export interface PineReads {
  read8(a: number): Promise<number>;
  read32(a: number): Promise<number>;
}

/** A row: the probe's fields, then the tilt (EPH-TILT; optional in the type so a row built before it still fits). */
export interface PcsxSample extends Partial<PcsxTilt>, Partial<PcsxStick>, Partial<PcsxExtra>, Partial<PcsxPadProbe>, Partial<PcsxOrigin> {
  /** Review F2: 1 when the guest clock moved during the extra reads, 0 when not, null when unread; absent without --extra. */
  readonly extraTorn?: number | null;
  /**
   * 1 when the guest clock moved during the tilt and stick reads (taken after the base row's own check): those fields are
   * then up to a frame later than the row's clock; 0 when not; null when the clock could not be read again.
   */
  readonly tiltTorn?: number | null;
  /** The guest clock's raw word: rows sharing it are one game frame. */
  readonly clockBits: number;
  /** The guest clock, seconds. */
  readonly t: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** The skeleton root's y (NaN with no root node). */
  readonly rootY: number;
  readonly moveScale: number;
  /** The stance request byte; null where the build's column has no offset for it (unreadFields). */
  readonly stanceRequest: number | null;
}

/** Reads one build's column: the build detected at connect (detectRevision), never assumed. */
export class Sampler {
  /** Rows dropped because the clock moved during the read. */
  torn = 0;
  /** Reads that found no local actor (the probe's `null`). */
  nullActor = 0;
  /** Tilt and stick reads refused or failed (each one null in its column; the row kept). */
  tiltErrors = 0;
  /** Rows whose tilt and stick reads straddled a guest frame (`tiltTorn`). */
  tiltTorn = 0;
  private readonly col: AddressColumn;
  private readonly tiltCol: TiltColumn | null;
  private readonly stickCol: StickColumn | null;

  /** Extra reads refused or failed (each one null, or the walk ended). */
  extraErrors = 0;
  /** Rows whose extra reads straddled a guest frame (`extraTorn`). */
  extraTorn = 0;
  /** What the extra reads cost (review F2): rows read, total and max wall ms -- the row gap they add. */
  readonly extraCost = { rows: 0, totalMs: 0, maxMs: 0 };

  /**
   * Review F2: the extra words last, after the base row's clock check and the tilt and stick reads (so the list walk
   * never delays them), then a clock read of their own: `extraTorn` 1 when the guest frame moved during them.
   */
  /** The press probe's pad columns, after everything else (SafeReads: a failure is null). */
  private async padProbeOf(): Promise<Partial<PcsxPadProbe>> {
    if (!this.opts.padProbe || !this.stickCol) return {};
    const c = PAD_PROBE_ADDRESSES[this.revision];
    const g = new SafeReads(this.pine);
    const pad = await g.word(this.stickCol.padObject);
    let padButtons: string | null = null, padPressure: string | null = null, triPressure: number | null = null;
    if (pad !== null && guestPointer(pad)) {
      const words: (number | null)[] = [];
      for (let i = 0; i < c.buttons / 4; i++) words.push(await g.word(pad + c.digital + 4 * i));
      if (words.every((w) => w !== null)) {
        padButtons = (words as number[]).map((w) => [0, 1, 2, 3].map((k) => ((w >>> (8 * k)) & 0xff).toString(16).padStart(2, '0')).join('')).join('');
      }
      const pr = await g.floats(pad + c.pressure, c.buttons);
      padPressure = pr.map((v) => (v === null ? '' : v.toFixed(2))).join('/');
      triPressure = pr[PAD_TRIANGLE] ?? null;
    }
    const triPeak = await g.float(c.peak);
    this.extraErrors += g.errors;
    return { padButtons, padPressure, triPressure, triPeak };
  }

  private async extraOf(actor: number, feet: readonly [number, number, number], c0: number): Promise<Partial<PcsxExtra> & Partial<PcsxPadProbe> & { extraTorn?: number | null }> {
    if (!this.extraCol) return this.padProbeOf();
    const t0 = Date.now();
    const extra = await this.readExtra(actor, feet);
    const g = new SafeReads(this.pine);
    const c3 = await g.word(this.col.guestClock);
    this.extraErrors += g.errors;
    const ms = Date.now() - t0;
    this.extraCost.rows++;
    this.extraCost.totalMs += ms;
    this.extraCost.maxMs = Math.max(this.extraCost.maxMs, ms);
    const extraTorn = c3 === null ? null : c3 === c0 ? 0 : 1;
    if (extraTorn === 1) this.extraTorn++;
    return { ...extra, extraTorn, ...(await this.padProbeOf()) };
  }
  private readonly extraCol: ExtraColumn | null;
  private readonly originCol: OriginColumn | null;
  /** The player's probe record as last found: its index and its self object (kept across rows). */
  private originKept: { idx: number; self: number } | null = null;
  /** Origin reads refused or failed (each one null). */
  originErrors = 0;
  /** Rows whose record length passed ORIGIN_RECORDS_MAX with no record matched within it (probe.json). */
  originBeyondCap = 0;

  /**
   * The origin columns, last in the row, with their own clock read (`originTorn`). The kept record is read first; when
   * its self object no longer matches, the array is scanned for that self object; with none kept, for the record whose
   * origin x/z lies nearest the feet within ORIGIN_MATCH_XZ.
   */
  private async originOf(actor: number, feet: readonly [number, number, number], c0: number): Promise<Partial<PcsxOrigin>> {
    if (!this.originCol) return {};
    const o = this.originCol;
    const g = new SafeReads(this.pine);
    const arr = await g.word(o.recordArray);
    const count = await g.word(o.recordCount);
    const n = arr !== null && guestPointer(arr) && count !== null ? Math.min(count >>> 0, ORIGIN_RECORDS_MAX) : 0;
    const rec = async (i: number): Promise<{ i: number; self: number | null; at: (number | null)[] } | null> => {
      const r = await g.word(arr! + 4 * i);
      if (r === null || !guestPointer(r)) return null;
      return { i, self: await g.word(r + o.recSelf), at: await g.floats(r + o.recOrigin, 3) };
    };
    const dxz = (at: (number | null)[]): number => {
      const ax = at[0], az = at[2];
      return ax == null || az == null ? Infinity : Math.hypot(ax - feet[0], az - feet[2]);
    };
    let found: { i: number; self: number | null; at: (number | null)[] } | null = null;
    const kept = this.originKept;
    if (kept && kept.idx < n) {
      const r = await rec(kept.idx);
      if (r && r.self === kept.self) found = r;
    }
    if (!found && n > 0) {
      let best: { i: number; self: number | null; at: (number | null)[] } | null = null;
      for (let i = 0; i < n; i++) {
        const r = await rec(i);
        if (!r) continue;
        if (kept && r.self === kept.self) { best = r; break; }
        if (!kept && dxz(r.at) <= ORIGIN_MATCH_XZ && (!best || dxz(r.at) < dxz(best.at))) best = r;
      }
      found = best;
    }
    if (!found && count !== null && (count >>> 0) > ORIGIN_RECORDS_MAX) this.originBeyondCap++;
    if (found && found.self !== null) this.originKept = { idx: found.i, self: found.self };
    const [probeBaseX, probeBaseY, probeBaseZ] = await g.floats(actor + o.probeBase, 3);
    const probeYGlobal = await g.float(o.probeY);
    const slot = await g.word(actor + o.probeSlot);
    const flags1061 = await g.byte(actor + o.flags1061);
    const c4 = await g.word(this.col.guestClock);
    this.originErrors += g.errors;
    const torn = c4 === null ? null : c4 === c0 ? 0 : 1;
    const stale = slot === null || torn !== 0 ? null : (slot | 0) === ORIGIN_SLOT_SKIPPED ? 1 : 0;
    const live = found && stale !== 1 ? found : null;
    const oy = live ? live.at[1] ?? null : null;
    return {
      probeRecs: count === null ? null : count >>> 0,
      probeIdx: found ? found.i : null,
      probeSelf: found && found.self !== null ? `0x${(found.self >>> 0).toString(16)}` : null,
      probeOx: live ? live.at[0] ?? null : null,
      probeOy: oy,
      probeOz: live ? live.at[2] ?? null : null,
      probeLift: oy === null ? null : oy - feet[1],
      probeDxz: live ? dxz(live.at) : null,
      probeBaseX: probeBaseX ?? null, probeBaseY: probeBaseY ?? null, probeBaseZ: probeBaseZ ?? null,
      probeYGlobal,
      probeSlot: slot === null ? null : slot | 0,
      flags1061,
      originTorn: torn,
      probeOriginStale: stale,
    };
  }
  private near: { obj: number; type: number }[] = [];
  private rowsSinceWalk = Infinity;

  constructor(private readonly pine: PineReads, readonly revision: Revision, private readonly opts: SamplerOptions = {}) {
    this.col = GUEST_ADDRESSES[revision];
    this.tiltCol = TILT_ADDRESSES[revision];
    this.stickCol = STICK_ADDRESSES[revision];
    this.extraCol = opts.extra ? EXTRA_ADDRESSES[revision] : null;
    this.originCol = opts.origin ? ORIGIN_ADDRESSES[revision] : null;
  }

  /** The extra words for the row (one read at a time, SafeReads: a failure is null, never the row). */
  private async readExtra(actor: number, feet: readonly [number, number, number]): Promise<PcsxExtra> {
    const x = this.extraCol!;
    const g = new SafeReads(this.pine);
    const [velX, velY, velZ] = await g.floats(actor + x.velocity, 3);
    const [diveVelX, diveVelY, diveVelZ] = await g.floats(actor + x.diveVelocity, 3);
    const radius = this.opts.nearRadius ?? 30;
    const pos = async (obj: number): Promise<[number, number, number] | null> => {
      const p = await g.floats(obj + 0x1c, 3);
      return p.every((v) => v !== null && Number.isFinite(v)) ? (p as [number, number, number]) : null;
    };
    const dist = (p: readonly number[]): number => Math.hypot(p[0]! - feet[0], p[1]! - feet[1], p[2]! - feet[2]);
    if (++this.rowsSinceWalk >= (this.opts.nearRefreshRows ?? 30)) {
      this.rowsSinceWalk = 0;
      // The walk: keep every object within twice the radius, so the rows between walks see one walk in.
      const kept: { obj: number; type: number }[] = [];
      const end = x.actorList + 4;
      const seen = new Set<number>();
      let node = await g.word(x.actorList + 8);
      for (let i = 0; node !== null && node !== end && guestPointer(node) && !seen.has(node) && i < ACTOR_LIST_MAX; i++) {
        seen.add(node);
        const obj = await g.word(node + 8);
        if (obj !== null && obj !== actor && guestPointer(obj)) {
          const type = await g.byte(obj + x.actorType);
          const p = await pos(obj);
          if (type !== null && p && dist(p) <= 2 * radius) kept.push({ obj, type });
        }
        node = await g.word(node + 4);
      }
      this.near = kept;
    }
    const near: string[] = [];
    for (const k of this.near) {
      const p = await pos(k.obj);
      if (!p) continue;
      const d = dist(p);
      if (d <= radius) near.push(`0x${k.obj.toString(16)}:${k.type}:${p.map((v) => v.toFixed(2)).join('/')}/${d.toFixed(2)}`);
    }
    this.extraErrors += g.errors;
    return { velX: velX ?? null, velY: velY ?? null, velZ: velZ ?? null, diveVelX: diveVelX ?? null, diveVelY: diveVelY ?? null, diveVelZ: diveVelZ ?? null, nearCount: near.length, near: near.join(';') };
  }

  async sample(): Promise<PcsxSample | null> {
    const c = this.col;
    const r = (a: number): Promise<number> => this.pine.read32(a);
    const c0 = await r(c.guestClock);
    const actor = await r(c.playerActor);
    if (!actor) {
      this.nullActor++;
      return null;
    }
    const x = f32(await r(actor + c.actorPos));
    const y = f32(await r(actor + c.actorPos + 4));
    const z = f32(await r(actor + c.actorPos + 8));
    const node = await r(actor + c.rootNode);
    const rootY = node ? f32(await r(node + 4)) : Number.NaN;
    const moveScale = f32(await r(actor + c.moveScale));
    const stanceRequest = c.stanceRequest === null ? null : await this.pine.read8(actor + c.stanceRequest);
    const c1 = await r(c.guestClock);
    if (c1 !== c0) {
      this.torn++;
      return null;
    }
    // EPH-TILT: after the base row's own clock check, through SafeReads, so no tilt or stick read can cost the row; a
    // third clock read says whether they straddled a frame (`tiltTorn`).
    if (!this.tiltCol && !this.stickCol) {
      return { ...(await this.extraOf(actor, [x, y, z], c0)), ...(await this.originOf(actor, [x, y, z], c0)), clockBits: c0, t: f32(c0), x, y, z, rootY, moveScale, stanceRequest, ...noTilt(), stickTurn: null, stickForward: null, stickLateral: null,
        padRaw0: null, padRaw1: null, padRaw2: null, padRaw3: null, padMoveA: null, padMoveB: null, padFlag0: null, ctlForward: null, ctlLateral: null, ctlTurn: null, tiltTorn: null };
    }
    const g = new SafeReads(this.pine);
    const tilt = this.tiltCol ? await readTilt(g, this.tiltCol, actor, c.rootNode) : noTilt();
    const k = this.stickCol;
    const stickTurn = k ? await g.float(actor + k.turn) : null;
    const stickForward = k ? await g.float(actor + k.forward) : null;
    const stickLateral = k ? await g.float(actor + k.lateral) : null;
    const pad = k ? await g.word(k.padObject) : null;
    const padOk = pad !== null && guestPointer(pad);
    const raw = padOk ? await g.word(pad + k!.padRaw) : null;
    const padMoveA = padOk ? await g.float(pad + k!.padMove) : null;
    const padMoveB = padOk ? await g.float(pad + k!.padMove + 4) : null;
    const b = (i: number): number | null => (raw === null ? null : (raw >>> (8 * i)) & 0xff);
    const flagW = padOk ? await g.word(pad + k!.padFlag) : null;
    const ctl = k ? await g.word(actor + k.controller) : null;
    const ctlOk = ctl !== null && guestPointer(ctl);
    const ctlForward = ctlOk ? await g.float(ctl + k!.ctlForward) : null;
    const ctlLateral = ctlOk ? await g.float(ctl + k!.ctlLateral) : null;
    const ctlTurn = ctlOk ? await g.float(ctl + k!.ctlTurn) : null;
    const c2 = await g.word(c.guestClock);
    const tiltTorn = c2 === null ? null : c2 === c0 ? 0 : 1;
    if (tiltTorn === 1) this.tiltTorn++;
    this.tiltErrors += g.errors;
    const extra = await this.extraOf(actor, [x, y, z], c0);
    const origin = await this.originOf(actor, [x, y, z], c0);
    return {
      ...extra, ...origin, clockBits: c0, t: f32(c0), x, y, z, rootY, moveScale, stanceRequest, ...tilt, stickTurn, stickForward, stickLateral,
      padRaw0: b(0), padRaw1: b(1), padRaw2: b(2), padRaw3: b(3), padMoveA, padMoveB,
      padFlag0: flagW === null ? null : flagW & 0xff, ctlForward, ctlLateral, ctlTurn, tiltTorn,
    };
  }
}

/**
 * seal_speed_probe.py:422-429 (Recorder.run, desktop@be5578311): `except Exception: self.errors += 1;
 * time.sleep(0.05); continue` -- a PINE hiccup is counted and the sampling goes on after 50 ms.
 */
export const PINE_ERROR_BACKOFF_MS = 50;
/**
 * Errors in a row after which the run stops cleanly (the probe goes on forever; a harness run with PCSX2 gone must
 * end and write its record). An adaptation, the instrument's bound, not a game value.
 */
export const PINE_ERROR_LIMIT = 50;

export interface RecorderOptions {
  /** False once the run ends sampling. */
  readonly running: () => boolean;
  readonly onRow: (row: PcsxSample) => void;
  readonly sleep?: (ms: number) => Promise<void>;
  /** Errors in a row before run() gives up; default PINE_ERROR_LIMIT. */
  readonly limit?: number;
}

/** The wall ms between the two reads of each build's clock: the existing samplers' quarter second, an adaptation. */
export const DETECT_GAP_MS = 250;
/**
 * How long the detection reads pairs while neither clock advances (a state still loading) before it fails: the same
 * bound as the run's first rows (FIRST_ROWS_TIMEOUT_MS), an adaptation, the instrument's bound.
 */
export const DETECT_TIMEOUT_MS = 30_000;

/** One build's clock read twice, DETECT_GAP_MS apart. */
export interface ClockReading {
  readonly revision: Revision;
  readonly addr: number;
  readonly first: number;
  readonly second: number;
  /** Both finite and the second later than the first. */
  readonly advanced: boolean;
}

export interface Detection {
  readonly revision: Revision;
  readonly readings: ClockReading[];
  /** PINE reads that failed during the detection (counted, retried; PINE_ERROR_LIMIT in a row ends it). */
  readonly pineErrors: number;
}

/** The detection could not name one build: neither clock or both advanced. The run fails; nothing falls back. */
export class RevisionError extends Error {
  constructor(what: string, readonly readings: readonly ClockReading[], readonly pineErrors = 0) {
    super(`EPH: cannot tell which build PCSX2 runs: ${what} (${describeReadings(readings)})`);
    this.name = 'RevisionError';
  }
}

/** The detection's PINE reads failed PINE_ERROR_LIMIT times in a row (the Recorder's stop, in the detection). */
export class PineFailedError extends Error {
  constructor(what: string, readonly errors: number) {
    super(what);
    this.name = 'PineFailedError';
  }
}

/** A clock reading as printed: six significant digits, garbage as it reads. */
function num(v: number): string {
  return Number.isFinite(v) ? String(Number(v.toPrecision(6))) : String(v);
}

const hex8 = (a: number): string => `0x${a.toString(16).padStart(8, '0')}`;

/** `r0001 clock 0x004365c0 read 0 then 0; r0004 clock 0x00442fd0 read 49.585 then 50.586`. */
export function describeReadings(readings: readonly ClockReading[]): string {
  return readings.map((r) => `${r.revision} clock ${hex8(r.addr)} read ${num(r.first)} then ${num(r.second)}`).join('; ');
}

/**
 * Which build PCSX2 runs: each build's guest clock read twice DETECT_GAP_MS apart; the build is the one whose clock
 * advanced. Both advancing fails at once; neither advancing reads another pair until DETECT_TIMEOUT_MS, then fails --
 * both with the readings, and never with a default build (guest_addresses.py:10-15). A PINE error is counted and the
 * pair read again after PINE_ERROR_BACKOFF_MS; PINE_ERROR_LIMIT in a row end it with an Error saying so.
 */
export async function detectRevision(
  pine: PineReads,
  opts: { sleep: (ms: number) => Promise<void>; now: () => number; gapMs?: number; timeoutMs?: number; errorLimit?: number },
): Promise<Detection> {
  const gap = opts.gapMs ?? DETECT_GAP_MS;
  const timeout = opts.timeoutMs ?? DETECT_TIMEOUT_MS;
  const limit = opts.errorLimit ?? PINE_ERROR_LIMIT;
  const t0 = opts.now();
  let errors = 0;
  let inARow = 0;
  for (;;) {
    let readings: ClockReading[];
    try {
      const first: number[] = [];
      for (const rev of REVISIONS) first.push(f32(await pine.read32(GUEST_ADDRESSES[rev].guestClock)));
      await opts.sleep(gap);
      const second: number[] = [];
      for (const rev of REVISIONS) second.push(f32(await pine.read32(GUEST_ADDRESSES[rev].guestClock)));
      readings = REVISIONS.map((rev, i) => {
        const a = first[i]!;
        const b = second[i]!;
        return { revision: rev, addr: GUEST_ADDRESSES[rev].guestClock, first: a, second: b, advanced: Number.isFinite(a) && Number.isFinite(b) && b > a };
      });
    } catch (err) {
      errors++;
      inARow++;
      if (inARow >= limit) throw new PineFailedError(`PINE failed ${inARow} reads in a row in the build detection (last: ${(err as Error).message})`, errors);
      await opts.sleep(PINE_ERROR_BACKOFF_MS);
      continue;
    }
    inARow = 0;
    const moving = readings.filter((r) => r.advanced);
    if (moving.length === 1) return { revision: moving[0]!.revision, readings, pineErrors: errors };
    if (moving.length > 1) throw new RevisionError('both guest clocks advanced', readings, errors);
    if (opts.now() - t0 >= timeout) throw new RevisionError(`neither guest clock advanced in ${timeout / 1000} s`, readings, errors);
  }
}

/** Samples as fast as PINE answers until stopped (seal_speed_probe.py Recorder), counting errors, never throwing. */
export class Recorder {
  /** Every failed sample (the probe's `errors`). */
  errors = 0;
  /** Failed samples since the last good one. */
  consecutive = 0;

  constructor(private readonly sampler: { sample(): Promise<PcsxSample | null> }, private readonly opts: RecorderOptions) {}

  /** Null when sampling was ended by the run; the reason when `limit` errors in a row ended it. */
  async run(): Promise<Error | null> {
    const limit = this.opts.limit ?? PINE_ERROR_LIMIT;
    const wait = this.opts.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
    while (this.opts.running()) {
      let row: PcsxSample | null;
      try {
        row = await this.sampler.sample();
      } catch (err) {
        if (!this.opts.running()) break;   // the run closed PINE under the last read: not an error of the run
        this.errors++;
        this.consecutive++;
        if (this.consecutive >= limit) {
          return new Error(`PINE failed ${this.consecutive} reads in a row (last: ${(err as Error).message}); ${this.errors} errors in all`);
        }
        await wait(PINE_ERROR_BACKOFF_MS);
        continue;
      }
      this.consecutive = 0;
      if (row) this.opts.onRow(row);
    }
    return null;
  }
}
