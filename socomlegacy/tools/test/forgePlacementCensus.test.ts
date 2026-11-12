import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  PIECE_ORTHO_TOLERANCE_ADAPTATION, PIECE_SCALE_EPSILON_ADAPTATION, PIECE_SCALE_MAX_ADAPTATION, PIECE_SCALE_MIN_ADAPTATION, pieceMatrixError,
} from '@s2u/creator-contracts';
import {
  buildPlacementReport, CENSUS_ORTHO_TOLERANCE, CENSUS_REFUSED_CAP, CENSUS_SCALE_EPSILON, CENSUS_SCALE_MAX, CENSUS_SCALE_MIN,
  CENSUS_SCALE_TOLERANCE, CENSUS_TILT_DEGREES, censusOfProps, classifyPlacement, failedPlacementMap, renderPlacementTable,
} from '../forgePlacementCensus';

/**
 * FX-7 (the Forge export sprint; product track): the placement census's pure half on synthetic matrices -- no disc. A
 * matrix here is column-major, as `LoadedMap.props[].matrices` holds each placement (three's `Matrix4.elements`).
 */

const identity = (): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const yaw = (deg: number): number[] => {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
};
/** A turn about the x axis (a pitch). */
const pitch = (deg: number): number[] => {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
};
/** A turn about the z axis (a roll). */
const roll = (deg: number): number[] => {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
};
const scale = (x: number, y: number, z: number): number[] => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];
const at = (m: number[], x: number, y: number, z: number): number[] => { const o = [...m]; o[12] = x; o[13] = y; o[14] = z; return o; };

describe('classifyPlacement', () => {
  it('reads the identity as a pure yaw at scale 1', () => {
    const c = classifyPlacement(identity());
    expect(c.classes).toEqual(['yaw']);
    expect(c.refusal).toBeNull();
    expect(c.lengths).toEqual([1, 1, 1]);
    expect(c.tiltDegrees).toBeCloseTo(0, 9);
    expect(c.yawDegrees).toBeCloseTo(0, 9);
  });

  it('reads a turn of 37 degrees about the vertical as a pure yaw, and gives its angle', () => {
    const c = classifyPlacement(at(yaw(37), 100, 5, -20));
    expect(c.classes).toEqual(['yaw']);
    expect(c.refusal).toBeNull();
    expect(c.yawDegrees).toBeCloseTo(37, 6);
  });

  it('reads a pitch or a roll past half a degree as tilted, and admits it', () => {
    const p = classifyPlacement(pitch(10));
    expect(p.classes).toEqual(['tilted']);
    expect(p.tiltDegrees).toBeCloseTo(10, 6);
    expect(p.refusal).toBeNull();
    const r = classifyPlacement(roll(-3));
    expect(r.classes).toEqual(['tilted']);
    expect(r.tiltDegrees).toBeCloseTo(3, 6);
  });

  it('keeps a tilt of 0.3 degrees a pure yaw (the threshold is 0.5)', () => {
    expect(classifyPlacement(pitch(0.3)).classes).toEqual(['yaw']);
    expect(classifyPlacement(pitch(0.7)).classes).toEqual(['tilted']);
  });

  it('reads 2, 1, 0.5 as scaled with its three axis lengths, and admits it', () => {
    const c = classifyPlacement(scale(2, 1, 0.5));
    expect(c.classes).toEqual(['scaled']);
    expect(c.lengths).toEqual([2, 1, 0.5]);
    expect(c.refusal).toBeNull();
  });

  it('keeps an axis within 0.005 of 1 unscaled', () => {
    expect(classifyPlacement(scale(1.004, 0.996, 1)).classes).toEqual(['yaw']);
    expect(classifyPlacement(scale(1.006, 1, 1)).classes).toEqual(['scaled']);
  });

  it('reads a negative determinant as mirrored and refuses it', () => {
    const c = classifyPlacement(scale(-1, 1, 1));
    expect(c.classes).toContain('mirrored');
    expect(c.determinant).toBeLessThan(0);
    expect(c.refusal).toMatch(/mirrored/);
  });

  it('reads axes off perpendicular as sheared and refuses it', () => {
    const m = identity();
    m[4] = 0.1;   // the y axis column leans along x
    const c = classifyPlacement(m);
    expect(c.classes).toContain('sheared');
    expect(c.maxCosine!).toBeGreaterThan(1e-3);
    expect(c.refusal).toMatch(/perpendicular/);
  });

  it('reads a zero scale as out of range and refuses it, and measures no angle on it', () => {
    const c = classifyPlacement(scale(0, 1, 1));
    expect(c.classes).toContain('outOfRange');
    expect(c.classes).not.toContain('sheared');
    expect(c.maxCosine).toBeNull();
    expect(c.refusal).toMatch(/under 0\.1/);
  });

  it('reads a scale over 4 as scaled and out of range', () => {
    const c = classifyPlacement(scale(4.5, 1, 1));
    expect(c.classes).toEqual(['scaled', 'outOfRange']);
    expect(c.refusal).toMatch(/over 4/);
    expect(classifyPlacement(scale(4, 0.1, 1)).refusal).toBeNull();
  });

  it('reads a bottom row other than 0, 0, 0, 1 as bad and refuses it first', () => {
    const m = scale(-1, 1, 1);
    m[3] = 0.5;
    const c = classifyPlacement(m);
    expect(c.classes).toContain('badBottomRow');
    expect(c.classes).toContain('mirrored');
    expect(c.refusal).toBe('the bottom row is not 0, 0, 0, 1');
    const w = identity();
    w[15] = 2;
    expect(classifyPlacement(w).classes).toContain('badBottomRow');
  });

  it('reads a matrix at an offset in a packed array', () => {
    const packed = new Float32Array([...identity(), ...scale(2, 2, 2)]);
    expect(classifyPlacement(packed, 0).classes).toEqual(['yaw']);
    expect(classifyPlacement(packed, 16).classes).toEqual(['scaled']);
  });

  it('refuses a non-finite entry', () => {
    const m = identity();
    m[5] = Number.NaN;
    const c = classifyPlacement(m);
    expect(c.classes).toContain('nonFinite');
    expect(c.refusal).toMatch(/not a finite number/);
  });
});

