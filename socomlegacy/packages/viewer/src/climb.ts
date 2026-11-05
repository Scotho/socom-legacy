import {
  polygonNormal, probeGround, segmentHits, surfaceMaterial, surfaceWord, transformPoint, SEAL_TUNING, SURFACE_SKIP, type Grid, type WorldPoly,
} from '@s2u/scene';

/**
 * The climb onto and over obstacles (web research 86 section 3), the geometry half: which wall is climbable, the
 * contact the game keeps, and the plan a press of the action button would run. Pure; `./traversal` runs the plan.
 *
 * **What is climbable is the polygon's, not the height's** (`FUN_005b2620`, decomp 468288; `FUN_005b3ce0`, 469088;
 * `FUN_0059d9f0`, 457413): `m_appflags` -- `(byte[poly+0xA] & 0x7f) >> 4`, surface word bits 20-22 --
 *
 * | appflags | the climb                                                        |
 * |----------|------------------------------------------------------------------|
 * | 1, 3     | by the height (`FUN_00580b70`'s table below)                     |
 * | 2        | the ladder (`./traversal`)                                       |
 * | 4        | the crates: by the height, only for 5 < h <= 32; 5 < h <= 10 steps up with no press |
 * | 5        | always "Climb over" (`FUN_00580a80`)                             |
 * | 0        | never: an ordinary wall is not climbed                           |
 *
 * **The contact** (`FUN_005483d0`, 413610-413670, via `FUN_005b0d30`): the wall polygon the move last pushed against,
 * at `actor+0x1090` (point, polygon, normal), replaced by the move's best hit whether or not it climbs (PAR-21a C1,
 * D:L413866; was: by a new climbable one), cleared at an inside corner (PAR-21a C2, `cornerDrop`), dropped past 24
 * across the ground, behind the face, or facing away (`FUN_005b3890`, 468959). PB-3b: taken from the walk's own hits
 * (`contactFromHits`), not by a reach of its own.
 *
 * **The height** `h` = the polygon's top at the hit's column (`FUN_002dbfb0`, `columnTop`; LATER 111) - the feet (the material's `FOOT_STEP_OFFSET` term
 * `DAT_0044f358[mat] + 0x38` is left out: unverified which field it is). From the feet as they are -- in the air too,
 * which is the jump-grab: a jump lowers `h` while the contact holds.
 *
 * **The table** (`FUN_00580b70`, 442174; all literals), standing or crouched (prone does not climb, `FUN_005b4340`):
 *
 * | h           | the clip                                                                     |
 * |-------------|------------------------------------------------------------------------------|
 * | <= 5        | nothing                                                                      |
 * | 5 .. 10     | "Step up" (`seal_step_up`)                                                   |
 * | 10 .. 12    | "Climb crate" (`seal_climbcrate`)                                            |
 * | 12 .. 26.5  | crate at weight 1 - (h - 12) / 14.5, medium the rest (`FUN_00581110`)        |
 * | 26.5 .. 28  | "Climb medium" (`seal_climb_medium`)                                         |
 * | 28 .. 32    | "Stand -> Hang", "Hang", then "Hang -> Climb" (`seal_stand2hang` ...)        |
 * | > 32        | nothing                                                                      |
 *
 * `dynamics.rdr`'s `low/med/high_climb_height` 13 / 21.5 / 26.5 have **no reader** (the loader `FUN_0059ba80` stores them
 * at `0x44c250 +0x178..+0x184`, 456970-456979, and nothing reads them): 13 and 21.5 are the heights the crate and medium
 * clips were authored for -- their `refPt.y` is exactly that less the root's 11.52 -- and 26.5 is the table's own.
 * Between 12 and 26.5 both clips play as the two nodes of one play sharing a phase (`FUN_00581110`, decomp
 * 442306-442340): the crate at `1 - (h - 12) / 14.5`, the medium the rest (`ClimbPlan.blend`).
 *
 * **The facing** (469208, `FUN_005b2620`): the facing dotted with the wall's normal (into the wall) >= 0.3, and the
 * direction from the contact to the mover within 0.3 of the normal.
 */

/**
 * A climbable wall the mover has touched: the polygon, the hit on it, its horizontal normal toward the mover, its top and
 * bottom at the hit's column (`columnTop`) and its cut at the hit's height (`crossSection`). LATER 111 (research 313
 * section 8.8; reading, pending review): *was* the polygon's highest and lowest points and its top edge (the points within
 * 0.01 of the highest).
 */
export interface ClimbContact {
  poly: WorldPoly;
  /** `m_appflags`. */
  app: number;
  /** The hit on the polygon (x, z): the walk's or the obstacle ray's (`FUN_005b0d30` stores the hit's point). */
  x: number;
  z: number;
  /** The hit's height: where the push cuts the polygon for its target (`FUN_002dc090`). */
  y: number;
  /** The polygon's own unit horizontal normal, the mover in front of it (PB-3b: a face is met from its front only). */
  nx: number;
  nz: number;
  /**
   * The top and the bottom at the hit's column (`FUN_002dbfb0`, `columnTop`); NaN when no edge spans the column under
   * `CLIMB_COLUMN_END_READING` `'none'` (the original's `FUN_002dbfb0` returning 0: no class-4 offer, D:L469252-469254,
   * and no push, D:L468371-468373, but appflags 1, 3 and 5 still offered, and the ray cast at the head's height,
   * D:L416735-416743 -- not modelled, `obstacleRay`; the port makes no plan and casts no ray, `planClimb`).
   */
  top: number;
  bottom: number;
  /**
   * The polygon's cut at the hit's height (`FUN_002dc090` -> `FUN_002dd2b0`): its first two crossings (x, z) in the
   * edges' order, which the push's target is placed on (`FUN_005b3a60`); null under two crossings (the push refuses,
   * D:L468423-468425). LATER 147 (research 313 section 8.11; reading, pending review): the original keeps every crossing
   * and reads the first two alone, as here; its push's buffer holds two, so a fourth overwrites the top's height
   * (`FUN_005b2620` D:L468309-468311) -- a known difference no face on the disc reaches (`climbCut.disc.test.ts`).
   */
  edge: [number, number, number, number] | null;
}

