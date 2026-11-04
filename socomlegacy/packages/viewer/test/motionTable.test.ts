import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FsAssetSource } from '@s2u/archive/node';
import type { AssetSource, RdrNode } from '@s2u/archive';
import { PLAY_CLIPS } from '../src/animator';
import { SEAL_ANIMS } from '../src/locomotion';
import { FLINCH_CLIPS } from '../src/net/deaths';
import {
  clipsFromPack, motionTableFromArchive, playFromDisc, readMotionTable, MOTION_PACK_PATH, MOTION_TABLE_PATH,
} from '../src/motionTable';

/**
 * `motion.rdr`, the playback table (socomlegacy/docs/research/77 §7): each clip's `looped`, `playback`, `max_velocity`,
 * `BlendTime`, transition speeds and `NoInterrupt`, read at run time out of `RUN/READERC.ZAR` (W2.R6: none of its
 * values is in the source; the synthetic entries below are made up). And the player's pack, `RUN/MOTION_P.ZAR`, read
 * for the clips the play mode asks for.
 */

describe('reading motion.rdr by name (W2.R6)', () => {
  it('reads each entry\'s fields by the file\'s names, numbers or absent; a flag with no value is absent', () => {
    const rdr: RdrNode = ['animations', [
      ['anim_name', ['clip_a'], 'BlendTime', ['0.25'], 'max_velocity', ['-3'], 'looped', ['1'], 'playback', ['7'],
        'transition_speed_A', ['0'], 'transition_speed_B', ['0.5'], 'zanim_callback', ['name', ['whoosh'], 'time', ['0.2']]],
      ['anim_name', ['clip_b'], 'NoInterrupt', ['0.4'], 'max_velocity', ['9'], 'looped', ['0'], 'playback', ['1'], 'Lateral', [], 'VerticalMotion', [], 'NoFire', ['0.3']],
      ['anim_name', ['clip_c'], 'NoInterrupt', [], 'playback', ['not a number'], 'NoFire', []],
      ['no_name', ['x']],
    ]];
    const table = readMotionTable(rdr);
    expect([...table.keys()]).toEqual(['clip_a', 'clip_b', 'clip_c']);
    expect(table.get('clip_a')).toEqual({
      looped: true, playback: 7, maxVelocity: -3, blendTime: 0.25, transitionA: 0, transitionB: 0.5, noInterrupt: null, noFire: null,
      lateral: false, noPitchtwist: false, blendOverlay: false, verticalMotion: false, callbacks: [{ name: 'whoosh', time: 0.2 }], normalize: [1, 1],
    });
    expect(table.get('clip_b')).toEqual({
      looped: false, playback: 1, maxVelocity: 9, blendTime: null, transitionA: null, transitionB: null, noInterrupt: 0.4, noFire: 0.3,
      lateral: true, noPitchtwist: false, blendOverlay: false, verticalMotion: true, callbacks: [], normalize: [1, 1],
    });
    expect(table.get('clip_c')).toEqual({
      looped: null, playback: null, maxVelocity: null, blendTime: null, transitionA: null, transitionB: null, noInterrupt: 1, noFire: 1,
      lateral: false, noPitchtwist: false, blendOverlay: false, verticalMotion: false, callbacks: [], normalize: [1, 1],
    });
    // every zanim_callback of a record, in order (the loader walks the key's first and next)
    const two = readMotionTable(['animations', [['anim_name', ['d'], 'zanim_callback', ['name', ['a'], 'time', ['0.1']],
      'zanim_callback', ['name', ['b'], 'time', ['1.5']], 'zanim_callback', ['name', ['no time']]], ['anim_name', ['e']]]]);
    expect(two.get('d')!.callbacks).toEqual([{ name: 'a', time: 0.1 }, { name: 'b', time: 1.5 }]);
    // refPt (MAP-10b; FUN_00287620 D:L131598-131611): three numbers kept only when not all zero.
    const refs = readMotionTable(['animations', [['anim_name', ['f'], 'refPt', ['-3.31', '-2.526', '7.655']], ['anim_name', ['g'], 'refPt', ['0', '0', '0']],
      ['anim_name', ['h'], 'refPt', ['1', '2']]]]);
    expect([refs.get('f')!.refPt, refs.get('g')!.refPt, refs.get('h')!.refPt, table.get('clip_a')!.refPt]).toEqual([[-3.31, -2.526, 7.655], undefined, undefined, undefined]);
    expect(readMotionTable([]).size).toBe(0);
    expect(readMotionTable(['animations', 'not a list']).size).toBe(0);
  });

  it("reads Normalize as FUN_00287620 loads it (D:L131523-131584): absent (1, 1), bare (0, 0), one value (A, 1), two (A, B), a non-number 0", () => {
    const t = readMotionTable(['animations', [
      ['anim_name', ['absent']], ['anim_name', ['bare'], 'Normalize', []], ['anim_name', ['one'], 'Normalize', ['0.3']],
      ['anim_name', ['two'], 'Normalize', ['0.2', '0.8']], ['anim_name', ['flipped'], 'Normalize', ['1', '0.5']],
      ['anim_name', ['word'], 'Normalize', ['x', '0.5']],
    ]]);
    expect(['absent', 'bare', 'one', 'two', 'flipped', 'word'].map((n) => t.get(n)!.normalize)).toEqual([[1, 1], [0, 0], [0.3, 1], [0.2, 0.8], [1, 0.5], [0, 0.5]]);
  });

  it('names the two disc files it reads, beside the maps', () => {
    expect(MOTION_TABLE_PATH).toBe('RUN/READERC.ZAR');
    expect(MOTION_PACK_PATH).toBe('RUN/MOTION_P.ZAR');
  });

  it('is null, silently, from a source without the pack: the body stands in its bind pose then', async () => {
    const none: AssetSource = { list: async () => [], read: async (p) => { throw new Error(`HTTP 404 ${p}`); } };
    expect(await playFromDisc(none, PLAY_CLIPS)).toBeNull();
    expect(motionTableFromArchive(new Uint8Array(64))).toBeNull();
  });
});

