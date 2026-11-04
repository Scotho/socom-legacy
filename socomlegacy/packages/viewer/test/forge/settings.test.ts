import { describe, expect, it } from 'vitest';
import type { LoadedMap } from '../../src/loadMap';
import type { FogSettings } from '../../src/fog';
import { brightenOf, DEFAULT_LIGHTING } from '../../src/lighting';
import { MAX_ROUNDS } from '../../src/net/rules';
import { MAX_PLAYERS } from '../../src/net/protocol';
import { DEFAULT_SETTINGS, SETTINGS_BOUNDS, type LayoutSettings } from '../../src/forge/layout';
import { withSettings } from '../../src/forge/matchMap';
import { matchBrightenOf } from '../../src/forge/settings';
import {
  boundSetting, brightenFor, FOG_SLIDER_STEPS, fogOfSlider, fogWithFar, LIGHT_FLOOR, lightGain, roomOptionsOf, settingsDelta, sliderOfFog,
  stepSetting,
} from '../../src/forge/settings';

/**
 * FG-24 (FG.R18; the owner, 2026-10-14: "a map settings that includes day/night slider, fog distance slider, max players
 * (up to 32 max)"; an adaptation, no original): what the forge's settings do to the editor's light and fog, to Play's
 * composed map and to the page's room -- nothing at the disc's values (light 1, the map's own fog, the room's defaults).
 */
const s = (o: Partial<LayoutSettings>): LayoutSettings => ({ ...DEFAULT_SETTINGS, ...o });

describe('FG-24: the day / night slider', () => {
  it('is the disc\'s light at 1 and LIGHT_FLOOR of it at 0, a straight line between', () => {
    expect(lightGain(1)).toBe(1);
    expect(lightGain(0)).toBe(LIGHT_FLOOR);
    expect(LIGHT_FLOOR).toBeGreaterThan(0);                             // dark, never black
    expect(lightGain(0.5)).toBeCloseTo(LIGHT_FLOOR + (1 - LIGHT_FLOOR) / 2, 12);
  });

  it('scales the brighten uniform\'s factor (`brightenOf`) by the gain, over the disc\'s own brighten', () => {
    expect(brightenFor(0, 1)).toBe(0);                                  // the disc's: no brighten pass
    for (const disc of [0, 40]) {
      for (const light of [0, 0.35, 1]) {
        const got = brightenOf({ ...DEFAULT_LIGHTING, brighten: brightenFor(disc, light) });
        expect(got).toBeCloseTo(brightenOf({ ...DEFAULT_LIGHTING, brighten: disc }) * lightGain(light), 12);
      }
    }
  });
});

describe('FG-24: the fog distance', () => {
  const disc: FogSettings = { enabled: false, near: 1000, far: 4000, color: [100, 110, 120], altitude: { top: 5, bottom: 1 } };

  it('leaves the map\'s fog as it is when unset; else puts the far there and the near at the disc\'s ratio to it', () => {
    expect(fogWithFar(disc, null)).toEqual(disc);
    const f = fogWithFar(disc, 8000);
    expect([f.near, f.far, f.enabled]).toEqual([2000, 8000, true]);     // a set distance is fog on
    expect([f.color, f.altitude]).toEqual([disc.color, disc.altitude]);
    expect(disc.far).toBe(4000);                                        // the disc's is not touched
    // A fog with no span of its own (near past far) takes `fogForExtent`'s ratio.
    expect(fogWithFar({ ...disc, near: 5000, far: 10 }, 9500).near).toBe(3500);
  });

  it('slides on a log scale from the bound\'s least to its most, in whole steps, and back', () => {
    const b = SETTINGS_BOUNDS.fogFar;
    expect(fogOfSlider(0)).toBe(b.min);
    expect(fogOfSlider(FOG_SLIDER_STEPS)).toBe(b.max);
    for (const far of [100, 600, 4000, 12000, 100000]) expect(Math.abs(fogOfSlider(sliderOfFog(far)) - far)).toBeLessThanOrEqual(far * 0.01 + b.step);
    for (let t = 0; t <= FOG_SLIDER_STEPS; t += 37) expect(fogOfSlider(t) % b.step).toBe(0);
  });
});

