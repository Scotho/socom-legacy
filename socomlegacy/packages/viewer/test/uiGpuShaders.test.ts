import { beforeEach, describe, expect, it } from 'vitest';
import * as ui from '@s2u/ui';
import type { UiDrawItem } from '@s2u/ui';
import * as view from '../src/uiCompositorView';
import * as rules from '../src/uiRasterRules';
import { UI_PLAN_CODE, planFrame, type UiFramePlan, type UiPlanBlendMode } from '../src/uiFramePlan';
import { UI_GPU_TWIN_MODEL_ORDER, UI_GPU_TWIN_QUAD_ORDER, UI_GPU_TWIN_STEPS, executeFramePlanOnTwin } from '../src/uiGpuTwin';
import {
  UI_GPU_AXIS_WIDTH, UI_GPU_FF_BLEND, UI_GPU_FF_OMITS, UI_GPU_MODEL_PROGRAMS, UI_GPU_QUAD_ATTRIBUTES, UI_GPU_QUAD_PROGRAMS, UI_GPU_QUAD_VERTEX_SOURCE,
  UI_GPU_SHADER_SOURCES, UI_GPU_TEXTURE_UNITS,
} from '../src/uiGpuShaders';
import {
  UI_GPU_MODEL_ATTRIBUTES, UI_GPU_MODEL_FF_BLEND, UI_GPU_MODEL_FF_OMITS, UI_GPU_MODEL_VERTEX_SOURCE, UI_GPU_TRIANGLE_LAYOUT, modelProgramFor,
} from '../src/uiGpuModels';
import { GpuUiPresenter } from '../src/uiGpuPresenter';
import { UI_GPU_INSTANCE_LAYOUT, UiGpuBackend, createUiGpuBackend, gpuChannel, quadProgramFor } from '../src/uiGpuWebgl2';
import { GL, MODEL_VARYINGS, QUAD_VARYINGS, fakeGl, type Fake } from './uiGpuFakeGl';
import { UI_RASTER_CASES, UI_RASTER_CASE_MODES, UI_RASTER_CASE_SCALES, caseRasterInputs, caseRunKey, pattern, solid } from './uiRasterCases';

// GM-11a-2 (plan 2026-11-01-gpu-menus, "The quad shader"; GM.R3, GM.R4, GM.R6, GM.R7; research 380 §2): the quad
// programs and the backend that drives them. Three kinds of test, kept apart:
// - **The source lint** (source inspection, in Node): the GLSL samples by `texelFetch` only (no `texture(`, no
//   `textureLod(`: no hardware filtering), lerps without `mix(` (the software's operand order, GM.R4), stores with
//   `roundEven` on `prog` and with nothing on `ff` (the blender's), names each step's rule rows and readings beside its
//   tag, and carries the twin's tags in the twin's order (the drift guard, with `uiGpuShaderTwin.test.ts`).
// - **The source pins**: each tagged step's GLSL expression, written from the twin's step function (the twin's own
//   source pins, `uiGpuShaderTwin.test.ts` PINNED, hold the twin to the software's lines).
// - **Fake-GL draw sequences over GM-03's cases** (unit test): the backend on a fake WebGL2 context whose programs run
//   the twin's arithmetic (`uiGpuFakeGl.ts`): every frame it draws equal to `executeFramePlanOnTwin`'s, byte for byte,
//   with the call sequence held -- programs by path and blend, the blender's factors, copies before their batches, the
//   axis table's floats, the uniforms per quad.
// GM-15a adds the model programs (`model-ff-src`, `model-ff-add`; research 380 M1-M7): their lint and source pins
// (the T tags), and the fake GL drawing the model cases (2, 3, 16, 17, 18) with a depth buffer, frame for frame the
// twin's, the depth's calls held (`checkModels`).
// What none of this can say -- that a GPU compiles this GLSL and computes what the twin computes -- is the box's
// (GM-11b, the parity spec at scale 1; GM-27 on real GPU classes). Evidence kinds: source inspection, unit test.

/** The drift guard's tag reader (`uiGpuShaderTwin.test.ts` `stepTagOrder`, the same expression): first appearances, `ff` sub-steps as their tag. */
function stepTagOrder(source: string, prefix: 'S' | 'T'): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(new RegExp(`\\b(${prefix}\\d{1,2})(?:ff)?(?=[_:])`, 'g'))) if (!out.includes(m[1]!)) out.push(m[1]!);
  return out;
}

/** Every fragment program (GM-15a: the quads' and the models'); the quad lint below reads `quad-*` only. */
const ALL_PROGRAMS = Object.entries(UI_GPU_SHADER_SOURCES) as [keyof typeof UI_GPU_SHADER_SOURCES, string][];
const PROGRAMS = ALL_PROGRAMS.filter(([name]) => name.startsWith('quad-'));
const MODELS = ALL_PROGRAMS.filter(([name]) => name.startsWith('model-'));
const ALL_SOURCES: [string, string][] = [['quad vertex', UI_GPU_QUAD_VERTEX_SOURCE], ['model vertex', UI_GPU_MODEL_VERTEX_SOURCE], ...ALL_PROGRAMS];
/** A GLSL source with its `//` comments removed (the code a GPU compiles). */
const code = (src: string): string => src.replace(/\/\/[^\n]*/g, '');
const stepOf = (tag: string) => UI_GPU_TWIN_STEPS.find((s) => s.tag === tag)!;
/** The `// Sn: ...` and `// Tn: ...` comment lines of a source, by tag. */
const tagLines = (src: string): Map<string, string[]> => {
  const out = new Map<string, string[]>();
  for (const m of src.matchAll(/^\s*\/\/ ([ST]\d{1,2}): (.*)$/gm)) out.set(m[1]!, [...(out.get(m[1]!) ?? []), m[2]!]);
  return out;
};
/** The text from a tag's comment line to the next tag's (or the end of `main`). */
const span = (src: string, tag: string): string => {
  const at = src.search(new RegExp(`// ${tag}: `));
  expect(at, tag).toBeGreaterThan(-1);
  const rest = src.slice(at + 1);
  const end = rest.search(/\/\/ [ST]\d{1,2}: /);
  return end < 0 ? rest : rest.slice(0, end);
};

/** A texel lookup in GLSL ES 3.00 other than `texelFetch` (GM.R4: no hardware filtering): every `texture*(` builtin --
 * texture(, textureLod(, textureGrad(, textureProj(, textureOffset( ... -- but `textureSize(`, a query of a level's size
 * that reads no texel (GM-15a's T8 takes W and H from it; f9's box run at 0dad8ffd1 caught the old lint refusing it). */
