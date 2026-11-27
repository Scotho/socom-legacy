/**
 * LATER 1170 (X4; research 445; simulation track, reading, pending review): the hostage's danger scan and the flight's
 * cell. Pure: no room, no clock, no random. The original's every AI tick runs a scan outside the AI event mask
 * (`FUN_0056de10` -> `FUN_005cba20` -> `FUN_005cb870`, research 445 s1) over the world objects within 200 u -- a frag, a
 * C4, a satchel -- and its decision (`FUN_005cac00`, s3) pushes 0x1b `CAiSGrenade` (s4, s5), which runs the hostage to a
 * navigation cell away from the object (`FUN_00559580`, s5). The room (`extraction.ts`) feeds the room's live projectiles
 * and steps the flight; this module decides.
 */

import type { AiLoc } from '@s2u/scene';
import { octantOf } from './hostagePath';

type V3 = [number, number, number];

/** The scan's filters and the decision's tests (research 445 s1, s3; the disc ELF's 0x650a18/20/28/30): the object within `range`, its fuse at most `fuse`, the near test `near` u, the visibility above `visible`. */
export const HOSTAGE_DANGER_SCAN_READING = { range: 200, fuse: 16, near: 50, visible: 0.25 } as const;

/** Research 445 s1: ctrl `+0x266` bit 3 is set at every AI init (D:L434744); no MP map's AI group is read naming a hostage. */
export const HOSTAGE_DANGER_SCAN_ENABLED_READING = 'on' as const;

/**
 * The kinds the scan takes (research 445 s2; `FUN_005c5340` D:L479412-479421, `FUN_005bc730` D:L474072-474088): type 1 the
 * frags 0x79 (M67) and 0x7e (HE), type 4 C4 (0x97), type 5 the satchel (0x98). A flashbang, a smoke, a claymore or the PMN
 * is none.
 */
export const HOSTAGE_DANGER_KINDS_READING: Readonly<Record<number, DangerKind>> = { 0x79: 'frag', 0x7e: 'frag', 0x97: 'c4', 0x98: 'satchel' };

/** Research 445 s2: the satchel's fuse is `DAT_00437d44` (a runtime global, unread) unless negative: here it never qualifies. */
export const HOSTAGE_SATCHEL_FUSE_PLACEHOLDER = 'never qualifies' as const;

/**
 * Research 445 s6 (reading, pending review): the net path registers no remote satchel (0x98 to `FUN_005c5340`, types 1-3), and
 * the item-use tick returns at its remote gate before its place path (r0001 `FUN_005c1970` D:L476875, D:L477147-477149;
 * r0004 `FUN_005c8860` D4:L518716, D4:L519150-519151): not in the host's list.
 */
export const HOSTAGE_DANGER_REMOTE_SATCHEL_READING = 'not in the host list' as const;

/**
 * Research 445 s3 (the main controller's ruling, corrected by the re-read's F4): the neighbour list is the members of the
 * world list 0x436330 (`+0xe1` bit 3; `FUN_002a0f70`), no range or perception filter; the room's stand-in: every live seated
 * player and every live hostage. Which paths clear the membership is not all read.
 */
export const HOSTAGE_DANGER_NEIGHBOUR_READING = 'every live seated player and hostage' as const;

/** Research 445 s3 test 4 (way (A), ruled; H478): the room has no local human, so an unseen charge never sends a hostage running. */
export const HOSTAGE_DANGER_REMOTE_PLANTER_READING = 'notice only' as const;

/** Research 445 s3.3: the hostage's side value (`ctrl+0x10c -> +0x58`) is unread; taken as one whose seen bits read back. */
export const HOSTAGE_DANGER_SIDE_PLACEHOLDER = 'seen bits read back' as const;

/** Research 445 s3: the neighbour entry's flag 0x200 (a noticed body): its setter is not found; never set here. */
export const HOSTAGE_NOTICED_FLAG_PLACEHOLDER = 'never set' as const;

/**
 * Research 445 s3: the view cone (`FUN_005c9400`): radius at depth d `near` + d x tan(fov / 2), length `range`; `FUN_00573130`'s
 * 65 deg and the constructor's 1000 u -- the hostage's AI record's `[0x3c]` / `[0x3b]` are unread (and `FUN_001b3808` taken as tan).
 */
export const HOSTAGE_SIGHT_PLACEHOLDER = { fovDeg: 65, range: 1000, near: 25 } as const;

