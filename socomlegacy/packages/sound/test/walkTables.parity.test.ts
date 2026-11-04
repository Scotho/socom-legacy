// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { rdrGet, Zar } from '@s2u/archive';
import { fixture } from '../../archive/test/fixtures';
import {
  fireVariant, footstepSound, globalRegister2, HARD_LANDING_SOUND, landingClass, landingSounds, landSpeeds, materialsFromArchive, parseBankFile,
  rangeGain, soundHash, soundParams, soundScriptFromArchive, weaponGlobals, weaponScriptFromArchive, weaponSounds,
  type Material, type WeaponGlobals, type WeaponSounds,
} from '../src/index';

/**
 * Parity pins for the tables the walk's sounds are chosen from (TA-SOUND; research 81 §3-§6): `materials.rdr`'s SOILS
 * (the footstep, crawl and landing sound of each collision material byte), the Frostfire banks' sounds with their
 * `sounds.rdr` entries (the CRC-32 they are filed under, `RANGE`, `ONESHOT`), and `zweapon.rdr`'s fire and reload sounds
 * with `WEAPON_GLOBAL`'s distances. Two halves (TA.R3): **unit**, the pins of `golden/` driving the selection code
 * (`footstepSound`, `landingSounds`, `fireVariant`, `rangeGain`, `soundHash`) with no game data; **fixture**, the pins
 * re-derived from `RUN/READERC.ZAR`, `RUN/SOUNDS/BNKSTORE.ZAR`, `RUN/SOUNDRDR.ZAR` and `RUN/ZWEAPON.ZAR` through the
 * repository's readers and compared whole (skips without them). `S2U_UPDATE_GOLDEN=1` rewrites the pins from the files.
 */

const GOLDEN = (name: string): string => fileURLToPath(new URL(`./golden/${name}`, import.meta.url));
const pin = <T>(name: string): T & { _source: string } => JSON.parse(readFileSync(GOLDEN(name), 'utf8')) as T & { _source: string };
/** A pin's JSON, one row a line: objects opened to two levels, arrays of rows one row a line, a row on one line. */
function formatPin(o: Record<string, unknown>): string {
  const pad = (n: number): string => '  '.repeat(n);
  const fmt = (v: unknown, depth: number): string => {
    if (Array.isArray(v) && v.length > 0 && depth < 3 && !v.every((x) => typeof x === 'number')) {
      return `[\n${v.map((x) => `${pad(depth + 1)}${JSON.stringify(x)}`).join(',\n')}\n${pad(depth)}]`;
    }
    if (v && typeof v === 'object' && !Array.isArray(v) && depth < 2) {
      return `{\n${Object.entries(v).map(([k, x]) => `${pad(depth + 1)}${JSON.stringify(k)}: ${fmt(x, depth + 1)}`).join(',\n')}\n${pad(depth)}}`;
    }
    return JSON.stringify(v);
  };
  return `${fmt(o, 0)}\n`;
}
function matchPin(name: string, source: string, derived: Record<string, unknown>): void {
  if (process.env.S2U_UPDATE_GOLDEN === '1') writeFileSync(GOLDEN(name), formatPin({ _source: source, ...derived }));
  const { _source, ...pinned } = pin<Record<string, unknown>>(name);
  expect(_source).toBe(source);
  expect(pinned).toEqual(derived);
}

interface BankRow {
  index: number; name: string; vol: number; volGroup: number; pan: number; grains: number; hash: number;
  /** The entry `soundParams` files under the CRC-32 of the bank's name as it stands (the port's lookup, soundData.ts); null: none. */
  script: ScriptRow | null;
  /**
   * The `SETS/<block>` entry at the row's own ordinal, which the original binds to bank sound n (R122.2, `FUN_003435c0`
   * +0x12): its hash, and which spelling of the bank's name hashes to it -- `exact` as it stands, `trimmed` without its
   * trailing blanks, null neither (a name the bank does not carry).
   */
  entry: ScriptRow & { hash: number; spelt: 'exact' | 'trimmed' | null };
}
type ScriptRow = { oneShot: boolean; ambient: boolean; doppler: boolean; range: [number, number] | null; volume: number | null; med: boolean; far: boolean };
type WalkSoundsPin = { banks: Record<string, BankRow[]> };
type WeaponsPin = { global: WeaponGlobals; weapons: WeaponSounds[] };

/** `DAT_003dfe10` = 1 / `MetersPerUnit` (decomp 217166): 10 units a metre (research 81 §5). */
const UNITS_PER_METRE = 10;