/** The climb's height classes, as the HUD's icon and the audio read them. */
export type ClimbClass = 'step' | 'low' | 'med' | 'high' | 'over';

/** A climb the action button would run. */
export interface ClimbPlan {
  kind: ClimbClass;
  /** The clip (`motion.rdr`'s name); for 'high' the first of three; for a blend the first node, the crate. */
  clip: string;
  /** Between 12 and 26.5 the second node, the medium, and the crate's weight (`FUN_00581110`); null otherwise. */
  blend: { clip: string; weight: number } | null;
  /** The height over the feet. */
  h: number;
  /** The point on the top edge the move aims at (`FUN_005b3a60`), and the yaw facing the wall (-normal). */
  target: [number, number, number];
  yaw: number;
  /** Whether the press is not needed (appflags 4 at 5 < h <= 10). */
  automatic: boolean;
  contact: ClimbContact;
}

/** `m_appflags` values that climb (the header's table; 2 is the ladder's). */
export const CLIMBABLE = new Set([1, 3, 4, 5]);
/** `FUN_005b3890` / `FUN_005483d0`: the contact is kept this far across the ground (576 = 24^2). */
export const CONTACT_KEEP = 24;
/** 469208 / `FUN_005b2620`: the facing and the direction dots. */
export const CLIMB_FACING = 0.3;
/** `FUN_005b3a60`: the target is kept this far from the cut's ends. */
const EDGE_END = 3;

/** `FUN_00580b70`'s table (the header): the class and the clip (and the blend) for a height, or null outside it. */
export function climbClass(h: number, app: number): { kind: ClimbClass; clip: string; blend: ClimbPlan['blend'] } | null {
  if (app === 5) return { kind: 'over', clip: 'seal_climb_over', blend: null };
  if (app === 4 && !(h > 5 && h <= 32)) return null;
  if (h <= 5 || h > 32) return null;
  if (h <= 10) return { kind: 'step', clip: 'seal_step_up', blend: null };
  if (h <= 12) return { kind: 'low', clip: 'seal_climbcrate', blend: null };
  if (h <= 26.5) {
    const crate = 1 - (h - 12) / 14.5;                   // FUN_00581110's weight
    return { kind: crate >= 0.5 ? 'low' : 'med', clip: 'seal_climbcrate', blend: { clip: 'seal_climb_medium', weight: crate } };
  }
  if (h <= 28) return { kind: 'med', clip: 'seal_climb_medium', blend: null };
  return { kind: 'high', clip: 'seal_stand2hang', blend: null };
}

/**
 * The contact polygon's material's `FOOT_STEP_OFFSET` (`DAT_0044f358[mat] + 0x38`, the parser at decomp 181399-181401;
 * 0 by default, `FUN_002deb30`): -0.8 on GRASS, BROKEN GLASS, LEAVES, ICE, SNOW and GRAVEL -- the hull's 4, 14, 15, 16,
 * 17, 18 (the SOILS order + 2, research 86 section 5.1) -- added to the climb's height.
 */
export function footStepOffset(material: number): number {
  return material >= 14 && material <= 18 || material === 4 ? -0.8 : 0;
}

/**
 * `FUN_0054e430` (D:L416696-416800), run by the climb offer each frame: a level segment at the contact's top + 0.5 (the
 * top at the contact's column, `FUN_002dbfb0` D:L416734; LATER 111) (when that is under the feet + 21.1, D:L416744-416748), from over the feet to 1.1 of the way past the contact
 * (D:L416750-416767); a hit whose own normal has y at or under `max_slope` (0.6428, signed) and whose material is
 * neither VOLUMETRIC nor LIQUID (D:L416775-416791 -- `moveHit`'s filter, PAR-21a; was `|n_y| <= 0.6428` and water
 * only), on another object, replaces the contact -- a wall behind the ledge, or the next step of a stack, is what the
 * press then climbs; the new contact is the ray's hit -- its point, its column, its cut at the ray's height (LATER 111;
 * *was* the polygon's point nearest the mover). Null when nothing replaces it, and when the contact has no top (NaN). [Named departures (research 281 s4.1, 86 s3.3): the original asks
 * the nearest hit only (`FUN_0031e1d0`, D:L416772), the port passes over a rejected one to the next -- among them a
 * downward face steeper than about 44 degrees (normal y under -0.714), which passes the original's filter and is
 * stored there but which `contactOf` refuses as no wall (its horizontal part under 0.7); the original
 * stores the hit as the contact (`FUN_005b0d30` at D:L416793), the port's caller uses it for the offer only; and when
 * the contact polygon gives no top (`FUN_002dbfb0` returns 0) the original casts at the head's height instead, if the
 * contact's stored hit point is under it less 0.1 (D:L416735-416743), which the port does not model.]
 */
