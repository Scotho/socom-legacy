import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,openAsBlob,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {THUNDERSTORE_PACKAGE_RULES,unwrapThunderstore} from '@s2u/creator-contracts';
import {bytesSource,openZip} from '../../packages/viewer/src/zipReader';
import {importHdZip,memoryHdStore} from '../../packages/viewer/src/hdTexturePackStore';
import {decodePng,encodePng} from '../png';
import {writeZipFile} from '../parity-pack/zipStream';
import {checkThunderstoreZip,generatedIcon,HD_TS_NAME_DEFAULT,HD_TS_VERSION_DEFAULT,hdThunderstoreFlags,writeHdThunderstoreZip} from '../hdPackThunderstore';

/**
 * B206 ML-5 (plan 2026-11-06-mods-loader, ML.R3, ML.R16): the owner's Thunderstore upload zip made from a built HD
 * pack's layout, its check, and the round trip through `unwrapThunderstore` and `importHdZip`. Product track (OT.R53).
 * Synthetic packs only: made-up keys, a 2x2 PNG and a DDS-shaped byte run as payloads, no disc data and no pack art.
 */

let dir='';
beforeEach(()=>{dir=mkdtempSync(join(tmpdir(),'s2u-ml5-'));});
afterEach(()=>{rmSync(dir,{recursive:true,force:true});});

const sha=(b:Uint8Array|Uint8ClampedArray)=>createHash('sha256').update(b).digest('hex');
/** A built HD layout as `hd-pack-from-pcsx2.ts` writes it: `current.json`, `<id>/manifest.json`, payloads, `below-bar.json`. */
function layout():{root:string;id:string;files:Map<string,Uint8Array>}{
  const root=join(dir,'hd'),px=new Uint8ClampedArray(16).fill(200),png=encodePng(2,2,px);
  const dds=Uint8Array.from({length:128+64},(_,i)=>i&255);
  const entry=(k:string,file:string,format:string,tier:string)=>({key:k.repeat(64),width:1,height:1,file,format,outWidth:2,outHeight:2,bytes:16,sha256:sha(px),tier,source:`made-up-${k}.${format}`});
  const manifest={format:'s2u-hd-texture-pack',version:1,localOnly:true,game:'SCUS-97275',name:'Made-up HD',method:'synthetic',
    entries:[entry('a','0.png','png','A'),entry('b','1.dds','dds','C'),entry('c','0.png','png','A')],totalBytes:32};
  const mb=new TextEncoder().encode(JSON.stringify(manifest)),id=sha(mb);
  mkdirSync(join(root,id),{recursive:true});
  const files=new Map<string,Uint8Array>([[`experimental-packs/hd/${id}/manifest.json`,mb],[`experimental-packs/hd/${id}/0.png`,png],[`experimental-packs/hd/${id}/1.dds`,dds]]);
  for(const [n,b] of files)writeFileSync(join(root,id,n.split('/').at(-1)!),b);
  writeFileSync(join(root,id,'below-bar.json'),'[]');
  const current=new TextEncoder().encode(JSON.stringify({version:1,packId:id}));
  writeFileSync(join(root,'current.json'),current);files.set('experimental-packs/hd/current.json',current);
  return {root,id,files};
}
async function entries(zip:string){
  const z=await openZip(bytesSource(new Uint8Array(readFileSync(zip))));
  return Promise.all(z.members.map(async m=>({path:m.name,bytes:await z.read(m)})));
}
const json=(b:Uint8Array)=>JSON.parse(new TextDecoder().decode(b)) as Record<string,unknown>;

