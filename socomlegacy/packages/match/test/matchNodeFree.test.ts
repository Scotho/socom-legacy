import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * LATER 261's build fix (B130's gate): the page bundles `room.ts` (the offline match runs the room in the page,
 * `viewer/src/net/loopback.ts`), so nothing `room.ts` reaches by relative import may import a `node:` module -- Vite fails
 * the build on it ("not exported by __vite-browser-external"). Read here so the next one fails in vitest, not only at
 * the build: `room.ts` and every module its relative imports reach, type-only imports skipped.
 */
const SRC = resolve(__dirname, '../src');

function importsOf(file: string): { rel: string[]; node: string[] } {
  const text = readFileSync(file, 'utf8');
  const rel: string[] = [];
  const node: string[] = [];
  for (const m of text.matchAll(/^\s*(import|export)\s+(type\s+)?[^'";]*?from\s+['"]([^'"]+)['"]/gm)) {
    if (m[2]) continue;                                            // a type-only import is erased
    const spec = m[3]!;
    if (spec.startsWith('node:')) node.push(spec);
    else if (spec.startsWith('.')) rel.push(spec);
  }
  for (const m of text.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) {
    if (m[1]!.startsWith('node:')) node.push(m[1]!);
    else if (m[1]!.startsWith('.')) rel.push(m[1]!);
  }
  return { rel, node };
}

function resolveTs(from: string, spec: string): string | null {
  const base = resolve(dirname(from), spec);
  for (const c of [`${base}.ts`, join(base, 'index.ts'), base]) if (existsSync(c) && c.endsWith('.ts')) return c;
  return null;
}

describe('room.ts and what it reaches import no node: module (the page bundles the room)', () => {
  it('the relative import graph from room.ts holds no node: import', () => {
    const seen = new Set<string>();
    const offenders: string[] = [];
    const queue = [join(SRC, 'room.ts')];
    while (queue.length > 0) {
      const file = queue.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      const { rel, node } = importsOf(file);
      for (const n of node) offenders.push(`${file.slice(SRC.length + 1)} imports ${n}`);
      for (const r of rel) { const next = resolveTs(file, r); if (next) queue.push(next); }
    }
    expect(seen.size).toBeGreaterThan(1);
    expect(offenders).toEqual([]);
  });
});