export function obstacleRay(grid: Grid, c: ClimbContact, x: number, y: number, z: number): ClimbContact | null {
  const Y = c.top + 0.5;
  if (!(Y < y + OBSTACLE_REACH)) return null;
  const to: [number, number, number] = [x + (c.x - x) * 1.1, Y, z + (c.z - z) * 1.1];
  for (const hit of segmentHits(grid, [x, Y, z], to)) {
    if (hit.poly === c.poly || hit.poly.path === c.poly.path) continue;
    if (!moveHit(hit.poly)) continue;                         // PAR-21a: D:L416775-416791, the move solver's filter
    const next = contactOf(hit.poly, hit.poly.appflags ?? 0, x, z, hit.point);   // LATER 111: at the ray's hit (D:L416793)
    if (next) return next;                                   // PB-3b: a face crossed from behind is no hit (one-sided)
  }
  return null;
}

/** `FUN_0054e430`: 19.1 + 2.0 over the feet (the standing cylinder and its margin). */
const OBSTACLE_REACH = 21.1;
/** `DAT_0044c268`: `max_slope`'s cosine, 0.6428. */
const MAX_SLOPE_COS = Math.cos((SEAL_TUNING.maxSlopeDeg * Math.PI) / 180);

/**
 * A wall the walk's slide met (`./mover` `WallHit`): its polygon, its probe line (0 low, 1 the head line; 2 a side line,
 * SEGMENT-BODY: never the contact `contactFromHits` takes, D:L413823-413848), the point.
 */
export interface WalkHit {
  poly: WorldPoly;
  line: 0 | 1 | 2;
  x: number; y: number; z: number;
}

/**
 * PAR-21a C1 (web research 281 s4.1; reading, pending review): whether a wall the walk met stands for one of the move
 * solver's hits -- `FUN_005483d0` D:L413426-413457 keeps a hit only when its polygon's own normal has y at or under
 * `max_slope` (`DAT_0044c268`, 0.6428; signed: an overhang counts) and its material is neither VOLUMETRIC nor LIQUID
 * (the material table's `+0x3c` bits 0 and 1). The material is the polygon's byte through `surfaceMaterial`; [not
 * mirrored: a byte of 0 is the map's `DefaultMaterial`, which the climb does not know, so it is taken as `UNKNOWN`, no
 * flags.]
 */
export function moveHit(poly: WorldPoly): boolean {
  const n = polygonNormal(poly.points);
  if (!n || n[1] > MAX_SLOPE_COS) return false;
  const m = surfaceMaterial(poly.material);
  return !(m.volumetric || m.liquid);
}

/**
 * PB-3b (web research 281 s4.1): the climb contact from the walk's own wall hits (`Walker.wallHits`), as the move
 * solver takes it from its own hit (`FUN_005483d0`) -- no reach of its own: the face the walk's probe lines met is the
 * contact, at the point they met it. Each line's nearest hit (a segment record's hit is its nearest, `FUN_002d4cc0`
 * D:L175906-175960); then the low line's (the centre segment's, the first record), or the head line's when it is
 * nearer and higher (D:L413823-413848: a later record's hit replaces the best only so). Null when the walk met no face
 * from its front (`contactOf`, the one-sided query of research 281 s4.3).
 *
 * PAR-21a C1 (reading, pending review): the best hit is stored whether or not its polygon climbs (`FUN_005b0d30` at
 * D:L413866), among the hits `moveHit` keeps -- so a plain wall met replaces a crate's contact, and nothing is offered
 * on it (`Traversal.keepContact` offers only a climbable contact, as `FUN_005b3ce0` asks the contact's own appflags,
 * D:L469131-469132). *Was:* only a climbable wall (`CLIMBABLE`) replaced the contact.
 */
export function contactFromHits(hits: readonly WalkHit[], x: number, z: number): ClimbContact | null {
  const best: ({ c: ClimbContact; d: number; y: number } | null)[] = [null, null];
  for (const h of hits) {
    if ((surfaceWord(h.poly) & SURFACE_SKIP) !== 0 || !moveHit(h.poly)) continue;
    const c = contactOf(h.poly, h.poly.appflags ?? 0, x, z, [h.x, h.y, h.z]);     // LATER 111: at the hit's column
    if (!c) continue;
    const d = Math.hypot(h.x - x, h.z - z), b = best[h.line];
    if (!b || d < b.d) best[h.line] = { c, d, y: h.y };
  }
  const [low, head] = best;
  return (head && (!low || (head.d < low.d && head.y > low.y)) ? head : low)?.c ?? null;
}

/** `FUN_005483d0` D:L413894: the corner drop's horizontal dot (the literal 0.9, about 25.8 degrees). */
export const CORNER_DOT = 0.9;

/**
 * READING (named; PAR-21a C2, research 281 s4.1 and s6): which of the walk's other hits the corner drop asks --
 * `'span'`: a face the walker stands within the horizontal span of (its footprint's extent along the face). The
 * original's other hits are crossings of its segment records (`FUN_0054aa30` D:L415433-415577: the centre, the head
 * line, the side segments 0.3 r to 1.2 r across, 1.4 r ahead), which meet a face across its width; the port's slide
 * records any face within the stand-off of the body's disc, and at an outside corner the disc meets both faces at
 * their shared end. `'any'` asks every front-met hit (the drop then fires at every outside corner touched). **Two
 * readings, unsettled** (parity clause 7; s4.1, PAR-21a F2): at Frostfire's prop02 corner at -120, a still body's side
 * records end short of both faces' spans and only the centre meets the corner -- `'span'`'s outcome, the climb offered;
 * but the side records add the velocity to their ends (D:L415566, D:L415806; the per-tick displacement, D:L413918), and
 * from about 1.05 a tick (a full run about 2.17) the left one crosses the west face inside its span while the centre
 * meets the north face -- `'any'`'s outcome, the contact cleared. The original's stand-off there is its reach (C3),
 * unread. `'span'` is the controller's choice, kept for the existing pin (`climbFacing.test.ts` (e) at -120) pending a
 * capture: HUMAN_TASKS H229 (walk, then run, into that corner; CLIMB offered or not). The faithful rule, the side
 * records cast for the corner's other hits, is PAR-21's with C3.
 */
