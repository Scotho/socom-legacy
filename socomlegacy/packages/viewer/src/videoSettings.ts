import { videoSettingsLookup, type DialogDesign, type VideoRowsKeeper, type VideoRowsSettings } from '@s2u/ui';
import { autoResolved, clearAutoResolved, presetOfRows } from './autoQuality';
import { clampDetailDistance, DETAIL_DISTANCE_MAX, DETAIL_DISTANCE_MIN, DETAIL_DISTANCE_MODERN_DEFAULT, DETAIL_DISTANCE_STEP, detailDistanceKeeper, formatDetailDistance, readDetailDistance } from './detailDistance';
import { GRAPHICS_BACKEND_KEY } from './graphicsBackend';
import { clearGraphicsDemoted, GRAPHICS_DEMOTED_KEY } from './graphicsDemotion';
import { FPS_SHOWN_KEY } from './matchFps';
import { pixelRatioCap } from './matchViewport';
import { readPreference, savePreference } from './startupSettings';

/**
 * **The browser video settings -- a browser adaptation, no original** (CPS-4a, ruling CPS.R7; the owner, Craig,
 * 2026-11-02, in the seat: "Start building out new video settings with sensible defaults in the client itself"). The
 * console drew one 640 x 448 frame on a television (`./renderer` `PS2_FRAME`): no original value stands behind a render
 * scale, a switch for the shadows or a frame-rate readout. Nothing here changes what the game does.
 *
 * - **Render scale** (`renderScale`; Balanced by default): the ceiling of the pixel ratio the native picture draws at
 *   (`renderCapFor`), under which `./matchViewport` `AdaptiveRatio` still trades pixels for frames. Quality is the cap
 *   before CPS-4a exactly (`pixelRatioCap`: the device's ratio, at most 2 on a desktop and 1.5 on a touch device);
 *   Balanced draws at most CSS pixels and at most 1440 px tall (a 4K screen at ratio 1 draws 2560 x 1440); Performance
 *   0.75 of Balanced and at most 1080 px tall. The PS2 picture is untouched: it holds its 640 x 448 frame.
 * - **Shadows** (`shadows`; on by default, as before): a player's switch over the shadows the port draws -- the
 *   characters' render-map shadow (`./charShadow`, which the original casts while its shadows global `DAT_003df138` is
 *   on) and the world's drop-shadow decals (`./world` `WorldView.setShadows`). Off skips their work; the original's
 *   global and every value read for them are not changed.
 * - **Show FPS** (`showFps`; off by default): the START menu's SHOW FPS readout (`./matchFps`, cq41E0VR), kept under its
 *   own key `FPS_SHOWN_KEY` and read through here, so the launcher's row and the START menu's are one setting.
 *
 * Render scale and Shadows are one JSON value under `VIDEO_SETTINGS_KEY`, through the page's one storage door
 * (`./pageStore` `pageSettings`, via `./startupSettings` `readPreference`); read by the launcher's Options
 * (`./console/adapters/options`), the front end's match (`./matchMount`) and the test room (`./main`).
 *
 * Since VS-1 the v1 value is v2's projection (below, `VideoSettingsV2`): the v1 reader and keeper are adapters over the
 * one v2 store, kept for one release while VS-2..VS-6 move their consumers.
 */
export const VIDEO_SETTINGS_ADAPTATION = 'CPS.R7: the browser video settings -- render scale, shadows, show fps; no original' as const;
/** The page key: render scale and shadows, one JSON value (Show FPS stays under `FPS_SHOWN_KEY`). */
export const VIDEO_SETTINGS_KEY = 's2u.viewer.video';

export type RenderScale = 'performance' | 'balanced' | 'quality';
/** The presets, lowest first (the launcher row's Left / Right order). */
export const RENDER_SCALES: readonly RenderScale[] = ['performance', 'balanced', 'quality'];
export const RENDER_SCALE_WORDS: Readonly<Record<RenderScale, string>> = { performance: 'Performance', balanced: 'Balanced', quality: 'Quality' };
/** CPS.R7's default: Balanced. */
export const RENDER_SCALE_DEFAULT_ADAPTATION: RenderScale = 'balanced';
/** Balanced's ratio: at most the CSS pixel (ratio 1). */
export const RENDER_RATIO_BALANCED_ADAPTATION = 1;
/** Balanced's drawing buffer: at most this tall, in device pixels. */
export const RENDER_MAX_HEIGHT_BALANCED_ADAPTATION = 1440;
/** Performance's ratio: this share of Balanced's. */
export const RENDER_SCALE_PERFORMANCE_SHARE_ADAPTATION = 0.75;
/** Performance's drawing buffer: at most this tall. */
export const RENDER_MAX_HEIGHT_PERFORMANCE_ADAPTATION = 1080;
/** The lowest ratio a height cap asks for: the renderer's own clamp (`./renderer` `setPixelRatio`, 0.25). */
export const RENDER_RATIO_MIN_ADAPTATION = 0.25;
/** CPS.R7's default for the shadows: on, what the port drew before. */
export const SHADOWS_DEFAULT_ADAPTATION = true;

/** The v1 settings: what the v1 readers see of v2 (`readVideoSettings`, `videoSettingsKeeper`). */
export interface VideoSettings {
  renderScale: RenderScale;
  shadows: boolean;
  showFps: boolean;
}
export const VIDEO_SETTINGS_DEFAULTS: Readonly<VideoSettings> = { renderScale: RENDER_SCALE_DEFAULT_ADAPTATION, shadows: SHADOWS_DEFAULT_ADAPTATION, showFps: false };

