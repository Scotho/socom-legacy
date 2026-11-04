import { describe, expect, it } from 'vitest';
import { RULE_ACTION_SPECS, RULES_SCHEMA, RULES_VOCABULARY_VERSION } from '@s2u/creator-contracts';
import { RuleHost, type RulePlayer, type RuleRoom, type RulesWire } from '../../src/creator/rules';
import { rulesRoom, ticks, type V3 } from './rulesHarness';

/**
 * FCW-31's review folds (`review-fcw-31-rule-host.md`). F1: a match ended by a rule answering `round.end` is that
 * round's end of the match -- its `roundOver` and its report final, `match.end` heard -- not a flag set on a round
 * already told as not final. F4: `hit.scale` factors multiply across the rules that match, the product held to the
 * contract's 0..10 (`RULE_ACTION_SPECS['hit.scale'].params.factor`).
 */

type Json = Record<string, unknown>;
const spec = (rest: Json): Json => ({ schema: RULES_SCHEMA, vocabulary: RULES_VOCABULARY_VERSION, id: 'test.folds', name: 'Folds', ...rest });

describe('FCW-31 F1: a match ended at a round\'s end by the rules', () => {
  it('"two rounds won -> match.end": the second round\'s roundOver and report are final, match.end is heard', () => {
    const BEST_OF_TWO = spec({
      variables: [{ id: 'tw', scope: 'match', type: 'int', start: 0, min: 0, max: 100, reset: 'match' }],
      rules: [
        { id: 'quick', when: 'round.start', then: [{ do: 'round.end', winner: 'terrorist' }] },
        { id: 'count', when: 'round.end', if: [{ test: 'compare', left: { field: 'winner' }, op: '=', right: 'terrorist' }], then: [{ do: 'variable.add', var: 'tw', amount: 1 }] },
        { id: 'final', when: 'round.end', if: [{ test: 'compare', left: { var: 'tw' }, op: '>=', right: 2 }], then: [{ do: 'match.end', winner: 'terrorist' }] },
      ],
    });
    const host = new RuleHost();
    expect(host.enable(BEST_OF_TWO, 3).diagnostics).toEqual([]);
    const r = rulesRoom([[0, 0, 0], [150, 0, 0]], { rules: 'classic', roundSeconds: 20, launchCountdownS: 1, ruleHost: host });
    r.run([], ticks(1) + ticks(10));
    expect(r.reports.map((x) => [x.round, x.matchOver])).toEqual([[1, false], [2, true]]);
    const overs = r.clients[0]!.of('roundOver');
    expect(overs.map((o) => o['matchOver'])).toEqual([false, true]);
    expect((overs[1]!['screens'] as { screen: string }[]).map((s) => s.screen)).toEqual(['finalRound', 'gameComplete']);
    expect(host.snapshot().heard['match.end']).toBe(1);
  });
});

describe('FCW-31 F4: hit.scale across rules', () => {
  class StubRoom implements RuleRoom {
    tick = 1;
    readonly seats: RulePlayer[] = [
      { id: 1, team: 'terrorist', alive: true, out: false, feet: [0, 0, 0] as V3 },
      { id: 2, team: 'seal', alive: true, out: false, feet: [100, 0, 0] as V3 },
    ];
    players(): readonly RulePlayer[] { return this.seats; }
    inRound(): boolean { return true; }
    damage(): void { /* none here */ }
    eliminate(): void { /* none here */ }
    award(): void { /* none here */ }
    endRound(): void { /* none here */ }
    endMatch(): void { /* none here */ }
    door(): boolean { return false; }
    respawn(): void { /* none here */ }
    tell(_ev: RulesWire, _to?: number): void { /* none here */ }
    drop(): void { /* none here */ }
  }
  const scaled = (factors: number[]): number => {
    const host = new RuleHost();
    const report = host.enable(spec({ rules: factors.map((f, i) => ({ id: `s${i}`, when: 'player.hit', then: [{ do: 'hit.scale', factor: f }] })) }), 1);
    expect(report.diagnostics).toEqual([]);
    host.attach(new StubRoom());
    host.event({ name: 'match.start' });
    host.event({ name: 'round.start' });
    host.endStep();
    return host.hit({ name: 'player.hit', attacker: 1, victim: 2, fields: { weapon: 'M4A1', weaponClass: 'rifle', amount: 36 } });
  };
  it('the factors multiply, the product held to the contract\'s 0..10', () => {
    const max = RULE_ACTION_SPECS['hit.scale'].params['factor']!.max!;
    expect(max).toBe(10);
    expect(scaled([2, 3])).toBe(6);
    expect(scaled([10, 10])).toBe(max);
    expect(scaled([10, 10, 10])).toBe(max);
    expect(scaled([0.5, 0])).toBe(0);
  });
});
