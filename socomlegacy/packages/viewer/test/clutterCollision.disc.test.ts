// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import { DEFAULT_GRID_PARAMS, mapCollision, parseClutter, parseGridParams, polygonNormal, r0004DropsClutter, surfaceMaterial, type ClutterInstance, type WorldPoly } from '@s2u/scene';
import { parseSceneGraph, applyR0004MapPatch } from '@s2u/scene';
import { simMapFromBytes, type SimMap } from '../src/simMap';
import { loadMap } from '../src/loadMap';
import { BODY_RADIUS, groundGrid, groundPolygons, packGround, Walker } from '../src/mover';
import type { Grid } from '@s2u/scene';
import { roundPath, type Vec3 } from '../src/round';
import { blastLine1 } from '../src/net/blast';

/**
 * CLT-2 (plan `docs/plans/clutter.md`; LATER 997; research 422; reading, pending review): the clutter the original walks
 * for collision -- `FUN_002d3cf0` over each grid cell's clutter list (D:L175686-175710), `FUN_002d3030` on each
 * instance's model through its matrix, for the body's movement records, a round's line and a blast's rays alike (the
 * queue `FUN_0031dd90` D:L219870-219900, mask -1 at D:L219895) -- in the room's hull and the page's. Blizzard's
 * `alaska4d_tree02b` at (1875.09, 51.15, 1238.62): 3 trunk polygons (WOOD_THICK, penetration 0) and 5 bough polygons
 * (SNOWY_TREE, penetration 0.7). Before CLT-2 every line below met nothing there. A dev-disc test: it skips without
 * `SOCOM_DISC`.
 */
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : '';
const HAVE_MP1 = !!DISC && existsSync(resolve(DISC, 'RUN', 'MP1.ZDB'));
const HAVE_MP61 = !!DISC && existsSync(resolve(DISC, 'RUN', 'MP61.ZDB'));

const FORWARD = { forward: 1, right: 0, boost: false };
const TREE = 'alaska4d_tree02b';
const AT: Vec3 = [1875.09, 51.15, 1238.62];

function instancesOf(bytes: Uint8Array): ClutterInstance[] {
  return parseClutter(Zar.parse(zdbMember(bytes, parseZdb(bytes), 'CLUTTER.ZAR')));
}
const under = (path: string, prefix: string): boolean => path === prefix || path.startsWith(`${prefix}/`);

/** The 2D convex hull of points (Andrew's monotone chain), counter-clockwise. */
function hull2(points: [number, number][]): [number, number][] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [], upper: [number, number][] = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, q) <= 0) lower.pop(); lower.push(q); }
  for (const q of [...p].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, q) <= 0) upper.pop(); upper.push(q); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
function insideHull(h: [number, number][], x: number, z: number): boolean {
  for (let i = 0; i < h.length; i++) {
    const a = h[i]!, b = h[(i + 1) % h.length]!;
    if ((b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]) < 0) return false;
  }
  return true;
}

