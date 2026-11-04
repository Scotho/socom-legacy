// test/replayFold.test.ts -- PTT-6 (web sprint 37; W37.R4; research 244 §7): the event kinds' one table, checked against
// `ServerEvent`'s union, and the fold's bound over a 30-minute segment
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ReplayRecord } from '../../match/src/replay/format';
import { SNAPSHOT_HZ, TICK_HZ, type ServerEvent } from '../src/net/protocol';
import { emptyFold, EVENT_CLASS, foldedJoin, foldEvent, foldTo, REPLAY_FOLD_BOUND_MS_ADAPTATION } from '../src/replay/fold';
import { ALPHA, BRAVO, body, header } from './replayFixture';

/**
 * The union's kinds, read from `protocol.ts`'s text (vitest does not typecheck, so this is the run-time half of the
 * table's check; the typecheck's half is `EVENT_CLASS`'s type, `Record<ServerEvent['type'], ...>`): each member's
 * `type: '<kind>'`, and for a member named by its interface (`| CombatReport`) that interface's own.
 */
function unionKinds(): string[] {
  const src = readFileSync(resolve(import.meta.dirname, '../src/net/protocol.ts'), 'utf8');
  const from = src.indexOf('export type ServerEvent =');
  const close = /\n {2}\};\r?\n/.exec(src.slice(from));     // the union's last member closes it (CRLF or LF)
  const body = src.slice(from, close ? from + close.index + close[0].length : src.length);
  const code = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');   // comments name kinds in passing
  const kinds = new Set([...code.matchAll(/\btype: '([A-Za-z]+)'/g)].map((m) => m[1]!));
  for (const m of code.matchAll(/^\s*\|\s*([A-Z][A-Za-z]+)\s*$/gm)) {
    const iface = new RegExp(`export interface ${m[1]} \\{[\\s\\S]*?\\btype: '([A-Za-z]+)'`).exec(src);
    if (iface) kinds.add(iface[1]!);
  }
  return [...kinds].sort();
}

describe('PTT-6: the event kinds, stateful or transient, in one table (W37.R4)', () => {
  it('restores regional bot appearance through roster, assignment, spawn and a lobby reset', () => {
    const records: ReplayRecord[] = [
      { kind: 'header', header: header() },
      { kind: 'players', tick: 0, players: [{ ...ALPHA, character: 'seal:scuba_B83' }] },
      { kind: 'event', tick: 2, event: { type: 'botCharacter', id: ALPHA.id, character: 'seal:scuba_A83' } },
      { kind: 'event', tick: 4, event: { type: 'spawn', id: ALPHA.id, at: [0, 0, 0], yaw: 0, after: 0, character: 'seal:scuba_C83' } },
      { kind: 'event', tick: 6, event: { type: 'botCharacter', id: ALPHA.id, character: null } },
    ];
    expect(foldTo(records, 0, TICK_HZ).state.characters.get(ALPHA.id)).toBe('seal:scuba_B83');
    expect(foldTo(records, 2, TICK_HZ).state.characters.get(ALPHA.id)).toBe('seal:scuba_A83');
    expect(foldTo(records, 4, TICK_HZ).state.characters.get(ALPHA.id)).toBe('seal:scuba_C83');
    expect(foldTo(records, 6, TICK_HZ).state.characters.get(ALPHA.id)).toBeNull();
  });

  it('the table classifies every kind of ServerEvent\'s union and nothing else (a new kind left unclassified fails)', () => {
    const kinds = unionKinds();
    expect(kinds.length).toBeGreaterThan(40);
    expect(Object.keys(EVENT_CLASS).sort()).toEqual(kinds);
  });
  it('W37.R4\'s stateful list is stateful; its transient examples are transient', () => {
    for (const k of ['score', 'roundStart', 'roundTime', 'timeExpired', 'roundOver', 'abandoned', 'kill', 'spawn', 'bomb', 'turret'] as const) {
      expect(EVENT_CLASS[k], k).toBe('stateful');
    }
    for (const k of ['shot', 'impact', 'grenade', 'reloadSound', 'hurtVoice', 'flinch', 'detonate', 'deadAtLoad'] as const) expect(EVENT_CLASS[k], k).toBe('transient');
  });
});

