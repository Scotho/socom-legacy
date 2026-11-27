// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { PRESS_FRAME_READING, pressFrameTiming, setPressFrameTiming } from '../src/mover';
import { chordHeld, PRESS_FRAME_CHORD_ADAPTATION, PressFrameSwitch, pressTimingOfQuery } from '../src/pressFrameSwitch';

/** LATER 1219's PLAYTEST INSTRUMENT (a browser adaptation; `./pressFrameSwitch`): the chord, the query, the online refusal. */
const pad = (held: number[]) => ({ buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: held.includes(i) })) });
const CHORD = [...PRESS_FRAME_CHORD_ADAPTATION.buttons];

describe('LATER 1219: the press-timing switch (a playtest instrument)', () => {
  afterEach(() => setPressFrameTiming(PRESS_FRAME_READING));

  it('the query picks a timing; anything else is none', () => {
    expect(pressTimingOfQuery('?devmode&pressframe=at-once')).toBe('at-once');
    expect(pressTimingOfQuery('pressframe=frame-start')).toBe('frame-start');
    expect(pressTimingOfQuery('?devmode&pressframe=sometimes')).toBe(null);
    expect(pressTimingOfQuery('?devmode')).toBe(null);
  });

  it('the chord is all three buttons on one pad', () => {
    expect(chordHeld([pad(CHORD)])).toBe(true);
    expect(chordHeld([pad(CHORD.slice(0, 2))])).toBe(false);
    expect(chordHeld([null, pad([CHORD[0]!]), pad(CHORD.slice(1))])).toBe(false);
  });

  it('held for holdMs it flips once; released and held again it flips back', () => {
    let t = 0, pads = [pad([])];
    const sw = new PressFrameSwitch({ now: () => t, pads: () => pads, online: () => false });
    sw.poll();
    pads = [pad(CHORD)];
    for (; t < PRESS_FRAME_CHORD_ADAPTATION.holdMs - 1; t += 16) sw.poll();
    expect(pressFrameTiming()).toBe('frame-start');
    for (; t < 3000; t += 16) sw.poll();
    expect(pressFrameTiming()).toBe('at-once');                    // once, however long it is held
    expect(sw.poll()).toMatch(/at once/);
    pads = [pad([])]; sw.poll();
    pads = [pad(CHORD)];
    for (const end = t + 1000; t < end; t += 16) sw.poll();
    expect(pressFrameTiming()).toBe('frame-start');
    expect(sw.poll()).toMatch(/next game frame/);
  });

  it('online the chord is refused (the room is another process): the timing stays and the label says why', () => {
    let t = 0;
    const sw = new PressFrameSwitch({ now: () => t, pads: () => [pad(CHORD)], online: () => true });
    for (; t < 2000; t += 16) sw.poll();
    expect(pressFrameTiming()).toBe('frame-start');
    expect(sw.poll()).toMatch(/S2U_PLAYTEST_PRESS_FRAME/);
  });
});
