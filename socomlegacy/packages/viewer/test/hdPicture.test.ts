import {describe,expect,it} from 'vitest';
import {EXPERIMENTAL_DEFAULTS} from '../src/experimentalGraphics';
import {pictureExperimentalSettings} from '../src/picture';

/**
 * HD.R8 (the owner, 2026-10-31, OT.R92): VIDEO MODE's third picture is "HD (GoE Soul)" -- the Experimental renderer at the
 * owner's defaults with Colour adjustment and Adjust existing map detail off and the HD pack on, in every match. MODERN and
 * PS2 hand the match the experimental renderer off, exactly as before (the OFF pins).
 */
describe('the match\'s picture settings (HD-next)',()=>{
  it('HD (GoE Soul): the owner\'s Experimental defaults, colour adjustment and map detail off, the HD pack on',()=>{
    expect(pictureExperimentalSettings('experimental')).toEqual({...EXPERIMENTAL_DEFAULTS,enabled:true,grade:false,detailAdjust:false,fxaa:false,textureBias:false,hdPack:true});
  });
  it('MODERN and PS2: the experimental renderer off, the HD pack off, as before',()=>{
    for(const p of ['modern','ps2'] as const)expect(pictureExperimentalSettings(p)).toEqual({...EXPERIMENTAL_DEFAULTS,enabled:false});
    expect(EXPERIMENTAL_DEFAULTS.hdPack).toBe(false);
  });
});