export const CORNER_HITS_READING = 'span' as 'span' | 'any';

/** Whether (x, z) lies within the horizontal span of `poly`'s footprint along the face of horizontal normal (nx, nz). */
function withinSpan(poly: WorldPoly, nx: number, nz: number, x: number, z: number): boolean {
  const p = poly.points, count = p.length / 3;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < count; i++) { const a = -nz * p[i * 3]! + nx * p[i * 3 + 2]!; lo = Math.min(lo, a); hi = Math.max(hi, a); }
  const at = -nz * x + nx * z;
  return at > lo && at < hi;
}

/**
 * PAR-21a C2 (web research 281 s4.1; reading, pending review): the corner drop. With the stored hit climbable
 * (`FUN_0059d9f0`: appflags 1, 3, 4, 5, D:L457424-457426), any other hit of the move on a different polygon (the hit
 * slot's polygon word `+0xc`, D:L413884) whose horizontal normal dotted with the stored one's is under 0.9 (both with y
 * zeroed and renormalised, D:L413869-413893; the literal at D:L413894) clears the contact (`FUN_005b0d30(actor, 0)` ->
 * `FUN_005b3890(actor, 1)`, D:L413895, D:L467399-467400): at an inside corner nothing is offered. The other hits are
 * the walk's that `moveHit` keeps, met from their front: the port's slide pushes from either side, and the front test
 * (`contactOf`) stands for the original's one-sided segment query (research 281 s4.3), which never meets a face from
 * behind. [Named departure, research 281 s4.1: the port's other hits are those of its two probe lines (the slide's
 * disc at the stand-off), not the original's four segment records (the centre, the head line, the two side segments
 * 0.3 r to 1.2 r across, `FUN_0054aa30` D:L415433-415577); of them only a face met within its span counts under
 * `mode` `'span'`, every one under `'any'` (`CORNER_HITS_READING`, the default).] True when the contact is dropped.
 */
export function cornerDrop(
  hits: readonly WalkHit[], c: ClimbContact, x: number, z: number, mode: 'span' | 'any' = CORNER_HITS_READING,
): boolean {
  if (!CLIMBABLE.has(c.app)) return false;
  for (const h of hits) {
    if (h.poly === c.poly || (surfaceWord(h.poly) & SURFACE_SKIP) !== 0 || !moveHit(h.poly)) continue;
    const o = contactOf(h.poly, h.poly.appflags ?? 0, x, z);
    if (!o || (mode === 'span' && !withinSpan(h.poly, o.nx, o.nz, x, z))) continue;
    if (c.nx * o.nx + c.nz * o.nz < CORNER_DOT) return true;
  }
  return false;
}

/**
 * READING (named; LATER 111, research 313 section 8.8; the controller's call between readings): the column at a hit no
 * edge spans strictly. `FUN_002dd690` keeps an edge's point only strictly inside the edge (D:L181005-181006,
 * D:L181022-181023), so at the face's end column `FUN_002dbfb0` returns 0 -- no offer for class 4 (D:L469252-469254),
 * no push (D:L468371-468373). The original's hits are segment crossings on the polygon (`FUN_002d4cc0`
 * D:L175906-175960, research 281 s4.1), which reach that column at almost no point; the port's walk hit is the nearest
 * point of the wall's cut (`mover.ts` `slide`), its end vertex exactly at an outside corner. `'inside'`: the column is
 * taken just inside the face -- the edges' points at the hit's projection clamped to the face, the edges' ends kept,
 * the limit from inside -- so a corner's offer stands as on the face beside it. `'none'`: as read, no top, and every
 * outside corner's offer goes. Settled by PAR-21 C3's segment records, or a capture at an outside corner of a sloped
 * climb face.
 */
export const CLIMB_COLUMN_END_READING = 'inside' as 'inside' | 'none';

