// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Zar } from '@s2u/archive';
import { readSealTuning, SEAL_LOCOMOTION, SEAL_TUNING, type MotionClip, type MotionPart } from '@s2u/scene';
import { airBands, entryOf, motionOf, phaseRate, SEAL_ANIMS, SEAL_SETS, standPlay, type MotionSets, type SetName } from '../src/locomotion';
import { clipsFromPack, motionTableFromArchive, type MotionEntry } from '../src/motionTable';
import { ACTION_CLIPS, ACTION_SECONDS, HOLD_CLIPS, HOLD_SECONDS, rootY, runningJumpSpeed, stanceBody, SWAP_OVERLAY } from '../src/mover';
import { sealTuning } from '../src/physics';
import { lookHeight } from '../src/cameraRig';
import { ROOT_HEIGHT } from '../src/net/blast';

/**
 * Golden pins (TA.R3) for the walk's decoded tables: `test/golden/movement-tuning.json` (`dynamics.rdr`'s walk, jump,
 * look and camera fields) and `test/golden/movement-clips.json` (`motion.rdr` and `MOTION_P.ZAR`: the one-shots the
 * mover waits on, the kit's holds, the locomotion clips' bands and roots, the idle roots, `seal_jump`'s root by key).
 *
 * - The unit half runs with no game data: the engine's transcriptions (`SEAL_TUNING`, `SEAL_LOCOMOTION`, `ACTION_CLIPS`,
 *   `HOLD_CLIPS`, `SWAP_OVERLAY`, `STANCE`) are held to the pins, and the engine's own locomotion and camera code is run
 *   on clips built from the pinned roots: the run's clip rate 1.1265 (research 25's trace), the full strafe's 1.18
 *   (research 80 section 0), the standing jump's root top and its time (research 88 section 6.1).
 * - The disc half re-derives both pins whole from `READERC.ZAR` and `MOTION_P.ZAR` through the repository's readers and
 *   skips cleanly when the files are absent (the fixture tier).
 */

const here = dirname(fileURLToPath(import.meta.url));
const TUNING = JSON.parse(readFileSync(resolve(here, 'golden/movement-tuning.json'), 'utf8')) as {
  _source: string; dynamics: Record<string, unknown>;
};
interface OneShotPin { clip?: string; playback: number; frames: number; noInterrupt: number; looped: boolean; travel: [number, number] }
interface LocoPin {
  maxVelocity: number; from: number; to: number; lateral: boolean; playback: number; frames: number; duration: number;
  rootY0: number; travel: [number, number];
}
const CLIPS = JSON.parse(readFileSync(resolve(here, 'golden/movement-clips.json'), 'utf8')) as {
  _source: string; actions: Record<string, OneShotPin>; holds: Record<string, OneShotPin>; swapOverlay: OneShotPin;
  locomotion: Record<string, LocoPin>; idleRootY: Record<string, number>; jumpRootY: number[];
};

/** A looped clip of the pinned shape: its root from (0, y0, 0) to the pinned travel at key n - 1, straight. */
function pinnedClip(name: string, p: LocoPin): MotionClip {
  const t: number[] = [];
  for (let i = 0; i <= p.frames; i++) {
    const k = i === p.frames ? 0 : i, f = k / (p.frames - 1);
    t.push(p.travel[0] * f, p.rootY0, p.travel[1] * f);
  }
  const root: MotionPart = { index: 0, name: 'skel_root', flags: 0x1c, translations: Float32Array.from(t), rotations: Float32Array.of(0, 0, 0, 1) };
  return { name, version: 5, duration: p.duration, frameCount: p.frames, rate: 30, unknown10: -1, unknown14: 1, parts: [root] };
}

function pinnedSets(): MotionSets {
  const motions = new Map(Object.entries(CLIPS.locomotion).map(([n, p]) => [n, motionOf(pinnedClip(n, p), entryOf(n, null))]));
  return Object.fromEntries((Object.keys(SEAL_SETS) as SetName[]).map((k) => [k, SEAL_SETS[k].map((n) => motions.get(n)!)])) as MotionSets;
}

