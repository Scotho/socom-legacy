/**
 * marks-pipe-aims (WM-20's rendered check, G1; a product-track tool, no original): the aim points the rendered spec
 * `packages/viewer/e2e/marksPipe.spec.ts` pins on Frostfire's two bent pipes. It runs the census's own sampling
 * (`packages/viewer/test/markNothingKeptMaps.test.ts`: the world built and revealed whole, a mark centre every 4 units
 * on each strikable hull face, the clip tried on either side) on the pipes' hull faces only, keeps the samples whose
 * clip keeps nothing for every mark size the faces' row allows, and prints, per pipe, the empty samples whose face
 * looks out sideways (|n.y| < 0.5) with the drawn surface farthest under them (the census's depth probe), each with
 * a stand point 30 units out along the face's level normal.
 *
 *   SOCOM_DISC=<disc> npx tsx tools/marks-pipe-aims.ts
 */
import { Mesh, Object3D, Raycaster, Scene, Vector3 } from 'three';
import { FsAssetSource } from '@s2u/archive/node';
import { polygonNormal, type WorldPoly } from '@s2u/scene';
import { effectsFromDisc } from '../packages/viewer/src/effectData';
import { Effects } from '../packages/viewer/src/effects';
import { loadMap } from '../packages/viewer/src/loadMap';
import { MarkClipper, markClipGeometry, markFrame } from '../packages/viewer/src/markClip';
import { roundAdmits } from '../packages/viewer/src/round';
import { groundGrid } from '../packages/viewer/src/mover';
import { buildWorld } from '../packages/viewer/src/world';

const PIPES = ['worldmodel/short_pip1/di_pipe1_5', 'worldmodel/short_pip2/di_pipe1'];
const STEP = 4, MAX_STEPS = 12, STAND = 30, PER_PIPE = 12;

async function main(): Promise<void> {
  const disc = process.env.SOCOM_DISC;
  if (!disc) throw new Error('SOCOM_DISC unset');
  const src = new FsAssetSource(disc);
  const map = await loadMap(src, 'RUN/MP2.ZDB');
  const built = buildWorld(map);
  const scene = new Scene();
  scene.add(built.group);
  for (const task of [...built.revealWorld, ...built.revealProps]) task();
  scene.updateMatrixWorld(true);
  const data = await effectsFromDisc(src, 'RUN/MP2.ZDB', 'MP2');
  const effects = new Effects(() => 0.5, () => {});
  effects.setData({ ...data, ambient: [] });
  const marks = effects.marks()!;
  const clipper = new MarkClipper(built.group);
  const g = markClipGeometry();
  const ray = new Raycaster();
  ray.far = 60;
  const targets: Object3D[] = [];
  built.group.traverseVisible((o) => { if (o instanceof Mesh && o.geometry.getAttribute('color') && o.visible) targets.push(o); });
  const out: Record<string, { at: number[]; n: number[]; depth: number | null; stand: number[] }[]> = {};
  for (const o of groundGrid(map.ground!).objects) {
    if (o.kind !== 'collision' || !PIPES.includes(o.owner.path)) continue;
    for (const p of o.polys as WorldPoly[]) {
      if (!roundAdmits(p)) continue;
      const row = marks.row(p.material);
      if (!row) continue;
      const n = polygonNormal(p.points);
      if (!n || Math.abs(n[1]) >= 0.5) continue;
      const sizes = [row.minSize, (row.minSize + row.maxSize) / 2, row.maxSize];
      const holds = (at: number[]): boolean => sizes.some((side) => [n, [-n[0], -n[1], -n[2]] as [number, number, number]]
        .some((sd) => clipper.clip(markFrame([at[0]!, at[1]!, at[2]!], sd, [-sd[0], -sd[1], -sd[2]], side), g, 0.05) > 0));
      const pt = (k: number): number[] => [p.points[k * 3]!, p.points[k * 3 + 1]!, p.points[k * 3 + 2]!];
      for (let k = 1; k + 1 < p.ptcount; k++) {
        const A = pt(0), B = pt(k), C = pt(k + 1);
        const longest = Math.max(Math.hypot(B[0]! - A[0]!, B[1]! - A[1]!, B[2]! - A[2]!), Math.hypot(C[0]! - A[0]!, C[1]! - A[1]!, C[2]! - A[2]!), Math.hypot(C[0]! - B[0]!, C[1]! - B[1]!, C[2]! - B[2]!));
        const steps = Math.max(1, Math.min(Math.ceil(longest / STEP), MAX_STEPS));
        for (let i = 0; i <= steps; i++) for (let j = 0; i + j <= steps; j++) {
          const a = (i + 1 / 3) / (steps + 1), b = (j + 1 / 3) / (steps + 1);
          if (a + b > 1) continue;
          const q = [0, 1, 2].map((x) => A[x]! + (B[x]! - A[x]!) * a + (C[x]! - A[x]!) * b);
          if (holds(q)) continue;
          let depth = Infinity;
          for (const sg of [1, -1]) {
            ray.set(new Vector3(q[0], q[1], q[2]), new Vector3(n[0] * sg, n[1] * sg, n[2] * sg));
            const hit = ray.intersectObjects(targets, false)[0];
            if (hit) depth = Math.min(depth, hit.distance);
          }
          const h = Math.hypot(n[0], n[2]) || 1;
          const stand = [q[0]! + (n[0] / h) * STAND, q[2]! + (n[2] / h) * STAND];
          (out[o.owner.path] ??= []).push({ at: q.map((v) => Math.round(v * 10) / 10), n: [n[0], n[1], n[2]].map((v) => Math.round(v * 1000) / 1000), depth: Number.isFinite(depth) ? Math.round(depth * 10) / 10 : null, stand: stand.map((v) => Math.round(v * 10) / 10) });
        }
      }
    }
  }
  for (const [node, list] of Object.entries(out)) {
    // Deepest first (no drawn surface within 60 counts deepest), then spread: no two picks within 6 units.
    list.sort((x, y) => (y.depth ?? 999) - (x.depth ?? 999));
    const picks: typeof list = [];
    for (const e of list) if (picks.length < PER_PIPE && picks.every((p2) => Math.hypot(p2.at[0]! - e.at[0]!, p2.at[1]! - e.at[1]!, p2.at[2]! - e.at[2]!) >= 6)) picks.push(e);
    const faces: Record<string, number> = {};
    for (const e of list) faces[e.n.join(',')] = (faces[e.n.join(',')] ?? 0) + 1;
    const plusZ = list.filter((e) => e.n[2]! > 0.9);
    const plusPicks: typeof list = [];
    for (const e of plusZ) if (plusPicks.length < PER_PIPE && plusPicks.every((p2) => Math.hypot(p2.at[0]! - e.at[0]!, p2.at[1]! - e.at[1]!, p2.at[2]! - e.at[2]!) >= 6)) plusPicks.push(e);
    console.log(`MARKS_PIPE_AIMS ${node} empty-sideways ${list.length} faces ${JSON.stringify(faces)}`);
    console.log(`MARKS_PIPE_AIMS ${node} deepest ${JSON.stringify(picks)}`);
    console.log(`MARKS_PIPE_AIMS ${node} +z ${JSON.stringify(plusPicks)}`);
  }
}

void main();
