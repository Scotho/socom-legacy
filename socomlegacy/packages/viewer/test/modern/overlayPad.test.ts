// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountOverlay, type Overlay } from '../../src/modern/overlay/index';
import { CATS } from '../../src/console/state';
import type { PadLike } from '../../src/gamepad';
import { fakeLauncher, fakeSession, settle } from './lobbies/fixtures';
import { onOverlayFrame } from './overlayFrame';

/**
 * LU-4b item 9 (OV-2 left the overlay's pad walk to LU-4b; MU.R18, MU.R23 (4)) as OVERLAY-CONSOLE has it (CX.R13,
 * OT.R60): the overlay's own document is the console in its overlay mode, driven by the console's own grammar over the
 * real pad on the overlay's frame -- the D-pad and Cross over the crossbar's lists and the screens, L1 / R1 between the
 * categories, Triangle the account, Circle back one level and, at the top, back to the game. The cases that walked the
 * retired shell's tabs and sections walk the console's crossbar and screens in their place. No start-only part is there.
 */
const offline = (async () => new Response('{}', { status: 503, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
const CROSS = 0, CIRCLE = 1, TRIANGLE = 3, L1 = 4, R1 = 5, DOWN = 13, RIGHT = 15;

interface FakePad extends PadLike { buttons: { pressed: boolean; value: number; touched: boolean }[]; axes: number[] }
const fakePad = (): FakePad => ({
  id: 'Test pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 0,
  axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
} as FakePad);

let overlay: Overlay | null = null;
let pad: FakePad;
beforeEach(() => {
  vi.stubGlobal('fetch', offline);
  document.body.innerHTML = '<canvas id="front-end"></canvas>';
  pad = fakePad();
  localStorage.clear();
});
afterEach(() => { overlay?.dispose(); overlay = null; vi.unstubAllGlobals(); vi.restoreAllMocks(); document.body.innerHTML = ''; localStorage.clear(); });

async function open(state: 'signed-out' | 'signed-in' = 'signed-out') {
  let t = 1000;
  // OT.R60 (e): the transition completes at once here (`motion: false`); its hand-over of the pad is test/modern/overlayMotion.test.ts's.
  overlay = mountOverlay(document, { nav: { getGamepads: () => [pad] }, session: fakeSession(state), state: fakeLauncher('in-game'), frame: () => 0, cancelFrame: () => {}, now: () => t, motion: false })!;
  // OVERLAY-CONSOLE's landing gate: the frame is made at the first open (`./overlayFrame`).
  onOverlayFrame((d) => { (d.defaultView as Window & typeof globalThis).HTMLElement.prototype.scrollIntoView = vi.fn(); });
  overlay.open();
  const inner = document.querySelector('iframe')!.contentDocument!;
  await settle();
  const step = (down: number[] = []): void => {
    t += 16;
    pad.buttons.forEach((b, i) => { b.pressed = down.includes(i); b.value = b.pressed ? 1 : 0; b.touched = b.pressed; });
    overlay!.poll();
  };
  step(); step();
  const S = overlay.console()!.ctl.S;
  return {
    inner, step, S,
    press: (b: number): void => { step(); step([b]); step(); },
    cat: (): string => CATS[S.cat]!.id,
  };
}

describe('the overlay by pad (LU-4b; OVERLAY-CONSOLE: the console\'s grammar)', () => {
  // LR-39 (LR.R32): Home is the page's list, Resume game first (was: Down from the Disc to the Controller, its options).
  it('the D-pad walks the list and Cross acts: Down from Resume game to Server status, Cross opens the Server screen', async () => {
    const o = await open();
    expect(o.S.item[o.S.cat]).toBe(0);
    expect(o.inner.querySelector('#stage .cx-item.is-focused .cx-item__title')!.textContent).toBe('Resume game');
    o.press(DOWN);
    expect(o.S.item[o.S.cat]).toBe(1);
    expect(o.inner.querySelector('#stage .cx-item.is-focused .cx-item__title')!.textContent).toBe('Server status');
    o.press(CROSS);
    expect(o.S.screen).toBe('server');
  });

  it('LR-39 (LR.R32): Cross on Resume game closes the overlay, back to the game', async () => {
    const o = await open();
    expect(overlay!.isOpen()).toBe(true);
    o.press(CROSS);
    expect(overlay!.isOpen()).toBe(false);
  });

  // LR.R3 (the owner, 2026-10-26) supersedes CX.R12's wrap: the rail stops at either end with a bump.
  it('R1 / L1 step the categories, stopping at the ends (LR.R3: no wrap)', async () => {
    const o = await open();
    o.press(R1);
    expect(o.cat()).toBe('online');
    o.press(R1); o.press(R1);
    expect(o.cat()).toBe(CATS.at(-1)!.id);                              // the last, and no wrap to the first
    for (let i = 0; i < CATS.length; i++) o.press(L1);
    expect(o.cat()).toBe(CATS[0]!.id);
    o.press(L1);
    expect(o.cat()).toBe(CATS[0]!.id);                                  // the first, and no wrap to the last
  });

  it('Triangle signed out opens the sign-in; Circle there is the dialog\'s, not the overlay\'s', async () => {
    const o = await open();
    o.press(TRIANGLE);
    expect(o.S.overlay).toBe('signin');
    expect(o.inner.querySelector('#overlay [data-key="signin"]')).not.toBeNull();
    o.press(CIRCLE);
    expect(o.S.overlay).toBeNull();
    expect(overlay!.isOpen()).toBe(true);
  });

  it('Circle: a screen back one level, then to Home, and at the top back to the game (the overlay closes)', async () => {
    const o = await open();
    o.press(DOWN); o.press(CROSS);                                       // LR-39: the Server screen (was: Controller's options)
    expect(o.S.screen).toBe('server');
    o.press(CIRCLE);
    expect(o.S.screen).toBe('home');
    expect(overlay!.isOpen()).toBe(true);
    o.press(CIRCLE);
    expect(overlay!.isOpen()).toBe(false);
  });

  it('review G2 (an Options roller): Right steps the focused roller, the focus staying on it', async () => {
    const o = await open();
    overlay!.console()!.ctl.doAct('opt:appearance');                   // Interface size is Settings › Appearance's (LR-13, LR.R16 (5))
    const rows = o.S.opt;
    const cats = overlay!.console()!.ctl.A.options.categories();
    rows.row = cats[rows.cat]!.rows.findIndex((r) => r.id === 'uiscale');
    const before = overlay!.console()!.ctl.A.options.value('uiscale');
    o.press(RIGHT);
    expect(overlay!.console()!.ctl.A.options.value('uiscale')).toBe(before + 1);
    expect(o.S.opt.row).toBe(cats[rows.cat]!.rows.findIndex((r) => r.id === 'uiscale'));
    expect(o.inner.activeElement?.closest('[data-act="optrow"]')?.classList.contains('is-focused')).toBe(true);   // LR-5: LR-1's row
  });

  it('review 1 (one top level): on any category of the crossbar, Circle goes back to the game', async () => {
    const o = await open();
    o.press(R1); o.press(R1);
    expect(o.cat()).toBe('experiments');                                // LR.R2: Replays is Profile's (LP.R2)
    o.press(CIRCLE);
    expect(overlay!.isOpen()).toBe(false);
  });
});
