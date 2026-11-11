// @vitest-environment jsdom
import { mapDisplayName } from '@s2u/archive/mapNames';
import { afterEach, describe, expect, it } from 'vitest';
import { LAUNCHER_FIRST, classifyLauncherPath, replayPageOf } from '../../src/console/routes';
import { mountReplayPage, REPLAY_PUBLIC_PAGE_ADAPTATION, type ReplayPageDisc } from '../../src/console/render/replayPublic';
import { publicReplayEntryOf, type ReplayEntry } from '../../src/modern/replays/data';
import type { ReplayStage, ReplayStageContext } from '../../src/modern/replays/stage';

/**
 * LCM-RP (the replay batch's RB-12, Q2, Q8; the LCM plan, LCM.R20 overturned by the owner 2026-11-10; product track,
 * OT.R53): the replay page `/replay/<id>[?match=<matchId>]` -- the launcher's document booted on that replay from central's
 * public entry (`/api/stats/replay/<id>`), in the console's chrome, the map's still behind it; the names and the match's
 * scoreboard always; the world through the existing viewer with the visitor's disc, else the prompt to load it in the
 * world's place (OT.R34); Back to `/watch`; a malformed id Home; an unknown id said plainly. Ids, names and maps invented.
 */

const ID = '00000000000000a1';
const MATCH = 'MP2/classic-3-1762652460000';
const BASE = 'https://socom2legacy.com';

const entry = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: ID, room: 'MP2/classic', map: 'MP2', rules: 'classic', startedAt: '2026-11-09T01:41:00Z', seconds: 754,
  players: [{ name: 'Ghostline', team: 'seals' }, { name: 'Cinder<b>&"', team: 'terrorists' }],
  host: 'A'.repeat(43), mode: 'DEMOLITION', matchId: MATCH, adaptations: ['STATS_REPLAY_ENTRY_ADAPTATION'], ...over,
});
const player = (name: string, side: number, kills: number, deaths: number, score: number): Record<string, unknown> => ({
  name, side, kills, deaths, score, bot: false, joinedInProgress: false, playedMs: 60_000, suicides: 0, teamKills: 0, headShots: 0, hits: 0, shots: 0,
  bombsPlanted: 0, bombsDefused: 0, rescues: 0, roundsWon: 0, roundsLost: 0, assists: 0, damage: 0, medal: 0, tag: '',
});
const matchAnswer = {
  match: { id: MATCH, map: 'MP2', mapName: 'Frostfire', mode: 'DEMOLITION', settings: { respawn: false }, reason: null, live: false, ended: 'complete' },
  players: [player('Ghostline', 0, 14, 5, 42), player('Kestrel', 0, 3, 9, 11), player('Cinder<b>&"', 1, 13, 8, 38)],
  rounds: [{ round: 1, winner: 0, reason: 'detonated', ms: 1 }, { round: 2, winner: 1, reason: 'elimination', ms: 1 }, { round: 3, winner: 0, reason: 'timeout', ms: 1 }],
};

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
function routes(table: Record<string, () => Response>): { fetch: typeof fetch; seen: string[] } {
  const seen: string[] = [];
  const fn = (async (input: RequestInfo | URL) => {
    const url = String(input);
    seen.push(url);
    const a = table[url];
    if (!a) return json(404, { error: 'not found' });
    return a();
  }) as typeof fetch;
  return { fetch: fn, seen };
}
const ENTRY_URL = `${BASE}/api/stats/replay/${ID}?match=${encodeURIComponent(MATCH)}`;
const MATCH_URL = `${BASE}/api/stats/match/${encodeURIComponent(MATCH)}`;

