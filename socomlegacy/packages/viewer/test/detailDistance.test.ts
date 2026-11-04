// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  clampDetailDistance, DETAIL_DISTANCE_KEY, DETAIL_DISTANCE_MAX, DETAIL_DISTANCE_MIN, DETAIL_DISTANCE_MODERN_DEFAULT,
  DETAIL_DISTANCE_STEP, DETAIL_DISTANCE_VALUES, detailDistanceFor, detailDistanceIndex, detailDistanceKeeper, formatDetailDistance,
} from '../src/detailDistance';
import { PAGE_SETTING_KEYS } from '../src/pageStore';
import { detailDistanceMenuItem } from '../src/forge/panels/viewPanel';

/**
 * The owner's detail distance (PF.R60, a browser adaptation over PF-30's per-visual gate, PF.R50): one stored
 * factor for the front end and the Forge; the PS2 picture keeps the original (1); Modern and Experimental default to 2.
 */
const store = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { m, read: (k: string) => m.get(k) ?? null, write: (k: string, v: string) => { m.set(k, v); } };
};

describe('the detail distance (PF.R60)', () => {
  it('Modern/Experimental default = 2; the slider 1.0-4.0 by 0.1, 1 the original; one page key', () => {
    expect(DETAIL_DISTANCE_MODERN_DEFAULT).toBe(2);
    expect([DETAIL_DISTANCE_MIN, DETAIL_DISTANCE_MAX, DETAIL_DISTANCE_STEP]).toEqual([1, 4, 0.1]);
    expect(DETAIL_DISTANCE_KEY).toBe('s2u.viewer.detailDistance');
    expect(PAGE_SETTING_KEYS).toContain(DETAIL_DISTANCE_KEY);
    expect(DETAIL_DISTANCE_VALUES).toHaveLength(31);
    expect([DETAIL_DISTANCE_VALUES[0], DETAIL_DISTANCE_VALUES[10], DETAIL_DISTANCE_VALUES[30]]).toEqual(['1.0×', '2.0×', '4.0×']);
    expect(detailDistanceIndex(DETAIL_DISTANCE_MODERN_DEFAULT)).toBe(10);
    expect(formatDetailDistance(2.5)).toBe('2.5×');
  });

  it('PS2 picture = factor 1 = the original, whatever is stored; Modern and Experimental take the stored value', () => {
    for (const stored of [1, 2, 3.7, 4]) {
      expect(detailDistanceFor('ps2', stored)).toBe(1);
      expect(detailDistanceFor('modern', stored)).toBe(stored);
      expect(detailDistanceFor('experimental', stored)).toBe(stored);
    }
  });

  it('out-of-range values clamp to [1, 4] on the 0.1 grid; garbage reads the default', () => {
    expect([clampDetailDistance(0), clampDetailDistance(-3), clampDetailDistance(0.99)]).toEqual([1, 1, 1]);
    expect([clampDetailDistance(4.01), clampDetailDistance(100)]).toEqual([4, 4]);
    expect(clampDetailDistance(2.34)).toBe(2.3);
    expect(clampDetailDistance(1.1 + 0.2)).toBe(1.3);
    expect([clampDetailDistance(Number.NaN), clampDetailDistance(Number.POSITIVE_INFINITY)]).toEqual([2, 2]);
  });

  it('the stored value round-trips through the page key; nothing stored reads 2; a stored value out of range clamps', () => {
    const s = store();
    const k = detailDistanceKeeper(s.read, s.write);
    expect(k.get()).toBe(2);
    const heard: number[] = [];
    const stop = k.observe((v) => heard.push(v));
    k.set(3.3);
    expect([k.get(), s.m.get(DETAIL_DISTANCE_KEY)]).toEqual([3.3, '3.3']);
    k.set(9);
    expect([k.get(), s.m.get(DETAIL_DISTANCE_KEY)]).toEqual([4, '4']);
    k.set(4);                                                       // the same again: not heard
    expect(heard).toEqual([3.3, 4]);
    stop();
    k.step(-1);
    expect(k.get()).toBe(3.9);
    expect(heard).toEqual([3.3, 4]);
    // A second keeper over the same store -- the Forge's beside the front end's -- reads the one setting.
    expect(detailDistanceKeeper(s.read, s.write).get()).toBe(3.9);
    expect(detailDistanceKeeper(store({ [DETAIL_DISTANCE_KEY]: '0.2' }).read).get()).toBe(1);
    expect(detailDistanceKeeper(store({ [DETAIL_DISTANCE_KEY]: 'far' }).read).get()).toBe(2);
  });

  it('the Forge View menu row: steps the value by 0.1 left and right; under the PS2 picture it reads 1.0× and is disabled', () => {
    let value = 2, ps2 = false;
    const hooks = { value: () => value, step: (d: -1 | 1) => { value = clampDetailDistance(value + d * DETAIL_DISTANCE_STEP); }, ps2: () => ps2 };
    let item = detailDistanceMenuItem(hooks);
    expect([item.id, item.label, item.value, item.disabled ?? false]).toEqual(['view-detailDistance', 'Detail distance', '2.0×', false]);
    item.right!();
    expect(value).toBe(2.1);
    item.left!(); item.left!();
    expect(value).toBe(1.9);
    ps2 = true;
    item = detailDistanceMenuItem(hooks);
    expect([item.value, item.disabled]).toEqual(['1.0× (PS2)', true]);
    item.right?.();
    expect(value).toBe(1.9);                                        // the PS2 picture: the slider does not apply
  });
});
