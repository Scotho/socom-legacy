import { readPreference, savePreference } from './startupSettings';
import { isSoftwareRenderer, softwareRendererOf } from './softwareRenderer';

/**
 * **GLOW-STEPDOWN -- a browser adaptation, no original** (product track; `GLOW_TARGET_SCALE_ADAPTATION`). The console
 * glowed one 640 x 448 frame (`./renderer`, the PS2 picture, untouched here); the native picture draws the world into a
 * glow target the size of the drawing buffer while a flashbang's glow runs (`./glowTarget` `GlowFrame`). On a no-GPU
 * client that is the glow's sustained cost: SwiftShader on 2 vCPU drew a glow frame at 1.25-1.65x a plain one for ~10 s,
 * and the target at half the buffer each way put it at or below the plain frame (glow-window mean 284 vs 448 ms;
 * `agent-mail/evidence/flash-lag-2026-11-08/REVIEW-GLOW-BODIES-1.md`, the ladder, 2026-11-08). So, per flash, at the
 * target's acquisition, `glowScale` decides the target's scale:
 *
 * 1. the address switch `?glowscale=half|full|auto` (tests and probes): half or full is the answer -- first, as the
 *    graphics backend's `?renderer=` is (`./graphicsBackend`), so a probe or a tester can force either on any page;
 * 2. else the browser setting `GLOW_SCALE_KEY` (`'auto' | 'full' | 'half'`, Automatic by default): Full or Half is the answer;
 * 3. else Automatic: half when the adapter is software (`softwareAdapterOf`) or the page's last
 *    `GLOW_FRAME_WINDOW_ADAPTATION` frames are slow (`slowFrames`: their median over the larger of
 *    `GLOW_SLOW_FRAME_MS_ADAPTATION` and `GLOW_FLOOR_SHARE_ADAPTATION` x the page's own floor; `./frameSampler`), else full.
 *
 * What half costs the look, said plainly: for the flash's glow (~10 s at level 3) the WHOLE WORLD is drawn at a quarter
 * of the pixels (half each way) and stretched back to the canvas with linear filtering, so it is visibly softer for that
 * time; and the blur's half-size buffer is half of that target (`./flash` `glowHalfSize`), so its spread in screen terms
 * doubles. The full path -- every page the policy leaves at full -- is unchanged. The target keeps the main pass's
 * attachments (three r186's render context holds no size), so it is drawn with the pipelines the 1 x 1 twin compiled.
 * Nothing of the game's behaviour changes: the glow's passes, FIX and timing are `./flash`'s. A row on the video settings
 * page is owed (LATER 771); the setting is read and stored here meanwhile.
 */
export const GLOW_TARGET_SCALE_ADAPTATION = 'GLOW-STEPDOWN: the native glow target at half the drawing buffer on a weak GPU; no original' as const;
/** The page key: the player's choice, `auto`, `full` or `half` (one word). */
export const GLOW_SCALE_KEY = 's2u.viewer.glowScale';
/** The step-down's scale, each way (the ladder's "half"). */
export const GLOW_SCALE_HALF_ADAPTATION = 0.5;
/** A recent median frame longer than this, ms, is a slow page at the least (the brief's 25 ms: under 40 fps). */
export const GLOW_SLOW_FRAME_MS_ADAPTATION = 25;
/** How many of the page's last frames the median reads (about two seconds at 60 Hz). */
export const GLOW_FRAME_WINDOW_ADAPTATION = 120;
/** The bound's share of the page's floor (the review's F1: a 30 Hz-capped page's 33.3 ms floor bounds it at 50 ms). */
export const GLOW_FLOOR_SHARE_ADAPTATION = 1.5;
/**
 * The longest floor read as a frame cap, ms: a 30 Hz cap (33.3 ms -- iOS Low Power Mode, Chromium's battery saver, a
 * page's own cap) with its jitter. A floor above it is not a cap the page can be held to: the GPU is merely slow, and the
 * bound stays `GLOW_SLOW_FRAME_MS_ADAPTATION` (else a sustained 40 ms would bound itself at 60 and never read slow).
 * When the page's own frame cap lands (a0's lane) it passes its cap to the policy (LATER 771).
 */
export const GLOW_CAP_FLOOR_MS_ADAPTATION = 34.5;

export type GlowScaleSetting = 'auto' | 'full' | 'half';

const isSetting = (v: unknown): v is GlowScaleSetting => v === 'auto' || v === 'full' || v === 'half';

/** The stored choice; nothing stored or another word reads Automatic. */
export function readGlowScale(read: (key: string) => string | null = readPreference): GlowScaleSetting {
  const v = read(GLOW_SCALE_KEY);
  return isSetting(v) ? v : 'auto';
}

