import { describe, expect, it } from 'vitest';
import { DEFAULT_RIFLE, HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import {
  applyFall, applyHit, bulletDamage, FRAGMENT_PARTS, FRAGMENT_ROLLS, fragmentCount, fragmentDamage, fragmentPart, freshHealth, isDead,
  LIMB_SPILL, LIMB_SPILL_PIERCING, overall, PART, pelletDamage, PIERCE_ROUNDING_READING, quantiseHit, shotgunPellets,
} from '../src/net/damage';

/** The game's damage (web research 91 sections 1-5): the table's shots to kill, the falloff, the falls, the blasts. */

function shotsToKill(w: typeof DEFAULT_RIFLE, part: number): number {
  const h = freshHealth();
  for (let n = 1; n <= 20; n++) if (applyHit(h, part, bulletDamage(w, 0)!, w.piercing)) return n;
  return Infinity;
}

describe('online shotgun receiver (research 94 C2.1; retail FUN_005a1b80 D:L459543-459566)', () => {
  // ZWEAPON.ZAR / 12 Gauge: raw ImpactDamage 2.5, Piercing 6. No synthetic balance values.
  const shotgun = { ...DEFAULT_RIFLE, impactDamage: 2.5, damageModifier: 0, piercing: 6, effectiveRange: 40, maximumRange: 85 };

  it('uses fractional ammo damage, not scaled projectile damage or the hit packet byte', () => {
    expect(pelletDamage(shotgun, 50)).toBe(2.5);
    expect(pelletDamage(shotgun, 600)).toBe(2.5);
    expect(pelletDamage({ ...shotgun, damageModifier: 4 }, 50)).toBe(2.5);
  });

  it('requires a positive incoming damage byte, including the last part of range falloff', () => {
    expect(pelletDamage(shotgun, 830)).toBe(2.5);
    expect(pelletDamage(shotgun, 840)).toBeNull(); // scaled projectile < 1, transmitted as zero
    expect(pelletDamage(shotgun, 850)).toBeNull();
    expect(pelletDamage(shotgun, 851)).toBeNull();
    expect(pelletDamage({ ...shotgun, damageModifier: -2.5 }, 50)).toBeNull();
  });

  it('needs four head pellets to kill a fresh player, allowing a close one-shell kill', () => {
    const h = freshHealth(), damage = pelletDamage(shotgun, 50)!;
    for (let i = 0; i < 3; i++) expect(applyHit(h, PART.HEAD, damage, shotgun.piercing)).toBe(false);
    expect(h.hp[PART.HEAD]).toBe(0.5);
    expect(applyHit(h, PART.HEAD, damage, shotgun.piercing)).toBe(true);
  });

  it('cannot kill a fresh target with the maximum two head pellets at 20 m', () => {
    const h = freshHealth(), count = shotgunPellets(200, (() => {
      const rolls = [0.99, 0]; // maximum random extra count, then round up
      return () => rolls.shift()!;
    })());
    expect(count).toBe(2);
    for (let i = 0; i < count; i++) applyHit(h, PART.HEAD, pelletDamage(shotgun, 200)!, shotgun.piercing);
    expect(h.hp[PART.HEAD]).toBe(3);
    expect(isDead(h)).toBe(false);
  });
});

describe('bullets (research 91 section 1.2)', () => {
  it('does the table\'s damage a round', () => {
    expect(bulletDamage(DEFAULT_RIFLE, 0)).toBeCloseTo(36.4, 6);   // M4A1
    expect(bulletDamage(HELD_RIFLE, 0)).toBeCloseTo(34.3, 6);      // M4A1 SD
    expect(bulletDamage(HELD_SIDEARM, 0)).toBeCloseTo(42, 6);      // Mark 23
  });

  it('kills in the table\'s shots: M4A1 and SD 1 head / 3 body, Mark 23 1 / 2', () => {
    expect(shotsToKill(DEFAULT_RIFLE, PART.HEAD)).toBe(1);
    expect(shotsToKill(DEFAULT_RIFLE, PART.BODY)).toBe(3);
    expect(shotsToKill(HELD_RIFLE, PART.HEAD)).toBe(1);
    expect(shotsToKill(HELD_RIFLE, PART.BODY)).toBe(3);
    expect(shotsToKill(HELD_SIDEARM, PART.BODY)).toBe(2);
  });

  it('a limb never kills by itself until it is spent; then it spills into the body', () => {
    const h = freshHealth();
    expect(applyHit(h, PART.RLEG, 36.4, 3)).toBe(false);
    expect(applyHit(h, PART.RLEG, 36.4, 3)).toBe(false);
    expect(h.hp[PART.RLEG]).toBe(0);
    expect(h.hp[PART.BODY]).toBe(50);
    applyHit(h, PART.RLEG, 36.4, 3);
    // DAT_006508a8 = 0.3, DAT_006508b0 = 10 (the ELF's .data): 0.3 of the round at piercing 10 -- through the armour.
    expect(h.hp[PART.BODY]).toBeCloseTo(50 - 36.4 * 0.3, 9);
    expect(h.armour[PART.BODY]).toBe(25);
  });

  it('spills a spent limb hit into the body at the .data constants', () => {
    expect(LIMB_SPILL).toBeCloseTo(0.3, 6);
    expect(LIMB_SPILL_PIERCING).toBe(10);
  });

  it('falls off from Effective_Range to nothing at Maximum_Range, and ignores a round past it', () => {
    const e = DEFAULT_RIFLE.effectiveRange * 10, m = DEFAULT_RIFLE.maximumRange * 10;
    expect(bulletDamage(DEFAULT_RIFLE, e)).toBeCloseTo(36.4, 6);
    expect(bulletDamage(DEFAULT_RIFLE, (e + m) / 2)).toBeCloseTo(18.2, 6);
    expect(bulletDamage(DEFAULT_RIFLE, m + 1)).toBeNull();
  });

  it("a bullet's damage is truncated toward zero and capped at 255, its piercing stepped to 0.05 (FUN_002bd220 D:L161655-161672, .data 0x3de728-0x3de740): an M4 hit at a falloff distance giving 27.6 takes exactly 27", () => {
    // PF-22 (research 179 s8.3; 219 s1): the victim's console applies the hit packet's bytes -- `(int)GetDamage` and
    // `(int)(piercing x 20)`, each clamped [0, 255] (`cvt.w.s` truncates toward zero), the piercing received x 0.05.
    const e = DEFAULT_RIFLE.effectiveRange * 10, m = DEFAULT_RIFLE.maximumRange * 10;
    const d = e + (m - e) * (1 - 27.6 / 36.4);                       // the falloff that leaves 27.6 of the M4A1's 36.4
    const dmg = bulletDamage(DEFAULT_RIFLE, d)!;
    expect(dmg).toBeCloseTo(27.6, 9);
    expect(quantiseHit(dmg, DEFAULT_RIFLE.piercing)).toEqual({ damage: 27, piercing: 3 });
    expect(quantiseHit(36.4, 3).damage).toBe(36);                    // full range: 36, not 36.4
    expect(quantiseHit(27.99, 0).damage).toBe(27);                   // toward zero, never rounded
    expect(quantiseHit(126 * 3, 0).damage).toBe(255);                // the byte's cap (0x3de730 = 255)
    expect(quantiseHit(-3, 0).damage).toBe(0);                       // and its floor (0x3de728 = 0)
    expect(quantiseHit(35.9999999, 0).damage).toBe(35);              // never rounded up to a single on the way
    expect(quantiseHit(36.4, 0.33).piercing).toBeCloseTo(0.3, 12);   // 6.6 steps -> 6 (0.05 each)
    // PIERCE_ROUNDING_READING 'chop': the EE FPU's mul.s rounds toward zero. The single 0.35 (0.34999999) x 20 is
    // 6.9999999 exactly, chopped to 6.9999995: 6 steps (nearest would give 7.0). The single 2.1 (2.0999999046) x 20 is
    // 42 - 2^-19, chopped to 41.999996: 41 steps, 2.05 (nearest-even would give 42, 2.10) -- nine weapon records' piercing.
    expect(PIERCE_ROUNDING_READING).toBe('chop');
    expect(quantiseHit(36.4, 0.35).piercing).toBeCloseTo(0.3, 12);
    expect(quantiseHit(36.4, 2.1).piercing).toBeCloseTo(2.05, 12);
    expect(quantiseHit(36.4, 3).piercing).toBe(3);                   // an exact product is untouched: 60 steps
    expect(quantiseHit(36.4, 20).piercing).toBeCloseTo(12.75, 12);   // 400 steps capped at 255 (0x3de740)
  });

  it('caps the limbs by the body\'s share after a body hit, and the bar weights the head 3x', () => {
    const h = freshHealth();
    expect(overall(h)).toBe(1);
    applyHit(h, PART.BODY, 36.4, 3);
    const share = h.hp[PART.BODY]! / 50;
    expect(h.hp[PART.RARM]).toBeCloseTo(30 * share, 9);
    expect(h.hp[PART.HEAD]).toBe(8);
    expect(overall(h)).toBeLessThan(1);
  });
});

describe('falls and blasts (research 91 section 5)', () => {
  it('hurts from 170.7 u/s (a 62-unit fall) and kills at 237.5 (120 units)', () => {
    const g = 235, v = (h: number): number => Math.sqrt(2 * g * h);
    const a = freshHealth();
    expect(applyFall(a, v(60))).toBe(false);
    expect(a.hp).toEqual(freshHealth().hp);
    const b = freshHealth();
    expect(applyFall(b, v(90))).toBe(false);
    expect(b.hp[PART.BODY]).toBeLessThan(50);
    expect(applyFall(freshHealth(), v(121))).toBe(true);
  });

  it('an M67 fragment is 140 to 75 units and 0 at 150; one on the head or body kills', () => {
    expect(fragmentDamage(10, 150, 10)).toBe(140);
    expect(fragmentDamage(10, 150, 75)).toBe(140);
    expect(fragmentDamage(10, 150, 112.5)).toBeCloseTo(70, 9);
    expect(fragmentDamage(10, 150, 150)).toBe(0);
    const h = freshHealth();
    expect(applyHit(h, PART.BODY, 140, 4)).toBe(true);
    expect(isDead(h)).toBe(true);
  });

  it('sends 9-15 fragments close, fewer crouched and prone, thinning past 30 units', () => {
    const r = (v: number) => () => v;
    expect(fragmentCount(10, 'stand', r(0))).toBe(9);
    expect(fragmentCount(10, 'stand', r(0.99))).toBe(15);
    expect(fragmentCount(10, 'crouch', r(0))).toBe(8);
    expect(fragmentCount(10, 'prone', r(0))).toBe(6);
    expect(fragmentCount(60, 'stand', r(0.99))).toBeLessThanOrEqual(4);
  });
});

describe('the part a fragment strikes (FUN_005a0e70 L459240-459252; .data DAT_006508e0 / DAT_006508d0)', () => {
  it('reads the tables in the ELF: head 30 %, body 30 %, left arm, right arm, left leg, right leg 10 % each', () => {
    expect(FRAGMENT_ROLLS).toEqual([0.3, 0.6, 0.7, 0.8, 0.9, 1.0]);
    expect(FRAGMENT_PARTS).toEqual([PART.HEAD, PART.BODY, PART.LARM, PART.RARM, PART.LLEG, PART.RLEG]);
    const at = (v: number): number => fragmentPart(() => v);
    expect(at(0)).toBe(PART.HEAD);
    expect(at(0.29)).toBe(PART.HEAD);
    expect(at(0.3)).toBe(PART.BODY);
    expect(at(0.65)).toBe(PART.LARM);
    expect(at(0.75)).toBe(PART.RARM);
    expect(at(0.85)).toBe(PART.LLEG);
    expect(at(0.95)).toBe(PART.RLEG);
  });
});