const TEXTURE_LOOKUP = /\btexture(?!Size\b)\w*\s*\(/;

describe('GM-11a-2: the source lint (every quad source; GM-15a: the version, the lookups and mix( over the model sources too)', () => {
  it('is GLSL ES 3.00 at high precision', () => {
    for (const [name, src] of ALL_SOURCES) {
      expect(src.startsWith('#version 300 es\n'), name).toBe(true);
      expect(src, name).toContain('precision highp float;');
      expect(src, name).toContain('precision highp int;');
    }
  });

  it('samples by texelFetch only: no texture(, textureLod( or any other filtered lookup (GM.R4: no hardware filtering)', () => {
    for (const [name, src] of ALL_SOURCES) {
      expect(code(src), name).not.toMatch(TEXTURE_LOOKUP);
    }
    for (const [name, src] of ALL_PROGRAMS) expect(code(src), name).toMatch(/\btexelFetch\s*\(/);
  });

  it('the lookup lint refuses every sampling builtin and lets the size query through', () => {
    for (const call of ['texture(u_tex, p)', 'textureLod(u_tex, p, 0.0)', 'textureGrad(u_tex, p, a, b)', 'textureProj(u_tex, q)', 'textureOffset(u_tex, p, o)', 'textureLodOffset(u_tex, p, 0.0, o)', 'texture (u_tex, p)']) {
      expect(call).toMatch(TEXTURE_LOOKUP);
    }
    for (const call of ['textureSize(u_tex, 0)', 'texelFetch(u_tex, q, 0)']) expect(call).not.toMatch(TEXTURE_LOOKUP);
  });

  it('never calls mix( (the software\'s operand order, d[l]·ix + d[r]·fx, GM.R4)', () => {
    for (const [name, src] of ALL_SOURCES) expect(code(src), name).not.toMatch(/\bmix\s*\(/);
  });

  it('quad-prog rounds with roundEven only (P12, GS_BLEND_ROUNDING_READING); the ff programs round nothing (the blender converts)', () => {
    const prog = code(UI_GPU_SHADER_SOURCES['quad-prog']);
    expect(prog).toMatch(/\broundEven\s*\(/);
    expect(prog).toContain('roundEven(clamp(v.v, 0.0, 255.0))');
    expect(prog).not.toMatch(/\b(round|floor|ceil|trunc|fract)\s*\(/);
    for (const name of ['quad-ff-src', 'quad-ff-add'] as const) {
      expect(code(UI_GPU_SHADER_SOURCES[name]), name).not.toMatch(/\b(roundEven|round|floor|ceil|trunc|fract)\s*\(/);
    }
  });

  it('the axis table is UI_GPU_AXIS_WIDTH entries wide in the GLSL as in the backend', () => {
    for (const [name, src] of PROGRAMS) expect(src, name).toContain(`const int AXIS_W = ${UI_GPU_AXIS_WIDTH};`);
  });

  it('each tag\'s comment names the step\'s rule rows and every reading the twin\'s step table names for it', () => {
    for (const [name, src] of PROGRAMS) {
      const lines = tagLines(src);
      expect(lines.size, name).toBeGreaterThan(0);
      for (const [tag, texts] of lines) {
        expect(texts, `${name} ${tag}: one comment line`).toHaveLength(1);
        const step = stepOf(tag);
        for (const r of step.rules) expect(texts[0], `${name} ${tag}: ${r}`).toMatch(new RegExp(`\\b${r}\\b`));
        for (const r of step.readings) expect(texts[0], `${name} ${tag}: ${r}`).toContain(r);
      }
    }
  });

  it('every reading the GLSL names is an export that exists (the ledger\'s and the step table\'s names)', () => {
    const exported = new Set([...Object.keys(ui), ...Object.keys(view), ...Object.keys(rules)]);
    for (const [name, src] of ALL_SOURCES) for (const m of src.matchAll(/\b[A-Z][A-Z0-9_]*_READING\b/g)) expect(exported.has(m[0]), `${name}: ${m[0]}`).toBe(true);
  });
});

describe('GM-11a-3: instancing -- each quad\'s inputs are per-instance attributes, carried to the fragment flat', () => {
  const VS = UI_GPU_QUAD_VERTEX_SOURCE;
  it('the vertex shader reads the quad from its attributes, at the locations the backend binds', () => {
    expect(UI_GPU_QUAD_ATTRIBUTES).toEqual({ a_rect: 0, a_colour: 1, a_codes: 2, a_axis: 3, a_flags: 4 });
    for (const decl of ['in ivec4 a_rect;', 'in vec4 a_colour;', 'in ivec4 a_codes;', 'in ivec4 a_axis;', 'in ivec2 a_flags;']) expect(VS).toContain(decl);
    expect(VS).toContain('uniform vec2 u_size;');
    expect(code(VS)).not.toMatch(/uniform ivec4 u_rect/);
  });
  it('each varying is flat (never interpolated: the value is the quad\'s, bit for bit) and copies its attribute unchanged', () => {
    for (const decl of ['flat out ivec4 q_rect;', 'flat out vec4 q_colour;', 'flat out ivec4 q_codes;', 'flat out ivec2 q_axisBase;', 'flat out int q_textured;', 'flat out int q_zeroMask;', 'flat out int q_additive;']) expect(VS).toContain(decl);
    for (const v of Object.values(QUAD_VARYINGS)) expect(VS).toContain(v.line);
    expect(code(VS)).not.toMatch(/\bsmooth\b|\bcentroid\b|\bnoperspective\b/);
  });
  it('every fragment program takes the quad as flat inputs, none as a per-quad uniform', () => {
    for (const [name, src] of PROGRAMS) {
      for (const decl of ['flat in ivec4 q_rect;', 'flat in vec4 q_colour;', 'flat in int q_textured;', 'flat in ivec2 q_axisBase;']) expect(src, name).toContain(decl);
      expect(code(src), name).not.toMatch(/uniform \w+ u_(rect|colour|textured|axisBase|codes|zeroMask|additive);/);
    }
    for (const decl of ['flat in ivec4 q_codes;', 'flat in int q_zeroMask;', 'flat in int q_additive;']) expect(UI_GPU_SHADER_SOURCES['quad-prog']).toContain(decl);
    expect(UI_GPU_SHADER_SOURCES['quad-prog']).toContain('uniform ivec2 u_destOrigin;');
  });
});

describe('GM-11a-2: the twin\'s tags, in the twin\'s order (the drift guard\'s GLSL leg; GM.R4)', () => {
  it('quad-prog carries S1 .. S13 in the twin\'s quad order', () => {
    expect(stepTagOrder(UI_GPU_SHADER_SOURCES['quad-prog'], 'S')).toEqual([...UI_GPU_TWIN_QUAD_ORDER]);
  });

  it('the ff programs carry the twin\'s order less the steps the blender does (S2, S12) and the codes they never carry (S13)', () => {
    expect(Object.keys(UI_GPU_FF_OMITS).sort()).toEqual(['S12', 'S13', 'S2']);
    const want = UI_GPU_TWIN_QUAD_ORDER.filter((t) => !(t in UI_GPU_FF_OMITS));
    for (const name of ['quad-ff-src', 'quad-ff-add'] as const) expect(stepTagOrder(UI_GPU_SHADER_SOURCES[name], 'S'), name).toEqual(want);
  });

  it('no T tag in a quad program, no S tag in a model program (GM-15a\'s models carry the T tags)', () => {
    for (const [name, src] of PROGRAMS) expect(stepTagOrder(src, 'T'), name).toEqual([]);
    for (const [name, src] of MODELS) expect(stepTagOrder(src, 'S'), name).toEqual([]);
  });

  it('the programs are the plan\'s five, by name: the three quads\' and (GM-15a) the two models\'', () => {
    expect(Object.keys(UI_GPU_SHADER_SOURCES).sort()).toEqual([...UI_GPU_QUAD_PROGRAMS, ...UI_GPU_MODEL_PROGRAMS].sort());
    expect([...UI_GPU_MODEL_PROGRAMS].sort()).toEqual(['model-ff-add', 'model-ff-src']);
    expect(Object.keys(UI_GPU_FF_BLEND).sort()).toEqual(['quad-ff-add', 'quad-ff-src']);
    expect(Object.keys(UI_GPU_MODEL_FF_BLEND).sort()).toEqual(['model-ff-add', 'model-ff-src']);
  });
});

// ---- GM-15a: the model programs (research 380 M1-M7; GM.R4, GM.R10) -----------------------------------------------

describe('GM-15a: the model source lint (model-ff-src, model-ff-add and their vertex shader)', () => {
  it('ES 3.00 at high precision, the bitmap an RGBA8UI usampler2D read by texelFetch only (no texture(, no mix()', () => {
    for (const [name, src] of [['model vertex', UI_GPU_MODEL_VERTEX_SOURCE], ...MODELS] as [string, string][]) {
      expect(src.startsWith('#version 300 es\n'), name).toBe(true);
      expect(src, name).toContain('precision highp float;');
      expect(src, name).toContain('precision highp int;');
      expect(code(src), name).not.toMatch(TEXTURE_LOOKUP);
      expect(code(src), name).not.toMatch(/\bmix\s*\(/);
    }
    for (const [name, src] of MODELS) {
      expect(src, name).toContain('precision highp usampler2D;');
      expect(src, name).toContain('uniform usampler2D u_tex;');
      expect(src, name).toContain('uniform float u_depthScale;');
      expect(code(src), name).not.toMatch(/\bsampler2D\b/);
    }
  });

  it('floor( only inside T8 (sample()\'s own floor); no other rounding, no ceil( in the code (the box is the plan\'s)', () => {
    for (const [name, src] of MODELS) {
      const c = code(src);
      expect((c.match(/\bfloor\s*\(/g) ?? []).length, name).toBe(2);
      expect((code(span(src, 'T8')).match(/\bfloor\s*\(/g) ?? []).length, name).toBe(2);
      expect(c, name).not.toMatch(/\b(roundEven|round|ceil|trunc|fract)\s*\(/);
    }
  });

  it('no % on a possibly negative operand (undefined, ESSL 3.00 section 5.9): every % is the REPEAT helper\'s, guarded by i >= 0 or folded', () => {
    for (const [name, src] of MODELS) {
      const lines = code(src).split('\n').filter((l) => l.includes('%'));
      expect(lines.map((l) => l.trim()), name).toEqual(['return i >= 0 ? i % n : (n - 1) - ((-i - 1) % n);']);
      // The texel indices are the helper's: no raw % on x0, y0 or their neighbours.
      expect(span(src, 'T8'), name).toContain('int xa = wrapRepeat(x0, size.x);');
      expect(span(src, 'T8'), name).toContain('int yb = wrapRepeat(y0 + 1, size.y);');
    }
  });

  it('gl_FragDepth is written in T5, before every later discard, so every path that is not discarded writes it', () => {
    for (const [name, src] of MODELS) {
      const c = code(src);
      expect((c.match(/gl_FragDepth\s*=/g) ?? []).length, name).toBe(1);
      expect(span(src, 'T5'), name).toContain('gl_FragDepth = clamp(invW * u_depthScale, 0.0, 1.0);');
      // No return out of main and no discard between T4 and T5: the write is unconditional once T3 has passed.
      expect(c.slice(c.indexOf('void main()')), name).not.toMatch(/\breturn\b/);
      expect(code(span(src, 'T4')), name).not.toMatch(/\bdiscard\b/);
    }
  });

  it('discard in T3 (outside) and T10 (al <= 0) only', () => {
    for (const [name, src] of MODELS) {
      expect((code(src).match(/\bdiscard\b/g) ?? []).length, name).toBe(2);
      expect(code(span(src, 'T3')), name).toContain('if (w0 < 0.0 || w1 < 0.0 || w2 < 0.0) discard;');
      expect(code(span(src, 'T10')), name).toContain('if (al <= 0.0) discard;');
    }
  });

  it('each T tag\'s comment line names the step\'s rule rows and every reading the twin\'s step table names for it', () => {
    for (const [name, src] of MODELS) {
      const lines = tagLines(src);
      expect([...lines.keys()], name).toEqual(UI_GPU_TWIN_MODEL_ORDER.filter((t) => !(t in UI_GPU_MODEL_FF_OMITS)));
      for (const [tag, texts] of lines) {
        expect(texts, `${name} ${tag}: one comment line`).toHaveLength(1);
        const step = stepOf(tag);
        for (const r of step.rules) expect(texts[0], `${name} ${tag}: ${r}`).toMatch(new RegExp(`\\b${r}\\b`));
        for (const r of step.readings) expect(texts[0], `${name} ${tag}: ${r}`).toContain(r);
      }
    }
  });

  it('carries T1 .. T12 in the twin\'s order less T11, the blender\'s (UI_GPU_MODEL_FF_OMITS)', () => {
    expect(Object.keys(UI_GPU_MODEL_FF_OMITS)).toEqual(['T11']);
    for (const [name, src] of MODELS) expect(stepTagOrder(src, 'T'), name).toEqual(UI_GPU_TWIN_MODEL_ORDER.filter((t) => t !== 'T11'));
  });

  it('the vertex shader: the box from gl_VertexID, every other input flat and copied whole, at the locations the backend binds', () => {
    const VS = UI_GPU_MODEL_VERTEX_SOURCE;
    expect(UI_GPU_MODEL_ATTRIBUTES).toEqual({ a_box: 0, a_ab: 1, a_c: 2, a_w: 3, a_u: 4, a_v: 5, a_ca: 6, a_cb: 7, a_cc: 8 });
    for (const decl of ['in ivec4 a_box;', 'in vec4 a_ab;', 'in vec4 a_c;', 'in vec4 a_w;', 'in vec3 a_u;', 'in vec3 a_v;', 'in vec4 a_ca;', 'in vec4 a_cb;', 'in vec4 a_cc;']) expect(VS).toContain(decl);
    for (const v of Object.values(MODEL_VARYINGS)) expect(VS).toContain(v.line);
    expect(VS).toContain('float x = float((v & 1) == 0 ? a_box.x : a_box.z);');
    expect(VS).toContain('float y = float(v < 2 ? a_box.y : a_box.w);');
    // GM-15a review F1: the corner to clip space, as the quads' vertex shader writes it (the box's pixel edges on the frame).
    expect(VS).toContain('gl_Position = vec4(vec2(x, y) / u_size * 2.0 - 1.0, 0.0, 1.0);');
    expect(UI_GPU_QUAD_VERTEX_SOURCE).toContain('gl_Position = vec4(vec2(x, y) / u_size * 2.0 - 1.0, 0.0, 1.0);');
    expect(code(VS)).not.toMatch(/\bsmooth\b|\bcentroid\b|\bnoperspective\b/);
    for (const [name, src] of MODELS) for (const decl of ['flat in vec4 t_ab;', 'flat in vec4 t_c;', 'flat in vec4 t_w;', 'flat in vec3 t_u;', 'flat in vec3 t_v;', 'flat in vec4 t_ca;', 'flat in vec4 t_cb;', 'flat in vec4 t_cc;']) expect(src, name).toContain(decl);
  });

  it('the instance layout mirrors UI_GPU_INSTANCE_LAYOUT: 136 bytes, each attribute after the last, 4-byte aligned', () => {
    expect(UI_GPU_INSTANCE_LAYOUT.stride).toBe(72);
    const L = UI_GPU_TRIANGLE_LAYOUT;
    expect(L).toEqual({ stride: 136, a_box: 0, a_ab: 16, a_c: 32, a_w: 48, a_u: 64, a_v: 76, a_ca: 88, a_cb: 104, a_cc: 120 });
    expect(L.a_cc + 16).toBe(L.stride);
  });

  it('the program a run takes: its blend; a prog run is GM-26\'s and throws', () => {
    expect(modelProgramFor({ path: 'ff', blend: 'source' })).toBe('model-ff-src');
    expect(modelProgramFor({ path: 'ff', blend: 'additive' })).toBe('model-ff-add');
    expect(() => modelProgramFor({ path: 'prog', blend: 'source' })).toThrow(/GM-26/);
    expect(UI_GPU_MODEL_FF_BLEND['model-ff-src']).toEqual(['SRC_ALPHA', 'ONE_MINUS_SRC_ALPHA', 'ZERO', 'ONE']);
    expect(UI_GPU_MODEL_FF_BLEND['model-ff-add']).toEqual(['ONE', 'ONE', 'ZERO', 'ONE']);
  });
});

/**
 * GM-15a: the model programs' source pins, each written from the twin's step function of its tag (`uiGpuTwin.ts`; their
 * own pins, `uiGpuShaderTwin.test.ts` PINNED): T2 `T2_weight`/`T2_third`, T4 `T4_invW`, T5 `T5_depth`, T6
 * `T6_perspective`, T7 `T7_lerp`, T8 `sampleTwin` with `T8_lerp`, T9 `S8_modulate`/`T9_modulateAlpha`.
 */
const MODEL_PINS: Record<string, string[]> = {
  T1: ['ivec2 p = ivec2(gl_FragCoord.xy);', 'float x = float(p.x);', 'float y = float(p.y);'],
  T2: ['float w0 = (((bx - x) * (cy - y)) - ((cx - x) * (by - y))) * inv;', 'float w1 = (((cx - x) * (ay - y)) - ((ax - x) * (cy - y))) * inv;', 'float w2 = (1.0 - w0) - w1;'],
  T4: ['float invW = ((w0 * t_w.x) + (w1 * t_w.y)) + (w2 * t_w.z);'],
  T5: ['gl_FragDepth = clamp(invW * u_depthScale, 0.0, 1.0);'],
  T6: ['w0 = w0 * (t_w.x / invW);', 'w1 = w1 * (t_w.y / invW);', 'w2 = w2 * (t_w.z / invW);'],
  T7: ['vec4 rgba = ((w0 * t_ca) + (w1 * t_cb)) + (w2 * t_cc);', 'float u = ((w0 * t_u.x) + (w1 * t_u.y)) + (w2 * t_u.z);', 'float v = ((w0 * t_v.x) + (w1 * t_v.y)) + (w2 * t_v.z);'],
  T8: [
    'ivec2 size = textureSize(u_tex, 0);', 'float U = u * float(size.x);', 'float V = (1.0 - v) * float(size.y);', 'float sx = U - 0.5;', 'int x0 = int(floor(sx));',
    'float fx = sx - float(x0);', 'vec4 ta = vec4(texelFetch(u_tex, ivec2(xa, ya), 0));', 'vec4 tg = vec4(texelFetch(u_tex, ivec2(xb, yb), 0));',
    's = (((ta * (1.0 - fx)) + (tb * fx)) * (1.0 - fy)) + (((te * (1.0 - fx)) + (tg * fx)) * fy);',
    // GM-15a review F1: the rest of sampleTwin, line for line -- y = f(V - 0.5), y0 = floor(y), fy = f(y - y0);
    // xa/xb = wrap(x0, x0 + 1, W), ya/yb = wrap(y0, y0 + 1, H); the taps a (xa, ya), b (xb, ya), e (xa, yb), g (xb, yb).
    'float sy = V - 0.5;', 'int y0 = int(floor(sy));', 'float fy = sy - float(y0);',
    'int xa = wrapRepeat(x0, size.x);', 'int xb = wrapRepeat(x0 + 1, size.x);', 'int ya = wrapRepeat(y0, size.y);', 'int yb = wrapRepeat(y0 + 1, size.y);',
    'vec4 tb = vec4(texelFetch(u_tex, ivec2(xb, ya), 0));', 'vec4 te = vec4(texelFetch(u_tex, ivec2(xa, yb), 0));',
  ],
  T9: [
    'float al = rgba.a / 128.0;', 'r = min(255.0, (s.r * rgba.r) / 128.0);', 'b = min(255.0, (s.b * rgba.b) / 128.0);', 'al = (s.a / 255.0) * (rgba.a / 128.0);',
    // GM-15a review F1: the untextured channels as they stand (the twin's r = r0, g = r1, bl = r2) and S8_modulate's green.
    'float r = rgba.r, g = rgba.g, b = rgba.b;', 'g = min(255.0, (s.g * rgba.g) / 128.0);',
  ],
  T10: ['if (al <= 0.0) discard;'],
};

describe('GM-15a: the model source pins -- each tagged step\'s GLSL as the twin writes it', () => {
  for (const name of UI_GPU_MODEL_PROGRAMS) {
    for (const [tag, pins] of Object.entries(MODEL_PINS)) {
      it(`${name} ${tag}`, () => { for (const pin of pins) expect(span(UI_GPU_SHADER_SOURCES[name], tag)).toContain(pin); });
    }
  }
  it('the output for the blender: model-ff-src c / 255 clamped (S11ff_sourceOut), model-ff-add min(1, c al / 255) clamped (S11ff_additiveOut), alpha clamp(al)', () => {
    expect(span(UI_GPU_SHADER_SOURCES['model-ff-src'], 'T10')).toContain('vec3 o = clamp(vec3(r, g, b) / 255.0, 0.0, 1.0);');
    expect(span(UI_GPU_SHADER_SOURCES['model-ff-add'], 'T10')).toContain('vec3 o = clamp(min(vec3(1.0), (vec3(r, g, b) * al) / 255.0), 0.0, 1.0);');
    for (const name of UI_GPU_MODEL_PROGRAMS) expect(UI_GPU_SHADER_SOURCES[name]).toContain('o_colour = vec4(o, clamp(al, 0.0, 1.0));');
  });
});

/**
 * The source pins: each tagged step's GLSL, written from the twin's step function of the same tag (whose own pin is
 * `uiGpuShaderTwin.test.ts` PINNED). A swapped operand, a lerp turned into `a + (b - a) t`, or a modulate as
 * `t (c / 128)` fails here.
 */
const PROG_PINS: Record<string, string[]> = {
  S1: ['ivec2 p = ivec2(gl_FragCoord.xy);'],
  S2: ['vec4 C = roundEven(texelFetch(u_dest, p - u_destOrigin, 0) * 255.0);'],
  S3: ['X alpha = divX(chan(q_colour.a, q_codes.w), 128.0);'],                                  // S3_alpha: f(byte / 128)
  // S4 and S5 are one fetch block: their comment lines stand together and the code follows S5's.
  S5: ['int ce = q_axisBase.x + (p.x - q_rect.x);', 'int re = q_axisBase.y + (p.y - q_rect.y);', 'int left = int(col.x), right = int(col.y)', 'float fx = col.z, ix = col.w'],
  S6: ['vec4 upper = tl * ix + tr * fx;', 'vec4 lower = bl * ix + br * fx;'],                    // S6_horizontal: f(f(dl * ix) + f(dr * fx))
  S7: ['vec4 t = upper * iy + lower * fy;'],                                                     // S7_vertical: f(f(top * iy) + f(lower * fy))
  S8: ['r = minX(255.0, divX(mulX(fin(t.r), red), 128.0));', 'b = minX(255.0, divX(mulX(fin(t.b), blue), 128.0));'], // S8_modulate
  S9: ['a = mulX(fin(t.a / 255.0), alpha);'],                                                    // S9_modulateAlpha: f(f(ta / 255) * alpha)
  S10: ['X nA = addX(fin(C.a), mulX(fin(255.0 - C.a), minX(1.0, a)));'],                         // S10_frameAlpha
  S11: ['n0 = addX(fin(C.r), mulX(r, a));', 'n0 = addX(fin(C.r), mulX(subX(r, fin(C.r)), a));'], // S11_additive, S11_source
  S12: ['vec4 o = vec4(storeX(n0), storeX(n1), storeX(n2), storeX(nA));'],
  S13: ['if ((q_zeroMask & 8) != 0) {', 'if ((q_zeroMask & 1) != 0) o.r = 0.0;'],
};
const FF_PINS: Record<string, string[]> = {
  S1: ['ivec2 p = ivec2(gl_FragCoord.xy);'],
  S3: ['float alpha = q_colour.a / 128.0;'],
  S6: ['vec4 upper = tl * ix + tr * fx;', 'vec4 lower = bl * ix + br * fx;'],
  S7: ['vec4 t = upper * iy + lower * fy;'],
  S8: ['r = min(255.0, (t.r * red) / 128.0);'],
  S9: ['a = (t.a / 255.0) * alpha;'],
  S10: ['float oa = clamp(a, 0.0, 1.0);'],                                                       // the blender's source alpha (S10ff_alpha's oa)
};

describe('GM-11a-2: the source pins -- each tagged step\'s GLSL as the twin writes it', () => {
  for (const [tag, pins] of Object.entries(PROG_PINS)) {
    it(`quad-prog ${tag}`, () => { for (const pin of pins) expect(span(UI_GPU_SHADER_SOURCES['quad-prog'], tag)).toContain(pin); });
  }
  for (const name of ['quad-ff-src', 'quad-ff-add'] as const) {
    for (const [tag, pins] of Object.entries(FF_PINS)) {
      it(`${name} ${tag}`, () => { for (const pin of pins) expect(span(UI_GPU_SHADER_SOURCES[name], tag)).toContain(pin); });
    }
  }
  it('quad-ff-src S11: the output c / 255, clamped (S11ff_sourceOut); quad-ff-add S11: min(1, c·a / 255), clamped (S11ff_additiveOut)', () => {
    expect(span(UI_GPU_SHADER_SOURCES['quad-ff-src'], 'S11')).toContain('vec3 o = clamp(vec3(r, g, b) / 255.0, 0.0, 1.0);');
    expect(span(UI_GPU_SHADER_SOURCES['quad-ff-add'], 'S11')).toContain('vec3 o = clamp(min(vec3(1.0), (vec3(r, g, b) * a) / 255.0), 0.0, 1.0);');
    for (const name of ['quad-ff-src', 'quad-ff-add'] as const) expect(UI_GPU_SHADER_SOURCES[name]).toContain('o_colour = vec4(o, oa);');
  });
  it('quad-prog decides a non-finite operand as IEEE 754 does (P23): inf·0 NaN, inf − inf NaN, min(m, NaN) NaN, the store\'s NaN 0 and +inf 255', () => {
    const prog = UI_GPU_SHADER_SOURCES['quad-prog'];
    const fn = (name: string): string => { const at = prog.indexOf(`X ${name}(`) >= 0 ? prog.indexOf(`X ${name}(`) : prog.indexOf(`float ${name}(`); expect(at, name).toBeGreaterThan(-1); return prog.slice(at, prog.indexOf('\n}\n', at)); };
    expect(fn('mulX')).toContain('if (s == 0) return nanX();');            // an infinity times zero
    expect(fn('mulX')).toContain('if (a.k == 0 && b.k == 0) return fin(a.v * b.v);');
    expect(fn('addX')).toContain('if (a.k == b.k) return a;');              // the same infinity twice
    expect(fn('addX')).toMatch(/return nanX\(\);\s*$/);                   // opposite infinities
    expect(fn('subX')).toContain('if (a.k == 0 && b.k == 0) return fin(a.v - b.v);');
    expect(fn('minX')).toContain('if (a.k == 1) return a;');                // Math.min(m, NaN) is NaN
    expect(fn('minX')).toContain('if (a.k == 2) return fin(m);');
    expect(fn('storeX')).toContain('if (v.k == 2) return 255.0;');
    expect(fn('storeX')).toContain('if (v.k != 0) return 0.0;');
    // The kinds are the plan's code table.
    expect(UI_PLAN_CODE).toEqual({ finite: 0, nan: 1, posInf: 2, negInf: 3 });
  });
});

// ---- the backend on the fake GL ------------------------------------------------------------------------------------

const backendOn = (f: Fake, transparent = false): UiGpuBackend => {
  const b = createUiGpuBackend(f.canvas as unknown as HTMLCanvasElement, { transparent });
  if (!b) throw new Error('no backend');
  return b;
};
const diff = (a: ArrayLike<number>, b: ArrayLike<number>): number => {
  if (a.length !== b.length) return -1;
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n;
};
const planOf = (c: (typeof UI_RASTER_CASES)[number], scale: 1 | 2 | 4, mode: 'opaque' | 'transparent', blend: UiPlanBlendMode): UiFramePlan => {
  const { items, textures, options } = caseRasterInputs(c, scale, mode);
  return planFrame(items, textures, { scale: options.scale, transparent: options.transparent === true, hd: options.hd, movie: options.movie, blend });
};
const glFactor = (name: string): number => GL[name as keyof typeof GL] as number;

/** The call sequence of one drawn plan, held against the plan (see the describe's comment). */
function checkSequence(f: Fake, plan: UiFramePlan, key: string): void {
  const quads = plan.steps.flatMap((s) => (s.kind === 'quads' ? s.quads : []));
  // GM-11a-3: a movie step is its own draw (`uiGpuMovie.test.ts` holds it); GM-15a: a triangle is a draw of a model
  // program (`checkModels`); the quads' draws are the rest, in order.
  const movies = f.draws.filter((d) => d.program === 'movie');
  const draws = f.draws.filter((d) => d.program !== 'movie' && !d.program.startsWith('model-'));
  expect(movies.length, `${key}: one draw per movie step`).toBe(plan.steps.filter((s) => s.kind === 'movie').length);
  // GM-15a: no quad and no movie picture tests the models' depth (UI_2D_QUAD_Z_READING).
  for (const d of [...draws, ...movies]) expect(d.depthTest, `${key}: ${d.program} with DEPTH_TEST off`).toBe(false);
  checkModels(f, plan, key);
  expect(draws.length, `${key}: one draw per quad`).toBe(quads.length);
  expect(f.copies.length, `${key}: one copy per batch`).toBe(plan.batches.length);
  quads.forEach((qi, k) => {
    const q = plan.quads[qi]!, d = draws[k]!, what = `${key} quad ${qi}`;
    expect(d.program, what).toBe(quadProgramFor(q));
    expect(d.uniforms.q_rect, what).toEqual([q.rect.xs, q.rect.ys, q.rect.xe, q.rect.ye]);
    expect(d.uniforms.u_size, what).toEqual([plan.target.width, plan.target.height]);
    expect(d.uniforms.q_colour, what).toEqual(q.colour.map((v, c) => Math.fround(gpuChannel(v, q.codes[c]!)[0])));
    expect(d.uniforms.q_textured, what).toEqual([q.texture === null ? 0 : 1]);
    if (q.axis) expect(d.uniforms.q_axisBase, what).toEqual([q.axis.column / 4, q.axis.row / 4]);
    if (q.path === 'ff') {
      const want = UI_GPU_FF_BLEND[quadProgramFor(q) as 'quad-ff-src' | 'quad-ff-add'].map(glFactor);
      expect(d.blend, what).toBe(true);
      expect(d.func, what).toEqual(want);
      expect(d.equation, what).toEqual([GL.FUNC_ADD, GL.FUNC_ADD]);
    } else {
      expect(d.blend, what).toBe(false);
      expect(d.uniforms.q_codes, what).toEqual(q.colour.map((v, c) => gpuChannel(v, q.codes[c]!)[1]));
      expect(d.uniforms.q_zeroMask, what).toEqual([q.zeroMask]);
      expect(d.uniforms.q_additive, what).toEqual([q.blend === 'additive' ? 1 : 0]);
      // Its batch's copy: the last copy before the draw is the batch's rectangle, and the draw reads from its origin.
      const b = plan.batches[q.batch!]!;
      const last = f.copies.filter((c) => c.at < d.at).at(-1)!;
      expect([last.x, last.y, last.w, last.h], what).toEqual([b.copy.xs, b.copy.ys, b.copy.xe - b.copy.xs, b.copy.ye - b.copy.ys]);
      expect(d.uniforms.u_destOrigin, what).toEqual([b.copy.xs, b.copy.ys]);
      expect(d.units[UI_GPU_TEXTURE_UNITS.dest], what).toBe(last.texture);
    }
  });
  // GM-11a-3: each run of quads (a `quads` step) is one instanced draw, its quads the instances in the run's order;
  // GM-15a: each run of triangles too, in the plan's step order among them.
  const runs = plan.steps.filter((s) => s.kind === 'quads');
  const instanced = f.calls.filter((c) => c[0] === 'drawArraysInstanced');
  const instancedRuns = plan.steps.flatMap((s) => (s.kind === 'quads' ? [s.quads.length] : s.kind === 'triangles' ? [s.triangles.length] : []));
  expect(instanced.map((c) => c[4]), `${key}: one instanced draw per run, its quads (or triangles) the instances`).toEqual(instancedRuns);
  expect(f.calls.filter((c) => c[0] === 'drawArrays').length, `${key}: no plain draw of a quad (the movie's only)`).toBe(movies.length);
  let k = 0;
  for (const s of runs) {
    if (s.kind !== 'quads') continue;
    const mine = draws.slice(k, k + s.quads.length);
    k += s.quads.length;
    expect(new Set(mine.map((d) => d.at)).size, `${key}: a run is one call`).toBe(1);
    expect(mine.map((d) => d.instance), key).toEqual(s.quads.map((_, i) => i));
  }
  // The instance data reaches the GPU once a frame: one buffer write for every run of quads, one for every run of
  // triangles (GM-15a; offsets per run).
  const triRuns = plan.steps.filter((s) => s.kind === 'triangles').length;
  expect(f.calls.filter((c) => c[0] === 'bufferSubData').length, `${key}: one instance upload a frame`).toBe((runs.length ? 1 : 0) + (triRuns ? 1 : 0));
  // The axis table: RGBA32F, UI_GPU_AXIS_WIDTH wide, each f64 entry as its nearest f32.
  if (plan.axis.length) {
    const up = f.calls.filter((c) => c[0] === 'texSubImage2D' && c[8] === GL.FLOAT).at(-1)!;
    expect(up[5], key).toBe(UI_GPU_AXIS_WIDTH);
    expect(up[6], key).toBe(Math.ceil(plan.axis.length / 4 / UI_GPU_AXIS_WIDTH));
    expect(diff((up[9] as Float32Array).subarray(0, plan.axis.length), Float32Array.from(plan.axis)), key).toBe(0);
  }
}

/**
 * GM-15a: the models' calls of one drawn plan -- the frame target's `DEPTH_COMPONENT32F` attachment, one clear of it to 0
 * per pass before the pass's first run (and after the run before it), and each run of triangles: one instanced draw
 * through its program, under `DEPTH_TEST` with `GREATER` and the depth mask on, the colour mask RGB only (M7), the
 * blender's `UI_GPU_MODEL_FF_BLEND`, the pass's `depthScale`, each instance its triangle's box and numbers.
 */
function checkModels(f: Fake, plan: UiFramePlan, key: string): void {
  const models = f.draws.filter((d) => d.program.startsWith('model-'));
  const runs = plan.steps.filter((s) => s.kind === 'triangles');
  expect(models.length, `${key}: one draw per triangle`).toBe(runs.reduce((n, s) => n + (s.kind === 'triangles' ? s.triangles.length : 0), 0));
  if (!plan.target.depth) { expect(f.depthClears, `${key}: no depth clear without a pass`).toEqual([]); return; }
  const withDepth = f.framebuffers.filter((fb) => !fb.deleted && fb.depth);
  expect(withDepth, `${key}: one frame target with a depth`).toHaveLength(1);
  const target = withDepth[0]!, depth = target.depth!;
  expect([depth.format, depth.w, depth.h], `${key}: the depth is DEPTH_COMPONENT32F at the frame's size`).toEqual([GL.DEPTH_COMPONENT32F, plan.target.width, plan.target.height]);
  expect(f.depthClears.map((c) => [c.value, c.mask, c.fb]), `${key}: one depth clear to 0 per pass, the depth mask on`).toEqual(plan.steps.filter((s) => s.kind === 'pass').map(() => [0, true, target.id]));
  let cleared = -1, drawnAt = -1, d = 0, c = 0;
  for (const s of plan.steps) {
    if (s.kind === 'pass') {
      const clear = f.depthClears[c++]!;
      expect(clear.at, `${key}: pass ${s.pass}'s clear after the run before it`).toBeGreaterThan(drawnAt);
      cleared = clear.at;
      continue;
    }
    if (s.kind !== 'triangles') continue;
    const mine = models.slice(d, d + s.triangles.length);
    d += s.triangles.length;
    const name = modelProgramFor(s), want = UI_GPU_MODEL_FF_BLEND[name].map(glFactor);
    expect(new Set(mine.map((x) => x.at)).size, `${key}: a run of triangles is one call`).toBe(1);
    expect(mine[0]!.at, `${key}: the run after its pass's clear`).toBeGreaterThan(cleared);
    drawnAt = mine[0]!.at;
    mine.forEach((x, j) => {
      const t = plan.triangles[s.triangles[j]!]!, what = `${key} triangle ${s.triangles[j]}`;
      expect([x.program, x.instance, x.instances], what).toEqual([name, j, s.triangles.length]);
      expect([x.depthTest, x.depthFunc, x.depthMask, x.depthAttached], `${what}: DEPTH_TEST, GREATER, the mask on, a depth`).toEqual([true, GL.GREATER, true, true]);
      expect(x.mask, `${what}: the colour mask RGB only (M7)`).toEqual([true, true, true, false]);
      expect([x.blend, x.func, x.equation], what).toEqual([true, want, [GL.FUNC_ADD, GL.FUNC_ADD]]);
      expect(x.uniforms.u_depthScale, `${what}: the pass's depthScale`).toEqual([plan.passes[s.pass]!.depthScale]);
      expect(x.uniforms.u_size, what).toEqual([plan.target.width, plan.target.height]);
      expect(x.uniforms.a_box, what).toEqual([t.box.xs, t.box.ys, t.box.xe, t.box.ye]);
      expect(x.uniforms.t_ab, what).toEqual([t.a.x, t.a.y, t.b.x, t.b.y].map(Math.fround));
      expect(x.uniforms.t_c, what).toEqual([Math.fround(t.c.x), Math.fround(t.c.y), Math.fround(1 / t.area), 0]);
      expect(x.uniforms.t_w, what).toEqual([Math.fround(t.a.invW), Math.fround(t.b.invW), Math.fround(t.c.invW), t.texture === null ? 0 : 1]);
      expect(x.uniforms.t_ca, what).toEqual(t.a.rgba.map(Math.fround));
      expect(x.units[UI_GPU_TEXTURE_UNITS.tex], what).not.toBeNull();
    });
  }
}

describe('GM-11a-2: the backend draws GM-03\'s cases on the fake GL, frame for frame the twin\'s', () => {
  // One test per case, and a macrotask between tests (GM-11a-2 review: these draws ran ~60 s synchronously, so the
  // worker answered none of vitest's RPC -- "Timeout calling onTaskUpdate", an unhandled error beside a green run);
  // each case still runs every scale, mode and blend.
  beforeEach(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  it.each(UI_RASTER_CASES.map((c, i) => [c.id, i, c] as const))('case %i (entry %i) at 1/2/4, both modes, under ff and exact: drawn (GM-15a: the models too), the frame equals executeFramePlanOnTwin and the call sequence holds', (_id, _i, c) => {
    for (const scale of UI_RASTER_CASE_SCALES) for (const mode of UI_RASTER_CASE_MODES) for (const blend of ['ff', 'exact'] as const) {
      const plan = planOf(c, scale, mode, blend), key = `${caseRunKey(c, scale, mode)}/${blend}`;
      const f = fakeGl(), b = backendOn(f, mode === 'transparent');
      expect(b.refusal(plan), key).toBeNull();
      b.draw(plan);
      expect(diff(b.readPixels().data, executeFramePlanOnTwin(plan, { divide: false }).frame.data), key).toBe(0);
      checkSequence(f, plan, key);
    }
  }, 120_000);

  it('drawn: every case -- clears, quads, movie pictures (8, GM-11a-3) and, GM-15a, the models (2, 3, 16, 17, 18); none refused', () => {
    const drawn = new Set<number>(), refused = new Set<number>();
    for (const c of UI_RASTER_CASES) for (const scale of UI_RASTER_CASE_SCALES) for (const mode of UI_RASTER_CASE_MODES) for (const blend of ['ff', 'exact'] as const) {
      const b = backendOn(fakeGl(), mode === 'transparent');
      (b.refusal(planOf(c, scale, mode, blend)) ? refused : drawn).add(c.id);
    }
    expect([...drawn].sort((a, z) => a - z)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect([...refused]).toEqual([]);
  }, 120_000);

  it('both paths and both blends are exercised: ff-src, ff-add and prog draws, copies, textured and untextured (GM-11a-3, the movie; GM-15a, both model programs, textured and flat)', () => {
    const seen = new Set<string>();
    for (const c of UI_RASTER_CASES) for (const blend of ['ff', 'exact'] as const) {
      const plan = planOf(c, 1, 'opaque', blend), f = fakeGl(), b = backendOn(f);
      if (b.refusal(plan)) continue;
      b.draw(plan);
      for (const d of f.draws) {
        seen.add(d.program === 'movie' ? 'movie' : d.program.startsWith('model-') ? `${d.program}/${d.uniforms.t_w![3] ? 'textured' : 'flat'}` : `${d.program}/${d.uniforms.q_textured![0] ? 'textured' : 'flat'}`);
      }
      if (f.copies.length) seen.add('copy');
    }
    expect([...seen].sort()).toEqual([
      'copy', 'model-ff-add/textured', 'model-ff-src/flat', 'model-ff-src/textured', 'movie', 'quad-ff-add/flat', 'quad-ff-add/textured', 'quad-ff-src/flat',
      'quad-ff-src/textured', 'quad-prog/flat', 'quad-prog/textured',
    ]);
  });

  it('case 2: invW 2 on its fourth triangle gives the pass depthScale 0.25 (GM-15b: every vertex at most 1/2) -- the nearer triangle still wins (M3, GM.R10)', () => {
    const c = UI_RASTER_CASES.find((x) => x.id === 2)!;
    for (const blend of ['ff', 'exact'] as const) {
      const plan = planOf(c, 1, 'opaque', blend), f = fakeGl(), b = backendOn(f);
      expect(plan.passes.map((p) => p.depthScale)).toEqual([0.25]);
      b.draw(plan);
      const models = f.draws.filter((d) => d.program.startsWith('model-'));
      expect(models.map((d) => d.program)).toEqual(['model-ff-add', 'model-ff-add', 'model-ff-add', 'model-ff-add']);
      for (const d of models) expect(d.uniforms.u_depthScale).toEqual([0.25]);
      // The probes the case pins (uiRasterCases.ts): the shared edge drawn once at equal depth, twice where nearer.
      const px = b.readPixels(), at = (x: number, y: number) => Array.from(px.data.subarray((y * px.width + x) * 4, (y * px.width + x) * 4 + 4));
      expect(at(4, 4), blend).toEqual([70, 70, 70, 255]);
      expect(at(24, 4), blend).toEqual([130, 130, 130, 255]);
      // The depth the pass leaves: 1 * 0.25 under the first pair, 2 * 0.25 = 0.5 where the nearer triangle drew.
      const depth = f.framebuffers.find((fb) => !fb.deleted && fb.depth)!.depth!;
      expect(depth.data![4 * depth.w + 4]).toBe(0.25);
      expect(depth.data![4 * depth.w + 24]).toBe(0.5);
      expect(depth.data![40 * depth.w + 100]).toBe(0);   // untouched: the pass's clear
    }
  });

  it('a quad drawn after a pass never tests the depth: DEPTH_TEST off for every quad (case 18: quads before, between and after its passes)', () => {
    const c = UI_RASTER_CASES.find((x) => x.id === 18)!;
    for (const blend of ['ff', 'exact'] as const) {
      const plan = planOf(c, 2, 'opaque', blend), f = fakeGl(), b = backendOn(f);
      b.draw(plan);
      const quads = f.draws.filter((d) => d.program.startsWith('quad-'));
      expect(quads.length, blend).toBeGreaterThan(0);
      for (const d of quads) expect(d.depthTest, blend).toBe(false);
      expect(f.draws.some((d) => d.program.startsWith('model-')), blend).toBe(true);
      expect(diff(b.readPixels().data, executeFramePlanOnTwin(plan, { divide: false }).frame.data), blend).toBe(0);
    }
  });

  it('no byte depends on state another draw left: scissor, colour mask, blend, cull, dither, discard, a wrong texture on every unit', () => {
    for (const id of [5, 6, 11, 12, 20]) for (const blend of ['ff', 'exact'] as const) {
      const c = UI_RASTER_CASES.find((x) => x.id === id)!, plan = planOf(c, 2, 'opaque', blend);
      const f = fakeGl(), b = backendOn(f);
      b.begin(plan.target.width, plan.target.height, false);
      const g = f.gl;
      const wrong = g.createTexture(); g.bindTexture(GL.TEXTURE_2D, wrong); g.texStorage2D(GL.TEXTURE_2D, 1, GL.RGBA8, 1, 1);
      for (const unit of [0, 1, 2]) { g.activeTexture(GL.TEXTURE0 + unit); g.bindTexture(GL.TEXTURE_2D, wrong); }
      g.enable(GL.SCISSOR_TEST); g.scissor(0, 0, 1, 1); g.colorMask(false, true, false, false); g.enable(GL.CULL_FACE);
      g.enable(GL.DITHER); g.enable(GL.RASTERIZER_DISCARD); g.enable(GL.BLEND); g.blendFuncSeparate(GL.ZERO, GL.ONE, GL.ZERO, GL.ONE);
      // GM-11a-3: a foreign vertex array and buffer bound, with attributes pointed and divisors set on them.
      const junkVao = g.createVertexArray(), junkBuf = g.createBuffer();
      g.bindVertexArray(junkVao); g.bindBuffer(GL.ARRAY_BUFFER, junkBuf); g.bufferData(GL.ARRAY_BUFFER, 64, GL.STATIC_DRAW);
      for (let loc = 0; loc < 5; loc++) { g.vertexAttribIPointer(loc, 4, GL.INT, 0, 0); g.vertexAttribDivisor(loc, 0); g.enableVertexAttribArray(loc); }
      b.draw(plan);
      expect(diff(b.readPixels().data, executeFramePlanOnTwin(plan, { divide: false }).frame.data), `case ${id}/${blend}`).toBe(0);
    }
  });

  it('a prog quad reads its batch\'s copy, not the frame as it is drawn (layered === sequential: case 11\'s overlapping glyphs split batches)', () => {
    const c = UI_RASTER_CASES.find((x) => x.id === 11)!, plan = planOf(c, 1, 'opaque', 'exact');
    expect(plan.batches.length).toBeGreaterThan(1);
    const f = fakeGl(), b = backendOn(f);
    b.draw(plan);
    expect(diff(b.readPixels().data, executeFramePlanOnTwin(plan, { divide: false }).frame.data)).toBe(0);
    expect(diff(b.readPixels().data, executeFramePlanOnTwin(plan, { divide: false, sequential: true }).frame.data)).toBe(0);
    // Every prog draw reads the last copy before it, which is its own batch's rectangle (`checkSequence`).
    checkSequence(f, plan, 'case 11/exact');
    expect(f.copies.length).toBe(plan.batches.length);
  });
});

describe('GM-11a-2: programs, textures and the axis table on the fake GL', () => {
  const caseById = (id: number) => UI_RASTER_CASES.find((x) => x.id === id)!;

  it('compiles and links each program once, on first use, its shaders flagged for deletion after the link; compilePrograms links all six (GM-11a-3: the movie; GM-15a: the two models\')', () => {
    const f = fakeGl(), b = backendOn(f);
    for (let k = 0; k < 3; k++) b.draw(planOf(caseById(20), 1, 'opaque', 'ff'));
    const used = new Set(f.draws.map((d) => d.program));
    expect(f.programs.filter((p) => p.linked)).toHaveLength(used.size);
    expect(f.shaders.every((s) => s.deleted)).toBe(true);
    b.compilePrograms();
    expect(f.programs.filter((p) => p.linked).map((p) => p.name).sort()).toEqual([...UI_GPU_QUAD_PROGRAMS, ...UI_GPU_MODEL_PROGRAMS, 'movie'].sort());
    b.compilePrograms();
    expect(f.programs).toHaveLength(6);
    // GM-15a: a model program's attributes are bound at UI_GPU_MODEL_ATTRIBUTES' locations before its link.
    const model = f.programs.find((p) => p.name === 'model-ff-src')!;
    for (const [attribute, loc] of Object.entries(UI_GPU_MODEL_ATTRIBUTES)) expect(model.bound.get(attribute), attribute).toBe(loc);
  });

  it('GM-15a: the depth renderbuffer is made once for the frame target, kept across frames, deleted on dispose; a frame with no pass makes none', () => {
    const f = fakeGl(), b = backendOn(f);
    b.draw(planOf(caseById(20), 1, 'opaque', 'ff'));
    expect(f.renderbuffers).toHaveLength(0);
    for (let k = 0; k < 2; k++) b.draw(planOf(caseById(3), 1, 'opaque', 'ff'));
    b.draw(planOf(caseById(20), 1, 'opaque', 'ff'));
    expect(f.renderbuffers).toHaveLength(1);
    expect([f.renderbuffers[0]!.format, f.renderbuffers[0]!.w, f.renderbuffers[0]!.h]).toEqual([GL.DEPTH_COMPONENT32F, 640, 448]);
    expect(f.depthClears.map((c) => c.value)).toEqual([0, 0]);   // one a pass: the two frames of case 3
    b.dispose();
    expect(f.renderbuffers.every((r) => r.deleted)).toBe(true);
    const g = fakeGl({ incomplete: true }), c = backendOn(g);
    expect(() => c.draw(planOf(caseById(3), 1, 'opaque', 'ff'))).toThrow(/incomplete/);
  });

  it('GM-15a: a programmable model run or a model number past f32 is refused (L1, named); the planner keeps the first L1 already', () => {
    const plan = planOf(caseById(3), 1, 'opaque', 'ff');
    const prog: UiFramePlan = { ...plan, steps: plan.steps.map((s) => (s.kind === 'triangles' ? { ...s, path: 'prog' as const } : s)) };
    expect(backendOn(fakeGl()).refusal(prog)).toMatch(/GM-26/);
    const big: UiFramePlan = { ...plan, triangles: plan.triangles.map((t, i) => (i === 0 ? { ...t, a: { ...t.a, u: 1e39 } } : t)) };
    expect(backendOn(fakeGl()).refusal(big)).toMatch(/past f32/);
  });

  it('a shader that does not compile or a program that does not link throws, naming the program and the log (GM.R13 counts it a loss)', () => {
    const f = fakeGl({ failCompile: 'struct X' }), b = backendOn(f);
    expect(() => b.compilePrograms()).toThrow(/quad-prog's fragment shader did not compile: fake/);
    const g = fakeGl({ failLink: true }), c = backendOn(g);
    expect(() => c.compilePrograms()).toThrow(/did not link: fake: link failed/);
    expect(g.programs.every((p) => p.deleted)).toBe(true);
  });

  it('uploads each bitmap once as RGBA8UI, top row first, unflipped and not premultiplied; a bitmap a frame does not use stays resident (GM-13)', () => {
    const tex = pattern(5, 3, 9, 77);
    const textures = (n: string) => (n === 'p.tif' ? tex : n === 'q.tif' ? solid(2, 2, [1, 2, 3, 4]) : null);
    const glyph = (t: string): UiDrawItem => ({ kind: 'sprite', node: 'n', texture: t, x0: 0, y0: 0, x1: 10, y1: 6, u0: 0, v0: 0, u1: 1, v1: 1, rgba: [128, 128, 128, 128], clip: null } as UiDrawItem);
    const f = fakeGl(), b = backendOn(f);
    f.gl.pixelStorei(GL.UNPACK_FLIP_Y_WEBGL, true); f.gl.pixelStorei(GL.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    b.draw(planFrame([glyph('p.tif')], textures, { blend: 'ff' }));
    b.draw(planFrame([glyph('p.tif')], textures, { blend: 'ff' }));
    const ups = f.calls.filter((c) => c[0] === 'texSubImage2D' && c[7] === GL.RGBA_INTEGER);
    expect(ups).toHaveLength(1);
    const t = f.textures.find((x) => x.format === GL.RGBA8UI && x.w === 5 && x.h === 3)!;
    expect(diff(t.data!, tex.data)).toBe(0);
    b.draw(planFrame([glyph('q.tif')], textures, { blend: 'ff' }));
    // GM-13 (residency, `HD_UI_RESIDENCY_ADAPTATION`) supersedes GM-11a-2's delete at the frame's end: kept, not re-sent.
    expect(t.deleted).toBe(false);
    b.draw(planFrame([glyph('p.tif')], textures, { blend: 'ff' }));
    expect(f.calls.filter((c) => c[0] === 'texSubImage2D' && c[7] === GL.RGBA_INTEGER)).toHaveLength(2);
  });

  it('the axis texture is RGBA32F, NEAREST, kept across frames and re-made only to grow', () => {
    const f = fakeGl(), b = backendOn(f);
    b.draw(planOf(caseById(6), 1, 'opaque', 'ff'));
    b.draw(planOf(caseById(6), 1, 'opaque', 'ff'));
    const axes = f.textures.filter((t) => t.format === GL.RGBA32F && t.w === UI_GPU_AXIS_WIDTH);
    expect(axes).toHaveLength(1);
    expect([axes[0]!.min, axes[0]!.mag]).toEqual([GL.NEAREST, GL.NEAREST]);
    b.draw(planOf(caseById(15), 4, 'opaque', 'ff'));   // 2560 columns and 1792 rows of entries: more rows
    const grown = f.textures.filter((t) => t.format === GL.RGBA32F && t.w === UI_GPU_AXIS_WIDTH);
    expect(grown).toHaveLength(2);
    expect(grown[0]!.deleted).toBe(true);
  }, 30_000);   // case 15 planned at 4x: 5.2 s on f9's c7a.4xlarge at 0dad8ffd1, over vitest's 5 s default

  it('a finite colour past f32 reaches prog as its infinity\'s code (gpuChannel, the twin\'s Math.fround), and an ff quad with one is refused (L1)', () => {
    expect(gpuChannel(1e39, 0)).toEqual([0, UI_PLAN_CODE.posInf]);
    expect(gpuChannel(-1e39, 0)).toEqual([0, UI_PLAN_CODE.negInf]);
    expect(gpuChannel(254.5, 0)).toEqual([254.5, 0]);
    expect(gpuChannel(0, UI_PLAN_CODE.nan)).toEqual([0, UI_PLAN_CODE.nan]);
    const fill: UiDrawItem = { kind: 'sprite', node: 'big', texture: null, x0: 0, y0: 0, x1: 8, y1: 4, u0: 0, v0: 0, u1: 0, v1: 0, rgba: [1e39, -1e39, 50, 64], clip: null } as UiDrawItem;
    const items: UiDrawItem[] = [{ kind: 'clear', rgb: [100, 100, 100] }, fill];
    const plan = planFrame(items, () => null, { blend: 'ff' });
    expect(plan.quads[0]!.path).toBe('prog');
    const f = fakeGl(), b = backendOn(f);
    b.draw(plan);
    expect(f.draws[0]!.uniforms.q_codes).toEqual([UI_PLAN_CODE.posInf, UI_PLAN_CODE.negInf, 0, 0]);
    expect(diff(b.readPixels().data, executeFramePlanOnTwin(plan, { divide: false }).frame.data)).toBe(0);
    const px = b.readPixels().data;
    expect([px[0], px[1], px[2], px[3]]).toEqual([255, 0, 75, 255]);   // +inf, -inf, 100 + (50 - 100)/2, the frame alpha
    const tex = solid(2, 2, [200, 200, 200, 255]);
    const textured: UiDrawItem = { ...(fill as object), texture: 't.tif', u1: 1, v1: 1, rgba: [1e39, 128, 128, 128] } as UiDrawItem;
    const tplan = planFrame([textured], (n) => (n === 't.tif' ? tex : null), { blend: 'ff' });
    expect(tplan.quads[0]!.path).toBe('ff');
    expect(backendOn(fakeGl()).refusal(tplan)).toMatch(/past f32/);
  });

  it('a bitmap past MAX_TEXTURE_SIZE is refused with GM-14b named, and the presenter draws that frame L1, equal to the software', () => {
    const c = caseById(15), { items, textures, options } = caseRasterInputs(c, 1, 'opaque');
    const f = fakeGl({ maxTexture: 1024 }), b = backendOn(f);
    const plan = planFrame(items, textures, { scale: 1, hd: options.hd });
    expect(b.refusal(plan)).toMatch(/MAX_TEXTURE_SIZE 1024: GM-14b/);
    const p = new GpuUiPresenter(b);
    p.present(items, textures, options);
    expect(p.last!.path).toBe('software');
    expect(diff(p.readFrame()!.data, view.rasterizeUiDrawList(items, textures, options).frame.data)).toBe(0);
  });

  it('dispose deletes the programs, the vertex arrays, the instance buffer and every texture the backend made', () => {
    const f = fakeGl(), b = backendOn(f);
    b.draw(planOf(caseById(11), 1, 'opaque', 'exact'));
    b.draw(planOf(caseById(6), 1, 'opaque', 'ff'));
    b.dispose();
    expect(f.programs.every((p) => p.deleted)).toBe(true);
    expect(f.textures.every((t) => t.deleted)).toBe(true);
    expect(f.names()).toContain('deleteVertexArray');
    expect(f.vaos.every((v) => v.deleted)).toBe(true);
    expect(f.buffers.every((x) => x.deleted)).toBe(true);
    expect(() => b.draw(planOf(caseById(6), 1, 'opaque', 'ff'))).toThrow(/disposed/);
  });

  it('refuses a plan whose quads of a batch come before its copy (a planner invariant the GPU depends on)', () => {
    const plan = planOf(caseById(11), 1, 'opaque', 'exact');
    const broken: UiFramePlan = { ...plan, steps: plan.steps.filter((s) => s.kind !== 'copy') };
    expect(() => backendOn(fakeGl()).draw(broken)).toThrow(/before its copy/);
  });
});
