import { describe, expect, it } from 'vitest';
import {
  BLACK_SOURCE_UNKNOWN_COUNT_PLACEHOLDER, BackgroundMoviePlayer, BlackPictureSource, MOVIE_CLOCK_CATCHUP_READING, MOVIE_END, MOVIE_END_LATENCY_READING,
  MOVIE_HOLD_READING, MOVIE_PENDING, MOVIE_PICTURE_COUNTS, MOVIE_PICTURE_LATE_READING, MOVIE_PICTURE_PERIOD_READING, MOVIE_SETTLE_READING, MOVIE_SKIP_CARRY_READING, MOVIE_SKIP_TIMER, MOVIE_STATE_FADE_HOLD,
  MovieFrameClock, MovieStatePlayer, PAD_STATE,
  type MovieNext, type MoviePictureSource, type MovieStatePad, type PadState,
} from '../src/player';

/**
 * PLAT-21's reading level (CI): the background player's state machine (`FUN_00366940`, D:L262866-262900, with its start
 * `FUN_00366a00`, its stop `FUN_00366b10`, the build's movie part D:L263745-263764 and the unload's D:L264407-264422)
 * transcribed from web research 121 §2's table row by row, and the movie state's tick (0x1ed010-0x1ed174, research 121
 * §6, re-read off the disassembly for this test) -- each driven by a synthetic picture source. No expected value was
 * produced by running the player: the tick numbers are §2's "what the test asserts" (a source of N pictures presents
 * 0..N-1 on ticks 1..N, nothing on N+1, event 3 on N+2).
 */

/** A synthetic picture source: `count` pictures numbered from 0, then the end; every call logged. */
class Synthetic implements MoviePictureSource<number> {
  readonly log: string[] = [];
  at = 0;
  pending = 0;
  constructor(private readonly counts: Readonly<Record<string, number>>, private readonly decoderEnd = false) {}
  open(name: string, options: { audioStream: number }): boolean {
    this.log.push(`open ${name} ${options.audioStream}`);
    this.at = 0;
    return name in this.counts;
  }
  private name(): string { const o = [...this.log].reverse().find((l) => l.startsWith('open ')); return o!.split(' ')[1]!; }
  next(): MovieNext<number> {
    if (this.pending > 0) { this.pending--; return MOVIE_PENDING; }
    if (this.at >= this.counts[this.name()]!) { this.log.push('nodata'); return MOVIE_END; }
    return this.at++;
  }
  atEnd(): boolean { return this.decoderEnd && this.at >= this.counts[this.name()]!; }
  restart(): void { this.log.push('restart'); this.at = 0; }
  close(): void { this.log.push('close'); }
}

/** A background player over `src`, recording each presented picture and each event 3 by the tick it came on. */
function rig(src: Synthetic, endCheck?: 'nodata' | 'decoder') {
  const shown: [number, number][] = [], events: number[] = [], order: string[] = [];
  let tick = 0;
  const p = new BackgroundMoviePlayer<number>({
    source: src, sink: { present: (pic) => shown.push([tick, pic]) },
    onEnd: () => { events.push(tick); order.push('event3'); }, endCheck,
  });
  const run = (n: number): void => { for (let i = 0; i < n; i++) { tick++; p.tick(); } };
  return { p, shown, events, order, run, now: () => tick };
}

const MPEG = { type: 1, filename: 'run/movies/a.pss' };
const LOOPING = { type: 2, filename: 'run/movies/a.pss' };

