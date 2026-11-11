import { describe, expect, it } from 'vitest';
import { HELD_RIFLE } from '@s2u/scene';
import { Button, cameraLook, rootY, ShotCone, TICK_HZ, type AimMover, type Command, type ShotVerdict, type Stance } from '../../viewer/src/sim';
import { startLines, type StartBody } from '../../viewer/src/net/startLine';
import { clipsFromPack, motionTableFromArchive } from '../../viewer/src/motionTable';
import { simSkeletonsFromBytes, type SimSkeleton } from '../../viewer/src/simMap';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { CROUCH_WALK, hitPoseRoom, PAGE_CLIPS, type V3 } from './helpers/hitPoseRoom';

/**
 * JUMP-AIM-ROOT (the ghost-bullet report on live v0.4.18, game 4180; research 80 s7, 2026-11-11; reading, pending
 * review): a crouched body's standing jump. The original plays `seal_jump` from a crouch with the stance kept (research
 * 80 s0: "crouched can (the same `Jump` clip, the stance kept)"), and its camera reads the posed skeleton root
 * (`FUN_0029a950` through `FUN_002869d0`), which `seal_jump` lifts to 15.08 (research 80 s0, key 12); the page's camera
 * rides its animator's posed root the same way (`play.ts` `setPosedRoot`, `walk.ts`). The room's aim frame stood on the
 * crouch's measured root (5.504) with `ROOT_POSE_SLACK_PLACEHOLDER`'s 4 u, so the shooter's risen eye was refused 'eye'
 * and the round dropped silently: MP6, room seat 3, ticks 23117, 23126 and 23133 (`cone: eye`), 23142 (`cone: cone`,
 * after the body popped to stand: LATER 873).
 *
 * The fixture is the four recorded claims (agent-mail `evidence/ghost-bullets/awshost3-game4180-refusals-0655-0745Z.txt`:
 * each claim's eye and aim, the body's feet), moved from the recorded feet to the test body's (the eye's offset from the
 * feet kept), and fired at the room commands whose jump clock is the recorded one (the replay's snapshots: `jump#50`
 * from t23098 at 0.050 s; 0.350, 0.500, 0.617 and 0.750 s at the claims). The test body's look is the claim's aim (its
 * yaw and pitch: the cone's centre, as the investigation's re-run held it), crouched and still, as recorded. Unit-test
 * evidence only (the fixture disc's MP2, `MOTION_P.ZAR`, `READERC.ZAR`); the room is `hitPoseRoom`'s flat floor.
 */

const MP2 = fixture('RUN/MP2.ZDB'), PACK = fixture('RUN/MOTION_P.ZAR'), READERC = fixture('RUN/READERC.ZAR');

/** The recorded body's feet at every claim (the refusal lines' `feet`; the body did not move through the jump). */
const RECORDED_FEET: V3 = [1520.244451115722, 40, 1535.3669062687302];
/** The four recorded claims: the room tick of the refusal, the jump's clock at the claim, the verdict at v0.4.18. */
const CLAIMS: readonly { tick: number; seq: number; actionT: number; recorded: ShotVerdict; eye: V3; aim: V3 }[] = [
  { tick: 23117, seq: 18494, actionT: 0.35, recorded: 'eye', eye: [1506.309520016326, 60.4611923012036, 1560.4510397297884], aim: [0.47977794012751923, 0.0040942545633424225, -0.8773803993972996] },
  { tick: 23126, seq: 18502, actionT: 0.5, recorded: 'eye', eye: [1506.3093528397928, 61.21591182129446, 1560.4513406631286], aim: [0.4824763971392453, 0.004733216067411448, -0.8758961827004342] },
  { tick: 23133, seq: 18510, actionT: 0.617, recorded: 'eye', eye: [1506.309204821291, 64.62605542083917, 1560.4516071102275], aim: [0.4950845869354654, 0.004062086724802779, -0.8688352842917808] },
  { tick: 23142, seq: 18518, actionT: 0.75, recorded: 'cone', eye: [1506.3090737653556, 64.21862292897148, 1560.4518430231255], aim: [0.4966194395324796, 0.026638253426943467, -0.8675595286392788] },
];
/** `seal_jump`'s highest skeleton root over the feet (research 80 s0: 10.51 to 15.08 at key 12). */
const SEAL_JUMP_ROOT_TOP = 15.08;
/** The look (degrees) whose ray is `aim`: the yaw from -z toward -x, the pitch up (`faceToward`'s convention). */
const lookOf = (aim: V3): { yaw: number; pitch: number } => ({
  yaw: ((Math.atan2(-aim[0], -aim[2]) * 180) / Math.PI + 360) % 360,
  pitch: (Math.asin(Math.max(-1, Math.min(1, aim[1]))) * 180) / Math.PI,
});
/** The recorded body's look through the jump (the replay's snapshots: yaw 330.9, pitch 0.27). */
const RECORDED_LOOK = { yaw: 330.9, pitch: 0.27 };
/** The control grid: the claim's eye raised by each of these (units) over the room's own camera eye of the frame. */
const GRID_DY = [-12, -9, -6, -3, 0, 3, 6, 9, 12];

