import { Matrix4 } from 'three';
import { under } from '../mapMeta';
import type { WorldOperation } from './worldFrame';

export interface WorldPlacementSpec {
  path?: string; paths?: readonly string[]; scrollPath?: string; alternate: boolean;
}
/** Numeric placement state only, never a decoded mesh. Matches world.ts:
 * moveNode writes delta * authored base, setNodeActive reaches path descendants,
 * hidden instances have a zero matrix, setNodeOpacity addresses an exact path
 * of a standalone mesh (not a multi-instance draw), and UV offsets reach the
 * world chunks registered under scrollPath. Shared simulation owns the values.
 */
export function worldPlacement(spec: WorldPlacementSpec & { matrices?: Float32Array }) {
  const paths = spec.paths ? [...spec.paths] : [], path = spec.path ?? (paths.length === 1 ? paths[0] : undefined);
  const scrollPath = spec.scrollPath;
  const base = spec.matrices?.slice() ?? new Float32Array(0), now = base.slice(), matrices = base.slice();
  const count = base.length / 16, hidden = new Uint8Array(count).fill(Number(spec.alternate));
  if (spec.alternate) matrices.fill(0);
  // World chunks have no placement transform; avoid two scratch matrices for
  // every static material batch. Instanced ranges share this scratch pair.
  const delta = count ? new Matrix4() : null, placed = count ? new Matrix4() : null;
  const state = { matrices, visible: !spec.alternate, opacity: 1, uv: [0, 0] as [number, number], moved: false,
    /** Exact retained numeric arrays; excludes JS object/string overhead. */
    cpuPayloadBytes: base.byteLength + now.byteLength + matrices.byteLength + hidden.byteLength,
    apply(operations: readonly WorldOperation[]): boolean {
      let dirty = false;
      for (const op of operations) {
        if (op.kind === 'visible') {
          if (count) {
            for (let i = 0; i < count; i++) if (paths[i] && under(paths[i]!, op.path) && hidden[i] !== Number(!op.value)) {
              hidden[i] = Number(!op.value); dirty = true;
              if (op.value) matrices.set(now.subarray(i * 16, (i + 1) * 16), i * 16);
              else matrices.fill(0, i * 16, (i + 1) * 16);
            }
            state.visible = hidden.some(value => !value);
          } else if (path && under(path, op.path)) state.visible = op.value;
        } else if (op.kind === 'move' && count) {
          for (let i = 0; i < count; i++) if (paths[i] && under(paths[i]!, op.path)) {
            placed!.fromArray(base, i * 16).premultiply(delta!.fromArray(op.value)).toArray(now, i * 16);
            if (!hidden[i]) matrices.set(now.subarray(i * 16, (i + 1) * 16), i * 16);
            dirty = true; state.moved = true;
          }
        } else if (op.kind === 'opacity' && count <= 1 && path === op.path) state.opacity = op.value;
        else if (op.kind === 'scroll' && scrollPath && under(scrollPath, op.path)) state.uv = [op.value[0], op.value[1]];
      }
      return dirty;
    },
  };
  return state;
}
