// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseZdb, Reader, Zar, zdbMember } from '@s2u/archive';
import {
  decodeSkinnedMesh, meshChainTags, PASS_ACCUMULATE, PASS_FIRST, PASS_LAST, readMeshLibrary, RELOC_BONE, topInfluences,
  type SkinnedMeshData,
} from '../src';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';

/**
 * Parity pins for the character mesh chain (socomlegacy/docs/research/78 §2, §4; registry
 * docs/parity/registry/character.json). `golden/character-mesh.json` holds, as `readMeshLibrary` decodes MP2's
 * `CLIB_MDL.ZED`: every Frostfire mesh's counts and a digest of its decode, and seal_A_scuba's whole batch structure --
 * per batch its texture, per pass its palette slot, its flags and its (vertex, weight lane) pairs. The unit half
 * rebuilds seal_A_scuba's chain from that structure, lane for lane as 78 §2 lays it out, and drives
 * `decodeSkinnedMesh` with it; the fixture half decodes the real chain and compares the two.
 */
interface LibraryRow {
  name: string; bufferSize: number; start: number; refCount: number; mtxCount: number; tagCount: number;
  vertices: number; triangles: number; batches: number; subMeshes: number; maxInfluences: number; bones: number[]; decodedSha1: string;
}
interface PassPin { slot: number; flags: number; vw: number[] }
interface BatchPin { texture: number; textureTag: boolean; fog: boolean; vertices: number; triangles: number; passes: PassPin[] }
interface MeshPin {
  _source: string;
  library: LibraryRow[];
  sealAScuba: { textures: string[]; influenceHistogram: Record<string, number>; droppedMax: number; firstBoneListWords: string[]; batches: BatchPin[] };
}
const pin = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'golden/character-mesh.json'), 'utf8')) as MeshPin;
const seal = pin.sealAScuba;
const sealRow = pin.library.find((e) => e.name === 'seal_A_scuba')!;

const word = (hex: string): number => parseInt(hex, 16);
const lanes = (w: number): [number, number] => [(w << 16) >> 16, w >> 16];
/** The first bone list's vertex 0 as 78 §2.2 prints it: (x, y, z, dst) and (nx, ny, nz, w), int16. */
const VERTEX0 = [...lanes(word(seal.firstBoneListWords[4]!)), ...lanes(word(seal.firstBoneListWords[5]!)),
  ...lanes(word(seal.firstBoneListWords[6]!)), ...lanes(word(seal.firstBoneListWords[7]!))];

/**
 * seal_A_scuba's chain rebuilt from the pin, as 78 §2.1-§2.3 lay it out: the count quadword (DMA end, the tag count),
 * then per batch a reloc-6 texture citation where the pin has one, per pass a reloc-9 matrix tag (STCYCL 1,1; UNPACK
 * V4-32 num=4 addr=0) and a reloc-10 bone list (V4-16 at TOP+4: the header, then (x, y, z, dst) and (nx, ny, nz, w) a
 * vertex), and a reloc-11 draw packet (the index list, the two GIFtag templates, TOP+2's counts, the uvs). Positions,
 * normals and uvs are zero but for vertex 0 of the first list, which carries the stored lanes; the triangles are
 * placeholders of the pinned count.
 */