/**
 * The control grids' verdicts at the base's room (82df77acff, v0.4.19's aeffb089aa source; the seat-box probe jr-2): a standing jump
 * and a still crouch keep them, verdict for verdict (`Object.is`).
 */
const PINNED: Record<string, readonly ShotVerdict[]> = {
  'stand jump 0.35': ['eye', 'eye', 'eye', null, null, null, 'eye', 'eye', 'eye'],
  'stand jump 0.617': ['eye', 'eye', 'eye', null, null, null, 'eye', 'eye', 'eye'],
  'crouch still': ['eye', 'eye', 'eye', null, null, null, 'eye', 'eye', 'eye'],
  'stand still': ['eye', 'eye', 'eye', null, null, null, 'eye', 'eye', 'eye'],
  'traversal ease-down': ['eye', 'eye', 'eye', null, null, null, 'eye', 'eye', 'eye'],
};

/**
 * JUMP-AIM-ROOT FOLD: shadow's capture of the original (PCSX2 r0004, PINE reads, one client offline, 2026-11-11; the EPH
 * script `tools/eph/scripts/ghost-crouch-jump-fire.txt` on `agent/ghost-bullet` 075c154f4; the gate-runner's
 * `shadow/out/2026-11-11/ghost-bullet/probe1/probe.csv`, case `ghost-crouch-jump-fire`, 3/3 trials identical): a SEAL
 * crouched and still ~1.5 s, Square (the jump) pressed once, R1 held. The posed root over the feet (`rootY`, actor+0x2e8's
 * node y) at each 30 Hz game frame from the first frame the action reads `Jump` (actionId 18, the crouch idle, -> 178;
 * trials 2 and 3 -- trial 1 sampled the same curve one frame later), the stance kept crouched throughout (stanceRequest 1,
 * posture 1), the feet on the floor (airborne 0, y unchanged); the action back to 18 at frame 30, the root eased back to
 * the crouch idle's 5.504 by frame 44. Decoded values, three decimals, as the probe wrote them.
 */
const CAPTURE_CROUCH_JUMP_ROOT: readonly number[] = [
  5.613, 5.94, 6.487, 7.255, 8.235, 9.133, 9.816, 10.282, 10.532, 10.604, 10.655, 10.733, 10.981, 11.42, 12.404,
  13.408, 14.341, 14.812, 15.059, 14.97, 14.687, 14.254, 13.296, 12.318, 11.32, 11.254, 11.249, 11.256, 11.258, 11.258,
  11.207, 11.053, 10.797, 10.438, 9.977, 9.413, 8.747, 8.004, 7.34, 6.777, 6.318, 5.96, 5.706, 5.554, 5.504,
];
/** The capture's first frame whose action is the crouch idle again (actionId 18), trials 2 and 3. */
const CAPTURE_CLIP_END_FRAME = 30;
/** The capture's crouch idle root, before the press and after the ease-down (frames -2, -1 and 44 on). */
const CAPTURE_CROUCH_ROOT = 5.504;
/**
 * The room tick (counting the press's as 1) of capture frame `k`: frame k is the game's frame (k + 1) / 30 s into the
 * clip (its first frame already one frame of `seal_jump` played: playPhase 0.0319, 1/30 s of the clip), and the room's
 * jump clock (`Walker.action.t`) reads 1/60 s at the press's tick, so (k + 1) / 30 s is the room's tick 2k + 2.
 */
