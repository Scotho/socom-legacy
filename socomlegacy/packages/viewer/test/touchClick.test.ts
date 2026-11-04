// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { swallowNextClick, TOUCH_CLICK_SWALLOW_MS_ADAPTATION } from '../src/touchClick';
import { bindTouchAction } from '../src/mobileLayoutEditor';
import { mountOverlay, type Overlay } from '../src/modern/overlay/index';
import { overlayAdapters } from '../src/console/adapters';
import { fakeLauncher, fakeSession } from './modern/lobbies/fixtures';

/**
 * Issue #307: a phantom Triangle -- the console's sign-in opened with no press. A touch release that acts at once
 * (`pointerup`) and takes its target away, or covers it, is followed by the browser's compatibility click at the same
 * spot, which then lands on what is under it now. Two places did so: the touch layout editor's Save (and Cancel) remove
 * the editor at the touch release -- the click then fell on the console's header, its account control top right, which
 * opens the sign-in when signed out -- and the touch Menu button opens the overlay over itself -- the click then fell in the
 * console at the button's spot. The fix swallows that one click (`swallowNextClick`). A browser adaptation (OT.R28).
 */
const touchUp = (el: Element, x = 0, y = 0): void => {
  const e = new Event('pointerup', { bubbles: true, cancelable: true });
  Object.defineProperties(e, { pointerType: { value: 'touch' }, clientX: { value: x }, clientY: { value: y }, pointerId: { value: 1 } });
  el.dispatchEvent(e);
};

describe('swallowNextClick: the one compatibility click after a touch release that acted (issue #307)', () => {
  beforeEach(() => { vi.useFakeTimers(); document.body.innerHTML = '<button id="under">under</button>'; });
  afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

  it('the next click within the window reaches nothing; the one after it does', () => {
    const under = vi.fn();
    document.getElementById('under')!.addEventListener('click', under);
    swallowNextClick(window);
    document.getElementById('under')!.click();
    expect(under).not.toHaveBeenCalled();
    document.getElementById('under')!.click();
    expect(under).toHaveBeenCalledTimes(1);
  });

  it('the review\'s F2: a new tap (its pointerdown) disarms the swallow -- the release sent no click, the next tap\'s click acts', () => {
    const under = vi.fn();
    const button = document.getElementById('under')!;
    button.addEventListener('click', under);
    swallowNextClick(window);
    button.dispatchEvent(new Event('pointerdown', { bubbles: true }));  // the player's next tap begins; no click came
    button.click();
    expect(under).toHaveBeenCalledTimes(1);
  });

  it('past the window, a click is a click again (no click came: nothing is held over)', () => {
    const under = vi.fn();
    document.getElementById('under')!.addEventListener('click', under);
    swallowNextClick(window);
    vi.advanceTimersByTime(TOUCH_CLICK_SWALLOW_MS_ADAPTATION + 1);
    document.getElementById('under')!.click();
    expect(under).toHaveBeenCalledTimes(1);
  });
});

describe('the touch layout editor\'s toolbar: Save at the touch release, and its click swallowed (issue #307)', () => {
  beforeEach(() => { vi.useFakeTimers(); document.body.innerHTML = '<div id="console"><button id="account">Sign in</button></div><div id="editor"><button id="layout-save">Save</button></div>'; });
  afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

  it('a touch release on Save runs it once; the editor gone, the compatibility click does not reach the console under it', () => {
    let alive = true;
    const save = document.getElementById('layout-save')!;
    const run = vi.fn(() => { alive = false; document.getElementById('editor')!.remove(); });
    bindTouchAction(save, run, () => alive, window);
    const signIn = vi.fn();
    document.getElementById('account')!.addEventListener('click', signIn);
    touchUp(save);
    expect(run).toHaveBeenCalledTimes(1);
    document.getElementById('account')!.click();                    // the browser's click, now landing on the console
    expect(signIn).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('a mouse or keyboard click still runs it (native click activation), and nothing is swallowed', () => {
    let alive = true;
    const save = document.getElementById('layout-save')!;
    const run = vi.fn(() => { alive = false; });
    bindTouchAction(save, run, () => alive, window);
    const signIn = vi.fn();
    document.getElementById('account')!.addEventListener('click', signIn);
    save.click();
    expect(run).toHaveBeenCalledTimes(1);
    document.getElementById('account')!.click();
    expect(signIn).toHaveBeenCalledTimes(1);
  });
});

describe('the editor swallows on the console\'s window, not its own (the review\'s F3)', () => {
  it('its toolbar binds with the document\'s own window (the console\'s), since the editor\'s frame is removed by the run', () => {
    const src = readFileSync(resolve(fileURLToPath(import.meta.url), '../../src/mobileLayoutEditor.ts'), 'utf-8');
    expect(src).toMatch(/bindTouchAction\(d\.getElementById\(id\)!, run, \(\) => alive, doc\.defaultView\)/);
  });
});

describe('the touch Menu button: the overlay opened at the touch release takes no click at the button\'s spot (issue #307)', () => {
  let overlay: Overlay | null = null;
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503, headers: { 'Content-Type': 'application/json' } })));
    vi.stubGlobal('AudioContext', vi.fn());
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('coarse'), media: q, addEventListener: () => {}, removeEventListener: () => {} }));
    document.body.innerHTML = '<canvas id="front-end"></canvas>';
  });
  afterEach(() => { overlay?.dispose(); overlay = null; vi.unstubAllGlobals(); vi.restoreAllMocks(); document.body.innerHTML = ''; });

  it('opened by a touch on Menu, the click that follows does not open the console\'s sign-in under that spot', () => {
    overlay = mountOverlay(document, {
      nav: { getGamepads: () => [] }, session: fakeSession('signed-out'), state: fakeLauncher('in-game'),
      adapters: (d, r) => overlayAdapters(d, window, r), frame: () => 0, cancelFrame: () => {}, motion: false,
    });
    const menu = document.querySelector<HTMLButtonElement>('.mu-touch-menu')!;
    touchUp(menu);
    expect(overlay.isOpen()).toBe(true);
    const inner = overlay.el!.contentDocument!;
    // LP.R12: the header's account control is the account menu's summary (right-aligned), signed out "Profile options".
    const account = inner.querySelector<HTMLElement>('.cx-player[data-act="accountmenu"]');
    expect(account, 'the console\'s account control, signed out').not.toBeNull();
    account!.click();                                               // the browser's click, landing in the console
    expect(inner.querySelector('#overlay [data-key="signin"]')).toBeNull();
    expect(overlay.console()!.ctl.S.accountOpen).toBe(false);       // nor the account menu under that spot
  });
});
