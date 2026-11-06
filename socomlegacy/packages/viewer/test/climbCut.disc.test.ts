// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { polygonNormal, type WorldPoly } from '@s2u/scene';
import { simMapFromBytes } from '../src/simMap';
import { groundPolygons } from '../src/mover';
import { CLIMBABLE, crossSection, moveHit } from '../src/climb';

/**
 * LATER 147 (research 313 section 8.11; reading, pending review): a climb on a non-convex cut. The original keeps every
 * crossing of the cut (`FUN_002dd2b0` D:L180803-180884) and places the target on the first two (`FUN_005b3a60`
 * D:L469038-469077), as `crossSection` / `ClimbContact.edge` do; the column keeps every edge that spans it
 * (`FUN_002dd4d0` D:L180890-180955), as `columnTop` does. Its buffers are fixed. The push's cut holds two crossings
 * (`FUN_005b2620`'s `auStack_60[32]`, D:L468309), the top lying after it, so a 4th crossing's x overwrites the top's y
 * (D:L468431, D:L468504 -> D:L467887): a known difference no face on the disc reaches, no constant -- (a) below. The
 * column holds four points (`FUN_002dd4d0` sp+0x90 in a 192-byte frame); the fifth slot is `FUN_002dbfb0`'s sp+0, where
 * it saved its caller's `s0` (0x2dbfc4, restored 0x2dc07c), and in the push `s0` holds the contact's appflags class
 * across the column call (0x5b27e0, the call 0x5b2818, the class switch 0x5b2830-0x5b2abc): a wall whose column writes
 * the fifth slot is pushed as the class in the low byte of that point's x bits. The press pushes any stored contact faced
 * at 0.3 (`FUN_005b4b40` D:L469641-469662), so it is REACHABLE: LATER 156 (read only), not a difference no map reaches.
 * The slot is written by a fifth kept edge, or by `FUN_002dd690`'s uncounted end-point write (D:L181005-181011,
 * D:L181022-181028: an edge with no length in xz writes its start, uncounted) after four kept.
 *
 * Over the disc's 34 maps, each polygon in its collider's own frame (`WorldPoly.frame`, as `FUN_002dc090` /
 * `FUN_002dbfb0` take them): (a) no climb face (appflags 1, 3, 4, 5) and no ladder (2) that can be a contact -- a wall,
 * the port's `contactOf` test of a horizontal normal of 0.7 or more -- has more than two crossings at any height, its
 * vertices' heights included. The narrowing to walls mirrors the port's 0.7 (the original's facing tests need 0.3, and
 * MP1's `alaska4d_fence01` caps -- appflags 5, level in their frame, four crossings at their own height by f32 rounding
 * -- have a horizontal normal of about 0): this pin's first disc run was RED on those four caps before (a) was narrowed.
 * (b) A snapshot of the walls `moveHit` keeps (the move solver's hits, so the press's contacts) whose column writes the
 * fifth slot at some hit on the face, counted exactly: every cell of the arrangement of the strict test's lines
 * (along = 0, rest = 0 for each edge, carried into the face's plane) and the face's edges, one point in each cell inside
 * the face. `wide`: a fifth kept edge; `endWrite`: four kept, then an uncounted end write. It pins today's facts: no RED.
 * (b) is the PORT's computation -- its carried-in f64 points, its frame's inverse -- not the original's exposure: the
 * original's f32 points over the archive may keep fewer edges (LATER 156's read, which owns the original's set).
 * Off the dev disc (`SOCOM_DISC`; skipped -- and said so -- without it).
 */

const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : '';
const RUN = DISC ? join(DISC, 'RUN') : '';
const MAPS = RUN && existsSync(RUN) ? readdirSync(RUN).filter((f) => /\.ZDB$/i.test(f)).map((f) => f.replace(/\.ZDB$/i, '')).sort() : [];
const HAVE_DISC = MAPS.length === 34;
/** `contactOf`'s wall: a contact's polygon has a horizontal normal of 0.7 or more. */
const WALL = 0.7;

