// replay/rounds.ts -- RV2-01 (RV2.R3): a recording's rounds as spans of its ticks, for the player's viewer's timeline.
//
// A browser adaptation (product track, OT.R53): the original has no replay viewer, so nothing here is the game's; it
// reads only what the recording already holds -- the wire's `ServerEvent`s in its `event` records
// (`packages/match/src/replay/format.ts`): `roundStart { round, rounds, ... }`, `roundOver { round, ... }`, `abandoned`.
// Pure: no clock, no DOM. `homeTick` (`./replayClient`) is unchanged by it.
import type { ReplayRecord } from '../../../match/src/replay/format';
import type { ServerEvent } from '../net/protocol';

/** One span of the timeline: a round by its number, or `null` -- the launch/lobby wait, or the wait after an abandon. */
export interface RoundSpan { round: number | null; start: number; end: number }

/**
 * The events the room sends only while a round runs, so one before the first boundary says the recording opened inside
 * a round (a respawn room's first round, in play from its construction with no `roundStart`). The same set as
 * `replayClient.ts`'s `IN_ROUND` (`homeTick`'s reading, room.ts `penaltyMinute` / `clock` / `endRound`), which that
 * module does not export; `abandoned` is not one (the room abandons its launch hold too).
 */
const IN_ROUND_EVENTS: ReadonlySet<ServerEvent['type']> = new Set(['roundTime', 'timeExpired', 'eliminated', 'timedOut', 'roundOver']);

/**
 * The recording's rounds, end to end over `span` (the client's `span()`: its first tick to its last):
 * - a span from each `roundStart`'s tick to the next boundary, numbered by its `round`;
 * - an `abandoned` ends the running span, and the span after it is unnumbered until the next `roundStart` (an abandon
 *   while nothing numbered runs -- the launch hold's -- splits nothing);
 * - the span before the first boundary is unnumbered (the launch/lobby wait), unless an in-round event precedes that
 *   boundary: then it is the round already in play (a respawn room's first), numbered by the first `roundOver` before
 *   the boundary, or 1 when the recording holds none (cut before it);
 * - the last span ends at `span.end` (an `end` record's tick, or a partial recording's last tick);
 * - a boundary's tick is clamped into `span`; a span of no ticks is dropped, but one span always stands (a recording
 *   without a `roundStart` is one unnumbered span).
 */
export function roundSpans(records: readonly ReplayRecord[], span: { start: number; end: number }): RoundSpan[] {
  const clamp = (t: number): number => Math.min(Math.max(t, span.start), span.end);
  const cuts: { tick: number; round: number | null }[] = [];
  let inRound = false;
  let opening: number | null = null;
  for (const r of records) {
    if (r.kind !== 'event') continue;
    const e = r.event;
    if (e.type === 'roundStart') cuts.push({ tick: r.tick, round: e.round });
    else if (e.type === 'abandoned') cuts.push({ tick: r.tick, round: null });
    else if (cuts.length === 0 && IN_ROUND_EVENTS.has(e.type)) {
      inRound = true;
      if (e.type === 'roundOver' && opening === null) opening = e.round;
    }
  }
  const out: RoundSpan[] = [];
  let cur: { round: number | null; start: number } = { round: inRound ? (opening ?? 1) : null, start: span.start };
  for (const c of cuts) {
    if (c.round === null && cur.round === null) continue;
    const t = clamp(c.tick);
    if (t > cur.start) out.push({ ...cur, end: t });
    cur = { round: c.round, start: t };
  }
  if (span.end > cur.start || out.length === 0) out.push({ ...cur, end: span.end });
  return out;
}

/** The match's round count (`roundStart.rounds`) read from the recording's first `roundStart`; `null` without one. */
export function roundsOf(records: readonly ReplayRecord[]): number | null {
  for (const r of records) if (r.kind === 'event' && r.event.type === 'roundStart') return r.event.rounds;
  return null;
}
