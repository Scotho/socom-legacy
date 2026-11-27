// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GRAPHICS_AUTO_RELOAD_MIN_INTERVAL_MS_ADAPTATION, GRAPHICS_AUTO_RELOAD_STAMP_KEY, GRAPHICS_AUTO_RELOAD_MAX_PER_TAB_ADAPTATION, GRAPHICS_AUTO_RELOAD_COUNT_KEY,GRAPHICS_LOST_LEAVE_LABEL, GRAPHICS_LOST_REJOIN_LABEL,
  GRAPHICS_OOM_FLOOD_COUNT_ADAPTATION, GRAPHICS_OOM_FLOOD_WINDOW_MS_ADAPTATION, GRAPHICS_RECOVERY_DEFAULT_ADAPTATION,
  GRAPHICS_RECOVERY_RELOADING_TEXT, graphicsErrorText, graphicsRecoveryNoticeHeld, holdGraphicsRecoveryNotice, graphicsLostText, graphicsRecord, graphicsRecoveryMode, graphicsText,
  isOutOfMemoryError, onGraphicsEvent, resetGraphicsRecordForTest, setGraphicsLostAction, showGraphicsLost, watchGraphicsErrors,
  watchGraphicsLost,
} from '../src/graphicsLost';

afterEach(() => { document.body.innerHTML = ''; resetGraphicsRecordForTest(); });

describe('graphicsLost (browser adaptation: the lost-graphics notice)', () => {
  it('names the API, the browser\'s message, the reason and the UTC time', () => {
    const at = new Date(Date.UTC(2026, 10, 1, 3, 30, 43));
    expect(graphicsLostText({ api: 'WebGL', message: 'Unknown reason', reason: null }, at))
      .toBe('Graphics stopped at 03:30:43Z (WebGL: Unknown reason). Reload the page to continue.');
    expect(graphicsLostText({ api: 'WebGPU', message: 'D3D12 device removed', reason: 'unknown' }, at))
      .toBe('Graphics stopped at 03:30:43Z (WebGPU: D3D12 device removed; reason unknown). Reload the page to continue.');
  });

  it('shows one notice on the page, replacing an earlier one', () => {
    showGraphicsLost(document, { api: 'WebGL', message: 'first' });
    const el = showGraphicsLost(document, { api: 'WebGL', message: 'second' });
    const all = document.querySelectorAll('[data-graphics-lost]');
    expect(all.length).toBe(1);
    expect(all[0]).toBe(el);
    expect(el.textContent).toContain('WebGL: second');
    expect(el.getAttribute('role')).toBe('alert');
    expect(el.classList.contains('s2u-notice')).toBe(true);                // the design system's panel: no colour or type inline
    expect(el.style.background).toBe('');
  });

  it('chains the renderer\'s own device-lost handler and then shows the notice', () => {
    const seen: string[] = [];
    const renderer = { onDeviceLost: (info: { message: string }) => { seen.push(info.message); } };
    watchGraphicsLost(renderer, document);
    renderer.onDeviceLost({ api: 'WebGL', message: 'context lost', reason: null } as never);
    expect(seen).toEqual(['context lost']);
    expect(document.querySelector('[data-graphics-lost]')?.textContent).toContain('WebGL: context lost');
  });

  it('leaves a renderer without onDeviceLost alone: the adaptation never stops a renderer being made', () => {
    const bare = {} as { onDeviceLost: (info: never) => void };
    expect(() => watchGraphicsLost(bare, document)).not.toThrow();
    expect(bare.onDeviceLost).toBeUndefined();
  });
});

/**
 * The graphics-errors instrument (product track, a browser adaptation; the tag-trails hunt of 2026-11-05): a WebGPU
 * validation error the device reports as uncaptured drops the pass's whole command buffer with no word on the page (the
 * world black or frozen while the overlays stack), and only a console nobody opens says why. three's `WebGPURenderer`
 * routes the device's `uncapturederror` to its `onError` (the console line); this keeps the first one and a count, puts
 * them on the page, and the performance line carries them so a player's report names the failing draw.
 */
