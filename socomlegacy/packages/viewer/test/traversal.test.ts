import { describe, expect, it } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { FsAssetSource } from '@s2u/archive/node';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import { buildGrid, findLadders, GAME_FRAME_DT, polygonNormal, PROBE_LIFT, readSkeleton, SEAL_TUNING, type CollisionOwner, type Grid, type GridParams, type WorldPoly } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { loadMap } from '../src/loadMap';
import { clipsFromPack, motionTableFromArchive } from '../src/motionTable';
import { CLIMB_COLUMN_END_READING, contactFromHits, CORNER_HITS_READING, cornerDrop, planClimb, type ClimbContact } from '../src/climb';
import { ACTION_CLIPS, ACTION_SECONDS, EYE_HEIGHT, groundGrid, groundPolygons, moverSnapshot, TICK, Walker, type Stance, type WalkInput } from '../src/walk';
import { rootY as stanceRootY, STANCE_WORD_ACTION_CROUCH_READING, STANCE_WORD_CROUCH_FALLBACK_READING, STANCE_WORD_DIVE_REQUEST_READING } from '../src/mover';
import { Animator, blendWeight, PLAY_CLIPS } from '../src/animator';
import { BLEND_TIME_DEFAULT } from '../src/locomotion';
import { rootAt } from '../src/clipPath';
import { simClipsFromBytes } from '../src/simMap';
import { MoverSim } from '../src/net/moverSim';
import { Button, type Command } from '../src/net/protocol';
import { OneShotSteer, oneShotPhase, seatTurn, steerWeight } from '../src/net/emplacement';
import {
  CLIMB_CROUCH_END_READING, CLIMB_STEER_READING, CLIMB_STEP_UP_STICK_READING, CLIMB_TOP_FLOOR_READING, CLIMB_CUT_READING, CLIMB_NO_INTERRUPT, CLIMB_RESUME_STICK_READING, LADDER_STANDOFF, PISTOL_CLIMB_CLIPS_READING, rippleAnimation,
  DIVE_END_BLEND_READING, DIVE_ROOT_FALL_READING, DIVE_ROOT_SEED_READING, Traversal, TRAVERSAL_CLIPS, type TraversalEvent,
  CLIMB_BODY_CLIPS, CLIMB_HIT_CANCELS_READING, CLIMB_OFFER_GATE_READING, CLIMB_PENDING_STANCE_READING, CLIMB_USEVELY_READING, climbOffered,
} from '../src/traversal';

/**
 * The traversal moves (web research 86): synthetic hulls pin the rules, Frostfire's ladders (MP2, the fixture) pin the
 * whole against the game's own hull and, with the owner's `MOTION_P.ZAR`, the clips' own roots.
 */

const FIXTURES = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'));
const MP2 = fixture('RUN/MP2.ZDB');
const PACK = fixture('RUN/MOTION_P.ZAR');

/** The pack's traversal clips, read once. */
let packClips: ReturnType<typeof clipsFromPack> | null = null;
const PACK_CLIPS = (): ReturnType<typeof clipsFromPack> => (packClips ??= clipsFromPack(PACK!, TRAVERSAL_CLIPS));

const FORWARD: WalkInput = { forward: 1, right: 0, boost: false };
const BACK: WalkInput = { forward: -1, right: 0, boost: false };
const STILL: WalkInput = { forward: 0, right: 0, boost: false };

const quad = (pts: number[], ditype: number, appflags = 0, path = 'worldmodel/q'): WorldPoly => ({
  modelName: 'worldmodel', path, region: 0, ditype, material: 25, ptcount: 4, cameratype: 0, appflags, points: Float32Array.from(pts),
});
const floor = (x0: number, z0: number, x1: number, z1: number, y: number): WorldPoly => quad([x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1], 3);

function world(polys: WorldPoly[]): Grid {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return buildGrid(params, [], [], polys, owners);
}

/**
 * A 40-high wall across x at z 0 with a deck behind it (z < 0) at 40, the ground in front at 0, and a ladder on the
 * wall's face: the span 0..40 and the cap 40..50 (appflags 2), 6 wide.
 */
function ladderWorld(): { grid: Grid; polys: WorldPoly[] } {
  const polys = [
    floor(-100, 0, 100, 100, 0),
    floor(-100, -100, 100, 0, 40),
    quad([-100, 0, 0, 100, 0, 0, 100, 40, 0, -100, 40, 0], 2),
    quad([-3, 0, 0.2, 3, 0, 0.2, 3, 40, 0.2, -3, 40, 0.2], 2, 2, 'worldmodel/lad/ladder'),
    quad([3, 40, 0.2, -3, 40, 0.2, -3, 50, 0.2, 3, 50, 0.2], 2, 2, 'worldmodel/lad/ladder'),
  ];
  return { grid: world(polys), polys };
}

/** Ticks until `until` holds or `max` ticks pass; the ticks taken. */
function run(w: Walker, input: WalkInput, until: () => boolean, max = 2000): number {
  for (let i = 0; i < max; i++) { if (until()) return i; w.tick(input); }
  return max;
}

describe('ladders: the list off the hull (web research 86 section 2)', () => {
  it('finds a ladder by its appflags 2, its span and cap, and the side it is climbed from', () => {
    const { grid, polys } = ladderWorld();
    const [l, ...rest] = findLadders(polys, grid);
    expect(rest).toEqual([]);
    expect(l!.bottom).toBeCloseTo(0, 6);
    expect(l!.top).toBeCloseTo(40, 6);
    expect(l!.capTop).toBeCloseTo(50, 6);
    expect(l!.halfWidth).toBeCloseTo(3, 6);
    expect([l!.nx, l!.nz]).toEqual([0, 1]);                          // the deck is at z < 0: climbed from z > 0
    expect(l!.sided).toBe(true);
  });
});

describe('the ladder on a synthetic wall (research 86 section 2)', () => {
  it('walking into the ladder facing it mounts it, climbs at 13.5 a second, and climbs off onto the deck', () => {
    const { grid, polys } = ladderWorld();
    const w = new Walker(grid);
    const t = new Traversal(grid, polys);
    w.driver = t;
    const events: TraversalEvent[] = [];
    t.on((e) => events.push(e));
    w.place(0, 10, 20);
    w.state.yaw = 0;                                                 // facing -z, at the ladder
    run(w, FORWARD, () => t.state().kind === 'ladderMount', 400);
    expect(events[0]).toEqual({ type: 'ladderMount', from: 'bottom' });
    run(w, FORWARD, () => t.state().kind === 'ladder', 400);
    expect(w.state.z).toBeCloseTo(0.2 + LADDER_STANDOFF, 6);        // on the rungs' centre line, the stand-off out
    expect(w.state.x).toBeCloseTo(0, 6);
    const y0 = w.state.y;
    for (let i = 0; i < 60; i++) w.tick(FORWARD);
    expect(w.state.y - y0).toBeCloseTo(13.5, 1);                    // one second at a full stick (K 1.7778, research 206 s2.4)
    expect(events.filter((e) => e.type === 'ladderRung').length).toBeGreaterThanOrEqual(1);
    run(w, FORWARD, () => t.state().kind === 'ladderOffTop', 2000);
    run(w, FORWARD, () => t.state().kind === 'none', 400);
    expect(events.at(-1)).toEqual({ type: 'ladderDismount', at: 'top' });
    expect(w.state.y).toBeCloseTo(40, 6);
    expect(w.state.z).toBeLessThan(0);                               // over the wall, on the deck
    expect(w.airborne).toBe(false);
  });

  it('does not mount a ladder walked past, faced away from, or approached from behind', () => {
    const { grid, polys } = ladderWorld();
    const w = new Walker(grid);
    const t = new Traversal(grid, polys);
    w.driver = t;
    w.place(30, 10, 20); w.state.yaw = 0;                            // into the wall beside it
    run(w, FORWARD, () => false, 120);
    expect(t.state().kind).toBe('none');
    w.place(0, 10, 20); w.state.yaw = 180;                           // backing into it
    run(w, BACK, () => false, 120);
    expect(t.state().kind).toBe('none');
  });

  it('LDR-1: mounts on a wall contact with the ladder quad only, not walking into the wall beside it (FUN_005b4b40)', () => {
    const { grid, polys } = ladderWorld();
    const beside = new Walker(grid);
    const t = new Traversal(grid, polys);
    beside.driver = t;
    beside.place(8, 10, 20); beside.state.yaw = 0;                   // 5 past the quad's edge (x 3), into the plain wall
    run(beside, FORWARD, () => t.state().kind !== 'none', 120);
    expect(t.state().kind).toBe('none');
    const over = new Walker(grid);
    const u = new Traversal(grid, polys);
    over.driver = u;
    over.place(2, 10, 20); over.state.yaw = 0;                       // over the quad
    run(over, FORWARD, () => u.state().kind !== 'none', 400);
    expect(u.state().kind).toBe('ladderMount');
  });

  it('climbs back down and steps off at the foot, and the action button slides down at 0.8 g', () => {
    const { grid, polys } = ladderWorld();
    const w = new Walker(grid);
    const t = new Traversal(grid, polys);
    w.driver = t;
    const events: TraversalEvent[] = [];
    t.on((e) => events.push(e));
    w.place(0, 10, 20); w.state.yaw = 0;
    run(w, FORWARD, () => t.state().kind === 'ladder', 400);
    run(w, FORWARD, () => w.state.y > 10, 400);
    run(w, BACK, () => t.state().kind === 'ladderOffBottom', 800);
    run(w, STILL, () => t.state().kind === 'none', 400);
    expect(w.state.y).toBe(0);
    expect(w.state.z).toBeGreaterThan(0.2 + LADDER_STANDOFF);        // stepped back off the rungs
    expect(events.at(-1)).toEqual({ type: 'ladderDismount', at: 'bottom' });
    // Up again, then the slide.
    run(w, FORWARD, () => t.state().kind === 'ladder', 400);
    run(w, FORWARD, () => w.state.y > 12, 800);
    t.action();
    w.tick(STILL);
    expect(t.state().kind).toBe('ladderSlide');
    const from = w.state.y;
    const ticks = run(w, STILL, () => t.state().kind === 'ladderSlideLand', 800);
    expect(w.state.y).toBe(0);
    // The fall at 0.8 g from rest after "Ladder -> slide"'s 0.5 s: sqrt(2 h / (0.8 x 235)).
    expect(ticks * TICK).toBeCloseTo(0.5 + Math.sqrt((2 * from) / (0.8 * 235)), 0);
    expect(events.map((e) => e.type)).toContain('ladderSlideLand');
    run(w, STILL, () => t.state().kind === 'none', 400);
    expect(w.airborne).toBe(false);
  });

  it('mounts from the deck by backing onto the head\'s short quad, and climbs down to the ground', () => {
    const { grid, polys } = ladderWorld();
    const w = new Walker(grid);
    const t = new Traversal(grid, polys);
    w.driver = t;
    const events: TraversalEvent[] = [];
    t.on((e) => events.push(e));
    w.place(0, 60, -20); w.state.yaw = 180;                          // on the deck facing the ladder (+z)
    run(w, FORWARD, () => t.state().kind === 'ladderMountTop', 400);
    expect(events[0]).toEqual({ type: 'ladderMount', from: 'top' });
    run(w, STILL, () => t.state().kind === 'ladder', 400);
    expect(w.state.z).toBeCloseTo(0.2 + LADDER_STANDOFF, 6);
    expect(t.yaw()).toBeCloseTo(0, 6);                               // turned to face the rungs
    run(w, BACK, () => t.state().kind === 'none', 3000);
    expect(w.state.y).toBe(0);
  });
});

