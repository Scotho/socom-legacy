// @vitest-environment jsdom
import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mountExperimentalGraphics,EXPERIMENTAL_DEFAULTS,type ExperimentalSettings} from '../src/experimentalGraphics';
import {parseMenuSampling} from '../src/experimentalUiSampling';
it('HUD and menu groups start OFF, emit choices and reset; link carries only enabled menu preferences',()=>{
 document.body.innerHTML=readFileSync(resolve(dirname(fileURLToPath(import.meta.url)),'../setup/index.html'),'utf8');document.body.className='test-room';
 const states:ExperimentalSettings[]=[];mountExperimentalGraphics(document,s=>states.push(s),()=>{});
 const hud=document.querySelector<HTMLInputElement>('#exp-hudSampling'),menu=document.querySelector<HTMLInputElement>('#exp-menuSampling');
 expect(hud).not.toBeNull();expect(menu).not.toBeNull();expect(hud!.checked).toBe(false);expect(menu!.checked).toBe(false);
 expect(EXPERIMENTAL_DEFAULTS.hudSampling).toBe(false);expect(EXPERIMENTAL_DEFAULTS.menuSampling).toBe(false);
 document.querySelector<HTMLButtonElement>('[data-experimental]')!.click();hud!.click();menu!.click();
 const choice=document.querySelector<HTMLSelectElement>('#exp-menuMode')!;choice.value='integer';choice.dispatchEvent(new Event('change'));
 const snap=document.querySelector<HTMLInputElement>('#exp-menuSnap')!;snap.value='2';snap.dispatchEvent(new Event('input'));
 expect(states.at(-1)).toMatchObject({enabled:true,hudSampling:true,menuSampling:true,menuMode:'integer',menuSnap:2});
 const link=document.querySelector<HTMLAnchorElement>('#exp-menu-preview')!;
 expect(parseMenuSampling(new URL(link.href).search)).toMatchObject({enabled:true,mode:'integer',snap:2});
 document.querySelector<HTMLInputElement>('#exp-enabled')!.click();expect(parseMenuSampling(new URL(link.href).search)).toBeNull();
 document.querySelector<HTMLButtonElement>('#exp-reset')!.click();expect(hud!.checked).toBe(false);expect(menu!.checked).toBe(false);expect(choice.value).toBe('nearest');expect(snap.value).toBe('1');
});
