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
