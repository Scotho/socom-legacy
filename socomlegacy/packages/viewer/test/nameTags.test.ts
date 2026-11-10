// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { Settings } from '@s2u/card';
import { ValveStore } from '@s2u/ui';
import {
  migrateTeamNames, NAME_TAGS_DEFAULT_ADAPTATION, NAME_TAGS_KEY, NAME_TAGS_LOOKS, NAME_TAGS_WORDS, readNameTags, saveNameTags,
  TEAM_NAMES_LEGACY_ORIGINAL_VALUE,
} from '../src/nameTags';
import { restoreValveModule } from '../src/originalOptions';
import { PAGE_SETTING_KEYS } from '../src/pageStore';

/**
 * SS-2 (H422 answered (a) by the owner, Craig, 2026-11-07; product track, **a browser adaptation**): the card's
 * TEAMMATE NAMES (`DISPLAY_MP_TEAM_NAMES`) holds the original's 0 / 1 only; the look of the tags -- the original's or the
 * port's adapted ones (LATER 671, OT.R101) -- is this browser's `s2u.viewer.nameTags`. A card written by v0.4.11-v0.4.12
 * at 2 (LATER 671's launcher-only "Original") is read as 1 and the browser key set to `original` once, so that player
 * keeps the look; said once on the console.
 */
function memory(): { settings: Settings; data: Map<string, string> } {
  const data = new Map<string, string>();
  const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); }, removeItem: (k: string) => { data.delete(k); } };
  return { settings: new Settings(() => storage as unknown as Storage, { report: () => {} } as never), data };
}

describe('SS-2: the name tags\' look, a browser setting (s2u.viewer.nameTags)', () => {
  it('the key is one of the page\'s keys, its looks Original / Modern, Modern by default (what v0.4.12\'s On drew)', () => {
    expect(NAME_TAGS_KEY).toBe('s2u.viewer.nameTags');
    expect(PAGE_SETTING_KEYS).toContain(NAME_TAGS_KEY);
    expect(NAME_TAGS_LOOKS).toEqual(['original', 'modern']);
    expect(NAME_TAGS_LOOKS.map((l) => NAME_TAGS_WORDS[l])).toEqual(['Original', 'Modern']);
    expect(NAME_TAGS_DEFAULT_ADAPTATION).toBe('modern');
  });

  it('reads the default unset or unknown, and what was saved', () => {
    const { settings, data } = memory();
    expect(readNameTags(settings)).toBe('modern');
    data.set(NAME_TAGS_KEY, 'bogus');
    expect(readNameTags(settings)).toBe('modern');
    saveNameTags('original', settings);
    expect(data.get(NAME_TAGS_KEY)).toBe('original');
    expect(readNameTags(settings)).toBe('original');
  });
});

describe('SS-2: a card holding TEAMMATE NAMES 2 is moved once -- 1 on the card\'s read, the browser key original', () => {
  it('migrateTeamNames: 2 -> 1 and the key original, logged once; 0 and 1 untouched, the key not written', () => {
    const { settings, data } = memory();
    const log = vi.fn();
    expect(TEAM_NAMES_LEGACY_ORIGINAL_VALUE).toBe(2);
    expect(migrateTeamNames([['DISPLAY_MP_TEAM_NAMES', 1], ['AutoAim', 2]], settings, log)).toEqual([['DISPLAY_MP_TEAM_NAMES', 1], ['AutoAim', 2]]);
    expect(migrateTeamNames([['DISPLAY_MP_TEAM_NAMES', 0]], settings, log)).toEqual([['DISPLAY_MP_TEAM_NAMES', 0]]);
    expect(data.has(NAME_TAGS_KEY)).toBe(false);
    expect(log).not.toHaveBeenCalled();
    expect(migrateTeamNames([['display_mp_team_names', 2], ['AutoAim', 2]], settings, log)).toEqual([['display_mp_team_names', 1], ['AutoAim', 2]]);
    expect(data.get(NAME_TAGS_KEY)).toBe('original');
    expect(log).toHaveBeenCalledTimes(1);
    migrateTeamNames([['DISPLAY_MP_TEAM_NAMES', 2]], settings, log);    // the same card read again: no second line
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('a look the player already chose in this browser is kept: the card still reads 1', () => {
    const { settings, data } = memory();
    saveNameTags('modern', settings);
    expect(migrateTeamNames([['DISPLAY_MP_TEAM_NAMES', 2]], settings, () => {})).toEqual([['DISPLAY_MP_TEAM_NAMES', 1]]);
    expect(data.get(NAME_TAGS_KEY)).toBe('modern');
  });

  it('through the card\'s read (restoreValveModule, every reader\'s path): the valve 1, the page\'s key original', () => {
    const was = globalThis.localStorage.getItem(NAME_TAGS_KEY);
    globalThis.localStorage.removeItem(NAME_TAGS_KEY);
    try {
      const valves = new ValveStore();
      expect(restoreValveModule(valves, { DISPLAY_MP_TEAM_NAMES: 2, BOBBING_1ST_PERSON: 1 })).toBe(true);
      expect(valves.find('DISPLAY_MP_TEAM_NAMES')?.value).toBe(1);
      expect(valves.find('BOBBING_1ST_PERSON')?.value).toBe(1);
      expect(globalThis.localStorage.getItem(NAME_TAGS_KEY)).toBe('original');
    } finally {
      if (was === null) globalThis.localStorage.removeItem(NAME_TAGS_KEY); else globalThis.localStorage.setItem(NAME_TAGS_KEY, was);
    }
  });
});