describe('the background player (FUN_00366940; research 121 §2)', () => {
  it('row 1 and row 3: no movie -- a tick does nothing; an IMAGE background opens nothing and fires nothing', () => {
    const src = new Synthetic({ 'run/movies/a.pss': 3 });
    const r = rig(src);
    r.run(3);
    expect(r.p.state).toBe('NONE');
    const starts: string[] = [];
    r.p.build({ type: 0, filename: 'Flag_back.tif' }, () => starts.push('ONSTART'));
    r.p.build(null, () => starts.push('ONSTART'));
    r.run(5);
    expect(starts).toEqual(['ONSTART', 'ONSTART']);
    expect(r.p.state).toBe('NONE');
    expect(src.log).toEqual([]);
    expect(r.events).toEqual([]);
  });

  it('rows 4-8: N pictures on ticks 1..N, none on N+1 (NODATA), event 3 exactly once on N+2, then nothing ever', () => {
    const src = new Synthetic({ 'run/movies/a.pss': 4 });
    const r = rig(src);
    r.p.build(MPEG, () => r.order.push('ONSTART'));
    expect(r.order).toEqual(['ONSTART']);                     // ONSTART before the open (D:L263733, then D:L263759)
    expect(src.log).toEqual(['open run/movies/a.pss 0']);     // FUN_003098e0(name, 1, 0, 0): audio stream 0
    expect(r.p.state).toBe('PLAYING');
    expect(r.shown).toEqual([]);                              // the open decodes no picture (§7)
    r.run(4);
    expect(r.shown).toEqual([[1, 0], [2, 1], [3, 2], [4, 3]]);
    r.run(1);                                                 // tick N+1: NODATA, no picture, marked ended (row 6)
    expect(r.shown.length).toBe(4);
    expect(r.p.state).toBe('ENDED');
    expect(r.events).toEqual([]);
    r.run(1);                                                 // tick N+2: event 3, then close (row 8, loop clear)
    expect(r.events).toEqual([6]);
    expect(r.p.state).toBe('STOPPED');
    expect(src.log).toEqual(['open run/movies/a.pss 0', 'nodata', 'close']);
    r.run(200);                                               // row 10: stopped, nothing however long
    expect(r.events).toEqual([6]);
    expect(r.shown.length).toBe(4);
    expect(src.log.length).toBe(3);
  });

  it('row 8 fires the event before the close (FUN_00367810 at D:L262888, FUN_003096f0 at D:L262892)', () => {
    const src = new Synthetic({ 'run/movies/a.pss': 1 });
    const seen: string[] = [];
    const p = new BackgroundMoviePlayer<number>({ source: src, sink: { present: () => {} }, onEnd: () => seen.push(`event3 after ${src.log.at(-1)}`) });
    p.build(MPEG);
    p.tick(); p.tick(); p.tick();
    expect(seen).toEqual(['event3 after nodata']);
    expect(src.log.at(-1)).toBe('close');
  });

  it('row 9: with the loop flag (TYPE MPEG_LOOPING) the end restarts -- no picture that tick, picture 0 on the next, event 3 again N+2 ticks later', () => {
    const src = new Synthetic({ 'run/movies/a.pss': 3 });
    const r = rig(src);
    r.p.build(LOOPING);
    expect(r.p.loop).toBe(true);
    r.run(5);                                                 // N=3: event on tick 5
    expect(r.events).toEqual([5]);
    expect(r.p.state).toBe('PLAYING');
    expect(src.log).toEqual(['open run/movies/a.pss 0', 'nodata', 'restart']);   // a seek, not a reopen (§5)
    expect(r.shown.map(([t]) => t)).toEqual([1, 2, 3]);
    r.run(1);
    expect(r.shown.at(-1)).toEqual([6, 0]);
    r.run(4);
    expect(r.events).toEqual([5, 10]);
    expect(r.shown.filter(([, pic]) => pic === 0).map(([t]) => t)).toEqual([1, 6]);
    r.run(1);
    expect(r.shown.at(-1)).toEqual([11, 0]);
  });

  it('row 4, a failed open: event 3 during the build, after ONSTART; stopped; no further event', () => {
    const src = new Synthetic({});
    const r = rig(src);
    r.p.build({ type: 1, filename: 'run/movies/Tut_11.pss' }, () => r.order.push('ONSTART'));
    expect(r.order).toEqual(['ONSTART', 'event3']);           // D:L263733 then D:L263762-263764
    expect(r.events).toEqual([0]);
    expect(r.p.state).toBe('STOPPED');
    r.run(50);
    expect(r.events).toEqual([0]);
  });

  it('a BACKGROUND MPEG with no FILENAME opens nothing: the build fires event 3 at once (the open of no name fails)', () => {
    const src = new Synthetic({});
    const r = rig(src);
    r.p.build({ type: 1, filename: null });
    expect(r.events).toEqual([0]);
    expect(r.p.state).toBe('STOPPED');
  });

  it('rows 11-12: OFF closes a playing movie with no event; OFF when stopped or with no movie does nothing and answers false', () => {
    const src = new Synthetic({ 'run/movies/a.pss': 3 });
    const r = rig(src);
    expect(r.p.off()).toBe(false);                            // NONE
    r.p.build(MPEG);
    r.run(2);
    expect(r.p.off()).toBe(true);
    expect(r.p.state).toBe('STOPPED');
    expect(src.log.at(-1)).toBe('close');
    expect(r.p.off()).toBe(false);                            // STOPPED
    r.run(20);
    expect(r.events).toEqual([]);
    // ENDED, then OFF before the event's tick: no event either.
    r.p.on(); r.run(4);
    expect(r.p.state).toBe('ENDED');
    expect(r.p.off()).toBe(true);
    r.run(5);
    expect(r.events).toEqual([]);
  });

  it('row 13: ON reopens the stored name from picture 0 (closing a playing one first); a failed ON fires no event', () => {
    const src = new Synthetic({ 'run/movies/a.pss': 5 });
    const r = rig(src);
    r.p.build(MPEG);
    r.run(3);
    expect(r.p.on()).toBe(true);
    expect(src.log).toEqual(['open run/movies/a.pss 0', 'close', 'open run/movies/a.pss 0']);
    r.run(1);
    expect(r.shown.at(-1)).toEqual([4, 0]);
    // A failed ON: the name now names a file the source cannot open.
    expect(r.p.on('run/movies/missing.pss')).toBe(false);
    expect(r.p.state).toBe('STOPPED');
    r.run(10);
    expect(r.events).toEqual([]);
  });

  it('row 14: BackgroundMPEG <file> retargets, and the name is kept for a later ON', () => {
    const src = new Synthetic({ 'run/movies/a.pss': 5, 'run/movies/b.pss': 2 });
    const r = rig(src);
    r.p.build(MPEG);
    expect(r.p.on('run/movies/b.pss')).toBe(true);
    expect(r.p.name).toBe('run/movies/b.pss');
    r.p.off();
    expect(r.p.on()).toBe(true);
    expect(src.log.at(-1)).toBe('open run/movies/b.pss 0');
  });

  it('row 15: a dialog without an MPEG background cannot gain one: ON and <file> answer false and open nothing', () => {
    const src = new Synthetic({ 'run/movies/a.pss': 5 });
    const r = rig(src);
    expect(r.p.on()).toBe(false);
    expect(r.p.on('run/movies/a.pss')).toBe(false);
    expect(src.log).toEqual([]);
    expect(r.p.state).toBe('NONE');
  });

  it('row 2 and §8: a dialog left and re-entered starts its movie over from picture 0; the old end is never delivered to the new dialog', () => {
    const src = new Synthetic({ 'run/movies/Intro_2.pss': 6 });
    let current = 'dlgSecondCinematic';
    const ends: string[] = [], shown: number[] = [];
    const p = new BackgroundMoviePlayer<number>({ source: src, sink: { present: (pic) => shown.push(pic) }, onEnd: () => ends.push(current) });
    p.build({ type: 1, filename: 'run/movies/Intro_2.pss' });
    for (let i = 0; i < 6; i++) p.tick();                    // all six pictures; the NODATA tick not yet run
    p.tick();                                                 // ENDED
    expect(p.state).toBe('ENDED');
    current = 'dlgMenu';
    p.build({ type: 0, filename: 'blank' });                  // unload: closed, has-movie cleared (D:L264407-264422)
    expect(p.state).toBe('NONE');
    expect(src.log.at(-1)).toBe('close');
    for (let i = 0; i < 5; i++) p.tick();
    expect(ends).toEqual([]);                                 // the ended movie's event never reaches dlgMenu
    current = 'dlgAttractCinematic';
    p.build({ type: 1, filename: 'run/movies/Intro_2.pss' }); // the same file, built fresh
    p.tick();
    expect(shown.at(-1)).toBe(0);
    for (let i = 0; i < 7; i++) p.tick();
    expect(ends).toEqual(['dlgAttractCinematic']);
  });

  it('row 16: a state pop restarts the background from picture 0 (FUN_001f45e0 -> FUN_00366a00(shell, 0))', () => {
    const src = new Synthetic({ 'run/movies/menuloop.pss': 9 });
    const r = rig(src);
    r.p.build({ type: 1, filename: 'run/movies/menuloop.pss' });
    r.run(4);
    expect(r.p.statePop()).toBe(true);
    r.run(1);
    expect(r.shown.at(-1)).toEqual([5, 0]);
  });

  it('MOVIE_PICTURE_LATE_READING: a tick whose picture is not ready presents nothing and moves nothing', () => {
    expect(MOVIE_PICTURE_LATE_READING).toBe('hold-tick');
    const src = new Synthetic({ 'run/movies/a.pss': 2 });
    const r = rig(src);
    r.p.build(MPEG);
    src.pending = 2;
    r.run(2);
    expect(r.shown).toEqual([]);
    expect(r.p.state).toBe('PLAYING');
    r.run(4);
    expect(r.shown).toEqual([[3, 0], [4, 1]]);
    expect(r.events).toEqual([6]);
  });

  it('MOVIE_END_LATENCY_READING: the NODATA path by default; the decoder-end path (FUN_001bbab8, row 7) is one tick sooner', () => {
    expect(MOVIE_END_LATENCY_READING).toBe('nodata');
    const a = rig(new Synthetic({ 'run/movies/a.pss': 3 }, true));
    a.p.build(MPEG); a.run(10);
    expect(a.events).toEqual([5]);                            // the source's atEnd is not consulted on the reading
    const b = rig(new Synthetic({ 'run/movies/a.pss': 3 }, true), 'decoder');
    b.p.build(MPEG); b.run(10);
    expect(b.events).toEqual([4]);
  });

  it('an ONMPEGEND handler that builds the next MPEG dialog at once leaves the new movie alone (no close, no restart; a per-open generation)', () => {
    for (const next of [MPEG, LOOPING]) {
      const src = new Synthetic({ 'run/movies/a.pss': 2, 'run/movies/b.pss': 3 });
      const shown: number[] = [], events: string[] = [];
      const p: BackgroundMoviePlayer<number> = new BackgroundMoviePlayer<number>({
        source: src, sink: { present: (pic) => shown.push(pic) },
        onEnd: () => { events.push(p.name!); if (p.name === 'run/movies/a.pss') p.build({ ...next, filename: 'run/movies/b.pss' }); },
      });
      p.build(MPEG);                                          // a.pss: pictures on ticks 1-2, NODATA on 3, the event on 4
      for (let i = 0; i < 4; i++) p.tick();
      expect(events).toEqual(['run/movies/a.pss']);
      expect(p.state).toBe('PLAYING');                        // b.pss opened by the handler's build, not closed by the old tick
      expect(src.log).toEqual(['open run/movies/a.pss 0', 'nodata', 'close', 'open run/movies/b.pss 0']);
      for (let i = 0; i < 3; i++) p.tick();
      expect(shown).toEqual([0, 1, 0, 1, 2]);                 // b.pss from its picture 0
    }
  });

  it('the readings it names hold their research 121 §14 values', () => {
    expect(MOVIE_PICTURE_PERIOD_READING).toBe(1001 / 30000);
    expect(MOVIE_HOLD_READING).toBe('keep-last');
    expect(MOVIE_SETTLE_READING).toBe(0);
    expect(MOVIE_SKIP_CARRY_READING).toBe('pressed-in-state');
  });
});

