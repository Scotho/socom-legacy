import { describe, expect, it } from 'vitest';
import { PLACE_CLAYMORE_ANIM, PUT_ON_WALL_ANIM, sampleClip, Skeleton, THROW_ANIMS, transformPoint, type MotionClip } from '@s2u/scene';
import { Animator, type MoverSnapshot } from '../../viewer/src/animator';
import { HEAD_LOOK_NODES } from '../../viewer/src/headLook';
import type { Firearm } from '../../viewer/src/kit';
import { bodyOf, snapshotOf } from '../../viewer/src/net/body';
import { decodeSnapshot, encodeSnapshot } from '../../viewer/src/net/codec';
import { HIT_POSE_CLIPS, HIT_POSE_LAYERS_READING, HitPoser } from '../../viewer/src/net/hitPose';
import { BODY_CULL_BOX, posedBoxes, type BoneBox } from '../../viewer/src/net/hitVolumes';
import type { Command } from '../../viewer/src/net/protocol';
import { aimRoot, ROOT_POSE_SLACK_PLACEHOLDER } from '../../viewer/src/net/shotCone';
import type { HoldClip } from '../../viewer/src/mover';
import { clipsFromPack, motionTableFromArchive, type MotionTable } from '../../viewer/src/motionTable';
import { reloadCut } from '../../viewer/src/play';
import { remoteKitOf } from '../../viewer/src/remotePlayers';
import { Button, STANCE_CODES } from '../../viewer/src/sim';
import { simSkeletonsFromBytes, type SimSkeleton } from '../../viewer/src/simMap';
import { THROW_CLIPS, ThrowPose } from '../../viewer/src/throwPose';
import { FIRE_VERSIONS, WeaponPose } from '../../viewer/src/weaponPose';
import { RaiseFeed, WeaponRaise } from '../../viewer/src/weaponRaise';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { EXTRAS, hitPoseRoom, PAGE_CLIPS } from './helpers/hitPoseRoom';

/**
 * PRONE-THROW-HITBOX (the finding of 2026-11-25, match 5321-6-1795582723449: a prone thrower hit-tested lying flat while
 * every shooter aimed at the drawn throw; reading, pending review): the room's hit pose lays the THROW layer as the page
 * lays it on a remote copy -- the throw's, the toss's or the placing's clip started from the hold the body carries on the
 * wire (`BodyState.flags`' hold code and its serial bit), by the page's own `ThrowPose.follow` and `step`, on top of the
 * copy's `Animator` stack at weight 1 (`remotePlayers.ts` `frame`: `play.setItem(kit.item)`, then
 * `r.hands.follow(r.snap.hold ...)`, `r.hands.step(dt)`, then the play's frame; `play.ts` `addPoseLayer` lays it after
 * the Fire set and the reload) -- so the room's posed boxes are the drawn body's (A = B) through the throw.
 *
 * "The page" here is the remote copy's `Play` as `play.ts` builds and steps it, headless: `setItem` from `remoteKitOf`
 * (`remotePlayers.ts` :1036-1037), the raise on `RaiseFeed.input` with the copy's hand, the Fire weight, `WeaponPose.step`
 * with `reloadCut`, and the animator given `aimWeight` = the raise's weight (`play.ts` `bodyFrame` :900); its hands'
 * `ThrowPose` laid after the Fire and reload layers. "Bare" is the same copy with no throw layer -- the room's poser before
 * this task. The binoculars (laid between on the page) are down throughout. The thrower's hold is laid on the room's own
 * snapshot of B (`bodyOf` with the hold code), so the poser and the page take the same wire; the release key is the
 * page's `ThrowPose` phase reaching the clip's release fraction. The fixture disc's MP2 (`MP2.ZDB`, `MOTION_P.ZAR`,
 * `READERC.ZAR`): the SEAL. Unit-test evidence only.
 *
 * Two kinds of case. 'boxes': every bone's box, A = B. Prone, within `A_EQUALS_B` (no head look and no aim twist prone,
 * `Animator.aimWrites`); standing and crouched within `LOOK_SLACK` -- the page's lowered copy runs the head look at
 * `aimWeight` 0 (an identity turn, the rotator ahead and no glance in the run) where the poser's placeholder weight 1
 * does not, and the throws' `NoPitchtwist` keeps the twist off on both. 'tracked': the room's `ThrowPose` plays the
 * page's clip at the page's phase, and every part the clip tracks (the head-look nodes aside) has the page's local --
 * where the rest of the body cannot be A = B for a reason this task does not own: a placing (no `NoPitchtwist`: the
 * poser's aim twist at weight 1 against the page's at the lowered weight, `HIT_POSE_LAYERS_READING`'s `aimWeight` gap),
 * a peek toss (`LEAN_HIT_POSE_READING` 'held': the room poses the lean at its held key, the page the traversal's own),
 * and the pistol's hand (the page's copy plays the pistol's set beneath, the room the rifle's: FL.R3).
 */

