// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Scene, Vector3 } from 'three';
import { HELD_RIFLE, readKitTable, type WeaponRecord, type WeaponStanceName } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { Accuracy, MAP_FOV, scopeViewOffset } from '../src/accuracy';
import { FlyCamera } from '../src/camera';
import { Hud } from '../src/hud';
import { PlayerLoadout } from '../src/loadout';
import { mountFirearm, type FirearmHands } from '../src/matchFirearm';
import { Play } from '../src/play';
import { RemotePlayers } from '../src/remotePlayers';
import { packGround, WalkMode, type GroundData } from '../src/walk';

/**
 * SCOPE-EXIT-AIM -- the owner's intentional divergence (research 381 section 6; `SCOPE_EXIT_AIM_CARRY_ADAPTATION`). The
 * original jumps back when the scope is left: the camera's offset (`cam+0x480/+0x484`) falls to 0 below view state 5 / 4
 * (`FUN_005b9030` D:L471951-471957) and the look is unchanged -- captured on r0004 (PC 3, M4A1 SD 3/3, M87ELR 3/3,
 * hand-scored, unreviewed). The owner's words (2026-11-22, relayed by the main controller): "kill is requesting that the
 * position of the crosshair moves with the sway of the zoomed in scope. so when you zoom back out after swaying you don't
 * get an awkward jittery adjustment in position. ... if the original is not like this, it will be our fix to implement
 * as an inentional divergenc.e"
 *
 * The rule ("A-prime", stateless): at a view change crossing the scope's 4-edge, the look turns by the angle the scoped
 * side's sway offset draws -- out (>= 4 -> < 4) onto the cross, in (< 4 -> >= 4) by the exact inverse -- from the sway
 * now, at the level's magnification; the sway itself is never touched.
 *
 * (a) the drawn aim is continuous on the way out; (b) ten quick toggles with no sway time return the look to its start;
 * (c) the scoped sway is untouched, (c2) the exit's turn is no stick turn to the exertion; (d) the first round out goes
 * along the cross.
 */

/** The seam is a new module: loaded at run time, so the rows that drive the page's own firearm red on their angle. */
const SEAM = '../src/scopeCarry';
const seam = async (): Promise<typeof import('../src/scopeCarry')> => import(/* @vite-ignore */ SEAM);

const BASE_FOV = (2 * MAP_FOV.vfov * 180) / Math.PI;                   // matchFirearm.ts: baseFov from the map's vfov
const DEG = Math.PI / 180;

function canvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  document.body.appendChild(c);
  return c;
}

/** The direction the frame's centre -- the scope's fixed cross, or the unscoped cross -- shows, as a unit world vector. */
function centreDir(fly: FlyCamera): Vector3 {
  fly.camera.updateMatrixWorld();
  const p = new Vector3(0, 0, 0.5).unproject(fly.camera);
  return p.sub(fly.camera.position).normalize();
}

/** One walking camera for the seam's rows (a camera each would be thousands of canvases). */
let shared: FlyCamera | null = null;

/** The walking camera at a pose (radians), the fov at magnification `m`, the kit's offset drawn. */
function drawn(yaw: number, pitch: number, m: number, offset: [number, number]): FlyCamera {
  const fly = shared ??= new FlyCamera(canvas());
  fly.setWalking(true);
  fly.setPitchLimits(-89, 89);
  fly.setPose({ yaw: yaw / DEG, pitch: pitch / DEG });
  fly.setAspect(4 / 3);
  const half = (BASE_FOV * Math.PI) / 360;
  fly.setFov((360 / Math.PI) * Math.atan(Math.tan(half) / m));
  fly.setKitOffset(...offset);
  return fly;
}

/** The look after a carry from (yaw, pitch), radians, as the camera holds it (`carryLook`'s wrap). */
function lookOf(fly: FlyCamera): { yaw: number; pitch: number } {
  const p = fly.pose();
  return { yaw: p.yaw * DEG, pitch: p.pitch * DEG };
}

