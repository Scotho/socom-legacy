import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AddEquation, CustomBlending, DstColorFactor, Mesh, OneFactor, Vector2, type DataTexture, type MeshBasicMaterial, type Scene } from 'three';
import { parseZdb, zdbMember, Zar } from '@s2u/archive';
import { csm1ClutIndex, decodeAlpha, parseTextureRecord } from '@s2u/gs';
import { GAME_FRAME_DT } from '@s2u/scene';
import {
  nightGrainByte, NightGrainRandom, nightGrainLayout, nightLayout, NVG_GRAIN, NVG_GRAIN_ALPHA_RAMP, NVG_GRAIN_RANDOM_READING, Reticle,
} from '../src/reticle';

/**
 * R4P-246 NVG-GRAIN (research 84 s14.1): night vision's grain. `BitmapReticule_Init` (`FUN_002178c0`) lays four
 * `noise50.tif` quads (D:L71104-71119: x 5-320 / 320-635, y 75-224 / 224-373, the goggles' four UV corner sets), shows them
 * at alpha 64 (D:L71098-71101) and sets the texture's ALPHA_1 to 0x49 (D:L71120, `FUN_00354a90` -> `FUN_00354a00`); the
 * HUD update (`FUN_00216770`) refills its 64x64 texels with newlib's `rand()` (`FUN_00197740`) each frame the goggles are
 * on (D:L70362-70385), at the alpha `hud+0x4104` (64, D:L71267); `ChangeReticule` shows and hides them with the goggles
 * (D:L69351-69364).
 */

const PS2 = { width: 640, height: 448 };
const rgba = (w: number, h: number, alpha = 255) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(alpha) });

/** A HUD pass on a `width` x `height` buffer with the goggles and the noise served; returns the reticle and a draw. */
function rig(width = 640, height = 448) {
  const r = new Reticle();
  r.setBitmaps({
    fixed: rgba(64, 64), floating: rgba(32, 32), accuracy: null,
    sets: { 'nvg_part.tif': rgba(256, 256), 'noise50.tif': rgba(64, 64, 128) },
    samplers: { 'noise50.tif': { linear: true, wrapS: 'repeat', wrapT: 'repeat' } },
  });
  r.setVisible(true);
  const draw = (): Mesh[] => {
    let scene: Scene | null = null;
    r.render({ autoClear: true, getDrawingBufferSize: (v: Vector2) => v.set(width, height), render: (s) => { scene = s; } });
    const out: Mesh[] = [];
    (scene as Scene | null)?.traverse((o) => { if (o instanceof Mesh && o.visible && o.userData.nightGrain !== undefined) out.push(o); });
    return out;
  };
  return { r, draw };
}

afterEach(() => { vi.restoreAllMocks(); });

describe('R4P-246: the grain\'s layout (FUN_002178c0 D:L71104-71119)', () => {
  it('lays four quads tiling x 5-635, y 75-373 of the 640x448 frame, mirrored as the goggles are', () => {
    const { quads } = nightGrainLayout(PS2);
    const rect = quads.map((q) => [q.x - q.width / 2, q.y - q.height / 2, q.x + q.width / 2, q.y + q.height / 2]);
    expect(rect).toEqual([[5, 75, 320, 224], [320, 75, 635, 224], [5, 224, 320, 373], [320, 224, 635, 373]]);
    // The four UV corner sets are the goggles' own (D:L71112-71119 against D:L71071-71078), so the same mirrors.
    const goggles = nightLayout(PS2).quads;
    expect(quads.map((q) => [q.flipX, q.flipY])).toEqual(goggles.map((q) => [q.flipX, q.flipY]));
    expect(NVG_GRAIN.uv).toEqual([0.01, 0.995]);
  });

  it('scales with the frame\'s height about its centre, as the goggles do', () => {
    const { quads } = nightGrainLayout({ width: 1920, height: 1080 });
    const s = 1080 / 448, left = 960 - 320 * s;
    expect(quads[0]!.x - quads[0]!.width / 2).toBeCloseTo(left + 5 * s, 9);
    expect(quads[3]!.x + quads[3]!.width / 2).toBeCloseTo(left + 635 * s, 9);
    expect(quads[0]!.y - quads[0]!.height / 2).toBeCloseTo(75 * s, 9);
    expect(quads[3]!.y + quads[3]!.height / 2).toBeCloseTo(373 * s, 9);
  });
});

