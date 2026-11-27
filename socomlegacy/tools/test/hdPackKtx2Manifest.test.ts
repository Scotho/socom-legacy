import {describe,expect,it} from 'vitest';
import {validateHdManifest,type HdEntry,type HdManifest} from '../../packages/viewer/src/hdTexturePack';
import {checkPackKtx2,ktx2PackManifest} from '../hdPackKtx2Check';

/**
 * WM-34 (product track: a tool): the manifest of a pack converted to KTX2 (`tools/hd-pack-ktx2.ts --out`) -- each
 * converted payload's entries renamed `<n>.ktx2`, format `ktx2`, every other field the DDS entry's (the decoded RGBA is the
 * same, so its size and sha256 are), the unconverted payloads kept as they are, `packedBytes` the new pack's files.
 * Synthetic entries; no pack.
 */
const h=(c:string)=>c.repeat(64);
const entry=(file:string,key:string,format:HdEntry['format']='dds',extra:Partial<HdEntry>={}):HdEntry=>({key:h(key),width:4,height:4,file,format,outWidth:8,outHeight:8,bytes:256,sha256:h('e'),tier:'A',source:'synthetic',...extra});
const pack=(entries:HdEntry[],packed?:number):HdManifest=>({format:'s2u-hd-texture-pack',version:1,localOnly:true,game:'SCUS-97275',name:'pack',method:'synthetic',
  entries,totalBytes:[...new Map(entries.map(e=>[e.file,e.bytes])).values()].reduce((a,b)=>a+b,0),...(packed!==undefined?{packedBytes:packed}:{})});

describe('ktx2PackManifest (WM-34)',()=>{
  it('renames each converted payload to <n>.ktx2 and keeps the rest of its entries; the PNG stays',()=>{
    const m=pack([entry('0.dds','a'),entry('1.dds','b'),entry('1.dds','c'),entry('2.png','d','png')],999);
    const out=ktx2PackManifest(m,new Map([['0.dds',100],['1.dds',120]]),f=>f==='2.png'?50:NaN);
    expect(out.entries.map(e=>[e.file,e.format])).toEqual([['0.ktx2','ktx2'],['1.ktx2','ktx2'],['1.ktx2','ktx2'],['2.png','png']]);
    expect(out.entries[1]).toEqual({...m.entries[1],file:'1.ktx2',format:'ktx2'});
    expect(out.totalBytes).toBe(m.totalBytes);
    expect(out.packedBytes).toBe(100+120+50);
    expect(validateHdManifest(JSON.parse(JSON.stringify(out)))).toEqual(out);
  });
  it('keeps an unconverted DDS (a mismatch) as it is, its size from the old pack',()=>{
    const m=pack([entry('0.dds','a'),entry('1.dds','b')]);
    const out=ktx2PackManifest(m,new Map([['0.dds',100]]),f=>f==='1.dds'?300:NaN);
    expect(out.entries.map(e=>e.file)).toEqual(['0.ktx2','1.dds']);
    expect(out.packedBytes).toBe(400);
  });
  it('says in its method that it is the KTX2 conversion, within the bound',()=>{
    const out=ktx2PackManifest(pack([entry('0.dds','a')]),new Map([['0.dds',1]]),()=>NaN);
    expect(out.method).toContain('KTX2');
    const long=ktx2PackManifest({...pack([entry('0.dds','a')]),method:'x'.repeat(512)},new Map([['0.dds',1]]),()=>NaN);
    expect(long.method.length).toBeLessThanOrEqual(512);
  });
  it('refuses a converted name that is not a payload of the pack, and a missing size',()=>{
    expect(()=>ktx2PackManifest(pack([entry('0.dds','a')]),new Map([['9.dds',1]]),()=>1)).toThrow(/9\.dds/);
    expect(()=>ktx2PackManifest(pack([entry('0.dds','a'),entry('1.dds','b')]),new Map([['0.dds',1]]),()=>NaN)).toThrow(/1\.dds/);
  });
  // Review M1 (wm-packs-deliver 7b6693688b): a pack with a WM-32 layout overlay keeps its overlay through the conversion.
  it('converts a layout overlay\'s payloads too: renamed, counted in packedBytes, layoutBytes kept',()=>{
    const base=pack([entry('0.dds','a'),entry('1.dds','b')]);
    const m:HdManifest={...base,layouts:{xbox:[entry('2.dds','b',undefined,{sha256:h('f')})]},layoutBytes:256};
    validateHdManifest(m);
    const out=ktx2PackManifest(m,new Map([['0.dds',10],['1.dds',20],['2.dds',30]]),()=>NaN);
    expect(out.layouts?.xbox?.map(e=>[e.file,e.format])).toEqual([['2.ktx2','ktx2']]);
    expect(out.layoutBytes).toBe(256);
    expect(out.packedBytes).toBe(60);
    expect(validateHdManifest(JSON.parse(JSON.stringify(out)))).toEqual(out);
  });
  it('checkPackKtx2 reads a layout overlay\'s payloads (they are converted and kept)',()=>{
    const base=pack([entry('0.png','a','png')]);
    const m:HdManifest={...base,layouts:{xbox:[entry('1.png','a','png',{sha256:h('f')})]},layoutBytes:256};
    const asked:string[]=[];
    const r=checkPackKtx2(m,f=>{asked.push(f);return new Uint8Array(0);});
    expect(asked).toEqual([]);                 // PNG payloads are counted, never read
    expect(r.payloads).toBe(2);expect(r.png).toBe(2);
  });
});