describe.skipIf(!MP2)(`Frostfire's ladders${MP2 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it('finds the five ladders research 86 section 2.2 lists, each climbed from the side away from its deck', async () => {
    const map = await loadMap(new FsAssetSource(FIXTURES), 'RUN/MP2.ZDB');
    const grid = groundGrid(map.ground!);
    const ladders = findLadders(groundPolygons(map.ground!), grid);
    expect(ladders.map((l) => [Math.round(l.x), Math.round(l.z), Math.round(l.bottom), Math.round(l.top)])).toEqual([
      [548, 854, 100, 160], [783, 364, 100, 155], [497, 596, 100, 155], [989, 617, 103, 153], [159, 913, 100, 157],
    ]);
    expect(ladders.every((l) => l.sided)).toBe(true);
  });

  it('climbs the sniper ladder at (547.5, 854.4) from the 100 floor to the 160 deck with the disc\'s clips', async () => {
    const map = await loadMap(new FsAssetSource(FIXTURES), 'RUN/MP2.ZDB');
    const grid = groundGrid(map.ground!);
    const w = new Walker(grid);
    const t = new Traversal(grid, groundPolygons(map.ground!));
    if (PACK) {
      const readers = resolve(FIXTURES, '../public/maps/RUN/READERC.ZAR');
      const table = existsSync(readers) ? motionTableFromArchive(readFileSync(readers)) : null;
      t.setClips(clipsFromPack(PACK, TRAVERSAL_CLIPS), table);
    }
    w.driver = t;
    const l = t.ladders[0]!;
    expect(w.place(l.x + l.nx * 15, 115, l.z + l.nz * 15)).toBe(true);
    w.state.yaw = Math.atan2(l.nx, l.nz) * 180 / Math.PI;
    run(w, FORWARD, () => t.state().kind === 'ladder', 600);
    expect(t.state().kind).toBe('ladder');
    const ticks = run(w, FORWARD, () => t.state().kind === 'none', 3000);
    expect(ticks).toBeLessThan(3000);
    expect(w.state.y).toBeCloseTo(160, 3);
    expect((w.state.x - l.x) * l.nx + (w.state.z - l.z) * l.nz).toBeLessThan(0);   // on the deck's side
  });
});

// ---- the climb (research 86 section 3) ---------------------------------------------------------------------------

/** A box from (x0, z0) to (x1, z1), `h` tall on the 0 floor, its four sides of `appflags`, its top a floor. */
function box(x0: number, z0: number, x1: number, z1: number, h: number, appflags: number): WorldPoly[] {
  return [
    quad([x0, 0, z1, x1, 0, z1, x1, h, z1, x0, h, z1], 2, appflags),
    quad([x0, 0, z0, x1, 0, z0, x1, h, z0, x0, h, z0], 2, appflags),
    quad([x0, 0, z0, x0, 0, z1, x0, h, z1, x0, h, z0], 2, appflags),
    quad([x1, 0, z0, x1, 0, z1, x1, h, z1, x1, h, z0], 2, appflags),
    floor(x0, z0, x1, z1, h),
  ];
}

function climbWorld(h: number, appflags: number): { grid: Grid; polys: WorldPoly[] } {
  const polys = [floor(-100, -100, 100, 100, 0), ...box(-10, -30, 10, 0, h, appflags)];
  return { grid: world(polys), polys };
}

/** A walker and its traversal on a hull, stood at (0, 0, z) facing -z, the box's near side at z 0. */
function climber(polys: WorldPoly[], grid: Grid, z = 12): { w: Walker; t: Traversal; events: TraversalEvent[] } {
  const w = new Walker(grid);
  const t = new Traversal(grid, polys);
  w.driver = t;
  const events: TraversalEvent[] = [];
  t.on((e) => events.push(e));
  w.place(0, 10, z);
  w.state.yaw = 0;
  return { w, t, events };
}

describe('the climb on a synthetic box (research 86 section 3)', () => {
  it('shows the climb prompt once the climbable side is touched, and the action climbs the crate onto its top', () => {
    const { grid, polys } = climbWorld(12, 4);
    const { w, t, events } = climber(polys, grid);
    expect(t.climbPrompt()).toBeNull();
    run(w, FORWARD, () => t.climbPrompt() !== null, 120);
    expect(t.climbPrompt()).toEqual({ visible: true, kind: 'low', automatic: false });
    // The contact is kept stepping back (within 24, in front, facing it).
    for (let i = 0; i < 10; i++) w.tick(BACK);
    expect(t.climbPrompt()?.kind).toBe('low');
    t.action();
    w.tick(STILL);
    expect(events[0]).toEqual({ type: 'climbStart', kind: 'low' });
    const ticks = run(w, STILL, () => t.state().kind === 'none', 400);
    expect(ticks * TICK).toBeGreaterThan(1.25 * (29 / 30) ** 2);   // the clip's run to its last key (FUN_0028c4f0), after the steering
    expect(events.map((e) => e.type)).toEqual(['climbStart', 'climbUp', 'climbEnd']);
    expect(w.state.y).toBeCloseTo(12, 6);
    expect(w.state.z).toBeLessThan(0);                                // on the top, past the edge
    expect(w.airborne).toBe(false);
  });

  it('picks the clip by the height (FUN_00580b70): step, crate, medium, hang; nothing over 32 or on a plain wall', () => {
    const kind = (h: number, app: number): string | null => {
      const { grid, polys } = climbWorld(h, app);
      const { w, t } = climber(polys, grid, 5);
      run(w, FORWARD, () => false, 30);
      return t.climbPrompt()?.kind ?? null;
    };
    expect(kind(8, 1)).toBe('step');
    expect(kind(11, 1)).toBe('low');
    expect(kind(18, 1)).toBe('low');                                  // crate weight 1 - 6 / 14.5 = 0.59
    expect(kind(20, 1)).toBe('med');                                  // 0.45
    expect(kind(27, 3)).toBe('med');
    expect(kind(30, 1)).toBe('high');
    expect(kind(34, 1)).toBeNull();
    expect(kind(12, 0)).toBeNull();                                   // an ordinary wall is never climbed
    expect(kind(4, 4)).toBeNull();                                    // a crate under 5
  });

  it('steps onto a low crate with no press (appflags 4, 5 < h <= 10)', () => {
    const { grid, polys } = climbWorld(8, 4);
    const { w, t, events } = climber(polys, grid);
    run(w, FORWARD, () => events.length > 0, 200);
    expect(events[0]).toEqual({ type: 'climbStart', kind: 'step' });
    run(w, STILL, () => t.state().kind === 'none', 400);
    expect(w.state.y).toBeCloseTo(8, 6);
  });

  // NU-1c B12 (research 313 sections 1.2 and 8.1, its D13; CLIMB_STEP_UP_STICK_READING): the automatic step-up runs from
  // the offer with the contact held and faced -- `FUN_005b3ce0` calls `FUN_005b2620` for class 4 at 5 < h <= 10 with no
  // stick test (D:L469266-469276). The walk's own hit makes the contact; the next tick, the stick at rest, steps up.
  it('NU-1c B12: the automatic step-up needs no stick into the face -- the contact made, the stick let go, it steps up (RED before B12: nothing)', () => {
    const { grid, polys } = climbWorld(8, 4);
    const { w, t, events } = climber(polys, grid);
    run(w, FORWARD, () => w.wallHits().length > 0, 200);                 // the walk's hit on the face: the contact next tick
    expect(events).toEqual([]);
    w.tick(STILL);
    expect(events[0]).toEqual({ type: 'climbStart', kind: 'step' });
    run(w, STILL, () => t.state().kind === 'none', 400);
    expect(w.state.y).toBeCloseTo(8, 6);
    expect(CLIMB_STEP_UP_STICK_READING).toBe('none');
  });

  // NU-1c B12 (research 313 sections 1.2, 6 and 8.1, its D12; CLIMB_TOP_FLOOR_READING): no floor test on the top --
  // `FUN_005b3ce0` and `FUN_005b2620` offer and push a class-4 face by its height alone (D:L469246-469285,
  // D:L468420-468504), and the end handler settles the body on the floor pick (`FUN_00589aa0` D:L446582-446648, `+0x2e4`
  // from `+0x404` each climb tick, D:L466784), the cut's and the uncut end's alike.
  it('NU-1c B12: a box whose top has no floor is offered and climbed; the end settles on the floor pick (RED before B12: nothing offered)', () => {
    const polys = [floor(-100, -100, 100, 100, 0), floor(-10, -30, 10, -2, 12.8), ...box(-10, -30, 10, 0, 11, 4).slice(0, 4)];
    const grid = world(polys);
    const { w, t, events } = climber(polys, grid);
    run(w, FORWARD, () => t.climbPrompt() !== null, 120);
    expect(t.climbPrompt()?.kind).toBe('low');                          // 11: the crate; its top's floor 1.8 over it, 2 in
    t.action();
    run(w, STILL, () => events.at(-1)?.type === 'climbEnd', 400);
    expect(w.state.y).toBeCloseTo(12.8, 6);                             // the floor pick at the feet, not the polygon's top 11
    expect(CLIMB_TOP_FLOOR_READING).toBe('dropped');
  });

  it('climbs over appflags 5 whatever its height, landing on the far side', () => {
    const polys = [floor(-100, -100, 100, 100, 0), ...box(-10, -2, 10, 0, 10, 5).slice(0, 4)];
    const grid = world(polys);
    const { w, t, events } = climber(polys, grid);
    run(w, FORWARD, () => t.climbPrompt() !== null, 120);
    expect(t.climbPrompt()?.kind).toBe('over');
    t.action();
    run(w, STILL, () => events.at(-1)?.type === 'climbEnd', 400);
    expect(w.state.y).toBe(0);
    expect(w.state.z).toBeLessThan(-2);                               // over the wall
  });

  it('hangs from a 30-high ledge, and the stick ahead pulls up onto it', () => {
    const { grid, polys } = climbWorld(30, 1);
    const { w, t, events } = climber(polys, grid);
    run(w, FORWARD, () => t.climbPrompt() !== null, 120);
    t.action();
    run(w, STILL, () => t.state().kind === 'hang', 400);
    expect(w.state.y).toBeGreaterThan(5);
    expect(w.airborne).toBe(false);                                   // held by the hang, not falling
    run(w, FORWARD, () => t.state().kind === 'none', 400);
    expect(events.map((e) => e.type)).toEqual(['climbStart', 'jumpWhoosh', 'pullUp', 'climbEnd']);
    expect(w.state.y).toBeCloseTo(30, 6);
  });

  it('the jump-grab: a 36 ledge is out of reach from the floor, and in reach at the top of a jump', () => {
    const { grid, polys } = climbWorld(36, 1);
    const { w, t, events } = climber(polys, grid);
    run(w, FORWARD, () => false, 60);
    expect(t.climbPrompt()).toBeNull();                               // h 36 > 32
    w.setAirborne(true, 60);                                         // a jump's rise
    run(w, STILL, () => t.climbPrompt() !== null, 60);
    expect(w.airborne).toBe(true);
    expect(t.climbPrompt()?.kind).toBe('high');
    t.action();
    w.tick(FORWARD);
    run(w, FORWARD, () => t.state().kind === 'none', 800);
    expect(events[0]).toEqual({ type: 'climbStart', kind: 'high' });
    expect(w.state.y).toBeCloseTo(36, 6);
  });

  // SEGMENT-BODY part 4 (the r0004 jump-near-wall capture, 2026-11-04; `JUMP_CONTACT_PROVEN` 'none'): the running jump
  // reads no stored contact, so pressed 16 out, the weapon line already holding the face, it launches. *Was* (part 2,
  // the r0001 reading, `FUN_0057e1b0` D:L440815-440819): pressed 25 out, beyond the line's reach, and 16 out the standing
  // jump.
  it('the jump-grab off the walk own running jump (79.9 up, research 80): a 36 ledge climbed from the air', () => {
    const { grid, polys } = climbWorld(36, 1);
    const { w, t, events } = climber(polys, grid, 40);
    run(w, FORWARD, () => Math.hypot(w.state.vx, w.state.vz) > 60, 60);
    run(w, FORWARD, () => w.state.z < 16, 60);
    expect(w.storedContact()?.poly.appflags, 'the weapon line holds the face 16 out').toBe(1);
    expect(w.jump()).toBe(true);
    expect(w.action?.name).toBe('launch');
    run(w, FORWARD, () => t.climbPrompt() !== null && w.airborne, 90);
    expect(w.airborne).toBe(true);
    expect(t.climbPrompt()?.kind).toBe('high');                      // 36 less the rise: within the table's 32
    t.action();
    w.tick(FORWARD);
    expect(events[0]).toEqual({ type: 'climbStart', kind: 'high' });
    expect(w.airborne).toBe(false);                                   // the climb holds it: the jump and its fall are over
    expect(w.action).toBeNull();
    run(w, FORWARD, () => t.state().kind === 'none', 800);
    expect(w.state.y).toBeCloseTo(36, 6);
    expect(w.action).toBeNull();
  });

  // PB-3b (research 281 s4.2; reading, pending review): the move solver's segment test is one-sided on the hull -- a
  // crossing from behind a polygon's own normal is no hit (FUN_002dd150's VU0 program, micro 288-333: the start in front,
  // the end behind; the hull's collider has `+0x80` bit 1 clear, FUN_00316e30 D:L215828, so FUN_002d2890
  // D:L174831-174837 asks one side), and the hit's normal is the polygon's own. So a climb face is offered from its front
  // only. `box`'s far side (z0) is wound with its normal +z, into the box: from -z it is met from behind.
  it('a climb face met from behind its own normal offers nothing; wound to face the walker, the same face offers the climb', () => {
    const from = (polys: WorldPoly[]): string | null => {
      const grid = world(polys);
      const { w, t } = climber(polys, grid, -42);
      w.state.yaw = 180;                                              // facing +z, toward the box's far side at z -30
      run(w, FORWARD, () => t.climbPrompt() !== null, 120);
      return t.climbPrompt()?.kind ?? null;
    };
    const behind = [floor(-100, -100, 100, 100, 0), ...box(-10, -30, 10, 0, 12, 4)];
    expect(from(behind)).toBeNull();                                  // was 'low': `contactOf` turned the normal
    const outward = behind.slice();
    outward[2] = quad([10, 0, -30, -10, 0, -30, -10, 12, -30, 10, 12, -30], 2, 4);   // the far side wound to face -z
    expect(from(outward)).toBe('low');
  });

  // PAR-21a C1 (research 281 s4.1; reading, pending review): the move solver stores the best hit of the move whether or
  // not its polygon climbs (`FUN_005483d0` D:L413866; the centre's and the head line's records, D:L413823-413848). From
  // the crate's face along a coplanar plain wall, the plain wall's hit is the contact, and nothing is offered on it.
  it('PAR-21a C1: a crate face met, then a coplanar plain wall met on a later move -- the plain wall is the contact, no climb offered (RED: the crate kept)', () => {
    const plain = quad([11, 0, 0, 40, 0, 0, 40, 30, 0, 11, 30, 0], 2, 0, 'worldmodel/plain');   // z 0, facing +z, as the crate's near side
    // MV-PARITY (b2): the crate's +x side wound to face out (+x), as a hull face the walker meets is (research 281
    // s4.3: hit only from in front of its own normal). `box` winds that side to face in (-x); the walk past the crate's
    // corner met its end from in front of that inward normal and stopped there (x 9.88) once a face's end is taken
    // along the face's own normal (`WALL_END_CONTACT_READING`), where the corner push used to let it by.
    const crate = box(-10, -30, 10, 0, 12, 4);
    crate[3] = quad([10, 0, 0, 10, 0, -30, 10, 12, -30, 10, 12, 0], 2, 4);
    expect(polygonNormal(crate[3]!.points)![0]).toBeCloseTo(1, 6);
    const polys = [floor(-100, -100, 100, 100, 0), ...crate, plain];
    const grid = world(polys);
    const { w, t } = climber(polys, grid);
    run(w, FORWARD, () => t.climbPrompt() !== null, 120);
    expect(t.climbPrompt()?.kind).toBe('low');                          // on the crate's face
    const along: WalkInput = { forward: 1, right: 1, boost: false };     // yaw 0: right is +x, along the face, pressed into it
    run(w, along, () => w.state.x >= 14.5, 200);
    expect(w.state.x).toBeGreaterThanOrEqual(14.5);
    // Against the plain wall, 4.5 past the crate's corner: SEGMENT-BODY (re-judged; was within 3.6, the disc's stand-off)
    // where the segments hold it -- the head line along the facing, 9.46, plus the move.
    expect(w.state.z).toBeLessThan(11);
    w.tick(along);
    // SEGMENT-BODY checkpoint 4 (re-judged): held 6.2 off the plain wall, only a side line meets it (the centre's 5.39 runs
    // diagonally, 3.8 toward it), and a side record's hit is never the stored contact (D:L413823-413848); the crate's
    // contact holds by `FUN_005b3890`'s rules (within 24, in front, faced) and the climb stays offered. Was null: the
    // head line's muzzle reach met the plain wall (checkpoints 1-3), the disc's before.
    expect(t.climbPrompt()?.kind).toBe('low');
  });

  // PAR-21a C2 (research 281 s4.1; reading, pending review): with the stored hit climbable (`FUN_0059d9f0`), any other
  // hit of the move on another polygon whose horizontal normal is off by more than acos 0.9 (about 25.8 degrees) drops
  // the contact (`FUN_005483d0` D:L413867-413901, the literal at D:L413894, the polygon word at D:L413884). Two crate
  // faces in an inside corner: the second turned 20 degrees from the first offers the climb (dot 0.94), 30 and 90 did not.
  // SEGMENT-BODY part 2 (the weapon line; research 86 s3.8; reading, pending review): the corner drop runs only on a
  // tick that stores a record hit of the centre or the head line (D:L413864-413901). Settled in this corner only the side
  // records meet the faces (the centre's 5.39 falls short of A, 6.7 off), so no record hit is stored, a moving tick asks
  // only `FUN_005b3890`'s drop (D:L413859-413862: within 24, in front, faced -- held), and the contact the weapon line
  // stored on the way in stands: offered at 30 and 90 too. The 0.9 itself is held where the centre meets a face in a
  // corner (`climbFacing.test.ts` (e2), `mp6DeckClimb.parity.test.ts` (3)). *Was:* 30 and 90 nothing.
  it('PAR-21a C2: an inside corner of two crate faces -- turned 20, 30 or 90 degrees, only side records meet them, the weapon line\'s contact holds and the climb is offered', () => {
    const corner = (deg: number): string | null => {
      const a = (deg * Math.PI) / 180, dx = Math.cos(a), dz = Math.sin(a);
      // A: z 0 from x -10 to 4, facing +z. B: from (4, 0) along (cos, sin) for 20, facing (-sin, cos), toward the walker.
      const A = quad([-10, 0, 0, 4, 0, 0, 4, 12, 0, -10, 12, 0], 2, 4, 'worldmodel/a');
      const B = quad([4, 0, 0, 4 + 20 * dx, 0, 20 * dz, 4 + 20 * dx, 12, 20 * dz, 4, 12, 0], 2, 4, 'worldmodel/b');
      const nb = polygonNormal(B.points)!, na = polygonNormal(A.points)!;
      expect(na[2]).toBeCloseTo(1, 6);
      expect(nb[0]).toBeCloseTo(-Math.sin(a), 6);                       // B faces the walker inside the corner
      expect(nb[0] * na[0] + nb[2] * na[2]).toBeCloseTo(Math.cos(a), 6);
      const polys = [floor(-100, -100, 100, 100, 0), A, B];
      const grid = world(polys);
      const { w, t } = climber(polys, grid);
      w.place(deg === 90 ? 0.6 : 4, 10, 12);
      const along: WalkInput = { forward: 1, right: 0.3, boost: false };  // into the corner
      for (let i = 0; i < 90; i++) w.tick(along);
      // Settled in the corner: the last move met both faces (B alone, on the way in, is a climb face of its own).
      // SEGMENT-BODY (re-judged): at 30 and 90 the last move meets both; at 20 the segments hold the body 9.4 off A where
      // B is out of their reach, and the move meets A alone (B met on the way in) -- the offer is A's either way.
      const met = new Set(w.wallHits().map((h) => h.poly.path));
      expect(met, `${deg}: the faces met`).toEqual(deg === 20 ? new Set(['worldmodel/a']) : new Set(['worldmodel/a', 'worldmodel/b']));
      return t.climbPrompt()?.kind ?? null;
    };
    expect(corner(20)).toBe('low');
    expect(corner(30)).toBe('low');                                     // part 2: was null (no contact formed on the way in)
    expect(corner(90)).toBe('low');                                     // part 2: was null
  });

  // PAR-21a C2, `CORNER_HITS_READING` 'span' (research 281 s4.1, s6): at an outside corner the slide's disc meets both
  // faces at their shared end; walked in on the corner a still body's segment records meet only the centre's face, a
  // moving one's side record the other face too (two readings, unsettled: research 281 s4.1, PAR-21a F2; HUMAN_TASKS
  // H229). Under 'span' a face met only at its end is not another hit, and the outside corner offers the climb; under
  // 'any' the same hits clear the contact (`cornerDrop`'s mode, PAR-21a F3) -- the disc arm's stand-in.
  // SEGMENT-BODY part 2 (reading, pending review): the corner drop is the Walker's now, over its own segment records
  // (`Walker.storeContact`, D:L413864-413901), and a side record's hit is a crossing of the other face's polygon -- inside
  // its span by construction, so the stand-in's question does not arise. Walked in on this edge, the centre's hit on the
  // near face is stored and the moving side record crosses the end face (a normal 90 degrees off): cleared, nothing
  // offered while held there. *Was:* offered ('span'). H229's capture (Frostfire's prop02 corner) still settles it.
  it("PAR-21a C2: a crate's outside corner walked into on its edge: the disc arm's 'span' keeps it, 'any' clears it; the segment body clears it", () => {
    const { grid, polys } = climbWorld(12, 4);
    for (const yaw of [-40, -45, -50]) {
      const { w, t } = climber(polys, grid);
      const fx = -Math.sin((yaw * Math.PI) / 180), fz = -Math.cos((yaw * Math.PI) / 180);
      w.place(-10 - fx * 8, 10, -fz * 8);                               // 8 out from the corner (-10, 0) along the walk
      w.state.yaw = yaw;
      let both = 0;
      for (let i = 0; i < 40; i++) {
        w.tick(FORWARD);
        const hits = w.wallHits(), c = contactFromHits(hits, w.state.x, w.state.z);
        if (!c || new Set(hits.map((h) => h.poly)).size < 2) continue;   // a move that met both faces at the corner
        both++;
        expect(cornerDrop(hits, c, w.state.x, w.state.z, 'span'), `yaw ${yaw}, tick ${i}: 'span' keeps it`).toBe(false);
        expect(cornerDrop(hits, c, w.state.x, w.state.z, 'any'), `yaw ${yaw}, tick ${i}: 'any' clears it`).toBe(true);
        expect(cornerDrop(hits, c, w.state.x, w.state.z), `yaw ${yaw}, tick ${i}: the default is the reading's`).toBe(false);
      }
      expect(both, `yaw ${yaw}: moves that met both faces`).toBeGreaterThan(0);
      expect(t.climbPrompt()?.kind ?? null, `yaw ${yaw}: the segment body's corner drop`).toBeNull();   // part 2: was 'low'
    }
    expect(CORNER_HITS_READING).toBe('span');
  });

  it('does not climb prone, or facing away', () => {
    const { grid, polys } = climbWorld(12, 4);
    const { w, t } = climber(polys, grid);
    run(w, FORWARD, () => t.climbPrompt() !== null, 120);
    w.stance = 'prone';
    w.tick(STILL);
    expect(t.climbPrompt()).toBeNull();
    w.stance = 'stand';
    w.state.yaw = 180;
    w.tick(STILL);
    expect(t.climbPrompt()).toBeNull();
  });
});

/**
 * NU-1c B10 (research 313 sections 3 and 8.1, its D2; research 215 s7.1, `SeatSteer`'s law): the climb's clip runs from
 * the press with `FUN_005b3340`'s steer folded into it -- the one-shot branch of `FUN_0057a330` (D:L439017-439020), no
 * align before the clip (the 30 a second, 4.712 rad/s, 46 ticks were `FUN_005b2d20`'s, the looped branch's). The body
 * goes with its clip's own root travel (the root's velocity, `FUN_0028c250`, to which `FUN_0054d9a0` adds the play's,
 * D:L416455) and each tick the steer closes `steerWeight(phase)` of the remaining offset between the body and where the
 * clip's `refPt` meets the ledge (D:L468928-468943; the target moving with the root's travel, D:L468947-468951); the turn
 * at most 2 pi rad/s times the sine (`seatTurn`, D:L468862-468886); the vertical kept (zeroed only for 0x2c and a reversed
 * 0x2e, D:L468933-468941). A twin pressed at the aligned start (the offset 0) draws the clip's own track: the pressed
 * body is that track less the offset, closed tick by tick.
 */
