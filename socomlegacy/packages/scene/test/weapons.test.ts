import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Zar, parseRdr, rdrGet, type RdrNode } from '@s2u/archive';
import {
  BULLET_MARK, DEFAULT_RIFLE, HELD_RIFLE, HELD_SIDEARM, UNITS_PER_METRE, kitWeapons, decalEntry, defaultPrimary, kitPrimaries, readBulletMark,
  M60E3_FIRE_WAIT_READING, R0004_M60E3_STAND, readDefaultRifle, readWeapon, weaponRecord,
  type DecalEntry, type WeaponRecord,
} from '../src/weapons';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';

/**
 * The weapon table (web sprint 2, W2.5): `RUN/ZWEAPON.ZAR/zweapon.rdr`'s records, the SEAL's default primary out of
 * `READERC.ZAR/character.rdr`, and the bullet mark out of `READERC.ZAR/decals.rdr`. The synthetic scripts below are
 * `parseRdr`'s shape (a key string, then the list of its values), spelled the way the game's files spell them.
 */

/** A `key (value)` pair list the way `parseRdr` hands a record back. */
const rec = (...pairs: [string, RdrNode][]): RdrNode[] => pairs.flatMap(([k, v]) => [k, Array.isArray(v) ? v : [v]]);

const stance = rec(['ReticuleKnock', '12'], ['ReticuleKnockReturn', '70'], ['ReticuleKnockMax', '45'], ['TargetMin', '1']);
/** WEAPON: the standing record with its rifle kick, as the game's file spells the four keys. */
const standing = [...stance, ...rec(
  ['FireRifleKickRate', '0.5'], ['FireRifleKickReturnRate', '0.18'], ['FireRifleKickBaseDist', '0.09'], ['FireRifleKickRandomDist', '0.015'],
)];
const m4 = rec(
  ['InternalName', 'M4A1'], ['DisplayName', 'M4A1'],
  ['Reticule_Modifiers', rec(['STANCE_STAND', standing], ['STANCE_CROUCH', stance])],
  ['FireWait', '0.12'], ['Maximum_Range', '1000'], ['ID', '54'], ['NumMags', '3'],
  ['AMMO_TYPES', [rec(['NAME', '5.56 x 45mm'])]], ['Ammo_Capacity', '30'], ['DecalSet', 'BULLET_MARK_SMALL'],
  ['FireAnimName', 'muzzle_m4'], ['FireSoundClose', '.M4A1'],
);
const m16 = rec(['InternalName', 'M16A2'], ['FireWait', '0.1'], ['ID', '51']);
const zweapon: RdrNode = [
  'WEAPON_GLOBAL', rec(['SoundDistanceClose', '0']),
  'ZAMMO', [rec(['InternalName', '9x19P'], ['ID', '1']), rec(['InternalName', '5.56 x 45mm'], ['ID', '8'])],
  'ZWEAPON', [m16, m4],
];

