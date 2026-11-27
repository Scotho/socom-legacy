import { describe, expect, it } from 'vitest';
import { Bone, BoxGeometry, Float32BufferAttribute, Group, Mesh, PerspectiveCamera, Scene, Skeleton, SkinnedMesh, Uint16BufferAttribute, type Material, type Object3D } from 'three';
import { GLSLNodeBuilder, MeshBasicNodeMaterial, WGSLNodeBuilder, WebGPURenderer } from 'three/webgpu';
import { EffectLights, MAX_LIGHTS } from '../src/effectLights';

/**
 * LATER 1544: the effect lights' pass is VuLightMap's (`FUN_003b5b90` calls `FUN_003b54e0` with command 0x3a,
 * D:L307746), which folds each light's colour through the lens row on the EE while the flag `0x4b4a68` is up
 * (D:L307483-307498): row 2 (`0x4b4c90`) for a CMesh -- the character's skinned mesh, visual type 1 (research 78
 * s2.5) -- row 0 (`0x4b4c70`) for any other visual. The pass's fragment program must read the lens flag and the row
 * its receiver takes: the world's `nightRow`, the skinned body's `nightHot`.
 */

type BuilderClass = typeof GLSLNodeBuilder | typeof WGSLNodeBuilder;

function stubRenderer(): WebGPURenderer {
  const renderer = new WebGPURenderer({ canvas: { style: {}, width: 1, height: 1, addEventListener() {}, removeEventListener() {}, getContext: () => null } as unknown as HTMLCanvasElement, forceWebGL: true });
  renderer.hasFeature = () => false;
  Object.assign(renderer.backend, { utils: { getTextureSampleData: () => ({ primarySamples: 1 }) }, capabilities: { getUniformBufferLimit: () => 16384 } });
  return renderer;
}

function fragmentShader(Builder: BuilderClass, mesh: Mesh): string {
  const b = new Builder(mesh, stubRenderer() as never) as unknown as { material: Material; camera: PerspectiveCamera; scene: Scene; build(): void; fragmentShader: string };
  b.material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as Material;
  b.camera = new PerspectiveCamera();
  b.scene = new Scene();
  b.build();
  return b.fragmentShader;
}

function skinned(): SkinnedMesh {
  const g = new BoxGeometry();
  const n = g.getAttribute('position').count;
  g.setAttribute('skinIndex', new Uint16BufferAttribute(new Array(n * 4).fill(0), 4));
  g.setAttribute('skinWeight', new Float32BufferAttribute(new Array(n).fill([1, 0, 0, 0]).flat(), 4));
  const bone = new Bone();
  const m = new SkinnedMesh(g, new MeshBasicNodeMaterial());
  m.add(bone);
  m.bind(new Skeleton([bone]));
  return m;
}

const overlaysOf = (root: Object3D, receiver: Mesh): Mesh[] => {
  const out: Mesh[] = [];
  root.traverse((o) => { if ((o as Mesh).isMesh && o.userData.effectLightPass && (o as Mesh).geometry === receiver.geometry) out.push(o as Mesh); });
  return out;
};

describe('LATER 1544: the effect lights\' colour through the lens (VuLightMap\'s EE fold)', () => {
  const root = new Group();
  const world = new Mesh(new BoxGeometry(), new MeshBasicNodeMaterial());
  const body = skinned();
  root.add(world, body);
  const lights = new EffectLights();
  lights.setReceivers(() => [root]);
  lights.warmMeshes();

  for (const [label, Builder] of [['WGSL (WebGPU)', WGSLNodeBuilder], ['GLSL (WebGL2)', GLSLNodeBuilder]] as [string, BuilderClass][]) {
    it(`${label}: the world's overlays read the lens flag and row 0`, () => {
      const pair = overlaysOf(root, world);
      expect(pair).toHaveLength(2);
      for (const o of pair) {
        const s = fragmentShader(Builder, o);
        expect(s).toMatch(/nightOn/);
        expect(s).toMatch(/nightRow/);
        expect(s).not.toMatch(/nightHot/);
      }
    });

    it(`${label}: the skinned body's overlays (a CMesh) read the lens flag and row 2`, () => {
      const pair = overlaysOf(root, body);
      expect(pair).toHaveLength(2);
      for (const o of pair) {
        const s = fragmentShader(Builder, o);
        expect(s).toMatch(/nightOn/);
        expect(s).toMatch(/nightHot/);
        expect(s).not.toMatch(/nightRow/);
      }
    });
  }
});

describe('LATER 1544: the fold\'s arithmetic as the WebGL2 program emits it', () => {
  // The CPU twin (`lightMapColour`, nightVision.test.ts) holds the numbers; this holds the program to the same form,
  // c'.xyz = row.xyz * (R + G + B + row.z / 255), once a light slot: a w for the z, a lost /255 or a dropped channel fails.
  const root = new Group();
  const world = new Mesh(new BoxGeometry(), new MeshBasicNodeMaterial());
  const body = skinned();
  root.add(world, body);
  const lights = new EffectLights();
  lights.setReceivers(() => [root]);
  lights.warmMeshes();
  for (const [label, receiver, name] of [['the world (row 0)', world, 'nightRow'], ['the skinned body (row 2)', body, 'nightHot']] as const) {
    it(`${label}: ${name}.xyz * (rgb.x + rgb.y + rgb.z + ${name}.z / 255), one a slot`, () => {
      const form = new RegExp(String.raw`\b${name}\.xyz \* vec3\( \( \( \( (\w+)\.x \+ \1\.y \) \+ \1\.z \) \+ \( ${name}\.z / 255\.0 \) \) \)`, 'g');
      for (const o of overlaysOf(root, receiver)) {
        expect(fragmentShader(GLSLNodeBuilder, o).match(form)).toHaveLength(MAX_LIGHTS);
      }
    });
  }
});
