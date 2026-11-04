// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BUILTIN_MATERIALS, buildGrid, EMPTY_ITEM, GAME_FRAME_DT, ITEM, itemClass, SOILS, UNITS_PER_METRE, type Grid, type Loadout, type WeaponRecord, type WorldPoly } from '@s2u/scene';
import { Fire } from '../src/fire';
import { Accuracy, burstScalar, DEFAULT_FIRE_MODE_FULL_AUTO_ADAPTATION, defaultFireMode, fireInterval, kickStarts, kickTicks, nextFireMode, originalSpawnFireMode, pickupFireMode, roundsPerPull } from '../src/accuracy';
import { afterShotLock, pelletsOf, reloadDelayOf } from '../src/firearms';
import { withDoubleAmmo } from '../src/loadout';
import { ringFor } from '../src/magazines';
import { bulletDamage } from '../src/net/damage';
import { reticleType } from '../src/reticle';
import { RifleKick } from '../src/rifleKick';
import { scopeLevels } from '../src/sights';
import { BINOCULARS, hudZoom, Zoom, zoomsIn } from '../src/zoom';

/**
 * TA-WEAPONS: the page's and the room's gunplay driven from the pinned weapon table (TA.R3's unit half; no game data).
 * The pin is `scene/test/golden/weapon-records.json` -- every firearm record `readKitTable` reads off `ZWEAPON.ZAR`, re-read
 * whole by `scene/test/weaponTable.parity.test.ts` whenever the disc is present. Each test below names the function and
 * the note it holds: research 84 (the rate, the modes, the bloom, the knock, the kick, the zoom, the reticle, the
 * magazines) and research 94 (the class keys, 2X, the scope levels).
 */

const PIN = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../scene/test/golden/weapon-records.json'), 'utf8')) as { records: Record<string, WeaponRecord> };
const ALL: WeaponRecord[] = Object.values(PIN.records);
const rec = (id: number): WeaponRecord => PIN.records[String(id)]!;
const named = (name: string): WeaponRecord => ALL.find((r) => r.name === name)!;
const SD = rec(62), M4 = rec(54), MARK23 = rec(15);
const CARRIERS = new Set<number>([ITEM.MGL, ITEM.M79]);

describe('the rate and the trigger off the pinned records (FUN_005c0940, FUN_005c09f0; research 84 §6)', () => {
  it('the wait: FireWait single, x 0.8 burst and automatic -- the SD 0.14 / 0.112 s (536 a minute), the M4A1 0.12 / 0.096 (625)', () => {
    expect([fireInterval(SD.fireWait, 1), fireInterval(SD.fireWait, 2), fireInterval(SD.fireWait, 3)]).toEqual([0.14, 0.14 * 0.8, 0.14 * 0.8]);
    expect(fireInterval(SD.fireWait, 3)).toBeCloseTo(0.112, 12);
    expect(Math.round(60 / fireInterval(SD.fireWait, 3))).toBe(536);
    expect(fireInterval(M4.fireWait, 3)).toBeCloseTo(0.096, 12);
    expect(Math.round(60 / fireInterval(M4.fireWait, 3))).toBe(625);
    expect(fireInterval(SD.fireWait, 0)).toBe(1);
    // Every pinned record's own modes: a semi-only weapon waits its FireWait, an automatic one 0.8 of it.
    for (const r of ALL) for (const m of r.fireModes) expect([r.name, m, fireInterval(r.fireWait, m)]).toEqual([r.name, m, m === 1 ? r.fireWait : r.fireWait * 0.8]);
  });

  it('rounds a pull: single 1, burst 3, automatic 10,000, safe 0, a round mode (an item id) 1', () => {
    expect([0, 1, 2, 3, 4, ITEM.M203_FRAG, ITEM.GL_FRAG].map(roundsPerPull)).toEqual([0, 1, 3, 10000, 1, 1, 1]);
  });

  it('the mode each pinned weapon comes up in, as the original: burst where it has it, else its first mode (FUN_005c0250 D:L476185-476192)', () => {
    const got = Object.fromEntries(ALL.map((r) => [r.name, originalSpawnFireMode(r)]));
    for (const r of ALL) {
      const want = CARRIERS.has(r.id) ? 0 : r.fireModes.includes(2) ? 2 : r.fireModes[0];
      expect([r.name, got[r.name]]).toEqual([r.name, want]);
    }
    expect([got['M4A1 SD'], got['M16A2'], got['M14'], got['Model 18'], got['M60E3'], got['Mark 23'], got['M40A1']]).toEqual([2, 2, 1, 1, 3, 1, 1]);
  });

  it('OT.R100 (DEFAULT_FIRE_MODE_FULL_AUTO_ADAPTATION): every weapon with automatic comes up on it; the 20 it moves off the original', () => {
    expect(DEFAULT_FIRE_MODE_FULL_AUTO_ADAPTATION).toBe(true);
    for (const r of ALL) expect([r.name, defaultFireMode(r)]).toEqual([r.name, r.fireModes.includes(3) ? 3 : originalSpawnFireMode(r)]);
    const moved = ALL.filter((r) => defaultFireMode(r) !== originalSpawnFireMode(r)).map((r) => r.name);
    expect(moved).toEqual([
      'Model 18', 'HK5', 'HK5SD', 'F90', '9mm Sub', 'MP5K', 'M4A1', '552', 'AK-47', 'AKS-74', 'M14', 'M4A1-M203', 'M4A1 SD',
      'F2000', 'SA-80 A2', 'AK-105', 'KBP OTs-14 Groza', '552SD', 'Steyr Aug', 'JACKHAMMER',
    ]);
  });

  it('a weapon picked up: its highest mode in the hand (FUN_005c0fd0 D:L476658-476668), its first at a swap to it (FUN_005c4b10 D:L478930-478931)', () => {
    for (const r of ALL) {
      const carrier = CARRIERS.has(r.id);
      expect([r.name, pickupFireMode(r, [], true), pickupFireMode(r, [], false)])
        .toEqual([r.name, carrier ? 0 : r.maxFireMode, carrier ? 0 : r.fireModes[0]]);
    }
    expect(['AK-47', 'M4A1', 'M16A2', 'M14', 'Model 18', 'M60E3', 'M40A1'].map((n) => pickupFireMode(named(n), [], true))).toEqual([3, 3, 2, 3, 3, 3, 1]);
  });

  it('the switch walks each weapon\'s own modes in order and wraps to single; refused while magnified (FUN_005c4600)', () => {
    for (const r of ALL) {
      if (CARRIERS.has(r.id) || r.fireModes.length === 0) continue;
      const walk = [r.fireModes[0]!];
      for (let i = 0; i < r.fireModes.length; i++) walk.push(nextFireMode(r, walk[walk.length - 1]!));
      expect([r.name, walk]).toEqual([r.name, [...r.fireModes, r.fireModes[0]]]);
      expect(nextFireMode(r, r.fireModes[0]!, true)).toBe(r.fireModes[0]);
    }
  });
});

