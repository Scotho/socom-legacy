// @vitest-environment jsdom
/**
 * LCM-16 (the LCM plan, `docs/plans/2026-11-09-live-cards-and-match-pages.md`; LCM.R11, R14, R18 (e); the owner,
 * 2026-11-09: "Take great care in polishing the UI of the pages we're building, they must meet or exceed project
 * standards"): `/match/<id>`, `/leaderboard` and `/player/<name>` are pages of the project site -- one chrome (the
 * shell of `projectSite/components.ts`: the ds emblem, the project nav with Leaderboard, Play, the skip link, the main
 * landmark, the footer), their own documents importing no launcher module, DOM built by `textContent`, one identity
 * block, every state designed. Product track (OT.R53): a browser adaptation, nothing of the game. Names and data invented.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountMatchPage, type MatchPageData, type PageResponse } from '../src/matchPage';
import { mountPlayerPage } from '../src/playerPage';
import { leaderboardPage, type LeaderboardFetch } from '../src/leaderboard/leaderboardPage';
import { playerIdent } from '../src/site/playerLink';

const here = dirname(fileURLToPath(import.meta.url));
const viewer = resolve(here, '..');
const read = (p: string): string => readFileSync(resolve(viewer, p), 'utf8');
const STARTED = Date.UTC(2026, 10, 9, 1, 41);
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const text = (el: Element | null | undefined): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

afterEach(() => { document.body.replaceChildren(); document.title = ''; window.history.replaceState(null, '', '/'); });

const seat = (name: string, side: number, over: Record<string, unknown> = {}) => ({
  name, bot: false, side, joinedInProgress: false, playedMs: 1_860_000, kills: 3, deaths: 2, suicides: 0, teamKills: 0, headShots: 1, hits: 5, shots: 20,
  score: 10, bombsPlanted: 0, bombsDefused: 0, rescues: 0, roundsWon: 2, roundsLost: 1, assists: 0, damage: 0, medal: 3, tag: 'NSW', ...over,
});
const MATCH: MatchPageData = {
  match: {
    id: '41-3-5', map: 'MP2', mapName: 'Frostfire', mode: 'DEMOLITION', settings: { lobbyName: 'Scrims', respawn: false }, startedAt: STARTED,
    endedAt: STARTED + 31 * 60_000, ended: 'complete', counted: true, reason: null, replay: '/replays/abc', assistsTracked: true, live: false, region: 'us-central',
  },
  players: [seat('Ghostline', 0), seat('Cinder', 1, { medal: 0, tag: '' })],
  rounds: [{ round: 1, winner: 0, reason: 'elimination', ms: 120_000 }],
  events: [{ round: 1, seq: 0, tick: 60, kind: 'kill', actor: 'Ghostline', target: 'Cinder', weapon: 'M4A1', part: 'head', how: 'weapon' }],
  awards: { mvp: { name: 'Ghostline', value: 10 }, topFragger: null, sharpshooter: null, mostAssists: null, firstBlood: null, bestRound: null },
};
const ok = (body: unknown): PageResponse => ({ ok: true, status: 200, json: async () => body });

const CAREER = {
  name: 'Ghostline', kills: 10, respawnKills: 0, plants: 0, defuses: 0, rescues: 0, timePlayed: 60, hitPct: 20, kd: 1.5, hsPct: 30, timePlayedText: '1 : 00',
  deaths: 7, games: 3, rating: 1500, clanTag: 'NSW', ladder: { position: 4, total: 10, rating: 1500, medal: 4 },
};
const playerFetch = (career: unknown = CAREER) => async (url: string): Promise<PageResponse> => {
  if (url.includes('/matches')) return ok({ matches: [] });
  if (url.endsWith('/weapons')) return ok({ weapons: [] });
  if (url.endsWith('/maps')) return ok({ maps: [{ map: 'MP2', mapName: 'Frostfire', matches: 2 }] });
  return ok(career);
};

const lbRow = (pos: number, name: string) => ({
  pos, name, clan: pos % 2 ? 'TAG' : null, medal: 5, score: 2000 - pos, kills: 100, deaths: 50, kd: 2, hsPct: 40, hitPct: 20, plants: 1, defuses: 1, rescues: 1,
  objectives: 3, assists: 2, timeSec: 3600, games: 9, respawnKills: 1,
});
const lbFetch: LeaderboardFetch = async (url) => {
  if (url.startsWith('/api/ladder/leaders')) {
    return { status: 200, body: { period: 'all', qualifier: 100, boards: { score: lbRow(1, 'A'), kills: lbRow(1, 'A'), kd: lbRow(1, 'A'), hs: lbRow(1, 'A'), objectives: lbRow(1, 'A') }, top3: [1, 2, 3].map((p) => ({ ...lbRow(p, `P${p}`), topMap: 'MP2' })) } };
  }
  const from = Number(/from=(\d+)/.exec(url)?.[1] ?? 4);
  return { status: 200, body: { by: 'score', period: 'all', total: 30, from, qualifier: null, assistsSince: null, rows: Array.from({ length: Math.min(25, 31 - from) }, (_, i) => lbRow(from + i, `P${from + i}`)) } };
};

async function matchShell(): Promise<HTMLElement> {
  mountMatchPage(document, window, '41-3-5', { fetch: async () => ok(MATCH), setTimer: () => {}, now: () => STARTED });
  await vi.waitFor(() => expect(document.querySelector('[data-state="ready"]')).not.toBeNull());
  return document.querySelector<HTMLElement>('.project-shell')!;
}
async function playerShell(career: unknown = CAREER, name = 'Ghostline'): Promise<HTMLElement> {
  mountPlayerPage(document, window, name, { fetch: playerFetch(career), now: () => STARTED });
  await vi.waitFor(() => expect(document.querySelector('[data-state="ready"]')).not.toBeNull());
  return document.querySelector<HTMLElement>('.project-shell')!;
}
async function boardShell(): Promise<HTMLElement> {
  const root = leaderboardPage({ fetchJson: lbFetch, base: '/' });
  document.body.append(root);
  await vi.waitFor(() => expect(root.querySelector('[data-lb-state="ready"]')).not.toBeNull());
  return root;
}

describe('LCM-16: one chrome -- every page in the project site\'s shell', () => {
  const pages: [string, () => Promise<HTMLElement>, 'page' | 'location'][] = [['match', matchShell, 'location'], ['player', () => playerShell(), 'location'], ['leaderboard', boardShell, 'page']];
  it.each(pages)('%s: the skip link, the header with the emblem, the project nav with Leaderboard lit, Play, main, footer', async (_name, make, current) => {
    const shell = await make();
    expect(shell.classList.contains('project-shell')).toBe(true);
    expect(shell.querySelector('a.s2u-skip')?.getAttribute('href')).toBe('#project-main');
    expect(shell.querySelector('.project-header svg.project-brand-mark')).not.toBeNull();
    const nav = shell.querySelector('nav.project-nav.s2u-navlinks')!;
    const links = [...nav.querySelectorAll<HTMLAnchorElement>('a.s2u-navlinks__link')];
    expect(links.map((a) => a.textContent)).toContain('Leaderboard');
    const lb = links.find((a) => a.textContent === 'Leaderboard')!;
    expect(lb.getAttribute('href')).toBe('/leaderboard');
    expect(lb.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(lb.getAttribute('aria-current')).toBe(current);
    expect(nav.querySelectorAll('[aria-current]')).toHaveLength(1);
    expect(shell.querySelector('.project-header a.project-launcher')?.textContent).toBe('Play');
    const main = shell.querySelector('main#project-main')!;
    expect(main).not.toBeNull();
    expect(shell.querySelectorAll('h1')).toHaveLength(1);
    expect(main.querySelector('h1')).not.toBeNull();
    expect(shell.querySelector('footer.project-footer')?.textContent).toContain('Independent fan project');
    // the breadcrumb: a nav of a list, the last item the page
    const crumbs = main.querySelector('nav.project-crumbs[aria-label="Breadcrumb"] ol')!;
    expect(crumbs).not.toBeNull();
    const items = [...crumbs.querySelectorAll('li')];
    expect(items[0]!.querySelector('a')?.getAttribute('href')).toBe('/');
    expect(items[items.length - 1]!.querySelector('[aria-current="page"]')).not.toBeNull();
    // no private header, no private footer
    expect(shell.querySelector('.lb-hdr, .mp-hdr, .pp-hdr, .lb-footer, .mp-foot, .pp-foot')).toBeNull();
  });

  it('the match page\'s last crumb is the map\'s name, never the id; the player page\'s the player\'s name', async () => {
    const m = await matchShell();
    expect(text(m.querySelector('.project-crumbs li:last-child'))).toBe('Frostfire');
    document.body.replaceChildren();
    const p = await playerShell();
    expect(text(p.querySelector('.project-crumbs li:last-child'))).toBe('Ghostline');
  });

  it('every control is a ds action, a filter button, the skip link, a nav link or a tap-sized link (44 px)', async () => {
    for (const make of [matchShell, () => playerShell(), boardShell]) {
      const shell = await make();
      for (const el of shell.querySelectorAll<HTMLElement>('a[href], button, select, input')) {
        // a name link (`project-ident-name`, `project-name`) reaches 44 px by its hit box (site.css), not by its line
        const okay = el.classList.contains('s2u-action') || el.classList.contains('s2u-skip') || el.classList.contains('project-tap') || el.classList.contains('s2u-navlinks__link')
          || el.classList.contains('project-ident-name') || el.classList.contains('project-name') || el.classList.contains('project-match-row')
          || el.closest('.s2u-field') !== null;
        expect(okay, `<${el.tagName.toLowerCase()} class="${el.className}">${el.textContent}`).toBe(true);
      }
      document.body.replaceChildren();
    }
  });
});

describe('LCM-16: own documents, no launcher module', () => {
  it('match and player each have their own document under the leaderboard section, loading only their entry on the ds', () => {
    for (const [doc, entry, title] of [['leaderboard/match/index.html', 'match', 'Match · SOCOM II Legacy'], ['leaderboard/player/index.html', 'player', 'Player · SOCOM II Legacy']] as const) {
      const html = read(doc);
      expect(html).toContain(`<script type="module" src="/src/${entry}/main.ts"></script>`);
      expect(html).toContain('href="/src/ds/index.css"');
      expect(html).toContain('name="viewport"');
      expect(html).toContain('name="theme-color" content="#000e11"');
      expect(html).toContain(`<title>${title}</title>`);
      expect(html).toContain('<link rel="icon" href="data:," />');
      expect(html).not.toMatch(/console\/main|src\/entry\.ts/);
    }
  });

  it('the three entries import their page module, the site css and nothing else', () => {
    const imports = (src: string): string[] => [...src.matchAll(/^\s*import\s+(?:[^'"]*from\s+)?['"]([^'"]+)['"]/gm)].map((m) => m[1]!);
    expect(imports(read('src/match/main.ts')).sort()).toEqual(['../matchPage', '../projectSite/site.css'].sort());
    expect(imports(read('src/player/main.ts')).sort()).toEqual(['../playerPage', '../projectSite/site.css'].sort());
    expect(imports(read('src/leaderboard/main.ts')).sort()).toEqual(['../projectSite/site.css', './leaderboard.css', './leaderboardPage'].sort());
  });

  it('the page modules import only the shell and the name helper: no console, net, renderer, @s2u/ui index or match module', () => {
    const imports = (src: string): string[] => [...src.matchAll(/^\s*import\s+(?:type\s+)?(?:[^'"]*from\s+)?['"]([^'"]+)['"]/gm)].map((m) => m[1]!);
    const allowed = new Set(['./site/playerLink', './projectSite/components', '../site/playerLink', '../projectSite/components', './matchPage']);
    for (const file of ['src/matchPage.ts', 'src/playerPage.ts', 'src/leaderboard/leaderboardPage.ts']) {
      for (const spec of imports(read(file))) expect(allowed.has(spec), `${file} imports ${spec}`).toBe(true);
    }
  });

  it('console/main.ts no longer boots the match or the player page; the lobby\'s live link stays', () => {
    const src = read('src/console/main.ts');
    expect(src).not.toMatch(/mountMatchPage|mountPlayerPage|playerPage|matchPageIdOf/);
    expect(src).toMatch(/mountLobbyLiveLink/);
  });

  it('no page module draws markup from strings or carries its own stylesheet', () => {
    for (const file of ['src/matchPage.ts', 'src/playerPage.ts', 'src/leaderboard/leaderboardPage.ts']) {
      const src = read(file);
      expect(src, file).not.toMatch(/\.innerHTML\s*=|insertAdjacentHTML|createElement\('style'\)/);
      expect(src, file).not.toMatch(/#[0-9a-f]{6}\b/i);
      expect(src, file).not.toMatch(/_CSS_ADAPTATION/);
    }
  });
});

describe('LCM-16: the identity block', () => {
  it('a fixed medal slot (with or without a medal), the tag in brackets above the name, the name as text with its title', () => {
    const withMedal = playerIdent(document, { name: 'Ghostline', tag: 'NSW', medal: 5 }, 'sm');
    const without = playerIdent(document, { name: 'Cinder', tag: '', medal: 0 }, 'sm');
    for (const id of [withMedal, without]) {
      expect(id.classList.contains('project-ident')).toBe(true);
      expect(id.classList.contains('project-ident--sm')).toBe(true);
      expect(id.firstElementChild?.classList.contains('project-ident-medal')).toBe(true);
    }
    expect(withMedal.querySelector('.project-ident-medal img')?.getAttribute('src')).toBe('/api/medals/5.png');
    expect(withMedal.querySelector('.project-ident-medal img')?.getAttribute('alt')).toBe('');
    expect(without.querySelector('img')).toBeNull();
    expect(text(withMedal.querySelector('.project-ident-tag'))).toBe('[NSW]');
    expect(without.querySelector('.project-ident-tag')).toBeNull();
    expect(withMedal.querySelector('.project-ident-tag')!.compareDocumentPosition(withMedal.querySelector('.project-ident-name')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(withMedal.querySelector('a.project-ident-name')?.getAttribute('href')).toBe('/player/Ghostline');
    expect(withMedal.querySelector('.project-ident-name')?.getAttribute('title')).toBe('Ghostline');
  });

  it('a tag already in brackets is not bracketed twice; a bot\'s name is text, not a link', () => {
    expect(text(playerIdent(document, { name: 'X', tag: '[RZR]', medal: 0 }, 'sm').querySelector('.project-ident-tag'))).toBe('[RZR]');
    const bot = playerIdent(document, { name: 'Rogue Bot', tag: '', medal: 0, bot: true }, 'sm');
    expect(bot.querySelector('a')).toBeNull();
    expect(text(bot.querySelector('.project-ident-name'))).toBe('Rogue Bot');
  });

  it('a medal that fails to load vanishes; its slot stays so the rows still align', () => {
    const id = playerIdent(document, { name: 'Ghostline', tag: '', medal: 2 }, 'md');
    id.querySelector('img')!.dispatchEvent(new Event('error'));
    expect(id.querySelector('img')).toBeNull();
    expect(id.querySelector('.project-ident-medal')).not.toBeNull();
  });

  it('LCM-20: a single identity (an award, a card, a page head) fits its medal -- no medal, no slot; a table row keeps its fixed slot', () => {
    const bare = playerIdent(document, { name: 'Cinder', tag: 'RZR', medal: 0 }, 'sm', { medalSlot: 'fit' });
    expect(bare.querySelector('.project-ident-medal')).toBeNull();
    expect(bare.classList.contains('project-ident--no-medal')).toBe(true);
    expect(bare.firstElementChild?.classList.contains('project-ident-tag')).toBe(true);
    const medalled = playerIdent(document, { name: 'Ghostline', tag: '', medal: 3 }, 'md', { medalSlot: 'fit' });
    expect(medalled.querySelector('.project-ident-medal img')?.getAttribute('src')).toBe('/api/medals/3.png');
    expect(medalled.classList.contains('project-ident--no-medal')).toBe(false);
    // a fitted medal that fails to load takes its slot with it
    medalled.querySelector('img')!.dispatchEvent(new Event('error'));
    expect(medalled.querySelector('.project-ident-medal')).toBeNull();
    expect(medalled.classList.contains('project-ident--no-medal')).toBe(true);
    // the default is the table's fixed slot
    expect(playerIdent(document, { name: 'Cinder', medal: 0 }, 'sm').querySelector('.project-ident-medal')).not.toBeNull();
  });

  it('LCM-20: site.css lays a medal-less identity in one column, the tag and the name on the card\'s left edge', () => {
    const css = read('src/projectSite/site.css');
    expect(css).toMatch(/\.project-ident--no-medal \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
    expect(css).toMatch(/\.project-ident--no-medal :is\(\.project-ident-tag, \.project-ident-name\) \{[^}]*grid-column: 1/);
  });

  it.each([
    ['16 code points', 'ABCDEFGHIJKLMNOP'], ['quotes', 'O\'Neil "Ace"'], ['a script tag', '<script>x</script>'], ['an ampersand', 'Tom & Jerry'],
    ['unicode', 'Ｎａｍｅ✓ßÆ漢字'],
  ])('a hostile or long name (%s) is text, never markup, and carries its whole self in its title', (_label, name) => {
    const id = playerIdent(document, { name, tag: '<b>&', medal: 1 }, 'sm');
    expect(id.querySelector('script, b')).toBeNull();
    expect(text(id.querySelector('.project-ident-name'))).toBe(name.replace(/\s+/g, ' '));
    expect(id.querySelector('.project-ident-name')?.getAttribute('title')).toBe(name);
    expect(text(id.querySelector('.project-ident-tag'))).toBe('[<b>&]');
  });

  it('site.css cuts a long name inside its row (one line, an ellipsis) and draws the medal pixelated at 16, 32 and 48 px', () => {
    const css = read('src/projectSite/site.css');
    expect(css).toMatch(/\.project-ident-name \{[^}]*overflow: hidden;[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap/);
    expect(css).toMatch(/\.project-ident-medal \{[^}]*image-rendering: pixelated|\.project-ident-medal img \{[^}]*image-rendering: pixelated/);
    expect(css).toMatch(/\.project-ident--sm \.project-ident-medal \{[^}]*width: var\(--s2u-icon-16\)/);
    expect(css).toMatch(/\.project-ident--md \.project-ident-medal \{[^}]*width: var\(--s2u-space-8\)/);
    expect(css).toMatch(/\.project-ident--lg \.project-ident-medal \{[^}]*width: var\(--s2u-space-12\)/);
  });
});

describe('LCM-16: images that fail', () => {
  it('the match head\'s map still that fails vanishes (the head draws on ink)', async () => {
    const shell = await matchShell();
    const still = shell.querySelector<HTMLImageElement>('img.project-hero-still')!;
    expect(still.getAttribute('src')).toBe('/api/maps/MP2/still.png');
    expect(still.getAttribute('alt')).toBe('');
    still.dispatchEvent(new Event('error'));
    expect(shell.querySelector('img.project-hero-still')).toBeNull();
  });

  it('a leaderboard medal that fails vanishes, in a card and in a row', async () => {
    const root = await boardShell();
    for (const img of [...root.querySelectorAll<HTMLImageElement>('.project-ident-medal img')]) img.dispatchEvent(new Event('error'));
    expect(root.querySelector('.project-ident-medal img')).toBeNull();
    expect(root.querySelectorAll('.project-ident-medal').length).toBeGreaterThan(3);
  });
});

describe('LCM-16: one title form, "<name> · SOCOM II Legacy"', () => {
  it('the match page: "<Map>: <Side> win <a>–<b> · SOCOM II Legacy", as central\'s head', async () => {
    await matchShell();
    expect(document.title).toBe('Frostfire: SEALs win 1–0 · SOCOM II Legacy');
  });
  it('the player page: "<name> · SOCOM II Legacy"', async () => {
    await playerShell();
    expect(document.title).toBe('Ghostline · SOCOM II Legacy');
  });
});

describe('LCM-16: the site css on ds tokens, the phone width and motion', () => {
  const css = read('src/projectSite/site.css');
  it('the stats pages\' rules hold no literal colour and no --s2u- declaration (projectSiteLook\'s rule, kept)', () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
    expect(css).not.toMatch(/--s2u-[a-z0-9-]+\s*:/);
  });
  it('a stats table: 52 px rows, numbers right-aligned in tabular figures, the player column sticky', () => {
    expect(css).toMatch(/--project-row-h: 52px/);
    expect(css).toMatch(/\.project-stat-table td \{[^}]*text-align: right;[^}]*font-variant-numeric: tabular-nums/);
    expect(css).toMatch(/\.project-stat-table \.project-stat-player \{[^}]*position: sticky;[^}]*left: 0/);
  });
  it('the leaderboard has no second focus ring; the stylesheets fold at the house\'s 900 and 640 px', () => {
    const lb = read('src/leaderboard/leaderboard.css');
    expect(lb).not.toMatch(/outline:/);
    expect(lb).toMatch(/@media \(max-width: 640px\)/);
    expect(css).toMatch(/@media \(max-width: 1024px\)/);
  });
  it('a name link\'s hit box reaches the ds tap size by its padding (a clipped name cannot lend it to a pseudo-element), the row keeping its height', () => {
    expect(css).toMatch(/a:is\(\.project-ident-name, \.project-name\) \{[^}]*padding-block: var\(--s2u-space-3\)/);
    expect(css).toMatch(/a\.project-ident-name \{[^}]*margin-block: calc\(-1 \* var\(--s2u-space-3\)\)/);
  });
  it('the phone nav wraps (seven links) and never scrolls sideways', () => {
    const phone = css.slice(css.indexOf('@media (max-width: 640px)'));
    expect(phone).toMatch(/\.project-nav \{[^}]*flex-wrap: wrap/);
  });
  // LCM-16 review fold: Oswald's own advances (fontkit over shared/fonts/oswald-normal-variable-latin.woff2, weight 400,
  // the narrowest) put the seven-link header at about 1224 px against the 1040 px reading measure (six links: about 1052),
  // so at every width the nav takes its own row under the brand and Play -- never a wrap that drops Play alone.
  it('at every width the nav has its own row under the brand and Play (seven links do not fit the 1040 px measure)', () => {
    const base = css.slice(0, css.indexOf('@media'));
    expect(base).toMatch(/\.project-nav \{[^}]*flex: 1 0 100%;[^}]*order: 3/);
    expect(base).toMatch(/\.project-launcher \{[^}]*margin-left: auto/);
  });
  it('LCM-20: the side name keeps its own case ("SEALs") under every uppercase parent, and no rule uppercases it', () => {
    expect(css).toMatch(/\.project-side-name \{[^}]*text-transform: none/);
    const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (m[1]!.includes('project-side-name')) expect(m[2], m[1]).not.toMatch(/text-transform: uppercase/);
    }
  });
  it('LCM-20: every stats-table header label sits on one line through the middle of the head row (no bottom-aligned plain header beside a sort button)', () => {
    expect(css).toMatch(/\.project-stat-table thead th \{[^}]*vertical-align: middle/);
    expect(css).not.toMatch(/thead th \{[^}]*vertical-align: bottom/);
    const lb = read('src/leaderboard/leaderboard.css');
    expect(lb).not.toMatch(/vertical-align: (bottom|top)/);
    // the sort button centres its label in its tap height; the mark rides the label's baseline beside it
    expect(lb).toMatch(/\.lb-table \.lb-sort \{[^}]*align-items: center/);
    expect(lb).toMatch(/\.lb-sort-mark \{[^}]*display: inline-block/);
  });
  it('LCM-20: at phone width the award cards go two to a row, an odd last card across both', () => {
    const phone = css.slice(css.lastIndexOf('@media (max-width: 640px)'));
    expect(phone).toMatch(/\.project-awards \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
    expect(phone).toMatch(/\.project-award:last-child:nth-child\(odd\) \{[^}]*grid-column: 1 \/ -1/);
  });
  it('LCM-20 (the controller, the shoot): the award cards never leave an orphan -- one row of them all when wide, three to a row below 1024 px; the hero panel apart from the first section', () => {
    expect(css).toMatch(/\.project-awards \{[^}]*grid-template-columns: repeat\(var\(--project-awards-n, 5\), minmax\(0, 1fr\)\)/);
    const mid = css.slice(css.indexOf('@media (max-width: 1024px)'));
    expect(mid).toMatch(/\.project-awards \{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
    expect(css).toMatch(/\.project-hero--still \{[^}]*margin-bottom: var\(--s2u-space-8\)/);
  });
  it('the leaderboard: a board cell never narrower than its longest label; the position column wide enough for its number', () => {
    const lb = read('src/leaderboard/leaderboard.css');
    expect(lb).toMatch(/\.lb-boards \{[^}]*grid-template-columns: repeat\(auto-fit, minmax\(var\(--lb-board-min\), 1fr\)\)/);
    expect(lb).toMatch(/--lb-board-min: calc\(2 \* var\(--s2u-space-12\) \+ 2 \* var\(--s2u-space-4\)\)/);
    expect(lb).toMatch(/--lb-pos-w: calc\(var\(--s2u-space-12\) \+ var\(--s2u-space-6\)\)/);
    expect(lb).toMatch(/\.lb-table \.lb-pos \{[^}]*box-sizing: border-box;[^}]*max-width: var\(--lb-pos-w\)/);
    expect(lb).not.toMatch(/--lb-pos-w: var\(--s2u-space-8\)/);
  });
});
