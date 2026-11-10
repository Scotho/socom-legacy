import { describe, expect, it } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Box3, BoxGeometry, Group, Matrix4, Mesh, MeshBasicMaterial, PerspectiveCamera, Vector3 } from 'three';
import { FsAssetSource } from '@s2u/archive/node';
import { buildGrid, type CollisionOwner, type EffectOp, type EffectProgram, type GridParams, type WorldPoly, type ZAnimLight } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { effectsFromDisc, type EffectData } from '../src/effectData';
import { soundFor } from '@s2u/sound';
import { Effects, impactAnimation, markTable, MAX_EFFECT_RUNS_ADAPTATION, muzzleAnimation, rangeTestHolds, RIPPLES, speedClass, valveApply, valveTest } from '../src/effects';
import { flatCorners, rotatedCorners } from '../src/particles';
import { EffectLights } from '../src/effectLights';

/**
 * The gunplay's effects (socomlegacy/docs/research/89): the names a round plays, the valves, the mark table, and -- on the
 * game's own data, where the fixtures are -- the M4A1 SD's round end to end: the casing thrown to the rifle's right,
 * falling at the zAnim gravity and bouncing on the deck with the metal's sound; the flash of the M4A1; the impacts.
 */

const FIXTURES = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'));
const MP2 = fixture('RUN/MP2.ZDB');

describe('what a round plays', () => {
  it('the weapon\'s FireAnimName, its _zoom variant in the aim view, and <HitAnimName>_<material> in lower case', () => {
    expect(muzzleAnimation('muzzle_m4SD', false)).toBe('muzzle_m4SD');
    expect(muzzleAnimation('muzzle_m4SD', true)).toBe('muzzle_m4SD_zoom');
    expect(muzzleAnimation(null, false)).toBeNull();
    expect(impactAnimation('bullet_hit', 'METAL_THICK')).toBe('bullet_hit_metal_thick');
    expect(impactAnimation('bullet_hit', undefined)).toBeNull();
  });

  it('the valves: shell_eject counts its casings up and down and tests fewer than five', () => {
    let v = 0;
    for (let i = 0; i < 5; i++) v = valveApply(v, 0x0c, 1);
    expect(v).toBe(5);
    expect(valveTest(v, 4, 5)).toBe(false);          // the fifth casing takes the cheap flight
    expect(valveTest(4, 4, 5)).toBe(true);
    expect(valveApply(0, 0x0d, 1)).toBe(0);          // subtract stops at zero
    expect(valveTest(5, 2, 5)).toBe(true);           // the NVG gate: lensfx == 5
  });

  // RANGE_TEST's comparison (`FUN_0025de90` D:L107912-107942): the first of 0x40-0x800 set picks it. `bullet_hit_person`
  // tests 0x61 (0x40: the camera nearer than the range); `shell_eject` 0x109 (0x100: farther than); `raindrops01` 0x49.
  it('RANGE_TEST: 0x40 <, 0x80 <=, 0x100 >, 0x200 >=, 0x400 ==, 0x800 != (the first bit set); none set never holds', () => {
    const R = 16900;
    expect(rangeTestHolds(0x61, 900, R)).toBe(true);                 // bullet_hit_person, the camera 30 off: the close blood
    expect(rangeTestHolds(0x61, R, R)).toBe(false);                  // strictly nearer
    expect(rangeTestHolds(0x61, 40000, R)).toBe(false);              // 200 off: the far blood
    expect(rangeTestHolds(0x49, 100, 360000)).toBe(true);            // raindrops01: the camera within 600
    expect([rangeTestHolds(0x80, R, R), rangeTestHolds(0x80, R + 1, R)]).toEqual([true, false]);
    expect([rangeTestHolds(0x109, R, R), rangeTestHolds(0x109, R + 1, R)]).toEqual([false, true]);   // shell_eject
    expect([rangeTestHolds(0x200, R, R), rangeTestHolds(0x200, R - 1, R)]).toEqual([true, false]);
    expect([rangeTestHolds(0x400, R, R), rangeTestHolds(0x400, R + 1, R)]).toEqual([true, false]);
    expect([rangeTestHolds(0x800, R, R), rangeTestHolds(0x800, R + 1, R)]).toEqual([false, true]);
    expect(rangeTestHolds(0x40 | 0x100, 40000, R)).toBe(false);      // 0x40 decides before 0x100 is looked at
    expect(rangeTestHolds(0x21, 0, R)).toBe(false);                  // no comparison bit: never
  });

  it('the sound a name stands for: the data slip mended, a missing casing sound stood in for', () => {
    const banks = new Set(['.BUL_CAS_METAL', '.BUL_CAS_GRASS', '.BUL_CAS_STONE']);
    const has = (n: string) => banks.has(n);
    expect(soundFor('.BUL_CASE_METAL', has)).toBe('.BUL_CAS_METAL');
    expect(soundFor('.BUL_CAS_DIRT', has)).toBe('.BUL_CAS_GRASS');     // Blood Lake's banks
    expect(soundFor('.BUL_CAS_STONE', has)).toBe('.BUL_CAS_STONE');
    expect(soundFor('.BUL_CAS_WOOD', has)).toBe('.BUL_CAS_WOOD');      // none held, none stood in: silence as the game
    const frost = (n: string) => ['.SG_SHELL_METAL', '.SG_SHELL_STONE'].includes(n);
    expect(soundFor('.SG_SHELL_TIN', frost)).toBe('.SG_SHELL_METAL');   // research 90 item 18
    expect(soundFor('.SG_SHELL_SAND', frost)).toBe('.SG_SHELL_STONE');
  });

  it('the light passes draw with pooled objects: a second blast makes no material and no overlay', () => {
    const lights = new EffectLights();
    const world = new Group();
    for (let i = 0; i < 4; i++) {
      const m = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
      m.position.set(i * 3, 0, 0);
      world.add(m);
    }
    lights.setReceivers(() => [world]);
    lights.setTexture(null);
    lights.warmMeshes();
    const pooled = lights.stats().pooled;
    expect(pooled).toBe(4 * 2);                                    // every receiver, in both passes
    lights.warmDone();
    expect(world.children.filter((o) => o.visible)).toHaveLength(4);  // the overlays hide after the warm-up
    const light = { flags: 0, node: null, atContext: false, offset: [0, 0, 0], rgb: [255, 200, 120], opacity: 64, blend: 0x48,
      ranges: [[0, 0, 5], [0.2, 0, 5]], duration: 0.2 } as unknown as ZAnimLight;
    let alive = true;
    lights.begin(light, [0, 0, 0], () => alive);
    const first = lights.stats();
    expect(first.overlays).toBeGreaterThan(0);
    expect(first.overlays).toBeLessThan(4);                         // only what its reach meets
    alive = false;
    lights.update(0.1);
    expect(world.children.filter((o) => o.visible)).toHaveLength(4);
    alive = true;
    lights.begin(light, [0, 0, 0], () => alive);
    expect(lights.stats()).toMatchObject({ pooled, overlays: first.overlays, live: 1 });
  });

  it('the mark table: the polygon byte to its SOILS name to its row, byte 0 the map\'s DefaultMaterial, no row no mark', () => {
    const materials = ['UNKNOWN', 'PARTICLE_SYSTEM', 'ACTION', 'INVISIBLE_DI', 'GRASS', 'SAND', 'MUD', 'STONE'];
    const rows = [
      { set: 'S', material: 'STONE', texture: 'bullet_mark_stone.tif', minSize: 1, maxSize: 1.8 },
      { set: 'S', material: 'SAND', texture: 'bullet_mark_sand.tif', minSize: 1, maxSize: 1.5 },
    ];
    const t = markTable(materials, rows, new Map(), 5);
    expect(t.row(7)?.texture).toBe('bullet_mark_stone.tif');
    expect(t.row(0)?.texture).toBe('bullet_mark_sand.tif');
    expect(t.row(6)).toBeNull();                      // MUD has no BULLET_MARK_SMALL row
    expect(t.row(99)).toBeNull();
  });
});