describe('the materials, pinned (golden/materials.json; research 81 §4)', () => {
  const materials = (): Material[] => pin<{ materials: Material[] }>('materials.json').materials;

  it('is the engine\'s UNKNOWN and PARTICLE_SYSTEM, then SOILS in file order: 46 in all, the index the polygon\'s byte', () => {
    const m = materials();
    expect(m.length).toBe(46);
    m.forEach((x, i) => expect(x.index, x.name).toBe(i));
    for (const x of m.slice(0, 2)) expect([x.step, x.stealthStep, x.crawl, x.land, x.fall]).toEqual([null, null, null, null, null]);
    const named: Record<number, string> = {
      0: 'UNKNOWN', 1: 'PARTICLE_SYSTEM', 2: 'ACTION', 3: 'INVISIBLE_DI', 4: 'GRASS', 5: 'SAND', 6: 'MUD', 7: 'STONE', 8: 'DIRT', 9: 'GLASS',
      11: 'WATER', 15: 'LEAVES', 16: 'ICE', 17: 'SNOW', 18: 'GRAVEL', 19: 'WOOD_THICK', 20: 'WOOD_THIN', 22: 'ASPHALT', 25: 'METAL_THICK',
      26: 'METAL_THIN', 28: 'METAL_GRATE', 30: 'FABRIC_HEAVY', 39: 'PLASTER', 40: 'CARPET',
    };
    for (const [i, name] of Object.entries(named)) expect(m[Number(i)]!.name).toBe(name);
  });

  it('STONE steps .STEP_STONE, sneaks .STEALTH_STONE, crawls .CRAWL_STONE and lands .STONE_JUMP; ASPHALT is the stone\'s; FABRIC_HEAVY the carpet\'s', () => {
    const m = materials();
    expect(m[7]).toMatchObject({ step: '.STEP_STONE', stealthStep: '.STEALTH_STONE', crawl: '.CRAWL_STONE', land: '.STONE_JUMP' });
    expect([m[22]!.step, m[22]!.stealthStep, m[22]!.crawl, m[22]!.land]).toEqual([m[7]!.step, m[7]!.stealthStep, m[7]!.crawl, m[7]!.land]);
    expect(m[30]!.step).toBe(m[40]!.step);
    expect(m[25]!.step).toBe('.STEP_METAL');
    expect(m[26]!.step).toBe('.STEP_TIN');                   // research 81 §4: Frostfire's METAL_THIN asks for .STEP_TIN
    expect(m[28]!.step).toBe('.STEP_GRATING');
  });

  it('every material\'s footfall: STEPSOUND past half a stick, STEALTH_STEPSOUND under it, CRAWLSOUND prone (FUN_005a39b0)', () => {
    for (const m of materials()) {
      expect(footstepSound(m, 0, 1), m.name).toBe(m.step);
      expect(footstepSound(m, 1, -0.51), m.name).toBe(m.step);
      expect(footstepSound(m, 0, 0.5), m.name).toBe(m.stealthStep);      // not past half: the stealth step
      expect(footstepSound(m, 1, 0.2), m.name).toBe(m.stealthStep);
      expect(footstepSound(m, 2, 1), m.name).toBe(m.crawl);
    }
  });

  it('every material\'s landing by class: LANDSOUND soft and light, .BONE_BRK_1 alone heavy, both deadly (FUN_005ac1f0)', () => {
    const speeds = landSpeeds(235, [62, 91, 120]);
    // research 81 §6: sqrt(2 g d) at g 235 over 62, 91, 120 units: 170.7, 206.8, 237.5 units a second.
    expect(speeds.map((s) => Math.round(s * 10) / 10)).toEqual([170.7, 206.8, 237.5]);
    expect([landingClass(speeds[0], speeds), landingClass(speeds[1], speeds), landingClass(speeds[2] - 1e-9, speeds), landingClass(speeds[2], speeds)])
      .toEqual([0, 1, 2, 3]);
    for (const m of materials()) {
      const land = m.land ? [m.land] : [];
      expect(landingSounds(m, 0), m.name).toEqual(land);
      expect(landingSounds(m, 1), m.name).toEqual(land);
      expect(landingSounds(m, 2), m.name).toEqual([HARD_LANDING_SOUND]);
      expect(landingSounds(m, 3), m.name).toEqual([...land, HARD_LANDING_SOUND]);
    }
  });
});

