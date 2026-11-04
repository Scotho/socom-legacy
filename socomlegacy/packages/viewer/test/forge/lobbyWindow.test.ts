// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { clampRect, FORGE_LOBBY_WINDOW_KEY, ForgeWindow, LOBBY_WINDOW_MIN, type WindowRect } from '../../src/forge/lobby/window';

/**
 * FORGE (FG-27; FG.R22, a browser adaptation with no original): the lobby popup's frame -- a window over the forge,
 * moved by its title bar and resized by its corner, inside the page, its place and size kept in this browser.
 */

function memory(initial: Record<string, string> = {}): { data: Map<string, string>; get(k: string): string | null; set(k: string, v: string): void } {
  const data = new Map(Object.entries(initial));
  return { data, get: (k) => data.get(k) ?? null, set: (k, v) => { data.set(k, v); } };
}

/** A pointer event (jsdom has `PointerEvent` from 22; a `MouseEvent` carries the same coordinates otherwise). */
function pointer(target: EventTarget, type: string, x: number, y: number): void {
  const Ctor = (globalThis as { PointerEvent?: typeof MouseEvent }).PointerEvent ?? MouseEvent;
  target.dispatchEvent(new Ctor(type, { clientX: x, clientY: y, bubbles: true, button: 0 }));
}

const VIEW = { width: 1280, height: 720 };

function make(store = memory(), view = VIEW): { w: ForgeWindow; store: ReturnType<typeof memory>; closed: number[] } {
  const closed: number[] = [];
  const w = new ForgeWindow({ doc: document, title: 'GAME LOBBY', store, viewport: () => view, onClose: () => { closed.push(1); } });
  document.body.append(w.root);
  return { w, store, closed };
}

afterEach(() => { document.body.innerHTML = ''; });

describe('FORGE lobby: the window', () => {
  it('clamps a rect inside the viewport, never under the minimum size', () => {
    expect(clampRect({ x: -50, y: -20, width: 600, height: 400 }, VIEW)).toEqual({ x: 0, y: 0, width: 600, height: 400 });
    expect(clampRect({ x: 1000, y: 600, width: 600, height: 400 }, VIEW)).toEqual({ x: 680, y: 320, width: 600, height: 400 });
    expect(clampRect({ x: 10, y: 10, width: 100, height: 50 }, VIEW)).toEqual({ x: 10, y: 10, ...LOBBY_WINDOW_MIN });
    expect(clampRect({ x: 0, y: 0, width: 5000, height: 5000 }, VIEW)).toEqual({ x: 0, y: 0, width: 1280, height: 720 });
    // LATER 68 (the merge controller's product-track call, 2026-10-21): a viewport smaller than the minimum -- a phone --
    // the floor yields to the screen: the whole viewport, at the origin, never past its edge (it was the minimum, 480 x
    // 360, running 70-120 px off a phone's right edge).
    expect(clampRect({ x: 30, y: 30, width: 600, height: 400 }, { width: 400, height: 300 })).toEqual({ x: 0, y: 0, width: 400, height: 300 });
    expect(clampRect({ x: 0, y: 0, width: 760, height: 540 }, { width: 390, height: 844 })).toEqual({ x: 0, y: 0, width: 390, height: 540 });
    expect(clampRect({ x: 10, y: 10, width: 100, height: 50 }, { width: 360, height: 640 })).toEqual({ x: 0, y: 10, width: 360, height: 360 });
  });

  it('opens centred at its default size when nothing is kept, and takes a kept rect back (clamped)', () => {
    const { w } = make();
    const r = w.rect();
    expect(r.width).toBeGreaterThanOrEqual(LOBBY_WINDOW_MIN.width);
    expect(r.x).toBe(Math.round((VIEW.width - r.width) / 2));
    expect(r.y).toBe(Math.round((VIEW.height - r.height) / 2));
    expect(w.root.classList.contains('fx-window')).toBe(true);
    expect(w.root.style.left).toBe(`${r.x}px`);
    const kept = memory({ [FORGE_LOBBY_WINDOW_KEY]: JSON.stringify({ x: 1200, y: 40, width: 500, height: 380 }) });
    const { w: w2 } = make(kept);
    expect(w2.rect()).toEqual({ x: 780, y: 40, width: 500, height: 380 });
    const bad = memory({ [FORGE_LOBBY_WINDOW_KEY]: '{"x":"no"}' });
    expect(make(bad).w.rect().width).toBe(r.width);                       // unreadable: the default
  });

  it('moves by its title bar with pointer events, clamped, and keeps the rect when let go', () => {
    const { w, store } = make();
    const start = w.rect();
    const bar = w.root.querySelector('.fx-window-title')!;
    pointer(bar, 'pointerdown', 100, 100);
    pointer(document, 'pointermove', 140, 130);
    expect(w.rect()).toEqual({ ...start, x: start.x + 40, y: start.y + 30 });
    pointer(document, 'pointermove', -5000, -5000);                        // past the corner: clamped
    expect([w.rect().x, w.rect().y]).toEqual([0, 0]);
    pointer(document, 'pointerup', -5000, -5000);
    expect(JSON.parse(store.data.get(FORGE_LOBBY_WINDOW_KEY)!) as WindowRect).toEqual({ ...start, x: 0, y: 0 });
    pointer(document, 'pointermove', 300, 300);                            // let go: no longer moves
    expect([w.rect().x, w.rect().y]).toEqual([0, 0]);
  });

  it('resizes by its corner grip, never under 480 x 360 nor past the viewport, and keeps it', () => {
    const { w, store } = make();
    w.setRect({ x: 100, y: 100, width: 600, height: 400 });
    const grip = w.root.querySelector('.fx-window-grip')!;
    pointer(grip, 'pointerdown', 700, 500);
    pointer(document, 'pointermove', 800, 560);
    expect(w.rect()).toEqual({ x: 100, y: 100, width: 700, height: 460 });
    pointer(document, 'pointermove', 0, 0);                                // shrunk past the minimum
    expect(w.rect()).toEqual({ x: 100, y: 100, ...LOBBY_WINDOW_MIN });
    pointer(document, 'pointermove', 9000, 9000);                          // grown past the viewport
    expect(w.rect()).toEqual({ x: 100, y: 100, width: 1180, height: 620 });
    pointer(document, 'pointerup', 9000, 9000);
    expect(JSON.parse(store.data.get(FORGE_LOBBY_WINDOW_KEY)!)).toEqual({ x: 100, y: 100, width: 1180, height: 620 });
  });

  it('a press on the close button closes and starts no drag; dispose lets the listeners go', () => {
    const { w, closed } = make();
    const start = w.rect();
    const close = w.root.querySelector<HTMLButtonElement>('.fx-window-close')!;
    pointer(close, 'pointerdown', 10, 10);
    pointer(document, 'pointermove', 200, 200);
    expect(w.rect()).toEqual(start);
    close.click();
    expect(closed).toEqual([1]);
    w.dispose();
    expect(w.root.isConnected).toBe(false);
  });

  it('the body takes the content; the title can change', () => {
    const { w } = make();
    w.body.append(document.createElement('p'));
    expect(w.root.querySelector('.fx-window-body p')).not.toBeNull();
    w.setTitle('LOBBY - FROSTFIRE');
    expect(w.root.querySelector('.fx-window-name')!.textContent).toBe('LOBBY - FROSTFIRE');
  });
});
