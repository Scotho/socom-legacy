import { afterEach, describe, expect, it } from 'vitest';
import {
  buildGrid, gridCast, isCameraSurface, materialTable, segmentHits, surfaceMaterial, ALL_LAYERS, BUILTIN_MATERIALS, SOILS,
  type CollisionOwner, type Footprint, type GridParams, type SegmentHit, type SurfaceMaterial, type WorldPoly,
} from '../src/index';
import { segmentHits as segmentHitsBase } from './frozen/segmentBase';

/**
 * PAGE-ALLOC-A (LATER 867 (A); a CPU-side browser adaptation, product track while every output is bit-identical): two of
 * the port's own per-call allocations shadow's X2c profile named on the scene's side, moved onto a memoised table and
 * owned scratch. The contract is the same output: each pin holds the reworked function to the code as it stood at
 * agent/v0419 3a8fa1ba85 (`surfaceMaterial` below verbatim; `segmentHits` from `./frozen/segmentBase`), every number by
 * `Object.is` and every material by identity; each allocation check is RED at that base.
 */

type V3 = readonly [number, number, number];

// ---- surfaceMaterial ---------------------------------------------------------------------------------------------

/** `surfaceMaterial` and `materialTable` at 3a8fa1ba85, verbatim but for the names. */
function materialTableBase(soils: readonly SurfaceMaterial[] = SOILS): SurfaceMaterial[] {
  return [...BUILTIN_MATERIALS, ...soils];
}
function surfaceMaterialBase(index: number, defaultMaterial = '', table: readonly SurfaceMaterial[] = materialTableBase()): SurfaceMaterial {
  if (index === 0) return table.find((m) => m.name === defaultMaterial) ?? table[0]!;
  return table[index] ?? table[0]!;
}

/** Runs `f` with `Array.prototype[Symbol.iterator]` wrapped to count its calls (an array spread calls it per array). */
function countIterations(f: () => void): number {
  const proto = Array.prototype as unknown as Record<symbol, (this: unknown[]) => Iterator<unknown>>;
  const real = proto[Symbol.iterator]!;
  let n = 0;
  proto[Symbol.iterator] = function counted(this: unknown[]) { n++; return real.call(this); };
  try { f(); } finally { proto[Symbol.iterator] = real; }
  return n;
}

describe('PAGE-ALLOC-A item 1: surfaceMaterial\'s default table is made once', () => {
  const names = ['', 'GRASS', 'STONE', 'UNKNOWN', 'PARTICLE_SYSTEM', 'GLASS_MEDIUM', 'NOT_A_MATERIAL', 'grass', 'PERSON'];
  const indices = [-1, 0, 1, 2, 3, 13, 45, 46, 47, 100, 255, 1.5, Number.NaN];

  it('pin: every index and default name, the default table and passed ones, the same material object as the base code', () => {
    const custom = materialTable(SOILS.slice(0, 5));
    const bad: string[] = [];
    for (const name of names) {
      for (let i = -2; i < materialTable().length + 3; i++) {
        if (surfaceMaterial(i, name) !== surfaceMaterialBase(i, name)) bad.push(`default ${i} ${name}`);
        if (surfaceMaterial(i, name, custom) !== surfaceMaterialBase(i, name, custom)) bad.push(`custom ${i} ${name}`);
      }
      for (const i of indices) if (surfaceMaterial(i, name) !== surfaceMaterialBase(i, name)) bad.push(`odd ${i} ${name}`);
      if (surfaceMaterial(0) !== surfaceMaterialBase(0)) bad.push('no name');
    }
    expect(bad).toEqual([]);
    // materialTable() itself is unchanged: a fresh array of the same objects each call (callers may keep their own).
    const a = materialTable(), b = materialTable();
    expect(a).not.toBe(b);
    expect(a.length).toBe(materialTableBase().length);
    a.forEach((m, i) => expect(m).toBe(materialTableBase()[i]));
  });

  it('allocation: a default-table call spreads nothing (array iterations counted; base: 2 a call)', () => {
    surfaceMaterial(5); surfaceMaterial(0, 'GRASS');
    const n = countIterations(() => {
      for (let i = 0; i < 100; i++) { surfaceMaterial(i % 50); surfaceMaterial(0, 'STONE'); }
    });
    // eslint-disable-next-line no-console
    console.log(`  Tests (PAGE-ALLOC-A item 1) array iterations over 200 default-table calls: ${n}`);
    expect(n).toBe(0);
  });

  it('gridCast\'s default table: the same materials as the base code over a cast', () => {
    const wall = quad([-50, 0, 10, 50, 0, 10, 50, 50, 10, -50, 50, 10]);
    const { grid } = worldOf([[wall]]);
    const hits = gridCast(grid, 'GRASS')([0, 20, 0], [0, 20, 30]);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.material).toBe(surfaceMaterialBase(wall.material, 'GRASS'));
  });
});

