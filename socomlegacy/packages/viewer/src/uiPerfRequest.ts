/**
 * GM-02 (plan 2026-11-01-gpu-menus, "Performance"): the instrument's two names `./frontEnd` reads on every page -- the
 * address's request and the page's hook -- apart from `./uiGpuPerf`, which it loads with `import()` only when the ring
 * is asked for (review F2), so a release build's front end ships none of the instrument. A browser adaptation.
 */

/** The page's hook: `window.__uiGpuPerf`. */
export const UI_PERF_WINDOW_HOOK = '__uiGpuPerf';

/**
 * What the address asks of the instrument, on a development build only (`dev`: `./frontEnd` `devBuild()` and the
 * page's `?devmode`): `?uiPerf` the ring; `?uiPerfHd` the ring and the menus' HD path forced on for the measurement
 * (`./frontEnd` `applyHdMenus`), at the pack's scale capped by `?hdMenuScale=` -- whatever the picture (HD-HOLD keeps
 * HD (GoE SouL) out of every player's choice; this does not offer it, store it or touch the world's picture).
 */
export function uiPerfRequest(search: string, dev: boolean): { ring: boolean; hd: boolean } {
  if (!dev) return { ring: false, hd: false };
  const q = new URLSearchParams(search);
  const hd = q.has('uiPerfHd');
  return { ring: hd || q.has('uiPerf'), hd };
}
