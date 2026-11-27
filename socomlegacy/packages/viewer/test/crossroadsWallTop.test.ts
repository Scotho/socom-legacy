// @vitest-environment node
// LATER 1148 (from the bugs seat's P10 read, evidence/weekend-mega-2026-11-14/bugs/P10-crossroads-wall-fresh-read.md): a player held on the top of Crossroads' low wall beside
// the bell tower (MP72 `worldmodel/b2_wc07`, top y 98.81, x 1526.77-1529.9) while pushing toward the square (match 4684-28,
// ticks 12640-12830: x held at 1527.0-1526.75 at 55-64 u/s for 3.2 s). Simulation track: reading, pending review.
//
// The cause, on the disc's own collision (no r0004 edit in the box): between the top's west edge (x 1526.77) and the road's
// east edge (`worldmodel/wc25/di_road25`, y 42.5) lies a WEDGE WITH NO FLOOR, 0.14 u wide at z 1200 widening to 2.0 u at z
// 1350 (1.0 u at z 1269). The port's ground walk takes a tick's move in sub-steps of at most `MAX_SUBSTEP` = 1 (mover.ts:177,
// the port's own) at 60 Hz -- 0.54 u each at 65 u/s -- and refuses each sub-step whose column has no floor (mover.ts:550-551,
// `move` :5156-5160), so every step lands in the wedge and is refused. The original probes once a frame at the frame's new
// position (`FUN_005b0840`, research 444 s2), so the hold depends on the frame's step.
//
// LATER 1148 phase B (research 444 s3, s9): the measured cases of the ORIGINAL, relay-1's memory trace on r0004 (MP72 live),
// as the bugs lane read it (agent-mail evidence/weekend-mega-2026-11-14/bugs/P10-crossroads-rows-read.md, its section
// "After the fresh review", which governs; the review bugs/P10-crossroads-rows-fresh-review.md). Positions are THE ROWS',
// not the port's own reading of the wedge (the review's note (i): the wedge widths are the port's reading of the disc's
// collision, the fit margins 0.002-0.08 u). The rows' brackets of the original's effective edges (the review's (c)):
//   the road edge at z 1269.2 between x 1525.485 and 1525.831; at z 1220 between 1526.299 and 1526.506;
//   the top's edge between 1526.706 and 1526.768.
// A body "leaves" when it is past the road edge's bracket (west of its east end) and has gone into the air.
// The rows' speeds: run 2.167-2.172 u an update, walk 0.866-0.870, crouched walk 0.466-0.470 (`GAME_FRAME_DT` an update).
//
// Folded here (the ruling of 06:49Z): the bugs lane's two uncommitted files. `zzP10CrossroadsWallTop.test.ts` was this
// file's first two tests word for word (the header aside); `zzP10Speeds.test.ts` measured the port's speeds and the
// four walks off the top with no assertion -- its terrace speeds are the speed test below, its walks the cases.
import { describe, expect, it } from 'vitest';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { GAME_FRAME_DT, type Grid } from '@s2u/scene';
import { simMapFromBytes } from '../src/simMap';
import { probeLiftOf, throttleFrameEnds, Walker, type Stance } from '../src/mover';

const MP72 = fixture('RUN/MP72.ZDB');
const TOWARD_MINUS_X = 90;   // the walker's yaw that walks toward -x (checked on the terrace: 20 ticks, dx -15.71, dz 0)
const TOP_Y = 98.88;         // the placement's height on the top (the rows' y 98.817; the port's floor 98.813)
/** The rows' brackets (the fresh review's (c)): the east end of the road edge's bracket at each z, and the top edge's west end. */
const ROAD_EDGE_EAST = { 1269.2: 1525.831, 1220: 1526.506 } as const;
const TOP_EDGE_WEST = 1526.706;
/** LATER 1194B: the run from (1550, 89.25, 1250) rests at x 1535.899 (r0004, jump-try-cross.csv); the rows' fit margin, the header's 0.08. */
const RUN_REST_ROWS = 1535.899, ROWS_FIT_MARGIN = 0.08;
/**
 * The walk's stick in the port: 0.4, the stick at which the port's standing walk reaches the original's 26.0 u/s (research 444
 * s6; the rig's 0.376 is the macro's value, not the port's stick -- the bugs read: "NOT compared"). Full stick is the run.
 */
