// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGrid, type CollisionOwner, type GridParams, type WorldPoly } from '@s2u/scene';
import { FlyCamera } from '../src/camera';
import { clipsFromPack, motionTableFromArchive } from '../src/motionTable';
import { actionRoots, PUSHED_CLIPS, TICK, Walker, type PushedClip, type WalkInput } from '../src/mover';
import { oneShotSeconds } from '../src/locomotion';
import { flinchCutAt, pushedWindow, pushedWindowOf, type FlinchCut } from '../src/net/flinchReload';
import { OPEN_DOOR_TYPE, KICK_DOOR_TYPE_READING, openDoorClip } from '../src/doors';
import type { PlayClips } from '../src/play';
import { packGround, WalkMode } from '../src/walk';

/**
 * The owner, 2026-11-07: "opening door animation still isnt right / u shouldnt be able to open then move right away".
 * The original (research 92 section 2, "The body under the door clip"): the door program's `ai::ANIMATE` pushes
 * `Open door` (`seal_open_door`) on the presser through `FUN_00588bc0` (D:L487256-487260), a full-body one-shot on the
 * action stack (`motion.rdr`: looped 0, no `BlendOverlay`). With a one-shot on top the ground driver `FUN_00550ef0`
 * runs no ground state (D:L418171-418203: `FUN_005870e0` only on a cut or the end) and the tick's advance feeds the top
 * play's root velocity to the actor (`FUN_0057a330` -> `FUN_0028c250` D:L438910): the stick is read, not obeyed -- the
 * body moves by the clip's root alone -- until the stick or the turn past 0.1 cuts the clip once its phase is strictly
 * past `NoInterrupt` 0.5 (`FUN_00587c20` D:L445550-445556, the test D:L418180-418185), or the clip ends. The turn stays
 * free (no `NoTurn` on the clip; D:L418302-418340). The port held the window (`cutFrom`, `until`) on page and room but
 * let the stick walk the body under it.
 */

const RUN = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'), 'RUN');
const READERC = resolve(RUN, 'READERC.ZAR'), PACK = resolve(RUN, 'MOTION_P.ZAR');
const noDisc = !existsSync(READERC) || !existsSync(PACK);

const FLOOR: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
};
const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const OWNERS: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
const FORWARD: WalkInput = { forward: 1, right: 0, boost: false };
const STILL: WalkInput = { forward: 0, right: 0, boost: false };

/** `seal_open_door`'s window from a push on command `start`: 0.8 s, 14 keys, NoInterrupt 0.5 -- 42 commands, cut from 23 past it. */
const DOOR = (start: number): Required<FlinchCut> => pushedWindow(start, 0.8, 14, 0.5);

/** A walker on the floor whose door push stands on `window` at the command `seq()` names (the page's and room's hook). */
function held(window: () => FlinchCut | null, clip: PushedClip = 'seal_open_door') {
  const w = new Walker(buildGrid(PARAMS, [], [], [FLOOR], OWNERS));
  w.place(0, 10, 0);
  let seq = 0;
  w.pushedOnTop = () => {
    const c = window();
    if (!c || seq < c.start || seq >= c.until) return null;
    return { clip, t: (seq - c.start) * TICK, cuttable: flinchCutAt(c, seq) };
  };
  /** One command: `seq` first (the command the tick runs), then the tick; the window ends at a cut after it, as both sides do. */
  const run = (input: WalkInput, cut?: { end: (seq: number) => void }): void => {
    seq++;
    w.tick(input);
    const c = window();
    if (cut && c && flinchCutAt(c, seq) && (Math.abs(w.cutStick.forward) > 0.1 || Math.abs(w.cutStick.right) > 0.1 || Math.abs(w.turn / 2) > 0.1)) cut.end(seq);
  };
  return { w, run, seq: () => seq };
}

