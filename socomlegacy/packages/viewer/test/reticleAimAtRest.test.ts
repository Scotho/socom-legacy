// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Mesh, Scene, type Vector2 } from 'three';
import type { Rgba } from '@s2u/gs';
import type { WorldPoly } from '@s2u/scene';
import { FlyCamera } from '../src/camera';
import { Hud } from '../src/hud';
import { PlayerLoadout } from '../src/loadout';
import { mountFirearm } from '../src/matchFirearm';
import { Play } from '../src/play';
import { RemotePlayers } from '../src/remotePlayers';
import type { Reticle } from '../src/reticle';
import { packGround, WalkMode, type Stance } from '../src/walk';

/**
 * The root of Craig's playtest (2026-11-22, a release blocker; `reticleCentreStill.test.ts`) and the fresh review's F1-F4
 * (2026-11-22, seat-kill): the reticle's centre mark and ring, driven through the page's real per-frame path -- the walk
 * (`WalkMode.frame`, the posed root, `PlayerCamera`'s tick and drawn view), `matchFirearm`'s `aimReticle` (the aim it
 * hands the reticle) and the `Reticle` class's own render (the ring's and the pip's meshes).
 *
 * The original's centre is no projection: `(320 + kit+0x18 + kit+0x20, 224 + kit+0x1c + kit+0x24)` (`FUN_00216770`
 * D:L70421-70424), `+0x18/+0x1c` zeroed each pass (`FUN_005aa6e0` D:L464320-464321), its ring's and pip's corners
 * truncated (D:L70428-70430; `FUN_00364770` D:L261801-261802). Where the drawn camera is the game's, the page hands the
 * reticle the frame's exact centre, so nothing moves at rest; where the drawn camera is displaced (H309's near
 * clearance, the jump's overhead cap) the round's line is projected (`RETICLE_DISPLACED_CAMERA_AIM_ADAPTATION`) and added
 * after the truncated corner, so the real slide moves the mark smoothly, never a whole PS2 pixel at a time.
 *
 * The re-review's R2 (2026-11-22): (e) puts real walls beside the body -- the x axis, the body-side pull-back, a pinned
 * peek's recheck, a parapet whose edge the breath crosses and a roof's edge met sideways in a jump. Where the drawn
 * camera itself jumps in one frame the mark moves with the picture (`expectMovesWithPicture`), more than a 1080p pixel.
 * The subject's reticle goes through `hudAim` (`matchFirearmSubject.test.ts`, R3).
 *
 * What this harness cannot reach (a served check): the Xbox prototype's path (it bypasses `hudAim`; the fork is frozen),
 * slopes (the prone eye's floor-normal term), the eased peek (the pin only), a moving or turning body, the scope's sway and a non-zero bob
 * shift, a clip's root off the disc (the root here is a synthetic breathing sine), and a real map's faces.
 */
function quad(points: number[], ditype: number, path: string): WorldPoly {
  return { modelName: 'worldmodel', path, region: 0, ditype, material: 25, ptcount: 4, cameratype: 0, points: Float32Array.from(points) };
}
const floor = quad([-200, 0, -200, 200, 0, -200, 200, 0, 200, -200, 0, 200], 3, 'worldmodel/floor');
/** A ceiling at `y`, wound facing down (the underside of a roof). */
const roof = (y: number): WorldPoly => quad([-200, y, 200, 200, y, 200, 200, y, -200, -200, y, -200], 3, 'worldmodel/roof');
const ink = (w: number, h = w): Rgba => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(255) });

const HD = { width: 1920, height: 1080 }, PS2 = { width: 640, height: 448 };
type Frame = typeof HD;
/** A blocked muzzle's pip, 40 x 30 PS2 pixels off the centre (out past the drawn size, so it shows). */
const PIP_AT: [number, number] = [40, 30];

interface Rig { fly: FlyCamera; walk: WalkMode; reticle: Reticle; aimReticle: (dt: number) => void; inner: Inner }
interface Inner { walker: { jump(): boolean; airborne: boolean; action: { name: string } | null }; player: { jumping: boolean } }

