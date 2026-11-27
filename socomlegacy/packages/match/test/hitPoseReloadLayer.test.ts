import { describe, expect, it } from 'vitest';
import { arsenalOf, DEFAULT_RIFLE, HELD_SIDEARM, sampleClip, Skeleton, type Loadout, type MotionClip, type WeaponRecord } from '@s2u/scene';
import { Animator, type MoverSnapshot } from '../../viewer/src/animator';
import type { Firearm } from '../../viewer/src/kit';
import { snapshotOf } from '../../viewer/src/net/body';
import { decodeSnapshot, encodeSnapshot } from '../../viewer/src/net/codec';
import { PART } from '../../viewer/src/net/damage';
import * as hitPose from '../../viewer/src/net/hitPose';
import { posedBoxes, type BoneBox } from '../../viewer/src/net/hitVolumes';
import type { BodyState, ServerEvent } from '../../viewer/src/net/protocol';
import { clipsFromPack, motionTableFromArchive, type MotionTable } from '../../viewer/src/motionTable';
import { reloadCut } from '../../viewer/src/play';
import { remoteKitOf } from '../../viewer/src/remotePlayers';
import { ALL_RELOAD_CLIPS, RELOAD_CLIPS, type ReloadItem, type ReloadStance } from '../../viewer/src/reloadClip';
import { Button, STANCE_CODES, type Command, type SimKits } from '../../viewer/src/sim';
import { simSkeletonsFromBytes, type SimSkeleton } from '../../viewer/src/simMap';
import { THROW_CLIPS, ThrowPose } from '../../viewer/src/throwPose';
import { FIRE_VERSIONS, WeaponPose } from '../../viewer/src/weaponPose';
import { RaiseFeed, WeaponRaise } from '../../viewer/src/weaponRaise';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { hitPoseRoom, PAGE_CLIPS } from './helpers/hitPoseRoom';

/**
 * RELOAD-HITPOSE (the pilot's hit-pose audit, 2026-11-25, "MEASURED": in a rendered run the page's drawn body stood up to
 * 8.6 u from the room's posed boxes through a still reload standing, 5.8 crouched, 7.6 prone, and up to 7.2 u through the
 * moving reload's overlay; reading, pending review): the room's hit pose plays the RELOAD the pages draw. The page starts
 * another body's reload clip from the room's take (`room.ts` `reload` broadcasts `reloadSound` with the posture, `moving`,
 * the clip family and the seconds its lock was set from; `netPage.ts` `case 'reloadSound'` -> `remotePlayers.ts`
 * `RemotePlayers.reload` -> `play.ts` `Play.remoteReload` -> `WeaponPose.startReload`), runs it on its own clock with the
 * copy's replicated stick cutting a still clip (`play.ts` `frame`: `weaponPose.step(dt, reloadCut(snap), snap.airborne)`),
 * and ends it on a flinch (a crouched or prone still clip only) and on a death (`Play.stopRemoteReload`). The room's
 * poser lays `WeaponPose.reloadLayer` already (FL-1) and must start and end it alike, so its boxes are the drawn body's
 * (A = B) through the reload.
 *
 * The original's (r0001 lines (D:L), r0004 twins per the atlas; reading, pending review): a still reload is pushed on
 * the action stack's top (`CZSealBody::Reload` `FUN_005a82e0` D:L462815-462941, r0004 0x5ae000 unchanged), the moving
 * reload plays on the second channel (`+0x1e4`), and the pose pass draws the stack and then that channel
 * (`FUN_00577ea0` D:L437415-437470, its overlay D:L437456-437461; r0004 0x57d280 unchanged), so the round meets the
 * bones in the posed reload.
 *
 * "The page" here is the remote copy's `Play` as `play.ts` builds and steps it, headless (`hitPoseThrowLayer.test.ts`'s
 * `PageCopy`: `setItem` from `remoteKitOf`, the raise on the copy's hand, the Fire weight, `WeaponPose.step` with
 * `reloadCut` and `airborne`, `aimWeight` = the raise's weight, the hands laid after the Fire and reload layers), given
 * the room's events as `netPage.ts` gives them: `reloadSound` -> `RemotePlayers.reload` (its guards) -> `remoteReload`;
 * `flinch` -> `stopRemoteReload('flinch')`; `kill` -> `stopRemoteReload('death')`. "Bare" is the same copy never told the
 * reload. "The room's poser" is the room's own (`Player.poser`, stepped by `room.ts` `hitPose`), made anew at the case's
 * start -- as a spawn makes it -- the tick the page's copies are made, so the two clocks start together; each copy is fed
 * the room's own `BodyState` of B (`Room.body`) through the codec, as a page is. The fixture disc's MP2: the SEAL.
 * Unit-test evidence only; nothing here is a capture.
 */