// ---- segmentHits -------------------------------------------------------------------------------------------------

function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function quad(points: number[], ditype = 2, cameratype = 0, material = 25): WorldPoly {
  return { modelName: 'worldmodel', path: 'worldmodel/p', region: 0, ditype, material, ptcount: points.length / 3, cameratype, points: Float32Array.from(points) };
}

const PARAMS: GridParams = { atomCount: 1 << 16, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };

/** Owners as `buildGrid` takes them; `sweeps` marks the moving owners (no cache), `flags` sets an owner's node flags. */
function worldOf(groups: WorldPoly[][], sweeps: (Footprint | undefined)[] = [], flags: (number | undefined)[] = []) {
  const polys: WorldPoly[] = [];
  const owners: CollisionOwner[] = [];
  groups.forEach((g, i) => {
    const sweep = sweeps[i], f = flags[i];
    owners.push({ modelName: 'worldmodel', path: `worldmodel/o${i}`, first: polys.length, count: g.length, ...(sweep ? { sweep } : {}), ...(f !== undefined ? { flags: f } : {}) });
    polys.push(...g);
  });
  return { grid: buildGrid(PARAMS, [], [], polys, owners), polys, owners };
}

/** Walls, floors and plates over the 4 x 4 cells, some owners moving, some on other layers. */
function mixedWorld(seed: number) {
  const r = prng(seed);
  const groups: WorldPoly[][] = [], sweeps: (Footprint | undefined)[] = [], flags: (number | undefined)[] = [];
  for (let o = 0; o < 60; o++) {
    const x = r() * 360 - 180, z = r() * 360 - 180, y = r() * 60;
    const g: WorldPoly[] = [];
    for (let k = 0; k < 1 + Math.floor(r() * 4); k++) {
      const w = 5 + r() * 60, h = 5 + r() * 40, c = Math.floor(r() * 4), dx = r() * 20 - 10, dz = r() * 20 - 10;
      const kind = Math.floor(r() * 3);
      if (kind === 0) g.push(quad([x - w + dx, y, z + dz, x + w + dx, y, z + dz, x + w + dx, y + h, z + dz, x - w + dx, y + h, z + dz], 2, c, Math.floor(r() * 46)));
      else if (kind === 1) g.push(quad([x + dx, y, z - w + dz, x + dx, y + h, z - w + dz, x + dx, y + h, z + w + dz, x + dx, y, z + w + dz], 2, c, Math.floor(r() * 46)));
      else g.push(quad([x - w, y + h, z - w, x + w, y + h, z - w, x + w, y + h, z + w, x - w, y + h, z + w], 3, c, Math.floor(r() * 46)));
    }
    groups.push(g);
    sweeps.push(o % 7 === 3 ? { minX: x - 80, maxX: x + 80, minZ: z - 80, maxZ: z + 80 } : undefined);
    // A layered owner (`modelGate`): active with a DI on layer 1, 2 or 3; undefined is every layer.
    flags.push(o % 5 === 1 ? (1 << 0) | (1 << 12) | ((1 + (o % 3)) << 13) : undefined);
  }
  groups.push([quad([-200, 0, -200, 200, 0, -200, 200, 0, 200, -200, 0, 200], 3)]);
  return worldOf(groups, sweeps, flags);
}

