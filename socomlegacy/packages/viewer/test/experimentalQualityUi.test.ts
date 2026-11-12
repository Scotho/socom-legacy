// @vitest-environment jsdom
import {beforeEach,describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mountExperimentalGraphics,type ExperimentalSettings} from '../src/experimentalGraphics';
import {setWorldSamplingMaximum} from '../src/experimentalWorldSampling';
const html=readFileSync(resolve(dirname(fileURLToPath(import.meta.url)),'../setup/index.html'),'utf8');
let state:ExperimentalSettings;
const input=(id:string)=>document.getElementById('exp-'+id) as HTMLInputElement;
const mount=(max:number)=>{setWorldSamplingMaximum(max);mountExperimentalGraphics(document,s=>state=s,()=>{});document.querySelector<HTMLButtonElement>('[data-experimental]')!.click();};
beforeEach(()=>{document.body.innerHTML=html;document.body.className='test-room';});
const anisotropic=()=>Array.from((document.getElementById('exp-filterMode') as HTMLSelectElement).options).find(o=>o.value==='anisotropic')!;
const mode=(value:string)=>{const s=document.getElementById('exp-filterMode') as HTMLSelectElement;s.value=value;s.dispatchEvent(new Event('change'));};
describe('GX-24 group table controls',()=>{
 // B206 ML-7 (ML.R14): the world-sampling switches are Texture filtering's modes.
 it('shows unsupported anisotropy explicitly and leaves its mode disabled',()=>{
  mount(1);expect(anisotropic().disabled).toBe(true);
  expect(document.getElementById('exp-world-anisotropy-status')!.textContent).toContain('Unsupported');
 });
 // The owner's defaults (2026-10-11, H135): the world sampling switches OFF (Texture filtering at Original LOD); FXAA and the bicubic resolve filter ON.
 const onByDefault=['fxaa','resolveFiltering'];
 const atDefaults=()=>{
  expect((document.getElementById('exp-filterMode') as HTMLSelectElement).value).toBe('original');
  expect(state).toMatchObject({worldAnisotropy:false,worldTrilinear:false,worldLodBias:false});
  for(const id of onByDefault)expect(input(id).checked,id).toBe(true);
  expect(input('resolveFilter').value).toBe('bicubic');
 };
 it("gates the filtering prerequisites and resolve, preserves A/B settings, resets every new switch to the owner's default",()=>{
  mount(16);expect(anisotropic().disabled).toBe(false);
  atDefaults();expect(state).toMatchObject({fxaa:true,resolveFiltering:true,resolveFilter:'bicubic'});
  input('textureFiltering').click();expect(input('filterBias').disabled).toBe(true);
  input('textureFiltering').click();mode('trilinear');expect(input('filterBias').disabled).toBe(false);expect(state).toMatchObject({worldTrilinear:true,worldLodBias:true});
  expect(input('resolveFilter').disabled).toBe(false);
  input('resolution').click();expect(input('resolveFilter').disabled).toBe(true);
  input('resolution').click();expect(input('resolveFilter').disabled).toBe(false);
  input('resolveFiltering').click();expect(input('resolveFilter').disabled).toBe(true);expect(state.resolveFiltering).toBe(false);
  input('fxaa').click();input('enabled').click();expect(state.enabled).toBe(false);expect(state.fxaa).toBe(false);
  input('enabled').click();expect(state.enabled).toBe(true);expect(state.fxaa).toBe(false);
  document.getElementById('exp-reset')!.click();
  atDefaults();
 });
 it('does not mount any new control outside the test room',()=>{
  document.body.className='';mountExperimentalGraphics(document,()=>{},()=>{});expect(input('fxaa')).toBeNull();
 });
});
