import { expect, it } from 'vitest';
import { roundScreenAt, roundScreensElapsed, type RoundPresentation } from '../src/roundPresentation';
import type { ScoreRow } from '../src/net/protocol';

const screens: RoundPresentation = { start: 1000, winner: 'seal', wins: { seal: 2, terrorist: 1 },
  list: [{ screen: 'finalRound', seconds: 10 }, { screen: 'gameComplete', seconds: 10 }] };
const rows = [{ id: 7, name: 'PLAYER', team: 'seal', score: 20, kills: 8, deaths: 4,
  roundScore: 5, roundKills: 2, roundDeaths: 1 }] as ScoreRow[];
it('waits through the original result read, switches on the boundary, and holds the final screen', () => {
  const at = (now: number) => roundScreenAt(screens, roundScreensElapsed(screens, now), rows, 7, 30);
  expect(at(3999)).toBeNull();
  expect(at(4000)).toMatchObject({ kind: 'finalRound', secondsLeft: 10, elapsed: 0 });
  expect(at(14000)).toMatchObject({ kind: 'gameComplete', secondsLeft: 10, elapsed: 0 });
  expect(at(40000)).toMatchObject({ kind: 'gameComplete', secondsLeft: 0, elapsed: 26 });
});
it('shows round counters before totals and preserves own stats from the total row', () => {
  expect(roundScreenAt(screens, 1, rows, 7, 30)?.rows[0]).toMatchObject({ score: 5, kills: 2, deaths: 1, self: true });
  expect(roundScreenAt(screens, 11, rows, 7, 30)?.rows[0]).toMatchObject({ score: 20, kills: 8, deaths: 4, self: true });
  expect(roundScreenAt(null, 1, rows, 7, 30)).toBeNull();
});