function rig(polys: WorldPoly[], opts: { scoped?: boolean; yaw?: number; pitch?: number; stance?: Stance } = {}): Rig {
  const ground = packGround(
    { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
    polys, polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 })),
  );
  const fly = new FlyCamera(document.createElement('canvas'));
  const walk = new WalkMode(fly);
  const firearm = mountFirearm({
    scene: new Scene(), fly, walk, play: new Play(), remote: new RemotePlayers(new Scene()), hud: new Hud(), loadouts: new PlayerLoadout(),
    view: () => null, map: () => null, body: () => null, net: () => null, blocked: () => false, refreshFog: () => {},
  });
  walk.setGround(ground, [0, 0, 0]);
  const yaw = opts.yaw ?? 0, pitch = opts.pitch ?? 0;
  fly.setPose({ x: 0, y: 15.4, z: 0, yaw, pitch });
  expect(walk.setMode('walk')).toBe(true);
  walk.setCamera({ x: 0, y: 15.4, z: 0, yaw, pitch });
  if (opts.stance) expect(walk.setStance(opts.stance)).toBe(true);
  if (opts.scoped) walk.setScoped(true);
  firearm.reticle.setBitmaps({ fixed: ink(65), floating: ink(32), accuracy: ink(16), sets: {} });
  firearm.reticle.setVisible(true);
  return { fly, walk, reticle: firearm.reticle, aimReticle: firearm.aimReticle, inner: walk as unknown as Inner };
}

/** The ring's and the pip's centres (frame pixels) as the reticle's render lays its meshes on `frame`. */
function drawn(reticle: Reticle, frame: Frame): { ring: [number, number]; pip: [number, number] } {
  let scene: Scene | null = null;
  reticle.render({ autoClear: true, getDrawingBufferSize: (v: Vector2) => v.set(frame.width, frame.height), render: (sc: Scene) => { scene = sc; } } as never);
  const meshes: Mesh[] = [];
  (scene as Scene | null)?.traverse((o) => { if (o instanceof Mesh && o.visible) meshes.push(o); });
  const ring = meshes.find((m) => m.renderOrder === 0)!, pip = meshes.find((m) => m.renderOrder === 3)!;
  return { ring: [ring.position.x, ring.position.y], pip: [pip.position.x, pip.position.y] };
}

/** `n` frames through the real path, the posed root `root(k)`; each frame's ring and pip on both frames. */
function frames(r: Rig, n: number, root: ((k: number) => number) | null, each?: (k: number) => void): Record<'hd' | 'ps2', { ring: [number, number]; pip: [number, number] }[]> {
  const out = { hd: [] as { ring: [number, number]; pip: [number, number] }[], ps2: [] as { ring: [number, number]; pip: [number, number] }[] };
  for (let k = 0; k < n; k++) {
    const dt = 1 / 60 + 0.002 * Math.sin(k * 1.7);               // a browser's frame times
    if (root) r.walk.setPosedRoot(root(k));
    r.fly.update(dt); r.walk.frame(dt);
    r.aimReticle(dt);
    r.reticle.setPip(PIP_AT, false);                             // a blocked muzzle's pip, after the pass's own
    each?.(k);
    out.ps2.push(drawn(r.reticle, PS2));
    out.hd.push(drawn(r.reticle, HD));
  }
  return out;
}

const distinct = (vs: number[]): number => new Set(vs).size;
const maxStep = (vs: number[]): number => vs.slice(1).reduce((m, v, i) => Math.max(m, Math.abs(v - vs[i]!)), 0);
const breathing = (base: number, amp: number) => (k: number): number => base + amp * Math.sin(k * 0.05);

/** Every part of every frame the same on both frames. */
function expectStill(run: ReturnType<typeof frames>, label: string): void {
  for (const f of ['hd', 'ps2'] as const) {
    for (const part of ['ring', 'pip'] as const) {
      for (const axis of [0, 1] as const) {
        expect(distinct(run[f].map((d) => d[part][axis])), `${label}: ${f} ${part} axis ${axis}`).toBe(1);
      }
    }
  }
}

/** The pip and the ring never step a whole frame pixel between two frames, on both frames. */
function expectSmooth(run: ReturnType<typeof frames>, label: string): void {
  for (const f of ['hd', 'ps2'] as const) {
    for (const part of ['ring', 'pip'] as const) {
      for (const axis of [0, 1] as const) {
        expect(maxStep(run[f].map((d) => d[part][axis])), `${label}: ${f} ${part} axis ${axis}`).toBeLessThan(1);
      }
    }
  }
}