const MP2 = fixture('RUN/MP2.ZDB'), PACK = fixture('RUN/MOTION_P.ZAR'), READERC = fixture('RUN/READERC.ZAR');
const DT = 1 / 60;
/** HIT-POSE's own A = B tolerance (`hitPoseProne.test.ts`): the same code on the same floats. */
const A_EQUALS_B = 1e-6;
/** The standing and crouched cases' tolerance: the page's head look at weight 0 composes an identity turn the poser does not. */
const LOOK_SLACK = 1e-4;

type Wide = MoverSnapshot & ReturnType<typeof snapshotOf>;

/** The remote copy's play, headless (`play.ts` `rebuild` and `frame`, `remotePlayers.ts` `frame`); `throwLayer` false: bare. */
class PageCopy {
  readonly skeleton: Skeleton;
  readonly anim: Animator;
  readonly pose: WeaponPose;
  readonly hands: ThrowPose;
  private readonly raise = new WeaponRaise();
  private readonly feed = new RaiseFeed();
  /** `Play.item`: the rifle until `setItem` (`remotePlayers.ts`' copy starts on the rifle). */
  private item: Firearm = 'rifle';
  constructor(sk: SimSkeleton, clips: readonly MotionClip[], table: MotionTable | null, throwLayer: boolean) {
    this.skeleton = new Skeleton(sk.skeleton.model, sk.skeleton.modelMatrix, sk.skeleton.parts);
    this.anim = new Animator(this.skeleton, clips, table, { random: () => 0 });
    const byName = new Map(clips.map((c) => [c.name, c]));
    this.pose = new WeaponPose(byName, table);
    this.anim.setWeapon('rifle');
    this.pose.item = 'rifle';
    this.anim.addPoseLayer(this.pose.fireLayer);
    this.anim.addPoseLayer(this.pose.reloadLayer);
    this.hands = new ThrowPose(() => ({ clips: byName, table }));
    if (throwLayer) this.anim.addPoseLayer(this.hands.layer);
  }
  /** `play.ts` `setItem`. */
  private setItem(item: Firearm): void {
    if (item !== this.item) this.feed.firearmChanged();
    this.item = item;
    this.anim.setWeapon(item);
    this.pose.item = item;
  }
  step(snap: Wide): void {
    // `remotePlayers.ts` `frame`: the kit's item set on the play (:1036-1037), the hands follow the wire's hold (the
    // pistol's version with the sidearm in the hand) and step by the frame, then the play's frame
    const kit = remoteKitOf(snap);
    if (kit.item !== this.item) this.setItem(kit.item);
    if (snap.alive) this.hands.follow(snap.hold ?? null, kit.item === 'pistol', snap.holdSerial);
    else { this.hands.follow(null, false); this.hands.stop(); }
    this.hands.step(DT);
    // `play.ts` `frame`: the raise on the copy's hand, the Fire weight (no launcher set here), the Fire clip's clock and
    // the reload's cut, the raise's weight as the animator's `aimWeight` (`bodyFrame`)
    const w = this.raise.frame(DT, this.feed.input(snap, this.item === 'pistol', { trigger: snap.trigger, aiming: snap.aiming, raised: snap.raised }, null), DT);
    this.pose.fireWeight = w;
    this.pose.step(DT, reloadCut(snap), snap.airborne);
    this.anim.step(DT, { ...snap, aimWeight: w });
  }
}

/** A box's point at the fractions `f` of its extent, body frame (`hitPoseProne.test.ts`). */
const at = (b: BoneBox, f: readonly number[]): number[] => {
  const p = [0, 1, 2].map((k) => b.box[k]! + (b.box[3 + k]! - b.box[k]!) * f[k]!), w = b.w;
  return [0, 1, 2].map((r) => p[0]! * w[r]! + p[1]! * w[4 + r]! + p[2]! * w[8 + r]! + w[12 + r]!);
};
const CORNERS = [0, 1].flatMap((x) => [0, 1].flatMap((y) => [0, 1].map((z) => [x, y, z])));
/** The worst corner's distance between two sets of the same bones' boxes, per axis. */
const gap = (a: readonly BoneBox[], b: readonly BoneBox[]): number => {
  expect(a.length).toBe(b.length);
  let worst = 0;
  a.forEach((c, i) => {
    expect(c.bone).toBe(b[i]!.bone);
    for (const f of CORNERS) {
      const p = at(c, f), q = at(b[i]!, f);
      for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(p[k]! - q[k]!));
    }
  });
  return worst;
};

