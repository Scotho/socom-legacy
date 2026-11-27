import type { MatchStats, ScoreRow, Team } from './net/protocol';
import { yourStatsOf, type RoundScreen } from './roundScreens';

/** The engine's result read (`FUN_002a9b30` D:L150612-150672),
 * moved unchanged from NetPage so both render paths use the same clock. */
export const ENGINE_READ_S = 3;
export interface RoundPresentation {
  start: number;
  list: { screen: RoundScreen['kind']; seconds: number }[];
  winner: Team | null;
  wins: { seal: number; terrorist: number };
  stats?: Record<number, MatchStats>;
}
export function roundScreensElapsed(screens: RoundPresentation | null, now: number): number | null {
  return screens ? (now - screens.start) / 1000 - ENGINE_READ_S : null;
}

/** NetPage's existing screen projection. The last server-named screen stays up
 * until the next round event (research 315 §13); round lists use round counters,
 * GAME COMPLETE uses totals (research 216 §8). No render/backend dependencies. */
export function roundScreenAt(screens: RoundPresentation | null, elapsed: number | null,
  rows: readonly ScoreRow[], self: number, timePlayed: number): RoundScreen | null {
  if (!screens || elapsed === null || elapsed < 0) return null;
  let t = elapsed;
  for (let i = 0; i < screens.list.length; i++) {
    const item = screens.list[i]!;
    if (t < item.seconds || i === screens.list.length - 1) {
      // ROUND COMPLETE's and FINAL ROUND's lists are the round block (RoundStatLbContents*, the getter 0x225fe0 =
      // +0x58c; FUN_00223680 D:L75946-75947), GAME COMPLETE's the match block (GameSealsTotLbContents /
      // GameTerrsTotLbContents by FUN_00225bc0 via FUN_002241c0 D:L76208-76214, the +0x544 sum D:L76987;
      // research 216 §8): the round's three where the room sends them, else the totals.
      const roundList = item.screen !== 'gameComplete';
      const listed = rows.map(r => ({ ...r, self: r.id === self,
        ...(roundList && r.roundKills !== undefined && r.roundDeaths !== undefined && r.roundScore !== undefined
          ? { kills: r.roundKills, deaths: r.roundDeaths, score: r.roundScore } : {}) }));
      const you = rows.find(r => r.id === self);
      return { kind: item.screen, secondsLeft: Math.max(0, item.seconds - t), elapsed: t,
        winner: screens.winner, wins: screens.wins, rows: listed,
        you: you ? yourStatsOf(you, screens.stats?.[self]) : null, timePlayed };
    }
    t -= item.seconds;
  }
  return null;
}
