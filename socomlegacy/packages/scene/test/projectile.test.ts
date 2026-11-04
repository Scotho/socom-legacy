import { describe, expect, it } from 'vitest';
import { Zar, parseRdr, parseZdb, rdrGet, zdbMember, type RdrNode } from '@s2u/archive';
import { fixture } from '../../archive/test/fixtures';
import {
  actorToWorldPoint, BACKBLAST_CONE, BOUNCE_SOUND_SPEED, BACKBLAST_CONE_AXIS_READING, backblastAxis, inCone, BOUNCE_LIFT, decalEntry, GRENADE_BLAST, buildGrid, CROUCH_MOVING_SPEED_SQ, explosionDamage, FIRST_BOUNCE_DAMPING, GAME_FRAME_DT, gridCast,
  heldPower, impactRange, isToss, launchGrenade, M67, materialTable, maxThrowDistance, maxThrowSpeed, parseMotionZar,
  releaseSeconds, throwClipSeconds, HE, AN_M8, MARK141, CLAYMORE, CLAYMORE_COUNT_LIVE_READING, CLAYMORE_RULES, claymoreCone, countsTowardClaymoreLimit, PLACE_CLAYMORE_ANIM, weaponCategory, bouncesByType, flashLevel, blindStrength, BLIND_KEYS, REST_SPEED, SOILS, soilsTable, stepGrenade, stepThrowPower, surfaceMaterial, THROW_ANIMS, THROW_PARAMS,
  throwableRecord, throwAnim, CHARGE_HIT_RADIUS_PLACEHOLDER, raySphere, VOLATILE_MIN_DAMAGE_READING, VOLATILE_READING, volatileQueues, throwElevation, throwVelocity, materialAnim, parseAnimSets, parseSceneGraph, parseWorldRoot, worldCollision,
  type CollisionOwner, type Grenade, type GrenadeEvent, type GridParams, type HullCast, type SurfaceMaterial, type V3, type WorldPoly,
} from '../src/index';

/**
 * The frag grenade (socomlegacy/docs/research/85): the throw's power and clip, the launch, and the flight against a hull --
 * gravity, the bounce, the rest, the pass-through, the fuse -- over synthetic worlds; then the transcribed tables
 * against the game's own files when the fixtures are on hand.
 */

/** Material bytes: SOILS entry `i` is byte `i + 2` (the table's two built-ins come first). */
const byte = (name: string): number => SOILS.findIndex((m) => m.name === name) + 2;

function quad(points: number[], material: number, cameratype = 0): WorldPoly {
  return { modelName: 'worldmodel', path: 'worldmodel/q', region: 0, ditype: 3, material, ptcount: 4, cameratype, points: Float32Array.from(points) };
}
const floorAt = (y: number, material = byte('STONE'), half = 2000): WorldPoly =>
  quad([-half, y, -half, half, y, -half, half, y, half, -half, y, half], material);
/** A vertical wall across x at `z`. */
const wallZ = (z: number, material = byte('STONE')): WorldPoly => quad([-2000, -50, z, 2000, -50, z, 2000, 300, z, -2000, 300, z], material);

function hull(polys: WorldPoly[], defaultMaterial = ''): HullCast {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 500, cellsX: 8, cellsZ: 8, originX: -2000, originZ: -2000 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return gridCast(buildGrid(params, [], [], polys, owners), defaultMaterial);
}

/** Steps a grenade once per game frame (`GAME_FRAME_DT`, PF-04; research 208) until it is removed or `seconds` pass; every event with its time. */
function fly(g: Grenade, cast: HullCast, seconds = 4, dt = GAME_FRAME_DT): { t: number; e: GrenadeEvent }[] {
  const out: { t: number; e: GrenadeEvent }[] = [];
  for (let i = 1; i <= Math.round(seconds / dt) && g.state !== 'removed'; i++) {
    for (const e of stepGrenade(g, dt, cast)) out.push({ t: i * dt, e });
  }
  return out;
}

describe('the throw\'s power (FUN_00594cf0)', () => {
  it('chases the pressure at 3/s up and 1.5/s down, and releases when the pressure falls under 0.15 of it', () => {
    expect(stepThrowPower(0, 1, 1 / 60)).toEqual({ power: 0.05, release: false });
    const up = stepThrowPower(0.5, 1, 0.1);
    expect(up.power).toBeCloseTo(0.5 + 0.5 * 0.3, 12);
    const down = stepThrowPower(0.8, 0.5, 0.1);
    expect(down.power).toBeCloseTo(0.8 - 0.3 * 0.15, 12);
    expect(stepThrowPower(0.8, 0.12, 1 / 60)).toEqual({ power: 0.8, release: true });
    expect(stepThrowPower(0.8, 0.13, 1 / 60).release).toBe(false);
  });

  it('a digital button held: 1 - 0.95^n at 60 Hz -- how long it was held is how hard it goes', () => {
    expect(heldPower(0)).toBe(0);
    expect(heldPower(1)).toBeCloseTo(1 - 0.95 ** 60, 9);
    expect(heldPower(0.25)).toBeCloseTo(1 - 0.95 ** 15, 9);
    expect(heldPower(3)).toBeGreaterThan(0.999);
  });
});

