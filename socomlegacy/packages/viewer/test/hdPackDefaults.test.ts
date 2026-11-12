import {expect,it} from 'vitest';
import {EXPERIMENTAL_DEFAULTS,EXPERIMENTAL_GROUPS,MODS_PACK_SETTINGS,groupKeys} from '../src/experimentalGraphics';

/**
 * OT.R92 (review finding 7): the HD pack is off by default. B206 ML-6 (ML.R11, R12; OT.R110): the test room's HD switch
 * and its texture-pack group are removed -- the keys stay (ML.R14), the panel reads neither, and its settings carry them
 * at their off values (`MODS_PACK_SETTINGS`): the packs follow the MODS choice (`./packs/pagePacks`).
 */
it('the HD texture pack is off by default; no row of the panel reads it or the texture pack',()=>{
  expect(EXPERIMENTAL_DEFAULTS.hdPack).toBe(false);
  expect(EXPERIMENTAL_GROUPS.find(g=>g.id==='hdPack')).toBeUndefined();
  expect(EXPERIMENTAL_GROUPS.find(g=>g.id==='pack')).toBeUndefined();
  expect(EXPERIMENTAL_GROUPS.flatMap(groupKeys)).not.toContain('hdPack');
  expect(EXPERIMENTAL_GROUPS.flatMap(groupKeys)).not.toContain('localTexturePack');
  expect(MODS_PACK_SETTINGS).toEqual({localTexturePack:null,hdPack:false});
});
