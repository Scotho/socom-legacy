import { HostageObstacles } from './hostageObstacles';
import { aiCellCentre, aiCellIndex, aiCellOf, aiCellY, type AiLoc, type AiMaps, type AiMarker } from '@s2u/scene';

/** HF-PATH, research 333: FUN_00510ff0 D:L382570, BASIC FUN_00513080 D:L383455.
 * Search storage is private: never write A* state into shared disc cells. Points leave this API start-first.
 */
export interface HostagePathPoint extends AiLoc { link: boolean; action: boolean; width: number }
export interface HostagePath { points: HostagePathPoint[]; cost: number }
export interface HostageProbeCell {
  loc: AiLoc; word: number; previousWord: number | null;
  distance: number; fraction: number; direction: readonly [number, number, number]; height: number | null;
}
export interface HostagePathOptions {
  /** FUN_00524760 corridor gate, enabled by follower app flag 8. */
  corridor?: (loc: AiLoc) => boolean;
  /** Ordinary actor cell occupancy: base 2.5, not dynamic footprint cost50 (research 335). */
  occupied?: (loc: AiLoc) => boolean;
  /** Registered object mask membership; cost50 only when the cell is also occupied. */
  dynamicFootprint?: (loc: AiLoc) => boolean;
  /** Per-room bit32 override, including original clears; never changes authored data. */
  cellWord?: (loc: AiLoc, authored: number) => number;
  /** Newest-first recorded trail, used with corridor for ExtendPath's fallback. */
  trail?: readonly (AiLoc & { width: number })[];
}

/** Original capacities FUN_005128f0 D:L383238; sampling FUN_00537e50 D:L403319. */
export const HOSTAGE_PATH_LIMITS_READING = { open: 1024, closed: 24576, lineStep: 0.2 } as const;
/** Research 333 §4. The planner queue (FUN_00510570 D:L382029-382086) serves its head request first, in request order
 * (FUN_005109d0 D:L382265-382288, the follower's priority 0, FUN_00528340 D:L394040); a search keeps its lists across
 * frames when the frame's budget ends (code 5, FUN_00510ff0 D:L382786); a leg still searching at its 200th slice fails
 * (D:L382611, D:L382674-382685), the count restarting with each leg (FUN_005273c0 D:L393427-393436). */
export const HOSTAGE_PATH_SLICE_READING = { slices: 200 } as const;
/** The queue's budget each game frame, shared by every queued request: an EXPANSION COUNT standing in for the original's
 * EE time -- 33 RCNT0 H-blanks of the frame's 525 (`DAT_0064f8d8`, D:L382041-382045, D:L382642-382644), for which no count
 * can be read -- so that the room stays deterministic. Research 200 §1.6: one PCSX2 capture, 964 pops in 7 slices
 * (138-161 a slice). Settles: an RDRAM/PINE trace of CAiPath+0x68 and +0x54 over several routes on MP6/10/11/71. */
export const HOSTAGE_PATH_SLICE_BUDGET_PLACEHOLDER = { expansions: 138 } as const;

/** A queued request's answer. `cancelled` only by its owner (FUN_005107b0, a re-request). */
export type HostagePathState = 'pending' | 'done' | 'failed' | 'cancelled';
export interface HostagePathTicket { readonly state: HostagePathState; readonly path: HostagePath | null; cancel(): void }


/** FUN_0052dc70 D:L397313/397385/397400; spawn_pcsx2.rdram DAT_0064f958/960 (research 335 §2). */
export const HOSTAGE_LOCATION_READING = { layeredBit: 1 << 21, tolerance: 0.5, below: -10 } as const;

/** FUN_005483d0 D:L413925-413938; captured DAT_0064fd18/20 (research 335 §4). */
export const HOSTAGE_AI_COLLISION_READING = { radius: 5, cap: 5 } as const;

const DIR = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]] as const;
/** FUN_00519130 D:L386475, captured DAT_0065ab38; endpoint scale DAT_0065b030 (research 333 §5). */
const DIAGONAL_AXIS = 0.7071067690849304;
const key = (v: AiLoc): string => `${v.map}:${v.x}:${v.z}`;
const same = (a: AiLoc, b: AiLoc): boolean => a.map === b.map && a.x === b.x && a.z === b.z;
const manhattan = (a: AiLoc, b: AiLoc): number => Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
const signed16 = (n: number): number => (n << 16) >> 16;
const bits = new DataView(new ArrayBuffer(4));

/** EE positive finite arithmetic rounds each operation toward zero, not IEEE nearest (research 200 §1.3). */
function ee(n: number): number {
  const f = Math.fround(n);
  if (f <= n || n === 0) return f;
  bits.setFloat32(0, f); bits.setUint32(0, bits.getUint32(0) - 1);
  return bits.getFloat32(0);
}

function baseCost(from: number, to: number, diagonal: boolean, uphill: boolean, dynamic = false): number {
  const fs = from & 31, ts = to & 31;
  if ((fs === 11 || ts === 11) && uphill) return 10;
  if (fs !== 11 && ts !== 11) {
    if (dynamic) return 50;
    if (ts === 13) return 25;
  }
  const c = fs === 11 || ts === 11 ? 1 : ts === 6 || (to & 32) !== 0 ? 2.5 : 1;
  return diagonal ? ee(Math.fround(1.3) * c) : c;
}

