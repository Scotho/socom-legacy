// @vitest-environment jsdom
/**
 * LCM-11b (the LIVE cards plan; LCM.R10, R11, R12 as amended by R13 and R14; product track, OT.R53): the `/leaderboard`
 * page over central's `/api/ladder/leaders`, `/board` and `/find` (LCM-11a, `central/src/leaderboardHttp.ts`), rendered
 * from fixtures with a stub fetch. A browser adaptation: it reads central and changes nothing the game does.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  accText, boardUrl, COLUMN_BOARDS_ADAPTATION, findUrl, hsText, LEADERBOARD_FIRST_ROW_ADAPTATION, LEADERBOARD_PAGE_SIZE_ADAPTATION, leaderboardPage,
  leadersUrl, pageFromForPos, pageStarts, queryOf, stateOf, weaponsUrl, type LeaderboardFetch,
} from '../src/leaderboard/leaderboardPage';

const here = dirname(fileURLToPath(import.meta.url));

interface Row {
  pos: number; name: string; clan: string | null; medal: number | null; score: number; kills: number; deaths: number; kd: number; hsPct: number;
  hitPct: number; plants: number; defuses: number; rescues: number; objectives: number; assists: number; timeSec: number; games: number;
  respawnKills: number; assistGames: number; roundsWon: number | null; roundsLost: number | null;
  topMap?: string | null; topMapName?: string | null; weaponKills?: number; weaponHeadShots?: number;
}

function row(pos: number, name: string, over: Partial<Row> = {}): Row {
  return {
    pos, name, clan: null, medal: 5, score: 2000 - pos * 10, kills: 1000 - pos, deaths: 500, kd: 1.5, hsPct: 40.5, hitPct: 22, plants: 3,
    defuses: 2, rescues: 1, objectives: 6, assists: 9, timeSec: 7_380, games: 50, respawnKills: 4, assistGames: 3, roundsWon: 120,
    roundsLost: 80, ...over,
  };
}

const LEADERS = (period: string) => ({
  period, qualifier: 100,
  boards: {
    score: row(1, 'Ghostline', { score: 1667 }), kills: row(1, 'Ghostline', { kills: 2140 }), kd: row(1, 'Ghostline', { kd: 1.92 }),
    hs: row(1, 'Cinder', { hsPct: 52 }), objectives: row(1, 'Dragnet', { objectives: 161 }),
  },
  top3: [
    { ...row(1, 'Ghostline', { clan: 'NSW', score: 1667, medal: 5 }), topMap: 'MP72', topMapName: 'Invented Crossing' },
    { ...row(2, 'Cinder', { clan: 'RZR', medal: 4 }), topMap: null, topMapName: null },
    { ...row(3, 'Kestrel', { medal: null }), topMap: 'MP2', topMapName: 'Invented Port' },
  ],
});

/** The answers' own build time (LCM-LB: `at`, the data's age the page prints). */
const AT = Date.UTC(2026, 10, 10, 22, 5);
/** LCM-LB: when assists began to be counted (central's `assistsSince`; the live answer's, 2026-11-10 16:48:29Z). */
const ASSISTS_SINCE = Date.UTC(2026, 10, 10, 16, 48, 29);
/** LCM-LB: the first recorded weapon kill (`weaponSince`). */
const WEAPON_SINCE = Date.UTC(2026, 10, 6, 14, 0);
/** LCM-LB: the weapons the stub lists (invented counts; the names as the kill events record them). */
const WEAPONS = [{ weapon: 'M4A1', kills: 1204 }, { weapon: 'SR-25', kills: 300 }];

function board(by: string, period: string, from: number, count: number, total: number, names?: string[], o: { assistsSince?: number | null; weapon?: string } = {}) {
  const n = Math.max(0, Math.min(count, total - from + 1));
  const all = period === 'all';
  return {
    by, period, total, from, qualifier: ['kd', 'hs', 'hit'].includes(by) ? 100 : null, assistsSince: o.assistsSince ?? null, at: AT,
    ...(o.weapon ? { weapon: o.weapon, weaponSince: WEAPON_SINCE } : {}),
    rows: Array.from({ length: n }, (_, i) => row(from + i, names?.[i] ?? `P${from + i}`, {
      clan: (from + i) % 2 ? 'TAG' : null, assistGames: (from + i) % 5 === 0 ? 0 : 3, roundsWon: all ? 120 : null, roundsLost: all ? 80 : null,
      ...(o.weapon ? { weaponKills: 200 - from - i, weaponHeadShots: 50 } : {}),
    })),
  };
}

/** A stub of central: answers each route from the fixtures above and records every URL asked. */
function central(total = 60, opts: { fail?: boolean; find?: Record<string, number>; assistsSince?: number | null } = {}) {
  const asked: string[] = [];
  const fetchJson: LeaderboardFetch = async (url) => {
    asked.push(url);
    if (opts.fail) throw new Error('offline');
    const [path, query = ''] = url.split('?');
    const q = Object.fromEntries(query.split('&').filter(Boolean).map((kv) => kv.split('=').map(decodeURIComponent) as [string, string]));
    if (path === '/api/ladder/leaders') return { status: 200, body: LEADERS(q['period'] ?? 'all') };
    if (path === '/api/ladder/weapons') return { status: 200, body: { period: q['period'] ?? 'all', at: AT, weaponSince: WEAPON_SINCE, weapons: WEAPONS } };
    if (path === '/api/ladder/board') {
      const weapon = q['weapon'];
      // central's LEADERBOARD_WEAPON_PARAM_ADAPTATION: by=kills only, a listed weapon exactly; else 400
      if (weapon !== undefined && (q['by'] !== 'kills' || !WEAPONS.some((w) => w.weapon === weapon))) return { status: 400, body: { error: 'bad request' } };
      return { status: 200, body: board(q['by'] ?? 'score', q['period'] ?? 'all', Number(q['from'] ?? 1), Number(q['count'] ?? 25), total, undefined, { assistsSince: opts.assistsSince ?? null, ...(weapon ? { weapon } : {}) }) };
    }
    if (path === '/api/ladder/find') {
      const pos = opts.find?.[q['name'] ?? ''];
      return pos === undefined ? { status: 404, body: { error: 'not found' } } : { status: 200, body: { pos, from: 1 + 25 * Math.floor((pos - 1) / 25) } };
    }
    return { status: 404, body: null };
  };
  return { asked, fetchJson };
}

