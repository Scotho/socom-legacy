// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { READ_SET_VERSION, SOCOM2_US_BOOT } from '@s2u/archive';
import { buildIso } from '../../../../archive/test/isoImage';
import { bootConsole, type ConsolePage } from '../../../src/console/app';
import { KEPT_DISC_TITLE, KEPT_NOT_NEEDED, liveDisc, type LiveDisc } from '../../../src/console/adapters/disc';
import { liveLaunch } from '../../../src/console/adapters/launch';
import { liveOptions } from '../../../src/console/adapters/options';
import { prompts } from '../../../src/console/render/legend';
import { KEPT_CONFIRM } from '../../../src/console/render/overlay';
import { sampleAdapters } from '../../../src/console/sampleAdapters';
import { HOME_CATEGORY, KEPT_DISC_ROW, type Adapters } from '../../../src/console/state';
import { DiscExtractError, type DiscExtractRecord, type ExtractEnv, type ExtractHooks, type ExtractionState } from '../../../src/discExtract';
import type { DiscRequest, SourceRequest } from '../../../src/discSource';
import { EVICTED_LINE } from '../../../src/discStart';
import { StoredDiscSource } from '../../../src/discStored';
import type { FrontEndMount } from '../../../src/frontEnd';
import { openedDiscImage, publishDiscImage } from '../../../src/modern/discImage';
import { publishDisc, readDisc } from '../../../src/modern/discStore';
import type { ModernSession } from '../../../src/modern/session';
import { DISC_EXTRACT_SLOT, type RecordStore } from '../../../src/pageStore';
import { FakeOpfs, FakeStorage } from '../../discExtractFakes';
import { discStep } from '../discStep';
import { mountShell } from '../shell';

/**
 * DX-3 (front-end plan `docs/plans/2026-10-16-front-end-pad-and-disc.md`, FI.R6, FI.R7): the console launcher's start over
 * the disc's read set kept in this browser. Its four start states (whole, none, partial, evicted) over a fake record and
 * state; a disc chosen and validated -> the popover (the overlay `extract`) running the extraction (a fake, driven here
 * through DX-1's hooks), its presses, clicks and legend; done -> ready from storage; START handing on `{ kind: 'stored' }`
 * with no chooser; a disc already kept, the same or another; Options' "Delete the kept disc" behind the console's confirm.
 * A browser adaptation with no original (OT.R28, OT.R53): nothing of the game.
 */

const ID = { boot: SOCOM2_US_BOOT, ver: '1.02', vmode: 'NTSC' };
const text = (s: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(s);
const cnf = (ver = '1.02'): Uint8Array<ArrayBuffer> => text(`BOOT2 = cdrom0:\\${SOCOM2_US_BOOT};1\r\nVER = ${ver}\r\nVMODE = NTSC\r\n`);
/** A disc the page's reader opens (`RUN/UI/READERC.ZAR`) and whose `SYSTEM.CNF` names the US disc at `ver`. */
const disc = (ver = '1.02', name = 'socom2.iso'): File =>
  new File([buildIso([{ path: 'SYSTEM.CNF', bytes: cnf(ver) }, { path: 'RUN/UI/READERC.ZAR', bytes: new Uint8Array(64) }])], name);
const record = (done = true): DiscExtractRecord => ({
  v: 1, readSet: READ_SET_VERSION, identity: { ...ID }, backend: 'opfs', dir: 'SCUS_972.75-1.02-NTSC',
  files: [{ path: 'SYSTEM.CNF', size: 60, sha256: done ? 'a'.repeat(64) : null, done }, { path: 'RUN/MP2.ZDB', size: 940, sha256: done ? 'b'.repeat(64) : null, done }],
  total: 1000, persisted: true, started: 1, when: done ? 2 : null,
});
const memoryRecords = (): RecordStore & { map: Map<string, unknown> } => {
  const map = new Map<string, unknown>();
  return { map, get: async (k) => map.get(k), put: async (k, v) => { map.set(k, v); }, delete: async (k) => { map.delete(k); } };
};
const settle = async (ms = 0): Promise<void> => {
  for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0));
  if (ms) { await new Promise((r) => setTimeout(r, ms)); for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0)); }
};
const pick = (file: File): void => {
  const input = document.getElementById('disc-page-file') as HTMLInputElement;
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  input.dispatchEvent(new Event('change'));
};

