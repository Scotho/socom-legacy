// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { holdPad, holdToBind, type PadPage } from '../../e2e/padStub';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { livePad } from '../../src/console/adapters/pad';
import { liveRemap } from '../../src/console/adapters/remap';
import { REMAP_CROUCH_ROW, REMAP_PRONE_ROW, REMAP_STANCE_ROW } from '../../src/console/render/remap';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { REMAP_ROW, type Adapters } from '../../src/console/state';
import { HOLD_TO_BIND_MS_ADAPTATION } from '../../src/padLayout';
import { mountShell } from './shell';

/**
 * LATER 608 (`../../e2e/buttonMapping.spec.ts` "Crouch onto Prone's button asks", red about 1 in 3 on the machinery seat's
 * box, every red with no question): the spec's own pad helpers (`../../e2e/padStub` `holdPad`, `holdToBind`) driven through
 * the page's pieces -- the console's frame loop (`../../src/console/input`), the live remap adapter and pad reader, as
 * `./remapConflictSequence.test.ts` drives them -- on a stand-in page whose animation frames come late. The page's hold to
 * bind (`../../src/padBinding` `PadBinding.step`) is sampled by frames: it is measured from the first frame that sees the
 * button to a frame that still sees it `HOLD_TO_BIND_MS_ADAPTATION` later. A helper that lets go at a fixed wall-clock time
 * loses the hold whenever no frame lands between the two (the box's trace, lr-close4 run 1: the ring full at 28090, the
 * button let go at 28093, no frame between). A browser adaptation's test aid (OT.R28); nothing of the game.
 */
const pad = () => ({
  index: 0, id: 'Stub pad (STANDARD GAMEPAD)', connected: true, mapping: 'standard', timestamp: 0,
  axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
});
type Pad = ReturnType<typeof pad>;
const L3 = 10, R3 = 11;

/* ---------- the page's clock and its animation frames ---------- */
let page: ConsolePage | null = null;
let pads: Pad[] = [];
let t = 10_000;
let nextAt = t + 16;
let queue: ((now: number) => void)[] = [];
/** The frame schedule: `regular` every 16 ms; `stall` the same, but the frame that would land at or past the hold's end
 *  (the first frame that saw the button, plus `HOLD_TO_BIND_MS_ADAPTATION`) comes `STALL_MS` late, once per press. */
let mode: 'regular' | 'stall' = 'regular';
const STALL_MS = 400;
let pressFrame = -1;
let stalled = false;
const GAPS = [16, 33, 16, 50];
let gapAt = 0;
const realRaf = { win: window.requestAnimationFrame, glob: globalThis.requestAnimationFrame };
const realCaf = { win: window.cancelAnimationFrame, glob: globalThis.cancelAnimationFrame };

/** One frame: the clock at the frame's time, every waiting callback run, the next frame scheduled. */
function frame(): void {
  t = nextAt;
  const down = pads[0]?.buttons.some((b) => b.pressed) ?? false;
  if (!down) { pressFrame = -1; stalled = false; } else if (pressFrame < 0) pressFrame = t;
  for (const cb of queue.splice(0)) cb(t);
  let n = t + (mode === 'regular' ? 16 : GAPS[gapAt++ % GAPS.length]!);
  if (mode === 'stall' && pressFrame >= 0 && !stalled && n >= pressFrame + HOLD_TO_BIND_MS_ADAPTATION) { n = t + STALL_MS; stalled = true; }
  nextAt = n;
}
const flush = async (): Promise<void> => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

/** The stand-in page: `evaluate` runs the helper's in-page function here, frames given until it settles; `waitForTimeout`
 *  lets the clock run, every frame due on the way given. */
const stub: PadPage = {
  evaluate: (async (fn: (arg: unknown) => unknown, arg: unknown) => {
    let done = false, failed: unknown = null, out: unknown;
    void Promise.resolve().then(() => fn(arg)).then((v) => { out = v; done = true; }, (e: unknown) => { failed = e; done = true; });
    for (let i = 0; i < 10_000 && !done; i++) { await flush(); if (!done) frame(); }
    if (failed) throw failed;
    return out;
  }) as PadPage['evaluate'],
  waitForTimeout: async (ms: number) => {
    const end = t + ms;
    while (nextAt <= end) { frame(); await flush(); }
    t = end;
  },
};

