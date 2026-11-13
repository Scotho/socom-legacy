import { describe, expect, it } from "vitest";
import {
  checkCreatorRecord,
  layoutOfRecord,
  pieceMatrixError,
  recordOfLayout,
  RECORD_SCALE_DENOMINATOR,
  RECORD_SCALE_MAX_ADAPTATION,
  RECORD_SCALE_MIN_ADAPTATION,
  type CreatorLayoutRecord,
  type Layout,
  type PoseRow,
} from "../src/index.js";

/**
 * FX wave 1 fold (the fresh review's finding 4; product track, a browser adaptation with no original -- the forge has no
 * original and a standard match reads neither): FX-1's record (`recordOfLayout`, `layoutOfRecord`, the `poses` rows) and
 * FX-2's piece check (`pieceMatrixError`, the lobby's create) agree. Every pose the record can write reads back to a
 * matrix the check admits, and a matrix the check admits at its scale bounds stays within them through the record. Every
 * value here is the test's own authored choice; no disc data.
 */

const rad = (d: number): number => (d * Math.PI) / 180;
type M3 = [number, number, number, number, number, number, number, number, number];
/** The row-major product of two 3x3 matrices (as `layout.test.ts`'s `mul3`). */
function mul3(a: M3, b: M3): M3 {
  const out: M3 = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      let s = 0;
      for (let k = 0; k < 3; k++) s += a[r * 3 + k]! * b[k * 3 + c]!;
      out[r * 3 + c] = s;
    }
  }
  return out;
}
/**
 * A piece's column-major 4x4 at (x, y, z), built here by multiplication and not by the code under test (as
 * `layout.test.ts`'s `posed`): the turn R_y(yaw) * R_x(pitch) * R_z(roll), three's `YXZ`, then the scale per axis.
 */
function posed(x: number, y: number, z: number, yaw: number, pitch: number, roll: number, sx = 1, sy = 1, sz = 1): number[] {
  const cy = Math.cos(rad(yaw)), sny = Math.sin(rad(yaw));
  const cp = Math.cos(rad(pitch)), snp = Math.sin(rad(pitch));
  const cr = Math.cos(rad(roll)), snr = Math.sin(rad(roll));
  const ry: M3 = [cy, 0, sny, 0, 1, 0, -sny, 0, cy];
  const rx: M3 = [1, 0, 0, 0, cp, -snp, 0, snp, cp];
  const rz: M3 = [cr, -snr, 0, snr, cr, 0, 0, 0, 1];
  const r = mul3(mul3(ry, rx), rz);
  return [r[0] * sx, r[3] * sx, r[6] * sx, 0, r[1] * sy, r[4] * sy, r[7] * sy, 0, r[2] * sz, r[5] * sz, r[8] * sz, 0, x, y, z, 1];
}
const M = (x: number, y: number, z: number): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
const yardOf = (pieces: Layout["pieces"]): Layout => ({ forge: 1, base: { kind: "map", archive: "MP2" }, pieces, spawns: [{ team: "A", p: [1, 0, 2], yaw: 0 }] });
/** The length of each of a matrix's three axis columns. */
const axisLengths = (m: readonly number[]): number[] => [0, 4, 8].map((c) => Math.hypot(m[c]!, m[c + 1]!, m[c + 2]!));
/** Whether a pose row's three scales are within the record's bounds and on its lattice. */
const scalesInRange = (row: PoseRow): boolean => [row[3], row[4], row[5]].every((s) =>
  s >= RECORD_SCALE_MIN_ADAPTATION && s <= RECORD_SCALE_MAX_ADAPTATION && Math.round(s * RECORD_SCALE_DENOMINATOR) / RECORD_SCALE_DENOMINATOR === s);

/** A small seeded generator (mulberry32), so the random poses are the same at every run; no Math.random. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SCALES = [0.1, 0.11, 1, 3.99, 4] as const;
const PITCHES = [-90, -89, 0, 89, 90] as const;
const ROLLS = [0, 1, 179, 180, 359] as const;
const YAWS = [0, 45, 179, 300] as const;

interface Case { yaw: number; pitch: number; roll: number; sx: number; sy: number; sz: number }
/** The swept cases: every scale on each axis (and so mixed), every pitch, roll and yaw of the lists. */
function sweep(): Case[] {
  const out: Case[] = [];
  for (const sx of SCALES) for (const sy of SCALES) for (const sz of SCALES) {
    for (const pitch of PITCHES) for (const roll of ROLLS) for (const yaw of YAWS) out.push({ yaw, pitch, roll, sx, sy, sz });
  }
  return out;
}
/** 200 poses from the seeded generator: whole degrees, scales on the lattice within the bounds. */
function randomCases(): Case[] {
  const next = seeded(0x5eed);
  const deg = (lo: number, hi: number): number => lo + Math.floor(next() * (hi - lo + 1));
  const scale = (): number => (10 + Math.floor(next() * 391)) / RECORD_SCALE_DENOMINATOR;
  return Array.from({ length: 200 }, (): Case => ({ yaw: deg(0, 359), pitch: deg(-90, 90), roll: deg(0, 359), sx: scale(), sy: scale(), sz: scale() }));
}
const label = (c: Case): string => `yaw ${c.yaw} pitch ${c.pitch} roll ${c.roll} scale ${c.sx},${c.sy},${c.sz}`;

/**
 * One case through the real record: the layout's matrix (built here) to a record (`recordOfLayout`), the record checked
 * (`checkCreatorRecord`), back to a layout (`layoutOfRecord`); the reasons it fails, empty when it passes.
 */
