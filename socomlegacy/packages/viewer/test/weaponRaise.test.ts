// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import { GAME_FRAME_DT } from '@s2u/scene';
import {
  ACTION_PLANT_RAISE_READING, ease, RAISE_TIMES, ZERO_RAISE_TIMES, REMOTE_HAND_RAISE_READING, THROW_LAST_GRENADE_RAISE_READING, THROW_RIFLE_RAISE_READING,
  throwReleaseOf, WeaponRaise,
} from '../src/weaponRaise';
import { Play } from '../src/play';
import { mountThrowables, type MatchThrowDeps } from '../src/matchThrow';
import { PlayerLoadout } from '../src/loadout';
import type { HoldClip, PlaySnapshot } from '../src/mover';

/**
 * NU-8a, research 326 §6 B1 (D1, D2, D3; reading, pending review): the rifle's raise (`./weaponRaise`, research 211's
 * `FUN_005dfe30` / `FUN_005dfc80` / `FUN_00594cf0`) hears a hand grenade, a throw's release and a placing's trigger as
 * the player controller does:
 *
 * - a hand grenade up (the hand's class 'y', `FUN_005c8040` D:L453568) with the trigger idle asks the rifle down at once,
 *   the 5 s countdown skipped (D:L453598-453600);
 * - a throw's release asks it up (`FUN_005dfe30(body, 1)` D:L453520, the envelope in 0.1 s, D:L494259-494265) and moves
 *   the trigger edge to 2 (D:L453532-453533); under the throw `FUN_0059d830` answers 0 (D:L457352-457362), so the plain
 *   trigger branch runs: the edge 2 -> 3 (the countdown reset, D:L453603-453610) -> 0, where the class 'y' asks it down
 *   (D:L453598-453600) -- the second update after the release, under the clip, so 0 at the pop;
 * - the pistol hand's throw (`Pistol throw grenade`) is in neither gate's list (D:L457352-457355, D:L462579-462582): the
 *   wind-up block's bit-7 branch asks it down on the very next update (D:L453484-453489);
 * - a placing's trigger press raises it as the firearm's does (D:L453633-453634: the class is not 'y') and the
 *   countdown holds it 5 s; C4's and the bomb's Action-button plant ask nothing (`ACTION_PLANT_RAISE_READING`).
 *
 * The weights are the envelope's (`Envelope`, `FUN_00286c90` / `FUN_00286b80`) at the game frame: one update a frame.
 * LATER 185, restated: was 60 frames a second, the raise then stepping by the page's frame. It steps once a game frame
 * (`RAISE_ENVELOPE_STEP_READING`), so these run at `GAME_FRAME_DT` -- each page frame one update, the original's -- and
 * the rise a frame is 5/128 s over 0.1 s in float32 (`RISE`; was 1/6); the 60 Hz page's mapping is `raiseRefusal.test.ts`'s.
 */

const DT = GAME_FRAME_DT;
/**
 * LATER 185: a cold rifle's linear weight one and two updates into the rise, in float32 toward zero (research 215 s8.4):
 * at the envelope's size (100000.59375 from the start) a tick takes 5/128 s, so 5/128 and 10/128 s over the 0.1 s float.
 */
const RISE = [0.3906249701976776, 0.7812499403953552] as const;
/** LATER 185: the linear weight one update after a lower asked from `RISE[k]`: `(RISE[k] x 0.5 - dt) / 0.5`, in float32. */
const FALL_FROM = [0.3238905072212219, 0.7145154476165771] as const;
const IDLE = { trigger: false, aiming: false };
const FIRING = { trigger: true, aiming: false };
/** A hand grenade up, one left, the trigger idle: the hand's class 'y'. */
const Y = { ...IDLE, grenade: true };

/** A rifle hot within its countdown: fired 0.2 s, let go one frame (the countdown reset to 5 s). */
function hot(): WeaponRaise {
  const r = new WeaponRaise();
  for (let i = 0; i < 12; i++) r.frame(DT, FIRING);
  r.frame(DT, IDLE);
  expect(r.weight()).toBe(1);
  return r;
}

/** `n` frames of `input`, the weights after each. */
function frames(r: WeaponRaise, n: number, input: Parameters<WeaponRaise['frame']>[1]): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(r.frame(DT, input));
  return out;
}

