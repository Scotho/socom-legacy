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
/** `gone`: room ids whose account is forgotten (a leaver); `alias`: a room id's account other than 100 + id (a takeover's new id). */
function fake(gone: Set<number> = new Set(), alias: ReadonlyMap<number, string> = new Map()) {
  const sent: MatchRecordPart[] = [];
  const source: RoomStreamSource = {
    game: 7, match: () => ({ serial: 1, startedAt: 1_000 }), map: () => 'MP72', gameType: () => 2,
    settings: () => ({ roundSeconds: 60, maxRounds: 3, friendlyFire: true, maxPlayers: 8, teamSize: 8, eqLimit: 0 }),
    lobbyName: () => 'Lobby', host: () => '101', accountOf: (id) => (gone.has(id) ? null : alias.get(id) ?? String(100 + id)), seats: () => SEATS, now: () => 9_000,
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
  const lastRound = (): MatchRecordRound => sent.filter((p): p is MatchRecordRound => p.part === 'round').at(-1)!;
  const seatOf = <T extends { seat: string }>(xs: readonly T[], id: number): T => xs.find((x) => x.seat === String(100 + id))!;
  return { rec, ev, start, end, close, lastRound, seatOf };
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

/**
 * Assists everywhere, gap E (the owner, 2026-11-10: "please ensure they do everywhere"; product track, LCM-6a's adaptation):
 * the death's edges. The room tells enemies' hits only (`onCombatApplied`) and the hit's own side check stands, so a
 * later score that puts the two on one side takes no assist away; and the killer is told by his record seat, so a
 * takeover's kill under a new room id earns the killer no assist beside it, and one seat's two ids one assist.
 */
describe('assists everywhere E: the death\'s edges', () => {
  it('a hit taken as an enemy\'s stands at the death, though the rows then put both on one side', () => {
    const f = fake();
    f.start(1);
    f.rec.combatApplied(1, 2, 30);                                            // A (SEAL) hits V: an enemy's hit
    f.ev(1_050, score([row(1, 'terrorist'), row(2, 'terrorist'), row(3, 'seal'), row(4, 'terrorist')]));   // A's row now V's side
    f.rec.combatApplied(3, 2, 70);
    f.ev(1_100, kill(3, 2));
    const r = f.end(1, true);
    expect(f.seatOf(r.seats, 1)).toMatchObject({ assists: 1, damage: 30 });
  });

  it('a takeover: A hits V under room id 1, takes his seat over as id 5 and kills V -- the kill, no assist beside it', () => {
    const f = fake(new Set(), new Map([[5, '101']]));
    f.start(1);
    f.rec.combatApplied(1, 2, 30);
    f.ev(1_050, score([row(5, 'seal'), row(2, 'terrorist'), row(3, 'seal'), row(4, 'terrorist')]));   // the takeover's new id carries the row
    f.rec.combatApplied(5, 2, 70);
    f.ev(1_100, kill(5, 2));
    f.ev(1_500, roundOver(1, true)); f.ev(1_500, score([row(5, 'seal'), row(2, 'terrorist'), row(3, 'seal'), row(4, 'terrorist')])); f.rec.onRoundOver(report(1, true));
    expect(f.seatOf(f.lastRound().seats, 1)).toMatchObject({ assists: 0, damage: 100 });
    expect(f.seatOf(f.close().totals, 1)).toMatchObject({ assists: 0, damage: 100 });
  });

  it('a takeover: A hits V under ids 1 and 5, B kills V -- A one assist for the one death, never two', () => {
    const f = fake(new Set(), new Map([[5, '101']]));
    f.start(1);
    f.rec.combatApplied(1, 2, 30);
    f.rec.combatApplied(5, 2, 20);
    f.rec.combatApplied(3, 2, 50);
    f.ev(1_100, kill(3, 2));
    const r = f.end(1, true);
    expect(f.seatOf(r.seats, 1)).toMatchObject({ assists: 1, damage: 50 });
    expect(f.seatOf(f.close().totals, 1)).toMatchObject({ assists: 1, damage: 50 });
  });
});

/**
 * Assists everywhere, gap C: a round part's seats are the room's rows at its end, which hold no leaver -- so a seat that
 * took health or earned an assist this round and left before its end is added, once, with zero counts beside them (its
 * kills, deaths and score are the room's rows', gone with it; its rounds as they stood, no result for a round it left).
 */
describe('assists everywhere C: a leaver\'s round assists and damage', () => {
  it('A hits V, A leaves, B kills V: the round part names A with his assist and damage, zero counts, once', () => {
    const gone = new Set<number>();
    const f = fake(gone);
    f.start(1);
    f.rec.combatApplied(1, 2, 30);
    gone.add(1);
    const left = score(SEATS.filter((s) => s.id !== 1).map((s) => row(s.id, s.team)));
    f.ev(1_050, left);
    f.rec.combatApplied(3, 2, 70);
    f.ev(1_100, kill(3, 2));
    f.ev(1_500, roundOver(1, true)); f.ev(1_500, left); f.rec.onRoundOver(report(1, true));
    const r = f.lastRound();
    expect(f.seatOf(r.seats, 1)).toEqual({ seat: '101', kills: 0, deaths: 0, score: 0, rescued: 0, roundsWon: 0, roundsLost: 0, assists: 1, damage: 30 });
    expect(r.seats.map((s) => s.seat).sort()).toEqual(['101', '102', '103', '104']);
    expect(f.seatOf(r.seats, 3)).toMatchObject({ assists: 0, damage: 70 });
    expect(f.seatOf(f.close().totals, 1)).toMatchObject({ assists: 1, damage: 30 });
  });

  it('a seated player with none this round is never added twice; a leaver with none is not added', () => {
    const gone = new Set<number>();
    const f = fake(gone);
    f.start(1);
    gone.add(4);
    const left = score(SEATS.filter((s) => s.id !== 4).map((s) => row(s.id, s.team)));
    f.ev(1_050, left);
    f.rec.combatApplied(1, 2, 100);
    f.ev(1_100, kill(1, 2));
    f.ev(1_500, roundOver(1, true)); f.ev(1_500, left); f.rec.onRoundOver(report(1, true));
    expect(f.lastRound().seats.map((s) => s.seat).sort()).toEqual(['101', '102', '103']);
  });
});

/**
 * Assists everywhere, review F1: the killer's own hits are dropped by his room id too, beside the record-seat check --
 * his seat as his kill names it can differ from the one his hit kept (a leaver's grenade: his account forgotten; a CPU
 * hit before the stream marked it one), and a killer never gets an assist beside his own kill.
 */
describe('assists everywhere F1: no assist beside the killer\'s own kill, whatever his seat reads now', () => {
  it('A hits V seated, leaves, and his grenade in flight kills V: no assist for A (B, who hit V too, one)', () => {
    const gone = new Set<number>();
    const f = fake(gone);
    f.start(1);
    f.rec.combatApplied(1, 2, 30);
    f.rec.combatApplied(3, 2, 20);
    gone.add(1);
    const left = score(SEATS.filter((s) => s.id !== 1).map((s) => row(s.id, s.team)));
    f.ev(1_050, left);
    f.ev(1_100, kill(1, 2));                                                  // the kill names room id 1, now `seat:1`
    f.ev(1_500, roundOver(1, true)); f.ev(1_500, left); f.rec.onRoundOver(report(1, true));
    const totals = f.close().totals;
    expect(f.seatOf(totals, 1)).toMatchObject({ assists: 0, damage: 30 });
    expect(f.seatOf(totals, 3)).toMatchObject({ assists: 1, damage: 20 });
    expect(totals.filter((t) => (t.assists ?? 0) > 0).map((t) => t.seat)).toEqual(['103']);
  });

  it('a CPU hits V before the stream marks it one, then kills V: no assist beside its kill', () => {
    const f = fake(new Set([6]));                                             // room id 6: no account
    f.start(1);
    f.rec.combatApplied(6, 2, 40);                                            // kept as `seat:6`: not yet known a CPU
    f.ev(1_050, score([...SEATS.map((s) => row(s.id, s.team)), { ...row(6, 'seal'), bot: true }]));   // now `cpu:6`
    f.ev(1_100, kill(6, 2));
    f.ev(1_500, roundOver(1, true)); f.ev(1_500, score([...SEATS.map((s) => row(s.id, s.team)), { ...row(6, 'seal'), bot: true }])); f.rec.onRoundOver(report(1, true));
    const totals = f.close().totals;
    expect(totals.filter((t) => (t.assists ?? 0) > 0)).toEqual([]);
    expect(f.lastRound().seats.filter((s) => (s.assists ?? 0) > 0)).toEqual([]);
  });
});
