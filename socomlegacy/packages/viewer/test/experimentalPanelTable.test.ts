// @vitest-environment jsdom
import {beforeEach,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mountExperimentalGraphics,EXPERIMENTAL_DEFAULTS,EXPERIMENTAL_GROUPS,MODS_PACK_SETTINGS,groupKeys,type ExperimentalSettings} from '../src/experimentalGraphics';
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
// The keys added since the snapshot: GX-24's five rows' (B206 ML-7 folded its three world-sampling rows into Texture
// filtering, the keys unchanged); OT.R92's HD pack (HD-6) was a row until B206 ML-6 removed it with the texture-pack
// group -- its key and the pack's (`MODS_PACK_SETTINGS`) are carried at their off values, read by no row.
const gx24 = new Set(['fxaa','resolveFiltering']);
const gx24Keys = ['worldAnisotropy','worldTrilinear','worldLodBias','worldLodBiasValue','fxaa','resolveFiltering','resolveFilter','hdPack'];
// B206 ML-7 (ML.R14): the baseline's controls the collapses replaced, and the collapsed groups' own (each key they read
// is pinned by `testRoomSmaller.test.ts`, mode by mode).
const replaced = new Set(['exp-textureBias','exp-mipBias','exp-mipBias-out','exp-hudSampling','exp-hudMode','exp-hudSharpness','exp-hudSharpness-out',
 'exp-hudSnap','exp-hudSnap-out','exp-menuSampling','exp-menuMode','exp-menuSharpness','exp-menuSharpness-out','exp-menuSnap','exp-menuSnap-out']);
const collapsed = ['exp-textureFiltering','exp-filterMode','exp-filterBias','exp-filterBias-out','exp-uiSampling','exp-uiApplies','exp-uiMode',
 'exp-uiSharpness','exp-uiSharpness-out','exp-uiSnap','exp-uiSnap-out'];
/** A control's kind and state, as the baseline's markup and today's panel both carry it. */
const CONTROLS='input,select,output,button,a';
const shape=(el:Element):string=>JSON.stringify({tag:el.tagName,type:el.getAttribute('type'),min:el.getAttribute('min'),max:el.getAttribute('max'),step:el.getAttribute('step'),
 value:el.getAttribute('value'),checked:el.hasAttribute('checked'),disabled:el.hasAttribute('disabled'),out:el.tagName==='OUTPUT'?el.textContent:null,
 options:el instanceof HTMLSelectElement?Array.from(el.options,o=>[o.value,o.hasAttribute('selected')]):null});
const baselineControls=(html:string):Map<string,string>=>{
 const t=document.createElement('template');t.innerHTML=html.replace('[pack]','');
 return new Map(Array.from(t.content.querySelectorAll(CONTROLS),el=>[el.id,shape(el)] as [string,string]).filter(([id])=>id&&!replaced.has(id)));
};
const rowIds=(ids:Set<string>)=>EXPERIMENTAL_GROUPS.filter(g=>ids.has(g.id)).flatMap(g=>g.controls.flatMap(c=>'id' in c&&c.id!==undefined&&c.kind!=='note'?['exp-'+c.id]:[]));
const added=new Set([...rowIds(gx24),...collapsed]);
const panelControls=():Map<string,string>=>new Map(Array.from(document.getElementById('experimental-settings')!.querySelectorAll(CONTROLS),el=>[el.id,shape(el)] as [string,string])
 .filter(([id])=>id&&!document.getElementById(id)!.classList.contains('panel-info')&&!added.has(id)&&!added.has(id.replace(/-out$/,''))));
const withoutPack=(s:ExperimentalSettings)=>{const c:Record<string,unknown>={...s};delete c['localTexturePack'];for(const key of gx24Keys)delete c[key];return c;};

it('every control of before is in the panel by its id, the same kind, range, default and enabled state, off and with the Experimental view on -- but those ML-7 collapsed, which are the collapsed groups\' own',()=>{
 const drawn=new Set(Array.from(document.getElementById('experimental-settings')!.querySelectorAll(CONTROLS),el=>el.id));
 for(const id of collapsed)expect(drawn.has(id),id).toBe(true);
 for(const id of replaced)expect(drawn.has(id),id).toBe(false);
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
it('every row has an id, a label and controls; every settings key but the two pack keys (ML-6) is read by exactly one row; a switched row turns to its OFF value',()=>{
 const ids=EXPERIMENTAL_GROUPS.map(g=>g.id);expect(new Set(ids).size).toBe(ids.length);
 expect(ids).toEqual(['master','sharpen','resolution','bloom','textureFiltering','fxaa','resolveFiltering','detailAdjust','characterLight','grade','whiteBalance','toneBalance','bloomTint','highlightRollOff','ui','about']);
 for(const g of EXPERIMENTAL_GROUPS){expect(g.label.length,g.id).toBeGreaterThan(0);expect(g.controls.length,g.id).toBeGreaterThan(0);}
 const keys=EXPERIMENTAL_GROUPS.flatMap(groupKeys);expect(new Set(keys).size).toBe(keys.length);expect([...keys,...Object.keys(MODS_PACK_SETTINGS)].sort()).toEqual(Object.keys(EXPERIMENTAL_DEFAULTS).sort());
 document.querySelector<HTMLButtonElement>('[data-experimental]')!.click();
 for(const g of EXPERIMENTAL_GROUPS){
  if(!g.switch||g.id==='master')continue;
  const el=document.getElementById('exp-'+g.switch) as HTMLInputElement|HTMLSelectElement;
  if(el instanceof HTMLSelectElement){el.value='';el.dispatchEvent(new Event('change'));}else if(el.checked)el.click();else el.dispatchEvent(new Event('change'));
  expect(states.at(-1),g.id).toMatchObject(g.off);
 }
 const master=document.getElementById('exp-enabled') as HTMLInputElement;master.click();expect(states.at(-1)).toMatchObject(EXPERIMENTAL_GROUPS[0]!.off);
});
