// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Scene } from 'three';
import { FlyCamera } from '../src/camera';
import { Hud } from '../src/hud';
import { PlayerLoadout } from '../src/loadout';
import { mountFirearm, type FirearmHands, type MatchFirearmDeps } from '../src/matchFirearm';
import { Play } from '../src/play';
import { RemotePlayers } from '../src/remotePlayers';
import { packGround, WalkMode, type GroundData } from '../src/walk';
import { RAISE_REFUSAL_FRAMES, RAISE_TIMES, WeaponRaise, ZERO_RAISE_TIMES, type RaiseTimes } from '../src/weaponRaise';

/**
 * LATER 655 (research 321 section 3.4, "The first round after a grenade's return"; simulation track, reading, pending
 * review): the original's rifle after a hand grenade's swap.
 *
 * - The take-up writes the slot's raise times by its class (`FUN_005c4b10` D:L478849-478857): a firearm's
 *   (`FUN_005dffc0`), every other class's zero (`FUN_005dfff0` D:L494293-494300) -- a hand grenade (0x79) is none of
 *   `FUN_003d1db0`'s, `FUN_003d1da0`'s or `FUN_003d1d90`'s categories, so it takes zero.
 * - With the grenade up and the trigger idle the controller asks the rifle down at once (`FUN_00594cf0` D:L453568,
 *   D:L453598-453600), and the lower under the zero times leaves nothing to fall (`FUN_005dfe30` D:L494249-494256: the
 *   linear weight times `seal+0xeec`, 0): the raise tick clears the envelope that tick (`FUN_005dfc80` D:L494204-494210).
 * - Back on the rifle the swap sets no pending bit and plays no clip (`FUN_005c50b0` D:L479006-479010: the hand's class
 *   `+0xf79` stayed 1 through the grenade, `FUN_005a64c0` D:L461867-461869, D:L461889-461920), so the first round waits on the raise
 *   alone: from a cleared envelope, `RAISE_REFUSAL_FRAMES` game frames after the press's (`FUN_005c0ae0`
 *   D:L476423-476438; LATER 180).
 *
 * The page kept the rifle's times under the grenade (`kitFrame` took the zero times only mounted), so the rifle fell
 * over the rifle's 0.5 s out; a swap back inside that half second found it part-lowered, the raise snapped to the hold
 * (`FUN_005dfc80` D:L494213-494216) and the first round left on the return's own frame.
 */

afterEach(() => { vi.restoreAllMocks(); });

const FLOOR: GroundData = packGround(
  { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
  [{
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-200, 0, -200, 200, 0, -200, 200, 0, 200, -200, 0, 200]),
  }],
  [{ modelName: 'worldmodel', path: 'worldmodel/floor', first: 0, count: 1 }],
);

const hands = (over: Partial<FirearmHands> = {}): FirearmHands => ({
  launcherUp: () => false, launcherRoundIcon: () => null, itemUp: () => false, busy: () => false, takeable: () => true,
  putAway: () => {}, spawned: () => {}, trigger: () => false, launched: () => {}, icon: () => null, magazine: () => null,
  mounted: () => false, ...over,
});

/** One game frame a page frame (1/30 s), so the raise's game frames are the page's (`RAISE_ENVELOPE_STEP_READING`). */
const DT = 1 / 30;

/**
 * The page's own frame order (`main.ts` / `matchMount.ts`: the walk, the gun, the kit, then `Play.frame`'s raise): the
 * raise times the page hands `Play.setRaiseTimes` in `kitFrame` are fed to a `WeaponRaise` that runs as `Play.frame`'s,
 * with the hand's grenade (`ItemRaise.grenade`) and the firearm's trigger.
 */
