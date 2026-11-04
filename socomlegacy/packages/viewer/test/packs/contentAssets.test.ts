import { describe, expect, it } from 'vitest';
import type { Diagnostic } from '@s2u/creator-contracts';
import { ASSET_CODES, assetMemberPath, bakedHulls, readAssetDefinition, type AssetDefinition } from '../../src/packs/content/assets';
import { BOX, REF, solidJson, visualJson } from './contentFixtures';

/**
 * FCW-09 (product track; a browser adaptation with no original): a creator pack's prop, `assets/<id>.json`, read into the
 * engine's `AssetDefinition`. Units, axis and scale are the import tool's to bake (`tools/creator-import`); the engine
 * refuses a definition that is not metre, +Y and baked rather than converting it, and refuses a broken frame or hull
 * with the tool's own refusal codes (`asset.` + the tool's code). Fixtures in memory: a 2 x 1.5 x 1 m box, the committed
 * `tools/creator-import/fixtures/props/solid.collision-source.json`'s hull.
 */

/** The identity frame, column-major. */
const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const codes = (r: AssetDefinition | Diagnostic[]): string[] => (Array.isArray(r) ? r.map((d) => d.code) : []);
const ok = (r: AssetDefinition | Diagnostic[]): AssetDefinition => {
  if (Array.isArray(r)) throw new Error(`refused: ${r.map((d) => `${d.code} ${d.text}`).join('; ')}`);
  return r;
};

