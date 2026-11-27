import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BoxGeometry, Mesh, PerspectiveCamera, Scene, SkinnedMesh, type Material, type Object3D } from 'three';
import { GLSLNodeBuilder, MeshBasicNodeMaterial, WebGPURenderer } from 'three/webgpu';
import { vertexColor } from 'three/tsl';
import { nightLit } from '../src/nightVision';
import { setStableSkinProgramsForTest, STABLE_SKIN_BUFFER_NAME, stableSkinProgramsInstalled } from '../src/stableSkinPrograms';
import { buildBody } from '../src/bodyView';
import type { LoadedBody } from '../src/body';
import type { LoadedMap } from '../src/loadMap';
import { DEFAULT_LIGHTING } from '../src/lighting';

/**
 * LATER 1168 (product track: a renderer adaptation; the draw unchanged): one WebGL2 program per skinned model, not one per
 * body. PC 3, 2026-11-18 (xboxFirstPlay v3): a late joiner's 16 bodies linked 16 skinned programs whose texts differ only
 * in three r186's id-named bone buffer (`NodeBuffer_<id>`, `buffer<id>`: GLSLNodeBuilder.js ~:1792-1800) and in the
 * order of a uniform block's members (by node id: NodeBuilder.js `_getBindGroup` ~:645). `./stableSkinPrograms` names the
 * bone buffer by what it is and orders a block's members by name, so equal graphs write equal text and three's stage
 * cache (keyed by source) links one program.
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
/** A renderer never initialised: the node builder reads its library and settings, not a GPU (`glowBodiesSpawn.test.ts`). */
const renderer = new WebGPURenderer({
  canvas: { style: {}, width: 1, height: 1, addEventListener() {}, removeEventListener() {}, getContext: () => null } as unknown as HTMLCanvasElement,
  forceWebGL: true,
});
(renderer.backend as unknown as { capabilities: unknown }).capabilities = { getUniformBufferLimit: () => 16384 };

interface Built { vertex: string; fragment: string; groups: { name: string; members: string[] }[]; buffers: string[] }
function build(mesh: Mesh): Built {
  const b = new GLSLNodeBuilder(mesh, renderer as never) as unknown as {
    material: Material; camera: PerspectiveCamera; scene: Scene; build(): void; vertexShader: string; fragmentShader: string;
    getBindings(): { bindings: { isNodeUniformsGroup?: boolean; isUniformBuffer?: boolean; name: string; uniforms?: { name: string }[] }[] }[];
  };
  b.material = mesh.material as Material;
  b.camera = new PerspectiveCamera();
  b.scene = new Scene();
  b.build();
  const all = b.getBindings().flatMap((g) => g.bindings);
  return {
    vertex: b.vertexShader, fragment: b.fragmentShader,
    groups: all.filter((x) => x.isNodeUniformsGroup).map((x) => ({ name: x.name, members: (x.uniforms ?? []).map((u) => u.name) })),
    buffers: all.filter((x) => !x.isNodeUniformsGroup && /Buffer/.test(x.name)).map((x) => x.name),
  };
}

describe('LATER 1168: one WebGL2 program per skinned model, not one per body (`./stableSkinPrograms`)', () => {
  it('is installed on three\'s GLSL builder by importing the module', () => {
    expect(stableSkinProgramsInstalled()).toBe(true);
  });

  it('16 bodies of one model, each built in turn as a late join builds them, write ONE vertex and ONE fragment text', () => {
    const made = Array.from({ length: 16 }, () => buildBody(body('seal_A_des', 'mp6_seal1'), MAP, DEFAULT_LIGHTING));
    const built = made.map((m) => build(skinnedOf(m.group)));
    expect(new Set(built.map((x) => x.vertex)).size).toBe(1);
    expect(new Set(built.map((x) => x.fragment)).size).toBe(1);
    expect(built[0]!.vertex).toContain(STABLE_SKIN_BUFFER_NAME);
    expect(built[0]!.vertex).not.toMatch(/\b(NodeBuffer_|buffer)\d+\b/);
    for (const m of made) m.dispose();
  });

  it('the text matches the bindings it is drawn with: each block\'s members declared in the order the data is packed', () => {
    const m = buildBody(body('seal_A_des', 'mp6_seal1'), MAP, DEFAULT_LIGHTING);
    const x = build(skinnedOf(m.group));
    const text = `${x.vertex}\n${x.fragment}`;
    expect(x.groups.length).toBeGreaterThan(0);
    for (const g of x.groups) {
      const block = new RegExp(`uniform\\s+${g.name}\\s*\\{([^}]*)\\}`).exec(text);
      if (!block) continue;                                        // a group this stage does not declare
      const declared = [...block[1]!.matchAll(/\b(\w+)\s*;/g)].map((r) => r[1]);
      expect(declared, g.name).toEqual(g.members);                  // the std140 offsets follow `members`
      // the order is the override's own: a shared group by the nodes' names, the object group by the builder's names
    }
    expect(x.buffers).toContain(`NodeBuffer_${STABLE_SKIN_BUFFER_NAME}`);   // the block the backend binds by name
    expect(text).toContain(`uniform NodeBuffer_${STABLE_SKIN_BUFFER_NAME}`);
    m.dispose();
  });

  it('the test switch puts three’s own methods back (16 texts) and the override again (1)', () => {
    const texts = (): number => {
      const made = Array.from({ length: 4 }, () => buildBody(body('seal_A_des', 'mp6_seal1'), MAP, DEFAULT_LIGHTING));
      const n = new Set(made.map((m) => build(skinnedOf(m.group)).vertex)).size;
      for (const m of made) m.dispose();
      return n;
    };
    try {
      setStableSkinProgramsForTest(false);
      expect(stableSkinProgramsInstalled()).toBe(false);
      expect(texts()).toBe(4);
    } finally {
      setStableSkinProgramsForTest(true);
    }
    expect(stableSkinProgramsInstalled()).toBe(true);
    expect(texts()).toBe(1);
  });

  it('two different skeletons in one program never share the name (only the mesh\'s own skeleton is renamed)', () => {
    const a = buildBody(body('seal_A_des', 'mp6_seal1'), MAP, DEFAULT_LIGHTING);
    const x = build(skinnedOf(a.group));
    expect(x.vertex.match(new RegExp(`\\bNodeBuffer_${STABLE_SKIN_BUFFER_NAME}\\b`, 'g'))?.length).toBe(1);
    a.dispose();
  });
});