describe('graphicsErrors (browser adaptation: the uncaptured GPU errors kept, shown and reported)', () => {
  const at = new Date(Date.UTC(2026, 10, 5, 2, 10, 5));

  it('names the API, the type, the message, the UTC time and the count', () => {
    expect(graphicsErrorText({ api: 'WebGPU', type: 'ValidationError', message: 'Destroyed texture [Texture "colorBuffer"] used in a submit.' }, 1, at))
      .toBe('Graphics error at 02:10:05Z (WebGPU ValidationError: Destroyed texture [Texture "colorBuffer"] used in a submit.), 1 so far. Reload the page if the picture is wrong.');
    expect(graphicsErrorText({ api: 'WebGPU', message: 'x' }, 12, at)).toContain('(WebGPU GPUError: x), 12 so far.');
  });

  it('chains the renderer\'s own error handler, keeps the first error and counts every one, and shows one notice', () => {
    const seen: string[] = [];
    const renderer = { onError: (info: { message: string }) => { seen.push(info.message); } };
    watchGraphicsErrors(renderer, document, () => at);
    renderer.onError({ api: 'WebGPU', type: 'ValidationError', message: 'first' } as never);
    renderer.onError({ api: 'WebGPU', type: 'ValidationError', message: 'second' } as never);
    // GRAPHICS-RECOVERY: an out-of-memory error now has its own notice (below), so this one's third is an internal error
    renderer.onError({ api: 'WebGPU', type: 'InternalError', message: 'third' } as never);
    expect(seen).toEqual(['first', 'second', 'third']);                      // three's console line still written
    const r = graphicsRecord();
    expect(r.count).toBe(3);
    expect(r.first).toEqual({ api: 'WebGPU', type: 'ValidationError', message: 'first', at: '2026-11-05T02:10:05.000Z' });
    const all = document.querySelectorAll('[data-graphics-error]');
    expect(all.length).toBe(1);
    expect(all[0]?.textContent).toContain('WebGPU ValidationError: first), 3 so far');
    expect(all[0]?.getAttribute('role')).toBe('status');
    expect(all[0]?.classList.contains('s2u-notice')).toBe(true);
    expect(document.querySelector('[data-graphics-lost]')).toBeNull();      // the lost notice is its own
  });

  it('leaves a renderer without onError alone', () => {
    const bare = {} as { onError: (info: never) => void };
    expect(() => watchGraphicsErrors(bare, document)).not.toThrow();
    expect(bare.onError).toBeUndefined();
    expect(graphicsRecord()).toEqual({ first: null, count: 0, oom: null, lost: null });
  });

  it('a lost device is recorded beside the errors, with its time', () => {
    const renderer = { onDeviceLost: (_info: unknown) => undefined };
    watchGraphicsLost(renderer, document, () => at);
    renderer.onDeviceLost({ api: 'WebGPU', message: 'D3D12 device removed', reason: 'unknown' } as never);
    expect(graphicsRecord().lost).toEqual({ api: 'WebGPU', message: 'D3D12 device removed', reason: 'unknown', at: '2026-11-05T02:10:05.000Z' });
  });

  it('graphicsText: "ok" with nothing recorded; else the first error, the count and the lost, on one line, the message capped', () => {
    expect(graphicsText({ first: null, count: 0, lost: null })).toBe('ok');
    expect(graphicsText({ first: { api: 'WebGPU', type: 'ValidationError', message: 'a |\nb', at: '2026-11-05T02:10:05.000Z' }, count: 12, lost: null }))
      .toBe('WebGPU ValidationError x12 "a / b" first 02:10:05Z');
    expect(graphicsText({ first: null, count: 0, lost: { api: 'WebGPU', message: 'gone', reason: null, at: '2026-11-05T02:11:00.000Z' } }))
      .toBe('lost 02:11:00Z WebGPU: gone');
    const long = graphicsText({ first: { api: 'WebGPU', type: 'ValidationError', message: 'm'.repeat(400), at: '2026-11-05T02:10:05.000Z' }, count: 1, lost: { api: 'WebGPU', message: 'gone', reason: 'unknown', at: '2026-11-05T02:11:00.000Z' } });
    expect(long).toBe(`WebGPU ValidationError x1 "${'m'.repeat(200)}..." first 02:10:05Z; lost 02:11:00Z WebGPU: gone (unknown)`);
  });
});

