import { describe, expect, it } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BoxGeometry, Color, DataTexture, Float32BufferAttribute, Group, InstancedMesh, Matrix4, Mesh, PerspectiveCamera, Scene,
  type BufferGeometry, type Material, type Object3D, type SkinnedMesh,
} from 'three';
import { GLSLNodeBuilder, MeshBasicNodeMaterial, NodeFrame, NodeMaterial, WGSLNodeBuilder, WebGPURenderer } from 'three/webgpu';
import { normalWorld, positionLocal, vec3, vec4, vertexColor } from 'three/tsl';
import { FsAssetSource } from '@s2u/archive/node';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { loadMap } from '../src/loadMap';
import { buildWorld } from '../src/world';
import { EffectLights } from '../src/effectLights';
import { releaseWorldInstancing, worldInstanceBuffers, WorldMeshMaterial } from '../src/worldInstancing';

/**
 * IP5 (a renderer-internal adaptation, product track: nothing drawn changes): the world's own instanced meshes linked
 * one vertex program each, as IP4's overlays did (`./effectLightPrograms.test.ts`): three builds every instanced object
 * on its own (`RenderObject.js` L846-852) and names each build's new instance buffer by a global node id
 * (`Instance.js` L28-45; `WGSLNodeBuilder.js` L1398; `GLSLNodeBuilder.js` L1792/L1800), and programs are cached by code
 * (`Pipelines.js` L187-208). `../src/worldInstancing` reads every world material's instancing through one buffer node
 * per instance count, so the code no longer differs by that id. The harness is IP4's: shaders built as
 * `NodeManager.getForRender` builds them (one build per material key, L198-212), a program a distinct vertex code.
 */

type BuilderClass = typeof GLSLNodeBuilder | typeof WGSLNodeBuilder;
const BUILDERS: [string, BuilderClass][] = [['WGSL (WebGPU)', WGSLNodeBuilder], ['GLSL (WebGL2)', GLSLNodeBuilder]];

/** `RenderObject.getGeometryCacheKey` (L687-734). */
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

interface Built { vertexShader: string; fragmentShader: string }
function shaders(renderer: WebGPURenderer, Builder: BuilderClass, mesh: Mesh, stock = false): Built {
  const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as Material;
  // Three's own instancing on the same mesh and material: `NodeMaterial.setupPosition` in place of the override.
  if (stock) Object.defineProperty(material, 'setupPosition', { value: NodeMaterial.prototype.setupPosition, configurable: true, writable: true });
  try {
    const b = new Builder(mesh, renderer as never) as unknown as { material: Material; camera: PerspectiveCamera; scene: Scene; build(): void } & Built;
    b.material = material;
    b.camera = new PerspectiveCamera();
    b.scene = new Scene();
    b.build();
    return { vertexShader: b.vertexShader, fragmentShader: b.fragmentShader };
  } finally {
    if (stock) delete (material as unknown as { setupPosition?: unknown }).setupPosition;
  }
}

/** The distinct vertex programs `meshes` link, one build per material key (`rename`: the buffer ids set aside). */
function programs(meshes: readonly Mesh[], Builder: BuilderClass, options: { stock?: boolean; rename?: boolean } = {}): number {
  const renderer = stubRenderer();
  const builds = new Map<string, Mesh>();
  for (const m of meshes) if (!builds.has(buildKey(m))) builds.set(buildKey(m), m);
  return new Set([...builds.values()].map((m) => {
    const code = shaders(renderer, Builder, m, options.stock).vertexShader;
    return options.rename ? renamed(code) : code;
  })).size;
}

/** The code with each buffer's node id numbered by first use: what differs between two builds of one graph. */
function renamed(code: string): string {
  const ids = new Map<string, number>();
  return code.replace(/\b(NodeBuffer_|buffer)(\d+)/g, (_, p: string, id: string) => {
    if (!ids.has(id)) ids.set(id, ids.size);
    return `${p}#${ids.get(id)}`;
  });
}

const instancedUnder = (root: Object3D): InstancedMesh[] => {
  const out: InstancedMesh[] = [];
  root.traverse((o) => { if ((o as InstancedMesh).isInstancedMesh && !o.userData.effectLightPass) out.push(o as InstancedMesh); });
  return out;
};

/** A geometry with normals and vertex colours, as a world prop's (`geometryOf`; `addEnv` adds the normals). */
function propGeometry(): BufferGeometry {
  const g = new BoxGeometry();
  const n = g.getAttribute('position').count;
  g.setAttribute('color', new Float32BufferAttribute(new Float32Array(n * 4).fill(1), 4));
  return g;
}

