// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { devKeysHeld, holdDevKeys } from '../src/devKeyHolds';
import { mountTauntDevEditor } from '../src/tauntDevEditor';
import { TauntEditor } from '../src/tauntEditor';

/**
 * LATER 190 (OT.R29: a development build's; a browser adaptation): `/testroom`'s SETUP TAUNTS dev editor holds the
 * physical keyboard while it is open (`./devKeyHolds`), so the listeners that hear a key before its own -- the round
 * text line's and the dev talk key's -- leave it alone. With nothing registered -- a release build, whose bundle holds no
 * editor -- nothing is held, and the line and the talk key behave as before (the merge controller's pin). Unit tests only.
 */
describe('LATER 190: the development editor\'s key hold', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('nothing registered: nothing held (the release build\'s path)', () => {
    expect(devKeysHeld()).toBe(false);
  });

  it('a hold answers while its own test does, and goes when released', () => {
    let open = false;
    const release = holdDevKeys(() => open);
    expect(devKeysHeld()).toBe(false);
    open = true;
    expect(devKeysHeld()).toBe(true);
    release();
    expect(devKeysHeld()).toBe(false);
  });

  it('the SETUP TAUNTS dev editor holds the keys exactly while it is open', () => {
    const isOpen = vi.spyOn(TauntEditor.prototype, 'isOpen').mockReturnValue(false);
    mountTauntDevEditor({
      panel: null, source: () => null, defaults: () => null, blocked: () => false, opening: () => undefined, saved: () => undefined, status: () => undefined,
    });
    expect(devKeysHeld()).toBe(false);
    isOpen.mockReturnValue(true);
    expect(devKeysHeld()).toBe(true);
    isOpen.mockReturnValue(false);
    expect(devKeysHeld()).toBe(false);
  });
});
