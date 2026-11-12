// @vitest-environment jsdom
import {beforeEach,describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {EXPERIMENTAL_CATEGORIES,EXPERIMENTAL_DEFAULTS,EXPERIMENTAL_GROUPS,mountExperimentalGraphics,type ExperimentalSettings} from '../src/experimentalGraphics';
import {setWorldSamplingMaximum} from '../src/experimentalWorldSampling';
import {Ui} from '../src/ui';

/**
 * B206 ML-7 (plan 2026-11-06-mods-loader, ML.R14 and its section "The test room's settings"; the owner: "Simplify the
 * test room settings too"; product track, ML.R2): the Experimental panel made smaller WITHOUT changing a settings key, a
 * default or the renderer -- one Texture filtering group for the four filtering switches, one UI sampling group for the
 * HUD's and the menus' eight keys, the four optional colour experiments in one More colour disclosure, four categories.
 */
const html=readFileSync(resolve(dirname(fileURLToPath(import.meta.url)),'../setup/index.html'),'utf8');
let states:ExperimentalSettings[]=[];
const el=<T extends HTMLElement>(id:string)=>document.getElementById('exp-'+id) as T;
const set=(id:string,value:string)=>{const e=el<HTMLInputElement|HTMLSelectElement>(id);e.value=value;e.dispatchEvent(new Event(e instanceof HTMLSelectElement?'change':'input'));};
const last=()=>states.at(-1)!;
const mount=(max=16)=>{
  document.body.innerHTML=html;document.body.className='test-room';states=[];setWorldSamplingMaximum(max);
  const ui=new Ui(),preview=ui.onLook();mountExperimentalGraphics(document,s=>states.push({...s}),()=>preview('modern'));
  document.querySelector<HTMLButtonElement>('[data-experimental]')!.click();
};

describe('ML-7: the panel\'s controls are the proposal\'s list and no other',()=>{
  beforeEach(()=>mount());
  it('the rows, in their four categories and the More colour disclosure',()=>{
    expect(EXPERIMENTAL_GROUPS.map(g=>g.id)).toEqual(['master','sharpen','resolution','bloom','textureFiltering','fxaa','resolveFiltering','detailAdjust',
      'characterLight','grade','whiteBalance','toneBalance','bloomTint','highlightRollOff','ui','about']);
    expect(EXPERIMENTAL_CATEGORIES.map(c=>[c.id,c.label])).toEqual([['resolution','Resolution'],['detail','Detail'],['colour','Light & colour'],['ui','HUD & menus']]);
    const more=document.getElementById('exp-more-colour') as HTMLDetailsElement;
    expect(more.tagName).toBe('DETAILS');expect(more.open).toBe(false);
    expect(more.closest('#exp-cat-colour')).not.toBeNull();
    expect(more.querySelector(':scope > summary')!.textContent).toBe('More colour');
    for(const id of ['whiteBalance','toneBalance','bloomTint','highlightRollOff'])expect(el(`group-${id}`).closest('#exp-more-colour'),id).not.toBeNull();
    for(const id of ['grade','bloom','characterLight'])expect(el(`group-${id}`).closest('#exp-more-colour'),id).toBeNull();
  });
  it('the collapsed controls replace the old ones: none of the eleven old switches, selects and sliders is drawn',()=>{
    for(const id of ['worldAnisotropy','worldTrilinear','worldLodBias','worldLodBiasValue','textureBias','mipBias',
      'hudSampling','hudMode','hudSharpness','hudSnap','menuSampling','menuMode','menuSharpness','menuSnap','hud-status','menu-status'])
      expect(document.getElementById('exp-'+id),id).toBeNull();
    for(const id of ['textureFiltering','filterMode','filterBias','world-anisotropy-status','uiSampling','uiApplies','uiMode','uiSharpness','uiSnap','ui-status','menu-preview'])
      expect(document.getElementById('exp-'+id),id).not.toBeNull();
    expect(Array.from(el<HTMLSelectElement>('filterMode').options,o=>[o.value,o.textContent])).toEqual([['original','Original LOD'],['trilinear','Trilinear'],['anisotropic','Anisotropic']]);
    expect(Array.from(el<HTMLSelectElement>('uiApplies').options,o=>[o.value,o.textContent])).toEqual([['hud','HUD'],['menu','Menu preview'],['both','Both']]);
  });
});

describe('ML-7: each collapsed control writes the same keys the old ones wrote (ML.R14)',()=>{
  const filtering=(s:ExperimentalSettings)=>({textureBias:s.textureBias,mipBias:s.mipBias,worldAnisotropy:s.worldAnisotropy,worldTrilinear:s.worldTrilinear,
    worldLodBias:s.worldLodBias,worldLodBiasValue:s.worldLodBiasValue});
  it('Texture filtering, at its defaults, is the owner\'s: the mip bias on at -1, the derivative switches off',()=>{
    mount();
    expect(filtering(last())).toEqual(filtering(EXPERIMENTAL_DEFAULTS));
    expect(el<HTMLInputElement>('textureFiltering').checked).toBe(true);
    expect(el<HTMLSelectElement>('filterMode').value).toBe('original');
    expect(el<HTMLInputElement>('filterBias').value).toBe('-1');
  });
  it.each([
    ['original',-0.5,{textureBias:true,mipBias:-0.5,worldAnisotropy:false,worldTrilinear:false,worldLodBias:false,worldLodBiasValue:0}],
    ['trilinear',-0.5,{textureBias:true,mipBias:-0.5,worldAnisotropy:false,worldTrilinear:true,worldLodBias:true,worldLodBiasValue:-0.5}],
    ['anisotropic',1,{textureBias:true,mipBias:1,worldAnisotropy:true,worldTrilinear:false,worldLodBias:true,worldLodBiasValue:1}],
  ] as const)('Texture filtering: %s at bias %s',(mode,bias,keys)=>{
    mount();set('filterMode',mode);set('filterBias',String(bias));
    expect(filtering(last())).toEqual(keys);
  });
  it('Texture filtering off: every filtering switch off, the bias kept for an A/B',()=>{
    mount();set('filterMode','trilinear');set('filterBias','0.5');el<HTMLInputElement>('textureFiltering').click();
    expect(filtering(last())).toEqual({textureBias:false,mipBias:0.5,worldAnisotropy:false,worldTrilinear:false,worldLodBias:false,worldLodBiasValue:0});
    expect(el<HTMLSelectElement>('filterMode').disabled).toBe(true);expect(el<HTMLInputElement>('filterBias').disabled).toBe(true);
  });
  it('Anisotropic is not offered on a device without it, and its status says so',()=>{
    mount(1);
    const option=Array.from(el<HTMLSelectElement>('filterMode').options).find(o=>o.value==='anisotropic')!;
    expect(option.disabled).toBe(true);
    expect(el('world-anisotropy-status').textContent).toContain('Unsupported');
  });
  const ui=(s:ExperimentalSettings)=>({hudSampling:s.hudSampling,hudMode:s.hudMode,hudSharpness:s.hudSharpness,hudSnap:s.hudSnap,
    menuSampling:s.menuSampling,menuMode:s.menuMode,menuSharpness:s.menuSharpness,menuSnap:s.menuSnap});
  it('UI sampling off by default: both groups off at their defaults',()=>{
    mount();expect(ui(last())).toEqual(ui(EXPERIMENTAL_DEFAULTS));expect(el<HTMLInputElement>('uiSampling').checked).toBe(false);
  });
  it.each([
    ['hud',true,false],['menu',false,true],['both',true,true],
  ] as const)('UI sampling applied to %s: the same mode, sharpness and step to the groups it names',(applies,hud,menu)=>{
    mount();el<HTMLInputElement>('uiSampling').click();set('uiApplies',applies);set('uiMode','integer');set('uiSnap','3');
    expect(ui(last())).toEqual({hudSampling:hud,hudMode:'integer',hudSharpness:0.5,hudSnap:3,menuSampling:menu,menuMode:'integer',menuSharpness:0.5,menuSnap:3});
    expect(el<HTMLInputElement>('uiSnap').disabled).toBe(false);expect(el<HTMLInputElement>('uiSharpness').disabled).toBe(true);
    set('uiMode','sharpen');set('uiSharpness','0.8');
    expect(last()).toMatchObject({hudSharpness:0.8,menuSharpness:0.8});expect(el<HTMLInputElement>('uiSharpness').disabled).toBe(false);
  });
  it('the menu preview link carries the menus\' choice only while they are named',()=>{
    mount();el<HTMLInputElement>('uiSampling').click();set('uiApplies','hud');
    expect(el<HTMLAnchorElement>('menu-preview').href).not.toMatch(/expMenu/);
    set('uiApplies','both');set('uiMode','integer');
    expect(el<HTMLAnchorElement>('menu-preview').href).toMatch(/expMenu=integer/);
  });
  it('Reset all returns every collapsed control to the owner\'s defaults',()=>{
    mount();set('filterMode','anisotropic');set('filterBias','2');el<HTMLInputElement>('uiSampling').click();set('uiApplies','menu');
    document.getElementById('exp-reset')!.click();
    expect(filtering(last())).toEqual(filtering(EXPERIMENTAL_DEFAULTS));expect(ui(last())).toEqual(ui(EXPERIMENTAL_DEFAULTS));
  });
});
