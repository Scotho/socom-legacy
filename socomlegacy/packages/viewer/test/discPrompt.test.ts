// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DirectoryAssetSource, SOCOM2_US_BOOT, type AssetSource } from '@s2u/archive';
import { bootPage, type PageEntry, type PageLoaders } from '../src/pageEntry';
import type { FrontEndMount } from '../src/frontEnd';
import {
  folderRequestFromDrop, folderRequestFromInput, openedDiscImage, openedDiscRequest, openFrontEndDisc, watchDiscPrompt,
} from '../src/discPrompt';
import { discOpener } from '../src/discSource';
import { fileDiscMounted, resetFileDiscForTest } from '../src/pwa/fileDisc';
import type { SourceRequest } from '../src/worker';

/**
 * DA-4 (plan `docs/plans/2026-10-11-disc-access.md`, row DA-4; research 306 §1), the plumbing only (the controller's
 * scope, 2026-10-12: the visible folder chooser is the console launcher's): a directory pick's files
 * (`folderRequestFromInput`) and a dropped folder (`folderRequestFromDrop`, the `webkitGetAsEntry` walk) as a
 * `{ kind: 'dir' }` request, and the window's drop handler opening a dropped folder by `openFrontEndDisc` exactly where
 * a dropped image goes (DA-3, `./discSource`). An image chosen or dropped is unchanged. A browser adaptation (DA.R2)
 * with no original: the folder's files are read by the same readers by path (`DirectoryAssetSource`, which strips the
 * folder's own name), and its `SYSTEM.CNF` is checked first (DA.R8). Generated values only: a `SYSTEM.CNF` in the
 * retail line's form (`docs/roadmap/02-boot.md` B1) and four bytes standing for `RUN/UI/READERC.ZAR`.
 */

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(here, '../setup/index.html'), 'utf-8');
const body = (): string => html.slice(html.indexOf('<body'), html.indexOf('</body>')).replace(/^<body[^>]*>/, '').replace(/<script[\s\S]*?<\/script>/g, '');

const text = (s: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(s);
const systemCnf = (boot: string): Uint8Array<ArrayBuffer> => text(`BOOT2 = cdrom0:\\${boot};1\r\nVER = 1.00\r\nVMODE = NTSC\r\n`);
/** A picked file, as `<input webkitdirectory>` hands it: its path below the pick, the folder's own name first. */
const picked = (bytes: Uint8Array<ArrayBuffer>, path: string): File => {
  const f = new File([bytes], path.split('/').pop()!, { lastModified: 1_000 });
  Object.defineProperty(f, 'webkitRelativePath', { value: path });
  return f;
};

/** A dropped entry as `DataTransferItem.webkitGetAsEntry()` answers it: a directory's `readEntries` hands `batch` a call. */
type FakeEntry = { isFile: boolean; isDirectory: boolean; name: string; file?: (ok: (f: File) => void) => void; createReader?: () => unknown };
const fileEntry = (f: File): FakeEntry => ({ isFile: true, isDirectory: false, name: f.name, file: (ok) => { ok(f); } });
const dirEntry = (name: string, children: FakeEntry[], batch = 1): FakeEntry => ({
  isFile: false, isDirectory: true, name,
  createReader: () => {
    let at = 0;
    return { readEntries: (ok: (e: FakeEntry[]) => void) => { const b = children.slice(at, at + batch); at += batch; setTimeout(() => { ok(b); }, 0); } };
  },
});
const itemOf = (entry: FakeEntry): DataTransferItem => ({ kind: 'file', webkitGetAsEntry: () => entry }) as unknown as DataTransferItem;
/** A drop on the window carrying `files`, and -- where the browser has them -- `items` answering `webkitGetAsEntry`. */
const drop = (files: File[], entries?: FakeEntry[]): Event => {
  const e = new Event('drop', { cancelable: true });
  const items = entries?.map(itemOf);
  Object.defineProperty(e, 'dataTransfer', { value: { types: ['Files'], files, ...(items ? { items } : {}) } });
  document.dispatchEvent(e);
  return e;
};

/** The entry's loaders, recording each mount; images open by a fake, folders by the page's own `openFrontEndDisc`. */
function loaders() {
  const mount: FrontEndMount = { canvas: document.createElement('canvas'), status: 'test', session: Promise.resolve(null), stop: () => {} };
  const fake: AssetSource = { list: async () => [], read: async (p) => { throw new Error(`no ${p}`); } };
  const opened: File[] = [];
  const mounts: { source: SourceRequest | null; assets: AssetSource | undefined }[] = [];
  const l: PageLoaders = {
    main: async () => {},
    frontEnd: async () => ({ mountFrontEnd: (_s, source, _d, opts) => { mounts.push({ source, assets: opts?.assets }); return mount; } }),
    openDisc: async (f) => { opened.push(f); return fake; },
  };
  return { loaders: l, mount, fake, opened, mounts };
}
const mounted = (r: PageEntry): Promise<FrontEndMount | null> => {
  if (r.entry !== 'disc') throw new Error(`entry ${r.entry}`);
  return r.mount;
};
const state = (): string => document.getElementById('disc-state')!.textContent ?? '';

beforeEach(() => {
  document.documentElement.removeAttribute('style');
  document.body.className = 'panel-collapsed';
  document.body.innerHTML = body();
});
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; });