/** The extraction, faked: each run's hooks and request kept; it ends when the test says (or rejects cancelled on the signal). */
interface Run { request: DiscRequest; hooks: ExtractHooks; resolve(r: DiscExtractRecord): void; reject(e: unknown): void }
function fakeExtract(): { runs: Run[]; extract: (r: DiscRequest, h: ExtractHooks, e: ExtractEnv) => Promise<DiscExtractRecord> } {
  const runs: Run[] = [];
  return {
    runs,
    extract: (request, hooks) => new Promise<DiscExtractRecord>((resolve, reject) => {
      runs.push({ request, hooks, resolve, reject });
      hooks.signal?.addEventListener('abort', () => { reject(new DiscExtractError('cancelled', 'the extraction was stopped: the 1 of 2 files done are kept')); });
      hooks.onPlan?.(record(false).files, 1000, 'opfs');
      hooks.onProgress?.(0, 1000);
      hooks.onFile?.('SYSTEM.CNF', 0, 2);
    }),
  };
}

let page: ConsolePage | null = null;
beforeEach(() => { publishDisc(document, { state: 'empty', filename: null }); publishDiscImage(document, null); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; vi.restoreAllMocks(); });

interface Rig { disc: LiveDisc; ctl: ConsolePage['ctl']; records: ReturnType<typeof memoryRecords>; runs: Run[]; mount: ReturnType<typeof vi.fn>; env: ExtractEnv; click: ReturnType<typeof vi.spyOn> }

async function rig(o: { state?: ExtractionState; kept?: DiscExtractRecord | null } = {}): Promise<Rig> {
  const records = memoryRecords();
  if (o.kept) records.map.set(DISC_EXTRACT_SLOT, o.kept);
  const env: ExtractEnv = { records, storage: new FakeStorage(new FakeOpfs()), idb: () => null };
  const fake = fakeExtract();
  let state: ExtractionState = o.state ?? 'none';
  const notify = (): void => { page?.render(); };
  const disc = liveDisc(document, notify, { extraction: { env, extract: fake.extract, room: async () => 4e9, doneHold: 0, state: async () => state } });
  // Once a run is done, the state is the extraction's (`whole`), as `extractionState` would read it.
  const done = (r: Run, rec: DiscExtractRecord): void => { state = 'whole'; records.map.set(DISC_EXTRACT_SLOT, rec); r.resolve(rec); };
  (fake.runs as unknown as { done: typeof done }).done = done;
  const mount = vi.fn(() => ({ canvas: document.createElement('canvas'), status: '', session: Promise.resolve(null), stop: () => {} }) as FrontEndMount);
  const session = { signOut: async () => {}, end: () => {} } as unknown as ModernSession;
  const launch = liveLaunch(document, { session, mount: mount as never, sheets: [], loadSheet: async () => {}, overlay: async () => ({ mountPageOverlay: () => {} }), ...(disc.start ? { start: disc.start } : {}) });
  const options = liveOptions(notify, { signedIn: () => false, kept: { info: () => disc.kept(), forget: () => disc.forgetKept() }, store: undefined });
  const A: Adapters = { ...sampleAdapters(), data: 'live', states: undefined, disc, launch, options };
  page = bootConsole(document, window, A, { keymap: true });
  await disc.loaded();
  page.render();
  const click = vi.spyOn(document.getElementById('disc-page-file') as HTMLInputElement, 'click').mockImplementation(() => {});
  return { disc, ctl: page.ctl, records, runs: fake.runs, mount, env, click };
}
const doneRun = (r: Rig, i = 0): void => { (r.runs as unknown as { done(run: Run, rec: DiscExtractRecord): void }).done(r.runs[i]!, record()); };
async function failThreeRuns(r: Rig): Promise<void> {
  for (let i = 0; i < 3; i++) {
    r.runs[i]!.reject(new DiscExtractError('failed', 'write failed'));
    await settle();
    expect(document.querySelector('#overlay')!.textContent!.includes('Continue from the disc')).toBe(i === 2);
    if (i < 2) { r.ctl.press('cross'); await settle(); }
  }
}
/** The Disc step -- its state word the step's, its line the chip's (`../discStep`; LR-23, was LR-13's disc check of Play's panel). */
const discItem = (): { state: string; sub: string } => {
  const d = discStep(page!);
  return { state: d.state, sub: d.sub };
};

