import { describe, expect, it } from 'vitest';
import { GAME_FRAME_DT, type WeaponRecord } from '@s2u/scene';
import { fireFrames, fireInterval, roundsPerPull } from '../../viewer/src/accuracy';
import { TICK_HZ } from '../../viewer/src/sim';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireCycleTicks, fireScheduleTicks } from '../../viewer/src/net/fireGate';
import { afterShotLock } from '../../viewer/src/firearms';
import type { AimFrame } from '../../viewer/src/net/shotCone';
import { ROOM_RAISE_TRUST_ADAPTATION, START_REACH_PLACEHOLDER } from '../src/room';
import { burst, fastest, forger, launchAfter, M4A1, RECORDS, type Around } from './helpers/fireCadence';

const AK47 = Object.values(RECORDS).find((r) => r.name === 'AK-47')!;

/**
 * LATER 326 (#455, game 195): a page's held automatic burst at its own frame rate, through the viewer's own kit (`Fire`:
 * its timer and its rounds' `ago`) and its own command naming (`roundSeq`), judged by the room. The kit's timer is the
 * console's -- set at a round, run down a game frame at a time, clamped at 0 (`FUN_005be9a0` D:L475488,
 * `FUN_005c0fd0` D:L476644-476646) -- so a round is the rate rounded up to whole game frames after the last, named at its
 * browser frame's last command as before, and the room (its cycle the rate less a tick) refuses none at a steady rate. Was: the leftover carried at 30 fps, rounds up to
 * a frame early, refused 'rate', the room's cone left behind and the rest refused 'cone'.
 *
 * The flat floor and the seat as `roomRifleJitterBloom.test.ts` stages them (copied, not imported); one ordered socket
 * with no delay -- the commands of a page frame in one batch, its rounds after it -- the room stepping a tick at a time.
 */

/**
 * LATER 587's second fold, the review's F3 (the stated cost): the page's kit holds a round the room's gate would refuse
 * (`../../viewer/src/fire` `ROOM_GATE_MIRROR_ADAPTATION`), so on uneven page frames it fires fewer rounds than the
 * original. The worst measured is the Model 18 single pressed every frame on 20-40 ms frames: 3.7% by the review's probe
 * (its rate, first round to last), 5.0% by the count these tests take (57 rounds in 4 s against the original's 60, seed
 * 777). The tests below hold every weapon to at least the original's count less this bound -- the stated F3 cost.
 */
const F3_COST = 0.05;

/**
 * The original's rounds over the same trigger (a transcription, apart from the port's kit): a game frame every
 * `GAME_FRAME_DT` reads the trigger as the page frame holding that moment has it, through the pad layer (LATER 1147,
 * research 443 §1: `FUN_002d9ff0` D:L179137-179168, down 0 -> 1, 3 -> 1, 1 -> 2; up 1|2 -> 3, 3 -> 0) and its "held"
 * query, state 2 only (`FUN_002c60c0` D:L166671-166686); a read not held clears the pull's count -- ctrl+0x118, stepped
 * from the held answer alone, reads 0 or 3 whenever it is false (`FUN_00594cf0` D:L453543-453565; the review F1), and 0
 * or 3 clears it (`FUN_005c0ae0` D:L476380-476382, D:L476399-476400); the gate fires while the trigger reads held, the timer is 0 and the count is under
 * the pull's rounds (D:L476439-476448), setting the timer to the wait (`FUN_005be9a0` D:L475517); then the timer runs down
 * a frame and clamps at 0 (`FUN_005c0fd0` D:L476643-476647), in float32. Rounds within the run's length less `tail`
 * seconds. Was (before LATER 1147): the round on the first down read, the count started by down after up.
 *
 * `lock` (the review F2): a bolt's or a pump's after-shot lock, in seconds -- the port's own source of it, `afterShotLock`
 * (`../../viewer/src/firearms`: the fired record's `ReloadDelayAfterShot`, else 0.01, when it is a `ReloadAfterShot` one;
 * `FUN_005c5340` D:L479321-479343), as `lockFrames` counts it: set at a round, the kit's `+0x820` holds the frames after
 * it -- run down a game frame at a time in float32, ended on the frame it goes below 0, that frame included
 * (`FUN_005c0fd0` D:L476550-476560) -- and those frames run no fire tick (D:L476549-476563): the pad is still stepped
 * (the controller's, before the kit), but no count is cleared, no round leaves and the fire timer is not run down.
 */
/**
 * LATER 1147: the first kit read after the burst starts -- the helper's kit runs 6 s of page frames before it
 * (`./helpers/fireCadence` `burst`), its clock continuous, so its reads fall `ceil(6 / frame) x frame - 6` s into the burst
 * and a frame apart. The original's reads are taken at the same phase, so the two counts read the same page frames.
 */
const KIT_LEAD = Math.ceil(6 / GAME_FRAME_DT) * GAME_FRAME_DT - 6;

/**
 * LATER 1147: the trigger as the console's fastest re-press reads it -- down two game frames, up one (research 443 §1: the
 * round on the second down read, a 3 clearing the count) -- on each page frame, by the game frame its start lies in on the
 * kit's clock (`KIT_LEAD`). Was (LATER 587): pressed and let go before each page frame's kit ran, which the console never
 * reads (no read sees it down) and the page now fires nothing on.
 */
const tapsOfThree = (frames: readonly number[]): boolean[] => {
  let t = 0;
  return frames.map((d) => { const k = Math.floor((t + GAME_FRAME_DT - KIT_LEAD) / GAME_FRAME_DT + 1e-9); t += Math.min(d, 0.1); return k % 3 !== 2; });
};

function originalRounds(frames: readonly number[], held: (i: number) => boolean, wait: number, perPull: number, tail: number, lock: number | null = null): number {
  const f = Math.fround, dt = f(GAME_FRAME_DT);
  const total = frames.reduce((a, b) => a + Math.min(b, 0.1), 0);   // the page's clamp, as the helper's `run`
  let i = 0, end = Math.min(frames[0]!, 0.1), timer = 0, count = 0, pad = 0, rounds = 0, left = -1;
  for (let k = 0; KIT_LEAD + k * GAME_FRAME_DT < total - tail; k++) {
    const t = KIT_LEAD + k * GAME_FRAME_DT;
    while (t >= end - 1e-12 && i < frames.length - 1) { i++; end += Math.min(frames[i]!, 0.1); }
    const down = held(i);
    pad = down ? (pad === 1 || pad === 2 ? 2 : 1) : (pad === 1 || pad === 2 ? 3 : 0);
    if (left >= 0) { left = f(left - dt); if (left < 0) left = -1; continue; }   // the lock's frame: no fire tick
    if (pad !== 2) count = 0;
    if (pad === 2 && timer <= 0 && count < perPull) { rounds++; count++; timer = f(wait); if (lock !== null) left = f(lock); }
    timer = Math.max(0, f(timer - dt));
  }
  return rounds;
}

/**
 * LATER 330 (reading, pending review): the game frames a bolt's or a pump's lock holds the kit after each round -- the
 * kit's timer `+0x820`, set to the fired record's `ReloadDelayAfterShot` (else the default 0.01 s) when it is a
 * `ReloadAfterShot` one (`FUN_005c5340` D:L479321-479343), run down a game frame at a time in float32 and ended on the
 * frame it goes below 0 (`FUN_005c0fd0` D:L476550-476560); its frames run no fire tick (D:L476549-476563), so the fire
 * timer's frames come after them (D:L476643-476647). A transcription, apart from the port's kit.
 */
