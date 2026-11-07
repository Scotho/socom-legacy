/**
 * GM-02's perf leg (`uiGpuPerf.spec.ts`, `playwright.perf.config.ts`): which renderer the run's Chromium is launched on,
 * the native leg's precondition, and the popup slot the walk answers. Pure: no Playwright, no page. An instrument of the
 * specs (a browser adaptation); nothing here is the game's.
 */

/**
 * The native leg (`S2U_UI_PERF_GL=native`): ANGLE on the host's own GL or GPU past Chromium's GPU blocklist, which
 * otherwise takes a software GL driver for unusable and falls back to SwiftShader (the 2026-11-01 box run: "no ANGLE
 * flags" still reported SwiftShader). On a Linux box without a GPU that is Mesa's llvmpipe under xvfb; on a GPU host it
 * is that GPU. The refusal (`uiPerfGlRefusal`) catches SwiftShader only (LATER 721).
 */
export const UI_PERF_NATIVE_GL_ARGS: readonly string[] = ['--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist'];

export interface UiPerfGlEnv {
  S2U_UI_PERF_GL?: string | undefined; S2U_UI_PERF_GL_ARGS?: string | undefined; S2U_E2E_RENDERER?: string | undefined;
}

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
 * The host record's requested renderer (LATER 722): on the native leg, the flags the run passes
 * (`native GL (<flags>)`, as `uiPerfLaunchArgs` reads them), never a guess at the GL behind them -- what ran is the
 * record's `webgl.renderer`, the unmasked string; otherwise `S2U_E2E_RENDERER`, or `swiftshader`.
 */
export function uiPerfRequestedRenderer(env: UiPerfGlEnv): string {
  if (env.S2U_UI_PERF_GL !== 'native') return env.S2U_E2E_RENDERER || 'swiftshader';
  return `native GL (${uiPerfLaunchArgs(env, []).join(' ')})`;
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
 * GM-16 diagnosis (the plan's Log 2026-11-06; the controller b6's technical call; a test instrument, a browser adaptation
 * with no original): `S2U_UI_PERF_PROFILE=1` takes a CDP CPU profile across each cold dialog switch of the GPU leg at the
 * scales below. The instrument's own settings, not game values: the profiler's sampling interval (us); the marker, a
 * pair of functions the spec spins on the page for `markerMs` each, `markerStart` before the press and `markerEnd`
 * before the stop, so the profile's clock is aligned to the page's (`tools/perf/cpf/profileWindow.ts` `profileClock`).
 * Two names, never one: a name's samples are one marker's run (review GM-16-DIAG-1 F1). A profiled run is diagnostic
 * only.
 */
export const UI_PERF_PROFILE_ADAPTATION = {
  flag: 'S2U_UI_PERF_PROFILE', samplingIntervalUs: 100, scales: [2, 4],
  markerStart: 'gm16ProfileMarkStart', markerEnd: 'gm16ProfileMarkEnd', markerMs: 5,
} as const;

/** The flag: on for exactly "1". */
export function uiPerfProfileOn(v: string | undefined): boolean {
  return v === '1';
}

/** A profiled switch's files: `gm16-profile-<scale>x-<from>-<to>` (the dialogs without `.rdr`). */
export function uiPerfProfileStem(scale: number, from: string, to: string): string {
  const bare = (d: string): string => d.replace(/\.rdr$/i, '');
  return `gm16-profile-${scale}x-${bare(from)}-${bare(to)}`;
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
