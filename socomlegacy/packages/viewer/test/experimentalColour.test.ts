import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {postShader} from './experimentalPostFixture';
import baseline from './experimentalColourOriginal.json';
import {experimentalColourGains,experimentalPostVariant} from '../src/experimentalColour';
import {EXPERIMENTAL_DEFAULTS} from '../src/experimentalGraphics';

describe('experimental colour graph extensions',()=>{
  const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
  for(const kind of ['GLSL','WGSL'] as const) for(const bloom of [false,true]) for(const roll of [false,true]) {
    it(kind+'/'+bloom+'/'+roll+' keeps every previous shader when the new options are off',()=>{
      expect(hash(postShader(kind,bloom,roll))).toBe(baseline.hashes[(kind+'/'+bloom+'/'+roll) as keyof typeof baseline.hashes]);
    });
    for(const feature of [2,4,8]) it(kind+'/'+bloom+'/'+roll+' adds only requested colour feature '+feature,()=>{
      const before=hash(postShader(kind,bloom,roll));
      const after=hash(postShader(kind,bloom,roll,undefined,feature,{whiteBalance:true,warmth:0.5,tint:-0.25,toneBalance:true,shadows:0.5,highlights:-0.5,bloomTint:true,bloomRed:1.5,bloomGreen:0.5,bloomBlue:1}));
      if(feature===8&&!bloom) expect(after).toBe(before); // tint has no effect on the world-only/flash path
      else expect(after).not.toBe(before);
      expect(hash(postShader(kind,bloom,roll))).toBe(before);
    });
  }
  it('compiles every combination on both shader backends without another texture sample',()=>{
    for(const kind of ['GLSL','WGSL'] as const) for(let features=0;features<16;features++) {
      const shader=postShader(kind,true,(features&1)!==0,undefined,features);
      expect(shader).not.toMatch(/NaN|Infinity/);
      const samples=(s:string)=>(s.match(/texture(?:Sample|Lod|Grad)?\s*\(/g)??[]).length;
      expect(samples(shader)).toBe(samples(postShader(kind,true,(features&1)!==0)));
    }
  });
});

describe('experimental colour values and structural neutral selection',()=>{
  it('keeps neutral gains and applies opposite warmth and green-magenta directions within the documented range',()=>{
    expect(experimentalColourGains(0,0)).toEqual([1,1,1]);
    const warm=experimentalColourGains(1,0),cool=experimentalColourGains(-1,0),magenta=experimentalColourGains(0,1);
    expect(warm[0]).toBeCloseTo(1.189207115);expect(warm[1]).toBe(1);expect(warm[2]).toBeCloseTo(0.840896415);
    expect(cool).toEqual([warm[2],1,warm[0]]);
    expect(magenta).toEqual([warm[0],warm[2],warm[0]]);
    expect(experimentalColourGains(10,-10)).toEqual(experimentalColourGains(1,-1));
  });
  it('selects no new graph for disabled or neutral controls, or tint without an active bloom',()=>{
    const neutral={...EXPERIMENTAL_DEFAULTS,enabled:true,whiteBalance:true,toneBalance:true,bloomTint:true};
    expect(experimentalPostVariant(neutral)).toBe(0);
    const changed={...neutral,warmth:0.5,shadows:0.5,bloomRed:1.5};
    expect(experimentalPostVariant(changed)).toBe(14);
    expect(experimentalPostVariant({...changed,enabled:false})).toBe(0);
    expect(experimentalPostVariant({...changed,whiteBalance:false,toneBalance:false,bloom:false})).toBe(0);
    expect(experimentalPostVariant({...changed,whiteBalance:false,toneBalance:false,bloomStrength:0})).toBe(0);
  });
});
