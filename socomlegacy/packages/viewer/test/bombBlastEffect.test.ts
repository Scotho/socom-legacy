import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Matrix4 } from 'three';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { parseBankFile } from '@s2u/sound';
import { decodeEffectProgram, GAME_FRAME_DT, M67, NODE_CALLER, parseAnimSets, readKitTable, type EffectProgram, type ThrowableRecord } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { effectsFromDisc, type EffectData } from '../src/effectData';
import { CAMERA_BLAST_EXEMPT_ITEMS, Effects, type Vec3 } from '../src/effects';
import { EXPLOSION_SHAKES } from '../src/look';
import { blastPointShake } from '../src/matchThrow';

/**
 * The planted bomb's detonation (Trello 8WvQksxK: "Nightstaler bomb plant explosion animation missing"; research 332
 * section 7 is the source of truth). OBF-18 and DBFX-1 (PR #622) fixed it twice; DBFX-1's path stands (the explosion
 * through the effects' script round, `./demolitionBlast.test.ts`), and this file keeps OBF-18's disc reads and its
 * camera shake, ported to that path.
 *
 * The original: `FUN_002c1c30` at state 5 runs `base_explosion1` with the bomb's node as a type-3 context (D:L163926);
 * its one `FIRE_WEAPON` fires an MPBOMB pool round (`FUN_0025ccb0` D:L107197-107322) that goes off one game frame after
 * its fuse (`FUN_003c99a0` D:L319900-319902 state 3, `FUN_003ca5a0` D:L320411-320420 state 4, `PostTick`
 * `FUN_003c9fb0` D:L320104-320106) in `HandleDetonateExplosion` `FUN_003c8330`: an item not on its list
 * (D:L319186-319191; the record's `+0x7c`, its item id) sets the camera's pending blast point (D:L319192-319195), which
 * the camera's shake by the distance reads (research 83, `FUN_00550ef0`; `./look` `explosionShake`). MPBOMB (0x9a) is
 * not on the list.
 */

/** MPBOMB's record as the disc holds it (`zweapon.rdr` item 154; the disc test below holds the read). */
const MPBOMB: ThrowableRecord = {
  ...M67, name: 'MPBOMB', id: 154, fuse: 0.1, removal: 9999999, muzzleVelocity: 0, gravity: 98, model: 'NONE',
  fireAnim: 'NOT FOUND', hitAnim: 'NOT FOUND', explosionAnim: 'satchel', materialAnim: 'satchel', impact: false,
  ammo: 'MPBOMB Ammo', ammoId: 19, explosionDamage: 50, explosionRadius: 300,
};

const BASE_EXPLOSION1: EffectProgram = {
  name: 'base_explosion1', root: 0, flags: 0, nodes: ['NA'],
  sequences: [{ name: 'NA', activation: 1, ops: [{ op: 'fireWeapon', weapon: 'MPBOMB', ammo: 'MPBOMB Ammo', node: NODE_CALLER, f1: 0.001, f2: 0.01 }] }],
};
const SATCHEL: EffectProgram = {
  name: 'satchel', root: 0, flags: 0, nodes: ['NA'],
  sequences: [{ name: 'NA', activation: 1, ops: [{ op: 'sound', sound: '.MK138_SAT_CHRG', node: 0, volume: 1, flags: 136, newPlay: true }] }],
};
const synthetic = (record: ThrowableRecord = MPBOMB): EffectData => ({
  archive: 'T', models: [], textures: [], absent: [], materials: ['UNKNOWN'], defaultMaterial: 0, marks: [], footprints: [],
  ambient: [], sceneNodes: [], hitAnims: [], missing: [], programs: [BASE_EXPLOSION1, SATCHEL], scriptWeapons: [record],
});
const at = (p: Vec3) => ({ node: new Matrix4().makeTranslation(...p), position: [...p] as Vec3, normal: [0, 1, 0] as Vec3 });

