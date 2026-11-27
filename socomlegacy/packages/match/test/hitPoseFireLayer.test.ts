import { describe, expect, it } from 'vitest';
import { Skeleton, transformPoint, type MotionClip } from '@s2u/scene';
import { Animator, type MoverSnapshot } from '../../viewer/src/animator';
import { bodyOf, snapshotOf } from '../../viewer/src/net/body';
import { decodeSnapshot, encodeSnapshot } from '../../viewer/src/net/codec';
import { PART } from '../../viewer/src/net/damage';
import { HIT_POSE_CLIPS, HIT_POSE_LAYERS_READING, HitPoser, launcherInHand } from '../../viewer/src/net/hitPose';
import { NO_PART, posedBoxes, type BoneBox } from '../../viewer/src/net/hitVolumes';
import type { BodyState } from '../../viewer/src/net/protocol';
import { clipsFromPack, motionTableFromArchive, type MotionTable } from '../../viewer/src/motionTable';
import { remoteLauncherInHand } from '../../viewer/src/remotePlayers';
import { simSkeletonsFromBytes, type SimSkeleton } from '../../viewer/src/simMap';
import { FIRE_VERSIONS, WeaponPose } from '../../viewer/src/weaponPose';
import { RaiseFeed, WeaponRaise } from '../../viewer/src/weaponRaise';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { EXTRAS, hitPoseRoom, PAGE_CLIPS, toWorld, type V3 } from './helpers/hitPoseRoom';

/**
 * FIRE-LAYER FL-1 (LATER 1025; FL.R1-R3; research 217 s3.6a, "The Fire layer on the original"; reading, pending review):
 * the room's hit pose lays the Fire set as the page lays it on a remote copy, by the page's own code -- a `WeaponRaise`
 * fed the body's `raised` (`BodyFlag.Raised`, ER-2) at the copy's times, and `WeaponPose.fireLayer` on the poser's
 * `Animator` -- so the room's posed boxes are the drawn body's (A = B). The original's blend: `FUN_0057a330`
 * D:L438828-438860 (a play flagged 0x40, `FUN_005551a0(..., 0x40)` D:L438710, takes its type's Fire version at the
 * EASED raise weight `FUN_00286b80`; the launcher set excluded, D:L438829).
 *
 * "The page" here is the remote copy's `Play` as `play.ts` builds and steps it, headless: its `rebuild` (an `Animator`, a
 * `WeaponPose` with its Fire and reload layers, the rifle's item) and its frame (`raise.frame` on `RaiseFeed.input` with the
 * copy's `raised`, the Fire weight 0 under the launcher set, `WeaponPose.step`, then the animator) -- without the aim
 * weight, the pistol and launcher sets and the other layers, which the room does not feed (FL.R3,
 * `HIT_POSE_LAYERS_READING`). The fixture disc's MP2 (`MP2.ZDB`, `MOTION_P.ZAR`, `READERC.ZAR`): the SEAL and the
 * terrorist. Unit-test evidence only.
 */

const MP2 = fixture('RUN/MP2.ZDB'), PACK = fixture('RUN/MOTION_P.ZAR'), READERC = fixture('RUN/READERC.ZAR');
const DT = 1 / 60;
/** A rocket launcher's item id (`@s2u/scene` `itemClass`: 145-150 'rocketLauncher'). */
const LAUNCHER = 145;

type Wide = MoverSnapshot & ReturnType<typeof snapshotOf>;

/** The remote copy's play, headless (`play.ts` `rebuild` and `frame`); `layer` false is the room's poser before FL-1. */
class PageCopy {
  readonly skeleton: Skeleton;
  readonly anim: Animator;
  readonly pose: WeaponPose;
  private readonly raise = new WeaponRaise();
  private readonly feed = new RaiseFeed();
  private hand: number | null = null;
  constructor(sk: SimSkeleton, clips: readonly MotionClip[], table: MotionTable | null, layer: boolean) {
    this.skeleton = new Skeleton(sk.skeleton.model, sk.skeleton.modelMatrix, sk.skeleton.parts);
    this.anim = new Animator(this.skeleton, clips, table, { random: () => 0 });
    this.pose = new WeaponPose(new Map(clips.map((c) => [c.name, c])), table);
    this.anim.setWeapon('rifle');
    this.pose.item = 'rifle';
    if (layer) { this.anim.addPoseLayer(this.pose.fireLayer); this.anim.addPoseLayer(this.pose.reloadLayer); }
  }
  step(snap: Wide): void {
    const w = this.raise.frame(DT, this.feed.input(snap, false, { trigger: snap.trigger, aiming: snap.aiming, raised: snap.raised }, null), DT);
    // `remotePlayers.ts`: the launcher in the hand stows the rifle (`setRifleStowed`), and `play.ts` lays no Fire set then
    this.hand = remoteLauncherInHand(snap.item, snap.action, this.hand);
    this.pose.fireWeight = this.hand !== null ? 0 : w;
    this.pose.step(DT);
    this.anim.step(DT, snap);
  }
  weight(): number { return this.pose.stats().fireWeight; }
  fire(): string | null { return this.pose.stats().fire; }
}

