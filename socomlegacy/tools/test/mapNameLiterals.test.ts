import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAP_TABLE } from '../../packages/archive/src/mapNames';

/**
 * MN-1 (OT.R113): one map-name table. A map's name written as a string literal in a source file outside
 * `packages/archive/src/mapNames.ts` is a second copy of the table -- the three hand copies MN-1 folded
 * (`viewer/src/launchSettings/maps.ts` DISC_MAPS, `central/src/lobbyCard.ts` MAP_NAMES, `viewer/src/mapOrder.ts`
 * MAP_POPULARITY) -- and is refused. The literals the scan finds today that are not a name table are listed with their
 * count, each with why; a new one fails, and so does a listed file whose count grows. Comments are not scanned. Product
 * track (a convention, no behaviour).
 *
 * DAY-1 (`docs/plans/2026-11-23-day-mode.md`, DAY.R2): a variant's name -- a quoted string holding `(DAY)` or `(NIGHT)`,
 * in the disc's caps or the launcher's case -- is `mapNames.ts`'s `variantName` / `variantTitle`, built from the one
 * `MAP_VARIANTS` table; a literal of one anywhere else is a second copy and is refused, with no allowance. The word in
 * the brackets is matched in any case (`(DAY)`, `(Day)`, `(day)`; the same for night). This variant scan also walks
 * the `tools/` tree's sources (DAY-FIX1: `tools/variants/**` among them), bar `tools/test/` itself, whose tests hold
 * sample strings; the map-name scan above keeps its roots. Both scans see single-line quoted literals only: a name
 * built by concatenation or spread over a multi-line template is not caught.
 */
const WEB = resolve(import.meta.dirname, '../..');
const HOME = 'packages/archive/src/mapNames.ts';

const ALLOWED: Readonly<Record<string, { count: number; why: string }>> = {
  'packages/scene/src/spawns.ts': { count: 11, why: 'spawn points keyed by the disc\'s own description (the map\'s mission.rdr read at load), simulation data, not a display name' },
  'packages/viewer/src/console/sampleAdapters.ts': { count: 7, why: 'the prototype\'s sample rooms and its backdrop picture\'s label (SAMPLE DATA), never live' },
  'packages/viewer/src/console/adapters/options.ts': { count: 2, why: 'the launcher\'s backdrop picture is called Crossroads (a picture\'s label, not a map named)' },
};

const words = [...new Set(MAP_TABLE.flatMap((r) => [r.name, r.title]).concat(['Fox Hunt']))];
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const LITERAL = new RegExp(`(['"\`])(?:${words.map(esc).join('|')})\\1`, 'g');
/**
 * A one-line quoted string holding a variant's word in brackets, in any case: `'ABANDONED (DAY)'`, a template
 * `${name} (Night)`, `'x (day)'`.
 */
const VARIANT_LITERAL = /(['"`])(?:(?!\1)[^\n])*\((?:day|night)\)(?:(?!\1)[^\n])*\1/gi;

/** Drops block comments, then whole-line and trailing `//` comments (a URL's `//` inside a string is kept by the `:` test). */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|[^:'"`])\/\/.*$/, '$1')).join('\n');
}

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(p);
  }
  return out;
}

describe('MN-1: no map-name table outside mapNames.ts', () => {
  it('the scan knows the 25 rows\' names and titles', () => {
    expect(words.length).toBeGreaterThanOrEqual(25);
    expect('"FROSTFIRE"'.match(LITERAL)).toHaveLength(1);
    expect(code("x = 'CROSSROADS'; // 'FROSTFIRE'\n/* 'SUJO' */").match(LITERAL)).toEqual(["'CROSSROADS'"]);
  });

  it('the scan knows a variant\'s bracketed word in either case, inside any quoted string', () => {
    expect(code("a = 'ABANDONED (DAY)'; b = `${n} (Night)`; c = \"x (NIGHT) y\"; // 'SUJO (DAY)'").match(VARIANT_LITERAL))
      .toEqual(["'ABANDONED (DAY)'", '`${n} (Night)`', '"x (NIGHT) y"']);
    expect("a = 'x (day)'; b = \"y (night)\"; c = `z (Day)`; d = 'w (nIgHt)'".match(VARIANT_LITERAL))
      .toEqual(["'x (day)'", '"y (night)"', '`z (Day)`', "'w (nIgHt)'"]);
    expect("'DAY' + 'daylight (dawn)'".match(VARIANT_LITERAL)).toBeNull();
  });

  it('a map\'s name as a literal is refused outside the table, but for the listed files at their count', () => {
    const roots = readdirSync(join(WEB, 'packages')).map((p) => join(WEB, 'packages', p, 'src')).filter((d) => { try { return statSync(d).isDirectory(); } catch { return false; } });
    // deploy/ when the tree has it: the public export carries none (its manifest excludes socomlegacy/deploy/**)
    if (existsSync(join(WEB, 'deploy'))) roots.push(join(WEB, 'deploy'));
    // DAY-FIX1: the tools/ tree's sources for the variant scan only, bar tools/test/ (its tests hold sample strings)
    const rel = (file: string): string => relative(WEB, file).replace(/\\/g, '/');
    const toolsOnly = sources(join(WEB, 'tools')).filter((f) => !rel(f).startsWith('tools/test/'));
    const found: Record<string, number> = {};
    const variants: Record<string, string[]> = {};
    for (const root of roots) {
      for (const file of sources(root)) {
        const at = rel(file);
        if (at === HOME) continue;
        const text = code(readFileSync(file, 'utf8'));
        const n = text.match(LITERAL)?.length ?? 0;
        if (n > 0) found[at] = n;
        const v = text.match(VARIANT_LITERAL);
        if (v) variants[at] = v;
      }
    }
    for (const file of toolsOnly) {
      const v = code(readFileSync(file, 'utf8')).match(VARIANT_LITERAL);
      if (v) variants[rel(file)] = v;
    }
    expect(found).toEqual(Object.fromEntries(Object.entries(ALLOWED).map(([k, v]) => [k, v.count])));
    // DAY-1: a variant's name only through variantName / variantTitle (DAY.R2), never a literal
    expect(variants).toEqual({});
  });
});
