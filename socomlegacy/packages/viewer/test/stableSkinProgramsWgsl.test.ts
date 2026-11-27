import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Mesh, PerspectiveCamera, Scene, SkinnedMesh, type Material, type Object3D } from 'three';
import { WGSLNodeBuilder, WebGPURenderer } from 'three/webgpu';
import { setStableSkinProgramsForTest, STABLE_SKIN_BUFFER_NAME, stableSkinWgslInstalled } from '../src/stableSkinPrograms';
import { buildBody } from '../src/bodyView';
import type { LoadedBody } from '../src/body';
import type { LoadedMap } from '../src/loadMap';
import { DEFAULT_LIGHTING } from '../src/lighting';

/**
 * LATER 772 (product track, as LATER 1168: a renderer adaptation, the draw unchanged): one WebGPU shader module per skinned
 * model, not one per body. three r186's WGSL builder names a buffer uniform by its node's id (`'NodeBuffer_' +
 * uniformNode.id`, WGSLNodeBuilder.js ~:1398) and the shared `_getBindGroup` orders a uniforms struct's members by node id
 * (NodeBuilder.js ~:645), so every remote body wrote its own WGSL text and three's pipeline cache (keyed by the stage's text)
 * built a module and a pipeline per body -- at the first flash, 12-14 in one frame. `./stableSkinPrograms` now does on the
 * WGSL builder what 1168 does on the GLSL one.
 */
/** A body of three parts and one skinned triangle (`glowBodiesSpawn.test.ts`'s). */
function body(model: string, character: string): LoadedBody {
  const I = Float32Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
  const part = (name: string, parent: number) => ({ name, parent, bindLocal: Float32Array.from(I), bindWorld: Float32Array.from(I), bbox: Float32Array.of(-1, -1, -1, 1, 1, 1) });
  return {
    character, model, dressedBy: 'character.rdr', textureAsset: null,
    parts: [part('skel_root', -1), part('hips', 0), part('rhand', 1)],
    subMeshes: [{
      textureName: null, fog: true, positions: Float32Array.of(0, 0, 0, 1, 0, 0, 0, 1, 0), normals: Float32Array.of(0, 0, 1, 0, 0, 1, 0, 0, 1),
      uvs: new Float32Array(6), indices: Uint32Array.of(0, 1, 2), skinIndex: new Uint16Array(12), skinWeight: Float32Array.of(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0),
    }],
    fittings: [], missing: [], at: null, height: 19, eye: null, carries: { rifle: null, pistol: null },
    stats: { vertices: 3, triangles: 1, parts: 3, subMeshes: 1, batches: 1, maxInfluences: 1, droppedWeight: 0, fittings: 0 },
  } as unknown as LoadedBody;
}
const MAP = { textures: {}, textureFlags: {} } as unknown as LoadedMap;
const skinnedOf = (root: Object3D): SkinnedMesh => {
  let found: SkinnedMesh | null = null;
  root.traverse((o) => { if (!found && o instanceof SkinnedMesh) found = o; });
  return found!;
};
/** A renderer never initialised, on WebGPU's backend: the node builder reads its library and settings, not a GPU. */
const renderer = new WebGPURenderer({
  canvas: { style: {}, width: 1, height: 1, addEventListener() {}, removeEventListener() {}, getContext: () => null } as unknown as HTMLCanvasElement,
});
(renderer.backend as unknown as { capabilities: unknown }).capabilities = { getUniformBufferLimit: () => 16384 };

interface Built { vertex: string; fragment: string; groups: { name: string; members: string[] }[] }
function build(mesh: Mesh): Built {
  const b = new WGSLNodeBuilder(mesh, renderer as never) as unknown as {
    material: Material; camera: PerspectiveCamera; scene: Scene; build(): void; vertexShader: string; fragmentShader: string;
    getBindings(): { bindings: { isNodeUniformsGroup?: boolean; name: string; uniforms?: { name: string }[] }[] }[];
  };
  b.material = mesh.material as Material;
  b.camera = new PerspectiveCamera();
  b.scene = new Scene();
  b.build();
  const all = b.getBindings().flatMap((g) => g.bindings);
  return {
    vertex: b.vertexShader, fragment: b.fragmentShader,
    groups: all.filter((x) => x.isNodeUniformsGroup).map((x) => ({ name: x.name, members: (x.uniforms ?? []).map((u) => u.name) })),
  };
}