describe('the weapon record reader over a hand-built zweapon.rdr', () => {
  it('reads the M4A1: FireWait as the interval and the rate, the magazine, the mags, the ammo by name to its ID', () => {
    expect(weaponRecord(zweapon, 'M4A1')).toMatchObject<Partial<WeaponRecord>>({
      name: 'M4A1', id: 54, fireWait: 0.12, roundsPerMinute: 500, magazine: 30, mags: 3,
      ammo: '5.56 x 45mm', ammoId: 8, piercing: 0, maximumRange: 1000, effectiveRange: 0, decalSet: 'BULLET_MARK_SMALL',
      knock: { knock: 12, knockReturn: 70, knockMax: 45 },
      // STANCE_CROUCH has no kick keys and STANCE_PRONE no node: the parser copies the stance before (0x3cda30).
      rifleKick: {
        stand: { rate: 0.5, returnRate: 0.18, baseDist: 0.09, randomDist: 0.015 },
        crouch: { rate: 0.5, returnRate: 0.18, baseDist: 0.09, randomDist: 0.015 },
        prone: { rate: 0.5, returnRate: 0.18, baseDist: 0.09, randomDist: 0.015 },
      },
      fireAnim: 'muzzle_m4',
      sounds: { close: '.M4A1', med: null, far: null, reload: null },
    });
  });

  it('reads the stances as the parser does: each starts as a copy of the one before, the constructor defaults under all', () => {
    const r = weaponRecord(zweapon, 'M4A1');
    // STANCE_STAND sets eight keys; the rest are FUN_003c59c0's: 0, Mult 1, KnockCount 3, KnockEntryStrength 1.
    expect(r.stances.stand).toMatchObject({ knock: 12, knockReturn: 70, knockMax: 45, targetMin: 1, targetMax: 0,
      dilateMoveMult: 1, knockCount: 3, knockEntry: 1, kickRate: 0.5, kickBase: 0.09, constrict: 0 });
    // STANCE_CROUCH sets the first four again over a copy of the stand; STANCE_PRONE is absent, so it is the crouch.
    expect(r.stances.crouch).toEqual(r.stances.stand);
    expect(r.stances.prone).toEqual(r.stances.crouch);
    const prone = rec(['ReticuleKnock', '8'], ['TargetDilateUponMovementMult', '63']);
    const script: RdrNode = ['ZAMMO', [rec(['InternalName', 'r'], ['ID', '1']), rec(['InternalName', 's'], ['ID', '2'])], 'ZWEAPON', [rec(
      ['InternalName', 'G'], ['FireWait', '0.1'], ['ID', '1'], ['NumMags', '1'], ['Ammo_Capacity', '1'], ['Maximum_Range', '1'],
      ['DecalSet', 'X'], ['AMMO_TYPES', [rec(['NAME', 'r'])]],
      ['Reticule_Modifiers', rec(['STANCE_STAND', stance], ['STANCE_PRONE', prone])]), m16]];
    const g = weaponRecord(script, 'G');
    expect(g.stances.prone).toMatchObject({ knock: 8, dilateMoveMult: 63, knockReturn: 70, targetMin: 1 });
  });

  it('reads the zoom table, the burst accuracy, and the fire modes MaxFireMode and the mode keys enable', () => {
    const r = weaponRecord(zweapon, 'M4A1');
    expect(r.zoomModes).toEqual([]);
    expect(r.maxFireMode).toBe(0);
    expect(r.fireModes).toEqual([]);
    const script: RdrNode = ['ZAMMO', [rec(['InternalName', 'r'], ['ID', '1']), rec(['InternalName', 's'], ['ID', '2'])], 'ZWEAPON', [rec(
      ['InternalName', 'G'], ['FireWait', '0.1'], ['ID', '1'], ['NumMags', '1'], ['Ammo_Capacity', '1'], ['Maximum_Range', '1'],
      ['DecalSet', 'X'], ['AMMO_TYPES', [rec(['NAME', 'r'])]], ['Reticule_Modifiers', rec(['STANCE_STAND', stance])],
      ['NumZoomModes', '3'], ['ZoomMode0', '1.5'], ['ZoomMode2', '12'], ['AccBurstCnt_Min', '4'], ['AccScalar_Max', '0.03'],
      ['SingleMode', []], ['AutoMode', []]), m16]];
    const g = weaponRecord(script, 'G');
    expect(g.zoomModes).toEqual([1.5, -1, 12]);      // a missing ZoomMode%d is the parser's -1
    expect(g.accuracyBurst).toEqual({ countMin: 4, countMax: 0, scalarMin: 0, scalarMax: 0.03 });
    expect(g.maxFireMode).toBe(3);                    // no MaxFireMode: 0, raised to 3 by AutoMode
    expect(g.fireModes).toEqual([1, 3]);              // the M14's pattern: single and automatic, no burst
  });

  it('refuses a weapon the table does not hold, and a record without a key, naming them', () => {
    expect(() => weaponRecord(zweapon, 'AK-47')).toThrow('AK-47');
    expect(() => weaponRecord(zweapon, 'M16A2')).toThrow(/M16A2 has no \w+/);
  });

  it('reads the default primary: the first wep_name of the first record of that name under characters', () => {
    const character: RdrNode = ['characters', [
      // The inheritance line comes first in the game's file: `mp_seal1 : mp_seal (sounds ...)`.
      'mp_seal1', ':', 'mp_seal', rec(['sounds', rec(['CHRSND_DEATH', 'x'])]),
      'basic_seal', rec(['default_weapons', [rec(['wep_name', 'M4A1-M203'])]]),
      'mp_seal1', rec(['texture_asset', 'artcseal'], ['default_weapons', [rec(['wep_name', 'M4A1']), rec(['wep_name', 'Mark 23'])]]),
      'mp_seal1', rec(['default_weapons', [rec(['wep_name', 'HK5'])]]),
    ]];
    expect(defaultPrimary(character)).toBe('M4A1');
    expect(kitPrimaries(character)).toEqual(['M4A1', 'HK5']);
    expect(() => defaultPrimary(character, 'mp_seal9')).toThrow('mp_seal9');
  });

  it('reads a decal set\'s entry for one material out of decals.rdr', () => {
    const decals: RdrNode = ['TEMP_DECAL_POOL_SIZE', ['198'], 'DECAL_SETS', [
      [rec(['SETNAME', 'GRENADE_BLAST']), rec(['MATERIALNAME', 'STONE'], ['TEXTURENAME', 'grenade_mark.tif'])],
      [rec(['SETNAME', 'BULLET_MARK_SMALL']),
        rec(['MATERIALNAME', 'SAND'], ['TEXTURENAME', 'bullet_mark_sand.tif'], ['MIN_SIZE', '1'], ['MAX_SIZE', '1.5']),
        rec(['MATERIALNAME', 'STONE'], ['TEXTURENAME', 'bullet_mark_stone.tif'], ['MIN_SIZE', '1'], ['MAX_SIZE', '1.8'])],
    ]];
    expect(decalEntry(decals, 'BULLET_MARK_SMALL', 'STONE')).toEqual<DecalEntry>(
      { set: 'BULLET_MARK_SMALL', material: 'STONE', texture: 'bullet_mark_stone.tif', minSize: 1, maxSize: 1.8 });
    expect(() => decalEntry(decals, 'BULLET_MARK_SMALL', 'GLASS')).toThrow('GLASS');
    expect(() => decalEntry(decals, 'BULLET_MARK_LARGE', 'STONE')).toThrow('BULLET_MARK_LARGE');
  });
});