/*
 * LATER 1245: the visibility (`FUN_00538d10`, the AI navigation walk) is `./hostageVisibility`'s `navVisibility` with
 * `HOSTAGE_DANGER_VISIBILITY_READING` -- it retired the hull stand-in (the visibility placeholder, research 445 s7).
 */

/** Research 445 s3.6: the flee radius is the item's `Explosion_Radius` x 10 (`FUN_003d4500`), 200 with none. */
export const HOSTAGE_FLEE_RADIUS_READING = { none: 200 } as const;

/** Research 445 s5: `n = int(R x k x 0.1)`, `k` 1.2 for a thrower sharing the hostage's team bits (any player), walked to `n + extra`, accepted at `n - accept`. */
export const HOSTAGE_FLEE_POINT_READING = { k: 1.2, extra: 2, accept: 2 } as const;

/**
 * Research 445 s5: 0x1b case 3's THIRD attempt, after the walk at `n - 2` and the cover search (`coverCell`), is the
 * walk's own cell at any depth (D:L423305-423315: its soil, `FUN_0052a090`, with no depth test). Why the original's
 * failed at Q24c M1 (it held, where the port answers that cell) is unread.
 */
export const HOSTAGE_FLEE_FALLBACK_PLACEHOLDER = 'the walk cell' as const;

/**
 * LATER 1226 (research 445 s5): the cover search's constants -- `FUN_0053a160`'s depth (`DAT_00650470` 10.0, taken
 * `(int)` at D:L423290), the flood's pop budget `(2 x depth)^2` (0x536ce8, 0x536cf0), the neighbour order (0x64f910 /
 * 0x64f914, indexed by the loop counter: the step's direction, the octant of `octantOf`), the blockers it accepts
 * (kinds 0, 8, 10: the callback 0x53a5e0) and the cells it crosses (any kind but 0, 8, 9, 10, not bit 7).
 */
export const HOSTAGE_COVER_SEARCH_READING = {
  depth: 10,
  steps: [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]],
  blockers: [0, 8, 10],
  closed: [0, 8, 9, 10],
} as const;

/**
 * Research 445 s7 (reading, pending review; SCOPED to the disc's own maps with hostages but the campaign's M71): the cover
 * callback's object test (`FUN_0053a500`, `CAiOverlayList::Contains`, over the list 0x66a0b8) meets no object there: the AI
 * overlay list (r0001 0x66a0b8, r0004 0x669a38) has one producer, `CVehicle::Init` (`FUN_003adab0` D:L303286; r0004
 * `FUN_003cfc00` D4:L328877), and no map with hostages but the campaign's M71 has a vehicle by either of its paths -- a
 * definition-named node or a `vehicle` record; on M71 (its `tank1`) the original's list holds the tank's footprint and this
 * value does not hold: a KNOWN DEPARTURE (LATER 1445). Outside the scope: a forge layout placing hostages on a base with a
 * vehicle -- MP2 (its `tank1`) is reachable today; the campaign's bases are not (no multiplayer mission entry, so no extraction
 * room; their AIMAPS refused, so no planner), so neither is M71's departure. (`hostageOverlayScope.devdisc.test.ts`).
 */
export const HOSTAGE_COVER_OBJECTS_READING = 'none' as const;

/**
 * LATER 1226 (research 445 s5, s7; reading, pending review): the flood `FUN_00536c80` sets bit 2 of a cell's byte +3 on
 * each neighbour the callback accepts and skips a neighbour that holds it (D:L402939-402943), then walks the region it
 * grew clearing that bit with `FUN_00518180` (D:L402960-402995; D:L385825-385832); r0004 the same (`FUN_0053b6d0`
 * D4:L442492-442542, `FUN_005182c0` D4:L422830-422837). No bit outlives a search: each search a fresh flood.
 */
export const HOSTAGE_COVER_VISITED_READING = 'a fresh flood each search' as const;

/** LATER 1226: the cover search pushes move kind 4 (D:L423292), the walk 0xc (D:L423276); the difference unread: the room's same run. */
export const HOSTAGE_COVER_MOVE_KIND_PLACEHOLDER = 'the walk run' as const;

