import { discIdentity, type DiscIdentity } from '@s2u/archive';
import {
  canContinueFromDisc, extractHooks, extractHtml, extractPress, extractStart, extractView, type ExtractAct, type ExtractEvent, type ExtractView,
} from './console/render/extract';
import { padFrame, type Held, type PadLike } from './console/input';
import type { Button } from './console/state';
import type { DiscExtractRecord, ExtractEnv, ExtractHooks, ExtractionState } from './discExtract';
import { extractionState, storageOf, storedExtraction } from './discExtractRecord';
import { folderRequestFromInput, openFrontEndDisc, watchDiscPrompt } from './discPrompt';
import { assetSourceFor, type DiscRequest, type SourceRequest, type StoredRequest } from './discSource';
import { sameIdentity } from './discStored';

/**
 * **The start's one decision: the disc, or the disc kept in this browser** (front-end plan
 * `docs/plans/2026-10-16-front-end-pad-and-disc.md`, DX-3, FI.R6, FI.R7; the merge controller's ruling of 2026-10-16,
 * agreed with the online seat). `discForStart(doc)` is the one place a start decides where the game's files come from,
 * and both entries call it: the console launcher's START (`./console/adapters/disc` `start`, through `./console/adapters/
 * launch`) and the online seat's invite entry (`main/online?invite=...`, which skips the loader; that seat writes its own
 * line in `./frontEnd`).
 *
 * - The kept extraction whole (`./discExtractRecord` `extractionState`): `{ kind: 'stored' }` at once, with no UI.
 * - Otherwise: the chooser asks for the disc (the console's own, or -- where there is no console -- a small dialog this
 *   module mounts, `domChooser`), then the popover (`runExtraction`, over the console's overlay or this module's own,
 *   `domPopover`) copies its read set into storage; it resolves with the stored request once that is done, or with the
 *   disc's own request when the player goes on from the disc. `evicted` is `none` with one line more.
 * - Called again, or twice at once, it is safe: a call under way is shared, and -- DX-3's review F6 -- a later call in
 *   the same document answers what the first did (the disc the player went on from is not asked for again), unless
 *   `remember: false` (the console's START, which keeps its own state of the disc and the extraction).
 *
 * The rendering seam both use is `ExtractPopover` (show a view, close, hear its acts) and `DiscChooser`. The extraction
 * itself (`./discExtract`) is imported at its first need (DX-2's review F5): a start already `whole` loads none of it.
 *
 * A **browser adaptation** (FI.R2, OT.R53, the product track) with no original: the original reads its own disc. Nothing
 * the game does changes, and the disc never leaves the browser (DA.R3).
 */

/** The popover's rendering seam: the console's overlay (`./console/adapters/disc`) or this module's own (`domPopover`). */
export interface ExtractPopover {
  /** Draws `view` (the focus row it shows is the popover's own while the phase is the same). */
  show(view: ExtractView): void;
  /** Takes it away. */
  close(): void;
  /** The popover's answers to presses and clicks (`extractPress`'s acts); answers the detach. */
  onAct(listener: (act: ExtractAct) => void): () => void;
}

/** What the chooser answers: the disc chosen and validated, and whether the player already chose to go on from it. */
export interface DiscChoice { readonly request: DiscRequest; readonly fromDisc?: boolean }

/** The chooser's seam: asks for the disc (`state` the kept extraction's; `refusal` why the last disc would not do). */
export interface DiscChooser {
  choose(state: ExtractionState, refusal: string): Promise<DiscChoice>;
}

/** How long the popover shows EXTRACTED before it closes: long enough to be read. Ours, chosen (no original). */
export const EXTRACT_DONE_HOLD_MS_ADAPTATION = 1200;

/** `runExtraction`'s seams (a test passes fakes). */
export interface RunDeps {
  env?: ExtractEnv;
  /** The extraction; absent, `./discExtract` `extractDisc`, imported at the first run. */
  extract?: (request: DiscRequest, hooks: ExtractHooks, env: ExtractEnv) => Promise<DiscExtractRecord>;
  /** The room the browser says is left for this page (FI.R7); absent, its `estimate()`. */
  room?: () => Promise<number | null>;
  /** `EXTRACT_DONE_HOLD_MS_ADAPTATION` by default. */
  doneHold?: number;
}

/** How a run ended: done, the player going on from the disc, or a disc refused (closed: the chooser asks again). */
export type ExtractOutcome =
  | { readonly kind: 'done'; readonly record: DiscExtractRecord }
  | { readonly kind: 'continue'; readonly error: unknown }
  | { readonly kind: 'close'; readonly error: unknown };

