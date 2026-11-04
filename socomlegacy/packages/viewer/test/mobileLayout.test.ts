// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Settings } from '@s2u/card';
import { applyMobileLayout, decodeLayout, layoutOrientation, MOBILE_LAYOUT_KEY, MOBILE_LAYOUT_ROW, mountMobileLayout, readMobileLayout, saveMobileLayout, toPosition } from '../src/mobileLayout';
import { openMobileLayoutEditor } from '../src/mobileLayoutEditor';
import { bootConsole } from '../src/console/app';
import { liveOptions } from '../src/console/adapters/options';
import { sampleAdapters } from '../src/console/sampleAdapters';
import type { Adapters } from '../src/console/state';
import { mountShell } from './console/shell';

beforeEach(() => { localStorage.clear(); document.body.innerHTML = ''; });

describe('mobile layout, a browser adaptation', () => {
  it('rejects unknown versions, malformed points and unknown controls', () => {
    expect(decodeLayout('{')).toEqual({ version: 1, landscape: {}, portrait: {} });
    expect(decodeLayout('{"version":2,"landscape":{"tw-r1":{"x":0.2,"y":0.3}}}').landscape).toEqual({});
    const layout = decodeLayout(JSON.stringify({ version: 1, landscape: { 'tw-r1': { x: 0.2, y: 0.3 }, 'tw-r2': { x: 'bad', y: 0 }, unknown: { x: 0, y: 0 } } }));
    expect(layout.landscape).toEqual({ 'tw-r1': { x: 0.2, y: 0.3 } });
  });
  it('saves both orientations independently and restores them after a fresh read', () => {
    const layout = readMobileLayout();
    layout.landscape['tw-r1'] = { x: 0.7, y: 0.25 };
    layout.portrait['tw-r1'] = { x: 0.9, y: 0.6 };
    expect(saveMobileLayout(layout)).toBe(true);
    expect(readMobileLayout()).toEqual(layout);
    expect(layoutOrientation(812, 375)).toBe('landscape');
    expect(layoutOrientation(375, 812)).toBe('portrait');
  });
  it('keeps a whole target inside the safe rectangle, even after rotation to a small screen', () => {
    const bounds = { left: 20, top: 64, width: 310, height: 500 };
    expect(toPosition({ x: 1, y: 1 }, 56, 56, bounds)).toEqual({ x: 274, y: 508 });
    expect(toPosition({ x: -10, y: 20 }, 56, 56, bounds)).toEqual({ x: 20, y: 508 });
  });
  it('moves the actual gameplay target and restores its original placement on reset', () => {
    document.body.innerHTML = '<div id="tw-mid"><button id="tw-r1" style="color: red">R1</button></div>';
    const el = document.getElementById('tw-r1')!;
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ width: 44, height: 44 } as DOMRect);
    const bounds = { left: 8, top: 64, width: 796, height: 303 };
    applyMobileLayout(document.body, { 'tw-r1': { x: 1, y: 0 } }, bounds);
    expect(el.style.left).toBe('760px');
    expect(el.style.top).toBe('64px');
    expect(el.parentElement).toBe(document.body); // no transformed #tw-mid containing block
    applyMobileLayout(document.body, {}, bounds);
    expect(el.parentElement?.id).toBe('tw-mid');
    expect(el.style.cssText).toBe('color: red;');
  });
  it('reports refused persistence instead of claiming the layout was saved', () => {
    const failed = new Settings(() => { throw new Error('storage denied'); }, () => {});
    expect(saveMobileLayout(readMobileLayout(), failed)).toBe(false);
    expect(localStorage.getItem(MOBILE_LAYOUT_KEY)).toBeNull();
  });
});

/**
 * The mobile-fit review's F2 (a browser adaptation): a phone browser's toolbar coming back resizes the visual viewport,
 * not the window, and a thumb near the bottom edge -- where the strip now is -- brings it back mid-fight. That resize
 * re-lays the targets out against the new visible rectangle and cancels nothing: the held stick and fire stay held. A
 * window resize (a rotation) still releases them, as on main.
 */
describe('the visual viewport resize re-lays out without releasing held touches (mobile fit review F2)', () => {
  let frames = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  const realRaf = window.requestAnimationFrame, realCaf = window.cancelAnimationFrame;
  const tick = (): void => { const run = [...frames.values()]; frames = new Map(); for (const f of run) f(0); };
  beforeEach(() => {
    frames = new Map();
    window.requestAnimationFrame = ((cb: FrameRequestCallback) => { const id = nextId++; frames.set(id, cb); return id; }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = ((id: number) => { frames.delete(id); }) as typeof window.cancelAnimationFrame;
  });
  afterEach(() => {
    window.requestAnimationFrame = realRaf; window.cancelAnimationFrame = realCaf;
    delete (window as { visualViewport?: unknown }).visualViewport;
  });

  it('a held touch survives the toolbar coming back; the target follows the new visible width; a window resize still releases', () => {
    const visual = Object.assign(new EventTarget(), { width: 800, height: 360, scale: 1 });
    Object.defineProperty(window, 'visualViewport', { value: visual, configurable: true });
    const layout = readMobileLayout();
    layout.landscape['tw-r1'] = { x: 1, y: 0 };
    expect(saveMobileLayout(layout)).toBe(true);
    document.body.innerHTML = '<div id="touch-walk" class="is-walking"><div id="tw-mid"><button id="tw-r1">R1</button></div></div>';
    const root = document.getElementById('touch-walk')!;
    const el = document.getElementById('tw-r1')!;
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ width: 44, height: 44 } as DOMRect);
    const release = vi.fn();
    const dispose = mountMobileLayout(root, release);
    tick();
    expect(el.style.left).toBe(`${8 + (800 - 16 - 44)}px`);
    visual.width = 600;
    visual.dispatchEvent(new Event('resize'));                       // the toolbar comes back
    expect(release).not.toHaveBeenCalled();                          // the held stick and fire stay held
    tick();
    expect(el.style.left).toBe(`${8 + (600 - 16 - 44)}px`);          // laid out again on the visible rectangle
    window.dispatchEvent(new Event('resize'));                       // a rotation: main's release, kept
    expect(release).toHaveBeenCalledTimes(1);
    dispose();
  });
});

