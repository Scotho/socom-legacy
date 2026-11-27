// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { segmentHits, type Grid } from '@s2u/scene';
import { CAM_FAR, CAM_MARGIN, cameraPass, localCamera, newPassState, toWorld, type Vec3 } from '../src/cameraRig';
import { isCameraClassSurface } from '../src/mover';
import { simMapFromBytes } from '../src/simMap';

/**
 * LATER 1057 / issue #812 on the dev disc (`SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`; skipped -- and said so --
 * without it; with it, the map file missing is a failure). The playtest finding (PT-20261115-4a3a-1): at Crossroads'
 * (MP72) gray tent a standing SEAL walking in and out under the front valance (`tent_gray`: x 1405.5-1438, y 62.5-70,
 * z 1550.7-1554.5, material 30, camera-class, one-sided facing out, no inward twin) had the boom drop 26.80 -> 0.75 in
 * one tick and a 1.5 s hold, because the port's pass cast both ways and met the valance from inside. The original's
 * pass is one-sided on the hull (`FUN_002d2890` / `FUN_002d3030` side mode 0x20 for a collider whose `+0x80` bit 1 is
 * clear, D:L174831-174837, D:L175152-175157, D:L175277-175282; `FUN_00316e30` D:L215827-215828; research 382 s8):
 * reading, pending review. The walk is the investigation's own (`agent-mail/evidence/pt-tent-eave/camera/sim.ts`): feet
 * on the tent's floor at x 1423.85, facing yaw 182.256, the stand's root 11.484375, pitch -8, 18 u/s from z 1520 in to
 * 1575, a 1 s stop, back out to 1520, a 4 s stop, the port's 60 Hz tick. The boom stays the goal's reach, 26.80, and the
 * hold 0, at every tick in and out.
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const HAVE_DISC = DISC !== '';

const X = 1423.85, YAW = 182.256, Z0 = 1520, Z1 = 1575, SPEED = 18, PITCH = -8;
const ROOT = 11.484375, FLOOR = 43.49980163574219, DT = 1 / 60;

const sub = (a: readonly number[], b: readonly number[]): Vec3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const add = (a: readonly number[], b: readonly number[]): Vec3 => [a[0]! + b[0]!, a[1]! + b[1]!, a[2]! + b[2]!];
const scale = (a: readonly number[], k: number): Vec3 => [a[0]! * k, a[1]! * k, a[2]! * k];
const unit = (a: readonly number[]): Vec3 => { const l = Math.hypot(a[0]!, a[1]!, a[2]!); return scale(a, 1 / l); };

/** The feet's z along the walk: in, the stop, out, the stop (sim.ts's path). */
function path(): number[] {
  const out: number[] = [];
  const steps = Math.round(Math.abs(Z1 - Z0) / SPEED / DT);
  for (let i = 0; i <= steps; i++) out.push(Z0 + ((Z1 - Z0) * i) / steps);
  for (let i = 0; i < Math.round(1 / DT); i++) out.push(Z1);
  for (let i = 0; i <= steps; i++) out.push(Z1 + ((Z0 - Z1) * i) / steps);
  for (let i = 0; i < Math.round(4 / DT); i++) out.push(Z0);
  return out;
}

/** The target and the goal eye `PlayerCamera.tick` hands the pass at `feet` (no lead probe at pitch -8). */
function goal(feet: Vec3): { target: Vec3; eye0: Vec3 } {
  const local = localCamera(ROOT, PITCH, 0);
  const eye0 = toWorld(feet, YAW, local.eye);
  const far = toWorld(feet, YAW, add(local.target, scale(local.ahead, CAM_FAR)));
  return { eye0, target: add(eye0, scale(unit(sub(far, eye0)), local.dist)) };
}

describe.skipIf(!HAVE_DISC)(`LATER 1057: MP72's gray tent valance, met from inside, does not pull the boom in${HAVE_DISC ? '' : ' (no dev disc -- skipped)'}`, () => {
  it("walking in under tent_gray's front valance and back out, standing: the boom stays 26.80 and the hold 0 at every tick", () => {
    const grid: Grid = simMapFromBytes(new Uint8Array(readFileSync(resolve(DISC, 'RUN', 'MP72.ZDB'))), 'RUN/MP72.ZDB').grid;
    const reach = localCamera(ROOT, PITCH, 0).dist + CAM_MARGIN;
    expect(reach).toBeCloseTo(26.8, 2);
    const state = newPassState();
    let behind = 0;
    const bad: string[] = [];
    for (const z of path()) {
      const feet: Vec3 = [X, FLOOR, z];
      const { target, eye0 } = goal(feet);
      // The case is what it says: the boom's line meets the valance two-sided, and never from its front.
      const end = sub(target, scale(unit(sub(target, eye0)), reach));
      const both = segmentHits(grid, target, end, isCameraClassSurface).filter((h) => /tent_gray/i.test(h.poly.path));
      const front = segmentHits(grid, target, end, isCameraClassSurface, undefined, true).filter((h) => /tent_gray/i.test(h.poly.path));
      if (both.length > 0 && front.length === 0) behind++;
      cameraPass(grid, target, eye0, state, DT);
      if (Math.abs(state.dist - reach) > 1e-6 || state.hold !== 0) bad.push(`z ${z.toFixed(2)}: boom ${state.dist.toFixed(2)} hold ${state.hold.toFixed(2)}`);
    }
    expect(behind, 'ticks whose boom meets the valance from behind only').toBeGreaterThan(0);
    expect(bad, bad.slice(0, 8).join('\n')).toEqual([]);
  });
});