describe('the movie state (PlayMPEG; FUN_001ed560 init, 0x1ed010 tick, FUN_001eccf0 exit; research 121 §6)', () => {
  /** A movie state over a synthetic source; each tick's alpha, pop and picture recorded. */
  function state(counts: Record<string, number>) {
    const src = new Synthetic(counts);
    const out = { shown: [] as number[], alpha: [] as number[], pops: 0 };
    const m = new MovieStatePlayer<number>({
      source: src, sink: { present: (pic) => out.shown.push(pic) }, setAlpha: (a) => out.alpha.push(a), onPop: () => { out.pops++; },
    });
    return { m, src, out };
  }
  const pad = (cross: PadState): MovieStatePad => ({ cross });
  const UP = pad(PAD_STATE.UP), PRESSED = pad(PAD_STATE.PRESSED), HELD = pad(PAD_STATE.HELD), RELEASED = pad(PAD_STATE.RELEASED);

  it('opens with the command\'s audio stream, presents one picture per tick, and at its end closes and pops with no event', () => {
    const { m, src, out } = state({ 'ArtGall2.pss': 3 });
    m.init({ file: 'ArtGall2.pss', fade: true, audioStream: 2 });
    expect(src.log).toEqual(['open ArtGall2.pss 2']);         // FUN_001ed560 D:L51362
    for (let i = 0; i < 3; i++) expect(m.tick(1 / 30, UP).popped).toBe(false);
    expect(out.shown).toEqual([0, 1, 2]);
    expect(m.tick(1 / 30, UP).popped).toBe(false);            // the NODATA tick
    expect(m.tick(1 / 30, UP).popped).toBe(true);             // ended: close and pop (0x1ed144-0x1ed174)
    expect(src.log.slice(-1)).toEqual(['close']);
    expect(out.pops).toBe(1);
    expect(out.alpha).toEqual([]);                            // a natural end does not fade
    expect(m.active).toBe(false);
  });

  it('MOVIE_END_LATENCY_READING: the movie state ends on FUN_003096c0 (0x1ed144), the check the background makes -- the decoder-end path pops one tick sooner', () => {
    const run = (endCheck?: 'nodata' | 'decoder'): number => {
      const src = new Synthetic({ 'a.pss': 3 }, true);
      const m = new MovieStatePlayer<number>({ source: src, sink: { present: () => {} }, setAlpha: () => {}, onPop: () => {}, endCheck });
      m.init({ file: 'a.pss', fade: true, audioStream: 0 });
      let n = 0;
      while (!m.tick(1 / 30, UP).popped) n++;
      return n + 1;
    };
    expect(run()).toBe(5);                                    // 3 pictures, the NODATA tick, the pop
    expect(run('decoder')).toBe(4);                           // FUN_001bbab8 reports the end before the call
  });

  it('a failed open closes and pops on the first tick (Tut_11 / Tut_12 are not on the disc)', () => {
    const { m, out } = state({});
    m.init({ file: 'Tut_11.pss', fade: true, audioStream: 0 });
    expect(m.tick(1 / 30, UP).popped).toBe(true);
    expect(out.pops).toBe(1);
    expect(out.shown).toEqual([]);
  });

  it('the first flip of the state is not shown (DAT_00408c00, 0x1ed4d4-0x1ed4e8)', () => {
    const { m } = state({ 'a.pss': 5 });
    m.init({ file: 'a.pss', fade: true, audioStream: 0 });
    expect(m.tick(1 / 30, UP).flipShown).toBe(false);
    expect(m.tick(1 / 30, UP).flipShown).toBe(true);
  });

  it('skip with FADE: CROSS released starts a 1.1 s timer; alpha (t - 0.1) while t >= 0.1, 0 below, the movie decoding on; pop when t < 0', () => {
    const { m, out } = state({ 'a.pss': 100 });
    m.init({ file: 'a.pss', fade: true, audioStream: 0 });
    m.tick(0.25, PRESSED);
    m.tick(0.25, HELD);
    const shownBefore = out.shown.length;
    const t = [m.tick(0.25, RELEASED), m.tick(0.25, UP), m.tick(0.25, RELEASED), m.tick(0.25, UP)];
    expect(t.map((x) => x.popped)).toEqual([false, false, false, false]);
    // t = 1.1 - 0.25 k in f32: 0.85, 0.6, 0.35, 0.1 (+2.4e-8, above f32 0.1): alpha 0.75, 0.5, 0.25, ~0.
    expect(out.alpha.length).toBe(4);
    [0.75, 0.5, 0.25, 0].forEach((a, i) => expect(out.alpha[i]).toBeCloseTo(a, 6));
    expect(out.shown.length).toBe(shownBefore + 4);           // "the movie keeps decoding through the fade"
    expect(m.tick(0.25, UP).popped).toBe(true);               // t = -0.15: alpha 0, stop, close, pop; no picture
    expect(out.alpha.at(-1)).toBe(0);
    expect(out.shown.length).toBe(shownBefore + 4);
    expect(MOVIE_SKIP_TIMER).toBe(Math.fround(1.1));
    expect(MOVIE_STATE_FADE_HOLD).toBe(Math.fround(0.1));
  });

  it('skip with FADE at the menu\'s 29.97/s: the pop comes on the 33rd tick counting the release', () => {
    const { m } = state({ 'a.pss': 1000 });
    m.init({ file: 'a.pss', fade: true, audioStream: 0 });
    m.tick(MOVIE_PICTURE_PERIOD_READING, PRESSED);
    let n = 0, popped = false;
    for (let pad = RELEASED; !popped; pad = UP) { n++; popped = m.tick(MOVIE_PICTURE_PERIOD_READING, pad).popped; }
    expect(n).toBe(33);                                       // 1.1 / (1001/30000) = 32.97
  });

  it('skip without FADE (PlayMPEGNoFade): alpha 0 and close and pop on the release\'s own tick', () => {
    const { m, out } = state({ 'a.pss': 100 });
    m.init({ file: 'a.pss', fade: false, audioStream: 0 });
    m.tick(1 / 30, PRESSED);
    expect(m.tick(1 / 30, RELEASED).popped).toBe(true);
    expect(out.alpha).toEqual([0]);
    expect(out.shown).toEqual([0]);
  });

  it('only the release skips (state 3); a press or a hold does not; a second release does not restart the timer', () => {
    const { m, out } = state({ 'a.pss': 100 });
    m.init({ file: 'a.pss', fade: true, audioStream: 0 });
    for (let i = 0; i < 5; i++) m.tick(0.25, i === 0 ? PRESSED : HELD);
    expect(out.alpha).toEqual([]);
    m.tick(0.25, RELEASED);                                   // t 0.85
    m.tick(0.25, PRESSED);
    m.tick(0.25, RELEASED);                                   // t 0.35, not reset to 1.1 - 0.25
    expect(out.alpha[2]).toBeCloseTo(0.25, 6);
  });

  it('MOVIE_SKIP_CARRY_READING: the release of a CROSS pressed before the state began does not skip', () => {
    const { m, out } = state({ 'a.pss': 100 });
    m.init({ file: 'a.pss', fade: true, audioStream: 0 });
    expect(m.tick(1 / 30, HELD).popped).toBe(false);
    expect(m.tick(1 / 30, RELEASED).popped).toBe(false);
    expect(out.alpha).toEqual([]);
    m.tick(1 / 30, PRESSED);
    m.tick(1 / 30, RELEASED);
    expect(out.alpha.length).toBe(1);
  });

  it('no pad (DAT_0044f108 null) never skips; the exit sets the output alpha back to 1.0 (FUN_001eccf0)', () => {
    const { m, out } = state({ 'a.pss': 100 });
    m.init({ file: 'a.pss', fade: true, audioStream: 0 });
    for (let i = 0; i < 10; i++) m.tick(1 / 30, null);
    expect(out.alpha).toEqual([]);
    m.exit();
    expect(out.alpha).toEqual([1]);
  });
});

