import {afterEach,expect,it} from 'vitest';
import {mkdtempSync,readFileSync,existsSync,rmSync,writeFileSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep,basename} from 'node:path';
import {buildTexturePack,lanczosHalf} from '../localTexturePack';
import {publishTexturePack} from '../writeLocalTexturePack';
import {mkdirSync,readdirSync,copyFileSync,unlinkSync} from 'node:fs';
import {decodePng,encodePng} from '../png';
import {exportTextures,holdsMapRoot,importTextures,mapIdOf,takePublishOptions} from '../writeLocalTexturePack';
import {sha256} from '../../packages/viewer/src/texturePack';
import type {PackSource} from '../../packages/viewer/src/texturePack';

const roots:string[]=[];afterEach(()=>{for(const r of roots.splice(0)){if(!resolve(r).startsWith(resolve(tmpdir())+sep)||!basename(r).startsWith('s2u-pack-'))throw Error('Unsafe cleanup');rmSync(r,{recursive:true,force:true});}});
const temporary=()=>{const r=mkdtempSync(join(tmpdir(),'s2u-pack-'));roots.push(r);return r;};
async function pack(){return buildTexturePack([{key:'synthetic',levels:[{width:1,height:1,data:new Uint8ClampedArray([20,40,60,255])}],flags:{bilinear:true,transparent:false,graded:false,opaque:true,gs:null}}],{archiveSha256:'a'.repeat(64),archiveBytes:4,toolCommit:'b'.repeat(40),toolSha256:'c'.repeat(64)});}
it('publishes complete immutable payloads before activating a local pointer, and never overwrites a pack',async()=>{
 const root=temporary(),p=await pack();await publishTexturePack(root,p);
 expect(JSON.parse(readFileSync(join(root,'current.json'),'utf8'))).toEqual({version:1,packId:p.id});
 expect(readFileSync(join(root,p.id,'manifest.json'))).toEqual(Buffer.from(p.manifestBytes));
 expect([...readFileSync(join(root,p.id,'0.rgba'))]).toEqual(Array(4).fill([20,40,60,255]).flat());
 await expect(publishTexturePack(root,p)).rejects.toThrow();
 expect(JSON.parse(readFileSync(join(root,'current.json'),'utf8')).packId).toBe(p.id);
});
it('bad payload or content address cannot replace the active pointer or write outside its root',async()=>{
 const root=temporary(),p=await pack();writeFileSync(join(root,'current.json'),'existing');
 p.payloads.get('0.rgba')![0]=99;await expect(publishTexturePack(root,p)).rejects.toThrow();
 expect(readFileSync(join(root,'current.json'),'utf8')).toBe('existing');expect(existsSync(join(root,p.id))).toBe(false);
 p.id='../escaped';await expect(publishTexturePack(root,p)).rejects.toThrow();
});
it('refuses a junction output so local packs cannot accidentally write into a shared public tree',async()=>{
 const root=temporary(),outside=temporary(),link=join(root,'redirect');symlinkSync(outside,link,'junction');
 await expect(publishTexturePack(link,await pack())).rejects.toThrow();expect(existsSync(join(outside,'current.json'))).toBe(false);
});

