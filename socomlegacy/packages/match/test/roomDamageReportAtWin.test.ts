import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, TICK_HZ, type ServerEvent } from '../../viewer/src/sim';
import { eliminatedHoldS, eliminationWatchS, modeRules, timeoutHoldS } from '../../viewer/src/net/rules';
import { resultHoldS } from '../../viewer/src/net/objective';
import * as roomModule from '../src/room';
import { ENGINE_READ_S, ROUND_COMPLETE_S } from '../src/room';
import { Client, isReport, isReportFrame, seatedRoom, type DamageReport } from './helpers/damageReportRoom';
import { dmgTrack } from './helpers/dmgTrack';

/**
 * WM-DATA-WIN (the owner's "B, every win", relayed by the controller -- WM.R24; PRODUCT TRACK: `DAMAGE_REPORT_ADAPTATION`,
 * a browser adaptation with no original -- the game gives a player no damage numbers): in a CLASSIC room, the moment a
 * side WINS the round -- every entry into the room's `decided` phase: an elimination, EXTRACTION's (and ESCORT's)
 * `rescue` / `hostageKills`, a bomb's result, a time-out win (`timedOut`) -- each seated player is sent his own round
 * report, so his page may open the panel through the hold (`netPageDamageWindowAtWin.test.ts`); the report at
 * `roundOver` is still sent (the final ledger) and replaces it. The reasons that send it are ONE named set in the room
 * (`DAMAGE_REPORT_AT_WIN_REASONS`; elimination-only is that set reduced to 'elimination'). WM.R10 is knowingly set
 * aside for that window only: a living player of a decided round may learn what he took and dealt. Unchanged: a time-out
 * draw (no decision, no hold) sends its one report after `roundOver`; a respawn room's round too; nothing is sent in a
 * live round; never broadcast, never to a watcher, never in the recorder's stream; a ghost of the round (a seat not
 * seated at its start, `ghostOf`) gets none, as at `roundOver` today (`roomDamageReport.test.ts`).
 *
 * The original's flow is pinned unchanged: every broadcast (bytes and tick), the recorder's stream and every player's
 * stream less the report frames equal a run with the report silenced, and the decision, the hold's end and the next
 * round's start are the ticks the room's code derives (`eliminationWatchS`, `eliminatedHoldS`, `resultHoldS`,
 * `timeoutHoldS`, `ENGINE_READ_S` + `ROUND_COMPLETE_S`).
 *
 * Built on `helpers/damageReportRoom.ts`'s synthetic flat floor (no game data): players 1 (T), 2 (S), 3 (S), 4 (T), a
 * watcher 9. The ledger is fed through the room's own `combat()`, deaths through its own `kill()`; a bomb's and an
 * EXTRACTION's result are stand-ins over the step that decides (the synthetic floor has no bomb site and no hostage),
 * the room's own `step()` deciding on them; BREACH's time-out is the synthetic map with `gameType` 1.
 */

type Seen = { step: number; tick: number; phase: string; ev: ServerEvent; frame: string };
type State = { phase: string; startedAt?: number; resultAt?: number; nextAt?: number; reason?: string; winner?: string };
type Internals = {
  state: State;
  map: { gameType?: number };
  bomb: unknown; extraction: unknown;
  /** The room's copy of the set (the planned seam for an elimination-only room; `DAMAGE_REPORT_AT_WIN_REASONS`). */
  damageAtWin?: ReadonlySet<string>;
  combat(a: unknown, t: unknown, d: Record<string, unknown>): void;
  kill(victim: unknown, killer: unknown, weapon: string | null, how: string, cause: number): void;
};
const tok = (id: number): string => `tab${id}`.padEnd(22, '_');
const ALL_REASONS = ['elimination', 'rescue', 'hostageKills', 'timeout', 'bomb'];   // `DecidedWire['reason']`, every member

/** A stand-in for one of the room's authorities over the step that decides: its named members, any other a no-op. */
const standIn = (members: Record<string, unknown>): unknown => new Proxy(members, {
  get: (t, k) => (typeof k === 'string' && k in t ? t[k] : () => undefined),
});

