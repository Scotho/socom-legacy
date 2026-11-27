import { describe, expect, it } from 'vitest';
import { SEAL_TUNING, type CollisionOwner, type GridParams, type WorldPoly } from '@s2u/scene';
import { landSpeeds, landingClass as soundLandingClass } from '@s2u/sound';
import { landingClass as moverLandingClass } from '../src/mover';
import {
  applyFall, fallDamageFraction, fallSpeeds, freshHealth, FALL_DEATH_SPEED, FALL_HEAVY_SPEED, FALL_HURT_SPEED, FALL_SPEEDS,
  DIVE_LANDING_BIT3_READING, DIVE_LANDING_SPEED_FACTOR, MP_ARMOUR, MP_HEALTH, PARTS,
} from '../src/net/damage';
import * as damage from '../src/net/damage';
import { groundGrid, packGround, Walker, type WalkInput } from '../src/sim';

/**
 * Fall damage (research 151; `FUN_005ac1f0` D:L464866-464960): the one quantity -- the landing's contact speed against
 * the seal table's three landing speeds -- that the landing's class, its sound (`@s2u/sound` `landingSounds`: the
 * page's `GameAudio.onLand`) and its damage (`applyFall`, the room) are all read from. The speeds
 * are `FUN_0059ba80`'s (D:L456671-456682): `g x sqrt(2h / g)` over `FALLING_DAMAGE_LIGHT/HEAVY/DEATH` at the table's
 * gravity, computed here as the loader computes them, never a rounded literal, so a landing classed hurt is one the room
 * takes health for and no other. The hurt voice is not the landing's: the room's `hurt` plays it, the damage
 * reaction's (research 205 §2.2).
 */

const G = SEAL_TUNING.gravity, H = SEAL_TUNING.fallingDamage;
const SPEEDS = landSpeeds(G, H);

describe('the landing speeds: one formula for the sound, the mover and the damage (FUN_0059ba80 D:L456671-456682)', () => {
  it('the damage speeds are the table\'s g x sqrt(2h / g) exactly: 170.70, 206.81 and 237.49 at g 235 and 62 / 91 / 120', () => {
    expect(FALL_SPEEDS).toEqual(SPEEDS);
    expect(fallSpeeds(G, H)).toEqual(SPEEDS);
    expect(FALL_HURT_SPEED).toBe(SPEEDS[0]);
    expect(FALL_HEAVY_SPEED).toBe(SPEEDS[1]);
    expect(FALL_DEATH_SPEED).toBe(SPEEDS[2]);
    expect(FALL_HURT_SPEED).toBeCloseTo(170.704, 3);
    expect(FALL_HEAVY_SPEED).toBeCloseTo(206.809, 3);
    expect(FALL_DEATH_SPEED).toBeCloseTo(237.487, 3);
    // The classes the mover lands by are the same three speeds (`mover.ts` `landingClass`).
    for (const v of [100, SPEEDS[0], SPEEDS[0] + 1e-9, 190, SPEEDS[1], SPEEDS[1] + 1e-9, 220, SPEEDS[2] - 1e-9, SPEEDS[2], 300]) {
      expect(moverLandingClass(v), `class at ${v}`).toBe(soundLandingClass(v, SPEEDS));
    }
  });

  it('the landing\'s class and the damage share the light speed: over a sweep of speeds, a landing is classed hurt (1 and up) exactly when it takes health', () => {
    const speeds: number[] = [];
    for (let v = 0; v <= 320; v += 0.25) speeds.push(v);
    speeds.push(SPEEDS[0] - 1e-6, SPEEDS[0], SPEEDS[0] + 1e-6, 170.7, 170.704, SPEEDS[1], SPEEDS[2] - 1e-6, SPEEDS[2]);
    for (const v of speeds) {
      const h = freshHealth();
      applyFall(h, v);
      const tookHealth = h.hp.some((hp, i) => hp < MP_HEALTH[i]!);
      expect(tookHealth, `speed ${v}`).toBe(soundLandingClass(v, SPEEDS) >= 1);
      expect(fallDamageFraction(v) > 0, `fraction at ${v}`).toBe(tookHealth);
    }
    // The rounded 170.7 of research 91's table is under the speed: a landing there is classed soft and takes nothing.
    expect(soundLandingClass(170.7, SPEEDS)).toBe(0);
    expect(fallDamageFraction(170.7)).toBe(0);
  });
});

