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
 *
 * GRAPHICS-RECOVERY (2026-11-22, the main controller's note on the graphics loss and the heap, item 1; the same
 * adaptation, product track -- it changes nothing the game does): a Shadow PC with a 1 GB GPU-process cap reported a
 * flood of out-of-memory errors about 1.2 s before the device was lost. three r186 names an uncaptured error by its
 * class (`GPUOutOfMemoryError`; an older reading said `OutOfMemoryError`, and both are taken). `isOutOfMemoryError` tells
 * them apart: the record keeps its own out-of-memory part (the first in full, a count) beside the generic count, and the
 * error notice and the performance line say "graphics memory ran out" so a player's report names it. The beacon's kind is
 * unchanged (`gpuuncapturederror`, the class as its detail): the central server's accepted kinds are not this module's.
 *
 * The switch (`graphicsrecovery`, a launch-settings row): `notice` (the notice and its buttons, nothing by itself) or
 * `reload` (GRAPHICS_RECOVERY_DEFAULT_ADAPTATION since 2026-11-25): on a lost device, or on an out-of-memory
 * flood (GRAPHICS_OOM_FLOOD_COUNT_ADAPTATION errors within GRAPHICS_OOM_FLOOD_WINDOW_MS_ADAPTATION) before the loss, the
 * match's own held "Reload and rejoin" (`setGraphicsLostAction`, LATER 896) runs by itself, once per page and at most once
 * per GRAPHICS_AUTO_RELOAD_MIN_INTERVAL_MS_ADAPTATION per tab and GRAPHICS_AUTO_RELOAD_MAX_PER_TAB_ADAPTATION in a tab's life
 * (sessionStorage stamps; no storage, no automatic reload),
 * and the notice says it is reloading. No action held (the front end's menus, the forge's editor, the test room): nothing
 * automatic. The Forge's own Play and its custom matches (`./forge/match`, through `./matchMount` `mountMatch`, which holds
 * the "Reload and rejoin") are left out by the owner's word (via the main controller, 2026-11-25): "Leave the Forge out".
 * They hold the notice (`holdGraphicsRecoveryNotice`) while mounted: a loss there shows the notice and its buttons and
 * nothing runs by itself, under the default and under an explicit `reload` alike. The
 * default is the owner's: `reload` by his word (via the main controller, 2026-11-25; H501), "the setting to reload on 3d
 * graphic loss should be on by default." -- it was `notice` before. Unset, empty or unknown is the default; only an
 * explicit `graphicsrecovery=notice` in the address keeps the notice alone.
 *
 * Not built: recover in place. three r186 cannot bring the same renderer back after a loss: its `_onDeviceLost` sets
 * `_isDeviceLost`, which nothing clears and which makes `render` and `compute` return at once (the animation loop keeps
 * ticking: `Animation.js` does not read the flag, review F4); its
 * `init` keeps its first `_initPromise` and `_initialized`, so it never runs again; and `WebGPUBackend.init` asks for its
 * adapter and device only there (`navigator.gpu.requestAdapter`, `adapter.requestDevice`, `device.lost`). Recovering in
 * place needs a new renderer (a new backend and device) on the canvas, every GPU resource the old one held made again --
 * the textures, geometries, render targets and pipelines, which is every map, model, effect and menu surface the match
 * uploaded -- and the match's loop and every user of the renderer (the menus' GPU frame, the glow, the post passes)
 * handed the new one. Until that exists the reload (keeping the seat, `./seatKeep`) is the way back.
 */
import { tabSettings } from './pageStore';
export interface GraphicsLostInfo { api: string; message: string; reason?: string | null }

/**
 * What three's `onError` hands the renderer: the API, the error's class name and its message. three r186 gives the
 * constructor's name (`GPUValidationError`, `GPUOutOfMemoryError`; `WebGPUBackend.init`'s `onuncapturederror`).
 */
export interface GraphicsErrorInfo { api: string; type?: string; message: string }

/**
 * The page's record of its graphics trouble: the first uncaptured error in full, the count of all, the out-of-memory ones
 * apart (GRAPHICS-RECOVERY: the first in full and their count; optional so an older record still reads), the lost device.
 */
export interface GraphicsRecord {
  first: { api: string; type: string; message: string; at: string } | null;
  count: number;
  oom?: { first: { api: string; type: string; message: string; at: string }; count: number } | null;
  lost: { api: string; message: string; reason: string | null; at: string } | null;
}

/** GRAPHICS-RECOVERY: an out-of-memory error, by its class name -- three r186's `GPUOutOfMemoryError`, or `OutOfMemoryError`. */
export function isOutOfMemoryError(info: Partial<GraphicsErrorInfo>): boolean {
  return info.type === 'GPUOutOfMemoryError' || info.type === 'OutOfMemoryError';
}