/**
 * PLACEHOLDER (named; LATER 142, research 313 section 8.10; the merge controller's ruling, under
 * `CLIMB_COLUMN_END_READING` `'inside'`): a hit at its cut's end is taken this far inside the cut. No source gives the
 * 0.01: it stands in for the original's hits, segment crossings that land inside the cut. The port's walk hit is
 * the nearest point of the wall's cut (`mover.ts` `slide`: `nearest` over `bandFootprint`), so beside a face's end it
 * lies ON the polygon's boundary -- where the original's hits, segment crossings (`FUN_002d4cc0` D:L175906-175960,
 * research 281 s4.1), almost never do -- and there f32 rounding decides the column: (1) in the world's frame, at an
 * outside corner of a face not aligned to the axes or whose end is not quite vertical, `'inside'`'s clamp still keeps
 * no edge or one, and the top is NaN or the hit's own height (the slide's own hit, LATER 142's scratch: no offer at 114
 * of MP2's 1,352 corner contacts, 53 of MP6's 218, 31 of MP8's 127, every one offered 0.01 inside -- Frostfire's
 * `prop02` among them); (2) in a tilted collider's frame (`colliderColumn`) the boundary column is ill-conditioned --
 * at MP1's fence ends a hit moved 1e-5 inward changes the offer or the top by up to 23.6, and the collider's points
 * rebuilt from the world's and the archive's own disagree at 730 of 2,851 cut ends at 1e-5, 19 at 1e-4, 1 at 1e-3,
 * none at 1e-2. `0.01`: the limit from inside, as the original's interior crossings have it -- the hit moved along its
 * cut (the first two crossings, `crossSection` at the hit's height) to 0.01 from the end it lies within 0.01 of,
 * before either frame's column and cut are taken (the contact's point stays the hit); the outcome is the same for any
 * inset from 1e-3 to 1e-2 on MP1's fences (3 of 2,851 cut ends change between them). A hit further in, one beyond the
 * pair's ends by more than 0.01 (a non-convex face's other crossings: the original's pair is the first two too,
 * `FUN_005b3a60` D:L469038-469077, and no climb face on the disc has more -- LATER 147, research 313 section 8.11,
 * `climbCut.disc.test.ts`), or one on a cut of 0.02 or less, is
 * taken as it is. `0` (recorded): the hit as it is -- the read applied to the port's boundary hit.
 * Settled with PAR-21 C3 (the segment records' crossings), which removes the boundary hits; then dropped.
 */
export const CLIMB_EDGE_INSET_PLACEHOLDER = 0.01;

type P3 = [number, number, number];

/** LATER 142: the hit as the column and the cut take it -- moved `CLIMB_EDGE_INSET_PLACEHOLDER` into its cut when within that of an end. */
function insetHit(p: Float32Array, hit: readonly number[]): P3 {
  const h: P3 = [hit[0]!, hit[1]!, hit[2]!], d = CLIMB_EDGE_INSET_PLACEHOLDER;
  if (!(d > 0) || CLIMB_COLUMN_END_READING !== 'inside') return h;
  const cut = crossSection(p, h[1]);
  if (cut.length < 2) return h;
  const [a, b] = cut as [P3, P3], len = Math.hypot(b[0] - a[0], b[2] - a[2]);
  if (!(len > 2 * d)) return h;
  const s = ((h[0] - a[0]) * (b[0] - a[0]) + (h[2] - a[2]) * (b[2] - a[2])) / len;
  // Only a hit within d of the pair's end: one beyond it lies on another stretch of the cut (a non-convex face's other
  // crossings; none on a climb face on the disc, LATER 147) and is taken as it is (LATER 142's review, F1).
  if (s < -d || s > len + d) return h;
  const t = Math.max(d, Math.min(len - d, s));
  return t === s ? h : [a[0] + ((b[0] - a[0]) * t) / len, h[1], a[2] + ((b[2] - a[2]) * t) / len];
}

/** LATER 142: `FUN_00308160`'s inverse -- the 3x3 transposed over row 0's squared length -- and `FUN_003085c0`: a world point into the frame. */
function intoFrame(m: Float32Array, x: number, y: number, z: number): P3 {
  const q = 1 / (m[0]! * m[0]! + m[1]! * m[1]! + m[2]! * m[2]!);
  const dx = x - m[12]!, dy = y - m[13]!, dz = z - m[14]!;
  return [
    (dx * m[0]! + dy * m[1]! + dz * m[2]!) * q,
    (dx * m[4]! + dy * m[5]! + dz * m[6]!) * q,
    (dx * m[8]! + dy * m[9]! + dz * m[10]!) * q,
  ];
}

/**
 * `CLIMB_COLUMN_END_READING` `'inside'`'s limit in the frame the points are in: the column at (x, z)'s projection along
 * the face clamped to the face's extent, the edges' ends kept (`columnTop`'s `ends`). Null for a face level in that frame.
 */
function insideColumn(p: ArrayLike<number>, x: number, z: number): { top: P3; bottom: P3 } | null {
  const n = polygonNormal(p as Float32Array);
  if (!n) return null;
  const h = Math.hypot(n[0], n[2]);
  if (h < 1e-6) return null;
  const nx = n[0] / h, nz = n[2] / h;
  let flo = Infinity, fhi = -Infinity;
  for (let i = 0; i < p.length; i += 3) { const a = -nz * p[i]! + nx * p[i + 2]!; flo = Math.min(flo, a); fhi = Math.max(fhi, a); }
  const a = Math.max(flo, Math.min(fhi, -nz * x + nx * z)), off = nx * x + nz * z;
  return columnTop(p, nx * off - nz * a, nz * off + nx * a, true);
}

/**
 * LATER 142 (research 313 section 8.10; reading, pending review): the column and the cut in the collider's own frame, as
 * `FUN_002dbfb0` (D:L180187-180212) and `FUN_002dc090` (D:L180218-180248) take them: the frame (`WorldPoly.frame`,
 * `FUN_003109f0` D:L212151) inverted (`FUN_00308160` D:L206756) and the hit carried in (`FUN_003085c0` D:L206952); the
 * column along the local up axis (`FUN_002dd4d0` D:L180890-180956, `columnTop`; `'inside'`'s limit as in the world's
 * frame) and the cut at the local height (`FUN_002dd2b0`, `crossSection`), carried back out (`FUN_00308640`
 * D:L206996). The polygon's points in the frame are its world points carried in the same way -- the archive's own
 * model-space points, to f32 rounding (2.3e-4 at most on the disc's tilted climb faces). `at` is the hit as
 * `insetHit` takes it.
 */