describe("NU-1c B10: the climb's steer concurrent with its clip (FUN_005b3340, research 313 section 3)", () => {
  interface Row { kind: string; key: number; x: number; y: number; z: number; yaw: number; body: number | null }
  /**
   * The crate climb at an `h` box (appflags 4) walked into from (x, 12) at `yaw`; `aligned`: moved to the aligned start
   * (the plan's target, `refPt.z` 8.92 back along the face's normal, faced), the contact kept, before the press.
   */
  function climbRows(h: number, x: number, yaw: number, aligned = false): { rows: Row[]; t: Traversal } {
    const { grid, polys } = climbWorld(h, 4);
    const { w, t } = climber(polys, grid);
    w.place(x, 10, 12);
    // SEGMENT-BODY (re-judged; was walked in at `yaw`): the move's stored contact is the centre's or the head line's hit
    // (D:L413823-413848); walked in at 60 degrees the side line (1.05 to 4.2 across) meets the face first and the body
    // slides along it, no contact and no offer. So it walks in square (yaw 0), then turns to `yaw` still -- a still body
    // keeps its contact (`FUN_005b3890` runs on a moving tick, D:L413861) -- and the offer is asked there.
    w.state.yaw = 0;
    run(w, FORWARD, () => t.climbPrompt() !== null, 120);
    if (yaw !== 0) { w.state.yaw = yaw; w.tick(STILL); }
    expect(t.climbPrompt(), `h ${h} from x ${x} at ${yaw}`).not.toBeNull();
    if (aligned) {
      const plan = (t as unknown as { plan: { target: [number, number, number]; yaw: number } }).plan;
      w.state.x = plan.target[0]; w.state.z = plan.target[2] + 8.92; w.state.yaw = plan.yaw;   // the face's normal is +z
      w.tick(STILL);
      expect(t.climbPrompt()).not.toBeNull();
    }
    t.action();
    const rows: Row[] = [];
    const row = (): void => {
      const st = t.state(), root = t.rootY();
      rows.push({ kind: st.kind, key: st.key, x: w.state.x, y: w.state.y, z: w.state.z, yaw: w.state.yaw, body: root === null ? null : w.state.y + root });
    };
    row();                                                                // before the press's command
    for (let i = 0; i < 400 && (rows.length < 2 || rows.at(-1)!.kind !== 'none'); i++) { w.tick(STILL); row(); }
    return { rows, t };
  }
  /** The clip's weight on its tick i (`OneShotSteer`): `steerWeight(oneShotPhase(i dt))`. */
  const weight = (t: Traversal, i: number): number => {
    const s = t.shapes.get('seal_climbcrate');
    return steerWeight(oneShotPhase(i * TICK, s.seconds, s.keys));
  };

  it("the clip is pushed on the press's command and advances on the next: no align before it (RED before B10: 'climbAlign', key 0)", () => {
    const { rows, t } = climbRows(12, 8, 60);
    const s = t.shapes.get('seal_climbcrate');
    expect(rows[1]!.kind).toBe('climb');                                  // the press's command: the clip at key 0
    expect(rows[1]!.key).toBe(0);
    expect(rows[2]!.kind).toBe('climb');
    expect(rows[2]!.key).toBeCloseTo((TICK / s.seconds) * (s.keys - 1), 9);   // its first advance, the next command
    expect(rows[1]!.yaw).toBeCloseTo(rows[0]!.yaw, 9);                   // no turn before the clip
  });

  it("head on: the body is the clip's own track less the offset to the aligned start, closed by steerWeight each tick", () => {
    const { rows: pressed, t } = climbRows(12, 0, 0);
    const twin = climbRows(12, 0, 0, true).rows;
    expect(twin.length).toBe(pressed.length);
    const offset = pressed[0]!.z - twin[0]!.z;                            // the feet short of the aligned start
    // SEGMENT-BODY (re-judged; was under -4, the disc's 3.5 against the start's 8.92): the press is made where the
    // segments stop the walk, 9.46 or more off the face, so the feet stand short of the aligned start the other way.
    expect(Math.abs(offset)).toBeGreaterThan(0.3);
    let open = 1;
    for (let i = 2; i < pressed.length && pressed[i]!.kind === 'climb'; i++) {
      open *= 1 - weight(t, i - 1);
      expect(pressed[i]!.z - twin[i]!.z, `tick ${i - 1}`).toBeCloseTo(offset * open, 9);
      expect(pressed[i]!.x - twin[i]!.x, `tick ${i - 1}`).toBeCloseTo(0, 9);
      expect(pressed[i]!.body!, `tick ${i - 1}: the drawn body`).toBeCloseTo(twin[i]!.body!, 9);
    }
    expect(pressed.at(-1)!.z).toBeCloseTo(twin.at(-1)!.z, 6);             // the same end on the top
    expect(pressed.at(-1)!.y).toBeCloseTo(12, 6);
  });

  it("from 60 degrees off: the turn is seatTurn each tick of the clip, never closing on its own; the track's steps taken along the turned body", () => {
    const { rows, t } = climbRows(12, 8, 60);
    const yaws = rows.slice(1).filter((r) => r.kind === 'climb').map((r) => r.yaw);
    expect(yaws[0]).toBeCloseTo(60, 9);
    for (let i = 1; i < yaws.length; i++) expect(yaws[i]!, `tick ${i}`).toBeCloseTo(seatTurn(yaws[i - 1]!, 0, TICK), 9);
    expect(Math.abs(yaws.at(-1)!)).toBeGreaterThan(0.1);                  // `a sin a` a tick: still off at the end
    expect(Math.abs(yaws.at(-1)!)).toBeLessThan(2);
    // The residual with the turn: e' = (1 - k) e + (D - R(yaw') D), D the track's step (the faced twin's).
    const twin = climbRows(12, 8, 60, true).rows;
    let ex = twin[0]!.x - rows[0]!.x, ez = twin[0]!.z - rows[0]!.z;
    for (let i = 2; i < rows.length && rows[i]!.kind === 'climb'; i++) {
      const k = weight(t, i - 1), dx = twin[i]!.x - twin[i - 1]!.x, dz = twin[i]!.z - twin[i - 1]!.z;
      const a = (rows[i]!.yaw * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
      ex = (1 - k) * ex + dx - (dx * c + dz * s);
      ez = (1 - k) * ez + dz - (-dx * s + dz * c);
      expect(rows[i]!.x, `tick ${i - 1} x`).toBeCloseTo(twin[i]!.x - ex, 9);
      expect(rows[i]!.z, `tick ${i - 1} z`).toBeCloseTo(twin[i]!.z - ez, 9);
    }
  });

  it('the vertical kept: a ledge 1 higher draws the body 1 x (1 - prod(1 - k)) higher, the same eased closure (was: 30 a second)', () => {
    const { rows: low, t } = climbRows(10.5, 0, 0);
    const high = climbRows(11.5, 0, 0).rows;
    expect(high.length).toBe(low.length);
    let open = 1, ticks = 0;
    for (let i = 2; i < low.length && low[i]!.kind === 'climb'; i++, ticks++) {
      open *= 1 - weight(t, i - 1);
      expect(high[i]!.body! - low[i]!.body!, `tick ${i - 1}`).toBeCloseTo(1 - open, 9);
    }
    expect(ticks, 'the clip from the press on, every tick of it compared').toBeGreaterThan(60);
  });

  it("the shared law: OneShotSteer is the mount's clock, weight and turn -- the phase held at (n - 1) / n, the weight sqrt(ease)", () => {
    const steer = new OneShotSteer(1.25 * (29 / 30) ** 2, 30, 0);
    const a = steer.advance(30, TICK);
    expect(a.phase).toBeCloseTo(TICK / (1.25 * (29 / 30)), 12);
    expect(a.k).toBeCloseTo(Math.sqrt(2 * a.phase * a.phase), 12);
    expect(a.yaw).toBeCloseTo(seatTurn(30, 0, TICK), 12);
    for (let i = 0; i < 200; i++) steer.advance(0, TICK);
    expect(oneShotPhase(steer.run, steer.seconds, 30)).toBeCloseTo(29 / 30, 12);   // held at the one-shot's end
    expect(CLIMB_STEER_READING).toBe('concurrent');
  });
});

/**
 * NU-1a (research 313 section 4, section 8.1 B2): the stick or the turn past 0.1 cuts a climb past its clip's `NoInterrupt`
 * -- the driver's ordinary cut (`FUN_00550ef0` D:L418176-418203; `FUN_00587c20` D:L445549-445565), the phase on the clip's
 * clock `t / (playback x (n - 1) / n)` (`NOFIRE_PHASE_READING`) from its push, no lag (`CLIMB_CUT_READING`: the push's own
 * clock, as `Walker.holdCut` reads a hold pushed before the driver); the cut pops the climb and runs its end handler
 * (`FUN_00589aa0` D:L446582-446648): the body at its own x and z and the floor pick's y. `seal_climbcrate`: playback
 * 1.25, 30 keys, `NoInterrupt` 0.9 (`motion.rdr`, the golden `motion-rdr.json`).
 */
describe("NU-1a B2: the climb's cut by the stick past NoInterrupt (research 313 section 4)", () => {
  /** The crate climb pressed from a stand: ticks the align with the stick at rest, then holds `input` from the clip's push. */
  function crate(input: WalkInput): { w: Walker; t: Traversal; events: TraversalEvent[]; ticks: number } {
    const { grid, polys } = climbWorld(12, 4);
    const { w, t, events } = climber(polys, grid);
    run(w, FORWARD, () => t.climbPrompt() !== null, 120);
    expect(t.climbPrompt()?.kind).toBe('low');
    t.action();
    run(w, STILL, () => t.state().kind === 'climb', 120);             // the push: the align's last tick lays the clip at 0
    expect(t.state().kind).toBe('climb');
    let ticks = 0;
    while (t.state().kind !== 'none' && ticks < 400) { w.tick(input); ticks++; }
    return { w, t, events, ticks };
  }
  const PUSH_PHASE = (k: number): number => (k * TICK) / (1.25 * (29 / 30));
  const CUT_TICK = Array.from({ length: 200 }, (_, k) => k).find((k) => PUSH_PHASE(k) > 0.9)!;
  const END_TICK = Math.ceil(1.25 * (29 / 30) ** 2 / TICK - 1e-9);

  it("CLIMB_NO_INTERRUPT is motion.rdr's NoInterrupt of each climb clip, as the golden holds it (motionTableFromArchive)", () => {
    const golden = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'golden/motion-rdr.json'), 'utf8')) as { columns: string[]; entries: unknown[][] };
    const at = golden.columns.indexOf('NoInterrupt');
    const row = (name: string): number => golden.entries.find((e) => e[0] === name)![at] as number;
    for (const [name, value] of Object.entries(CLIMB_NO_INTERRUPT)) expect(value, name).toBe(row(name));
    expect(Object.keys(CLIMB_NO_INTERRUPT).sort()).toEqual(['seal_climb_medium', 'seal_climb_over', 'seal_climbcrate', 'seal_hang2climbup', 'seal_stand2hang', 'seal_step_up']);
    expect(row('seal_p_climbcrate')).toBe(1);                            // the pistol's: never cut (PISTOL_CLIMB_CLIPS_READING)
    expect([CLIMB_CUT_READING, PISTOL_CLIMB_CLIPS_READING]).toEqual(['before', 'sub-node']);   // NU-1c B11 (was: 'rifle')
  });

  it('the stick held forward: the climb ends on the first command past phase 0.9, short of the full travel, settled on the top', () => {
    expect([CUT_TICK, END_TICK]).toEqual([66, 71]);
    const held = crate(FORWARD);
    const rest = crate(STILL);
    expect(rest.ticks).toBe(END_TICK);                                   // at rest: the path's end, unchanged
    expect(held.ticks).toBe(CUT_TICK);                                   // RED before B2: 71
    expect(held.events.map((e) => e.type)).toEqual(['climbStart', 'climbUp', 'climbEnd']);
    expect(held.w.state.y).toBeCloseTo(12, 6);                          // the floor pick: the crate's top
    expect(held.w.airborne).toBe(false);
  });

  it("the cut's tick hands the stick to the ground state at once: the walk moves on the cut's own tick", () => {
    const { grid, polys } = climbWorld(12, 4);
    const { w, t } = climber(polys, grid);
    run(w, FORWARD, () => t.climbPrompt() !== null, 120);
    t.action();
    run(w, STILL, () => t.state().kind === 'climb', 120);
    for (let k = 1; k < CUT_TICK; k++) w.tick(FORWARD);
    expect(t.state().kind).toBe('climb');
    const before = { ...w.state };
    w.tick(FORWARD);
    expect(t.state().kind).toBe('none');
    expect(w.state.z).toBeLessThan(before.z);                            // walked on (-z) the same tick
    expect(w.state.y).toBeCloseTo(12, 6);
    expect(before.z).toBeGreaterThan(crate(STILL).w.state.z + 1e-3);     // cut short of the full travel
  });

  it('a MoverSim twin: the room (MoverSim.apply) and the page (Walker.advance under prepare) cut on the same command, the feet the same at every command', () => {
    const { grid, polys } = climbWorld(12, 4);
    const make = () => {
      const w = new Walker(grid), t = new Traversal(grid, polys), sim = new MoverSim(w, t);
      w.place(0, 10, 12);
      w.state.yaw = 0;
      return { w, t, sim };
    };
    let seq = 0;
    const cmd = (forward: number, buttons = 0): Command => ({ seq: ++seq, forward, right: 0, yaw: 0, pitch: 0, turn: 0, buttons, stance: 0, weapon: 0 });
    const cmds = [...Array.from({ length: 40 }, () => cmd(1)), cmd(0, Button.Action), ...Array.from({ length: 160 }, () => cmd(1))];
    const room = make(), page = make();
    const roomRows: string[] = [], pageRows: string[] = [];
    const row = (m: ReturnType<typeof make>, c: Command): string =>
      `${c.seq} ${m.t.state().kind} ${m.w.state.x.toFixed(6)} ${m.w.state.y.toFixed(6)} ${m.w.state.z.toFixed(6)} ${m.w.stance}`;
    for (const c of cmds) { room.sim.apply(c); roomRows.push(row(room, c)); }
    let i = 0;
    while (i < cmds.length) {
      let c: Command | null = null;
      page.w.advance(TICK, STILL, () => { pageRows.push(row(page, c!)); }, () => { c = cmds[i++]!; return page.sim.prepare(c); });
    }
    expect(pageRows).toEqual(roomRows);
    const kinds = roomRows.map((r) => r.split(' ')[1]);
    const push = kinds.indexOf('climb'), end = kinds.indexOf('none', push);
    expect(push).toBe(40);                                               // the press's own command (NU-1c B10; was: > 40, after the align)
    expect(end - push).toBe(CUT_TICK);                                   // the cut's command, both ends
  });

  it('the turn past 0.1 of turn_maxrate cuts as the stick does; at 0.1 or under it does not', () => {
    const turned = (turn: number): number => {
      const { grid, polys } = climbWorld(12, 4);
      const { w, t } = climber(polys, grid);
      run(w, FORWARD, () => t.climbPrompt() !== null, 120);
      t.action();
      run(w, STILL, () => t.state().kind === 'climb', 120);
      w.turn = turn;
      let k = 0;
      while (t.state().kind !== 'none' && k < 400) { w.tick(STILL); k++; }
      return k;
    };
    expect(turned(0.11 * SEAL_TUNING.turnMaxRate)).toBe(CUT_TICK);
    expect(turned(0.1 * SEAL_TUNING.turnMaxRate)).toBe(END_TICK);
  });

  it('"Stand -> Hang" cut past 0.85 reveals the hang (the cut into the hang); the stick ahead then pulls up', () => {
    const { grid, polys } = climbWorld(30, 1);
    const { w, t, events } = climber(polys, grid);
    run(w, FORWARD, () => t.climbPrompt() !== null, 120);
    expect(t.climbPrompt()?.kind).toBe('high');
    t.action();
    run(w, STILL, () => t.state().kind === 'climb', 120);
    // seal_stand2hang: playback 1.4, 25 keys, NoInterrupt 0.85 -> the first command past 0.85 x 1.4 x 24/25 s.
    const cut = Array.from({ length: 200 }, (_, k) => k).find((k) => (k * TICK) / (1.4 * (24 / 25)) > 0.85)!;
    let k = 0;
    while (t.state().kind === 'climb' && k < 400) { w.tick({ forward: 0, right: 0.5, boost: false }); k++; }
    expect(k).toBe(cut);
    expect(t.state().kind).toBe('hang');
    expect(w.airborne).toBe(false);
    run(w, FORWARD, () => t.state().kind === 'none', 400);
    expect(events.map((e) => e.type)).toEqual(['climbStart', 'jumpWhoosh', 'pullUp', 'climbEnd']);
    expect(w.state.y).toBeCloseTo(30, 6);
  });
});

/**
 * NU-1a (research 313 sections 2.2 and 6, section 8.1 B4): a SEAL crouched at the press keeps the crouch through a step-up,
 * a crate or a medium climb -- the push pops to index 1 and writes the request crouch (`FUN_00588bc0` D:L446244-446274),
 * the climb's pop reveals the crouch base -- while the hang (D:L446105) and the climb over (D:L442152-442163) end
 * standing (`CLIMB_CROUCH_END_READING`).
 */
describe('NU-1a B4: a crouched climber keeps the crouch (research 313 section 6, R313.9)', () => {
  /** A climb pressed from `stance` at a box `h` high of `app`, run to its end with `input` held (the hang pulled up). */
  function climbed(h: number, app: number, stance: Stance, input: WalkInput = STILL): { w: Walker; t: Traversal; kind: string } {
    const polys = app === 5 ? [floor(-100, -100, 100, 100, 0), ...box(-10, -2, 10, 0, h, 5).slice(0, 4)] : climbWorld(h, app).polys;
    const grid = world(polys);
    const { w, t } = climber(polys, grid);
    w.stance = stance;
    run(w, FORWARD, () => t.climbPrompt() !== null, 240);
    const kind = t.climbPrompt()?.kind ?? 'none';
    t.action();
    w.tick(STILL);
    expect(w.stance).toBe('stand');                                      // the clip plays in state 0 (D:L442225-442277)
    run(w, input, () => t.state().kind === 'none' || t.state().kind === 'hang', 600);
    if (t.state().kind === 'hang') run(w, FORWARD, () => t.state().kind === 'none', 600);
    expect(t.state().kind).toBe('none');
    return { w, t, kind };
  }

  it('a crouched SEAL at a 12 crate ends crouched -- the request crouch, no transition played', () => {
    const { w, kind } = climbed(12, 4, 'crouch');
    expect(kind).toBe('low');
    expect(w.stance).toBe('crouch');                                     // RED before B4: 'stand'
    expect(w.pendingStance).toBeNull();
    expect(w.action).toBeNull();
    expect(w.state.y).toBeCloseTo(12, 6);
  });

  it('the step-up and the medium end crouched too; the hang and the climb over stand; a standing climber stands', () => {
    const ends = (h: number, app: number, stance: Stance): [string, Stance] => { const c = climbed(h, app, stance); return [c.kind, c.w.stance]; };
    expect(ends(8, 1, 'crouch')).toEqual(['step', 'crouch']);
    expect(ends(27, 3, 'crouch')).toEqual(['med', 'crouch']);
    expect(ends(18, 1, 'crouch')).toEqual(['low', 'crouch']);           // the crate / medium blend
    expect(ends(30, 1, 'crouch')).toEqual(['high', 'stand']);
    expect(ends(10, 5, 'crouch')).toEqual(['over', 'stand']);
    expect(ends(12, 4, 'stand')).toEqual(['low', 'stand']);
    expect(CLIMB_CROUCH_END_READING).toEqual(['step', 'low', 'med']);
  });

  it('cut by the stick (B2), the crouched crate climber ends crouched as well', () => {
    const { w } = climbed(12, 4, 'crouch', FORWARD);
    expect(w.stance).toBe('crouch');
    expect(w.action).toBeNull();
  });
});

/**
 * NU-1a (research 313 section 6, section 8.1 B9): each advance of the top play copies the stick into the ramp's last value
 * (`FUN_0057a330` D:L438704-438706: `+0x248` <- `+0x244`, `+0x24c` <- `+0x240`), which the ramp `FUN_00586c10`
 * (D:L444985-445010) starts from -- so the walk after a climb starts at the held stick, unramped
 * (`CLIMB_RESUME_STICK_READING`); the port's end zeroed it.
 */
describe("NU-1a B9: the climb's end keeps the stick's ramp at the held stick (research 313 section 6, R313.8)", () => {
  /** A walker's speed on the flat once steady at `forward` (the ramp run out): the held stick's own. */
  function steady(forward: number): number {
    const { grid, polys } = climbWorld(12, 4);
    const { w } = climber(polys, grid);
    w.place(50, 10, 60);
    for (let i = 0; i < 90; i++) w.tick({ forward, right: 0, boost: false });
    return Math.hypot(w.state.vx, w.state.vz);
  }
  function pressed(): { w: Walker; t: Traversal } {
    const { grid, polys } = climbWorld(12, 4);
    const { w, t } = climber(polys, grid);
    run(w, FORWARD, () => t.climbPrompt() !== null, 120);
    t.action();
    run(w, STILL, () => t.state().kind === 'climb', 120);
    return { w, t };
  }

  it("the stick held forward: the walk on the cut's tick runs at the held stick's speed, the ramp at 1", () => {
    const { w, t } = pressed();
    while (t.state().kind === 'climb') w.tick(FORWARD);
    expect(w.state.stickForward).toBe(1);                                 // RED before B9: the ramp from 0
    expect(Math.hypot(w.state.vx, w.state.vz)).toBeCloseTo(steady(1), 6);
  });

  it('held at 0.1 (no cut): the uncut end keeps 0.1, and the first walking command after it runs at 0.1 unramped', () => {
    const { w, t } = pressed();
    const held: WalkInput = { forward: 0.1, right: 0, boost: false };
    while (t.state().kind === 'climb') w.tick(held);
    expect(w.state.stickForward).toBeCloseTo(0.1, 9);                     // the end's tick: the last advance's copy
    w.tick(held);
    expect(w.state.stickForward).toBeCloseTo(0.1, 9);
    expect(Math.hypot(w.state.vx, w.state.vz)).toBeCloseTo(steady(0.1), 6);
    expect(CLIMB_RESUME_STICK_READING).toBe('held');
  });
});

/**
 * NU-1b B1 (research 313 sections 1.2-1.3, 8.1; `CLIMB_OFFER_GATE_READING`): the offer asks the original's gates through
 * one predicate on the mover (`climbOffered`), room and page alike -- `FUN_005b4340(actor, 2)` in the air and on the
 * ground (D:L469305-469475), the common gate `FUN_005a7de0(actor, 1, 0)` on the ground only (D:L452277-452290), and the
 * HUD's view-state gates (the binoculars and the scope, D:L452259-452262).
 */
