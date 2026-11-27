import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { bench, describe } from 'vitest';
import { Scene, type Mesh } from 'three';
import { FsAssetSource } from '@s2u/archive/node';
import type { ZAnimLight } from '@s2u/scene';
import { EYE_HEIGHT_W1R2 } from '../src/body';
import { effectsFromDisc } from '../src/effectData';
import { EffectLights } from '../src/effectLights';
import { loadMap } from '../src/loadMap';
import { freezeSceneMatrix } from '../src/sceneMatrix';
import { buildWorld } from '../src/world';

/**
 * LATER 882: what one effect light's start costs the CPU -- a shot by another player begins its muzzle light
 * (`Effects`' `light` op, effects.ts:1319-1334 -> `EffectLights.begin`, effectLights.ts:310), in Node (no browser, no
 * GPU). A product-track instrument with no original: it measures the port's own code and changes nothing the game or
 * the page does.
 *
 * The world is MP2's as the page builds it: `loadMap`, `buildWorld`, every reveal task run (as `effectLightPrograms.test.ts`),
 * the group under a frozen scene (`freezeSceneMatrix`, as main.ts and matchMount.ts). The lights as the page sets them:
 * the receivers the world's group (the page adds its own body and held kit, matchFirearm.ts:943 -- not here), the disc's
 * `light_map.tif`, the pre-warm run (`warmMeshes`, `warmHide`, `warmDone`, as `effectLightsCull.test.ts`'s rig). The
 * light is the disc's `light_at_muzzle` (the first program carrying that sequence); a disc without one falls back to
 * `muzzleTrack.test.ts`'s copy of `flash_fire_hider`'s, and the printed line says which. Each start is at a spawn slot,
 * at the eye height (`EYE_HEIGHT_W1R2`), cycling every slot.
 *
 * Timed apart, per call: (1) `begin` whole -- the live list held full at `MAX_LIGHTS` (each start ends the oldest, as a
 * firefight does), so it includes that end and the overlays' refresh; (2) the receiver walk alone (`receiverMeshes`,
 * effectLights.ts:223-237, private: called through a cast) -- `updateWorldMatrix(true, true)` and the visible traverse;
 * (3) `updateWorldMatrix(true, true)` alone on the world's group. `begin` less the walk is its sphere filter
 * (`boundsOf`'s sphere clones) plus the pairing and refresh. Printed: the objects the traverse visits, the meshes the
 * walk returns, and the overlays one start shows (its reach) at each slot. Not measured: `update`, the GPU's passes.
 * No time is asserted. Run (from socomlegacy/packages/viewer, SOCOM_DISC or SOCOM_PC_ROOT set):
 * `npx vitest bench --run test/lightStartCost.bench.ts`. Without the disc it benches nothing and says so.
 */

const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const NEEDS = ['RUN/MP2.ZDB'];
const HAVE_DISC = DISC !== '' && NEEDS.every((p) => existsSync(join(DISC, p)));
const SKIP = HAVE_DISC ? '' : ` -- SKIPPED: no disc (SOCOM_DISC or SOCOM_PC_ROOT/game/disc, needs ${NEEDS.join(', ')})`;
if (!HAVE_DISC) console.info(`LIGHT_START_COST${SKIP}`);

type Programs = Awaited<ReturnType<typeof effectsFromDisc>>['programs'];
type Vec3 = [number, number, number];

/** The disc's `light_at_muzzle` light op (`{ op: 'light'; light }`, scene/src/effects.ts:285), or null. */
function muzzleLight(programs: Programs): { light: ZAnimLight; from: string } | null {
  for (const p of programs) for (const s of p.sequences) for (const o of s.ops) {
    if (o.op === 'light' && s.name.toLowerCase() === 'light_at_muzzle') return { light: o.light, from: `${p.name}/${s.name}` };
  }
  return null;
}

