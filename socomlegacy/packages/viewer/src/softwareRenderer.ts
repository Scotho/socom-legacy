/**
 * Browser adaptation (no original; product track, PLAT-38 (e), CPS-4c): is this browser drawing WebGL in software? On
 * the 2026-11-01 playtest four of nine "lag" reports were browsers with hardware acceleration off, each fixed by turning
 * it on. This reads the renderer string a throwaway WebGL context reports and says whether it names a software
 * rasteriser. A probe only: it never touches the page's own renderer (which may be WebGPU, `renderer.ts`'s
 * `createRenderer`) and changes nothing the game does.
 */

/**
 * The software rasterisers a browser's WebGL reports: Chrome's and Edge's SwiftShader (with acceleration off or the GPU
 * blocklisted), Mesa's llvmpipe and softpipe (Linux without a driver; Mesa's OffScreen), Windows' WARP ("Microsoft Basic
 * Render Driver", the "Software Adapter"). Matched anywhere in the string, any case: ANGLE wraps the name in its own.
 */
const SOFTWARE = /swiftshader|llvmpipe|softpipe|microsoft basic render driver|software adapter|mesa offscreen/i;

/** Whether a renderer string names a software rasteriser. An absent or empty string is not one by itself. */
export function isSoftwareRenderer(rendererString: string | null | undefined): boolean {
  return typeof rendererString === 'string' && SOFTWARE.test(rendererString);
}

/** `WEBGL_debug_renderer_info`'s constant, when the extension object does not carry it. */
const UNMASKED_RENDERER_WEBGL = 0x9246;

/**
 * The renderer a WebGL context reports: `WEBGL_debug_renderer_info`'s unmasked string when the browser offers it (it may
 * withhold it, or answer empty), else the context's own `RENDERER`. Null when neither names anything or a read throws.
 */
export function softwareRendererOf(gl: WebGL2RenderingContext | WebGLRenderingContext): string | null {
  const named = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info') as { UNMASKED_RENDERER_WEBGL?: number } | null;
    const unmasked = ext ? named(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL ?? UNMASKED_RENDERER_WEBGL)) : null;
    return unmasked ?? named(gl.getParameter(gl.RENDERER));
  } catch {
    return null;                                        // a lost or refused context names nothing
  }
}

/** What the probe found: the renderer string (null when none), and whether it is software or no context could be made. */
export interface SoftwareProbe { renderer: string | null; software: boolean }

/**
 * Makes a throwaway WebGL2 context (then WebGL1) on a detached canvas, reads its renderer, and loses the context at once
 * (`WEBGL_lose_context`) so it holds nothing. A browser that makes no context at all is counted as software: the game
 * cannot draw on its GPU either. A hardware context whose string is withheld is not.
 */
export function probeSoftwareRenderer(doc: Document): SoftwareProbe {
  const canvas = doc.createElement('canvas');
  const context = (kind: 'webgl2' | 'webgl'): WebGL2RenderingContext | WebGLRenderingContext | null => {
    try { return canvas.getContext(kind) as WebGL2RenderingContext | WebGLRenderingContext | null; } catch { return null; }
  };
  const gl = context('webgl2') ?? context('webgl');
  if (!gl) return { renderer: null, software: true };
  const renderer = softwareRendererOf(gl);
  try { (gl.getExtension('WEBGL_lose_context') as { loseContext(): void } | null)?.loseContext(); } catch { /* already gone */ }
  return { renderer, software: isSoftwareRenderer(renderer) };
}

// N1b (the fresh review of N1): the page's one memoised probe, here so the error beacon reads it without pulling
// `./deviceClass` into the page's entry (OT.R12; `clientErrorBeacon.test.ts` pins that). `./deviceClass` `pageRendererProbe`
// returns it; never a second throwaway WebGL context beside a live one on the Xbox class (GM-XBOX1); a browser adaptation.
let pageProbe: SoftwareProbe | null = null;
/** The page's renderer probe, made once a page load: it makes (and loses) a throwaway WebGL context; a throw reads "no verdict". */
export function pageSoftwareProbe(): SoftwareProbe {
  if (!pageProbe) {
    try { pageProbe = probeSoftwareRenderer(globalThis.document); } catch { pageProbe = { renderer: null, software: false }; }
  }
  return pageProbe;
}

/** Tests only: the page's probe forgotten, so the next read makes it again. */
export function resetPageSoftwareProbeForTest(): void { pageProbe = null; }

/**
 * Whether the no-GPU notice stays silent: the notice is for a player; an automated browser (Playwright, the perf drivers)
 * runs on SwiftShader by design -- the batch review, 2026-11-02. A test driver sets `navigator.webdriver`; a player's
 * browser does not. `?devmode` is not a reason: a developer on SwiftShader still sees it.
 */
export function noticeSuppressed(nav: { webdriver?: boolean }): boolean {
  return nav.webdriver === true;
}