describe.skipIf(!HAVE_MP1)(`CLT-2: Blizzard's ${TREE} in the hull${HAVE_MP1 ? '' : ' (SOCOM_DISC absent)'}`, () => {
  let cached: { bytes: Uint8Array; m: SimMap } | null = null;
  const load = () => {
    if (!cached) {
      const bytes = new Uint8Array(readFileSync(resolve(DISC, 'RUN', 'MP1.ZDB')));
      cached = { bytes, m: simMapFromBytes(bytes, 'RUN/MP1.ZDB') };
    }
    return cached;
  };
  const tree = () => {
    const { bytes, m } = load();
    const record = instancesOf(bytes).findIndex((c) => c.modelName === TREE
      && Math.abs(c.matrix[12]! - AT[0]) < 0.01 && Math.abs(c.matrix[13]! - AT[1]) < 0.01 && Math.abs(c.matrix[14]! - AT[2]) < 0.01);
    expect(record, 'the instance at (1875.09, 51.15, 1238.62) in CLUTTER.ZAR').toBeGreaterThanOrEqual(0);
    const prefix = `clutter/${TREE}#${record}`;
    const owners = m.ground.owners.filter((o) => under(o.path, prefix));
    const all = groundPolygons(m.ground);
    const polys: WorldPoly[] = owners.flatMap((o) => all.slice(o.first, o.first + o.count));
    const mat = (p: WorldPoly) => surfaceMaterial(p.material, m.defaultMaterial);
    const trunk = polys.filter((p) => mat(p).name === 'WOOD_THICK');
    const boughs = polys.filter((p) => mat(p).name === 'SNOWY_TREE');
    const xz: [number, number][] = [];
    for (const p of trunk) for (let i = 0; i < p.points.length; i += 3) xz.push([p.points[i]!, p.points[i + 2]!]);
    const box = { minX: Math.min(...xz.map((q) => q[0])), maxX: Math.max(...xz.map((q) => q[0])), minZ: Math.min(...xz.map((q) => q[1])), maxZ: Math.max(...xz.map((q) => q[1])) };
    const centre: [number, number] = [(box.minX + box.maxX) / 2, (box.minZ + box.maxZ) / 2];
    return { m, record, prefix, owners, polys, trunk, boughs, footprint: hull2(xz), box, centre, mat };
  };

  it('(a) the room\'s hull holds its 8 polygons, 3 trunk (WOOD_THICK) and 5 bough (SNOWY_TREE), under clutter/<model>#<record>', () => {
    const { polys, trunk, boughs, box, prefix, owners } = tree();
    expect(polys, `polygons under ${prefix} (owners: ${owners.map((o) => o.path).join(', ')})`).toHaveLength(8);
    expect(trunk).toHaveLength(3);
    expect(boughs).toHaveLength(5);
    // The trunk's model-space x/z -1.81..2.47 at the instance's translation.
    expect(box.minX).toBeGreaterThan(1872.5);
    expect(box.maxX).toBeLessThan(1878.5);
    expect(box.minZ).toBeGreaterThan(1236);
    expect(box.maxZ).toBeLessThan(1242);
  });

  /** The same map's grid without the clutter (`mapCollision` with no CLUTTER.ZAR): the walk's control, as before CLT-2. */
  const bareGrid = (): Grid => {
    const { bytes } = load();
    const toc = parseZdb(bytes);
    const models = parseSceneGraph(Zar.parse(zdbMember(bytes, toc, 'MP1_GEO.ZED')));
    applyR0004MapPatch(models, 'MP1');
    const { polys, owners } = mapCollision(models, 'MP1', () => { throw new Error('no clutter: the control'); });
    let params = DEFAULT_GRID_PARAMS;
    try { params = parseGridParams(Zar.parse(zdbMember(bytes, toc, 'MP1.ZED'))); } catch { /* the default, as simMap */ }
    return groundGrid(packGround(params, polys, owners));
  };
  /** Walk -x along the trunk's own z from the probe's +x start; the feet per tick. */
  const walk = (grid: Grid, z: number): [number, number, number][] => {
    const w = new Walker(grid);
    expect(w.place(1892.42, 62.54 + 10, z)).toBe(true);
    w.state.yaw = 90;                                       // facing (-sin, -cos) of the yaw: -x
    const path: [number, number, number][] = [];
    for (let k = 0; k < 150; k++) { w.tick(FORWARD); path.push([w.state.x, w.state.y, w.state.z]); }
    return path;
  };
  const describePath = (path: [number, number, number][], centre: [number, number]): string => {
    const near = path.reduce((b, p) => (Math.hypot(p[0] - centre[0], p[2] - centre[1]) < Math.hypot(b[0] - centre[0], b[2] - centre[1]) ? p : b));
    const turned = path.findIndex((p) => Math.abs(p[2] - centre[1]) > 0.5);
    const end = path[path.length - 1]!;
    return `closest (${near[0].toFixed(2)}, ${near[2].toFixed(2)}) at ${Math.hypot(near[0] - centre[0], near[2] - centre[1]).toFixed(2)} from the trunk's axis; `
      + `first off the line at tick ${turned}${turned >= 0 ? ` (${path[turned]![0].toFixed(2)}, ${path[turned]![2].toFixed(2)})` : ''}; end (${end[0].toFixed(2)}, ${end[1].toFixed(2)}, ${end[2].toFixed(2)})`;
  };

  it("(b) a Walker walked from +x at the trunk: without the clutter it walks straight through the trunk's place; with it, it never comes within a body radius of the trunk's axis", () => {
    const { m, footprint, centre, boughs } = tree();
    const bare = walk(bareGrid(), centre[1]), real = walk(m.grid, centre[1]);
    // The bough skirt: its reach (the farthest bough point from the axis, ~12) and its nearest face at the base (the
    // horizontal distance from the axis to the line through each bough triangle's two lowest points, ~9.7).
    const pts = boughs.flatMap((p) => Array.from({ length: p.points.length / 3 }, (_, i) => [p.points[3 * i]!, p.points[3 * i + 1]!, p.points[3 * i + 2]!] as const));
    const skirt = Math.max(...pts.map((q) => Math.hypot(q[0] - centre[0], q[2] - centre[1])));
    const faceAt = (p: WorldPoly): number => {
      const q = Array.from({ length: p.points.length / 3 }, (_, i) => [p.points[3 * i]!, p.points[3 * i + 1]!, p.points[3 * i + 2]!] as const).sort((a, b) => a[1] - b[1]);
      const [a, b] = [q[0]!, q[1]!], dx = b[0] - a[0], dz = b[2] - a[2];
      return Math.abs(dx * (centre[1] - a[2]) - dz * (centre[0] - a[0])) / Math.hypot(dx, dz);
    };
    const face = Math.min(...boughs.map(faceAt));
    const off = real.findIndex((p, k) => Math.hypot(p[0] - bare[k]![0], p[2] - bare[k]![2]) > 1e-3);
    const said = `control: ${describePath(bare, centre)} | with the clutter: ${describePath(real, centre)}`;
    console.log(`CLT-2 (b) ${said}`);
    // The control (the hull before CLT-2): the body crosses the trunk's own place.
    expect(bare.some((p) => insideHull(footprint, p[0], p[2])), `the control crosses the trunk's place: ${said}`).toBe(true);
    // With the clutter: never inside the trunk, never within a body radius of its axis (held, or turned round it).
    expect(real.some((p) => insideHull(footprint, p[0], p[2])), `the body's centre entered the trunk: ${said}`).toBe(false);
    const closest = Math.min(...real.map((p) => Math.hypot(p[0] - centre[0], p[2] - centre[1])));
    expect(closest, `closest to the trunk's axis: ${said}`).toBeGreaterThan(BODY_RADIUS);
    // The boughs, not the trunk, turn it (CLT-2's third review, F2): the same path as the control until it leaves the
    // line at the skirt's edge, and never nearer the axis than the skirt's base faces.
    const said2 = `${said}; skirt ${skirt.toFixed(2)}, base face ${face.toFixed(2)}, off at tick ${off}`;
    expect(off, `the walk leaves the control's path: ${said2}`).toBeGreaterThan(0);
    const dx = real[off]![0] - centre[0];
    expect(dx, `it leaves at the skirt's edge: ${said2}`).toBeGreaterThan(skirt - 1);
    expect(dx, `it leaves at the skirt's edge: ${said2}`).toBeLessThan(skirt + BODY_RADIUS + 1);
    expect(closest, `never nearer than the skirt's base faces: ${said2}`).toBeGreaterThan(face - 1);
  });

  /**
   * FIR-STOP (research 422 s7.1; the rig's leg 1, r0004, Shadow PC 2026-11-13 16:15Z, gate-runner/shadow/out/2026-11-13/1b-fir/,
   * three runs a case): a standing SEAL placed 45 u east of the rig's centre (1874.5, 1239.5) at (1919.5, 68, z), facing
   * -x, the stick held forward 3 s. Head-on (z 1239.5) the original STOPS: closest 13.41 u, the end (1887.85, 60.52,
   * 1238.22), z drift 2.0 or less. Beside (z 1245.5) it slides round and passes: closest 12.05 / 12.58 / 12.59, pushed
   * to z 1252.06 and on west. [proven: a trace of the original, three runs each]
   * The port differs on both (LATER 1018; research 422 s7.1): head-on it slides south along the bough face and round;
   * beside it jams at the skirt's east corner. Held as `it.fails` -- the original's numbers asserted, the port known
   * not to meet them -- until the solver's rule is read and built (v0.4.22); then `it.fails` goes red and comes off.
   */
  const RIG_CENTRE: [number, number] = [1874.5, 1239.5];
  const rigWalk = (z: number): { path: [number, number, number][]; said: string } => {
    const { m, prefix, mat } = tree();
    const w = new Walker(m.grid);
    expect(w.place(1919.5, 68, z), `placed at (1919.5, 68, ${z})`).toBe(true);
    w.state.yaw = 90;                                       // facing -x
    const path: [number, number, number][] = [];
    const log: string[] = [];
    for (let k = 0; k < 180; k++) {                          // 3 s at the port's 60 Hz tick
      w.tick(FORWARD);
      path.push([w.state.x, w.state.y, w.state.z]);
      const hits = w.wallHits().map((h) => `${mat(h.poly).name}/${h.line}`).join('+');
      if (k % 10 === 9 || hits) log.push(`${k}:(${w.state.x.toFixed(2)},${w.state.y.toFixed(2)},${w.state.z.toFixed(2)})${hits ? ` ${hits}` : ''}`);
    }
    const d = path.map((p) => Math.hypot(p[0] - RIG_CENTRE[0], p[2] - RIG_CENTRE[1]));
    const end = path[path.length - 1]!;
    const said = `${prefix}: closest ${Math.min(...d).toFixed(2)}, end (${end[0].toFixed(2)}, ${end[1].toFixed(2)}, ${end[2].toFixed(2)}); ${log.join(' ')}`;
    console.log(`FIR-STOP z ${z}: ${said}`);
    return { path, said };
  };

  it("(b2/b3 set-up) the rig's two start points place a standing body and the tree record is found, so (b2) and (b3) fail on the walk alone", () => {
    tree();
    for (const z of [1239.5, 1245.5]) expect(new Walker(load().m.grid).place(1919.5, 68, z), `placed at (1919.5, 68, ${z})`).toBe(true);
  });

  it.fails('(b2) head-on from 45 u east (z 1239.5), standing, the stick forward 3 s: the original stops at x 1887.85 and never passes', () => {
    const { path, said } = rigWalk(1239.5);
    const end = path[path.length - 1]!;
    expect(Math.abs(end[0] - 1887.85), `ends at the original's x 1887.85: ${said}`).toBeLessThan(0.5);
    expect(Math.abs(end[2] - 1238.22), `ends at the original's z 1238.22: ${said}`).toBeLessThan(2);
    expect(Math.min(...path.map((p) => p[0])), `never passes the fir: ${said}`).toBeGreaterThan(RIG_CENTRE[0] + 12);
  });

  it.fails('(b3) 6 u beside the axis (z 1245.5), standing, the stick forward 3 s: the original slides round at 12.05-12.59 and passes on z ~1252.06', () => {
    const { path, said } = rigWalk(1245.5);
    const end = path[path.length - 1]!;
    const closest = Math.min(...path.map((p) => Math.hypot(p[0] - RIG_CENTRE[0], p[2] - RIG_CENTRE[1])));
    expect(closest, `closest approach: ${said}`).toBeGreaterThan(12.05 - 0.5);
    expect(closest, `closest approach: ${said}`).toBeLessThan(12.59 + 0.5);
    expect(end[0], `passes the fir: ${said}`).toBeLessThan(RIG_CENTRE[0]);
    expect(Math.abs(end[2] - 1252.06), `on west along z 1252.06: ${said}`).toBeLessThan(0.5);
  });

  it('(c) a round along y 78.21 from +x through the trunk stops on the trunk (WOOD_THICK), on an owner of this instance', () => {
    const { m, centre, box, prefix } = tree();
    const pen = (mat: number | undefined) => surfaceMaterial(mat ?? 0, m.defaultMaterial).penetration;
    const path = roundPath(m.grid, [1892.42, 78.21, centre[1]], [-1, 0, 0], 100, pen, 0);
    const said = JSON.stringify(path.struck.map((s) => [s.owner, s.material, s.point.map((v) => +v.toFixed(2))]));
    expect(path.hit, `struck ${said}`).not.toBeNull();
    expect(under(path.hit!.owner!, prefix), `struck ${said}`).toBe(true);
    expect(surfaceMaterial(path.hit!.material!, m.defaultMaterial).name).toBe('WOOD_THICK');
    expect(path.hit!.point[0]).toBeGreaterThanOrEqual(box.minX - 0.01);
    expect(path.hit!.point[0]).toBeLessThanOrEqual(box.maxX + 0.01);
  });

  it('(d) line 1 through the trunk is refused; a line through a bough alone is shortened by its 0.7', () => {
    const { m, centre, boughs, mat, prefix } = tree();
    const y = AT[1] + 20;                                   // trunk height (model y 0..54.11)
    const def = m.defaultMaterial ?? '';
    // Through the trunk: refused whatever the radius, PENETRATION 0 (`reachGate`).
    expect(blastLine1(m.grid, [centre[0] + 10, y, centre[1]], [centre[0] - 10, y, centre[1]], 1000, def)).toBe(false);
    expect(blastLine1(m.grid, [centre[0] - 10, y, centre[1]], [centre[0] + 10, y, centre[1]], 1000, def)).toBe(false);
    // Through one bough polygon at its centroid, 4 either side along its normal: a line of 8 that meets no trunk.
    const pen = (n: number | undefined) => surfaceMaterial(n ?? 0, def).penetration;
    let chosen: { a: Vec3; b: Vec3 } | null = null;
    for (const p of boughs) {
      const n = polygonNormal(p.points);
      if (!n) continue;
      const k = p.points.length / 3;
      const c: Vec3 = [0, 0, 0];
      for (let i = 0; i < k; i++) { c[0] += p.points[i * 3]! / k; c[1] += p.points[i * 3 + 1]! / k; c[2] += p.points[i * 3 + 2]! / k; }
      const a: Vec3 = [c[0] + 4 * n[0], c[1] + 4 * n[1], c[2] + 4 * n[2]], b: Vec3 = [c[0] - 4 * n[0], c[1] - 4 * n[1], c[2] - 4 * n[2]];
      const dir: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]].map((v) => v / 8) as Vec3;
      const both = [roundPath(m.grid, a, dir, 8, pen, 0), roundPath(m.grid, b, dir.map((v) => -v) as Vec3, 8, pen, 0)];
      const clean = both.every((r) => r.struck.length > 0 && r.struck.every((s) => under(s.owner ?? '', prefix))
        && r.struck.every((s) => surfaceMaterial(s.material ?? 0, def).name === 'SNOWY_TREE'));
      if (clean && mat(p).name === 'SNOWY_TREE') { chosen = { a, b }; break; }
    }
    expect(chosen, 'a bough polygon whose 8-unit line through its centroid meets only this tree\'s boughs').not.toBeNull();
    const { a, b } = chosen!;
    // The gate (`reachGate`): radius^2 x 0.7 against the length^2 of 64. Radius 1000 passes either way; radius 8.8
    // (77.44 > 64, 54.2 < 64) passes with no face and fails with the bough met from its front -- line 1 is one-sided
    // (`BLAST_LINE1_SIDES_READING`), so one of the two directions meets it.
    expect(blastLine1(m.grid, a, b, 1000, def)).toBe(true);
    expect(blastLine1(m.grid, b, a, 1000, def)).toBe(true);
    expect([blastLine1(m.grid, a, b, 8.8, def), blastLine1(m.grid, b, a, 8.8, def)]).toContain(false);
  });

  it('(e) the page\'s hull is the room\'s on Blizzard, its clutter owners with it', async () => {
    const { m, prefix } = tree();
    const page = await loadMap(new FsAssetSource(DISC), 'RUN/MP1.ZDB');
    expect(page.ground!.grid).toEqual(m.ground.grid);
    expect(page.ground!.owners).toEqual(m.ground.owners);
    expect(Buffer.from(page.ground!.points.buffer).equals(Buffer.from(m.ground.points.buffer))).toBe(true);
    expect(Buffer.from(page.ground!.fields.buffer).equals(Buffer.from(m.ground.fields.buffer))).toBe(true);
    expect(page.ground!.owners.some((o) => under(o.path, prefix))).toBe(true);
  }, 120_000);
});

