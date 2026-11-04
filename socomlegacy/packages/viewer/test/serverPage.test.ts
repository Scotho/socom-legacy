// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { roadmapPage } from '../src/projectSite/roadmapPage';
import { newsPage } from '../src/projectSite/newsPage';
import { archivePage } from '../src/projectSite/archivePage';
import { fetchServerStatus, formatUptime, renderStatus, serverPage } from '../src/projectSite/serverPage';
import { siteData, type GeneratedData } from '../src/projectSite/generated';

afterEach(() => { document.body.replaceChildren(); });

const data: GeneratedData = {
  commit: 'abc1234',
  sprints: [
    { number: 6, name: 'Foundations', seat: 'the owner', tasks: 16, points: 30, after: '--', online: false, state: 'closed', status: 'closed', source: 'docs/roadmap/SPRINTS.md' },
    { number: 20, name: 'Voice (online track)', seat: 'the owner', tasks: 7, points: 23, after: '9', online: true, state: 'open', status: 'running', source: 'docs/roadmap/SPRINTS.md' },
  ],
  inFlight: [{ title: 'Web sprint 20 -- LANDED', state: 'closed', summary: 'the wire' }],
  plans: [], issues: { included: false, open: [], openCount: 0, closedCount: 0 },
  journey: { start: null, maps: null, checks: null, scores: [], chapters: [], now: { inProgress: [], next: [], inDevelopment: [], source: '' } },
  news: [], milestones: [],
};
const reply = (body: unknown, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(body) });

describe('the server page: status', () => {
  it('down when the fetch fails, answers not-ok, or is not the server\u2019s JSON', async () => {
    expect(await fetchServerStatus(() => Promise.reject(new Error('net')))).toEqual({ state: 'down' });
    expect(await fetchServerStatus(() => reply({}, false))).toEqual({ state: 'down' });
    expect(await fetchServerStatus(() => Promise.resolve({ ok: true, json: () => Promise.reject(new SyntaxError('html')) }))).toEqual({ state: 'down' });
    expect(await fetchServerStatus(() => reply({ hello: 1 }))).toEqual({ state: 'down' });
  });
  it('up with the rooms when both answers have the server\u2019s shape; up without the list when only /rooms fails', async () => {
    const rooms = [{ map: 'MP2', rules: 'classic', players: 3, spectators: 1, round: 2 }];
    const ok = await fetchServerStatus((u) => (u === '/health' ? reply({ ok: true, uptime: 3700 }) : reply(rooms)));
    expect(ok).toEqual({ state: 'up', uptime: 3700, draining: false, rooms });
    const partial = await fetchServerStatus((u) => (u === '/health' ? reply({ ok: true, uptime: 5 }) : Promise.reject(new Error('x'))));
    expect(partial.state).toBe('up'); expect(partial.rooms).toBeUndefined();
  });
  it('malformed /rooms: entries without numeric players and spectators are dropped; a non-array leaves the list out', async () => {
    const good = { map: 'MP2', rules: 'classic', players: 3, spectators: 1, round: 2 };
    const mixed = await fetchServerStatus((u) => (u === '/health' ? reply({ ok: true, uptime: 5 }) : reply([good, { map: 'X' }, null, 'junk', { players: '3', spectators: 0 }])));
    expect(mixed.rooms).toEqual([good]);
    const notList = await fetchServerStatus((u) => (u === '/health' ? reply({ ok: true, uptime: 5 }) : reply({ players: 1 })));
    expect(notList.state).toBe('up'); expect(notList.rooms).toBeUndefined();
    const box = document.createElement('div');
    renderStatus(box, notList);
    expect(box.textContent).not.toContain('NaN');
  });
  it('the unstated sprint state reads No status recorded', () => {
    const road = roadmapPage(undefined, { ...data, sprints: [{ ...data.sprints[0]!, state: 'unstated', status: '' }] });
    expect(road.querySelector('#sprint-6')?.textContent).toContain('No status recorded');
  });
  it('renders the graceful state and the live state as text', () => {
    const box = document.createElement('div');
    renderStatus(box, { state: 'down' });
    expect(box.textContent).toContain('not reachable from this page');
    renderStatus(box, { state: 'up', uptime: 3700, rooms: [{ map: 'MP2', rules: 'classic', players: 3, spectators: 1, round: 2 }] });
    expect(box.dataset['state']).toBe('up');
    expect(box.textContent).toContain('1 room open');
    expect(box.textContent).toContain('MP2');
    expect(formatUptime(3700)).toBe('1 h 1 min');
  });
});

describe('the pages read the generated data', () => {
  it('the server page: the labelled sections, the status box, only the online sprints from the data', async () => {
    document.body.append(serverPage(data, () => Promise.resolve({ state: 'down' })));
    await Promise.resolve(); await Promise.resolve();
    const text = document.body.textContent!;
    for (const h of ['What it is', 'What it serves', 'Status', 'How to play online', 'The online roadmap']) expect(text).toContain(h);
    expect(text).toContain('OT.R27');
    // TS-4: the lobby's voice is push-to-talk (web sprint 20, landed); its text chat is the roadmap's (sprints 10, 22), not claimed.
    expect(text).toContain('push-to-talk');
    expect(text).not.toMatch(/chat and voice/);
    expect(text).toContain('/health (is it up, for how long, and which build)');   // HEALTH-RELEASE: its release and commit
    expect(document.querySelector('.project-server-status')?.textContent).toContain('not reachable from this page');
    expect([...document.querySelectorAll('#online-roadmap tbody tr')].map((r) => r.id)).toEqual(['sprint-20']);
    expect(document.querySelector('.project-nav a[aria-current]')?.textContent).toBe('Server');
  });
  it('every page\u2019s nav links the server page, and its footer names the generated commit', () => {
    for (const page of [newsPage([], data), roadmapPage(undefined, data), archivePage(), serverPage(data, () => new Promise(() => {}))]) {
      expect([...page.querySelectorAll('.project-nav a')].map((a) => a.textContent)).toEqual(['News', 'Roadmap', 'Journey', 'Archive', 'Server', 'Status']);
      expect(page.querySelector('.project-generated')?.textContent).toContain(siteData.commit);
    }
  });
  it('the roadmap renders the sprint list and the issues-absent sentence; the news the in-flight items', () => {
    const road = roadmapPage(undefined, data);
    expect([...road.querySelectorAll('#sprints tbody tr')].map((r) => r.id)).toEqual(['sprint-6', 'sprint-20']);
    expect(road.textContent).toContain('The issue list is not included in this build.');
    const news = newsPage([], data);
    expect(news.querySelector('#in-flight')?.textContent).toContain('Web sprint 20 -- LANDED');
  });
  it('lists open issues when a snapshot was included', () => {
    const withIssues = { ...data, issues: { included: true, openCount: 1, closedCount: 0, open: [{ number: 7, title: 'A <b>bug</b>', labels: ['known-issue'], milestone: 'Web sprint 9' }] } };
    const road = roadmapPage(undefined, withIssues);
    expect(road.textContent).toContain('#7 A <b>bug</b>');
    expect(road.querySelector('li b')).toBeNull();
  });
});
