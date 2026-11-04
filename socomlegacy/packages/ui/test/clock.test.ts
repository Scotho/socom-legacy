import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Zar } from '@s2u/archive';
import { GAME_FRAME_DT, parseAnimSets } from '@s2u/scene';
import { ValveStore } from '../src/valves';
import { ZAnimRuntime, type ZAnimNode, type ZAnimNodeTree, type ZAnimRtAnimation, type ZAnimRtSet } from '../src/zanimRuntime';
import {
  CATCHUP_LIMIT_READING, DROPPED_FRAME_READING, GAME_FRAME_DT_SECONDS, HIDDEN_TAB_READING, MOVIE_PACE_READING, MoviePacer, NTSC_HBLANK_HZ,
  NTSC_HBLANK_SCALE, NTSC_FRAME_HBLANKS,
  PTS_CLOCK_HZ, SHELL_STEP_CLAMP_SECONDS, UI_FIELDS_PER_TICK, UI_TICK_HZ_READING, UI_TICK_RATE, UI_TICK_SECONDS, UiClock, pictureForTick,
  ptsSeconds, tickSeconds, type Rate,
} from '../src/clock';

// Web research 110 (PLAT-12). Every expectation is read from the retail decompilation (`D:L<line>` = a line of
// game/analysis/socom2_game.elf.decomp.c), the ELF's data words, or the research it cites; no expected value was
// produced by running the clock.

/** The block's rate (PLAT-12 "What the original does": "shell tick at 60 Hz"), kept to test the clock at that rate. */
const BLOCK_60: Rate = { num: 60, den: 1 };
/** The NTSC field rate, 60000/1001. */
const FIELD_RATE: Rate = { num: 60000, den: 1001 };
/** A 60 Hz display's requestAnimationFrame period, in ms. */
const RAF_60 = 1000 / 60;

/** A tree that makes a node for any name, active unless named in `inactive`. */
function anyTree(inactive: readonly string[] = []): ZAnimNodeTree & { nodes: Map<string, ZAnimNode> } {
  const nodes = new Map<string, ZAnimNode>();
  return {
    nodes,
    node(name: string): ZAnimNode {
      let n = nodes.get(name);
      if (!n) { n = { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], opacity: 1, active: !inactive.includes(name) }; nodes.set(name, n); }
      return n;
    },
  };
}

/**
 * `OBJECT_OPACITY_FROM_TO` (set 0, command 25, 0x18 bytes, timed: research 106 §4) on node 1 = MENUFADER, laid out as
 * `parseAnimSets` returns it: the disc's 0.5 s MENUFADER fade, from 0 to 0.99 at 1.98 a second (`dlgMenu.rdr`'s
 * `UiAttractMode` and 13 more in `RUN/UIZANIM.ZAR`, research 115 §5; pinned on the disc below).
 */
function fadeAnim(from: number, to: number, rate: number, time: number): ZAnimRtAnimation {
  const b = new Uint8Array(0x18), v = new DataView(b.buffer);
  v.setUint32(0, (25 | (0x18 << 18)) >>> 0, true);
  v.setUint16(4, 1, true); v.setFloat32(8, from, true); v.setFloat32(0xc, to, true); v.setFloat32(0x10, rate, true); v.setFloat32(0x14, time, true);
  const command = { offset: 0x1c, set: 0, cmd: 25, timeless: false, size: 0x18, bytes: b };
  return {
    name: 'fade', names: ['NA'], nodeRefs: [{ name: 'NA' }, { name: 'MENUFADER' }],
    params: { flags: 0x22, priority: 3, seqOffsets: [0, 0, 0, 0], state: 1 },
    sequences: [{ offset: 0, name: 'NA', word: 0x102, size: 0x1c + 0x18, commands: [command] }],
  };
}

