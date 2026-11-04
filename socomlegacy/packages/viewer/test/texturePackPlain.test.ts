import {describe,expect,it} from 'vitest';
import {encodePng} from '../../../tools/png';
import {exportedFiles,baseZipItems} from '../../../tools/test/baseZip';
import {PACK_LIMITS,sha256,type PackMap,type PackRoles,type PackSource} from '../src/texturePack';
import {buildUploadPart,importSummary,plainProvenance,readUpload,stagedFiles,UPLOAD_TOOL,type PlainLoad} from '../src/texturePackUpload';
import {bytesSource} from '../src/zipReader';
import {makeZip,type ZipItem} from './zipFixture';
import {LocalTexturePacks,TexturePackTarget} from '../src/texturePackRuntime';
import {memoryUploadBackend,UploadedPacks} from '../src/texturePackStore';
import {viewerCommit} from '../src/revision';

// A plain texture pack (conventions §10): synthetic PNGs only, no disc and no pack image. Product track.
const solid=(w:number,h:number,rgb:[number,number,number])=>{const data=new Uint8ClampedArray(w*h*4);for(let i=0;i<data.length;i+=4){data[i]=rgb[0];data[i+1]=rgb[1];data[i+2]=rgb[2];data[i+3]=255;}return data;};
const source=(key:string,w:number,h:number):PackSource=>({key,flags:{bilinear:true,transparent:false,graded:false,opaque:true,gs:null},levels:[{width:w,height:h,data:solid(w,h,[1,2,3])}]});
const rock=source('rock_wall.tif',4,4),door=source('door.tif',8,4),ak=source('ak47.tif',4,8),road=source('road_cobble.tif',4,4);
const sources=[rock,door,ak,road];
const loaded=(list:readonly PackSource[]=sources,map:PackMap='MP72'):PlainLoad=>({map,sourcesFor:()=>list});
const png=(name:string,w:number,h:number,rgb:[number,number,number]=[20,40,60]):ZipItem=>({name,data:encodePng(w,h,solid(w,h,rgb))});
const upload=(items:ZipItem[],name='plain.zip',context:PlainLoad|null=loaded())=>readUpload(bytesSource(makeZip(items)),name,undefined,context??undefined);
const archive=Uint8Array.of(9,8,7,6,5);
const text=(b:Uint8Array)=>new TextDecoder().decode(b);

