import { describe, expect, it } from 'vitest';
import { actorProbeEligible, resolveProbeActor, type HostageActor } from '../src/hostageActors';
import { HostageObstacleRecord } from '../src/hostageAvoidance';

const cell = { map: 0, x: 2, z: 3 };
const actor = (id: number, changes: Partial<HostageActor> = {}): HostageActor => ({ id, alive: true, cell,
  velocity: [0, 0, 0], ai: true, stance: 0, excluded: false, yieldTo: null, probeRefused: false, ...changes });

describe('original occupied-cell actor consumer', () => {
  it('requires a live eligible identity and retains supplied neighbor order, comparing x/z only', () => {
    const a = actor(2, { cell: { ...cell, map: 1 } }), b = actor(3);
    expect(resolveProbeActor(1, cell, [actor(4, { alive: false }), actor(5, { excluded: true }), a, b])).toBe(a);
    expect(resolveProbeActor(1, cell, [actor(1)])).toBeNull();
    expect(resolveProbeActor(1, cell, [actor(2, { cell: null })])).toBeNull();
  });
  it('excludes the source before selecting another actor in the same retained cell', () => {
    const source = actor(1), target = actor(2);
    expect(resolveProbeActor(1, cell, [source, target])).toBe(target);
  });
  it('uses strict full-vector speed squared for non-AI targets and the source stance gate', () => {
    const source = actor(1), player = actor(2, { ai: false, velocity: [5, 0, 5] });
    expect(actorProbeEligible(source, player)).toBe(false);
    expect(actorProbeEligible(source, { ...player, velocity: [5, 1, 5] })).toBe(true);
    expect(actorProbeEligible({ ...source, stance: 2, velocity: [8, 0, 0] }, player)).toBe(false);
  });
  it('refuses prone AI, an AI yielding to self, and the source body flag override', () => {
    expect(actorProbeEligible(actor(1), actor(2))).toBe(true);
    expect(actorProbeEligible(actor(1), actor(2, { stance: 2 }))).toBe(false);
    expect(actorProbeEligible(actor(1), actor(2, { yieldTo: 1 }))).toBe(false);
    expect(actorProbeEligible(actor(1, { probeRefused: true }), actor(2))).toBe(false);
  });
  it('stops only fresh type1 records below weight1, without producing map recovery', () => {
    const r = new HostageObstacleRecord();
    r.actor(2, cell, 0.5, true);
    expect(r.actorStops()).toBe(true);
    expect(r.tick(0.01, cell, 1, 0)).toBeNull();
    expect(r.actorStops()).toBe(false);
    r.actor(2, cell, 0.5, true);
    expect(r.actorStops()).toBe(false);
    expect(r.suppressesCorrection).toBe(true);
  });
  it('preserves source identity-change type0 reset and priority of map/hull contacts', () => {
    const r = new HostageObstacleRecord(); r.actor(2, cell, 0.1, true); r.actor(3, cell, 0.1, true);
    expect(r.type).toBe(0);
    r.actor(3, cell, 0.1, true); expect(r.type).toBe(1);
    r.ai(cell, 0.1); r.actor(2, cell, 0.1, true); expect(r.type).toBe(2);
    r.hull([0, 0, 0], cell); r.actor(2, cell, 0.1, true); expect(r.type).toBe(4);
    expect(r.suppressesCorrection).toBe(false);
  });
  it('clears a departed actor and decays a stale contact after five missed frames', () => {
    const r = new HostageObstacleRecord(); r.actor(2, cell, 0.1, true);
    r.retainActor(id => id !== 2); expect(r.type).toBe(0);
    r.actor(2, cell, 0.1, true);
    for (let i = 0; i < 5; i++) r.tick(0.1, cell, 0, 0);
    expect(r.type).toBe(1);
    for (let i = 0; i < 3; i++) r.tick(0.1, cell, 0, 0);
    expect(r.type).toBe(0);
  });
});