function chainFromPin(): { buffer: Uint8Array; start: number } {
  const blob: number[] = [];
  const align16 = (): void => { while (blob.length % 16) blob.push(0); };
  const u32 = (x: number): void => { blob.push(x & 0xff, (x >>> 8) & 0xff, (x >>> 16) & 0xff, (x >>> 24) & 0xff); };
  const i16 = (x: number): void => { const v = x & 0xffff; blob.push(v & 0xff, v >>> 8); };
  const STCYCL = (cl: number, wl: number): number => 0x01000000 | (wl << 8) | cl;
  const MSCNT = 0x17000000;
  const tags: number[][] = [];
  let firstVertex = true;
  for (const b of seal.batches) {
    if (b.textureTag) {
      align16();
      const at = blob.length;
      for (const c of seal.textures[b.texture]!) blob.push(c.charCodeAt(0));
      blob.push(0);
      tags.push([0x10060000, at, 0, 0]);
    }
    const V = b.vertices, T = b.triangles;
    for (const p of b.passes) {
      tags.push([0x30090004, p.slot, STCYCL(1, 1), 0x6c048000]);
      align16();
      const at = blob.length, n = p.vw.length / 2;
      u32(STCYCL(1, 1));
      u32(((0x6d << 24) | (((1 + 2 * n) & 0xff) << 16) | 0x8004) >>> 0);
      i16(p.flags); i16(T); i16(p.slot); i16(n);
      for (let k = 0; k < n; k++) {
        const v = p.vw[2 * k]!, w = p.vw[2 * k + 1]!;
        if (firstVertex) { VERTEX0.forEach((x, i) => i16(i === 3 ? 2 * v : i === 7 ? w : x)); firstVertex = false; }
        else { i16(0); i16(0); i16(0); i16(2 * v); i16(0); i16(0); i16(0); i16(w); }
      }
      u32(MSCNT);
      align16();
      tags.push([0x300a0000 | ((blob.length - at) / 16), at, p.slot, n]);
    }
    align16();
    const at = blob.length, base = 4 + 3 * V;
    u32(STCYCL(2, 1));
    u32(((0x6e << 24) | (T << 16) | 0xc000 | base) >>> 0);
    for (let t = 0; t < T; t++) blob.push(0, (1 % V) * 3, (2 % V) * 3, 3);
    u32(STCYCL(1, 1));
    u32(((0x6c << 24) | (4 << 16) | 0x8000) >>> 0);
    const gif = (prim: number): number => ((1 << 14) | (prim << 15) | (3 << 28)) >>> 0;
    u32(0x8000); u32(gif(b.fog ? 125 : 125 & ~0x20)); u32(0x412); u32(0);
    u32(0x8000 | V); u32(gif(b.fog ? 123 : 123 & ~0x20)); u32(0x412); u32(0);
    u32(base); u32(0); u32(V); u32(T);
    u32(0); u32(0); u32(0); u32(0);
    u32(STCYCL(3, 1));
    u32(((0x65 << 24) | (V << 16) | 0x8005) >>> 0);
    for (let k = 0; k < V; k++) { i16(0); i16(0); }
    u32(MSCNT);
    align16();
    tags.push([0x300b0000 | ((blob.length - at) / 16), at, 2 * b.passes.length, 0]);
  }
  align16();
  const start = blob.length;
  u32(0x70000000 | tags.length); u32(0); u32(0); u32(0);
  for (const t of tags) for (const w of t) u32(w >>> 0);
  return { buffer: Uint8Array.from(blob), start };
}

let decoded: SkinnedMeshData | null = null;
const fromPin = (): SkinnedMeshData => {
  if (!decoded) { const { buffer, start } = chainFromPin(); decoded = decodeSkinnedMesh(buffer, start, 'seal_A_scuba'); }
  return decoded;
};

