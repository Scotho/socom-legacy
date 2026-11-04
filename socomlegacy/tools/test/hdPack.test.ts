import {describe,expect,it} from 'vitest';
import {buildHdManifest,parseName,resolveFiles,type PackFile} from '../hdPack';
import {pcsx2Names} from '../pcsx2Names';
import type {DiscTextureRecord} from '../discTextureRecords';

/** Synthetic records and pack files (no game data): each file named as PCSX2 would name its record, or not. */
let seed=7;const rnd=()=>(seed=(seed*1103515245+12345)>>>0)>>>24;
const bytes=(n:number)=>Uint8Array.from({length:n},rnd);
function record(i:number,over:Partial<DiscTextureRecord>={}):DiscTextureRecord{
  return {where:`TEST/T_TXR.ZED:t${i}.tif`,name:`t${i}.tif`,width:16,height:16,psm:0x13,tw:4,th:4,tcc:1,csa:0,csm:0,tbw:1,tbp0:0,cbp:0,cpsm:0,
    pixels:bytes(256),pal:bytes(1024),palFormat:0,rgbaSha256:(i.toString(16)).padStart(64,'0'),rgba:new Uint8ClampedArray(1024),...over};
}
function dds(w:number,h:number,fill:number):Uint8Array{
  const b=new Uint8Array(128+w*h*4),v=new DataView(b.buffer);b.set([0x44,0x44,0x53,0x20]);
  v.setUint32(4,124,true);v.setUint32(12,h,true);v.setUint32(16,w,true);v.setUint32(76,32,true);v.setUint32(80,0x41,true);v.setUint32(88,32,true);
  v.setUint32(92,0xff,true);v.setUint32(96,0xff00,true);v.setUint32(100,0xff0000,true);v.setUint32(104,0xff000000,true);
  b.fill(fill,128);return b;
}
const file=(name:string,data:Uint8Array):PackFile=>({name,read:()=>data});

describe('HD pack generator (HD-5)',()=>{
  it('parses a PCSX2 name and refuses anything else',()=>{
    expect(parseName('abc-def-00005553.dds')).toMatchObject({tex:'abc',clut:'def',psm:0x13,tw:5,th:5,tcc:1});
    expect(parseName('abc-00001580.png')).toMatchObject({tex:'abc',clut:null,psm:0,tw:6,th:5});
    expect(parseName('desktop.ini')).toBeNull();expect(parseName('a-b-c-d.dds')).toBeNull();
  });
  it('binds each file at its tier, reports the rest, and keys the manifest by decoded image',async()=>{
    const recs=[record(1),record(2),record(3),record(4,{pixels:new Uint8Array(256).fill(9)})],[n1,n2,n3,n4]=await Promise.all(recs.map(async r=>(await pcsx2Names(r))[0]!));
    const a=dds(64,64,10),files=[
      file(`${n1!.name}.dds`,a),                                                     // A
      file(`${n2!.tex}-${n2!.clut}-${(parseInt(n2!.name.split('-')[2]!,16)&~(1<<14)).toString(16).padStart(8,'0')}.dds`,dds(32,32,20)), // A2 (TCC 0)
      file('1111111111111111-2222222222222222-00001113.dds',a),                     // B: same bytes as the A file
      file(`${n3!.tex}-3333333333333333-00001113.dds`,dds(48,48,30)),                // C: texels only
      file('4444444444444444-5555555555555555-00001113.dds',dds(8,8,40)),             // below the bar
      file('6666666666666666-7777777777777777-00001113.dds',dds(16,16,50)),           // image tier, accepted
      file('desktop.ini',new Uint8Array(4)),
      file(`${n4!.tex}-8888888888888888-00001113.dds`,dds(64,64,60)),                 // single-value texels: no C
    ];
    const {bound,below}=await resolveFiles(recs,files,{'6666666666666666-7777777777777777-00001113':{tier:'F',accept:true,rgba:[recs[0]!.rgbaSha256]}});
    expect(Object.fromEntries([...bound].map(([n,r])=>[n.slice(0,4),r.tier]))).toEqual({[n1!.name.slice(0,4)]:'A',[files[1]!.name.slice(0,4)]:'A2','1111':'B',[n3!.tex.slice(0,4)]:'C','6666':'F'});
    expect(below.map(b=>b.file).sort()).toEqual(['4444444444444444-5555555555555555-00001113.dds',`${n4!.tex}-8888888888888888-00001113.dds`,'desktop.ini'].sort());
    const built=buildHdManifest(recs,files,bound,below,{name:'HD test',method:'pcsx2 replacements',game:'SCUS-97275'});
    const by=Object.fromEntries(built.manifest.entries.map(e=>[e.key,e]));
    expect(by[recs[0]!.rgbaSha256]).toMatchObject({tier:'A',outWidth:64,outHeight:64,width:16,height:16});   // A beats B and F for the same image
    expect(by[recs[1]!.rgbaSha256]).toMatchObject({tier:'A2',outWidth:32});expect(by[recs[2]!.rgbaSha256]).toMatchObject({tier:'C',outWidth:48,format:'png'});   // recoloured into the record's palette
    expect([...built.payloads.values()].filter(v=>typeof v!=='string').length).toBe(1);
    expect(built.payloads.size).toBe(3);expect(built.id).toMatch(/^[a-f0-9]{64}$/);
  });
});