describe('the throw\'s clip (GetThrowAnim 0x57fce0)', () => {
  it('tosses under power 0.6 with the aim\'s sine under 0.3, else throws; crouched it throws, moving it stands', () => {
    expect(THROW_PARAMS).toEqual({ abortThreshold: 0.15, maxDistanceStand: 600, maxDistanceCrouch: 300, tossPowerThreshold: 0.6, tossAimThreshold: 0.3 });
    expect(isToss(0.59, 0.29)).toBe(true);
    expect(isToss(0.6, 0)).toBe(false);
    expect(isToss(0.2, 0.3)).toBe(false);
    expect(throwAnim(0.9, 0, 'stand')).toBe(THROW_ANIMS.standThrow);
    expect(throwAnim(0.3, -0.5, 'stand')).toBe(THROW_ANIMS.standToss);
    expect(throwAnim(0.3, 0, 'crouch', 0)).toBe(THROW_ANIMS.crouchThrow);
    expect(throwAnim(0.3, 0, 'crouch', CROUCH_MOVING_SPEED_SQ + 1)).toBe(THROW_ANIMS.standThrow);
    expect(throwAnim(0.3, 0, 'prone')).toBe(THROW_ANIMS.proneToss);
    expect(throwAnim(0.9, 0, 'prone')).toBe(THROW_ANIMS.proneThrow);
    expect(throwAnim(1, 1, 'peek-left')).toBe(THROW_ANIMS.peekLeftToss);
    expect(maxThrowDistance('stand')).toBe(600);
    expect(maxThrowDistance('prone')).toBe(300);
  });

  it('releases when the one-shot phase reaches the fraction: the standing throw 0.46 x 1.6 x 27/28 s in (FUN_005802b0)', () => {
    expect(releaseSeconds(THROW_ANIMS.standThrow)).toBeCloseTo(0.46 * 1.6 * (27 / 28), 12);
    expect(throwClipSeconds(THROW_ANIMS.standThrow)).toBeCloseTo(1.6 * (27 / 28) ** 2, 12);
    expect(THROW_ANIMS.crouchThrow.frames).toBe(19);
  });
});

describe('the launch (CZKit_TickExplosives 0x5c1970, CDynGrenade 0x5975d0-0x5976e0)', () => {
  it('ComputeMaxVel: the 45-degree speed that lands `distance` away from `height`', () => {
    const { speed, time } = maxThrowSpeed(600, 20);
    expect(time).toBeCloseTo(Math.sqrt((620 * 2) / 98), 12);
    // A 45-degree throw at that speed from 20 up lands 600 away (cos 45 as the file's 0.707107).
    expect(impactRange(speed * Math.SQRT1_2, speed * Math.SQRT1_2, 20)).toBeCloseTo(600, 0);
  });

  it('the elevation runs 10 to 12 degrees by power, and the aim is clamped to 0..55 degrees before it', () => {
    expect(throwElevation(0)).toBeCloseTo((10 * Math.PI) / 180, 12);
    expect(throwElevation(1)).toBeCloseTo((12 * Math.PI) / 180, 12);
    const down = throwVelocity(1, -0.9, [0, 19, 0], 600), level = throwVelocity(1, 0, [0, 19, 0], 600);
    expect(down.pitch).toBeCloseTo(level.pitch, 12);
    expect(throwVelocity(1, 1, [0, 19, 0], 600).pitch).toBeCloseTo(0.959931 + (12 * Math.PI) / 180, 6);
  });

  it('full power from the standing hand: the speed is the max, the direction ahead (-z) and up', () => {
    const hand = THROW_ANIMS.standThrow.offset;
    const l = throwVelocity(1, 0, hand, 600);
    expect(l.maxSpeed).toBeCloseTo(maxThrowSpeed(600, hand[1]).speed, 9);
    expect(l.speed).toBeCloseTo(l.maxSpeed, 9);           // the aimed distance is past the max: clamped
    expect(l.velocity[2]).toBeLessThan(0);
    expect(l.velocity[1]).toBeCloseTo(l.speed * Math.sin(l.pitch), 9);
    expect(Math.hypot(...l.velocity)).toBeCloseTo(l.speed, 9);
    // The hand is right of the centre line: the aimed direction turns back toward it.
    expect(l.velocity[0]).toBeLessThan(0);
  });

  it('a weak throw: the speed becomes the hand\'s ground distance to the power\'s landing point ahead of the feet', () => {
    const hand: V3 = [0, 19, 4];
    const l = throwVelocity(0.3, 0, hand, 600);
    expect(l.powerSpeed).toBeCloseTo(l.maxSpeed * (0.3 + 0.05 * 0.7), 9);
    expect(l.speed).toBeCloseTo(l.range + 4, 9);           // straight ahead: range + z behind the feet
    expect(l.velocity[0]).toBeCloseTo(0, 12);
  });
});

