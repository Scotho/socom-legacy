import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * MATCH-03's ledger (web research 101, "the round's open 1:1 gaps") kept honest in one mechanical way: every
 * `*_PLACEHOLDER` / `*_READING` name the round's sources hold -- `packages/{viewer,central,match,scene,sound}/src`, the same
 * walk and the same pattern as `placeholderLedger.test.ts` -- is the subject of a row of research 101: the first cell
 * of a table row, either in its ledger of the named stand-ins (a gap, the page's own, or ruled) or in its listed
 * exclusions (a fallback that play never reaches, a buffer's bound, or a name settled since: retired, answered,
 * resolved). A name a source gains after the note was written fails here until the ledger places it. The other six
 * packages are left out on purpose (research 101 §5): `ui`, `card`, `fmv` and `archive` are the front end's packages
 * (and the disc reader's), not the round's; `gs` and `mesh` are the decoders. None holds such a name today.
 */

const root = resolve(import.meta.dirname, '../..');
const NOTE = join(root, 'docs', 'research', '101-the-rounds-open-gaps.md');
const NAME = /\b[A-Z][A-Z0-9_]*_(?:PLACEHOLDER|READING)\b/g;
/** The round's sources: the page, its server (central and match), the scene and the sound. */
const ROUND_PACKAGES = ['viewer', 'central', 'match', 'scene', 'sound'] as const;

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) { if (name !== 'node_modules' && name !== 'dist') out.push(...tsFiles(path)); }
    else if (/\.ts$/.test(name) && !/^zz-/.test(name)) out.push(path);
  }
  return out;
}

/** Every name in the round's sources, with the first file that holds it. */
function roundNames(): Map<string, string> {
  const names = new Map<string, string>();
  for (const pkg of ROUND_PACKAGES) {
    for (const file of tsFiles(join(root, 'packages', pkg, 'src'))) {
      for (const m of readFileSync(file, 'utf8').matchAll(NAME)) if (!names.has(m[0])) names.set(m[0], relative(root, file));
    }
  }
  return names;
}

/** The names that are a row's subject in a markdown text: a table row's first cell. */
export function rowSubjects(markdown: string): Set<string> {
  const out = new Set<string>();
  for (const line of markdown.split(/\r?\n/)) {
    if (!/^\s*\|/.test(line)) continue;
    for (const m of (line.split('|')[1] ?? '').matchAll(NAME)) out.add(m[0]);
  }
  return out;
}

describe('research 101, the round\'s ledger: every named stand-in of the round\'s sources has its row', () => {
  it('takes a name from a table row\'s first cell only', () => {
    const md = ['| `A_READING` | as `B_PLACEHOLDER` |', '`C_READING` in prose', '|---|---|', '| `D_PLACEHOLDER` / `E_READING` | x |'].join('\n');
    expect([...rowSubjects(md)].sort()).toEqual(['A_READING', 'D_PLACEHOLDER', 'E_READING']);
  });

  it('lists every *_PLACEHOLDER / *_READING of viewer, central, match, scene and sound as a row (ledger or exclusion)', () => {
    const code = roundNames();
    expect(code.size).toBeGreaterThan(150);
    const rows = rowSubjects(existsSync(NOTE) ? readFileSync(NOTE, 'utf8') : '');
    const missing = [...code].filter(([name]) => !rows.has(name)).map(([name, file]) => `${name} (${file})`);
    expect(missing, 'named in the round\'s sources, in no row of research 101').toEqual([]);
  });

  it('the other way: a §4 ledger row that names a source file ("in code" not *note only*) has its name in the sources', () => {
    // A name retired from the code but left in the ledger as live (ARMORY_BETWEEN_ROUNDS_READING, 2026-10-02) is stale.
    const md = existsSync(NOTE) ? readFileSync(NOTE, 'utf8') : '';
    const ledger = /^## 4\.[\s\S]*?(?=^## 5\.)/m.exec(md)?.[0] ?? '';
    const code = roundNames();
    const stale: string[] = [];
    for (const line of ledger.split(/\r?\n/)) {
      if (!/^\s*\|/.test(line)) continue;
      const cells = line.split('|');
      const inCode = (cells[3] ?? '').trim();
      if (!inCode || /note only|^-+$|^in code$/.test(inCode)) continue;
      for (const m of (cells[1] ?? '').matchAll(NAME)) if (!code.has(m[0])) stale.push(`${m[0]} (${inCode})`);
    }
    expect(stale, 'a ledger row says it lives in the code, the code no longer holds it').toEqual([]);
  });

  it('every §4 owner heading and §5\'s excluded names give the count of the rows in their table', () => {
    // The sprint-25 integration review (2026-10-04): OC-M3 read 105 over 108 rows, ONL-16 3 over 2, §5 129 over 134 --
    // counts kept by arithmetic, not from the rows. A heading `**<owner>** (<n>...` or `**Excluded names (<n>;...` is
    // followed by its table; its first number is that table's count of rows.
    const md = existsSync(NOTE) ? readFileSync(NOTE, 'utf8') : '';
    const part = /^## 4\.[\s\S]*?(?=^## 6\.)/m.exec(md)?.[0] ?? '';
    const lines = part.split(/\r?\n/);
    const wrong: string[] = [];
    let headings = 0;
    for (let i = 0; i < lines.length; i++) {
      const h = /^\*\*(?:([^*]+)\*\* \((\d+)|(Excluded names) \((\d+);)/.exec(lines[i]!);
      if (!h) continue;
      headings++;
      const name = h[1] ?? h[3]!, said = Number(h[2] ?? h[4]);
      let j = i + 1;
      while (j < lines.length && !/^\s*\|/.test(lines[j]!)) j++;
      let rows = 0;
      for (j += 2; j < lines.length && /^\s*\|/.test(lines[j]!); j++) rows++;    // past the header and its rule
      if (rows !== said) wrong.push(`${name}: says ${said}, has ${rows}`);
    }
    expect(headings).toBeGreaterThan(30);
    expect(wrong, 'a heading\'s count is not its table\'s rows').toEqual([]);
  });

  it('§5 opens its exclusions in the one form the count check reads (HAZARDS: a heading written otherwise was never checked)', () => {
    // HAZARDS (the sprint 20 Log): `(N with ...` in place of `(N; ...` skipped the count silently and it drifted five rows.
    const md = existsSync(NOTE) ? readFileSync(NOTE, 'utf8') : '';
    const five = /^## 5\.[\s\S]*?(?=^## 6\.)/m.exec(md)?.[0] ?? '';
    const opens = five.split(/\r?\n/).filter((l) => /^\*\*Excluded names\b/.test(l));
    expect(opens.length, '§5\'s excluded-names heading').toBe(1);
    expect(opens[0]).toMatch(/^\*\*Excluded names \(\d+;/);
  });
});
