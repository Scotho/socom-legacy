import { describe, expect, it } from 'vitest';
import { buildGrid, GameFrameAccumulator, type WorldPoly } from '@s2u/scene';
import { ACTION_CLIPS, ACTION_SECONDS, moverSnapshot, TICK, Walker } from '../src/mover';
import {
  CORPSE_TILT_READING, DEAD_AIR_TILT_WINDOW, rootTiltStart, rotateByQuat, stepRootTilt, tiltTopOfSnapshot, tiltWeight, tiltWindowOf,
  type RootTiltState,
} from '../src/rootTilt';

/**
 * PRONE-TILT-2 (4) (research 217 s7.9; reading, pending review): the knock's falls and the corpses on their windows.
 * `FUN_005807d0` (the knock's fall) pushes `Fall forward` / `Fall backwards` at posture word 8 when the body is dead
 * (`+0xe1` bit 4 clear, research 225 s6) and at 0 or the body's own posture word when it is alive (D:L442094-442102), so
 * in the air `FUN_00548090` writes a dead knocked body's root by the fall's phase over 0.8 / 0.99 (D:L413207-413214) and a
 * living one's not at all. The fall runs till the landing (no `seconds`): its phase is its clip's own (`ACTION_SECONDS`).
 * A corpse on the ground runs the rule on its clip's window (`CORPSE_TILT_READING` `'by-span'`).
 */

const rad = (d: number): number => (d * Math.PI) / 180;
const UPHILL_20 = [0, Math.cos(rad(20)), Math.sin(rad(20))] as const;
const angle = (a: readonly number[], b: readonly number[]): number =>
  (Math.acos(Math.min(1, (a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!) / (Math.hypot(...a) * Math.hypot(...b)))) * 180) / Math.PI;

function plane(n: readonly number[]): { grid: ReturnType<typeof buildGrid>; y: (x: number, z: number) => number } {
  const y = (x: number, z: number): number => -(n[0]! * x + n[2]! * z) / n[1]!;
  const p: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/slope', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-400, y(-400, 400), 400, 400, y(400, 400), 400, 400, y(400, -400), -400, -400, y(-400, -400), -400]),
  };
  const grid = buildGrid({ atomCount: 8192, posts: 16, cellDim: 200, cellsX: 4, cellsZ: 4, originX: -400, originZ: -400 },
    [], [], [p], [{ modelName: p.modelName, path: p.path, first: 0, count: 1 }]);
  return { grid, y };
}

/** A walker on the slope knocked high (`Fall forward`), ticked till it lands; each airborne tick's root and fall phase. */
function knocked(dead: boolean): { w: Walker; air: { phase: number; q: RootTiltState['q'] }[] } {
  const { grid, y } = plane(UPHILL_20);
  const w = new Walker(grid);
  w.place(0, y(0, 0) + 5, 0);
  w.state.yaw = 0;
  for (let i = 0; i < 10; i++) w.tick({ forward: 0, right: 0, boost: false });
  if (dead) w.dead = true;
  w.knock([0, 260, 0], 'fallForward');
  const air: { phase: number; q: RootTiltState['q'] }[] = [];
  const end = (ACTION_CLIPS.fallForward.frames - 1) / ACTION_CLIPS.fallForward.frames;
  for (let i = 0; i < 600 && (i === 0 || w.airborne); i++) {
    w.tick({ forward: 0, right: 0, boost: false });
    const a = w.action;
    if (w.airborne && a?.name === 'fallForward') air.push({ phase: Math.min(a.t / ACTION_SECONDS.fallForward, 1) * end, q: w.rootTilt.q });
  }
  return { w, air };
}