async function mount(c: ReturnType<typeof central>): Promise<HTMLElement> {
  const root = leaderboardPage({ fetchJson: c.fetchJson, base: '/' });
  document.body.append(root);
  await vi.waitFor(() => expect(root.querySelector('[data-lb-state="ready"]')).not.toBeNull());
  return root;
}

const text = (el: Element | null | undefined): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const tableNames = (root: HTMLElement): string[] => [...root.querySelectorAll('.lb-table tbody .project-ident-name')].map((n) => text(n));
const lastAsk = (asked: string[], path: string): string => [...asked].reverse().find((u) => u.startsWith(path)) ?? '';

afterEach(() => { document.body.replaceChildren(); window.history.replaceState(null, '', '/'); });   // LCM-16: the page writes its state to the address

describe('LCM-11b: the URLs and the paging (pure)', () => {
  it('builds each route\'s URL as central reads it', () => {
    expect(boardUrl('kills', 'week', 29)).toBe('/api/ladder/board?by=kills&period=week&from=29&count=25');
    expect(boardUrl('score', 'all', 1, 3)).toBe('/api/ladder/board?by=score&period=all&from=1&count=3');
    expect(leadersUrl('day')).toBe('/api/ladder/leaders?period=day');
    expect(findUrl('Ghost Line&x')).toBe('/api/ladder/find?name=Ghost%20Line%26x');
  });

  it('pages of 25 from No. 4: 4, 29, 54 ... and the page holding a position', () => {
    expect(LEADERBOARD_PAGE_SIZE_ADAPTATION).toBe(25);
    expect(LEADERBOARD_FIRST_ROW_ADAPTATION).toBe(4);
    expect(pageStarts(60)).toEqual([4, 29, 54]);
    expect(pageStarts(28)).toEqual([4]);
    expect(pageStarts(3)).toEqual([]);
    for (const [pos, from] of [[1, 4], [3, 4], [4, 4], [28, 4], [29, 29], [53, 29], [54, 54], [312, 304]] as const) expect(pageFromForPos(pos), String(pos)).toBe(from);
  });

  it('every sortable column maps to a board central serves; deaths sorts nothing', () => {
    expect(COLUMN_BOARDS_ADAPTATION).toMatchObject({
      score: 'score', kills: 'kills', kd: 'kd', hsPct: 'hs', hitPct: 'hit', objectives: 'objectives', plants: 'plants', defuses: 'defuses',
      rescues: 'rescues', assists: 'assists', timeSec: 'time', games: 'games', respawnKills: 'respawnKills',
    });
    expect(Object.keys(COLUMN_BOARDS_ADAPTATION)).not.toContain('deaths');
  });

  it('the page has no name helper of its own: every name is the site\'s playerIdent (LCM-16 review fold)', async () => {
    const mod: Record<string, unknown> = await import('../src/leaderboard/leaderboardPage');
    expect(Object.keys(mod)).not.toContain('playerName');
  });
});

