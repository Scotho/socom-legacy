import { pageDeviceClass, pageRendererProbe, XBOX_GRAPHICS_ADAPTATION, type DeviceClass } from './deviceClass';
import { ADAPTIVE_V2_ADAPTATION, type AdaptiveOptions } from './matchViewport';
import { readPreference, savePreference } from './startupSettings';
import { PRESET_VALUES, type Preset, type Rows } from './videoSettings';

/**
 * VS-7 (the video settings plan, product track, VS.R1 and VS.R7; the spec
 * `docs/specs/2026-11-07-video-settings-design.md` §4.4 items 2, 3 and 5): what Automatic draws -- the device class's
 * start (`./deviceClass`), moved once by the first match's probe, saved. **A browser adaptation, every value and table
 * here**: the console drew one 640 x 448 frame at a fixed rate, so no original value stands behind a start, a probe's
 * length or its two edges; none changes what the game does (the rows change the cost of the same picture, the spec §7).
 *
 * The Xbox class's refusals (§4.4 item 5): the lobby prepare stays off (`./lobbyPrepare`); **the HD packs' refusal
 * ("not on Xbox: the browser's 1 GB") is owed to the lane merge after #729**, whose `hdTexturePack*.ts` are not in this tree.
 */

/** The presets in their order, for the probe's one step down or up. */
const LADDER = ['performance', 'balanced', 'quality'] as const;
type Named = typeof LADDER[number];

/**
 * Each class's start (the spec §4.4 item 2; a browser adaptation). Getters, so the table reads `./videoSettings`'
 * presets when asked (the two modules import each other) and no caller can change a preset through it.
 */
export const CLASS_START_ADAPTATION: Readonly<Record<DeviceClass, Readonly<Rows>>> = Object.freeze({
  /**
   * The Xbox preset's set: WebGL2, no edge smoothing, 720p at 75 %, no shadows (CPS's 1.9 ms lever), at most 60 drawn.
   * F2 (the S1/S2 review, gmxbox1c): its backend is `./deviceClass` `XBOX_GRAPHICS_ADAPTATION`, the one `classGraphics` gives.
   */
  get xbox(): Rows { return { ...PRESET_VALUES.performance, graphics: XBOX_GRAPHICS_ADAPTATION, antialias: false, ceiling: 720, renderScalePct: 75, shadows: 'off', frameCap: 60 }; },
  get software(): Rows { return { ...PRESET_VALUES.performance, shadows: 'off', ceiling: 720 }; },
  /** Balanced: at most ratio 1, as a Balanced touch browser draws today (Quality's 1.5 touch cap is one step up). */
  get touch(): Rows { return { ...PRESET_VALUES.balanced, shadows: 'medium' }; },
  get lowMemory(): Rows { return { ...PRESET_VALUES.performance }; },
  get standard(): Rows { return { ...PRESET_VALUES.balanced }; },
  get high(): Rows { return { ...PRESET_VALUES.quality }; },
});

/** The dynamic scale's floor under Automatic, a share of the cap, per class (a browser adaptation; one table for VS-9's cells). */
export const AUTO_FLOOR_SHARE_ADAPTATION: Readonly<Record<DeviceClass, number>> = Object.freeze({
  xbox: 0.5, software: 0.5, touch: 0.5, lowMemory: 0.5, standard: 0.5, high: 0.5,
});

/** The probe's length, seconds of drawn frames (a browser adaptation). */
export const PROBE_SECONDS_ADAPTATION = 3;
/** Above this mean frame time, ms, the start drops one preset (a browser adaptation). */
export const PROBE_DOWN_MS_ADAPTATION = 20;
/** Under this mean frame time, ms, at full scale throughout, the start rises one preset (a browser adaptation). */
export const PROBE_UP_MS_ADAPTATION = 10;
/**
 * A frame longer than this, ms, is a stall -- a hidden tab's return, a long collection, a map's arrival -- not the page's
 * rate: it restarts the probe's window and is not counted (a browser adaptation; VS-7 review F1).
 */
export const PROBE_FRAME_MAX_MS_ADAPTATION = 100;
/** The classes the probe runs for: the others' starts are already their floor or their bar. */
export const PROBED_CLASSES_ADAPTATION: readonly DeviceClass[] = ['standard', 'high'];
/** The page key of the probe's result (a browser adaptation): `{ deviceClass, renderer, preset }`, '' once cleared. */
export const VIDEO_AUTO_KEY = 's2u.viewer.videoAuto';