function segments(seed: number, n: number): [V3, V3][] {
  const r = prng(seed);
  const out: [V3, V3][] = [];
  for (let i = 0; i < n; i++) {
    const a: V3 = [r() * 380 - 190, r() * 100 - 10, r() * 380 - 190];
    const k = i % 5;
    if (k === 4) { out.push([a, [a[0], a[1] - 200, a[2]]]); continue; }                 // straight down
    if (k === 3) { out.push([a, [a[0] + 1e-3, a[1], a[2]]]); continue; }               // tiny (mostly a miss)
    const len = 10 + r() * 400, dir = [r() - 0.5, (r() - 0.5) * 0.5, r() - 0.5], l = Math.hypot(dir[0]!, dir[1]!, dir[2]!) || 1;
    out.push([a, [a[0] + dir[0]! / l * len, a[1] + dir[1]! / l * len, a[2] + dir[2]! / l * len]]);
  }
  return out;
}

function differences(got: SegmentHit[], want: SegmentHit[]): string[] {
  const out: string[] = [];
  if (got.length !== want.length) return [`${got.length} hits, want ${want.length}`];
  got.forEach((g, i) => {
    const w = want[i]!;
    if (!Object.is(g.t, w.t)) out.push(`#${i} t ${g.t} != ${w.t}`);
    for (let k = 0; k < 3; k++) {
      if (!Object.is(g.point[k], w.point[k])) out.push(`#${i} point[${k}]`);
      if (!Object.is(g.normal[k], w.normal[k])) out.push(`#${i} normal[${k}]`);
    }
    if (g.poly !== w.poly) out.push(`#${i} poly`);
    if (g.owner !== w.owner) out.push(`#${i} owner`);
    if (Object.keys(g).join() !== Object.keys(w).join()) out.push(`#${i} keys ${Object.keys(g).join()}`);
  });
  return out;
}

const realSet = globalThis.Set;
afterEach(() => { globalThis.Set = realSet; });

