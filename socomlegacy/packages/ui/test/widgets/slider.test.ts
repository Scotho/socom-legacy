import { describe, expect, it } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import { buildDialogScreen, f32, UiVarManager, type UiDrawItem } from '../../src/index';
import { SLIDER_HOLD_REPEAT, SLIDER_STEP_UNIT, SliderWidget, WidgetSet, sliderToUiVar, uiVarToSlider, widgetPad } from '../../src/widgets/index';
import { textFace } from '../text/fixtures';
import { RecordingHost, design, nodeCmd, r, rec } from './fixtures';

// Web research 117 §4: the SLIDERBAR (`CSliderBar`, vtable 0x4075e0) -- the step `FUN_00371d00` (D:L269059-269182),
// the tick `FUN_003721e0` (D:L269187-269193), the draw `FUN_00372220` (D:L269198-269232), the set-up `FUN_003724f0`
// (D:L269281-269317), SetValue `FUN_00372640` (D:L269324-269350). dlgOptions_Audio's music bar: XPOS 211, XSIZE 290,
// NUM_INTERVALS 2, KNOB 30 x 30, UIVAR MUSIC_VOLUME.

const bar = (...more: (string | RdrNode)[]) => rec('music_bar', 'SLIDERBAR', 211, 99, r(
  'XSIZE', '290', 'YSIZE', '8', 'CAPTION', 'M', 'NUM_INTERVALS', '2', 'KNOB_TEXTURE', 'op_knob.tif', 'KNOB_SIZE', ['30', '30'],
  'ACTIVE_COLOR', ['91', '72', '36'],
  'ANIMATIONS', [r('EVENT', 'ONACTIVATE', 'ANIMATION', 'OnMusicAct'), r('BUTTON', 'CROSS', 'ANIMATION', 'Never')],
  ...more,
));
const make = (uiVars?: UiVarManager, ...more: (string | RdrNode)[]) => {
  const d = design([bar(...more)]);
  const face = textFace();
  const set = WidgetSet.build(d, buildDialogScreen(d), { face: () => face, uiVars });
  return { set, s: set.get('music_bar') as SliderWidget };
};
const STEP2 = f32(2 * SLIDER_STEP_UNIT);
const knob = (items: UiDrawItem[]) => items.filter((i) => i.kind === 'sprite' && i.texture === 'op_knob.tif')
  .map((i) => (i.kind === 'sprite' ? [i.x0, i.y0, i.x1, i.y1, ...i.rgba] : []));

describe('SLIDERBAR: the step is NUM_INTERVALS per cent of the track (R117.2)', () => {
  it('the constant is 0.01f (lui 0x3c23; ori 0xd70a at 0x371d4c), times the step as a float', () => {
    expect(SLIDER_STEP_UNIT).toBe(f32(0.01));
  });

  it('starts at 0.5 (the factory, +0x440); LEFT falling: -0.02, SELECTION, SLIDER_MOVED (0x28), the hold clock zeroed', () => {
    const { s } = make(), h = new RecordingHost();
    expect(s.position).toBe(0.5);
    expect(s.input(widgetPad({ LEFT: 'FALLING' }), h)).toBe(true);
    expect(s.position).toBe(f32(0.5 - STEP2));
    expect(h.take()).toEqual(['sound SELECTION', 'event 0x28']);
  });

  it('the knob\'s left edge runs XPOS .. XPOS + XSIZE: (int)(x + p x XSIZE), KNOB_SIZE, colour 255, alpha 128', () => {
    const { s } = make();
    expect(knob(s.draw(211, 99, 1))).toEqual([[211 + 145, 99, 211 + 145 + 30, 99 + 30, 255, 255, 255, 128]]);
  });

  it('50 presses from full to empty: the knob lands on XPOS at the 50th (the PCSX2 frames: research 117 §11.1)', () => {
    const { s } = make(), h = new RecordingHost();
    // From 0.5, 25 steps leave 0.9999995 (each sum rounded toward zero, EE_FPU_ROUNDING_READING); the 26th caps at 1.0.
    for (let i = 0; i < 25; i++) s.input(widgetPad({ RIGHT: 'FALLING' }), h);
    expect(s.position).toBeLessThan(1);
    s.input(widgetPad({ RIGHT: 'FALLING' }), h);
    expect(s.position).toBe(1);                                       // capped at 1.0 (0x3f800000)
    const xs: number[] = [];
    for (let i = 0; i < 50; i++) { s.input(widgetPad({ LEFT: 'FALLING' }), h); xs.push(knob(s.draw(211, 99, 1))[0]![0]!); }
    expect(xs[49]).toBe(211);
    expect(xs[48]).toBeGreaterThan(211);
    const steps = xs.slice(1).map((x, i) => xs[i]! - x);
    expect(new Set(steps)).toEqual(new Set([5, 6]));                  // 5.8 px a press, cast to int
    s.input(widgetPad({ LEFT: 'FALLING' }), h);
    expect(s.position).toBe(0);                                       // floored at 0
  });

  it('a held key repeats only once the hold clock passes 0.4 s, then every input call; no SLIDER_MOVED, the clock not reset', () => {
    const { s } = make(), h = new RecordingHost();
    s.input(widgetPad({ RIGHT: 'FALLING' }), h); h.take();
    const p = s.position;
    s.tick(0.4, h);
    expect(s.input(widgetPad({ RIGHT: 'DOWN' }), h)).toBe(true);      // 0.4 is not past 0.4: handled, no step
    expect(s.position).toBe(p);
    s.tick(0.01, h);
    s.input(widgetPad({ RIGHT: 'DOWN' }), h);
    s.input(widgetPad({ RIGHT: 'DOWN' }), h);
    expect(s.position).toBe(f32(f32(p + STEP2) + STEP2));
    expect(h.take()).toEqual(['sound SELECTION', 'sound SELECTION']);
    expect(SLIDER_HOLD_REPEAT).toBe(0.4);
  });

  it('CROSS does nothing and the slider\'s button bindings are never read: its handler replaces the button\'s', () => {
    const { s } = make(), h = new RecordingHost();
    expect(s.input(widgetPad({ CROSS: 'FALLING' }), h)).toBe(false);
    expect(s.input(widgetPad({ UP: 'FALLING' }), h)).toBe(false);
    expect(h.take()).toEqual([]);
    expect(s.look.state).toBe('NORMAL');                              // PRESSED is never entered
  });
});