describe('LATER 772: one WebGPU shader module per skinned model, not one per body (`./stableSkinPrograms`)', () => {
  it('is installed on three\'s WGSL builder by importing the module', () => {
    expect(stableSkinWgslInstalled()).toBe(true);
  });

  it('16 bodies of one model, each built in turn as a late join builds them, write ONE vertex and ONE fragment WGSL text', () => {
    const made = Array.from({ length: 16 }, () => buildBody(body('seal_A_des', 'mp6_seal1'), MAP, DEFAULT_LIGHTING));
    const built = made.map((m) => build(skinnedOf(m.group)));
    expect(new Set(built.map((x) => x.vertex)).size).toBe(1);
    expect(new Set(built.map((x) => x.fragment)).size).toBe(1);
    expect(built[0]!.vertex).toContain(`NodeBuffer_${STABLE_SKIN_BUFFER_NAME}`);
    expect(built[0]!.vertex).not.toMatch(/\bNodeBuffer_\d+\b/);
    for (const m of made) m.dispose();
  });

  it('each uniforms struct declares its members in the order its data is packed (the bound group)', () => {
    const m = buildBody(body('seal_A_des', 'mp6_seal1'), MAP, DEFAULT_LIGHTING);
    const x = build(skinnedOf(m.group));
    const text = `${x.vertex}\n${x.fragment}`;
    let seen = 0;
    for (const g of x.groups) {
      const struct = new RegExp(`struct\\s+${g.name}Struct\\s*\\{([^}]*)\\}`).exec(text);
      if (!struct) continue;
      seen++;
      const declared = [...struct[1]!.matchAll(/\b(\w+)\s*:/g)].map((r) => r[1]);
      expect(declared, g.name).toEqual(g.members);
    }
    expect(seen).toBeGreaterThan(0);
    m.dispose();
  });

  it('review F1: the test switch puts three\'s own WGSL methods back too (4 texts for 4 bodies) and the override again (1)', () => {
    const texts = (): number => {
      const made = Array.from({ length: 4 }, () => buildBody(body('seal_A_des', 'mp6_seal1'), MAP, DEFAULT_LIGHTING));
      const n = new Set(made.map((m) => build(skinnedOf(m.group)).vertex)).size;
      for (const m of made) m.dispose();
      return n;
    };
    try {
      setStableSkinProgramsForTest(false);
      expect(stableSkinWgslInstalled()).toBe(false);
      expect(texts()).toBe(4);
    } finally {
      setStableSkinProgramsForTest(true);
    }
    expect(stableSkinWgslInstalled()).toBe(true);
    expect(texts()).toBe(1);
  });

  it('three\'s WGSL builder still names a buffer uniform by its node id in getUniformFromNode (fails on an upgrade that changes it)', () => {
    const root = dirname(dirname(createRequire(import.meta.url).resolve('three')));
    const s = readFileSync(join(root, 'src/renderers/webgpu/nodes/WGSLNodeBuilder.js'), 'utf8');
    expect(s).toContain("uniformNode.name = name ? name : 'NodeBuffer_' + uniformNode.id;");
    expect(s).toMatch(/buildCode\(\) \{[\s\S]{0,400}this\.sortBindingGroups\(\);/);
  });

  it('the mesh\'s own skeleton only: the name is declared once', () => {
    const a = buildBody(body('seal_A_des', 'mp6_seal1'), MAP, DEFAULT_LIGHTING);
    const x = build(skinnedOf(a.group));
    expect(x.vertex.match(new RegExp(`var<uniform>\\s+NodeBuffer_${STABLE_SKIN_BUFFER_NAME}\\b`, 'g'))?.length).toBe(1);
    a.dispose();
  });
});
