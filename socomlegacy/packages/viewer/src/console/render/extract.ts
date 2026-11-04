import type { DiscExtractFile, DiscExtractReason, DiscExtractRecord, ExtractHooks } from '../../discExtract';
import type { ExtractBackend } from '../../discExtractStore';
import { STILL_FROM_DISC } from '../../discExtractWords';
import { btn, esc } from '../icons';
import { dialogHeadHtml } from './close';
import type { Button } from '../state';

/**
 * **The extraction's popover** (front-end plan `docs/plans/2026-10-16-front-end-pad-and-disc.md`, DX-2, FI.R7; the owner's
 * DISC-EXTRACT: "Add a new popover animation that shows the extraction of assets to a storage mechanism we have access to
 * and can read from"): the console's dialog over the page while DX-1's `extractDisc` copies the disc's read set into the
 * browser's storage. It shows the file in hand by its disc path, the files done of the files to do, the bytes done of the
 * bytes, a determinate bar, where the files are kept (the backend in plain words, and the room the browser says is left
 * when the page has read it), that the disc stays in this browser (DA.R3), and Circle's cancel, which keeps what is done.
 * Its animation -- a disc that turns, file chips passing into a storage box that fills with the bar -- is the design
 * system's (`shared/ds/components.css`, part I, 1.8.0): CSS keyframes only, standing still under reduced motion.
 *
 * Pure: `extractHtml` draws an `ExtractView`; `extractView` folds DX-1's hooks (`extractHooks`, one event each) into one;
 * `extractPress` reads a pad press on it. The page (DX-3: `../../discStart`, the console's disc adapter) keeps the view in
 * `ConsoleState.extract`, opens the overlay `extract`, and does what `extractPress` answers. A **browser adaptation** with
 * no original (OT.R28, OT.R53: the product track): the original reads its own disc; nothing the game does changes. The
 * look is the Briefing's console layer, not the original's loading screen (`../../loadingPanel`).
 *
 * DX-2's review, folded in DX-3: F1 the file in hand counts done when the progress reaches its size (the plan's sizes
 * kept in the view); F2 a check (`verifyExtraction`) keeps its run through a stop, in its own words, and its retry checks
 * again; F3 `unavailable`'s lead is neutral (DX-1's kept store may only be closed "just now"); F4 a `refused` disc has no
 * "from the disc" line and no continue, Circle closes; F5 the module loads none of the extraction (its words from
 * `../../discExtractWords`, its types erased), so a launcher visit already `whole` does not pay for it.
 *
 * MODAL-CLOSE (OT.R62): while it runs or stands refused its head carries the console's close button (`./close`), Circle's
 * press -- the cancel, the way on from the disc, or a refused disc's close; done, none (Circle does nothing then).
 */

export type ExtractPhase = 'plan' | 'copy' | 'verify' | 'done' | 'error';
/** What the popover is showing: the extraction (`extractDisc`) or the check (`verifyExtraction`). */
export type ExtractRun = 'extract' | 'verify';

/** The popover's state: what DX-1's hooks have said so far. */
export interface ExtractView {
  /** `plan` until the first file (the checks, then the plan), `copy` while files are written, `verify` while
   *  `verifyExtraction` re-hashes, `done`, or `error` (a refusal or a cancel, `error` its words). */
  readonly phase: ExtractPhase;
  /** The file in hand, by its disc path ('' none). */
  readonly file: string;
  /** Its place in the plan (from 0). */
  readonly index: number;
  /** The files to do: the plan's length (0 before the plan). */
  readonly count: number;
  /** The files done: those the plan found done (a resume), and each written since. */
  readonly done: number;
  readonly doneBytes: number;
  readonly totalBytes: number;
  /** The store the files go to (null before the plan). */
  readonly backend: ExtractBackend | null;
  /** The bytes the browser says are left for this page (FI.R7's "room left"; `navigator.storage.estimate()`), or null. */
  readonly room: number | null;
  /** On `error`: the refusal's reason and DX-1's words for it. */
  readonly error?: { readonly reason: DiscExtractReason; readonly words: string };
  /** On `error`: the focused button, 0 retry, 1 close or eligible disc fallback (the first is focused initially). */
  readonly row: 0 | 1;
  /** F2: the run shown, kept through an error (absent: the extraction). */
  readonly run?: ExtractRun;
  /** Failed extraction attempts in this selection/retry flow; cancellation and checks do not count. */
  readonly failures?: number;
  /** F1: each planned file's size, by path (from the plan). */
  readonly sizes?: Readonly<Record<string, number>>;
  /** F1: where the file in hand ends in the bytes, and whether it is counted done already. */
  readonly fileEnd?: number;
  readonly fileDone?: boolean;
}

