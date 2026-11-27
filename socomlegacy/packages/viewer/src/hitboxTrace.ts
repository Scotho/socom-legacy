import { ORDER_PICK_REACH_READING } from './net/hostageOrder';
import { devMode } from './source';
import { bodyVolumes, rayRecords, type BoneBox, type HitBody, type StanceVolumes } from './net/hitVolumes';

/**
 * HITBOX-TRACE (a development instrument with no original; product track: it reads the bodies' hit volumes and changes
 * nothing the game simulates, draws or plays). The served room and the page disagree about a kneeling hostage's body
 * since LATER 831 (`e2e/hostageOrder.spec.ts`: the page offers FOLLOW! at a pitch the room refuses `not aimed`); this
 * module is what both sides write their bodies with, so the two traces can be joined body for body (`tools/hitboxTrace.ts`):
 *
 * - `traceBoxes`: a `HitBody`'s bone boxes in the world -- each box's world bounds (`centre`, `half`: the axis-aligned
 *   box that holds the posed box) and its raw body-frame box and matrix (`box`, `w`), so a ray can be cast again on it
 *   (`bodyOfTrace`) -- and the body's top edge (`topY`). A placeholder capsule (no skeleton) is written as its bounds,
 *   `bone` -1, with `cap`.
 * - `PageHitboxTrace`: the page's recorder -- a bounded ring of lines (`HITBOX_TRACE_PAGE_LIMIT`), made only under
 *   `?devmode&hitboxtrace` on a development build (`hitboxTraceOn`, `./main`), read and cleared by
 *   `window.__viewer.hitboxTrace()`. Off, nothing of it is made and nothing calls it.
 *
 * The room's recorder is `../../match/src/hitboxTrace.ts`, which writes the same box shape.
 */

/** The URL parameter that turns the page's recorder on, with `?devmode` on a development build. */
export const HITBOX_TRACE_PARAM = 'hitboxtrace';

/** How far the trace's meets look along a line (units): the order pick's reach (`./net/hostageOrder` `ORDER_PICK_REACH_READING`). */
export const HITBOX_TRACE_REACH = ORDER_PICK_REACH_READING;

/** An event's line and its meet on `body` (with the body, for the join's cross margin). */
function lineAndMeet(line: { eye: readonly number[]; dir: readonly number[] } | null, body: HitBody | null): Record<string, unknown> {
  if (!line) return { eye: null, dir: null, meet: null, body: null };
  return {
    eye: line.eye.map(q), dir: line.dir.map((v) => Math.round(v * 1e6) / 1e6),
    meet: body ? rayMeet(line.eye, line.dir, HITBOX_TRACE_REACH, body) : null, body: body ? traceBoxes(body) : null,
  };
}

/** The page's ring: at most this many lines kept, the oldest dropped first (`PageHitboxTrace`). */
export const HITBOX_TRACE_PAGE_LIMIT = 20_000;

type N3 = [number, number, number];

/** One bone box as the trace writes it (world bounds; the raw box and its body-frame matrix for a recast). */
export interface TraceBox {
  bone: number; part: number; centre: N3; half: N3;
  /** The bone-frame box (min x, y, z, max x, y, z) and its 4x4 bone-to-body matrix, column-major; absent for a capsule. */
  box?: number[]; w?: number[];
  /** A placeholder capsule's ends and radius (world). */
  cap?: { a: N3; b: N3; r: number };
}

/** A body as the trace writes it: where it stands, its boxes, its top edge. */
export interface TraceBody { feet: N3; yaw: number; boxes: TraceBox[]; topY: number }

/** Four decimals: a trace's numbers, small enough to read and to store. */
const q = (v: number): number => Math.round(v * 1e4) / 1e4;

/**
 * A body's boxes in the world (`HitBody`: bone boxes in the body frame placed at `feet`, turned by `yaw` as
 * `../play` `actorToWorld`; or world capsules). Allocates; called only with a trace on.
 */
