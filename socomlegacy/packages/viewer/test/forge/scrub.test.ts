// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { SCRUB_THRESHOLD_PX, scrubNumber, type ScrubDetail } from '../../src/forge/scrub';

/**
 * The dock's number scrub (a browser adaptation, FG.R2 -- the game has no editor): drag a number field left or right to
 * change it, live; a press that does not drag opens the field to type; Escape mid-drag puts the value back.
 */
describe('scrubNumber', () => {
  let input: HTMLInputElement;
  let dispose: () => void = () => undefined;
  const mount = (value: string, rate = 1, digits = 0): { scrubs: number[]; changes: number; cancelled: boolean } => {
    input = document.createElement('input');
    input.type = 'number';
    input.value = value;
    document.body.append(input);
    const seen = { scrubs: [] as number[], changes: 0, cancelled: false };
    input.addEventListener('fx-scrub', (e) => {
      const d = (e as CustomEvent<ScrubDetail>).detail;
      seen.scrubs.push(d.value);
      if (d.cancelled) seen.cancelled = true;
    });
    input.addEventListener('change', () => { seen.changes++; });
    dispose = scrubNumber(input, { rate, digits });
    return seen;
  };
  const pointer = (type: string, x: number, init: MouseEventInit = {}): MouseEvent => {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, button: 0, ...init });
    (type === 'pointerdown' ? input : document).dispatchEvent(e);
    return e;
  };
  afterEach(() => { dispose(); input.remove(); });

  it('a drag right raises the value by the rate a pixel, live, and commits once at the release', () => {
    const seen = mount('5');
    const down = pointer('pointerdown', 100);
    expect(down.defaultPrevented, 'no focus, no caret: a press is a scrub until it is a click').toBe(true);
    pointer('pointermove', 110);
    pointer('pointermove', 120);
    expect(input.value).toBe('25');
    expect(seen.scrubs.at(-1)).toBe(25);
    expect(seen.changes).toBe(0);
    pointer('pointerup', 120);
    expect(seen.changes).toBe(1);
    expect(input.value).toBe('25');
    expect(document.activeElement).not.toBe(input);
  });

  it('Shift is ten times finer, Ctrl ten times coarser; the value keeps the field\'s digits', () => {
    mount('1', 0.01, 2);
    pointer('pointerdown', 0);
    pointer('pointermove', 50, { shiftKey: true });
    expect(input.value).toBe('1.05');
    pointer('pointermove', 50, { ctrlKey: true });
    expect(input.value).toBe('6');
    pointer('pointerup', 50);
  });

  it('a press that does not pass the threshold is a click: the field opens to type, its text selected, nothing changed', () => {
    const seen = mount('7');
    pointer('pointerdown', 10);
    pointer('pointermove', 10 + SCRUB_THRESHOLD_PX - 1);
    pointer('pointerup', 10 + SCRUB_THRESHOLD_PX - 1);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('7');
    expect(seen.scrubs).toEqual([]);
    expect(seen.changes).toBe(0);
  });

  it('a field being typed in, or a disabled one, is left to the browser', () => {
    const seen = mount('3');
    input.focus();
    expect(pointer('pointerdown', 0).defaultPrevented).toBe(false);
    pointer('pointermove', 80);
    pointer('pointerup', 80);
    expect([input.value, seen.changes]).toEqual(['3', 0]);
    input.blur();
    input.disabled = true;
    expect(pointer('pointerdown', 0).defaultPrevented).toBe(false);
  });

  it('Escape mid-drag puts the value back and commits nothing', () => {
    const seen = mount('4');
    pointer('pointerdown', 0);
    pointer('pointermove', 30);
    expect(input.value).toBe('34');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(input.value).toBe('4');
    expect(seen.scrubs.at(-1)).toBe(4);
    expect(seen.cancelled).toBe(true);
    pointer('pointerup', 30);
    expect(seen.changes).toBe(0);
  });
});
