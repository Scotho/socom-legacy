import {describe,expect,it} from 'vitest';
import {EXPERIMENTAL_DEFAULTS} from '../src/experimentalGraphics';
import {MATCH_EXPERIMENTAL_OFF} from '../src/picture';
import {readFileSync} from 'node:fs';

/**
 * HD.R8 (the owner, 2026-10-31, OT.R92) made VIDEO MODE's third picture "HD (GoE Soul)"; B206 ML-6 (plan
 * 2026-11-06-mods-loader, ML.R11; OT.R110) removed it. MODERN and PS2 hand the match the experimental renderer off,
 * exactly as before (the OFF pins); the HD pack follows the texture pack chosen in MODS, not a picture.
 */
describe('the match\'s picture settings (ML-6)',()=>{
  it('MODERN and PS2: the experimental renderer off, the HD pack off, as before',()=>{
    expect(MATCH_EXPERIMENTAL_OFF).toEqual({...EXPERIMENTAL_DEFAULTS,enabled:false});
    expect(EXPERIMENTAL_DEFAULTS.hdPack).toBe(false);
  });
  it('the match hands its renderer the off settings under either picture, never a picture\'s HD settings',()=>{
    const src=readFileSync(new URL('../src/matchMount.ts',import.meta.url),'utf8');
    expect(src).toMatch(/renderer\?\.setExperimental\?\.\(MATCH_EXPERIMENTAL_OFF\);/);
    expect(src).not.toMatch(/pictureExperimentalSettings/);
  });
});
