import { describe, expect, it } from 'vitest';
import { emptyLayout, parseLayout, serializeLayout, type Layout } from '../../src/forge/layout';
import {
  fovForVertical, SURFACE_CHOICES, verticalDegrees, withExtrasSettings, withLoadingTitle, withWorldSettings,
} from '../../src/forge/worldSettings';
import { settingsDelta } from '../../src/forge/settings';
import { DEFAULT_SETTINGS } from '../../src/forge/layout';

/**
 * The layout's world settings (`./worldSettings`; the owner, 2026-11-10: "I want to be able to define every single map
 * setting"): the map's own values a disc map carries, written over it --
 * - `defaultMaterial`: `world_params.DefaultMaterial` (Frostfire `METAL_THICK`), the SOILS entry a polygon's byte 0
 *   stands for (`FUN_002dc1d0`, `FUN_002ddc30`);
 * - `reverb`: `mission.rdr` `IndoorReverb` / `OutdoorReverb`, each zone's depth and ramp seconds (research 81 §9);
 * - `fov`: the camera record's `m_hfov` / `m_vfov` half-angles (`fov (0.6109 0.4276)` on Frostfire);
 * - `loading`: the loading screen's map (`LoadingScreenAssets` and its `UiVars`) and its `mission_title` /
 *   `mission_description` (research 125).
 */
const base = emptyLayout({ kind: 'map', archive: 'MP2' });

describe('the layout file keeps the world settings', () => {
  it('round-trips each, bounded; null is the map\'s own', () => {
    const settings = {
      defaultMaterial: 'SAND', reverb: { indoor: [[0.45, 1], [0.2, 1]] as [number, number][], outdoor: [[0.07, 1]] as [number, number][] },
      fov: { h: 0.7, v: 0.5 }, loading: { from: 'MP61', title: 'COLD FRONT', description: null },
    };
    const l: Layout = { ...base, settings };
    expect(parseLayout(serializeLayout(l))).toEqual(l);
    expect(parseLayout(JSON.stringify({ ...base, settings: { defaultMaterial: null, reverb: null, fov: null, loading: null } })).settings)
      .toEqual({ defaultMaterial: null, reverb: null, fov: null, loading: null });
    const bad = (s: unknown): (() => unknown) => () => parseLayout(JSON.stringify({ ...base, settings: s }));
    expect(bad({ defaultMaterial: 'sand!' })).toThrow(/defaultMaterial/);
    expect(bad({ reverb: { indoor: [[1.5, 1]], outdoor: [] } })).toThrow(/reverb/);
    expect(bad({ reverb: { indoor: [[0.5, -1]], outdoor: [] } })).toThrow(/reverb/);
    expect(bad({ reverb: { indoor: Array(9).fill([0.1, 1]), outdoor: [] } })).toThrow(/reverb/);
    expect(bad({ fov: { h: 0.01, v: 0.4 } })).toThrow(/fov/);
    expect(bad({ fov: { h: 0.6, v: 2 } })).toThrow(/fov/);
    expect(bad({ loading: { from: 'X1', title: null, description: null } })).toThrow(/loading/);
    expect(bad({ loading: { from: null, title: 'x'.repeat(65), description: null } })).toThrow(/loading/);
  });

  it('keeps each in the layout whenever it is set', () => {
    const fov = { h: 0.7, v: 0.5 };
    expect(settingsDelta({ ...DEFAULT_SETTINGS, defaultMaterial: 'SAND', fov })).toEqual({ defaultMaterial: 'SAND', fov });
  });
});

