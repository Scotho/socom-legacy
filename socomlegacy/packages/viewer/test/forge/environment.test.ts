import { describe, expect, it } from 'vitest';
import { directionWords, environmentSections, rgbHex, type EnvironmentSource } from '../../src/forge/environment';
import { lightArrowSpecs } from '../../src/forge/lightArrows';

/**
 * The Environment panel's read-only rows (a browser adaptation, FG.R2: the disc's own values shown, never edited): the
 * map's light rig (`GlobalLighting`), its fog (`cameras/camera`), its night, its shadows, its reflections, its flares --
 * each section naming where its values come from.
 */
const source: EnvironmentSource = {
  rig: {
    directions: [[0, 1, 0], [Math.SQRT1_2, Math.SQRT1_2, 0], [0, 0, 0]],
    colours: [[1, 0.5, 0], [0.2, 0.2, 0.2], [0, 0, 0]],
    ambient: [0.25, 0.25, 0.25],
  },
  camera: { fogColor: [128, 64, 32], fogNear: 100, fogFar: 4000, fogTop: 300, fogBottom: 0, fogEnabled: true, fogAltitude: true },
  night: { mission: true, lens: [0.2, 0.898, 0.2, 0.24] },   // the disc's LensFX_NVG, 0..1 (research 84 s14)
  shadowVector: [0, -1, 0],
  envMaterials: [{ texture: 'sky01.tif' }, { texture: 'chrome.tif' }],
  flares: 7,
  legacyLight: null,
};

describe('environmentSections', () => {
  const sections = environmentSections(source);
  const section = (title: string) => sections.find((s) => s.title === title)!;

  it('names its sections and where each comes from', () => {
    expect(sections.map((s) => s.title)).toEqual(['Light rig', 'Fog', 'Night', 'Shadows', 'Reflections', 'Flares']);
    expect(section('Light rig').source).toMatch(/GlobalLighting/);
    expect(section('Fog').source).toMatch(/cameras\/camera/);
  });

  it('a light: where it shines from (heading, elevation) and its colour; an unused third light said off', () => {
    const rows = section('Light rig').rows;
    expect(rows.map((r) => r.label)).toEqual(['Light 1', 'Light 2', 'Light 3', 'Ambient']);
    expect(rows[0]).toMatchObject({ value: 'from overhead', swatch: '#ff8000' });
    expect(rows[1]!.value).toBe('from 270°, 45° up');
    expect(rows[2]!.value).toMatch(/^off/);
    expect(rows[3]).toMatchObject({ swatch: '#404040' });
  });

  it('the fog as the disc keeps it: on, its colour (0..255), near and far, its height band', () => {
    const rows = section('Fog').rows;
    expect(rows.find((r) => r.label === 'Colour')).toMatchObject({ swatch: '#804020' });
    expect(rows.find((r) => r.label === 'Distance')!.value).toBe('100 – 4000 u');
    expect(rows.find((r) => r.label === 'Height fog')!.value).toBe('0 – 300 u');
  });

  it('night, shadows, reflections and flares in words', () => {
    expect(section('Night').rows.map((r) => r.value)).toEqual(['Yes', '#33e533 · alpha 0.24']);
    expect(section('Night').rows[1]!.swatch).toBe('#33e533');
    expect(section('Shadows').rows[0]!.value).toBe('straight down');
    expect(section('Reflections').rows[0]!.value).toBe('2 · sky01.tif, chrome.tif');
    expect(section('Flares').rows[0]!.value).toMatch(/^7/);
  });

  it('a legacy brightness only when a layout still carries one', () => {
    expect(sections.some((s) => s.rows.some((r) => r.label === 'Legacy brightness'))).toBe(false);
    const legacy = environmentSections({ ...source, legacyLight: 0.4 });
    expect(legacy.find((s) => s.title === 'Layout')!.rows[0]).toMatchObject({ label: 'Legacy brightness', value: '40%' });
  });

  it('no map: nothing to show', () => {
    expect(environmentSections({ rig: null, camera: null, flares: 0, legacyLight: null })).toEqual([]);
  });
});

describe('lightArrowSpecs', () => {
  it('an arrow each light the map uses, out toward its light and pointing the way it travels; the zero one left out', () => {
    const arrows = lightArrowSpecs(source.rig!, [100, 0, 100], 2000);
    expect(arrows).toHaveLength(2);
    expect(arrows[0]).toMatchObject({ from: [100, 600, 100], along: [-0, -1, -0], length: 600, colour: [1, 0.5, 0] });
    expect(lightArrowSpecs(source.rig!, [0, 0, 0], 10)[0]!.length).toBe(150);   // a small map: the arrow's floor
  });
});

describe('directionWords and rgbHex', () => {
  it('a heading in the port\'s yaw (0 down -z, left positive), an elevation from the horizon', () => {
    expect(directionWords([0, 0, -1])).toBe('from 0°, level');
    expect(directionWords([-1, 0, 0])).toBe('from 90°, level');
    expect(directionWords([0, -1, 0])).toBe('from below');
  });
  it('a 0..1 colour as a hex swatch, clamped', () => {
    expect(rgbHex([1, 0.5, 0])).toBe('#ff8000');
    expect(rgbHex([2, -1, 0.25])).toBe('#ff0040');
  });
});

describe("environmentOf copies a disc map's night lens in the disc's range (FP-1b; REVIEW-A 12)", () => {
  it('keeps LensFX_NVG as its 0..1 floats, each held to 0..1', async () => {
    const { environmentOf } = await import('../../src/forge/environmentCopy');
    const map = (lens: [number, number, number, number]) => ({ archive: 'MP81', lightRig: null, camera: null, night: { mission: true, lens } }) as never;
    expect(environmentOf(map([0.2, 0.898, 0.2, 0.24])).night).toEqual({ mission: true, lens: [0.2, 0.898, 0.2, 0.24] });
    expect(environmentOf(map([1.5, 0.5, -1, 0.3])).night).toEqual({ mission: true, lens: [1, 0.5, 0, 0.3] });
  });
});