/** A preset's ceiling: the pixel ratio, and the drawing buffer's height it was held to (`Infinity`: none). */
export interface RenderCap { ratioCap: number; maxHeightPx: number }

/**
 * The ratio cap a preset gives a canvas of `cssWidth` x `cssHeight` CSS pixels on a device of ratio `devicePixelRatio`
 * (pure). Quality: `pixelRatioCap`, no height cap. Balanced: min(device, 1), lowered so the buffer is at most 1440 px
 * tall. Performance: 0.75 of that, so at most 1080 px tall. A height cap may go below `AdaptiveRatio`'s floor, to
 * the renderer's 0.25. No device ratio or no height (a page before its layout) reads 1.
 *
 * VS-3: the v1 adapter -- the preset's percent and ceiling (`PRESET_VALUES`) through `renderCapForV2`, which equals the
 * CPS-4a formula exactly at the three presets (`test/videoSettings.test.ts` pins it against a copy of that formula).
 */
export function renderCapFor(preset: RenderScale, devicePixelRatio: number | undefined, touch: boolean, cssWidth: number, cssHeight: number): RenderCap {
  return renderCapForV2(PRESET_VALUES[preset].renderScalePct, PRESET_VALUES[preset].ceiling, devicePixelRatio, touch, cssWidth, cssHeight);
}

/**
 * VS-3 (the video settings plan, product track; the spec §4.2's Render scale and Resolution ceiling rows; a browser
 * adaptation, no original): the ratio cap of a render scale `pct` (50-100) under a resolution `ceiling` (720 / 1080 /
 * 1440 px tall, or 0 = native), pure.
 *
 * - The base: under a height ceiling, Balanced's ratio, min(device, 1) (`RENDER_RATIO_BALANCED_ADAPTATION`); at the
 *   native ceiling, `pixelRatioCap` (the device's ratio, at most 2 on a desktop and 1.5 on a touch device).
 * - The cap: base x pct / 100, then under a height ceiling at most `ceiling / cssHeight` (the buffer at most `ceiling`
 *   device pixels tall) and at least the renderer's 0.25 (`RENDER_RATIO_MIN_ADAPTATION`); at the native ceiling no
 *   height cap (`maxHeightPx` Infinity).
 *
 * So Balanced (100, 1440), Performance (75, 1080) and Quality (100, native) are CPS-4a's three caps exactly. A percent
 * outside 50-100 or not a number is held to the range (not a number: 100). No device ratio or no height reads 1.
 */
export function renderCapForV2(pct: number, ceiling: Ceiling, devicePixelRatio: number | undefined, touch: boolean, _cssWidth: number, cssHeight: number): RenderCap {
  const share = (Number.isFinite(pct) ? Math.min(RENDER_SCALE_PCT_MAX_ADAPTATION, Math.max(RENDER_SCALE_PCT_MIN_ADAPTATION, pct)) : RENDER_SCALE_PCT_MAX_ADAPTATION) / 100;
  if (ceiling === 0) return { ratioCap: pixelRatioCap(devicePixelRatio, touch) * share, maxHeightPx: Number.POSITIVE_INFINITY };
  const ratio = Math.min(devicePixelRatio || 1, RENDER_RATIO_BALANCED_ADAPTATION) * share;
  const height = cssHeight > 0 ? cssHeight : 1;
  return { ratioCap: Math.max(RENDER_RATIO_MIN_ADAPTATION, Math.min(ratio, ceiling / height)), maxHeightPx: ceiling };
}

const isScale = (v: unknown): v is RenderScale => typeof v === 'string' && (RENDER_SCALES as readonly string[]).includes(v);

// ---------------------------------------------------------------------------------------------------------------------
// VS-1: the video settings v2 -- one description of every browser video row, the presets, Automatic and Custom.
// ---------------------------------------------------------------------------------------------------------------------

/**
 * **The video settings v2 -- every row a browser adaptation, no original** (VS-1 of the video settings page, product
 * track; the plan `docs/plans/2026-11-07-video-settings-page.md` VS.R1-R9, the spec
 * `docs/specs/2026-11-07-video-settings-design.md` §4.1-§4.3; the owner, Craig, 2026-11-07, in the seat). The console
 * drew one 640 x 448 frame on a television: no original value stands behind a preset, a render scale, a ceiling, a frame
 * cap, a shadow tier, a filter or a renderer choice. The rows change the cost or the smoothness of the same picture,
 * never what the game does (the spec §7). This task describes and keeps them; what draws each is VS-2..VS-7's.
 *
 * Storage: one JSON value under `VIDEO_SETTINGS_KEY_V2`; SHOW FPS's on / off stays under the START menu's own
 * `FPS_SHOWN_KEY` (the overlay's mode, FPS or the full readout, kept in the JSON); the detail distance is
 * `./detailDistance`'s own key and the renderer `./graphicsBackend`'s, read and written through them, never copied.
 * Nothing saved under the v2 key reads the v1 value migrated, else Automatic. Every write also keeps the v1 value
 * (`VIDEO_SETTINGS_KEY`) as v2's projection, so the v1 readers (the match, the test room, the native rows, the perf
 * line) draw what v2 holds until VS-2..VS-6 move them.
 */
