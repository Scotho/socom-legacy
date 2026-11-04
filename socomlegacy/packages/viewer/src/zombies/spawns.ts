/**
 * Covered spawn points with a route back (`TEST_ROOM_ZOMBIES_ADAPTATION`). Phoenix's placement, not a reading.
 */
import { segmentHit, type Grid } from '@s2u/scene';
import { collisionStep, type NavPoint, type NavStep } from './navigation';

/** Full-body cover from every listed eye (the player's eyes, and the camera when one is given). */
export function spawnCovered(grid: Grid, point: NavPoint, eyes: readonly NavPoint[]): boolean {
  return eyes.every((eye) => {
    const dx = point[0] - eye[0], dz = point[2] - eye[2], d = Math.hypot(dx, dz) || 1, sx = -dz / d * 5, sz = dx / d * 5;
    return [2, 11, 22].every((h) => [-1, 0, 1].every((side) => !!segmentHit(grid, eye, [point[0] + sx * side, point[1] + h, point[2] + sz * side])));
  });
}

interface Sample { point: NavPoint; parent: number }

/** An incremental flood of reachable ground. Every spawn keeps a route back to the origin. */
export class ZombieSpawnMap {
  private nodes: Sample[];
  private cursor = 0;
  private seen = new Set<string>();
  private step: NavStep;
  private used: NavPoint[] = [];
  private pointCache: NavPoint[] = [];

  constructor(private grid: Grid, readonly origin: NavPoint, step?: NavStep) {
    this.step = step ?? collisionStep(grid);
    this.nodes = [{ point: [...origin], parent: -1 }];
    this.seen.add(this.key(origin));
  }

  private key(p: NavPoint): string {
    return `${Math.round((p[0] - this.origin[0]) / 6)},${Math.round((p[2] - this.origin[2]) / 6)},${Math.round(p[1] / 4)}`;
  }

  advance(budgetMs = 2): void {
    const until = performance.now() + budgetMs;
    do {
      if (this.cursor >= this.nodes.length || this.nodes.length >= 40000) return;
      const index = this.cursor++, from = this.nodes[index]!.point;
      let needsDetail = false;
      for (const pair of [[24, 0], [-24, 0], [0, 24], [0, -24], [12, 0], [-12, 0], [0, 12], [0, -12], [6, 0], [-6, 0], [0, 6], [0, -6]] as const) {
        const dx = pair[0], dz = pair[1];
        if (Math.abs(dx) + Math.abs(dz) < 24 && !needsDetail) continue;
        const x = from[0] + dx, z = from[2] + dz;
        if (Math.hypot(x - this.origin[0], z - this.origin[2]) > 1700) continue;
        if (this.seen.has(this.key([x, from[1], z]))) continue;
        const point = this.step(from, x, z);
        if (!point) { needsDetail = true; continue; }
        const back = this.step(point, from[0], from[2]);
        if (!back || Math.abs(back[1] - from[1]) > 4) { needsDetail = true; continue; }
        const key = this.key(point);
        if (this.seen.has(key)) continue;
        this.seen.add(key);
        this.nodes.push({ point, parent: index });
      }
    } while (performance.now() < until);
  }

  choose(player: NavPoint, occupied: readonly NavPoint[], random = Math.random, camera?: NavPoint, separation = 100): { point: NavPoint; path: NavPoint[] } | null {
    const candidates: number[] = [];
    for (let i = 0; i < this.nodes.length; i++) {
      const p = this.nodes[i]!.point, distance = Math.hypot(p[0] - player[0], p[2] - player[2]);
      if (distance < 300 || distance > 1300) continue;
      candidates.push(i);
    }
    for (let attempt = 0; attempt < Math.min(160, candidates.length); attempt++) {
      const slot = attempt + Math.floor(random() * (candidates.length - attempt));
      const swap = candidates[slot]!;
      candidates[slot] = candidates[attempt]!;
      candidates[attempt] = swap;
      const index = candidates[attempt]!, point = this.nodes[index]!.point;
      const usedRadius = separation === 100 ? 160 : separation;
      if (occupied.some((o) => Math.abs(o[1] - point[1]) < 12 && (o[0] - point[0]) ** 2 + (o[2] - point[2]) ** 2 < separation ** 2) || this.used.some((o) => (o[0] - point[0]) ** 2 + (o[2] - point[2]) ** 2 < usedRadius ** 2)) continue;
      const eyes: NavPoint[] = [[player[0], player[1] + 17, player[2]]];
      if (camera) eyes.push(camera);
      if (!spawnCovered(this.grid, point, eyes)) continue;
      const path: NavPoint[] = [];
      for (let n = this.nodes[index]!.parent; n >= 0; n = this.nodes[n]!.parent) path.push([...this.nodes[n]!.point]);
      this.used.push(point);
      this.used = this.used.slice(-4);
      return { point: [...point], path };
    }
    return null;
  }

  points(): NavPoint[] {
    if (this.pointCache.length !== this.nodes.length) this.pointCache = this.nodes.map((n) => n.point);
    return this.pointCache;
  }

  stats(): { samples: number; explored: number; complete: boolean } {
    return { samples: this.nodes.length, explored: this.cursor, complete: this.cursor >= this.nodes.length || this.nodes.length >= 40000 };
  }
}
