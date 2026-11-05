import { beforeAll, describe, expect, it } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FsAssetSource } from '@s2u/archive/node';
import { polygonNormal, probeGround, surfaceMaterial, type Grid, type WorldPoly } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../../archive/test/fixtures';
import { climbClass, footStepOffset } from '../../src/climb';
import { loadMap } from '../../src/loadMap';
import { simClipsFromBytes } from '../../src/simMap';
import { Traversal, type TraversalEvent } from '../../src/traversal';
import { groundGrid, groundPolygons, Walker, type WalkInput } from '../../src/walk';

/**
 * MP6-DECK-CLIMB (issue #292, owner row H240): Desert Glory's deck into the hostage room and the one climb face a SEAL can
 * reach from it -- the sandbags, `worldmodel/sausage_climber_dis`, at the deck's north-east end. **This file pins the
 * PORT's behaviour as built (reading, pending review and pending the owner's check of the original, H240).** It is a pin,
 * not a parity proof: nothing here was measured on the original.
 *
 * The read behind it (step 1 of #292, source inspection of the decompilation and the fixture's hull through the
 * repository's readers): of every wall a SEAL standing on the deck, the ramp, the landing or the corridor (floors 29 to 52)
 * can face, only the sandbags carry a climb class; the rest are appflags 0, which the original never offers
 * (`FUN_0059d980` D:L457387-457405 asks classes 3, 4, 1 and 5; `FUN_005b3ce0` D:L469131-469132 refuses another class).
 * The sandbags stand on `g452`, a stone platform at 30 that a gap about 10 wide (no floor polygon: the pit and the berm
 * `g373`) parts from the deck's diagonal strip, so the way onto them is a jump across or a grab in the air.
 *
 * - (1) The face, off the disc: one quad, ditype 2, appflags 4, material 5 SAND (`FOOT_STEP_OFFSET` 0), 1789.00..1818.37
 *   across x at z 1380, 30 to 60, facing +z; the floor in front at 30. The original's height: class 4 (D:L469251), the top
 *   `FUN_002dbfb0` (D:L180183-180212, through `FUN_002dd4d0` D:L180890-180956 and `FUN_002dd690` D:L180962-181050: the top
 *   at the hit's column, 60 everywhere on this level-topped quad) + the offset - the feet = 30 (D:L469252-469261), at or
 *   under 32 so offered (D:L469278-469281), the facing 0.3 or more (D:L469243), no obstacle ray (60.5 is not under the feet
 *   + 21.1, `FUN_0054e430` D:L416744-416748); the press takes `FUN_00580b70`'s 28..32 band (its bounds D:L442267 and
 *   D:L442283, its two motion requests D:L442288-442293), the clips "Stand -> Hang" then "Hang" by the motion table's names
 *   (`seal_stand2hang`, read through the repository's readers), not named in the code.
 * - (2) Walked in mid-face the port offers the hang and the press and the stick ahead end on the ledge at 60.
 * - (3) At the east corner, wedged against the invisible diagonal stopper `stop1_2` (INVISIBLE_DI, appflags 0, normal
 *   (-0.762, 0, 0.648)), the port offers nothing: PAR-21a C2's corner drop (`climb.ts` `cornerDrop`). By the read the
 *   original refuses there too -- another hit of the move whose horizontal normal is under 0.9 of the stored one's clears
 *   the contact (`FUN_005483d0` D:L413867-413901), and the right side segment (`FUN_0054aa30` D:L415549-415577) crosses
 *   `stop1_2` inside its extent at the port's wedge point and at the original's likely rest about 4.4 off the face. Where
 *   the original's body comes to rest is its reach (research 281 s4.1 C3, `WALL_PROBE_READING`), unread. **If the owner
 *   sees CLIMB at the corner in the original, (3) becomes the corner jump's RED (C3, PAR-21)**, a whole-mover change, not a
 *   per-map one.
 * - (4) The control: `deck_climbers` (the brace, research 281) offered and climbed from the ground onto the deck at 30.
 *
 * Fixed starts and yaws only; setup and observations run in `beforeAll`, so a fixture or load error fails the suite.
 */