describe("NU-1b B1: the climb's offer asks the original's gates (research 313 section 1.3)", () => {
  /** A walker stopped at the 12 crate's near side, the offer shown, its stick at rest. */
  function atCrate(stance: Stance = 'stand'): { w: Walker; t: Traversal; events: TraversalEvent[] } {
    const { grid, polys } = climbWorld(12, 4);
    const c = climber(polys, grid);
    c.w.stance = stance;
    run(c.w, FORWARD, () => c.t.climbPrompt() !== null, 240);
    for (let i = 0; i < 10; i++) c.w.tick(STILL);                         // at rest at the face: a still clip's speed
    expect(c.t.climbPrompt()?.kind).toBe('low');
    return c;
  }

  it("a crouched still reload's hold refuses the offer: no prompt, the press climbs nothing and the hold runs on", () => {
    const { w, t, events } = atCrate('crouch');
    expect(w.hold('seal_crouch_reload')).toBe(true);
    w.tick(STILL);
    expect(t.climbPrompt()).toBeNull();                                   // FUN_005a7ab0 (D:L469416, D:L462636)
    t.action();
    w.tick(STILL);
    expect(events).toEqual([]);                                           // RED before B1: climbStart, the hold ended
    expect(t.state().kind).toBe('none');
    expect(w.holding?.clip).toBe('seal_crouch_reload');
    run(w, STILL, () => w.holding === null, 400);
    w.tick(STILL);
    expect(t.climbPrompt()?.kind).toBe('low');                            // the hold over: offered again
  });

  it('the scope and the binoculars (Walker.scoped), a throw on top, the swap, the knock and the lock the mover does not carry each refuse it', () => {
    const refusedBy = (set: (w: Walker) => void): boolean => {
      const { w, t } = atCrate();
      set(w);
      w.tick(STILL);
      return t.climbPrompt() === null;
    };
    expect(refusedBy(() => undefined)).toBe(false);                       // the control
    expect(refusedBy((w) => { w.scoped = true; })).toBe(true);           // view state 4 and over (D:L452259-452262)
    expect(refusedBy((w) => { w.hold('seal_throwgrenade'); })).toBe(true);   // a throw on top, the ground (D:L462622-462631)
    expect(refusedBy((w) => { w.swapWeapon('pistol', false); })).toBe(true);  // a swap (D:L469412)
    expect(refusedBy((w) => { w.climbLock = () => true; })).toBe(true);  // the kit's timer, the launcher's set ... (the hook)
    expect(CLIMB_OFFER_GATE_READING).toBe('gated');
  });

  // LATER 220's last head (research 369 §1 term 9, §2): on the ground the common gate refuses a get-up (`FUN_00587f90`
  // D:L462679: `Get up forward` / `Get up backwards`), so `FUN_00593500` builds no climb (D:L452278-452307).
  it("LATER 220: a get-up on the ground refuses the offer (the common gate's term 9); its end offers it again", () => {
    const { w } = atCrate();
    w.knock([-5, 40, 0], 'fallBackwards');
    run(w, STILL, () => w.action?.name === 'getUpBackwards', 6 * 60);
    expect(w.action?.name).toBe('getUpBackwards');
    expect(w.airborne).toBe(false);
    expect(climbOffered(w), 'getting up').toBe(false);
    run(w, STILL, () => w.action === null, 240);
    expect(climbOffered(w), 'up').toBe(true);
  });

  // LATER 509 (research 369 §1 term 4): the common gate's throw term holds the rifle's throws and the four tosses -- the
  // pistol's throws and peek tosses are not among its words (D:L462622-462626 on D:L495211-495237), the port playing the
  // rifle's clips for them: with the pistol in hand (`Walker.pistolHand`) a throw on the ground leaves the climb offered.
  it("LATER 509: on the ground a pistol-hand throw or lean toss leaves the climb offered; a rifle's throw and the pistol's toss refuse it", () => {
    const offered = (clip: string, pistol: boolean): boolean => {
      const { w } = atCrate();
      w.pistolHand = () => pistol;
      expect(w.hold(clip), clip).toBe(true);
      return climbOffered(w);
    };
    expect(offered('seal_throwgrenade', true), 'the pistol\'s throw').toBe(true);
    expect(offered('seal_toss_rlean', true), 'the pistol\'s peek toss').toBe(true);
    expect(offered('seal_throwgrenade', false), 'the rifle\'s throw').toBe(false);
    expect(offered('seal_toss_rlean', false), 'the rifle\'s peek toss').toBe(false);
    expect(offered('seal_p_tossgrenade', true), 'the pistol\'s toss').toBe(false);
  });

  // The review's F1: the pistol's crouched throw plays the rifle's type (research 85 §8.1 item 3: no pistol record in the
  // set, `FUN_0058c820` D:L448176-448189), "Crouch throw grenade", term 4: the climb refused.
  it("LATER 509's review F1: a pistol-hand crouched throw refuses the climb (the rifle's type on top)", () => {
    const { w } = atCrate('crouch');
    w.pistolHand = () => true;
    expect(w.hold('seal_crouch_throwgrenade')).toBe(true);
    expect(climbOffered(w)).toBe(false);
  });

  it('the ground and the air apart: under the landing clip a throw on top refuses nothing (the common gate is the ground\'s), the still clip refuses both', () => {
    const { w } = atCrate();
    w.state.y = 30;
    // NU-1c B12: faced away for the drop -- the step-up runs from the offer in the air with no stick (CLIMB_STEP_UP_STICK_READING,
    // D:L452279-452290, D:L469266-469276), so a drop past the crate's top faced to it would step up; `climbOffered` reads no facing.
    w.state.yaw = 180;
    w.setAirborne(true, 0);
    run(w, STILL, () => !w.airborne, 120);
    expect(w.action?.name).toMatch(/^land/);                              // `Jump land` / `Jump land hard` (FUN_00587f10)
    expect(w.hold('seal_throwgrenade')).toBe(true);
    expect(climbOffered(w)).toBe(true);                                   // D:L452279-452290: no common gate there
    expect(w.hold('seal_crouch_reload')).toBe(false);                    // over a throw: refused (holdOverHold)
    w.climbLock = () => true;
    expect(climbOffered(w)).toBe(false);                                  // FUN_005b4340(actor, 2): both
  });
});

/**
 * NU-1b B3 (research 313 section 5, section 8.1; `CLIMB_PENDING_STANCE_READING`): a stance press during a climb's one-shot
 * is the mover's request (`changeStance`), kept by the body's owner while the climb plays (`FUN_00552ec0`
 * D:L418927-418930) and taken from the tick after its end; a press during `Stand -> Hang` or the hang is not this row's.
 */
describe('NU-1b B3: a stance press mid-climb waits for the end (research 313 section 5)', () => {
  function pushed(stance: Stance = 'stand', h = 12, app = 4): { w: Walker; t: Traversal } {
    const { grid, polys } = climbWorld(h, app);
    const { w, t } = climber(polys, grid);
    w.stance = stance;
    run(w, FORWARD, () => t.climbPrompt() !== null, 240);
    t.action();
    run(w, STILL, () => t.state().kind === 'climb', 120);
    return { w, t };
  }

  it('crouch pressed mid-climb: kept pending, the crouch transition from the tick after the end', () => {
    const { w, t } = pushed();
    for (let i = 0; i < 20; i++) w.tick(STILL);
    expect(t.stanceButton(w, 'crouch')).toBe(true);                      // RED before B3: false, the press dropped
    expect(w.pendingStance).toBe('crouch');
    expect(w.stance).toBe('stand');
    expect(w.effectiveAction().body?.family).toBe('move');               // the climb's one-shot owns the body
    run(w, STILL, () => t.state().kind === 'none', 400);
    expect(w.stance).toBe('stand');                                       // the end's own tick: not yet
    w.tick(STILL);
    expect(w.stance).toBe('crouch');
    expect(w.action?.name).toBe('standToCrouch');
    expect(CLIMB_PENDING_STANCE_READING).toBe('kept');
  });

  it("a crouched climber's request is crouch through the climb (D:L446244-446274): stand pressed mid-climb, it ends crouched and then stands", () => {
    const { w, t } = pushed('crouch');
    expect(w.pendingStance).toBe('crouch');
    expect(t.stanceButton(w, 'stand')).toBe(true);
    run(w, STILL, () => t.state().kind === 'none', 400);
    expect(w.stance).toBe('crouch');                                      // the crouch base revealed (B4)
    expect(w.pendingStance).toBe('stand');
    w.tick(STILL);
    expect(w.stance).toBe('stand');
    expect(w.action?.name).toBe('standToCrouch');                         // played backwards: the get-up
  });

  it('"Stand -> Hang" and the hang are not this row\'s: the press there is as before (D16)', () => {
    const { w, t } = pushed('stand', 30, 1);
    expect(t.stanceButton(w, 'crouch')).toBe(false);                     // during Stand -> Hang: dropped, as before
    run(w, STILL, () => t.state().kind === 'hang', 400);
    expect(t.stanceButton(w, 'crouch')).toBe(true);                      // the hang's own let-go (research 86 s3.7)
    expect(t.state().kind).toBe('hangDown');
  });
});

/**
 * NU-1b B7 (research 313 sections 4 and 8.1; `CLIMB_HIT_CANCELS_READING`): a non-lethal flinch over a running climb pops
 * it (`FUN_005a2690` D:L460011-460019: under a one-shot top, `FUN_0058a4d0` to the base, each pop the type's end handler
 * `FUN_00589aa0` D:L446582-446648) and plays alone; over `Stand -> Hang`, no settle (no case), the body handed to the fall.
 */
describe('NU-1b B7: a flinch over a running climb ends it (research 313 section 4)', () => {
  it("a hit at phase 0.5 of a crate climb: popped, settled at the floor pick, the walk's again", () => {
    const { grid, polys } = climbWorld(12, 4);
    const { w, t, events } = climber(polys, grid);
    run(w, FORWARD, () => t.climbPrompt() !== null, 120);
    t.action();
    run(w, STILL, () => t.state().kind === 'climb', 120);
    for (let k = 0; k < 36; k++) w.tick(STILL);                            // 36 / (1.25 x 29/30 x 60) = phase 0.497
    expect(w.state.y).toBeGreaterThan(1);
    const popped = t.flinchPop?.(w);
    expect(popped).toBe(true);                                            // RED before B7: no pop, the climb goes on
    expect(t.state().kind).toBe('none');
    expect(w.state.y).toBeCloseTo(0, 6);                                  // the floor pick: the ground in front of the crate
    expect(w.airborne).toBe(false);
    expect(events.at(-1)?.type).toBe('climbEnd');
    expect(CLIMB_HIT_CANCELS_READING).toBe('popped');
  });

  it('over "Stand -> Hang": popped with no settle, the body falls from where it was; over the hang itself nothing is popped', () => {
    const { grid, polys } = climbWorld(30, 1);
    const { w, t } = climber(polys, grid);
    run(w, FORWARD, () => t.climbPrompt() !== null, 120);
    t.action();
    run(w, STILL, () => t.state().kind === 'climb', 120);
    for (let k = 0; k < 40; k++) w.tick(STILL);
    const y = w.state.y;
    expect(y).toBeGreaterThan(1);
    expect(t.flinchPop?.(w)).toBe(true);
    expect(t.state().kind).toBe('none');
    expect(w.state.y).toBe(y);
    expect(w.airborne).toBe(true);
    run(w, STILL, () => !w.airborne, 200);
    expect(w.state.y).toBeCloseTo(0, 6);
    const hung = climber(polys, grid);
    run(hung.w, FORWARD, () => hung.t.climbPrompt() !== null, 120);
    hung.t.action();
    run(hung.w, STILL, () => hung.t.state().kind === 'hang', 400);
    expect(hung.t.flinchPop?.(hung.w) ?? false).toBe(false);   // research 313 s8.3
    expect(hung.t.state().kind).toBe('hang');
  });
});

/**
 * NU-1b review F3: the climb's clips as `motion.rdr` holds them, through the repository's reader (`motionTableFromArchive`
 * on the disc's `READERC.ZAR`): every clip of `CLIMB_BODY_CLIPS` carries a bare `NoFire` (the throw's and the fire's
 * refusal, `FUN_005a7de0` D:L462695-462705), the hang's loop is the only looped one -- so `FUN_005a2690` pops the hang's
 * jump down as the other one-shots (D:L460011) -- and `UseVelY` has no reader (`CLIMB_USEVELY_READING`).
 */
const READERC = fixture('RUN/READERC.ZAR');
describe.skipIf(!READERC)(`NU-1b review F3: the climb clips' motion.rdr rows${READERC ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it('every climb clip a bare NoFire; only seal_hang looped; seal_hang_jumpdown a one-shot (NoInterrupt 0.8)', () => {
    const t = motionTableFromArchive(READERC!)!;
    for (const clip of CLIMB_BODY_CLIPS) {
      expect(t.get(clip)?.noFire, clip).toBe(1);
      expect(t.get(clip)?.looped, clip).toBe(clip === 'seal_hang');
    }
    expect(t.get('seal_hang_jumpdown')?.noInterrupt).toBe(0.8);
    expect(CLIMB_USEVELY_READING).toBe('every climb clip');
  });

  it("a flinch over the jump down's push pops it -- no settle (no case in FUN_00589aa0), the fall from where it is; over its fall the clip is dropped, the fall goes on", () => {
    const { grid, polys } = climbWorld(30, 1);
    const { w, t } = climber(polys, grid);
    run(w, FORWARD, () => t.climbPrompt() !== null, 120);
    t.action();
    run(w, STILL, () => t.state().kind === 'hang', 400);
    expect(t.jump(w)).toBe(true);
    expect(t.state().kind).toBe('hangDown');
    w.tick(STILL);
    const y = w.state.y;
    expect(t.flinchPop(w)).toBe(true);                                    // RED before F3: false, the push plays on
    expect(t.state().kind).toBe('none');
    expect(w.state.y).toBe(y);
    expect(w.airborne).toBe(true);
    const again = climber(polys, grid);
    run(again.w, FORWARD, () => again.t.climbPrompt() !== null, 120);
    again.t.action();
    run(again.w, STILL, () => again.t.state().kind === 'hang', 400);
    again.t.jump(again.w);
    run(again.w, STILL, () => again.t.state().kind === 'hangDropFall', 60);
    expect(again.t.flinchPop(again.w)).toBe(true);
    expect(again.t.state().kind).toBe('none');
    expect(again.w.airborne).toBe(true);
  });
});

// SEGMENT-BODY (re-judged; research 217 s2.9): from x 938 the walk -z runs 3.55 off the east side face of the crate
// beside the lane (`crates1/prop01=prop01`, x 934.45, z 778.11-795.21); the body's -x side line (1.05 to 4.2 across)
// crosses it from its front, and with that hit the contact branch's look-ahead (`FUN_005483d0` D:L413686-413756: the feet
// + 6.5 along the move for the muzzle's 8.6 plus the move) meets the 11.9 crate's face first and zeroes the move 9.7 off
// it -- out of the centre's reach, so no contact and no offer. From x 939.3, 4.85 off the side face, the side line
// misses it and the centre meets the crate's face: the offer, as before. Owed: a capture of the walk up that lane.
describe.skipIf(!MP2)(`Frostfire climbables${MP2 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it("NU-1b B1: a crouched still reload's hold at the 11.9 crate refuses the offer; the hold over, the crate is offered", async () => {
    const map = await loadMap(new FsAssetSource(FIXTURES), 'RUN/MP2.ZDB');
    const grid = groundGrid(map.ground!);
    const w = new Walker(grid);
    const t = new Traversal(grid, groundPolygons(map.ground!));
    w.driver = t;
    expect(w.place(939.3, 115, 790)).toBe(true);                     // SEGMENT-BODY: 4.85 off prop01's side face (was 938)
    w.state.yaw = 0;
    w.stance = 'crouch';
    run(w, FORWARD, () => t.climbPrompt() !== null, 240);
    for (let i = 0; i < 10; i++) w.tick(STILL);
    expect(t.climbPrompt()?.kind).toBe('low');
    expect(w.hold('seal_crouch_reload')).toBe(true);
    t.action();
    w.tick(STILL);
    expect(t.state().kind).toBe('none');                                  // RED before B1: 'climbAlign'
    expect(w.holding?.clip).toBe('seal_crouch_reload');
    run(w, STILL, () => w.holding === null, 400);
    w.tick(STILL);
    expect(t.climbPrompt()?.kind).toBe('low');
  });

  it('climbs the 11.9 crate at x 922.8-940.6, z 761-778.1 (appflags 4) from x 938 and hangs onto the 30 container at x 680-720, z 640-680', async () => {
    const map = await loadMap(new FsAssetSource(FIXTURES), 'RUN/MP2.ZDB');
    const grid = groundGrid(map.ground!);
    const polys = groundPolygons(map.ground!);
    const w = new Walker(grid);
    const t = new Traversal(grid, polys);
    w.driver = t;
    expect(w.place(939.3, 115, 790)).toBe(true);                     // SEGMENT-BODY: 4.85 off prop01's side face (was 938)
    expect(w.state.y).toBe(100);
    w.state.yaw = 0;                                                 // facing -z, the crate side at z 778.1
    run(w, FORWARD, () => t.climbPrompt() !== null, 120);
    expect(t.climbPrompt()?.kind).toBe('low');
    t.action();
    w.tick(STILL);
    run(w, STILL, () => t.state().kind === 'none', 400);
    expect(w.state.y).toBeCloseTo(111.85, 2);
    expect(w.state.z).toBeLessThan(778.1);

    expect(w.place(700, 115, 700)).toBe(true);
    w.state.yaw = 0;
    run(w, FORWARD, () => t.climbPrompt() !== null, 120);
    expect(t.climbPrompt()?.kind).toBe('high');
    t.action();
    w.tick(FORWARD);
    run(w, FORWARD, () => t.state().kind === 'none', 800);
    expect(w.state.y).toBeCloseTo(130, 3);
  });
});

// LATER 526's review F7 (`Traversal.keep`): a peek's popped object is not let go by the take's pop (`mountPop` resets the
// traversal only when a move holds it, `./net/blast`), and the next tick writes it in place (`popped.wait = false`), so a
// kept plain-object field must be a copy: `restore` gives the value `keep` was given.
describe('LATER 526 review F7: keep copies the plain-object fields one level deep', () => {
  it("a peek's popped object written after keep() is as it was at keep time after restore()", () => {
    const polys = [floor(-100, -100, 100, 100, 0)];
    const t = new Traversal(world(polys), polys);
    const popped = { side: 1 as const, stance: 'stand' as Stance, time: 3, wait: true };
    (t as unknown as { popped: typeof popped }).popped = popped;
    const kept = t.keep();
    popped.wait = false;                                             // the next tick's write (`leanTick`: `popped.wait = false`)
    popped.time = 99;
    t.restore(kept);
    const back = (t as unknown as { popped: typeof popped }).popped;
    expect({ wait: back.wait, time: back.time }).toEqual({ wait: true, time: 3 });
  });
});

// ---- the peek (research 86 section 4) and the water (section 5) --------------------------------------------------