/** Integer BASIC edge cost, FUN_00512930/FUN_00513080 D:L383248/383455; bias 1 at SetPathType. */
export function basicStepCost(from: number, to: number, diagonal: boolean, uphill: boolean, dynamic = false): number {
  let c = baseCost(from, to, diagonal, uphill, dynamic);
  const soil = to & 31;
  if (soil !== 3) c = ee(c + ((from & 31) === 3 ? 2 : 1) * (soil === 2 || soil === 6 ? 5 : 1.5));
  return Math.trunc(ee(c * 10));
}

interface Node { loc: AiLoc; g: number; h: number; parent: Node | null; closed: boolean }
interface LinkGraph { nodes: AiLoc[]; edges: { a: number; b: number; weight: number }[] }
type LegResult = { points: AiLoc[]; cost: number };
/** One leg's A*, held between slices: the planner object of FUN_00510e40 with its lists (private, never on map cells). */
interface LegSearch {
  start: AiLoc; goal: AiLoc; basic: boolean; options: HostagePathOptions;
  open: OpenHeap; nodes: Map<string, Node>; removed: number; ticks: number;
  status: 'pending' | 'done' | 'failed'; result: LegResult | null;
}

class PathRequest implements HostagePathTicket {
  state: HostagePathState = 'pending';
  path: HostagePath | null = null;
  search: LegSearch | null = null;
  readonly results: LegResult[] = [];
  /** Legs are planned last first: +0x2c = legcount-1 (D:L382298), decremented per leg (D:L393431). */
  at: number;
  constructor(readonly stops: readonly AiLoc[], readonly legs: readonly number[], readonly options: HostagePathOptions,
    private readonly drop: (r: PathRequest) => void) { this.at = legs.length - 1; }
  cancel(): void {
    if (this.state !== 'pending') return;
    this.state = 'cancelled'; this.search = null; this.drop(this);
  }
}

/** MSL heap: strict sift-up, right child on equal keys, <= stop (FUN_005132b0/00515270). */
class OpenHeap {
  readonly entries: Node[] = [];
  private score(n: Node): number { return n.g + n.h; }
  push(n: Node): void { this.entries.push(n); this.up(this.entries.length - 1); }
  decrease(n: Node): void { this.up(this.entries.indexOf(n)); }
  private up(at: number): void {
    while (at > 0) {
      const parent = (at - 1) >> 1;
      if (this.score(this.entries[at]!) >= this.score(this.entries[parent]!)) break;
      [this.entries[at], this.entries[parent]] = [this.entries[parent]!, this.entries[at]!]; at = parent;
    }
  }
  pop(): Node {
    const first = this.entries[0]!, last = this.entries.pop()!;
    if (!this.entries.length) return first;
    this.entries[0] = last;
    let i = 0;
    while (i * 2 + 1 < this.entries.length) {
      let child = i * 2 + 1;
      if (child + 1 < this.entries.length && this.score(this.entries[child]!) >= this.score(this.entries[child + 1]!)) child++;
      if (this.score(this.entries[i]!) <= this.score(this.entries[child]!)) break;
      [this.entries[i], this.entries[child]] = [this.entries[child]!, this.entries[i]!]; i = child;
    }
    return first;
  }
}

/**
 * FUN_0052dc70 D:L397225-397428: stored-cell location, not a traversability query -- the cell a body's `+0xe4` takes and,
 * when traversable, `+0xe8` (`FUN_005b7ba0` D:L471278-471318). Its x / z are the located sub-map's own indices ((x - the
 * sub-map's min) x its scale, D:L397251-397252) with the sub-map in bits 0-5 (D:L397264). The first map's bit 21 enables stacked-map
 * height selection. No preferred-map tie override in the original. Pure: the planner's `locate` and the hostage order's
 * cell (viewer `net/hostageOrder` `orderCellOf`) both take it.
 */
export function locateAiCell(ai: AiMaps, feet: readonly [number, number, number]): AiLoc | null {
  let best: AiLoc | null = null, delta = 0, walkable = false, stacked = false;
  for (const sub of ai.maps) {
    const loc = aiCellOf(sub, feet[0], feet[2]);
    if (!loc) continue;
    const index = aiCellIndex(sub, loc.x, loc.z), w = index < 0 ? null : sub.cells[index] ?? null;
    if (w === null) continue;
    if (sub.index === 0) stacked = (w & HOSTAGE_LOCATION_READING.layeredBit) !== 0;
    const soil = w & 31;
    if (stacked && soil === 10) continue;
    const d = feet[1] - aiCellY(sub, w), valid = ![0, 8, 9, 10].includes(soil);
    if (best === null) {
      best = loc; delta = d; walkable = valid;
      if (!stacked || (valid && Math.abs(d) <= HOSTAGE_LOCATION_READING.tolerance)) return best;
    } else if (d > HOSTAGE_LOCATION_READING.below && Math.abs(d) <= Math.abs(delta) + (valid && !walkable ? HOSTAGE_LOCATION_READING.tolerance : 0)) {
      best = loc; delta = d; walkable = valid;
    }
  }
  return best;
}