describe('the fraction and the six parts (FUN_005ac1f0 D:L464890-464897, D:L464941-464950)', () => {
  it('f is 0 at or under the light speed, (v - light) / (death - light) between, 1 at or over the deadly', () => {
    expect(fallDamageFraction(0)).toBe(0);
    expect(fallDamageFraction(SPEEDS[0])).toBe(0);
    expect(fallDamageFraction(Number.NaN)).toBe(0);
    expect(fallDamageFraction((SPEEDS[0] + SPEEDS[2]) / 2)).toBeCloseTo(0.5, 12);
    expect(fallDamageFraction(SPEEDS[1])).toBeCloseTo((SPEEDS[1] - SPEEDS[0]) / (SPEEDS[2] - SPEEDS[0]), 12);
    expect(fallDamageFraction(SPEEDS[2])).toBe(1);
    expect(fallDamageFraction(1000)).toBe(1);
    // Another table's speeds (a disc whose dynamics.rdr differs) go in as the three speeds.
    expect(fallDamageFraction(150, [100, 150, 200])).toBe(0.5);
  });

  it('every part, the head too, loses max x f straight off its health; the armour is not in the step; nothing goes under 0', () => {
    const h = freshHealth();
    const v = SPEEDS[0] + 0.25 * (SPEEDS[2] - SPEEDS[0]);
    expect(applyFall(h, v)).toBe(false);
    for (let i = 0; i < PARTS; i++) expect(h.hp[i], `part ${i}`).toBeCloseTo(MP_HEALTH[i]! * 0.75, 9);
    expect(h.armour).toEqual([...MP_ARMOUR]);
    // A second landing of the same speed takes the same amount again (the loop subtracts `max x f`, not `health x f`).
    applyFall(h, v);
    for (let i = 0; i < PARTS; i++) expect(h.hp[i], `part ${i} twice`).toBeCloseTo(MP_HEALTH[i]! * 0.5, 9);
    // At the deadly speed every part is 0 and the SEAL is dead (the head or the body at 0, `isDead`).
    const dead = freshHealth();
    expect(applyFall(dead, SPEEDS[2])).toBe(true);
    expect(dead.hp).toEqual([0, 0, 0, 0, 0, 0]);
    // A hurt part already low is clamped at 0, never negative.
    const low = { hp: [1, 1, 1, 1, 1, 1], armour: [...MP_ARMOUR] };
    applyFall(low, v);
    expect(low.hp).toEqual([0, 0, 0, 0, 0, 0]);
  });

  // R4P-104 (reading, pending review): the x 1.2 is the dive's landing's alone -- r0004 0x585900 (r0001 `FUN_00580360`),
  // its scaled call at 0x585980-0x585994 (D:L441929), reached only with `dive_to_prone` in play (r0004 0x5b5ce4-0x5b5cfc;
  // r0001 D:L466908-466914). A knock's landing (`Fall forward` / `Fall backwards`) takes the plain speed (r0004
  // 0x5b5aa8-0x5b5aac; r0001 D:L466836, D:L466844): the knock-named factor is gone.
  it('a dive\'s landing reaches the rule at its contact speed x 1.2 (r0004 0x585980-0x585994; FUN_00580360 D:L441929); no knock factor', () => {
    expect(DIVE_LANDING_SPEED_FACTOR).toBe(1.2);
    expect(DIVE_LANDING_BIT3_READING).toBe('ignored');
    expect('KNOCK_LANDING_SPEED_FACTOR' in damage).toBe(false);
    // A dive landing at 150 a second is read as 180: over the light speed, so it hurts where a plain fall at 150 does not.
    expect(fallDamageFraction(150)).toBe(0);
    expect(fallDamageFraction(150 * DIVE_LANDING_SPEED_FACTOR)).toBeGreaterThan(0);
  });
});

describe('a landing takes the body\'s own maxima (FUN_005ac1f0: +0x1014 x f; the drift audit, 2026-10-10)', () => {
  it('a body with its own part maxima loses max x f of its own, not a SEAL\'s', () => {
    const max = [10, 20, 30, 40, 50, 60];
    const h = { hp: [...max], armour: [0, 0, 0, 0, 0, 0], max };
    const v = (FALL_SPEEDS[0] + FALL_SPEEDS[2]) / 2, f = fallDamageFraction(v);
    expect(f).toBeGreaterThan(0);
    applyFall(h, v);
    h.hp.forEach((hp, i) => expect(hp).toBeCloseTo(max[i]! - max[i]! * f, 9));
  });
});

// R4P-104 review F3: the dive's mark (`markDiveFall`) is the landing's the dive's fall ends in. A fall the traversal ends
// with no landing (`setAirborne(false)`: the jump-grab, a ladder's or a hang's hand-back) ends the dive's fall with it, so
// a later ordinary landing is not the dive's (r0004 0x5b5ce4-0x5b5cfc: `dive_to_prone` in play at THAT contact).
describe("R4P-104 review F3: a dive's fall ended without a landing leaves no mark on a later landing", () => {
  const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
  const STILL: WalkInput = { forward: 0, right: 0, boost: false };
  const FLOOR: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-1000, 0, 1000, 1000, 0, 1000, 1000, 0, -1000, -1000, 0, -1000]),
  };
  function walker(): Walker {
    const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
    const w = new Walker(groundGrid(packGround(PARAMS, [FLOOR], owners)));
    expect(w.place(0, 20, 0)).toBe(true);
    w.settle();
    return w;
  }
  /** Lifts the body `h` over the floor and ticks until it is in the air. */
  function lift(w: Walker, h: number): void {
    w.state.y = h;
    for (let i = 0; i < 10 && !w.airborne; i++) w.tick(STILL);
    expect(w.airborne).toBe(true);
  }
  function fallToFloor(w: Walker): void {
    for (let i = 0; i < 600 && w.airborne; i++) w.tick(STILL);
    expect(w.airborne).toBe(false);
  }

  it("the control: a marked dive fall lands as the dive's", () => {
    const w = walker();
    lift(w, 30);
    w.markDiveFall();
    fallToFloor(w);
    expect(w.landing!.dived).toBe(true);
  });

  it("a marked dive fall handed back by setAirborne(false), then an ordinary fall: that landing is not the dive's", () => {
    const w = walker();
    lift(w, 30);
    w.markDiveFall();
    w.setAirborne(false);                                // the jump-grab / hand-back: no landing recorded
    w.state.y = 0;
    for (let i = 0; i < 30; i++) w.tick(STILL);
    lift(w, 30);                                         // a later ordinary fall
    fallToFloor(w);
    expect(w.landing!.dived).toBe(false);
  });
});
