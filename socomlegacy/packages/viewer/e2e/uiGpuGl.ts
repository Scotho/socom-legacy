import { isSoftwareAdapter } from '../src/uiGpuSwitch';
import { e2eRenderer } from './renderer';
import { UI_PERF_NATIVE_GL_ARGS } from './uiPerfLeg';

/**
 * GM-11b (the GPU menus plan; product track, a browser-test adaptation: it chooses the renderer a test's Chromium is
 * launched on and changes nothing the page does): the GPU specs' renderer by env -- `uiGpuHarness`, `uiGpuLoss`,
 * `uiGpuSwitch` and `uiGpuParity` take it by `test.use({ launchOptions: uiGpuLaunchOptions() })`, the way
 * `playwright.perf.config.ts` gives `uiGpuPerf.spec.ts` its own (`./uiPerfLeg.ts`).
 *
 * - **the config leg** (default; `S2U_UI_GPU_GL` unset, empty or `swiftshader`): the main config's flags,
 *   `S2U_E2E_RENDERER` as `./renderer.ts` reads it -- SwiftShader through ANGLE unless `d3d11` is asked on Windows.
 *   Identical to what `playwright.config.ts` launches, so a run without the env is unchanged.
 * - **the native leg** (`S2U_UI_GPU_GL=native`): ANGLE on the host's desktop GL past the GPU blocklist (Mesa's llvmpipe
 *   under xvfb on a Linux box), `UI_PERF_NATIVE_GL_ARGS`; or the box's own flags in `S2U_UI_GPU_GL_ARGS` (space- or
 *   comma-separated). The perf leg's names (`S2U_UI_PERF_GL`, `S2U_UI_PERF_GL_ARGS`) are read where these are unset, so
 *   one env drives all five GPU specs.
 *
 * A spec's `launchOptions` replaces the config's whole, so `PW_CHROMIUM` is carried as the config carries it.
 */

export const UI_GPU_GL_NATIVE_ARGS: readonly string[] = UI_PERF_NATIVE_GL_ARGS;

export interface UiGpuGlEnv {
  S2U_UI_GPU_GL?: string | undefined;
  S2U_UI_GPU_GL_ARGS?: string | undefined;
  S2U_UI_PERF_GL?: string | undefined;
  S2U_UI_PERF_GL_ARGS?: string | undefined;
  S2U_E2E_RENDERER?: string | undefined;
  PW_CHROMIUM?: string | undefined;
}

/** The leg a run is on: `config` (the main config's renderer) or `native`; what was asked, in words; the flags. */
export interface UiGpuGlLeg { gl: 'config' | 'native'; requested: string; args: string[] }

export function uiGpuGlLeg(env: UiGpuGlEnv = process.env, platform: NodeJS.Platform = process.platform): UiGpuGlLeg {
  const own = env.S2U_UI_GPU_GL !== undefined;
  const gl = (own ? env.S2U_UI_GPU_GL : env.S2U_UI_PERF_GL) ?? '';
  if (gl !== '' && gl !== 'swiftshader' && gl !== 'native') {
    throw Error(`S2U_UI_GPU_GL (or S2U_UI_PERF_GL) must be native or swiftshader, or unset; got ${JSON.stringify(gl)}`);
  }
  if (gl !== 'native') {
    const r = e2eRenderer(env.S2U_E2E_RENDERER, platform);
    return { gl: 'config', requested: r.request, args: r.args };
  }
  const extra = (own ? env.S2U_UI_GPU_GL_ARGS : env.S2U_UI_PERF_GL_ARGS) ?? '';
  const given = extra.split(/[\s,]+/).filter((a) => a.length > 0);
  const args = given.length ? given : [...UI_GPU_GL_NATIVE_ARGS];
  return { gl: 'native', requested: `native GL (${args.join(' ')})`, args };
}

/** The launch options of a GPU spec: the leg's flags and the host's `PW_CHROMIUM`, as `playwright.config.ts` gives them. */
export function uiGpuLaunchOptions(env: UiGpuGlEnv = process.env, platform: NodeJS.Platform = process.platform): { args: string[]; executablePath: string | undefined } {
  return { args: uiGpuGlLeg(env, platform).args, executablePath: env.PW_CHROMIUM || undefined };
}

/**
 * The native leg's precondition, read off the renderer string (unmasked where the browser gives it): a native leg that
 * still runs on SwiftShader, or got no WebGL, measures nothing it claims to -- the message, or null to go on. The
 * config leg is never refused here.
 */