describe("seal_A_scuba's skin, pinned (research 78 §2, §4; no game data)", () => {
  it('decodes the pinned chain to 78 §4: 2,094 vertices, 1,523 triangles, 56 batches, 7 textures, 405 tags, up to 5 bones', () => {
    const m = fromPin();
    expect([m.vertexCount, m.triangleCount, m.batches.length, m.subMeshes.length, m.tagCount, m.maxInfluences]).toEqual([2094, 1523, 56, 7, 405, 5]);
    expect([sealRow.vertices, sealRow.triangles, sealRow.batches, sealRow.subMeshes, sealRow.refCount, sealRow.maxInfluences]).toEqual([2094, 1523, 56, 7, 405, 5]);
    // one sub-mesh a texture, in the order the chain first draws each (78 §2.4)
    expect(m.subMeshes.map((s) => s.textureName)).toEqual(['seal_scuba_glove.tif', 'seal_scuba_sleave.tif', 'seal_scuba_shirt.tif',
      'seal_scuba_boot.tif', 'seal_scuba_pants.tif', 'seal_scuba_mask.tif', 'seal01_facemap.tif']);
    expect(m.bones).toEqual(sealRow.bones);
  });

  it('weights its vertices as 78 §2.2 counts them: 995 on one bone, 773 on two, 263 on three, 62 on four, 1 on five', () => {
    const tally: Record<string, number> = {};
    for (const s of fromPin().subMeshes) for (let v = 0; v < s.vertexCount; v++) {
      const n = s.influenceStart[v + 1]! - s.influenceStart[v]!;
      tally[n] = (tally[n] ?? 0) + 1;
    }
    expect(tally).toEqual({ 1: 995, 2: 773, 3: 263, 4: 62, 5: 1 });
    expect(seal.influenceHistogram).toEqual(tally);
  });

  it("sums every vertex's weights to one, to a lane's last bit per influence, 1.0 stored as 32767 (78 §2.2)", () => {
    let worst = 0;
    for (const s of fromPin().subMeshes) for (let v = 0; v < s.vertexCount; v++) {
      let sum = 0;
      const n = s.influenceStart[v + 1]! - s.influenceStart[v]!;
      for (let k = s.influenceStart[v]!; k < s.influenceStart[v + 1]!; k++) sum += s.influenceWeight[k]!;
      worst = Math.max(worst, Math.abs(sum - 1) * 32768 / n);
    }
    expect(worst).toBeLessThanOrEqual(1);
    expect(Math.max(...seal.batches.flatMap((b) => b.passes.flatMap((p) => p.vw.filter((_, i) => i % 2 === 1))))).toBe(32767);
  });

  it('flags each pass as 78 §2.2 reads them: the first 2 (6 when alone), the rest accumulate 1, the last 4; 12 batches of one bone', () => {
    for (const b of fromPin().batches) {
      const f = b.passes.map((p) => p.flags);
      expect(f[0]! & (PASS_FIRST | PASS_ACCUMULATE)).toBe(PASS_FIRST);
      for (const x of f.slice(1)) expect(x & (PASS_FIRST | PASS_ACCUMULATE)).toBe(PASS_ACCUMULATE);
      expect(f.map((x) => (x & PASS_LAST) !== 0)).toEqual(f.map((_, i) => i === f.length - 1));
    }
    expect(fromPin().batches.filter((b) => b.passes.length === 1).every((b) => b.passes[0]!.flags === 6)).toBe(true);
    expect(fromPin().batches.filter((b) => b.passes.length === 1)).toHaveLength(12);
    expect(Math.max(...fromPin().batches.map((b) => b.passes.length))).toBeLessThanOrEqual(14);   // 78 §2.2: 1 to 14
  });

  it("reads 78 §2.2's stored first bone list: header (2, 38 triangles, slot 16, 46 vertices), vertex 0 as ITOF15 x 10 and ITOF15", () => {
    expect(seal.firstBoneListWords).toEqual(['01000101', '6d5d8004', '00260002', '002e0010', 'f82a2ada', '00000027', '8b99e389', '20e0d30a']);
    expect([...lanes(word(seal.firstBoneListWords[2]!)), ...lanes(word(seal.firstBoneListWords[3]!))]).toEqual([2, 38, 16, 46]);
    const m = fromPin(), s = m.subMeshes[0]!;
    expect(m.batches[0]!.passes[0]).toEqual({ matrix: 16, flags: 2, count: 46 });
    expect(m.batches[0]!.triangleCount).toBe(38);
    expect(Array.from(s.influencePosition.subarray(0, 3))).toEqual([0x2ada, -2006, 0x27].map((x) => Math.fround(x / 32768 * 10)));
    expect(Array.from(s.influenceNormal.subarray(0, 3))).toEqual([-7287, -29799, -11510].map((x) => Math.fround(x / 32768)));
    expect(s.influenceWeight[0]).toBe(Math.fround(0x20e0 / 32768));
  });

  it("costs nothing to the renderer's four influences: seal_A_scuba's one five-bone vertex weighs 0 on its fifth (78 §6.1)", () => {
    expect(Math.max(...fromPin().subMeshes.map((s) => topInfluences(s, 4).droppedMax))).toBe(0);
    expect(seal.droppedMax).toBe(0);
    // and every vertex keeps each bone that weighs anything, at its own weight renormalised
    for (const s of fromPin().subMeshes) {
      const top = topInfluences(s, 4);
      for (let v = 0; v < s.vertexCount; v++) {
        const own = new Map<number, number>();
        let sum = 0;
        for (let k = s.influenceStart[v]!; k < s.influenceStart[v + 1]!; k++) if (s.influenceWeight[k]! > 0) { own.set(s.influenceBone[k]!, s.influenceWeight[k]!); sum += s.influenceWeight[k]!; }
        const kept = new Map<number, number>();
        for (let i = 0; i < 4; i++) if (top.weight[4 * v + i]! > 0) kept.set(top.index[4 * v + i]!, top.weight[4 * v + i]!);
        expect([...kept.keys()].sort(), `vertex ${v}`).toEqual([...own.keys()].sort());
        for (const [b, w] of own) expect(kept.get(b)!, `vertex ${v} bone ${b}`).toBeCloseTo(w / sum, 6);
      }
    }
  });

  it("pins Frostfire's 17 meshes (78 §1, §3): mtx_count 26, ref_count the tag count, no vertex on slots 0, 10 or 25", () => {
    expect(pin.library).toHaveLength(17);
    for (const e of pin.library) {
      expect([e.mtxCount, e.refCount], e.name).toEqual([26, e.tagCount]);
      expect(e.start, e.name).toBeLessThan(e.bufferSize);
      expect(e.bones.filter((b) => b === 0 || b === 10 || b === 25 || b >= 26), e.name).toEqual([]);
      expect(e.maxInfluences, e.name).toBeLessThanOrEqual(6);
    }
    expect([sealRow.start, sealRow.bufferSize]).toEqual([83008, 89504]);
  });
});