/** A room on the helper's floor, every text frame each client takes recorded with the step, the room's tick and phase. */
function game(o: { silent?: boolean; gameType?: number; roundSeconds?: number; rules?: 'classic' | 'respawn'; reasons?: string[] } = {}) {
  const rules = o.rules ?? 'classic';
  const { room, cs, watcher, recorded } = seatedRoom(o.silent ?? false, { rules, roundSeconds: o.roundSeconds ?? 60 });
  const r = room as unknown as Internals;
  if (o.gameType !== undefined) r.map.gameType = o.gameType;   // the synthetic map's mode (no bomb site, no hostage)
  if (o.reasons) r.damageAtWin = new Set(o.reasons);
  let stepNo = 0;
  const seen = new Map<Client, Seen[]>();
  const tap = (c: Client): void => {
    const list: Seen[] = [];
    seen.set(c, list);
    c.onText = (frame) => { list.push({ step: stepNo, tick: room.tick, phase: r.state.phase, ev: JSON.parse(frame) as ServerEvent, frame }); };
  };
  [...cs, watcher].forEach(tap);
  const join = (id: number): Client => {
    const c = new Client();
    tap(c);
    room.hello(id, c, { type: 'hello', version: PROTOCOL_VERSION, name: `P${id}`, map: 'MP99', session: tok(id) }, `10.0.0.${id}`);
    return c;
  };
  const phase = (): string => r.state.phase;
  /** The step (1-based) whose end first found the room `decided`, and the room's tick before and after that step. */
  const decision = { step: -1, tickBefore: -1, tickAfter: -1, state: null as State | null };
  const step = (): void => {
    const before = room.tick;
    stepNo++;
    room.step();
    if (decision.step < 0 && phase() === 'decided') Object.assign(decision, { step: stepNo, tickBefore: before, tickAfter: room.tick, state: { ...r.state } });
  };
  const steps = (until: () => boolean, seconds = 120): void => { for (let i = 0; i < seconds * TICK_HZ && !until(); i++) step(); };
  steps(() => phase() === 'play');
  expect(phase()).toBe('play');
  const startedAt = r.state.startedAt ?? 0;
  /** An enemy's applied hit through the room's own `combat()`: `health` off the target's chest. */
  const hit = (a: number, t: number, health: number): void => {
    const target = room.player(t)! as unknown as { health: { hp: number[]; armour: number[] } };
    const healthBefore = [...target.health.hp], armourBefore = [...target.health.armour];
    target.health.hp[1]! -= health;
    r.combat(room.player(a), room.player(t), { status: 'applied', request: 'fire', healthBefore, armourBefore });
  };
  const kill = (victim: number, killer: number): void => r.kill.call(room, room.player(victim), room.player(killer), null, 'weapon', 0);
  const of = (c: Client): Seen[] => seen.get(c)!;
  const told = (type: string): boolean => of(watcher).some((s) => s.ev.type === type);
  return { room, r, cs, watcher, recorded, join, phase, step, steps, startedAt, hit, kill, of, told, decision };
}
type Game = ReturnType<typeof game>;

/** Every run's ledger: 1 hit 2 for 6, 3 hit 1 for 4, 4 hit 3 for 2.5 -- each enemy's, 2 and 3 alive after. */
function ledger(g: Game): void { g.hit(1, 2, 6); g.hit(3, 1, 4); g.hit(4, 3, 2.5); }
/** Intake item 2 (C): the DMG points of a wound of `raw` off a fresh chest's arm (`hit` takes it off `hp[1]`). */
const pt = (raw: number): number => dmgTrack().hit(1, raw);
const EXPECTED: Record<number, Omit<DamageReport, 'type' | 'round'>> = {
  1: { taken: [{ from: 3, hits: 1, health: pt(4) }], dealt: [{ to: 2, hits: 1, health: pt(6) }] },
  2: { taken: [{ from: 1, hits: 1, health: pt(6) }], dealt: [] },
  3: { taken: [{ from: 4, hits: 1, health: pt(2.5) }], dealt: [{ to: 1, hits: 1, health: pt(4) }] },
  4: { taken: [], dealt: [{ to: 3, hits: 1, health: pt(2.5) }] },
};
const report = (id: number): DamageReport => ({ type: 'damageReport', round: 1, ...EXPECTED[id]! });

