// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { CollisionOwner, WorldPoly } from '@s2u/scene';
import { FlyCamera } from '../src/camera';
import { groundPolygons, packGround, TICK, WalkMode } from '../src/walk';
import { LADDER_RELOAD_CLIPS, LADDER_RELOAD_FOOT_READING, LADDER_RELOAD_SLIDE_LAND_READING, LADDER_RELOAD_TURN_READING, reloadRefusedBy, Traversal, TRAVERSAL_CLIP } from '../src/traversal';
import { GATE_PARAMS } from './helpers/gateTable';

/**
 * LATER 562 (SCOPE-C F2; tier-2 row 6): the reload on a ladder. The original refuses every `FUN_005b4340` code in the
 * ladder's state 5 or with posture 5 on top (r0001 D:L469329-469330), the reload's code 3 among them (the kit's timer ->
 * `FUN_005c2a90` -> `FUN_005b4340(actor, 3)`, D:L476550-476560, D:L477404), and the ladder's mount pushes posture 5
 * (`FUN_0057f880` D:L441547-441558). The port's page refuses a reload's start only while a climb onto an obstacle's clip
 * or the hang holds the body (NU-1b B5, `WalkMode.climbHolds` -> `climbHoldsBody`, whose `CLIMB_BODY_CLIPS` holds no
 * ladder clip), so on a ladder it takes the reload. Held here, on the page's own predicate (`FireSource.climbHolds`,
 * `./matchFirearm`), with no game data: through the foot's mount, on the rungs and through the slide the reload is
 * refused; standing on the ground it is not. The r0004 read (research 86 s2.8; reading, pending review): refused in every
 * ladder phase read -- the mount, the rungs, the slide, the climb-off at the head; the step-off at the foot by inference;
 * the slide's landing unread (`LADDER_RELOAD_SLIDE_LAND_PLACEHOLDER`). Simulation track.
 */

const quad = (pts: number[], ditype: number, appflags = 0, path = 'worldmodel/q'): WorldPoly => ({
  modelName: 'worldmodel', path, region: 0, ditype, material: 25, ptcount: 4, cameratype: 0, appflags, points: Float32Array.from(pts),
});
const floor = (x0: number, z0: number, x1: number, z1: number, y: number): WorldPoly => quad([x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z0], 3);

/** traversal.test.ts's `ladderWorld`: a 40-high wall at z 0, the deck behind it at 40, a ladder 0..40 with its cap 40..50. */
function ladderGround(): ReturnType<typeof packGround> {
  const polys = [
    floor(-100, 0, 100, 100, 0),
    floor(-100, -100, 100, 0, 40),
    quad([-100, 0, 0, 100, 0, 0, 100, 40, 0, -100, 40, 0], 2),
    quad([-3, 0, 0.2, 3, 0, 0.2, 3, 40, 0.2, -3, 40, 0.2], 2, 2, 'worldmodel/lad/ladder'),
    quad([3, 40, 0.2, -3, 40, 0.2, -3, 50, 0.2, 3, 50, 0.2], 2, 2, 'worldmodel/lad/ladder'),
  ];
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return packGround(GATE_PARAMS, polys, owners);
}

const canvas = (): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined;
  c.releasePointerCapture = () => undefined;
  c.hasPointerCapture = () => false;
  return c;
};

const made: WalkMode[] = [];
afterEach(() => { for (const m of made.splice(0)) m.unbindKey(); });

const FORWARD = { forward: 1, right: 0, boost: false };
const STILL = { forward: 0, right: 0, boost: false };

/** A page walking at the ladder's foot, facing it. */
function pageAtLadder(): WalkMode {
  const m = new WalkMode(new FlyCamera(canvas()), () => undefined);
  made.push(m);
  m.setGround(ladderGround(), null);
  m.useTraversal((w, g) => new Traversal(w.grid, groundPolygons(g)));
  expect(m.respawn([0, 0, 20], 0)).toBe(true);
  m.walkFor(10 * TICK, STILL);
  return m;
}

