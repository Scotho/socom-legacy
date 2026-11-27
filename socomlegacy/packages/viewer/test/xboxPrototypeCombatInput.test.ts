import { describe, expect, it, vi } from 'vitest';
import { noInput } from '../src/gamepad';
import { PrototypeCombatInput } from '../src/xboxPrototype/combatInput';

describe('prototype combat browser input boundary', () => {
  const setup = () => {
    const actions = { trigger: vi.fn(), reload: vi.fn(), select: vi.fn(), stepZoom: vi.fn(), switchFireMode: vi.fn() };
    return { actions, input: new PrototypeCombatInput(actions) };
  };
  it('releases on a gate and requires the held pad to be released before another shot', () => {
    const { input, actions } = setup();
    input.frame({ ...noInput(), fire: true }, true);
    input.frame({ ...noInput(), fire: true }, false);
    input.frame({ ...noInput(), fire: true }, true);
    expect(actions.trigger.mock.calls).toEqual([[true], [false]]);
    input.frame(noInput(), true);
    input.frame({ ...noInput(), fire: true }, true);
    expect(actions.trigger.mock.calls).toEqual([[true], [false], [true]]);
  });
  it('merges mouse and pad without releasing another held source', () => {
    const { input, actions } = setup();
    input.pointer(true, true);
    input.frame({ ...noInput(), fire: true }, true);
    input.pointer(false, true);
    expect(actions.trigger.mock.calls).toEqual([[true]]);
    input.frame(noInput(), true);
    expect(actions.trigger.mock.calls).toEqual([[true], [false]]);
  });
  it('does not run reload or select behind a gate, or repeat a held pad press', () => {
    const { input, actions } = setup();
    expect(input.key('KeyR', false)).toBe(false);
    input.frame({ ...noInput(), reload: true, swap2: true }, false);
    input.frame({ ...noInput(), reload: true, swap2: true }, true);
    expect(actions.reload).not.toHaveBeenCalled(); expect(actions.select).not.toHaveBeenCalled();
    input.frame(noInput(), true);
    input.frame({ ...noInput(), reload: true, swap2: true }, true);
    expect(actions.reload).toHaveBeenCalledTimes(1); expect(actions.select).toHaveBeenCalledWith('pistol');
    expect(input.key('Digit3', true)).toBe(false);
  });
  it('keeps zoom, reload and shoulders held through a lost poll disarmed until physical release', () => {
    const { input, actions } = setup();
    const held = { ...noInput(), zoom: true, reload: true, swap1: true };
    input.frame(held, true, 0.02);
    expect(actions.stepZoom).toHaveBeenCalledTimes(1);
    input.frame(noInput(), false, 0.02); // unfocused poll does not report the physical hold
    input.frame(held, true, 0.02);
    expect(actions.stepZoom).toHaveBeenCalledTimes(1); expect(actions.reload).toHaveBeenCalledTimes(1);
    expect(actions.select).toHaveBeenCalledTimes(1);
    input.frame(noInput(), true, 0.02); input.frame(held, true, 0.02);
    expect(actions.stepZoom).toHaveBeenCalledTimes(2);
  });
  it('uses the shared default fire-mode double-tap consumer and direct keyboard B adaptation', () => {
    const { input, actions } = setup(), down = { ...noInput(), fireMode: true };
    input.frame(down, true, 0.02); input.frame(noInput(), true, 0.02);
    expect(actions.switchFireMode).not.toHaveBeenCalled();
    input.frame(down, true, 0.02); expect(actions.switchFireMode).toHaveBeenCalledTimes(1);
    input.frame(noInput(), false, 0.02); input.frame(down, true, 1);
    expect(actions.switchFireMode).toHaveBeenCalledTimes(1);
    input.frame(noInput(), true, 0.02); input.frame(down, true, 0.02);
    expect(actions.switchFireMode).toHaveBeenCalledTimes(1); // The gated hold was not a first tap.
    expect(input.key('KeyB', false)).toBe(false); expect(input.key('KeyB', true)).toBe(true);
    expect(actions.switchFireMode).toHaveBeenCalledTimes(2);
  });
  it('does not treat missing controller polls as physical releases while the canvas stays focused', () => {
    const { input, actions } = setup(), held = { ...noInput(), fire: true, zoom: true };
    input.frame(held, true, 0.02, true); input.suspend();
    input.frame(noInput(), true, 0.02, false); input.frame(noInput(), true, 0.02, false);
    input.frame(held, true, 0.02, true);
    expect(actions.trigger.mock.calls).toEqual([[true], [false]]); expect(actions.stepZoom).toHaveBeenCalledTimes(1);
    input.frame(noInput(), true, 0.02, true); input.frame(held, true, 0.02, true);
    expect(actions.trigger.mock.calls).toEqual([[true], [false], [true]]); expect(actions.stepZoom).toHaveBeenCalledTimes(2);
  });
});