function lockFrames(rec: WeaponRecord): number {
  if (!rec.reloadAfterShot) return 0;
  const f = Math.fround, dt = f(GAME_FRAME_DT);
  let left = f(rec.reloadDelayAfterShot ?? 0.01), n = 0;
  do { left = f(left - dt); n++; } while (!(left < 0));
  return n;
}

/** The review F2: the after-shot lock's seconds after a round of `rec` (the port's `afterShotLock`, a magazine not run out), or null. */
const lockOf = (rec: WeaponRecord): number | null => afterShotLock(rec.id, rec, 1, rec.id);

/** Rounds named on the same command as the round before them: two of one long page frame (LATER 338). */
const shared = (named: number[]): number => named.filter((s, i) => i > 0 && named[i - 1] === s).length;

describe("LATER 326 (#455): a page's held burst at its own frame rate -- its kit's timer the console's, each round at its frame's last command -- refused by the room only where two share a command, as before", () => {
  it.each([30, 60, 144, 20])('%s fps: every round of a 2 s M4A1 burst fired; the commands they name at least the cycle apart', (fps) => {
    const { tally, named, cycle } = burst(M4A1, fps, 2);
    expect(tally, `${fps} fps`).toEqual({ fired: named.length });
    for (let i = 1; i < named.length; i++) expect(named[i]! - named[i - 1]!, `round ${i}`).toBeGreaterThanOrEqual(cycle);
  });

  it.each([20, 30, 60, 144])("%s fps, a 30 s held burst: every round fired (the room's rate clock, LATER 326, over that long)", (fps) => {
    const { tally, named } = burst(M4A1, fps, 30);
    expect(named.length).toBeGreaterThan(150);
    expect(tally, `${fps} fps`).toEqual({ fired: named.length });
  });

  it("10 fps (a rate of 2 game frames leaves two rounds in one page frame): each named at its own game frame's command (LATER 338) -- none share one, every round fired", () => {
    const { tally, named } = burst({ ...M4A1, fireWait: 0.05 } as WeaponRecord, 10, 2);
    expect(named.length).toBeGreaterThan(20);
    expect(shared(named), 'no two rounds on one command').toBe(0);
    expect(tally).toEqual({ fired: named.length });
  });

  it.each([20, 30])("%s fps, a page turning 1.5 degrees a command through a 30 s burst, each round's claim its own command's camera (LATER 338): every round fired, none 'cone'", (fps) => {
    const first = burst(M4A1, fps, 30, undefined, { turn: 1.5 });
    const { tally, named } = burst(M4A1, fps, 30, undefined, { turn: 1.5, looks: first.seen });
    expect(named.length).toBeGreaterThan(150);
    expect(tally['fire: cone'] ?? 0, `${fps} fps: ${JSON.stringify(tally)}`).toBe(0);
    expect(tally, `${fps} fps`).toEqual({ fired: named.length });
  });

  it.each([30, 60, 120, 144, 240])("%s fps, 40 bursts of 0.4 s after the kit has run (the review's F1 probe): no burst's second round refused -- the press starts the kit's game frame", (fps) => {
    for (const rec of [M4A1, AK47]) {
      const { tally, named } = burst(rec, fps, 0.4, undefined, { presses: 40, gap: 0.3 });
      expect(named.length, rec.name).toBeGreaterThanOrEqual(80);
      expect(tally, `${rec.name} at ${fps} fps`).toEqual({ fired: named.length });
    }
  });

  it.each([20, 30, 60, 144])("%s fps, claims at 0.95 of the page's own cone's corner (its bloom, `Accuracy`): a 30 s burst and 40 short ones, none refused -- no 'cone' cascade (the review's F3)", (fps) => {
    const long = burst(M4A1, fps, 30, undefined, { corner: true });
    expect(long.tally, `${fps} fps, 30 s`).toEqual({ fired: long.named.length });
    // LATER 347: at 144 fps 0.4 s is 58 frames (0.4028 s), past the M4A1's fifth round at 0.4004 s, where the other rates
    // fire four -- clean since the press's round goes at a command carrying its press (was: skipped here, refused 'cone').
    const short = burst(M4A1, fps, 0.4, undefined, { corner: true, presses: 40, gap: 0.3 });
    expect(short.tally, `${fps} fps, 40 x 0.4 s`).toEqual({ fired: short.named.length });
  });

  it("a forger naming a round every cycle's commands (the rate less a tick, the gap the gate passes), sustained 4 s: no more fired than the record's rate allows", () => {
    // The average the room's own clock holds (SVC-23b, `fireClock`, advancing by the rate: LATER 326): over 4 s at most
    // 4 / I + 2 rounds fired, whatever the gaps the commands name; the rest refused 'rate' (bloomed at most once a cycle).
    const I = fastest(M4A1);
    const { fired, sent } = forger(M4A1, Math.ceil(I * TICK_HZ - 1 - 1e-9), 4);
    expect(sent).toBeGreaterThan(Math.floor(4 / I) + 2);                // the forger asks for more than the rate
    expect(fired, `${fired} of ${sent} fired`).toBeLessThanOrEqual(Math.floor(4 / I) + 2);
  });

  // LATER 336: the line's best offset (`Player.lagFloor`, as `eventClock` dates a round) stepping between two rounds. The
  // seat's offset moved as the room's catch-up of a long frame's commands moves it (a step down, measured +1 to -4 ticks
  // at a 250 ms hitch); the schedule (`fireClock`) kept in the offset the round is dated with.
  type Floor = { lagFloor: { cur: number; prev: number } };
  const stepFloor = (by: number) => (seat: unknown): void => {
    const f = (seat as Floor).lagFloor, at = Math.min(f.cur, f.prev);
    f.cur = at + by; f.prev = at + by;
  };
  const rateTicks = fastest(M4A1) * TICK_HZ;
  const honest = Array.from({ length: 12 }, (_, k) => Math.ceil(k * rateTicks - 1e-9));   // round k at its rate's command

  it("LATER 336: a steady page firing at the record's rate, its line's best offset stepping down 4 ticks before any one round: every round fired", () => {
    expect(forger(M4A1, 0, 2, { at: honest }), 'no step').toEqual({ fired: honest.length, sent: honest.length });
    for (let j = 1; j < honest.length; j++) {
      const step = stepFloor(-4);
      const got = forger(M4A1, 0, 2, { at: honest, around: (call, seat) => { if (call === j) step(seat); } });
      expect(got, `the step before round ${j}`).toEqual({ fired: honest.length, sent: honest.length });
    }
  });

  it("LATER 336: a forger naming a round every cycle's commands, its line slowing 4 ticks every 2 s (the offset stepping up): no more fired than the steady line's, nor than the record's rate allows", () => {
    const I = fastest(M4A1), gap = Math.ceil(I * TICK_HZ - 1 - 1e-9);
    const steady = forger(M4A1, gap, 8);
    const slowing = forger(M4A1, gap, 8, { delay: (t) => (t < 360 ? 0 : 4 * (1 + Math.floor((t - 360) / 120))) });
    expect(slowing.sent).toBe(steady.sent);
    expect(slowing.fired, `${slowing.fired} of ${slowing.sent}, steady ${steady.fired}`).toBeLessThanOrEqual(steady.fired);
    expect(slowing.fired).toBeLessThanOrEqual(Math.floor(8 / I) + 2);
  });

  it("a 250 ms hitch mid-burst (the page clamps it to 0.1 s): each round at its own game frame's command, none sharing one (LATER 338); none refused -- the round dated across the line's best offset's step is fired (LATER 336), none 'cone'", () => {
    const frames = [...Array(30).fill(1 / 60), 0.25, ...Array(60).fill(1 / 60)];
    const { tally, named, rows } = burst(M4A1, 60, 0, frames);
    expect(shared(named), rows.join(' ')).toBe(0);
    // LATER 338: the rounds keep the kit's spacing through the hitch -- no gap under the rate's whole commands.
    for (let i = 1; i < named.length; i++) expect(named[i]! - named[i - 1]!, rows.join(' ')).toBeGreaterThanOrEqual(Math.floor(fastest(M4A1) * TICK_HZ));
    // LATER 336: the round dated across the line's best offset's step is judged against a schedule kept in the same offset
    // (was: refused 'rate' on the room's clock, the schedule laid under the offset before the step).
    expect(tally['fire: cone'] ?? 0, rows.join(' ')).toBe(0);
    expect(tally['fire: rate'] ?? 0, rows.join(' ')).toBe(0);
    expect(tally.fired ?? 0, rows.join(' ')).toBe(named.length);
  });

  // LATER 336, the fresh review of ef03a719bf (F1-F4): the schedule's shift follows what the dating did -- its own rise in
  // full, a fall only within the credit the dating itself is bounded by (`FIRE_STALL_CREDIT_TICKS`) -- so the stated cost
  // of a lag switch (`room.ts` FIRE_STALL_CREDIT_TICKS: at most (21 + 3 + 1) / rate + 1 rounds in one tick, a lock at most 24
  // ticks early) holds. Each run counts the rounds the room fired per tick of its own clock.
  const perTick = (): { at: (tick: number) => void; most: () => number } => {
    const n = new Map<number, number>();
    return { at: (tick) => { n.set(tick, (n.get(tick) ?? 0) + 1); }, most: () => Math.max(0, ...n.values()) };
  };
  const tickBound = Math.floor((21 + 4) / rateTicks) + 1;          // 5 for the M4A1 (the cycle the rate less a tick: `keepSchedule`)
  type Lock = { reloadUntil: [number, number]; lockStart: [number, number] };

  it("LATER 336 (review F1): a forger 60 ticks behind delivering its held commands at once (the offset stepping down 60): at most (21 + 3 + 1) / rate + 1 rounds in any one tick", () => {
    const ticks = perTick();
    const got = forger(M4A1, 6, 8, { delay: (t) => (t < 660 ? 60 : 0), onFired: ticks.at });
    expect(got.fired).toBeGreaterThan(0);
    expect(ticks.most(), `${got.fired} of ${got.sent}`).toBeLessThanOrEqual(tickBound);
  });

  it("LATER 336 (review F1, the lock): a reload laid while 60 behind, its held commands delivered before its end: no round fired more than 24 ticks before the lock's end on the room's clock", () => {
    let L = 0;
    forger(M4A1, 0, 1, { at: [], reloads: [10], onReload: (_tick, seat) => { const s = seat as Lock; L = s.reloadUntil[0] - s.lockStart[0]; } });
    expect(L).toBeGreaterThan(30);
    const deliver = Math.max(300, L + 60), r = deliver - 20 - L;   // the lock's last commands delivered 20 before their tick
    let laid = -1, end = -1;
    const after: number[] = [];
    forger(M4A1, 6, Math.ceil((deliver + 120) / TICK_HZ), {
      delay: (t) => (t < 360 + deliver ? 60 : 0), reloads: [r],
      onReload: (tick, seat) => { const s = seat as Lock; if (laid < 0 && s.lockStart[0] >= 0) { laid = tick; end = tick + s.reloadUntil[0] - s.lockStart[0]; } },
      onFired: (tick) => { if (laid >= 0 && tick > laid) after.push(tick); },
    });
    expect(laid).toBeGreaterThan(0);
    expect(after.length).toBeGreaterThan(0);
    expect(after[0]!, `laid ${laid}, ends ${end}`).toBeGreaterThanOrEqual(end - 24);
  });

  it("LATER 336 (review F2): an honest chain whose line falls 54 ticks behind for good (over the 21-tick credit): no more refused than before LATER 336, through the offset's rise when the old best leaves the window", () => {
    const chain = Array.from({ length: Math.floor(8 / fastest(M4A1)) }, (_, k) => Math.ceil(k * rateTicks - 1e-9));
    let last = -1;
    const refused: number[] = [];
    const got = forger(M4A1, 0, 8, {
      at: chain, delay: (t) => (t < 390 ? 0 : 54),
      around: (call) => { if (last >= 0) refused.push(chain[last]!); last = call; }, onFired: () => { last = -1; },
    });
    if (last >= 0) refused.push(chain[last]!);
    // Measured at f6a3e33d78 (before LATER 336, the schedule never shifted): 72 of 83 fired, one refused while the old best
    // left the window (the round at command 219 of the burst; the line fell at 30, so the rise lands from 180 to 330).
    // ef03a719bf (the raw offset's step, 54 against the dating's 21) refused seven there (185 to 214, 288).
    expect(got.sent).toBe(chain.length);
    expect(got.fired, `${got.fired} of ${got.sent}; refused ${refused.join(' ')}`).toBeGreaterThanOrEqual(72);
    expect(refused.filter((c) => c >= 150 && c <= 330).length, `refused ${refused.join(' ')}`).toBeLessThanOrEqual(1);
  });

  it("LATER 336 (review F3): a forger's line falling 60 behind for 6 s (the offset stepping up, its dating clamped then risen) and then delivering at once (down): at most (21 + 3 + 1) / rate + 1 rounds in one tick, and no more over the run than the steady line's", () => {
    const steady = forger(M4A1, 6, 10);
    const ticks = perTick();
    const got = forger(M4A1, 6, 10, { delay: (t) => (t < 400 ? 0 : t < 760 ? 60 : 0), onFired: ticks.at });
    expect(got.sent).toBe(steady.sent);
    expect(ticks.most(), `${got.fired} of ${got.sent}`).toBeLessThanOrEqual(tickBound);
    expect(got.fired).toBeLessThanOrEqual(steady.fired);
  });

  it("LATER 336 (review F4): a reload laid after its line's best offset stepped up 10 (a slower line, the old best left the window): the honest rounds from the lock's end all fired -- the lock laid in the offset it is dated with", () => {
    let L = 0;
    forger(M4A1, 0, 1, { at: [], reloads: [10], onReload: (_tick, seat) => { const s = seat as Lock; L = s.reloadUntil[0] - s.lockStart[0]; } });
    expect(L).toBeGreaterThan(30);
    const r = 330, from = r + L;                                  // the line 10 behind from tick 10 of the burst: rolled by 330
    const at = [0, 6, ...Array.from({ length: 6 }, (_, k) => from + Math.ceil(k * rateTicks - 1e-9))];
    const got = forger(M4A1, 0, Math.ceil((from + 60) / TICK_HZ), { at, reloads: [r], delay: (t) => (t < 370 ? 0 : 10) });
    expect(got, 'all fired').toEqual({ fired: at.length, sent: at.length });
  });

  // LATER 336's re-review (finding 1): the slack is the exact one (`Room.scheduleLaid`'s recurrence), so a lay at the clamp
  // (a stall of the line over FIRE_STALL_CREDIT_TICKS) no longer spends it for the life: it returns as fire pauses.
  it("LATER 336 (re-review finding 1): a 250 ms hitch a second after a 500 ms stall of the line, in the same life: the hitch refuses nothing -- the slack the stall's lay at the clamp took returns as fire pauses", () => {
    const frames = [...Array(30).fill(1 / 60), ...Array(30).fill(1 / 60), ...Array(60).fill(1 / 60), 0.25, ...Array(60).fill(1 / 60)];
    const hold = frames.map((_, i) => i >= 30 && i < 60);                // the line holds 500 ms of the page's frames
    const hitch = burst(M4A1, 60, 0, frames, { hold });
    const none = burst(M4A1, 60, 0, frames.map((d) => (d === 0.25 ? 1 / 60 : d)), { hold });
    // The stall's own refusal (its lateness over FIRE_STALL_CREDIT_TICKS + FIRE_ARRIVAL_JITTER_TICKS: the stated cost),
    // measured one; the hitch adds none. Was (the least over every lay since the spawn): the hitch's round refused 'rate'.
    expect(none.tally['fire: rate'] ?? 0, none.rows.join(' ')).toBeLessThanOrEqual(1);
    expect(hitch.tally['fire: rate'] ?? 0, hitch.rows.join(' ')).toBe(none.tally['fire: rate'] ?? 0);
    expect(Object.keys(hitch.tally).sort(), hitch.rows.join(' ')).toEqual(Object.keys(none.tally).sort());
    expect(hitch.tally.fired ?? 0, hitch.rows.join(' ')).toBe(hitch.named.length - (hitch.tally['fire: rate'] ?? 0));
  });

  // LATER 336's re-review (finding 5): FIRE_STALL_CREDIT_TICKS's window form, a delivery split over ticks. For rounds k..n
  // fired, (n - 1 - k) rate <= S_n - S_k + 24 - cycle (`Room.keepSchedule`), the cycle the rate less a tick: in any span of
  // W ticks between two rounds fired, at most floor((W + 21 + 4) / rate) + 1.
  it("LATER 336 (re-review finding 5): a forger 60 ticks behind delivering its held commands over three ticks (60 -> 40 -> 20 -> 0): in any W ticks at most (W + 21 + 4) / rate + 1 rounds", () => {
    for (const gap of [5, 6]) {
      const ticks: number[] = [];
      const got = forger(M4A1, gap, 8, { delay: (t) => (t < 660 ? 60 : t < 661 ? 40 : t < 662 ? 20 : 0), onFired: (tick) => { ticks.push(tick); } });
      expect(got.fired, `gap ${gap}`).toBeGreaterThan(0);
      const over: string[] = [];
      for (let i = 0; i < ticks.length; i++) for (let j = i; j < ticks.length; j++) {
        const W = ticks[j]! - ticks[i]!;
        if (j - i + 1 > Math.floor((W + 21 + 4) / rateTicks) + 1) over.push(`${j - i + 1} rounds over ticks ${ticks[i]}..${ticks[j]}`);
      }
      expect(over, `gap ${gap}: ${got.fired} of ${got.sent}`).toEqual([]);
    }
  });

  // LATER 336's delta review (finding 1): an after-shot lock is laid with its timer part alone and lengthened by its clip
  // when the timer runs out (`Room.afterShotPick`). Its slack must bind the lengthened lock: a lock whose slack was dropped
  // just before the pick (a fire near the timer's end) and then lengthened had none, and a fall of the line's offset then
  // moved it by `scheduleSlack`, up to its lead over the dating more -- at most FIRE_SCHEDULE_SLACK_ADAPTATION (2; 1.52
  // ticks for the M4A1, so one whole tick measured), the locking round fired inside the tolerance of the round before.
  /**
   * The case's run, `at` the commands that name a round (LOCK-END-RELIEF split it in two: since a lock refusal on the
   * room's clock alone goes through `refuseRound`, it sets the cadence's last round as an early round does, so a client
   * naming a round at EVERY command is refused 'rate' one tick inside the cycle from then on and lands none after the
   * lock -- fewer, never more; the bound below is unchanged and asserted over what lands).
   */
  const lengthenedLockRun = (at: number[]): { laid: number; L: number; after: number[] } => {
    type Seat = Lock & { records: WeaponRecord[]; lockKind: [string | null, string | null]; lockClock: [number, number] };
    // A staged record (the M4A1's rate, a 0.5 s after-shot timer, a 1 s clip by its `ReloadTime`) in the slot from the
    // locking round on: the rounds before it (an M4A1's) lay no lock, so the locking round can follow them by a cycle.
    const bolt = { ...M4A1, magazine: 1000, reloadAfterShot: true, reloadDelayAfterShot: 0.5, reloadTime: 1 } as WeaponRecord;
    const clips = { clips: [], table: new Map(), roots: new Map() } as unknown as NonNullable<Parameters<typeof forger>[3]>['clips'];
    // The line 5 behind from before the burst (its best offset there). Rounds 0 and 5 (an M4A1's, no lock) on that line, at
    // the schedule's least gaps (the chain runs 1.52 ahead of round 10's dating); round 10 (the locking one) 26 behind, 21
    // over the best: its lock's slack 0, its schedule's 1.52. A round named at every command from the timer's end less 6
    // on: those decided before the pick drop the lock's slack (its timer part within 3 of the room's clock), then the pick
    // lengthens it. At 430 the line on time (5 faster than its best: the dating's offset falling 5), the rounds after
    // dated at their own tick. Measured at 09f8ae1461: the first taken one tick before laid + L - 24.
    let laid = -1, start = -1, L = 0, seat: Seat | null = null;
    const after: number[] = [];
    const got = forger(M4A1, 0, 4, {
      at, clips, delay: (t) => (t < 374 ? 5 : t < 430 ? 26 : 0),
      around: (call, s) => {
        seat = s as Seat;
        seat.records[0] = call < 2 ? { ...M4A1, magazine: 1000 } as WeaponRecord : bolt;
        if (start >= 0 && seat.lockKind[0] === 'afterShot' && seat.lockStart[0] === start) L = seat.reloadUntil[0] - seat.lockStart[0];
      },
      onFired: (tick) => {
        if (laid < 0) { if (seat!.lockKind[0] === 'afterShot') { laid = tick; start = seat!.lockStart[0]; } return; }
        if (tick > laid) after.push(tick);
      },
    });
    expect(laid, `${got.fired} of ${got.sent}`).toBeGreaterThan(0);
    expect(L, 'the lock lengthened by its clip').toBeGreaterThan(Math.floor(0.5 * TICK_HZ) + 30);
    return { laid, L, after };
  };

  it("LATER 336 (delta finding 1): an after-shot lock lengthened by its clip after a fire at its timer's end (its slack dropped), then the line's offset falling: no round fired more than 24 ticks before the lengthened lock's end on the room's clock", () => {
    // A round named at every command from the timer's end less 6 on (the case as written for LATER 336): the bound holds
    // over every round taken after the lock (since LOCK-END-RELIEF none is: see `lengthenedLockRun`).
    const { laid, L, after } = lengthenedLockRun([0, 5, 10, ...Array.from({ length: 130 }, (_, k) => 34 + k)]);
    // The premise held, not only the bound (the glance's F1): a client naming a round at every command lands none after
    // the lock -- each one-tick-inside round refused 'rate' re-plants the cadence (fewer rounds, never more).
    expect(after, 'a round at every command lands none after the lock').toEqual([]);
    for (const t of after) expect(t, `laid ${laid}, the lengthened lock ${L} ticks: ends ${laid + L}`).toBeGreaterThanOrEqual(laid + L - 24);
  });

  it("LATER 336 (delta finding 1), at the weapon's own cadence (a round every 6 commands, over the M4A1's 5.76-tick rate): rounds land after the lengthened lock, none more than 24 ticks before its end on the room's clock", () => {
    const { laid, L, after } = lengthenedLockRun([0, 5, 10, ...Array.from({ length: 22 }, (_, k) => 34 + 6 * k)]);
    expect(after.length, 'rounds land after the lock (the bound is measured, not vacuous)').toBeGreaterThan(0);
    for (const t of after) expect(t, `laid ${laid}, the lengthened lock ${L} ticks: ends ${laid + L}`).toBeGreaterThanOrEqual(laid + L - 24);
  });
});

