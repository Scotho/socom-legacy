import { describe, expect, it } from 'vitest';
import type { LoadedMap } from '../../src/loadMap';
import type { VariantProfile } from '../../src/variants/profile';
import { testroomVariant } from '../../src/variants/testroomSwitch';

/**
 * DAY-FIX2 F3 (product track: a development instrument, a browser adaptation; the batch 2 review's F3): the switch is
 * refused, in plain words, when the page will join a real room -- the test room's online path (`../../src/main` `show`,
 * `NET.url`) and the xbox-renderer page's lobby join or server (`../../src/xboxPrototype/main`) -- so one client never
 * sees a variant in a match the others see as decoded. The map is hand-built with only the fields the switch reads.
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

describe('testroomVariant offline only (DAY-FIX2 F3)', () => {
  it('online: refused in plain words, the map as decoded, the registry never asked', () => {
    let asked = 0;
    const m = makeMap('MP5');
    const out = testroomVariant('?variant=day', m, () => { asked++; return stub; }, { online: true })!;
    expect(out).not.toBeNull();
    expect(asked).toBe(0);
    expect(out.applied).toBe(false);
    expect(out.line).toBe('?variant=day: a variant is shown only offline in the test room (DAY-3); this room is drawn as decoded');
    expect(out.map.world).toBe(m.world);
    expect(out.map.night).toBe(m.night);
    expect(out.map.lightRig).toBe(m.lightRig);
    expect(out.map.diagnostics).toEqual(['decoded note', out.line]);
    expect(m.diagnostics).toEqual(['decoded note']);
  });

  it('online with no ?variant= still changes nothing', () => {
    expect(testroomVariant('', makeMap(), () => stub, { online: true })).toBeNull();
  });

  it('offline (said, or the option absent) the same pair is applied', () => {
    expect(testroomVariant('?variant=day', makeMap('MP5'), () => stub, { online: false })!.applied).toBe(true);
    expect(testroomVariant('?variant=day', makeMap('MP5'), () => stub)!.applied).toBe(true);
  });
});