const WALK_STICK = 0.4;
/** The rows' window for a walk off at z 1220: all three off within 0.82 s of the first step (the fresh review); 60 ticks = 1 s. */
const WALK_OFF_TICKS = 60;

/**
 * `minFrameX`: the least x at a game frame's end (`throttleFrameEnds` of the tick's number) -- the rows hold one position an
 * update. `seq0`: when set, the ticks are numbered from it (`commandSeq`, as the room and the page number them), else counted
 * from the placing; counted from the placing, the first frame spans THREE ticks (`throttleFrameEnds(2)` is false: a game frame
 * is 2.002 ticks and the placing starts its count half a tick in, `GROUND_FRAME_TICKS_READING`), numbered from 2 it spans two,
 * as every frame of the rows is one update.
 */
interface Walked { left: boolean; leftAt: number; minX: number; minFrameX: number; airborne: boolean; x: number; y: number }

function walk(grid: Grid, x: number, z: number, stick: number, ticks: number, stance: Stance = 'stand', edge: number = ROAD_EDGE_EAST[1269.2], seq0 = 0): Walked {
  const w = new Walker(grid);
  w.stance = stance;
  expect(w.place(x, TOP_Y + probeLiftOf(stance), z)).toBe(true);
  w.state.yaw = TOWARD_MINUS_X;
  let air = false, leftAt = -1, minX = w.state.x, minFrameX = w.state.x;
  for (let i = 0; i < ticks; i++) {
    if (seq0) w.commandSeq = seq0 + i;
    w.tick({ forward: stick, right: 0, boost: false });
    air ||= w.airborne;
    minX = Math.min(minX, w.state.x);
    if (throttleFrameEnds(seq0 ? seq0 + i : i + 1)) minFrameX = Math.min(minFrameX, w.state.x);
    if (leftAt < 0 && air && w.state.x < edge) leftAt = i;
  }
  return { left: leftAt >= 0, leftAt, minX, minFrameX, airborne: air, x: w.state.x, y: w.state.y };
}