describe('SCOPE-EXIT-AIM (a): the seam keeps the drawn aim on the way out, exactly through the direction', () => {
  const pitches = [0, 45 * DEG, 59 * DEG, -60 * DEG];                 // 0, +45, 1 deg inside the stand's max 60, -60
  const yaws = [0, 179.5 * DEG, -179.5 * DEG, 33 * DEG];               // the wrap at +-180
  const cases = (record: WeaponRecord): { state: number; m: number }[] => {
    const out: { state: number; m: number }[] = [{ state: 4, m: 9 }]; // the binoculars: 9x, y only
    for (let i = 1; i < record.zoomModes.length; i++) if (record.zoomModes[i]! > 0) out.push({ state: 4 + i, m: record.zoomModes[i]! });
    return out;
  };
  const sways = (record: WeaponRecord, stance: WeaponStanceName): [number, number][] => {
    const s = record.stances[stance];
    const lx = s.swayLimitX, ly = s.swayLimitY;                        // SniperDistLimitX/Y at exertion 1 (x 1.0)
    return [[lx, ly], [-lx, ly], [lx, -ly], [-lx, -ly], [lx * 0.37, -ly * 0.61], [0, 0]];
  };
  const run = async (record: WeaponRecord): Promise<number> => {
    const { scopeCarry } = await seam();
    let rows = 0;
    for (const { state, m } of cases(record)) {
      for (const stance of ['stand', 'crouch', 'prone'] as const) {
        for (const sway of sways(record, stance)) {
          for (const pitch of pitches) {
            for (const yaw of yaws) {
              const offset = scopeViewOffset(state, sway);
              const before = centreDir(drawn(yaw, pitch, m, offset)).clone();
              const c = scopeCarry(state, 1, sway, m, { yaw, pitch }, BASE_FOV);
              const fly = drawn(yaw, pitch, 1.01, [0, 0]);
              fly.carryLook(c.dyaw, c.dpitch);
              const after = centreDir(fly);
              const angle = before.angleTo(after);
              expect(angle, `${record.name} state ${state} ${stance} sway ${sway} pitch ${pitch / DEG} yaw ${yaw / DEG}`).toBeLessThanOrEqual(1e-6);
              if (state === 4) expect(c.dyaw, 'the binoculars carry y only: the yaw unchanged').toBe(0);
              rows++;
            }
          }
        }
      }
    }
    return rows;
  };

  it('HELD_RIFLE (the fixture, the M4A1 SD class): every level, stance, sway corner, pitch and yaw', async () => {
    expect(await run(HELD_RIFLE)).toBeGreaterThan(0);
  }, 60_000);

  const zweapon = fixture('RUN/ZWEAPON.ZAR');
  it.skipIf(zweapon === null)(`every scoped record on the disc's table, the M87ELR named${zweapon === null ? ` (${FIXTURES_ABSENT})` : ''}`, async () => {
    const table = readKitTable(zweapon!);
    const scoped = [...table.records.values()].filter((r) => r.zoomModes.slice(1).some((z) => z > 0));
    expect(scoped.some((r) => r.name === 'M87ELR'), 'the M87ELR is among them').toBe(true);
    for (const r of scoped) await run(r);
  }, 300_000);

  it('the in-carry is the exact inverse of the out-carry (to 1e-9 rad), at every pitch and the wrap', async () => {
    const { scopeCarry } = await seam();
    for (const pitch of pitches) for (const yaw of yaws) for (const state of [4, 5]) {
      const sway: [number, number] = [17, -21];
      const m = state === 4 ? 9 : HELD_RIFLE.zoomModes[1]!;
      const into = scopeCarry(1, state, sway, m, { yaw, pitch }, BASE_FOV);
      const back = scopeCarry(state, 1, sway, m, { yaw: yaw + into.dyaw, pitch: pitch + into.dpitch }, BASE_FOV);
      expect(Math.abs(into.dyaw + back.dyaw), `yaw ${yaw / DEG} pitch ${pitch / DEG} state ${state}`).toBeLessThanOrEqual(1e-9);
      expect(Math.abs(into.dpitch + back.dpitch)).toBeLessThanOrEqual(1e-9);
    }
  });

  it('not a transition: level steps inside the scope, 4 <-> 5, and moves below 4 carry nothing', async () => {
    const { scopeCarry } = await seam();
    const sway: [number, number] = [17, -21], pose = { yaw: 0.3, pitch: 0.2 };
    for (const [a, b] of [[5, 6], [6, 5], [4, 5], [5, 4], [1, 0], [0, 1], [1, 3], [2, 1], [5, 5]] as const) {
      expect(scopeCarry(a, b, sway, 3, pose, BASE_FOV)).toEqual({ dyaw: 0, dpitch: 0 });
    }
  });

  it("FlyCamera.carryLook: the yaw wrapped, the pitch held to the stance's limits (the cut named, research 381 s6)", () => {
    const fly = drawn(179 * DEG, 59.5 * DEG, 1.01, [0, 0]);
    fly.setPitchLimits(-70, 60);
    const applied = fly.carryLook(2 * DEG, 1 * DEG);
    expect(fly.pose().yaw).toBeCloseTo(181, 9);                        // canonical [0, 360): -179
    expect(fly.pose().pitch).toBeCloseTo(60, 9);
    expect(applied[0]).toBeCloseTo(2 * DEG, 12);
    expect(applied[1]).toBeCloseTo(0.5 * DEG, 12);                     // what the look took, not what was asked
  });
});

