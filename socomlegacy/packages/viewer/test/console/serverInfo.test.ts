// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { serverHtml } from '../../src/console/render/server';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { createState, homeItems, serverItems, type Adapters } from '../../src/console/state';

/**
 * LR-3 (the launcher redesign plan, the row "Online"; LR.R8): Online's Server information in the artifact's drawing
 * (`S2-Launcher-v2.dc.html`, its `serverinfo` panel: info rows with their tones, a section header, then the message) in
 * LR-1's row kinds (`render/rows.ts`) under LR-1's panel head (`render/head.ts`). What it says is the server adapter's
 * (CX.R5): the status, the universe and its users, the players and rooms, the announcement; a row the server does not
 * report (the artifact's game version, patch level, uptime, region) is absent. Refresh and the server's pages (Report a
 * problem, over a game) stay the screen's verbs (`serverItems`, `data-act="svrow"`). A browser adaptation.
 */
type News = NonNullable<Adapters['server']['news']>;
type Reading = ReturnType<News>;
function draw(o: { status?: ReturnType<Adapters['server']['status']>; totals?: { players: number; rooms: number } | null; news?: Reading; pages?: ReturnType<Adapters['server']['pages']>; row?: number } = {}) {
  const A = sampleAdapters();
  A.server = {
    ...A.server,
    status: () => o.status ?? { word: 'ONLINE', ready: true, line: 'Online' },
    totals: () => (o.totals === undefined ? { players: 7, rooms: 3 } : o.totals),
    pages: () => o.pages ?? [],
    ...(o.news ? { news: () => o.news!, loadNews: () => { /* read */ }, universeLine: () => null } : {}),
  };
  const S = createState(A);
  S.screen = 'server';
  S.sv.row = o.row ?? 0;
  const box = document.createElement('div');
  box.innerHTML = serverHtml(S, A);
  return { box, A, S };
}
const OK: Reading = { universe: { kind: 'ok', name: 'US East', users: 12, max: 400, description: '', news: [] }, announcement: { kind: 'ok', text: 'Welcome back, operators.' } };
const infos = (box: HTMLElement): [string, string, string][] => [...box.querySelectorAll('.cx-r--info')].map((r) => [
  r.querySelector('.cx-r__label')!.textContent!, r.querySelector('.cx-r__value')?.textContent ?? '', ['good', 'warn', 'bad'].find((t) => r.classList.contains('is-' + t)) ?? '']);

describe('Online: Server information (LR-3)', () => {
  // LR-37 (6, 7, 9; the owner, 2026-10-29): Browse rooms, Server Information, Sign In (signed in, the account's row there).
  it('the Online list names it Server Information, second; Sign In or Signed in as last', () => {
    const A = sampleAdapters();
    const S = createState(A);
    expect(homeItems('online', S, A).map((x) => x.title)).toEqual(['Browse rooms', 'Server Information', 'Signed in as SPECTER']);
    expect(homeItems('online', S, A)[1]!.act).toBe('server');
    A.session.signedIn = () => false;
    expect(homeItems('online', S, A)[2]!.title).toBe('Sign In');
  });

  it('the panel head: the crumb back to Online, the title, a description; no list item of the old drawing', () => {
    const { box } = draw({ news: OK });
    expect(box.querySelector('h1.cx-title')!.textContent).toBe('Server Information');   // LR-37 (7)
    expect(box.querySelector('.cx-back')!.textContent).toBe('Play online');
    expect(box.querySelector('.cx-screenhead__desc')?.textContent ?? '').not.toBe('');
    expect(box.querySelector('.cx-item')).toBeNull();
    expect(box.querySelector('.cx-rlist[data-scroll]')).not.toBeNull();
  });

  it('the server\'s rows, as it reports them: status (good), universe, users, players, rooms, then the announcement under its header', () => {
    const { box } = draw({ news: OK });
    expect(infos(box)).toEqual([
      ['Status', 'Online', 'good'], ['Universe', 'US East', ''], ['Users', '12/400', ''], ['Players', '7', ''], ['Rooms', '3', ''],
      ['Welcome back, operators.', '', ''],
    ]);
    expect([...box.querySelectorAll('.cx-r--header')].map((h) => h.textContent)).toContain('Announcement');
  });

  it('a row the server does not report is absent: no build, version, patch, uptime or region; no figures before it answers', () => {
    const { box } = draw({ totals: null });
    const labels = infos(box).map((x) => x[0]);
    expect(labels).toEqual(['Status']);                                  // no news adapter (the sample's), no totals
    for (const l of labels) expect(l).not.toMatch(/build|version|patch|uptime|region/i);
    expect(box.querySelectorAll('.cx-r--header')).toHaveLength(0);
  });

  it('the status tones: checking is warn, unavailable is bad; the universe\'s waiting and failure in the news dialog\'s words', () => {
    expect(infos(draw({ status: { word: 'CHECKING', ready: false, line: 'Checking', alert: false } }).box)[0]).toEqual(['Status', 'Checking', 'warn']);
    expect(infos(draw({ status: { word: 'OFFLINE', ready: false, line: 'Offline · Retrying…', alert: true } }).box)[0]).toEqual(['Status', 'Offline · Retrying…', 'bad']);
    const waiting = infos(draw({ news: { universe: { kind: 'waiting' }, announcement: { kind: 'signed-out' } } }).box);
    expect(waiting.find((x) => x[0] === 'Universe')).toEqual(['Universe', 'Reading the universe…', '']);
    expect(waiting.find((x) => x[0] === 'Users')).toBeUndefined();
    expect(waiting.at(-1)).toEqual(['Sign in to read the server\'s announcement.', '', '']);
    const failed = infos(draw({ news: { universe: { kind: 'failed' }, announcement: { kind: 'failed' } } }).box);
    expect(failed.find((x) => x[0] === 'Universe')).toEqual(['Universe', 'The universe did not answer.', 'warn']);
    expect(failed.at(-1)).toEqual(['The announcement did not answer.', '', '']);
  });

  it('the verbs keep serverItems\' order and acts: Refresh an action row, each page a link row; the focus is S.sv.row', () => {
    const pages = [{ icon: 'alert' as const, name: 'Report a problem', sub: 'Tell us what went wrong', verb: 'Report', act: 'report' }];
    const { box, A, S } = draw({ news: OK, pages, row: 1 });
    const verbs = [...box.querySelectorAll<HTMLElement>('[data-act="svrow"]')];
    expect(verbs).toHaveLength(serverItems(A).length);
    expect(verbs.map((v) => v.dataset['i'])).toEqual(['0', '1']);
    expect(verbs[0]!.classList.contains('cx-r--action')).toBe(true);
    expect(verbs[0]!.querySelector('.cx-r__label')!.textContent).toBe('Refresh');
    expect(verbs[1]!.classList.contains('cx-r--link')).toBe(true);
    expect(verbs[1]!.querySelector('.cx-r__label')!.textContent).toBe('Report a problem');
    expect(verbs[1]!.querySelector('.cx-r__hint')!.textContent).toBe('Tell us what went wrong');
    expect(verbs.map((v) => v.classList.contains('is-focused'))).toEqual([false, true]);
    expect(S.sv.row).toBe(1);
    expect(box.querySelectorAll('.is-focused')).toHaveLength(1);
  });
});