describe('movement.tables: the transcriptions held to the golden pins (unit tier, no game data)', () => {
  it('SEAL_TUNING\'s walk, jump, look and camera fields are the pinned dynamics.rdr', () => {
    const mine = Object.fromEntries(Object.keys(TUNING.dynamics).map((k) => [k, (SEAL_TUNING as unknown as Record<string, unknown>)[k]]));
    expect(mine).toEqual(TUNING.dynamics);
  });

  it('the jump\'s and the landing\'s table (physics.ts sealTuning, a second transcription the mover reads) is the same pinned dynamics.rdr', () => {
    // mover.ts takes jump_factor, gravity and land_hard_fall_rate for the jump and the landing from ./physics, and the
    // fall's gravity, the step and the slope from SEAL_TUNING: both transcriptions must be the file's.
    const t = sealTuning(null), d = TUNING.dynamics as Record<string, number>;
    expect(t.gravity).toBe(d.gravity);
    expect(t.jump_factor).toBe(d.jumpFactor);
    expect(t.land_fall_rate).toBe(d.landFallRate);
    expect(t.land_hard_fall_rate).toBe(d.landHardFallRate);
    expect(t.ground_touch_distance).toBe(d.groundTouchDistance);
    expect(t.step_height).toBe(d.stepHeight);
    expect(t.max_slope).toBeCloseTo(Math.cos((d.maxSlopeDeg! * Math.PI) / 180), 6);
    expect(runningJumpSpeed()).toBeCloseTo(d.jumpFactor! * d.gravity! * 0.4, 12);   // 79.9
  });

  it('SEAL_LOCOMOTION\'s walk bands are the pinned motion.rdr, and the stances run at them: 65/37/65/65, 14.8/13.5/15/15, 11/11/5.5/5.5', () => {
    for (const [name, p] of Object.entries(CLIPS.locomotion)) {
      const b = SEAL_LOCOMOTION.find((l) => l.clip === name);
      expect(b, name).toBeTruthy();
      expect({ maxVelocity: b!.maxVelocity, from: b!.from, to: b!.to, lateral: b!.lateral, playback: b!.playback }, name)
        .toEqual({ maxVelocity: p.maxVelocity, from: p.from, to: p.to, lateral: p.lateral, playback: p.playback });
    }
    expect(stanceBody('stand').bands).toEqual({ forward: 65, back: 37, right: 65, left: 65 });
    expect(stanceBody('crouch').bands).toEqual({ forward: 14.8, back: 13.5, right: 15, left: 15 });
    expect(stanceBody('prone').bands).toEqual({ forward: 11, back: 11, right: 5.5, left: 5.5 });
    // the Jump action's stick: each set's highest band end (FUN_005e0450), research 80 section 2.3
    expect(airBands('stand', null)).toEqual({ forward: 65, back: 37, right: 65, left: 65 });
    expect(airBands('crouch', null)).toEqual({ forward: 20, back: 20, right: 20, left: 20 });
  });

  it('ACTION_CLIPS are the pinned playback, keys, root travel and NoInterrupt -- the three transitions\' too (SEP-POP)', () => {
    expect(Object.keys(ACTION_CLIPS).sort()).toEqual(Object.keys(CLIPS.actions).sort());
    for (const [k, c] of Object.entries(ACTION_CLIPS)) {
      const p = CLIPS.actions[k]!;
      expect(SEAL_ANIMS[k as keyof typeof SEAL_ANIMS], k).toBe(p.clip);
      expect([c.playback, c.frames], k).toEqual([p.playback, p.frames]);
      expect(p.looped, k).toBe(false);
      // SEP-POP (OT.R93): FUN_00587c20's refusal of actions 17, 19 and 25 is the AI's (+0x30 IsAi, research 80 section 6f),
      // the walker's (`Walker.stanceCut` off), so the table holds motion.rdr's own for the three too
      expect(c.noInterrupt, k).toBe(p.noInterrupt);
      expect(Math.abs(c.travel[0] - p.travel[0]), k).toBeLessThan(0.05);   // the transcription keeps 0.05 (swapProne 0 for 0.02)
      expect(Math.abs(c.travel[1] - p.travel[1]), k).toBeLessThan(0.05);
    }
  });

  it('the one-shots hold playback x ((n-1)/n)^2: the jump 0.993, the landings 0.632 / 0.903, the transitions 0.603 / 0.846 / 0.945', () => {
    expect(ACTION_SECONDS.jump).toBeCloseTo(0.99275, 9);
    expect(ACTION_SECONDS.land).toBeCloseTo(0.63175, 9);
    expect(ACTION_SECONDS.landHard).toBeCloseTo(0.9025, 9);
    expect(ACTION_SECONDS.standToCrouch).toBeCloseTo(0.65 * (26 / 27) ** 2, 9);
    expect(ACTION_SECONDS.standToCrouch).toBeCloseTo(0.603, 3);
    expect(ACTION_SECONDS.crouchToProne).toBeCloseTo(0.846, 3);
    expect(ACTION_SECONDS.standToProne).toBeCloseTo(0.945, 3);
    expect(ACTION_SECONDS.launch).toBeCloseTo(2.21, 2);       // research 80 section 6b: the launch ends with its play, 2.21 s
  });

  it('HOLD_CLIPS and SWAP_OVERLAY are the pinned playback, keys, NoInterrupt and root travel (research 80 section 6e)', () => {
    expect(Object.keys(HOLD_CLIPS).sort()).toEqual(Object.keys(CLIPS.holds).sort());
    for (const [k, c] of Object.entries(HOLD_CLIPS)) {
      const p = CLIPS.holds[k]!;
      expect([c.playback, c.frames, c.noInterrupt], k).toEqual([p.playback, p.frames, p.noInterrupt]);
      expect(p.looped, k).toBe(false);
      expect(Math.abs(c.travel[0] - p.travel[0]) + Math.abs(c.travel[1] - p.travel[1]), k).toBeLessThan(0.015);
    }
    expect(HOLD_SECONDS.seal_place_claymore).toBeCloseTo(2.7 * (54 / 55) ** 2, 9);
    expect([SWAP_OVERLAY.playback, SWAP_OVERLAY.frames]).toEqual([CLIPS.swapOverlay.playback, CLIPS.swapOverlay.frames]);
    expect(SEAL_ANIMS.swapMoving).toBe(CLIPS.swapOverlay.clip);
  });

  it('on the pinned roots the full run plays seal_run at 1.1265 and the full strafe seal_run_90r at 1.1827, each root at its band', () => {
    const s = pinnedSets();
    const [run] = standPlay(1, 0, s);
    expect(run!.motion.name).toBe('seal_run');
    expect(run!.speed).toBeCloseTo(1.1265, 3);                // research 25's traced node +0x24
    expect((run!.speed * run!.motion.travel) / run!.motion.period).toBeCloseTo(65, 6);
    const [side] = standPlay(0, 1, s);
    expect(side!.motion.name).toBe('seal_run_90r');
    expect(side!.speed).toBeCloseTo(1.1827, 3);               // research 88 section 6.1: 1.183
    const [left] = standPlay(0, -1, s);
    expect(left!.motion.name).toBe('seal_run_90l');
    const [back] = standPlay(-1, 0, s);
    expect(back!.motion.name).toBe('seal_run_bw');
    expect((back!.speed * back!.motion.travel) / back!.motion.period).toBeCloseTo(37, 6);
    // a 0.3 stick aside (19.5 a second) splits the slow and the fast strafe, both at 19.5 (research 80 section 8)
    const slow = standPlay(0, 0.3, s);
    expect(slow.map((n) => n.motion.name)).toEqual(['seal_rstrafe', 'seal_rstrafe_fast']);
    for (const n of slow) expect((n.speed * n.motion.travel) / n.motion.period).toBeCloseTo(19.5, 6);
  });

  it('seal_jump\'s root tops at 15.078 on key 12, 0.627 s into the play; the camera\'s target then 25.078 over the feet', () => {
    const y = CLIPS.jumpRootY;
    expect(y.length).toBe(CLIPS.actions.jump!.frames);
    const top = y.indexOf(Math.max(...y));
    expect(top).toBe(12);
    expect(y[top]).toBeCloseTo(15.078, 3);
    expect(y[0]).toBeCloseTo(10.508, 3);
    const t: number[] = [];
    for (const v of [...y, y[0]!]) t.push(0, v, 0);
    const clip: MotionClip = {
      name: 'seal_jump', version: 5, duration: 20 / 30, frameCount: y.length, rate: 30, unknown10: -1, unknown14: 1,
      parts: [{ index: 0, name: 'skel_root', flags: 0x1c, translations: Float32Array.from(t), rotations: Float32Array.of(0, 0, 0, 1) }],
    };
    const entry: MotionEntry = {
      looped: false, playback: CLIPS.actions.jump!.playback, maxVelocity: -1, blendTime: null, transitionA: null, transitionB: null,
      noInterrupt: CLIPS.actions.jump!.noInterrupt, callbacks: [],
    };
    const m = motionOf(clip, entry);
    const rate = phaseRate([{ motion: m, weight: 1, speed: 1, offset: 0 }]);   // FUN_0028c4f0
    expect(top / y.length / rate).toBeCloseTo(0.627, 3);
    expect(lookHeight(y[top]!)).toBeCloseTo(25.078, 3);       // FUN_0029a950 on the posed root: + 10 at the ramp's top
  });

  it('the idle roots: STANCE stands on seal_stand\'s 11.484 and seal_crouch\'s 5.504; a run lowers the camera\'s target to 20.305', () => {
    expect(rootY('stand')).toBeCloseTo(CLIPS.idleRootY.seal_stand!, 3);
    expect(rootY('crouch')).toBeCloseTo(CLIPS.idleRootY.seal_crouch!, 3);
    expect(ROOT_HEIGHT.stand).toBeCloseTo(CLIPS.idleRootY.seal_stand!, 2);
    expect(ROOT_HEIGHT.crouch).toBeCloseTo(CLIPS.idleRootY.seal_crouch!, 2);
    expect(ROOT_HEIGHT.prone).toBeCloseTo(CLIPS.idleRootY.seal_prone!, 2);
    expect(lookHeight(rootY('stand'))).toBeCloseTo(21.484, 3);
    expect(lookHeight(rootY('crouch'))).toBeCloseTo(15.378, 3);
    expect(lookHeight(CLIPS.locomotion.seal_run!.rootY0)).toBeCloseTo(20.305, 3);   // research 88 section 6.1
    expect(lookHeight(CLIPS.idleRootY.seal_prone!)).toBeCloseTo(7.668, 3);           // research 88 section 4 item 3
  });

  // Research 88 section 4 item 3's drift (the mover's prone root 1.8 against seal_prone's 2.168), closed by PF-21
  // (research 180 s1.2, research 217 s4): with no posed root -- the page before the pack, and the match server's shot
  // cone (`net/shotCone.ts` reads `rootY(posture)`) -- the mover's STANCE.prone.rootY is seal_prone's own, `PRONE_ROOT`.
  it('with no posed root the prone camera stands on seal_prone\'s 2.168 (research 180 s1.2; was the drift of research 88 section 4 item 3)', () => {
    expect(rootY('prone')).toBeCloseTo(CLIPS.idleRootY.seal_prone!, 3);
    expect(lookHeight(rootY('prone'))).toBeCloseTo(7.668, 3);
  });
});