/** `gpudemoted` (WG-7, W5): this browser's Automatic was set to WebGL2 after a WebGPU error (`./graphicsDemotion`). */
export type GraphicsEventKind = 'gpuuncapturederror' | 'gpudevicelost' | 'webglcontextlost' | 'gpudemoted';

const record: GraphicsRecord = { first: null, count: 0, oom: null, lost: null };

/**
 * LATER 896 (product track, a browser adaptation; the controller's rulings of 2026-11-18): the match's own ways on from the
 * lost notice, registered by the mount at its attach and let go at its teardown -- "Reload and rejoin" (part 2: that reload
 * keeps the seat, `./seatKeep`, for `SEAT_HOLD_MS_ADAPTATION`'s 3 minutes; central `lobbyGameParkedResume.test.ts`) and
 * "Leave match" (the START menu's ABORT: the seat let go, the menus on the front end's own canvas). The notice's own words
 * stay; the lines say what the rejoin keeps and nothing about the body (its hold is shorter than a reload and a sign-in).
 */
export const GRAPHICS_LOST_LEAVE_LABEL = 'Leave match';
export const GRAPHICS_LOST_REJOIN_LABEL = 'Reload and rejoin';
export const GRAPHICS_LOST_REJOIN_LINES: readonly string[] = [
  'Reload and rejoin keeps your seat in this game for 3 minutes: sign in again and join the same game.',
  'If sign-in says you are already signed in, wait a few seconds and try again.',
];
export interface GraphicsLostButton { label: string; run: () => void }
export interface GraphicsLostAction { lines?: readonly string[]; actions: readonly GraphicsLostButton[] }
let lostAction: GraphicsLostAction | null = null;
/** The action the lost notice offers from now on (the newest registration); returns its removal (only its own). */
export function setGraphicsLostAction(a: GraphicsLostAction, doc: Document | undefined = globalThis.document): () => void {
  lostAction = a;
  // Its review's F1: a loss before the registration (in the load, or the lobby's prepare) already showed a notice with
  // none -- redrawn now with the record's own loss, so that match's notice carries the buttons too.
  const lost = record.lost;
  if (doc && lost && doc.querySelector('[data-graphics-lost]')) {
    try { showGraphicsLost(doc, { api: lost.api, message: lost.message, reason: lost.reason }, new Date(lost.at)); } catch { /* a page being torn down */ }
  }
  return () => {
    if (lostAction !== a) return;
    lostAction = null;
    // Its review's F2: the match's end takes its notice away -- no stale "Graphics stopped" and spent buttons over the menus.
    try { doc?.querySelector('[data-graphics-lost]')?.remove(); } catch { /* a page being torn down */ }
  };
}
const listeners = new Set<(kind: GraphicsEventKind, info: { api: string; message: string; detail: string | null }) => void>();

/** The record, a copy. */
export function graphicsRecord(): GraphicsRecord {
  const oom = record.oom ? { first: { ...record.oom.first }, count: record.oom.count } : null;
  return { first: record.first ? { ...record.first } : null, count: record.count, oom, lost: record.lost ? { ...record.lost } : null };
}

/** Tests only: the record emptied (and the page's automatic reload, as a new page's). */
export function resetGraphicsRecordForTest(): void {
  record.first = null; record.count = 0; record.oom = null; record.lost = null; listeners.clear(); lostAction = null;
  oomTimes.length = 0; autoReloadRan = false; noticeHolds = 0;
}

