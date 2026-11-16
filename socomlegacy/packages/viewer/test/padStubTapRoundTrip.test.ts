import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tapPad, type PadPage } from '../e2e/padStub';
import { padFrame, type Held, type PadLike } from '../src/console/input';
import { REPEAT_DELAY } from '../src/console/padRepeat';

/**
 * LATER 952's second form (2026-11-13; a browser adaptation's test aid, OT.R28): `e2e/unifiedControllerSliders.spec.ts`
 * saw one d-pad tap step a slider twice, once three times, on a fast host and on a box alike. The stub's `tapPad` set the
 * button in one `page.evaluate` and let it go only in the next, so the press also lasted Playwright's round trip between
 * the two -- unbounded -- and the console's directions repeat once held past `REPEAT_DELAY` (400 ms), then every 100 ms
 * (`src/console/input.ts` `padFrame`). A tap is now pressed and let go inside one evaluate, so no round trip lengthens it.
 * Here the page's frames run on while the test waits for each evaluate's answer (`roundTripMs`), as a page's do.
 */
const pad = () => ({
  index: 0, id: 'Stub pad (STANDARD GAMEPAD)', connected: true, mapping: 'standard', timestamp: 0,
  axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
});
type Pad = ReturnType<typeof pad>;
const RIGHT = 15;

let t = 0, frameMs = 1000 / 60, roundTripMs = 0, queue: ((now: number) => void)[] = [];
let stub: Pad;
let held: Held = {};
let presses: string[] = [];
const realRaf = globalThis.requestAnimationFrame;

/** One animation frame at `t`: the page's callbacks (the stub's waits), then the console's poll of the pad. */
function frame(): void {
  t += frameMs;
  for (const cb of queue.splice(0)) cb(t);
  presses.push(...padFrame([stub as unknown as PadLike], held, t));
}
const flush = async (): Promise<void> => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
/** The page's frames run on for `roundTripMs` after each evaluate has answered: the answer's way back to the test. */
const page: PadPage = {
  evaluate: (async (fn: (arg: unknown) => unknown, arg: unknown) => {
    let done = false, failed: unknown = null, out: unknown;
    void Promise.resolve().then(() => fn(arg)).then((v) => { out = v; done = true; }, (e: unknown) => { failed = e; done = true; });
    for (let i = 0; i < 10_000 && !done; i++) { await flush(); if (!done) frame(); }
    const back = t + roundTripMs;
    while (t + frameMs <= back) frame();
    if (failed) throw failed;
    return out;
  }) as PadPage['evaluate'],
  waitForTimeout: async (ms: number) => { const end = t + ms; while (t + frameMs <= end) frame(); },
};

beforeEach(() => {
  stub = pad();
  (globalThis as unknown as { __s2uPad: Pad }).__s2uPad = stub;
  (globalThis as unknown as { window: unknown }).window ??= globalThis;
  globalThis.requestAnimationFrame = ((cb: (now: number) => void) => { queue.push(cb); return queue.length; }) as typeof requestAnimationFrame;
  t = 1000; queue = []; held = {}; presses = [];
});
afterEach(() => {
  globalThis.requestAnimationFrame = realRaf;
  delete (globalThis as unknown as { __s2uPad?: Pad }).__s2uPad;
});

describe('LATER 952 (second form): one tapPad is one press of the console, whatever the round trip', () => {
  for (const ms of [0, 50, REPEAT_DELAY + 50, REPEAT_DELAY + 150, 1000]) {
    it(`a round trip of ${ms} ms: one RIGHT, then released`, async () => {
      roundTripMs = ms;
      await tapPad(page, RIGHT);
      await page.waitForTimeout(600);
      expect(presses).toEqual(['right']);
      expect(stub.buttons[RIGHT]!.pressed).toBe(false);
    });
  }
});
