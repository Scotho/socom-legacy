import type { LauncherContext } from '../index';
import { viewerRevision } from '../../revision';
import { serverDetailLine } from './serverDetail';
import './report.css';

/**
 * "Report a problem" (FB-1 of `docs/plans/2026-10-09-modern-ui-parallel.md`; the brief
 * `docs/plans/briefs/modern-ui-live-site-scope.md` 2.4 and 6; MU.R22: no outside service, MU.R23: overlay-ready, MU.R24
 * Q-B: the saved file only). **A browser adaptation with no original** -- this project's own tool; it changes nothing of
 * the game.
 *
 * **It sends nothing anywhere.** The report is made in the page and saved by the player through a download, as
 * `../../playtestReport` saves its file (the same shape: a JSON file with a format tag, labels and notes, made with a
 * Blob and an anchor's click; that module is not imported, since it carries the playtest session's socket); this module
 * calls no network API (`test/modern/report/modernReport.test.ts` holds it to that, in its source and at run time).
 *
 * **What the file holds** is a fixed list: what the player typed, the build's revision, when it was saved, an optional
 * screenshot (embedded as a PNG data URL; only when the player ticks it and a capture source was given), and a context
 * block that is shown in the dialog before it is saved: the page's mode, the disc's and the session's state words, the
 * browser's user agent and the viewport, and -- after a server failure the sections note (`./serverDetail`; MU-P2, the
 * design review r2, P3-2) -- one line of the server's state and status, "server: unavailable (universe query: HTTP
 * 500)", the raw detail the UI never says. Never the ticket, the account's name, the image's file name or a server address.
 *
 * The dialog is the design system's `s2u-dialog` (`shared/ds/README.md`): a `div role="dialog" aria-modal="true"`, not
 * a `<dialog>` (the top layer would sit over the on-screen keyboard), focus trapped, Escape cancels. It reads no setup
 * DOM, so it mounts in the overlay as in the launcher.
 *
 * **For the integrator.** (1) A WebGL canvas read back with `toBlob` is blank unless the context keeps its drawing buffer
 * (`preserveDrawingBuffer`) or the capture renders and reads in the same task: a `capture` function over the game's
 * canvas must render a frame and call `toBlob` without yielding in between. (2) The dialog is modal by `aria-modal`
 * only, which not every assistive technology honours: pass `inertRoot` (the launcher's or the page's root, never an
 * ancestor of the dialog's host) and the module sets `inert` on it while the dialog is open and clears it on close.
 * (3) Cancel or Escape while a screenshot is being made abandons the save: no file is downloaded.
 */

export const PROBLEM_REPORT_FORMAT = 'redotcom-problem-report-1';

export interface ProblemContext {
  mode: string; disc: string; session: string; userAgent: string; viewport: string;
  /** The latest server failure held, "<state> (<detail>)" (`./serverDetail`); absent when none is. */
  server?: string;
}
export interface ProblemReport {
  format: string; revision: string; savedAt: string; whatHappened: string; screenshot: string | null;
  context: ProblemContext; notes: string[];
}

const NOTES = [
  "A problem report from this project's own tool (a browser adaptation, no original), saved in the browser; the page sent it nowhere.",
  "The context holds only the page mode, the disc and session state words, the browser, the window size and the server's state and status after a failure. No ticket, account name, image name or server address is recorded.",
];
const SCREENSHOT_NOTE = 'The screenshot was asked for and could not be made; the file holds none.';

export interface ProblemInput {
  text: string; ctx: LauncherContext; revision: string; at: Date; screenshot: string | null;
  env: { userAgent: string; width: number; height: number };
  /** The screenshot was asked for and failed. */
  screenshotFailed?: boolean;
  /** The latest server failure (`./serverDetail` `serverDetailLine`), or none. */
  server?: string | null;
}

/** The file's content: the listed fields, nothing else. */
export function buildProblemReport(i: ProblemInput): ProblemReport {
  return {
    format: PROBLEM_REPORT_FORMAT, revision: i.revision, savedAt: i.at.toISOString(), whatHappened: i.text,
    screenshot: i.screenshot,
    context: {
      mode: i.ctx.mode, disc: i.ctx.state.disc(), session: i.ctx.session.state(), userAgent: i.env.userAgent, viewport: `${i.env.width}x${i.env.height}`,
      ...(i.server ? { server: i.server } : {}),
    },
    notes: i.screenshotFailed ? [...NOTES, SCREENSHOT_NOTE] : [...NOTES],
  };
}

