// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { CollisionOwner, GridParams, WorldPoly } from '@s2u/scene';
import { FlyCamera } from '../src/camera';
import { packGround, rootY, TICK, WalkMode, type Walker } from '../src/walk';
import { startLines, type StartBody } from '../src/net/startLine';

/**
 * JUMP-AIM-ROOT FOLD (the review's finding 3; research 80 s7, 2026-11-11; reading, pending review): the page's start
 * body (`WalkMode.startBody`, LATER 366 / OT.R80: the body `Fire.ray`'s start lines are measured from, `startWalled`)
 * stands on the same root as the room's (`room.ts` `startBody`, `Room.aimRootOf`): one rule (`net/shotCone.ts`
 * `aimRoot`), each side's own animator's posed root -- the page's `Play` animator (`setPosedRoot`, the page camera's
 * root), the room's `HitPoser` (the same `Animator` on the room's snapshot, HIT-POSE's A = B: match
 * `test/jumpAimRoot.test.ts`). A crouched jumper's start line on the page is drawn from the posed root, in the jump and
 * through the ease back to the crouch idle; a still crouch, a standing body, as before. The posed roots fed are shadow's
 * capture of the original's crouched jump (2026-11-11: frames 14, 18, 31, 41 -- 12.404, 15.059, 11.053, 5.960).
 * Unit-test evidence only; the page's flat floor, no disc.
 */

const canvas = (): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined;
  c.releasePointerCapture = () => undefined;
  c.hasPointerCapture = () => false;
  return c;
};
const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
const FLOOR: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-200, 0, -200, 200, 0, -200, 200, 0, 200, -200, 0, 200]),
};
const OWNERS: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];

const made: WalkMode[] = [];
afterEach(() => { for (const m of made.splice(0)) m.unbindKey(); });

/** The page's walk on the flat floor, `stance` held still and settled. */
function page(stance: 'stand' | 'crouch'): { m: WalkMode; w: Walker } {
  const m = new WalkMode(new FlyCamera(canvas()), () => undefined);
  made.push(m);
  m.setGround(packGround(PARAMS, [FLOOR], OWNERS), null);
  expect(m.respawn([0, 0, 0], 0)).toBe(true);
  const still = { forward: 0, right: 0, boost: false };
  m.walkFor(120 * TICK, still);                                          // landed, the landing's jump lock spent
  const w = m['walker'] as Walker;
  // The crouch set on the mover, as `bodyGates.test.ts` sets a row's stance (a press through `setStance` would hold the
  // tick's Stance bit, under which the page's jump waits for the next command).
  if (stance === 'crouch') { w.stance = 'crouch'; m.walkFor(120 * TICK, still); }
  expect(w.posture).toBe(stance);
  expect(w.action).toBeNull();
  return { m, w };
}

/** The start line's head from `b` (`startLines`, the room's and the page's one source). */
const head = (m: WalkMode, b: StartBody) => startLines(m.gridOfGround()!, b).head;

describe('JUMP-AIM-ROOT FOLD: the page\'s start body stands on the posed root as the room\'s does', () => {
  it('a crouched jumper: the start body\'s root is the page animator\'s posed root, in the clip and through the ease-down', () => {
    const { m, w } = page('crouch');
    const still = { forward: 0, right: 0, boost: false };
    expect(m.jump(), `the jump refused: in the air ${w.airborne}, action ${w.action?.name ?? 'none'}`).toBe(true);
    m.walkFor(2 * TICK, still);
    expect(w.action?.name).toBe('jump');
    expect(w.posture).toBe('crouch');                                      // research 80 s0, the capture: the stance kept
    for (const r of [12.404, 15.059]) {
      m.setPosedRoot(r);
      const b = m.startBody()!;
      expect(b.moveRoot, `in the clip, posed ${r}`).toBe(r);
      expect(head(m, b)).toEqual(head(m, { ...b, moveRoot: r }));
      expect(head(m, b)[1]).toBeGreaterThan(head(m, { ...b, moveRoot: null })[1]);
    }
    m.walkFor(70 * TICK, still);                                             // past the clip's 0.993 s
    expect(w.action).toBeNull();
    expect(w.posture).toBe('crouch');
    for (const r of [11.053, 5.96]) {
      m.setPosedRoot(r);
      expect(m.startBody()!.moveRoot, `the ease-down, posed ${r}`).toBe(r);
    }
    m.setPosedRoot(rootY('crouch'));
    expect(m.startBody()!.moveRoot, 'back on the crouch idle').toBeNull();
  });

  it('controls: a still crouch on its idles and a standing body keep the stance root (null), as before', () => {
    const c = page('crouch').m;
    for (const r of [5.50390625, 5.0313, 4.707, null]) { c.setPosedRoot(r); expect(c.startBody()!.moveRoot, `crouch posed ${r}`).toBeNull(); }
    const s = page('stand');
    s.m.setPosedRoot(11.484);
    expect(s.m.startBody()!.moveRoot).toBeNull();
    expect(s.m.jump(), `the jump refused: in the air ${s.w.airborne}, action ${s.w.action?.name ?? 'none'}`).toBe(true);
    s.m.walkFor(2 * TICK, { forward: 0, right: 0, boost: false });
    expect(s.w.action?.name).toBe('jump');
    s.m.setPosedRoot(15.059);
    expect(s.m.startBody()!.moveRoot, 'a standing jump: JUMP_AIM_ROOT_BODIES_READING crouched').toBeNull();
  });
});