describe("LATER 347: repeated short bursts at the page's own cone corner -- the press's round named at a command carrying its press -- none refused", () => {
  // The row's cases (LATER 347, measured 2026-10-23 on LATER 326's branch): bursts of five rounds or more with 0.3 s releases.
  it.each([
    ['M4A1', 30, 0.42, 20], ['M4A1', 60, 0.42, 20], ['M4A1', 144, 0.42, 20],
    ['AK-47', 30, 0.42, 16], ['AK-47', 60, 0.42, 16], ['M4A1', 30, 0.7, 20], ['M4A1', 60, 0.7, 20],
  ] as const)('%s at %s fps, %s s bursts x %s, 0.3 s releases: every round fired', (name, fps, seconds, presses) => {
    const s = burst(name === 'AK-47' ? AK47 : M4A1, fps, seconds, undefined, { corner: true, presses, gap: 0.3 });
    expect(s.tally, `${name} ${fps} fps`).toEqual({ fired: s.named.length });
  });

  // LATER 1147 (research 443): was "the mechanism: the press's round named at the previous frame's command (the page before
  // LATER 347) puts the room's cone a round behind -- refused 'cone'" (more than 50). Every round now leaves at a kit step,
  // its press already read twice and its commands carrying the Trigger, so no round is named before its press's command
  // whatever the naming rule: the mechanism is gone.
  it("the mechanism gone: with every round at a kit step, naming a press's round at the previous frame's command changes nothing -- none refused", () => {
    const s = burst(M4A1, 60, 0.42, undefined, { corner: true, presses: 20, gap: 0.3, pressAtPrevious: true });
    expect(s.named.length).toBeGreaterThanOrEqual(60);
    expect(s.tally).toEqual({ fired: s.named.length });
  });
});

