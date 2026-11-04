import { describe, expect, it } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Group, InstancedMesh, Matrix4, Mesh, PerspectiveCamera, Scene, BoxGeometry, type BufferGeometry, type Material, type Object3D, type SkinnedMesh } from 'three';
import { GLSLNodeBuilder, MeshBasicNodeMaterial, WGSLNodeBuilder, WebGPURenderer } from 'three/webgpu';
import { FsAssetSource } from '@s2u/archive/node';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { loadMap } from '../src/loadMap';
import { buildWorld } from '../src/world';
import { EffectLights } from '../src/effectLights';

/**
 * IP4 (a renderer-internal adaptation, product track: nothing drawn changes): the effect lights' overlays compiled one
 * vertex program per instanced overlay. three 0.186 builds one node graph per instanced object -- its render object's
 * material key takes `object.uuid` for any `isInstancedMesh` (`src/renderers/common/RenderObject.js` L846-852) -- and
 * each build makes a new instance-matrix buffer node (`src/nodes/accessors/Instance.js` L28-45, from
 * `NodeMaterial.setupPosition` L798-800), named in the shader by its process-global node id (WGSL:
 * `src/renderers/webgpu/nodes/WGSLNodeBuilder.js` L1398; GLSL: `src/renderers/webgl-fallback/nodes/GLSLNodeBuilder.js`
 * L1792, L1800). Programs are cached by their code (`src/renderers/common/Pipelines.js` L187-208), so the code differed
 * by that id alone and every instanced overlay -- two a receiver, the additive pass and the lerped one -- linked its own.
 *
 * The shaders are built here as `./experimentalShaderFixture`'s `graphicShader` builds them (no GPU); one build per
 * distinct material key, as `NodeManager.getForRender` caches a build by it (`src/renderers/common/nodes/NodeManager.js`
 * L198-212). A program is a distinct vertex code string, as `Pipelines.getForRender` keys `programs.vertex`.
 */

type BuilderClass = typeof GLSLNodeBuilder | typeof WGSLNodeBuilder;

/** `RenderObject.getGeometryCacheKey` (L687-734): the attribute layout, the morph targets' ids, the index. */
function geometryKey(g: BufferGeometry): string {
  let k = '';
  for (const name of Object.keys(g.attributes).sort()) {
    const a = g.attributes[name] as unknown as { data?: { stride: number }; offset?: number; itemSize?: number; normalized?: boolean };
    k += name + ',';
    if (a.data) k += a.data.stride + ',';
    if (a.offset) k += a.offset + ',';
    if (a.itemSize) k += a.itemSize + ',';
    if (a.normalized) k += 'n,';
  }
  const morphs = g.morphAttributes as Record<string, { id: number }[]>;
  for (const name of Object.keys(morphs).sort()) k += 'morph-' + name + ',' + morphs[name]!.map((t) => t.id).join(',');
  if (g.index) k += 'index,';
  return k;
}

/** What of `RenderObject.getMaterialCacheKey` (L743-860) differs between objects of one material: one build each. */
function buildKey(m: Mesh): string {
  const material = (Array.isArray(m.material) ? m.material[0] : m.material) as unknown as { id: number };
  let k = `${material.id}|${geometryKey(m.geometry)}`;
  const skeleton = (m as SkinnedMesh).skeleton;
  if (skeleton) k += `|bones ${skeleton.bones.length}`;
  if ((m as InstancedMesh).isInstancedMesh || (m as InstancedMesh).count > 1) k += `|${m.uuid}`;
  return `${k}|${m.receiveShadow}`;
}

function stubRenderer(): WebGPURenderer {
  const renderer = new WebGPURenderer({ canvas: { style: {}, width: 1, height: 1, addEventListener() {}, removeEventListener() {}, getContext: () => null } as unknown as HTMLCanvasElement, forceWebGL: true });
  renderer.hasFeature = () => false;
  // WebGL2's least MAX_UNIFORM_BLOCK_SIZE: the limit three's instancing (Instance.js L41-43) compares a buffer with.
  Object.assign(renderer.backend, { utils: { getTextureSampleData: () => ({ primarySamples: 1 }) }, capabilities: { getUniformBufferLimit: () => 16384 } });
  return renderer;
}

function vertexShader(renderer: WebGPURenderer, Builder: BuilderClass, mesh: Mesh): string {
  const b = new Builder(mesh, renderer as never) as unknown as { material: Material; camera: PerspectiveCamera; scene: Scene; build(): void; vertexShader: string };
  b.material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as Material;
  b.camera = new PerspectiveCamera();
  b.scene = new Scene();
  b.build();
  return b.vertexShader;
}

/** The distinct vertex programs `meshes` link, one build per material key. */
function programs(meshes: readonly Mesh[], Builder: BuilderClass): number {
  const renderer = stubRenderer();
  const builds = new Map<string, Mesh>();
  for (const m of meshes) if (!builds.has(buildKey(m))) builds.set(buildKey(m), m);
  return new Set([...builds.values()].map((m) => vertexShader(renderer, Builder, m))).size;
}

const overlaysUnder = (root: Object3D): Mesh[] => {
  const out: Mesh[] = [];
  root.traverse((o) => { if ((o as Mesh).isMesh && o.userData.effectLightPass) out.push(o as Mesh); });
  return out;
};
const BUILDERS: [string, BuilderClass][] = [['WGSL (WebGPU)', WGSLNodeBuilder], ['GLSL (WebGL2)', GLSLNodeBuilder]];

