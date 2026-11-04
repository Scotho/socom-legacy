// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DiscExtractError, STILL_FROM_DISC, type DiscExtractFile, type DiscExtractReason, type DiscExtractRecord } from '../../src/discExtract';
import { overlayHtml } from '../../src/console/render/overlay';
import {
  BACKEND_WORDS, NEVER_UPLOADED, bytesOf, closesOnly, extractButtons, extractHooks, extractHtml, extractPress, extractStart, extractView,
  type ExtractEvent, type ExtractView,
} from '../../src/console/render/extract';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { createState } from '../../src/console/state';

/**
 * DX-2 (the front-end plan `docs/plans/2026-10-16-front-end-pad-and-disc.md`, FI.R7; the owner's DISC-EXTRACT: "Add a
 * new popover animation that shows the extraction of assets to a storage mechanism"): the extraction's popover in the
 * console's style -- a pure view from an extraction view-state, the reducer `extractView` over DX-1's hooks, the pad's
 * reading of it (`extractPress`), and its place in the console's overlays. A browser adaptation with no original
 * (OT.R28, OT.R53: the product track); nothing the game does changes.
 */

const here = dirname(fileURLToPath(import.meta.url));
const components = readFileSync(resolve(here, '../../../../../shared/ds/components.css'), 'utf-8');

const dom = (html: string): HTMLElement => {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host;
};
const text = (el: Element | null): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

/** A read set of `n` files of `size` bytes, the first `done` of them done. */
const files = (n: number, size: number, done = 0): DiscExtractFile[] =>
  Array.from({ length: n }, (_, i) => ({ path: `DATA/F${i}.ZAR`, size, sha256: i < done ? 'a'.repeat(64) : null, done: i < done }));

const run = (events: readonly ExtractEvent[], from: ExtractView | null = null): ExtractView =>
  events.reduce<ExtractView>((v, e) => extractView(v, e), from ?? extractStart());

describe('disc fallback after three extraction failures', () => {
  const fail: ExtractEvent = { kind: 'error', error: new DiscExtractError('failed', 'write failed') };
  it('offers retry and Close on failures one and two, then permits disc fallback on failure three', () => {
    let v = extractStart();
    for (let attempt = 1; attempt <= 3; attempt++) {
      v = run([{ kind: 'start' }, fail], v);
      expect(extractButtons(v).on).toBe(attempt < 3 ? 'Close' : 'Continue from the disc');
      expect(extractPress(v, 'circle').act).toBe(attempt < 3 ? 'close' : 'continue');
      expect(extractPress({ ...v, row: 1 }, 'cross').act).toBe(attempt < 3 ? 'close' : 'continue');
      expect(extractPress(v, 'cross').act).toBe('retry');
      const html = text(dom(extractHtml(v)));
      expect(html.includes('Continue from the disc')).toBe(attempt === 3);
      expect(html.includes(STILL_FROM_DISC)).toBe(attempt === 3);
    }
  });
  it('does not count cancellation, a refused disc, verification, or duplicate error events as failed attempts', () => {
    const paused = { kind: 'error', error: new DiscExtractError('cancelled', 'paused') } as const;
    let v = run([fail, fail, { kind: 'start' }, paused, { kind: 'start' }, fail]);
    expect(extractButtons(v).on).toBe('Close');
    v = run([{ kind: 'start' }, fail], v);
    expect(extractButtons(v).on).toBe('Continue from the disc');
    for (const reason of ['cancelled', 'refused'] as const) {
      v = extractStart();
      for (let i = 0; i < 3; i++) v = run([{ kind: 'start' }, { kind: 'error', error: new DiscExtractError(reason, reason) }], v);
      expect(extractButtons(v).on).toBe('Close');
    }
    v = extractStart('verify');
    for (let i = 0; i < 3; i++) v = run([{ kind: 'start', run: 'verify' }, fail], v);
    expect(extractButtons(v).on).toBe('Close');
  });
  it('clears the count after success and starts a new selection without fallback', () => {
    const failed = run([{ kind: 'start' }, fail, { kind: 'start' }, fail, { kind: 'start' }, fail]);
    const record = { files: [], total: 0, backend: 'opfs' } as unknown as DiscExtractRecord;
    const next = run([{ kind: 'done', record }, { kind: 'start' }, fail], failed);
    expect(next.failures).toBe(1);
    expect(extractButtons(next).on).toBe('Close');
    expect(extractButtons(run([fail], extractStart())).on).toBe('Close');
  });
});