export function saveGlowScale(value: GlowScaleSetting, write: (key: string, value: string) => void = savePreference): void {
  write(GLOW_SCALE_KEY, value);
}

/** The address switch `?glowscale=`; null when absent or not one of the three words. */
export function glowScaleOverride(search = globalThis.location?.search ?? ''): GlowScaleSetting | null {
  const v = new URLSearchParams(search).get('glowscale');
  return isSetting(v) ? v : null;
}

export interface GlowScaleInputs {
  setting: GlowScaleSetting;
  override: GlowScaleSetting | null;
  softwareAdapter: boolean;
  /** The page's recent frame intervals, ms (`FrameSampler.recent`); null or empty before any. */
  recentFrames: readonly number[] | null;
}

export interface GlowScaleDecision { scale: 1 | 0.5; reason: string }

/**
 * The review's F1 and F2 (pure): the frames' median, ms, when it is over the larger of `GLOW_SLOW_FRAME_MS_ADAPTATION`
 * and `GLOW_FLOOR_SHARE_ADAPTATION` x the floor -- the window's shortest interval, counted only up to
 * `GLOW_CAP_FLOOR_MS_ADAPTATION` (a cap) -- else null. The median, so one stall (a load's first frames, a spawn's
 * compile hitch) in the window moves nothing; the floor, so a page held to 30 Hz is not read as slow.
 */
export function slowFrames(frames: readonly number[] | null): number | null {
  if (!frames || frames.length === 0) return null;
  const sorted = [...frames].sort((a, b) => a - b);
  const median = sorted[Math.floor((sorted.length - 1) / 2)]!;
  const floor = sorted[0]!;
  const cap = floor <= GLOW_CAP_FLOOR_MS_ADAPTATION ? floor : 0;
  return median > Math.max(GLOW_SLOW_FRAME_MS_ADAPTATION, GLOW_FLOOR_SHARE_ADAPTATION * cap) ? median : null;
}

/** The policy (pure): the address, then the setting, then the adapter and the frames. */
export function glowScale(i: GlowScaleInputs): GlowScaleDecision {
  const of = (s: 'full' | 'half', reason: string): GlowScaleDecision => ({ scale: s === 'half' ? GLOW_SCALE_HALF_ADAPTATION : 1, reason });
  if (i.override !== null && i.override !== 'auto') return of(i.override, 'address');
  if (i.setting !== 'auto') return of(i.setting, 'setting');
  if (i.softwareAdapter) return of('half', 'software adapter');
  const slow = slowFrames(i.recentFrames);
  if (slow !== null) return of('half', `slow frames ${Math.round(slow)} ms`);
  return of('full', 'auto');
}

/** The decision's debug line, said once a flash. */
export function glowScaleLine(d: GlowScaleDecision): string {
  return `glow target: ${d.scale === 1 ? 'full' : 'half'} (${d.reason})`;
}

/** The shape of three's backend this reads: WebGL2's context, WebGPU's device. */
export interface AdapterBackend {
  isWebGPUBackend?: boolean;
  isWebGLBackend?: boolean;
  gl?: unknown;
  device?: { adapterInfo?: { isFallbackAdapter?: unknown; vendor?: unknown; architecture?: unknown; device?: unknown; description?: unknown } | null } | null;
}

/**
 * Whether the page's renderer draws on a software adapter. WebGL2: the context's unmasked renderer string
 * (`./softwareRenderer`'s reader and its list: SwiftShader, llvmpipe, softpipe, Microsoft Basic Render Driver, the
 * Software Adapter, Mesa OffScreen). WebGPU: three r186 keeps no adapter, so the device's `adapterInfo` --
 * `isFallbackAdapter`, or its vendor, architecture, device or description naming a software rasteriser. Read once,
 * after the renderer's `init`; anything it cannot read is not software.
 */
export function softwareAdapterOf(backend: AdapterBackend | null | undefined): boolean {
  if (!backend) return false;
  if (backend.isWebGPUBackend === true) {
    const info = backend.device?.adapterInfo;
    if (!info) return false;
    if (info.isFallbackAdapter === true) return true;
    return [info.vendor, info.architecture, info.device, info.description].some((s) => typeof s === 'string' && isSoftwareRenderer(s));
  }
  const gl = backend.gl as WebGL2RenderingContext | undefined;
  if (!gl || typeof (gl as { getParameter?: unknown }).getParameter !== 'function') return false;
  return isSoftwareRenderer(softwareRendererOf(gl));
}
