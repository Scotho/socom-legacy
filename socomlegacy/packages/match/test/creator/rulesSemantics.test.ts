import { describe, expect, it } from 'vitest';
import { DEFAULT_RIFLE, itemClass } from '@s2u/scene';
import { BEHAVIOUR_CAPABILITIES, RULES_CODES, RULES_SCHEMA, RULES_VOCABULARY_VERSION, type LayoutSpawner } from '@s2u/creator-contracts';
import { freshHealth } from '../../../viewer/src/net/damage';
import { RULE_SPAWNER_TEAMS, RuleHost, type RuleLayout, type RulePlayer, type RuleRoom, type RulesWire } from '../../src/creator/rules';
import { BATTLE_ROYALE, PAINTBALL, type Json } from './rulesProofs';
import { duelScript, rulesRoom, ticks, type V3 } from './rulesHarness';

/**
 * FCW-31, from FCW-30's review (the plan's FCW-31 row): the immediate-state rule (paintball's `hit` then `out` puts a
 * player out on one hit; battle royale's final-first ring takes one step per `timer.fire`); the layout's player spawners'
 * teams `A`/`B` as the rules' `seal`/`terrorist`, once; weapon classes as the room's own (`itemClass`, `FUN_003d1a60`
 * L324331-324352); the zombies' chase-melee still reserved (the room owns no authoritative chase or melee).
 */

class StubRoom implements RuleRoom {
  tick = 1;
  readonly applied: string[] = [];
  constructor(readonly seats: RulePlayer[]) {}
  players(): readonly RulePlayer[] { return this.seats; }
  inRound(): boolean { return true; }
  damage(id: number, amount: number, cause: string): void { this.applied.push(`damage ${id} ${amount.toFixed(3)} ${cause}`); }
  eliminate(id: number): void { this.applied.push(`eliminate ${id}`); }
  award(to: { player: number } | { team: 'seal' | 'terrorist' }, points: number): void { this.applied.push(`award ${JSON.stringify(to)} ${points}`); }
  endRound(winner: 'seal' | 'terrorist' | null): void { this.applied.push(`endRound ${winner}`); }
  endMatch(winner: 'seal' | 'terrorist' | null): void { this.applied.push(`endMatch ${winner}`); }
  door(id: string, open: boolean): boolean { this.applied.push(`door ${id} ${open}`); return true; }
  respawn(id: number, _at: V3, _yaw: number, spawner: string): void { this.applied.push(`respawn ${id} ${spawner}`); }
  tell(_ev: RulesWire, _to?: number): void { /* presentation: not read here */ }
  drop(id: number, why: string): void { this.applied.push(`drop ${id} ${why}`); }
}
const SEATS = (): RulePlayer[] => [
  { id: 1, team: 'terrorist', alive: true, out: false, feet: [0, 0, 0] },
  { id: 2, team: 'seal', alive: true, out: false, feet: [100, 0, 0] },
];
function start(host: RuleHost, room: StubRoom): void {
  host.attach(room);
  host.event({ name: 'match.start' });
  host.event({ name: 'round.start' });
  host.endStep();
}
const spawner = (id: string, more: Partial<LayoutSpawner>): LayoutSpawner => ({ id, source: 'player', at: [0, 0, 0], yaw: 0, radius: 50, ...more });

describe('FCW-31: state changes are immediate (FCW-30\'s review F1)', () => {
  it('paintball: `hit` counts the hit before `out` reads the count, so one hit puts the victim out and the side out ends the round', () => {
    const host = new RuleHost();
    expect(host.enable(PAINTBALL, 11).diagnostics).toEqual([]);
    const r = rulesRoom([[0, 0, 0], [150, 0, 0]], { rules: 'classic', roundSeconds: 20, launchCountdownS: 1, ruleHost: host });
    r.run(duelScript(1.5), ticks(1) + ticks(6));
    const firstShot = ticks(1.5) + ticks(1);
    const p2 = r.room.player(2)!;
    expect(p2.alive).toBe(false);
    expect(p2.health.hp).toEqual(freshHealth().hp);                         // hit.scale 0: the paint laid no damage
    const kills = r.clients[0]!.of('kill');
    expect(kills).toHaveLength(1);
    expect(kills[0]).toMatchObject({ victim: 2, how: 'orphan' });            // the rules' elimination, scored to no one
    expect(host.snapshot().heard['player.hit']).toBe(1);                     // one hit was enough
    expect(r.reports).toHaveLength(1);
    expect(r.reports[0]!.wins).toEqual({ seal: 0, terrorist: 1 });           // ALL_OUT: the SEALs out, the Terrorists' round
    const over = r.recorder.lines.find((l) => l.includes('"type":"roundOver"'))!;
    expect((JSON.parse(over) as [string, number])[1] - firstShot).toBeLessThan(ticks(0.5));   // ended by the rule, not the elimination's 15 s watch
    expect(r.clients[0]!.of('rulesPresent').length).toBeGreaterThan(0);      // the client rule's HUD value, as presentation
  });

  it('battle royale: the ring\'s steps written final-first take one step per timer.fire; written first-first, one fire walks them all', () => {
    const layout: RuleLayout = {
      zones: [{ id: 'ring', shape: 'cylinder', at: [0, 0, 0], radius: 1000, height: 400 }],
      markers: [{ id: 'centre', at: [0, 0, 0], yaw: 0 }],
      spawners: [spawner('drops', { radius: 100 }), spawner('loot', { source: 'item', radius: 200 })],
    };
    const phases = (spec: Json): (string | null)[] => {
      const host = new RuleHost({ layout });
      expect(host.enable(spec, 4).diagnostics).toEqual([]);
      const room = new StubRoom(SEATS());
      start(host, room);
      const out = [host.snapshot().phase];
      for (let i = 0; i < 3; i++) {
        room.tick += ticks(90);
        host.endStep();
        out.push(host.snapshot().phase);
        room.tick += ticks(60);                                             // the reshape runs its 60 s
        host.endStep();
      }
      return out;
    };
    expect(phases(BATTLE_ROYALE)).toEqual(['drop', 'shrink1', 'shrink2', 'final']);
    const rules = (BATTLE_ROYALE as { rules: Json[] }).rules;
    const steps = rules.filter((x) => String(x['id']).startsWith('to-'));
    const firstFirst = { ...BATTLE_ROYALE, rules: [rules[0]!, ...[...steps].reverse(), ...rules.filter((x) => x !== rules[0] && !steps.includes(x))] };
    expect(phases(firstFirst)[1]).toBe('final');
  });

  it('battle royale: the round\'s start drops the players, lays the loot, and the ring hurts outside it', () => {
    const host = new RuleHost({
      layout: {
        zones: [{ id: 'ring', shape: 'cylinder', at: [0, 0, 0], radius: 300, height: 400 }],
        markers: [{ id: 'centre', at: [0, 0, 0], yaw: 0 }],
        spawners: [spawner('drops', {}), spawner('loot', { source: 'item', at: [5000, 0, 0] })],
      },
    });
    expect(host.enable(BATTLE_ROYALE, 4).diagnostics).toEqual([]);
    const seats = SEATS();
    seats[1] = { ...seats[1]!, feet: [900, 0, 0] };                       // seat 2 outside the ring
    const room = new StubRoom(seats);
    start(host, room);
    expect(room.applied.filter((a) => a.startsWith('respawn')).sort()).toEqual(['respawn 1 drops', 'respawn 2 drops']);
    expect(host.snapshot().world).toHaveLength(20);
    room.applied.length = 0;
    room.tick++;
    host.endStep();
    expect(room.applied).toEqual([`damage 2 ${(5 / 60).toFixed(3)} hazard`]);
  });
});