describe('the particle types (FUN_00325580, FUN_00325cc0)', () => {
  it('a rotated particle: a square turned by its angle, its half-diagonal the size', () => {
    const right = new Vector3(1, 0, 0), up = new Vector3(0, 1, 0);
    const c = rotatedCorners([0, 0, 0], 2, 0, right, up);
    expect(c.map(([x, y]) => [+x.toFixed(6) + 0, +y.toFixed(6) + 0])).toEqual([[2, 0], [0, -2], [-2, 0], [0, 2]]);   // a diamond at 0
    expect(c.map(([, , , u, v]) => [u, v])).toEqual([[0, 0], [0, 1], [1, 1], [1, 0]]);
    const turned = rotatedCorners([0, 0, 0], 2, Math.PI / 4, right, up);
    expect(Math.hypot(turned[0]![0], turned[0]![1])).toBeCloseTo(2, 9);
  });
  it('a flat particle: 2 size across in the world XZ plane at its height, u along +z, v along +x', () => {
    expect(flatCorners([10, 5, 20], 3)).toEqual([[7, 5, 17, 0, 0], [13, 5, 17, 0, 1], [13, 5, 23, 1, 1], [7, 5, 23, 1, 0]]);
  });
});

describe('the SEAL in water', () => {
  it('the ripple of the speed class: still, moving, running at |v|^2 0.25 and 400', () => {
    expect(speedClass([0, 0, 0.4])).toBe(0);
    expect(speedClass([10, 0, 0])).toBe(1);
    expect(speedClass([65, 0, 0])).toBe(2);
    expect(RIPPLES.big[2]).toBe('big_ripple_anim_run');
  });
});

