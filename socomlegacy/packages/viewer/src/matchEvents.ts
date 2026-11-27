import type { MatchPageData } from './matchPage';

/**
 * WM-DATA-EV, the owner's approved call 9 (a BROWSER ADAPTATION, product track, OT.R53 -- the game has no web pages; the
 * page's own default, the EVENTS tab in place of the kill feed): the match page's EVENTS tab, its logic -- every recorded event of a match as one list of rows, each row's round clock, its side,
 * its players and its kind, and the filters by round, side, player and kind. The drawing is `./matchPage.ts`'s.
 *
 * **The round clock** (`MATCH_EVENTS_CLOCK_ADAPTATION`) is measured from the round's START: the round's `startTick` (the
 * match record's `roundStart`, `packages/match/src/stats/matchRecord.ts` `roundStartTick`) -- which central's route does
 * not serve today, so a round without one falls back to the page's kill-feed clock, "+m:ss" from the round's first event
 * (`./matchPage.ts` `MATCH_PAGE_FEED_TIME_ADAPTATION`). Imports nothing but the page's types.
 */

/** An adaptation: the clock's source, and its fallback when the round carries no start tick. */
export const MATCH_EVENTS_CLOCK_ADAPTATION = 'events clock: m:ss from the round\'s startTick (the record\'s roundStart, not served by central yet); else +m:ss from the round\'s first event' as const;

/** An adaptation: an event's kind as the EVENTS tab words it (a kind not listed, as recorded; `damage` is neither recorded nor served today). */
export const MATCH_EVENT_KIND_WORDS_ADAPTATION: Readonly<Record<string, string>> = {
  kill: 'Kill', teamkill: 'Team kill', suicide: 'Suicide', damage: 'DMG', planted: 'Planted', defused: 'Defused', detonated: 'Detonated',
  rescued: 'Rescued', hostageKilled: 'Hostage killed', extracted: 'Extracted',
};

/** The kinds' order in the kind chips (a kind not listed after them, as first met). */
const KIND_ORDER = Object.keys(MATCH_EVENT_KIND_WORDS_ADAPTATION);

type MatchEvent = MatchPageData['events'][number];

/** One row of the EVENTS list. `clockMs` from the round's start (`fromStart`) or, without one, from its first event. */
export interface EventRow {
  round: number; seq: number; clockMs: number; fromStart: boolean;
  side: 0 | 1 | null; players: string[]; kind: string; event: MatchEvent;
}

/** The filters: null in a group shows every row. */
export interface EventFilter { round: number | null; side: 0 | 1 | null; player: string | null; kind: string | null }
export const NO_EVENT_FILTER: Readonly<EventFilter> = { round: null, side: null, player: null, kind: null };

/** The row's kind: a kill split into a team kill and a suicide; any other kind as recorded. */
export function eventKindOf(e: Pick<MatchEvent, 'kind' | 'actor' | 'target' | 'how'>): string {
  if (e.kind !== 'kill') return e.kind;
  if (e.actor !== null && e.actor === e.target) return 'suicide';
  if (e.how === 'teamkill') return 'teamkill';
  return 'kill';
}

/**
 * Time order: round, tick, then (WM-DATA task 4, central's order for the served events) a damage event after the other
 * kinds on a tick tie -- its seq is its own round's damage list's, not the events' -- then seq.
 */
const byTime = (x: MatchEvent, y: MatchEvent): number => x.round - y.round || x.tick - y.tick
  || Number(x.kind === 'damage') - Number(y.kind === 'damage') || x.seq - y.seq;

/** Every event of the answer as rows, in time order; `tickHz` the record's tick rate. */
export function eventRowsOf(d: MatchPageData, tickHz: number): EventRow[] {
  const sideOf = new Map(d.players.map((p) => [p.name, p.side === 0 || p.side === 1 ? p.side : null] as const));
  const starts = new Map(d.rounds.map((r) => [r.round, r.startTick] as const));
  const firstTick = new Map<number, number>();
  const rows: EventRow[] = [];
  for (const e of d.events.slice().sort(byTime)) {
    if (!firstTick.has(e.round)) firstTick.set(e.round, e.tick);
    const start = starts.get(e.round);
    const fromStart = typeof start === 'number';
    const t0 = fromStart ? start : firstTick.get(e.round)!;
    const who = e.actor ?? e.target;
    const players = [...new Set([e.actor, e.target].filter((n): n is string => n !== null && n !== ''))];
    rows.push({
      round: e.round, seq: e.seq, clockMs: Math.max(0, ((e.tick - t0) * 1000) / tickHz), fromStart,
      side: who === null ? null : sideOf.get(who) ?? null, players, kind: eventKindOf(e), event: e,
    });
  }
  return rows;
}

/** The row's clock: "m:ss" from the round's start, "+m:ss" from its first event (no start known). */
export function roundClockText(row: Pick<EventRow, 'clockMs' | 'fromStart'>): string {
  const s = Math.max(0, Math.round(row.clockMs / 1000));
  return `${row.fromStart ? '' : '+'}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Whether a row passes the filters: each group null, or the row's round, side, kind, or a player of it equal. */
export function eventRowMatches(row: Pick<EventRow, 'round' | 'side' | 'players' | 'kind'>, f: EventFilter): boolean {
  return (f.round === null || row.round === f.round)
    && (f.side === null || row.side === f.side)
    && (f.player === null || row.players.includes(f.player))
    && (f.kind === null || row.kind === f.kind);
}

/** The chips each group offers: the rounds, sides and kinds present in the rows; every player on a side, as listed. */
export function eventFilterOptions(d: MatchPageData, rows: readonly EventRow[]): { rounds: number[]; sides: (0 | 1)[]; players: string[]; kinds: string[] } {
  const rounds = [...new Set(rows.map((r) => r.round))].sort((a, b) => a - b);
  const sides = ([0, 1] as const).filter((s) => rows.some((r) => r.side === s));
  const players = [0, 1].flatMap((s) => d.players.filter((p) => p.side === s).map((p) => p.name));
  const present = [...new Set(rows.map((r) => r.kind))];
  const rank = (k: string): number => { const i = KIND_ORDER.indexOf(k); return i < 0 ? KIND_ORDER.length : i; };
  const kinds = present.slice().sort((a, b) => rank(a) - rank(b));
  return { rounds, sides: [...sides], players, kinds };
}
