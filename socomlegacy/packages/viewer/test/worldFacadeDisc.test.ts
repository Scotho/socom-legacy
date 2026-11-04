// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LineSegments, Matrix4, Mesh, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { CAMPAIGN_STEMS, parseZdb, Zar, zdbMember } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { facadeOf, flattenScene, parseSceneGraph, placeInstances } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { loadMap, type LoadedMap, type LoadedMesh } from '../src/loadMap';
import { buildWorld } from '../src/world';
import { facadeRows } from '../src/facade';
import { applyLighting, DEFAULT_LIGHTING } from '../src/lighting';

/**
 * FACADES-2 (PARITY-2; LATER 112, 113, 114) on the maps themselves: the draw walk turns every node with facade bits, world
 * model or prop (`FUN_003389c0` D:L236080-236081 -> `FUN_00317fc0` D:L216502-216595), keys an alpha-pass visual by its
 * centroid through that turned matrix (`FUN_003371b0` D:L235314-235317) and lights it through the same matrix
 * (`FUN_003b6d10` D:L308338-308339, `FUN_003b6870` D:L308207-308208). Off the dev disc (`SOCOM_DISC`, else
 * `<SOCOM_PC_ROOT>/game/disc`; skipped -- and said so -- without it; with it, a map file missing is a failure). The
 * fixtures' case holds the maps with no world-model facade node unchanged.
 */

type V3 = [number, number, number];
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const HAVE_DISC = DISC !== '';
const WORLD = 'worldmodel';

const load = async (stem: string): Promise<LoadedMap> => {
  const file = join(DISC, 'RUN', `${stem}.ZDB`);
  expect(existsSync(file), `${file} on the dev disc`).toBe(true);
  return loadMap(new FsAssetSource(DISC), `RUN/${stem}.ZDB`);
};
const built = (map: LoadedMap) => {
  const view = buildWorld(map);
  for (const task of [...view.revealWorld, ...view.revealProps]) task();
  return { view, meshes: view.group.children.filter((c): c is Mesh => c instanceof Mesh) };
};
const cameraAt = (at: V3): PerspectiveCamera => {
  const camera = new PerspectiveCamera();
  camera.position.set(...at);
  camera.updateMatrixWorld();
  return camera;
};
/** The placements of the facade props drawn from the world model's own nodes, as (prop, placement index). */
const worldFacades = (map: LoadedMap) => map.props.filter((p) => p.facade !== 0 && p.modelName === WORLD)
  .flatMap((prop) => Array.from({ length: prop.matrices.length / 16 }, (_, i) => ({ prop, i, path: prop.paths?.[i] ?? '' })));
const originOf = (matrices: Float32Array, i: number): V3 => [matrices[i * 16 + 12]!, matrices[i * 16 + 13]!, matrices[i * 16 + 14]!];
/** The billboard mesh drawing `part` at `origin`: its geometry is the part's own positions, its position the node's origin. */
const meshOf = (meshes: Mesh[], part: LoadedMesh, origin: V3): Mesh | undefined =>
  meshes.find((m) => samePositions(m, part.positions) && m.position.distanceTo(new Vector3(...origin)) < 1e-3);
/** The mesh's positions are the part's, float for float (CPS H12: a copy in an interleaved buffer, not the part's array). */
function samePositions(m: Mesh, positions: Float32Array): boolean {
  const a = m.geometry.getAttribute('position');
  if (a.count * 3 !== positions.length) return false;
  for (let i = 0; i < a.count; i++) for (let k = 0; k < 3; k++) if (!Object.is(a.getComponent(i, k), positions[i * 3 + k])) return false;
  return true;
}