/** Runs `sets`' animation `name` on the clock's ticks, a 60 Hz display feeding now(), until `ticks` ticks; MENUFADER's opacity after each. */
function fadeOnClock(sets: readonly ZAnimRtSet[], name: string, ticks: number, rate?: Rate, inactive: readonly string[] = []): number[] {
  const tree = anyTree(inactive);
  const rt = new ZAnimRuntime({ sets, valves: new ValveStore(), nodes: tree, host: { uiCommand: () => true } });
  rt.activate();
  expect(rt.start(name)).not.toBeNull();
  const clock = new UiClock(rate ? { rate } : {});
  const seen: number[] = [];
  let frame = 0;
  clock.advance(0);
  // Bounded: a clock that stops ticking fails here instead of hanging the suite (10 x ticks frames of 60 Hz cover any
  // tick rate down to 6 Hz).
  while (clock.ticks < ticks && frame < 10 * ticks) {
    clock.advance(++frame * RAF_60, (_tick, dt) => {
      rt.tick(Math.min(dt, SHELL_STEP_CLAMP_SECONDS));      // the shell's step (FUN_003654c0 A2, D:L262270-262273)
      seen.push(tree.nodes.get('MENUFADER')?.opacity ?? Number.NaN);
    });
  }
  expect(clock.ticks).toBe(ticks);
  return seen;
}

/** The first tick (1-based) whose opacity is the f32 0.99 the command snaps to. */
const F32_099 = Math.fround(0.99);
const reached = (seen: readonly number[]): number => seen.findIndex((o) => o === F32_099) + 1;

// ---------------------------------------------------------------------------------------------------------------------

describe('the UI tick rate (FUN_003aff30 D:L304731-304768; DAT_003e1400 = 30; FUN_003b14a0 D:L305383; FUN_0034f3c0 D:L249327-249333)', () => {
  it('two NTSC fields a tick: 29.97 Hz, the hardware\'s two-field frame 30000/1001 to 1 ppm', () => {
    expect(UI_FIELDS_PER_TICK).toBe(2);
    expect(NTSC_FRAME_HBLANKS).toBe(525);                         // 2 x 262.5
    expect(UI_TICK_HZ_READING).toBe(29.97);
    expect(Math.abs(UI_TICK_HZ_READING / (30000 / 1001) - 1)).toBeLessThan(1.1e-6);   // 60000/1001 fields a second, / 2
    expect(UI_TICK_RATE).toEqual({ num: 2997, den: 100 });
    expect(UI_TICK_SECONDS).toBe(100 / 2997);
    expect(tickSeconds(UI_TICK_RATE)).toBe(UI_TICK_SECONDS);
    expect(SHELL_STEP_CLAMP_SECONDS).toBe(0.05);
  });

  it('dt\'s scale is the truncated 15734, not 15734.25: the game\'s two-field dt is 525 / 15734 s (29.9695 Hz), 16 ppm off the tick', () => {
    expect(NTSC_HBLANK_HZ).toBe(15734.25);                        // DAT_004a44f8 = 0x4675d900, video mode 0 (D:L305383)
    expect(NTSC_HBLANK_SCALE).toBe(15734);                        // DAT_0049e2d4 = (uint)DAT_004a44f8 (D:L249327-249328)
    expect(GAME_FRAME_DT_SECONDS).toBe(525 / 15734);              // count x DAT_0049e2d8 = 1/15734 (D:L249333, D:L304764)
    // PF-01 (research 208 §2): the UI's own copy and the page's and room's `GAME_FRAME_DT` are the one value, bit for bit.
    expect(GAME_FRAME_DT_SECONDS).toBe(GAME_FRAME_DT);
    expect(1 / GAME_FRAME_DT_SECONDS).toBeCloseTo(29.9695, 4);
    const ppm = Math.abs(GAME_FRAME_DT_SECONDS / UI_TICK_SECONDS - 1);
    expect(ppm).toBeGreaterThan(15e-6);
    expect(ppm).toBeLessThan(17e-6);
    // The flip's wait t + 1/60 < 1/30 (f32, D:L304747) in counts of 1/15734: 262 waits, 263 does not (the 262/263 split).
    const waits = (count: number): boolean =>
      Math.fround(Math.fround(count * Math.fround(1 / NTSC_HBLANK_SCALE)) + Math.fround(0.016666668)) < Math.fround(1 / 30);
    expect(waits(262)).toBe(true);
    expect(waits(263)).toBe(false);
  });
});

