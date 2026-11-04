import { Box3, InstancedMesh, Matrix4, Mesh, type BufferAttribute, type Object3D } from 'three';
import type { TurretPlacement } from '@s2u/scene';

/**
 * The manual turrets as the debug hook shows them (W0-gate, web sprint 31; `e2e/turretSky.spec.ts`,
 * `e2e/turretMount.spec.ts`): what the page draws beneath each placed turret's root and the placements' own numbers.
 * The hook reads; it changes nothing. `turretParts.test.ts` checks the decoded parts against their nodes' bboxes under
 * node; this is the same check's page half -- the vertices as uploaded to the draw (`world.ts` `geometryOf` keeps the
 * part's positions as they were decoded) and the matrix each is drawn at, read off the world's group.
 */

type V6 = [number, number, number, number, number, number];

/** One drawn turret part: its scene path, its model, its vertices' own bounds and those bounds where they are drawn. */
export interface DrawnTurretPart {
  path: string;
  model: string;
  /** The drawn geometry's position bounds in the part's own frame: min x, y, z, then max x, y, z. */
  local: V6;
  /** The same box through the matrix the part is drawn at now (world space; a turned gun's moved). */
  world: V6;
  /** The drawn matrix (column-major 16 floats, the group's own matrix included). */
  matrix: number[];
}

const under = (path: string, root: string): boolean => path === root || path.startsWith(`${root}/`) || path.startsWith(`${root}=`);
const six = (b: Box3): V6 => [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z];

/**
 * Every drawn part under one of `roots`: a single-placement mesh carries its node's path (`userData.nodePath`,
 * `world.ts` `movableMesh`), an instanced draw one path per instance (`userData.nodePaths`). A draw without a path (a
 * detail or environment pass over its base) is its base's and is not listed again.
 */
export function drawnTurretParts(group: Object3D | null, roots: readonly string[]): DrawnTurretPart[] {
  if (!group || roots.length === 0) return [];
  group.updateMatrixWorld(true);
  const out: DrawnTurretPart[] = [];
  const add = (path: string, model: string, position: BufferAttribute, matrix: Matrix4): void => {
    const local = new Box3().setFromBufferAttribute(position);
    out.push({ path, model, local: six(local), world: six(local.clone().applyMatrix4(matrix)), matrix: Array.from(matrix.elements) });
  };
  group.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const position = o.geometry.getAttribute('position') as BufferAttribute | undefined;
    if (!position) return;
    if (o instanceof InstancedMesh) {
      const paths = o.userData['nodePaths'] as string[] | undefined;
      if (!paths) return;
      const at = new Matrix4();
      paths.forEach((path, i) => {
        if (!roots.some((r) => under(path, r))) return;
        o.getMatrixAt(i, at);
        add(path, o.name, position, o.matrixWorld.clone().multiply(at));
      });
      return;
    }
    const path = o.userData['nodePath'] as string | undefined;
    if (path !== undefined && roots.some((r) => under(path, r))) add(path, o.name, position, o.matrixWorld.clone());
  });
  return out;
}

/** A placement as the hook shows it: the numbers the mount and the aim are tested against (`../net/emplacement`). */
export interface TurretPlacementView {
  id: number; root: string; name: string; parts: TurretPlacement['parts'];
  origin: [number, number, number]; facing: number; gunOrigin: [number, number, number];
  /** The limits in degrees (the placement keeps radians, `x 0.017453292` as the parser converts, D:L301529-301540). */
  limitsDeg: { yaw: [number, number] | null; pitch: [number, number] | null };
  mountRange: number; mountAngleCos: number; weapon: string | null; ammoInit: number | null;
}

const DEG = 180 / Math.PI;

export function placementView(t: TurretPlacement): TurretPlacementView {
  const deg = (p: [number, number] | null): [number, number] | null => (p ? [p[0] * DEG, p[1] * DEG] : null);
  return {
    id: t.id, root: t.root, name: t.name, parts: { ...t.parts }, origin: [...t.origin], facing: t.facing, gunOrigin: [...t.gunOrigin],
    limitsDeg: { yaw: deg(t.limits.yaw), pitch: deg(t.limits.pitch) },
    mountRange: t.mountRange, mountAngleCos: t.mountAngleCos, weapon: t.weapon, ammoInit: t.ammoInit,
  };
}