describe('LCM-11b: the page from fixtures', () => {
  it('the top 3 as cards: No. 1 on its map\'s still, No. 2 on ink, No. 3 beside; then the table from No. 4', async () => {
    const c = central(60);
    const root = await mount(c);
    expect(c.asked).toContain('/api/ladder/leaders?period=all');
    expect(c.asked).toContain('/api/ladder/board?by=score&period=all&from=4&count=25');
    const cards = [...root.querySelectorAll<HTMLElement>('.lb-card')];
    expect(cards.map((k) => text(k.querySelector('.project-ident-name')))).toEqual(['Ghostline', 'Cinder', 'Kestrel']);
    expect(cards[0]!.classList.contains('lb-card--first')).toBe(true);
    expect(cards[0]!.querySelector<HTMLElement>('.lb-card-img')?.style.backgroundImage).toContain('/api/maps/MP72/still.png');
    expect(cards[1]!.querySelector('.lb-card-img')).toBeNull();
    // identity: the medal left, the clan tag a line above the name
    const ident = cards[0]!.querySelector('.project-ident')!;
    expect(ident.classList.contains('project-ident--lg')).toBe(true);
    expect(ident.querySelector('img')?.getAttribute('src')).toBe('/api/medals/5.png');
    expect(text(ident.querySelector('.project-ident-tag'))).toBe('[NSW]');
    expect(ident.querySelector('.project-ident-tag')!.compareDocumentPosition(ident.querySelector('.project-ident-name')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(cards[2]!.querySelector('.project-ident img')).toBeNull();     // no medal: nothing drawn
    expect(cards[2]!.querySelector('.project-ident-medal')).toBeNull();     // LCM-20: a card fits its medal -- no medal, no slot
    expect(root.querySelector('.lb-table tbody .project-ident-medal')).not.toBeNull();   // a table row keeps its fixed slot
    expect(tableNames(root)[0]).toBe('P4');
    expect(tableNames(root)).toHaveLength(25);
    expect(text(root.querySelector('.lb-count'))).toContain('4–28 of 60');
  });

  it('paging asks the next page from No. 29', async () => {
    const c = central(60);
    const root = await mount(c);
    const next = [...root.querySelectorAll<HTMLButtonElement>('.lb-pager button')].find((b) => text(b) === '2')!;
    next.click();
    await vi.waitFor(() => expect(tableNames(root)[0]).toBe('P29'));
    expect(lastAsk(c.asked, '/api/ladder/board')).toBe('/api/ladder/board?by=score&period=all&from=29&count=25');
    expect(text(root.querySelector('.lb-count'))).toContain('29–53 of 60');
  });

  it('five tabs and the period in one control bar; a tab and a period build the right URLs', async () => {
    const c = central(60);
    const root = await mount(c);
    const bar = root.querySelector('.lb-ctl')!;
    expect(bar.querySelector('nav')).toBeNull();                             // the boards are a group of buttons, not a nav landmark
    expect(bar.querySelector('.lb-boards')?.getAttribute('role')).toBe('group');
    const tabs = [...bar.querySelectorAll<HTMLButtonElement>('.lb-boards button')];
    expect(tabs.every((t) => t.classList.contains('s2u-action'))).toBe(true);
    expect(tabs.map((t) => text(t.querySelector('.lb-l')))).toEqual(['Score', 'Kills', 'K/D', 'Headshot %', 'Objectives']);
    expect(text(tabs[0]!.querySelector('.lb-v'))).toBe('No. 1 Ghostline · 1,667');
    expect(text(tabs[3]!.querySelector('.lb-v'))).toBe('No. 1 Cinder · 52.0%');   // LCM-LB: one decimal on every headshot %
    // LCM-20: the leader on its own line, the value under it (the dot only at phone width, where the line is one)
    expect(text(tabs[0]!.querySelector('.lb-v .lb-v-name'))).toBe('No. 1 Ghostline');
    expect(tabs[0]!.querySelector('.lb-v .lb-v-sep')?.getAttribute('aria-hidden')).toBe('true');
    expect(text(tabs[0]!.querySelector('.lb-v b'))).toBe('1,667');
    expect(tabs[0]!.getAttribute('aria-pressed')).toBe('true');
    const periods = [...bar.querySelectorAll<HTMLButtonElement>('.lb-period button')];
    expect(periods.map((p) => text(p))).toEqual(['All time', 'This week', 'Today']);
    expect(periods.every((p) => p.classList.contains('project-filter'))).toBe(true);   // the house segmented group (filterButtons)
    expect(periods[0]!.getAttribute('aria-pressed')).toBe('true');
    tabs[1]!.click();
    await vi.waitFor(() => expect(lastAsk(c.asked, '/api/ladder/board?by=kills')).not.toBe(''));
    expect(c.asked).toContain('/api/ladder/board?by=kills&period=all&from=4&count=25');
    await vi.waitFor(() => expect(root.querySelector('.lb-boards button[aria-pressed="true"] .lb-l')?.textContent).toBe('Kills'));
    periods[1]!.click();
    await vi.waitFor(() => expect(c.asked).toContain('/api/ladder/board?by=kills&period=week&from=4&count=25'));
    expect(c.asked).toContain('/api/ladder/leaders?period=week');
    await vi.waitFor(() => expect(root.querySelector('.lb-period button[aria-pressed="true"]')?.textContent).toBe('This week'));
  });

  it('LCM-LB: three short sentences under the bar (the last, the header sort, left out at phone width); no "Admiral" and no "Top 3" anywhere', async () => {
    const root = await mount(central(60));
    const note = text(root.querySelector('.lb-ctl-note'));
    expect(note).toBe("Score is the game's own ladder. K/D, headshot % and accuracy need 100 kills in the period. Sort by any column from its header.");
    expect(text(root.querySelector('.lb-ctl-note .lb-ctl-note-sort'))).toBe('Sort by any column from its header.');
    expect(root.textContent).not.toMatch(/admiral/i);
    expect(root.textContent).not.toMatch(/top\s*3/i);
  });

  it('a column sort asks its board (accuracy -> by=hit), marks the column, and lights no tab off the five', async () => {
    const c = central(60);
    const root = await mount(c);
    const sorted = root.querySelector('.lb-table th.lb-sorted');
    expect(sorted?.getAttribute('data-col')).toBe('score');
    expect(sorted?.getAttribute('aria-sort')).toBe('descending');
    const acc = root.querySelector<HTMLButtonElement>('.lb-table th[data-col="hitPct"] button')!;
    acc.click();
    await vi.waitFor(() => expect(c.asked).toContain('/api/ladder/board?by=hit&period=all&from=4&count=25'));
    await vi.waitFor(() => expect(root.querySelector('.lb-table th.lb-sorted')?.getAttribute('data-col')).toBe('hitPct'));
    expect(root.querySelector('.lb-boards button[aria-pressed="true"]')).toBeNull();
    expect(root.querySelectorAll('.lb-table tbody td.lb-sorted').length).toBe(25);
    expect(root.querySelector('.lb-table th[data-col="deaths"] button')).toBeNull();
  });

  it('find computes the page holding the position itself (No. 40 -> from 29) and marks the row', async () => {
    const c = central(60, { find: { P40: 40 } });
    const root = await mount(c);
    const form = root.querySelector<HTMLFormElement>('form.lb-find')!;
    form.querySelector('input')!.value = 'P40';
    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await vi.waitFor(() => expect(tableNames(root)[0]).toBe('P29'));
    expect(c.asked).toContain('/api/ladder/find?name=P40');
    expect(lastAsk(c.asked, '/api/ladder/board')).toBe('/api/ladder/board?by=score&period=all&from=29&count=25');
    expect(text(root.querySelector('.lb-table tr.lb-me .project-ident-name'))).toBe('P40');
    await vi.waitFor(() => expect(document.activeElement).toBe(root.querySelector('.lb-table tr.lb-me a.project-ident-name')));
    expect(text(root.querySelector('.lb-find-msg'))).toBe('P40 is No. 40 on the ladder (score, all time).');   // LCM-LB: where find jumps, said
  });

  it('find: an unknown name says so in plain words', async () => {
    const root = await mount(central(60, { find: {} }));
    const form = root.querySelector<HTMLFormElement>('form.lb-find')!;
    form.querySelector('input')!.value = 'Nobody';
    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await vi.waitFor(() => expect(text(root.querySelector('.lb-find-msg'))).toBe('No ranked player by that name.'));
    expect(root.querySelector<HTMLAnchorElement>('a.lb-find-link')?.getAttribute('href')).toBe('/player/Nobody');
    expect(text(root.querySelector('a.lb-find-link'))).toBe('See Nobody\'s page');
  });

  it('LCM-19: find of "." or ".." (no URL reaches their page, `hasPlayerPage`) says so with no page link', async () => {
    for (const name of ['.', '..']) {
      document.body.replaceChildren();
      const root = await mount(central(60, { find: {} }));
      const form = root.querySelector<HTMLFormElement>('form.lb-find')!;
      form.querySelector('input')!.value = name;
      form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      await vi.waitFor(() => expect(text(root.querySelector('.lb-find-msg'))).toBe('No ranked player by that name.'));
      expect(root.querySelector('.lb-find-link')).toBeNull();
    }
  });

  it('loading, error and empty states have plain copy', async () => {
    const slow = leaderboardPage({ fetchJson: () => new Promise(() => {}), base: '/' });
    expect(text(slow.querySelector('[data-lb-state="loading"]'))).toBe('Loading the leaderboard…');
    const failed = leaderboardPage({ fetchJson: central(60, { fail: true }).fetchJson, base: '/' });
    document.body.append(failed);
    await vi.waitFor(() => expect(text(failed.querySelector('[data-lb-state="error"] p'))).toBe('The leaderboard did not load. Try again in a minute.'));
    document.body.replaceChildren();
    const empty = await mount(central(0));
    expect(text(empty.querySelector('.project-empty h2'))).toBe('No players on this board yet');
    expect(text(empty.querySelector('.project-empty p'))).toBe('Players appear here after their first counted game.');
    expect(empty.querySelectorAll('.lb-card').length).toBe(0);
  });

  it('a board with three players or fewer has the cards and no table past No. 3', async () => {
    const root = await mount(central(3));
    expect(root.querySelectorAll('.lb-card').length).toBe(3);
    expect(text(root.querySelector('.project-empty h2'))).toBe('No players past No. 3 yet');
  });
});

describe('LCM-12: the LCM-11b review\'s follow-ups', () => {
  it('the lede names the game\'s Player Ranking only for Score over all time; another board or period says it is ours', async () => {
    const c = central(60);
    const root = await mount(c);
    expect(text(root.querySelector('.project-lede'))).toMatch(/Player Ranking/);
    root.querySelectorAll<HTMLButtonElement>('.lb-boards button')[1]!.click();
    await vi.waitFor(() => expect(root.querySelector('.lb-boards button[aria-pressed="true"] .lb-l')?.textContent).toBe('Kills'));
    expect(text(root.querySelector('.project-lede'))).not.toMatch(/Player Ranking/);
    expect(text(root.querySelector('.project-lede'))).toMatch(/ours/);
    root.querySelectorAll<HTMLButtonElement>('.lb-boards button')[0]!.click();
    await vi.waitFor(() => expect(text(root.querySelector('.project-lede'))).toMatch(/Player Ranking/));
    root.querySelectorAll<HTMLButtonElement>('.lb-period button')[2]!.click();
    await vi.waitFor(() => expect(root.querySelector('.lb-period button[aria-pressed="true"]')?.textContent).toBe('Today'));
    expect(text(root.querySelector('.project-lede'))).not.toMatch(/Player Ranking/);
    expect(text(root.querySelector('.project-lede'))).toMatch(/ours/);
  });

  it('leaderboard/index.html\'s description names the PLAYER RANKING for score and says the other boards and periods are ours', () => {
    const html = readFileSync(resolve(here, '../leaderboard/index.html'), 'utf8');
    const d = /<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? '';
    expect(d).toMatch(/Player Ranking/);
    expect(d).toMatch(/ours/);
  });

  it('a failed load after a tab or a period click repaints the bar: aria-pressed is the state asked', async () => {
    let fail = false;
    const c = central(60);
    const fetchJson: LeaderboardFetch = (url) => (fail ? Promise.reject(new Error('offline')) : c.fetchJson(url));
    const root = leaderboardPage({ fetchJson, base: '/' });
    document.body.append(root);
    await vi.waitFor(() => expect(root.querySelector('[data-lb-state="ready"]')).not.toBeNull());
    fail = true;
    root.querySelectorAll<HTMLButtonElement>('.lb-boards button')[2]!.click();
    await vi.waitFor(() => expect(root.querySelector('[data-lb-state="error"]')).not.toBeNull());
    expect(root.querySelector('.lb-boards button[aria-pressed="true"] .lb-l')?.textContent).toBe('K/D');
    root.querySelectorAll<HTMLButtonElement>('.lb-period button')[1]!.click();
    await vi.waitFor(() => expect(root.querySelector('.lb-period button[aria-pressed="true"]')?.textContent).toBe('This week'));
    expect(root.querySelector('[data-lb-state="error"]')).not.toBeNull();
  });

  it('a hostile name and clan tag (<b>, &, quotes) are text in a card and in a row', async () => {
    const evil = '<b>Ev&l"\'</b>';
    const c = central(60);
    const fetchJson: LeaderboardFetch = async (url) => {
      const r = await c.fetchJson(url);
      const body = JSON.parse(JSON.stringify(r.body)) as { top3?: Row[]; rows?: Row[] };
      if (body.top3) body.top3[0] = { ...body.top3[0]!, name: evil, clan: '<i>&"' };
      if (body.rows && body.rows[0]?.pos === 4) body.rows[0] = { ...body.rows[0], name: evil, clan: '<i>&"' };
      return { status: r.status, body };
    };
    const root = leaderboardPage({ fetchJson, base: '/' });
    document.body.append(root);
    await vi.waitFor(() => expect(root.querySelector('[data-lb-state="ready"]')).not.toBeNull());
    const card = root.querySelector('.lb-card')!;
    const tr = root.querySelector('.lb-table tbody tr')!;
    for (const el of [card, tr]) {
      expect(text(el.querySelector('.project-ident-name'))).toBe(evil);
      expect(text(el.querySelector('.project-ident-tag'))).toBe('[<i>&"]');
      expect(el.querySelector('.project-ident-name b, .project-ident-tag i')).toBeNull();
    }
    expect(root.querySelector('.lb-table a.project-ident-name')?.getAttribute('href')).toBe(`/player/${encodeURIComponent(evil)}`);
  });

  it('a non-Score board\'s cards are its own Nos. 1-3, each on the still /leaders\' top3 names for that player', async () => {
    const c = central(60);
    const fetchJson: LeaderboardFetch = async (url) => {
      if (url === boardUrl('kills', 'all', 1, 3)) return { status: 200, body: board('kills', 'all', 1, 3, 60, ['Cinder', 'Ghostline', 'Zed']) };
      return c.fetchJson(url);
    };
    const root = leaderboardPage({ fetchJson, base: '/' });
    document.body.append(root);
    await vi.waitFor(() => expect(root.querySelector('[data-lb-state="ready"]')).not.toBeNull());
    root.querySelectorAll<HTMLButtonElement>('.lb-boards button')[1]!.click();
    await vi.waitFor(() => expect(text(root.querySelector('.lb-card .project-ident-name'))).toBe('Cinder'));
    const cards = [...root.querySelectorAll<HTMLElement>('.lb-card')];
    expect(cards.map((k) => text(k.querySelector('.project-ident-name')))).toEqual(['Cinder', 'Ghostline', 'Zed']);
    expect(cards[0]!.querySelector('.lb-card-img')).toBeNull();                                            // Cinder's topMap is null
    expect(cards[1]!.querySelector<HTMLElement>('.lb-card-img')?.style.backgroundImage).toContain('/api/maps/MP72/still.png');   // Ghostline's
    expect(cards[2]!.querySelector('.lb-card-img')).toBeNull();                                            // not in top3: ink
  });
});

describe('LCM-11b: the page\'s document and its phone width', () => {
  it('leaderboard/index.html loads the page module on the design system', () => {
    const html = readFileSync(resolve(here, '../leaderboard/index.html'), 'utf8');
    expect(html).toMatch(/<script type="module" src="\/src\/leaderboard\/main\.ts"><\/script>/);
    expect(html).toMatch(/href="\/src\/ds\/index\.css"/);
    expect(html).toMatch(/name="viewport"/);
  });

  it('the stylesheet folds the cards at 640 px; the table scrolls inside its own panel', () => {
    const css = readFileSync(resolve(here, '../src/leaderboard/leaderboard.css'), 'utf8');
    expect(css).toMatch(/@media \(max-width: 640px\)/);
    const site = readFileSync(resolve(here, '../src/projectSite/site.css'), 'utf8');
    expect(site).toMatch(/\.project-stat-wrap \{[^}]*overflow-x: auto/);
  });

  it('LCM-20: the period has its own row under the five boards at every width; a board\'s leader reads in two lines on desktop, one at phone width', () => {
    const css = readFileSync(resolve(here, '../src/leaderboard/leaderboard.css'), 'utf8');
    const base = css.slice(0, css.indexOf('@media'));
    expect(base).toMatch(/\.lb-ctl \{[^}]*grid-template-columns: minmax\(0, 1fr\);/);
    expect(base).toMatch(/\.lb-period \{[^}]*flex-direction: row/);
    expect(base).toMatch(/\.lb-board \.lb-v \{[^}]*flex-direction: column/);
    expect(base).toMatch(/\.lb-board \.lb-v-sep \{[^}]*display: none/);
    const phone = css.slice(css.indexOf('@media (max-width: 640px)'));
    expect(phone).toMatch(/\.lb-board \.lb-v \{[^}]*display: block/);
    expect(phone).toMatch(/\.lb-board \.lb-v-sep \{[^}]*display: inline/);
    expect(phone).toMatch(/\.lb-period \{[^}]*flex-direction: column/);
  });

  it('the document loads the site css beside its own (the shell\'s rules)', () => {
    expect(readFileSync(resolve(here, '../src/leaderboard/main.ts'), 'utf8')).toMatch(/import '\.\.\/projectSite\/site\.css';/);
  });
});

describe('LCM-16: the page in the project site\'s shell, controls that keep focus, state in the address', () => {
  it('the shell: Leaderboard lit as the page, h1 "Leaderboard", the find box a labelled ds field beside a ds action', async () => {
    const root = await mount(central(60));
    expect(root.classList.contains('project-shell')).toBe(true);
    expect(root.querySelector('.project-nav a[aria-current="page"]')?.textContent).toBe('Leaderboard');
    expect(text(root.querySelector('h1'))).toBe('Leaderboard');
    const field = root.querySelector('form.lb-find .s2u-field')!;
    const input = field.querySelector('input')!;
    expect(field.querySelector(`label[for="${input.id}"]`)?.textContent).toBe('Find a player');
    expect(root.querySelector('form.lb-find button[type="submit"]')?.classList.contains('s2u-action')).toBe(true);
    expect(root.querySelector('.lb-meta')?.textContent).not.toMatch(/Period/);
  });

  it('a board tab keeps focus across the answer: the same button, pressed', async () => {
    const root = await mount(central(60));
    const kills = root.querySelectorAll<HTMLButtonElement>('.lb-boards button')[1]!;
    kills.focus();
    kills.click();
    await vi.waitFor(() => expect(kills.getAttribute('aria-pressed')).toBe('true'));
    expect(kills.isConnected).toBe(true);
    expect(document.activeElement).toBe(kills);
  });

  it('a page button and a column sort keep the keyboard\'s place after the table is drawn again', async () => {
    const root = await mount(central(60));
    const two = root.querySelector<HTMLButtonElement>('.lb-pager button[aria-label="Page 2"]')!;
    two.focus();
    two.click();
    await vi.waitFor(() => expect(tableNames(root)[0]).toBe('P29'));
    expect((document.activeElement as HTMLElement).getAttribute('aria-label')).toBe('Page 2');
    expect(document.activeElement?.getAttribute('aria-current')).toBe('page');
    const kd = root.querySelector<HTMLButtonElement>('.lb-table th[data-col="kd"] button')!;
    kd.focus();
    kd.click();
    await vi.waitFor(() => expect(root.querySelector('.lb-table th.lb-sorted')?.getAttribute('data-col')).toBe('kd'));
    expect(document.activeElement?.closest('th')?.getAttribute('data-col')).toBe('kd');
  });

  it('the sort controls: buttons in the header cells, named by their words alone, the state in aria-sort; the pager\'s buttons named by page', async () => {
    const root = await mount(central(60));
    const score = root.querySelector('.lb-table th[data-col="score"]')!;
    expect(score.getAttribute('aria-sort')).toBe('descending');
    expect(text(score.querySelector('button'))).toBe('Score');
    expect(root.querySelector('.lb-table th[data-col="kills"]')?.hasAttribute('aria-sort')).toBe(false);
    expect([...root.querySelectorAll('.lb-pager button')].every((b) => b.classList.contains('s2u-action'))).toBe(true);
    expect(root.querySelector('.lb-pager')?.tagName).not.toBe('NAV');
  });

  it('the board, period and page are in the address, and read from it at the start', async () => {
    window.history.replaceState(null, '', '/leaderboard?by=kills&period=week&from=29');
    const c = central(60);
    const root = leaderboardPage({ fetchJson: c.fetchJson, base: '/' });
    document.body.append(root);
    await vi.waitFor(() => expect(root.querySelector('[data-lb-state="ready"]')).not.toBeNull());
    expect(c.asked).toContain('/api/ladder/board?by=kills&period=week&from=29&count=25');
    root.querySelectorAll<HTMLButtonElement>('.lb-boards button')[2]!.click();
    await vi.waitFor(() => expect(window.location.search).toBe('?by=kd&period=week'));
    const next = root.querySelector<HTMLButtonElement>('.lb-pager button[aria-label="Page 2"]')!;
    next.click();
    await vi.waitFor(() => expect(window.location.search).toBe('?by=kd&period=week&from=29'));
    window.history.replaceState(null, '', '/');
  });

  it('a bad address falls back to Score, All time, page 1', async () => {
    window.history.replaceState(null, '', '/leaderboard?by=nope&period=%3Cx%3E&from=-3');
    const c = central(60);
    const root = leaderboardPage({ fetchJson: c.fetchJson, base: '/' });
    document.body.append(root);
    await vi.waitFor(() => expect(root.querySelector('[data-lb-state="ready"]')).not.toBeNull());
    expect(c.asked).toContain('/api/ladder/board?by=score&period=all&from=4&count=25');
    window.history.replaceState(null, '', '/');
  });
});

describe('LCM-LB: the leaderboard polish pass (the design review\'s work list; product track)', () => {
  const cols = (root: HTMLElement): string[] => [...root.querySelectorAll('.lb-table thead th[data-col]')].map((th) => th.getAttribute('data-col')!);
  const tier = (root: HTMLElement, col: string): string | null => root.querySelector(`.lb-table thead th[data-col="${col}"]`)?.getAttribute('data-tier') ?? null;
  async function mountAt(search: string, c: ReturnType<typeof central>): Promise<HTMLElement> {
    window.history.replaceState(null, '', `/leaderboard${search}`);
    return mount(c);
  }

  it('the address keeps the weapon on the kills board alone: read, written encoded, dropped elsewhere (pure)', () => {
    expect(stateOf('?by=kills&weapon=M4A1%20Mod%20%26%20x&period=week')).toEqual({ by: 'kills', period: 'week', from: 4, weapon: 'M4A1 Mod & x' });
    expect(stateOf('?by=kd&weapon=M4A1').weapon).toBeNull();
    expect(stateOf('?weapon=M4A1').weapon).toBeNull();
    expect(stateOf('?by=kills&weapon=').weapon).toBeNull();
    expect(queryOf({ by: 'kills', period: 'week', from: 4, weapon: 'SR-25 & co' })).toBe('?by=kills&period=week&weapon=SR-25%20%26%20co');
    expect(queryOf({ by: 'score', period: 'all', from: 4, weapon: 'M4A1' })).toBe('');
    expect(queryOf({ by: 'kills', period: 'all', from: 29, weapon: null })).toBe('?by=kills&from=29');
    expect(boardUrl('kills', 'day', 4, 25, 'SR-25 & co')).toBe('/api/ladder/board?by=kills&period=day&from=4&count=25&weapon=SR-25%20%26%20co');
    expect(weaponsUrl('week')).toBe('/api/ladder/weapons?period=week');
  });

  it('headshot % to one decimal, accuracy whole (pure)', () => {
    expect(hsText(39)).toBe('39.0%');
    expect(hsText(33.6)).toBe('33.6%');
    expect(accText(22.4)).toBe('22%');
    expect(accText(22.5)).toBe('23%');
  });

  it('the table: ten columns at most, each with its tier; the five rarer boards out of it; Rounds on Score over all time', async () => {
    const root = await mount(central(60, { assistsSince: ASSISTS_SINCE }));
    expect(cols(root)).toEqual(['score', 'kills', 'deaths', 'kd', 'hsPct', 'hitPct', 'objectives', 'assists', 'games', 'rounds']);
    expect(['score', 'kd'].map((c) => tier(root, c))).toEqual(['1', '1']);        // on the phone, Score and its partner K/D
    expect(['kills', 'hsPct', 'objectives', 'games'].map((c) => tier(root, c))).toEqual(['2', '2', '2', '2']);
    expect(['deaths', 'hitPct', 'assists', 'rounds'].map((c) => tier(root, c))).toEqual(['3', '3', '3', '3']);
    const first = root.querySelector('.lb-table tbody tr')!;
    expect([...first.querySelectorAll('td[data-tier]')].map((td) => td.getAttribute('data-tier'))).toEqual(['1', '2', '3', '1', '2', '3', '2', '3', '2', '3']);
    expect(text(first.querySelector('td[data-col="rounds"]'))).toBe('120–80');
    expect(root.querySelector('.lb-table-wrap')?.getAttribute('aria-label')).toBe('All players');
    expect(root.querySelector('.lb-table th[data-col="rounds"] button')).toBeNull();     // rounds is no board
  });

  it('a board off the table (Plants) is its last column, tier 1; a week has no Rounds; no assists column before they are counted', async () => {
    const root = await mountAt('?by=plants&period=week', central(60));
    expect(cols(root)).toEqual(['score', 'kills', 'deaths', 'kd', 'hsPct', 'hitPct', 'objectives', 'games', 'plants']);
    expect(tier(root, 'plants')).toBe('1');
    expect(tier(root, 'kd')).toBe('2');                                          // Score's partner only on the Score board
    expect(root.querySelector('.lb-table th[data-col="plants"]')?.getAttribute('aria-sort')).toBe('descending');
  });

  it('Sort by: a labelled ds select of all thirteen boards, at every width; a choice is a new board in the address', async () => {
    const c = central(60, { assistsSince: ASSISTS_SINCE });
    const root = await mount(c);
    const field = root.querySelector('.lb-sort-field')!;
    expect(field.classList.contains('s2u-field')).toBe(true);
    const select = field.querySelector('select')!;
    expect(field.querySelector(`label.s2u-field__label[for="${select.id}"]`)?.textContent).toBe('Sort by');
    expect([...select.options].map((o) => o.textContent)).toEqual(['Score', 'Kills', 'K/D', 'Headshot %', 'Accuracy', 'Objectives', 'Plants', 'Defuses',
      'Rescues', 'Assists (since Nov 10)', 'Time played', 'Games', 'Respawn kills']);
    expect(select.value).toBe('score');
    select.value = 'defuses';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(c.asked).toContain('/api/ladder/board?by=defuses&period=all&from=4&count=25'));
    expect(window.location.search).toBe('?by=defuses');
    expect(select.isConnected).toBe(true);
  });

  it('assists: "since" under the header, a dash with a reason for a player with no counted game since, the lede on its board', async () => {
    const root = await mountAt('?by=assists', central(60, { assistsSince: ASSISTS_SINCE }));
    const th = root.querySelector('.lb-table th[data-col="assists"]')!;
    expect(text(th.querySelector('.lb-th-since'))).toBe('since Nov 10');
    const rows = [...root.querySelectorAll<HTMLTableRowElement>('.lb-table tbody tr')];
    const none = rows.find((tr) => text(tr.querySelector('.project-ident-name')) === 'P5')!.querySelector<HTMLElement>('td[data-col="assists"]')!;
    expect(text(none)).toBe('–');
    expect(none.title).toBe('No games since assists began to be counted (Nov 10, 2026)');
    const some = rows.find((tr) => text(tr.querySelector('.project-ident-name')) === 'P6')!.querySelector<HTMLElement>('td[data-col="assists"]')!;
    expect(text(some)).toBe('9');
    expect(some.title).toBe('9 assists in 3 games since Nov 10');
    expect(text(root.querySelector('.project-lede'))).toBe('Every player by assists since Nov 10, 2026, when assists began to be counted. This board is ours, not the game\'s.');
  });

  it('assists counted from before the period began: no "since" line; no date at all: no assists column', async () => {
    const root = await mountAt('?period=day', central(60, { assistsSince: Date.UTC(2020, 0, 1) }));
    expect(root.querySelector('.lb-table th[data-col="assists"]')).not.toBeNull();
    expect(root.querySelector('.lb-table th[data-col="assists"] .lb-th-since')).toBeNull();
    document.body.replaceChildren();
    const none = await mountAt('', central(60, { assistsSince: null }));
    expect(none.querySelector('.lb-table th[data-col="assists"]')).toBeNull();
  });

  it('the weapon filter: on the kills board only, read cold from the address, its board asked with weapon=, the view its own', async () => {
    const c = central(60);
    const root = await mountAt('?by=kills&weapon=M4A1&period=week', c);
    expect(c.asked).toContain('/api/ladder/weapons?period=week');
    expect(c.asked).toContain('/api/ladder/board?by=kills&period=week&from=4&count=25&weapon=M4A1');
    expect(c.asked).toContain('/api/ladder/board?by=kills&period=week&from=1&count=3&weapon=M4A1');
    const field = root.querySelector<HTMLElement>('.lb-weapon')!;
    expect(field.hidden).toBe(false);
    const select = field.querySelector('select')!;
    expect(field.querySelector(`label[for="${select.id}"]`)?.textContent).toBe('Weapon');
    expect([...select.options].map((o) => o.textContent)).toEqual(['All weapons', 'M4A1 · 1,204', 'SR-25 · 300']);
    expect(select.value).toBe('M4A1');
    expect(cols(root)).toEqual(['weaponKills', 'weaponHeadShots', 'weaponHs', 'kills']);
    const head = root.querySelector('.lb-table th[data-col="weaponKills"]')!;
    expect(head.getAttribute('aria-sort')).toBe('descending');
    expect(text(head)).toBe('M4A1 kills since Nov 6');
    expect(text(root.querySelector('.lb-table tbody td[data-col="weaponHs"]'))).toBe(`${(100 * 50 / 196).toFixed(1)}%`);
    const kpis = [...root.querySelectorAll('.lb-card--first .lb-kpis dt')].map((d) => text(d));
    expect(kpis).toEqual(['M4A1 kills', 'Headshots', 'All kills']);
    // the review fold: a week's all-weapons kills are ours (the period's fold), never called the game's record
    expect(text(root.querySelector('.project-lede'))).toBe('Every player by kills with the M4A1 this week, from recorded matches since Nov 6, 2026, beside their kills with every weapon this week. This board is ours.');
    expect(root.querySelector('.lb-table th[data-col="kills"] abbr')?.getAttribute('title')).toBe('Kills with every weapon this week');
    expect(text(root.querySelector('.lb-boards button[data-tab="kills"] .lb-v-name'))).toBe('No. 1 Ghostline');   // the tab's leader: all weapons
  });

  it('the weapon board over all time: the all-weapons kills are the record\'s, said so in the lede and the Kills column', async () => {
    const root = await mountAt('?by=kills&weapon=M4A1', central(60));
    expect(text(root.querySelector('.project-lede'))).toBe('Every player by kills with the M4A1 over all time, from recorded matches since Nov 6, 2026. All-weapons kills are the game\'s career record. This board is ours.');
    expect(root.querySelector('.lb-table th[data-col="kills"] abbr')?.getAttribute('title')).toBe('Kills with every weapon (the game\'s career record)');
  });

  it('a failed weapons list keeps the address\'s weapon: its board asked anyway, no message, the address left alone', async () => {
    const c = central(60);
    const fetchJson: LeaderboardFetch = (url) => (url.startsWith('/api/ladder/weapons') ? Promise.reject(new Error('offline')) : c.fetchJson(url));
    window.history.replaceState(null, '', '/leaderboard?by=kills&weapon=M4A1');
    const root = leaderboardPage({ fetchJson, base: '/' });
    document.body.append(root);
    await vi.waitFor(() => expect(root.querySelector('[data-lb-state="ready"]')).not.toBeNull());
    expect(c.asked).toContain('/api/ladder/board?by=kills&period=all&from=4&count=25&weapon=M4A1');
    expect(text(root.querySelector('.lb-weapon-msg'))).toBe('');
    expect(window.location.search).toBe('?by=kills&weapon=M4A1');
    expect(cols(root)).toEqual(['weaponKills', 'weaponHeadShots', 'weaponHs', 'kills']);
    expect(root.querySelector<HTMLSelectElement>('.lb-weapon select')!.value).toBe('M4A1');
  });

  it('an older central (no assistGames, roundsWon, roundsLost on a row): Rounds a dash, assists a plain count, never NaN', async () => {
    const c = central(60, { assistsSince: ASSISTS_SINCE });
    const fetchJson: LeaderboardFetch = async (url) => {
      const r = await c.fetchJson(url);
      const b = r.body as { rows?: Record<string, unknown>[] } | null;
      for (const row of b?.rows ?? []) { delete row['assistGames']; delete row['roundsWon']; delete row['roundsLost']; }
      return r;
    };
    const root = leaderboardPage({ fetchJson, base: '/' });
    document.body.append(root);
    await vi.waitFor(() => expect(root.querySelector('[data-lb-state="ready"]')).not.toBeNull());
    expect(root.textContent).not.toContain('NaN');
    const first = root.querySelector('.lb-table tbody tr')!;
    expect(text(first.querySelector('td[data-col="rounds"]'))).toBe('–');
    const assists = first.querySelector<HTMLElement>('td[data-col="assists"]')!;
    expect(text(assists)).toBe('9');
    expect(assists.title).toBe('');
  });

  it('the weapon: a period change keeps it, All weapons drops it, another board drops it; the select only on the kills board', async () => {
    const c = central(60);
    const root = await mountAt('?by=kills&weapon=SR-25', c);
    const select = root.querySelector<HTMLSelectElement>('.lb-weapon select')!;
    root.querySelectorAll<HTMLButtonElement>('.lb-period button')[1]!.click();
    await vi.waitFor(() => expect(window.location.search).toBe('?by=kills&period=week&weapon=SR-25'));
    await vi.waitFor(() => expect(c.asked).toContain('/api/ladder/board?by=kills&period=week&from=4&count=25&weapon=SR-25'));
    select.value = '';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(window.location.search).toBe('?by=kills&period=week'));
    await vi.waitFor(() => expect(cols(root)).toContain('score'));
    select.value = 'M4A1';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(window.location.search).toBe('?by=kills&period=week&weapon=M4A1'));
    root.querySelectorAll<HTMLButtonElement>('.lb-boards button')[2]!.click();
    await vi.waitFor(() => expect(window.location.search).toBe('?by=kd&period=week'));
    expect(root.querySelector<HTMLElement>('.lb-weapon')!.hidden).toBe(true);
  });

  it('an unknown weapon in the address falls back to all weapons, says so, and puts the address right', async () => {
    const c = central(60);
    const root = await mountAt('?by=kills&weapon=Nope', c);
    expect(c.asked.some((u) => u.includes('weapon=Nope'))).toBe(false);
    expect(c.asked).toContain('/api/ladder/board?by=kills&period=all&from=4&count=25');
    expect(text(root.querySelector('.lb-weapon-msg'))).toBe('No kills with that weapon in this period.');
    expect(window.location.search).toBe('?by=kills');
    expect(root.querySelector<HTMLSelectElement>('.lb-weapon select')!.value).toBe('');
  });

  it('the heads: "Ranked players" and the answer\'s own time on Score over all time, "Player ranking" over the table; ours elsewhere', async () => {
    const root = await mount(central(60));
    const figures = [...root.querySelectorAll('.lb-meta .project-figure')].map((f) => text(f));
    expect(figures).toEqual(['60 Ranked players', '5:05 PM ET Updated']);
    expect(text(root.querySelector('.lb-sec .project-section-heading h2'))).toBe('Player ranking');
    expect(root.querySelector('.lb-hero-panel .lb-find')).not.toBeNull();
    root.querySelectorAll<HTMLButtonElement>('.lb-boards button')[1]!.click();
    await vi.waitFor(() => expect(text(root.querySelector('.lb-sec .project-section-heading h2'))).toBe('All players'));
    expect(text(root.querySelector('.lb-meta .project-figure'))).toBe('60 Players on this board');
  });

  it('No. 1\'s card: the rank captioned at its head, its most played map under the name', async () => {
    const root = await mount(central(60));
    const first = root.querySelector('.lb-card--first')!;
    expect(text(first.querySelector('.lb-card-rank'))).toBe('No. 1');
    expect(text(first.querySelector('.lb-card-sub'))).toBe('Most played on Invented Crossing');
    expect(root.querySelectorAll('.lb-card-rank').length).toBe(1);
  });

  it('a non-Score board\'s cards take the board\'s own topMap first', async () => {
    const c = central(60);
    const fetchJson: LeaderboardFetch = async (url) => {
      if (url === boardUrl('kills', 'all', 1, 3)) {
        const b = board('kills', 'all', 1, 3, 60, ['Zed', 'Cinder', 'Ghostline']);
        b.rows[0] = { ...b.rows[0]!, topMap: 'MP51', topMapName: 'Invented Fort' };
        return { status: 200, body: b };
      }
      return c.fetchJson(url);
    };
    window.history.replaceState(null, '', '/leaderboard?by=kills');
    const root = leaderboardPage({ fetchJson, base: '/' });
    document.body.append(root);
    await vi.waitFor(() => expect(root.querySelector('[data-lb-state="ready"]')).not.toBeNull());
    expect(root.querySelector<HTMLElement>('.lb-card--first .lb-card-img')?.style.backgroundImage).toContain('/api/maps/MP51/still.png');
    expect(text(root.querySelector('.lb-card--first .lb-card-sub'))).toBe('Most played on Invented Fort');
  });

  it('the footer names the release the page was built from, not the project record\'s commit', async () => {
    const root = await mount(central(60));
    const fine = text(root.querySelector('.project-footer .project-generated'));
    expect(fine).toMatch(/^Built from release \d+\.\d+\.\d+/);
    expect(fine).not.toMatch(/Project record/);
    expect(root.querySelector('.s2u-action--secondary')).toBeNull();                 // not a ds class
  });

  it('the stylesheet: tiers fold at 1099 and 767 px (and 640 for the phone), the sort mark takes no width, the frame never scrolls up and down', () => {
    const css = readFileSync(resolve(here, '../src/leaderboard/leaderboard.css'), 'utf8');
    expect(css).toMatch(/@media \(max-width: 1099px\) \{[^}]*\.lb-table \[data-tier="3"\] \{ display: none; \}/);
    expect(css).toMatch(/@media \(max-width: 640px\) \{[\s\S]*\.lb-table \[data-tier="2"\], \.lb-table \[data-tier="3"\] \{ display: none; \}/);
    expect(css).toMatch(/@media \(max-width: 767px\) \{[^}]*\.lb-table \[data-tier="2"\] \{ display: none; \}/);
    expect(css).toMatch(/\.lb-sort-mark \{[^}]*position: absolute/);
    expect(css).toMatch(/\.lb-table \.lb-sort \{[^}]*padding-inline: 0/);
    expect(css).toMatch(/\.lb-table-wrap \{[^}]*overflow-y: hidden/);
    expect(css).toMatch(/\.lb-ctl-note-sort \{ display: none; \}/);
  });

  it('LCM-LB (the render fold): a name\'s 44 px hit box and its ring stay inside the row; the identity gives way before the frame scrolls', () => {
    const css = readFileSync(resolve(here, '../src/leaderboard/leaderboard.css'), 'utf8');
    const base = css.slice(0, css.indexOf('@media'));
    // 12 px over the 24 px line, 8 px under it: 44 px, and the site's ring (2 px at 2 px) ends inside the 52 px row
    expect(base).toMatch(/\.lb-table a\.project-ident-name \{ padding-block: var\(--s2u-space-3\) var\(--s2u-space-2\); margin-block: calc\(-1 \* var\(--s2u-space-3\)\) calc\(-1 \* var\(--s2u-space-2\)\); \}/);
    // under a clan tag the line is the identity's foot: the whole hit box rises over the tag, nothing under the line
    expect(base).toMatch(/\.lb-table \.project-ident-tag \+ a\.project-ident-name \{ padding-block: calc\(var\(--s2u-hit-min\) - 1lh\) 0; margin-block: calc\(1lh - var\(--s2u-hit-min\)\) 0; \}/);
    // the identity as wide as its name, between the floor and the site's cap
    expect(base).toMatch(/\.lb-table-wrap \{[^}]*--lb-ident-min: calc\(2 \* var\(--s2u-space-12\)\);/);
    expect(base).toMatch(/\.lb-table \.project-stat-player \.project-ident \{ width: auto; min-width: var\(--lb-ident-min\); max-width: var\(--project-ident-max\); \}/);
    // the site's ring is the one ring here: no offset of the table's own
    expect(css).not.toMatch(/\.lb-table[^{]*\{[^}]*outline-offset/);
  });
});