describe('the peek (research 86 section 4)', () => {
  const plain = (): { grid: Grid; polys: WorldPoly[] } => { const polys = [floor(-100, -100, 100, 100, 0)]; return { grid: world(polys), polys }; };

  it('eases the camera peek to the side at cam_peek_decay_rate 6, holds the lean clip, and holds the mover still', () => {
    const { grid, polys } = plain();
    const w = new Walker(grid);
    const t = new Traversal(grid, polys);
    w.driver = t;
    w.place(0, 10, 0);
    t.lean(1);
    for (let i = 0; i < 30; i++) w.tick(STILL);                      // half a second
    expect(t.peek()).toBeCloseTo(1 - Math.exp(-6 * 30 * TICK), 6);   // 0.95
    expect(t.pose()?.clip).toBe('seal_stand2rlean');
    const at = [w.state.x, w.state.z];
    for (let i = 0; i < 30; i++) w.tick(FORWARD);                    // no locomotion while peeking (FUN_005870e0 case 3)
    expect([w.state.x, w.state.z]).toEqual(at);
    t.lean(0);
    for (let i = 0; i < 60; i++) w.tick(STILL);
    expect(t.peek()).toBeLessThan(0.01);
    expect(t.pose()).toBeNull();
    t.lean(-1);
    w.stance = 'crouch';
    w.tick(STILL);
    expect(t.pose()?.clip).toBe('seal_crouch2llean');
    w.stance = 'prone';
    for (let i = 0; i < 30; i++) w.tick(STILL);
    expect(t.pose()?.clip).toBe('seal_prone2llean');
    expect(t.peek()).toBeLessThan(-0.9);                             // prone peeks shift the camera too (state 3)
  });

  it('a lean held through a heavy landing waits for the hit\'s NoInterrupt: its clock runs, then the peek cuts it (review 2, M-1)', () => {
    const { grid, polys } = plain();
    const w = new Walker(grid);
    const t = new Traversal(grid, polys);
    w.driver = t;
    w.place(0, 10, 0);
    w.random = () => 0.9;                                            // `Hit` (FUN_005af590's coin over 0.5)
    w.state.y = 100;
    w.setAirborne(true);
    t.lean(1);
    run(w, STILL, () => !w.airborne, 400);
    expect(w.action?.name).toBe('hit');
    const c = ACTION_CLIPS.hit, cut = c.noInterrupt * c.playback * ((c.frames - 1) / c.frames);
    let last = -1;
    while (w.action?.name === 'hit' && w.action.t <= cut) {
      expect(w.action.t).toBeGreaterThan(last);                     // the hit's clock advances each tick
      expect(t.pose()).toBeNull();                                   // and no lean shows over it
      last = w.action.t;
      w.tick(STILL);
    }
    expect(last).toBeGreaterThan(cut - 2 * TICK);
    run(w, STILL, () => t.pose() !== null, 30);
    expect(t.pose()?.clip).toBe('seal_stand2rlean');
    expect(w.action).toBeNull();                                     // PEEK_CUTS_ACTION_READING: the peek takes the stack's top
  });

  it('a kit hold refuses the peek until it ends (review 2, M-1)', () => {
    const { grid, polys } = plain();
    const w = new Walker(grid);
    const t = new Traversal(grid, polys);
    w.driver = t;
    w.place(0, 10, 0);
    expect(w.hold('seal_throwgrenade')).toBe(true);
    t.lean(1);
    for (let i = 0; i < 10; i++) { w.tick(STILL); expect(t.pose()).toBeNull(); }
    run(w, STILL, () => w.holding === null, 400);
    run(w, STILL, () => t.pose() !== null, 30);
    expect(t.pose()?.clip).toBe('seal_stand2rlean');
  });

  it("a peek already held goes on through the lean's toss: FUN_005b4340 skips FUN_00587c20 in state 3 (469345; review 3, A1)", () => {
    const { grid, polys } = plain();
    const w = new Walker(grid);
    const t = new Traversal(grid, polys);
    w.driver = t;
    w.place(0, 10, 0);
    t.lean(1);
    for (let i = 0; i < 60; i++) w.tick(STILL);
    expect(t.peeking()).toBe(1);
    const last = t.pose()!.frame;
    w.tick(STILL);
    expect(t.pose()?.frame).toBe(last);                             // held on its last key
    expect(w.hold('seal_toss_rlean')).toBe(true);                   // research 86 s4.4: the toss is thrown from the peek
    let ticks = 0;
    while (w.holding !== null) {
      w.tick(STILL);
      expect(t.peeking()).toBe(1);
      expect(t.peek()).toBeGreaterThan(0.99);
      expect(t.pose()?.clip).toBe('seal_stand2rlean');
      expect(t.pose()?.frame).toBe(last);
      ticks++;
    }
    expect(ticks).toBeGreaterThan(60);                              // the whole 1.2 s toss ran under the held peek
  });

  it.each([
    ['land', 10],
    ['landHard', 50],
  ] as const)('a lean held into `%s` waits for the landing clip to end: FUN_00587f10 refuses ids 10/11 (445626-445640; review 3, A1)', (clip, height) => {
    const { grid, polys } = plain();
    const w = new Walker(grid);
    const t = new Traversal(grid, polys);
    w.driver = t;
    w.place(0, 10, 0);
    w.state.y = height;
    w.setAirborne(true);
    t.lean(1);
    run(w, STILL, () => !w.airborne, 400);
    expect(w.action?.name).toBe(clip);
    let past = false, last = 0;
    while (w.action?.name === clip) {
      expect(t.pose()).toBeNull();                                  // no lean over the landing, even past NoInterrupt
      if (w.actionInterruptible()) past = true;
      last = w.action.t;
      w.tick(STILL);
    }
    expect(past).toBe(true);                                        // the clip's NoInterrupt (0 / 0.35) was passed
    expect(last).toBeGreaterThan(ACTION_SECONDS[clip] - 2 * TICK);  // and the clip played to its end, uncut
    expect(w.action).toBeNull();
    run(w, STILL, () => t.pose() !== null, 5);
    expect(t.pose()?.clip).toBe('seal_stand2rlean');
    expect(t.peeking()).toBe(1);
  });

  it("a jump pressed during a held peek is refused, not frozen: the lean clip is a one-shot on top (FUN_0057e1b0; review 4)", () => {
    const { grid, polys } = plain();
    const w = new Walker(grid);
    const t = new Traversal(grid, polys);
    w.driver = t;
    w.place(0, 10, 0);
    t.lean(1);
    for (let i = 0; i < 60; i++) w.tick(STILL);
    expect(t.peeking()).toBe(1);
    const y = w.state.y;
    expect(w.jump()).toBe(false);                                   // refused: WalkMode / MoverSim count no jump
    expect(w.action).toBeNull();
    for (let i = 0; i < 120; i++) {
      w.tick(STILL);
      expect(t.peeking()).toBe(1);                                  // the peek holds on, nothing stale under it
      expect(w.state.y).toBe(y);
    }
    t.lean(0);                                                      // released, the same press jumps
    for (let i = 0; i < 2; i++) w.tick(STILL);
    expect(w.jump()).toBe(true);
    expect(w.action?.name).toBe('jump');
    const t0 = w.action!.t;
    w.tick(STILL);
    expect(w.action!.t).toBeGreaterThan(t0);
  });

  it('a jump already on the mover refuses the peek in state 3 too: the jump / landing tests follow 469345 (review 4)', () => {
    const { grid, polys } = plain();
    const w = new Walker(grid);
    const t = new Traversal(grid, polys);
    w.driver = t;
    w.place(0, 10, 0);
    t.lean(1);
    for (let i = 0; i < 60; i++) w.tick(STILL);
    expect(t.peeking()).toBe(1);
    // A jump on the mover with the peek held (not a path the press takes now -- `topOneShot` refuses it -- but the
    // gate's own order): `leanRefused` runs in state 3, so the peek drops and the jump's clock runs.
    w.driver = null;
    expect(w.jump()).toBe(true);
    w.driver = t;
    let last = -1;
    for (let i = 0; i < 20 && w.action?.name === 'jump'; i++) {
      w.tick(STILL);
      expect(t.peeking()).toBe(0);
      expect(w.action === null || w.action.t > last).toBe(true);
      last = w.action?.t ?? last;
    }
    expect(last).toBeGreaterThan(0);
  });

  it("a stance press during a held peek ends the peek and plays no transition, the stance unchanged (FUN_00581660 D:L442436-442477, FUN_005817d0, FUN_00581c10: no case for state 3); with the d-pad still held the next tick peeks again from the held key (PEEK_REPUSH_KEY_READING)", () => {
    const { grid, polys } = plain();
    const w = new Walker(grid);
    const t = new Traversal(grid, polys);
    w.driver = t;
    w.place(0, 10, 0);
    t.lean(1);
    for (let i = 0; i < 60; i++) w.tick(STILL);
    expect(t.peeking()).toBe(1);
    const key = t.pose()!.frame;
    expect(key).toBeGreaterThan(0);                                 // the lean clip held on its last key
    for (const to of ['crouch', 'prone'] as const) {
      const cam = t.peek();
      // The press as the walk and the room route it (`WalkMode.setStance`, `MoverSim.stance`): to the peek, then the
      // d-pad read after the stance (D:L453431-453458) -- still held.
      expect(t.stanceButton(w, to)).toBe(true);
      t.lean(1);
      expect(t.peeking()).toBe(0);                                  // the stack popped: state 3 left
      expect(w.action).toBeNull();                                  // no transition: none of the three has a case for 3
      expect(w.stance).toBe('stand');                               // the stance under the peek, unchanged
      w.tick(STILL);                                                // the press's tick: the lean waits for the next
      expect(t.peeking()).toBe(0);
      expect(w.action).toBeNull();
      expect(w.stance).toBe('stand');
      expect(t.pose()?.clip).toBe('seal_stand2rlean');              // drawn from the held key: no flicker (PF.R39)
      expect(t.pose()?.frame).toBe(key);
      expect(t.peek()).toBeGreaterThanOrEqual(cam);                 // the camera's eased peek is not reset
      w.tick(STILL);                                                // the next tick: the held d-pad peeks again
      expect(t.peeking()).toBe(1);
      expect(t.pose()?.clip).toBe('seal_stand2rlean');
      expect(t.pose()?.frame).toBe(key);                            // from the held key, the rise not replayed
      expect(w.stance).toBe('stand');
      expect(w.action).toBeNull();
    }
    t.lean(0);                                                      // released: the same press changes the stance
    for (let i = 0; i < 2; i++) w.tick(STILL);
    expect(t.stanceButton(w, 'crouch')).toBe(false);
    w.changeStance('crouch');
    expect(w.action?.name).toBe('standToCrouch');
  });

  it("a still reload taken mid-peek plays over the lean: the peek continues, state 3 kept (D:L462925-462928: cVar7 is never 3)", () => {
    const { grid, polys } = plain();
    const w = new Walker(grid);
    const t = new Traversal(grid, polys);
    w.driver = t;
    w.place(0, 10, 0);
    w.stance = 'crouch';
    t.lean(1);
    for (let i = 0; i < 60; i++) w.tick(STILL);
    expect(t.peeking()).toBe(1);
    expect(t.pose()?.clip).toBe('seal_crouch2rlean');
    const key = t.pose()!.frame;
    // FUN_005a82e0: cVar1 = actor+0x174 (3, peeking), cVar7 = FUN_0057dc20 (the first posture down the stack that is
    // not 3): never equal mid-peek, so FUN_0058a4d0 does not pop, and FUN_00588bc0(actor, clip, cVar1, 0, 0) pushes the
    // reload over the lean in posture 3.
    expect(w.hold('seal_crouch_reload')).toBe(true);
    let ticks = 0;
    while (w.holding !== null) {
      expect(w.holding.clip).toBe('seal_crouch_reload');
      w.tick(STILL);
      expect(t.peeking()).toBe(1);                                  // state 3 kept through the reload
      expect(t.pose()?.clip).toBe('seal_crouch2rlean');
      expect(t.pose()?.frame).toBe(key);
      ticks++;
    }
    expect(ticks).toBeGreaterThan(60);                              // the whole reload ran over the held peek
    expect(t.peeking()).toBe(1);
    expect(w.hold('seal_toss_rlean')).toBe(true);                   // the lean's toss, the same way
    while (w.holding !== null) {
      w.tick(STILL);
      expect(t.peeking()).toBe(1);
    }
  });

  it("a stick held through a stance press under a peek does not move the SEAL on the press's tick, and the held lean peeks again the next (PEEK_REPUSH_KEY_READING)", () => {
    const { grid, polys } = plain();
    const w = new Walker(grid);
    const t = new Traversal(grid, polys);
    w.driver = t;
    w.place(0, 10, 0);
    t.lean(1);
    for (let i = 0; i < 60; i++) w.tick(STILL);
    expect(t.peeking()).toBe(1);
    const at = [w.state.x, w.state.z];
    expect(t.stanceButton(w, 'crouch')).toBe(true);
    t.lean(1);
    w.tick(FORWARD);                                                // the press's tick, the stick held forward
    expect([w.state.x, w.state.z]).toEqual(at);
    w.tick(FORWARD);
    expect(t.peeking()).toBe(1);                                    // the popped peek's re-push asks no still test
    expect([w.state.x, w.state.z]).toEqual(at);
  });

  it('does not start a peek on the move, or into a wall within the side ray (9.5 right, 7.8375 left)', () => {
    const polys = [floor(-100, -100, 100, 100, 0), quad([8, 0, -50, 8, 0, 50, 8, 30, 50, 8, 30, -50], 2)];
    const grid = world(polys);
    const w = new Walker(grid);
    const t = new Traversal(grid, polys);
    w.driver = t;
    w.place(0, 10, 0);
    w.state.yaw = 0;                                                 // right is +x: the wall 8 away
    t.lean(1);
    w.tick(STILL);
    expect(t.pose()).toBeNull();
    t.lean(-1);                                                      // left is clear
    w.tick(FORWARD);
    expect(t.pose()).toBeNull();                                     // moving: no peek
    w.tick(STILL);
    expect(t.pose()?.clip).toBe('seal_stand2llean');
  });

  it('a peek already held ends when a turn puts the side ray into a wall', () => {
    const polys = [floor(-100, -100, 100, 100, 0), quad([8, 0, -50, 8, 0, 50, 8, 30, 50, 8, 30, -50], 2)];
    const grid = world(polys);
    const w = new Walker(grid);
    const t = new Traversal(grid, polys);
    w.driver = t;
    w.place(0, 10, 0);
    w.state.yaw = 180;                                               // right is -x, away from the wall at x = 8
    t.lean(1);
    w.tick(STILL);
    expect(t.peeking()).toBe(1);
    w.state.yaw = 0;                                                 // right is +x, the ray meets the wall
    w.tick(STILL);
    expect(t.peeking()).toBe(0);
  });
});

describe('the water (research 86 section 5)', () => {
  /** The bed at 0, a water surface (material 11) over it at `depth`, x in -50..50. */
  const pool = (depth: number): { grid: Grid; polys: WorldPoly[] } => {
    const water = { ...floor(-50, -50, 50, 50, depth), material: 11 };
    const polys = [floor(-100, -100, 100, 100, 0), water];
    return { grid: world(polys), polys };
  };

  it('wades on the bed, the stick at clamp(1 - 0.05 depth, 0.75, 1), and stands the SEAL up in deep water', () => {
    const { grid, polys } = pool(6);
    const w = new Walker(grid);
    const t = new Traversal(grid, polys);
    w.driver = t;
    const events: TraversalEvent[] = [];
    t.on((e) => events.push(e));
    expect(w.place(0, 20, 0)).toBe(true);
    expect(w.state.y).toBe(0);                                       // the water is no floor
    w.state.yaw = 90;
    for (let i = 0; i < 60; i++) w.tick(FORWARD);
    expect(t.depth()).toBeCloseTo(6, 6);
    expect(events[0]).toEqual({ type: 'waterEnter', depth: 6 });
    expect(t.stickFactor(w)).toBeCloseTo(0.75, 6);                   // 1 - 0.3 = 0.7, floored at 0.75
    expect(Math.hypot(w.state.vx, w.state.vz)).toBeCloseTo(65 * 0.75, 1);
    w.stance = 'prone';
    w.tick(STILL);
    expect(w.stance).toBe('crouch');                                 // prone only to 2 deep
    const shallow = pool(1);
    const v = new Walker(shallow.grid);
    const u = new Traversal(shallow.grid, shallow.polys);
    v.driver = u;
    v.place(0, 20, 0);
    v.tick(STILL);
    expect(u.stickFactor(v)).toBeCloseTo(0.95, 6);
  });
});

describe('the stance press in water, as FUN_00581660 / FUN_00581990 take it (issue #22)', () => {
  const pool = (depth: number): { w: Walker; t: Traversal } => {
    const water = { ...floor(-50, -50, 50, 50, depth), material: 11 };
    const polys = [floor(-100, -100, 100, 100, 0), water];
    const grid = world(polys);
    const w = new Walker(grid);
    const t = new Traversal(grid, polys);
    w.driver = t;
    expect(w.place(0, 20, 0)).toBe(true);
    for (let i = 0; i < 60; i++) w.tick(STILL);
    return { w, t };
  };

  it('over 2 deep, a prone press crouches -- no prone clip, no root motion -- from crouch it changes nothing', () => {
    const { w } = pool(5);
    w.changeStance('prone');
    expect(w.stance).toBe('crouch');                                  // FUN_00581660 -> FUN_00581990 from stand
    expect(w.action?.name).toBe('standToCrouch');
    for (let i = 0; i < 120; i++) w.tick(STILL);
    const at = [w.state.x, w.state.z];
    w.changeStance('prone');                                          // crouched: FUN_00581990 finds stance 1, nothing
    expect(w.stance).toBe('crouch');
    expect(w.action).toBeNull();
    for (let i = 0; i < 360; i++) w.tick(STILL);
    expect([w.state.x, w.state.z]).toEqual(at);
  });

  it('over 8.5 deep, a prone or a crouch press stands (FUN_00581990 -> FUN_00581c10); 2 deep or less, prone as ever', () => {
    const deep = pool(9).w;
    deep.changeStance('crouch');
    expect(deep.stance).toBe('stand');
    expect(deep.action).toBeNull();
    deep.changeStance('prone');
    expect(deep.stance).toBe('stand');
    expect(deep.action).toBeNull();
    const shallow = pool(2).w;
    shallow.changeStance('prone');
    expect(shallow.stance).toBe('prone');
    expect(shallow.action?.name).toBe('standToProne');
  });
});

// LATER 434 (LATER 414's review, F4; research 87 1.13): deep water raises the stance word's bit where the original's
// per-frame states do -- prone over 2 deep (`FUN_005845c0` D:L443869: `+0x374` = 1, `+0x105f` bit 0, then
// `FUN_00581990`) and crouched over 8.5 deep (`FUN_00584c60` D:L444087). The press's water (`FUN_00581660` D:L442472,
// `FUN_00581990` D:L442580) is reached only after `FUN_00552ec0` accepts, which it refuses for a local SEAL: LATER 492.
describe('LATER 434: deep water raises the stance word one-time bit', () => {
  const pool = (depth: number): Walker => {
    const water = { ...floor(-50, -50, 50, 50, depth), material: 11 };
    const polys = [floor(-100, -100, 100, 100, 0), water];
    const grid = world(polys);
    const w = new Walker(grid);
    w.driver = new Traversal(grid, polys);
    expect(w.place(0, 20, 0)).toBe(true);
    for (let i = 0; i < 60; i++) w.tick(STILL);
    w.takeStanceTaken();
    return w;
  };

  it('prone over 2 deep: the tick that crouches the SEAL raises it (FUN_005845c0 D:L443869)', () => {
    const w = pool(5);
    w.stance = 'prone';
    expect(w.takeStanceTaken()).toBe(false);                          // the setter alone raises nothing
    w.tick(STILL);
    expect(w.stance).toBe('crouch');
    expect(w.takeStanceTaken()).toBe(true);
  });

  it('crouched over 8.5 deep: the tick that stands the SEAL raises it (FUN_00584c60 D:L444087)', () => {
    const w = pool(9);
    w.stance = 'crouch';
    expect(w.takeStanceTaken()).toBe(false);
    w.tick(STILL);
    expect(w.stance).toBe('stand');
    expect(w.takeStanceTaken()).toBe(true);
  });
});