describe.skipIf(!HAVE_DISC)(`FACADES-2 on the dev disc${HAVE_DISC ? '' : ' (no dev disc: SOCOM_DISC or SOCOM_PC_ROOT -- skipped)'}`, () => {
  it('LATER 112: MP7\'s moon and five stars are facade props of facade 1, not world draws, and the moon turns about the vertical', async () => {
    const map = await load('MP7');
    const facades = worldFacades(map);
    const named = ['worldmodel/moon', 'worldmodel/star1', 'worldmodel/star1_1', 'worldmodel/star1_2', 'worldmodel/star1_3', 'worldmodel/star1_4'];
    expect(facades.map((f) => f.path).sort()).toEqual(named);
    expect(facades.every((f) => f.prop.facade === 1)).toBe(true);
    expect(map.world.filter((p) => p.textureName === 'moon.tif' || p.textureName === 'star.tif')).toEqual([]);
    const moon = facades.find((f) => f.path === 'worldmodel/moon')!;
    const origin = originOf(moon.prop.matrices, moon.i);
    const { view, meshes } = built(map);
    const eye: V3 = [1000, 40, 1500];
    view.frame(cameraAt(eye), 0);
    const mesh = meshOf(meshes, moon.prop.parts[0]!, origin);
    expect(mesh, 'the moon drawn as a mesh of its own at its node').toBeDefined();
    const flat = new Vector3(origin[0] - eye[0], 0, origin[2] - eye[2]).normalize();
    expect(new Vector3(0, 0, 1).applyQuaternion(mesh!.quaternion).distanceTo(flat)).toBeLessThan(1e-5);
    view.dispose();
  }, 300_000);

  it('LATER 112: the world model\'s 23 facade nodes on 7 maps are facade props, their own textures gone from the world\'s draws', async () => {
    // FACADES-2's census of the 34 maps (`facade.test.ts` holds it on the scene graph): M72's six smoke columns (facade 1,
    // their texture scroll kept), M82's `g4445`, MP11's four glows, MP52's four pipes (facade 1), MP53's and MP71's suns,
    // MP7's moon and stars (facade 1).
    const want: Record<string, { count: number; facade: number; only: string[] }> = {
      M72: { count: 6, facade: 1, only: ['smoke01.tif'] }, M82: { count: 1, facade: 2, only: ['flare_red.tif'] },
      MP11: { count: 4, facade: 2, only: ['lightglow01.tif'] }, MP52: { count: 4, facade: 1, only: [] },
      MP53: { count: 1, facade: 2, only: ['sunglow.tif'] }, MP7: { count: 6, facade: 1, only: ['moon.tif', 'star.tif'] },
      MP71: { count: 1, facade: 2, only: ['sunglow.tif'] },
    };
    for (const [stem, w] of Object.entries(want)) {
      const map = await load(stem);
      const facades = worldFacades(map);
      expect(facades.length, `${stem}: the world model's facade nodes drawn as facade props`).toBe(w.count);
      expect(facades.every((f) => f.prop.facade === w.facade), `${stem}: facade ${w.facade}`).toBe(true);
      expect(map.world.filter((p) => w.only.includes(p.textureName ?? '')).length, `${stem}: no world draw of ${w.only.join(', ')}`).toBe(0);
      if (stem === 'M72') {
        for (const f of facades) for (const part of f.prop.parts) expect(part.scroll, `${f.path}: its scroll`).toEqual([0, -0.15000000596046448]);
      }
    }
  }, 600_000);

  it('LATER 113: on MP9, with the engine order on, the far-tree card nearer by its turned centroid goes out after the other', async () => {
    const map = await load('MP9');
    // `lo_jungletree04` I000 V01 and `lo_congo2_tree4` I011 V01 (`facadetrees.tif`, facade 1, the alpha pass), by their
    // node origins; a camera from which the box centre at load and the engine's key order them differently.
    const pick = (model: string, near: V3) => {
      const prop = map.props.find((p) => p.modelName === model && p.facade === 1 && p.parts.some((q) => q.textureName === 'facadetrees.tif' && q.alphaPass === true))!;
      expect(prop, model).toBeDefined();
      const i = Array.from({ length: prop.matrices.length / 16 }, (_, k) => k).find((k) => {
        const o = originOf(prop.matrices, k);
        return Math.hypot(o[0] - near[0], o[1] - near[1], o[2] - near[2]) < 0.05;
      });
      expect(i, `${model} at ${near.join(', ')}`).toBeDefined();
      const part = prop.parts.find((q) => q.textureName === 'facadetrees.tif' && q.alphaPass === true)!;
      return { part, origin: originOf(prop.matrices, i!) };
    };
    const A = pick('lo_jungletree04', [2614.8, 166.63, 358.36]);
    const B = pick('lo_congo2_tree4', [2702.53, 154.14, 282.49]);
    const eye: V3 = [2594.96, 158.35, 261.97];
    const key = (c: typeof A): number => {
      const rows = facadeRows(1, c.origin, eye)!, p = c.part.centre!;
      const at = [0, 1, 2].map((k) => c.origin[k]! + p[0] * rows[k]! + p[1] * rows[3 + k]! + p[2] * rows[6 + k]!);
      return Math.hypot(at[0]! - eye[0], at[1]! - eye[1], at[2]! - eye[2]);
    };
    expect(key(A)).toBeLessThan(key(B) - 1);
    const { view, meshes } = built(map);
    view.setEngineOrder(true);
    view.frame(cameraAt(eye), 0);
    const a = meshOf(meshes, A.part, A.origin)!, b = meshOf(meshes, B.part, B.origin)!;
    expect(a && b).toBeTruthy();
    expect(a.renderOrder).toBeGreaterThan(b.renderOrder);
    view.dispose();
  }, 300_000);

  it('LATER 114: MP61\'s 32 lit facade glows are lit under their turned normals after a frame, not the placed pose\'s bake', async () => {
    const map = await load('MP61');
    // The 24 `xmaslight/flare` glows of the scene graph and the 8 `light_round_nosource` glows `CLUTTER.ZAR` places
    // (`loadMap`'s clutter pass), all `lightglow.tif`, facade 2.
    const lit = map.props.filter((p) => p.facade !== 0 && p.parts.some((q) => q.lit && q.normals))
      .flatMap((prop) => prop.parts.filter((q) => q.lit && q.normals).flatMap((part) =>
        Array.from({ length: prop.matrices.length / 16 }, (_, i) => ({ prop, part, i, origin: originOf(prop.matrices, i) }))));
    expect(lit.length).toBe(32);
    const { view, meshes } = built(map);
    const eye: V3 = [986, 113, 473];
    view.frame(cameraAt(eye), 0);
    const lighting = { ...DEFAULT_LIGHTING, rig: map.lightRig };
    let moved = 0;
    for (const { prop, part, i, origin } of lit) {
      const mesh = meshOf(meshes, part, origin);
      expect(mesh, `${prop.paths?.[i]}`).toBeDefined();
      const rows = facadeRows(prop.facade, origin, eye)!;
      const turn = (m: Float32Array | ArrayLike<number>): Float32Array => {
        const n = part.normals!, out = new Float32Array(n.length);
        for (let k = 0; k < n.length; k += 3) {
          for (let c = 0; c < 3; c++) out[k + c] = n[k]! * m[c]! + n[k + 1]! * m[3 + c]! + n[k + 2]! * m[6 + c]!;
          const l = Math.hypot(out[k]!, out[k + 1]!, out[k + 2]!) || 1;
          for (let c = 0; c < 3; c++) out[k + c] = out[k + c]! / l;
        }
        return out;
      };
      const want = new Float32Array(part.colors.length), bake = new Float32Array(part.colors.length);
      applyLighting({ colors: part.colors, normals: turn(rows), lit: true }, lighting, want);
      const e = new Matrix4().fromArray(prop.matrices, i * 16).elements;
      applyLighting({ colors: part.colors, normals: turn([e[0]!, e[1]!, e[2]!, e[4]!, e[5]!, e[6]!, e[8]!, e[9]!, e[10]!]), lit: true }, lighting, bake);
      const colour = mesh!.geometry.getAttribute('color');
      const got = Array.from({ length: colour.count * 4 }, (_, k) => colour.getComponent(Math.floor(k / 4), k % 4));
      // To 5e-5: the colour attribute is float32 and the turn a quaternion, against the rows in doubles (a colour step is 1/255).
      want.forEach((v, k) => expect(got[k], `${prop.paths?.[i]} colour ${k}`).toBeCloseTo(v, 4));
      if (want.some((v, k) => Math.abs(v - bake[k]!) > 5 / 255)) moved++;
    }
    // The case discriminates: from this camera 19 of the 32 differ from the bake by more than 5/255 in some channel.
    expect(moved).toBe(19);
    view.dispose();
  }, 300_000);
});

