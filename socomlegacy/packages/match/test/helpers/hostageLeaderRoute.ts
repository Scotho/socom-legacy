import type { AiLoc } from '@s2u/scene';

export interface LeaderRouteMap {
  traversable(cell: AiLoc): boolean;
  canTravel(from: AiLoc, to: AiLoc): boolean;
}

/**
 * Test-only leader itinerary; never supplied to the production follower's planner. The original
 * planner legitimately refuses a whole-map request at its closed-list capacity. A scripted human
 * leader need not ask that planner for its itinerary: this bounded A* uses navigable neighboring
 * cells, then the fixture replays it through the real Walker. The follower still plans its own
 * short leader-trail legs with the unchanged original capacities and collision behavior.
 * Cross-submap fallback is deliberately refused; the original planner owns those links.
 */
export function planFixtureLeaderRoute(map: LeaderRouteMap, start: AiLoc, goal: AiLoc, maxNodes: number): AiLoc[] | null {
  if (!Number.isSafeInteger(maxNodes) || maxNodes <= 0 || start.map !== goal.map
    || !map.traversable(start) || !map.traversable(goal)) return null;
  type Node = { cell: AiLoc; cost: number; score: number; parent: Node | null; order: number };
  const key = (p: AiLoc) => `${p.x}:${p.z}`;
  const distance = (p: AiLoc) => Math.max(Math.abs(p.x - goal.x), Math.abs(p.z - goal.z));
  const first: Node = { cell: { ...start }, cost: 0, score: distance(start), parent: null, order: 0 };
  const open: Node[] = [], best = new Map<string, number>([[key(start), 0]]);
  let order = 0, expanded = 0;
  const before = (a: Node, b: Node) => a.score < b.score || (a.score === b.score && a.order < b.order);
  const push = (node: Node) => {
    open.push(node);
    for (let i = open.length - 1; i > 0;) {
      const parent = (i - 1) >> 1;
      if (!before(open[i]!, open[parent]!)) break;
      [open[i], open[parent]] = [open[parent]!, open[i]!]; i = parent;
    }
  };
  const pop = (): Node => {
    const result = open[0]!, tail = open.pop()!;
    if (open.length) {
      open[0] = tail;
      for (let i = 0; ;) {
        const left = i * 2 + 1, right = left + 1;
        let next = i;
        if (left < open.length && before(open[left]!, open[next]!)) next = left;
        if (right < open.length && before(open[right]!, open[next]!)) next = right;
        if (next === i) break;
        [open[i], open[next]] = [open[next]!, open[i]!]; i = next;
      }
    }
    return result;
  };
  push(first);
  while (open.length && expanded++ < maxNodes) {
    const node = pop();
    if (best.get(key(node.cell)) !== node.cost) continue;
    if (distance(node.cell) === 0) {
      const cells: AiLoc[] = [];
      for (let n: Node | null = node; n; n = n.parent) cells.push(n.cell);
      cells.reverse();
      const route = [cells[0]!];
      for (let i = 1; i < cells.length - 1; i++) {
        if (!map.canTravel(route.at(-1)!, cells[i + 1]!)) route.push(cells[i]!);
      }
      if (cells.length > 1) route.push(cells.at(-1)!);
      return route;
    }
    for (const [dx, dz] of [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]]) {
      const cell = { map: start.map, x: node.cell.x + dx!, z: node.cell.z + dz! }, cost = node.cost + 1;
      const old = best.get(key(cell));
      if ((old !== undefined && old <= cost) || !map.traversable(cell) || !map.canTravel(node.cell, cell)) continue;
      if (old === undefined && best.size >= maxNodes) return null;
      best.set(key(cell), cost);
      push({ cell, cost, score: cost + distance(cell), parent: node, order: ++order });
    }
  }
  return null;
}
