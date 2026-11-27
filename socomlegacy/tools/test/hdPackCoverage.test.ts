import {describe,expect,it} from 'vitest';
import {coverageMarkdown,coverageReport,extraRootNames,parseUnboundTsv,readCoverageSources,sourceKind,type CoverageSource} from '../hdPackCoverage';
import {validateHdManifest,type HdEntry} from '../../packages/viewer/src/hdTexturePack';
import {discRoot} from '../dump-dialogs';

/**
 * WM-50 (WM-PACK-1, product track: a tool, nothing the game does): the HD pack's per-map coverage table, which the
 * 2026-10-31 HD plan's "Per-map coverage" section holds only as a scratch count. Synthetic records and a five-entry
 * manifest built here (no game data, no pack); the dev-disc block re-counts that section's two disc rows.
 */
const k=(n:number)=>n.toString(16).padStart(64,'0');
const whole=(key:number,file:string):HdEntry=>({key:k(key),width:16,height:16,file,format:'dds',outWidth:64,outHeight:64,
  bytes:64*64*4,sha256:k(1000+key),tier:'A',source:`src${key}.dds`});
const placed=(key:number,file:string):HdEntry=>({...whole(key,file),placements:[{dst:[0,0,8,8],src:[0,0,32,32]}],placementKind:'crop'});
const manifest=()=>{
  const entries=[whole(1,'0.dds'),whole(2,'1.dds'),placed(4,'2.dds'),whole(6,'3.dds'),whole(9,'4.dds')];
  return validateHdManifest({format:'s2u-hd-texture-pack',version:1,localOnly:true,game:'SCUS-97275',name:'test pack',method:'synthetic',
    entries,totalBytes:5*64*64*4});
};
const img=(bank:string,name:string,key:number)=>({bank,name,key:k(key)});
/** MP6: its own bank holds k1, k2 (two records, one image) and k3; the shared HUD bank k4, k5. M51: k1, k6 and HUD k4. */
const sources=():CoverageSource[]=>[
  {where:'RUN/MP6.ZDB',images:[img('MP6_TXR.ZED','a1',1),img('MP6_TXR.ZED','a2',2),img('MP6_TXR.ZED','a2b',2),img('MP6_TXR.ZED','a3',3),
    img('HUD_TXR.ZED','h1',4),img('HUD_TXR.ZED','h2',5)]},
  {where:'RUN/M51.ZDB',images:[img('M51_TXR.ZED','b1',1),img('M51_TXR.ZED','b6',6),img('HUD_TXR.ZED','h1',4)]},
  {where:'RUN/UI',images:[img('UI_TXR.ZED','u7',7)]},
];

