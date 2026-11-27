import { describe, expect, it } from "vitest";
import {
  checkCreatorRecord,
  layoutOfRecord,
  readCreatorRecord,
  recordOfLayout,
  RECORD_ANGLE_DENOMINATOR,
  RECORD_VERSION,
  RECORD_VERSION_FINE_ANGLES,
  recordVersionRefusal,
  type Layout,
} from "../src/index.js";

/**
 * FN-4 (the Forge lane's plan `docs/plans/2026-11-14-forge-next.md`, FN.R5: "agreed with your suggestion" -- the record
 * keeps a piece's angles more finely, so a turn typed relative to a parent reads back as typed; a browser adaptation,
 * FG.R2 -- the game has no editor, and no standard match reads a record): record version 4 keeps a PIECE's yaw, pitch and
 * roll on a hundredth of a degree (`RECORD_ANGLE_DENOMINATOR`); version 3 (whole degrees) is still what a layout whose
 * piece angles are all whole writes, byte for byte. Every value here is the test's own authored choice; no disc data.
 * Written, NOT RUN when written (the host rule: nothing runs on the hub); each case says what it expects and why.
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
/** The largest difference between two matrices' elements. */
function farthest(a: readonly number[], b: readonly number[]): number {
  expect(a.length).toBe(b.length);
  return Math.max(...a.map((v, i) => Math.abs(v - b[i]!)));
}
const yardOf = (pieces: Layout["pieces"]): Layout => ({ forge: 1, base: { kind: "map", archive: "MP2" }, pieces, spawns: [{ team: "A", p: [1, 0, 2], yaw: 0 }] });
/** A record of one crate (`yaw` its row's) and one pose row, at `version`, no spawn. */
const oneCrate = (version: number, yaw: number, pose?: number[]): Record<string, unknown> => ({
  schema: "forge-layout", version, name: "Yard", base: "MP2", assets: ["MP2:crate"],
  pieces: [[0, 0, 0, 0, yaw]], ...(pose ? { poses: [pose] } : {}), spawns: [], ids: { pieces: ["p0"], spawns: [] },
});

