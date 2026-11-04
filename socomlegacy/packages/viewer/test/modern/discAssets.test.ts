// @vitest-environment jsdom
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseRdr, readZarMembers, type AssetSource } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import type { Rgba } from '@s2u/gs';
import { loadDialog } from '@s2u/ui';
import { dialogTextureStems } from '../../src/frontEndAssets';
import { captionText } from '../../src/armoryLayout';
import { armoryFromDisc } from '../../src/armoryData';
import { bootPage, type PageLoaders } from '../../src/pageEntry';
import type { FrontEndMount } from '../../src/frontEnd';
import { DISC_READERS, discAssetsOf, MEDAL_BANK, MEDAL_DIALOG, MEDAL_TEXTURES, readArmoryItemNames, readMedalPictures, type DiscReaders } from '../../src/modern/discAssets';
import { openedDiscImage, publishDiscImage } from '../../src/modern/discImage';
import { launcherState } from '../../src/modern/launcherState';
import { publishDisc } from '../../src/modern/discStore';
import { locTable } from '@s2u/scene';

/**
 * MU-4b / MU-5b's seam (MU.R1, MU.R3): the image the setup page opened (`src/pageEntry.ts` `offerDisc`, the
 * `IsoAssetSource` `openFrontEndImage` answers) is published for the modern UI, read only, and the launcher's view
 * hands it out -- as two readers of what the original itself reads (`global_valves.rdr`; the ARMORY's item captions) --
 * only while the setup page says the disc is `ready`. Nothing of the setup page or the front end's mount changes.
 */
const fake = (): AssetSource => ({ list: async () => [], read: async (p) => { throw new Error(`no ${p}`); } });

