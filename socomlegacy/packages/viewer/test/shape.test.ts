// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ceilingWords, effectiveShape, pageShape, parseShape, SHAPE_43_CLASS, SHAPE_KEY, shapeBox, shapeKeeper, VIDEO_SHAPES, type VideoShape } from '../src/shape';
import { PAGE_SETTING_KEYS } from '../src/pageStore';

/**
 * VIDEO-SHAPE phase A (player report Q-01; the owner's accepted model, VIDEO-SETTINGS.md, 2026-11-21; product track, a
 * browser adaptation with no original): the match canvas's Shape -- Fill the window, 4:3 (the original's framing, bars at
 * the sides) or 4:3 stretched -- kept by this browser beside the picture (now worded Sharpness).
 */
describe('VIDEO-SHAPE: the shape key and its parse', () => {
  it('a key of the page\'s own; the three shapes; anything else, or nothing, reads fill', () => {
    expect(SHAPE_KEY).toBe('s2u.viewer.shape');
    expect(PAGE_SETTING_KEYS).toContain(SHAPE_KEY);
    expect(VIDEO_SHAPES).toEqual(['fill', '4:3', '4:3-stretched']);
    expect(SHAPE_43_CLASS).toBe('s2u-shape-43');
    expect([parseShape(null), parseShape(''), parseShape('fill'), parseShape('4:3'), parseShape('4:3-stretched'), parseShape('16:9'), parseShape('ps2')])
      .toEqual(['fill', 'fill', 'fill', '4:3', '4:3-stretched', 'fill', 'fill']);
  });

  it('effectiveShape: PS2 pixels draws the 4:3 frame whatever the shape; Modern keeps the shape', () => {
    for (const s of VIDEO_SHAPES) {
      expect(effectiveShape(s, 'ps2')).toBe('4:3');
      expect(effectiveShape(s, 'modern')).toBe(s);
    }
  });
});

describe('VIDEO-SHAPE: the keeper (WM.R20: nothing written on a read)', () => {
  const store = (init: Record<string, string> = {}) => {
    const m = new Map<string, string>(Object.entries(init)), writes: [string, string][] = [];
    return { m, writes, read: (k: string) => m.get(k) ?? null, write: (k: string, v: string) => { writes.push([k, v]); m.set(k, v); } };
  };

  it('absent reads fill, and a read writes nothing', () => {
    const s = store();
    const k = shapeKeeper(s.read, s.write);
    expect(k.get()).toBe('fill');
    expect(k.get()).toBe('fill');
    expect(s.writes).toEqual([]);
  });

  it('a stored shape reads back; an unknown stored value reads fill and is not written back', () => {
    expect(shapeKeeper(store({ [SHAPE_KEY]: '4:3-stretched' }).read, () => { throw new Error('written'); }).get()).toBe('4:3-stretched');
    const s = store({ [SHAPE_KEY]: 'cinema' });
    expect(shapeKeeper(s.read, s.write).get()).toBe('fill');
    expect(s.writes).toEqual([]);
  });

  it('choose writes (even the shape shown), set writes a change, observers hear changes only; clear empties the key', () => {
    const s = store();
    const k = shapeKeeper(s.read, s.write);
    const heard: VideoShape[] = [];
    const stop = k.observe((v) => heard.push(v));
    k.choose('fill');                                                                    // a press on the shape shown: saved, not told
    expect([s.m.get(SHAPE_KEY), heard]).toEqual(['fill', []]);
    k.choose('4:3');
    expect([k.get(), s.m.get(SHAPE_KEY), heard]).toEqual(['4:3', '4:3', ['4:3']]);
    k.set('4:3');                                                                        // the same again: nothing
    expect(s.writes).toHaveLength(2);
    k.set('cinema' as VideoShape);                                                       // never taken
    expect(k.get()).toBe('4:3');
    k.set('4:3-stretched');
    expect([k.get(), s.m.get(SHAPE_KEY), heard]).toEqual(['4:3-stretched', '4:3-stretched', ['4:3', '4:3-stretched']]);
    k.clear();
    expect([k.get(), s.m.get(SHAPE_KEY), heard]).toEqual(['fill', '', ['4:3', '4:3-stretched', 'fill']]);
    stop();
    k.choose('4:3');
    expect(heard).toHaveLength(3);
  });
});