/** Each world material kind of `./world`, as a graph: the shaded draw, a texture, a normal reader (the env pass). */
const KINDS: [string, () => MeshBasicNodeMaterial][] = [
  ['shaded (vertex colour)', () => { const m = new WorldMeshMaterial(); m.colorNode = vec4(vertexColor().rgb, 1); return m; }],
  ['textured', () => { const m = new WorldMeshMaterial(); m.map = new DataTexture(new Uint8Array(4), 1, 1); return m; }],
  ['env (normalWorld)', () => { const m = new WorldMeshMaterial(); m.colorNode = vec4(normalWorld.mul(0.5).add(0.5), 1); m.transparent = true; return m; }],
  ['with a positionNode', () => { const m = new WorldMeshMaterial(); m.positionNode = positionLocal.add(vec3(0, 1, 0)); return m; }],
];

function placed(geometry: BufferGeometry, material: Material, count: number, at = 0): InstancedMesh {
  const m = new InstancedMesh(geometry, material, count);
  for (let j = 0; j < count; j++) m.setMatrixAt(j, new Matrix4().makeTranslation(at, j, 0));
  return m;
}

describe('IP5: the world\'s instanced meshes share their vertex programs', () => {
  for (const [label, Builder] of BUILDERS) {
    it(`${label}: one program an instance count across materials of one graph, not one a mesh`, () => {
      const geometry = propGeometry();
      // Five instanced draws of two counts, each its own material (as each prop texture has its own), one graph.
      const meshes = [2, 2, 3, 3, 3].map((count, i) => {
        const material = new WorldMeshMaterial();
        material.map = new DataTexture(new Uint8Array(4), 1, 1);
        return placed(geometry, material, count, i * 10);
      });
      expect(programs(meshes, Builder, { stock: true })).toBe(5);     // three's own: one a mesh
      expect(programs(meshes, Builder)).toBe(2);                     // now: one a count
    });
  }

  for (const [label, Builder] of BUILDERS) {
    for (const [kind, make] of KINDS) {
      it(`${label}, ${kind}: the program is three's own, position and normal, but for the buffer's name`, () => {
        const renderer = stubRenderer();
        const mesh = placed(propGeometry(), make(), 3);
        const mine = shaders(renderer, Builder, mesh);
        const stock = shaders(renderer, Builder, mesh, true);
        expect(renamed(mine.vertexShader)).toEqual(renamed(stock.vertexShader));
        expect(renamed(mine.fragmentShader)).toEqual(renamed(stock.fragmentShader));
        // Three's instancing body is there whole: the matrix on the position and on the normal.
        expect(mine.vertexShader).toMatch(/positionLocal = \( (NodeBuffer_\d+\.value|buffer\d+)\[ /);
        expect(mine.vertexShader).toMatch(/normalLocal = /);
        // And the buffer is the shared one, not a build's own.
        const shared = worldInstanceBuffers().get(3)!.node!;
        expect(mine.vertexShader).toMatch(new RegExp(`\\b(NodeBuffer_|buffer)${shared.id}\\b`));
      });
    }
  }

  for (const [label, Builder] of BUILDERS) {
    it(`${label}: where it would be anything else, three's own instancing (its own fresh buffer a build)`, () => {
      const renderer = stubRenderer();
      const geometry = propGeometry();
      // Past the uniform limit (16,384 bytes: 256 matrices): three's interleaved attributes.
      const many = placed(geometry, new WorldMeshMaterial(), 300);
      // Instance colours.
      const coloured = placed(geometry, new WorldMeshMaterial(), 3);
      coloured.setColorAt(0, new Color(1, 0, 0));
      // Not instanced at all.
      const plain = new Mesh(geometry, new WorldMeshMaterial());
      // Three's own path makes a fresh buffer node every build (`Instance.js` L45), so two builds of it never match byte for
      // byte (ip5-a, 2026-11-02: NodeBuffer_4301 against NodeBuffer_4228): the code is compared with the buffer ids set
      // aside, and the fallback is told from the shared buffer by its ids -- a fresh one each build, never one id twice.
      const ids = (code: string): string[] => [...code.matchAll(/\b(?:NodeBuffer_|buffer)(\d+)/g)].map((x) => x[1]!);
      for (const m of [many, coloured, plain]) {
        const first = shaders(renderer, Builder, m).vertexShader;
        const again = shaders(renderer, Builder, m).vertexShader;
        expect(renamed(first)).toEqual(renamed(shaders(renderer, Builder, m, true).vertexShader));
        if (ids(first).length > 0) expect(ids(again)).not.toEqual(ids(first));
      }
      expect(ids(shaders(renderer, Builder, coloured).vertexShader).length).toBeGreaterThan(0);   // the check above is not vacuous
    });
  }

  it('the shared buffer reads each drawn object\'s own placements, as three\'s did', () => {
    const geometry = propGeometry();
    const a = placed(geometry, new WorldMeshMaterial(), 4, 10);
    const b = placed(geometry, new WorldMeshMaterial(), 4, 20);
    const renderer = stubRenderer();
    shaders(renderer, WGSLNodeBuilder, a);
    shaders(renderer, WGSLNodeBuilder, b);
    const buffer = worldInstanceBuffers().get(4) as unknown as { reference: unknown; node: { value: unknown } };
    // `NodeManager.updateForRender` (L1127-1139) runs each update node through the object's frame before its bindings.
    const frame = new NodeFrame();
    for (const o of [a, b, a]) {
      frame.object = o;
      frame.updateNode(buffer as never);
      expect(buffer.node.value).toBe(o.instanceMatrix.array);
    }
    // A disposed world's mesh is let go; the next draw takes its own again.
    releaseWorldInstancing();
    expect(buffer.reference).toBeNull();
    frame.object = b;
    frame.updateNode(buffer as never);
    expect(buffer.node.value).toBe(b.instanceMatrix.array);
  });

  it('IP4\'s overlays still draw their receivers\' live placements, one program a pass and count', () => {
    const root = new Group();
    const geometry = propGeometry();
    const receivers = [2, 2, 3].map((count, i) => {
      const m = placed(geometry, new WorldMeshMaterial(), count, i * 10);
      root.add(m);
      return m;
    });
    const lights = new EffectLights();
    lights.setReceivers(() => [root]);
    lights.warmMeshes();
    const overlays: InstancedMesh[] = [];
    root.traverse((o) => { if (o.userData.effectLightPass) overlays.push(o as InstancedMesh); });
    expect(overlays).toHaveLength(6);
    for (const r of receivers) {
      // The receiver keeps three's instanced attribute: IP4's `sharedInstances` takes it as before.
      expect(r.instanceMatrix.isInstancedBufferAttribute).toBe(true);
      const pair = overlays.filter((o) => o.instanceMatrix.array === r.instanceMatrix.array);
      expect(pair).toHaveLength(2);
      r.setMatrixAt(0, new Matrix4().makeTranslation(99, 0, 0));
      for (const o of pair) {
        const at = new Matrix4();
        o.getMatrixAt(0, at);
        expect(at.elements[12]).toBe(99);
      }
    }
    for (const [, Builder] of BUILDERS) expect(programs(overlays, Builder)).toBe(4);
  });
});

const FIXTURES = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'));

/**
 * The map fixtures the repository holds (`test-fixtures/RUN/*.ZDB`): Frostfire, MP6 and Crossroads' world. Per map:
 * the world's instanced draws, the programs they linked with three's own instancing, and the programs now (measured
 * by ip5-a, held on both backends by ip5-b, 2026-11-02). Both builders run under the stub's uniform limit, 16,384 bytes
 * (WebGL2's least; the IP5 review's finding 4): real WebGPU allows 65,536, so there a 257-1,024-instance mesh takes the
 * buffer path too and is shared as well -- these are the WebGL2-limit counts.
 */
const MAPS: [string, { meshes: number; before: number; after: number }][] = [
  ['MP2.ZDB', { meshes: 29, before: 29, after: 7 }],
  ['MP6.ZDB', { meshes: 55, before: 55, after: 12 }],
  ['MP72.ZDB', { meshes: 123, before: 123, after: 10 }],
];

for (const [name, want] of MAPS) {
  const absent = fixture(`RUN/${name}`) === null;
  describe.skipIf(absent)(`IP5 on ${name}'s world (the fixture)${absent ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
    it('the instanced draws link one program a graph and count, three\'s own but for the buffer\'s name', async () => {
      const map = await loadMap(new FsAssetSource(FIXTURES), `RUN/${name}`);
      const view = buildWorld(map);
      for (const task of [...view.revealWorld, ...view.revealProps]) task();
      const instanced = instancedUnder(view.group);
      const counts: Record<string, number> = { meshes: instanced.length };
      for (const [label, Builder] of BUILDERS) {
        const before = programs(instanced, Builder, { stock: true });
        const ideal = programs(instanced, Builder, { stock: true, rename: true });
        const after = programs(instanced, Builder);
        counts[`${label} before`] = before;
        counts[`${label} after`] = after;
        // None differs from another by a buffer's id alone.
        expect(after).toBe(ideal);
        expect({ meshes: instanced.length, before, after }).toEqual(want);
      }
      // Every draw's program is three's own but for the buffer's name (each material kind the map has: the shaded and
      // textured draws, the detail passes, the env passes), on both backends.
      const renderer = stubRenderer();
      for (const [, Builder] of BUILDERS) {
        for (const m of instanced) {
          const mine = shaders(renderer, Builder, m), stock = shaders(renderer, Builder, m, true);
          expect(renamed(mine.vertexShader), m.name).toEqual(renamed(stock.vertexShader));
          expect(renamed(mine.fragmentShader), m.name).toEqual(renamed(stock.fragmentShader));
        }
      }
      console.log(`[IP5] ${name}`, JSON.stringify(counts));
      view.dispose();
      for (const b of worldInstanceBuffers().values()) expect(b.reference).toBeNull();
    }, 300_000);
  });
}
