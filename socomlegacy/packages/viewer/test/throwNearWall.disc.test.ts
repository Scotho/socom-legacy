import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import {
  GAME_FRAME_DT, gridCast, isShotSurface, launchGrenade, segmentHits, Skeleton, stepGrenade, transformPoint,
  type Grid, type HullCast, type HullHit, type ThrowAnim, type V3,
} from '@s2u/scene';
import { Animator, PLAY_CLIPS, type MoverSnapshot } from '../src/animator';
import { GrenadeThrower } from '../src/grenade';
import { heldSkeleton } from '../src/heldItem';
import { clipsFromPack, motionTableFromArchive } from '../src/motionTable';
import { groundPolygons, moverSnapshot, probeLiftOf, rootY, Walker } from '../src/mover';
import { actorToWorld } from '../src/play';
import { INIT_AIM_PITCH, PlayerCamera, viewFar } from '../src/playerCamera';
import { loadSimMap, simSkeletonsFromBytes, type SimMap } from '../src/simMap';
import { THROW_CLIPS, ThrowPose } from '../src/throwPose';
import { Traversal } from '../src/traversal';

/**
 * The near-wall back-bounce as a PLAYER makes it (agent-mail pilot/kill/keyjob-vigi-nearwall-read.md section 5, Step 0;
 * the four examples of its section 4; its second read pilot/kill/review-vigi-nearwall-read.md). A dev-disc test: MP51
 * from `SOCOM_DISC` (no fixture), skipped without it, and the skip is said in the suite's title. No behaviour change.
 *
 * Section 4's probe stood the body at geometric candidates (the mover not asked) and found 38 releases on MP51 whose
 * first face along the launch line is met from BEHIND, so the port's two-sided flight (`gridCast`, D1 of section 4)
 * bounces off a face's back. Here the mover decides: for each example the page's own `Walker` (with the page's
 * `Traversal` driver) is stood on the floor 12 u from the example's wall and pushed into it -- strafed right when the
 * wall is at the right shoulder, walked forward when the wall is ahead (the second is this test's choice for the facing
 * case: a strafe cannot close on a wall ahead) -- until the mover stops it. Never a placed pose at the wall.
 *
 * The throw is the page's `GrenadeThrower` with a posed source: `handPoint` from the real skeleton, as
 * `posedReleaseHand.disc.test.ts` builds it (the SEAL of `RUN/MP2.ZDB`, `MOTION_P.ZAR`, `READERC.ZAR`; `Animator` and
 * `ThrowPose`, settled 3 s in the idle, the throw clip started held at `throwStart`, each 1/60 s `throwPose.step` then
 * `anim.step`; the animator's snapshot yaw and pitch 0, as there) and the page's `Play.partPoint` turn into the world
 * (`actorToWorld` at the walker's feet and yaw); the aim the page's `PlayerCamera` ray at the default look. M67 selected
 * standing, R1 held to full (90 updates, 1.5 s), released.
 *
 * Recorded and printed: the stand-off (the mover's), the request's verdict (`diag().lastRefusal`), the hand-open's
 * (`diag().lastAbort`), the launch point (`stats().lastThrow.from`), every face between the body's axis and the launch
 * point at the launch's height, and every bounce in the first 0.5 s with the side its face was met from.
 *
 * The side: the thrower's `bounce` event carries no normal (`BounceInfo`), so the flight is flown again here from the
 * page's own launch (`lastThrow.from`, `lastThrow.velocity`, the thrower's record) with `stepGrenade` over a wrapper of
 * the same `gridCast` that keeps each hit's raw normal (`polygonNormal`'s, the hull's own side, `segment.ts`
 * `frontSides`); the replay's bounce points are asserted equal to the page's own bounce events, so the side is the
 * page's flight's. Met from behind: the raw normal along the frame's segment (n . (b - a) > 0).
 *
 * The assertion (the red Step 0 expects where the mover lets the body within the posed hand's 4.24 u): no bounce in the
 * first 0.5 s off a face met from behind. If the mover holds the body farther off, the test is green and that is the
 * finding (no player path to the back-bounce at that example). IQ-084 (the capture of the original at MP51's tunnel
 * spots) and IQ-152's captures 2 and 3 (the original's sideways stand-off and the shoulder throw; capture 1 is pinned in
 * `throwClearVigiCapture.disc.test.ts`) are the evidence this result is to be read against; neither is scored here, and
 * this file pins no capture value: it asks only the page's own flight.
 */

