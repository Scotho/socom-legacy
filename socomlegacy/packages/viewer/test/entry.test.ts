// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IsoAssetSource, type AssetSource } from '@s2u/archive';
import { bootPage, PAGE_LOADERS, readPageAddress, type PageEntry, type PageLoaders } from '../src/pageEntry';
import { FrontEndSession, type FrontEndMount } from '../src/frontEnd';
import { openFrontEndImage } from '../src/discPrompt';
import type { SourceRequest } from '../src/worker';
import { buildIso } from '../../archive/test/isoImage';

/**
 * The page's entry under the owner's rulings OT.R12 (2026-10-03: "when &menuflow is initiated, do not render the action
 * game in any mode behind") and OT.R19 (2026-10-04: "remove the need now for &menuflow and make it the default. make
 * all the old params for matches only relevant to a new /testroom"): `index.html`'s one script tag is `src/entry.ts`,
 * which hands the address (`location.pathname + location.search`) to `bootPage` (`src/pageEntry.ts`). At the base path
 * and every path that is not `<base>/testroom` the page is the front end alone -- `src/main.ts` (the map viewer in every
 * mode, the match, the HUD, the pad, and every match parameter's reader) is never imported, its markup is taken out of
 * the page, nothing under `maps/` or `/rooms` is asked for and no context is made on `canvas#view`; at `/testroom`
 * `main` is imported as before and the front end is not mounted. A browser adaptation: the page's wiring, nothing of
 * the game.
 */

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(here, '../setup/index.html'), 'utf-8');
const body = (): string => html.slice(html.indexOf('<body'), html.indexOf('</body>')).replace(/^<body[^>]*>/, '').replace(/<script[\s\S]*?<\/script>/g, '');

/** The page's markup as `index.html` serves it, scripts aside, with the body's own classes. */
function loadPage(): void {
  document.documentElement.removeAttribute('style');
  document.body.removeAttribute('style');
  document.body.className = 'panel-collapsed';
  document.body.innerHTML = body();
}

/** The chrome the front end does not use: each must be in the page as served, and gone under `menuflow`. */
const CHROME = ['#view', '#disc-page', '#site-links', '#fps', '#toast', '#fullscreen', '#loading', '#panel', '#maps', '#recom', '#mode', '#controls', '#touch', '#mobile-tip'];

/** Two loaders that record their calls and mount nothing real. */
function loaders(): { loaders: PageLoaders; calls: string[]; mount: FrontEndMount; mounted: string[] } {
  const calls: string[] = [];
  const mounted: string[] = [];
  const mount: FrontEndMount = { canvas: document.createElement('canvas'), status: 'test', session: Promise.resolve(null), stop: () => {} };
  return {
    calls, mount, mounted,
    loaders: {
      main: async () => { calls.push('main'); },
      frontEnd: async () => {
        calls.push('frontEnd');
        return { mountFrontEnd: (search: string) => { mounted.push(search); return mount; } };
      },
    },
  };
}

beforeEach(loadPage);
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; window.history.replaceState(null, '', '/'); });