/** An `expect(...)`'s retry, on the stand-in's clock: `cond` within 60 s, polled every 100 ms. */
const until = (cond: () => boolean, what: string) => async (): Promise<void> => {
  for (const end = t + 60_000; !cond();) {
    if (t > end) throw new Error(`never: ${what}`);
    await stub.waitForTimeout(100);
  }
};

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  mountShell(document);
  pads = []; t = 10_000; nextAt = t + 16; queue = []; mode = 'regular'; pressFrame = -1; stalled = false; gapAt = 0;
  const raf = ((cb: (now: number) => void) => { queue.push(cb); return queue.length; }) as typeof window.requestAnimationFrame;
  const caf = (() => { queue = []; }) as typeof window.cancelAnimationFrame;
  window.requestAnimationFrame = raf; globalThis.requestAnimationFrame = raf;
  window.cancelAnimationFrame = caf; globalThis.cancelAnimationFrame = caf;
  Object.defineProperty(navigator, 'getGamepads', { value: () => pads, configurable: true });
});
afterEach(() => {
  page?.dispose(); page = null;
  window.requestAnimationFrame = realRaf.win; globalThis.requestAnimationFrame = realRaf.glob;
  window.cancelAnimationFrame = realCaf.win; globalThis.cancelAnimationFrame = realCaf.glob;
  delete (window as unknown as { __s2uPad?: Pad }).__s2uPad;
  localStorage.clear();
  vi.useRealTimers();
});

const rows = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('#stage [data-act="remaprow"]')];
const glyph = (i: number): string => rows()[i]!.querySelector('.cx-item__state')!.textContent ?? '';
const lead = (): string => document.querySelector('#overlay .cx-dialog__lead')?.textContent ?? '';

/** The console's Button mapping open, the stub's pad the page's, SEPARATE entered (the spec's `openMapping`, `enterSeparate`). */
async function boot(): Promise<void> {
  const p = pad();
  pads = [p];
  (window as unknown as { __s2uPad: Pad }).__s2uPad = p;
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
  await holdPad(stub);
  rows()[REMAP_STANCE_ROW]!.querySelector<HTMLElement>('[data-act="remapstep"][data-d="1"]')!.click();
  await stub.waitForTimeout(16);
  expect(rows().length).toBeGreaterThan(REMAP_PRONE_ROW);
}

/** The spec's `bind`: the row clicked (its Cross), the pad at rest, then `button` held through `holdToBind` until `settled`. */
async function bind(i: number, button: number, settled: () => Promise<void>): Promise<void> {
  rows()[i]!.click();
  await stub.waitForTimeout(16);
  await holdPad(stub);
  await holdToBind(stub, button, settled);
}

/** The spec's first three binds: Prone on R3, Crouch on L3, then Crouch onto R3 -- which asks. */
async function sequence(): Promise<void> {
  await boot();
  await bind(REMAP_PRONE_ROW, R3, until(() => glyph(REMAP_PRONE_ROW) === 'R3', 'Prone on R3'));
  await bind(REMAP_CROUCH_ROW, L3, until(() => glyph(REMAP_CROUCH_ROW) === 'L3', 'Crouch on L3'));
  await bind(REMAP_CROUCH_ROW, R3, until(() => /Swap/.test(lead()), 'the question'));
  expect(lead()).toBe('R3 is already used for PRONE. Swap them, replace it, or cancel.');
}

describe('LATER 608: the spec\'s hold to bind under late animation frames', () => {
  it('at 60 Hz the binds are taken and Crouch onto Prone\'s button asks', async () => {
    mode = 'regular';
    await sequence();
  });

  it('with a frame stall over the hold\'s end the binds are still taken and the question still asked', async () => {
    mode = 'stall';
    await sequence();
  });
});
