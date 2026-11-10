import { readPreference, savePreference } from './startupSettings';

/**
 * Browser adaptation: Automatic takes `DEFAULT_GRAPHICS_BACKEND_ADAPTATION`; the WebGL2 choice draws on WebGL2; WebGPU asks for
 * WebGPU (WebGL2 past adapterWait's bound); the explicit Xbox preset is WebGL2 that also disables native edge smoothing.
 */
export type GraphicsBackendPreference = 'auto' | 'webgl2' | 'xbox' | 'webgpu';
export const GRAPHICS_BACKEND_KEY = 's2u.viewer.graphicsBackend';

/**
 * What Automatic resolves to (a browser adaptation). WEBGPU-DEFAULT (WG-7, LATER 708; the owner's word 2026-11-09, MEGA.R8:
 * "webgpu as the default now yes"): 'webgpu' -- Automatic asks WebGPU
 * first, and draws on WebGL2 when no hardware adapter answers within adapterWait's bound (LATER 128; a fallback adapter
 * is refused there) or after a WebGPU error demoted this browser to WebGL2 (`./graphicsDemotion`). It was 'webgl2'
 * from 2026-11-05 (WEBGL2-DEFAULT, PR #687, the owner's word "webgl2 default: yes") while the WebGPU black world / tag
 * trails stood in the field (the fix is PR #684). WebGL2 (`webgl2`) and the Xbox preset never ask WebGPU.
 */
export const DEFAULT_GRAPHICS_BACKEND_ADAPTATION: 'webgl2' | 'webgpu' = 'webgpu';

/**
 * VS-6 (VS.R4, a browser adaptation): what a graphics, antialias or power preference row says of when it takes effect --
 * the match's renderer is made at its mount, so the choice applies when the next match starts; the running match keeps its own.
 */
export const GRAPHICS_BACKEND_APPLY_NOTE = 'Applies when the next match starts.';

/** Whether a choice asks for WebGPU (the renderer then still waits on adapterWait's bound, WebGL2 past it). */
export function asksForWebGPU(graphics: GraphicsBackendPreference): boolean {
  return graphics === 'webgpu' || (graphics === 'auto' && DEFAULT_GRAPHICS_BACKEND_ADAPTATION === 'webgpu');
}

/** A temporary address override, without changing this browser's saved choice. */
export function graphicsBackendOverride(search = globalThis.location?.search ?? ''): GraphicsBackendPreference | null {
  const value = new URLSearchParams(search).get('renderer');
  return value === 'auto' || value === 'webgl2' || value === 'xbox' || value === 'webgpu' ? value : null;
}

/** Shared by the launcher, test room and lobby-mounted match; read when a renderer is created (the match's: at its mount). */
export function readGraphicsBackend(search = globalThis.location?.search ?? ''): GraphicsBackendPreference {
  const saved = readPreference(GRAPHICS_BACKEND_KEY);
  return graphicsBackendOverride(search) ?? (saved === 'webgl2' || saved === 'xbox' || saved === 'webgpu' ? saved : 'auto');
}

/**
 * A running match keeps the renderer it was made with; the choice applies when the next match starts (VS-6, VS.R4: the
 * renderer is made per match mount, `./matchMount`'s `pageRenderer`). This never alters the game's picture mode or simulation.
 */
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
