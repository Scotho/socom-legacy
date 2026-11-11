import { M67, type CollisionOwner, type GridParams, type WorldPoly } from '@s2u/scene';
import type { RdrNode } from '@s2u/archive';
import type { Stance } from '../../src/mover';
import { FLINCH_CLIPS } from '../../src/net/deaths';
import { blastKnock, type Knock } from '../../src/net/blast';

/**
 * The sprint 28 gate table (ruling PF.R35, research 217 s1): one row per gate, run by two runners -- the page's
 * (`../bodyGates.test.ts`: `WalkMode` with its `Walker` and `Traversal`, the presses the page takes) and the room's
 * (`../../../central/test/roomGates.test.ts`: a `Room` fed `Command`s over the wire's codec) -- so the room refuses what
 * the page refuses by the same rows. A mover gate needs no room edit (the page's `Walker` and the room's `MoverSim`
 * are one code); a gate the room applies itself (fire, reload, knock, damage) adds its row and its `why`.
 *
 * Each later task appends ONE block of rows to `GATE_ROWS` (its own `// PF-NN` comment over it, in task order), and,
 * if its gate takes another kind of press, one member to `GateInput` with its branch in both runners' `switch (row.input.kind)` (`onPage` in bodyGates, `inRoom` in roomGates).
 *
 * The world: the runners lay `GATE_FLOOR` (2000 square at y 0) under `world`'s polygons on `GATE_PARAMS`; a row's
 * polygons are its obstacles. The body is placed on that floor at `at`, facing `yaw` (degrees, the camera's: 0 looks
 * down -z, -90 down +x), in `stance` (set at once, no transition), and stands still for `GATE_SETTLE` ticks before
 * anything; `motion` (null: still) is the stick it is driven with for `ticks` before the press and after it.
 */

/** Where the body starts; `weapon` the firearm in hand (PF-17: 0 the rifle, the default; 1 the sidearm). */
export interface GateBody { at: readonly [number, number]; yaw: number; stance: Stance; weapon?: 0 | 1 }
/** The stick before the press (and held after it), for `ticks` game ticks; null rows stand still. */
/** `climb` (LC-1): the Action pressed once, on the first tick the ladder offers CLIMB, as a player mounts it. */
export interface GateMotion { forward: number; right: number; ticks: number; climb?: true }
/**
 * The press under test. PF-15: a stance press. PF-16: `walk`, no press -- the row's motion alone, toward an obstacle
 * across x at `wall`. PF-17: a round -- the stance press `press` starts a clip, and the round leaves at the first command
 * whose playing motion is `at.clip` with its phase at `at.phase` or past (`./net/fireCapability` `motionOf`, the stack's
 * phase); the page reads `WalkMode.fireAllowed()`, the room drops `'nofire'`. PF-20: a stance press under a held peek
 * (`peekStance`: the lean `side` held `PEEK_LEAD` ticks first and through the press, which goes `to`; `observe` the press's
 * tick or the one after it). PF-21: `flinchDuring`, a flinch asked `after` ticks into a stance press or a swap to the pistol (`press`; the
 * press's tick the first) -- the page's own flinch drawn or not (`WalkMode.setFlinchPose`, `flinchRefused`) and its
 * stance row (`flinchStance`), the room's `flinch` event told or not and its clip's row (`flinchRowOf`). Later tasks add
 * members (a reload...) and their runner branches.
 */
export type GateInput =
  | { kind: 'stance'; to: Stance }
  | { kind: 'walk'; wall: number }
  | { kind: 'fire'; press: Stance; at: { clip: string; phase: number } }
  | { kind: 'peekStance'; side: -1 | 1; to: Stance; observe: 'press' | 'next' }
  /**
   * PF-18 (ruling PF.R37; research 218 s2): the body flinched by a round that cost health (`seal_flinch_rarm`, its
   * `GATE_MOTION_RECORDS` playback), then -- `ticks` into the flinch -- a reload or a round. The page reads
   * `WalkMode.flinching()` (its `Fire.source.flinching`) for the reload and `fireAllowed()` for the round; the room drops
   * the reload `'flinch'` and takes the round.
   */
  | { kind: 'flinch'; then: 'reload' | 'fire'; ticks: number }
  /**
   * PF-19 (ruling PF.R38; research 218 s3): an M67's knock (`gateKnock`: `blastKnock` at 140 a fragment, the blast at the
   * feet + `from`) laid on the body after its motion -- the page's `WalkMode.knock`, the room's `Room.layKnock` (the one
   * knock path of `blast()`); what both show the tick it lands (`knockOutcome`).
   */
  | { kind: 'knock'; from: readonly [number, number, number] }
  | { kind: 'flinchDuring'; press: { stance: Stance } | { swap: 1 }; after: number };