describe("LATER 587: a page's semi-automatic pressed every page frame, every weapon with a single mode, at 30, 60 and 144 fps -- the room takes every round", () => {
  // The page's kit fires a pressed round on the first page frame after its timer reads 0 at a game frame's step, the kit's
  // frame clock kept there (`Fire.pull`; the original: `FUN_005c0ae0` D:L476446-476448, `FUN_005c0fd0` D:L476643-476647):
  // round j on the first page frame at or after j x ceil(wait / frame) frames, a gap up to a page frame under those
  // frames. The room's cycle (`room.ts` `fire`: the fastest mode's wait x TICK_HZ, less a tick) must refuse none of them --
  // the weapons whose `FireWait` x 30 is whole with no faster mode (the F57, Mark 23, Mark 23SD, DE .50, M40A1, M82A1A)
  // the tightest. A weapon whose after-shot lock holds the kit (a bolt's, a pump's) fires its lock's frames slower
  // (`lockFrames`, LATER 330), every round still the room's.
  const SINGLE = Object.values(RECORDS).filter((r) => r.fireModes.includes(1));
  // LATER 1147 (research 443): pressed as fast as the console reads it -- down two game frames, up one (`tapsOfThree`) --
  // in single; the original's count the transcription's on the same taps (`originalRounds`, the bolt and pump guns' lock
  // in it: the review F2, was "the bolt guns aside"). Was: pressed and let go before each page frame's kit (`mash`), against round j at j x q.
  it.each([30, 60, 144])("%s fps: every single-mode weapon fires the original's rounds, the room refusing none", (fps) => {
    const off: string[] = [];
    let total = 0;
    for (const rec of SINGLE) {
      const q = (fireFrames(rec.fireWait, 1) + lockFrames(rec)) * GAME_FRAME_DT, seconds = Math.max(1.5, 5 * q);
      const frames = Array(Math.round(seconds * fps)).fill(1 / fps), held = tapsOfThree(frames);
      const { tally, named } = burst(rec, fps, 0, frames, { held, mode: 1 });
      total += named.length;
      const due = originalRounds(frames, (i) => held[i]!, fireInterval(rec.fireWait, 1), 1, 2 / fps, lockOf(rec));
      if (named.length < due || (tally.fired ?? 0) !== named.length) off.push(`${rec.name}: ${named.length} rounds of the original's ${due}, ${JSON.stringify(tally)}`);
    }
    expect(SINGLE.length).toBeGreaterThan(30);
    expect(total).toBeGreaterThan(SINGLE.length * 3);
    expect(off, `${fps} fps`).toEqual([]);
  });

  // The review's F1 (LATER 587): a page whose frames are uneven -- the kept clock's round can come up to a page frame after
  // its step, the next on time -- named at its press's command. Seeded frame lengths (ms), the room refusing none, and no
  // chain faster than the original: round j's command at least j x the original's frames' ticks after the first, less the
  // two ticks the naming may take (a press's round at the first command carrying it, LATER 347, up to a tick after its
  // moment; a step's at the tick at or before its own, LATER 338, up to a tick before). A shotgun's rays share a command.
  const frameLengths = (seed: number, lo: number, hi: number, seconds: number): number[] => {
    const out: number[] = [];
    let s = seed, t = 0;
    while (t < seconds) { s = (s * 16807) % 2147483647; const d = (lo + (s % (hi - lo + 1))) / 1000; out.push(d); t += d; }
    return out;
  };
  const chainOff = (named: number[], q: number): number => [...new Set(named)].findIndex((n, j) => n - named[0]! < j * q * TICK_HZ - 2 - 1e-9);
  it.each([[15, 35], [20, 40]])("uneven page frames of %s-%s ms (three seeds): every single-mode weapon pressed every frame, the room refusing none, no chain faster than the original", (lo, hi) => {
    const off: string[] = [];
    for (const seed of [11, 4242, 777]) {
      for (const rec of SINGLE) {
        const q = (fireFrames(rec.fireWait, 1) + lockFrames(rec)) * GAME_FRAME_DT, frames = frameLengths(seed, lo, hi, Math.max(4, 3 * q));
        // LATER 1147 (research 443): the console's fastest re-press (`tapsOfThree`), in single (was: `mash`, which no read sees).
        const held = tapsOfThree(frames);
        const { tally, named, rows } = burst(rec, 60, 0, frames, { held, mode: 1 });
        const fast = chainOff(named, q);
        if (named.length < 3 || (tally.fired ?? 0) !== named.length || fast >= 0) off.push(`seed ${seed} ${rec.name}: ${JSON.stringify(tally)}, chain round ${fast} ${rows.filter((r) => !r.endsWith(':fired')).slice(0, 4).join(' ')}`);
        // F3's cost: no fewer than the original's rounds over the same taps (`originalRounds`, the bolt and pump guns' lock
        // in it: the review F2, was "the bolt guns aside") less F3_COST. Was: round j at j x q, against a press every page frame.
        const due = originalRounds(frames, (i) => held[i]!, fireInterval(rec.fireWait, 1), 1, hi / 1000, lockOf(rec)), got = new Set(named).size;
        if (got < due * (1 - F3_COST)) off.push(`seed ${seed} ${rec.name}: ${got} rounds, under the original's ${due} less ${F3_COST * 100}%`);
      }
    }
    expect(off.length, off.slice(0, 4).join(' || ')).toBe(0);
  });

  // The review's F3: a burst or automatic re-pressed on the page frame after a step opened its gate (held one page frame,
  // let go the next) takes the kept clock; the held round after it is a step's -- the room refusing none, at steady and
  // uneven frames. The second review's F2: the commands carry the Trigger bit on the held frames only (`held`), so each
  // press's round is held to the first command carrying it, as the page names it (was `alternate`: the bit on every frame).
  const AUTO = Object.values(RECORDS).filter((r) => r.fireModes.some((m) => m === 2 || m === 3));
  it.each([['60 fps', 0, 0], ['144 fps', 0, 1], ['15-35 ms', 15, 35], ['20-40 ms', 20, 40]] as const)("%s: every burst and automatic weapon held a frame and let go the next, the room refusing none, no chain faster than the original", (_, lo, hi) => {
    const off: string[] = [];
    const frames = lo ? frameLengths(4242, lo, hi, 4) : Array(Math.round(4 * (hi ? 144 : 60))).fill(1 / (hi ? 144 : 60));
    for (const rec of AUTO) {
      const q = Math.min(...rec.fireModes.filter((m) => m > 0).map((m) => fireFrames(rec.fireWait, m))) * GAME_FRAME_DT;
      const { tally, named, rows } = burst(rec, 60, 0, frames, { held: frames.map((_, i) => i % 2 === 0) });
      const fast = chainOff(named, q);
      if (named.length < 3 || (tally.fired ?? 0) !== named.length || fast >= 0) off.push(`${rec.name}: ${JSON.stringify(tally)}, chain round ${fast} ${rows.filter((r) => !r.endsWith(':fired')).slice(0, 4).join(' ')}`);
      // F3's cost on uneven frames: no fewer than the original's rounds over the same trigger less F3_COST.
      if (lo) {
        const due = originalRounds(frames, (i) => i % 2 === 0, Math.min(...rec.fireModes.filter((m) => m > 0).map((m) => fireInterval(rec.fireWait, m)), rec.fireWait), Infinity, hi / 1000);
        if (named.length < due * (1 - F3_COST)) off.push(`${rec.name}: ${named.length} rounds, under the original's ${due} less ${F3_COST * 100}%`);
      }
    }
    expect(AUTO.length).toBeGreaterThan(15);
    expect(off.length, off.slice(0, 4).join(' || ')).toBe(0);
  });
});

