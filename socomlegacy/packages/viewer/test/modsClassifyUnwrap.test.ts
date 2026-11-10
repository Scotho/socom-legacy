import { describe, expect, it, vi } from 'vitest';
import * as contracts from '@s2u/creator-contracts';
import { encodePng } from '../../../tools/png';

/**
 * B206 ML-3 step 0 (ML.R3; product track, ML.R2): the drop classifier's Thunderstore unwrap is ML-5's shared
 * `unwrapThunderstore` (creator-contracts `packs.ts`), plugged into `ClassifyOptions.unwrap`'s default -- one unwrap in
 * the repository, not a second reader in the viewer. A caller's own hook still takes its place. Synthetic files only.
 */
vi.mock('@s2u/creator-contracts', async (importOriginal) => {
  const real = await importOriginal<typeof contracts>();
  return { ...real, unwrapThunderstore: vi.fn(real.unwrapThunderstore) };
});
const { classifyDrop } = await import('../src/packs/classify');
const classify = await import('../src/packs/classify');

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);
const wrapped = (): Record<string, Uint8Array> => ({
  'manifest.json': utf8(JSON.stringify({ name: 'Wrapped_mod', version_number: '1.0.0', website_url: '', description: 'A test pack.', dependencies: [] })),
  'icon.png': encodePng(256, 256, new Uint8Array(256 * 256 * 4)),
  'README.md': utf8('# A test pack\n'),
  'payload/mod.json': utf8('{}'),
  'payload/hello.txt': utf8('hello'),
});
const reader = (m: Record<string, Uint8Array>) => async (name: string) => m[name] ?? null;

describe('ML-3 step 0: one Thunderstore unwrap (ML-5 shared, ML-1 seam)', () => {
  it('the default unwrap is creator-contracts unwrapThunderstore, called once per drop', async () => {
    const spy = vi.mocked(contracts.unwrapThunderstore);
    spy.mockClear();
    const m = wrapped();
    expect(await classifyDrop(Object.keys(m), reader(m))).toMatchObject({ kind: 'mod', root: 'payload/', wrapping: { name: 'Wrapped_mod', version: '1.0.0' } });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('a caller\'s own unwrap hook takes the default\'s place', async () => {
    const spy = vi.mocked(contracts.unwrapThunderstore);
    spy.mockClear();
    const m = wrapped();
    const unwrap = vi.fn(async () => ({ storeFiles: ['manifest.json', 'icon.png', 'README.md'], name: 'Hooked', version: '9.9.9' }));
    expect(await classifyDrop(Object.keys(m), reader(m), { unwrap })).toMatchObject({ kind: 'mod', wrapping: { name: 'Hooked' } });
    expect(unwrap).toHaveBeenCalledTimes(1);
    expect(spy).not.toHaveBeenCalled();
  });

  it('ML-1\'s own reader is gone: the classifier exports no second unwrap', () => {
    expect('readThunderstoreWrapping' in classify).toBe(false);
  });
});
