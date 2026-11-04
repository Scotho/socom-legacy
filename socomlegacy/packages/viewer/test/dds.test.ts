import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {decodeDds,ddsInfo,DdsError} from '../src/dds';

/** Random blocks per format (and per BC7 mode) with Pillow's decode of each -- `bcoracle.py fixture 24`; no game data. */
const FIXTURE=JSON.parse(readFileSync(new URL('./dds.fixture.json',import.meta.url),'utf8')) as {kind:string;mode?:number;block:string;rgba:string}[];
const hex=(s:string)=>Uint8Array.from(s.match(/../g)!.map(x=>parseInt(x,16)));
function file(kind:string,blocks:Uint8Array[],w=4*blocks.length,h=4):Uint8Array{
  const head=new Uint8Array(kind==='bc7'?148:128),v=new DataView(head.buffer);
  head.set([0x44,0x44,0x53,0x20]);v.setUint32(4,124,true);v.setUint32(12,h,true);v.setUint32(16,w,true);v.setUint32(76,32,true);v.setUint32(80,4,true);
  const four=kind==='bc7'?'DX10':{bc1:'DXT1',bc2:'DXT3',bc3:'DXT5'}[kind]!;for(let i=0;i<4;i++)head[84+i]=four.charCodeAt(i);
  if(kind==='bc7')v.setUint32(128,98,true);
  const out=new Uint8Array(head.length+blocks.reduce((n,b)=>n+b.length,0));out.set(head);let at=head.length;for(const b of blocks){out.set(b,at);at+=b.length;}return out;
}

describe('DDS decode (HD-4) against Pillow',()=>{
  for(const kind of ['bc1','bc2','bc3','bc7'])it(`${kind}: every fixture block decodes as Pillow decodes it`,()=>{
    const cases=FIXTURE.filter(f=>f.kind===kind);expect(cases.length).toBeGreaterThanOrEqual(24);
    if(kind==='bc7')expect(new Set(cases.map(c=>c.mode))).toEqual(new Set([0,1,2,3,4,5,6,7]));
    const img=decodeDds(file(kind,cases.map(c=>hex(c.block))));
    cases.forEach((c,k)=>{
      const got:number[]=[];for(let y=0;y<4;y++)got.push(...img.data.subarray((y*img.width+4*k)*4,(y*img.width+4*k)*4+16));
      expect(Buffer.from(got).toString('hex'),`${kind}${c.mode===undefined?'':` mode ${c.mode}`} block ${k}`).toBe(c.rgba);
    });
  });
  it('crops a size that is not a multiple of four',()=>{
    const c=FIXTURE.find(f=>f.kind==='bc3')!,img=decodeDds(file('bc3',[hex(c.block)],3,2));
    expect([img.width,img.height,img.data.length]).toEqual([3,2,24]);
    expect(Buffer.from(img.data.subarray(12,24)).toString('hex')).toBe(c.rgba.slice(32,56));
  });
  it('refuses what it does not decode, by name',()=>{
    expect(()=>decodeDds(new Uint8Array(200))).toThrow(DdsError);
    const f=file('bc1',[new Uint8Array(8)]);f[84]=0x41;expect(()=>ddsInfo(f)).toThrow(/FourCC/);
    expect(()=>decodeDds(file('bc3',[new Uint8Array(16)],8,4))).toThrow(/truncated/);
  });
});

describe('DDS bounds and alpha (review finding 5)',()=>{
  const raw=(w:number,h:number,flags:number,amask:number)=>{const b=new Uint8Array(128+w*h*4),v=new DataView(b.buffer);b.set([0x44,0x44,0x53,0x20]);
    v.setUint32(4,124,true);v.setUint32(12,h,true);v.setUint32(16,w,true);v.setUint32(76,32,true);v.setUint32(80,flags,true);v.setUint32(88,32,true);
    v.setUint32(92,0xff,true);v.setUint32(96,0xff00,true);v.setUint32(100,0xff0000,true);v.setUint32(104,amask,true);b.fill(7,128);return b;};
  it('refuses a header that is not the entry\'s size, and short data, before allocating',()=>{
    const big=raw(4,4,0x41,0xff000000);new DataView(big.buffer).setUint32(16,16384,true);new DataView(big.buffer).setUint32(12,16384,true);
    expect(()=>decodeDds(big,{width:4,height:4})).toThrow(/the entry says 4x4/);
    expect(()=>decodeDds(big)).toThrow(/truncated/);
  });
  it('reads a 32-bit file\'s fourth byte as alpha only when the header says so',()=>{
    expect(decodeDds(raw(2,2,0x41,0xff000000)).data[3]).toBe(7);
    expect(decodeDds(raw(2,2,0x40,0)).data[3]).toBe(255);
  });
});
