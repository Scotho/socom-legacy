import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {nibble4,pcsx2Names,word32,xxh3,type HashRecord} from '../pcsx2Names';

/**
 * Synthetic records (random texels and palettes, no game data) hex-encoded, named by an independent reconstruction built on
 * PCSX2's own column tables (`namevectors.py`, the HD evidence folder) -- every format and the small-texture paths.
 */
type Vector=Omit<HashRecord,'pixels'|'pal'>&{pixels:string;pal:string|null;names:string[]};
const VECTORS=JSON.parse(readFileSync(new URL('./pcsx2Names.fixture.json',import.meta.url),'utf8')) as Vector[];
const hex=(s:string)=>new Uint8Array(Buffer.from(s,'hex'));

describe('PCSX2 replacement names (HD-5)',()=>{
  it('lays the block formats out as permutations',()=>{
    for(const [f,n] of [[word32,64],[nibble4,512]] as const){
      const w=n===64?8:32,h=n===64?8:16,seen=new Set<number>();
      for(let y=0;y<h;y++)for(let x=0;x<w;x++)seen.add(f(x,y));
      expect(seen.size).toBe(n);expect(Math.max(...seen)).toBe(n-1);
    }
  });
  it('prints XXH3-64 as PCSX2 does, without leading zeros',async()=>{
    expect(await xxh3(new Uint8Array([1,2,3,4,5]))).toBe('59b68387649283c1');
  });
  for(const v of VECTORS)it(`names a PSM 0x${v.psm.toString(16)} ${1<<v.tw}x${1<<v.th} record (csm ${v.csm}, csa ${v.csa}, palette ${v.palFormat})`,async()=>{
    const r:HashRecord={...v,pixels:hex(v.pixels),pal:v.pal?hex(v.pal):null};
    expect((await pcsx2Names(r)).map(n=>n.name)).toEqual(v.names);
  });
});
