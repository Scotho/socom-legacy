import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The package's own run has a test to find (vitest fails a project with none), and the boundary's runtime half:
// the index loads under Node with no DOM. The source half is tools/test/packageBoundaries.test.ts (W6.R2).
describe('@s2u/ui loads headless', () => {
  it('imports under Node, where no DOM exists', async () => {
    expect('document' in globalThis).toBe(false);
    await expect(import('../src/index')).resolves.toBeDefined();
  }, 30_000);   // a cold import of the whole index (clock/, text/ and the rest): 5 s timed out under a loaded host
});

/** The `@s2u/*` packages a module of this package value-imports, followed through its relative imports. */
function reached(entry: string): { packages: Map<string, string[]> } {
  const packages = new Map<string, string[]>();
  const seen = new Set<string>();
  const walk = (file: string): void => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/^\s*(?:import|export)\s+(type\s+)?[^'";]*?from\s+['"]([^'"]+)['"]/gm)) {
      const [, typeOnly, spec] = m;
      if (typeOnly) continue;
      if (spec!.startsWith('.')) {
        const base = resolve(dirname(file), spec!);
        const next = [`${base}.ts`, join(base, 'index.ts')].find((f) => { try { readFileSync(f); return true; } catch { return false; } });
        if (next) walk(next);
      } else if (spec!.startsWith('@s2u/')) packages.set(spec!, [...(packages.get(spec!) ?? []), file]);
    }
  };
  walk(entry);
  return { packages };
}

describe('@s2u/ui\'s index stays light (INT-LOADING review F3)', () => {
  it('loads no @s2u/scene: the loading readers, its one value user, are the deep import @s2u/ui/loading', () => {
    const index = resolve(import.meta.dirname, '../src/index.ts');
    expect([...reached(index).packages.keys()].filter((p) => p.startsWith('@s2u/scene'))).toEqual([]);
    expect(reached(resolve(import.meta.dirname, '../src/loading.ts')).packages.has('@s2u/scene')).toBe(true);
  });
});