/** One way a classic round is won: how it is played to its decision, its winner, its reason and its hold (the code's). */
interface Win { name: string; reason: string; winner: string; hold: number; event: ServerEvent | null; play(g: Game): void; opts?: { gameType?: number; roundSeconds?: number } }
const watchEnd = (g: Game): number => g.startedAt + eliminationWatchS(modeRules(5)) * TICK_HZ;
const extractionWin = (reason: 'rescue' | 'hostageKills'): Win => {
  const winner = reason === 'rescue' ? 'seal' : 'terrorist';
  return {
    name: `EXTRACTION's '${reason}'`, reason, winner, hold: 23, event: { type: 'eliminated', winner, reason } as ServerEvent,
    play: (g) => {
      g.steps(() => g.room.tick >= watchEnd(g) - 1);
      g.r.extraction = standIn({ result: () => ({ winner, hold: 23, reason }), startStopped: () => false, takePenalties: () => 0, hostages: [], bodies: () => [], wire: () => ({}) });
      g.steps(() => g.phase() === 'decided', 2);
      g.r.extraction = null;
    },
  };
};
const WINS: Win[] = [
  {
    name: 'an elimination', reason: 'elimination', winner: 'terrorist', hold: eliminatedHoldS('MP99'), event: { type: 'eliminated', winner: 'terrorist' },
    play: (g) => { g.kill(2, 1); g.kill(3, 4); g.steps(() => g.phase() === 'decided'); },   // the SEAL side gone
  },
  extractionWin('rescue'),
  extractionWin('hostageKills'),
  {
    name: "a bomb's result (defused)", reason: 'bomb', winner: 'seal', hold: resultHoldS('defused', 5), event: null,
    play: (g) => {
      g.r.bomb = standIn({ result: () => ({ winner: 'seal', kind: 'defused' }), planted: false, wire: () => ({}) });
      g.step();
      g.r.bomb = null;
    },
  },
  {
    name: 'a time-out win (BREACH: timedOut)', reason: 'timeout', winner: 'terrorist', hold: timeoutHoldS(1)!, event: { type: 'timedOut', winner: 'terrorist' },
    play: (g) => g.steps(() => g.phase() === 'decided'), opts: { gameType: 1, roundSeconds: 20 },
  },
];

/** A won round played from its ledger through its decision and its hold to the next round's start. */
function wonRound(win: Win, o: { silent?: boolean; reasons?: string[]; midRound?: boolean; inHold?: boolean } = {}) {
  const g = game({ ...win.opts, silent: o.silent, reasons: o.reasons });
  const late = o.midRound ? g.join(5) : null;                   // seated after the round's start, before the decision
  ledger(g);
  win.play(g);
  expect(g.decision.state, win.name).toMatchObject({ phase: 'decided', reason: win.reason, winner: win.winner });
  const hold = o.inHold ? g.join(6) : null;                     // seated in the hold, after the decision
  g.steps(() => g.told('roundOver'));
  const over = { ...g.r.state };
  const starts = (): number => g.of(g.watcher).filter((s) => s.ev.type === 'roundStart').length;
  const first = starts();
  g.steps(() => starts() > first && g.phase() === 'play');
  return { ...g, over, late, hold };
}

const at = (list: Seen[], type: string): Seen => list.find((s) => s.ev.type === type)!;
const indexOf = (list: Seen[], type: string): number => list.findIndex((s) => s.ev.type === type);
const reportsOf = (list: Seen[]): Seen[] => list.filter((s) => isReport(s.ev));

