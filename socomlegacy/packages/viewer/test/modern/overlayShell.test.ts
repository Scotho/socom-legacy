// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODERN_OVERLAY_ADAPTATION, mountOverlay, type Overlay, type OverlayOptions } from '../../src/modern/overlay/index';
import type { GameAccount } from '../../src/modern/overlay/session';
import { LOGOFF_QUESTION } from '../../src/modern/logoff';
import { CATS, OVERLAY_LOCK_WORDS } from '../../src/console/state';
import type { PadLike } from '../../src/gamepad';
import { fakeLauncher, fakeSession, settle } from './lobbies/fixtures';

/**
 * MU2-10 (MU2.R3, MU2.R4, MU2.R6 of `docs/plans/2026-10-13-modern-ui-polish-and-overlay.md`): the overlay's shell over
 * the active page -- closed by default and opened and closed through `open()` / `close()` (MU2-11 binds the hold of
 * SELECT to them), its own focus trap over a scrim, the page's focus given back at the close, the page kept running
 * under it; sign-out (the #793 confirm) and the Report in it (MU2-1's answer); the sections' requests at the page's own
 * address, never the frame's `about:blank` (MU2-9's finding (b)); and the persona the game's own when the page's game
 * holds one (MU2-9's finding (a)). A browser adaptation (`MODERN_OVERLAY_ADAPTATION`).
 *
 * OVERLAY-CONSOLE (CX.R13, OT.R60): what the frame draws is the console in its overlay mode, so the cases that pinned the
 * retired shell's head (its account line, its Sign out button, its Report button, its box) pin the console's in their
 * place: the header's player card, Profile's Sign out with the console's #793 confirm, Server > Report a problem.
 */
interface FakePad extends PadLike { buttons: { pressed: boolean; value: number; touched: boolean }[]; axes: number[] }
const fakePad = (): FakePad => ({
  id: 'Test pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 0,
  axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
} as FakePad);

