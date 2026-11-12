// @vitest-environment jsdom
import {afterEach,describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {PACK_APPLY_OVER_LOADING_Z,PackApplyOverlay,pagePlayLive} from '../src/packApplyOverlay';

/**
 * B206 ML-9's browser pass, F1 and F2 (plan 2026-11-06-mods-loader; product track, ML.R2: the overlay is a browser
 * adaptation, `PACK_APPLY_OVERLAY_ADAPTATION`). F1: the test room's and the Forge's overlay pick the corner strip in live
 * play as the match's does (`./matchMount` passes its `packLive`); before, both built it with no live test and drew the
 * full-screen panel over the play. F2: while the match's loading screen (`#original-loading`, `styles.css` z-index 19000)
 * is up, the overlay is the strip drawn above it, the loading screen's own art left visible.
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
    expect(main).toMatch(/new PackApplyOverlay\(document, \(\) => pagePlayLive\(playOn, walk\.mode\(\) === 'walk', walk\.isDead\(\)\)\)/);
    expect(main).toMatch(/packOverlay\?\.refresh\(\);/);
  });
  it('the Forge builds its overlay with a live test (its Play, or a match running) and refreshes it every frame',()=>{
    const forge=read('forge/page.ts');
    expect(forge).toMatch(/new PackApplyOverlay\(doc, \(\) => pagePlayLive\(playing \|\| match !== null, true, false\)\)/);
    expect(forge).toMatch(/packOverlay\.refresh\(\);/);
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
  it('while the loading screen is up the overlay is the strip over it; once it hides, the full panel under the page again',()=>{
    const l=loading(false);
    const o=new PackApplyOverlay(document,()=>false);
    o.update(progress);
    const el=document.getElementById('s2u-pack-apply')!;
    expect(el.classList.contains('is-strip')).toBe(true);
    expect(el.classList.contains('is-over-loading')).toBe(true);
    expect(el.classList.contains('is-full')).toBe(false);
    l.hidden=true;o.refresh();
    expect(el.classList.contains('is-over-loading')).toBe(false);
    expect(el.classList.contains('is-full')).toBe(true);
    o.dispose();
  });
  it('a hidden loading screen changes nothing',()=>{
    loading(true);
    const o=new PackApplyOverlay(document,()=>false);
    o.update(progress);
    const el=document.getElementById('s2u-pack-apply')!;
    expect(el.classList.contains('is-full')).toBe(true);
    expect(el.classList.contains('is-over-loading')).toBe(false);
    o.dispose();
  });
});
