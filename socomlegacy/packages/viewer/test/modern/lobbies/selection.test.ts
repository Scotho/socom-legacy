import { describe, expect, it, vi } from 'vitest';
import { createSelection, lobbySelection } from '../../../src/modern/lobbies/selection';

/** MU-3's "selected room" store (`src/modern/lobbies/selection.ts`), which the launch (MU-6) reads. */
describe('the lobby selection store', () => {
  it('starts empty and answers what was selected, the routes\' world ids', () => {
    const s = createSelection();
    expect(s.selected()).toBeNull();
    s.select({ kind: 'room', mediusWorldId: 100, name: 'Channel 1' });
    expect(s.selected()).toEqual({ kind: 'room', mediusWorldId: 100, name: 'Channel 1' });
    s.select({ kind: 'game', mediusWorldId: 500, room: 100, name: 'test' });
    expect(s.selected()).toEqual({ kind: 'game', mediusWorldId: 500, room: 100, name: 'test' });
  });
  it('tells its listeners on a change only, and lets one go', () => {
    const s = createSelection();
    const cb = vi.fn();
    const off = s.onChange(cb);
    s.select({ kind: 'room', mediusWorldId: 100, name: 'Channel 1' });
    s.select({ kind: 'room', mediusWorldId: 100, name: 'Channel 1' });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenLastCalledWith({ kind: 'room', mediusWorldId: 100, name: 'Channel 1' });
    s.select(null);
    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb).toHaveBeenLastCalledWith(null);
    off();
    s.select({ kind: 'room', mediusWorldId: 101, name: 'Channel 2' });
    expect(cb).toHaveBeenCalledTimes(2);
  });
  it('hands out copies a reader cannot change', () => {
    const s = createSelection();
    s.select({ kind: 'room', mediusWorldId: 100, name: 'Channel 1' });
    const got = s.selected()!;
    expect(Object.isFrozen(got)).toBe(true);
    expect(() => { (got as { mediusWorldId: number }).mediusWorldId = 7; }).toThrow();
    expect(s.selected()!.mediusWorldId).toBe(100);
  });
  it('the page has one store, the one the launch reads', () => {
    expect(typeof lobbySelection.selected).toBe('function');
    expect(typeof lobbySelection.onChange).toBe('function');
  });
});
