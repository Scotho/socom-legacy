import { describe, expect, it } from 'vitest';
import { UI_GPU_QUAD_VERTEX_SOURCE, UI_GPU_SHADER_SOURCES } from '../src/uiGpuShaders';
import { UI_GPU_MODEL_VERTEX_SOURCE } from '../src/uiGpuModels';
import { UI_GPU_PRESENT_FRAGMENT_SOURCE, UI_GPU_PRESENT_VERTEX_SOURCE } from '../src/uiGpuWebgl2';
import { UI_GPU_MOVIE_FRAGMENT_SOURCE, UI_GPU_MOVIE_VERTEX_SOURCE } from '../src/uiGpuMovie';

// GM lane, the shadow PC's J2 at 4a2b107d8 (2026-11-09): `model-ff-src` / `model-ff-add` failed to compile on every real
// GPU and on SwiftShader -- "ERROR: 0:62: 's' : redefinition" -- because GM-15d's winding `float s` and T8's texel
// `vec4 s` shared main()'s scope. The fake GL (`uiGpuFakeGl.ts`) runs the programs as JavaScript and never compiles the
// GLSL, so no unit test saw it. This is a source lint, not a compiler: GLSL ES 3.00 (section 4.2.2) forbids declaring
// a name twice in one scope, and a function's parameters share its body's outermost scope; every program's every
// function is checked for a name declared twice at its body's top level (parameters included). Nested blocks are
// separate scopes in GLSL and are not checked here.

const BUILTIN = 'float|int|uint|bool|[iub]?vec[234]|mat[234](?:x[234])?';
/** A declaration's type at a statement's start: a built-in, or a struct the source declares (review F1: quad-prog's `X`). */
const typeOf = (structs: readonly string[]): RegExp =>
  new RegExp(`^(?:highp\\s+|mediump\\s+|lowp\\s+|const\\s+)*(?:${[BUILTIN, ...structs].join('|')})(?:\\[\\d*\\])?\\s+`);

/** Each function of `src`: its name, its parameter names and the names its body declares at its top level. */
function functions(raw: string): { name: string; params: string[]; top: string[] }[] {
  // Comments first: the programs' comments carry ';' ("-- M2; UI_MODEL_EDGE_RULE_READING"), which would cut statements.
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  const TYPE = typeOf([...src.matchAll(/\bstruct\s+([A-Za-z_]\w*)/g)].map((m) => m[1]!));
  const out: { name: string; params: string[]; top: string[] }[] = [];
  const head = /\b[A-Za-z_]\w*\s+([A-Za-z_]\w*)\s*\(([^()]*)\)\s*\{/g;
  for (let m = head.exec(src); m; m = head.exec(src)) {
    let depth = 1, i = head.lastIndex, stmt = '';
    const top: string[] = [];
    for (; i < src.length && depth > 0; i++) {
      const c = src[i]!;
      if (c === '{') { depth++; stmt = ''; continue; }
      if (c === '}') { depth--; stmt = ''; continue; }
      if (depth !== 1) continue;
      if (c === ';') {
        const s = stmt.replace(/\/\/[^\n]*/g, '').trim();
        const t = TYPE.exec(s);
        if (t && !/^return\b/.test(s)) {
          let paren = 0, part = '';
          for (const ch of s.slice(t[0].length) + ',') {
            if (ch === '(' || ch === '[') paren++;
            if (ch === ')' || ch === ']') paren--;
            if (ch === ',' && paren === 0) { const n = /^\s*([A-Za-z_]\w*)/.exec(part); if (n) top.push(n[1]!); part = ''; } else part += ch;
          }
        }
        stmt = '';
        continue;
      }
      stmt += c;
    }
    const params = m[2]!.split(',').map((p) => /([A-Za-z_]\w*)\s*$/.exec(p.trim())?.[1]).filter((p): p is string => !!p && p !== 'void');
    out.push({ name: m[1]!, params, top });
    head.lastIndex = i;
  }
  return out;
}

const SOURCES: Record<string, string> = {
  ...UI_GPU_SHADER_SOURCES,
  'quad vertex': UI_GPU_QUAD_VERTEX_SOURCE,
  'model vertex': UI_GPU_MODEL_VERTEX_SOURCE,
  'present vertex': UI_GPU_PRESENT_VERTEX_SOURCE,
  'present fragment': UI_GPU_PRESENT_FRAGMENT_SOURCE,
  'movie vertex': UI_GPU_MOVIE_VERTEX_SOURCE,
  'movie fragment': UI_GPU_MOVIE_FRAGMENT_SOURCE,
};

describe('the GPU drawer\'s GLSL: no name declared twice in one function\'s top scope (GLSL ES 3.00 4.2.2)', () => {
  it('the lint sees a redefinition (its own check)', () => {
    const f = functions('void main() {\n  float s = 1.0;\n  if (true) { float q = 2.0; }\n  vec4 s = vec4(0.0);\n}\n');
    expect(f).toHaveLength(1);
    expect(f[0]!.top).toEqual(['s', 's']);
  });
  it('the lint sees through a comment carrying a semicolon (the shape that hid the real redefinition)', () => {
    const f = functions('void main() {\n  // T3: a step -- M2; A_READING\n  float s = 1.0;\n  // T8: another -- M5; B_READING\n  vec4 s = vec4(0.0);\n}\n');
    expect(f[0]!.top).toEqual(['s', 's']);
  });
  it('the lint sees a struct-typed local beside a float of the same name (review F1)', () => {
    const f = functions('struct X { float v; int c; };\nvoid main() {\n  X r = X(0.0, 0);\n  float r = 1.0;\n}\n');
    expect(f.find((g) => g.name === 'main')!.top).toEqual(['r', 'r']);
  });
  it('the lint reads comma declarations and parameters', () => {
    const f = functions('float g(float a, int b) {\n  float c = a, d = float(b);\n  return c + d;\n}\n');
    expect(f[0]!.params).toEqual(['a', 'b']);
    expect(f[0]!.top).toEqual(['c', 'd']);
  });
  for (const [name, src] of Object.entries(SOURCES)) {
    it(`${name}: every function's names are declared once`, () => {
      const fns = functions(src);
      expect(fns.length, `${name}: functions found`).toBeGreaterThan(0);
      for (const f of fns) {
        const seen = new Map<string, number>();
        for (const n of [...f.params, ...f.top]) seen.set(n, (seen.get(n) ?? 0) + 1);
        const twice = [...seen].filter(([, k]) => k > 1).map(([n]) => n);
        expect(twice, `${name} ${f.name}(): declared twice`).toEqual([]);
      }
    });
  }
});
