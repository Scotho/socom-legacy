// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../../src/console/app';
import { liveReplays } from '../../../src/console/adapters/replays';
import { sampleAdapters } from '../../../src/console/sampleAdapters';
import { CATS, type Adapters, type DiscState } from '../../../src/console/state';
import { prompts } from '../../../src/console/render/legend';
import { httpReplaySource } from '../../../src/modern/replays/data';
import { resultWords } from '../../../src/modern/replays/view';
import { BASE, fakeFetch, fakeSession, TICKET } from '../../modern/lobbies/fixtures';
import { mountShell } from '../shell';

/**
 * The console launcher's replays adapter (slice 2, part h): the signed-in account's recorded matches from the match
 * server's `GET /replays` with the session's ticket (`../../src/modern/replays/data` `httpReplaySource`, here over a
 * faked `fetch`), newest first; signed out "Sign in to see your replays"; the three failures in the Replays section's
 * words, each with its retry; the list a pushed screen opened from one item (ActionList README), each row's watch locked
 * "Needs disc" until the disc is in. Generated values only. A browser adaptation with no original (OT.R28).
 */
let page: ConsolePage | null = null;
beforeEach(() => { vi.useFakeTimers(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; vi.useRealTimers(); });
const flush = async (): Promise<void> => { for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(10); };

const entry = (id: string, startedAt: string, map = 'MP2'): Record<string, unknown> => ({
  id, room: `${map}/classic`, map, rules: 'classic', startedAt, seconds: 754, players: [{ name: 'Alpha', team: 'seals' }, { name: 'Bravo', team: null }],
});
const LISTING = { replays: [entry('00000000000000a1', '2026-10-01T10:00:00Z'), entry('00000000000000b2', '2026-10-03T21:30:00Z', 'MP51')] };

function boot(answer: Parameters<typeof fakeFetch>[0][string], o: { signedIn?: boolean; disc?: DiscState } = {}) {
  const f = fakeFetch({ '/replays?mine=1': answer });
  const session = fakeSession(o.signedIn ? 'signed-in' : 'signed-out');
  const replays = liveReplays(() => { page?.render(); }, { source: httpReplaySource(BASE, f.fetch), session });
  const sample = sampleAdapters();
  const disc = o.disc ?? 'ready';
  const A: Adapters = {
    ...sample, data: 'live', states: undefined, replays,
    disc: { ...sample.disc, state: () => disc },
    session: { ...sample.session, signedIn: () => session.state() === 'signed-in' },
  };
  page = bootConsole(document, window, A, { keymap: true });
  openReplays();
  return { f, ctl: page.ctl, session };
}
function openReplays(): void {
  page!.ctl.pointer('cat', { i: String(CATS.findIndex((c) => c.id === 'profile')) });
  page!.ctl.press('down'); page!.ctl.press('cross');
  expect(page!.ctl.S.screen).toBe('replays');
}
const crossLabel = () => prompts(page!.ctl.S, page!.ctl.A).find((p) => p.k === 'cross')?.label;
// LR-11: the Replays screen's status line is an info row (its title the label, its line the hint).
const items = (): { title: string; sub: string }[] => [...document.querySelectorAll('#stage .cx-item, #stage [data-act="replay-status"]')].map((e) => ({
  title: e.querySelector('.cx-item__title, .cx-r__label')!.textContent!, sub: e.querySelector('.cx-item__sub, .cx-r__hint')!.textContent!,
}));

describe('the replays adapter', () => {
  it('signed out: no request; the nested action and legend ask for sign-in', async () => {
    const { f, ctl } = boot({ body: LISTING });
    await flush();
    expect(f.calls).toHaveLength(0);
    expect(items()).toEqual([{ title: 'Sign in to see your replays', sub: 'The matches you played on this server appear here once you are signed in.' }]);
    expect(crossLabel()).toBe('Sign in');
    ctl.press('cross');
    expect(ctl.S.overlay).toBe('signin');
  });

  it('signed in: Profile opens the list with the bearer, newest first and its count', async () => {
    const { f, ctl } = boot({ body: LISTING }, { signedIn: true });
    await flush();
    expect(f.calls[0]).toMatchObject({ method: 'GET', auth: `Bearer ${TICKET}` });
    expect(document.querySelector('#stage .cx-rooms__foot')!.textContent).toContain('2 saved');
    expect(ctl.S.screen).toBe('replays');
    const rows = [...document.querySelectorAll('#stage .cx-room')].map((r) => [...r.children].map((c) => c.textContent!.trim()));
    expect(rows.map((r) => r[0])).toEqual(['Vigilance', 'Frostfire']);
    expect(rows[0]!.slice(1)).toEqual(['classic', '2026-10-03 21:30', '12:34', '2']);
    expect(document.querySelector('#stage .cx-drawer__cta')!.textContent).toContain('Watch');
    ctl.press('circle');
    expect([ctl.S.screen, CATS[ctl.S.cat]!.id, ctl.S.item[ctl.S.cat]]).toEqual(['home', 'profile', 1]);
  });

  it('without the disc each watch is locked: Needs disc', async () => {
    const { ctl } = boot({ body: LISTING }, { signedIn: true, disc: 'empty' });
    await flush();
    expect(document.querySelector('#stage .cx-drawer__cta')!.textContent).toContain('Needs disc');
    ctl.press('cross');
    expect(ctl.S.legendError).toBe('Watching a replay needs your disc: Cross on Play, or the disc mark.');   // LR-24 (was: Home, then Disc)
  });

  it('none recorded: the prototype\'s empty item, its Refresh asking again', async () => {
    const { f, ctl } = boot({ body: { replays: [] } }, { signedIn: true });
    await flush();
    expect(items()[0]!.title).toBe('No replays yet');
    expect(crossLabel()).toBe('Refresh');
    document.querySelector<HTMLElement>('#stage [data-act="replay-status"]')!.click();   // LR-11: the status info row
    await flush();
    expect(f.calls).toHaveLength(2);
    expect(ctl.S.toast).toBe('Replays refreshed. None yet.');
    ctl.press('square'); await flush();
    expect(f.calls).toHaveLength(3);
  });

  it('the failures are the Replays section\'s words, with the retry', async () => {
    for (const [answer, title] of [['reject', 'Server unreachable'], [{ status: 404 }, 'No replays on this server'], [{ status: 500 }, 'The list could not be read']] as const) {
      page?.dispose();
      mountShell(document);
      const { f } = boot(answer, { signedIn: true });
      await flush();
      expect(items()[0]!.title).toBe(title);
      expect(crossLabel()).toBe('Try again');
      page!.ctl.press('cross'); await flush();
      expect(f.calls).toHaveLength(2);
      expect(document.querySelector('#stage [data-act="replay-status"] .cx-r__label')!.textContent).toBe(title);
    }
  });

  it("the review's item 3 (RV-4 on the release path): the drawer says the record's result in resultWords' words; a record without one says none", async () => {
    const result = { round: 1, winner: null, wins: { seal: 0, terrorist: 0 }, matchOver: false };
    const { ctl } = boot({ body: { replays: [{ ...entry('00000000000000a1', '2026-10-01T10:00:00Z'), result }, entry('00000000000000b2', '2026-10-03T21:30:00Z', 'MP51')] } }, { signedIn: true });
    await flush();
    expect(document.querySelector('#stage .cx-drawer [data-field="result"]')).toBeNull();      // b2, newest, no result
    expect(document.querySelector('#stage .cx-drawer .cx-facts')!.textContent).not.toContain('Result');
    ctl.press('down');                                                                          // a1, its result
    const dd = document.querySelector<HTMLElement>('#stage .cx-drawer [data-field="result"]')!;
    expect(dd.textContent).toBe(resultWords(result));
    expect(dd.textContent).toBe('SEALs 0 – 0 Terrorists · Cut short');
    expect(dd.dataset['end']).toBe('cut-short');
    expect(dd.previousElementSibling!.textContent).toBe('Result');
  });

  it('RV-4 on the release path: an answer with `next` pages through the route\'s `?before=` on the down press at the last row', async () => {
    const f = fakeFetch({
      '/replays?mine=1': { body: { replays: [entry('00000000000000b2', '2026-10-03T21:30:00Z', 'MP51')], next: 'c1' } },
      '/replays?mine=1&before=c1': { body: { replays: [entry('00000000000000a1', '2026-10-01T10:00:00Z')] } },
    });
    const session = fakeSession('signed-in');
    const replays = liveReplays(() => { page?.render(); }, { source: httpReplaySource(BASE, f.fetch), session });
    const sample = sampleAdapters();
    page = bootConsole(document, window, { ...sample, data: 'live', states: undefined, replays, session: { ...sample.session, signedIn: () => true } }, { keymap: true });
    openReplays();
    await flush();
    expect(document.querySelector<HTMLElement>('#stage [data-more]')!.textContent).toContain('More matches');
    page.ctl.press('down');
    await flush();
    expect(f.calls.map((c) => c.url)).toEqual([`${BASE}/replays?mine=1`, `${BASE}/replays?mine=1&before=c1`]);
    expect(f.calls[1]).toMatchObject({ method: 'GET', auth: `Bearer ${TICKET}` });
    expect([...document.querySelectorAll('#stage .cx-room .cx-room__name')].map((n) => n.textContent)).toEqual(['Vigilance', 'Frostfire']);
    expect(document.querySelector('#stage [data-more]')).toBeNull();
    expect(page.ctl.S.rp.row).toBe(0);
  });

  it('signing in asks for the list; signing out drops it', async () => {
    const { f, session } = boot({ body: LISTING });
    session.set('signed-in');
    await flush();
    expect(f.calls).toHaveLength(1);
    expect(document.querySelectorAll('#stage .cx-room')).toHaveLength(2);
    session.set('signed-out');
    page!.render();
    expect(items()[0]!.title).toBe('Sign in to see your replays');
  });

  it('loading says it is reading; refresh is reachable without entering a match', async () => {
    const { f, ctl } = boot('hang', { signedIn: true });
    expect(items()[0]!.title).toBe('Reading your replays…');
    expect(crossLabel()).toBe('Refresh');
    f.set('/replays?mine=1', { body: LISTING });
    ctl.press('cross'); await flush();
    expect(document.querySelectorAll('#stage .cx-room')).toHaveLength(2);
  });

  it('the signed-out status button opens sign-in by pointer too', async () => {
    const { ctl, f } = boot({ body: LISTING });
    document.querySelector<HTMLElement>('#stage [data-act="replay-status"]')!.click();   // LR-11: the status info row
    expect(ctl.S.overlay).toBe('signin');
    expect(f.calls).toHaveLength(0);
  });
});