describe('(a) standing still in the open: the drawn camera is the game\'s, the centre exact', () => {
  for (const [label, scoped, yaw, pitch] of [['the head view', true, 37, -5], ['third person', false, 37, -5], ['third person, level', false, 0, 0]] as const) {
    it(`${label}, 300 frames on the breathing root: the ring and the pip never move, the original's (320, 224)`, () => {
      const r = rig([floor], { scoped, yaw, pitch });
      const run = frames(r, 300, breathing(14.5, 0.05));
      expectStill(run, label);
      expect(r.walk.aimCentred()).toBe(true);
      expect(r.reticle.state().aim).toEqual([0.5, 0.5]);
      // The pip's corner (int)(320 + 40 - 8) = 352, (int)(224 + 30 - 8) = 246: its centre (360, 254) on the PS2 frame.
      expect(run.ps2[0]!.pip).toEqual([360, 254]);
      // The ring (65 wide): (int)(320 - 32.5) = 287, its centre 319.5; (int)(224 - 32.5) = 191, 223.5.
      expect(run.ps2[0]!.ring).toEqual([319.5, 223.5]);
      const s = HD.height / 448;
      expect(run.hd[0]!.pip).toEqual([960 + 40 * s, 540 + 30 * s]);
    });
  }
});

describe('(b) a roof inside the near rectangle (the drawn camera slid, H309), the breathing root across the margin', () => {
  // The roof 26.3 over the floor: the standing third-person camera's near rectangle meets it on some breaths and not
  // others, so the drawn eye slides under it by 0 .. 0.15 units at the idle's rhythm.
  it('the drawn camera is displaced on some frames: the signal says so', () => {
    const r = rig([floor, roof(26.3)]);
    let slid = 0, centred = 0;
    frames(r, 300, breathing(14.5, 0.05), () => { if (r.walk.aimCentred()) centred++; else slid++; });
    expect(slid).toBeGreaterThan(0);
    expect(centred).toBeGreaterThan(0);
  });

  it('300 frames: the pip and the ring move with the slide, never a whole frame pixel frame to frame', () => {
    const r = rig([floor, roof(26.3)]);
    const run = frames(r, 300, breathing(14.5, 0.05));
    expectSmooth(run, 'the marginal roof');
    expect(distinct(run.hd.map((d) => d.pip[1]))).toBeGreaterThan(1);     // the slide is real motion: it is shown
  });

  it('a roof the camera always clears under the breath (26.46): the centre exact, as in the open', () => {
    const r = rig([floor, roof(26.46)]);
    expectStill(frames(r, 300, breathing(14.5, 0.05)), 'the clear roof');
  });
});

describe('(c) a jump under a low face (the jump\'s overhead cap, JUMP_OVERHEAD_CAMERA_ADAPTATION)', () => {
  // A standing jump's posed root rises to 15.08 (the clip's, `playerCamera.test.ts`; here a synthetic arc 11.484 ->
  // 15.08 -> 11.484 over a second), so the look point rises through a roof at 24 and the cap lowers the drawn camera
  // by 0 .. 3 units while the game's eye rises: the aim point leaves the frame's centre by up to ~1.5 PS2 pixels.
  const arc = (k: number): number => 11.484 + (15.08 - 11.484) * Math.sin((Math.PI * Math.min(k, 60)) / 60);
  it('a standing jump under a roof at 24: the gate opens, the drawn camera moves, the pip never steps a whole frame pixel', () => {
    const r = rig([floor, roof(24)]);
    frames(r, 20, () => 11.484);
    expect(r.inner.walker.jump(), 'the jump starts').toBe(true);
    let open = 0, slid = 0;
    const run = frames(r, 80, arc, () => { if (r.inner.player.jumping) open++; if (!r.walk.aimCentred()) slid++; });
    expect(open, 'the jump\'s gate was open').toBeGreaterThan(0);
    expect(slid, 'the drawn camera was displaced').toBeGreaterThan(0);
    expect(distinct(run.hd.map((d) => d.pip[1])), 'the drawn camera\'s slide is shown').toBeGreaterThan(2);
    expectSmooth(run, 'the jump under the roof');
  });
});