describe('PAGE-ALLOC-A item 4: segmentHits keeps its seen set, box and travel as owned scratch', () => {
  const accepts: [string, ((p: WorldPoly) => boolean) | undefined, number, boolean][] = [
    ['default', undefined, ALL_LAYERS, false],
    ['every polygon', () => true, ALL_LAYERS, false],
    ['the camera\'s surfaces', isCameraSurface, ALL_LAYERS, false],
    ['front entries only', () => true, ALL_LAYERS, true],
    ['layer 0 only', () => true, 1, false],
    ['layers 0 and 2, front', isCameraSurface, 0b101, true],
  ];

  it('pin: 250 segments x 6 accepts over a mixed world (moving owners, layered owners): every hit identical to the base code', () => {
    const { grid } = mixedWorld(0x9a11);
    let hits = 0, empty = 0;
    const bad: string[] = [];
    for (const [a, b] of segments(0x51, 250)) {
      for (const [name, accept, layers, front] of accepts) {
        const want = accept ? segmentHitsBase(grid, a, b, accept, layers, front) : segmentHitsBase(grid, a, b);
        const got = accept ? segmentHits(grid, a, b, accept, layers, front) : segmentHits(grid, a, b);
        hits += want.length; if (want.length === 0) empty++;
        for (const d of differences(got, want)) bad.push(`${name} ${JSON.stringify([a, b])}: ${d}`);
      }
    }
    expect(bad).toEqual([]);
    // eslint-disable-next-line no-console
    console.log(`  Tests (PAGE-ALLOC-A item 4) pin: ${hits} hits compared, ${empty} empty casts`);
    expect(hits).toBeGreaterThan(200);
    expect(empty).toBeGreaterThan(50);
  });

  it('pin: a moving owner whose points turn between calls, and a non-finite segment, as the base code', () => {
    const wall = quad([-50, 0, 10, 50, 0, 10, 50, 50, 10, -50, 50, 10]);
    const { grid } = worldOf([[wall]], [{ minX: -60, maxX: 60, minZ: -60, maxZ: 60 }]);
    expect(differences(segmentHits(grid, [0, 20, 0], [0, 20, 30]), segmentHitsBase(grid, [0, 20, 0], [0, 20, 30]))).toEqual([]);
    wall.points.set([0, 0, -40, 0, 0, 60, 0, 50, 60, 0, 50, -40]);
    expect(differences(segmentHits(grid, [-10, 20, 5], [10, 20, 5]), segmentHitsBase(grid, [-10, 20, 5], [10, 20, 5]))).toEqual([]);
    expect(segmentHits(grid, [-10, 20, 5], [10, 20, 5])).toHaveLength(1);
    expect(differences(segmentHits(grid, [-10, 20, 5], [Infinity, 20, 5]), segmentHitsBase(grid, [-10, 20, 5], [Infinity, 20, 5]))).toEqual([]);
  });

  it('pin: re-entrant -- an accept that casts again (over the same owners) gets the base code\'s hits, inner and outer', () => {
    const { grid } = mixedWorld(0x77);
    const bad: string[] = [];
    let inner = 0;
    for (const [a, b] of segments(0x78, 60)) {
      const innerGot: SegmentHit[][] = [], innerWant: SegmentHit[][] = [];
      const via = (cast: typeof segmentHits, into: SegmentHit[][]) => (p: WorldPoly): boolean => {
        into.push(cast(grid, [a[0] + 5, a[1], a[2] - 5], [b[0] - 5, b[1], b[2] + 5], () => true));
        return p.ditype === 2;
      };
      const got = segmentHits(grid, a, b, via(segmentHits, innerGot));
      const want = segmentHitsBase(grid, a, b, via(segmentHitsBase, innerWant));
      bad.push(...differences(got, want).map((d) => `outer ${d}`));
      expect(innerGot.length).toBe(innerWant.length);
      innerGot.forEach((g, i) => { inner += g.length; bad.push(...differences(g, innerWant[i]!).map((d) => `inner ${i} ${d}`)); });
    }
    expect(bad).toEqual([]);
    expect(inner).toBeGreaterThan(0);
  });

  it('pin: an accept that throws leaves the next call\'s scratch whole', () => {
    const { grid } = mixedWorld(0x99);
    const [a, b] = segments(0x9a, 1)[0]!;
    expect(() => segmentHits(grid, [-150, 10, -150], [150, 10, 150], () => { throw new Error('stop'); })).toThrow('stop');
    expect(differences(segmentHits(grid, a, b), segmentHitsBase(grid, a, b))).toEqual([]);
  });

  it('allocation: no Set made a call (a counting Set on the global; base: one a call)', () => {
    const { grid } = mixedWorld(0x5e7);
    const segs = segments(0x5e8, 100);
    for (const [a, b] of segs) segmentHits(grid, a, b);   // every cache made first
    let made = 0;
    class CountingSet<T> extends realSet<T> { constructor(v?: Iterable<T> | null) { super(v); made++; } }
    globalThis.Set = CountingSet as unknown as SetConstructor;
    for (const [a, b] of segs) segmentHits(grid, a, b);
    globalThis.Set = realSet;
    // eslint-disable-next-line no-console
    console.log(`  Tests (PAGE-ALLOC-A item 4) Sets made over 100 calls: ${made}`);
    expect(made).toBe(0);
  });
});
