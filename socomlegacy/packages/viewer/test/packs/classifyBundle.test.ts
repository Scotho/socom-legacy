import { describe, expect, it } from 'vitest';
import { classifyDrop, type ReadSmall } from '../../src/packs/classify';

/**
 * FP-5 item 1 (FP.R3, FP.R12; product track, a browser adaptation): the drop classifier's sixth marker -- a forge-map
 * bundle (`forge-bundle.json`, FP-4) at the drop's root or in its one folder is a `bundle`, named BEFORE the v2 pack
 * marker, since a bundle carries packs. Synthetic names only, no game data.
 */
const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);
const reader = (m: Record<string, Uint8Array>): ReadSmall => async (name) => m[name] ?? null;
const bundle = (prefix = ''): Record<string, Uint8Array> => ({
  [`${prefix}forge-bundle.json`]: utf8('{}'),
  [`${prefix}packs/0/s2u-pack.json`]: utf8('{}'),
  [`${prefix}packs/0/maps/yard.json`]: utf8('{}'),
  [`${prefix}packs/0/visuals/yard.png`]: utf8('x'),
});

describe('FP-5 item 1: the sixth marker, forge-bundle.json', () => {
  it('at the root: a bundle, its root the drop\'s', async () => {
    const m = bundle();
    expect(await classifyDrop(Object.keys(m), reader(m))).toMatchObject({ kind: 'bundle', root: '', wrapping: null });
  });

  it('in one folder: a bundle, its root that folder', async () => {
    const m = bundle('Sample Yard/');
    expect(await classifyDrop(Object.keys(m), reader(m))).toMatchObject({ kind: 'bundle', root: 'Sample Yard/' });
  });

  it('in two folders: refused, in words', async () => {
    const m = { ...bundle('a/'), ...bundle('b/') };
    const found = await classifyDrop(Object.keys(m), reader(m));
    expect(found.kind).toBe('refused');
    expect(found).toMatchObject({ reason: expect.stringMatching(/forge-bundle\.json/) });
  });

  it("a bundle's packs one folder down do not make it a pack: the envelope at the root decides", async () => {
    const m = bundle();
    expect(await classifyDrop(Object.keys(m), reader(m))).toMatchObject({ kind: 'bundle' });
  });

  it("the review's F4: s2u-pack.json at the root (or in the one folder) is a pack, whatever forge-bundle.json it carries", async () => {
    const atRoot = { 's2u-pack.json': utf8('{}'), 'forge-bundle.json': utf8('{}'), 'maps/yard.json': utf8('{}') };
    expect(await classifyDrop(Object.keys(atRoot), reader(atRoot))).toMatchObject({ kind: 'pack', root: '' });
    const deeper = { 's2u-pack.json': utf8('{}'), 'notes/forge-bundle.json': utf8('{}') };
    expect(await classifyDrop(Object.keys(deeper), reader(deeper))).toMatchObject({ kind: 'pack' });
    const folder = { 'x/s2u-pack.json': utf8('{}'), 'x/forge-bundle.json': utf8('{}'), 'x/a/b/forge-bundle.json': utf8('{}') };
    expect(await classifyDrop(Object.keys(folder), reader(folder))).toMatchObject({ kind: 'pack', root: 'x/' });
  });

  it('a v2 pack with no envelope is still a pack', async () => {
    const m = { 's2u-pack.json': utf8('{}'), 'maps/yard.json': utf8('{}') };
    expect(await classifyDrop(Object.keys(m), reader(m))).toMatchObject({ kind: 'pack' });
  });
});