const MP2 = fixture('RUN/MP2.ZDB');
const digest = (m: SkinnedMeshData): string => {
  const h = createHash('sha1');
  for (const s of m.subMeshes) for (const a of [s.uvs, s.indices, s.influenceStart, s.influenceBone, s.influenceWeight, s.influencePosition, s.influenceNormal]) {
    h.update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
  }
  return h.digest('hex');
};

describe(`the skin pin against the disc${MP2 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const mdl = (): Zar => Zar.parse(zdbMember(MP2!, parseZdb(MP2!), 'CLIB_MDL.ZED'));

  it.skipIf(!MP2)("re-reads the library pin from MP2's CLIB_MDL.ZED through readMeshLibrary, a SHA-1 of each decode", () => {
    const zar = mdl();
    expect(readMeshLibrary(zar).map((e) => ({
      name: e.name, bufferSize: zar.find(`MESH_${e.name}`)!.size, start: e.start, refCount: e.refCount, mtxCount: e.mtxCount, tagCount: e.tagCount,
      vertices: e.mesh!.vertexCount, triangles: e.mesh!.triangleCount, batches: e.mesh!.batches.length, subMeshes: e.mesh!.subMeshes.length,
      maxInfluences: e.mesh!.maxInfluences, bones: e.mesh!.bones, decodedSha1: digest(e.mesh!),
    }))).toEqual(pin.library);
  });

  it.skipIf(!MP2)("decodes the real seal_A_scuba exactly as the chain rebuilt from the pin: batches, passes, influences, weights", () => {
    const real = readMeshLibrary(mdl(), ['seal_A_scuba'])[0]!.mesh!;
    const synth = fromPin();
    expect(synth.batches).toEqual(real.batches);
    expect(synth.subMeshes.length).toBe(real.subMeshes.length);
    real.subMeshes.forEach((r, i) => {
      const s = synth.subMeshes[i]!;
      expect([s.textureName, s.fog, s.vertexCount, s.indices.length], r.textureName ?? '').toEqual([r.textureName, r.fog, r.vertexCount, r.indices.length]);
      expect(Buffer.compare(Buffer.from(s.influenceStart.buffer), Buffer.from(r.influenceStart.buffer)), 'influenceStart').toBe(0);
      expect(Buffer.compare(Buffer.from(s.influenceBone.buffer), Buffer.from(r.influenceBone.buffer)), 'influenceBone').toBe(0);
      expect(Buffer.compare(Buffer.from(s.influenceWeight.buffer), Buffer.from(r.influenceWeight.buffer)), 'influenceWeight').toBe(0);
    });
    // and the first bone list's stored words, at the first reloc-10 tag's address
    const zar = mdl();
    const buffer = zar.data(zar.find('MESH_seal_A_scuba')!);
    const first = meshChainTags(buffer, 83008, 'seal_A_scuba').find((t) => t.reloc === RELOC_BONE)!;
    expect(Array.from({ length: 8 }, (_, i) => new Reader(buffer).u32(first.addr + 4 * i).toString(16).padStart(8, '0'))).toEqual(seal.firstBoneListWords);
    expect(Array.from(real.subMeshes[0]!.influencePosition.subarray(0, 3))).toEqual(Array.from(synth.subMeshes[0]!.influencePosition.subarray(0, 3)));
  });
});
