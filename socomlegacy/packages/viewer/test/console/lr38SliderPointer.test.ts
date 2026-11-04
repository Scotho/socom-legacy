// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { optCategories, type Adapters } from '../../src/console/state';
import { mountShell } from './shell';

/**
 * LR-38 (5), the owner (2026-10-29, relayed from seat f9): "i said tap should work for sliders - mouse clicks shoudl too.
 * cant click on th yellow line to change setting atm". A Settings slider row as the renderer draws it (`../render/rows`:
 * the track, its yellow fill and its thumb inside it): a press on the yellow line itself -- the mouse's, the finger's, the
 * pen's -- sets the value at that point; the click that follows it neither undoes it nor steps it again; a click with no
 * press before it (a synthetic one) sets the value at its point too. Each event is sent to the element the browser would
 * hit then (re-read after every draw), and every track is laid out 200px wide at x = 100. A browser adaptation: the
 * launcher's pointer, nothing of the game.
 */

let page: ConsolePage | null = null;
beforeEach(() => {
  vi.useFakeTimers(); localStorage.clear(); mountShell(document);
  const real = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('cx-r__track')
      ? { left: 100, right: 300, top: 0, bottom: 20, width: 200, height: 20, x: 100, y: 0, toJSON() {} } as DOMRect
      : real.call(this);
  });
});
afterEach(() => { page?.dispose(); page = null; vi.restoreAllMocks(); vi.useRealTimers(); localStorage.clear(); });

function audio(): { A: Adapters; cue: ReturnType<typeof vi.fn> } {
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
  return { A, cue };
}
const slider = (): HTMLElement => document.querySelector<HTMLElement>('#stage [role="slider"][aria-label="Music"]')!;
/** The yellow line: the track's fill, as drawn now. */
const fill = (): HTMLElement => slider().querySelector<HTMLElement>('.cx-r__track .cx-r__fill')!;
const thumb = (): HTMLElement => slider().querySelector<HTMLElement>('.cx-r__track .cx-r__thumb')!;
type Kind = 'mouse' | 'touch' | 'pen';
function ev(type: string, x: number, kind: Kind, id = kind === 'mouse' ? 1 : 9): Event {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, button: 0, detail: type === 'click' ? 1 : 0 });
  if (type.startsWith('pointer')) Object.defineProperties(e, { pointerId: { value: id }, pointerType: { value: kind } });
  return e;
}
/** A whole press on the element `at()` names at x: down, up, click, each on what is drawn then. */
function press(at: () => HTMLElement, x: number, kind: Kind): void {
  at().dispatchEvent(ev('pointerdown', x, kind));
  at().dispatchEvent(ev('mousedown', x, kind));
  at().dispatchEvent(ev('pointerup', x, kind));
  at().dispatchEvent(ev('mouseup', x, kind));
  at().dispatchEvent(ev('click', x, kind));
}
const musicAt = (A: Adapters, frac: number): number => {
  const n = optCategories(page!.ctl.S, A).find((c) => c.id === 'audio')!.rows.find((r) => r.id === 'music')!.values!.length;
  return Math.round(frac * (n - 1));
};

