import { describe, expect, it } from 'vitest';
import { GAME_FRAME_DT, HELD_RIFLE, heldPower, stepThrowPower, THROW_POWER_RISE } from '@s2u/scene';
import { Accuracy, TICK, type AccuracyInput } from '../src/accuracy';
import { GrenadeThrower } from '../src/grenade';
import { Reticle } from '../src/reticle';
import { RifleKick } from '../src/rifleKick';
import type { PlaySnapshot } from '../src/walk';

/**
 * LATER 1027 (MISSION R8 and R8.1; research 437): five per-frame rules whose outcome moved with the page's frame rate.
 * The original runs each once a game frame, `GAME_FRAME_DT` = 525/15734 s (`@s2u/scene` `gameFrame.ts`), so each is
 * driven here at three page rates -- 30 Hz (a page step of exactly `GAME_FRAME_DT`), 60 Hz and 144 Hz -- and held to the
 * original's outcome: at 30 Hz the original's per-frame result, at 60 and 144 Hz the same outcome (R8: a rate's exact
 * per-second law; R8.1: a threshold judged over one game frame; a count of the original's frames counted in game frames
 * of real time). Every expected number is worked by hand in the comment beside it (G = 525/15734 = 0.03336723 s).
 */

const G = GAME_FRAME_DT;
const RATES: readonly (readonly [string, number])[] = [['30 Hz', G], ['60 Hz', 1 / 60], ['144 Hz', 1 / 144]];

// ---- 1. the throw-power chase (FUN_00594cf0 D:L453508-453516) --------------------------------------------------------

describe('LATER 1027 (1): the held throw\'s power after a time is the original\'s at any page rate (FUN_00594cf0)', () => {
  // The original, once a game frame: p = pressure x dt x rate + p x (1 - dt x rate), dt = G. Held at pressure 1 from 0,
  // after n frames p = 1 - (1 - 3G)^n; between frames the closed form 1 - (1 - 3G)^(t / G).
  // 3G = 0.10010169; 1 - 3G = 0.89989831; ln(1 - 3G) = -0.1054735.
  const K = 1 - THROW_POWER_RISE * G;
  const law = (t: number): number => 1 - K ** (t / G);

  it('30 Hz: nine game frames are the original\'s nine Euler steps, bit for bit', () => {
    let p = 0, euler = 0;
    for (let i = 0; i < 9; i++) {
      p = stepThrowPower(p, 1, G).power;
      euler = 1 * G * THROW_POWER_RISE + euler * (1 - G * THROW_POWER_RISE);   // D:L453514's order: pressure x dt x rate + p x (1 - dt x rate)
    }
    expect(p).toBe(euler);
    expect(p).toBeCloseTo(law(9 * G), 12);                                   // 1 - 0.89989831^9 = 0.6131
  });

  for (const [name, dt] of RATES) {
    it(`${name}: after 0.3 s held the power is the original's 0.6126`, () => {
      // 0.3 / G = 8.99085714 frames; 1 - exp(-0.1054735 x 8.99085714) = 1 - exp(-0.9482974) = 1 - 0.3874001 = 0.6126.
      // Today (the Euler step at the page's dt): 0.612574 at 30 Hz (its last, partial step Euler too), 1 - 0.95^18 =
      // 0.6028 at 60 Hz, 1 - (47/48)^43 x (1 - 3 x 0.2 / 144) = 0.5973 at 144 Hz.
      expect(law(0.3)).toBeCloseTo(0.6126, 4);
      expect(heldPower(0.3, dt)).toBeCloseTo(law(0.3), 12);
      // Stepped by hand, frame by frame, as the page's update does (no partial step: n whole page frames).
      const n = Math.round(0.3 / dt);
      let p = 0;
      for (let i = 0; i < n; i++) p = stepThrowPower(p, 1, dt).power;
      expect(p).toBeCloseTo(law(n * dt), 12);
    });
  }

  it('any split of the same time composes to the same power, rising and falling', () => {
    const rise2 = stepThrowPower(stepThrowPower(0.2, 1, 0.05).power, 1, 0.05).power;
    expect(rise2).toBeCloseTo(stepThrowPower(0.2, 1, 0.1).power, 14);
    const fall2 = stepThrowPower(stepThrowPower(0.8, 0.5, 0.05).power, 0.5, 0.05).power;
    expect(fall2).toBeCloseTo(stepThrowPower(0.8, 0.5, 0.1).power, 14);
    // The release is unchanged: the pressure at or under 0.15 of the power lets go, the power kept.
    expect(stepThrowPower(0.8, 0.12, 1 / 144)).toEqual({ power: 0.8, release: true });
  });
});

// ---- 2. the scoped kick's rise (FUN_005b9280 D:L472119-472131) -----------------------------------------------------