function page(extra: Partial<MatchFirearmDeps> = {}) {
  let up = false, trigger = false;
  const scene = new Scene();
  const fly = new FlyCamera(document.createElement('canvas'));
  const walk = new WalkMode(fly);
  const play = new Play();
  const firearm = mountFirearm({
    scene, fly, walk, play, remote: new RemotePlayers(scene), hud: new Hud(), loadouts: new PlayerLoadout(),
    view: () => null, map: () => null, body: () => null, net: () => null, blocked: () => false, refreshFog: () => {},
    hands: hands({ itemUp: () => up, handItem: () => (up ? 123 : null) }), ...extra,
  });
  walk.setGround(FLOOR, [0, 0, 0]);
  fly.setPose({ x: 5, y: 40, z: 6, yaw: 0, pitch: 0 });
  walk.setMode('walk');
  let times: RaiseTimes = RAISE_TIMES;
  vi.spyOn(play, 'setRaiseTimes').mockImplementation((t) => { times = t; });
  const raise = new WeaponRaise();
  const frame = (): number => {
    walk.frame(DT);
    firearm.gunFrame(DT, true);
    firearm.kitFrame(DT, true);
    raise.setTimes(times);
    return raise.frame(DT, { trigger, aiming: false, grenade: up });
  };
  const set = (s: { up?: boolean; trigger?: boolean }): void => { up = s.up ?? up; trigger = s.trigger ?? trigger; };
  /** The rifle raised by a press, let go, still up (the countdown's 5 s running). */
  const raised = (): void => {
    set({ trigger: true });
    for (let i = 0; i < 6; i++) frame();
    set({ trigger: false });
    for (let i = 0; i < 3; i++) frame();
    expect(raise.weight()).toBe(1);
  };
  return { firearm, play, raise, frame, set, raised, times: () => times };
}

/** The game frames from a press (its own first) until the raise reads 1, from a cleared envelope -- the original's wait. */
function clearedWait(): number[] {
  const r = new WeaponRaise();
  r.frame(DT, { trigger: false, aiming: false });            // its first game frame ended, as the page's long-running raise
  const w: number[] = [];
  for (let i = 0; i < 6; i++) w.push(r.frame(DT, { trigger: true, aiming: false }));
  return w;
}

describe('LATER 655: the first round after a grenade swap waits for the rifle raised from a cleared envelope', () => {
  it('RED: a hand grenade up takes zero raise times on the page, as the take-up\'s FUN_005dfff0 (D:L478849-478853); back on the rifle, the rifle\'s', () => {
    const p = page();
    p.frame();
    expect(p.times()).toEqual(RAISE_TIMES);
    p.set({ up: true });
    p.frame();
    expect(p.times()).toEqual(ZERO_RAISE_TIMES);
    p.set({ up: false });
    p.frame();
    expect(p.times()).toEqual(RAISE_TIMES);
  });

  it('RED: the grenade up lowers a raised rifle at once (FUN_005dfe30 D:L494249-494256 under zero times; FUN_005dfc80 D:L494204-494210)', () => {
    const p = page();
    p.raised();
    p.set({ up: true });
    expect(p.frame()).toBe(0);
  });

  // The swap held for one game frame, 0.1 s, 0.2 s, 0.45 s and 1 s; the trigger pressed on the return's frame.
  for (const holdFrames of [1, 3, 6, 14, 30]) {
    it(`RED: the grenade held ${holdFrames} game frame(s), the trigger pressed at the return: the raise is the cleared envelope's -- refused for RAISE_REFUSAL_FRAMES game frames after the press's`, () => {
      const p = page();
      p.raised();
      p.set({ up: true });
      for (let i = 0; i < holdFrames; i++) p.frame();
      p.set({ up: false, trigger: true });
      const weights: number[] = [];
      for (let i = 0; i < 6; i++) weights.push(p.frame());
      expect(weights).toEqual(clearedWait());
      expect(weights.findIndex((x) => x >= 1)).toBe(RAISE_REFUSAL_FRAMES);
    });
  }

  it('the read, pinned: a rifle fired within the countdown\'s 5 s comes back up by itself in 0.1 s after the return, no press', () => {
    const p = page();
    p.raised();
    p.set({ up: true });
    for (let i = 0; i < 6; i++) p.frame();
    p.set({ up: false });
    for (let i = 0; i < 3; i++) p.frame();          // 0.1 s on the rifle, the trigger idle: the countdown asks it up
    // Back on the rifle with the countdown still running the controller asks up from the cleared envelope (D:L453572-
    // 453584, D:L494258-494265): three game frames of the rifle's 0.1 s in -- up by the press.
    expect(p.raise.weight()).toBe(1);
  });
});