// ---- the disc half: the pins re-derived from the files (fixture tier) ------------------------------------------------

const RUN = resolve(process.env.S2U_TEST_FIXTURES || resolve(here, '../../../test-fixtures'), 'RUN');
const READERC = resolve(RUN, 'READERC.ZAR'), PACK = resolve(RUN, 'MOTION_P.ZAR');
const noDisc = !existsSync(READERC) || !existsSync(PACK);
const round = (x: number, d: number): number => Math.round(x * 10 ** d) / 10 ** d + 0;

describe.skipIf(noDisc)(`movement.tables: the golden pins re-derived from READERC.ZAR and MOTION_P.ZAR${noDisc ? ' (data absent)' : ''}`, () => {
  it('movement-tuning.json is dynamics.rdr through readSealTuning, field for field', () => {
    const { dynamics } = readSealTuning(new Uint8Array(readFileSync(READERC)));
    const read = Object.fromEntries(Object.keys(TUNING.dynamics).map((k) => [k, (dynamics as unknown as Record<string, unknown>)[k]]));
    expect(read).toEqual(TUNING.dynamics);
  });

  it('movement-tuning.json against dynamics.rdr decoded here byte by byte, not through parseRdr or readSealTuning: each field as the file stores it (f32)', () => {
    // An independent decode (only the ZAR container is the repository's): research 36 section 6's layout -- a 12-byte head
    // {version 1, string table size, node array offset}, the strings, 8-byte nodes {u32 type:8 .. length:16; u32 value}.
    // A key is a string node (type 3) followed by a list node (type 4) whose children are floats (2) or ints (1). The
    // reader's metre fields (M_SCALE, x 10 to units) are divided back here, so the comparison is the file's own f32.
    const zar = Zar.parse(new Uint8Array(readFileSync(READERC)));
    const b = zar.data(zar.root.children.find((c) => c.name.toLowerCase() === 'dynamics.rdr')!);
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    expect(dv.getUint32(0, true)).toBe(1);
    const strings = dv.getUint32(4, true), nodes = dv.getUint32(8, true);
    const text = (o: number): string => { let e = 12 + o; while (b[e]) e++; return String.fromCharCode(...b.subarray(12 + o, e)); };
    const raw: Record<string, number[]> = {};
    for (let p = nodes; p + 16 <= b.length; p += 8) {
      if ((dv.getUint32(p, true) & 0xff) !== 3 || dv.getUint32(p + 4, true) >= strings) continue;
      const list = dv.getUint32(p + 8, true), at = dv.getUint32(p + 12, true);
      if ((list & 0xff) !== 4) continue;
      const vals: number[] = [];
      for (let i = 0; i < list >>> 16; i++) {
        const q = nodes + at + 8 * i, type = dv.getUint32(q, true) & 0xff;
        if (type === 2) vals.push(dv.getFloat32(q + 4, true)); else if (type === 1) vals.push(dv.getInt32(q + 4, true));
      }
      if (vals.length) raw[text(dv.getUint32(p + 4, true))] = vals;
    }
    const keys: Record<string, [string[], number]> = {
      gravity: [['gravity'], 1], jumpFactor: [['jump_factor'], 1], groundTouchDistance: [['ground_touch_distance'], 1],
      maxSlopeDeg: [['max_slope'], 1], stepHeight: [['step_height'], 1],
      accelX: [['lower_x_accel', 'upper_x_accel'], 1], accelZ: [['lower_z_accel', 'upper_z_accel'], 1],
      turnMaxRate: [['turn_maxrate'], 1], pitchRate: [['pitch_rate'], 1],
      turnThrottle: [['turn_throttle_a', 'turn_throttle_b'], 1], pitchThrottle: [['pitch_throttle_a', 'pitch_throttle_b'], 1],
      aimPitch: [['min_aim_pitch', 'max_aim_pitch'], 1], proneAimPitch: [['prone_min_aim_pitch', 'prone_max_aim_pitch'], 1],
      initAimPitch: [['init_aim_pitch'], 1], aimYaw: [['max_aim_yaw'], 1], proneAimYaw: [['prone_max_aim_yaw'], 1],
      landFallRate: [['land_fall_rate'], 1], landHardFallRate: [['land_hard_fall_rate'], 1],
      fallingDamage: [['FALLING_DAMAGE_LIGHT', 'FALLING_DAMAGE_HEAVY', 'FALLING_DAMAGE_DEATH'], 10],
      climbHeights: [['low_climb_height', 'med_climb_height', 'high_climb_height'], 10],
      peekDecayRate: [['cam_peek_decay_rate'], 1],
    };
    const bob: Record<string, string> = { walkAmplitude: 'Walk_Amplitude', walkRate: 'Walk_Rate', crawlAmplitude: 'Crawl_Amplitude', crawlRate: 'Crawl_Rate' };
    expect(Object.keys(TUNING.dynamics).sort()).toEqual([...Object.keys(keys), 'bobbing'].sort());
    for (const [field, [names, scale]] of Object.entries(keys)) {
      const pin = TUNING.dynamics[field] as number | number[];
      const pins = Array.isArray(pin) ? pin : [pin];
      expect(names.map((n) => raw[n]?.[0]), field).toEqual(pins.map((v) => Math.fround(v / scale)));
    }
    const pinnedBob = TUNING.dynamics.bobbing as Record<string, number>;
    for (const [field, name] of Object.entries(bob)) expect(raw[name], field).toEqual([Math.fround(pinnedBob[field]!)]);
  });

  it('movement-clips.json is motion.rdr and MOTION_P.ZAR through motionTableFromArchive and clipsFromPack, whole', () => {
    const readerc = new Uint8Array(readFileSync(READERC)), pack = new Uint8Array(readFileSync(PACK));
    const table = motionTableFromArchive(readerc)!;
    const { locomotion } = readSealTuning(readerc);
    const root = (n: string): { c: MotionClip; t: Float32Array } => {
      const [c] = clipsFromPack(pack, [n]);
      expect(c, n).toBeTruthy();
      return { c: c!, t: c!.parts.find((p) => p.name === 'skel_root')?.translations ?? new Float32Array(3) };
    };
    const oneShot = (n: string): OneShotPin => {
      const { c, t } = root(n);
      const e = table.get(n)!, L = 3 * (c.frameCount - 1);
      return {
        clip: n, playback: e.playback!, frames: c.frameCount, noInterrupt: e.noInterrupt ?? 0, looped: e.looped === true,
        travel: t.length > 3 ? [round(t[L]! - t[0]!, 2), round(t[L + 2]! - t[2]!, 2)] : [0, 0],
      };
    };
    const actions = Object.fromEntries(Object.keys(CLIPS.actions).map((k) => [k, oneShot(SEAL_ANIMS[k as keyof typeof SEAL_ANIMS])]));
    const holds = Object.fromEntries(Object.keys(CLIPS.holds).map((n) => { const { clip: _, ...rest } = oneShot(n); return [n, rest]; }));
    const loco = Object.fromEntries(Object.keys(CLIPS.locomotion).map((n) => {
      const b = locomotion.find((l) => l.clip === n)!, { c, t } = root(n), L = 3 * (c.frameCount - 1);
      return [n, {
        maxVelocity: round(b.maxVelocity, 4), from: round(b.from, 4), to: round(b.to, 4), lateral: b.lateral, playback: b.playback,
        frames: c.frameCount, duration: round(c.duration, 6), rootY0: round(t[1]!, 4), travel: [round(t[L]! - t[0]!, 4), round(t[L + 2]! - t[2]!, 4)],
      }];
    }));
    const jump = root('seal_jump');
    const { _source, ...pinned } = CLIPS;
    expect(_source).toMatch(/^disc RUN\/READERC\.ZAR/);
    expect({
      actions, holds, swapOverlay: oneShot(SEAL_ANIMS.swapMoving), locomotion: loco,
      idleRootY: Object.fromEntries(['seal_stand', 'seal_crouch', 'seal_prone'].map((n) => [n, round(root(n).t[1]!, 4)])),
      jumpRootY: Array.from({ length: jump.c.frameCount }, (_, i) => round(jump.t[3 * i + 1]!, 4)),
    }).toEqual(pinned);
  });
});