describe('the world settings over the map', () => {
  const map = { archive: 'MP2', camera: { hfov: 0.6109, vfov: 0.4276, fogFar: 640 }, grenade: { defaultMaterial: 'METAL_THICK', other: 1 } };

  it('is the map itself with none set', () => {
    expect(withWorldSettings(map as never, DEFAULT_SETTINGS)).toEqual({ map, refused: [] });
  });

  it('puts the default surface where the page and the room read it, and the field of view on the camera', () => {
    const out = withWorldSettings(map as never, { ...DEFAULT_SETTINGS, defaultMaterial: 'SAND', fov: { h: 0.8, v: 0.55 } });
    const m = out.map as unknown as typeof map;
    expect(m.grenade).toEqual({ defaultMaterial: 'SAND', other: 1 });
    expect([m.camera.hfov, m.camera.vfov, m.camera.fogFar]).toEqual([0.8, 0.55, 640]);
    expect(map.grenade.defaultMaterial).toBe('METAL_THICK');
  });

  it('refuses a surface the SOILS table does not name', () => {
    const out = withWorldSettings(map as never, { ...DEFAULT_SETTINGS, defaultMaterial: 'LAVA' });
    expect(out.refused).toEqual(['default surface LAVA: no SOILS entry of that name']);
    expect((out.map as unknown as typeof map).grenade.defaultMaterial).toBe('METAL_THICK');
  });

  it('offers the floor surfaces of the SOILS table, none of its volumes, liquids, people or items', () => {
    expect(SURFACE_CHOICES).toEqual(expect.arrayContaining(['SAND', 'SNOW', 'METAL_THICK', 'GRASS', 'WOOD_THICK']));
    for (const no of ['WATER', 'UNDERWATER', 'PERSON', 'ITEM', 'GRASS_VOL', 'LEAFY_TREE', 'ACTION', 'INVISIBLE_DI']) expect(SURFACE_CHOICES).not.toContain(no);
  });

  it('the vertical slider keeps the map\'s own frame: tan(h) / tan(v) as the map\'s', () => {
    const f = fovForVertical(60, { hfov: 0.6109, vfov: 0.4276 });
    expect(verticalDegrees(f.v)).toBeCloseTo(60, 6);
    expect(Math.tan(f.h) / Math.tan(f.v)).toBeCloseTo(Math.tan(0.6109) / Math.tan(0.4276), 6);
    expect(verticalDegrees(0.4276)).toBeCloseTo(49, 0);
  });
});

describe('the world settings over the match\'s sound and effects', () => {
  const extras = {
    effects: { materials: ['UNKNOWN', 'GRASS', 'SAND', 'METAL_THICK'], defaultMaterial: 3, other: 1 },
    sound: { data: { materials: [{ name: 'UNKNOWN' }, { name: 'SAND' }, { name: 'METAL_THICK' }], defaultMaterial: 2,
      reverb: { preset: [1], indoor: [[0.45, 1]], outdoor: [[0.07, 1]] } }, loops: [] },
  };

  it('is the extras themselves with none set', () => {
    expect(withExtrasSettings(extras as never, DEFAULT_SETTINGS).extras).toBe(extras);
  });

  it('indexes the surface in each table, and replaces the reverb\'s zones, the preset kept', () => {
    const out = withExtrasSettings(extras as never, { ...DEFAULT_SETTINGS, defaultMaterial: 'SAND', reverb: { indoor: [[0.9, 2]], outdoor: [] } });
    const e = out.extras as unknown as typeof extras;
    expect(e.effects.defaultMaterial).toBe(2);
    expect(e.sound.data.defaultMaterial).toBe(1);
    expect(e.sound.data.reverb).toEqual({ preset: [1], indoor: [[0.9, 2]], outdoor: [] });
    expect(extras.sound.data.reverb.indoor).toEqual([[0.45, 1]]);
    expect(withExtrasSettings({ effects: null, sound: null }, { ...DEFAULT_SETTINGS, defaultMaterial: 'SAND' }).extras).toEqual({ effects: null, sound: null });
  });
});

describe('the loading screen\'s words', () => {
  const screen = { map: 'RUN/MP61.ZDB', binding: { title: 'FROSTFIRE', description: 'X', picture: 'p', library: 'l', stem: 'S', vars: new Map([['mission_title', 'FROSTFIRE'], ['mission_description', 'X']]) } };
  it('puts the layout\'s title and description in the binding and its UiVars; none set, the screen as it is', () => {
    expect(withLoadingTitle(screen as never, null)).toBe(screen);
    const out = withLoadingTitle(screen as never, { from: null, title: 'COLD FRONT', description: null }) as unknown as typeof screen;
    expect([out.binding.title, out.binding.vars.get('mission_title'), out.binding.description]).toEqual(['COLD FRONT', 'COLD FRONT', 'X']);
    expect(screen.binding.vars.get('mission_title')).toBe('FROSTFIRE');
  });
});