/**
 * The outcome both ends must show: the press taken, or refused (the body as it was); for a `walk` row (PF-16), passed
 * (the feet beyond the obstacle) or stopped short of it by the distance, to a tenth (`walkOutcome`); PF-20's: the peek
 * ended at the press with the stance kept, and the held lean peeking again the tick after it, from its held key.
 */
export type GateExpect = 'taken' | 'refused' | 'passed' | `stopped at ${number}` | 'peek ended, stance kept' | 'lean next tick'
  | 'released, airborne' | 'proneCover' | `flinch from ${Stance}` | 'no flinch';
export interface GateRow {
  /** The row's name: the it.each title's first `%s`. */
  name: string;
  /** The obstacles over the floor. */
  world: readonly WorldPoly[];
  body: GateBody;
  motion: GateMotion | null;
  input: GateInput;
  expect: GateExpect;
  /** A refusal the room names (`Room.dropped(kind, why)`); absent for a mover gate, which drops nothing. */
  why?: string;
}

/** The grid the runners build: 10 x 10 cells of 200 from (-1000, -1000), the room tests' flat map's. */
export const GATE_PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
/** The ticks a placed body stands before its row's motion: it lands and settles. */
export const GATE_SETTLE = 60;
/** The ticks run after the press: a transition clip (under 1.5 s) plays out. */
export const GATE_AFTER = 90;

const poly = (path: string, ditype: number, points: number[]): WorldPoly => ({
  modelName: 'worldmodel', path, region: 0, ditype, material: 25, ptcount: points.length / 3, cameratype: 0, points: Float32Array.from(points),
});
/** PF-19: a polygon with its `appflags` (the ladder's 2, research 86 s2). */
const flagged = (path: string, ditype: number, appflags: number, points: number[]): WorldPoly => ({ ...poly(path, ditype, points), appflags });
/**
 * PF-19: `room.test.ts`'s ladder (research 86 s2): a 40 wall across x at z 0 with a deck behind it at 40, the ladder's
 * span 0..40 and its cap on the wall's face at z 0.2, 6 wide -- climbed from z > 0 facing -z.
 */
export const gateLadder = (): WorldPoly[] => [
  poly('worldmodel/deck', 3, [-100, 40, -100, 100, 40, -100, 100, 40, 0, -100, 40, 0]),
  poly('worldmodel/wall', 2, [-100, 0, 0, 100, 0, 0, 100, 40, 0, -100, 40, 0]),
  flagged('worldmodel/lad/ladder', 2, 2, [-3, 0, 0.2, 3, 0, 0.2, 3, 40, 0.2, -3, 40, 0.2]),
  flagged('worldmodel/lad/ladder', 2, 2, [3, 40, 0.2, -3, 40, 0.2, -3, 50, 0.2, 3, 50, 0.2]),
];

/** The floor under every row (`m_ditype` 3, ground and side). */
export const GATE_FLOOR: WorldPoly = poly('worldmodel/floor', 3, [-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]);
/** A vertical wall across x at `x` (z -150..150) from `y0` to `y1` (`m_ditype` 2: a wall for the mover and the gates). */
export const gateWallX = (x: number, y0: number, y1: number): WorldPoly =>
  poly('worldmodel/wall', 2, [x, y0, -150, x, y0, 150, x, y1, 150, x, y1, -150]);