// LATER 434, part 2 (research 87 1.13, §16): the four remaining setters, each read at the source with no port path it can
// be laid on yet -- named, never silent.
describe('LATER 434: the stance word bit at the setters the port has no path for (named)', () => {
  it('PICKUP BODY (FUN_00579a30 D:L438417, LATER 494), the crouch-move fallback (FUN_00584c60 D:L444287), the dive request (D:L418879: never the player)', () => {
    expect(STANCE_WORD_ACTION_CROUCH_READING).toBe('not raised: PICKUP BODY unported (LATER 494)');
    expect(STANCE_WORD_CROUCH_FALLBACK_READING).toBe('not raised: the clip is always held');
    expect(STANCE_WORD_DIVE_REQUEST_READING).toBe("never the player's: CSealCtrl's +0x30 answers 0");
  });
});

// LATER 434's review (434b, F1(b)): the prone crawl handler `FUN_00583500` over 1.5 deep crouches the SEAL with its word
// (D:L443490) on the frames `FUN_00586f00` answers 0 -- whenever the lateral move axis (`actor+0x244`, `cutStick.right`)
// is past 0.03 (D:L445057-445059; `FUN_0052eb60`'s 0.03, 0x3f3428).
describe('LATER 434: the prone crawl over 1.5 deep crouches the SEAL with its word (FUN_00583500 D:L443490)', () => {
  const pool = (depth: number): Walker => {
    const water = { ...floor(-50, -50, 50, 50, depth), material: 11 };
    const polys = [floor(-100, -100, 100, 100, 0), water];
    const grid = world(polys);
    const w = new Walker(grid);
    w.driver = new Traversal(grid, polys);
    expect(w.place(0, 20, 0)).toBe(true);
    for (let i = 0; i < 60; i++) w.tick(STILL);
    w.stance = 'prone';
    w.takeStanceTaken();
    return w;
  };

  it('1.75 deep, the lateral axis pushed: the tick crouches the SEAL and raises the bit', () => {
    const w = pool(1.75);
    w.tick({ forward: 0, right: 1, boost: false });
    expect(w.stance).toBe('crouch');
    expect(w.takeStanceTaken()).toBe(true);
  });

  it("1.75 deep, the stick idle: still prone, no bit (FUN_00586f00's magnitude within 0.03 answers 1)", () => {
    const w = pool(1.75);
    w.tick(STILL);
    expect(w.stance).toBe('prone');
    expect(w.takeStanceTaken()).toBe(false);
  });

  // 434b's re-look (F1): every branch of FUN_00586f00 answers 0 for a forward or back push past its band
  // (D:L445057-445085): forward >= 0.03 + turn^2 x 0.27, or <= -(0.045 + turn^2 x 0.455); the turn axis is +0x23c.
  it('1.75 deep, pushed straight forward: crouched with the bit; pushed back: crouched', () => {
    const a = pool(1.75);
    a.tick({ forward: 1, right: 0, boost: false });
    expect(a.stance).toBe('crouch');
    expect(a.takeStanceTaken()).toBe(true);
    const b = pool(1.75);
    b.tick({ forward: -1, right: 0, boost: false });
    expect(b.stance).toBe('crouch');
  });

  it('1.75 deep, turning only: still prone, no bit (the band answers 1 with no forward push)', () => {
    const w = pool(1.75);
    w.turn = SEAL_TUNING.turnMaxRate;
    w.tick(STILL);
    expect(w.stance).toBe('prone');
    expect(w.takeStanceTaken()).toBe(false);
  });

  // 434b's second re-look: the ground states keep `+0x105e` 0x08 (the last ground frame crawled or moved: the prone crawl
  // D:L443902-443903, the crouch and stand moves D:L444167-444168, D:L444190-444191, D:L444887-444888) and 0x10 (it
  // turned, D:L443930-443931), both cleared idle (D:L443967-443968); under 0x08 `FUN_00586f00` answers 0 for any
  // |forward| past 0.03, not the band.
  it('crawled forward 1.2 deep (0x08), then 1.75 deep with forward 0.2 at a full turn: crouched with the bit', () => {
    const shallow = { ...floor(-50, -50, 0, 50, 1.2), material: 11 };
    const deep = { ...floor(0, -50, 50, 50, 1.75), material: 11 };
    const polys = [floor(-100, -100, 100, 100, 0), shallow, deep];
    const grid = world(polys);
    const w = new Walker(grid);
    w.driver = new Traversal(grid, polys);
    expect(w.place(-25, 20, 0)).toBe(true);
    for (let i = 0; i < 30; i++) w.tick(STILL);
    w.stance = 'prone';
    w.takeStanceTaken();
    for (let i = 0; i < 30; i++) w.tick({ forward: 1, right: 0, boost: false });
    expect(w.stance).toBe('prone');                                    // 1.2 deep: the crawl, no demotion
    w.state.x = 25;                                                    // into the 1.75-deep pool, the memory kept
    w.turn = SEAL_TUNING.turnMaxRate;
    w.tick({ forward: 0.2, right: 0, boost: false });
    expect(w.stance).toBe('crouch');
    expect(w.takeStanceTaken()).toBe(true);
  });

  // 434b's third re-look: the crouch (`FUN_00584c60`) and stand (`FUN_00586570`) states write the memory as the prone
  // state does -- 0x08 on a moving frame (D:L444142-444143; D:L444887-444888, 444914-444915, 444939-444940), 0x10 on a
  // turn past 0.025 (D:L444231-444232; `FUN_00586050` D:L444696-444697), cleared idle (D:L444322-444323; `FUN_00586240`
  // D:L444783-444788).
  const standing = (depth: number): Walker => {
    const water = { ...floor(-50, -50, 50, 50, depth), material: 11 };
    const polys = [floor(-100, -100, 100, 100, 0), water];
    const grid = world(polys);
    const w = new Walker(grid);
    w.driver = new Traversal(grid, polys);
    expect(w.place(0, 20, 0)).toBe(true);
    for (let i = 0; i < 60; i++) w.tick(STILL);
    return w;
  };

  it('stood 1.75 deep, walked, released one frame (idle clears), then prone with forward 0.2 at a full turn: prone', () => {
    const w = standing(1.75);
    for (let i = 0; i < 5; i++) w.tick({ forward: 1, right: 0, boost: false });
    w.tick(STILL);                                                     // the stand state's idle: 0x08 and 0x10 cleared
    w.stance = 'prone';
    w.takeStanceTaken();
    w.turn = SEAL_TUNING.turnMaxRate;
    w.tick({ forward: 0.2, right: 0, boost: false });
    expect(w.stance).toBe('prone');                                    // the band: 0.2 short of 0.3 at a full turn
  });

  it('crouched 1.75 deep, walked, turned in place one frame (0x10), then prone with forward 0.2 at a full turn: prone', () => {
    const w = standing(1.75);
    w.stance = 'crouch';
    w.takeStanceTaken();
    for (let i = 0; i < 5; i++) w.tick({ forward: 1, right: 0, boost: false });
    w.turn = SEAL_TUNING.turnMaxRate;
    w.tick(STILL);                                                     // the crouch state's turn: 0x10 set, 0x08 cleared
    w.stance = 'prone';
    w.takeStanceTaken();
    w.turn = SEAL_TUNING.turnMaxRate;
    w.tick({ forward: 0.2, right: 0, boost: false });
    expect(w.stance).toBe('prone');
  });

  it('a fresh prone SEAL 1.75 deep at a full turn: forward 0.2 stays prone (the band, no memory), 0.4 crouches', () => {
    const a = pool(1.75);
    a.turn = SEAL_TUNING.turnMaxRate;
    a.tick({ forward: 0.2, right: 0, boost: false });
    expect(a.stance).toBe('prone');
    const b = pool(1.75);
    b.turn = SEAL_TUNING.turnMaxRate;
    b.tick({ forward: 0.4, right: 0, boost: false });
    expect(b.stance).toBe('crouch');
  });

  it("434b's re-look (F2): the prone state never asks the water's stick clamp (FUN_005b56c0): factor 1 at 1.0 deep", () => {
    const water = { ...floor(-50, -50, 50, 50, 1), material: 11 };
    const polys = [floor(-100, -100, 100, 100, 0), water];
    const grid = world(polys);
    const w = new Walker(grid);
    const t = new Traversal(grid, polys);
    w.driver = t;
    expect(w.place(0, 20, 0)).toBe(true);
    for (let i = 0; i < 30; i++) w.tick(STILL);
    w.stance = 'prone';
    w.tick(STILL);
    expect(t.stickFactor(w)).toBe(1);
  });
});

/**
 * Issue #22's three spawns: each is under water (5.3, 3.8 and 4.3 deep) on ground under 20 degrees, not a steep slope.
 * The maps are read from the served tree `npm run extract-maps` fills (`public/maps/RUN`), not the fixtures' three.
 */
