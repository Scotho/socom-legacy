import { describe, expect, it } from 'vitest';
import { Mesh, Scene, type Material, type Object3D } from 'three';
import type { MeshBasicNodeMaterial } from 'three/webgpu';
import { DEFAULT_GRID_PARAMS } from '@s2u/scene';
import type { GsState } from '@s2u/gs';
import type { LoadedBody } from '../src/body';
import { buildBody } from '../src/bodyView';
import { effectBrighten } from '../src/effectMaterials';
import { experimentalAssets } from '../src/experimentalAssets';
import { applyFog, fogUniforms } from '../src/fog';
import { DEFAULT_LIGHTING } from '../src/lighting';
import type { LoadedMap, LoadedMesh } from '../src/loadMap';
import { rigShading } from '../src/rigShading';
import { buildWorld } from '../src/world';

/**
 * CPS H9 (2026-11-03, the 16-seat live cell's CDP profile, three r186): a plain `uniform()` sits in three's object group,
 * whose buffer every draw compares and rewrites -- 0.7 ms of compares and 0.8 ms of uploads a frame across ~550 draws.
 * The frame-wide values move to the render group (compared and written once a `render()` call); the two genuinely
 * per-object ones (`onObjectUpdate`) stay. A browser adaptation on the CPU side only: the same values through the same
 * arithmetic, only the buffer they live in changes. Checked here on the node graphs the materials carry.
 */

interface UniformLike { isUniformNode?: boolean; isTextureNode?: boolean; name: string; groupNode: { name: string } }
interface NodeLike { isNode?: boolean; getChildren(): Iterable<NodeLike> }

/** Every buffer uniform (textures are bindings of their own) reachable from the roots, by walking each node's children. */
function uniformsOf(...roots: unknown[]): UniformLike[] {
  const seen = new Set<unknown>();
  const out: UniformLike[] = [];
  const visit = (n: NodeLike | null | undefined): void => {
    if (!n || n.isNode !== true || seen.has(n)) return;
    seen.add(n);
    const u = n as unknown as UniformLike;
    if (u.isUniformNode === true && u.isTextureNode !== true) out.push(u);
    for (const c of n.getChildren()) visit(c);
  };
  for (const r of roots) visit(r as NodeLike);
  return out;
}
const graphOf = (m: Material): unknown[] => {
  const n = m as MeshBasicNodeMaterial;
  return [n.colorNode, n.opacityNode, n.maskNode, n.positionNode, n.fragmentNode, n.outputNode];
};
const byName = (us: UniformLike[]): Map<string, string> => new Map(us.map((u) => [u.name, u.groupNode.name]));

/** The names the frame-wide uniforms carry (`.setName`), each to be found in the render group. */
const WORLD_FRAME_WIDE = [
  'shadowToLight', 'shadowCentre', 'shadowToward', 'shadowFar', 'shadowStrength',      // ./charShadow
  'worldBrighten', 'detailRangeSqScale',                                               // ./world
  'nightOn', 'nightRow',                                                               // ./nightVision (row 0)
  'washLit',                                                                           // ./trueColourScale
];
const BODY_FRAME_WIDE = [
  'rigDir0', 'rigDir1', 'rigDir2', 'rigColour0', 'rigColour1', 'rigColour2', 'rigAmbient', // ./rigShading
  'bodyBrighten', 'nightOn', 'nightHot', 'washLit',
];
/** The per-object or per-material uniforms that stay in the object group, by name. */
const WORLD_OBJECT = ['lodFadeOpacity', 'detailRange', 'detailUvScale'];

const RANGE = 202500;
const FLAGS = { bilinear: true, transparent: false, graded: false, opaque: true, gs: null };
const ADDITIVE = { blend: 'additive', alphaTest: null, depthTest: true, bilinear: true, mipmaps: false, levels: 0, wrapS: 'repeat', wrapT: 'repeat' } as unknown as GsState;
const PULSE = 'worldmodel/terrorist_base/crates_weapons=crates_weapons/terrorist_pulse';
/** A shadowed ground triangle with a detail pass, and an outline that `setNodeOpacity` fades through its twin. */
const synthetic = (): LoadedMap => ({
  archive: 'SYN', camera: null, path: 'SYN.ZDB', name: 'synthetic', lines: null, props: [],
  world: [
    {
      positions: new Float32Array([-600, 0, -600, 600, 0, -600, 0, 0, 600]), uvs: new Float32Array(6),
      colors: new Float32Array(12).fill(1), normals: null, faceNormals: null, indices: new Uint32Array([0, 1, 2]),
      textureName: 'ground.tif', fog: true, lit: false, order: 0, orderEnd: 0, cull: true, alternate: false, scroll: null,
      centroids: new Float32Array(9),
    } as LoadedMesh,
    {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]), uvs: new Float32Array(6), colors: new Float32Array(12).fill(1),
      normals: null, faceNormals: null, indices: new Uint32Array([0, 1, 2]), textureName: 'base_red.tif', fog: true, lit: false,
      order: 0, orderEnd: 0, cull: false, alternate: true, scroll: null, alphaPass: true, switchPath: PULSE,
    } as LoadedMesh,
  ],
  textures: {
    'ground.tif': { data: new Uint8ClampedArray(16).fill(255), width: 2, height: 2 },
    'grain.tif': { data: new Uint8ClampedArray(16).fill(128), width: 2, height: 2 },
    'base_red.tif': { data: new Uint8ClampedArray(16).fill(200), width: 2, height: 2 },
  },
  textureFlags: {
    'ground.tif': FLAGS, 'grain.tif': FLAGS,
    'base_red.tif': { bilinear: true, transparent: true, graded: true, opaque: false, gs: ADDITIVE },
  },
  metersPerUnit: 0.1, lightRig: null, origin: [0, 0, 0],
  detail: { 'ground.tif': { name: 'grain.tif', uv: 4, range: RANGE, bmode: 'COLORBLEND' } },
  grid: DEFAULT_GRID_PARAMS, collision: { positions: new Float32Array(0), colors: new Uint8Array(0), polygons: 0 }, slots: [],
  diagnostics: [], loadMs: 0, timings: { fetch: 0, decode: 0, postedAt: 0 },
} as unknown as LoadedMap);

