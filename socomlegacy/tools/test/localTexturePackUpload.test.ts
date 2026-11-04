import {afterEach,describe,expect,it} from 'vitest';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename,join,resolve,sep} from 'node:path';
import {holdsMapRoot,importTextures,mapIdOf} from '../writeLocalTexturePack';
import {MAP_ARCHIVE,packMap,sha256,validateManifest,type PackSource} from '../../packages/viewer/src/texturePack';
import {readUpload,buildUploadPart,uploadMeta,stagedFiles,stagedFilesWithin,stagedPart,skippedLine,UPLOAD_TOOL,UPLOAD_METHOD_DEFAULT,UPLOAD_LIMITS} from '../../packages/viewer/src/texturePackUpload';
import {bytesSource} from '../../packages/viewer/src/zipReader';
import {makeZip,type ZipItem} from '../../packages/viewer/test/zipFixture';
import {baseZipItems,exportedFiles,upscalePng} from './baseZip';

// GX-27 (plan 2026-10-10-web-graphics-slice-4-packs; product track, a test-room instrument under H135): a pack uploaded
// as the base pack's zip with replaced PNGs is built by the generator's own import core. Synthetic sources only.
const roots:string[]=[];afterEach(()=>{for(const r of roots.splice(0)){if(!resolve(r).startsWith(resolve(tmpdir())+sep)||!basename(r).startsWith('s2u-pack-'))throw Error('Unsafe cleanup');rmSync(r,{recursive:true,force:true});}});
const temporary=()=>{const r=mkdtempSync(join(tmpdir(),'s2u-pack-'));roots.push(r);return r;};
type Wrap='repeat'|'clamp';
const gs=(wrapS:Wrap,wrapT:Wrap,mipmaps=false,levels=0)=>({blend:'none' as const,alphaTest:null,depthTest:true,bilinear:true,mipmaps,levels,wrapS,wrapT});
const image=(width:number,height:number,seed:number)=>({width,height,data:Uint8ClampedArray.from({length:width*height*4},(_,i)=>i%4===3?255:(i*seed+7)%251)});
const opaque=(g:ReturnType<typeof gs>)=>({bilinear:true,transparent:false,graded:false,opaque:true,gs:g});
const fabricated=():PackSource[]=>[
 {key:'rock_wall.tif',library:'MP51',record:'rock_wall.tif',flags:opaque(gs('repeat','repeat',true,1)),levels:[image(8,8,3),image(4,4,5)]},
 {key:'door.tif',library:'SHAR',record:'door.tif',flags:opaque(gs('clamp','repeat')),levels:[image(8,4,11)]},
];
/** The page's sources: `packSourcesFor` gives no library or record; the upload takes them from the sidecars. */
const pageSources=()=>fabricated().map(({library:_l,record:_r,...s})=>s as PackSource);
const provenance={archiveSha256:'a'.repeat(64),archiveBytes:123,toolCommit:'b'.repeat(40),toolSha256:'c'.repeat(64)};
const text=(b:Uint8Array)=>new TextDecoder().decode(b);
const upload=(items:ZipItem[],name='pack.zip')=>readUpload(bytesSource(makeZip(items)),name);
const now=new Date('2026-10-15T19:00:00.000Z');

