// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { bindHudPointer, bufferOfClient } from '../src/hudPointer';

/**
 * WM-DATA, the scoreboard's hover source (a browser adaptation): the page's pointer over its canvas, in drawing-buffer
 * pixels, fed to the HUD (`Hud.setPointer`), and cleared when it leaves or is cancelled. It reads no input the game reads.
 */
const canvasOf = (rect: { left: number; top: number; width: number; height: number }, width: number, height: number): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  vi.spyOn(c, 'getBoundingClientRect').mockReturnValue({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height, x: rect.left, y: rect.top, toJSON: () => ({}) });
  return c;
};
const move = (c: HTMLCanvasElement, type: string, clientX = 0, clientY = 0): void => {
  c.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', clientX, clientY, bubbles: true }));
};

describe('WM-DATA: the pointer over the canvas reaches the HUD in drawing-buffer pixels (a browser adaptation)', () => {
  it('bufferOfClient: (client - the box\'s corner) x the buffer over the box, both ways; an empty box none', () => {
    expect(bufferOfClient(170, 132, { left: 10, top: 20, width: 320, height: 224 }, { width: 640, height: 448 })).toEqual({ x: 320, y: 224 });
    expect(bufferOfClient(10, 20, { left: 10, top: 20, width: 320, height: 224 }, { width: 1920, height: 1080 })).toEqual({ x: 0, y: 0 });
    expect(bufferOfClient(5, 5, { left: 0, top: 0, width: 0, height: 100 }, { width: 640, height: 448 })).toBeNull();
  });

  it('a move feeds setPointer; a leave and a cancel clear it; the abort takes the listeners away', () => {
    const c = canvasOf({ left: 10, top: 20, width: 320, height: 224 }, 640, 448);
    const setPointer = vi.fn();
    const off = new AbortController();
    bindHudPointer(c, { setPointer }, off.signal);
    move(c, 'pointermove', 170, 132);
    expect(setPointer).toHaveBeenLastCalledWith({ x: 320, y: 224 });
    move(c, 'pointerleave');
    expect(setPointer).toHaveBeenLastCalledWith(null);
    move(c, 'pointermove', 90, 76);
    expect(setPointer).toHaveBeenLastCalledWith({ x: 160, y: 112 });
    move(c, 'pointercancel');
    expect(setPointer).toHaveBeenLastCalledWith(null);
    const calls = setPointer.mock.calls.length;
    off.abort();
    move(c, 'pointermove', 170, 132);
    expect(setPointer).toHaveBeenCalledTimes(calls);
  });

  it('under a pointer lock on the canvas the pointer is null: on every move, and when the lock is taken (pointerlockchange)', () => {
    const c = canvasOf({ left: 0, top: 0, width: 640, height: 448 }, 640, 448);
    let locked: Element | null = null;
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => locked });
    try {
      const setPointer = vi.fn();
      const off = new AbortController();
      bindHudPointer(c, { setPointer }, off.signal);
      move(c, 'pointermove', 320, 224);
      expect(setPointer).toHaveBeenLastCalledWith({ x: 320, y: 224 });
      locked = c;
      document.dispatchEvent(new Event('pointerlockchange'));
      expect(setPointer).toHaveBeenLastCalledWith(null);
      move(c, 'pointermove', 320, 224);                       // the frozen position the browser keeps reporting
      expect(setPointer).toHaveBeenLastCalledWith(null);
      locked = document.body;                                 // a lock on another element is not this canvas's
      move(c, 'pointermove', 320, 224);
      expect(setPointer).toHaveBeenLastCalledWith({ x: 320, y: 224 });
      locked = null;
      document.dispatchEvent(new Event('pointerlockchange'));  // released: the next move feeds again
      move(c, 'pointermove', 160, 112);
      expect(setPointer).toHaveBeenLastCalledWith({ x: 160, y: 112 });
      const calls = setPointer.mock.calls.length;
      off.abort();
      locked = c;
      document.dispatchEvent(new Event('pointerlockchange'));
      expect(setPointer).toHaveBeenCalledTimes(calls);        // the document listener goes with the signal
    } finally {
      delete (document as unknown as { pointerLockElement?: unknown }).pointerLockElement;
    }
  });

  it('it takes nothing from the game\'s input: a press is not stopped, not prevented, and not fed', () => {
    const c = canvasOf({ left: 0, top: 0, width: 640, height: 448 }, 640, 448);
    const setPointer = vi.fn();
    bindHudPointer(c, { setPointer });
    const seen = vi.fn();
    c.addEventListener('pointerdown', seen);
    const down = new PointerEvent('pointerdown', { pointerId: 1, pointerType: 'mouse', clientX: 5, clientY: 5, bubbles: true, cancelable: true });
    c.dispatchEvent(down);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(down.defaultPrevented).toBe(false);
    expect(setPointer).not.toHaveBeenCalled();
    const mv = new PointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 5, clientY: 5, bubbles: true, cancelable: true });
    c.dispatchEvent(mv);
    expect(mv.defaultPrevented).toBe(false);
  });

  it('/testroom binds it on its #view canvas beside the ARMORY\'s pointerdown (main.ts, read as text: the page module runs at import)', () => {
    const main = readFileSync(resolve(import.meta.dirname, '../src/main.ts'), 'utf8');
    expect(main).toMatch(/\nbindHudPointer\(canvas, hud\);/);
    expect(main).toMatch(/from '\.\/hudPointer'/);
  });
});
