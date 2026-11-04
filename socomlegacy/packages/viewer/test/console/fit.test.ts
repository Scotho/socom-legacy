// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fit, rootFontPx } from '../../src/console/fit';

/**
 * The console launcher's scale (the S2U Briefing design system's prototype, `fit()`): the 1920x1080 stage is drawn in
 * rem, and the root font-size is 16 px times s -- s = max(0.8, min(w / 1920, h / 1080)) above 760 px wide,
 * clamp(w / 560, 0.6, 0.85) at or below -- times Interface size (100 / 115 / 130 %). A browser adaptation (OT.R28).
 */
describe('fit: the root font-size', () => {
  it('1920x1080 is the design size: 16 px', () => {
    expect(rootFontPx(1920, 1080, 0)).toBe(16);
  });
  it('1440x900 is held at the 0.8 floor: 12.8 px', () => {
    expect(rootFontPx(1440, 900, 0)).toBe(12.8);
  });
  it('a 375x812 phone takes the narrow rule: 375 / 560 of 16 px', () => {
    expect(rootFontPx(375, 812, 0)).toBe(10.71);
    expect(rootFontPx(300, 600, 0)).toBe(9.6);           // the 0.6 floor
    expect(rootFontPx(760, 900, 0)).toBe(13.6);          // the 0.85 ceiling, at the 760 px edge
  });
  it('a 4K screen scales up; Interface size multiplies', () => {
    expect(rootFontPx(3840, 2160, 0)).toBe(32);
    expect(rootFontPx(1920, 1080, 1)).toBe(18.4);
    expect(rootFontPx(1920, 1080, 2)).toBe(20.8);
  });
  it('fit sets the document\'s root font-size from the window', () => {
    const win = { innerWidth: 1920, innerHeight: 1080 } as Window;
    fit(document, win, 2);
    expect(document.documentElement.style.fontSize).toBe('20.8px');                // set as the prototype's toFixed(2) + 'px'; CSS serialises it
  });
});