describe('NU-8a B1: the rifle through a throw and a placing (research 326 §6 B1; FUN_00594cf0)', () => {
  it('D2: a hand grenade taken up with the trigger idle lowers a hot rifle at once, over its 0.5 s out, the countdown skipped (D:L453598-453600)', () => {
    const r = hot();
    const countdown = r.stats().countdown;
    const first = r.frame(DT, Y);
    expect(first).toBeLessThan(1);                                       // today: held 5 s by the countdown
    expect(r.stats()).toMatchObject({ state: 'down', moving: true });
    expect(r.envelope.remaining).toBeCloseTo(0.99 * RAISE_TIMES.out - DT, 6);   // from its weight, under 0.99, x out (float32)
    let k = 1;
    while (r.weight() > 0 && k < 100) { r.frame(DT, Y); k++; }
    expect(k).toBe(15);                                                  // 0.495 s of game frames (was 30 of 1/60 s)
    expect(r.stats().countdown).toBeCloseTo(countdown, 9);               // the 'y' branch runs no countdown
  });

  it("D1: a hot rifle at a throw's release with a grenade left -- up asked (already up), falling from the third frame, 0 at the pop", () => {
    const r = hot();
    const w = [r.frame(DT, { ...Y, release: 'gated' }), ...frames(r, 90, Y)];   // R, then R+1 .. R+90
    expect(w.slice(0, 2)).toEqual([1, 1]);                               // the release and the edge-3 update
    expect(w[2]).toBeLessThan(1);                                        // R+2: the class 'y' asks it down
    expect(r.envelope.remaining).toBe(0);
    expect(w[32]).toBe(0);                                               // out in 0.495 s from R+2
    expect(w[47]).toBe(0);                                               // the stick's cut (the 48th command, PAR-70)
    expect(w[90]).toBe(0);                                               // the uncut end (the 91st)
  });

  // LATER 185, restated: the rise a game frame's in float32 (RISE, FALL_FROM; was 1/6 and 1/3 at 1/60 s, then 0.3).
  it("D1: a cold rifle at the release rises for two updates of its 0.1 s (linear RISE), then runs out over that weight x 0.5 s; 0 at the pop", () => {
    const r = new WeaponRaise();
    frames(r, 60, Y);
    expect(r.weight()).toBe(0);
    r.frame(DT, { ...Y, release: 'gated' });
    expect(r.envelope.linear()).toBeCloseTo(RISE[0], 5);                   // R: the envelope started, 0.1 s in
    r.frame(DT, Y);
    expect(r.envelope.linear()).toBeCloseTo(RISE[1], 5);               // R+1: the edge 2 -> 3, no request
    expect(r.weight()).toBeCloseTo(ease(RISE[1]), 5);                  // less, eased
    r.frame(DT, Y);
    expect(r.stats()).toMatchObject({ state: 'down', moving: true });  // R+2: down from RISE[1] x 0.5 s
    expect(r.envelope.remaining).toBeCloseTo(RISE[1] * RAISE_TIMES.out - DT, 5);
    expect(r.envelope.linear()).toBeCloseTo(FALL_FROM[1], 5);
    const w = frames(r, 88, Y);                                          // R+3 .. R+90
    expect(w[10]).toBe(0);                                               // R+13: out
    expect(w[44]).toBe(0);                                               // R+47: the cut's pop
    expect(w[87]).toBe(0);                                               // R+90: the uncut end's
  });

  it("the pistol hand's throw rides outside both gates (326 §1.6, its review's F2): lowered on the next update by the bit-7 branch", () => {
    const cold = new WeaponRaise();
    cold.frame(DT, { ...Y, release: 'ungated' });
    expect(cold.envelope.linear()).toBeCloseTo(RISE[0], 5);                // LATER 185: a game frame's rise (was 1/6)
    cold.frame(DT, Y);
    expect(cold.stats()).toMatchObject({ state: 'down', moving: true });   // R+1, not R+2
    expect(cold.envelope.remaining).toBeCloseTo(RISE[0] * RAISE_TIMES.out - DT, 5);
    const warm = hot();
    const w = [warm.frame(DT, { ...Y, release: 'ungated' }), ...frames(warm, 40, Y)];
    expect(w[0]).toBe(1);
    expect(w[1]).toBeLessThan(1);                                        // falling from the second frame
    expect(w[40]).toBe(0);
  });

  it('the wind-up: its press resets the countdown and leaves the edge idle (D:L453624-453660); it asks nothing while held, nor runs the countdown', () => {
    const r = hot();
    frames(r, 30, IDLE);                                                 // about a second of the countdown run
    expect(r.stats().countdown).toBeCloseTo(5 - 30 * DT, 6);            // LATER 185: 30 game frames (was 60 of 1/60 s, 4)
    const before = r.weight();
    const held = frames(r, 30, { ...IDLE, grenade: true, windUp: true });
    expect(r.stats().countdown).toBeCloseTo(5, 9);                      // the press's reset, then no run
    expect(r.stats().edge).toBe(0);
    expect(held.every((x) => x === before)).toBe(true);                 // no request: the rifle where it was
  });

  it("D3: a placing's trigger is the firearm's -- up in 0.1 s, held 5 s after the release, then out", () => {
    const r = new WeaponRaise();
    const up = frames(r, 12, FIRING);
    expect(up[11]).toBe(1);
    const after = frames(r, Math.round(5 / DT) + 40, IDLE);
    expect(after[Math.round(4.9 / DT)]).toBe(1);
    expect(after[after.length - 1]).toBe(0);
  });

  it('names its readings: THROW_RIFLE_RAISE_READING, THROW_LAST_GRENADE_RAISE_READING (the countdown), ACTION_PLANT_RAISE_READING, REMOTE_HAND_RAISE_READING', () => {
    expect(THROW_RIFLE_RAISE_READING).toBe('down at a take-up; up at a release, down two updates on with one left');
    expect(THROW_LAST_GRENADE_RAISE_READING).toBe('the countdown');
    expect(ACTION_PLANT_RAISE_READING).toBe('none');
    expect(REMOTE_HAND_RAISE_READING).toBe('a hand grenade from a throw to the next trigger');
  });
});