/**
 * LATER 1226 (research 445 s5, s7; reading, pending review): the callback takes a blocker's octant from `FUN_00518900`
 * (D:L386144-386197; r0004 `FUN_00518bc0` D4:L423200-423253), whose point is the cell centre moved, when the cell has
 * bit 7 (`FUN_00516920`) and its marker record's direction nibble (`FUN_00530d10`, `FUN_00516910`: `+8` & 15) is not 8,
 * by `scale` along that compass direction (`FUN_00519130`: N, NE, ... clockwise, the diagonals 0.70710677 per axis) --
 * D:L386177-386185. `scale` is `DAT_0065b030` = 0.75 in r0001's ELF and `DAT_0065b090` = 0.75 in r0004's served ELF
 * (research 333 s5 read the r0001 word; `hostagePath.ts`'s route endpoint makes the same move).
 */
export const HOSTAGE_COVER_MARKER_CENTRE_READING = { scale: 0.75, none: 8 } as const;
const COVER_DIAGONAL_AXIS = 0.7071067690849304;

/** Research 445 s5: the end timer once the object is gone (2.1-2.9 + 1.5 f, 1.0-1.8 + f in sub-state 8; `f` from the unread skill): the middle, 2.5 s. */
export const HOSTAGE_FLEE_END_PLACEHOLDER = 2.5;

/**
 * Research 445 s5 (LATER 1224; reading, pending review; was the posture placeholder, unread): 0x1b's posture asks --
 * sub 7 (inside R) prone, sub 8 (outside) crouch, sub 0 a prone hostage to stand -- each `+0x279` with `+0x280` =
 * `base` + U(0, `spread`) s (D:L423103-423107, D:L423504-423517).
 */
export const HOSTAGE_FLEE_POSTURE_READING = { inside: 2, outside: 1, stand: 0, base: 0.25, spread: 0.95 } as const;

/** Research 445 s5: the 0x19 look (a frag marked but not seen) -- reached in the room only for a departed thrower's frag; not built. */
export const HOSTAGE_EVENT_LOOK_PLACEHOLDER = 'not built' as const;

/** Research 445 s4: the gate's ctrl `+0x265`, `+0x430` bit 2 and actor `+0xe1` bit 0x10 on a hostage are unread: admitting; a hidden hostage takes no push. */
export const HOSTAGE_DANGER_GATE_BITS_PLACEHOLDER = 'admitting' as const;

/** Research 445 s5: the run's direction is away from the object where it stands; `FUN_0055cdc0`'s landing prediction (and, without one, the object's velocity component removed, D:L423227-423242) is unread (the review's F4). */
export const HOSTAGE_FLEE_LANDING_PLACEHOLDER = 'the object where it stands' as const;

/**
 * Research 445 s5, s7 (reading, pending review; SCOPED to the disc's own maps with hostages but the campaign's M71): the walk's
 * stop at a cell in the overlay list (`FUN_00535a40`, `CountMapTravelDir`, its first node 0x66a0c0, D:L402265-402274) never
 * fires there -- the soil alone: the AI overlay list (r0001 0x66a0b8, r0004 0x669a38) has one producer, `CVehicle::Init`
 * (`FUN_003adab0` D:L303286; r0004 `FUN_003cfc00` D4:L328877), and no map with hostages but the campaign's M71 has a vehicle by
 * either of its paths -- a definition-named node or a `vehicle` record; on M71 (its `tank1`) the original's list holds the
 * tank's footprint and this value does not hold: a KNOWN DEPARTURE (LATER 1445). Outside the scope: a forge layout placing
 * hostages on a base with a vehicle -- MP2 (its `tank1`) is reachable today; the campaign's bases are not (no multiplayer
 * mission entry, so no extraction room; their AIMAPS refused, so no planner), so neither is M71's departure.
 * (`hostageOverlayScope.devdisc.test.ts`).
 */
export const HOSTAGE_FLEE_WALK_OBSTACLES_READING = 'the soil alone' as const;

/** Research 445 s5: the move child 0x18's tick is unread; the hostage runs the planner's route to the cell at throttle 1 on the follower's direct steering. */
export const HOSTAGE_FLEE_MOVE_PLACEHOLDER = 'the route at throttle 1' as const;

export type DangerKind = 'frag' | 'c4' | 'satchel';

/** The kind of a projectile record's id, or null when the scan takes none (`HOSTAGE_DANGER_KINDS_READING`). */
export function dangerKind(itemId: number): DangerKind | null {
  return HOSTAGE_DANGER_KINDS_READING[itemId] ?? null;
}

