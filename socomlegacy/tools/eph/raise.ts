import { guestPointer, type Revision } from './sampler';

/**
 * The enemy-raise columns (the raise option, `probe.ts --raise`; agent-mail/evidence/enemy-raise/SCOPE.md s2.1 and
 * CAPTURE-JOB.md, 2026-11-09). Product track: an instrument, never in a build; what a column measures reaches a research
 * note through `derive-from-desktop` first. The chain they watch (SCOPE.md s1.2, all r0001, reading pending review):
 *
 * - DAT_00440c38 holds the local human's BODY (FUN_00599b60 stores it, D:L455684-455685; FUN_002b3a00 D:L156405-156407);
 *   its controller is `*(body+0xc0)` (piVar14[0x30], D:L455681).
 * - FUN_005970b0 runs FUN_005c9b30 only while the gate byte DAT_003df1b0 is set (D:L454091-454093). FUN_005c9b30 zeroes
 *   ctrl+0xc0 (D:L482090) and adds one per perception record (array pointer body+0xd8, count body+0xd4, 0x30 bytes a
 *   record, D:L482101-482102) whose target is an enemy (team words share no bit, D:L482112), active (+0xe1 bit 4,
 *   D:L482115), of kind 2 (or 3/4, D:L482116-482129) and marked (+0x2c bit 0x200, D:L482131-482132).
 * - FUN_00594cf0 asks UP while ctrl+0xc0 > 0 and re-arms the idle countdown ctrl+0x234 = ctrl+0x22c + ctrl+0x230*rand on
 *   the idle-trigger edge ctrl+0x118 == 0 (D:L453567-453604; the constructor's 5.0 and 0, FUN_00598280 D:L454808-454809).
 * - FUN_005dfe30 compares the request with body+0xf74 & 0xef and writes 0x12 (down) or 0x11 (up, only while body+0x258
 *   bit 0 is set), the envelope at body+0x1160..0x116c (D:L494244-494259).
 *
 * r0004: the globals by data_via_twin or the placed instructions (SCOPE.md s1.6, s1.7, s2.1); every body, controller,
 * record and target offset is carried over from r0001 -- SCOPE.md s2.1: "the twins are masked-identical, and the chain's
 * field offsets are raw-unchanged (skeptic 2), so the offsets carry over (inferred)" -- and listed in RAISE_INFERRED.
 */
export interface RaiseColumn {
  /** The global holding the local body (DAT_00440c38). */
  readonly localBody: number;
  /** The player-input / scripts gate byte (DAT_003df1b0): 0 skips the count and the player control. */
  readonly gate: number;
  /** The multiplayer flag byte (DAT_0045a0c1). */
  readonly mpFlag: number;
  /** r0004 only: the network block's +0x100 word, +0x108 word and +0x10e byte the online freeze tests (0x32a220). */
  readonly freeze100: number | null;
  readonly freeze108: number | null;
  readonly freeze10e: number | null;
  /** In the body: the controller pointer. */
  readonly bodyCtrl: number;
  /** In the controller: the identified-enemy count (s32). */
  readonly ctrlCount: number;
  /** In the controller: the reach (f32; the cone multiplies it by body+0x204). */
  readonly ctrlReach: number;
  /** In the controller: the trigger edge (u8: 0 idle, 2 pressed, 1 held, 3 released). */
  readonly ctrlEdge: number;
  /** In the controller: the idle countdown (f32). */
  readonly ctrlIdle: number;
  /** In the controller: the countdown's base (f32, 5.0) and its random spread (f32, 0), read once. */
  readonly ctrlIdleBase: number;
  readonly ctrlIdleSpread: number;
  /** In the body: the raise word (u32: 0x11/0x01 up, 0x12/0x02 down; bit 0x10 moving). */
  readonly bodyRaise: number;
  /** In the body: the envelope, four f32 from here. */
  readonly bodyEnvelope: number;
  /** In the body: the byte whose bit 0 lets UP through. */
  readonly bodyCanRaise: number;
  /** In the body: the magnification (f32). */
  readonly bodyMagnification: number;
  /** In the body: the team word. */
  readonly bodyTeam: number;
  /** In the body: the perception record count and the record ARRAY POINTER. */
  readonly bodyRecCount: number;
  readonly bodyRecArray: number;
  /** A record's size, and in a record: the target pointer, the squared distance (f32), the sight accumulator (f32),
   *  the word at +0x28 (role unread), the flag word (bit 0x200 the mark). */
  readonly recStride: number;
  readonly recTarget: number;
  readonly recDist2: number;
  readonly recAcc: number;
  readonly recW28: number;
  readonly recFlags: number;
  /** In a target: the kind byte, the flag byte (bit 4 active), the team word, the position (three f32). */
  readonly tgtKind: number;
  readonly tgtFlagsE1: number;
  readonly tgtTeam: number;
  readonly tgtPos: number;
}