export class HostagePathPlanner {
  private readonly graph: LinkGraph;
  private readonly queue: PathRequest[] = [];
  /** The expansions the last `slice` spent (the stall bar's instrument). */
  lastSliceExpansions = 0;
  /**
   * `budget`: the queue's expansions a game frame (`HOSTAGE_PATH_SLICE_BUDGET_PLACEHOLDER`), the room's authority calling
   * `slice` once a frame; null answers every request at once, as the original's immediate planning does
   * (FUN_00510390 D:L381967-381989) -- for a caller that owns no frame loop.
   */
  constructor(readonly ai: AiMaps, private readonly runtime = new HostageObstacles(), readonly budget: number | null = null) {
    // CreateGraph FUN_0052a8c0 (D:L395320) runs at map setup through the unbudgeted FUN_00510390 (D:L395416), not in a request.
    this.graph = this.buildGraph();
  }

  word(loc: AiLoc): number | null {
    const sub = this.ai.maps[loc.map];
    if (!sub) return null;
    const index = aiCellIndex(sub, loc.x, loc.z);
    return index < 0 ? null : sub.cells[index] ?? null;
  }
  traversable(loc: AiLoc): boolean {
    const w = this.word(loc);
    return w !== null && ![0, 8, 9, 10].includes(w & 31);
  }
  /** FUN_00537e50 D:L403379-403635, probe caller D:L430346. Callback owns all obstacle policy. */
  routeProbeCells(from: AiLoc, to: AiLoc, visit: (sample: HostageProbeCell) => boolean): boolean {
    if (from.map !== to.map || this.word(to) === null) return false;
    return this.probeCells(from, to, visit);
  }
  /** FUN_00537400 D:L403005–403307: arbitrary world endpoint, same changed-cell sampling. */
  worldProbeCells(from: AiLoc, to: readonly [number, number, number], visit: (sample: HostageProbeCell) => boolean): boolean {
    return this.probeCells(from, to, visit);
  }
  private probeCells(from: AiLoc, to: AiLoc | readonly [number, number, number], visit: (sample: HostageProbeCell) => boolean): boolean {
    const sub = this.ai.maps[from.map];
    if (!sub || this.word(from) === null) return false;
    const f = (n: number): number => n < 0 ? -ee(-n) : ee(n);
    const endpoint = (loc: AiLoc): [number, number, number] => {
      const a = this.action(loc), d = a && a.offset !== 8 ? DIR[a.offset] : undefined;
      const axis = a && (a.offset & 1) ? DIAGONAL_AXIS : 1;
      return [f(f(f(sub.min[0] + f(sub.cellSize[0] * 0.5)) + f(loc.x * sub.cellSize[0])) + (d ? f(f(d[0] * axis) * 0.75) : 0)),
        aiCellY(sub, this.word(loc)!),
        f(f(f(sub.min[2] + f(sub.cellSize[1] * 0.5)) + f(loc.z * sub.cellSize[1])) + (d ? f(f(d[1] * axis) * 0.75) : 0))];
    };
    const a = endpoint(from), b = !Array.isArray(to) ? endpoint(to as AiLoc) : to as readonly [number, number, number], dx = f(b[0] - a[0]), dz = f(b[2] - a[2]);
    const length = f(Math.sqrt(f(f(dx * dx) + f(dz * dz)))), inverse = length ? f(1 / length) : 1;
    const direction = [f(dx * inverse), f(b[1] - a[1]), f(dz * inverse)] as const;
    const step = length ? f(1 / f(length / f(Math.fround(0.2) * sub.cellSize[0]))) : Infinity;
    let previous: AiLoc | null = null, previousWord: number | null = null;
    const sample = (t: number, final: boolean): boolean => {
      const x = f(f(b[0] * t) + f(a[0] * f(1 - t))), z = f(f(b[2] * t) + f(a[2] * f(1 - t)));
      const loc = { map: from.map, x: Math.trunc(f(f(x - sub.min[0]) * f(1 / sub.cellSize[0]))), z: Math.trunc(f(f(z - sub.min[2]) * f(1 / sub.cellSize[1]))) };
      if (x < sub.min[0] || x > sub.max[0] || z < sub.min[2] || z > sub.max[2]) return final;
      const authored = this.word(loc);
      if (authored === null) return final;
      if (previous && previous.x === loc.x && previous.z === loc.z) return true;
      const word = this.runtime.word(loc, authored);
      const result = visit({ loc, word, previousWord, distance: f(t * length), fraction: t, direction, height: aiCellY(sub, authored) });
      previous = loc; previousWord = word;
      return result;
    };
    for (let t = 0; t < 1; t = f(t + step)) if (!sample(t, false)) return false;
    return sample(1, true);
  }
  /** FUN_00524170/00524660 D:L391986–392145: first two-leg-valid perpendicular cell. */
  yieldRoute(route: HostagePathPoint[], from: AiLoc, feet: readonly [number, number, number], other: AiLoc): boolean {
    if (!route.length) return false;
    if (manhattan(route[0]!, other) === 0) route.shift();
    const head = route[0];
    if (!head || head.map !== from.map) return false;
    const dx = head.x - from.x, dz = head.z - from.z, length = Math.hypot(dx, dz);
    const x = length ? dx / length : 0, z = length ? dz / length : 0;
    // FUN_00518ae0/00518b60 D:L386202–386308, strict improvement and first tie.
    const first = z <= 0 ? 6 : 2;
    let selected = first, score = 1;
    for (let i = first; i < first + 5; i++) {
      const n = i & 7, d = DIR[n]!, axis = n & 1 ? DIAGONAL_AXIS : 1;
      const candidate = 1 - (x * d[0] * axis + z * d[1] * axis);
      if (candidate < score) { selected = n; score = candidate; }
    }
    const d = DIR[selected]!, axis = selected & 1 ? DIAGONAL_AXIS : 1;
    for (const sign of [1, -1]) {
      let found: AiLoc | null = null;
      this.worldProbeCells(from, [feet[0] - d[1] * axis * 30 * sign, feet[1], feet[2] + d[0] * axis * 30 * sign], sample => {
        if (manhattan(sample.loc, from) === 0) return true;
        if (this.canTravel(from, sample.loc) && this.canTravel(sample.loc, head)) { found = sample.loc; return false; }
        return sample.distance < 30;
      });
      if (found) { route.unshift(...this.flag([found])); return true; }
    }
    return false;
  }
  /** FUN_00535730 D:L402127-402203; recovery caller's limit DAT_00651000 = 10.
   * Missing storage retains the last endpoint; nonzero submap index forces the limit distance.
   */
  recoveryRays(raw: AiLoc): { cell: AiLoc; distance: number; height: number | null }[] | null {
    const sub = this.ai.maps[raw.map];
    if (!sub) return null;
    return DIR.map(([dx, dz]) => {
      let cell = { ...raw }, distance = 0;
      if (!this.traversable(raw)) {
        for (let step = 0; step < 10; step++) {
          const next = { map: raw.map, x: cell.x + dx, z: cell.z + dz };
          if (this.word(next) === null) {
            if (raw.map !== 0) distance = 10;
            break;
          }
          cell = next;
          distance++;
          if (this.traversable(cell)) break;
        }
      }
      const word = this.word(cell);
      return { cell, distance, height: word === null ? null : aiCellY(sub, word) };
    });
  }
  /** FUN_005396c0 D:L403994-404092, called with 5 by AddSnakePoint D:L392473.
   * The source's asymmetric perimeter and return of 6 after five clear rings are intentional.
   */
  width(loc: AiLoc, flags = 0): number {
    if (flags & 8) return 0;
    const sub = this.ai.maps[loc.map];
    if (!sub) return 0;
    for (let r = 1; r <= 5; r++) {
      const x0 = loc.x - r, x1 = loc.x + r, z0 = loc.z - r, z1 = loc.z + r;
      if (x0 < 0 || z0 < 0 || x1 >= sub.cellsX || z1 >= sub.cellsZ) return r;
      for (let x = x0; x < x1; x++) if (!this.traversable({ map: loc.map, x, z: z0 }) || !this.traversable({ map: loc.map, x, z: z1 })) return r;
      for (let z = z0 + 1; z < z1 - 1; z++) if (!this.traversable({ map: loc.map, x: x0, z }) || !this.traversable({ map: loc.map, x: x1, z })) return r;
    }
    return 6;
  }
  point(loc: AiLoc): [number, number, number] {
    const sub = this.ai.maps[loc.map], w = this.word(loc);
    if (!sub || w === null) throw new Error('AI route point has no stored cell');
    const [x, z] = aiCellCentre(sub, loc.x, loc.z);
    return [x, aiCellY(sub, w), z];
  }
  /** FUN_00556370 D:L420719-420720 and FUN_00556ee0: mark the command-direction neighbor, then contact.
   * Direction selection is FUN_00518b60 D:L386241-386308: hemisphere scan, strict improvement, first tie.
   */
  markObstacle(raw: AiLoc, direction: readonly [number, number], contact: AiLoc): void {
    if (this.word(raw) !== null) {
      const first = direction[1] <= 0 ? 6 : 2;
      let selected = first, score = 1;
      for (let i = first; i < first + 5; i++) {
        const n = i & 7, d = DIR[n]!, axis = n & 1 ? DIAGONAL_AXIS : 1;
        const candidate = 1 - (direction[0] * d[0] * axis + direction[1] * d[1] * axis);
        if (candidate < score) { score = candidate; selected = n; }
      }
      const d = DIR[selected]!, neighbor = { ...raw, x: raw.x + d[0], z: raw.z + d[1] };
      if (this.traversable(neighbor)) this.runtime.markCollision(neighbor, this.word(neighbor)!);
    }
    const word = this.word(contact);
    if (word !== null) this.runtime.markCollision(contact, word);
  }
  /** FUN_005169b0 D:L385139-385260: two cardinal neighbors in the proposed point's quadrant.
   * This is the original AI-map correction, separate from physical hull collision. Missing cells are ignored.
   */
  correctMotion(loc: AiLoc, proposed: readonly [number, number, number]): [number, number, number] {
    return this.correctMotionWithContact(loc, proposed).feet;
  }
  /** The first contributing blocked cell is the source's output param7, D:L385246-385248. */
  correctMotionWithContact(loc: AiLoc, proposed: readonly [number, number, number]): { feet: [number, number, number]; obstacle: AiLoc | null } {
    const word = this.word(loc), sub = this.ai.maps[loc.map];
    if (word === null || !sub || (word & 256)) return { feet: [...proposed], obstacle: null };
    const end = this.endpoint(loc);
    const dx = proposed[0] - (sub.min[0] + end[0] * sub.cellSize[0]);
    const dz = proposed[2] - (sub.min[2] + end[1] * sub.cellSize[1]);
    const first = dx > 0 ? (dz < 0 ? 0 : 2) : (dz < 0 ? 6 : 4);
    let x = 0, z = 0;
    let obstacle: AiLoc | null = null;
    for (let i = 0; i < 4; i += 2) {
      const direction = DIR[(first + i) & 7]!;
      const neighbor = this.word({ ...loc, x: loc.x + direction[0], z: loc.z + direction[1] });
      if (neighbor === null || ![0, 8, 9, 10].includes(neighbor & 31)) continue;
      const dot = dx * direction[0] + dz * direction[1];
      const correction = sub.cellSize[0] * 0.5 - (dot + HOSTAGE_AI_COLLISION_READING.radius);
      if (dot > 0 && correction < 0) {
        x += direction[0] * correction; z += direction[1] * correction;
        obstacle ??= { ...loc, x: loc.x + direction[0], z: loc.z + direction[1] };
      }
    }
    const length = Math.hypot(x, z), scale = length > HOSTAGE_AI_COLLISION_READING.cap ? HOSTAGE_AI_COLLISION_READING.cap / length : 1;
    return { feet: [proposed[0] + x * scale, proposed[1], proposed[2] + z * scale], obstacle };
  }
  /** FUN_0052dc70 D:L397225-397428: stored-cell location, not a traversability query (`locateAiCell`). */
  locate(feet: readonly [number, number, number], _preferredMap?: number): AiLoc | null {
    return locateAiCell(this.ai, feet);
  }
  private marker(loc: AiLoc): AiMarker | undefined {
    return this.ai.maps[loc.map]?.markers.find((v) => same(v.loc, loc));
  }
  private action(loc: AiLoc): { type: number; invalid: boolean; direction: number; offset: number } | null {
    if (!((this.word(loc) ?? 0) & 128)) return null;
    const m = this.marker(loc);
    if (!m) return null;
    return { type: (m.word >>> 23) & 31, invalid: ((m.flags ?? 0) & 16) !== 0, direction: m.word & 15, offset: (m.flags ?? 8) & 15 };
  }
  private directions(loc: AiLoc): number[] {
    const a = this.action(loc);
    if (!a || a.direction === 8) return [0, 1, 2, 3, 4, 5, 6, 7];
    const d = a.direction;
    if (a.type === 6 && !a.invalid) return [d];
    if (a.type === 1 || a.type === 4) return [d, (d + 4) & 7];
    return [d, d + 4, d + 1, d - 1, d + 5, d + 3, d + 2, d - 2].map((v) => v & 7);
  }