describe('LATER 1027 (2): the kick\'s rise peaks at the original\'s whole steps at any page rate (FUN_005b9280)', () => {
  // A record of the M4A1's standing shape: goal = 0.09 + 0.015 x 0.5 = 0.0975 rad, rate 0.5 rad/s, return 0.18 rad/s.
  // The original's step s = 0.5 x G = 0.016683615; goal / s = 5.844 -> n = 5 whole steps rise (the step that crosses
  // the goal adds nothing, D:L472125-472130): the peak 5s = 0.0834181 rad. Frame 6 is the crossing frame (state 2, no
  // pitch change); the fall from frame 7. So the rise ends (state 2) at 6G = 0.2002034 s.
  // Today at the page's step: floor(0.0975 / (0.5/60)) = 11 -> 0.0917 at 60 Hz; floor(0.0975 / (0.5/144)) = 28 ->
  // 0.0972 at 144 Hz (the row's figures).
  const REC = { rifleKick: { stand: { rate: 0.5, returnRate: 0.18, baseDist: 0.09, randomDist: 0.015 }, crouch: null, prone: null } };
  const s = 0.5 * G;

  it('30 Hz: the original\'s frames -- s, 2s .. 5s, then 5s held on the crossing frame, then the fall at 0.18 a second', () => {
    const k = new RifleKick(REC, () => 0.5);
    k.round(0, 'stand');
    let pitch = 0;
    const seen: number[] = [], states: number[] = [];
    for (let i = 0; i < 7; i++) { pitch += k.frame(G, pitch); seen.push(pitch); states.push(k.stats().state); }
    const want = [s, 2 * s, 3 * s, 4 * s, 5 * s, 5 * s, 5 * s - 0.18 * G];   // 0.0834181 - 0.0060061 = 0.0774120 last
    seen.forEach((v, i) => expect(v, `frame ${i + 1}`).toBeCloseTo(want[i]!, 12));
    expect(states).toEqual([1, 1, 1, 1, 1, 2, 2]);
  });

  for (const [name, dt] of RATES) {
    it(`${name}: the peak is 0.0834 (5 x 0.5 x G) and the rise ends within one page frame of 6 game frames`, () => {
      const k = new RifleKick(REC, () => 0.5);
      k.round(0, 'stand');
      let pitch = 0, peak = 0, end = -1;
      for (let i = 1; i <= Math.ceil(1 / dt); i++) {
        pitch += k.frame(dt, pitch);
        peak = Math.max(peak, pitch);
        if (end < 0 && k.stats().state === 2) end = i * dt;
      }
      expect(peak).toBeCloseTo(5 * s, 9);
      expect(peak).toBeCloseTo(0.0834, 4);
      // 30 Hz: frame 6, 0.2002 s; 60 Hz: frame 13, 0.2167 s; 144 Hz: frame 29, 0.2014 s.
      expect(end).toBeGreaterThanOrEqual(6 * G - 1e-9);
      expect(end).toBeLessThan(6 * G + dt);
    });
  }
});

// ---- 3. the blocked-muzzle pip's fade (FUN_00215250 D:L69706-69770) ------------------------------------------------

describe('LATER 1027 (3): the pip fades 32 a game frame at any page rate (FUN_00215250)', () => {
  // 128 -> 0 at 32 a frame: 4 game frames, 4G = 0.1334689 s (the 1/60 clock it ran on gave 4/60 = 0.0667 s).
  // Cured: 30 Hz 4 page frames (0.1335 s), 60 Hz 9 (0.15 s: 8/60 = 0.1333 is 0.14 ms short of 4G), 144 Hz 20 (0.1389 s).
  const shown = (): Reticle => {
    const r = new Reticle();                                   // set 1, the drawn size 0: an offset of 200 shows it
    for (let i = 0; i < 4; i++) r.setPip([200, 0], false, G);
    expect(r.state().pip.alpha).toBe(128);
    return r;
  };

  it('30 Hz: one step a page frame, 96, 64, 32, 0 -- the original\'s frames', () => {
    const r = shown();
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) { r.setPip(null, false, G); seen.push(r.state().pip.alpha); }
    expect(seen).toEqual([96, 64, 32, 0]);
  });

  for (const [name, dt] of RATES) {
    it(`${name}: 128 to 0 takes 133 ms of page time, within one page frame`, () => {
      const r = shown();
      let frames = 0;
      while (r.state().pip.alpha > 0 && frames < 1000) { r.setPip(null, false, dt); frames++; }
      expect(frames * dt).toBeGreaterThanOrEqual(4 * G - 1e-9);
      expect(frames * dt).toBeLessThan(4 * G + dt);
    });
  }
});

// ---- 4. the exertion's snap (FUN_00550ef0 D:L418377-418386) --------------------------------------------------------