/**
 * LATER 587's second review (F1, F2) and LATER 588 (a): taps as a player makes them -- the trigger held 1 to 10 page frames
 * and let go 1 to 4, seeded -- the commands' Trigger bit the frame's own, each press's round named at the first command
 * carrying it (`NetPage.fireEvent`'s hold, LATER 347; the helper's `held`), each step's at its own game frame's (LATER 338).
 * Every weapon in every firearm mode it enables (single, burst, automatic), at a steady 30, 60 and 144 fps and on uneven
 * 15-35 and 20-40 ms frames: the room refuses none. Was (587's head): a press's round named up to a tick after its moment
 * and a step's up to a tick before, so a tapped burst or automatic came a command inside the room's gap -- the 9mm Sub's
 * and MP5K's 2 against a cycle of 2.6 -- refused 'rate' at every rate but a steady 30 fps.
 */
describe("LATER 587's second review, LATER 588 (a): taps held and let go on the page's frames, named the page's way -- the room refusing none", () => {
  const rnd = (seed: number): (() => number) => { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; };
  /** Seeded taps over `seconds`: each frame's length (ms `lo`-`hi`, or steady) and whether the trigger is held in it. */
  const taps = (seed: number, lo: number, hi: number, seconds: number): { frames: number[]; held: boolean[] } => {
    const r = rnd(seed * 7919), frames: number[] = [], held: boolean[] = [];
    let t = 0;
    while (t < seconds) {
      const on = 1 + Math.floor(r() * 10), off = 1 + Math.floor(r() * 4);
      for (let i = 0; i < on + off; i++) { const d = (lo === hi ? lo : lo + r() * (hi - lo)) / 1000; frames.push(d); held.push(i < on); t += d; }
    }
    return { frames, held };
  };
  const FIREARMS = Object.values(RECORDS).filter((r) => r.fireModes.some((m) => m >= 1 && m <= 3));
  it.each([[1000 / 30, 1000 / 30], [1000 / 60, 1000 / 60], [1000 / 144, 1000 / 144], [15, 35], [20, 40]])("frames of %s-%s ms, three seeds: every weapon in every firearm mode tapped, none refused", (lo, hi) => {
    const off: string[] = [];
    let rounds = 0;
    for (const seed of [1, 2, 3]) {
      const { frames, held } = taps(seed, lo, hi, 3);
      for (const rec of FIREARMS) {
        for (const mode of rec.fireModes.filter((m) => m >= 1 && m <= 3)) {
          const { tally, named, rows } = burst(rec, 60, 0, frames, { held, mode });
          rounds += named.length;
          if ((tally.fired ?? 0) !== named.length) off.push(`seed ${seed} ${rec.name} m${mode}: ${JSON.stringify(tally)} ${rows.filter((x) => !x.endsWith(':fired')).slice(0, 3).join(' ')}`);
          // F3's cost on uneven frames: no fewer than the original's rounds over the same taps less F3_COST (the bolt and
          // pump guns' lock in the count: the review F2, was "the bolt guns aside").
          if (lo !== hi) {
            const due = originalRounds(frames, (i) => held[i]!, fireInterval(rec.fireWait, mode), roundsPerPull(mode), hi / 1000, lockOf(rec));
            if (named.length < due * (1 - F3_COST)) off.push(`seed ${seed} ${rec.name} m${mode}: ${named.length} rounds, under the original's ${due} less ${F3_COST * 100}%`);
          }
        }
      }
    }
    expect(rounds).toBeGreaterThan(FIREARMS.length * 3);
    expect(off.length, off.slice(0, 4).join(' || ')).toBe(0);
  });

  it("LATER 588 (a): a forged HK5 automatic, a round every 5 commands (12 a second) for 4 s, is held to the console's frames on average", () => {
    // The console's HK5 automatic: 0.08 s, 3 game frames a round (`fireFrames`), 6 ticks; 4 s is 40 such rounds (+2: the
    // first, and the schedule's slack). Was: the room's gap the wait less a tick (3.8 commands), so 48 of 48 fired.
    const HK5 = Object.values(RECORDS).find((r) => r.name === 'HK5')!;
    expect(fireFrames(HK5.fireWait, 3)).toBe(3);
    const { fired, sent } = forger(HK5, 5, 4);
    expect(sent).toBeGreaterThanOrEqual(48);
    expect(fired, `${fired} of ${sent} fired`).toBeLessThanOrEqual(42);
  });
});

