// @vitest-environment jsdom
import { IDBDatabase as FakeDatabase } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ForgeAgentApi } from '../../src/forge/agent/api';
import type { LoadedMap } from '../../src/loadMap';
import { freshSavesDb, readStoredList } from './fakeSaves';

/**
 * R6 (the rendered pass's R3, the UI seat's ruling of 2026-10-25 17:44Z; a browser adaptation, no original): a save
 * started on `pagehide` is not lost. Since round 3 the autosave is IndexedDB's, written behind `savesOpen()` and the
 * store's queue, so the transaction did not exist yet when the document went away. With the database open, the page's
 * `pagehide` now issues the put synchronously on a fresh readwrite transaction and commits it (no localStorage journal);
 * the next open of the forge takes it in by the store's compare-and-swap. The document's going away is modelled by
 * refusing every transaction asked for after the `pagehide` handler returns -- what a closed document can no longer do.
 */

vi.mock('../../src/renderer', () => ({ createRenderer: async () => ({
  backend: 'webgl2', resize: () => undefined, presentation: () => 'native', render: () => undefined,
  setPresentation: () => undefined, setClearColor: () => undefined,
}) }));
const archiveLoad = vi.hoisted(() => vi.fn<(stem: string) => Promise<LoadedMap>>());
vi.mock('../../src/forge/archives', () => ({ Archives: class {
  onProgress = null;
  clips = async () => null;
  list = async () => ({ entries: [], problems: [] });
  load = archiveLoad;
  sourceRequest = () => ({ kind: 'http', baseUrl: '/maps' });
}, labelOf: (_entries: unknown, _stem: string, fallback: string) => fallback }));

async function mount(): Promise<ForgeAgentApi> {
  const { mountForge } = await import('../../src/forge/page');
  let api!: ForgeAgentApi;
  await mountForge(document, { onAgentReady: (a) => { api = a; } });
  expect(api.read().ready).toBe(true);
  return api;
}
const storedName = async (): Promise<string | null> => {
  const { text } = await readStoredList('autosave');
  return text ? (JSON.parse(text) as { name?: string }).name ?? null : null;
};

/** The `pagehide` of a document that goes away: every transaction asked for once the handler has returned is refused. */
async function closeTheDocument(): Promise<void> {
  const proto = FakeDatabase.prototype as unknown as { transaction: (...a: unknown[]) => unknown };
  const real = proto.transaction;
  let gone = false;
  proto.transaction = function (this: unknown, ...a: unknown[]): unknown {
    if (gone) throw new DOMException('The document is gone', 'InvalidStateError');
    return real.apply(this, a);
  };
  try {
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    gone = true;                                                       // nothing the closed page asks from here reaches the store
    await new Promise((r) => setTimeout(r, 400));
  } finally { proto.transaction = real; }
}

