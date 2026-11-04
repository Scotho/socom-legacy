/**
 * Crowd spacing for the test-room zombies (`TEST_ROOM_ZOMBIES_ADAPTATION`). Phoenix's traffic, not a reading.
 */
import type { NavPoint, NavStep } from './navigation';

export interface TrafficBody { id: number; position: NavPoint }

const RADIUS2 = 49;

/** The swept step is free, so two walkers cannot reserve the same space this frame. */
export function crowdStepClear(self: TrafficBody, to: NavPoint, others: readonly TrafficBody[]): boolean {
  const a = self.position, dx = to[0] - a[0], dz = to[2] - a[2], length2 = dx * dx + dz * dz;
  if (length2 < 1e-10) return true;
  return others.every((o) => {
    if (o.id === self.id || Math.abs(o.position[1] - a[1]) >= 8 || Math.abs(o.position[1] - to[1]) >= 8) return true;
    const x = o.position[0] - a[0], z = o.position[2] - a[2], start = x * x + z * z;
    if (start < RADIUS2) return x * dx + z * dz <= 0 && (x - dx) ** 2 + (z - dz) ** 2 > start;
    const t = Math.max(0, Math.min(1, (x * dx + z * dz) / length2));
    return (x - t * dx) ** 2 + (z - t * dz) ** 2 >= RADIUS2;
  });
}

/** Queue on the next route segment, not the straight-line distance to the player. */
export function laneBlocked(self: TrafficBody, toward: NavPoint, others: readonly TrafficBody[]): boolean {
  const a = self.position, dx = toward[0] - a[0], dz = toward[2] - a[2], length = Math.hypot(dx, dz);
  if (length < .01) return false;
  const ux = dx / length, uz = dz / length;
  return others.some((o) => {
    if (o.id === self.id || Math.abs(o.position[1] - a[1]) >= 8) return false;
    const x = o.position[0] - a[0], z = o.position[2] - a[2], ahead = x * ux + z * uz, side = Math.abs(x * uz - z * ux);
    return side < 7 && ahead < 11 && (ahead > 1 || (ahead >= -1 && o.id < self.id));
  });
}

/** A waiting zombie may pass only through a swept, unoccupied corridor. */
export class ZombieTraffic {
  private waited = 0;
  private retry = 0;
  private detour: NavPoint | null = null;
  private remaining = 0;
  private attempts = 0;

  constructor(private step: NavStep) {}

  steer(self: TrafficBody, route: NavPoint, others: readonly TrafficBody[], dt: number): NavPoint | null {
    this.retry -= dt;
    const free = (to: NavPoint): boolean => {
      const a = self.position, dx = to[0] - a[0], dz = to[2] - a[2], length2 = dx * dx + dz * dz;
      return !others.some((o) => {
        if (o.id === self.id || Math.abs(o.position[1] - a[1]) >= 8) return false;
        const x = o.position[0] - a[0], z = o.position[2] - a[2];
        const t = Math.max(0, Math.min(1, (x * dx + z * dz) / (length2 || 1)));
        const start = x * x + z * z, end = (o.position[0] - to[0]) ** 2 + (o.position[2] - to[2]) ** 2;
        return start < RADIUS2 ? (x * dx + z * dz > 0 || end <= start) : (x - t * dx) ** 2 + (z - t * dz) ** 2 < RADIUS2;
      });
    };
    if (this.detour) {
      this.remaining -= dt;
      if (this.remaining > 0 && Math.hypot(this.detour[0] - self.position[0], this.detour[2] - self.position[2]) > 2 && free(this.detour) && this.step(self.position, this.detour[0], this.detour[2])) return this.detour;
      this.detour = null;
    }
    if (!laneBlocked(self, route, others)) { this.waited = 0; return route; }
    this.waited += dt;
    if (this.waited < .75 || this.retry > 0) return null;
    this.retry = .5;
    this.attempts++;
    const dx = route[0] - self.position[0], dz = route[2] - self.position[2], length = Math.hypot(dx, dz) || 1;
    const side = (self.id + this.attempts) % 2 ? 1 : -1;
    for (const sign of [side, -side]) {
      const x = self.position[0] - dz / length * sign * 9 + dx / length * 3;
      const z = self.position[2] + dx / length * sign * 9 + dz / length * 3;
      const point = this.step(self.position, x, z);
      if (!point || Math.abs(point[1] - self.position[1]) >= 8 || !free(point)) continue;
      this.detour = point;
      this.remaining = 1;
      return point;
    }
    return null;
  }

  stats(): { waiting: number; detouring: boolean; attempts: number } {
    return { waiting: this.waited, detouring: this.detour !== null, attempts: this.attempts };
  }
}

/** A broad phase. Doorway and side-step rules still decide the step. */
export class TrafficIndex {
  private cells = new Map<string, TrafficBody[]>();
  private bodies = new Map<number, TrafficBody>();

  constructor(bodies: readonly TrafficBody[]) { for (const body of bodies) this.update(body.id, body.position); }

  update(id: number, position: NavPoint): void {
    const previous = this.bodies.get(id), key = this.key(position[0], position[2]);
    if (previous) {
      const oldKey = this.key(previous.position[0], previous.position[2]);
      if (oldKey === key) { previous.position = [...position]; return; }
      const old = this.cells.get(oldKey)!;
      old.splice(old.indexOf(previous), 1);
      if (!old.length) this.cells.delete(oldKey);
    }
    const body = { id, position: [...position] as NavPoint };
    const bucket = this.cells.get(key);
    this.bodies.set(id, body);
    if (bucket) bucket.push(body);
    else this.cells.set(key, [body]);
  }

  private key(x: number, z: number): string { return `${Math.floor(x / 24)},${Math.floor(z / 24)}`; }

  near(point: NavPoint, radius = 24): TrafficBody[] {
    const result: TrafficBody[] = [];
    for (let x = Math.floor((point[0] - radius) / 24); x <= Math.floor((point[0] + radius) / 24); x++) {
      for (let z = Math.floor((point[2] - radius) / 24); z <= Math.floor((point[2] + radius) / 24); z++) {
        for (const b of this.cells.get(`${x},${z}`) ?? []) result.push(b);
      }
    }
    return result;
  }
}