describe('FCW-09: an AssetDefinition read from a pack member', () => {
  it('reads the solid box: the ref attached, the provenance the pack and the source GLB, the hull in its one frame', () => {
    const def = ok(readAssetDefinition(solidJson(), REF));
    expect(def.ref).toEqual(REF);
    expect(def).toMatchObject({ kind: 'prop', units: 'metre', up: '+Y', transformsBaked: true, visual: { member: 'assets/crate.glb' } });
    expect(def.provenance).toEqual({ pack: REF.pack, member: 'assets/crate.glb', sha256: 'b'.repeat(64) });
    expect(def.collision.intent).toBe('convex');
    expect(bakedHulls(def)[0]!.vertices).toEqual(BOX.vertices);
    expect(assetMemberPath('crate')).toBe('assets/crate.json');
  });

  it('a visual-only prop reads with no hull at all', () => {
    const def = ok(readAssetDefinition(visualJson(), REF));
    expect(def.collision).toEqual({ intent: 'none' });
    expect(bakedHulls(def)).toEqual([]);
  });

  it('bakes the hull\'s frame once: a positive affine frame moves every vertex', () => {
    const lifted = [...I.slice(0, 12), 0, 2, 0, 1];
    const def = ok(readAssetDefinition(solidJson({}, { frame: lifted }), REF));
    expect(bakedHulls(def)[0]!.vertices[4]).toEqual([-1, 3.5, -0.5]);
  });

  it('refuses a frame that is not finite, degenerate or mirrored, with the import tool\'s codes', () => {
    const nan = [...I]; nan[0] = Number.NaN;
    const flat = [...I]; flat[5] = 0;                                   // y collapsed: determinant 0
    const tiny = [1e-5, 0, 0, 0, 0, 1e-5, 0, 0, 0, 0, 1e-5, 0, 0, 0, 0, 1]; // determinant 1e-15, under the tool's 1e-12
    const mirror = [...I]; mirror[0] = -1;
    expect(codes(readAssetDefinition(solidJson({}, { frame: nan }), REF))).toEqual([ASSET_CODES.nonfiniteTransform]);
    expect(codes(readAssetDefinition(solidJson({}, { frame: flat }), REF))).toEqual([ASSET_CODES.degenerateTransform]);
    expect(codes(readAssetDefinition(solidJson({}, { frame: tiny }), REF))).toEqual([ASSET_CODES.degenerateTransform]);
    expect(codes(readAssetDefinition(solidJson({}, { frame: mirror }), REF))).toEqual([ASSET_CODES.mirroredTransform]);
    expect(ASSET_CODES.nonfiniteTransform).toBe('asset.NONFINITE_TRANSFORM');
    expect(ASSET_CODES.degenerateTransform).toBe('asset.DEGENERATE_TRANSFORM');
    expect(ASSET_CODES.mirroredTransform).toBe('asset.MIRRORED_TRANSFORM');
  });

  it('refuses a frame that is not a 16-element affine matrix, and a hull point the frame carries past finite', () => {
    expect(codes(readAssetDefinition(solidJson({}, { frame: [1, 0, 0] }), REF))).toEqual([ASSET_CODES.sourceTransform]);
    const projective = [...I]; projective[3] = 1;
    expect(codes(readAssetDefinition(solidJson({}, { frame: projective }), REF))).toEqual([ASSET_CODES.sourceTransform]);
    const huge = [1e300, 0, 0, 0, 0, 1e300, 0, 0, 0, 0, 1e300, 0, 1e308, 0, 0, 1];
    expect(codes(readAssetDefinition(solidJson({}, { frame: huge }), REF))).toEqual([ASSET_CODES.nonfiniteTransform]);
  });

  it('refuses rather than converts: not metres, not +Y up, not baked', () => {
    expect(codes(readAssetDefinition(solidJson({ units: 'centimetre' }), REF))).toEqual([ASSET_CODES.sourceUnit]);
    expect(codes(readAssetDefinition(solidJson({ up: '+Z' }), REF))).toEqual([ASSET_CODES.sourceUp]);
    expect(codes(readAssetDefinition(solidJson({ transformsBaked: false }), REF))).toEqual([ASSET_CODES.notBaked]);
  });

  it('refuses the tool\'s hull faults: open, non-convex, wound inward, degenerate, an index out of range', () => {
    const open = { ...BOX, faces: BOX.faces.slice(1) };
    const dented = { ...BOX, vertices: BOX.vertices.map((v, i) => (i === 6 ? [0.2, 0.4, 0.1] : v)) };
    const inward = { ...BOX, faces: BOX.faces.map((f) => [...f].reverse()) };
    const flatBox = { ...BOX, vertices: BOX.vertices.map((v) => [v[0], 0, v[2]]) };
    const outOfRange = { ...BOX, faces: BOX.faces.map((f, i) => (i === 0 ? [0, 1, 2, 99] : f)) };
    expect(codes(readAssetDefinition(solidJson({}, { hulls: [open] }), REF))).toEqual([ASSET_CODES.collisionOpen]);
    expect(codes(readAssetDefinition(solidJson({}, { hulls: [dented] }), REF))[0]).toMatch(/^asset\.COLLISION_(NONPLANAR|NONCONVEX)$/);
    expect(codes(readAssetDefinition(solidJson({}, { hulls: [inward] }), REF))).toEqual([ASSET_CODES.collisionWinding]);
    expect(codes(readAssetDefinition(solidJson({}, { hulls: [flatBox] }), REF))).toEqual([ASSET_CODES.collisionDegenerate]);
    expect(codes(readAssetDefinition(solidJson({}, { hulls: [outOfRange] }), REF))).toEqual([ASSET_CODES.collisionIndex]);
  });

  it('refuses a convex intent with no hull, a visual-only one with hulls, and an unknown intent', () => {
    expect(codes(readAssetDefinition(solidJson({}, { hulls: [] }), REF))).toEqual([ASSET_CODES.collisionMissing]);
    expect(codes(readAssetDefinition(solidJson({ collision: { intent: 'none', hulls: [BOX] } }), REF))).toEqual([ASSET_CODES.collisionIntent]);
    expect(codes(readAssetDefinition(solidJson({ collision: { intent: 'mesh' } }), REF))).toEqual([ASSET_CODES.collisionIntent]);
    expect(codes(readAssetDefinition(solidJson({ collision: undefined }), REF))).toEqual([ASSET_CODES.collisionMissing]);
  });

  it('refuses an external URI or an escaping member, a definition of another asset, and an unknown field', () => {
    expect(codes(readAssetDefinition(solidJson({ visual: { member: 'https://example.invalid/crate.glb' } }), REF))).toEqual(['pack.EXTERNAL_URI']);
    expect(codes(readAssetDefinition(solidJson({ source: { member: '../crate.glb', sha256: 'b'.repeat(64) } }), REF))).toEqual(['pack.PATH_ESCAPE']);
    expect(codes(readAssetDefinition(solidJson({ visual: { member: 'assets/crate.png' } }), REF))).toEqual([ASSET_CODES.visualFormat]);
    expect(codes(readAssetDefinition(solidJson({ assetId: 'barrel' }), REF))).toEqual([ASSET_CODES.refMismatch]);
    expect(codes(readAssetDefinition(solidJson({ pivot: [0, 0, 0] }), REF))).toEqual([ASSET_CODES.invalid]);
    expect(codes(readAssetDefinition(solidJson({ schema: 'something/else' }), REF))).toEqual([ASSET_CODES.invalid]);
    expect(codes(readAssetDefinition(solidJson(), { ...REF, assetId: 'no spaces allowed' }))).toEqual([ASSET_CODES.refInvalid]);
  });

  it('refuses bounds that are not finite or are inverted', () => {
    expect(codes(readAssetDefinition(solidJson({ boundsMetres: { min: [1, 0, 0], max: [-1, 1, 1] } }), REF))).toEqual([ASSET_CODES.boundsInvalid]);
    expect(codes(readAssetDefinition(solidJson({ boundsMetres: { min: [0, 0, 0], max: [1, Infinity, 1] } }), REF))).toEqual([ASSET_CODES.boundsInvalid]);
  });

  it('a refusal is the one diagnostics model: a pack-source error with the member named, evidence validation', () => {
    const r = readAssetDefinition(solidJson({ up: '+Z' }), REF) as Diagnostic[];
    expect(r[0]).toMatchObject({ schema: 's2u.creator/diagnostic', source: 'pack', severity: 'error', file: 'assets/crate.json', evidence: 'validation' });
  });

  it('owns its data: a later change to the parsed JSON does not reach the definition', () => {
    const json = solidJson();
    const def = ok(readAssetDefinition(json, REF));
    ((json['collision'] as { hulls: { vertices: number[][] }[] }).hulls[0]!.vertices[0]!)[0] = 42;
    expect(bakedHulls(def)[0]!.vertices[0]).toEqual([-1, 0, -0.5]);
  });
});