describe.skipIf(!MP2 || !PACK || !READERC)(`FL-1: the room's hit pose lays the Fire set${MP2 && PACK && READERC ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const skeletons = MP2 && PACK && READERC ? simSkeletonsFromBytes(MP2, READERC, PACK) : { seal: [], terrorist: [], escortees: [] };
  const clips = PACK ? clipsFromPack(PACK, [...new Set([...PAGE_CLIPS, ...Object.values(FIRE_VERSIONS)])]) : [];
  const table = READERC ? motionTableFromArchive(READERC) : null;
  const bodies = (): [string, SimSkeleton][] => [['seal', skeletons.seal[0]!], ['terrorist', skeletons.terrorist[0]!]];
  const motion = { clips, table };

  /** `ticks` of B standing still in a room on `sk`, each tick's body as the room builds it (`room.ts` `body`), `extra` over EXTRAS. */
  const drive = (sk: SimSkeleton, ticks: number, extra: (i: number) => Partial<typeof EXTRAS & { raised: boolean; item: number }>,
    each: (body: BodyState, page: Wide, tilt: MoverSnapshot['rootTilt']) => void): ReturnType<typeof hitPoseRoom> => {
    const t = hitPoseRoom(sk, clips, table);
    const origin = (t.room as unknown as { feetOrigin: [number, number, number] }).feetOrigin;
    for (let i = 0; i < ticks; i++) {
      t.run(1);
      const p = t.room.player(2)!, tilt = p.sim.walker.rootTilt.q;
      const body = bodyOf(2, p.sim.body(), { ...EXTRAS, ...extra(i) });
      const page = { ...snapshotOf(decodeSnapshot(encodeSnapshot({ tick: t.room.tick, own: null, bodies: [body] }, origin)).bodies[0]!), rootTilt: tilt } as Wide;
      each(body, page, tilt);
    }
    return t;
  };
  const same = (a: readonly BoneBox[], b: readonly BoneBox[]): boolean =>
    a.length === b.length && a.every((x, i) => x.bone === b[i]!.bone && Array.from(x.w).every((v, k) => Object.is(v, b[i]!.w[k])));

  it("the clips: every Fire version the page lays is among the room's clips (HIT_POSE_CLIPS and the server skeleton's motion); the reading is 'fire-throw-reload' (the Fire set and, PRONE-THROW-HITBOX, the throw layer; RELOAD-HITPOSE, the reload)", () => {
    expect(HIT_POSE_LAYERS_READING).toBe('fire-throw-reload');
    const held = new Set(skeletons.seal[0]!.motion!.clips.map((c) => c.name));
    for (const name of new Set(Object.values(FIRE_VERSIONS))) {
      expect(HIT_POSE_CLIPS, name).toContain(name);
      expect(held.has(name), name).toBe(true);
    }
  });

  it("(1) raised and held (eased weight 1): the poser's posed boxes equal the page copy's with the Fire layer, to the bit -- SEAL and terrorist", () => {
    for (const [label, sk] of bodies()) {
      const poser = new HitPoser(sk.skeleton, motion);
      const page = new PageCopy(sk, clips, table, true), bare = new PageCopy(sk, clips, table, false);
      drive(sk, 90, () => ({ raised: true }), (body, snap, tilt) => { poser.stepBody(DT, body, tilt); page.step(snap); bare.step(snap); });
      expect(page.weight(), label).toBe(1);
      expect(page.fire(), label).toBe('seal_fp_stand');
      expect(same(posedBoxes(page.skeleton), posedBoxes(bare.skeleton)), `${label}: the Fire stand moves the boxes`).toBe(false);
      expect(same(poser.boxes(), posedBoxes(page.skeleton)), `${label}: A = B with the Fire layer`).toBe(true);
    }
  });

  // The plan's acceptance 2 (research 217 s3.6a's design) foresaw, at 14 up, a NO_PART record at the left hand first. The
  // port's own Fire stand on the fixture's two bodies puts the left forearm (LARM) before the hand on that line: the hand's
  // middle stands about 15 up, and the hand's box is met first on the same facing line at its own middle's height.
  it('(2) a level round along the facing line through the left hand: lowered, BODY (spinehi) first; raised, the left arm first -- at 14 up the forearm (LARM), at the hand\'s height the hand (NO_PART)', () => {
    type First = { part: number; bone: number } | null;
    const seen: { label: string; down: First; up14: First; upHand: First; names: (string | null)[] }[] = [];
    for (const [label, sk] of bodies()) {
      const lhand = sk.skeleton.part('lhand').index, lforearm = sk.skeleton.part('lforearm').index, spinehi = sk.skeleton.part('spinehi').index;
      // the left hand's place in the raised pose (the page's), body frame
      const page = new PageCopy(sk, clips, table, true);
      drive(sk, 60, () => ({ raised: true }), (_b, snap) => page.step(snap));
      const box = posedBoxes(page.skeleton).find((b) => b.bone === lhand)!, bb = box.box;
      const c = transformPoint(Float32Array.from(box.w), (bb[0]! + bb[3]!) / 2, (bb[1]! + bb[4]!) / 2, (bb[2]! + bb[5]!) / 2);
      const first = (raised: boolean, height: number): First => {
        const t = hitPoseRoom(sk, clips, table);
        t.hold({ raised });
        t.run(60);
        const s = t.room.player(2)!.sim.walker.state, feet: V3 = [s.x, s.y, s.z];
        const from = toWorld(feet, s.yaw, [c[0]!, height, -40]), back = toWorld(feet, s.yaw, [c[0]!, height, 0]);
        const dir: V3 = [(back[0] - from[0]) / 40, (back[1] - from[1]) / 40, (back[2] - from[2]) / 40];
        type Hit = { distance: number; tag?: { id: number; part: number; bone: number } };
        const hits = (t.room as unknown as { rewoundBodies(p: unknown, f: V3, d: V3, r: number, at: number): Hit[] })
          .rewoundBodies(t.room.player(1)!, from, dir, 80, t.room.tick).filter((h) => h.tag?.id === 2).sort((x, y) => x.distance - y.distance);
        return hits[0]?.tag ? { part: hits[0].tag.part, bone: hits[0].tag.bone } : null;
      };
      const down = first(false, 14), up14 = first(true, 14), upHand = first(true, c[1]!);
      console.log(`FL-1 ${label}: lhand's middle x ${c[0]!.toFixed(2)} y ${c[1]!.toFixed(2)} z ${c[2]!.toFixed(2)}`);
      seen.push({ label, down, up14, upHand, names: [down, up14, upHand].map((h) => (h ? sk.skeleton.parts[h.bone]!.name : null)) });
      expect(down, `${label} lowered, 14 up`).toEqual({ part: PART.BODY, bone: spinehi });
      expect(up14, `${label} raised, 14 up`).toEqual({ part: PART.LARM, bone: lforearm });
      expect(upHand, `${label} raised, the hand's height`).toEqual({ part: NO_PART, bone: lhand });
    }
    console.log(`FL-1 (2): ${JSON.stringify(seen)}`);
  });

  it('(3) lowered keeps today\'s boxes to the bit; the launcher in the hand lays nothing; a play with no Fire version lays nothing', () => {
    for (const [label, sk] of bodies()) {
      // lowered (weight 0)
      const low = new HitPoser(sk.skeleton, motion), bareLow = new PageCopy(sk, clips, table, false);
      drive(sk, 60, () => ({ raised: false }), (body, snap, tilt) => { low.stepBody(DT, body, tilt); bareLow.step(snap); });
      expect(same(low.boxes(), posedBoxes(bareLow.skeleton)), `${label} lowered`).toBe(true);
      // raised with a rocket launcher in the hand (FUN_0057a330 D:L438829: not under the launcher set)
      const rl = new HitPoser(sk.skeleton, motion), bareRl = new PageCopy(sk, clips, table, false), pageRl = new PageCopy(sk, clips, table, true);
      drive(sk, 60, () => ({ raised: true, item: LAUNCHER }), (body, snap, tilt) => { rl.stepBody(DT, body, tilt); bareRl.step(snap); pageRl.step(snap); });
      expect(pageRl.weight(), `${label} launcher: the page lays nothing`).toBe(0);
      expect(same(rl.boxes(), posedBoxes(bareRl.skeleton)), `${label} launcher`).toBe(true);
    }
    // a move to the right (`seal_run_90r` or a strafe: no Fire version, `FIRE_VERSIONS` holds none, the 0x40 types' table `FUN_005e0690` D:L494790-494801)
    const sk = bodies()[0]![1];
    const t = hitPoseRoom(sk, clips, table);
    t.hold({ right: 1, raised: true });
    const origin = (t.room as unknown as { feetOrigin: [number, number, number] }).feetOrigin;
    const poser = new HitPoser(sk.skeleton, motion), bare = new PageCopy(sk, clips, table, false), page = new PageCopy(sk, clips, table, true);
    for (let i = 0; i < 60; i++) {
      t.run(1);
      const p = t.room.player(2)!, tilt = p.sim.walker.rootTilt.q;
      const body = bodyOf(2, p.sim.body(), { ...EXTRAS, raised: true });
      const snap = { ...snapshotOf(decodeSnapshot(encodeSnapshot({ tick: t.room.tick, own: null, bodies: [body] }, origin)).bodies[0]!), rootTilt: tilt } as Wide;
      poser.stepBody(DT, body, tilt); bare.step(snap); page.step(snap);
    }
    const played = bare.anim.stats().clip;
    expect(played, played).not.toBe('seal_stand');
    expect(FIRE_VERSIONS[played], played).toBeUndefined();
    expect(page.weight()).toBe(0);
    expect(same(poser.boxes(), posedBoxes(bare.skeleton)), 'strafe').toBe(true);
  });

  it("the launcher in the hand: the room's transcription answers as the page's `remoteLauncherInHand` does", () => {
    const lower = (name: string, reversed: boolean) => ({ name, reversed, t: 0.1, seconds: 1 }) as unknown as Parameters<typeof launcherInHand>[1];
    for (const item of [255, 1, 30, 121, 141, 145, 150, 151]) {
      for (const action of [null, lower('rifleToLauncher', true), lower('rifleToLauncher', false), lower('pistolToLauncher', true), lower('swapStand', true)]) {
        for (const inHand of [null, 145]) expect(launcherInHand(item, action, inHand), `${item} ${JSON.stringify(action)} ${inHand}`).toBe(remoteLauncherInHand(item, action, inHand));
      }
    }
  });

  it('(4) the rewind: raised at t, lowered at t + n -- the ring gives the raised pose at t and the kept weight at t + n (FL.R2)', () => {
    for (const [label, sk] of bodies()) {
      const n = 12;
      const poser = new HitPoser(sk.skeleton, motion, 64), page = new PageCopy(sk, clips, table, true);
      let stamp = 0, at: { stamp: number; boxes: BoneBox[]; weight: number }[] = [];
      drive(sk, 90 + n, (i) => ({ raised: i < 90 }), (body, snap, tilt) => {
        poser.stepBody(DT, body, tilt); page.step(snap);
        stamp = poser.keep();
        at.push({ stamp, boxes: posedBoxes(page.skeleton), weight: page.weight() });
      });
      const then = at[89]!, now = at[89 + n]!;
      expect(then.weight, label).toBe(1);
      expect(now.weight, label).toBeGreaterThan(0);
      expect(now.weight, label).toBeLessThan(1);
      expect(same(poser.boxesAt(then.stamp)!, then.boxes), `${label}: t raised`).toBe(true);
      expect(same(poser.boxesAt(now.stamp)!, now.boxes), `${label}: t + n at the kept weight`).toBe(true);
      at = [];
    }
    // through the room: a round at t meets the raised left hand first; now, lowered for 60 ticks, it does not
    const sk = bodies()[0]![1], lhand = sk.skeleton.part('lhand').index;
    const t = hitPoseRoom(sk, clips, table);
    t.hold({ raised: true });
    t.run(60);
    const tick = t.room.tick;
    const poser = (t.room.player(2) as unknown as { poser: { pose: HitPoser } }).poser.pose;
    const box = poser.boxes().find((b) => b.bone === lhand)!, bb = box.box;
    const c = transformPoint(Float32Array.from(box.w), (bb[0]! + bb[3]!) / 2, (bb[1]! + bb[4]!) / 2, (bb[2]! + bb[5]!) / 2);
    const s = t.room.player(2)!.sim.walker.state, feet: V3 = [s.x, s.y, s.z];
    const from = toWorld(feet, s.yaw, [c[0]!, c[1]!, -40]), back = toWorld(feet, s.yaw, [c[0]!, c[1]!, 0]);
    const dir: V3 = [(back[0] - from[0]) / 40, (back[1] - from[1]) / 40, (back[2] - from[2]) / 40];
    t.hold({ raised: false });
    t.run(60);
    type Hit = { distance: number; tag?: { id: number; part: number; bone: number } };
    const firstAt = (when: number): Hit['tag'] | undefined => (t.room as unknown as { rewoundBodies(p: unknown, f: V3, d: V3, r: number, at: number): Hit[] })
      .rewoundBodies(t.room.player(1)!, from, dir, 80, when).filter((h) => h.tag?.id === 2).sort((a, b) => a.distance - b.distance)[0]?.tag;
    expect(firstAt(tick)?.bone, 'at t').toBe(lhand);
    expect(firstAt(t.room.tick)?.bone, 'now, lowered').not.toBe(lhand);
  });
});
