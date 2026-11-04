// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import { Matrix4 } from 'three';
import { collisionOwners, DEFAULT_GRID_PARAMS, parseSceneGraph, placeInstances, polygonNormal, worldCollision, type SceneNode, type WorldPoly } from '@s2u/scene';
import { contactOf, crossSection } from '../../src/climb';
import { groundPolygons, packGround } from '../../src/mover';
import { simMapFromBytes, stemOf } from '../../src/simMap';
import type { LoadedMap } from '../../src/loadMap';
import { layoutGround, prototypePolygons } from '../../src/forge/ground';
import { walkOrder } from '../../src/forge/hide';

/**
 * LATER 146 (research 313 section 8.10; reading, pending review): a forge piece of a tilted prototype, placed at the
 * prototype's own disc placement, carries the frames the base map's hull carries (LATER 142's `CollisionOwner.frame`),
 * and the climb takes the same column at every on-face hit -- the piece's polygons against the base's they came from.
 * The props are read as the room's forge reads an archive (`match/src/forgeSimMap.ts` `archiveParts`: `placeInstances`,
 * one entry a model, the walk's order), the hull as the page's (`simMapFromBytes`). Off the dev disc (`SOCOM_DISC`;
 * skipped -- and said so -- without it).
 */

const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : '';
/** LATER 142's census of the tilted climb owners (`climbFrame.disc.test.ts`): the placement node's own, and a sub-node's. */
const CASES = [
  ['MP1', 'alaska4d_fence01'], ['MP1', 'alaska4d_fence02'], ['MP2', 'container_blue01'],
  ['M52', 'm52_truck_uncovered'], ['M52', 'm52_railcar03'], ['M82', 'm82truck_utility'],
] as const;
const HAVE_DISC = DISC !== '' && CASES.every(([m]) => existsSync(join(DISC, 'RUN', `${m}.ZDB`)));

/**
 * The page's view of an archive (`simMapFromBytes`: the doors read, their owners' `frame` dropped, `restFrame` kept), or
 * with `room` the room's view of a library archive (`match/src/forgeSimMap.ts` `archiveParts`: raw `collisionOwners` and
 * `worldCollision` packed on the default grid, no doors read).
 */
function archive(stem: string, room = false): LoadedMap & { models: SceneNode[] } {
  const path = `RUN/${stem}.ZDB`, bytes = new Uint8Array(readFileSync(join(DISC, path)));
  const models = parseSceneGraph(Zar.parse(zdbMember(bytes, parseZdb(bytes), `${stemOf(path)}_GEO.ZED`)));
  const byModel = new Map<string, { matrices: number[]; paths: string[] }>();
  for (const p of placeInstances(models, 'worldmodel')) {
    if (p.modelName === 'worldmodel') continue;
    const e = byModel.get(p.modelName) ?? { matrices: [], paths: [] };
    e.matrices.push(...p.world);
    e.paths.push(p.path);
    byModel.set(p.modelName, e);
  }
  const props = [...byModel].map(([modelName, e]) => ({ modelName, matrices: Float32Array.from(e.matrices), paths: e.paths }));
  const ground = room ? packGround(DEFAULT_GRID_PARAMS, worldCollision(models, 'worldmodel'), collisionOwners(models, 'worldmodel')) : simMapFromBytes(bytes, path).ground;
  return { props, ground, models } as unknown as LoadedMap & { models: SceneNode[] };
}

/** The walk's first placement of `model` whose path owns hull polygons (`prototypePolygons`' own choice): its matrix. */
function firstPlacement(map: LoadedMap, model: string): number[] {
  for (const { prop, index } of walkOrder(map, model)) {
    const e = map.props[prop]!, path = e.paths![index]!;
    if (map.ground!.owners.some((o) => o.count > 0 && (o.path === path || o.path.startsWith(`${path}/`)))) return Array.from(e.matrices.subarray(index * 16, index * 16 + 16));
  }
  throw new Error(`no placement of ${model} owns polygons`);
}