/**
 * GRAPHICS-RECOVERY (product track, a browser adaptation; the main controller's note of 2026-11-22, item 1): a Shadow PC
 * with a 1 GB GPU-process cap reported a flood of GPUOutOfMemoryError about 1.2 s before the device was lost. three r186
 * names the error by its class (`GPUOutOfMemoryError`); the record and the notice tell it apart from the other errors,
 * and the launch-settings switch `graphicsrecovery=reload` lets the match's own "Reload and rejoin" run by itself on a
 * loss or an out-of-memory flood (default `notice`: today's behaviour).
 */
describe('GRAPHICS-RECOVERY: out of memory told apart', () => {
  const at = new Date(Date.UTC(2026, 10, 22, 1, 2, 3));

  it('isOutOfMemoryError: both class names; a ValidationError and a bare error are not', () => {
    expect(isOutOfMemoryError({ api: 'WebGPU', type: 'GPUOutOfMemoryError', message: 'x' })).toBe(true);
    expect(isOutOfMemoryError({ api: 'WebGPU', type: 'OutOfMemoryError', message: 'x' })).toBe(true);
    expect(isOutOfMemoryError({ api: 'WebGPU', type: 'GPUValidationError', message: 'x' })).toBe(false);
    expect(isOutOfMemoryError({ api: 'WebGPU', type: 'ValidationError', message: 'x' })).toBe(false);
    expect(isOutOfMemoryError({ api: 'WebGPU', message: 'out of memory' })).toBe(false);
  });

  it('the record keeps the out-of-memory part beside the generic count; the beacon kind stays gpuuncapturederror with the class', () => {
    const told: [string, string | null][] = [];
    onGraphicsEvent((kind, info) => { told.push([kind, info.detail]); });
    const renderer = { onError: (_: unknown): void => undefined };
    watchGraphicsErrors(renderer, document, () => at);
    (renderer.onError as (i: unknown) => void)({ api: 'WebGPU', type: 'GPUValidationError', message: 'bad bind' });
    (renderer.onError as (i: unknown) => void)({ api: 'WebGPU', type: 'GPUOutOfMemoryError', message: 'Not enough memory left.' });
    (renderer.onError as (i: unknown) => void)({ api: 'WebGPU', type: 'GPUOutOfMemoryError', message: 'again' });
    const r = graphicsRecord();
    expect(r.count).toBe(3);
    expect(r.first?.type).toBe('GPUValidationError');
    expect(r.oom).toEqual({ first: { api: 'WebGPU', type: 'GPUOutOfMemoryError', message: 'Not enough memory left.', at: '2026-11-22T01:02:03.000Z' }, count: 2 });
    expect(told).toEqual([['gpuuncapturederror', 'GPUValidationError'], ['gpuuncapturederror', 'GPUOutOfMemoryError'], ['gpuuncapturederror', 'GPUOutOfMemoryError']]);
    // the notice names it plainly, the first out-of-memory error and their count
    expect(document.querySelector('[data-graphics-error]')?.textContent)
      .toBe('Graphics memory ran out at 01:02:03Z (WebGPU GPUOutOfMemoryError: Not enough memory left.), 2 so far. Reload the page if the picture is wrong.');
  });

  it('graphicsErrorText and graphicsText name it: "graphics memory ran out"', () => {
    expect(graphicsErrorText({ api: 'WebGPU', type: 'OutOfMemoryError', message: 'm' }, 4, at))
      .toBe('Graphics memory ran out at 01:02:03Z (WebGPU OutOfMemoryError: m), 4 so far. Reload the page if the picture is wrong.');
    const oom = { first: { api: 'WebGPU', type: 'GPUOutOfMemoryError', message: 'm |\nn', at: '2026-11-22T01:02:03.000Z' }, count: 5 };
    expect(graphicsText({ first: null, count: 5, oom, lost: null })).toBe('WebGPU graphics memory ran out x5 "m / n" first 01:02:03Z');
    expect(graphicsText({ first: oom.first, count: 6, oom, lost: { api: 'WebGPU', message: 'gone', reason: null, at: '2026-11-22T01:02:04.000Z' } }))
      .toBe('WebGPU GPUOutOfMemoryError x6 "m / n" first 01:02:03Z; WebGPU graphics memory ran out x5 "m / n" first 01:02:03Z; lost 01:02:04Z WebGPU: gone');
  });
});

