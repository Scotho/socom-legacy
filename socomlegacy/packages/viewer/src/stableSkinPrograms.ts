import { GLSLNodeBuilder, WGSLNodeBuilder } from 'three/webgpu';

/**
 * LATER 1168 (product track only if the draw is byte-identical -- see the record; a renderer adaptation of three's WebGL2
 * code generation: the program text is reordered and one name chosen): one WebGL2 program per skinned model, not one per
 * body. (Its first version, 5c4c1d2995, was NOT byte-identical: the review's F1, below.)
 *
 * Why: three r186's WebGL2 backend reuses a compiled stage only when its source text is equal (`Pipelines.js` ~:184-203),
 * and two bodies of one model wrote different texts for two reasons, neither in the graph:
 * 1. the bone matrices' uniform buffer -- a fresh node per build (`Skinning.js` `getBoneMatricesNode`, a
 *    `referenceBuffer('skeleton.boneMatrices', 'mat4', bones)`) -- is named by the node's id, `NodeBuffer_<id>` for its
 *    block and `buffer<id>` for its array (`GLSLNodeBuilder.js` `getUniformFromNode` ~:1792-1800);
 * 2. a uniform block's members are ordered by node id (`NodeBuilder.js` `_getBindGroup` ~:645), and the ids of the
 *    nodes three makes lazily (the camera's) fall before or after a body's own depending on when it was built.
 * On PC 3 (2026-11-18, xboxFirstPlay v3) a late joiner's 16 bodies linked 16 programs; with (1) and (2) normalised,
 * their texts are one. So:
 * 1. the mesh's own bone buffer -- a `mat4` buffer the length of its skeleton, built for a `SkinnedMesh` -- is named
 *    `NodeBuffer_skinBones` / `skinBones` (a program draws one skeleton; the backend binds the block by this name, so
 *    the binding object three made for it -- its `nodeData.uniformGPU` -- is renamed with it);
 * 2. each shared uniforms group's members (render, frame) are ordered by a key of the NODE -- its `setName` name,
 *    unnamed ones first, ties by node id -- and a group not shared (object) by the builder's own names, after three's sort and before the text is written (`buildCode` sorts the bindings first). BOTH the
 *    builder's own groups (which write its text) and the groups `_getBindGroup` returns are sorted: on a shared group
 *    three may return a group cached from an earlier builder over the same nodes (`_bindingGroupsCache`, keyed by the
 *    node ids), and that one is what is packed and bound. The review of 5c4c1d2995 (F1) found the first version sorting
 *    only the returned group, by the builder's uniform names: on a cache hit a second world material and a body's second
 *    sub-mesh declared one order and were packed in another. A key of the node is the same in every builder, so a hit
 *    and a miss order the same nodes alike (`test/stableSkinPrograms.test.ts`, the cache-hit cases).
 * LATER 772 (2026-11-18): the same on WebGPU's builder (`WGSLNodeBuilder`) -- it names a buffer uniform
 * `'NodeBuffer_' + uniformNode.id` (`WGSLNodeBuilder.js` ~:1398), the WGSL variable the shader reads (`<name>.value`), and
 * its uniforms structs come from the same shared `_getBindGroup`; the WGSL name is `NodeBuffer_skinBones` (WebGPU binds by
 * index, so only the text changes). Installed once on each builder, on import (`./renderer`).
 * `test/stableSkinPrograms.test.ts` pins the three lines this relies on and fails on an upgrade that changes them.
 */
export const STABLE_SKIN_BUFFER_NAME = 'skinBones';

interface BufferNodeLike { isBufferNode?: boolean; bufferType?: string; bufferCount?: number; value?: unknown; name?: string }
interface MeshLike { isSkinnedMesh?: boolean; skeleton?: { bones: unknown[]; boneMatrices?: unknown } | null; instanceMatrix?: { array?: unknown } | null }
interface MemberLike { name: string; nodeUniform?: { node?: { id: number; name?: string | null } } }
interface UniformsGroupLike { isNodeUniformsGroup?: boolean; groupNode?: { shared?: boolean }; uniforms: MemberLike[] }
interface BuilderProto {
  object?: MeshLike | null;
  getUniformFromNode(node: BufferNodeLike, type: string, shaderStage?: string, name?: string | null): { name: string };
  globalCache: unknown;
  shaderStage: string;
  getDataFromNode(node: BufferNodeLike, shaderStage?: string, cache?: unknown): { uniformGPU?: { name: string } };
  _getBindGroup(groupName: string, bindings: unknown[]): { bindings: UniformsGroupLike[] };
  __s2uStableSkin?: true;
}

/** Whether `node` is `mesh`'s own bone-matrix buffer (three's `getBoneMatricesNode` under the buffer limit). */
export function isOwnBoneBuffer(node: BufferNodeLike, mesh: MeshLike | null | undefined): boolean {
  const skeleton = mesh?.isSkinnedMesh ? mesh.skeleton : null;
  if (!skeleton || node.isBufferNode !== true || node.bufferType !== 'mat4' || node.bufferCount !== skeleton.bones.length) return false;
  if (node.value != null && node.value !== skeleton.boneMatrices) return false;      // set: it must be this skeleton's
  return !(mesh?.instanceMatrix && node.value === mesh.instanceMatrix.array);
}

