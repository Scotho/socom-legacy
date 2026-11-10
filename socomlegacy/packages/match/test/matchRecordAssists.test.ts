import { describe, expect, it } from 'vitest';
import type { ServerEvent } from '../../viewer/src/sim';
import type { ScoreRow } from '../../viewer/src/net/protocol';
import type { RoundOverReport } from '../src/room';
import {
  ASSIST_MIN_DAMAGE_ADAPTATION, matchRecording,
  type MatchRecordClose, type MatchRecordPart, type MatchRecordRound, type RoomStreamSource,
} from '../src/stats/matchRecord';

/**
 * LCM-6a (the live cards plan, `docs/plans/2026-11-09-live-cards-and-match-pages.md`; product track, an adaptation: the
 * original keeps no assists or damage, research 155 §3): the match recorder's assists and damage from the room's
 * `onCombatApplied` observer (`MatchRecorder.combatApplied`, wired by `matchRecording`'s `combatApplied`). Damage: the
 * health an enemy's applied hits took, per seat. An assist: at a death, each *other* enemy who took at least
 * `ASSIST_MIN_DAMAGE_ADAPTATION` health from the victim during that life (since his last spawn, or the round's start).
 * Counted per round on the round part's `seats[]`, per match on the close's `totals[]`; never in the career block. Seats
 * and accounts invented; no game data.
 */

const row = (id: number, team: 'seal' | 'terrorist'): ScoreRow => ({
  id, name: `n${id}`, team, kills: 0, deaths: 0, score: 0, alive: true, ping: 0, roundKills: 0, roundDeaths: 0, roundScore: 0,
});
const score = (rows: ScoreRow[]): ServerEvent => ({ type: 'score', rows, timeLeft: null, spectators: [], wins: { seal: 0, terrorist: 0 } });
const roundStart = (round: number): ServerEvent => ({ type: 'roundStart', round, seconds: 60, wins: { seal: 0, terrorist: 0 }, rounds: 3, epoch: 0, startTick: 0 });
const roundOver = (round: number, matchOver: boolean): ServerEvent =>
  ({ type: 'roundOver', round, winner: 'seal', wins: { seal: 0, terrorist: 0 }, matchOver, screens: [], stats: {} });
const kill = (killer: number | null, victim: number): ServerEvent => ({ type: 'kill', killer, victim, weapon: 'm4a1', how: 'weapon', clip: null, cause: 5 });
const spawn = (id: number): ServerEvent => ({ type: 'spawn', id, at: [0, 0, 0], yaw: 0, after: 0 } as ServerEvent);
const report = (round: number, matchOver: boolean): RoundOverReport =>
  ({ round, matchOver, respawn: false, gameType: 2, wins: { seal: 0, terrorist: 0 }, roundMs: 0, seats: [] });

/** Seats 1, 3 (SEALs: A and B) and 2, 4 (Terrorists: V and his mate T); accounts 101-104. */
const SEATS = [
  { id: 1, name: 'A', team: 'seal' as const }, { id: 2, name: 'V', team: 'terrorist' as const },
  { id: 3, name: 'B', team: 'seal' as const }, { id: 4, name: 'T', team: 'terrorist' as const },
];
function fake(gone: Set<number> = new Set()) {
  const sent: MatchRecordPart[] = [];
  const source: RoomStreamSource = {
    game: 7, match: () => ({ serial: 1, startedAt: 1_000 }), map: () => 'MP72', gameType: () => 2,
    settings: () => ({ roundSeconds: 60, maxRounds: 3, friendlyFire: true, maxPlayers: 8, teamSize: 8, eqLimit: 0 }),
    lobbyName: () => 'Lobby', host: () => '101', accountOf: (id) => (gone.has(id) ? null : String(100 + id)), seats: () => SEATS, now: () => 9_000,
  };
  const rec = matchRecording(source, (p) => sent.push(p), () => true);
  const ev = (tick: number, e: ServerEvent): void => rec.stream.event(tick, e);
  const rows = score(SEATS.map((s) => row(s.id, s.team)));
  const start = (n: number): void => { ev(n * 1_000, roundStart(n)); rec.onRoundStart(n); ev(n * 1_000, rows); };
  const end = (n: number, over: boolean): MatchRecordRound => {
    ev(n * 1_000 + 500, roundOver(n, over)); ev(n * 1_000 + 500, rows); rec.onRoundOver(report(n, over));
    return sent.filter((p): p is MatchRecordRound => p.part === 'round').at(-1)!;
  };
  const close = (): MatchRecordClose => sent.find((p): p is MatchRecordClose => p.part === 'close')!;
  const seatOf = <T extends { seat: string }>(xs: readonly T[], id: number): T => xs.find((x) => x.seat === String(100 + id))!;
  return { rec, ev, start, end, close, seatOf };
}