/** The room left for this page: the storage's `quota - usage`, or null when the browser does not say. */
export async function roomLeft(env: ExtractEnv = {}): Promise<number | null> {
  const storage = storageOf(env);
  try {
    const e = storage && typeof storage.estimate === 'function' ? await storage.estimate() : null;
    return e && typeof e.quota === 'number' ? Math.max(0, e.quota - (e.usage ?? 0)) : null;
  } catch {
    return null;
  }
}

/**
 * Extracts `request`'s read set behind `popover`: DX-1's hooks onto the view (`extractHooks`), the room from
 * `estimate()` at the start, the plan and a refusal; Circle cancels (what is done is kept); on a refusal, retry runs it
 * again (resuming), continue goes on from the disc, close (a disc refused, F4) gives it back to the chooser. On done the
 * popover shows EXTRACTED a moment, then closes.
 */
export async function runExtraction(request: DiscRequest, popover: ExtractPopover, deps: RunDeps = {}): Promise<ExtractOutcome> {
  const env = deps.env ?? {};
  const room = deps.room ?? (() => roomLeft(env));
  let view = extractStart();
  const dispatch = (e: ExtractEvent): void => { view = extractView(view, e); popover.show(view); };
  const roomNow = (): Promise<void> => room().then((bytes) => { dispatch({ kind: 'room', bytes }); }, () => undefined);
  let abort: AbortController | null = null;
  let answer: ((act: ExtractAct) => void) | null = null;
  const detach = popover.onAct((act) => {
    if (act === 'cancel') { abort?.abort(); return; }
    if (act === 'continue' && !canContinueFromDisc(view)) return;
    answer?.(act);
  });
  try {
    const extract = deps.extract ?? (await import('./discExtract')).extractDisc;
    for (;;) {
      abort = new AbortController();
      dispatch({ kind: 'start' });
      void roomNow();
      const hooks = extractHooks(dispatch, abort.signal);
      try {
        const record = await extract(request, { ...hooks, onPlan: (files, total, backend) => { hooks.onPlan?.(files, total, backend); void roomNow(); } }, env);
        abort = null;
        if (view.phase !== 'done') dispatch({ kind: 'done', record });
        await roomNow();
        const hold = deps.doneHold ?? EXTRACT_DONE_HOLD_MS_ADAPTATION;
        if (hold > 0) await new Promise((r) => setTimeout(r, hold));
        return { kind: 'done', record };
      } catch (e) {
        abort = null;
        await roomNow();
        dispatch({ kind: 'error', error: e });
        const act = await new Promise<ExtractAct>((resolve) => { answer = resolve; });
        answer = null;
        if (act === 'retry') continue;
        if (act === 'continue') return { kind: 'continue', error: e };
        return { kind: 'close', error: e };
      }
    }
  } finally {
    detach();
    popover.close();
  }
}

/** The stored request for the kept extraction `record`: its identity, the disc open on this visit when it is that disc. */
export function storedRequestOf(record: Pick<DiscExtractRecord, 'identity'>, disc: DiscRequest | null, fallback?: StoredRequest['fallback']): StoredRequest {
  return { kind: 'stored', identity: { ...record.identity }, ...(disc ? { disc } : {}), ...(fallback ? { fallback } : {}) };
}

/** `discForStart`'s seams: the console passes its own; the invite entry passes none (this module's DOM). */
export interface DiscStartDeps extends RunDeps {
  chooser?: DiscChooser;
  popover?: ExtractPopover;
  /** The disc open on this visit, already checked to be the kept extraction's disc: the stored request's fallback. */
  present?: () => DiscRequest | null;
  /** The kept extraction's state; absent, `extractionState(env)`. */
  state?: (env: ExtractEnv) => Promise<ExtractionState>;
  /** F6: answer a later call in this document as the first was answered (default true); false: decide again each call. */
  remember?: boolean;
}

const under = new WeakMap<Document, Promise<SourceRequest>>();
/** F6: the visit's answer, per document. */
const answered = new WeakMap<Document, SourceRequest>();

/** The start's disc (see the module's header): resolves with `{ kind: 'stored' }` or the disc's own request. */
export function discForStart(doc: Document, deps: DiscStartDeps = {}): Promise<SourceRequest> {
  const remember = deps.remember !== false;
  const known = remember ? answered.get(doc) : undefined;
  if (known) return Promise.resolve(known);
  const running = under.get(doc);
  if (running) return running;
  const made = startOf(doc, deps).then((r) => { if (remember) answered.set(doc, r); return r; }).finally(() => { under.delete(doc); });
  under.set(doc, made);
  return made;
}

