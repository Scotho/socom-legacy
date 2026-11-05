import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as ui from '@s2u/ui';
import * as view from '../src/uiCompositorView';
import * as rules from '../src/uiRasterRules';
import { UI_GPU_TWIN_MODEL_ORDER, UI_GPU_TWIN_QUAD_ORDER, UI_GPU_TWIN_STEPS } from '../src/uiGpuTwin';

// GM-08 (plan 2026-11-01-gpu-menus, GM.R4): the drift guard between the GPU drawer's shaders and their f32 twin. GM.R4:
// "Tags S1-S13 (quads) and T1-T12 (models) appear in the GLSL and in the f32 twin; `uiGpuShaderTwin.test.ts` fails when
// they diverge." Until GM-11a-2 writes the shaders (`src/uiGpuShaders.ts`), this file pins the twin's side: its step
// table (every tag, its rule rows, its software line, its readings -- each reading an export that exists), the order
// its per-pixel routines carry the tags in (the order a shader must carry them), and each step function's arithmetic
// as source text (a swap of operands fails here even where no case rounds across a byte). The shaders' leg is skipped,
// by name, until the module exists; then it compares their tag order with the twin's.

const SRC = join(__dirname, '..', 'src');
const twin = readFileSync(join(SRC, 'uiGpuTwin.ts'), 'utf8');

/** The ordered first appearances of step tags (`S6_…`, `// S1:`, `S11ff_…`) in a source span: `ff` sub-steps count as their tag. */
export function stepTagOrder(source: string, prefix: 'S' | 'T'): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(new RegExp(`\\b(${prefix}\\d{1,2})(?:ff)?(?=[_:])`, 'g'))) if (!out.includes(m[1]!)) out.push(m[1]!);
  return out;
}
/** A function's body in the twin's source, from its declaration to the first line that closes it at column 0. */
function body(name: string): string {
  const at = twin.indexOf(`function ${name}(`);
  expect(at, `${name} in uiGpuTwin.ts`).toBeGreaterThan(-1);
  const end = twin.indexOf('\n}\n', at);
  return twin.slice(at, end);
}

describe('GM-08: the twin\'s step table (research 380 §2: P and M rows; GM.R4)', () => {
  it('names S1-S13 and T1-T12, once each, in order', () => {
    expect(UI_GPU_TWIN_STEPS.map((s) => s.tag)).toEqual([
      ...Array.from({ length: 13 }, (_, i) => `S${i + 1}`), ...Array.from({ length: 12 }, (_, i) => `T${i + 1}`),
    ]);
  });
  it('every step names its rule rows (P1-P23, M1-M8) and the software line it reproduces', () => {
    for (const s of UI_GPU_TWIN_STEPS) {
      expect(s.rules.length, s.tag).toBeGreaterThan(0);
      for (const r of s.rules) expect(r, s.tag).toMatch(s.tag.startsWith('S') ? /^P(\d|1\d|2[0-3])$/ : /^(M[1-8]|P(\d|1\d|2[0-3]))$/);
      expect(s.software, s.tag).toMatch(/uiCompositorView\.ts:\d+/);
    }
  });
  it('every reading a step names is an export that exists (the shader comment names the same)', () => {
    const exported = new Set([...Object.keys(ui), ...Object.keys(view), ...Object.keys(rules)]);
    for (const s of UI_GPU_TWIN_STEPS) for (const r of s.readings) expect(exported.has(r), `${s.tag}: ${r}`).toBe(true);
  });
  it('every software line the table cites carries the code it names (re-read at the source)', () => {
    const lines = readFileSync(join(SRC, 'uiCompositorView.ts'), 'utf8').split('\n');
    for (const s of UI_GPU_TWIN_STEPS) {
      const n = Number(/uiCompositorView\.ts:(\d+)/.exec(s.software)![1]);
      expect(lines[n - 1], `${s.tag} at uiCompositorView.ts:${n}`).toContain(s.line);
    }
  });
});

describe('GM-08: the order the twin carries the tags in (the order a shader must carry them)', () => {
  it('the quad routine: S1 .. S13 in the pinned order', () => {
    expect(stepTagOrder(body('drawQuadTwin'), 'S')).toEqual([...UI_GPU_TWIN_QUAD_ORDER]);
    expect([...UI_GPU_TWIN_QUAD_ORDER].sort()).toEqual(UI_GPU_TWIN_STEPS.filter((s) => s.tag.startsWith('S')).map((s) => s.tag).sort());
  });
  it('the triangle routine: T1 .. T12 in the pinned order', () => {
    expect(stepTagOrder(body('drawTriangleTwin'), 'T')).toEqual([...UI_GPU_TWIN_MODEL_ORDER]);
    expect([...UI_GPU_TWIN_MODEL_ORDER].sort()).toEqual(UI_GPU_TWIN_STEPS.filter((s) => s.tag.startsWith('T')).map((s) => s.tag).sort());
  });
});

/**
 * The source pin: each step function's arithmetic as written (whitespace collapsed). The software's operand order is
 * the reference (`uiCompositorView.ts`, the lines in the step table); the GLSL is written from these lines.
 */
