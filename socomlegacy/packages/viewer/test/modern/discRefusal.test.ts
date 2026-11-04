// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssetSource } from '@s2u/archive';
import { liveDisc } from '../../src/console/adapters/disc';
import type { DiscDirectoryHandle, DiscHandle } from '../../src/discMemory';
import { bootPage, type PageLoaders } from '../../src/pageEntry';
import type { FrontEndMount } from '../../src/frontEnd';
import { publishDiscImage } from '../../src/modern/discImage';
import { publishDisc, readDisc } from '../../src/modern/discStore';
import { launcherState } from '../../src/modern/launcherState';
import { mountShell } from '../console/shell';

/**
 * MU2-8 (MU2-7's seam, the controller's assignment): a refusal's words reach the disc store, so the modern UI's
 * `launcherState.refusal()` says what the console's Disc line says (CX.R5). MU2-7 gave `publishDisc` an optional
 * `refusal` and `launcherState` its reader; the three failure sites now write it, each in the reader's own words (never
 * new wording): the console's disc adapter -- an image or a folder refused (`read`), a folder picker's walk that fails
 * (`chooseFolder`) -- and the game page's disc page (`pageEntry` `offerDisc`: the bare message, as the console's
 * `error()` holds it, not the page's "failed while reading ..." line).
 */
const settle = async (): Promise<void> => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0)); };

describe('the console\'s disc adapter writes the refusal\'s words into the store', () => {
  let dispose: (() => void) | null = null;
  beforeEach(() => { publishDisc(document, { state: 'empty', filename: null }); publishDiscImage(document, null); mountShell(document); });
  afterEach(() => { dispose?.(); dispose = null; vi.restoreAllMocks(); });

  it('an image refused (read\'s rejection): the reader\'s words, as the adapter\'s own error() says them', async () => {
    const words = 'this is not a SOCOM II disc image: RUN/UI/READERC.ZAR is missing';
    const disc = liveDisc(document, () => {}, { open: async () => { throw new Error(words); } });
    dispose = () => { disc.dispose(); };
    const input = document.getElementById('disc-page-file') as HTMLInputElement;
    Object.defineProperty(input, 'files', { configurable: true, value: [new File([new Uint8Array(8)], 'holiday.iso')] });
    input.dispatchEvent(new Event('change'));
    await settle();
    expect(readDisc(document)).toMatchObject({ state: 'error', filename: 'holiday.iso', refusal: words });
    expect(disc.error()).toBe(words);
    expect(launcherState(document).refusal?.()).toBe(words);
  });

  it('a folder picker\'s walk that fails (chooseFolder): the browser\'s words, the folder\'s name kept', async () => {
    const broken: DiscDirectoryHandle = {
      kind: 'directory', name: 'SOCOM2',
      values: () => ({ [Symbol.asyncIterator]: () => ({ next: async (): Promise<IteratorResult<DiscHandle>> => { throw Object.assign(new Error('The requested file could not be read.'), { name: 'NotReadableError' }); } }) }),
    };
    const disc = liveDisc(document, () => {}, { scope: { showDirectoryPicker: async () => broken } });
    dispose = () => { disc.dispose(); };
    expect(await disc.chooseFolder()).toBe(false);
    expect(readDisc(document)).toMatchObject({ state: 'error', filename: 'SOCOM2', refusal: 'The requested file could not be read.' });
    expect(launcherState(document).refusal?.()).toBe(disc.error());
  });

  it('the next disc chosen drops the words with the error (reading, then ready)', async () => {
    let fail = true;
    const fake: AssetSource = { list: async () => [], read: async (p) => { throw new Error(`no ${p}`); } };
    const disc = liveDisc(document, () => {}, { open: async () => { if (fail) throw new Error('refused'); return fake; } });
    dispose = () => { disc.dispose(); };
    const input = document.getElementById('disc-page-file') as HTMLInputElement;
    const pick = (name: string): void => {
      Object.defineProperty(input, 'files', { configurable: true, value: [new File([new Uint8Array(8)], name)] });
      input.dispatchEvent(new Event('change'));
    };
    pick('a.iso');
    await settle();
    expect(launcherState(document).refusal?.()).toBe('refused');
    fail = false;
    pick('b.iso');
    expect(readDisc(document).refusal).toBeNull();
    await settle();
    expect(readDisc(document)).toMatchObject({ state: 'ready', refusal: null });
    expect(launcherState(document).refusal?.()).toBe('');
  });
});

describe('the game page\'s disc page (pageEntry offerDisc) writes the reader\'s bare words', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const html = readFileSync(resolve(here, '../../setup/index.html'), 'utf-8');
  const body = (): string => html.slice(html.indexOf('<body'), html.indexOf('</body>')).replace(/^<body[^>]*>/, '').replace(/<script[\s\S]*?<\/script>/g, '');
  beforeEach(() => { publishDisc(document, { state: 'empty', filename: null }); document.body.innerHTML = body(); });
  afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; });

  it('an image refused: the store holds the message, the page\'s line keeps its "failed while reading ..." wording', async () => {
    const words = 'this is not a SOCOM II disc image: RUN/UI/READERC.ZAR is missing';
    const mount: FrontEndMount = { canvas: document.createElement('canvas'), status: 'test', session: Promise.resolve(null), stop: () => {} };
    const loaders: PageLoaders = {
      main: async () => {},
      frontEnd: async () => ({ mountFrontEnd: () => mount }),
      openDisc: async () => { throw new Error(words); },
    };
    await bootPage('?menuflow', document, loaders);
    const e = new Event('drop', { cancelable: true });
    Object.defineProperty(e, 'dataTransfer', { value: { types: ['Files'], files: [new File([new Uint8Array(8)], 'holiday.iso')] } });
    document.dispatchEvent(e);
    await settle();
    expect(readDisc(document)).toMatchObject({ state: 'error', filename: 'holiday.iso', refusal: words });
    expect(launcherState(document).refusal?.()).toBe(words);
    expect(document.getElementById('disc-state')!.textContent).toBe(`failed while reading the disc image holiday.iso: ${words}`);
  });
});