describe('SLIDERBAR: the value (R117.3, FUN_00371d00 and FUN_00371c50)', () => {
  it('CENTER_VALUE C maps the knob p to the var: u = 2pC below 0.5, C + (p - 0.5) 2 (1 - C) above; read back the inverse way', () => {
    expect(sliderToUiVar(0.25, 0.5)).toBe(0.25);
    expect(sliderToUiVar(0.25, 0.2)).toBeCloseTo(0.1, 6);
    expect(sliderToUiVar(0.75, 0.2)).toBeCloseTo(0.6, 6);
    expect(uiVarToSlider(0.1, 0.2)).toBeCloseTo(0.25, 6);
    expect(uiVarToSlider(0.6, 0.2)).toBeCloseTo(0.75, 6);
  });

  it('a step writes the real var; a real var\'s change moves the knob, an integer one is ignored', () => {
    const uiVars = new UiVarManager();
    uiVars.add('MUSIC_VOLUME', { type: 'real', value: Math.fround(0.8) }, 2);
    const { s } = make(uiVars, 'UIVAR', [r('NAME', 'MUSIC_VOLUME', 'VALUE', '0.5')]), h = new RecordingHost();
    expect(s.position).toBeCloseTo(0.8, 6);                           // the set-up reads the var (D:L269315-269316)
    const p = s.position;
    s.input(widgetPad({ LEFT: 'FALLING' }), h);
    expect(s.position).toBe(f32(p - STEP2));
    expect(uiVars.find('MUSIC_VOLUME')!.value).toEqual({ type: 'real', value: sliderToUiVar(s.position, 0.5) });
    uiVars.set('MUSIC_VOLUME', { type: 'int', value: 1 });
    expect(s.position).toBe(f32(p - STEP2));
    uiVars.set('MUSIC_VOLUME', { type: 'real', value: 0.25 });
    expect(s.position).toBe(0.25);
  });

  it('SetValue n (op 4): p = n / 100 and the var = p directly, no sound, no event', () => {
    const uiVars = new UiVarManager();
    const { set, s } = make(uiVars, 'UIVAR', [r('NAME', 'MUSIC_VOLUME', 'VALUE', '0.5')]), h = new RecordingHost();
    expect(set.nodeCommand(nodeCmd('music_bar', 4, '', 30), h)).toEqual({ answer: true });
    expect(s.position).toBe(f32(0.3));
    expect(uiVars.find('MUSIC_VOLUME')!.value).toEqual({ type: 'real', value: f32(0.3) });
    expect(h.take()).toEqual([]);
  });
});
