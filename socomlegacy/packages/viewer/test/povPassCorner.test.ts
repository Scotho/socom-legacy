import { describe, expect, it } from 'vitest';
import { segmentHits } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { simMapFromBytes } from '../src/simMap';
import { CAM_MARGIN, localCamera, toWorld, type Vec3 } from '../src/cameraRig';
import { INIT_AIM_PITCH, PlayerCamera } from '../src/playerCamera';
import { isCameraClassSurface } from '../src/mover';

/**
 * PV-10e (the player's-view lane; product track, no claim about the original): research 402 section 2, "the boom after
 * a wall" -- the second rendered run's run leg (`agent-mail` evidence `player-view/pv10-run2-c27485f55`), held on the
 * disc's MP2 at the inputs the three pages had. After command 6107 the owner's feet (from his drawn frames) stood 0.44
 * from the chord the wire's samples at 6106 and 6108 give a watcher for 6107; the yaw, pitch and root were equal. The
 * camera's own tick (`PlayerCamera.tick` -> `cameraRig.ts` `cameraPass`, its main probe and its type-1 filter -- nothing
 * of the rig re-implemented here) keeps a hit at the owner's feet, at the far end of the probe, and none at the chord's:
 * the hit the owner's camera took and the watchers' missed. Disc maps skip when the fixture is absent.
 */

const YAW = 44.143079953338614;                 // the three pages' camera yaw through the leg (the dumps' `yaw`)
const ROOT = 10.3046875;                        // the three pages' `camRoot`
const OWNER_6107: Vec3 = [752.959, 100, 558.816];   // the owner's feet after command 6107, from his drawn frames
const CHORD_6107: Vec3 = [752.9375, 100, 558.375];  // the midpoint of the wire's samples at 6106 and 6108 (the 1/8 grid)

const add = (a: readonly number[], b: readonly number[]): Vec3 => [a[0]! + b[0]!, a[1]! + b[1]!, a[2]! + b[2]!];
const sub = (a: readonly number[], b: readonly number[]): Vec3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const scale = (a: readonly number[], k: number): Vec3 => [a[0]! * k, a[1]! * k, a[2]! * k];
const len = (a: readonly number[]): number => Math.hypot(a[0]!, a[1]!, a[2]!);

describe('PV-10e: the run leg\'s pass at command 6107 (research 402 s2)', () => {
  const bytes = fixture('RUN/MP2.ZDB');
  it.skipIf(!bytes)(`the owner's feet keep a main-probe hit, the chord's do not (${FIXTURES_ABSENT} skips)`, () => {
    const grid = simMapFromBytes(bytes!, 'RUN/MP2.ZDB').grid;
    // One tick of a fresh camera: the pass starts at 10000, takes the reach, and a kept main hit cuts it to the hit's
    // distance less the margin (`cameraPass` :253-268) -- so a distance under the reach is a kept main-probe hit.
    const tick = (feet: Vec3): { dist: number; target: Vec3 } => {
      const c = new PlayerCamera(grid);
      c.tick(feet, YAW, INIT_AIM_PITCH, ROOT, 1 / 60, true);
      return { dist: c.distance(), target: c.view(1).aim.target };
    };
    // The probe's reach: the target is `local.dist` from the eye the pass is handed (`PlayerCamera.tick`), plus the margin.
    const reach = localCamera(ROOT, INIT_AIM_PITCH, 0).dist + CAM_MARGIN;
    const owner = tick(OWNER_6107), chord = tick(CHORD_6107);
    expect(chord.dist).toBeCloseTo(reach, 6);                   // no kept hit
    expect(owner.dist).toBeLessThan(reach - 0.1);               // a kept hit ...
    expect(owner.dist + CAM_MARGIN).toBeGreaterThan(reach - 0.5);   // ... at the probe's far end: a graze
    // Which surface: the camera surfaces on the main probe's line, the one at the kept hit's distance. The line runs from
    // the camera's own target (`aim.target`) back through the eye it was handed, `eyeL` placed by the feet and the yaw as
    // `PlayerCamera.tick` places it (:541 `eyeL`, applied through `world` :548; no lead probe at this pitch) -- the pass's eye after its
    // side probes (`aim.eye`) is not on that line.
    const local = localCamera(ROOT, INIT_AIM_PITCH, 0);
    const eye0 = toWorld(OWNER_6107, YAW, add(local.target, scale(local.back, local.dist)));
    const back = sub(eye0, owner.target), along = scale(back, reach / len(back));   // `cameraPass` :249, toward the eye
    const at = segmentHits(grid, owner.target, add(owner.target, along), isCameraClassSurface)
      .find((h) => Math.abs(len(sub(h.point, owner.target)) - (owner.dist + CAM_MARGIN)) < 1e-3);
    expect(at?.poly.path).toMatch(/container_blue01/);
    // How sensitive: along the line from the chord's feet to the owner's, the kept hit begins between 0.25 and 0.30 units.
    const off = (k: number): Vec3 => add(CHORD_6107, scale(sub(OWNER_6107, CHORD_6107), k / len(sub(OWNER_6107, CHORD_6107))));
    expect(tick(off(0.25)).dist).toBeCloseTo(reach, 6);
    expect(tick(off(0.30)).dist).toBeLessThan(reach - 0.1);
  });
});
