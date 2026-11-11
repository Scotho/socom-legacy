// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {EXPERIMENTAL_DEFAULTS,EXPERIMENTAL_GROUPS,MODS_PACK_SETTINGS,mountExperimentalGraphics} from '../src/experimentalGraphics';
import {MATCH_EXPERIMENTAL_OFF} from '../src/picture';
import {mountDevPanel,type DevPanel,type DevPanelDeps} from '../src/devPanel';
import {devOverlayDrawn} from '../src/devTools';
import {Ui} from '../src/ui';

/**
 * TRS-CONDENSE (the owner, 2026-11-01: "seriously condense the settings in test room ... Put it behind tooltips ...
 * reorganize them into logical categories"; product track, a browser adaptation that changes nothing the game does):
 * the test room's Experimental panel in a few collapsed categories with short labels, each group's explanation behind
 * an info button (a `title` for the mouse, a toggle-tip that focus or a tap reveals), the static sections' help lines
 * the same way, and the developer panel's own drawings shown only while that panel is open. The HD keys, defaults and
 * ids are pinned beside it (ac's constraint for HD (GoE SouL) in every match).
 */
const here=dirname(fileURLToPath(import.meta.url));
const html=readFileSync(resolve(here,'../setup/index.html'),'utf8');
const mount=():void=>{
  document.body.innerHTML=new DOMParser().parseFromString(html,'text/html').body.innerHTML;document.body.className='test-room';
  const ui=new Ui(),preview=ui.onLook();mountExperimentalGraphics(document,()=>{},()=>preview('modern'));
};
const exp=():HTMLElement=>document.getElementById('experimental-settings')!;
const choose=():void=>document.querySelector<HTMLButtonElement>('[data-experimental]')!.click();

/** Whether an element would be drawn: nothing above it hidden, and no closed `<details>` between (its summary aside). */
function shown(el:Element):boolean{
  for(let e:Element|null=el;e;e=e.parentElement){
    if((e as HTMLElement).hidden)return false;
    const up=e.parentElement;
    if(up instanceof HTMLDetailsElement&&!up.open&&e.tagName!=='SUMMARY')return false;
  }
  return true;
}
/** The characters a reader sees under `root`: shown text nodes, a select's chosen option only. */
function visibleText(root:Element):number{
  let n=0;const walk=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  for(let t=walk.nextNode();t;t=walk.nextNode()){
    const p=t.parentElement!;if(p.closest('select,style,script')||!shown(p))continue;
    n+=(t.textContent??'').replace(/\s+/g,' ').trim().length;
  }
  for(const s of root.querySelectorAll('select'))if(shown(s))n+=(s.selectedOptions[0]?.textContent??'').length;
  return n;
}
/** The controls a reader sees: inputs (not hidden or file), selects, buttons, link buttons, disclosures. */
function visibleControls(root:Element):number{
  return [...root.querySelectorAll('input,select,button,a.s2u-button,summary')].filter(e=>!(e instanceof HTMLInputElement&&(e.type==='hidden'||e.type==='file'))&&shown(e)).length;
}

describe('the measures, before and after (printed for the report)',()=>{
  beforeEach(mount);
  it('prints the visible controls and characters of the Experimental panel and of the whole settings panel',()=>{
    choose();
    const panel=document.getElementById('panel-body')!;
    console.log(`TRS-MEASURE experimental: ${visibleControls(exp())} controls, ${visibleText(exp())} chars; panel: ${visibleControls(panel)} controls, ${visibleText(panel)} chars`);
    for(const d of exp().querySelectorAll('details'))d.open=true;
    console.log(`TRS-MEASURE experimental every category open: ${visibleControls(exp())} controls, ${visibleText(exp())} chars`);
  });
});

