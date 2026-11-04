import { describe, expect, it } from 'vitest';
import { emptyFold, EVENT_CLASS, foldEvent, foldedJoin, foldTo } from '../src/replay/fold';
import type { ServerEvent } from '../src/net/protocol';

/**
 * LATER 127 / 138: the room's `timedOut` (ESCORT's and BREACH's time-out win, held 28 s and 23 s) decides the round as an
 * `eliminated` does -- a recording's seek folds it into the phase `decided` (its lines and music: not replayed).
 */
describe('LATER 127 / 138: a recording\'s timedOut', () => {
  it('is stateful, and folds into the decided phase', () => {
    expect(EVENT_CLASS.timedOut).toBe('stateful');
    const s = emptyFold();
    s.phase = 'play';
    foldEvent(s, { type: 'timedOut', winner: 'seal' } as ServerEvent, 100, 60);
    expect(s.phase).toBe('decided');
  });
});

describe('LATER 145: a recording\'s bomb events in a decided round', () => {
  it('fold as they come -- the decided phase gates no bomb event', () => {
    const s = emptyFold();
    s.phase = 'play';
    foldEvent(s, { type: 'eliminated', winner: 'seal' } as ServerEvent, 100, 60);
    const wire = { state: 2, pos: [0, 0, 0], carrier: 4, planter: null, defuser: null, plantingTeam: null, detonateTick: null, pickupAfterTick: 0 };
    foldEvent(s, { type: 'bomb', ...wire } as unknown as ServerEvent, 110, 60);
    expect(s.phase).toBe('decided');
    expect(s.bomb).toMatchObject({ state: 2, carrier: 4 });
  });
});

describe('LATER 148: a recording\'s planted round', () => {
  it('a roundTime at the plant moves the folded clock\'s end to the fuse\'s tick, as the penalty minute\'s does', () => {
    const s = emptyFold();
    foldEvent(s, { type: 'roundStart', round: 1, seconds: 300, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: 1, startTick: 1000 } as unknown as ServerEvent, 1000, 60);
    const before = s.endsTick;
    expect(before).toBe(1000 + 300 * 60);
    const fuseTick = 1000 + 40 * 60 + 30 * 60;                                 // a plant 40 s in, the fuse 30 s on
    foldEvent(s, { type: 'roundTime', seconds: (fuseTick - 1000) / 60 } as ServerEvent, 1000 + 40 * 60, 60);
    expect(s.endsTick).toBe(fuseTick);
  });
});

describe('LATER 152: a recording\'s held clock and the round\'s length', () => {
  it('a held score stops the folded clock at its figure', () => {
    const s = emptyFold();
    foldEvent(s, { type: 'roundStart', round: 1, seconds: 360, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: 1, startTick: 1000 } as unknown as ServerEvent, 1000, 60);
    foldEvent(s, { type: 'score', rows: [], timeLeft: 17.5, spectators: [], wins: { seal: 0, terrorist: 0 }, clockHeld: true } as unknown as ServerEvent, 5000, 60);
    expect(s.endsTick).toBeNull();
    expect(s.figure).toBe(17.5);
  });

  it('a called-off countdown after a planted round folds the round\'s length, not the clock\'s total', () => {
    const s = emptyFold();
    foldEvent(s, { type: 'roundStart', round: 1, seconds: 360, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: 1, startTick: 1000 } as unknown as ServerEvent, 1000, 60);
    foldEvent(s, { type: 'roundTime', seconds: 72.25 } as ServerEvent, 3535, 60);
    foldEvent(s, { type: 'countdown', seconds: 10 } as unknown as ServerEvent, 4000, 60);
    foldEvent(s, { type: 'countdown', seconds: null } as unknown as ServerEvent, 4100, 60);
    expect(s.figure).toBe(360);
  });
});

/**
 * LATER 155 (reading, pending review): the fold keeps what decided the round -- the first decision, as the room keeps it --
 * and the seek's welcome names it while the folded phase is 'decided' (the room's welcome's `decided`), so a seek into the
 * hold marks the page's round audio as a joiner's welcome does -- only while that audio is not decided already:
 * `markDecided` does nothing once decided, and a seek never resets the round audio (`../src/matchActions` clears only the
 * grenades), so a seek from one decided hold into another keeps the first reason (LATER 160).
 */
describe("LATER 155: a recording's decided round, folded", () => {
  const start = (round: number, tick: number): ServerEvent =>
    ({ type: 'roundStart', round, seconds: 300, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: round, startTick: tick }) as unknown as ServerEvent;

  it("a timedOut decides { winner, 'timeout' }, the first standing; the folded welcome names it in 'decided' alone; the next roundStart clears it", () => {
    const s = emptyFold();
    foldEvent(s, start(1, 0), 0, 60);
    expect(foldedJoin(s, 50, 60, []).welcome).not.toHaveProperty('decided');
    foldEvent(s, { type: 'timedOut', winner: 'terrorist' } as ServerEvent, 100, 60);
    foldEvent(s, { type: 'eliminated', winner: 'seal' } as ServerEvent, 110, 60);   // never sent by a room; the first stands
    expect((s as unknown as { decided?: unknown }).decided).toEqual({ winner: 'terrorist', reason: 'timeout' });
    expect((foldedJoin(s, 120, 60, []).welcome as { decided?: unknown }).decided).toEqual({ winner: 'terrorist', reason: 'timeout' });
    foldEvent(s, start(2, 200), 200, 60);
    expect(foldedJoin(s, 210, 60, []).welcome).not.toHaveProperty('decided');
  });

  it("an eliminated's reason rides it ('rescue'); a bare one is 'elimination'", () => {
    const s = emptyFold();
    foldEvent(s, start(1, 0), 0, 60);
    foldEvent(s, { type: 'eliminated', winner: 'seal', reason: 'rescue' } as ServerEvent, 100, 60);
    expect((foldedJoin(s, 120, 60, []).welcome as { decided?: unknown }).decided).toEqual({ winner: 'seal', reason: 'rescue' });
    const t = emptyFold();
    foldEvent(t, start(1, 0), 0, 60);
    foldEvent(t, { type: 'eliminated', winner: 'terrorist' } as ServerEvent, 100, 60);
    expect((foldedJoin(t, 120, 60, []).welcome as { decided?: unknown }).decided).toEqual({ winner: 'terrorist', reason: 'elimination' });
  });
});

