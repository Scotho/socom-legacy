// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SOCOM2_US_BOOT } from '@s2u/archive';
import { buildIso } from '../../../../archive/test/isoImage';
import { bootConsole, type ConsolePage } from '../../../src/console/app';
import { liveDisc, type DiscDeps } from '../../../src/console/adapters/disc';
import { liveLaunch } from '../../../src/console/adapters/launch';
import { sampleAdapters } from '../../../src/console/sampleAdapters';
import { HOME_CATEGORY, type Adapters } from '../../../src/console/state';
import { openedDiscRequest, openFrontEndDisc } from '../../../src/discPrompt';
import type { DiscDirectoryHandle, DiscHandle, PickerScope } from '../../../src/discMemory';
import type { FrontEndMount } from '../../../src/frontEnd';
import { openedDiscImage, publishDiscImage } from '../../../src/modern/discImage';
import { publishDisc, readDisc } from '../../../src/modern/discStore';
import type { ModernSession } from '../../../src/modern/session';
import type { SourceRequest } from '../../../src/worker';
import { discStep, onDiscCheck } from '../discStep';
import { mountShell } from '../shell';

/**
 * CX-10a (console launcher plan, row CX-10, first half): the folder chooser in the console's Disc place. Since CX-16
 * (CX.R9) it is the folder source of Home's one Disc action -- chosen in the dropdown behind the settings icon beside it
 * (`../discSource.test.ts`) -- no second action: these cases set the source and press the Disc action. A disc in a
 * drive, a mounted image or a copy of the disc's files, chosen by the browser's folder picker where it has one
 * (`../../../src/discMemory` `canPickDiscFolder` / `pickDiscFolder`, the handle not stored: remembering is CX-10b's) or
 * else by the page's hidden `<input type=file webkitdirectory>` (`folderRequestFromInput`), or dropped on the window
 * (`folderRequestFromDrop`); each opened by `openFrontEndDisc` exactly where the image goes (DA-3, DA.R8: `SYSTEM.CNF`
 * first). The states mirror the image's: reading, refused in the reader's own words, open with the folder named (`discLabel` / `discName`). START
 * hands the folder's request to the front end as it hands an image's. A browser adaptation (DA.R2, OT.R28) with no
 * original. Generated values only: a `SYSTEM.CNF` in the retail line's form (`docs/roadmap/02-boot.md` B1) and four
 * bytes standing for `RUN/UI/READERC.ZAR`.
 */
let page: ConsolePage | null = null;
// The disc store and the opened source are per Document, and the tests share one: each starts with no disc.
beforeEach(() => { publishDisc(document, { state: 'empty', filename: null }); publishDiscImage(document, null); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; vi.restoreAllMocks(); });

const text = (s: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(s);
const systemCnf = (boot: string): Uint8Array<ArrayBuffer> => text(`BOOT2 = cdrom0:\\${boot};1\r\nVER = 1.00\r\nVMODE = NTSC\r\n`);
/** A picked file, as `<input webkitdirectory>` hands it: its path below the pick, the folder's own name first. */
const picked = (bytes: Uint8Array<ArrayBuffer>, path: string): File => {
  const f = new File([bytes], path.split('/').pop()!, { lastModified: 1_000 });
  Object.defineProperty(f, 'webkitRelativePath', { value: path });
  return f;
};
/** The two files the page's check reads, under the folder `name`, its `SYSTEM.CNF` booting `boot`. */
const folderFiles = (name: string, boot = SOCOM2_US_BOOT): File[] => [
  picked(systemCnf(boot), `${name}/SYSTEM.CNF`),
  picked(new Uint8Array(4), `${name}/RUN/UI/READERC.ZAR`),
];

/** A directory handle as `showDirectoryPicker` answers it (WICG File System Access), over the same two files. */
const fileHandle = (name: string, bytes: Uint8Array<ArrayBuffer>): DiscHandle => ({ kind: 'file', name, getFile: async () => new File([bytes], name) });
const dirHandle = (name: string, children: DiscHandle[]): DiscDirectoryHandle => ({
  kind: 'directory', name,
  async *values() { for (const c of children) yield c; },
});
const discHandle = (name: string, boot = SOCOM2_US_BOOT): DiscDirectoryHandle => dirHandle(name, [
  fileHandle('SYSTEM.CNF', systemCnf(boot)),
  dirHandle('RUN', [dirHandle('UI', [fileHandle('READERC.ZAR', new Uint8Array(4))])]),
]);

/** A dropped entry as `DataTransferItem.webkitGetAsEntry()` answers it. */
type FakeEntry = { isFile: boolean; isDirectory: boolean; name: string; file?: (ok: (f: File) => void) => void; createReader?: () => unknown };
const fileEntry = (f: File): FakeEntry => ({ isFile: true, isDirectory: false, name: f.name, file: (ok) => { ok(f); } });
const dirEntry = (name: string, children: FakeEntry[]): FakeEntry => ({
  isFile: false, isDirectory: true, name,
  createReader: () => {
    let done = false;
    return { readEntries: (ok: (e: FakeEntry[]) => void) => { const b = done ? [] : children; done = true; setTimeout(() => { ok(b); }, 0); } };
  },
});

const settle = async (ms = 0): Promise<void> => {
  for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0));
  if (ms) await new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0));
};

