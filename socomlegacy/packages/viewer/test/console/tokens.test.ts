import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The console's token guard (CX.R4: the design's token names are the system's `--s2u-*` names; CX.R7: part G's guards,
 * "every token declared", carried to the page). Every `var(--…)` the console page uses -- in its sheet
 * (`src/console/console.css`) or in the markup and inline styles its renderers write (`src/console/**`) -- names a custom
 * property some sheet declares: the design system's (`shared/ds/*.css`) or the page's own. A name declared nowhere
 * resolves to nothing and the property falls back silently (the review of CX-16/17, 2026-10-12: the crossbar's
 * `var(--cx-cat-pitch)` kept the track from ever moving; `render/rooms.ts` wrote `var(--font-mono)`, the export's name for
 * the system's `--s2u-font-mono`). A browser adaptation with no original (OT.R28).
 */
const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../src/console');
const DS = resolve(here, '../../../../../shared/ds');
const bare = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

function files(dir: string, ext: RegExp): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? files(p, ext) : ext.test(e.name) ? [p] : [];
  });
}

const sheets = [...files(DS, /\.css$/), join(ROOT, 'console.css')];
const declared = new Set(sheets.flatMap((f) => [...bare(readFileSync(f, 'utf-8')).matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]!)));

/** Each use, `file:line name`. */
function uses(): string[] {
  const out: string[] = [];
  for (const f of files(ROOT, /\.(ts|css)$/)) {
    const raw = readFileSync(f, 'utf-8');
    const text = f.endsWith('.css') ? raw.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')) : raw;
    text.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/var\(\s*(--[\w-]+)/g)) out.push(`${relative(ROOT, f).replace(/\\/g, '/')}:${i + 1} ${m[1]}`);
    });
  }
  return out;
}

describe('the console page: every var(--…) it uses is declared', () => {
  it('the sheets are read: the system\'s tokens and the page\'s', () => {
    expect(sheets.length).toBeGreaterThan(2);
    for (const t of ['--s2u-font-mono', '--s2u-cx-cat-pitch', '--s2u-focus-w']) expect(declared.has(t), t).toBe(true);
    expect(uses().length).toBeGreaterThan(10);
  });

  it('no use names a property declared nowhere in shared/ds/*.css or console.css', () => {
    expect(uses().filter((u) => !declared.has(u.split(' ')[1]!))).toEqual([]);
  });
});