/**
 * P3-room (the online-parity sweep's AR-4; reading, pending review): a launched round (`room.ts` `launchRound`) waits on
 * the kit's one fire timer `+0x81c`, which its fire sets as a rifle round's does (`FUN_005be9a0` D:L475513-475518, the
 * branch that calls `FUN_005bd6d0`, the round's leaving, research 94 C4.2) and which runs down a game frame at a time
 * (`FUN_005c0fd0` D:L476643-476647) -- so after the carrier's rifle the round is held to the console's period as the
 * rifle's next round is (LATER 588 (a)): the gap (`fireCycleTicks`) and the schedule (`scheduleOpen`) of the rifle's slot.
 */
describe("P3-room (AR-4): the launched round on the rifle's schedule (fireGate), as the hand's rounds since LATER 588 (a)", () => {
  const CARRIER = Object.values(RECORDS).find((r) => r.name === 'M4A1-M203')!;
  it("the M4A1-M203: two forged rifle rounds at the gap, then its M203 FRAG at the gap -- inside the console's period over the chain, refused; two commands later, taken; one round alone then the launched round at the gap, taken", () => {
    // M4A1-M203: FireWait 0.14, automatic x 0.8 = 0.112 s -- the gap 5.72 ticks (6 commands), the console's 4 game frames
    // (`Q` 8 ticks). Rifle rounds at 0 and 6 (the schedule then 8); the round at 12 passes the gap (6 from the last rifle
    // round) but not the schedule (12 < 8 + 8 - 2).
    expect([Math.ceil(fireCycleTicks(CARRIER)), fireScheduleTicks(CARRIER)]).toEqual([6, 8]);
    expect(launchAfter(CARRIER, [0, 6], 12)).toEqual({ rifle: 2, launched: false });
    expect(launchAfter(CARRIER, [0, 6], 14)).toEqual({ rifle: 2, launched: true });
    expect(launchAfter(CARRIER, [0], 6)).toEqual({ rifle: 1, launched: true });
  });

  // LATER 336's re-review (finding 6): the launched round's lock is laid in the offset it is dated with (`Room.layLock`).
  // The rifle's rounds laid while the line's best offset stood 10 lower; the offset back up before the round: the lock
  // laid with the schedule kept into the new offset, so the rifle's rounds from the lock's end all fire. Laid unshifted
  // (`setLock` at the dating, the schedule's offset left behind), the next rifle round's keep would lift it 10 more and
  // refuse the rounds at its end 'reload or empty'.
  it("LATER 336 (re-review finding 6): the M4A1-M203's round laid after its line's best offset rose 10 -- its 2 s after-shot lock in the offset it is dated with: the rifle's rounds from the lock's end all fired", () => {
    type Floor = { lagFloor: { cur: number; prev: number }; reloadUntil: [number, number]; lockStart: [number, number] };
    let was = 0;
    const around = (t: number, seat: unknown, room: unknown): void => {
      const f = (seat as Floor).lagFloor;
      if (t === -1) { was = Math.min(f.cur, f.prev); f.cur = was - 10; f.prev = was - 10; }   // the rifle's rounds 10 lower
      if (t === 20) { f.cur = was; f.prev = was; }                                             // back up before the round
      if (t === 21) (room as { flying: unknown[] }).flying.length = 0;   // its flight not this test's (its blast reaches the seat)
    };
    let L = 0;
    launchAfter(CARRIER, [0, 6], 20, { lockS: 2, around: (t, seat, room) => { around(t, seat, room); if (t === 22) { const s = seat as Floor; L = s.reloadUntil[0] - s.lockStart[0]; } } });
    expect(L).toBeGreaterThan(Math.round(TICK_HZ) + 10);               // past the round's own FireWait (1 s)
    const post = [0, 8, 16].map((k) => 20 + L + k);           // on the console's period (`fireScheduleTicks` 8)
    expect(launchAfter(CARRIER, [0, 6, ...post], 20, { lockS: 2, around }), `the lock ${L} ticks`).toEqual({ rifle: 2 + post.length, launched: true });
  });

  /**
   * The source pin's extractor (the review's F1): every rate written as a product with `TICK_HZ` less a whole tick, in
   * either order and over any operand -- `fastest * TICK_HZ - 1`, `fastestWait(record) * TICK_HZ - 1`,
   * `(fastest) * TICK_HZ - 1`, `TICK_HZ * fastest - 1` (not `- 1e-9`, not `Math.round(...) - 1`); each hit is its line up
   * to the match. Allowed: the throw's two (`takeThrowStart`: THROW_REPEAT_S, THROW_TAIL_S), by their operand. And every
   * fastest-mode filter (`filter((m) => m > 0)`, any name, with or without the parentheses): `fastestWait`'s body.
   */
  const ALLOWED = /\b(?:THROW_REPEAT_S|THROW_TAIL_S)\s*\*\s*TICK_HZ\s*-\s*1$/;
  const cadenceHits = (src: string): string[] => src.split('\n').flatMap((line) =>
    [...line.matchAll(/\*\s*TICK_HZ\s*-\s*1(?![\d.e])|TICK_HZ\s*\*[^;]*?-\s*1(?![\d.e])/g)]
      .map((m) => line.slice(0, m.index! + m[0].length).trim())
      .filter((hit) => !ALLOWED.test(hit)));
  const fastestFilters = (src: string): string[] => src.match(/filter\(\(?\w+\)?\s*=>\s*\w+\s*>\s*0\)/g) ?? [];

  it("the source pin's self-check: each way of writing a private fire cadence is caught, the throw's two are not", () => {
    const rates = ['const cycle = fastest * TICK_HZ - 1;', 'const cycle = fastestWait(record) * TICK_HZ - 1;', 'const cycle = (fastest) * TICK_HZ - 1;', 'const cycle = TICK_HZ * fastest - 1;'];
    expect.soft(rates.filter((form) => cadenceHits(`const a = 1;\n    ${form}\n`).length !== 1), 'rate forms missed').toEqual([]);
    const filters = ['rec.fireModes.filter((m) => m > 0)', 'rec.fireModes.filter(m => m > 0)', 'modes.filter((mode)=>mode>0)'];
    expect.soft(filters.filter((form) => fastestFilters(form).length !== 1), 'filter forms missed').toEqual([]);
    const throws = 'const repeat = THROW_REPEAT_S * TICK_HZ - 1;\nif (x < THROW_TAIL_S * TICK_HZ - 1) return;\nconst u = Math.ceil(left * TICK_HZ - 1e-9);\nconst w = Math.round(wait * TICK_HZ) - 1;';
    expect(cadenceHits(throws)).toEqual([]);
  });

  it("the source pin: room.ts keeps no private fire-cadence rate -- every `TICK_HZ` product less a tick is a throw's (THROW_REPEAT_S, THROW_TAIL_S), and no fastest mode is computed outside fireGate", () => {
    const src = readFileSync(resolve(import.meta.dirname, '../src/room.ts'), 'utf8');
    expect(cadenceHits(src)).toEqual([]);
    expect(fastestFilters(src)).toEqual([]);
  });
});