// ---- the page's body: Play's feed (the hold's start, the hand's item) ------------------------------------------------

/** A still SEAL on the floor, its hold set by the test. */
function snapshot(): PlaySnapshot {
  return {
    feet: [0, 0, 0], yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand', landing: null,
    jumps: 0, ground: { state: 'idle', forward: 0, right: 0, cls: 0 }, action: null, turnRate: 0,
  } as PlaySnapshot;
}

/** A Play with no body, walking on a stub whose snapshot the test moves; the firearm's trigger and, when given, the hand. */
function playRig(hand?: { grenade: boolean; windUp: boolean; trigger: boolean }) {
  const play = new Play();
  const camera = new PerspectiveCamera();
  const s = snapshot();
  let serial = 0;
  const walk = { snapshot: () => s, view: () => 'third' as const };
  const input = { trigger: false, aiming: false };
  play.setWeaponInput(() => ({ ...input }));
  if (hand) play.setItemRaise(() => ({ ...hand }));                     // `./matchThrow`'s feed; none for a copy
  const frame = (): number => { play.frame(DT, walk as never, camera); return play.weaponStats().raise.weight; };
  const run = (n: number): number[] => Array.from({ length: n }, frame);
  const hold = (clip: HoldClip | null): void => {
    if (clip) { s.hold = clip; s.holdSerial = ++serial; } else { delete s.hold; delete s.holdSerial; }
  };
  /** Hot: the firearm's trigger 0.2 s, let go one frame. */
  const heat = (): void => { input.trigger = true; run(12); input.trigger = false; run(1); expect(play.weaponStats().raise.weight).toBe(1); };
  return { play, input, run, hold, heat };
}

