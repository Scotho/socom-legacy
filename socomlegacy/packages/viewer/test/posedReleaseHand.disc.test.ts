import { describe, expect, it } from 'vitest';
import { GAME_FRAME_DT, POSED_RELEASE_HAND_READING, releaseSeconds, Skeleton, THROW_ANIMS, transformPoint, type ThrowAnim } from '@s2u/scene';
import { Animator, PLAY_CLIPS, type MoverSnapshot } from '../src/animator';
import { RELEASE_POINT } from '../src/grenadeCore';
import { heldSkeleton } from '../src/heldItem';
import { clipsFromPack, motionTableFromArchive } from '../src/motionTable';
import { simSkeletonsFromBytes } from '../src/simMap';
import { THROW_CLIPS, ThrowPose } from '../src/throwPose';
import { leanClip } from '../src/traversal';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';

// LANE-KILL B-06's start-tie (research 256 §5.2): `POSED_RELEASE_HAND_READING` is the page's own release point
// (`grenadeCore.ts` `launchOf` with `handPoint('rhand', RELEASE_POINT)`), recomputed here on the fixture disc's SEAL with
// the page's `Animator` and `ThrowPose` by agent-mail pilot/kill/item-1-posed-hand.md's method: settled 3 s in the
// stance's idle (a lean: its clip held at its last key, `traversal.ts`'s held peek), the throw started held, then stepped
// on the GAME's frame (LATER 1428): each `GAME_FRAME_DT` frame `throwPose.step` then `anim.step` (the page's order), the
// hand read at the game frame k = ceil(releaseSeconds / GAME_FRAME_DT) -- the clip clock k x GAME_FRAME_DT, the frame
// the original's `+0x87c` countdown reaches 0 (`FUN_005802b0` D:L441904; D:L476883-476885) and the launch reads the posed
// hand (D:L477060-477067) -- and on the game frames either side. *Was: 1/60 s frames, the first whose clock reaches
// `releaseSeconds` (a render grid, not the game's).* A dev-disc computation of the PORT's pose, not of the original.
const MP2 = fixture('RUN/MP2.ZDB'), PACK = fixture('RUN/MOTION_P.ZAR'), READERC = fixture('RUN/READERC.ZAR');
const DISC = !!(MP2 && PACK && READERC);
const SETTLE_DT = 1 / 60;
type V3 = readonly [number, number, number];

/** Each throw clip's body: the stance it is thrown from and, a lean toss, the held lean's side. */
const BODY: Record<keyof typeof THROW_ANIMS, { stance: 'stand' | 'crouch' | 'prone'; side?: -1 | 1 }> = {
  standThrow: { stance: 'stand' }, standToss: { stance: 'stand' }, crouchThrow: { stance: 'crouch' },
  proneThrow: { stance: 'prone' }, proneToss: { stance: 'prone' },
  peekRightToss: { stance: 'stand', side: 1 }, peekLeftToss: { stance: 'stand', side: -1 },
};

describe.skipIf(!DISC)(`POSED_RELEASE_HAND_READING: the page's posed release hand, recomputed off the fixture disc${DISC ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const posed = (key: keyof typeof THROW_ANIMS): [V3, V3, V3] => {
    const sk = simSkeletonsFromBytes(MP2!, READERC!, PACK!).seal[0]!.skeleton;
    const leans = [leanClip('stand', -1), leanClip('stand', 1)];
    const clips = clipsFromPack(PACK!, [...new Set([...PLAY_CLIPS, ...THROW_CLIPS, ...leans])]);
    const table = motionTableFromArchive(READERC!);
    const skeleton = heldSkeleton(new Skeleton(sk.model, sk.modelMatrix, sk.parts));
    const anim = new Animator(skeleton, clips, table, { random: () => 0 });
    anim.setWeapon('rifle');
    const pose = new ThrowPose(() => ({ clips: new Map(clips.map((c) => [c.name, c])), table }));
    anim.addPoseLayer(pose.layer);
    const a: ThrowAnim = THROW_ANIMS[key], body = BODY[key];
    const lean = body.side ? clips.find((c) => c.name === leanClip(body.stance, body.side!)) : undefined;
    if (body.side) expect(lean, 'the lean clip').toBeDefined();
    const snap = (hold: string | null): MoverSnapshot => ({
      vx: 0, vz: 0, vy: 0, yaw: 0, airborne: false, crouched: body.stance === 'crouch', landing: null, jumps: 0, stance: body.stance,
      pitch: 0, hold, traversal: lean ? { clip: lean.name, frame: lean.frameCount - 1, loop: false, rootY: null } : null,
    });
    for (let i = 0; i < 180; i++) anim.step(SETTLE_DT, snap(null));
    expect(pose.start(a, true), 'the clip').toBe(true);
    const rhand = skeleton.indexOf('rhand');
    const hand = (): V3 => transformPoint(skeleton.world[rhand]!, RELEASE_POINT[0], RELEASE_POINT[1], RELEASE_POINT[2]);
    const k = Math.ceil(releaseSeconds(a) / GAME_FRAME_DT - 1e-9);
    const at: V3[] = [];
    for (let i = 1; i <= k + 1; i++) {
      pose.step(GAME_FRAME_DT);
      anim.step(GAME_FRAME_DT, snap(a.clip));
      if (i >= k - 1) at.push(hand());
    }
    expect(pose.stats().elapsed).toBeCloseTo((k + 1) * GAME_FRAME_DT, 9);
    return [at[0]!, at[1]!, at[2]!];
  };

  for (const key of Object.keys(BODY) as (keyof typeof THROW_ANIMS)[]) {
    it(`${key}: the frame before, the release frame and the frame after, each within 0.05`, () => {
      const got = posed(key), want = POSED_RELEASE_HAND_READING[key];
      expect(want, key).toBeDefined();
      for (let f = 0; f < 3; f++) {
        for (let k = 0; k < 3; k++) expect(Math.abs(got[f]![k]! - want![f]![k]!), `${key} frame ${f} axis ${k}: ${JSON.stringify(got.map((g) => g.map((v) => +v.toFixed(3))))}`).toBeLessThan(0.05);
      }
    });
  }
});