export const VIDEO_SETTINGS_V2_ADAPTATION = 'VS-1: the browser video settings v2 -- Automatic, presets, Custom; every row a browser adaptation, no original' as const;
/** The page key of the v2 value (a browser adaptation, no original). */
export const VIDEO_SETTINGS_KEY_V2 = 's2u.viewer.video2';

export type Preset = 'auto' | 'performance' | 'balanced' | 'quality' | 'custom';
export type Ceiling = 720 | 1080 | 1440 | 0;                 // 0 = native
export type FrameCap = 0 | 30 | 60 | 120;                     // 0 = off
export type Overlay = 'off' | 'fps' | 'full';
export type Shadows = 'off' | 'low' | 'medium' | 'high';
export type Filtering = 'original' | 'anisotropic';
export type Graphics = 'auto' | 'webgl2' | 'webgpu';         // 'xbox' saved by the pick reads as auto + the Xbox class (VS-7)
export type Power = 'default' | 'high-performance' | 'low-power';
export type ColourFilter = 'off' | 'protanopia' | 'deuteranopia' | 'tritanopia';

/**
 * The v2 settings (the plan's `VideoSettings`; named `VideoSettingsV2` while the v1 `VideoSettings` above is still the
 * consumers' -- the tasks that move them, VS-2..VS-6, take the plain name).
 */
export interface VideoSettingsV2 {
  preset: Preset; renderScalePct: number; ceiling: Ceiling; frameCap: FrameCap; overlay: Overlay;
  shadows: Shadows; detailDistance: number; antialias: boolean; filtering: Filtering; graphics: Graphics; power: Power; colourFilter: ColourFilter;
}
/** Every row's value, the preset aside (`PRESET_VALUES`' shape; VS-7's class table is one of these per class). */
export type Rows = Omit<VideoSettingsV2, 'preset'>;
type RowKey = keyof Rows;

/** One row of the description: the surfaces draw from it (the spec §4.1). */
export interface VideoRow {
  key: keyof VideoSettingsV2; kind: 'choice' | 'percent' | 'toggle'; values?: readonly { value: unknown; word: string }[];
  group: 'quality' | 'display' | 'detail' | 'renderer' | 'picture'; surfaces: readonly ('launcher' | 'overlay' | 'native')[];
  apply: 'live' | 'nextMatch'; customOnly: boolean; effect: string;
}

/** Automatic for a browser with nothing saved (VS.R7; a browser adaptation, no original). */
export const VIDEO_PRESET_DEFAULT_ADAPTATION: Preset = 'auto';
/** The render scale's range and step, a percent of the preset's ratio cap (the spec §4.2; a browser adaptation, no original). */
export const RENDER_SCALE_PCT_MIN_ADAPTATION = 50;
export const RENDER_SCALE_PCT_MAX_ADAPTATION = 100;
export const RENDER_SCALE_PCT_STEP_ADAPTATION = 5;
/**
 * The rows no preset owns (a browser adaptation, no original): the performance overlay is an instrument (the spec §7)
 * whose on / off is the START menu's own key, written there outside this keeper -- so it neither makes Custom nor is
 * reset by choosing a preset. Restore defaults still turns it off.
 */
export const PRESET_FREE_ROWS_ADAPTATION: readonly RowKey[] = ['overlay'];

const PRESETS: readonly Preset[] = ['auto', 'performance', 'balanced', 'quality', 'custom'];
const CEILINGS: readonly Ceiling[] = [720, 1080, 1440, 0];
const FRAME_CAPS: readonly FrameCap[] = [0, 30, 60, 120];
const OVERLAYS: readonly Overlay[] = ['off', 'fps', 'full'];
const SHADOW_TIERS: readonly Shadows[] = ['off', 'low', 'medium', 'high'];
const FILTERINGS: readonly Filtering[] = ['original', 'anisotropic'];
const GRAPHICS: readonly Graphics[] = ['auto', 'webgl2', 'webgpu'];
const POWERS: readonly Power[] = ['default', 'high-performance', 'low-power'];
const COLOUR_FILTERS: readonly ColourFilter[] = ['off', 'protanopia', 'deuteranopia', 'tritanopia'];
const PCTS: readonly number[] = Array.from({ length: (RENDER_SCALE_PCT_MAX_ADAPTATION - RENDER_SCALE_PCT_MIN_ADAPTATION) / RENDER_SCALE_PCT_STEP_ADAPTATION + 1 }, (_, i) => RENDER_SCALE_PCT_MIN_ADAPTATION + i * RENDER_SCALE_PCT_STEP_ADAPTATION);
const DETAILS: readonly number[] = Array.from({ length: Math.round((DETAIL_DISTANCE_MAX - DETAIL_DISTANCE_MIN) / DETAIL_DISTANCE_STEP) + 1 }, (_, i) => clampDetailDistance(DETAIL_DISTANCE_MIN + i * DETAIL_DISTANCE_STEP));

const words = <T,>(values: readonly T[], word: (v: T) => string) => values.map((value) => ({ value, word: word(value) }));
const PRESET_WORDS: Readonly<Record<Preset, string>> = { auto: 'Automatic', performance: 'Performance', balanced: 'Balanced', quality: 'Quality', custom: 'Custom' };
const LIVE = ['launcher', 'overlay'] as const;