/** A level roof over the origin (x, z -50..50) at `y` (`m_ditype` 2: nothing stands on it, no wall; a headroom ray meets it). */
export const gateRoof = (y: number): WorldPoly => poly('worldmodel/roof', 2, [-50, y, -50, 50, y, -50, 50, y, 50, -50, y, 50]);

/** A row's polygons over the floor, one owner each (the runners' `packGround` input). */
export function gatePolys(row: GateRow): { polys: WorldPoly[]; owners: CollisionOwner[] } {
  const polys = [GATE_FLOOR, ...row.world];
  return { polys, owners: polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 })) };
}

/** Facing +x (the camera's yaw: 0 looks down -z). */
const EAST = -90;

export const GATE_ROWS: readonly GateRow[] = [
  // PF-15 (research 217 s1): FUN_00552ec0's gates, D:L418914-419025.
  { // the prone gate: FUN_0054d620(11.2, 8.0, 3.25), D:L418935-418940 (PRONE_GATE_READING)
    name: 'prone refused 11.2 ahead', world: [gateWallX(50, 0, 30)], body: { at: [39, 0], yaw: EAST, stance: 'stand' },
    motion: null, input: { kind: 'stance', to: 'prone' }, expect: 'refused',
  },
  { // the stand's headroom: FUN_0057efe0(actor, 0), the idle hips + 2 (7.504) to the feet + 19 (HEADROOM_HIPS_READING)
    name: 'stand under a 10 roof crouched', world: [gateRoof(10)], body: { at: [0, 0], yaw: EAST, stance: 'crouch' },
    motion: null, input: { kind: 'stance', to: 'stand' }, expect: 'refused',
  },
  { // prone -> crouch: FUN_0057efe0(actor, 1), 4.168 to the feet + 12, clear under 16
    name: 'prone to crouch under 16', world: [gateRoof(16)], body: { at: [0, 0], yaw: EAST, stance: 'prone' },
    motion: null, input: { kind: 'stance', to: 'crouch' }, expect: 'taken',
  },
  { // the crouch gate: FUN_0054d620(|v| x 1.2, 7.0, 7.8), a bar from 7 to 9 high 10 ahead (CROUCH_GATE_READING)
    name: 'crouch into a 7.8-high slot', world: [gateWallX(10, 7, 9)], body: { at: [0, 0], yaw: EAST, stance: 'stand' },
    motion: null, input: { kind: 'stance', to: 'crouch' }, expect: 'refused',
  },
  // PF-16 (research 217 s2): FUN_0054aa30's wall probes, D:L414515-416190 (WALL_PROBE_READING, ruling PF.R44).
  { // the low probe at the feet + 6.5 under the bar, the head line (19.394) over it: H92's "a standing SEAL ... yes"
    name: 'a 10-high slot standing', world: [gateWallX(50, 7, 10)], body: { at: [0, 0], yaw: EAST, stance: 'stand' },
    motion: { forward: 1, right: 0, ticks: 60 }, input: { kind: 'walk', wall: 50 }, expect: 'passed',
  },
  { // the prone class (8.0, 6.0): the probe at the feet + 3.0 meets the wall 8.0 along the travel (PRONE_FAN_READING)
    name: 'prone into a wall at 8', world: [gateWallX(30, 0, 30)], body: { at: [0, 0], yaw: EAST, stance: 'prone' },
    // SEGMENT-BODY (re-judged; was 'stopped at 8', the disc's line ahead): prone, the head line runs along the facing by
    // 1.1 x the muzzle's forward part, 15.94 (`HEAD_LINE_MUZZLE_READING`), and one hit over 1 deep is the jam (research
    // 217 s2.9): it stops where that line first crosses the wall, plus the tick's move.
    motion: { forward: 1, right: 0, ticks: 180 }, input: { kind: 'walk', wall: 30 }, expect: 'stopped at 16.1',
  },
  // PF-17 (research 218 s1; ruling PF.R36): the playing motion's NoFire, FUN_005a7de0 D:L462695-462705 through FUN_0058a8c0.
  { // seal_stand2prone NoFire bare (194 A02): no round through the whole clip
    name: 'fire in stand -> prone', world: [], body: { at: [0, 0], yaw: EAST, stance: 'stand', weapon: 0 },
    motion: null, input: { kind: 'fire', press: 'prone', at: { clip: 'seal_stand2prone', phase: 0 } }, expect: 'refused', why: 'nofire',
  },
  { // seal_crouch2prone NoFire 0.8 (194 A02): the first command at 0.81 or past fires
    name: 'fire at crouch -> prone 0.81', world: [], body: { at: [0, 0], yaw: EAST, stance: 'crouch', weapon: 0 },
    motion: null, input: { kind: 'fire', press: 'prone', at: { clip: 'seal_crouch2prone', phase: 0.81 } }, expect: 'taken',
  },
  // PF-20 (research 217 s3, ruling PF.R39): the stance presses pop the peek with no transition (FUN_00581660
  // D:L442436-442477, FUN_005817d0 D:L442479-442524, FUN_00581c10 D:L442605-442648: no case for state 3); the lean is
  // read after the stance (FUN_00594cf0 D:L453431-453458), and the held d-pad peeks again the next tick from the held key.
  { // the press under a right peek, standing: no Stand -> Crouch, the stance kept
    name: 'stance press under a peek', world: [], body: { at: [0, 0], yaw: EAST, stance: 'stand' },
    motion: null, input: { kind: 'peekStance', side: 1, to: 'crouch', observe: 'press' }, expect: 'peek ended, stance kept',
  },
  { // the press and the lean on one tick, crouched under a left peek: the lean read after the stance, the peek next tick
    name: 'lean after stance in one tick', world: [], body: { at: [0, 0], yaw: EAST, stance: 'crouch' },
    motion: null, input: { kind: 'peekStance', side: -1, to: 'prone', observe: 'next' }, expect: 'lean next tick',
  },
  // PF-18 (research 218 s2; ruling PF.R37): the flinch's motion flag 0x4 (FUN_005a2690 D:L460018-460025) refuses a reload
  // through FUN_005b4340(actor, 3) (D:L469494-469504); the six short flinches carry no NoFire (194 A02).
  { // a reload 10 ticks into a standing flinch (1 s here): refused, no magazine taken
    name: 'reload in a flinch', world: [], body: { at: [0, 0], yaw: EAST, stance: 'stand', weapon: 0 },
    motion: null, input: { kind: 'flinch', then: 'reload', ticks: 10 }, expect: 'refused', why: 'flinch',
  },
  { // a round 10 ticks into it: taken
    name: 'fire in a flinch', world: [], body: { at: [0, 0], yaw: EAST, stance: 'stand', weapon: 0 },
    motion: null, input: { kind: 'flinch', then: 'fire', ticks: 10 }, expect: 'taken',
  },
  // PF-19 (research 218 s3; ruling PF.R38): FUN_0057e770 D:L440981-441027 has no state gate -- the move released, then
  // the reaction; alive and prone, `Prone cover` in place (D:L441018-441020) with its `NoFire ()`.
  { // walked to the ladder, CLIMB pressed (LC-1), and up its rungs, an M67 30 to its side: off the ladder into the air (KNOCK_LADDER_STATE_READING)
    name: 'knock on a ladder', world: gateLadder(), body: { at: [0, 20], yaw: 0, stance: 'stand' },
    motion: { forward: 1, right: 0, ticks: 150, climb: true }, input: { kind: 'knock', from: [30, 0, 0] }, expect: 'released, airborne',
  },
  { // prone, an M67 30 off: no push, `Prone cover` on the floor, no round inside it
    name: 'knock prone alive', world: [], body: { at: [0, 0], yaw: EAST, stance: 'prone' },
    motion: null, input: { kind: 'knock', from: [30, 0, 0] }, expect: 'proneCover',
  },
  // PF-21 (research 217 s4, ruling PF.R45): FUN_005a2690's gate (D:L459887-460017: a weapon switch refuses, a stance
  // change does not) and FUN_005a0270's stance row (L458746-458775: the change's origin while under half done).
  { // 6 ticks (0.1 s) of seal_stand2crouch's 0.603: the first half, the origin's row
    name: 'flinch 0.1 s into stand -> crouch', world: [], body: { at: [0, 0], yaw: EAST, stance: 'stand' },
    motion: null, input: { kind: 'flinchDuring', press: { stance: 'crouch' }, after: 6 }, expect: 'flinch from stand',
  },
  { // 25 ticks (0.42 s): past half, the stance's row
    name: 'flinch past half of stand -> crouch', world: [], body: { at: [0, 0], yaw: EAST, stance: 'stand' },
    motion: null, input: { kind: 'flinchDuring', press: { stance: 'crouch' }, after: 25 }, expect: 'flinch from crouch',
  },
  { // `Rifle -> Pistol` playing (0x35, FUN_005a7980(actor, 1)): no flinch
    name: 'flinch during a swap', world: [], body: { at: [0, 0], yaw: EAST, stance: 'stand' },
    motion: null, input: { kind: 'flinchDuring', press: { swap: 1 }, after: 10 }, expect: 'no flinch',
  },
];

