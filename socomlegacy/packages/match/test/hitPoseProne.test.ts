import { describe, expect, it } from 'vitest';
import { posedBoxes, type BoneBox } from '../../viewer/src/net/hitVolumes';
import { aimRoot } from '../../viewer/src/net/shotCone';
import { cameraLook, type ShotVerdict } from '../../viewer/src/sim';
import { PRONE_ROOT } from '../../viewer/src/mover';
import { clipsFromPack, motionTableFromArchive } from '../../viewer/src/motionTable';
import { simSkeletonsFromBytes, type SimSkeleton } from '../../viewer/src/simMap';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import type { HitPoser } from '../../viewer/src/net/hitPose';
import { hitPoseRoom, PAGE_CLIPS } from './helpers/hitPoseRoom';

/**
 * LATER 661, the validation half (the bodies seat, 2026-11-18; the next batch, item 2): LATER 661 says a prone body's seam
 * stands on `PRONE_ROOT` 2.168 (`seal_prone`'s `skel_root`, research 217 s4) whatever it plays, while the drawn body stands
 * on the play's own root -- `seal_prone_crawl` 2.289, `seal_prone_turn` 2.266, `seal_prone_rstrafe` 1.602,
 * `seal_prone_lstrafe` 1.863 (`MOTION_P.ZAR`) -- up to 0.57 u apart. HIT-POSE (research 217 s3.6) since poses the room's
 * hit volumes on the page's own `Animator` (A = B), so the HIT half should now follow the play's root. This file holds that
 * for a prone body (still, crawling, strafing each way): the room's kept boxes each tick against the page's drawn skeleton,
 * and the room poser's root against the page's. The EYE half -- the aim frame's root (`aimRoot`, `Room.aimRootOf`) -- is
 * not posed prone (JUMP-AIM-ROOT poses the crouch only), so it stays `PRONE_ROOT`; whether the original's eye follows the
 * posed root prone is the read LATER 661 names first (`FUN_0029a950`'s camera). This file logs that gap and pins today's
 * rule; it judges no original value. Unit-test evidence only (the fixture disc's MP2, `MOTION_P.ZAR`, `READERC.ZAR`).
 */

const MP2 = fixture('RUN/MP2.ZDB'), PACK = fixture('RUN/MOTION_P.ZAR'), READERC = fixture('RUN/READERC.ZAR');
/** HIT-POSE's own A = B tolerance (`hitPoseAnimated.test.ts`): the same code on the same floats. */
const A_EQUALS_B = 1e-6;

const at = (b: BoneBox, f: readonly number[]): number[] => {
  const p = [0, 1, 2].map((k) => b.box[k]! + (b.box[3 + k]! - b.box[k]!) * f[k]!), w = b.w;
  return [0, 1, 2].map((r) => p[0]! * w[r]! + p[1]! * w[4 + r]! + p[2]! * w[8 + r]! + w[12 + r]!);
};
const CORNERS = [0, 1].flatMap((x) => [0, 1].flatMap((y) => [0, 1].map((z) => [x, y, z])));
const gap = (a: readonly BoneBox[], b: readonly BoneBox[]): number => {
  expect(a.length).toBe(b.length);
  let worst = 0;
  a.forEach((c, i) => {
    for (const f of CORNERS) {
      const p = at(c, f), q = at(b[i]!, f);
      for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(p[k]! - q[k]!));
    }
  });
  return worst;
};