describe('FG-24: bounding and stepping', () => {
  it('snaps a typed value to its field\'s step inside its bounds (players even)', () => {
    expect(boundSetting('players', 3)).toBe(4);
    expect(boundSetting('players', 40)).toBe(32);
    expect(boundSetting('players', 0)).toBe(2);
    expect(boundSetting('rounds', 0)).toBe(1);
    expect(boundSetting('rounds', 12.4)).toBe(11);
    expect(boundSetting('roundSeconds', 100)).toBe(90);
    expect(boundSetting('light', 0.53)).toBe(0.55);
    expect(boundSetting('fogFar', 4321)).toBe(4300);
  });

  it('steps each pad row by its step, held at its bounds; the fog from the map\'s own distance by a quarter', () => {
    expect(stepSetting(s({}), 'light', 1, 4000).light).toBe(1);
    expect(stepSetting(s({}), 'light', -1, 4000).light).toBe(0.95);
    expect(stepSetting(s({ light: 0.05 }), 'light', -1, 4000).light).toBe(0);
    expect(stepSetting(s({}), 'players', 1, 4000).players).toBe(18);
    expect(stepSetting(s({ players: 32 }), 'players', 1, 4000).players).toBe(32);
    expect(stepSetting(s({}), 'rounds', -1, 4000).rounds).toBe(10);
    expect(stepSetting(s({}), 'roundSeconds', 1, 4000).roundSeconds).toBe(390);
    expect(stepSetting(s({}), 'fogFar', 1, 4000).fogFar).toBe(5000);
    expect(stepSetting(s({}), 'fogFar', -1, 4000).fogFar).toBe(3200);
    expect(stepSetting(s({ fogFar: 100 }), 'fogFar', -1, 4000).fogFar).toBe(100);
    expect(stepSetting(s({ fogFar: 100 }), 'fogFar', 1, 4000).fogFar).toBe(200);   // a step always moves
    expect(stepSetting(s({ fogFar: 100000 }), 'fogFar', 1, 4000).fogFar).toBe(100000);
    expect(stepSetting(s({}), 'friendlyFire', 1, 4000).friendlyFire).toBe(true);
    expect(stepSetting(s({ friendlyFire: true }), 'friendlyFire', -1, 4000).friendlyFire).toBe(false);
  });

  it('NPB-6: steps the NPCs\' behaviour through its words either way, wrapping, and the layout keeps it only when it is not `patrol` (NPB.R10)', () => {
    expect(stepSetting(s({}), 'npcBehaviour', 1, 4000).npcBehaviour).toBe('sentry');
    expect(stepSetting(s({ npcBehaviour: 'sentry' }), 'npcBehaviour', 1, 4000).npcBehaviour).toBe('patrol');
    expect(stepSetting(s({}), 'npcBehaviour', -1, 4000).npcBehaviour).toBe('sentry');
    expect(settingsDelta(s({}))).toEqual({});
    expect(settingsDelta(s({ npcBehaviour: 'sentry' }))).toEqual({ npcBehaviour: 'sentry' });
    // It is the page's own choice, not the room's: no room option follows from it.
    expect(roomOptionsOf(s({ npcBehaviour: 'sentry' }))).toEqual(roomOptionsOf(DEFAULT_SETTINGS));
  });

  it('keeps in the layout only what differs from the disc\'s values', () => {
    expect(settingsDelta(DEFAULT_SETTINGS)).toEqual({});
    expect(settingsDelta(s({ light: 0.4, players: 16, fogFar: 9000 }))).toEqual({ light: 0.4, fogFar: 9000 });
  });
});

describe('FG-24: Play -- the room\'s options and the composed map', () => {
  it('passes rounds, round time, friendly fire and players as the room\'s own options; the defaults are the room\'s', () => {
    expect(roomOptionsOf(DEFAULT_SETTINGS)).toEqual({ maxRounds: MAX_ROUNDS, roundSeconds: 6 * 60, allowFriendlyFire: false, maxPlayers: MAX_PLAYERS });
    expect(roomOptionsOf(s({ rounds: 3, roundSeconds: 120, friendlyFire: true, players: 8 })))
      .toEqual({ maxRounds: 3, roundSeconds: 120, allowFriendlyFire: true, maxPlayers: 8 });
  });

  const camera = { fogColor: [100, 100, 200], fogNear: 600, fogFar: 3000, fogEnabled: false, fogAltitude: false, fogTop: 0, fogBottom: 0 };
  const rig = { directions: [[0, 1, 0]], colours: [[0.8, 0.6, 0.4]], ambient: [0.2, 0.2, 0.2] };
  const map = { archive: 'MP2', camera, lightRig: rig } as unknown as LoadedMap;

  it('carries the settings\' fog distance on the map\'s camera (the near at the disc\'s ratio); the light stays off the map', () => {
    const m = withSettings(map, s({ fogFar: 6000, light: 0.5 }));
    expect([m.camera!.fogFar, m.camera!.fogNear, m.camera!.fogEnabled]).toEqual([6000, 1200, true]);
    // The light is the match's brighten (`matchBrightenOf`), over everything as in the editor: the fog colour and the
    // rig keep the disc's values here, or the brighten would darken them a second time.
    expect(m.camera!.fogColor).toEqual([100, 100, 200]);
    expect(m.lightRig).toBe(rig);
    expect(withSettings(map, s({ light: 0.5 }))).toBe(map);
    expect(camera.fogFar).toBe(3000);    // the archive's map is not touched
  });

  it('gives the match the editor\'s brighten for the light: none at the disc\'s light, the gain over the disc\'s none below it', () => {
    expect(matchBrightenOf(DEFAULT_SETTINGS)).toBeUndefined();
    const b = matchBrightenOf(s({ light: 0.5 }))!;
    expect(brightenOf({ ...DEFAULT_LIGHTING, brighten: b })).toBeCloseTo(lightGain(0.5), 10);
    expect(b).toBe(brightenFor(0, 0.5));
  });

  it('is the map as it is at the disc\'s values, and a map with no camera or rig keeps none', () => {
    expect(withSettings(map, DEFAULT_SETTINGS)).toBe(map);
    const bare = { archive: 'X', camera: null, lightRig: null } as unknown as LoadedMap;
    const m = withSettings(bare, s({ fogFar: 6000, light: 0.2 }));
    expect([m.camera, m.lightRig]).toEqual([null, null]);
  });
});
