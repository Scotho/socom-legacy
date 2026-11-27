// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { LinearFilter, Mesh, NearestFilter, RepeatWrapping, ClampToEdgeWrapping, Vector2, type BufferAttribute, type MeshBasicMaterial, type Scene } from 'three';
import { PaletteTable, parsePaletteRecord, type Rgba } from '@s2u/gs';
import { decodeNamedTextures } from '../src/hudBitmaps';
import { UI_SAMPLING_DEFAULTS } from '../src/experimentalUiSampling';
import { gsSampleShift, pipCentre, Reticle, RETICLE_CORNER_TRUNCATION_READING, RETICLE_SAMPLER_WITHOUT_RECORD, reticleLayout, reticleTexture } from '../src/reticle';

/**
 * B-77: the reticle's filter is its texture record's own, sampled half a texel off as the GS samples it.
 *
 * The sprite's draw `FUN_003643b0` (D:L261666) chains the texture object's bind packet (`+0x30`) and adds only ST, RGBAQ
 * and XYZ2 (D:L261673-261674): no TEX1 of its own, so the filter is the record's (`gs.bilinear`, TEX1.MMAG). The ring's
 * corner is `(int)(centre - w * 0.5)` in PS2 pixels (`FUN_00216770` D:L70420-70430), XYZ2 with no +0.5 (D:L261689-261700)
 * and ST set (0, 0, 1, 1) (`FUN_00364830` at D:L69661, T stored negated D:L261812-261814, so T runs 0..-1 under WMT
 * REPEAT): pixel i samples texel coordinate i, half a texel off the texel centres. The GS samples at the pixel's corner
 * whatever the primitive (the re-review's finding 1): every part drawn linear is corrected -- the ring, the scope's glass,
 * the binoculars and the goggles by the UV form, the arms, corners, set 3's sight, the meter, the threat marks and the pip
 * by the position form (+half a PS2 pixel); the class decides only whether a corner is truncated to a whole pixel.
 * Reading, pending review.
 */

const ink = (w: number, h = w): Rgba => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(255) });

describe('B-77 (a): the reticle bitmap\'s filter and wrap from its record', () => {
  it('a record saying bilinear gets LinearFilter both ways; one saying not gets NearestFilter', () => {
    const lin = reticleTexture(ink(8), false, { linear: true, wrapS: 'repeat', wrapT: 'repeat' });
    expect([lin.minFilter, lin.magFilter]).toEqual([LinearFilter, LinearFilter]);
    expect([lin.wrapS, lin.wrapT]).toEqual([RepeatWrapping, RepeatWrapping]);
    const point = reticleTexture(ink(8), false, { linear: false, wrapS: 'clamp', wrapT: 'repeat' });
    expect([point.minFilter, point.magFilter]).toEqual([NearestFilter, NearestFilter]);
    expect([point.wrapS, point.wrapT]).toEqual([ClampToEdgeWrapping, RepeatWrapping]);
  });

  it('no record keeps the port\'s former nearest and clamp (RETICLE_SAMPLER_WITHOUT_RECORD)', () => {
    expect(RETICLE_SAMPLER_WITHOUT_RECORD).toEqual({ linear: false, wrapS: 'clamp', wrapT: 'clamp' });
    const t = reticleTexture(ink(8));
    expect([t.minFilter, t.magFilter, t.wrapS, t.wrapT]).toEqual([NearestFilter, NearestFilter, ClampToEdgeWrapping, ClampToEdgeWrapping]);
  });

  it('decodeNamedTextures carries each record\'s TEX1.MMAG and CLAMP out by name, none where the packet holds no state', () => {
    const table = new PaletteTable();
    table.add(parsePaletteRecord(clutPar(7), new Uint8Array(64)));
    const pixels = new Uint8Array(64);
    const { textures, samplers } = decodeNamedTextures((name) => (
      name === 'ret_lin.tif' ? texdat(pixels, 100, 7, { tex1: 0x60n, clamp: 0n })
        : name === 'ret_point.tif' ? texdat(pixels, 101, 7, { tex1: 0n, clamp: 1n })
          : name === 'ret_bare.tif' ? texdat(pixels, 102, 7, null) : null
    ), table, ['ret_lin.tif', 'ret_point.tif', 'ret_bare.tif']);
    expect(Object.keys(textures).sort()).toEqual(['ret_bare.tif', 'ret_lin.tif', 'ret_point.tif']);
    expect(samplers).toEqual({
      'ret_lin.tif': { linear: true, wrapS: 'repeat', wrapT: 'repeat' },
      'ret_point.tif': { linear: false, wrapS: 'clamp', wrapT: 'repeat' },
    });
  });

  it('the Reticle uploads the ring and the arms with their records\' samplers', () => {
    const r = new Reticle();
    r.setBitmaps({
      fixed: ink(64), floating: ink(32), accuracy: null, sets: {},
      samplers: { 'ret_rifle_01.tif': { linear: true, wrapS: 'repeat', wrapT: 'repeat' }, 'ret_rifle_02.tif': { linear: false, wrapS: 'repeat', wrapT: 'repeat' } },
    });
    r.setVisible(true);
    let scene: Scene | null = null;
    r.render({ autoClear: true, getDrawingBufferSize: (v: Vector2) => v.set(640, 448), render: (sc) => { scene = sc; } });
    const meshes: Mesh[] = [];
    (scene as Scene | null)?.traverse((o) => { if (o instanceof Mesh && o.visible) meshes.push(o); });
    const ring = meshes.find((m) => m.renderOrder === 0)!, arm = meshes.find((m) => m.renderOrder === 1)!;
    expect((ring.material as MeshBasicMaterial).map!.magFilter).toBe(LinearFilter);
    expect((arm.material as MeshBasicMaterial).map!.magFilter).toBe(NearestFilter);
    // The linear ring's UVs are moved half a texel up and left (-0.5 / 64 of the plane); the nearest arm's are not.
    const uv = (m: Mesh): number[] => Array.from((m.geometry.getAttribute('uv') as BufferAttribute).array as Float32Array);
    expect(uv(ring).map((v) => Math.round(v * 1e6) / 1e6)).toEqual([0, 1, 1, 1, 0, 0, 1, 0].map((v) => Math.round((v - 0.5 / 64) * 1e6) / 1e6));
    expect(uv(arm)).toEqual([0, 1, 1, 1, 0, 0, 1, 0]);
  });
});

