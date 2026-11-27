/** Browser rendering boundary. Shared WorldState/DoorPage own every rule and
 * timing; this bounded journal only delivers their latest numeric writes.
 * Keep the latest write per channel/path, ordered by its serial. WorldState
 * re-emits hidden children after showing a parent, so that ordering matters.
 */
export type WorldOperation = { path: string; serial: number } & (
  | { kind: 'visible'; value: boolean }
  | { kind: 'move'; value: Float32Array }
  | { kind: 'opacity'; value: number }
  | { kind: 'scroll'; value: readonly [number, number] });
export interface WorldFrame { readonly revision: number; readonly operations: ReadonlyMap<string, WorldOperation> }
export function worldFrame() {
  const operations = new Map<string, WorldOperation>();
  const frame = { revision: 0, operations };
  const put = (operation: WorldOperation) => { operation.serial = ++frame.revision; operations.set(`${operation.kind}:${operation.path}`, operation); };
  return { frame,
    visible: (path: string, value: boolean) => put({ kind: 'visible', path, value, serial: 0 }),
    opacity: (path: string, value: number) => put({ kind: 'opacity', path, value, serial: 0 }),
    scroll: (path: string, u: number, v: number) => put({ kind: 'scroll', path, value: [u, v], serial: 0 }),
    move(path: string, matrix: ArrayLike<number>) {
      const previous = operations.get(`move:${path}`);
      const value = previous?.kind === 'move' ? previous.value : new Float32Array(16);
      for (let i = 0; i < 16; i++) value[i] = matrix[i]!;
      put({ kind: 'move', path, value, serial: 0 });
    },
    dispose() { operations.clear(); },
  };
}
/** One cursor per backend. The returned list is borrowed for the synchronous draw.
 * The current clean-join path recreates renderer and runtime together (main.clearRun).
 * A new frame restarts journal delivery, not authored placement state; seamless
 * runtime replacement will also need to restore that state before using this cursor.
 */
export function worldChanges() {
  let previous: WorldFrame | undefined, serial = 0;
  const changed: WorldOperation[] = [];
  return { take(frame: WorldFrame | undefined): readonly WorldOperation[] {
    changed.length = 0;
    if (frame !== previous) { previous = frame; serial = 0; }
    if (!frame || frame.revision === serial) return changed;
    for (const operation of frame.operations.values()) if (operation.serial > serial) changed.push(operation);
    changed.sort((a, b) => a.serial - b.serial); serial = frame.revision;
    return changed;
  } };
}