/** The smallest body `buildBody` takes (as `litColourShader.test.ts`): one untextured and one textured sub-mesh. */
function tinyBody(): { body: LoadedBody; map: Parameters<typeof buildBody>[1] } {
  const identity = Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const sub = (textureName: string | null) => ({
    textureName, fog: false,
    positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]), normals: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    uvs: new Float32Array(6), indices: Uint32Array.from([0, 1, 2]),
    skinIndex: new Uint16Array(12), skinWeight: Float32Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
  });
  const body = {
    character: null, model: 'tiny', dressedBy: 'test', parts: [{ name: 'root', parent: -1, bindLocal: identity, bindWorld: identity }],
    subMeshes: [sub(null), sub('skin')], fittings: [], missing: [], at: null, height: 1, eye: null,
    stats: { vertices: 3, triangles: 1, parts: 1, subMeshes: 2, batches: 2, maxInfluences: 1, droppedWeight: 0, fittings: 0 },
  } as unknown as LoadedBody;
  const map = { textures: { skin: { width: 1, height: 1, data: new Uint8ClampedArray([128, 128, 128, 255]) } }, textureFlags: {} };
  return { body, map };
}

const meshesOf = (root: Object3D): Mesh[] => {
  const out: Mesh[] = [];
  root.traverse((o) => { if ((o as Mesh).isMesh) out.push(o as Mesh); });
  return out;
};

describe('CPS H9: frame-wide uniforms live in three\'s render group, per-object ones in the object group', () => {
  it('the world\'s materials: the shadow, the brighten, the detail range scale, the lens and the wash are render-group; the LOD fade and the detail range stay per object', () => {
    const view = buildWorld(synthetic());
    try {
      for (const task of view.revealWorld) task();
      expect(view.setNodeActive(PULSE, true)).toBe(1);
      expect(view.setNodeOpacity(PULSE, 0.5)).toBe(1);        // the outline now draws with its fading twin
      const materials = meshesOf(view.group).map((m) => m.material as Material);
      expect(materials.some((m) => m.name === 'lod fade'), 'a fading twin is drawn').toBe(true);
      expect(materials.some((m) => (m.userData as { detailGate?: unknown }).detailGate), 'a detail pass is drawn').toBe(true);
      const all = uniformsOf(...materials.flatMap(graphOf));
      const groups = byName(all);
      for (const name of WORLD_FRAME_WIDE) expect(groups.get(name), name).toBe('render');
      for (const name of WORLD_OBJECT) expect(groups.get(name), name).toBe('object');
      // Nothing else is left in the object group: an unnamed per-draw uniform is a regression of H9's 1.5 ms.
      const objectNames = [...new Set(all.filter((u) => u.groupNode.name === 'object').map((u) => u.name))].sort();
      expect(objectNames).toEqual([...WORLD_OBJECT].sort());
    } finally { view.dispose(); }
  });

  it('the body\'s materials: the rig\'s seven vectors, the brighten, the lens and the wash are render-group; nothing per object', () => {
    const { body, map } = tinyBody();
    const view = buildBody(body, map as never, DEFAULT_LIGHTING);
    try {
      const materials = meshesOf(view.group).map((m) => m.material as Material);
      expect(materials.length).toBe(2);
      const all = uniformsOf(...materials.flatMap(graphOf));
      const groups = byName(all);
      for (const name of BODY_FRAME_WIDE) expect(groups.get(name), name).toBe('render');
      expect(all.filter((u) => u.groupNode.name === 'object').map((u) => u.name)).toEqual([]);
    } finally { view.dispose(); }
  });

  it('a rig on its own (the held weapon\'s and the grenades\' lit colour) is render-group', () => {
    const rig = rigShading(null);
    const groups = byName(uniformsOf(rig.lit));
    for (const name of ['rigDir0', 'rigDir1', 'rigDir2', 'rigColour0', 'rigColour1', 'rigColour2', 'rigAmbient']) expect(groups.get(name), name).toBe('render');
  });

  it('the fog\'s five uniforms and the wash on its colour are render-group', () => {
    const scene = new Scene();
    applyFog(scene, { enabled: true, near: 600, far: 875, color: [74, 74, 72], altitude: { top: 100, bottom: 0 } });
    const u = fogUniforms(scene)!;
    for (const key of ['color', 'scale', 'offset', 'bottom', 'invSpan'] as const) {
      expect((u[key] as unknown as UniformLike).groupNode.name, key).toBe('render');
    }
    const groups = byName(uniformsOf(scene.fogNode));
    for (const name of ['fogColour', 'fogScale', 'fogOffset', 'fogBottom', 'fogInvSpan', 'washFog']) expect(groups.get(name), name).toBe('render');
  });

  it('the effects\' brighten and the Experimental view\'s four gains are render-group', () => {
    expect((effectBrighten as unknown as UniformLike).groupNode.name).toBe('render');
    for (const key of ['mipBias', 'detailStrength', 'characterAmbient', 'characterDirectional'] as const) {
      expect((experimentalAssets[key] as unknown as UniformLike).groupNode.name, key).toBe('render');
    }
  });
});