describe('censusOfProps and the report', () => {
  const props = [
    { modelName: 'crate', matrices: new Float32Array([...identity(), ...yaw(90), ...pitch(20)]), facade: 0, lod: null },
    { modelName: 'sign', matrices: new Float32Array([...scale(-1, 1, 1), ...scale(2, 1, 0.5)]), facade: 1, lod: { near: 0, far: 10 } },
  ];

  it('counts each class, the facades and the LOD placements, and lists what the shared check refuses', () => {
    const row = censusOfProps('MP2', false, props);
    expect(row.status).toBe('ok');
    expect(row.props).toBe(2);
    expect(row.placements).toBe(5);
    expect(row.counts.yaw).toBe(2);
    expect(row.counts.tilted).toBe(1);
    expect(row.counts.scaled).toBe(1);
    expect(row.counts.mirrored).toBe(1);
    expect(row.refused).toBe(1);
    expect(row.facadePlacements).toBe(2);
    expect(row.lodPlacements).toBe(2);
    expect(row.maxTiltDegrees).toBeCloseTo(20, 4);
    expect(row.axisMin).toBeCloseTo(0.5, 6);
    expect(row.axisMax).toBeCloseTo(2, 6);
    expect(row.refusedList).toHaveLength(1);
    expect(row.refusedList[0]).toMatchObject({ map: 'MP2', prop: 'sign', index: 0, classes: ['mirrored'] });
    expect(row.scales[0]).toEqual({ lengths: '2/1/0.5', count: 1 });
  });

  it('totals the maps, keeps a failed map as failed, and caps the refused list', () => {
    const many = { modelName: 'mirror', matrices: new Float32Array(Array.from({ length: CENSUS_REFUSED_CAP + 5 }, () => scale(-1, 1, 1)).flat()) };
    const report = buildPlacementReport([censusOfProps('MP2', false, props), censusOfProps('M51', true, [many]), failedPlacementMap('M52', true, 'boom')]);
    expect(report.total.maps).toBe(3);
    expect(report.total.failed).toEqual(['M52']);
    expect(report.total.placements).toBe(5 + CENSUS_REFUSED_CAP + 5);
    expect(report.total.refused).toBe(1 + CENSUS_REFUSED_CAP + 5);
    expect(report.refused).toHaveLength(CENSUS_REFUSED_CAP);
    expect(report.refusedMore).toBe(6);
    expect(report.total.counts.mirrored).toBe(1 + CENSUS_REFUSED_CAP + 5);
    const text = renderPlacementTable(report);
    expect(text).toMatch(/MP2/);
    expect(text).toMatch(/M52\s+FAILED: boom/);
    expect(text).toMatch(/and 6 more/);
  });
});