/** What changes the popover: DX-1's hooks (`plan`, `file`, `progress`, `done`), `verifyExtraction`'s progress, the room,
 *  a refusal (`extractDisc`'s rejection), and a new run (`start`: a retry; `run` the check's, F2). */
export type ExtractEvent =
  | { readonly kind: 'start'; readonly run?: ExtractRun }
  | { readonly kind: 'plan'; readonly files: readonly DiscExtractFile[]; readonly totalBytes: number; readonly backend: ExtractBackend }
  | { readonly kind: 'file'; readonly path: string; readonly index: number; readonly count: number }
  | { readonly kind: 'progress'; readonly doneBytes: number; readonly totalBytes: number }
  | { readonly kind: 'verify'; readonly doneBytes: number; readonly totalBytes: number }
  | { readonly kind: 'room'; readonly bytes: number | null }
  | { readonly kind: 'done'; readonly record: DiscExtractRecord }
  | { readonly kind: 'error'; readonly error: unknown };

/** The view before anything is known: the checks running. */
export const extractStart = (run: ExtractRun = 'extract'): ExtractView =>
  ({ phase: run === 'verify' ? 'verify' : 'plan', file: '', index: 0, count: 0, done: 0, doneBytes: 0, totalBytes: 0, backend: null, room: null, row: 0, run });

const bytesHeld = (done: number, total: number): { doneBytes: number; totalBytes: number } => {
  const t = Math.max(0, total);
  return { doneBytes: Math.max(0, Math.min(done, t)), totalBytes: t };
};

/** F5: DX-1's `DiscExtractError` by its shape (its class is not loaded here): an `Error` named so, with a reason. */
function extractError(e: unknown): { reason: DiscExtractReason; message: string } | null {
  if (!(e instanceof Error) || e.name !== 'DiscExtractError') return null;
  const reason = (e as Error & { reason?: unknown }).reason;
  return typeof reason === 'string' ? { reason: reason as DiscExtractReason, message: e.message } : null;
}

/**
 * The popover's next view after `e` (`prev` null: from `extractStart`). A file is counted done when the progress reaches
 * its planned size (F1), or -- a size not in the plan -- when the next file is taken (`extractDisc` takes a file only
 * once the one before is stored), or when the extraction is done; a refusal keeps the counts it stopped at, and its run.
 * Pure.
 */
export function extractView(prev: ExtractView | null, e: ExtractEvent): ExtractView {
  const v = prev ?? extractStart();
  switch (e.kind) {
    case 'start': return { ...extractStart(e.run ?? 'extract'), room: v.room,
      failures: (e.run ?? 'extract') === (v.run ?? 'extract') ? v.failures ?? 0 : 0 };
    case 'plan': {
      const done = e.files.filter((f) => f.done);
      return {
        ...v, phase: 'plan', file: '', index: 0, count: e.files.length, done: done.length, backend: e.backend, error: undefined, row: 0,
        sizes: Object.fromEntries(e.files.map((f) => [f.path, f.size])), fileEnd: undefined, fileDone: false,
        ...bytesHeld(done.reduce((n, f) => n + f.size, 0), e.totalBytes),
      };
    }
    case 'file': {
      const finished = v.phase === 'copy' && v.file !== '' && v.file !== e.path && !v.fileDone ? 1 : 0;
      const size = v.sizes?.[e.path];
      return {
        ...v, phase: 'copy', file: e.path, index: e.index, count: e.count, done: Math.min(e.count, v.done + finished),
        fileEnd: size === undefined ? undefined : v.doneBytes + size, fileDone: false,
      };
    }
    case 'progress': {
      const next = { ...v, ...bytesHeld(e.doneBytes, e.totalBytes) };
      if (v.phase === 'copy' && v.file !== '' && !v.fileDone && v.fileEnd !== undefined && next.doneBytes >= v.fileEnd) {
        return { ...next, done: Math.min(v.count, v.done + 1), fileDone: true };
      }
      return next;
    }
    case 'verify': return { ...v, phase: 'verify', run: 'verify', file: '', ...bytesHeld(e.doneBytes, e.totalBytes) };
    case 'room': return { ...v, room: e.bytes };
    case 'done': {
      const n = e.record.files.length;
      return { ...v, phase: 'done', file: '', count: n, done: n, backend: e.record.backend, doneBytes: e.record.total, totalBytes: e.record.total, fileDone: true, failures: 0 };
    }
    case 'error': {
      const known = extractError(e.error);
      const err = known ? { reason: known.reason, words: known.message }
        : { reason: 'failed' as const, words: e.error instanceof Error ? e.error.message : String(e.error) };
      const failed = v.phase !== 'error' && v.run !== 'verify' && err.reason !== 'cancelled' && err.reason !== 'refused';
      return { ...v, phase: 'error', error: err, row: 0, failures: (v.failures ?? 0) + (failed ? 1 : 0) };
    }
  }
}

