import { describe, expect, it, vi } from 'vitest';
import { createForgePlayDriver, type ForgePlayState } from '../src/forge/agent/play';

/**
 * LATER 426 (browser adaptation): the Forge Play port reads the host lazily, at most once a frame. The match hands it
 * the five gating flags each frame and a `read()` for the rest (the kit, the weapon, the loadout, the armory, the
 * traversal, the plant); the driver calls `read()` only when a scenario's `observe` step or a status read needs it --
 * never on a frame with no agent work -- and twice in one frame reads it once (the solo room's `3bf6baa88`, the same audit).
 */
const gate = { local: true, visible: true, ready: true, menu: false, armory: false };
const full = (): ForgePlayState => ({ ...gate, map: { archive: 'MP2', path: 'MP2.ZAR', name: 'Frostfire' }, pose: { x: 1 }, feet: [0, 0, 0],
  equipment: { weapon: 'rifle' }, action: { playing: true }, plant: null });
const controls = () => ({ release: vi.fn(), equip: vi.fn(() => true), armoryKey: vi.fn(() => true) });

describe('LATER 426: the Forge Play port\'s host reads', () => {
  it('a frame with no scenario and no status read never reads the host', () => {
    const d = createForgePlayDriver({ now: () => 0 });
    d.port.bind(controls());
    const read = vi.fn(full);
    for (let i = 0; i < 60; i++) d.port.frame(1 / 60, { ...gate, read });
    expect(read).not.toHaveBeenCalled();
  });

  it('an observe step reads once a frame, and a status read in the same frame reuses it', () => {
    const d = createForgePlayDriver({ now: () => 0 });
    d.port.bind(controls());
    const read = vi.fn(full);
    d.port.frame(1 / 60, { ...gate, read });                        // the gate makes Play usable; nothing needs the rest yet
    expect(read).not.toHaveBeenCalled();
    expect(d.execute('scenario.start', { steps: [{ operation: 'observe', args: { field: 'action.playing', equals: true }, seconds: 1 }] }).ok).toBe(true);
    d.port.frame(1 / 60, { ...gate, read });
    expect(d.read()?.action).toEqual({ playing: true });
    expect(read).toHaveBeenCalledTimes(1);
    expect(d.status()).toMatchObject({ state: 'completed' });
  });

  it('a whole state, as before, still works', () => {
    const d = createForgePlayDriver({ now: () => 0 });
    d.port.bind(controls());
    d.port.frame(1 / 60, full());
    expect(d.read()?.map).toEqual({ archive: 'MP2', path: 'MP2.ZAR', name: 'Frostfire' });
  });
});
