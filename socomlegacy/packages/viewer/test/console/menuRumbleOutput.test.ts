import { describe, expect, it, vi } from 'vitest';
import { createMenuRumble } from '../../src/console/menuRumble';

describe('browser launcher menu rumble output', () => {
  it('supports a pulse-only actuator and stops the same pad, idempotently', () => {
    const pulse = vi.fn().mockResolvedValue(true);
    const output = createMenuRumble({ getGamepads: () => [null, { index: 4, connected: true, hapticActuators: [{ pulse }] }] }, () => true);
    output.pulse(4, 0);
    expect(pulse).toHaveBeenCalledTimes(1);
    expect(pulse.mock.calls[0]![0]).toBeGreaterThan(0);
    expect(pulse.mock.calls[0]![1]).toBeLessThanOrEqual(60);
    output.stop(); output.stop();
    expect(pulse).toHaveBeenCalledTimes(2);
    expect(pulse).toHaveBeenLastCalledWith(0, 0);
  });

  it('does not reset an already completed menu pulse when gameplay takes over', () => {
    const playEffect = vi.fn().mockResolvedValue('complete'), reset = vi.fn().mockResolvedValue('complete');
    const output = createMenuRumble({ getGamepads: () => [{ index: 2, connected: true, vibrationActuator: { playEffect, reset } }] }, () => true);
    output.pulse(2, 0);
    output.sync(100);
    output.stop();
    expect(playEffect).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();
  });

  it.each(['throw', 'reject'])('silently handles actuator play and reset failures that %s', async (failure) => {
    const fail = () => { if (failure === 'throw') throw new Error('unsupported'); return Promise.reject(new Error('refused')); };
    const output = createMenuRumble({ getGamepads: () => [{ index: 0, connected: true, vibrationActuator: { playEffect: fail, reset: fail } }] }, () => true);
    expect(() => { output.pulse(0, 0); output.stop(); }).not.toThrow();
    await Promise.resolve();
  });

  it('missing, disconnected, unsupported, unidentifiable and forbidden pads never use another pad', () => {
    const playEffect = vi.fn().mockResolvedValue('complete');
    const output = createMenuRumble({ getGamepads: () => [
      { index: 0, connected: true, vibrationActuator: { playEffect } },
      { index: 1, connected: false, vibrationActuator: { playEffect } },
      { index: 2, connected: true },
    ] }, () => true);
    for (const index of [undefined, 1, 2, 3]) output.pulse(index, 0);
    expect(playEffect).not.toHaveBeenCalled();
    expect(() => createMenuRumble({ getGamepads() { throw new Error('policy'); } }, () => true).pulse(0, 0)).not.toThrow();
    expect(() => createMenuRumble(undefined, () => true).pulse(0, 0)).not.toThrow();
  });

  it('a disconnect stops only a still running pulse and prevents more output to the absent pad', () => {
    const p = { index: 6, connected: true, vibrationActuator: { playEffect: vi.fn().mockResolvedValue('complete'), reset: vi.fn().mockResolvedValue('complete') } };
    const output = createMenuRumble({ getGamepads: () => [p] }, () => true);
    output.pulse(6, 0);
    p.connected = false;
    output.sync(16);
    output.pulse(6, 20);
    expect(p.vibrationActuator.playEffect).toHaveBeenCalledTimes(1);
    expect(p.vibrationActuator.reset).toHaveBeenCalledTimes(1);
  });
});