/**
 * LATER 158: a bomb's result decides the room's round in the same step with no event of its own (`room.ts`'s play arm:
 * `bomb.result()`, `decided.reason` 'bomb' since LATER 155) -- the fold takes the `bomb` event's state 4 (defused: the
 * other side's) or 5 (detonated: the planting side's) as the round's decision, so a seek into its hold folds the phase
 * `decided` and the welcome's `decided`. A round already decided keeps its first reason (LATER 145, 150).
 */
describe("LATER 158: a recording's bomb result decides the folded round", () => {
  const roundStart = { type: 'roundStart', round: 1, seconds: 300, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: 1, startTick: 1000 } as unknown as ServerEvent;
  const bomb = (state: number, plantingTeam: 'seal' | 'terrorist' | null, defuser: number | null = null): ServerEvent =>
    ({ type: 'bomb', state, pos: [0, 0, 0], carrier: null, planter: 2, defuser, plantingTeam, detonateTick: 3000, pickupAfterTick: 0 }) as unknown as ServerEvent;
  const planted = (team: 'seal' | 'terrorist') => {
    const s = emptyFold();
    foldEvent(s, roundStart, 1000, 60);
    foldEvent(s, bomb(3, team), 2000, 60);
    expect(s.phase).toBe('play');
    return s;
  };

  it("a detonation folds the phase decided, the planting side's, reason 'bomb' -- the seek's welcome names it", () => {
    const s = planted('seal');
    foldEvent(s, bomb(5, 'seal'), 3000, 60);
    expect(s.phase).toBe('decided');
    expect(s.decided).toEqual({ winner: 'seal', reason: 'bomb' });
    const { welcome } = foldedJoin(s, 3100, 60, []);
    expect(welcome.phase).toBe('decided');
    expect(welcome.decided).toEqual({ winner: 'seal', reason: 'bomb' });
  });

  it("a defuse folds the other side's decision", () => {
    const s = planted('seal');
    foldEvent(s, bomb(4, 'seal', 1), 2500, 60);
    expect(s.phase).toBe('decided');
    expect(s.decided).toEqual({ winner: 'terrorist', reason: 'bomb' });
  });

  it("its review's F1: under respawn rules the room decides no round on the bomb -- the fold neither (the recording's header)", () => {
    const s = planted('seal');
    s.classic = false;
    foldEvent(s, bomb(5, 'seal'), 3000, 60);
    expect(s.phase).toBe('play');
    expect(s.decided).toBeNull();
    const header = { kind: 'header', header: { rules: 'respawn', tickHz: 60 } } as never;
    const ev = (tick: number, event: ServerEvent) => ({ kind: 'event', tick, event }) as never;
    const { state } = foldTo([header, ev(1000, roundStart), ev(2000, bomb(3, 'seal')), ev(3000, bomb(5, 'seal'))], 3100, 60);
    expect(state.phase).toBe('play');
    const classic = foldTo([{ kind: 'header', header: { rules: 'classic', tickHz: 60 } } as never, ev(1000, roundStart), ev(2000, bomb(3, 'seal')), ev(3000, bomb(5, 'seal'))], 3100, 60);
    expect(classic.state.phase).toBe('decided');
  });

  it("the guards: an elimination's hold then a defuse keeps 'elimination'; BREACH's time-out hold (MP61) then a defuse keeps 'timeout' (LATER 150, e3's); the next roundStart clears it", () => {
    const e = planted('seal');
    foldEvent(e, { type: 'eliminated', winner: 'seal' } as ServerEvent, 2200, 60);
    foldEvent(e, bomb(4, 'seal', 1), 2300, 60);
    expect(e.decided).toEqual({ winner: 'seal', reason: 'elimination' });
    const t = emptyFold();
    foldEvent(t, roundStart, 1000, 60);
    foldEvent(t, { type: 'timedOut', winner: 'terrorist' } as ServerEvent, 1500, 60);
    foldEvent(t, bomb(3, 'seal'), 1600, 60);                                   // the plant in the hold (LATER 150)
    foldEvent(t, bomb(4, 'seal', 1), 1700, 60);                                // and its defuse
    expect(t.phase).toBe('decided');
    expect(t.decided).toEqual({ winner: 'terrorist', reason: 'timeout' });
    foldEvent(t, { ...roundStart, round: 2, epoch: 2 } as ServerEvent, 4000, 60);
    expect(t.phase).toBe('play');
    expect(t.decided).toBeNull();
  });
});
