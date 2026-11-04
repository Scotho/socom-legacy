/**
 * Incremental local search over walkable collision samples (`TEST_ROOM_ZOMBIES_ADAPTATION`).
 * Phoenix chase navigation, not the original's navigation.
 */
import { probeGround, selectFloor, segmentHit, type Grid } from '@s2u/scene';

export type NavPoint = [number, number, number];
export type NavStep = (from: NavPoint, x: number, z: number) => NavPoint | null;

/** A body-width step that stays on the floor. Null when the corridor is blocked or the step is too steep. */
export function collisionStep(grid: Grid): NavStep {
  return (from, x, z) => {
    const dx = x - from[0], dz = z - from[2], distance = Math.hypot(dx, dz), steps = Math.max(1, Math.ceil(distance / 4));
    const sideX = distance ? -dz / distance * 3.5 : 3.5, sideZ = distance ? dx / distance * 3.5 : 0;
    let prev: NavPoint = from;
    for (let i = 1; i <= steps; i++) {
      const px = from[0] + dx * i / steps, pz = from[2] + dz * i / steps;
      const floor = selectFloor(probeGround(grid, px, pz), prev[1] + 5, prev[1]);
      if (!floor || floor.normal[1] < Math.cos(50 * Math.PI / 180) || floor.y - prev[1] > 6 || prev[1] - floor.y > 8) return null;
      const next: NavPoint = [px, floor.y, pz];
      for (const side of [-1, 0, 1]) for (const height of [7, 17]) {
        if (segmentHit(grid, [prev[0] + sideX * side, prev[1] + height, prev[2] + sideZ * side], [px + sideX * side, floor.y + height, pz + sideZ * side])) return null;
      }
      if (segmentHit(grid, [px, floor.y + 1, pz], [px, floor.y + 20, pz])) return null;
      prev = next;
    }
    return prev;
  };
}

interface Node { p: NavPoint; g: number; f: number; parent: Node | null; key: string }

export class RouteSearch {
  private open: Node[] = [];
  private best = new Map<string, number>();
  path: NavPoint[] | null = null;
  done = false;
  expanded = 0;

  constructor(private start: NavPoint, private goal: NavPoint, private step: NavStep, private blocked: readonly NavPoint[] = [], private cell = 16) {
    const n = { p: start, g: 0, f: this.distance(start), parent: null, key: '0,0,0' };
    this.open.push(n);
    this.best.set(n.key, 0);
  }

  private distance(p: NavPoint): number {
    return Math.hypot(p[0] - this.goal[0], p[2] - this.goal[2]) + Math.abs(p[1] - this.goal[1]);
  }

  advance(limit = 24): void {
    for (let count = 0; count < limit && !this.done; count++) {
      if (!this.open.length || this.expanded >= 12000) { this.done = true; break; }
      let at = 0;
      for (let i = 1; i < this.open.length; i++) if (this.open[i]!.f < this.open[at]!.f) at = i;
      const node = this.open.splice(at, 1)[0]!;
      if (node.g !== this.best.get(node.key)) continue;
      this.expanded++;
      if (this.distance(node.p) < this.cell * 1.5) {
        const end = this.step(node.p, this.goal[0], this.goal[2]);
        if (end && Math.abs(end[1] - this.goal[1]) < 4) {
          const path: NavPoint[] = [end];
          for (let n: Node | null = node; n?.parent; n = n.parent) path.push(n.p);
          this.path = path.reverse();
          this.done = true;
          break;
        }
      }
      for (const pair of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
        const ix = pair[0], iz = pair[1];
        const x = node.p[0] + ix * this.cell, z = node.p[2] + iz * this.cell;
        if (Math.hypot(x - this.start[0], z - this.start[2]) > 1800 || this.blocked.some((p) => Math.hypot(x - p[0], z - p[2]) < this.cell * .7 && Math.abs(p[1] - node.p[1]) < 10)) continue;
        const p = this.step(node.p, x, z);
        if (!p) continue;
        const key = `${Math.round((x - this.start[0]) / this.cell)},${Math.round((z - this.start[2]) / this.cell)},${Math.round(p[1] / 4)}`;
        const g = node.g + Math.hypot(x - node.p[0], z - node.p[2]) + Math.abs(p[1] - node.p[1]);
        if (g >= (this.best.get(key) ?? Infinity)) continue;
        this.best.set(key, g);
        this.open.push({ p, g, f: g + this.distance(p), parent: node, key });
      }
    }
  }
}