describe('GRAPHICS-RECOVERY: the graphicsrecovery switch (notice | reload)', () => {
  const t0 = Date.UTC(2026, 10, 22, 1, 0, 0);
  const lossInfo = { api: 'WebGPU', message: 'Device lost', reason: 'unknown' };
  const setSearch = (q: string): void => { history.replaceState(null, '', `/${q}`); };
  const hold = (): { rejoin: ReturnType<typeof vi.fn>; leave: ReturnType<typeof vi.fn> } => {
    const rejoin = vi.fn(), leave = vi.fn();
    setGraphicsLostAction({ actions: [{ label: GRAPHICS_LOST_REJOIN_LABEL, run: rejoin }, { label: GRAPHICS_LOST_LEAVE_LABEL, run: leave }] }, document);
    return { rejoin, leave };
  };
  const lose = (ms: number): void => {
    const r = { onDeviceLost: (_: never): void => undefined };
    watchGraphicsLost(r, document, () => new Date(ms));
    (r.onDeviceLost as (i: typeof lossInfo) => void)(lossInfo);
  };
  const errs = (): ((type: string, ms: number) => void) => {
    let now = t0;
    const r = { onError: (_: never): void => undefined };
    watchGraphicsErrors(r, document, () => new Date(now));
    return (type, ms) => { now = ms; (r.onError as (i: unknown) => void)({ api: 'WebGPU', type, message: 'm' }); };
  };
  afterEach(() => { setSearch(''); sessionStorage.clear(); vi.restoreAllMocks(); });

  // The owner's word (via the main controller, 2026-11-25): "the setting to reload on 3d graphic loss should be on by
  // default." Unset (or unreadable) is reload; an explicit `graphicsrecovery=notice` stays notice.
  it('reads the switch: default reload (the owner\'s word, 2026-11-25); an explicit notice stays notice; anything else is the default', () => {
    expect(GRAPHICS_RECOVERY_DEFAULT_ADAPTATION).toBe('reload');
    expect(graphicsRecoveryMode('')).toBe('reload');
    expect(graphicsRecoveryMode('?graphicsrecovery=')).toBe('reload');           // an empty value: not set
    expect(graphicsRecoveryMode('?graphicsrecovery=reload')).toBe('reload');
    expect(graphicsRecoveryMode('?graphicsrecovery=notice')).toBe('notice');
    expect(graphicsRecoveryMode('?graphicsrecovery=yes')).toBe('reload');
    setSearch('?graphicsrecovery=notice');
    expect(graphicsRecoveryMode()).toBe('notice');                      // the page's own address by default
    setSearch('');
    expect(graphicsRecoveryMode()).toBe('reload');
  });

  it('unset (the default, reload): a loss with an action held runs the held "Reload and rejoin" by itself, once', () => {
    const { rejoin, leave } = hold();
    lose(t0);
    expect(rejoin).toHaveBeenCalledTimes(1);
    expect(leave).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(GRAPHICS_AUTO_RELOAD_STAMP_KEY)).toBe(String(t0));
    expect(document.querySelector('[data-graphics-lost] [data-graphics-reloading]')?.textContent).toBe(GRAPHICS_RECOVERY_RELOADING_TEXT);
  });

  it('notice, set explicitly: a loss with an action held runs nothing by itself -- the default never overrides it', () => {
    setSearch('?graphicsrecovery=notice');
    const { rejoin, leave } = hold();
    lose(t0);
    expect(rejoin).not.toHaveBeenCalled();
    expect(leave).not.toHaveBeenCalled();
    expect(document.querySelector('[data-graphics-reloading]')).toBeNull();
    expect(sessionStorage.getItem(GRAPHICS_AUTO_RELOAD_STAMP_KEY)).toBeNull();
  });

  it('reload: a loss runs the held "Reload and rejoin" once, stamps the tab, and the notice says it is reloading', () => {
    setSearch('?graphicsrecovery=reload');
    const { rejoin, leave } = hold();
    lose(t0);
    expect(rejoin).toHaveBeenCalledTimes(1);
    expect(leave).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(GRAPHICS_AUTO_RELOAD_STAMP_KEY)).toBe(String(t0));
    expect(document.querySelector('[data-graphics-lost] [data-graphics-reloading]')?.textContent).toBe(GRAPHICS_RECOVERY_RELOADING_TEXT);
    lose(t0 + 1000);                                                    // never in a loop: this page's second loss
    expect(rejoin).toHaveBeenCalledTimes(1);
  });

  it('reload: a loss within 10 minutes of the last automatic reload (a new page, the same tab) does not; after them it does', () => {
    expect(GRAPHICS_AUTO_RELOAD_MIN_INTERVAL_MS_ADAPTATION).toBe(10 * 60 * 1000);
    setSearch('?graphicsrecovery=reload');
    sessionStorage.setItem(GRAPHICS_AUTO_RELOAD_STAMP_KEY, String(t0));
    let { rejoin } = hold();
    lose(t0 + GRAPHICS_AUTO_RELOAD_MIN_INTERVAL_MS_ADAPTATION - 1);
    expect(rejoin).not.toHaveBeenCalled();
    expect(document.querySelector('[data-graphics-reloading]')).toBeNull();
    resetGraphicsRecordForTest();                                       // the next page
    ({ rejoin } = hold());
    lose(t0 + GRAPHICS_AUTO_RELOAD_MIN_INTERVAL_MS_ADAPTATION);
    expect(rejoin).toHaveBeenCalledTimes(1);
  });

  it('reload: a tab reloads by itself at most GRAPHICS_AUTO_RELOAD_MAX_PER_TAB_ADAPTATION times, however far apart (review F2)', () => {
    expect(GRAPHICS_AUTO_RELOAD_MAX_PER_TAB_ADAPTATION).toBe(3);
    setSearch('?graphicsrecovery=reload');
    const runs: number[] = [];
    for (let k = 0; k < GRAPHICS_AUTO_RELOAD_MAX_PER_TAB_ADAPTATION + 2; k++) {
      resetGraphicsRecordForTest();                                     // each its own page, the same tab
      const { rejoin } = hold();
      lose(t0 + k * 2 * GRAPHICS_AUTO_RELOAD_MIN_INTERVAL_MS_ADAPTATION);
      runs.push(rejoin.mock.calls.length);
    }
    expect(runs).toEqual([1, 1, 1, 0, 0]);
    expect(sessionStorage.getItem(GRAPHICS_AUTO_RELOAD_COUNT_KEY)).toBe(String(GRAPHICS_AUTO_RELOAD_MAX_PER_TAB_ADAPTATION));
  });

  it('reload: an out-of-memory flood under the threshold does not; at it (within the window) does; other errors never count', () => {
    expect([GRAPHICS_OOM_FLOOD_COUNT_ADAPTATION, GRAPHICS_OOM_FLOOD_WINDOW_MS_ADAPTATION]).toEqual([3, 2000]);
    setSearch('?graphicsrecovery=reload');
    const { rejoin } = hold();
    const err = errs();
    err('GPUOutOfMemoryError', t0);
    err('GPUValidationError', t0 + 100);
    err('GPUValidationError', t0 + 200);
    err('GPUOutOfMemoryError', t0 + 2100);
    err('GPUOutOfMemoryError', t0 + 2200);                              // 3 in all, but the first has left the window: 2 in it
    expect(rejoin).not.toHaveBeenCalled();
    err('GPUOutOfMemoryError', t0 + 2300);                              // 3 within 2 s
    expect(rejoin).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-graphics-error] [data-graphics-reloading]')?.textContent).toBe(GRAPHICS_RECOVERY_RELOADING_TEXT);
    err('GPUOutOfMemoryError', t0 + 2400);
    lose(t0 + 2500);                                                    // the loss that follows the flood: not a second reload
    expect(rejoin).toHaveBeenCalledTimes(1);
  });

  it('notice, set explicitly: an out-of-memory flood runs nothing', () => {
    setSearch('?graphicsrecovery=notice');
    const { rejoin } = hold();
    const err = errs();
    for (let i = 0; i < 5; i++) err('GPUOutOfMemoryError', t0 + i);
    expect(rejoin).not.toHaveBeenCalled();
  });

  it('reload: storage that throws on read or on write means no automatic reload', () => {
    setSearch('?graphicsrecovery=reload');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
    const { rejoin } = hold();
    lose(t0);
    expect(rejoin).not.toHaveBeenCalled();
    vi.restoreAllMocks();
    resetGraphicsRecordForTest();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    const second = hold();
    lose(t0);
    expect(second.rejoin).not.toHaveBeenCalled();
    expect(document.querySelector('[data-graphics-reloading]')).toBeNull();
  });

  it('reload: no action held (the front end, the forge) -- nothing automatic; an action without the rejoin -- nothing', () => {
    setSearch('?graphicsrecovery=reload');
    lose(t0);
    expect(document.querySelector('[data-graphics-reloading]')).toBeNull();
    expect(sessionStorage.getItem(GRAPHICS_AUTO_RELOAD_STAMP_KEY)).toBeNull();
    const leave = vi.fn();
    setGraphicsLostAction({ actions: [{ label: GRAPHICS_LOST_LEAVE_LABEL, run: leave }] }, document);
    lose(t0 + 1);
    expect(leave).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(GRAPHICS_AUTO_RELOAD_STAMP_KEY)).toBeNull();
  });
});