const MP2 = fixture('RUN/MP2.ZDB'), PACK = fixture('RUN/MOTION_P.ZAR'), READERC = fixture('RUN/READERC.ZAR');
const DT = 1 / 60;
/** HIT-POSE's own A = B tolerance (`hitPoseProne.test.ts`): the same code on the same floats. */
const A_EQUALS_B = 1e-6;
/** Standing and crouched: the page's lowered copy runs the head look at `aimWeight` 0, the poser at its placeholder 1. */
const LOOK_SLACK = 1e-4;

/** `boneBoxes.test.ts`' kit: a rifle record and the sidearm, so the room takes a reload. */
const RIFLE: WeaponRecord = { ...DEFAULT_RIFLE };
const KIT = [RIFLE.id, HELD_SIDEARM.id, 255, 255, 255] as unknown as Loadout;
const KITS: SimKits = {
  table: { arsenal: arsenalOf(['ZAMMO', [], 'ZWEAPON', []] as never), records: new Map([[RIFLE.id, RIFLE], [HELD_SIDEARM.id, HELD_SIDEARM]]), rounds: new Map(), throwables: new Map() },
  map: {
    valves: new Map(), selectable: { seal: [], terrorist: [] },
    kits: { seal: [{ type: 'S', character: 's', loadout: KIT }], terrorist: [{ type: 'T', character: 't', loadout: KIT }] },
  },
} as unknown as SimKits;

type Wide = MoverSnapshot & ReturnType<typeof snapshotOf>;
type Take = { posture?: ReloadStance | null; seconds?: number; family?: ReloadItem | null; moving?: boolean };
/** `remotePlayers.ts` `RELOAD_FAMILIES`. */
const RELOAD_FAMILIES: ReadonlySet<string> = new Set<ReloadItem>(['rifle', 'pistol', 'shotgun', 'pump', 'm203']);

