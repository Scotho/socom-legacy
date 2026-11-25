/**
 * The Forge's quick hide (the owner, 2026-11-24: "the same quick hide/isolate objects, same shortcuts as" the reference
 * editor's -- H hides the selection, Shift+H everything but it, U shows everything again -- "these should be editor
 * only(temp)"; a browser adaptation, the game has no editor). What it hides leaves the editor's view and its picks for
 * now: never written into the layout, its saves, the geometry's file, the agent's revision, or a match. A new base clears
 * it.
 *
 * Each kind of object is hidden by the name the editor already selects it by:
 * - a placement of the layout's: its object (the page's `editorHidden`, which hides its subtree with it)
 * - a map prop of the base's: its placement key (`./hide` `placementKey`; drawn off through `WorldView.setPlacementActive`)
 * - a map data item (a spawn slot, a hostage, a zone, a door...): its billboard's key (`./mapDataBillboards`)
 * - a geometry object: its id, in the geometry editor's own set (`./geometry/editor` `quickHidden`)
 */

/** The quick hide's sets of the base's own objects, by their keys (the placements' and the geometry's are kept beside them). */
export class QuickHideKeys {
  /** The map props hidden, by placement key. */
  readonly props = new Set<string>();
  /** The map data items hidden, by billboard key. */
  readonly data = new Set<string>();
  /**
   * The map's detail no row or click selects -- its facade props (a lamp's glow, a star: cards turned to the camera) and
   * its line strips (ropes, wires: merged by texture, owned by no one object) -- hidden whole, by an isolate, which hides
   * everything but the selection, and none of these can be selected.
   */
  facades = false;

  get size(): number { return this.props.size + this.data.size + (this.facades ? 1 : 0); }
  clear(): void { this.props.clear(); this.data.clear(); this.facades = false; }
}

/** `keys` added to `into`; how many were not in it. */
export function addAll<T>(into: Set<T>, keys: Iterable<T>): number {
  let n = 0;
  for (const k of keys) if (!into.has(k)) { into.add(k); n++; }
  return n;
}

/** Every one of `all` that is not in `keep` (isolate: what Hide unselected hides). */
export function others<T>(all: Iterable<T>, keep: Iterable<T>): T[] {
  const kept = new Set(keep);
  return [...all].filter((t) => !kept.has(t));
}

/** How many of each kind the quick hide has out of the view. */
export interface QuickHideCounts { placements: number; props: number; data: number; geometry: number }

export const quickHiddenTotal = (c: QuickHideCounts): number => c.placements + c.props + c.data + c.geometry;

/**
 * The viewport's line while anything is quick-hidden (the owner: "some small text in the viewport indicates that
 * something is hidden so that the user is aware"): how many, by kind, and the key that shows them again. Null with none.
 */
export function quickHideNotice(c: QuickHideCounts, unhideKey: string): string | null {
  const total = quickHiddenTotal(c);
  if (!total) return null;
  const parts: string[] = [];
  const part = (n: number, one: string, many: string): void => { if (n) parts.push(`${n} ${n === 1 ? one : many}`); };
  part(c.placements, 'placement', 'placements');
  part(c.props, 'map prop', 'map props');
  part(c.data, 'map item', 'map items');
  part(c.geometry, 'geometry object', 'geometry objects');
  const what = parts.length === 1 ? parts[0]! : `${total} objects (${parts.join(', ')})`;
  return `${what} hidden${unhideKey ? ` · ${unhideKey} to unhide all` : ''}`;
}