function colliderColumn(poly: WorldPoly, f: Float32Array, at: P3): Pick<ClimbContact, 'top' | 'bottom' | 'edge'> {
  const p = poly.points, local = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 3) local.set(intoFrame(f, p[i]!, p[i + 1]!, p[i + 2]!), i);
  const l = intoFrame(f, at[0], at[1], at[2]);
  const col = columnTop(local, l[0], l[2]) ?? (CLIMB_COLUMN_END_READING === 'inside' ? insideColumn(local, l[0], l[2]) : null);
  const cut = crossSection(local, l[1]).map((q) => transformPoint(f, q[0], q[1], q[2]));
  return {
    top: col ? transformPoint(f, col.top[0], col.top[1], col.top[2])[1] : NaN,
    bottom: col ? transformPoint(f, col.bottom[0], col.bottom[1], col.bottom[2])[1] : NaN,
    edge: cut.length >= 2 ? [cut[0]![0], cut[0]![2], cut[1]![0], cut[1]![2]] : null,
  };
}

/**
 * LATER 111 (research 313 section 8.8; reading, pending review): a polygon's top and bottom at the column of the point
 * (x, z) -- `FUN_002dd4d0` (D:L180890-180956) over `FUN_002dd690` (D:L180962-181050). For each edge, the previous point
 * to the current one (the first edge from the last point, D:L180912-180916), the point's projection on the edge in xz
 * (D:L181003, D:L181020): the edge's point there (D:L181035-181038) when strictly inside it (D:L181005-181006,
 * D:L181022-181023; an edge with no length in xz never is), the highest kept the top and the lowest the bottom, the
 * first kept on a tie (D:L180939, D:L180944). Null when no edge spans the column (`FUN_002dbfb0` returns 0,
 * D:L180204-180205). `ends` (`CLIMB_COLUMN_END_READING` `'inside'`'s limit) keeps the edges' ends too.
 */
export function columnTop(points: ArrayLike<number>, x: number, z: number, ends = false): { top: P3; bottom: P3 } | null {
  const n = points.length / 3;
  if (n < 3) return null;
  let top: P3 | null = null, bottom: P3 | null = null;
  for (let i = 0, prev = n - 1; i < n; prev = i++) {
    const ax = points[prev * 3]!, ay = points[prev * 3 + 1]!, az = points[prev * 3 + 2]!;
    const dx = points[i * 3]! - ax, dy = points[i * 3 + 1]! - ay, dz = points[i * 3 + 2]! - az;
    const along = dz * (z - az) + dx * (x - ax);                         // fVar4: (b - a) . (p - a) in xz
    const rest = dx * dx + dz * dz - along;                              // fVar5: (b - a) . (b - p) in xz
    if (ends ? !(dx * dx + dz * dz > 0 && along >= 0 && rest >= 0) : !(along > 0 && rest > 0)) continue;
    const t = along / (along + rest);
    const q: P3 = [ax + dx * t, ay + dy * t, az + dz * t];
    if (!top || !bottom) { top = q; bottom = q; continue; }
    if (top[1] < q[1]) top = q;
    if (q[1] < bottom[1]) bottom = q;
  }
  return top && bottom ? { top, bottom } : null;
}

/**
 * LATER 111: a polygon's cut at the height y -- `FUN_002dd2b0` (D:L180803-180885): each edge, the previous point to the
 * current, that spans y (the previous under it and the current at or over it, or the current at or under it and the
 * previous over it, D:L180846-180847), its point at y (D:L180857-180860), in the edges' order.
 */
export function crossSection(points: ArrayLike<number>, y: number): P3[] {
  const n = points.length / 3, out: P3[] = [];
  if (n < 3) return out;
  for (let i = 0, prev = n - 1; i < n; prev = i++) {
    const ay = points[prev * 3 + 1]!, by = points[i * 3 + 1]!;
    if (!((ay < y && y <= by) || (by <= y && y < ay))) continue;
    const t = (y - ay) / (by - ay);
    const ax = points[prev * 3]!, az = points[prev * 3 + 2]!;
    out.push([ax + (points[i * 3]! - ax) * t, y, az + (points[i * 3 + 2]! - az) * t]);
  }
  return out;
}