  /** FUN_005390b0's callback 0x539580: walkable and no uphill onto steep; occupancy/collision are allowed. */
  canTravel(from: AiLoc, to: AiLoc, options: HostagePathOptions = {}): boolean {
    return this.lineTravel(from, to, options, false, true);
  }
  private lineTravel(from: AiLoc, to: AiLoc, options: HostagePathOptions, basic: boolean, travel = false): boolean {
    if (from.map !== to.map) return false;
    const a = this.endpoint(from), b = this.endpoint(to);
    const distance = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const step = distance ? HOSTAGE_PATH_LIMITS_READING.lineStep / distance : 1;
    const steps = Math.ceil(1 / step);
    let previous: AiLoc | null = null;
    const startRoad = ((this.word(from) ?? 0) & 31) === 3, endRoad = ((this.word(to) ?? 0) & 31) === 3;
    for (let i = 0; i <= steps; i++) {
      const t = Math.min(1, i * step);
      const px = a[0] + (b[0] - a[0]) * t, pz = a[1] + (b[1] - a[1]) * t;
      if (px < 0 || pz < 0) return false;
      const at = { map: from.map, x: Math.trunc(px), z: Math.trunc(pz) };
      if (previous && same(previous, at)) continue;
      const authored = this.word(at);
      const w = authored === null ? null : options.cellWord?.(at, authored) ?? authored;
      if (!this.traversable(at) || w === null) return false;
      if (!travel && ((w & 31) === 13 || (w & 32) !== 0 || options.occupied?.(at))) return false;
      if (!travel && options.corridor && !options.corridor(at)) return false;
      if (previous && (w & 31) === 11 && this.point(at)[1] > this.point(previous)[1]) return false;
      if (i > 0 && basic) {
        const road = (w & 31) === 3;
        if (startRoad && endRoad ? !road : road && !(endRoad && same(at, to))) return false;
      }
      previous = at;
    }
    return true;
  }
  private endpoint(loc: AiLoc): [number, number] {
    const a = this.action(loc), d = a && a.offset !== 8 ? DIR[a.offset] : undefined;
    const sub = this.ai.maps[loc.map]!;
    const scale = a && (a.offset & 1) ? DIAGONAL_AXIS : 1;
    return [loc.x + 0.5 + (d ? d[0] * scale * 0.75 / sub.cellSize[0] : 0), loc.z + 0.5 + (d ? d[1] * scale * 0.75 / sub.cellSize[1] : 0)];
  }
  private gated(loc: AiLoc, middle: boolean): boolean {
    const a = this.action(loc);
    return a ? a.type === 1 || a.type === 4 || (middle && a.type === 7) : ((this.word(loc) ?? 0) & 31) === 6;
  }
  private smooth(points: AiLoc[], options: HostagePathOptions, basic = true): AiLoc[] {
    if (points.length <= 3) return points;
    const keep = [points[0]!]; let anchor = points[0]!;
    for (let i = 1; i < points.length - 1; i++) {
      const mid = points[i]!, next = points[i + 1]!;
      if (this.gated(anchor, false) || this.gated(mid, true) || this.gated(next, false) || !this.lineTravel(anchor, next, options, basic)) {
        keep.push(mid); anchor = mid;
      }
    }
    keep.push(points.at(-1)!); return keep;
  }

