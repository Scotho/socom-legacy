// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountOverlay, overlayRamp, OVERLAY_TOGGLE_ADAPTATION, type Overlay } from '../../src/modern/overlay/index';
import { CATS } from '../../src/console/state';
import type { PadLike } from '../../src/gamepad';
import { BASE, fakeFetch, fakeLauncher, fakeSession, settle, signedInRoutes } from './lobbies/fixtures';

/**
 * OV-2 of the modern-UI plan (`docs/plans/briefs/modern-ui-live-site-scope.md` 4.2; rulings MU.R23 (4), MU.R24 Q-C,
 * MU.R1): the in-game overlay prototype, `?devmode&overlay` on a development build only. A browser adaptation: the
 * original never reads the standard mapping's button 16 (Home / PS / Guide); the overlay's one behaviour seam is that
 * while it is open the game reads this client's pad as untouched -- the game itself is not paused or altered.
 */
const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '../../src');

/** A fetch that answers every path with an empty failure: the sections draw their offline states. */
const offline = (async () => new Response('{}', { status: 503, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;

interface FakePad extends PadLike { buttons: { pressed: boolean; value: number; touched: boolean }[]; axes: number[] }
function fakePad(): FakePad {
  return {
    id: 'Test pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 0,
    axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
  } as FakePad;
}
const press = (pad: FakePad, i: number, down = true): void => { pad.buttons[i] = { pressed: down, value: down ? 1 : 0, touched: down }; };
const HOME = 16, START = 9, CROSS = 0;

/** The game's read: what `main.ts`'s and `matchMount.ts`'s `padFrame` and the menus' `GamePad` call each frame. */
const gameRead = (nav: { getGamepads?(): ArrayLike<PadLike | null> }): PadLike => nav.getGamepads!()[0]!;
const downIn = (p: PadLike): number[] => p.buttons.map((b, i) => (b.pressed ? i : -1)).filter((i) => i >= 0);

describe('OV-2: the in-game overlay (brief 4.2; MU.R24 Q-C)', () => {
  let pad: FakePad;
  let nav: { getGamepads(): ArrayLike<PadLike | null> };
  let original: () => ArrayLike<PadLike | null>;
  let overlay: Overlay | null = null;
  // OT.R60 (e): the transition completes at once here (`motion: false`); its hand-over of the pad is test/modern/overlayMotion.test.ts's.
  const mount = (): Overlay =>
    mountOverlay(document, { nav, session: fakeSession('signed-out'), state: fakeLauncher('in-game'), frame: () => 0, cancelFrame: () => {}, motion: false });

  beforeEach(() => {
    vi.stubGlobal('fetch', offline);
    document.body.innerHTML = '<canvas id="front-end"></canvas>';
    pad = fakePad();
    original = () => [pad];
    nav = { getGamepads: original };
  });
  afterEach(() => { overlay?.dispose(); overlay = null; vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); document.body.innerHTML = ''; });

  it('names its toggle as an adaptation: the standard mapping\'s button 16, never START (9), and a key that is not Escape', () => {
    expect(OVERLAY_TOGGLE_ADAPTATION.button).toBe(16);
    expect(OVERLAY_TOGGLE_ADAPTATION.button).not.toBe(START);
    expect(OVERLAY_TOGGLE_ADAPTATION.key).not.toBe('Escape');
    expect(OVERLAY_TOGGLE_ADAPTATION.key).not.toBe('Backquote');   // `ui.ts`'s chrome toggle
    expect(OVERLAY_TOGGLE_ADAPTATION.key).not.toBe('F8');          // the playtest room's Mark key (`playtestSession.ts`)
  });

  it('MU2-10 (MU2.R4): mounts in every build with no address word -- which pages take it is the seam\'s (pageEntry.ts)', () => {
    vi.stubEnv('DEV', false);
    overlay = mountOverlay(document, { nav, session: fakeSession('signed-out'), state: fakeLauncher('in-game'), frame: () => 0, cancelFrame: () => {} });
    expect(overlay.isOpen()).toBe(false);
    expect(document.querySelectorAll('iframe.mu-overlay-frame').length).toBe(0);   // closed: inert, made at the first open
    expect(nav.getGamepads).toBe(original);                          // closed: the pad untouched
    overlay.open();
    expect(document.querySelectorAll('iframe.mu-overlay-frame').length).toBe(1);
  });

  it('MU2-10 (OT.R29, CX.R6): its keyboard -- the F9 toggle and the page\'s keys held while open -- is a development build\'s only', () => {
    vi.stubEnv('DEV', false);
    overlay = mount();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: OVERLAY_TOGGLE_ADAPTATION.key, key: OVERLAY_TOGGLE_ADAPTATION.key }));
    expect(overlay.isOpen()).toBe(false);                            // no release keyboard path
    // The listeners sit under a literal `import.meta.env.DEV` (the build folds the block away; `test/build_keyboard.test.ts`).
    const text = readFileSync(resolve(SRC, 'modern/overlay/index.ts'), 'utf8');
    const block = text.slice(text.indexOf('if (import.meta.env.DEV) {'));
    expect(block.length).toBeLessThan(text.length);
    const body = block.slice(0, block.indexOf('\n  }\n') + 4);
    expect(body).toContain("keyboardSite('s2u-kb-chrome-keys')");
    expect(body).toContain("addEventListener('keydown', onPageKey");
    expect(body).toContain("addEventListener('keydown', onInnerKey");
    expect(text.split('\n').filter((l) => /\b(?:win|innerWin)\?\.addEventListener\('keydown'/.test(l)).length).toBe(2);   // the two window listeners, both in the block
  });

  it('opens on button 16 only: START is never read by it and reaches the game untouched', () => {
    overlay = mount()!;
    expect(overlay.isOpen()).toBe(false);
    press(pad, START);
    overlay.poll();
    expect(overlay.isOpen()).toBe(false);
    expect(downIn(gameRead(nav))).toEqual([START]);                 // the game sees its START
    press(pad, START, false);
    for (const b of [CROSS, 1, 2, 3, 8, 12]) { press(pad, b); overlay.poll(); press(pad, b, false); overlay.poll(); }
    expect(overlay.isOpen()).toBe(false);
    press(pad, HOME);
    overlay.poll();
    expect(overlay.isOpen()).toBe(true);
    overlay.poll();                                                  // held: no second toggle
    expect(overlay.isOpen()).toBe(true);
    press(pad, HOME, false); overlay.poll();
    press(pad, START); overlay.poll();                               // START does not close it either
    expect(overlay.isOpen()).toBe(true);
    press(pad, START, false); overlay.poll();
    press(pad, HOME); overlay.poll();
    expect(overlay.isOpen()).toBe(false);
  });

  it('withholds the game\'s pad while open (the pad reads as untouched, still connected) and restores it after', () => {
    overlay = mount()!;
    overlay.open();
    press(pad, CROSS); press(pad, 7); pad.axes = [0.9, -0.8, 0.5, 0.4];
    const seen = gameRead(nav);
    expect(seen.connected).toBe(true);
    expect(seen.id).toBe(pad.id);
    expect(seen.index).toBe(0);
    expect(seen.mapping).toBe('standard');
    expect(downIn(seen)).toEqual([]);
    expect(seen.buttons.every((b) => b.value === 0)).toBe(true);
    expect([...seen.axes]).toEqual([0, 0, 0, 0]);
    press(pad, CROSS, false); press(pad, 7, false); pad.axes = [0, 0, 0, 0];
    overlay.close();
    expect(nav.getGamepads).toBe(original);                          // nothing held at the close: restored at once
    press(pad, CROSS); pad.axes = [0.9, 0, 0, 0];
    expect(downIn(gameRead(nav))).toEqual([CROSS]);
    expect(gameRead(nav).axes[0]).toBe(0.9);
  });

  it('a button held through the close stays withheld until let go (no press leaks into the game); START is not held back', () => {
    overlay = mount()!;
    press(pad, HOME); overlay.poll();
    expect(overlay.isOpen()).toBe(true);
    press(pad, HOME, false); overlay.poll();
    press(pad, CROSS); press(pad, START);
    press(pad, HOME); overlay.poll();                                // closed with Cross, START and Home held
    expect(overlay.isOpen()).toBe(false);
    expect(downIn(gameRead(nav))).toEqual([START]);                  // START the game's at once; Cross and Home held back
    press(pad, CROSS, false); press(pad, HOME, false);
    expect(downIn(gameRead(nav))).toEqual([START]);
    overlay.poll();
    expect(nav.getGamepads).toBe(original);                          // every held button let go: the pad is the game's again
    press(pad, CROSS);
    expect(downIn(gameRead(nav))).toEqual([CROSS, START]);
  });

  // OVERLAY-CONSOLE (CX.R13, OT.R60): the console in its overlay mode, in place of the retired shell's sections.
  it('mounts the console in overlay mode, with nothing start-only inside (no START, no disc chip, no launch screen, no setup DOM)', async () => {
    overlay = mount()!;
    overlay.open();
    await settle();
    const frame = document.querySelectorAll('iframe');
    expect(frame.length).toBe(1);
    const inner = frame[0]!.contentDocument!;
    for (const sel of ['#backdrop', '.cx-app #header', '.cx-app #stage', '.cx-app #legend', '#overlay', '#toast', '#live']) expect(inner.querySelector(sel), sel).not.toBeNull();
    expect(overlay.console()!.ctl.S.mode).toBe('overlay');
    expect(inner.querySelector('#stage .cx-crossbar')).not.toBeNull();
    expect(inner.querySelector('[data-section]')).toBeNull();                  // no shell section left
    const all = [inner, document];
    for (const d of all) {
      expect(d.querySelector('[id^="startup-"], [id^="launcher-"], .startup-disc, [data-launch-bar]')).toBeNull();
      expect(d.querySelector('[data-action="launch"], .mul__launch, .cx-start, .cx-chip, [data-key="launch"]')).toBeNull();
    }
    expect([...inner.querySelectorAll('button')].some((b) => /^\s*start( game)?\s*$/i.test(b.textContent ?? ''))).toBe(false);
    expect(inner.querySelector('[data-overlay-label]')?.textContent).toMatch(/adaptation/i);
  });

  it('captures the keyboard: its key toggles it, Escape does not, and no key reaches the game\'s listeners while it is open', () => {
    overlay = mount()!;
    const game = vi.fn();
    window.addEventListener('keydown', game);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }));
    expect(overlay.isOpen()).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: OVERLAY_TOGGLE_ADAPTATION.key, key: OVERLAY_TOGGLE_ADAPTATION.key }));
    expect(overlay.isOpen()).toBe(true);
    game.mockClear();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w' }));   // focus left on the page
    expect(game).not.toHaveBeenCalled();
    const inner = document.querySelector('iframe')!.contentWindow! as Window & typeof globalThis;
    inner.document.body.dispatchEvent(new inner.KeyboardEvent('keydown', { code: 'KeyI', key: 'i', bubbles: true }));
    expect(game).not.toHaveBeenCalled();                             // the overlay's own document: never the game's
    inner.dispatchEvent(new inner.KeyboardEvent('keydown', { code: OVERLAY_TOGGLE_ADAPTATION.key, key: OVERLAY_TOGGLE_ADAPTATION.key }));
    expect(overlay.isOpen()).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w' }));
    expect(game).toHaveBeenCalledTimes(1);                           // closed: the game's keys again
    window.removeEventListener('keydown', game);
  });

  it('is one instance per document', () => {
    overlay = mount()!;
    const again = mount();
    expect(again).toBe(overlay);
    overlay.open();
    expect(document.querySelectorAll('iframe').length).toBe(1);
  });

  it('disposes cleanly: the frame gone, the pad the game\'s, the toggles dead, a new mount possible', async () => {
    overlay = mount()!;
    overlay.open();
    await settle();
    overlay.dispose();
    expect(document.querySelector('iframe')).toBeNull();
    expect(nav.getGamepads).toBe(original);
    press(pad, HOME); overlay.poll();
    expect(overlay.isOpen()).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: OVERLAY_TOGGLE_ADAPTATION.key, key: OVERLAY_TOGGLE_ADAPTATION.key }));
    expect(overlay.isOpen()).toBe(false);
    press(pad, CROSS);
    expect(downIn(gameRead(nav))).toEqual([CROSS, HOME]);
    const next = mount();
    expect(next).not.toBe(overlay);
    overlay = next;
  });

  it('restores a navigator whose getGamepads is the prototype\'s (the browser\'s case): no own property left behind', () => {
    class Nav { getGamepads(): ArrayLike<PadLike | null> { return [pad]; } }
    const real = new Nav();
    // Batch B's review F1: the open's progress is read on `Date.now`, so one millisecond between the open and the close
    // made the close's ramp 1 ms long, its timer armed, and the own property still set at the next line (2 failures in
    // 6 runs). The clock steps a millisecond at each read here, so that case is certain; the transition completes at
    // once (`motion: false`), and its own hand-over is the next test's.
    let ms = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => (ms += 1));
    overlay = mountOverlay(document, { nav: real, session: fakeSession(), state: fakeLauncher('in-game'), frame: () => 0, cancelFrame: () => {}, motion: false })!;
    overlay.open();
    press(pad, CROSS);
    expect(downIn(real.getGamepads()[0]!)).toEqual([]);
    press(pad, CROSS, false);
    overlay.close();
    expect(Object.hasOwn(real, 'getGamepads')).toBe(false);
    press(pad, CROSS);
    expect(downIn(real.getGamepads()[0]!)).toEqual([CROSS]);
  });

  it('with the transition: the prototype\'s navigator is shadowed through the close and left with no own property once it completes', () => {
    vi.useFakeTimers();
    try {
      class Nav { getGamepads(): ArrayLike<PadLike | null> { return [pad]; } }
      const real = new Nav();
      overlay = mountOverlay(document, { nav: real, session: fakeSession(), state: fakeLauncher('in-game'), frame: () => 0, cancelFrame: () => {} })!;
      overlay.open();
      vi.advanceTimersByTime(overlayRamp('open', 0, false).ms);
      overlay.close();
      expect(Object.hasOwn(real, 'getGamepads')).toBe(true);           // the game shadowed through the close's ramp
      press(pad, CROSS);
      expect(downIn(real.getGamepads()[0]!)).toEqual([]);
      press(pad, CROSS, false);
      vi.advanceTimersByTime(overlayRamp('closed', 1, false).ms);
      expect(Object.hasOwn(real, 'getGamepads')).toBe(false);
      press(pad, CROSS);
      expect(downIn(real.getGamepads()[0]!)).toEqual([CROSS]);
    } finally {
      vi.useRealTimers();
    }
  });

  // ---- the review's fix round (OV-2 review, PASS WITH FINDINGS) ----

  it('review 1 (OVERLAY-CONSOLE: the console\'s rooms): the list works in the overlay\'s own document -- a click focuses a row, the arrows move through the list', async () => {
    const routes = signedInRoutes();
    const f = fakeFetch(routes);
    vi.stubGlobal('fetch', ((input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), 'http://page.test').pathname;
      const key = Object.keys(routes).find((k) => path.endsWith(k));
      return f.fetch(key ? `${BASE}${key}` : String(input), init);
    }) as typeof fetch);
    overlay = mountOverlay(document, { nav, session: fakeSession('signed-in'), state: fakeLauncher('in-game'), frame: () => 0, cancelFrame: () => {} })!;
    overlay.open();
    const inner = document.querySelector('iframe')!.contentWindow! as Window & typeof globalThis;
    // Play online, then Browse rooms, as a player would: by the pointer, in the overlay's own document.
    inner.document.querySelector<HTMLElement>(`#stage [data-act="cat"][data-i="${CATS.findIndex((c) => c.id === 'online')}"]`)!.click();
    inner.document.querySelector<HTMLElement>('#stage [data-act="item"][data-i="0"]')!.click();
    const rows = (): HTMLElement[] => [...inner.document.querySelectorAll<HTMLElement>('#stage [data-act="room"]')];
    for (let i = 0; i < 20 && rows().length < 2; i++) { await settle(); await new Promise((r) => setTimeout(r, 0)); }
    expect(rows().length).toBeGreaterThanOrEqual(2);
    const S = overlay.console()!.ctl.S;
    rows()[1]!.click();
    // CX-LOBBIES: a briefing room's row opens its detail -- read only in the overlay, no launch target.
    expect(S.screen).toBe('room');
    expect(S.rooms.selected).toBeNull();                                      // read only: no launch target in the overlay
    const key = (k: string): void => { inner.dispatchEvent(new inner.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); };
    key('Backspace');                                                         // Circle, the development build's keymap: back to the list
    expect(S.screen).toBe('rooms');
    expect(S.rooms.row).toBe(1);
    key('ArrowUp');                                                           // the frame's window
    expect(S.rooms.row).toBe(0);
    expect(rows()[0]!.classList.contains('is-focused')).toBe(true);
  });

  it('review 2: button 16 is read from the page\'s pads too when the overlay\'s document reads none (Chromium before a gesture)', () => {
    overlay = mount()!;
    overlay.open();
    const innerNav = document.querySelector('iframe')!.contentWindow!.navigator;
    Object.defineProperty(innerNav, 'getGamepads', { configurable: true, value: () => [null, null, null, null] });
    press(pad, HOME);
    overlay.poll();
    expect(overlay.isOpen()).toBe(false);
  });

  it('review 3: a failure while the sections mount undoes the open (the pad the game\'s again) and the frame loop goes on', () => {
    const frames: (() => void)[] = [];
    const broken = { ...fakeSession('signed-out'), onChange: () => { throw new Error('mount failed'); } };
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    overlay = mountOverlay(document, { nav, session: broken, state: fakeLauncher('in-game'), frame: (cb) => { frames.push(cb); return frames.length; }, cancelFrame: () => {} })!;
    expect(frames.length).toBe(1);
    press(pad, HOME);
    frames.shift()!();                                               // the frame that sees Home: the open fails
    expect(overlay.isOpen()).toBe(false);
    expect(nav.getGamepads).toBe(original);
    expect(document.querySelector('iframe')!.hidden).toBe(true);
    expect(frames.length).toBe(1);                                   // the next frame is still asked for
    expect(warn).toHaveBeenCalled();
    press(pad, CROSS);
    expect(downIn(gameRead(nav))).toEqual([CROSS, HOME]);
  });
});