/**
 * B61's review F3, part 1 (the merge controller's ruling): Circle / B closes the touch layout editor as Cancel. The
 * editor detaches the console's input, pad included, so it reads the pad itself while it is open -- a press edge of the
 * standard mapping's button 1, polled on the page's frame -- and calls the same `finish` as Cancel: nothing saved, the
 * console's input back. The poll stops at the close: no frame left asked for. A browser adaptation (OT.R28).
 */
describe('the touch layout editor: Circle / B is Cancel (B61 F3)', () => {
  type Pad = { index: number; id: string; connected: boolean; mapping: string; timestamp: number; axes: number[]; buttons: { pressed: boolean; touched: boolean; value: number }[] };
  const pad = (): Pad => ({ index: 0, id: 'Pad (STANDARD GAMEPAD)', connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) });
  const hold = (p: Pad, ...down: number[]): void => { p.buttons.forEach((b, i) => { b.pressed = down.includes(i); b.value = b.pressed ? 1 : 0; }); };
  let frames = new Map<number, (now: number) => void>();
  let nextId = 1;
  let pads: Pad[] = [];
  const realRaf = window.requestAnimationFrame, realCaf = window.cancelAnimationFrame;
  let t = 1000;
  /** One frame: every callback asked for so far, once. */
  const tick = (): void => { t += 16; const run = [...frames.values()]; frames = new Map(); for (const f of run) f(t); };
  beforeEach(() => {
    frames = new Map(); pads = []; t = 1000;
    window.requestAnimationFrame = ((cb: (now: number) => void) => { const id = nextId++; frames.set(id, cb); return id; }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = ((id: number) => { frames.delete(id); }) as typeof window.cancelAnimationFrame;
    Object.defineProperty(navigator, 'getGamepads', { value: () => pads, configurable: true });
    if (!HTMLDialogElement.prototype.showModal) HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.open = true; };
  });
  afterEach(() => { window.requestAnimationFrame = realRaf; window.cancelAnimationFrame = realCaf; });

  it('a Circle press closes it as Cancel: nothing saved, `closed` told once, no frame left asked for', () => {
    const p = pad(); pads = [p];
    const closed = vi.fn();
    openMobileLayoutEditor(document, closed);
    expect(document.querySelector('dialog[data-mobile-editor]')).not.toBeNull();
    tick();
    expect(closed).not.toHaveBeenCalled();
    hold(p, 1);                                                      // Circle / B: the standard mapping's 1
    tick();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(document.querySelector('dialog[data-mobile-editor]')).toBeNull();
    expect(localStorage.getItem(MOBILE_LAYOUT_KEY)).toBeNull();     // Cancel: nothing saved
    expect(frames.size).toBe(0);                                     // the poll stopped
    tick();
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('a Circle already held when it opens is no press until let go; another button closes nothing', () => {
    const p = pad(); pads = [p];
    hold(p, 1);
    const closed = vi.fn();
    const editor = openMobileLayoutEditor(document, closed);
    tick(); tick();
    expect(closed).not.toHaveBeenCalled();
    hold(p, 0, 2, 3);                                                // Cross, Square, Triangle: not the editor's
    tick();
    expect(closed).not.toHaveBeenCalled();
    hold(p, 1);
    tick();
    expect(closed).toHaveBeenCalledTimes(1);
    editor.dispose();
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('closed by its Cancel (dispose), the poll stops too', () => {
    pads = [pad()];
    const editor = openMobileLayoutEditor(document, () => {});
    tick();
    expect(frames.size).toBe(1);
    editor.dispose();
    expect(frames.size).toBe(0);
  });

  it('from the console (Options > Mobile > Touch layout): Circle closes it and the console\'s input comes back, the Circle held through it no second press', () => {
    mountShell(document);
    const p = pad(); pads = [p];
    const a: Adapters = { ...sampleAdapters(), options: liveOptions(() => {}, { signedIn: () => false, pads: () => [], touch: () => true }) };
    const page = bootConsole(document, window, a, { keymap: false });
    const ctl = page.ctl;
    ctl.doAct('opt:mobile');
    ctl.S.opt.row = 0;
    expect(ctl.A.options.categories()[ctl.S.opt.cat]!.rows[0]!.id).toBe(MOBILE_LAYOUT_ROW);
    ctl.press('cross');
    expect(document.querySelector('dialog[data-mobile-editor]')).not.toBeNull();
    tick();
    hold(p, 13);                                                     // the D-pad: the console's input is away
    tick();
    expect(ctl.S.opt.row).toBe(0);
    hold(p);
    tick();
    hold(p, 1);
    tick();                                                          // the editor's Circle: Cancel
    expect(document.querySelector('dialog[data-mobile-editor]')).toBeNull();
    tick(); tick();                                                  // Circle still held: not a press of the console's
    expect([ctl.S.screen, ctl.S.opt.zone]).toEqual(['options', 'rows']);
    hold(p);
    tick();
    hold(p, 1);
    tick();                                                          // a fresh Circle: the console's own, back to the tabs
    expect(ctl.S.opt.zone).toBe('cats');
    page.dispose();
  });
});
