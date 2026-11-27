import {describe,expect,it} from 'vitest';
import {layoutOverlay} from '../hdPackLayoutOverlay';
import {validateHdManifest,type HdEntry,type HdManifest} from '../../packages/viewer/src/hdTexturePack';
import {hdEntriesFor} from '../../packages/viewer/src/hdPackLayout';

/**
 * WM-32 (product track, a tool; mechanism only -- the pack author's permission pending): the PlayStation-button and
 * Xbox-button packs made one, the Xbox files as a layout overlay. Synthetic manifests only: no pack file, no art.
 */
const h=(n:number)=>n.toString(16).padStart(64,'0');
const whole=(key:number,file:number,sha=1000+file,format:'png'|'dds'='png'):HdEntry=>({key:h(key),width:2,height:2,file:`${file}.${format}`,format,
 outWidth:4,outHeight:4,bytes:64,sha256:h(sha),tier:'A',source:'deadbeef-0000abcd'});
const placed=(key:number,file:number,dst=0):HdEntry=>({...whole(key,file),placements:[{dst:[dst,0,1,1],src:[0,0,2,2]}],placementKind:'crop'});
const pack=(entries:HdEntry[],game='SCUS-97275'):HdManifest=>validateHdManifest({format:'s2u-hd-texture-pack',version:1,localOnly:true,game,
 name:'HD test',method:'pcsx2 replacements',entries,totalBytes:[...new Map(entries.map(e=>[e.file,e.bytes])).values()].reduce((n,b)=>n+b,0)});
const psEntries=()=>[...Array.from({length:10},(_,i)=>whole(i+1,i)),placed(1,10),whole(20,11,1011,'dds')];
// The Xbox archive: the same keys, five glyphs with other payloads (their files numbered as the author's tool numbered them).
const xboxEntries=()=>psEntries().map(e=>!e.placements&&[2,4,5,7,9].includes(parseInt(e.key,16))?{...e,sha256:h(9000+parseInt(e.key,16))}:e);

describe('WM-32: layoutOverlay',()=>{
 it('five differing whole entries give five overlay entries, their files renumbered past the PlayStation files',()=>{
  const ps=pack(psEntries()),xb=pack(xboxEntries());
  const {manifest,overlay}=layoutOverlay(ps,xb);
  expect(overlay).toEqual([{key:h(2),from:'1.png',to:'12.png'},{key:h(4),from:'3.png',to:'13.png'},{key:h(5),from:'4.png',to:'14.png'},
   {key:h(7),from:'6.png',to:'15.png'},{key:h(9),from:'8.png',to:'16.png'}]);
  expect(manifest.entries).toEqual(ps.entries);
  expect(manifest.totalBytes).toBe(ps.totalBytes);
  expect(manifest.layouts?.xbox?.length).toBe(5);
  expect(manifest.layoutBytes).toBe(5*64);
  expect(validateHdManifest(JSON.parse(JSON.stringify(manifest)))).toEqual(manifest);
  // The pack under the Xbox layout is the Xbox archive's payloads, key for key.
  const bySha=(es:readonly HdEntry[])=>es.map(e=>[e.key,e.sha256,!!e.placements]);
  expect(bySha(hdEntriesFor(manifest,'xbox'))).toEqual(bySha(xb.entries));
  expect(bySha(hdEntriesFor(manifest,'playstation'))).toEqual(bySha(ps.entries));
 });
 it('one Xbox file serving two differing keys is copied once',()=>{
  const ps=pack([whole(1,0),whole(2,1)]),xb=pack([whole(1,0,7000),{...whole(2,0,7000)}]);
  const {manifest,overlay}=layoutOverlay(ps,xb);
  expect(overlay).toEqual([{key:h(1),from:'0.png',to:'2.png'},{key:h(2),from:'0.png',to:'2.png'}]);
  expect(manifest.layoutBytes).toBe(64);
 });
 it('refuses, in words, two packs that differ in any other way',()=>{
  const ps=pack(psEntries());
  expect(()=>layoutOverlay(ps,pack(xboxEntries(),'SLUS-20000'))).toThrow('the two packs are for different games (SCUS-97275, SLUS-20000)');
  expect(()=>layoutOverlay(ps,pack(xboxEntries().filter(e=>e.key!==h(3))))).toThrow(`key ${h(3)} is in the PlayStation pack only`);
  expect(()=>layoutOverlay(ps,pack([...xboxEntries(),whole(30,12)]))).toThrow(`key ${h(30)} is in the Xbox pack only`);
  expect(()=>layoutOverlay(ps,pack(xboxEntries().map(e=>e.placements?placed(1,10,1):e)))).toThrow('the two packs\' placement entries differ (placement entry 1)');
  expect(()=>layoutOverlay(ps,pack([...xboxEntries(),placed(2,10)]))).toThrow('the two packs\' placement entries differ (the PlayStation pack has 1, the Xbox pack 2)');
  const layered=layoutOverlay(ps,pack(xboxEntries())).manifest;
  expect(()=>layoutOverlay(layered,pack(xboxEntries()))).toThrow('a pack already carries layouts');
 });
 // Review L1 (wm-packs-deliver 7b6693688b): the one pack's packedBytes is its download -- base and overlay files.
 it('packedBytes: the PlayStation pack\'s plus the overlay files\' sizes when given; dropped when not',()=>{
  const ps={...pack(psEntries()),packedBytes:1000},xb=pack(xboxEntries());
  const sized=layoutOverlay(ps,xb,{sizeOf:f=>f==='1.png'?7:5}).manifest;
  expect(sized.packedBytes).toBe(1000+7+4*5);
  expect(layoutOverlay(ps,xb).manifest.packedBytes).toBeUndefined();
  expect(layoutOverlay(pack(psEntries()),xb,{sizeOf:()=>5}).manifest.packedBytes).toBeUndefined();
 });
});
