import type { BufferGeometry, InstancedBufferAttribute, InstancedMesh, Object3D } from 'three';
import { MeshBasicNodeMaterial, type Node, type NodeBuilder } from 'three/webgpu';
import { Fn, instanceIndex, normalLocal, positionLocal, referenceBuffer, subBuild, transformNormal } from 'three/tsl';

/**
 * IP5 (a renderer-internal adaptation, product track: nothing drawn changes): the world's own instanced meshes -- the
 * props drawn in several placements, and the detail and env passes hung under them -- share their vertex programs.
 *
 * Why each linked its own (three 0.186): an instanced object is built on its own -- its render object's material key
 * takes `object.uuid` for any `isInstancedMesh` (`src/renderers/common/RenderObject.js` L846-852) -- and each build's
 * instancing (`NodeMaterial.setupPosition` L798-800 -> `src/nodes/accessors/Instance.js` L123-250) makes a new
 * `buffer(instanceMatrix.array, 'mat4', n)` node (`Instance.js` L45), which the shader names by its process-global node
 * id (WGSL: `src/renderers/webgpu/nodes/WGSLNodeBuilder.js` L1398 `'NodeBuffer_' + uniformNode.id`; GLSL:
 * `src/renderers/webgl-fallback/nodes/GLSLNodeBuilder.js` L1792 `buffer${ node.id }` and L1800). Programs are cached by
 * their code (`src/renderers/common/Pipelines.js` L187-208), so two builds that differ by that id alone link two.
 *
 * The design: one buffer node per instance count, shared by every world material's build -- the same node, so the
 * same id and the same name in every program. It is a `referenceBuffer('instanceMatrix.array', 'mat4', n)` with no
 * object, the node three's skinning reads `skeleton.boneMatrices` through (`src/nodes/accessors/Skinning.js` L66):
 * at each build and before each draw it takes the drawn object as its reference (`Node.js` L915 before `setup`,
 * `NodeFrame.js` L261-298 before `update`; `ReferenceNode.js` L273-279) and its value is that object's own
 * `instanceMatrix.array` (`ReferenceNode.js` L310-326), uploaded by the render object's own binding -- an object-group
 * buffer is cloned per render object (`NodeBuilderState.createBindings` L135-144; `UniformNode.js` L55 puts a
 * uniform in `objectGroup`, which is not shared) and written after the node's update, every draw
 * (`Renderer.js` L1072-1074; `Buffer.update` returns true, `Bindings.js` L399-405), as three's own buffer is. The
 * shader around it is three's instancing line for line: the same matrix times `positionLocal` (`Instance.js`
 * L206-207) and the same `transformNormal` of `normalLocal` when the geometry has normals (L235-240; the env pass
 * reads `normalWorld`), then the material's own `positionNode` (`NodeMaterial.js` L804-808).
 *
 * Three's own instancing stays wherever this would be anything else: a buffer over the backend's uniform limit (the
 * interleaved attributes, `Instance.js` L41-69), a storage buffer (L33-37), instance colours (L145-173, L244-248), a
 * previous-frame matrix for motion vectors (L209-231), and morph targets, skinning, displacement or batching ahead of
 * the instancing (`NodeMaterial.js` L770-796). A mesh that is not instanced is never touched.
 */
export class WorldMeshMaterial extends MeshBasicNodeMaterial {
  /** Three's `setupPosition` (`NodeMaterial.js` L766-812) with its instancing read through `sharedMatrices`. */
  override setupPosition(builder: NodeBuilder): Node {
    const matrices = sharedMatrices(builder, this);
    if (matrices === null) return super.setupPosition(builder);
    sharedInstance(matrices);
    if (this.positionNode !== null) positionLocal.assign(subBuild(this.positionNode, 'POSITION', 'vec3'));
    return positionLocal;
  }
}

/** What of `NodeBuilder` the choice reads, beside the declared type (`NodeBuilder.js` L931, L1491, L3464). */
interface BuilderReads {
  object: Object3D | null;
  geometry: BufferGeometry;
  getUniformBufferLimit(): number;
  needsPreviousData(): boolean;
  hasGeometryAttribute(name: string): boolean;
}

type MatrixBuffer = ReturnType<typeof referenceBuffer<'mat4', null>>;
/** The shared instance-matrix buffers, one per instance count. */
const buffers = new Map<number, MatrixBuffer>();

/** The shared buffer `builder`'s object reads its placements through, or null: three's own instancing. */
function sharedMatrices(nodeBuilder: NodeBuilder, material: MeshBasicNodeMaterial): MatrixBuffer | null {
  const builder = nodeBuilder as unknown as BuilderReads;
  const object = builder.object as (InstancedMesh & { isBatchedMesh?: boolean; isSkinnedMesh?: boolean }) | null;
  if (!object || object.isInstancedMesh !== true) return null;
  const matrices = object.instanceMatrix as InstancedBufferAttribute & { isStorageInstancedBufferAttribute?: boolean } | undefined;
  // `NodeMaterial.setupPosition` L798: three instances only an instanced attribute; anything else is left as it is.
  if (!matrices || matrices.isInstancedBufferAttribute !== true || matrices.isStorageInstancedBufferAttribute === true) return null;
  if (object.instanceColor || object.isSkinnedMesh === true || object.isBatchedMesh === true || (material as { displacementMap?: unknown }).displacementMap) return null;
  const { morphAttributes } = builder.geometry;
  if (morphAttributes.position || morphAttributes.normal || morphAttributes.color) return null;
  if (builder.needsPreviousData()) return null;
  // `Instance.js` L31, L41-43: the uniform buffer three would make, or its interleaved attributes past the limit.
  const count = Math.max(matrices.count, 1);
  if (count * 16 * 4 > builder.getUniformBufferLimit()) return null;
  let buffer = buffers.get(count);
  if (!buffer) {
    buffer = referenceBuffer('instanceMatrix.array', 'mat4', count, null);
    buffers.set(count, buffer);
  }
  return buffer;
}

/** `Instance.js` L123-250's `instance` for an uncoloured mesh, its matrix node the shared buffer's element. */
const sharedInstance = Fn(([matrices]: [MatrixBuffer], nodeBuilder: NodeBuilder) => {
  const builder = nodeBuilder as unknown as BuilderReads;
  const instanceMatrixNode = (matrices as unknown as { element(i: Node): Node<'mat4'> }).element(instanceIndex);
  // POSITION (L206-207)
  const instancePosition = instanceMatrixNode.mul(positionLocal).xyz;
  positionLocal.assign(instancePosition);
  // NORMAL (L235-240)
  if (builder.hasGeometryAttribute('normal')) {
    const instanceNormal = transformNormal(normalLocal, instanceMatrixNode);
    normalLocal.assign(instanceNormal);
  }
}, 'void');

/**
 * Lets the shared buffers drop the object they last read (a disposed world's mesh, its geometry and textures). Safe
 * while another world draws: each build and each draw sets the reference again before reading it (`Node.js` L915,
 * `NodeFrame.js` L264). Not everything goes (the IP5 review's finding 1): each count's buffer node keeps the last matrix
 * array it was given, and three's shared binding template (`NodeBuilder.js` L3304-3310, `Buffer.js` L45) the first one
 * -- about count x 64 bytes a count, bounded and not growing.
 */
export function releaseWorldInstancing(): void {
  for (const buffer of buffers.values()) buffer.reference = null;
}

/** The shared buffers, for the tests. */
export function worldInstanceBuffers(): ReadonlyMap<number, { readonly reference: unknown; readonly node: Node | null }> {
  return buffers;
}
