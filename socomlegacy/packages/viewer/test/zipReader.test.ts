import {describe,expect,it} from 'vitest';
import {openZip,bytesSource,blobSource,ZIP_LIMITS,ZipError} from '../src/zipReader';
import {makeZip} from './zipFixture';

// GX-27 (plan 2026-10-10-web-graphics-slice-4-packs; product track, a test-room instrument under H135): the browser's
// zip reader for an uploaded texture pack. Zips made in the test only.
const text=(b:Uint8Array)=>new TextDecoder().decode(b);
const big=Uint8Array.from({length:70_000},(_,i)=>(i*31+i%7)&0xff);
const refused=async(zip:Uint8Array,pattern:RegExp,limits?:Parameters<typeof openZip>[1])=>{
 const error=await openZip(bytesSource(zip),limits).then(async z=>{for(const m of z.members)await z.read(m);}).then(()=>null,(e:unknown)=>e);
 const late=error??null;expect(late,String(pattern)).toBeInstanceOf(ZipError);expect((late as Error).message).toMatch(pattern);
};

describe('GX-27 the zip reader',()=>{
 it('lists and reads stored and deflated members, from bytes and from a Blob, past an archive comment',async()=>{
  const zip=makeZip([{name:'export.json',data:'{"a":1}',method:0},{name:'mp51/001_rock_tif.png',data:big,method:8},{name:'mp51/',data:'',method:0}],{comment:'made by hand'});
  for(const source of [bytesSource(zip),blobSource(new Blob([zip]))]){
   const z=await openZip(source);
   expect(z.members.map(m=>[m.name,m.method,m.size])).toEqual([['export.json',0,7],['mp51/001_rock_tif.png',8,70_000],['mp51/',0,0]]);
   expect(text(await z.read(z.members[0]!))).toBe('{"a":1}');expect(await z.read(z.members[1]!)).toEqual(big);
  }
  expect(ZIP_LIMITS).toMatchObject({members:8192,centralDirectoryBytes:4*1024*1024,memberBytes:160*1024*1024,archiveBytes:2*1024*1024*1024});
 });
 it('refuses what is not a zip, zip64, encryption, another compression method and a multi-part archive',async()=>{
  await refused(new TextEncoder().encode('not a zip at all, just text that is long enough'),/not a zip/);
  await refused(makeZip([{name:'a.png',data:'x'}],{zip64:true}),/zip64/);
  await refused(makeZip([{name:'a.png',data:'x',flags:1}]),/a\.png: encrypted/);
  await refused(makeZip([{name:'a.png',data:'x',method:12}]),/a\.png: compression method 12/);
  const multi=makeZip([{name:'a.png',data:'x'}]);new DataView(multi.buffer).setUint16(multi.length-22+4,1,true);await refused(multi,/multi-part/);
 });
 it('refuses a member name that would leave the archive, and a name given twice',async()=>{
  for(const name of ['../evil.png','a/../../b.png','/abs.png','\\root.png','a\\b.png','C:/x.png','c:x.png',''])await refused(makeZip([{name,data:'x'}]),/unsafe member name/);
  await refused(makeZip([{name:'a.png',data:'x'},{name:'a.png',data:'y'}]),/a\.png: given twice/);
 });
 it('bounds the member count, the central directory, the archive and each member, and checks size and CRC',async()=>{
  await refused(makeZip([{name:'a',data:'1'},{name:'b',data:'2'},{name:'c',data:'3'}]),/more than 2 members/,{...ZIP_LIMITS,members:2});
  await refused(makeZip([{name:'a',data:'1'}]),/central directory/,{...ZIP_LIMITS,centralDirectoryBytes:10});
  await refused(makeZip([{name:'a',data:'1'}]),/over 10 bytes/,{...ZIP_LIMITS,archiveBytes:10});
  await refused(makeZip([{name:'big.png',data:big}]),/big\.png: over 1000 bytes/,{...ZIP_LIMITS,memberBytes:1000});
  await refused(makeZip([{name:'lie.png',data:big,size:1000}]),/lie\.png: (inflates past|wrong size)/);
  await refused(makeZip([{name:'short.png',data:big,size:80_000}]),/short\.png: wrong size/);
  await refused(makeZip([{name:'stored.png',data:big,method:0,size:10}]),/stored\.png: wrong size/);
  await refused(makeZip([{name:'crc.png',data:big,crc:1234}]),/crc\.png: CRC mismatch/);
  const cut=makeZip([{name:'cut.png',data:big,method:0}]);cut[0]=0;await refused(cut,/cut\.png: local header is malformed/);
 });
 // GX-27 review F1: what the central directory declares is refused before the member's bytes are read.
 it('refuses a member whose compressed size passes the bound, or a stored member whose sizes differ, before reading it',async()=>{
  let x=1;const noise=Uint8Array.from({length:5000},()=>(x=(Math.imul(x,1103515245)+12345)>>>0)>>>24);
  await refused(makeZip([{name:'packed.png',data:noise,size:500}]),/packed\.png: over 1000 bytes compressed/,{...ZIP_LIMITS,memberBytes:1000});
  const stored=makeZip([{name:'stored.png',data:big,method:0,size:10}]);let read=0;
  const counting={size:stored.length,read:async(o:number,l:number)=>{read+=l;return stored.subarray(o,o+l);}};
  const z=await openZip(counting);read=0;
  const e=await z.read(z.members[0]!).then(()=>null,(x:unknown)=>x);expect((e as Error).message).toMatch(/stored\.png: wrong size/);expect(read).toBe(0);
 });
});
