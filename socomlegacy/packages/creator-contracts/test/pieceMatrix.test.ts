import { describe, expect, it } from "vitest";
import * as contracts from "../src/index.js";
import {
  PIECE_ORTHO_TOLERANCE_ADAPTATION, PIECE_SCALE_EPSILON_ADAPTATION, PIECE_SCALE_MAX_ADAPTATION, PIECE_SCALE_MIN_ADAPTATION, pieceMatrixError,
} from "../src/pieceMatrix";

/**
 * FX-2 (the Forge export sprint; a browser adaptation, no original; the owner's default range is H442 (b)): the one
 * check of a Forge piece's matrix the lobby's create reads (`central/src/forgeLobby.ts` `layoutWithinBounds`): 16 finite
 * numbers, the bottom row 0,0,0,1, the three axes perpendicular, a positive determinant, each axis scaled 0.1..4.
 */

/** A column-major 4x4: turned `yaw` about y, then tilted `tilt` about x (R = Ry Rx), each axis scaled by `s`, at `t`. */
const turned = (yaw: number, tilt: number, s: readonly [number, number, number], t: readonly [number, number, number] = [0, 0, 0]): number[] => {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), ct = Math.cos(tilt), st = Math.sin(tilt);
  return [cy * s[0], 0, -sy * s[0], 0, sy * st * s[1], ct * s[1], cy * st * s[1], 0, sy * ct * s[2], -st * s[2], cy * ct * s[2], 0, t[0], t[1], t[2], 1];
};
/** The editor's own yaw piece, exactly the form `layoutOfRecord` writes (`../src/layout.ts`). */
const yawPiece = (deg: number, x: number, y: number, z: number): number[] => {
  const c = Math.cos((deg * Math.PI) / 180), s = Math.sin((deg * Math.PI) / 180);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, x, y, z, 1];
};
const diag = (sx: number, sy: number, sz: number): number[] => [sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, 0, 0, 0, 1];