describe('the frame clock stand-in (W9.R10; research 121 §9)', () => {
  it('one menu frame per 1001/30000 s: SONY448\'s 310 pictures take 10.3437 s', () => {
    const c = new MovieFrameClock(MOVIE_PICTURE_PERIOD_READING, Infinity);
    expect(c.advance(1)).toBe(29);                            // 29.97 frames in a second: 29 due, the rest carried
    expect(c.advance(10.3436667 - 1 - 1e-6)).toBe(280);
    expect(c.advance(2e-6)).toBe(1);
  });

  it('MOVIE_CLOCK_CATCHUP_READING: a long gap (a hidden tab) runs at most that many frames, the rest of the time dropped, as the console stalls', () => {
    expect(MOVIE_CLOCK_CATCHUP_READING).toBe(2);
    const c = new MovieFrameClock();
    expect(c.advance(60)).toBe(2);
    expect(c.advance(MOVIE_PICTURE_PERIOD_READING * 0.5)).toBe(0);   // the dropped time is not owed afterwards
    expect(c.advance(MOVIE_PICTURE_PERIOD_READING * 0.5)).toBe(1);
    expect(c.advance(MOVIE_PICTURE_PERIOD_READING * 2.25)).toBe(2);  // one late frame still caught up
  });
});

describe('the black picture source (until PLAT-19b)', () => {
  it('gives the disc movie\'s picture count of black pictures, then the end; a name is matched as the disc is (case and slashes)', () => {
    expect(MOVIE_PICTURE_COUNTS).toEqual({ 'run/movies/common/sony448.pss': 310, 'run/movies/common/menuloop.pss': 3732, 'run/movies/intro_2.pss': 3836 });
    const s = new BlackPictureSource();
    expect(s.open('RUN\\MOVIES\\COMMON\\SONY448.PSS', { audioStream: 0 })).toBe(true);
    let n = 0;
    while (s.next() !== MOVIE_END) n++;
    expect(n).toBe(310);
    s.restart();
    expect(s.next()).toEqual({ index: 0, black: true });
    expect(s.open('ArtGall2.pss', { audioStream: 0 })).toBe(true);
    expect(BLACK_SOURCE_UNKNOWN_COUNT_PLACEHOLDER).toBe(0);
    expect(s.next()).toBe(MOVIE_END);
    expect(new BlackPictureSource(MOVIE_PICTURE_COUNTS, () => false).open('run/movies/Tut_11.pss', { audioStream: 0 })).toBe(false);
  });
});