/** The saved result: the preset the probe chose, for the class and the renderer string it ran on. */
interface AutoSaved { deviceClass: DeviceClass; renderer: string | null; preset: Named }

const isNamed = (v: unknown): v is Named => (LADDER as readonly unknown[]).includes(v);
function readSaved(read: (key: string) => string | null): AutoSaved | null {
  const raw = read(VIDEO_AUTO_KEY);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<AutoSaved> | null;
    if (!v || typeof v !== 'object' || !isNamed(v.preset) || typeof v.deviceClass !== 'string') return null;
    return { deviceClass: v.deviceClass as DeviceClass, renderer: typeof v.renderer === 'string' ? v.renderer : null, preset: v.preset };
  } catch { return null; }
}
/** The saved result when it was made on this class and this renderer string (a renderer change runs the probe again). */
function savedFor(cls: DeviceClass, renderer: string | null, read: (key: string) => string | null): AutoSaved | null {
  const s = readSaved(read);
  return s && s.deviceClass === cls && s.renderer === renderer ? s : null;
}

/** What Automatic draws: the probe's saved preset for this class and renderer, else the class's start. */
export function autoResolved(cls: DeviceClass = pageDeviceClass(), read: (key: string) => string | null = readPreference, renderer: string | null = pageRendererProbe().renderer): Rows {
  const s = PROBED_CLASSES_ADAPTATION.includes(cls) ? savedFor(cls, renderer, read) : null;
  return s ? { ...PRESET_VALUES[s.preset] } : { ...CLASS_START_ADAPTATION[cls] };
}

/**
 * VS-10 F2 (a browser adaptation): how many times this page's Restore defaults let the probe's result go. A probe made
 * before a clear never saves after it (its window began under the settings the player has just reset).
 */
let autoClears = 0;

/** Restore defaults: the probe's result let go, so the next match probes again. */
export function clearAutoResolved(write: (key: string, value: string) => void = savePreference): void {
  autoClears++;
  write(VIDEO_AUTO_KEY, '');
}

/** The preset a set of rows stands for on the rows a preset owns (the overlay aside), else null (a class's own start). */
export function presetOfRows(rows: Rows): Named | null {
  const keys = (Object.keys(PRESET_VALUES.balanced) as (keyof Rows)[]).filter((k) => k !== 'overlay');
  return LADDER.find((p) => keys.every((k) => PRESET_VALUES[p][k] === rows[k])) ?? null;
}

/**
 * The first-match probe (the spec §4.4 item 3): fed each drawn frame's real ms once the match's first world frame is drawn
 * (`./matchMount`'s frame loop: after `firstDrawn`, whose gate waits for the scene's compile, `warmEffects`); the first fed
 * frame is skipped (the frame after the loading hold). A stall (`PROBE_FRAME_MAX_MS_ADAPTATION`) or the page hidden
 * restarts the window (review F1). After `PROBE_SECONDS_ADAPTATION` of counted frames their median decides: above
 * `PROBE_DOWN_MS_ADAPTATION` the class's start one preset down, under `PROBE_UP_MS_ADAPTATION` with every frame at full
 * scale one up (held at the ends), else the start itself. The result is saved once; a match that ends sooner saves nothing (the spec's Review focus 4: the next match's
 * probe starts over). VS-10 F2: the probe stops for good, saving nothing, once Automatic is left (`still`, the page's
 * preset read at each frame and again right before the save) or Restore defaults clears the result (`clearAutoResolved`)
 * inside its window -- frames drawn under other settings, or a window the player reset, never decide.
 */
export class FirstMatchProbe {
  private skipped = false;
  private sumMs = 0;
  private samples: number[] = [];
  private full = true;
  private result: Rows | null = null;
  private unwatch: (() => void) | null = null;
  /** VS-10 F2: stopped for good (Automatic left, or a Restore defaults inside the window): no frame counted, nothing saved. */
  private stopped = false;
  /** VS-10 F2: the page's Restore-defaults count when the probe was made. */
  private readonly clears = autoClears;
  constructor(readonly deviceClass: DeviceClass, private readonly renderer: string | null, private readonly write: (key: string, value: string) => void, doc?: ProbeDocument | null, private readonly still: () => boolean = () => true) {
    if (doc) {
      const hidden = (): void => { if (doc.visibilityState === 'hidden') this.restart(); };
      doc.addEventListener('visibilitychange', hidden);
      this.unwatch = () => { doc.removeEventListener('visibilitychange', hidden); };
    }
  }

