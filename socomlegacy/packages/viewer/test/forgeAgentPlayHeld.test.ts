import { describe, expect, it, vi } from 'vitest';
import { createForgePlayDriver, type ForgePlayControls, type ForgePlayState } from '../src/forge/agent/play';

/** LATER 438 (product track; 4d8e4d41e): the driver's release names only what the agent itself held. */
const state = (): ForgePlayState => ({ ready: true, local: true, visible: true, menu: false, armory: false,
  map: { archive: 'MP2', name: 'Synthetic', path: 'RUN/MP2.ZDB' }, feet: [0, 0, 0], pose: null,
  equipment: null, action: { playerMode: 'walk', playing: true, prompt: null }, plant: { state: 'carried' } });
function fixture() {
  const release = vi.fn<ForgePlayControls['release']>();
  const driver = createForgePlayDriver({ now: () => 0 });
  driver.port.bind({ release, equip: () => false, armoryKey: () => false });
  driver.port.frame(0, state());
  release.mockClear();
  return { driver, release };
}

describe('LATER 438: the agent release is scoped to what it held', () => {
  it.each([
    [{ moveY: 1 }, { action: false, fire: false, stance: false }],
    [{ action: true }, { action: true, fire: false, stance: false }],
    [{ fire: true }, { action: false, fire: true, stance: false }],
    [{ stance: true }, { action: false, fire: false, stance: true }],
    [{ action: true, fire: true, lookX: 0.5 }, { action: true, fire: true, stance: false }],
  ])('held %j: the release is told %j', (args, told) => {
    const f = fixture();
    expect(f.driver.execute('input.set', args).ok).toBe(true);
    f.driver.port.frame(0.016, state());
    f.driver.execute('input.release', {});
    expect(f.release).toHaveBeenCalledOnce();
    expect(f.release).toHaveBeenCalledWith(told);
  });

  it('a lane the agent set and then let go itself is not named at the release', () => {
    const f = fixture();
    f.driver.execute('input.set', { fire: true, moveY: 1 });
    f.driver.execute('input.set', { fire: false });
    f.driver.execute('input.release', {});
    expect(f.release).toHaveBeenCalledWith({ action: false, fire: false, stance: false });
  });

  it('nothing held: no release reaches the match, so a human lane is never touched', () => {
    const f = fixture();
    f.driver.execute('input.release', {});
    f.driver.port.cancel('a menu owns input');
    f.driver.port.frame(0.016, { ...state(), menu: true });
    expect(f.release).not.toHaveBeenCalled();
  });
});