/**
 * Every browser video row, in the launcher's order (the spec §4.2's table; each a browser adaptation, no original). The
 * rows with no key of the settings -- Fullscreen, the readouts, Copy performance line -- stay their surfaces' own.
 */
export const VIDEO_SCHEMA: readonly VideoRow[] = [
  { key: 'preset', kind: 'choice', values: words(PRESETS, (p) => PRESET_WORDS[p]), group: 'quality', surfaces: LIVE, apply: 'live', customOnly: false,
    effect: 'Automatic picks for this device; Custom appears when any row below differs from the preset. Restore defaults returns to Automatic.' },
  { key: 'renderScalePct', kind: 'percent', values: words(PCTS, (p) => `${p}%`), group: 'display', surfaces: ['launcher', 'overlay', 'native'], apply: 'live', customOnly: false,
    effect: 'A share of the preset\'s pixel ratio: fewer pixels drawn, faster frames, a softer picture.' },
  { key: 'ceiling', kind: 'choice', values: words(CEILINGS, (c) => (c === 0 ? 'Native' : `${c}p`)), group: 'display', surfaces: LIVE, apply: 'live', customOnly: false,
    effect: 'The tallest picture drawn, in device pixels; a larger screen is drawn at this height and stretched.' },
  { key: 'frameCap', kind: 'choice', values: words(FRAME_CAPS, (f) => (f === 0 ? 'Off' : String(f))), group: 'display', surfaces: LIVE, apply: 'live', customOnly: false,
    effect: 'Draws at most this many frames a second; the game steps the same either way. Vsync is the browser\'s and always on.' },
  { key: 'overlay', kind: 'choice', values: words(OVERLAYS, (o) => ({ off: 'Off', fps: 'FPS', full: 'FPS + frame time + ping' })[o]), group: 'display', surfaces: ['launcher', 'overlay', 'native'], apply: 'live', customOnly: false,
    effect: 'A readout of frames a second, and with the full readout the frame time and the ping; SHOW FPS in the START menu.' },
  { key: 'shadows', kind: 'choice', values: words(SHADOW_TIERS, (s) => s[0]!.toUpperCase() + s.slice(1)), group: 'detail', surfaces: ['launcher', 'overlay', 'native'], apply: 'live', customOnly: false,
    effect: 'Your own character\'s shadow and the world\'s drop shadows; Medium is the original\'s, Off the largest saving.' },
  { key: 'detailDistance', kind: 'choice', values: words(DETAILS, formatDetailDistance), group: 'detail', surfaces: LIVE, apply: 'live', customOnly: false,
    effect: 'How far the detail textures reach, times the original\'s; the PS2 picture keeps the original.' },
  { key: 'antialias', kind: 'toggle', values: [{ value: false, word: 'Off' }, { value: true, word: 'On' }], group: 'detail', surfaces: LIVE, apply: 'nextMatch', customOnly: false,
    effect: 'Smooths the edges; fixed when the renderer is made, so it applies when the next match starts.' },
  { key: 'filtering', kind: 'choice', values: words(FILTERINGS, (f) => (f === 'original' ? 'Original' : 'Anisotropic')), group: 'detail', surfaces: LIVE, apply: 'live', customOnly: true,
    effect: 'Sharper textures at a glancing angle under the Modern picture; a look only.' },
  { key: 'graphics', kind: 'choice', values: words(GRAPHICS, (g) => ({ auto: 'Automatic', webgl2: 'WebGL2', webgpu: 'WebGPU' })[g]), group: 'renderer', surfaces: LIVE, apply: 'nextMatch', customOnly: false,
    effect: 'The browser\'s graphics interface: Automatic asks for WebGPU first, and WebGL2 where it is missing or after a WebGPU error; on an Xbox Automatic always draws WebGL2. After a WebGPU error the setting stays on WebGL2; elsewhere, choose Automatic again to bring WebGPU back. Applies when the next match starts.' },
  { key: 'power', kind: 'choice', values: words(POWERS, (p) => ({ default: 'Default', 'high-performance': 'High performance', 'low-power': 'Low power' })[p]), group: 'renderer', surfaces: LIVE, apply: 'nextMatch', customOnly: true,
    effect: 'Which graphics chip a two-chip laptop is asked for; applies when the next match starts.' },
  { key: 'colourFilter', kind: 'choice', values: words(COLOUR_FILTERS, (c) => c[0]!.toUpperCase() + c.slice(1)), group: 'picture', surfaces: LIVE, apply: 'live', customOnly: true,
    effect: 'A colour-blind filter over the whole picture, the HUD included; it hides nothing.' },
];

const COMMON_ROWS = {
  frameCap: 0, overlay: 'off', antialias: true, filtering: 'original', graphics: 'auto', power: 'default', colourFilter: 'off',
  detailDistance: DETAIL_DISTANCE_MODERN_DEFAULT,
} as const;
/**
 * The presets' values (the spec §4.2's defaults; VS.R3: shadows Off on Performance; VS.R5: Medium is today's draw; a
 * browser adaptation, no original). Balanced is today's draw exactly: 100 % of ratio 1, at most 1440 px tall.
 */
export const PRESET_VALUES: Readonly<Record<Exclude<Preset, 'auto' | 'custom'>, Readonly<Rows>>> = {
  performance: { ...COMMON_ROWS, renderScalePct: 75, ceiling: 1080, shadows: 'off' },
  balanced: { ...COMMON_ROWS, renderScalePct: 100, ceiling: 1440, shadows: 'medium' },
  quality: { ...COMMON_ROWS, renderScalePct: 100, ceiling: 0, shadows: 'medium' },
};

