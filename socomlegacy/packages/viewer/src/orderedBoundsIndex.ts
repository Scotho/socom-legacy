/** A pure broad-phase acceleration: inclusive X/Z bounds, preserving the original narrow-phase order. */
interface Bounds { minX: number; minZ: number; maxX: number; maxZ: number }
interface Entry<T> extends Bounds { value: T; order: number }
interface Node<T> extends Bounds { entries?: Entry<T>[]; left?: Node<T>; right?: Node<T> }
// An index implementation choice, not a geometry tolerance or a game rule.
const LEAF_SIZE = 8;

function build<T>(entries: Entry<T>[]): Node<T> {
  const node: Node<T> = { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity };
  for (const e of entries) {
    node.minX = Math.min(node.minX, e.minX); node.minZ = Math.min(node.minZ, e.minZ);
    node.maxX = Math.max(node.maxX, e.maxX); node.maxZ = Math.max(node.maxZ, e.maxZ);
  }
  if (entries.length <= LEAF_SIZE) node.entries = entries;
  else {
    const x = node.maxX - node.minX >= node.maxZ - node.minZ;
    entries.sort((a, b) => x ? (a.minX + a.maxX) - (b.minX + b.maxX) : (a.minZ + a.maxZ) - (b.minZ + b.maxZ));
    const middle = entries.length >>> 1;
    node.left = build(entries.slice(0, middle)); node.right = build(entries.slice(middle));
  }
  return node;
}

/** Immutable geometry only. Replace this index when its source geometry or activation revision changes. */
export class OrderedBoundsIndex<T extends Bounds> {
  private readonly root: Node<T>;
  constructor(values: readonly T[]) {
    this.root = build(values.map((value, order) => ({ value, order,
      minX: value.minX, minZ: value.minZ, maxX: value.maxX, maxZ: value.maxZ })));
  }

  query(minX: number, minZ: number, maxX: number, maxZ: number): T[] {
    return this.queryAfter(minX, minZ, maxX, maxZ, -1).map(e => e.value);
  }

  queryAfter(minX: number, minZ: number, maxX: number, maxZ: number, after: number): { value: T; order: number }[] {
    const found: Entry<T>[] = [];
    const overlaps = (n: Bounds): boolean => maxX >= n.minX && minX <= n.maxX && maxZ >= n.minZ && minZ <= n.maxZ;
    const visit = (node: Node<T>): void => {
      if (!overlaps(node)) return;
      if (node.entries) { for (const e of node.entries) if (e.order > after && overlaps(e)) found.push(e); }
      else { visit(node.left!); visit(node.right!); }
    };
    visit(this.root);
    found.sort((a, b) => a.order - b.order);
    return found;
  }
}