const OFFSETS = {
  bodyCtrl: 0xc0, ctrlCount: 0xc0, ctrlReach: 0xa8, ctrlEdge: 0x118, ctrlIdle: 0x234, ctrlIdleBase: 0x22c, ctrlIdleSpread: 0x230,
  bodyRaise: 0xf74, bodyEnvelope: 0x1160, bodyCanRaise: 0x258, bodyMagnification: 0x204, bodyTeam: 0xc8, bodyRecCount: 0xd4, bodyRecArray: 0xd8,
  recStride: 0x30, recTarget: 0, recDist2: 0x10, recAcc: 0x18, recW28: 0x28, recFlags: 0x2c, tgtKind: 0x10, tgtFlagsE1: 0xe1, tgtTeam: 0xc8, tgtPos: 0x1c,
} as const;

type OffsetKey = keyof typeof OFFSETS;

export const RAISE_ADDRESSES: Readonly<Record<Revision, RaiseColumn>> = {
  r0001: { localBody: 0x00440c38, gate: 0x003df1b0, mpFlag: 0x0045a0c1, freeze100: null, freeze108: null, freeze10e: null, ...OFFSETS },
  r0004: { localBody: 0x0044d648, gate: 0x0040a378, mpFlag: 0x0045d481, freeze100: 0x0045d580, freeze108: 0x0045d588, freeze10e: 0x0045d58e, ...OFFSETS },
};

const SCOPE = 'agent-mail/evidence/enemy-raise/SCOPE.md';

/** Each offset's r0001 evidence (the decompilation). */
const OFFSET_EVIDENCE_R0001: Readonly<Record<OffsetKey, string>> = {
  bodyCtrl: 'decompilation: FUN_00599b60 D:L455681-455685 (piVar14[0x30], the body stored in DAT_00440c38)',
  ctrlCount: 'decompilation: FUN_005c9b30 D:L482090 (piVar9[0x30] = 0), D:L482131-482132 (the increment); FUN_00594cf0 D:L453088-453092',
  ctrlReach: 'decompilation: FUN_00598280 D:L454794-454800 (puVar2[0x2a], 1000 clamped by FUN_00539b70)',
  ctrlEdge: 'decompilation: FUN_00594cf0 D:L453567-453569 (piVar16[0x46], a byte)',
  ctrlIdle: 'decompilation: FUN_00594cf0 D:L453574-453594 (piVar16[0x8d], the countdown)',
  ctrlIdleBase: 'decompilation: FUN_00598280 D:L454808 (puVar2[0x8b] = 0x40a00000, 5.0); FUN_00594cf0 D:L453587-453591',
  ctrlIdleSpread: 'decompilation: FUN_00598280 D:L454809 (puVar2[0x8c] = 0); FUN_00594cf0 D:L453591',
  bodyRaise: 'decompilation: FUN_005dfe30 D:L494244 (& 0xef), D:L494256 (0x12), D:L494259 (0x11)',
  bodyEnvelope: 'decompilation: FUN_005dfe30 D:L494245, D:L494250-494255 (+0x1160 envelope, +0x116c)',
  bodyCanRaise: 'decompilation: FUN_005dfe30 D:L494258 (byte +600 = +0x258, bit 0 lets UP through)',
  bodyMagnification: 'decompilation: FUN_005c9520 D:L481801 (+0x204, the reach multiplier; SCOPE.md s1.4)',
  bodyTeam: 'decompilation: FUN_005c9b30 D:L482112 (iVar8 + 200); D:L474092 (DAT_00440c38 + 200)',
  bodyRecCount: 'decompilation: FUN_005c9b30 D:L482102 (+0xd4); FUN_002a0190 D:L145605-145620',
  bodyRecArray: 'decompilation: FUN_005c9b30 D:L482101 (*(iVar8 + 0xd8), a pointer to the records)',
  recStride: 'decompilation: FUN_005c9b30 D:L482102 (count * 0xc words); FUN_002a0200 D:L145648-145649 (* 0x30)',
  recTarget: 'decompilation: FUN_005c9b30 D:L482107-482111 (*piVar12, 0 skipped); FUN_002a0200 D:L145656-145657',
  recDist2: 'decompilation: FUN_002a0200 D:L145651-145654 (the offset\'s squared length); FUN_005ca9f0 D:L482552 (against reach squared)',
  recAcc: 'decompilation: FUN_005ca9f0 D:L482557-482559 (piVar5[6], decayed); SCOPE.md s1.4 (the sight accumulator)',
  recW28: 'decompilation: FUN_002a0200 D:L145660 (zeroed on a new target; its role unread)',
  recFlags: 'decompilation: FUN_005c9b30 D:L482131 (piVar12[0xb] & 0x200, the mark); FUN_005ca170 D:L482280-482283',
  tgtKind: 'decompilation: FUN_005c9b30 D:L482116 (byte +0x10); FUN_0029ee10 D:L144973',
  tgtFlagsE1: 'decompilation: FUN_005c9b30 D:L482115 (byte +0xe1 << 0x3b: bit 4); FUN_0029ee10 D:L145030',
  tgtTeam: 'decompilation: FUN_005c9b30 D:L482112 (iVar13 + 200)',
  tgtPos: 'decompilation: FUN_002a0200 D:L145650 (param_3 + 0x1c, the target\'s position)',
};