describe('the acceptance: 600 ticks, and the 0.5 s MENUFADER reaches 0.99 at 0.5 s', () => {
  const sets = [{ name: 'test.rdr', anims: [fadeAnim(0, 0.99, 1.98, 0.5)] }];

  it('at the reading\'s 29.97 Hz: on tick 15 (0.5005 s), not before, and held to tick 600', () => {
    const seen = fadeOnClock(sets, 'fade', 600);
    expect(seen.length).toBe(600);
    expect(reached(seen)).toBe(15);
    expect(seen[13]).toBeCloseTo(1.98 * 14 * UI_TICK_SECONDS, 5);   // 0.9249: the rate x dt steps, not yet the snap
    expect(seen.slice(14).every((o) => o === F32_099)).toBe(true);
  });

  it('at the block\'s 60 Hz (the brief\'s "tick 30"): on tick 30, not before, and held to tick 600', () => {
    const seen = fadeOnClock(sets, 'fade', 600, BLOCK_60);
    expect(seen.length).toBe(600);
    expect(reached(seen) === 30 || (seen[29]! >= 0.99 - 1e-5 && reached(seen) === 31)).toBe(true);
    expect(seen[29]).toBeCloseTo(0.99, 5);
    expect(seen[28]).toBeLessThan(0.98);
    expect(seen.slice(30).every((o) => o === F32_099)).toBe(true);
  });
});