describe('WM-DATA-WIN: every win sends each player his round report at the decision (DAMAGE_REPORT_ADAPTATION, WM.R24)', () => {
  it('the set names every reason the room decides a round for (DAMAGE_REPORT_AT_WIN_REASONS)', () => {
    const set = (roomModule as Record<string, unknown>).DAMAGE_REPORT_AT_WIN_REASONS as Iterable<string> | undefined;
    expect(set).toBeDefined();
    expect([...set!].sort()).toEqual([...ALL_REASONS].sort());
  });

  for (const win of WINS) {
    it(`${win.name}: each player's own report in the step that decides, before roundOver, with the round's ledger`, () => {
      const g = wonRound(win);
      if (win.event) expect(at(g.of(g.watcher), win.event.type).ev).toEqual(win.event);
      g.cs.forEach((c, i) => {
        const list = g.of(c), id = i + 1, first = reportsOf(list)[0];
        expect(first?.step, `player ${id}: a report in the deciding step`).toBe(g.decision.step);
        expect(first!.phase, `player ${id}`).toBe('decided');
        if (win.event) expect(list.indexOf(first!), `player ${id}: after the decision's event`).toBeGreaterThan(indexOf(list, win.event.type));
        expect(list.indexOf(first!), `player ${id}`).toBeLessThan(indexOf(list, 'roundOver'));
        expect(first!.ev, `player ${id}`).toEqual(report(id));
      });
    });

    it(`${win.name}: again at roundOver (the final ledger), two a player; never to the watcher or the recorder`, () => {
      const g = wonRound(win);
      g.cs.forEach((c, i) => {
        const list = g.of(c), id = i + 1, reports = reportsOf(list);
        expect(reports.map((s) => s.ev), `player ${id}`).toEqual([report(id), report(id)]);
        expect(list.indexOf(reports[1]!), `player ${id}: the second follows roundOver at once`).toBe(indexOf(list, 'roundOver') + 1);
      });
      expect(reportsOf(g.of(g.watcher))).toEqual([]);
      expect(g.recorded.some(isReport)).toBe(false);
    });
  }

  it('a ghost of the round gets none: a seat joined mid-round (before the decision) and one joined in the hold, as at roundOver today', () => {
    const g = wonRound(WINS[0]!, { midRound: true, inHold: true });
    expect(at(g.of(g.watcher), 'eliminated').ev).toEqual({ type: 'eliminated', winner: 'terrorist' });   // the late seat changed nothing
    for (const c of [g.late!, g.hold!]) {
      const list = g.of(c);
      expect(list.find((s) => s.ev.type === 'welcome')?.ev).toMatchObject({ role: 'player' });   // a seat, not a watcher
      expect(reportsOf(list)).toEqual([]);
    }
  });

  it("the set reduced to ['elimination'] (the room's copy): an elimination still sends at the decision, the other wins at roundOver only", () => {
    const narrow = ['elimination'];
    const e = wonRound(WINS[0]!, { reasons: narrow });
    e.cs.forEach((c) => expect(reportsOf(e.of(c))[0]?.step).toBe(e.decision.step));
    for (const win of WINS.slice(1)) {
      const g = wonRound(win, { reasons: narrow });
      g.cs.forEach((c) => {
        const list = g.of(c);
        expect(reportsOf(list).map((s) => list.indexOf(s)), win.name).toEqual([indexOf(list, 'roundOver') + 1]);
      });
    }
  });
});

describe('WM-DATA-WIN: nothing is sent before a win -- a live round tells no player his numbers', () => {
  it('a live classic round with hits and a death (no side gone): no report to anyone until the clock; then the draw\'s one after roundOver', () => {
    const g = game({ roundSeconds: 30 });
    ledger(g);
    g.steps(() => false, 5);
    g.hit(2, 4, 3); g.kill(2, 4);                                 // one SEAL down, one standing: no elimination
    g.steps(() => false, 5);
    g.hit(3, 4, 1);
    g.steps(() => g.told('roundOver'));
    for (const c of [...g.cs, g.watcher]) {
      const list = g.of(c), over = indexOf(list, 'roundOver');
      expect(list.slice(0, over).filter((s) => isReport(s.ev))).toEqual([]);
      for (const s of reportsOf(list)) expect(s.phase).toBe('over');
    }
  });

  for (const win of WINS) {
    it(`${win.name}: no report reaches a player while the round is live (each arrives with the room decided or over)`, () => {
      const g = wonRound(win);
      for (const c of g.cs) for (const s of reportsOf(g.of(c)).filter((x) => x.step <= g.decision.step)) expect([s.step, s.phase]).toEqual([g.decision.step, 'decided']);
      for (const c of g.cs) expect(reportsOf(g.of(c)).every((s) => s.phase !== 'play')).toBe(true);
    });
  }
});