describe('the Frostfire banks and their sounds.rdr entries, pinned (golden/walk-sounds.json; research 81 §2-§3)', () => {
  const rows = (bank: string): BankRow[] => pin<WalkSoundsPin>('walk-sounds.json').banks[bank]!;
  const row = (bank: string, name: string): BankRow => rows(bank).find((r) => r.name === name)!;

  it('MP2_AM holds 90 sounds and MP2_FX 187, every one named, each at its index', () => {
    expect(rows('MP2_AM').length).toBe(90);
    expect(rows('MP2_FX').length).toBe(187);
    for (const b of ['MP2_AM', 'MP2_FX']) rows(b).forEach((r, i) => expect(r.index).toBe(i));
    expect(row('MP2_AM', '.JUMP_WHOOSH').index).toBe(0);
    expect(row('MP2_FX', '.M4A1_SIL').index).toBe(101);
    expect(row('MP2_FX', '.M4A1_SIL_RLD').index).toBe(102);
    expect(row('MP2_AM', '.STEP_STONE')).toMatchObject({ vol: 107, volGroup: 3 });
    expect(row('MP2_FX', '.M4A1_SIL').vol).toBe(80);
    expect(row('MP2_AM', '.JUMP_WHOOSH').vol).toBe(28);
  });

  it("bank sound n has its block's sounds.rdr entry n (R122.2): 255 spelt as the bank has it, 8 without a trailing blank, 14 by no bank name", () => {
    const odd = (b: string, spelt: 'trimmed' | null): string[] => rows(b).filter((r) => r.entry.spelt === spelt).map((r) => r.name);
    expect(rows('MP2_AM').filter((r) => r.entry.spelt === 'exact').length + rows('MP2_FX').filter((r) => r.entry.spelt === 'exact').length).toBe(255);
    expect(odd('MP2_AM', 'trimmed')).toEqual(['.THROW_OBJECT ', '~LOW_RUMBLE ', '~PIPE_FLOW_1 ', '~PIPE_FLOW_2 ', '~MACHINE_1 ', '~MACHINE_2 ', '~PIPE_CONTROL ', '~FAN_ROTATE ']);
    expect(odd('MP2_FX', 'trimmed')).toEqual([]);
    expect(odd('MP2_AM', null)).toEqual(['~OCEAN_SWELL_1 ', '~OUTDR_WND_GST1']);
    expect(odd('MP2_FX', null)).toEqual(['~AK47_1', '~AK47_2', '~AK47_3', '~AK47_4', '~DIST_XP', '~DIST_XP2', '~AKS74_1', '~UZI', '~EXP_DISTANT', '~SIG_552', '~HANDGUN_1', '~HANDGUN_2']);
    for (const b of ['MP2_AM', 'MP2_FX']) for (const r of rows(b)) {
      const { hash, spelt, ...params } = r.entry;
      // The spelling the entry's hash answers to, by the CRC-32 (FUN_003a2370).
      if (spelt) expect(soundHash(spelt === 'exact' ? r.name : r.name.trim()), r.name).toBe(hash);
      else expect([soundHash(r.name), soundHash(r.name.trim())], r.name).not.toContain(hash);
      // The bank name's own hash finds an entry exactly when it is the entry at its ordinal (no name is filed twice).
      expect(r.script, r.name).toEqual(spelt === 'exact' ? params : null);
    }
    expect(row('MP2_AM', '.THROW_OBJECT ').entry.range).toEqual([40, 160]);
    expect(row('MP2_AM', '~LOW_RUMBLE ').entry).toMatchObject({ ambient: true, range: [80, 100] });
  });

  it('every name is filed under the CRC-32 of its bytes, signed (FUN_003a2370): .STEP_STONE 1440126871, .M4A1_SIL -1181866505', () => {
    for (const b of ['MP2_AM', 'MP2_FX']) for (const r of rows(b)) expect(soundHash(r.name), r.name).toBe(r.hash);
    expect(row('MP2_AM', '.STEP_STONE').hash).toBe(1440126871);
    expect(row('MP2_FX', '.M4A1_SIL').hash).toBe(-1181866505);
  });

  it('the walk\'s RANGEs (research 81 §3): steps 30-200, stealth 30-130, landing 50-200, whoosh 30-130, the SD 20-200, the M4A1 85-1700', () => {
    const range = (b: string, n: string): [number, number] | null => row(b, n).script?.range ?? null;
    expect(range('MP2_AM', '.STEP_STONE')).toEqual([30, 200]);
    expect(range('MP2_AM', '.STEALTH_STONE')).toEqual([30, 130]);
    expect(range('MP2_AM', '.STONE_JUMP')).toEqual([50, 200]);
    expect(range('MP2_AM', '.JUMP_WHOOSH')).toEqual([30, 130]);
    expect(range('MP2_FX', '.M4A1_SIL')).toEqual([20, 200]);
    expect(range('MP2_FX', '.M4A1_SIL_RLD')).toEqual([20, 200]);
    for (const n of ['.M4A1', '.M4A1_M', '.M4A1_F']) expect(range('MP2_FX', n)).toEqual([85, 1700]);
    // The MED / FAR marks are data only (FUN_003435c0 reads neither); they sit on the variants all the same.
    expect([row('MP2_FX', '.M4A1_M').script?.med, row('MP2_FX', '.M4A1_F').script?.far]).toEqual([true, true]);
    expect(row('MP2_AM', '.STEP_STONE').script?.oneShot).toBe(true);
    // Every RANGE the script gives runs from a smaller to a larger distance.
    for (const b of ['MP2_AM', 'MP2_FX']) for (const r of rows(b)) if (r.script?.range) expect(r.script.range[0], r.name).toBeLessThan(r.script.range[1]);
  });

  it('a pinned RANGE falls off as FUN_00342670 does: full inside min, linear to 0 at max, silent beyond', () => {
    const step = row('MP2_AM', '.STEP_STONE').script!.range!;
    expect([rangeGain(30, step), rangeGain(115, step), rangeGain(200, step), rangeGain(200.01, step)]).toEqual([1, 0.5, 0, 0]);
    const m4 = row('MP2_FX', '.M4A1').script!.range!;
    expect(rangeGain(892.5, m4)).toBeCloseTo(0.5, 12);
    expect(rangeGain(85, m4)).toBe(1);
  });
});

