import { describe, expect, it } from 'vitest';
import {
  checkFrameDeterminant, checkHull, GEOMETRY_CHECK_BUDGET_ADAPTATION, GEOMETRY_DETERMINANT_EPSILON_ADAPTATION, GeometryRefusal, type GeometryHull,
} from '@s2u/creator-contracts';
import * as tool from '../../../../tools/creator-import/src/geometry';
import { GLB_CHECK_BUDGET_ADAPTATION, GLB_DETERMINANT_EPSILON_ADAPTATION, PreparationBudget } from '../../../../tools/creator-import/src/limits';
import { ASSET_CHECK_BUDGET_ADAPTATION, ASSET_DETERMINANT_EPSILON_ADAPTATION, readAssetDefinition } from '../../src/packs/content/assets';
import { BOX, REF, solidJson } from './contentFixtures';

/**
 * S3b item 6 (product track; a tool's authoring mathematics, no game value): one source for the hull and frame checks --
 * `@s2u/creator-contracts` `geometry.ts` -- which the engine's pack-prop reader (`readAssetDefinition`) now runs. The
 * import tool (`tools/creator-import/src/geometry.ts`, not this seat's file) still holds its own copy until its seat
 * imports the contract; until then this test holds the two in agreement: the committed fixture's box and its broken
 * variants give the same answer, and the five determinant boundary values the same code, through the tool, the contract
 * and the engine's reader.
 */

const codeOf = (f: () => void): string => {
  try { f(); return 'ok'; } catch (e) {
    if (e instanceof GeometryRefusal || e instanceof tool.ImportRefusal) return e.code;
    throw e;
  }
};
const unlimited = { check: (): void => undefined };
const diag = (a: number, b = 1, c = 1): number[] => [a, 0, 0, 0, 0, b, 0, 0, 0, 0, c, 0, 0, 0, 0, 1];
const engineCode = (frame: number[]): string => {
  const got = readAssetDefinition(solidJson({}, { frame }), REF);
  return Array.isArray(got) ? got[0]!.code : 'asset.ok';
};

describe('S3b item 6: the contract\'s geometry agrees with the import tool\'s', () => {
  it('the bounds are the tool\'s, through the contract to the engine', () => {
    expect(GEOMETRY_DETERMINANT_EPSILON_ADAPTATION).toBe(GLB_DETERMINANT_EPSILON_ADAPTATION);
    expect(GEOMETRY_CHECK_BUDGET_ADAPTATION).toBe(GLB_CHECK_BUDGET_ADAPTATION);
    expect(ASSET_DETERMINANT_EPSILON_ADAPTATION).toBe(GEOMETRY_DETERMINANT_EPSILON_ADAPTATION);
    expect(ASSET_CHECK_BUDGET_ADAPTATION).toBe(GEOMETRY_CHECK_BUDGET_ADAPTATION);
  });

  it('the five determinant boundary values: one code each through the tool, the contract and the engine\'s reader', () => {
    const cases: [number[], string][] = [
      [diag(1e200, 1e200, 1e200), 'NONFINITE_TRANSFORM'],    // every entry finite, the determinant past finite
      [diag(1e-13), 'DEGENERATE_TRANSFORM'],                  // under the threshold
      [diag(1e-12), 'ok'],                                    // at the threshold: kept (the check is strictly under)
      [diag(-1e-13), 'DEGENERATE_TRANSFORM'],                 // a negative one that small collapses before it mirrors
      [diag(-1), 'MIRRORED_TRANSFORM'],                       // mirrored
    ];
    for (const [m, want] of cases) {
      expect([codeOf(() => tool.checkDeterminant(m, 'm')), codeOf(() => checkFrameDeterminant(m))]).toEqual([want, want]);
      // the engine's reader: the same refusal; a frame it keeps passes to the hull checks (a box squeezed to a 1e-12
      // determinant is refused there, for its volume, never for its frame)
      if (want === 'ok') expect(engineCode(m)).not.toMatch(/_TRANSFORM$/);
      else expect(engineCode(m)).toBe(`asset.${want}`);
    }
  });

  it('the fixture\'s box and its broken variants: one answer through the tool and the contract', () => {
    const box = (): { vertices: number[][]; faces: number[][] } => JSON.parse(JSON.stringify(BOX)) as { vertices: number[][]; faces: number[][] };
    const variants: [string, GeometryHull][] = [
      ['box', box() as unknown as GeometryHull],
      ['open', { ...box(), faces: box().faces.slice(0, 5) } as unknown as GeometryHull],
      ['flipped', { ...box(), faces: box().faces.map((f) => [...f].reverse()) } as unknown as GeometryHull],
      ['nonplanar', { ...box(), vertices: box().vertices.map((p, i) => (i === 6 ? [p[0]!, p[1]! + 0.25, p[2]!] : p)) } as unknown as GeometryHull],
      ['repeated', { ...box(), vertices: box().vertices.map((p, i) => (i === 7 ? box().vertices[0]! : p)) } as unknown as GeometryHull],
      ['index', { ...box(), faces: [[0, 1, 2, 99], ...box().faces.slice(1)] } as unknown as GeometryHull],
      ['flat', { vertices: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], faces: [[0, 1, 2], [0, 2, 3], [0, 3, 1], [1, 3, 2]] } as unknown as GeometryHull],
    ];
    const answers = variants.map(([name, h]) => [name, codeOf(() => tool.validateHull(h as never, new PreparationBudget())), codeOf(() => checkHull(h, unlimited))]);
    for (const [name, viaTool, viaContract] of answers) expect([name, viaContract]).toEqual([name, viaTool]);
    expect(answers[0]![1]).toBe('ok');
    expect(new Set(answers.slice(1).map((a) => a[1])).has('ok')).toBe(false);
  });
});
