// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Matrix4, Scene } from 'three';
import { GAME_FRAME_DT, M67, NODE_CALLER, type EffectProgram, type ThrowableRecord } from '@s2u/scene';
import { FlyCamera } from '../src/camera';
import type { EffectData } from '../src/effectData';
import { Effects, type Vec3 } from '../src/effects';
import { Hud } from '../src/hud';
import { PlayerLoadout } from '../src/loadout';
import { EXPLOSION_SHAKES, type Shake } from '../src/look';
import { actionHands, type MatchActions } from '../src/matchActions';
import { mountFirearm, type MatchFirearm } from '../src/matchFirearm';
import { mountThrowables, type MatchThrowDeps } from '../src/matchThrow';
import { Play } from '../src/play';
import { RemotePlayers } from '../src/remotePlayers';
import { WalkMode, type PlaySnapshot } from '../src/walk';

/**
 * BLAST-T: the planted bomb's camera shake through the real parts, not `blastPointShake` called by hand
 * (`./bombBlastEffect.test.ts` holds the effects' half and the disc reads). The test re-creates the pages' wiring
 * (`./main` and `./matchMount`: `mountThrowables`, then `mountFirearm` with `hands: throws.hands(actionHands(...))`),
 * and the source pin at the end holds both pages to that wiring:
 * the script round's explosion in `Effects` (`FUN_003c8330` D:L319186-319195: an item not on its list sets the camera's
 * pending blast point) -> the listener `mountFirearm` hands `Effects.setBlastPoint` (`hands.blast`) -> the throwables'
 * `blast` -> `blastPointShake` by the SEAL's feet -> `fly.shakeScreen` with `explosionShake`'s preset.
 *
 * The bands (`FUN_00550ef0`, research 83): the squared distance from the pending point is tested `<` against
 * `DAT_0064fc88`, `DAT_0064fc90`, `DAT_0064fc98` in turn (D:L418102, D:L418105, D:L418108) -- floats 10000, 40000 and
 * 360000 in `socom2_game.elf`'s data (100^2, 200^2, 600^2): strictly inside 100 the big preset (2), inside 200 the
 * middle (1), inside 600 the small (0), at 600 or past it none. Reading, pending review.
 *
 * Only what a test cannot build is stubbed: the match's audio (the throwables' sound door), the SEAL's feet
 * (`WalkMode.snapshot`, which needs a loaded map) and the action part behind `actionHands` (no turret mounted: every
 * `pageHands` answer false or null, so the throwables' own answer stands). Every hop is the real code.
 */

afterEach(() => { vi.restoreAllMocks(); });

/** MPBOMB as the disc holds it (`zweapon.rdr` item 154; `./bombBlastEffect.test.ts`'s disc test holds the read). */
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
const BOMB: Vec3 = [10, 20, 30];
const at = (p: Vec3) => ({ node: new Matrix4().makeTranslation(...p), position: [...p] as Vec3, normal: [0, 1, 0] as Vec3 });

/**
 * Where the script round goes off: it falls under MPBOMB's gravity for its frames (`FUN_003ca5a0` D:L320297-320379), so
 * the point is read off a bare `Effects` (the same code, no random in the round's flight) and the SEAL is placed from it.
 */
function blastPoint(): Vec3 {
  const fx = new Effects(() => 0.5);
  fx.setData(synthetic());
  const points: Vec3[] = [];
  fx.setBlastPoint((p) => points.push([...p]));
  fx.play('base_explosion1', at(BOMB));
  for (let k = 0; k < 6; k++) fx.update(GAME_FRAME_DT, null);
  expect(points).toHaveLength(1);
  return points[0]!;
}

