import { Quaternion, Vector3 } from 'three';

/**
 * FORGE (FG-47, FG.R24: "multi-select"; an adaptation with no original -- the game has no editor): the selection of
 * several, kept pure so it is tested without a page. Its membership (each member once, in the order picked), the
 * group's centre (the members' mean place), a move of every member by one offset, a turn of the whole group about its
 * centre, and the box's pick over the members' screen-projected places.
 *
 * The markers rule, as the single selection's (`./page` `select`): a spawn or an NPC marker turns about y only, so a
 * group with a marker in it turns about y only -- a tilt asked of it is reduced to its turn about y (the twist).
 */

export type Vec3 = readonly [number, number, number];
/** A rotation as three.js keeps it: x, y, z, w. */
export type Quat = readonly [number, number, number, number];
/** A member's place and turn; a marker's turn is about y only. */
export interface Pose {
  p: Vec3;
  q: Quat;
  marker: boolean;
}

/** The members, each once (by `keyOf`, the member itself unless given), in the order they were picked. */
export class Selection<T> {
  private list: T[] = [];
  constructor(private readonly keyOf: (t: T) => unknown = (t) => t) {}

  get size(): number { return this.list.length; }
  get items(): readonly T[] { return this.list; }
  private at(t: T): number { const k = this.keyOf(t); return this.list.findIndex((m) => this.keyOf(m) === k); }
  has(t: T): boolean { return this.at(t) >= 0; }
  /** Added; false if it was in already. */
  add(t: T): boolean { if (this.has(t)) return false; this.list.push(t); return true; }
  /** Taken out; false if it was not in. */
  remove(t: T): boolean { const i = this.at(t); if (i < 0) return false; this.list.splice(i, 1); return true; }
  /** In if it was out, out if it was in: whether it is in now. */
  toggle(t: T): boolean { if (this.remove(t)) return false; this.list.push(t); return true; }
  clear(): void { this.list = []; }
  /** That one alone (a plain click), or none. */
  only(t: T | null): void { this.list = t === null ? [] : [t]; }
  addAll(ts: Iterable<T>): void { for (const t of ts) this.add(t); }
}

/** The members' mean place; null for none. */
export function centreOf(points: readonly Vec3[]): Vec3 | null {
  if (points.length === 0) return null;
  let x = 0, y = 0, z = 0;
  for (const p of points) { x += p[0]; y += p[1]; z += p[2]; }
  const n = points.length;
  return [x / n, y / n, z / n];
}

/** Every member moved by the same offset, its turn kept. */
export function moved(poses: readonly Pose[], offset: Vec3): Pose[] {
  return poses.map((m) => ({ ...m, p: [m.p[0] + offset[0], m.p[1] + offset[1], m.p[2] + offset[2]] }));
}

/** Whether the group turns about y only: a marker is in it. */
export function yOnly(poses: readonly Pose[]): boolean {
  return poses.some((m) => m.marker);
}

/** A turn of `angle` radians about +y. */
export function yawQuat(angle: number): Quat {
  return [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)];
}

/** A rotation's turn about y (its twist about the vertical): the angle, in radians. */
export function yawOf(q: Quat): number {
  const [, y, , w] = q;
  if (Math.abs(y) < 1e-12 && Math.abs(w) < 1e-12) return 0;   // a half turn about a level axis: no twist
  return 2 * Math.atan2(y, w);
}

const tq = (q: Quat): Quaternion => new Quaternion(q[0], q[1], q[2], q[3]);
const fromQ = (q: Quaternion): Quat => [q.x, q.y, q.z, q.w];

/**
 * The group turned by `q` about `centre`: each place swung round the centre, each member's turn preceded by `q`. With
 * a marker in the group the turn is `q`'s twist about y alone; a marker's own turn stays about y alone.
 */
export function turnedAbout(poses: readonly Pose[], centre: Vec3, q: Quat): Pose[] {
  const turn = yOnly(poses) ? tq(yawQuat(yawOf(q))) : tq(q).normalize();
  const c = new Vector3(...centre);
  return poses.map((m) => {
    const p = new Vector3(...m.p).sub(c).applyQuaternion(turn).add(c);
    const after = turn.clone().multiply(tq(m.q)).normalize();
    return { ...m, p: [p.x, p.y, p.z], q: m.marker ? yawQuat(yawOf(fromQ(after))) : fromQ(after) };
  });
}

/**
 * The box's pick: the indices of the places (in normalized device coordinates, as `Vector3.project` gives them) inside
 * the rectangle of corners `a` and `b`, either first; a place behind the eye or past the far plane (z outside -1..1)
 * is out.
 */
export function inRect(ndc: readonly Vec3[], a: readonly [number, number], b: readonly [number, number]): number[] {
  const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]);
  const y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
  const out: number[] = [];
  ndc.forEach(([x, y, z], i) => { if (x >= x0 && x <= x1 && y >= y0 && y <= y1 && z >= -1 && z <= 1) out.push(i); });
  return out;
}