describe('the Experimental panel: categories, short labels, tooltips',()=>{
  beforeEach(mount);
  const CATS=[['exp-cat-resolution','Resolution'],['exp-cat-detail','Detail'],['exp-cat-colour','Light & colour'],['exp-cat-ui','HUD & menus']];

  it('the categories (four since ML-6 removed Textures & HD), in order, each a disclosure closed by default, even after Experimental is chosen',()=>{
    choose();
    // GX-28's review: the product-track label, once, on the panel's own summary (the rows' "(adaptation)" suffixes folded into it)
    expect(exp().querySelector(':scope > summary')!.textContent).toBe('Experimental (adaptation)');
    const cats=[...exp().querySelectorAll<HTMLDetailsElement>('details.exp-cat')];
    expect(cats.map(c=>[c.id,c.querySelector(':scope > summary')!.textContent])).toEqual(CATS);
    for(const c of cats)expect(c.open,c.id).toBe(false);
  });

  it('every group but the master switch and Reset sits in exactly one category; no HD or texture-pack control (ML-6: MODS\'s)',()=>{
    const homes=EXPERIMENTAL_GROUPS.map(g=>[g.id,document.getElementById('exp-group-'+g.id)?.closest('details.exp-cat')?.id??null]);
    for(const [id,cat] of homes)expect(cat===null,String(id)).toBe(id==='master'||id==='about');
    for(const id of ['exp-hdPack','exp-hd-pack-status','exp-pack-import','exp-pack-file','exp-pack-import-status','exp-texturePack','exp-cat-textures'])
      expect(document.getElementById(id),id).toBeNull();
  });

  it('short labels: no switch, slider or summary over 24 characters',()=>{
    for(const s of exp().querySelectorAll('label > span, details.exp-cat > summary'))expect((s.textContent??'').length,s.textContent!).toBeLessThanOrEqual(24);
  });

  it('no explanation is on the page as text: each group with one has an info button whose title and hidden tip hold it',()=>{
    choose();
    for(const d of exp().querySelectorAll('details'))d.open=true;
    for(const p of exp().querySelectorAll<HTMLElement>('p.s2u-field__note:not([id])'))expect(shown(p),p.textContent!).toBe(false);
    for(const g of EXPERIMENTAL_GROUPS){
      const text=g.controls.filter(c=>c.kind==='note'&&c.id===undefined).map(c=>(c as {text:string}).text).join(' ');
      if(!text)continue;
      const button=document.getElementById('exp-info-'+g.id) as HTMLButtonElement|null;
      expect(button,g.id).not.toBeNull();
      expect(button!.type).toBe('button');
      expect(button!.getAttribute('title'),g.id).toBe(text);
      expect(button!.getAttribute('aria-label'),g.id).toMatch(/^About /);
      const tip=document.getElementById(button!.getAttribute('aria-controls')!)!;
      expect(tip.textContent,g.id).toBe(text);
      expect(tip.hidden,g.id).toBe(true);
    }
  });

  it('no explanation of before was dropped: each sentence the review found cut is in the tip of its row',()=>{
    const tip=(id:string)=>document.getElementById('exp-tip-'+id)!.textContent!;
    // B206 ML-7: the HUD's and the menus' rows are one, UI sampling; the four filtering rows one, Texture filtering.
    expect(tip('ui')).toContain('does not affect the settings panel. At 1920 x 1080 physical pixels, all integer steps fit at 2x.');
    expect(tip('detailAdjust')).toContain('Distance only changes how far the layers reach.');
    expect(tip('master')).toContain('Applies globally to maps and player models.');
    expect(tip('textureFiltering')).toContain('Applied per eligible texture when enabled.');
    expect(tip('ui')).toContain('Visible in Play with the HUD/reticle shown (Explore draws neither).');
  });

  it('names no walking: Explore has none (e2e/ui.spec.ts reads every title and aria-label on the page)',()=>{
    const panel=exp();
    const text=panel.textContent+[...panel.querySelectorAll('[title],[aria-label]')]
      .map(e=>`${e.getAttribute('title')} ${e.getAttribute('aria-label')}`).join(' ');
    expect(text).not.toMatch(/\b(walk\w*|stance|crouch\w*|prone)\b/i);
    choose();
    for(const g of ['ui'])EXPERIMENTAL_GROUPS.find(x=>x.id===g)!.status!({...EXPERIMENTAL_DEFAULTS,enabled:true,hudSampling:true,menuSampling:true},{selected:true,check:()=>true,num:()=>1,choice:()=>''},panel);
    expect(panel.textContent).not.toMatch(/\b(walk\w*|stance|crouch\w*|prone)\b/i);
  });

  it('far fewer controls and characters once Experimental is chosen (the categories closed)',()=>{
    choose();
    expect(visibleControls(exp())).toBeLessThanOrEqual(10);
    expect(visibleText(exp())).toBeLessThanOrEqual(220);
  });
});