type P3 = [number, number, number];
/** `FUN_00308160`'s inverse and `FUN_003085c0`: a world point into the collider's frame (as `climb.ts` `intoFrame`). */
function intoFrame(m: Float32Array, x: number, y: number, z: number): P3 {
  const q = 1 / (m[0]! * m[0]! + m[1]! * m[1]! + m[2]! * m[2]!);
  const dx = x - m[12]!, dy = y - m[13]!, dz = z - m[14]!;
  return [(dx * m[0]! + dy * m[1]! + dz * m[2]!) * q, (dx * m[4]! + dy * m[5]! + dz * m[6]!) * q, (dx * m[8]! + dy * m[9]! + dz * m[10]!) * q];
}
function local(p: WorldPoly): Float32Array {
  if (!p.frame) return p.points;
  const out = new Float32Array(p.points.length);
  for (let i = 0; i < p.points.length; i += 3) out.set(intoFrame(p.frame, p.points[i]!, p.points[i + 1]!, p.points[i + 2]!), i);
  return out;
}
/** The most crossings `crossSection` (`FUN_002dd2b0`) finds at any height: at each vertex's height and between them. */
function maxCrossings(L: Float32Array): number {
  const ys = [...new Set(Array.from({ length: L.length / 3 }, (_, i) => L[i * 3 + 1]!))].sort((a, b) => a - b);
  let max = 0;
  ys.forEach((y, i) => {
    max = Math.max(max, crossSection(L, y).length);
    if (i + 1 < ys.length) max = Math.max(max, crossSection(L, (y + ys[i + 1]!) / 2).length);
  });
  return max;
}
/**
 * `FUN_002dd4d0` over `FUN_002dd690` at (x, z), its slots kept: the edges kept, and whether the fifth slot is written --
 * by a fifth kept edge, or by an end write (the projection within 1e-5 at or before an end, D:L181005-181011,
 * D:L181022-181028) after four kept.
 */
function column(L: Float32Array, x: number, z: number): { kept: number; fifth: boolean } {
  const n = L.length / 3;
  let kept = 0, fifth = false;
  for (let i = 0, prev = n - 1; i < n; prev = i++) {
    const ax = L[prev * 3]!, az = L[prev * 3 + 2]!, bx = L[i * 3]!, bz = L[i * 3 + 2]!, dx = bx - ax, dz = bz - az;
    const along = dz * (z - az) + dx * (x - ax);
    if (along < -1e-5) continue;
    const rest = dz * (bz - z) + dx * (bx - x);
    if (along > 0 && rest < -1e-5) continue;
    if (kept === 4) fifth = true;                                   // a kept point, or an end written, lands in slot 5
    if (along > 0 && rest > 0) kept++;
  }
  return { kept, fifth };
}
/** One point in every cell of the strict test's lines and the face's edges, inside the face, in the face's plane. */
function cellPoints(L: Float32Array): [number, number][] {
  const n = L.length / 3, N = polygonNormal(L);
  if (!N) return [];
  const P0 = [L[0]!, L[1]!, L[2]!], ul = Math.hypot(L[3]! - P0[0]!, L[4]! - P0[1]!, L[5]! - P0[2]!);
  const U = [(L[3]! - P0[0]!) / ul, (L[4]! - P0[1]!) / ul, (L[5]! - P0[2]!) / ul];
  const V = [N[1] * U[2]! - N[2] * U[1]!, N[2] * U[0]! - N[0] * U[2]!, N[0] * U[1]! - N[1] * U[0]!];
  const q = Array.from({ length: n }, (_, i) => {
    const d = [L[i * 3]! - P0[0]!, L[i * 3 + 1]! - P0[1]!, L[i * 3 + 2]! - P0[2]!];
    return [d[0]! * U[0]! + d[1]! * U[1]! + d[2]! * U[2]!, d[0]! * V[0]! + d[1]! * V[1]! + d[2]! * V[2]!] as [number, number];
  });
  const scale = Math.max(1, ...q.flat().map(Math.abs));
  const lines: P3[] = [];
  const add = (a: number, b: number, c: number) => { const m = Math.hypot(a, b); if (m > 1e-9) lines.push([a / m, b / m, c / m]); };
  for (let i = 0, prev = n - 1; i < n; prev = i++) {
    const ax = L[prev * 3]!, az = L[prev * 3 + 2]!, dx = L[i * 3]! - ax, dz = L[i * 3 + 2]! - az, dd = dx * dx + dz * dz;
    if (dd > 0) {
      const a = dx * U[0]! + dz * U[2]!, b = dx * V[0]! + dz * V[2]!, c = dx * (P0[0]! - ax) + dz * (P0[2]! - az);
      add(a, b, c); add(a, b, c - dd);                              // along = 0, rest = 0
    }
    const [pu, pv] = q[prev]!, [cu, cv] = q[i]!;
    add(cv - pv, pu - cu, -((cv - pv) * pu + (pu - cu) * pv));      // the face's edge
  }
  const inside = (u: number, v: number) => {
    let w = false;
    for (let i = 0, j = n - 1; i < n; j = i++) { const [xi, yi] = q[i]!, [xj, yj] = q[j]!; if ((yi > v) !== (yj > v) && u < ((xj - xi) * (v - yi)) / (yj - yi) + xi) w = !w; }
    return w;
  };
  const out: [number, number][] = [], eps = 1e-4 * scale;
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    const [a1, b1, c1] = lines[i]!, [a2, b2, c2] = lines[j]!, det = a1 * b2 - a2 * b1;
    if (Math.abs(det) < 1e-12) continue;
    const u = (b1 * c2 - b2 * c1) / det, v = (a2 * c1 - a1 * c2) / det;
    const angles = lines.filter(([a, b, c]) => Math.abs(a * u + b * v + c) < 1e-7 * scale).flatMap(([a, b]) => [Math.atan2(a, -b), Math.atan2(a, -b) + Math.PI]).sort((x, y) => x - y);
    angles.forEach((t, k) => {
      const m = (t + (k + 1 < angles.length ? angles[k + 1]! : angles[0]! + 2 * Math.PI)) / 2, pu = u + eps * Math.cos(m), pv = v + eps * Math.sin(m);
      if (inside(pu, pv)) out.push([P0[0]! + pu * U[0]! + pv * V[0]!, P0[2]! + pu * U[2]! + pv * V[2]!]);
    });
  }
  return out;
}
const isWall = (p: WorldPoly) => { const n = polygonNormal(p.points); return !!n && Math.hypot(n[0], n[2]) >= WALL; };