describe('on load: the kept extraction\'s state', () => {
  it('whole: ready from storage, the chip ready; START hands on { kind: stored } with no chooser and no prompt', async () => {
    const r = await rig({ state: 'whole', kept: record() });
    expect(readDisc(document)).toMatchObject({ state: 'ready', filename: KEPT_DISC_TITLE });
    expect(discItem()).toEqual({ state: 'READY', sub: KEPT_DISC_TITLE });
    expect(document.querySelector('#legend .cx-mark[data-mark="disc"]')!.classList.contains('is-ready')).toBe(true);   // LR-24 (was: the chip)
    expect(openedDiscImage(document)).toBeInstanceOf(StoredDiscSource);
    expect(r.disc.stored()).toBe(true);
    r.ctl.press('options');
    await settle(400);
    expect(r.click).not.toHaveBeenCalled();
    expect(r.ctl.S.overlay).not.toBe('extract');
    expect(r.mount).toHaveBeenCalledTimes(1);
    const [, source, , opts] = r.mount.mock.calls[0] as unknown as [string, SourceRequest, Document, { assets: unknown }];
    expect(source).toEqual({ kind: 'stored', identity: ID });
    expect(opts.assets).toBeInstanceOf(StoredDiscSource);
    expect(r.runs).toHaveLength(0);
    page = null;
  });

  it('none and partial: the chooser asks as before, no line', async () => {
    for (const state of ['none', 'partial'] as const) {
      mountShell(document);
      publishDisc(document, { state: 'empty', filename: null });
      const r = await rig({ state, kept: state === 'partial' ? record(false) : null });
      expect(discItem()).toEqual({ state: 'NEEDED', sub: 'Your SOCOM 2 ISO (or the retail disc)' });
      expect(r.disc.note()).toBe('');
      page?.dispose(); page = null;
    }
  });

  it('evicted: as none, with one line saying the browser cleared it', async () => {
    await rig({ state: 'evicted', kept: record() });
    expect(discItem()).toEqual({ state: 'NEEDED', sub: `${EVICTED_LINE} Your SOCOM 2 ISO (or the retail disc)` });
  });
});

