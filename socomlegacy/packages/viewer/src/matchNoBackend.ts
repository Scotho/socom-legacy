/**
 * NO-BACKEND-NOTICE (#790, 2026-11-14; a browser adaptation, no original; product track): a match whose renderer never
 * comes up says so. Two players on Xbox Edge (2026-11-13) were in matches with no renderer -- central's inputdiag rows
 * carried `bk: null` three matches in a row, after the UI's GPU restore timed out (uigpufallback L3) -- and saw a black
 * match with no word while the page went on sending their input. `./graphicsLost`'s notices answer a lost device, a lost
 * context and frames that all throw (`./frameGuard`), never a renderer that never started.
 *
 * From the match's attach: the renderer's promise rejected, or still pending `MATCH_NO_BACKEND_BOUND_MS_ADAPTATION`
 * later, shows one notice -- `MATCH_NO_BACKEND_TEXT`, the Xbox's steps, and a "Leave match" button the player may press
 * (the mount's own leave: the START menu's ABORT path, `./matchAbort`; never automatic) -- and reports once (the mount's
 * `contextdiag`, why `no-backend`). A renderer that comes up after all takes the notice away. It changes nothing the
 * game does: the round, the room and the seat run as they would.
 */

/**
 * MATCH_NO_BACKEND_BOUND_MS_ADAPTATION: how long after the attach a still-pending renderer is called absent. The renderer
 * is asked for at the mount, before the attach, so this is on top of the load; a product-track bound (no original).
 */
export const MATCH_NO_BACKEND_BOUND_MS_ADAPTATION = 20_000;

/** The notice's words: what happened and the remedy -- a browser's behaviour, so no promise that it always clears. */
export const MATCH_NO_BACKEND_TEXT = 'The browser gave this match no graphics (its renderer could not start). Close the browser completely and open it again.';
/** The Xbox's way to close Edge (its own line in the notice). */
export const MATCH_NO_BACKEND_XBOX_STEPS = 'On Xbox: press the Xbox button, go to Home, highlight Microsoft Edge, press the Menu button and choose Quit, then open Edge again.';
/** The leave button's label. */
export const MATCH_NO_BACKEND_LEAVE_LABEL = 'Leave match';

export interface MatchBackendWatch {
  doc: Document;
  /** The mount's leave (the START menu's ABORT confirmed): called once, on the player's press. */
  leave: () => void;
  /**
   * The report: the mount's diagnostic's `contextdiag` lane. Called once, when the notice is first shown -- with the
   * rejection (MATCH-RENDERER-RETRY A) when the renderer was refused, alone when the bound ran out.
   */
  report: (why: 'no-backend', reason?: unknown) => void;
  /** Tests' clock (default the page's timers). */
  setTimeout?: (cb: () => void, ms: number) => unknown;
  clearTimeout?: (id: unknown) => void;
}

const MARK = 'data-match-no-backend';

function show(o: MatchBackendWatch): HTMLElement {
  const doc = o.doc;
  doc.querySelector(`[${MARK}]`)?.remove();
  const el = doc.createElement('div');
  el.setAttribute(MARK, '');
  el.setAttribute('role', 'alert');
  // The design system's notice panel gives the colour and the type (no colour or type inline); only where it sits is set
  // here, as `./graphicsLost`'s notices are.
  el.className = 's2u-notice';
  el.style.position = 'fixed';
  el.style.left = '50%';
  el.style.top = '12px';
  el.style.transform = 'translateX(-50%)';
  el.style.zIndex = '2147483647';
  el.style.maxWidth = '90vw';
  el.style.margin = '0';
  el.style.textAlign = 'center';
  const line = doc.createElement('p');
  line.textContent = MATCH_NO_BACKEND_TEXT;
  const steps = doc.createElement('p');
  steps.textContent = MATCH_NO_BACKEND_XBOX_STEPS;
  const leave = doc.createElement('button');
  leave.type = 'button';
  leave.className = 's2u-chip';
  leave.setAttribute('data-match-no-backend-leave', '');
  leave.textContent = MATCH_NO_BACKEND_LEAVE_LABEL;
  leave.addEventListener('click', () => {
    if (leave.disabled) return;
    leave.disabled = true;
    try { o.leave(); } catch { /* the leave's own failure: the button stays spent */ }
  });
  el.append(line, steps, leave);
  (doc.body ?? doc.documentElement).appendChild(el);
  return el;
}

