import type { ContentRef } from '@s2u/creator-contracts';
import { ASSET_DEFINITION_SCHEMA, ASSET_DEFINITION_VERSION } from '../../src/packs/content/assets';

/**
 * FCW-09 test fixtures, in memory (a browser adaptation, no original): a pack prop's `assets/crate.json` as the import
 * tool's writer would emit it -- the committed `tools/creator-import/fixtures/props/solid.collision-source.json`'s 2 x 1.5
 * x 1 m box, its faces counterclockwise seen from outside, in one identity frame -- and its visual-only twin.
 */
export const REF: ContentRef = { kind: 'pack', pack: { id: 'fcw09.props', version: '1.0.0', hash: 'a'.repeat(64) }, assetId: 'crate' };
const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
/** The solid fixture's box, metres, faces counterclockwise seen from outside. */
export const BOX = {
  vertices: [[-1, 0, -0.5], [1, 0, -0.5], [1, 0, 0.5], [-1, 0, 0.5], [-1, 1.5, -0.5], [1, 1.5, -0.5], [1, 1.5, 0.5], [-1, 1.5, 0.5]],
  faces: [[0, 1, 2, 3], [4, 7, 6, 5], [3, 2, 6, 7], [0, 4, 5, 1], [0, 3, 7, 4], [1, 5, 6, 2]],
};
export const solidJson = (over: Record<string, unknown> = {}, collision: Record<string, unknown> = {}): Record<string, unknown> => ({
  schema: ASSET_DEFINITION_SCHEMA, version: ASSET_DEFINITION_VERSION, assetId: 'crate', kind: 'prop', units: 'metre', up: '+Y', transformsBaked: true,
  visual: { member: 'assets/crate.glb' },
  boundsMetres: { min: [-1, 0, -0.5], max: [1, 1.5, 0.5] },
  collision: { intent: 'convex', frame: [...I], hulls: [JSON.parse(JSON.stringify(BOX)) as typeof BOX], ...collision },
  source: { member: 'assets/crate.glb', sha256: 'b'.repeat(64) },
  ...over,
});
export const visualJson = (): Record<string, unknown> => solidJson({ collision: { intent: 'none' } });