describe('B-77 (c), the reviews folds: the sample correction on every linear part, written on a change', () => {
  const frameOf = (r: Reticle): Mesh[] => {
    let scene: Scene | null = null;
    r.render({ autoClear: true, getDrawingBufferSize: (v: Vector2) => v.set(640, 448), render: (sc) => { scene = sc; } });
    const meshes: Mesh[] = [];
    (scene as Scene | null)?.traverse((o) => { if (o instanceof Mesh && o.visible) meshes.push(o); });
    return meshes;
  };
  const uv = (m: Mesh): number[] => Array.from((m.geometry.getAttribute('uv') as BufferAttribute).array as Float32Array);
  const linear = { linear: true, wrapS: 'repeat', wrapT: 'repeat' } as const;
  const PLANE = [0, 1, 1, 1, 0, 0, 1, 0];

  it("F2 (re-review 1): a linear arm IS shifted -- moved half a PS2 pixel down and right, its UVs the plain plane's", () => {
    // The GS samples pixel i at i whatever the class; the arm's corners are fractional (centre +- spread, the quad class's
    // x16 XYZ2, D:L259685-259693), so the exact correction is the position form: the quad moved by +half on both axes.
    const draw = (sampler: { linear: boolean; wrapS: 'repeat'; wrapT: 'repeat' }): Mesh[] => {
      const r = new Reticle();
      r.setBitmaps({ fixed: ink(64), floating: ink(32), accuracy: null, sets: {}, samplers: { 'ret_rifle_01.tif': linear, 'ret_rifle_02.tif': sampler } });
      r.setVisible(true);
      r.setSize(10.3);
      return frameOf(r).filter((m) => m.renderOrder === 1);
    };
    const lin = draw(linear), point = draw({ ...linear, linear: false });
    expect(lin.length).toBe(4);
    lin.forEach((arm, i) => {
      expect((arm.material as MeshBasicMaterial).map!.magFilter).toBe(LinearFilter);
      expect(arm.position.x - point[i]!.position.x).toBeCloseTo(0.5, 9);   // half a PS2 pixel at 640x448
      expect(arm.position.y - point[i]!.position.y).toBeCloseTo(0.5, 9);
      expect(uv(arm)).toEqual([0, 1, 1, 1, 0, 0, 1, 0]);
    });
  });

  it('F2 (re-review 1): the shift is half a PS2 pixel in frame units at 1920x1080 too', () => {
    const at = (lin: boolean): Mesh[] => {
      const r = new Reticle();
      r.setBitmaps({ fixed: ink(64), floating: ink(32), accuracy: null, sets: {}, samplers: { 'ret_rifle_02.tif': { ...linear, linear: lin } } });
      r.setVisible(true);
      let scene: Scene | null = null;
      r.render({ autoClear: true, getDrawingBufferSize: (v: Vector2) => v.set(1920, 1080), render: (sc) => { scene = sc; } });
      const meshes: Mesh[] = [];
      (scene as Scene | null)?.traverse((o) => { if (o instanceof Mesh && o.visible && o.renderOrder === 1) meshes.push(o); });
      return meshes;
    };
    const a = at(true)[0]!, b = at(false)[0]!;
    expect(a.position.x - b.position.x).toBeCloseTo(0.5 * 1080 / 448, 9);
  });

  it('F2 (re-review 1): a linear threat mark is drawn half a PS2 pixel down and right of where it is laid', () => {
    const r = new Reticle();
    r.setBitmaps({ fixed: ink(64), floating: ink(32), accuracy: null, sets: { 'ret_threat.tif': ink(16), 'ret_rifle_02.tif': ink(32) }, samplers: { 'ret_threat.tif': linear } });
    r.setVisible(true);
    r.setThreatGate(true, false);
    r.setThreat({ breadth: new Array(8).fill(1), alpha: new Array(8).fill(50) });
    const meshes = frameOf(r).filter((m) => m.userData.threat !== undefined);
    expect(meshes.length).toBeGreaterThan(0);
    const laid = r.threatState();
    for (const mesh of meshes) {
      const v = laid[mesh.userData.threat as number]!.vertices!;
      const pos = mesh.geometry.getAttribute('position') as BufferAttribute;
      v.forEach((p, k) => { expect(pos.getX(k) - p.x).toBeCloseTo(0.5, 4); expect(pos.getY(k) - p.y).toBeCloseTo(0.5, 4); });   // float32 positions
      const tex = mesh.geometry.getAttribute('uv') as BufferAttribute;
      v.forEach((p, k) => { expect(tex.getX(k)).toBeCloseTo(p.s, 6); expect(tex.getY(k)).toBeCloseTo(p.t, 6); });
    }
  });

  it('F2 (re-review 2): the linear pip (the sprite class, FUN_00364770) is shifted half a PS2 pixel', () => {
    const pipAt = (lin: boolean): Mesh => {
      const r = new Reticle();
      r.setBitmaps({ fixed: ink(64), floating: ink(32), accuracy: ink(8), sets: {}, samplers: { 'ret_accuracy.tif': { ...linear, linear: lin } } });
      r.setVisible(true);
      for (let i = 0; i < 6; i++) r.setPip([20.25, 10.25], false);
      return frameOf(r).find((m) => m.renderOrder === 3)!;
    };
    const a = pipAt(true), b = pipAt(false);
    expect((a.material as MeshBasicMaterial).map!.magFilter).toBe(LinearFilter);
    expect([a.position.x - b.position.x, a.position.y - b.position.y].map((v) => Math.round(v * 1e9) / 1e9)).toEqual([0.5, 0.5]);
  });

  // The picture moved half a PS2 pixel right and down, stated apart from `gsSampleShift`: on a quad as stored the plane's
  // UVs run with the screen, so each takes -0.5 / size; on an axis mirrored they run against it, so +0.5 / size.
  const expectShift = (m: Mesh, w: number, h: number): void => {
    const du = (m.scale.x < 0 ? 0.5 : -0.5) / w, dv = (m.scale.y < 0 ? 0.5 : -0.5) / h;
    uv(m).forEach((v, k) => expect(v).toBeCloseTo(PLANE[k]! + (k % 2 ? dv : du), 6));
  };

  it("F2 (re-review 3; delta 1, 2c; delta 3's finding 1): the scope's glass and its tube take the UV shift (+-1/640 by its mirror)", () => {
    const scope = (tubeLinear: boolean): Mesh[] => {
      const r = new Reticle();
      r.setBitmaps({
        fixed: ink(64), floating: ink(32), accuracy: null, sets: { 'ret_scope_01.tif': ink(128), 'ret_scope_02.tif': ink(128) },
        samplers: { 'ret_scope_01.tif': { ...linear, linear: tubeLinear }, 'ret_scope_02.tif': linear },
      });
      r.setVisible(true);
      r.setMode('scope');
      return frameOf(r).filter((m) => typeof m.userData.bitmap === 'string');
    };
    const meshes = scope(true), point = scope(false);
    const glass = meshes.filter((m) => m.userData.bitmap === 'ret_scope_02.tif'), tube = meshes.filter((m) => m.userData.bitmap === 'ret_scope_01.tif');
    const pointTube = point.filter((m) => m.userData.bitmap === 'ret_scope_01.tif');
    expect([glass.length, tube.length, pointTube.length]).toEqual([4, 4, 4]);
    expect(new Set(glass.map((m) => `${Math.sign(m.scale.x)},${Math.sign(m.scale.y)}`)).size).toBe(4);   // every mirror held
    for (const m of glass) expectShift(m, 320, 320);
    tube.forEach((m, i) => {
      // The tube (`ret_scope_01`, the quad class, D:L71217), a frame-edge mask: the UV form, as the glass -- unmoved, the
      // same sampled texels (delta review 3's finding 1).
      expect([m.position.x, m.position.y]).toEqual([pointTube[i]!.position.x, pointTube[i]!.position.y]);
      expectShift(m, 320, 320);
    });
    for (const m of pointTube) expect(uv(m)).toEqual(PLANE);
  });

  it("delta 3's finding 1: at 1920x1080 the tube meets the black bar's edge with no gap, its UVs carrying the correction", () => {
    const r = new Reticle();
    r.setBitmaps({
      fixed: ink(64), floating: ink(32), accuracy: null, sets: { 'ret_scope_01.tif': ink(128), 'ret_scope_02.tif': ink(128) },
      samplers: { 'ret_scope_01.tif': linear, 'ret_scope_02.tif': linear },
    });
    r.setVisible(true);
    r.setMode('scope');
    let scene: Scene | null = null;
    r.render({ autoClear: true, getDrawingBufferSize: (v: Vector2) => v.set(1920, 1080), render: (sc) => { scene = sc; } });
    const meshes: Mesh[] = [];
    (scene as Scene | null)?.traverse((o) => { if (o instanceof Mesh && o.visible) meshes.push(o); });
    const tube = meshes.filter((m) => m.userData.bitmap === 'ret_scope_01.tif');
    const bars = meshes.filter((m) => (m.material as MeshBasicMaterial).map === null && m.userData.bar === undefined);
    expect([tube.length, bars.length]).toEqual([4, 2]);
    const q = 320 * (1080 / 448);
    const barEnd = Math.min(...bars.map((m) => m.position.x + Math.abs(m.scale.x) / 2));        // the left bar's right edge
    const barStart = Math.max(...bars.map((m) => m.position.x - Math.abs(m.scale.x) / 2));      // the right bar's left edge
    const left = Math.min(...tube.map((m) => m.position.x - Math.abs(m.scale.x) / 2));
    const right = Math.max(...tube.map((m) => m.position.x + Math.abs(m.scale.x) / 2));
    expect(barEnd).toBeCloseTo(960 - q, 9);
    expect(left).toBeCloseTo(barEnd, 9);                                                        // no column uncovered
    expect(right).toBeCloseTo(barStart, 9);
    for (const m of tube) expectShift(m, 320, 320);   // 0.5 s frame pixels over 320 s: half a PS2 pixel, the mirror's sign
  });

  it('delta 2a: the linear goggles (nvg_part, the quad class, D:L71221-71222) take the UV shift, +-1/640 across and +-1/448 down', () => {
    const r = new Reticle();
    r.setBitmaps({ fixed: ink(64), floating: ink(32), accuracy: null, sets: { 'nvg_part.tif': ink(256) }, samplers: { 'nvg_part.tif': linear } });
    r.setVisible(true);
    r.setNight(true);
    const goggles = frameOf(r).filter((m) => m.renderOrder === -1);
    expect(goggles.length).toBe(4);
    expect(new Set(goggles.map((m) => `${Math.sign(m.scale.x)},${Math.sign(m.scale.y)}`)).size).toBe(4);
    for (const m of goggles) expectShift(m, 320, 224);
  });

  it('delta 4: the sampling experiment moves no part -- forced nearest, a linear ring keeps its record\'s shift', () => {
    const r = new Reticle();
    r.setBitmaps({ fixed: ink(64), floating: ink(32), accuracy: null, sets: {}, samplers: { 'ret_rifle_01.tif': linear } });
    r.setVisible(true);
    r.setExperimentalSampling({ ...UI_SAMPLING_DEFAULTS, enabled: true, mode: 'nearest' });
    const ring = frameOf(r).find((m) => m.renderOrder === 0)!;
    expect((ring.material as MeshBasicMaterial).map!.magFilter).toBe(NearestFilter);
    expectShift(ring, 64, 64);
  });

  it.skipIf(!RETICLE_CORNER_TRUNCATION_READING)('delta 3: the pip\'s corner is truncated to a whole PS2 pixel (FUN_00364770 D:L261801-261802, as the ring\'s)', () => {
    const r = new Reticle();
    r.setBitmaps({ fixed: ink(64), floating: ink(32), accuracy: ink(8), sets: {} });
    r.setVisible(true);
    for (let i = 0; i < 6; i++) r.setPip([20.25, 10.75], false);
    const pip = frameOf(r).find((m) => m.renderOrder === 3)!;
    // (int)(320 + 20.25 - 4) = 336 -> its centre 340; (int)(224 + 10.75 - 4) = 230 -> 234. Point-sampled: no shift.
    expect([pip.position.x, pip.position.y]).toEqual([340, 234]);
  });

  it.skipIf(!RETICLE_CORNER_TRUNCATION_READING)("delta 3's finding 3: pipCentre truncates toward zero, not floor -- a corner of -0.25 gives 0, not -1", () => {
    // corner = 0 + 3.75 - 4 = -0.25: (int) -> 0, the centre 4 (floor would give -1, the centre 3). 640x448: s = 1.
    expect(pipCentre({ width: 640, height: 448 }, [0, 0], [3.75, 3.75], [8, 8])).toEqual([4, 4]);
  });

  it.skipIf(!RETICLE_CORNER_TRUNCATION_READING)("delta 3's finding 3: pipCentre truncates on the PS2 frame, then scales (1920x1080)", () => {
    // (int)(320 + 20.25 - 4) = 336 -> 340 PS2; (int)(224 + 10.75 - 4) = 230 -> 234 PS2; then about the frame's centre by s.
    const s = 1080 / 448;
    const [x, y] = pipCentre({ width: 1920, height: 1080 }, [320, 224], [20.25, 10.75], [8, 8]);
    expect(x).toBeCloseTo(960 + 20 * s, 9);
    expect(y).toBeCloseTo(540 + 10 * s, 9);
    // Truncated in frame pixels instead, the corner would be (int)(960 + 16.25 s) -- not the same.
    expect(x).not.toBeCloseTo(Math.trunc(960 + 16.25 * s) + 4 * s, 3);
  });

  it("F2 (re-review 1): set 3's linear sight and the linear meter are moved half a PS2 pixel (the position form)", () => {
    const laid = (lin: boolean, set: number, pick: (m: Mesh) => boolean): Mesh[] => {
      const s = { ...linear, linear: lin };
      const r = new Reticle();
      r.setBitmaps({
        fixed: ink(64), floating: ink(32), accuracy: null,
        sets: { 'ret_rocket_01.tif': ink(64), 'ret_rocket_02.tif': ink(64), 'ret_grenade_01.tif': ink(64), 'ret_grenade_02.tif': ink(64), 'ret_sidearm_01.tif': ink(32), 'ret_sidearm_02.tif': ink(16) },
        samplers: { 'ret_rocket_01.tif': s, 'ret_grenade_01.tif': s, 'ret_grenade_02.tif': s },
      });
      r.setVisible(true);
      expect(r.setSet(set)).toBe(true);
      return frameOf(r).filter(pick);
    };
    for (const [set, pick] of [[3, (m: Mesh) => m.userData.sight === true], [4, (m: Mesh) => m.userData.meter !== undefined]] as const) {
      const a = laid(true, set, pick), b = laid(false, set, pick);
      expect(a.length).toBeGreaterThan(0);
      a.forEach((m, i) => {
        expect([m.position.x - b[i]!.position.x, m.position.y - b[i]!.position.y].map((v) => Math.round(v * 1e9) / 1e9)).toEqual([0.5, 0.5]);
        expect(uv(m)).toEqual([0, 1, 1, 1, 0, 0, 1, 0]);
      });
    }
  });

  it("F2 (re-review 1; delta 2b): the binoculars' linear quads take the UV shift, its sign by the mirror and its size by the lens", () => {
    const r = new Reticle();
    r.setBitmaps({ fixed: ink(64), floating: ink(32), accuracy: null, sets: { 'ret_binocs.tif': ink(128), 'ret_binocs2.tif': ink(128) }, samplers: { 'ret_binocs.tif': linear } });
    r.setVisible(true);
    r.setMode('binoculars');
    const quads = frameOf(r).filter((m) => m.userData.bitmap === 'ret_binocs.tif');
    expect(quads.length).toBe(2);
    // The left lens (0..320 as stored): -0.5/320 across; the right (319..640, mirrored, 321 wide): +0.5/321; both -0.5/448 down.
    const [left, right] = quads[0]!.scale.x > 0 ? [quads[0]!, quads[1]!] : [quads[1]!, quads[0]!];
    expect([left.scale.x, right.scale.x]).toEqual([320, -321]);
    [-0.5 / 320, 1 - 0.5 / 448, 1 - 0.5 / 320, 1 - 0.5 / 448, -0.5 / 320, -0.5 / 448, 1 - 0.5 / 320, -0.5 / 448].forEach((e, k) => expect(uv(left)[k]).toBeCloseTo(e, 6));
    [0.5 / 321, 1 - 0.5 / 448, 1 + 0.5 / 321, 1 - 0.5 / 448, 0.5 / 321, -0.5 / 448, 1 + 0.5 / 321, -0.5 / 448].forEach((e, k) => expect(uv(right)[k]).toBeCloseTo(e, 6));
  });

  it('F7: the ring\'s UVs are written once while its scale and turn hold, not every frame', () => {
    const r = new Reticle();
    r.setBitmaps({ fixed: ink(64), floating: ink(32), accuracy: null, sets: {}, samplers: { 'ret_rifle_01.tif': linear } });
    r.setVisible(true);
    const ring = frameOf(r).find((m) => m.renderOrder === 0)!;
    const attr = ring.geometry.getAttribute('uv') as BufferAttribute;
    const version = attr.version;
    frameOf(r);
    expect(attr.version).toBe(version);
  });

  it('F6: the ring\'s PS2 centre from the aim and the offset, so a whole corner is not truncated a pixel low', () => {
    // 1920x1080 (s = 1080 / 448), the knock 33 PS2 pixels right: the corner 320 + 33 - 32 = 321 exactly; the frame-pixel
    // round trip gave 352.99999999999994 and truncated to 320.
    const s = 1080 / 448;
    const q = reticleLayout({ width: 1920, height: 1080 }, [0.5, 0.5], 0, [33, 0], { fixed: 64, arm: 32 }).quads[0]!;
    expect(q.x - q.width / 2).toBeCloseTo(960 + (321 - 320) * s, 9);
  });
});

