import {afterEach,expect,it} from 'vitest';
import {mkdtempSync,readFileSync,rmSync,writeFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep,basename} from 'node:path';
import {buildTexturePack} from '../localTexturePack';
import {generateLocalTexturePack,publishTexturePack,setDefaultPack} from '../writeLocalTexturePack';

// GX-21 review 2 (plan 2026-10-10-web-graphics-slice-4-packs): --set-default, early method checks, repeated options.
// Synthetic packs in temporary directories only; the archive paths below do not exist, so a refusal that names its
// reason proves it came before the archive was read.
const roots:string[]=[];afterEach(()=>{for(const r of roots.splice(0)){if(!resolve(r).startsWith(resolve(tmpdir())+sep)||!basename(r).startsWith('s2u-pack-'))throw Error('Unsafe cleanup');rmSync(r,{recursive:true,force:true});}});
const temporary=()=>{const r=mkdtempSync(join(tmpdir(),'s2u-pack-'));roots.push(r);return r;};
const packOf=(colour:number)=>buildTexturePack([{key:'synthetic',levels:[{width:1,height:1,data:new Uint8ClampedArray([colour,40,60,255])}],flags:{bilinear:true,transparent:false,graded:false,opaque:true,gs:null}}],{archiveSha256:'a'.repeat(64),archiveBytes:4,toolCommit:'b'.repeat(40),toolSha256:'c'.repeat(64)});
const now=new Date('2026-10-10T03:00:00.000Z');
const current=(root:string)=>JSON.parse(readFileSync(join(root,'current.json'),'utf8'));
const nowhere=join(tmpdir(),'s2u-no-such-dir','RUN','MP51.ZDB');

it('--set-default moves current.json to a listed pack by id or by name, atomically, and refuses with the reason otherwise',async()=>{
 const root=temporary(),a=await packOf(60),b=await packOf(61);
 await publishTexturePack(root,a,{name:'First',now});await publishTexturePack(root,b,{name:'Second',now});
 expect(current(root).packId).toBe(b.id);
 expect(await setDefaultPack(root,'First','MP51')).toEqual({id:a.id,name:'First'});expect(current(root)).toEqual({version:1,packId:a.id});
 expect(await setDefaultPack(root,b.id,'MP51')).toEqual({id:b.id,name:'Second'});expect(current(root).packId).toBe(b.id);
 await expect(setDefaultPack(root,'Third','MP51')).rejects.toThrow(/no pack with the id or name "Third" in packs.json/);
 rmSync(join(root,a.id,'manifest.json'));await expect(setDefaultPack(root,'First','MP51')).rejects.toThrow(/First: its manifest is missing or does not match its id/);
 const index=JSON.parse(readFileSync(join(root,'packs.json'),'utf8'));index.packs.push({...index.packs[1],id:'f'.repeat(64)});
 writeFileSync(join(root,'packs.json'),JSON.stringify(index));await expect(setDefaultPack(root,'Second','MP51')).rejects.toThrow(/"Second" names 2 packs; give the id/);
 expect(current(root).packId).toBe(b.id);
 const bare=temporary();await expect(setDefaultPack(bare,'First','MP51')).rejects.toThrow(/no packs.json/);expect(existsSync(join(bare,'current.json'))).toBe(false);
});
it('--set-default reads no archive and takes only the map and the pack',async()=>{
 await expect(generateLocalTexturePack([nowhere,'--set-default','x','--scale','2'])).rejects.toThrow(/--set-default takes only <MPn> and the pack/);
 await expect(generateLocalTexturePack(['MP9999','--set-default','x'])).rejects.toThrow(/no packs.json/);
});
it('a bad --method is refused right after the options are read, before the archive: enhance: present, over 512 with its suffix, --from 4x\'s word',async()=>{
 const imp=(method:string,...extra:string[])=>generateLocalTexturePack([nowhere,'--import',temporary(),'--method',method,...extra]);
 await expect(imp('m enhance:unsharp=1,1,0','--scale','4','--enhance','saturation=1.2')).rejects.toThrow(/already carries an enhance: suffix/);
 await expect(imp('x'.repeat(500),'--scale','4','--enhance','saturation=1.2')).rejects.toThrow(/longer than 512 characters/);
 await expect(imp('realesrgan-x4plus-8x','--scale','2','--from','4x')).rejects.toThrow(/names another scale or a variant/);
 await expect(imp('bad\nmethod','--scale','4')).rejects.toThrow(/--method is not 1-512 printable characters/);
});
it('a repeated option is refused with a message naming it',async()=>{
 const cases:[string[],RegExp][]=[
  [['--import','d','--method','m','--scale','2','--scale','4'],/--scale is given twice/],
  [['--import','d','--method','m','--scale','4','--enhance','saturation=1.1','--enhance','saturation=1.2'],/--enhance is given twice/],
  [['--import','d','--import','e','--method','m','--scale','4'],/--import is given twice/],
  [['wall','--name','a','--name','b'],/--name is given twice/],
  [['wall','--no-default','--no-default'],/--no-default is given twice/],
  [['wall','--dry-run','--dry-run'],/--dry-run is given twice/],
 ];
 for(const [args,message] of cases)await expect(generateLocalTexturePack([nowhere,...args]),args.join(' ')).rejects.toThrow(message);
});
it('review 3: --from 4x alone is bounded at 512 on the final method before any read',async()=>{
 const method='realesrgan-x4plus-4x '+'f'.repeat(484);expect(method.length).toBe(505);
 await expect(generateLocalTexturePack([nowhere,'--import',temporary(),'--method',method,'--scale','2','--from','4x'])).rejects.toThrow(/longer than 512|not 1-512 printable/);
});
it('review 3: --set-default refuses a pack made for another map, and an index entry its manifest disagrees with',async()=>{
 const root=temporary(),a=await packOf(70),b=await packOf(71);
 await publishTexturePack(root,a,{name:'A',now});await publishTexturePack(root,b,{name:'B',now});
 await expect(setDefaultPack(root,'A','MP2')).rejects.toThrow(/A: made for RUN\/MP51.ZDB, not RUN\/MP2.ZDB/);
 const index=JSON.parse(readFileSync(join(root,'packs.json'),'utf8'));index.packs[0].scale=4;writeFileSync(join(root,'packs.json'),JSON.stringify(index));
 await expect(setDefaultPack(root,'A','MP51')).rejects.toThrow(/A: the index entry does not match its manifest/);
 expect(current(root).packId).toBe(b.id);
});