// ---- The page's own firearm (`mountFirearm`), as matchFirearm.test.ts's walking rig ----------------------------------

/** A flat floor at y 0 (`matchFirearm.test.ts`'s). */
const FLOOR: GroundData = packGround(
  { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
  [{
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-200, 0, 200, 200, 0, 200, 200, 0, -200, -200, 0, -200]),
  }],
  [{ modelName: 'worldmodel', path: 'worldmodel/floor', first: 0, count: 1 }],
);

/** The hands (`matchFirearm.test.ts`'s): nothing up unless the row says. */
const hands = (over: Partial<FirearmHands> = {}): FirearmHands => ({
  launcherUp: () => false, launcherRoundIcon: () => null, itemUp: () => false, busy: () => false, takeable: () => true,
  putAway: () => {}, spawned: () => {}, trigger: () => false, launched: () => {}, icon: () => null, magazine: () => null,
  mounted: () => false, ...over,
});

function walking(pitchDeg = 0, yawDeg = 0, held?: FirearmHands) {
  const scene = new Scene();
  const fly = new FlyCamera(canvas());
  const walk = new WalkMode(fly);
  const firearm = mountFirearm({
    scene, fly, walk, play: new Play(), remote: new RemotePlayers(scene), hud: new Hud(), loadouts: new PlayerLoadout(),
    view: () => null, map: () => null, body: () => null, net: () => null, blocked: () => false, refreshFog: () => {},
    ...(held ? { hands: held } : {}),
  });
  walk.setGround(FLOOR, [0, 0, 0]);
  fly.setPose({ x: 5, y: 40, z: 6, yaw: yawDeg, pitch: pitchDeg });
  walk.setMode('walk');
  const frame = (dt = 1 / 60): void => {
    walk.frame(dt);
    firearm.gunFrame(dt, true);
    firearm.kitFrame(dt, true);
    firearm.aimReticle(dt);
  };
  for (let i = 0; i < 60; i++) frame();                                // down on the floor and still
  walk.setCamera({ pitch: pitchDeg }, true);                            // the walk's entry put init_aim_pitch (-9.167)
  for (let i = 0; i < 60; i++) frame();                                // the mover takes the look's pitch (the gate's law)
  /** The kit's sway put where the test wants it (the original's state, never the carry's to write). */
  const setSway = (x: number, y: number): void => {
    const a = firearm.accuracy as unknown as { swayX: number; swayY: number };
    a.swayX = x; a.swayY = y;
  };
  /** Into the scope, settled, the sway at (x, y), one frame drawn. */
  const scoped = (x: number, y: number): void => {
    firearm.stepZoom('in');                                            // first person
    firearm.stepZoom('in');                                            // the scope (the SD's 3x, state 5)
    firearm.zoom.settle();
    frame();
    setSway(x, y);
    // The view's writer runs in the frame; draw the set sway without a tick of it (the sway ticks only in gunFrame).
    fly.setKitOffset(...firearm.accuracy.viewOffset(firearm.zoom.state()));
  };
  return { fly, walk, firearm, frame, setSway, scoped };
}

/** The view's writer for a frame with no sway time: the fov and the kit's offset as `viewFrame` sets them. */
function drawView(w: ReturnType<typeof walking>): void {
  const half = (BASE_FOV * Math.PI) / 360;
  w.fly.setFov((360 / Math.PI) * Math.atan(Math.tan(half) / w.firearm.zoom.magnification()));
  w.fly.setKitOffset(...w.firearm.accuracy.viewOffset(w.firearm.zoom.state()));
}

