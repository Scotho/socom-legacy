import { describe, expect, it } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FsAssetSource } from '@s2u/archive/node';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import { readSkeleton, transformPoint } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { PART } from '../src/net/damage';
import {
  bodyVolumes, boneCentre, placeholderVolumes, rayBody, skeletonVolumes, stanceVolumes, type Capsule, type V3,
} from '../src/net/hitVolumes';
import { loadSimSkeleton, type SimSkeleton } from '../src/simMap';
import { BODY_TOP as TRAVERSAL_BODY_TOP } from '../src/traversal';
import { Animator, type MoverSnapshot } from '../src/animator';
import { motionTableFromArchive } from '../src/motionTable';
import { rootTiltStart, stepRootTilt } from '../src/rootTilt';
import { PRONE_HEIGHT } from '../src/stature';

/**
 * The server's hit volumes off the SEAL's own skeleton (web sprint 3, M6; research 91 section 1.3): each damage bone a
 * capsule from its joint to the next joint of its chain, posed at the stance's idle clip, in the body's frame (x right,
 * y up, z behind, the soles at the origin), then placed at the feet and the facing.
 */

const FIXTURES = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'));
const MP2 = fixture('RUN/MP2.ZDB'), PACK = fixture('RUN/MOTION_P.ZAR'), READERC = fixture('RUN/READERC.ZAR');