describe('bootPage (the entry, OT.R19: the front end at the base path, the viewer at /testroom)', () => {
  it('no parameter: the base path is the front end alone; the main module is never imported', async () => {
    for (const address of ['/?devmode', '?devmode', '/', '', '/index.html?devmode']) {
      loadPage();
      const t = loaders();
      const r = await bootPage(address, document, t.loaders);
      expect(t.calls, address).toEqual(['frontEnd']);
      expect(r.entry, address).not.toBe('viewer');
    }
    loadPage();
    const t = loaders();
    expect(await bootPage('/?devmode', document, t.loaders)).toEqual({ entry: 'front-end', mount: t.mount });
    expect(t.mounted).toEqual(['?devmode']);
  });

  it('a bare menuflow means nothing; menuflow=<dialog>.rdr is still handed to the front end (its start dialog)', async () => {
    const t = loaders();
    await bootPage('/?devmode&menuflow', document, t.loaders);
    loadPage();
    await bootPage('/main/online?devmode&menuflow=dlgNetLogin.rdr', document, t.loaders);
    expect(t.calls).toEqual(['frontEnd', 'frontEnd']);
    expect(t.mounted).toEqual(['?devmode&menuflow', '?devmode&menuflow=dlgNetLogin.rdr']);
  });

  it('/testroom: the viewer as before and never the front end; the page\'s markup stays as served', async () => {
    for (const address of ['/testroom?devmode&mode=play&map=MP2', '/testroom', '/testroom/?devmode&fly', '/testroom?devmode&menuflow']) {
      loadPage();
      const t = loaders();
      const before = document.body.innerHTML;
      const r = await bootPage(address, document, t.loaders);
      expect(t.calls, address).toEqual(['main']);
      expect(t.mounted, address).toEqual([]);
      expect(r, address).toEqual({ entry: 'viewer' });
      expect(document.body.innerHTML).toBe(before);
      expect(document.body.className).toBe('panel-collapsed test-room');
      for (const sel of CHROME) expect(document.querySelector(sel), sel).not.toBeNull();
    }
  });

  it('/testroom shows the plain disc page (CX-9b: no launcher in it), and the GitHub link is hidden everywhere', () => {
    // CX-9b (CX.R8): the setup page's launcher frame is gone from the page, so the test room's rule that hid it is gone.
    expect(document.querySelector('#disc-page .s2u-topbar, #disc-page .s2u-shelf, #disc-page .s2u-actionbar, #startup-start')).toBeNull();
    expect(readFileSync(resolve(here, '../src/startup.css'), 'utf-8')).not.toMatch(/body\.test-room/);
    // GITHUB (the owner, 2026-10-04: "Hide it for now"): in the markup but hidden, so `ui.ts` `find('source')` still finds it
    expect(document.getElementById('source')?.hasAttribute('hidden')).toBe(true);
    expect(readFileSync(resolve(here, '../src/styles.css'), 'utf-8')).toMatch(/#source\[hidden\]\s*\{\s*display:\s*none/);
  });

  it('a match parameter at the base path is not read: the front end alone, main.ts (every reader of them) never loaded', async () => {
    const match = '?devmode&mode=play&map=MP2&fly&kit=62,15,121,126,255&noarmory&nomatch&mp&lag=50&loss=5&view=ps2&online=local&rules=respawn';
    for (const address of [`/${match}`, match, `/main${match}`]) {
      loadPage();
      const t = loaders();
      const r = await bootPage(address, document, t.loaders);
      expect(t.calls, address).toEqual(['frontEnd']);
      expect(r.entry, address).toBe('front-end');
    }
  });

  it('the address is a path: a leading // is never a host (//evil.com/testroom is the front end), /// and / are the path', () => {
    expect(readPageAddress('//evil.com/testroom', '/').testRoom).toBe(false);
    expect(readPageAddress('//evil.com/testroom?devmode&map=MP2', '/').testRoom).toBe(false);
    expect(readPageAddress('///testroom', '/').testRoom).toBe(true);
    expect(readPageAddress('/\\evil.com/testroom', '/').testRoom).toBe(false);
    expect(readPageAddress('/testroom', '/').testRoom).toBe(true);
    expect(readPageAddress('//socomlegacy/testroom', '/socomlegacy/').testRoom).toBe(true);
    expect(readPageAddress('//evil.com/socomlegacy/testroom', '/socomlegacy/').testRoom).toBe(false);
    expect(readPageAddress('//evil.com/testroom?a=1', '/').search).toBe('?a=1');
  });

  it('the test room is decided under the page\'s base: /socomlegacy/testroom on the site; a path outside the base is not it', async () => {
    const at = async (address: string): Promise<string[]> => { loadPage(); const t = loaders(); await bootPage(address, document, t.loaders, '/socomlegacy/'); return t.calls; };
    expect(await at('/socomlegacy/testroom?devmode&map=MP2')).toEqual(['main']);
    expect(await at('/socomlegacy/?devmode&map=MP2&mode=play')).toEqual(['frontEnd']);
    expect(await at('/socomlegacy/main/online?devmode')).toEqual(['frontEnd']);
    expect(await at('/testroom?devmode')).toEqual(['frontEnd']);              // not under the base: no test room
    expect(await at('/socomlegacy/testroomx?devmode')).toEqual(['frontEnd']);    // the segment exactly
  });

  it('the old ?frontend is no alias of anything: at the base path the front end, at /testroom the viewer', async () => {
    for (const [address, calls] of [['/?frontend', ['frontEnd']], ['/testroom?devmode&frontend=dlgMenu.rdr', ['main']]] as const) {
      loadPage();
      const t = loaders();
      await bootPage(address, document, t.loaders);
      expect(t.calls, address).toEqual(calls);
    }
  });

  it('under ?devmode&menuflow the page\'s chrome is removed before the front end loads, and the page is black', async () => {
    const t = loaders();
    for (const sel of CHROME) expect(document.querySelector(sel), sel).not.toBeNull();
    let atLoad = -1;
    t.loaders.frontEnd = async () => { atLoad = document.body.children.length; return { mountFrontEnd: () => t.mount }; };
    await bootPage('?devmode&menuflow', document, t.loaders);
    expect(atLoad).toBe(0);                                                        // emptied before the import resolves
    for (const sel of CHROME) expect(document.querySelector(sel), sel).toBeNull();
    expect(document.body.children.length).toBe(0);                                 // the mount's canvas is the fake's: not appended
    // Black through the page's own PS2-picture state, never an inline colour (the design system owns it).
    expect(document.body.classList.contains('ps2-look')).toBe(true);
    expect(document.body.getAttribute('style')).toBeNull();
    expect(document.documentElement.getAttribute('style')).toBeNull();
    const css = readFileSync(resolve(here, '../src/styles.css'), 'utf-8');
    expect(css).toMatch(/^body\.ps2-look \{ background: var\(--s2u-ground-deep\); \}/m);
    expect(readFileSync(resolve(here, '../../../../shared/ds/tokens.css'), 'utf-8')).toMatch(/--s2u-ground-deep: #000000;/);
  });
});

describe('with ?menuflow the real front end alone: no map or room request, no context on canvas#view', () => {
  it('fetch sees nothing under maps/index.json or /rooms, getContext is never asked of #view, the front-end canvas is 640 x 448', async () => {
    const urls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      urls.push(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      return new Response(null, { status: 404 });
    });
    const contexts: string[] = [];
    const view = document.getElementById('view') as HTMLCanvasElement;
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement, kind: string) {
      contexts.push(`${this.id}:${kind}`);
      return null;
    });
    const main = vi.fn(async () => { throw new Error('main.ts must not load under menuflow'); });
    const r = await bootPage('?devmode&menuflow', document, { main, frontEnd: () => import('../src/frontEnd') });
    expect(r.entry).toBe('front-end');
    expect(main).not.toHaveBeenCalled();
    const mount = (r as { mount: FrontEndMount }).mount;
    await mount.session;
    expect(mount.canvas.width).toBe(640);
    expect(mount.canvas.height).toBe(448);
    expect(document.getElementById('front-end')).toBe(mount.canvas);
    expect(view.isConnected).toBe(false);
    expect(document.getElementById('view')).toBeNull();
    expect(urls.filter((u) => /maps\/index\.json|\/rooms(\?|$)/.test(u))).toEqual([]);
    expect(contexts.filter((c) => c.startsWith('view:') || /webgl|webgpu/.test(c))).toEqual([]);
    expect(getContext).toHaveBeenCalledWith('2d');                                // the front end's own canvas, nothing else
    mount.stop();
  });
});