/**
 * PF-17: `motion.rdr`'s records the fire rows (and `fireCapability.test.ts`, `roomCapability.test.ts`, `walk.test.ts`)
 * read, as the file writes them (a bare `NoFire ()` an empty list): the values research 194 A02's table reads off the
 * disc, each pinned against the tracked fixture's `motion.rdr` by `motionTable.test.ts` ("motion.rdr's NoFire: ...").
 * `playback` and `NoInterrupt` as the file's (`ACTION_CLIPS`, `HOLD_CLIPS`). The six short multiplayer flinches carry
 * none (194 A02; pinned there too). Both runners hand it to every row (the page's `setMotionTable`, the room's clips).
 */
export const GATE_MOTION_RECORDS: RdrNode = ['animations', [
  ['anim_name', ['seal_stand2prone'], 'playback', ['1'], 'NoInterrupt', [], 'NoFire', []],
  ['anim_name', ['seal_p_stand2prone'], 'playback', ['1'], 'NoInterrupt', [], 'NoFire', []],
  ['anim_name', ['seal_crouch2prone'], 'playback', ['0.9'], 'NoInterrupt', [], 'NoFire', ['0.8']],
  ['anim_name', ['seal_stand2crouch'], 'playback', ['0.65'], 'NoInterrupt', []],
  ['anim_name', ['seal_land_hard'], 'playback', ['1'], 'NoInterrupt', ['0.35'], 'NoFire', ['0.3']],
  ['anim_name', ['seal_p_land_hard'], 'playback', ['1'], 'NoInterrupt', ['0.35'], 'NoFire', ['0.3']],
  ['anim_name', ['seal_runningjump_launch'], 'playback', ['2.4'], 'NoInterrupt', [], 'NoFire', ['0.2']],
  ['anim_name', ['seal_p_runningjump_launch'], 'playback', ['2.4'], 'NoInterrupt', [], 'NoFire', ['0.2']],
  ['anim_name', ['seal_jump'], 'playback', ['1.1'], 'NoInterrupt', ['0.7']],
  ['anim_name', ['seal_land_soft'], 'playback', ['0.7']],
  ['anim_name', ['seal_hang'], 'playback', ['2.2'], 'looped', ['1'], 'NoFire', []],
  ['anim_name', ['seal_ladderslide'], 'playback', ['0.2'], 'looped', ['1'], 'NoFire', []],
  ['anim_name', ['seal_place_claymore'], 'playback', ['2.7'], 'NoInterrupt', ['0.9'], 'NoFire', []],
  ['anim_name', ['seal_180'], 'playback', ['1']],
  ...FLINCH_CLIPS.map((c): RdrNode => ['anim_name', [c], 'playback', ['1']]),
  // PF-19: `Prone cover` (research 179 s11.9: NoPitchtwist, NoInterrupt, NoFire, Normalize; playback 4.3), pinned against
  // the tracked fixture by `netBlast.test.ts` ("guard_prone_cover in the fixture: ...")
  ['anim_name', ['guard_prone_cover'], 'playback', ['4.3'], 'NoPitchtwist', [], 'NoInterrupt', [], 'NoFire', [], 'Normalize', []],
]];