describe('the backblast\'s cone (GetDamage 0x9f; research 181 s2.3, 219 s1)', () => {
  it('the backblast\'s cone axis is the body\'s +z, behind the body (FUN_003cb1a0 0x3cb308-0x3cb35c, GetDamage 0x9f D:L318784-318826): a target 50 units behind at the shooter\'s feet is inside the cone when he aims 30 degrees down; the aim reversed would miss it', () => {
    expect(BACKBLAST_CONE_AXIS_READING).toBe('body-back');
    // The axis is the actor frame's +z (z behind, yaw 0 facing -z) turned by the body's yaw: no pitch.
    for (const yaw of [0, -90, 90, 37, 180]) {
      const axis = backblastAxis(yaw), back = actorToWorldPoint([0, 0, 0], yaw, [0, 0, 1]);
      axis.forEach((v, i) => expect(v, `yaw ${yaw} [${i}]`).toBeCloseTo(back[i]!, 12));
    }
    expect(backblastAxis(-90)[0]).toBeCloseTo(-1, 12);                      // facing +x: the back is -x
    // The muzzle at 15.4 over the feet (the hand's height), the body at yaw 0 (facing -z), the launcher 30 degrees down.
    const muzzle: V3 = [0, 15.4, 0], radius = 70, down = (30 * Math.PI) / 180;
    const aim: V3 = [0, -Math.sin(down), -Math.cos(down)];
    const target: V3 = [0, 0, 50];                                           // 50 behind, at the feet
    const rel: V3 = [target[0] - muzzle[0], target[1] - muzzle[1], target[2] - muzzle[2]];
    expect(inCone(rel, backblastAxis(0), BACKBLAST_CONE, radius)).toBe(true);
    expect(inCone(rel, [-aim[0], -aim[1], -aim[2]], BACKBLAST_CONE, radius)).toBe(false);   // the cone tilted up: 47 degrees off
  });
});

