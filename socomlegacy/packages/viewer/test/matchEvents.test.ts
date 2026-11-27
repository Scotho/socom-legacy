// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  MATCH_EVENT_KIND_WORDS_ADAPTATION, NO_EVENT_FILTER, eventFilterOptions, eventKindOf, eventRowMatches, eventRowsOf, roundClockText,
} from '../src/matchEvents';
import { MATCH_PAGE_TICK_HZ_ADAPTATION, mountMatchPage, type MatchPageData, type PageResponse } from '../src/matchPage';
import { MEGA_MOCK_9_TICK_HZ, megaMock9Match } from '../e2e/megaMock9Fixture';

/**
 * WM-DATA-EV (the owner's approved MEGA-MOCK call 9; a BROWSER ADAPTATION, product track -- the game has no web pages):
 * the match page's EVENTS tab, the page's own default -- four tabs (Overview, Rounds, Events, Weapons), and every
 * recorded event of the match as one list, each row's round clock measured from its round's START when the served round
 * carries `startTick` (central does not serve it yet), else from the round's first event; filtered by round, side,
 * player and kind. Names and data staged.
 */

const HZ = MATCH_PAGE_TICK_HZ_ADAPTATION;
const S = (sec: number): number => sec * HZ;

const player = (name: string, side: number): MatchPageData['players'][number] => ({
  name, bot: false, side, joinedInProgress: false, playedMs: 600_000, kills: 0, deaths: 0, suicides: 0, teamKills: 0, headShots: 0, hits: 0, shots: 0,
  score: 0, bombsPlanted: 0, bombsDefused: 0, rescues: 0, roundsWon: 0, roundsLost: 0, assists: 0, damage: 0, medal: 0, tag: '',
});

function fixture(startTicks = true): MatchPageData {
  const r1 = S(10);
  const r2 = S(400);
  return {
    match: {
      id: 'm-9', map: 'MP2', mapName: 'Frostfire', mode: 'DEMOLITION', settings: { respawn: false }, startedAt: Date.UTC(2026, 10, 14, 1),
      endedAt: Date.UTC(2026, 10, 14, 1, 12), ended: 'complete', counted: true, reason: null, replay: null, assistsTracked: true, live: false, region: null,
    },
    players: [player('Viper', 0), player('Echo', 0), player('Cobra', 1), player('Mako', 1)],
    rounds: [
      { round: 1, winner: 0, reason: 'elimination', ms: 200_000, ...(startTicks ? { startTick: r1 } : {}) },
      { round: 2, winner: 1, reason: 'detonated', ms: 250_000, ...(startTicks ? { startTick: r2 } : {}) },
    ],
    events: [
      // round 2's listed first: rows come out in time order whatever the answer's order
      { round: 2, seq: 3, tick: r2 + S(95), kind: 'planted', actor: 'Cobra', target: null, weapon: null, part: null, how: null },
      { round: 1, seq: 0, tick: r1 + S(41), kind: 'kill', actor: 'Viper', target: 'Cobra', weapon: 'M4A1', part: 'head', how: 'weapon' },
      { round: 1, seq: 1, tick: r1 + S(62), kind: 'kill', actor: 'Mako', target: 'Echo', weapon: 'AK-47', part: 'torso', how: 'weapon' },
      { round: 1, seq: 2, tick: r1 + S(130), kind: 'kill', actor: 'Echo', target: 'Viper', weapon: 'M4A1', part: 'leg', how: 'teamkill' },
      { round: 2, seq: 4, tick: r2 + S(125), kind: 'kill', actor: 'Mako', target: 'Mako', weapon: 'M67', part: 'torso', how: 'weapon' },
    ],
    awards: { mvp: null, topFragger: null, sharpshooter: null, mostAssists: null, firstBlood: null, bestRound: null },
  };
}

afterEach(() => { document.body.replaceChildren(); document.title = ''; });

