// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountOverlay, overlayRamp, OVERLAY_TOGGLE_ADAPTATION, type Overlay, type OverlayCues, type OverlayOptions } from '../../src/modern/overlay/index';
import { overlayAdapters } from '../../src/console/adapters';
import type { PadLike } from '../../src/gamepad';
import { fakeLauncher, fakeSession } from './lobbies/fixtures';

/**
 * OVERLAY-CONSOLE's landing gate (the merge controller's `--e2e` run, the data view): the closed overlay is inert. Until
 * its first open it puts nothing on the page -- no frame (the front end's body holds its canvas alone,
 * `e2e/menuflow.spec.ts`), no copied sheet, no console, no adapter, no request, no audio, no pad shadowing, no listener on
 * the page's window or document but the development build's F9 key -- and reads only its opening button, each frame. The
 * frame, the sheets, the console and the session are made at the first open (the toggle, or `open()`); after a close the
 * frame stays `hidden` and `inert` (no pointer, no focus, no key), so a click on the page is the page's. The open's and
 * the close's transitions (OT.R60 (e)) play on every open, the first included. A browser adaptation (product track).
 */
const offline = vi.fn(async () => new Response('{}', { status: 503, headers: { 'Content-Type': 'application/json' } }));
const HOME = 16;
const OPEN_DONE = overlayRamp('open', 0, false).ms;
const CLOSE_DONE = overlayRamp('closed', 1, false).ms;

interface FakePad extends PadLike { buttons: { pressed: boolean; value: number; touched: boolean }[]; axes: number[] }
const fakePad = (): FakePad => ({
  id: 'Test pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 0,
  axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
} as FakePad);
const hold = (pad: FakePad, down: number[]): void => {
  pad.buttons.forEach((b, i) => { b.pressed = down.includes(i); b.value = b.pressed ? 1 : 0; b.touched = b.pressed; });
};

let overlay: Overlay | null = null;
let pad: FakePad;
let original: () => ArrayLike<PadLike | null>;
let nav: { getGamepads(): ArrayLike<PadLike | null> };
let audio: ReturnType<typeof vi.fn>;
const cues = (): OverlayCues & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    popup: () => { calls.push('popup'); return { kind: 'no-name' }; },
    back: () => { calls.push('back'); return { kind: 'no-name' }; },
    play: () => { calls.push('play'); return { kind: 'no-name' }; },
  };
};

beforeEach(() => {
  vi.useFakeTimers();
  offline.mockClear();
  vi.stubGlobal('fetch', offline);
  audio = vi.fn();
  vi.stubGlobal('AudioContext', audio);
  document.body.innerHTML = '<canvas id="front-end"></canvas>';
  pad = fakePad();
  original = () => [pad];
  nav = { getGamepads: original };
});
afterEach(() => {
  overlay?.dispose(); overlay = null;
  vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); document.body.innerHTML = '';
});

/** The listeners added to the page's window and document from here on: `[target, type, capture]`. */
function spyListeners(): { seen: [string, string, boolean][] } {
  const seen: [string, string, boolean][] = [];
  const spy = (name: string, target: EventTarget): void => {
    const add = target.addEventListener.bind(target);
    vi.spyOn(target, 'addEventListener').mockImplementation((type, fn, o) => {
      seen.push([name, type, typeof o === 'boolean' ? o : !!o?.capture]);
      add(type, fn, o);
    });
  };
  spy('window', window);
  spy('document', document);
  return { seen };
}

