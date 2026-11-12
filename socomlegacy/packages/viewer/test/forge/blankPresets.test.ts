import { describe, expect, it } from 'vitest';
import { BLANK_PRESETS, blankPresetOf, PRESET_SIDE_X, presetLayout } from '../../src/forge/blankPresets';
import { BOMB_SITE_REACH, type ForgeGameType, type LayoutBase } from '../../src/forge/layout';
import { EXTRACTION_ZONE_SIZE } from '../../src/forge/extractionZones';
import { blankFloorOf, bombReady, breachReady, forgeTypeUnplayable } from '../../src/forge/objectives';

/**
 * The blank floor's five presets (a browser adaptation, FG.R2; `presetLayout`'s doc): each names its game type, and
 * starts with what the room's own rule for that type reads -- a spawn a team always, the two sides apart along x.
 */
const BASE: LayoutBase = { kind: 'blank', library: 'MP2' };
const LENT = { source: 'MP6', character: 'hostage_a' };

describe('the blank floor presets (blankPresets)', () => {
  it('lists the five game types, each value its own and found back by blankPresetOf', () => {
    expect(BLANK_PRESETS.map((p) => [p.value, p.type])).toEqual([['blank:1', 1], ['blank:2', 2], ['blank:3', 3], ['blank:4', 4], ['blank:5', 5]]);
    for (const p of BLANK_PRESETS) {
      expect(p.label).toMatch(/^New Empty Map · (Breach|Demolition|Escort|Extraction|Suppression)$/);
      expect(blankPresetOf(p.value)).toBe(p);
    }
    expect(blankPresetOf('MP2')).toBeNull();
    expect(blankPresetOf('blank:9')).toBeNull();
  });

  it('every preset starts with one spawn a team, facing each other across the centre', () => {
    for (const p of BLANK_PRESETS) {
      const l = presetLayout(BASE, p.type, LENT);
      expect(l.base).toEqual(BASE);
      expect(l.objectives?.gameType).toBe(p.type);
      expect(l.spawns).toEqual([
        { team: 'A', p: [-PRESET_SIDE_X, 0, 0], yaw: -Math.PI / 2 },
        { team: 'B', p: [PRESET_SIDE_X, 0, 0], yaw: Math.PI / 2 },
      ]);
    }
  });

  it('DEMOLITION: the bomb in the middle and a site for each team, ready to play on a blank floor', () => {
    const l = presetLayout(BASE, 2, null);
    const bomb = l.objectives!.bomb!;
    expect(bomb.start).toEqual([0, 0, 0]);
    expect(bomb.sites.map((s) => [s.team, s.at, s.range, s.elevation])).toEqual([
      [0, [PRESET_SIDE_X + 60, 0, 120], BOMB_SITE_REACH, BOMB_SITE_REACH],
      [1, [-PRESET_SIDE_X - 60, 0, 120], BOMB_SITE_REACH, BOMB_SITE_REACH],
    ]);
    expect(bombReady(bomb)).toBe(true);
    expect(forgeTypeUnplayable(2, l.objectives, blankFloorOf({}))).toBeNull();
    expect(l.hostages).toBeUndefined();
  });

  it('BREACH: the start with the SEALs and the one SEALs\' site on the Terrorists\' side (breachReady)', () => {
    const l = presetLayout(BASE, 1, null);
    const bomb = l.objectives!.bomb!;
    expect(bomb.start).toEqual([-PRESET_SIDE_X + 40, 0, 0]);
    expect(bomb.sites).toHaveLength(1);
    expect(bomb.sites[0]).toMatchObject({ team: 0, at: [PRESET_SIDE_X + 60, 0, 0] });
    expect(breachReady(bomb)).toBe(true);
    expect(forgeTypeUnplayable(1, l.objectives, blankFloorOf({}))).toBeNull();
  });

  it('EXTRACTION: one hostage wearing the lent body and Safety behind the SEALs', () => {
    const l = presetLayout(BASE, 4, LENT);
    expect(l.hostages).toEqual([{ p: [PRESET_SIDE_X + 40, 0, -120], yaw: 0, name: 'Hostage1', source: 'MP6', character: 'hostage_a' }]);
    expect(l.extractionZones).toEqual([{ name: 'Safety', at: [-PRESET_SIDE_X - 60, 0, -120], size: [EXTRACTION_ZONE_SIZE, EXTRACTION_ZONE_SIZE] }]);
    expect(l.objectives?.bomb).toBeUndefined();
  });

  it('ESCORT: the three VIPs with the SEALs and Safety on the Terrorists\' side; with no lender they stand bare', () => {
    const l = presetLayout(BASE, 3, null);
    expect(l.hostages?.map((h) => [h.name, h.p, 'source' in h])).toEqual([
      ['Hostage1', [-PRESET_SIDE_X + 30, 0, -40], false], ['Hostage2', [-PRESET_SIDE_X + 30, 0, 0], false], ['Hostage3', [-PRESET_SIDE_X + 30, 0, 40], false],
    ]);
    expect(l.extractionZones?.map((z) => z.name)).toEqual(['Safety']);
    expect(l.extractionZones?.[0]?.at).toEqual([PRESET_SIDE_X + 60, 0, -120]);
  });

  it('SUPPRESSION: the spawns and nothing else', () => {
    const l = presetLayout(BASE, 5 as ForgeGameType, LENT);
    expect(l.objectives).toEqual({ gameType: 5 });
    expect(l.hostages).toBeUndefined();
    expect(l.extractionZones).toBeUndefined();
    expect(forgeTypeUnplayable(5, l.objectives, blankFloorOf({}))).toBeNull();
  });
});