describe('an effect\'s SOUND plays at the command\'s own volume (FUN_002659c0 112363-112461; research 81 §12)', () => {
  // The zAnim path (`@s2u/sound` `commandVolume`) already honours flag 0x10; the effects' SOUND op is the same command.
  const data = (volume: number): EffectData => ({
    archive: 'T', models: [], textures: [], absent: [], materials: ['UNKNOWN'], defaultMaterial: 0, marks: [], footprints: [],
    ambient: [], sceneNodes: [], hitAnims: [], missing: [],
    programs: [{
      name: 'bang', root: 0, flags: 0, nodes: ['NA'],
      sequences: [{ name: 's0', activation: 1, ops: [{ op: 'sound', sound: '.GREN_MED', node: 0, volume }] }],
    }],
  });

  for (const volume of [3, 0.5, 1]) {
    it(`a command's ${volume} reaches the sound door`, () => {
      const heard: [string, number][] = [];
      const fx = new Effects(() => 0.5, (name, _at, v) => heard.push([name, v]));
      fx.setData(data(volume));
      expect(fx.play('bang', { node: new Matrix4(), position: [0, 0, 0] })).toBe(true);
      fx.update(1 / 60, new PerspectiveCamera());
      expect(heard).toEqual([['.GREN_MED', volume]]);
    });
  }
});

describe("an effect's SOUND that is no placed new play reaches no voice (FUN_002659c0 112365, 112460-112486)", () => {
  // MP11 objectives' shape: a MUS_* cue at 0x880 -- the game plays it unplaced in its one-voice priority slot
  // (FUN_00348dc0 at priority 3, decomp 245376-245420); the viewer does not model the slot and drops it
  // (SOUND_PRIORITY_SLOT_READING, research 81 section 13) -- and a retune at 0x02, which starts none in the game too.
  const data = (): EffectData => ({
    archive: 'T', models: [], textures: [], absent: [], materials: ['UNKNOWN'], defaultMaterial: 0, marks: [], footprints: [],
    ambient: [], sceneNodes: [], hitAnims: [], missing: [],
    programs: [{
      name: 'objectives', root: 0, flags: 0, nodes: ['NA'],
      sequences: [{ name: 's0', activation: 1, ops: [
        { op: 'sound', sound: 'MUS_MP_INTRO', node: 0, volume: 1, flags: 0x880, newPlay: false },
        { op: 'sound', sound: '~COPTER', node: 0, volume: 1, flags: 0x02, newPlay: false },
        { op: 'sound', sound: '.GREN_MED', node: 0, volume: 1, flags: 0x82, newPlay: true },
      ] }],
    }],
  });

  it('only the 0x80 play reaches the sound door', () => {
    const heard: string[] = [];
    const fx = new Effects(() => 0.5, (name) => heard.push(name));
    fx.setData(data());
    expect(fx.play('objectives', { node: new Matrix4(), position: [0, 0, 0] })).toBe(true);
    fx.update(1 / 60, new PerspectiveCamera());
    expect(heard).toEqual(['.GREN_MED']);
  });
});

/**
 * PAR-45 (research 283; a browser adaptation for the replay's seek, `REPLAY_ADAPTATION`): a handle's `stop()` stops the
 * runs its run's `CALL_ANIMATION`s started, all the way down -- `smoke_grenade` calls `smoke_stream` as a run of its own
 * (research 85 s9.6), so stopping the detonation's handle alone left the stream pouring. Synthetic programs: a parent
 * that calls a child and waits, one that calls and ends at once (as `smoke_grenade` ends before its stream), a child that
 * calls a grandchild.
 */