describe.skipIf(noDisc)(`PUSHED_CLIPS are the disc's${noDisc ? ' (READERC.ZAR or MOTION_P.ZAR absent)' : ''}`, () => {
  it("motion.rdr's playback and NoInterrupt, MOTION_P.ZAR's keys and root travel; one-shots on the stack", () => {
    const table = motionTableFromArchive(new Uint8Array(readFileSync(READERC)))!;
    const names = Object.keys(PUSHED_CLIPS) as PushedClip[];
    const clips = new Map(clipsFromPack(new Uint8Array(readFileSync(PACK)), names).map((c) => [c.name, c]));
    for (const n of names) {
      const c = PUSHED_CLIPS[n], e = table.get(n)!, clip = clips.get(n)!;
      expect(e, n).toBeDefined();
      expect(e.playback, n).toBeCloseTo(c.playback, 6);
      expect(e.looped, n).toBe(false);
      expect(e.blendOverlay, n).toBe(false);
      expect(e.noInterrupt ?? 0, n).toBeCloseTo(c.noInterrupt, 6);
      expect(clip.frameCount, n).toBe(c.frames);
      const root = clip.parts.find((p) => p.name === 'skel_root')?.translations ?? [];
      const last = 3 * (clip.frameCount - 1);
      if (root.length > 3) {
        expect(root[last]! - root[0]!, n).toBeCloseTo(c.travel[0], 1);
        expect(root[last + 2]! - root[2]!, n).toBeCloseTo(c.travel[1], 1);
      } else {
        expect(c.travel, n).toEqual([0, 0]);                       // `seal_p_kickopendoor`: no root track, in place
      }
    }
    // Every clip a door type pushes is one of them (the open, and the kick with either hand).
    for (const clip of [openDoorClip(OPEN_DOOR_TYPE, false), openDoorClip(KICK_DOOR_TYPE_READING, false), openDoorClip(KICK_DOOR_TYPE_READING, true)]) {
      expect(clip! in PUSHED_CLIPS, clip!).toBe(true);
    }
    const roots = actionRoots(clipsFromPack(new Uint8Array(readFileSync(PACK)), names));
    expect(roots.has('seal_open_door')).toBe(true);                // the root keys reach the mover
    expect(roots.has('seal_kickopendoor')).toBe(true);
  });

  it("with the disc's root keys the open lunges the body about 5 units ahead and back under the clip, the stick held forward", () => {
    const window: { c: FlinchCut | null } = { c: DOOR(1) };
    const h = held(() => window.c);
    h.w.actionRoots = actionRoots(clipsFromPack(new Uint8Array(readFileSync(PACK)), ['seal_open_door']));
    const x0 = h.w.state.x, z0 = h.w.state.z;
    let far = 0;
    for (let k = 1; k <= 23; k++) {                                 // commands 1-23: before the cut may come
      h.run(FORWARD, { end: (s) => { window.c = { ...window.c!, until: s }; } });
      far = Math.max(far, Math.hypot(h.w.state.x - x0, h.w.state.z - z0));
    }
    expect(far).toBeGreaterThan(3);                                // the root's lunge (key 0 to key 8: 5.0 along z)
    expect(far).toBeLessThan(6);                                   // and not the run's ~8 units in 23 commands
  });
});