describe('LR-38 (5): the slider\'s yellow line takes the mouse, the finger and the pen', () => {
  it('the yellow line and the thumb are inside the track the pointer path reads', () => {
    audio();
    expect(fill().closest('.cx-r__track')).not.toBeNull();
    expect(thumb().closest('.cx-r__track')).not.toBeNull();
    expect(fill().closest('[role="slider"][data-act="optrow"]')).toBe(slider());
  });

  for (const kind of ['mouse', 'touch', 'pen'] as const) {
    it(`a ${kind} press on the yellow line ~22% along sets the value there; its click neither undoes nor steps it`, () => {
      const { A, cue } = audio();
      const before = A.options.value('music');
      const want = musicAt(A, 0.22);
      expect(want).not.toBe(before);
      press(fill, 100 + 200 * 0.22, kind);
      expect(A.options.value('music')).toBe(want);
      expect(cue.mock.calls.filter((c) => c[0] === 'toggle')).toHaveLength(1);   // one change, one cue
      expect(page!.ctl.S.opt.row, 'the slider\'s row is focused').toBe(1);
      expect(page!.ctl.S.screen).toBe('options');
      expect(slider().getAttribute('aria-valuenow')).toBe(String(want * 10));
    });
  }

  it('a mouse press on the thumb sets the value at its point too', () => {
    const { A } = audio();
    press(thumb, 100 + 200 * 0.9, 'mouse');
    expect(A.options.value('music')).toBe(musicAt(A, 0.9));
  });

  it('a click with no press before it (a synthetic click) on the yellow line sets the value at its point', () => {
    const { A } = audio();
    fill().dispatchEvent(ev('click', 100 + 200 * 0.22, 'mouse'));
    expect(A.options.value('music')).toBe(musicAt(A, 0.22));
  });

  it('a click whose point is off the track (an element.click(), at x = 0) sets nothing', () => {
    const { A } = audio();
    const before = A.options.value('music');
    fill().click();
    expect(A.options.value('music')).toBe(before);
  });

  it('a right or middle mouse press sets nothing', () => {
    const { A } = audio();
    const before = A.options.value('music');
    const e = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 120, button: 2 });
    Object.defineProperties(e, { pointerId: { value: 1 }, pointerType: { value: 'mouse' } });
    fill().dispatchEvent(e);
    expect(A.options.value('music')).toBe(before);
  });

  // LR2 review F3: the "a press began this click" mark ends with its press -- a non-primary button never sets it, and a
  // release or a cancel with no click after it clears it -- so a later synthetic or assistive click still sets its point.
  it('after a right-button press on the track, a synthetic click on the yellow line still sets its point', () => {
    const { A } = audio();
    const down = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 120, button: 2 });
    Object.defineProperties(down, { pointerId: { value: 1 }, pointerType: { value: 'mouse' } });
    fill().dispatchEvent(down);
    const up = new MouseEvent('pointerup', { bubbles: true, cancelable: true, clientX: 120, button: 2 });
    Object.defineProperties(up, { pointerId: { value: 1 }, pointerType: { value: 'mouse' } });
    fill().dispatchEvent(up);                                                    // a right button's release: no click
    fill().dispatchEvent(ev('click', 100 + 200 * 0.22, 'mouse'));
    expect(A.options.value('music')).toBe(musicAt(A, 0.22));
  });

  it('after a touch drag the browser cancels (no click), a synthetic click on the yellow line still sets its point', () => {
    const { A } = audio();
    fill().dispatchEvent(ev('pointerdown', 100 + 200 * 0.1, 'touch'));
    document.dispatchEvent(ev('pointermove', 100 + 200 * 0.5, 'touch'));
    thumb().dispatchEvent(ev('pointercancel', 100 + 200 * 0.5, 'touch'));
    expect(A.options.value('music')).toBe(musicAt(A, 0.5));
    fill().dispatchEvent(ev('click', 100 + 200 * 0.8, 'mouse'));
    expect(A.options.value('music')).toBe(musicAt(A, 0.8));
  });

  it('after a press released with no click following, a later synthetic click on the yellow line still sets its point', async () => {
    const { A } = audio();
    fill().dispatchEvent(ev('pointerdown', 100 + 200 * 0.1, 'touch'));
    thumb().dispatchEvent(ev('pointerup', 100 + 200 * 0.1, 'touch'));
    await vi.advanceTimersByTimeAsync(50);                                       // no click came
    fill().dispatchEvent(ev('click', 100 + 200 * 0.8, 'mouse'));
    expect(A.options.value('music')).toBe(musicAt(A, 0.8));
  });

  it('a mouse drag from the yellow line moves the value; the click at the release sets the release\'s value, no other', () => {
    const { A } = audio();
    fill().dispatchEvent(ev('pointerdown', 100 + 200 * 0.1, 'mouse'));
    document.dispatchEvent(ev('pointermove', 100 + 200 * 0.8, 'mouse'));
    expect(A.options.value('music')).toBe(musicAt(A, 0.8));
    thumb().dispatchEvent(ev('pointerup', 100 + 200 * 0.8, 'mouse'));
    slider().querySelector<HTMLElement>('.cx-r__track')!.dispatchEvent(ev('click', 100 + 200 * 0.8, 'mouse'));
    expect(A.options.value('music')).toBe(musicAt(A, 0.8));
  });
});
