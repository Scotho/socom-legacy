import { describe, expect, it } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Box3, Object3D, PerspectiveCamera, Vector3 } from 'three';
import { FsAssetSource } from '@s2u/archive/node';
import { NODE_CALLER, NODE_ROOT, type EffectProgram, type ObjectMotion } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { effectsFromDisc, type EffectData } from '../src/effectData';
import { Effects } from '../src/effects';
import type { FireEvent } from '../src/fire';

/**
 * MUZZLE-TRACK (socomlegacy/docs/research/149): the muzzle fire tracks the gun while the SEAL runs, jumps and shoots. The
 * engine hands a muzzle animation its caller's node by pointer (`FUN_00272c30` case 3, D:L120469-120478) and its
 * position by value (case 5, D:L120520-120531); `OBJECT_TRANSLATE_STATE`'s tick (`FUN_00263890`, D:L111288-111346)
 * resolves the caller afresh every tick (`FUN_0026f4e0` 0xfa -> `FUN_00272390`, D:L118164-118168, D:L119952-119970)
 * and carries the position through the node's matrix as it is then -- so `flash_fire_hider`'s `fire_fix` LOOP re-places
 * the flash at the gun each frame -- while `OBJECT_MOTION` reads the launch frame once at its begin (`FUN_00262690`,
 * D:L110660) and its tick moves only the thrown node (`FUN_00261370`, D:L109963): the casing keeps its world path.
 * The `LIGHT` tick (`FUN_00264cb0`, D:L111995-112031) recomputes the light's place each tick the same way.
 */

type Vec3 = [number, number, number];

const FIXTURES = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'));
const MP2 = fixture('RUN/MP2.ZDB');

/** The M4A1's `firepoint` in the weapon's frame (research 79 §2.2: 7.785 along the barrel, 0.834 up). */
const MUZZLE: Vec3 = [7.785, 0.834, 0];

const data = (programs: EffectProgram[]): EffectData => ({
  archive: 'T', models: [], textures: [], absent: [], materials: ['UNKNOWN'], defaultMaterial: 0, marks: [], footprints: [],
  ambient: [], sceneNodes: [], hitAnims: [], missing: [], programs,
});

/** `flash_fire_hider`'s `fire_fix` as MP2's CZANIM carries it (rotate and translate at the caller, flag 2, once a tick), and its end. */
const FLASH: EffectProgram = {
  name: 'flash', root: 1, flags: 0, nodes: ['NA', 'flash_model'],
  sequences: [
    { name: 'fire_fix', activation: 1, ops: [
      { op: 'rotate', node: NODE_ROOT, ref: NODE_CALLER, flags: 2, xyz: [0, 0, 0] },
      { op: 'translate', node: NODE_ROOT, ref: NODE_CALLER, flags: 2, xyz: [0, 0, 0] },
      { op: 'active', node: NODE_ROOT, on: true },
      { op: 'loop', count: -1, seconds: null },
    ] },
    { name: 'fire_end', activation: 1, ops: [
      { op: 'wait', seconds: 0, range: 0, frames: 4 },
      { op: 'stopSequence', sequence: 'fire_fix' },
      { op: 'active', node: NODE_ROOT, on: false },
    ] },
  ],
};

/** A casing: launched from the caller's origin along the caller's +z at 60 u/s, no gravity, for a second (`shell_eject`'s shape). */
const THROW: ObjectMotion = {
  flags: 0x1 | 0x8, node: NODE_ROOT, frame: NODE_CALLER,
  launch: { azimuth: 0, zenith: 0, speed: 60, accel: 0 }, range: { azimuth: 0, zenith: 0, speed: 0, accel: 0 },
  direction: [0, 0, 1], gravityScale: 0, terminal: 0, callerVelocity: 0, bounce: 0, tolerance: 0, lifetime: 1, refSpeed: 0,
  sound: null, tumble: null, angular: null, materials: [],
};
const SHELL: EffectProgram = {
  name: 'shell', root: 1, flags: 0, nodes: ['NA', 'shell_model'],
  sequences: [{ name: 'NA', activation: 1, ops: [
    { op: 'active', node: NODE_ROOT, on: true },
    { op: 'translate', node: NODE_ROOT, ref: NODE_CALLER, flags: 0, xyz: [0, 0, 0] },
    { op: 'motion', motion: THROW },
    { op: 'active', node: NODE_ROOT, on: false },
  ] }],
};

