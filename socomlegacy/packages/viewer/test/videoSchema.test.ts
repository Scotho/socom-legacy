// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Zar } from '@s2u/archive';
import { parseAnimSets } from '@s2u/scene';
import { dialogLookup, RadioStripWidget, VIDEO_PICTURE_DIALOG, VIDEO_ROW_SCALE_BOXES, VIDEO_ROW_TOGGLE_BOXES, VIDEO_ROWS, VIDEO_ROWS_SCALES, type PadSlotName } from '@s2u/ui';
import * as autoQuality from '../src/autoQuality';
import * as charShadow from '../src/charShadow';
import * as colourFilter from '../src/colourFilter';
import { liveOptions, VIDEO_ROW_IDS } from '../src/console/adapters/options';
import { optCategories, OVERLAY_LOCK_WORDS, type Adapters, type ConsoleState } from '../src/console/state';
import { FrontEndSession, type FrontEndDisc } from '../src/frontEnd';
import * as graphicsBackend from '../src/graphicsBackend';
import { GRAPHICS_BACKEND_APPLY_NOTE } from '../src/graphicsBackend';
import { PAGE_SETTING_KEYS } from '../src/pageStore';
import * as video from '../src/videoSettings';
import {
  PRESET_FREE_ROWS_ADAPTATION, PRESET_VALUES, readVideoSettingsV2, RENDER_SCALE_PCT_MAX_ADAPTATION, RENDER_SCALE_PCT_MIN_ADAPTATION,
  RENDER_SCALE_PCT_STEP_ADAPTATION, VIDEO_PRESET_DEFAULT_ADAPTATION, VIDEO_SCHEMA, VIDEO_SETTINGS_KEY_V2, VIDEO_SETTINGS_V2_ADAPTATION,
  videoRowsKeeperV2, videoSettingsDialogLookup, videoSettingsKeeperV2, type VideoSettingsV2,
} from '../src/videoSettings';

/**
 * VS-1 (the video settings page, product track -- every row a browser adaptation with no original; the plan
 * `docs/plans/2026-11-07-video-settings-page.md`, the spec `docs/specs/2026-11-07-video-settings-design.md` §4.1-§4.2): the
 * one description of the browser's video rows, `VIDEO_SCHEMA`, and the presets' values, `PRESET_VALUES`.
 */

const KEYS = Object.keys(readVideoSettingsV2(() => null)).sort();