describe('the flight against a hull (PreTick 0x3ca5a0, HandleBounce 0x3c8f50, HandleTimers 0x3c99a0)', () => {
  it('an arc from the standing hand lands where ComputeTimeToImpact says, bounces, rests on the floor and goes off at 3 s', () => {
    const cast = hull([floorAt(0)]);
    const hand = THROW_ANIMS.standThrow.offset;
    const l = throwVelocity(0.5, 0, hand, 600);
    const g = launchGrenade(actorToWorldPoint([0, 0, 0], 0, hand), l.velocity);
    const events = fly(g, cast);
    const first = events.find((x) => x.e.kind === 'bounce')!;
    expect(first).toBeDefined();
    const at = (first.e as { point: V3 }).point;
    const run = Math.hypot(at[0] - hand[0], at[2] - hand[2]);
    const ideal = impactRange(Math.hypot(l.velocity[0], l.velocity[2]), l.velocity[1], hand[1]);
    expect(Math.abs(run - ideal)).toBeLessThan(l.speed * GAME_FRAME_DT + 1);   // within a game frame's travel
    expect(at[1]).toBeCloseTo(0, 6);
    const rest = events.find((x) => x.e.kind === 'rest');
    expect(rest).toBeDefined();
    expect(g.pos[1]).toBeCloseTo(BOUNCE_LIFT, 6);
    const boom = events.find((x) => x.e.kind === 'explode')!;
    expect(boom.t).toBeGreaterThanOrEqual(3 - 1e-9);
    expect(boom.t).toBeLessThan(3 + GAME_FRAME_DT + 1e-9);
    expect((boom.e as { point: V3 }).point).toEqual(g.pos);
    const gone = events.find((x) => x.e.kind === 'remove')!;
    expect(gone.t).toBeGreaterThanOrEqual(3.1 - 1e-9);
    expect(g.state).toBe('removed');
  });

  it('the first bounce damps by ELASTICITY x 0.75, later ones by ELASTICITY: stone 0.5, sand 0.1', () => {
    for (const [name, e] of [['STONE', 0.5], ['SAND', 0.1]] as const) {
      const cast = hull([floorAt(0, byte(name))]);
      const g = launchGrenade([0, 10, 0], [30, -200, 0]);
      let before: V3 = [...g.vel];
      let bounces = 0;
      for (let i = 0; i < 600 && bounces < 2; i++) {
        const v: V3 = [g.vel[0], g.vel[1] - 98 / 60, g.vel[2]];
        const ev = stepGrenade(g, 1 / 60, cast);
        if (ev.some((x) => x.kind === 'bounce')) {
          const k = bounces === 0 ? e * FIRST_BOUNCE_DAMPING : e;
          if (g.state === 'flight') {
            expect(g.vel[0]).toBeCloseTo(v[0] * k, 9);
            expect(g.vel[1]).toBeCloseTo(-v[1] * k, 9);
          }
          bounces++;
        }
        before = v;
      }
      expect(before).toBeDefined();
      expect(bounces).toBeGreaterThan(0);
    }
  });

  it('comes to rest: under 5 units/s after a bounce that turned the fall upward, it stops dead', () => {
    const cast = hull([floorAt(0)]);
    // Re-baselined for the game frame (PF-04): falling at 6 u/s, the second frame's segment meets the floor at 12.5 u/s.
    const g = launchGrenade([0, 0.5, 0], [2, -6, 0]);
    g.firstBounce = false;
    const ev = fly(g, cast, 0.2);
    const rest = ev.find((x) => x.e.kind === 'rest');
    expect(rest).toBeDefined();
    expect(g.vel).toEqual([0, 0, 0]);
    expect(g.state).toBe('rest');
    const at: V3 = [...g.pos];
    stepGrenade(g, GAME_FRAME_DT, cast);
    expect(g.pos).toEqual(at);                               // at rest nothing moves, the fuse still runs
    expect(REST_SPEED).toBe(5);
  });

  it('bounces off a wall back toward the thrower, pushed 0.1 off it', () => {
    const cast = hull([floorAt(-100), wallZ(-50)]);
    const g = launchGrenade([0, 20, 0], [0, 0, -200]);
    const ev = fly(g, cast, 0.5);
    const hit = ev.find((x) => x.e.kind === 'bounce')!.e as { point: V3; normal: V3 };
    expect(hit.point[2]).toBeCloseTo(-50, 6);
    expect(hit.normal[2]).toBeCloseTo(1, 9);                 // facing the grenade
    expect(g.pos[2]).toBeGreaterThan(-50);
  });

  it('passes through water (LIQUID) at a quarter of its speed, and through glass (PENETRATION 0.99) at 0.8', () => {
    for (const [name, e] of [['WATER', 0.25], ['GLASS', 0.8]] as const) {
      const cast = hull([floorAt(0, byte(name)), floorAt(-200)]);
      const g = launchGrenade([0, 5, 0], [0, -300, 0]);
      const v = -300 - 98 / 60;
      const ev = stepGrenade(g, 1 / 60, cast);
      expect(ev[0]).toMatchObject({ kind: 'pass', material: name });
      expect(g.vel[1]).toBeCloseTo(v * e, 9);
      expect(g.pos[1]).toBeCloseTo(5 + v / 60, 9);          // on to the segment's end
    }
  });

  it('never sees a PENETRATION 1 surface (ACTION, the vegetation volumes)', () => {
    const cast = hull([floorAt(0, byte('BUSH_VOL'))]);
    const g = launchGrenade([0, 5, 0], [0, -300, 0]);
    expect(stepGrenade(g, 1 / 60, cast)).toEqual([]);
    expect(g.pos[1]).toBeLessThan(0);
  });

  it('a material byte 0 is the map\'s DefaultMaterial, past the table UNKNOWN', () => {
    expect(surfaceMaterial(0, 'SNOW').name).toBe('SNOW');
    expect(surfaceMaterial(0, 'NOT_A_MATERIAL').name).toBe('UNKNOWN');
    expect(surfaceMaterial(1).name).toBe('PARTICLE_SYSTEM');
    expect(surfaceMaterial(byte('ASPHALT')).name).toBe('ASPHALT');
    expect(surfaceMaterial(200).name).toBe('UNKNOWN');
    expect(materialTable().length).toBe(46);
  });

  it('a type outside the bounce list goes off where it first lands (HandleImpact), and passes over water', () => {
    const cast = hull([floorAt(0, byte('WATER')), floorAt(-50)]);
    const round = { ...M67, name: 'an impact round', id: 0xab, impact: !bouncesByType(0xab) };
    expect(round.impact).toBe(true);
    const g = launchGrenade([0, 10, 0], [40, -100, 0], round);
    const events = fly(g, cast, 1);
    expect(events.find((x) => x.e.kind === 'bounce')).toBeUndefined();
    const boom = events.find((x) => x.e.kind === 'explode')!;
    expect(boom.t).toBeLessThan(1);                      // slowed to a quarter by the water, then 50 down
    expect((boom.e as { point: V3 }).point[1]).toBeCloseTo(-50, 6);
    expect(events.some((x) => x.e.kind === 'pass')).toBe(true);
  });

  it('every hand grenade bounces: the M67, the HE, the AN-M8 and the Mark141 share the category 0x79 (FUN_003d1a60)', () => {
    for (const r of [M67, HE, AN_M8, MARK141]) {
      expect(weaponCategory(r.id), r.name).toBe(0x79);
      expect(bouncesByType(r.id)).toBe(true);
      expect(r.impact).toBe(false);
    }
    expect(weaponCategory(151)).toBe(0x97);              // the C4 and the claymore: the charges' category
    expect(bouncesByType(153)).toBe(true);
    expect(weaponCategory(54)).toBe(0x33);               // the M4A1
    expect(bouncesByType(54)).toBe(false);
    expect(weaponCategory(0xff)).toBe(0xfe);
    const g = launchGrenade([0, 10, 0], [40, -100, 0], HE);
    const events = fly(g, hull([floorAt(0)]), 4);
    expect(events.some((x) => x.e.kind === 'bounce')).toBe(true);
    expect(events.find((x) => x.e.kind === 'explode')!.t).toBeGreaterThanOrEqual(3 - 1e-9);
    expect(HE.explosionRadius).toBe(100);
    expect(explosionDamage(50, HE)).toBe(11);
  });

  it('the smoke detonates at 3 s with nothing to hurt and stays 40 s; the flashbang goes at 1.5 s', () => {
    const smoke = launchGrenade([0, 10, 0], [20, 0, 0], AN_M8);
    const ev = fly(smoke, hull([floorAt(0)]), 45);
    expect(ev.find((x) => x.e.kind === 'explode')!.t).toBeCloseTo(3, 1);
    expect(ev.find((x) => x.e.kind === 'remove')!.t).toBeCloseTo(40, 1);
    expect(explosionDamage(0, AN_M8)).toBe(0);
    const flash = launchGrenade([0, 10, 0], [20, 0, 0], MARK141);
    expect(fly(flash, hull([floorAt(0)]), 3).find((x) => x.e.kind === 'explode')!.t).toBeCloseTo(1.5, 1);
    expect(explosionDamage(0, MARK141)).toBe(0);
  });

  it('the claymore cone: ahead within 84.4 degrees and 250 units (FUN_003c7280)', () => {
    expect(claymoreCone([0, 0, -100], [0, 0, -1])).toBe(true);
    expect(claymoreCone([90, 0, -10], [0, 0, -1])).toBe(true);   // 83.7 degrees off the axis
    expect(claymoreCone([100, 0, -5], [0, 0, -1])).toBe(false);  // 87 degrees
    expect(claymoreCone([0, 0, 10], [0, 0, -1])).toBe(false);    // behind
    expect(claymoreCone([0, 0, -260], [0, 0, -1])).toBe(false);  // past the radius
    expect(CLAYMORE.fuse).toBe(9999999);
    expect(bouncesByType(CLAYMORE.id)).toBe(true);
  });

  it('the claymore and the PMN are refused wading deeper than 3.2 u (DAT_003dfe10 x 0.32, D:L475310-475350), never for moving: CLAYMORE_RULES.maxWaterDepth', () => {
    // PF-13 (research 181 s6.2, 206 s1.2): `+0xf88` is the water's depth over the feet (FUN_005b52b0 D:L469852), read
    // only in water (`+0x105e` bit 7); the speed is never read. 10.0 x 0.32 = 3.2, the same test guarding item 0x9e.
    expect(CLAYMORE_RULES.maxWaterDepth).toBeCloseTo(10 * 0.32, 12);
    expect('maxSpeed' in CLAYMORE_RULES).toBe(false);
    expect(CLAYMORE_RULES.placeSeconds).toBe(1.3);                 // the claymore's own clock, not C4's
  });

  it('the flash: 150 units\' reach, full to 80, facing it hardest (0x597c00), and the blind keys\' strength', () => {
    expect(flashLevel(151, 1)).toBeNull();
    expect(flashLevel(10, 1)).toBe(3);                    // s = 0
    expect(flashLevel(10, 0.5)).toBe(2);                  // s = 0.5
    expect(flashLevel(10, 0.3)).toBe(1);                  // s = 0.7
    expect(flashLevel(10, -0.5)).toBe(1);                 // facing away
    expect(flashLevel(120, 1)).toBe(2);                   // 1 - (14400 - 6400) x 6.2e-5 = 0.504: s 0.496
    expect(flashLevel(140, 1)).toBe(1);
    expect(blindStrength(3, 0)).toBe(60);
    expect(blindStrength(3, 8)).toBe(60);
    expect(blindStrength(3, 9)).toBeCloseTo(30, 9);
    expect(blindStrength(3, 10.1)).toBe(0);
    expect(blindStrength(1, 1)).toBeCloseTo(12.5, 9);
    expect(BLIND_KEYS[2].at(-1)!.t).toBe(4);
  });

  it('the explosion: Explosion_Damage to half the radius, to nothing at Explosion_Radius (150 units)', () => {
    expect(M67.explosionRadius).toBe(150);
    expect(explosionDamage(0)).toBe(10);
    expect(explosionDamage(75)).toBe(10);
    expect(explosionDamage(112.5)).toBeCloseTo(5, 12);
    expect(explosionDamage(150)).toBe(0);
    expect(explosionDamage(151)).toBe(0);
  });
});