/**
 * P13 (the online-parity sweep's AR-3 = WK-4; the review fold's finding 1): `ROOM_RAISE_TRUST_ADAPTATION` -- the room
 * models no raise envelope, so a round from a lowered rifle is taken on the press's own command. The original refuses it
 * until the raise reads 1 (`FUN_005c0ae0` D:L476420-476438; from a cleared envelope 2 game frames after the press,
 * research 215 §8.4); the page holds that refusal (LATER 180), the room trusts it (its build, LATER 641). Here the body's
 * start and 6 s with the trigger up (past the 5 s idle lower, D:L453600) leave the rifle lowered on the original, and the
 * forged page names its first round at the press's command.
 */
describe('P13 (AR-3 = WK-4): the room trusts the page for the raise (ROOM_RAISE_TRUST_ADAPTATION)', () => {
  it("a round from a lowered rifle, named at the press's own command, is taken: the room has no raise to refuse it", () => {
    expect(ROOM_RAISE_TRUST_ADAPTATION).toBe("the room models no raise envelope: a round from a lowered rifle or launcher is the page's to refuse");
    const { fired, sent } = forger(M4A1, 1000, 0.1);   // one round, at t = 360: the trigger's first command down
    expect(sent).toBe(1);
    expect(fired).toBe(1);
  });
});