const SERVED = resolve(FIXTURES, '../public/maps');
const WATER_SPAWNS = [['MP62', 'ENOWAPI'], ['MP64', 'SHADOW FALLS'], ['MP71', 'FISH HOOK']] as const;
for (const [m, name] of WATER_SPAWNS) {
  const there = existsSync(resolve(SERVED, `RUN/${m}.ZDB`));
  describe.skipIf(!there)(`${name}'s spawn A in the water (issue #22)${there ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
    it('a prone press crouches there and the SEAL stays put with no input', async () => {
      const map = await loadMap(new FsAssetSource(SERVED), `RUN/${m}.ZDB`);
      const grid = groundGrid(map.ground!);
      const w = new Walker(grid);
      const t = new Traversal(grid, groundPolygons(map.ground!));
      w.driver = t;
      if (PACK) { const sim = simClipsFromBytes(PACK, fixture('RUN/READERC.ZAR')); t.setClips(sim.clips, sim.table); w.actionRoots = sim.roots; }
      const stand = map.stand!;
      expect(w.place(stand.position[0], stand.floor! + 15.4, stand.position[2])).toBe(true);
      for (let i = 0; i < 60; i++) w.tick(STILL);
      expect(t.depth()).toBeGreaterThan(2);
      expect(t.depth()).toBeLessThan(8.5);
      const at = [w.state.x, w.state.z];
      w.changeStance('crouch');
      for (let i = 0; i < 90; i++) w.tick(STILL);
      const crouched = [w.state.x, w.state.z];
      w.changeStance('prone');                                        // the hold of C, or setStance('prone')
      expect(w.stance).toBe('crouch');
      expect(w.action).toBeNull();
      for (let i = 0; i < 360; i++) w.tick(STILL);                    // 6 s, no input
      expect([w.state.x, w.state.z]).toEqual(crouched);
      expect(Math.hypot(w.state.x - at[0]!, w.state.z - at[1]!)).toBeLessThan(3);   // the crouch clip's own root only
    });
  });
}

// ---- round 3: the head's "180" and slide, the hang's let-go (research 86 sections 2.4, 3.7) --------------------------

describe('the ladder head, as the game plays it (research 86 section 2.4)', () => {
  it('turns with "180" (0.883 s, by code) before the reversed climb-off when the SEAL faces the ladder from the deck', () => {
    const { grid, polys } = ladderWorld();
    const w = new Walker(grid);
    const t = new Traversal(grid, polys);
    w.driver = t;
    w.place(0, 60, -20); w.state.yaw = 180;                          // on the deck, walking toward the ladder (+z)
    run(w, FORWARD, () => t.state().kind !== 'none', 400);
    expect(t.state().kind).toBe('turn180');
    expect(t.pose()?.holdRootTurn).toBe(true);
    const ticks = run(w, STILL, () => t.state().kind !== 'turn180', 200);
    expect(ticks * TICK).toBeCloseTo(0.95 * (27 / 28) ** 2, 1);      // FUN_0028c4f0 on seal_180's 28 keys
    expect(((w.state.yaw % 360) + 360) % 360).toBeCloseTo(0, 6);     // facing the climb-off's way
    expect(t.state().kind).toBe('ladderMountTop');
    // Backing onto it needs no turn.
    const v = new Walker(grid), u = new Traversal(grid, polys);
    v.driver = u;
    v.place(0, 60, -20); v.state.yaw = 0;
    run(v, BACK, () => u.state().kind !== 'none', 400);
    expect(u.state().kind).toBe('ladderMountTop');
  });

  it('slides from the head with the action held in the reversed climb-off\'s last 0.2 (FUN_00582540)', () => {
    const { grid, polys } = ladderWorld();
    const w = new Walker(grid);
    const t = new Traversal(grid, polys);
    w.driver = t;
    w.place(0, 60, -20); w.state.yaw = 0;
    run(w, BACK, () => t.state().kind === 'ladderMountTop', 400);
    t.holdAction(true);
    run(w, STILL, () => t.state().kind !== 'ladderMountTop', 400);
    expect(t.state().kind).toBe('ladderSlide');                     // straight into "Ladderslide", no "Ladder -> slide"
    expect(w.state.z).toBeCloseTo(0.2 + LADDER_STANDOFF, 6);
    run(w, STILL, () => t.state().kind === 'none', 800);
    expect(w.state.y).toBe(0);
  });
});

describe('the hang, as the game plays it (research 86 section 3.7)', () => {
  const hanging = (): { w: Walker; t: Traversal; events: TraversalEvent[] } => {
    const { grid, polys } = climbWorld(30, 1);
    const k = climber(polys, grid);
    if (PACK) k.t.setClips(PACK_CLIPS(), null);                    // the disc's own clips: the push's real rise
    run(k.w, FORWARD, () => k.t.climbPrompt() !== null, 120);
    k.t.action();
    run(k.w, STILL, () => k.t.state().kind === 'hang', 400);
    return k;
  };

  it('holds with the stick at rest, and lets go on the stick back: the push off the wall, then the walk\'s fall', () => {
    const { w, t, events } = hanging();
    for (let i = 0; i < 120; i++) w.tick(STILL);
    expect(t.state().kind).toBe('hang');                            // no timer
    const z0 = w.state.z, y0 = w.state.y;
    w.tick(BACK);
    expect(t.state().kind).toBe('hangDown');
    run(w, STILL, () => t.state().kind !== 'hangDown', 200);
    expect(t.state().kind).toBe('hangDropFall');
    expect(w.state.z).toBeGreaterThan(z0);                          // pushed back from the wall
    if (PACK) expect(w.state.y).toBeGreaterThan(y0);                // the push rises (the root 18.82 up to 21.3)
    expect(w.airborne).toBe(true);
    expect(t.pose()?.clip).toBe('seal_hang_jumpdown');
    run(w, STILL, () => !w.airborne, 400);
    expect(w.state.y).toBe(0);
    expect(events.map((e) => e.type)).toContain('climbEnd');
  });

  it('lets go on the jump and on a crouch; climbs on a stand', () => {
    const a = hanging();
    expect(a.t.jump(a.w)).toBe(true);
    a.w.tick(STILL);
    expect(['hangDown', 'hangDropFall']).toContain(a.t.state().kind);
    const b = hanging();
    expect(b.t.stanceButton(b.w, 'crouch')).toBe(true);
    b.w.tick(STILL);
    expect(['hangDown', 'hangDropFall']).toContain(b.t.state().kind);
    const c = hanging();
    expect(c.t.stanceButton(c.w, 'stand')).toBe(true);
    expect(c.t.state().kind).toBe('hangUp');
    run(c.w, STILL, () => c.t.state().kind === 'none', 400);
    expect(c.w.state.y).toBeCloseTo(30, 6);
  });
});

describe('the climb, as the game weighs it (research 86 section 3.3)', () => {
  it('plays the crate and the medium as one play between 12 and 26.5, the crate at 1 - (h - 12) / 14.5', () => {
    const { grid, polys } = climbWorld(18, 1);
    const { w, t } = climber(polys, grid);
    run(w, FORWARD, () => t.climbPrompt() !== null, 120);
    t.action();
    run(w, STILL, () => t.state().kind === 'climb', 120);
    const pose = t.pose()!;
    expect(pose.clip).toBe('seal_climbcrate');
    expect(pose.blend?.clip).toBe('seal_climb_medium');
    expect(pose.blend?.weight).toBeCloseTo(1 - 6 / 14.5, 6);
    run(w, STILL, () => t.state().kind === 'none', 400);
    expect(w.state.y).toBeCloseTo(18, 6);
  });

  it('adds the contact material\'s FOOT_STEP_OFFSET to the height: 12.5 of grass is an 11.7 crate climb, not a blend', () => {
    const polys = [floor(-100, -100, 100, 100, 0), ...box(-10, -30, 10, 0, 12.5, 1).map((p) => ({ ...p, material: 4 }))];
    const grid = world(polys);
    const { w, t } = climber(polys, grid);
    run(w, FORWARD, () => t.climbPrompt() !== null, 120);
    t.action();
    run(w, STILL, () => t.state().kind === 'climb', 120);
    expect(t.pose()?.blend).toBeUndefined();
    expect(t.pose()?.clip).toBe('seal_climbcrate');
  });

  // The obstacle ray (`FUN_0054e430`, research 86 s3.3): at the crate's top + 0.5 it meets the plain wall standing 0.2
  // behind the ledge, and the offer weighs that wall (top 40, over the table's 32): no plan. PAR-21a F5: was titled "a
  // wall standing at the ledge's top replaces the contact, and a plain wall is not climbed" -- it never asserted the
  // stored contact, which the port does not replace (the drift below).
  it('the obstacle ray (FUN_0054e430): a plain wall standing at the ledge\'s top serves that tick\'s offer, and no climb plan is made', () => {
    const wall = quad([-10, 12, -0.2, 10, 12, -0.2, 10, 40, -0.2, -10, 40, -0.2], 2, 0, 'worldmodel/wall');
    const polys = [floor(-100, -100, 100, 100, 0), ...box(-10, -30, 10, 0, 12, 4), wall];
    const grid = world(polys);
    const { w, t } = climber(polys, grid);
    run(w, FORWARD, () => false, 60);
    expect(t.climbPrompt()).toBeNull();
    expect((t as unknown as { plan: unknown }).plan).toBeNull();
  });

  // PAR-21a F6: the ray's filter is the move solver's (D:L416775-416791, `moveHit`): a hit is refused when its material
  // is VOLUMETRIC or LIQUID (the material table's +0x3c bits 0 and 1) or its own normal's y is over max_slope (0.6428,
  // signed). A bush (BUSH_VOL, byte 42) standing at the ledge's top is refused, so the crate's own climb is offered.
  it('the obstacle ray refuses a VOLUMETRIC face at the ledge\'s top (a BUSH_VOL wall): the crate\'s climb is offered (RED on |n_y| and water only: no plan)', () => {
    const bush = { ...quad([-10, 12, -0.2, 10, 12, -0.2, 10, 40, -0.2, -10, 40, -0.2], 2, 0, 'worldmodel/bush'), material: 42 };
    const polys = [floor(-100, -100, 100, 100, 0), ...box(-10, -30, 10, 0, 12, 4), bush];
    const grid = world(polys);
    const { w, t } = climber(polys, grid);
    run(w, FORWARD, () => false, 60);
    expect(t.climbPrompt()?.kind).toBe('low');
  });

  // PAR-21a F6: a downward face behind the ledge, tilted toward the walker (normal y -0.68: under max_slope, signed, so
  // admitted -- its horizontal part 0.733 is a wall to `contactOf`), its top at 41.6: the offer weighs it, over the
  // table's 32, so no plan. Crouch-walked (the head line 12.138 under the face's foot at 12.3), so the face never stops
  // the walk. On the old filter (|n_y| 0.68 > 0.6428) it was refused and the crate offered.
  it('the obstacle ray admits a downward face behind the ledge at normal y -0.68 (signed against max_slope): no climb plan (RED on |n_y|: the crate offered)', () => {
    const ny = -0.68, nz = Math.sqrt(1 - ny * ny), len = 40;
    const z0 = -0.3 - 0.2 * (-ny / nz);                                     // at 12.5, the ray's height, z -0.3
    const [y1, z1] = [12.3 + nz * len, z0 + -ny * len];
    const lean = quad([-10, 12.3, z0, 10, 12.3, z0, 10, y1, z1, -10, y1, z1], 2, 0, 'worldmodel/overhang');
    const n = polygonNormal(lean.points)!;
    expect(n[1]).toBeCloseTo(ny, 6);
    expect(n[2]).toBeCloseTo(nz, 6);                                       // toward the walker, down
    const polys = [floor(-100, -100, 100, 100, 0), ...box(-10, -30, 10, 0, 12, 4), lean];
    const grid = world(polys);
    const { w, t } = climber(polys, grid);
    w.stance = 'crouch';
    const creep: WalkInput = { forward: 0.6, right: 0, boost: false };
    run(w, creep, () => false, 420);
    // Against the crate's face: SEGMENT-BODY (re-judged; was within 3.6, the disc's stand-off) the crouched centre's 9.43
    // (x 1.75, the body-frame z under 0 crouched) plus the move.
    expect(w.state.z).toBeLessThan(1.1 * 1.4 * 3.5 * 1.75 + 0.5);
    expect(t.climbPrompt()).toBeNull();
    expect((t as unknown as { plan: unknown }).plan).toBeNull();
  });

  // DRIFT (TA.R6), research 281 line 188 (the departure item "The obstacle ray's hit is stored in the original", lines
  // 188-210) and research 86 line 294 (s3.3, "The obstacle ray"): when the
  // ray's nearest hit is steep, not VOLUMETRIC or LIQUID and on another collider (D:L416775-416792), `FUN_0054e430`
  // STORES it as the contact (`FUN_005b0d30` at D:L416793). The port uses it for that tick's offer only and keeps the
  // crate's face stored. The assertion is the original's, so the test fails today. The stored contact is read through the
  // private field, as climbFacing reads `plan`. (SEGMENT-BODY checkpoints 1-3 met the wall with the head line's muzzle
  // reach and passed it; checkpoint 4's standing head line runs along the travel, `HEAD_LINE_MUZZLE_READING`.)
  it.fails('the obstacle ray stores its wall as the contact: after a tick at the ledge the stored contact is the wall behind it, as FUN_0054e430 stores it (D:L416793) [drift: the port keeps the crate\'s face]', () => {
    const wall = quad([-10, 12, -0.2, 10, 12, -0.2, 10, 40, -0.2, -10, 40, -0.2], 2, 0, 'worldmodel/wall');
    const polys = [floor(-100, -100, 100, 100, 0), ...box(-10, -30, 10, 0, 12, 4), wall];
    const grid = world(polys);
    const { w, t } = climber(polys, grid);
    run(w, FORWARD, () => w.wallHits().length > 0, 60);                   // the crate's face met: the contact next tick
    w.tick(STILL);
    const stored = (t as unknown as { contact: ClimbContact | null }).contact;
    expect(stored?.poly.path).toBe('worldmodel/wall');
  });
});

// ---- LATER 111: the top at the hit's column (research 313 section 8.8) --------------------------------------------

/**
 * A wedge from (x0, z0) to (x1, z1) on the 0 floor, its top sloping from `lo` at x0 to `hi` at x1: its four sides of
 * `appflags` (the near side at z1), its top a polygon (too steep to stand on at 45 degrees; nothing here walks it).
 */
function wedge(x0: number, z0: number, x1: number, z1: number, lo: number, hi: number, appflags: number): WorldPoly[] {
  return [
    quad([x0, 0, z1, x1, 0, z1, x1, hi, z1, x0, lo, z1], 2, appflags),
    quad([x0, 0, z0, x1, 0, z0, x1, hi, z0, x0, lo, z0], 2, appflags),
    quad([x0, 0, z0, x0, 0, z1, x0, lo, z1, x0, lo, z0], 2, appflags),
    quad([x1, 0, z0, x1, 0, z1, x1, hi, z1, x1, hi, z0], 2, appflags),
    quad([x0, lo, z0, x1, hi, z0, x1, hi, z1, x0, lo, z1], 3),
  ];
}

/** A walker on a wedge's hull at (x, 0, 12) facing -z, its near side at z 0. */
function wedgeClimber(lo: number, hi: number, x: number): { w: Walker; t: Traversal } {
  const polys = [floor(-100, -100, 100, 100, 0), ...wedge(-10, -30, 10, 0, lo, hi, 4)];
  const grid = world(polys);
  const w = new Walker(grid);
  const t = new Traversal(grid, polys);
  w.driver = t;
  w.place(x, 10, 12);
  w.state.yaw = 0;
  return { w, t };
}

describe("LATER 111: a climb face's top at the hit's column (FUN_002dbfb0, research 313 section 8.8)", () => {
  // `FUN_002dbfb0` (D:L180183-180212) -> `FUN_002dd4d0` / `FUN_002dd690` (D:L180890-181050): the top is the highest of
  // the edges' points at the hit's projection on each (strictly inside it); on a top sloping 20 to 40 across x -10..10,
  // the column at x -5 stands 25 -- h 25, the crate/medium blend at crate weight 0.10: 'med'. The port took the
  // polygon's highest point, 40: over the table's 32, nothing.
  it("R1: walked into a top sloping 20 to 40 at the column where it stands 25, the offer is 'med' (RED: nothing, the polygon's 40)", () => {
    const { w, t } = wedgeClimber(20, 40, -5);
    run(w, FORWARD, () => t.climbPrompt() !== null, 120);
    expect(t.climbPrompt()?.kind ?? null).toBe('med');
  });

  // The target (`FUN_005b2620` D:L468422 -> `FUN_002dc090` -> `FUN_002dd2b0`, D:L180803-180885): the polygon's cut at the
  // hit's height, its ends -10 and 10 both 3 or more from the hit at x -5, so `FUN_005b3a60` (D:L469016-469080) leaves
  // the hit's own point; its y the column top (`FUN_005b1a10` D:L467887). The port's top edge on a sloped top is the
  // highest vertex alone: it aimed at the high corner (10, 30, 0).
  it('R2: on a top sloping 10 to 30, met at x -5, the target is the hit at the column top, about (-5, 15, 0) (RED: the high corner, (10, 30, 0))', () => {
    const { w, t } = wedgeClimber(10, 30, -5);
    run(w, FORWARD, () => t.climbPrompt() !== null, 120);
    const plan = (t as unknown as { plan: { target: number[]; kind: string } | null }).plan;
    expect(plan?.target[0]).toBeCloseTo(-5, 1);
    expect(plan?.target[1]).toBeCloseTo(15, 1);
    expect(plan?.target[2]).toBeCloseTo(0, 1);
    expect(plan?.kind).toBe('low');                                    // h 15: crate weight 0.79
  });

  // R4 (`CLIMB_COLUMN_END_READING` 'inside', the controller's call between readings): at an outside corner the walk's hit
  // is the nearest point of the face's cut, its end vertex exactly -- a column no edge spans strictly, where
  // `FUN_002dbfb0` returns 0. The original's hits are segment crossings on the polygon (`FUN_002d4cc0` D:L175906-175960,
  // research 281 s4.1), which reach that branch at almost no point; the port takes the column just inside the face.
  it('R4: a hit at a level face\'s end vertex (an outside corner) keeps the offer -- the pin of reading \'inside\'', () => {
    const polys = [floor(-100, -100, 100, 100, 0), ...box(-10, -30, 10, 0, 12, 4)];
    const grid = world(polys);
    const c = contactFromHits([{ poly: polys[1]!, line: 0, x: 10, y: 6.5, z: 0 }], 12, 3)!;
    expect(c.top).toBeCloseTo(12, 6);
    expect(planClimb(grid, c, 12, 0, 3, 0, -1)?.kind).toBe('low');
    expect(CLIMB_COLUMN_END_READING).toBe('inside');                     // 'none' would leave no top here: no plan
  });

  it("R4: a hit at a sloped face's low end vertex takes the top just inside it: 20, 'med' (RED: nothing, the polygon's 40)", () => {
    const polys = [floor(-100, -100, 100, 100, 0), ...wedge(-10, -30, 10, 0, 20, 40, 4)];
    const grid = world(polys);
    const c = contactFromHits([{ poly: polys[1]!, line: 0, x: -10, y: 6.5, z: 0 }], -12, 3)!;
    // LATER 142 (`CLIMB_EDGE_INSET_PLACEHOLDER`, research 313 section 8.10): the hit at the cut's end is taken 0.01 inside
    // the cut, so the top is the slope's there -- 20 + 0.01 x (20 / 20), not the end vertex's 20. *Was:* 20.
    expect(c.top).toBeCloseTo(20.01, 4);
    expect(planClimb(grid, c, -12, 0, 3, 0, -1)?.kind).toBe('med');
  });
});

describe('the dive (research 86 section 6.1)', () => {
  const plain = (): { grid: Grid; polys: WorldPoly[] } => { const polys = [floor(-200, -200, 200, 200, 0)]; return { grid: world(polys), polys }; };

  // DIVE-ROOT (B201; research 86 section 6.1; reading, pending review). The hidden timer (`+0xfac`, seeded from the
  // stance's root by `FUN_0057e540` D:L440911) holds 0.2 s; at the hold's end `FUN_005af930` resets its speed `+0x133c`
  // to `+0x1364` (0, D:L466797-466802) and `FUN_0059b440` adds one airborne tick of gravity (D:L456496,
  // `DIVE_ROOT_SEED_READING`); landed by `FUN_0059ad30` (D:L456314-456322), the speed then grows by dt x 98.100006 a
  // tick on the ground (D:L456552-456557, `DIVE_ROOT_FALL_READING`), and `FUN_0059b870` lowers the timer by it to 2.2
  // (D:L456590-456603). Down, the carried speed bleeds at 150 (`FUN_0054d9a0` D:L416524-416547). *Was:* the timer fell
  // from rest at the table's 235 (research 86 section 6.1's old line), down at about 0.48 s, so the dive came to rest
  // 30-100 ms early and 1-4 u short against r0004 (DIVE-CHECK, seat ac, 2026-11-03).
  const diveRig = (input: WalkInput, crouch = false, place: [number, number] = [0, 150]): { w: Walker; t: Traversal } => {
    const { grid, polys } = plain();
    const w = new Walker(grid);
    const t = new Traversal(grid, polys);
    w.driver = t;
    w.place(place[0], 10, place[1]); w.state.yaw = 0;
    if (crouch) w.stance = 'crouch';
    run(w, input, () => false, 90);
    return { w, t };
  };
  /** The dive from where the rig stands: its speed at the press, its ticks to rest, its travel, the timer's touchdown. */
  const diveOut = (w: Walker, t: Traversal, dt = TICK, input: WalkInput = STILL): { v0: number; rest: number; travel: number; down: number; roots: number[] } => {
    const v0 = Math.hypot(w.state.vx, w.state.vz), x0 = w.state.x, z0 = w.state.z;
    expect(t.dive(w)).toBe(true);
    const timer = (): number => (t as unknown as { diving: { root: number } | null }).diving?.root ?? 0;
    let n = 0, down = -1;
    const roots: number[] = [];
    while (t.state().kind === 'dive' && n < 2000) {
      w.tick(input, dt); n++;
      roots.push(t.rootY() ?? NaN);
      if (down < 0 && timer() <= 2.2 + 1e-9) down = n * dt;
    }
    return { v0, rest: n * dt, travel: Math.hypot(w.state.x - x0, w.state.z - z0), down, roots };
  };
  /** The timer's touchdown after the hold: 9.284 (11.484 - 2.2) at the seed, gaining 98.1 a second. */
  const touchdown = (from: number): number => {
    const seed = SEAL_TUNING.gravity * GAME_FRAME_DT, g = 98.100006, h = from - 2.2;
    return 0.2 + (-seed + Math.sqrt(seed * seed + 2 * g * h)) / g;
  };

  it('DIVE-ROOT: the new constants are the reads -- 98.100006 on the ground, one airborne tick of 235 at the hold\'s end', () => {
    expect(DIVE_ROOT_FALL_READING).toBeCloseTo(98.100006, 5);
    expect(DIVE_ROOT_SEED_READING).toBeCloseTo(235 * (525 / 15734), 6);       // 7.841, one game frame of the table's 235
    expect(DIVE_END_BLEND_READING).toBe('the animator\'s own end');
  });

  it('dives from a run into prone: the timer down at the hold + its fall at the seed and 98.1 (about 0.56 s), the speed bled at 150 after (RED: 235 from rest, 0.48 s)', () => {
    const { w, t } = diveRig(FORWARD);
    const out = diveOut(w, t);
    expect(w.stance).toBe('prone');
    const that = touchdown(11.484);
    expect(that).toBeCloseTo(0.5624, 3);
    expect(out.down).toBeCloseTo(that, 1);
    expect(Math.abs(out.down - that)).toBeLessThanOrEqual(TICK + 1e-9);
    expect(Math.abs(out.rest - (that + out.v0 / 150))).toBeLessThanOrEqual(TICK + 1e-9);
    expect(out.travel).toBeCloseTo(out.v0 * that + (out.v0 * out.v0) / 300, 0);
  });

  // The press speeds are the original's on those runs, its carried `+0x1350` (`diveVel` in DIVE-CHECK's `pcsx2.csv`):
  // about 40 forward (38.7-41.8; the crouched runs 39.8) and about 34 backward (33.6-34.5). The forward runs did reach
  // the full run's 65; the speed fell to about 40 a frame or two before the dive because the run had reached the strip's
  // rise at x 992-997 (floor normal y 0.75-0.80), where the ground driver scales the stick to 0.59-0.64
  // (`FUN_00586570` -> `FUN_005b56c0`, D:L444865; review F1) -- the slope's, not the dive's: `FUN_0057e540` copies the
  // velocity as it is (`+0x38` to `+0x1350`, D:L440899-440901). The one run that dived before the rise carried 65.1.
  it('DIVE-CHECK bands (r0004, 24 runs): forward 24.7-28.8 u and backward 20.0-24.4 u, at rest 754-840 ms (RED: short and early)', () => {
    const fwd = diveRig(FORWARD);
    fwd.w.state.vx = 0; fwd.w.state.vz = -40;
    const f = diveOut(fwd.w, fwd.t);
    const bwd = diveRig(BACK, false, [0, -150]);
    bwd.w.state.vx = 0; bwd.w.state.vz = 34;
    const b = diveOut(bwd.w, bwd.t);
    expect(f.travel).toBeGreaterThanOrEqual(24.7); expect(f.travel).toBeLessThanOrEqual(28.8);
    expect(b.travel).toBeGreaterThanOrEqual(20.0); expect(b.travel).toBeLessThanOrEqual(24.4);
    for (const r of [f.rest, b.rest]) { expect(r * 1000).toBeGreaterThanOrEqual(754 - 17); expect(r * 1000).toBeLessThanOrEqual(840 + 17); }
  });

  it('from a full-stick crouch the dive is the standing dive: the crouch runs on the standing body (posture stand), the same timer, the same slide', () => {
    const stand = diveRig(FORWARD), crouch = diveRig(FORWARD, true);
    expect(crouch.w.stance).toBe('crouch');
    expect(crouch.w.posture).toBe('stand');
    // The same speed laid on both, so only the stance differs at the press.
    crouch.w.state.vx = stand.w.state.vx; crouch.w.state.vz = stand.w.state.vz;
    const a = diveOut(stand.w, stand.t), b = diveOut(crouch.w, crouch.t);
    expect(b.down).toBeCloseTo(a.down, 9);
    expect(b.rest).toBeCloseTo(a.rest, 9);
    expect(b.travel).toBeCloseTo(a.travel, 6);
    expect(b.roots).toEqual(a.roots);
  });

  it('R8 (the page\'s rate): the same dive at 30, 60 and 144 Hz page steps travels the same within 0.5 u and comes down together', () => {
    const outs = [1 / 30, 1 / 60, 1 / 144].map((dt) => {
      const { w, t } = diveRig(FORWARD);
      w.state.vx = 0; w.state.vz = -40;                                  // the same press speed on each
      return diveOut(w, t, dt);
    });
    for (const o of outs.slice(1)) {
      expect(Math.abs(o.travel - outs[0]!.travel)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(o.down - outs[0]!.down)).toBeLessThanOrEqual(1 / 30 + 1e-9);
      expect(Math.abs(o.rest - outs[0]!.rest)).toBeLessThanOrEqual(1 / 30 + 1e-9);
    }
    expect(outs[2]!.travel).toBeCloseTo(40 * touchdown(11.484) + (40 * 40) / 300, 0);
  });

  it('the camera\'s and the shot\'s root (Traversal.rootY) follows the drawn dive clip\'s root, and the pose hands the root to the clip (rootY null)', () => {
    const { w, t } = diveRig(FORWARD);
    const from = stanceRootY(w.posture);                                // the seam before the press
    expect(t.dive(w)).toBe(true);
    expect(t.rootY()).toBeCloseTo(from, 9);
    const fade = t.shapes.blendTime('seal_dive2prone');
    expect(fade).toBe(BLEND_TIME_DEFAULT);                              // no table: the animator's default too
    for (let i = 1; i <= 40; i++) {
      w.tick(STILL);
      const pose = t.pose()!;
      expect(pose.clip).toBe('seal_dive2prone');
      expect(pose.rootY).toBeNull();                                     // the animator draws the clip's own root
      const clip = rootAt(t.shapes.get('seal_dive2prone'), pose.frame)[1];
      // F2: the animator's cross-fade, first frame at weight 0 (`Animator.start`), then its clock by the frame.
      expect(t.rootY()).toBeCloseTo(from + (clip - from) * blendWeight(((i - 1) * TICK) / fade), 6);
    }
  });

  const DIVE_READERC = fixture('RUN/READERC.ZAR');
  const diveData = PACK !== null && DIVE_READERC !== null && MP2 !== null;
  describe.skipIf(!diveData)(`the drawn root against r0004 (DIVE-CHECK)${diveData ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
    // The original's root over the feet at 200 / 400 / 600 / 800 / 1000 / 1200 ms after the press, the ranges over
    // twelve runs (agent-mail evidence eph-hunt-2026-11-01/dive-check RESULTS.md, finding 1); 0.3 u of margin. 1000 ms
    // is held loosely: the dive has come to rest by then and its play's hand-off to the prone base is
    // `DIVE_END_BLEND_READING` (unread, the animator's own end).
    const BANDS: [ms: number, lo: number, hi: number][] = [
      [200, 8.41, 9.38], [400, 6.87, 7.37], [600, 6.12, 6.25], [800, 4.92, 5.35], [1000, 2.6, 4.6], [1200, 2.17, 2.18],
    ];
    const MARGIN = 0.3;

    // The second review's finding: at rest the body's next play is the ground word's -- a crawl with the stick held
    // (`loco:prone:<cls>`, the crawl's BlendTime, none: 0.4) or a turn (`turn:prone`, `seal_prone_turn`'s 0.9) -- and
    // the seam's end blend runs on the animator's clock for that play. What is left between them is the play's own root
    // against the stance's prone 2.168 (the crawl's 2.289, the turn's 2.266), as for any prone body crawling or turning.
    /** The look at rest, `k` frames past the dive's end: the yaw's step and the walker's turn rate (`Walker.turn`). */
    type Look = (k: number) => { dyaw: number; turn: number };
    const NO_LOOK: Look = () => ({ dyaw: 0, turn: 0 });
    const endCase = (after: WalkInput, look: Look = NO_LOOK): { drawn: number[]; seam: number[]; blend: number[]; plays: (string | undefined)[]; end: number } => {
      const table = motionTableFromArchive(DIVE_READERC!)!;
      const toc = parseZdb(MP2!);
      const sk = readSkeleton(Zar.parse(zdbMember(MP2!, toc, 'CLIB_GEO.ZED')), 'seal_A_scuba');
      const anim = new Animator(sk, clipsFromPack(PACK!, [...PLAY_CLIPS, ...TRAVERSAL_CLIPS]), table);
      const { w, t } = diveRig(FORWARD);
      t.setClips(PACK_CLIPS(), table);
      for (let i = 0; i < 30; i++) anim.step(TICK, moverSnapshot(w, t, 0, 0));
      w.state.vx = 0; w.state.vz = -40;
      expect(t.dive(w)).toBe(true);
      const drawn: number[] = [], seam: number[] = [], blend: number[] = [], plays: (string | undefined)[] = [];
      let end = -1;
      for (let i = 0; i < 110; i++) {
        // The page and the room set the look's yaw and the walker's turn before the tick (`walk.ts`, `net/moverSim.ts`).
        const l = end >= 0 ? look(i - end) : { dyaw: 0, turn: 0 };
        w.state.yaw += l.dyaw;
        w.turn = l.turn;
        w.tick(after);
        if (end < 0 && t.state().kind === 'none') end = i;
        anim.step(TICK, moverSnapshot(w, t, 0, w.turn));
        drawn.push(anim.rootY()!);
        seam.push(t.rootY() ?? stanceRootY(w.posture));
        blend.push(anim.stats().blend);
        plays.push(anim.stats().play ?? undefined);
      }
      return { drawn, seam, blend, plays, end };
    };
    /**
     * The seam on the animator's own clock from the dive's end: each play the animator starts restarts the fade from the
     * seam's last value, at the animator's weight, to the stance's prone root -- whichever play it chose.
     */
    const followsAnimator = (r: ReturnType<typeof endCase>, plays: string[]): void => {
      expect(r.end).toBeGreaterThan(0);
      for (const p of plays) expect(r.plays.slice(r.end), `the animator plays ${p}`).toContain(p);
      let from = r.seam[r.end - 1]!;
      expect(Math.abs(from - r.drawn[r.end - 1]!)).toBeLessThanOrEqual(0.02);
      for (let i = r.end; i < r.end + 60; i++) {
        if (r.plays[i] !== r.plays[i - 1]) from = r.seam[i - 1]!;
        expect(r.seam[i]!, `seam ${i - r.end} frames into the rest (${r.plays[i]})`).toBeCloseTo(from + (stanceRootY('prone') - from) * r.blend[i]!, 4);
      }
    };

    it('second review: the stick held through the rest -- the crawl\'s play next, its BlendTime 0.4 as the idle\'s -- the seam on its clock', () => {
      followsAnimator(endCase(FORWARD), ['loco:prone:1']);
    });

    it('a turn at rest (the walker\'s turn rate) -- `turn:prone`, seal_prone_turn\'s 0.9 -- the seam on its clock', () => {
      followsAnimator(endCase(STILL, () => ({ dyaw: 1.5 * TICK, turn: 1.5 })), ['turn:prone']);
    });

    it('third review F1: the room\'s turn rate trails the yaw by its 4-tick average -- the body stays in the turn after the yaw stops, and so does the seam (RED: the yaw\'s change)', () => {
      const r = endCase(STILL, (k) => ({ dyaw: k <= 10 ? 1.5 * TICK : 0, turn: k <= 14 ? 1.5 : 0 }));
      followsAnimator(r, ['turn:prone', 'idle:prone']);
    });

    it('third review F1: a yaw turned with no turn rate (the raw mouse look) leaves the body idle, and the seam (RED: the yaw\'s change)', () => {
      const r = endCase(STILL, () => ({ dyaw: 1.5 * TICK, turn: 0 }));
      expect(r.plays.slice(r.end)).not.toContain('turn:prone');
      followsAnimator(r, ['idle:prone']);
      for (let i = r.end; i < r.end + 60; i++) expect(Math.abs(r.drawn[i]! - r.seam[i]!)).toBeLessThanOrEqual(0.02);
    });

    it('the idle at rest: the seam is the drawn body through the end blend (the first fold\'s F2)', () => {
      const r = endCase(STILL);
      followsAnimator(r, ['idle:prone']);
      for (let i = r.end; i < r.end + 60; i++) expect(Math.abs(r.drawn[i]! - r.seam[i]!)).toBeLessThanOrEqual(0.02);
    });

    it("seal_dive2prone's own root (MOTION_P.ZAR, motion.rdr 1.6 -> 1.406 s): 9.76 at key 0, 2.13 at key 15", () => {
      const table = motionTableFromArchive(DIVE_READERC!)!;
      const t = new Traversal(world([floor(-10, -10, 10, 10, 0)]), []);
      t.setClips(PACK_CLIPS(), table);
      const shape = t.shapes.get('seal_dive2prone');
      expect(shape.keys).toBe(16);
      expect(shape.seconds).toBeCloseTo(1.6 * (15 / 16) ** 2, 6);
      expect(rootAt(shape, 0)[1]).toBeCloseTo(9.76, 2);
      expect(rootAt(shape, 15)[1]).toBeCloseTo(2.13, 2);
    });

    it('the drawn root (the animator, which the camera stands on) and the seams\' root are within the capture\'s bands (RED: 2.2 by 600 ms)', () => {
      const table = motionTableFromArchive(DIVE_READERC!)!;
      const toc = parseZdb(MP2!);
      const sk = readSkeleton(Zar.parse(zdbMember(MP2!, toc, 'CLIB_GEO.ZED')), 'seal_A_scuba');
      const anim = new Animator(sk, clipsFromPack(PACK!, [...PLAY_CLIPS, ...TRAVERSAL_CLIPS]), table);
      const { w, t } = diveRig(FORWARD);
      t.setClips(PACK_CLIPS(), table);
      for (let i = 0; i < 30; i++) anim.step(TICK, moverSnapshot(w, t, 0, 0));   // the run's play settled
      w.state.vx = 0; w.state.vz = -40;                                   // the capture's press speed (above)
      const before = anim.rootY()!, from = stanceRootY(w.posture);        // the drawn run's root; the seam's
      expect(t.dive(w)).toBe(true);
      const fade = t.shapes.blendTime('seal_dive2prone');
      expect(fade).toBeCloseTo(0.2, 6);                                    // motion.rdr's BlendTime
      const drawn: number[] = [], seam: number[] = [];
      for (let i = 1; i <= 78; i++) {                                     // 1300 ms at 60 Hz
        w.tick(STILL);
        anim.step(TICK, moverSnapshot(w, t, 0, 0));
        drawn.push(anim.rootY()!);
        seam.push(t.rootY() ?? stanceRootY(w.posture));
      }
      // Review F2: the seam (the hit volume, the shot's eye, the bots' aim) is the drawn body through the blend-in and
      // the end blend into prone. In the blend-in the one difference left is where each starts: the drawn body from the
      // run's posed root, the seam from the stance's (the server has no posed root: the seam a runner has always had),
      // faded out by the same weight.
      for (let i = 1; i <= 78; i++) {
        const left = 1 - blendWeight(((i - 1) * TICK) / fade);
        expect(Math.abs(seam[i - 1]! - drawn[i - 1]! - left * (from - before)), `seam at ${Math.round(i * TICK * 1000)} ms`).toBeLessThanOrEqual(0.02);
      }
      for (const [ms, lo, hi] of BANDS) {
        const k = Math.round(ms / 1000 / TICK) - 1;
        expect(drawn[k], `drawn at ${ms} ms`).toBeGreaterThanOrEqual(lo - MARGIN);
        expect(drawn[k], `drawn at ${ms} ms`).toBeLessThanOrEqual(hi + MARGIN);
        expect(seam[k], `seam at ${ms} ms`).toBeGreaterThanOrEqual(lo - MARGIN);
        expect(seam[k], `seam at ${ms} ms`).toBeLessThanOrEqual(hi + MARGIN);
      }
    });
  });

  // The capture's one run that dived at 65.1 (move stand-fwd t3) pressed before the rise but crossed the 0.754 slope during
  // the dive (y -148.3 to -135.5, peaking at 97.7 u/s): its 49.95 u agrees with the flat model's 50.6 by coincidence,
  // not as a flat-ground match. F1 stands on `FUN_0057e540`'s copy (D:L440899-440901) and the slope's stick scale.
  it('review F1: the dive carries the speed at the press -- from a full run on the flat (about 65) it slides v0 x 0.562 + v0^2 / 300, about 50.6 u', () => {
    const { w, t } = diveRig(FORWARD);
    const out = diveOut(w, t);
    expect(out.v0).toBeGreaterThan(60);
    expect(out.travel).toBeCloseTo(out.v0 * touchdown(11.484) + (out.v0 * out.v0) / 300, 0);
    expect(out.travel).toBeCloseTo(50.6, 0);
  });

  it('third review F2: the seam does not hang on when it is read -- every tick against now and then, a stance change between ticks (RED: a lazy first read)', () => {
    const play = (every: number): Map<string, number | null> => {
      const { w, t } = diveRig(FORWARD);
      w.state.vx = 0; w.state.vz = -40;
      expect(t.dive(w)).toBe(true);
      const reads = new Map<string, number | null>();
      let end = -1;
      for (let i = 0; i < 120; i++) {
        w.state.yaw += i % 3 === 0 ? 0.02 : 0;
        w.turn = i % 5 === 0 ? 1 : 0;
        w.tick(STILL);
        if (end < 0 && t.state().kind === 'none') end = i;
        if (i % every === 0) reads.set(`tick ${i}`, t.rootY());
        if (end >= 0 && i === end + 5) {
          w.changeStance('crouch');                                       // between ticks: the body leaves prone
          reads.set('after the change', t.rootY());
        }
      }
      return reads;
    };
    const often = play(1), seldom = play(7);
    expect(seldom.size).toBeGreaterThan(10);
    for (const [at, v] of seldom) expect(often.get(at), at).toBe(v);
  });

  it('is refused walking (under 30 a second), prone, or in water over 2 deep', () => {
    const { grid, polys } = plain();
    const w = new Walker(grid);
    const t = new Traversal(grid, polys);
    w.driver = t;
    w.place(0, 10, 100); w.state.yaw = 0;
    run(w, { forward: 0.3, right: 0, boost: false }, () => false, 60);
    expect(t.dive(w)).toBe(false);
    w.stance = 'prone';
    expect(t.dive(w)).toBe(false);
  });
});