/** `redotcom-problem-<ISO time with : and . as ->.json`. */
export function problemFileName(at: Date): string {
  return `redotcom-problem-${at.toISOString().replace(/[:.]/g, '-')}.json`;
}

/** A capture: a function answering the PNG (or null), or a canvas (`canvas.toBlob`). */
export type CaptureSource = (() => Promise<Blob | null>) | HTMLCanvasElement;

export interface ReportOptions {
  /** Where a screenshot comes from; absent, no screenshot is offered. */
  capture?: CaptureSource;
  /** The build's label; absent, the viewer's (`../../revision`). */
  revision?: string;
  document?: Document;
  urls?: { createObjectURL(blob: Blob): string; revokeObjectURL(url: string): void };
  /** Starts the download (default: the anchor's click). */
  download?(anchor: HTMLAnchorElement): void;
  now?(): Date;
  /** The background to make `inert` while the dialog is open (not an ancestor of the dialog's host). */
  inertRoot?: HTMLElement;
  /**
   * Further regions inert while it is open (the launcher frame's top bar, shelf and launch cluster; LS-1 review 4), freed
   * with `inertRoot` in the same step, before the focus goes back (MU-P1a: it may go back into one of them).
   */
  inertAlso?: readonly HTMLElement[];
}

export interface ReportDialog {
  el: HTMLElement;
  /** Opens the dialog and focuses the text; the focus returns to the control that had it on close. */
  open(): void;
  close(): void;
  dispose(): void;
}

const captureOf = (src: CaptureSource): Promise<Blob | null> =>
  typeof src === 'function' ? src() : new Promise((res) => { src.toBlob((b) => { res(b); }, 'image/png'); });

const dataUrl = (b: Blob): Promise<string> => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = (): void => { res(String(r.result)); };
  r.onerror = (): void => { rej(new Error('unreadable')); };
  r.readAsDataURL(b);
});

let ids = 0;