/** What Automatic chose: VS-7's (`./autoQuality` `autoResolved`) -- the first-match probe's saved preset, else the device class's start. */
export function resolveAutomatic(): Rows { return autoResolved(); }

const among = <T,>(list: readonly T[]) => (v: unknown): v is T => (list as readonly unknown[]).includes(v);
const isPreset = among(PRESETS);
/** Each row's own range: a value outside it is refused (a set) or falls back to the preset's (a read). */
const VALID: { [K in RowKey]: (v: unknown) => v is Rows[K] } = {
  renderScalePct: among(PCTS) as (v: unknown) => v is number, ceiling: among(CEILINGS), frameCap: among(FRAME_CAPS), overlay: among(OVERLAYS),
  shadows: among(SHADOW_TIERS), detailDistance: (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && clampDetailDistance(v) === v,
  antialias: (v: unknown): v is boolean => typeof v === 'boolean', filtering: among(FILTERINGS), graphics: among(GRAPHICS), power: among(POWERS),
  colourFilter: among(COLOUR_FILTERS),
};
const ROW_KEYS = Object.keys(VALID) as RowKey[];
const PRESET_ROWS = ROW_KEYS.filter((k) => !PRESET_FREE_ROWS_ADAPTATION.includes(k));
/** The rows the v2 JSON holds: the detail distance and the renderer are their own modules' keys, the overlay's on / off the START menu's. */
const JSON_ROWS = ROW_KEYS.filter((k) => k !== 'detailDistance' && k !== 'graphics' && k !== 'overlay');

/** The values a preset stands for: a named preset's, Automatic's resolved ones; Custom falls back to Balanced's. */
const baseOf = (preset: Preset): Rows => (preset === 'auto' || preset === 'custom' ? resolveAutomatic() : { ...PRESET_VALUES[preset] });
const deviates = (v: Rows, preset: Preset): boolean => {
  if (preset === 'custom') return true;
  const base = baseOf(preset);
  return PRESET_ROWS.some((k) => v[k] !== base[k]);
};
/** Custom: chosen, or any row a preset owns differs from `PRESET_VALUES[v.preset]` (Automatic: from its resolved values). */
export function isCustom(v: VideoSettingsV2): boolean { return deviates(v, v.preset); }

/** What is stored: the settings, and the overlay's mode kept while it is off. */
interface Stored { v: VideoSettingsV2; mode: 'fps' | 'full' }

const parseObject = (raw: string | null): Record<string, unknown> | null => {
  if (!raw) return null;
  try { const v: unknown = JSON.parse(raw); return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null; } catch { return null; }
};
const graphicsOf = (saved: string | null): Graphics => (saved === 'webgl2' || saved === 'webgpu' ? saved : 'auto');   // 'xbox': Automatic (VS-7's class)

function readStored(read: (key: string) => string | null): Stored {
  const v2 = parseObject(read(VIDEO_SETTINGS_KEY_V2));
  let preset: Preset, rows: Rows, mode: 'fps' | 'full' = 'fps';
  if (v2) {
    preset = isPreset(v2.preset) ? v2.preset : VIDEO_PRESET_DEFAULT_ADAPTATION;
    if (v2.overlay === 'full') mode = 'full';
    const base = baseOf(preset);
    rows = { ...base };
    if (preset !== 'auto') for (const k of JSON_ROWS) if (VALID[k](v2[k])) (rows as Record<RowKey, unknown>)[k] = v2[k];   // a field out of range: its preset's alone
  } else {
    const v1 = parseObject(read(VIDEO_SETTINGS_KEY));
    if (v1) {
      // The v1 value migrated field by field (VS.R7: a saved choice is kept): its render scale stands for that preset's
      // values (a wrong one reads v1's own default, Balanced, as v1 drew it); its shadows on are Medium (today's draw).
      const scale = isScale(v1.renderScale) ? v1.renderScale : RENDER_SCALE_DEFAULT_ADAPTATION;
      const on = typeof v1.shadows === 'boolean' ? v1.shadows : SHADOWS_DEFAULT_ADAPTATION;
      rows = { ...PRESET_VALUES[scale], shadows: on ? 'medium' : 'off' };
      preset = rows.shadows === PRESET_VALUES[scale].shadows ? scale : 'custom';
    } else {
      preset = VIDEO_PRESET_DEFAULT_ADAPTATION;
      rows = resolveAutomatic();
    }
  }
  rows.detailDistance = readDetailDistance(read);
  // VS-7: under Automatic a saved 'auto' (or the Xbox pick, which reads 'auto') is the class's own renderer row (the Xbox
  // class's WebGL2, never WebGPU); any other saved choice is the player's.
  const savedGraphics = graphicsOf(read(GRAPHICS_BACKEND_KEY));
  rows.graphics = preset === 'auto' && savedGraphics === 'auto' ? rows.graphics : savedGraphics;
  rows.overlay = read(FPS_SHOWN_KEY) === '1' ? mode : 'off';
  return { v: { preset, ...rows }, mode };
}

/** The stored v2 settings: v2, else the v1 value migrated, else Automatic; a field out of range reads its preset's value alone. */
export function readVideoSettingsV2(read: (key: string) => string | null = readPreference): VideoSettingsV2 {
  return readStored(read).v;
}

const serialize = ({ v, mode }: Stored): string => {
  if (v.preset === 'auto') return JSON.stringify({ preset: 'auto', overlay: mode });
  const out: Record<string, unknown> = { preset: v.preset };
  for (const k of JSON_ROWS) out[k] = v[k];
  out.overlay = mode;
  return JSON.stringify(out);
};

/** v2 as v1 reads it: the preset tier its percent and ceiling stand for (VS-3 draws the percent itself), shadows on unless Off. */
const tierOf = (v: Rows): RenderScale => {
  const exact = RENDER_SCALES.find((s) => PRESET_VALUES[s].renderScalePct === v.renderScalePct && PRESET_VALUES[s].ceiling === v.ceiling);
  if (exact) return exact;
  return v.ceiling === 0 ? 'quality' : v.ceiling === RENDER_MAX_HEIGHT_BALANCED_ADAPTATION ? 'balanced' : 'performance';
};
const toV1 = (v: VideoSettingsV2): VideoSettings => ({ renderScale: tierOf(v), shadows: v.shadows !== 'off', showFps: v.overlay !== 'off' });
const sameV1 = (a: VideoSettings, b: VideoSettings): boolean => a.renderScale === b.renderScale && a.shadows === b.shadows && a.showFps === b.showFps;

/** Every keeper of this page hears a change made through any other (the launcher's rows, a match's): v2's audience and v1's. */
const pageHeardV2 = new Set<(v: VideoSettingsV2) => void>();
const pageHeard = new Set<(v: VideoSettings) => void>();
/** True while a page keeper's own change is written: its detail-distance write is then told once, by the commit. */
let pageCommitting = false;
/**
 * The page's detail distance changed through `./detailDistance` itself (today's Detail distance row, the Forge's): v2's
 * audience hears it -- one subscription for the page, made with its first keeper. SHOW FPS toggled in the START menu
 * (`./matchFps`) and the renderer saved by `./graphicsBackend` have no change path to hear; they are read fresh at each `get`.
 */
let pageDetailHeard = false;
const hearPageDetail = (): void => {
  if (pageDetailHeard) return;
  pageDetailHeard = true;
  detailDistanceKeeper().observe(() => {
    if (pageCommitting || pageHeardV2.size === 0) return;
    const v = readStored(readPreference).v;
    for (const f of [...pageHeardV2]) f({ ...v });
  });
};

/**
 * The renderer's key written by a keeper (WG-7 review F1, 2026-11-09; a browser adaptation): the player's choice, so a
 * WebGPU error's demotion reason (`./graphicsDemotion`, whose own write is `saveGraphicsBackend`, never this) is
 * forgotten with it -- a preset, Restore defaults or a row pick that leaves WebGL2 never leaves the reason to label a later
 * WebGL2 pick of the player's own.
 */
function writeGraphicsKey(read: (key: string) => string | null, write: (key: string, value: string) => void, value: string): void {
  write(GRAPHICS_BACKEND_KEY, value);
  if (!read(GRAPHICS_DEMOTED_KEY)) return;
  if (read === readPreference) clearGraphicsDemoted();
  else write(GRAPHICS_DEMOTED_KEY, '');          // a store of its own (a test's): an empty reason reads as none
}

/** The one store under both keepers: read, and a change written to every key it touches and told to both audiences. */
function videoStore(read: (key: string) => string | null, write: (key: string, value: string) => void) {
  const shared = read === readPreference;
  const heardV2 = shared ? pageHeardV2 : new Set<(v: VideoSettingsV2) => void>();
  const heardV1 = shared ? pageHeard : new Set<(v: VideoSettings) => void>();
  const detail = detailDistanceKeeper(read, write);
  // The page's store reads afresh at each `now`, so it reads nothing when made (VS-12: under Automatic a read resolves the
  // device class, whose WebGL probe the front end's start must not make -- the native rows' keeper is built there).
  let cached: Stored | null = shared ? null : readStored(read);
  if (shared) hearPageDetail();   // a store of its own (a test's) has no other writer of its detail key
  const now = (): Stored => (shared || !cached ? readStored(read) : { v: { ...cached.v }, mode: cached.mode });
  // `was`: what the change was made from (VS-7: a cleared Xbox pick changes what `now` reads before the commit).
  const commit = (to: Stored, was: Stored = now()): void => {
    const from = was;
    if (from.mode === to.mode && (Object.keys(to.v) as (keyof VideoSettingsV2)[]).every((k) => from.v[k] === to.v[k])) return;
    cached = { v: { ...to.v }, mode: to.mode };
    const wasV1 = toV1(from.v), is = toV1(to.v);
    const v1Moved = wasV1.renderScale !== is.renderScale || wasV1.shadows !== is.shadows;
    // v2 written whenever v1 is, so a v1 value never stands alone to be migrated over Automatic (VS-7: a class change moves v1 under 'auto')
    if (serialize(from) !== serialize(to) || v1Moved) write(VIDEO_SETTINGS_KEY_V2, serialize(to));
    if (v1Moved) write(VIDEO_SETTINGS_KEY, JSON.stringify({ renderScale: is.renderScale, shadows: is.shadows }));
    if (wasV1.showFps !== is.showFps) write(FPS_SHOWN_KEY, is.showFps ? '1' : '0');   // `./matchFps`'s own words
    if (from.v.detailDistance !== to.v.detailDistance) {                              // its own key and audience; v2's told below, once
      if (shared) pageCommitting = true;
      try { detail.set(to.v.detailDistance); } finally { pageCommitting = false; }
    }
    // The renderer's key holds the player's choice: Automatic's class row is saved as 'auto' (VS-7), and a saved Xbox pick
    // (read as 'auto') is never rewritten to 'auto' unasked -- only `set({ graphics: 'auto' })` clears it.
    const keyOf = (v: VideoSettingsV2): Graphics => (v.preset === 'auto' && v.graphics === resolveAutomatic().graphics ? 'auto' : v.graphics);
    const key = keyOf(to.v);
    if (keyOf(from.v) !== key && !(key === 'auto' && read(GRAPHICS_BACKEND_KEY) === 'xbox')) writeGraphicsKey(read, write, key);
    for (const f of [...heardV2]) f({ ...to.v });
    if (!sameV1(wasV1, is)) for (const f of [...heardV1]) f({ ...is });
  };
  const listen = <T,>(set: Set<(v: T) => void>, f: (v: T) => void): (() => void) => { set.add(f); return () => { set.delete(f); }; };
  return { now, commit, observeV2: (f: (v: VideoSettingsV2) => void) => listen(heardV2, f), observeV1: (f: (v: VideoSettings) => void) => listen(heardV1, f) };
}

/**
 * The page's video settings v2 (the plan's `videoSettingsKeeper`; named `videoSettingsKeeperV2` while the v1 keeper
 * below is still the consumers'): `get`, `set` (a row that deviates flips the preset to Custom; `{ preset }` writes
 * that preset's values; a value outside its row is refused), `restoreDefaults` (Automatic), `observe`, `resolved`.
 */
export function videoSettingsKeeperV2(read: (key: string) => string | null = readPreference, write: (key: string, value: string) => void = savePreference) {
  const store = videoStore(read, write);
  const keeper = {
    get: (): VideoSettingsV2 => store.now().v,
    set(patch: Partial<VideoSettingsV2>): void {
      const from = store.now();
      // VS-7 review F5: under Automatic with no pick saved, Automatic's renderer row asked for is already what it draws (a
      // certain-signal Xbox's WebGL2 included): ignored, so it never makes Custom. A stored other renderer (an old 'webgpu')
      // is not Automatic's: the request then restores Automatic's row (the re-review).
      if (patch.graphics === 'auto' && patch.preset === undefined && from.v.preset === 'auto' && read(GRAPHICS_BACKEND_KEY) !== 'xbox' && from.v.graphics === resolveAutomatic().graphics) { const { graphics: _g, ...rest } = patch; patch = rest; }
      let v: VideoSettingsV2 = { ...from.v };
      // VS-7 (VS-1 review F2, the "Not right?" way out): Automatic's renderer row asked for clears a saved Xbox pick, so the
      // pick's class lets go; the class is read afresh (certain signals still detect the Xbox, VS.R1) and Automatic's rows follow.
      if (patch.graphics === 'auto' && read(GRAPHICS_BACKEND_KEY) === 'xbox') {
        writeGraphicsKey(read, write, 'auto');
        if (v.preset === 'auto') { const base = resolveAutomatic(); for (const k of PRESET_ROWS) (v as Record<RowKey, unknown>)[k] = base[k]; }
      }
      if (isPreset(patch.preset)) {
        if (patch.preset === 'custom') v.preset = 'custom';
        else {
          const base = baseOf(patch.preset);
          v = { ...v, preset: patch.preset };
          for (const k of PRESET_ROWS) (v as Record<RowKey, unknown>)[k] = base[k];
        }
      }
      for (const k of ROW_KEYS) if (k in patch && VALID[k](patch[k])) (v as Record<RowKey, unknown>)[k] = patch[k];
      if (v.preset !== 'custom' && deviates(v, v.preset)) v.preset = 'custom';
      store.commit({ v, mode: v.overlay === 'off' ? from.mode : v.overlay }, from);
    },
    /** Restore defaults: Automatic, the readout off; the first-match probe's result let go (VS-7: the next match probes again). */
    restoreDefaults(): void { const was = store.now(); clearAutoResolved(write); store.commit({ v: { preset: 'auto', ...resolveAutomatic(), overlay: 'off' }, mode: 'fps' }, was); },
    /** Called at each change; the returned function stops it. */
    observe: (f: (v: VideoSettingsV2) => void): (() => void) => store.observeV2(f),
    /** What is drawn: under Automatic what it chose (VS-7: `./autoQuality` `autoResolved`, the read rows), else the settings themselves. */
    resolved: (): VideoSettingsV2 => store.now().v,
  };
  return keeper;
}
export type VideoSettingsKeeperV2 = ReturnType<typeof videoSettingsKeeperV2>;

// ---------------------------------------------------------------------------------------------------------------------
// v1, kept for one release as an adapter over v2 (the match, the test room, the launcher's three rows, the native
// VIDEO rows and the perf line read it until VS-2..VS-6 move them).
// ---------------------------------------------------------------------------------------------------------------------

/** The stored settings as v1 reads them (v2's projection): nothing stored, or garbage, reads the defaults; a wrong field its default alone. */
export function readVideoSettings(read: (key: string) => string | null = readPreference): VideoSettings {
  return toV1(readVideoSettingsV2(read));
}

/** The page's video settings as v1 had them: read, set (stored, heard), the render scale stepped a preset, observed. */
export function videoSettingsKeeper(read: (key: string) => string | null = readPreference, write: (key: string, value: string) => void = savePreference) {
  const store = videoStore(read, write);
  const keeper = {
    get: (): VideoSettings => toV1(store.now().v),
    set(patch: Partial<VideoSettings>): void {
      const from = store.now();
      const v: VideoSettingsV2 = { ...from.v };
      // v1's render scale moves the percent and the ceiling only, its shadows the switch only (on: Medium, or the tier kept).
      if (isScale(patch.renderScale) && patch.renderScale !== tierOf(v)) { v.renderScalePct = PRESET_VALUES[patch.renderScale].renderScalePct; v.ceiling = PRESET_VALUES[patch.renderScale].ceiling; }
      if (typeof patch.shadows === 'boolean') v.shadows = !patch.shadows ? 'off' : v.shadows === 'off' ? 'medium' : v.shadows;
      if (typeof patch.showFps === 'boolean') v.overlay = !patch.showFps ? 'off' : v.overlay === 'off' ? from.mode : v.overlay;
      // The preset kept while it still holds, else the one whose values these are (v1 knew no Custom), else Custom.
      if (deviates(v, v.preset)) v.preset = RENDER_SCALES.find((s) => !deviates(v, s)) ?? 'custom';
      store.commit({ v, mode: v.overlay === 'off' ? from.mode : v.overlay });
    },
    /** The render scale one preset lower (-1) or higher (1), held at the ends. */
    step(d: -1 | 1): void {
      const i = RENDER_SCALES.indexOf(keeper.get().renderScale) + d;
      const to = RENDER_SCALES[Math.max(0, Math.min(RENDER_SCALES.length - 1, i))]!;
      keeper.set({ renderScale: to });
    },
    /** Called at each change of what v1 reads; the returned function stops it. */
    observe: (f: (v: VideoSettings) => void): (() => void) => store.observeV1(f),
  };
  return keeper;
}
export type VideoSettingsKeeper = ReturnType<typeof videoSettingsKeeper>;

/**
 * VS-2 (VS.R8; the video settings plan, product track, a browser adaptation with no original): the native VIDEO OPTIONS
 * screen's three rows (`@s2u/ui` `VideoRowsKeeper`, which does not import the viewer) on the v2 keeper.
 * - **RENDER SCALE**'s three boxes read the preset drawn: a named preset its own; Automatic what it resolved to
 *   (`./autoQuality` `presetOfRows`, else the tier its percent and ceiling stand for -- the Xbox class's 720p start lights
 *   PERFORMANCE); Custom the tier its rows stand for. A press writes `set({ preset })`: it leaves Automatic (or Custom) for
 *   that preset, its values written, shadows included (VS-1 (d)), and never makes Custom.
 * - **SHADOWS** Off is `'off'`; On restores the preset's tier (Automatic's resolved one; Medium where the preset's own is
 *   Off, as Performance's is, or under Custom) and keeps a tier already on.
 * - **SHOW FPS** is the performance overlay: Off, or FPS (a full readout already on is kept).
 */
export function videoRowsKeeperV2(keeper: VideoSettingsKeeperV2 = videoSettingsKeeperV2()): VideoRowsKeeper {
  const drawnPreset = (v: VideoSettingsV2): RenderScale => (v.preset === 'auto' ? presetOfRows(v) ?? tierOf(v) : v.preset === 'custom' ? tierOf(v) : v.preset);
  const tierFor = (v: VideoSettingsV2): Shadows => {
    const own = v.preset === 'auto' ? resolveAutomatic().shadows : v.preset === 'custom' ? 'off' : PRESET_VALUES[v.preset].shadows;
    return own === 'off' ? 'medium' : own;
  };
  return {
    get: (): VideoRowsSettings => { const v = keeper.get(); return { renderScale: drawnPreset(v), shadows: v.shadows !== 'off', showFps: v.overlay !== 'off' }; },
    set(patch: Partial<VideoRowsSettings>): void {
      if (isScale(patch.renderScale)) keeper.set({ preset: patch.renderScale });
      if (typeof patch.shadows === 'boolean') {
        const v = keeper.get();
        if (!patch.shadows) keeper.set({ shadows: 'off' });
        else if (v.shadows === 'off') keeper.set({ shadows: tierFor(v) });
      }
      if (typeof patch.showFps === 'boolean') {
        const v = keeper.get();
        if (!patch.showFps) keeper.set({ overlay: 'off' });
        else if (v.overlay === 'off') keeper.set({ overlay: 'fps' });
      }
    },
  };
}

/**
 * CPS-4b (CPS.R7 (c), a browser adaptation): the front end's dialog lookup with VIDEO OPTIONS' RENDER SCALE, SHADOWS and
 * SHOW FPS rows on the page's keeper, and HELP WINDOWS hidden (`@s2u/ui` `videoSettingsLookup`). The keeper is the
 * page's shared one, so a row's step is heard at once by every keeper of the page (the match's, the launcher's rows).
 * VS-2: the rows are the v2 keeper's, through `videoRowsKeeperV2` (VS.R8).
 */
export function videoSettingsDialogLookup(lookup: (name: string) => DialogDesign | null, keeper: VideoRowsKeeper = videoRowsKeeperV2()): (name: string) => DialogDesign | null {
  return videoSettingsLookup(lookup, keeper);
}
