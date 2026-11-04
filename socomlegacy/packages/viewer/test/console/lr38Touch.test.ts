// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { optCategories, type Adapters } from '../../src/console/state';
import { declsOf, mediaHolds as holds, PAGE_RULES, type MediaEnv, type Rule } from './cascade';
import { mountShell } from './shell';

/**
 * LR-38 (5) (the owner, 2026-10-29: "Sliders should work with tap, make sure all ui works with tap that needs to"). A
 * Settings slider row (the mockup's slider: its 170px track's `onTrack` sets the value at the point) takes the finger as
 * the mouse: a tap on its track sets the value at that point, a drag moves it (pointer events, the track captures the
 * pointer, `touch-action: none` so the page does not scroll under the finger), each change cued and saved as a pad step is
 * (`optStep`); the step marks still step. The touch audit's floor: on a coarse pointer every small target reaches 44px
 * (the rows, the step marks, the track, a dialog's close, the crumb's Back, the account pill, the theme and disc-source
 * options, the account menu's items) without moving the layout where it can (an invisible hit area), and nothing is
 * revealed by hover alone (the step marks drawn at full strength where there is no hover). A browser adaptation: the
 * launcher's pointer and touch, nothing of the game.
 */

const UNLAYERED = PAGE_RULES.filter((r) => !r.layered);
function decl(sel: string, prop: string, at: MediaEnv, rules: Rule[] = UNLAYERED): string | null {
  let v: string | null = null;
  for (const r of rules) {
    if (!r.sel.includes(sel) || !r.media.every((m) => holds(m, at))) continue;
    for (const [n, val] of declsOf(r.body)) if (n === prop) v = val;
  }
  return v;
}

let page: ConsolePage | null = null;
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; vi.restoreAllMocks(); vi.useRealTimers(); localStorage.clear(); });

/** Settings > Audio, its rows focused; answers the controller and the adapters (their cue spied). */
function audio(): { p: ConsolePage; A: Adapters; cue: ReturnType<typeof vi.fn> } {
  const A = sampleAdapters();
  const cue = vi.fn();
  A.cue = { selection: vi.fn(), play: cue };
  page = bootConsole(document, window, A, { keymap: false });
  const S = page.ctl.S;
  S.screen = 'options';
  S.opt.cat = optCategories(S, A).findIndex((c) => c.id === 'audio');
  S.opt.zone = 'rows';
  S.opt.row = 0;
  page.render();
  return { p: page, A, cue };
}
const slider = (label: string): HTMLElement => document.querySelector<HTMLElement>(`#stage [role="slider"][aria-label="${label}"]`)!;
const track = (label: string): HTMLElement => slider(label).querySelector<HTMLElement>('.cx-r__track')!;
/** The track drawn 200px wide at x = 100. */
function lay(el: HTMLElement): void {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ left: 100, right: 300, top: 0, bottom: 20, width: 200, height: 20, x: 100, y: 0, toJSON() {} } as DOMRect);
}
/** A pointer event (jsdom has no PointerEvent: a MouseEvent carrying a pointer id and type). */
function pointer(type: string, x: number, id = 7): Event {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, button: 0 });
  Object.defineProperties(e, { pointerId: { value: id }, pointerType: { value: 'touch' } });
  return e;
}