describe('UiClock: the fixed tick from a now() passed in', () => {
  it('ticks at the rate whatever the display: 600 ticks from 60 Hz, 144 Hz and 30 Hz frames, every dt the tick\'s', () => {
    for (const period of [RAF_60, 1000 / 144, 1000 / 30]) {
      const clock = new UiClock();
      const ticks: number[] = [], dts = new Set<number>();
      clock.advance(5000);
      let f = 0;
      while (clock.ticks < 600 && f < 6000) clock.advance(5000 + ++f * period, (t, dt) => { ticks.push(t); dts.add(dt); });
      expect(ticks).toEqual(Array.from({ length: 600 }, (_, i) => i + 1));
      expect([...dts]).toEqual([UI_TICK_SECONDS]);
      expect(f * period / 1000).toBeCloseTo(600 / 29.97, 1);      // 20.02 s of now() for 600 ticks
    }
  });

  it('the first advance anchors and runs nothing', () => {
    const clock = new UiClock();
    expect(clock.advance(123456)).toBe(0);
    expect(clock.ticks).toBe(0);
    expect(clock.alpha).toBe(0);
  });

  it('gives the interpolation fraction: the part of a tick the accumulator holds, in [0, 1)', () => {
    const clock = new UiClock();
    clock.advance(0);
    expect(clock.advance(50)).toBe(1);                            // 0.05 s x 29.97 = 1.4985 ticks
    expect(clock.alpha).toBeCloseTo(0.4985, 9);
    expect(clock.advance(60)).toBe(0);                            // + 0.2997
    expect(clock.alpha).toBeCloseTo(0.7982, 9);
    expect(clock.advance(70)).toBe(1);
    expect(clock.alpha).toBeGreaterThanOrEqual(0);
    expect(clock.alpha).toBeLessThan(1);
  });

  it('counts a tick due exactly on a boundary (a 60 Hz clock on 60 Hz frames: one tick a frame, none skipped or doubled)', () => {
    const clock = new UiClock({ rate: BLOCK_60 });
    clock.advance(0);
    const perFrame: number[] = [];
    for (let f = 1; f <= 600; f++) perFrame.push(clock.advance(f * RAF_60));
    expect(perFrame.every((n) => n === 1)).toBe(true);
  });

  it('a very late frame: the catch-up is capped at CATCHUP_LIMIT_READING (0.05 s, the shell\'s step clamp) and the rest is lost', () => {
    expect(DROPPED_FRAME_READING).toBe('fixed-ticks');
    expect(CATCHUP_LIMIT_READING).toBe(SHELL_STEP_CLAMP_SECONDS);
    const clock = new UiClock();
    clock.advance(0);
    const n = clock.advance(1000);                                // a 1 s stall
    expect(n).toBe(1);                                            // 0.05 s = 1.4985 ticks
    expect(clock.lostSeconds).toBeCloseTo(0.95, 9);
    // At most two ticks for any one advance, whatever the gap: 0.05 s plus a carry under one tick is under 2.5 ticks.
    let max = 0;
    for (let k = 1; k <= 200; k++) max = Math.max(max, clock.advance(1000 + k * 997));
    expect(max).toBe(2);
  });

  it('the hidden tab (HIDDEN_TAB_READING freeze): no ticks while hidden, no burst on return, the carry kept', () => {
    expect(HIDDEN_TAB_READING).toBe('freeze');
    const clock = new UiClock();
    clock.advance(0);
    clock.advance(50);
    const alpha = clock.alpha, before = clock.ticks;
    clock.setHidden(true, 50);
    for (let t = 1050; t <= 10_050; t += 1000) expect(clock.advance(t)).toBe(0);   // a hidden tab's 1 Hz timer
    expect(clock.hidden).toBe(true);
    clock.setHidden(false, 60_000);
    expect(clock.ticks).toBe(before);
    expect(clock.alpha).toBe(alpha);
    expect(clock.advance(60_000 + RAF_60)).toBe(0);               // 0.4985 + 0.4995 < 1
    expect(clock.advance(60_000 + 2 * RAF_60)).toBe(1);
    expect(clock.lostSeconds).toBe(0);                            // hidden time is not "lost": it never ran
  });

  it('a now() that goes backwards runs nothing and keeps the latest anchor: no time is counted twice', () => {
    // rAF timestamps and performance.now() share one origin, so mixing them only jitters: 0, 10, 5, 20 is 20 ms, not 25.
    const mixed = new UiClock(), straight = new UiClock();
    mixed.advance(0); straight.advance(0);
    mixed.advance(10); straight.advance(10);
    const alpha = mixed.alpha;
    expect(mixed.advance(5)).toBe(0);
    expect(mixed.alpha).toBe(alpha);                              // the carry is unchanged by the backwards step
    mixed.advance(20); straight.advance(20);
    expect(mixed.alpha).toBe(straight.alpha);
    expect(mixed.ticks).toBe(straight.ticks);
    // A long backwards jump does not re-anchor lower: nothing runs until now() passes the latest anchor again.
    const clock = new UiClock();
    clock.advance(1000);
    expect(clock.advance(900)).toBe(0);
    expect(clock.advance(950)).toBe(0);
    expect(clock.alpha).toBe(0);
    expect(clock.advance(1050)).toBe(1);                          // 0.05 s past 1000
    // A caller that changes time origin re-anchors explicitly through setHidden (its visibility unchanged).
    clock.setHidden(clock.hidden, 10);
    expect(clock.advance(60)).toBe(1);
  });

  it('a non-finite now() (NaN from an undefined timestamp; Infinity) runs nothing and re-anchors: the clock keeps ticking', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const clock = new UiClock();
      clock.advance(0);
      expect(clock.advance(bad)).toBe(0);
      expect(clock.alpha).toBe(0);
      expect(clock.lostSeconds).toBe(0);
      expect(clock.advance(100)).toBe(0);                           // the next finite now() anchors
      expect(clock.advance(150)).toBe(1);                           // 0.05 s = 1.4985 ticks
      expect(clock.alpha).toBeCloseTo(0.4985, 9);
      expect(clock.lostSeconds).toBe(0);
    }
    const shown = new UiClock();
    shown.advance(0);
    shown.setHidden(false, Number.NaN);                             // a garbage timestamp on visibilitychange
    expect(shown.advance(100)).toBe(0);
    expect(shown.advance(150)).toBe(1);
    expect(shown.alpha).toBeCloseTo(0.4985, 9);
  });

  it('is deterministic: the same now() sequence gives the same ticks and fractions', () => {
    const run = (): string[] => {
      let seed = 7;
      const jitter = (): number => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return (seed % 2001) / 100 - 10; };
      const clock = new UiClock();
      const log: string[] = [];
      let now = 0;
      clock.advance(now);
      for (let f = 0; f < 3000; f++) {
        now += RAF_60 + jitter() + (f % 500 === 499 ? 400 : 0);    // +-10 ms, a 400 ms stall every 500 frames
        if (f === 1200) clock.setHidden(true, now);
        if (f === 1500) clock.setHidden(false, now);
        const n = clock.advance(now);
        log.push(`${n}:${clock.ticks}:${clock.alpha}`);
      }
      return log;
    };
    expect(run()).toEqual(run());
  });

  it('frameSync (STATE_CHANGE_FRAME_SYNC_READING, FUN_003b05e0 D:L304875-304886) counts a frame and moves no tick', () => {
    const clock = new UiClock();
    clock.advance(0);
    clock.advance(100);
    const ticks = clock.ticks, alpha = clock.alpha;
    clock.frameSync();
    expect(clock.frames).toBe(ticks + 1);                         // the counter both bump (D:L304765, D:L304882)
    expect(clock.ticks).toBe(ticks);
    expect(clock.alpha).toBe(alpha);
  });
});