describe("FN-4: the record's version 4 -- a piece's angles on a hundredth of a degree", () => {
  it("names its lattice and its version: 1/100 of a degree, version 4 beside the whole-degree version 3", () => {
    // RED at the RED commit: neither constant is exported yet (undefined). GREEN from the readers' commit.
    expect(RECORD_ANGLE_DENOMINATOR).toBe(100);
    expect(RECORD_VERSION_FINE_ANGLES).toBe(4);
    expect(RECORD_VERSION).toBe(3);
  });

  it("CONTROL: a version-3 record (a yaw-only piece, a posed and scaled piece, a spawn) is read and written back as the same text", () => {
    // Expected GREEN at the RED commit and after: every angle whole, so the writer keeps version 3 and the text it wrote.
    const text = JSON.stringify({
      schema: "forge-layout", version: 3, name: "Yard", base: "MP2", assets: ["MP2:crate", "MP2:barrel"],
      pieces: [[0, 1, 0, 2, 90], [1, -3.5, 0, 4, 135]], poses: [[1, 15, 30, 2, 1, 0.5]], spawns: [["A", 1, 0, 2, 270]],
      ids: { pieces: ["p0", "p1"], spawns: ["s0"] },
    });
    const read = readCreatorRecord(text).record;
    expect(JSON.stringify(read)).toBe(text);
    const again = recordOfLayout(layoutOfRecord(read), "Yard");
    expect(again.version).toBe(3);
    expect(JSON.stringify(again)).toBe(text);
  });

  it("RED: a piece turned YXZ yaw 58.67, pitch 38.93, roll 27.03 is written as version 4, its angles kept to the hundredth", () => {
    // Expected RED at the RED commit: `poseOf` puts each angle on a whole degree (`wholeDeg`, `Math.round`), so the
    // record is version 3 with yaw 59 and the pose [0, 39, 27, 1, 1, 1]. GREEN from the writer's commit.
    const r = recordOfLayout(yardOf([{ asset: "MP2:crate", m: posed(1.5, 2, -3, 58.67, 38.93, 27.03) }]), "Yard");
    expect(r.version).toBe(4);
    expect(r.pieces).toEqual([[0, 1.5, 2, -3, 58.67]]);
    expect(r.poses).toEqual([[0, 38.93, 27.03, 1, 1, 1]]);
  });

  it("RED: that version-4 record is admitted, read, and written back as the same text; its matrix is the pose's within 1e-9", () => {
    // Expected RED at the RED commit (written as version 3, 59 / 39 / 27, so the matrix is half a degree off). GREEN from
    // the writer's commit: the record's angles are the doubles 58.67, 38.93 and 27.03 themselves (an integer of
    // hundredths divided by 100), so `layoutOfRecord`'s cosines and sines are the test's own, to rounding.
    const m = posed(1.5, 2, -3, 58.67, 38.93, 27.03);
    const r = recordOfLayout(yardOf([{ asset: "MP2:crate", m }]), "Yard");
    expect(checkCreatorRecord(r)).toBeNull();
    const text = JSON.stringify(r);
    const read = readCreatorRecord(text).record;
    expect(JSON.stringify(read)).toBe(text);
    expect(JSON.stringify(recordOfLayout(layoutOfRecord(read), "Yard"))).toBe(text);
    expect(farthest(layoutOfRecord(read).pieces[0]!.m, m)).toBeLessThanOrEqual(1e-9);
  });

  it("RED: checkCreatorRecord takes a version-4 record with a piece yaw of 12.34 and a pose of pitch -45.5, roll 359.99", () => {
    // Expected RED at the RED commit: "not a forge record of version 2 or 3". GREEN from the readers' commit.
    const r = oneCrate(4, 12.34, [0, -45.5, 359.99, 1, 1, 1]);
    expect(checkCreatorRecord(r)).toBeNull();
    expect(readCreatorRecord(JSON.stringify(r)).record).toEqual(r);
  });

  it("refuses, each in its words: a fraction under version 3, an angle off the hundredth, a pitch past 90, a marker's fraction, version 5", () => {
    // CONTROL (green at the RED commit and after): version 3 stays strict -- a piece's yaw a whole degree.
    expect(checkCreatorRecord(oneCrate(3, 12.34))).toBe("piece 0 is not [asset#, x, y, z, yaw]");
    expect(checkCreatorRecord(oneCrate(3, 10, [0, 15.5, 0, 1, 1, 1]))).toBe("pose 0 pitch is not a whole degree in -90..90");
    // RED at the RED commit (every version-4 record refused by its version first); GREEN from the readers' commit.
    expect(checkCreatorRecord(oneCrate(4, 12.345))).toBe("piece 0 is not [asset#, x, y, z, yaw]");
    expect(checkCreatorRecord(oneCrate(4, 360))).toBe("piece 0 is not [asset#, x, y, z, yaw]");
    expect(checkCreatorRecord(oneCrate(4, 10, [0, 90.01, 0, 1, 1, 1]))).toBe("pose 0 pitch is not -90..90 on a lattice of 1/100");
    expect(checkCreatorRecord(oneCrate(4, 10, [0, 15.005, 0, 1, 1, 1]))).toBe("pose 0 pitch is not -90..90 on a lattice of 1/100");
    expect(checkCreatorRecord(oneCrate(4, 10, [0, 15, 359.999, 1, 1, 1]))).toBe("pose 0 roll is not 0..359.99 on a lattice of 1/100");
    expect(checkCreatorRecord(oneCrate(4, 10, [0, 15, -0.5, 1, 1, 1]))).toBe("pose 0 roll is not 0..359.99 on a lattice of 1/100");
    // the gimbal's one form holds on the finer lattice too: at a pitch of 90 the roll is 0
    expect(checkCreatorRecord(oneCrate(4, 10.5, [0, 90, 0.25, 1, 1, 1]))).toMatch(/pose 0 is not canonical/);
    // a marker keeps a whole degree under version 4: only a piece's angles are finer
    const spawned = { ...oneCrate(4, 12.34), spawns: [["A", 1, 0, 2, 12.5]], ids: { pieces: ["p0"], spawns: ["s0"] } };
    expect(checkCreatorRecord(spawned)).toBe("spawn 0 is not [team, x, y, z, yaw]");
    // a version this build does not read. FN-4, fix round 2: version 5 is a whole number above 4, so it is now refused
    // as a newer build's (`recordVersionRefusal`; this expectation was "not a forge record of version 2, 3 or 4" in round
    // 1); RED at 6270731b3c, GREEN from fix round 2's fix. The words for every other version are the next case's.
    const newer = "this layout was saved by a newer build (record version 5): update the game to open it";
    expect(checkCreatorRecord(oneCrate(5, 10))).toBe(newer);
    expect(() => readCreatorRecord(JSON.stringify(oneCrate(5, 10)))).toThrow(`not a forge layout: ${newer}`);
  });

  it("FN-4 fix round 2, RED: a record of a whole version above 4 is refused as a newer build's, its version and the remedy named", () => {
    // FN-4, fix round 2 (a browser adaptation, the product track): a player who opens a layout saved by a later build is
    // told why it does not open and what to do. Written, NOT RUN (the host rule). Expected RED at 6270731b3c (the words
    // are "not a forge record of version 2, 3 or 4" for every version; `recordVersionRefusal` is not exported, so its
    // call throws), GREEN from the fix.
    const newer = (n: number): string => `this layout was saved by a newer build (record version ${n}): update the game to open it`;
    expect(checkCreatorRecord(oneCrate(5, 10))).toBe(newer(5));
    expect(checkCreatorRecord(oneCrate(12, 10))).toBe(newer(12));
    expect(() => readCreatorRecord(JSON.stringify(oneCrate(5, 10)))).toThrow(`not a forge layout: ${newer(5)}`);
    expect(recordVersionRefusal(5)).toBe(newer(5));
    // a newer build's record may carry a field this build does not know: it is still named by its version, which is
    // checked before the fields (else the player would read "unknown field ...", the cause hidden)
    expect(checkCreatorRecord({ ...oneCrate(5, 10), laterField: 1 })).toBe(newer(5));
  });

  it("FN-4 fix round 2, CONTROL: a version that is not a whole number above 4 keeps the words naming the versions read", () => {
    // Expected GREEN at 6270731b3c and after: below 2, a fraction, a string, absent -- today's words, unchanged.
    const old = "not a forge record of version 2, 3 or 4";
    for (const version of [1, 0, -5, 3.5, 4.5, "4", "5", null]) {
      expect(checkCreatorRecord({ ...oneCrate(4, 10), version }), String(version)).toBe(old);
    }
    const noVersion: Record<string, unknown> = { ...oneCrate(4, 10) };
    delete noVersion["version"];
    expect(checkCreatorRecord(noVersion)).toBe(old);
    // a record whose schema is not the record's is refused in the same words, whatever its version
    expect(checkCreatorRecord({ ...oneCrate(5, 10), schema: "forge-layout-2" })).toBe(old);
    // the v2 check's own refusal keeps its words, a later `v` too
    expect(checkCreatorRecord({ v: 5, name: "Yard" })).toBe(old);
    expect(() => readCreatorRecord(JSON.stringify({ ...oneCrate(4, 10), version: 1 }))).toThrow(`not a forge layout: ${old}`);
  });

  it("RED: a version-4 record whose angles are all whole is read, and written back as version 3", () => {
    // Expected RED at the RED commit: refused by its version. GREEN from the readers' commit: read leniently, its
    // version put back to 3 (the one text a whole-degree layout has), the rest of it as it was.
    const four = oneCrate(4, 90, [0, 15, 30, 1, 1, 1]);
    expect(checkCreatorRecord(four)).toBeNull();
    const read = readCreatorRecord(JSON.stringify(four)).record;
    expect(read.version).toBe(3);
    expect(JSON.stringify(read)).toBe(JSON.stringify({ ...four, version: 3 }));
    expect(recordOfLayout(layoutOfRecord(read), "Yard").version).toBe(3);
  });

  it("CONTROL: a piece at a pitch of exactly 90 writes roll 0, its turn in the yaw (the gimbal's one form), version 3", () => {
    // Expected GREEN at the RED commit and after: yaw 30, pitch 90, roll 20 is Ry(10) * Rx(90), written yaw 10 (30 - 20).
    const r = recordOfLayout(yardOf([{ asset: "MP2:crate", m: posed(0, 0, 0, 30, 90, 20) }]), "Yard");
    expect([r.version, r.pieces[0]![4], r.poses]).toEqual([3, 10, [[0, 90, 0, 1, 1, 1]]]);
  });

  it("RED: a piece at pitch 89.99, yaw 10, roll 20 is written on the lattice and reads back within a hundredth of a degree", () => {
    // Expected RED at the RED commit: the pitch rounds to 90 (whole degrees), so the pose row is [0, 90, 0, 1, 1, 1].
    // GREEN from the writer's commit. Why the tolerance holds, by reading: |sin 89.99| = cos 0.01 = 1 - 1.5e-8 is past
    // `poseOf`'s GIMBAL (0.9999999, three's own), so the turn is read at the gimbal -- roll 0, the yaw from the first
    // column, 10 - 20 = -10, written 350 -- and the pitch keeps 89.99. Ry(a) Rx(90 - d) Rz(r) and Ry(a - r) Rx(90 - d)
    // differ by a turn of 2 d sin(r / 2) (Rx(90) Rz(r) = Ry(-r) Rx(90)): d = 0.01, r = 20 gives 0.0035 degrees, under the
    // lattice's 0.01; a matrix element moves by at most that angle in radians (|R1 - R2| <= 2 sin(t / 2) <= t).
    const m = posed(0, 0, 0, 10, 89.99, 20);
    const r = recordOfLayout(yardOf([{ asset: "MP2:crate", m }]), "Yard");
    expect([r.version, r.pieces[0]![4], r.poses]).toEqual([4, 350, [[0, 89.99, 0, 1, 1, 1]]]);
    expect(checkCreatorRecord(r)).toBeNull();
    expect(farthest(layoutOfRecord(r).pieces[0]!.m, m)).toBeLessThanOrEqual(rad(1 / 100));
    // and the written form is stable: a second trip writes the same text
    expect(JSON.stringify(recordOfLayout(layoutOfRecord(r), "Yard"))).toBe(JSON.stringify(r));
    // FN-4, fix round 3: re-read against the rule that a pitch read at the gimbal has no roll (the next case) -- this
    // record's pose has roll 0, so it is taken under that rule too; no expectation here moves.
  });

  /*
   * FN-4, fix round 3 (a browser adaptation, the product track: the game has no editor and reads no record). The writer
   * (`poseOf`) reads a turn at the gimbal when |sin pitch| >= GIMBAL (0.9999999, three's own), and there it writes roll 0,
   * its turn in the yaw. The window, by hand: sin(90 - d) = cos d = 1 - d^2 / 2 (to d^4 / 24, about 1e-15 here), which
   * reaches 0.9999999 when d^2 / 2 = 1e-7: d = sqrt(2e-7) = 4.4721e-4 rad = 0.025623 degrees, so every pitch from
   * 89.974377 up (and from -89.974377 down). On the hundredth: 89.98 is in (d = 0.02 deg = 3.4907e-4 rad, cos d =
   * 1 - 6.092e-8 = 0.99999993908 >= 0.9999999); 89.97 is out (d = 0.03 deg = 5.2360e-4 rad, cos d = 1 - 1.3708e-7 =
   * 0.99999986292 < 0.9999999). A pitch of 89.98 on the lattice comes only from a true pitch of 89.975 or more, inside the
   * window, so the writer never puts a roll beside it: a record with one would write back as another text.
   */
  it("FN-4 fix round 3, RED: a version-4 pose whose pitch is read at the gimbal (89.98 or more, either sign) is refused with a roll", () => {
    // Written, NOT RUN (the host rule). Expected RED at 0d1d738787: `posesError` holds the gimbal's one form at a pitch of
    // exactly 90 or -90 only, so both poses are taken (`checkCreatorRecord` answers null, not the words). GREEN from the fix.
    const words = "pose 0 has a roll at a pitch read at the vertical (89.98 or more, either sign): its turn is the yaw's";
    expect(checkCreatorRecord(oneCrate(4, 10, [0, 89.99, 20, 1, 1, 1]))).toBe(words);
    expect(checkCreatorRecord(oneCrate(4, 10, [0, -89.98, 0.01, 1, 1, 1]))).toBe(words);
    expect(() => readCreatorRecord(JSON.stringify(oneCrate(4, 10, [0, 89.99, 20, 1, 1, 1])))).toThrow(`not a forge layout: ${words}`);
    // a pitch of exactly 90 keeps the words it had (the check before this one)
    expect(checkCreatorRecord(oneCrate(4, 10, [0, 90, 20, 1, 1, 1]))).toMatch(/pose 0 is not canonical/);
  });

  it("FN-4 fix round 3, CONTROL: roll 0 at 89.99 and -89.98, and a roll at 89.97 (outside the window), are taken and written back as the same text", () => {
    // Written, NOT RUN. Expected GREEN at 0d1d738787 and after the fix. By reading `poseMatrix` and `poseOf`, yaw 10:
    // - [0, 89.99, 0] and [0, -89.98, 0]: roll 0 makes m[0] = cos 10 and m[2] = -sin 10, so the gimbal's yaw
    //   atan2(-m[2], m[0]) is 10; the pitch asin(sin p) is p to about 1e-11 degrees (asin's error near 1 is the double's
    //   1.1e-16 over sqrt(2 (1 - x)), 6e-13 rad at 89.99), on the hundredth p; roll fineDeg(0) = 0; version 4.
    // - [0, 89.97, 20]: |sin 89.97| = 0.99999986292 is under GIMBAL, so the yaw is atan2(a sin 10, a cos 10) and the roll
    //   atan2(a sin 20, a cos 20), a = cos 89.97 = 5.236e-4 a common factor: 10 and 20 again; the pitch 89.97.
    for (const pose of [[0, 89.99, 0, 1, 1, 1], [0, -89.98, 0, 1, 1, 1], [0, 89.97, 20, 1, 1, 1]]) {
      const at = JSON.stringify(pose);
      const r = oneCrate(4, 10, pose);
      expect(checkCreatorRecord(r), `${at}: taken`).toBeNull();
      const text = JSON.stringify(r);
      const read = readCreatorRecord(text).record;
      expect(JSON.stringify(read), `${at}: read as it is`).toBe(text);
      expect(JSON.stringify(recordOfLayout(layoutOfRecord(read), "Yard")), `${at}: written back as the same text`).toBe(text);
    }
  });

  it("CONTROL: markers keep a whole degree -- a spawn turned 12.4 degrees writes 12, even beside a version-4 piece", () => {
    // Expected GREEN at the RED commit and after: every yaw but a piece's goes through `wholeDeg`, unchanged by FN-4.
    const l: Layout = { ...yardOf([{ asset: "MP2:crate", m: posed(0, 0, 0, 12.34, 0, 0) }]), spawns: [{ team: "A", p: [1, 0, 2], yaw: rad(12.4) }] };
    const r = recordOfLayout(l, "Yard");
    expect(r.spawns).toEqual([["A", 1, 0, 2, 12]]);
  });
});