describe('OVERLAY-CONSOLE: the closed overlay is inert -- mounted on its first open', () => {
  it('after the mount, closed: no frame on the page, no listener but F9, the pad unshadowed, no request, no audio, no console', () => {
    const { seen } = spyListeners();
    const adapters = vi.fn((d: Document, r: Parameters<NonNullable<OverlayOptions['adapters']>>[1]) => overlayAdapters(d, window, r));
    const sounds = vi.fn(() => cues());
    const frames: (() => void)[] = [];
    // No `session`: the page's own (`../session` `pageSession`) would add its `pagehide` listener if it were made now.
    overlay = mountOverlay(document, {
      nav, state: fakeLauncher('in-game'), adapters, sounds, frame: (cb) => { frames.push(cb); return frames.length; }, cancelFrame: () => {},
    });
    for (let i = 0; i < 5; i++) frames.shift()!();                  // five frames of the toggle's read, nothing pressed
    expect(overlay.isOpen()).toBe(false);
    expect(overlay.el).toBeNull();
    expect(document.querySelector('iframe')).toBeNull();
    expect([...document.body.children].map((e) => `${e.tagName.toLowerCase()}#${e.id}`)).toEqual(['canvas#front-end']);
    // The development build's F9 (OT.R29) and nothing else: no pagehide, no pointer, click or focus listener.
    expect(seen).toEqual(import.meta.env.DEV ? [['window', 'keydown', true]] : []);
    expect(nav.getGamepads).toBe(original);
    expect(Object.hasOwn(nav, 'getGamepads')).toBe(true);           // the test's own property, never redefined
    expect(offline).not.toHaveBeenCalled();
    expect(audio).not.toHaveBeenCalled();
    expect(sounds).not.toHaveBeenCalled();
    expect(adapters).not.toHaveBeenCalled();
    expect(overlay.console()).toBeNull();
  });

  it('the first open() makes the frame, copies the sheets and boots the console', () => {
    const adapters = vi.fn((d: Document, r: Parameters<NonNullable<OverlayOptions['adapters']>>[1]) => overlayAdapters(d, window, r));
    const sheet = document.createElement('style');
    sheet.textContent = '.page-sheet { color: red; }';
    document.head.append(sheet);
    try {
      overlay = mountOverlay(document, { nav, session: fakeSession(), state: fakeLauncher('in-game'), adapters, frame: () => 0, cancelFrame: () => {}, motion: false });
      expect(overlay.el).toBeNull();
      overlay.open();
      const frame = overlay.el!;
      expect(frame).toBeInstanceOf(HTMLIFrameElement);
      expect(document.querySelectorAll('iframe.mu-overlay-frame')).toHaveLength(1);
      expect(frame.hidden).toBe(false);
      expect(frame.hasAttribute('inert')).toBe(false);
      const head = frame.contentDocument!.head;
      expect(head.querySelector('link[data-overlay-console-sheet]')).not.toBeNull();
      expect([...head.querySelectorAll('style')].some((s) => s.textContent?.includes('.page-sheet'))).toBe(true);
      expect(adapters).toHaveBeenCalledTimes(1);
      expect(overlay.console()!.ctl.S.mode).toBe('overlay');
      expect(nav.getGamepads).not.toBe(original);                    // the game's pad shadowed while open
    } finally { sheet.remove(); }
  });

  it('the opening button\'s press opens it the first time too (the toggle\'s read is the closed overlay\'s one duty)', () => {
    overlay = mountOverlay(document, { nav, session: fakeSession(), state: fakeLauncher('in-game'), frame: () => 0, cancelFrame: () => {}, motion: false });
    hold(pad, [HOME]); overlay.poll();
    expect(overlay.isOpen()).toBe(true);
    expect(overlay.el).not.toBeNull();
    expect(overlay.console()).not.toBeNull();
  });

  it('after the close the frame is hidden and inert, holds no focus, and a click on the page reaches the page\'s listener', () => {
    overlay = mountOverlay(document, { nav, session: fakeSession(), state: fakeLauncher('in-game'), frame: () => 0, cancelFrame: () => {}, motion: false });
    overlay.open();
    const frame = overlay.el!;
    overlay.close();
    expect(overlay.isOpen()).toBe(false);
    expect(frame.isConnected ? frame.hidden && frame.hasAttribute('inert') : true).toBe(true);
    expect(document.activeElement).not.toBe(frame);
    expect(nav.getGamepads).toBe(original);
    const canvas = document.getElementById('front-end')!;
    const page = vi.fn();
    document.addEventListener('pointerdown', page);
    document.addEventListener('click', page);
    const down = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
    canvas.dispatchEvent(down);
    canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(page).toHaveBeenCalledTimes(2);
    expect(down.defaultPrevented).toBe(false);
    // A key on the page is the page's again (the development build's F9 alone is the overlay's).
    const key = vi.fn();
    window.addEventListener('keydown', key);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w' }));
    expect(key).toHaveBeenCalledTimes(1);
    document.removeEventListener('pointerdown', page);
    document.removeEventListener('click', page);
    window.removeEventListener('keydown', key);
  });

  it('a second open works, with the ramps and the cues on both opens', () => {
    const c = cues();
    overlay = mountOverlay(document, { nav, session: fakeSession(), state: fakeLauncher('in-game'), sounds: () => c, frame: () => 0, cancelFrame: () => {} });
    const phase = (): string | undefined => overlay!.el?.dataset['phase'];
    overlay.open();
    expect(phase()).toBe('opening');                                // the first open ramps in too
    vi.advanceTimersByTime(OPEN_DONE);
    expect(phase()).toBe('open');
    overlay.close();
    expect(phase()).toBe('closing');
    vi.advanceTimersByTime(CLOSE_DONE);
    expect(phase()).toBe('closed');
    expect(overlay.console()).toBeNull();
    overlay.open();
    expect(phase()).toBe('opening');
    expect(overlay.el!.hidden).toBe(false);
    expect(overlay.el!.hasAttribute('inert')).toBe(false);
    expect(overlay.console()).not.toBeNull();
    vi.advanceTimersByTime(OPEN_DONE);
    expect(phase()).toBe('open');
    expect(document.querySelectorAll('iframe')).toHaveLength(1);   // one frame, kept across the opens
    expect(c.calls).toEqual(['popup', 'back', 'popup']);
  });

  it('a development build\'s F9 opens the never-opened overlay', () => {
    if (!import.meta.env.DEV) return;
    overlay = mountOverlay(document, { nav, session: fakeSession(), state: fakeLauncher('in-game'), frame: () => 0, cancelFrame: () => {}, motion: false });
    window.dispatchEvent(new KeyboardEvent('keydown', { code: OVERLAY_TOGGLE_ADAPTATION.key, key: OVERLAY_TOGGLE_ADAPTATION.key }));
    expect(overlay.isOpen()).toBe(true);
    expect(overlay.el).not.toBeNull();
    // ...and the frame's own window takes F9 to close it (its key listener attached with the frame).
    const inner = overlay.el!.contentWindow! as Window & typeof globalThis;
    inner.dispatchEvent(new inner.KeyboardEvent('keydown', { code: OVERLAY_TOGGLE_ADAPTATION.key, key: OVERLAY_TOGGLE_ADAPTATION.key }));
    expect(overlay.isOpen()).toBe(false);
  });

  it('dispose before any open: nothing to take down, a new mount possible', () => {
    overlay = mountOverlay(document, { nav, session: fakeSession(), state: fakeLauncher('in-game'), frame: () => 0, cancelFrame: () => {} });
    overlay.dispose();
    expect(document.querySelector('iframe')).toBeNull();
    expect(nav.getGamepads).toBe(original);
    overlay.open();
    expect(overlay.isOpen()).toBe(false);
    expect(document.querySelector('iframe')).toBeNull();
    overlay = mountOverlay(document, { nav, session: fakeSession(), state: fakeLauncher('in-game'), frame: () => 0, cancelFrame: () => {} });
  });
});
