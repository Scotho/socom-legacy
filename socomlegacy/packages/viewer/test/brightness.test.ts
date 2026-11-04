import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import {
  BRIGHTNESS_OFF, BRIGHTNESS_SCALE, brightnessAlpha, brightnessFactor, brightnessFilter, frameCanvas, setBrightness,
  brightnessOfVars,
} from '../src/brightness';

const here = dirname(fileURLToPath(import.meta.url));
const src = (f: string): string => readFileSync(resolve(here, '../src', f), 'utf-8');

describe('OPT-11 BRIGHTNESS (research 358): CBrightnessTuner and the full-screen pass', () => {
  it('the scale is the f32 204.8 (0x434CCCCD) and the off sentinel 0x80 (DAT_003e1408)', () => {
    expect(BRIGHTNESS_SCALE).toBe(Math.fround(204.8));
    expect(BRIGHTNESS_OFF).toBe(0x80);
  });

  it('A = trunc(204.8 x |b - 0.5|) in f32; at 0.5 no pass; darkening with A = 0 is no pass either', () => {
    expect(brightnessAlpha(0.5)).toEqual({ mode: 'none', alpha: BRIGHTNESS_OFF });
    expect(brightnessAlpha(0)).toEqual({ mode: 'darken', alpha: 102 });
    expect(brightnessAlpha(1)).toEqual({ mode: 'brighten', alpha: 102 });
    expect(brightnessAlpha(0.25)).toEqual({ mode: 'darken', alpha: 51 });     // 51.2 truncated
    expect(brightnessAlpha(0.75)).toEqual({ mode: 'brighten', alpha: 51 });
    expect(brightnessAlpha(0.498)).toEqual({ mode: 'none', alpha: BRIGHTNESS_OFF });   // 0.41: A 0 below, the sentinel
    expect(brightnessAlpha(0.502)).toEqual({ mode: 'brighten', alpha: 0 });   // drawn, adding nothing
  });

  it('the blend: ALPHA 0x46 is Cd x (1 - A/128), 0x49 is Cd x (1 + A/128); the factor of the picture', () => {
    expect(brightnessFactor(0.5)).toBe(1);
    expect(brightnessFactor(0)).toBe(1 - 102 / 128);
    expect(brightnessFactor(1)).toBe(1 + 102 / 128);
    expect(brightnessFactor(0.25)).toBe(1 - 51 / 128);
    expect(brightnessFactor(0.502)).toBe(1);
    expect(brightnessFactor(0.498)).toBe(1);
  });

  it('a value outside the slider\'s [0, 1] or not a number is read as the tuner holds it (the factor still follows A)', () => {
    expect(brightnessFactor(Number.NaN)).toBe(1);
    expect(brightnessAlpha(2).mode).toBe('brighten');
  });

  it('the CSS filter: none at the default, brightness(k) elsewhere', () => {
    expect(brightnessFilter(0.5)).toBe('none');
    expect(brightnessFilter(0)).toBe(`brightness(${1 - 102 / 128})`);
    expect(brightnessFilter(1)).toBe(`brightness(${1 + 102 / 128})`);
  });

  it('the game\'s screens take the current filter when registered and follow every change; a removed one is dropped', () => {
    const doc = new JSDOM('<body></body>').window.document;
    const a = doc.createElement('canvas'), b = doc.createElement('canvas');
    doc.body.append(a, b);
    setBrightness(0.5);
    frameCanvas(a);
    expect(a.getAttribute('style')).toBeNull();                       // at the default no inline style at all
    setBrightness(1);
    expect(a.style.filter).toBe(`brightness(${1 + 102 / 128})`);
    frameCanvas(b);
    expect(b.style.filter).toBe(`brightness(${1 + 102 / 128})`);
    a.remove();
    setBrightness(0);
    expect(b.style.filter).toBe(`brightness(${1 - 102 / 128})`);
    expect(a.style.filter).toBe(`brightness(${1 + 102 / 128})`);   // dropped: no longer written
    setBrightness(0.5);
    expect(b.style.filter).toBe('');                                  // back at the default: the property removed
  });

  it('read from a tuner manager as 0x38a000 reads it: a real as it is, an int converted, another type 0; none the default', () => {
    expect(brightnessOfVars({ find: () => ({ value: { type: 'real', value: 0.8 } }) })).toBe(0.8);
    expect(brightnessOfVars({ find: () => ({ value: { type: 'int', value: 1 } }) })).toBe(1);
    expect(brightnessOfVars({ find: () => ({ value: { type: 'string', value: 'x' } }) })).toBe(0);
    expect(brightnessOfVars({ find: () => undefined })).toBe(0.5);
    expect(brightnessOfVars(null)).toBe(0.5);
  });

  it('wired: the four game screens registered, the front end syncs each frame, /testroom from the card\'s tuners', () => {
    expect(src('frontEnd.ts')).toMatch(/frameCanvas\(canvas\)/);
    expect(src('frontEnd.ts')).toMatch(/setBrightness\(brightnessOfVars\(session_\?\.uiVars\)\)/);
    expect(src('matchMount.ts')).toMatch(/frameCanvas\(canvas\)/);
    expect(src('loadingPanel.ts')).toMatch(/frameCanvas\(this\.canvas\)/);
    expect(src('main.ts')).toMatch(/frameCanvas\(canvas\)/);
    expect(src('main.ts').match(/setBrightness\(brightnessOfVars\(cardTuners\)\)/g)?.length).toBe(2);
  });
});
