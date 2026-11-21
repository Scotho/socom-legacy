import { describe, expect, it } from 'vitest';
import { textureScopeOf } from '../src/mapTextures';

/**
 * The asset browser's Textures tab sorts a map's textures by the library the world root's `assetlibs` names
 * (`CSaveLoad::LoadAssetLib_PS2`, `zNode/node_saveload.cpp:91-114`): the guns' `//common/assetlib/weapons`, the other
 * `//common/assetlib/*` libraries every map can list, and the map's own `//mp/<map>/...` or `//sp/<map>/...`.
 */
describe('textureScopeOf', () => {
  it('the guns\' library is Weapons', () => {
    expect(textureScopeOf('//common/assetlib/weapons')).toBe('weapons');
  });
  it('another common library is shared (hudweaps is the HUD\'s, not the guns\')', () => {
    for (const p of ['//common/assetlib/effects', '//common/assetlib/turrets', '//common/assetlib/pavehawk', '//common/assetlib/hudweaps', '//common/assetlib/font']) {
      expect(textureScopeOf(p), p).toBe('shared');
    }
  });
  it('a map\'s libraries are its own', () => {
    for (const p of ['//mp/mp61', '//mp/mp61/flib', '//mp/mp61/clib', '//mp/mp61/junkyard', '//mp/mp61/bcar', '//sp/m51/benz', '//sp/m51']) {
      expect(textureScopeOf(p), p).toBe('own');
    }
  });
  it('no path (a root with no assetlibs: the map\'s own TXR alone) is its own', () => {
    expect(textureScopeOf('')).toBe('own');
  });
});