// FX wave 1 fold (the fresh review's finding 5; product track, an instrument with no original): the census's refusal is
// the shared piece check's (`@s2u/creator-contracts` `pieceMatrixError`, FX-2), its limits imported, never restated.
describe('the census and the shared piece check agree', () => {
  it('takes the check limits from creator-contracts and keeps its own display thresholds', () => {
    expect(CENSUS_SCALE_MIN).toBe(PIECE_SCALE_MIN_ADAPTATION);
    expect(CENSUS_SCALE_MAX).toBe(PIECE_SCALE_MAX_ADAPTATION);
    expect(CENSUS_ORTHO_TOLERANCE).toBe(PIECE_ORTHO_TOLERANCE_ADAPTATION);
    expect(CENSUS_SCALE_EPSILON).toBe(PIECE_SCALE_EPSILON_ADAPTATION);
    expect(CENSUS_TILT_DEGREES).toBe(0.5);
    expect(CENSUS_SCALE_TOLERANCE).toBe(0.005);
  });

  it('restates none of the check limits in its source: it imports them', () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'forgePlacementCensus.ts'), 'utf8');
    expect(source).toMatch(/from '@s2u\/creator-contracts'/);
    for (const name of ['CENSUS_SCALE_MIN', 'CENSUS_SCALE_MAX', 'CENSUS_ORTHO_TOLERANCE', 'CENSUS_SCALE_EPSILON']) {
      expect(source, name).not.toMatch(new RegExp(`export const ${name} = [0-9]`));
    }
  });

  it('refuses exactly what pieceMatrixError refuses, over a list of matrices', () => {
    const sheared = identity();
    sheared[4] = 0.1;
    const badBottom = yaw(30);
    badBottom[7] = 0.25;
    const turnedScaled = (deg: number, s: [number, number, number]): number[] => {
      // a pitch then a yaw (R = Ry Rx, column-major), each axis column times its scale
      const p = pitch(deg), y = yaw(deg * 2);
      const out = identity();
      for (let c = 0; c < 3; c++) {
        for (let r = 0; r < 3; r++) {
          let v = 0;
          for (let k = 0; k < 3; k++) v += y[k * 4 + r]! * p[c * 4 + k]!;
          out[c * 4 + r] = v * s[c]!;
        }
      }
      return out;
    };
    const cases: [string, number[], boolean][] = [
      ['yaw only', at(yaw(37), 100, 5, -20), false],
      ['tilted and scaled in range', turnedScaled(20, [2, 0.5, 3]), false],
      ['a roll scaled at the bounds', (() => { const r = roll(15); for (let i = 0; i < 3; i++) { r[i] = r[i]! * 0.1; r[4 + i] = r[4 + i]! * 4; } return r; })(), false],
      ['mirrored', scale(-1, 1, 1), true],
      ['mirrored and turned', turnedScaled(10, [1, -1, 1]), true],
      ['sheared', sheared, true],
      ['scale 0.09', scale(0.09, 1, 1), true],
      ['scale 4.01', scale(1, 4.01, 1), true],
      ['scale 0.1 and 4 exactly', scale(0.1, 4, 1), false],
      ['a bad bottom row', badBottom, true],
      ['a zero axis', scale(1, 1, 0), true],
      ['a non-finite entry', (() => { const m = identity(); m[0] = Number.POSITIVE_INFINITY; return m; })(), true],
    ];
    for (const [name, m, refused] of cases) {
      expect(pieceMatrixError(m) !== null, `${name}: pieceMatrixError`).toBe(refused);
      expect(classifyPlacement(m).refusal !== null, `${name}: the census`).toBe(refused);
    }
  });
});
