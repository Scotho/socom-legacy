// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { padInput } from '../src/gamepad';
import { GamePad } from '../src/setupPad';

/**
 * B188's e2e (`../e2e/triangleSquarePop.spec.ts:49`, OT.R76, red on the run of 2026-10-30): the match's pad reader as
 * `/testroom` builds it (`../src/main` `new GamePad({ waitForRest: false })`) over the spec's stub -- a standard pad, id
 * 'OT.R76 test controller', 17 buttons, nothing stored -- after OBF-9 (`sameId`), OBF-10 (`padFamily`, the SDL layouts)
 * and OBF-12 (the selection and the profile read again each poll). A Triangle tap is the `stance` lane on the frame it is
 * down and off on the frame it is up; every frame reads the pad (no rest wait, no reload past the first). A browser
 * adaptation's reader (OT.R28); the stance button's own tap rule is `StanceButton`'s, unchanged by B188.
 */
const stub = () => ({ id: 'OT.R76 test controller', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) });
const TRIANGLE = 3;

beforeEach(() => { localStorage.clear(); });
afterEach(() => { localStorage.clear(); });

describe('B188 e2e triangleSquarePop:49 -- a standard pad\'s Triangle through the match\'s reader', () => {
  it('the tap reaches the stance lane on its frame, and lets go on the next', () => {
    const p = stub();
    const src = { getGamepads: () => [p] };
    const g = new GamePad({ waitForRest: false });
    expect(padInput(g.poll(src)).stance, 'at rest').toBe(false);
    Object.assign(p.buttons[TRIANGLE]!, { pressed: true, touched: true, value: 1 });
    expect(padInput(g.poll(src)).stance, 'Triangle down: the stance lane').toBe(true);
    expect(padInput(g.poll(src)).stance, 'still down').toBe(true);
    Object.assign(p.buttons[TRIANGLE]!, { pressed: false, touched: false, value: 0 });
    expect(padInput(g.poll(src)).stance, 'let go').toBe(false);
    expect(g.input.config.bindings[TRIANGLE], 'no profile: the default binding').toBe(TRIANGLE);
  });
});