/** DX-1's hooks as events for `extractView`, one each, and the cancel's signal passed through. */
export const extractHooks = (dispatch: (e: ExtractEvent) => void, signal?: AbortSignal): ExtractHooks => ({
  onPlan: (files, totalBytes, backend) => { dispatch({ kind: 'plan', files, totalBytes, backend }); },
  onFile: (path, index, count) => { dispatch({ kind: 'file', path, index, count }); },
  onProgress: (doneBytes, totalBytes) => { dispatch({ kind: 'progress', doneBytes, totalBytes }); },
  onDone: (record) => { dispatch({ kind: 'done', record }); },
  ...(signal ? { signal } : {}),
});

/**
 * What a press asks of the page: cancel the run (its signal), run it again (a check checks again, F2), go on from the
 * disc this time, or -- a disc refused (F4) -- close the popover (the disc cannot be extracted; the page asks again).
 */
export type ExtractAct = 'cancel' | 'retry' | 'continue' | 'close';

/** F4: a refusal with no way on from the disc (another disc, or one lacking files): Circle closes, nothing else. */
export const closesOnly = (v: ExtractView): boolean => v.phase === 'error' && v.error?.reason === 'refused';

/** Browser adaptation requested for disk-first starts: offer ISO fallback only after three real extraction failures. */
export const EXTRACT_FAILURES_BEFORE_DISC_ADAPTATION = 3;
export const canContinueFromDisc = (v: ExtractView): boolean =>
  v.phase === 'error' && !closesOnly(v) && v.run !== 'verify' && (v.failures ?? 0) >= EXTRACT_FAILURES_BEFORE_DISC_ADAPTATION;

/**
 * A pad press on the popover (the console's grammar: Cross acts, Circle backs). While it runs, Circle cancels (DX-1 keeps
 * every file done). On a refusal the D-pad moves the focus between the two buttons, Cross presses the focused one, and
 * Circle closes until three failures permit going on from the disc; a refused disc always closes. Once done, nothing: the start path
 * takes the popover away. Pure.
 */
export function extractPress(v: ExtractView, b: Button): { view: ExtractView; act: ExtractAct | null } {
  if (v.phase === 'plan' || v.phase === 'copy' || v.phase === 'verify') return { view: v, act: b === 'circle' ? 'cancel' : null };
  if (v.phase !== 'error') return { view: v, act: null };
  if (closesOnly(v)) return { view: v, act: b === 'circle' || b === 'cross' ? 'close' : null };
  if (b === 'up' || b === 'left') return { view: { ...v, row: 0 }, act: null };
  if (b === 'down' || b === 'right') return { view: { ...v, row: 1 }, act: null };
  const onward = canContinueFromDisc(v) ? 'continue' : 'close';
  if (b === 'cross') return { view: v, act: v.row === 0 ? 'retry' : onward };
  if (b === 'circle') return { view: v, act: onward };
  return { view: v, act: null };
}

/** The words of the error buttons and the legend (`./legend`): retry, and the way on. */
export function extractButtons(v: ExtractView): { retry: string; on: string } {
  if (closesOnly(v)) return { retry: '', on: 'Close' };
  const check = v.run === 'verify';
  const cancelled = v.error?.reason === 'cancelled';
  return { retry: check ? 'Check again' : cancelled ? 'Resume' : 'Try again', on: canContinueFromDisc(v) ? 'Continue from the disc' : 'Close' };
}

