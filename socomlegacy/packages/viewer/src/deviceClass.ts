import { readGraphicsBackend, type GraphicsBackendPreference } from './graphicsBackend';
import { pageSoftwareProbe, resetPageSoftwareProbeForTest, type SoftwareProbe } from './softwareRenderer';
import { wantsTouchControls } from './touch';

/**
 * VS-7 (the video settings plan, product track; the spec `docs/specs/2026-11-07-video-settings-design.md` §4.4 item 1):
 * the device class Automatic starts from. **A browser adaptation, every value and table here**: the console had one
 * device, so no original value stands behind a class, a signal or a threshold; none changes what the game does -- the
 * class picks only how the same picture is drawn (`./autoQuality`'s start rows).
 *
 * - **xbox**: the saved "Request Game Files (XBOX)" pick (`./graphicsBackend` `selectXboxGraphics`), or -- **VS.R1**
 *   (2026-11-07, the owner's word: "when certain") -- the user agent's `/\bXbox\b/` token **and** a Direct3D11 WebGL
 *   renderer string, both (the Series X reads ANGLE D3D11). The token with a string that is not D3D11, or D3D11 alone,
 *   is not an Xbox (and since XBOX-TOKEN-NOSTRING, below, the token with no string at all is one).
 *   **XBOX-SRAKMD** (2026-11-10; VS.R1 widened, the owner's word chosen in the main controller's seat: "Treat the
 *   Xbox kernel driver name in the GPU string as a certain Xbox signal; every Xbox defaults to WebGL2 again as v0.4.18
 *   intended."):
 *   or the renderer string naming the console's own graphics driver (`XBOX_DRIVER_TOKEN_ADAPTATION`), on its own. b0's
 *   read of central's client_errors: v0.4.18 pages whose renderer string read "ANGLE (Microsoft, SraKmd_arden ...
 *   Direct3D11 ...)" drew WebGPU on Automatic and lost the device, so their agent carried no `Xbox` token and the
 *   two-signal bar missed them.
 *   **XBOX-TOKEN-NOSTRING** (2026-11-11; VS.R1 read by the main controller under the owner's delegated authority: a
 *   fresh review of the release's renderer slice found an Xbox page whose WebGL probe names no renderer -- a refused
 *   context, a masked debug name -- left off the class, so Automatic asked WebGPU): the agent's token with NO renderer
 *   string is an Xbox too. No string contradicts nothing; a string that is not Direct3D11 still does (the token alone
 *   with a Metal renderer is not an Xbox).
 * - **software**: the WebGL probe's renderer string names a software rasteriser (`./softwareRenderer`).
 * - **touch**: `./touch` `wantsTouchControls`.
 * - **lowMemory**: `navigator.deviceMemory` known and under `LOW_MEMORY_GB_ADAPTATION`.
 * - **high**: the renderer string names a discrete desktop part (`DISCRETE_GPU_HINTS_ADAPTATION`) and the device memory is
 *   at least `HIGH_MEMORY_GB_ADAPTATION`.
 * - **standard**: everything else.
 */
export type DeviceClass = 'xbox' | 'software' | 'touch' | 'lowMemory' | 'standard' | 'high';

/** What the class is read from. */
export interface DeviceSignals {
  userAgent: string;
  /** The WebGL probe's renderer string; null when none was named. */
  renderer: string | null;
  /** The renderer string names a software rasteriser. */
  software: boolean;
  touch: boolean;
  /** `navigator.deviceMemory`, GB; absent when the browser does not say. */
  deviceMemory?: number;
  /** The Xbox pick saved on this browser (or `?renderer=xbox`). */
  xboxPick: boolean;
}

/** VS.R1's user-agent token (a browser adaptation): Microsoft's console string carries "Xbox; Xbox One"; no PC, Mac or phone browser does. */
export const XBOX_AGENT_TOKEN_ADAPTATION = /\bXbox\b/;
/** VS.R1's renderer signal (a browser adaptation): the console's Edge draws WebGL through ANGLE's Direct3D11 back end. */
export const XBOX_RENDERER_TOKEN_ADAPTATION = /Direct3D11/i;
/**
 * XBOX-SRAKMD's driver signal (a browser adaptation): the console's kernel graphics driver as ANGLE names it ("SraKmd_arden",
 * the Series X's GPU, seen on central's beacons; the Series S's under the same driver name is assumed, not seen). A word
 * with its underscore: no PC, Mac or phone part is named so.
 */
export const XBOX_DRIVER_TOKEN_ADAPTATION = /\bSraKmd_/i;
/** The device memory under which a browser is low-memory, GB (a browser adaptation; `./lobbyPrepare`'s 4 GB likewise). */
export const LOW_MEMORY_GB_ADAPTATION = 4;
/** The device memory at or above which a discrete part is the high class, GB (a browser adaptation). */
export const HIGH_MEMORY_GB_ADAPTATION = 8;
/**
 * The renderer-string hints of a discrete desktop graphics part (a browser adaptation): a hint table only, no benchmark
 * download (the spec §4.4: detect-gpu's benchmark data stopped updating 2025-12). Matched anywhere in the string; ANGLE
 * wraps the name in its own.
 */
