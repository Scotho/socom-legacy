import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { frameCanvas, setBrightness } from '../src/brightness';
import { COLOUR_FILTER_ADAPTATION, COLOUR_FILTER_MATRICES, colourFilter, colourFilterId, colourMatrixValues } from '../src/colourFilter';

/**
 * VS-5 (VS.R6, a browser adaptation with no original; the video settings design §4.2, §7): the Colour filter row -- a
 * colour-blindness simulation matrix over the game's whole picture (the HUD included: it draws into the match's canvas),
 * on the brightness pass's filter chain (`./brightness`, research 358) and composed with it, never replacing it.
 */
const here = dirname(fileURLToPath(import.meta.url));
const src = (f: string): string => readFileSync(resolve(here, '../src', f), 'utf-8');
const BRIGHT = `brightness(${1 + 102 / 128})`;

describe('VS-5: the three matrices (Machado, Oliveira and Fernandes 2009, severity 1)', () => {
  for (const kind of ['protanopia', 'deuteranopia', 'tritanopia'] as const) {
    it(`${kind}: 3x3 over RGB, each row summing to 1 +- 0.01 (white stays white); a 4x5 feColorMatrix with alpha kept`, () => {
      const m = COLOUR_FILTER_MATRICES[kind];
      expect(m).toHaveLength(3);
      for (const row of m) {
        expect(row).toHaveLength(3);
        expect(Math.abs(row[0]! + row[1]! + row[2]! - 1)).toBeLessThanOrEqual(0.01);
      }
      const v = colourMatrixValues(kind);
      expect(v).toHaveLength(20);
      expect(v.slice(15)).toEqual([0, 0, 0, 1, 0]);
      expect([v[4], v[9], v[14]]).toEqual([0, 0, 0]);
      expect(v.slice(0, 3)).toEqual(m[0]);
    });
  }
  it('Off is the identity', () => {
    expect(colourMatrixValues('off')).toEqual([1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0]);
    expect(COLOUR_FILTER_ADAPTATION).toMatch(/no original/);
  });
});

describe('VS-5: colourFilter(el, kind) on the brightness chain', () => {
  it('sets a url() to an feColorMatrix the document holds; Off removes the filter (no inline style left)', () => {
    const doc = new JSDOM('<body></body>').window.document;
    const c = doc.createElement('canvas');
    doc.body.append(c);
    setBrightness(0.5);
    colourFilter(c, 'deuteranopia');
    expect(c.style.filter).toBe(`url("#${colourFilterId('deuteranopia')}")`);
    const fe = doc.getElementById(colourFilterId('deuteranopia'))?.querySelector('feColorMatrix');
    expect(fe?.getAttribute('type')).toBe('matrix');
    expect(fe?.getAttribute('values')?.split(' ').map(Number)).toEqual(colourMatrixValues('deuteranopia'));
    expect(fe?.closest('filter')?.getAttribute('color-interpolation-filters')).toBe('linearRGB');
    colourFilter(c, 'off');
    expect(c.getAttribute('style') ?? '').toBe('');
  });

  it('brightness and the matrix compose on the same element, in either order, each change keeping the other', () => {
    const doc = new JSDOM('<body></body>').window.document;
    const c = doc.createElement('canvas');
    doc.body.append(c);
    setBrightness(0.5);
    frameCanvas(c);
    setBrightness(1);
    colourFilter(c, 'protanopia');
    const url = `url("#${colourFilterId('protanopia')}")`;
    expect(c.style.filter).toBe(`${BRIGHT} ${url}`);
    setBrightness(0.5);
    expect(c.style.filter).toBe(url);                       // brightness at its default: the matrix alone
    setBrightness(1);
    expect(c.style.filter).toBe(`${BRIGHT} ${url}`);
    colourFilter(c, 'off');
    expect(c.style.filter).toBe(BRIGHT);                    // the matrix gone, the brightness kept
    setBrightness(0.5);
    expect(c.getAttribute('style') ?? '').toBe('');
  });

  it('the HUD gets the same filter: in a match it draws into the canvas; a separate HUD element takes the same value', () => {
    const doc = new JSDOM('<body></body>').window.document;
    const c = doc.createElement('canvas'), hud = doc.createElement('div');
    doc.body.append(c, hud);
    setBrightness(0.5);
    colourFilter(c, 'tritanopia');
    colourFilter(hud, 'tritanopia');
    expect(hud.style.filter).toBe(c.style.filter);
    expect(doc.querySelectorAll(`#${colourFilterId('tritanopia')}`)).toHaveLength(1);   // one definition per document
    expect(src('matchMount.ts')).toMatch(/hud\.render\(renderer\.renderer\)/);            // the HUD's pass is the canvas's
    expect(src('matchMount.ts')).toMatch(/colourFilter\(canvas, v\.colourFilter\)/);
  });
});