describe('FCW-31: the layout\'s player spawners\' teams (FCW-30\'s review F6)', () => {
  it('A is seal and B is terrorist, once (RULE_SPAWNER_TEAMS: the Forge\'s slots put A on side 0, the room\'s side 0 is the SEALs\')', () => {
    expect(RULE_SPAWNER_TEAMS).toEqual({ A: 'seal', B: 'terrorist' });
    const spec: Json = {
      schema: RULES_SCHEMA, vocabulary: RULES_VOCABULARY_VERSION, id: 'test.teams', name: 'Teams',
      entities: { spawners: ['a-side', 'b-side'] },
      rules: [{ id: 'go', when: 'round.start', then: [{ do: 'spawner.release', spawner: 'a-side' }, { do: 'spawner.release', spawner: 'b-side' }] }],
    };
    const host = new RuleHost({ layout: { spawners: [spawner('a-side', { team: 'A' }), spawner('b-side', { team: 'B' })] } });
    expect(host.enable(spec, 1).diagnostics).toEqual([]);
    const room = new StubRoom(SEATS());
    start(host, room);
    expect(room.applied).toEqual(['respawn 2 a-side', 'respawn 1 b-side']);   // seat 2 the SEAL, seat 1 the Terrorist
  });
});

describe('FCW-31: weapon classes are the room\'s own', () => {
  const scaleBy = (weaponClass: string): Json => ({
    schema: RULES_SCHEMA, vocabulary: RULES_VOCABULARY_VERSION, id: 'test.classes', name: 'Classes',
    rules: [{ id: 'scale', when: 'player.hit', then: [{ do: 'hit.scale', factor: 0, weaponClass }] }],
  });
  const kills = (weaponClass: string): number => {
    const host = new RuleHost();
    expect(host.enable(scaleBy(weaponClass), 2).diagnostics).toEqual([]);
    const r = rulesRoom([[0, 0, 0], [150, 0, 0]], { rules: 'respawn', roundSeconds: 8, ruleHost: host });
    r.run(duelScript(), ticks(6));
    return r.clients[0]!.of('kill').length;
  };
  it('the M4A1 is a `rifle` (itemClass, by the kit tables\' id ranges): a `rifle` scale takes its damage, a `pistol` scale does not', () => {
    expect(itemClass(DEFAULT_RIFLE.id)).toBe('rifle');
    expect(kills('rifle')).toBe(0);
    expect(kills('pistol')).toBe(1);
  });
});

describe('FCW-31: the zombies\' chase and melee stay reserved', () => {
  it('the room owns no authoritative chase or melee, so the capability is still reserved and a pack claiming it is refused by name', () => {
    expect(BEHAVIOUR_CAPABILITIES.find((c) => c.id === 'behaviour.zombie.chase-melee')?.status).toBe('reserved');
    const host = new RuleHost();
    const report = host.enable({
      schema: RULES_SCHEMA, vocabulary: RULES_VOCABULARY_VERSION, id: 'test.zombie', name: 'Zombie',
      capabilities: [{ slot: 'behaviour.zombie', handler: 'behaviour.zombie.chase-melee' }],
      rules: [{ id: 'x', when: 'round.start', then: [{ do: 'message.show', text: 'Run' }] }],
    }, 1);
    expect(report.status).toBe('fail');
    expect(report.diagnostics.map((d) => d.code)).toContain(RULES_CODES.capabilityReserved);
    expect(host.snapshot().state).toBe('off');
  });
});
