import type { LoadedMap } from '../loadMap';

/**
 * DAY.R4: the key a variant's colour pack is built against -- the decoded world's total vertex count and a 64-bit
 * FNV-1a over every world part's position floats as little-endian f32 bytes, in `map.world` order (a browser
 * adaptation, product track). Synchronous and three-free so a page and the Xbox client key the same load. FNV-1a 64:
 * offset basis 0xcbf29ce484222325, prime 0x100000001b3 (`h = (h ^ byte) * prime mod 2^64`). Computed in four 16-bit
 * limbs, not BigInt, to keep the load's cost small; the test checks it against a BigInt reference.
 */
export function worldKey(map: Pick<LoadedMap, 'world'>): { vertices: number; fnv64: string } {
  return partsKey(map.world);
}

/**
 * IQ-143: the key a variant's props pack is built against -- the same count and FNV-1a 64 as `worldKey`, over every prop
 * entry's parts in `map.props` order, each entry's parts in order (the positions in the model's own space, as decoded
 * once a model-node; the placements' matrices are not hashed).
 */
export function propsKey(map: Pick<LoadedMap, 'props'>): { vertices: number; fnv64: string } {
  return partsKey(map.props.flatMap((e) => e.parts));
}

/** The count and FNV-1a 64 over the parts' position floats, in the order given. */
function partsKey(parts: readonly { positions: Float32Array }[]): { vertices: number; fnv64: string } {
  let vertices = 0;
  // h = h3:h2:h1:h0, 16 bits each, the offset basis.
  let h0 = 0x2325, h1 = 0x8422, h2 = 0x9ce4, h3 = 0xcbf2;
  for (const part of parts) {
    const p = part.positions;
    vertices += Math.floor(p.length / 3);
    const bytes = littleEndianBytes(p);
    for (let i = 0; i < bytes.length; i++) {
      h0 ^= bytes[i]!;
      // h * 0x1b3 + (h << 40): the prime is 2^40 + 0x1b3. h << 40 puts h0's low byte at bits 40..47 (h2's high byte),
      // h0's high byte at 48..55 (h3's low byte) and h1's low byte at 56..63 (h3's high byte); the rest overflows.
      const t0 = h0 * 0x1b3;
      const t1 = h1 * 0x1b3 + (t0 >>> 16);
      const t2 = h2 * 0x1b3 + ((h0 & 0xff) << 8) + (t1 >>> 16);
      const t3 = h3 * 0x1b3 + (h0 >>> 8) + ((h1 & 0xff) << 8) + (t2 >>> 16);
      h0 = t0 & 0xffff; h1 = t1 & 0xffff; h2 = t2 & 0xffff; h3 = t3 & 0xffff;
    }
  }
  const hex = (v: number) => v.toString(16).padStart(4, '0');
  return { vertices, fnv64: hex(h3) + hex(h2) + hex(h1) + hex(h0) };
}

const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

/** The array's own bytes as little-endian f32 (a view on a little-endian host; a copy otherwise). */
function littleEndianBytes(p: Float32Array): Uint8Array {
  if (LITTLE_ENDIAN) return new Uint8Array(p.buffer, p.byteOffset, p.byteLength);
  const dv = new DataView(new ArrayBuffer(p.byteLength));
  for (let i = 0; i < p.length; i++) dv.setFloat32(i * 4, p[i]!, true);
  return new Uint8Array(dv.buffer);
}