describe.skipIf(!MP2 || !PACK || !READERC)(`LATER 661: a prone body's hit volumes follow the play it draws${MP2 && PACK && READERC ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const skeletons = MP2 && PACK && READERC ? simSkeletonsFromBytes(MP2, READERC, PACK) : { seal: [], terrorist: [], escortees: [] };
  const clips = PACK ? clipsFromPack(PACK, PAGE_CLIPS) : [];
  const table = READERC ? motionTableFromArchive(READERC) : null;
  const seal = (): SimSkeleton => skeletons.seal[0]!;
  type Past = { tick: number; pose?: HitPoser; poseAt?: number };
  type Seat = { history: Past[]; poser: { pose: HitPoser } | null };

  it('A = B prone: the room\'s kept boxes are the page\'s drawn skeleton\'s each tick, still, crawling and strafing; the poser\'s root is the play\'s', () => {
    const t = hitPoseRoom(seal(), clips, table);
    const seat = (): Seat => t.room.player(2) as unknown as Seat;
    t.press('prone');
    t.run(90);                                                                      // the stand->prone clip (57 ticks) run out
    const roots = new Map<string, number[]>();
    let worst = 0;
    const check = (label: string, n: number, play: RegExp): void => {
      for (let i = 0; i < n; i++) {
        t.run(1);
        const past = seat().history.at(-1)!;
        expect(past.tick).toBe(t.room.tick);
        const boxes = past.pose && past.poseAt ? past.pose.boxesAt(past.poseAt) : null;
        expect(boxes, `${label}: no pose kept at tick ${past.tick}`).toBeTruthy();
        const g = gap(boxes!, posedBoxes(t.pageSkeleton()!));
        worst = Math.max(worst, g);
        expect(g, `${label} tick ${i} (${t.clip()})`).toBeLessThanOrEqual(A_EQUALS_B);
        const roomRoot = seat().poser?.pose.rootY() ?? null, pageRoot = t.pageRoot();
        expect(roomRoot, `${label}: the room poser's root`).not.toBeNull();
        expect(Math.abs(roomRoot! - pageRoot!), `${label}: the room's root is the page's`).toBeLessThanOrEqual(A_EQUALS_B);
        if (i >= n - 20) roots.set(t.clip(), [...(roots.get(t.clip()) ?? []), roomRoot!]);
      }
      expect(t.clip(), label).toMatch(play);
    };
    check('prone still', 30, /prone/);
    t.stick(1);
    check('crawl', 90, /prone_crawl/);
    t.stick(0);
    t.hold({ right: 1 });
    check('right strafe', 90, /prone_rstrafe/);
    t.hold({ right: -1 });
    check('left strafe', 90, /prone_lstrafe/);
    const span = [...roots].map(([c, r]) => `${c} ${Math.min(...r).toFixed(3)}..${Math.max(...r).toFixed(3)}`).join('; ');
    console.log(`LATER 661 A = B prone: worst ${worst.toExponential(2)} u; the posed root (last 20 ticks of each): ${span}; PRONE_ROOT ${PRONE_ROOT.toFixed(3)}`);
    // The hit half follows the play: the crawl's and the strafes' posed roots stand off the stance's 2.168 (LATER 661's
    // own figures: crawl 2.289, rstrafe 1.602, lstrafe 1.863 -- each clip's root over its keys).
    const last = (re: RegExp): number => [...roots].find(([c]) => re.test(c))![1].at(-1)!;
    expect(last(/prone_crawl/)).toBeCloseTo(2.289, 2);
    expect(last(/prone_rstrafe/)).toBeCloseTo(1.602, 2);
    expect(last(/prone_lstrafe/)).toBeCloseTo(1.863, 2);
  });

  it('the eye half: the aim root of a prone body is its posed root, as FUN_0029a950 stands the camera on it (LATER 661)', () => {
    // FUN_0029a950 (D:L142448-142487) reads the skeleton root's posed height (FUN_002869d0 on the actor's root node) for
    // every stance and lays its ramp on it (5.5 + 4.5 x clamp((root - 2.169155) x 0.2914734)); the page's camera does
    // (walk.ts posedRoot). The aim frame takes the same root prone: the crawl's 2.289, the strafes' 1.602 / 1.863.
    for (const posed of [1.602, 1.863, 2.168, 2.266, 2.289]) {
      expect(aimRoot(null, { action: null, posture: 'prone' }, () => posed)).toBe(posed);
    }
    // No poser (no motion) or a root not finite: the stance's PRONE_ROOT stands in, as before.
    expect(aimRoot(null, { action: null, posture: 'prone' }, () => null)).toBeNull();
    expect(aimRoot(null, { action: null, posture: 'prone' }, () => Number.NaN)).toBeNull();
    // A traversal move's own root still comes first.
    expect(aimRoot(3, { action: null, posture: 'prone' }, () => 2.289)).toBe(3);
    console.log(`LATER 661 eye: the aim root follows the prone play (1.602..2.289) where it stood on PRONE_ROOT ${PRONE_ROOT.toFixed(3)} (up to ${(PRONE_ROOT - 1.602).toFixed(3)} u)`);
  });

  it('the room takes an honest claim from the page camera on its posed root, going down and strafing prone (the review F3)', () => {
    // The room's aim frame (`Room.aimRootOf`, the poser's root as of the last tick) against a claim made from the page's
    // camera on ITS posed root (`pageRoot`): going down (the root sweeps 11.48 -> 2.17) and on the right strafe (1.602),
    // every command's claim is taken (no 'eye', no 'cone'). Unit-test evidence only (the fixture disc).
    const t = hitPoseRoom(seal(), clips, table);
    type Seat = { sim: { seq: number; walker: { posture: string } }; cone: { frame(seq: number): Parameters<typeof cameraLook>[0] | null; check(seq: number, c: { eye: number[]; aim: number[]; from: number[]; dir: number[] }): ShotVerdict } };
    const b = (): Seat => t.room.player(2) as unknown as Seat;
    const out: string[] = [];
    const claim = (label: string): void => {
      t.run(1);
      const seq = b().sim.seq, root = t.pageRoot();
      t.run(1);                                                                     // the command after: the room decides then
      const f = b().cone.frame(seq)!;
      const { eye, look } = cameraLook({ ...f, moveRoot: root });
      const verdict = b().cone.check(seq, { eye, aim: look, from: eye, dir: look });
      out.push(`${label} page ${root?.toFixed(3)} frame ${f.moveRoot?.toFixed(3) ?? 'null'} ${verdict ?? 'ok'}`);
      expect(verdict, `${label}: page root ${root}, frame root ${f.moveRoot}`).toBeNull();
    };
    t.press('prone');
    for (let i = 0; i < 40; i++) claim(`down ${i}`);
    t.run(40);
    t.hold({ right: 1 });
    t.run(30);
    for (let i = 0; i < 20; i++) claim(`rstrafe ${i}`);
    expect(b().sim.walker.posture).toBe('prone');
    for (let i = 0; i < out.length; i += 10) console.log(`LATER 661 claims: ${out.slice(i, i + 10).join(' | ')}`);
  });
});
