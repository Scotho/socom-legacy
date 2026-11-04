// A fire-and-forget dynamic import needs a rejection handler: a navigation aborts the fetch, and WebKit surfaces the
// rejected `import()` as a pageerror ("Importing a module script failed.", e2e/startup.spec.ts, ios-layout).
// Browser adaptation (no original). Scope: `void import(...)` statements and the front end's overlay chain.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..', 'src');
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : []; });
}
/** The text of the call chain starting at `import(` (balanced parentheses, continued through `.name(...)` links). */
function chainAt(s: string, at: number): string {
  let i = at;
  for (;;) {
    while (s[i] !== '(') i++;
    let d = 0;
    do { if (s[i] === '(') d++; else if (s[i] === ')') d--; i++; } while (d > 0);
    const m = /^\s*\.\s*(then|catch|finally)\b\s*(?=\()/.exec(s.slice(i));
    if (!m) return s.slice(at, i);
    i += m[0].length;
  }
}
/** Sites: `void import(` anywhere, and the front end's `? import('./modern/overlay')` (held in a variable). */
function sites(): { file: string; chain: string }[] {
  const out: { file: string; chain: string }[] = [];
  for (const file of files(SRC)) {
    const s = readFileSync(file, 'utf8');
    for (const m of s.matchAll(/(?:void\s+|\?\s*)import\(\s*'/g)) out.push({ file: file.slice(SRC.length + 1), chain: chainAt(s, m.index! + m[0].indexOf('import')) });
  }
  return out;
}

describe('fire-and-forget dynamic imports', () => {
  // MU2-10: the overlay's two development mounts (main.ts, frontEnd.ts) went; its one seam is pageEntry.ts's awaited loader.
  it('finds the known sites', () => { expect(sites().length).toBeGreaterThanOrEqual(3); });
  it('every one carries a rejection handler', () => {
    const bare = sites().filter((x) => !/\.catch\s*\(/.test(x.chain)).map((x) => `${x.file}: ${x.chain.slice(0, 60)}`);
    expect(bare).toEqual([]);
  });
});

describe('the page entry', () => {
  // The boot awaits the page's chunk (`./main` at the test room, `./startup` and the launcher otherwise): a navigation
  // that aborts that import rejects bootPage, and WebKit reports the unhandled rejection as a pageerror.
  it('handles a rejected boot', () => {
    const s = readFileSync(join(SRC, 'entry.ts'), 'utf8');
    const at = s.indexOf('bootPage(location');
    expect(at).toBeGreaterThan(-1);
    expect(chainAt(s, at)).toMatch(/\.catch\s*\(/);
  });
});