describe('movie pacing against the UI tick (research 121 §9)', () => {
  const STEP_30 = 3000, STEP_2997 = 3003;                         // PTS steps of 90 kHz (research 98 §7.3, 121 §9)

  it('MOVIE_PACE_READING: one picture a tick, the PTS unread (R121.9): SONY448\'s 310 pictures last 10.34 s against their 10.33', () => {
    expect(MOVIE_PACE_READING).toBe('one-per-tick');
    expect(PTS_CLOCK_HZ).toBe(90000);
    for (let n = 0; n < 600; n++) expect(pictureForTick(n, { pace: 'one-per-tick', tickRate: UI_TICK_RATE, ptsStep: STEP_30 })).toBe(n);
    const shown = 310 * UI_TICK_SECONDS, pts = ptsSeconds(310, STEP_30);
    expect(shown).toBeCloseTo(10.34, 2);
    expect(pts).toBeCloseTo(10.333, 3);
    expect(shown / pts).toBeCloseTo(1.001, 4);                    // 0.1 % slower than its PTS
  });

  it('PTS pacing on the UI tick, for contrast: 29.97 fps pictures one a tick for 600 ticks; 30 fps pictures skip one in about 1000', () => {
    const pics = (step: number, rate: Rate, n: number): number[] =>
      Array.from({ length: n }, (_, t) => pictureForTick(t, { pace: 'pts', tickRate: rate, ptsStep: step }));
    expect(pics(STEP_2997, UI_TICK_RATE, 600)).toEqual(Array.from({ length: 600 }, (_, t) => t));
    const p30 = pics(STEP_30, UI_TICK_RATE, 2000);
    expect(p30[998]).toBe(998);                                   // floor(t x 1000 / 999): 998.999
    expect(p30[999]).toBe(1000);                                  // 1000 exactly: picture 999 is never shown
  });

  it('PTS pacing on a 60 Hz or 59.94 tick: 30 fps on 60 and 29.97 on 59.94 hold each picture two ticks; 30 on 59.94 shows 1001 in 2000', () => {
    const pics = (step: number, rate: Rate, n: number): number[] =>
      Array.from({ length: n }, (_, t) => pictureForTick(t, { pace: 'pts', tickRate: rate, ptsStep: step }));
    const halves = Array.from({ length: 600 }, (_, t) => Math.floor(t / 2));
    expect(pics(STEP_30, BLOCK_60, 600)).toEqual(halves);
    expect(pics(STEP_2997, FIELD_RATE, 600)).toEqual(halves);
    expect(new Set(pics(STEP_30, FIELD_RATE, 2000)).size).toBe(1001);
    expect(new Set(pics(STEP_2997, BLOCK_60, 2000)).size).toBe(999);   // 29.97 on 60: a picture held three ticks in ~500
  });

  it('MoviePacer hands a tick its picture, or null to hold the last (R121 §2 rows 5-6: picture 0 on the first tick)', () => {
    const one = new MoviePacer({ pace: MOVIE_PACE_READING, tickRate: UI_TICK_RATE, ptsStep: STEP_30, pictures: 3 });
    expect([one.tick(), one.tick(), one.tick(), one.tick(), one.tick()]).toEqual([0, 1, 2, null, null]);
    expect(one.ended).toBe(true);
    const pts = new MoviePacer({ pace: 'pts', tickRate: BLOCK_60, ptsStep: STEP_30 });
    expect(Array.from({ length: 6 }, () => pts.tick())).toEqual([0, null, 1, null, 2, null]);
    pts.restart();
    expect(pts.tick()).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The dev disc (W6.R8): the fade's own numbers and the disc's animation on the clock. Skips when the archive is absent.

// The desktop checkout (SOCOM_PC_ROOT) holds game/disc; the repository's root no longer does (the restructure).
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const UIZANIM = DISC ? join(DISC, 'RUN', 'UIZANIM.ZAR') : '';

describe.skipIf(!existsSync(UIZANIM))('the disc\'s 0.5 s MENUFADER on the clock (RUN/UIZANIM.ZAR; SOCOM_DISC)', () => {
  const sets = (): ZAnimRtSet[] => parseAnimSets(Zar.parse(new Uint8Array(readFileSync(UIZANIM)))).sets;

  it('14 OBJECT_OPACITY_FROM_TO on MENUFADER from 0 to 0.99 at 1.98 a second for 0.5 s; dlgMenu.rdr UiAttractMode one of them', () => {
    const found: string[] = [];
    for (const s of sets()) for (const a of s.anims) for (const q of a.sequences) for (const c of q.commands) {
      if (c.set !== 0 || c.cmd !== 25) continue;
      const v = new DataView(c.bytes.buffer, c.bytes.byteOffset, c.bytes.byteLength);
      if (a.nodeRefs[v.getUint16(4, true)]?.name !== 'MENUFADER') continue;
      if (v.getFloat32(8, true) === 0 && v.getFloat32(0xc, true) === F32_099 && v.getFloat32(0x10, true) === Math.fround(1.98)
        && v.getFloat32(0x14, true) === 0.5) found.push(`${s.name}/${a.name}`);
    }
    expect(found.length).toBe(14);
    expect(found).toContain('dlgMenu.rdr/UiAttractMode');
  });

  // Its two sequences each open on `IF` NODE_ACTIVE POPUP OR NODE_ACTIVE SavedGames (condition tokens 7, 43, 7): with
  // both nodes hidden -- no popup, no saved-games list -- the second sequence fades MENUFADER (the first, the Roller).
  const HIDDEN = ['POPUP', 'SavedGames'];

  it('dlgMenu.rdr UiAttractMode, run on the clock (no popup, no list; a host answering true): MENUFADER at 0.99 on tick 15; at 60 Hz on tick 30', () => {
    const menu = sets().filter((s) => s.name === 'dlgMenu.rdr');
    expect(menu.length).toBe(1);
    const seen = fadeOnClock(menu, 'UiAttractMode', 600, undefined, HIDDEN);
    expect(seen.length).toBe(600);
    expect(reached(seen)).toBe(15);
    const at60 = fadeOnClock(menu, 'UiAttractMode', 600, BLOCK_60, HIDDEN);
    expect(at60[29]).toBeCloseTo(0.99, 5);
    expect(at60[28]).toBeLessThan(0.98);
  });
});