describe('R6 (R3): an edit made just before pagehide is in the autosave after a reload', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.stubGlobal('requestAnimationFrame', () => 0);
    freshSavesDb();
    history.replaceState(null, '', '/forge?floor');
    localStorage.clear();
    archiveLoad.mockReset().mockRejectedValue(new Error('No disc supplied'));
  });
  afterEach(() => { window.dispatchEvent(new PageTransitionEvent('pagehide')); vi.unstubAllGlobals(); });

  it('an edit 100 ms before pagehide survives the document going away, and the next open shows it', async () => {
    const api = await mount();
    // The page's own first autosave written, so the database is open and this page holds its generation.
    await vi.waitFor(async () => expect(await storedName()).not.toBeNull(), { timeout: 3000 });
    expect(await api.execute('layout.name', { name: 'Kept at the close' }, api.read().revision)).toMatchObject({ ok: true });
    await new Promise((r) => setTimeout(r, 100));                      // inside the edit's 300 ms write window
    await closeTheDocument();
    // The reload: a fresh forge on the same database.
    for (const e of Array.from(document.body.children)) e.remove();
    const again = await mount();
    expect(again.read().layout!.name).toBe('Kept at the close');
    expect(await storedName()).toBe('Kept at the close');
  }, 30_000);

  it("a write another tab made since this page last read is never overwritten by the close's put: the next open keeps it", async () => {
    const api = await mount();
    await vi.waitFor(async () => expect(await storedName()).not.toBeNull(), { timeout: 3000 });
    expect(await api.execute('layout.name', { name: 'From the closing tab' }, api.read().revision)).toMatchObject({ ok: true });
    // Another tab writes the autosave while this one still holds the generation it read (the store's compare-and-swap).
    const { SavesStore } = await import('../../src/forge/savesStore');
    const other = new SavesStore(globalThis.indexedDB);
    await other.open();
    const now = await other.read('autosave');
    const theirs = JSON.stringify({ ...(JSON.parse(now.text!) as Record<string, unknown>), name: 'From the other tab' });
    expect(await other.write('autosave', theirs, now.generation)).toBe('written');
    other.close();
    await closeTheDocument();
    for (const e of Array.from(document.body.children)) e.remove();
    const again = await mount();
    expect(again.read().layout!.name).toBe('From the other tab');
    expect(await storedName()).toBe('From the other tab');
  }, 30_000);

  /**
   * R7-5 (round 6's finding): the pagehide's own flushes -- an edit's and a camera move's -- are the page's writes, in
   * flight from the moment it asks them, before their wait for the store's open. Here the document goes away after the
   * first of them commits (the edit, without the camera): the hand-off (the edit and the camera) moved past only by that
   * write of its own is taken in at the next open, and nothing is said of another tab.
   */
  it('R7-5: an edit and a camera move, then pagehide: the first flush commits, the hand-off is still taken in, no other tab said', async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.push(cb); return frames.length; });
    let clock = 0;
    const tick = (): void => { clock = Math.max(clock, performance.now()) + 100; for (const cb of frames.splice(0)) cb(clock); };
    const api = await mount();
    tick();
    await vi.waitFor(async () => expect(await storedName()).not.toBeNull(), { timeout: 3000 });
    const yawOf = (text: string | null): number => (JSON.parse(text ?? '{}') as { camera?: { yaw?: number } }).camera?.yaw ?? NaN;
    const before = yawOf((await readStoredList('autosave')).text);
    expect(await api.execute('layout.name', { name: 'Named at the close' }, api.read().revision)).toMatchObject({ ok: true });
    // the camera turned, its own 300 ms of stillness not yet seen
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft', key: 'ArrowLeft' }));
    tick();
    tick();
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowLeft', key: 'ArrowLeft' }));
    tick();
    // The document goes away once the first transaction asked after the handler (the edit's flush) is under way.
    const proto = FakeDatabase.prototype as unknown as { transaction: (...a: unknown[]) => unknown };
    const real = proto.transaction;
    let after = -1;
    proto.transaction = function (this: unknown, ...a: unknown[]): unknown {
      if (after >= 0 && ++after > 1) throw new DOMException('The document is gone', 'InvalidStateError');
      return real.apply(this, a);
    };
    try {
      window.dispatchEvent(new PageTransitionEvent('pagehide'));
      after = 0;
      await new Promise((r) => setTimeout(r, 400));
    } finally { proto.transaction = real; }
    expect(after, 'the edit\'s flush asked its transaction after the handler').toBeGreaterThanOrEqual(1);
    for (const e of Array.from(document.body.children)) e.remove();
    const again = await mount();
    expect(again.read().layout!.name).toBe('Named at the close');
    const kept = (await readStoredList('autosave')).text;
    expect(yawOf(kept), 'the camera move of the hand-off').not.toBeCloseTo(before, 3);
    expect(document.querySelector('.fx-status-msg')?.textContent ?? '').not.toMatch(/another tab/i);
    expect([...document.querySelectorAll('.fx-notify-log li')].map((li) => li.textContent ?? '').join(' | ')).not.toMatch(/another tab/i);
  }, 30_000);

  /**
   * LATER 488 (LATER 457's review): a `pagehide` into the back/forward cache (`persisted`) puts the hand-off row and the
   * page lives on. Restored (`pageshow`, `persisted`), it goes on writing -- the hide's own flush commits, then a later
   * edit. The next open (another tab here; or this page's own after a discard that fires no second `pagehide`) must not
   * take that stale row in: before the fix it was dropped as "another tab saved" (the list moved past its `expected` by
   * more writes than its `own`), when every write since was this page's.
   */
  it('LATER 488: restored from the back/forward cache, the page writes on; the next open takes in no stale hand-off', async () => {
    const api = await mount();
    await vi.waitFor(async () => expect(await storedName()).not.toBeNull(), { timeout: 3000 });
    expect(await api.execute('layout.name', { name: 'Named before the hide' }, api.read().revision)).toMatchObject({ ok: true });
    await new Promise((r) => setTimeout(r, 100));                      // inside the edit's 300 ms write window
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));   // into the cache: the page lives on
    await vi.waitFor(async () => expect(await storedName()).toBe('Named before the hide'), { timeout: 3000 });
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));   // restored
    expect(await api.execute('layout.name', { name: 'Named after the restore' }, api.read().revision)).toMatchObject({ ok: true });
    await vi.waitFor(async () => expect(await storedName()).toBe('Named after the restore'), { timeout: 3000 });
    // The next open: another tab on the same database.
    const { ForgeSaves, SavesStore } = await import('../../src/forge/savesStore');
    const other = new ForgeSaves(new SavesStore(globalThis.indexedDB), { get: () => null, set: () => undefined });
    const opened = await other.open();
    expect(opened.state).toBe('ready');
    expect(opened.hidden, 'no hand-off of this page left to take in (dropped: "another tab saved")').toEqual({});
    expect((JSON.parse(other.text('autosave') ?? '{}') as { name?: string }).name).toBe('Named after the restore');
    other.close();
  }, 30_000);
});
