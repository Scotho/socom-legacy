/**
 * GM-02's perf leg (`uiGpuPerf.spec.ts`, `playwright.perf.config.ts`): which renderer the run's Chromium is launched on,
 * the native leg's precondition, and the popup slot the walk answers. Pure: no Playwright, no page. An instrument of the
 * specs (a browser adaptation); nothing here is the game's.
 */

/**
 * The native leg (`S2U_UI_PERF_GL=native`): ANGLE on the host's desktop GL -- Mesa's llvmpipe under xvfb on a Linux box --
 * past Chromium's GPU blocklist, which otherwise takes a software GL driver for unusable and falls back to SwiftShader
 * (the 2026-11-01 box run: "no ANGLE flags" still reported SwiftShader).
 */
export const UI_PERF_NATIVE_GL_ARGS: readonly string[] = ['--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist'];

export interface UiPerfGlEnv { S2U_UI_PERF_GL?: string | undefined; S2U_UI_PERF_GL_ARGS?: string | undefined }

/**
 * The Chromium flags of the run: the main config's renderer flags (`swiftshader` by default) unless the native leg is
 * asked; on it, the box's own `S2U_UI_PERF_GL_ARGS` (space- or comma-separated, e.g. `--use-gl=egl`) when given, else
 * `UI_PERF_NATIVE_GL_ARGS`.
 */
export function uiPerfLaunchArgs(env: UiPerfGlEnv, rendererArgs: readonly string[]): string[] {
  if (env.S2U_UI_PERF_GL !== 'native') return [...rendererArgs];
  const own = (env.S2U_UI_PERF_GL_ARGS ?? '').split(/[\s,]+/).filter((a) => a.length > 0);
  return own.length ? own : [...UI_PERF_NATIVE_GL_ARGS];
}

/**
 * The native leg's precondition, read off the unmasked WebGL renderer string: a native leg that still runs on
 * SwiftShader (or has no WebGL) measures nothing it claims to, so it is refused -- the message, or null to go on.
 * The SwiftShader leg is never refused here.
 */
export function uiPerfGlRefusal(gl: string | undefined, renderer: string | null): string | null {
  if (gl !== 'native') return null;
  if (renderer === null) return 'the native GL leg (S2U_UI_PERF_GL=native) got no WebGL context at all: nothing to measure';
  if (/swiftshader/i.test(renderer)) {
    return `the native GL leg (S2U_UI_PERF_GL=native) still runs on SwiftShader ("${renderer}"): the launch flags did not reach the host's GL (try S2U_UI_PERF_GL_ARGS / the runner's --gl-args)`;
  }
  return null;
}

/**
 * The popup slot (1 or 2) that answers `want`, read off the two buttons' captions as drawn; when no caption reads it,
 * the record's slot 2 -- research 118 section 4: the two-button records (246, 253) put NO first and YES answers 2, and
 * `dlgOptions_Menu` `Triangle_Back`, `dlgOptions_Video` `OnVideoBack` and `dlgControllerSelection` `OnContSelectBack`
 * are such records (its table, `AreYouSure`).
 */
export function popupSlotFor(captions: readonly string[], want: string): { slot: 1 | 2; by: 'caption' | 'record' } {
  const i = captions.findIndex((c) => c.trim().toUpperCase() === want.toUpperCase());
  if (i === 0 || i === 1) return { slot: (i + 1) as 1 | 2, by: 'caption' };
  return { slot: 2, by: 'record' };
}