function boot(deps: DiscDeps = {}, over: Partial<Adapters> = {}) {
  const open = vi.fn(openFrontEndDisc);
  const disc = liveDisc(document, () => { page?.render(); }, { openFolder: open, scope: {}, ...deps });
  page = bootConsole(document, window, { ...sampleAdapters(), data: 'live', states: undefined, disc, ...over }, { keymap: true });
  return { disc, open };
}

const items = (): { title: string; sub: string; state: string }[] => [...document.querySelectorAll('#stage .cx-item')].map((e) => ({
  title: e.querySelector('.cx-item__title')!.textContent!,
  sub: e.querySelector('.cx-item__sub')!.textContent!,
  state: e.querySelector('.cx-item__state')?.textContent ?? '',
}));
/** Home's Disc action: since CX-16 the folder's states are its own while the folder is the source; since LR-23 (LR.R22) the legend chip's (`../discStep`; was LR-13's disc check of Play's panel). */
const folderItem = () => discStep(page!);
const crossVerb = (): string => document.querySelector('#legend .cx-prompt')!.textContent!.trim();
/** CX-16: the folder made the active source, as the dropdown makes it. */
const folderSource = (): void => { page!.ctl.A.disc.setSource!('folder'); onDiscCheck(page!); };   // the LR-36 fold: the launch check's disc row, whose Cross is the Disc action (was LR-23: Play's Cross)