/** One object the scan may meet: the room's projectile id, its kind, where it is, its fuse left, its blast radius, its thrower (null: no longer resolves) and the thrower's team mask (`+200`). */
export interface Danger { pid: number; kind: DangerKind; pos: V3; fuse: number; radius: number; owner: number | null; ownerTeam: number }

/** The hostage scanning: its body id, feet, eye, facing (unit, flattened), team mask, and `inFlight`: true when the scan's gate refuses 0x1b now -- the room passes `!HostageAi.canFlee`, the whole can-push test `FUN_005f5cd0(ctrl, 0x1b, 0)` (D:L482954-482955; SHOTS-1208 r125), refused with 0x1b, 0x13 or 0x1c on the stack. */
export interface DangerWatcher { id: number; feet: V3; eye: V3; forward: V3; team: number; inFlight: boolean }

/** What the decision asks of the room. */
export interface DangerWorld {
  /** Whether a body is in the hostage's neighbour list (`HOSTAGE_DANGER_NEIGHBOUR_READING`). */
  actor(id: number): boolean;
  /** The visibility from `eye` to `point`, 0..1 (LATER 1245: the navigation walk, `./hostageVisibility`). */
  visible(eye: V3, point: V3): number;
  /** Whether a thrower is a local human (`cVar9`): never in the room (`HOSTAGE_DANGER_REMOTE_PLANTER_READING`). */
  localHuman(id: number): boolean;
}

/**
 * The marks the decision keeps: `marks`, this hostage's handled objects (the object's `+0x18` bit for this actor); `seen`,
 * the objects whose side's seen bits are set (`+0x1c`, shared by every AI's pass: research 445 s5).
 */
export interface DangerMarks { marks: Set<number>; seen: Set<number> }

const sub = (a: readonly number[], b: readonly number[]): V3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const len2 = (a: readonly number[]): number => dot(a, a);

/** The view cone's test (`FUN_005cac00` D:L482676-482695 on `FUN_005c9400`'s fields; `HOSTAGE_SIGHT_PLACEHOLDER`). */
function inCone(w: DangerWatcher, p: V3): boolean {
  const rel = sub(p, w.eye), depth = dot(rel, w.forward);
  if (!(depth > 0) || depth > HOSTAGE_SIGHT_PLACEHOLDER.range) return false;
  const r = HOSTAGE_SIGHT_PLACEHOLDER.near + depth * Math.tan((HOSTAGE_SIGHT_PLACEHOLDER.fovDeg * Math.PI) / 360);
  return len2(rel) - depth * depth <= r * r;
}

/**
 * One AI tick's scan (`FUN_005cb870` D:L482938-482967) and decision (`FUN_005cac00`, research 445 s3), in the list's order:
 * the first object that answers stops it. `stop` whether one answered; `flee` the object to run from (0x1b to push), when
 * it answered within its flee radius and the scan's gate admits 0x1b (`inFlight` false). Marks are written into `marks`.
 */
export function scanDangers(w: DangerWatcher, dangers: readonly Danger[], marks: DangerMarks, world: DangerWorld): { stop: boolean; flee: Danger | null } {
  const S = HOSTAGE_DANGER_SCAN_READING;
  if (w.inFlight) return { stop: false, flee: null };          // the 0x1b gate refused (`FUN_005f5cd0`, D:L482954-482955)
  for (const d of dangers) {
    const off = sub(d.pos, w.feet);
    if (!(len2(off) < S.range * S.range)) continue;             // `FUN_00541f10`: strictly within
    if (d.kind === 'satchel' || !(d.fuse <= S.fuse)) continue;  // HOSTAGE_SATCHEL_FUSE_PLACEHOLDER
    const answered = decide(w, d, marks, world);
    if (!answered) continue;
    // Reacting (D:L482718-482749): the mark before the radius test; within the flee radius, 0x1b.
    marks.marks.add(d.pid);
    const within = len2(off) < d.radius * d.radius;
    return { stop: true, flee: within ? d : null };
  }
  return { stop: false, flee: null };
}

