// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The RV2 batch review's F9 (a browser test's instrument; no game value): Playwright's loader runs a spec's static
 * imports in Node, without Vite, so a stylesheet (`import './x.css'`) or a Vite query (`?url`, `?raw`) anywhere in what
 * a spec imports at run time stops the whole file loading -- `replayViewer.spec.ts` loaded 0 tests on f9's box when it
 * read `HELD_STATUS` from `src/modern/replays/transport.ts`, which imports `src/console/replay-transport.css`. Every
 * spec and helper under `e2e/` is walked through its static, non-type imports (relative ones; a package's are its own),
 * and none may reach such a module. `import type` and `export type` are erased and not followed.
 */

const here = dirname(fileURLToPath(import.meta.url));
const E2E = resolve(here, '../e2e');

/** A source with its comments taken out: what runs. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

/** The static runtime specifiers of a module: `import ... from`, `export ... from`, a bare `import '...'`; types skipped. */
export function runtimeSpecifiers(text: string): string[] {
  const src = code(text);
  const out: string[] = [];
  for (const m of src.matchAll(/(?:^|[\n;])\s*(import|export)\s+(type\s+)?([^'";]*?)\s*from\s*['"]([^'"]+)['"]/g)) {
    if (m[2]) continue;                                       // `import type` / `export type`: erased
    out.push(m[4]!);
  }
  for (const m of src.matchAll(/(?:^|[\n;])\s*import\s*['"]([^'"]+)['"]/g)) out.push(m[1]!);
  return out;
}

/** A relative specifier resolved to its file, as TypeScript's bundler resolution would (`.ts`, `.tsx`, `/index.ts`, `.js` for `.ts`). */
function resolveFile(from: string, spec: string): string | null {
  const base = resolve(dirname(from), spec);
  for (const f of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), base.replace(/\.js$/, '.ts')]) if (existsSync(f) && statSync(f).isFile()) return f;
  return null;
}

/** What Node cannot load without Vite: a stylesheet, an asset, a query. */
const VITE_ONLY = /\.(css|scss|svg|png|jpe?g|gif|webp|wasm)$|\?/i;

/** Every chain from `entry` that reaches a Vite-only module: `[entry, ..., the importer, the specifier]`. */
export function viteOnlyChains(entry: string): string[][] {
  const chains: string[][] = [];
  const seen = new Set<string>();
  const walk = (file: string, path: string[]): void => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const spec of runtimeSpecifiers(readFileSync(file, 'utf8'))) {
      if (!spec.startsWith('.')) continue;
      if (VITE_ONLY.test(spec)) { chains.push([...path, spec]); continue; }
      const next = resolveFile(file, spec);
      if (next) walk(next, [...path, next]);
    }
  };
  walk(entry, [entry]);
  return chains;
}

describe('the e2e loads without Vite: no spec imports a stylesheet at run time (RV2 batch review F9)', () => {
  it('reads the runtime specifiers, types skipped', () => {
    expect(runtimeSpecifiers([
      "import type { A } from './a';",
      "import type {} from './hook';",
      "import { b, type C } from './b';",
      "import './side.css';",
      "export { d } from './d';",
      'export type { E } from "./e";',
      "// import { f } from './f';",
      'import {\n  g,\n  h,\n} from "./gh";',
    ].join('\n'))).toEqual(['./b', './d', './gh', './side.css']);
  });

  it('no file under e2e/ reaches a stylesheet, an asset or a Vite query through its runtime imports', () => {
    const files = readdirSync(E2E).filter((f) => f.endsWith('.ts')).map((f) => join(E2E, f));
    expect(files.length).toBeGreaterThan(20);
    const found = files.flatMap((f) => viteOnlyChains(f).map((c) => c.map((p) => p.replace(/\\/g, '/').replace(/^.*\/packages\//, '')).join(' -> ')));
    expect(found).toEqual([]);
  });
});
