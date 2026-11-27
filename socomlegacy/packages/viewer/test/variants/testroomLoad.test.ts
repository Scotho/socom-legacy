import { describe, expect, it } from 'vitest';
import type { MapVariant } from '@s2u/archive';
import type { LoadedMap } from '../../src/loadMap';
import type { VariantProfile } from '../../src/variants/profile';
import { prepareTestroomVariant, testroomVariant, variantBlocksOnline, variantProfileWait } from '../../src/variants/testroomSwitch';

/**
 * DAY-3b (product track: a development instrument, a browser adaptation; the batch 2 review's F3 remainder). The test
 * room awaits the variant's profile (`./profiles` `loadVariantProfile`) before the switch runs, so `?variant=day` on MP5
 * draws Abandoned (Day) rather than "not built yet"; and a map that carries a variant never reaches a room: turning
 * Online on with one loaded reloads the map as decoded (`variantBlocksOnline`, asked by `../../src/main` `connectNet`).
 * The loader and the registry are stubs injected as parameters; the map is hand-built with only the fields read.
 */
function makeMap(archive = 'MP5'): LoadedMap {
  return {
    archive, path: `RUN/${archive}.ZDB`, name: 'test', diagnostics: ['decoded note'],
    world: [{ textureName: 'ground.tif', positions: Float32Array.from([0, 0, 0]), colors: Float32Array.from([0.5, 0.5, 0.5, 1]), fog: true, cull: false }],
    props: [], textures: {}, textureFlags: {},
    camera: null,
    night: { mission: true, lens: null },
    lightRig: { directions: [[0, 1, 0]], colours: [[0.2, 0.2, 0.3]], ambient: [0.1, 0.1, 0.1] },
  } as unknown as LoadedMap;
}

const stub: VariantProfile = {
  stem: 'MP5', variant: 'day', colours: null, keepTextures: [], hideTextures: [], textureSwaps: {},
  night: { mission: false, lens: null },
  lightRig: { directions: [[0, -1, 0]], colours: [[0.96, 0.93, 0.86]], ambient: [0.5, 0.5, 0.5] },
  camera: {},
};

/** A loader that records its asks and resolves only when released, so a test sees the switch wait on it. */
function gatedLoader(answer: VariantProfile | undefined) {
  const asks: [string, MapVariant][] = [];
  let release = (): void => {};
  const gate = new Promise<void>((r) => { release = r; });
  const load = async (stem: string, v: MapVariant): Promise<VariantProfile | undefined> => { asks.push([stem, v]); await gate; return answer; };
  return { asks, load, release: () => release() };
}
const none = (): VariantProfile | undefined => undefined;

describe('prepareTestroomVariant: the profile awaited before the switch (DAY-3b)', () => {
  it('on the table and offline: loadVariantProfile is asked for the pair and awaited, then the profile applied', async () => {
    const l = gatedLoader(stub);
    let settled = false;
    const p = prepareTestroomVariant('?variant=day', makeMap('MP5'), {}, l.load, none).then((v) => { settled = true; return v; });
    await Promise.resolve();
    expect(l.asks).toEqual([['MP5', 'day']]);
    expect(settled).toBe(false);                            // the switch waits on the load
    l.release();
    const out = (await p)!;
    expect(out.applied).toBe(true);
    expect(out.map.night).toEqual({ mission: false, lens: null });
    expect(out.line).toMatch(/Abandoned \(Day\)/);
  });

  it('a load that answers none (the data switch off, a file missing) or throws: the map as decoded, said', async () => {
    const empty = await prepareTestroomVariant('?variant=day', makeMap('MP5'), {}, async () => undefined, none);
    expect(empty!.applied).toBe(false);
    expect(empty!.line).toMatch(/not built yet/);
    const warn = console.warn; console.warn = () => {};
    try {
      const thrown = await prepareTestroomVariant('?variant=day', makeMap('MP5'), {}, async () => { throw new Error('fetch failed'); }, none);
      expect(thrown!.applied).toBe(false);
      expect(thrown!.line).toMatch(/drawn as decoded/);
    } finally { console.warn = warn; }
  });

  it('online: refused without loading', async () => {
    const l = gatedLoader(stub);
    const out = (await prepareTestroomVariant('?variant=day', makeMap('MP5'), { online: true }, l.load, none))!;
    expect(l.asks).toEqual([]);
    expect(out.applied).toBe(false);
    expect(out.line).toMatch(/only offline/);
  });

  it('off the table (day on MP2, night on MP5), a word that is no time, or no ?variant=: nothing loaded', async () => {
    const l = gatedLoader(stub);
    expect((await prepareTestroomVariant('?variant=day', makeMap('MP2'), {}, l.load, none))!.line).toMatch(/MP2 has no day variant/);
    expect((await prepareTestroomVariant('?variant=night', makeMap('MP5'), {}, l.load, none))!.line).toMatch(/MP5 has no night variant/);
    expect((await prepareTestroomVariant('?variant=dusk', makeMap('MP5'), {}, l.load, none))!.line).toMatch(/"dusk"/);
    expect(await prepareTestroomVariant('?map=MP5', makeMap('MP5'), {}, l.load, none)).toBeNull();
    expect(l.asks).toEqual([]);
  });
});

describe('variantProfileWait: what the test room awaits before show (DAY-3b)', () => {
  it('a promise only for a table pair, offline, not loaded yet; null otherwise (show runs at once, as before)', async () => {
    const l = gatedLoader(stub);
    expect(variantProfileWait('', makeMap('MP5'), {}, l.load, none)).toBeNull();
    expect(variantProfileWait('?variant=day', makeMap('MP5'), { online: true }, l.load, none)).toBeNull();
    expect(variantProfileWait('?variant=day', makeMap('MP2'), {}, l.load, none)).toBeNull();
    expect(variantProfileWait('?variant=day', makeMap('MP5'), {}, l.load, () => stub)).toBeNull();   // already loaded
    expect(l.asks).toEqual([]);
    const wait = variantProfileWait('?variant=day', makeMap('mp5'), {}, l.load, none);
    expect(wait).not.toBeNull();
    l.release();
    expect(await wait).toBe(stub);
    expect(l.asks).toEqual([['MP5', 'day']]);
  });

  it('never rejects: a failed load resolves undefined (the switch then draws the map as decoded)', async () => {
    const warn = console.warn; console.warn = () => {};
    try {
      await expect(variantProfileWait('?variant=day', makeMap('MP5'), {}, async () => { throw new Error('x'); }, none)).resolves.toBeUndefined();
    } finally { console.warn = warn; }
  });
});

describe('variantBlocksOnline: a variant never reaches a room (DAY-3b, F3)', () => {
  it('a map the switch drew as a variant blocks Online; offline it does not', () => {
    const shown = testroomVariant('?variant=day', makeMap('MP5'), () => stub)!;
    expect(shown.applied).toBe(true);
    expect(variantBlocksOnline(shown.map, true)).toBe(true);
    expect(variantBlocksOnline(shown.map, false)).toBe(false);
    expect(variantBlocksOnline({ ...shown.map }, true)).toBe(true);   // the mark survives a copy (customOffline, a spread)
  });

  it('a decoded map, or one the switch refused, does not block', () => {
    expect(variantBlocksOnline(makeMap('MP5'), true)).toBe(false);
    expect(variantBlocksOnline(testroomVariant('?variant=day', makeMap('MP2'), () => stub)!.map, true)).toBe(false);
    expect(variantBlocksOnline(testroomVariant('?variant=day', makeMap('MP5'), none)!.map, true)).toBe(false);
  });
});
