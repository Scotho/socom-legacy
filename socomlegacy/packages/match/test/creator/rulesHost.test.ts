import { describe, expect, it } from 'vitest';
import { RULE_EVENTS_PER_TICK_ADAPTATION, RULES_CODES, RULES_SCHEMA, RULES_VOCABULARY_VERSION } from '@s2u/creator-contracts';
import { RuleHost, type RuleEvent, type RulePlayer, type RuleRoom, type RulesWire } from '../../src/creator/rules';
import { duelScript, rulesRoom, ticks, type V3 } from './rulesHarness';

/**
 * FCW-31 RED (the plan's FCW-31 row; spec §5, §6, §10): a synthetic rules pack in the room. An event fires a rule once
 * per sequence id (a duplicate dropped); a forged or stale client request is refused with a named reason; a storm past
 * `RULE_EVENTS_PER_TICK_ADAPTATION` disables the pack's rules for the round with a diagnostic; a reset mid-chain leaves
 * no rule state; pack-off restores the retail round exactly.
 */

type Json = Record<string, unknown>;
const spec = (rest: Json): Json => ({ schema: RULES_SCHEMA, vocabulary: RULES_VOCABULARY_VERSION, id: 'test.synthetic', name: 'Synthetic', ...rest });
const COUNTER = spec({
  variables: [{ id: 'n', scope: 'match', type: 'int', start: 0, min: 0, max: 1000 }],
  entities: { doors: ['lever'] },
  rules: [{ id: 'count', when: 'interact', then: [{ do: 'variable.add', var: 'n', amount: 1 }] }],
});

/** A room as the host sees it: two players, nothing applied but recorded. */
class StubRoom implements RuleRoom {
  tick = 1;
  readonly applied: string[] = [];
  readonly told: (RulesWire & { to?: number })[] = [];
  readonly drops: string[] = [];
  readonly seats: RulePlayer[] = [
    { id: 1, team: 'terrorist', alive: true, out: false, feet: [0, 0, 0] },
    { id: 2, team: 'seal', alive: true, out: false, feet: [100, 0, 0] },
  ];
  players(): readonly RulePlayer[] { return this.seats; }
  inRound(): boolean { return true; }
  damage(id: number, amount: number, cause: string): void { this.applied.push(`damage ${id} ${amount} ${cause}`); }
  eliminate(id: number): void { this.applied.push(`eliminate ${id}`); }
  award(to: { player: number } | { team: 'seal' | 'terrorist' }, points: number): void { this.applied.push(`award ${JSON.stringify(to)} ${points}`); }
  endRound(winner: 'seal' | 'terrorist' | null): void { this.applied.push(`endRound ${winner}`); }
  endMatch(winner: 'seal' | 'terrorist' | null): void { this.applied.push(`endMatch ${winner}`); }
  door(id: string, open: boolean): boolean { this.applied.push(`door ${id} ${open}`); return true; }
  respawn(id: number, _at: V3, _yaw: number, spawner: string): void { this.applied.push(`respawn ${id} ${spawner}`); }
  tell(ev: RulesWire, to?: number): void { this.told.push(to === undefined ? ev : { ...ev, to }); }
  drop(id: number, why: string): void { this.drops.push(`${id} ${why}`); }
}

/** A host on the stub room with `rules` enabled and its round started. */
function hosted(rules: Json): { host: RuleHost; room: StubRoom } {
  const host = new RuleHost();
  const report = host.enable(rules, 7);
  expect(report.diagnostics).toEqual([]);
  const room = new StubRoom();
  host.attach(room);
  host.event({ name: 'match.start' });
  host.event({ name: 'round.start' });
  host.endStep();
  expect(host.snapshot().state).toBe('on');
  return { host, room };
}

describe('FCW-31: a rule fires once per event', () => {
  it('a duplicate of an event (its sequence id again) is dropped, never handled twice', () => {
    const { host, room } = hosted(COUNTER);
    room.tick = 2;
    const ev: RuleEvent = { seq: 1000, tick: 2, name: 'interact', depth: 0, player: 1, id: 'lever' };
    expect(host.deliver(ev)).toBe(true);
    expect(host.deliver(ev)).toBe(false);                                // the same id: dropped
    expect(host.deliver({ ...ev, seq: 999 })).toBe(false);               // an older one: dropped
    host.endStep();
    expect(host.snapshot().variables['n']).toBe(1);
    host.event({ name: 'interact', player: 2, id: 'lever' });           // the room's next: numbered past it
    host.endStep();
    expect(host.snapshot().variables['n']).toBe(2);
  });
});