describe('the zoom per pinned record (FUN_005445b0, FUN_00544400, FUN_005448a0; research 84 §7, research 94 §C1.4)', () => {
  it('every record: third -> first person (1.01) -> its scope levels in order, no wrap; one mode -> the binoculars at 9x', () => {
    for (const r of ALL) {
      const z = new Zoom(r);
      expect([r.name, z.zoomIn(), z.target()]).toEqual([r.name, 1, 1.01]);
      const levels = scopeLevels(r);
      if (!zoomsIn(r)) {
        expect([r.name, z.zoomIn(), z.target(), z.hudZoom(), z.zoomIn()]).toEqual([r.name, BINOCULARS, 9, 9, BINOCULARS]);
        continue;
      }
      const seen: number[] = [];
      for (let i = 0; i < levels.length; i++) { z.zoomIn(); seen.push(z.target()); expect(z.hudZoom()).toBe(levels[i]); }
      expect([r.name, seen, z.zoomIn() === 4 + levels.length]).toEqual([r.name, levels, true]);
    }
    expect(ALL.filter(zoomsIn).length).toBe(14);                       // the 13 of research 94 §C1.4 and the F2000
  });

  it('the M40A1 out of its 12x: 6 -> 5 (6x) -> first person -> third; a night map steps 1 -> 3 -> 5 and 5 -> 3', () => {
    const z = new Zoom(named('M40A1'));
    for (let i = 0; i < 3; i++) z.zoomIn();
    expect([z.state(), z.target()]).toEqual([6, 12]);
    expect([z.zoomOut(), z.target(), z.zoomOut(), z.zoomOut()]).toEqual([5, 6, 1, 0]);
    const night = new Zoom(SD, true);
    expect([night.zoomIn(), night.zoomIn(), night.zoomIn(), night.target(), night.zoomOut()]).toEqual([1, 3, 5, 3, 3]);
    expect([hudZoom(5, SD.zoomModes), hudZoom(5, M4.zoomModes), hudZoom(BINOCULARS, MARK23.zoomModes), hudZoom(1, SD.zoomModes)]).toEqual([3, 2.5, 9, 0]);
  });
});

