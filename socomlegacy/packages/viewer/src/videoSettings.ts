import { videoSettingsLookup, type DialogDesign } from '@s2u/ui';
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
 * tall. Performance: 0.75 of that, so at most 1080 px tall. A height cap may go below `AdaptiveRatio`'s floor (0.75), to
 * the renderer's 0.25. No device ratio or no height (a page before its layout) reads 1.
 */
export function renderCapFor(preset: RenderScale, devicePixelRatio: number | undefined, touch: boolean, _cssWidth: number, cssHeight: number): RenderCap {
  if (preset === 'quality') return { ratioCap: pixelRatioCap(devicePixelRatio, touch), maxHeightPx: Number.POSITIVE_INFINITY };
  const performance = preset === 'performance';
  const maxHeightPx = performance ? RENDER_MAX_HEIGHT_PERFORMANCE_ADAPTATION : RENDER_MAX_HEIGHT_BALANCED_ADAPTATION;
  const device = Math.min(devicePixelRatio || 1, RENDER_RATIO_BALANCED_ADAPTATION) * (performance ? RENDER_SCALE_PERFORMANCE_SHARE_ADAPTATION : 1);
  const height = cssHeight > 0 ? cssHeight : 1;
  return { ratioCap: Math.max(RENDER_RATIO_MIN_ADAPTATION, Math.min(device, maxHeightPx / height)), maxHeightPx };
}

const isScale = (v: unknown): v is RenderScale => typeof v === 'string' && (RENDER_SCALES as readonly string[]).includes(v);

/** The stored settings: nothing stored, or garbage, reads the defaults; a field that is wrong reads its own default. */
export function readVideoSettings(read: (key: string) => string | null = readPreference): VideoSettings {
  let stored: { renderScale?: unknown; shadows?: unknown } = {};
  const raw = read(VIDEO_SETTINGS_KEY);
  if (raw) { try { const v: unknown = JSON.parse(raw); if (v && typeof v === 'object') stored = v as typeof stored; } catch { /* the defaults */ } }
  return {
    renderScale: isScale(stored.renderScale) ? stored.renderScale : VIDEO_SETTINGS_DEFAULTS.renderScale,
    shadows: typeof stored.shadows === 'boolean' ? stored.shadows : VIDEO_SETTINGS_DEFAULTS.shadows,
    showFps: read(FPS_SHOWN_KEY) === '1',
  };
}

/** Every keeper of this page hears a change made through any other (the launcher's rows, a match's). */
const pageHeard = new Set<(v: VideoSettings) => void>();

/** The page's video settings: read, set (stored, heard), the render scale stepped a preset, observed. */
export function videoSettingsKeeper(read: (key: string) => string | null = readPreference, write: (key: string, value: string) => void = savePreference) {
  const heard = new Set<(v: VideoSettings) => void>();
  const shared = read === readPreference;
  let value = readVideoSettings(read);
  const keeper = {
    get: (): VideoSettings => (shared ? readVideoSettings(read) : { ...value }),
    set(patch: Partial<VideoSettings>): void {
      const from = keeper.get();
      const to: VideoSettings = {
        renderScale: isScale(patch.renderScale) ? patch.renderScale : from.renderScale,
        shadows: typeof patch.shadows === 'boolean' ? patch.shadows : from.shadows,
        showFps: typeof patch.showFps === 'boolean' ? patch.showFps : from.showFps,
      };
      if (to.renderScale === from.renderScale && to.shadows === from.shadows && to.showFps === from.showFps) return;
      value = to;
      if (to.renderScale !== from.renderScale || to.shadows !== from.shadows) write(VIDEO_SETTINGS_KEY, JSON.stringify({ renderScale: to.renderScale, shadows: to.shadows }));
      if (to.showFps !== from.showFps) write(FPS_SHOWN_KEY, to.showFps ? '1' : '0');   // `./matchFps`'s own words
      for (const f of [...(shared ? pageHeard : heard)]) f({ ...to });
    },
    /** The render scale one preset lower (-1) or higher (1), held at the ends. */
    step(d: -1 | 1): void {
      const i = RENDER_SCALES.indexOf(keeper.get().renderScale) + d;
      const to = RENDER_SCALES[Math.max(0, Math.min(RENDER_SCALES.length - 1, i))]!;
      keeper.set({ renderScale: to });
    },
    /** Called at each change; the returned function stops it. */
    observe(f: (v: VideoSettings) => void): () => void {
      const set = shared ? pageHeard : heard;
      set.add(f);
      return () => { set.delete(f); };
    },
  };
  return keeper;
}
export type VideoSettingsKeeper = ReturnType<typeof videoSettingsKeeper>;

/**
 * CPS-4b (CPS.R7 (c), a browser adaptation): the front end's dialog lookup with VIDEO OPTIONS' RENDER SCALE, SHADOWS and
 * SHOW FPS rows on the page's keeper, and HELP WINDOWS hidden (`@s2u/ui` `videoSettingsLookup`). The keeper is the
 * page's shared one, so a row's step is heard at once by every keeper of the page (the match's, the launcher's rows).
 */
export function videoSettingsDialogLookup(lookup: (name: string) => DialogDesign | null, keeper: VideoSettingsKeeper = videoSettingsKeeper()): (name: string) => DialogDesign | null {
  return videoSettingsLookup(lookup, keeper);
}
