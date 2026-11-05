import { beforeAll, describe, expect, it } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FsAssetSource } from '@s2u/archive/node';
import { polygonNormal, type Grid, type WorldPoly } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../../archive/test/fixtures';
import { climbClass, contactFromHits } from '../../src/climb';
import { loadMap } from '../../src/loadMap';
import { simClipsFromBytes } from '../../src/simMap';
import { Traversal, type TraversalEvent } from '../../src/traversal';
import { groundGrid, groundPolygons, Walker, type WalkInput } from '../../src/walk';

/**
 * PB-3 (issue #80, owner row H160; research 281): MP6's X-braced scaffold under the deck.
 *
 * The brace is render geometry only (`world#28`, `mp6_woodstairs.tif`); its collision is two flat invisible quads in
 * the fixture's `RUN/MP6.ZDB` through `loadMap` / `groundPolygons`: `worldmodel/deck_climbers` (ditype 2, appflags 4,
 * material 3 `INVISIBLE_DI`, facing +z, 0 to 29.99) and `worldmodel/noclimb_invis` (ditype 3, appflags 0, facing -z),
 * under the deck's top `di_top1` at 30. Research 281 holds the values and their sources.
 *
 * What is pinned here, each case labelled with its level:
 * - (a) the original's rule as read (`FUN_005b3ce0` D:L469251-469280; reading, pending review): appflags 4 at a height
 *   over 10 and up to 32 offers the climb, so the face offers the hang from its +z side and the press ends on the deck
 *   -- near the face's ends and mid-face, standing and crouch-walking. PB-3b (research 281 s4.1): the port takes the
 *   contact from the walk's own hit (`Walker.wallHits`, `climb.ts` `contactFromHits`), as the original takes it from the
 *   move solver's (`FUN_005483d0`, research 86 s3.1), with no reach of its own. Was: the port offered it only near the
 *   ends -- mid-face the head line held the body 3.82 off the plane `contactOf` measured at y 0, past `traversal.ts`'s
 *   `TOUCH` reach 3.75 (the mid-face case was an `it.fails`); crouch-walking (the head line at 12.138) 3.70 off, inside;
 * - (b) the walk without a press: no rise at the brace from either side -- the port's as built; the original's by the
 *   walk's probes as read (research 217 section 2: the low line at the feet + 6.5 and the head line meet the face);
 * - (c) from under the deck nothing is offered: the body stops 3.5 off `noclimb_invis` (appflags 0), about 4.3 short of
 *   `deck_climbers`' footprint box; the walk meets only `noclimb_invis`, which is the contact (PAR-21a C1, the move's best
 *   hit climbable or not; was: no contact kept) and offers nothing by its appflags 0, so `planClimb` never runs (was,
 *   before PB-3b: `touchClimbable`'s box reject at `TOUCH`);
 * - (d) the wall beside the brace (research 281 s7): the rail `deck_dis_inside` and the berm `g373` are appflags 0, so
 *   the walk stops and nothing is offered (`FUN_005b3ce0` asks the contact's own appflags, D:L469131-469132);
 * - (e) the deck's own stair (`di_top1`'s ramp, research 281 s1) is still walked up, feet ending on the deck.
 *
 * Setup and observations run in `beforeAll`, outside every case, so a fixture or load error fails the suite.
 */

const FIXTURES = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../../test-fixtures'));
const MP6 = fixture('RUN/MP6.ZDB');
const PACK = fixture('RUN/MOTION_P.ZAR');
const READERC = fixture('RUN/READERC.ZAR');
const HAVE = !!MP6 && !!PACK && !!READERC;

const STILL: WalkInput = { forward: 0, right: 0, boost: false };
const FORWARD: WalkInput = { forward: 1, right: 0, boost: false };

