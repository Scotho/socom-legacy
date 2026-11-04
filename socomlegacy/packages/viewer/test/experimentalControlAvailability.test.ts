// @vitest-environment jsdom
import {beforeEach,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mountExperimentalGraphics,type ExperimentalSettings} from '../src/experimentalGraphics';
import {Ui} from '../src/ui';
let states:ExperimentalSettings[]=[];
const input=(id:string)=>document.getElementById('exp-'+id) as HTMLInputElement;
const select=(id:string,value:string)=>{const el=document.getElementById('exp-'+id) as HTMLSelectElement;el.value=value;el.dispatchEvent(new Event('change'));};
beforeEach(()=>{document.body.innerHTML=readFileSync(resolve(dirname(fileURLToPath(import.meta.url)),'../setup/index.html'),'utf8');document.body.className='test-room';states=[];const ui=new Ui(),preview=ui.onLook();mountExperimentalGraphics(document,s=>states.push(s),()=>preview('modern'));});
it('makes the picture/master gate explicit instead of offering inert controls',()=>{
 expect(states.at(-1)?.enabled).toBe(false);expect(input('enabled').disabled).toBe(true);expect(input('exposure').disabled).toBe(true);
 document.querySelector<HTMLButtonElement>('[data-experimental]')!.click();expect(states.at(-1)?.enabled).toBe(true);expect(input('enabled').disabled).toBe(false);expect(input('exposure').disabled).toBe(false);
 input('enabled').click();expect(input('enabled').disabled).toBe(false);expect(input('exposure').disabled).toBe(true);
 input('enabled').click();expect(input('exposure').disabled).toBe(false);
 document.querySelector<HTMLButtonElement>('[data-look="modern"]')!.click();expect(input('enabled').disabled).toBe(true);expect(input('exposure').disabled).toBe(true);
});
it('gates each new colour control and labels neutral settings',()=>{
 document.querySelector<HTMLButtonElement>('[data-experimental]')!.click();
 expect(input('warmth').disabled).toBe(true);input('whiteBalance').click();expect(input('warmth').disabled).toBe(false);
 expect(document.getElementById('exp-colour-status')!.textContent).toContain('neutral');
 input('warmth').value='1';input('warmth').dispatchEvent(new Event('input'));expect(states.at(-1)?.warmth).toBe(1);
 input('bloomTint').click();expect(input('bloomRed').disabled).toBe(false);input('bloom').click();expect(input('bloomRed').disabled).toBe(true);
});
it('only offers UI sliders for modes that use them, and explains nearest is already the reticle default',()=>{
 document.querySelector<HTMLButtonElement>('[data-experimental]')!.click();input('hudSampling').click();
 expect(input('hudSharpness').disabled).toBe(true);expect(input('hudSnap').disabled).toBe(true);expect(document.getElementById('exp-hud-status')!.textContent).toContain('reticle already uses nearest');
 select('hudMode','sharpen');expect(input('hudSharpness').disabled).toBe(false);expect(input('hudSnap').disabled).toBe(true);
 select('hudMode','integer');expect(input('hudSharpness').disabled).toBe(true);expect(input('hudSnap').disabled).toBe(false);
 input('menuSampling').click();select('menuMode','integer');expect(input('menuSnap').disabled).toBe(false);expect(document.getElementById('exp-menu-status')!.textContent).toContain('Open menu preview');
 input('enabled').click();expect(input('menuSnap').disabled).toBe(true);expect((document.getElementById('exp-hudMode') as HTMLSelectElement).disabled).toBe(true);
});
