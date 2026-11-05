/**
 * Browser adaptation (no original; product track, PR #631's Xbox investigation): when the browser takes the page's
 * graphics away -- a lost WebGL context, a lost WebGPU device -- three's `WebGPURenderer` calls its `onDeviceLost`, whose
 * default only writes the console. A console nobody sees (the Xbox's Edge) left a white game area and no word. This
 * keeps three's own handler and puts the browser's reason and the UTC time on the page, so a player can report it.
 * It changes nothing the game does.
 *
 * The uncaptured GPU errors (2026-11-05, the tag-trails hunt; the same adaptation): a WebGPU validation error the device
 * reports as uncaptured drops the pass's whole command buffer with no word on the page -- the world black or frozen
 * while the overlay passes, whose own buffers still submit, stack frame over frame -- and only a console nobody opens
 * says which draw failed. three routes the device's `uncapturederror` to the renderer's `onError` (its console line);
 * `watchGraphicsErrors` keeps the first one in full and counts the rest, puts them on the page in their own notice,
 * and `graphicsRecord` hands them to the performance line (`./perfLine`) and the client error beacon
 * (`./clientErrorBeacon`), so a player's report names the failing draw. Every lost device and uncaptured error also
 * goes to the listeners of `onGraphicsEvent` (the beacon's).
 */
export interface GraphicsLostInfo { api: string; message: string; reason?: string | null }

/** What three's `onError` hands the renderer: the API, the error's class name (`ValidationError`, `OutOfMemoryError`) and its message. */
export interface GraphicsErrorInfo { api: string; type?: string; message: string }

/** The page's record of its graphics trouble: the first uncaptured error in full, the count of all, the lost device. */
export interface GraphicsRecord {
  first: { api: string; type: string; message: string; at: string } | null;
  count: number;
  lost: { api: string; message: string; reason: string | null; at: string } | null;
}

export type GraphicsEventKind = 'gpuuncapturederror' | 'gpudevicelost' | 'webglcontextlost';

const record: GraphicsRecord = { first: null, count: 0, lost: null };
const listeners = new Set<(kind: GraphicsEventKind, info: { api: string; message: string; detail: string | null }) => void>();

/** The record, a copy. */
export function graphicsRecord(): GraphicsRecord {
  return { first: record.first ? { ...record.first } : null, count: record.count, lost: record.lost ? { ...record.lost } : null };
}

/** Tests only: the record emptied. */
export function resetGraphicsRecordForTest(): void { record.first = null; record.count = 0; record.lost = null; listeners.clear(); }