describe('folderRequestFromInput (DA-4): a directory pick\'s files as a dir request', () => {
  it('reads each file\'s webkitRelativePath (DA-3\'s dirRequest); nothing picked is null', () => {
    const cnf = picked(systemCnf(SOCOM2_US_BOOT), 'SOCOM2/SYSTEM.CNF');
    const dialogs = picked(text('four'), 'SOCOM2/RUN/UI/READERC.ZAR');
    expect(folderRequestFromInput([cnf, dialogs])).toEqual({ kind: 'dir', entries: [{ path: 'SOCOM2/SYSTEM.CNF', file: cnf }, { path: 'SOCOM2/RUN/UI/READERC.ZAR', file: dialogs }] });
    expect(folderRequestFromInput([])).toBeNull();
    expect(folderRequestFromInput(null)).toBeNull();
  });

  it('opened by openFrontEndDisc, the folder\'s own name is stripped at the source, and the opened disc is that request (F2)', async () => {
    const request = folderRequestFromInput([picked(systemCnf(SOCOM2_US_BOOT), 'SOCOM2/SYSTEM.CNF'), picked(text('four'), 'SOCOM2/RUN/UI/READERC.ZAR')])!;
    const source = await openFrontEndDisc(request);
    expect(source).toBeInstanceOf(DirectoryAssetSource);
    expect(await source.list()).toEqual(['RUN/UI/READERC.ZAR', 'SYSTEM.CNF']);
    expect(openedDiscRequest()).toBe(request);
    expect(openedDiscImage()).toBeNull();
    expect(fileDiscMounted()).toBe(true);
    resetFileDiscForTest();
  });
});

describe('folderRequestFromDrop (DA-4): a dropped folder walked by webkitGetAsEntry', () => {
  it('walks every directory (readEntries until an empty batch, one entry a batch here), the folder\'s own name first', async () => {
    const cnf = new File([systemCnf(SOCOM2_US_BOOT)], 'SYSTEM.CNF');
    const dialogs = new File([text('four')], 'READERC.ZAR');
    const other = new File([text('x')], 'MP2.ZDB');
    const root = dirEntry('SOCOM2', [fileEntry(cnf), dirEntry('RUN', [fileEntry(other), dirEntry('UI', [fileEntry(dialogs)])])]);
    expect(await folderRequestFromDrop(itemOf(root))).toEqual({ kind: 'dir', entries: [
      { path: 'SOCOM2/SYSTEM.CNF', file: cnf }, { path: 'SOCOM2/RUN/MP2.ZDB', file: other }, { path: 'SOCOM2/RUN/UI/READERC.ZAR', file: dialogs },
    ] });
  });

  it('a file entry, an item without webkitGetAsEntry, or none is not a folder: null', () => {
    expect(folderRequestFromDrop(itemOf(fileEntry(new File([], 'a.iso'))))).toBeNull();
    expect(folderRequestFromDrop({ kind: 'file' } as unknown as DataTransferItem)).toBeNull();
    expect(folderRequestFromDrop(undefined)).toBeNull();
  });
});

