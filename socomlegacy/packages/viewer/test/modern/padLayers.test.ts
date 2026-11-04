// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PadLike } from '../../src/gamepad';
import { StartupNavigation } from '../../src/startupNavigation';
import { PAD_LAYER_ROUTES_ADAPTATION, padLayers } from '../../src/modern/padLayers';

/**
 * LU-4b item 1 (MU.R18; MU.R27 "one input dispatcher per active layer"; dot's LU-1 review F4): one owner of the pad
 * per active layer. `src/modern/padLayers.ts` decides which layer is on top -- a binding capture, the innermost open
 * modal dialog, else the page -- and which reader owns each action there; the walker, START and the launcher each ask
 * it, and a press that opens or closes a layer is spent on that (no reader beneath acts on it until it is let go). CX-26 (the console plan): the cases that drove the retired modern
 * on-screen keyboard (`osk.ts`) or the dialogs' focus model (`dialogFocus`) through the walker are retired with them,
 * named in CX-26's commit and the console plan's Log; the table's own cases and the walker's under a dialog stay (the
 * walker's half of the dialog's Circle among them). CX-27: the keyboard's layer is retired with its route (no live markup
 * draws `[data-osk]` or `.s2u-osk`), so the case of the keyboard over a dialog is not carried; the table's three layers
 * are held here, the keyboard's absence by `deadPlumbing.test.ts` ("CX-27").
 */
const CIRCLE = 1, R1 = 5, DOWN = 13;

function pad() {
  const p = { index: 0, id: 'Pad', connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  return p as typeof p & PadLike;
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; });

describe('the layer on top and who owns what there', () => {
  it('the page by default: the walker walks and backs, the launcher has the tiles, START is START, Triangle the account', () => {
    document.body.innerHTML = '<main><button>One</button></main>';
    const l = padLayers(document);
    expect(l.top()).toEqual({ kind: 'page', root: null });
    expect(l.owner('walk')).toBe('walker');
    expect(l.owner('back')).toBe('walker');
    expect(l.owner('tiles')).toBe('launcher');
    expect(l.owner('start')).toBe('start');
    expect(l.owner('account')).toBe('launcher');
  });
  it('an open modal dialog: the walker walks it, nothing else reads (CX-29: Circle routed to nobody, the dialog\'s own Escape)', () => {
    document.body.innerHTML = '<main><div role="dialog" aria-modal="true" id="d"><button>Yes</button></div><div role="dialog" aria-modal="true" hidden id="h"></div></main>';
    const l = padLayers(document);
    expect(l.top()).toEqual({ kind: 'dialog', root: document.getElementById('d') });
    expect(l.owner('walk')).toBe('walker');
    for (const a of ['back', 'tiles', 'regions', 'start', 'account'] as const) expect(l.owner(a), a).toBeNull();
    document.getElementById('d')!.hidden = true;
    expect(l.top().kind).toBe('page');
  });
  it('a nested dialog is the one on top (the #763 question inside the sign-in panel)', () => {
    document.body.innerHTML = '<div role="dialog" aria-modal="true" id="outer"><div role="alertdialog" aria-modal="true" id="inner"></div></div>';
    expect(padLayers(document).top().root).toBe(document.getElementById('inner'));
  });
  it('the table has three layers: capture, dialog and page (CX-27: the keyboard\'s retired)', () => {
    expect(Object.keys(PAD_LAYER_ROUTES_ADAPTATION).sort()).toEqual(['capture', 'dialog', 'page']);
  });
  it('a binding capture owns the whole pad, whatever is open', () => {
    document.body.innerHTML = '<div role="dialog" aria-modal="true"></div>';
    const l = padLayers(document);
    let on = true;
    const off = l.addCapture(() => on);
    expect(l.top().kind).toBe('capture');
    for (const a of ['walk', 'back', 'tiles', 'regions', 'start', 'account'] as const) expect(l.owner(a), a).toBeNull();
    on = false;
    expect(l.top().kind).toBe('dialog');
    off();
  });
  it('a page root that is itself aria-modal (the overlay\'s box) is the page, not a dialog over it', () => {
    document.body.innerHTML = '<div role="dialog" aria-modal="true" id="overlay"><button>Tab</button></div>';
    const l = padLayers(document);
    const off = l.setRoot(document.getElementById('overlay')!);
    expect(l.top().kind).toBe('page');
    off();
    expect(l.top().kind).toBe('dialog');
  });
  it('a press that changes the layer is claimed until it is let go', () => {
    document.body.innerHTML = '<div role="dialog" aria-modal="true" id="d"></div>';
    const l = padLayers(document);
    l.act(CIRCLE, () => { /* nothing changes */ });
    expect(l.claimed(CIRCLE)).toBe(false);
    l.act(CIRCLE, () => { document.getElementById('d')!.hidden = true; });
    expect(l.claimed(CIRCLE)).toBe(true);
    l.note(new Set([CIRCLE]));
    expect(l.claimed(CIRCLE)).toBe(true);
    l.note(new Set());
    expect(l.claimed(CIRCLE)).toBe(false);
  });
});

/** The setup page's walker (`Startup`'s frame) over `html`'s `main`. */
function rig(html: string, back = vi.fn(() => false)) {
  document.body.innerHTML = html;
  const p = pad();
  let now = 0;
  const nav = new StartupNavigation(document.querySelector('main')!, back);
  const frame = (down: number[] = []): void => {
    p.buttons.forEach((b, i) => { b.pressed = down.includes(i); b.value = b.pressed ? 1 : 0; });
    now += 500;
    nav.frame(p, now, false);
  };
  const press = (b: number): void => { frame(); frame([b]); frame(); };
  return { nav, frame, press, back };
}

describe('one owner per press (dot\'s F4: a press never acts on two layers)', () => {
  it('Circle on a modal dialog is not the walker\'s back (the layer\'s Circle is the keyboard read\'s)', () => {
    // CX-26: the half of the retired case that is the walker's: its back is not run under a dialog. The other half (the
    // retired modern keyboard's read delivering Circle as the dialog's Escape, `dialogFocus`'s cancel) went with them.
    const r = rig('<main><button id="open">Open</button><div role="dialog" aria-modal="true" id="d"><button id="no">No</button></div></main>');
    r.frame();
    document.getElementById('no')!.focus();
    r.press(CIRCLE);
    expect(r.back).not.toHaveBeenCalled();
    expect(document.getElementById('d')!.hidden).toBe(false);
  });
  it('L1 / R1 are inert under a dialog: the walker does not step through it on a bumper', () => {
    const r = rig('<main><button>Behind</button><div role="dialog" aria-modal="true"><button id="a">A</button><button id="b">B</button></div></main>');
    r.frame();
    document.getElementById('a')!.focus();
    r.press(R1);
    expect(document.activeElement!.id).toBe('a');
    r.press(DOWN);
    expect(document.activeElement!.id).toBe('b');                       // the walker still walks it
  });
});