const tickOfFrame = (k: number): number => 2 * k + 2;
/**
 * The tolerance: one capture frame either way in time (the room's root at frame k's tick within the capture's frames
 * k - 1 .. k + 1; the crouch root outside the series), plus 0.01 u. Why: the capture's own timing is known to a frame --
 * trial 1 sampled the same curve one frame later than trials 2 and 3 (the probe's read straddles the game's update) --
 * and its values are written to 0.001 u. Not a fit: nothing in the room is tuned to it; the per-frame differences are
 * logged (research 80 s7's table).
 */
const CAPTURE_VALUE_SLACK = 0.01;
const captureAt = (k: number): number => (k < 0 || k >= CAPTURE_CROUCH_JUMP_ROOT.length ? CAPTURE_CROUCH_ROOT : CAPTURE_CROUCH_JUMP_ROOT[k]!);

describe.skipIf(!MP2 || !PACK || !READERC)(`JUMP-AIM-ROOT: a crouched jump's eye rides the jump clip's root${MP2 && PACK && READERC ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const skeletons = MP2 && PACK && READERC ? simSkeletonsFromBytes(MP2, READERC, PACK) : { seal: [], terrorist: [], escortees: [] };
  const clips = PACK ? clipsFromPack(PACK, PAGE_CLIPS) : [];
  const table = READERC ? motionTableFromArchive(READERC) : null;
  const seal = (): SimSkeleton => skeletons.seal[0]!;

  /** B (the shooter) still at the recorded look, in `stance`, then (`jump`) its jump pressed; the room and its helpers. */
  const shooter = (stance: 'stand' | 'crouch', jump: boolean) => {
    const t = hitPoseRoom(seal(), clips, table);
    const b = () => t.room.player(2)!;
    t.hold(RECORDED_LOOK);
    t.run(60);
    if (stance === 'crouch') { t.press('crouch'); t.run(60); }
    expect(b().sim.walker.posture).toBe(stance);
    expect(b().sim.walker.action).toBeNull();
    if (jump) {
      t.run(1, { buttons: Button.Jump });
      expect(b().sim.walker.action?.name).toBe('jump');
      expect(b().sim.walker.posture).toBe(stance);                       // research 80 s0: the stance kept
    }
    /** Runs to the command whose jump clock is `at` (seconds; or `ticks` more without one) and returns its seq. */
    const until = (at: number): number => {
      const w = b().sim.walker;
      while ((w.action?.t ?? Infinity) + 1 / TICK_HZ < at - 1e-6) t.run(1);
      t.run(1);
      return b().sim.seq;
    };
    return { t, b, until };
  };

  /** A recorded claim moved to the room body's feet at command `seq`'s frame (the eye's offset from the feet kept). */
  const moved = (feet: readonly number[], c: { eye: V3; aim: V3 }) => {
    const eye: V3 = [0, 1, 2].map((k) => c.eye[k]! - RECORDED_FEET[k]! + feet[k]!) as V3;
    return { eye, aim: c.aim, from: eye, dir: c.aim };
  };

  /** The grid of verdicts at command `seq`: the room's camera eye of its own frame raised by each `GRID_DY`, its look. */
  const grid = (t: ReturnType<typeof hitPoseRoom>, seq: number): ShotVerdict[] => {
    const cone = t.room.player(2)!.cone, f = cone.frame(seq)!;
    const { eye, look } = cameraLook(f);
    return GRID_DY.map((dy) => {
      const e: V3 = [eye[0], eye[1] + dy, eye[2]];
      return cone.check(seq, { eye: e, aim: look, from: e, dir: look });
    });
  };

  it('the four recorded claims of game 4180 (MP6, seat 3): the three refused "eye" at the crouch root are taken at the jump clip\'s root', () => {
    const { t, b, until } = shooter('crouch', true);
    const out: { tick: number; verdict: ShotVerdict; root: number | null; posed: number | null; actionT: number }[] = [];
    for (const c of CLAIMS) {
      // The look is the claim's aim from the command before the claim's: its frame and the one after blend about it.
      const w = b().sim.walker;
      while ((w.action?.t ?? Infinity) + 2 / TICK_HZ < c.actionT - 1e-6) t.run(1);
      t.hold(lookOf(c.aim));
      const seq = until(c.actionT);
      const actionT = w.action?.t ?? NaN;
      const posed = t.pageRoot();
      t.run(1);                                                            // the command after: the room decides then
      const f = b().cone.frame(seq)!;
      expect(f.posture).toBe('crouch');
      const verdict = b().cone.check(seq, moved(f.feet, c));
      out.push({ tick: c.tick, verdict, root: f.moveRoot, posed, actionT });
      console.log(`  Tests (jump-aim) claim t${c.tick} recorded ${c.recorded} actionT ${actionT.toFixed(3)} frame root ${f.moveRoot?.toFixed(3) ?? 'null'} page root ${posed?.toFixed(3) ?? 'null'} verdict ${verdict}`);
      t.hold(RECORDED_LOOK);
    }
    // RED at the base: 'eye' for the first three (the room's frame at the crouch root, moveRoot null).
    for (const o of out.slice(0, 3)) expect(o.verdict, `claim t${o.tick} at actionT ${o.actionT.toFixed(3)}`).toBeNull();
    // The fourth: the room here keeps the jump to its end (no pop to stand, LATER 873), so its claim is met on the jump's root.
    expect(out[3]!.verdict, `claim t${out[3]!.tick}`).toBeNull();
  });

  it('A = B: the room\'s aim root through a crouched jump is the page\'s Animator\'s posed root of the tick before the command (HIT-POSE\'s copy, within 1e-6 u)', () => {
    const { t, b } = shooter('crouch', true);
    let n = 0, worst = 0, step = 0, last: number | null = null;
    while (b().sim.walker.action?.name === 'jump') {
      const before = t.pageRoot();
      t.run(1);
      const f = b().cone.frame(b().sim.seq)!;
      if (b().sim.walker.action?.name !== 'jump') break;
      expect(before).not.toBeNull();
      expect(f.moveRoot, `tick ${n}`).not.toBeNull();
      worst = Math.max(worst, Math.abs(f.moveRoot! - before!));
      expect(Math.abs(f.moveRoot! - before!), `tick ${n}`).toBeLessThanOrEqual(1e-6);
      expect(f.moveRoot!).toBeLessThanOrEqual(SEAL_JUMP_ROOT_TOP + 0.01);        // the clip's own root, never above it
      if (last !== null) step = Math.max(step, Math.abs(f.moveRoot! - last));
      last = f.moveRoot!;
      n++;
    }
    expect(n).toBeGreaterThan(50);
    console.log(`  Tests (jump-aim) A = B over ${n} jump commands, the largest difference ${worst.toExponential(2)} u; the root's largest step a tick ${step.toFixed(3)} u`);
  });

  it('control: a crouched jump\'s claimed eye 12 u over the camera eye at seal_jump\'s top root stays refused "eye"', () => {
    const { t, b, until } = shooter('crouch', true);
    for (const at of [0.35, 0.617, 0.75]) {
      const seq = until(at);
      t.run(1);
      const f = b().cone.frame(seq)!;
      const { eye, look } = cameraLook({ ...f, moveRoot: SEAL_JUMP_ROOT_TOP });
      const e: V3 = [eye[0], eye[1] + 12, eye[2]];
      expect(b().cone.check(seq, { eye: e, aim: look, from: e, dir: look }), `actionT ${at}`).toBe('eye');
    }
  });

  it(`the fourth claim (t23142) as recorded -- the jump cut to stand on the command after it (LATER 873): no longer "eye" at the jump's posed root; its cone verdict logged`, () => {
    // The room's walker here keeps the jump to its end, so the pop is rebuilt on a ShotCone alone (the investigation's
    // re-run: the held rifle at rest, the claim's look): the claim's command and the two before it crouched in the jump at
    // the posed root the room's test above reads at 0.750 s (14.275; null at the base), the command after it stood.
    const c = CLAIMS[3]!, look = lookOf(c.aim), feet = RECORDED_FEET;
    const verdictAt = (root: number | null): ShotVerdict => {
      const cone = new ShotCone(HELD_RIFLE);
      const body = (posture: Stance, moveRoot: number | null): AimMover => ({ feet, velocity: [0, 0, 0], airborne: false, posture, stance: posture, moveRoot, peek: 0, weapon: 0 });
      const cmd = (seq: number): Command => ({ seq, forward: 0, right: 0, yaw: look.yaw, pitch: look.pitch, turn: 0, buttons: 0, stance: 0, weapon: 0 });
      for (let k = -3; k <= 0; k++) cone.tick(cmd(c.seq + k), body('crouch', root), 1000 + k);
      cone.tick(cmd(c.seq + 1), body('stand', null), 1001);
      return cone.check(c.seq, { eye: c.eye, aim: c.aim, from: c.eye, dir: c.aim });
    };
    const base = verdictAt(null), head = verdictAt(14.275);
    console.log(`  Tests (jump-aim) the fourth claim rebuilt with the pop: crouch root ${base}, the jump's posed root ${head}`);
    expect(head).not.toBe('eye');
  });

  it('controls: a standing jump and a still crouch keep their verdicts on the claim grid (Object.is against the base\'s)', () => {
    const cases: [string, 'stand' | 'crouch', boolean, number][] = [
      ['stand jump 0.35', 'stand', true, 0.35], ['stand jump 0.617', 'stand', true, 0.617],
      ['crouch still', 'crouch', false, 0], ['stand still', 'stand', false, 0],
    ];
    const got = new Map<string, ShotVerdict[]>();
    for (const [label, stance, jump, at] of cases) {
      const { t, b, until } = shooter(stance, jump);
      const seq = jump ? until(at) : (t.run(1), b().sim.seq);
      t.run(1);
      expect(b().cone.frame(seq)!.moveRoot, label).toBeNull();          // the stance's measured root stands in, as before
      got.set(label, grid(t, seq));
      console.log(`  Tests (jump-aim grid) ${label}: ${JSON.stringify(got.get(label))}`);
    }
    for (const [label] of cases) {
      const pin = PINNED[label], g = got.get(label)!;
      expect(pin, `${label}: pinned`).toBeDefined();
      expect(g.length).toBe(pin!.length);
      g.forEach((v, i) => expect(Object.is(v, pin![i]), `${label} dy ${GRID_DY[i]}: ${v} vs ${pin![i]}`).toBe(true));
    }
  });

  /** The room's aim root for B's next command (`Room.aimRootOf`) and B's start body (`Room.startBody`), read directly. */
  type RoomRoots = { aimRootOf(p: unknown): number | null; startBody(p: unknown): StartBody };
  const roots = (t: ReturnType<typeof hitPoseRoom>): RoomRoots => t.room as unknown as RoomRoots;

  it('the capture of the original (shadow, r0004, 3/3): the room\'s aim root over a crouched jump follows the posed root\'s rise, peak and ease-down within a frame', () => {
    const { t, b } = shooter('crouch', true);
    let tick = 1, worst = 0, peak = -Infinity, peakTick = 0, endTick = -1;
    const rows: string[] = [];
    for (let k = 0; k < CAPTURE_CROUCH_JUMP_ROOT.length; k++) {
      while (tick < tickOfFrame(k)) {
        t.run(1); tick++;
        if (endTick < 0 && b().sim.walker.action === null) endTick = tick;
      }
      const w = b().sim.walker;
      expect(w.posture, `frame ${k}`).toBe('crouch');                         // the capture: the stance kept, no pop
      const ours = roots(t).aimRootOf(b()) ?? rootY('crouch');
      const lo = Math.min(captureAt(k - 1), captureAt(k), captureAt(k + 1)) - CAPTURE_VALUE_SLACK;
      const hi = Math.max(captureAt(k - 1), captureAt(k), captureAt(k + 1)) + CAPTURE_VALUE_SLACK;
      worst = Math.max(worst, Math.abs(ours - captureAt(k)));
      if (ours > peak) { peak = ours; peakTick = tick; }
      rows.push(`f${k} +${(((k + 1) * 1000) / 30).toFixed(0)}ms capture ${captureAt(k).toFixed(3)} room ${ours.toFixed(3)} d ${(ours - captureAt(k)).toFixed(3)}`);
      expect(ours, `frame ${k} (room tick ${tick}, ${w.action?.name ?? 'no action'}): ${ours.toFixed(3)} outside the capture's ${lo.toFixed(3)}..${hi.toFixed(3)}`).toBeGreaterThanOrEqual(lo);
      expect(ours, `frame ${k} (room tick ${tick}, ${w.action?.name ?? 'no action'})`).toBeLessThanOrEqual(hi);
    }
    for (let i = 0; i < rows.length; i += 5) console.log(`  Tests (jump-aim capture) ${rows.slice(i, i + 5).join(' | ')}`);
    console.log(`  Tests (jump-aim capture) peak ${peak.toFixed(3)} at room tick ${peakTick} (capture 15.059 at frame 18, tick ${tickOfFrame(18)}); the jump's end at tick ${endTick} (capture: frame ${CAPTURE_CLIP_END_FRAME}, tick ${tickOfFrame(CAPTURE_CLIP_END_FRAME)}); the largest difference at the same frame ${worst.toFixed(3)} u`);
    expect(Math.abs(peak - 15.059)).toBeLessThanOrEqual(CAPTURE_VALUE_SLACK);
    expect(Math.abs(endTick - tickOfFrame(CAPTURE_CLIP_END_FRAME))).toBeLessThanOrEqual(2);
  });

  it('the capture\'s post-clip roots (frames 30-34, the ease-down, the action the crouch idle\'s again): a claim from the camera on each is taken', () => {
    const { t, b } = shooter('crouch', true);
    let tick = 1;
    const out: string[] = [];
    for (let k = CAPTURE_CLIP_END_FRAME; k <= CAPTURE_CLIP_END_FRAME + 4; k++) {
      while (tick < tickOfFrame(k)) { t.run(1); tick++; }
      t.run(1); tick++;                                                     // the command at frame k's instant
      const seq = b().sim.seq;
      expect(b().sim.walker.action, `frame ${k}`).toBeNull();
      expect(b().sim.walker.posture).toBe('crouch');
      t.run(1); tick++;                                                     // the command after: the room decides then
      const f = b().cone.frame(seq)!;
      const { eye, look } = cameraLook({ ...f, moveRoot: CAPTURE_CROUCH_JUMP_ROOT[k]! });
      const verdict = b().cone.check(seq, { eye, aim: look, from: eye, dir: look });
      out.push(`f${k} capture root ${CAPTURE_CROUCH_JUMP_ROOT[k]!.toFixed(3)} frame root ${f.moveRoot?.toFixed(3) ?? 'null'} verdict ${verdict}`);
    }
    console.log(`  Tests (jump-aim ease-down) ${out.join(' | ')}`);
    for (const o of out) expect(o.endsWith('verdict null'), o).toBe(true);
  });

  it('the room\'s start body stands on its aim frame\'s root -- the page copy\'s posed root -- through the jump and the ease-down (one source with the page\'s, OT.R80)', () => {
    const { t, b } = shooter('crouch', true);
    const hull = t.room.map.grid;
    let n = 0, raised = 0;
    for (let i = 0; i < 100; i++) {
      const posed = t.pageRoot();
      const body = roots(t).startBody(b());
      expect(body.moveRoot, `tick ${i}`).toBe(roots(t).aimRootOf(b()));
      const w = b().sim.walker;
      if (posed !== null && (w.action?.name === 'jump' || posed > rootY('crouch'))) {
        expect(body.moveRoot, `tick ${i}`).not.toBeNull();
        expect(Math.abs(body.moveRoot! - posed), `tick ${i}`).toBeLessThanOrEqual(1e-6);
        expect(startLines(hull, body).head).toEqual(startLines(hull, { ...body, moveRoot: posed }).head);
        if (w.action === null) raised++;
        n++;
      }
      t.run(1);
    }
    console.log(`  Tests (jump-aim start body) ${n} ticks on the posed root, ${raised} of them after the clip`);
    expect(n).toBeGreaterThan(80);
    expect(raised).toBeGreaterThan(20);
  });

  it('control: a traversal move\'s root wins over the posed root in the ease-down; its verdict grid is the base\'s (Object.is)', () => {
    const { t, b } = shooter('crouch', true);
    while (b().sim.walker.action !== null) t.run(1);
    t.run(6);                                                               // into the ease-down: the posed root ~10.6
    expect(t.pageRoot()!).toBeGreaterThan(rootY('crouch') + 4);
    // The move's root (`Traversal.rootY`) stubbed on the room's own move: 7.25 stands in for a move's.
    const moves = b().sim.moves!;
    const was = moves.rootY;
    moves.rootY = () => 7.25;
    try {
      // Three commands on the move's root, the middle one judged: the check blends a frame with its neighbours, which
      // stand on the move's root too (a neighbour from before the move would stand on the posed root at the head only).
      t.run(3);
      const seq = b().sim.seq - 1;
      t.run(1);
      expect(b().cone.frame(seq)!.moveRoot).toBe(7.25);
      expect(roots(t).aimRootOf(b())).toBe(7.25);
      const g = grid(t, seq);
      console.log(`  Tests (jump-aim grid) traversal in the ease-down: ${JSON.stringify(g)}`);
      const pin = PINNED['traversal ease-down']!;
      g.forEach((v, i) => expect(Object.is(v, pin[i]), `dy ${GRID_DY[i]}: ${v} vs ${pin[i]}`).toBe(true));
    } finally { moves.rootY = was; }
  });

  it('the ruling\'s reach, logged: a crouch walk\'s posed root stands over the crouch root (seal_crouchwalk), so its frame takes it too', () => {
    // The blend-out ruling is "whenever the posed root stands above the crouch root": the crouch walk's root (5.50-9.33
    // on the fixture disc's clips, the seat-box probe jf-2) is above it on every walking tick, as the page's camera is.
    const { t, b } = shooter('crouch', false);
    t.stick(CROUCH_WALK);
    t.run(60);
    let n = 0, lo = Infinity, hi = -Infinity;
    for (let i = 0; i < 60; i++) {
      const posed = t.pageRoot()!;
      t.run(1);
      expect(b().sim.walker.posture).toBe('crouch');
      const f = b().cone.frame(b().sim.seq)!;
      if (posed > rootY('crouch')) { expect(f.moveRoot, `tick ${i}`).toBe(posed); n++; lo = Math.min(lo, posed); hi = Math.max(hi, posed); }
    }
    console.log(`  Tests (jump-aim crouch walk) ${n} of 60 walking ticks on the posed root, ${lo.toFixed(3)}..${hi.toFixed(3)}; grid ${JSON.stringify(grid(t, b().sim.seq - 1))}`);
    expect(n).toBeGreaterThan(0);
  });
});