/** The brace's collision: `deck_climbers`' footprint (research 281 s1) and the deck's top. */
const BRACE = { minX: 1673.3, maxX: 1709.3, minZ: 1438.3, maxZ: 1441.3 } as const;
const DECK_TOP = 30;
/** The walk's start, 10 off the face on either side, and the headings: yaw 0 faces -z, yaw 180 faces +z. */
const MID_X = 1690, OUTSIDE_Z = 1452, UNDER_Z = 1428;
/** Near the face's west end (research 281 s4). */
const END_X = 1671;
/** A crouch-walk's stick: under `FUN_00584c60`'s crouch-run threshold 12.4 / 14.8 (`mover.ts` `CROUCH_RUN`). */
const CROUCH_STICK = 0.6;

interface Walk {
  /** The highest the feet stood while within 8 of the brace's footprint. */
  riseAtBrace: number;
  /** Whether the climb was ever offered (the icon) or a climb ever started. */
  offered: boolean;
  climbed: boolean;
  end: [number, number, number];
  /**
   * The owners of every wall the walk's slide met (`Walker.wallHits`), and of every contact its hits made (PAR-21a C1: the
   * move's best hit, climbable or not; was `touched`, whether a climbable hit made one).
   */
  hit: Set<string>;
  contacts: Set<string>;
  /** At the end, the ground distance to deck_climbers' box. */
  toBox: number;
}