  private leg(start: AiLoc, goal: AiLoc, basic = true, options: HostagePathOptions = {}): LegResult | null {
    const search = this.begin(start, goal, basic, options);
    this.advance(search, Infinity);
    return search.status === 'done' ? search.result : null;
  }
  private begin(start: AiLoc, goal: AiLoc, basic: boolean, options: HostagePathOptions): LegSearch {
    const search: LegSearch = { start, goal, basic, options, open: new OpenHeap(), nodes: new Map(), removed: 0, ticks: 0, status: 'pending', result: null };
    if (start.map !== goal.map || !this.traversable(start) || !this.traversable(goal)) { search.status = 'failed'; return search; }
    // The start's direction stays 8: it may be pushed once more (FUN_00510ff0 D:L382748).
    search.open.push({ loc: start, g: 0, h: signed16(10 * manhattan(start, goal)), parent: null, closed: false });
    return search;
  }
  /**
   * One slice of FUN_00510ff0 (D:L382565-382860): the slice is counted on entry (D:L382611); the budget is tested before
   * each pop (D:L382642-382644), and a search out of it keeps its lists for the next frame (code 5, D:L382786). Returns
   * the expansions (pops) spent.
   */
  private advance(search: LegSearch, budget: number): number {
    if (search.status !== 'pending') return 0;
    search.ticks++;
    const { start, goal, basic, options, open, nodes } = search;
    let used = 0;
    const fail = (): number => { search.status = 'failed'; return used; };
    while (open.entries.length) {
      if (used >= budget) return used;
      const n = open.pop(); n.closed = true; used++;
      if (++search.removed > HOSTAGE_PATH_LIMITS_READING.closed) return fail();
      if (same(n.loc, goal)) {
        const points: AiLoc[] = [];
        for (let p: Node | null = n; p; p = p.parent) { points.push(p.loc); if (same(p.loc, start)) break; }
        points.reverse();
        const smoothed = this.smooth(points, options, basic);
        search.result = { points: basic ? this.smooth(smoothed, options) : smoothed, cost: n.g };
        search.status = 'done';
        return used;
      }
      // D:L382674-382685: after the goal test, a leg still searching at its 200th slice fails (code 2).
      if (search.ticks >= HOSTAGE_PATH_SLICE_READING.slices) return fail();
      for (const dir of this.directions(n.loc)) {
        const d = DIR[dir]; if (!d) continue;
        const loc = { map: start.map, x: n.loc.x + d[0], z: n.loc.z + d[1] };
        if (!this.traversable(loc)) continue;
        const action = this.action(loc);
        if (action && (action.type === 1 || action.type === 4) && action.direction !== 8 && dir !== action.direction && ((dir + 4) & 7) !== action.direction) continue;
        const from = this.word(n.loc)!, authored = this.word(loc)!;
        const to = (options.cellWord?.(loc, authored) ?? authored) | (options.occupied?.(loc) ? 32 : 0), uphill = this.point(loc)[1] > this.point(n.loc)[1];
        const c = basic ? basicStepCost(from, to, (dir & 1) !== 0, uphill, (to & 32) !== 0 && options.dynamicFootprint?.(loc))
          : Math.trunc(ee(baseCost(from, to, (dir & 1) !== 0, uphill) * 10));
        const g = signed16(n.g + c), old = nodes.get(key(loc));
        if (old) {
          if (!old.closed && g < old.g) { old.g = g; old.parent = n; open.decrease(old); }
        } else {
          if (open.entries.length >= HOSTAGE_PATH_LIMITS_READING.open) return fail();
          const next = { loc, g, h: signed16(10 * manhattan(loc, goal)), parent: n, closed: false };
          nodes.set(key(loc), next); open.push(next);
        }
      }
    }
    return fail();
  }