/**
 * The first of `boxes` a level line across the body (body frame: x from -60 to 60, at height `y` and depth `z`, through
 * the body's axis x = 0) meets, or null -- the line taken into each box's bone frame (column k of `w` its axis k) and
 * clipped against the box's extent.
 */
const meets = (boxes: readonly BoneBox[], y: number, z: number): BoneBox | null => {
  for (const b of boxes) {
    const w = b.w, e = b.box;
    let lo = -60, hi = 60, ok = true;
    for (let k = 0; k < 3 && ok; k++) {
      const cx = w[4 * k]!, cy = w[4 * k + 1]!, cz = w[4 * k + 2]!, n2 = cx * cx + cy * cy + cz * cz;
      const base = (cx * (0 - w[12]!) + cy * (y - w[13]!) + cz * (z - w[14]!)) / n2, slope = cx / n2;
      const min = e[k]!, max = e[3 + k]!;
      if (Math.abs(slope) < 1e-12) { if (base < min || base > max) ok = false; continue; }
      let a = (min - base) / slope, c = (max - base) / slope;
      if (a > c) [a, c] = [c, a];
      lo = Math.max(lo, a); hi = Math.min(hi, c);
      if (lo > hi) ok = false;
    }
    if (ok) return b;
  }
  return null;
};

type Stance = 'stand' | 'crouch' | 'prone';
/**
 * A case: B settled in `stance` (`held`: the command fields held from the first tick, a lean's button), with the sidearm
 * when `weapon` is 1, then carrying `hold` from the next tick on; the clip the hands play (`clip`) and its release
 * fraction; how it is judged (`judge`, the file's note).
 */
interface Case { stance: Stance; hold: HoldClip; clip: string; release: number; judge: 'boxes' | 'tracked'; held?: Partial<Command>; weapon?: 0 | 1 }

const CASES: readonly Case[] = [
  { stance: 'prone', hold: 'seal_prone_throwgrenade', clip: 'seal_prone_throwgrenade', release: THROW_ANIMS.proneThrow.release, judge: 'boxes' },
  { stance: 'prone', hold: 'seal_prone_tossgrenade', clip: 'seal_prone_tossgrenade', release: THROW_ANIMS.proneToss.release, judge: 'boxes' },
  { stance: 'crouch', hold: 'seal_crouch_throwgrenade', clip: 'seal_crouch_throwgrenade', release: THROW_ANIMS.crouchThrow.release, judge: 'boxes' },
  { stance: 'stand', hold: 'seal_throwgrenade', clip: 'seal_throwgrenade', release: THROW_ANIMS.standThrow.release, judge: 'boxes' },
  { stance: 'stand', hold: 'seal_tossgrenade', clip: 'seal_tossgrenade', release: THROW_ANIMS.standToss.release, judge: 'boxes' },
  { stance: 'stand', hold: 'seal_place_claymore', clip: 'seal_place_claymore', release: PLACE_CLAYMORE_ANIM.release, judge: 'tracked' },
  { stance: 'stand', hold: 'seal_put_onwall', clip: 'seal_put_onwall', release: PUT_ON_WALL_ANIM.release, judge: 'tracked' },
  // a peek toss over the held lean (`LEAN_HIT_POSE_READING` 'held')
  { stance: 'stand', hold: 'seal_toss_rlean', clip: 'seal_toss_rlean', release: THROW_ANIMS.peekRightToss.release, judge: 'tracked', held: { buttons: Button.LeanRight } },
  // the pistol's hand: `handAnim` swaps the peek toss for its pistol pair (`PISTOL_HAND_SWAP_CLIPS`), the room's
  // `remoteKitOf(...).item === 'pistol'` branch
  { stance: 'stand', hold: 'seal_toss_rlean', clip: 'seal_p_toss_rlean', release: THROW_ANIMS.peekRightToss.release, judge: 'tracked', held: { buttons: Button.LeanRight }, weapon: 1 },
];