// GX-1 (plan 2026-10-09-web-graphics-upscale-pack, GX.R3-R5): the export/import round trip, synthetic sources only.
type Wrap='repeat'|'clamp';
const gs=(wrapS:Wrap,wrapT:Wrap,mipmaps=false,levels=0)=>({blend:'none' as const,alphaTest:null,depthTest:true,bilinear:true,mipmaps,levels,wrapS,wrapT});
const image=(width:number,height:number,seed:number)=>({width,height,data:Uint8ClampedArray.from({length:width*height*4},(_,i)=>i%4===3?255:(i*seed+7)%251)});
const opaque=(g:ReturnType<typeof gs>)=>({bilinear:true,transparent:false,graded:false,opaque:true,gs:g});
const fabricated=():PackSource[]=>[
 {key:'rock_wall.tif',library:'MP51',record:'rock_wall.tif',flags:opaque(gs('repeat','repeat',true,1)),levels:[image(8,8,3),image(4,4,5)]},
 {key:'door.tif',library:'SHAR',record:'door.tif',flags:opaque(gs('clamp','repeat')),levels:[image(8,4,11)]},
];
const info={archiveSha256:'a'.repeat(64),archiveBytes:123,toolCommit:'b'.repeat(40)};
const provenance={...info,toolSha256:'c'.repeat(64)};
const nearest=(s:{width:number;height:number;data:Uint8ClampedArray},n:number)=>{
 const width=s.width*n,height=s.height*n,data=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=((Math.floor(y/n))*s.width+Math.floor(x/n))*4;data.set(s.data.subarray(i,i+4),(y*width+x)*4);}
 return {width,height,data};
};
/** The model's stand-in: every exported PNG upscaled by nearest 2x into a copy of the export (sidecars beside). */
function upscaled(exported:string,n=2):string{
 const out=temporary();
 for(const f of readdirSync(exported)){
  if(f.endsWith('.png')){const s=decodePng(readFileSync(join(exported,f)));const u=nearest(s,n);writeFileSync(join(out,f),encodePng(u.width,u.height,u.data));}
  else copyFileSync(join(exported,f),join(out,f));
 }
 return out;
}
it('GX-1 export: every source padded by its wrap (repeat tiled, clamp edge-extended) with a sidecar and an index',async()=>{
 const sources=fabricated(),dir=join(temporary(),'export');await exportTextures(sources,dir,info);
 const index=JSON.parse(readFileSync(join(dir,'export.json'),'utf8'));
 expect(index).toMatchObject({mapArchive:'RUN/MP51.ZDB',archiveSha256:info.archiveSha256,toolCommit:info.toolCommit});
 expect(index.entries.map((e:{key:string})=>e.key)).toEqual(['rock_wall.tif','door.tif']);
 for(const [i,s] of sources.entries()){
  const stem=index.entries[i].stem as string;expect(stem).toMatch(/^[0-9]{3}_[a-z0-9_-]+$/);
  const side=JSON.parse(readFileSync(join(dir,stem+'.json'),'utf8')),png=decodePng(readFileSync(join(dir,stem+'.png')));
  const base=s.levels[0]!,w=base.width,h=base.height;
  expect(side).toMatchObject({key:s.key,library:s.library,width:w,height:h,wrapS:s.flags.gs!.wrapS,wrapT:s.flags.gs!.wrapT,
   sourceSha256:await sha256(new Uint8Array(base.data.buffer)),paddedWidth:3*w,paddedHeight:3*h,png:stem+'.png',
   padding:{left:w,right:w,top:h,bottom:h,s:s.flags.gs!.wrapS==='repeat'?'tile':'edge',t:s.flags.gs!.wrapT==='repeat'?'tile':'edge'}});
  expect([png.width,png.height]).toEqual([3*w,3*h]);
  const px=(img:{width:number;data:Uint8ClampedArray},x:number,y:number)=>Array.from(img.data.subarray((y*img.width+x)*4,(y*img.width+x)*4+4));
  for(let y=0;y<3*h;y++)for(let x=0;x<3*w;x++){
   const sx=s.flags.gs!.wrapS==='repeat'?x%w:Math.max(0,Math.min(w-1,x-w)),sy=s.flags.gs!.wrapT==='repeat'?y%h:Math.max(0,Math.min(h-1,y-h));
   expect(px(png,x,y)).toEqual(px(base,sx,sy));
  }
 }
 await expect(exportTextures(sources,dir,info)).rejects.toThrow();
});
it('GX-1 import: crops the padding, rebuilds the mips from the import at the authored indices, records method and scale',async()=>{
 const sources=fabricated(),dir=join(temporary(),'export');await exportTextures(sources,dir,info);
 const result=await importTextures(sources,upscaled(dir),{method:'nearest-2x test stand-in',scale:2},provenance);
 expect(result.leftOut).toEqual([]);expect(result.manifest).toMatchObject({method:'nearest-2x test stand-in',scale:2});
 const [rock,door]=result.manifest.entries;
 expect(rock!.levels.map(l=>[l.width,l.height,l.sourceLevel])).toEqual([[16,16,0],[8,8,1],[4,4,null],[2,2,null],[1,1,null]]);
 expect(door!.levels.map(l=>[l.width,l.height,l.sourceLevel])).toEqual([[16,8,0]]);
 for(const e of result.manifest.entries){const bytes=result.payloads.get(e.file)!;for(let a=3;a<bytes.length;a+=4)expect(bytes[a]).toBe(255);}
 expect(Array.from(result.payloads.get(door!.file)!)).toEqual(Array.from(nearest(sources[1]!.levels[0]!,2).data));
 expect(Array.from(result.payloads.get(rock!.file)!.subarray(0,16*16*4))).toEqual(Array.from(nearest(sources[0]!.levels[0]!,2).data));
});
it('GX-1 import: a non-opaque or missing result is left out and counted; a wrong scale leaves nothing and refuses',async()=>{
 const sources=fabricated(),dir=join(temporary(),'export');await exportTextures(sources,dir,info);
 const up=upscaled(dir),index=JSON.parse(readFileSync(join(up,'export.json'),'utf8'));
 const doorPng=join(up,index.entries[1].stem+'.png'),d=decodePng(readFileSync(doorPng));d.data[(12*d.width+24)*4+3]=254;
 writeFileSync(doorPng,encodePng(d.width,d.height,d.data));
 const rockPng=join(up,index.entries[0].stem+'.png'),r=decodePng(readFileSync(rockPng));r.data[3]=0;writeFileSync(rockPng,encodePng(r.width,r.height,r.data));
 const one=await importTextures(sources,up,{method:'nearest-2x',scale:2},provenance);
 expect(one.manifest.entries.map(e=>e.key)).toEqual(['rock_wall.tif']);expect(one.leftOut).toEqual([{key:'door.tif',reason:'alpha'}]);
 const gone=upscaled(dir);unlinkSync(join(gone,index.entries[0].stem+'.png'));mkdirSync(join(gone,'unrelated'));
 const two=await importTextures(sources,gone,{method:'nearest-2x',scale:2},provenance);
 expect(two.manifest.entries.map(e=>e.key)).toEqual(['door.tif']);expect(two.leftOut).toEqual([{key:'rock_wall.tif',reason:'missing'}]);
 unlinkSync(join(up,index.entries[0].stem+'.png'));
 await expect(importTextures(sources,up,{method:'nearest-2x',scale:2},provenance)).rejects.toThrow();
 await expect(importTextures(sources,upscaled(dir),{method:'nearest-2x',scale:4},provenance)).rejects.toThrow();
 await expect(importTextures(sources,upscaled(dir),{method:'bad\nmethod',scale:2},provenance)).rejects.toThrow();
 const changed=fabricated();changed[1]!.levels[0]!.data[0]=1;
 const partial=await importTextures(changed,upscaled(dir),{method:'nearest-2x',scale:2},provenance);
 expect(partial.leftOut).toEqual([{key:'door.tif',reason:'changed'}]);expect(partial.manifest.entries).toHaveLength(1);
});
it('GX-1 reduction: the Lanczos-3 2x reduction keeps a constant, copies a one-texel axis and honours wrap',()=>{
 const flat=image(8,4,0);flat.data.fill(90);for(let a=3;a<flat.data.length;a+=4)flat.data[a]=255;
 const half=lanczosHalf(flat,'repeat','clamp');expect([half.width,half.height]).toEqual([4,2]);expect(new Set(half.data).size).toBe(2);
 expect([...new Set(half.data)].sort()).toEqual([255,90]);
 const line=lanczosHalf({width:4,height:1,data:new Uint8ClampedArray([0,0,0,255,0,0,0,255,0,0,0,255,240,240,240,255])},'repeat','repeat');
 const clamped=lanczosHalf({width:4,height:1,data:new Uint8ClampedArray([0,0,0,255,0,0,0,255,0,0,0,255,240,240,240,255])},'clamp','clamp');
 expect([line.width,line.height]).toEqual([2,1]);expect(line.data[0]).toBeGreaterThan(clamped.data[0]!);expect(line.data[3]).toBe(255);
});
it('GX-1b roles: the export records its roles and the import writes them into the manifest, never a different set',async()=>{
 const sources=fabricated(),dir=join(temporary(),'export');await exportTextures(sources,dir,{...info,roles:'wide'});
 expect(JSON.parse(readFileSync(join(dir,'export.json'),'utf8')).roles).toBe('wide');
 const up=upscaled(dir),wide=await importTextures(sources,up,{method:'nearest-2x',scale:2},provenance);expect(wide.manifest.roles).toBe('wide');
 expect((await importTextures(sources,up,{method:'nearest-2x',scale:2,roles:'wide'},provenance)).manifest.roles).toBe('wide');
 await expect(importTextures(sources,up,{method:'nearest-2x',scale:2,roles:'world'},provenance)).rejects.toThrow();
 const plain=join(temporary(),'export');await exportTextures(sources,plain,info);
 expect(JSON.parse(readFileSync(join(plain,'export.json'),'utf8')).roles).toBe('world');
 expect((await importTextures(sources,upscaled(plain),{method:'nearest-2x',scale:2},provenance)).manifest.roles).toBe('world');
});
it('GX-1c map root: the archive must hold <map>.ZED, by its basename whether the member carries a backslash path or none',()=>{
 const toc=(...names:string[])=>names.map(name=>({name,offset:0,size:0}));
 expect(holdsMapRoot(toc('RUN\\MP\\MP2\\MP2_TXR.ZED','RUN\\MP\\MP2\\MP2.ZED'),'MP2')).toBe(true);
 expect(holdsMapRoot(toc('MP2.ZED'),'MP2')).toBe(true);expect(holdsMapRoot(toc('mp72.zed'),'MP72')).toBe(true);
 expect(holdsMapRoot(toc('RUN\\MP\\MP51\\MP51.ZED','RUN\\MP\\MP2\\MP2_TXR.ZED'),'MP2')).toBe(false);
 expect(holdsMapRoot(toc('RUN\\MP\\MP72\\XMP2.ZED','MP2.ZED.BAK'),'MP2')).toBe(false);
});
it('GX-1e: the generator takes any MP<n> archive as its map id, and nothing else',()=>{
 expect(mapIdOf(join('x','RUN','MP13.ZDB'))).toBe('MP13');expect(mapIdOf('mp81.zdb')).toBe('MP81');expect(mapIdOf('MP51.ZDB')).toBe('MP51');
 for(const bad of ['UI.ZDB','MP51.ZAR','MPX.ZDB','MP.ZDB','MP13.ZDB.bak'])expect(mapIdOf(bad)).toBeNull();
});