describe('LCM-6a: assists and damage in the match record', () => {
  it('PR #781 Codex P2: A hits V, A leaves, B kills: the assist is the account of A, never a seat: row', () => {
    const gone = new Set<number>();
    const f = fake(gone);
    f.start(1);
    f.rec.combatApplied(1, 2, 30);
    gone.add(1);                                    // MatchGame.seatFor().left(): the account's room seat is forgotten
    const left = score(SEATS.filter((s) => s.id !== 1).map((s) => row(s.id, s.team)));
    f.ev(1_050, left);                              // the room's rows no longer hold the leaver
    f.rec.combatApplied(3, 2, 70);
    f.ev(1_100, kill(3, 2));
    f.ev(1_500, roundOver(1, true)); f.ev(1_500, left); f.rec.onRoundOver(report(1, true));
    const totals = f.close().totals;
    expect(f.seatOf(totals, 1)).toMatchObject({ assists: 1, damage: 30 });
    expect(totals.some((s) => s.seat === 'seat:1')).toBe(false);
  });

  it('the minimum is any health at all', () => {
    expect(ASSIST_MIN_DAMAGE_ADAPTATION).toBe(1);
  });

  it('A then B hit V, B kills: A one assist, B none; each one\'s damage the health he took', () => {
    const f = fake();
    f.start(1);
    f.rec.combatApplied(1, 2, 30);
    f.rec.combatApplied(3, 2, 20);
    f.rec.combatApplied(3, 2, 50);
    f.ev(1_100, kill(3, 2));
    const r = f.end(1, true);
    expect(f.seatOf(r.seats, 1)).toMatchObject({ assists: 1, damage: 30 });
    expect(f.seatOf(r.seats, 3)).toMatchObject({ assists: 0, damage: 70 });
    expect(f.seatOf(r.seats, 2)).toMatchObject({ assists: 0, damage: 0 });
    expect(f.seatOf(f.close().totals, 1)).toMatchObject({ assists: 1, damage: 30 });
    expect(f.seatOf(f.close().totals, 3)).toMatchObject({ assists: 0, damage: 70 });
  });

  it('A hits V, V respawns, B kills: A none (a new life)', () => {
    const f = fake();
    f.start(1);
    f.rec.combatApplied(1, 2, 30);
    f.ev(1_100, kill(null, 2));                                                // V dies to the world: A's assist for that life
    f.ev(1_150, spawn(2));
    f.rec.combatApplied(1, 2, 10);
    f.ev(1_160, spawn(2));                                                    // a spawn without a death (a respawn's placing): a new life too
    f.rec.combatApplied(3, 2, 100);
    f.ev(1_200, kill(3, 2));
    const r = f.end(1, true);
    expect(f.seatOf(r.seats, 1)).toMatchObject({ assists: 1, damage: 40 });   // the first life's, not the second's
    expect(f.seatOf(r.seats, 3)).toMatchObject({ assists: 0, damage: 100 });
  });

  it('a round\'s start is a new life for every seat; the round part counts its own round, the close the match', () => {
    const f = fake();
    f.start(1);
    f.rec.combatApplied(1, 2, 30);
    const r1 = f.end(1, false);
    f.start(2);
    f.rec.combatApplied(3, 2, 100);
    f.ev(2_100, kill(3, 2));
    const r2 = f.end(2, true);
    expect(f.seatOf(r1.seats, 1)).toMatchObject({ assists: 0, damage: 30 });
    expect(f.seatOf(r2.seats, 1)).toMatchObject({ assists: 0, damage: 0 });
    expect(f.seatOf(f.close().totals, 1)).toMatchObject({ assists: 0, damage: 30 });
    expect(f.seatOf(f.close().totals, 3)).toMatchObject({ assists: 0, damage: 100 });
  });

  it('a teammate\'s hit is no assist and no damage', () => {
    const f = fake();
    f.start(1);
    f.rec.combatApplied(4, 2, 40);                                            // T is V's own side
    f.rec.combatApplied(1, 2, 100);
    f.ev(1_100, kill(1, 2));
    const r = f.end(1, true);
    expect(f.seatOf(r.seats, 4)).toMatchObject({ assists: 0, damage: 0 });
    expect(f.seatOf(r.seats, 1)).toMatchObject({ assists: 0, damage: 100 });
  });

  it('damage sums health only; a hit that took none (armour only) is no damage and no assist', () => {
    const f = fake();
    f.start(1);
    f.rec.combatApplied(1, 2, 12.5);
    f.rec.combatApplied(1, 2, 12.5);
    f.rec.combatApplied(3, 2, 0);
    f.rec.combatApplied(3, 2, -5);
    f.rec.combatApplied(4, 1, 0);
    f.ev(1_100, kill(4, 2));
    const r = f.end(1, true);
    expect(f.seatOf(r.seats, 1)).toMatchObject({ assists: 1, damage: 25 });
    expect(f.seatOf(r.seats, 3)).toMatchObject({ assists: 0, damage: 0 });
  });

  it('a kill with no other attacker: no assist; a self-hit counts nothing', () => {
    const f = fake();
    f.start(1);
    f.rec.combatApplied(2, 2, 30);
    f.rec.combatApplied(1, 2, 70);
    f.ev(1_100, kill(1, 2));
    const r = f.end(1, true);
    for (const id of [1, 2, 3, 4]) expect(f.seatOf(r.seats, id).assists).toBe(0);
    expect(f.seatOf(r.seats, 2).damage).toBe(0);
    expect(f.seatOf(r.seats, 1).damage).toBe(70);
  });

  it('the career block is the same with and without combat observed', () => {
    const run = (observe: boolean): MatchRecordClose => {
      const f = fake();
      f.start(1);
      if (observe) { f.rec.combatApplied(1, 2, 30); f.rec.combatApplied(3, 2, 70); }
      f.ev(1_100, kill(3, 2));
      f.end(1, true);
      return f.close();
    };
    const off = run(false), on = run(true);
    expect(JSON.stringify(on.totals.map((t) => t.block))).toBe(JSON.stringify(off.totals.map((t) => t.block)));
  });

  it('matchRecording\'s combatApplied contains a failure: never into the room', () => {
    const f = fake();
    f.start(1);
    const broken = f.rec as unknown as { recorder: { combatApplied: () => void } };
    broken.recorder.combatApplied = () => { throw new Error('the record\'s own trouble'); };
    expect(() => f.rec.combatApplied(1, 2, 30)).not.toThrow();
  });
});
