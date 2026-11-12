// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Say, SayWithdrawn } from '../../match/src/noticeHold';
import type { BriefingRoomTransport } from '../src/briefingRoomHost';
import { GamePad } from '../src/setupPad';
import { gamepadCross, operatorToast, SAY_TOAST_LINES_ADAPTATION, saysFor, withSays, type OperatorToast } from '../src/operatorToast';

/**
 * OA-3 (the operator announcement plan, OA.R1-R5; product track, a browser adaptation with no original): the page's
 * toast for an operator's say -- one closable DOM panel at z-index 20000 in the server-update alert's style, scoped by
 * the page's game, closed on OK / Escape / Cross / a tap, remembered closed for the session, queued, closed on a
 * withdrawal, never on its own. A DOM fixture (jsdom), a fake pad and a fake clock; no browser run.
 */

const UNTIL = 4_000_000_000_000;
const say = (id: number, o: Partial<Say> = {}): Say => ({ id, severity: 0, text: `say ${id}`, until: UNTIL, kind: 'say', ...o });
const gone = (id: number): SayWithdrawn => ({ id, withdrawn: true });

/** A fake pad: `cross()` presses Cross for every subscriber. */
function fakePad() {
  const subs = new Set<() => void>();
  return { onCross: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; }, cross: () => { for (const f of [...subs]) f(); }, subs };
}
const panel = (): HTMLElement | null => document.querySelector('[data-operator-say]');
const key = (code: string): KeyboardEvent => { const e = new KeyboardEvent('keydown', { key: code, code, bubbles: true, cancelable: true }); document.body.dispatchEvent(e); return e; };

let toast: OperatorToast | null = null;
beforeEach(() => { sessionStorage.clear(); document.body.innerHTML = ''; });
afterEach(() => { toast?.dispose(); toast = null; vi.useRealTimers(); vi.restoreAllMocks(); });

describe('OA-3: saysFor -- the says a page shows', () => {
  it('OA-3: saysFor drops a say for another game and keeps --all', () => {
    const all = say(1), seven = say(2, { game: 7 }), eight = say(3, { game: 8 });
    expect(saysFor([all, seven, eight], 7)).toEqual({ show: [all, seven], withdraw: [] });
    expect(saysFor([all, seven, eight], null)).toEqual({ show: [all], withdraw: [] });   // the general lobby: --all only
    expect(saysFor([all, seven, eight], 9)).toEqual({ show: [all], withdraw: [] });
  });

  it('OA-3: every withdrawal is handed on, whatever its game; a say withdrawn in the same reply is never shown', () => {
    expect(saysFor([say(1), say(2, { game: 7 }), gone(2), gone(40)], null)).toEqual({ show: [say(1)], withdraw: [2, 40] });
    expect(saysFor([say(5), gone(5)], 7)).toEqual({ show: [], withdraw: [5] });
  });
});

