/**
 * A compiled `.rdr` built by hand (`packages/archive/src/rdr.ts`, 36 §6), for the tests that pack synthetic scripts into
 * synthetic archives (web sprint 5): the 12-byte head `{u32 version=1; u32 string_table_size; u32 node_array_offset}`,
 * the string table, then 8-byte nodes `{u32 (type:8, ..., length:16); u32 value}` -- 1 i32, 2 f32, 3 string (offset
 * from byte 12), 4 list (the node-array byte offset of its first child; the children lie together). A JS number is
 * written as an f32, `{ i }` as an i32. The same builder as `tuning.test.ts`'s.
 */
export type RdrSrc = string | number | { i: number } | RdrSrc[];

export function compileRdr(root: RdrSrc): Uint8Array {
  const table: number[] = [];
  const at = new Map<string, number>();
  const str = (s: string): number => {
    let ofs = at.get(s);
    if (ofs === undefined) {
      ofs = table.length; at.set(s, ofs);
      for (const c of s) table.push(c.charCodeAt(0) & 0xff);
      table.push(0);
    }
    return ofs;
  };
  const nodes: { type: number; length: number; value: number; f32?: number }[] = [{ type: 0, length: 0, value: 0 }];
  const place = (n: RdrSrc, slot: number): void => {
    if (Array.isArray(n)) {
      const first = nodes.length;
      for (let k = 0; k < n.length; k++) nodes.push({ type: 0, length: 0, value: 0 });
      nodes[slot] = { type: 4, length: n.length, value: first * 8 };
      n.forEach((c, k) => place(c, first + k));
    } else if (typeof n === 'string') nodes[slot] = { type: 3, length: 0, value: str(n) };
    else if (typeof n === 'number') nodes[slot] = { type: 2, length: 0, value: 0, f32: n };
    else nodes[slot] = { type: 1, length: 0, value: n.i >>> 0 };
  };
  place(root, 0);
  const nodesAt = Math.ceil((12 + table.length) / 16) * 16;
  const out = new Uint8Array(nodesAt + 8 * nodes.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 1, true); dv.setUint32(4, table.length, true); dv.setUint32(8, nodesAt, true);
  out.set(table, 12);
  nodes.forEach((n, k) => {
    dv.setUint32(nodesAt + 8 * k, n.type | (n.length << 16), true);
    if (n.f32 !== undefined) dv.setFloat32(nodesAt + 8 * k + 4, n.f32, true);
    else dv.setUint32(nodesAt + 8 * k + 4, n.value, true);
  });
  return out;
}