/** Whether `FUN_005cac00` reacts (`bVar5`): rules 1-4 of research 445 s3. Sets the seen bit on a seen pass. */
function decide(w: DangerWatcher, d: Danger, m: DangerMarks, world: DangerWorld): boolean {
  if (m.marks.has(d.pid)) {
    // Rule 1: already marked -- seen (or ctrl +0x264 bit 1, clear on a hostage) re-pushes; unseen, kind 1 only (bVar8, the
    // 0x19 look: HOSTAGE_EVENT_LOOK_PLACEHOLDER); C4 and the satchel answer 0.
    if (m.seen.has(d.pid)) return true;
    return d.kind === 'frag';
  }
  // Rule 2: a thrower that no longer resolves -- the tests skipped, it reacts unseen (D:L482641).
  if (d.owner === null) return true;
  if (d.owner !== w.id && !world.actor(d.owner)) return false;  // resolved, not listed: no reaction, no mark (D:L482714-482715)
  // Rule 3: seen.
  const near = len2(sub(d.pos, w.feet)) < HOSTAGE_DANGER_SCAN_READING.near * HOSTAGE_DANGER_SCAN_READING.near;
  if (d.owner === w.id || ((inCone(w, d.pos) || near) && world.visible(w.eye, d.pos) > HOSTAGE_DANGER_SCAN_READING.visible)) {
    m.seen.add(d.pid);
    return true;
  }
  // Rule 4: unseen -- a shared team bit and a local human thrower (never in the room).
  return (d.ownerTeam & w.team) !== 0 && world.localHuman(d.owner);
}

/** The flee depth `n = int(R x 1.2 x 0.1)` in navigation cells (`FUN_0055ac20` D:L423072-423092; `HOSTAGE_FLEE_POINT_READING`). */
export function fleeDepth(radius: number): number {
  return Math.trunc(radius * HOSTAGE_FLEE_POINT_READING.k * 0.1);
}

/** The eight compass steps, counter-clockwise from +x. */
const DIRS: readonly [number, number][] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

/** The navigation the walk reads: a cell's soil (`FUN_0052a090`); the cover search its word and centre. */
export interface FleeNav {
  traversable(loc: AiLoc): boolean;
  /** The cell's word, null off the map (`FUN_00511f80`). */
  word?(loc: AiLoc): number | null;
  /** The cell's plain centre (`FUN_00518900`'s before its marker move). */
  point?(loc: AiLoc): readonly [number, number, number];
  /** A bit-7 cell's marker record direction nibble (`FUN_00530d10`, `FUN_00516910`; 8 = none), null without a record. */
  markerOffset?(loc: AiLoc): number | null;
}

/** `FUN_00518900`'s point for a cover blocker: the centre, moved per `HOSTAGE_COVER_MARKER_CENTRE_READING`. */
function coverBlockerPoint(nav: FleeNav & Required<Pick<FleeNav, 'word' | 'point'>>, loc: AiLoc, word: number): readonly [number, number, number] {
  const c = nav.point(loc), M = HOSTAGE_COVER_MARKER_CENTRE_READING;
  const offset = (word & 128) !== 0 ? nav.markerOffset?.(loc) ?? null : null;
  if (offset === null || (offset & 15) === M.none) return c;
  // `FUN_00519130`'s default case (D:L386525-386528): a nibble 9..15 is north, with no diagonal factor.
  const n = offset & 15, [dx, dz] = n < 8 ? HOSTAGE_COVER_SEARCH_READING.steps[n]! : [0, -1], axis = n < 8 && n & 1 ? COVER_DIAGONAL_AXIS : 1;
  return [c[0] + dx * axis * M.scale, c[1], c[2] + dz * axis * M.scale];
}

/**
 * LATER 1226 (research 445 s5; simulation track, reading, pending review): the flight's second search, `FUN_0053a160`
 * (D:L404384-404460) through the flood fill `FUN_00536c80` (D:L402793-403000) and its callback 0x53a5e0
 * (D:L404560-404590): COVER. Breadth first from `start`, at most (2 x depth)^2 pops; each popped cell's eight neighbours in
 * the fixed order (`HOSTAGE_COVER_SEARCH_READING.steps`) -- a neighbour off the map or already visited skipped; an open one
 * (not a closed kind, not bit 7, no object over it: `HOSTAGE_COVER_OBJECTS_READING`) visited and queued; a blocker
 * (kind 0, 8 or 10) ACCEPTED when the octant from its centre toward `landing` equals the step's own direction -- the
 * blocker lies between the popped cell and the threat -- and the answer is the POPPED cell; anything else rejected and
 * not marked (offered again beside another cell). The start cell is never marked visited. Null when nothing is found.
 */