describe('the wiring: index.html -> entry.ts -> bootPage(location.pathname + location.search)', () => {
  const entry = readFileSync(resolve(here, '../src/entry.ts'), 'utf-8');
  const main = readFileSync(resolve(here, '../src/main.ts'), 'utf-8');

  it('index.html has one module script, and it is entry.ts', () => {
    const scripts = [...html.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/g)].map((m) => m[0]);
    expect(scripts).toEqual(['<script type="module" src="/src/entry.ts"></script>']);
  });

  it('entry.ts only hands the address to bootPage; main.ts no longer mounts the front end itself', () => {
    expect(entry).toMatch(/import \{ bootPage \} from '\.\/pageEntry'/);
    expect(entry).toMatch(/bootPage\(location\.pathname \+ location\.search\)/);
    expect(entry).not.toMatch(/import\(?'\.\/main'/);
    expect(main).not.toMatch(/mountFrontEnd/);
    expect(main).not.toMatch(/\?frontend/);
  });
});

/**
 * OT.R14 (the owner, 2026-10-03 ~13:30Z: "We need to read everything from the disk from the iso as a rule, devmode is
 * just a convenience"): under `menuflow` without `?devmode` the page keeps its own disc page -- the viewer's prompt,
 * `#disc-page` with its file input `#disc-page-file`, the whole window a drop target as `./ui` `onDisc` makes it -- and
 * mounts the front end once the visitor's image opens, over a source backed by it. A browser adaptation.
 */