/**
 * PF-17 (research 194 A02, 218 s1): `NoFire`, read by `FUN_00287620` (key string at ELF 0x3ef9f8, D:L131397-131429) into
 * the motion's `+0x2c` -- absent 0 (here null), bare 1.0, numeric the float -- pinned against the tracked fixture's
 * `motion.rdr` (`test-fixtures/RUN/READERC.ZAR`), the clips research 194 A02's table names.
 */
const FIXTURE_TABLE = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'), MOTION_TABLE_PATH);
const noFixtureTable = !existsSync(FIXTURE_TABLE);
describe.skipIf(noFixtureTable)(`NoFire in the fixture's motion.rdr${noFixtureTable ? ' (test-fixtures/RUN/READERC.ZAR absent)' : ''}`, () => {
  it("motion.rdr's Normalize (PRONE-TILT, research 217 s7): 345 records without, 22 bare, the transitions (0, 1), the knock's falls and landings, the deaths and the carried pickup's (1, 0.5); no record has one value", () => {
    const t = motionTableFromArchive(new Uint8Array(readFileSync(FIXTURE_TABLE)))!;
    const n = (name: string): readonly number[] | undefined => t.get(name)?.normalize;
    expect(['seal_crouch2prone', 'seal_stand2prone', 'seal_p_stand2prone'].map(n)).toEqual([[0, 1], [0, 1], [0, 1]]);
    expect(['seal_prone', 'seal_p_prone', 'seal_prone_crawl', 'seal_prone_turn', 'seal_prone_rstrafe', 'seal_prone_lstrafe', 'guard_prone_cover'].map(n))
      .toEqual(Array(7).fill([0, 0]));
    expect(['seal_dive2prone', 'seal_stand', 'seal_crouch', 'seal_run', 'seal_prone_throwgrenade', 'seal_prone_recoil'].map(n)).toEqual(Array(6).fill([1, 1]));
    expect(['seal_fallforward01', 'seal_landforward01', 'death_stand_chest01', 'seal_buddycarried_pickup', 'death_buddy_crouch01'].map(n))
      .toEqual([[0.55, 0.95], [0.5, 0.9], [0.2, 0.8], [1, 0.5], [0, 0.5]]);
    const key = (v: readonly number[] | undefined): string => JSON.stringify(v);
    const counts = new Map<string, number>();
    for (const e of t.values()) counts.set(key(e.normalize), (counts.get(key(e.normalize)) ?? 0) + 1);
    expect(Object.fromEntries(counts)).toEqual({
      '[1,1]': 345, '[0,0]': 22, '[0,1]': 3, '[0.55,0.95]': 2, '[0.5,0.9]': 2, '[1,0.5]': 1, '[0.2,0.8]': 18, '[0.3,0.8]': 1, '[0,0.4]': 3, '[0,0.5]': 1,
    });
  });

  it("motion.rdr's NoFire: absent null, bare 1, numeric the float (FUN_00287620 D:L131397-131429): seal_stand2prone 1, seal_crouch2prone 0.8, seal_land_hard 0.3, seal_jump and seal_land_soft null", () => {
    const t = motionTableFromArchive(new Uint8Array(readFileSync(FIXTURE_TABLE)))!;
    const noFire = (n: string): number | null | undefined => t.get(n)?.noFire;
    expect(['seal_stand2prone', 'seal_crouch2prone', 'seal_land_hard', 'seal_jump', 'seal_land_soft'].map(noFire)).toEqual([1, 0.8, 0.3, null, null]);
    // the rest of 194 A02's table: the hang, the climb up, the ladder slide, the claymore's placing bare; the launcher
    // raise bare (179 s11.15); the pistol's versions as the rifle's
    expect(['seal_hang', 'seal_hang2climbup', 'seal_ladder2slide', 'seal_ladderslide', 'seal_ladderslide_land', 'seal_place_claymore',
      'seal_rifle2launcher', 'seal_pistol2launcher', 'seal_p_stand2prone', 'seal_p_land_hard'].map(noFire)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 0.3]);
    // the running jump's launch 0.2, the rifle's and the pistol's (the fix round: no blanket airborne lock, but this one)
    expect([noFire('seal_runningjump_launch'), noFire('seal_p_runningjump_launch')]).toEqual([0.2, 0.2]);
    // the standing stance change carries none (fires through), the get-ups 0.8
    expect([noFire('seal_stand2crouch'), noFire('seal_getupforward01'), noFire('seal_getupbackwards01')]).toEqual([null, 0.8, 0.8]);
    // the six short multiplayer flinches: none (194 A02) -- a flinch never locks the fire
    expect(FLINCH_CLIPS.map(noFire)).toEqual([null, null, null, null, null, null]);
  });
});