export function traceBoxes(body: HitBody): TraceBody {
  const r = (body.yaw * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  const fx = body.feet[0]!, fy = body.feet[1]!, fz = body.feet[2]!;
  const out: TraceBox[] = [];
  let topY = -Infinity;
  for (const b of body.boxes ?? []) {
    const t = boxWorld(b, c, s, fx, fy, fz);
    out.push(t);
    topY = Math.max(topY, t.centre[1] + t.half[1]);
  }
  for (const cap of body.caps ?? []) {
    const centre: N3 = [q((cap.a[0] + cap.b[0]) / 2), q((cap.a[1] + cap.b[1]) / 2), q((cap.a[2] + cap.b[2]) / 2)];
    const half: N3 = [0, 1, 2].map((k) => q(Math.abs(cap.b[k]! - cap.a[k]!) / 2 + cap.r)) as N3;
    out.push({ bone: -1, part: cap.part, centre, half, cap: { a: [cap.a[0], cap.a[1], cap.a[2]], b: [cap.b[0], cap.b[1], cap.b[2]], r: cap.r } });
    topY = Math.max(topY, centre[1] + half[1]);
  }
  return { feet: [q(fx), q(fy), q(fz)], yaw: q(body.yaw), boxes: out, topY: out.length ? q(topY) : 0 };
}

/** One bone box's world bounds: its eight corners through `w` (bone to body) and the body's placement. */
function boxWorld(b: BoneBox, c: number, s: number, fx: number, fy: number, fz: number): TraceBox {
  const x = b.box, w = b.w;
  const lo: N3 = [Infinity, Infinity, Infinity], hi: N3 = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < 8; k++) {
    const p0 = k & 1 ? x[3]! : x[0]!, p1 = k & 2 ? x[4]! : x[1]!, p2 = k & 4 ? x[5]! : x[2]!;
    const bx = p0 * w[0]! + p1 * w[4]! + p2 * w[8]! + w[12]!;
    const by = p0 * w[1]! + p1 * w[5]! + p2 * w[9]! + w[13]!;
    const bz = p0 * w[2]! + p1 * w[6]! + p2 * w[10]! + w[14]!;
    const v: N3 = [fx + bx * c + bz * s, fy + by, fz - bx * s + bz * c];
    for (let a = 0; a < 3; a++) { if (v[a]! < lo[a]!) lo[a] = v[a]!; if (v[a]! > hi[a]!) hi[a] = v[a]!; }
  }
  return {
    bone: b.bone, part: b.part,
    centre: [q((lo[0] + hi[0]) / 2), q((lo[1] + hi[1]) / 2), q((lo[2] + hi[2]) / 2)],
    half: [q((hi[0] - lo[0]) / 2), q((hi[1] - lo[1]) / 2), q((hi[2] - lo[2]) / 2)],
    box: Array.from(x, (v) => q(v)), w: Array.from(w, (v) => Math.round(v * 1e6) / 1e6),
  };
}

/**
 * A traced body made a `HitBody` again (the raw boxes and matrices, or the capsules), for a recast of a refused order's
 * ray on what each side held (`tools/hitboxTrace.ts`). The numbers are the trace's rounded ones.
 */
export function bodyOfTrace(t: Pick<TraceBody, 'feet' | 'yaw' | 'boxes'>): HitBody {
  const caps = t.boxes.filter((b) => b.cap).map((b) => ({ part: b.part, a: b.cap!.a, b: b.cap!.b, r: b.cap!.r }));
  if (caps.length) return { feet: t.feet, yaw: t.yaw, boxes: null, caps };
  const boxes: BoneBox[] = t.boxes.filter((b) => b.box && b.w).map((b) => ({ part: b.part, bone: b.bone, box: Float32Array.from(b.box!), w: Float64Array.from(b.w!) }));
  return { feet: t.feet, yaw: t.yaw, boxes, caps: null };
}

/**
 * Where a line meets a body (the controller's addition: whether a refusal sits at the body's top edge or its middle): the
 * nearest record the line makes on it (`rayRecords`, as `rayBody` keeps it: the first of the nearest) -- its distance
 * `t`, its bone and part, and the hit point's height above the body's feet (`height`). Null: the line misses the body.
 */
export interface RayMeet { t: number; bone: number; part: number; height: number }

export function rayMeet(eye: readonly number[], dir: readonly number[], reach: number, body: HitBody): RayMeet | null {
  let best: RayMeet | null = null;
  rayRecords(eye, dir, reach, body, (part, t, bone) => { if (!best || t < best.t) best = { t, bone, part, height: 0 }; });
  const m = best as RayMeet | null;
  if (!m) return null;
  return { t: q(m.t), bone: m.bone, part: m.part, height: q(eye[1]! + dir[1]! * m.t - body.feet[1]!) };
}