describe('R4P-246: the blend, ALPHA_1 = 0x49 (FUN_00354a00 D:L252534-252566, from D:L71120)', () => {
  it('decodes 0x49 as A = Cd, B = 0, C = As, D = Cd: (Cd - 0) * As + Cd', () => {
    expect(NVG_GRAIN.alpha1).toBe(0x49);
    const f = NVG_GRAIN.alpha1;
    expect([f & 3, (f >> 2) & 3, (f >> 4) & 3, (f >> 6) & 3]).toEqual([1, 2, 0, 1]);
    expect(decodeAlpha(BigInt(f))).toBe('destination');
    expect(NVG_GRAIN.quadAlpha).toBe(64);
  });
});

describe('R4P-246: the refill\'s random source, newlib rand() (FUN_00197740, FUN_0019eb18)', () => {
  it('steps the 64-bit LCG x * 0x5851f42d4c957f2d + 1 and returns its high word\'s low 31 bits', () => {
    const g = new NightGrainRandom(NVG_GRAIN_RANDOM_READING);
    let s = BigInt(NVG_GRAIN_RANDOM_READING);
    for (let i = 0; i < 5000; i++) {
      s = BigInt.asUintN(64, s * 0x5851f42d4c957f2dn + 1n);
      expect(g.next()).toBe(Number((s >> 32n) & 0x7fffffffn));
    }
  });

  it('turns a draw into a byte as the refill does: (char)(int)((float)r * 4.656613e-10 * 255.0)', () => {
    expect(nightGrainByte(0)).toBe(0);
    expect(nightGrainByte(0x7fffffff)).toBe(255);      // rounds to 2^31 as a float: 1.0 * 255
    expect(nightGrainByte(0x40000000)).toBe(127);
    expect(nightGrainByte(0x7fffff00)).toBe(254);
  });

  it('holds the palette\'s alpha ramp in lookup order, 46 to 128', () => {
    expect(NVG_GRAIN_ALPHA_RAMP).toHaveLength(256);
    expect(NVG_GRAIN_ALPHA_RAMP[0]).toBe(46);
    expect(NVG_GRAIN_ALPHA_RAMP[255]).toBe(128);
    for (let i = 1; i < 256; i++) expect(NVG_GRAIN_ALPHA_RAMP[i]!).toBeGreaterThanOrEqual(NVG_GRAIN_ALPHA_RAMP[i - 1]!);
  });
});

describe('R4P-246: the grain on the HUD pass, with the goggles', () => {
  it('night vision on: four grain quads at the four rectangles, with the destination brighten at alpha 64', () => {
    const { r, draw } = rig();
    r.setNight(true);
    const grain = draw();
    expect(grain).toHaveLength(4);
    const want = nightGrainLayout(PS2).quads;
    grain.sort((a, b) => (a.userData.nightGrain as number) - (b.userData.nightGrain as number));
    grain.forEach((m, i) => {
      const q = want[i]!;
      expect([m.position.x, m.position.y]).toEqual([q.x, q.y]);
      expect([m.scale.x, m.scale.y]).toEqual([q.flipX ? -q.width : q.width, q.flipY ? -q.height : q.height]);
      const mat = m.material as MeshBasicMaterial;
      expect(mat.blending).toBe(CustomBlending);
      expect(mat.blendEquation).toBe(AddEquation);
      expect(mat.blendSrc).toBe(DstColorFactor);           // Cd * (the shader's As)
      expect(mat.blendDst).toBe(OneFactor);                // + Cd
      expect(mat.color.r).toBeCloseTo(64 / 128, 9);        // the quad's alpha 64 (TFX MODULATE: As = At * Av >> 7)
      expect(mat.map!.offset.x).toBeCloseTo(0.01, 9);
      expect(mat.map!.repeat.x).toBeCloseTo(0.985, 9);
      // Drawn after the goggles (the same list `hud+0x34`, appended after them: FUN_001feae0 inserts at the end).
      expect(m.renderOrder).toBeGreaterThan(-1);
      expect(m.renderOrder).toBeLessThan(0);
    });
  });

  it('goggles off: no grain quad drawn', () => {
    const { r, draw } = rig();
    r.setNight(true);
    expect(draw()).toHaveLength(4);
    r.setNight(false);
    expect(draw()).toHaveLength(0);
  });

  it('refills the texels with the ramp\'s alphas once a game frame: two frames differ, one frame twice does not', () => {
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const { r, draw } = rig();
    r.setNight(true);
    const tex = (): DataTexture => (draw()[0]!.material as MeshBasicMaterial).map as DataTexture;
    const first = Uint8Array.from(tex().image.data as Uint8Array);
    const same = Uint8Array.from(tex().image.data as Uint8Array);
    expect(same).toEqual(first);
    now += GAME_FRAME_DT * 1000;
    const second = Uint8Array.from(tex().image.data as Uint8Array);
    expect(second).not.toEqual(first);
    const allowed = new Set(NVG_GRAIN_ALPHA_RAMP.map((a) => Math.min(255, Math.round((a * 255) / 128))));
    for (let i = 0; i < second.length; i += 4) {
      expect(allowed.has(second[i + 3]!)).toBe(true);
      expect([second[i], second[i + 1], second[i + 2]]).toEqual([second[i + 3], second[i + 3], second[i + 3]]);
    }
  });

  // The review's F1: the refill is once a GAME frame (29.97 a second) at any page rate -- the clock carries its remainder
  // (as setPip does), so a 60 Hz page's two 16.67 ms frames (33.33 ms, just short of GAME_FRAME_DT) still step one refill.
  for (const hz of [60, 30, 144]) {
    it(`refills about 30 times a second on a ${hz} Hz page (the game frame's rate, not the page's)`, () => {
      let now = 1000;
      vi.spyOn(performance, 'now').mockImplementation(() => now);
      const { r, draw } = rig();
      r.setNight(true);
      const tex = (): Uint8Array => Uint8Array.from((((draw()[0]!.material as MeshBasicMaterial).map as DataTexture).image.data as Uint8Array));
      let last = tex();
      let changes = 0;
      for (let f = 0; f < hz; f++) {
        now += 1000 / hz;
        const next = tex();
        if (next.some((v, i) => v !== last[i])) changes++;
        last = next;
      }
      expect(changes).toBeGreaterThanOrEqual(29);
      expect(changes).toBeLessThanOrEqual(30);
    });
  }
});

