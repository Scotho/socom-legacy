// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssetSource } from '@s2u/archive';
import { liveLaunch } from '../../src/console/adapters/launch';
import type { LaunchPage } from '../../src/console/state';
import type { FrontEndMount } from '../../src/frontEnd';
import { publishDisc } from '../../src/modern/discStore';
import type { OverlayPage } from '../../src/modern/overlay';
import { createSession } from '../../src/modern/session';

/**
 * MU2-10's fold (MU2-10c; MU2.R4): the console's START hands the window to the original's front end without passing
 * `src/pageEntry.ts`, so the hand-over makes the seam's one call itself -- once the front end is mounted and the console's
 * own markup taken down, the overlay is mounted over that game page (`kind: 'front-end'`, its mount); never over the
 * console page (no call before the take-down, none when the mount is refused or START is cancelled). A browser
 * adaptation (`MODERN_OVERLAY_ADAPTATION`).
 */
const fakeAssets: AssetSource = { list: async () => [], read: async (p) => { throw new Error(`no ${p}`); } };
const settle = async (): Promise<void> => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0)); };

interface Rig { order: string[]; pages: OverlayPage[]; mount: FrontEndMount; page: LaunchPage; run: ReturnType<typeof liveLaunch> }
function rig(o: { mounted?: boolean; holdSignOut?: boolean } = {}): Rig & { release(): void } {
  const order: string[] = [];
  const pages: OverlayPage[] = [];
  const mount: FrontEndMount = { canvas: document.createElement('canvas'), status: '', session: Promise.resolve(null), stop: () => {} };
  const page: LaunchPage = { suspend: () => { order.push('suspend'); }, resume: () => { order.push('resume'); }, takeDown: () => { order.push('takeDown'); } };
  const session = createSession({ login: async () => ({ status: 0 }), register: async () => ({ status: 0 }) });
  let release: () => void = () => {};
  if (o.holdSignOut) vi.spyOn(session, 'signOut').mockImplementation(() => new Promise<void>((r) => { release = r; }));
  const run = liveLaunch(document, {
    session, base: '/', sheets: [], loadSheet: async () => {},
    image: () => ({ request: { kind: 'iso', file: new File([new Uint8Array(8)], 'socom2.iso') }, assets: fakeAssets }),
    mount: () => { order.push('mountFrontEnd'); return o.mounted === false ? null : mount; },
    overlay: async () => ({ mountPageOverlay: (doc: Document, p: OverlayPage) => { order.push('overlay'); pages.push(p); expect(doc).toBe(document); return null; } }),
  });
  return { order, pages, mount, page, run, release: () => { release(); } };
}

beforeEach(() => { publishDisc(document, { state: 'ready', filename: 'socom2.iso' }); window.history.replaceState(null, '', '/console'); });
afterEach(() => { vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

describe('MU2-10c: the console\'s START mounts the overlay over the game it launches', () => {
  it('once, over the front end it mounted (kind front-end, its mount), after the console\'s markup is taken down', async () => {
    const r = rig();
    expect(await r.run.run(r.page)).toEqual({ ok: true });
    await settle();
    expect(r.pages).toEqual([{ kind: 'front-end', frontEnd: r.mount }]);
    expect(r.order).toEqual(['suspend', 'mountFrontEnd', 'takeDown', 'overlay']);
  });

  it('never over the console page: a refused mount (the console resumes) mounts no overlay', async () => {
    const r = rig({ mounted: false });
    const res = await r.run.run(r.page);
    expect(res.ok).toBe(false);
    await settle();
    expect(r.pages).toEqual([]);
    expect(r.order).toEqual(['suspend', 'mountFrontEnd', 'resume']);
  });

  it('never over the console page: START cancelled before the mount mounts no overlay', async () => {
    const r = rig({ holdSignOut: true });
    const pending = r.run.run(r.page);
    r.run.cancel();
    r.release();
    expect(await pending).toEqual({ ok: false, cancelled: true });
    await settle();
    expect(r.pages).toEqual([]);
    expect(r.order).toEqual([]);
  });
});

/**
 * WM-LAUNCHER (WM.R7; product track, a browser adaptation): the hand-over keeps the overlay's handle it mounts over the
 * game page and offers it to the round's START menu (`../../src/startMenu` `offerStartMenuLauncher`, its SHOW LAUNCHER
 * row); a null mount offers none.
 */
describe('WM-LAUNCHER: the console\'s START keeps the overlay\'s handle for the START menu\'s SHOW LAUNCHER', () => {
  function handOver(handle: { open(): void; isOpen(): boolean } | null) {
    const offered: [Document, unknown][] = [];
    const mount: FrontEndMount = { canvas: document.createElement('canvas'), status: '', session: Promise.resolve(null), stop: () => {} };
    const page: LaunchPage = { suspend: () => {}, resume: () => {}, takeDown: () => {} };
    const session = createSession({ login: async () => ({ status: 0 }), register: async () => ({ status: 0 }) });
    const run = liveLaunch(document, {
      session, base: '/', sheets: [], loadSheet: async () => {},
      image: () => ({ request: { kind: 'iso', file: new File([new Uint8Array(8)], 'socom2.iso') }, assets: fakeAssets }),
      mount: () => mount,
      overlay: async () => ({ mountPageOverlay: () => handle }),
      startMenu: async () => ({ offerStartMenuLauncher: (doc: Document, h: { open(): void; isOpen(): boolean }) => { offered.push([doc, h]); return () => {}; } }),
    });
    return { run, page, offered };
  }

  it('the overlay mounted over the game: its handle offered for the document, once', async () => {
    const handle = { open: () => {}, isOpen: () => false };
    const h = handOver(handle);
    expect(await h.run.run(h.page)).toEqual({ ok: true });
    await settle();
    expect(h.offered).toEqual([[document, handle]]);
  });

  it('no overlay mounted (null): nothing offered', async () => {
    const h = handOver(null);
    expect(await h.run.run(h.page)).toEqual({ ok: true });
    await settle();
    expect(h.offered).toEqual([]);
  });
});
