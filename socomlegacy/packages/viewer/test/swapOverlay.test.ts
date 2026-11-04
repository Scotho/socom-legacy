// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Group } from 'three';
import { FsAssetSource } from '@s2u/archive/node';
import { partMatrix, sampleClip, type MotionClip, type Skeleton } from '@s2u/scene';
import { fixture } from '../../archive/test/fixtures';
import { FlyCamera } from '../src/camera';
import { buildBody } from '../src/bodyView';
import { DEFAULT_LIGHTING } from '../src/lighting';
import { loadMap } from '../src/loadMap';
import { packGround, WalkMode, type GroundData } from '../src/walk';
import { Play } from '../src/play';
import { Kit, type Firearm } from '../src/kit';
import { PLAY_CLIPS } from '../src/animator';
import { WEAPON_CLIPS } from '../src/weaponPose';
import { playFromDisc } from '../src/motionTable';

/**
 * The owner's report (2026-10-05): "it really only works well when swapping in 'guns hot' state, and it looks off when
 * guns are down". The original has one swap clip per case and no hot or relaxed form (research 211 §1-§3); what looked
 * off was the port's layering of the moving swap (research 211 §4, G1-G3). On the disc's own clips, the whole chain --
 * the walk, the kit, the raise, the animator -- frame by frame:
 *
 * - G1: the moving swap (`seal_mv_rifle2pistol`, the second channel) is laid over the merged main channel at 1.0, the
 *   Fire sub-nodes included (research 150 §3.5, `FUN_00577ea0` D:L437456-437461): with the gun hot its arms are the
 *   overlay's key, not the Fire run's.
 * - G2: it runs on the second channel's clock -- key t / playback x n, freed at playback x (n-1)/n = 1.257 s
 *   (`FUN_0028d170` D:L134703-134737, R150.5) -- at weight 1 to its last key, and the body cross-fades from the pose on
 *   screen over 0.4 s at its start and after its end (`body+0x10d0`, `FUN_0057a010` / `FUN_00579ef0`).
 * - G3: a standing swap with the gun hot: the aim twist is in the pose the cross-fade leaves, so the `NoPitchtwist`
 *   clip's start does not drop it in one frame (research 211 §3.4; the snapshot `FUN_0028e3e0` holds the pose drawn).
 */

const FIXTURES = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'));
const absent = fixture('RUN/MP2.ZDB') === null || fixture('RUN/MOTION_P.ZAR') === null;

const canvas = (): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined;
  c.releasePointerCapture = () => undefined;
  c.hasPointerCapture = () => false;
  return c;
};

const GROUND: GroundData = packGround(
  { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
  [{
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-200, 0, -200, 200, 0, -200, 200, 0, 200, -200, 0, 200]),
  }],
  [{ modelName: 'worldmodel', path: 'worldmodel/floor', first: 0, count: 1 }],
);

/** The overlay's arm parts: their locals are the clip's own (no twist, no head look reaches them). */
const ARMS = ['lbicep', 'lforearm', 'lhand', 'rbicep', 'rforearm', 'rhand'];
/** `seal_mv_rifle2pistol`: `motion.rdr`'s playback, `MOTION_P.ZAR`'s keys (research 211 §1). */
const PLAYBACK = 1.32, KEYS = 21;
const DT = 1 / 60;

/** The rotation between two part matrices, degrees. */
function angle(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let tr = 0;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) tr += a[r * 4 + c]! * b[r * 4 + c]!;
  return (Math.acos(Math.max(-1, Math.min(1, (tr - 1) / 2))) * 180) / Math.PI;
}

