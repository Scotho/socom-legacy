import { describe, expect, it } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import {
  activateButton, deactivateButton, listboxRowLook, loadDialog, newButtonLook, noGlow, pressButton, setButtonEnabled, stepGlow, tickButton,
  type ButtonSpec, type TextGlow,
} from '../../src/index';

// Web research 111 §4: TEXT_GLOW and the colour states, transcribed from FUN_00363b30 (D:L261297-261315), FUN_0036e790
// (D:L267223-267240), FUN_003773f0, FUN_0036e6b0, FUN_00370c20, FUN_003723b0, FUN_00377380 and Activate (0x3766a0).
// The expected values are worked by hand from those lines.

const r = (...kv: (string | RdrNode)[]): RdrNode[] => {
  const out: RdrNode[] = [];
  for (let i = 0; i < kv.length; i += 2) { const v = kv[i + 1]!; out.push(kv[i] as string, Array.isArray(v) ? v : [v]); }
  return out;
};
/** dlgMenu's shape: NORMAL 0.6, ACTIVE 0.75 with a glow 0.3-1 over 0.8, PRESSED (255,74,8) flat. */
const spec = (): ButtonSpec => {
  const d = loadDialog([['SCREENS', r('CONTROLS', [r('NAME', 'b', 'TYPE', 'BUTTON', 'XPOS', '0', 'YPOS', '0', 'SPEC', r(
    'CAPTION', 'X',
    'NORMAL', [r('TEXT_COLOR', ['10', '20', '30'], 'SCALE', '0.6')],
    'ACTIVE', [r('TEXT_COLOR', ['40', '50', '60'], 'SCALE', '0.75', 'TEXT_GLOW', [r('RANGE', ['0.3', '1'], 'TIME', '0.8')])],
    'PRESSED_COLOR', ['255', '74', '8'],
  ))])]]);
  const w = d.controls[0]!.widget;
  if (w.type !== 'BUTTON') throw new Error('not a button');
  return w.button;
};

describe('FUN_00363b30: the glow, an alpha pulse', () => {
  const g = (): TextGlow => ({ on: true, period: Math.fround(0.8), top: 1, bottom: Math.fround(0.3), phase: 0 });

  it('phase += dt / 2; alpha = (bottom + sin(phase / period x 3.14) x (top - bottom)) x 128', () => {
    const glow = g();
    // phase 0.2: sin(0.25 x 3.14) = sin(0.785) = 0.70683; (0.3 + 0.70683 x 0.7) x 128 = 101.73.
    expect(stepGlow(glow, 0.4)).toBeCloseTo(101.73, 1);
    expect(glow.phase).toBeCloseTo(0.2, 6);
  });

  it('the phase wraps by the period, so a cycle is 2 x TIME and the alpha runs bottom -> top -> bottom', () => {
    const glow = g();
    glow.phase = Math.fround(0.7);
    stepGlow(glow, 0.4);
    expect(glow.phase).toBeCloseTo(0.1, 5);
    const at = (p: number): number => { const x = g(); x.phase = p; return stepGlow(x, 0)!; };
    expect(at(0)).toBeCloseTo(0.3 * 128, 3);
    expect(at(0.4)).toBeCloseTo(128 * (0.3 + Math.sin(0.5 * 3.14) * 0.7), 3);
  });

  it('the literal is 3.14, not pi: at phase = period the alpha stays above the bottom by sin(3.14) x 0.7 x 128', () => {
    const glow = g();
    glow.phase = glow.period;   // not past the period, so no wrap: sin(1 x 3.14) = 0.00159
    // (0.3 + 0.0015927 x 0.7) x 128 = 38.5427; with pi it would be 38.4000.
    expect(stepGlow(glow, 0)).toBeCloseTo(128 * (0.3 + Math.sin(3.14) * 0.7), 3);
  });

  it('off, it leaves the alpha alone', () => {
    expect(stepGlow(noGlow(), 0.5)).toBeNull();
  });
});

describe('the button\'s caption through its states', () => {
  it('a state sets the caption\'s TEXT_COLOR, its SCALE and the alpha 100; the glow only where the state has one', () => {
    const s = spec(), look = newButtonLook(s);
    expect(look).toMatchObject({ state: 'NORMAL', color: [10, 20, 30], alpha: 100, scale: Math.fround(0.6) });
    expect(look.glow.on).toBe(false);
    activateButton(look, s);
    expect(look).toMatchObject({ state: 'ACTIVE', color: [40, 50, 60], alpha: 100, scale: Math.fround(0.75) });
    expect(look.glow).toMatchObject({ on: true, period: Math.fround(0.8), top: 1, bottom: Math.fround(0.3) });
    tickButton(look, s, 0.4);
    expect(look.alpha).toBeCloseTo(101.73, 1);
  });

  it('PRESSED holds 0.2 s, then ACTIVE when enabled; the glow\'s phase carries over', () => {
    const s = spec(), look = newButtonLook(s);
    activateButton(look, s);
    tickButton(look, s, 0.4);
    pressButton(look, s);
    expect(look).toMatchObject({ state: 'PRESSED', color: [255, 74, 8], alpha: 100 });
    expect(look.glow.on).toBe(false);
    tickButton(look, s, 0.1);
    expect(look.state).toBe('PRESSED');
    tickButton(look, s, 0.15);
    expect(look.state).toBe('ACTIVE');
    expect(look.glow.phase).toBeCloseTo(0.2, 6);
  });

  it('SetEnabled(false) enters DISABLED and the other entries refuse; SetEnabled(true) returns to NORMAL', () => {
    const s = spec(), look = newButtonLook(s);
    setButtonEnabled(look, s, false);
    expect(look.state).toBe('DISABLED');
    pressButton(look, s); activateButton(look, s); deactivateButton(look, s);
    expect(look.state).toBe('DISABLED');
    setButtonEnabled(look, s, true);
    expect(look.state).toBe('NORMAL');
  });
});

describe('a LISTBOX row\'s caption (FUN_0037ab90, FUN_0037a810)', () => {
  const list = { normalColor: [1, 2, 3] as const, currentColor: [4, 5, 6] as const, activeGlow: { range: [0.5, 1] as [number, number], time: 0.5 } };
  it('unselected: NORMAL_COLOR at 80; selected: the current colour, glowing while focused when TIME is not 0', () => {
    const g = noGlow();
    expect(listboxRowLook({ selected: false, focused: true }, list, g)).toEqual({ color: [1, 2, 3], alpha: 80 });
    expect(listboxRowLook({ selected: true, focused: true }, list, g)).toEqual({ color: [4, 5, 6], alpha: null });
    expect(g).toMatchObject({ on: true, period: 0.5, top: 1, bottom: 0.5 });
    expect(listboxRowLook({ selected: true, focused: true }, { ...list, activeGlow: { range: [0, 0], time: 0 } }, g)).toEqual({ color: [4, 5, 6], alpha: 80 });
    expect(g.on).toBe(false);
  });
});