describe.skipIf(!HAVE_DISC)(`movement.climb: LATER 147 -- the original's fixed cut and column buffers against the disc's 34 maps${HAVE_DISC ? '' : ' (no dev disc: SOCOM_DISC -- skipped)'}`, () => {
  it('no climb face or ladder has over two crossings; the walls whose column writes the fifth slot, as a snapshot', () => {
    const over: string[] = [], level: string[] = [], wide: string[] = [], endWrite: string[] = [];
    let faces = 0, ladders = 0, wideWalls = 0;
    for (const stem of MAPS) {
      const path = `RUN/${stem}.ZDB`;
      for (const p of groundPolygons(simMapFromBytes(new Uint8Array(readFileSync(join(DISC, path))), path).ground)) {
        const app = p.appflags ?? 0, wall = isWall(p), L = local(p);
        if (CLIMBABLE.has(app) || app === 2) {
          const cross = maxCrossings(L);
          if (wall) { if (app === 2) ladders++; else faces++; }
          if (cross > 2) (wall ? over : level).push(`${stem} ${p.path} app ${app}: ${cross}`);
        }
        if (!wall || L.length / 3 < 5) continue;                    // the fifth slot needs five edges
        let kept = 0, fifth = false;
        for (const [x, z] of cellPoints(L)) { const c = column(L, x, z); kept = Math.max(kept, c.kept); fifth ||= c.fifth; }
        if (kept > 4) wideWalls++;
        if (!fifth || !moveHit(p)) continue;
        (kept > 4 ? wide : endWrite).push(`${stem} ${p.path}`);
      }
    }
    expect(over).toEqual([]);
    // R4B-09 (research 383; OT.R97): 1450 as read, 1441 with r0004's MP8 rewrite of `land43/climber1` (r4 0x2d9884, appflags 4
    // -> 0): its nine faces are no longer climbed.
    expect({ faces, ladders, level, wideWalls, wide: wide.sort(), endWrite: endWrite.sort() }).toMatchInlineSnapshot(`
      {
        "endWrite": [
          "M73 worldmodel/g618",
          "MP5 worldmodel/maingate/di_bridge1_2",
          "MP51 worldmodel/access2=access2/good_parts/di_good",
          "MP6 worldmodel/mytruck/truck_canopy=truck_canopy/util_truck_body/tanks_left",
          "MP6 worldmodel/mytruck/truck_canopy=truck_canopy/util_truck_body/tanks_right",
          "MP6 worldmodel/tank_1",
          "MP72 worldmodel/sign_noenter",
          "MP72 worldmodel/sign_noenter=sign_noenter",
          "MP73 worldmodel/aagun/aagun_zpu4=aagun_zpu4/good_parts/di_wheels",
          "MP73 worldmodel/aagun/aagun_zpu4=aagun_zpu4/good_parts/di_wheels",
          "MP73 worldmodel/aagun/aagun_zpu4=aagun_zpu4/good_parts/di_wheels",
        ],
        "faces": 1441,
        "ladders": 158,
        "level": [
          "MP1 worldmodel/alaska4d_fence01 app 5: 4",
          "MP1 worldmodel/alaska4d_fence01=alaska4d_fence01 app 5: 4",
          "MP1 worldmodel/alaska4d_fence01 app 5: 4",
          "MP1 worldmodel/alaska4d_fence01=alaska4d_fence01 app 5: 4",
        ],
        "wide": [
          "M53 worldmodel/door01/m53_doorcellar1=m53_doorcellar1/di",
          "M53 worldmodel/door02/m53_doorcellar1=m53_doorcellar1/di",
          "M53 worldmodel/door03/m53_doorcellar1=m53_doorcellar1/di",
          "M53 worldmodel/door04/m53_doorcellar1=m53_doorcellar1/di",
          "M53 worldmodel/door06/m53_doorcellar1=m53_doorcellar1/di",
          "M53 worldmodel/door07/m53_doorcellar1=m53_doorcellar1/di",
          "M53 worldmodel/door08/m53_doorcellar1=m53_doorcellar1/di",
          "M53 worldmodel/door09/m53_doorcellar1=m53_doorcellar1/di",
          "M53 worldmodel/door10/m53_doorcellar1=m53_doorcellar1/di",
          "M53 worldmodel/ext3_wc5",
          "M53 worldmodel/reg28",
          "M53 worldmodel/tower_ruin_2",
          "M53 worldmodel/tower_ruin_2",
          "M53 worldmodel/tower_ruin_3",
          "M53 worldmodel/tower_ruin_3",
          "M71 worldmodel/g24130/hallway_blocked=hallway_blocked/good_parts/di_good",
          "M71 worldmodel/g24130/hallway_blocked=hallway_blocked/good_parts/di_good",
          "M71 worldmodel/g835/g25472",
          "M71 worldmodel/hallway_blocked=hallway_blocked/good_parts/di_good",
          "M71 worldmodel/hallway_blocked=hallway_blocked/good_parts/di_good",
          "M72 worldmodel/g362/g3866",
          "M72 worldmodel/g362/g3866",
          "M72 worldmodel/g800",
          "M72 worldmodel/g903_1",
          "M72 worldmodel/g936_1",
          "M72 worldmodel/g942",
          "M72 worldmodel/g944",
          "M72 worldmodel/g944",
          "M73 worldmodel/ballroom_wall/ballroom_breach=ballroom_breach/ballroom_down/g44",
          "M73 worldmodel/g734",
          "M73 worldmodel/g747",
          "MP1 worldmodel/pipe/dicamonly",
          "MP1 worldmodel/pipe/dipip",
          "MP1 worldmodel/pipe/dipip",
          "MP53 worldmodel/bunker1",
          "MP53 worldmodel/bunker3",
          "MP61 worldmodel/g1902/di_ext01",
          "MP61 worldmodel/g1914/di26",
          "MP7 worldmodel/dishnetwork/seal_comm_dish=seal_comm_dish/dish_di",
          "MP71 worldmodel/building_really_small",
          "MP72 worldmodel/basket_open_up",
          "MP72 worldmodel/basket_open_up=basket_open_up",
          "MP82 worldmodel/wc",
          "MP82 worldmodel/wc",
          "MP82 worldmodel/wc",
          "MP82 worldmodel/wc",
          "MP82 worldmodel/wc",
          "MP82 worldmodel/wc",
          "MP82 worldmodel/wc",
          "MP82 worldmodel/wc",
          "MP82 worldmodel/wc",
          "MP82 worldmodel/wc",
          "MP82 worldmodel/wc",
          "MP82 worldmodel/wc",
          "MP82 worldmodel/wc",
          "MP82 worldmodel/wc",
          "MP82 worldmodel/wc",
          "MP82 worldmodel/wc",
          "MP82 worldmodel/wc",
          "MP82 worldmodel/wc",
          "MP82 worldmodel/wc",
          "MP82 worldmodel/wc",
          "MP82 worldmodel/wc",
          "MP82 worldmodel/wc",
          "MP82 worldmodel/wc",
          "MP82 worldmodel/wc",
        ],
        "wideWalls": 78,
      }
    `);
  }, 300_000);
});