const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : '';
const FILES = ['MP51.ZDB', 'MP2.ZDB', 'MOTION_P.ZAR', 'READERC.ZAR'];
const HAVE = !!DISC && FILES.every((f) => existsSync(resolve(DISC, 'RUN', f)));
const DT = 1 / 60;
const NL = String.fromCharCode(10);

/** Section 4's four examples (feet, yaw; the face the note names). */
const EXAMPLES: readonly { name: string; feet: V3; yaw: number; face: string }[] = [
  { name: 'wc23A at (379.76, 154.96, 1495.29) yaw 270', feet: [379.76, 154.96, 1495.29], yaw: 270, face: 'worldmodel/wc23A' },
  { name: 'wc23A at (329.76, 138.44, 1394.40) yaw 270', feet: [329.76, 138.44, 1394.40], yaw: 270, face: 'worldmodel/wc23A' },
  { name: 'wc20 at (256.75, 114.33, 1306.11) yaw 180', feet: [256.75, 114.33, 1306.11], yaw: 180, face: 'worldmodel/wc20' },
  { name: 'wc19A at (276.88, 108.88, 1193.23) yaw 315', feet: [276.88, 108.88, 1193.23], yaw: 315, face: 'worldmodel/wc19A' },
];
/** The body's distance from the wall it is started at (section 5, Step 0, item 1). */
const START_OFF = 12;
/** How near a wall must be, from the example's feet, for its direction to be pushed (a search bound, this test's). */
const WALL_SEARCH = 9;
/** The flight window the assertion covers (Step 0, item 3). */
const WINDOW_S = 0.5;
const FULL_HOLD_UPDATES = 90;
/** The approach's stop (this test's measure, not a game value): under STALL_GAIN u gained toward the wall in STALL_TICKS ticks. */
const STALL_TICKS = 30, STALL_GAIN = 0.05, PUSH_TICKS_MAX = 900;

type Dir = 'right' | 'ahead';
const fmt = (v: readonly number[] | null | undefined): string => (v ? `(${v.map((x) => x.toFixed(3)).join(', ')})` : 'none');

/** The nearest near-vertical shot surface along `dir` (horizontal) from the feet, over three heights. */
function wallAlong(grid: Grid, feet: V3, dir: V3, reach: number): { d: number; owner: string } | null {
  let best: { d: number; owner: string } | null = null;
  for (const up of [5, 12, 20]) {
    const a: V3 = [feet[0], feet[1] + up, feet[2]];
    const b: V3 = [a[0] + dir[0] * reach, a[1], a[2] + dir[2] * reach];
    for (const h of segmentHits(grid, a, b, isShotSurface)) {
      if (Math.abs(h.normal[1]) > 0.7) continue;                 // a floor or a ceiling, not a wall
      const d = h.t * reach;
      if (!best || d < best.d) best = { d, owner: h.owner.path };
      break;
    }
  }
  return best;
}

