import { readPreference, savePreference } from './startupSettings';

/** Browser adaptation: Compatibility uses WebGL2; the explicit Xbox preset also disables native edge smoothing. */
export type GraphicsBackendPreference = 'auto' | 'webgl2' | 'xbox';
export const GRAPHICS_BACKEND_KEY = 's2u.viewer.graphicsBackend';

/** A temporary address override, without changing this browser's saved choice. */
export function graphicsBackendOverride(search = globalThis.location?.search ?? ''): GraphicsBackendPreference | null {
  const value = new URLSearchParams(search).get('renderer');
  return value === 'auto' || value === 'webgl2' || value === 'xbox' ? value : null;
}

/** Shared by the launcher, test room and lobby-mounted match; read when a renderer is created. */
export function readGraphicsBackend(search = globalThis.location?.search ?? ''): GraphicsBackendPreference {
  const saved = readPreference(GRAPHICS_BACKEND_KEY);
  return graphicsBackendOverride(search) ?? (saved === 'webgl2' || saved === 'xbox' ? saved : 'auto');
}

/** Existing canvases keep their backend until reload; this never alters the game's picture mode or simulation. */
export function saveGraphicsBackend(value: GraphicsBackendPreference): void {
  savePreference(GRAPHICS_BACKEND_KEY, value);
}


/** Explicit receiver action: keep the choice on this browser and retire an old diagnostic override. */
export function selectXboxGraphics(): void {
  saveGraphicsBackend('xbox');
  const win = globalThis.window;
  if (!win) return;
  const url = new URL(win.location.href);
  if (!url.searchParams.has('renderer')) return;
  url.searchParams.delete('renderer');
  win.history.replaceState(win.history.state, '', url.pathname + url.search + url.hash);
}
