// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseZdb, zdbMember, Zar } from '@s2u/archive';
import { fixture } from '../../archive/test/fixtures';
import {
  buildGrid, cellAt, collisionOwners, parseSceneGraph, parseWorldRoot, probeFloor, probeGround, spawnsFor, worldCollision,
  type CollisionOwner, type Grid, type GridParams, type WorldPoly,
} from '../src/index';

/**
 * Parity pins for the ground probe on Frostfire (TA.R3; research 23 section 1.1, research 24 sections 2-4, research 90
 * #2): the collision polygons the probe can find at the places `probe.test.ts` checks -- the two spawns of `KNOWN`
 * section 1, the walkway column, the 142 deck's east corner -- with their owners (node path and flag word, for the
 * per-model gate), in surface order, in `golden/mp2-floors.json`. A polygon whose footprint box misses a point cannot
 * be hit there (the probe's line must cross it), so these are every candidate. The unit half builds the grid from the
 * pin and runs `probeGround` / `probeFloor` with no game data; the data half re-derives the pin from the fixture and
 * shows the probe answers the same on the pinned polygons as on the whole map. `S2U_GOLDEN_WRITE=1` rewrites it.
 */

interface PolyPin { region: number; ditype: number; material: number; ptcount: number; cameratype: number; points: number[] }
interface OwnerPin { modelName: string; path: string; flags: number; polys: PolyPin[] }
interface Golden { _source: string; grid: GridParams; points: [number, number][]; owners: OwnerPin[] }

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN_PATH = resolve(HERE, 'golden/mp2-floors.json');
const GOLDEN = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as Golden;
const MP2 = fixture('RUN/MP2.ZDB');

const SPAWNS = spawnsFor('FROSTFIRE')!;
const WALKWAY = [[710, 980], [720, 990], [730, 998]] as const;           // research 24 section 4.2
const DECK_CORNER = [[674.5, 720.5], [677, 723], [679.5, 725.5]] as const; // research 90 #2
const BESIDE_BOX = [668, 722] as const;
const POINTS: [number, number][] = [
  [SPAWNS.a[0], SPAWNS.a[2]], [SPAWNS.b[0], SPAWNS.b[2]], ...WALKWAY.map(([x, z]) => [x, z] as [number, number]),
  ...DECK_CORNER.map(([x, z]) => [x, z] as [number, number]), [BESIDE_BOX[0], BESIDE_BOX[1]],
];

/** Frostfire's whole grid, as `probe.test.ts` builds it. */
function fullGrid(zdb: Uint8Array): Grid {
  const toc = parseZdb(zdb);
  const graph = parseSceneGraph(Zar.parse(zdbMember(zdb, toc, 'MP2_GEO.ZED')));
  const root = parseWorldRoot(Zar.parse(zdbMember(zdb, toc, '\\MP2.ZED')));
  return buildGrid(root.grid, [], [], worldCollision(graph), collisionOwners(graph));
}

const boxHolds = (pts: ArrayLike<number>, x: number, z: number): boolean => {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < pts.length; i += 3) {
    minX = Math.min(minX, pts[i]!); maxX = Math.max(maxX, pts[i]!); minZ = Math.min(minZ, pts[i + 2]!); maxZ = Math.max(maxZ, pts[i + 2]!);
  }
  return x >= minX && x <= maxX && z >= minZ && z <= maxZ;
};

/** Every polygon of every collision object linked into a point's cell whose footprint box holds the point. */
function candidates(grid: Grid): OwnerPin[] {
  const out = new Map<CollisionOwner, Set<WorldPoly>>();
  for (const [x, z] of POINTS) {
    for (const atom of cellAt(grid, x, z).atoms) {
      if (atom.object.kind !== 'collision') continue;
      for (const p of atom.object.polys) {
        if (!boxHolds(p.points, x, z)) continue;
        if (!out.has(atom.object.owner)) out.set(atom.object.owner, new Set());
        out.get(atom.object.owner)!.add(p);
      }
    }
  }
  return [...out].map(([owner, set]) => {
    const all = grid.objects.find((o) => o.kind === 'collision' && o.owner === owner)!;
    const polys = all.kind === 'collision' ? all.polys.filter((p) => set.has(p)) : [];   // surface order
    return {
      modelName: owner.modelName, path: owner.path, flags: owner.flags ?? 0,
      polys: polys.map((p) => ({ region: p.region, ditype: p.ditype, material: p.material, ptcount: p.ptcount, cameratype: p.cameratype, points: Array.from(p.points) })),
    };
  });
}

/** The grid of the pinned polygons alone. */
function pinnedGrid(): Grid {
  const polys: WorldPoly[] = [];
  const owners: CollisionOwner[] = [];
  for (const o of GOLDEN.owners) {
    owners.push({ modelName: o.modelName, path: o.path, first: polys.length, count: o.polys.length, flags: o.flags });
    for (const p of o.polys) polys.push({ modelName: o.modelName, path: o.path, ...p, points: Float32Array.from(p.points) });
  }
  return buildGrid(GOLDEN.grid, [], [], polys, owners);
}