describe("NU-8a B1 on the page's body: Play hears the hold's start and the hand (research 326 §6 B1)", () => {
  it("a throw's hold start is the release: a hot rifle with a grenade left falls from the third frame and is 0 at the pop", () => {
    const hand = { grenade: false, windUp: false, trigger: false };
    const r = playRig(hand);
    r.heat();
    hand.grenade = true;                                                 // the grenade up on the release's own frame
    r.hold('seal_throwgrenade');
    const w = r.run(91);
    expect(w.slice(0, 2)).toEqual([1, 1]);
    expect(w[2]).toBeLessThan(1);
    expect(w[90]).toBe(0);
    r.hold(null);                                                        // the pop
    expect(r.run(60).every((x) => x === 0)).toBe(true);                // a grenade left: down and stays down
  });

  it("a cold rifle: the two-update rise under the clip, then out; the pistol hand's throw (the rifle's hold code with the pistol in hand) one update sooner; the pistol toss as the rifle's", () => {
    const rifle = playRig({ grenade: true, windUp: false, trigger: false });
    rifle.run(30);
    rifle.hold('seal_throwgrenade');
    // LATER 185, restated: a game frame's rise (RISE, FALL_FROM; was 1/6, 1/3, 0.3 and 2/15 at 1/60 s), the weights in float32
    const w = rifle.run(14);
    expect(w[0]).toBeCloseTo(ease(RISE[0]), 5);
    expect(w[1]).toBeCloseTo(ease(RISE[1]), 5);
    expect(w[2]).toBeCloseTo(ease(FALL_FROM[1]), 5);
    expect(w[13]).toBe(0);
    const pistol = playRig({ grenade: true, windUp: false, trigger: false });
    pistol.play.setItem('pistol');
    pistol.run(30);
    pistol.hold('seal_throwgrenade');                                    // `Pistol throw grenade`: outside both gates
    const p = pistol.run(3);
    expect(p[0]).toBeCloseTo(ease(RISE[0]), 5);
    expect(p[1]).toBeCloseTo(ease(FALL_FROM[0]), 5);                   // R+1: down from RISE[0] x 0.5 s
    const toss = playRig({ grenade: true, windUp: false, trigger: false });
    toss.play.setItem('pistol');
    toss.run(30);
    toss.hold('seal_p_tossgrenade');                                     // the pistol toss: in both lists
    const t = toss.run(3);
    [ease(RISE[0]), ease(RISE[1]), ease(FALL_FROM[1])].forEach((x, i) => expect(t[i]).toBeCloseTo(x, 5));
  });

  // The review's F1: `Pistol peek right toss` (DAT_003deb28) and `Pistol peek left toss` (DAT_003deb38), paired with
  // the rifle's peek tosses at D:L494720-494721, are in neither `FUN_0059d830`'s list (D:L457352-457355) nor
  // `FUN_005a7d10`'s (D:L462579-462582): outside the gates, as the pistol's standing throw. Was: filed as inside.
  it("the pistol hand's peek tosses (the rifle's lean codes with the pistol in hand) ride outside the gates: lowered on the next update; the rifle's peek tosses inside", () => {
    expect(throwReleaseOf('seal_toss_rlean', true)).toBe('ungated');
    expect(throwReleaseOf('seal_toss_llean', true)).toBe('ungated');
    expect(throwReleaseOf('seal_toss_rlean', false)).toBe('gated');
    expect(throwReleaseOf('seal_toss_llean', false)).toBe('gated');
    expect(throwReleaseOf('seal_p_tossgrenade', true)).toBe('gated');
    for (const clip of ['seal_toss_rlean', 'seal_toss_llean'] as const) {
      const lean = playRig({ grenade: true, windUp: false, trigger: false });
      lean.play.setItem('pistol');
      lean.run(30);
      lean.hold(clip);
      const p = lean.run(2);
      expect(p[0], clip).toBeCloseTo(ease(RISE[0]), 5);                    // LATER 185: was ease(1/6), ease(2/15) at 1/60 s
      expect(p[1], clip).toBeCloseTo(ease(FALL_FROM[0]), 5);           // R+1: down from RISE[0] x 0.5 s
    }
  });

  it("a hand grenade taken up lowers a hot rifle at once; a placing's trigger raises it and the countdown holds it 5 s; the placings' and C4's holds ask nothing themselves", () => {
    const hand = { grenade: false, windUp: false, trigger: false };
    const r = playRig(hand);
    r.heat();
    hand.grenade = true;
    const down = r.run(31);
    expect(down[0]).toBeLessThan(1);
    expect(down[30]).toBe(0);
    hand.grenade = false;                                                // a claymore up: the class is not 'y'
    r.run(400);                                                          // the countdown the take-up kept runs out (the firearm's rule)
    expect(r.play.weaponStats().raise.weight).toBe(0);
    r.hold('seal_place_claymore');                                       // the hold alone raises nothing (the press does)
    expect(r.run(10).every((x) => x === 0)).toBe(true);
    hand.trigger = true;                                                 // the placing's press
    const up = r.run(8);
    expect(up[7]).toBe(1);
    hand.trigger = false;
    const held = r.run(Math.round(5 / DT) + 40);
    expect(held[Math.round(4.9 / DT)]).toBe(1);
    expect(held[held.length - 1]).toBe(0);
    r.hold('seal_put_onwall');                                           // C4's plant (the Action button's)
    expect(r.run(30).every((x) => x === 0)).toBe(true);
  });
});