/**
 * A wall polygon as a contact seen from (x, z), met at `hit` -- or null when (x, z) is behind the face. PB-3b (web
 * research 281 s4.2; reading, pending review): the move solver's hit is one-sided on the hull and keeps the polygon's own
 * normal -- its segment test (the polygon's vtable +0x14, 0x2dd150, a VU0 routine: micro 279-285 the plane's normal
 * (p2 - p1) x (p0 - p1), `polygonNormal`'s sign; micro 288-333 a hit only for a start in front of it and an end behind,
 * the start's w 0x20 from FUN_002d2890 D:L174831-174837 for a collider whose `+0x80` bit 1 is clear, as FUN_00316e30
 * D:L215828 makes the hull's) never meets a face from behind, so no climb contact is kept from there. Was: the normal
 * turned toward (x, z) (`if (side < 0)`), every climb face two-sided.
 *
 * LATER 111 (research 313 section 8.8; reading, pending review): the top and bottom at the hit's column (`columnTop`,
 * `CLIMB_COLUMN_END_READING`) and the cut at its height (`crossSection`). With no `hit` (a tool's or a test's contact)
 * the hit is the footprint's point nearest (x, z), at the middle of its column. *Was:* the polygon's highest and lowest
 * points, and its top edge -- the points within 0.01 of the highest (`FUN_005b1c80`'s ladder test), which a sloped top
 * shrinks to one vertex.
 *
 * LATER 142 (research 313 section 8.10; reading, pending review): on a polygon with a frame (a tilted node's,
 * `WorldPoly.frame`) the column and the cut at a hit are taken in the collider's own frame (`colliderColumn`), as the
 * original takes them; the normal, the side test and the contact's point stay the world's (the hit slot's own). *Was:*
 * in the world's frame on every polygon (`CLIMB_COLUMN_FRAME_PLACEHOLDER` `'world'`, retired by LATER 142). LATER 115
 * measured 410 spots on MP1's fences offered only in the world's frame and 80 only in the collider's, and the target
 * 23.64 apart in height; those offer flips were not the frame but f32 rounding at the cut's end vertex (the walk's hit
 * on the polygon's boundary): a hit moved 1e-5 inward flips its pinned refusal to an offer, 1e-4 inward its pinned
 * 34.25 to the world frame's 57.88 (research 313 section 8.10). The frame's own effect, at the hit inset, in a census
 * over static bodies (each still body's contact selection, not a walk): 14 offers of 100,554 contacts on the fences --
 * through the port's walk not refusals (LATER 142's re-review, G1) -- and the target's height up to 9.62 apart. With no
 * `hit` the world's frame is kept: no climb offer takes that path (the corner drop reads the normal only). Every hit,
 * either frame: within `CLIMB_EDGE_INSET_PLACEHOLDER` of its cut's end, the column and the cut are taken that far inside.
 */
export function contactOf(poly: WorldPoly, app: number, x: number, z: number, hit?: readonly number[]): ClimbContact | null {
  const n = polygonNormal(poly.points);
  if (!n) return null;
  const h = Math.hypot(n[0], n[2]);
  if (h < 0.7) return null;                                   // not a wall
  const nx = n[0] / h, nz = n[2] / h;
  const p = poly.points, count = p.length / 3;
  const plane = nx * p[0]! + nz * p[2]!;                      // the plane: nx x + nz z = plane
  if (nx * x + nz * z - plane < 0) return null;               // behind the face: the one-sided query meets nothing
  // The footprint's extent along the plane: the default hit's place, and the 'inside' column's clamp.
  let flo = Infinity, fhi = -Infinity;
  for (let i = 0; i < count; i++) { const a = -nz * p[i * 3]! + nx * p[i * 3 + 2]!; flo = Math.min(flo, a); fhi = Math.max(fhi, a); }
  const at = (a: number, off = plane): [number, number] => [nx * off - nz * a, nz * off + nx * a];
  const [hx, hz] = hit ? [hit[0]!, hit[2]!] : at(Math.max(flo, Math.min(fhi, -nz * x + nx * z)));
  // LATER 142: the column and the cut at the hit moved into its cut from a boundary end (`CLIMB_EDGE_INSET_PLACEHOLDER`); in
  // the collider's own frame on a tilted node's polygon (`colliderColumn`). The contact's point stays the hit.
  const inset = hit ? insetHit(p, hit) : null;
  if (inset && poly.frame) return { poly, app, x: hx, z: hz, y: inset[1], nx, nz, ...colliderColumn(poly, poly.frame, inset) };
  const [ix, iz] = inset ? [inset[0], inset[2]] : [hx, hz];
  let col = columnTop(p, ix, iz);
  if (!col && CLIMB_COLUMN_END_READING === 'inside') {
    // The limit from inside: the hit's projection along the face clamped to it, the edges' ends kept.
    const [cx, cz] = at(Math.max(flo, Math.min(fhi, -nz * ix + nx * iz)), nx * ix + nz * iz);
    col = columnTop(p, cx, cz, true);
  }
  const top = col ? col.top[1] : NaN, bottom = col ? col.bottom[1] : NaN;
  const hy = hit ? hit[1]! : (top + bottom) / 2;
  const cut = crossSection(p, hy);
  const edge: ClimbContact['edge'] = cut.length >= 2 ? [cut[0]![0], cut[0]![2], cut[1]![0], cut[1]![2]] : null;
  return { poly, app, x: hx, z: hz, y: hy, nx, nz, top, bottom, edge };
}

/** Whether a kept contact still holds (`FUN_005b3890`): within 24, in front of the face, and not faced away from. */
export function contactHolds(c: ClimbContact, x: number, z: number, fx: number, fz: number): boolean {
  const dx = x - c.x, dz = z - c.z;
  if (dx * dx + dz * dz > CONTACT_KEEP * CONTACT_KEEP) return false;
  if (dx * c.nx + dz * c.nz <= 0) return false;
  return -(fx * c.nx + fz * c.nz) > 0;
}

/**
 * READING (named; NU-1c B12, research 313 sections 1.2, 7 and 8.6, its D12): no floor test on the top (`'dropped'`).
 * `FUN_005b3ce0` offers a class-4 face by the obstacle ray's polygon's height alone (D:L469246-469285) and `FUN_005b2620`
 * pushes the table's clip on the same (D:L468420-468504) -- neither asks for a floor on the top -- and the climb's end
 * handler sets the body on the floor pick (`FUN_00589aa0` D:L446582-446648: `+0x2e4`, copied from `+0x404` each climb
 * tick, D:L466784; the port's `Traversal.climbSettle`). `topFloor` stays the port's end target for the clip's track. The
 * census (`traversal.parity.test.ts` "NU-1c B12"): of the class-4 faces in the table, the gate refused 2 of MP2's 294, 10
 * of MP6's 59 and none of MP72's 10 (the fixtures), and on the served maps 1 of MP51's 13, MP62's 1 of 1, 1 of MP64's 7 and
 * none of MP71's 21 (NU-1c step 1's survey). *Was* (`'gated'`): a floor within 1.5 of the top, 4 past the edge, or no
 * plan. Owed: a capture at one of those faces (MP62's `worldmodel/climbers`, its floor 1.68 over the polygon's top).
 */
