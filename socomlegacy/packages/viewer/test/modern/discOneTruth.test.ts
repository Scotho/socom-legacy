// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SOCOM2_US_BOOT } from '@s2u/archive';
import { buildIso } from '../../../archive/test/isoImage';
import { liveDisc, type LiveDisc } from '../../src/console/adapters/disc';
import { publishDiscImage } from '../../src/modern/discImage';
import { publishDisc, readDisc, type DiscStoreState } from '../../src/modern/discStore';
import { launcherState } from '../../src/modern/launcherState';

/**
 * MU2-7 (CX.R5: what the modern UI says of the disc is what the console's readers report; MU2.R6): the console's disc
 * adapter (`src/console/adapters/disc.ts` `liveDisc`) chooses and opens the disc with the page's own readers
 * (`src/discPrompt.ts` `openFrontEndImage` / `openFrontEndDisc`: an ISO9660 image, or a folder whose `SYSTEM.CNF` boots
 * a release of SOCOM II, DA.R8) and publishes into the page's disc store; the modern UI reads the same store and the same
 * opened request through `launcherState` -- never a second reader, never its own words. Each of the four states is
 * reached here through those readers, never by a fake of the store; the `in-game` the hand-over publishes is read alike.
 * Generated values only: a 64-byte stand-in for `RUN/UI/READERC.ZAR` in a built image, a `SYSTEM.CNF` in the retail
 * line's form.
 */
let disc: LiveDisc | null = null;
beforeEach(() => { publishDisc(document, { state: 'empty', filename: null }); publishDiscImage(document, null); document.body.innerHTML = ''; });
afterEach(() => { disc?.dispose(); disc = null; });

const settle = async (): Promise<void> => { for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0)); };
const text = (s: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(s);
const picked = (bytes: Uint8Array<ArrayBuffer>, path: string): File => {
  const f = new File([bytes], path.split('/').pop()!, { lastModified: 1_000 });
  Object.defineProperty(f, 'webkitRelativePath', { value: path });
  return f;
};
const folderFiles = (name: string, boot = SOCOM2_US_BOOT): File[] => [
  picked(text(`BOOT2 = cdrom0:\\${boot};1\r\nVER = 1.00\r\nVMODE = NTSC\r\n`), `${name}/SYSTEM.CNF`),
  picked(new Uint8Array(4), `${name}/RUN/UI/READERC.ZAR`),
];
const choose = (selector: string, files: File[]): void => {
  const input = document.querySelector<HTMLInputElement>(selector)!;
  Object.defineProperty(input, 'files', { configurable: true, value: files });
  input.dispatchEvent(new Event('change'));
};
const image = (): void => { choose('#disc-page-file', [new File([buildIso([{ path: 'RUN/UI/READERC.ZAR', bytes: new Uint8Array(64) }])], 'socom2.iso')]); };

/** What the console's START and Home read of the disc, beside what the modern UI reads of it. */
function both(d: LiveDisc): { console: [string, boolean, string]; modern: [string, boolean, string] } {
  // `kind` and `label` are optional on `LauncherState` (an older fake has none); `launcherState` gives each (`!`).
  const m = launcherState(document);
  const consoleIn = d.state() === 'ready';
  return {
    console: [d.state(), consoleIn, consoleIn ? d.label() : ''],
    modern: [m.disc() === 'in-game' ? 'ready' : m.disc(), m.isoInserted(), m.label!()],
  };
}

describe('the disc, read alike by the console and the modern UI (MU2-7)', () => {
  it('an image: reading, then open -- the same state, the same words (discLabel), the kind the opened request\'s', async () => {
    disc = liveDisc(document, () => {});
    expect(both(disc).modern).toEqual(both(disc).console);
    image();
    expect(readDisc(document).state).toBe('reading');
    expect(both(disc).modern).toEqual(both(disc).console);
    await settle();
    expect(disc.state()).toBe('ready');
    expect(both(disc).modern).toEqual(['ready', true, 'the disc image socom2.iso']);
    expect(both(disc).modern).toEqual(both(disc).console);
    expect([launcherState(document).kind!(), disc.kind()]).toEqual(['image', 'image']);   // kind: optional on LauncherState, launcherState gives it
    expect(launcherState(document).assets!()).not.toBeNull();       // the readers over the very source the console opened
  });

  it('a folder (a drive, a mounted image or a copy of the files): open under its own name, the kind a folder', async () => {
    disc = liveDisc(document, () => {});
    choose('#disc-page-folder', folderFiles('SOCOM2'));
    expect(both(disc).modern).toEqual(both(disc).console);
    await settle();
    expect(both(disc).modern).toEqual(['ready', true, 'the disc folder SOCOM2']);
    expect(both(disc).modern).toEqual(both(disc).console);
    expect([launcherState(document).kind!(), disc.kind()]).toEqual(['folder', 'folder']);   // kind: optional on LauncherState, launcherState gives it
    expect(launcherState(document).filename()).toBe('SOCOM2');
  });

  it('a refusal: error alike, the disc out alike, no readers handed out (the words: the console\'s adapter keeps them)', async () => {
    disc = liveDisc(document, () => {});
    choose('#disc-page-folder', folderFiles('OTHER', 'SLUS_209.99'));
    await settle();
    expect(disc.error()).toMatch(/^this disc boots SLUS_209\.99; this game needs a SOCOM U\.S\. Navy SEALs II disc/);
    expect(both(disc).modern).toEqual(['error', false, '']);
    expect(both(disc).modern).toEqual(both(disc).console);
    expect(launcherState(document).assets!()).toBeNull();
    choose('#disc-page-file', [new File([new Uint8Array(4096)], 'not-a-disc.iso')]);
    await settle();
    expect(disc.error()).not.toBe('');                                // the image reader's own words
    expect(both(disc).modern).toEqual(both(disc).console);
  });

  it('every state of the store is read alike: the disc in exactly when the console\'s disc adapter says ready', async () => {
    disc = liveDisc(document, () => {});
    image();
    await settle();
    const states: DiscStoreState[] = ['empty', 'reading', 'ready', 'error', 'in-game'];
    for (const s of states) {
      publishDisc(document, { state: s, filename: s === 'empty' ? null : 'socom2.iso' });
      const m = launcherState(document);
      expect(m.isoInserted(), s).toBe(disc.state() === 'ready');
      expect(m.assets!() !== null, s).toBe(disc.state() === 'ready');
    }
  });
});