/** A listener for every lost device and uncaptured error from here on (the client error beacon's); returns its removal. */
export function onGraphicsEvent(fn: (kind: GraphicsEventKind, info: { api: string; message: string; detail: string | null }) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function tell(kind: GraphicsEventKind, info: { api: string; message: string; detail: string | null }): void {
  for (const fn of listeners) { try { fn(kind, info); } catch { /* a listener's own failure never reaches the renderer */ } }
}

/** The notice's words: the API, the browser's message, its reason when it gives one, the UTC time. */
export function graphicsLostText(info: GraphicsLostInfo, at: Date = new Date()): string {
  const time = at.toISOString().slice(11, 19);
  const why = info.reason ? `; reason ${info.reason}` : '';
  return `Graphics stopped at ${time}Z (${info.api}: ${info.message}${why}). Reload the page to continue.`;
}

/** The error notice's words: the API and the error's type, its message, the UTC time of this one, the count so far. */
export function graphicsErrorText(info: GraphicsErrorInfo, count: number, at: Date = new Date()): string {
  const time = at.toISOString().slice(11, 19);
  return `Graphics error at ${time}Z (${info.api} ${info.type || 'GPUError'}: ${info.message}), ${count} so far. Reload the page if the picture is wrong.`;
}

/** A message kept on one line and capped (a WebGPU validation message can run to pages). */
const MESSAGE_CAP = 200;
const oneLine = (s: string): string => s.replace(/\s*[|\r\n]+\s*/g, ' / ').trim();
const capped = (s: string): string => (s.length > MESSAGE_CAP ? `${s.slice(0, MESSAGE_CAP)}...` : s);
const clock = (iso: string): string => `${iso.slice(11, 19)}Z`;

/** The record for the performance line: "ok" with nothing recorded; else the first error, the count and the lost. */
export function graphicsText(r: GraphicsRecord): string {
  const parts: string[] = [];
  if (r.first) parts.push(`${r.first.api} ${r.first.type} x${r.count} "${capped(oneLine(r.first.message))}" first ${clock(r.first.at)}`);
  if (r.lost) parts.push(`lost ${clock(r.lost.at)} ${r.lost.api}: ${capped(oneLine(r.lost.message))}${r.lost.reason ? ` (${r.lost.reason})` : ''}`);
  return parts.length ? parts.join('; ') : 'ok';
}

function notice(doc: Document, mark: string, role: string, text: string): HTMLElement {
  doc.querySelector(`[${mark}]`)?.remove();
  const el = doc.createElement('div');
  el.setAttribute(mark, '');
  el.setAttribute('role', role);
  el.textContent = text;
  // The design system's notice panel gives the colour and the type (chrome_classes: no colour or type inline); only
  // where it sits is set here, one layout property at a time.
  el.className = 's2u-notice';
  el.style.position = 'fixed';
  el.style.left = '50%';
  el.style.top = mark === 'data-graphics-lost' ? '12px' : '64px';   // the error notice one row under the lost one
  el.style.transform = 'translateX(-50%)';
  el.style.zIndex = '2147483647';
  el.style.maxWidth = '90vw';
  el.style.margin = '0';
  el.style.textAlign = 'center';
  (doc.body ?? doc.documentElement).appendChild(el);
  return el;
}

/** One notice on the page, over everything, replacing an earlier one. */
export function showGraphicsLost(doc: Document, info: GraphicsLostInfo, at: Date = new Date()): HTMLElement {
  return notice(doc, 'data-graphics-lost', 'alert', graphicsLostText(info, at));
}

/** One error notice on the page (its own element, under the lost one), replacing an earlier one. */
export function showGraphicsError(doc: Document, info: GraphicsErrorInfo, count: number, at: Date = new Date()): HTMLElement {
  return notice(doc, 'data-graphics-error', 'status', graphicsErrorText(info, count, at));
}

/** Chains the renderer's own handler (three's: the console line and its lost flag), records the loss, then shows the notice. */
export function watchGraphicsLost(renderer: { onDeviceLost: (info: never) => void }, doc: Document | undefined = globalThis.document, now: () => Date = () => new Date()): void {
  if (typeof renderer.onDeviceLost !== 'function') return;   // a renderer without the hook (a test's fake) is left as it is
  const own = renderer.onDeviceLost.bind(renderer) as (info: GraphicsLostInfo) => void;
  renderer.onDeviceLost = ((info: GraphicsLostInfo) => {
    own(info);
    const at = now();
    record.lost = { api: info.api, message: info.message, reason: info.reason ?? null, at: at.toISOString() };
    // three's WebGL fallback reports a lost context through the same hook with `api: 'WebGL'` (#685's review P2-2): its own kind.
    tell(info.api === 'WebGL' ? 'webglcontextlost' : 'gpudevicelost', { api: info.api, message: info.message, detail: info.reason ?? null });
    if (doc) { try { showGraphicsLost(doc, info, at); } catch { /* a page being torn down */ } }
  }) as never;
}

/** The counts at which the notice is redrawn: every one of the first ten, then every hundredth (a failing pass errs every frame). */
const shown = (count: number): boolean => count <= 10 || count % 100 === 0;

/**
 * Chains the renderer's own uncaptured-error handler (three's: the console line), keeps the first error and counts every
 * one, tells the listeners, and shows the notice (redrawn at `shown` counts). A renderer without the hook is left alone.
 */
export function watchGraphicsErrors(renderer: { onError?: (info: never) => void }, doc: Document | undefined = globalThis.document, now: () => Date = () => new Date()): void {
  if (typeof renderer.onError !== 'function') return;
  const own = renderer.onError.bind(renderer) as (info: GraphicsErrorInfo | string) => void;
  renderer.onError = ((raw: GraphicsErrorInfo | string) => {
    own(raw);
    // three r186 hands the device's event as `{ api, type, message }` (its WebGPU backend); its typings and an older
    // three say a string -- either is read.
    const info: GraphicsErrorInfo = typeof raw === 'string' ? { api: 'WebGPU', message: raw } : raw;
    const at = now();
    record.count++;
    if (!record.first) record.first = { api: info.api, type: info.type || 'GPUError', message: info.message, at: at.toISOString() };
    tell('gpuuncapturederror', { api: info.api, message: info.message, detail: info.type ?? null });
    if (doc && shown(record.count)) { try { showGraphicsError(doc, record.first, record.count, at); } catch { /* a page being torn down */ } }
  }) as never;
}
