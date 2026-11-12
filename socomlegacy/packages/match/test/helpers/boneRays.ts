import type { Skeleton } from '@s2u/scene';
import { PART } from '../../../viewer/src/net/damage';

/**
 * BONE-BOXES' test geometry (research 398 s0, s1, s7; the rays the room is asked to judge), the test's OWN transcription,
 * written apart from the source's (`../../../viewer/src/net/hitVolumes`) so the two are compared, not one checked
 * against itself: each bone of the skeleton from `skel_root` down a box (its `nparams` bbox in the bone's frame,
 * research 78 s3; `spinehi`'s maximum x held to 3.01, `FUN_0058b960` D:L447580-447591), posed by the skeleton's world
 * matrices and placed at the body's feet and yaw (`play.ts` `actorToWorld`); a line's records by the slab rule -- one at
 * the entry of each box the line starts outside of, none for a box it starts inside -- nearest first; and the damage rule
 * of research 398 s0 (rule 4) over them.
 */

export type V3 = [number, number, number];
/** `FUN_005abbc0`'s bones (D:L464740-464766); every other boxed bone is -1, no damage. */
const DAMAGE: Readonly<Record<string, number>> = {
  head: PART.HEAD, neck: PART.HEAD, spinehi: PART.BODY, spinelo: PART.BODY, hips: PART.BODY,
  rbicep: PART.RARM, rforearm: PART.RARM, lbicep: PART.LARM, lforearm: PART.LARM,
  rthigh: PART.RLEG, rcalf: PART.RLEG, lthigh: PART.LLEG, lcalf: PART.LLEG,
};

/** The next joint of a BODY bone's chain (v0.4.18's trunk capsules ran `spinelo` -> `spinehi` -> `neck`); `hips` none. */
const NEXT_JOINT: Readonly<Record<string, string>> = { spinelo: 'spinehi', spinehi: 'neck' };
/** `SPINELO_BAND_PLACEHOLDER`'s 2.0, written here apart from the source (v0.4.18's spinelo capsule radius). */
const BAND_HALF = 2.0;

export interface TestBox { bone: string; part: number; lo: V3; hi: V3; inv: number[]; centre: V3 }
export interface TestRecord { bone: string; part: number; t: number }