describe('the opened image, published for the modern UI', () => {
  beforeEach(() => { document.body.innerHTML = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../setup/index.html'), 'utf8'); });
  afterEach(() => { publishDiscImage(document, null); publishDisc(document, { state: 'empty', filename: null }); document.body.innerHTML = ''; });

  it('is held per document; null until published, null again once cleared', () => {
    const s = fake();
    expect(openedDiscImage(document)).toBeNull();
    publishDiscImage(document, s);
    expect(openedDiscImage(document)).toBe(s);
    expect(openedDiscImage(document.implementation.createHTMLDocument('other'))).toBeNull();
    publishDiscImage(document, null);
    expect(openedDiscImage(document)).toBeNull();
  });

  it('launcherState.assets() answers the readers only while the disc is ready and an image is published', () => {
    const state = launcherState(document);
    // OV-1: the disc's state is the disc store's (`src/modern/discStore.ts`, which `Startup.sync` publishes into).
    const disc = (st: 'empty' | 'reading' | 'ready'): void => { publishDisc(document, { state: st, filename: st === 'empty' ? null : 'SOCOM II.iso' }); };
    disc('empty');
    expect(state.assets!()).toBeNull();
    publishDiscImage(document, fake());
    disc('reading');
    expect(state.assets!()).toBeNull();
    disc('ready');
    const a = state.assets!();
    expect(a).not.toBeNull();
    expect(typeof a!.readValveDefaults).toBe('function');
    expect(typeof a!.readItemNames).toBe('function');
    expect(state.assets!()).toBe(a);                    // one facade per image: its reads are made once
    publishDiscImage(document, null);
    expect(state.assets!()).toBeNull();
  });

  it('each reader runs once per image, its answer shared; a refusal is said and tried again on the next call', async () => {
    const valves = vi.fn(async () => [{ name: 'AutoAim', value: 1, type: 'PERSIST' }]);
    let fail = true;
    const itemNames = vi.fn(async () => { if (fail) throw new Error('UIZANIM missing'); return new Map([[1, 'M16A2']]); });
    const readers: DiscReaders = { valves, itemNames };
    const a = discAssetsOf(fake(), readers);
    const [x, y] = await Promise.all([a.readValveDefaults(), a.readValveDefaults()]);
    expect(x).toBe(y);
    expect(valves).toHaveBeenCalledTimes(1);
    await expect(a.readItemNames()).rejects.toThrow('UIZANIM missing');
    fail = false;
    expect((await a.readItemNames()).get(1)).toBe('M16A2');
    expect(itemNames).toHaveBeenCalledTimes(2);
  });

  it('MU2-7: the medal pictures are read once per image, kept in memory, a refusal tried again on the next call', async () => {
    const pic = (n: number): Rgba => ({ width: 16, height: 16, data: new Uint8ClampedArray(16 * 16 * 4).fill(n) });
    let fail = true;
    const medals = vi.fn(async () => { if (fail) throw new Error('RUN/UI/UIMP_TXR.ZED: missing'); return new Map([[1, pic(1)], [5, pic(5)]]); });
    const a = discAssetsOf(fake(), { valves: async () => [], itemNames: async () => new Map(), medals });
    await expect(a.readMedalPictures!()).rejects.toThrow('UIMP_TXR.ZED');
    fail = false;
    const [x, y] = await Promise.all([a.readMedalPictures!(), a.readMedalPictures!()]);
    expect(x).toBe(y);
    expect(x.get(5)!.data[0]).toBe(5);
    expect(await a.readMedalPictures!()).toBe(x);           // held in memory: no second read of the bank
    expect(medals).toHaveBeenCalledTimes(2);
    // A test's readers with none: the read refuses (as the other optional readers do), nothing is invented.
    await expect(discAssetsOf(fake(), { valves: async () => [], itemNames: async () => new Map() }).readMedalPictures!()).rejects.toThrow('no medal reader');
    expect(DISC_READERS.medals).toBe(readMedalPictures);
  });

  it('MU2-7: the medal reader takes the bank and the five names it reads, nothing else of the image', async () => {
    const asked: string[] = [];
    const src: AssetSource = { list: async () => [], read: async (p) => { asked.push(p); throw new Error(`no ${p}`); } };
    await expect(readMedalPictures(src)).rejects.toThrow(`RUN/UI/${MEDAL_BANK}_TXR.ZED`);
    expect(asked.sort()).toEqual([`RUN/UI/${MEDAL_BANK}_PAL.ZED`, `RUN/UI/${MEDAL_BANK}_TXR.ZED`]);
    expect(MEDAL_TEXTURES).toEqual(['null.tif', 'Medal_Blue.tif', 'Medal_Bronze.tif', 'Medal_Silver.tif', 'Medal_Gold.tif', 'Medal_Black.tif']);
  });

  // CX-9b (CX.R8): the setup page and its START went with the old layout, so the image that opens is mounted at once
  // (`offerDisc`): a refused image clears what was published, and the one that opens is published for the front end's
  // mount.
  it('pageEntry publishes the image that opened, and clears it when one is read or refused', async () => {
    document.body.className = 'panel-collapsed';
    const opened = fake();
    let refuse = true;
    const mount: FrontEndMount = { canvas: document.createElement('canvas'), status: 'test', session: Promise.resolve(null), stop: () => {} };
    const loaders: PageLoaders = {
      main: async () => {},
      frontEnd: async () => ({ mountFrontEnd: () => mount }),
      openDisc: async () => { if (refuse) throw new Error('ISO: not an ISO9660 image'); return opened; },
    };
    const entry = await bootPage('/', document, loaders);
    const choose = (name: string): void => {
      const input = document.getElementById('disc-page-file') as HTMLInputElement;
      Object.defineProperty(input, 'files', { value: [new File([new Uint8Array(8)], name)], configurable: true });
      input.dispatchEvent(new Event('change'));
    };
    publishDiscImage(document, opened);                 // something held before: the next read clears it
    choose('bad.iso');
    expect(openedDiscImage(document)).toBeNull();      // reading the next image: the last one is no longer the disc
    await vi.waitFor(() => expect(document.getElementById('disc-state')!.classList.contains('is-bad')).toBe(true));
    expect(openedDiscImage(document)).toBeNull();
    refuse = false;
    choose('SOCOM II.iso');
    if (entry.entry !== 'disc') throw new Error(entry.entry);
    expect(await entry.mount).toBe(mount);
    expect(openedDiscImage(document)).toBe(opened);
  });
});

/**
 * MU2-7 (RS.R8, MU.R2): the row's modules hold nothing they read: no browser storage, no cookie, no cache, no file
 * written, no store of the card or the page imported -- the disc's assets are decoded at use and kept in this page's
 * memory only (the facades' promises), and the disc state lives in the page's memory (per Document) until it closes.
 */
describe('the disc and launch modules write nothing anywhere (MU2-7)', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = resolve(here, '../../src/modern');
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.ts$/.test(f) ? [p] : [];
  });
  // CX-25: `launch/` (the modern Launch, `createLaunch`) went with the modern shell; the row's other modules stay.
  const ROW = ['discImage.ts', 'discStore.ts', 'discAssets.ts', 'launchGate.ts', 'launcherState.ts'];
  it.each(ROW)('%s', (name) => {
    const text = readFileSync(join(src, name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(text).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie|\bcaches\b|navigator\.storage|showSaveFilePicker|createWritable|serviceWorker/);
    expect(text).not.toMatch(/from '[./]*(pageStore|cardSave|settings\/store)'/);
    expect(text).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon/);   // and asks no server (MU.R6: none)
  });
});

