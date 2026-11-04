// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { liveReplays } from '../../src/console/adapters/replays';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import type { Adapters } from '../../src/console/state';
import { ReplayListError, replaysOf, type ReplayEntry, type ReplayListSource } from '../../src/modern/replays/data';
import { fakeSession, TICKET } from '../modern/lobbies/fixtures';
import { mountShell } from './shell';

/**
 * The sprint 39 close review's item 1 (RV-4 on the release path): the console's replays list pages past the server's cap
 * (`REPLAYS_LIST_MAX_PLACEHOLDER`, `packages/central/src/replay/http.ts`). The down press on the list's last row, while
 * the answer carried a next cursor (`../../src/modern/replays/data` `nextCursor`), asks the source's `more` for the page
 * after it, appends it (deduped by id) and keeps the focus where it was; the end of the list says the page being read
 * in the Replays section's words ("Loading more") and a failed page in its failure words, the rows kept, the next down
 * press its retry; no cursor, no `more`. Generated values only. A browser adaptation with no original (OT.R28).
 */
let page: ConsolePage | null = null;
beforeEach(() => { vi.useFakeTimers(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; vi.useRealTimers(); });
const flush = async (): Promise<void> => { for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(10); };

/** The `n`th replay (0 the newest): a 16-hex id, a minute older for each. */
const id = (n: number): string => n.toString(16).padStart(16, '0');
const entry = (n: number): Record<string, unknown> => ({
  id: id(n), room: 'MP2/classic', map: 'MP2', rules: 'classic',
  startedAt: new Date(Date.UTC(2026, 9, 1, 12, 0) - n * 60_000).toISOString(), seconds: 60, players: [{ name: 'Alpha', team: 'seal' }],
});
const range = (from: number, to: number): Record<string, unknown>[] => Array.from({ length: to - from }, (_, i) => entry(from + i));
/** The first page: the newest 100 and a cursor; the second: the 101st and (the dedupe) the 100th again. */
const FIRST = { replays: range(0, 100), next: 'c1' };
const SECOND = { replays: [entry(99), entry(100)] };

type Paged = ReplayListSource & { list: ReturnType<typeof vi.fn>; more: ReturnType<typeof vi.fn> };
function paged(first: unknown = FIRST, second: unknown = SECOND): Paged {
  return {
    list: vi.fn(async () => replaysOf(first)),
    more: vi.fn(async () => replaysOf(second)),
  };
}

function boot(source: ReplayListSource) {
  const session = fakeSession('signed-in');
  const replays = liveReplays(() => { page?.render(); }, { source, session });
  const sample = sampleAdapters();
  const A: Adapters = {
    ...sample, data: 'live', states: undefined, replays,
    disc: { ...sample.disc, state: () => 'ready' },
    session: { ...sample.session, signedIn: () => session.state() === 'signed-in' },
  };
  page = bootConsole(document, window, A, { keymap: true });
  return page.ctl;
}

/** Profile (L1 twice, LR.R2), its Replays action, then down to the last row. */
async function toLastRow(ctl: ConsolePage['ctl']): Promise<void> {
  ctl.press('l1');
  ctl.press('l1');
  ctl.press('down');
  await flush();
  ctl.press('cross');
  expect(ctl.S.screen).toBe('replays');
  for (let i = 0; i < 99; i++) ctl.press('down');
  expect(ctl.S.rp.row).toBe(99);
}
const rowIds = (): string[] => [...document.querySelectorAll<HTMLElement>('#stage .cx-room')].map((r) => r.dataset['fk']!.replace('replay-', ''));
const focusedId = (): string | undefined => document.querySelector<HTMLElement>('#stage .cx-room.is-focused')?.dataset['fk']?.replace('replay-', '');
const endRow = (): HTMLElement | null => document.querySelector<HTMLElement>('#stage [data-more]');

describe("the console's replays list pages past the cap (RV-4 on the release path)", () => {
  it('101 entries over two pages: the down press on the last row asks `more` with the cursor; all 101 reached, the 100th not twice', async () => {
    const src = paged();
    const ctl = boot(src);
    await toLastRow(ctl);
    expect(src.more).not.toHaveBeenCalled();                                  // reaching the last row asks nothing
    expect(rowIds()).toHaveLength(100);
    ctl.press('down');
    expect(src.more).toHaveBeenCalledWith(TICKET, 'c1');
    await flush();
    expect(rowIds()).toEqual(Array.from({ length: 101 }, (_, n) => id(n)));  // deduped by id, in the server's order
    expect(focusedId()).toBe(id(99));                                         // the focus kept on its row
    expect(ctl.S.rp.row).toBe(99);
    ctl.press('down');
    expect(focusedId()).toBe(id(100));
    ctl.press('down');                                                        // the last page: no cursor, no `more`
    expect(src.more).toHaveBeenCalledTimes(1);
    expect(endRow()).toBeNull();
    expect(document.querySelector('#stage .cx-rooms__foot')!.textContent).toBe('101 saved · newest first');
  });

  it('while the page is read the list ends in the section\'s loading words; one ask at a time', async () => {
    const src = paged();
    let release!: () => void;
    src.more.mockImplementationOnce(() => new Promise<ReplayEntry[]>((ok) => { release = () => ok(replaysOf(SECOND)); }));
    const ctl = boot(src);
    await toLastRow(ctl);
    ctl.press('down');
    expect(endRow()!.dataset['more']).toBe('loading');
    expect(endRow()!.textContent).toContain('Loading more');
    ctl.press('down');
    expect(src.more).toHaveBeenCalledTimes(1);
    expect(rowIds()).toHaveLength(100);
    release();
    await flush();
    expect(rowIds()).toHaveLength(101);
    expect(endRow()).toBeNull();
  });

  it('a failed page keeps the rows read and says the failure in the section\'s words; the next down press retries', async () => {
    const src = paged();
    src.more.mockImplementationOnce(async () => { throw new ReplayListError('unreachable'); });
    const ctl = boot(src);
    await toLastRow(ctl);
    ctl.press('down');
    await flush();
    expect(rowIds()).toHaveLength(100);
    expect(focusedId()).toBe(id(99));
    const end = endRow()!;
    expect(end.dataset['more']).toBe('failed');
    expect(end.textContent).toContain('Server unreachable');
    expect(end.textContent).toContain('The match server did not answer. Check the connection and try again.');
    expect(end.textContent).toContain('Try again');
    ctl.press('down');
    expect(src.more).toHaveBeenCalledTimes(2);
    expect(src.more).toHaveBeenLastCalledWith(TICKET, 'c1');
    await flush();
    expect(rowIds()).toHaveLength(101);
    expect(focusedId()).toBe(id(99));
  });

  it('MU2-14e: a failed page\'s words are written into the page\'s live region, there before the failure and kept across draws; the end line stays a button with its words', async () => {
    const src = paged();
    src.more.mockImplementationOnce(async () => { throw new ReplayListError('unreachable'); });
    src.more.mockImplementationOnce(async () => { throw new ReplayListError('refused'); });
    const live = document.getElementById('live');
    expect(live, 'the page\'s live region (index.html #live), in the DOM before any failure').not.toBeNull();
    expect(live!.getAttribute('aria-live')).toBe('polite');
    const ctl = boot(src);
    await toLastRow(ctl);
    expect(live!.textContent).not.toContain('Server unreachable');
    ctl.press('down');
    await flush();
    expect(document.getElementById('live'), 'the same region, kept across the draws').toBe(live);
    expect(live!.textContent).toBe('Server unreachable. The match server did not answer. Check the connection and try again.');
    const end = endRow()!;
    expect(end.tagName).toBe('BUTTON');                                      // the end line keeps its role and its words
    expect(end.dataset['act']).toBe('replays-more');
    expect(end.dataset['more']).toBe('failed');
    expect(end.textContent).toContain('Server unreachable');
    expect(end.textContent).toContain('The match server did not answer. Check the connection and try again.');
    expect(end.hasAttribute('aria-live'), 'the words are the live region\'s, not said twice by the button').toBe(false);
    // A draw with nothing new says nothing again; the retry's own failure is said.
    live!.textContent = '';
    page!.render();
    expect(live!.textContent).toBe('');
    ctl.press('down');
    await flush();
    expect(live!.textContent).toBe('The list could not be read. The match server refused the request. Try again.');
    expect(endRow()!.dataset['more']).toBe('failed');
  });

  it('MU2-14e review F1: a page that fails after the player left the list is said when the list is shown again, not lost', async () => {
    const src = paged();
    let fail!: (e: unknown) => void;
    src.more.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }));
    const live = document.getElementById('live')!;
    const ctl = boot(src);
    await toLastRow(ctl);
    ctl.press('down');                                                       // the next page asked, still pending
    await flush();
    ctl.press('circle');                                                     // the player leaves the list
    expect(ctl.S.screen).not.toBe('replays');
    live.textContent = '';
    fail(new ReplayListError('unreachable'));
    await flush();
    page!.render();                                                          // a draw on another screen: nothing said there
    expect(live.textContent).toBe('');
    ctl.press('cross');                                                      // back to the list: the failure is said now
    expect(ctl.S.screen).toBe('replays');
    expect(endRow()!.dataset['more']).toBe('failed');
    expect(live.textContent).toBe('Server unreachable. The match server did not answer. Check the connection and try again.');
    live.textContent = '';
    page!.render();                                                          // and once only
    expect(live.textContent).toBe('');
  });

  it('no cursor: the down press on the last row asks nothing and the list has no end row', async () => {
    const src = paged({ replays: range(0, 100) });
    const ctl = boot(src);
    await toLastRow(ctl);
    expect(endRow()).toBeNull();
    ctl.press('down');
    await flush();
    expect(src.more).not.toHaveBeenCalled();
    expect(ctl.S.rp.row).toBe(99);
  });

  it('touch and mouse (CX.R6, the close round 2): a click on the idle end line asks for the next page once, the focus on the last row', async () => {
    const src = paged();
    const ctl = boot(src);
    ctl.press('l1');
    ctl.press('l1');
    ctl.press('down');
    await flush();
    ctl.press('cross');
    expect(ctl.S.rp.row).toBe(0);
    const end = endRow()!;
    expect(end.tagName).toBe('BUTTON');
    expect(end.getAttribute('type')).toBe('button');
    expect(end.getAttribute('tabindex')).toBe('-1');
    expect(end.dataset['act']).toBe('replays-more');
    expect(end.hasAttribute('data-fk')).toBe(false);                         // never the focus-follow's
    end.click();
    expect(src.more).toHaveBeenCalledTimes(1);
    expect(src.more).toHaveBeenCalledWith(TICKET, 'c1');
    expect(ctl.S.rp.row).toBe(99);
    await flush();
    expect(rowIds()).toHaveLength(101);
    expect(endRow()).toBeNull();
  });

  it('a click on the loading line does nothing; on a failed line it retries', async () => {
    const src = paged();
    let release!: () => void;
    src.more.mockImplementationOnce(() => new Promise<ReplayEntry[]>((_, no) => { release = () => no(new ReplayListError('refused')); }));
    const ctl = boot(src);
    ctl.press('l1');
    ctl.press('l1');
    ctl.press('down');
    await flush();
    ctl.press('cross');
    endRow()!.click();
    expect(endRow()!.dataset['more']).toBe('loading');
    expect(endRow()!.dataset['act']).toBeUndefined();                        // not a control while the page is read
    endRow()!.click();
    expect(src.more).toHaveBeenCalledTimes(1);
    release();
    await flush();
    const failed = endRow()!;
    expect(failed.dataset['more']).toBe('failed');
    expect(failed.textContent).toContain('The list could not be read');
    expect(failed.dataset['act']).toBe('replays-more');
    failed.click();
    expect(src.more).toHaveBeenCalledTimes(2);
    await flush();
    expect(rowIds()).toHaveLength(101);
  });

  it('the close pass 2 (CX.R5): with a next page the count is the loaded rows ("loaded", the Replays section\'s word), on the last page "saved"', async () => {
    const src = paged();
    const ctl = boot(src);
    ctl.press('l1');
    ctl.press('l1');
    ctl.press('down');
    await flush();
    ctl.press('cross');
    const foot = (): string => document.querySelector('#stage .cx-rooms__foot')!.textContent!;
    expect(foot()).toBe('100 loaded · newest first');
    for (let i = 0; i < 100; i++) ctl.press('down');
    await flush();
    expect(endRow()).toBeNull();                                              // the last page read
    expect(foot()).toBe('101 saved · newest first');
    ctl.press('circle');
    expect(document.querySelector('#stage .cx-item.is-focused .cx-item__title')!.textContent).toBe('Replays');
  });

  it('Refresh starts again from the first page; a page answered after it is dropped', async () => {
    const src = paged();
    let release!: () => void;
    src.more.mockImplementationOnce(() => new Promise<ReplayEntry[]>((ok) => { release = () => ok(replaysOf(SECOND)); }));
    const ctl = boot(src);
    await toLastRow(ctl);
    ctl.press('down');
    ctl.press('square');
    await flush();
    release();
    await flush();
    expect(src.list).toHaveBeenCalledTimes(2);
    expect(rowIds()).toHaveLength(100);
    expect(endRow()!.dataset['more']).toBe('idle');
  });
});