/** The node's own key: its `setName` name ('' when unnamed, first), then its id -- the same in every builder. */
const byNode = (a: MemberLike, b: MemberLike): number => {
  const na = a.nodeUniform?.node?.name ?? '', nb = b.nodeUniform?.node?.name ?? '';
  return na < nb ? -1 : na > nb ? 1 : (a.nodeUniform?.node?.id ?? 0) - (b.nodeUniform?.node?.id ?? 0);
};
/** The builder's own uniform name (`nodeUniform<n>` numbered in build order), then the node's id. */
const byBuilderName = (a: MemberLike, b: MemberLike): number =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : (a.nodeUniform?.node?.id ?? 0) - (b.nodeUniform?.node?.id ?? 0);
/**
 * A shared group (render, frame) may be bound from three's cache, built by another builder over the same nodes: ordered by
 * the node's key, the same in every builder. A group not shared (object) is never cached -- its own array is both written
 * and packed -- so it is ordered by the builder's names, which follow the graph's structure, not its nodes' ids.
 */
const sortGroups = (groups: readonly unknown[]): void => {
  for (const g of groups as UniformsGroupLike[]) if (g?.isNodeUniformsGroup) g.uniforms.sort(g.groupNode?.shared ? byNode : byBuilderName);
};

const proto = GLSLNodeBuilder.prototype as unknown as BuilderProto;
/** three's own two methods, kept for the test switch (`setStableSkinProgramsForTest`). */
const threeGetUniformFromNode = proto.getUniformFromNode;
const threeGetBindGroup = proto._getBindGroup;
/** LATER 772: WebGPU's builder, its own `getUniformFromNode` (the shared `_getBindGroup` is NodeBuilder's). */
const wgslProto = WGSLNodeBuilder.prototype as unknown as BuilderProto;
const threeWgslGetUniformFromNode = wgslProto.getUniformFromNode;

function install(): void {
  overrideOn(proto, STABLE_SKIN_BUFFER_NAME);
  overrideOn(wgslProto, `NodeBuffer_${STABLE_SKIN_BUFFER_NAME}`);            // LATER 772: WGSL's variable is the buffer's name
}

/** Wraps a builder's two methods once; `uniformName` is what that language's text calls the bone buffer. */
function overrideOn(target: BuilderProto, uniformName: string): void {
  if (Object.prototype.hasOwnProperty.call(target, '__s2uStableSkin')) return;
  const getUniformFromNode = target.getUniformFromNode;
  const getBindGroup = target._getBindGroup;
  target.getUniformFromNode = function (this: BuilderProto, node, type, shaderStage, name = null) {
    const uniform = getUniformFromNode.call(this, node, type, shaderStage, name);
    if (type === 'buffer' && isOwnBoneBuffer(node, this.object)) {
      uniform.name = uniformName;
      node.name = `NodeBuffer_${STABLE_SKIN_BUFFER_NAME}`;
      // The binding object three made for it (`nodeData.uniformGPU`, the `NodeUniformBuffer` pushed to the bindings).
      const made = this.getDataFromNode(node, shaderStage ?? this.shaderStage, this.globalCache).uniformGPU;
      if (made) made.name = node.name;
    }
    return uniform;
  };
  target._getBindGroup = function (this: BuilderProto, groupName, bindings) {
    const group = getBindGroup.call(this, groupName, bindings);
    sortGroups(bindings);                               // the builder's own: its text is written from these
    sortGroups(group.bindings);                         // the bound ones (a cached group on a hit): packed from these
    return group;
  };
  target.__s2uStableSkin = true;
}
install();

/**
 * Tests only (the draw-identity comparison, `e2e/stableSkinScene.ts`): three's own methods back (false) or the override
 * again (true). The page never calls it. Only BETWEEN renderers (the re-review's F4): switched on one live renderer, the
 * shared groups three cached under one order would be handed to builders sorting the other way.
 */
export function setStableSkinProgramsForTest(on: boolean): void {
  if (on) { install(); return; }
  // Both builders (LATER 772's review F1): a WebGPU comparison built on this switch compares three against the override.
  proto.getUniformFromNode = threeGetUniformFromNode;
  proto._getBindGroup = threeGetBindGroup;
  delete proto.__s2uStableSkin;
  wgslProto.getUniformFromNode = threeWgslGetUniformFromNode;
  wgslProto._getBindGroup = threeGetBindGroup;
  delete wgslProto.__s2uStableSkin;
}

/** Whether the override is on three's GLSL builder (tests). */
export function stableSkinProgramsInstalled(): boolean {
  return (GLSLNodeBuilder.prototype as unknown as BuilderProto).__s2uStableSkin === true;
}

/** LATER 772: whether the override is on three's WGSL builder (tests). */
export function stableSkinWgslInstalled(): boolean {
  return Object.prototype.hasOwnProperty.call(WGSLNodeBuilder.prototype, '__s2uStableSkin');
}