describe('LATER 1027 (4): the exertion snaps to 0 within one game frame\'s step at any page rate (FUN_00550ef0)', () => {
  // The pull: step = -rate x dt, cur += step x (0 - cur); cur := 0 when within (step > 0.005 ? step : 0.005) of 0, the
  // original's dt a game frame. HELD_RIFLE prone: SniperDecayRate -0.2, so the original's window is 0.2 x G = 0.00667345 (0.2 x 525/15734 = 0.006673446);
  // at the page's step it was max(0.2/60, 0.005) = 0.005 at 60 Hz and max(0.2/144, 0.005) = 0.005 at 144 Hz, so an
  // exertion between 0.005 and 0.0066735 survived the pull there. Still and prone the raise is 0; from 1 the pull takes
  // it under 0.0067 in about 25 s (749 game frames).
  const prone: AccuracyInput = { stance: 'prone', velocity: [0, 0, 0], airborne: false, yawRate: 0, pitchRate: 0, zoomState: 0 };
  const window = 0.2 * TICK;

  it('the record\'s rate puts the game frame\'s window over the 0.005 floor', () => {
    expect(HELD_RIFLE.stances.prone.sniperDecay).toBe(-0.2);
    expect(window).toBeCloseTo(0.00667345, 8);
    expect(window).toBeGreaterThan(0.005);
  });

  for (const [name, dt] of RATES) {
    it(`${name}: no exertion between 0 and 0.2 x G survives an update; it reaches 0`, () => {
      const a = new Accuracy(HELD_RIFLE);
      expect(a.state().exertion).toBe(1);
      let survived = 0;
      for (let i = 0; i < Math.ceil(30 / dt) && a.state().exertion > 0; i++) {
        a.update(dt, prone);
        const e = a.state().exertion;
        if (e > 0 && e <= window) survived++;
      }
      expect(survived).toBe(0);
      expect(a.state().exertion).toBe(0);
    });
  }
});

// ---- 5. the held trigger's re-arm (THROW_REARM_UPDATES_READING; FUN_00594cf0 D:L453484-453517, D:L453633-453637) ------

describe('LATER 1027 (5): a trigger held through the throw re-arms 2 game frames after the pop at any page rate', () => {
  // The original: the pop's controller update, the fresh press's on the next, the chase's on the one after -- 2 game
  // frames, 2G = 0.0667345 s. Counted in page updates it was 2/60 = 33 ms at 60 Hz and 2/144 = 14 ms at 144 Hz. Cured:
  // the first update at which 2G of real time has passed: 30 Hz the 2nd (0.0667 s), 60 Hz the 5th (0.0833 s: 4/60 =
  // 0.06667 is 0.07 ms short of 2G), 144 Hz the 10th (0.0694 s: 9.61 page frames).
  const STILL = {
    feet: [100, 50, 200], yaw: 90, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand',
    landing: null, jumps: 0,
  };
  function rig(dt: number) {
    let hold: { clip: string; serial: number } | null = null;
    let serial = 0;
    const snapshot = (): PlaySnapshot => ({ ...STILL, ...(hold ? { hold: hold.clip, holdSerial: hold.serial } : {}) }) as unknown as PlaySnapshot;
    const g = new GrenadeThrower({ grid: () => null, snapshot, view: () => 'third' as never, online: () => false });
    g.setKit(['M67', null, null]);
    expect(g.select('M67')).toBe(true);
    const log = { started: 0, thrown: 0 };
    g.on('throwStart', (st) => { log.started++; hold = { clip: st.hold, serial: ++serial }; });
    g.on('throw', () => { log.thrown++; });
    const frame = (): void => { g.update(dt); if (g.phase() !== 'throwing') hold = null; };
    const until = (pred: () => boolean, seconds = 5): number => {
      for (let i = 1; i <= Math.ceil(seconds / dt); i++) { frame(); if (pred()) return i; }
      return -1;
    };
    return { g, log, frame, until };
  }

  for (const [name, dt] of RATES) {
    it(`${name}: the re-armed wind-up starts within one page frame after 2 game frames (67 ms) of the pop`, () => {
      const r = rig(dt);
      r.g.pull();
      const hold = Math.round(0.5 / dt);
      for (let i = 0; i < hold; i++) r.frame();
      r.g.release();
      expect(r.until(() => r.log.started === 1)).toBeGreaterThan(0);
      expect(r.until(() => r.log.thrown === 1)).toBeGreaterThan(0);     // the hand open
      expect(r.g.phase()).toBe('throwing');
      r.g.pull();                                                         // pressed in the follow-through, held
      expect(r.until(() => r.g.phase() !== 'throwing')).toBeGreaterThan(0);   // the pop's update
      const k = r.until(() => r.g.phase() === 'holding', 1);
      expect(k).toBeGreaterThan(0);
      expect(k * dt).toBeGreaterThanOrEqual(2 * G - 1e-9);
      expect(k * dt).toBeLessThan(2 * G + dt);
    });
  }
});
