import { describe, expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry, Mesh, PerspectiveCamera, Scene, type Material } from 'three';
import { GLSLNodeBuilder, MeshBasicNodeMaterial, WebGPURenderer, WGSLNodeBuilder, type Node } from 'three/webgpu';
import { vec4, vertexColor } from 'three/tsl';
import type { LoadedBody } from '../src/body';
import { buildBody } from '../src/bodyView';
import { DEFAULT_LIGHTING } from '../src/lighting';
import { nightLit } from '../src/nightVision';
import { rigShading } from '../src/rigShading';

/**
 * The lit colour's shader as three.js r186 writes it, for both of the page's backends (GLSL for WebGL2, WGSL for
 * WebGPU), built here without a GPU. The owner's report (2026-10-04, tonight's build): the player's SEAL drew jet black
 * in third person on Frostfire and Crossroads while the world was lit. PF-07b had put `nightLit` through the flashbang's
 * wash, a second `select` over the night vision's: three regenerates that inner conditional in each branch of the outer
 * one and reuses the temporaries it cached in the first, so the wash-off branch (every frame without a flashbang) read a
 * temporary only the other branch assigns -- zero, a black body. The world's lit colour is the bare vertex colour (no
 * temporary), which is why the world stayed lit. A shader that reads a temporary on a path that never assigned it is
 * the defect, checked here on the code three writes.
 */

/** A renderer that is never initialised: the node builders read its library and settings, not a GPU. */
const renderer = new WebGPURenderer({
  canvas: { style: {}, width: 1, height: 1, addEventListener() {}, removeEventListener() {}, getContext: () => null } as unknown as HTMLCanvasElement,
  forceWebGL: true,
});
// The skinning's bone matrices ask the backend's uniform-buffer limit: WebGL2's least MAX_UNIFORM_BLOCK_SIZE, 16384.
(renderer.backend as unknown as { capabilities: unknown }).capabilities = { getUniformBufferLimit: () => 16384 };

type Builder = typeof GLSLNodeBuilder | typeof WGSLNodeBuilder;

/** The fragment shader three writes for a mesh's material. */
function fragmentOf(mesh: Mesh, B: Builder): string {
  // The builder's members the typings leave out (three r186's NodeBuilder declares them in JavaScript).
  const b = new B(mesh, renderer as never) as unknown as {
    material: Material; camera: PerspectiveCamera; scene: Scene; build(): void; fragmentShader: string;
  };
  b.material = mesh.material as Material;
  b.camera = new PerspectiveCamera();
  b.scene = new Scene();
  b.build();
  return b.fragmentShader;
}

/**
 * The temporaries (`nodeVarN`) the shader's `main` reads on a path that has not assigned them: a block's assignments
 * hold after it only when both arms of an if/else made them.
 */
function unassignedReads(shader: string): string[] {
  const start = shader.search(/\bmain\s*\(/);
  const lines = shader.slice(start).split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('//'));
  type Frame = { before: Set<string>; then: Set<string> | null; branch: boolean };
  const stack: Frame[] = [];
  let assigned = new Set<string>();
  const bad: string[] = [];
  const read = (text: string): void => {
    for (const m of text.matchAll(/\bnodeVar\d+\b/g)) if (!assigned.has(m[0]) && !bad.includes(m[0])) bad.push(m[0]);
  };
  for (const line of lines) {
    if (/^\}\s*else\s*\{$/.test(line)) {
      const f = stack[stack.length - 1]!;
      f.then = assigned;
      assigned = new Set(f.before);
      continue;
    }
    if (line.startsWith('}')) {
      const f = stack.pop();
      if (f?.branch) assigned = f.then ? new Set([...f.then].filter((v) => assigned.has(v))) : f.before;
      continue;
    }
    if (/^if\b/.test(line) && line.endsWith('{')) {
      read(line);
      stack.push({ before: new Set(assigned), then: null, branch: true });
      assigned = new Set(assigned);
      continue;
    }
    if (line.endsWith('{')) { stack.push({ before: assigned, then: null, branch: false }); continue; }
    if (/^var\s+nodeVar\d+\s*:[^=]*;$/.test(line)) continue;                 // WGSL's declaration, no value
    const store = /^(?:var\s+)?(nodeVar\d+)\s*(?::[^=]*)?=(?!=)(.*)$/.exec(line);
    if (store) { read(store[2]!); assigned.add(store[1]!); } else read(line);
  }
  return bad;
}

/** The smallest body `buildBody` takes: one part, one untextured and one textured sub-mesh of one triangle. */
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

const BUILDERS: [string, Builder][] = [['GLSL (WebGL2)', GLSLNodeBuilder], ['WGSL (WebGPU)', WGSLNodeBuilder]];

describe('the lit colour\'s shader reads no temporary it did not assign (the black SEAL, 2026-10-04)', () => {
  it('the checker itself: a temporary assigned in one arm only is read unassigned after the if', () => {
    const shader = 'void main() {\n\tif ( a ) {\n\t\tnodeVar1 = x;\n\t} else {\n\t\tnodeVar2 = y;\n\t}\n\tfragColor = nodeVar1 + nodeVar2;\n}';
    expect(unassignedReads(shader)).toEqual(['nodeVar1', 'nodeVar2']);
    const both = 'void main() {\n\tif ( a ) {\n\t\tnodeVar1 = x;\n\t} else {\n\t\tnodeVar1 = y;\n\t}\n\tfragColor = nodeVar1;\n}';
    expect(unassignedReads(both)).toEqual([]);
  });

  for (const [name, B] of BUILDERS) {
    it(`the body's materials (bodyView: the rig's lit colour through nightLit, row 2), ${name}`, () => {
      const { body, map } = tinyBody();
      const view = buildBody(body, map as never, DEFAULT_LIGHTING);
      const meshes: Mesh[] = [];
      view.group.traverse((o) => { if ((o as Mesh).isMesh) meshes.push(o as Mesh); });
      expect(meshes.length).toBe(2);
      // WGSL's texture binding asks an initialised device; the textured material's lit colour is the same graph, which
      // the GLSL build covers, so WGSL builds the untextured one.
      for (const mesh of B === WGSLNodeBuilder ? meshes.filter((m) => !(m.material as MeshBasicNodeMaterial).map) : meshes) {
        const material = mesh.material as Material;
        expect(unassignedReads(fragmentOf(mesh, B)), material.name).toEqual([]);
      }
      view.dispose();
    });

    it(`nightLit over any lit colour three keeps in a temporary, rows 0 and 2, ${name}`, () => {
      for (const heat of [0, 2] as const) {
        const rig = rigShading(null);
        const material = new MeshBasicNodeMaterial();
        material.colorNode = vec4(nightLit(vec4(vertexColor().rgb.mul(rig.lit), vertexColor().a) as Node<'vec4'>, heat)).clamp(0, 1);
        const g = new BufferGeometry();
        g.setAttribute('position', new BufferAttribute(new Float32Array(9), 3));
        g.setAttribute('normal', new BufferAttribute(new Float32Array(9), 3));
        g.setAttribute('color', new BufferAttribute(new Float32Array(12), 4));
        expect(unassignedReads(fragmentOf(new Mesh(g, material), B)), `heat ${heat}`).toEqual([]);
      }
    });
  }
});