describe("SCOPE-EXIT-AIM on the page's firearm: d-pad Down, setZoom and the second round's drop leave the aim on the cross", () => {
  for (const [label, pitch] of [['pitch 0', 0], ['pitch +45', 45], ['pitch -60', -60]] as const) {
    it(`(a, d) d-pad Down from a settled scope, ${label}: the first frame out looks where the scoped cross was`, () => {
      const w = walking(pitch);
      w.scoped(14, -11);
      expect(w.firearm.zoom.state()).toBeGreaterThanOrEqual(5);
      expect(Math.abs(w.fly.pose().pitch - pitch), 'the row runs near its pitch').toBeLessThan(1);
      const cross = centreDir(w.fly);
      w.firearm.stepZoom('out');
      expect(w.firearm.zoom.state()).toBeLessThan(4);
      drawView(w);
      const out = centreDir(w.fly);
      expect(cross.angleTo(out), 'the angle between the last scoped cross and the first cross out, rad').toBeLessThanOrEqual(1e-6);
      // (d) The round on the first frame out: the cone about the look, the knock cleared by Down (FUN_005b9020) -- along the cross.
      const cone = w.firearm.accuracy.cone(w.firearm.zoom.state(), w.firearm.zoom.magnification());
      expect([Math.abs(cone.offsetX), Math.abs(cone.offsetY)]).toEqual([0, 0]);
    });
  }

  it('(a) setZoom(1) from the scope (the launcher-round mode\'s drop): the aim kept', () => {
    const w = walking(10, 170);
    w.scoped(-18, 9);
    const cross = centreDir(w.fly);
    w.firearm.setZoom(1);
    drawView(w);
    expect(cross.angleTo(centreDir(w.fly))).toBeLessThanOrEqual(1e-6);
  });

  it("(a) the second scoped round's drop (`dropScope`, LATER 233): the aim kept", () => {
    const w = walking(5);
    w.scoped(16, 12);
    const cross = centreDir(w.fly);
    const gun = (w.firearm.fire as unknown as { gun: { round: (dir: [number, number, number], depth: number | null) => unknown } }).gun;
    gun.round([0, 0, -1], null);                                       // the pull's first round: the kick, no drop
    expect(w.firearm.zoom.state()).toBeGreaterThanOrEqual(5);
    gun.round([0, 0, -1], null);                                       // the second: back to first person
    expect(w.firearm.zoom.state()).toBe(1);
    drawView(w);
    expect(cross.angleTo(centreDir(w.fly))).toBeLessThanOrEqual(1e-6);
  });

  it('(b) the trap: ten quick in/out toggles with no sway time return the look to its start (1e-9 rad)', () => {
    for (const pitch of [0, 45, 59.5]) {
      const w = walking(pitch, 120);
      w.firearm.stepZoom('in');                                        // first person
      w.setSway(19, -13);
      const start = lookOf(w.fly);
      expect(start.pitch / DEG, 'the row runs at its pitch').toBeCloseTo(pitch, 9);
      for (let i = 0; i < 10; i++) {
        w.firearm.stepZoom('in');
        expect(w.firearm.zoom.state()).toBeGreaterThanOrEqual(5);
        w.firearm.stepZoom('out');
        expect(w.firearm.zoom.state()).toBe(1);
      }
      const end = lookOf(w.fly);
      expect(Math.abs(end.yaw - start.yaw), `pitch ${pitch}`).toBeLessThanOrEqual(1e-9);
      expect(Math.abs(end.pitch - start.pitch), `pitch ${pitch}`).toBeLessThanOrEqual(1e-9);
    }
  });

  // F3 of the review (the touch list's 2.3): the pitch limit CUTS -- the in-carry's sign pushes the look past the stand's
  // +60, `carryLook` holds it there, so the first cycle moves the look once; every later cycle repeats it exactly.
  for (const [pitch, sway] of [[59.5, [19, 13]], [59.99, [-20, 24]]] as const) {
    it(`(b) the trap at the limit, cutting (pitch ${pitch}, sway ${sway}): after cycle 1 equals after cycle 10 (1e-9 rad)`, () => {
      const w = walking(pitch, 120);
      w.firearm.stepZoom('in');                                        // first person
      w.setSway(sway[0], sway[1]);
      const start = lookOf(w.fly);
      expect(start.pitch / DEG, 'the row runs at its pitch').toBeCloseTo(pitch, 9);
      const cycle = (): void => {
        w.firearm.stepZoom('in');
        expect(w.firearm.zoom.state()).toBeGreaterThanOrEqual(5);
        w.firearm.stepZoom('out');
        expect(w.firearm.zoom.state()).toBe(1);
      };
      cycle();
      const one = lookOf(w.fly);
      expect(Math.abs(one.pitch - start.pitch), 'the row cuts: cycle 1 moved the look').toBeGreaterThan(1e-6);
      for (let i = 1; i < 10; i++) cycle();
      const ten = lookOf(w.fly);
      expect(Math.abs(ten.yaw - one.yaw), `pitch ${pitch}`).toBeLessThanOrEqual(1e-9);
      expect(Math.abs(ten.pitch - one.pitch), `pitch ${pitch}`).toBeLessThanOrEqual(1e-9);
    });
  }

  it('(b) a reset between the exit and the entry (a new life): the entry turns nothing (the scope opens centred)', () => {
    const w = walking(0, 40);
    w.firearm.stepZoom('in');
    w.setSway(0, 0);
    const start = lookOf(w.fly);
    w.firearm.stepZoom('in');
    expect(lookOf(w.fly)).toEqual(start);
  });

  it("(b) the entry turns the look by the exact inverse: the scope opens with the cross on the first person's centre", () => {
    const w = walking(20, -100);
    w.firearm.stepZoom('in');
    w.setSway(-15, 17);
    drawView(w);
    const centre = centreDir(w.fly);
    w.firearm.stepZoom('in');
    w.firearm.zoom.settle();
    drawView(w);
    expect(centre.angleTo(centreDir(w.fly))).toBeLessThanOrEqual(1e-6);
  });

  it('(c1) the scoped sway is untouched by the carries: its value and rates the same after ten toggles', () => {
    const w = walking(0);
    w.scoped(11, -7);
    const a = w.firearm.accuracy as unknown as Record<string, unknown>;
    const keys = ['swayX', 'swayY', 'swayRate'];                       // the value and the flipped rates (accuracy.ts)
    for (const k of keys) expect(a[k], k).toBeDefined();
    const before = keys.map((k) => structuredClone(a[k]));
    for (let i = 0; i < 10; i++) { w.firearm.stepZoom('out'); w.firearm.stepZoom('in'); w.firearm.stepZoom('in'); }
    expect(w.firearm.zoom.state()).toBeGreaterThanOrEqual(5);
    expect(keys.map((k) => a[k])).toEqual(before);
  });

  // F4 of the review: an item taken up while scoped drops the scope to first person (`Zoom.setHold`, `zoom.ts`) inside
  // `stepZoom`; that drop is an exit like any other, so the aim stays on the cross.
  it('(a) an item taken up while scoped (the hold drops the scope in stepZoom): the aim kept', () => {
    const up = { item: false };
    const w = walking(8, 60, hands({ itemUp: () => up.item }));
    w.scoped(17, -12);
    expect(w.firearm.zoom.state()).toBeGreaterThanOrEqual(5);
    const cross = centreDir(w.fly);
    up.item = true;
    w.firearm.stepZoom('out');                                         // the hold drops to 1 first, then Down: below 4
    expect(w.firearm.zoom.state()).toBeLessThan(4);
    drawView(w);
    expect(cross.angleTo(centreDir(w.fly)), 'the angle between the last scoped cross and the first cross out, rad').toBeLessThanOrEqual(1e-6);
  });

  it("(c2) the exit's turn is not a stick turn: the exertion after the first frame out is the no-sway control's", () => {
    const exertionAfterExit = (sx: number, sy: number): number => {
      const w = walking(0);
      w.scoped(sx, sy);
      w.firearm.stepZoom('out');
      w.frame();
      return w.firearm.accuracy.state().exertion;
    };
    expect(exertionAfterExit(20, -24)).toBeCloseTo(exertionAfterExit(0, 0), 12);
  });
});