describe('the tooltip: a title for the mouse, focus (a pad or the keyboard) or a tap for the rest',()=>{
  beforeEach(mount);
  it('focus shows the tip and blur hides it; a click or tap pins it until a second one or Escape',()=>{
    choose();
    const b=document.getElementById('exp-info-bloom') as HTMLButtonElement;
    const tip=document.getElementById(b.getAttribute('aria-controls')!)!;
    b.dispatchEvent(new FocusEvent('focusin',{bubbles:true}));expect(tip.hidden).toBe(false);expect(b.getAttribute('aria-expanded')).toBe('true');
    b.dispatchEvent(new FocusEvent('focusout',{bubbles:true}));expect(tip.hidden).toBe(true);expect(b.getAttribute('aria-expanded')).toBe('false');
    b.click();expect(tip.hidden).toBe(false);
    b.dispatchEvent(new FocusEvent('focusout',{bubbles:true}));expect(tip.hidden).toBe(false);
    b.click();expect(tip.hidden).toBe(true);
    b.click();expect(tip.hidden).toBe(false);
    b.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));expect(tip.hidden).toBe(true);
  });
  it('a release build (DEV false) attaches no Escape key (OT.R29): a pinned tip stays pinned until a second click or tap',()=>{
    vi.stubEnv('DEV',false);
    try{
      mount();choose();                                  // wired afresh with DEV false: a new panel, a new root
      const b=document.getElementById('exp-info-bloom') as HTMLButtonElement;
      const tip=document.getElementById(b.getAttribute('aria-controls')!)!;
      b.click();expect(tip.hidden).toBe(false);
      b.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));expect(tip.hidden).toBe(false);
      expect(b.getAttribute('aria-expanded')).toBe('true');
      b.click();expect(tip.hidden).toBe(true);expect(b.getAttribute('aria-expanded')).toBe('false');
    }finally{vi.unstubAllEnvs();}
  });
  it('the static sections\' help lines are tips too, kept by id and still describing their controls',()=>{
    for(const id of ['recom-note','rules-note','view-note','look-note','online-note','mp-name-note']){
      const note=document.getElementById(id)!;
      expect(note.hidden,id).toBe(true);
      const b=document.querySelector<HTMLButtonElement>(`button.panel-info[aria-controls="${id}"]`);
      expect(b,id).not.toBeNull();
      expect(b!.getAttribute('title'),id).toBe(note.textContent);
      b!.click();expect(note.hidden,id).toBe(false);
    }
  });
});

describe('the HD keys stay with the HD picture gone (ac\'s constraint; B206 ML-6, ML.R14)',()=>{
  it('the match\'s settings off, the hdPack default off, the pack keys carried off by the panel, the colour and detail switches by their ids',()=>{
    expect(MATCH_EXPERIMENTAL_OFF).toEqual({...EXPERIMENTAL_DEFAULTS,enabled:false});
    expect(EXPERIMENTAL_DEFAULTS.hdPack).toBe(false);
    expect(MODS_PACK_SETTINGS).toEqual({localTexturePack:null,hdPack:false});
    for(const id of ['grade','detailAdjust'])expect(EXPERIMENTAL_GROUPS.find(g=>g.id===id)!.switch,id).toBe(id);
  });
});

describe('the developer panel\'s own drawings show only while the panel is open (the owner, 2026-11-01)',()=>{
  let panel:DevPanel|null=null;
  afterEach(()=>{panel?.dispose();panel=null;document.body.innerHTML='';});
  it('devOverlayDrawn: a switched-on drawing is drawn only while the panel is open',()=>{
    expect(devOverlayDrawn(true,true)).toBe(true);
    expect(devOverlayDrawn(false,true)).toBe(false);
    expect(devOverlayDrawn(true,false)).toBe(false);
    expect(devOverlayDrawn(false,false)).toBe(false);
  });
  it('the panel tells the page when it opens and closes, so the page draws or hides the traces and markers',()=>{
    const told:boolean[]=[];
    const deps:DevPanelDeps={doc:document,access:{toggle:true},playing:()=>true,mode:()=>'walk',setMode:()=>true,spawns:()=>null,team:()=>null,
      teleport:()=>true,markers:()=>true,setMarkers:()=>{},overlaysShown:(open)=>{told.push(open);}};
    panel=mountDevPanel(deps);
    panel.setOpen(true);panel.setOpen(false);
    expect(told).toEqual([true,false]);
  });
  it('main draws the traces and the markers through that gate',()=>{
    const main=readFileSync(resolve(here,'../src/main.ts'),'utf8');
    expect(main).toMatch(/overlaysShown: \(\) => \{ drawDevMarkers\(\); drawDevTraces\(\); \}/);
    expect(main).toMatch(/devOverlayDrawn\(devPanel\?\.isOpen\(\) \?\? false, devMarkersOn\)/);
  });
});