describe('WM-DATA-EV: the event rows', () => {
  it('rows in time order, each clock measured from its round\'s START (startTick), m:ss', () => {
    const rows = eventRowsOf(fixture(), HZ);
    expect(rows.map((r) => [r.round, roundClockText(r)])).toEqual([[1, '0:41'], [1, '1:02'], [1, '2:10'], [2, '1:35'], [2, '2:05']]);
    expect(rows.every((r) => r.fromStart)).toBe(true);
  });

  it('a round with no startTick falls back to today\'s offset from its first event, marked "+"', () => {
    const rows = eventRowsOf(fixture(false), HZ);
    expect(rows.map((r) => roundClockText(r))).toEqual(['+0:00', '+0:21', '+1:29', '+0:00', '+0:30']);
    expect(rows.some((r) => r.fromStart)).toBe(false);
  });

  it('an event before its round\'s start reads 0:00, never negative', () => {
    const d = fixture();
    d.events[1]!.tick = 0;
    expect(roundClockText(eventRowsOf(d, HZ)[0]!)).toBe('0:00');
  });

  it('the kind: a kill, a team kill, a suicide, an objective as recorded; each worded', () => {
    const rows = eventRowsOf(fixture(), HZ);
    expect(rows.map((r) => r.kind)).toEqual(['kill', 'kill', 'teamkill', 'planted', 'suicide']);
    expect(eventKindOf({ kind: 'kill', actor: null, target: 'Viper', how: 'fall' })).toBe('kill');
    for (const k of ['kill', 'teamkill', 'suicide', 'planted', 'defused', 'detonated', 'rescued', 'hostageKilled', 'extracted']) {
      expect(MATCH_EVENT_KIND_WORDS_ADAPTATION[k], k).toBeTruthy();
    }
  });

  it('the side is the actor\'s (the target\'s when no one acted); the players are both', () => {
    const rows = eventRowsOf(fixture(), HZ);
    expect(rows.map((r) => r.side)).toEqual([0, 1, 0, 1, 1]);
    expect(rows[0]!.players).toEqual(['Viper', 'Cobra']);
    expect(rows[4]!.players).toEqual(['Mako']);
    const d = fixture();
    d.events.push({ round: 2, seq: 5, tick: S(600), kind: 'kill', actor: null, target: 'Echo', weapon: null, part: null, how: 'fall' });
    expect(eventRowsOf(d, HZ).at(-1)!.side).toBe(0);
  });

  it('the filters: none shows all; each of round, side, player (actor or target) and kind narrows; they combine', () => {
    const rows = eventRowsOf(fixture(), HZ);
    const shown = (f: Partial<typeof NO_EVENT_FILTER>): number[] => rows.filter((r) => eventRowMatches(r, { ...NO_EVENT_FILTER, ...f })).map((r) => r.seq);
    expect(shown({})).toEqual([0, 1, 2, 3, 4]);
    expect(shown({ round: 2 })).toEqual([3, 4]);
    expect(shown({ side: 0 })).toEqual([0, 2]);
    expect(shown({ player: 'Viper' })).toEqual([0, 2]);
    expect(shown({ player: 'Cobra' })).toEqual([0, 3]);
    expect(shown({ kind: 'kill' })).toEqual([0, 1]);
    expect(shown({ round: 1, player: 'Echo' })).toEqual([1, 2]);
    expect(shown({ round: 1, side: 1, kind: 'kill' })).toEqual([1]);
    expect(shown({ round: 2, kind: 'teamkill' })).toEqual([]);
  });

  it('the chips offered: the rounds, the sides and the kinds present, every player on a side, in order', () => {
    const o = eventFilterOptions(fixture(), eventRowsOf(fixture(), HZ));
    expect(o.rounds).toEqual([1, 2]);
    expect(o.sides).toEqual([0, 1]);
    expect(o.players).toEqual(['Viper', 'Echo', 'Cobra', 'Mako']);
    expect(o.kinds).toEqual(['kill', 'teamkill', 'suicide', 'planted']);
  });
});

const answer = (d: unknown): PageResponse => ({ ok: true, status: 200, json: async () => d });
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
async function mount(d: MatchPageData): Promise<HTMLElement> {
  mountMatchPage(document, window, 'm-9', { fetch: async () => answer(d), setTimer: () => {}, now: () => d.match.startedAt + 86_400_000 });
  await tick(); await tick();
  return document.body;
}
const text = (el: Element | null | undefined): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const visibleRows = (el: HTMLElement): string[] => [...el.querySelectorAll<HTMLElement>('.project-match-events .project-feed li')].filter((li) => !li.hidden).map((li) => text(li));