/** The remote copy's play, headless (`play.ts` `rebuild`, `frame`, `remoteReload`, `stopRemoteReload`); `told` false: bare. */
class PageCopy {
  readonly skeleton: Skeleton;
  readonly anim: Animator;
  readonly pose: WeaponPose;
  readonly hands: ThrowPose;
  private readonly raise = new WeaponRaise();
  private readonly feed = new RaiseFeed();
  private item: Firearm = 'rifle';
  /** `Play.stance`: the snapshot's, set in `frame`. */
  private stance: ReloadStance = 'stand';
  private alive = true;
  constructor(sk: SimSkeleton, clips: readonly MotionClip[], table: MotionTable | null, readonly told: boolean) {
    this.skeleton = new Skeleton(sk.skeleton.model, sk.skeleton.modelMatrix, sk.skeleton.parts);
    this.anim = new Animator(this.skeleton, clips, table, { random: () => 0 });
    const byName = new Map(clips.map((c) => [c.name, c]));
    this.pose = new WeaponPose(byName, table);
    this.anim.setWeapon('rifle');
    this.pose.item = 'rifle';
    this.anim.addPoseLayer(this.pose.fireLayer);
    this.anim.addPoseLayer(this.pose.reloadLayer);
    this.hands = new ThrowPose(() => ({ clips: byName, table }));
    this.anim.addPoseLayer(this.hands.layer);
  }
  /** `play.ts` `setItem`. */
  private setItem(item: Firearm): void {
    if (item !== this.item) this.feed.firearmChanged();
    this.item = item;
    this.anim.setWeapon(item);
    this.pose.item = item;
  }
  /** `remotePlayers.ts` `RemotePlayers.reload` (its guards), then `play.ts` `remoteReload`. */
  reload(take: Take): void {
    const seconds = take.seconds;
    if (!this.told || !this.alive || typeof seconds !== 'number' || !(seconds > 0)) return;
    const posture = take.posture === 'stand' || take.posture === 'crouch' || take.posture === 'prone' ? take.posture : null;
    const family = take.family && RELOAD_FAMILIES.has(take.family) ? take.family : null;
    this.pose.startReload(posture ?? this.stance, seconds, family, take.moving === true);
  }
  /** `play.ts` `stopRemoteReload`. */
  stopRemoteReload(why: 'death' | 'flinch'): void {
    if (!this.told) return;
    if (why === 'death') this.alive = false;
    if (why === 'flinch' && this.pose.stillHeld() !== true) return;
    this.pose.stopReload();
  }
  step(snap: Wide): void {
    const kit = remoteKitOf(snap);
    if (kit.item !== this.item) this.setItem(kit.item);
    if (snap.alive) this.hands.follow(snap.hold ?? null, kit.item === 'pistol', snap.holdSerial);
    else { this.hands.follow(null, false); this.hands.stop(); }
    this.hands.step(DT);
    this.stance = snap.stance;
    const w = this.raise.frame(DT, this.feed.input(snap, this.item === 'pistol', { trigger: snap.trigger, aiming: snap.aiming, raised: snap.raised }, null), DT);
    this.pose.fireWeight = w;
    this.pose.step(DT, reloadCut(snap), snap.airborne);
    this.anim.step(DT, { ...snap, aimWeight: w });
  }
}

/** A box's point at the fractions `f` of its extent, body frame (`hitPoseThrowLayer.test.ts`). */
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

type Stance = 'stand' | 'crouch' | 'prone';
/** The room's poser, read inside: its pose and its reload layer's `WeaponPose`. */
type RoomPoser = { pose: { boxes(): BoneBox[]; weapon: WeaponPose } } | null;
type Inside = { poser: RoomPoser; alive: boolean };
type RoomInside = { body(p: unknown): BodyState; feetOrigin: [number, number, number]; flinch(v: unknown, part: number, was: number): void; kill(v: unknown, k: null, w: null, how: string, cause: number): void };

/**
 * A case: B settled in `stance` (`stick`: the forward stick held from the settle on, facing away from A -- the moving
 * reload), then asks a reload; `end`, what is done to B at the reload's middle (a flinch or a death), else nothing.
 */
interface Case { stance: Stance; moving: boolean; clip: string; end?: 'flinch' | 'death' }

const CASES: readonly Case[] = [
  { stance: 'stand', moving: false, clip: RELOAD_CLIPS.stand },
  { stance: 'crouch', moving: false, clip: RELOAD_CLIPS.crouch },
  { stance: 'prone', moving: false, clip: RELOAD_CLIPS.prone },
  { stance: 'stand', moving: true, clip: RELOAD_CLIPS.moving },
];