describe('GX-27 an uploaded base pack zip',()=>{
 it('every PNG at 2x builds the very pack the generator\'s --import builds from the same PNGs (the same packId)',async()=>{
  const sources=fabricated(),{files,stems}=await exportedFiles(sources),exportDir=temporary(),upDir=temporary();
  for(const [name,data] of files){writeFileSync(join(exportDir,name),data);if(name.endsWith('.png'))writeFileSync(join(upDir,name),upscalePng(data,2));}
  const generated=await importTextures(sources,upDir,{method:'nearest-2x',scale:2,sidecars:exportDir},provenance);
  const read=await upload(baseZipItems(files,{replace:{[stems[0]!]:2,[stems[1]!]:2},packJson:{name:'Nearest',method:'nearest-2x'}}),'nearest.zip');
  expect(read.scale).toBe(2);expect(read.parts.map(p=>[p.map,p.folder,p.roles,p.meta])).toEqual([['MP51','','world',{name:'Nearest',notes:'',method:'nearest-2x'}]]);
  const built=await buildUploadPart(read.parts[0]!,pageSources(),{provenance,now});
  expect(built.pack.id).toBe(generated.id);expect(built.pack.manifestBytes).toEqual(generated.manifestBytes);
  for(const [file,bytes] of generated.payloads)expect(built.pack.payloads.get(file)).toEqual(bytes);
  expect(validateManifest(JSON.parse(text(built.pack.manifestBytes))).entries.map(e=>[e.key,e.library,e.record])).toEqual([['rock_wall.tif','MP51','rock_wall.tif'],['door.tif','SHAR','door.tif']]);
  expect(built.leftOut).toEqual([]);
  expect(built.entry).toEqual({id:generated.id,name:'Nearest',kind:'textures',method:'nearest-2x',scale:2,roles:'world',generatedAt:'2026-10-15T19:00:00.000Z',textures:2,bytes:generated.manifest.totalBytes,notes:''});
  // Without a provenance given, the export's archive and commit are recorded with the upload's own tool digest.
  const plain=await buildUploadPart(read.parts[0]!,pageSources());
  expect(plain.pack.manifest.provenance).toEqual({archiveSha256:'a'.repeat(64),archiveBytes:123,toolCommit:'b'.repeat(40),toolSha256:await sha256(new TextEncoder().encode(UPLOAD_TOOL))});
 });
 it('an untouched PNG keeps its original ("untouched"), another size is left out ("size"), a changed source ("changed"); 4x builds',async()=>{
  const {files,stems}=await exportedFiles(fabricated());
  const four=await upload(baseZipItems(files,{replace:{[stems[0]!]:4}}),'Rock only.zip');
  expect(four.scale).toBe(4);expect(four.parts[0]!.meta).toEqual({name:'Rock only',notes:'',method:UPLOAD_METHOD_DEFAULT});
  const built=await buildUploadPart(four.parts[0]!,pageSources());
  expect(built.pack.manifest.entries.map(e=>[e.key,e.levels[0]!.width,e.levels[0]!.height])).toEqual([['rock_wall.tif',32,32]]);
  expect(built.leftOut).toEqual([{key:'door.tif',reason:'untouched'}]);expect(built.entry).toMatchObject({scale:4,textures:1,method:'uploaded'});
  const odd=await upload(baseZipItems(files,{replace:{[stems[0]!]:2,[stems[1]!]:3}}));
  expect((await buildUploadPart(odd.parts[0]!,pageSources())).leftOut).toEqual([{key:'door.tif',reason:'size'}]);
  const both=await upload(baseZipItems(files,{replace:{[stems[0]!]:2,[stems[1]!]:2}})),changed=pageSources();changed[1]!.levels[0]!.data[0]=1;
  expect((await buildUploadPart(both.parts[0]!,changed)).leftOut).toEqual([{key:'door.tif',reason:'changed'}]);
 });
 it('refuses mixed scales, a zip with nothing replaced, no export.json and two folders exporting one archive; a folder\'s name is never the map',async()=>{
  const {files,stems}=await exportedFiles(fabricated());
  await expect(upload(baseZipItems(files,{replace:{[stems[0]!]:2,[stems[1]!]:4}}))).rejects.toThrow(/mixed scales: 2x and 4x/);
  await expect(upload(baseZipItems(files))).rejects.toThrow(/no texture was replaced/);
  // A zip of PNGs and no export.json is a plain pack (packages/viewer/test/texturePackPlain.test.ts). This one has neither.
  await expect(upload(baseZipItems(files,{replace:{[stems[0]!]:2}}).filter(i=>!i.name.endsWith('export.json')&&!/\.png$/i.test(i.name)))).rejects.toThrow(/no export\.json/);
  // The controller's word (2026-10-15, the owner's renaming): the map is export.json's mapArchive, whatever the folder says.
  const misnamed=await upload(baseZipItems(files,{replace:{[stems[0]!]:2},folder:'frostfire-mp2/'}));expect(misnamed.parts.map(p=>[p.map,p.folder])).toEqual([['MP51','frostfire-mp2/']]);
  await expect(upload([...baseZipItems(files,{replace:{[stems[0]!]:2},folder:'vigilance-mp51/'}),...baseZipItems(files,{folder:'copy/of/vigilance-mp51/'})])).rejects.toThrow(/vigilance-mp51\/ and copy\/of\/vigilance-mp51\/ both export RUN\/MP51\.ZDB/);
  await expect(upload([{name:'export.json',data:'{"format":"something else"}'}])).rejects.toThrow(/export\.json: not a base pack's export index/);
 });
 it('pack.json: name, notes and method, each optional; the name defaults to the file\'s; a malformed one is refused with its reason',()=>{
  const json=(v:unknown)=>new TextEncoder().encode(typeof v==='string'?v:JSON.stringify(v));
  expect(uploadMeta(null,'My Pack.ZIP')).toEqual({name:'My Pack',notes:'',method:'uploaded'});
  expect(uploadMeta(null,'x'.repeat(60)+'.zip').name).toBe('x'.repeat(48));
  expect(uploadMeta(null,'café\tpack.zip').name).toBe('caf__pack');expect(uploadMeta(null,'.zip').name).toBe('uploaded pack');
  expect(uploadMeta(json({name:'A',notes:'n',method:'m'}),'f.zip')).toEqual({name:'A',notes:'n',method:'m'});
  expect(uploadMeta(json({method:'x4plus'}),'f.zip')).toEqual({name:'f',notes:'',method:'x4plus'});
  const refusals:[unknown,RegExp][]=[['{',/pack\.json: not JSON/],['[]',/pack\.json: not an object/],[{name:''},/pack\.json: name is not 1-48 printable characters/],
   [{name:'x'.repeat(49)},/name is not 1-48/],[{notes:5},/pack\.json: notes are not 0-240 printable characters/],[{notes:'n'.repeat(241)},/notes are not 0-240/],
   [{method:''},/pack\.json: method is not 1-512 printable characters/],[{method:'a\nb'},/method is not 1-512/],[{name:'x',pad:'p'.repeat(UPLOAD_LIMITS.packJsonBytes)},/pack\.json: over 4096 bytes/]];
  for(const [raw,reason] of refusals)expect(()=>uploadMeta(json(raw),'f.zip'),String(reason)).toThrow(reason);
 });
 it('an all-maps zip (folders <name>-mp<n>/, a README beside them) imports each map present; flat and in a folder read alike',async()=>{
  const sources=fabricated(),mp51=await exportedFiles(sources),mp2=await exportedFiles(sources,{map:'MP2'});
  const read=await upload([{name:'README.txt',data:'about'},{name:'pack.json',data:JSON.stringify({name:'All maps'})},
   ...baseZipItems(mp51.files,{folder:'vigilance-mp51/',replace:{[mp51.stems[0]!]:2}}),...baseZipItems(mp2.files,{folder:'packs/frostfire-mp2/',replace:{[mp2.stems[1]!]:2},packJson:{name:'Two'}})],'socom2-basetextures-all-maps.zip');
  expect(read.parts.map(p=>[p.map,p.folder,p.meta.name,p.replaced])).toEqual([['MP51','vigilance-mp51/','All maps',1],['MP2','packs/frostfire-mp2/','Two',1]]);
  const two=await buildUploadPart(read.parts[1]!,pageSources());
  expect(two.pack.manifest.mapArchive).toBe('RUN/MP2.ZDB');expect(two.pack.manifest.entries.map(e=>e.key)).toEqual(['door.tif']);
  expect((await upload(baseZipItems(mp51.files,{replace:{[mp51.stems[0]!]:2}}),'vigilance-mp51-basetextures.zip')).parts[0]!.meta.name).toBe('vigilance-mp51-basetextures');
  const flat=await upload(baseZipItems(mp51.files,{replace:{[mp51.stems[0]!]:2}}),'p.zip'),folder=await upload(baseZipItems(mp51.files,{folder:'desertglory-mp5/',replace:{[mp51.stems[0]!]:2}}),'p.zip');
  expect((await buildUploadPart(flat.parts[0]!,pageSources(),{now})).pack.id).toBe((await buildUploadPart(folder.parts[0]!,pageSources(),{now})).pack.id);
 });
});

// GX-27 review F2/F4: staging is bounded by what the zip declares, before a PNG is read; unchanged maps are skipped.
describe('GX-27 review: staging bounds and unchanged maps',()=>{
 it('a part declares the bytes it would stage; over the room it is refused before any PNG is read',async()=>{
  const {files,stems}=await exportedFiles(fabricated()),read=await upload(baseZipItems(files,{replace:{[stems[0]!]:2}}));
  const part=read.parts[0]!,png=upscalePng(files.get(`${stems[0]}.png`)!,2);
  const sidecars=stems.reduce((n,s)=>n+files.get(`${s}.json`)!.length,0);
  expect(part.declaredBytes).toBe(files.get('export.json')!.length+sidecars+png.length);
  let pngReads=0;const counted={...part,read:(f:string)=>{if(f.endsWith('.png'))pngReads++;return part.read(f);}};
  await expect(stagedFilesWithin(counted,part.declaredBytes-1)).rejects.toThrow(/would pass the room left in the browser's pack store \(\d+ bytes declared, \d+ left\)/);
  expect(pngReads).toBe(0);
  const staged=await stagedFilesWithin(counted,part.declaredBytes+4096);expect(staged.get(`${stems[0]}.png`)).toEqual(png);expect(pngReads).toBe(1);
 });
 // Re-review finding 3: a sidecar whose padded size is not 3x its texture keeps that texture original as `changed`,
 // whether the part is built on the loaded map or staged and built later.
 it('a sidecar whose padded size is wrong leaves its texture out as "changed", built now or staged alike',async()=>{
  const {files,stems}=await exportedFiles(fabricated()),bad=new Map(files),name=`${stems[1]}.json`;
  const side=JSON.parse(text(files.get(name)!)) as Record<string,number>;bad.set(name,new TextEncoder().encode(JSON.stringify({...side,paddedWidth:side['paddedWidth']!+1})));
  const read=await upload(baseZipItems(bad,{replace:{[stems[0]!]:2,[stems[1]!]:2}})),part=read.parts[0]!;
  expect(part.replaced).toBe(1);expect(part.kept.get(stems[1]!)).toBe('changed');
  const now=await buildUploadPart(part,pageSources());
  const stored=await stagedFiles(part),later=await buildUploadPart(await stagedPart(async n=>stored.get(n)??null),pageSources());
  for(const b of [now,later]){expect(b.leftOut).toEqual([{key:'door.tif',reason:'changed'}]);expect(b.pack.manifest.entries.map(e=>e.key)).toEqual(['rock_wall.tif']);}
  expect(later.pack.id).toBe(now.pack.id);
 });
 it('an all-maps zip skips the maps with no PNG replaced, naming how many; nothing replaced anywhere still refuses',async()=>{
  const sources=fabricated(),mp51=await exportedFiles(sources),mp2=await exportedFiles(sources,{map:'MP2'}),mp7=await exportedFiles(sources,{map:'MP7'});
  const read=await upload([...baseZipItems(mp51.files,{folder:'vigilance-mp51/',replace:{[mp51.stems[0]!]:2}}),...baseZipItems(mp2.files,{folder:'frostfire-mp2/'}),...baseZipItems(mp7.files,{folder:'ratsnest-mp7/'})]);
  expect(read.parts.map(p=>p.map)).toEqual(['MP51']);expect(read.skipped).toEqual(['MP2','MP7']);
  expect(skippedLine(2)).toBe('2 maps unchanged, skipped.');expect(skippedLine(1)).toBe('1 map unchanged, skipped.');expect(skippedLine(0)).toBe('');
  await expect(upload([...baseZipItems(mp2.files,{folder:'a/'}),...baseZipItems(mp7.files,{folder:'b/'})])).rejects.toThrow(/no texture was replaced/);
 });
});

// GX-27's campaign scope (the merge controller, on the owner's word, 2026-10-15): the twelve campaign archives
// (RUN/M51.ZDB ... RUN/M83.ZDB) are pack maps too, by the same rules as RUN/MP<n>.ZDB.
describe('GX-27 campaign maps (M<n>)',()=>{
 it('an M<n> stem and archive are accepted by the generator, the validator and the runtime; a junk stem is refused',async()=>{
  for(const [path,id] of [['M51.ZDB','M51'],[join('x','RUN','m83.zdb'),'M83'],['MP2.ZDB','MP2']] as const)expect(mapIdOf(path),path).toBe(id);
  for(const bad of ['MX51.ZDB','M.ZDB','MPM51.ZDB','M51A.ZDB','PM51.ZDB','M51.ZAR','UI.ZDB'])expect(mapIdOf(bad),bad).toBeNull();
  for(const stem of ['M51','M83','MP2'])expect(packMap(stem),stem).toBe(true);
  for(const stem of ['M','MX51','m51','M51 ','XM51','P51'])expect(packMap(stem),stem).toBe(false);
  for(const archive of ['RUN/M51.ZDB','RUN/MP51.ZDB'])expect(MAP_ARCHIVE.test(archive),archive).toBe(true);
  for(const archive of ['RUN/MX51.ZDB','RUN/M51.ZAR','M51.ZDB','RUN/M.ZDB','RUN/PM51.ZDB'])expect(MAP_ARCHIVE.test(archive),archive).toBe(false);
  expect(holdsMapRoot([{name:'RUN\\M51\\M51.ZED'}],'M51')).toBe(true);expect(holdsMapRoot([{name:'RUN\\MP51\\MP51.ZED'}],'M51')).toBe(false);
 });
 it('a campaign export uploads and builds a pack whose manifest names RUN/M51.ZDB and passes the validator; a junk archive is refused',async()=>{
  const {files,stems}=await exportedFiles(fabricated(),{map:'M51'});
  const read=await upload(baseZipItems(files,{folder:'cliffs-m51/',replace:{[stems[0]!]:2}}),'cliffs-m51-basetextures.zip');
  expect(read.parts.map(p=>p.map)).toEqual(['M51']);
  const built=await buildUploadPart(read.parts[0]!,pageSources());
  expect(validateManifest(JSON.parse(text(built.pack.manifestBytes))).mapArchive).toBe('RUN/M51.ZDB');
  const manifest=JSON.parse(text(built.pack.manifestBytes));
  for(const mapArchive of ['RUN/MX51.ZDB','RUN/M51.ZAR'])expect(()=>validateManifest({...manifest,mapArchive}),mapArchive).toThrow();
  const junk=new Map(files);junk.set('export.json',new TextEncoder().encode(text(files.get('export.json')!).replace('RUN/M51.ZDB','RUN/MX51.ZDB')));
  await expect(upload(baseZipItems(junk,{replace:{[stems[0]!]:2}}))).rejects.toThrow(/export\.json: not a base pack's export index/);
 });
});