export class EnemyNavigator {
  private step: NavStep;
  private search: RouteSearch | null = null;
  private path: NavPoint[] = [];
  private goal: NavPoint | null = null;
  private retry = 0;
  private stuck = 0;
  private last: NavPoint | null = null;
  private shortcut = 0;
  private fine = false;
  private recover: NavPoint | null = null;
  private recoveryTime = 0;
  private recoveries = 0;

  constructor(grid: Grid, step?: NavStep) { this.step = step ?? collisionStep(grid); }

  seed(path: NavPoint[], goal: NavPoint): void {
    this.path = path.map((p) => [...p]);
    this.goal = [...goal];
    this.search = null;
    this.retry = 0;
  }

  /** A traffic wait is not a wall. */
  wait(from: NavPoint): void { this.last = [...from]; this.stuck = 0; }

  obstacleNeeded(): boolean { return this.stuck > .5 || (!this.path.length && !this.search && this.fine); }

  steer(from: NavPoint, goal: NavPoint, dt: number, yielding = false, workBudgetMs = 1): NavPoint | null {
    this.retry -= dt;
    this.shortcut -= dt;
    const canWork = workBudgetMs > 0;
    if (yielding) { this.last = [...from]; this.stuck = 0; return null; }
    if (!this.recover && this.last && this.path.length) {
      this.stuck = Math.hypot(from[0] - this.last[0], from[1] - this.last[1], from[2] - this.last[2]) < dt * 2 ? this.stuck + dt : 0;
    }
    this.last = [...from];
    if (this.recover) {
      this.recoveryTime -= dt;
      if (this.recoveryTime > 0 && Math.hypot(from[0] - this.recover[0], from[2] - this.recover[2]) > 2) return this.recover;
      this.recover = null;
    }
    if (this.stuck > 1 && canWork) {
      const heading = this.path[0] ?? goal;
      this.path = [];
      this.search = null;
      this.retry = 0;
      this.stuck = 0;
      this.fine = true;
      this.recoveries++;
      const dx = heading[0] - from[0], dz = heading[2] - from[2], d = Math.hypot(dx, dz) || 1, side = this.recoveries % 2 ? 1 : -1;
      for (const pair of [[-dz / d * side, dx / d * side], [dz / d * side, -dx / d * side], [-dx / d, -dz / d]] as const) {
        const p = this.step(from, from[0] + pair[0] * 8, from[2] + pair[1] * 8);
        if (p) { this.recover = p; this.recoveryTime = .8; return p; }
      }
    }
    const goalMoved = !this.goal || Math.hypot(goal[0] - this.goal[0], goal[2] - this.goal[2]) > 24 || Math.abs(goal[1] - this.goal[1]) > 6;
    if (goalMoved && this.search) { this.search = null; this.retry = 0; }
    if (canWork && this.retry <= 0 && !this.search && (!this.path.length || goalMoved)) {
      const direct = this.step(from, goal[0], goal[2]);
      if (direct && Math.abs(direct[1] - goal[1]) < 4) { this.path = [direct]; this.goal = [...goal]; this.retry = .35; }
      else { this.search = new RouteSearch([...from], [...goal], this.step, [], this.fine ? 4 : 8); this.goal = [...goal]; }
    }
    if (this.search && canWork) {
      const until = performance.now() + workBudgetMs;
      do { this.search.advance(1); } while (!this.search.done && performance.now() < until);
      if (this.search.done) {
        this.path = this.search.path ?? [];
        this.search = null;
        this.retry = this.path.length ? .5 : this.fine ? 1 : 0;
        if (!this.path.length) this.fine = true;
      }
    }
    if (goalMoved && !this.search) this.retry = 0;
    while (this.path.length && Math.hypot(from[0] - this.path[0]![0], from[2] - this.path[0]![2]) < 2.5 && Math.abs(from[1] - this.path[0]![1]) < 4) this.path.shift();
    if (canWork && this.shortcut <= 0) {
      this.shortcut = .2;
      for (let i = Math.min(5, this.path.length - 1); i > 0; i--) {
        const p = this.path[i]!;
        const end = this.step(from, p[0], p[2]);
        if (end && Math.abs(end[1] - p[1]) < 4) { this.path.splice(0, i); break; }
      }
    }
    return this.path[0] ?? null;
  }

  stats(): { waypoints: number; searching: boolean; expanded: number; blocked: number; fine: boolean; recoveries: number } {
    return { waypoints: this.path.length, searching: !!this.search, expanded: this.search?.expanded ?? 0, blocked: 0, fine: this.fine, recoveries: this.recoveries };
  }
}