describe('the ground and the water on the stick, and the ripples (research 86 section 5.3)', () => {
  it('slows each axis going uphill by 1 - d^2 (FUN_005b56c0), not downhill or across', () => {
    // A 30-degree ramp rising toward -z: its normal (0, cos 30, sin 30) tilts toward +z, back at a mover going up it.
    const k = Math.tan(Math.PI / 6);
    const ramp = quad([-100, 0, 0, 100, 0, 0, 100, 100 * k, -100, -100, 100 * k, -100], 3);
    const polys = [ramp, floor(-100, 0, 100, 100, 0)];
    const grid = world(polys);
    const w = new Walker(grid);
    const t = new Traversal(grid, polys);
    w.driver = t;
    w.place(0, 60, -40); w.state.yaw = 0;
    const d = Math.sin(Math.PI / 6);
    const [up] = t.stickScale(w, 1, 0);
    expect(up).toBeCloseTo(1 - d * d, 3);                            // 0.75 up a 30-degree ramp
    expect(t.stickScale(w, -1, 0)[0]).toBeCloseTo(-1, 6);           // down it: no factor
    expect(t.stickScale(w, 0, 1)[1]).toBeCloseTo(1, 6);             // across it: no factor
  });

  it('asks for the big ripple with the water between the feet and the body\'s top, the small within 10 over it', () => {
    const at = (depth: number, pace = 0): ReturnType<Traversal['ripple']> => {
      const water = { ...floor(-50, -50, 50, 50, depth), material: 11 };
      const polys = [floor(-100, -100, 100, 100, 0), water];
      const grid = world(polys);
      const w = new Walker(grid);
      const t = new Traversal(grid, polys);
      w.driver = t;
      w.place(0, 40, 0); w.state.yaw = 0;
      for (let i = 0; i < 30; i++) w.tick({ forward: pace, right: 0, boost: false });
      return t.ripple();
    };
    expect(at(6)).toEqual({ size: 'big', pace: 'anim', at: [0, 6, 0] });
    expect(at(6, 1)?.pace).toBe('run');
    expect(at(25)?.size).toBe('small');                            // over the 19.6 top, within 10
    expect(at(35)).toBeNull();                                      // 10 or more over it: nothing
    expect(rippleAnimation({ size: 'big', pace: 'walk' })).toBe('big_ripple_anim_walk');
    expect(rippleAnimation({ size: 'small', pace: 'anim' })).toBe('small_ripple_anim');
  });
});

describe('place() from the feet + PROBE_LIFT is the tick\'s own pick (PL-2; FUN_005b5d40 470230-470240, research 86 s6.3)', () => {
  it('over two floors 12 apart, a record lifted a unit (FUN_002b8100 158793) stands on the lower; from the eye it stood on the object', () => {
    const grid = world([floor(-200, -200, 200, 200, 0), floor(-20, -20, 20, 20, 12)]);
    const w = new Walker(grid);
    expect(w.place(0, 1 + PROBE_LIFT, 0)).toBe(true);
    expect(w.state.y).toBe(0);                                             // the tick's window ends at feet + 6
    expect(w.place(0, 1 + EYE_HEIGHT, 0)).toBe(true);
    expect(w.state.y).toBe(12);                                            // the old origin (feet + 16.4) took the crate
  });
});

describe("the peek's gate cites the game's own refusals (M-1 of review 2, the citation nit)", () => {
  it('leanTick names the carry and the jump / landing tests of FUN_005b4340, with their lines (review 3, A1)', () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/traversal.ts'), 'utf8');
    const doc = src.slice(src.lastIndexOf('/**', src.indexOf('private leanTick(')), src.indexOf('private leanTick('));
    const flat = doc.replace(/\s*\n\s*\*\s*/g, ' ');
    expect(flat).toMatch(/not in a jump or a landing clip \(ids 8\/9 `FUN_00587f50`, 10\/11 `FUN_00587f10`, 469348-469349/);
    expect(flat).toMatch(/`\+0xeac`, 469340/);
    expect(flat).toMatch(/`state == 3 \|\|`, 469345/);
    expect(flat).toMatch(/PEEK_HOLD_CONTINUES_READING/);
    expect(flat).toMatch(/Only that test is skipped: the ground, the jump and the landing tests \(469347-469353\) follow it and run in state 3 as well/);   // review 4
    expect(flat).toMatch(/PEEK_STANCE_ENDS_PEEK_READING/);
    expect(flat).not.toMatch(/reloading/);                        // f10 tests the landing clips, not a reload
    expect(flat).not.toMatch(/carries the reload's refusal/);
    expect(flat).not.toMatch(/not in the kit's one-shot \(the hold\)/);
  });
});

// LATER 414 (research 87 1.13's cases): the stance word's one-time bit (`actor+0x105f` bit 0), raised where the original
// raises it -- a spawn (`FUN_00553ea0`), a stance taken (`FUN_00552d60` once `FUN_00552ec0` accepts: a toggle, the dive's
// prone once the body is free) -- and not by the motion code's own writes (a climb's state 0 and its pop, a ladder's
// push), read once by the HUD (`Walker.takeStanceTaken`).
describe('LATER 414: the stance word one-time bit', () => {
  const plain = (): { grid: Grid; polys: WorldPoly[] } => { const polys = [floor(-200, -200, 200, 200, 0)]; return { grid: world(polys), polys }; };

  it('a spawn raises it once; a toggle taken raises it again; a read clears it', () => {
    const { grid } = plain();
    const w = new Walker(grid);
    w.place(0, 10, 0);
    expect(w.takeStanceTaken()).toBe(true);                              // the spawn's word (FUN_00553ea0 D:L419779)
    expect(w.takeStanceTaken()).toBe(false);
    w.changeStance('crouch');
    expect(w.takeStanceTaken()).toBe(true);
    expect(w.takeStanceTaken()).toBe(false);
  });

  it('a dive: no word at its start; PRONE taken once the dive is down and at rest', () => {
    const { grid, polys } = plain();
    const w = new Walker(grid);
    const t = new Traversal(grid, polys);
    w.driver = t;
    w.place(0, 10, 100); w.state.yaw = 0;
    run(w, FORWARD, () => Math.hypot(w.state.vx, w.state.vz) > 60, 60);
    w.takeStanceTaken();
    expect(t.dive(w)).toBe(true);
    expect(w.takeStanceTaken()).toBe(false);                             // the request only (FUN_0057e540 D:L440912)
    let early = false;
    run(w, FORWARD, () => { early ||= t.state().kind !== 'none' && w.takeStanceTaken(); return t.state().kind === 'none'; }, 200);
    expect(early).toBe(false);
    expect(w.takeStanceTaken()).toBe(true);                              // the take, the dive over
  });

  it('a crouched climb: no word at its start, its end or between (the pop restores the crouch, nothing taken)', () => {
    const polys = climbWorld(12, 4).polys;
    const grid = world(polys);
    const { w, t } = climber(polys, grid);
    w.stance = 'crouch';
    run(w, FORWARD, () => t.climbPrompt() !== null, 240);
    w.takeStanceTaken();
    t.action();
    let seen = false;
    run(w, STILL, () => { seen ||= w.takeStanceTaken(); return t.state().kind === 'none'; }, 600);
    expect(w.stance).toBe('crouch');
    expect(seen).toBe(false);
  });

  it('a crouch run at full stick: the body stands, the stance stays crouch, no word (the request untouched)', () => {
    const { grid } = plain();
    const w = new Walker(grid);
    w.place(0, 10, 100); w.state.yaw = 0;
    w.changeStance('crouch');
    run(w, STILL, () => w.stance === 'crouch', 60);
    expect(w.stance).toBe('crouch');
    w.takeStanceTaken();
    let seen = false;
    run(w, FORWARD, () => { seen ||= w.takeStanceTaken(); return w.posture === 'stand'; }, 120);
    expect(w.posture).toBe('stand');                                     // the crouch run's body (FUN_00584c60)
    expect(w.stance).toBe('crouch');
    expect(seen).toBe(false);
  });

  it('a press kept while the crouched reload owns the body: no word while pending; the word when the retry takes it', () => {
    const { grid } = plain();
    const w = new Walker(grid);
    expect(w.place(0, 2, 0)).toBe(true);
    w.stance = 'crouch';
    expect(w.hold('seal_crouch_reload', 1.9)).toBe(true);
    w.takeStanceTaken();
    w.changeStance('stand');
    expect(w.pendingStance).toBe('stand');
    expect(w.takeStanceTaken()).toBe(false);                             // kept (FUN_00552ec0 D:L418927-418930): no bit
    let early = false;
    run(w, STILL, () => { if (w.stance === 'stand') return true; early ||= w.takeStanceTaken(); return false; }, 200);
    expect(early).toBe(false);
    expect(w.stance).toBe('stand');
    expect(w.takeStanceTaken()).toBe(true);                              // the retry's take (FUN_00552d60) raises it
  });

  it('a crouched ladder mount: no word (FUN_0057f880 pushes the ladder clips, no request, no bit)', () => {
    const { grid, polys } = ladderWorld();
    const w = new Walker(grid);
    const t = new Traversal(grid, polys);
    w.driver = t;
    w.place(0, 10, 20);
    w.state.yaw = 0;
    w.changeStance('crouch');
    run(w, STILL, () => w.stance === 'crouch', 60);
    expect(w.stance).toBe('crouch');
    w.takeStanceTaken();
    let seen = false;
    run(w, FORWARD, () => { seen ||= w.takeStanceTaken(); return t.state().kind === 'ladder'; }, 400);
    expect(t.state().kind).toBe('ladder');
    expect(seen).toBe(false);
  });

  it('a ladder mount: no word', () => {
    const { grid, polys } = ladderWorld();
    const w = new Walker(grid);
    const t = new Traversal(grid, polys);
    w.driver = t;
    w.place(0, 10, 20);
    w.state.yaw = 0;
    w.takeStanceTaken();
    let seen = false;
    run(w, FORWARD, () => { seen ||= w.takeStanceTaken(); return t.state().kind === 'ladder'; }, 400);
    expect(t.state().kind).toBe('ladder');
    expect(seen).toBe(false);
  });
});