describe("NU-8a B1 on the others' bodies: the replicated hold's start, no hand on the wire (REMOTE_HAND_RAISE_READING)", () => {
  it("a hot copy at another's throw falls from the third frame, is 0 at the pop and stays down until its trigger; a placing's hold asks nothing", () => {
    const r = playRig();                                                 // `./remotePlayers`' feed: the wire's trigger and aim alone
    r.heat();
    r.hold('seal_throwgrenade');
    const w = r.run(91);
    expect(w.slice(0, 2)).toEqual([1, 1]);
    expect(w[2]).toBeLessThan(1);
    expect(w[90]).toBe(0);
    r.hold(null);
    expect(r.run(Math.round(5 / DT) + 30).every((x) => x === 0)).toBe(true);   // not the countdown: a grenade still in hand
    r.input.trigger = true;                                              // the firearm's trigger on the wire: the hand is the firearm's
    expect(r.run(8)[7]).toBe(1);
    r.input.trigger = false;
    r.run(Math.round(5.6 / DT));
    expect(r.play.weaponStats().raise.weight).toBe(0);
    r.hold('seal_place_claymore');                                       // a claymore's, or the bomb's plant: the wire cannot tell
    expect(r.run(30).every((x) => x === 0)).toBe(true);
  });
});

// ---- the page's own kit: ./matchThrow's feed to the raise -------------------------------------------------------------

/** `./matchThrow` mounted on a real Play (no body), a walk stub whose hold the throw lays, a firearm stub with its trigger. */
function pageRig() {
  const play = new Play();
  const camera = new PerspectiveCamera();
  const s = snapshot();
  let serial = 0;
  let fireDown = false;
  const walk = {
    grid: () => null, gridOfGround: () => null, snapshot: () => s, view: () => 'third', fireAim: () => null, feet: () => s.feet,
    drawnFeet: () => s.feet, hold: (clip: HoldClip) => { s.hold = clip; s.holdSerial = ++serial; return true; },
    mode: () => 'walk', isDead: () => false, fireAllowed: () => true, swapGate: () => true, onActionEnd: () => () => {},
    launcherRaised: () => {}, launcherLowered: () => {}, launcherCleared: () => {}, onLauncherStickLower: () => () => {},
  };
  const firearm = {
    shotRumble: () => {},                              // CTL-2: the hands' fire step's motors
    fire: { release: () => { fireDown = false; }, magazineOf: () => ({ rounds: 0, capacity: 0, spare: 0, reloading: false }) },
    zoom: { state: () => 1 }, kit: { swapping: () => false, item: () => 'rifle', state: () => ({ swap: null }) },
    setZoom: () => {}, showFireMode: () => {}, item: () => 'rifle', record: () => ({ name: 'M4A1' }), records: () => [{}, {}],
    icon: () => 'm4.tif', selectFirearm: () => true, shoulderGate: () => true, kitFree: () => true,
    effects: { run: () => false, play: () => false },                   // the grenade's blast, seconds on
  };
  const deps: MatchThrowDeps = {
    scene: new Scene(), walk: walk as never, fly: { shakeScreen: () => {} }, play, loadouts: new PlayerLoadout(),
    view: () => null, map: () => null, net: () => null, firearm: () => firearm as never,
    audio: { onAnimCallback: () => null, play: () => {} } as never,
  };
  const t = mountThrowables(deps);
  const hands = t.hands();
  play.setWeaponInput(() => ({ trigger: fireDown, aiming: false }));  // `./matchFirearm`'s feed
  /** The page's order: the throwables' frame, then the body's. */
  const frame = (): number => { t.frame(DT); t.poseFrame(DT); play.frame(DT, walk as never, camera); return play.weaponStats().raise.weight; };
  const run = (n: number): number[] => Array.from({ length: n }, frame);
  const fire = (down: boolean): void => { if (!hands.trigger(down)) fireDown = down; };
  return { t, s, play, hands, run, fire };
}