/** A vertical wall across z at `x` (z -40..80, y 0..`top`), beside the standing body's third-person eye (x 0, z 28.75). */
const wallX = (x: number, top = 60): WorldPoly => quad([x, 0, -40, x, 0, 80, x, top, 80, x, top, -40], 2, 'worldmodel/wallx');
/** A wall beside the body leaning in over it: its face at `x0 + k (y - 24.5)` (the standing eye's height 24.5), z -40..80. */
const leaning = (x0: number, k: number): WorldPoly => {
  const xa = x0 + k * (0 - 24.5), xb = x0 + k * (60 - 24.5);
  return quad([xa, 0, -40, xa, 0, 80, xb, 60, 80, xb, 60, -40], 2, 'worldmodel/leaning');
};
/** A wall across x at `z` between the body and its eye, wound facing the body: the pass (one-sided) passes it from behind. */
const wallZAway = (z: number): WorldPoly => quad([-40, 0, z, 40, 0, z, 40, 60, z, -40, 60, z], 2, 'worldmodel/wallz');
/** A roof at `y` over x >= `x0` only: its edge beside the body's axis. */
const roofFrom = (y: number, x0: number): WorldPoly => quad([x0, y, 200, 200, y, 200, 200, y, -200, x0, y, -200], 3, 'worldmodel/roofpart');

/** The drawn eye (the frame's camera) through a run, beside `frames`' `each`. */
function eyes(r: Rig): { x: number[]; y: number[]; z: number[]; push: () => void } {
  const out = { x: [] as number[], y: [] as number[], z: [] as number[], push: () => {
    const p = r.fly.camera.position;
    out.x.push(p.x); out.y.push(p.y); out.z.push(p.z);
  } };
  return out;
}

/**
 * A discrete move of the drawn camera (the near clearance engaging or letting go in one frame, the cap meeting a roof's
 * edge) moves the whole picture, and under RETICLE_DISPLACED_CAMERA_AIM_ADAPTATION's default the mark with it. What is
 * held: never a whole PS2 pixel on the PS2 frame (the old grid's step), and on 1080p no step of a frame pixel or more
 * on a frame where the drawn eye itself did not move by `jump` units -- the mark moves only with the picture.
 */
function expectMovesWithPicture(run: ReturnType<typeof frames>, eye: ReturnType<typeof eyes>, label: string, jump = 0.4): number {
  for (const part of ['ring', 'pip'] as const) {
    for (const axis of [0, 1] as const) {
      expect(maxStep(run.ps2.map((d) => d[part][axis])), `${label}: ps2 ${part} axis ${axis}`).toBeLessThan(1);
    }
  }
  let worst = 0;
  for (let k = 1; k < run.hd.length; k++) {
    const step = Math.max(Math.abs(run.hd[k]!.pip[0] - run.hd[k - 1]!.pip[0]), Math.abs(run.hd[k]!.pip[1] - run.hd[k - 1]!.pip[1]));
    const moved = Math.hypot(eye.x[k]! - eye.x[k - 1]!, eye.y[k]! - eye.y[k - 1]!, eye.z[k]! - eye.z[k - 1]!);
    if (step >= 1) expect(moved, `${label}: frame ${k} the pip stepped ${step} hd px with the drawn eye still`).toBeGreaterThan(jump);
    worst = Math.max(worst, step);
  }
  return worst;
}