describe('PAR-45: a handle\'s stop() stops what its run called, recursively', () => {
  const wait = (seconds: number): EffectOp => ({ op: 'wait', seconds, range: 0, frames: null });
  const prog = (name: string, ops: EffectOp[]): EffectProgram => ({ name, root: 0, flags: 0, nodes: ['NA'], sequences: [{ name: 's0', activation: 1, ops }] });
  const data = (): EffectData => ({
    archive: 'T', models: [], textures: [], absent: [], materials: ['UNKNOWN'], defaultMaterial: 0, marks: [], footprints: [],
    ambient: [], sceneNodes: [], hitAnims: [], missing: [],
    programs: [
      prog('waiter', [{ op: 'call', anim: 'child' }, wait(100)]),
      prog('caller', [{ op: 'call', anim: 'child' }]),
      prog('child', [{ op: 'call', anim: 'grandchild' }, wait(100)]),
      prog('grandchild', [wait(100)]),
      prog('loner', [wait(100)]),
    ],
  });
  const rig = () => {
    const fx = new Effects(() => 0.5, () => {});
    fx.setData(data());
    const camera = new PerspectiveCamera();
    return { fx, tick: () => fx.update(1 / 30, camera) };
  };

  it('a parent that waits: stop() on its handle leaves neither it nor its child nor the grandchild alive', () => {
    const { fx, tick } = rig();
    const h = fx.run('waiter', { position: [0, 0, 0] })!;
    tick();
    expect(fx.stats().runs).toBe(3);                    // waiter, child, grandchild
    h.stop();
    tick();
    expect(h.alive()).toBe(false);
    expect(fx.stats().runs).toBe(0);
  });

  it('a parent already ended (smoke_grenade before its stream): stop() still stops the child it called', () => {
    const { fx, tick } = rig();
    const h = fx.run('caller', { position: [0, 0, 0] })!;
    tick();
    expect(h.finished).toBe(true);                      // the caller's one call is done
    expect(fx.stats().runs).toBe(2);                    // child and grandchild pour on
    h.stop();
    tick();
    expect(fx.stats().runs).toBe(0);
  });

  it('the control: stop() reaches no run its own did not call -- another run of the same program, or a stranger', () => {
    const { fx, tick } = rig();
    const a = fx.run('waiter', { position: [0, 0, 0] })!;
    fx.run('waiter', { position: [9, 0, 0] });
    fx.run('loner', { position: [0, 0, 0] });
    tick();
    expect(fx.stats().runs).toBe(7);
    a.stop();
    tick();
    expect(fx.stats().runs).toBe(4);                    // the second waiter's three and the loner
  });
});

/** A flat deck at y 0 of material `material` over x, z in [-100, 100]. */
function deck(material: number) {
  const poly: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/deck', region: 0, ditype: 2, material, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-100, 0, -100, 100, 0, -100, 100, 0, 100, -100, 0, 100]),
  };
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/deck0', first: 0, count: 1 }];
  return buildGrid(params, [], [], [poly], owners);
}