const words = (e: unknown): string => (e instanceof Error ? e.message : String(e));

async function startOf(doc: Document, deps: DiscStartDeps): Promise<SourceRequest> {
  const env = deps.env ?? {};
  let refusal = '';
  let chooser: DiscChooser | null = deps.chooser ?? null;
  let popover: ExtractPopover | null = deps.popover ?? null;
  for (;;) {
    const state = await (deps.state ?? extractionState)(env);
    if (state === 'whole') {
      const record = await storedExtraction(env.records);
      if (record) return storedRequestOf(record, deps.present?.() ?? null);
    }
    chooser ??= domChooser(doc);
    const picked = await chooser.choose(state, refusal);
    if (picked.fromDisc) return picked.request;
    popover ??= domPopover(doc);
    const out = await runExtraction(picked.request, popover, deps);
    if (out.kind === 'done') return storedRequestOf(out.record, picked.request);
    if (out.kind === 'continue') return picked.request;
    refusal = words(out.error);
  }
}

/**
 * The forge's start order (FG.R12 with DX-3): the kept extraction when whole -- with the launcher's stored copy (DA-8), or
 * else the remembered disc whose permission is granted (DA-7), as its fallback for what the read set leaves out (the
 * paths outside the set: `fallback: 'outside'`; the campaign maps are in the set since FI.R6's second revision) when that disc is the same one -- before the copy, before the
 * remembered disc; null: none of them, the forge's card asks.
 */
export interface ForgeStartParts {
  state(): Promise<ExtractionState>;
  record(): Promise<Pick<DiscExtractRecord, 'identity'> | null>;
  copy(): Promise<DiscRequest | null>;
  remembered(): Promise<DiscRequest | null>;
  /** A disc's identity (`SYSTEM.CNF`), or null when it will not say; absent, `discIdentity` over it. */
  identity?(disc: DiscRequest): Promise<DiscIdentity | null>;
}

export async function forgeDiscStart(parts: ForgeStartParts): Promise<SourceRequest | null> {
  const identity = parts.identity ?? ((disc: DiscRequest) => discIdentity(assetSourceFor(disc)).catch(() => null));
  if ((await parts.state()) === 'whole') {
    const record = await parts.record();
    if (record) {
      // DX-3's review F4: the copy when it is this disc, else the remembered disc when that one is.
      const same = async (disc: DiscRequest | null): Promise<DiscRequest | null> => {
        const id = disc ? await identity(disc) : null;
        return disc && id && sameIdentity(id, record.identity) ? disc : null;
      };
      const disc = (await same(await parts.copy())) ?? (await same(await parts.remembered()));
      return storedRequestOf(record, disc, 'outside');
    }
  }
  return (await parts.copy()) ?? (await parts.remembered());
}

/* ---------- this module's own DOM, where there is no console (the invite entry) ---------- */

/** The DOM popover's and chooser's hosts (one each, over the page). */
export const DISC_START_POPOVER_ID = 's2u-extract';
export const DISC_START_CHOOSER_ID = 's2u-disc-start';

/** Its pad: the standard mapping's presses (`./console/input` `padFrame`), read once an animation frame. */
export interface PadReader { read(): readonly PadLike[] }
const pagePads = (win: Window | null): PadReader => ({
  read: () => {
    try { return Array.from(win?.navigator.getGamepads?.() ?? []).filter((p): p is Gamepad => !!p?.connected) as unknown as PadLike[]; } catch { return []; }
  },
});

/** A pad poll on `win`'s animation frames, each press to `press`; answers the stop. */
function pollPads(win: Window | null, pads: PadReader, press: (b: Button) => void): () => void {
  if (!win || typeof win.requestAnimationFrame !== 'function') return () => {};
  const held: Held = {};
  let id = 0;
  const frame = (now: number): void => { for (const b of padFrame(pads.read(), held, now)) press(b); id = win.requestAnimationFrame(frame); };
  id = win.requestAnimationFrame(frame);
  return () => { win.cancelAnimationFrame(id); };
}

/** The DOM popover (`extractHtml` in a host of its own): clicks, and the pad, read as the console reads them. */
export type DomPopover = ExtractPopover & { press(b: Button): void; view(): ExtractView | null };