describe.skipIf(!MP72)(`LATER 1148: MP72 b2_wc07's top beside the bell tower${MP72 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const grid = (): Grid => simMapFromBytes(MP72!, 'RUN/MP72.ZDB').grid;

  it('RED: the run at z 1269 from x 1528 leaves the top within a second (the original: 5 of 5, off on the 4th moving update)', () => {
    // top-run-1..3 and edge-run-2/3: 0.362 to 1527.64, 0.724 to 1526.914, one update refused (1.083 would end at 1525.831,
    // in the wedge), then 1.445-1.449 to 1525.465-1525.469, the fall the update after; landed y 42.504.
    const r = walk(grid(), 1528.0, 1269.2, 1, 60);
    expect(r.left, `held: min x ${r.minX.toFixed(3)}, airborne ${r.airborne}`).toBe(true);   // failed before phase B: held at 1527.097
  });

  it('the walk at z 1269 from x 1528 is HELD on the top (the original: 4 of 4 standing, held 5.2-5.7 s at 1526.93-1527.00)', () => {
    const r = walk(grid(), 1528.0, 1269.2, WALK_STICK, 312);   // 5.2 s, the shortest hold in the rows
    expect(r.airborne).toBe(false);
    expect(r.minFrameX).toBeGreaterThanOrEqual(TOP_EDGE_WEST);
    expect(r.y).toBeCloseTo(98.813, 2);
  });

  it('the crouched walk at z 1269 from x 1528 is HELD on the top (the original: top-walk-1/3, held 4.8-5.3 s)', () => {
    const r = walk(grid(), 1528.0, 1269.2, WALK_STICK, 288, 'crouch');   // 4.8 s
    expect(r.airborne).toBe(false);
    expect(r.minFrameX).toBeGreaterThanOrEqual(TOP_EDGE_WEST);
  });

  it('RED: the walk at z 1220 from x 1528 leaves the top (the original: narrow-walk-1..3, off 3 of 3 within 0.82 s)', () => {
    // narrow-walk-2/3: 0.358, 0.717 to 1526.925, then 0.866 / 0.869 to 1526.059 / 1526.057 (past the bracket's 1526.506),
    // the fall the next update, landed y 42.504. Research 444 finding 3: the start is stated, x 1528 from rest, the rows' own.
    // The review of 42550490c1, finding 8: counted from the placing, the port's first frame spans three ticks, its step
    // overshoots, and the body is held about 18 frames and leaves by the retry (tick 46) -- narrow-walk-1's path, not 2/3's.
    // Numbered from 2 the first frame is two ticks, as the rows' updates: the port's steps 0.268, 0.626, then 0.866 to
    // 1526.240, in the air at that frame's end (tick 5) -- off on the third moving frame, as narrow-walk-2/3, with no
    // retry. The first step's 0.268 against the rows' 0.358 is the port's ramp (research 444 s9, a named difference).
    const r = walk(grid(), 1528.0, 1220, WALK_STICK, WALK_OFF_TICKS, 'stand', ROAD_EDGE_EAST[1220], 2);
    expect(r.left, `held: min x ${r.minX.toFixed(3)}, airborne ${r.airborne}`).toBe(true);   // failed before phase B: held at 1527.110
    expect(r.leftAt, 'off by the third moving frame, no retry (narrow-walk-2/3)').toBeLessThanOrEqual(6);
  });

  it('RED: the walk at z 1220 held 0.6 u short of the edge at x 1527.373 moves on by the retry (the original: narrow-walk-1)', () => {
    // narrow-walk-1 (the fresh review's must-fix 1): at 1527.373 with the walk's speed, the next step (0.717 / 0.867) would end
    // at 1526.656 / 1526.506, in the wedge: held 18 updates (action 2, dx 0), one idle row (action 1), the ramp restarts from
    // 0.359 to 1527.014, then 0.715 to 1526.299 and the fall -- 0.82 s from the first step. Without the retry's restart the
    // body would hold here for good (the brief's (ii)). The start: 1527.373 plus the port's own ramp up to the end of its
    // second game frame (`throttleFrameEnds` of the ticks counted from the placing), measured on the terrace, so the body
    // stands at the rows' x at a frame's end with the walk's whole speed, and the next frame's step (0.866) ends at 1526.507,
    // the rows' refused 1526.506.
    const g = grid();
    const t = new Walker(g);
    expect(t.place(1550, 89.25 + probeLiftOf('stand'), 1250)).toBe(true);
    t.state.yaw = TOWARD_MINUS_X;
    for (let i = 1, ends = 0; ends < 2; i++) { t.tick({ forward: WALK_STICK, right: 0, boost: false }); if (throttleFrameEnds(i)) ends++; }
    const ramp = 1550 - t.state.x;
    const r = walk(g, 1527.373 + ramp, 1220, WALK_STICK, WALK_OFF_TICKS, 'stand', ROAD_EDGE_EAST[1220]);
    expect(r.left, `held: min x ${r.minX.toFixed(3)}, airborne ${r.airborne} (start ${(1527.373 + ramp).toFixed(3)})`).toBe(true);
  });

  it('RED: the held walk at z 1269 stands still at the edge: no tick steps out to a position the next frame end puts back (no held-edge jitter)', () => {
    // The main controller's ruling (09:3xZ): no tick shows a position the frame end will not keep (the original makes one
    // move a frame, `FUN_005483d0` D:L413918; the rows hold one x an update while held, 1526.93-1527.00). Before: standing,
    // ticks 4-39 alternated 1527.031 (the in-between tick, over the top) and 1527.464 (the frame end's put-back), then
    // 1526.762 / 1527.196, then a one-tick 1526.838 every 38 ticks off the held 1526.928; crouched 1526.842 / 1527.075.
    // Walking -x, x never increases.
    for (const stance of ['stand', 'crouch'] as const) {
      const w = new Walker(grid());
      w.stance = stance;
      expect(w.place(1528.0, TOP_Y + probeLiftOf(stance), 1269.2)).toBe(true);
      w.state.yaw = TOWARD_MINUS_X;
      const xs: number[] = [w.state.x];
      for (let i = 0; i < 312; i++) {
        const xa = w.state.x;
        w.tick({ forward: WALK_STICK, right: 0, boost: false });
        xs.push(w.state.x);
        expect(w.state.x, `${stance}, tick ${i + 1}: ${xs.slice(-6).map((x) => x.toFixed(4)).join(' ')}`).toBeLessThanOrEqual(xa + 1e-9);
      }
      expect(w.airborne).toBe(false);
    }
  });

  it('the speeds on the terrace are the rows\': run 65.0, walk 26.0, crouched walk 14.0 u/s', () => {
    // The rows: run 2.167-2.172, walk 0.866-0.870, crouched 0.466-0.470 u an update of `GAME_FRAME_DT`; the port's steady
    // tick step x 60, over the ticks after its ramp (run 13-18 before the face at x 1535.6; walk and crouch 10-30).
    // LATER 1194B (research 444 s10; the fresh review's finding 1): numbered as the rows (the port's frames numbered from 2 (`commandSeq`): counted from the placing the Walker's first frame spans THREE ticks
    // (`throttleFrameEnds(2)` is false; `GROUND_FRAME_TICKS_READING`, mover.ts, the review of 42550490c1 finding 8), which
    // puts every later frame end one tick off the capture's, where each of the original's frames is one update),
    // as this file's z 1220 walk is (seq0 2). The rows run the same start into the same face: jump-try-cross.csv
    // (bugs/captures/p10-crossroads/cases, r0004) steps 2.167 an update to 1540.238, 1538.066, 1535.899 and holds there.
    // So the run's rest is pinned too, within the rows' fit margin (the header: 0.002-0.08 u).
    const g = grid();
    const rows = { run: [2.167, 2.172], walk: [0.866, 0.870], crouch: [0.466, 0.470] } as const;
    for (const [gait, stick, stance, from, to] of [['run', 1, 'stand', 13, 18], ['walk', WALK_STICK, 'stand', 10, 30], ['crouch', WALK_STICK, 'crouch', 10, 30]] as const) {
      const w = new Walker(g);
      w.stance = stance;
      expect(w.place(1550, 89.25 + probeLiftOf(stance), 1250)).toBe(true);
      w.state.yaw = TOWARD_MINUS_X;
      const xs: number[] = [w.state.x];
      const run = (i: number): void => { w.commandSeq = 2 + i; w.tick({ forward: stick, right: 0, boost: false }); };
      for (let i = 0; i < to; i++) { run(i); xs.push(w.state.x); }
      if (gait === 'run') {                                      // the rows' rest at the face (jump-try-cross.csv)
        for (let i = to; i < 60; i++) run(i);
        expect(Math.abs(w.state.x - RUN_REST_ROWS), `run rest ${w.state.x.toFixed(3)}`).toBeLessThanOrEqual(ROWS_FIT_MARGIN);
      }
      const speed = (xs[from]! - xs[to]!) / ((to - from) / 60);
      const [lo, hi] = rows[gait];
      expect(speed, gait).toBeGreaterThanOrEqual(lo / GAME_FRAME_DT - 0.05);
      expect(speed, gait).toBeLessThanOrEqual(hi / GAME_FRAME_DT + 0.05);
    }
  });

  it('one frame-sized ground step (2.17 u, the original\'s step at 65 u/s and 30 Hz) from the edge crosses the wedge; 0.54 u is refused', () => {
    const map = simMapFromBytes(MP72!, 'RUN/MP72.ZDB');
    for (const [dx, crosses] of [[-0.54, false], [-2.17, true]] as const) {
      const w = new Walker(map.grid);
      expect(w.place(1527.1, 98.88 + probeLiftOf('stand'), 1269.25)).toBe(true);
      (w as unknown as { step(dx: number, dz: number): void }).step(dx, 0);   // the walk's own ground step and its floor rules
      expect(w.state.x < 1527.0).toBe(crosses);
    }
  });
});
