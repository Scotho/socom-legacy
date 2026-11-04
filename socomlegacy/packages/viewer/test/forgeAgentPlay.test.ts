import { afterEach, describe, expect, it, vi } from 'vitest';
import { createForgePlayDriver, type ForgePlayState } from '../src/forge/agent/play';
import { mergeInput, noInput } from '../src/gamepad';

const state = (): ForgePlayState => ({ ready: true, local: true, visible: true, menu: false, armory: false,
  map: { archive: 'MP2', name: 'Synthetic', path: 'RUN/MP2.ZDB' }, feet: [0, 0, 0], pose: null,
  equipment: null, action: { playerMode: 'walk', playing: true, prompt: null }, plant: { state: 'carried' } });
function fixture() {
  let now = 0, releases = 0;
  const driver = createForgePlayDriver({ now: () => now });
  driver.port.bind({ release: () => { releases++; }, equip: () => false, armoryKey: () => false });
  driver.port.frame(0, state());
  return { driver, advance: (ms: number) => { now += ms; }, releases: () => releases };
}
afterEach(() => vi.useRealTimers());
describe('bounded Forge Play normal input adaptation', () => {
  it('contributes only normal pad lanes and observes the real supplied plant state', () => {
    const f = fixture();
    expect(f.driver.execute('scenario.start', { steps: [
      { operation: 'input.set', args: { moveY: 1, action: true }, seconds: 0.1 },
      { operation: 'observe', args: { field: 'plant.state', equals: 'carried' } },
    ] }).ok).toBe(true);
    const input = f.driver.port.frame(0.016, state());
    expect(mergeInput(noInput(), input)).toMatchObject({ moveY: 1, action: true });
    f.driver.port.frame(0.1, state()); f.driver.port.frame(0.016, state());
    expect(f.driver.status()).toMatchObject({ state: 'completed', observations: [{ observed: 'carried', matched: true }] });
    expect(f.releases()).toBeGreaterThan(0);
    expect(f.driver.input()).toEqual(noInput());
  });
  it('refuses oversized/invalid scenarios and developer edits during play', () => {
    const f = fixture();
    for (const steps of [Array.from({ length: 33 }, () => ({ operation: 'wait' })),
      [{ operation: 'wait', seconds: 61 }], [{ operation: 'teleport', args: { feet: [1, 2, 3] } }],
      [{ operation: 'input.set', args: { moveY: Infinity } }]]) {
      expect(f.driver.execute('scenario.start', { steps }).ok).toBe(false);
    }
  });
  it('releases held input on hidden/menu/online/end/revoke and a request abort', () => {
    for (const changed of [{ visible: false }, { menu: true }, { local: false }, { ready: false }]) {
      const f = fixture();
      expect(f.driver.execute('input.set', { action: true, fire: true }).ok).toBe(true);
      f.driver.port.frame(0.016, { ...state(), ...changed });
      expect(f.driver.input()).toEqual(noInput()); expect(f.releases()).toBe(1);
    }
    const f = fixture(); const abort = new AbortController();
    f.driver.execute('input.set', { action: true }, abort.signal); abort.abort();
    expect(f.driver.input()).toEqual(noInput()); expect(f.releases()).toBe(1);
  });
  it('bounds simulation time and releases on a wall watchdog even without rendered frames', () => {
    vi.useFakeTimers();
    const f = fixture(); f.driver.execute('input.set', { fire: true });
    vi.advanceTimersByTime(30_000);
    expect(f.driver.input()).toEqual(noInput());
    f.driver.execute('scenario.start', { steps: [{ operation: 'input.set', args: { action: true }, seconds: 60 }] });
    f.driver.port.frame(0.016, state());
    f.driver.port.frame(61, state());
    expect(f.driver.status()).toMatchObject({ state: 'failed' });
    expect(f.driver.input()).toEqual(noInput());
  });
  it('reports normal equipment and closed ARMORY refusals instead of pretending success', () => {
    const f = fixture();
    expect(f.driver.execute('equipment.equip', { item: 2 }).ok).toBe(false);
    expect(f.driver.execute('armory.key', { code: 'Enter' }).ok).toBe(false);
  });
  it('keeps the wall watchdog after an input.release step and cancels held actions on revoke', () => {
    vi.useFakeTimers();
    const f = fixture();
    f.driver.execute('scenario.start', { steps: [
      { operation: 'input.set', args: { action: true } }, { operation: 'input.release' },
      { operation: 'observe', args: { field: 'plant.state', equals: 'planted' }, seconds: 60 },
    ] });
    for (let i = 0; i < 5; i++) f.driver.port.frame(0.016, state());
    vi.advanceTimersByTime(30_000);
    expect(f.driver.status()).toMatchObject({ state: 'failed', message: '30 second wall limit' });
    f.driver.execute('input.set', { action: true }); f.driver.cancel('connection revoked');
    expect(f.driver.input()).toEqual(noInput());
  });
});
