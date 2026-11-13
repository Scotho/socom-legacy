import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The rc1 red of v0.4.20 (2026-11-12): Playwright loads `e2e/**/*.ts` and every module they import STATICALLY in Node,
// not through Vite. One static import added to a `src/` module an e2e harness reaches (uiGpuPresenter.ts -> the client
// error beacon -> console/pageVersion.ts) brought in `import { version } from '../../../../package.json'`, which Node
// refuses without an import attribute ("needs an import attribute of type: json"), and the browser view collected 0
// tests. This walks the static imports reachable from every e2e file (relative ones; `import type` and dynamic
// `import()` are not followed -- Node never loads them at collection) and refuses a JSON import without
// `with { type: 'json' }`. A test aid with no original.

const here = dirname(fileURLToPath(import.meta.url));
const viewer = resolve(here, '..');

function e2eFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) e2eFiles(p, out);
    else if (/\.ts$/.test(name)) out.push(p);
  }
  return out;
}

// A static import or re-export, its specifier, and what follows it on the statement (an attribute clause).
const STATIC = /^\s*(import|export)\s+(?!type\b)([^;'"]*?\s+from\s+)?['"]([^'"]+)['"]\s*(with\s*\{[^}]*\})?/gm;

function resolveTs(from: string, spec: string): string | null {
  const base = resolve(dirname(from), spec);
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
}

/** Every JSON module reached statically from `entries` with no import attribute, as `importer -> specifier`. */
export function bareJsonImports(entries: readonly string[]): string[] {
  const seen = new Set<string>(), bad: string[] = [];
  const todo = [...entries];
  while (todo.length) {
    const file = todo.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(STATIC)) {
      const spec = m[3]!, attr = m[4];
      if (!spec.startsWith('.')) continue;                         // a package: Node's own resolution, not ours
      if (spec.endsWith('.json')) { if (!attr) bad.push(`${file.slice(viewer.length + 1)} -> ${spec}`); continue; }
      const next = resolveTs(file, spec);
      if (next) todo.push(next);
    }
  }
  return bad;
}

describe('the e2e import graph (Node loads it, not Vite)', () => {
  it('no JSON module is imported statically without `with { type: \'json\' }` from anything an e2e file reaches', () => {
    const entries = e2eFiles(join(viewer, 'e2e'));
    expect(entries.length).toBeGreaterThan(100);
    expect(bareJsonImports(entries)).toEqual([]);
  });

  it('the walker finds the rc1 chain: a src module importing the client error beacon statically', () => {
    // console/pageVersion.ts imports package.json bare; any static path to it from an e2e file is refused.
    const page = join(viewer, 'src', 'console', 'pageVersion.ts');
    expect(bareJsonImports([page]).some((l) => l.endsWith('package.json'))).toBe(true);
  });
});