/** Five instanced receivers of two instance counts (2, 3) and a plain one, each its own placements. */
function receivers(): { root: Group; instanced: InstancedMesh[] } {
  const root = new Group();
  const geometry = new BoxGeometry();
  const material = new MeshBasicNodeMaterial();
  const instanced: InstancedMesh[] = [];
  for (const [i, count] of [2, 2, 2, 3, 3].entries()) {
    const m = new InstancedMesh(geometry, material, count);
    for (let j = 0; j < count; j++) m.setMatrixAt(j, new Matrix4().makeTranslation(i * 10, j, 0));
    instanced.push(m);
    root.add(m);
  }
  root.add(new Mesh(geometry, material));
  return { root, instanced };
}

describe('IP4: the effect lights\' instanced overlays share their programs', () => {
  for (const [label, Builder] of BUILDERS) {
    it(`${label}: one vertex program a pass and instance count, not one an overlay`, () => {
      const { root } = receivers();
      const lights = new EffectLights();
      lights.setReceivers(() => [root]);
      lights.warmMeshes();
      const overlays = overlaysUnder(root);
      expect(overlays).toHaveLength(12);                // two a receiver
      const instanced = overlays.filter((o) => (o as InstancedMesh).isInstancedMesh);
      expect(instanced).toHaveLength(10);
      // Two passes x two instance counts (2 and 3); three's own instancing linked ten, one an overlay.
      expect(programs(instanced, Builder)).toBe(4);
      // The plain receiver's two overlays: one program a pass, as before.
      expect(programs(overlays.filter((o) => !(o as InstancedMesh).isInstancedMesh), Builder)).toBe(2);
    });
  }

  for (const [label, Builder] of BUILDERS) {
    it(`${label}: the overlay's vertex stage places it as three's own instancing did, line for line`, () => {
      const { root } = receivers();
      const lights = new EffectLights();
      lights.setReceivers(() => [root]);
      lights.warmMeshes();
      const overlay = overlaysUnder(root).find((o) => (o as InstancedMesh).isInstancedMesh) as InstancedMesh;
      // The same pass on a stock InstancedMesh of the same receiver: three's instancing (`Instance.js` L206-207, L235-240).
      const material = (overlay.material as MeshBasicNodeMaterial).clone();
      material.positionNode = null;
      const stock = new InstancedMesh(overlay.geometry, material, overlay.count);
      // The vertex function's body; three's path also turns `normalLocal` (the geometry has normals), which this pass
      // never reads (its normal is the face's, `dFdx`/`dFdy` of `positionWorld`): those lines and the input set aside.
      const body = (s: string): string[] => {
        const main = s.search(/fn main\(|void main\(/);
        const lines = s.slice(s.indexOf('{', main) + 1).split('\n').filter((l) => !/normal/.test(l) && l.trim() !== '');
        const ids = new Map<string, number>();
        return lines.map((l) => l.replace(/\b(NodeBuffer_|buffer)(\d+)/g, (_, p: string, id: string) => {
          if (!ids.has(id)) ids.set(id, ids.size);
          return `${p}#${ids.get(id)}`;
        }));
      };
      const renderer = stubRenderer();
      const mine = body(vertexShader(renderer, Builder, overlay));
      expect(mine.some((l) => /positionLocal = \( (NodeBuffer_#0\.value|buffer#0)\[ /.test(l))).toBe(true);
      expect(mine).toEqual(body(vertexShader(renderer, Builder, stock)));
    });
  }

  it('an instanced overlay still draws its receiver\'s placements: the same live matrices, the same count', () => {
    const { root, instanced } = receivers();
    const lights = new EffectLights();
    lights.setReceivers(() => [root]);
    lights.warmMeshes();
    for (const r of instanced) {
      const pair = overlaysUnder(root).filter((o) => o.geometry === r.geometry && (o as InstancedMesh).count === r.count
        && (o as InstancedMesh).instanceMatrix.array === r.instanceMatrix.array);
      expect(pair).toHaveLength(2);
      for (const o of pair as InstancedMesh[]) {
        expect(o.isInstancedMesh).toBe(true);
        // A placement put on the receiver later (a door's swing, a hidden member) is the overlay's too.
        r.setMatrixAt(0, new Matrix4().makeTranslation(99, 0, 0));
        const at = new Matrix4();
        o.getMatrixAt(0, at);
        expect(at.elements[12]).toBe(99);
      }
    }
  });
});

const FIXTURES = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'));
const absent = fixture('RUN/MP72.ZDB') === null;

describe.skipIf(absent)(`IP4 on MP72's world (the fixture)${absent ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  it('the overlays link one program a pass and instance count: none differs from another by a node id alone', async () => {
    const map = await loadMap(new FsAssetSource(FIXTURES), 'RUN/MP72.ZDB');
    const view = buildWorld(map);
    for (const task of [...view.revealWorld, ...view.revealProps]) task();
    const lights = new EffectLights();
    lights.setReceivers(() => [view.group]);
    lights.warmMeshes();
    const overlays = overlaysUnder(view.group);
    const counts = new Set(overlays.filter((o) => (o as InstancedMesh).isInstancedMesh).map((o) => (o as InstancedMesh).instanceMatrix.count));
    // The fixture's world: 846 opaque receivers, 121 of them instanced, of seven instance counts (2, 3, 4, 6, 7, 8, 13).
    expect(overlays).toHaveLength(1692);
    expect(overlays.filter((o) => (o as InstancedMesh).isInstancedMesh)).toHaveLength(242);
    expect(counts.size).toBe(7);
    const instanced = programs(overlays.filter((o) => (o as InstancedMesh).isInstancedMesh), WGSLNodeBuilder);
    // Before: 242, one an instanced overlay. Now one a pass and count.
    expect(instanced).toBe(2 * counts.size);
    view.dispose();
  }, 120_000);
});
