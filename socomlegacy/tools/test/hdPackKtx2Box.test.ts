import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';
import {validateHdManifest} from '../../packages/viewer/src/hdTexturePack';
import {checkPackKtx2} from '../hdPackKtx2Check';

/**
 * WM-PACK-2 (b)'s box test: over a real built HD pack (`S2U_HD_PACK_DIR`, the folder holding its manifest.json and
 * payloads; third-party art, never in git, HD.R5), every DDS payload's KTX2 decodes to the very RGBA its DDS decodes
 * to, and keeps its blocks byte for byte. Without the pack it skips, and the skip is said, never counted as a pass.
 */
const DIR=process.env.S2U_HD_PACK_DIR;
describe.skipIf(!DIR||!existsSync(join(DIR,'manifest.json')))('the HD pack as KTX2, exact (S2U_HD_PACK_DIR)',()=>{
  it('converts every DDS payload with no mismatch',()=>{
    const m=validateHdManifest(JSON.parse(readFileSync(join(DIR!,'manifest.json'),'utf8')));
    const r=checkPackKtx2(m,f=>new Uint8Array(readFileSync(join(DIR!,f))));
    console.log(JSON.stringify({...r,mismatches:r.mismatches.slice(0,20)}));
    expect(r.mismatches).toEqual([]);
    expect(r.converted+r.png).toBe(r.payloads);
  },3_600_000);
});