describe('?menuflow without a served tree: the disc page, then the front end over the visitor\'s image (OT.R14)', () => {
  /** The disc prompt's elements: kept under `menuflow` without a served tree. */
  const PROMPT = ['#disc-page', '#disc-title', '#disc-pick', '#disc-page-file', '#disc-state'];
  const REST = CHROME.filter((sel) => sel !== '#disc-page');
  const file = (name = 'SOCOM II.iso'): File => new File([new Uint8Array(8)], name);
  const choose = (f: File): void => {
    const input = document.getElementById('disc-page-file') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [f], configurable: true });
    input.dispatchEvent(new Event('change'));
  };
  const drop = (f: File): void => {
    const e = new Event('drop', { cancelable: true });
    Object.defineProperty(e, 'dataTransfer', { value: { types: ['Files'], files: [f] } });
    document.dispatchEvent(e);
  };
  /** The loaders, with an opener that hands back a fake AssetSource for each image (or refuses one by name). */
  function discLoaders(refuse: (f: File) => string | null = () => null) {
    const t = loaders();
    const fake: AssetSource = { list: async () => [], read: async (p) => { throw new Error(`no ${p}`); } };
    const opened: File[] = [];
    const mounts: { search: string; source: SourceRequest | null; assets: AssetSource | undefined }[] = [];
    t.loaders.frontEnd = async () => {
      t.calls.push('frontEnd');
      return { mountFrontEnd: (search, source, _doc, opts) => { mounts.push({ search, source, assets: opts?.assets }); return t.mount; } };
    };
    t.loaders.openDisc = async (f) => {
      opened.push(f);
      const no = refuse(f);
      if (no) throw new Error(no);
      return fake;
    };
    return { ...t, fake, opened, mounts };
  }
  const mounted = (r: PageEntry): Promise<FrontEndMount | null> => {
    if (r.entry !== 'disc') throw new Error(`entry ${r.entry}`);
    return r.mount;
  };

  it('keeps the disc prompt, shown; removes the rest of the chrome; mounts nothing until an image is chosen', async () => {
    const t = discLoaders();
    const r = await bootPage('?menuflow', document, t.loaders);
    expect(r.entry).toBe('disc');
    expect(t.calls).toEqual(['frontEnd']);                                      // never main
    for (const sel of PROMPT) expect(document.querySelector(sel), sel).not.toBeNull();
    for (const sel of REST) expect(document.querySelector(sel), sel).toBeNull();
    expect((document.getElementById('disc-page') as HTMLElement).hidden).toBe(false);
    expect([...document.body.children].map((e) => e.id)).toEqual(['disc-page']);
    expect(document.body.classList.contains('ps2-look')).toBe(true);
    expect(document.body.getAttribute('style')).toBeNull();
    expect(t.mounts).toEqual([]);
    expect(t.opened).toEqual([]);
  });

  it('an image chosen on the file input opens; the disc page goes and the front end mounts over its source', async () => {
    const t = discLoaders();
    const r = await bootPage('?menuflow=dlgNetLogin.rdr', document, t.loaders);
    const f = file();
    choose(f);
    expect(document.getElementById('disc-state')!.textContent).toBe('reading the disc image SOCOM II.iso ...');
    expect(await mounted(r)).toBe(t.mount);
    expect(t.opened).toEqual([f]);
    expect(t.mounts).toEqual([{ search: '?menuflow=dlgNetLogin.rdr', source: { kind: 'iso', file: f }, assets: t.fake }]);
    expect(document.getElementById('disc-page')).toBeNull();
    expect(document.body.children.length).toBe(0);                             // the fake mount's canvas is not appended
  });

  it('an image dropped anywhere on the window is taken the same way (`./ui` onDisc\'s drop)', async () => {
    const t = discLoaders();
    const r = await bootPage('?menuflow', document, t.loaders);
    const f = file('dropped.iso');
    drop(f);
    expect(await mounted(r)).toBe(t.mount);
    expect(t.mounts.map((m) => m.source)).toEqual([{ kind: 'iso', file: f }]);
  });

  it('an image that will not open is said on the disc page in the reader\'s words; nothing mounts; the next one opens', async () => {
    const t = discLoaders((f) => (f.name === 'bad.iso' ? 'ISO: not an ISO9660 image' : null));
    const r = await bootPage('?menuflow', document, t.loaders);
    choose(file('bad.iso'));
    await vi.waitFor(() => expect(document.getElementById('disc-state')!.textContent).toBe('failed while reading the disc image bad.iso: ISO: not an ISO9660 image'));
    expect(document.getElementById('disc-state')!.classList.contains('is-bad')).toBe(true);
    expect(document.getElementById('disc-page')).not.toBeNull();
    expect(t.mounts).toEqual([]);
    const good = file('good.iso');
    choose(good);
    expect(await mounted(r)).toBe(t.mount);
    expect(t.mounts.map((m) => m.source)).toEqual([{ kind: 'iso', file: good }]);
  });

  it('?devmode&menuflow is unchanged: the served tree, no disc page, mounted at once', async () => {
    const t = discLoaders();
    const r = await bootPage('?devmode&menuflow', document, t.loaders);
    expect(r).toEqual({ entry: 'front-end', mount: t.mount });
    expect(t.mounts.map((m) => m.source)).toEqual([{ kind: 'http', baseUrl: '/maps' }]);
    expect(document.getElementById('disc-page')).toBeNull();
  });
});

