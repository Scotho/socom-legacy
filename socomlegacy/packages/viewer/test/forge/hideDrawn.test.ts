import { describe, expect, it } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { InstancedMesh, LineSegments, Matrix4, Mesh, Vector3, type BufferAttribute, type Object3D } from 'three';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { parseSceneGraph, placeInstances } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../../archive/test/fixtures';
import { loadMap, type LoadedMap } from '../../src/loadMap';
import { under } from '../../src/mapMeta';
import { buildWorld, type WorldView } from '../../src/world';
import { placementOf, placementsOf } from '../../src/forge/hide';

/**
 * FG-32 (the owner's playtest, 2026-10-14, FG.R17: "deleting original map objects visually only appears to delete half
 * of them ... the hitbox does disappear"; the forge's hide, a browser adaptation): what a hidden base placement leaves
 * drawn, on the disc's own maps, through the page's path -- `placementOf` by model and place, every entry of that place
 * (`placementsOf`), `WorldView.setPlacementActive` on each -- counted geometrically, independent of how `world.ts` files
 * its switches: every triangle still drawn (its object and every ancestor visible, an instance's matrix not the zero one)
 * and every line segment still drawn (not collapsed to a point) inside the placement's box.
 *
 * And the premise the brief named -- world geometry filed under a prop's node path, merged into the world's draws by
 * texture and so never hidden -- read on every fixture map: no world placement lies at or under a prop placement's path.
 * `flattenScene` gives every node of a realised prototype the `=` path of its prop, and the world's own nodes never one.
 */
const absent = fixture('RUN/MP2.ZDB') === null || fixture('RUN/MP72.ZDB') === null;
const FIXTURES = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../../test-fixtures'));

interface Box { lo: Vector3; hi: Vector3 }
const inBox = (b: Box, v: Vector3): boolean => v.x > b.lo.x && v.y > b.lo.y && v.z > b.lo.z && v.x < b.hi.x && v.y < b.hi.y && v.z < b.hi.z;
const shown = (o: Object3D | null): boolean => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };

/** Every drawn triangle whose three corners lie inside the box, by object name; a pass hung under a draw (detail, env) is its draw's. */
function trianglesInside(view: WorldView, box: Box): Record<string, number> {
  view.group.updateMatrixWorld(true);
  const out: Record<string, number> = {};
  const c = [new Vector3(), new Vector3(), new Vector3()], m = new Matrix4(), im = new Matrix4();
  view.group.traverse((o) => {
    if (!(o instanceof Mesh) || o.parent instanceof Mesh || !shown(o)) return;
    const position = o.geometry.getAttribute('position') as BufferAttribute;
    const index = o.geometry.getIndex()!;
    const count = o instanceof InstancedMesh ? o.count : 1;
    for (let i = 0; i < count; i++) {
      m.copy(o.matrixWorld);
      if (o instanceof InstancedMesh) {
        o.getMatrixAt(i, im);
        if (im.determinant() === 0) continue;                       // a hidden instance: the zero matrix
        m.multiply(im);
      }
      for (let t = 0; t < index.count; t += 3) {
        for (let k = 0; k < 3; k++) c[k]!.fromBufferAttribute(position, index.getX(t + k)).applyMatrix4(m);
        if (!c.every((v) => inBox(box, v))) continue;
        out[o.name] = (out[o.name] ?? 0) + 1;
      }
    }
  });
  return out;
}

/** Every drawn line segment (both ends apart) with an end inside the box. */
function segmentsInside(view: WorldView, box: Box): number {
  let n = 0;
  const a = new Vector3(), b = new Vector3();
  view.group.traverse((o) => {
    if (!(o instanceof LineSegments) || !shown(o)) return;
    const position = o.geometry.getAttribute('position') as BufferAttribute;
    for (let i = 0; i + 1 < position.count; i += 2) {
      a.fromBufferAttribute(position, i);
      b.fromBufferAttribute(position, i + 1);
      if (!a.equals(b) && (inBox(box, a) || inBox(box, b))) n++;
    }
  });
  return n;
}

/** A placement's box in the world: its prop's parts' model-space extent through its matrix, half a unit wider a side. */
function boxOf(map: LoadedMap, prop: number, index: number): Box {
  const p = map.props[prop]!;
  const m = new Matrix4().fromArray(p.matrices, index * 16);
  const lo = new Vector3(Infinity, Infinity, Infinity), hi = new Vector3(-Infinity, -Infinity, -Infinity);
  const v = new Vector3();
  for (const part of p.parts) {
    for (let i = 0; i < part.positions.length; i += 3) {
      v.set(part.positions[i]!, part.positions[i + 1]!, part.positions[i + 2]!).applyMatrix4(m);
      lo.min(v); hi.max(v);
    }
  }
  return { lo: lo.subScalar(0.5), hi: hi.addScalar(0.5) };
}