describe('(e) a wall beside the body (the drawn camera slid on x, H309), the breathing root', () => {
  it('a wall leaning in over the body, inside the near rectangle: the clearance slides the drawn eye on x every frame, the pip with it, never a whole frame pixel', () => {
    const r = rig([floor, leaning(0.7, 4)]);
    frames(r, 30, breathing(14.5, 0.05));
    const eye = eyes(r);
    let slid = 0;
    const run = frames(r, 300, breathing(14.5, 0.05), () => { eye.push(); if (!r.walk.aimCentred()) slid++; });
    expect(slid, 'displaced every frame').toBe(300);
    expect(Math.max(...eye.x) - Math.min(...eye.x), 'the drawn eye slides on x with the breath').toBeGreaterThan(0.1);
    expect(Math.abs(eye.x[299]! - r.walk.fireAim()!.eye[0]!), 'the slide is the drawn camera\'s, not the game\'s').toBeGreaterThan(0.3);
    expectSmooth(run, 'the leaning wall');
    expect(distinct(run.hd.map((d) => d.pip[0])), 'the slide on x is shown').toBeGreaterThan(1);
  });

  it('a wall between the body and its eye, which the pass passes from behind: the body-side pull-back holds the drawn eye in, the pip steady', () => {
    const r = rig([floor, wallZAway(10)]);
    frames(r, 30, breathing(14.5, 0.05));
    const eye = eyes(r);
    let slid = 0;
    const run = frames(r, 300, breathing(14.5, 0.05), () => { eye.push(); if (!r.walk.aimCentred()) slid++; });
    expect(slid, 'displaced every frame').toBe(300);
    expect(Math.max(...eye.z), 'the drawn eye pulled in to the wall\'s body side').toBeLessThan(10);
    expect(r.walk.fireAim()!.eye[2], 'the game\'s eye the pass\'s').toBeCloseTo(28.75, 3);
    expectSmooth(run, 'the pull-back');
  });

  it('a pinned peek beside a wall (the peek\'s two anchors and the frame\'s peek recheck): displaced, the pip never a whole frame pixel', () => {
    const r = rig([floor, wallX(1)]);
    r.walk.peekPin = 1;
    frames(r, 30, breathing(14.5, 0.05));
    let slid = 0;
    const run = frames(r, 300, breathing(14.5, 0.05), () => { if (!r.walk.aimCentred()) slid++; });
    expect(slid, 'displaced every frame').toBe(300);
    expectSmooth(run, 'the peek beside the wall');
  });

  it('a parapet whose edge the breath crosses: the clearance engages and lets go in one frame, the mark moves only with the picture', () => {
    // The wall 1 beside the eye, its top at 23.5: the near rectangle's lower corners meet it on the low breaths only,
    // and there the clearance pushes the drawn eye 0.9 units off it in one frame (measured here, 2026-11-22: the pip
    // steps 1.84 px at 1080p, 0.62 PS2 px, with the picture; RETICLE_DISPLACED_CAMERA_AIM_ADAPTATION's default).
    const r = rig([floor, wallX(1, 23.5)]);
    frames(r, 30, breathing(14.5, 0.05));
    const eye = eyes(r);
    let slid = 0, centred = 0;
    const run = frames(r, 300, breathing(14.5, 0.05), () => { eye.push(); if (r.walk.aimCentred()) centred++; else slid++; });
    expect(slid).toBeGreaterThan(0);
    expect(centred).toBeGreaterThan(0);
    expect(maxStep(eye.x), 'the drawn eye\'s own step on x').toBeGreaterThan(0.8);
    expect(expectMovesWithPicture(run, eye, 'the parapet')).toBeGreaterThan(1);
  });

  it('a jump beside a roof\'s edge (the cap entered sideways): the cap moves the drawn camera, the mark only with it', () => {
    const r = rig([floor, roofFrom(24, 0.5)]);
    frames(r, 20, () => 11.484);
    expect(r.inner.walker.jump(), 'the jump starts').toBe(true);
    const arc = (k: number): number => 11.484 + (15.08 - 11.484) * Math.sin((Math.PI * Math.min(k, 60)) / 60);
    const eye = eyes(r);
    let slid = 0;
    const run = frames(r, 80, arc, () => { eye.push(); if (!r.walk.aimCentred()) slid++; });
    expect(slid, 'the drawn camera was displaced').toBeGreaterThan(0);
    expectMovesWithPicture(run, eye, 'the roof\'s edge');
  });
});

describe('(d) crouched and prone idles in the open: exactly constant', () => {
  for (const [stance, root, amp] of [['crouch', 5.5, 0.05], ['prone', 2.2, 0.03]] as const) {
    for (const scoped of [false, true]) {
      it(`${stance}, ${scoped ? 'the head view' : 'third person'}, 300 frames on the breathing root`, () => {
        const r = rig([floor], { stance, scoped, yaw: 37, pitch: -5 });
        frames(r, 30, breathing(root, amp));                    // the stance's change settled
        expectStill(frames(r, 300, breathing(root, amp)), `${stance} ${scoped}`);
      });
    }
  }
});