// The game's own files: the served copies first (`tools/extract-maps.ts` puts them beside the maps, W2.R5), then the
// disc tree (`SOCOM_DISC`, the repository's `game/disc`, this host's main tree).
const web = resolve(import.meta.dirname, '../../..');
const onDisc = (name: string): string | undefined => [
  resolve(web, `public/maps/RUN/${name}`),
  ...(process.env.SOCOM_DISC ? [resolve(process.env.SOCOM_DISC, `RUN/${name}`)] : []),
  resolve(web, `../game/disc/RUN/${name}`),
  `C:/projects/socom_pc/game/disc/RUN/${name}`,
].find((p) => existsSync(p));
const ZWEAPON = onDisc('ZWEAPON.ZAR'), READERC = onDisc('READERC.ZAR');
const bytes = (p: string): Uint8Array => new Uint8Array(readFileSync(p));

describe.skipIf(!ZWEAPON || !READERC)('the default rifle off the game\'s ZWEAPON.ZAR and READERC.ZAR', () => {
  it('ZWEAPON.ZAR holds one script, zweapon.rdr', () => {
    expect(Zar.parse(bytes(ZWEAPON!)).root.children.map((k) => k.name)).toEqual(['zweapon.rdr']);
  });

  it('the multiplayer SEAL\'s first kit (character.rdr mp_seal1) is the M4A1: 0.12 s a round, 30 a magazine, 3 magazines', () => {
    const rifle = readDefaultRifle(bytes(ZWEAPON!), bytes(READERC!));
    expect(rifle.name).toBe('M4A1');
    expect(rifle.fireWait).toBe(0.12);
    expect(rifle.roundsPerMinute).toBe(500);
    expect(rifle.magazine).toBe(30);
    expect(rifle.mags).toBe(3);
    expect(rifle.ammo).toBe('5.56 x 45mm');
    expect(rifle.ammoId).toBe(8);
    expect(rifle.id).toBe(54);
    // Every theatre's mp_seal1 (arctic, scuba, jungle, desert ...) hands the same rifle first.
    const zar = Zar.parse(bytes(READERC!));
    const character = parseRdr(zar.data(zar.root.children.find((k) => k.name === 'character.rdr')!));
    const kits = kitPrimaries(character);
    expect(kits.length).toBeGreaterThanOrEqual(4);
    expect(new Set(kits)).toEqual(new Set(['M4A1']));
  });

  it('is the transcription: DEFAULT_RIFLE, HELD_RIFLE and BULLET_MARK are the files\', proven each run that has them', () => {
    expect(readDefaultRifle(bytes(ZWEAPON!), bytes(READERC!))).toEqual(DEFAULT_RIFLE);
    expect(readWeapon(bytes(ZWEAPON!), 'M4A1 SD')).toEqual(HELD_RIFLE);
    expect(readBulletMark(bytes(READERC!), DEFAULT_RIFLE.decalSet)).toEqual(BULLET_MARK);
  });

  it('is the transcription: HELD_SIDEARM is the file Mark 23, the second weapon of the mp_seal1 kit', () => {
    expect(readWeapon(bytes(ZWEAPON!), 'Mark 23')).toEqual(HELD_SIDEARM);
    const zar = Zar.parse(bytes(READERC!));
    const character = parseRdr(zar.data(zar.root.children.find((k) => k.name === 'character.rdr')!));
    expect(kitWeapons(character)).toEqual(['M4A1', 'Mark 23', 'M67', 'HE', 'Double Ammo Load']);
    expect(kitWeapons(character, 'mp2_seal1')[1]).toBe(HELD_SIDEARM.name);
  });

  it('is the transcription: HELD_RIFLE is the file M4A1 SD, the rifle the SEAL holds', () => {
    const zar = Zar.parse(bytes(ZWEAPON!));
    const script = parseRdr(zar.data(zar.root.children.find((k) => k.name.toLowerCase() === 'zweapon.rdr')!));
    expect(weaponRecord(script, 'M4A1 SD')).toEqual(HELD_RIFLE);
  });

  it('the M16A2 beside it reads its own numbers (the reader is not the transcription)', () => {
    const script = parseRdr(Zar.parse(bytes(ZWEAPON!)).data(Zar.parse(bytes(ZWEAPON!)).root.children[0]!));
    expect(weaponRecord(script, 'M16A2')).toMatchObject({ fireWait: 0.1, magazine: 30, mags: 4, ammoId: 8, id: 51 });
  });

  it('the M4A1 SD zooms to 3; every weapon has ZoomMode0 1.5; the ranges are metres, 10 units each', () => {
    const sd = readWeapon(bytes(ZWEAPON!), 'M4A1 SD');
    expect(sd.zoomModes).toEqual([1.5, 3]);
    expect(sd.stances.crouch.targetMin).toBe(0.75);
    expect(sd.maximumRange * UNITS_PER_METRE).toBe(8000);   // DAT_003dfe10: 10 units a metre
    const zar = Zar.parse(bytes(ZWEAPON!));
    const script = parseRdr(zar.data(zar.root.children[0]!)) as RdrNode[];
    const list = script[script.indexOf('ZWEAPON') + 1] as RdrNode[][];
    for (const r of list) {
      const name = (r[r.indexOf('InternalName') + 1] as string[])[0]!;
      expect(rdrGet(r, 'ZoomMode0'), name).toBe('1.5');
    }
  });

  it('the kit sidearm, the Mark 23 (ID 15, the sidearm reticle): one fire mode, one zoom mode, no kick, prone inherits', () => {
    const m23 = readWeapon(bytes(ZWEAPON!), 'Mark 23');
    expect(m23).toMatchObject({ id: 15, fireWait: 0.2, magazine: 12, ammo: '45 ACP', piercing: 4, maximumRange: 125,
      zoomModes: [1.5], maxFireMode: 1, fireModes: [1], rifleKick: { stand: null, crouch: null, prone: null } });
    expect(m23.stances.stand).toMatchObject({ knock: 20, knockReturn: 60, knockMax: 40, dilateFire: 20, dilateMove: 0.75,
      constrict: 75, targetMin: 10, targetMax: 30, knockCount: 1, knockEntry: 1 });
    expect(m23.stances.prone).toMatchObject({ knock: 20, targetMin: 14, targetMax: 34, dilateMoveMult: 60 });
  });
});