/** The stores in a player's words (`./discExtractStore`'s two backends). */
export const BACKEND_WORDS: Readonly<Record<ExtractBackend, string>> = { opfs: 'the origin private file system', indexeddb: 'IndexedDB' };

/** DA.R3's line: the page never sends the disc anywhere. */
export const NEVER_UPLOADED = 'Your disc\'s files stay in this browser and are never uploaded.';

/** Bytes done of bytes, both in the total's unit: GB from a gigabyte, else MB (decimal, as `amountSaid` and the browsers say them). */
export function bytesOf(done: number, total: number): string {
  if (total >= 1e9) return `${(done / 1e9).toFixed(2)} of ${(total / 1e9).toFixed(2)} GB`;
  return `${(done / 1e6).toFixed(1)} of ${(total / 1e6).toFixed(1)} MB`;
}

/** A size in GB or MB, for the room left. */
const amount = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : `${(n / 1e6).toFixed(1)} MB`);

/** What stopped it, one line before DX-1's words (FI.R7: what to free or allow). F3: `unavailable` is neutral. */
const WAY: Readonly<Record<DiscExtractReason, string>> = {
  quota: 'This browser\'s storage is full for this page.',
  denied: 'This browser does not allow this page to keep files.',
  unavailable: 'This browser\'s storage could not be used for the game\'s files.',
  cancelled: 'The extraction was stopped. The files done are kept.',
  mismatch: 'A stored file did not match the disc.',
  refused: 'This disc\'s files could not be extracted.',
  failed: 'The extraction failed.',
};
/** F2: the check's own lines (`verifyExtraction`: nothing is changed by a stop). */
const CHECK_WAY: Partial<Record<DiscExtractReason, string>> = {
  cancelled: 'The check was stopped. Nothing was changed.',
};

const TITLE: Readonly<Record<Exclude<ExtractPhase, 'error'>, string>> = { plan: 'EXTRACTING', copy: 'EXTRACTING', verify: 'CHECKING', done: 'EXTRACTED' };

/** The title of a refusal: the run's own (F2). */
function errorTitle(run: ExtractRun, reason: DiscExtractReason): string {
  if (run === 'verify') return reason === 'cancelled' ? 'CHECK STOPPED' : 'CHECK FAILED';
  return reason === 'cancelled' ? 'EXTRACTION PAUSED' : 'EXTRACTION STOPPED';
}

/** DX-1's words as a sentence, its closing disc line taken off (the popover says it on its own line). */
function sentence(words: string): string {
  const w = words.replace(STILL_FROM_DISC, '').trim();
  return w ? w[0]!.toUpperCase() + w.slice(1) : w;
}

/** The scene: the disc, the lane of file chips, the storage box filling with the bar (drawn for the eye; the words carry it). */
function sceneHtml(fraction: string): string {
  return `<div class="cx-extract__scene" aria-hidden="true">
        <svg class="cx-extract__disc" viewBox="0 0 64 64"><circle cx="32" cy="32" r="28"/><circle class="cx-extract__groove" cx="32" cy="32" r="19"/><circle cx="32" cy="32" r="6"/></svg>
        <span class="cx-extract__lane"><i class="cx-extract__chip"></i><i class="cx-extract__chip"></i><i class="cx-extract__chip"></i></span>
        <span class="cx-extract__store"><span class="cx-extract__level" style="--s2u-progress: ${fraction}"></span><svg viewBox="0 0 64 64"><path d="M10 20h44v34H10z"/><path d="M10 20l8-10h28l8 10"/><path d="M26 30h12"/></svg></span>
      </div>`;
}

/**
 * The popover for `v` (the overlay `extract`, `./overlay`; and `../../discStart`'s own, where there is no console). LR-9 (review-lr-9-10
 * F2): in the console it wears the panel's drawing, as Sign in and Server news do (`.cx-dialog--lx`, the head's `.cx-title`;
 * `../console.css`, "LR-9"); the scene, the figures and the acts are unchanged. A browser adaptation.
 */