/** Watches the match's renderer from the attach (see above); returns the stop (the mount's teardown). */
export function watchMatchBackend(made: Promise<unknown>, o: MatchBackendWatch): () => void {
  const set = o.setTimeout ?? ((cb: () => void, ms: number) => globalThis.setTimeout(cb, ms));
  const clear = o.clearTimeout ?? ((id: unknown) => { globalThis.clearTimeout(id as ReturnType<typeof setTimeout>); });
  let settled = false, stopped = false, reported = false;
  let el: HTMLElement | null = null;
  const absent = (refused: boolean, reason?: unknown): void => {
    if (stopped || el) return;
    try { el = show(o); } catch { /* a page being torn down */ }
    if (!reported) {
      reported = true;
      try { if (refused) o.report('no-backend', reason); else o.report('no-backend'); } catch { /* an instrument never stops the match */ }
    }
  };
  const timer = set(() => { if (!settled) absent(false); }, MATCH_NO_BACKEND_BOUND_MS_ADAPTATION);
  made.then(() => {
    settled = true;
    clear(timer);
    el?.remove(); el = null;                           // a renderer in after all: the notice goes
  }, (reason: unknown) => {
    settled = true;
    clear(timer);
    absent(true, reason);
  });
  return () => { stopped = true; clear(timer); el?.remove(); el = null; };
}

// ---------------------------------------------------------------------------------------------------------------------
// MATCH-RENDERER-RETRY (#790, 2026-11-14; browser adaptations, no original; product track; the main controller's order).
// On the Xbox class every match after the menus' L3 loss ran with no renderer -- central, 2026-11-14: 11 of 11 such
// inputdiag rows `bk: null` since v0.4.20, against 2 of 2 drawn (`webgl2`) with no L3 before them. By three r186's source a
// WebGL2 context the browser refuses (null) or hands back lost throws in `renderer.init()` (`WebGLExtensions` reads
// `gl.getSupportedExtensions()`), so the renderer REJECTS and the match ran on, attached, with nothing drawn.
// A -- the rows say why: the rejection's message (`errText`), the canvas's `webglcontextcreationerror` (`watchCreationError`,
// where Chromium writes its reason), and, on the menus' L3 row, the loss's status (`./uiGpuPresenter`).
// B -- one retry: a rejected renderer is asked again once, `MATCH_RENDERER_RETRY_DELAY_MS_ADAPTATION` later, on a fresh
// canvas over the first (`freshCanvasOver`), WebGL2, antialias off (`MATCH_RENDERER_RETRY_CHOICE`: the fewest resources).
// On the Xbox class the menus' one GPU surface (`front`) has let its context go at the match's leave and every other
// surface is software there (`./uiGpuSurfaceMount` `gpuSurfaceAllowed`), so the retry runs beside no other context of the
// page's. A pending renderer is not retried (its promise cannot be withdrawn; the no-backend notice bounds it).
// ---------------------------------------------------------------------------------------------------------------------

/** MATCH_RENDERER_RETRY_DELAY_MS_ADAPTATION: the wait before the one retry -- a short block or a GPU process's restart let pass. */
export const MATCH_RENDERER_RETRY_DELAY_MS_ADAPTATION = 3000;
/** The retry's renderer: WebGL2 whatever the saved choice, antialias off. */
export const MATCH_RENDERER_RETRY_CHOICE = { graphics: 'webgl2', antialias: false } as const;
export type RendererRetryChoice = typeof MATCH_RENDERER_RETRY_CHOICE;

/** A row's cap for each text field (the contextdiag message keeps its own whole bound). */
const ROW_TEXT_CAP = 120;
const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim().slice(0, ROW_TEXT_CAP);

/** A rejection's words for a row: an Error's message, anything else its text; one line, capped; nothing, null. */
export function errText(e: unknown): string | null {
  if (e === undefined || e === null) return null;
  try { return oneLine(e instanceof Error ? e.message : String(e)); } catch { return null; }
}

/** A retry refused too: both rejections kept for the row. */
export class RendererRetryFailed extends Error {
  constructor(readonly first: unknown, readonly second: unknown) {
    super(`the match renderer was refused twice: ${errText(second) ?? 'no message'}`);
    this.name = 'RendererRetryFailed';
  }
}

/**
 * The no-backend row's extra fields (`contextdiag`'s `x`): the creation error the canvas heard (`cce`), and the
 * rejection's message (`err`) -- a failed retry's two (`err`, `err2`) and `retry: 'fail'`. A timeout has no rejection.
 */
