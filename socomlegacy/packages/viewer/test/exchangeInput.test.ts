import { describe, expect, it } from 'vitest';
import { noInput } from '../src/gamepad';
import { ExchangeInput } from '../src/exchangeInput';

describe('Weapon Exchange browser input ownership', () => {
  it('holds every captured action through closing and reset until release, then allows a new press', () => {
    const capture = new ExchangeInput();
    const held = { ...noInput(), fire: true, action: true, inventory: true, stance: true, moveX: 1 };
    expect(capture.frame(held, true)).toEqual(noInput());
    expect(capture.frame(held, false)).toEqual({ ...noInput(), moveX: 1 });
    expect(capture.frame(noInput(), false)).toEqual(noInput());
    expect(capture.frame(held, false)).toEqual(held);
  });

  it('allows independent new controls after closing without releasing a captured trigger', () => {
    const capture = new ExchangeInput();
    capture.frame({ ...noInput(), fire: true }, true);
    expect(capture.frame({ ...noInput(), fire: true, reload: true }, false))
      .toEqual({ ...noInput(), reload: true });
  });

  it('swallows captured keyboard repeats and keyup, even after the menu closes', () => {
    const capture = new ExchangeInput();
    expect(capture.key('KeyX', true, true)).toBe(true);
    expect(capture.key('KeyX', true, false)).toBe(true);
    expect(capture.key('KeyX', false, false)).toBe(true);
    expect(capture.key('KeyX', true, false)).toBe(false);
  });

  it('does not take release ownership of a key already held by gameplay when the menu opens', () => {
    const capture = new ExchangeInput();
    expect(capture.key('KeyW', true, false)).toBe(false);
    expect(capture.key('KeyW', true, true, true)).toBe(true);
    expect(capture.key('KeyW', false, false)).toBe(false); // gameplay must clear its old hold
  });

  it('lets the next fresh press through after focus loss swallows a captured keyup', () => {
    const capture = new ExchangeInput();
    capture.key('KeyX', true, true);
    capture.blur();
    expect(capture.key('KeyX', true, false)).toBe(false);
  });
});