describe('the knock\'s falls and the corpses (FUN_005807d0, FUN_00548090 D:L413207-413214)', () => {
  it('a dead knocked body in the air: nothing written under the fall\'s phase 0.8, the root leaned by its 0.8 / 0.99 weight past it', () => {
    expect(DEAD_AIR_TILT_WINDOW).toEqual([0.8, 0.99]);
    const { air } = knocked(true);
    expect(air.length).toBeGreaterThan(100);                          // a flight long enough to pass phase 0.8 (1.39 s)
    let written = 0;
    // the rule runs once a game frame (two walk ticks): a tick whose phase and the one before both weigh over 0 has been
    // written; one at or under the window's foot not
    for (let i = 0; i < air.length; i++) {
      const { phase, q } = air[i]!;
      if (tiltWeight(phase, 0.8, 0.99) > 0 && i > 0 && tiltWeight(air[i - 1]!.phase, 0.8, 0.99) > 0) {
        expect(q, `phase ${phase}`).not.toBeNull();
        written++;
      } else if (tiltWeight(phase, 0.8, 0.99) === 0) expect(q, `phase ${phase}`).toBeNull();
    }
    expect(written).toBeGreaterThan(5);
    const last = air[air.length - 1]!;
    expect(angle(rotateByQuat(last.q!, [0, 1, 0]), [0, 1, 0])).toBeGreaterThan(5);   // toward the slope's normal
  });

  it('a living knocked body writes nothing in the air (its fall not pushed at 8); landed, its Land forward tilts by (0.5, 0.9)', () => {
    const { w, air } = knocked(false);
    expect(air.length).toBeGreaterThan(100);
    for (const { q } of air) expect(q).toBeNull();
    let landed = 0;
    for (let i = 0; i < 60; i++) { w.tick({ forward: 0, right: 0, boost: false }); if (w.rootTilt.q) landed++; }
    expect(landed).toBeGreaterThan(0);
  });

  it('a corpse on the ground runs the rule on its clip\'s window (CORPSE_TILT_READING "by-span"): the dead landing leans on the slope', () => {
    expect(CORPSE_TILT_READING).toBe('by-span');
    const { w } = knocked(true);
    let leaned = 0;
    for (let i = 0; i < 120; i++) {
      w.tick({ forward: 0, right: 0, boost: false });
      if (w.rootTilt.q && angle(rotateByQuat(w.rootTilt.q, [0, 1, 0]), [0, 1, 0]) > 5) leaned++;
    }
    expect(leaned).toBeGreaterThan(0);
  });

  it('the page\'s copy of a knocked body (tiltTopOfSnapshot) steps the same root as the walker, tick for tick (A = B)', () => {
    for (const dead of [false, true]) {
      const { grid, y } = plane(UPHILL_20);
      const w = new Walker(grid);
      w.place(0, y(0, 0) + 5, 0);
      w.state.yaw = 0;
      if (dead) w.dead = true;
      w.knock([0, 260, 0], 'fallForward');
      let copy = rootTiltStart(), written = 0;
      const clock = new GameFrameAccumulator();                       // the page's copy steps once a game frame, as remoteTilt
      const frames = (a: string): number => (ACTION_CLIPS as Readonly<Record<string, { frames: number }>>)[a]?.frames ?? 1;
      const seconds = (a: string): number => (ACTION_SECONDS as Readonly<Record<string, number>>)[a] ?? 0;
      for (let i = 0; i < 400; i++) {
        w.tick({ forward: 0, right: 0, boost: false });
        const snap = moverSnapshot(w, null, 0, 0);
        const top = tiltTopOfSnapshot(snap, frames, seconds);
        for (let f = clock.advance(TICK); f > 0; f--) {
          copy = stepRootTilt(copy, {
            normal: () => w.tiltNormal, yaw: snap.yaw, span: tiltWindowOf(top.clip), phase: top.phase,
            prone: snap.stance === 'prone' && !top.diving, proneTransition: top.proneTransition, diving: top.diving,
            airborne: snap.airborne, deadTop: dead,
          });
        }
        expect(copy.q, `dead ${dead}, tick ${i}`).toEqual(w.rootTilt.q);
        if (w.rootTilt.q) written++;
      }
      expect(written).toBeGreaterThan(5);
    }
  });
});