const FIXTURES = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../../test-fixtures'));
const MP6 = fixture('RUN/MP6.ZDB');
const PACK = fixture('RUN/MOTION_P.ZAR');
const READERC = fixture('RUN/READERC.ZAR');
const HAVE = !!MP6 && !!PACK && !!READERC;

const STILL: WalkInput = { forward: 0, right: 0, boost: false };
const FORWARD: WalkInput = { forward: 1, right: 0, boost: false };

/** The sandbags' quad, off the fixture (s1 of the read). */
const SANDBAGS = { x0: 1789.0, x1: 1818.37, z: 1380, bottom: 30, top: 60 } as const;
/** The floor in front (`g452`) and the ledge on top (`jwall03`). */
const PLATFORM = 30, LEDGE = 60;
/** The brace's deck (`di_top1`) and its face's outer z (research 281 s1). */
const DECK_TOP = 30, BRACE_MIN_Z = 1439.8;

interface Approach {
  /** The climb prompt shown as the walk ended, where the press is made; null when none showed. */
  prompt: string | null;
  automatic: boolean | null;
  /** SEGMENT-BODY part 2: how far off the face's plane the feet stood when a prompt first showed on the walk; null when none did. */
  firstOff: number | null;
  /** The walls the walk met on its last moving tick. */
  met: Set<string>;
  /** Where the feet stood when the walk stopped (its last tick). */
  at: [number, number, number];
  hung: boolean;
  events: string[];
  end: [number, number, number];
}