describe('a plain texture pack zip',()=>{
 it('builds a zip of PNGs for the loaded map, at one scale, and does not crop',async()=>{
  const rgb:[number,number,number]=[9,8,7],pixels=solid(8,8,rgb);
  const read=await upload([png('rock_wall.png',8,8,rgb),{name:'README.txt',data:'notes'},{name:'__MACOSX/rock_wall.png',data:encodePng(8,8,pixels)},{name:'pack.json',data:JSON.stringify({name:'Cross',method:'external-4x',mapArchive:'RUN/MP72.ZDB'})}],'Cross.zip');
  expect(read.scale).toBe(2);expect(read.skipped).toEqual([]);
  expect(read.parts.map(p=>[p.map,p.folder,p.roles,p.meta,p.replaced,p.plainMembers?.get('rock_wall.tif')])).toEqual([['MP72','','wide',{name:'Cross',notes:'',method:'external-4x'},1,'rock_wall.png']]);
  const provenance=await plainProvenance(archive,'b'.repeat(40));
  const built=await buildUploadPart(read.parts[0]!,sources,{provenance});
  expect(built.pack.manifest.entries.map(e=>[e.key,e.levels[0]!.width,e.levels[0]!.height])).toEqual([['rock_wall.tif',8,8]]);
  expect(built.pack.manifest.roles).toBe('wide');expect(built.leftOut).toEqual([]);
  expect([...built.pack.payloads.get('0.rgba')!]).toEqual([...pixels]);
  expect(built.pack.manifest.provenance).toEqual({...provenance,toolSha256:await sha256(new TextEncoder().encode(UPLOAD_TOOL))});
  expect(importSummary('Cross',built)).toBe('Cross: 1 texture imported, 0 kept original.');
  await expect(buildUploadPart(read.parts[0]!,sources)).rejects.toThrow(/a plain pack records the loaded map archive, and none was given/);
  await expect(stagedFiles(read.parts[0]!)).rejects.toThrow(/a plain pack is built for the loaded map and is not staged/);
 });
 it('names ak47.tif.png and road_cobble.png, in a folder, at 4x, and takes roles from pack.json',async()=>{
  let asked:PackRoles|undefined;
  const context:PlainLoad={map:'MP72',sourcesFor:roles=>{asked=roles;return [ak,road];}};
  const read=await upload([png('weapons/ak47.tif.png',16,32),png('ground/road_cobble.png',16,16),{name:'pack.json',data:JSON.stringify({roles:'world'})}],'four.zip',context);
  expect(asked).toBe('world');expect(read.scale).toBe(4);expect(read.parts[0]!.roles).toBe('world');
  expect(read.parts[0]!.replacedStems).toEqual(['ak47.tif','road_cobble.tif']);
  const built=await buildUploadPart(read.parts[0]!,context.sourcesFor('world'),{provenance:await plainProvenance(archive,'c'.repeat(40))});
  expect(built.pack.manifest.scale).toBe(4);expect(built.pack.manifest.entries.map(e=>e.key)).toEqual(['ak47.tif','road_cobble.tif']);
  expect(built.pack.manifest.entries.map(e=>[e.levels[0]!.width,e.levels[0]!.height])).toEqual([[16,32],[16,16]]);
 });
 it('leaves a wrong size out as size, counts a key that is not eligible, and refuses mixed scales, a duplicate key and a different map',async()=>{
  const odd=await upload([png('rock_wall.png',8,8),png('door.png',8,8),png('character.png',8,8)]);
  expect(odd.parts[0]!.replacedStems).toEqual(['rock_wall.tif']);
  const built=await buildUploadPart(odd.parts[0]!,sources,{provenance:await plainProvenance(archive,'b'.repeat(40))});
  expect(built.leftOut).toEqual([{key:'door.tif',reason:'size'},{key:'character.tif',reason:'notEligible'}]);
  expect(importSummary('plain',built)).toBe('plain: 1 texture imported, 2 kept original (1 size, 1 notEligible).');
  await expect(upload([png('rock_wall.png',8,8),png('door.png',32,16)])).rejects.toThrow(/mixed scales: 2x and 4x/);
  await expect(upload([png('a/road_cobble.png',8,8),png('b/road_cobble.PNG',8,8)])).rejects.toThrow('a/road_cobble.png and b/road_cobble.PNG both name road_cobble.tif');
  await expect(upload([png('rock_wall.png',8,8),{name:'pack.json',data:JSON.stringify({mapArchive:'RUN/MP2.ZDB'})}])).rejects.toThrow('pack.json mapArchive is RUN/MP2.ZDB; the loaded map is RUN/MP72.ZDB');
  await expect(upload([png('nope.png',8,8)])).rejects.toThrow('no PNG names an eligible texture on MP72 at 2x or 4x');
  await expect(upload([png('rock_wall.png',8,8)],'p.zip',null)).rejects.toThrow(/a plain pack is built for the loaded map, and none is loaded/);
  await expect(upload([{name:'README.txt',data:'only'}])).rejects.toThrow(/no export\.json in the zip/);
  await expect(upload([png('rock_wall.png',8,8),{name:'pack.json',data:JSON.stringify({roles:'both'})}])).rejects.toThrow(/pack\.json: roles is not world or wide/);
 });
 it('an export.json zip stays on the export path when a loaded map is passed',async()=>{
  const {files,stems}=await exportedFiles([rock,door]);
  const read=await upload(baseZipItems(files,{replace:{[stems[0]!]:2}}),'base.zip',loaded([rock,door],'MP2'));
  expect(read.parts.map(p=>[p.map,p.plainMembers,p.scale])).toEqual([['MP51',undefined,2]]);
  expect(read.parts[0]!.replacedStems).toEqual([stems[0]]);
 });
 it('the page builds the plain pack at once, from the archive bytes it was given, and does not stage it',async()=>{
  const store=new UploadedPacks(memoryUploadBackend()),lines:string[]=[];
  const packs=new LocalTexturePacks(async()=>new Response('',{status:404}),undefined,undefined,undefined,{store,status:t=>lines.push(t)});
  const target=new TexturePackTarget(()=>new Map([[rock.key,rock]]),new Map(),'MP72');
  packs.setArchiveReader(async()=>archive);packs.setEnabled(true);packs.setTarget(target);await packs.ready;
  await packs.importZip(new Blob([makeZip([png('rock_wall.png',8,8)])]),'cross.zip');
  expect(lines.at(-1)).toBe('cross: 1 texture imported, 0 kept original.');
  const [record]=await store.list('MP72');
  expect(record?.state).toBe('pack');
  const manifest=JSON.parse(text((await store.file('MP72',record!.id,'manifest.json'))!));
  expect(manifest.provenance).toMatchObject({archiveSha256:await sha256(archive),archiveBytes:archive.byteLength,toolCommit:viewerCommit()});
  expect(viewerCommit()).toMatch(/^[a-f0-9]{40}$/);
  expect(manifest.mapArchive).toBe('RUN/MP72.ZDB');
 });
 // The fresh review's ask (2), 2026-10-20 (the online seat's takeover, OT.R69): the decode is bounded before the end --
 // more than PACK_LIMITS.entries replaced textures is refused at the read, and the decode stops once its running total
 // passes PACK_LIMITS.totalBytes, rather than holding every image decoded until buildImportedPack checks.
 it('refuses more than PACK_LIMITS.entries replaced textures at the read, before any image is decoded',async()=>{
  const many=Array.from({length:PACK_LIMITS.entries+1},(_,i)=>source(`t${i}.tif`,4,4));
  await expect(upload(many.map(t=>png(t.key.replace('.tif','.png'),8,8)),'many.zip',loaded(many))).rejects.toThrow(new RegExp(`more than ${PACK_LIMITS.entries} replaced textures`));
  const enough=many.slice(0,PACK_LIMITS.entries);
  expect((await upload(enough.map(t=>png(t.key.replace('.tif','.png'),8,8)),'enough.zip',loaded(enough))).parts[0]!.replaced).toBe(PACK_LIMITS.entries);
 });
 it('stops decoding before the decoded total passes PACK_LIMITS.totalBytes: the rest left out as totalBytes, unread, the pack built from what is held',async()=>{
  const read=await upload([png('rock_wall.png',8,8),png('road_cobble.png',8,8),png('door.png',16,8),png('ak47.png',8,16)]);
  const part=read.parts[0]!,asked:string[]=[];
  const spied={...part,read:async(file:string)=>{asked.push(file);return part.read(file);}};
  const provenance=await plainProvenance(archive,'d'.repeat(40));
  // decoded in the loaded map's source order (rock, door, ak, road): rock's 8x8 is 256 bytes, door's 16x8 512 -- door would
  // pass a 300-byte bound, so it is sized off its header and not decoded, and ak and road are never read (the spec's rule
  // for the cap: what fits is built, the rest left out as totalBytes)
  const bounded=await buildUploadPart(spied,sources,{provenance,packLimits:{entries:PACK_LIMITS.entries,totalBytes:300}});
  expect(asked).toEqual(['rock_wall.png','door.png']);
  expect(bounded.pack.manifest.entries.map(e=>e.key)).toEqual(['rock_wall.tif']);
  expect(bounded.leftOut.filter(l=>l.reason==='totalBytes').map(l=>l.key).sort()).toEqual(['ak47.tif','door.tif','road_cobble.tif']);
  // and a bound nothing fits under: nothing left, refused as before
  await expect(buildUploadPart(part,sources,{provenance,packLimits:{entries:PACK_LIMITS.entries,totalBytes:100}})).rejects.toThrow(/no replaced texture could be imported/);
  const whole=await buildUploadPart(part,sources,{provenance});
  expect(whole.pack.manifest.entries).toHaveLength(4);
 });
});
