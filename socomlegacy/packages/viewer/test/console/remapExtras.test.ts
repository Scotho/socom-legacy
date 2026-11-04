// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { remapAdapter } from '../../src/console/adapters/remap';
import { prompts } from '../../src/console/render/legend';
import { REMAP_ACTION_ROW, REMAP_SAME_THUMB_WARNING } from '../../src/console/render/remap';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { REMAP_ROW, type Adapters } from '../../src/console/state';
import { PadBinding } from '../../src/padBinding';
import { SETUP_KEY } from '../../src/startupSettings';
import { mountShell } from './shell';

/**
 * h59U9CLb task 5 (a **browser adaptation**, off by default): the Button mapping's extra binds -- one row, Extra binds,
 * before Teach again / Connect / Finish (only with a pad the screen can bind), folded until Cross opens it: Add double
 * bind and Add combo bind (Left / Right choose the action, Cross listens), then a row per extra kept (Cross removes it);
 * Square on Extra binds clears them, and Restore defaults does too. Every button keeps its own action (Q2); a same-thumb
 * combo is kept with a one-line warning (Q3). The machine's own rules are `../padBinding.test.ts`'s.
 */
const pad = () => ({
  index: 0, id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)', connected: true, mapping: 'standard', timestamp: 0,
  axes: [0, 0, 0, 0], buttons: Array.from({ length: 18 }, () => ({ pressed: false, touched: false, value: 0 })),
});
type Pad = ReturnType<typeof pad>;
const extrasKey = (p: Pad): string => `${SETUP_KEY}.pad.extras.${JSON.stringify([p.id, p.mapping, p.buttons.length, p.axes.length])}`;
const SQUARE = 2, L1 = 4, R3 = 11;
const ACTIONS = ['Cross', 'Circle', 'Square', 'Triangle', 'L1', 'R1', 'L2', 'R2', 'Select', 'Start', 'L3', 'R3', 'Up', 'Down', 'Left', 'Right'];

let page: ConsolePage | null = null;
let pads: Pad[] = [];
let t = 10_000;
const realRaf = window.requestAnimationFrame;
const realCaf = window.cancelAnimationFrame;
beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  mountShell(document);
  pads = [];
  t = 10_000;
  window.requestAnimationFrame = (() => 1) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = (() => undefined) as typeof window.cancelAnimationFrame;
  Object.defineProperty(navigator, 'getGamepads', { value: () => pads, configurable: true });
});
afterEach(() => {
  page?.dispose(); page = null;
  window.requestAnimationFrame = realRaf;
  window.cancelAnimationFrame = realCaf;
  localStorage.clear();
  vi.useRealTimers();
});

function openMapping(o: { withPad?: boolean } = {}) {
  const p = pad();
  pads = o.withPad === false ? [] : [p];
  const remap = remapAdapter(() => new PadBinding({ pads: { getGamepads: () => pads }, now: () => t, holdMs: 0 }));
  page = bootConsole(document, window, { ...sampleAdapters(), remap } as Adapters, { keymap: true });
  const ctl = page.ctl;
  ctl.doAct('opt:controller');
  ctl.S.opt.row = ctl.A.options.categories()[ctl.S.opt.cat]!.rows.findIndex((r) => r.id === REMAP_ROW);
  ctl.press('cross');
  ctl.remapFrame(t += 16);
  return { ctl, p };
}
const rows = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('#stage [data-act="remaprow"]')];
const titles = (): string[] => rows().map((r) => r.querySelector('.cx-item__title, .cx-roller__label')!.textContent!);
const rowAt = (title: string): number => titles().indexOf(title);
const sub = (i: number): string => rows()[i]!.querySelector('.cx-item__sub')?.textContent ?? '';
const value = (i: number): string => rows()[i]!.querySelector('.cx-roller__value')!.textContent!;
const said = (ctl: ConsolePage['ctl']): [string, string][] => prompts(ctl.S, ctl.A).map((x) => [x.k, x.label]);
/** The pad's buttons `down` for one frame of the screen. */
const hold = (ctl: ConsolePage['ctl'], p: Pad, ...down: number[]): void => {
  p.buttons.forEach((b, i) => { b.pressed = down.includes(i); b.value = b.pressed ? 1 : 0; });
  ctl.remapFrame(t += 16);
};
const stored = (p: Pad): unknown => JSON.parse(localStorage.getItem(extrasKey(p)) ?? 'null');