function disc(state: ReturnType<ReplayPageDisc['state']> = 'empty'): ReplayPageDisc & { set(s: ReturnType<ReplayPageDisc['state']>): void; chosen: string[] } {
  let now = state;
  const subs = new Set<() => void>();
  const chosen: string[] = [];
  return {
    chosen,
    state: () => now,
    error: () => (now === 'error' ? 'That file is not a SOCOM II disc.' : ''),
    choose: async () => { chosen.push('image'); return false; },
    chooseFolder: async () => { chosen.push('folder'); return false; },
    onChange(cb) { subs.add(cb); return () => { subs.delete(cb); }; },
    set(s) { now = s; for (const cb of [...subs]) cb(); },
  };
}
function stage(): ReplayStage & { opened: { entry: ReplayEntry; ctx: ReplayStageContext }[] } {
  const opened: { entry: ReplayEntry; ctx: ReplayStageContext }[] = [];
  return { opened, open: (e, c) => { opened.push({ entry: e, ctx: c }); return new Promise(() => {}); } };
}
function frame(): void {
  document.body.innerHTML = `<div class="cx-backdrop" id="backdrop" aria-hidden="true"><img alt="" /><i class="cx-roll"></i></div>
    <div class="cx-app"><header class="cx-header" id="header"></header><main class="cx-stage" id="stage"></main><footer class="cx-legend" id="legend"></footer></div>
    <div id="overlay"></div>`;
}
const settle = async (): Promise<void> => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };
const root = (): HTMLElement => document.querySelector<HTMLElement>('[data-replay-page]')!;
const text = (el: Element | null | undefined): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

afterEach(() => { document.body.replaceChildren(); });

describe('LCM-RP (RB-12): the route', () => {
  it('/replay/<16 hex>[?match=] is the replay page; anything else under /replay/ is malformed; other paths are not it', () => {
    expect(replayPageOf(`/replay/${ID}`, `?match=${encodeURIComponent(MATCH)}`, '/')).toEqual({ kind: 'replay', id: ID, match: MATCH });
    expect(replayPageOf(`/replay/${ID}`, '', '/')).toEqual({ kind: 'replay', id: ID, match: null });
    expect(replayPageOf(`/replay/${ID}`, '?match=', '/')).toEqual({ kind: 'replay', id: ID, match: null });
    expect(replayPageOf(`/replay/${ID}`, `?match=${'x'.repeat(129)}`, '/')).toEqual({ kind: 'replay', id: ID, match: null });
    expect(replayPageOf(`/s2u/replay/${ID}`, '', '/s2u/')).toEqual({ kind: 'replay', id: ID, match: null });
    for (const bad of ['/replay', '/replay/', '/replay/ABCDEF0123456789', '/replay/abc', `/replay/${ID}/x`, '/replay/%zz']) {
      expect(replayPageOf(bad, '', '/'), bad).toEqual({ kind: 'malformed' });
    }
    for (const other of ['/', '/watch', `/replays/${ID}`, `/match/${ID}`, '/online/lobby/x']) expect(replayPageOf(other, '', '/'), other).toBeNull();
  });

  it('the launcher\'s table never writes /replay/ and leaves its address alone (skip), as the server\'s head owns it', () => {
    expect(LAUNCHER_FIRST).not.toContain('replay');
    expect(classifyLauncherPath(`/replay/${ID}`, '/', null)).toBe('skip');
  });

  it('is a named adaptation', () => {
    expect(REPLAY_PUBLIC_PAGE_ADAPTATION).toMatch(/replay/);
  });
});

describe('LCM-RP (RB-6): the public entry as the page reads it', () => {
  it('the listing\'s fields and matchId; a malformed matchId refuses the answer', () => {
    const e = publicReplayEntryOf(entry());
    expect([e.id, e.map, e.host, e.mode, e.matchId]).toEqual([ID, 'MP2', 'A'.repeat(43), 'DEMOLITION', MATCH]);
    expect(publicReplayEntryOf(entry({ matchId: null })).matchId).toBeUndefined();
    for (const bad of [7, '', {}]) expect(() => publicReplayEntryOf(entry({ matchId: bad })), String(bad)).toThrow();
  });
});

