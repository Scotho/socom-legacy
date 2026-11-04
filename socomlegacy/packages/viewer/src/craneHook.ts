import { InstancedMesh, Matrix4, Mesh, type Object3D } from 'three';

/**
 * Chain Reaction as the disc check reads it (`window.__crane`). A browser adaptation: it reports the drawn hook,
 * the panels and the lever meshes, and whether the translation is paused. It changes nothing the game does.
 */

export interface CraneHookState {
  index: number;
  paused: boolean;
  valve: number;
  mesh: string;
  offset: readonly [number, number, number];
  hook: string;
  panels: readonly string[];
  onMesh: string;
  offMesh: string;
  swingPath: string;
}

/** One scene object, or a named root that has none. */
export interface CraneDraw {
  path: string;
  drawn: boolean;
  visible: boolean;
  /** World position. Null when nothing is drawn at `path`. */
  position: [number, number, number] | null;
}

export interface CraneHookView extends CraneHookState {
  pieces: CraneDraw[];
}

const under = (path: string, root: string): boolean => path === root || path.startsWith(`${root}/`) || path.startsWith(`${root}=`);

interface Found {
  visible: boolean;
  position: [number, number, number];
}

/** Every mesh the group draws, by scene path (`nodePath`, or one entry of an instanced `nodePaths`). */
function drawnByPath(group: Object3D): Map<string, Found> {
  group.updateMatrixWorld(true);
  const out = new Map<string, Found>();
  const at = new Matrix4();
  const world = new Matrix4();
  const put = (path: string, found: Found): void => {
    const prev = out.get(path);
    if (!prev || (!prev.visible && found.visible)) out.set(path, found);
  };
  group.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    if (o instanceof InstancedMesh) {
      const paths = o.userData['nodePaths'] as string[] | undefined;
      if (!paths) return;
      paths.forEach((path, i) => {
        o.getMatrixAt(i, at);
        world.multiplyMatrices(o.matrixWorld, at);
        const e = at.elements;
        const hidden = e[0] === 0 && e[5] === 0 && e[10] === 0 && e[15] === 0;
        const w = world.elements;
        put(path, { visible: o.visible && !hidden, position: [w[12]!, w[13]!, w[14]!] });
      });
      return;
    }
    const path = o.userData['nodePath'] as string | undefined;
    if (!path) return;
    const w = o.matrixWorld.elements;
    put(path, { visible: o.visible, position: [w[12]!, w[13]!, w[14]!] });
  });
  return out;
}

/**
 * One view per hook. A named root with no object is `drawn: false` (a visual-less node, or a mesh the load did not
 * build). A drawn descendant is listed under the first root it belongs to.
 */
export function craneScene(group: Object3D | null, state: readonly CraneHookState[]): CraneHookView[] {
  const found = group ? drawnByPath(group) : new Map<string, Found>();
  return state.map((s) => {
    const roots = [s.hook, ...s.panels, s.onMesh, s.offMesh, s.swingPath];
    const pieces: CraneDraw[] = [];
    const listed = new Set<string>();
    for (const root of roots) {
      if (listed.has(root)) continue;
      const exact = found.get(root);
      pieces.push(exact
        ? { path: root, drawn: true, visible: exact.visible, position: exact.position }
        : { path: root, drawn: false, visible: false, position: null });
      listed.add(root);
      for (const [path, draw] of found) {
        if (listed.has(path) || path === root || !under(path, root)) continue;
        pieces.push({ path, drawn: true, visible: draw.visible, position: draw.position });
        listed.add(path);
      }
    }
    return { ...s, panels: [...s.panels], offset: [s.offset[0], s.offset[1], s.offset[2]], pieces };
  });
}