// ---- web sprint 4, M4: each firearm class's own keys (research 94 §C1.1, §C1.2, §C2.1, §C4) ---------------------------

/** A firearm record with the class keys a test adds (the parser's names: `FUN_003cda30` L322538-322556). */
const classRecord = (name: string, id: number, extra: [string, RdrNode][] = [], ammo = '5.56 x 45mm'): RdrNode[] => rec(
  ['InternalName', name], ['FireWait', '0.5'], ['ID', String(id)], ['NumMags', '3'], ['Ammo_Capacity', '8'], ['Maximum_Range', '84'],
  ['DecalSet', 'BULLET_MARK_SMALL'], ['AMMO_TYPES', ammo ? [rec(['NAME', ammo])] : []], ['Reticule_Modifiers', rec(['STANCE_STAND', stance])],
  ...extra,
);
const classes: RdrNode = [
  'ZAMMO', [rec(['InternalName', '5.56 x 45mm'], ['ID', '8']), rec(['InternalName', '12 Gauge'], ['ID', '27'], ['NumProjectilesFired', '4'])],
  'ZWEAPON', [
    classRecord('M40A1', 102, [['ReloadAfterShot', []], ['ReloadDelayAfterShot', '0.5']]),
    // The 870's own spelling: `ReloadAfterShotDelay`, a key the parser has no string for (R94.12).
    classRecord('870', 84, [['ReloadAfterShot', []], ['ReloadAfterShotDelay', '0.8'], ['ReloadDelay', '1'], ['ReloadAfterShotSound', '.SHOTGUN_COCK']], '12 Gauge'),
    classRecord('Spas 12', 81, [['ReloadTime', '2'], ['ReloadDelay', '0.5']], '12 Gauge'),
    classRecord('M60E3', 91, [['ReloadTime', '3'], ['AutoMode', []]]),
    classRecord('MGL', 142, [['MaxFireMode', '0']], ''),
    m4,
  ],
];

