// @vitest-environment jsdom
import {beforeEach,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mountExperimentalGraphics,EXPERIMENTAL_DEFAULTS,EXPERIMENTAL_GROUPS,groupKeys,type ExperimentalSettings} from '../src/experimentalGraphics';
import {Ui} from '../src/ui';
import baseline from './experimentalPanelBaseline.json';

/**
 * GX-21 (GX.R11): the panel's groups are one table. The baseline is the panel as it was built before the table
 * (`baseline.source`), whitespace between tags removed and the pack group -- the one group GX-21 changes -- cut to
 * "[pack]"; today's groups must build the same settings, off and on. TRS-CONDENSE (the owner, 2026-11-01: "condense the
 * settings in test room ... Put it behind tooltips ... reorganize them into logical categories") re-pinned the markup
 * half: the rows are drawn in folded categories with short labels and their explanations behind info buttons, so the
 * markup is no longer the baseline's text; every control of the baseline is still there by its id, with the same kind,
 * range, default and enabled state, off and on.
 */
const here=dirname(fileURLToPath(import.meta.url));
let states:ExperimentalSettings[]=[];
beforeEach(()=>{document.body.innerHTML=readFileSync(resolve(here,'../setup/index.html'),'utf8');document.body.className='test-room';states=[];const ui=new Ui(),preview=ui.onLook();mountExperimentalGraphics(document,s=>states.push({...s}),()=>preview('modern'));});
// The rows added since the snapshot: GX-24's five and OT.R92's HD pack (HD-6).
const gx24 = new Set(['worldAnisotropy','worldTrilinear','worldLodBias','fxaa','resolveFiltering','hdPack']);
const gx24Keys = EXPERIMENTAL_GROUPS.filter(g=>gx24.has(g.id)).flatMap(groupKeys);
/** A control's kind and state, as the baseline's markup and today's panel both carry it. */
const CONTROLS='input,select,output,button,a';
const shape=(el:Element):string=>JSON.stringify({tag:el.tagName,type:el.getAttribute('type'),min:el.getAttribute('min'),max:el.getAttribute('max'),step:el.getAttribute('step'),
 value:el.getAttribute('value'),checked:el.hasAttribute('checked'),disabled:el.hasAttribute('disabled'),out:el.tagName==='OUTPUT'?el.textContent:null,
 options:el instanceof HTMLSelectElement?Array.from(el.options,o=>[o.value,o.hasAttribute('selected')]):null});
const baselineControls=(html:string):Map<string,string>=>{
 const t=document.createElement('template');t.innerHTML=html.replace('[pack]','');
 return new Map(Array.from(t.content.querySelectorAll(CONTROLS),el=>[el.id,shape(el)] as [string,string]).filter(([id])=>id));
};
const rowIds=(ids:Set<string>)=>EXPERIMENTAL_GROUPS.filter(g=>ids.has(g.id)).flatMap(g=>g.controls.flatMap(c=>'id' in c&&c.id!==undefined&&c.kind!=='note'?['exp-'+c.id]:[]));
const added=new Set([...rowIds(gx24),...rowIds(new Set(['pack']))]);
const panelControls=():Map<string,string>=>new Map(Array.from(document.getElementById('experimental-settings')!.querySelectorAll(CONTROLS),el=>[el.id,shape(el)] as [string,string])
 .filter(([id])=>id&&!document.getElementById(id)!.classList.contains('panel-info')&&!added.has(id)&&!added.has(id.replace(/-out$/,''))));
const withoutPack=(s:ExperimentalSettings)=>{const c:Record<string,unknown>={...s};delete c['localTexturePack'];for(const key of gx24Keys)delete c[key];return c;};

it('every control of before is in the panel by its id, the same kind, range, default and enabled state, off and with the Experimental view on',()=>{
 expect(panelControls()).toEqual(baselineControls(baseline.off));
 document.querySelector<HTMLButtonElement>('[data-experimental]')!.click();
 expect(panelControls()).toEqual(baselineControls(baseline.on));
});
it('the settings object has the same keys and values as before, everything off and on (the pack key now carries the choice)',()=>{
 expect(withoutPack(states[0]!)).toEqual(baseline.settingsOff);
 expect(Object.keys(states[0]!).sort()).toEqual([...Object.keys(baseline.settingsOff),'localTexturePack',...gx24Keys].sort());
 document.querySelector<HTMLButtonElement>('[data-experimental]')!.click();
 expect(withoutPack(states.at(-1)!)).toEqual(baseline.settingsOn);
 expect(Object.keys(EXPERIMENTAL_DEFAULTS).sort()).toEqual(Object.keys(states.at(-1)!).sort());
});
it('every row has an id, a label and controls; every settings key is read by exactly one row; a switched row turns to its OFF value',()=>{
 const ids=EXPERIMENTAL_GROUPS.map(g=>g.id);expect(new Set(ids).size).toBe(ids.length);
 expect(ids).toEqual(['master','sharpen','resolution','bloom','pack','hdPack','worldAnisotropy','worldTrilinear','worldLodBias','fxaa','resolveFiltering','textureBias','detailAdjust','characterLight','grade','whiteBalance','toneBalance','bloomTint','highlightRollOff','hud','menu','about']);
 for(const g of EXPERIMENTAL_GROUPS){expect(g.label.length,g.id).toBeGreaterThan(0);expect(g.controls.length,g.id).toBeGreaterThan(0);}
 const keys=EXPERIMENTAL_GROUPS.flatMap(groupKeys);expect(new Set(keys).size).toBe(keys.length);expect([...keys].sort()).toEqual(Object.keys(EXPERIMENTAL_DEFAULTS).sort());
 document.querySelector<HTMLButtonElement>('[data-experimental]')!.click();
 for(const g of EXPERIMENTAL_GROUPS){
  if(!g.switch||g.id==='master')continue;
  const el=document.getElementById('exp-'+g.switch) as HTMLInputElement|HTMLSelectElement;
  if(el instanceof HTMLSelectElement){el.value='';el.dispatchEvent(new Event('change'));}else if(el.checked)el.click();else el.dispatchEvent(new Event('change'));
  expect(states.at(-1),g.id).toMatchObject(g.off);
 }
 const master=document.getElementById('exp-enabled') as HTMLInputElement;master.click();expect(states.at(-1)).toMatchObject(EXPERIMENTAL_GROUPS[0]!.off);
});
