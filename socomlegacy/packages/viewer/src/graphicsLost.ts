/**
 * Browser adaptation (no original; product track, PR #631's Xbox investigation): when the browser takes the page's
 * graphics away -- a lost WebGL context, a lost WebGPU device -- three's `WebGPURenderer` calls its `onDeviceLost`, whose
 * default only writes the console. A console nobody sees (the Xbox's Edge) left a white game area and no word. This
 * keeps three's own handler and puts the browser's reason and the UTC time on the page, so a player can report it.
 * It changes nothing the game does.
 */
export interface GraphicsLostInfo { api: string; message: string; reason?: string | null }

/** The notice's words: the API, the browser's message, its reason when it gives one, the UTC time. */
export function graphicsLostText(info: GraphicsLostInfo, at: Date = new Date()): string {
  const time = at.toISOString().slice(11, 19);
  const why = info.reason ? `; reason ${info.reason}` : '';
  return `Graphics stopped at ${time}Z (${info.api}: ${info.message}${why}). Reload the page to continue.`;
}

/** One notice on the page, over everything, replacing an earlier one. */
export function showGraphicsLost(doc: Document, info: GraphicsLostInfo, at: Date = new Date()): HTMLElement {
  doc.querySelector('[data-graphics-lost]')?.remove();
  const el = doc.createElement('div');
  el.setAttribute('data-graphics-lost', '');
  el.setAttribute('role', 'alert');
  el.textContent = graphicsLostText(info, at);
  // The design system's notice panel gives the colour and the type (chrome_classes: no colour or type inline); only
  // where it sits is set here, one layout property at a time.
  el.className = 's2u-notice';
  el.style.position = 'fixed';
  el.style.left = '50%';
  el.style.top = '12px';
  el.style.transform = 'translateX(-50%)';
  el.style.zIndex = '2147483647';
  el.style.maxWidth = '90vw';
  el.style.margin = '0';
  el.style.textAlign = 'center';
  (doc.body ?? doc.documentElement).appendChild(el);
  return el;
}

/** Chains the renderer's own handler (three's: the console line and its lost flag), then shows the notice. */
export function watchGraphicsLost(renderer: { onDeviceLost: (info: never) => void }, doc: Document | undefined = globalThis.document): void {
  if (typeof renderer.onDeviceLost !== 'function') return;   // a renderer without the hook (a test's fake) is left as it is
  const own = renderer.onDeviceLost.bind(renderer) as (info: GraphicsLostInfo) => void;
  renderer.onDeviceLost = ((info: GraphicsLostInfo) => {
    own(info);
    if (doc) { try { showGraphicsLost(doc, info); } catch { /* a page being torn down */ } }
  }) as never;
}