/**
 * CX-9b (CX.R8, the owner, 2026-10-12: the console layout "becomes the new launcher default disposing of the old layout
 * entirely but keeping the plumbing beneath it where useful"): the setup page of OT.R28 (`src/startup.ts`'s `Startup`,
 * its START between the opened image and the mount) is gone with the old layout; `/setup` is the plain disc page again,
 * and an image that opens mounts the front end at once (the OT.R14 describe above). What CX-9a added stays: at
 * `<base>setup` the front end mounts at the base. A browser adaptation: the page's wiring, nothing of the game.
 */
describe('the plain game page at /setup (CX-9b)', () => {
  const file = (name = 'SOCOM II.iso'): File => new File([new Uint8Array(8)], name);
  const choose = (f: File): void => {
    const input = document.getElementById('disc-page-file') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [f], configurable: true });
    input.dispatchEvent(new Event('change'));
  };
  /** The page's loaders, recording each mount, with an opener that refuses an image by name. */
  function pageLoaders(refuse: (f: File) => string | null = () => null) {
    const calls: string[] = [];
    const mount: FrontEndMount = { canvas: document.createElement('canvas'), status: 'test', session: Promise.resolve(null), stop: () => {} };
    const mounts: { search: string; source: SourceRequest | null }[] = [];
    const fake: AssetSource = { list: async () => [], read: async (p) => { throw new Error(`no ${p}`); } };
    const loaders: PageLoaders = {
      main: async () => { calls.push('main'); },
      frontEnd: async () => { calls.push('frontEnd'); return { mountFrontEnd: (search, source) => { mounts.push({ search, source }); return mount; } }; },
      openDisc: async (f) => { const no = refuse(f); if (no) throw new Error(no); return fake; },
    };
    return { loaders, calls, mount, mounts };
  }

  it("the page's own loaders make no setup page: the viewer, the front end, (a development build's) launch settings, the forge and the overlay (MU2-10)", () => {
    expect(Object.keys(PAGE_LOADERS).sort()).toEqual(['forge', 'frontEnd', 'launchSettings', 'main', 'overlay']);   // MU2-10: the overlay over the page (MU2.R4); FORGE in every build (FG.R9)
  });

  it('only the disc page stays (no header, no launcher); a refused image is said on it; the next image mounts the front end at once', async () => {
    const t = pageLoaders((f) => (f.name === 'bad.iso' ? 'ISO: not an ISO9660 image' : null));
    const r = await bootPage('/setup', document, t.loaders);
    expect(r.entry).toBe('disc');
    expect([...document.body.children].map((e) => e.id)).toEqual(['disc-page']);
    expect(document.body.classList.contains('no-served')).toBe(false);
    choose(file('bad.iso'));
    await vi.waitFor(() => expect(document.getElementById('disc-state')!.textContent).toBe('failed while reading the disc image bad.iso: ISO: not an ISO9660 image'));
    expect(document.getElementById('disc-state')!.classList.contains('is-bad')).toBe(true);
    expect(t.mounts).toEqual([]);
    const f = file('good.iso');
    choose(f);
    expect(await (r as { mount: Promise<FrontEndMount | null> }).mount).toBe(t.mount);
    expect(t.mounts).toEqual([{ search: '', source: { kind: 'iso', file: f } }]);
    expect(document.getElementById('disc-page')).toBeNull();
    expect(t.calls).toEqual(['frontEnd']);                                         // never main
  });

  /** The page's loaders with each mount recording the address it was made at (`location`, the front end's router's). */
  function recordingAddress(base: PageLoaders): { loaders: PageLoaders; at: string[] } {
    const at: string[] = [];
    return { at, loaders: { ...base, frontEnd: async () => {
      const fe = await base.frontEnd();
      return { mountFrontEnd: (...a: Parameters<typeof fe.mountFrontEnd>) => { at.push(`${location.pathname}${location.search}${location.hash}`); return fe.mountFrontEnd(...a); } };
    } } };
  }

  it('CX-9a: at <base>setup (the old page, the console holding the base path) the front end mounts at the base with the query: its router reads no setup path', async () => {
    for (const [base, page] of [['/', '/setup'], ['/', '/setup/'], ['/socomlegacy/', '/socomlegacy/setup']] as const) {
      loadPage();
      window.history.replaceState(null, '', `${page}?devmode&menuflow=dlgMenu.rdr#x`);
      const t = recordingAddress(loaders().loaders);
      await bootPage(`${page}?devmode&menuflow=dlgMenu.rdr`, document, t.loaders, base);
      expect(t.at, page).toEqual([`${base}?devmode&menuflow=dlgMenu.rdr#x`]);
    }
  });

  it('CX-9a: the disc page at /setup keeps its address until the image opens; the front end mounts at the base, server= kept', async () => {
    const s = pageLoaders();
    const t = recordingAddress(s.loaders);
    window.history.replaceState(null, '', '/setup?server=ws://127.0.0.1:8787/ws');
    const r = await bootPage('/setup?server=ws://127.0.0.1:8787/ws', document, t.loaders);
    expect(r.entry).toBe('disc');
    expect(location.pathname).toBe('/setup');
    choose(file());
    expect(await (r as { mount: Promise<FrontEndMount | null> }).mount).toBe(s.mount);
    expect(t.at).toEqual(['/?server=ws://127.0.0.1:8787/ws']);
  });
});

