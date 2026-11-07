// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { Matrix4 } from 'three';
import { floorGround } from '../../src/forge/ground';
import { checkRecord } from '../../src/forge/record';
import { groundPolygons, packGround } from '../../src/mover';
import type { LoadedMap } from '../../src/loadMap';
import { previewStarter, type StarterContext } from '../../src/creator/examples';
import { checkStarterLayout } from '../../src/creator/examples/validation';

/**
 * R3-B (3; FCW-03 with dot's v2-precision preservation, `ca259f89a`; a browser adaptation, no original): the page's own
 * starter placement check (`starterPlacementChecks`, what the mounted page's `starterContext` calls) compares a
 * serialized recipe as one: `{ positionEncoding: 'record-v2', supportOwners }` -- the prior proposed hulls are earlier
 * pieces rounded into the same saved record. The fixture is `creatorExamples.test.ts`'s (aa805b0e9): a crate on a floor
 * a third of a lattice step off (0.034), whose stack a full-precision check finds unsupported.
 */

vi.mock('../../src/renderer', () => ({ createRenderer: async () => ({}) }));

function fixture(floorY: number, height: number): LoadedMap {
  const floor = floorGround(4000);
  for (let i = 1; i < floor.points.length; i += 3) floor.points[i] = floorY;
  const polys = groundPolygons(floor), path = 'world/crate', x = 300, lx = x - 8, hx = x + 8, ly = floorY, hy = floorY + height;
  const faces = [
    [lx, ly, -8, hx, ly, -8, hx, ly, 8, lx, ly, 8], [lx, hy, -8, hx, hy, -8, hx, hy, 8, lx, hy, 8],
    [lx, ly, -8, lx, hy, -8, lx, hy, 8, lx, ly, 8], [hx, ly, -8, hx, hy, -8, hx, hy, 8, hx, ly, 8],
    [lx, ly, -8, lx, hy, -8, hx, hy, -8, hx, ly, -8], [lx, ly, 8, lx, hy, 8, hx, hy, 8, hx, ly, 8],
  ].map((points, i) => ({ modelName: 'crate', path, ditype: i === 1 ? 3 : 2, material: 0, region: 0, cameratype: 0, ptcount: 4, points: new Float32Array(points) }));
  return {
    archive: 'M99', name: 'Supplied room',
    ground: packGround(floor.grid, [...polys, ...faces], [...floor.owners, { modelName: 'crate', path, first: polys.length, count: faces.length }]),
    slots: [
      { side: 0, index: 0, position: [-200, floorY, 0], step: 0, facing: [0, -1], onFloor: true },
      { side: 1, index: 0, position: [200, floorY, 0], step: 4, facing: [0, 1], onFloor: true },
    ],
    types: { seal: [{}], terrorist: [null, {}] },
    props: [{ modelName: 'crate', parts: [{ positions: new Float32Array([-8, 0, -8, 8, height, 8, -8, height, 8]), alternate: false }],
      matrices: Float32Array.from(new Matrix4().makeTranslation(x, floorY, 0).elements), paths: [path], order: 0, alternate: false, facade: 0, lod: null }],
  } as unknown as LoadedMap;
}

describe('R3-B: the page\'s starter placement check compares serialized recipes at the record lattice', () => {
  it.each([['arena', 0.034, 16], ['crate-stack', 0, 16.034]] as const)('%s: accepted at v2 serialization precision through the page\'s checker', async (id, floorY, height) => {
    const { starterPlacementChecks } = await import('../../src/forge/page');
    const map = fixture(floorY, height);
    const checks = starterPlacementChecks(map, [map], () => 7);
    const assets = checks.catalogue.queryCreatorAssets({}).items;
    expect(assets.map((a) => a.asset)).toEqual(['M99:crate']);
    const c: StarterContext = {
      revision: 7, archives: [{ stem: 'M99', label: 'Supplied campaign room', campaign: true }], map, assets,
      checkPlacement: (ref, transform, prior, ids) => checks.checkPlacement(assets, ref, transform, prior, ids),
      checkLayout: (record) => ({ revision: 7, diagnostics: checkStarterLayout(record, map, [map]) }),
    };
    const preview = await previewStarter(id, c);
    expect(preview.diagnostics).toEqual([]);
    expect(preview.record).not.toBeNull();
    expect(checkRecord(preview.record)).toBeNull();
  }, 90_000);                                                   // the first imports the page (4.5 s cold): the page tests' allowance
});