describe('B-77 (b): the ring\'s corner whole PS2 pixels, its samples half a texel off', () => {
  it.skipIf(!RETICLE_CORNER_TRUNCATION_READING)('640x448: the corner is (int)(centre - w * 0.5), so the centre moves with the truncation (D:L70428-70430)', () => {
    const at = (offset: [number, number], fixed: number) => reticleLayout({ width: 640, height: 448 }, [0.5, 0.5], 0, offset, { fixed, arm: 32 }).quads[0]!;
    let q = at([0.3, 0.7], 64);                                   // 320.3 - 32 = 288.3 -> 288; 224.7 - 32 = 192.7 -> 192
    expect([q.part, q.x - q.width / 2, q.y - q.height / 2]).toEqual(['fixed', 288, 192]);
    q = at([0, 0], 15);                                           // 320 - 7.5 = 312.5 -> 312: the centre 319.5
    expect([q.x, q.y]).toEqual([319.5, 223.5]);                   // 224 - 7.5 = 216.5 -> 216: the centre 223.5
  });

  it.skipIf(!RETICLE_CORNER_TRUNCATION_READING)('a wider and taller frame scales the truncated PS2 corner, never truncates in frame pixels', () => {
    const q = reticleLayout({ width: 1600, height: 896 }, [0.5, 0.5], 0, [0.3, 0.7], { fixed: 64, arm: 32 }).quads[0]!;
    // s = 2; the PS2 frame's left edge at 800 - 640 = 160; corner 288 PS2 -> 160 + 576 = 736; 192 -> 384.
    expect([q.x - q.width / 2, q.y - q.height / 2, q.width]).toEqual([736, 384, 128]);
  });

  it('the shift is half a PS2 pixel in frame units (hud.ts\'s GS_SAMPLE_OFFSET arithmetic): half a texel at any scale', () => {
    for (const s of [1, 2, 1.5]) {
      const half = 0.5 * s;
      const [du, dv] = gsSampleShift({ width: 64 * s, height: 64 * s, turns: 0 }, half);
      expect([du * 64, dv * 64].map((v) => Math.round(v * 1e9) / 1e9)).toEqual([-0.5, -0.5]);
    }
    // A quarter turn clockwise: the screen's up-left is the quad's own up-right; a mirror turns the sign on its axis.
    expect(gsSampleShift({ width: 32, height: 32, turns: 1 }, 0.5).map((v) => Math.round(v * 32 * 1e9) / 1e9)).toEqual([-0.5, 0.5]);
    expect(gsSampleShift({ width: 32, height: 32, turns: 0, flipX: true }, 0.5).map((v) => Math.round(v * 32 * 1e9) / 1e9)).toEqual([0.5, -0.5]);
  });

  it('so a 2x2 dot sampled bilinear shows the GS\'s 3x3 mark: 1 at the centre, 0.5 beside, 0.25 on the corners', () => {
    // A 4x4 bitmap with its 2x2 dot at texels 1..2, the quad's corner at pixel 0 at native scale: pixel p's centre p + 0.5
    // plus the shift (-0.5 texel) samples texel coordinate p, the mean of texels p - 1 and p on each axis.
    const W = 4, dot = (k: number): number => (k === 1 || k === 2 ? 1 : 0);
    const [du] = gsSampleShift({ width: W, height: W, turns: 0 }, 0.5);
    const tap = (p: number): number => {
      const t = p + 0.5 + du * W - 0.5, k = Math.floor(t), f = t - k;
      return dot(((k % W) + W) % W) * (1 - f) + dot((((k + 1) % W) + W) % W) * f;   // REPEAT, the record's CLAMP 0
    };
    const row = [0, 1, 2, 3].map(tap);
    expect(row).toEqual([0, 0.5, 1, 0.5]);
    const mark = row.map((y) => row.map((x) => x * y));
    expect(mark.slice(1).map((r) => r.slice(1))).toEqual([[0.25, 0.5, 0.25], [0.5, 1, 0.5], [0.25, 0.5, 0.25]]);
  });
});