/** PF-20: the ticks the lean is held (still) before a `peekStance` press: the peek on, its clip at its last key. */
export const PEEK_LEAD = 60;

/** What a runner saw of a `peekStance` row: the peek and the stance at the press's tick and the next, the lean's key. */
export interface PeekSeen { pressPeek: number; pressStance: Stance; nextPeek: number; nextStance: Stance; keyBefore: number; keyNext: number }

/** A `peekStance` row's outcome from what the runner saw (`GateExpect`'s PF-20 members), else what differed. */
export function peekOutcome(row: GateRow, seen: PeekSeen): string {
  if (row.input.kind !== 'peekStance') return 'not a peek row';
  const kept = seen.pressStance === row.body.stance && seen.nextStance === row.body.stance;
  if (seen.pressPeek !== 0 || !kept) return `press: peek ${seen.pressPeek}, stance ${seen.pressStance}/${seen.nextStance}`;
  if (row.input.observe === 'press') return 'peek ended, stance kept';
  if (seen.nextPeek !== row.input.side) return `next: peek ${seen.nextPeek}`;
  return seen.keyNext === seen.keyBefore ? 'lean next tick' : `next: key ${seen.keyNext} of ${seen.keyBefore}`;
}

/** A stance row's outcome from the stance after the press: taken, refused (as it was), or the stance it went to instead. */
export function stanceOutcome(row: GateRow, after: Stance): string {
  if (row.input.kind === 'walk' || row.input.kind === 'flinch' || row.input.kind === 'knock' || row.input.kind === 'flinchDuring') {
    throw new Error(`${row.name} is not a stance row`);
  }
  const to = row.input.kind === 'fire' ? row.input.press : row.input.to;
  return after === to ? 'taken' : after === row.body.stance ? 'refused' : `went ${after}`;
}

