// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Mesh, Object3D, Raycaster, Scene, Vector3 } from 'three';
import { FsAssetSource } from '@s2u/archive/node';
import { materialTable, polygonNormal, type WorldPoly } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { effectsFromDisc } from '../src/effectData';
import { Effects } from '../src/effects';
import { loadMap } from '../src/loadMap';
import { MarkClipper, markClipGeometry, markFrame } from '../src/markClip';
import { roundAdmits } from '../src/round';
import { groundGrid } from '../src/mover';
import { buildWorld } from '../src/world';

/**
 * WM-20 (research 431; reading, pending review): the census of a map's strikable collision polygons whose mark the
 * drawn world cannot hold -- where the clip (`FUN_003b3ab0`: facing, the square's overlap, all three vertices within
 * 4.8 of the plane, D:L306632-306662) keeps no drawn triangle at the polygon's centre on EITHER side, so the original
 * draws no mark there and the page drew the bare square in the air (IMG_8928, Frostfire's pipe). The world built and
 * revealed whole, as a match builds it (`matchMount.ts`); a polygon is counted when a round may stop on it
 * (`roundAdmits`, PENETRATION below 1) and its material has a mark row (`decals.rdr` through `Effects.marks`). The
 * centre is one sample a polygon, not its whole face: the counts are a census of where marks vanish, not of every point.
 */
const FIXTURES = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'));
const absent = fixture('RUN/MP2.ZDB') === null;
const MATERIALS = materialTable();
const MATERIAL = new Map(MATERIALS.map((m) => [m.name, m]));
/** The census's square: the BULLET_MARK_SMALL rows run 0.75-3.4 units (research 89 §5); 1.5 is a mid size. */
const CENSUS_SIDE = 1.5;
/** The face's sampling: a mark centre every CENSUS_STEP units along a fan triangle's longest side, at most CENSUS_MAX_STEPS. */
const CENSUS_STEP = 4;
const CENSUS_MAX_STEPS = 12;
/** The nodes whose empty samples are probed for the drawn surface's depth: the pipes (IMG_8928) and the largest empty areas (the review's F6). */
const DEPTH_PROBED = ['short_pip', 'bigtank', 'deckv_20', 'deckv_33'];

interface Census { strikable: number; area: number; nothingKept: number; nothingArea: number; byMaterial: Record<string, number>; byNode: Record<string, number>; at: string[]; samples: number; emptySamples: number; emptyArea: number; emptyByNode: Record<string, number>; emptyByMaterial: Record<string, number>; pipeEmpty: { at: number[]; n: number[]; node: string }[]; pipeDepth?: Record<string, { samples: number; min: number; median: number; max: number; none: number; box: number[] }> }

