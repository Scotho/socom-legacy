// @vitest-environment jsdom
import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mountExperimentalGraphics,EXPERIMENTAL_DEFAULTS,type ExperimentalSettings} from '../src/experimentalGraphics';
import {parseMenuSampling} from '../src/experimentalUiSampling';
// B206 ML-7 (ML.R14): the HUD's and the menus' groups are one UI sampling group ("Applies to" HUD / menu preview / both).
it('HUD and menu groups start OFF, emit choices and reset; link carries only enabled menu preferences',()=>{
 document.body.innerHTML=readFileSync(resolve(dirname(fileURLToPath(import.meta.url)),'../setup/index.html'),'utf8');document.body.className='test-room';
 const states:ExperimentalSettings[]=[];mountExperimentalGraphics(document,s=>states.push(s),()=>{});
 const ui=document.querySelector<HTMLInputElement>('#exp-uiSampling'),applies=document.querySelector<HTMLSelectElement>('#exp-uiApplies');
 expect(ui).not.toBeNull();expect(applies).not.toBeNull();expect(ui!.checked).toBe(false);expect(applies!.value).toBe('both');
 expect(EXPERIMENTAL_DEFAULTS.hudSampling).toBe(false);expect(EXPERIMENTAL_DEFAULTS.menuSampling).toBe(false);
 document.querySelector<HTMLButtonElement>('[data-experimental]')!.click();ui!.click();
 const choice=document.querySelector<HTMLSelectElement>('#exp-uiMode')!;choice.value='integer';choice.dispatchEvent(new Event('change'));
 const snap=document.querySelector<HTMLInputElement>('#exp-uiSnap')!;snap.value='2';snap.dispatchEvent(new Event('input'));
 expect(states.at(-1)).toMatchObject({enabled:true,hudSampling:true,menuSampling:true,menuMode:'integer',menuSnap:2});
 const link=document.querySelector<HTMLAnchorElement>('#exp-menu-preview')!;
 expect(parseMenuSampling(new URL(link.href).search)).toMatchObject({enabled:true,mode:'integer',snap:2});
 document.querySelector<HTMLInputElement>('#exp-enabled')!.click();expect(parseMenuSampling(new URL(link.href).search)).toBeNull();
 document.querySelector<HTMLButtonElement>('#exp-reset')!.click();expect(ui!.checked).toBe(false);expect(applies!.value).toBe('both');expect(choice.value).toBe('nearest');expect(snap.value).toBe('1');
});