describe('OA-3: the toast', () => {
  it('OA-3: the toast shows above the loading screen (z 20000) in the server-update alert\'s style', () => {
    const loading = document.createElement('div');
    loading.style.cssText = 'position:fixed;z-index:19000';
    document.body.appendChild(loading);
    const pad = fakePad();
    toast = operatorToast(document, pad, sessionStorage);
    toast.show(say(1, { text: 'Maintenance at 22:00 UTC.' }));
    const p = panel()!;
    expect(p).not.toBeNull();
    expect(p.getAttribute('role')).toBe('status');
    expect(p.getAttribute('aria-live')).toBe('polite');
    expect(Number(p.style.zIndex)).toBe(20000);
    expect(Number(p.style.zIndex)).toBeGreaterThan(Number(loading.style.zIndex));
    expect(Number(p.style.zIndex)).toBeLessThan(20001);                         // below the server-update alert
    expect(p.style.background).toMatch(/#000e11|rgb\(0, 14, 17\)/);
    expect(p.style.color).toMatch(/#e7eef2|rgb\(231, 238, 242\)/);
    expect(p.style.borderColor || p.style.border).toMatch(/#c4a04a|rgb\(196, 160, 74\)/);
    expect(p.style.fontFamily).toMatch(/system-ui/);
    expect(p.style.maxWidth).toBe('60vw');
    expect(p.textContent).toContain('Maintenance at 22:00 UTC.');
    expect([...p.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['OK']);
    const text = p.querySelector('[data-operator-say-text]') as HTMLElement;
    expect(SAY_TOAST_LINES_ADAPTATION).toBe(6);
    expect([`calc(1.35em * ${SAY_TOAST_LINES_ADAPTATION})`, `calc(${+(1.35 * SAY_TOAST_LINES_ADAPTATION).toFixed(4)}em)`]).toContain(text.style.maxHeight);   // jsdom folds the calc
    expect(text.style.overflowY).toBe('auto');
    expect(toast.open()?.id).toBe(1);
  });

  it('OA-3: --warn (severity 1) gets the accent border, 0 the plain one', () => {
    toast = operatorToast(document, fakePad(), null);
    toast.show(say(1));
    const plain = panel()!.style.borderLeftWidth;
    toast.withdraw(1);
    toast.show(say(2, { severity: 1 }));
    expect(panel()!.getAttribute('data-severity')).toBe('1');
    expect(panel()!.style.borderLeftWidth).not.toBe(plain);
  });

  describe('OA-3: the toast shows above the loading screen (z 20000) and closes on OK, Escape and Cross', () => {
    it('OK', () => {
      toast = operatorToast(document, fakePad(), sessionStorage);
      toast.show(say(1));
      (panel()!.querySelector('button') as HTMLButtonElement).click();
      expect(toast.open()).toBeNull();
      expect(panel()).toBeNull();
    });
    it('Escape', () => {
      toast = operatorToast(document, fakePad(), sessionStorage);
      toast.show(say(1));
      const e = key('Escape');
      expect(e.defaultPrevented).toBe(true);
      expect(toast.open()).toBeNull();
      expect(panel()).toBeNull();
    });
    it('Cross', () => {
      const pad = fakePad();
      toast = operatorToast(document, pad, sessionStorage);
      toast.show(say(1));
      expect(pad.subs.size).toBe(1);
      pad.cross();
      expect(toast.open()).toBeNull();
      expect(panel()).toBeNull();
      expect(pad.subs.size).toBe(0);                                             // the pad let go once closed
    });
    it('a click or tap anywhere on it', () => {
      toast = operatorToast(document, fakePad(), sessionStorage);
      toast.show(say(1));
      (panel()!.querySelector('[data-operator-say-text]') as HTMLElement).click();
      expect(toast.open()).toBeNull();
    });
  });

  it('OA-3: another key does not close it; nothing listens while it is closed', () => {
    toast = operatorToast(document, fakePad(), sessionStorage);
    toast.show(say(1));
    const e = key('KeyW');
    expect(e.defaultPrevented).toBe(false);
    expect(toast.open()?.id).toBe(1);
    key('Escape');
    expect(key('Escape').defaultPrevented).toBe(false);                          // closed: Escape is the page's again
  });

  it('OA-3: a closed id is remembered for the session and not reopened', () => {
    toast = operatorToast(document, fakePad(), sessionStorage);
    toast.show(say(5));
    key('Escape');
    toast.show(say(5));                                                          // the poll's repeat
    expect(toast.open()).toBeNull();
    toast.dispose();
    toast = operatorToast(document, fakePad(), sessionStorage);                  // a new session object, the same tab
    toast.show(say(5));
    expect(toast.open()).toBeNull();
    toast.show(say(6));
    expect(toast.open()?.id).toBe(6);
  });

  it('OA-3: the poll\'s repeat of the open say shows it once; a null or a throwing Storage is tolerated', () => {
    toast = operatorToast(document, fakePad(), null);
    toast.show(say(1));
    toast.show(say(1));
    expect(document.querySelectorAll('[data-operator-say]')).toHaveLength(1);
    key('Escape');
    toast.show(say(1));
    expect(toast.open()).toBeNull();                                             // remembered in memory without a Storage
    toast.dispose();
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } } as unknown as Storage;
    toast = operatorToast(document, fakePad(), broken);
    toast.show(say(2));
    key('Escape');
    expect(toast.open()).toBeNull();
  });

  it('OA-3: a second live say queues and shows when the first closes', () => {
    const pad = fakePad();
    toast = operatorToast(document, pad, sessionStorage);
    toast.show(say(1));
    toast.show(say(2));
    toast.show(say(2));                                                          // queued once
    expect(toast.open()?.id).toBe(1);
    expect(document.querySelectorAll('[data-operator-say]')).toHaveLength(1);    // one panel at a time
    pad.cross();
    expect(toast.open()?.id).toBe(2);
    expect(panel()!.textContent).toContain('say 2');
    pad.cross();
    expect(toast.open()).toBeNull();
  });

  it('OA-3: a withdrawal closes the open toast and removes a queued one', () => {
    toast = operatorToast(document, fakePad(), sessionStorage);
    toast.show(say(1));
    toast.show(say(2));
    toast.show(say(3));
    toast.withdraw(2);                                                           // queued: removed
    toast.withdraw(1);                                                           // open: closed, the next shown
    expect(toast.open()?.id).toBe(3);
    toast.withdraw(3);
    expect(toast.open()).toBeNull();
    expect(panel()).toBeNull();
    toast.withdraw(3);                                                           // every poll repeats it: a no-op
    toast.withdraw(99);                                                          // an id never seen: a no-op
    expect(toast.open()).toBeNull();
    toast.show(say(2));                                                          // a stale repeat of a withdrawn say
    expect(toast.open()).toBeNull();
  });

  it('OA-3: the toast never closes on its own', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    toast = operatorToast(document, fakePad(), sessionStorage);
    toast.show(say(1, { until: 1_060_000 }));
    vi.setSystemTime(1_000_000 + 86_400_000);                                    // a day past its `until`
    vi.advanceTimersByTime(86_400_000);
    expect(toast.open()?.id).toBe(1);
    expect(panel()).not.toBeNull();
  });

  it('OA-3 review focus 4: over the START menu or the native Settings overlay, Escape closes the toast first, the menu on the next press', () => {
    const menu: string[] = [];
    const listener = (e: KeyboardEvent): void => { if (e.code === 'Escape') menu.push('menu closed'); };
    globalThis.addEventListener('keydown', listener);                            // the page's own window listeners (`./main`)
    document.addEventListener('keydown', listener as EventListener, true);       // and a document capture listener
    try {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;z-index:1000';                      // the canvas the menu and the overlay draw on
      document.body.appendChild(overlay);
      toast = operatorToast(document, fakePad(), sessionStorage);
      toast.show(say(1));
      expect(Number(panel()!.style.zIndex)).toBeGreaterThan(Number(overlay.style.zIndex));
      key('Escape');
      expect(toast.open()).toBeNull();
      expect(menu).toEqual([]);
      key('Escape');
      expect(menu).toEqual(['menu closed', 'menu closed']);                      // both listeners, at the next press
    } finally {
      globalThis.removeEventListener('keydown', listener);
      document.removeEventListener('keydown', listener as EventListener, true);
    }
  });

  it('OA-3: a development build logs each say and withdrawal with its id', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    toast = operatorToast(document, fakePad(), sessionStorage);
    toast.show(say(11));
    toast.withdraw(11);
    const lines = info.mock.calls.map((c) => c.join(' '));
    expect(lines.some((l) => /operator say/.test(l) && /11/.test(l) && /show/.test(l))).toBe(true);
    expect(lines.some((l) => /operator say/.test(l) && /11/.test(l) && /withdraw/.test(l))).toBe(true);
  });

  it('OA-3: dispose removes the panel and every listener', () => {
    const pad = fakePad();
    toast = operatorToast(document, pad, sessionStorage);
    toast.show(say(1));
    toast.dispose();
    expect(panel()).toBeNull();
    expect(pad.subs.size).toBe(0);
    expect(key('Escape').defaultPrevented).toBe(false);
    toast = null;
  });
});