const FIXTURES = resolve(here, '../../../test-fixtures');
/** The front end's dialogs and scripts (`FRONT_END_FILES`): the US disc's own files (`test-fixtures/MANIFEST.json`). */
const IMAGE_FILES = ['RUN/UI/READERC.ZAR', 'RUN/UIZANIM.ZAR'];
const HAVE_FIXTURES = IMAGE_FILES.every((p) => existsSync(resolve(FIXTURES, p)));
let image: Uint8Array<ArrayBuffer> | null = null;
/** An ISO9660 image of the fixtures' RUN/UI/READERC.ZAR and RUN/UIZANIM.ZAR (`buildIso`, as `e2e/iso.spec.ts` builds one). */
const fixtureImage = (): Uint8Array<ArrayBuffer> =>
  (image ??= buildIso(IMAGE_FILES.map((path) => ({ path, bytes: new Uint8Array(readFileSync(resolve(FIXTURES, path))) })), 'SCUS_97275'));

describe('openFrontEndImage: the visitor\'s image opened by `@s2u/archive`\'s ISO reader, refused in its words', () => {
  it('something that is not a disc image is refused by the reader', async () => {
    await expect(openFrontEndImage(new Blob([new Uint8Array(40 * 2048)]))).rejects.toThrow(/not an ISO9660 image/);
  });
  it('an ISO without the front end\'s dialogs is refused, naming what it lacks', async () => {
    const other = buildIso([{ path: 'SYSTEM.CNF', bytes: new Uint8Array(4) }]);
    await expect(openFrontEndImage(new Blob([other]))).rejects.toThrow(/ISO: no RUN/);
  });
  it.skipIf(!HAVE_FIXTURES)('an image holding them opens as an IsoAssetSource that reads them', async () => {
    const src = await openFrontEndImage(new Blob([fixtureImage()]));
    expect(src).toBeInstanceOf(IsoAssetSource);
    expect((await src.read('RUN/UI/READERC.ZAR')).byteLength).toBe(readFileSync(resolve(FIXTURES, 'RUN/UI/READERC.ZAR')).byteLength);
  });
});