describe('CX-10a: the folder chooser in the Disc place (since CX-16, the folder source of the one Disc action)', () => {
  it('Home lists one Disc action; with the folder source Cross is "Choose disc folder" in the legend', () => {
    boot();
    expect(items().map((i) => i.title)).toEqual(['Play SOCOM II', 'Server status', 'Discord']);   // LR-13 (LR.R17)
    folderSource();
    expect(folderItem()).toEqual({ title: 'Disc', sub: 'A drive, a mounted image or a copy of your disc’s files', state: 'NEEDED' });
    expect(page!.ctl.S.item[HOME_CATEGORY]).toBe(0);
    expect(crossVerb()).toBe('Choose disc folder');   // the LR-36 fold: the launch check's disc row names the folder's verb (was LR-23: 'Play SOCOM II: disc needed' on Play)
  });

  it('the picker path: a fake showDirectoryPicker, its request opened by openFrontEndDisc as a dir request; the item names the folder', async () => {
    const showDirectoryPicker = vi.fn(async () => discHandle('SOCOM2'));
    const scope: PickerScope = { showDirectoryPicker };
    const { open } = boot({ scope });
    const input = document.querySelector<HTMLInputElement>('input[webkitdirectory]')!;
    const click = vi.spyOn(input, 'click').mockImplementation(() => {});
    folderSource();
    page!.ctl.press('cross');
    expect(showDirectoryPicker).toHaveBeenCalledTimes(1);
    expect(click).not.toHaveBeenCalled();                       // the API, not the input, where the browser has it
    await settle();
    expect(open).toHaveBeenCalledTimes(1);
    const request = open.mock.calls[0]![0] as Extract<SourceRequest, { kind: 'dir' }>;
    expect(request.kind).toBe('dir');
    expect(request.entries.map((e) => e.path)).toEqual(['SOCOM2/RUN/UI/READERC.ZAR', 'SOCOM2/SYSTEM.CNF']);
    expect(openedDiscRequest()).toBe(request);
    expect(readDisc(document)).toMatchObject({ state: 'ready', filename: 'SOCOM2' });
    expect(openedDiscImage(document)).not.toBeNull();
    page!.render();
    expect(folderItem()).toEqual({ title: 'Disc', sub: 'the disc folder SOCOM2', state: 'READY' });
    expect(page!.ctl.S.toast).toBe('Disc ready: SOCOM2');
    expect(document.querySelector('#legend .cx-mark[data-mark="disc"]')!.classList.contains('is-ready')).toBe(true);   // LR-24 (was: the chip)
  });

  it('a cancelled picker changes nothing; a picker that fails says the browser\'s words on the legend\'s warn line', async () => {
    const abort = Object.assign(new Error('The user aborted a request.'), { name: 'AbortError' });
    const showDirectoryPicker = vi.fn(async (): Promise<DiscDirectoryHandle> => { throw abort; });
    const { open } = boot({ scope: { showDirectoryPicker } });
    folderSource();
    page!.ctl.doAct('disc');
    await settle();
    expect(open).not.toHaveBeenCalled();
    expect(readDisc(document).state).toBe('empty');
    expect(page!.ctl.S.legendError).toBe('');
    showDirectoryPicker.mockImplementation(async () => { throw Object.assign(new Error('Must be handling a user gesture to show a file picker.'), { name: 'SecurityError' }); });
    page!.ctl.doAct('disc');
    await settle();
    expect(readDisc(document).state).toBe('empty');
    expect(page!.ctl.S.legendError).toBe('Must be handling a user gesture to show a file picker.');
  });

  it('the input path: no picker, the page\'s hidden <input webkitdirectory> clicked; its files the same dir request', async () => {
    const { open } = boot();                                    // scope {}: no showDirectoryPicker
    const input = document.querySelector<HTMLInputElement>('input[webkitdirectory]')!;
    expect(input.type).toBe('file');
    expect(input.hasAttribute('webkitdirectory')).toBe(true);
    expect((input as HTMLInputElement & { webkitdirectory?: boolean }).webkitdirectory).toBe(true);
    expect(input.closest('[hidden]')).not.toBeNull();
    const click = vi.spyOn(input, 'click').mockImplementation(() => {});
    folderSource();
    page!.ctl.press('cross');
    expect(click).toHaveBeenCalledTimes(1);
    const files = folderFiles('SOCOM2');
    Object.defineProperty(input, 'files', { configurable: true, value: files });
    input.dispatchEvent(new Event('change'));
    expect(readDisc(document)).toMatchObject({ state: 'reading', filename: 'SOCOM2' });
    page!.render();
    expect(folderItem()).toEqual({ title: 'Disc', sub: 'the disc folder SOCOM2', state: 'READING' });
    await settle();
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0]![0]).toEqual({ kind: 'dir', entries: files.map((file) => ({ path: file.webkitRelativePath, file })) });
    expect(readDisc(document)).toMatchObject({ state: 'ready', filename: 'SOCOM2' });
    page!.render();
    expect(folderItem()).toMatchObject({ sub: 'the disc folder SOCOM2', state: 'READY' });
    expect(page!.ctl.S.toast).toBe('Disc ready: SOCOM2');
    // CX-16: one action -- the Disc action is the folder's while the folder is the source, and names it.
    expect(items().map((i) => i.title)).toEqual(['Play SOCOM II', 'Server status', 'Discord']);   // LR-13 (LR.R17)
  });

  it('a folder whose SYSTEM.CNF boots another game is refused in the reader\'s words: CHECK DISC, START blocked', async () => {
    const { disc } = boot();
    const input = document.querySelector<HTMLInputElement>('input[webkitdirectory]')!;
    Object.defineProperty(input, 'files', { configurable: true, value: folderFiles('OTHER', 'SLUS_209.99') });
    input.dispatchEvent(new Event('change'));
    await settle();
    expect(readDisc(document).state).toBe('error');
    expect(disc.error()).toMatch(/^this disc boots SLUS_209\.99; this game needs a SOCOM U\.S\. Navy SEALs II disc/);
    page!.render();
    expect(folderItem().state).toBe('CHECK DISC');
    expect(folderItem().sub).toBe(disc.error());
    expect(openedDiscImage(document)).toBeNull();
    page!.ctl.press('options');
    expect(page!.ctl.S.legendError).toBe('Choose your disc folder first: Cross on Play, or the disc mark.');   // CX-16: the source's words; LR-24 (was: Home, then Disc)
  });

  it('a folder dropped on the window is read like a dropped image (folderRequestFromDrop), named by its own name', async () => {
    const { open } = boot();
    const [cnf, zar] = folderFiles('SOCOM2');
    const entry = dirEntry('SOCOM2', [fileEntry(cnf!), dirEntry('RUN', [dirEntry('UI', [fileEntry(zar!)])])]);
    const drop = new Event('drop', { cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: { types: ['Files'], files: [new File([], 'SOCOM2')], items: [{ kind: 'file', webkitGetAsEntry: () => entry }] } });
    document.dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(true);
    await settle();
    expect(open).toHaveBeenCalledTimes(1);
    expect((open.mock.calls[0]![0] as { kind: string }).kind).toBe('dir');
    expect(readDisc(document)).toMatchObject({ state: 'ready', filename: 'SOCOM2' });
    page!.render();
    expect(folderItem()).toMatchObject({ sub: 'the disc folder SOCOM2', state: 'READY' });
  });

  it('an image chosen after a folder makes the image the disc and the source again: the Disc action says the image\'s refusal', async () => {
    boot();
    const folder = document.querySelector<HTMLInputElement>('input[webkitdirectory]')!;
    Object.defineProperty(folder, 'files', { configurable: true, value: folderFiles('SOCOM2') });
    folder.dispatchEvent(new Event('change'));
    await settle();
    const image = document.getElementById('disc-page-file') as HTMLInputElement;
    Object.defineProperty(image, 'files', { configurable: true, value: [new File([new Uint8Array(40 * 2048)], 'holiday.iso')] });
    image.dispatchEvent(new Event('change'));
    await settle();
    page!.render();
    expect(folderItem().state).toBe('CHECK DISC');
    expect(page!.ctl.A.disc.source!()).toBe('image');
    page!.ctl.press('circle');                                    // the LR-36 fold: out of the launch check (opened by `folderSource`), back on Play
    expect(crossVerb()).toBe('Play SOCOM II: disc needed');   // LR-23 (LR.R22): Play's Cross names its need (was LR-13's Select on the disc check)
  });

  it('from START\'s press the folder chooser takes nothing (held), as the image\'s', async () => {
    const showDirectoryPicker = vi.fn(async () => discHandle('SOCOM2'));
    const { disc } = boot({ scope: { showDirectoryPicker } });
    disc.hold(true);
    expect(await disc.chooseFolder()).toBe(false);
    expect(showDirectoryPicker).not.toHaveBeenCalled();
  });

  it('START hands the folder chosen here to the front end as its dir request, with the source opened over it', async () => {
    window.history.replaceState(null, '', '/console?menuflow=x');
    const mount = vi.fn((): FrontEndMount => ({ canvas: document.createElement('canvas'), status: '', session: Promise.resolve(null), stop: () => {} }));
    const session = { signOut: async () => {}, end: () => {} } as unknown as ModernSession;
    const launch = liveLaunch(document, { session, mount: mount as never, base: '/', sheets: [], loadSheet: async () => {} });
    const showDirectoryPicker = vi.fn(async () => discHandle('SOCOM2'));
    boot({ scope: { showDirectoryPicker } }, { launch });
    folderSource();
    page!.ctl.doAct('disc');
    await settle();
    const request = openedDiscRequest();
    expect(request?.kind).toBe('dir');
    page!.ctl.press('options');
    await settle(400);
    expect(mount).toHaveBeenCalledTimes(1);
    const [, source, , opts] = mount.mock.calls[0] as unknown as [string, SourceRequest, Document, { assets: unknown }];
    expect(source).toBe(request);
    expect(opts.assets).toBe(openedDiscImage(document));
    expect(readDisc(document)).toMatchObject({ state: 'in-game', filename: 'SOCOM2' });
  });
});