const MP = ['MP1', 'MP2', 'MP5', 'MP6', 'MP7', 'MP8', 'MP9', 'MP10', 'MP11', 'MP12', 'MP51', 'MP52', 'MP53', 'MP61', 'MP62',
  'MP64', 'MP71', 'MP72', 'MP73', 'MP81', 'MP82', 'MP83'];
/** Every path a placement's own path runs through: each prefix ending before a `/` or an `=`, and the path itself. */
const prefixes = (path: string): string[] => [...[...path.matchAll(/[/=]/g)].map((m) => path.slice(0, m.index)), path];

describe.skipIf(!HAVE_DISC)(`LATER 120 on the dev disc${HAVE_DISC ? '' : ' (no dev disc: SOCOM_DISC or SOCOM_PC_ROOT -- skipped)'}`, () => {
  // The draw walk's stack (`FUN_003389c0` D:L236075-236081, `FUN_003084f0` D:L206890-206916, the pop D:L236222-236225):
  // an identity-like facade node turns the entry it shares, so the nodes drawn after it on that entry turn with it.
  // The read's census of the 34 maps (2026-10-19): only MP11's 13 `light_bulb` assemblies have such nodes.
  it('the placements turned outside a facade node\'s own subtree are exactly MP11\'s 39: 13 each of bulb_1, wire and frame', () => {
    const beyond: Record<string, number> = {};
    const lost: string[] = [];
    for (const stem of [...MP, ...CAMPAIGN_STEMS]) {
      const file = join(DISC, 'RUN', `${stem}.ZDB`);
      expect(existsSync(file), `${file} on the dev disc`).toBe(true);
      const bytes = new Uint8Array(readFileSync(file));
      const models = parseSceneGraph(Zar.parse(zdbMember(bytes, parseZdb(bytes), `${stem}_GEO.ZED`)));
      const flagged = new Set(flattenScene(models).filter((f) => facadeOf(f.node.flags) !== 0).map((f) => f.path));
      for (const p of placeInstances(models)) {
        const under = prefixes(p.path).some((q) => flagged.has(q));
        if (p.facade !== 0 && !under) beyond[`${stem} ${p.path}`] = (beyond[`${stem} ${p.path}`] ?? 0) + 1;
        if (p.facade === 0 && under) lost.push(`${stem} ${p.path}`);
      }
    }
    expect(beyond).toEqual({
      'MP11 worldmodel/light_bulb=light_bulb/bulb_1': 13,
      'MP11 worldmodel/light_bulb=light_bulb/wire': 13,
      'MP11 worldmodel/light_bulb=light_bulb/frame': 13,
    });
    expect(lost).toEqual([]);
  }, 600_000);

  it('MP11: each bulb\'s bulb_1, frame and wire turn as its flare turns, the wire\'s strips a turned group of their own', async () => {
    const map = await load('MP11');
    const bulbs = map.props.filter((p) => p.modelName === 'light_bulb');
    const node = (name: string) => bulbs.filter((p) => p.paths?.[0]?.endsWith(`=light_bulb/${name}`));
    const count = (ps: LoadedMap['props']): number => ps.reduce((n, p) => n + p.matrices.length / 16, 0);
    const [flare, bulb, frame] = [node('flare'), node('bulb_1'), node('frame')];
    expect([count(flare), count(bulb), count(frame)]).toEqual([13, 13, 13]);
    expect([...flare, ...bulb, ...frame].map((p) => p.facade)).toEqual([...flare, ...bulb, ...frame].map(() => 2));
    type Turned = { turn?: { facade: number; matrix: Float32Array } };
    const wires = (map.lines ?? []).filter((g) => (g as Turned).turn);
    expect(wires.map((g) => [g.textureName, (g as Turned).turn!.facade])).toEqual(new Array(13).fill(['a_ball_pipe.tif', 2]));
    const { view, meshes } = built(map);
    const eye: V3 = [1300, -60, 450];   // below the bulbs' ceilings, among them
    view.frame(cameraAt(eye), 0);
    const flareAt = (origin: V3): Mesh => {
      const m = meshOf(meshes, flare[0]!.parts[0]!, origin);
      expect(m, `the flare at ${origin.join(', ')}`).toBeDefined();
      return m!;
    };
    // Component by component: `angleTo` is 2 acos(dot), and a quaternion made from float32 rows is a unit one only to
    // about 1e-8, so even one quaternion against itself reads some 2e-4 there.
    const apart = (a: Quaternion, b: Quaternion): number => Math.max(...[a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w].map(Math.abs));
    let checked = 0;
    for (const prop of [...bulb, ...frame]) {
      for (let i = 0; i < prop.matrices.length / 16; i++) {
        const origin = originOf(prop.matrices, i);
        for (const part of prop.parts) {
          const mesh = meshOf(meshes, part, origin);
          expect(mesh, `${prop.paths?.[i]} at ${origin.join(', ')}`).toBeDefined();
          expect(apart(mesh!.quaternion, flareAt(origin).quaternion), `${prop.paths?.[i]}`).toBeLessThan(1e-9);
          checked++;
        }
      }
    }
    expect(checked).toBe(39);   // 13 bulbs, and the frame's two visuals
    const lines = view.group.children.filter((c): c is LineSegments => c instanceof LineSegments && c.position.lengthSq() > 0);
    expect(lines.length).toBe(13);
    for (const line of lines) expect(apart(line.quaternion, flareAt(line.position.toArray() as V3).quaternion)).toBeLessThan(1e-9);
    // And the turn is not the pose on disc: from this eye every bulb_1 stands away from its placed rotation.
    const placedTurn = new Quaternion();
    for (const prop of bulb) {
      for (let i = 0; i < prop.matrices.length / 16; i++) {
        new Matrix4().fromArray(prop.matrices, i * 16).decompose(new Vector3(), placedTurn, new Vector3());
        expect(apart(meshOf(meshes, prop.parts[0]!, originOf(prop.matrices, i))!.quaternion, placedTurn), `${prop.paths?.[i]}`).toBeGreaterThan(1e-3);
      }
    }
    view.dispose();
  }, 300_000);
});