const PINNED: Record<string, string> = {
  S3_alpha: 'return f(byte / 128);',
  S6_horizontal: 'return f(f(dl * ix) + f(dr * fx));',
  S7_vertical: 'return f(f(top * iy) + f(lower * fy));',
  S8_modulate: 'return Math.min(255, f(f(t * c) / 128));',
  S9_modulateAlpha: 'return f(f(ta / 255) * alpha);',
  S10_frameAlpha: 'return f(A + f(f(255 - A) * Math.min(1, a)));',
  S11_source: 'return f(C + f(f(c - C) * a));',
  S11_additive: 'return f(C + f(c * a));',
  S12_store: 'if (!(v > 0)) return 0; if (v >= 255) return 255; const r = Math.round(v); return r - v === 0.5 && (r & 1) === 1 ? r - 1 : r;',
  S13_channel: 'return f(decodeChannel(value, code));',
  S10ff_alpha: 'const d = f(A / 255); return f(f(oa * f(1 - d)) + d);',
  S11ff_sourceOut: 'return clamp01(f(c / 255));',
  S11ff_additiveOut: 'return clamp01(Math.min(1, f(f(c * a) / 255)));',
  S11ff_source: 'const d = f(D / 255); return f(f(o * oa) + f(d * f(1 - oa)));',
  S11ff_additive: 'return f(o + f(D / 255));',
  S12ff_unorm: 'return S12_store(f(clamp01(v) * 255));',
  T2_weight: 'return f(f(f(f(bx - x) * f(cy - y)) - f(f(cx - x) * f(by - y))) * inv);',
  T2_third: 'return f(f(1 - w0) - w1);',
  T3_inside: 'return !(w0 < 0 || w1 < 0 || w2 < 0);',
  T4_invW: 'return f(f(f(w0 * aw) + f(w1 * bw)) + f(w2 * cw));',
  T5_depth: 'return clamp01(f(invW * scale));',
  T5_depthPasses: 'return z > stored;',
  T6_perspective: 'return f(w * f(vw / invW));',
  T7_lerp: 'return f(f(f(w0 * a) + f(w1 * b)) + f(w2 * c));',
  T8_lerp: 'return f(f(a * f(1 - fx)) + f(b * fx));',
  T9_modulateAlpha: 'return f(f(sa / 255) * f(ra / 128));',
  T10_discard: 'return al <= 0;',
};

describe('GM-08: the source pin -- each step function\'s arithmetic as written', () => {
  const found = new Map<string, string>();
  for (const m of twin.matchAll(/^export function ([ST]\d{1,2}(?:ff)?_\w+)\([^)]*\): \w+ \{ (.*) \}$/gm)) found.set(m[1]!, m[2]!.replace(/\s+/g, ' '));
  it('the twin\'s step functions are exactly the pinned set', () => {
    expect([...found.keys()].sort()).toEqual(Object.keys(PINNED).sort());
  });
  for (const [name, text] of Object.entries(PINNED)) {
    it(`${name}: ${text}`, () => expect(found.get(name)).toBe(text));
  }
});

/**
 * The shaders' leg (GM-11a-2's contract with this file): `src/uiGpuShaders.ts` exports `UI_GPU_SHADER_SOURCES`, a record
 * of GLSL sources by program name; the quad programs (`quad-*`) carry the S tags and the model programs (`model-*`) the
 * T tags, as comments or identifiers, in the twin's order (the `ff` programs omit the steps the fixed-function
 * blender does: S2, S10-S12 for quads and T11 for models -- GM-11a-2 states which, and this test is updated with it).
 */
const SHADERS = join(SRC, 'uiGpuShaders.ts');
describe.skipIf(!existsSync(SHADERS))(
  `GM-08: the GLSL carries the twin's tags in order${existsSync(SHADERS) ? '' : ' -- SKIPPED: src/uiGpuShaders.ts does not exist until GM-11a-2'}`, () => {
    it('the programmable quad program and the model programs carry the twin\'s order', async () => {
      const mod = (await import(/* @vite-ignore */ SHADERS)) as { UI_GPU_SHADER_SOURCES: Record<string, string> };
      const src = mod.UI_GPU_SHADER_SOURCES;
      expect(stepTagOrder(src['quad-prog']!, 'S')).toEqual([...UI_GPU_TWIN_QUAD_ORDER]);
      // GM-11a-2 states the ff programs' omissions (`UI_GPU_FF_OMITS`): S2 and S12 are the blender's; S13, the codes, never
      // reach an ff quad (quadRoute sends a non-finite colour to prog).
      const omits = (mod as unknown as { UI_GPU_FF_OMITS: Record<string, string> }).UI_GPU_FF_OMITS;
      expect(Object.keys(omits).sort()).toEqual(['S12', 'S13', 'S2']);
      for (const name of ['quad-ff-src', 'quad-ff-add']) expect(stepTagOrder(src[name]!, 'S'), name).toEqual(UI_GPU_TWIN_QUAD_ORDER.filter((t) => !(t in omits)));
      for (const [name, glsl] of Object.entries(src)) if (name.startsWith('model-')) expect(stepTagOrder(glsl, 'T'), name).toEqual(UI_GPU_TWIN_MODEL_ORDER.filter((t) => t !== 'T11'));
    });
  });
