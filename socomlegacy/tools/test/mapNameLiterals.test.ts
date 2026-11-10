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

  it('a map\'s name as a literal is refused outside the table, but for the listed files at their count', () => {
    const roots = readdirSync(join(WEB, 'packages')).map((p) => join(WEB, 'packages', p, 'src')).filter((d) => { try { return statSync(d).isDirectory(); } catch { return false; } });
    // deploy/ when the tree has it: the public export carries none (its manifest excludes socomlegacy/deploy/**)
    if (existsSync(join(WEB, 'deploy'))) roots.push(join(WEB, 'deploy'));
    const found: Record<string, number> = {};
    for (const root of roots) {
      for (const file of sources(root)) {
        const rel = relative(WEB, file).replace(/\\/g, '/');
        if (rel === HOME) continue;
        const n = code(readFileSync(file, 'utf8')).match(LITERAL)?.length ?? 0;
        if (n > 0) found[rel] = n;
      }
    }
    expect(found).toEqual(Object.fromEntries(Object.entries(ALLOWED).map(([k, v]) => [k, v.count])));
  });
});