describe.skipIf(!MP2 || !PACK || !READERC)(`PRONE-THROW-HITBOX: the room's hit pose lays the throw layer${MP2 && PACK && READERC ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const skeletons = MP2 && PACK && READERC ? simSkeletonsFromBytes(MP2, READERC, PACK) : { seal: [], terrorist: [], escortees: [] };
  const clips = PACK ? clipsFromPack(PACK, [...new Set([...PAGE_CLIPS, ...Object.values(FIRE_VERSIONS), ...THROW_CLIPS])]) : [];
  const table = READERC ? motionTableFromArchive(READERC) : null;
  const seal = (): SimSkeleton => skeletons.seal[0]!;

  type Hands = { clip: string | null; phase: number; weight: number } | null;
  type Key = {
    phase: number; clip: string | null; weight: number; room: BoneBox[]; page: BoneBox[]; bare: BoneBox[];
    roomHands: Hands; roomLocal: Float32Array[]; pageLocal: Float32Array[];
  };
  type Run = { before: Key; release: Key; roots: { room: number | null; page: number | null }[] };

  /**
   * B in the room (`helpers/hitPoseRoom`), settled in the case's stance, then carrying its hold on the wire from the
   * next tick on; the room's poser on the server skeleton's own motion (`SimSkeleton.motion`: `HIT_POSE_CLIPS` as
   * `simMap` loads them), the page's copy and the bare copy each stepped on the same snapshot every tick. Returns the
   * release key (the first tick whose throw phase reaches the release fraction), the key before it, and each held tick's
   * posed roots (the room poser's `rootY`, the page copy's `Animator.rootY`).
   */
  const throwRun = (c: Case): Run => {
    const sk = seal();
    const t = hitPoseRoom(sk, clips, table);
    if (c.held) t.hold(c.held);
    const origin = (t.room as unknown as { feetOrigin: [number, number, number] }).feetOrigin;
    const poser = new HitPoser(sk.skeleton, sk.motion!);
    const inside = poser as unknown as { hands?: ThrowPose | null; skeleton: Skeleton };
    const page = new PageCopy(sk, clips, table, true), bare = new PageCopy(sk, clips, table, false);
    const settle = c.stance === 'prone' ? 120 : 60;                  // the stand->prone clip (57 ticks) run out
    const press: Partial<Command> = c.stance === 'stand' ? {} : { buttons: Button.Stance, stance: STANCE_CODES.indexOf(c.stance) };
    const roots: Run['roots'] = [];
    let prev: Key | null = null;
    for (let i = 0; i < settle + 240; i++) {
      t.run(1, i === 0 ? press : {});
      const p = t.room.player(2)!, tilt = p.sim.walker.rootTilt.q, s = p.sim.body();
      const extras = { ...EXTRAS, weapon: c.weapon ?? 0 };
      const body = bodyOf(2, i >= settle ? { ...s, hold: c.hold, holdSerial: 0 } : s, extras);
      const snap = { ...snapshotOf(decodeSnapshot(encodeSnapshot({ tick: t.room.tick, own: null, bodies: [body] }, origin)).bodies[0]!), rootTilt: tilt } as Wide;
      poser.stepBody(DT, body, tilt); page.step(snap); bare.step(snap);
      if (i < settle) continue;
      expect(snap.stance, `${c.clip}: B's stance`).toBe(c.stance);
      expect(snap.hold, `${c.clip}: the hold on the wire`).toBe(c.hold);
      roots.push({ room: poser.rootY(), page: page.anim.rootY() });
      const st = page.hands.stats(), rh = inside.hands ? inside.hands.stats() : null;
      const key: Key = {
        phase: st.phase, clip: st.clip, weight: st.weight, room: poser.boxes(), page: posedBoxes(page.skeleton), bare: posedBoxes(bare.skeleton),
        roomHands: rh ? { clip: rh.clip, phase: rh.phase, weight: rh.weight } : null,
        roomLocal: inside.skeleton.local.map((m) => Float32Array.from(m)), pageLocal: page.skeleton.local.map((m) => Float32Array.from(m)),
      };
      if (key.phase >= c.release) {
        expect(prev, `${c.clip}: a key before the release`).not.toBeNull();
        return { before: prev!, release: key, roots };
      }
      prev = key;
    }
    throw new Error(`${c.clip}: the release phase ${c.release} never reached`);
  };

  /** The level line through the body's axis at the drawn right hand's box middle (the page's), against the room's boxes. */
  const handLine = (k: Key): { y: number; z: number; met: BoneBox | null } => {
    const rhand = seal().skeleton.part('rhand').index;
    const box = k.page.find((b) => b.bone === rhand);
    expect(box, 'the drawn right hand has a box').toBeDefined();
    const bb = box!.box;
    const c = transformPoint(Float32Array.from(box!.w), (bb[0]! + bb[3]!) / 2, (bb[1]! + bb[4]!) / 2, (bb[2]! + bb[5]!) / 2);
    return { y: c[1]!, z: c[2]!, met: meets(k.room, c[1]!, c[2]!) };
  };

  /** The worst element of the locals of the parts `clip` tracks (the head-look nodes aside), the room's against the page's. */
  const trackedGap = (clip: string, k: Key): number => {
    const motion = clips.find((m) => m.name === clip);
    expect(motion, `${clip}: in the page's clips`).toBeDefined();
    const look: ReadonlySet<string> = new Set(HEAD_LOOK_NODES);
    const names = sampleClip(motion!, 0, { loop: false }).parts.map((p) => p.name).filter((n) => !look.has(n));
    expect(names.length, `${clip}: tracked parts`).toBeGreaterThan(0);
    let worst = 0;
    for (const name of names) {
      const i = seal().skeleton.indexOf(name);
      if (i < 0) continue;
      const a = k.roomLocal[i]!, b = k.pageLocal[i]!;
      for (let e = 0; e < 16; e++) worst = Math.max(worst, Math.abs(a[e]! - b[e]!));
    }
    return worst;
  };

  it("the clips: every throw and placing clip the page's hands play is among the room's (HIT_POSE_CLIPS and the server skeleton's motion); the reading is 'fire-throw-reload' (RELOAD-HITPOSE)", () => {
    const held = new Set(seal().motion!.clips.map((c) => c.name));
    for (const name of THROW_CLIPS) {
      expect(HIT_POSE_CLIPS, name).toContain(name);
      expect(held.has(name), name).toBe(true);
    }
    expect(HIT_POSE_LAYERS_READING).toBe('fire-throw-reload');
  });

  for (const c of CASES) {
    const label = `${c.stance}${c.held ? ' leaning' : ''}${c.weapon === 1 ? ' pistol' : ''}, ${c.hold}'s hold (${c.clip})`;
    if (c.judge === 'boxes') {
      it(`${label}: at the release key and the key before, every room box is the drawn clip's (A = B); a level line at the drawn hand's height meets a room box`, () => {
        const run = throwRun(c), tol = c.stance === 'prone' ? A_EQUALS_B : LOOK_SLACK;
        for (const [when, k] of [['before the release', run.before], ['at the release', run.release]] as const) {
          expect(k.clip, when).toBe(c.clip);
          expect(k.weight, when).toBe(1);
          expect(gap(k.page, k.bare), `${when}: the clip moves the drawn boxes`).toBeGreaterThan(1);
          expect(gap(k.room, k.page), `${when}: A = B with the throw layer`).toBeLessThanOrEqual(tol);
        }
        const line = handLine(run.release);
        console.log(`PRONE-THROW-HITBOX ${label}: the drawn right hand's middle at the release key y ${line.y.toFixed(2)} z ${line.z.toFixed(2)}; the room's first box on the level line: ${line.met ? seal().skeleton.parts[line.met.bone]!.name : 'none'}`);
        expect(line.met, "the level line at the drawn hand's height meets a room box").not.toBeNull();
      });
    } else {
      it(`${label}: at the release key and the key before, the room's hands play the page's clip at its phase and every part the clip tracks has the page's local`, () => {
        const run = throwRun(c);
        for (const [when, k] of [['before the release', run.before], ['at the release', run.release]] as const) {
          expect(k.clip, when).toBe(c.clip);
          expect(k.roomHands?.clip, `${when}: the room's hands`).toBe(c.clip);
          expect(k.roomHands?.phase, `${when}: the room's phase`).toBe(k.phase);
          expect(k.roomHands?.weight, `${when}: the room's weight`).toBe(k.weight);
          const g = trackedGap(c.clip, k);
          console.log(`PRONE-THROW-HITBOX ${label} ${when}: the tracked parts' worst local gap ${g.toExponential(2)}; every box's ${gap(k.room, k.page).toFixed(3)}`);
          expect(g, `${when}: the tracked parts' locals`).toBeLessThanOrEqual(LOOK_SLACK);
        }
      });
    }
  }

  /**
   * The thrower's own aim root (JUMP-AIM-ROOT, LATER 661): a prone body's eye stands on the posed root whatever it plays
   * (`aimRoot`; `room.ts` `aimRootOf` reads the room poser's `rootY`, the page's `WalkMode.startBody` its own `Play`
   * animator's, `walk.ts` `setPosedRoot`). With the throw layer in the room both follow the throw clip's root: through
   * every held tick of the prone throws the room's answer is the page's, within `ROOT_POSE_SLACK_PLACEHOLDER` (the
   * room's tolerance) and to A = B. The one tick the room reads behind (`JUMP_AIM_ROOT_CLOCK_READING` 'last-tick') is
   * that reading's, not compared here.
   */
  it("the thrower's aim root: through a prone throw the room's aimRoot (the poser's rootY) is the page's posedRoot rule's", () => {
    for (const c of CASES.filter((x) => x.stance === 'prone')) {
      const { roots } = throwRun(c);
      let worst = 0, lowest = Infinity, highest = -Infinity;
      for (const r of roots) {
        const room = aimRoot(null, { action: null, posture: 'prone' }, () => r.room);
        const page = aimRoot(null, { action: null, posture: 'prone' }, () => r.page);
        expect(room, `${c.hold}: the room's aim root`).not.toBeNull();
        expect(page, `${c.hold}: the page's aim root`).not.toBeNull();
        worst = Math.max(worst, Math.abs(room! - page!));
        lowest = Math.min(lowest, page!); highest = Math.max(highest, page!);
      }
      console.log(`PRONE-THROW-HITBOX aim root ${c.hold}: ${roots.length} held ticks, the page's posed root ${lowest.toFixed(3)}..${highest.toFixed(3)}, the room's worst gap ${worst.toExponential(2)}`);
      expect(worst, `${c.hold}: within ROOT_POSE_SLACK_PLACEHOLDER`).toBeLessThanOrEqual(ROOT_POSE_SLACK_PLACEHOLDER);
      expect(worst, `${c.hold}: A = B`).toBeLessThanOrEqual(A_EQUALS_B);
    }
  });

  /**
   * The original's whole-body cull (`BODY_CULL_BOX`, `FUN_00553ea0` D:L419728-419742; research 398 s1): one fixed box,
   * (-12, 0, -14) to (12, 20, 14) over the soles, refuses a line before any bone. The port's cull is widened to the posed
   * boxes' bounds (`BODY_CULL_FRAME_READING`), so it never refuses a line that enters a bone; this holds that the raised
   * prone thrower's boxes stand inside the ORIGINAL's box on its top, its sides and its ends, so the original's cull would
   * not refuse a round the drawn throw meets. The bottom face is not held: a prone body's toe already stands up to 3.2
   * under the soles without a throw (`hitVolumes.ts`, `BODY_CULL_FRAME_READING`'s measure).
   */
  it("the whole-body cull: the prone thrower's room boxes at the release key stand inside BODY_CULL_BOX's top, sides and ends", () => {
    for (const c of CASES.filter((x) => x.stance === 'prone')) {
      const k = throwRun(c).release;
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (const b of k.room) {
        if (b.box[0]! > b.box[3]! || b.box[1]! > b.box[4]! || b.box[2]! > b.box[5]!) continue;   // an empty box (spinelo's)
        for (const f of CORNERS) {
          const p = at(b, f);
          for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a]!, p[a]!); hi[a] = Math.max(hi[a]!, p[a]!); }
        }
      }
      console.log(`PRONE-THROW-HITBOX cull ${c.hold}: the room's boxes span x ${lo[0]!.toFixed(2)}..${hi[0]!.toFixed(2)} y ${lo[1]!.toFixed(2)}..${hi[1]!.toFixed(2)} z ${lo[2]!.toFixed(2)}..${hi[2]!.toFixed(2)}; BODY_CULL_BOX ${Array.from(BODY_CULL_BOX).join(', ')}`);
      expect(hi[1]!, `${c.hold}: under the top`).toBeLessThanOrEqual(BODY_CULL_BOX[4]!);
      expect(lo[0]!, `${c.hold}: inside the left side`).toBeGreaterThanOrEqual(BODY_CULL_BOX[0]!);
      expect(hi[0]!, `${c.hold}: inside the right side`).toBeLessThanOrEqual(BODY_CULL_BOX[3]!);
      expect(lo[2]!, `${c.hold}: inside the front end`).toBeGreaterThanOrEqual(BODY_CULL_BOX[2]!);
      expect(hi[2]!, `${c.hold}: inside the back end`).toBeLessThanOrEqual(BODY_CULL_BOX[5]!);
    }
  });
});