describe("FX-2: a piece matrix is a translation, a rotation and a positive scale", () => {
  it("the range is the owner default (H442 (b)): 0.1..4 an axis; the tolerances are small", () => {
    expect(PIECE_SCALE_MIN_ADAPTATION).toBe(0.1);
    expect(PIECE_SCALE_MAX_ADAPTATION).toBe(4);
    expect(PIECE_ORTHO_TOLERANCE_ADAPTATION).toBeGreaterThan(0);
    expect(PIECE_ORTHO_TOLERANCE_ADAPTATION).toBeLessThanOrEqual(1e-2);
    expect(PIECE_SCALE_EPSILON_ADAPTATION).toBeGreaterThan(0);
    expect(PIECE_SCALE_EPSILON_ADAPTATION).toBeLessThanOrEqual(1e-4);
  });

  it("is exported from the package index", () => {
    expect(contracts.pieceMatrixError).toBe(pieceMatrixError);
    expect(contracts.PIECE_SCALE_MAX_ADAPTATION).toBe(PIECE_SCALE_MAX_ADAPTATION);
  });

  it("admits the editor yaw piece (the layoutOfRecord form) at every whole degree", () => {
    for (let deg = -180; deg <= 360; deg++) expect(pieceMatrixError(yawPiece(deg, 120, 7, -45)), `${deg} degrees`).toBeNull();
  });

  it("admits the identity, a turn, a tilt and a scale per axis inside the range", () => {
    expect(pieceMatrixError(diag(1, 1, 1))).toBeNull();
    expect(pieceMatrixError(turned(0.7, 0.4, [0.1, 2.5, 4], [100, 20, -300]))).toBeNull();
    expect(pieceMatrixError(turned(-2.9, 1.5, [3.999, 0.1001, 1]))).toBeNull();
    expect(pieceMatrixError(turned(Math.PI, -Math.PI / 2, [1, 1, 1]))).toBeNull();
  });

  it("refuses anything but 16 finite numbers", () => {
    expect(pieceMatrixError(diag(1, 1, 1).slice(0, 15))).toMatch(/16/);
    expect(pieceMatrixError([...diag(1, 1, 1), 0])).toMatch(/16/);
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const m = diag(1, 1, 1);
      m[13] = bad;
      expect(pieceMatrixError(m)).toMatch(/finite/);
    }
  });

  it("refuses a bottom row other than 0,0,0,1 (a projective piece)", () => {
    for (const [i, v] of [[3, 0.1], [7, -0.5], [11, 1e-12], [15, 2], [15, 0], [15, -1]] as const) {
      const m = diag(1, 1, 1);
      m[i] = v;
      expect(pieceMatrixError(m), `entry ${i} = ${v}`).toMatch(/bottom row/);
    }
  });

  it("refuses a sheared piece (two axes not perpendicular)", () => {
    expect(pieceMatrixError([1, 0, 0, 0, 0.5, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])).toMatch(/perpendicular/);
    expect(pieceMatrixError([1, 0, 0, 0, 0, 1, 0, 0, 0, 0.3, 1, 0, 0, 0, 0, 1])).toMatch(/perpendicular/);
    expect(pieceMatrixError([1, 0, 0.2, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])).toMatch(/perpendicular/);
  });

  it("refuses a mirrored piece (a negative determinant)", () => {
    expect(pieceMatrixError(diag(-1, 1, 1))).toMatch(/mirrored/);
    expect(pieceMatrixError(diag(1, 1, -2))).toMatch(/mirrored/);
    expect(pieceMatrixError(diag(-1, -1, -1))).toMatch(/mirrored/);
    expect(pieceMatrixError(diag(-1, -1, 1))).toBeNull();               // two flips are a half turn about z: a rotation
  });

  it("refuses a zero-scale, a 1e-9-scale and a flattened piece", () => {
    expect(pieceMatrixError([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 0, 10, 1])).toMatch(/scale/);
    expect(pieceMatrixError(diag(1e-9, 1e-9, 1e-9))).toMatch(/scale/);
    expect(pieceMatrixError(diag(1, 0, 1))).toMatch(/scale/);
    expect(pieceMatrixError(diag(0, 1, 1))).toMatch(/scale/);
    expect(pieceMatrixError(diag(1, 1, 0))).toMatch(/scale/);
  });

  it("the scale edges: exactly 0.1 and exactly 4 pass (turned too); just past either is refused", () => {
    expect(pieceMatrixError(diag(0.1, 0.1, 0.1))).toBeNull();
    expect(pieceMatrixError(diag(4, 4, 4))).toBeNull();
    expect(pieceMatrixError(turned(0.3, 0.2, [0.1, 0.1, 0.1]))).toBeNull();
    expect(pieceMatrixError(turned(1.3, -0.6, [4, 4, 4]))).toBeNull();
    expect(pieceMatrixError(diag(0.1 * (1 - 1e-4), 1, 1))).toMatch(/scale/);
    expect(pieceMatrixError(diag(1, 4 * (1 + 1e-4), 1))).toMatch(/scale/);
    expect(pieceMatrixError(diag(1, 1, 5))).toMatch(/scale/);
    expect(pieceMatrixError(diag(0.09, 1, 1))).toMatch(/scale/);
  });

  it("the perpendicular edge: a lean whose cosine is under the tolerance passes, one over it is refused", () => {
    // x = (1, 0, 0); y = (k, 1, 0), its cosine with x k / sqrt(1 + k^2); z = x cross y = (0, 0, 1): a positive determinant.
    const lean = (k: number): number[] => [1, 0, 0, 0, k, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    expect(pieceMatrixError(lean(PIECE_ORTHO_TOLERANCE_ADAPTATION / 2))).toBeNull();
    expect(pieceMatrixError(lean(PIECE_ORTHO_TOLERANCE_ADAPTATION * 2))).toMatch(/perpendicular/);
  });

  it("options narrow or widen the range and the tolerance", () => {
    expect(pieceMatrixError(diag(5, 5, 5), { scaleMax: 8 })).toBeNull();
    expect(pieceMatrixError(diag(0.5, 1, 1), { scaleMin: 1 })).toMatch(/scale/);
    const lean = [1, 0, 0, 0, 0.05, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    expect(pieceMatrixError(lean)).toMatch(/perpendicular/);
    expect(pieceMatrixError(lean, { orthoTolerance: 0.1 })).toBeNull();
  });
});