const DISC = process.env.SOCOM_DISC ?? '';
const HAVE_DISC = DISC !== '' && existsSync(join(DISC, 'RUN', 'UIZANIM.ZAR')) && existsSync(join(DISC, 'RUN', 'READERC.ZAR'));

describe.skipIf(!HAVE_DISC)(`the readers on the dev disc${HAVE_DISC ? '' : ' (SOCOM_DISC with RUN/UIZANIM.ZAR and RUN/READERC.ZAR absent: skipped)'}`, () => {
  it('readValveDefaults is global_valves.rdr whole: 185 rows, 65 typed PERSIST (research 229 §2)', async () => {
    const rows = await discAssetsOf(new FsAssetSource(DISC)).readValveDefaults();
    expect(rows).toHaveLength(185);
    expect(rows.filter((r) => r.type === 'PERSIST')).toHaveLength(65);
  });

  it('readItemNames is the ARMORY\'s own weapmodeltext caption for each UI index, through UIMnLOC', async () => {
    const source = new FsAssetSource(DISC);
    const names = await readArmoryItemNames(source);
    // The ARMORY's own data (`armoryFromDisc`: the same scripts and strings), its caption per item (`Armory.view`'s name).
    const data = await armoryFromDisc(source, 'RUN/MP1.ZDB', 'MP1', { models: false });
    const loc = locTable(data.strings);
    for (const item of data.items) {
      const shown = captionText(item.caption, loc);
      if (shown.trim() === '') expect(names.has(item.ui), `UI ${item.ui}`).toBe(false);
      else expect(names.get(item.ui), `UI ${item.ui}`).toBe(shown);
    }
    expect(names.get(1)).toBe(DEV_DISC_UI1_NAME);
  });
});

const HAVE_MEDALS = HAVE_DISC && existsSync(join(DISC, 'RUN', 'UI', 'READERC.ZAR')) && existsSync(join(DISC, 'RUN', 'UI', 'UIMP_TXR.ZED'));

describe.skipIf(!HAVE_MEDALS)(`MU2-7: the medal pictures on the dev disc${HAVE_MEDALS ? '' : ' (SOCOM_DISC with RUN/UI/READERC.ZAR and RUN/UI/UIMP_TXR.ZED absent: skipped)'}`, () => {
  it('the medal column\'s TEXTURES and the foot\'s five pictures are the dialog\'s own; its bank is the one LIBRARIES names', async () => {
    const source = new FsAssetSource(DISC);
    const bytes = (await readZarMembers(source, 'RUN/UI/READERC.ZAR', [MEDAL_DIALOG])).get(MEDAL_DIALOG)!;
    const design = loadDialog(parseRdr(bytes));
    expect(dialogTextureStems(design)).toContain(MEDAL_BANK);
    // PLAYER RANKING's list: an IMAGE column whose TEXTURES are indexed by the medal (research 155 §2.3, R147.6).
    expect(JSON.stringify(design)).toContain(JSON.stringify(MEDAL_TEXTURES));
    // The foot: `Medal_Blue` .. `Medal_Black` beside the persona's name (`playername`), 16 x 16, one per medal 1-5 (R155.11).
    const foot = [...design.objects, ...design.controls].filter((o) => o.childOf === 'playername' && /^Medal_/.test(o.name ?? ''));
    expect(foot.map((o) => [o.name, (o.widget as { image?: { filename: string; size: number[] } }).image?.filename, (o.widget as { image?: { size: number[] } }).image?.size.join('x')]))
      .toEqual(MEDAL_TEXTURES.slice(1).map((t) => [t.replace(/\.tif$/, ''), t, '16x16']));
  });

  it('readMedalPictures decodes the five off the image, 16 x 16, top row first, each drawn (not blank)', async () => {
    const pics = await readMedalPictures(new FsAssetSource(DISC));
    expect([...pics.keys()]).toEqual([1, 2, 3, 4, 5]);
    for (const [m, p] of pics) {
      expect([p.width, p.height], `medal ${m}`).toEqual([16, 16]);
      expect(p.data.length).toBe(16 * 16 * 4);
      let opaque = 0;
      for (let i = 3; i < p.data.length; i += 4) if (p.data[i]! > 0) opaque++;
      expect(opaque, `medal ${m}`).toBeGreaterThan(0);
    }
    // Five different pictures: no medal answered with another's.
    expect(new Set([...pics.values()].map((p) => Array.from(p.data).join(','))).size).toBe(5);
  });
});

/** UI 1's caption as the dev disc gives it (item 51, `UI_OF_ITEM`): read off the disc by this reader, and by the ARMORY's. */
const DEV_DISC_UI1_NAME = 'RIFLE: M16A2';