/** An 8x8 PSMT8 texdat as `hudBitmaps.test.ts` builds it, with an A+D block of TEX1_1 (0x14) and CLAMP_1 (0x08) or none. */
function texdat(pixels: Uint8Array, gsaddr: number, cbp: number, state: { tex1: bigint; clamp: bigint } | null): Uint8Array {
  const out = new Uint8Array(16 + 16 + pixels.length + 144);
  const v = new DataView(out.buffer);
  v.setUint16(0, 8, true);
  v.setUint16(2, 8, true);
  v.setUint32(4, pixels.length, true);
  v.setUint32(8, gsaddr, true);
  v.setUint32(12, 8 | (1 << 25), true);
  out.set(pixels, 32);
  const at = 32 + pixels.length;
  const tex0 = BigInt(gsaddr) | (0x13n << 20n) | (3n << 26n) | (3n << 30n) | (BigInt(cbp) << 37n);
  v.setBigUint64(at, tex0, true);
  v.setBigUint64(at + 8, 0x06n, true);                               // TEX0_1's id: not one of the state's registers
  if (state) {
    v.setBigUint64(at + 16, state.tex1, true); v.setBigUint64(at + 24, 0x14n, true);
    v.setBigUint64(at + 32, state.clamp, true); v.setBigUint64(at + 40, 0x08n, true);
  }
  return out;
}

function clutPar(gsaddr: number): Uint8Array {
  const par = new Uint8Array(8);
  const p = new DataView(par.buffer);
  p.setUint32(0, gsaddr, true);
  p.setUint32(4, 64, true);
  return par;
}
