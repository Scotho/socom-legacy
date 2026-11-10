import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Zar } from '@s2u/archive';
import { buildGrid, parseMotionZar, type Grid, type WorldPoly } from '@s2u/scene';
import { PROBE_LIFT_FLOOR_R0004, RUNNING_JUMP_ROOT, Walker } from '../src/mover';

/**
 * JUMP-AIR (research 80 s7; Craig's movement seat, 2026-11-08): the running jump's launch lifts its airborne floor pick
 * by max(the posed root, r0004's standing floor) = 11.48, traced on r0004 (`agent-mail/evidence/jump-air/ORIGIN-TRACE.md`),
 * rather than the port's former 5.5. PROBE-ORIGIN (LATER 785) takes the same rule for the ground and every airborne
 * state (`Walker.probeLift`, `test/probeOrigin.test.ts`).
 */

const quad = (pts: number[], ditype: number, path: string): WorldPoly => ({
  modelName: 'worldmodel', path, region: 0, ditype, material: 25, ptcount: 4, cameratype: 0, points: Float32Array.from(pts),
});
function world(polys: WorldPoly[]): Grid {
  const owners = polys.map((p, first) => ({ modelName: p.modelName, path: p.path, first, count: 1 }));
  return buildGrid({ atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 }, [], [], polys, owners);
}
/** A floor at 0 and a plank 20 over it with no face (a floor polygon alone) from z -50 to -150: only the pick reaches it. */
const plankWorld = (): Grid => world([
  quad([-200, 0, -200, 200, 0, -200, 200, 0, 200, -200, 0, 200], 3, 'worldmodel/floor'),
  quad([-50, 20, -150, 50, 20, -150, 50, 20, -50, -50, 20, -50], 3, 'worldmodel/plank'),
]);
const RUN = { forward: 1, right: 0, boost: false };
const STILL = { forward: 0, right: 0, boost: false };

describe('the running jump\'s floor pick lifts by r0004\'s floored root (JUMP-AIR; LATER 785)', () => {
  it('the launch\'s lift is 11.48: the root 10.57 under r0004\'s standing floor (the r0004 trace: 11.480 every launch frame)', () => {
    expect(Math.max(RUNNING_JUMP_ROOT, PROBE_LIFT_FLOOR_R0004.stand)).toBeCloseTo(11.480, 3);
  });

  it('a running jump under a plank 20 over its feet lands on the plank (the window reaches the feet + 11.48 + 1)', () => {
    // The launch's apex is 11.49 over the take-off (research 80 s8): the port's former window (+ 5.5 + 1) reached 18.0,
    // the launch's (+ 11.48 + 1) 23.97, so only r0004's lift takes a floor at 20.
    expect(11.49 + 5.5 + 1).toBeLessThan(20);
    expect(11.49 + PROBE_LIFT_FLOOR_R0004.stand + 1).toBeGreaterThan(20);
    const w = new Walker(plankWorld());
    expect(w.place(0, 1, 30)).toBe(true);
    w.state.yaw = 0;                                              // forward is -z
    for (let i = 0; i < 120 && w.state.z > -20; i++) w.tick(RUN);
    expect(Math.hypot(w.state.vx, w.state.vz)).toBeGreaterThan(60);   // at the run
    expect(w.jump()).toBe(true);
    expect(w.action?.name).toBe('launch');
    let landed: number | null = null;
    for (let i = 0; i < 120 && landed === null; i++) { w.tick(RUN); if (!w.airborne) landed = w.state.y; }
    expect(landed).toBe(20);
  });

  it('a body falling in `fall` (a walk-off, not the launch) at the same height takes the plank too (LATER 785: posture 0, 11.48)', () => {
    const w = new Walker(plankWorld());
    expect(w.place(0, 1, -100)).toBe(true);
    Object.assign(w.state, { x: 0, y: 11.4, z: -100, vx: 0, vz: 0 });
    w.setAirborne(true, 0);
    w.tick(STILL);
    expect(w.state.y).toBe(20);                                   // the first tick's pick already reaches it (feet + 12.48)
    for (let i = 0; i < 120 && w.airborne; i++) w.tick(STILL);
    expect(w.state.y).toBe(20);                                   // 11.4 + 11.48 + 1 >= 20 (the port's former 5.5: the floor under it)
  });
});

/** The player's pack, `RUN/MOTION_P.ZAR`, off the disc (`SOCOM_DISC`) or the served tree; skipped where absent. */
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : '';
const PACKS = [DISC && join(DISC, 'RUN', 'MOTION_P.ZAR'), resolve(__dirname, '../../../public/maps/RUN/MOTION_P.ZAR')].filter((p) => p && existsSync(p));
const PACK = PACKS[0] ?? '';

describe.skipIf(!PACK)(`RUNNING_JUMP_ROOT against the disc's seal_runningjump_launch${PACK ? '' : ' (no MOTION_P.ZAR: SOCOM_DISC -- skipped)'}`, () => {
  it('its skel_root sits at RUNNING_JUMP_ROOT over the feet on every key (research 80 s2.2: "its root height is constant")', () => {
    const clips = parseMotionZar(Zar.parse(new Uint8Array(readFileSync(PACK))));
    const clip = clips.find((c) => c.name === 'seal_runningjump_launch');
    expect(clip).toBeDefined();
    const root = clip!.parts.find((p) => p.name === 'skel_root')!;
    const ys: number[] = [];
    for (let i = 1; i < root.translations.length; i += 3) ys.push(root.translations[i]!);
    expect(ys.length).toBeGreaterThan(0);
    for (const y of ys) expect(y).toBeCloseTo(RUNNING_JUMP_ROOT, 2);
  });
});