const same = (a: Float32Array, b: Float32Array): boolean => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]!) < 1e-3);

describe.skipIf(!HAVE_DISC)('LATER 146: a tilted prototype placed as a piece at its own disc placement climbs as the base map does (dev disc)', () => {
  it('each piece polygon carries its base polygon\'s frame, and the column top agrees at every on-face hit', () => {
    let framed = 0, hits = 0, most = 0;
    for (const [stem, model] of CASES) {
      const map = archive(stem);
      const base = groundPolygons(map.ground!);
      const g = layoutGround(map.ground!, [{ owner: 'forge/piece_0', polys: prototypePolygons(map, model)!, m: firstPlacement(map, model) }]);
      const piece = groundPolygons(g).slice(base.length);
      expect(piece.length).toBeGreaterThan(0);
      for (const p of piece) {
        const b: WorldPoly | undefined = base.find((q) => q.modelName === p.modelName && same(q.points, p.points));
        expect(b, `${stem} ${model}: a piece polygon matches a base polygon`).toBeDefined();
        expect(!!p.frame, `${stem} ${model}: framed as the base`).toBe(!!b!.frame);
        if (!b!.frame) continue;
        framed++;
        for (let i = 0; i < 16; i++) expect(Math.abs(p.frame![i]! - b!.frame[i]!)).toBeLessThan(1e-3);
        const n = polygonNormal(b!.points);
        if (!n || Math.hypot(n[0], n[2]) < 0.7) continue;                       // a wall only (`contactOf`)
        const ys = [];
        for (let i = 1; i < b!.points.length; i += 3) ys.push(b!.points[i]!);
        const lo = Math.min(...ys), hi = Math.max(...ys), h = Math.hypot(n[0], n[2]), nx = n[0] / h, nz = n[2] / h;
        for (let k = 0; k < 9; k++) {
          const cut = crossSection(b!.points, lo + ((k + 0.5) / 9) * (hi - lo));
          if (cut.length < 2) continue;
          for (let j = 0; j < 16; j++) {
            const u = (j + 0.5) / 16, hit = cut[0]!.map((v, c) => v + (cut[1]![c]! - v) * u);
            const fx = hit[0]! + nx * 3.45, fz = hit[2]! + nz * 3.45, app = b!.appflags ?? 0;
            const want = contactOf(b!, app, fx, fz, hit), got = contactOf(p, app, fx, fz, hit);
            expect(!!got).toBe(!!want);
            if (!want || !got) continue;
            hits++;
            expect(Number.isFinite(got.top)).toBe(Number.isFinite(want.top));
            if (Number.isFinite(want.top)) most = Math.max(most, Math.abs(got.top - want.top));
          }
        }
      }
    }
    expect(framed).toBeGreaterThan(0);
    expect(hits).toBeGreaterThan(1000);
    expect(most).toBeLessThan(1e-2);
  }, 600_000);
});

/** A piece moved off its placement: turned 0.7 about y and shifted, its prototype's own tilt kept. */
const moved = (M: number[]): number[] =>
  Array.from(new Matrix4().makeTranslation(300, 17, -200).multiply(new Matrix4().makeRotationY(0.7)).multiply(new Matrix4().fromArray(M)).elements);
/** A frame's local up, normalised (`elements` 4..6); the world's for none. */
const upOf = (f: ArrayLike<number> | undefined): [number, number, number] => {
  if (!f) return [0, 1, 0];
  const l = Math.hypot(f[4]!, f[5]!, f[6]!);
  return [f[4]! / l, f[5]! / l, f[6]! / l];
};
const angle = (a: readonly number[], b: readonly number[]): number => Math.acos(Math.min(1, a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!));