/** The stand-in: `muzzleTrack.test.ts`'s `GLOW` (its node null, as `effectLightsCull.test.ts`'s `light`). */
const STAND_IN = {
  flags: 0x4ea, node: null, atContext: true, offset: [0, 0, 0], rgb: [204, 173, 120], opacity: 51.2, blend: 0x44,
  ranges: [[0, 6, 26], [0.07, 50, 100]], duration: 0.07,
} as unknown as ZAnimLight;

const rig = HAVE_DISC ? await (async () => {
  const source = new FsAssetSource(DISC);
  const map = await loadMap(source, 'RUN/MP2.ZDB');                                      // loadMap.ts:456
  const view = buildWorld(map);                                                          // world.ts:456
  for (const task of [...view.revealWorld, ...view.revealProps]) task();                // effectLightPrograms.test.ts:179
  const scene = new Scene();
  freezeSceneMatrix(scene);                                                              // sceneMatrix.ts:23
  scene.add(view.group);
  scene.updateMatrixWorld();
  const fx = await effectsFromDisc(source, 'RUN/MP2.ZDB', 'MP2');                        // effectData.ts:122; effectLightsCull.test.ts:265
  const found = muzzleLight(fx.programs);
  const lights = new EffectLights();                                                     // effectLights.ts:183
  lights.setReceivers(() => [view.group]);                                               // effectLights.ts:188
  lights.setTexture(fx.textures.find(([n]) => n.toLowerCase() === 'light_map.tif')?.[1] ?? null);   // effectLights.ts:193
  lights.warmMeshes(); lights.warmHide(); lights.warmDone();                             // effectLights.ts:276, 293, 299
  const fallback: Vec3 = map.body?.at?.position ?? [0, 0, 0];
  const spots: Vec3[] = (map.slots.length ? map.slots.map((s) => s.position) : [fallback])
    .map((p): Vec3 => [p[0], p[1] + EYE_HEIGHT_W1R2, p[2]]);
  const walk = (lights as unknown as { receiverMeshes(hidden?: boolean): Mesh[] }).receiverMeshes.bind(lights);
  return { view, lights, spots, walk, light: found?.light ?? STAND_IN, from: found?.from ?? 'stand-in (muzzleTrack.test.ts GLOW)' };
})() : null;

function perCallUs(calls: number, f: () => void): number {
  for (let i = 0; i < 20; i++) f();
  const t0 = performance.now();
  for (let i = 0; i < calls; i++) f();
  return Math.round(((performance.now() - t0) * 1000 * 100) / calls) / 100;
}

let next = 0;
const start = (): void => {
  const r = rig!;
  r.lights.begin(r.light, r.spots[next++ % r.spots.length]!, () => true);              // effectLights.ts:310
};
const walkOnly = (): void => { rig!.walk(); };
const matrices = (): void => { rig!.view.group.updateWorldMatrix(true, true); };

if (rig) {
  let visited = 0;
  rig.view.group.traverseVisible(() => { visited++; });
  const reach = rig.spots.map((at) => { rig.lights.clear(); rig.lights.begin(rig.light, at, () => true); return rig.lights.stats().overlays; });
  rig.lights.clear();
  const report = {
    unit: 'us per call', map: 'MP2', light: rig.from, slots: rig.spots.length, objectsVisited: visited, meshesWalked: rig.walk().length,
    reach: { min: Math.min(...reach), max: Math.max(...reach), mean: Math.round((reach.reduce((a, b) => a + b, 0) / reach.length) * 10) / 10 },
    begin: perCallUs(300, start), walk: perCallUs(300, walkOnly), updateWorldMatrix: perCallUs(300, matrices), node: process.version,
  };
  console.log(`LIGHT_START_COST ${JSON.stringify(report)}`);
}

describe.skipIf(!rig)(`LATER 882: one effect light's start on MP2's world${SKIP}`, () => {
  bench('EffectLights.begin (a muzzle light, live list full)', start, { time: 1500, warmupTime: 300 });
  bench('the receiver walk alone (receiverMeshes)', walkOnly, { time: 1500, warmupTime: 300 });
  bench("updateWorldMatrix(true, true) on the world's group", matrices, { time: 1500, warmupTime: 300 });
});