/** A listener for every lost device and uncaptured error from here on (the client error beacon's); returns its removal. */
export function onGraphicsEvent(fn: (kind: GraphicsEventKind, info: { api: string; message: string; detail: string | null }) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function tell(kind: GraphicsEventKind, info: { api: string; message: string; detail: string | null }): void {
  for (const fn of listeners) { try { fn(kind, info); } catch { /* a listener's own failure never reaches the renderer */ } }
}

/** WG-7, W5: the demotion told to the same listeners (the beacon's), as the watchers tell theirs. */
export function tellGraphicsDemoted(reason: string): void { tell('gpudemoted', { api: 'WebGPU', message: reason, detail: null }); }

/** The notice's words: the API, the browser's message, its reason when it gives one, the UTC time. */
export function graphicsLostText(info: GraphicsLostInfo, at: Date = new Date()): string {
  const time = at.toISOString().slice(11, 19);
  const why = info.reason ? `; reason ${info.reason}` : '';
  return `Graphics stopped at ${time}Z (${info.api}: ${info.message}${why}). Reload the page to continue.`;
}

/**
 * The error notice's words: the API and the error's type, its message, the UTC time of this one, the count so far; an
 * out-of-memory error says so plainly (GRAPHICS-RECOVERY).
 */
export function graphicsErrorText(info: GraphicsErrorInfo, count: number, at: Date = new Date()): string {
  const time = at.toISOString().slice(11, 19);
  if (isOutOfMemoryError(info)) return `Graphics memory ran out at ${time}Z (${info.api} ${info.type}: ${info.message}), ${count} so far. Reload the page if the picture is wrong.`;
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
  if (r.oom) parts.push(`${r.oom.first.api} graphics memory ran out x${r.oom.count} "${capped(oneLine(r.oom.first.message))}" first ${clock(r.oom.first.at)}`);
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
  // the error notice one row under the lost one, the demotion's (WG-7) one under that
  el.style.top = mark === 'data-graphics-lost' ? '12px' : mark === 'data-graphics-error' ? '64px' : '116px';
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
  const el = notice(doc, 'data-graphics-lost', 'alert', graphicsLostText(info, at));
  const action = lostAction;
  if (action) {                                                // LATER 896: the match's ways on, one press for all
    for (const line of action.lines ?? []) { const p = doc.createElement('p'); p.textContent = line; el.append(p); }
    const made: HTMLButtonElement[] = [];
    for (const a of action.actions) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 's2u-chip';
      button.setAttribute('data-graphics-lost-action', '');
      button.textContent = a.label;
      button.addEventListener('click', () => {
        if (button.disabled) return;
        for (const b of made) b.disabled = true;
        try { a.run(); } catch { /* the action's own failure: the buttons stay spent */ }
      });
      made.push(button);
      el.append(' ', button);
    }
  }
  return el;
}

/** One error notice on the page (its own element, under the lost one), replacing an earlier one. */
export function showGraphicsError(doc: Document, info: GraphicsErrorInfo, count: number, at: Date = new Date()): HTMLElement {
  return notice(doc, 'data-graphics-error', 'status', graphicsErrorText(info, count, at));
}

/** WG-7, W5: the demotion's words -- what was saved and the reload that applies it (the lost notice's own prompt). */
export const GRAPHICS_DEMOTED_TEXT = 'Graphics mode set to WebGL2 after a WebGPU error. Reload the page to continue.';

/** WG-7, W5: one demotion notice on the page (its own element, under the error one), replacing an earlier one. */
export function showGraphicsDemoted(doc: Document): HTMLElement {
  return notice(doc, 'data-graphics-demoted', 'alert', GRAPHICS_DEMOTED_TEXT);
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
    autoReload(at, doc);                                       // GRAPHICS-RECOVERY: only under graphicsrecovery=reload
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
    const oom = isOutOfMemoryError(info);
    if (oom) {
      if (record.oom) record.oom.count++;
      else record.oom = { first: { api: info.api, type: info.type ?? 'GPUOutOfMemoryError', message: info.message, at: at.toISOString() }, count: 1 };
    }
    tell('gpuuncapturederror', { api: info.api, message: info.message, detail: info.type ?? null });
    // GRAPHICS-RECOVERY: once memory has run out the notice names that, redrawn at the out-of-memory count's own steps
    const o = record.oom;
    if (doc && (oom && o ? shown(o.count) : shown(record.count))) {
      try { if (o) showGraphicsError(doc, o.first, o.count, at); else showGraphicsError(doc, record.first, record.count, at); } catch { /* a page being torn down */ }
    }
    if (oom) {
      const ms = at.getTime();
      oomTimes.push(ms);
      while (oomTimes.length > 0 && ms - oomTimes[0]! >= GRAPHICS_OOM_FLOOD_WINDOW_MS_ADAPTATION) oomTimes.shift();
      if (oomTimes.length >= GRAPHICS_OOM_FLOOD_COUNT_ADAPTATION) autoReload(at, doc);
    }
  }) as never;
}

/** GRAPHICS-RECOVERY: the switch's values; `notice` is the notice alone, `reload` the automatic reload (the default). */
export type GraphicsRecoveryMode = 'notice' | 'reload';
/** The launch-settings key (`./launchSettings/params`). */
export const GRAPHICS_RECOVERY_PARAM = 'graphicsrecovery';
/**
 * The adaptation's default, the owner's: `reload` -- his word (via the main controller, 2026-11-25; H501): "the setting
 * to reload on 3d graphic loss should be on by default." (It was `notice`.) An explicit `notice` is never overridden.
 */
export const GRAPHICS_RECOVERY_DEFAULT_ADAPTATION: GraphicsRecoveryMode = 'reload';
/** Out-of-memory errors within the window that count as a flood (an adaptation; the Shadow PC's came ~1.2 s before its loss). */
export const GRAPHICS_OOM_FLOOD_COUNT_ADAPTATION = 3;
export const GRAPHICS_OOM_FLOOD_WINDOW_MS_ADAPTATION = 2000;
/** At most one automatic reload a tab in this long (an adaptation): never a loop of reloads. */
export const GRAPHICS_AUTO_RELOAD_MIN_INTERVAL_MS_ADAPTATION = 10 * 60 * 1000;
/** The tab's storage key (`./pageStore` `tabSettings`) holding the last automatic reload's time (ms since the epoch). */
export const GRAPHICS_AUTO_RELOAD_STAMP_KEY = 's2u.graphicsAutoReloadAt';
/**
 * At most this many automatic reloads in a tab's life, however far apart (an adaptation; review F2): a page that keeps
 * losing its graphics stops reloading itself and leaves the notice's two buttons to the player.
 */
