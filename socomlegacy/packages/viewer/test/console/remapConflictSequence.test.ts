// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { livePad } from '../../src/console/adapters/pad';
import { liveRemap } from '../../src/console/adapters/remap';
import { REMAP_CROUCH_ROW, REMAP_PRONE_ROW, REMAP_STANCE_ROW } from '../../src/console/render/remap';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { REMAP_ROW, type Adapters } from '../../src/console/state';
import { HOLD_TO_BIND_MS_ADAPTATION } from '../../src/padLayout';
import { mountShell } from './shell';

/**
 * B188's e2e (`../../e2e/buttonMapping.spec.ts:89`, red at its third question on the run of 2026-10-30): the spec's own
 * sequence, frame by frame through the page's pieces -- the console's frame loop (`../../src/console/input`), the live
 * remap adapter (`liveRemap`: each change re-selects the console's own pad reader) and the console's live pad reader
 * (`livePad`, OBF-12's `GamePad` that reads the profile again on each change) over one shared storage -- with the hold to
 * bind at its live `HOLD_TO_BIND_MS_ADAPTATION`. Prone on R3, Crouch on L3, Crouch onto R3 (Swap), Prone onto R3
 * (Replace), Crouch onto R3: each of the three asks Swap / Replace / Cancel. A browser adaptation (OT.R28); the stub pad
 * is the spec's (`../../e2e/padStub`: 17 buttons, the standard mapping).
 */
const pad = () => ({
  index: 0, id: 'Stub pad (STANDARD GAMEPAD)', connected: true, mapping: 'standard', timestamp: 0,
  axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
});
type Pad = ReturnType<typeof pad>;
const L3 = 10, R3 = 11;

let page: ConsolePage | null = null;
let pads: Pad[] = [];
let t = 10_000;
let frame: ((now: number) => void) | null = null;
const realRaf = window.requestAnimationFrame;
const realCaf = window.cancelAnimationFrame;
beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  mountShell(document);
  pads = [];
  t = 10_000;
  frame = null;
  window.requestAnimationFrame = ((cb: (now: number) => void) => { frame = cb; return 1; }) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = (() => { frame = null; }) as typeof window.cancelAnimationFrame;
  Object.defineProperty(navigator, 'getGamepads', { value: () => pads, configurable: true });
});
afterEach(() => {
  page?.dispose(); page = null;
  window.requestAnimationFrame = realRaf;
  window.cancelAnimationFrame = realCaf;
  localStorage.clear();
  vi.useRealTimers();
});

/** The page's frame loop, `ms` of it at 60 Hz. */
function run(ms: number): void {
  for (let end = t + ms; t < end;) { t += 16; const f = frame; frame = null; f?.(t); }
}
const hold = (p: Pad, ...down: number[]): void => {
  p.buttons.forEach((b, i) => { const on = down.includes(i); b.pressed = on; b.touched = on; b.value = on ? 1 : 0; });
  run(32);                                                         // the spec's `holdPad`: two animation frames
};
const rows = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('#stage [data-act="remaprow"]')];
const glyph = (i: number): string => rows()[i]!.querySelector('.cx-item__state')!.textContent ?? '';
const overlay = (): string => document.getElementById('overlay')!.textContent ?? '';
const key = (k: string): void => { window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); run(16); };

function boot() {
  const p = pad();
  pads = [p];
  let ctl: ConsolePage['ctl'] | null = null;
  const lp = livePad(() => { ctl?.render(); }, { source: { getGamepads: () => pads } });
  const remap = liveRemap(window, lp, { pads: { getGamepads: () => pads }, now: () => t, holdMs: HOLD_TO_BIND_MS_ADAPTATION });
  const a: Adapters = { ...sampleAdapters(), pad: lp, remap };
  page = bootConsole(document, window, a, { keymap: true });
  ctl = page.ctl;
  ctl.doAct('opt:controller');
  ctl.S.opt.row = ctl.A.options.categories()[ctl.S.opt.cat]!.rows.findIndex((r) => r.id === REMAP_ROW);
  ctl.press('cross');
  ctl.render();
  hold(p);
  return { ctl, p };
}

/** The spec's `bind`: the row clicked (its Cross), the pad at rest, then `button` held past the hold to bind. */
function bind(p: Pad, i: number, button: number): void {
  rows()[i]!.click();
  run(16);
  hold(p);
  hold(p, button);
  run(HOLD_TO_BIND_MS_ADAPTATION + 200);
  hold(p);
}
/** The spec's `answer`: the question open, Up from Cancel to Replace or Swap, then Enter. */
function answer(p: Pad, choice: 'swap' | 'replace' | 'cancel'): void {
  expect(overlay(), 'the question is asked').toMatch(/Swap/);
  for (let i = 0; i < (choice === 'swap' ? 2 : choice === 'replace' ? 1 : 0); i++) key('ArrowUp');
  key('Enter');
  hold(p);
}

describe('B188 e2e buttonMapping:89 -- the spec\'s sequence through the page\'s live pad pieces', () => {
  it('Crouch onto Prone\'s button asks each time: Swap, then Replace, then Cancel', () => {
    const { p } = boot();
    // STM-1 (STM.R1): the Crouch and Prone rows are SEPARATE's -- the spec steps the Stance mode first, and Prone takes the
    // button Triangle is on (an unbound Prone cloned); the sequence then binds over it.
    rows()[REMAP_STANCE_ROW]!.querySelector<HTMLElement>('[data-act="remapstep"][data-d="1"]')!.click();
    run(16);
    expect(rows().length).toBeGreaterThan(REMAP_PRONE_ROW);
    expect(rows()[REMAP_PRONE_ROW]!.querySelector('.cx-btn--triangle')).not.toBeNull();
    bind(p, REMAP_PRONE_ROW, R3);
    expect(glyph(REMAP_PRONE_ROW)).toBe('R3');
    bind(p, REMAP_CROUCH_ROW, L3);
    expect(glyph(REMAP_CROUCH_ROW)).toBe('L3');
    bind(p, REMAP_CROUCH_ROW, R3);
    expect(document.querySelector('#overlay .cx-dialog__lead')?.textContent).toBe('R3 is already used for PRONE. Swap them, replace it, or cancel.');
    answer(p, 'swap');
    expect([glyph(REMAP_CROUCH_ROW), glyph(REMAP_PRONE_ROW)]).toEqual(['R3', 'L3']);
    bind(p, REMAP_PRONE_ROW, R3);
    answer(p, 'replace');
    expect([glyph(REMAP_PRONE_ROW), glyph(REMAP_CROUCH_ROW)]).toEqual(['R3', 'Unbound']);
    bind(p, REMAP_CROUCH_ROW, R3);
    answer(p, 'cancel');
    expect(document.querySelector('#overlay [data-key="confirm-conflict"]')).toBeNull();
    expect([glyph(REMAP_PRONE_ROW), glyph(REMAP_CROUCH_ROW)]).toEqual(['R3', 'Unbound']);
  });
});
