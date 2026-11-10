// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Settings } from '@s2u/card';
import { PAGE_SETTING_KEYS } from '../src/pageStore';
import {
  RANGE_READOUT_ADAPTATION, RANGE_READOUT_DEFAULT_ADAPTATION, RANGE_READOUT_KEY, RANGE_READOUT_VALUES, RANGE_READOUT_WORDS, readRangeReadout,
  saveRangeReadout,
} from '../src/rangeReadout';

/**
 * HUD-ALIVE C (OT.R117; product track, **a browser adaptation**): the port's range readout -- the range finder's metres
 * in the info box's spot at (587, 433), where the original draws the consoles' count -- is a setting kept in this
 * browser, off by default (the owner, Craig, 2026-11-09: "make the [meters] a setting soption and turn it OFF by
 * default"). When on it takes the count's place: one number fits there.
 */
function memory(): { settings: Settings; data: Map<string, string> } {
  const data = new Map<string, string>();
  const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); }, removeItem: (k: string) => { data.delete(k); } };
  return { settings: new Settings(() => storage as unknown as Storage, { report: () => {} } as never), data };
}

describe('HUD-ALIVE C: the range readout, a browser setting (s2u.viewer.rangeReadout), off by default', () => {
  it('the key is one of the page\'s keys; Off / On, Off by default', () => {
    expect(RANGE_READOUT_KEY).toBe('s2u.viewer.rangeReadout');
    expect(PAGE_SETTING_KEYS).toContain(RANGE_READOUT_KEY);
    expect(RANGE_READOUT_VALUES).toEqual(['off', 'on']);
    expect(RANGE_READOUT_VALUES.map((v) => RANGE_READOUT_WORDS[v])).toEqual(['Off', 'On']);
    expect(RANGE_READOUT_DEFAULT_ADAPTATION).toBe('off');
  });

  it('reads Off unset or unknown, and what was saved', () => {
    const { settings, data } = memory();
    expect(readRangeReadout(settings)).toBe('off');
    data.set(RANGE_READOUT_KEY, 'bogus');
    expect(readRangeReadout(settings)).toBe('off');
    saveRangeReadout('on', settings);
    expect(data.get(RANGE_READOUT_KEY)).toBe('on');
    expect(readRangeReadout(settings)).toBe('on');
  });

  it('is labelled an adaptation carrying the owner\'s words', () => {
    expect(RANGE_READOUT_ADAPTATION).toBe('the range finder in the info box\'s spot, in the count\'s place, when on');
    const doc = readFileSync(resolve(import.meta.dirname, '../src/rangeReadout.ts'), 'utf8');
    expect(doc).toContain('make the [meters] a setting soption and turn it OFF by default by the name');
  });

  it('both pages read it at the mount into the HUD', () => {
    for (const f of ['main.ts', 'matchMount.ts']) {
      const text = readFileSync(resolve(import.meta.dirname, '../src', f), 'utf8');
      expect(text, f).toContain("hud.setRangeReadout(readRangeReadout() === 'on');");
    }
  });
});