describe('the reticle set per pinned record (FUN_005be300 L474894-474950; research 84 §9, research 94 §C6)', () => {
  it('unscoped by the ID: pistols 0, SMGs, rifles, MGs and snipers 1, shotguns 2, the grenade launchers 3; a scope 5, the binoculars 7', () => {
    const want: Record<string, number> = { pistol: 0, smg: 1, rifle: 1, mg: 1, sniper: 1, shotgun: 2, grenadeLauncher: 3 };
    for (const r of ALL) {
      expect([r.name, reticleType(r.id, 1, 1.01, defaultFireMode(r))]).toEqual([r.name, want[itemClass(r.id)]]);
      expect([r.name, reticleType(r.id, 0, 1.0, 1)]).toEqual([r.name, want[itemClass(r.id)]]);
      expect(reticleType(r.id, BINOCULARS, 9, 1)).toBe(7);
    }
    for (const r of ALL.filter(zoomsIn)) expect(reticleType(r.id, 5, r.zoomModes[1]!, 1)).toBe(5);
    // The M203 rifles keep the rifle's set in a rifle mode, the launcher's in a round mode (R94.8).
    expect([reticleType(ITEM.M4_203, 0, 1, 2), reticleType(ITEM.M4_203, 0, 1, ITEM.M203_FRAG)]).toEqual([1, 3]);
  });
});

describe('the magazines a spawn carries off the pinned records (FUN_005c75f0, FUN_005ba3d0; research 84 §18, research 94 §A7)', () => {
  it('Ammo_Capacity x NumMags; 2X doubles NumMags for pistol to sniper, at most ten, never the grenade launchers', () => {
    const plain = [54, 15, 121, 126, EMPTY_ITEM] as unknown as Loadout;
    const twoX = [54, 15, 121, 126, ITEM.DOUBLE_AMMO] as unknown as Loadout;
    for (const r of ALL) {
      const ring = ringFor(withDoubleAmmo(r, plain)), doubled = ringFor(withDoubleAmmo(r, twoX));
      expect([r.name, ring.capacity, ring.carried, ring.total()]).toEqual([r.name, r.magazine, r.mags, r.magazine * r.mags]);
      const want = CARRIERS.has(r.id) ? r.mags : Math.min(10, 2 * r.mags);
      expect([r.name, doubled.carried, doubled.total()]).toEqual([r.name, want, r.magazine * want]);
    }
    expect([named('M4A1 SD'), named('Mark 23'), named('MP5K'), named('870'), named('9mm Pistol'), named('M60E3')].map((r) => ringFor(withDoubleAmmo(r, twoX)).carried))
      .toEqual([6, 6, 10, 10, 10, 4]);
  });
});

describe('the class keys with the parser\'s defaults, off the pinned records (research 94 §C1.1, §C2.1)', () => {
  it('ReloadDelay: the 870 1 s, the Spas 12 and the JACKHAMMER 0.5, every other firearm the default 0.01', () => {
    const odd: Record<string, number> = { '870': 1, 'Spas 12': 0.5, JACKHAMMER: 0.5 };
    for (const r of ALL) expect([r.name, reloadDelayOf(r)]).toEqual([r.name, odd[r.name] ?? 0.01]);
  });

  it('the lock after a round: the bolts 0.5 s, the 870\'s pump 0.01 s (its misspelt key, R94.12), none on the last round or for any other', () => {
    for (const r of ALL) {
      const want = r.name === 'M40A1' || r.name === 'M87ELR' ? 0.5 : r.name === '870' ? 0.01 : null;
      expect([r.name, afterShotLock(r.id, r, 3, null)]).toEqual([r.name, want]);
      expect(afterShotLock(r.id, r, 0, null)).toBeNull();
    }
  });

  it('the pellets: four rays a pull from the 12 gauge shotguns, one from everything else', () => {
    for (const r of ALL) expect([r.name, pelletsOf(r)]).toEqual([r.name, itemClass(r.id) === 'shotgun' ? 4 : 1]);
  });
});

