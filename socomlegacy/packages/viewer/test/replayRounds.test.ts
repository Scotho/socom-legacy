// test/replayRounds.test.ts -- RV2-01 (RV2.R3): a recording's rounds as timeline spans, read from its `event` records.
// Product track (OT.R53): a browser adaptation of the viewer's timeline; no game value is read or changed here.
import { describe, expect, it } from 'vitest';
import type { ReplayRecord } from '../../match/src/replay/format';
import { roundSpans, roundsOf } from '../src/replay/rounds';
import {
  ALPHA, body, eventRecord, fixtureRecords, header, roundOverRecord, roundStartRecord,
} from './replayFixture';

const snap = (tick: number): ReplayRecord => ({ kind: 'snap', tick, bodies: [body(1, tick)] });
const opening = (): ReplayRecord[] => [{ kind: 'header', header: header() }, { kind: 'players', tick: 0, players: [ALPHA] }, snap(0)];

describe('roundSpans (RV2.R3)', () => {
  it('two rounds: the launch span unnumbered, then one span per roundStart to the next, the last to the end', () => {
    const records = [
      ...opening(), roundStartRecord(100, 1), snap(500), roundOverRecord(900, 1), roundStartRecord(1000, 2), snap(1500),
      { kind: 'end', tick: 1800, reason: 'closed' } as ReplayRecord,
    ];
    expect(roundSpans(records, { start: 0, end: 1800 })).toEqual([
      { round: null, start: 0, end: 100 }, { round: 1, start: 100, end: 1000 }, { round: 2, start: 1000, end: 1800 },
    ]);
  });

  it('a roundStart on the first tick leaves no empty launch span', () => {
    const records = [...opening(), roundStartRecord(0, 1), roundStartRecord(400, 2)];
    expect(roundSpans(records, { start: 0, end: 800 })).toEqual([
      { round: 1, start: 0, end: 400 }, { round: 2, start: 400, end: 800 },
    ]);
  });

  it('respawn: the first round, in play from the start with no roundStart, is numbered by its roundOver', () => {
    const records = [
      ...opening(), eventRecord(500, { type: 'timeExpired' }), roundOverRecord(510, 1), roundStartRecord(600, 2),
      { kind: 'end', tick: 1000, reason: 'closed' } as ReplayRecord,
    ];
    expect(roundSpans(records, { start: 0, end: 1000 })).toEqual([
      { round: 1, start: 0, end: 600 }, { round: 2, start: 600, end: 1000 },
    ]);
  });

  it('respawn: the first roundOver before the first roundStart numbers the opening round', () => {
    const records = [...opening(), roundOverRecord(300, 1), roundOverRecord(310, 4), roundStartRecord(600, 2)];
    expect(roundSpans(records, { start: 0, end: 900 })).toEqual([
      { round: 1, start: 0, end: 600 }, { round: 2, start: 600, end: 900 },
    ]);
  });

  it('respawn cut before its roundOver: the round in play is numbered 1', () => {
    const records = [...opening(), eventRecord(300, { type: 'timeExpired' }), snap(400)];
    expect(roundSpans(records, { start: 0, end: 400 })).toEqual([{ round: 1, start: 0, end: 400 }]);
  });

  it('abandoned ends the running round; the span after it is unnumbered until the next roundStart', () => {
    const records = [
      ...opening(), roundStartRecord(100, 1), eventRecord(400, { type: 'abandoned' }), roundStartRecord(700, 1),
      { kind: 'end', tick: 900, reason: 'closed' } as ReplayRecord,
    ];
    expect(roundSpans(records, { start: 0, end: 900 })).toEqual([
      { round: null, start: 0, end: 100 }, { round: 1, start: 100, end: 400 },
      { round: null, start: 400, end: 700 }, { round: 1, start: 700, end: 900 },
    ]);
  });

  it('abandoned in the launch hold (before round 1) does not split the unnumbered span, nor make it a round', () => {
    const records = [...opening(), eventRecord(200, { type: 'abandoned' }), roundStartRecord(300, 1)];
    expect(roundSpans(records, { start: 0, end: 500 })).toEqual([
      { round: null, start: 0, end: 300 }, { round: 1, start: 300, end: 500 },
    ]);
  });

  it('abandoned on the last tick leaves no empty span after the round', () => {
    const records = [...opening(), roundStartRecord(100, 1), eventRecord(500, { type: 'abandoned' })];
    expect(roundSpans(records, { start: 0, end: 500 })).toEqual([
      { round: null, start: 0, end: 100 }, { round: 1, start: 100, end: 500 },
    ]);
  });

  it('partial: a recording cut mid-round (no end record) ends its last span at span.end', () => {
    const records = [...opening(), roundStartRecord(100, 1), roundStartRecord(1000, 2), snap(1300)];
    expect(roundSpans(records, { start: 0, end: 1300 })).toEqual([
      { round: null, start: 0, end: 100 }, { round: 1, start: 100, end: 1000 }, { round: 2, start: 1000, end: 1300 },
    ]);
  });

  it('a roundStart outside the span is clamped into it', () => {
    const records = [...opening(), roundStartRecord(100, 1), roundStartRecord(1000, 2)];
    expect(roundSpans(records, { start: 200, end: 800 })).toEqual([{ round: 1, start: 200, end: 800 }]);
  });

  it('none: a recording without a roundStart is one unnumbered span (the fixture segment\'s votes are not in-round)', () => {
    expect(roundSpans(fixtureRecords(), { start: 0, end: 500 })).toEqual([{ round: null, start: 0, end: 500 }]);
    expect(roundSpans([{ kind: 'header', header: header() }], { start: 0, end: 0 })).toEqual([{ round: null, start: 0, end: 0 }]);
  });
});

describe('roundsOf (RV2.R3)', () => {
  it('reads `rounds` from the first roundStart', () => {
    expect(roundsOf([...opening(), roundStartRecord(100, 1, 5), roundStartRecord(900, 2, 7)])).toBe(5);
  });

  it('is null without a roundStart', () => {
    expect(roundsOf(fixtureRecords())).toBeNull();
  });
});