  /** Done: the result saved (the probe takes no more frames). */
  done(): boolean { return this.result !== null; }

  /** The window started over: nothing counted yet. */
  restart(): void { this.sumMs = 0; this.samples = []; this.full = true; }

  /** The page's listener let go (the match's teardown, or the result saved). */
  dispose(): void { this.unwatch?.(); this.unwatch = null; }

  /** VS-10 F2: Automatic still chosen and no Restore defaults since the probe was made; once false, stopped for good. */
  private live(): boolean {
    if (!this.stopped && (this.clears !== autoClears || !this.still())) { this.stopped = true; this.dispose(); }
    return !this.stopped;
  }

  /** One drawn frame's real ms and whether the ratio stood at its cap; the resolved rows on the frame that completes it, else null. */
  frame(ms: number, fullScale: boolean): Rows | null {
    if (this.result || !this.live() || !(ms > 0) || !Number.isFinite(ms)) return null;
    if (!this.skipped) { this.skipped = true; return null; }
    if (ms > PROBE_FRAME_MAX_MS_ADAPTATION) { this.restart(); return null; }
    this.sumMs += ms;
    this.samples.push(ms);
    if (!fullScale) this.full = false;
    if (this.sumMs < PROBE_SECONDS_ADAPTATION * 1000) return null;
    const sorted = [...this.samples].sort((a, b) => a - b), mid = sorted.length >> 1;
    const median = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
    const start = presetOfRows(CLASS_START_ADAPTATION[this.deviceClass]) ?? 'balanced';
    const move = median > PROBE_DOWN_MS_ADAPTATION ? -1 : median < PROBE_UP_MS_ADAPTATION && this.full ? 1 : 0;
    const preset = LADDER[Math.max(0, Math.min(LADDER.length - 1, LADDER.indexOf(start) + move))]!;
    const saved: AutoSaved = { deviceClass: this.deviceClass, renderer: this.renderer, preset };
    if (!this.live()) return null;                                   // VS-10 F2: the preset re-read right before the save
    this.write(VIDEO_AUTO_KEY, JSON.stringify(saved));
    this.result = { ...PRESET_VALUES[preset] };
    this.dispose();
    return { ...this.result };
  }
}

/**
 * The match's probe, or null: only under Automatic, only for the probed classes, and only while no result is saved for
 * this class and renderer (it runs once until Restore defaults or a renderer change).
 */
/** What the probe listens on for the page hidden (the page's document by default). */
export type ProbeDocument = Pick<EventTarget, 'addEventListener' | 'removeEventListener'> & { readonly visibilityState: DocumentVisibilityState };

export function firstMatchProbe(preset: Preset, cls: DeviceClass = pageDeviceClass(), o: { read?: (key: string) => string | null; write?: (key: string, value: string) => void; renderer?: string | null; doc?: ProbeDocument | null; still?: () => boolean } = {}): FirstMatchProbe | null {
  if (preset !== 'auto' || !PROBED_CLASSES_ADAPTATION.includes(cls)) return null;
  const renderer = 'renderer' in o ? o.renderer ?? null : pageRendererProbe().renderer;
  if (savedFor(cls, renderer, o.read ?? readPreference)) return null;
  return new FirstMatchProbe(cls, renderer, o.write ?? savePreference, 'doc' in o ? o.doc : (globalThis.document ?? null), o.still);
}

/** The dynamic scale's options for a mount: under Automatic the class's floor (`AUTO_FLOOR_SHARE_ADAPTATION`), else VS-3's. */
export function autoAdaptiveOptions(preset: Preset, cls: DeviceClass = pageDeviceClass()): Readonly<AdaptiveOptions> {
  return preset === 'auto' ? { ...ADAPTIVE_V2_ADAPTATION, floorShare: AUTO_FLOOR_SHARE_ADAPTATION[cls] } : ADAPTIVE_V2_ADAPTATION;
}
