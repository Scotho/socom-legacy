import { InterleavedBuffer, InterleavedBufferAttribute } from 'three';

/**
 * CPS H12 (product track, a CPU-side browser adaptation; the client performance plan's Log 2026-11-03T02:52Z, "Theory
 * 4"): a world draw's vertices -- position, uv and lit colour -- in ONE interleaved Float32Array, so three's WebGPU
 * backend binds one vertex buffer a draw (`setVertexBuffer`) instead of three. Nothing the game does changes: the same
 * f32 values reach the same shader inputs under the same names (`position`, `uv`, `color`), not normalised, and the
 * shaders are the same text (only the pipeline's vertex layout -- strides and offsets -- differs).
 *
 * The layout, a vertex: x y z | u v | r g b a (stride 3 + 2 + 4 = 9 floats). Every writer goes through the stride
 * (`applyLighting(..., stride, offset)`, `colourSlotsOf`); every reader through the attribute's accessors or its
 * stride (`./markClip`).
 */
export const WORLD_VERTEX_STRIDE = 9;
export const WORLD_POSITION_OFFSET = 0;
export const WORLD_UV_OFFSET = 3;
export const WORLD_COLOUR_OFFSET = 5;

/** The buffers the world built, so a reader can tell them from an interleaved geometry from elsewhere (a pack's GLB). */
const worldBuffers = new WeakSet<InterleavedBuffer>();

/** True for a buffer `interleaveWorldVertices` made. */
export const isWorldVertexBuffer = (buffer: InterleavedBuffer): boolean => worldBuffers.has(buffer);

export interface WorldVertices {
  buffer: InterleavedBuffer;
  position: InterleavedBufferAttribute;
  uv: InterleavedBufferAttribute;
  /** The colour slots, left zero: the caller lights into them (`applyLighting(part, light, buffer.array, 9, 5)`). */
  color: InterleavedBufferAttribute;
}

/**
 * The positions and uvs copied into one interleaved buffer of `colours` vertices, its colour slots zero; null when the
 * three counts disagree (the caller keeps separate attributes then, as it always built them).
 */
export function interleaveWorldVertices(positions: Float32Array, uvs: Float32Array, colours: number): WorldVertices | null {
  const count = positions.length / 3;
  if (!Number.isInteger(count) || uvs.length !== count * 2 || colours !== count) return null;
  const array = new Float32Array(count * WORLD_VERTEX_STRIDE);
  for (let i = 0; i < count; i++) {
    const o = i * WORLD_VERTEX_STRIDE;
    array[o] = positions[i * 3]!;
    array[o + 1] = positions[i * 3 + 1]!;
    array[o + 2] = positions[i * 3 + 2]!;
    array[o + WORLD_UV_OFFSET] = uvs[i * 2]!;
    array[o + WORLD_UV_OFFSET + 1] = uvs[i * 2 + 1]!;
  }
  const buffer = new InterleavedBuffer(array, WORLD_VERTEX_STRIDE);
  worldBuffers.add(buffer);
  return {
    buffer,
    position: new InterleavedBufferAttribute(buffer, 3, WORLD_POSITION_OFFSET, false),
    uv: new InterleavedBufferAttribute(buffer, 2, WORLD_UV_OFFSET, false),
    color: new InterleavedBufferAttribute(buffer, 4, WORLD_COLOUR_OFFSET, false),
  };
}