export const GRAPHICS_AUTO_RELOAD_MAX_PER_TAB_ADAPTATION = 3;
/** The tab's storage key (`./pageStore` `tabSettings`) counting its automatic reloads. */
export const GRAPHICS_AUTO_RELOAD_COUNT_KEY = 's2u.graphicsAutoReloadCount';
/** The line the notice gains when the reload runs by itself. */
export const GRAPHICS_RECOVERY_RELOADING_TEXT = 'Graphics recovery: reloading and rejoining by itself.';

/** The switch, read from the page's address; anything but `reload` or `notice` (absent, empty, unknown) is the default. */
export function graphicsRecoveryMode(search: string = globalThis.location?.search ?? ''): GraphicsRecoveryMode {
  let v: string | null = null;
  try { v = new URLSearchParams(search).get(GRAPHICS_RECOVERY_PARAM); } catch { /* no address */ }
  return v === 'reload' || v === 'notice' ? v : GRAPHICS_RECOVERY_DEFAULT_ADAPTATION;
}

/** The recent out-of-memory errors' times (ms), inside the flood window. */
const oomTimes: number[] = [];
/** This page has run its automatic reload (once a page, whatever the stamp says). */
let autoReloadRan = false;

/** The holds on the notice (`holdGraphicsRecoveryNotice`): while any is taken, nothing reloads by itself. */
let noticeHolds = 0;
/**
 * The owner's word (via the main controller, 2026-11-25): "Leave the Forge out". The Forge's own mounts (its Play and its
 * custom matches, `./forge/match`) take this hold for as long as they are mounted: a loss there shows the notice and its
 * buttons and nothing runs by itself, whatever the switch says (an explicit `reload` too). Returns its release (once).
 */
export function holdGraphicsRecoveryNotice(): () => void {
  noticeHolds += 1;
  let released = false;
  return () => { if (released) return; released = true; noticeHolds -= 1; };
}
/** Whether a Forge mount holds the notice now. */
export function graphicsRecoveryNoticeHeld(): boolean { return noticeHolds > 0; }

/**
 * Under `reload`, with the match's lost action held and its "Reload and rejoin" among it: the tab's stamp read and
 * written (a storage failure, or a stamp inside the interval, and nothing runs), the notice's line, then the rejoin.
 */
function autoReload(at: Date, doc: Document | undefined): void {
  if (autoReloadRan || noticeHolds > 0 || graphicsRecoveryMode() !== 'reload') return;
  const rejoin = lostAction?.actions.find((a) => a.label === GRAPHICS_LOST_REJOIN_LABEL);
  if (!rejoin) return;
  const ms = at.getTime();
  // The tab's storage through the page's settings path (`./pageStore` `tabSettings`, both keys in its inventory): a read
  // or a write that fails -- no storage, a blocked one -- and nothing runs (no stamp: no automatic reload).
  const lastRead = tabSettings.read(GRAPHICS_AUTO_RELOAD_STAMP_KEY);
  if (!lastRead.ok) return;
  const last = Number(lastRead.value);
  if (last > 0 && ms - last < GRAPHICS_AUTO_RELOAD_MIN_INTERVAL_MS_ADAPTATION) return;
  const countRead = tabSettings.read(GRAPHICS_AUTO_RELOAD_COUNT_KEY);
  if (!countRead.ok) return;
  const count = Number(countRead.value) || 0;
  if (count >= GRAPHICS_AUTO_RELOAD_MAX_PER_TAB_ADAPTATION) return;   // the tab's lifetime cap
  if (!tabSettings.set(GRAPHICS_AUTO_RELOAD_STAMP_KEY, String(ms)).ok) return;
  if (!tabSettings.set(GRAPHICS_AUTO_RELOAD_COUNT_KEY, String(count + 1)).ok) return;
  autoReloadRan = true;
  if (doc) {
    try {
      const host = doc.querySelector('[data-graphics-lost]') ?? doc.querySelector('[data-graphics-error]');
      if (host) { const p = doc.createElement('p'); p.setAttribute('data-graphics-reloading', ''); p.textContent = GRAPHICS_RECOVERY_RELOADING_TEXT; host.append(p); }
    } catch { /* a page being torn down */ }
  }
  try { rejoin.run(); } catch { /* the action's own failure */ }
}