const FEET: V3 = [100, 50, -20], YAW = 30;
/** A body-frame point (x right, y up, z behind) to the world at FEET and YAW, as `play.ts` `actorToWorld`. */
function world(p: V3): V3 {
  const r = (YAW * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [FEET[0] + p[0] * c + p[2] * s, FEET[1] + p[1], FEET[2] - p[0] * s + p[2] * c];
}
/** A ray from 30 in front of the body at body-frame (x, y), straight back through it. */
function fromFront(x: number, y: number): { o: V3; d: V3 } {
  const r = (YAW * Math.PI) / 180;
  return { o: world([x, y, -30]), d: [Math.sin(r), 0, Math.cos(r)] };
}
const centre = (c: Capsule): V3 => [(c.a[0] + c.b[0]) / 2, (c.a[1] + c.b[1]) / 2, (c.a[2] + c.b[2]) / 2];
const lo = (c: Capsule): number => Math.min(c.a[1], c.b[1]) - c.r;
const hi = (c: Capsule): number => Math.max(c.a[1], c.b[1]) + c.r;
const of = (vs: readonly Capsule[], part: number): Capsule[] => vs.filter((c) => c.part === part);

describe('the placeholder stays the fallback', () => {
  it('bodyVolumes without skeleton volumes is placeholderVolumes', () => {
    for (const posture of ['stand', 'crouch', 'prone'] as const) {
      expect(bodyVolumes(FEET, YAW, posture)).toEqual(placeholderVolumes(FEET, YAW, posture));
    }
  });
  // PF-21 (research 180 s1.4, research 217 s4; ruling PF.R45): the original has no prone height -- its prone body is the
  // size class (8.0, 6.0) of `FUN_0058a720(actor, 1)` (D:L415119-415122) and the posed skeleton (top rshoulder 3.891,
  // head 3.637). The placeholder prone capsules are laid on that class: within its 6.0, centred at its half (3.0, where
  // its probe stands, D:L415231-415233); the traversal's body box the same 6.0.
  it("the fallback prone capsules lie within the prone size class's 6.0 height; traversal's BODY_TOP.prone is 6.0 (D:L415119-415122)", () => {
    expect(PRONE_HEIGHT).toBe(6);
    expect(TRAVERSAL_BODY_TOP.prone).toBe(6);
    const prone = placeholderVolumes(FEET, YAW, 'prone');
    expect(prone).toHaveLength(6);
    for (const c of prone) {
      expect(lo(c) - FEET[1]).toBeGreaterThanOrEqual(0);
      expect(hi(c) - FEET[1]).toBeLessThanOrEqual(6);
      expect(c.a[1] - FEET[1]).toBeCloseTo(3, 9);                 // the class's half: its probe's height
    }
  });
});

describe.skipIf(!MP2 || !PACK || !READERC)(`Frostfire's SEAL hit volumes${MP2 && PACK && READERC ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  let sim: SimSkeleton;
  const get = async (): Promise<SimSkeleton> => {
    if (!sim) {
      const loaded = await loadSimSkeleton(new FsAssetSource(FIXTURES), 'RUN/MP2.ZDB');
      if (!loaded) throw new Error('no skeleton');
      sim = loaded;
    }
    return sim;
  };

  it('loads seal_A_scuba headless, with the three idles, and the Terrorist shares its bone names', async () => {
    const s = await get();
    expect(s.model).toBe('seal_A_scuba');
    expect(s.idles.stand?.name).toBe('seal_stand');
    expect(s.idles.crouch?.name).toBe('seal_crouch');
    expect(s.idles.prone?.name).toBe('seal_prone');
    for (const bone of ['head', 'neck', 'rbicep', 'rforearm', 'lbicep', 'lforearm', 'spinehi', 'spinelo', 'hips', 'rthigh', 'rcalf', 'lthigh', 'lcalf']) {
      expect(s.skeleton.indexOf(bone), bone).toBeGreaterThanOrEqual(0);
    }
    const toc = parseZdb(MP2!);
    const terrorist = readSkeleton(Zar.parse(zdbMember(MP2!, toc, 'CLIB_GEO.ZED')), 'al_gman01');
    expect(terrorist.parts.map((p) => p.name)).toEqual(s.skeleton.parts.map((p) => p.name));
  });

  it('standing: the head at 16-20, the body over about 9-16, the legs down to 1-3', async () => {
    const s = await get();
    const v = skeletonVolumes(s.skeleton, s.idles.stand);
    const head = of(v, PART.HEAD), body = of(v, PART.BODY);
    expect(head.length).toBeGreaterThan(0);
    const top = head.reduce((a, c) => (centre(c)[1] > centre(a)[1] ? c : a));
    expect(centre(top)[1]).toBeGreaterThan(16);
    expect(centre(top)[1]).toBeLessThan(20);
    expect(Math.min(...body.map(lo))).toBeGreaterThan(7.5);
    expect(Math.min(...body.map(lo))).toBeLessThan(10.5);
    expect(Math.max(...body.map(hi))).toBeGreaterThan(15);
    expect(Math.max(...body.map(hi))).toBeLessThan(18);
    for (const leg of [PART.RLEG, PART.LLEG]) {
      const bottom = Math.min(...of(v, leg).map(lo));
      expect(bottom).toBeGreaterThan(0.5);
      expect(bottom).toBeLessThan(3);
    }
    expect(of(v, PART.RARM).length).toBe(2);
    expect(of(v, PART.LARM).length).toBe(2);
    // Right is +x: the right thigh's capsule sits right of the left's.
    expect(centre(of(v, PART.RLEG)[0]!)[0]).toBeGreaterThan(centre(of(v, PART.LLEG)[0]!)[0]);
    expect(skeletonVolumes(s.skeleton, s.idles.stand)).toBe(v);    // cached
  });

  it('crouched lower, prone flat', async () => {
    const s = await get();
    const stand = skeletonVolumes(s.skeleton, s.idles.stand), crouch = skeletonVolumes(s.skeleton, s.idles.crouch);
    const prone = skeletonVolumes(s.skeleton, s.idles.prone);
    const headY = (v: readonly Capsule[]): number => Math.max(...of(v, PART.HEAD).map((c) => centre(c)[1]));
    expect(headY(crouch)).toBeLessThan(headY(stand) - 4);
    expect(Math.max(...crouch.map(hi))).toBeLessThan(Math.max(...stand.map(hi)));
    expect(Math.max(...prone.map(hi))).toBeLessThan(6);
  });

  it('a ray at the head hits HEAD, at the chest BODY, at the knee a leg; beside the arm at the hand, nothing', async () => {
    const s = await get();
    const vols = stanceVolumes(s);
    const placed = bodyVolumes(FEET, YAW, 'stand', vols);
    const shoot = (x: number, y: number): number | null => {
      const { o, d } = fromFront(x, y);
      return rayBody(o, d, 100, placed)?.part ?? null;
    };
    expect(shoot(0.5, 17.8)).toBe(PART.HEAD);
    expect(shoot(0, 14)).toBe(PART.BODY);
    expect([PART.RLEG, PART.LLEG]).toContain(shoot(-0.7, 6));
    // The right hand, clear of the forearm: straight down through its middle the round meets no damage part.
    const hand = boneCentre(s.skeleton, s.idles.stand, 'rhand');
    expect(hand[1]).toBeGreaterThan(10);
    expect(hand[1]).toBeLessThan(14);
    expect(rayBody(world([hand[0], hand[1] + 0.3, hand[2]]), [0, -1, 0], 100, placed)).toBeNull();
  });

  // PRONE-TILT (research 217 s7; reading, pending review): the room's capsules turn with the skeleton root's tilt
  // (`TILT_HIT_TEST_READING` 'posed'), about the posed root, as the page's skeleton turns under the same quaternion.
  const slopeY = (n: V3, x: number, z: number): number => -(n[0] * x + n[2] * z) / n[1];
  const UP20: V3 = [0, Math.cos((20 * Math.PI) / 180), Math.sin((20 * Math.PI) / 180)];
  const settledTilt = (n: V3, yaw: number): [number, number, number, number] => {
    let st = rootTiltStart();
    for (let i = 0; i < 200; i++) st = stepRootTilt(st, { normal: n, yaw, span: [0, 0], phase: 0.5, prone: true, proneTransition: false, diving: false, airborne: false });
    return st.q!;
  };
  const clearance = (caps: readonly Capsule[], n: V3): number =>
    Math.min(...caps.flatMap((c) => [c.a, c.b].map((p) => p[1] - c.r - slopeY(n, p[0], p[2]))));

  it('PRONE-TILT: facing up a 20-degree slope the tilted prone head sits above the ground, where the level one sinks into it', async () => {
    const s = await get();
    const v = stanceVolumes(s);
    expect(v.pivot?.prone).toBeDefined();
    const feet: V3 = [0, 0, 0], yaw = 0;                                                  // yaw 0 faces -z: uphill here
    const q = settledTilt(UP20, yaw);
    const tilted = bodyVolumes(feet, yaw, 'prone', v, q), level = bodyVolumes(feet, yaw, 'prone', v);
    const headUp = clearance(of(tilted, PART.HEAD), UP20), headLevel = clearance(of(level, PART.HEAD), UP20);
    console.log(`PRONE-TILT: head capsule clearance over a 20-degree uphill, tilted ${headUp.toFixed(3)}, level ${headLevel.toFixed(3)}`);
    expect(headUp).toBeGreaterThan(0);
    expect(headLevel).toBeLessThan(headUp);
    // no tilt given, or a level one: the capsules as before
    expect(bodyVolumes(feet, yaw, 'prone', v, null)).toEqual(level);
    expect(bodyVolumes(feet, yaw, 'prone', v, [0, 0, 0, 1])).toEqual(level);
  });

  it("PRONE-TILT A = B: the page's posed body (the animator under the walker's tilt) and the room's capsules move the hips alike", async () => {
    const s = await get();
    const page = await loadSimSkeleton(new FsAssetSource(FIXTURES), 'RUN/MP2.ZDB');
    const table = motionTableFromArchive(READERC!)!;
    const prone = s.idles.prone!;
    const yaw = 35, q = settledTilt([0.25, 0.94, -0.2].map((x, _i, a) => x / Math.hypot(...a)) as V3, yaw);
    const hipsOf = (tilt: [number, number, number, number] | null): V3 => {
      const anim = new Animator(page!.skeleton, [prone], table, { random: () => 0 });
      const snap: MoverSnapshot = { vx: 0, vz: 0, vy: 0, yaw, airborne: false, crouched: false, landing: null, jumps: 0, stance: 'prone',
        ground: { state: 'idle', forward: 0, right: 0, cls: -1 }, action: null, rootTilt: tilt };
      for (let i = 0; i < 120; i++) anim.step(1 / 60, snap);
      const p = page!.skeleton.part('hips');
      return transformPoint(page!.skeleton.world[p.index]!, (p.bbox[0]! + p.bbox[3]!) / 2, (p.bbox[1]! + p.bbox[4]!) / 2, (p.bbox[2]! + p.bbox[5]!) / 2);
    };
    const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const pageMove = sub(hipsOf(q), hipsOf(null));
    const v = stanceVolumes(s);
    const hips = (caps: readonly Capsule[]): V3 => {                                     // DAMAGE_BONES' first BODY: hips
      const body = of(caps, PART.BODY)[0];
      expect(body).toBeDefined();
      if (!body) throw new Error('no BODY capsule');
      return centre(body);
    };
    // the room's capsules are in the body frame turned by the yaw: bring the move back into the body frame
    const roomWorld = sub(hips(bodyVolumes([0, 0, 0], yaw, 'prone', v, q)), hips(bodyVolumes([0, 0, 0], yaw, 'prone', v)));
    const r = (yaw * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r);
    const roomMove: V3 = [roomWorld[0] * c - roomWorld[2] * sn, roomWorld[1], roomWorld[0] * sn + roomWorld[2] * c];
    expect(Math.hypot(...pageMove)).toBeGreaterThan(0.1);
    expect(roomMove).toEqual(pageMove.map((x) => expect.closeTo(x, 2)));
  });
});

