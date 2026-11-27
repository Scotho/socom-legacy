// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildGrid, type CollisionOwner, type GridParams, type WorldPoly } from '@s2u/scene';
import { TICK, Walker, type WalkInput } from '../src/mover';
import { contactSlide, PUSH_APART_PRONE_STEP_READING, type OtherBody } from '../src/pushApart';

/**
 * LATER 711 -- a PRONE mover against other bodies (research 426 s5.2 and s10; simulation track; reading, pending review).
 * r0004 flags a body whose own stance word `+0x174` is 2 (prone), or with action 0x13 or 0x19 on top (r4 0x554888-0x5548cc).
 * Under the flag a body not in state 2 or 8 is skipped (r4 0x554ba8-0x554bb4), and at the contact site, on a hit moving
 * inward, the frame's displacement is ZEROED and the dot floored at -1 before the normal's part is taken off
 * (r4 0x5551f0-0x555250): the move is replaced by an outward step of min(|dot|, 1) along the normal -- a push back out, no
 * slide round. The upright mover's prone skip (`+0x21c` value 2, r1 D:L417485-417489) is unchanged: what reads that value
 * is unread (`PUSH_APART_PRONE_PLACEHOLDER`). No rig leg has driven a prone body yet (the Q22-WP capture is owed), so the
 * figures here are the reading's, not the rig's. Unit tier: a flat synthetic floor, no game data.
 */

const at = (x: number, z: number, stance: OtherBody['stance']): OtherBody => ({ x, y: 0, z, stance });

describe('LATER 711: a prone mover (r0004\'s flag, research 426 s5.2)', () => {
  it('crawling into a prone body inside the radii (8 + 8): the move is replaced by an outward step of |dot|', () => {
    // Mover at the origin, the other 15 u along +x (inside 16); a crawl of 0.2 u straight at it.
    const [dx, dy, dz] = contactSlide(0, 0, 0, 'prone', [0.2, 0, 0], [at(15, 0, 'prone')]);
    expect(dx).toBeCloseTo(-0.2, 9);
    expect(dy).toBe(0);
    expect(dz).toBeCloseTo(0, 9);
  });

  it('the outward step is capped at 1 u (the dot floored at -1, r4 0x5551fc-0x555224)', () => {
    expect(PUSH_APART_PRONE_STEP_READING).toBe(1);
    const [dx] = contactSlide(0, 0, 0, 'prone', [3, 0, 0], [at(15, 0, 'prone')]);
    expect(dx).toBeCloseTo(-1, 9);
  });

  it('off-centre, the tangential part goes too: the displacement is zeroed first, so a prone body does not slide round', () => {
    // The other at 45 degrees, 14 u away; the crawl along +x: inward dot = 0.3 * cos 45.
    const r = 14 / Math.SQRT2;
    const [dx, , dz] = contactSlide(0, 0, 0, 'prone', [0.3, 0, 0], [at(r, r, 'prone')]);
    const inward = 0.3 / Math.SQRT2;
    expect(dx).toBeCloseTo(-inward / Math.SQRT2, 9);
    expect(dz).toBeCloseTo(-inward / Math.SQRT2, 9);
  });

  it('a crawl moving away from a prone body inside the radii is left alone (no inward hit)', () => {
    const d = contactSlide(0, 0, 0, 'prone', [-0.2, 0, 0.05], [at(15, 0, 'prone')]);
    expect(d).toEqual([-0.2, 0, 0.05]);
  });

  it('a prone mover skips an upright body (r4 0x554ba8-0x554bb4): standing and crouched alike', () => {
    expect(contactSlide(0, 0, 0, 'prone', [0.2, 0, 0], [at(12, 0, 'stand')])).toEqual([0.2, 0, 0]);
    expect(contactSlide(0, 0, 0, 'prone', [0.2, 0, 0], [at(12, 0, 'crouch')])).toEqual([0.2, 0, 0]);
  });

  it('an upright mover skips a prone body (r1 D:L417485-417489, kept in r0004): unchanged', () => {
    expect(contactSlide(0, 0, 0, 'stand', [1, 0, 0], [at(12, 0, 'prone')])).toEqual([1, 0, 0]);
    expect(contactSlide(0, 0, 0, 'crouch', [1, 0, 0], [at(12, 0, 'prone')])).toEqual([1, 0, 0]);
  });

  it('outside 16 u nothing acts: the neighbour list\'s gate, unscaled', () => {
    expect(contactSlide(0, 0, 0, 'prone', [0.2, 0, 0], [at(16.01, 0, 'prone')])).toEqual([0.2, 0, 0]);
  });
});

const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 2000, cellsX: 4, cellsZ: 4, originX: -4000, originZ: -4000 };
const floor: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-4000, 0, -4000, 4000, 0, -4000, 4000, 0, 4000, -4000, 0, 4000]),
};
const owners: CollisionOwner[] = [{ modelName: floor.modelName, path: floor.path, first: 0, count: 1 }];
const GRID = buildGrid(params, [], [], [floor], owners);
const CRAWL: WalkInput = { forward: 1, right: 0, boost: false };
const STILL: WalkInput = { forward: 0, right: 0, boost: false };

describe('LATER 711: a prone crawler and a prone teammate, the one Walker', () => {
  it('a crawl into a still prone teammate stops at the radii (16 u) less a tick\'s crawl, and is held outside; the teammate never moves', () => {
    const m = new Walker(GRID), t = new Walker(GRID);
    m.place(0, 20, 0); m.state.yaw = 0; m.stance = 'prone';
    // M's forward at yaw 0, found by a probe crawler (the test does not assume the port's axis convention).
    const probe = new Walker(GRID); probe.place(0, 20, 0); probe.state.yaw = 0; probe.stance = 'prone';
    for (let i = 0; i < 240; i++) probe.tick(CRAWL);
    const n = Math.hypot(probe.state.x, probe.state.z), ux = probe.state.x / n, uz = probe.state.z / n;
    t.place(ux * 24, 20, uz * 24); t.state.yaw = 180; t.stance = 'prone';
    // Settle both into prone (the stance change plays before the crawl).
    for (let i = 0; i < 120; i++) { m.tick(STILL); t.tick(STILL); }
    const t0 = { x: t.state.x, z: t.state.z };
    const body = (w: Walker) => () => [{ x: w.state.x, y: w.state.y, z: w.state.z, stance: w.stance }];
    m.bodies = body(t); t.bodies = body(m);
    const seps: number[] = [];
    for (let k = 0; k < Math.round(8 / TICK); k++) { m.tick(CRAWL); t.tick(STILL); seps.push(Math.hypot(t.state.x - m.state.x, t.state.z - m.state.z)); }
    const crawlTick = 11 * TICK;                                    // seal_prone_crawl's 11 u/s, a tick of it
    expect(Math.min(...seps), `min sep ${Math.min(...seps)}`).toBeGreaterThanOrEqual(16 - crawlTick - 1e-6);
    expect(seps.at(-1)!, `end sep ${seps.at(-1)}`).toBeGreaterThanOrEqual(16 - crawlTick - 1e-6);
    expect(Math.hypot(t.state.x - t0.x, t.state.z - t0.z)).toBe(0);
  });
});