const SERVED = resolve(dirname(fileURLToPath(import.meta.url)), '../../../public/maps');
const noTable = !existsSync(resolve(SERVED, MOTION_TABLE_PATH));
const noPack = !existsSync(resolve(SERVED, MOTION_PACK_PATH));

describe.skipIf(noTable)(`motion.rdr on the disc${noTable ? ' (READERC.ZAR absent from public/maps/RUN)' : ''}`, () => {
  const table = () => motionTableFromArchive(new Uint8Array(readFileSync(resolve(SERVED, MOTION_TABLE_PATH))))!;

  it('holds research 77 §7\'s 398 entries, 150 looped and 248 not, and the values it prints', () => {
    const t = table();
    expect(t.size).toBe(398);
    const looped = [...t.values()].map((e) => e.looped);
    expect([looped.filter((l) => l === true).length, looped.filter((l) => l === false).length]).toEqual([150, 248]);
    // research 77 §7: seal_run and seal_stand loop, seal_jump and seal_land_hard do not; seal_crouch_step plays in 0.4
    expect([t.get('seal_run')!.looped, t.get('seal_stand')!.looped, t.get('seal_jump')!.looped, t.get('seal_land_hard')!.looped])
      .toEqual([true, true, false, false]);
    expect(t.get('seal_crouch_step')!.playback).toBeCloseTo(0.4, 6);
    expect(t.get('seal_run')!.playback).toBe(1);
    expect([t.get('seal_walk')!.maxVelocity, t.get('seal_run')!.maxVelocity]).toEqual([6.5, 6.5]);
  });

  it('names every clip the play mode picks, each consistent: a playback, a locomotion band that runs upward', () => {
    const t = table();
    for (const name of Object.values(SEAL_ANIMS)) {
      const e = t.get(name);
      expect(e, name).toBeTruthy();
      expect(e!.looped, name).not.toBeNull();
      expect(e!.playback! > 0, name).toBe(true);
      expect(e!.maxVelocity, name).not.toBeNull();
      if (e!.transitionA !== null && e!.transitionB !== null) expect(e!.transitionA <= e!.transitionB, name).toBe(true);
      if (e!.blendTime !== null) expect(e!.blendTime > 0, name).toBe(true);
    }
  });
});

describe.skipIf(noPack || noTable)(`the play data from the served tree${noPack ? ' (MOTION_P.ZAR absent)' : ''}`, () => {
  it('reads the asked-for clips out of MOTION_P.ZAR with research 77 §12\'s frame counts, and the table beside them', async () => {
    const data = (await playFromDisc(new FsAssetSource(SERVED), PLAY_CLIPS))!;
    expect(data).not.toBeNull();
    const frames = new Map(data.clips.map((c) => [c.name, c.frameCount]));
    // research 77 §12's frame counts where it prints them; every clip the plays name is in the pack
    expect(Object.fromEntries(['seal_stand', 'seal_run', 'seal_crouch', 'seal_crouchwalk', 'seal_jump', 'seal_runningjump_launch',
      'seal_runningjump_in_air', 'seal_land_soft', 'seal_land_hard'].map((n) => [n, frames.get(n)]))).toEqual({
      seal_stand: 16, seal_run: 19, seal_crouch: 21, seal_crouchwalk: 28, seal_jump: 20,
      seal_runningjump_launch: 25, seal_runningjump_in_air: 14, seal_land_soft: 20, seal_land_hard: 20,
    });
    for (const n of Object.values(SEAL_ANIMS)) expect(frames.get(n), n).toBeGreaterThan(0);
    // only what was asked for, each once; the table only for those
    expect(data.clips.every((c) => PLAY_CLIPS.includes(c.name))).toBe(true);
    expect(new Set(data.clips.map((c) => c.name)).size).toBe(data.clips.length);
    expect(data.table!.every(([n]) => PLAY_CLIPS.includes(n))).toBe(true);
    expect(data.table!.map(([n]) => n)).toEqual(expect.arrayContaining(Object.values(SEAL_ANIMS)));
    // a name the pack does not carry is left out, not an error
    expect(clipsFromPack(new Uint8Array(readFileSync(resolve(SERVED, MOTION_PACK_PATH))), ['seal_walk', 'no_such_clip']).map((c) => c.name))
      .toEqual(['seal_walk']);
  });
});