export function coverCell(nav: FleeNav & Required<Pick<FleeNav, 'word' | 'point'>>, start: AiLoc, landing: readonly number[], depth: number = HOSTAGE_COVER_SEARCH_READING.depth): AiLoc | null {
  const R = HOSTAGE_COVER_SEARCH_READING;
  const key = (v: AiLoc): string => `${v.map}:${v.x}:${v.z}`;
  const visited = new Set<string>();
  const queue: AiLoc[] = [start];
  for (let pops = 0; queue.length > 0 && pops < (2 * depth) ** 2; pops++) {
    const at = queue.shift()!;
    for (let dir = 0; dir < 8; dir++) {
      const [dx, dz] = R.steps[dir]!;
      const next = { map: at.map, x: at.x + dx, z: at.z + dz };
      const word = nav.word(next);
      if (word === null || visited.has(key(next))) continue;
      const kind = word & 31;
      if (!(R.closed as readonly number[]).includes(kind) && (word & 128) === 0) {   // HOSTAGE_COVER_OBJECTS_READING
        visited.add(key(next));
        queue.push(next);
      } else if ((R.blockers as readonly number[]).includes(kind)) {
        const c = coverBlockerPoint(nav, next, word);             // HOSTAGE_COVER_MARKER_CENTRE_READING
        const dxl = landing[0]! - c[0], dzl = landing[2]! - c[2], len = Math.hypot(dxl, dzl);
        if (len > 0 && octantOf([dxl / len, dzl / len]) === dir) return at;
      }
    }
  }
  return null;
}

/**
 * The flight's cell (`FUN_00559580` D:L422344, D:L422375-422423; research 445 s5): from `here`, each of the eight compass
 * directions walked cell by cell while the soil holds, to depth `n + 2`; the best of the octant facing `away` and its
 * neighbours (d, d-1, d+1, ...), each by its own depth -- a frag the first three candidates (flag 0x30000: its 0x20000), C4
 * all eight (0x10000); the summing branch is taken only without 0x10000, which `CAiSGrenade` never passes (D:L422375,
 * D:L422387-422388, D:L422409-422410; the review's F1) -- the first best kept. The walk tests a cell's soil only:
 * `HOSTAGE_FLEE_WALK_OBSTACLES_READING`. 0x1b case 3's order (D:L423268-423340): accepted at depth `n - 2`; else,
 * given the `landing`, the cover search (`coverCell`, LATER 1226); else the walk's own cell at any depth
 * (`HOSTAGE_FLEE_FALLBACK_PLACEHOLDER`); null when it goes nowhere.
 */
export function fleeCell(nav: FleeNav, here: AiLoc, away: readonly [number, number], n: number, kind: DangerKind, landing?: readonly number[]): AiLoc | null {
  const P = HOSTAGE_FLEE_POINT_READING;
  const depth: number[] = [], end: AiLoc[] = [];
  for (const [dx, dz] of DIRS) {
    let k = 0, at = here;
    while (k < n + P.extra) {
      const next = { map: here.map, x: at.x + dx, z: at.z + dz };
      if (!nav.traversable(next)) break;
      at = next; k++;
    }
    depth.push(k); end.push(at);
  }
  const a = ((Math.round(Math.atan2(away[1], away[0]) / (Math.PI / 4)) % 8) + 8) % 8;
  const order = [a, a + 7, a + 1, a + 6, a + 2, a + 5, a + 3, a + 4].map((i) => i % 8);
  const candidates = kind === 'frag' ? order.slice(0, 3) : order;
  const score = (i: number): number => depth[i]!;
  let best = candidates[0]!;
  for (const i of candidates) if (score(i) > score(best)) best = i;
  if (depth[best]! >= n - P.accept) return end[best]!;
  // LATER 1226: case 3's second attempt, the cover search (D:L423290), toward the landing (`HOSTAGE_FLEE_LANDING_PLACEHOLDER`).
  if (landing && nav.word && nav.point) {
    const cover = coverCell(nav as FleeNav & Required<Pick<FleeNav, 'word' | 'point'>>, here, landing);
    if (cover) return cover;
  }
  return depth[best]! > 0 ? end[best]! : null;                   // the third attempt (HOSTAGE_FLEE_FALLBACK_PLACEHOLDER)
}