describe('the weapons\' sounds, pinned (golden/weapons.json; research 81 §5)', () => {
  const weapons = (): WeaponsPin => pin<WeaponsPin>('weapons.json');
  const w = (name: string): WeaponSounds => weapons().weapons.find((x) => x.name === name)!;

  it('WEAPON_GLOBAL: close 0, medium 9 and far 50 metres; the M4A1 SD has no medium or far report; the 870 alone an after-shot sound', () => {
    expect(weapons().global).toEqual({ soundDistanceClose: 0, soundDistanceMed: 9, soundDistanceFar: 50 });
    expect(w('M4A1 SD')).toEqual({ name: 'M4A1 SD', fireClose: '.M4A1_SIL', fireMed: null, fireFar: null, reload: '.M4A1_SIL_RLD', afterShot: null });
    expect(w('M4A1')).toMatchObject({ fireClose: '.M4A1', fireMed: '.M4A1_M', fireFar: '.M4A1_F', reload: '.M4A1_RLD' });
    expect(weapons().weapons.filter((x) => x.afterShot).map((x) => [x.name, x.afterShot])).toEqual([['870', '.SHOTGUN_COCK']]);
  });

  it('every weapon\'s remote round by distance: its close sound to 90 units, medium to 500, far beyond; an empty slot is silent (FUN_003d2c50)', () => {
    const g = weapons().global;
    const med = (g.soundDistanceMed * UNITS_PER_METRE) ** 2, far = (g.soundDistanceFar * UNITS_PER_METRE) ** 2;
    const heard = (x: WeaponSounds, d: number): string | null => [x.fireClose, x.fireMed, x.fireFar][fireVariant(d * d, med, far)]!;
    for (const x of weapons().weapons) {
      expect(heard(x, 0), x.name).toBe(x.fireClose);
      expect(heard(x, 90), x.name).toBe(x.fireClose);
      expect(heard(x, 90.5), x.name).toBe(x.fireMed);
      expect(heard(x, 500), x.name).toBe(x.fireMed);
      expect(heard(x, 500.5), x.name).toBe(x.fireFar);
    }
    expect(heard(w('M4A1 SD'), 100)).toBeNull();
  });
});