function throughRecord(m: number[]): string[] {
  const r = recordOfLayout(yardOf([{ asset: "MP2:crate", m }]), "Yard");
  const why: string[] = [];
  const check = checkCreatorRecord(r);
  if (check !== null) why.push(`record: ${check}`);
  for (const row of r.poses ?? []) if (!scalesInRange(row)) why.push(`pose scales out of range: ${JSON.stringify(row)}`);
  const back = layoutOfRecord(r).pieces[0]!.m;
  const err = pieceMatrixError(back);
  if (err !== null) why.push(`piece check: ${err}`);
  return why;
}

/**
 * One pose row written straight into a record (not through `recordOfLayout`): the record's own check must pass it (a
 * pose the record can hold), then `layoutOfRecord`'s matrix goes to the piece check. The canonical form is kept as the
 * record asks: no roll at a pitch of 90 or -90, and no row for a piece that needs none.
 */
function poseRowCase(c: Case): PoseRow | null {
  const roll = Math.abs(c.pitch) === 90 ? 0 : c.roll;
  if (c.pitch === 0 && roll === 0 && c.sx === 1 && c.sy === 1 && c.sz === 1) return null;
  return [0, c.pitch, roll, c.sx, c.sy, c.sz];
}
function throughRow(base: CreatorLayoutRecord, c: Case): string[] {
  const row = poseRowCase(c);
  if (!row) return [];
  const r: CreatorLayoutRecord = { ...base, pieces: [[0, 1.5, 2, -3, c.yaw]], poses: [row] };
  const check = checkCreatorRecord(r);
  if (check !== null) return [`record: ${check}`];
  const err = pieceMatrixError(layoutOfRecord(r).pieces[0]!.m);
  return err === null ? [] : [`piece check: ${err}`];
}

describe("FX fold: every pose the record can write passes the lobby piece check", () => {
  const base = recordOfLayout(yardOf([{ asset: "MP2:crate", m: M(0, 0, 0) }]), "Yard");

  it("the sweep: scale 0.1, 0.11, 1, 3.99 and 4 on each axis, pitch -90..90, roll 0..359, several yaws", () => {
    const cases = sweep();
    expect(cases.length).toBe(5 * 5 * 5 * 5 * 5 * 4);
    const failures: string[] = [];
    for (const c of cases) {
      const viaLayout = throughRecord(posed(1.5, 2, -3, c.yaw, c.pitch, c.roll, c.sx, c.sy, c.sz));
      if (viaLayout.length) failures.push(`${label(c)} (via recordOfLayout): ${viaLayout.join("; ")}`);
      const viaRow = throughRow(base, c);
      if (viaRow.length) failures.push(`${label(c)} (as a pose row): ${viaRow.join("; ")}`);
    }
    expect(failures).toEqual([]);
  }, 60_000);

  it("200 seeded random poses (whole degrees, scales on the lattice)", () => {
    const cases = randomCases();
    expect(cases.length).toBe(200);
    // the generator is seeded: the same first case at every run
    expect(randomCases()[0]).toEqual(cases[0]);
    const failures: string[] = [];
    for (const c of cases) {
      const viaLayout = throughRecord(posed(-4, 0.5, 7.2, c.yaw, c.pitch, c.roll, c.sx, c.sy, c.sz));
      if (viaLayout.length) failures.push(`${label(c)} (via recordOfLayout): ${viaLayout.join("; ")}`);
      const viaRow = throughRow(base, c);
      if (viaRow.length) failures.push(`${label(c)} (as a pose row): ${viaRow.join("; ")}`);
    }
    expect(failures).toEqual([]);
  });

  it("a matrix the check admits at the bounds (an exact 0.1 and an exact 4 axis, turned) stays within 0.1..4 through the record", () => {
    const turns: [number, number, number][] = [[0, 0, 0], [30, 15, 45], [300, -40, 200], [90, 90, 0], [10, -90, 0], [179, 89, 359]];
    const scales: [number, number, number][] = [[0.1, 4, 1], [4, 0.1, 4], [0.1, 0.1, 0.1], [4, 4, 4]];
    // and an axis just inside the check's slack (PIECE_SCALE_EPSILON_ADAPTATION is 1e-6 relative)
    const slack: [number, number, number][] = [[0.1 * (1 - 5e-7), 4 * (1 + 5e-7), 1]];
    for (const [yaw, pitch, roll] of turns) {
      for (const [sx, sy, sz] of [...scales, ...slack]) {
        const at = `turn ${yaw},${pitch},${roll} scale ${sx},${sy},${sz}`;
        const m = posed(0, 0, 0, yaw, pitch, roll, sx, sy, sz);
        expect(pieceMatrixError(m), at).toBeNull();
        const r = recordOfLayout(yardOf([{ asset: "MP2:crate", m }]), "Yard");
        expect(checkCreatorRecord(r), at).toBeNull();
        expect(r.poses?.length, at).toBe(1);
        const row = r.poses![0]!;
        expect(scalesInRange(row), `${at}: ${JSON.stringify(row)}`).toBe(true);
        // the bounds are written as the bounds: 0.1 stays 0.1 and 4 stays 4
        expect([row[3], row[4], row[5]], at).toEqual([sx, sy, sz].map((s) => Math.round(s * RECORD_SCALE_DENOMINATOR) / RECORD_SCALE_DENOMINATOR));
        const back = layoutOfRecord(r).pieces[0]!.m;
        expect(pieceMatrixError(back), at).toBeNull();
        for (const length of axisLengths(back)) {
          expect(length, at).toBeGreaterThanOrEqual(RECORD_SCALE_MIN_ADAPTATION * (1 - 1e-12));
          expect(length, at).toBeLessThanOrEqual(RECORD_SCALE_MAX_ADAPTATION * (1 + 1e-12));
        }
      }
    }
  });
});