describe('the window\'s drop handler (DA-4): a dropped folder opened by openFrontEndDisc, as a dropped image is', () => {
  it('a dropped folder mounts the front end over its source (the request, its own name first)', async () => {
    const t = loaders();
    const r = await bootPage('?menuflow', document, t.loaders);
    const cnf = new File([systemCnf(SOCOM2_US_BOOT)], 'SYSTEM.CNF');
    const dialogs = new File([text('four')], 'READERC.ZAR');
    const e = drop([new File([], 'SOCOM2')], [dirEntry('SOCOM2', [fileEntry(cnf), dirEntry('RUN', [dirEntry('UI', [fileEntry(dialogs)])])])]);
    expect(e.defaultPrevented).toBe(true);
    expect(await mounted(r)).toBe(t.mount);
    expect(t.opened).toEqual([]);                                   // the image opener never saw it
    expect(t.mounts.map((m) => m.source)).toEqual([{ kind: 'dir', entries: [{ path: 'SOCOM2/SYSTEM.CNF', file: cnf }, { path: 'SOCOM2/RUN/UI/READERC.ZAR', file: dialogs }] }]);
    expect(t.mounts[0]!.assets).toBeInstanceOf(DirectoryAssetSource);
    expect(await t.mounts[0]!.assets!.list()).toEqual(['RUN/UI/READERC.ZAR', 'SYSTEM.CNF']);
    expect(openedDiscRequest()).toBe(t.mounts[0]!.source);
  });

  it('a dropped folder of another game is refused in discIdentity\'s words (DA.R8); nothing mounts', async () => {
    const t = loaders();
    await bootPage('?menuflow', document, t.loaders);
    drop([new File([], 'OTHER')], [dirEntry('OTHER', [fileEntry(new File([systemCnf('SLES_999.99')], 'SYSTEM.CNF'))])]);
    await vi.waitFor(() => expect(state()).toMatch(/^failed while reading the disc folder OTHER: .*this disc boots SLES_999\.99/));
    expect(document.getElementById('disc-state')!.classList.contains('is-bad')).toBe(true);
    expect(t.mounts).toEqual([]);
  });

  it('an image dropped is unchanged: a file entry, or a browser without webkitGetAsEntry, hands the image on', async () => {
    const t = loaders();
    const r = await bootPage('?menuflow', document, t.loaders);
    const iso = new File([new Uint8Array(8)], 'SOCOM II.iso');
    drop([iso], [fileEntry(iso)]);
    expect(await mounted(r)).toBe(t.mount);
    expect(t.mounts.map((m) => m.source)).toEqual([{ kind: 'iso', file: iso }]);
    document.body.innerHTML = body();
    const u = loaders();
    const s = await bootPage('?menuflow', document, u.loaders);
    const other = new File([new Uint8Array(8)], 'b.iso');
    drop([other]);                                                   // no items: today's behaviour
    expect(await mounted(s)).toBe(u.mount);
    expect(u.mounts.map((m) => m.source)).toEqual([{ kind: 'iso', file: other }]);
  });

  it('without a folder handler (the console\'s Choose disc, an image only) a drop keeps today\'s behaviour', () => {
    const files: File[] = [];
    const off = watchDiscPrompt(document, document.getElementById('disc-page')!, (f) => files.push(f));
    const stub = new File([], 'SOCOM2');
    drop([stub], [dirEntry('SOCOM2', [])]);
    expect(files).toEqual([stub]);                                  // handed on as an image, refused by the ISO reader as before
    off();
  });

  it('no visible folder control on the old setup page (the console launcher\'s to place)', () => {
    expect(document.querySelector('input[webkitdirectory]')).toBeNull();
  });
});

/**
 * `/testroom`'s `openDisc` (`main.ts`) is `./discSource` `discOpener` over the page's own parts; here over recording
 * fakes, with a fake `check` standing for `discSource.openDisc` (DA.R8) that resolves or rejects when the test says.
 */
function opener(o: { switching?: () => boolean } = {}) {
  const log: string[] = [];
  const asked: SourceRequest[] = [];
  const checks: { disc: SourceRequest; ok: () => void; no: (e: Error) => void }[] = [];
  const open = discOpener({
    switching: o.switching ?? (() => false),
    chosen: () => log.push('chosen'),
    refused: () => log.push('refused'),
    status: (t) => log.push(`status ${t}`),
    discState: (t) => log.push(`state ${t}`),
    ask: (d) => { asked.push(d); log.push('ask'); },
    forget: () => log.push('forget'),
    failed: (t) => log.push(`failed ${t}`),
    check: (disc) => new Promise<void>((ok, no) => { checks.push({ disc, ok: () => { ok(); }, no }); }),
  });
  return { open, log, asked, checks };
}
const goodFolder = (top = 'SOCOM2'): SourceRequest & { kind: 'dir' } => ({ kind: 'dir', entries: [{ path: `${top}/SYSTEM.CNF`, file: new File([systemCnf(SOCOM2_US_BOOT)], 'SYSTEM.CNF') }] });
const turn = (): Promise<void> => new Promise((r) => { setTimeout(r, 0); });

