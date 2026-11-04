// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launcherState } from '../../src/modern/launcherState';
import { publishDisc, readDisc } from '../../src/modern/discStore';
import { publishDiscImage } from '../../src/modern/discImage';
import { bootPage, PAGE_LOADERS } from '../../src/pageEntry';
import type { FrontEndMount } from '../../src/frontEnd';
import { SOCOM2_US_BOOT, type AssetSource } from '@s2u/archive';
import { buildIso } from '../../../archive/test/isoImage';
import { openFrontEndDisc } from '../../src/discPrompt';
import { dirRequest } from '../../src/discSource';

/**
 * MU-1 (MU.R3): the modern shell reads the launcher's ISO state through a read-only view of the disc store
 * (`src/modern/discStore.ts`, OV-1). CX-9b (CX.R8): the setup page's `Startup`, which published the reading, the ready
 * and the refusal, went with the old layout; the page entry publishes the reading, the refusal and the launch's
 * `in-game` (`src/pageEntry.ts` `offerDisc`), and the store is driven directly here where `Startup` drove it.
 */
vi.mock('../../src/touch', () => ({ touchDevice: vi.fn(() => false) }));

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const html = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../setup/index.html'), 'utf8');
const body = (): string => html.slice(html.indexOf('<body'), html.indexOf('</body>')).replace(/^<body[^>]*>/, '').replace(/<script[\s\S]*?<\/script>/g, '');

describe('launcherState (the launcher ISO state, read only)', () => {
  afterEach(() => { vi.restoreAllMocks(); document.body.className = ''; publishDisc(document, { state: 'empty', filename: null }); });
  beforeEach(() => {
    document.body.innerHTML = body();
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(0);
  });
  it('reads empty, reading, ready and error as the disc store holds them, and says each change once', async () => {
    const state = launcherState(document);
    expect(state.disc()).toBe('empty');
    expect(state.isoInserted()).toBe(false);
    const seen: string[] = [];
    const off = state.onChange((s) => seen.push(`${s.disc}:${s.isoInserted}`));
    publishDisc(document, { state: 'reading', filename: 'SOCOM II.iso' });
    await settle();
    expect(state.disc()).toBe('reading');
    expect(state.isoInserted()).toBe(false);
    expect(state.filename()).toBe('SOCOM II.iso');
    publishDisc(document, { state: 'ready', filename: 'SOCOM II.iso' });
    await settle();
    expect(state.disc()).toBe('ready');
    expect(state.isoInserted()).toBe(true);
    publishDisc(document, { state: 'ready', filename: 'SOCOM II.iso' });   // a publish that changes nothing: no second report
    await settle();
    publishDisc(document, { state: 'error', filename: 'SOCOM II.iso' });
    await settle();
    expect(state.disc()).toBe('error');
    expect(state.isoInserted()).toBe(false);
    expect(seen).toEqual(['reading:false', 'ready:true', 'error:false']);
    off();
    publishDisc(document, { state: 'reading', filename: 'again.iso' });
    await settle();
    expect(seen).toHaveLength(3);
  });
  it('has no setters: the view cannot change the launcher', () => {
    const state = launcherState(document) as unknown as Record<string, unknown>;
    // assets(): readers, no setter (MU-4b/5b); kind, label, refusal (MU2-7): the opened disc's facts, read only.
    expect(Object.keys(state).sort()).toEqual(['assets', 'disc', 'filename', 'isoInserted', 'kind', 'label', 'onChange', 'refusal']);
    expect(Object.isFrozen(state)).toBe(true);
  });
  it('reads empty where nothing was published (the test room, a fresh document)', () => {
    const state = launcherState(document.implementation.createHTMLDocument('fresh'));
    expect(state.disc()).toBe('empty');
    expect(state.isoInserted()).toBe(false);
    expect(state.filename()).toBeNull();
  });
  it('reads in-game once the opened image has mounted the front end: the disc is still in, the disc page gone (OV-1)', async () => {
    const mount: FrontEndMount = { canvas: document.createElement('canvas'), status: 'test', session: Promise.resolve(null), stop: () => {} };
    const fake: AssetSource = { list: async () => [], read: async (p) => { throw new Error(`no ${p}`); } };
    const r = await bootPage('/', document, { ...PAGE_LOADERS, frontEnd: async () => ({ mountFrontEnd: () => mount }), openDisc: async () => fake });
    const state = launcherState(document);
    const seen: string[] = [];
    const off = state.onChange((s) => seen.push(s.disc));
    const input = document.getElementById('disc-page-file') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [new File([new Uint8Array(8)], 'SOCOM II.iso')], configurable: true });
    input.dispatchEvent(new Event('change'));
    expect(await (r as { mount: Promise<FrontEndMount | null> }).mount).toBe(mount);
    expect(document.getElementById('disc-page')).toBeNull();
    expect(state.disc()).toBe('in-game');
    expect(state.isoInserted()).toBe(true);                   // MU2-7: the disc is still in (the console reads it ready)
    expect(state.assets!()).not.toBeNull();                  // and its readers are handed out over the running game
    expect(state.filename()).toBe('SOCOM II.iso');
    expect(seen).toEqual(['reading', 'in-game']);              // CX-9b: no START between them, so no `ready` on the way
    off();
  });
});