describe("the planted bomb's script round sets the camera's blast point (FUN_003c8330 D:L319186-319195)", () => {
  it('the point is handed over once, on the frame the satchel plays -- one game frame after the fuse -- and the page shakes by the distance', () => {
    const heard: string[] = [];
    const fx = new Effects(() => 0.5, (name) => heard.push(name));
    fx.setData(synthetic());
    const points: Vec3[] = [];
    fx.setBlastPoint((p) => points.push([...p]));
    expect(fx.play('base_explosion1', at([10, 20, 30]))).toBe(true);
    fx.update(0, null);
    fx.update(GAME_FRAME_DT, null);                          // the fuse (0.001) runs out: state 3, nothing shown yet
    expect(points).toEqual([]);
    expect(heard).toEqual([]);
    fx.update(GAME_FRAME_DT, null);                          // the next frame: state 4, the explosion and the point
    expect(points).toHaveLength(1);
    expect(fx.stats().played['satchel']).toBe(1);
    expect(heard).toContain('.MK138_SAT_CHRG');
    expect(points[0]!.map((v) => Math.round(v))).toEqual([10, 20, 30]);
    // The camera's shake by the distance from the SEAL (the grenades' rule, `./look` `explosionShake`).
    expect(blastPointShake(points[0]!, [60, 20, 30])).toEqual(EXPLOSION_SHAKES[2]);    // ~50 u: the big preset
    expect(blastPointShake(points[0]!, [160, 20, 30])).toEqual(EXPLOSION_SHAKES[1]);   // ~150 u
    expect(blastPointShake(points[0]!, [510, 20, 30])).toEqual(EXPLOSION_SHAKES[0]);   // ~500 u
    expect(blastPointShake(points[0]!, [710, 20, 30])).toBeNull();                     // past 600 u: none
    expect(blastPointShake(points[0]!, null)).toBeNull();                              // no SEAL: none
    fx.update(1, null);
    expect(points).toHaveLength(1);
  });

  it("an item on FUN_003c8330's list (D:L319186-319191) sets no point; MPBOMB (0x9a) is not on it", () => {
    expect(CAMERA_BLAST_EXEMPT_ITEMS).toEqual([0xb6, 0xb2, 0xb1, 0xae, 0xad, 0xac, 0x9f, 0x80, 0x7f, 0x7b, 0x7d, 0x7a]);
    expect(CAMERA_BLAST_EXEMPT_ITEMS).not.toContain(MPBOMB.id);
    const fx = new Effects(() => 0.5);
    fx.setData(synthetic({ ...MPBOMB, id: 0x7a }));
    const points: Vec3[] = [];
    fx.setBlastPoint((p) => points.push([...p]));
    fx.play('base_explosion1', at([0, 0, 0]));
    fx.update(0, null);
    fx.update(3 * GAME_FRAME_DT, null);
    expect(fx.stats().played['satchel']).toBe(1);
    expect(points).toEqual([]);
  });

  it('without a listener (the default) the explosion still plays', () => {
    const fx = new Effects(() => 0.5);
    fx.setData(synthetic());
    fx.play('base_explosion1', at([0, 0, 0]));
    fx.update(0, null);
    fx.update(3 * GAME_FRAME_DT, null);
    expect(fx.stats().played['satchel']).toBe(1);
  });
});

const ZWEAPON = fixture('RUN/ZWEAPON.ZAR');
const DISC = process.env.SOCOM_DISC;
/** The six DEMOLITION maps (research 173): Blizzard, Night Stalker, Bitter Jungle, The Ruins, Crossroads, Requiem. */
const DEMOLITION = ['MP1', 'MP7', 'MP9', 'MP12', 'MP72', 'MP83'] as const;
const zdb = (map: string): Uint8Array | null => {
  const p = DISC ? join(DISC, 'RUN', `${map}.ZDB`) : null;
  return p && existsSync(p) ? new Uint8Array(readFileSync(p)) : null;
};
const HAVE = !!ZWEAPON && !!DISC && existsSync(join(DISC, 'RUN/SOUNDS/BNKSTORE.ZAR')) && DEMOLITION.every((m) => existsSync(join(DISC, 'RUN', `${m}.ZDB`)));