export function extractHtml(v: ExtractView): string {
  const known = v.count > 0;
  const run: ExtractRun = v.run ?? 'extract';
  const ratio = v.totalBytes > 0 ? Math.max(0, Math.min(1, v.doneBytes / v.totalBytes)) : v.phase === 'done' ? 1 : 0;
  const fraction = ratio.toFixed(4);
  const pct = Math.floor(ratio * 100);
  const files = known ? `${v.done} of ${v.count}` : '—';
  const bytes = v.totalBytes > 0 ? bytesOf(v.doneBytes, v.totalBytes) : '—';
  const where = `Kept in this browser's storage${v.backend ? `: ${BACKEND_WORDS[v.backend]}.` : '.'}${v.room !== null ? ` ${amount(v.room)} left there.` : ''}`;
  const err = v.phase === 'error' ? v.error ?? { reason: 'failed' as const, words: '' } : null;
  const checked = v.phase === 'verify' || (err !== null && run === 'verify');
  const title = err ? errorTitle(run, err.reason) : TITLE[v.phase as Exclude<ExtractPhase, 'error'>];
  const lead = err ? (run === 'verify' ? CHECK_WAY[err.reason] : undefined) ?? WAY[err.reason]
    : v.phase === 'verify' ? 'Checking the stored files against what was written.'
    : v.phase === 'done' ? 'Your disc\'s files are kept in this browser\'s storage. Later starts read them from there.'
    : known ? 'Your disc\'s files are copied once into this browser\'s storage. Later starts read them from there.'
    : 'Checking your disc and this browser\'s storage…';
  const inHand = v.phase === 'copy' ? v.file : v.phase === 'verify' ? 'Re-reading every stored file' : v.phase === 'done' ? 'Every file is stored' : err ? (v.file || '—') : 'Preparing';
  const words = extractButtons(v);
  const foot = err && closesOnly(v)
    ? `<p class="cx-field__error" role="alert">${esc(sentence(err.words))}</p>
      <button type="button" class="cx-toggle is-focused" data-act="press" data-b="circle" data-fk="ex-close"><span>${btn('circle')}${words.on}</span></button>`
    : err
    ? `<p class="cx-field__error" role="alert">${esc(sentence(err.words))}</p>
      ${canContinueFromDisc(v) ? `<p class="cx-dialog__note">${esc(STILL_FROM_DISC)}</p>` : ''}
      <button type="button" class="cx-toggle ${v.row === 0 ? 'is-focused' : ''}" data-act="extract" data-i="0" data-fk="ex-0"><span>${btn('cross')}${words.retry}</span></button>
      <button type="button" class="cx-toggle ${v.row === 1 ? 'is-focused' : ''}" data-act="extract" data-i="1" data-fk="ex-1"><span>${btn('circle')}${words.on}</span></button>`
    : v.phase === 'done' ? ''
    : `<div class="cx-extract__legend" data-extract="legend">
        <button type="button" class="cx-extract__cancel is-focused" data-act="press" data-b="circle" data-fk="ex-cancel">${btn('circle')}<span>${v.phase === 'verify' ? 'Stop the check' : 'Cancel'}</span></button>
        <p class="cx-dialog__note">${v.phase === 'verify' ? 'Nothing is changed.' : 'What is done is kept: the extraction carries on from there next time.'}</p>
      </div>`;
  return `<div class="cx-scrim" data-key="extract"><div class="cx-dialog cx-dialog--lx cx-extract is-${v.phase}" role="dialog" aria-modal="true" aria-labelledby="ex-title">
      ${v.phase === 'done' ? `<h2 class="cx-dialog__title cx-title" id="ex-title">${title}</h2>` : dialogHeadHtml(title, 'ex-title', 'cx-dialog', true)}
      ${sceneHtml(fraction)}
      <p class="cx-dialog__lead" data-extract="way">${esc(lead)}</p>
      <p class="cx-extract__file" data-extract="file">${esc(inHand)}</p>
      <dl class="cx-extract__figs">
        <div><dt>Files</dt><dd data-extract="files">${files}</dd></div>
        <div><dt>${checked ? 'Checked' : 'Stored'}</dt><dd data-extract="bytes">${bytes}</dd></div>
        <div><dt>Done</dt><dd data-extract="pct">${pct}%</dd></div>
      </dl>
      <div class="cx-bar cx-extract__bar" role="progressbar" aria-label="${checked ? 'Checked' : 'Extracted'}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-valuetext="${known ? `${files} files, ` : ''}${bytes === '—' ? 'not started' : bytes}"><i style="--s2u-progress: ${fraction}"></i></div>
      <p class="cx-extract__where" data-extract="where">${esc(where)}</p>
      <p class="cx-dialog__note">${esc(NEVER_UPLOADED)}</p>
      ${foot}
    </div></div>`;
}