const rot = (yaw: number, v: V3): V3 => {
  const r = (yaw * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
};
/** A body-frame point to the world (`play.ts` `actorToWorld`). */
export const toWorldPoint = (feet: V3, yaw: number, v: V3): V3 => { const r = rot(yaw, v); return [feet[0] + r[0], feet[1] + r[1], feet[2] + r[2]]; };
/** A body-frame direction to the world. */
export const toWorldDir = (yaw: number, v: V3): V3 => rot(yaw, v);

/** The posed boxes of `sk` (its current world matrices) at `feet` and `yaw`, world-placed. */
export function testBoxes(sk: Skeleton, feet: V3, yaw: number): TestBox[] {
  const root = sk.indexOf('skel_root');
  const out: TestBox[] = [];
  for (const p of sk.parts) {
    let k = p.index;
    while (k >= 0 && k !== root) k = sk.parts[k]!.parent;
    if (k !== root) continue;
    const w = sk.world[p.index]!;
    // world = Y(W p): the 3x3 columns and the origin
    const col = (i: number): V3 => toWorldDir(yaw, [w[i]!, w[i + 1]!, w[i + 2]!]);
    const X = col(0), Yc = col(4), Z = col(8), T = toWorldPoint(feet, yaw, [w[12]!, w[13]!, w[14]!]);
    const m = [X[0], Yc[0], Z[0], X[1], Yc[1], Z[1], X[2], Yc[2], Z[2]];   // row-major 3x3
    const det = m[0]! * (m[4]! * m[8]! - m[5]! * m[7]!) - m[1]! * (m[3]! * m[8]! - m[5]! * m[6]!) + m[2]! * (m[3]! * m[7]! - m[4]! * m[6]!);
    const inv = [
      (m[4]! * m[8]! - m[5]! * m[7]!) / det, (m[2]! * m[7]! - m[1]! * m[8]!) / det, (m[1]! * m[5]! - m[2]! * m[4]!) / det,
      (m[5]! * m[6]! - m[3]! * m[8]!) / det, (m[0]! * m[8]! - m[2]! * m[6]!) / det, (m[2]! * m[3]! - m[0]! * m[5]!) / det,
      (m[3]! * m[7]! - m[4]! * m[6]!) / det, (m[1]! * m[6]! - m[0]! * m[7]!) / det, (m[0]! * m[4]! - m[1]! * m[3]!) / det,
      T[0], T[1], T[2],
    ];
    const b = p.bbox;
    const hiX = p.name === 'spinehi' ? Math.min(b[3]!, Math.fround(3.01)) : b[3]!;
    const lo: V3 = [b[0]!, b[1]!, b[2]!], hi: V3 = [hiX, b[4]!, b[5]!];
    // SPINELO-FALLBACK (`SPINELO_BAND_PLACEHOLDER`, research 217 s3.6b; a placeholder for an unmeasured outcome), this
    // file's own transcription of the rule: a BODY damage bone whose bbox is all six zero and which has its next joint
    // among its children gets a box in its own frame -- along the axis where that joint's BIND translation is largest
    // (the first on a tie), 0 to the translation; across the other two, the span of 0 and the translation grown by 2.0
    // each way. On the SEAL, `spinelo` (next joint `spinehi`).
    const next = NEXT_JOINT[p.name];
    const child = next ? sk.parts.find((q) => q.name === next && q.parent === p.index) : undefined;
    if (DAMAGE[p.name] === PART.BODY && child && [...b].every((v) => v === 0)) {
      const tr: V3 = [child.bindLocal[12]!, child.bindLocal[13]!, child.bindLocal[14]!];
      let axis = 0;
      if (Math.abs(tr[1]) > Math.abs(tr[axis]!)) axis = 1;
      if (Math.abs(tr[2]) > Math.abs(tr[axis]!)) axis = 2;
      for (let a = 0; a < 3; a++) {
        const grow = a === axis ? 0 : BAND_HALF;
        lo[a] = Math.fround(Math.min(0, tr[a]!) - grow);
        hi[a] = Math.fround(Math.max(0, tr[a]!) + grow);
      }
    }
    const mid: V3 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    const centre: V3 = [
      X[0] * mid[0] + Yc[0] * mid[1] + Z[0] * mid[2] + T[0],
      X[1] * mid[0] + Yc[1] * mid[1] + Z[1] * mid[2] + T[1],
      X[2] * mid[0] + Yc[2] * mid[1] + Z[2] * mid[2] + T[2],
    ];
    out.push({ bone: p.name, part: DAMAGE[p.name] ?? -1, lo, hi, inv, centre });
  }
  return out;
}

/** A world point or direction into a box's frame. */
function local(b: TestBox, v: V3, point: boolean): V3 {
  const x = point ? v[0] - b.inv[9]! : v[0], y = point ? v[1] - b.inv[10]! : v[1], z = point ? v[2] - b.inv[11]! : v[2];
  const i = b.inv;
  return [i[0]! * x + i[1]! * y + i[2]! * z, i[3]! * x + i[4]! * y + i[5]! * z, i[6]! * x + i[7]! * y + i[8]! * z];
}

/** Every box the line from `o` along `d` enters within `reach`, at its entry, nearest first (slabs; none from inside). */
export function testRecords(o: V3, d: V3, reach: number, boxes: readonly TestBox[]): TestRecord[] {
  const out: TestRecord[] = [];
  for (const b of boxes) {
    if (!(b.lo[0] <= b.hi[0] && b.lo[1] <= b.hi[1] && b.lo[2] <= b.hi[2])) continue;   // an empty box
    const p = local(b, o, true), v = local(b, d, false);
    if (p.every((x, k) => x >= b.lo[k]! && x <= b.hi[k]!)) continue;                  // starts inside: no record
    let enter = -Infinity, exit = Infinity, ok = true;
    for (let k = 0; k < 3 && ok; k++) {
      if (v[k] === 0) { if (p[k]! < b.lo[k]! || p[k]! > b.hi[k]!) ok = false; continue; }
      const t1 = (b.lo[k]! - p[k]!) / v[k]!, t2 = (b.hi[k]! - p[k]!) / v[k]!;
      enter = Math.max(enter, Math.min(t1, t2));
      exit = Math.min(exit, Math.max(t1, t2));
    }
    if (ok && enter <= exit && enter >= 0 && enter <= reach) out.push({ bone: b.bone, part: b.part, t: enter });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Research 398 s0, rule 4, on one body's records: a damage bone applies until a head or trunk hit remembers the round. */
export function testApplications(records: readonly TestRecord[]): number[] {
  const out: number[] = [];
  let last = -Infinity;
  for (const r of records) {
    if (!(r.t > last)) continue;                                   // the walk's strict "farther than the last" (D:L319990)
    last = r.t;
    if (r.part < 0) continue;
    out.push(r.part);
    if (r.part === PART.HEAD || r.part === PART.BODY) break;
  }
  return out;
}

export interface TestRay { o: V3; d: V3; records: TestRecord[]; apps: number[]; family: string }

/** The line's directions searched (body frame), each named; 26 (every axis and diagonal) in a fixed order, `first` first. */
function directions(first: readonly string[]): { name: string; d: V3 }[] {
  const all: { name: string; d: V3 }[] = [];
  for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) {
    if (!x && !y && !z) continue;
    const l = Math.hypot(x, y, z);
    all.push({ name: `${x},${y},${z}`, d: [x / l, y / l, z / l] });
  }
  return [...first.map((n) => all.find((a) => a.name === n)!), ...all.filter((a) => !first.includes(a.name))];
}

/**
 * The first line (body-frame directions `first` tried first, then the rest) through a grid of points 0.25 apart on the
 * plane across it through (0, `centreY`, 0), 40 back, whose records satisfy `want` -- and whose four neighbours 0.15
 * across do too, with the same applications (a margin against the poses' last-bit differences). World rays.
 */
export function findRay(boxes: readonly TestBox[], feet: V3, yaw: number, want: (r: TestRecord[], apps: number[]) => boolean,
  first: readonly string[] = [], centreY = 10, half = 12): TestRay | null {
  for (const { name, d } of directions(first)) {
    const up: V3 = Math.abs(d[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0];
    const u0 = [d[1] * up[2] - d[2] * up[1], d[2] * up[0] - d[0] * up[2], d[0] * up[1] - d[1] * up[0]];
    const ul = Math.hypot(...u0), U: V3 = [u0[0]! / ul, u0[1]! / ul, u0[2]! / ul];
    const V: V3 = [d[1] * U[2] - d[2] * U[1], d[2] * U[0] - d[0] * U[2], d[0] * U[1] - d[1] * U[0]];
    const dw = toWorldDir(yaw, d);
    const at = (u: number, v: number): { o: V3; records: TestRecord[]; apps: number[] } => {
      const ob: V3 = [U[0] * u + V[0] * v - d[0] * 40, centreY + U[1] * u + V[1] * v - d[1] * 40, U[2] * u + V[2] * v - d[2] * 40];
      const o = toWorldPoint(feet, yaw, ob);
      const records = testRecords(o, dw, 200, boxes);
      return { o, records, apps: testApplications(records) };
    };
    for (let u = -half; u <= half; u += 0.25) {
      for (let v = -half; v <= half; v += 0.25) {
        const c = at(u, v);
        if (!want(c.records, c.apps)) continue;
        const same = [[0.15, 0], [-0.15, 0], [0, 0.15], [0, -0.15]].every(([du, dv]) => {
          const n = at(u + du!, v + dv!);
          return want(n.records, n.apps) && n.apps.join() === c.apps.join();
        });
        if (same) return { o: c.o, d: dw, records: c.records, apps: c.apps, family: `${name} at (${u}, ${v})` };
      }
    }
  }
  return null;
}