export function domPopover(doc: Document, pads?: PadReader): DomPopover {
  const win = doc.defaultView;
  let host: HTMLElement | null = null;
  let shown: ExtractView | null = null;
  let stopPads: (() => void) | null = null;
  const listeners = new Set<(act: ExtractAct) => void>();
  const draw = (): void => { if (host && shown) host.innerHTML = extractHtml(shown); };
  const press = (b: Button): void => {
    if (!shown) return;
    const r = extractPress(shown, b);
    shown = r.view;
    draw();
    if (r.act) for (const l of [...listeners]) l(r.act);
  };
  const onClick = (e: Event): void => {
    const t = (e.target as Element | null)?.closest?.<HTMLElement>('[data-act]');
    if (!t || !shown) return;
    if (t.dataset.act === 'extract') { shown = { ...shown, row: t.dataset.i === '1' ? 1 : 0 }; press('cross'); }
    else if (t.dataset.act === 'press' && t.dataset.b) press(t.dataset.b as Button);
  };
  return {
    show(view) {
      shown = shown && shown.phase === view.phase ? { ...view, row: shown.row } : view;
      if (!host) {
        host = doc.createElement('div');
        host.id = DISC_START_POPOVER_ID;
        host.addEventListener('click', onClick);
        doc.body.append(host);
        stopPads = pollPads(win, pads ?? pagePads(win), press);
      }
      draw();
    },
    close() {
      stopPads?.();
      stopPads = null;
      host?.remove();
      host = null;
      shown = null;
    },
    onAct(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    press,
    view: () => shown,
  };
}

/** The words of the DOM chooser (DA.R7: what is kept, where, and how to delete it). */
export const CHOOSER_LEAD = 'The game reads your own SOCOM II disc: choose its image (.iso) or a folder of its files. Its files are copied once into this browser\'s storage, and later starts read them from there. Nothing is uploaded; the launcher\'s Options delete them.';
/** The `evicted` line (DX-3: the browser cleared the disc it kept). */
export const EVICTED_LINE = 'This browser cleared the disc it kept: choose it again.';

/**
 * The DOM chooser: a dialog with the image's and the folder's choosers (a browser opens a file chooser only inside a
 * click or a tap, never for a pad button: the pointer's, as the forge's card says) and the window as a drop target
 * (`./discPrompt` `watchDiscPrompt`); a disc is validated by `openFrontEndDisc` (DA.R8), its refusal said in the reader's
 * words and asked again.
 */
export function domChooser(doc: Document, open: (request: DiscRequest) => Promise<unknown> = openFrontEndDisc): DiscChooser {
  return {
    choose: (state, refusal) => new Promise<DiscChoice>((resolve) => {
      const host = doc.createElement('div');
      host.id = DISC_START_CHOOSER_ID;
      const say = (line: string): void => { const p = host.querySelector<HTMLElement>('[data-disc-start="error"]'); if (p) { p.textContent = line; p.hidden = !line; } };
      host.innerHTML = `<div class="cx-scrim" data-key="disc-start"><div class="cx-dialog" role="dialog" aria-modal="true" aria-labelledby="ds-title">
      <h2 class="cx-dialog__title" id="ds-title">YOUR DISC</h2>
      <p class="cx-dialog__lead">${CHOOSER_LEAD}</p>
      ${state === 'evicted' ? `<p class="cx-dialog__note" data-disc-start="evicted">${EVICTED_LINE}</p>` : ''}
      <p class="cx-field__error" role="alert" data-disc-start="error"${refusal ? '' : ' hidden'}></p>
      <button type="button" class="cx-toggle is-focused" data-disc-start="image"><span>Choose disc image</span></button>
      <button type="button" class="cx-toggle" data-disc-start="folder"><span>Choose disc folder</span></button>
      <input type="file" hidden data-disc-start="image-input">
      <input type="file" webkitdirectory hidden data-disc-start="folder-input">
    </div></div>`;
      doc.body.append(host);
      say(refusal);
      let mine = 0;
      const take = (request: DiscRequest): void => {
        const call = ++mine;
        say('');
        open(request).then(() => {
          if (call !== mine) return;
          detach();
          host.remove();
          resolve({ request });
        }, (e: unknown) => { if (call === mine) say(words(e)); });
      };
      const image = host.querySelector<HTMLInputElement>('[data-disc-start="image-input"]')!;
      const folder = host.querySelector<HTMLInputElement>('[data-disc-start="folder-input"]')!;
      image.addEventListener('change', () => { const f = image.files?.[0]; image.value = ''; if (f) take({ kind: 'iso', file: f }); });
      folder.addEventListener('change', () => { const r = folderRequestFromInput(folder.files); folder.value = ''; if (r) take(r); });
      host.querySelector('[data-disc-start="image"]')!.addEventListener('click', () => { image.click(); });
      host.querySelector('[data-disc-start="folder"]')!.addEventListener('click', () => { folder.click(); });
      const detach = watchDiscPrompt(doc, host, (file) => { take({ kind: 'iso', file }); }, take);
    }),
  };
}