describe('VIDEO-SHAPE: pageShape, the page\'s one keeper', () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { localStorage.clear(); });

  it('one keeper; a stored change from another writer is adopted at the next get and told, without writing', () => {
    const k = pageShape();
    expect(pageShape()).toBe(k);
    k.clear();
    expect(k.get()).toBe('fill');
    const heard: VideoShape[] = [];
    const stop = k.observe((v) => heard.push(v));
    localStorage.setItem(SHAPE_KEY, '4:3');                                              // a second tab
    expect(k.get()).toBe('4:3');
    expect(heard).toEqual(['4:3']);
    localStorage.removeItem(SHAPE_KEY);
    expect(k.get()).toBe('fill');
    expect(localStorage.getItem(SHAPE_KEY)).toBeNull();                                  // absent stays absent
    k.choose('4:3-stretched');
    expect(localStorage.getItem(SHAPE_KEY)).toBe('4:3-stretched');
    k.clear();
    expect(localStorage.getItem(SHAPE_KEY)).toBe('');
    expect(heard).toEqual(['4:3', 'fill', '4:3-stretched', 'fill']);
    stop();
  });
});

describe('VIDEO-SHAPE: shapeBox -- the canvas box and its drawing buffer, CSS px', () => {
  const box = (s: VideoShape, width: number, height: number) => { const r = shapeBox(s, { width, height }); return [r.box.width, r.box.height, r.buffer.width, r.buffer.height]; };

  it('fill: box and buffer are the area', () => {
    expect(box('fill', 1920, 1080)).toEqual([1920, 1080, 1920, 1080]);
    expect(box('fill', 1024, 768)).toEqual([1024, 768, 1024, 768]);
    expect(box('fill', 3440, 1440)).toEqual([3440, 1440, 3440, 1440]);
    expect(box('fill', 390, 844)).toEqual([390, 844, 390, 844]);
  });

  it('4:3: box and buffer the biggest 4:3 that fits; a window narrower than 4:3 is limited by its width', () => {
    expect(box('4:3', 1920, 1080)).toEqual([1440, 1080, 1440, 1080]);
    expect(box('4:3', 1024, 768)).toEqual([1024, 768, 1024, 768]);
    expect(box('4:3', 3440, 1440)).toEqual([1920, 1440, 1920, 1440]);
    expect(box('4:3', 390, 844)).toEqual([390, 292.5, 390, 292.5]);                       // the bars above and below
  });

  it('4:3 stretched: the box is the area, the buffer the 4:3 fit (the browser stretches it)', () => {
    expect(box('4:3-stretched', 1920, 1080)).toEqual([1920, 1080, 1440, 1080]);
    expect(box('4:3-stretched', 1024, 768)).toEqual([1024, 768, 1024, 768]);
    expect(box('4:3-stretched', 3440, 1440)).toEqual([3440, 1440, 1920, 1440]);
    expect(box('4:3-stretched', 390, 844)).toEqual([390, 844, 390, 292.5]);
  });
});

describe('VIDEO-SHAPE: ceilingWords -- VIDEO-SETTINGS.md\'s "How 4:3 fits the resolution rows"', () => {
  const screen = { width: 2560, height: 1440 };                                          // a 2560 x 1440 screen, DPR 1
  it('the table: Fill on a 16:9 window and 4:3, each ceiling', () => {
    const rows = ([720, 1080, 1440, 0] as const).map((c) => [ceilingWords(c, 'fill', screen, 1), ceilingWords(c, '4:3', screen, 1)]);
    expect(rows).toEqual([
      ['720p (1280 x 720)', '720p (960 x 720)'],
      ['1080p (1920 x 1080)', '1080p (1440 x 1080)'],
      ['1440p (2560 x 1440)', '1440p (1920 x 1440)'],
      ['Native (2560 x 1440)', 'Native (1920 x 1440)'],
    ]);
  });
  it('4:3 stretched draws the 4:3 size; the window\'s device height caps a taller ceiling; Native is uncapped', () => {
    expect(ceilingWords(1440, '4:3-stretched', screen, 1)).toBe('1440p (1920 x 1440)');
    expect(ceilingWords(1440, 'fill', { width: 1920, height: 1080 }, 1)).toBe('1440p (1920 x 1080)');
    // The batch review's F1: the words are what the match draws (`./videoSettings` `renderCapForV2` at 100 %): under a height
    // ceiling the ratio is at most 1, so a ratio-2 window smaller than the ceiling draws its own CSS size.
    expect(ceilingWords(1080, 'fill', { width: 1280, height: 720 }, 2)).toBe('1080p (1280 x 720)');
    expect(ceilingWords(1080, 'fill', { width: 1440, height: 900 }, 2)).toBe('1080p (1440 x 900)');
    // Native: the device's ratio, at most 2 on a desktop and 1.5 on a touch device (`./matchViewport` `pixelRatioCap`).
    expect(ceilingWords(0, 'fill', { width: 390, height: 844 }, 3, true)).toBe('Native (585 x 1266)');
    expect(ceilingWords(0, 'fill', { width: 1280, height: 720 }, 3)).toBe('Native (2560 x 1440)');
    expect(ceilingWords(0, '4:3', { width: 1280, height: 720 }, 2)).toBe('Native (1920 x 1440)');
  });
});