/** A walk row's outcome from the feet's x after it (PF-16): passed beyond the obstacle, or stopped short by a tenth. */
export function walkOutcome(row: GateRow, x: number): GateExpect {
  if (row.input.kind !== 'walk') throw new Error(`${row.name} is not a walk row`);
  return x > row.input.wall ? 'passed' : `stopped at ${Math.round((row.input.wall - x) * 10) / 10}`;
}

/**
 * PF-19: a `knock` row's knock on a body with its feet, posture and facing: an M67's (`blastKnock`, 140 a fragment, the
 * full damage inside half the radius) from the feet + `from`; null when the row is not a knock row or none is laid.
 */
export function gateKnock(row: GateRow, feet: readonly number[], posture: Stance, yaw: number): Knock | null {
  if (row.input.kind !== 'knock') return null;
  const f = row.input.from;
  return blastKnock({ feet, posture, yaw }, [feet[0]! + f[0], feet[1]! + f[1], feet[2]! + f[2]], M67, 140);
}

/** What a runner saw of a `knock` row: before the knock (a move held the body) and the tick it was laid. */
export interface KnockSeen { busyBefore: boolean; busy: boolean; airborne: boolean; action: string | null; fire: boolean; speed: number }

/** A `knock` row's outcome (`GateExpect`'s PF-19 members), else what differed. */
export function knockOutcome(row: GateRow, seen: KnockSeen): string {
  if (row.input.kind !== 'knock') return 'not a knock row';
  if (row.expect === 'released, airborne') {
    if (!seen.busyBefore) return 'no move held the body before the knock';
    return !seen.busy && seen.airborne && (seen.action === 'fallForward' || seen.action === 'fallBackwards') ? 'released, airborne'
      : `busy ${seen.busy}, airborne ${seen.airborne}, ${seen.action}`;
  }
  return seen.action === 'proneCover' && !seen.airborne && seen.speed === 0 && !seen.fire ? 'proneCover'
    : `${seen.action}, airborne ${seen.airborne}, speed ${seen.speed}, fire ${seen.fire}`;
}

/** PF-21: the stance row a flinch clip is of (`../../src/net/deaths` `FLINCH`: the crouch and prone rows' one clip each). */
export function flinchRowOf(clip: string): Stance {
  return clip === 'seal_crouch_rflinch' ? 'crouch' : clip === 'seal_prone_rflinch' ? 'prone' : 'stand';
}