/**
 * How far the line from `eye` along the unit `dir` (0..`reach`) passes from a body's boxes: 0 when it meets one
 * (`rayMeet`), else the least distance from the line to any box -- each box's distance a convex function of the line's
 * parameter, found by a ternary search (60 halvings) in the box's own frame. Assumes each bone matrix rigid (a rotation and
 * a translation, as the posed and the idle sets are); a capsule's distance is its segment's less its radius.
 */
export function rayMargin(eye: readonly number[], dir: readonly number[], reach: number, body: HitBody): number {
  if (rayMeet(eye, dir, reach, body)) return 0;
  let best = Infinity;
  const r = (body.yaw * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  const f = body.feet;
  for (const b of body.boxes ?? []) {
    const w = b.w, x = b.box;
    const dist = (t: number): number => {
      const px = eye[0]! + dir[0]! * t - f[0]!, py = eye[1]! + dir[1]! * t - f[1]!, pz = eye[2]! + dir[2]! * t - f[2]!;
      // world -> body frame (`actorToWorld` undone), then bone frame by the matrix's transpose (rigid)
      const bx = px * c - pz * s - w[12]!, by = py - w[13]!, bz = px * s + pz * c - w[14]!;
      const lx = bx * w[0]! + by * w[1]! + bz * w[2]!, ly = bx * w[4]! + by * w[5]! + bz * w[6]!, lz = bx * w[8]! + by * w[9]! + bz * w[10]!;
      const dx = Math.max(x[0]! - lx, 0, lx - x[3]!), dy = Math.max(x[1]! - ly, 0, ly - x[4]!), dz = Math.max(x[2]! - lz, 0, lz - x[5]!);
      return Math.hypot(dx, dy, dz);
    };
    best = Math.min(best, ternary(dist, reach));
  }
  for (const cap of body.caps ?? []) {
    const dist = (t: number): number => {
      const p = [eye[0]! + dir[0]! * t, eye[1]! + dir[1]! * t, eye[2]! + dir[2]! * t];
      const ab = [cap.b[0] - cap.a[0], cap.b[1] - cap.a[1], cap.b[2] - cap.a[2]], ll = ab[0]! ** 2 + ab[1]! ** 2 + ab[2]! ** 2;
      const u = ll > 0 ? Math.max(0, Math.min(1, ((p[0]! - cap.a[0]) * ab[0]! + (p[1]! - cap.a[1]) * ab[1]! + (p[2]! - cap.a[2]) * ab[2]!) / ll)) : 0;
      return Math.max(0, Math.hypot(p[0]! - cap.a[0] - ab[0]! * u, p[1]! - cap.a[1] - ab[1]! * u, p[2]! - cap.a[2] - ab[2]! * u) - cap.r);
    };
    best = Math.min(best, ternary(dist, reach));
  }
  return Number.isFinite(best) ? q(best) : best;
}

/** The least of a convex `g` on [0, `hi`]: 60 ternary halvings. */
function ternary(g: (t: number) => number, hi: number): number {
  let lo = 0;
  for (let i = 0; i < 60; i++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
    if (g(m1) <= g(m2)) hi = m2; else lo = m1;
  }
  return g((lo + hi) / 2);
}

/** What `pageTraceBodies` reads of `RemotePlayers` (its private aim reads, called, never written: the page's own cast). */
interface RemoteAimReads {
  remotes: ReadonlyMap<number, {
    id: number; escortee: number | null; view: { group: { visible: boolean } };
    snap: { alive: boolean; feet: readonly number[]; yaw: number; stance: 'stand' | 'crouch' | 'prone'; rootTilt?: readonly number[] | null; peek?: -1 | 0 | 1 } | null;
  }>;
  aimBody(r: unknown): HitBody | null;
  aimVolumes(r: unknown): StanceVolumes | null;
}

/**
 * The page's drawn bodies as its aim casts on them (`RemotePlayers.aimNearest`: `aimBody` -- the drawn pose,
 * `Play.drawnBody` -- else the stance volumes at the snapshot's feet, yaw, posture, tilt and peek, the `bodyVolumes` whose
 * records `bodyNearest` gives), each living body whose group is drawn, as `aimBodies` takes them. A read of the page's
 * own objects through their private members (no change to `remotePlayers.ts`); `state`: a hostage's AI state as the room
 * told it (`ai`), a player's stance.
 */
export function pageTraceBodies(remote: unknown, ai: (id: number) => number | null): PageTraceBody[] {
  const rp = remote as RemoteAimReads;
  const out: PageTraceBody[] = [];
  for (const r of rp.remotes.values()) {
    const s = r.snap;
    if (!s?.alive || !r.view.group.visible) continue;
    const drawn = rp.aimBody.call(remote, r);
    const hostage = typeof r.escortee === 'number';
    out.push({
      id: r.id, hostage, state: hostage ? ai(r.id) : s.stance, posed: drawn !== null,
      body: drawn ?? bodyVolumes(s.feet, s.yaw, s.stance, rp.aimVolumes.call(remote, r), s.rootTilt, s.peek ?? 0),
    });
  }
  return out;
}

/** Whether the page's recorder is on: `?devmode` and `?hitboxtrace` on a development build (OT.R94, as `./source` `devMode`). */
export function hitboxTraceOn(search: string, devBuild: boolean = import.meta.env.DEV): boolean {
  try {
    return devMode(search, devBuild) && new URLSearchParams(search).has(HITBOX_TRACE_PARAM);
  } catch {
    return false;
  }
}

/** A drawn body the page's frame line takes: as `RemotePlayers.traceAimBodies` visits it. */
export interface PageTraceBody { id: number; hostage: boolean; state: string | number | null; posed: boolean; body: HitBody }

/**
 * The page's recorder: a ring of at most `limit` lines -- one per drawn remote body per frame (`frame`), the order's offer
 * when it changes (`offer`), each order sent (`order`) -- returned oldest first and cleared by `take`.
 */
export class PageHitboxTrace {
  private readonly ring: (Record<string, unknown> | undefined)[];
  private head = 0;
  private size = 0;
  private lastOffer = '';
  constructor(readonly limit: number = HITBOX_TRACE_PAGE_LIMIT) { this.ring = new Array(limit); }

  private push(line: Record<string, unknown>): void {
    this.ring[(this.head + this.size) % this.limit] = line;
    if (this.size < this.limit) this.size++;
    else this.head = (this.head + 1) % this.limit;
  }

  /** The lines kept. */
  count(): number { return this.size; }

  /** One drawn frame: each remote body at the page's playout tick (`NetClient.viewTick`), as its aim casts on it. */
  frame(viewTick: number, bodies: Iterable<PageTraceBody>): void {
    for (const b of bodies) {
      const t = traceBoxes(b.body);
      this.push({ side: 'page', viewTick: q(viewTick), id: b.id, kind: b.hostage ? 'hostage' : 'player', state: b.state, posed: b.posed, ...t });
    }
  }

  /**
   * The order the page offers now (`HostagePage.offer`) or why none (`why`): a line when either changes, with the aim's
   * line (`line`, `WalkMode.fireAim`) and where it meets the hostage's drawn body (`body`: `meet`, null a miss) and that body.
   */
  offer(viewTick: number, offer: { hostage: number; cmd: number } | null, why: string | null,
    line: { eye: readonly number[]; dir: readonly number[] } | null, body: HitBody | null): void {
    const key = offer ? `${offer.hostage}:${offer.cmd}` : `-:${why ?? ''}`;
    if (key === this.lastOffer) return;
    this.lastOffer = key;
    this.push({ side: 'page', event: 'offer', viewTick: q(viewTick), hostage: offer?.hostage ?? null, cmd: offer?.cmd ?? null, why, ...lineAndMeet(line, body) });
  }

  /** An order sent (`NetPage.hostageOrder`; not called by `./main`: the room's order line carries the page's line): the page's eye and direction, its playout tick, where the line meets the hostage's drawn body. */
  order(viewTick: number, hostage: number, cmd: number, eye: readonly number[], dir: readonly number[], body: HitBody | null): void {
    this.push({ side: 'page', event: 'order', viewTick: q(viewTick), hostage, cmd, ...lineAndMeet({ eye, dir }, body) });
  }

  /** The lines kept, oldest first; the ring cleared. */
  take(): Record<string, unknown>[] {
    const out: Record<string, unknown>[] = [];
    for (let i = 0; i < this.size; i++) out.push(this.ring[(this.head + i) % this.limit]!);
    this.ring.fill(undefined);
    this.head = 0;
    this.size = 0;
    return out;
  }
}
