// @vitest-environment node
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { InstancedMesh, Matrix4, Mesh, Vector3 } from 'three';
import { FsAssetSource } from '@s2u/archive/node';
import { Fire } from '../src/fire';
import { loadMap } from '../src/loadMap';
import { MarkClipper } from '../src/markClip';
import { groundGrid } from '../src/mover';
import { buildWorld } from '../src/world';
import { WorldState } from '../src/worldState';

const disc = process.env.SOCOM_DISC;
// Frostfire's door panes, plus every map in the C4 browser regression. Counts pin the
// collision/visual surfaces reached on the US disc, so a lost target cannot silently reduce coverage.
// This exercises impact rendering and WorldState visibility, not the C4 plant/fuse or glass damage trigger.
const cases = [
  ['MP2', 'pane', 3], ['MP6', 'access', 1], ['MP11', 'access', 2], ['MP51', 'access', 5],
  ['MP61', 'access', 6], ['MP62', 'access', 2], ['MP71', 'access', 3], ['MP71', 'glass', 4],
  ['MP73', 'access', 3], ['MP82', 'access', 3], ['MP83', 'access', 2],
] as const;
type V3 = [number, number, number];

describe('bullet-hole ownership on retail destructibles (dev-disc)', () => {
  for (const [stem, kind, expected] of cases) {
    it.skipIf(!disc || !existsSync(resolve(disc, `RUN/${stem}.ZDB`)))(`${stem}: ${kind} marks disappear with their surface`, async () => {
      const map = await loadMap(new FsAssetSource(disc!), `RUN/${stem}.ZDB`);
      if (!map.ground || !map.meta) throw new Error(`${stem}: collision or scene metadata missing`);
      const view = buildWorld(map);
      const grid = groundGrid(map.ground);
      const world = new WorldState(map.meta, map.ground, grid, { visible: (path, on) => { view.setNodeActive(path, on); } });
      const clipper = new MarkClipper(view.group);
      const fire = new Fire({ grid: () => grid, aim: () => null,
        attachToNode: (path, mark) => view.attachToNode(path, mark),
        holdOnNode: (path, gone) => view.holdOnNode(path, gone),
      }, undefined, undefined, () => 0.5);
      fire.setClip(clipper);
      try {
        for (const reveal of [...view.revealWorld, ...view.revealProps]) reveal();
        world.applyInitial();
        view.group.updateMatrixWorld(true);
        const candidates: { mesh: Mesh; matrix: Matrix4; path: string }[] = [];
        view.group.traverse(object => {
          if (!(object instanceof Mesh) || !object.visible) return;
          const count = object instanceof InstancedMesh ? object.count : 1;
          for (let i = 0; i < count; i++) {
            const path: unknown = object instanceof InstancedMesh ? object.userData.nodePaths?.[i] : (object.userData.nodePath ?? object.userData.switchPath);
            if (typeof path !== 'string' || !world.isActive(path)) continue;
            const wanted = kind === 'access' ? /\/access\d.*\/good_parts(?:\/|$)/i.test(path)
              : kind === 'pane' ? /\/pane\d*$/i.test(path) : /\/wglass$/i.test(path);
            if (!wanted) continue;
            const matrix = object.matrixWorld.clone();
            if (object instanceof InstancedMesh) { const local = new Matrix4(); object.getMatrixAt(i, local); matrix.multiply(local); }
            candidates.push({ mesh: object, matrix, path });
          }
        });
        expect(candidates.length, `${stem} ${kind}: rendered target surfaces`).toBeGreaterThan(0);
        let checked = 0;
        const seen = new Set<string>();
        for (const { mesh, matrix, path } of candidates) {
          if (seen.has(path)) continue;
          const position = mesh.geometry.getAttribute('position'), index = mesh.geometry.getIndex();
          const count = index ? index.count : position.count;
          for (let i = 0; i + 2 < count && i < 300; i += 3) {
            const vertices = [0, 1, 2].map(k => new Vector3().fromBufferAttribute(position, index ? index.getX(i + k) : i + k).applyMatrix4(matrix));
            const [a, b, c] = vertices as [Vector3, Vector3, Vector3];
            const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
            if (normal.lengthSq() === 0) continue;
            const centre = a.clone().add(b).add(c).multiplyScalar(1 / 3);
            fire.clearMarks();
            const shot = fire.drawRound(centre.clone().addScaledVector(normal, 2).toArray() as V3,
              normal.clone().negate().toArray() as V3, 4, 0, 0, 1);
            if (!shot?.hit || clipper.lastNodePath !== path) continue;
            const mark = fire.decalMeshes().find(d => d.visible);
            if (!mark) continue;
            world.setActive(path, false);
            expect(mark.visible, `${stem} ${path}: stale bullet hole`).toBe(false);
            expect(fire.state().decals).toBe(0);
            world.setActive(path, true);
            expect(mark.visible, 're-enabled geometry must not resurrect a recycled mark').toBe(false);
            checked++; seen.add(path); break;
          }
        }
        console.log(JSON.stringify({ stem, kind, checked, paths: [...seen] }));
        expect(checked, `${stem} ${kind}: actual collision/visual surfaces verified`).toBe(expected);
      } finally { fire.dispose(); view.dispose(); }
    }, 60000);
  }
});