describe('the class keys a firearm record carries (web sprint 4 M4; research 94 §C1, §C2.1)', () => {
  it.each([
    // name, ReloadTime, ReloadDelay, ReloadAfterShot, ReloadDelayAfterShot, the after-shot sound, pellets
    ['M40A1', undefined, undefined, true, 0.5, undefined, undefined],
    ['870', undefined, 1, true, undefined, '.SHOTGUN_COCK', 4],
    ['Spas 12', 2, 0.5, undefined, undefined, undefined, 4],
    ['M60E3', 3, undefined, undefined, undefined, undefined, undefined],
    ['M4A1', undefined, undefined, undefined, undefined, undefined, undefined],
  ] as const)('%s: ReloadTime %s, ReloadDelay %s, the bolt/pump %s after %s, sound %s, pellets %s -- only the keys it has',
    (name, reloadTime, reloadDelay, reloadAfterShot, reloadDelayAfterShot, afterShotSound, pellets) => {
      const r = weaponRecord(classes, name);
      expect([r.reloadTime, r.reloadDelay, r.reloadAfterShot, r.reloadDelayAfterShot, r.afterShotSound, r.pellets])
        .toEqual([reloadTime, reloadDelay, reloadAfterShot, reloadDelayAfterShot, afterShotSound, pellets]);
      // An absent key is absent, not a default: the baked records (DEFAULT_RIFLE ...) stay the file's, deep-equal.
      for (const k of ['reloadTime', 'reloadDelay', 'reloadAfterShot', 'reloadDelayAfterShot', 'afterShotSound', 'pellets'] as const) {
        if (r[k] === undefined) expect(Object.hasOwn(r, k), `${name} ${k}`).toBe(false);
      }
    });

  it('a grenade launcher (no AMMO_TYPES round) is read only when asked for as a carrier: no round, no firearm mode', () => {
    expect(() => weaponRecord(classes, 'MGL')).toThrow('AMMO_TYPES');
    const mgl = weaponRecord(classes, 'MGL', { carrier: true });
    expect(mgl).toMatchObject({ name: 'MGL', id: 142, ammo: '', ammoId: -1, magazine: 8, mags: 3, maxFireMode: 0, fireModes: [] });
  });
});

describe.skipIf(!ZWEAPON)('the class keys off the disc (research 94 §C11)', () => {
  it.each([
    ['M40A1', { reloadAfterShot: true, reloadDelayAfterShot: 0.5 }],
    ['M87ELR', { reloadAfterShot: true, reloadDelayAfterShot: 0.5 }],
    ['870', { reloadAfterShot: true, reloadDelay: 1, afterShotSound: '.SHOTGUN_COCK', pellets: 4 }],
    ['Spas 12', { reloadTime: 2, reloadDelay: 0.5, pellets: 4 }],
    ['JACKHAMMER', { reloadTime: 2, reloadDelay: 0.5, pellets: 4 }],
    ['M60E3', { reloadTime: 3 }],
    ['M63A', { reloadTime: 2.5 }],
  ] as const)('%s reads %o', (name, keys) => {
    expect(readWeapon(bytes(ZWEAPON!), name)).toMatchObject(keys);
  });

  it('the 870 keeps the parser\'s after-shot default: its ReloadAfterShotDelay is no key the game reads (R94.12)', () => {
    expect(readWeapon(bytes(ZWEAPON!), '870').reloadDelayAfterShot).toBeUndefined();
  });

  it('the MGL and the M79 read as carriers: the record\'s magazine, no firearm mode', () => {
    const zar = Zar.parse(bytes(ZWEAPON!));
    const script = parseRdr(zar.data(zar.root.children[0]!));
    expect(weaponRecord(script, 'MGL', { carrier: true })).toMatchObject({ id: 142, magazine: 6, mags: 2, fireWait: 0.25, fireModes: [] });
    expect(weaponRecord(script, 'M79', { carrier: true })).toMatchObject({ id: 143, magazine: 8, mags: 1, fireWait: 1.5, fireModes: [] });
  });
});

