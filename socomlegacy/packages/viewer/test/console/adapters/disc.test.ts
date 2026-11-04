// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildIso } from '../../../../archive/test/isoImage';
import { bootConsole, type ConsolePage } from '../../../src/console/app';
import { liveDisc } from '../../../src/console/adapters/disc';
import { sampleAdapters } from '../../../src/console/sampleAdapters';
import { openedDiscImage } from '../../../src/modern/discImage';
import { readDisc } from '../../../src/modern/discStore';
import { discStep, onDiscCheck } from '../discStep';
import { mountShell } from '../shell';

/**
 * The console launcher's disc adapter (slice 2, part a): the visitor's own image chosen by the Disc item or the legend's
 * chip (a file picker) or dropped on the window, opened by the page's reader (`../../src/discPrompt` `openFrontEndImage`,
 * the real one here), its state published into the page's disc store (`../../src/modern/discStore`, per Document) and
 * read back. The error state the prototype lacks shows the reader's words once, in the Disc item and the chip. A browser
 * adaptation with no original (OT.R28): the image is read in this page, never uploaded.
 */
let page: ConsolePage | null = null;
beforeEach(() => { mountShell(document); });
afterEach(() => { page?.dispose(); page = null; vi.restoreAllMocks(); });

const NOT_AN_ISO = (): File => new File([new Uint8Array(40 * 2048)], 'holiday.iso');
const GOOD = (): File => new File([buildIso([{ path: 'RUN/UI/READERC.ZAR', bytes: new Uint8Array(64) }])], 'socom2.iso');

function boot() {
  const notify = vi.fn();
  const disc = liveDisc(document, notify);
  page = bootConsole(document, window, { ...sampleAdapters(), data: 'live', states: undefined, disc }, { keymap: true });
  return { disc, notify };
}

/** Picks `file` on the hidden file input, as the picker does. */
function pick(file: File): void {
  const input = document.getElementById('disc-page-file') as HTMLInputElement;
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  input.dispatchEvent(new Event('change'));
}

const settle = async (): Promise<void> => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0)); };

describe('the disc adapter', () => {
  it('starts empty: the Disc item and the chip ask for the image; START is blocked in the prototype\'s words', () => {
    boot();
    expect(readDisc(document).state).toBe('empty');
    expect(discStep(page!).state).toBe('NEEDED');                              // LR-23: the step (its line the legend chip's; was LR-13's disc check)
    expect(document.querySelector('#legend .cx-mark[data-mark="disc"]')!.classList.contains('is-empty')).toBe(true);   // LR-24 (was: the chip)
    page!.ctl.press('options');
    expect(page!.ctl.S.legendError).toBe('Choose your disc image first: Cross on Play, or the disc mark.');   // LR-24 (was: Home, then Disc)
  });

  it('Cross on the Disc item opens the picker; a good image reads, publishes ready and keeps the opened image', async () => {
    const { disc, notify } = boot();
    const input = document.getElementById('disc-page-file') as HTMLInputElement;
    // iOS may disable a valid ISO when its document picker cannot resolve an accept type.
    // Selection stays unfiltered; the actual reader below validates the image.
    expect(input.accept).toBe('');
    const click = vi.spyOn(input, 'click').mockImplementation(() => {});
    onDiscCheck(page!);                                                        // the LR-36 fold: the launch check's disc row, whose Cross is the Disc action (was LR-23: Play's)
    page!.ctl.press('cross');
    expect(click).toHaveBeenCalledTimes(1);
    pick(GOOD());
    expect(readDisc(document)).toMatchObject({ state: 'reading', filename: 'socom2.iso' });
    await settle();
    expect(readDisc(document).state).toBe('ready');
    expect(disc.state()).toBe('ready');
    expect(openedDiscImage(document)).not.toBeNull();
    expect(notify).toHaveBeenCalled();
    expect(page!.ctl.S.toast).toBe('Disc ready: socom2.iso');
    expect(document.querySelector('#legend .cx-mark[data-mark="disc"]')!.classList.contains('is-ready')).toBe(true);   // LR-24 (was: the chip)
  });

  it('an image the reader refuses is the error state: the reader\'s words once, CHECK DISC, the chip is-error', async () => {
    const { disc } = boot();
    pick(NOT_AN_ISO());
    await settle();
    expect(readDisc(document).state).toBe('error');
    expect(disc.state()).toBe('error');
    expect(disc.error()).toMatch(/not an ISO9660 image/);
    page!.render();
    expect(discStep(page!).state).toBe('CHECK DISC');                          // LR-23: the step (its line the legend chip's; was LR-13's disc check)
    expect(discStep(page!).sub).toMatch(/not an ISO9660 image/);
    const chip = document.querySelector('#legend .cx-mark[data-mark="disc"]')!;   // LR-24 (was: the chip)
    expect(chip.classList.contains('is-error')).toBe(true);
    expect(chip.querySelector('.cx-mark__word')!.textContent).toBe('Check disc');   // LR-24 (was: .cx-chip__word)
    expect(openedDiscImage(document)).toBeNull();
    page!.ctl.press('options');
    expect(page!.ctl.S.legendError).toBe('Choose your disc image first: Cross on Play, or the disc mark.');   // LR-24 (was: Home, then Disc)
  });

  it('an image dropped on the window is read the same way', async () => {
    boot();
    const drop = new Event('drop', { cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: { types: ['Files'], files: [GOOD()] } });
    document.dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(true);
    await settle();
    expect(readDisc(document)).toMatchObject({ state: 'ready', filename: 'socom2.iso' });
  });

  it('the disc mark (its menu) opens the picker too; a newer image supersedes one still being read', async () => {
    const { disc } = boot();
    const input = document.getElementById('disc-page-file') as HTMLInputElement;
    const click = vi.spyOn(input, 'click').mockImplementation(() => {});
    (document.querySelector('#legend .cx-mark[data-mark="disc"]') as HTMLElement).click();   // LR-24: the disc mark opens its menu, an option the chooser (was: the chip's click, the chooser)
    document.querySelector<HTMLElement>('#legend .cx-srcopt[data-i="0"]')!.click();
    expect(click).toHaveBeenCalledTimes(1);
    pick(NOT_AN_ISO());
    pick(GOOD());
    await settle();
    expect(disc.state()).toBe('ready');
    expect(disc.error()).toBe('');
  });
});