/** Mounts the dialog, hidden, into `host`; the action bar's Report (the integration step) calls `open()`. */
export function mountReport(host: HTMLElement, ctx: LauncherContext, opts: ReportOptions = {}): ReportDialog {
  const doc = opts.document ?? host.ownerDocument;
  const view = doc.defaultView;
  const n = ++ids;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  // MU-P1a (the rendered design review r1, item 24): each button carries the pad button that presses it in the dialog --
  // Circle, its Escape (Cancel; `../padLayers`, the dialog layer), and Cross on Save -- the ds prompt glyphs
  // (`s2u-prompt__glyph`; the shapes `../osk` draws for its prompts), decorative: the word stays the button's name.
  const glyph = (kind: 'circle' | 'cross'): SVGSVGElement => {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = doc.createElementNS(NS, 'svg');
    svg.setAttribute('class', `s2u-prompt__glyph s2u-prompt__glyph--${kind}`);
    svg.setAttribute('viewBox', '0 0 14 14');
    svg.setAttribute('aria-hidden', 'true');
    const shape = doc.createElementNS(NS, kind === 'circle' ? 'circle' : 'path');
    if (kind === 'circle') { shape.setAttribute('cx', '7'); shape.setAttribute('cy', '7'); shape.setAttribute('r', '5'); }
    else shape.setAttribute('d', 'M2 2L12 12M12 2L2 12');
    svg.append(shape);
    return svg;
  };
  const button = (action: string, word: string, kind: 'circle' | 'cross', primary = false): HTMLButtonElement => {
    const b = el('button', primary ? 'mu-button mu-button--primary' : 'mu-button');
    b.type = 'button'; b.dataset['action'] = action;
    b.append(glyph(kind), doc.createTextNode(word));
    return b;
  };
  const revision = (): string => opts.revision ?? viewerRevision();
  const env = (): ProblemInput['env'] => ({ userAgent: view?.navigator.userAgent ?? 'unknown', width: view?.innerWidth ?? 0, height: view?.innerHeight ?? 0 });
  const context = (): string => {
    const c = buildProblemReport({ text: '', ctx, revision: revision(), at: new Date(0), screenshot: null, env: env(), server: serverDetailLine(doc) });
    return [`build: ${c.revision}`, `mode: ${c.context.mode}`, `disc: ${c.context.disc}`, `session: ${c.context.session}`,
      ...(c.context.server ? [`server: ${c.context.server}`] : []), `browser: ${c.context.userAgent}`, `window: ${c.context.viewport}`].join('\n');
  };

  const root = el('div', 'mu-report s2u-dialog');
  root.dataset['report'] = '';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  const box = el('div', 'mu-report__box s2u-dialog__box');
  const title = el('h2', 'mu-report__title s2u-dialog__title', 'Report a problem');
  title.id = `mu-report-title-${n}`;
  root.setAttribute('aria-labelledby', title.id);
  const own = el('p', 'mu-report__note', "This project's own tool. Nothing is sent: Save makes one file in your browser's downloads, which you can pass on yourself.");
  const textId = `mu-report-text-${n}`;
  const label = el('label', 'mu-report__label', 'What happened?');
  label.htmlFor = textId;
  const text = el('textarea', 'mu-report__text');
  text.id = textId; text.rows = 6;
  box.append(title, own, label, text);
  let shot: HTMLInputElement | null = null;
  if (opts.capture) {
    const row = el('label', 'mu-report__shot');
    shot = el('input', '');
    shot.type = 'checkbox';
    row.append(shot, el('span', '', 'Include a screenshot'));
    box.append(row);
  }
  const ctxEl = el('pre', 'mu-report__context');
  ctxEl.setAttribute('aria-label', 'Saved with the report');
  const buttons = el('div', 'mu-report__buttons');
  const cancel = button('cancel', 'Cancel', 'circle');
  const save = button('save', 'Save', 'cross', true);
  buttons.append(cancel, save);
  box.append(el('p', 'mu-report__note', 'The file also holds:'), ctxEl, buttons);
  root.append(box);
  root.hidden = true;
  host.append(root);

  let returnTo: HTMLElement | null = null;
  const inert = (on: boolean): void => { for (const r of [opts.inertRoot, ...(opts.inertAlso ?? [])]) r?.toggleAttribute('inert', on); };
  let generation = 0;   // each open and each close starts a new one: a save begun in an earlier one is abandoned
  const close = (): void => {
    if (root.hidden) return;
    generation++;
    root.hidden = true;
    inert(false);
    const back = returnTo; returnTo = null;
    if (back?.isConnected) back.focus();
  };
  const focusables = (): HTMLElement[] => [...root.querySelectorAll<HTMLElement>('textarea, input, button')].filter((e) => !(e as HTMLButtonElement).disabled);
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    const list = focusables();
    if (!list.length) return;
    const first = list[0]!, last = list[list.length - 1]!;
    const at = doc.activeElement;
    if (e.shiftKey && at === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
  };
  const onSave = async (): Promise<void> => {
    const mine = generation;
    save.disabled = true; root.classList.add('is-busy');
    let screenshot: string | null = null, failed = false;
    if (shot?.checked && opts.capture) {
      try {
        const blob = await captureOf(opts.capture);
        if (blob) screenshot = await dataUrl(blob); else failed = true;
      } catch { failed = true; }
    }
    if (mine !== generation) { save.disabled = false; root.classList.remove('is-busy'); return; }   // cancelled meanwhile
    const at = (opts.now ?? ((): Date => new Date()))();
    const file = buildProblemReport({ text: text.value, ctx, revision: revision(), at, screenshot, env: env(), screenshotFailed: failed, server: serverDetailLine(doc) });
    const urls = opts.urls ?? URL;
    const url = urls.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }));
    const a = doc.createElement('a');
    a.href = url; a.download = problemFileName(at);
    (opts.download ?? ((anchor: HTMLAnchorElement): void => { anchor.click(); }))(a);
    setTimeout(() => { urls.revokeObjectURL(url); }, 1000);
    save.disabled = false; root.classList.remove('is-busy');
    close();
  };
  const onSaveClick = (): void => { void onSave(); };
  cancel.addEventListener('click', close);
  save.addEventListener('click', onSaveClick);
  root.addEventListener('keydown', onKey);
  return {
    el: root,
    open(): void {
      if (!root.hidden) return;
      // MU2-10: the dialog's own realm (the overlay's frame has its own `HTMLElement`), so the focus goes back there too.
      returnTo = doc.activeElement instanceof (view?.HTMLElement ?? HTMLElement) ? doc.activeElement as HTMLElement : null;
      text.value = ''; if (shot) shot.checked = false;
      ctxEl.textContent = context();
      generation++;
      root.hidden = false;
      inert(true);
      text.focus();
    },
    close,
    dispose(): void {
      cancel.removeEventListener('click', close);
      save.removeEventListener('click', onSaveClick);
      root.removeEventListener('keydown', onKey);
      generation++;
      inert(false);
      root.remove();
    },
  };
}
