import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { aimPickBlocks, polygonNormal, segmentHits, SURFACE_SIDE, SURFACE_SKIP, surfaceMaterial, surfaceWord, type Grid, type V3 } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { loadMap } from '../src/loadMap';
import { groundGrid, rootY } from '../src/mover';
import { GrenadeThrower, type GrenadeSource } from '../src/grenade';
import { PlayerCamera, viewFar } from '../src/playerCamera';
import { handOpenClear, throwClear, throwClearanceSegment } from '../src/throwCommit';
import { throwAimKept, throwAimReach, throwAimVector } from '../src/throwAim';
import type { PlaySnapshot } from '../src/walk';

/**
 * LATER 247 (the owner, 2026-10-21: "the first grenade throws, but then the next few the arc animation shows but the
 * grenade is not thrown"): reproduced in a rendered match (`agent-mail/evidence/l247-throw-repro-20261021`) as the
 * release refused by PAR-20 D12's clearance (then r0001's `FUN_005499e0` D:L413977-414063, superseded under OT.R97;
 * research 256 §5) with the SEAL against
 * MP2's dock barrier, the arc drawn through the hold (`FUN_005970b0` D:L454091-454188) and the refusal zeroing the
 * power alone (D:L475497-475498). The standing segment enters the barrier's face from its front -- the hand end in front
 * of the face's own normal, the far end behind it -- which the original's one-sided hull test counts too
 * (`FUN_002d2890` side mode 0x20, D:L174831-174837, the hull's colliders D:L215827-215828; research 281 §4.2-§4.3:
 * reading; the microcode re-read from the ELF by LATER 247's review). The node word's bit 21 is clear (research 256 §5's
 * one mapped writer of the owner skip, `+0xa1` mask 4; the others unread, LATER 256), so whether the original skips this
 * owner is the open term, under `THROW_CLEARANCE_QUERY_PLACEHOLDER`. Four units back the segment meets nothing and the
 * throw goes.
 *
 * The pose is the rendered refusal's (pass 2, `results-pass2.json`): the feet as the hook read them, yaw 240 (the
 * teleport's -120). Its pitch and power were not recorded: the respawn's rest pitch (`init_aim_pitch`) and pass 1's
 * held power at the same spot (0.895-0.900 after a 600 ms hold) stand for them; the scratch probe found the same one hit
 * at pitches 0 and 12.
 *
 * RE-RUN UNDER r0004 (OT.R97; research 256 s5.3; reading of r0004, two readers, pending review): the RELEASE REQUEST
 * CLEARS, the HAND-OPEN DOES NOT, so the page PLAYS THE CLIP AND LAUNCHES NOTHING. r0004's clearance (`0x54e6f0`) casts
 * 25 units along the body's aim (`throwAimVector`, r0004 `0x5e6690`, on the page's camera ray at the rest pitch) from
 * the unclamped hand and enters `out_di1_10` from its front, but it refuses only when the ONE nearest hit is a blocker
 * under `0x5bc8d0` (the port's `aimHitKept`): the barrier's material is INVISIBLE_DI, PENETRATION 1 without PICKUP, which
 * `aimPickBlocks` passes -- so the clip is pushed. The hand-open's own cast (r0004 0x5c92b4-0x5c93ac,
 * `HAND_OPEN_CAST_READING`) takes ANY hit, unfiltered: it meets the barrier and skips the launch and the count's
 * decrement. That matches the owner's own LATER 247 report ("the arc animation shows but the grenade is not thrown") as
 * the original's behaviour, AS READ: THIS CASE HAS NO CAPTURE of the original. Four back the same.
 */

const FIXTURE_ROOT = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'));
const MP2_ZDB = fixture('RUN/MP2.ZDB');

const CONTACT: V3 = [1103.199951171875, 100, 814.7999877929688];
const BACK4: V3 = [1099.7365397070218, 100, 812.7988896085014];
const YAW = 240;
const REST_PITCH = -9.167;                                       // `dynamics.rdr`'s `init_aim_pitch` (the pose's pitch)
const POWER = 0.895;
/**
 * The node word's bit 21 (`+0x5e` bit 5), which `CWorld::AddChild` maps to `+0xa1` mask 4 -- research 256 §5's one mapped
 * writer of the owner skip; the collider factories' model byte and the others are unread (LATER 256).
 */
const NODE_WORD_BIT_21 = 1 << 21;

const snap = (feet: V3): PlaySnapshot => ({
  feet: [...feet], yaw: YAW, pitch: REST_PITCH, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand',
  landing: null, jumps: 0,
} as PlaySnapshot);