describe('PTT-6: the fold of a 30-minute segment is bounded', () => {
  /**
   * 30 minutes at the room's tick (60 Hz), a snapshot at the wire's rate (every other tick) of eight bodies, a score each
   * second, a shot each 6 ticks, a kill and a spawn each 10 s and a turret change each minute: 74,197 records.
   */
  function longSegment(): ReplayRecord[] {
    const ticks = 30 * 60 * TICK_HZ;
    const every = TICK_HZ / SNAPSHOT_HZ;
    const bodies = [1, 2, 3, 4, 5, 6, 7, 8].map((id) => body(id, id));
    const out: ReplayRecord[] = [{ kind: 'header', header: header() }, { kind: 'players', tick: 0, players: [ALPHA, BRAVO] }];
    const ev = (tick: number, event: ServerEvent): void => { out.push({ kind: 'event', tick, event }); };
    for (let tick = 0; tick <= ticks; tick++) {
      if (tick % TICK_HZ === 0) ev(tick, { type: 'score', rows: [], timeLeft: 600 - (tick / TICK_HZ) % 600, spectators: [], wins: { seal: 0, terrorist: 0 } });
      if (tick % 6 === 0) ev(tick, { type: 'shot', id: 1, weapon: 1, from: [0, 0, 0], to: [1, 0, 0], normal: null, material: null });
      if (tick % (10 * TICK_HZ) === 0) ev(tick, { type: 'kill', killer: 1, victim: 2, weapon: null, how: 'weapon', clip: 'die_back' });
      if (tick % (10 * TICK_HZ) === 5 * TICK_HZ) ev(tick, { type: 'spawn', id: 2, at: [0, 0, 0], yaw: 0, after: 0 });
      if (tick % (60 * TICK_HZ) === 30) ev(tick, { type: 'turret', id: 0, occupant: tick % 2 ? 1 : null, ammo: 100 });
      if (tick % every === 0) out.push({ kind: 'snap', tick, bodies });
    }
    out.push({ kind: 'end', tick: ticks, reason: 'closed' });
    return out;
  }

  it(`folds to the last tick in one pass over the records behind the target, under ${REPLAY_FOLD_BOUND_MS_ADAPTATION} ms`, () => {
    const records = longSegment();
    const last = (records.at(-1) as { tick: number }).tick;
    const mid = Math.floor(last / 2);
    const behind = (t: number): number => records.filter((r) => r.kind !== 'header' && r.tick <= t).length;
    foldTo(records, 600, TICK_HZ);                           // warm the JIT once on a short fold
    let best = Infinity;
    for (let i = 0; i < 3; i++) {                           // the best of three: a loaded host's worst frame is not the fold's
      const t0 = performance.now();
      const { visited, end } = foldTo(records, last, TICK_HZ);
      best = Math.min(best, performance.now() - t0);
      expect(visited).toBe(behind(last));                   // the work: each record behind the target once, none past it
      expect(end).toBe(records.length);
    }
    expect(best).toBeLessThan(REPLAY_FOLD_BOUND_MS_ADAPTATION);
    const half = foldTo(records, mid, TICK_HZ);
    expect(half.visited).toBe(behind(mid));                 // a seek to the middle walks half
    expect(half.state.score?.timeLeft).toBe(600 - (Math.floor(mid / TICK_HZ) % 600));
  });
});

describe("SVC-07c: the seats' told pairs are state -- a joiner is told them after its welcome, so a seek is too", () => {
  it('the last `seatTold` behind the target is folded and told at the seek; none behind it, none told', () => {
    expect(EVENT_CLASS.seatTold).toBe('stateful');
    const s = emptyFold();
    foldEvent(s, { type: 'seatTold', seats: [{ id: 1, rating: 1003, medal: 5 }] }, 10, TICK_HZ);
    foldEvent(s, { type: 'seatTold', seats: [{ id: 2, rating: 990, medal: 4 }, { id: 3, rating: 1012, medal: 3 }] }, 20, TICK_HZ);
    expect(foldedJoin(s, 30, TICK_HZ, []).told).toEqual({ type: 'seatTold', seats: [{ id: 2, rating: 990, medal: 4 }, { id: 3, rating: 1012, medal: 3 }] });
    expect(foldedJoin(emptyFold(), 30, TICK_HZ, []).told).toBeNull();
  });
});