describe('LR-38 (5): a slider takes a tap and a drag on its track', () => {
  it('a tap on the track sets the value at that point, cued and saved as a step', () => {
    const { A, cue } = audio();
    const t = track('Music');
    lay(t);
    const values = optCategories(page!.ctl.S, A).find((c) => c.id === 'audio')!.rows.find((r) => r.id === 'music')!.values!;
    t.dispatchEvent(pointer('pointerdown', 100 + 200 * 0.3));
    t.dispatchEvent(pointer('pointerup', 100 + 200 * 0.3));
    expect(A.options.value('music')).toBe(Math.round(0.3 * (values.length - 1)));
    expect(cue).toHaveBeenCalledWith('toggle');
    expect(page!.ctl.S.opt.row, 'the slider\'s row is focused').toBe(1);
    expect(slider('Music').getAttribute('aria-valuenow')).toBe(String(Number.parseInt(values[A.options.value('music')]!, 10)));
  });

  it('a drag moves the value with the finger and ends at the release', () => {
    const { A } = audio();
    const t = track('Music');
    lay(t);
    const capture = vi.fn();
    (t as unknown as { setPointerCapture: unknown }).setPointerCapture = capture;
    t.dispatchEvent(pointer('pointerdown', 100));
    expect(A.options.value('music')).toBe(0);
    expect(capture).toHaveBeenCalledWith(7);
    document.dispatchEvent(pointer('pointermove', 100 + 200 * 0.9));
    expect(A.options.value('music')).toBe(9);
    document.dispatchEvent(pointer('pointermove', 400));
    expect(A.options.value('music'), 'held past the end: the end').toBe(10);
    document.dispatchEvent(pointer('pointerup', 400));
    document.dispatchEvent(pointer('pointermove', 100));
    expect(A.options.value('music'), 'no move after the release').toBe(10);
  });

  it('another pointer\'s move does nothing to the drag', () => {
    const { A } = audio();
    const t = track('Music');
    lay(t);
    t.dispatchEvent(pointer('pointerdown', 100 + 200 * 0.5));
    const at = A.options.value('music');
    document.dispatchEvent(pointer('pointermove', 300, 8));
    expect(A.options.value('music')).toBe(at);
  });

  it('a tap on the same value again cues nothing (no change)', () => {
    const { cue } = audio();
    const t = track('Music');
    lay(t);
    t.dispatchEvent(pointer('pointerdown', 100 + 200 * 0.6));
    t.dispatchEvent(pointer('pointerup', 100 + 200 * 0.6));
    cue.mockClear();
    t.dispatchEvent(pointer('pointerdown', 100 + 200 * 0.6));
    expect(cue).not.toHaveBeenCalledWith('toggle');
  });

  it('the step marks still step by one', () => {
    const { A } = audio();
    const before = A.options.value('music');
    slider('Music').querySelector<HTMLElement>('.cx-r__step[data-d="1"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(A.options.value('music')).toBe(before + 1);
  });

  it('the track takes the finger: no page scroll under it, and a hit area of at least 44px', () => {
    for (const at of [{ w: 390, h: 844 }, { w: 1280, h: 720 }]) {
      expect(decl('.cx-r__track', 'touch-action', at)).toBe('none');
      expect(decl('.cx-r__track::after', 'height', at)).toBe('max(100%, 44px)');
    }
  });
});

describe('LR-38 (5): the touch audit -- on a coarse pointer every small target reaches 44px; no hover-only cue', () => {
  const coarse: MediaEnv[] = [{ w: 390, h: 844, pointer: 'coarse' }, { w: 844, h: 390, pointer: 'coarse' }, { w: 1024, h: 768, pointer: 'coarse' }];
  for (const at of coarse) {
    it(`${at.w}x${at.h}, touch: rows, options, the close, Back, the account pill and the step marks`, () => {
      // a section header keeps its own (no target: LR-1's 0)
      expect(decl('.cx-r:not(.cx-r--header)', 'min-height', at)).toBe('max(3.375rem, 44px)');
      expect(decl('.cx-r', 'min-height', at)).toBe('3.375rem');
      expect(decl('.cx-dropup__opt', 'min-height', at)).toBe('max(2.5rem, 44px)');
      expect(decl('.cx-srcopt', 'min-height', at)).toBe('max(3.5rem, 44px)');
      expect(decl('.cx-account-menu nav button', 'min-height', at)).toBe('44px');
      expect(decl('.cx-dialog__close', 'min-width', at)).toBe('44px');
      expect(decl('.cx-dialog__close', 'min-height', at)).toBe('44px');
      for (const sel of ['.cx-r__step', '.cx-screen .cx-back', '.cx-header .cx-player']) {
        expect(decl(sel, 'position', at), sel).toBe('relative');
        expect(decl(`${sel}::after`, 'min-height', at), sel).toBe('44px');
        expect(decl(`${sel}::after`, 'min-width', at), sel).toBe('44px');
      }
      // no hover on a touch screen: the step marks at full strength, not 30% until a hover
      expect(decl('.cx-r__step', 'opacity', at)).toBe('1');
    });
  }
  it('a fine pointer keeps the drawn sizes (the floors are touch-only)', () => {
    const fine: MediaEnv = { w: 1280, h: 720 };
    expect(decl('.cx-r', 'min-height', fine)).toBe('3.375rem');
    expect(decl('.cx-r__step', 'opacity', fine)).toBe('0.3');
    expect(decl('.cx-dialog__close', 'min-width', fine)).toBeNull();
  });
});