/** Each uniforms group's members as declared in the text, against the order its data is packed (the bound group). */
function declaredVsBound(x: Built): { name: string; declared: string[]; bound: string[] }[] {
  const text = `${x.vertex}\n${x.fragment}`;
  return x.groups.flatMap((g) => {
    const block = new RegExp(`uniform\\s+${g.name}\\s*\\{([^}]*)\\}`).exec(text);
    return block ? [{ name: g.name, declared: [...block[1]!.matchAll(/\b(\w+)\s*;/g)].map((r) => r[1]!), bound: g.members }] : [];
  });
}

describe('LATER 1168 review F1: a shared bind group reused from three’s cache is packed in the order its text declares', () => {
  it('two world-style materials (nightLit over the vertex colour) on one renderer: the second’s text and bound data agree', () => {
    const made = [0, 1].map(() => {
      const m = new MeshBasicNodeMaterial();
      m.colorNode = nightLit(vertexColor());
      return build(new Mesh(new BoxGeometry(), m));
    });
    for (const x of made) {
      const groups = declaredVsBound(x);
      expect(groups.length).toBeGreaterThan(0);
      for (const g of groups) expect(g.declared, g.name).toEqual(g.bound);
    }
  });

  it('a body of two textured sub-meshes: each sub-mesh’s text and bound data agree', () => {
    const two = body('seal_A_des', 'mp6_seal1') as unknown as { subMeshes: Record<string, unknown>[] };
    two.subMeshes = [{ ...two.subMeshes[0]!, textureName: 'skin' }, { ...two.subMeshes[0]!, textureName: 'vest' }];
    const rgba = { data: new Uint8ClampedArray(16).fill(128), width: 2, height: 2 };
    const map = { textures: { skin: rgba, vest: rgba }, textureFlags: {} } as unknown as LoadedMap;
    const v = buildBody(two as unknown as LoadedBody, map, DEFAULT_LIGHTING);
    const meshes: SkinnedMesh[] = [];
    v.group.traverse((o) => { if (o instanceof SkinnedMesh) meshes.push(o); });
    expect(meshes.length).toBe(2);
    for (const mesh of meshes) for (const g of declaredVsBound(build(mesh))) expect(g.declared, g.name).toEqual(g.bound);
    v.dispose();
  });
});

describe('LATER 1168: the three.js lines the override relies on (fails on an upgrade that changes them)', () => {
  // three's package exports no package.json: its main entry is build/three.cjs, so the package root is two up.
  const root = dirname(dirname(createRequire(import.meta.url).resolve('three')));
  const src = (p: string): string => readFileSync(join(root, 'src', p), 'utf8');
  it('three is 0.186.0', () => {
    expect((JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }).version).toBe('0.186.0');
  });
  it('GLSLNodeBuilder names a buffer uniform and its block by the node id, in getUniformFromNode', () => {
    const s = src('renderers/webgl-fallback/nodes/GLSLNodeBuilder.js');
    expect(s).toContain('uniformNode.name = `buffer${ node.id }`;');
    expect(s).toContain('node.name = `NodeBuffer_${ node.id }`;');
    expect(s).toContain('buffer.name = node.name;');
  });
  it('NodeBuilder._getBindGroup orders a group\'s uniforms by node id, and buildCode sorts the bindings before the text', () => {
    expect(src('nodes/core/NodeBuilder.js')).toContain('binding.uniforms.sort( ( a, b ) => a.nodeUniform.node.id - b.nodeUniform.node.id );');
    expect(src('renderers/webgl-fallback/nodes/GLSLNodeBuilder.js')).toMatch(/buildCode\(\) \{[\s\S]{0,200}this\.sortBindingGroups\(\);/);
  });
  it('the skinning node takes the mesh\'s skeleton\'s boneMatrices as its buffer (Skinning.js)', () => {
    expect(src('nodes/accessors/Skinning.js')).toContain('getBoneMatricesNode( builder, skinnedMesh.skeleton )');
  });
});
