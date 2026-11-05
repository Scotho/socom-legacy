import { readPreference, savePreference } from './startupSettings';

/**
 * Browser adaptation: Automatic takes `DEFAULT_GRAPHICS_BACKEND_ADAPTATION`; Compatibility uses WebGL2; WebGPU asks for
 * WebGPU (WebGL2 past adapterWait's bound); the explicit Xbox preset is WebGL2 that also disables native edge smoothing.
 */
export type GraphicsBackendPreference = 'auto' | 'webgl2' | 'xbox' | 'webgpu';
export const GRAPHICS_BACKEND_KEY = 's2u.viewer.graphicsBackend';

/**
 * What Automatic resolves to (WEBGL2-DEFAULT, a browser adaptation; the owner's word, 2026-11-05: "webgl2 default: yes").
 * WebGL2 while the WebGPU black world / tag trails are open in the field (the fix is PR #684); it flips back to 'webgpu'
 * on the owner's word once the beacon shows the field clean (LATER 708). WebGPU stays reachable by `?renderer=webgpu`
 * and by Settings > Display > Graphics mode's WebGPU value.
 */
export const DEFAULT_GRAPHICS_BACKEND_ADAPTATION: 'webgl2' | 'webgpu' = 'webgl2';

/** Whether a choice asks for WebGPU (the renderer then still waits on adapterWait's bound, WebGL2 past it). */
export function asksForWebGPU(graphics: GraphicsBackendPreference): boolean {
  return graphics === 'webgpu' || (graphics === 'auto' && DEFAULT_GRAPHICS_BACKEND_ADAPTATION === 'webgpu');
}

/** A temporary address override, without changing this browser's saved choice. */
export function graphicsBackendOverride(search = globalThis.location?.search ?? ''): GraphicsBackendPreference | null {
  const value = new URLSearchParams(search).get('renderer');
  return value === 'auto' || value === 'webgl2' || value === 'xbox' || value === 'webgpu' ? value : null;
}

/** Shared by the launcher, test room and lobby-mounted match; read when a renderer is created. */
export function readGraphicsBackend(search = globalThis.location?.search ?? ''): GraphicsBackendPreference {
  const saved = readPreference(GRAPHICS_BACKEND_KEY);
  return graphicsBackendOverride(search) ?? (saved === 'webgl2' || saved === 'xbox' || saved === 'webgpu' ? saved : 'auto');
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