describe('the bounce\'s sound gate (HandleBounce 0x3c8f50, FUN_003c8f50 D:L319530)', () => {
  /**
   * A synthetic hull: one wall at x = 0 facing +x, of `material`, hit on every cast that crosses it. The grenade flies
   * in -x with no gravity and past its first bounce, so the material's elasticity 1 leaves the speed after the bounce
   * the speed before it.
   */
  const wallHull = (material: SurfaceMaterial): HullCast => (a, b) =>
    a[0] > 0 && b[0] <= 0 ? [{ point: [0, a[1], a[2]], normal: [1, 0, 0], material, t: a[0] / (a[0] - b[0]) }] : [];
  const mat = (over: Partial<SurfaceMaterial> = {}): SurfaceMaterial => ({
    name: 'STONE', penetration: 0, elasticity: 1, impactRadiusMod: 1, volumetric: false, liquid: false, underwater: false, pickup: false, ...over,
  });
  const bounceAt = (speed: number, material: SurfaceMaterial): GrenadeEvent & { kind: 'bounce' } => {
    const record = { ...M67, gravity: 0 };
    const g = launchGrenade([0.05, 10, 0], [-speed, 0, 0], record);
    g.firstBounce = false;
    const ev = stepGrenade(g, GAME_FRAME_DT, wallHull(material), record);
    const b = ev.find((e) => e.kind === 'bounce');
    expect(b).toBeDefined();
    return b as GrenadeEvent & { kind: 'bounce' };
  };

  it('plays the bounce sound only over 10 u/s after the bounce, never on an UNDERWATER material', () => {
    expect(BOUNCE_SOUND_SPEED).toBe(10);
    const slow = bounceAt(9.9, mat());
    expect(slow.speed).toBeCloseTo(9.9, 9);
    expect(slow.sound).toBe(false);
    expect(bounceAt(10, mat()).sound).toBe(false);
    const fast = bounceAt(10.1, mat());
    expect(fast.speed).toBeCloseTo(10.1, 9);
    expect(fast.sound).toBe(true);
    expect(bounceAt(10.1, mat({ name: 'UNDERWATER_STONE', underwater: true })).sound).toBe(false);
    // The gate is the speed after the bounce: 20 u/s in, elasticity 0.5, 10 out -- silent.
    expect(bounceAt(20, mat({ elasticity: 0.5 })).sound).toBe(false);
    expect(bounceAt(20.4, mat({ elasticity: 0.5 })).sound).toBe(true);
  });
});

