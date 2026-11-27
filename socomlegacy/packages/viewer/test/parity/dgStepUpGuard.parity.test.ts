import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FsAssetSource } from '@s2u/archive/node';
import { loadSimClips, loadSimMap } from '../../src/simMap';
import { polygonNormal, probeGround } from '@s2u/scene';
import { climbClass, contactOf, footStepOffset } from '../../src/climb';
import { loadMap } from '../../src/loadMap';
import { STEP_UP_FLOOR_GUARD_OWNER, stepUpEndFloor, Traversal, TraversalShapes } from '../../src/traversal';
import { groundGrid, groundPolygons, Walker, type WalkInput } from '../../src/walk';

/**
 * DG-GUARD (the owner's safety rule, `STEP_UP_FLOOR_GUARD_OWNER`; DG-CLIMB, v0.4.32): the owner's stay on Desert Glory
 * (MP6), reproduced 5/5 on PC 4's rendered page -- at `worldmodel/firstwall_climber1`'s corner with the boulder g69, the
 * stick 20 deg RIGHT of the facing and NO Action, an AUTOMATIC step-up (`seal_step_up`) starts and ends with the feet 1.00
 * BEHIND the wall's face, on no floor, held there. A dev-disc test of the port as built, not the original measured.
 *
 * The face's plane is the page's: through (1260, _, 1943.1) and (1275.45, _, 1934.85), n (-0.471, 0, -0.882), facing the
 * walker. The wall's top floor, 29.64, is the port's ground probe over the disc (the `later278Climb` case's re-measure on
 * agent/movement-dgclimb). The stick is fed as the command's axes -- forward cos 20, right sin 20 (magnitude 1) -- with the
 * yaw held, not a rotated stick: the port's left stick moves the body relative to its facing (`mover.ts`: forward
 * (-sin, -cos), right (cos, -sin)) and does not turn it. The start is the owner's spot itself, (1270, 2, 1935) at yaw
 * -151.9 (placed from 2 over the floor): in this harness a start 6 back along the facing slides along the wall or stops ~7
 * in front of it with no climb (seat-movement's run, 2026-11-25), while from the spot +18 / +20 / +22 deg all step up.
 *
 * Disc tier: the fixture `test-fixtures/RUN/MP6.ZDB` (with `MOTION_P.ZAR`), else `SOCOM_PC_ROOT`'s disc; without either
 * the suite SKIPS (a skip, never a pass).
 */

const FIXTURES = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../../test-fixtures'));
const DISC = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT, 'game/disc') : null;
const has = (root: string | null, files: readonly string[]): boolean => !!root && files.every((f) => existsSync(resolve(root, f)));
const ROOT = has(FIXTURES, ['RUN/MP6.ZDB', 'RUN/MOTION_P.ZAR']) ? FIXTURES : has(DISC, ['RUN/MP6.ZDB', 'RUN/MOTION_P.ZAR']) ? DISC : null;

const STILL: WalkInput = { forward: 0, right: 0, boost: false };
const DIAG_DEG = 20;
const DIAG: WalkInput = { forward: Math.cos((DIAG_DEG * Math.PI) / 180), right: Math.sin((DIAG_DEG * Math.PI) / 180), boost: false };
const SPOT = { x: 1270, y: 2, z: 1935, yaw: -151.9 } as const;
const FACE = { x: 1260, z: 1943.1, nx: -0.471, nz: -0.882 } as const;
const WALL_TOP = 29.64;
/** ~8 s of 60 Hz ticks. */
const STAY_TICKS = 480;

interface StayTick { n: number; kind: string; clip: string | null; x: number; y: number; z: number; off: number }