describe('the ambience\'s global register 2 (research 81 §10, FUN_00341a60)', () => {
  it('maps the camera\'s height through the mission\'s elevation (max, min) to f x 255 - 128: -128 below, 127 above, linear between', () => {
    // FUN_00341a60 (decomp 241580-241600): snd_SetSFXGlobalReg(2, f x 255 - 128), f by FUN_002aca30 (0 below, 1 above).
    expect(globalRegister2(100, [142, 100])).toBe(-128);
    expect(globalRegister2(50, [142, 100])).toBe(-128);
    expect(globalRegister2(142, [142, 100])).toBe(127);
    expect(globalRegister2(200, [142, 100])).toBe(127);
    expect(globalRegister2(131.5, [142, 100])).toBe(63);                         // f 0.75: floor(191.25) - 128
  });
  it('floors f x 255 before taking 128 off, as the game does (research 186 §3.2, V4 #26): f 0.3 is -52, not -51', () => {
    // 0x341e48-0x341e74: mul.s f x 255.0 -> fptodp -> floor (fdlibm, 0x1b2de8) -> dpadd -128.0 -> dptoli -> clamp.
    expect(globalRegister2(30, [100, 0])).toBe(-52);
    expect(globalRegister2(75, [100, 0])).toBe(63);
    expect(globalRegister2(1, [100, 0])).toBe(-126);                              // floor(2.55) - 128
  });
});

const readerc = fixture('RUN/READERC.ZAR');
const store = fixture('RUN/SOUNDS/BNKSTORE.ZAR');
const soundrdr = fixture('RUN/SOUNDRDR.ZAR');
const zweapon = fixture('RUN/ZWEAPON.ZAR');

describe.skipIf(!readerc)('the materials re-derived from READERC.ZAR (fixture)', () => {
  it('materialsFromArchive gives the pinned table (materials.json)', () => {
    matchPin('materials.json', 'disc RUN/READERC.ZAR materials.rdr SOILS through materialsFromArchive (parseSoils); 2026-10-02', { materials: materialsFromArchive(readerc!) });
  });
});

describe.skipIf(!store || !soundrdr)('the Frostfire banks and sounds.rdr re-derived (fixture)', () => {
  it('parseBankFile and soundScriptFromArchive give the pinned rows (walk-sounds.json)', () => {
    const zar = Zar.parse(store!), script = soundScriptFromArchive(soundrdr!);
    const banks: Record<string, BankRow[]> = {};
    const fields = (p: ScriptRow): ScriptRow => ({ oneShot: p.oneShot, ambient: p.ambient, doppler: p.doppler, range: p.range, volume: p.volume, med: p.med, far: p.far });
    for (const file of ['MP2_am.bnk', 'MP2_fx.bnk']) {
      const bank = parseBankFile(zar.data(zar.find(file)!));
      const byIndex = [...bank.names].sort((a, b) => a[1] - b[1]);
      // The block's entries in file order (the reader's Map keeps it): the ordinal R122.2 binds to the bank's index.
      const ordered = [...script.get(bank.name)!.values()];
      expect(ordered.length, bank.name).toBe(byIndex.length);
      banks[bank.name] = byIndex.map(([name, index]) => {
        const s = bank.sounds[index]!, p = soundParams(script, [bank.name], name), e = ordered[index]!;
        const spelt = e.hash === soundHash(name) ? 'exact' : e.hash === soundHash(name.trim()) ? 'trimmed' : null;
        return {
          index, name, vol: s.vol, volGroup: s.volGroup, pan: s.pan, grains: s.grains.length, hash: soundHash(name),
          script: p ? fields(p) : null, entry: { hash: e.hash, spelt, ...fields(e) },
        };
      });
    }
    matchPin('walk-sounds.json', 'disc RUN/SOUNDS/BNKSTORE.ZAR MP2_am.bnk, MP2_fx.bnk through parseBankFile; RUN/SOUNDRDR.ZAR sounds.rdr SETS/MP2_AM, SETS/MP2_FX through soundScriptFromArchive (entry: the entry of the block at the bank index, R122.2) and soundParams (script: by the hash of the bank name); 2026-10-02', { banks });
  });
});

describe.skipIf(!zweapon)('the weapons re-derived from ZWEAPON.ZAR (fixture)', () => {
  it('weaponSounds of every ZWEAPON record and weaponGlobals give the pinned table (weapons.json)', () => {
    const script = weaponScriptFromArchive(zweapon!);
    const list = rdrGet(script, 'ZWEAPON');
    const names = Array.isArray(list) ? list.flatMap((r) => { const n = Array.isArray(r) ? rdrGet(r, 'InternalName') : undefined; return typeof n === 'string' ? [n] : []; }) : [];
    matchPin('weapons.json', 'disc RUN/ZWEAPON.ZAR zweapon.rdr ZWEAPON records (InternalName order) through weaponSounds; WEAPON_GLOBAL through weaponGlobals; 2026-10-02', {
      global: weaponGlobals(script), weapons: names.map((n) => weaponSounds(script, n)!),
    });
  });
});
