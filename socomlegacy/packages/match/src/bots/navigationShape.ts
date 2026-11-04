/**
 * The bot navigation graph's file shape (FBA.R5; LATER 389), with no import: the match's `validateBotNavigation` and the
 * host supervisor's held check (`host/src/navigation.ts` `heldGraph`) read a graph file by the same rule, so a file one
 * refuses the other never holds (dot's narrow re-check of c65614822: `{"version":2,"nodes":[null]}` was held). A file
 * is untrusted input: finite points, complete bounded adjacency, no two nodes at one point.
 */

export type Point = [number, number, number];

/** Generated from the user's own map, stored only under ignored public/maps/nav. Bump when route validation changes. */
export interface NavigationData {
  version: 2; map: string; nodes: { at: Point; edges: number[]; component?: number }[];
  spawnable?: { start: string[]; respawn: string[] };
}

/** `value` as the graph of the map `stem`, copied, or null when its shape is not one. */
export function navigationShape(value: unknown, stem: string): NavigationData | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<NavigationData>;
  if (v.version !== 2 || v.map !== stem || !Array.isArray(v.nodes) || v.nodes.length > 100_000) return null;
  const unique = new Set<string>();
  for (const n of v.nodes) {
    if (!n || !Array.isArray(n.at) || n.at.length !== 3 || !n.at.every(Number.isFinite)
      || !Array.isArray(n.edges) || n.edges.length > 128
      || !n.edges.every((id) => Number.isInteger(id) && id >= 0 && id < v.nodes!.length)
      || (n.component !== undefined && (!Number.isInteger(n.component) || n.component < 0))) return null;
    const key = n.at.map((x) => Math.round(x * 2)).join(',');
    if (unique.has(key)) return null;
    unique.add(key);
  }
  return { version: 2, map: stem, nodes: v.nodes.map((n) => ({ at: [...n.at] as Point, edges: [...n.edges], component: n.component })) };
}