describe.skipIf(!HAVE_DISC)("LATER 146's review (F1): a door prototype's piece, and every prototype moved, against the scene graph (dev disc)", () => {
  it("MP1's dredge_door as a piece: the page's frame and the room's agree, the door's own polygons on the page carrying no frame", () => {
    const page = archive('MP1'), room = archive('MP1', true);
    const doorOwners = page.ground!.owners.filter((o) => o.sweep);
    expect(doorOwners.length).toBeGreaterThan(0);
    expect(doorOwners.every((o) => !o.frame)).toBe(true);                               // LATER 142's ruling holds
    expect(doorOwners.some((o) => o.restFrame)).toBe(true);                              // the rest frame kept for the forge
    const base = groundPolygons(page.ground!);
    for (const o of doorOwners) for (const p of base.slice(o.first, o.first + o.count)) expect(p.frame).toBeUndefined();   // never the walk's
    const m = Array.from(new Matrix4().makeTranslation(40, 0, -60).multiply(new Matrix4().makeRotationY(0.3)).multiply(new Matrix4().fromArray(firstPlacement(page, 'dredge_door'))).elements);
    const at = (map: LoadedMap) => groundPolygons(layoutGround(map.ground!, [{ owner: 'forge/piece_0', polys: prototypePolygons(map, 'dredge_door')!, m }])).slice(groundPolygons(map.ground!).length);
    const a = at(page), b = at(room);
    expect(a.length).toBe(b.length);
    expect(a.length).toBeGreaterThan(0);
    for (let i = 0; i < a.length; i++) {
      expect(!!a[i]!.frame).toBe(!!b[i]!.frame);
      expect(angle(upOf(a[i]!.frame), upOf(b[i]!.frame))).toBeLessThan(1e-6);          // RED before: 2 degrees apart
    }
  });

  it('every prototype on the disc placed as a moved piece: each polygon\'s up axis is its collider\'s, from the scene graph', () => {
    let checked = 0, worst = 0;
    for (const file of readdirSync(join(DISC, 'RUN')).filter((n) => /\.ZDB$/i.test(n)).sort()) {
      const stem = stemOf(file), map = archive(stem), raw = collisionOwners(map.models, 'worldmodel');
      for (const { modelName } of map.props) {
        const polys = prototypePolygons(map, modelName);
        if (!polys) continue;
        const M = firstPlacement(map, modelName), m = moved(M);
        // The raw owners of the placement's share, as `prototypePolygons` takes them (the page's and the raw lists align).
        const { prop, index } = walkOrder(map, modelName).find(({ prop, index }) => {
          const path = map.props[prop]!.paths![index]!;
          return map.ground!.owners.some((o) => o.count > 0 && (o.path === path || o.path.startsWith(`${path}/`)));
        })!;
        const path = map.props[prop]!.paths![index]!;
        const mine = raw.filter((o) => o.count > 0 && (o.path === path || o.path.startsWith(`${path}/`)));
        const placements = walkOrder(map, modelName, path).length;
        const share = placements > 1 && mine.length % placements === 0 ? mine.length / placements : mine.length;
        const want = mine.slice(0, share).flatMap((o) => {
          const f = o.frame ? new Matrix4().fromArray(m).multiply(new Matrix4().fromArray(M).invert()).multiply(new Matrix4().fromArray(o.frame)).elements
            : new Matrix4().fromArray(m).multiply(new Matrix4().fromArray(M).invert()).elements;
          return new Array(o.count).fill(upOf(f));
        });
        const got = groundPolygons(layoutGround(map.ground!, [{ owner: 'forge/piece_0', polys, m }])).slice(groundPolygons(map.ground!).length);
        expect(got.length, `${stem} ${modelName}`).toBe(want.length);
        got.forEach((p, i) => { const e = angle(upOf(p.frame), want[i]!); worst = Math.max(worst, e); expect(e, `${stem} ${modelName} polygon ${i}`).toBeLessThan(1e-3); checked++; });
      }
    }
    expect(checked).toBeGreaterThan(10_000);
    expect(worst).toBeLessThan(1e-3);
  }, 600_000);
});