/** The page's hide and show of one placement (`./page`: `placementOf`, then `placementsOf` over the layout's keys). */
function hide(view: WorldView, map: LoadedMap, prop: number, index: number, on: boolean): void {
  const found = placementOf(map, map.props[prop]!.modelName, map.props[prop]!.matrices.subarray(index * 16, index * 16 + 16))!;
  for (const k of placementsOf(map, [found.key])) expect(view.setPlacementActive(k, on), k).toBe(1);
}

const viewOf = async (stem: string): Promise<{ map: LoadedMap; view: WorldView }> => {
  const map = await loadMap(new FsAssetSource(FIXTURES), `RUN/${stem}.ZDB`);
  const view = buildWorld(map);
  for (const task of view.revealWorld) task();
  for (const task of view.revealProps) task();
  return { map, view };
};
const placementsNamed = (map: LoadedMap, test: (model: string) => boolean): { prop: number; index: number }[] =>
  map.props.flatMap((p, prop) => (test(p.modelName) ? Array.from({ length: p.matrices.length / 16 }, (_, index) => ({ prop, index })) : []));

describe.skipIf(absent)(`FG-32: a hidden base placement draws nothing${absent ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  it.skipIf(absent)('on every fixture map, no world placement lies at or under a prop placement\'s path', () => {
    for (const stem of ['MP2', 'MP6', 'MP72']) {
      const bytes = fixture(`RUN/${stem}.ZDB`);
      if (!bytes) continue;
      const placed = placeInstances(parseSceneGraph(Zar.parse(zdbMember(bytes, parseZdb(bytes), `${stem}_GEO.ZED`))), 'worldmodel');
      const propPaths = [...new Set(placed.filter((p) => p.modelName !== 'worldmodel').map((p) => p.path))];
      const world = placed.filter((p) => p.modelName === 'worldmodel');
      expect(world.length, stem).toBeGreaterThan(0);
      expect(propPaths.length, stem).toBeGreaterThan(0);
      expect(world.filter((w) => w.path.includes('=') || propPaths.some((pp) => under(w.path, pp))).map((w) => w.path), stem).toEqual([]);
    }
  });

  /**
   * What else lies in a container's box is not its own: the floor it stands on, the world's lid of the container under the
   * stacked one at (974, 130, 682) (`worldmodel/g3896`), a wall's corner by another. Those stay; the container's own go.
   */
  it.skipIf(absent)("Frostfire's thirteen container_blue01, each hidden alone: its own 16 triangles go, nothing else in its box changes", async () => {
    const { map, view } = await viewOf('MP2');
    const placements = placementsNamed(map, (m) => m === 'container_blue01');
    expect(placements).toHaveLength(13);
    for (const { prop, index } of placements) {
      const box = boxOf(map, prop, index);
      const before = trianglesInside(view, box);
      const { container_blue01: own, ...others } = before;
      expect(own, `${prop}:${index} drawn before`).toBe(16);
      hide(view, map, prop, index, false);
      expect(trianglesInside(view, box), `${prop}:${index} hidden`).toEqual(others);
      hide(view, map, prop, index, true);
      expect(trianglesInside(view, box), `${prop}:${index} shown again`).toEqual(before);
    }
  }, 120000);

  it.skipIf(absent)("Crossroads' tents, each hidden alone: their guy ropes go with them, and come back when shown", async () => {
    const { map, view } = await viewOf('MP72');
    const tents = placementsNamed(map, (m) => /^tent_/.test(m));
    expect(tents.length).toBeGreaterThan(0);
    let roped = 0;
    for (const { prop, index } of tents) {
      const box = boxOf(map, prop, index);
      const before = segmentsInside(view, box);
      if (before > 0) roped++;
      hide(view, map, prop, index, false);
      expect(segmentsInside(view, box), `${map.props[prop]!.modelName} ${prop}:${index} hidden`).toBe(0);
      hide(view, map, prop, index, true);
      expect(segmentsInside(view, box), `${prop}:${index} shown again`).toBe(before);
    }
    expect(roped).toBeGreaterThan(0);
  }, 120000);
});