describe('WM-DATA-EV: the page', () => {
  it('the page\'s default (no look switch, no query): four tabs, Overview open; Events opens on a click and lists every event with its round and clock', async () => {
    const el = await mount(fixture());
    const tabs = [...el.querySelectorAll<HTMLButtonElement>('[role="tablist"] [role="tab"]')];
    expect(tabs.map((t) => t.textContent)).toEqual(['Overview', 'Rounds', 'Events', 'Weapons']);
    const panel = (k: string): HTMLElement => el.querySelector<HTMLElement>(`[role="tabpanel"][data-tab="${k}"]`)!;
    expect(panel('overview').hidden).toBe(false);
    expect(panel('events').hidden).toBe(true);
    expect(panel('overview').querySelector('.project-match-board')).not.toBeNull();
    expect(panel('rounds').querySelector('.project-match-rounds')).not.toBeNull();
    expect(panel('weapons').querySelector('.project-match-weapons-section')).not.toBeNull();
    expect(el.querySelector('.project-match-feed')).toBeNull();                       // the events list replaces the kill feed
    tabs[2]!.click();
    expect(panel('events').hidden).toBe(false);
    expect(panel('overview').hidden).toBe(true);
    expect(tabs[2]!.getAttribute('aria-selected')).toBe('true');
    expect(tabs[2]!.classList.contains('is-on')).toBe(true);
    const rows = visibleRows(el);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatch(/^R1 0:41 Viper ─ M4A1 ─▶ killed Cobra Head shot$/);
    expect(rows[2]).toMatch(/^R1 2:10 Echo .*Viper Team kill$/);
    expect(rows[3]).toMatch(/^R2 1:35 Cobra Planted$/);
    expect(text(el.querySelector('.project-match-events-count'))).toBe('5 of 5 events');
  });

  it('a chip filters the rows and lights itself; All clears its group', async () => {
    const el = await mount(fixture());
    const chip = (group: string, value: string): HTMLButtonElement => el.querySelector<HTMLButtonElement>(`button[data-filter="${group}"][data-value="${value}"]`)!;
    expect(chip('round', '').getAttribute('aria-pressed')).toBe('true');
    chip('round', '1').click();
    expect(chip('round', '1').getAttribute('aria-pressed')).toBe('true');
    expect(chip('round', '').getAttribute('aria-pressed')).toBe('false');
    expect(visibleRows(el)).toHaveLength(3);
    chip('player', 'Viper').click();
    expect(visibleRows(el)).toHaveLength(2);
    chip('kind', 'teamkill').click();
    expect(visibleRows(el)).toHaveLength(1);
    expect(text(el.querySelector('.project-match-events-count'))).toBe('1 of 5 events');
    chip('round', '').click(); chip('player', '').click(); chip('kind', '').click();
    chip('side', '1').click();
    expect(visibleRows(el)).toHaveLength(3);
    expect(chip('side', '1').textContent).toBe('Terrorists');
  });

  it('a served damage event (none served today) gets its DMG chip and its row\'s word (the controller\'s ruling: one word, DMG, for damage in visible text) -- never the raw kind', async () => {
    const d = fixture();
    const r1 = d.rounds[0]!.startTick!;
    d.events.push({ round: 1, seq: 5, tick: r1 + S(50), kind: 'damage', actor: 'Viper', target: 'Mako', weapon: 'M4A1', part: 'torso', how: 'weapon' });
    expect(MATCH_EVENT_KIND_WORDS_ADAPTATION['damage']).toBe('DMG');
    const el = await mount(d);
    const chip = el.querySelector<HTMLButtonElement>('button[data-filter="kind"][data-value="damage"]');
    expect(chip?.textContent).toBe('DMG');
    const row = el.querySelector<HTMLElement>('.project-match-events li[data-kind="damage"]');
    expect(text(row)).toBe('R1 0:50 Viper DMG');
    chip!.click();
    expect(visibleRows(el)).toEqual(['R1 0:50 Viper DMG']);
  });
});

describe('WM-DATA-EV: the capture spec\'s staged match', () => {
  it('its tick rate is the page\'s; only the staged names; every round has its start; the clocks stay inside the round', () => {
    expect(MEGA_MOCK_9_TICK_HZ).toBe(MATCH_PAGE_TICK_HZ_ADAPTATION);
    const d = megaMock9Match('x');
    expect(d.players.map((p) => p.name).sort()).toEqual(['Cobra', 'Echo', 'Kilo', 'Mako', 'Rook', 'Viper']);
    expect(d.rounds.every((r) => typeof r.startTick === 'number')).toBe(true);
    const rows = eventRowsOf(d, HZ);
    for (const r of rows) expect(r.clockMs, `R${r.round} ${roundClockText(r)}`).toBeLessThanOrEqual(d.rounds[r.round - 1]!.ms);
  });
});

/**
 * WM-DATA task 4's review fold (a BROWSER ADAPTATION, product track): central serves a round's damage events among the
 * recorded ones (kind 'damage', their own seq), ordered by round, then tick, the recorded events first on a tie; the rows
 * keep that same order -- a damage event after the other kinds on a tick tie, then by seq -- so a tie never puts a damage
 * row before the kill it shares its tick with, whatever the seqs.
 */
describe('WM-DATA task 4: the rows\' order with damage events', () => {
  it('on a tick tie a damage row comes after the other kinds, whatever its seq; then by seq', () => {
    const d = fixture();
    const t = d.events[1]!.tick;                                             // round 1's first kill (seq 0)
    const dmg = (seq: number, tick: number): MatchPageData['events'][number] =>
      ({ round: 1, seq, tick, kind: 'damage', actor: 'Viper', target: 'Cobra', weapon: 'M4A1', part: null, how: null });
    d.events = [dmg(1, t), dmg(0, t), ...d.events, dmg(2, t - 1)];
    const rows = eventRowsOf(d, HZ).filter((r) => r.round === 1).slice(0, 4);
    expect(rows.map((r) => [r.kind, r.seq])).toEqual([['damage', 2], ['kill', 0], ['damage', 0], ['damage', 1]]);
  });
});