describe('a door push holds the body: the stick is read, not obeyed, until it may cut the clip (FUN_00550ef0, FUN_00587c20)', () => {
  it('RED: the stick held forward from the push (command 1) -- the body stays put for commands 1-23 and walks from 24, the cut', () => {
    const window: { c: FlinchCut | null } = { c: DOOR(1) };
    const h = held(() => window.c);
    const x0 = h.w.state.x, z0 = h.w.state.z;
    const at: number[] = [];
    for (let k = 1; k <= 30; k++) {
      h.run(FORWARD, { end: (s) => { window.c = { ...window.c!, until: s }; } });
      at.push(Math.hypot(h.w.state.x - x0, h.w.state.z - z0));
    }
    // No root keys here (the fallback: the clip's whole travel over its length, 0.29 over 0.69 s): 0.16 in 23 commands.
    expect(at[22]!).toBeLessThan(0.3);                              // command 23: still held
    expect(window.c!.until).toBe(24);                               // command 24's stick cut it
    expect(at[23]! - at[22]!).toBeGreaterThan(0.1);                 // and the ground state moved the body on it
    expect(at[29]!).toBeGreaterThan(1);
  });

  it('RED: no stick under the clip, then the stick after its end -- held to the window\'s end (42 commands), free after', () => {
    const window: { c: FlinchCut | null } = { c: DOOR(1) };
    const h = held(() => window.c);
    for (let k = 1; k <= 42; k++) h.run(STILL);
    const x0 = h.w.state.x, z0 = h.w.state.z;
    h.run(FORWARD);                                                 // command 43: past the window
    for (let k = 0; k < 10; k++) h.run(FORWARD);
    expect(Math.hypot(h.w.state.x - x0, h.w.state.z - z0)).toBeGreaterThan(1);
  });

  it('RED: a stick pushed only after the push still finds the body held to command 23', () => {
    const window: { c: FlinchCut | null } = { c: DOOR(1) };
    const h = held(() => window.c);
    for (let k = 1; k <= 5; k++) h.run(STILL);
    const x0 = h.w.state.x, z0 = h.w.state.z;
    for (let k = 6; k <= 23; k++) h.run(FORWARD, { end: (s) => { window.c = { ...window.c!, until: s }; } });
    expect(Math.hypot(h.w.state.x - x0, h.w.state.z - z0)).toBeLessThan(0.3);
  });

  it('the turn alone past 0.1 cuts it from command 24 too (D:L418182-418185)', () => {
    const window: { c: FlinchCut | null } = { c: DOOR(1) };
    const h = held(() => window.c);
    h.w.turn = 1;                                                   // 1 rad/s over turn_maxrate 2: 0.5, past 0.1
    const end = { end: (s: number) => { window.c = { ...window.c!, until: s }; } };
    for (let k = 1; k <= 23; k++) h.run(STILL, end);
    expect(window.c!.until).toBe(43);                               // not before NoInterrupt
    h.run(STILL, end);
    expect(window.c!.until).toBe(24);
  });

  it('a mover nobody tells (no hook) walks as before: the hold is the window owner\'s', () => {
    const w = new Walker(buildGrid(PARAMS, [], [], [FLOOR], OWNERS));
    w.place(0, 10, 0);
    for (let k = 0; k < 20; k++) w.tick(FORWARD);
    expect(Math.hypot(w.state.x, w.state.z)).toBeGreaterThan(1);
  });
});

const canvas = (): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined; c.releasePointerCapture = () => undefined; c.hasPointerCapture = () => false;
  return c;
};
const made: WalkMode[] = [];
afterEach(() => { for (const m of made.splice(0)) m.unbindKey(); });
const CLIPS = {
  table: [['seal_open_door', { playback: 0.8, noInterrupt: 0.5 }]],
  clips: [{ name: 'seal_open_door', frameCount: 14, parts: [] }],
} as unknown as PlayClips;
const pose = () => ({ clip: 'seal_open_door', frame: 3, loop: false, rootY: null });

/** A page on the floor, stood still; `stick` is what its camera's ground wish hands each tick. `net`: a match's page. */
function page(net: boolean, stick: { v: WalkInput }): WalkMode {
  const fly = new FlyCamera(canvas());
  fly.setScale(0.1);
  (fly as unknown as { groundWish: () => WalkInput }).groundWish = () => stick.v;
  const m = new WalkMode(fly, () => undefined);
  made.push(m);
  m.setGround(packGround(PARAMS, [FLOOR], OWNERS), null);
  if (net) m.setNetTap(() => undefined);
  expect(m.respawn([0, 0, 0], 0)).toBe(true);
  return m;
}
const frames = (m: WalkMode, n: number): void => { for (let i = 0; i < n; i++) m.frame(TICK); };
const dist = (a: [number, number, number], b: [number, number, number]): number => Math.hypot(a[0] - b[0], a[2] - b[2]);