describe('CX-10a: the sample adapters\' folder state (SAMPLE_DATA, for the browser spec)', () => {
  it('the sample folder reads in the prototype\'s 1.2 s and is named in discLabel\'s form', async () => {
    vi.useFakeTimers();
    try {
      const a = sampleAdapters();
      expect(a.disc.kind?.()).toBe('image');
      const read = a.disc.chooseFolder!();
      expect(a.disc.state()).toBe('reading');
      expect(a.disc.kind?.()).toBe('folder');
      await vi.advanceTimersByTimeAsync(1200);
      expect(await read).toBe(true);
      expect(a.disc.state()).toBe('ready');
      expect(a.disc.label?.()).toBe('the disc folder SOCOM2');
      expect(a.disc.title()).toBe('SOCOM2');
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * The review of d69efeb7b (PASS WITH FINDINGS, its one finding): the newest disc chosen wins, whichever way it came. A
 * folder still being walked -- the picker's (its handle walked into a request after the picker answers) or a dropped
 * folder's (`readEntries` until an empty batch) -- yields to an image or a folder chosen meanwhile; and the picker's walk
 * already reads READING, so a second press of either chooser waits for it (the grammar's check).
 */
describe('CX-10a review: the newest choice wins over a folder still being walked', () => {
  const GOOD = (): File => new File([buildIso([{ path: 'RUN/UI/READERC.ZAR', bytes: new Uint8Array(64) }])], 'socom2.iso');
  /** A gate the fake's walk waits on. */
  const gate = () => { let open = (): void => {}; const shut = new Promise<void>((r) => { open = r; }); return { shut, open: () => { open(); } }; };

  it('pick a folder, then an image during the walk: the walk reads READING (a second press waits), and the image stays', async () => {
    const g = gate();
    const slow = discHandle('SOCOM2');
    const walked: DiscDirectoryHandle = { kind: 'directory', name: 'SOCOM2', async *values() { await g.shut; yield* slow.values(); } };
    const showDirectoryPicker = vi.fn(async () => walked);
    const { open } = boot({ scope: { showDirectoryPicker } });
    folderSource();
    page!.ctl.press('cross');
    await settle();
    expect(readDisc(document)).toMatchObject({ state: 'reading', filename: 'SOCOM2' });   // the walk is under way
    page!.ctl.press('cross');                                                            // a second press waits for it
    expect(showDirectoryPicker).toHaveBeenCalledTimes(1);
    const image = document.getElementById('disc-page-file') as HTMLInputElement;
    Object.defineProperty(image, 'files', { configurable: true, value: [GOOD()] });
    image.dispatchEvent(new Event('change'));                                            // an image chosen during the walk
    g.open();
    await settle();
    expect(open).not.toHaveBeenCalled();                                                 // the folder's walk was dropped
    expect(readDisc(document)).toMatchObject({ state: 'ready', filename: 'socom2.iso' });
    expect(openedDiscRequest()?.kind).toBe('iso');
    page!.render();
    expect(folderItem()).toEqual({ title: 'Disc', sub: 'the disc image socom2.iso', state: 'READY' });
    expect(page!.ctl.A.disc.source!()).toBe('image');                                  // the newest choice's kind
  });

  it('drop a folder, then pick a folder on the input during its walk: the pick stays', async () => {
    const { open } = boot();
    const [cnf, zar] = folderFiles('DROPPED');
    let release = (): void => {};
    const held = new Promise<void>((r) => { release = r; });
    // The dropped folder's first `readEntries` answers only once released.
    const slowDir = (name: string, children: FakeEntry[]): FakeEntry => ({
      isFile: false, isDirectory: true, name,
      createReader: () => {
        let done = false;
        return { readEntries: (ok: (e: FakeEntry[]) => void) => { const b = done ? [] : children; done = true; void held.then(() => { ok(b); }); } };
      },
    });
    const entry = slowDir('DROPPED', [fileEntry(cnf!), dirEntry('RUN', [dirEntry('UI', [fileEntry(zar!)])])]);
    const drop = new Event('drop', { cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: { types: ['Files'], files: [new File([], 'DROPPED')], items: [{ kind: 'file', webkitGetAsEntry: () => entry }] } });
    document.dispatchEvent(drop);
    await settle();
    const input = document.querySelector<HTMLInputElement>('input[webkitdirectory]')!;
    const picked = folderFiles('PICKED');
    Object.defineProperty(input, 'files', { configurable: true, value: picked });
    input.dispatchEvent(new Event('change'));                                            // a folder picked during the drop's walk
    release();
    await settle();
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0]![0]).toEqual({ kind: 'dir', entries: picked.map((file) => ({ path: file.webkitRelativePath, file })) });
    expect(readDisc(document)).toMatchObject({ state: 'ready', filename: 'PICKED' });
    page!.render();
    expect(folderItem()).toMatchObject({ sub: 'the disc folder PICKED', state: 'READY' });
  });

  it('a picker walk that fails after the picker answered is the error state in its words, not a READING left behind', async () => {
    const broken: DiscDirectoryHandle = {
      kind: 'directory', name: 'SOCOM2',
      values: () => ({ [Symbol.asyncIterator]: () => ({ next: async (): Promise<IteratorResult<DiscHandle>> => { throw Object.assign(new Error('The requested file could not be read.'), { name: 'NotReadableError' }); } }) }),
    };
    const { disc, open } = boot({ scope: { showDirectoryPicker: async () => broken } });
    expect(await disc.chooseFolder()).toBe(false);
    expect(open).not.toHaveBeenCalled();
    expect(readDisc(document)).toMatchObject({ state: 'error', filename: 'SOCOM2' });
    expect(disc.error()).toBe('The requested file could not be read.');
  });
});