describe.skipIf(!HAVE)(`MP6's deck into the hostage room: the sandbags' climb, the PORT's behaviour pinned (#292, H240; reading, pending the owner's check)${HAVE ? '' : ` (${FIXTURES_ABSENT}: RUN/MP6.ZDB, MOTION_P.ZAR or READERC.ZAR)`}`, () => {
  let grid: Grid, polys: WorldPoly[];
  let sandbags: WorldPoly[], stopper: WorldPoly[];
  const runs = new Map<string, Approach>();

  /**
   * From (x, fromY, z) at `yaw`: the stick ahead for `ticks`, then the press, the climb if one starts. SEGMENT-BODY part 2
   * (the weapon line, research 86 s3.8): the walk is no longer stopped at the first prompt -- the weapon line offers the
   * sandbags from the start, 8 out (`firstOff`), before any segment record meets them -- so the press is made where the
   * walk ends, as ac's capture of the original stages its presses (walk, stop, press). *Was:* the stick ahead until a
   * prompt showed.
   */
  function approach(x: number, fromY: number, z: number, yaw: number, ticks = 120): Approach {
    const w = new Walker(grid), t = new Traversal(grid, polys);
    w.driver = t;
    const sim = simClipsFromBytes(PACK!, READERC!);
    t.setClips(sim.clips, sim.table);
    w.actionRoots = sim.roots;
    const events: TraversalEvent[] = [];
    t.on((e) => events.push(e));
    expect(w.place(x, fromY, z)).toBe(true);
    w.state.yaw = yaw;
    let met = new Set<string>(), firstOff: number | null = null;
    for (let i = 0; i < ticks; i++) {
      w.tick(FORWARD);
      const hits = w.wallHits();
      if (hits.length) met = new Set(hits.map((h) => h.poly.path));
      if (firstOff === null && t.climbPrompt() !== null) firstOff = w.state.z - SANDBAGS.z;
    }
    const p = t.climbPrompt();
    const out: Approach = {
      prompt: p?.kind ?? null, automatic: p?.automatic ?? null, firstOff, met, at: [w.state.x, w.state.y, w.state.z], hung: false, events: [], end: [0, 0, 0],
    };
    t.action();                                                         // pressed whether or not a prompt showed
    for (let i = 0; i < 400 && t.state().kind !== 'hang' && (i < 2 || t.state().kind !== 'none'); i++) w.tick(STILL);
    out.hung = t.state().kind === 'hang';
    for (let i = 0; i < 800 && t.state().kind !== 'none'; i++) w.tick(FORWARD);
    out.events = events.map((e) => e.type);
    out.end = [w.state.x, w.state.y, w.state.z];
    return out;
  }

  beforeAll(async () => {
    const map = await loadMap(new FsAssetSource(FIXTURES), 'RUN/MP6.ZDB');
    grid = groundGrid(map.ground!);
    polys = groundPolygons(map.ground!);
    sandbags = polys.filter((p) => p.path === 'worldmodel/sausage_climber_dis');
    stopper = polys.filter((p) => p.path === 'worldmodel/stop1_2');
    // (2) straight in (yaw 0 faces -z), mid-face and toward the west end
    runs.set('mid 1803', approach(1803, 35, 1388, 0));
    runs.set('mid 1795', approach(1795, 35, 1388, 0));
    // (3) the east corner: straight in at x 1814, and walked in north-east from x 1808 -- both slide into the wedge
    runs.set('corner 1814', approach(1814, 35, 1389, 0));
    runs.set('corner 1808 ne', approach(1808, 35, 1389, -45));
    // (4) the brace from the ground, mid-face (research 281's case (a))
    runs.set('brace 1690', approach(1690, 5, 1452, 0));
  });

  it('(1) the face: one sausage_climber_dis quad -- ditype 2, appflags 4, SAND, 1789..1818.37 at z 1380, 30 to 60, facing +z -- h 30 over the platform, the hang band', () => {
    expect(sandbags).toHaveLength(1);
    const s = sandbags[0]!;
    expect([s.ditype, s.appflags, s.material]).toEqual([2, 4, 5]);
    expect(surfaceMaterial(s.material).name).toBe('SAND');
    expect(footStepOffset(s.material)).toBe(0);
    const pts = Array.from({ length: s.points.length / 3 }, (_, i) => [s.points[i * 3]!, s.points[i * 3 + 1]!, s.points[i * 3 + 2]!]);
    const corners = [[SANDBAGS.x0, SANDBAGS.bottom], [SANDBAGS.x1, SANDBAGS.bottom], [SANDBAGS.x1, SANDBAGS.top], [SANDBAGS.x0, SANDBAGS.top]];
    expect(pts).toHaveLength(4);
    for (const [cx, cy] of corners) {
      expect(pts.some(([x, y, z]) => Math.abs(x! - cx!) < 0.01 && Math.abs(y! - cy!) < 0.01 && Math.abs(z! - SANDBAGS.z) < 0.01), `corner (${cx}, ${cy})`).toBe(true);
    }
    const n = polygonNormal(s.points)!;
    expect(n[2]).toBeGreaterThan(0.999);                                // facing +z, toward the platform
    // the floor in front (g452) and the ledge on top (jwall03)
    const floorAt = (x: number, z: number, under: number): number => Math.max(...probeGround(grid, x, z).map((h) => h.y).filter((y) => y <= under));
    expect(floorAt(1803, 1386, 36)).toBeCloseTo(PLATFORM, 2);
    expect(floorAt(1803, 1376, 61)).toBeCloseTo(LEDGE, 2);
    const h = SANDBAGS.top + footStepOffset(s.material) - PLATFORM;
    expect(h).toBeCloseTo(30, 6);
    expect(climbClass(h, 4)).toEqual({ kind: 'high', clip: 'seal_stand2hang', blend: null });
    // the stopper in the east corner: invisible, no climb, turned 49.6 degrees from the face (a dot under 0.9)
    expect(stopper).toHaveLength(1);
    expect([stopper[0]!.appflags, surfaceMaterial(stopper[0]!.material).name]).toEqual([0, 'INVISIBLE_DI']);
    const sn = polygonNormal(stopper[0]!.points)!;
    expect(sn[2] / Math.hypot(sn[0], sn[2])).toBeCloseTo(0.648, 2);
  });

  it('(2) the port as built: walked straight in mid-face the hang is offered (on the press, not the walk) and the climb ends on the ledge at 60', () => {
    for (const label of ['mid 1803', 'mid 1795']) {
      const r = runs.get(label)!;
      // SEGMENT-BODY part 2: offered from the start, 7.7 out, by the weapon line (its 22.93 reaches the face from there).
      expect(r.firstOff, label).toBeGreaterThan(7.5);
      expect(r.prompt, label).toBe('high');
      expect(r.automatic, label).toBe(false);
      expect(r.met.has('worldmodel/sausage_climber_dis'), label).toBe(true);
      expect(r.hung, label).toBe(true);
      expect(r.events[0], label).toBe('climbStart');
      expect(r.events.at(-1), label).toBe('climbEnd');
      expect(r.end[1], label).toBeCloseTo(LEDGE, 1);
      expect(r.end[2], label).toBeLessThan(SANDBAGS.z);                // past the edge, on the ledge
    }
  });

  it('(3) the port as built, the original as read (FUN_005483d0 D:L413867-413901): wedged in the east corner against stop1_2, nothing is offered and the press climbs nothing', () => {
    // SEGMENT-BODY (re-measured 2026-11-04): walked in north-east, the side lines (1.2 r across) also meet g451 beside the
    // wedge, and the diagonal walk-in stands 6.7 off the face (1814's square one 6.1).
    // SEGMENT-BODY part 2 (the weapon line): walked in square at 1814 the sandbags are offered on the way (the weapon
    // line, from 7.7 out) until the wedge, where the centre's hit is stored and the side line's hit on stop1_2 (a normal
    // 49.6 degrees off) drops it (the corner drop, now in `Walker.storeContact`); the still body's side line keeps
    // meeting stop1_2, so the weapon line's slot is never consulted (D:L413618) and nothing re-forms. North-east from
    // 1808 the weapon line meets stop1_2 first (appflags 0): stored, nothing offered.
    const corners = { 'corner 1814': { also: [] as string[], off: 6.1 }, 'corner 1808 ne': { also: ['worldmodel/g451'], off: 6.7 } };
    for (const [label, c] of Object.entries(corners)) {
      const r = runs.get(label)!;
      expect(r.prompt, label).toBeNull();
      expect(r.met, label).toEqual(new Set(['worldmodel/stop1_2', 'worldmodel/sausage_climber_dis', ...c.also]));
      expect(r.at[0], label).toBeGreaterThan(1811.5);                  // in the wedge, x about 1812.3-1812.7
      expect(r.at[0], label).toBeLessThan(1813.5);
      expect(r.at[1], label).toBeCloseTo(PLATFORM, 2);
      // SEGMENT-BODY: the centre line's reach, 1.1 x 1.4 r = 5.39, plus a tick, less the 1 of the deep-hit rule (D:L415166,
      // D:L415235, D:L413602-413614): 6.1 off the face [reading, pending a capture; r0004's head-on stand-off 6.78]. Was the
      // disc's slide stand-off, 3.5.
      expect(r.at[2], label).toBeCloseTo(SANDBAGS.z + c.off, 1);
      expect(r.events, label).toEqual([]);
      expect(r.end[1], label).toBeCloseTo(PLATFORM, 2);
    }
  });

  it('(4) the control: deck_climbers (the brace) walked into mid-face from the ground, the hang offered and climbed onto the deck at 30', () => {
    const r = runs.get('brace 1690')!;
    expect(r.prompt).toBe('high');
    expect(r.hung).toBe(true);
    expect(r.events[0]).toBe('climbStart');
    expect(r.events.at(-1)).toBe('climbEnd');
    expect(r.end[1]).toBeCloseTo(DECK_TOP, 1);
    expect(r.end[2]).toBeLessThan(BRACE_MIN_Z);
  });
});