const copying: ExtractView = {
  phase: 'copy', file: 'MOVIES/INTRO.PSS', index: 11, count: 96, done: 11, doneBytes: 1_234_000_000, totalBytes: 2_850_000_000,
  backend: 'opfs', room: null, row: 0,
};

describe('bytesOf: bytes done of bytes, in the total\'s unit (MB or GB, decimal as the browsers say them)', () => {
  it('GB for a total of a gigabyte or more, MB under it', () => {
    expect(bytesOf(1_234_000_000, 2_850_000_000)).toBe('1.23 of 2.85 GB');
    expect(bytesOf(0, 2_850_000_000)).toBe('0.00 of 2.85 GB');
    expect(bytesOf(12_300_000, 230_000_000)).toBe('12.3 of 230.0 MB');
    expect(bytesOf(0, 0)).toBe('0.0 of 0.0 MB');
  });
});

describe('the popover, each phase', () => {
  it('plan before the plan: EXTRACTING, no counts yet, the bar at zero, the never-uploaded line, Circle cancels', () => {
    const el = dom(extractHtml(extractStart()));
    const d = el.querySelector('.cx-extract')!;
    expect(d.classList.contains('is-plan')).toBe(true);
    expect(d.getAttribute('role')).toBe('dialog');
    expect(text(el.querySelector('.cx-dialog__title'))).toBe('EXTRACTING');
    expect(el.querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow')).toBe('0');
    expect(text(el.querySelector('[data-extract="files"]'))).toBe('—');
    expect(text(el)).toContain(NEVER_UPLOADED);
    expect(text(el.querySelector('[data-extract="where"]'))).toBe('Kept in this browser\'s storage.');
    const cancel = el.querySelector('[data-act="press"][data-b="circle"]:not([data-close])')!;
    expect(cancel.classList.contains('is-focused')).toBe(true);
    expect(cancel.querySelector('.cx-btn--circle')).not.toBeNull();
    expect(text(cancel)).toBe('Cancel');
    expect(text(el.querySelector('[data-extract="legend"]'))).toMatch(/done is kept.*carries on.*next time/i);
    // MODAL-CLOSE (OT.R62): the head's close button, Circle's press as the Cancel below it.
    const x = el.querySelector('.cx-dialog__head [data-close]')!;
    expect([x.getAttribute('aria-label'), x.getAttribute('data-act'), x.getAttribute('data-b'), text(x)]).toEqual(['Close', 'press', 'circle', '×']);
  });

  it('copy: the file in hand by its disc path, files done of files, bytes done of bytes, the bar\'s value, the backend named', () => {
    const el = dom(extractHtml(copying));
    expect(el.querySelector('.cx-extract')!.classList.contains('is-copy')).toBe(true);
    expect(text(el.querySelector('.cx-dialog__title'))).toBe('EXTRACTING');
    expect(text(el.querySelector('[data-extract="file"]'))).toBe('MOVIES/INTRO.PSS');
    expect(text(el.querySelector('[data-extract="files"]'))).toBe('11 of 96');
    expect(text(el.querySelector('[data-extract="bytes"]'))).toBe('1.23 of 2.85 GB');
    const bar = el.querySelector('[role="progressbar"]')!;
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
    expect(bar.getAttribute('aria-valuenow')).toBe('43');
    expect(bar.getAttribute('aria-valuetext')).toBe('11 of 96 files, 1.23 of 2.85 GB');
    expect(bar.querySelector('i')!.getAttribute('style')).toBe('--s2u-progress: 0.4330');
    expect(text(el.querySelector('[data-extract="where"]'))).toBe('Kept in this browser\'s storage: the origin private file system.');
    expect(text(el)).toContain(NEVER_UPLOADED);
    expect(text(el.querySelector('[data-act="press"][data-b="circle"]:not([data-close])'))).toBe('Cancel');
  });

  it('the backend in plain words: the origin private file system, or IndexedDB; the room left when the browser says it', () => {
    expect(BACKEND_WORDS).toEqual({ opfs: 'the origin private file system', indexeddb: 'IndexedDB' });
    const idb = dom(extractHtml({ ...copying, backend: 'indexeddb', room: 4_200_000_000 }));
    expect(text(idb.querySelector('[data-extract="where"]'))).toBe('Kept in this browser\'s storage: IndexedDB. 4.20 GB left there.');
  });

  it('the animation: a disc, the stream of file chips, the storage box filling with the bar; drawn for the eye only', () => {
    const el = dom(extractHtml(copying));
    const scene = el.querySelector('.cx-extract__scene')!;
    expect(scene.getAttribute('aria-hidden')).toBe('true');
    expect(scene.querySelector('svg.cx-extract__disc')).not.toBeNull();
    expect(scene.querySelectorAll('.cx-extract__lane .cx-extract__chip')).toHaveLength(3);
    expect(scene.querySelector('.cx-extract__store .cx-extract__level')!.getAttribute('style')).toBe('--s2u-progress: 0.4330');
  });

  it('the scene is the same nodes in every phase, so the patch keeps its animation running (`../morph`)', () => {
    const shape = (v: ExtractView): string => dom(extractHtml(v)).querySelector('.cx-extract__scene')!.outerHTML.replace(/style="[^"]*"/g, '');
    const plan = shape(extractStart());
    for (const v of [copying, { ...copying, phase: 'verify' as const }, { ...copying, phase: 'done' as const }]) expect(shape(v)).toBe(plan);
  });

  it('verify: CHECKING, the bytes checked, Circle stops the check and changes nothing', () => {
    const el = dom(extractHtml({ ...copying, phase: 'verify', file: '', doneBytes: 500_000_000 }));
    expect(el.querySelector('.cx-extract')!.classList.contains('is-verify')).toBe(true);
    expect(text(el.querySelector('.cx-dialog__title'))).toBe('CHECKING');
    expect(text(el.querySelector('[data-extract="bytes"]'))).toBe('0.50 of 2.85 GB');
    expect(text(el.querySelector('[data-act="press"][data-b="circle"]:not([data-close])'))).toBe('Stop the check');
    expect(text(el.querySelector('[data-extract="legend"]'))).toMatch(/nothing is changed/i);
  });

  it('done: EXTRACTED, every file and byte, the bar full, no cancel', () => {
    const el = dom(extractHtml({ ...copying, phase: 'done', file: '', done: 96, index: 95, doneBytes: 2_850_000_000 }));
    expect(text(el.querySelector('.cx-dialog__title'))).toBe('EXTRACTED');
    expect(text(el.querySelector('[data-extract="files"]'))).toBe('96 of 96');
    expect(text(el.querySelector('[data-extract="bytes"]'))).toBe('2.85 of 2.85 GB');
    expect(el.querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow')).toBe('100');
    expect(el.querySelector('[data-b="circle"]')).toBeNull();            // nor the head's close (MODAL-CLOSE): Circle does nothing now
    expect(text(el)).toMatch(/later starts read them from there/i);
    expect(text(el)).toContain(NEVER_UPLOADED);
  });

  it('every text the view draws is escaped (a path is the disc\'s, words are the browser\'s)', () => {
    const el = dom(extractHtml({ ...copying, file: '<b>X</b>' }));
    expect(el.querySelector('[data-extract="file"] b')).toBeNull();
    expect(text(el.querySelector('[data-extract="file"]'))).toBe('<b>X</b>');
  });
});

describe('the popover, each refusal: DX-1\'s words, the way forward, the game from the disc this time, retry and continue', () => {
  // DX-2's review F4: `refused` has no way on from the disc (its own case below).
  const REASONS: readonly DiscExtractReason[] = ['unavailable', 'quota', 'denied', 'cancelled', 'mismatch', 'failed'];
  const words = (r: DiscExtractReason): string => `the ${r} words: free 1.2 GB, or allow this site to store data`;

  it.each(REASONS)('%s', (reason) => {
    const v = extractView(copying, { kind: 'error', error: new DiscExtractError(reason, words(reason)) });
    expect(v.phase).toBe('error');
    expect(v.error).toEqual({ reason, words: words(reason) });
    expect(v.row).toBe(0);
    const el = dom(extractHtml(v));
    const d = el.querySelector('.cx-extract')!;
    expect(d.classList.contains('is-error')).toBe(true);
    expect(text(el.querySelector('.cx-dialog__title'))).toBe(reason === 'cancelled' ? 'EXTRACTION PAUSED' : 'EXTRACTION STOPPED');
    const alert = el.querySelector('[role="alert"]')!;
    expect(text(alert)).toBe(`The ${reason} words: free 1.2 GB, or allow this site to store data`);
    expect(text(el)).not.toContain(STILL_FROM_DISC);
    const buttons = [...el.querySelectorAll<HTMLElement>('.cx-toggle[data-act="extract"]')];
    expect(buttons.map((b) => b.dataset.i)).toEqual(['0', '1']);
    expect(text(buttons[0]!)).toBe(reason === 'cancelled' ? 'Resume' : 'Try again');
    expect(text(buttons[1]!)).toBe('Close');
    expect(buttons[0]!.querySelector('.cx-btn--cross')).not.toBeNull();
    expect(buttons[1]!.querySelector('.cx-btn--circle')).not.toBeNull();
    // the console's focus: the first row focused, by `is-focused` and its focus key
    expect(buttons[0]!.classList.contains('is-focused')).toBe(true);
    expect(buttons[1]!.classList.contains('is-focused')).toBe(false);
    expect(buttons.map((b) => b.dataset.fk)).toEqual(['ex-0', 'ex-1']);
    expect(text(el)).toContain(NEVER_UPLOADED);
  });

  it('DX-1\'s own words, as it says them: the quota\'s free-space line and the denied allow line, and the disc line once', () => {
    const quota = new DiscExtractError('quota', `this browser can keep 1.0 GB more for this page: free 2.0 GB -- or allow this site more storage, then try again. ${STILL_FROM_DISC}`, 2e9);
    const el = dom(extractHtml(extractView(copying, { kind: 'error', error: quota })));
    expect(text(el.querySelector('[role="alert"]'))).toMatch(/^This browser can keep 1\.0 GB more.*free 2\.0 GB.*allow this site more storage/);
    expect(text(el).split(STILL_FROM_DISC)).toHaveLength(1);
    expect(text(el.querySelector('[data-extract="way"]'))).toMatch(/storage is full/i);
    const denied = dom(extractHtml(extractView(copying, { kind: 'error', error: new DiscExtractError('denied', 'open a normal window, or allow this site to store data') })));
    expect(text(denied.querySelector('[data-extract="way"]'))).toMatch(/does not allow this page to keep files/i);
  });

  it('a failure that is not a DiscExtractError is `failed`, in its own words', () => {
    const v = extractView(copying, { kind: 'error', error: new Error('the disk is gone') });
    expect(v.error).toEqual({ reason: 'failed', words: 'the disk is gone' });
    expect(extractView(copying, { kind: 'error', error: 'odd' }).error).toEqual({ reason: 'failed', words: 'odd' });
  });

  it('the focus moves as the console\'s dialogs move it, and the second row is drawn focused', () => {
    const v = extractView(copying, { kind: 'error', error: new DiscExtractError('quota', 'full') });
    const down = extractPress(v, 'down');
    expect(down).toEqual({ view: { ...v, row: 1 }, act: null });
    const el = dom(extractHtml(down.view));
    const [a, b] = [...el.querySelectorAll('.cx-toggle[data-act="extract"]')];
    expect(a!.classList.contains('is-focused')).toBe(false);
    expect(b!.classList.contains('is-focused')).toBe(true);
    expect(extractPress(down.view, 'up').view.row).toBe(0);
    expect(extractPress(v, 'right').view.row).toBe(1);
    expect(extractPress(down.view, 'left').view.row).toBe(0);
  });
});

describe('extractPress: what the pad does to the popover (Cross acts, Circle backs)', () => {
  it('while it runs, Circle cancels (what is done is kept); nothing else acts', () => {
    for (const phase of ['plan', 'copy', 'verify'] as const) {
      const v = { ...copying, phase };
      expect(extractPress(v, 'circle')).toEqual({ view: v, act: 'cancel' });
      for (const b of ['cross', 'up', 'down', 'square', 'triangle', 'l1', 'options'] as const) expect(extractPress(v, b)).toEqual({ view: v, act: null });
    }
  });
  it('after three failures, Cross presses the focused row; Circle continues from the disc', () => {
    const v = extractView({ ...copying, failures: 2 }, { kind: 'error', error: new DiscExtractError('denied', 'no') });
    expect(extractPress(v, 'cross').act).toBe('retry');
    expect(extractPress({ ...v, row: 1 }, 'cross').act).toBe('continue');
    expect(extractPress(v, 'circle').act).toBe('continue');
    expect(extractPress(v, 'square').act).toBeNull();
  });
  it('once done, no press acts (the start path takes the popover away)', () => {
    const v = { ...copying, phase: 'done' as const };
    for (const b of ['cross', 'circle'] as const) expect(extractPress(v, b)).toEqual({ view: v, act: null });
  });
});

describe('extractView: DX-1\'s hooks onto the view-state', () => {
  it('starts in plan with nothing known', () => {
    expect(extractStart()).toEqual({ phase: 'plan', file: '', index: 0, count: 0, done: 0, doneBytes: 0, totalBytes: 0, backend: null, room: null, row: 0, run: 'extract' });
    expect(extractView(null, { kind: 'progress', doneBytes: 1, totalBytes: 2 })).toEqual({ ...extractStart(), doneBytes: 1, totalBytes: 2 });
  });

  it('a fresh run: plan, each file, the progress per chunk, done', () => {
    const plan = files(3, 100);
    const record = { files: plan.map((f) => ({ ...f, done: true })), total: 300, backend: 'opfs' } as unknown as DiscExtractRecord;
    const seq: [ExtractEvent, Partial<ExtractView>][] = [
      [{ kind: 'plan', files: plan, totalBytes: 300, backend: 'opfs' }, { phase: 'plan', count: 3, done: 0, doneBytes: 0, totalBytes: 300, backend: 'opfs', file: '' }],
      [{ kind: 'progress', doneBytes: 0, totalBytes: 300 }, { phase: 'plan', doneBytes: 0 }],
      [{ kind: 'file', path: 'DATA/F0.ZAR', index: 0, count: 3 }, { phase: 'copy', file: 'DATA/F0.ZAR', index: 0, done: 0 }],
      [{ kind: 'progress', doneBytes: 60, totalBytes: 300 }, { doneBytes: 60, done: 0 }],
      [{ kind: 'progress', doneBytes: 100, totalBytes: 300 }, { doneBytes: 100, done: 1 }],          // F1: at its size
      [{ kind: 'file', path: 'DATA/F1.ZAR', index: 1, count: 3 }, { file: 'DATA/F1.ZAR', index: 1, done: 1 }],
      [{ kind: 'file', path: 'DATA/F2.ZAR', index: 2, count: 3 }, { file: 'DATA/F2.ZAR', index: 2, done: 2 }],
      [{ kind: 'progress', doneBytes: 300, totalBytes: 300 }, { doneBytes: 300, done: 3 }],
      [{ kind: 'done', record }, { phase: 'done', file: '', done: 3, count: 3, doneBytes: 300, totalBytes: 300 }],
    ];
    let v = extractStart();
    for (const [e, want] of seq) {
      v = extractView(v, e);
      expect(v, e.kind).toMatchObject(want);
    }
  });

  it('a resume: the files the plan marks done count as done, their bytes too; a skipped file counts once', () => {
    const plan = files(4, 100, 2);
    plan[1] = { ...plan[1]!, done: false, sha256: null };               // the second file is rewritten
    const v = run([
      { kind: 'plan', files: plan, totalBytes: 400, backend: 'indexeddb' },
      { kind: 'progress', doneBytes: 100, totalBytes: 400 },
      { kind: 'file', path: 'DATA/F1.ZAR', index: 1, count: 4 },
      { kind: 'file', path: 'DATA/F3.ZAR', index: 3, count: 4 },
    ]);
    expect(v).toMatchObject({ phase: 'copy', count: 4, done: 2, file: 'DATA/F3.ZAR', index: 3, backend: 'indexeddb' });
    expect(run([{ kind: 'plan', files: plan, totalBytes: 400, backend: 'opfs' }])).toMatchObject({ done: 1, doneBytes: 100 });
  });

  it('the bytes are held to the total; the room is the browser\'s word or null', () => {
    expect(run([{ kind: 'progress', doneBytes: 900, totalBytes: 300 }])).toMatchObject({ doneBytes: 300, totalBytes: 300 });
    expect(run([{ kind: 'progress', doneBytes: -5, totalBytes: 300 }])).toMatchObject({ doneBytes: 0 });
    expect(run([{ kind: 'room', bytes: 1e9 }]).room).toBe(1e9);
    expect(run([{ kind: 'room', bytes: 1e9 }, { kind: 'room', bytes: null }]).room).toBeNull();
  });

  it('verify: the bytes checked of the bytes to check', () => {
    const v = run([{ kind: 'verify', doneBytes: 50, totalBytes: 200 }], copying);
    expect(v).toMatchObject({ phase: 'verify', file: '', doneBytes: 50, totalBytes: 200, count: 96, done: 11 });
  });

  it('a refusal keeps the counts; a retry (start) begins again from nothing known, the room kept', () => {
    const err = run([{ kind: 'room', bytes: 5 }, { kind: 'error', error: new DiscExtractError('quota', 'full') }], copying);
    expect(err).toMatchObject({ phase: 'error', count: 96, done: 11, doneBytes: 1_234_000_000, room: 5 });
    expect(run([{ kind: 'start' }], err)).toEqual({ ...extractStart(), room: 5, failures: 1 });
  });

  it('extractHooks: DX-1\'s hooks, one event each, and the signal passed through', () => {
    const seen: ExtractEvent[] = [];
    const signal = new AbortController().signal;
    const h = extractHooks((e) => { seen.push(e); }, signal);
    const plan = files(1, 10);
    const record = { files: plan, total: 10, backend: 'opfs' } as unknown as DiscExtractRecord;
    h.onPlan!(plan, 10, 'opfs');
    h.onFile!('DATA/F0.ZAR', 0, 1);
    h.onProgress!(5, 10);
    h.onDone!(record);
    expect(h.signal).toBe(signal);
    expect(seen).toEqual([
      { kind: 'plan', files: plan, totalBytes: 10, backend: 'opfs' },
      { kind: 'file', path: 'DATA/F0.ZAR', index: 0, count: 1 },
      { kind: 'progress', doneBytes: 5, totalBytes: 10 },
      { kind: 'done', record },
    ]);
  });
});

describe('the console\'s overlay: the popover under its key', () => {
  it('overlay `extract` draws the popover from `ConsoleState.extract`; the opening state has none', () => {
    const a = sampleAdapters();
    const s = createState(a);
    expect(s.extract).toBeNull();
    s.overlay = 'extract';
    expect(overlayHtml(s, a)).toBe('');
    s.extract = copying;
    const html = overlayHtml(s, a);
    expect(html).toBe(extractHtml(copying));
    const el = dom(html);
    expect(el.querySelector('.cx-scrim')!.getAttribute('data-key')).toBe('extract');
    expect(el.querySelector('.cx-dialog.cx-extract')).not.toBeNull();
    s.overlay = null;
    expect(overlayHtml(s, a)).toBe('');
  });
});

describe('the design system carries it (shared/ds components.css, part I)', () => {
  const at = components.indexOf('/* ---- part I');
  // part I alone: up to the next part's mark (part J, 1.9.0), so later parts' keyframes (part L's, 2.2.0) are theirs
  const nextPart = components.indexOf('/* ---- part J', at);
  const partI = at < 0 ? '' : components.slice(at, nextPart > at ? nextPart : components.indexOf('/* ---- part G'));
  it('every class the view draws is styled there', () => {
    expect(at).toBeGreaterThan(0);
    for (const c of ['cx-extract', 'cx-extract__scene', 'cx-extract__disc', 'cx-extract__lane', 'cx-extract__chip', 'cx-extract__store', 'cx-extract__level',
      'cx-extract__bar', 'cx-extract__file', 'cx-extract__figs', 'cx-extract__legend']) expect(partI, c).toMatch(new RegExp(`\\.${c}(?![\\w-])`));
  });
  it('reduced motion: a prefers-reduced-motion rule stops each of the new keyframes\' users, and the stream is not drawn', () => {
    const keyframes = [...partI.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]!);
    expect(keyframes.sort()).toEqual(['cx-extract-flow', 'cx-extract-turn']);
    const reduced = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n {2}\}/.exec(partI)?.[1] ?? '';
    expect(reduced).toMatch(/\.cx-extract__disc[^{]*\{[^}]*animation: none/);
    expect(reduced).toMatch(/\.cx-extract__chip[^{]*\{[^}]*animation: none/);
    expect(reduced).toMatch(/\.cx-extract\.is-copy \.cx-extract__chip\s*\{[^}]*display: none/);
  });
});

/**
 * DX-2's fresh review (PASS WITH FINDINGS), folded in DX-3 at the controller seat's ask: one case per finding.
 */
describe('DX-2\'s review, folded', () => {
  it('F1: a cancel during a long write (IndexedDB\'s one Blob): the files count is the alert\'s, the file in hand done at its size', () => {
    const plan = files(3, 100);
    const v = run([
      { kind: 'plan', files: plan, totalBytes: 300, backend: 'indexeddb' },
      { kind: 'file', path: 'DATA/F0.ZAR', index: 0, count: 3 },
      { kind: 'progress', doneBytes: 100, totalBytes: 300 },          // hashed and stored: the file is done
      { kind: 'file', path: 'DATA/F1.ZAR', index: 1, count: 3 },
      { kind: 'progress', doneBytes: 200, totalBytes: 300 },          // hashed to its size; the long store.write follows
      // The cancel lands during the write: DX-1 finishes and records F1, then stops before F2 -- "2 of 3".
      { kind: 'error', error: new DiscExtractError('cancelled', 'the extraction was stopped: the 2 of 3 files done are kept') },
    ]);
    // Before the fold the count waited for the next file (1, a file behind the alert's 2); it now counts the file in hand
    // at its size, as the bar does.
    expect(v).toMatchObject({ phase: 'error', done: 2, count: 3, doneBytes: 200 });
    expect(text(dom(extractHtml(v)).querySelector('[data-extract="files"]'))).toBe('2 of 3');
    const before = run([
      { kind: 'plan', files: plan, totalBytes: 300, backend: 'indexeddb' },
      { kind: 'file', path: 'DATA/F0.ZAR', index: 0, count: 3 },
      { kind: 'progress', doneBytes: 100, totalBytes: 300 },
      { kind: 'file', path: 'DATA/F1.ZAR', index: 1, count: 3 },
      { kind: 'progress', doneBytes: 150, totalBytes: 300 },
      { kind: 'error', error: new DiscExtractError('cancelled', 'the extraction was stopped: the 1 of 3 files done are kept') },
    ]);
    expect(before).toMatchObject({ done: 1 });                       // "the 1 of 3 files done": the count agrees
    expect(text(dom(extractHtml(before)).querySelector('[data-extract="files"]'))).toBe('1 of 3');
  });

  it('F2: a stopped check keeps its run: CHECK STOPPED, nothing changed, "Check again"; a check\'s retry is a check', () => {
    const checking = run([{ kind: 'start', run: 'verify' }, { kind: 'verify', doneBytes: 50, totalBytes: 200 }]);
    expect(checking).toMatchObject({ phase: 'verify', run: 'verify' });
    const stopped = extractView(checking, { kind: 'error', error: new DiscExtractError('cancelled', 'the check was stopped; nothing was changed') });
    expect(stopped.run).toBe('verify');
    const el = dom(extractHtml(stopped));
    expect(text(el.querySelector('.cx-dialog__title'))).toBe('CHECK STOPPED');
    expect(text(el.querySelector('[data-extract="way"]'))).toBe('The check was stopped. Nothing was changed.');
    expect(text(el.querySelector('[data-act="extract"][data-i="0"]'))).toBe('Check again');
    expect(text(el)).not.toMatch(/PAUSED|Resume/);
    expect(extractButtons(stopped).retry).toBe('Check again');
    expect(extractPress(stopped, 'cross').act).toBe('retry');
    expect(run([{ kind: 'start', run: 'verify' }], stopped)).toMatchObject({ phase: 'verify', run: 'verify' });
    // An extraction's pause keeps its own words.
    const paused = extractView(copying, { kind: 'error', error: new DiscExtractError('cancelled', 'stopped') });
    expect(text(dom(extractHtml(paused)).querySelector('.cx-dialog__title'))).toBe('EXTRACTION PAUSED');
    expect(extractButtons(paused).retry).toBe('Resume');
  });

  it('F3: unavailable\'s lead is neutral (DX-1\'s kept store may only be closed "just now")', () => {
    const words = 'this browser\'s private file system, where the game\'s files kept so far are, would not open just now, so the extraction waits rather than start again elsewhere: try again in a moment.';
    const el = dom(extractHtml(extractView(copying, { kind: 'error', error: new DiscExtractError('unavailable', words) })));
    const lead = text(el.querySelector('[data-extract="way"]'));
    expect(lead).toBe('This browser\'s storage could not be used for the game\'s files.');
    expect(lead).not.toMatch(/has no storage/);
    expect(text(el.querySelector('[role="alert"]'))).toMatch(/would not open just now/);
  });

  it('F4: a refused disc: no "from the disc" line and no continue; one Close; Cross and Circle close', () => {
    const v = extractView(copying, { kind: 'error', error: new DiscExtractError('refused', 'this disc lacks 2 of the files the game reads: it may be damaged or incomplete') });
    expect(closesOnly(v)).toBe(true);
    const el = dom(extractHtml(v));
    expect(text(el.querySelector('.cx-dialog__title'))).toBe('EXTRACTION STOPPED');
    expect(text(el)).not.toContain(STILL_FROM_DISC);
    expect(text(el)).not.toMatch(/Continue from the disc|Try again/);
    expect(el.querySelectorAll('[data-act="extract"]')).toHaveLength(0);
    const close = el.querySelector('[data-act="press"][data-b="circle"]:not([data-close])')!;
    expect(text(close)).toBe('Close');
    expect(close.classList.contains('is-focused')).toBe(true);
    expect(extractPress(v, 'circle').act).toBe('close');
    expect(extractPress(v, 'cross').act).toBe('close');
    expect(extractPress(v, 'down')).toEqual({ view: v, act: null });
  });

  it('F5: the popover loads none of the extraction (types erased, its words from discExtractWords)', () => {
    const src = readFileSync(resolve(here, '../../src/console/render/extract.ts'), 'utf-8');
    const imports = [...src.matchAll(/^import (type )?[^;]*from '([^']+)';/gm)].map((m) => [m[1] ?? '', m[2]!]);
    for (const [kind, from] of imports) if (/discExtract$/.test(from!)) expect(kind, from).toBe('type ');
    expect(imports.map(([, f]) => f)).toContain('../../discExtractWords');
    // The console's other light paths: the start-up's reads apart from the writer, and the adapter's lazy import.
    const disc = readFileSync(resolve(here, '../../src/console/adapters/disc.ts'), 'utf-8');
    expect(disc).not.toMatch(/^import \{[^}]*\} from '\.\.\/\.\.\/discExtract';/m);
    expect(disc).toMatch(/await import\('\.\.\/\.\.\/discExtract'\)/);
    const start = readFileSync(resolve(here, '../../src/discStart.ts'), 'utf-8');
    expect(start).not.toMatch(/^import \{[^}]*\} from '\.\/discExtract';/m);
    expect(start).toMatch(/await import\('\.\/discExtract'\)/);
    // A DiscExtractError is still told by its shape: its reason and words.
    expect(extractView(copying, { kind: 'error', error: new DiscExtractError('quota', 'full') }).error).toEqual({ reason: 'quota', words: 'full' });
  });
});