const ys = (grid: Grid, x: number, z: number): number[] => probeGround(grid, x, z).map((h) => Math.round(h.y)).sort((a, b) => a - b);
/** What the probe answers at every pinned place: the candidates' heights, and the pick from each height asked. */
const answers = (grid: Grid): unknown[] => POINTS.map(([x, z]) => [ys(grid, x, z),
  [100, 142, SPAWNS.a[1], SPAWNS.b[1]].map((y) => probeFloor(grid, x, y, z)?.y ?? null)]);

function goldenText(v: unknown, indent = ''): string {
  const flat = JSON.stringify(v).replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  if (flat.length <= 200 || v === null || typeof v !== 'object' || (Array.isArray(v) && v.every((x) => x === null || typeof x !== 'object'))) return flat;
  const inner = indent + '  ';
  if (Array.isArray(v)) return `[\n${v.map((x) => inner + goldenText(x, inner)).join(',\n')}\n${indent}]`;
  return `{\n${Object.entries(v).map(([k, x]) => `${inner}${JSON.stringify(k)}: ${goldenText(x, inner)}`).join(',\n')}\n${indent}}`;
}

describe("the ground probe on Frostfire's pinned polygons (unit: no game data)", () => {
  it("the pin is Frostfire's 160-unit, 8 x 9 grid and the places probe.test.ts checks", () => {
    expect(GOLDEN.grid).toEqual({ atomCount: 8192, posts: 16, cellDim: 160, cellsX: 8, cellsZ: 9, originX: 0, originZ: 0 });
    expect(GOLDEN.points).toEqual(POINTS);
    expect(GOLDEN.owners.length).toBeGreaterThan(0);
  });

  it("puts both of Frostfire's measured spawns on their floor within [-3, +1]: residuals 0 and -1 (research 24 section 3)", () => {
    const grid = pinnedGrid();
    const residuals = [SPAWNS.a, SPAWNS.b].map(([x, y, z]) => probeFloor(grid, x, y, z)!.y - y);
    expect(residuals.map((r) => Math.round(r * 1000) / 1000)).toEqual([0, -1]);
    // The cells the console's vf0 row names: (4, 3) and (3, 7).
    expect([SPAWNS.a, SPAWNS.b].map(([x, , z]) => { const c = cellAt(grid, x, z); return [c.x, c.z]; })).toEqual([[4, 3], [3, 7]]);
  });

  it("the walkway column (x 705-735, z 975-1000) holds floors at 142 and 100, and from y 100 the probe takes the lower (research 24 section 4.2)", () => {
    const grid = pinnedGrid();
    for (const [x, z] of WALKWAY) {
      expect(ys(grid, x, z), `(${x}, ${z})`).toEqual(expect.arrayContaining([100, 142]));
      expect(probeFloor(grid, x, 100, z)!.y, `(${x}, ${z})`).toBeCloseTo(100, 3);
      expect(probeFloor(grid, x, 142, z)!.y, `(${x}, ${z})`).toBeCloseTo(142, 3);
    }
  });

  it("the 142 deck's east corner is the engine's hole: the box top at 112 comes first in surface order (research 90 #2, FUN_00313d60 appends)", () => {
    const grid = pinnedGrid();
    for (const [x, z] of DECK_CORNER) {
      expect(ys(grid, x, z), `(${x}, ${z})`).toEqual([100, 112]);
      expect(probeFloor(grid, x, 142, z)!.y, `(${x}, ${z})`).toBeCloseTo(112, 3);
    }
    expect(probeFloor(grid, BESIDE_BOX[0], 142, BESIDE_BOX[1])!.y).toBeCloseTo(142, 3);
  });
});

describe("the ground probe's pin re-derived from the data (fixture)", () => {
  it.skipIf(!MP2)("re-derives the candidate polygons from the fixture, and the probe answers the same on them as on the whole map", () => {
    const grid = fullGrid(MP2!);
    const got = JSON.parse(JSON.stringify({ grid: grid.params, points: POINTS, owners: candidates(grid) })) as Omit<Golden, '_source'>;
    if (process.env.S2U_GOLDEN_WRITE === '1') {
      writeFileSync(GOLDEN_PATH, `${goldenText({
        _source: 'test-fixtures RUN/MP2.ZDB (the disc file): MP2_GEO.ZED through parseSceneGraph, worldCollision, collisionOwners, and MP2.ZED grid_params, into buildGrid (scene/src); the polygons of each probed cell whose footprint box holds the point. Pinned 2026-10-02.',
        ...got,
      })}\n`);
    }
    expect(got).toEqual({ grid: GOLDEN.grid, points: GOLDEN.points, owners: GOLDEN.owners });
    expect(answers(pinnedGrid())).toEqual(answers(grid));
  });
});