/** Each offset's r0004 evidence: carried over, the twin that backs it named (SCOPE.md s1.6, s2.1). */
const OFFSET_EVIDENCE_R0004: Readonly<Record<OffsetKey, string>> = Object.fromEntries(
  (Object.keys(OFFSETS) as OffsetKey[]).map((k) => [k, `carried over from r0001 (inferred, ${SCOPE} s2.1: the twins masked-identical, `
    + `the chain's field offsets raw-unchanged per skeptic 2; FUN_005c9b30 = 0x5d1300 relocation words only, FUN_005dfe30 = 0x5e7600 exact, `
    + `FUN_00594cf0 placed at 0x59a6e0, s1.6); r0001: ${OFFSET_EVIDENCE_R0001[k]}`]),
) as Record<OffsetKey, string>;

/** Each raise address's evidence, per build: what probe.json cites. */
export const RAISE_EVIDENCE: Readonly<Record<Revision, Readonly<Record<keyof RaiseColumn, string>>>> = {
  r0001: {
    localBody: 'decompilation: FUN_00599b60 D:L455684-455685 (DAT_00440c38 = piVar14, the body whose +0xc0 is the controller); FUN_002b3a00 D:L156405-156407; D:L474092',
    gate: 'decompilation: FUN_005970b0 D:L454091-454093 (DAT_003df1b0 == 0 skips FUN_005c9b30); its one writer FUN_00598840 D:L454841',
    mpFlag: 'decompilation: D:L152167-152168 (DAT_0045a0c1 != 0 runs FUN_005442c0); D:L455686; FUN_00402800 D:L328773 (initial 0)',
    freeze100: `no r0001 twin: r0001 freezes on the byte DAT_0045a1ca (D:L453125-453145), not on these words (${SCOPE} s1.7)`,
    freeze108: `no r0001 twin: r0001 freezes on the byte DAT_0045a1ca (D:L453125-453145), not on these words (${SCOPE} s1.7)`,
    freeze10e: `no r0001 twin evidenced: data_via_twin cannot place 0x45a1ca (0 evidence-twinned referrers, ${SCOPE} s1.7)`,
    ...OFFSET_EVIDENCE_R0001,
  },
  r0004: {
    localBody: `data_via_twin 0x440c38 -> 0x44d648: 19 sites, 13 evidence-twinned in 10 functions (FUN_00297410, FUN_002b28d0, FUN_002b35a0 among them); it holds the BODY (${SCOPE} s2.1)`,
    gate: `data_via_twin 0x3df1b0 -> 0x40a378, 5 evidence-twinned referrers; the gate instruction in FUN_005970b0's twin 0x59cbb0 (lbu v0,-0x5c88(at), at 0x410000, at 0x59cbd4) (${SCOPE} s1.6, s2.1)`,
    mpFlag: `the network block r0004 0x45d480 (a0 of the freeze call jal 0x32a220 at 0x59aa28, r0001 0x45a0c0); the flag at block+1 as r0001's 0x45a0c1 = 0x45a0c0+1, by layout (${SCOPE} s1.7, s2.1)`,
    freeze100: `the freeze test 0x32a220 reads net+0x100 (signed, against +0x108) with a0 = 0x45d480, by fold disassembly (r0004/dump.py b 0x32a220 0x32a260; ${SCOPE} s1.7); what it holds unread (R0004_ONLINE_FREEZE, U13)`,
    freeze108: `the freeze test 0x32a220 reads net+0x108 with a0 = 0x45d480, by fold disassembly (${SCOPE} s1.7); what it holds unread (U13)`,
    freeze10e: `the freeze test 0x32a220 answers the byte net+0x10e when +0x100 >= +0x108, by fold disassembly (${SCOPE} s1.7); DAT_0045a1ca's twin inferred there (U13)`,
    ...OFFSET_EVIDENCE_R0004,
  },
};