describe("the page's own push (WalkMode): the bare page's press holds its body on its own next command", () => {
  it('RED: the bare page (no room): the stick held, the body stays for the 23 commands before the cut, then walks', () => {
    const stick = { v: STILL };
    const m = page(false, stick);
    frames(m, 4);
    m.setFlinchPose(pose, pushedWindowOf(m.nextCommand(), 'seal_open_door', CLIPS), { reloadGate: false, pushed: true, clip: 'seal_open_door' });
    const at = m.feet()!;
    stick.v = FORWARD;
    frames(m, 23);
    expect(dist(m.feet()!, at)).toBeLessThan(0.3);
    frames(m, 10);
    expect(dist(m.feet()!, at)).toBeGreaterThan(1);
  });

  it('a flinch in the same slot (not a push) holds nothing: the body walks under it, as before', () => {
    const stick = { v: STILL };
    const m = page(false, stick);
    frames(m, 4);
    m.setFlinchPose(pose, { start: m.nextCommand(), until: m.nextCommand() + 42 });
    const at = m.feet()!;
    stick.v = FORWARD;
    frames(m, 10);
    expect(dist(m.feet()!, at)).toBeGreaterThan(1);
  });
});

describe("the page hears the room's push late (a match): its commands since run again under it, so it stands where the room does", () => {
  it('RED: heard 10 commands after its start -- the late page stands where a page that heard it on time does', () => {
    const stick = { v: STILL };
    const early = page(true, stick), late = page(true, stick);
    frames(early, 4); frames(late, 4);
    const window = pushedWindowOf(early.nextCommand(), 'seal_open_door', CLIPS)!;
    expect(window.start).toBe(5);
    const at = early.feet()!;
    early.setFlinchPose(pose, window, { reloadGate: false, pushed: true, clip: 'seal_open_door' });
    stick.v = FORWARD;
    frames(early, 10); frames(late, 10);
    expect(dist(late.feet()!, at)).toBeGreaterThan(1);              // the late page walked: it had not heard the push
    const replayed: number[] = [];
    late.setFlinchPose(pose, window, { reloadGate: false, pushed: true, clip: 'seal_open_door' });
    late.pushHeard(window, (after) => replayed.push(after));
    expect(replayed).toEqual([4]);                                  // the commands after the one before the push
    expect(late.feet()![0]).toBeCloseTo(early.feet()![0], 3);
    expect(late.feet()![2]).toBeCloseTo(early.feet()![2], 3);
    expect(dist(late.feet()!, at)).toBeLessThan(0.3);
    frames(early, 30); frames(late, 30);                            // past the cut: both walk on alike
    expect(dist(early.feet()!, at)).toBeGreaterThan(1);
    expect(late.feet()![0]).toBeCloseTo(early.feet()![0], 3);
    expect(late.feet()![2]).toBeCloseTo(early.feet()![2], 3);
  });

  it('heard on the command it starts on: nothing to run again', () => {
    const stick = { v: STILL };
    const m = page(true, stick);
    frames(m, 4);
    const window = pushedWindowOf(m.nextCommand(), 'seal_open_door', CLIPS)!;
    m.setFlinchPose(pose, window, { reloadGate: false, pushed: true, clip: 'seal_open_door' });
    const replayed: number[] = [];
    m.pushHeard(window, (after) => replayed.push(after));
    expect(replayed).toEqual([]);
  });
});

it('oneShotSeconds: seal_open_door runs 0.69 s to its last key, the 42 commands the window holds', () => {
  expect(oneShotSeconds(0.8, 14)).toBeCloseTo(0.8 * (13 / 14) ** 2, 9);
  expect(DOOR(1)).toEqual({ start: 1, until: 43, cutFrom: 24 });
});