describe.skipIf(!HAVE)(`The planted bomb on the disc: every DEMOLITION map${HAVE ? '' : ` (${FIXTURES_ABSENT}, or SOCOM_DISC without the six maps)`}`, () => {
  it("MPBOMB (item 154) explodes as `satchel` (DefaultSpecialAnimName and SpecialMaterialAnimName) with MPBOMB Ammo's 50 in 300 u", () => {
    const r = [...(readKitTable(ZWEAPON!).throwables?.values() ?? [])].find((e) => e.record.name === 'MPBOMB')?.record;
    expect(r).toMatchObject({ id: 154, explosionAnim: 'satchel', materialAnim: 'satchel', model: 'NONE', ammo: 'MPBOMB Ammo', explosionDamage: 50, explosionRadius: 300 });
    expect(r?.soundRadius).toBe(1);   // Sound_Radius: not over 1, so FUN_003c8330 raises no AI noise (D:L319197-319209)
  });

  it("each map's MZANIM base_explosion1 is the one FIRE_WEAPON of MPBOMB at the caller, and its CZANIM holds satchel and no satchel_<material>", () => {
    for (const m of DEMOLITION) {
      const bytes = zdb(m)!;
      const toc = parseZdb(bytes);
      const anims = (member: string) => parseAnimSets(Zar.parse(zdbMember(bytes, toc, member))).sets.flatMap((s) => s.anims);
      const base = anims('MZANIM.ZAR').filter((a) => a.name.toLowerCase() === 'base_explosion1').map(decodeEffectProgram);
      expect(base.map((p) => p.sequences.flatMap((s) => s.ops)), m).toEqual([[{ op: 'fireWeapon', weapon: 'MPBOMB', ammo: 'MPBOMB Ammo', node: NODE_CALLER, f1: 0.001, f2: 0.01 }]]);
      // None of the map's FIRE_WEAPON programs starts by itself (`effectData`'s ambient rule: MZANIM activation 1), so
      // the effects fire only what a caller plays -- the bomb's `base_explosion1` on this page.
      const firing = [...anims('MZANIM.ZAR'), ...anims('CZANIM.ZAR')].filter((a) => decodeEffectProgram(a).sequences.some((s) => s.ops.some((o) => o.op === 'fireWeapon')));
      expect(firing.filter((a) => (a.params.flags & 3) === 1).map((a) => a.name), m).toEqual([]);
      const common = anims('CZANIM.ZAR').map((a) => a.name.toLowerCase());
      expect(common, m).toContain('satchel');
      expect(common.filter((n) => n.startsWith('satchel_') && n !== 'satchel_start'), m).toEqual([]);
    }
  });

  it("each map's own weapons bank (`<map>_fx.bnk`, research 81) holds satchel's .MK138_SAT_CHRG", () => {
    const zar = Zar.parse(new Uint8Array(readFileSync(join(DISC!, 'RUN/SOUNDS/BNKSTORE.ZAR'))));
    for (const m of DEMOLITION) expect(parseBankFile(zar.data(zar.find(`${m}_fx.bnk`)!)).names.has('.MK138_SAT_CHRG'), m).toBe(true);
  });

  for (const [map, name] of [['MP7', 'Night Stalker'], ['MP72', 'Crossroads']] as const) {
    it(`${name} (${map}): base_explosion1 at the bomb runs satchel through the MPBOMB script round, with its sparks, .MK138_SAT_CHRG and the camera's blast point`, async () => {
      const data = await effectsFromDisc(new FsAssetSource(DISC!), `RUN/${map}.ZDB`, map);
      expect(data.scriptWeapons?.find((w) => w.name === 'MPBOMB')).toMatchObject({ id: 154, explosionAnim: 'satchel', materialAnim: 'satchel', model: 'NONE', muzzleVelocity: 0, ammo: 'MPBOMB Ammo' });
      const heard: string[] = [];
      const fx = new Effects(() => 0.5, (n) => heard.push(n));
      fx.setData({ ...data, ambient: [] });
      const points: Vec3[] = [];
      fx.setBlastPoint((p) => points.push([...p]));
      expect(fx.play('base_explosion1', at([1000, 100, 1080]))).toBe(true);
      for (let t = 0; t < 0.2; t += GAME_FRAME_DT) fx.update(GAME_FRAME_DT, null);
      const played = fx.stats().played;
      expect(played['satchel']).toBe(1);
      expect(played['he_sparks_quick']).toBeGreaterThanOrEqual(1);
      expect(heard).toContain('.MK138_SAT_CHRG');
      expect(points).toHaveLength(1);
      expect(blastPointShake(points[0]!, [1000, 100, 1000])).toEqual(EXPLOSION_SHAKES[2]);   // 80 u from the SEAL
    }, 30000);
  }
});