describe('VS-1: the video schema', () => {
  it('VS-1: every schema row names a key of VideoSettings, a group, surfaces and apply; every nextMatch row is antialias, graphics or power', () => {
    expect(KEYS).toEqual(['antialias', 'ceiling', 'colourFilter', 'detailDistance', 'filtering', 'frameCap', 'graphics', 'overlay', 'power', 'preset', 'renderScalePct', 'shadows']);
    for (const row of VIDEO_SCHEMA) {
      expect(KEYS, String(row.key)).toContain(row.key);
      expect(['quality', 'display', 'detail', 'renderer', 'picture'], String(row.key)).toContain(row.group);
      expect(row.surfaces.length, String(row.key)).toBeGreaterThan(0);
      for (const s of row.surfaces) expect(['launcher', 'overlay', 'native']).toContain(s);
      expect(['live', 'nextMatch'], String(row.key)).toContain(row.apply);
      expect(['choice', 'percent', 'toggle']).toContain(row.kind);
      expect(typeof row.customOnly).toBe('boolean');
      expect(row.effect.length, String(row.key)).toBeGreaterThan(10);
    }
    expect(VIDEO_SCHEMA.map((r) => r.key).sort()).toEqual(KEYS);                     // every key once
    expect(VIDEO_SCHEMA.filter((r) => r.apply === 'nextMatch').map((r) => r.key).sort()).toEqual(['antialias', 'graphics', 'power']);
  });

  it("the spec's order, groups, Custom-only rows and native rows (VS.R8: the native screen's three)", () => {
    expect(VIDEO_SCHEMA.map((r) => [r.key, r.group])).toEqual([
      ['preset', 'quality'], ['renderScalePct', 'display'], ['ceiling', 'display'], ['frameCap', 'display'], ['overlay', 'display'],
      ['shadows', 'detail'], ['detailDistance', 'detail'], ['antialias', 'detail'], ['filtering', 'detail'],
      ['graphics', 'renderer'], ['power', 'renderer'], ['colourFilter', 'picture'],
    ]);
    expect(VIDEO_SCHEMA.filter((r) => r.customOnly).map((r) => r.key)).toEqual(['filtering', 'power', 'colourFilter']);
    expect(VIDEO_SCHEMA.filter((r) => r.surfaces.includes('native')).map((r) => r.key)).toEqual(['renderScalePct', 'overlay', 'shadows']);
    for (const r of VIDEO_SCHEMA) expect(r.surfaces, String(r.key)).toEqual(expect.arrayContaining(['launcher', 'overlay']));
    const row = (k: string) => VIDEO_SCHEMA.find((r) => r.key === k)!;
    expect(row('preset').values!.map((v) => v.word)).toEqual(['Automatic', 'Performance', 'Balanced', 'Quality', 'Custom']);
    expect(row('ceiling').values!.map((v) => [v.value, v.word])).toEqual([[720, '720p'], [1080, '1080p'], [1440, '1440p'], [0, 'Native']]);
    expect(row('frameCap').values!.map((v) => [v.value, v.word])).toEqual([[0, 'Off'], [30, '30'], [60, '60'], [120, '120']]);
    expect(row('frameCap').effect).toMatch(/[Vv]sync/);
    expect(row('overlay').values!.map((v) => v.word)).toEqual(['Off', 'FPS', 'FPS + frame time + ping']);
    expect(row('shadows').values!.map((v) => v.value)).toEqual(['off', 'low', 'medium', 'high']);
    expect(row('renderScalePct').values!.map((v) => v.value)).toEqual([50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100]);
    expect(row('renderScalePct').kind).toBe('percent');
    expect(row('antialias').kind).toBe('toggle');
    expect(row('graphics').values!.map((v) => v.value)).toEqual(['auto', 'webgl2', 'webgpu']);
    expect(row('power').values!.map((v) => v.value)).toEqual(['default', 'high-performance', 'low-power']);
    expect(row('colourFilter').values!.map((v) => v.value)).toEqual(['off', 'protanopia', 'deuteranopia', 'tritanopia']);
    expect(row('filtering').values!.map((v) => v.value)).toEqual(['original', 'anisotropic']);
    expect(row('detailDistance').values!.map((v) => v.value).slice(0, 2)).toEqual([1, 1.1]);
    expect(row('detailDistance').values!.at(-1)!.value).toBe(4);
    for (const r of ['antialias', 'graphics', 'power']) expect(row(r).effect, r).toMatch(/next match/);
    // WEBGPU-DEFAULT review F2 (2026-11-09): after a WebGPU error the row stays on WebGL2 until Automatic is chosen again.
    expect(row('graphics').effect).toMatch(/stays on WebGL2/);
    // F1 (the S1/S2 review, gmxbox1c): since S2 the Xbox class's Automatic draws WebGL2 (`./deviceClass` `classGraphics`),
    // so the help names that class, and the bring-back is said of every other.
    expect(row('graphics').effect).toMatch(/on an Xbox Automatic always draws WebGL2/);
    expect(row('graphics').effect).toMatch(/elsewhere, choose Automatic again to bring WebGPU back/);
  });

  it("PRESET_VALUES: the spec §4.2's defaults exactly; every preset's value is one of its row's values", () => {
    const common = { frameCap: 0, overlay: 'off', antialias: true, filtering: 'original', graphics: 'auto', power: 'default', colourFilter: 'off', detailDistance: 2 };
    expect(PRESET_VALUES.balanced).toEqual({ ...common, renderScalePct: 100, ceiling: 1440, shadows: 'medium' });
    expect(PRESET_VALUES.performance).toEqual({ ...common, renderScalePct: 75, ceiling: 1080, shadows: 'off' });
    expect(PRESET_VALUES.quality).toEqual({ ...common, renderScalePct: 100, ceiling: 0, shadows: 'medium' });
    for (const [name, values] of Object.entries(PRESET_VALUES)) {
      for (const r of VIDEO_SCHEMA) {
        if (r.key === 'preset') continue;
        const v = (values as Record<string, unknown>)[r.key];
        expect(r.values!.map((x) => x.value), `${name} ${r.key}`).toContain(v);
      }
    }
  });

  it("the adaptations are labelled as having no original; the key is the page's", () => {
    expect(VIDEO_SETTINGS_KEY_V2).toBe('s2u.viewer.video2');
    expect(PAGE_SETTING_KEYS).toContain(VIDEO_SETTINGS_KEY_V2);
    expect(VIDEO_PRESET_DEFAULT_ADAPTATION).toBe('auto');
    expect([RENDER_SCALE_PCT_MIN_ADAPTATION, RENDER_SCALE_PCT_MAX_ADAPTATION, RENDER_SCALE_PCT_STEP_ADAPTATION]).toEqual([50, 100, 5]);
    expect(PRESET_FREE_ROWS_ADAPTATION).toEqual(['overlay']);
    expect(VIDEO_SETTINGS_V2_ADAPTATION).toMatch(/no original/);
    expect(Object.keys(video).filter((n) => /_(PLACEHOLDER|READING)$/.test(n))).toEqual([]);   // product track: no value of the original here
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// VS-2 (the spec §4.1's pins; product track, every row a browser adaptation): the three surfaces drawn from the one schema.
// ---------------------------------------------------------------------------------------------------------------------

describe('VS-2: the launcher, the overlay and the native screen draw from VIDEO_SCHEMA', () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { localStorage.clear(); });
  const displayRows = (o: ReturnType<typeof liveOptions>) => o.categories().find((c) => c.id === 'display')!.rows;
  const schemaIds = (): Set<string> => new Set(VIDEO_SCHEMA.map((r) => VIDEO_ROW_IDS[r.key]));

  it('the launcher\'s Display rows under "This browser" are the schema\'s launcher rows, in its order (Custom: every one; else the Custom-only rows left out)', () => {
    const o = liveOptions(() => {}, { signedIn: () => false, pads: () => [], touch: () => false });
    try {
      const launcher = VIDEO_SCHEMA.filter((r) => r.surfaces.includes('launcher'));
      const drawn = () => displayRows(o).map((r) => r.id).filter((id) => schemaIds().has(id));
      expect(drawn()).toEqual(launcher.filter((r) => !r.customOnly).map((r) => VIDEO_ROW_IDS[r.key]));
      videoSettingsKeeperV2().set({ preset: 'custom' });
      expect(drawn()).toEqual(launcher.map((r) => VIDEO_ROW_IDS[r.key]));
      // each row's help is its schema row's effect; a next-match row says when it applies
      for (const r of launcher) {
        const row = displayRows(o).find((x) => x.id === VIDEO_ROW_IDS[r.key])!;
        expect(row.about, String(r.key)).toBe(r.effect);
        expect(row.note.includes(GRAPHICS_BACKEND_APPLY_NOTE), String(r.key)).toBe(r.apply === 'nextMatch');
        if (r.key !== 'preset') expect(row.values, String(r.key)).toEqual(r.values!.map((v) => v.word));
      }
    } finally { o.dispose(); }
  });

  it('the in-match overlay draws the nextMatch rows locked, with the note; the live rows stay free; out of a round none is locked', () => {
    const o = liveOptions(() => {}, { signedIn: () => false, pads: () => [], touch: () => false });
    try {
      videoSettingsKeeperV2().set({ preset: 'custom' });
      const a = { options: o } as unknown as Adapters;
      const over = (round: boolean) => ({ mode: 'overlay', page: { roundRunning: () => round, gameHolds: () => false, gamePage: () => true } }) as unknown as ConsoleState;
      const rowsOver = (round: boolean) => optCategories(over(round), a).find((c) => c.id === 'display')!.rows.filter((r) => schemaIds().has(r.id));
      const locked = (round: boolean) => rowsOver(round).filter((r) => r.locked !== undefined).map((r) => r.id);
      expect(locked(true)).toEqual(VIDEO_SCHEMA.filter((r) => r.apply === 'nextMatch').map((r) => VIDEO_ROW_IDS[r.key]));
      expect(OVERLAY_LOCK_WORDS.nextMatch).toContain(GRAPHICS_BACKEND_APPLY_NOTE);
      for (const r of rowsOver(true)) if (r.locked !== undefined) expect(r.locked).toBe(OVERLAY_LOCK_WORDS.nextMatch);
      expect(locked(false)).toEqual([]);
    } finally { o.dispose(); }
  });

  it('every *_ADAPTATION the schema and its rows name exists (the spec §4.2: the shadow tiers, the colour filter, Automatic, the renderer)', () => {
    const named: [string, unknown][] = [
      ['VIDEO_SETTINGS_V2_ADAPTATION', video.VIDEO_SETTINGS_V2_ADAPTATION], ['VIDEO_PRESET_DEFAULT_ADAPTATION', video.VIDEO_PRESET_DEFAULT_ADAPTATION],
      ['PRESET_FREE_ROWS_ADAPTATION', video.PRESET_FREE_ROWS_ADAPTATION], ['RENDER_SCALE_PCT_STEP_ADAPTATION', video.RENDER_SCALE_PCT_STEP_ADAPTATION],
      ['SHADOW_MAP_SCALE_LOW_ADAPTATION', charShadow.SHADOW_MAP_SCALE_LOW_ADAPTATION], ['SHADOW_MAP_SCALE_HIGH_ADAPTATION', charShadow.SHADOW_MAP_SCALE_HIGH_ADAPTATION],
      ['SHADOW_SOFT_TAPS_ADAPTATION', charShadow.SHADOW_SOFT_TAPS_ADAPTATION], ['COLOUR_FILTER_ADAPTATION', colourFilter.COLOUR_FILTER_ADAPTATION],
      ['CLASS_START_ADAPTATION', autoQuality.CLASS_START_ADAPTATION], ['PROBE_SECONDS_ADAPTATION', autoQuality.PROBE_SECONDS_ADAPTATION],
      ['DEFAULT_GRAPHICS_BACKEND_ADAPTATION', graphicsBackend.DEFAULT_GRAPHICS_BACKEND_ADAPTATION],
    ];
    for (const [name, v] of named) expect(v, name).toBeDefined();
  });

  it('VS.R8, the native rows through the adapter: RENDER SCALE lights the RESOLVED preset; a press leaves Automatic for that preset (never Custom); SHADOWS On restores the tier; SHOW FPS = overlay', () => {
    const m = new Map<string, string>();
    const v2 = videoSettingsKeeperV2((k) => m.get(k) ?? null, (k, v) => { m.set(k, v); });
    const rows = videoRowsKeeperV2(v2);
    expect(v2.get().preset).toBe('auto');
    expect(rows.get()).toEqual({ renderScale: 'balanced', shadows: true, showFps: false });     // Automatic's standard class: Balanced
    rows.set({ renderScale: 'performance' });
    expect([v2.get().preset, v2.get().shadows, video.isCustom(v2.get())]).toEqual(['performance', 'off', false]);   // VS-1 (d): shadows follow the preset
    expect(rows.get()).toEqual({ renderScale: 'performance', shadows: false, showFps: false });
    rows.set({ renderScale: 'quality' });
    expect([v2.get().preset, v2.get().shadows]).toEqual(['quality', 'medium']);
    rows.set({ shadows: false });
    expect([v2.get().shadows, v2.get().preset]).toEqual(['off', 'custom']);
    rows.set({ shadows: true });
    expect(v2.get().shadows).toBe('medium');                                                       // Quality's tier
    rows.set({ renderScale: 'balanced' });
    v2.set({ shadows: 'high' });
    rows.set({ shadows: true });                                                                   // already on: the tier kept
    expect(v2.get().shadows).toBe('high');
    rows.set({ showFps: true });
    expect(v2.get().overlay).toBe('fps');
    rows.set({ showFps: false });
    expect(v2.get().overlay).toBe('off');
  });

  const fixture = resolve(import.meta.dirname, '../../../test-fixtures');
  const haveFixtures = existsSync(resolve(fixture, 'RUN/UI/READERC.ZAR')) && existsSync(resolve(fixture, 'RUN/UIZANIM.ZAR'));
  it.skipIf(!haveFixtures)('the native VIDEO OPTIONS rows are the schema\'s native rows: on the fixture\'s dlgOptions_Video.rdr, each strip stepped RIGHT through its boxes writes the keeper (dev-disc tier; skips without the fixtures)', () => {
    expect(VIDEO_SCHEMA.filter((r) => r.surfaces.includes('native')).map((r) => r.key)).toEqual(['renderScalePct', 'overlay', 'shadows']);
    const m = new Map<string, string>();
    const v2 = videoSettingsKeeperV2((k) => m.get(k) ?? null, (k, v) => { m.set(k, v); });
    const disc: FrontEndDisc = {
      dialog: videoSettingsDialogLookup(dialogLookup([Zar.parse(readFileSync(resolve(fixture, 'RUN/UI/READERC.ZAR')))]), videoRowsKeeperV2(v2)),
      sets: parseAnimSets(Zar.parse(readFileSync(resolve(fixture, 'RUN/UIZANIM.ZAR')))).sets,
      faces: [], captions: null, loader: {}, missing: [], globalValves: [],
    };
    const s = new FrontEndSession({ disc, startDialog: VIDEO_PICTURE_DIALOG, loader: false });
    let now = 0;
    let down = new Set<PadSlotName>();
    s.input.source = { read: () => ({ down, stickX: 0, stickY: 0 }) } as unknown as typeof s.input.source;
    const frames = (n: number): void => { for (let i = 0; i < n; i++) s.advance(now += 1000 / 30); };
    const press = (b: PadSlotName): void => { down = new Set([b]); frames(1); down = new Set(); frames(6); };
    frames(120);
    const step = (control: string, read: (v: VideoSettingsV2) => unknown): { box: string; value: unknown }[] => {
      for (let i = 0; i < 24 && s.input.ring()?.focused?.name !== control; i++) press('DOWN');
      expect(s.input.ring()?.focused?.name, control).toBe(control);
      const w = s.parts.current?.widgets.get(control) as RadioStripWidget;
      expect(w).toBeInstanceOf(RadioStripWidget);
      const seen: { box: string; value: unknown }[] = [];
      for (let i = 0; i < w.children.length; i++) { press('RIGHT'); seen.push({ box: w.children[w.selection]!.name, value: read(v2.get()) }); }
      return seen;
    };
    try {
      // Automatic (the standard class: Balanced lit): RIGHT through QUALITY, PERFORMANCE, BALANCED -- each the preset, never Custom
      expect(step(VIDEO_ROWS.renderScale, (v) => v.preset)).toEqual([
        { box: VIDEO_ROW_SCALE_BOXES[2], value: VIDEO_ROWS_SCALES[2] }, { box: VIDEO_ROW_SCALE_BOXES[0], value: VIDEO_ROWS_SCALES[0] },
        { box: VIDEO_ROW_SCALE_BOXES[1], value: VIDEO_ROWS_SCALES[1] },
      ]);
      // Balanced: SHADOWS On; RIGHT to OFF, then ON again -- Balanced's Medium
      expect(step(VIDEO_ROWS.shadows, (v) => v.shadows)).toEqual([{ box: VIDEO_ROW_TOGGLE_BOXES.shadows[1], value: 'off' }, { box: VIDEO_ROW_TOGGLE_BOXES.shadows[0], value: 'medium' }]);
      expect(step(VIDEO_ROWS.showFps, (v) => v.overlay)).toEqual([{ box: VIDEO_ROW_TOGGLE_BOXES.showFps[0], value: 'fps' }, { box: VIDEO_ROW_TOGGLE_BOXES.showFps[1], value: 'off' }]);
    } finally { s.close(); }
  });
});