describe('a round on the reticle off the pinned records (FUN_005c3360; research 84 §3, §4, §16)', () => {
  const still = { stance: 'stand' as const, velocity: [0, 0, 0] as [number, number, number], airborne: false, yawRate: 0, pitchRate: 0, zoomState: 0 };

  it('the M4A1 SD standing: the first round of a pull climbs 12 x 0.4 = 4.8 px, each after 12, capped at 45; the bloom +7 from rest 1', () => {
    const a = new Accuracy(SD);
    a.trigger();
    a.round(0, 'stand');
    expect(a.state().offset[1]).toBeCloseTo(-4.8, 12);
    expect(a.state().size).toBe(8);
    a.round(0, 'stand');
    expect(a.state().offset[1]).toBeCloseTo(-16.8, 12);
    for (let i = 0; i < 10; i++) a.round(0, 'stand');
    expect(a.state().offset[1]).toBe(-45);
    expect(a.state().size).toBe(26);                                  // TargetMax standing
    // Back at ReticuleKnockReturn 70 a second (research 181 X1), run continuously at the page's frames (MISSION R8).
    for (let i = 0; i < 30; i++) a.update(1 / 60, still);            // half a second of 60 Hz page frames
    expect(a.state().offset[1]).toBeCloseTo(-45 + 70 * 0.5, 9);      // -10
    for (let i = 0; i < 8; i++) a.update(1 / 60, still);              // 0.633 s
    expect(a.state().offset[1]).toBeCloseTo(-45 + 70 * (38 / 60), 9);
    a.update(1 / 60, still);                                          // 45 / 70 = 0.643 s: home on the 39th page frame (0.65 s)
    expect(a.state().offset[1]).toBe(0);
  });

  it('the Mark 23: the first round climbs the whole 20 (KnockEntryStrength 1), the bloom 20 from its rest 10, capped at 30', () => {
    const a = new Accuracy(MARK23);
    a.trigger();
    expect(a.state().size).toBe(10);
    a.round(0, 'stand');
    expect([a.state().offset[1], a.state().size]).toEqual([-20, 30]);
    a.round(0, 'stand');
    expect(a.state().offset[1]).toBe(-40);                             // ReticuleKnockMax 40
  });

  it('the burst scalar: the M4A1 grows to min(n, 7) x 0.01 = 0.07 (the cap is on n, research 84 §3); the SD never', () => {
    expect(burstScalar(M4, 3)).toBe(0);                                // n = count + 1 - 4 <= 0
    expect(burstScalar(M4, 4)).toBeCloseTo(0.01, 12);
    expect(burstScalar(M4, 50)).toBeCloseTo(0.07, 12);
    for (const c of [1, 5, 10, 50]) expect(burstScalar(SD, c)).toBe(0);
  });

  it('scoped (state 5): no knock, no bloom; the first round kicks, the second drops the scope (FUN_005c5340)', () => {
    const a = new Accuracy(SD);
    a.trigger();
    expect(a.round(5, 'stand')).toEqual({ dropZoom: false, kick: true });
    expect(a.round(5, 'stand')).toEqual({ dropZoom: true, kick: false });
    expect([a.state().offset[1], a.state().size]).toEqual([0, 1]);
    expect([kickStarts(1, 1), kickStarts(5, 1), kickStarts(5, 2), kickTicks(3), kickTicks(4)]).toEqual([false, true, false, false, true]);
  });
});

describe('the scoped kick off the pinned records (FUN_005b91c0, FUN_005b9280; research 84 §8)', () => {
  it('the SD climbs BaseDist + RandomDist x rand at 0.5 rad/s -- 0.09 to 0.105 standing, 0.08 crouched, 0.06 prone -- then falls at 0.18', () => {
    for (const [stance, base] of [['stand', 0.09], ['crouch', 0.08], ['prone', 0.06]] as const) {
      for (const u of [0, 1]) {
        const k = new RifleKick(SD, () => u);
        k.round(0, stance);
        expect(k.stats().goal).toBeCloseTo(base + 0.015 * u, 12);
        expect(k.frame(0.1, 0)).toBeCloseTo(0.05, 12);                 // FireRifleKickRate 0.5 x 0.1 s
      }
    }
    const k = new RifleKick(SD, () => 0);
    k.round(0, 'stand');
    let pitch = 0;
    for (let i = 0; i < 20 && k.stats().state === 1; i++) pitch += k.frame(0.05, pitch);
    expect(k.stats().state).toBe(2);
    expect(k.frame(0.1, pitch)).toBeCloseTo(-0.018, 12);                // FireRifleKickReturnRate 0.18 x 0.1 s
  });

  it('every pinned record kicks by its own stance\'s FireRifleKick*; no pistol and no shotgun record carries one', () => {
    for (const r of ALL) {
      for (const stance of ['stand', 'crouch', 'prone'] as const) {
        const k = new RifleKick(r, () => 1), rec = r.rifleKick[stance];
        k.round(0, stance);
        expect([r.name, stance, k.stats().state, k.stats().goal]).toEqual([r.name, stance, rec ? 1 : 0, rec ? rec.baseDist + rec.randomDist : 0]);
      }
      if (['pistol', 'shotgun'].includes(itemClass(r.id))) expect([r.name, r.rifleKick]).toEqual([r.name, { stand: null, crouch: null, prone: null }]);
    }
  });
});