describe.skipIf(!HAVE)(`MP6's X-braced scaffold: deck_climbers' hang (PB-3, research 281)${HAVE ? '' : ` (${FIXTURES_ABSENT}: RUN/MP6.ZDB, MOTION_P.ZAR or READERC.ZAR)`}`, () => {
  let grid: Grid, polys: WorldPoly[];
  let climbers: WorldPoly[], noclimb: WorldPoly[], app4 = 0, app5 = 0;
  interface Offer { prompt: string | null; automatic: boolean | null; at: [number, number, number] | null; hung: boolean; events: string[]; end: [number, number, number] }
  let atEnd: Offer, midFace: Offer, midFaceCrouched: Offer;
  const walks = new Map<string, Walk>();

  function mover(): { w: Walker; t: Traversal; events: TraversalEvent[] } {
    const w = new Walker(grid), t = new Traversal(grid, polys);
    w.driver = t;
    const sim = simClipsFromBytes(PACK!, READERC!);
    t.setClips(sim.clips, sim.table);
    w.actionRoots = sim.roots;
    const events: TraversalEvent[] = [];
    t.on((e) => events.push(e));
    return { w, t, events };
  }
  const near = (x: number, z: number): boolean => x > BRACE.minX - 8 && x < BRACE.maxX + 8 && z > BRACE.minZ - 8 && z < BRACE.maxZ + 8;

  /** `ticks` ticks of the stick ahead from (x, z) at `yaw`, no press. */
  function walkIn(x: number, z: number, yaw: number, ticks = 120): Walk {
    const { w, t } = mover();
    expect(w.place(x, 5, z)).toBe(true);
    w.state.yaw = yaw;
    const out: Walk = { riseAtBrace: w.state.y, offered: false, climbed: false, end: [0, 0, 0], hit: new Set(), contacts: new Set(), toBox: NaN };
    for (let i = 0; i < ticks; i++) {
      w.tick(FORWARD);
      for (const h of w.wallHits()) out.hit.add(h.poly.path);
      const c = contactFromHits(w.wallHits(), w.state.x, w.state.z);
      if (c) out.contacts.add(c.poly.path);
      if (near(w.state.x, w.state.z)) out.riseAtBrace = Math.max(out.riseAtBrace, w.state.y);
      if (t.climbPrompt() !== null) out.offered = true;
      if (t.state().kind !== 'none') out.climbed = true;
    }
    out.end = [w.state.x, w.state.y, w.state.z];
    const p = climbers[0]!.points, xs = [0, 3, 6, 9].map((k) => p[k]!), zs = [2, 5, 8, 11].map((k) => p[k]!);
    const bx = Math.max(Math.min(...xs) - w.state.x, 0, w.state.x - Math.max(...xs));
    const bz = Math.max(Math.min(...zs) - w.state.z, 0, w.state.z - Math.max(...zs));
    out.toBox = Math.hypot(bx, bz);
    return out;
  }

  /** From (x, `OUTSIDE_Z`) at `yaw`: the stick ahead until the icon shows (120 ticks), then the press and the climb. */
  function climbFrom(x: number, yaw: number, crouched = false): Offer {
    const { w, t, events } = mover();
    expect(w.place(x, 5, OUTSIDE_Z)).toBe(true);
    w.state.yaw = yaw;
    if (crouched) w.stance = 'crouch';
    const ahead: WalkInput = crouched ? { forward: CROUCH_STICK, right: 0, boost: false } : FORWARD;
    for (let i = 0; i < 120 && t.climbPrompt() === null; i++) w.tick(ahead);
    if (crouched) expect(w.posture).toBe('crouch');                  // a crouch-walk, not the crouch-run's standing posture
    const p = t.climbPrompt();
    const out: Offer = { prompt: p?.kind ?? null, automatic: p?.automatic ?? null, at: p ? [w.state.x, w.state.y, w.state.z] : null, hung: false, events: [], end: [0, 0, 0] };
    if (p) {
      t.action();
      for (let i = 0; i < 400 && t.state().kind !== 'hang'; i++) w.tick(STILL);
      out.hung = t.state().kind === 'hang';
      for (let i = 0; i < 800 && t.state().kind !== 'none'; i++) w.tick(FORWARD);
    }
    out.events = events.map((e) => e.type);
    out.end = [w.state.x, w.state.y, w.state.z];
    return out;
  }

  beforeAll(async () => {
    const map = await loadMap(new FsAssetSource(FIXTURES), 'RUN/MP6.ZDB');
    grid = groundGrid(map.ground!);
    polys = groundPolygons(map.ground!);
    climbers = polys.filter((p) => p.path === 'worldmodel/deck_climbers');
    noclimb = polys.filter((p) => p.path === 'worldmodel/noclimb_invis');
    app4 = polys.filter((p) => p.appflags === 4).length;
    app5 = polys.filter((p) => p.appflags === 5).length;

    // (a) From the +z side facing the face (yaw 0): the stick ahead until the icon shows, the press, the hang, the
    // stick ahead -- near the face's west end, and mid-face.
    atEnd = climbFrom(END_X, 0);
    midFace = climbFrom(MID_X, 0);
    midFaceCrouched = climbFrom(MID_X, 0, true);

    // (b), (c) The walk in without a press: straight on and 30 degrees either way, from either side.
    for (const a of [0, 30, -30]) {
      walks.set(`outside ${a}`, walkIn(MID_X, OUTSIDE_Z, a));
      walks.set(`under ${a}`, walkIn(MID_X, UNDER_Z, 180 + a));
    }
  });

  it('the hull: one deck_climbers quad (ditype 2, appflags 4, INVISIBLE_DI, facing +z, 0..29.99) and one noclimb_invis behind it (ditype 3, appflags 0)', () => {
    expect(climbers).toHaveLength(1);
    expect(noclimb).toHaveLength(1);
    const c = climbers[0]!, n = noclimb[0]!;
    expect([c.ditype, c.appflags, c.material, c.cameratype]).toEqual([2, 4, 3, 0]);
    expect([n.ditype, n.appflags, n.material, n.cameratype]).toEqual([3, 0, 3, 0]);
    const ys = (p: WorldPoly) => [0, 1, 2, 3].map((k) => p.points[k * 3 + 1]!);
    expect(Math.min(...ys(c))).toBeCloseTo(0, 1);
    expect(Math.max(...ys(c))).toBeCloseTo(29.99, 2);
    const cn = polygonNormal(c.points)!, nn = polygonNormal(n.points)!;
    expect(cn[2]).toBeGreaterThan(0.99);                              // facing +z, away from the deck
    expect(nn[2]).toBeLessThan(-0.99);                                // facing -z, under the deck
    // research 86 s3.6's counts of MP6's climb faces, the brace's among them
    expect(app4).toBe(89);
    expect(app5).toBe(8);
    // FUN_00580b70's table at the brace's height from the ground (h = 29.99 + 0 - 0): the hang
    expect(climbClass(29.99, 4)?.kind).toBe('high');
    expect(climbClass(29.99, 4)?.clip).toBe('seal_stand2hang');
  });

  function climbsToDeck(o: Offer, label: string): void {
    expect(o.prompt, label).toBe('high');
    expect(o.automatic, label).toBe(false);                           // h 29.99 is over 10: the press, not the walk
    expect(o.hung, label).toBe(true);
    expect(o.events[0], label).toBe('climbStart');
    expect(o.events.at(-1), label).toBe('climbEnd');
    expect(o.end[1], label).toBeCloseTo(DECK_TOP, 1);
    expect(o.end[2], label).toBeLessThan(BRACE.minZ);                 // past the edge, over the deck
  }

  it("(a) FUN_005b3ce0 D:L469251-469280, reading, pending review: near the face's west end the port offers the hang, and the press ends on the deck at 30", () => {
    climbsToDeck(atEnd, 'west end');
    expect(atEnd.at![2]).toBeGreaterThan(BRACE.maxZ);                 // offered from the +z side
  });

  // PB-3b (research 281 s4.1): the contact from the walk's own hit, as `FUN_005483d0` takes it (research 86 s3.1). Was
  // an `it.fails`: mid-face the body was held 3.82 off the contact the port measured, past `TOUCH` (3.75).
  it('(a) FUN_005b3ce0 D:L469251-469280, reading, pending review: walked straight in mid-face, the original offers the hang and the press ends on the deck', () => {
    climbsToDeck(midFace, 'mid-face');
    expect(midFace.at![0]).toBeCloseTo(MID_X, 0);                    // offered where it was walked in, not at an end
  });

  it('(b) the port as built, the original as read (research 217 s2): walked in without a press, nothing rises at the brace', () => {
    for (const [label, w] of walks) {
      expect(w.riseAtBrace, label).toBeCloseTo(0, 6);
      expect(w.climbed, label).toBe(false);
    }
    // straight on, the face stops the body 3.5 off on either side (`WALL_PROBE_READING`, research 217 s2.3)
    expect(walks.get('outside 0')!.end[2]).toBeGreaterThan(BRACE.maxZ + 2);
    expect(walks.get('under 0')!.end[2]).toBeLessThan(BRACE.minZ - 2);
  });

  it('(a) the port as built: crouch-walking straight in mid-face (head line 12.138, 3.70 off) the icon shows, and the press ends on the deck', () => {
    climbsToDeck(midFaceCrouched, 'mid-face crouched');
    expect(midFaceCrouched.at![0]).toBeCloseTo(MID_X, 0);
  });

  it("(c) from under the deck, facing +z, nothing is offered: held 3.5 off noclimb_invis, the walk meets only noclimb_invis (appflags 0), its contact, which offers nothing", () => {
    for (const a of [0, 30, -30]) {
      const w = walks.get(`under ${a}`)!;
      expect(w.offered, `under ${a}`).toBe(false);
      expect(w.climbed, `under ${a}`).toBe(false);
    }
    const straight = walks.get('under 0')!;
    expect(straight.hit.has('worldmodel/noclimb_invis')).toBe(true);  // the walk's hit: the face behind the brace
    expect(straight.hit.has('worldmodel/deck_climbers')).toBe(false);
    // PAR-21a C1 (research 281 s4.1): the move's best hit is the contact, climbable or not (D:L413866) -- noclimb_invis,
    // appflags 0, which the offer refuses by its own appflags (D:L469131-469132). Was: `touched` false (no climbable hit).
    expect(straight.contacts).toEqual(new Set(['worldmodel/noclimb_invis']));
    expect(straight.toBox).toBeGreaterThan(4);                        // about 4.3 short of deck_climbers' box
  });

  /**
   * A walk of `ticks` from a placed (x, y, z), recording every wall the slide met and whether a climb was offered.
   * `y` is the place height: the rail is met from the deck at 30, the berm from the ground.
   */
  function approach(x: number, y: number, z: number, yaw: number, ticks = 180): {
    startY: number; maxY: number; end: [number, number, number]; offered: boolean; hit: Set<string>;
  } {
    const { w, t } = mover();
    expect(w.place(x, y, z), `place ${x},${y},${z}`).toBe(true);
    w.state.yaw = yaw;
    const startY = w.state.y;
    let maxY = startY;
    let offered = false;
    const hit = new Set<string>();
    for (let i = 0; i < ticks; i++) {
      w.tick(FORWARD);
      for (const h of w.wallHits()) hit.add(h.poly.path);
      if (w.state.y > maxY) maxY = w.state.y;
      if (t.climbPrompt() !== null || t.state().kind !== 'none') offered = true;
    }
    return { startY, maxY, end: [w.state.x, w.state.y, w.state.z], offered, hit };
  }

  it('(d) the rail beside the brace and the sand berm are appflags 0: the walk stops, the feet stay, nothing is offered (FUN_005b3ce0 D:L469131-469132)', () => {
    const rails = polys.filter((p) => p.path === 'worldmodel/deck_dis_inside' || p.path === 'worldmodel/deck_dis_outside');
    expect(rails.length).toBeGreaterThan(0);
    for (const p of rails) expect(p.appflags, p.path).toBe(0);
    const berms = polys.filter((p) => p.path === 'worldmodel/g373');
    expect(berms.length).toBeGreaterThan(0);
    for (const p of berms) expect(p.appflags, p.path).toBe(0);

    // On the deck, just inside the west rail (the rail's gap is the brace, x 1672.5-1710.5), facing the rail (yaw 180).
    const rail = approach(1660, 32, 1428, 180);
    expect(rail.hit.has('worldmodel/deck_dis_inside'), [...rail.hit].join(',')).toBe(true);
    expect(rail.offered).toBe(false);
    expect(rail.maxY - rail.startY).toBeLessThan(0.05);            // feet stay on the deck; a 1e-4 bob is the probe's noise
    expect(rail.end[1]).toBeCloseTo(30, 1);
    expect(rail.end[2]).toBeLessThan(1439);                         // held off the rail's plane at z 1439

    // The berm along the deck's north side, from the ground just outside it, facing -z.
    const berm = approach(1700, 2, 1412, 0);
    expect(berm.hit.has('worldmodel/g373'), [...berm.hit].join(',')).toBe(true);
    expect(berm.offered).toBe(false);
    expect(berm.maxY - berm.startY).toBeLessThan(0.05);
    expect(berm.end[1]).toBeCloseTo(0, 1);
  });

  it("(e) the deck's stair is still walked up: di_top1's ramp from the ground ends on the deck (research 281 s1, polygon 2293)", () => {
    // SEGMENT-BODY part 2 (the weapon line, research 86 s3.8): 120 ticks -- on the deck at 30 by tick 71. Walked on to 240,
    // the body comes within the line's 22.93 of the sandbags (`sausage_climber_dis`, 1380) and their hang is offered, a
    // face of its own, not the stair. *Was:* 240 ticks.
    const stair = approach(1800, 5, 1616, 0, 120);
    expect(stair.offered).toBe(false);                              // a ramp, not a climb face
    expect(stair.end[1]).toBeCloseTo(DECK_TOP, 0);                  // on the deck at 30
  });
});
