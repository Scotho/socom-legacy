// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SCREEN_ORIGIN_ADAPTATION, SCREEN_ORIGIN_CANVASES, SCREEN_ORIGIN_Y_LINES_PLACEHOLDER, frameScale, layScreenOrigin, screenOriginKeeper,
  screenOriginPx,
} from '../src/screenOrigin';

/**
 * SCREEN POSITION (the parked rows, b; OPT-12; the merge controller's call, 2026-10-23): the origin `SetScreenOrigin`
 * (`FUN_0027bf10`) and every `StoreOptions` lay -- `ScreenOriginX` / `ScreenOriginY` less 128 -- moves the drawn
 * 640 x 448 frame inside the front end's and the match's canvases (`SCREEN_ORIGIN_ADAPTATION`): X one frame pixel a step
 * (DX in VCK, four a pixel in the 448-line mode), Y `SCREEN_ORIGIN_Y_LINES_PLACEHOLDER` lines a step, at the drawn scale.
 */

class El {
  props = new Map<string, string>();
  constructor(public width: number, public height: number) {}
  getBoundingClientRect() { return { width: this.width, height: this.height }; }
  style = { setProperty: (k: string, v: string) => { this.props.set(k, v); } };
}
const docOf = (els: Record<string, El>) => ({ querySelector: (sel: string) => els[sel] ?? null }) as unknown as Document;
class Win {
  listeners = new Map<string, Set<() => void>>();
  addEventListener(t: string, f: () => void) { (this.listeners.get(t) ?? this.listeners.set(t, new Set()).get(t)!).add(f); }
  removeEventListener(t: string, f: () => void) { this.listeners.get(t)?.delete(f); }
  fire(t: string) { for (const f of this.listeners.get(t) ?? []) f(); }
  requestAnimationFrame(f: () => void) { f(); return 0; }
}

describe('SCREEN POSITION: the origin moves the drawn frame (SCREEN_ORIGIN_ADAPTATION)', () => {
  it('names its adaptation and its placeholder: Y one frame line a step until the unit is read', () => {
    expect(SCREEN_ORIGIN_ADAPTATION).toMatch(/frame pixels at the drawn scale/);
    expect(SCREEN_ORIGIN_Y_LINES_PLACEHOLDER).toBe(1);
    expect(SCREEN_ORIGIN_CANVASES).toEqual(['#front-end', '#front-end-gpu', '#view', 'canvas.s2u-match']);   // GM-12b: the GPU twin too
  });

  it('the frame\'s drawn scale is object-fit contain of 640 x 448; the origin is frame pixels at that scale', () => {
    expect(frameScale({ width: 640, height: 448 })).toBe(1);
    expect(frameScale({ width: 1280, height: 1000 })).toBe(2);           // the width binds
    expect(frameScale({ width: 2000, height: 896 })).toBe(2);            // the height binds
    expect(screenOriginPx({ x: 2, y: -28 }, { width: 1280, height: 896 })).toEqual({ dx: 4, dy: -56 });
    expect(screenOriginPx({ x: 0, y: 0 }, { width: 1280, height: 896 })).toEqual({ dx: 0, dy: 0 });
    // The valves' ends (0..250 and 80..250, from 128): -128..+122 across, -48..+122 down.
    expect(screenOriginPx({ x: -128, y: -48 }, { width: 640, height: 448 })).toEqual({ dx: -128, dy: -48 });
    expect(screenOriginPx({ x: 122, y: 122 }, { width: 640, height: 448 })).toEqual({ dx: 122, dy: 122 });
  });

  it('lays the offset on each canvas present, each at its own drawn size', () => {
    const front = new El(1280, 896), view = new El(640, 448);
    layScreenOrigin(docOf({ '#front-end': front, '#view': view }), { x: 3, y: -2 });
    expect([front.props.get('--s2u-origin-x'), front.props.get('--s2u-origin-y')]).toEqual(['6px', '-4px']);
    expect([view.props.get('--s2u-origin-x'), view.props.get('--s2u-origin-y')]).toEqual(['3px', '-2px']);
    layScreenOrigin(docOf({}), { x: 3, y: -2 });                         // no canvas: nothing to lay, no throw
  });

  it('the keeper lays at a set, again at a resize and two frames after a hand-over; its stop removes the listener', () => {
    const front = new El(640, 448), win = new Win();
    const keep = screenOriginKeeper(docOf({ '#front-end': front }), win as unknown as Window);
    expect(keep.origin()).toEqual({ x: 0, y: 0 });
    keep.set(5, 7);
    expect(front.props.get('--s2u-origin-x')).toBe('5px');
    front.width = 1280; front.height = 896;
    win.fire('resize');
    expect(front.props.get('--s2u-origin-x')).toBe('10px');
    front.width = 1920; front.height = 1344;
    keep.layLater();
    expect(front.props.get('--s2u-origin-y')).toBe('21px');
    keep.stop();
    expect(win.listeners.get('resize')?.size).toBe(0);
  });

  it('the page wires it: the session hands the origin to the keeper, the stylesheet translates both canvases', () => {
    const src = (p: string): string => readFileSync(join(__dirname, '..', 'src', p), 'utf8');
    const fe = src('frontEnd.ts');
    expect(fe).toContain('screenOrigin: (x, y) => { o.screenOrigin?.(x, y); }');     // OptionsCommands -> the session's option
    expect(fe).toContain('screenOrigin: (x, y) => { screenOrigin.set(x, y); }');     // the mount's session -> the keeper
    expect(fe).toMatch(/canvas\.hidden = true; screenOrigin\.layLater\(\)/);         // the match's canvas shown: re-laid
    expect(src('styles.css')).toContain('#view, #front-end, #front-end-gpu, canvas.s2u-match { translate: var(--s2u-origin-x, 0px) var(--s2u-origin-y, 0px); }');
  });
});