describe.skipIf(!HAVE)(`Step 0 (keyjob-vigi-nearwall-read s5): a full M67 thrown by a body the page mover pushed into an MP51 wall bounces off no face met from behind${HAVE ? '' : ' -- SKIPPED: SOCOM_DISC with RUN/MP51.ZDB, MP2.ZDB, MOTION_P.ZAR and READERC.ZAR absent (MP51 is no fixture)'}`, () => {
  let loaded: SimMap | undefined;
  const map = async (): Promise<SimMap> => (loaded ??= await loadSimMap(new FsAssetSource(DISC), 'RUN/MP51.ZDB'));
  const read = (f: string): Uint8Array => new Uint8Array(readFileSync(resolve(DISC, 'RUN', f)));

  /** The page's camera ray, as `throwAimCapture.disc.test.ts`'s `rayAt`. */
  const rayAt = (grid: Grid, feet: V3, yaw: number): { eye: V3; far: V3 } => {
    const cam = new PlayerCamera(grid);
    for (let i = 0; i < 120; i++) cam.tick(feet, yaw, INIT_AIM_PITCH, rootY('stand'));
    cam.settle();
    const v = cam.view(1);
    return { eye: [...v.aim.eye] as V3, far: [...viewFar(v.aim.eye, v.aim.target, v.far)] as V3 };
  };

  /** The posed body, as `posedReleaseHand.disc.test.ts` builds it: the SEAL's skeleton, the page's animator and throw pose. */
  const posedBody = () => {
    const sk = simSkeletonsFromBytes(read('MP2.ZDB'), read('READERC.ZAR'), read('MOTION_P.ZAR')).seal[0]!.skeleton;
    const pack = read('MOTION_P.ZAR'), readerc = read('READERC.ZAR');
    const clips = clipsFromPack(pack, [...new Set([...PLAY_CLIPS, ...THROW_CLIPS])]);
    const table = motionTableFromArchive(readerc);
    const skeleton = heldSkeleton(new Skeleton(sk.model, sk.modelMatrix, sk.parts));
    const anim = new Animator(skeleton, clips, table, { random: () => 0 });
    anim.setWeapon('rifle');
    const pose = new ThrowPose(() => ({ clips: new Map(clips.map((c) => [c.name, c])), table }));
    anim.addPoseLayer(pose.layer);
    const snap = (hold: string | null): MoverSnapshot => ({
      vx: 0, vz: 0, vy: 0, yaw: 0, airborne: false, crouched: false, landing: null, jumps: 0, stance: 'stand',
      pitch: 0, hold, traversal: null,
    });
    return { skeleton, anim, pose, snap };
  };

  for (const ex of EXAMPLES) {
    it(`${ex.name}: pushed into the wall by the mover, no bounce in the first 0.5 s off a face met from behind`, async () => {
      const m = await map();
      const grid = m.grid, material = m.defaultMaterial ?? '';
      const right = actorToWorld([0, 0, 0], ex.yaw, [1, 0, 0]), ahead = actorToWorld([0, 0, 0], ex.yaw, [0, 0, -1]);
      const dirs: Record<Dir, V3> = { right, ahead };
      const found = (['right', 'ahead'] as const)
        .map((k) => ({ k, w: wallAlong(grid, ex.feet, dirs[k], WALL_SEARCH) }))
        .filter((x) => x.w !== null)
        .sort((a, b) => a.w!.d - b.w!.d);
      const lines: string[] = [`STEP 0 ${ex.name} (section 4 names ${ex.face})`];
      lines.push(`  walls from the example's feet within ${WALL_SEARCH} u: ${found.map((x) => `${x.k} ${x.w!.d.toFixed(2)} u ${x.w!.owner}`).join('; ') || 'none'}`);
      expect(found.length, `a wall at the right or ahead within ${WALL_SEARCH} u of ${fmt(ex.feet)}`).toBeGreaterThan(0);
      const { k: side, w: wall } = found[0]!;
      const dir = dirs[side];

      // 1. The page's own Walker, START_OFF from the wall, pushed into it until the mover stops it.
      const w = new Walker(grid);
      w.driver = new Traversal(grid, groundPolygons(m.ground));
      const back = wall!.d - START_OFF;
      const sx = ex.feet[0] + dir[0] * back, sz = ex.feet[2] + dir[2] * back;
      expect(w.place(sx, ex.feet[1] + probeLiftOf('stand'), sz), `the floor ${START_OFF} u off the wall at (${sx.toFixed(2)}, ${sz.toFixed(2)})`).toBe(true);
      w.state.yaw = ex.yaw;
      const still = { forward: 0, right: 0, boost: false };
      const push = side === 'right' ? { forward: 0, right: 1, boost: false } : { forward: 1, right: 0, boost: false };
      for (let i = 0; i < 18; i++) w.tick(still);
      const from: V3 = [w.state.x, w.state.y, w.state.z];
      // The stop is measured as the APPROACH: the feet's progress along the push direction (toward the wall), which must
      // gain under STALL_GAIN over STALL_TICKS ticks. Box run e4575ee413 (J1): a per-tick displacement under 0.01 for 15
      // ticks in a row was never met in 900 ticks at any example, though the body moved more than 1 u (that assertion,
      // before it, passed). A body held at a wall need not be still per tick: it can slide along a wall not square to the
      // push, or step on and back as the walls are met on the frame's move (`GROUND_WALLS_PER_TICK_READING`); which of
      // the two it was is what the printed track shows. The slide is the mover's and is printed, not stopped.
      const progress: number[] = [];
      const along = (): number => (w.state.x - from[0]) * dir[0] + (w.state.z - from[2]) * dir[2];
      const track: string[] = [];
      let ticks = 0, stopped = false;
      while (!stopped && ticks < PUSH_TICKS_MAX) {
        w.tick(push);
        ticks++;
        progress.push(along());
        if (ticks % 60 === 0) track.push(`t${ticks} ${fmt([w.state.x, w.state.y, w.state.z])} along ${along().toFixed(2)}`);
        stopped = ticks >= STALL_TICKS && progress[ticks - 1]! - progress[ticks - 1 - STALL_TICKS]! < STALL_GAIN;
      }
      for (let i = 0; i < 30; i++) w.tick(still);
      const feet = w.tickFeet() as unknown as V3;
      const moved = Math.hypot(feet[0] - from[0], feet[2] - from[2]);
      const standOff = wallAlong(grid, [feet[0], feet[1], feet[2]], dir, START_OFF + 4);
      lines.push(`  pushed ${side} ${ticks} ticks: moved ${moved.toFixed(3)} u (along the push ${along().toFixed(3)} u, the wall was ${START_OFF} u) from ${fmt(from)} to ${fmt(feet)}, yaw ${w.state.yaw.toFixed(2)}, stopped ${stopped}`);
      lines.push(`  track: ${track.join('; ') || 'under 60 ticks'}`);
      lines.push(`  the stand-off (the mover's): ${standOff ? `${standOff.d.toFixed(3)} u to ${standOff.owner}` : 'no wall within reach'}; the posed hand is 4.24 u to the right (POSED_RELEASE_HAND_READING.standThrow)`);
      console.log(lines.join(NL));                                 // the set-up printed before its assertions (J1: nothing was)
      lines.length = 0;
      lines.push(`STEP 0 ${ex.name}, the throw`);
      expect(moved, 'the body moved toward the wall').toBeGreaterThan(1);
      expect(stopped, `the mover stopped the approach (gain under ${STALL_GAIN} u over ${STALL_TICKS} ticks)`).toBe(true);

      // 2. The page's thrower with a posed source: M67 selected standing, R1 held to full, released.
      const body = posedBody();
      for (let i = 0; i < 180; i++) { w.tick(still); body.anim.step(DT, body.snap(null)); }
      const ray = rayAt(grid, w.tickFeet() as unknown as V3, w.state.yaw);
      const snapshot = () => ({ ...moverSnapshot(w, null, 0, 0), pitch: INIT_AIM_PITCH });
      const g = new GrenadeThrower({
        grid: () => grid, snapshot, view: () => 'third', aim: () => ray,
        handPoint: (part, p) => {
          const i = body.skeleton.indexOf(part);
          if (i < 0) return null;
          const at = transformPoint(body.skeleton.world[i]!, p[0], p[1], p[2]);
          const s = snapshot();
          return actorToWorld(s.feet, s.yaw, [at[0], at[1], at[2]]);
        },
      });
      g.setEnvironment(material);
      let holdClip: string | null = null, started: ThrowAnim | null = null, poseStarted = false;
      const pageBounces: V3[] = [];
      let thrownAt = -1, t = 0;
      g.on('throwStart', (e) => { started = e.anim; holdClip = e.anim.clip; poseStarted = body.pose.start(e.anim, true); });
      g.on('throw', () => { thrownAt = t; });
      g.on('bounce', (b) => { if (thrownAt >= 0 && t - thrownAt <= WINDOW_S + 2 * GAME_FRAME_DT) pageBounces.push([...b.pos] as V3); });
      const frame = () => { w.tick(still); body.pose.step(DT); body.anim.step(DT, body.snap(holdClip)); g.update(DT); t += DT; };
      expect(g.select('M67'), 'the M67 taken up').toBe(true);
      expect(g.diag().selectPosture, 'selected standing').toBe('stand');
      g.pull();
      for (let i = 0; i < FULL_HOLD_UPDATES; i++) frame();
      const power = g.diag().power;
      g.release();
      for (let i = 0; i < 150; i++) frame();

      // 3. The record.
      const refusal = g.diag().lastRefusal?.reason ?? null, abort = g.diag().lastAbort, last = g.stats().lastThrow;
      lines.push(`  power at the release ${power.toFixed(4)}; the request: ${started ? `taken, clip ${(started as ThrowAnim).clip}, pose started ${poseStarted}` : `refused (${refusal})`}`);
      lines.push(`  the hand-open (diag().lastAbort): ${abort ? `${abort.path}${abort.cast ? `, cast ${fmt(abort.cast.from)} -> ${fmt(abort.cast.to)}, hit ${abort.cast.hit ? fmt(abort.cast.hit.point) : 'none'}` : ''}` : 'none'}`);
      lines.push(`  the launch point: ${last ? `${fmt(last.from)} (from the posed hand ${last.fromHand}), velocity ${fmt(last.velocity)}` : 'none (nothing thrown)'}`);
      // The release was asked and judged: the request's answer, or a throw, or the hand-open's record -- never a path not reached.
      expect(power, 'the wind-up ran').toBeGreaterThan(0.6);
      expect(started !== null || refusal === 'clear', `the release request was evaluated (refusal ${refusal})`).toBe(true);
      if (started) expect(last !== null || abort !== null, 'the hand-open was evaluated').toBe(true);

      const fromBehind: string[] = [];
      if (last) {
        const s = snapshot();
        const axis: V3 = [s.feet[0], last.from[1], s.feet[2]];
        const between = segmentHits(grid, axis, last.from, isShotSurface);
        const d: V3 = [last.from[0] - axis[0], 0, last.from[2] - axis[2]];
        lines.push(`  faces between the body's axis ${fmt(axis)} and the launch point: ${between.map((h) => `${h.owner.path} at t ${h.t.toFixed(3)} (${h.normal[0] * d[0] + h.normal[2] * d[2] > 0 ? 'its back' : 'its front'} toward the hand)`).join('; ') || 'none'}`);
        // The page's flight flown again over the same cast, each hit's raw normal kept (the header).
        const base = gridCast(grid, material);
        let lastCall: { a: V3; b: V3; hits: HullHit[] } | null = null;
        const cast: HullCast = (a, b) => { const hits = base(a, b); lastCall = { a: [...a] as V3, b: [...b] as V3, hits }; return hits; };
        const record = g.recordOf('M67')!;
        const gr = launchGrenade(last.from, last.velocity, record);
        const replay: V3[] = [];
        const frames = Math.ceil(WINDOW_S / GAME_FRAME_DT);
        for (let f = 0; f < frames && gr.state === 'flight'; f++) {
          lastCall = null;
          for (const e of stepGrenade(gr, GAME_FRAME_DT, cast)) {
            if (e.kind !== 'bounce') continue;
            const call = lastCall as { a: V3; b: V3; hits: HullHit[] } | null;
            const hit = call?.hits.find((h) => Math.hypot(h.point[0] - e.point[0], h.point[1] - e.point[1], h.point[2] - e.point[2]) < 1e-6);
            const seg: V3 = call ? [call.b[0] - call.a[0], call.b[1] - call.a[1], call.b[2] - call.a[2]] : [0, 0, 0];
            const behind = !!hit && hit.normal[0] * seg[0] + hit.normal[1] * seg[1] + hit.normal[2] * seg[2] > 0;
            replay.push(e.point);
            const line = `frame ${f} (${(f * GAME_FRAME_DT).toFixed(3)} s) at ${fmt(e.point)} off ${e.owner ?? '?'} (${e.material}), met from ${hit ? (behind ? 'BEHIND' : 'the front') : 'an unmatched hit'}`;
            lines.push(`  bounce ${line}`);
            if (behind) fromBehind.push(line);
          }
        }
        if (!replay.length) lines.push(`  no bounce in the first ${WINDOW_S} s`);
        // The replay is the page's flight: its bounces are the page's own, in order.
        for (const [i, p] of replay.entries()) {
          expect(pageBounces[i], `the page's bounce ${i}`).toBeDefined();
          for (let k = 0; k < 3; k++) expect(Math.abs(pageBounces[i]![k]! - p[k]!), `bounce ${i} axis ${k}`).toBeLessThan(1e-6);
        }
      } else {
        lines.push('  nothing thrown: no flight to bounce (the request or the hand-open refused it at this stand-off)');
      }
      console.log(lines.join(NL));
      expect(fromBehind, 'no bounce off a face met from behind (D1 of section 4)').toEqual([]);
    }, 120_000);
  }
});