describe("NU-8a B1 on the page's own kit: ./matchThrow feeds the raise (the take-up, the wind-up, the placing's trigger)", () => {
  it("the M67 taken up lowers a hot rifle at once; thrown with one left, the rifle is 0 at the pop", () => {
    const p = pageRig();
    p.fire(true); p.run(12); p.fire(false); p.run(1);
    expect(p.play.weaponStats().raise.weight).toBe(1);
    expect(p.t.grenade.select('M67')).toBe(true);
    expect(p.t.grenade.stats().left).toBeGreaterThan(1);
    const down = p.run(31);
    expect(down[0]).toBeLessThan(1);                                     // today: held by the countdown
    expect(down[30]).toBe(0);
    p.fire(true);                                                        // the wind-up
    expect(p.t.grenade.phase()).toBe('holding');
    expect(p.run(30).every((x) => x === 0)).toBe(true);
    p.fire(false);                                                       // the release
    const w = p.run(91);
    expect(p.s.hold).toBe('seal_throwgrenade');
    const r = w.findIndex((x) => x > 0);                                 // the release seen by the body
    expect(w[r]).toBeCloseTo(ease(RISE[0]), 5);                            // LATER 185: a game frame's rise (was 1/6, 1/3, 0.3)
    expect(w[r + 1]).toBeCloseTo(ease(RISE[1]), 5);
    expect(w[r + 2]).toBeCloseTo(ease(FALL_FROM[1]), 5);
    expect(w[r + 14]).toBe(0);
    expect(w[90]).toBe(0);
    delete p.s.hold; delete p.s.holdSerial;                              // the pop
    expect(p.run(60).every((x) => x === 0)).toBe(true);
  });

  it("the claymore's trigger raises the rifle as the firearm's does and the countdown holds it 5 s (D:L453633-453634)", () => {
    const p = pageRig();
    expect(p.t.grenade.select('Claymore')).toBe(true);
    p.run(10);
    expect(p.play.weaponStats().raise.weight).toBe(0);
    p.fire(true);
    const up = p.run(8);
    expect(up[7]).toBe(1);                                               // today: no raise at a placing's press
    p.fire(false);
    const held = p.run(Math.round(5 / DT) + 40);
    expect(held[Math.round(4.9 / DT)]).toBe(1);
    expect(held[held.length - 1]).toBe(0);
  });

  // The review's F3 (b), (c): the countdown the release's edge-3 update (D:L453603-453610) or the wind-up's press
  // (D:L453625-453632) reset is frozen while the class is 'y' (the 'y' branch runs none, D:L453598) and nothing on the
  // swap path writes `ctrl+0x234`, so the firearm taken back up runs it whole: the rifle up for 5 s, no trigger pressed.
  // The own body only -- a copy stays down (`REMOTE_HAND_RAISE_READING`).
  it("the firearm taken back after a throw with one left, or during the wind-up, runs the frozen countdown: the rifle up 5 s", () => {
    for (const when of ['after the throw', 'during the wind-up'] as const) {
      const p = pageRig();
      expect(p.t.grenade.select('M67')).toBe(true);
      p.run(40);
      p.fire(true);
      p.run(30);
      if (when === 'after the throw') {
        p.fire(false);
        p.run(91);
        delete p.s.hold; delete p.s.holdSerial;                          // the pop
        expect(p.run(120).every((x) => x === 0), when).toBe(true);       // the class 'y': down, the countdown frozen
      }
      expect(p.t.grenade.select('rifle'), when).toBe(true);             // the swap back (PAR-19 D07 during the wind-up)
      if (when === 'during the wind-up') p.fire(false);
      const w = p.run(Math.round(5.6 / DT));
      expect(w[11], when).toBe(1);                                       // up in its 0.1 s
      expect(w[Math.round(4.9 / DT)], when).toBe(1);                    // held by the countdown, nothing pressed
      expect(w[w.length - 1], when).toBe(0);                             // then out
    }
  });
});

/**
 * LATER 180 (research 215 s8.3): the turret's slot's zero times (`FUN_005dfff0`, the mount's take-up D:L412218) -- a lower
 * ends at once (`seal+0x116c` = 0.99 x `seal+0xeec` = 0, D:L494255) and a raise from it parks the envelope at 0
 * (D:L494213-494216), so once lowered the weight reads 0 for the rest of the mount; the firearm's times bring it back up.
 */
describe('LATER 180: the raise under the slot\'s times (FUN_005c4b10 D:L478849-478857)', () => {
  it('RED: mounted (zero times), a raised rifle lowers at once and no press raises it again', () => {
    const r = hot();
    r.setTimes(ZERO_RAISE_TIMES);
    expect(r.weight()).toBe(1);                                         // the times only: the envelope keeps its own
    for (let i = 0; i < 310; i++) r.frame(DT, IDLE, DT);                // the 5 s countdown, then the lower
    expect(r.weight()).toBe(0);
    expect(frames(r, 30, FIRING).every((w) => w === 0)).toBe(true);     // the press asks; the envelope parks at 0
  });
  it('dismounted (the firearm\'s times again), the rifle comes up in 0.1 s', () => {
    const r = new WeaponRaise();
    r.setTimes(ZERO_RAISE_TIMES);
    frames(r, 10, FIRING);
    expect(r.weight()).toBe(0);
    r.setTimes(RAISE_TIMES);
    expect(frames(r, 10, FIRING).at(-1)).toBe(1);
  });
});