describe('OA-3: the page\'s pad and the poll\'s tap', () => {
  /** A standard-mapped pad behind a fake `navigator.getGamepads()` and a fake animation frame -- the real `GamePad.poll` path. */
  function padRig() {
    const p = { index: 0, id: 'Pad 0', mapping: 'standard', connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    const cross = (down: boolean): void => { p.buttons[0] = { pressed: down, value: down ? 1 : 0 }; };
    const frames: (() => void)[] = [];
    const nav = { getGamepads: () => [p] };
    const win = { navigator: nav, requestAnimationFrame: (f: () => void) => { frames.push(f); return frames.length; }, cancelAnimationFrame: () => { frames.length = 0; } } as unknown as Window;
    /** One animation frame: the toast's own poll. */
    const step = (): void => { const f = frames.splice(0); for (const g of f) g(); };
    return { nav, win, cross, step, frames };
  }

  it('OA-3 fold F4: gamepadCross through the real GamePad.poll -- a fresh Cross closes on its down edge; polled only while subscribed', () => {
    const r = padRig();
    const pad = gamepadCross(r.win);
    const got: number[] = [];
    const off = pad.onCross(() => { got.push(1); });
    r.step();                                                                    // up
    r.cross(true); r.step();                                                     // down: taken at once
    expect(got).toEqual([1]);
    r.cross(false); r.step();
    expect(got).toEqual([1]);                                                    // the release is no second press
    off();
    expect(r.frames).toEqual([]);                                                // nothing polled once let go
  });

  it('OA-3 fold F4: gamepadCross -- a Cross already held when it subscribes is not taken; the next fresh one is', () => {
    const r = padRig();
    r.cross(true);
    const pad = gamepadCross(r.win);
    const got: number[] = [];
    pad.onCross(() => { got.push(1); });
    r.step(); r.step();
    expect(got).toEqual([]);
    r.cross(false); r.step();
    expect(got).toEqual([]);
    r.cross(true); r.step();
    expect(got).toEqual([1]);
  });

  it('OA-3 fold F2: closing by Cross leaves no Cross for a game reader -- in the same frame and the following ones, until the release', () => {
    const r = padRig();
    toast = operatorToast(document, gamepadCross(r.win), null);
    const game = new GamePad({ waitForRest: false });                           // the round's or the START menu's reader
    const gameCross = (): boolean => !!game.poll(r.nav)?.buttons[0]?.pressed;
    toast.show(say(1));
    r.step();
    expect(gameCross()).toBe(false);
    r.cross(true);
    expect(gameCross()).toBe(false);                                             // the game's reader polls first: taken, up for it
    expect(toast.open()).toBeNull();                                             // closed on the down edge
    r.step();
    expect(gameCross()).toBe(false);                                             // the following frames: still up
    expect(gameCross()).toBe(false);
    r.cross(false);
    expect(gameCross()).toBe(false);                                             // the release: no edge the game can act on
    r.cross(true);
    expect(gameCross()).toBe(true);                                              // a new press is the game's
  });

  it('OA-3 fold 2 F3: after a close by Cross the toast\'s reader polls on until the release (a loading hold: no game reader), so the mask cannot outlast it', () => {
    const r = padRig();
    toast = operatorToast(document, gamepadCross(r.win), null);
    toast.show(say(1));
    r.step();
    r.cross(true);
    r.step();                                                                    // taken by the toast's own poll: closed
    expect(toast.open()).toBeNull();
    expect(r.frames.length).toBe(1);                                             // still polling: the press is held
    r.step();
    expect(r.frames.length).toBe(1);
    r.cross(false);
    r.step();                                                                    // the release seen: the mask let go, polling stops
    expect(r.frames).toEqual([]);
    r.cross(true);                                                               // the next press, the first poll a game reader's
    expect(new GamePad({ waitForRest: false }).poll(r.nav)?.buttons[0]?.pressed).toBe(true);
    r.cross(false);
    new GamePad({ waitForRest: false }).poll(r.nav);
  });

  it('OA-3 fold F2: the toast\'s own reader polling first takes it too; a game reader never sees the down edge', () => {
    const r = padRig();
    toast = operatorToast(document, gamepadCross(r.win), null);
    const game = new GamePad({ waitForRest: false });
    toast.show(say(1));
    r.step(); game.poll(r.nav);
    r.cross(true);
    r.step();                                                                    // the toast's poll first this frame
    expect(toast.open()).toBeNull();
    expect(game.poll(r.nav)?.buttons[0]?.pressed).toBe(false);
  });

  it('withSays: the transport\'s poll reply handed on unchanged, its `says` to the toast; the other requests untouched', async () => {
    const reply = { lines: [], says: [say(1)] };
    const t = { chatLines: () => Promise.resolve(reply), gameList: () => Promise.resolve([]) } as unknown as BriefingRoomTransport;
    const seen: unknown[] = [];
    const tickets: string[] = [];
    const w = withSays(t, (s, ticket) => { seen.push(s); tickets.push(ticket); });
    expect(await w.chatLines!('tkt')).toBe(reply);
    expect(seen).toEqual([[say(1)]]);
    expect(tickets).toEqual(['tkt']);                                           // fold F3: the poll's ticket, for the page to drop a stale reply's
    expect(w.gameList).toBe(t.gameList);
    const old = withSays({ chatLines: () => Promise.resolve([]) } as unknown as BriefingRoomTransport, (s) => { seen.push(s); });
    await old.chatLines!('tkt');
    await withSays({ chatLines: () => Promise.resolve('session-lost') } as unknown as BriefingRoomTransport, (s) => { seen.push(s); }).chatLines!('tkt');
    expect(seen).toHaveLength(1);
    const none = withSays({} as BriefingRoomTransport, () => {});
    expect(none.chatLines).toBeUndefined();
  });
});