describe.skipIf(!MP2_ZDB)(`LATER 247 under r0004: at MP2's dock barrier (worldmodel/out_di1_10) the page PLAYS THE CLIP AND LAUNCHES NOTHING -- the request clears (INVISIBLE_DI no blocker, r0004 0x5bc8d0), the hand-open's unfiltered cast meets the barrier (r0004 0x5c92b4-0x5c93ac); as read, no capture of this case${MP2_ZDB ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  let loaded: { grid: Grid; material: string } | undefined;
  const map = async () => {
    if (loaded) return loaded;
    const m = await loadMap(new FsAssetSource(FIXTURE_ROOT), 'RUN/MP2.ZDB');
    return (loaded = { grid: groundGrid(m.ground!), material: m.grenade?.defaultMaterial ?? '' });
  };
  /** The page's camera ray at rest (`PlayerCamera` settled at the feet, the yaw and the rest pitch). */
  const rayAt = (g: Grid, feet: V3): { eye: V3; far: V3 } => {
    const cam = new PlayerCamera(g);
    for (let i = 0; i < 120; i++) cam.tick(feet, YAW, REST_PITCH, rootY('stand'));
    cam.settle();
    const v = cam.view(1);
    return { eye: [...v.aim.eye] as V3, far: [...viewFar(v.aim.eye, v.aim.target, v.far)] as V3 };
  };
  /** The page's own aim at the pose (`throwAimVector`, r0004 `0x5e6690`) and the clearance's ray along it. */
  const query = async (feet: V3) => {
    const { grid: g, material } = await map();
    const s = snap(feet);
    const aim = throwAimVector(g, { ...rayAt(g, feet), reach: throwAimReach(100000), kept: throwAimKept(material) }, { feet, yaw: YAW, stance: 'stand' }).aim;
    const seg = throwClearanceSegment(s, POWER, aim)!;
    const hits = segmentHits(g, seg.from, seg.to, (p) => (surfaceWord(p) & (SURFACE_SIDE | SURFACE_SKIP)) === SURFACE_SIDE);
    return { g, s, aim, seg, hits };
  };
  /** A held throw (about LATER 247's 0.895) through the page's thrower and the page's ray: whether the clip started and it flew. */
  const pageThrow = async (feet: V3) => {
    const { grid: g, material } = await map();
    const ray = rayAt(g, feet);
    const source: GrenadeSource = { grid: () => g, snapshot: () => snap(feet), view: () => 'third', aim: () => ray };
    const t = new GrenadeThrower(source);
    t.setEnvironment(material);
    const starts: string[] = [];
    t.on('throwStart', (e) => starts.push(e.anim.clip));
    t.select('M67');
    t.pull();
    for (let i = 0; i < 43; i++) t.update(1 / 60);
    t.release();
    for (let i = 0; i < 120; i++) t.update(1 / 60);
    return { started: starts.length > 0, flew: t.stats().lastThrow !== null, refusal: t.diag().lastRefusal?.reason ?? null };
  };

  it("against the barrier: the nearest hit is out_di1_10 entered from its front, the node word's bit 21 clear (research 256 s5's one mapped writer; the others unread, LATER 256), its material INVISIBLE_DI no blocker: the request's clearance passes, the hand-open's cast does not", async () => {
    const { g, s, aim, seg, hits } = await query(CONTACT);
    const hit = hits[0]!;
    expect(hit.owner.path).toBe('worldmodel/out_di1_10');
    const n = polygonNormal(hit.poly.points)!;
    const p0 = [hit.poly.points[0]!, hit.poly.points[1]!, hit.poly.points[2]!];
    const side = (q: readonly number[]): number => n[0] * (q[0]! - p0[0]!) + n[1] * (q[1]! - p0[1]!) + n[2] * (q[2]! - p0[2]!);
    expect(side(seg.from)).toBeGreaterThan(0);                    // the hand end in front of the face's own normal
    expect(side(seg.to)).toBeLessThan(0);                         // the far end behind it: a front entry
    expect(n[0]).toBeCloseTo(-1, 6);                              // the face at x 1115 turned toward the SEAL
    expect((hit.owner.flags ?? 0) & NODE_WORD_BIT_21).toBe(0);                // bit 21 clear; the owner skip itself unread (LATER 256)
    const m = surfaceMaterial(hit.poly.material);
    expect(m).toMatchObject({ name: 'INVISIBLE_DI', penetration: 1, pickup: false });
    expect(aimPickBlocks(m)).toBe(false);                                     // r0004 0x5bc8d0: not a blocker
    expect(throwClear(g, s, POWER, aim)).toBe(true);                          // was false under r0001 (FUN_005499e0, superseded under OT.R97: any hit)
    expect(handOpenClear(g, s, POWER, aim)).toBe(false);                      // r0004's hand-open: any hit, unfiltered
  }, 60_000);

  it('four units back along the heading: the 25-unit ray meets the same barrier, and the answer is the same', async () => {
    const { g, s, aim, hits } = await query(BACK4);
    expect(hits[0]!.owner.path).toBe('worldmodel/out_di1_10');
    expect(throwClear(g, s, POWER, aim)).toBe(true);
    expect(handOpenClear(g, s, POWER, aim)).toBe(false);
  }, 60_000);

  for (const [name, feet] of [['at the barrier', CONTACT], ['four back', BACK4]] as const) {
    it(`${name}, through the page's thrower: the clip starts and no grenade flies (LATER 247's report, as read)`, async () => {
      const r = await pageThrow(feet);
      expect(r.started, 'the release request pushes the clip').toBe(true);
      expect(r.flew, 'the hand-open launches nothing').toBe(false);
      expect(r.refusal, 'no release refusal: the request cleared').toBeNull();
    }, 60_000);
  }
});