describe('FCW-31: client requests are the room\'s to answer', () => {
  const SHOP = spec({
    variables: [{ id: 'cash', scope: 'player', type: 'int', start: 300, min: 0, max: 100000, reset: 'match' }],
    items: [
      { id: 'medkit', grants: { kind: 'token' }, price: 250, stock: 1, currency: 'cash' },
      { id: 'rifle', grants: { kind: 'token' }, price: 1000, stock: 5, currency: 'cash' },
    ],
    rules: [{ id: 'buy', when: 'purchase.request', then: [{ do: 'purchase.accept' }] }],
  });
  const answers = (c: { of(t: string): Record<string, unknown>[] }) => c.of('rulesPurchase').map((e) => [e['seq'], e['result'], e['reason'] ?? null]);

  it('a forged item is dropped, a stale price, no funds and no stock refused by name, a duplicate dropped, a request after the round refused (phase)', () => {
    const host = new RuleHost();
    expect(host.enable(SHOP, 3).diagnostics).toEqual([]);
    const r = rulesRoom([[0, 0, 0], [150, 0, 0]], { rules: 'respawn', roundSeconds: 4, ruleHost: host });
    r.run([], ticks(1));
    const ask = (seq: number, item: string, price: number): void => r.room.text(2, { type: 'rulePurchase', seq, item, price } as never);
    ask(1, 'nothing', 10); r.tick();                                    // forged: no such item
    ask(2, 'medkit', 100); r.tick();                                    // a stale price (the client's, not the room's)
    ask(3, 'rifle', 1000); r.tick();                                    // 300 cash: funds
    ask(4, 'medkit', 250); r.tick();                                    // accepted: 50 left, the stock spent
    ask(4, 'medkit', 250); r.tick();                                    // the same request again: dropped
    ask(5, 'medkit', 250); r.tick();                                    // no stock
    expect(answers(r.clients[1]!)).toEqual([[2, 'refused', 'price'], [3, 'refused', 'funds'], [4, 'accepted', null], [5, 'refused', 'stock']]);
    const drops = r.room.takeDrops() ?? {};
    expect(drops['rulePurchase: unknown item']).toBe(1);
    expect(drops['rulePurchase: stale']).toBe(1);
    const snap = host.snapshot();
    expect(snap.variables['cash@2']).toBe(50);
    expect(snap.inventories[2]).toEqual(['medkit']);
    r.run([], ticks(4) + ticks(1));                                     // the round is over
    ask(6, 'rifle', 1000); r.tick();
    expect(answers(r.clients[1]!).at(-1)).toEqual([6, 'refused', 'phase']);
    expect(r.clients[0]!.of('rulesPurchase')).toHaveLength(0);           // answered to the requester only
  });

  it('a request no rule accepts is refused once, after the room\'s own checks', () => {
    const host = new RuleHost();
    expect(host.enable(spec({ ...SHOP, rules: [{ id: 'never', when: 'purchase.accepted', then: [{ do: 'message.show', text: 'x' }] }] }), 3).diagnostics).toEqual([]);
    const r = rulesRoom([[0, 0, 0], [150, 0, 0]], { rules: 'respawn', roundSeconds: 4, ruleHost: host });
    r.run([], ticks(1));
    r.room.text(2, { type: 'rulePurchase', seq: 1, item: 'medkit', price: 250 } as never); r.tick();
    expect(answers(r.clients[1]!)).toEqual([[1, 'refused', 'phase']]);
    expect(host.snapshot().variables['cash@2'] ?? 300).toBe(300);
  });
});

describe('FCW-31: the budgets at run time', () => {
  it(`a storm past RULE_EVENTS_PER_TICK_ADAPTATION (${RULE_EVENTS_PER_TICK_ADAPTATION}) disables the pack's rules for the round, naming the rule; nothing of that tick is applied`, () => {
    const { host, room } = hosted(spec({ ...COUNTER, rules: [{ id: 'count', when: 'interact', then: [{ do: 'variable.add', var: 'n', amount: 1 }, { do: 'score.award', who: 'player', points: 1 }] }] }));
    room.tick = 2;
    for (let i = 0; i <= RULE_EVENTS_PER_TICK_ADAPTATION; i++) host.event({ name: 'interact', player: 1, id: 'lever' });
    host.endStep();
    const snap = host.snapshot();
    expect(snap.state).toBe('tripped');
    expect(snap.diagnostics.map((d) => d.code)).toContain(RULES_CODES.budget);
    expect(snap.diagnostics.find((d) => d.code === RULES_CODES.budget)!.text).toMatch(/count/);
    expect(room.applied.filter((a) => a.startsWith('award'))).toEqual([]);   // never a partial run
    expect(snap.variables['n'] ?? 0).toBe(0);
    room.tick = 3;
    host.event({ name: 'interact', player: 1, id: 'lever' });
    host.endStep();
    expect(host.snapshot().variables['n'] ?? 0).toBe(0);                // off for the round
    host.event({ name: 'round.start' });                               // the next round: on again, from its start
    host.endStep();
    host.event({ name: 'interact', player: 1, id: 'lever' });
    host.endStep();
    expect(host.snapshot().state).toBe('on');
    expect(host.snapshot().variables['n']).toBe(1);
  });
});