export function noBackendExtra(reason: unknown, cce: string | null): Record<string, string | null> {
  if (reason instanceof RendererRetryFailed) return { err: errText(reason.first), err2: errText(reason.second), cce, retry: 'fail' };
  return { err: errText(reason), cce };
}

/** The canvas's last `webglcontextcreationerror` status message (the browser's reason it made no context), capped. */
export function watchCreationError(canvas: EventTarget): { last(): string | null; stop(): void } {
  let last: string | null = null;
  const on = (e: Event): void => {
    const m = (e as Event & { statusMessage?: unknown }).statusMessage;
    last = typeof m === 'string' ? oneLine(m) : last ?? '';
  };
  canvas.addEventListener('webglcontextcreationerror', on);
  return { last: () => last, stop: () => { canvas.removeEventListener('webglcontextcreationerror', on); } };
}

/**
 * A fresh canvas laid OVER the first (its next sibling, at the same z-index, so it paints above): its classes and style
 * copied and kept copied (the picture's classes, the brightness and colour filters, the visibility), and `pointer-events:
 * none`, so the mouse and touch still reach the first canvas, whose listeners the mount bound. The stop removes it and
 * asks it for nothing: a context its renderer made is the mount's to lose (`loseWebgl2`, the batch review's F1).
 */
export function freshCanvasOver(old: HTMLCanvasElement): { canvas: HTMLCanvasElement; stop(): void } {
  const doc = old.ownerDocument;
  const canvas = doc.createElement('canvas');
  const copy = (): void => {
    canvas.className = old.className;
    canvas.setAttribute('style', old.getAttribute('style') ?? '');
    canvas.style.pointerEvents = 'none';
  };
  copy();
  old.after(canvas);
  const Watch = doc.defaultView?.MutationObserver;
  const watch = Watch ? new Watch(copy) : null;
  watch?.observe(old, { attributes: true, attributeFilter: ['class', 'style'] });
  return {
    canvas,
    stop: () => {
      watch?.disconnect();
      canvas.remove();
    },
  };
}

/**
 * The context of the canvas that drew, let go now rather than at the collector's leisure (`./matchMount`'s leave and a
 * late arrival). Given the canvas the renderer was made on -- never another: asking a canvas with no context for
 * `webgl2` makes one (the batch review's F1, 2026-11-14), one more context on the console this spares.
 */
export function loseWebgl2(c: HTMLCanvasElement | null): void {
  if (!c) return;
  try { (c.getContext('webgl2') as WebGL2RenderingContext | null)?.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* gone already */ }
}

export interface RendererRetry {
  /** Whether a retry may be made (the mount's own canvas only: a caller's canvas is the caller's). */
  retry: boolean;
  /** The match torn down: no retry starts, and a late one's result is the first rejection's. */
  gone: () => boolean;
  /** The retry's canvas (`freshCanvasOver`). */
  fresh: () => HTMLCanvasElement;
  /** A retry that made the renderer: the save's report, with the first rejection. */
  retried?: (first: unknown) => void;
  /** The first refusal, told at once when a retry will follow (the mount's console line; b0's run, the OT.R79 case). */
  refused?: (first: unknown) => void;
  /** Tests' clock (default the page's). */
  setTimeout?: (cb: () => void, ms: number) => unknown;
}

/** The match's renderer with one retry (see above): the renderer and the canvas it draws on. */
export function rendererWithRetry<R>(canvas: HTMLCanvasElement, make: (c: HTMLCanvasElement, choice?: RendererRetryChoice) => Promise<R>,
  o: RendererRetry): Promise<{ r: R; canvas: HTMLCanvasElement }> {
  const set = o.setTimeout ?? ((cb: () => void, ms: number) => globalThis.setTimeout(cb, ms));
  return make(canvas).then((r) => ({ r, canvas }), (first: unknown) => {
    if (!o.retry || o.gone()) throw first;
    try { o.refused?.(first); } catch { /* an instrument never stops the match */ }
    return new Promise<void>((done) => { set(done, MATCH_RENDERER_RETRY_DELAY_MS_ADAPTATION); }).then(() => {
      if (o.gone()) throw first;
      const fresh = o.fresh();
      return make(fresh, MATCH_RENDERER_RETRY_CHOICE).then((r) => {
        try { o.retried?.(first); } catch { /* an instrument never stops the match */ }
        return { r, canvas: fresh };
      }, (second: unknown) => { throw new RendererRetryFailed(first, second); });
    });
  });
}