describe.skipIf(!MP2)(`the M4A1 SD's round on the game's data${MP2 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  let data: EffectData | null = null;
  const load = async (): Promise<EffectData> => (data ??= await effectsFromDisc(new FsAssetSource(FIXTURES), 'RUN/MP2.ZDB', 'MP2'));

  it('reads the programs of both archives, the models, the textures, the SOILS and the marks with nothing missing', async () => {
    const d = await load();
    expect(d.missing).toEqual([]);
    const names = new Set(d.programs.map((p) => p.name));
    for (const n of ['muzzle_m4SD', 'shell_eject', 'shell_smoke_med', 'flash_fire_hider', 'bullet_hit_metal_thick', 'bullet_hit_stone', 'frag_grenade_stone']) {
      expect(names.has(n)).toBe(true);
    }
    expect(d.models.map((m) => m.name)).toContain('bullet_shell_9m');
    expect(d.materials[25]).toBe('METAL_THICK');
    expect(d.materials[d.defaultMaterial]).toBe('METAL_THICK');     // Frostfire's mp2.rdr
    expect(d.hitAnims).toEqual(expect.arrayContaining([['M4A1 SD', 'bullet_hit'], ['M4A1', 'bullet_hit']]));
    expect(d.marks.find((r) => r.material === 'METAL_THICK')?.texture).toBe('bullet_mark_metal.tif');
    const tex = new Map(d.textures);
    expect(tex.get('cloudpuff01.tif')?.gs?.blend).toBe('source');
    expect(tex.get('effect_muzzle01.tif')?.gs?.blend).toBe('additive');
  });

  it('throws the casing to the rifle\'s right and up, drops it at -98, bounces it on the metal deck and hides it', async () => {
    const d = await load();
    const sounds: string[] = [];
    let r = 0;
    const fx = new Effects(() => ((r = (r * 9301 + 49297) % 233280) / 233280), (name) => sounds.push(name));
    fx.setData({ ...d, ambient: [] });             // the mission's own flames would emit beside the round
    fx.setWorld(() => deck(25));
    // The weapon 12 units over the deck, its barrel along -x (west), so its right (+z of its frame) is -z.
    const x = new Vector3(-1, 0, 0), y = new Vector3(0, 1, 0), z = new Vector3().crossVectors(x, y);
    const node = new Matrix4().makeBasis(x, y, z).setPosition(0, 12, 0);
    expect(fx.play('muzzle_m4SD', { node, position: [7.8, 0.8, 0], velocity: [-1, 0, 0] })).toBe(true);
    const played = fx.stats().played;
    expect(played['shell_eject']).toBe(1);
    expect(played['shell_smoke_med']).toBe(1);
    const camera = new PerspectiveCamera();
    fx.update(1 / 60, camera);
    const first = fx.stats().lastShell!;
    expect(first.velocity[2]).toBeLessThan(-10);                        // to the rifle's right
    expect(first.velocity[1]).toBeGreaterThan(5);                       // and up
    let t = 0;
    while (fx.stats().shells > 0 && t < 2) { fx.update(1 / 60, camera); t += 1 / 60; }
    expect(t).toBeLessThanOrEqual(1.2 + 1e-6);                          // gone at rest or at its lifetime
    expect(fx.stats().bounces).toBeGreaterThan(0);
    expect(sounds).toContain('.BUL_CAS_METAL');          // the bank's name for the data's .BUL_CASE_METAL
    // The smoke source is switched off in the data: nothing was emitted.
    expect(fx.stats().emitted).toBe(0);
  });

  it('draws the M4A1\'s flash at the muzzle, along the barrel, and scales it up over 0.05 s, then hides it', async () => {
    const d = await load();
    const fx = new Effects(() => 0.9);
    fx.setData(d);
    const node = new Matrix4().makeTranslation(100, 0, 0);          // the barrel along +x
    expect(fx.play('flash_fire_hider', { node, position: [7.8, 0.8, 0] })).toBe(true);
    const camera = new PerspectiveCamera();
    fx.update(0.03, camera);
    expect(fx.stats().shown).toContain('muzzle_flash_hider');
    const box = new Box3().setFromObject(fx.object.children.find((c) => c.name === 'muzzle_flash_hider')!);
    expect(box.min.x).toBeGreaterThan(107);                              // it starts at the muzzle...
    expect(box.max.x - box.min.x).toBeGreaterThan(2);                   // ...and reaches along the barrel
    for (let i = 0; i < 10; i++) fx.update(1 / 60, camera);
    expect(fx.stats().shown).not.toContain('muzzle_flash_hider');
  });

  // Ported from Chris's browser-beta-v5 (effects.test.ts:220-242): a paused clock (`Effects.paused`, the page's pause)
  // holds a flash where it is, and a pause taken after it has run out cannot bring it back.
  it('holds a muzzle flash while paused before it expires; pausing after two slow updates cannot restore it', async () => {
    const fx = new Effects(() => 0.9);
    fx.setData(await load());
    const camera = new PerspectiveCamera();
    expect(fx.play('muzzle_m4', { node: new Matrix4(), position: [0, 0, 0] })).toBe(true);
    fx.update(1 / 60, camera);
    expect(fx.stats().shown).toContain('muzzle_flash_hider');
    fx.paused = true;
    for (let i = 0; i < 10; i++) fx.update(1 / 60, camera);
    expect(fx.stats().shown).toContain('muzzle_flash_hider');
    fx.paused = false;
    for (let i = 0; i < 10; i++) fx.update(1 / 60, camera);
    expect(fx.stats().shown).not.toContain('muzzle_flash_hider');
    expect(fx.play('muzzle_m4', { node: new Matrix4(), position: [0, 0, 0] })).toBe(true);
    fx.update(0.1, camera);
    expect(fx.stats().shown).toContain('muzzle_flash_hider');
    fx.update(0.1, camera);
    fx.paused = true;
    fx.update(0, camera);
    expect(fx.stats().shown).not.toContain('muzzle_flash_hider');
    fx.setData(null);
  });

  it('runs a frag grenade explosion: the material puff, then frag_grenade sparks on a thrown node, smoke, dust', async () => {
    const d = await load();
    const sounds: string[] = [];
    let r = 0.3;
    const fx = new Effects(() => ((r = (r * 7 + 0.13) % 1)), (name) => sounds.push(name));
    fx.setData(d);
    const at: [number, number, number] = [10, 0, 10];
    const place = { node: new Matrix4().makeTranslation(...at), position: at, normal: [0, 1, 0] as [number, number, number], velocity: [0, 0, 0] as [number, number, number] };
    expect(fx.play('frag_grenade_stone', place)).toBe(true);
    const camera = new PerspectiveCamera();
    camera.position.set(10, 20, 80);
    camera.updateMatrixWorld();
    for (let i = 0; i < 30; i++) fx.update(1 / 60, camera);
    const s = fx.stats();
    expect(s.played['frag_grenade']).toBe(1);                       // after the stone's own 0.05 s puff
    for (const part of ['FRAG_sparks', 'dust_explode_long', 'light_flash_large', 'bsmoke_explode_large', 'dust_ground_roll']) expect(s.played[part]).toBe(1);
    expect(sounds).toContain('.GREN_MED');
    expect(s.particles).toBeGreaterThan(20);
    expect(s.emitted).toBeGreaterThan(40);
  });

  it('prints a footprint on sand (decals.rdr FOOTSTEP_DECALS), not on metal, not prone', async () => {
    const d = await load();
    const fx = new Effects(() => 0.5);
    fx.setData(d);
    const sand = d.materials.indexOf('SAND'), metal = d.materials.indexOf('METAL_THICK');
    expect(d.footprints).toEqual(expect.arrayContaining([['SAND', 'stamp_footprint01.tif'], ['SNOW', 'stamp_footprint_snow.tif']]));
    expect(fx.footfall([0, 0, 0], sand, [0, 1, 0], [0, 0, -1], false)).toBe(true);
    expect(fx.footfall([0, 0, 0], sand, [0, 1, 0], [0, 0, -1], true)).toBe(false);
    expect(fx.footfall([0, 0, 0], metal, [0, 1, 0], [0, 0, -1], false)).toBe(false);
    expect(fx.stats().water.footprints).toBe(1);
  });

  it('the smoke grenade pours a screen: two sources on the canister, puffs growing tenfold, 20 s of it', async () => {
    const d = await load();
    let r = 0.37;
    const fx = new Effects(() => ((r = (r * 9.7 + 0.31) % 1)));
    fx.setData(d);
    const at: [number, number, number] = [100, 0, 100];
    const node = new Matrix4().makeTranslation(...at);
    expect(fx.play('smoke_grenade', { node, position: at, normal: [0, 1, 0], velocity: [0, 0, 0] })).toBe(true);
    const camera = new PerspectiveCamera();
    camera.position.set(100, 10, 200);
    camera.updateMatrixWorld();
    for (let i = 0; i < 6 * 30; i++) fx.update(1 / 30, camera);
    const s6 = fx.stats();
    expect(s6.played['smoke_stream']).toBe(1);
    expect(s6.particles).toBeGreaterThan(25);            // 2.5 puffs a second a source, 5-7 s each
    for (let i = 0; i < 22 * 30; i++) fx.update(1 / 30, camera);
    expect(fx.stats().particles).toBeLessThan(s6.particles);   // the stream stops at 20 s, the screen thins
  });

  it('every _zoom muzzle is a light, a hidden casing or nothing; the M4A1 zoomed lights its surroundings', async () => {
    const d = await load();
    const calls = new Set<string>();
    for (const p of d.programs) {
      if (!/^muzzle_.*_zoom$/.test(p.name) || /turret|law|m203/i.test(p.name)) continue;
      for (const q of p.sequences) for (const o of q.ops) if (o.op === 'call') calls.add(o.anim);
    }
    expect([...calls].sort()).toEqual(['shell_smoke_med', 'zoom_fire_silent', 'zoom_flash_fire']);
    const fx = new Effects(() => 0.5);
    fx.setData(d);
    expect(fx.play('muzzle_m4_zoom', { node: new Matrix4(), position: [7.8, 0.8, 0] })).toBe(true);
    expect(fx.lights.stats().started).toBe(1);
    expect(fx.stats().shown).toEqual([]);                 // no flash model in the aim view
  });

  it('starts the mission ambient effects: Frostfire tower flames at their scene node', async () => {
    const d = await load();
    expect(d.ambient).toEqual(['firey_flames']);
    const node = d.sceneNodes.find(([n]) => n === 'r_tower_flames');
    expect(node).toBeDefined();
    const fx = new Effects(() => 0.5);
    fx.setData(d);
    const camera = new PerspectiveCamera();
    camera.position.set(node![1][12]!, node![1][13]! + 20, node![1][14]! + 100);
    camera.updateMatrixWorld();
    for (let i = 0; i < 30; i++) fx.update(1 / 30, camera);
    expect(fx.stats().ambient).toContain('firey_flames');
    expect(fx.stats().particles).toBeGreaterThan(20);
  });

  it('plays the surface\'s impact at the hit: sparks off METAL_THICK, the stone\'s dust and chunks off STONE', async () => {
    const d = await load();
    const sounds: string[] = [];
    const fx = new Effects(() => 0.1, (name) => sounds.push(name));
    fx.setData(d);
    const camera = new PerspectiveCamera();
    expect(fx.play('bullet_hit_metal_thick', { position: [0, 0, 0], velocity: [0, 0, -1], normal: [0, 0, 1] })).toBe(true);
    for (let i = 0; i < 3; i++) fx.update(1 / 60, camera);
    expect(sounds).toContain('.BUL_METAL');
    expect(fx.stats().emitted).toBeGreaterThan(0);
    const metal = fx.stats().emitted;
    expect(fx.play('BULLET_HIT_STONE', { position: [0, 0, 0], velocity: [0, 0, -1], normal: [0, 0, 1] })).toBe(true);
    for (let i = 0; i < 3; i++) fx.update(1 / 60, camera);
    expect(sounds).toContain('.BUL_STONE');
    expect(fx.stats().emitted).toBeGreaterThan(metal);
  });
});

/**
 * A browser adaptation (no original counterpart; the owner's 2026-11-06 report: "an audio bug that starts while the
 * browser is tabbed off and never recovers"): a hidden tab runs no animation frame, so the runs the socket's rounds start
 * are never stepped or retired, and on the return every one of them steps -- and sounds -- at once. The runs held are
 * capped (`MAX_EFFECT_RUNS_ADAPTATION`, the oldest retired first, silently) and the rounds' runs go at a return
 * (`retireRounds`). Presentation only: no damage, no wire, no game rule.
 */
describe.skipIf(!MP2)(`a hidden tab's round backlog (a browser adaptation)${MP2 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  let data: EffectData | null = null;
  const load = async (): Promise<EffectData> => (data ??= await effectsFromDisc(new FsAssetSource(FIXTURES), 'RUN/MP2.ZDB', 'MP2'));
  const M4A1_SD = { name: 'M4A1 SD', id: 0, fireAnim: 'muzzle_m4SD', sounds: { close: null, med: null, far: null, reload: null } };
  const node = new Matrix4().makeTranslation(0, 12, 0);
  /** Another player's round that struck the metal deck (an impact as well as the muzzle's casing). */
  const round = (k: number) => ({
    type: 'round' as const, weapon: M4A1_SD, from: [0, 12, 0] as [number, number, number], to: [k % 50, 0, 20] as [number, number, number],
    hit: true, rounds: 0, normal: [0, 1, 0] as [number, number, number], material: 25,
  });
  const seeded = () => { let r = 1; return () => ((r = (r * 9301 + 49297) % 233280) / 233280); };

  it('the cap stands well above the busiest visible match: 16 shooters, a round each every game frame, stepped at 60 Hz', async () => {
    const d = await load();
    const fx = new Effects(seeded());
    fx.setData({ ...d, ambient: [] });
    fx.setWorld(() => deck(25));
    const camera = new PerspectiveCamera();
    // An upper bound, not a game rate: a round per shooter per game frame (`GAME_FRAME_DT`, ~30 a second) is faster than
    // any firearm's; 16 shooters, every round a hit. Four seconds is past every run's life (the casing's 1.2 s).
    let peak = 0, sinceRound = 0, k = 0;
    for (let f = 0; f < 240; f++) {
      sinceRound += 1 / 60;
      while (sinceRound >= 525 / 15734) { sinceRound -= 525 / 15734; for (let s = 0; s < 16; s++) fx.onRound(round(k++), { node, muzzle: [7.8, 0.8, 0] }, false); }
      fx.update(1 / 60, camera);
      peak = Math.max(peak, fx.stats().runs);
    }
    expect(peak).toBeGreaterThan(0);
    expect(MAX_EFFECT_RUNS_ADAPTATION).toBeGreaterThanOrEqual(2 * peak);
  });

  it('a stalled frame loop: 1200 rounds unstepped hold no more runs than the cap, and the map\'s ambient runs stay', async () => {
    const d = await load();
    const sounds: string[] = [];
    const fx = new Effects(seeded(), (name) => sounds.push(name));
    fx.setData(d);                                                    // Frostfire's own `firey_flames`
    fx.setWorld(() => deck(25));
    const ambient = fx.stats().ambient;
    expect(ambient).toContain('firey_flames');
    let most = 0;
    for (let k = 0; k < 1200; k++) {
      fx.onRound(round(k), { node, muzzle: [7.8, 0.8, 0] }, false);
      most = Math.max(most, fx.stats().runs);
    }
    expect(most).toBeLessThanOrEqual(MAX_EFFECT_RUNS_ADAPTATION);
    expect(fx.stats().ambient).toEqual(ambient);
  });

  it('the review F1: a burst over the cap retires the rounds\' runs first -- a smoke grenade\'s screen, the oldest run, stays', async () => {
    const d = await load();
    const fx = new Effects(seeded());
    fx.setData({ ...d, ambient: [] });
    fx.setWorld(() => deck(25));
    const at: [number, number, number] = [100, 0, 100];
    const smoke = fx.run('smoke_grenade', { node: new Matrix4().makeTranslation(...at), position: at, normal: [0, 1, 0], velocity: [0, 0, 0] });
    expect(smoke).not.toBeNull();
    const camera = new PerspectiveCamera();
    for (let i = 0; i < 30; i++) fx.update(1 / 30, camera);           // a second in: its stream pours
    const before = fx.stats().played['smoke_stream'];
    expect(before).toBe(1);
    const streams = (): number => (fx as unknown as { runs: { finished: boolean; program: { name: string } }[] }).runs
      .filter((r) => !r.finished && r.program.name.toLowerCase() === 'smoke_stream').length;
    expect(streams()).toBe(1);
    for (let k = 0; k < 1200; k++) fx.onRound(round(k), { node, muzzle: [7.8, 0.8, 0] }, false);
    expect(fx.stats().runs).toBeLessThanOrEqual(MAX_EFFECT_RUNS_ADAPTATION);
    expect(streams()).toBe(1);                                        // the screen still pours
  });

  it('a visible return: retireRounds lets the rounds\' runs and tracers go without a sound; the next frame sounds as a quiet map\'s', async () => {
    const d = await load();
    const camera = new PerspectiveCamera();
    const quietSounds: string[] = [];
    const quiet = new Effects(seeded(), (name) => quietSounds.push(name));
    quiet.setData(d);
    quiet.setWorld(() => deck(25));
    quiet.update(0.1, camera);
    const sounds: string[] = [];
    const fx = new Effects(seeded(), (name) => sounds.push(name));
    fx.setData(d);
    fx.setWorld(() => deck(25));
    const base = fx.stats().runs;
    for (let k = 0; k < 1200; k++) fx.onRound({ ...round(k), tracer: true, tracerKind: 'ally' }, { node, muzzle: [7.8, 0.8, 0] }, false);
    expect(fx.stats().runs).toBeGreaterThan(base);
    const before = sounds.length;
    fx.retireRounds();
    expect(sounds.length).toBe(before);                               // retired silently
    expect(fx.stats().runs).toBe(base);                               // the ambient runs alone
    expect(fx.stats().tracers).toEqual([]);
    expect(fx.stats().ambient).toEqual(quiet.stats().ambient);
    fx.update(0.1, camera);
    expect(sounds.length - before).toBe(quietSounds.length);
  });
});

