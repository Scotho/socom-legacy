import { describe, expect, it } from 'vitest';
import type { MapInfo } from '@s2u/archive';
import { labelFor } from '../src/mapOrder';
import {
  MAP_ALLOWLIST_ENV, allowedMultiplayerMaps, emptyPickerStatus, invalidMapStems, parseMapAllowlist, serverMapAllowlist,
} from '../src/multiplayerMaps';

/**
 * The deploy-time map allowlist (a browser / deployment adaptation, no original: the original's map choice is the
 * lobby's game creation). Adapted from Chris's browser-beta-v5 `packages/viewer/test/multiplayerMaps.test.ts`
 * (chris/browser-beta-integration d578f347): his six cases, with two changed on purpose -- an empty list is every map,
 * as the server's `MAPS` always was, and the picker keeps the map's own label -- and the server's half added.
 */

const maps: MapInfo[] = [
  { archive: 'MP2', path: 'RUN/MP2.ZDB', name: 'FROSTFIRE' },
  { archive: 'MP51', path: 'RUN/MP51.ZDB', name: 'VIGILANCE' },
  { archive: 'MP72', path: 'RUN/MP72.ZDB', name: 'CROSSROADS' },
];

describe('the client picker allowlist (parseMapAllowlist / allowedMultiplayerMaps)', () => {
  it('leaves the ordinary viewer unchanged without the variable: every map', () => {
    expect(parseMapAllowlist(undefined)).toBeNull();
    expect(allowedMultiplayerMaps(maps, null)).toEqual(maps);
  });

  it('keeps only canonical, de-duplicated stems, upper-cased, in the order given', () => {
    expect(parseMapAllowlist(' mp72,MP2,mp72,../RUN,MP123 ')).toEqual(['MP72', 'MP2']);
    expect(invalidMapStems(' mp72,MP2,mp72,../RUN,MP123 ')).toEqual(['../RUN', 'MP123']);
  });

  it('an empty or blank list is every map, as the server has always read MAPS= (his beta read it as none)', () => {
    expect(parseMapAllowlist('')).toBeNull();
    expect(parseMapAllowlist(' , ,')).toBeNull();
    expect(allowedMultiplayerMaps(maps, parseMapAllowlist(''))).toEqual(maps);
  });

  it('a list that names no real stem offers no map (the server refuses to start on it: see below)', () => {
    expect(parseMapAllowlist('frostfire')).toEqual([]);
    expect(allowedMultiplayerMaps(maps, parseMapAllowlist('frostfire'))).toEqual([]);
  });

  it('filters the disc maps to the listed ones, case aside', () => {
    expect(allowedMultiplayerMaps(maps, ['MP2'])).toEqual([maps[0]]);
    expect(allowedMultiplayerMaps([{ archive: 'mp51', path: 'RUN/mp51.ZDB', name: 'VIGILANCE' }], ['MP51'])).toHaveLength(1);
  });

  it('the picker keeps the map\'s own label: an allowlist changes which maps, never what they are called', () => {
    // His beta relabelled them "<NAME> · Suppression test (MPn)" under an allowlist; that was his package's wording.
    expect(labelFor(maps[2]!)).toContain('CROSSROADS');
    expect(labelFor(maps[2]!)).toContain('(MP72)');
  });
});

describe('an empty picker says why (emptyPickerStatus)', () => {
  it('no map on the disc: the disc is named, as before', () => {
    expect(emptyPickerStatus({ discMaps: 0, allowlist: undefined, source: 'iso' })).toMatch(/disc image holds no RUN\/MP\*\.ZDB/);
    expect(emptyPickerStatus({ discMaps: 0, allowlist: 'MP2', source: 'served' })).toMatch(/served index lists no MP archives/);
  });

  it('the disc has maps but the allowlist offers none of them: the allowlist is named, not the disc', () => {
    const s = emptyPickerStatus({ discMaps: 22, allowlist: 'MP72', source: 'iso' });
    expect(s).toMatch(/VITE_S2U_MAP_ALLOWLIST/);
    expect(s).toMatch(/MP72/);
    expect(s).toMatch(/22/);
    expect(s).not.toMatch(/is it SOCOM II/);
  });

  it('a list of non-stems (the client drops them; only the server refuses): the dropped tokens are named', () => {
    const s = emptyPickerStatus({ discMaps: 22, allowlist: 'frostfire,../RUN', source: 'iso' });
    expect(s).toMatch(/frostfire, \.\.\/RUN/);
    expect(s).toMatch(/not a map stem/);
  });
});

describe('the server reads the same variable (serverMapAllowlist)', () => {
  it('is named VITE_S2U_MAP_ALLOWLIST: the one name the viewer build can see', () => {
    expect(MAP_ALLOWLIST_ENV).toBe('VITE_S2U_MAP_ALLOWLIST');
  });

  it('parses one value to the same set as the client', () => {
    for (const value of ['MP2,MP51,MP72', ' mp2 , MP51 ', 'MP2,MP2']) {
      const client = parseMapAllowlist(value);
      expect(serverMapAllowlist({ VITE_S2U_MAP_ALLOWLIST: value })).toEqual({ maps: client });
      expect(serverMapAllowlist({ MAPS: value })).toEqual({ maps: client });
    }
  });

  it('unset or blank is every map: the server\'s empty list', () => {
    expect(serverMapAllowlist({})).toEqual({ maps: [] });
    expect(serverMapAllowlist({ MAPS: '', VITE_S2U_MAP_ALLOWLIST: ' ' })).toEqual({ maps: [] });
  });

  it('MAPS (the deploy\'s older name) and the variable may both be set only to the same maps', () => {
    expect(serverMapAllowlist({ MAPS: 'MP2,MP51', VITE_S2U_MAP_ALLOWLIST: 'mp51,MP2' })).toEqual({ maps: ['MP2', 'MP51'] });
    const both = serverMapAllowlist({ MAPS: 'MP2', VITE_S2U_MAP_ALLOWLIST: 'MP2,MP72' });
    expect('error' in both && both.error).toMatch(/MAPS.*VITE_S2U_MAP_ALLOWLIST/);
  });

  it('refuses a stem the server would never offer, rather than starting with a list the picker reads otherwise', () => {
    const bad = serverMapAllowlist({ VITE_S2U_MAP_ALLOWLIST: 'MP2,frostfire' });
    expect('error' in bad && bad.error).toMatch(/frostfire/);
  });
});