// GX-21 (plan 2026-10-10-web-graphics-slice-4-packs, GX.R10): the library index written at publish. Synthetic packs only.
async function packOf(colour:number){return buildTexturePack([{key:'synthetic',levels:[{width:1,height:1,data:new Uint8ClampedArray([colour,40,60,255])}],flags:{bilinear:true,transparent:false,graded:false,opaque:true,gs:null}}],{archiveSha256:'a'.repeat(64),archiveBytes:4,toolCommit:'b'.repeat(40),toolSha256:'c'.repeat(64)});}
const now=new Date('2026-10-10T03:00:00.000Z');
const json=(path:string)=>JSON.parse(readFileSync(path,'utf8'));
it('GX-21 publish: packs.json gains the pack (name, notes, the manifest\'s fields), current.json points at it, nothing staged is left',async()=>{
 const root=temporary(),p=await packOf(20);await publishTexturePack(root,p,{name:'Lanczos test',notes:'two times, synthetic',now});
 expect(json(join(root,'packs.json'))).toEqual({version:1,packs:[{id:p.id,name:'Lanczos test',kind:'textures',method:'lanczos3',scale:2,roles:'world',generatedAt:'2026-10-10T03:00:00.000Z',textures:1,bytes:16,notes:'two times, synthetic'}]});
 expect(json(join(root,'current.json'))).toEqual({version:1,packId:p.id});
 expect(readdirSync(root).sort()).toEqual(['current.json','packs.json',p.id].sort());
 const q=await packOf(21);await publishTexturePack(root,q,{now});
 expect(json(join(root,'packs.json')).packs.map((e:{name:string;notes:string})=>[e.name,e.notes])).toEqual([['Lanczos test','two times, synthetic'],['lanczos3-2x','']]);
});
it('GX-21 publish: --no-default leaves current.json alone; a republished id replaces its entry in place',async()=>{
 const root=temporary(),a=await packOf(30),b=await packOf(31),c=await packOf(32);
 await publishTexturePack(root,a,{name:'A',now});await publishTexturePack(root,b,{name:'B',setDefault:false,now});await publishTexturePack(root,c,{name:'C',setDefault:false,now});
 expect(json(join(root,'current.json')).packId).toBe(a.id);expect(json(join(root,'packs.json')).packs.map((e:{name:string})=>e.name)).toEqual(['A','B','C']);
 rmSync(join(root,b.id),{recursive:true});await publishTexturePack(root,b,{name:'B again',notes:'rebuilt',setDefault:false,now});
 expect(json(join(root,'packs.json')).packs.map((e:{id:string;name:string})=>[e.id,e.name])).toEqual([[a.id,'A'],[b.id,'B again'],[c.id,'C']]);
 expect(json(join(root,'current.json')).packId).toBe(a.id);
});
it('GX-21 publish: an index it cannot read, a bad name or note, or a 33rd pack refuses before anything is written',async()=>{
 const root=temporary(),a=await packOf(40);
 for(const options of [{name:''},{name:'x'.repeat(49)},{notes:'n'.repeat(241)},{name:'bad\nname'}]){await expect(publishTexturePack(root,a,{...options,now})).rejects.toThrow();expect(readdirSync(root)).toEqual([]);}
 for(const broken of ['{','{"version":2,"packs":[]}']){
  writeFileSync(join(root,'packs.json'),broken);writeFileSync(join(root,'current.json'),'existing');
  await expect(publishTexturePack(root,a,{now})).rejects.toThrow();
  expect(readFileSync(join(root,'packs.json'),'utf8')).toBe(broken);expect(readFileSync(join(root,'current.json'),'utf8')).toBe('existing');expect(existsSync(join(root,a.id))).toBe(false);
 }
 const full={version:1,packs:Array.from({length:32},(_,i)=>({id:i.toString(16).padStart(64,'0'),name:'p'+i,kind:'textures',method:'lanczos3',scale:2,roles:'world',generatedAt:'2026-10-10T03:00:00.000Z',textures:1,bytes:16,notes:''}))};
 writeFileSync(join(root,'packs.json'),JSON.stringify(full));await expect(publishTexturePack(root,a,{now})).rejects.toThrow(/more than 32 packs/);expect(existsSync(join(root,a.id))).toBe(false);
});
it('GX-21 the CLI options: --name, --notes and --no-default are taken out of the arguments and checked',()=>{
 expect(takePublishOptions(['MP51.ZDB','--import','d','--name','Model 4x','--notes','denoise 0.5','--no-default','--method','m','--scale','4'])).toEqual({args:['MP51.ZDB','--import','d','--method','m','--scale','4'],options:{name:'Model 4x',notes:'denoise 0.5',setDefault:false}});
 expect(takePublishOptions(['MP51.ZDB','wall'])).toEqual({args:['MP51.ZDB','wall'],options:{}});
 for(const bad of [['--name'],['--name','--notes','x'],['--name','x'.repeat(49)],['--name','a','--name','b'],['--no-default','--no-default'],['--notes','n'.repeat(241)]])expect(()=>takePublishOptions(['MP51.ZDB',...bad])).toThrow();
});
it('GX-21 review: the first packs.json on a map that already has a current.json pack lists that pack first, so the default stays listed',async()=>{
 const root=temporary(),old=await packOf(50),next=await packOf(51);
 await publishTexturePack(root,old,{now});rmSync(join(root,'packs.json'));     // a map published before the library existed
 await publishTexturePack(root,next,{name:'Next',setDefault:false,now});
 const index=json(join(root,'packs.json'));
 expect(index.packs.map((e:{id:string;name:string})=>[e.id,e.name])).toEqual([[old.id,'lanczos3-2x'],[next.id,'Next']]);
 expect(index.packs[0]).toMatchObject({kind:'textures',method:'lanczos3',scale:2,roles:'world',textures:1,bytes:16,notes:'listed from current.json when the index was created'});
 expect(json(join(root,'current.json')).packId).toBe(old.id);
 const lone=temporary(),p=await packOf(52);writeFileSync(join(lone,'current.json'),JSON.stringify({version:1,packId:'d'.repeat(64)}));
 await publishTexturePack(lone,p,{now});expect(json(join(lone,'packs.json')).packs.map((e:{id:string})=>e.id)).toEqual([p.id]);
});
