import { describe, expect, it } from 'vitest';
import { archivePositionForm, interpretPacket, SCALE_FORM_ARCHIVES, type PositionForm } from '../src';
import type { VuPacket } from '../src/vif';

/**
 * The two position forms of a drawn packet (SEMANTICS §3 `TOP+3`; research 15 §0 item 1): command `0x68` converts
 * the position lanes with `ITOF4` and **adds** `TOP+3.xyz` (the world and the props), command `0x70` converts them
 * with `ITOF15` and **multiplies** by `TOP+3.w` (the weapons, the fittings, the turrets: socomlegacy/docs/research/79 §2).
 * Every other lane is the same in both. One triangle, built straight into VU memory.
 */
function triangle(bias: [number, number, number, number]): VuPacket {
  const mem = new Int32Array(1024 * 4);
  const f32 = new Float32Array(mem.buffer);
  const written = new Uint8Array(1024);
  const V = 3, indexBase = 4 + 3 * V;
  mem[2 * 4 + 0] = indexBase; mem[2 * 4 + 2] = V; mem[2 * 4 + 3] = 1;            // TOP+2: index base, vertices, triangles
  f32.set(bias, 3 * 4);                                                           // TOP+3: xyz bias, w scale
  const raw: [number, number, number][] = [[16384, 0, 0], [0, 32767, 0], [0, 0, -16384]];
  raw.forEach(([x, y, z], k) => {
    const a = (4 + 3 * k) * 4;
    mem[a] = x; mem[a + 1] = y; mem[a + 2] = z; mem[a + 3] = 32767;              // a: position, normal x
    mem[a + 4] = 2048; mem[a + 5] = 4096;                                         // b: u, v
    mem[a + 8] = 128; mem[a + 9] = 64; mem[a + 10] = 32; mem[a + 11] = 128;       // c: rgba
  });
  mem[indexBase * 4] = 0; mem[indexBase * 4 + 1] = 3; mem[indexBase * 4 + 2] = 6;  // the three vertex triples
  for (let q = 0; q < indexBase + 2; q++) written[q] = 1;
  return { kind: 'mscnt', entry: -1, mem, f32, written, unpacks: [], textureName: 'm4.tif' };
}

describe('interpretPacket: the position form', () => {
  it('reads ITOF4 plus TOP+3.xyz by default (command 0x68, SEMANTICS §4)', () => {
    const mesh = interpretPacket(triangle([100, 5, -20, 7.5]));
    expect([...mesh.positions]).toEqual([1124, 5, -20, 100, 5 + 32767 / 16, -20, 100, 5, -20 - 1024]);
  });

  it('reads ITOF15 times TOP+3.w when asked for the scale form (command 0x70, research 15 §0)', () => {
    const form: PositionForm = 'scale';
    const mesh = interpretPacket(triangle([100, 5, -20, 8]), form);
    expect(mesh.positions[0]).toBe(4);                                            // 16384 / 32768 * 8
    expect(mesh.positions[4]).toBeCloseTo((32767 / 32768) * 8, 6);
    expect(mesh.positions[8]).toBe(-4);
    expect([mesh.positions[1], mesh.positions[2], mesh.positions[3]]).toEqual([0, 0, 0]);   // no bias is added
  });

  it('leaves every other lane alone: the uvs, the normals, the colours and the triangle', () => {
    const bias = interpretPacket(triangle([0, 0, 0, 2]));
    const scale = interpretPacket(triangle([0, 0, 0, 2]), 'scale');
    expect([...scale.uvs]).toEqual([...bias.uvs]);
    expect([...scale.normals!]).toEqual([...bias.normals!]);
    expect([...scale.colors]).toEqual([...bias.colors]);
    expect([...scale.indices]).toEqual([0, 1, 2]);
    expect(scale.textureName).toBe('m4.tif');
  });
});

/**
 * Which form a model archive's chains are drawn in, by the archive (socomlegacy/docs/research/79 §2): the weapons, the
 * fittings and the six turret libraries `'scale'`, the world and every other prop library `'bias'`. The turrets' gap
 * was the bug -- MAP-10b decoded `TURR_MDL`'s parts as `'bias'`, and Vigilance's tripod (bbox about +-7 x 17) drew
 * +-1048 x 2048 wide.
 */
describe('archivePositionForm: the form a model archive is drawn in', () => {
  it("names 'scale' for WEAP_MDL, FLIB_MDL and every turret library, bare or with the ZDB's path, any case", () => {
    expect([...SCALE_FORM_ARCHIVES].sort()).toEqual(['FLIB', 'T30M', 'TLLM', 'TLMG', 'TLRM', 'TRMG', 'TURR', 'WEAP']);
    for (const member of ['TURR_MDL.ZED', 'WEAP_MDL.ZED', 'FLIB_MDL.ZED', 'TLMG_MDL.ZED', 'TLRM_MDL.ZED', 'T30M_MDL.ZED',
      'TRMG_MDL.ZED', 'TLLM_MDL.ZED', 'RUN\\COMMON\\TURR_MDL.ZED', 'RUN/MP/MP72/FLIB_MDL.ZED', 'turr_mdl.zed']) {
      expect(archivePositionForm(member), member).toBe('scale');
    }
  });

  it("names 'bias' for the world, the map's own library and the other shared ones", () => {
    for (const member of ['WORL_MDL.ZED', 'MP72_MDL.ZED', 'MP10_MDL.ZED', 'RUN\\MP\\MP51\\RM51_MDL.ZED', 'PAVE_MDL.ZED',
      'JUNK_MDL.ZED', 'BCAR_MDL.ZED', 'ZM72_MDL.ZED', 'EFFE_MDL.ZED', 'TURR_GEO.ZED', 'XTURR_MDL.ZED', '']) {
      expect(archivePositionForm(member), member).toBe('bias');
    }
  });
});