  private withRuntime(options: HostagePathOptions): HostagePathOptions {
    return { cellWord: this.runtime?.word, dynamicFootprint: this.runtime?.dynamicFootprint, ...options };
  }
  /** RegisterPathPlan FUN_0052c5c0: every endpoint traversable (D:L396392-396419), the link graph across submaps
   * (D:L396501), synchronously; null is a refused registration. Returns the stops, start first. */
  private register(points: readonly AiLoc[]): AiLoc[] | null {
    if (points.length < 2 || points.some(p => !this.traversable(p))) return null;
    const stops: AiLoc[] = [points[0]!];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]!, b = points[i + 1]!;
      if (a.map === b.map) { stops.push(b); continue; }
      const route = this.linkRoute(a, b);
      if (!route) return null;
      stops.push(...route.slice(1));
    }
    return stops;
  }
  private assemble(stops: readonly AiLoc[], results: readonly LegResult[]): HostagePath {
    const points: AiLoc[] = []; let cost = 0;
    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i]!, b = stops[i + 1]!;
      if (a.map !== b.map) { if (!points.length) points.push(a); points.push(b); continue; }
      const leg = results[i]!;
      cost += leg.cost; points.push(...(points.length ? leg.points.slice(1) : leg.points));
    }
    return { cost, points: this.flag(points) };
  }
  private legsOf(stops: readonly AiLoc[]): number[] {
    return stops.slice(0, -1).flatMap((a, i) => a.map === stops[i + 1]!.map ? [i] : []);
  }

  /** The immediate plan (FUN_00510390): the same search with no budget. */
  plan(start: AiLoc, goal: AiLoc, options: HostagePathOptions = {}): HostagePath | null {
    options = this.withRuntime(options);
    const stops = this.register([start, goal]);
    if (!stops) return null;
    const results: LegResult[] = [];
    for (const i of this.legsOf(stops).reverse()) {
      const leg = this.leg(stops[i]!, stops[i + 1]!, true, options);
      if (!leg) return null;
      results[i] = leg;
    }
    return this.assemble(stops, results);
  }
  /**
   * A request through the queue (FUN_005623b0 / FUN_0052c5c0 then FUN_005109d0's commit): `points` start first, each
   * consecutive pair a leg. Null when registration refuses; otherwise a ticket answered by `slice` over later frames --
   * at once when the planner has no budget.
   */
  request(points: readonly AiLoc[], options: HostagePathOptions = {}): HostagePathTicket | null {
    options = this.withRuntime(options);
    const stops = this.register(points);
    if (!stops) return null;
    const request = new PathRequest(stops, this.legsOf(stops), options, r => this.unqueue(r));
    if (!request.legs.length) { request.path = this.assemble(stops, []); request.state = 'done'; return request; }
    this.queue.push(request);
    if (this.budget === null) this.serve(Infinity);
    return request;
  }
  /** The planner task, once a game frame (FUN_00510570, "ai_route_planner", D:L50931): the head request first while the
   * frame's budget lasts (D:L382045-382048), the next one in the same frame once it is answered (D:L382077-382081). */
  slice(): number {
    return this.lastSliceExpansions = this.serve(this.budget ?? Infinity);
  }
  /** Drops every queued request (a round reset rebuilds the followers). */
  cancelAll(): void {
    for (const r of [...this.queue]) r.cancel();
  }
  private serve(budget: number): number {
    let used = 0;
    while (this.queue.length && used < budget) {
      const r = this.queue[0]!, leg = r.legs[r.at]!;
      r.search ??= this.begin(r.stops[leg]!, r.stops[leg + 1]!, true, r.options);
      used += this.advance(r.search, budget - used);
      const search = r.search;
      if (search.status === 'pending') break;
      r.search = null;
      // plan_complete FUN_005273c0 (D:L393419-393440): a failed leg ends the request; a done one queues the next leg,
      // the last one finalises -- in the same pass (D:L382077-382081).
      if (search.status === 'failed') { r.state = 'failed'; this.queue.shift(); continue; }
      r.results[leg] = search.result!;
      if (--r.at < 0) { r.path = this.assemble(r.stops, r.results); r.state = 'done'; this.queue.shift(); }
    }
    return used;
  }
  private unqueue(r: PathRequest): void {
    const at = this.queue.indexOf(r);
    if (at >= 0) this.queue.splice(at, 1);
  }
  private flag(points: readonly AiLoc[]): HostagePathPoint[] {
    return points.map((p, i) => ({ ...p, width: 0,
      link: (i > 0 && points[i - 1]!.map !== p.map) || (i + 1 < points.length && points[i + 1]!.map !== p.map),
      action: i + 1 < points.length && ((this.word(points[i + 1]!) ?? 0) & 128) !== 0,
    }));
  }
  /** FUN_0052bdf0 D:L395986-396162: extend a COMPLETE remaining route, then re-leg and force smooth. */
  extend(points: readonly AiLoc[], from: AiLoc, goal: AiLoc, options: HostagePathOptions = {}): HostagePathPoint[] | null {
    options = this.withRuntime(options);
    const end = points.at(-1);
    // The original's end equality compares x/z without map (D:L396045-396049).
    if (end && end.x === goal.x && end.z === goal.z) return this.flag(points);
    if (points.length < 2 && this.canTravel(from, goal)) return this.flag([goal]);
    if (!end) return null;
    const result = [...points];
    if (this.canTravel(end, goal)) result.push(goal);
    else {
      const trail = options.trail;
      if (!options.corridor || !trail) return null;
      // FUN_00524760 D:L392155: scan newest-first, first same-map point whose width contains the cell.
      const match = (v: AiLoc): number => trail.findIndex(p => p.map === v.map && manhattan(p, v) <= p.width);
      const a = match(end), b = match(goal);
      if (a < 0 || b < 0) return null;
      const direction = a < b ? 1 : -1;
      for (let i = a; i !== b; i += direction) {
        const at = trail[i]!;
        if (!same(result.at(-1)!, at)) result.push(at);
      }
      if (!same(result.at(-1)!, goal)) result.push(goal);
    }
    const smoothed: AiLoc[] = [];
    for (let start = 0; start < result.length;) {
      let end = start + 1;
      while (end < result.length && result[end]!.map === result[start]!.map) end++;
      smoothed.push(...this.smooth(result.slice(start, end), options)); start = end;
    }
    return this.flag(smoothed);
  }

  /** FUN_0052a8c0 D:L395320, FUN_0052c5c0 D:L396440: DEFAULT-length link graph; Manhattan temporary endpoints. */
  private buildGraph(): LinkGraph {
    const links = this.ai.maps.flatMap((m) => m.links), nodes: AiLoc[] = [];
    const ids = new Map<string, number>();
    const add = (v: AiLoc): number => { const old = ids.get(key(v)); if (old !== undefined) return old; const id = nodes.length; nodes.push(v); ids.set(key(v), id); return id; };
    for (const l of links) { add(l.from); add(l.to); }
    const count = nodes.length, edges: { a: number; b: number; weight: number }[] = [];
    const seen = new Set<string>();
    for (const l of links) {
      const a = add(l.from), b = add(l.to), pair = [a, b].sort((x, y) => x - y).join(':');
      if (seen.has(pair)) continue; seen.add(pair);
      const dir = l.word & 15, d = DIR[dir];
      if (dir === 8 || !d) { edges.push({ a, b, weight: 0 }, { a: b, b: a, weight: 0 }); }
      else if (this.traversable({ ...l.from, x: l.from.x + d[0], z: l.from.z + d[1] })) edges.push({ a: b, b: a, weight: 0 });
      else edges.push({ a, b, weight: 0 });
    }
    for (let a = 0; a < count; a++) for (let b = 0; b < a; b++) {
      if (nodes[a]!.map !== nodes[b]!.map) continue;
      const path = this.leg(nodes[a]!, nodes[b]!, false); if (!path) continue;
      let weight = 0;
      for (let i = 1; i < path.points.length; i++) weight = ee(weight + ee(Math.hypot(path.points[i]!.x - path.points[i - 1]!.x, path.points[i]!.z - path.points[i - 1]!.z)));
      edges.push({ a, b, weight }, { a: b, b: a, weight });
    }
    return { nodes, edges };
  }
  private linkRoute(start: AiLoc, goal: AiLoc): AiLoc[] | null {
    // The DEFAULT edges are built once with the planner (its constructor); endpoints are per request.
    const nodes = [...this.graph.nodes], edges = [...this.graph.edges], count = nodes.length;
    const s = nodes.length; nodes.push(start); const g = nodes.length; nodes.push(goal);
    for (let i = 0; i < count; i++) {
      if (nodes[i]!.map === start.map) edges.push({ a: s, b: i, weight: manhattan(start, nodes[i]!) });
      if (nodes[i]!.map === goal.map) edges.push({ a: i, b: g, weight: manhattan(goal, nodes[i]!) });
    }
    const dist = nodes.map(() => Infinity), prev = nodes.map(() => -1), closed = new Set<number>(), frontier = [s]; dist[s] = 0;
    while (frontier.length) {
      // FUN_002d1790 D:L173858-173878 picks the first strict minimum in list order.
      let at = 0;
      for (let i = 1; i < frontier.length; i++) if (dist[frontier[i]!]! < dist[frontier[at]!]!) at = i;
      const n = frontier.splice(at, 1)[0]!;
      if (n === g) { const path: AiLoc[] = []; for (let at = g; at >= 0; at = prev[at]!) path.push(nodes[at]!); return path.reverse(); }
      closed.add(n);
      for (const e of edges) {
        if (e.a !== n || closed.has(e.b)) continue;
        const candidate = ee(dist[n]! + e.weight); // float edge*factor (factor1) plus distance, D:L173917
        if (candidate >= dist[e.b]!) continue;
        const discovered = Number.isFinite(dist[e.b]);
        dist[e.b] = candidate; prev[e.b] = n;
        if (!discovered) {
          // New equal values insert BEFORE existing equals (<= D:L173932); decreases stay in place.
          const before = frontier.findIndex(id => candidate <= dist[id]!);
          frontier.splice(before < 0 ? frontier.length : before, 0, e.b);
        }
      }
    }
    return null;
  }
}
