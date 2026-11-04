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
describe('GX-24 group table controls',()=>{
 it('shows unsupported anisotropy explicitly and leaves its switch disabled',()=>{
  mount(1);expect(input('worldAnisotropy').disabled).toBe(true);
  expect(document.getElementById('exp-world-anisotropy-status')!.textContent).toContain('Unsupported');
 });
 // The owner's defaults (2026-10-11, H135): the world sampling switches OFF; FXAA and the bicubic resolve filter ON.
 const offByDefault=['worldAnisotropy','worldTrilinear','worldLodBias'],onByDefault=['fxaa','resolveFiltering'];
 const atDefaults=()=>{
  for(const id of offByDefault)expect(input(id).checked,id).toBe(false);
  for(const id of onByDefault)expect(input(id).checked,id).toBe(true);
  expect(input('resolveFilter').value).toBe('bicubic');
 };
 it("gates LOD bias and resolve prerequisites, preserves A/B settings, resets every new switch to the owner's default",()=>{
  mount(16);expect(input('worldAnisotropy').disabled).toBe(false);
  atDefaults();expect(state).toMatchObject({fxaa:true,resolveFiltering:true,resolveFilter:'bicubic'});
  input('worldLodBias').click();expect(input('worldLodBiasValue').disabled).toBe(true);
  input('worldTrilinear').click();expect(input('worldLodBiasValue').disabled).toBe(false);
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
