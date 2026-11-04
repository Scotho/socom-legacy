import { describe, expect, it } from 'vitest';
import type { MovieEndMessage, MovieFrame, MovieStreamHandle } from '@s2u/fmv';
import { UI_TICK_SECONDS } from '@s2u/ui';
import { OPENER_MOVIES, playMovieInRealTime } from '../src/movieRealtime';

/**
 * PLAT-19c in the page (web research 120 §11): a movie played as the dialog background plays it -- PLAT-21's player,
 * one picture a tick of PLAT-12's clock (29.97 Hz), over PLAT-19b's worker stream -- until its event 3, with the budget
 * counted. Here over a scripted stream and a hand-driven animation frame; the real page run is
 * `e2e/movieRealtime.spec.ts` (dev host).
 */

const W = 4, H = 2;
const frame = (index: number): MovieFrame => ({
  kind: 'picture', index, codingIndex: index, type: 'I', temporalReference: index, pts: null, width: W, height: H,
  rgba: new ArrayBuffer(W * H * 4), decodeMs: 2, readMs: 0, queued: 2,
});
const end = (n: number): MovieEndMessage => ({ kind: 'end', pictures: n, coded: n, invalid: 0, error: null });

/** Animation frames driven by hand at `hz`: `run()` fires them until nothing is asked for. */
function frames(hz: number) {
  let t = 0;
  let next: ((t: number) => void) | null = null;
  return {
    now: () => t,
    requestFrame: (cb: (t: number) => void) => { next = cb; },
    run(limit = 10_000) {
      for (let i = 0; i < limit && next; i++) { const cb = next; next = null; t += 1000 / hz; cb(t); }
    },
  };
}

describe('the opener\'s movies, in real time in the page', () => {
  it('names the three movies of the boot and the menu by their disc paths (research 121 §10)', () => {
    expect(OPENER_MOVIES).toEqual(['RUN/MOVIES/COMMON/SONY448.PSS', 'RUN/MOVIES/INTRO_2.PSS', 'RUN/MOVIES/COMMON/MENULOOP.PSS']);
  });

  it('one picture per 29.97 Hz tick on a 60 Hz display, every picture once and in order, done at event 3', async () => {
    const N = 30;
    const script: (MovieFrame | MovieEndMessage | null)[] = [null, ...Array.from({ length: N }, (_, i) => frame(i)), end(N)];
    let k = 0;
    const handle: MovieStreamHandle = { tick: () => script[Math.min(k++, script.length - 1)]!, release: () => {}, close: () => {} };
    const shown: number[] = [];
    const display = frames(60);
    const run = playMovieInRealTime({
      path: 'RUN/MOVIES/COMMON/SONY448.PSS', open: () => handle, present: (f) => shown.push(f.index),
      now: display.now, requestFrame: display.requestFrame,
    });
    display.run();
    const r = await run;
    expect(shown).toEqual(Array.from({ length: N }, (_, i) => i));
    expect(r.budget).toMatchObject({ pictures: N, lateTicks: 0, dropped: 0, repeated: 0, startupTicks: 1, sustained: true });
    // The ticks at 29.97 Hz: start-up, N pictures, the NODATA tick, the event's tick.
    expect(r.ticks).toBe(N + 3);
    expect(r.budget.presentedFps).toBeGreaterThan(29.5);
    expect(r.budget.presentedFps).toBeLessThan(30.5);
    expect(r.tickSeconds).toBe(UI_TICK_SECONDS);
    expect(r.lostSeconds).toBe(0);
  });

  it('tells the movie\'s sound (PLAT-20) each picture as it is presented, and stops it at event 3', async () => {
    const N = 4;
    const script: (MovieFrame | MovieEndMessage | null)[] = [...Array.from({ length: N }, (_, i) => frame(i)), end(N)];
    let k = 0;
    const handle: MovieStreamHandle = { tick: () => script[Math.min(k++, script.length - 1)]!, release: () => {}, close: () => {} };
    const heard: string[] = [];
    const display = frames(60);
    const run = playMovieInRealTime({
      path: 'RUN/MOVIES/INTRO_2.PSS', open: () => handle, present: () => heard.push('shown'),
      now: display.now, requestFrame: display.requestFrame,
      sound: { picture: (i) => heard.push(`picture ${i}`), stop: () => heard.push('stop') },
    });
    display.run();
    await run;
    expect(heard).toEqual(['shown', 'picture 0', 'shown', 'picture 1', 'shown', 'picture 2', 'shown', 'picture 3', 'stop']);
  });

  it('a display stall longer than the clock\'s catch-up slows the movie and loses no picture', async () => {
    const N = 12;
    const script: (MovieFrame | MovieEndMessage | null)[] = [...Array.from({ length: N }, (_, i) => frame(i)), end(N)];
    let k = 0;
    const handle: MovieStreamHandle = { tick: () => script[Math.min(k++, script.length - 1)]!, release: () => {}, close: () => {} };
    const shown: number[] = [];
    let t = 0;
    let next: ((t: number) => void) | null = null;
    const run = playMovieInRealTime({
      path: 'RUN/MOVIES/INTRO_2.PSS', open: () => handle, present: (f) => shown.push(f.index),
      now: () => t, requestFrame: (cb) => { next = cb; },
    });
    for (let i = 0; i < 1000 && next; i++) {
      const cb: (t: number) => void = next;
      next = null;
      t += i === 5 ? 500 : 1000 / 60;                 // one half-second stall (a GC pause, a busy main thread)
      cb(t);
    }
    const r = await run;
    expect(shown).toEqual(Array.from({ length: N }, (_, i) => i));
    expect(r.lostSeconds).toBeGreaterThan(0.4);
    expect(r.budget.dropped).toBe(0);
  });
});