/** Walks in until the ladder offers CLIMB, presses, and runs on until the body hangs on the rungs. */
function mount(m: WalkMode): void {
  const t = (m.traversal() as Traversal);
  for (let i = 0; i < 400 && t.climbPrompt()?.kind !== 'ladder'; i++) m.walkFor(TICK, FORWARD);
  expect(t.climbPrompt()?.kind).toBe('ladder');
  t.action();
  m.walkFor(TICK, FORWARD);
  for (let i = 0; i < 400 && t.state().kind !== 'ladder'; i++) m.walkFor(TICK, FORWARD);
  expect(t.state().kind).toBe('ladder');
}

describe('LATER 562: no reload begins on a ladder (the page\'s FireSource.climbHolds)', () => {
  it('standing on the ground at the ladder\'s foot the reload is not refused (control)', () => {
    const m = pageAtLadder();
    expect((m.traversal() as Traversal).state().kind).toBe('none');
    expect(m.climbHolds()).toBe(false);
  });

  it('through the foot mount (Stand -> Ladder, posture 5 on top) the reload is refused', () => {
    const m = pageAtLadder();
    const t = (m.traversal() as Traversal);
    for (let i = 0; i < 400 && t.climbPrompt()?.kind !== 'ladder'; i++) m.walkFor(TICK, FORWARD);
    t.action();
    m.walkFor(TICK, FORWARD);
    expect(t.state().kind).toBe('ladderMount');
    let held = true;
    for (let i = 0; i < 400 && t.state().kind === 'ladderMount'; i++) { held = held && m.climbHolds(); m.walkFor(TICK, FORWARD); }
    expect(held).toBe(true);
  });

  it('through the climb-off at the head (state 5 until its clip ends) the reload is refused', () => {
    const m = pageAtLadder();
    mount(m);
    const t = (m.traversal() as Traversal);
    for (let i = 0; i < 3000 && t.state().kind === 'ladder'; i++) m.walkFor(TICK, FORWARD);
    expect(t.state().kind).toBe('ladderOffTop');
    let held = true;
    for (let i = 0; i < 400 && t.state().kind === 'ladderOffTop'; i++) { held = held && m.climbHolds(); m.walkFor(TICK, FORWARD); }
    expect(held).toBe(true);
  });

  it('through the step-off at the foot (LADDER_RELOAD_FOOT_READING, an inference) the reload is refused', () => {
    const m = pageAtLadder();
    mount(m);
    const t = (m.traversal() as Traversal);
    const BACK = { forward: -1, right: 0, boost: false };
    for (let i = 0; i < 400 && t.state().kind === 'ladder'; i++) m.walkFor(TICK, BACK);
    expect(t.state().kind).toBe('ladderOffBottom');
    let held = true;
    for (let i = 0; i < 400 && t.state().kind === 'ladderOffBottom'; i++) { held = held && m.climbHolds(); m.walkFor(TICK, BACK); }
    expect(held).toBe(true);
  });

  it("through the slide's landing (LADDER_RELOAD_SLIDE_LAND_READING: a one-shot, state 5 kept) the reload is refused", () => {
    const m = pageAtLadder();
    mount(m);
    m.walkFor(60 * TICK, FORWARD);
    const t = (m.traversal() as Traversal);
    t.action();
    m.walkFor(TICK, STILL);
    for (let i = 0; i < 400 && t.state().kind === 'ladderSlide'; i++) m.walkFor(TICK, STILL);
    expect(t.state().kind).toBe('ladderSlideLand');
    let held = true;
    for (let i = 0; i < 400 && t.state().kind === 'ladderSlideLand'; i++) { held = held && m.climbHolds(); m.walkFor(TICK, STILL); }
    expect(held).toBe(true);
  });

  it("through the head's mount (offLadder reversed, posture 5 on top) the reload is refused", () => {
    const m = new WalkMode(new FlyCamera(canvas()), () => undefined);
    made.push(m);
    m.setGround(ladderGround(), null);
    m.useTraversal((w, g) => new Traversal(w.grid, groundPolygons(g)));
    expect(m.respawn([0, 40, -20], 180)).toBe(true);
    m.walkFor(10 * TICK, STILL);
    const t = (m.traversal() as Traversal);
    for (let i = 0; i < 400 && t.climbPrompt()?.kind !== 'ladder'; i++) m.walkFor(TICK, FORWARD);
    expect(t.climbPrompt()?.kind).toBe('ladder');
    t.action();
    m.walkFor(TICK, FORWARD);
    // A body facing away turns first (the "180", refused too: LADDER_RELOAD_TURN_READING); then the head's mount.
    let turnHeld = true;
    for (let i = 0; i < 400 && t.state().kind === 'turn180'; i++) { turnHeld = turnHeld && m.climbHolds(); m.walkFor(TICK, STILL); }
    expect(turnHeld).toBe(true);
    expect(t.state().kind).toBe('ladderMountTop');
    let held = true;
    for (let i = 0; i < 400 && t.state().kind === 'ladderMountTop'; i++) { held = held && m.climbHolds(); m.walkFor(TICK, STILL); }
    expect(held).toBe(true);
  });

  it('on the rungs (state 5) the reload is refused', () => {
    const m = pageAtLadder();
    mount(m);
    m.walkFor(20 * TICK, FORWARD);                                   // up the rungs a little
    expect((m.traversal() as Traversal).state().kind).toBe('ladder');
    expect(m.climbHolds()).toBe(true);
  });

  it('through the slide (state 5) the reload is refused', () => {
    const m = pageAtLadder();
    mount(m);
    m.walkFor(60 * TICK, FORWARD);
    const t = (m.traversal() as Traversal);
    t.action();
    m.walkFor(TICK, STILL);
    expect(t.state().kind).toBe('ladderSlide');
    let held = true;
    for (let i = 0; i < 400 && t.state().kind === 'ladderSlide'; i++) { held = held && m.climbHolds(); m.walkFor(TICK, STILL); }
    expect(held).toBe(true);
  });

  // The predicate the room asks by its frame's motion clip (match room.ts reload, the room's owner's hunk): every ladder
  // clip refused, the slide's landing left to its placeholder, a plain locomotion clip not.
  it("the room's predicate (reloadRefusedBy): every ladder clip refused, the slide's landing too (both one-shots), a run not", () => {
    for (const c of [TRAVERSAL_CLIP.toLadder, TRAVERSAL_CLIP.ladder, TRAVERSAL_CLIP.offLadder, TRAVERSAL_CLIP.toSlide, TRAVERSAL_CLIP.slide, TRAVERSAL_CLIP.slideLand]) {
      expect(reloadRefusedBy(c), c).toBe(true);
    }
    expect(reloadRefusedBy(TRAVERSAL_CLIP.turn180), 'the 180 (the gate test 4, 0x409cb0 = "180")').toBe(true);
    expect(reloadRefusedBy('seal_run')).toBe(false);
    expect(reloadRefusedBy(null)).toBe(false);
  });

  // The 562 delta's D1: each named reading bound to the set's membership, so changing a value changes what is refused.
  it('the named readings bind the set: the foot (toLadder), the slide landing and the 180', () => {
    expect(LADDER_RELOAD_CLIPS.has(TRAVERSAL_CLIP.toLadder)).toBe(LADDER_RELOAD_FOOT_READING === 'refused');
    expect(LADDER_RELOAD_CLIPS.has(TRAVERSAL_CLIP.slideLand)).toBe(LADDER_RELOAD_SLIDE_LAND_READING === 'refused');
    expect(LADDER_RELOAD_CLIPS.has(TRAVERSAL_CLIP.turn180)).toBe(LADDER_RELOAD_TURN_READING === 'refused');
  });
});