/**
 * ROUND_END_EFFECTS_READING (research 283 §9): the round's end stops what plays. `FUN_002aa910` (run at the online round's
 * end, `FUN_002a9b30` D:L150626/D:L150668) stops every run of the `common` and `mission` zAnim sets (D:L151211-151218,
 * `FUN_0026c2e0` D:L116144-116180 -> `FUN_0026fe90`) and ages every live particle past its life (D:L151219,
 * `FUN_00326fb0` D:L225075-225083). The page keeps the map's ambient runs (whether the original restarts its ambient
 * animations is unread: the reading), whose sources pour again.
 */
describe('ROUND_END_EFFECTS_READING: Effects.clearRound()', () => {
  const wait = (seconds: number): EffectOp => ({ op: 'wait', seconds, range: 0, frames: null });
  const prog = (name: string, ops: EffectOp[]): EffectProgram => ({ name, root: 0, flags: 0, nodes: ['NA'], sequences: [{ name: 's0', activation: 1, ops }] });
  it('every run stopped but the map\'s ambient ones and what they called, silently', () => {
    const heard: string[] = [];
    const fx = new Effects(() => 0.5, (name) => heard.push(name));
    fx.setData({
      archive: 'T', models: [], textures: [], absent: [], materials: ['UNKNOWN'], defaultMaterial: 0, marks: [], footprints: [],
      ambient: ['amb'], sceneNodes: [], hitAnims: [], missing: [],
      programs: [
        prog('amb', [{ op: 'call', anim: 'amb_child' }, wait(100)]), prog('amb_child', [wait(100)]),
        prog('smoke', [{ op: 'call', anim: 'stream' }, wait(100)]), prog('stream', [wait(100)]),
        prog('late', [wait(1), { op: 'sound', sound: '.GREN_MED', node: 0, volume: 1 }, wait(100)]),
      ],
    });
    const camera = new PerspectiveCamera();
    fx.play('smoke', { node: new Matrix4(), position: [0, 0, 0] });
    fx.play('late', { node: new Matrix4(), position: [0, 0, 0] });
    fx.update(1 / 30, camera);
    expect(fx.stats().runs).toBe(5);                    // smoke, stream, late, amb, amb_child
    fx.clearRound();
    fx.update(1 / 30, camera);
    expect(fx.stats().runs).toBe(2);                    // amb and amb_child
    expect(fx.stats().ambient).toEqual(['amb']);
    for (let i = 0; i < 60; i++) fx.update(1 / 30, camera);
    expect(heard).toEqual([]);                          // the stopped run plays nothing more
  });
});

describe.skipIf(!MP2)(`ROUND_END_EFFECTS_READING on the game's data${MP2 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it('a blast\'s and a smoke\'s particles gone at once, the map\'s flames kept and pouring again', async () => {
    const d = await effectsFromDisc(new FsAssetSource(FIXTURES), 'RUN/MP2.ZDB', 'MP2');
    const fx = new Effects(() => 0.5, () => {});
    fx.setData(d);
    const camera = new PerspectiveCamera();
    camera.position.set(40, 60, 140);
    camera.updateMatrixWorld();
    const ambient = fx.stats().ambient;
    expect(ambient.length).toBeGreaterThan(0);
    const base = fx.stats().runs;
    fx.play('smoke_grenade', { position: [40, 50, 40], normal: [0, 1, 0], velocity: [0, 0, 0] });
    for (let i = 0; i < 90; i++) fx.update(1 / 30, camera);
    expect(fx.stats().runs).toBeGreaterThan(base);
    expect(fx.stats().particles).toBeGreaterThan(0);
    fx.clearRound();
    expect(fx.stats().particles).toBe(0);
    fx.update(1 / 30, camera);
    expect(fx.stats().runs).toBe(base);
    expect(fx.stats().ambient).toEqual(ambient);
  });
});
