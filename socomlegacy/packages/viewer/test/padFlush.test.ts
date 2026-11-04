import { describe, expect, it } from 'vitest';
import { mergeInput, noInput, padInput, pressedSince, type GamepadLike } from '../src/gamepad';
import { flushedPad } from '../src/padFlush';

/**
 * The loading hold's release is the match's state start: the original flushes the pad there (research 116 R116.13,
 * `CInput::Flush` `FUN_002d9e00`, called by the mission and round start `FUN_002a7d40` D:L149733), zeroing every state
 * and reading the pad once, so a button held through the change is held, never a fresh press; a stick is a level,
 * live at once. The page's edges after the hold are taken against `flushedPad`'s read of the held pad.
 */
const pad = (buttons: number[], axes = [0, 0, 0, 0]): GamepadLike => ({
  id: 'Test pad', index: 0, connected: true, mapping: 'standard', axes,
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: buttons.includes(i), value: buttons.includes(i) ? 1 : 0 })),
} as GamepadLike);
const R1 = 5, CROSS = 0, L1 = 4, UP = 12, L3 = 10, R3 = 11;

describe('the pad flushed through the loading hold (R116.13)', () => {
  it('R1 held through the release fires nothing on the first free frame; a stick pushed through it moves at once', () => {
    const held = padInput(pad([R1], [0, -1, 0, 0]));
    expect(held.fire).toBe(true);
    const edges = flushedPad(noInput(), held);                       // the last held frame's read
    const free = mergeInput(noInput(), held);                         // the first free frame: still held, still pushed
    expect(free.fire !== edges.merged.fire).toBe(false);              // no trigger edge: R1 is held, not pressed
    expect(pressedSince(edges.merged, free)).toEqual([]);
    expect(pressedSince(edges.last, held)).toEqual([]);
    expect(free.moveY).toBe(1);                                       // the level, not an edge: it moves at once
    // Let go and pressed again after the release, it is a press.
    const up = padInput(pad([]));
    expect(pressedSince(free, up)).toEqual([]);
    expect(pressedSince(up, padInput(pad([R1])))).toContain('fire');
  });
  it('the touch layer, let go under the hold, is merged in as the page merges it', () => {
    const touch = { ...noInput(), jump: true };
    expect(flushedPad(touch, padInput(pad([]))).merged.jump).toBe(true);
    expect(flushedPad(touch, padInput(pad([]))).last.jump).toBe(false);
  });
  it('the game lanes too (sprint 25: jump, action, shoulders, zoom, fire mode, reload read off `padGame`): Cross, L1, Up, L3 and R3 held through the release are no press', () => {
    const held = padInput(pad([CROSS, L1, UP, L3, R3]));
    const flushed = flushedPad(noInput(), held);
    const free = mergeInput(noInput(), held);                         // the first free frame; the R2 menu closed under the hold: game === input
    expect(pressedSince(flushed.game, free)).toEqual([]);
    expect(pressedSince(noInput(), free)).toEqual(expect.arrayContaining(['action', 'swap1', 'zoom', 'fireMode', 'reload']));   // what a game lane zeroed under the hold would see
  });
});