/** `flash_fire_hider`'s `light_at_muzzle`: flags 0x4ea -- the context's position (8) through the caller's node (2). */
const GLOW: EffectProgram = {
  name: 'glow', root: 0, flags: 0, nodes: ['NA'],
  sequences: [{ name: 'light_at_muzzle', activation: 1, ops: [{ op: 'light', light: {
    flags: 0x4ea, node: NODE_CALLER, atContext: true, offset: [0, 0, 0], rgb: [204, 173, 120], opacity: 51.2, blend: 0x44,
    ranges: [[0, 6, 26], [0.07, 50, 100]], duration: 0.07,
  } }] }],
};

/** A gun somewhere, its barrel along +x, carried by `move` -- a stride, a turn, the jump's rise. */
function gun(): Object3D {
  const g = new Object3D();
  g.position.set(100, 10, 0);
  return g;
}
const muzzleOf = (g: Object3D): Vector3 => { g.updateMatrixWorld(true); return g.localToWorld(new Vector3(...MUZZLE)); };

describe('the muzzle fire follows the gun (research 149; FUN_00263890 D:L111288-111346)', () => {
  it("a flash played with the weapon's node is drawn at the node's muzzle on every frame it lives, as the node moves and turns", () => {
    const fx = new Effects(() => 0.5);
    fx.setData(data([FLASH]));
    const g = gun();
    expect(fx.play('flash', { node: g, position: MUZZLE })).toBe(true);
    const camera = new PerspectiveCamera();
    const flash = () => fx.object.children.find((o) => o.name === 'flash');
    const drawnAtMuzzle = (): void => {
      const f = flash()!;
      expect(f).toBeDefined();
      expect(f.visible).toBe(true);
      expect(f.getWorldPosition(new Vector3()).distanceTo(muzzleOf(g))).toBeLessThan(1e-3);
    };
    fx.update(1 / 60, camera);
    drawnAtMuzzle();
    g.position.set(104, 12, -3);                 // a stride on, the jump's rise
    g.rotation.y = Math.PI / 2;                  // the body turned
    fx.update(1 / 60, camera);
    drawnAtMuzzle();
    g.position.set(108, 11, -6);
    fx.update(1 / 60, camera);
    drawnAtMuzzle();
    const f = flash()!;
    expect(f.quaternion.angleTo(g.quaternion)).toBeLessThan(1e-6);   // turned as the weapon (rotate, ref the caller)
    fx.update(1 / 60, camera);                   // fire_end's fourth frame: fire_fix stopped, the flash hidden, the run over
    expect(flash()).toBeUndefined();
  });

  it('a casing launched from the node keeps its own world path once the node has moved on (FUN_00262690 D:L110660; FUN_00261370 D:L109963)', () => {
    const fx = new Effects(() => 0.5);
    fx.setData(data([SHELL]));
    const g = gun();
    expect(fx.play('shell', { node: g, position: MUZZLE })).toBe(true);
    const camera = new PerspectiveCamera();
    const shell = () => fx.object.children.find((o) => o.name === 'shell')!;
    expect(shell().position.toArray()).toEqual([100, 10, 0]);        // launched at the caller's origin (translate, flag 0, ref the caller)
    g.position.set(200, 10, 0);                                       // the gun a hundred units on
    fx.update(0.1, camera);
    const p = shell().position;
    expect(p.x).toBeCloseTo(100, 6);                                  // not carried with the gun...
    expect(p.z).toBeCloseTo(6, 6);                                    // ...on its own path: 60 u/s along the launch frame's +z
    fx.update(0.1, camera);
    expect(shell().position.z).toBeCloseTo(12, 6);
  });

  it("a muzzle light is re-placed at the context's position through the node each tick (FUN_00264cb0 D:L111995-112031)", () => {
    const fx = new Effects(() => 0.5);
    fx.setData(data([GLOW]));
    const g = gun();
    expect(fx.play('glow', { node: g, position: MUZZLE })).toBe(true);
    const camera = new PerspectiveCamera();
    const at = () => new Vector3(...fx.lights.stats().at[0]!);
    expect(at().distanceTo(muzzleOf(g))).toBeLessThan(1e-3);          // at the muzzle, not the grip
    g.position.set(104, 12, -3);
    g.rotation.y = Math.PI / 2;
    fx.update(1 / 60, camera);
    expect(fx.lights.stats().live).toBe(1);
    expect(at().distanceTo(muzzleOf(g))).toBeLessThan(1e-3);
  });

  it("a round's muzzle animation takes the weapon's node itself, so the flash follows it (FUN_005c5340 D:L479478)", () => {
    const fx = new Effects(() => 0.5);
    fx.setData(data([FLASH]));
    const g = gun();
    const event: FireEvent = {
      type: 'round', weapon: { name: 'M4A1', id: 54, fireAnim: 'flash', sounds: { close: null, med: null, far: null, reload: null } },
      from: [107.8, 10.8, 0], to: [500, 10.8, 0], hit: false, rounds: 29,
    };
    fx.onRound(event, { node: g, muzzle: MUZZLE }, false);
    const camera = new PerspectiveCamera();
    fx.update(1 / 60, camera);
    g.position.set(110, 14, 0);
    fx.update(1 / 60, camera);
    const f = fx.object.children.find((o) => o.name === 'flash')!;
    expect(f.getWorldPosition(new Vector3()).distanceTo(muzzleOf(g))).toBeLessThan(1e-3);
  });
});