let overlay: Overlay | null = null;
let pad: FakePad;
let asked: string[];
beforeEach(() => {
  asked = [];
  vi.stubGlobal('fetch', (async (input: RequestInfo | URL) => {
    asked.push(String(input instanceof Request ? input.url : input));
    return new Response('{}', { status: 503, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch);
  document.body.innerHTML = '<canvas id="front-end"></canvas><button id="page-control">The page\'s</button>';
  pad = fakePad();
});
afterEach(() => { overlay?.dispose(); overlay = null; vi.unstubAllGlobals(); vi.restoreAllMocks(); document.body.innerHTML = ''; });

// OT.R60 (e): the transition completes at once here (`motion: false`); its hand-over of the pad is test/modern/overlayMotion.test.ts's.
const mount = (o: Partial<OverlayOptions> = {}): Overlay =>
  (overlay = mountOverlay(document, { nav: { getGamepads: () => [pad] }, session: fakeSession('signed-out'), state: fakeLauncher('in-game'), frame: () => 0, cancelFrame: () => {}, motion: false, ...o })!);
const inner = (): Document => document.querySelector('iframe')!.contentDocument!;
const q = <T extends HTMLElement = HTMLElement>(sel: string): T | null => inner().querySelector<T>(sel);

describe('MU2-10: the shell', () => {
  it('is labelled a browser adaptation, closed by default, and says each open and close (onChange)', () => {
    expect(MODERN_OVERLAY_ADAPTATION).toMatch(/adaptation/i);
    const o = mount();
    expect(o.isOpen()).toBe(false);
    expect(document.querySelector('iframe')).toBeNull();             // closed: inert, its frame made at the first open
    const seen: boolean[] = [];
    const off = o.onChange((open) => { seen.push(open); });
    o.open(); o.open();
    o.close(); o.close();
    o.toggle();
    off();
    o.close();
    expect(seen).toEqual([true, false, true]);
  });

  it('draws over the page as one modal dialog (the frame\'s body), the console in it', () => {
    mount().open();
    const root = inner().body;
    expect(root.getAttribute('role')).toBe('dialog');
    expect(root.getAttribute('aria-modal')).toBe('true');
    expect(root.querySelector('.cx-app')).not.toBeNull();
    expect(document.querySelector('iframe')!.classList.contains('mu-overlay-frame')).toBe(true);
  });

  it('traps the focus: Tab from the last control comes round to the first, Shift+Tab from the first to the last', async () => {
    mount().open();
    await settle();
    const win = inner().defaultView as Window & typeof globalThis;
    const root = inner().body;
    const list = [...root.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]')]
      .filter((e) => e.tabIndex >= 0 && !e.matches(':disabled') && !e.closest('[hidden], [inert]'));
    expect(list.length).toBeGreaterThan(2);
    list.at(-1)!.focus();
    list.at(-1)!.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(inner().activeElement).toBe(list[0]);
    list[0]!.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    expect(inner().activeElement).toBe(list.at(-1));
  });

  it('MU2-9\'s review F1: the modern UI\'s one dialog left in it (the Report) sits under the modern mark (`data-modern`), the console under its own (`data-console`) -- and nothing on the page is marked', async () => {
    // The tokens (`--mu-*`) and the icon sizing are scoped to `[data-modern]` (`src/modern/tokens.css`); unmarked, every
    // unsized `.mu-icon` filled its container in the rendered overlay (the controller's frames of 2026-10-13 17:12Z).
    const tokens = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../src/modern/tokens.css'), 'utf8');
    expect(tokens).toMatch(/\[data-modern\] \.mu-icon \{ width: var\(--mu-icon\); height: var\(--mu-icon\);/);
    const o = mount();
    o.open();
    await settle();
    o.console()!.ctl.doAct('report');                                  // the Report's dialog drawn too
    const host = q('.mu-overlay__report-host')!;
    expect(host.hasAttribute('data-modern')).toBe(true);
    for (const i of inner().querySelectorAll('.mu-icon')) expect(i.matches('[data-modern] .mu-icon'), `${i.outerHTML.slice(0, 80)} outside [data-modern]`).toBe(true);
    expect(inner().documentElement.hasAttribute('data-console')).toBe(true);
    expect(q('.cx-app')!.closest('[data-modern]')).toBeNull();
    expect(document.querySelector('[data-modern]')).toBeNull();          // the page itself is never restyled by it
    expect(document.documentElement.hasAttribute('data-console')).toBe(false);
  });

  it('gives the page its focus back at the close, where it was', () => {
    const before = document.getElementById('page-control')!;
    before.focus();
    const o = mount();
    o.open();
    expect(document.activeElement).toBe(document.querySelector('iframe'));
    o.close();
    expect(document.activeElement).toBe(before);
  });

  it('keeps the page running while open: its frames, its clock and its socket go on; nothing of the page is suspended', () => {
    vi.useFakeTimers();
    try {
      let ticks = 0;
      const clock = setInterval(() => { ticks++; }, 1000);              // a round's clock
      const socket = { readyState: 1, close: vi.fn() };                // the match socket
      let frames = 0;
      const pageFrame = (): void => { frames++; window.requestAnimationFrame(pageFrame); };
      window.requestAnimationFrame(pageFrame);
      const o = mount();
      o.open();
      vi.advanceTimersByTime(5000);
      expect(ticks).toBe(5);
      expect(frames).toBeGreaterThan(0);
      expect(socket.close).not.toHaveBeenCalled();
      expect(socket.readyState).toBe(1);
      expect(document.hidden).toBe(false);
      o.close();
      clearInterval(clock);
    } finally { vi.useRealTimers(); }
  });

  it('the pad is the overlay\'s while open (the game reads it untouched) and the game\'s again at the close', () => {
    const nav = { getGamepads: (): ArrayLike<PadLike | null> => [pad] };
    const o = mount({ nav });
    pad.buttons[0] = { pressed: true, value: 1, touched: true };
    o.open();
    expect(nav.getGamepads()[0]!.buttons[0]!.pressed).toBe(false);
    pad.buttons[0] = { pressed: false, value: 0, touched: false };
    o.close();
    pad.buttons[0] = { pressed: true, value: 1, touched: true };
    expect(nav.getGamepads()[0]!.buttons[0]!.pressed).toBe(true);
  });
});

/** The console's Profile category's items as drawn: their titles and their lines. */
const profileItems = (o: Overlay): { title: string; sub: string; disabled: boolean }[] => {
  const page = o.console()!;
  page.ctl.S.cat = CATS.findIndex((c) => c.id === 'profile');
  page.render();
  return [...inner().querySelectorAll<HTMLElement>('#stage .cx-list .cx-item')].map((b) => ({
    title: b.querySelector('.cx-item__title')!.textContent ?? '', sub: b.querySelector('.cx-item__sub')!.textContent ?? '', disabled: b.classList.contains('is-disabled'),
  }));
};
const player = (): string => q('#header .cx-player__name')!.textContent ?? '';

describe('MU2-10: sign-out and the Report (MU2-1\'s answer; OVERLAY-CONSOLE: the console\'s own)', () => {
  it('signed in: the console\'s Sign out asks the #793 question, No first; Yes signs the overlay\'s session out', async () => {
    const session = fakeSession('signed-in');
    const signOut = vi.spyOn(session, 'signOut');
    const o = mount({ session });
    o.open();
    await settle();
    const out = profileItems(o).find((x) => x.title === 'Sign out')!;
    expect(out.disabled).toBe(false);
    const ctl = o.console()!.ctl;
    ctl.S.item[ctl.S.cat] = profileItems(o).findIndex((x) => x.title === 'Sign out');
    ctl.press('cross');
    expect(ctl.S.overlay).toBe('confirm');
    expect(ctl.S.confirmKind).toBe('signout');
    const ask = q('#overlay .cx-dialog')!;
    expect(ask.textContent).toContain(LOGOFF_QUESTION);
    expect(ctl.S.confirmRow).toBe(0);                                     // No, first and focused
    ctl.press('down');
    ctl.press('cross');
    await settle();
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(player()).toBe('Sign in');
  });

  it('signed out: no Sign out; the player card says Sign in (CX-PERSONA: the card\'s personas beside it)', () => {
    const o = mount();
    o.open();
    expect(profileItems(o).map((x) => x.title)).toEqual(['Service record', 'Replays', 'Loadouts', 'Profiles', 'Sign in']);
    expect(player()).toBe('Sign in');
  });

  it('the Report (Server > Report a problem) opens FB-1\'s dialog over the console (the console inert under it); Escape closes it', () => {
    const o = mount();
    o.open();
    const page = o.console()!;
    page.ctl.doAct('server');
    page.render();
    // LR-3: Server information's verbs are LR-1's rows; a page's is a link row (`data-act="svrow"`).
    const row = [...inner().querySelectorAll<HTMLElement>('#stage [data-act="svrow"]')].find((b) => b.querySelector('.cx-r__label')!.textContent === 'Report a problem')!;
    expect(row).toBeDefined();
    row.focus();
    row.click();
    const dialog = q('.mu-overlay__report-host [role="dialog"]')!;
    expect(dialog.textContent).toContain('Report a problem');
    expect(dialog.hidden).toBe(false);
    expect(q('.cx-app')!.hasAttribute('inert')).toBe(true);
    const win = inner().defaultView as Window & typeof globalThis;
    dialog.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(dialog.hidden).toBe(true);
    expect(q('.cx-app')!.hasAttribute('inert')).toBe(false);
    expect(o.isOpen()).toBe(true);                                          // the Report's Escape is not the console's Circle
  });
});

describe('MU2-10: the console\'s adapters ask the page\'s own address, never the frame\'s about:blank (MU2-9\'s finding (b))', () => {
  it('every request goes to the page\'s origin', async () => {
    const o = mount({ session: fakeSession('signed-in') });
    o.open();
    const page = o.console()!;
    for (const id of ['home', 'online', 'replays', 'profile', 'options']) {
      page.ctl.S.cat = CATS.findIndex((c) => c.id === id);
      page.render();
      await settle();
      await new Promise((r) => setTimeout(r, 0));
    }
    page.ctl.doAct('rooms');
    page.ctl.doAct('news');
    await settle();
    await new Promise((r) => setTimeout(r, 0));
    expect(asked.length).toBeGreaterThan(0);
    const origin = window.location.origin;
    const off = asked.filter((u) => !u.startsWith(`${origin}/`));
    expect(off, `asked outside ${origin}`).toEqual([]);
    expect(asked.some((u) => u.includes('/null/'))).toBe(false);
  });
});

describe('MU2-10: the persona over a game page is the game\'s own (MU2-9\'s finding (a))', () => {
  const lobby = (name: string | null): GameAccount & { set(n: string | null): void } => {
    let now = name;
    return { loggedIn: () => now !== null, ticket: () => (now === null ? null : 'game-ticket'), account: () => now, set(n) { now = n; } };
  };

  it('the game logged in: the overlay shows its persona and asks with its ticket; no Sign out of the game from here', async () => {
    const own = fakeSession('signed-out');
    const signIn = vi.spyOn(own, 'signIn');
    const game = lobby('GAMEPERSONA');
    vi.stubGlobal('fetch', (async (input: RequestInfo | URL, init?: RequestInit) => {
      asked.push(`${String(input)} ${new Headers(init?.headers).get('authorization') ?? ''}`);
      return new Response('{}', { status: 503, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch);
    const o = mount({ session: own, game: () => game });
    o.open();
    await settle();
    await new Promise((r) => setTimeout(r, 0));
    expect(player()).toBe('GAMEPERSONA');
    const out = profileItems(o).find((x) => x.title === 'Sign out')!;
    expect(out.disabled).toBe(true);                                      // the game's LOGOFF is its own menus'
    expect(out.sub).toBe(OVERLAY_LOCK_WORDS.signOutGame);
    expect(asked.some((a) => a.includes('/replays') && a.endsWith('Bearer game-ticket'))).toBe(true);   // the replays list, asked with the game's ticket
    expect(signIn).not.toHaveBeenCalled();
  });

  it('the game logs in while the overlay is open: followed at the next frame, the overlay\'s own session signed out (one persona)', async () => {
    const own = fakeSession('signed-in');
    const signOut = vi.spyOn(own, 'signOut');
    const game = lobby(null);
    const o = mount({ session: own, game: () => game });
    o.open();
    await settle();
    expect(player()).toBe('Me');
    game.set('GAMEPERSONA');
    o.poll();
    await settle();
    expect(player()).toBe('GAMEPERSONA');
    expect(signOut).toHaveBeenCalledTimes(1);
    game.set(null);
    o.poll();
    await settle();
    expect(player()).toBe('Sign in');
  });

  it('no game account on the page (the test room, the sheet): the overlay\'s own session, as before', async () => {
    const o = mount({ session: fakeSession('signed-in'), game: () => null });
    o.open();
    await settle();
    expect(player()).toBe('Me');
    expect(profileItems(o).find((x) => x.title === 'Sign out')!.disabled).toBe(false);
  });

  it('the disc page: the overlay\'s own session ends at the image\'s START (MU-F2a), so the game\'s LOGIN finds the account free', async () => {
    const { beforeLaunch } = await import('../../src/modern/launchGate');
    const own = fakeSession('signed-in');
    const signOut = vi.spyOn(own, 'signOut');
    mount({ session: own, startBoundary: true });
    const wait = beforeLaunch(document);
    expect(wait).not.toBeNull();
    await wait;
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