describe('the transcribed tables against the game\'s files', () => {
  const script = (bytes: Uint8Array, name: string): RdrNode => {
    const zar = Zar.parse(bytes);
    const key = zar.root.children.find((k) => k.name.toLowerCase() === name)!;
    return parseRdr(zar.data(key));
  };
  const zweapon = fixture('RUN/ZWEAPON.ZAR'), readerc = fixture('RUN/READERC.ZAR'), motion = fixture('RUN/MOTION_P.ZAR');

  it.skipIf(!zweapon)('M67 is zweapon.rdr\'s M67 and its M67 Ammo', () => {
    expect(throwableRecord(script(zweapon!, 'zweapon.rdr'), 'M67')).toEqual(M67);
    expect(throwableRecord(script(zweapon!, 'zweapon.rdr'), 'HE')).toEqual(HE);
    expect(throwableRecord(script(zweapon!, 'zweapon.rdr'), 'AN-M8')).toEqual(AN_M8);
    expect(throwableRecord(script(zweapon!, 'zweapon.rdr'), 'Mark141')).toEqual(MARK141);
    expect(throwableRecord(script(zweapon!, 'zweapon.rdr'), 'Claymore')).toEqual(CLAYMORE);
    const weapons = (rdrGet(script(zweapon!, 'zweapon.rdr'), 'ZWEAPON') as RdrNode[]).filter((r) => Array.isArray(r));
    const detonator = weapons.find((r) => rdrGet(r, 'InternalName') === 'Detonator')!;
    expect([Number(rdrGet(detonator, 'ID')), rdrGet(detonator, 'ModelName'), rdrGet(detonator, 'IconTextureName')])
      .toEqual([CLAYMORE_RULES.detonator.id, CLAYMORE_RULES.detonator.model, CLAYMORE_RULES.detonator.icon]);
  });

  // PF-35 (research 235 §1, 194 §7 A11; ruling PF.R55): the ammo's bare field, a presence test as `HasBackblast`'s.
  it.skipIf(!zweapon)('IgnoreExplosionDI is read as a bare field: C4 Ammo (18) alone of the fixture\'s ZAMMO rows carries it; the M67, the claymore and the PMN do not (003cb1a0 D:L320755-320756: ammo +0x28 & 2 -> projectile +5 & 2)', () => {
    const rdr = script(zweapon!, 'zweapon.rdr');
    const rounds = (rdrGet(rdr, 'ZAMMO') as RdrNode[]).filter((r) => Array.isArray(r));
    expect(rounds).toHaveLength(39);
    const flagged = rounds.filter((r) => rdrGet(r, 'IgnoreExplosionDI') !== undefined).map((r) => [rdrGet(r, 'InternalName'), Number(rdrGet(r, 'ID'))]);
    expect(flagged).toEqual([['C4 Ammo', 18]]);
    const c4 = throwableRecord(rdr, 'C4');
    expect([c4.ammo, c4.ammoId, c4.ignoreExplosionDI]).toEqual(['C4 Ammo', 18, true]);
    for (const name of ['M67', 'Claymore', 'PMN Mine']) expect(throwableRecord(rdr, name).ignoreExplosionDI).toBeUndefined();
  });

  // PF-36 (research 235 §3, 194 §9 A21; ruling PF.R56): the ammo's bare `Volitile` (the disc's spelling), a presence test.
  it.skipIf(!zweapon)("Volitile is read as a bare field: Claymore Ammo (17) and PMN Ammo (44) alone of the fixture's ZAMMO rows carry it, never C4 or a grenade (003d4400 D:L326522-326525: ammo +0x28 & 1; VOLATILE_READING)", () => {
    const rdr = script(zweapon!, 'zweapon.rdr');
    const rounds = (rdrGet(rdr, 'ZAMMO') as RdrNode[]).filter((r) => Array.isArray(r));
    expect(rounds).toHaveLength(39);
    const flagged = rounds.filter((r) => rdrGet(r, 'Volitile') !== undefined).map((r) => [rdrGet(r, 'InternalName'), Number(rdrGet(r, 'ID'))]);
    expect(flagged).toEqual([['Claymore Ammo', 17], ['PMN Ammo', 44]]);
    expect([throwableRecord(rdr, 'Claymore').volatile, throwableRecord(rdr, 'PMN Mine').volatile]).toEqual([true, true]);
    for (const name of ['C4', 'M67', 'HE', 'AN-M8', 'Mark141']) expect(throwableRecord(rdr, name).volatile).toBeUndefined();
    expect(CLAYMORE.volatile).toBe(true);                         // the transcription carries it (the file's, above)
    expect(VOLATILE_READING).toBe('damage queues a detonation');
  });

  // PF-36: the charge's hit sphere (CHARGE_HIT_RADIUS_PLACEHOLDER) and GetDamage's minimum (VOLATILE_MIN_DAMAGE_READING).
  it("raySphere gives the entry distance of a ray into a sphere within its reach (null for a miss, behind or past the reach); volatileQueues is GetDamage's 1.0 minimum on the base before its x14 (FUN_003c7600 D:L318763-318767)", () => {
    expect(CHARGE_HIT_RADIUS_PLACEHOLDER).toBe(5);
    expect(raySphere([0, 0, 0], [1, 0, 0], 100, [50, 3, 0], 5)).toBeCloseTo(50 - 4, 9);
    expect(raySphere([0, 0, 0], [1, 0, 0], 100, [50, 6, 0], 5)).toBeNull();      // passes 6 off: a miss
    expect(raySphere([0, 0, 0], [1, 0, 0], 100, [-50, 0, 0], 5)).toBeNull();     // behind the muzzle
    expect(raySphere([0, 0, 0], [1, 0, 0], 40, [50, 0, 0], 5)).toBeNull();       // past the reach
    expect(raySphere([0, 0, 0], [1, 0, 0], 100, [2, 0, 0], 5)).toBe(0);          // the muzzle inside it, facing it
    expect(raySphere([0, 0, 0], [-1, 0, 0], 100, [2, 0, 0], 5)).toBeNull();      // a muzzle inside the radius facing away misses
    expect(VOLATILE_MIN_DAMAGE_READING).toBe(1);
    expect([volatileQueues(0), volatileQueues(0.99), volatileQueues(1), volatileQueues(2.6), volatileQueues(Number.NaN)]).toEqual([false, false, true, true, false]);
  });

  it.skipIf(!readerc)('SOILS is materials.rdr\'s, and the clips\' playback is motion.rdr\'s', () => {
    expect(soilsTable(script(readerc!, 'materials.rdr'))).toEqual(SOILS);
    const decals = script(readerc!, 'decals.rdr');
    for (const [material, [min, max]] of Object.entries(GRENADE_BLAST)) {
      expect(decalEntry(decals, M67.decalSet, material)).toEqual({ set: 'GRENADE_BLAST', material, texture: 'grenade_mark.tif', minSize: min, maxSize: max });
    }
    const animations = rdrGet(script(readerc!, 'motion.rdr'), 'animations') as RdrNode[];
    for (const a of [...Object.values(THROW_ANIMS), PLACE_CLAYMORE_ANIM]) {
      const entry = animations.find((r) => Array.isArray(r) && rdrGet(r, 'anim_name') === a.clip) as RdrNode;
      expect(Number(rdrGet(entry, 'playback'))).toBe(a.playback);
    }
  });

  it.skipIf(!readerc)("PICKUP is read as a bare SOILS key: ITEM (penetration 1) alone of materials.rdr's 44 entries carries it, and the transcription agrees (FUN_002dde40 +0x3c bit 4; desktop@be557831:docs/research/23-frostfire-ground-probe.md:142-143)", () => {
    const soils = soilsTable(script(readerc!, 'materials.rdr'));
    expect(soils).toHaveLength(44);
    expect(soils.filter((m) => m.pickup).map((m) => [m.name, m.penetration])).toEqual([['ITEM', 1]]);
    expect(SOILS.filter((m) => m.pickup).map((m) => m.name)).toEqual(['ITEM']);
  });

  // Research 85 §9.9 (`tools/grenade-materials.ts` over all 22 maps): the bounce's zAnim is `sprintf("%s_%s",
  // HitAnimName, material name)` (0x3fc540, the weapon loader at decomp 316340) looked up in the map's CZANIM.ZAR; the
  // hull's bytes resolve through the table, byte 0 by the world root's DefaultMaterial.
  for (const [stem, defaultMaterial] of [['MP2', 'METAL_THICK'], ['MP6', 'SAND'], ['MP72', 'ASPHALT']] as const) {
    const zdb = fixture(`RUN/${stem}.ZDB`);
    it.skipIf(!zdb || !readerc)(`${stem}: every hull material resolves, and the names the grenade asks for are the archive's`, () => {
      const table = materialTable(soilsTable(script(readerc!, 'materials.rdr')));
      const toc = parseZdb(zdb!);
      const root = parseWorldRoot(Zar.parse(zdbMember(zdb!, toc, `${stem}.ZED`)));
      expect(root.defaultMaterial).toBe(defaultMaterial);
      const polys = worldCollision(parseSceneGraph(Zar.parse(zdbMember(zdb!, toc, `${stem}_GEO.ZED`))));
      for (const b of new Set(polys.map((p) => p.material))) {
        expect(b).toBeLessThan(table.length);
        expect(surfaceMaterial(b, root.defaultMaterial, table).name).not.toBe('UNKNOWN');
      }
      expect(surfaceMaterial(0, root.defaultMaterial, table).name).toBe(defaultMaterial);
      const anims = parseAnimSets(Zar.parse(zdbMember(zdb!, toc, 'CZANIM.ZAR'))).sets.flatMap((s) => s.anims.map((a) => a.name));
      // The grenade_hit_<material> anims the archive holds are the names the code builds from the table's materials.
      const hits = anims.filter((a) => a.startsWith(`${M67.hitAnim}_`));
      expect(hits.length).toBeGreaterThan(10);
      // All but `grenade_hit_grating`: the table has no GRATING (METAL_GRATE is `grenade_hit_metal_grate`), no hull asks for it.
      expect(hits.filter((a) => !table.some((t) => materialAnim(M67.hitAnim, t.name) === a))).toEqual(['grenade_hit_grating']);
      expect(anims).toContain(materialAnim(M67.hitAnim, defaultMaterial));
    });
  }

  it.skipIf(!motion)('the clips are MOTION_P.ZAR\'s, their lengths to the frame', () => {
    const clips = parseMotionZar(Zar.parse(motion!));
    for (const a of [...Object.values(THROW_ANIMS), PLACE_CLAYMORE_ANIM]) {
      const clip = clips.find((c) => c.name === a.clip);
      expect(clip?.duration).toBeCloseTo(a.duration, 6);
    }
  });
});

describe("PAR-96 B1: the claymore's limit counts claymores only (FUN_003cc1f0 D:L321206-321210; the mark D:L474101)", () => {
  const charge = (id: number, state: Grenade['state'] = 'rest') => ({ record: { ...CLAYMORE, id }, state });

  it('a claymore (153, 0x99) set down counts; C4 (151), the satchel (152), MPBOMB (154) and the PMN (158) never do', () => {
    expect(countsTowardClaymoreLimit(charge(153))).toBe(true);
    for (const id of [151, 152, 154, 158]) expect(countsTowardClaymoreLimit(charge(id))).toBe(false);
  });

  it("CLAYMORE_COUNT_LIVE_READING: live is at rest -- not in flight, set off or removed (the node's +0x5c bit 0, D:L321209)", () => {
    expect(CLAYMORE_COUNT_LIVE_READING).toBe('at rest');
    for (const state of ['flight', 'detonated', 'removed'] as const) expect(countsTowardClaymoreLimit(charge(153, state))).toBe(false);
  });

  it('the limit stays four (FUN_005be9a0 D:L475308, D:L475340: `< 4`)', () => {
    expect(CLAYMORE_RULES.maxPlaced).toBe(4);
  });
});
