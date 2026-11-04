// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { CollisionOwner, GridParams, WorldPoly } from '@s2u/scene';
import { FlyCamera } from '../src/camera';
import type { Knock } from '../src/net/blast';
import { packGround, TICK, WalkMode, type Walker } from '../src/walk';

/**
 * What a blast's knock does is the original's: `FUN_0057e770` (D:L440958-441034, research 85 §12) holds the knock's
 * content and lays it on the actor's own update. When it is laid -- the command the room had run (`blast.after`) -- has
 * no original: the page's replay from there is the port's prediction (research 101, "the page's own"). A page that hears
 * it late lays the knock back on the mover it kept after that command and runs the commands since again, so it stands
 * where a page that heard it on the tick does.
 */

const FLOOR: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
};
const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const OWNERS: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor', first: 0, count: 1 }];
const PUSH: Knock = { velocity: [11.3, 48.8, 0], fall: 'fallForward' };

const canvas = (): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined;
  c.releasePointerCapture = () => undefined;
  c.hasPointerCapture = () => false;
  return c;
};

const made: WalkMode[] = [];
afterEach(() => { for (const m of made.splice(0)) m.unbindKey(); });

function page(): WalkMode {
  const fly = new FlyCamera(canvas());
  fly.setScale(0.1);
  const m = new WalkMode(fly, () => undefined);
  made.push(m);
  m.setGround(packGround(PARAMS, [FLOOR], OWNERS), null);
  m.setNetTap(() => undefined);
  expect(m.respawn([0, 0, 0], 0)).toBe(true);
  return m;
}

const frames = (m: WalkMode, n: number): void => { for (let i = 0; i < n; i++) m.frame(TICK); };
const body = (m: WalkMode): Walker => m['walker']!;

describe('a late blast replays the knock from the command the room laid it after', () => {
  it('matches a page that was knocked on that command, and not the pose it had drifted to', () => {
    const early = page(), late = page();
    frames(early, 4);
    frames(late, 4);
    const pops: number[] = [];
    late.onStackPop((pop, n) => { if (pop === 'knock') pops.push(n); });
    expect(early.knock(PUSH)).toBe(true);                         // taps is 4: the room's command, heard on the tick
    frames(early, 8);
    frames(late, 8);
    const drifted = late.feet()![0]!;
    expect(late.knock(PUSH, 4)).toBe(true);
    expect(pops).toEqual([4]);                                    // the command the room laid it on, not the arrival
    expect(Math.abs(late.feet()![0]! - drifted)).toBeGreaterThan(0.5);
    expect(late.feet()![0]).toBeCloseTo(early.feet()![0]!, 3);
    expect(late.feet()![1]).toBeCloseTo(early.feet()![1]!, 3);
    expect(late.feet()![2]).toBeCloseTo(early.feet()![2]!, 3);
    expect(body(late).action?.name).toBe(body(early).action?.name);
    frames(early, 20);
    frames(late, 20);
    expect(late.feet()![0]).toBeCloseTo(early.feet()![0]!, 3);
    expect(late.feet()![1]).toBeCloseTo(early.feet()![1]!, 3);
    expect(body(late).action?.name).toBe(body(early).action?.name);
  });

  // The review of 23790acfc, finding 3: a stack pop is counted in the walk's ticks (`ticks()`, the still clip's and the
  // reload's lives), not in the client's command numbering -- the two differ after a `setNetTap` (a reconnect)
  it('a replayed knock pops the stack at that command\'s tick, when the client\'s numbering differs from the ticks', () => {
    const m = page();
    frames(m, 3);                                                 // three ticks run before the client's numbering
    m.setNetTap(() => undefined, 100);                           // a new numbering: the next command is 101
    frames(m, 4);
    const tickOf104 = m.ticks();                                  // command 104 ran on this tick
    expect(tickOf104).not.toBe(104);
    frames(m, 8);
    const pops: number[] = [];
    m.onStackPop((pop, n) => { if (pop === 'knock') pops.push(n); });
    expect(m.knock(PUSH, 104)).toBe(true);
    expect(pops).toEqual([tickOf104]);
  });

  it('a knock for the command just sent is laid on the mover as it stands', () => {
    const m = page();
    frames(m, 4);
    const at = m.feet()!;
    let replayed = false;
    expect(m.knock(PUSH, 4, () => { replayed = true; })).toBe(true);
    expect(replayed).toBe(false);
    expect(m.feet()).toEqual(at);
    expect(body(m).action?.name).toBe('fallForward');
  });

  it('a knock whose command is no longer kept is laid on arrival, not rewound', () => {
    const m = page();
    frames(m, 6);
    const at = m.feet()!;
    let replayed = false;
    expect(m.knock(PUSH, 0, () => { replayed = true; })).toBe(true);
    expect(replayed).toBe(false);
    expect(m.feet()![0]).toBeCloseTo(at[0]!, 6);
    expect(m.feet()![2]).toBeCloseTo(at[2]!, 6);
    expect(body(m).action?.name).toBe('fallForward');
  });
});
