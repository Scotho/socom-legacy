import { describe, expect, it } from 'vitest';
import { KEY_STANCE, StanceButton, STANCE_HOLD_S_PLACEHOLDER, stanceKeyOnHold, stanceKeyOnTap } from '../src/stanceButton';
import * as play from '../src/play';
import type { Stance } from '../src/walk';

/** The PC's C (owner, 2026-09-29): a tap toggles stand and crouch, from prone a tap crouches; a hold goes prone. */
describe('the C key\'s stance rules', () => {
  const FRAME = 1 / 60;
  const press = (b: StanceButton, from: Stance, seconds: number): Stance[] => {
    const asked: Stance[] = [];
    let now = from;
    for (let t = 0; t < seconds - 1e-9; t += FRAME) { const go = b.update(true, FRAME, now); if (go) { asked.push(go); now = go; } }
    const go = b.update(false, FRAME, now);
    if (go) asked.push(go);
    return asked;
  };

  it('a tap: stand to crouch, crouch to stand, prone to crouch', () => {
    expect(stanceKeyOnTap('stand')).toBe('crouch');
    expect(stanceKeyOnTap('crouch')).toBe('stand');
    expect(stanceKeyOnTap('prone')).toBe('crouch');
  });

  it('a hold: prone from standing or crouched, and nothing from prone', () => {
    expect(stanceKeyOnHold('stand')).toBe('prone');
    expect(stanceKeyOnHold('crouch')).toBe('prone');
    expect(stanceKeyOnHold('prone')).toBeNull();
  });

  it('shares the pad\'s hold threshold, and the machine runs them', () => {
    expect(STANCE_HOLD_S_PLACEHOLDER).toBe(0.4);
    expect(press(new StanceButton(STANCE_HOLD_S_PLACEHOLDER, KEY_STANCE), 'prone', 0.1)).toEqual(['crouch']);
    expect(press(new StanceButton(STANCE_HOLD_S_PLACEHOLDER, KEY_STANCE), 'prone', 0.6)).toEqual([]);
    expect(press(new StanceButton(STANCE_HOLD_S_PLACEHOLDER, KEY_STANCE), 'stand', 0.6)).toEqual(['prone']);
    expect(press(new StanceButton(STANCE_HOLD_S_PLACEHOLDER, KEY_STANCE), 'stand', STANCE_HOLD_S_PLACEHOLDER - 2 * FRAME)).toEqual(['crouch']);
  });

  it('the pad\'s Triangle keeps its own rules (a tap from prone stands), from the same module', () => {
    expect(press(new StanceButton(), 'prone', 0.1)).toEqual(['stand']);
    expect(play.StanceButton).toBe(StanceButton);
  });

  it('a press whose first frame is a long one is still a tap: the time before the press is not the hold\'s (web sprint 4)', () => {
    // A frame of 0.5 s (a hitch) carries the key's press and the next one its release: 0 s held, a tap.
    const b = new StanceButton(STANCE_HOLD_S_PLACEHOLDER, KEY_STANCE);
    expect(b.update(true, 0.5, 'stand')).toBeNull();
    expect(b.update(false, FRAME, 'stand')).toBe('crouch');
  });
});

/** LATER 436 (the review's F1 on acc7ee3a6): an agent's Triangle forgotten keeps the person's own Crouch and Prone binds. */
describe('StanceButton.forgetPress', () => {
  const FRAME = 1 / 60;
  const target = (intent: Stance) => {
    const asked: Stance[] = [];
    return { asked, t: { stanceIntent: () => intent, setStance: (s: Stance) => { asked.push(s); return true; } } };
  };

  it('a Prone bind held across it is no new press (both modes); `reset` still forgets it', () => {
    for (const mode of ['pop', 'separate'] as const) {
      for (const [forget, want] of [[(b: StanceButton) => b.forgetPress(), []], [(b: StanceButton) => b.reset(), ['stand']]] as const) {
        const b = new StanceButton(), { asked, t } = target('prone');
        b.lanes(mode, { triangle: false, prone: true }, FRAME, t);
        b.lanes(mode, { triangle: true, prone: true }, FRAME, t);
        asked.length = 0;
        forget(b);
        b.lanes(mode, { triangle: false, prone: true }, FRAME, t);
        b.lanes(mode, { triangle: false, prone: true }, FRAME, t);
        expect(asked, mode).toEqual(want);
      }
    }
  });

  it("'separate': a Crouch bind held across it crouches at its release, even on the next frame; `reset` loses it", () => {
    for (const [forget, want] of [[(b: StanceButton) => b.forgetPress(), ['crouch']], [(b: StanceButton) => b.reset(), []]] as const) {
      const b = new StanceButton(), { asked, t } = target('stand');
      b.lanes('separate', { triangle: false, crouch: true }, FRAME, t);
      b.lanes('separate', { triangle: true, crouch: true }, FRAME, t);
      forget(b);
      b.lanes('separate', { triangle: false, crouch: false }, FRAME, t);   // the person lets go of Crouch on the next frame
      expect(asked).toEqual(want);
    }
  });

  it('the forgotten Triangle press is no tap at its release', () => {
    const b = new StanceButton(), { asked, t } = target('stand');
    b.lanes('pop', { triangle: true }, FRAME, t);
    b.forgetPress();
    b.lanes('pop', { triangle: false }, FRAME, t);
    expect(asked).toEqual([]);
  });
});