/**
 * The raise addresses taken by layout or carried over rather than read at their own r0004 site, per build (the
 * EXTRA_INFERRED convention; what probe.json cites beside RAISE_EVIDENCE). r0001: none, the decompilation's. r0004: every
 * offset (SCOPE.md s2.1 calls them inferred), and the multiplayer flag (block+1 by layout); the body global and the gate
 * are data_via_twin's, the freeze words the placed instructions'.
 */
export const RAISE_INFERRED: Readonly<Record<Revision, readonly (keyof RaiseColumn)[]>> = {
  r0001: [],
  r0004: ['mpFlag', ...(Object.keys(OFFSETS) as OffsetKey[])],
};

/** The most records a row walks (CAPTURE-JOB.md: "per record i < 8"; an adaptation, the instrument's bound; the
 *  Sampler's raiseRecords may lower it). A frame whose record count passes the cap is counted in the Sampler's
 *  raiseBeyondCap (probe.json). */
export const RAISE_RECORDS_MAX = 8;

/** The body's quaternion (x, y, z, w floats): sampler TILT_ADDRESSES actorQuat, 0x50 on r0001 and r0004. */
export const BODY_QUAT = 0x50;
/** body+0x38: the start of the three floats logged as raiseView (30's candidate cone vector; not read). */
export const BODY_VIEW = 0x38;

/** The per-record columns, `rec<i><field>` for i < RAISE_RECORDS_MAX. */
export const RAISE_RECORD_FIELDS = ['Target', 'Dist2', 'Acc', 'W28', 'Flags', 'Marked', 'Kind', 'Active', 'Team', 'X', 'Y', 'Z'] as const;

export const PCSX_RAISE_COLUMNS: readonly string[] = [
  'raiseBody', 'raiseCtrl', 'raiseCount', 'raiseReach', 'raiseEdge', 'raiseIdle', 'raiseWord', 'raiseState', 'raiseMoving',
  'raiseEnv0', 'raiseEnv1', 'raiseEnv2', 'raiseEnv3', 'raiseCanRaise', 'raiseMag', 'raiseTeam', 'raiseRecs', 'raiseRecArray', 'raiseYaw', 'raiseViewX', 'raiseViewY', 'raiseViewZ',
  ...Array.from({ length: RAISE_RECORDS_MAX }, (_, i) => RAISE_RECORD_FIELDS.map((f) => `rec${i}${f}`)).flat(),
  'raiseGate', 'raiseMp', 'raiseFreeze100', 'raiseFreeze108', 'raiseFreeze10e', 'raiseTorn', 'raiseStale',
];