/**
 * MU2-7 (CX.R5, MU2.R6): the modern disc state is the console's -- the same store and the same opened request, read
 * alike. `in-game` is the disc still in (the console's disc adapter reads it `ready`, `src/console/adapters/disc.ts`
 * `state()`), so the readers stay handed out over the running game; the opened disc's kind and its words are the
 * opened request's (`src/discPrompt.ts` `openedDiscRequest`, named by `src/discSource.ts` `discLabel`), and a refusal
 * is the reader's own words as the store holds them. Generated values only.
 */
describe('launcherState: one truth with the console (MU2-7)', () => {
  const fake = (): AssetSource => ({ list: async () => [], read: async (p) => { throw new Error(`no ${p}`); } });
  afterEach(() => { publishDiscImage(document, null); publishDisc(document, { state: 'empty', filename: null }); });

  it('in-game is the disc in: isoInserted, and the same readers as ready (one facade per image)', () => {
    const state = launcherState(document);
    const image = fake();
    publishDiscImage(document, image);
    publishDisc(document, { state: 'ready', filename: 'SOCOM II.iso' });
    const ready = state.assets!();
    expect(ready).not.toBeNull();
    publishDisc(document, { state: 'in-game', filename: 'SOCOM II.iso' });
    expect(state.isoInserted()).toBe(true);
    expect(state.assets!()).toBe(ready);
    const seen: boolean[] = [];
    const off = state.onChange((s) => seen.push(s.isoInserted));
    publishDisc(document, { state: 'ready', filename: 'SOCOM II.iso' });   // the hand-over refused: back to ready
    publishDisc(document, { state: 'in-game', filename: 'SOCOM II.iso' });
    expect(seen).toEqual([true, true]);
    off();
    publishDiscImage(document, null);
    expect(state.assets!()).toBeNull();                       // no image behind it: no readers, whatever the state says
  });

  it('kind and label are the opened request\'s, named by discLabel, only while the disc is in', async () => {
    // `kind`, `label` and `refusal` are optional on `LauncherState` (an older fake has none); `launcherState` gives each (`!`).
    const state = launcherState(document);
    expect([state.kind!(), state.label!()]).toEqual([null, '']);
    // An image opened by the page's reader (`openFrontEndDisc`, the console's and the game page's).
    const file = new File([buildIso([{ path: 'RUN/UI/READERC.ZAR', bytes: new Uint8Array(64) }])], 'socom2.iso');
    publishDisc(document, { state: 'reading', filename: 'socom2.iso' });
    const opening = openFrontEndDisc({ kind: 'iso', file });
    expect([state.kind!(), state.label!()]).toEqual([null, '']);   // reading: nothing open yet
    publishDiscImage(document, await opening);
    publishDisc(document, { state: 'ready', filename: 'socom2.iso' });
    expect([state.kind!(), state.label!()]).toEqual(['image', 'the disc image socom2.iso']);
    publishDisc(document, { state: 'in-game', filename: 'socom2.iso' });
    expect([state.kind!(), state.label!()]).toEqual(['image', 'the disc image socom2.iso']);
    // A folder: a copy of the disc's files, its SYSTEM.CNF booting the retail line (DA.R8).
    const pick = (bytes: Uint8Array<ArrayBuffer>, path: string): File => {
      const f = new File([bytes], path.split('/').pop()!);
      Object.defineProperty(f, 'webkitRelativePath', { value: path });
      return f;
    };
    const cnf = new TextEncoder().encode(`BOOT2 = cdrom0:\\${SOCOM2_US_BOOT};1\r\nVER = 1.00\r\nVMODE = NTSC\r\n`);
    const folder = dirRequest([pick(cnf, 'SOCOM2/SYSTEM.CNF'), pick(new Uint8Array(4), 'SOCOM2/RUN/UI/READERC.ZAR')]);
    publishDiscImage(document, null);
    publishDisc(document, { state: 'reading', filename: 'SOCOM2' });
    const source = await openFrontEndDisc(folder);
    expect([state.kind!(), state.label!()]).toEqual([null, '']);   // still reading in the store's words
    publishDiscImage(document, source);
    publishDisc(document, { state: 'ready', filename: 'SOCOM2' });
    expect([state.kind!(), state.label!()]).toEqual(['folder', 'the disc folder SOCOM2']);
    publishDisc(document, { state: 'error', filename: 'SOCOM2' });
    expect([state.kind!(), state.label!()]).toEqual([null, '']);
  });

  it('a refusal is the reader\'s words the store holds, only while the state is error', () => {
    // `kind`, `label` and `refusal` are optional on `LauncherState` (an older fake has none); `launcherState` gives each (`!`).
    const state = launcherState(document);
    expect(state.refusal!()).toBe('');
    publishDisc(document, { state: 'reading', filename: 'bad.iso' });
    publishDisc(document, { state: 'error', filename: 'bad.iso', refusal: 'ISO: not an ISO9660 image (no CD001 at sector 16)' });
    expect(state.refusal!()).toBe('ISO: not an ISO9660 image (no CD001 at sector 16)');
    expect(readDisc(document).refusal).toBe('ISO: not an ISO9660 image (no CD001 at sector 16)');
    publishDisc(document, { state: 'reading', filename: 'next.iso' });
    expect(state.refusal!()).toBe('');
    expect(readDisc(document).refusal).toBeNull();
    publishDisc(document, { state: 'error', filename: 'next.iso' });   // a writer that says no words: none invented
    expect(state.refusal!()).toBe('');
  });
});