describe('h59U9CLb: the Extra binds row', () => {
  it('one row before Finish, labelled a browser adaptation, folded; none without a controller', () => {
    const { ctl } = openMapping();
    expect(titles()).toEqual(['Stance mode', 'Stick dead zone', ...ACTIONS, 'Extra binds', 'Finish']);   // STANCE-TOP's order; DEAD-UP's dead zone second
    expect(sub(rowAt('Extra binds'))).toContain('Browser adaptation');
    ctl.S.rm.row = rowAt('Extra binds'); page!.render();
    expect(said(ctl)[0]).toEqual(['cross', 'Show']);
    page!.dispose(); page = null;
    mountShell(document);
    openMapping({ withPad: false });
    expect(titles()).not.toContain('Extra binds');
  });
  it('Cross opens it -- Add double bind and Add combo bind beneath -- and folds it again', () => {
    const { ctl } = openMapping();
    ctl.S.rm.row = rowAt('Extra binds');
    ctl.press('cross');
    expect(titles().slice(18)).toEqual(['Extra binds', 'Add double bind', 'Add combo bind', 'Finish']);
    expect(said(ctl)[0]).toEqual(['cross', 'Hide']);
    ctl.press('cross');
    expect(titles().slice(18)).toEqual(['Extra binds', 'Finish']);
  });
});

describe('h59U9CLb: making, showing and removing an extra', () => {
  function opened() {
    const r = openMapping();
    r.ctl.S.rm.row = rowAt('Extra binds');
    r.ctl.press('cross');
    return r;
  }
  it('a double bind: Right steps the action, Cross listens, Square held -- kept, shown, said; Square still jumps', () => {
    const { ctl, p } = opened();
    ctl.S.rm.row = rowAt('Add double bind'); page!.render();
    expect(value(ctl.S.rm.row)).toBe('Fire');
    expect(said(ctl).slice(0, 2)).toEqual([['dpad-h', 'Action'], ['cross', 'Bind']]);
    ctl.press('right');
    expect(value(ctl.S.rm.row)).toBe('Fire mode');
    ctl.press('cross');
    hold(ctl, p);
    hold(ctl, p, SQUARE);
    expect(stored(p)).toEqual({ version: 1, doubles: [{ button: SQUARE, action: 'fireMode' }], combos: [] });
    expect(titles()).toContain('Square adds Fire mode');
    expect(ctl.S.toast).toBe('Square now also does Fire mode.');
    expect(titles()[REMAP_ACTION_ROW + SQUARE]).toBe('Square');
  });
  it('a combo: Cross, the modifier held, then the button with it; a same-thumb pair kept with its one-line warning', () => {
    const { ctl, p } = opened();
    ctl.S.rm.row = rowAt('Add combo bind'); page!.render();
    ctl.press('cross');
    hold(ctl, p); hold(ctl, p, L1); hold(ctl, p, L1, SQUARE);
    hold(ctl, p);
    ctl.S.rm.row = rowAt('Add combo bind'); page!.render();
    ctl.press('cross');
    hold(ctl, p); hold(ctl, p, R3); hold(ctl, p, R3, SQUARE);
    expect(titles()).toContain('L1 + Square: Fire');
    expect(titles()).toContain('R3 + Square: Fire');
    expect(sub(rowAt('L1 + Square: Fire'))).not.toContain(REMAP_SAME_THUMB_WARNING);
    expect(sub(rowAt('R3 + Square: Fire'))).toContain(REMAP_SAME_THUMB_WARNING);
  });
  it('Cross on a kept extra removes it; Square on Extra binds clears them all', () => {
    const { ctl, p } = opened();
    for (const keys of [[SQUARE], [R3]]) {
      ctl.S.rm.row = rowAt('Add double bind'); page!.render();
      ctl.press('cross');
      hold(ctl, p); hold(ctl, p, ...keys); hold(ctl, p);
    }
    expect(titles()).toEqual(expect.arrayContaining(['Square adds Fire', 'R3 adds Fire']));
    ctl.S.rm.row = rowAt('Square adds Fire'); page!.render();
    expect(said(ctl)[0]).toEqual(['cross', 'Remove']);
    ctl.press('cross');
    expect(titles()).not.toContain('Square adds Fire');
    expect(ctl.S.toast).toBe('Extra bind removed.');
    ctl.S.rm.row = rowAt('Extra binds'); page!.render();
    ctl.press('square');
    expect(titles()).not.toContain('R3 adds Fire');
    expect(stored(p)).toEqual({ version: 1, doubles: [], combos: [] });
    expect(ctl.S.toast).toBe('Extra binds cleared.');
  });
  it('Restore defaults clears the extras', () => {
    const { ctl, p } = opened();
    ctl.S.rm.row = rowAt('Add double bind'); page!.render();
    ctl.press('cross');
    hold(ctl, p); hold(ctl, p, SQUARE); hold(ctl, p);
    expect(titles()).toContain('Square adds Fire');
    ctl.press('triangle');
    ctl.press('down');
    ctl.press('cross');                                  // Yes
    expect(titles()).not.toContain('Square adds Fire');
    expect(stored(p)).toEqual({ version: 1, doubles: [], combos: [] });
  });
});