/** A row's raise columns. Pointers and team words are hex text; a column behind a bad pointer is null. */
export interface PcsxRaise {
  readonly raiseBody: string | null;
  readonly raiseCtrl: string | null;
  readonly raiseCount: number | null;
  readonly raiseReach: number | null;
  readonly raiseEdge: number | null;
  readonly raiseIdle: number | null;
  /** body+0xf74 raw. */
  readonly raiseWord: number | null;
  /** raiseWord & 0xef: 1 up, 2 down (FUN_005dfe30 D:L494244, FUN_005e0010). */
  readonly raiseState: number | null;
  /** 1 when raiseWord has bit 0x10 (moving), 0 when not. */
  readonly raiseMoving: number | null;
  readonly raiseEnv0: number | null;
  readonly raiseEnv1: number | null;
  readonly raiseEnv2: number | null;
  readonly raiseEnv3: number | null;
  /** body+0x258 bit 0. */
  readonly raiseCanRaise: number | null;
  readonly raiseMag: number | null;
  readonly raiseTeam: string | null;
  /** body+0xd4, raw (records past RAISE_RECORDS_MAX are not read). */
  readonly raiseRecs: number | null;
  readonly raiseRecArray: string | null;
  /**
   * The body's facing as its quaternion's angle, 2 atan2(q.y, q.w) in degrees, from body+0x50..0x5c (the actor's
   * quaternion, sampler TILT_ADDRESSES actorQuat 0x50 on both builds; the 2026-11-01 rig walker's `pos` reads it so).
   * The O-runs turn the player: each count edge is matched to the post's bearing by it (30's ask, 2026-11-09).
   */
  readonly raiseYaw: number | null;
  /**
   * body+0x38..0x40 as three floats -- the vector 30 names as the cone's possible view vector (FUN_005ca9f0's
   * FUN_00309110 x DAT_00650a40; not read: logged so a lag behind raiseYaw on a turn shows; 2026-11-09).
   */
  readonly raiseViewX: number | null;
  readonly raiseViewY: number | null;
  readonly raiseViewZ: number | null;
  readonly raiseGate: number | null;
  readonly raiseMp: number | null;
  readonly raiseFreeze100: number | null;
  readonly raiseFreeze108: number | null;
  readonly raiseFreeze10e: number | null;
  /** 1 when the guest clock moved during the raise reads, 0 when not, null when unread. */
  readonly raiseTorn: number | null;
  /**
   * 1 when the gate byte reads 0 in an un-torn row: FUN_005970b0 then skips FUN_005c9b30 (D:L454091-454093), so
   * ctrl+0xc0 holds an earlier frame's count (SCOPE.md s1.5). The count is kept raw (U16 and U3 want it seen); 0 when the
   * gate is set; null when the gate is unread or the row is torn.
   */
  readonly raiseStale: number | null;
  /** rec<i>Target (hex), rec<i>Dist2, Acc, W28, Flags, Marked (Flags bit 0x200), Kind, Active (+0xe1 bit 4), Team (hex),
   *  X, Y, Z; null for a record not walked or behind a bad pointer. */
  readonly [rec: `rec${number}${string}`]: number | string | null;
}

/** body+0xf74 decoded as FUN_005dfe30 and FUN_005e0010 read it. */
export function decodeRaiseWord(v: number | null): { raiseState: number | null; raiseMoving: number | null } {
  return v === null ? { raiseState: null, raiseMoving: null } : { raiseState: v & 0xef, raiseMoving: (v & 0x10) !== 0 ? 1 : 0 };
}

/** As much of SafeReads (./sampler) as the raise reads use: a refused or failed read is null and counted. */
export interface RaiseReads {
  errors: number;
  word(a: number): Promise<number | null>;
  byte(a: number): Promise<number | null>;
  float(a: number): Promise<number | null>;
  floats(a: number, n: number): Promise<(number | null)[]>;
}

const hex = (v: number | null): string | null => (v === null ? null : `0x${(v >>> 0).toString(16)}`);

/** What one row's raise reads give: the columns, whether the record count passed the cap, the controller read. */
export interface RaiseRead {
  readonly row: PcsxRaise;
  readonly beyondCap: boolean;
  /** The controller, when it was a guest pointer (for the once-read idle words). */
  readonly ctrl: number | null;
}

/**
 * The raise columns of one row, one read at a time through `g` (a failure is null, never the row): the body from its
 * global, the controller from body+0xc0, the first `cap` records (<= RAISE_RECORDS_MAX; the columns of the rest null)
 * from body+0xd8 -- each pointer checked by guestPointer before it is
 * followed -- then the gate, flag and freeze globals, then `clock` again (raiseTorn against `c0`). A non-zero target
 * pointer that fails guestPointer is counted in `g.errors` (an empty record, target 0, is the game's own and is not).
 */
