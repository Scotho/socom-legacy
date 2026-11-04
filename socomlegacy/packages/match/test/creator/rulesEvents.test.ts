import { describe, expect, it } from 'vitest';
import { DEFAULT_RIFLE, itemClass } from '@s2u/scene';
import { RULE_EVENT_SPECS, RULE_EVENTS } from '@s2u/creator-contracts';
import { RuleEventStream, RuleHost, type RuleEvent } from '../../src/creator/rules';
import { duelScript, rulesRoom, ticks, type V3 } from './rulesHarness';

/**
 * FCW-31 GREEN (a): the typed event stream from the room's existing outcomes (spec §4's events, §6's order). Each event
 * carries a room-unique, rising sequence id; its players and fields are the vocabulary's (`RULE_EVENT_SPECS`); it is
 * built only when a rule host is attached, and the host listening changes nothing (`rulesRetailParity.test.ts`).
 */

const AT: readonly V3[] = [[0, 0, 0], [150, 0, 0]];

function heardIn(opts: Parameters<typeof rulesRoom>[1], until: number, from = 0): readonly RuleEvent[] {
  const host = new RuleHost({ keepLog: true });
  const r = rulesRoom(AT, { ...opts, ruleHost: host });
  r.run(duelScript(from), until);
  return host.log();
}

describe('FCW-31: the room\'s outcomes as typed rule events', () => {
  it('numbers each event once, rising, from 1 (RuleEventStream)', () => {
    const s = new RuleEventStream();
    const a = s.emit({ name: 'round.start' }, 5, 0), b = s.emit({ name: 'player.spawn', player: 2 }, 5, 0), c = s.emit({ name: 'round.end', fields: { winner: 'none' } }, 9, 1);
    expect([a.seq, b.seq, c.seq]).toEqual([1, 2, 3]);
    expect(c).toMatchObject({ name: 'round.end', tick: 9, depth: 1, fields: { winner: 'none' } });
  });

  it('a respawn round: its start, the spawns, the hits, the kill and its end, each with the vocabulary\'s players and fields', () => {
    const log = heardIn({ rules: 'respawn', roundSeconds: 8 }, ticks(8) + ticks(18));
    // room-unique and rising
    for (let i = 1; i < log.length; i++) expect(log[i]!.seq).toBeGreaterThan(log[i - 1]!.seq);
    expect(new Set(log.map((e) => e.seq)).size).toBe(log.length);
    for (const e of log) {
      expect(RULE_EVENTS).toContain(e.name);
      const spec = RULE_EVENT_SPECS[e.name];
      for (const f of Object.keys(e.fields ?? {})) expect(Object.keys(spec.fields)).toContain(f);
    }
    const names = log.map((e) => e.name);
    expect(names[0]).toBe('match.start');
    expect(names[1]).toBe('round.start');
    const hit = log.find((e) => e.name === 'player.hit')!;
    expect(hit).toMatchObject({ attacker: 1, victim: 2, fields: { weapon: DEFAULT_RIFLE.name, weaponClass: itemClass(DEFAULT_RIFLE.id) } });
    expect(hit.fields!['weaponClass']).toBe('rifle');
    expect(Number.isInteger(hit.fields!['amount'])).toBe(true);
    const kill = log.find((e) => e.name === 'player.kill')!;
    expect(kill).toMatchObject({ attacker: 1, victim: 2 });
    const death = log.find((e) => e.name === 'player.death')!;
    expect(death.seq).toBeLessThan(kill.seq);                             // the death, then the kill it was
    expect(death).toMatchObject({ victim: 2, attacker: 1 });
    expect(log.filter((e) => e.name === 'player.eliminated')).toHaveLength(0);   // respawn: a death puts no one out
    const end = log.find((e) => e.name === 'round.end')!;
    expect(end.fields).toHaveProperty('winner');
    expect(log.at(-1)!.name === 'match.end' || log.some((e) => e.name === 'match.end')).toBe(true);   // respawn's one round is its match
  });

  it('a classic round: a death puts the victim out (player.eliminated), the decided round ends with its winner', () => {
    const log = heardIn({ rules: 'classic', roundSeconds: 20, launchCountdownS: 1 }, ticks(1) + ticks(40), 1.5);
    const out = log.find((e) => e.name === 'player.eliminated')!;
    const death = log.find((e) => e.name === 'player.death')!;
    expect(out.player).toBe(death.victim);
    expect(out.seq).toBeGreaterThan(death.seq);
    const end = log.find((e) => e.name === 'round.end')!;
    expect(['seal', 'terrorist']).toContain(end.fields!['winner']);
  });

  it('builds nothing without a host: the room holds no stream', () => {
    const r = rulesRoom(AT, { rules: 'respawn', roundSeconds: 8 });
    r.run(duelScript(), ticks(3));
    expect((r.room as unknown as { ruleHost: unknown }).ruleHost).toBeNull();
  });
});
