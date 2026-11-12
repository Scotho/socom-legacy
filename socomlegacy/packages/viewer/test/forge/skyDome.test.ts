import { describe, expect, it } from 'vitest';
import type { LoadedMap, LoadedMesh } from '../../src/loadMap';
import { SKY_DOME_TEXTURE_ADAPTATION, skyDomeFor, skyPartsOf } from '../../src/forge/skyDome';

/**
 * A new empty map's sky (a browser adaptation, FG.R2; `skyDomeFor`'s doc): a disc map's own sky parts -- its world chunks
 * textured with a sky or cloud image, the adaptation `SKY_DOME_TEXTURE_ADAPTATION` names -- copied over the floor,
 * centred on it, their textures carried (renamed `<archive>/<name>` into another archive).
 */
const mesh = (textureName: string | null, positions: number[]): LoadedMesh =>
  ({ textureName, positions: Float32Array.from(positions), cells: [1], switchPath: 'x' } as unknown as LoadedMesh);
const SOURCE = {
  archive: 'MP6',
  world: [
    mesh('sky01.tif', [90, 500, 190, 110, 500, 210]),
    mesh('gen_cloud_n_sun_256x256.tif', [100, 600, 200]),
    mesh('rock.tif', [0, 0, 0]),
    mesh(null, [0, 0, 0]),
  ],
  textures: { 'sky01.tif': 'SKY', 'gen_cloud_n_sun_256x256.tif': 'CLOUD', 'rock.tif': 'ROCK' },
  textureFlags: { 'sky01.tif': 1 },
} as unknown as LoadedMap;

describe('the sky dome copy (skyDome)', () => {
  it('names its adaptation: the texture-name match on sky or cloud images (the names research 196 reads)', () => {
    expect(SKY_DOME_TEXTURE_ADAPTATION.source).toBe('sky|cloud');
    for (const name of ['sky01.tif', 'gen_cloud_n_sun_256x256.tif', 'mp82_skycap.tif', 'SKY02.TIF']) expect(SKY_DOME_TEXTURE_ADAPTATION.test(name), name).toBe(true);
    expect(SKY_DOME_TEXTURE_ADAPTATION.test('rock.tif')).toBe(false);
  });

  it("takes only the map's sky and cloud parts", () => {
    expect(skyPartsOf(SOURCE).map((m) => m.textureName)).toEqual(['sky01.tif', 'gen_cloud_n_sun_256x256.tif']);
  });

  it('centres the dome over the floor, keeps its height, drops its cells and switch, and carries its textures renamed', () => {
    const dome = skyDomeFor(SOURCE, 'MP2');
    expect(dome.world.map((m) => m.textureName)).toEqual(['MP6/sky01.tif', 'MP6/gen_cloud_n_sun_256x256.tif']);
    expect(Array.from(dome.world[0]!.positions)).toEqual([-10, 500, -10, 10, 500, 10]);
    expect(Array.from(dome.world[1]!.positions)).toEqual([0, 600, 0]);
    expect('cells' in dome.world[0]!).toBe(false);
    expect('switchPath' in dome.world[0]!).toBe(false);
    expect(dome.textures).toEqual({ 'MP6/sky01.tif': 'SKY', 'MP6/gen_cloud_n_sun_256x256.tif': 'CLOUD' });
    expect(dome.textureFlags).toEqual({ 'MP6/sky01.tif': 1 });
    // The source itself is untouched.
    expect(Array.from(SOURCE.world[0]!.positions)).toEqual([90, 500, 190, 110, 500, 210]);
  });

  it('keeps the names into its own archive, and gives nothing where a map has no sky', () => {
    expect(skyDomeFor(SOURCE, 'MP6').world[0]!.textureName).toBe('sky01.tif');
    expect(skyDomeFor(SOURCE, null).world[0]!.textureName).toBe('sky01.tif');
    const none = skyDomeFor({ ...SOURCE, world: [mesh('rock.tif', [0, 0, 0])] } as LoadedMap, 'MP2');
    expect(none).toEqual({ world: [], textures: {}, textureFlags: {} });
  });
});