export async function readRaise(g: RaiseReads, o: RaiseColumn, clock: number, c0: number, cap: number = RAISE_RECORDS_MAX): Promise<RaiseRead> {
  const walk = Math.max(0, Math.min(cap, RAISE_RECORDS_MAX));
  const body = await g.word(o.localBody);
  const bodyOk = body !== null && guestPointer(body);
  const ctrl = bodyOk ? await g.word(body + o.bodyCtrl) : null;
  const ctrlOk = ctrl !== null && guestPointer(ctrl);
  const count = ctrlOk ? await g.word(ctrl + o.ctrlCount) : null;
  const reach = ctrlOk ? await g.float(ctrl + o.ctrlReach) : null;
  const edge = ctrlOk ? await g.byte(ctrl + o.ctrlEdge) : null;
  const idle = ctrlOk ? await g.float(ctrl + o.ctrlIdle) : null;
  const word = bodyOk ? await g.word(body + o.bodyRaise) : null;
  const env = bodyOk ? await g.floats(body + o.bodyEnvelope, 4) : [null, null, null, null];
  const can = bodyOk ? await g.byte(body + o.bodyCanRaise) : null;
  const mag = bodyOk ? await g.float(body + o.bodyMagnification) : null;
  const team = bodyOk ? await g.word(body + o.bodyTeam) : null;
  const recs = bodyOk ? await g.word(body + o.bodyRecCount) : null;
  const arr = bodyOk ? await g.word(body + o.bodyRecArray) : null;
  const quat = bodyOk ? await g.floats(body + BODY_QUAT, 4) : [null, null, null, null];
  const yaw = quat[1] == null || quat[3] == null ? null : (2 * Math.atan2(quat[1], quat[3]) * 180) / Math.PI;
  const view = bodyOk ? await g.floats(body + BODY_VIEW, 3) : [null, null, null];
  const arrOk = arr !== null && guestPointer(arr);
  const n = arrOk && recs !== null ? Math.min(recs >>> 0, walk) : 0;
  const cols: Record<string, number | string | null> = {};
  for (let i = 0; i < RAISE_RECORDS_MAX; i++) for (const f of RAISE_RECORD_FIELDS) cols[`rec${i}${f}`] = null;
  for (let i = 0; i < n; i++) {
    const r = arr! + o.recStride * i;
    const target = await g.word(r + o.recTarget);
    const flags = await g.word(r + o.recFlags);
    cols[`rec${i}Target`] = hex(target);
    cols[`rec${i}Dist2`] = await g.float(r + o.recDist2);
    cols[`rec${i}Acc`] = await g.float(r + o.recAcc);
    cols[`rec${i}W28`] = await g.word(r + o.recW28);
    cols[`rec${i}Flags`] = flags;
    cols[`rec${i}Marked`] = flags === null ? null : (flags & 0x200) !== 0 ? 1 : 0;
    if (target === null || target === 0) continue;
    if (!guestPointer(target)) { g.errors++; continue; }
    const e1 = await g.byte(target + o.tgtFlagsE1);
    cols[`rec${i}Kind`] = await g.byte(target + o.tgtKind);
    cols[`rec${i}Active`] = e1 === null ? null : (e1 & 0x10) !== 0 ? 1 : 0;
    cols[`rec${i}Team`] = hex(await g.word(target + o.tgtTeam));
    const [x, y, z] = await g.floats(target + o.tgtPos, 3);
    cols[`rec${i}X`] = x ?? null;
    cols[`rec${i}Y`] = y ?? null;
    cols[`rec${i}Z`] = z ?? null;
  }
  const gate = await g.byte(o.gate);
  const mp = await g.byte(o.mpFlag);
  const f100 = o.freeze100 === null ? null : await g.word(o.freeze100);
  const f108 = o.freeze108 === null ? null : await g.word(o.freeze108);
  const f10e = o.freeze10e === null ? null : await g.byte(o.freeze10e);
  const c5 = await g.word(clock);
  const torn = c5 === null ? null : c5 === c0 ? 0 : 1;
  const stale = gate === null || torn !== 0 ? null : gate === 0 ? 1 : 0;
  const row: PcsxRaise = {
    raiseBody: hex(body),
    raiseCtrl: bodyOk ? hex(ctrl) : null,
    raiseCount: count === null ? null : count | 0,
    raiseReach: reach,
    raiseEdge: edge,
    raiseIdle: idle,
    raiseWord: word === null ? null : word >>> 0,
    ...decodeRaiseWord(word),
    raiseEnv0: env[0] ?? null, raiseEnv1: env[1] ?? null, raiseEnv2: env[2] ?? null, raiseEnv3: env[3] ?? null,
    raiseCanRaise: can === null ? null : can & 1,
    raiseMag: mag,
    raiseTeam: hex(team),
    raiseRecs: recs === null ? null : recs >>> 0,
    raiseRecArray: hex(arr),
    raiseYaw: yaw,
    raiseViewX: view[0] ?? null, raiseViewY: view[1] ?? null, raiseViewZ: view[2] ?? null,
    ...cols,
    raiseGate: gate,
    raiseMp: mp,
    raiseFreeze100: f100 === null ? null : f100 | 0,
    raiseFreeze108: f108 === null ? null : f108 | 0,
    raiseFreeze10e: f10e,
    raiseTorn: torn,
    raiseStale: stale,
  };
  return { row, beyondCap: arrOk && recs !== null && (recs >>> 0) > walk, ctrl: ctrlOk ? ctrl : null };
}