/**
 * The online parity sweep's AR-7 (P16; LATER 588's last open sentence; research 84 s11, `ROOM_GATE_MIRROR_ADAPTATION`'s
 * row): the page's kit mirrors the room's rate gate (`../../viewer/src/net/fireGate`: the gap after `lastFire`, the chain's
 * schedule) as its own rounds moved it, and a `stale` refunds the round's magazine but not the mirror. So a round the room
 * alone refuses leaves the two apart: `refuseRound` (a muzzle inside the cone, an early round) advances the room's
 * `lastFire` as the page's -- the gap equal -- and neither its schedule nor its clock; a plain drop (cone, nofire,
 * reload or empty) advances none. The room is then behind the page, the more lenient side: no later honest round may be
 * refused 'rate'. Driven here with the page's own kit (`burst`, taps as `NetPage` names them) and the room together; the
 * refusal staged in the room alone at the round's decision (`Around`) -- the claim moved out of the cone, the muzzle past
 * `START_REACH_PLACEHOLDER` along its own line, the frame's `fire` false, the room's clock ahead of the round, the slot's
 * reload under way, its magazine empty -- and put back once decided. Every fourth pull refused, every weapon in every
 * firearm mode, at a steady 60 fps and on uneven 20-40 ms frames.
 */
describe("AR-7 (P16): rounds the room alone refuses (cone, muzzle, nofire, early, reload, empty), then honest rounds -- none refused 'rate'", () => {
  type Seat = { cone: { frame(seq: number): AimFrame | undefined }; fireClock: number[]; reloadUntil: number[]; lastFire: number[]; mags: { rounds(): number }[] };
  type Kind = 'cone' | 'muzzle' | 'nofire' | 'early' | 'reload' | 'empty';
  const KINDS: readonly Kind[] = ['cone', 'muzzle', 'nofire', 'early', 'reload', 'empty'];
  /** The room's word for each staged refusal (`Room.fire` / `fireAt`; an early round is `refuseRound`'s 'rate'). */
  const WORD: Record<Kind, RegExp> = {
    cone: /^fire: cone/, muzzle: /^fire: muzzle far$/, nofire: /^fire: nofire$/, early: /^fire: rate$/, reload: /^fire: reload or empty$/, empty: /^fire: reload or empty$/,
  };
  const yawBy = (v: readonly number[], a: number): [number, number, number] => [v[0]! * Math.cos(a) + v[2]! * Math.sin(a), v[1]!, -v[0]! * Math.sin(a) + v[2]! * Math.cos(a)];
  /** Stage `kind` on this call: the room alone refuses it; the returned function puts the seat back. */
  const stage = (kind: Kind, ev: Parameters<Around>[1], seat: Seat): (() => void) | void => {
    const w = 0;
    switch (kind) {
      case 'cone': ev.aim = yawBy(ev.aim, 0.3); ev.dir = yawBy(ev.dir, 0.3); return;
      case 'muzzle': { const k = START_REACH_PLACEHOLDER + 24; ev.from = [ev.from[0] + ev.dir[0] * k, ev.from[1] + ev.dir[1] * k, ev.from[2] + ev.dir[2] * k]; return; }
      case 'nofire': {
        const frame = seat.cone.frame;
        seat.cone.frame = (s: number) => { const f = frame.call(seat.cone, s); return f && s === ev.seq ? { ...f, fire: false } : f; };
        return () => { seat.cone.frame = frame; };
      }
      case 'early': { const was = seat.fireClock[w]!; seat.fireClock[w] = 1e12; return () => { seat.fireClock[w] = was; }; }
      case 'reload': { const was = seat.reloadUntil[w]!; seat.reloadUntil[w] = 1e12; return () => { seat.reloadUntil[w] = was; }; }
      case 'empty': { const m = seat.mags[w]!, rounds = m.rounds; m.rounds = () => 0; return () => { m.rounds = rounds; }; }
    }
  };
  const rnd = (seed: number): (() => number) => { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; };
  /** Seeded taps (as LATER 587's second review's): held 1-10 frames, let go 1-4, each frame `lo`-`hi` ms. */
  const taps = (seed: number, lo: number, hi: number, seconds: number): { frames: number[]; held: boolean[] } => {
    const r = rnd(seed * 7919), frames: number[] = [], held: boolean[] = [];
    let t = 0;
    while (t < seconds) {
      const on = 1 + Math.floor(r() * 10), off = 1 + Math.floor(r() * 4);
      for (let i = 0; i < on + off; i++) { const d = (lo === hi ? lo : lo + r() * (hi - lo)) / 1000; frames.push(d); held.push(i < on); t += d; }
    }
    return { frames, held };
  };
  const FIREARMS = Object.values(RECORDS).filter((r) => r.fireModes.some((m) => m >= 1 && m <= 3));

  it.each([...KINDS, 'mixed'] as const)("%s: every weapon in every firearm mode, every fourth pull refused by the room alone -- no honest round refused 'rate' (60 fps and 20-40 ms taps)", (which) => {
    const off: string[] = [];
    let honest = 0, staged = 0;
    for (const [lo, hi] of [[1000 / 60, 1000 / 60], [20, 40]] as const) {
      const { frames, held } = taps(5, lo, hi, 3);
      for (const rec of FIREARMS) {
        for (const mode of rec.fireModes.filter((m) => m >= 1 && m <= 3)) {
          const kindOf = new Map<number, Kind>();                    // the call's index -> the refusal staged on it
          const early = new Map<number, boolean>();                 // an early round's seq -> it reached `refuseRound`
          let lastSeq = -1, pulls = 0, kind: Kind | null = null;
          const around: Around = (call, ev, seatRaw) => {
            const seat = seatRaw as Seat;
            if (ev.seq !== lastSeq) {                                // a new pull: a shotgun's rays share their command
              lastSeq = ev.seq;
              kind = pulls % 4 === 1 ? (which === 'mixed' ? KINDS[(pulls >> 2) % KINDS.length]! : which) : null;
              pulls++;
            }
            const k = kind;
            if (k === null) return;
            kindOf.set(call, k);
            const undo = stage(k, ev, seat);
            const count = seat.cone.frame(ev.seq)?.count;
            return () => {
              if (k === 'early') early.set(ev.seq, (early.get(ev.seq) ?? false) || seat.lastFire[0] === count);
              undo?.();
            };
          };
          const { rows } = burst(rec, 60, 0, frames, { held, mode, around });
          rows.forEach((row, i) => {
            const out = row.slice(row.indexOf(':') + 1), k = kindOf.get(i);
            if (k) {
              staged++;
              if (!WORD[k].test(out)) off.push(`${rec.name} m${mode} ${lo}-${hi}: staged ${k} at ${row}, the room said ${out}`);
            } else {
              honest++;
              if (out !== 'fired') off.push(`${rec.name} m${mode} ${lo}-${hi}: honest round ${row} refused (${out}); ${rows.slice(Math.max(0, i - 4), i + 1).join(' ')}`);
            }
          });
          for (const [seq, reached] of early) if (!reached) off.push(`${rec.name} m${mode}: the early round at ${seq} did not reach refuseRound`);
        }
      }
    }
    expect(staged, 'refusals staged').toBeGreaterThan(FIREARMS.length * 2);
    expect(honest, 'honest rounds after them').toBeGreaterThan(staged * 2);
    expect(off.filter((o) => o.includes('refused (fire: rate)')), "honest rounds refused 'rate'").toEqual([]);
    expect(off.slice(0, 6)).toEqual([]);
  });
});