const disc = process.env.SOCOM_DISC ?? (process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT, 'game/disc') : '');
const run = disc ? resolve(disc, 'RUN') : '';
const maps = run && existsSync(run) ? readdirSync(run).filter((n) => /^MP\d+\.ZDB$/i.test(n)).sort() : [];
describe.skipIf(maps.length === 0)('R4P-246 (dev disc): noise50 on every multiplayer map (skipped without SOCOM_DISC / SOCOM_PC_ROOT)', () => {
  it('a 64x64 PSMT8, TCC 1 TFX MODULATE, its record\'s ALPHA_1 0x44; its CT32 palette white, alphas = NVG_GRAIN_ALPHA_RAMP in lookup order', () => {
    expect(maps).toHaveLength(22);
    for (const name of maps) {
      const bytes = new Uint8Array(readFileSync(resolve(run, name))), toc = parseZdb(bytes);
      const txr = Zar.parse(zdbMember(bytes, toc, 'HUD2_TXR.ZED'));
      const pal = Zar.parse(zdbMember(bytes, toc, 'HUD2_PAL.ZED'));
      const key = (txr.find('textures')?.children ?? []).find((k) => k.name.toLowerCase() === 'noise50.tif')!;
      const rec = parseTextureRecord('noise50.tif', txr.data(txr.child(key, 'texdat')!));
      expect([name, rec.width, rec.height, rec.bpp, rec.tex0?.psm, rec.tex0?.tcc, rec.tex0?.tfx, rec.tex0?.cpsm, rec.tex0?.csm, rec.gs?.blend, rec.gs?.bilinear])
        .toEqual([name, 64, 64, 8, 0x13, 1, 0, 0, 0, 'source', true]);
      const keyPal = pal.find('palettes')!.children.find((k) => new DataView(pal.data(pal.child(k, 'par')!).buffer, pal.data(pal.child(k, 'par')!).byteOffset).getUint32(0, true) === rec.tex0!.cbp)!;
      const buf = pal.data(pal.child(keyPal, 'buf')!);
      const ramp = Array.from({ length: 256 }, (_, i) => buf[csm1ClutIndex(i) * 4 + 3]!);
      expect([name, ...ramp]).toEqual([name, ...NVG_GRAIN_ALPHA_RAMP]);
      for (let i = 0; i < 256; i++) expect([buf[i * 4], buf[i * 4 + 1], buf[i * 4 + 2]]).toEqual([255, 255, 255]);
    }
  });
});
