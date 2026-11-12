import { describe, expect, it } from 'vitest';
import { under } from '../src/mapMeta';
import { indexNodePaths } from '../src/nodePathIndex';

describe('immutable world-node membership lookup (browser performance adaptation)', () => {
  it('matches the former scan, including nested placements, duplicates and sibling boundaries', () => {
    const paths = ['', '/', '=', 'world', 'world/door', 'world/door=1', 'world/door=1/leaf',
      'world/door=10', 'world/doorway', 'world/door/leaf', 'world/door', '/root/part',
      'world//child', 'world/item=one=two', '世界/扉=2'];
    const nodes = paths.map((path, id) => ({ path, id }));
    const index = indexNodePaths(nodes);
    const queries = new Set(['absent', 'world/d', 'world/door=2', 'WORLD', '世界/扉']);
    // Every prefix is relevant: a raw string prefix must not admit a sibling.
    for (const path of paths) for (let n = 0; n <= path.length; n++) queries.add(path.slice(0, n));
    for (const path of queries) expect(index.get(path) ?? []).toEqual(nodes.filter(n => under(n.path, path)));
    expect(index.get('world/door')?.map(n => n.id)).toEqual([4, 5, 6, 7, 9, 10]);
  });

  it('keeps object identities and original order without retaining arbitrary query misses', () => {
    const a = { path: 'a/b', opacity: 1 }, b = { path: 'a/b=2', opacity: 1 };
    const index = indexNodePaths([a, b, a]);
    const size = index.size;
    for (let i = 0; i < 10000; i++) expect(index.get(`unknown/${i}`)).toBeUndefined();
    expect(index.size).toBe(size);
    a.opacity = 0.25;
    expect(index.get('a')).toEqual([a, b, a]);
    expect(index.get('a')?.[0]).toBe(a);
    index.clear();
    expect(index.size).toBe(0);
  });
});