export const CLIMB_TOP_FLOOR_READING = 'dropped' as 'gated' | 'dropped';

/**
 * The plan a press would run from the feet at (x, y, z) facing (fx, fz) against a kept contact, or null: the facing and
 * the direction within 0.3 (`FUN_005b2620`), the height's class for the polygon's appflags, the target on the cut at the
 * hit's height (`FUN_005b3a60`). No floor is asked of the top (`CLIMB_TOP_FLOOR_READING`; was: the probe's floor at the
 * top within 1.5, except for a climb over). LATER 111: no plan when the column has no top (`FUN_002dbfb0` returning 0,
 * D:L468371-468373) or the cut has fewer than two crossings (`FUN_002dc090`, D:L468423-468425) -- [named departures:
 * with no top the original still offers a class 1, 3 or 5 face (`FUN_005b3ce0` offers them outright) and refuses the
 * press; with a top and a cut under two crossings it offers every class -- class 4 too, by the top alone (h <= 5, or
 * 10 < h <= 32; D:L469252-469285 call `FUN_002dbfb0`, never `FUN_002dc090`) -- and refuses the press; the port offers
 * nothing in either. The degenerate cut is almost unreachable with the port's hits: a walk's or a ray's hit lies on the
 * polygon strictly between its lowest and highest points at that column, where the cut has its two crossings.]
 */
export function planClimb(grid: Grid, c: ClimbContact, x: number, y: number, z: number, fx: number, fz: number): ClimbPlan | null {
  if (!Number.isFinite(c.top) || !c.edge) return null;
  if (-(fx * c.nx + fz * c.nz) < CLIMB_FACING) return null;
  const dx = x - c.x, dz = z - c.z, dl = Math.hypot(dx, dz);
  if (dl > 1e-6 && (dx * c.nx + dz * c.nz) / dl < CLIMB_FACING) return null;
  const h = c.top + footStepOffset(c.poly.material) - y;
  const cls = climbClass(h, c.app);
  if (!cls) return null;
  // The target (`FUN_005b3a60`, D:L469016-469080) on the cut's two crossings (`FUN_002dc090`, LATER 111): the hit
  // itself when both are 3 or more away in xz; 3 in from the one under 3 away; the midpoint when both are, and always
  // for appflags 1 (research 86 s3.3). Its y the column's top (`FUN_005b1a10` D:L467887). *Was:* the contact point on
  // the top edge clamped 3 from its ends, the midpoint on an edge 6 or shorter.
  const [ax, az, bx, bz] = c.edge;
  const len = Math.hypot(bx - ax, bz - az);
  const d0 = Math.hypot(ax - c.x, az - c.z), d1 = Math.hypot(bx - c.x, bz - c.z);
  let tx = (ax + bx) / 2, tz = (az + bz) / 2;
  if (c.app !== 1 && len > 1e-9) {
    const ux = (bx - ax) / len, uz = (bz - az) / len;
    if (d0 >= EDGE_END && d1 >= EDGE_END) { tx = c.x; tz = c.z; }
    else if (d0 < EDGE_END && d1 >= EDGE_END) { tx = ax + ux * EDGE_END; tz = az + uz * EDGE_END; }
    else if (d0 >= EDGE_END && d1 < EDGE_END) { tx = bx - ux * EDGE_END; tz = bz - uz * EDGE_END; }
  }
  const target: [number, number, number] = [tx, c.top, tz];
  if (CLIMB_TOP_FLOOR_READING === 'gated' && cls.kind !== 'over' && topFloor(grid, target, c) === null) return null;
  const yaw = (Math.atan2(c.nx, c.nz) * 180) / Math.PI;
  return { ...cls, h, target, yaw, automatic: c.app === 4 && h > 5 && h <= 10, contact: c };
}

/** How far past the edge the top's floor is looked for, and how near the top it must be. */
const TOP_IN = 4, TOP_TOLERANCE = 1.5;

/**
 * The floor on top, `TOP_IN` past the edge: the probe's hit within `TOP_TOLERANCE` of the top, or null -- the port's end
 * target for a climb's track (`./traversal`), no gate on the offer (`CLIMB_TOP_FLOOR_READING`).
 */
export function topFloor(grid: Grid, target: readonly number[], c: ClimbContact, past = TOP_IN): number | null {
  const x = target[0]! - c.nx * past, z = target[2]! - c.nz * past;
  let best: number | null = null;
  for (const hit of probeGround(grid, x, z)) if (Math.abs(hit.y - c.top) <= TOP_TOLERANCE && (best === null || Math.abs(hit.y - c.top) < Math.abs(best - c.top))) best = hit.y;
  return best;
}

/** The highest floor at (x, z) at or under `y` + `above`, or null: where a climb over lands. */
export function floorUnder(grid: Grid, x: number, y: number, z: number, above = 1): number | null {
  let best: number | null = null;
  for (const hit of probeGround(grid, x, z)) if (hit.y <= y + above && (best === null || hit.y > best)) best = hit.y;
  return best;
}
