// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StartupNavigation } from '../../src/startupNavigation';
import { PAD_LAYER_ROUTES_ADAPTATION, padLayers } from '../../src/modern/padLayers';
import { fakePad, PAD } from './padRig';

/** The fake pad's buttons as the test drives them: `PadLike`'s are read-only (the page only reads them). */
type DrivenButton = { pressed: boolean; value: number };

/**
 * MU2-8 (the modern UI polish plan, row MU2-8; CX-11, MU2-6's stop (a)): Square resets the focused row to its default, as
 * the console's Options Square does (`src/console/grammar.ts`: a row with values and a default, not locked, is reset to
 * it). The pad's one owner holds a reset chain (`padLayers` `addReset` / `reset`, the latest link first); the walker's
 * Square on the page layer calls it with the focused control; the on-screen keyboard (whose Square is its Backspace) and
 * a modal dialog never see it. (Settings' link -- the focused row back to its default -- went with the modern Settings
 * section, CX-25: the console's Options Square resets a row, `test/console/grammar.test.ts`.) (The loadout editor's link -- Square on a slot stores the
 * record, as the ARMORY's Square does -- went with the modern section to the console's Armory screens, CX-LOADOUTS:
 * `test/console/loadouts.test.ts`.) CX-26: the keyboard's case went with the retired modern on-screen keyboard
 * (`osk.ts`), named in CX-26's commit and the console plan's Log; the dialog's is held over its markup alone (the retired
 * `dialogFocus` trap it set up is not what keeps Square from it). CX-27: the keyboard's layer and its route are retired
 * too (no live markup draws an on-screen keyboard `padLayers` reads), so the route case's keyboard half is not carried.
 * A browser adaptation (MU.R1).
 */

beforeEach(() => {
  document.body.innerHTML = '';
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; });

/** The walker over `page` with a fake pad: `hit(b)` one press and release. */
function walker(page: HTMLElement) {
  const pad = fakePad();
  const nav = new StartupNavigation(page, () => false);
  let now = 0;
  const frame = (b: number[] = []): void => { (pad.buttons as DrivenButton[]).forEach((x, i) => { x.pressed = b.includes(i); x.value = x.pressed ? 1 : 0; }); nav.frame(pad, now += 500, false); };
  const hit = (b: number): void => { frame(); frame([b]); frame(); };
  frame();
  return { hit, frame };
}

describe('the reset chain (padLayers)', () => {
  it('Square is the walker\'s on the page, nobody\'s under a dialog or a capture', () => {
    expect(PAD_LAYER_ROUTES_ADAPTATION.page.reset).toBe('walker');
    expect(PAD_LAYER_ROUTES_ADAPTATION.dialog.reset).toBeUndefined();
    expect(PAD_LAYER_ROUTES_ADAPTATION.capture.reset).toBeUndefined();
  });
  it('runs the links latest first until one answers true, with the control; a released link is not run', () => {
    document.body.innerHTML = '<main><button id="b">B</button></main>';
    const l = padLayers(document);
    const seen: string[] = [];
    const offA = l.addReset((el) => { seen.push(`a:${el.id}`); return true; });
    const offB = l.addReset((el) => { seen.push(`b:${el.id}`); return false; });
    expect(l.reset(document.getElementById('b')!)).toBe(true);
    expect(seen).toEqual(['b:b', 'a:b']);
    offA(); seen.length = 0;
    expect(l.reset(document.getElementById('b')!)).toBe(false);
    expect(seen).toEqual(['b:b']);
    offB();
  });
});

describe('the walker\'s Square', () => {
  it('on the page: the reset chain with the focused control, once per press', () => {
    document.body.innerHTML = '<main><select id="s"><option>A</option><option>B</option></select></main>';
    const link = vi.fn(() => true);
    const off = padLayers(document).addReset(link);
    const { hit, frame } = walker(document.querySelector('main')!);
    document.getElementById('s')!.focus();
    hit(PAD.SQUARE);
    expect(link).toHaveBeenCalledOnce();
    expect(link).toHaveBeenCalledWith(document.getElementById('s'));
    frame([PAD.SQUARE]); frame([PAD.SQUARE]);                       // held: no repeat
    expect(link).toHaveBeenCalledTimes(2);
    off();
  });
  it('nothing focused (the page\'s body): no link is asked', () => {
    document.body.innerHTML = '<main><button>One</button></main>';
    const link = vi.fn(() => true);
    const off = padLayers(document).addReset(link);
    const { hit } = walker(document.querySelector('main')!);
    hit(PAD.SQUARE);
    expect(link).not.toHaveBeenCalled();
    off();
  });
  it('a modal dialog never sees Square: the chain is not run with its control focused', () => {
    // CX-26: held over the dialog's markup alone (the layer is `[aria-modal="true"]`'s); its retired focus trap is not needed.
    document.body.innerHTML = '<main><select id="s"><option>A</option></select><div role="dialog" aria-modal="true" id="d"><button id="no">No</button></div></main>';
    const link = vi.fn(() => true);
    const off = padLayers(document).addReset(link);
    const { hit } = walker(document.querySelector('main')!);
    document.getElementById('no')!.focus();
    hit(PAD.SQUARE);
    expect(link).not.toHaveBeenCalled();
    off();
  });
});