describe("WM-DATA-WIN: every other end keeps today's one report, after roundOver", () => {
  /** Each player's stream: no round report before `roundOver`, exactly one, following it at once; the watcher none. */
  function onlyAtRoundOver(g: Game): void {
    g.steps(() => g.told('roundOver'));
    expect(g.told('roundOver')).toBe(true);
    for (const c of g.cs) {
      const list = g.of(c), over = indexOf(list, 'roundOver');
      expect(reportsOf(list.slice(0, over)).filter((s) => !('life' in s.ev))).toEqual([]);
      expect(reportsOf(list).filter((s) => !('life' in s.ev)).length).toBe(1);
      expect(isReport(list[over + 1]!.ev)).toBe(true);
    }
    expect(reportsOf(g.of(g.watcher))).toEqual([]);
  }

  it('a time-out draw (SUPPRESSION: the clock at 00:00, no decision, no hold)', () => {
    const g = game({ roundSeconds: 20 });
    ledger(g);
    onlyAtRoundOver(g);
    expect(g.decision.step).toBe(-1);
    expect(g.told('eliminated') || g.told('timedOut')).toBe(false);
    expect((at(g.of(g.watcher), 'roundOver').ev as { winner: unknown }).winner).toBeNull();
  });

  it("a respawn room's round (no decided phase): its round report after roundOver alone", () => {
    const g = game({ rules: 'respawn', roundSeconds: 20 });
    ledger(g);
    onlyAtRoundOver(g);
    expect(g.decision.step).toBe(-1);
  });
});

describe("WM-DATA-WIN: the original's flow at a win is unchanged -- only the players' own report sends differ", () => {
  for (const win of WINS) {
    it(`${win.name}: every broadcast (bytes and tick), the recorder, each stream less its reports and the room's states equal a silenced run`, () => {
      const on = wonRound(win), off = wonRound(win, { silent: true });
      expect(off.cs.some((c) => c.frames.some(isReportFrame))).toBe(false);   // the control sent none
      const strip = (list: Seen[]): [number, string][] => list.filter((s) => !isReport(s.ev)).map((s) => [s.tick, s.frame]);
      expect(strip(on.of(on.watcher))).toEqual(strip(off.of(off.watcher)));
      expect(on.of(on.watcher).length).toBe(off.of(off.watcher).length);
      expect(JSON.stringify(on.recorded)).toBe(JSON.stringify(off.recorded));
      on.cs.forEach((c, i) => {
        expect(strip(on.of(c))).toEqual(strip(off.of(off.cs[i]!)));
        expect(c.frames.filter((f) => !isReportFrame(f))).toEqual(off.cs[i]!.frames);   // the binary snapshots too
      });
      expect([on.room.tick, on.decision, on.over]).toEqual([off.room.tick, off.decision, off.over]);
    });

    it(`${win.name}: the ticks are the code's -- the decision, roundOver after its hold, the next round after the read and ROUND COMPLETE`, () => {
      const g = wonRound(win);
      const w = g.of(g.watcher), d = g.decision.state!;
      const decidedAt = d.resultAt! - win.hold * TICK_HZ;            // the tick the room decided on
      expect(decidedAt).toBeGreaterThanOrEqual(g.decision.tickBefore);
      expect(decidedAt).toBeLessThanOrEqual(g.decision.tickAfter);
      if (win.event) expect(at(w, win.event.type).tick).toBe(decidedAt);
      if (win.reason === 'elimination') expect(decidedAt).toBe(watchEnd(g));
      const over = at(w, 'roundOver').tick;
      expect(over).toBe(d.resultAt);
      expect(g.over).toMatchObject({ phase: 'over', nextAt: over + (ENGINE_READ_S + ROUND_COMPLETE_S) * TICK_HZ });
      expect(w.filter((s) => s.ev.type === 'roundStart').at(-1)!.tick).toBe(over + (ENGINE_READ_S + ROUND_COMPLETE_S) * TICK_HZ);
      const from = w.findIndex((s) => s.ev.type === 'roundOver');
      expect(w.slice(from, from + 2).map((s) => s.ev.type)).toEqual(['roundOver', 'score']);   // endRound's two broadcasts
    });
  }
});