async function census(stem: string): Promise<Census> {
  const src = new FsAssetSource(FIXTURES);
  const map = await loadMap(src, `RUN/${stem}.ZDB`);
  const built = buildWorld(map);
  const scene = new Scene();
  scene.add(built.group);
  for (const task of [...built.revealWorld, ...built.revealProps]) task();
  scene.updateMatrixWorld(true);
  const data = await effectsFromDisc(src, `RUN/${stem}.ZDB`, stem);
  const effects = new Effects(() => 0.5, () => {});
  effects.setData({ ...data, ambient: [] });
  const marks = effects.marks()!;
  const clipper = new MarkClipper(built.group);
  const g = markClipGeometry();
  const out: Census = { strikable: 0, area: 0, nothingKept: 0, nothingArea: 0, byMaterial: {}, byNode: {}, at: [], samples: 0, emptySamples: 0, emptyArea: 0, emptyByNode: {}, emptyByMaterial: {}, pipeEmpty: [] };
  const polys: WorldPoly[] = [];
  const owner = new Map<WorldPoly, string>();
  for (const o of groundGrid(map.ground!).objects) if (o.kind === 'collision') for (const p of o.polys) { polys.push(p); owner.set(p, o.owner.path); }
  for (const p of polys) {
    if (!roundAdmits(p)) continue;
    const name = effects.materialName(p.material);
    const m = (name ? MATERIAL.get(name) : undefined) ?? MATERIALS[0]!;
    if (m.penetration >= 1) continue;
    if (!marks.row(p.material)) continue;
    const n = polygonNormal(p.points);
    if (!n) continue;
    const c: [number, number, number] = [0, 0, 0];
    for (let k = 0; k < p.ptcount; k++) for (let a = 0; a < 3; a++) c[a] = c[a]! + p.points[k * 3 + a]! / p.ptcount;
    let area = 0;
    for (let k = 1; k + 1 < p.ptcount; k++) {
      const u = [0, 1, 2].map((a) => p.points[k * 3 + a]! - p.points[a]!), v = [0, 1, 2].map((a) => p.points[(k + 1) * 3 + a]! - p.points[a]!);
      area += 0.5 * Math.hypot(u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!);
    }
    out.strikable++;
    out.area += area;
    const holds = (at: readonly number[]): boolean => [n, [-n[0], -n[1], -n[2]] as [number, number, number]]
      .some((sd) => clipper.clip(markFrame([at[0]!, at[1]!, at[2]!], sd, [-sd[0], -sd[1], -sd[2]], CENSUS_SIDE), g, 0.05) > 0);
    const kept = holds(c);
    const key = name ?? `#${p.material}`;
    const node = owner.get(p) ?? p.path;
    if (!kept) {
      out.nothingKept++;
      out.nothingArea += area;
      out.byMaterial[key] = (out.byMaterial[key] ?? 0) + 1;
      out.byNode[node] = (out.byNode[node] ?? 0) + 1;
      out.at.push(`${node} ${key} (${c.map((v) => v.toFixed(1)).join(', ')}) area ${area.toFixed(1)}`);
    }
    // The face sampled: points on each fan triangle CENSUS_STEP apart (at most CENSUS_MAX a polygon), each a mark's centre.
    const pt = (k: number): number[] => [p.points[k * 3]!, p.points[k * 3 + 1]!, p.points[k * 3 + 2]!];
    let samples = 0, empty = 0;
    for (let k = 1; k + 1 < p.ptcount; k++) {
      const A = pt(0), B = pt(k), C = pt(k + 1);
      const longest = Math.max(Math.hypot(B[0]! - A[0]!, B[1]! - A[1]!, B[2]! - A[2]!), Math.hypot(C[0]! - A[0]!, C[1]! - A[1]!, C[2]! - A[2]!), Math.hypot(C[0]! - B[0]!, C[1]! - B[1]!, C[2]! - B[2]!));
      const steps = Math.max(1, Math.min(Math.ceil(longest / CENSUS_STEP), CENSUS_MAX_STEPS));
      for (let i = 0; i <= steps; i++) for (let j = 0; i + j <= steps; j++) {
        const a = (i + 1 / 3) / (steps + 1), b = (j + 1 / 3) / (steps + 1);
        if (a + b > 1) continue;
        const q = [0, 1, 2].map((x) => A[x]! + (B[x]! - A[x]!) * a + (C[x]! - A[x]!) * b);
        samples++;
        if (!holds(q)) { empty++; if (DEPTH_PROBED.some((k) => node.includes(k))) out.pipeEmpty.push({ at: q, n: [n[0], n[1], n[2]], node }); }
      }
    }
    out.samples += samples;
    out.emptySamples += empty;
    if (empty > 0) {
      const share = area * empty / samples;
      out.emptyArea += share;
      out.emptyByNode[node] = (out.emptyByNode[node] ?? 0) + share;
      out.emptyByMaterial[key] = (out.emptyByMaterial[key] ?? 0) + share;
    }
  }
  // The pipes' depth: from each empty sample on the hull, the nearest drawn surface along the hull's normal either way.
  const ray = new Raycaster();
  ray.far = 60;
  const drawnOnly = (o: Object3D): boolean => o instanceof Mesh && !!(o as Mesh).geometry.getAttribute('color') && o.visible;
  const targets: Object3D[] = [];
  built.group.traverseVisible((o) => { if (drawnOnly(o)) targets.push(o); });
  const depth: Record<string, number[]> = {}, none: Record<string, number> = {};
  for (const e of out.pipeEmpty) {
    let best = Infinity;
    for (const sg of [1, -1]) {
      ray.set(new Vector3(e.at[0], e.at[1], e.at[2]), new Vector3(e.n[0]! * sg, e.n[1]! * sg, e.n[2]! * sg));
      const hit = ray.intersectObjects(targets, false)[0];
      if (hit) best = Math.min(best, hit.distance);
    }
    if (best === Infinity) none[e.node] = (none[e.node] ?? 0) + 1;
    else (depth[e.node] ??= []).push(best);
  }
  out.pipeDepth = {};
  for (const node of new Set(out.pipeEmpty.map((e) => e.node))) {
    const d = (depth[node] ?? []).sort((a, b) => a - b);
    out.pipeDepth[node] = { samples: d.length + (none[node] ?? 0), min: d[0] ?? NaN, median: d[d.length >> 1] ?? NaN, max: d[d.length - 1] ?? NaN, none: none[node] ?? 0, box: [0, 1, 2].flatMap((k) => { const v = out.pipeEmpty.filter((e) => e.node === node).map((e) => e.at[k]!); return [Math.round(Math.min(...v)), Math.round(Math.max(...v))]; }) };
  }
  return out;
}

describe.skipIf(absent)(`WM-20's census: strikable polygons whose mark keeps no drawn triangle${absent ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  it('Frostfire (MP2): counted and printed for research 431', async () => {
    const c = await census('MP2');
    console.log(`WM-20 census MP2: ${JSON.stringify({ ...c, pipeEmpty: c.pipeEmpty.length, area: Math.round(c.area), nothingArea: Math.round(c.nothingArea) })}`);
    expect(c.strikable).toBeGreaterThan(0);
    // Some polygons a round stops on carry no drawn face within 4.8 at their centre: the case the fix changes.
    expect(c.nothingKept).toBeGreaterThan(0);
    expect(c.nothingKept).toBeLessThan(c.strikable);
    // The owner's pipe (IMG_8928): Frostfire's two bent pipes' hulls, the drawn pipe deeper inside than the clip's 4.8.
    for (const node of ['worldmodel/short_pip1/di_pipe1_5', 'worldmodel/short_pip2/di_pipe1']) {
      const d = c.pipeDepth![node]!;
      expect(d.samples, node).toBeGreaterThan(0);
      expect(d.median, node).toBeGreaterThan(4.8);
    }
  }, 240_000);
});
