// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchAccountService } from '../src/connectHost';
import { SEAT_HOLD_MS_ADAPTATION } from '../src/net/protocol';
import { keepSeatOnUnload, releaseSeatKeep, resetSeatKeepForTest, SEAT_KEEP_ON_RELOAD_ADAPTATION, SEAT_KEEP_RELOAD_PENDING_MS_ADAPTATION, seatKeptForUnload, seatKeptInThisUnload } from '../src/seatKeep';

/**
 * LATER 896 part 2 (the controller's GO, 2026-11-18; product track, a browser adaptation): after a match's graphics are
 * lost, the notice's "Reload and rejoin" keeps the seat through the reload -- the page's unload then sends neither its
 * `bye` (`NetPage`'s pagehide) nor its logout (`PAGEHIDE_LOGOUT_ADAPTATION`), so the room parks the seat and the account's
 * next session takes it back (central `test/lobbyGameParkedResume.test.ts`: a crash's park and a re-join give the SAME
 * seat; a logout heard while the socket lives frees it, 4008). Every other unload is as before.
 */
afterEach(() => { resetSeatKeepForTest(); vi.useRealTimers(); });

const BASE = 'https://play.redotcom.test';
function fakeFetch() {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify({ status: 0 }), { status: 200 }); }) as unknown as typeof fetch;
  return { calls, fetchFn };
}