describe.skipIf(!HAVE_MP61)(`CLT-2: r0004 drops Sujo's barrel_open at (614, 30, 1134)${HAVE_MP61 ? '' : ' (SOCOM_DISC absent)'}`, () => {
  it('the room\'s hull holds Sujo\'s clutter but not that barrel (r0004 r4 0x2f2108-0x2f2304, research 422 s4)', () => {
    const bytes = new Uint8Array(readFileSync(resolve(DISC, 'RUN', 'MP61.ZDB')));
    const m = simMapFromBytes(bytes, 'RUN/MP61.ZDB');
    const list = instancesOf(bytes);
    const dropped = list.flatMap((c, i) => (r0004DropsClutter('MP61', c.modelName, c.matrix) ? [i] : []));
    // The controller's reading names it barrel_open record 8; the index here is the record's in parseClutter's whole list.
    expect(dropped, `dropped records: ${dropped.join(', ')}`).toHaveLength(1);
    const i = dropped[0]!;
    expect(list[i]!.modelName).toBe('barrel_open');
    expect(m.ground.owners.some((o) => o.path.startsWith('clutter/'))).toBe(true);
    expect(m.ground.owners.filter((o) => under(o.path, `clutter/barrel_open#${i}`)).map((o) => o.path)).toEqual([]);
  });
});