describe.skipIf(absent)('the moving swap is the second channel over the Fire pose, on its own clock (research 211 G1-G3)', () => {
  const rig = async () => {
    const source = new FsAssetSource(FIXTURES);
    const map = await loadMap(source, 'RUN/MP2.ZDB');
    const data = (await playFromDisc(source, [...PLAY_CLIPS, ...WEAPON_CLIPS]))!;
    const clips = new Map<string, MotionClip>(data.clips.map((c) => [c.name, c]));
    const fly = new FlyCamera(canvas());
    const walk = new WalkMode(fly);
    walk.setGround(GROUND, [0, 0, 0]);
    const view = buildBody(map.body!, map, DEFAULT_LIGHTING);
    const play = new Play();
    play.setBody(view, map.body!);
    play.setWeapon(new Group(), [{ name: 'firepoint', at: [7.7854, 0.8338, 0] }]);
    play.setSidearm(new Group(), [{ name: 'firepoint', at: [1.4723, 0.5647, 0] }]);
    play.setClips(data);
    let trigger = false;
    play.setWeaponInput(() => ({ trigger, aiming: false }));
    const kit = new Kit({
      swapClip: (to) => walk.swapWeapon(to), canSwap: () => true,
      item: (i) => play.setItem(i),
      swapProgress: () => walk.swapProgress(),
    });
    fly.setPose({ x: 5, y: 40, z: 6, yaw: 0, pitch: 0 });
    walk.setMode('walk');
    let input = { forward: 0, right: 0 };
    fly.groundWish = () => ({ forward: input.forward, right: input.right, boost: false });
    const skeleton = (): Skeleton => (play as unknown as { skeleton: Skeleton }).skeleton;
    const step = (): void => {
      walk.frame(DT);
      kit.frame(DT);
      play.setMounts(kit.state().mounts);
      play.frame(DT, walk, fly.camera);
    };
    /** The largest rotation of the arm parts' locals from `clip`'s key `key`, degrees. */
    const off = (clip: string, key: number): number => {
      const c = clips.get(clip)!, s = skeleton();
      const parts = sampleClip(c, key / c.rate, { loop: false }).parts;
      let worst = 0;
      for (const p of parts) {
        if (!ARMS.includes(p.name)) continue;
        worst = Math.max(worst, angle(s.local[s.indexOf(p.name)]!, partMatrix(p.rotation, p.translation)));
      }
      return worst;
    };
    /** Hot: the trigger pulled a second and let go (the raise holds 5 s); `forward` the stick. */
    const settle = (hot: boolean, forward: number): void => {
      input = { forward, right: 0 };
      for (let f = 0; f < 90; f++) step();
      if (hot) { trigger = true; for (let f = 0; f < 60; f++) step(); trigger = false; }
      for (let f = 0; f < 30; f++) step();
    };
    return { walk, play, kit, fly, step, off, settle, skeleton, dispose: () => { view.dispose(); walk.unbindKey(); } };
  };
  type Rig = Awaited<ReturnType<typeof rig>>;

  /** The overlay's seconds into its clip this frame (the walk's own record), or null when none plays. */
  const overlayT = (r: Rig): number | null => r.walk.snapshot()?.overlay?.t ?? null;

  it('G1: running hot, the arms are the overlay\'s key mid-clip, not the Fire run\'s (30-45 degrees off before)', async () => {
    const r = await rig();
    r.settle(true, 1);
    expect(r.play.weaponStats().raise.weight).toBeCloseTo(1, 6);
    expect(r.kit.select('pistol' as Firearm)).toBe(true);
    let worst = 0, seen = 0;
    for (let f = 0; f < 90; f++) {
      r.step();
      const t = overlayT(r);
      // Past the 0.4 s blend in, short of the last 0.45 s (G2's end is the next test's).
      if (t === null || t < 0.45 || t > 1.197 - 0.45) continue;
      seen++;
      const o = r.walk.snapshot()!.overlay!;
      const key = (Math.min(1, o.t / o.seconds) * ((KEYS - 1) / KEYS)) * KEYS;
      worst = Math.max(worst, r.off('seal_mv_rifle2pistol', key));
    }
    r.dispose();
    expect(seen).toBeGreaterThan(10);
    expect(worst).toBeLessThan(0.5);
  }, 60_000);

  for (const hot of [false, true]) {
    it(`G2: running ${hot ? 'hot' : 'down'}, the overlay is at 1.0 to its last key on its own clock, the body eased 0.4 s from the pose on screen at both ends`, async () => {
      const r = await rig();
      r.settle(hot, 1);
      expect(r.kit.select('pistol')).toBe(true);
      let worstLate = 0, late = 0, startFade: { from: string | null; blend: number } | null = null, endFade: { from: string | null; blend: number } | null = null;
      let endStep = Infinity, prevArms: Float32Array[] | null = null, wasOn = false, lastT = 0;
      const arms = (): Float32Array[] => { const s = r.skeleton(); return ARMS.map((n) => Float32Array.from(s.local[s.indexOf(n)]!)); };
      for (let f = 0; f < 120; f++) {
        r.step();
        const t = overlayT(r), a = r.play.animStats()!;
        if (t !== null && !wasOn) startFade = { from: a.from, blend: a.blend };
        if (t === null && wasOn) {
          endFade = { from: a.from, blend: a.blend };
          const now = arms();
          endStep = Math.max(...now.map((m, i) => angle(m, prevArms![i]!)));
        }
        // The last tenth of the clip, on the second channel's clock: key t / playback x n (FUN_0028d170).
        if (t !== null && t >= 0.9 * PLAYBACK * ((KEYS - 1) / KEYS)) {
          late++;
          worstLate = Math.max(worstLate, r.off('seal_mv_rifle2pistol', Math.min(KEYS - 1, (t / PLAYBACK) * KEYS)));
        }
        if (t !== null) lastT = t;
        wasOn = t !== null;
        prevArms = arms();
      }
      r.dispose();
      expect(lastT).toBeGreaterThan(1.24);                       // ran to 1.257 s, not 1.197
      expect(late).toBeGreaterThan(4);
      expect(worstLate).toBeLessThan(0.5);                       // 16-23 degrees before: the weight faded inside the clip
      // At its start and after its last key the body's 0.4 s snapshot cross-fade (`body+0x10d0`), from the frame before.
      expect(startFade?.from).not.toBeNull();
      expect(startFade!.blend).toBeLessThan(0.05);
      expect(endFade?.from).not.toBeNull();
      expect(endFade!.blend).toBeLessThan(0.05);
      expect(endStep).toBeLessThan(0.5);                         // the frozen last key, not a jump to the run
    }, 60_000);
  }

  it('G3: standing hot, aiming up, the swap\'s first frame keeps the aim twist in the pose it eases from (a 9-degree pop before)', async () => {
    const r = await rig();
    r.fly.setPose({ pitch: 20 });
    r.settle(true, 0);
    const before = r.play.animStats()!;
    expect(before.twist).toBeGreaterThan(0.1);                    // the twist is on: the rifle hot, the play's clip twists
    const spine = (): Float32Array[] => { const s = r.skeleton(); return ['spinelo', 'spinehi'].map((n) => Float32Array.from(s.world[s.indexOf(n)]!)); };
    let last = spine();
    expect(r.kit.select('pistol')).toBe(true);
    const steps: number[] = [];
    for (let f = 0; f < 8; f++) {
      r.step();
      const now = spine();
      steps.push(Math.max(...now.map((m, i) => angle(m, last[i]!))));
      last = now;
    }
    const a = r.play.animStats()!;
    r.dispose();
    expect(a.clip).toBe('seal_rifle2pistol');
    expect(a.twist).toBe(0);                                      // NoPitchtwist: none while the clip plays (FUN_00587a30)
    // The first frame steps no more than the cross-fade's own next frames do: the twist leaves with the ease.
    expect(steps[0], steps.map((d) => d.toFixed(2)).join(' ')).toBeLessThanOrEqual(Math.max(...steps.slice(1)) + 0.1);
    expect(steps[0]).toBeLessThan(1);
  }, 60_000);
});
