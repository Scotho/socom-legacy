import { describe, expect, it } from 'vitest';
import { armoryLifecycle, finishJoiningArmory, type ArmoryObservation, type ArmoryWireEvent } from '../e2e/armoryLifecycle';

const kit = [54, 15, 121, 126, 194];
const observation = (): ArmoryObservation => ({ socket: 3, map: 'MP6', id: 2, kit,
  armory: { open: false, taking: false, kits: [kit] } });
const events = (): ArmoryWireEvent[] => [
  { socket: 3, direction: 'in', type: 'welcome', map: 'MP6', id: 2 },
  { socket: 3, direction: 'in', type: 'spawn', id: 2, kit },
  { socket: 3, direction: 'in', type: 'roundStart' },
];

describe('Armory lifecycle proof at a map transition', () => {
  it('navigates a currently open, taking Armory through its normal controller path', () => {
    const state = observation(); state.armory.open = state.armory.taking = true;
    expect(armoryLifecycle(state, events().slice(0, 1))).toBe('navigate');
  });
  it('accepts closed Armory only with current destination round and matching own spawn', () => {
    expect(armoryLifecycle(observation(), events())).toBe('round-started');
  });
  it('does not accept a closed menu without a round start', () => {
    expect(armoryLifecycle(observation(), events().slice(0, 2))).toBe('waiting');
  });
  it('does not borrow a round start from the previous socket', () => {
    const wire = events(); wire[2]!.socket = 2;
    expect(armoryLifecycle(observation(), wire)).toBe('waiting');
  });
  it('does not borrow another player spawn', () => {
    const wire = events(); wire[1]!.id = 1;
    expect(armoryLifecycle(observation(), wire)).toBe('waiting');
  });
  it.each([1, 2])('requires incoming server evidence at event %s', index => {
    const wire = events(); wire[index]!.direction = 'out';
    expect(armoryLifecycle(observation(), wire)).toBe('waiting');
  });
  it('rejects a partial kit and an absent local player identity', () => {
    const partial = observation(); partial.kit = kit.slice(0, 2); partial.armory.kits = [partial.kit];
    const wire = events(); wire[1]!.kit = partial.kit;
    expect(armoryLifecycle(partial, wire)).toBe('waiting');
    const noPlayer = observation(); noPlayer.id = null;
    expect(armoryLifecycle(noPlayer, events())).toBe('waiting');
  });
  it('rejects a latest own spawn whose kit disagrees with the equipped kit', () => {
    const wire = events(); wire.push({ socket: 3, direction: 'in', type: 'spawn', id: 2, kit: [57, ...kit.slice(1)] });
    expect(armoryLifecycle(observation(), wire)).toBe('waiting');
  });
  it('requires the equipped full kit to exist in the decoded destination Armory', () => {
    const state = observation(); state.armory.kits = [];
    expect(armoryLifecycle(state, events())).toBe('waiting');
  });
  it('does not accept an Armory still open or transitioning after round start', () => {
    const state = observation(); state.armory.open = true;
    expect(armoryLifecycle(state, events())).toBe('waiting');
  });
  it('rejects wrong-map and superseded welcomes even if older events match', () => {
    const wrongMap = events(); wrongMap[0]!.map = 'MP2';
    expect(armoryLifecycle(observation(), wrongMap)).toBe('waiting');
    const replaced = events(); replaced.push({ socket: 4, direction: 'in', type: 'welcome', map: 'MP6', id: 2 });
    expect(armoryLifecycle(observation(), replaced)).toBe('waiting');
  });
  it('does not borrow an own spawn from before this welcome', () => {
    const wire = events(); wire.unshift(wire.splice(1, 1)[0]!);
    expect(armoryLifecycle(observation(), wire)).toBe('waiting');
  });
});

describe('finite joining Armory controller path', () => {
  it('uses select Cross, row Up, DONE Cross once each before checking closed', async () => {
    const calls: string[] = [];
    await finishJoiningArmory({
      wait: async screen => { calls.push(`wait:${screen}`); return 'ready'; },
      press: async (button, screen) => { calls.push(`press:${screen}:${button}`); return true; },
    });
    expect(calls).toEqual(['wait:select', 'press:select:0', 'wait:row', 'press:row:12', 'wait:done', 'press:done:0', 'wait:closed']);
  });
  it.each([0, 1, 2, 3])('stops at strict round closure observed at wait boundary %s', async boundary => {
    const presses: number[] = []; let waits = 0;
    await finishJoiningArmory({
      wait: async () => waits++ === boundary ? 'round-started' : 'ready',
      press: async button => { presses.push(button); return true; },
    });
    expect(presses).toEqual([0, 12, 0].slice(0, boundary));
    expect(waits).toBe(boundary + 1);
  });
  it.each([0, 1, 2])('requires strict proof if closure occurs between readiness and pulse %s', async boundary => {
    const presses: number[] = [], waits: string[] = [];
    await finishJoiningArmory({
      wait: async screen => { waits.push(screen); return screen === 'round-started' ? 'round-started' : 'ready'; },
      press: async button => { presses.push(button); return presses.length - 1 !== boundary; },
    });
    expect(presses).toEqual([0, 12, 0].slice(0, boundary + 1));
    expect(waits).toEqual([...['select', 'row', 'done'].slice(0, boundary + 1), 'round-started']);
  });
  it('propagates an unproved closure failure without retrying a controller action', async () => {
    let presses = 0;
    await expect(finishJoiningArmory({
      wait: async screen => { if (screen === 'round-started') throw Error('no current own spawn'); return 'ready'; },
      press: async () => { presses++; return false; },
    })).rejects.toThrow('no current own spawn');
    expect(presses).toBe(1);
  });
  it('does not accept ordinary readiness as proof after a suppressed pulse', async () => {
    await expect(finishJoiningArmory({ wait: async () => 'ready', press: async () => false }))
      .rejects.toThrow('joining Armory closure lacks round proof');
  });
});
