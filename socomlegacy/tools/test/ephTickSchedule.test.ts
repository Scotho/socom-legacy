import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { EPH_PAD, ephPadInitScript } from '../eph/pageSeed';

/**
 * LATER 1165 (d) (product track, the harness; Option A, the main controller's word): the page applies the script's
 * inputs on ITS OWN tick schedule. The runner hands the init script the whole translated script once, as walk ticks
 * (`__ephPadSchedule`); the stub pad applies every event due by the walk's next tick each time the page polls it, and
 * logs where each landed (`__ephPadLog`). Before: one CDP write per event at wall-clock time into a throttled background
 * page, landing 40-53 ms late with jitter (PC 2), a different tick each run. The page's walk reads one input a frame
 * (viewer walk.ts, the frame's wish), so where a frame runs two ticks an event due on its second lands one tick LATE --
 * never early -- and the log says so.
 */

type Frame = { ticks: number };
interface Page { poll(): { buttons: { pressed: boolean }[]; axes: number[] }; tick: number; g: Record<string, unknown> }

/** The init script run in a bare global with a walk whose tick the test moves; `poll` is `padFrame`'s getGamepads. */
function page(): Page {
  const state = { tick: 100 };
  const g: Record<string, unknown> = {
    addEventListener: () => undefined,
    localStorage: { setItem: () => undefined },
    navigator: { getGamepads: () => [] },
    __viewer: { ephFrame: () => ({ tick: state.tick }) },
  };
  g.globalThis = g;
  runInNewContext(ephPadInitScript({}, EPH_PAD), g);
  const nav = g.navigator as { getGamepads(): { buttons: { pressed: boolean }[]; axes: number[] }[] };
  return { poll: () => nav.getGamepads()[0]!, get tick() { return state.tick; }, set tick(t) { state.tick = t; }, g };
}

/**
 * One run: the schedule handed in, then frames of `cadence` -- each polls the pad (the frame's one input) and runs its
 * ticks on it. Answers, per scheduled press, the first tick whose input held it, and the page's own log.
 */
function play(cadence: readonly Frame[], presses: readonly { tick: number; button: number }[]) {
  const p = page();
  const list = presses.flatMap((e, i) => [[e.tick, 'button', e.button, true, 1, i + 1]]);
  (p.g.__ephPadSchedule as (l: unknown) => number)(list);
  const seen = new Map<number, number>();
  const covering = new Map<number, number>();                      // a scheduled tick -> how many ticks its frame ran
  for (const f of cadence) {
    const input = p.poll();
    for (let k = 0; k < f.ticks; k++) {
      const t = p.tick + 1;                                       // the tick this frame runs next, on this frame's input
      for (const e of presses) if (e.tick === t) covering.set(t, f.ticks);
      input.buttons.forEach((b, i) => { if (b.pressed && !seen.has(i)) seen.set(i, t); });
      p.tick = t;
    }
  }
  const log = (p.g.__ephPadLog as () => [number, number, number][])();
  return { seen, covering, log };
}

const steady = Array.from({ length: 200 }, () => ({ ticks: 1 }));
/** A 59 Hz page under 60 ticks: one frame in about sixty runs two; and a hitch of three. */
const jittered = Array.from({ length: 200 }, (_, i) => ({ ticks: i % 37 === 20 ? 2 : i === 150 ? 3 : 1 }));
const presses = [{ tick: 110, button: 0 }, { tick: 140, button: 1 }, { tick: 158, button: 2 }, { tick: 190, button: 3 }, { tick: 252, button: 4 }];

describe('LATER 1165 (d): the script applied on the page\'s own tick schedule (Option A)', () => {
  it('the init script takes a schedule and keeps a log, beside the old write', () => {
    const p = page();
    expect(typeof p.g.__ephPadSchedule).toBe('function');
    expect(typeof p.g.__ephPadLog).toBe('function');
    expect(typeof p.g.__ephPadWrite).toBe('function');
  });

  it('a scripted press lands on the same tick across two runs of different frame cadences', () => {
    const a = play(steady, presses), b = play(jittered, presses);
    for (const [i, e] of presses.entries()) {
      expect(a.seen.get(e.button), `run A, press ${i}`).toBe(e.tick);
      // Run B: on its tick where the frame covering it ran one tick; one tick late (never early) where it ran more.
      const late = (b.covering.get(e.tick) ?? 1) > 1 ? 1 : 0;
      expect(b.seen.get(e.button), `run B, press ${i}`).toBe(e.tick + late);
    }
    // The same tick in both wherever B's covering frame ran one tick -- most of them.
    const same = presses.filter((e) => a.seen.get(e.button) === b.seen.get(e.button)).length;
    expect(same).toBeGreaterThanOrEqual(3);
  });

  it("the log is what the walk saw: [line, scheduled, landed], landed - scheduled 0 or 1 here, never negative", () => {
    for (const cadence of [steady, jittered]) {
      const r = play(cadence, presses);
      expect(r.log.map(([line]) => line)).toEqual([1, 2, 3, 4, 5]);
      for (const [line, scheduled, landed] of r.log) {
        expect(landed - scheduled).toBeGreaterThanOrEqual(0);
        expect(landed - scheduled).toBeLessThanOrEqual(1);
        expect(r.seen.get(presses[line - 1]!.button)).toBe(landed);
      }
    }
  });

  it('a hitch of three ticks lands an event due on its second or third late by that much, said in the log', () => {
    // The three-tick frame of `jittered` (frame 150): its first tick is 100 plus every tick the frames before it ran.
    const first = 100 + jittered.slice(0, 150).reduce((n, f) => n + f.ticks, 0) + 1;
    const r = play(jittered, [{ tick: first + 2, button: 5 }]);
    const [, scheduled, landed] = r.log[0]!;
    expect(scheduled).toBe(first + 2);
    expect(landed).toBe(first + 3);                       // the next frame's first tick
    expect(landed).toBeGreaterThan(scheduled!);
    expect(r.seen.get(5)).toBe(landed);
  });

  it("the log's fourth field is the write index the schedule gave each entry (run.ts keys the landed ticks by it)", () => {
    const p = page();
    (p.g.__ephPadSchedule as (l: unknown) => number)([[102, 'button', 0, true, 1, 7, 0], [104, 'button', 0, false, 0, 7, 1]]);
    for (let t = 100; t < 106; t++) { p.tick = t; p.poll(); }
    expect((p.g.__ephPadLog as () => unknown[][])()).toEqual([[7, 102, 102, 0], [7, 104, 104, 1]]);
  });

  it('several events due on one tick apply together, in the order given (a same-ms release and press: the last wins)', () => {
    const p = page();
    (p.g.__ephPadSchedule as (l: unknown) => number)([[105, 'axis', 0, false, 1, 1], [105, 'axis', 0, false, 0, 2], [105, 'axis', 0, false, -1, 3]]);
    p.tick = 104;
    expect(p.poll().axes[0]).toBe(-1);
  });
});