describe('the HD pack coverage table (WM-50)',()=>{
  it('names each source: a map, a mission, a downloadable map, anything else',()=>{
    expect(sourceKind('RUN/MP6.ZDB')).toEqual({label:'MP6',kind:'map',ownBank:'MP6_TXR.ZED'});
    expect(sourceKind('RUN/M51.ZDB')).toEqual({label:'M51',kind:'mission',ownBank:'M51_TXR.ZED'});
    expect(sourceKind('extra:RUN/MP/MP54')).toEqual({label:'MP54',kind:'map',ownBank:'MP54_TXR.ZED'});
    expect(sourceKind('RUN/UI')).toEqual({label:'RUN/UI',kind:'other',ownBank:null});
  });

  it('names an extra root\'s rows by its package (box run 11: three packages each showed only as extra:RUN/COMMON and extra:RUN/UI)',()=>{
    expect(sourceKind('extra:pkg00:RUN/MP/MP54')).toEqual({label:'MP54 (pkg00)',kind:'map',ownBank:'MP54_TXR.ZED'});
    expect(sourceKind('extra:pkg01:RUN/COMMON')).toEqual({label:'pkg01: RUN/COMMON',kind:'other',ownBank:null});
    expect(sourceKind('extra:pkg02:RUN/UI')).toEqual({label:'pkg02: RUN/UI',kind:'other',ownBank:null});
    expect(extraRootNames(['/x/pkg00','D:\\y\\pkg01\\','/z/pkg00','/w/pkg02'])).toEqual(['pkg00','pkg01','pkg00-2','pkg02']);
    const r=coverageReport([
      {where:'extra:pkg00:RUN/UI',images:[img('UI_TXR.ZED','u1',1)]},{where:'extra:pkg01:RUN/UI',images:[img('UI_TXR.ZED','u1',1)]},
    ],manifest());
    expect(r.rows.map(x=>x.label)).toEqual(['pkg00: RUN/UI','pkg01: RUN/UI']);
  });

  it('counts each map\'s own bank and archive by key: whole, placement only, none, and the entries it uses',()=>{
    const r=coverageReport(sources(),manifest());
    const mp6=r.rows.find(x=>x.label==='MP6')!,m51=r.rows.find(x=>x.label==='M51')!;
    expect(mp6.own).toEqual({records:4,images:3,whole:2,placementOnly:0,none:1,percent:66.7,unbound:['a3']});
    expect(mp6.archive).toEqual({records:6,images:5,whole:2,placementOnly:1,none:2,percent:60,unbound:['a3','h2']});
    expect(mp6.entriesUsed).toBe(3);
    expect(m51.kind).toBe('mission');
    expect(m51.own).toEqual({records:2,images:2,whole:2,placementOnly:0,none:0,percent:100,unbound:[]});
    expect(m51.archive).toMatchObject({records:3,images:3,whole:2,placementOnly:1,none:0,percent:100});
    expect(m51.entriesUsed).toBe(3);
    expect(r.rows.map(x=>x.label)).toEqual(['MP6','M51','RUN/UI']);   // maps, then missions, then the rest
  });

  it('totals over the maps and missions, over every source, and lists the entries no source uses',()=>{
    const r=coverageReport(sources(),manifest());
    expect(r.totals.maps).toEqual({images:6,whole:3,placementOnly:1,none:2,percent:66.7,entriesUsed:4});
    expect(r.totals.all).toEqual({images:7,whole:3,placementOnly:1,none:3,percent:57.1,entriesUsed:4});
    expect(r.unusedEntries).toEqual([{key:k(9),file:'4.dds',source:'src9.dds',placement:false}]);
    expect(r.pack).toEqual({name:'test pack',entries:5,keys:5,files:5});
  });

  it('folds in the builder\'s left-out list, each file with why, and refuses a malformed row',()=>{
    const tsv='name\tbytes\twhy\nfoo.dds\t1024\tno exact hash match\nbar.dds\t2048\tno exact hash match\r\nbaz.png\t10\tplacement refused: x\n\n';
    const u=parseUnboundTsv(tsv);
    expect(u).toEqual([{name:'foo.dds',bytes:1024,why:'no exact hash match'},{name:'bar.dds',bytes:2048,why:'no exact hash match'},
      {name:'baz.png',bytes:10,why:'placement refused: x'}]);
    expect(()=>parseUnboundTsv('foo.dds\tlots\twhy\n')).toThrow(/line 1/);
    const r=coverageReport(sources(),manifest(),u);
    expect(r.unbound).toEqual({files:3,bytes:3082,byWhy:[{why:'no exact hash match',files:2,bytes:3072},{why:'placement refused: x',files:1,bytes:10}],list:u});
  });

  it('renders the markdown table, totals, the unused entries and the left-out files',()=>{
    const md=coverageMarkdown(coverageReport(sources(),manifest(),parseUnboundTsv('foo.dds\t1024\tno exact hash match\n')));
    expect(md).toContain('| MP6 | map | 4 / 3 | 2 (whole 2, placement 0) | 1: a3 | 66.7 % | 5 / 2 / 1 / 2 | 60.0 % | 3 |');
    expect(md).toContain('| M51 | mission |');
    expect(md).toMatch(/maps and missions.*\| 6 \| 3 \| 1 \| 2 \| 66\.7 % \| 4 \|/);
    expect(md).toContain('`4.dds`');
    expect(md).toContain('| `foo.dds` | 1024 | no exact hash match |');
  });
});

/**
 * The disc's own rows of the HD plan's "Per-map coverage" table (DF-11, 2026-11-08): records and images, no pack. The
 * archives' images are the table's (479, 462). MP71's own bank is 56 / 56 by key where the table has 56 / 55 "(two keys
 * one image)": its scratch count de-duplicated across the whole ZDB, so the own bank's `sunglow.tif`, the same image as
 * `HUD2_TXR.ZED:sunshine.tif` (read first), was credited to HUD2. Here an own bank counts every image it holds.
 */
const DISC=discRoot();
describe.skipIf(!DISC)('the coverage reader on the disc (SOCOM_DISC / SOCOM_PC_ROOT)',()=>{
  it('reads MP6 and MP71 as the plan\'s table counted them (MP71\'s own bank by key, above)',()=>{
    const got=readCoverageSources(DISC!,{only:w=>/\/(MP6|MP71)\.ZDB$/i.test(w)});
    const empty=validateHdManifest({format:'s2u-hd-texture-pack',version:1,localOnly:true,game:'SCUS-97275',name:'none',method:'none',
      entries:[whole(1,'0.dds')],totalBytes:64*64*4});
    const r=coverageReport(got,empty),row=(l:string)=>r.rows.find(x=>x.label===l)!;
    expect(row('MP6').own).toMatchObject({records:69,images:69});
    expect(row('MP71').own).toMatchObject({records:56,images:56});
    expect(row('MP6').archive.records).toBe(485);
    expect(row('MP71').archive.records).toBe(472);
    expect(row('MP6').archive.images).toBe(479);
    expect(row('MP71').archive.images).toBe(462);
  },600_000);
});