describe('/testroom opens a folder only after the page\'s one check (DA-3 review F1; DA-4 review F-a, F-b, F-d)', () => {
  it('an image is asked of the worker at once, as before', () => {
    const t = opener();
    const iso = new File([], 'SOCOM II.iso');
    t.open(iso);
    expect(t.asked).toEqual([{ kind: 'iso', file: iso }]);
    expect(t.log).toEqual(['chosen', 'status reading the disc image SOCOM II.iso ...', 'state reading the disc image SOCOM II.iso ...', 'ask']);
    expect(t.checks).toEqual([]);
  });

  it('a folder: the older disc still loading is forgotten at once (F-b), then asked only once its check resolves', async () => {
    const t = opener();
    const folder = goodFolder();
    t.open(folder);
    expect(t.log).toEqual(['chosen', 'status reading the disc folder SOCOM2 ...', 'state reading the disc folder SOCOM2 ...', 'forget']);
    expect(t.checks.map((c) => c.disc)).toEqual([folder]);
    expect(t.asked).toEqual([]);
    t.checks[0]!.ok();
    await turn();
    expect(t.asked).toEqual([folder]);
  });

  it('a refused folder is said in the reader\'s words and its mark taken back; nothing is asked', async () => {
    const t = opener();
    t.open(goodFolder('OTHER'));
    t.checks[0]!.no(new Error('this disc boots SLES_999.99, not SCUS_972.75'));
    await turn();
    expect(t.asked).toEqual([]);
    expect(t.log.slice(-2)).toEqual(['refused', 'failed failed while reading the disc folder OTHER: this disc boots SLES_999.99, not SCUS_972.75']);
  });

  it('a check that resolves after a newer disc was chosen is dropped, as is a late refusal (the newer one wins)', async () => {
    const t = opener();
    t.open(goodFolder('B'));
    t.open(goodFolder('C'));
    const iso = new File([], 'D.iso');
    t.open(iso);
    t.checks[0]!.ok();
    t.checks[1]!.no(new Error('late'));
    await turn();
    expect(t.asked).toEqual([{ kind: 'iso', file: iso }]);
    expect(t.log.filter((l) => l.startsWith('failed') || l === 'refused')).toEqual([]);
  });

  it('a map switch begun during the check: the folder is not asked mid-switch (MJ-3); its mark back, asked for again (F-a)', async () => {
    let busy = false;
    const t = opener({ switching: () => busy });
    t.open(goodFolder());
    busy = true;
    t.checks[0]!.ok();
    await turn();
    expect(t.asked).toEqual([]);
    // Both lines say it: the disc page's own line no longer reads "reading the disc folder SOCOM2 ..." (nothing is read).
    expect(t.log.slice(-3)).toEqual(['refused', 'status a map is still loading: open SOCOM2 again once it is drawn', 'state a map is still loading: open SOCOM2 again once it is drawn']);
  });

  it('a map switch already under way: nothing is chosen or checked, the same words', () => {
    const t = opener({ switching: () => true });
    t.open(goodFolder());
    expect(t.log).toEqual(['status a map is still loading: open SOCOM2 again once it is drawn']);
    expect(t.checks).toEqual([]);
  });
});

describe('/testroom wires the opener and treats a folder as a disc (main.ts)', () => {
  const main = readFileSync(resolve(here, '../src/main.ts'), 'utf-8');
  it('openDisc is discOpener over the page: askIndex, and the older index forgotten (wantedIndex renewed, its source back)', () => {
    expect(main).toMatch(/const openDisc = discOpener\(\{/);
    expect(main).toMatch(/ask: \(disc\) => \{ askIndex\(disc\); \}/);
    expect(main).toMatch(/forget: \(\) => \{ wantedIndex = \+\+requests; wantedIndexFrom = source; \}/);
    expect(main).toMatch(/switching,/);
  });
  it('the verdict note, the pending disc and the empty picker\'s source take a folder as a disc (isDiscRequest)', () => {
    expect(main).toMatch(/verdict\.note \?\? \(isDiscRequest\(wantedIndexFrom\.kind\)/);
    expect(main).toMatch(/const pendingIso = isDiscRequest\(wantedIndexFrom\.kind\) && source === NO_SOURCE;/);
    expect(main).toMatch(/source: isDiscRequest\(source\.kind\) \? 'iso' : 'served'/);
  });
});