describe.skipIf(!MP2 || !PACK || !READERC)(`RELOAD-HITPOSE: the room's hit pose plays the reload the pages draw${MP2 && PACK && READERC ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const skeletons = MP2 && PACK && READERC ? simSkeletonsFromBytes(MP2, READERC, PACK) : { seal: [], terrorist: [], escortees: [] };
  const clips = PACK ? clipsFromPack(PACK, [...new Set([...PAGE_CLIPS, ...Object.values(FIRE_VERSIONS), ...THROW_CLIPS, ...ALL_RELOAD_CLIPS])]) : [];
  const table = READERC ? motionTableFromArchive(READERC) : null;
  const seal = (): SimSkeleton => skeletons.seal[0]!;

  type Key = { tick: number; phase: number; room: BoneBox[]; page: BoneBox[]; bare: BoneBox[]; roomReload: string | null; roomFrame: number; roomWeight: number; pageReload: string | null; pageFrame: number; pageWeight: number; tracked: number; trackedNames: number };
  type Run = { take: Take; keys: Key[]; after: { roomPoser: boolean; roomReload: string | null; pageReload: string | null; ended: boolean } | null };

  /**
   * The worst element of the locals of the parts `clip` tracks (on the skeleton), the room's against the page's, and how
   * many such parts were compared. Only the tracked parts: the moving overlay lays no `NoPitchtwist` (a main-channel
   * flag), so the parts it does not track carry the aim twist and the head look, which the poser runs at `aimWeight`'s
   * placeholder 1 where the page's lowered copy passes the raise's weight 0 (`HIT_POSE_LAYERS_READING`'s `aimWeight`
   * gap, unfed under FL.R3) -- as `hitPoseThrowLayer.test.ts` judges a placing.
   */
  const trackedGap = (clip: string, room: Skeleton, page: Skeleton): { worst: number; names: number } => {
    const motion = clips.find((m) => m.name === clip);
    expect(motion, `${clip}: in the page's clips`).toBeDefined();
    let worst = 0, names = 0;
    for (const part of sampleClip(motion!, 0, { loop: false }).parts) {
      const i = seal().skeleton.indexOf(part.name);
      if (i < 0) continue;
      names++;
      const a = room.local[i]!, b = page.local[i]!;
      for (let e = 0; e < 16; e++) worst = Math.max(worst, Math.abs(a[e]! - b[e]!));
    }
    return { worst, names };
  };

  /**
   * B in the room (`helpers/hitPoseRoom`, with the kit), settled in the case's stance; the room's poser made anew with the
   * page's copies; B asks a reload (`room.text` 'reload' at his last command); every tick after, the events seat 1's page
   * was sent are given to the copies (`netPage.ts`), the room steps, and the copies step on the room's `BodyState` of B.
   * Keys every tick of the clip; at its middle the case's `end` (the room's own `flinch` or `kill`), then 10 more ticks.
   */
  const reloadRun = (c: Case): Run => {
    const sk = seal();
    const t = hitPoseRoom(sk, clips, table, { kits: KITS });
    const R = t.room as unknown as RoomInside;
    const settle = c.stance === 'prone' ? 120 : 60;
    const press: Partial<Command> = c.stance === 'stand' ? {} : { buttons: Button.Stance, stance: STANCE_CODES.indexOf(c.stance) };
    if (c.moving) t.hold({ yaw: 270, forward: 1 });              // away from A, along +x: the flat floor's 900 u ahead
    t.run(settle, press);
    const p = t.room.player(2)! as unknown as Inside & Parameters<RoomInside['body']>[0] & { sim: { seq: number; walker: { rootTilt: { q: MoverSnapshot['rootTilt'] } } } };
    // the room's poser made anew, as at a spawn (`room.ts` `hitPose`), the tick the copies are made
    p.poser = null;
    const page = new PageCopy(sk, clips, table, true), bare = new PageCopy(sk, clips, table, false);
    let seen = t.events(1).length, take: Take | null = null, ended = false;
    const deliver = (): void => {
      const evs = t.events(1).slice(seen) as (ServerEvent & { id?: number; victim?: number })[];
      seen = t.events(1).length;
      for (const e of evs) {
        if ((e.type === 'kill' ? e.victim : e.id) !== 2) continue;
        if (e.type === 'reloadSound') { const k = e as unknown as Take; take = k; page.reload(k); bare.reload(k); }
        else if (e.type === 'flinch') { page.stopRemoteReload('flinch'); bare.stopRemoteReload('flinch'); ended = true; }
        else if (e.type === 'kill') { page.stopRemoteReload('death'); bare.stopRemoteReload('death'); ended = true; }
      }
    };
    const tick = (): void => {
      deliver();
      t.run(1);
      deliver();
      const s = (t.room.player(2)! as unknown as Inside);
      if (!s.alive) return;
      const body = R.body(p);
      const snap = { ...snapshotOf(decodeSnapshot(encodeSnapshot({ tick: t.room.tick, own: null, bodies: [body] }, R.feetOrigin)).bodies[0]!), rootTilt: p.sim.walker.rootTilt.q } as Wide;
      page.step(snap); bare.step(snap);
    };
    for (let i = 0; i < 4; i++) tick();                          // the copies and the new poser under way, still
    t.room.text(2, { type: 'reload', seq: p.sim.seq } as never);
    const keys: Key[] = [];
    let after: Run['after'] = null;
    for (let i = 0; i < 600; i++) {
      tick();
      expect(take, `${c.clip}: the room took the reload and told seat 1 (reloadSound with its take)`).not.toBeNull();
      const st = page.pose.stats();
      if (st.reload === null) break;
      const q = (t.room.player(2)! as unknown as Inside).poser;
      const rs = q ? q.pose.weapon.stats() : null;
      keys.push({
        tick: i, phase: st.reloadFrame, room: q ? q.pose.boxes() : [], page: posedBoxes(page.skeleton), bare: posedBoxes(bare.skeleton),
        roomReload: rs?.reload ?? null, roomFrame: rs?.reloadFrame ?? 0, roomWeight: rs?.reloadWeight ?? 0,
        pageReload: st.reload, pageFrame: st.reloadFrame, pageWeight: st.reloadWeight,
        ...(() => {
          const g = q ? trackedGap(st.reload, (q.pose as unknown as { skeleton: Skeleton }).skeleton, page.skeleton) : null;
          return { tracked: g ? g.worst : Infinity, trackedNames: g ? g.names : 0 };
        })(),
      });
      if (c.end && keys.length === 30) {
        // the case's end at the clip's 30th tick: the room's own flinch (a round's, `flinch`) or death (`kill`)
        if (c.end === 'flinch') R.flinch(p, PART.BODY, Infinity);
        else R.kill(p, null, null, 'fall', 0);
        for (let j = 0; j < 10; j++) tick();
        const q2 = (t.room.player(2)! as unknown as Inside).poser;
        after = { roomPoser: q2 !== null, roomReload: q2 ? q2.pose.weapon.stats().reload : null, pageReload: page.pose.stats().reload, ended };
        break;
      }
    }
    expect(take, `${c.clip}: the take`).not.toBeNull();
    return { take: take!, keys, after };
  };

  it("the clips: every reload clip the page's copy plays is among the room's (HIT_POSE_CLIPS; the rifle's in the server skeleton's motion); the reading is 'fire-throw-reload'", () => {
    const held = new Set(seal().motion!.clips.map((m) => m.name));
    for (const name of ALL_RELOAD_CLIPS) expect(hitPose.HIT_POSE_CLIPS, name).toContain(name);
    for (const name of Object.values(RELOAD_CLIPS)) expect(held.has(name), name).toBe(true);
    expect(hitPose.HIT_POSE_LAYERS_READING).toBe('fire-throw-reload');
  });

  it("the cut: the poser's stick cut (`hitPoseReloadCut`) is the page's `reloadCut` on every snapshot", () => {
    const cut = (hitPose as unknown as { hitPoseReloadCut?: (s: unknown) => boolean }).hitPoseReloadCut;
    expect(typeof cut, 'hitPoseReloadCut exported').toBe('function');
    const base = { turnRate: 0, airborne: false } as const;
    const snaps = [
      { ...base }, { ...base, cutStick: { forward: 0.05, right: 0 } }, { ...base, cutStick: { forward: 0.2, right: 0 } },
      { ...base, cutStick: { forward: 0, right: -0.5 } }, { ...base, turnRate: 100 }, { ...base, turnRate: 0.01 },
      { ...base, cutStick: { forward: 1, right: 0 }, airborne: true }, { ...base, cutStick: { forward: 1, right: 0 }, landedBare: true as const },
    ];
    for (const s of snaps) expect(cut!(s), JSON.stringify(s)).toBe(reloadCut(s as Parameters<typeof reloadCut>[0]));
  });

  for (const c of CASES) {
    const label = `${c.moving ? 'moving' : 'still'} ${c.stance} (${c.clip})`;
    it(`${label}: the room's poser plays the page's reload clip at its frame and weight; near its start and at its middle ${c.moving ? 'every part the overlay tracks has the page\'s local' : 'every room box is the drawn one\'s (A = B)'}; the drawn reload, fully in at its middle, moves the boxes over 1 u`, () => {
      const run = reloadRun(c);
      expect(run.take.posture, `${label}: the take's posture`).toBe(c.stance);
      expect(run.take.moving === true, `${label}: the take's moving`).toBe(c.moving);
      expect(run.keys.length, `${label}: the page's clip ran`).toBeGreaterThan(8);
      const keys = [['near its start', run.keys[3]!], ['at its middle', run.keys[Math.floor(run.keys.length / 2)]!]] as const;
      const tol = c.stance === 'prone' ? A_EQUALS_B : LOOK_SLACK;
      for (const [when, k] of keys) {
        expect(k.pageReload, `${when}: the page's clip`).toBe(c.clip);
        expect(k.roomReload, `${when}: the room's poser plays it`).toBe(c.clip);
        expect(k.roomFrame, `${when}: at the page's frame`).toBe(k.pageFrame);
        expect(k.roomWeight, `${when}: at the page's weight`).toBe(k.pageWeight);
        const moved = gap(k.page, k.bare), ab = gap(k.room, k.page);
        console.log(`RELOAD-HITPOSE ${label} ${when} (tick ${k.tick}, frame ${k.pageFrame.toFixed(2)}, weight ${k.pageWeight.toFixed(3)}): drawn vs bare ${moved.toFixed(3)} u; room vs drawn ${ab.toFixed(6)} u; tracked locals ${k.tracked.toExponential(2)} over ${k.trackedNames} parts`);
        // the start key is compared whatever its weight; the non-vacuity guard is the middle key's alone (below): near its
        // start the reload is still easing in (the overlay's weight from 0, the still clip's push over its `BlendTime`)
        if (c.moving) {
          expect(k.trackedNames, `${when}: the overlay tracks parts`).toBeGreaterThan(0);
          expect(k.tracked, `${when}: the overlay's tracked locals`).toBeLessThanOrEqual(LOOK_SLACK);
        } else expect(ab, `${when}: A = B with the reload layer`).toBeLessThanOrEqual(tol);
      }
      const mid = keys[1][1];
      expect(gap(mid.page, mid.bare), 'at its middle, the reload fully in: it moves the drawn boxes').toBeGreaterThan(1);
    });
  }

  it("a flinch ends a crouched still reload in the room's poser as it ends the page's (`Play.stopRemoteReload('flinch')`)", () => {
    const run = reloadRun({ stance: 'crouch', moving: false, clip: RELOAD_CLIPS.crouch, end: 'flinch' });
    const before = run.keys[run.keys.length - 1]!;
    expect(before.roomReload, "before the flinch: the room's poser plays the reload").toBe(RELOAD_CLIPS.crouch);
    expect(run.after, 'the flinch taken').not.toBeNull();
    expect(run.after!.ended, "seat 1's page was told the flinch").toBe(true);
    expect(run.after!.pageReload, "after: the page's clip ended").toBeNull();
    expect(run.after!.roomPoser, "after: B lives, his poser runs on").toBe(true);
    expect(run.after!.roomReload, "after: the room's clip ended").toBeNull();
  });

  it("a death ends the reload in the room as on the page (`Play.stopRemoteReload('death')`): the dead body's poser is dropped", () => {
    const run = reloadRun({ stance: 'stand', moving: false, clip: RELOAD_CLIPS.stand, end: 'death' });
    const before = run.keys[run.keys.length - 1]!;
    expect(before.roomReload, "before the death: the room's poser plays the reload").toBe(RELOAD_CLIPS.stand);
    expect(run.after, 'the death taken').not.toBeNull();
    expect(run.after!.ended, "seat 1's page was told the kill").toBe(true);
    expect(run.after!.pageReload, "after: the page's clip ended").toBeNull();
    expect(run.after!.roomPoser, "after: the room's poser dropped (`room.ts` `hitPose`: a dead body is not posed)").toBe(false);
  });
});