describe('LCM-RP (RB-12): the page', () => {
  it('a visitor with no disc: the names, the match\'s scoreboard and the disc prompt in the world\'s place -- no world, no dead panel', async () => {
    frame();
    const r = routes({ [ENTRY_URL]: () => json(200, entry()), [MATCH_URL]: () => json(200, matchAnswer) });
    const s = stage();
    mountReplayPage(document, window, { kind: 'replay', id: ID, match: MATCH }, { base: BASE, fetch: r.fetch, disc: disc(), stage: s, frame: () => {}, navigate: () => {} });
    await settle();
    expect(root().dataset['state']).toBe('ok');
    expect(r.seen).toEqual([ENTRY_URL, MATCH_URL]);
    // the head: the map named (MN-1), never its stem as the title
    expect(text(root().querySelector('.cx-title'))).toBe(mapDisplayName('MP2'));
    expect(mapDisplayName('MP2')).not.toBe('MP2');
    // the scoreboard: both sides, their score, every player with K, D and score; names as text
    const board = root().querySelector('[data-replay-board]')!;
    expect(board.querySelectorAll('.cx-side')).toHaveLength(2);
    expect([...board.querySelectorAll('.cx-side__n')].map((n) => text(n))).toEqual(['2', '1']);
    expect(text(board)).toContain('Ghostline');
    expect(text(board)).toContain('Kestrel');
    expect(text(board)).toContain('Cinder<b>&"');
    expect(board.querySelector('b')).toBeNull();
    expect(text(board.querySelector('[data-player="Ghostline"]'))).toMatch(/14.*5.*42/);
    // the world's place: the prompt to load the disc, with its two choosers; nothing opened
    const world = root().querySelector('[data-replay-world]')!;
    expect(world.querySelector('[data-cx-viewer]')).toBeNull();
    expect(text(world)).toMatch(/Needs disc/);
    expect(world.querySelector('[data-replay-disc="image"]')).not.toBeNull();
    expect(world.querySelector('[data-replay-disc="folder"]')).not.toBeNull();
    expect(s.opened).toHaveLength(0);
    // the background is the map's still (the design's Part 7/8)
    expect(document.querySelector<HTMLImageElement>('#backdrop img')!.getAttribute('src')).toBe(`${BASE}/api/maps/MP2/still.png`);
  });

  it('the prompt\'s choosers ask the disc; once it is ready the existing viewer opens on the entry -- signed out, the match named -- and the scoreboard stays', async () => {
    frame();
    const r = routes({ [ENTRY_URL]: () => json(200, entry()), [MATCH_URL]: () => json(200, matchAnswer) });
    const s = stage();
    const d = disc();
    mountReplayPage(document, window, { kind: 'replay', id: ID, match: MATCH }, { base: BASE, fetch: r.fetch, disc: d, stage: s, frame: () => {}, navigate: () => {} });
    await settle();
    root().querySelector<HTMLButtonElement>('[data-replay-disc="image"]')!.click();
    root().querySelector<HTMLButtonElement>('[data-replay-disc="folder"]')!.click();
    expect(d.chosen).toEqual(['image', 'folder']);
    d.set('reading');
    expect(text(root().querySelector('[data-replay-world]'))).toMatch(/being read/);
    d.set('ready');
    await settle();
    expect(s.opened).toHaveLength(1);
    expect(s.opened[0]!.entry.id).toBe(ID);
    expect(s.opened[0]!.entry.matchId).toBe(MATCH);
    expect(s.opened[0]!.ctx.ticket()).toBeNull();
    expect(s.opened[0]!.ctx.base).toBe(BASE);
    expect(root().querySelector('[data-replay-world] [data-cx-viewer] .cx-replay-host')).not.toBeNull();
    expect(root().querySelector('[data-replay-board]')).not.toBeNull();
  });

  it('a disc already in: the viewer at once; a disc taken out puts the prompt back', async () => {
    frame();
    const r = routes({ [ENTRY_URL]: () => json(200, entry()), [MATCH_URL]: () => json(200, matchAnswer) });
    const s = stage();
    const d = disc('ready');
    mountReplayPage(document, window, { kind: 'replay', id: ID, match: MATCH }, { base: BASE, fetch: r.fetch, disc: d, stage: s, frame: () => {}, navigate: () => {} });
    await settle();
    expect(s.opened).toHaveLength(1);
    d.set('empty');
    expect(root().querySelector('[data-replay-world] [data-cx-viewer]')).toBeNull();
    expect(text(root().querySelector('[data-replay-world]'))).toMatch(/Needs disc/);
  });

  it('a disc the reader refused says the reader\'s words in the prompt', async () => {
    frame();
    const r = routes({ [ENTRY_URL]: () => json(200, entry()), [MATCH_URL]: () => json(200, matchAnswer) });
    mountReplayPage(document, window, { kind: 'replay', id: ID, match: MATCH }, { base: BASE, fetch: r.fetch, disc: disc('error'), stage: stage(), frame: () => {}, navigate: () => {} });
    await settle();
    expect(text(root().querySelector('[data-replay-world]'))).toContain('That file is not a SOCOM II disc.');
  });

  it('no match named: the names from the entry by side, no scoreboard asked', async () => {
    frame();
    const bare = `${BASE}/api/stats/replay/${ID}`;
    const r = routes({ [bare]: () => json(200, entry({ matchId: null, mode: undefined })) });
    mountReplayPage(document, window, { kind: 'replay', id: ID, match: null }, { base: BASE, fetch: r.fetch, disc: disc(), stage: stage(), frame: () => {}, navigate: () => {} });
    await settle();
    expect(r.seen).toEqual([bare]);
    const board = root().querySelector('[data-replay-board]')!;
    expect(text(board)).toContain('Ghostline');
    expect(text(board)).toContain('Cinder<b>&"');
    expect(board.querySelector('.cx-side__n')).toBeNull();
  });

  it('the scoreboard unreadable: the names from the entry all the same (never a dead panel)', async () => {
    frame();
    const r = routes({ [ENTRY_URL]: () => json(200, entry()), [MATCH_URL]: () => json(500, {}) });
    mountReplayPage(document, window, { kind: 'replay', id: ID, match: MATCH }, { base: BASE, fetch: r.fetch, disc: disc(), stage: stage(), frame: () => {}, navigate: () => {} });
    await settle();
    expect(text(root().querySelector('[data-replay-board]'))).toContain('Ghostline');
  });

  it('the render fold: with ?match= known, Back -- the head\'s and the viewer\'s own -- goes to the match\'s page, labelled as the match', async () => {
    frame();
    const went: string[] = [];
    const r = routes({ [ENTRY_URL]: () => json(200, entry()), [MATCH_URL]: () => json(200, matchAnswer) });
    const d = disc();
    mountReplayPage(document, window, { kind: 'replay', id: ID, match: MATCH }, { base: BASE, pageBase: '/', fetch: r.fetch, disc: d, stage: stage(), frame: () => {}, navigate: (h) => { went.push(h); } });
    await settle();
    const head = root().querySelector<HTMLButtonElement>('.cx-screenhead .cx-back')!;
    expect(text(head.querySelector('.cx-back__label'))).toBe('Match');
    expect(head.getAttribute('aria-label')).toBe('Back to Match');
    head.click();
    expect(went).toEqual([`/match/${encodeURIComponent(MATCH)}`]);
    d.set('ready');
    await settle();
    const own = root().querySelector<HTMLButtonElement>('[data-cx-viewer] [data-back]')!;
    expect(text(own.querySelector('.cx-back__label'))).toBe('Match');
    own.click();
    expect(went).toEqual([`/match/${encodeURIComponent(MATCH)}`, `/match/${encodeURIComponent(MATCH)}`]);
  });

  it('the render fold: with no ?match=, Back -- the head\'s and the viewer\'s own -- goes to /watch (the launcher\'s Replays)', async () => {
    frame();
    const went: string[] = [];
    const bare = `${BASE}/api/stats/replay/${ID}`;
    const r = routes({ [bare]: () => json(200, entry({ matchId: null })) });
    const d = disc();
    mountReplayPage(document, window, { kind: 'replay', id: ID, match: null }, { base: BASE, pageBase: '/', fetch: r.fetch, disc: d, stage: stage(), frame: () => {}, navigate: (h) => { went.push(h); } });
    await settle();
    const head = root().querySelector<HTMLButtonElement>('.cx-screenhead .cx-back')!;
    expect(text(head.querySelector('.cx-back__label'))).toBe('Replays');
    head.click();
    expect(went).toEqual(['/watch']);
    d.set('ready');
    await settle();
    const own = root().querySelector<HTMLButtonElement>('[data-cx-viewer] [data-back]')!;
    expect(text(own.querySelector('.cx-back__label'))).toBe('Replays');
    own.click();
    expect(went).toEqual(['/watch', '/watch']);
  });

  it('the render fold: the head says the result as the match page does -- the winner first, each figure in its side\'s colour; none without the match', async () => {
    frame();
    const r = routes({ [ENTRY_URL]: () => json(200, entry()), [MATCH_URL]: () => json(200, matchAnswer) });
    mountReplayPage(document, window, { kind: 'replay', id: ID, match: MATCH }, { base: BASE, fetch: r.fetch, disc: disc(), stage: stage(), frame: () => {}, navigate: () => {} });
    await settle();
    const res = root().querySelector('.cx-screenhead [data-replay-result]')!;
    expect(text(res)).toBe('SEALs win 2–1');
    expect([...res.querySelectorAll('[data-side]')].map((s) => [s.getAttribute('data-side'), text(s)])).toEqual([['0', '2'], ['1', '1']]);

    frame();
    const flipped = { ...matchAnswer, rounds: matchAnswer.rounds.map((x, i) => ({ ...x, winner: i === 2 ? 0 : 1 })) };
    const r2 = routes({ [ENTRY_URL]: () => json(200, entry()), [MATCH_URL]: () => json(200, flipped) });
    mountReplayPage(document, window, { kind: 'replay', id: ID, match: MATCH }, { base: BASE, fetch: r2.fetch, disc: disc(), stage: stage(), frame: () => {}, navigate: () => {} });
    await settle();
    const res2 = root().querySelector('[data-replay-result]')!;
    expect(text(res2)).toBe('Terrorists win 2–1');
    expect([...res2.querySelectorAll('[data-side]')].map((s) => s.getAttribute('data-side'))).toEqual(['1', '0']);

    frame();
    const draw = { ...matchAnswer, rounds: matchAnswer.rounds.slice(0, 2) };
    const r3 = routes({ [ENTRY_URL]: () => json(200, entry()), [MATCH_URL]: () => json(200, draw) });
    mountReplayPage(document, window, { kind: 'replay', id: ID, match: MATCH }, { base: BASE, fetch: r3.fetch, disc: disc(), stage: stage(), frame: () => {}, navigate: () => {} });
    await settle();
    expect(text(root().querySelector('[data-replay-result]'))).toBe('Draw 1–1');

    frame();
    const bare = `${BASE}/api/stats/replay/${ID}`;
    const r4 = routes({ [bare]: () => json(200, entry({ matchId: null })) });
    mountReplayPage(document, window, { kind: 'replay', id: ID, match: null }, { base: BASE, fetch: r4.fetch, disc: disc(), stage: stage(), frame: () => {}, navigate: () => {} });
    await settle();
    expect(root().querySelector('[data-replay-result]')).toBeNull();
  });

  it('the render fold: every player\'s row holds the clan tag, the name and K / D / Score as their own cells, under named columns', async () => {
    frame();
    const tagged = { ...matchAnswer, players: matchAnswer.players.map((p, i) => (i === 1 ? { ...p, tag: 'RZR' } : p)) };
    const r = routes({ [ENTRY_URL]: () => json(200, entry()), [MATCH_URL]: () => json(200, tagged) });
    mountReplayPage(document, window, { kind: 'replay', id: ID, match: MATCH }, { base: BASE, fetch: r.fetch, disc: disc(), stage: stage(), frame: () => {}, navigate: () => {} });
    await settle();
    const board = root().querySelector('[data-replay-board]')!;
    const sides = [...board.querySelectorAll('.cx-side')];
    expect(sides).toHaveLength(2);
    for (const side of sides) expect([...side.querySelectorAll('thead th')].map((th) => text(th))).toEqual(['Player', 'K', 'D', 'Score']);
    const rowOf = (name: string): Element | undefined => [...board.querySelectorAll('[data-player]')].find((x) => x.getAttribute('data-player') === name);
    const cells = (name: string): string[] => [...(rowOf(name)?.querySelectorAll('[data-fig]') ?? [])].map((c) => `${c.getAttribute('data-fig')}=${text(c)}`);
    expect(cells('Ghostline')).toEqual(['k=14', 'd=5', 'score=42']);
    expect(cells('Kestrel')).toEqual(['k=3', 'd=9', 'score=11']);
    expect(cells('Cinder<b>&"')).toEqual(['k=13', 'd=8', 'score=38']);
    expect(text(board.querySelector('[data-player="Kestrel"] [data-tag]'))).toBe('[RZR]');
    expect(board.querySelector('[data-player="Ghostline"] [data-tag]')).toBeNull();
    expect(text(board.querySelector('[data-player="Kestrel"] .cx-player__name'))).toBe('Kestrel');
  });

  it('the render fold: the disc prompt -- a heading, the sentence (your own copy, the disc stays on your device) and the two choosers as buttons', async () => {
    frame();
    const r = routes({ [ENTRY_URL]: () => json(200, entry()), [MATCH_URL]: () => json(200, matchAnswer) });
    mountReplayPage(document, window, { kind: 'replay', id: ID, match: MATCH }, { base: BASE, fetch: r.fetch, disc: disc(), stage: stage(), frame: () => {}, navigate: () => {} });
    await settle();
    const prompt = root().querySelector('[data-replay-world] [data-locked]')!;
    expect(text(prompt.querySelector('h2'))).toMatch(/disc/i);
    const said = text(prompt.querySelector('[data-replay-disc-line]'));
    expect(said).toMatch(/your own copy of SOCOM II/);
    expect(said).toMatch(/stays on your device/);
    expect([...prompt.querySelectorAll('[data-replay-disc]')].map((b) => b.tagName)).toEqual(['BUTTON', 'BUTTON']);
  });

  it('an unknown id says so plainly, with the way back; nothing else is asked', async () => {
    frame();
    const went: string[] = [];
    const r = routes({});
    mountReplayPage(document, window, { kind: 'replay', id: ID, match: MATCH }, { base: BASE, pageBase: '/', fetch: r.fetch, disc: disc(), stage: stage(), frame: () => {}, navigate: (h) => { went.push(h); } });
    await settle();
    expect(root().dataset['state']).toBe('missing');
    expect(text(root())).toMatch(/not found/i);
    expect(r.seen).toEqual([ENTRY_URL]);
    expect(root().querySelector('[data-replay-disc]')).toBeNull();
    root().querySelector<HTMLButtonElement>('.cx-back')!.click();
    expect(went).toEqual([`/match/${encodeURIComponent(MATCH)}`]);   // the render fold: ?match= known, Back is the match's
  });

  it('the review fold: not found with the match known -- a real link in the body to the match\'s page; with none, to the launcher\'s Replays', async () => {
    frame();
    mountReplayPage(document, window, { kind: 'replay', id: ID, match: MATCH }, { base: BASE, pageBase: '/', fetch: routes({}).fetch, disc: disc(), stage: stage(), frame: () => {}, navigate: () => {} });
    await settle();
    const onward = root().querySelector<HTMLAnchorElement>('.cx-rp-body a[data-replay-onward]')!;
    expect(onward).not.toBeNull();
    expect(onward.getAttribute('href')).toBe(`/match/${encodeURIComponent(MATCH)}`);
    expect(text(onward)).toBe('Full match stats');

    frame();
    mountReplayPage(document, window, { kind: 'replay', id: ID, match: null }, { base: BASE, pageBase: '/', fetch: routes({}).fetch, disc: disc(), stage: stage(), frame: () => {}, navigate: () => {} });
    await settle();
    expect(root().dataset['state']).toBe('missing');
    const none = root().querySelector<HTMLAnchorElement>('.cx-rp-body a[data-replay-onward]')!;
    expect(none.getAttribute('href')).toBe('/watch');
    expect(text(none)).toBe('All replays');
  });

  it('a failed read says it could not load (never "not found") and Try again asks again', async () => {
    frame();
    let n = 0;
    const r = routes({ [ENTRY_URL]: () => (n++ === 0 ? json(503, {}) : json(200, entry())), [MATCH_URL]: () => json(200, matchAnswer) });
    mountReplayPage(document, window, { kind: 'replay', id: ID, match: MATCH }, { base: BASE, fetch: r.fetch, disc: disc(), stage: stage(), frame: () => {}, navigate: () => {} });
    await settle();
    expect(root().dataset['state']).toBe('failed');
    expect(text(root())).not.toMatch(/not found/i);
    root().querySelector<HTMLButtonElement>('[data-replay-retry]')!.click();
    await settle();
    expect(root().dataset['state']).toBe('ok');
  });

  it('a malformed id goes Home; nothing is asked', async () => {
    frame();
    const went: string[] = [];
    const r = routes({});
    mountReplayPage(document, window, { kind: 'malformed' }, { base: BASE, pageBase: '/', fetch: r.fetch, disc: disc(), stage: stage(), frame: () => {}, navigate: (h) => { went.push(h); } });
    await settle();
    expect(went).toEqual(['/']);
    expect(r.seen).toEqual([]);
  });

  it('every server string is text, never markup (a name, the map, the rules)', async () => {
    frame();
    const r = routes({ [ENTRY_URL]: () => json(200, entry({ rules: '<i>x</i>' })), [MATCH_URL]: () => json(200, matchAnswer) });
    mountReplayPage(document, window, { kind: 'replay', id: ID, match: MATCH }, { base: BASE, fetch: r.fetch, disc: disc(), stage: stage(), frame: () => {}, navigate: () => {} });
    await settle();
    expect(root().querySelector('i, b')).toBeNull();
    expect(text(root())).toContain('<i>x</i>');
  });
});