/**
 * The owner's word (via the main controller, 2026-11-25): "Leave the Forge out". The Forge's own mounts (its Play and its
 * custom matches, `../src/forge/match`) hold the notice (`holdGraphicsRecoveryNotice`): a loss there shows the notice and
 * runs nothing by itself, under the default and under an explicit reload alike; every other match keeps the reload default.
 */
describe("GRAPHICS-RECOVERY: the Forge is left out (the owner's word, 2026-11-25)", () => {
  const t0 = Date.UTC(2026, 10, 25, 1, 0, 0);
  const hold = (): ReturnType<typeof vi.fn> => {
    const rejoin = vi.fn();
    setGraphicsLostAction({ actions: [{ label: GRAPHICS_LOST_REJOIN_LABEL, run: rejoin }, { label: GRAPHICS_LOST_LEAVE_LABEL, run: () => undefined }] }, document);
    return rejoin;
  };
  const lose = (ms: number): void => {
    const r = { onDeviceLost: (_: never): void => undefined };
    watchGraphicsLost(r, document, () => new Date(ms));
    (r.onDeviceLost as (i: unknown) => void)({ api: 'WebGPU', message: 'Device lost', reason: 'unknown' });
  };
  afterEach(() => { history.replaceState(null, '', '/'); sessionStorage.clear(); });

  it('a normal match (no hold), the setting unset: the loss runs the rejoin by itself', () => {
    expect(graphicsRecoveryNoticeHeld()).toBe(false);
    const rejoin = hold();
    lose(t0);
    expect(rejoin).toHaveBeenCalledTimes(1);
  });

  it('a Forge mount (the hold), the setting unset: the notice, and nothing runs by itself', () => {
    const release = holdGraphicsRecoveryNotice();
    expect(graphicsRecoveryNoticeHeld()).toBe(true);
    const rejoin = hold();
    lose(t0);
    expect(rejoin).not.toHaveBeenCalled();
    expect(document.querySelector('[data-graphics-lost]')).not.toBeNull();
    expect(document.querySelector('[data-graphics-reloading]')).toBeNull();
    expect(sessionStorage.getItem(GRAPHICS_AUTO_RELOAD_STAMP_KEY)).toBeNull();
    release();
    release();                                                          // a second release is a no-op
    expect(graphicsRecoveryNoticeHeld()).toBe(false);
  });

  it('a Forge mount with an explicit graphicsrecovery=reload: the notice still (the Forge is left out whatever the setting)', () => {
    history.replaceState(null, '', '/?graphicsrecovery=reload');
    const release = holdGraphicsRecoveryNotice();
    const rejoin = hold();
    lose(t0);
    expect(rejoin).not.toHaveBeenCalled();
    release();
  });

  it("the hold released (the Forge match closed): the next match's loss reloads again", () => {
    holdGraphicsRecoveryNotice()();
    const rejoin = hold();
    lose(t0);
    expect(rejoin).toHaveBeenCalledTimes(1);
  });
});
