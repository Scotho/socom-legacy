import { describe, expect, it } from 'vitest';
import { planActions, type PlanningAction } from '../src/bots/planner';
import { BotPlan, type BotObservation } from '../src/bots/botPlan';

/** Authored input adaptation: these are design examples, not transcriptions of either game's AI. */
describe('bounded action planning', () => {
  const actions: PlanningAction[] = [
    { name: 'reload', requires: { cover: true, reserve: true }, effects: { loaded: true }, cost: 1 },
    { name: 'cover', requires: { reachable: true }, effects: { cover: true }, cost: 2 },
    { name: 'fire', requires: { loaded: true, visible: true }, effects: { engaged: true }, cost: 1 },
  ];
  const observed = { loaded: false, cover: false, reachable: true, reserve: true, visible: true, engaged: false };
  it('finds prerequisite chains without applying predicted effects to observations', () => {
    const before = structuredClone(observed);
    const result = planActions(observed, { engaged: true }, actions);
    expect(result.status).toBe('found');
    expect(result.actions.map((a) => a.name)).toEqual(['cover', 'reload', 'fire']);
    expect(result.cost).toBe(4);
    expect(observed).toEqual(before);
  });
  it('rejects unreachable goals and terminates cycles deterministically', () => {
    const cyclic = [...actions, { name: 'leave', requires: { cover: true }, effects: { cover: false }, cost: 0 }];
    const result = planActions({ ...observed, reserve: false }, { engaged: true }, cyclic);
    expect(result.status).toBe('unreachable');
    expect(result.expanded).toBeLessThan(10);
    expect(planActions({ ...observed, reserve: false }, { engaged: true }, cyclic)).toEqual(result);
  });
  it('honours the expansion budget and invalid costs', () => {
    expect(planActions(observed, { engaged: true }, actions, 1)).toMatchObject({ status: 'budget', expanded: 1, actions: [] });
    expect(() => planActions(observed, { engaged: true }, [{ ...actions[0]!, cost: -1 }])).toThrow();
  });
});

const observation = (patch: Partial<BotObservation> = {}): BotObservation => ({
  active: true, contact: true, visible: true, atContact: false, inRange: true, lane: true,
  loaded: true, needsReload: false, reloading: false, canReload: true,
  cover: false, protected: false, pressure: false, opening: false, pathFailed: false, contactKey: '1', ...patch,
});

describe('observed bot plan lifecycle', () => {
  it('executes covered reload prerequisites and advances only after observed arrival/completion', () => {
    const plan = new BotPlan();
    const input = observation({ loaded: false, needsReload: true, cover: true });
    expect(plan.update(input)).toMatchObject({ goal: 'resupply', action: 'take-cover', plan: ['take-cover', 'reload'] });
    expect(plan.update(input).action).toBe('take-cover');
    expect(input.loaded).toBe(false);
    expect(plan.update({ ...input, protected: true }).action).toBe('reload');
    expect(plan.update({ ...input, protected: true, reloading: true }).action).toBe('reload');
    expect(plan.update(observation({ cover: true, protected: true, lane: false })).action).toBe('peek');
  });
  it('invalidates fire on loss of sight, blocks failed approaches and never invents visibility while searching', () => {
    const plan = new BotPlan();
    expect(plan.update(observation()).action).toBe('fire');
    const lost = observation({ visible: false, lane: false });
    expect(plan.update(lost)).toMatchObject({ goal: 'find-contact', action: 'investigate' });
    expect(plan.update({ ...lost, pathFailed: true })).toMatchObject({ action: 'search', reason: 'precondition:investigate' });
    expect(plan.update({ ...lost, atContact: true, pathFailed: false }).action).toBe('search');
    expect(plan.update(observation({ lane: false })).action).toBe('approach');
  });
  it('replans for lane, ammunition and new contacts, then cancels on death and reset', () => {
    const plan = new BotPlan();
    plan.update(observation());
    expect(plan.update(observation({ lane: false })).reason).toBe('precondition:fire');
    expect(plan.update(observation({ loaded: false, needsReload: true })).action).toBe('reload');
    expect(plan.update(observation({ contactKey: '2' })).reason).toBe('contact-changed');
    expect(plan.update(observation({ active: false }))).toMatchObject({ goal: 'idle', action: null, plan: [] });
    plan.reset('round-reset');
    expect(plan.snapshot()).toMatchObject({ goal: 'idle', action: null, plan: [], reason: 'round-reset' });
  });
  it('does not repeat an unreachable search until the observations change', () => {
    const plan = new BotPlan(), failed = observation({ pathFailed: true, inRange: false });
    const result = plan.update(failed);
    expect(result).toMatchObject({ action: null, status: 'unreachable' });
    for (let tick = 0; tick < 100; tick++) expect(plan.update(failed)).toEqual(result);
    expect(plan.update({ ...failed, pathFailed: false }).action).toBe('approach');
  });
  it('rebuilds cached prerequisites when an opening ends or cover becomes available', () => {
    const opening = new BotPlan();
    expect(opening.update(observation({ opening: true, inRange: false })).action).toBe('fire');
    const pursuing = observation({ opening: false, inRange: false });
    expect(opening.update(pursuing).plan).toEqual(new BotPlan().update(pursuing).plan);
    expect(opening.snapshot().action).toBe('approach');
    const reload = new BotPlan();
    expect(reload.update(observation({ loaded: false, needsReload: true })).action).toBe('reload');
    const shelteredReload = observation({ loaded: false, needsReload: true, cover: true });
    expect(reload.update(shelteredReload).plan).toEqual(new BotPlan().update(shelteredReload).plan);
    expect(reload.snapshot().action).toBe('take-cover');
  });
  it('continues the last reserve reload after ammunition has been inserted and no new reload can start', () => {
    const plan = new BotPlan();
    const start = observation({ cover: true, protected: true, loaded: false, needsReload: true });
    expect(plan.update(start).action).toBe('reload');
    expect(plan.update({ ...start, needsReload: false, reloading: true, canReload: false }).action).toBe('reload');
  });
  it('is deterministic across the same observations and retains team opening intent', () => {
    const a = new BotPlan(), b = new BotPlan();
    for (const input of [observation({ opening: true }), observation(), observation({ pressure: true, cover: true }),
      observation({ visible: false }), observation({ contact: false, visible: false, contactKey: null })]) {
      expect(a.update(input)).toEqual(b.update(input));
    }
    expect(new BotPlan().update(observation({ opening: true, visible: false })).action).toBe('patrol');
    expect(new BotPlan().update(observation({ opening: true, inRange: false })).action).toBe('fire');
  });
});