// PAR-56 (research 215 s8; its review's N1): MGL FRAG TURRET's fire modes off the fixture's zweapon.rdr -- one mode, the
// single (`[1]`), so mounted the original's fire-mode button (`FUN_005c4600`, the slot in the hand) changes nothing and
// the page's early return in `switchFireMode` holds; PKM and LMG TURRET read the automatic alone (`[3]`).
const ZWEAPON_FIXTURE = fixture('RUN/ZWEAPON.ZAR');
describe.skipIf(ZWEAPON_FIXTURE === null)(`the turrets' fire modes off zweapon.rdr${ZWEAPON_FIXTURE === null ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  it('MGL FRAG TURRET has one mode (single); PKM and LMG TURRET the automatic alone', () => {
    const zar = Zar.parse(ZWEAPON_FIXTURE!);
    const entry = zar.root.children.find((k) => k.name.toLowerCase() === 'zweapon.rdr')!;
    const zweapon = parseRdr(zar.data(entry));
    expect(weaponRecord(zweapon, 'MGL FRAG TURRET').fireModes).toEqual([1]);
    expect(weaponRecord(zweapon, 'PKM TURRET').fireModes).toEqual([3]);
    expect(weaponRecord(zweapon, 'LMG TURRET').fireModes).toEqual([3]);
  });
});

describe('the shot\'s rumble: Rumble_Modifiers (CTL-2, OT.R72; the weapon parser D:L322181-322195)', () => {
  // The three keys and their setters: RumbleHighTime -> the small motor's time +0x258, its flag +0x254 = time > 0
  // (FUN_003c5f40); RumbleLowTime -> the large motor's time +0x260, its flag +0x25c = time > 0 (FUN_003c5f00);
  // RumbleLowPower -> its power +0x264, the same flag +0x25c = power > 0 (FUN_003c5ee0), read last. The constructor
  // (FUN_003c6320) zeroes all five, so a record without the block never rumbles on a shot (FUN_005c3360 D:L477739-477751).
  const withRumble = (block: [string, RdrNode][] | null): RdrNode => [
    'ZAMMO', [rec(['InternalName', '9x19P'], ['ID', '1']), rec(['InternalName', '5.56 x 45mm'], ['ID', '8'])],   // two, as the game's list
    'ZWEAPON', [rec(
      ['InternalName', 'M4A1 SD'], ['FireWait', '0.12'], ['Maximum_Range', '1000'], ['ID', '55'], ['NumMags', '3'],
      ['AMMO_TYPES', [rec(['NAME', '5.56 x 45mm'])]], ['Ammo_Capacity', '30'], ['DecalSet', 'BULLET_MARK_SMALL'],
      ['Reticule_Modifiers', rec(['STANCE_STAND', standing])],
      ...(block ? [['Rumble_Modifiers', rec(...block)] as [string, RdrNode]] : []),
    ), m16],
  ];

  it('reads the three keys: the small motor\'s time, the large one\'s time and power (the M4A1 SD\'s 0.04 / 0.2 / 125)', () => {
    const r = weaponRecord(withRumble([['RumbleHighTime', '0.04'], ['RumbleLowTime', '0.2'], ['RumbleLowPower', '125']]), 'M4A1 SD');
    expect(r.rumble).toEqual({ small: Math.fround(0.04), large: { time: Math.fround(0.2), power: 125 } });
  });

  it('the flags as the setters leave them: a zero time is no motor; the large motor\'s flag is the power\'s when both are read', () => {
    const r = (block: [string, RdrNode][]) => weaponRecord(withRumble(block), 'M4A1 SD').rumble;
    expect(r([['RumbleHighTime', '0'], ['RumbleLowTime', '0.2'], ['RumbleLowPower', '0']])).toEqual({ small: null, large: null });
    expect(r([['RumbleLowTime', '0'], ['RumbleLowPower', '125']])).toEqual({ small: null, large: { time: 0, power: 125 } });
    expect(r([['RumbleLowTime', '0.2']])).toEqual({ small: null, large: { time: Math.fround(0.2), power: 0 } });
  });

  it('a record without the block has no rumble key (the constructor\'s zeros: no shot rumble); the baked records stay deep-equal', () => {
    const r = weaponRecord(withRumble(null), 'M4A1 SD');
    expect(Object.hasOwn(r, 'rumble')).toBe(false);
  });
});

// ---- R4B-01 (OT.R97; r0004 investigation G11, `cluster-m60e3-moving-accuracy.md`; research 374) ------------------------
// r0004's ZWEAPON parser (r4 0x3efbd0, the twin of r0001's `FUN_003cda30`) compares `InternalName` with "M60E3" (0x3efc80)
// and, on a match, replaces three STANCE_STAND keys as each is read (0x3f0030-0x3f004c, 0x3f00d8-0x3f00f4,
// 0x3f0120-0x3f013c) and `FireWait` after it is read (0x3f054c-0x3f057c). `ZWEAPON.ZAR` is the same file in both
// revisions: r0001's disc values below are what the r0004 code replaces.

/** The M60E3's record as r0001's disc spells it (`zweapon.rdr`, ID 91; the stances 6/8/35, 6/6/30 (Mult 13), 6/4/25 (Mult 63)). */
const m60Stance = (dilate: string, min: string, max: string, mult?: string): RdrNode[] => rec(
  ['TargetDilateUponMovement', dilate], ['TargetMin', min], ['TargetMax', max], ...(mult ? [['TargetDilateUponMovementMult', mult] as [string, RdrNode]] : []),
);
/** STANCE_STAND's knock keys, which `weaponRecord` requires (the M60E3's 10 / 42 / 50). */
const m60Knock: [string, RdrNode][] = [['ReticuleKnock', '10'], ['ReticuleKnockReturn', '42'], ['ReticuleKnockMax', '50']];
const m60Stand = (...pairs: [string, RdrNode][]): RdrNode[] => rec(...m60Knock, ...pairs);
const m60Record = (name: string, modifiers: RdrNode[]): RdrNode[] => rec(
  ['InternalName', name], ['DisplayName', name], ['FireWait', '0.14'], ['ID', '91'], ['NumMags', '2'], ['Ammo_Capacity', '100'],
  ['Maximum_Range', '800'], ['DecalSet', 'BULLET_MARK_SMALL'], ['AMMO_TYPES', [rec(['NAME', '5.56 x 45mm'])]],
  ['Reticule_Modifiers', modifiers], ['AutoMode', []],
);
const m60Modifiers = rec(
  ['STANCE_STAND', [...m60Stand(), ...m60Stance('6', '8', '35')]], ['STANCE_CROUCH', m60Stance('6', '6', '30', '13')], ['STANCE_PRONE', m60Stance('6', '4', '25', '63')],
);
const m60Script = (...records: RdrNode[][]): RdrNode => [
  'ZAMMO', [rec(['InternalName', '5.56 x 45mm'], ['ID', '8']), rec(['InternalName', '9x19P'], ['ID', '1'])],
  'ZWEAPON', [...records, m16],                          // two or more, as the game's list (a one-record list reads as its record)
];
/** An f32's bits, as the r0004 code writes them (`lui`/`ori` then `sw`). */
const f32Bits = (v: number): number => { const b = new DataView(new ArrayBuffer(4)); b.setFloat32(0, v); return b.getUint32(0); };

describe('R4B-01: r0004\'s M60E3 step in the weapon parser (OT.R97; r4 0x3efbd0)', () => {
  it('the M60E3: standing TargetDilateUponMovement 6 -> 15, TargetMin 8 -> 10, TargetMax 35 -> 55; FireWait 0.14 -> 0.16', () => {
    const r = weaponRecord(m60Script(m60Record('M60E3', m60Modifiers)), 'M60E3');
    expect([r.stances.stand.dilateMove, r.stances.stand.targetMin, r.stances.stand.targetMax]).toEqual([15, 10, 55]);
    expect(r.fireWait).toBe(0.16);
    expect(r.roundsPerMinute).toBe(375);                 // derived, 60 / 0.16
    // Crouch and prone restate the three keys, so they keep the disc's values (r0004 tests the stance index: stand only).
    expect([r.stances.crouch.dilateMove, r.stances.crouch.targetMin, r.stances.crouch.targetMax, r.stances.crouch.dilateMoveMult]).toEqual([6, 6, 30, 13]);
    expect([r.stances.prone.dilateMove, r.stances.prone.targetMin, r.stances.prone.targetMax, r.stances.prone.dilateMoveMult]).toEqual([6, 4, 25, 63]);
  });

  it('the values are the r0004 code\'s words: lui 0x4170 (15), 0x4120 (10), 0x425c (55); FireWait 0x3e23d70a (0.16f)', () => {
    expect(R0004_M60E3_STAND).toEqual({ dilateMove: 15, targetMin: 10, targetMax: 55 });
    expect([R0004_M60E3_STAND.dilateMove, R0004_M60E3_STAND.targetMin, R0004_M60E3_STAND.targetMax].map(f32Bits))
      .toEqual([0x41700000, 0x41200000, 0x425c0000]);
    expect(f32Bits(M60E3_FIRE_WAIT_READING)).toBe(0x3e23d70a);
    expect(M60E3_FIRE_WAIT_READING).toBe(0.16);          // the shortest decimal of that f32, the reader's form (`f32Text`)
  });

  it('inside the stand pass, as r0004 does it: a stance that does not restate a key inherits the forced stand value', () => {
    const r = weaponRecord(m60Script(m60Record('M60E3', rec(['STANCE_STAND', [...m60Stand(), ...m60Stance('6', '8', '35')]], ['STANCE_CROUCH', rec(['TargetMin', '6'])]))), 'M60E3');
    expect([r.stances.crouch.dilateMove, r.stances.crouch.targetMin, r.stances.crouch.targetMax]).toEqual([15, 6, 55]);
    expect(r.stances.prone).toEqual(r.stances.crouch);
  });

  it('a stand key the record does not hold is not forced (r0004 replaces a value just read); FireWait always is', () => {
    const r = weaponRecord(m60Script(m60Record('M60E3', rec(['STANCE_STAND', m60Stand(['TargetMin', '8'])]))), 'M60E3');
    expect([r.stances.stand.dilateMove, r.stances.stand.targetMin, r.stances.stand.targetMax]).toEqual([0, 10, 0]);
    expect(r.fireWait).toBe(0.16);
  });

  it('every other weapon is untouched: the same record under any other InternalName reads the disc\'s values (strcmp, exact)', () => {
    for (const name of ['M60E3 ', 'm60e3', 'M60E', 'M63A', 'M4A1']) {
      const r = weaponRecord(m60Script(m60Record(name, m60Modifiers)), name);
      expect([name, r.stances.stand.dilateMove, r.stances.stand.targetMin, r.stances.stand.targetMax, r.fireWait, r.roundsPerMinute])
        .toEqual([name, 6, 8, 35, 0.14, 429]);
    }
  });
});

describe.skipIf(!ZWEAPON)('R4B-01 off the disc: r0001\'s M60E3 record, read as r0004 reads it (OT.R97)', () => {
  const script = (): RdrNode => { const zar = Zar.parse(bytes(ZWEAPON!)); return parseRdr(zar.data(zar.root.children[0]!)); };

  it('the disc\'s record is r0001\'s (6/8/35 standing, FireWait 0.14): the r0004 values are code, not data', () => {
    const z = script();
    const list = rdrGet(z, 'ZWEAPON') as RdrNode[][];
    const m60 = list.find((r) => Array.isArray(r) && rdrGet(r, 'InternalName') === 'M60E3')!;
    const stand = rdrGet(rdrGet(m60, 'Reticule_Modifiers') as RdrNode, 'STANCE_STAND') as RdrNode;
    expect([rdrGet(stand, 'TargetDilateUponMovement'), rdrGet(stand, 'TargetMin'), rdrGet(stand, 'TargetMax'), rdrGet(m60, 'FireWait')])
      .toEqual(['6', '8', '35', '0.14']);
  });

  it('the reader gives r0004\'s M60E3; every other ZWEAPON record keeps its FireWait and its three stand keys as the file has them', () => {
    const z = script();
    const m60 = weaponRecord(z, 'M60E3');
    expect([m60.stances.stand.dilateMove, m60.stances.stand.targetMin, m60.stances.stand.targetMax, m60.fireWait]).toEqual([15, 10, 55, 0.16]);
    expect([m60.stances.crouch.dilateMove, m60.stances.crouch.targetMin, m60.stances.crouch.targetMax]).toEqual([6, 6, 30]);
    expect([m60.stances.prone.dilateMove, m60.stances.prone.targetMin, m60.stances.prone.targetMax]).toEqual([6, 4, 25]);
    let others = 0;
    for (const r of rdrGet(z, 'ZWEAPON') as RdrNode[][]) {
      if (!Array.isArray(r)) continue;
      const name = rdrGet(r, 'InternalName');
      if (typeof name !== 'string' || name === 'M60E3') continue;
      let w: WeaponRecord;
      try { w = weaponRecord(z, name, { carrier: true }); } catch { continue; }   // a record the reader refuses (gear): none
      const stand = rdrGet(rdrGet(r, 'Reticule_Modifiers') as RdrNode, 'STANCE_STAND') as RdrNode;
      const file = (key: string): number => (rdrGet(stand, key) === undefined ? 0 : Number(rdrGet(stand, key)));
      expect([name, w.fireWait, w.stances.stand.dilateMove, w.stances.stand.targetMin, w.stances.stand.targetMax])
        .toEqual([name, Number(rdrGet(r, 'FireWait')), file('TargetDilateUponMovement'), file('TargetMin'), file('TargetMax')]);
      others++;
    }
    expect(others).toBeGreaterThan(30);
  });
});
