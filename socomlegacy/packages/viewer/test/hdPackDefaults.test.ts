import {expect,it} from 'vitest';
import {EXPERIMENTAL_DEFAULTS,EXPERIMENTAL_GROUPS} from '../src/experimentalGraphics';

/** OT.R92 (review finding 7): the HD pack is off by default and its row turns it off, as GX-24's rows are pinned. */
it('the HD texture pack is off by default and off with its group off',()=>{
  expect(EXPERIMENTAL_DEFAULTS.hdPack).toBe(false);
  expect(EXPERIMENTAL_GROUPS.find(g=>g.id==='hdPack')?.off).toEqual({hdPack:false});
});
