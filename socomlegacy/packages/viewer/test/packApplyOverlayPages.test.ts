// @vitest-environment jsdom
import {afterEach,describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {matchHudUp,PACK_APPLY_OVER_LOADING_Z,PackApplyOverlay,pagePlayLive} from '../src/packApplyOverlay';

/**
 * B206 ML-9's browser pass, F1 and F2 (plan 2026-11-06-mods-loader; product track, ML.R2: the overlay is a browser
 * adaptation, `PACK_APPLY_OVERLAY_ADAPTATION`). F1: the test room's and the Forge's overlay pick the corner strip in live
 * play as the match's does (`./matchMount` passes its `packLive`); before, both built it with no live test and drew the
 * full-screen panel over the play. F2: while the match's loading screen (`#original-loading`, `styles.css` z-index 19000)
 * is up, the overlay is the strip drawn above it, the loading screen's own art left visible. WM-PACKS-CHIP: the strip
 * and the full-screen panel are one corner chip now (`is-chip`), drawn above the loading screen while it is up.
 */
const src=resolve(dirname(fileURLToPath(import.meta.url)),'../src');
const read=(p:string):string=>readFileSync(resolve(src,p),'utf8');
afterEach(()=>{document.body.replaceChildren();});
const progress={name:'P',applied:1,total:2,done:false,refused:null};

describe('F1: live play on the test room and the Forge picks the strip',()=>{
  it('pagePlayLive: Play on, walking and alive is live play; anything else is not',()=>{
    expect(pagePlayLive(true,true,false)).toBe(true);
    expect(pagePlayLive(false,true,false)).toBe(false);
    expect(pagePlayLive(true,false,false)).toBe(false);
    expect(pagePlayLive(true,true,true)).toBe(false);
  });
  it('the test room builds its overlay with a live test (pagePlayLive) and refreshes it every frame',()=>{
    const main=read('main.ts');
    // WM-PACKS-CHIP: and says its HUD draws the chip in live play (the last argument).
    expect(main).toMatch(/new PackApplyOverlay\(document, \(\) => pagePlayLive\(playOn, walk\.mode\(\) === 'walk', walk\.isDead\(\)\), undefined, undefined, undefined, true\)/);
    expect(main).toMatch(/packOverlay\?\.refresh\(\);/);
  });
  it('the Forge builds its overlay with a live test (its Play, or a match running) and refreshes it every frame',()=>{
    const forge=read('forge/page.ts');
    expect(forge).toMatch(/new PackApplyOverlay\(doc, \(\) => pagePlayLive\(playing \|\| match !== null, true, false\)\)/);
    expect(forge).toMatch(/packOverlay\.refresh\(\);/);
  });
});

describe('WM-PACKS-CHIP review F2: in any shown match whose HUD is up, the HUD draws the chip and the page none',()=>{
  const staged={name:'SOCOM II HD',applied:1326,total:3900,done:false,refused:null};
  it('matchHudUp follows Hud.render\'s gate: the HUD on (walking and spawned), or a spectator\'s or dead seat\'s view',()=>{
    expect(matchHudUp(true,false)).toBe(true);    // alive, or dead with the HUD left on, or held by `blocked`
    expect(matchHudUp(false,true)).toBe(true);    // spectating / a dead seat watching a teammate
    expect(matchHudUp(true,true)).toBe(true);
    expect(matchHudUp(false,false)).toBe(false);  // before the seat's spawn: no HUD
  });
  it('dead or spectating in a shown match: the HUD feed returns the chip and the DOM chip is hidden',()=>{
    for(const [on,spectating] of [[true,false],[false,true]] as const){
      const hudUp=matchHudUp(on,spectating);
      const o=new PackApplyOverlay(document,()=>hudUp,undefined,undefined,()=>true,true);
      o.update(staged,'hd');
      expect(o.hudChip(),`on ${on} spectating ${spectating}`).toEqual({progress:staged,kind:'hd'});
      expect(document.getElementById('s2u-pack-apply')!.style.display).toBe('none');
      o.dispose();
    }
  });
  it('matchMount builds its overlay on "this match\'s HUD is up" (set where it shows the HUD), not on live play',()=>{
    const mm=read('matchMount.ts');
    expect(mm).toMatch(/new PackApplyOverlay\(canvas\.ownerDocument, \(\) => packHudUp, undefined, undefined, \(\) => canvas\.style\.visibility !== 'hidden', true\)/);
    expect(mm).toMatch(/hud\.setVisible\(walking && spawned\);[^\n]*\n\s*packHudUp = matchHudUp\(walking && spawned, spectating !== null\);/);
    expect(mm).not.toMatch(/const packLive/);
  });
});

describe('F2: over the loading screen, the strip above it',()=>{
  const loading=(hidden:boolean):HTMLElement=>{const l=document.createElement('div');l.id='original-loading';l.hidden=hidden;document.body.append(l);return l;};
  it('sits above the loading screen\'s z-index, read from styles.css',()=>{
    const css=read('styles.css');
    const rule=/#original-loading \{[^}]*z-index: (\d+);/.exec(css);
    expect(rule).not.toBeNull();
    expect(PACK_APPLY_OVER_LOADING_Z).toBeGreaterThan(Number(rule![1]));
    const o=new PackApplyOverlay(document,()=>false);
    o.update(progress);
    expect(document.getElementById('s2u-pack-apply-style')!.textContent).toContain(`.is-over-loading{z-index:${PACK_APPLY_OVER_LOADING_Z}`);
    o.dispose();
  });
  it('while the loading screen is up the overlay is the chip over it; once it hides, the same chip under the page again',()=>{
    const l=loading(false);
    const o=new PackApplyOverlay(document,()=>false);
    o.update(progress);
    const el=document.getElementById('s2u-pack-apply')!;
    expect(el.classList.contains('is-chip')).toBe(true);
    expect(el.classList.contains('is-over-loading')).toBe(true);
    expect(el.classList.contains('is-full')).toBe(false);
    l.hidden=true;o.refresh();
    expect(el.classList.contains('is-over-loading')).toBe(false);
    expect(el.classList.contains('is-chip')).toBe(true);
    expect(el.classList.contains('is-full')).toBe(false);
    o.dispose();
  });
  it('a hidden loading screen changes nothing',()=>{
    loading(true);
    const o=new PackApplyOverlay(document,()=>false);
    o.update(progress);
    const el=document.getElementById('s2u-pack-apply')!;
    expect(el.classList.contains('is-chip')).toBe(true);
    expect(el.classList.contains('is-over-loading')).toBe(false);
    o.dispose();
  });
});
