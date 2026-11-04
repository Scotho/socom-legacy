// @vitest-environment jsdom
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { extractStart, extractView, type ExtractAct } from '../src/console/render/extract';
import type { PadLike } from '../src/console/input';
import { DiscExtractError } from '../src/discExtract';
import type { DiscRequest } from '../src/discSource';
import {
  CHOOSER_LEAD, DISC_START_CHOOSER_ID, DISC_START_POPOVER_ID, EVICTED_LINE, discForStart, domChooser, domPopover,
} from '../src/discStart';

/**
 * DX-3: `discForStart`'s own DOM, where there is no console (the online seat's invite entry, which skips the loader):
 * the chooser's dialog and the extraction's popover mounted over the page by `../src/discStart` itself, read by clicks
 * and the pad as the console reads them. A browser adaptation (OT.R53): nothing of the game.
 */
afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

const pick = (input: HTMLInputElement, files: File[]): void => {
  Object.defineProperty(input, 'files', { configurable: true, value: files });
  input.dispatchEvent(new Event('change'));
};
const settle = async (): Promise<void> => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0)); };

describe('domPopover: the popover over a page with no console', () => {
  it('mounted at its first view, drawn by extractHtml, its clicks and presses answering acts; closed, gone', () => {
    const pads: PadLike[] = [];
    const p = domPopover(document, { read: () => pads });
    const acts: ExtractAct[] = [];
    p.onAct((a) => acts.push(a));
    p.show(extractStart());
    const host = document.getElementById(DISC_START_POPOVER_ID)!;
    expect(host.querySelector('.cx-dialog.cx-extract.is-plan')).not.toBeNull();
    (host.querySelector('[data-act="press"][data-b="circle"]') as HTMLElement).click();
    expect(acts).toEqual(['cancel']);
    p.show(extractView(extractStart(), { kind: 'error', error: new DiscExtractError('quota', 'free 2 GB') }));
    p.press('down');                                                    // the focus is the popover's own
    expect(p.view()!.row).toBe(1);
    p.show(extractView(p.view(), { kind: 'room', bytes: 5 }));          // a later view of the same phase keeps it
    expect(host.querySelector('[data-act="extract"][data-i="1"]')!.classList.contains('is-focused')).toBe(true);
    (host.querySelector('[data-act="extract"][data-i="0"]') as HTMLElement).click();
    p.press('circle');
    expect(acts).toEqual(['cancel', 'retry', 'close']);
    p.close();
    expect(document.getElementById(DISC_START_POPOVER_ID)).toBeNull();
  });

  it('the pad: a Cross pressed on a pad is read once an animation frame (the console\'s padFrame)', () => {
    const frames: FrameRequestCallback[] = [];
    const w = window as unknown as { requestAnimationFrame: unknown; cancelAnimationFrame: unknown };
    const before = { raf: w.requestAnimationFrame, caf: w.cancelAnimationFrame };
    w.requestAnimationFrame = (cb: FrameRequestCallback): number => { frames.push(cb); return frames.length; };
    w.cancelAnimationFrame = (): void => {};
    onTestFinished(() => { w.requestAnimationFrame = before.raf; w.cancelAnimationFrame = before.caf; });
    const pad: PadLike = { axes: [0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })) };
    const p = domPopover(document, { read: () => [pad] });
    const acts: ExtractAct[] = [];
    p.onAct((a) => acts.push(a));
    p.show(extractView(extractStart(), { kind: 'error', error: new DiscExtractError('denied', 'allow it') }));
    (pad.buttons as { pressed: boolean; value: number }[])[0] = { pressed: true, value: 1 };
    frames.shift()!(16);
    expect(acts).toEqual(['retry']);
    p.close();
  });
});

describe('domChooser: the disc asked for, validated, its refusal said', () => {
  it('the lead (what is kept, where, how to delete it), the evicted line, an image picked and validated', async () => {
    const open = vi.fn(async (_r: DiscRequest) => ({}));
    const choosing = domChooser(document, open).choose('evicted', '');
    const host = document.getElementById(DISC_START_CHOOSER_ID)!;
    expect(host.querySelector('.cx-dialog__lead')!.textContent).toBe(CHOOSER_LEAD);
    expect(host.querySelector('[data-disc-start="evicted"]')!.textContent).toBe(EVICTED_LINE);
    const image = host.querySelector<HTMLInputElement>('[data-disc-start="image-input"]')!;
    expect(image.accept).toBe(''); // iOS selection must not depend on native ISO type recognition.
    const click = vi.spyOn(image, 'click').mockImplementation(() => {});
    (host.querySelector('[data-disc-start="image"]') as HTMLElement).click();
    expect(click).toHaveBeenCalledTimes(1);
    const file = new File([new Uint8Array(4)], 'socom2.iso');
    pick(image, [file]);
    const chosen = await choosing;
    expect(chosen.request).toEqual({ kind: 'iso', file });
    expect(document.getElementById(DISC_START_CHOOSER_ID)).toBeNull();
  });

  it('a refusal from the reader is said and the chooser stays; the last refusal is shown when asked again', async () => {
    const open = vi.fn(async () => { throw new Error('not an ISO9660 image'); });
    void domChooser(document, open).choose('none', 'this disc lacks 2 files');
    const host = document.getElementById(DISC_START_CHOOSER_ID)!;
    expect(host.querySelector('[data-disc-start="error"]')!.textContent).toBe('this disc lacks 2 files');
    expect(host.querySelector('[data-disc-start="evicted"]')).toBeNull();
    pick(host.querySelector<HTMLInputElement>('[data-disc-start="image-input"]')!, [new File([new Uint8Array(4)], 'x.iso')]);
    await settle();
    expect(host.querySelector('[data-disc-start="error"]')!.textContent).toBe('not an ISO9660 image');
    expect(document.getElementById(DISC_START_CHOOSER_ID)).not.toBeNull();
  });

  it('discForStart with no seams mounts this DOM itself (the invite entry has no console)', async () => {
    const going = discForStart(document, { state: async () => 'none', env: { records: { get: async () => undefined, put: async () => {}, delete: async () => {} } } });
    await settle();
    expect(document.getElementById(DISC_START_CHOOSER_ID)).not.toBeNull();
    void going;
  });
});