/** The page's assembly: the throwables' part and the one firearm with its hands, as `./main` and `./matchMount` wire them. */
function page() {
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined;
  c.releasePointerCapture = () => undefined;
  c.hasPointerCapture = () => false;
  const scene = new Scene();
  const fly = new FlyCamera(c);
  const walk = new WalkMode(fly);
  const play = new Play();
  const loadouts = new PlayerLoadout();
  let feet: Vec3 | null = null;
  vi.spyOn(walk, 'snapshot').mockImplementation(() => (feet ? { feet: [...feet] } as unknown as PlaySnapshot : null));
  const shakes: Shake[] = [];
  vi.spyOn(fly, 'shakeScreen').mockImplementation((s) => { shakes.push(s); });
  let firearm: MatchFirearm | null = null;
  /** The action part with nothing mounted (`MatchActions.pageHands`): asked at each call, as on the pages. */
  const acts = { pageHands: {
    trigger: () => false, magazine: () => null, mounted: () => false, icon: () => null, fireMode: () => null, weapon: () => null,
    reload: () => false, thermal: () => false, turret: () => null, mountTaken: () => null, commandSeq: () => null,
  } } satisfies Pick<MatchActions, 'pageHands'>;
  const throws = mountThrowables({
    scene, walk, fly, play, loadouts, view: () => null, map: () => null, net: () => null, firearm: () => firearm!,
    audio: { onAnimCallback: () => null, onFire: () => null, play: () => {} } as unknown as MatchThrowDeps['audio'],
  });
  firearm = mountFirearm({
    scene, fly, walk, play, loadouts, remote: new RemotePlayers(scene), hud: new Hud(), view: () => null, map: () => null,
    body: () => null, net: () => null, blocked: () => false, refreshFog: () => {}, hands: throws.hands(actionHands(() => acts)),
  });
  const fa = firearm;
  /** `base_explosion1` at the bomb, the page's frames stepped (`effectsFrame`, the page's per-frame call) past the blast. */
  const detonate = (seal: Vec3 | null, record: ThrowableRecord = MPBOMB): Shake[] => {
    feet = seal;
    fa.effects.setData(synthetic(record));
    expect(fa.effects.play('base_explosion1', at(BOMB))).toBe(true);
    for (let k = 0; k < 6; k++) fa.effectsFrame(GAME_FRAME_DT, fly.camera);
    expect(fa.effects.stats().played['satchel']).toBe(1);   // the explosion drew, whatever the shake
    return shakes;
  };
  return { detonate, dispose: () => { throws.dispose(); } };
}

/** The SEAL `d` units from the blast point along x. */
const sealAt = (p: Vec3, d: number): Vec3 => [p[0] + d, p[1], p[2]];

describe("BLAST-T: the planted bomb's blast point reaches the camera through the page's assembly", () => {
  it('one shake, on the blast frame, with the big preset for a SEAL ~50 u away (Effects -> mountFirearm -> hands.blast -> fly.shakeScreen)', () => {
    const p = page();
    const shakes = p.detonate(sealAt(blastPoint(), 50));
    expect(shakes).toEqual([EXPLOSION_SHAKES[2]]);
    p.dispose();
  });

  it.each([
    [50, 2], [150, 1], [500, 0],
  ] as const)('a SEAL %d u away: preset %d', (d, preset) => {
    const p = page();
    expect(p.detonate(sealAt(blastPoint(), d))).toEqual([EXPLOSION_SHAKES[preset]]);
    p.dispose();
  });

  it('past 600 u, and with no SEAL, no shake', () => {
    const a = page();
    expect(a.detonate(sealAt(blastPoint(), 710))).toEqual([]);
    a.dispose();
    const b = page();
    expect(b.detonate(null)).toEqual([]);
    b.dispose();
  });

  // FUN_00550ef0 D:L418102/418105/418108: strict `<` on the squared distance against 100^2, 200^2, 600^2.
  it.each([
    [99.9, EXPLOSION_SHAKES[2]], [100, EXPLOSION_SHAKES[1]], [100.1, EXPLOSION_SHAKES[1]],
    [199.9, EXPLOSION_SHAKES[1]], [200, EXPLOSION_SHAKES[0]], [200.1, EXPLOSION_SHAKES[0]],
    [599.9, EXPLOSION_SHAKES[0]], [600, null], [600.1, null],
  ] as const)('the bands at their edges: %d u', (d, preset) => {
    const p = page();
    expect(p.detonate(sealAt(blastPoint(), d))).toEqual(preset ? [preset] : []);
    p.dispose();
  });

  it("an item on FUN_003c8330's list (D:L319186-319191) shakes nothing through the chain: the record's id rides the round", () => {
    const p = page();
    expect(p.detonate(sealAt(blastPoint(), 50), { ...MPBOMB, id: 0x7a })).toEqual([]);
    p.dispose();
  });
});

describe("BLAST-T: both pages hand the throwables' hands to the one firearm (the wiring the test above re-creates)", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  it.each(['main.ts', 'matchMount.ts'])('%s: mountFirearm({ ... hands: throws.hands(actionHands(() => acts)) ... })', (file) => {
    const src = readFileSync(resolve(here, '../src', file), 'utf8');
    const mount = src.indexOf('mountFirearm({');
    expect(mount).toBeGreaterThan(-1);
    const call = src.slice(mount, src.indexOf('});', mount));   // the call's argument object, to its close
    expect(call).toContain('hands: throws.hands(actionHands(() => acts)),');
    expect(src.indexOf('mountThrowables({')).toBeGreaterThan(-1);
    expect(src.indexOf('mountThrowables({')).toBeLessThan(mount);
  });
});