const FIXTURES = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'));
const absent = ['RUN/MP2.ZDB', 'RUN/MP6.ZDB', 'RUN/MP72.ZDB'].some((f) => fixture(f) === null);

describe.skipIf(absent)(`FACADES-2's guard: the fixtures have no world-model facade node, their world draws unchanged${absent ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  // Pinned on the lane before FACADES-2 (b30b6ab79): the world's draw count and triangles, the facade props' count.
  const want: Record<string, { draws: number; triangles: number; facadeProps: number }> = {
    MP2: { draws: 142, triangles: 8764, facadeProps: 3 },
    MP6: { draws: 104, triangles: 13898, facadeProps: 1 },
    MP72: { draws: 164, triangles: 27628, facadeProps: 0 },
  };
  for (const [stem, w] of Object.entries(want)) {
    it.skipIf(absent)(`${stem}`, async () => {
      const map = await loadMap(new FsAssetSource(FIXTURES), `RUN/${stem}.ZDB`);
      expect(worldFacades(map)).toEqual([]);
      expect({
        draws: map.world.length, triangles: map.world.reduce((n, p) => n + p.indices.length / 3, 0),
        facadeProps: map.props.filter((p) => p.facade !== 0).length,
      }).toEqual(w);
    }, 300_000);
  }
});