describe('the owner\'s Thunderstore upload zip (ML-5)',()=>{
  it('wraps a built pack: the store\'s root files, then the HD layout under experimental-packs/hd/',async()=>{
    const {root,id}=layout(),out=join(dir,'pack.zip');
    const r=await writeHdThunderstoreZip(out,root,{credit:'Made-up credit line.'});
    const list=(await entries(out)).map(e=>e.path);
    expect(list).toEqual(['manifest.json','icon.png','README.md','experimental-packs/hd/current.json',
      `experimental-packs/hd/${id}/manifest.json`,`experimental-packs/hd/${id}/0.png`,`experimental-packs/hd/${id}/1.dds`]);
    const byPath=new Map((await entries(out)).map(e=>[e.path,e.bytes]));
    const m=json(byPath.get('manifest.json')!);
    expect(Object.keys(m)).toEqual([...THUNDERSTORE_PACKAGE_RULES.manifestKeys]);
    expect(m).toMatchObject({name:HD_TS_NAME_DEFAULT,version_number:HD_TS_VERSION_DEFAULT,website_url:'',dependencies:[]});
    expect((m.description as string).length).toBeLessThanOrEqual(250);
    expect(r.manifest).toEqual(m);
    const icon=decodePng(byPath.get('icon.png')!);expect([icon.width,icon.height]).toEqual([256,256]);
    const readme=new TextDecoder().decode(byPath.get('README.md')!);
    expect(readme).toContain('Made-up HD');expect(readme).toContain('Experiments > Mods');expect(readme).toContain('Made-up credit line.');
    expect(readme).toMatch(/\| A \| 2 \|/);expect(readme).toMatch(/\| C \| 1 \|/);
  });

  it('takes the name, version, description, website and icon it is given',async()=>{
    const {root}=layout(),out=join(dir,'pack.zip'),icon=encodePng(256,256,new Uint8ClampedArray(256*256*4).fill(77));
    const opts=hdThunderstoreFlags(['--ts-name','Made_Up','--ts-version','2.3.4','--ts-description','A made-up pack.','--website','https://example.invalid/x','--icon',(writeFileSync(join(dir,'i.png'),icon),join(dir,'i.png'))]);
    await writeHdThunderstoreZip(out,root,opts);
    const byPath=new Map((await entries(out)).map(e=>[e.path,e.bytes]));
    expect(json(byPath.get('manifest.json')!)).toEqual({name:'Made_Up',version_number:'2.3.4',website_url:'https://example.invalid/x',description:'A made-up pack.',dependencies:[]});
    expect(byPath.get('icon.png')).toEqual(icon);
  });

  it.each([
    ['a name outside [A-Za-z0-9_]',{name:'SOCOM II HD'},/name/],
    ['a version that is not Major.Minor.Patch',{version:'1.0'},/version/],
    ['a description over 250 characters',{description:'x'.repeat(251)},/description/],
    ['a website that is not http(s)',{websiteUrl:'ftp://example.invalid'},/website/],
    ['an icon that is not 256x256',{icon:encodePng(128,128,new Uint8ClampedArray(128*128*4))},/icon/],
  ])('refuses %s at build time, writing nothing',async(_,opts,why)=>{
    const {root}=layout(),out=join(dir,'pack.zip');
    await expect(writeHdThunderstoreZip(out,root,opts)).rejects.toThrow(why);
    expect(existsSync(out)).toBe(false);
  });

  it('refuses a folder with no built pack',async()=>{
    mkdirSync(join(dir,'empty'));
    await expect(writeHdThunderstoreZip(join(dir,'pack.zip'),join(dir,'empty'),{})).rejects.toThrow(/current\.json/);
  });

  it('credits GoE SouL in the description and the README when no --credit is given (the owner, 2026-11-09)',async()=>{
    const {root}=layout(),out=join(dir,'pack.zip');
    const r=await writeHdThunderstoreZip(out,root,{});
    expect(r.manifest.description).toContain('HD textures by GoE SouL');
    expect(r.manifest.description.length).toBeLessThanOrEqual(250);
    const readme=new TextDecoder().decode(new Map((await entries(out)).map(e=>[e.path,e.bytes])).get('README.md')!);
    expect(readme).toMatch(/## Credit\n\nHD textures by GoE SouL\./);
    expect((await checkThunderstoreZip(out)).warnings).toEqual([]);
  });

  it('generates a plain 256x256 icon when none is given',()=>{
    const icon=decodePng(generatedIcon());expect([icon.width,icon.height]).toEqual([256,256]);
  });
});

describe('--check (ML-5)',()=>{
  it('passes the zip it made, read back as MODS will read it',async()=>{
    const {root}=layout(),out=join(dir,'pack.zip');
    await writeHdThunderstoreZip(out,root,{credit:'c'});
    const c=await checkThunderstoreZip(out);
    expect(c.problems).toEqual([]);expect(c.ok).toBe(true);
    expect(c).toMatchObject({name:HD_TS_NAME_DEFAULT,version:HD_TS_VERSION_DEFAULT,textures:3});
  });

  it('refuses a hand-made zip with a bad name, version and icon',async()=>{
    const {root,id,files}=layout(),staged=join(dir,'staged');mkdirSync(staged);
    const put=(n:string,b:Uint8Array)=>{const p=join(staged,n.replace(/\//g,'_'));writeFileSync(p,b);return {name:n,path:p};};
    const zip=join(dir,'bad.zip');
    await writeZipFile(zip,[
      put('manifest.json',new TextEncoder().encode(JSON.stringify({name:'bad name',version_number:'1.0',website_url:'',description:'d',dependencies:[]}))),
      put('icon.png',encodePng(64,64,new Uint8ClampedArray(64*64*4))),put('README.md',new TextEncoder().encode('# r\n')),
      ...[...files].map(([n,b])=>put(n,b))]);
    void root;void id;
    const c=await checkThunderstoreZip(zip);
    expect(c.ok).toBe(false);
    expect(c.problems.join('\n')).toMatch(/name/);expect(c.problems.join('\n')).toMatch(/version_number/);expect(c.problems.join('\n')).toMatch(/icon\.png/);
  });

  it('refuses a zip that is not a store package, and one whose HD pack does not check out',async()=>{
    const {files}=layout(),staged=join(dir,'staged');mkdirSync(staged);
    const put=(n:string,b:Uint8Array)=>{const p=join(staged,n.replace(/\//g,'_'));writeFileSync(p,b);return {name:n,path:p};};
    const bare=join(dir,'bare.zip');await writeZipFile(bare,[...files].map(([n,b])=>put(n,b)));
    expect((await checkThunderstoreZip(bare)).problems.join('\n')).toMatch(/not a Thunderstore package/);
    const store=[put('manifest.json',new TextEncoder().encode(JSON.stringify({name:'X',version_number:'1.0.0',website_url:'',description:'d',dependencies:[]}))),
      put('icon.png',generatedIcon()),put('README.md',new TextEncoder().encode('# r\n'))];
    const broken=join(dir,'broken.zip');
    await writeZipFile(broken,[...store,...[...files].filter(([n])=>!n.endsWith('1.dds')).map(([n,b])=>put(n,b))]);
    expect((await checkThunderstoreZip(broken)).problems.join('\n')).toMatch(/1\.dds is missing/);
  });
});

describe('the round trip (ML-5 -> ML-1)',()=>{
  it('unwrap(wrap(pack)) is the pack, and the importer takes the wrapped zip whole',async()=>{
    const {root,id,files}=layout(),out=join(dir,'pack.zip');
    await writeHdThunderstoreZip(out,root,{});
    const u=unwrapThunderstore(await entries(out));
    expect(u.wrapped).toBe(true);if(!u.wrapped)return;
    expect(u.report.status).toBe('pass');
    expect(new Map(u.members.map(e=>[e.path,e.bytes]))).toEqual(files);
    const store=memoryHdStore(),got=await importHdZip(await openAsBlob(out),store);
    expect(got).toEqual({name:'Made-up HD',textures:3,bytes:32});
    expect((await store.current())?.id).toBe(id);
  });

  it('a bare pack passes unwrap unchanged',async()=>{
    const {files}=layout(),bare=[...files].map(([path,bytes])=>({path,bytes}));
    const u=unwrapThunderstore(bare);
    expect(u.wrapped).toBe(false);expect(u.members).toBe(bare);
  });
});