describe('a disc chosen and validated, the state not whole: the popover extracts it', () => {
  it('the popover opens over the page; its figures; the legend: Circle cancels; START is not read under it', async () => {
    const r = await rig();
    pick(disc());
    await settle();
    expect(r.runs).toHaveLength(1);
    expect(r.ctl.S.overlay).toBe('extract');
    const pop = document.querySelector('#overlay .cx-extract')!;
    expect(pop.classList.contains('is-copy')).toBe(true);
    expect(document.querySelector('#overlay [data-extract="file"]')!.textContent).toBe('SYSTEM.CNF');
    expect(document.querySelector('#overlay [data-extract="where"]')!.textContent).toBe('Kept in this browser\'s storage: the origin private file system. 4.00 GB left there.');
    expect(prompts(r.ctl.S, r.ctl.A)).toEqual([{ k: 'circle', label: 'Cancel', act: 'circle' }]);
    expect(document.querySelector('#legend .cx-start')).toBeNull();
    r.ctl.press('options');
    expect(r.ctl.S.start).toBe('idle');
  });

  it('browser Back closes the popover instead of leaving it over the page', async () => {
    const r = await rig();
    pick(disc());
    await settle();
    expect(r.ctl.S.overlay).toBe('extract');
    expect(document.querySelector('#overlay .cx-extract')).not.toBeNull();
    window.history.back();
    await settle();
    expect(r.ctl.S.overlay).not.toBe('extract');
    expect(r.ctl.S.extract).toBeNull();
    expect(document.querySelector('#overlay .cx-extract')).toBeNull();
    expect(r.runs[0]!.hooks.signal!.aborted).toBe(true);
  });

  it('Circle cancels (what is done is kept): PAUSED; the legend offers Resume and Close without unlocking disc fallback', async () => {
    const r = await rig();
    pick(disc());
    await settle();
    r.ctl.padPress('circle');
    await settle();
    expect(r.runs[0]!.hooks.signal!.aborted).toBe(true);
    expect(r.ctl.S.extract!.phase).toBe('error');
    expect(document.querySelector('#overlay .cx-dialog__title')!.textContent).toBe('EXTRACTION PAUSED');
    expect(prompts(r.ctl.S, r.ctl.A)).toEqual([
      { k: 'cross', label: 'Resume', act: 'cross' }, { k: 'dpad-v', label: 'Choose', act: null }, { k: 'circle', label: 'Close', act: 'circle' },
    ]);
    r.ctl.press('down');
    expect(r.ctl.S.extract!.row).toBe(1);
    expect(prompts(r.ctl.S, r.ctl.A)[0]).toEqual({ k: 'cross', label: 'Close', act: 'cross' });
    r.ctl.press('up');
    r.ctl.press('cross');                                               // Resume: a second run
    await settle();
    expect(r.runs).toHaveLength(2);
    expect(r.ctl.S.extract!.phase).toBe('copy');
  });

  it('clicked: the head\'s Close while it runs pauses it (the popover stays); the paused Close removes it, without the disc (IX.R4)', async () => {
    // `e2e/consoleSounds.spec.ts`'s old way out of the popover, as a player clicks it: the head's × is Circle, so while the
    // copy runs it is Cancel -- EXTRACTION PAUSED, the popover still up, the disc still ready from the disc; the paused
    // popover's last Close removes it and (IX.R4, `docs/plans/2026-10-17-iphone-disc-extraction.md`: "Close exits without
    // starting from the disc") leaves no disc open, so nothing can be read off it. A browser adaptation.
    const r = await rig();
    pick(disc());
    await settle();
    expect(document.querySelectorAll('#overlay .cx-extract')).toHaveLength(1);
    expect(readDisc(document).state).toBe('ready');
    (document.querySelector('#overlay .cx-extract [data-close]') as HTMLElement).click();
    await settle();
    expect(r.runs[0]!.hooks.signal!.aborted).toBe(true);
    expect(document.querySelectorAll('#overlay .cx-extract')).toHaveLength(1);
    expect(document.querySelector('#overlay .cx-dialog__title')!.textContent).toBe('EXTRACTION PAUSED');
    expect(readDisc(document).image).not.toBeNull();
    const closes = Array.from(document.querySelectorAll<HTMLElement>('#overlay .cx-extract button'))
      .filter((b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim() === 'Close');
    expect(closes).toHaveLength(2);                                     // the head's × and the paused popover's own
    closes[closes.length - 1]!.click();
    await settle();
    expect(document.querySelectorAll('#overlay .cx-extract')).toHaveLength(0);
    expect(r.ctl.S.overlay).toBeNull();
    expect(readDisc(document).state).not.toBe('ready');
    expect(readDisc(document).image).toBeNull();
  });

  it('after three failures, a click on "Continue from the disc" closes it; START hands on the disc\'s own request', async () => {
    const r = await rig();
    const file = disc();
    pick(file);
    await settle();
    await failThreeRuns(r);
    (document.querySelector('#overlay [data-act="extract"][data-i="1"]') as HTMLElement).click();
    await settle();
    expect(r.ctl.S.overlay).toBeNull();
    expect(discItem().state).toBe('READY');
    r.ctl.press('options');
    await settle(400);
    const [, source] = r.mount.mock.calls[0] as unknown as [string, SourceRequest];
    expect(source).toEqual({ kind: 'iso', file });
    page = null;
  }, 10_000);

  it('done: the popover closes and the launcher is ready from storage; START reads it, the disc as the cut movies\' fallback', async () => {
    const r = await rig();
    const file = disc();
    pick(file);
    await settle();
    doneRun(r);
    await settle();
    expect(r.ctl.S.overlay).toBeNull();
    expect(readDisc(document)).toMatchObject({ state: 'ready', filename: KEPT_DISC_TITLE });
    expect(discItem()).toEqual({ state: 'READY', sub: KEPT_DISC_TITLE });
    r.ctl.press('options');
    await settle(400);
    const [, source] = r.mount.mock.calls[0] as unknown as [string, SourceRequest];
    expect(source).toEqual({ kind: 'stored', identity: ID, disc: { kind: 'iso', file } });
    page = null;
  });

  it('a disc refused (F4): one button, Close; Circle closes into CHECK DISC with the words', async () => {
    const r = await rig();
    pick(disc());
    await settle();
    r.runs[0]!.reject(new DiscExtractError('refused', 'this disc lacks 2 of the files the game reads (RUN/MP2.ZDB, RUN/MP1.ZDB): it may be damaged or incomplete'));
    await settle();
    expect(prompts(r.ctl.S, r.ctl.A)).toEqual([{ k: 'circle', label: 'Close', act: 'circle' }]);
    expect(document.querySelectorAll('#overlay [data-act="extract"]')).toHaveLength(0);
    expect(document.querySelector('#overlay .cx-extract')!.textContent).not.toContain('from the disc');
    r.ctl.press('circle');
    await settle();
    expect(r.ctl.S.overlay).toBeNull();
    expect(discItem().state).toBe('CHECK DISC');
    expect(discItem().sub).toMatch(/lacks 2 of the files/);
  });
});

describe('already whole, a disc chosen anyway', () => {
  it('the same disc: storage is used and the Disc item says so; no popover; START carries it as the fallback', async () => {
    const r = await rig({ state: 'whole', kept: record() });
    const file = disc('1.02');
    pick(file);
    await settle();
    expect(r.runs).toHaveLength(0);
    expect(r.ctl.S.overlay).toBeNull();
    expect(discItem()).toEqual({ state: 'READY', sub: KEPT_NOT_NEEDED });
    r.ctl.press('options');
    await settle(400);
    const [, source] = r.mount.mock.calls[0] as unknown as [string, SourceRequest];
    expect(source).toEqual({ kind: 'stored', identity: ID, disc: { kind: 'iso', file } });
    page = null;
  });

  it('another disc (another SYSTEM.CNF VER): extracted as a new extraction behind the popover', async () => {
    const r = await rig({ state: 'whole', kept: record() });
    pick(disc('1.03', 'other.iso'));
    await settle();
    expect(r.runs).toHaveLength(1);
    expect(r.ctl.S.overlay).toBe('extract');
    expect(r.disc.stored()).toBe(false);
  });
});

/** DX-3's fresh review (PASS WITH FINDINGS), folded: one case per finding the seat owns here. */
describe('DX-3\'s review, folded (the console adapter)', () => {
  it('F1: A kept whole, B picked, its run stopped, Continue from the disc: START hands on B, not the kept A', async () => {
    const r = await rig({ state: 'whole', kept: record() });
    const b = disc('1.03', 'other.iso');
    pick(b);
    await settle();
    expect(r.runs).toHaveLength(1);
    await failThreeRuns(r);                                            // failed before A's record is replaced
    (document.querySelector('#overlay [data-act="extract"][data-i="1"]') as HTMLElement).click();
    await settle();
    expect(r.ctl.S.overlay).toBeNull();
    expect(readDisc(document)).toMatchObject({ state: 'ready', filename: 'other.iso' });
    r.ctl.press('options');
    await settle(400);
    const [, source] = r.mount.mock.calls[0] as unknown as [string, SourceRequest];
    expect(source).toEqual({ kind: 'iso', file: b });
    page = null;
  }, 10_000);

  it('F2: a disc dropped or picked while the popover is up is not taken: one run, and Circle stops it', async () => {
    const r = await rig();
    pick(disc());
    await settle();
    expect(r.runs).toHaveLength(1);
    pick(disc('1.02', 'second.iso'));
    const drop = new Event('drop', { cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: { types: ['Files'], files: [disc('1.02', 'third.iso')], items: [] } });
    document.dispatchEvent(drop);
    await settle();
    expect(r.runs).toHaveLength(1);
    expect(readDisc(document).filename).toBe('socom2.iso');
    r.ctl.press('circle');
    await settle();
    expect(r.runs[0]!.hooks.signal!.aborted).toBe(true);
    expect(r.ctl.S.extract!.phase).toBe('error');
  });

  it('F5: a refused pick while a disc is kept whole: its words said, and START still starts from storage', async () => {
    const r = await rig({ state: 'whole', kept: record() });
    pick(new File([new Uint8Array(40 * 2048)], 'holiday.iso'));
    await settle();
    expect(readDisc(document)).toMatchObject({ state: 'ready', filename: KEPT_DISC_TITLE });
    expect(discItem().state).toBe('READY');
    expect(discItem().sub).toMatch(/not an ISO9660 image/);
    expect(discItem().sub).toMatch(/starts from the disc kept in this browser/);
    r.ctl.press('options');
    await settle(400);
    const [, source] = r.mount.mock.calls[0] as unknown as [string, SourceRequest];
    expect(source).toEqual({ kind: 'stored', identity: ID });
    page = null;
  });
});

describe('Options: "Delete the kept disc", behind the console\'s confirm', () => {
  it('locked "Nothing kept" with nothing kept', async () => {
    const r = await rig();
    const row = r.ctl.A.options.categories().find((c) => c.id === 'app')!.rows.find((x) => x.id === KEPT_DISC_ROW)!;
    expect(row).toMatchObject({ label: 'Remove downloaded content', action: 'Remove', locked: 'Nothing stored' });
  });

  it('kept: its words say what, where and how; Cross asks the confirm (No first); Yes deletes it and the chooser asks again', async () => {
    const r = await rig({ state: 'whole', kept: record() });
    const cats = r.ctl.A.options.categories();
    const account = cats.findIndex((c) => c.id === 'app');
    const rows = cats[account]!.rows;
    const at = rows.findIndex((x) => x.id === KEPT_DISC_ROW);
    expect(rows[at]!.locked).toBeUndefined();
    expect(rows[at]!.about).toBe('Your disc\'s files (1.0 kB) are kept in this browser\'s storage, the origin private file system, so later starts need no disc. Remove them here; the next start asks for your disc again.');
    r.ctl.S.screen = 'options';
    r.ctl.S.opt = { cat: account, row: at, zone: 'rows' };
    r.ctl.press('cross');
    expect([r.ctl.S.overlay, r.ctl.S.confirmKind, r.ctl.S.confirmRow]).toEqual(['confirm', 'kept', 0]);
    expect(document.querySelector('#overlay .cx-dialog__title')!.textContent).toBe(KEPT_CONFIRM.title);
    r.ctl.press('cross');                                               // No: nothing deleted
    expect(r.ctl.S.overlay).toBeNull();
    expect(r.records.map.has(DISC_EXTRACT_SLOT)).toBe(true);
    r.ctl.press('cross');
    r.ctl.press('down');
    r.ctl.press('cross');                                               // Yes
    await settle();
    expect(r.records.map.has(DISC_EXTRACT_SLOT)).toBe(false);
    expect(r.ctl.S.toast).toBe('Downloaded content removed: the next start asks for your disc');
    // The box's red on d88e98b5a (discExtract.spec step 3): the notice is this toast, drawn in #toast over the App rows
    // (LR-5 did not move it); its words are #509's (c01e19d49), the spec's `/kept disc was deleted/` the older ones.
    expect(document.querySelector('#toast')!.textContent).toContain('Downloaded content removed: the next start asks for your disc');
    expect(readDisc(document).state).toBe('empty');
    r.ctl.S.screen = 'home';
    r.ctl.S.cat = HOME_CATEGORY;
    page!.render();
    expect(discItem().state).toBe('NEEDED');
  });
});
