import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UI_TICK_SECONDS, UiClock } from '@s2u/ui';
import { tapPad, type PadPage } from '../e2e/padStub';
import { pressPad } from '../e2e/startupDevices';

/**
 * The real-GPU red of `../e2e/nativeSettings.spec.ts` (agent/mega cb7125b1f, "over /testroom, with another client still
 * playing", :254: a slider at 0.35 still at 0.35 after the spec's RIGHT). Native Options over a match
 * (`../src/nativeOptionsHost` `frame`) reads the pad once per UI tick (`UiClock`, `UI_TICK_SECONDS` = 100/2997 s, the
 * original's rate), from the snapshot of the frame the tick lands in; nothing latches a press between ticks. The spec's
 * `tapPad` held each pad state for two animation frames: 33 ms at 60 Hz, but 14 ms at 144 Hz (a real-GPU, headed run on a
 * fast display), shorter than a tick -- the press could begin and end between two ticks and never be read. The test aid
 * now holds each state for two frames and at least two UI ticks. A browser adaptation's test aid (OT.R28); nothing of
 * the game: the menus' sampling is the original's.
 */
const pad = () => ({
  index: 0, id: 'Stub pad (STANDARD GAMEPAD)', connected: true, mapping: 'standard', timestamp: 0,
  axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
});
type Pad = ReturnType<typeof pad>;
const RIGHT = 15;

let t = 0, frameMs = 7, queue: ((now: number) => void)[] = [];
let stub: Pad;
let clock: UiClock;
let seen: boolean[] = [];
const realRaf = globalThis.requestAnimationFrame;

/** One animation frame at `t`: the page's callbacks, then native Options' frame -- its clock's ticks each read the pad. */
function frame(): void {
  t += frameMs;
  for (const cb of queue.splice(0)) cb(t);
  const down = stub.buttons[RIGHT]!.pressed;
  clock.advance(t, () => { seen.push(down); });
}
const flush = async (): Promise<void> => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const page: PadPage = {
  evaluate: (async (fn: (arg: unknown) => unknown, arg: unknown) => {
    let done = false, failed: unknown = null, out: unknown;
    void Promise.resolve().then(() => fn(arg)).then((v) => { out = v; done = true; }, (e: unknown) => { failed = e; done = true; });
    for (let i = 0; i < 10_000 && !done; i++) { await flush(); if (!done) frame(); }
    if (failed) throw failed;
    return out;
  }) as PadPage['evaluate'],
  waitForTimeout: async (ms: number) => { const end = t + ms; while (t + frameMs <= end) frame(); },
};

beforeEach(() => {
  stub = pad();
  (globalThis as unknown as { __s2uPad: Pad }).__s2uPad = stub;
  (globalThis as unknown as { pads: Pad[] }).pads = [stub];   // `../e2e/startupDevices`' stub reads the same pad
  (globalThis as unknown as { window: unknown }).window ??= globalThis;
  globalThis.requestAnimationFrame = ((cb: (now: number) => void) => { queue.push(cb); return queue.length; }) as typeof requestAnimationFrame;
  t = 0; queue = []; seen = [];
});
afterEach(() => {
  globalThis.requestAnimationFrame = realRaf;
  delete (globalThis as unknown as { __s2uPad?: Pad }).__s2uPad;
});

const HELPERS: readonly (readonly [string, (p: PadPage, button: number) => Promise<void>])[] = [['tapPad', (p, b) => tapPad(p as never, b)], ['pressPad', (p, b) => pressPad(p as never, b)]];
for (const [helper, press] of HELPERS) describe(`the spec's ${helper} against native Options' tick-sampled pad`, () => {
  for (const hz of [60, 120, 144, 240]) {
    it(`at ${hz} Hz, at every phase of the tick, the press is read at one tick at least, and its release after it`, async () => {
      frameMs = 1000 / hz;
      const tickMs = UI_TICK_SECONDS * 1000;
      const lost: number[] = [];
      for (let phase = 0; phase < tickMs; phase += 1.3) {
        clock = new UiClock();
        clock.advance(1000, () => {});                       // the clock anchored; the frames start `phase` ms after it
        t = 1000 + phase; queue = []; seen = [];
        await press(page, RIGHT);
        await page.waitForTimeout(300);
        const first = seen.indexOf(true);
        if (first < 0 || !seen.slice(first).includes(false)) lost.push(Math.round(phase * 10) / 10);
      }
      expect(lost, `phases (ms) at which the press was never read, or never seen released`).toEqual([]);
    });
  }
});