describe('the round\'s damage and reach off the pinned records (FUN_003c7600; research 84 §1, research 91 §1.1)', () => {
  it('(ImpactDamage + Damage_Modifier) x 14, whole to Effective_Range, to 0 at Maximum_Range, none past it -- in units, x 10', () => {
    expect(bulletDamage(SD, 0)).toBeCloseTo((2.3 + 0.15) * 14, 9);
    expect(bulletDamage(SD, 550 * UNITS_PER_METRE)).toBeCloseTo(34.3, 9);
    expect(bulletDamage(SD, 675 * UNITS_PER_METRE)).toBeCloseTo(34.3 / 2, 9);
    expect(bulletDamage(SD, 800 * UNITS_PER_METRE + 1)).toBeNull();
    expect(bulletDamage(M4, 0)).toBeCloseTo((2.3 + 0.3) * 14, 9);
    expect(bulletDamage(MARK23, 50 * UNITS_PER_METRE)).toBeCloseTo(42, 9);
    for (const r of ALL) {
      if (CARRIERS.has(r.id)) continue;
      expect([r.name, bulletDamage(r, 0)! / 14]).toEqual([r.name, expect.closeTo(r.impactDamage! + r.damageModifier!, 9)]);
      expect(bulletDamage(r, r.maximumRange * UNITS_PER_METRE + 1)).toBeNull();
    }
  });
});

describe('the eye\'s aim ray (FUN_005aa6e0; research 84 §19)', () => {
  // A shooter at (0, 20, 0) looking down -z, the muzzle at (3, 15, -8) (fire.test.ts's rig), over two walls across x: a
  // WATER face at z -20 (materials.rdr SOILS: PENETRATION 0.6, LIQUID; byte 11 = SOILS entry 9) and a STONE one at -60
  // (PENETRATION 0; byte 7). The round leaves the muzzle toward the point under the reticle the eye's ray finds.
  const wall = (z: number, material: number): WorldPoly => ({
    modelName: 'worldmodel', path: 'worldmodel/q', region: 0, ditype: 2, material, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-50, 0, z, 50, 0, z, 50, 50, z, -50, 50, z]),
  });
  const grid = (polys: WorldPoly[]): Grid => buildGrid({ atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
    [], [], polys, polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 })));
  const TABLE = [...BUILTIN_MATERIALS, ...SOILS];
  const muzzle: [number, number, number] = [3, 15, -8];
  const shotDir = (polys: WorldPoly[]): number[] => {
    const fire = new Fire({ grid: () => grid(polys), aim: () => ({ eye: [0, 20, 0], far: [0, 20, -1000] }), muzzle: () => muzzle }, M4, undefined, () => 0.5);
    fire.setMaterials((m) => (m === undefined ? TABLE[0]! : TABLE[m]!));
    const s = fire.shoot()!;
    const d = s.to.map((v, i) => v - s.from[i]!), n = Math.hypot(...d);
    return d.map((v) => v / n);
  };
  const toward = (z: number): number[] => {
    const d = [0 - muzzle[0], 20 - muzzle[1], z - muzzle[2]], n = Math.hypot(...d);
    return d.map((v) => v / n);
  };

  it('the materials the case names: WATER is SOILS entry 9 (0.6, LIQUID), STONE entry 5 (0, solid); a stone wall alone is the aim point', () => {
    expect([TABLE[11]!.name, TABLE[11]!.penetration, TABLE[11]!.liquid, TABLE[7]!.name, TABLE[7]!.penetration, TABLE[7]!.liquid]).toEqual(['WATER', 0.6, true, 'STONE', 0, false]);
    shotDir([wall(-60, 7)]).forEach((v, i) => expect(v).toBeCloseTo(toward(-60)[i]!, 9));
  });

  // FUN_005aa6e0 passes a hit that is VOLUMETRIC, LIQUID or PENETRATION >= 0.98 non-PICKUP (D:L464149-464151), so the
  // aim point under the reticle is past water (`aimPickBlocks`; fire.test.ts holds the fence, the ITEM, the volume, the
  // glass). The reach (max(range, 600) capped at the camera's +0xec, D:L464097-464114) is ported since AD-1 (fire.ts
  // `aimReach`, research 232 section 8; fire.test.ts "AD-1: the aim's reach"). Was: "is still not ported (AIM_RAY_READING)".
  it('the eye\'s ray looks through a LIQUID face: the round leaves the muzzle toward the stone behind the water', () => {
    shotDir([wall(-20, 11), wall(-60, 7)]).forEach((v, i) => expect(v).toBeCloseTo(toward(-60)[i]!, 9));
  });
});