describe('FCW-31: lifecycle', () => {
  it('a reset mid-chain (the pack switched off by the round end its first step caused) leaves no rule state and runs nothing more', () => {
    const CHAIN = spec({
      phases: ['a', 'b'],
      variables: [{ id: 'reached', scope: 'match', type: 'bool', start: false }],
      rules: [
        { id: 'first', when: 'round.start', then: [{ do: 'phase.set', phase: 'b' }, { do: 'round.end', winner: 'seal' }] },
        { id: 'second', when: { event: 'phase.change', phase: 'b' }, then: [{ do: 'variable.set', var: 'reached', value: true }, { do: 'score.award', team: 'seal', points: 7 }] },
      ],
    });
    const host = new RuleHost();
    expect(host.enable(CHAIN, 1).diagnostics).toEqual([]);
    let cut = false;
    const r = rulesRoom([[0, 0, 0], [150, 0, 0]], {
      rules: 'classic', roundSeconds: 20, launchCountdownS: 1, ruleHost: host,
      onRoundOver: () => { if (!cut) { cut = true; host.disable(); } },
    });
    r.run([], ticks(1) + 10);
    expect(cut).toBe(true);
    const snap = host.snapshot();
    expect(snap.state).toBe('off');
    expect(snap.variables).toEqual({});
    expect(snap.phase).toBeNull();
    expect(snap.pending).toBe(0);
    expect(snap.fired.map((f) => f.rule)).not.toContain('second');
    const score = r.clients[0]!.of('score').at(-1) as { teamScore?: Record<string, number> } | undefined;
    expect(score?.teamScore?.['seal'] ?? 0).toBe(0);                     // the chain's award never reached the room
  });

  it('pack-off restores the retail round exactly: a pack switched off before its effect leaves the recording main\'s; kept on, it differs', () => {
    const NO_DAMAGE = spec({ rules: [{ id: 'paint', when: 'player.hit', then: [{ do: 'hit.scale', factor: 0 }] }] });
    const opts = { rules: 'respawn' as const, roundSeconds: 8 };
    const until = ticks(14);
    const retail = rulesRoom([[0, 0, 0], [150, 0, 0]], opts);
    retail.run(duelScript(), until);
    const off = new RuleHost();
    expect(off.enable(NO_DAMAGE, 9).diagnostics).toEqual([]);
    const switched = rulesRoom([[0, 0, 0], [150, 0, 0]], { ...opts, ruleHost: off });
    switched.run(duelScript(), until, (t) => { if (t === ticks(0.5)) off.disable(); });
    expect(off.snapshot().state).toBe('off');
    expect(switched.recorder.lines).toEqual(retail.recorder.lines);
    expect(switched.reports.map((x) => JSON.stringify(x))).toEqual(retail.reports.map((x) => JSON.stringify(x)));
    const on = new RuleHost();
    expect(on.enable(NO_DAMAGE, 9).diagnostics).toEqual([]);
    const kept = rulesRoom([[0, 0, 0], [150, 0, 0]], { ...opts, ruleHost: on });
    kept.run(duelScript(), until);
    expect(kept.recorder.lines.some((l) => l.includes('"type":"kill"'))).toBe(false);   // no damage: no kill
    expect(retail.recorder.lines.some((l) => l.includes('"type":"kill"'))).toBe(true);
  });

  it('no rule state survives the match: the next match starts from the declared starts', () => {
    const KEEP = spec({
      variables: [{ id: 'm', scope: 'match', type: 'int', start: 0, min: 0, max: 100, reset: 'match' }],
      rules: [{ id: 'tally', when: 'round.start', then: [{ do: 'variable.add', var: 'm', amount: 1 }] }],
    });
    const { host } = hosted(KEEP);
    expect(host.snapshot().variables['m']).toBe(1);
    host.event({ name: 'round.end', fields: { winner: 'none' } }); host.endStep();
    host.event({ name: 'round.start' }); host.endStep();
    expect(host.snapshot().variables['m']).toBe(2);                     // match-scoped: kept across the rounds
    host.event({ name: 'round.end', fields: { winner: 'none' } }); host.event({ name: 'match.end', fields: { winner: 'none' } }); host.endStep();
    host.event({ name: 'match.start' }); host.event({ name: 'round.start' }); host.endStep();
    expect(host.snapshot().variables['m']).toBe(1);                     // a new match: from its start again
  });
});