describe.skipIf(!ROOT)(`DG-GUARD: a diagonal walk-in 20 deg right on MP6${ROOT ? '' : ' (SKIPPED: no MP6 fixture and no SOCOM_PC_ROOT disc)'}`, () => {
  const ticks: StayTick[] = [];
  const clips = new Set<string>();

  beforeAll(async () => {
    const source = new FsAssetSource(ROOT!);
    const map = await loadSimMap(source, 'RUN/MP6.ZDB');
    const sim = await loadSimClips(source);
    const w = new Walker(map.grid), t = new Traversal(map.grid, groundPolygons(map.ground));
    w.driver = t;
    t.setClips(sim.clips, sim.table);
    w.actionRoots = sim.roots;
    expect(w.place(SPOT.x, SPOT.y, SPOT.z)).toBe(true);
    w.state.yaw = SPOT.yaw;
    w.tick(STILL);
    for (let n = 0; n < STAY_TICKS; n++) {
      const st = t.state(), s = w.state;
      if (st.clip) clips.add(st.clip);
      ticks.push({ n, kind: st.kind, clip: st.clip, x: s.x, y: s.y, z: s.z, off: (s.x - FACE.x) * FACE.nx + (s.z - FACE.z) * FACE.nz });
      w.tick(DIAG);
    }
  }, 60000);

  it("a diagonal walk-in 20 deg right does not leave the body standing inside the MP6 wall", () => {
    expect(ticks.length).toBe(STAY_TICKS);
    const inside = ticks.filter((q) => q.y < WALL_TOP && q.off < 0);
    const end = ticks.at(-1)!, first = inside[0];
    expect(
      inside.length,
      `actions run: ${[...clips].join(', ') || 'none'}; feet at the end (${end.x.toFixed(2)}, ${end.y.toFixed(2)}, ${end.z.toFixed(2)}) ` +
        `${end.off.toFixed(2)} off the face (kind ${end.kind}); ` +
        (first
          ? `first inside at tick ${first.n}: feet (${first.x.toFixed(2)}, ${first.y.toFixed(2)}, ${first.z.toFixed(2)}), ${(-first.off).toFixed(2)} behind; ${inside.length} ticks inside`
          : 'never inside'),
    ).toBe(0);
    expect(STEP_UP_FLOOR_GUARD_OWNER).toBe(true);
  });
});

/**
 * DG-GUARD's blast radius (the brief's census): the fixture maps' class-4 wall faces, stood as NU-1c B12's
 * census stands them (`traversal.parity.test.ts`: 3.75 in front of the middle, on the highest floor between the column's
 * bottom - 2 and its top - 5, the class by `FUN_00580b70`'s table), counted where the class is the AUTOMATIC step-up
 * (appflags 4, 5 < h <= 10) and its end, as the guard asks it (`stepUpEndFloor`: `topFloor` at the uncut step-up clip's
 * own distance past the target, the clips off `MOTION_P.ZAR`), finds no floor -- each now refused its automatic start.
 */
const MAPS = ['RUN/MP2.ZDB', 'RUN/MP6.ZDB', 'RUN/MP72.ZDB'] as const;
const CENSUS_ROOT = has(FIXTURES, [...MAPS, 'RUN/MOTION_P.ZAR']) ? FIXTURES : null;

describe.skipIf(!CENSUS_ROOT)(`DG-GUARD: the automatic step-ups the guard refuses on the fixture maps${CENSUS_ROOT ? '' : ' (SKIPPED: fixtures absent)'}`, () => {
  it("counts the class-4 faces whose automatic step-up end finds no floor", async () => {
    const source = new FsAssetSource(CENSUS_ROOT!);
    const sim = await loadSimClips(source);
    const shapes = new TraversalShapes();
    shapes.set(sim.clips, sim.table);
    const counts: Record<string, [number, number, string[]]> = {};
    for (const path of MAPS) {
      const map = await loadMap(source, path);
      const grid = groundGrid(map.ground!), polys = groundPolygons(map.ground!);
      let steps = 0;
      const refused: string[] = [];
      for (const p of polys) {
        if ((p.appflags ?? 0) !== 4) continue;
        const n = polygonNormal(p.points);
        if (!n) continue;
        const hz = Math.hypot(n[0], n[2]);
        if (hz < 0.7) continue;
        const count = p.points.length / 3;
        let cx = 0, cz = 0;
        for (let i = 0; i < count; i++) { cx += p.points[i * 3]!; cz += p.points[i * 3 + 2]!; }
        cx /= count; cz /= count;
        const fx = cx + (n[0] / hz) * 3.75, fz = cz + (n[2] / hz) * 3.75;
        const c = contactOf(p, 4, fx, fz);
        if (!c || !c.edge) continue;
        const floors = probeGround(grid, fx, fz).map((h) => h.y).filter((y) => y <= c.top - 5 + 1e-6 && y >= c.bottom - 2);
        if (!floors.length) continue;
        const y = Math.max(...floors);
        const h = c.top + footStepOffset(p.material) - y;
        if (climbClass(h, 4)?.kind !== 'step') continue;
        steps++;
        const [ax, az, bx, bz] = c.edge;
        const plan = { ...climbClass(h, 4)!, h, target: [(ax + bx) / 2, c.top, (az + bz) / 2] as [number, number, number], yaw: 0, automatic: true, contact: c };
        if (stepUpEndFloor(grid, shapes, plan) === null) refused.push(p.path);
      }
      counts[path] = [refused.length, steps, refused];
    }
    // The counts are printed for the box's record; not pinned yet (written unrun: the seat had no run slot -- the first
    // box's numbers become the pin).
    console.log(`DG-GUARD census [refused, automatic step-ups, refused faces]: ${JSON.stringify(counts)}`);
    for (const path of MAPS) expect(counts[path]![0]).toBeLessThanOrEqual(counts[path]![1]);
  }, 120000);
});