export function uiGpuGlRefusal(leg: UiGpuGlLeg, renderer: string | null): string | null {
  if (leg.gl !== 'native') return null;
  if (renderer === null) return 'the native GL leg (S2U_UI_GPU_GL=native) got no WebGL context at all';
  if (/swiftshader/i.test(renderer)) {
    return `the native GL leg (S2U_UI_GPU_GL=native) still runs on SwiftShader ("${renderer}"): the flags ${leg.args.join(' ')} did not reach the host's GL (try S2U_UI_GPU_GL_ARGS)`;
  }
  return null;
}

/** What a page shows of `#front-end-gpu`: absent, or its standby class and computed visibility. */
export type FrontGpuCanvasState = 'absent' | { readonly standby: boolean; readonly visibility: string };

/**
 * The 4070 evidence run's finding 3 (the flip, GM.R18; a browser-test adaptation): what the front end's GPU canvas must
 * be on a page whose WebGL renderer is `renderer` (`UNMASKED_RENDERER_WEBGL`, else `RENDERER`; null: no WebGL2) -- on a
 * software adapter or with no WebGL2 the capability gate refuses it (L4), so it is absent or in standby (hidden); on a
 * hardware renderer the front end draws on the GPU, so it is present and visible (the 2D canvas stays beneath it: the
 * front surface is opaque, so the mount does not hide its twin). The failure in words, or null when it holds.
 */
export function frontGpuCanvasFailure(renderer: string | null, canvas: FrontGpuCanvasState): string | null {
  const said = JSON.stringify(canvas);
  if (renderer === null || isSoftwareAdapter(renderer)) {
    const ok = canvas === 'absent' || (canvas.standby && canvas.visibility === 'hidden');
    return ok ? null : `#front-end-gpu absent or in standby on ${renderer ?? 'no WebGL2'}: ${said}`;
  }
  const ok = canvas !== 'absent' && !canvas.standby && canvas.visibility === 'visible';
  return ok ? null : `#front-end-gpu present and visible on a hardware renderer (${renderer}): ${said}`;
}

/** The in-match Settings overlay's software canvas (`../src/nativeSettings.ts`, `data-native-settings`). */
export const NATIVE_SETTINGS_CANVAS = 'canvas[data-native-settings]';
/** Its GPU canvas (`NATIVE_SETTINGS_GPU_ATTRIBUTE`, made by `../src/uiGpuSurfaceMount.ts` `UiGpuCanvasMount`). */
export const NATIVE_SETTINGS_GPU_CANVAS = 'canvas[data-native-settings-gpu]';

/** What a page shows of the overlay's two canvases: each absent, or its class (under / standby) and computed visibility. */
export interface NativeSettingsCanvases {
  readonly software: 'absent' | { readonly under: boolean; readonly visibility: string };
  readonly gpu: 'absent' | { readonly standby: boolean; readonly visibility: string };
}

/**
 * The A4500 red (nativeSettings.spec.ts, after the flip, GM.R18; a browser-test adaptation: the spec's check follows the
 * page's renderer, nothing the page does changes): which of the overlay's two canvases shows it -- exactly one, never both
 * and never neither (an invisible overlay). On a software adapter or with no WebGL2 the capability gate refuses the GPU
 * surface (L4), so the software canvas shows and the GPU one is absent or in standby; on a hardware renderer the overlay
 * draws on its GPU canvas (GM-19a) and the software canvas is hidden under it (`UI_GPU_UNDER_CLASS`, the GPU frame is
 * transparent). `renderer` as `frontGpuCanvasFailure` reads it. The shown canvas's selector (the spec's visibility check and
 * its taps), or the failure in words.
 */
export function nativeSettingsShown(renderer: string | null, c: NativeSettingsCanvases): { selector: string } | { failure: string } {
  const said = JSON.stringify(c);
  if (c.software === 'absent') return { failure: `no ${NATIVE_SETTINGS_CANVAS} on the page (the overlay is not open): ${said}` };
  const soft = !c.software.under && c.software.visibility === 'visible';
  const gpu = c.gpu !== 'absent' && !c.gpu.standby && c.gpu.visibility === 'visible';
  if (soft && gpu) return { failure: `both canvases shown: ${said}` };
  if (!soft && !gpu) return { failure: `neither canvas shown (an invisible overlay): ${said}` };
  if (renderer === null || isSoftwareAdapter(renderer)) {
    return soft ? { selector: NATIVE_SETTINGS_CANVAS } : { failure: `expected the software canvas shown on ${renderer ?? 'no WebGL2'}; the GPU canvas shows: ${said}` };
  }
  return gpu ? { selector: NATIVE_SETTINGS_GPU_CANVAS } : { failure: `expected the GPU canvas shown on a hardware renderer (${renderer}); the software canvas shows (the overlay's GPU surface fell back): ${said}` };
}