describe('LATER 896 part 2: the seat kept through a chosen reload', () => {
  it('is a named adaptation; off until the press, off again at the match’s end once the reload is past its wait', () => {
    vi.useFakeTimers();
    expect(SEAT_KEEP_ON_RELOAD_ADAPTATION.length).toBeGreaterThan(0);
    expect(seatKeptForUnload()).toBe(false);
    keepSeatOnUnload();
    expect(seatKeptForUnload()).toBe(true);
    vi.advanceTimersByTime(SEAT_KEEP_RELOAD_PENDING_MS_ADAPTATION);  // no unload came: the reload did not happen
    releaseSeatKeep();
    expect(seatKeptForUnload()).toBe(false);
  });

  it('the logout: sent as today (keepalive) without the keep; not sent at all with it', async () => {
    const today = fakeFetch();
    expect(await fetchAccountService(BASE, today.fetchFn).logout!('tkt')).toEqual({ status: 0 });
    expect(today.calls.map((c) => c.url)).toEqual([`${BASE}/account/logout`]);
    vi.useFakeTimers();
    keepSeatOnUnload();
    vi.advanceTimersByTime(SEAT_KEEP_RELOAD_PENDING_MS_ADAPTATION);   // pressed, no unload in the reload's wait: as today
    const pressed = fakeFetch();
    await fetchAccountService(BASE, pressed.fetchFn).logout!('tkt');
    expect(pressed.calls).toHaveLength(1);
    globalThis.dispatchEvent(new Event('pagehide'));                  // the reload's unload
    const kept = fakeFetch();
    expect(await fetchAccountService(BASE, kept.fetchFn).logout!('tkt')).toEqual({ status: 0 });
    expect(kept.calls, 'no logout: the session ends with the parked seat, its next login a takeover').toEqual([]);
  });

  it('delta review F1/F2: a back/forward-cache pagehide is no unload; a cancelled reload’s Leave match still says its bye; release clears it', () => {
    keepSeatOnUnload();
    const bf = new Event('pagehide') as Event & { persisted?: boolean };
    Object.defineProperty(bf, 'persisted', { value: true });
    globalThis.dispatchEvent(bf);
    expect(seatKeptInThisUnload(), 'persisted: not unloading').toBe(false);
    // LATER 1255: a persisted pagehide now clears the keep (was: it stood, outliving the page's trip to the cache).
    expect(seatKeptForUnload()).toBe(false);
    releaseSeatKeep();                                                 // the Leave match's teardown after a cancelled reload
    expect(seatKeptForUnload()).toBe(false);
  });

  // LATER 1255 (LATER 1242's review F1): the press, then a pagehide into the back/forward cache in place of the reload, the
  // page restored, the match rejoined, and the tab later closed: that close is any page's -- its bye and its logout said.
  it('LATER 1255: a page restored from the back/forward cache after the press, then closed, keeps nothing', () => {
    keepSeatOnUnload();
    const bf = new Event('pagehide') as Event & { persisted?: boolean };
    Object.defineProperty(bf, 'persisted', { value: true });
    globalThis.dispatchEvent(bf);                                      // into the cache, not the reload
    globalThis.dispatchEvent(new Event('pageshow'));                   // restored; the match rejoined
    globalThis.dispatchEvent(new Event('pagehide'));                   // the tab closed later
    expect(seatKeptForUnload(), 'no keep left for a later unload').toBe(false);
    expect(seatKeptInThisUnload(), 'the later close is no kept unload').toBe(false);
  });

  // GRAPHICS-RECOVERY (Shadow row 129, GFXRECOVERY-PC2: a loss during the match load, the automatic reload run once, then the
  // room heard the bye and the logout before the new page): the press (or the automatic reload, which runs the same button)
  // sets the keep and asks the reload; the match's teardown can run BEFORE the reload's unload (the page is not unloading
  // yet), and its releaseSeatKeep cleared the keep -- so the unload said its bye and its logout. A keep with its reload
  // asked survives that teardown; a close or a logout inside the wait says nothing.
  it('GRAPHICS-RECOVERY: a teardown between the press and the reload’s unload keeps the keep: no bye, no logout', async () => {
    keepSeatOnUnload();                                                // "Reload and rejoin" (pressed, or run by itself)
    releaseSeatKeep();                                                 // the match's teardown, before the unload
    expect(seatKeptForUnload(), 'the keep survives the pre-unload teardown').toBe(true);
    expect(seatKeptInThisUnload(), 'a close inside the reload’s wait says no bye').toBe(true);
    const before = fakeFetch();
    await fetchAccountService(BASE, before.fetchFn).logout!('tkt');
    expect(before.calls, 'no logout inside the reload’s wait').toEqual([]);
    globalThis.dispatchEvent(new Event('pagehide'));                  // the reload's unload
    expect(seatKeptForUnload()).toBe(true);
    expect(seatKeptInThisUnload()).toBe(true);
    const kept = fakeFetch();
    await fetchAccountService(BASE, kept.fetchFn).logout!('tkt');
    expect(kept.calls, 'no logout at the unload').toEqual([]);
  });

  // Its product review's F1: a teardown INSIDE the wait, then the reload cancelled (Stop / Esc): nothing re-runs
  // releaseSeatKeep, so the keep must end by itself -- at the room's park (SEAT_HOLD_MS_ADAPTATION): a slow reload past
  // the 30 s wait still keeps the seat (the existing test), a tab closed past the park says its logout and its bye.
  it('GRAPHICS-RECOVERY review F1: a teardown inside the wait, then a cancelled reload: past the room park the keep is over', async () => {
    vi.useFakeTimers();
    keepSeatOnUnload();
    releaseSeatKeep();                                                 // the teardown inside the wait: kept
    expect(seatKeptForUnload()).toBe(true);
    vi.advanceTimersByTime(SEAT_HOLD_MS_ADAPTATION);                  // no unload came by the room's park: cancelled
    expect(seatKeptForUnload(), 'the keep is over with the park').toBe(false);
    globalThis.dispatchEvent(new Event('pagehide'));                  // the tab closed later, an ordinary unload
    expect(seatKeptInThisUnload(), 'that unload keeps nothing').toBe(false);
    const later = fakeFetch();
    await fetchAccountService(BASE, later.fetchFn).logout!('tkt');
    expect(later.calls.length, 'its logout is sent').toBe(1);
  });

  it('GRAPHICS-RECOVERY: a reload that never unloads (past its wait) ends the keep at the next teardown: its bye said', () => {
    vi.useFakeTimers();
    keepSeatOnUnload();
    vi.advanceTimersByTime(SEAT_KEEP_RELOAD_PENDING_MS_ADAPTATION - 1);
    releaseSeatKeep();
    expect(seatKeptForUnload(), 'still inside the wait').toBe(true);
    vi.advanceTimersByTime(1);
    expect(seatKeptInThisUnload(), 'past the wait, not unloading: a close says its bye').toBe(false);
    releaseSeatKeep();                                                 // the Leave match's teardown after a reload that never came
    expect(seatKeptForUnload()).toBe(false);
  });
});