describe.skipIf(!MP2)(`MP2's flash_fire_hider follows the rifle, shell_eject's casing does not${MP2 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  let data: EffectData | null = null;
  const load = async (): Promise<EffectData> => (data ??= await effectsFromDisc(new FsAssetSource(FIXTURES), 'RUN/MP2.ZDB', 'MP2'));

  it('the muzzle_flash_hider model moves with the node between frames; the casing flies on from where the gun was', async () => {
    const d = await load();
    let r = 0;
    const fx = new Effects(() => ((r = (r * 9301 + 49297) % 233280) / 233280));
    fx.setData({ ...d, ambient: [] });
    const g = gun();                                                  // the barrel along +x
    expect(fx.play('muzzle_m4', { node: g, position: MUZZLE, velocity: [1, 0, 0] })).toBe(true);
    const camera = new PerspectiveCamera();
    fx.update(0.02, camera);
    expect(fx.stats().shown).toContain('muzzle_flash_hider');
    const flash = () => fx.object.children.find((c) => c.name === 'muzzle_flash_hider')!;
    const box = new Box3().setFromObject(flash());
    expect(box.min.x).toBeGreaterThan(107);                           // the model starts at the muzzle and reaches along the barrel
    expect(box.max.x - box.min.x).toBeGreaterThan(2);
    const first = flash().getWorldPosition(new Vector3());
    expect(first.distanceTo(muzzleOf(g))).toBeLessThan(1e-3);         // its origin on the muzzle...
    expect(fx.stats().flashAt).toEqual([first.x, first.y, first.z]);  // (what the browser spec reads)
    const casing = fx.stats().lastShell!.position;
    g.position.set(100, 10, 30);                                      // the SEAL a long stride to +z
    fx.update(0.02, camera);
    expect(fx.stats().shown).toContain('muzzle_flash_hider');
    const second = flash().getWorldPosition(new Vector3());
    expect(second.distanceTo(muzzleOf(g))).toBeLessThan(1e-3);        // ...and still on it a stride later
    expect(second.z - first.z).toBeCloseTo(30, 6);
    const casingNow = fx.stats().lastShell!.position;
    expect(Math.abs(casingNow[2] - casing[2])).toBeLessThan(5);       // the casing on its own flight, not 30 units over
  });
});