export const DISCRETE_GPU_HINTS_ADAPTATION: readonly RegExp[] = [/NVIDIA GeForce (?:RTX|GTX)/i, /AMD Radeon RX/i, /Intel\(R\) Arc|Intel Arc/i];

/** The class (pure): the first of xbox, software, touch, lowMemory, high that holds, else standard. */
export function detectDeviceClass(s: DeviceSignals): DeviceClass {
  if (s.xboxPick) return 'xbox';
  // XBOX-TOKEN-NOSTRING: the token with no renderer string at all (a refused context, a masked debug name) is an Xbox too.
  if (XBOX_AGENT_TOKEN_ADAPTATION.test(s.userAgent) && (!s.renderer || XBOX_RENDERER_TOKEN_ADAPTATION.test(s.renderer))) return 'xbox';
  if (XBOX_DRIVER_TOKEN_ADAPTATION.test(s.renderer ?? '')) return 'xbox';   // XBOX-SRAKMD: the driver alone
  if (s.software) return 'software';
  if (s.touch) return 'touch';
  const memory = typeof s.deviceMemory === 'number' && Number.isFinite(s.deviceMemory) ? s.deviceMemory : null;
  if (memory !== null && memory < LOW_MEMORY_GB_ADAPTATION) return 'lowMemory';
  const discrete = s.renderer !== null && DISCRETE_GPU_HINTS_ADAPTATION.some((re) => re.test(s.renderer!));
  if (discrete && memory !== null && memory >= HIGH_MEMORY_GB_ADAPTATION) return 'high';
  return 'standard';
}

/**
 * The signals of a page: its user agent, the probe's renderer string and verdict, the touch query, the device memory and
 * the saved Xbox pick. Never throws: a part that cannot be read is absent. A browser that makes no WebGL context at all
 * (the probe's verdict "software" with no string) is not classed software here -- it draws nothing either way, and the
 * no-GPU notice (`./softwareRendererNotice`) still tells the player; only a string naming a rasteriser is.
 */
export function readDeviceSignals(win: { navigator?: { userAgent?: string; deviceMemory?: number } }, probe: () => SoftwareProbe): DeviceSignals {
  const part = <T,>(f: () => T, otherwise: T): T => { try { return f(); } catch { return otherwise; } };
  const found = part(probe, { renderer: null, software: false });
  const memory = part(() => win.navigator?.deviceMemory, undefined);
  const s: DeviceSignals = {
    userAgent: part(() => win.navigator?.userAgent ?? '', ''),
    renderer: found.renderer,
    software: found.renderer !== null && found.software,
    touch: part(() => wantsTouchControls(), false),
    xboxPick: part(() => readGraphicsBackend() === 'xbox', false),
  };
  if (typeof memory === 'number') s.deviceMemory = memory;
  return s;
}

/**
 * The page's renderer probe, made once a page load: it makes (and loses) a throwaway WebGL context. N1b: the memo is
 * `./softwareRenderer` `pageSoftwareProbe`, shared with the error beacon, the perf line and the no-GPU notice.
 */
export function pageRendererProbe(): SoftwareProbe { return pageSoftwareProbe(); }

/** Tests only: the page's probe forgotten, so the next read makes it again. */
export function resetPageRendererProbeForTest(): void { resetPageSoftwareProbeForTest(); }

/** The page's signals: the probe once a page load, the rest read now (the Xbox pick may be saved or cleared meanwhile). */
export function pageDeviceSignals(): DeviceSignals {
  return readDeviceSignals(globalThis as { navigator?: { userAgent?: string; deviceMemory?: number } }, pageRendererProbe);
}

/** The page's device class. */
export function pageDeviceClass(): DeviceClass {
  return detectDeviceClass(pageDeviceSignals());
}

/**
 * S2 (the controller's level-3 review of mega; the video settings plan's Log, 2026-11-10): the backend the Xbox class's
 * Automatic draws on; `CLASS_START_ADAPTATION`'s xbox row (`./autoQuality`) reads it (F2). A browser adaptation, no original (VS-7):
 * the console had one renderer.
 */
export const XBOX_GRAPHICS_ADAPTATION = 'webgl2' as const;

/**
 * S2: the backend a resolved choice asks for on `deviceClass` -- VS-7's Xbox class on WebGL2 under every preset, not only
 * Automatic: a named preset's rows carry `graphics: 'auto'` (`./videoSettings`) and the test room's and the Forge's
 * renderers read `readGraphicsBackend()`, and 'auto' asks WebGPU (`./graphicsBackend` `asksForWebGPU`). Only 'auto' on the
 * Xbox class changes (to `XBOX_GRAPHICS_ADAPTATION`), and not when an address override (`?renderer=`, `overridden`) named
 * it; a player's 'webgpu' or 'webgl2' and the Xbox pick ('xbox', the Xbox preset) are kept. `./renderer`'s
 * `createRenderer` applies it. A browser adaptation: which backend draws the same picture, nothing the game does.
 */
export function classGraphics(graphics: GraphicsBackendPreference, deviceClass: DeviceClass, overridden: boolean): GraphicsBackendPreference {
  return graphics === 'auto' && deviceClass === 'xbox' && !overridden ? XBOX_GRAPHICS_ADAPTATION : graphics;
}