describe.skipIf(!HAVE_FIXTURES)('?menuflow over a built image: the real front end reads its dialogs from it, no request made', () => {
  beforeEach(() => {
    const ctx = new Proxy({}, { get: () => () => {}, set: () => true });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
  });

  it('the image chosen on the disc page: the session boots dlgNetLogin.rdr off the image\'s READERC.ZAR; fetch is never called', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(null, { status: 404 }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const main = vi.fn(async () => { throw new Error('main.ts must not load under menuflow'); });
    const r = await bootPage('?menuflow=dlgNetLogin.rdr', document, { main, frontEnd: () => import('../src/frontEnd') });
    expect(r.entry).toBe('disc');
    const input = document.getElementById('disc-page-file') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [new File([fixtureImage()], 'SOCOM II.iso')], configurable: true });
    input.dispatchEvent(new Event('change'));
    const mount = (await (r as { mount: Promise<FrontEndMount | null> }).mount)!;
    const s = await mount.session;
    expect(s).toBeInstanceOf(FrontEndSession);
    s!.advance(0);
    s!.advance(100);
    s!.advance(200);
    expect(s!.machine.shell()?.currentName).toBe('dlgNetLogin.rdr');
    const notRead = warn.mock.calls.filter((c) => c[0] === 'front end: not read').flatMap((c) => c[1] as string[]);
    expect(notRead.some((m) => m.startsWith('RUN/UI/READERX.ZAR'))).toBe(true);       // the image lacks it: read from the image
    expect(notRead.filter((m) => /^RUN\/UI\/READERC|^RUN\/UIZANIM/.test(m))).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
    expect(main).not.toHaveBeenCalled();
    mount.stop();
  }, 60_000);
});
