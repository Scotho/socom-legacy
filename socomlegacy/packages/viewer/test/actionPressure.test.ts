import { describe, expect, it } from 'vitest';
import { GAME_FRAME_DT } from '@s2u/scene';
import { ActionPressure } from '../src/actionPressure';
import { chaseActionPress } from '../src/doors';

describe('shared action pressure (TraversalPage extraction)', () => {
  it('counts game frames from the press and takes exactly one falling step on release', () => {
    const pressure = new ActionPressure(); let expected = 0;
    pressure.step(true, GAME_FRAME_DT / 2); expect(pressure.value()).toBe(0);
    pressure.step(true, GAME_FRAME_DT / 2); expected = chaseActionPress(expected, true, GAME_FRAME_DT);
    expect(pressure.value()).toBe(expected);
    pressure.step(false, 0.3); expected = chaseActionPress(expected, false, GAME_FRAME_DT);
    expect(pressure.value()).toBe(expected);
  });
  it('keeps the same held pressure for different page rates', () => {
    const a = new ActionPressure(), b = new ActionPressure();
    for (let i = 0; i < 60; i++) a.step(true, 1 / 60);
    for (let i = 0; i < 30; i++) b.step(true, 1 / 30);
    expect(a.value()).toBe(b.value());
  });
});
