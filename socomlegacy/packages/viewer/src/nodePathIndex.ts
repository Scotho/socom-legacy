/**
 * Browser performance adaptation: precompute `mapMeta.under(node.path, root)`
 * membership for a list whose paths and membership are fixed after construction.
 * The buckets retain input order, duplicate entries and the objects themselves.
 * Only exact paths and their '/' or '=' ancestors are keys, so arbitrary misses
 * retain nothing. This changes lookup work, not the updates applied to each node.
 */
export function indexNodePaths<T extends { path: string }>(nodes: readonly T[]): Map<string, T[]> {
  const index = new Map<string, T[]>();
  const append = (path: string, node: T): void => {
    const bucket = index.get(path);
    if (bucket) bucket.push(node);
    else index.set(path, [node]);
  };
  for (const node of nodes) {
    for (let i = 0; i < node.path.length; i++) {
      const char = node.path[i];
      if (char === '/' || char === '=') append(node.path.slice(0, i), node);
    }
    append(node.path, node);
  }
  return index;
}
