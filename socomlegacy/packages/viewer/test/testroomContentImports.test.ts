import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * FP-6 item 5 (FP.R13: "the test room walks a custom map -- no rules, NPCs or objectives: a test instrument; Forge Play's
 * machinery is not ported"): the room's content path (`../src/testroomContent.ts`, the module FP-6 item 5 adds and
 * `../src/main.ts` `loadContent` / `openCustom` call) imports no rules, NPC or objectives module and none of Forge Play's
 * own -- read off its import list, every static `import ... from` and every dynamic `import(...)`. What it holds is
 * the module's own imports; rules are parsed by the saves reader and dropped: `./forge/saves` `readSaveList` runs
 * `readRulesDraft` / `checkForgeRules` on every save it reads, so that code is in the room's chunk and runs, and the room
 * keeps only each save's record (`customPlan` reads `record`, never `rules`). A product-track pin: nothing of the game is
 * asserted here.
 */

const SOURCE = readFileSync(new URL('../src/testroomContent.ts', import.meta.url), 'utf-8');

/** Every module specifier the source names: static imports and re-exports, and dynamic imports. */
function importSpecifiers(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]/gms)) out.push(m[1]!);
  for (const m of text.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) out.push(m[1]!);
  for (const m of text.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1]!);
  return out;
}

/** What the content path must not reach for: the rules, the NPCs, the objectives, the zombies, Forge Play's composition. */
const FORBIDDEN: readonly (readonly [string, RegExp])[] = [
  ['the Forge rules (forge/rules*)', /(^|\/)forge\/rules[^/]*$/],
  ['the Forge NPCs (forge/npc*)', /(^|\/)forge\/npc[^/]*$/],
  ['the placed objectives (playObjectives)', /playObjectives/],
  ['the zombies (zombies/)', /(^|\/)zombies(\/|$)/],
  ["Play's whole chain (forge/composeLayout: its objects step runs playObjectives)", /(^|\/)forge\/composeLayout$/],
  ["Forge Play's match (forge/match, forge/matchRules, forge/matchState)", /(^|\/)forge\/match(Rules|State)?$/],
  ['the Forge page (forge/page)', /(^|\/)forge\/page$/],
];

describe('FP-6 item 5: the test room\'s content path imports no rules, NPCs or objectives', () => {
  it('reads the module\'s imports (the control: the reader finds the ones the path is built on)', () => {
    const names = importSpecifiers(SOURCE);
    expect(names).toContain('./packs/content/map');
    expect(names).toContain('./forge/matchMap');
    expect(names).toContain('./modelPackRuntime');            // the dynamic import of the props' GLB reader
  });

  it('says exactly what it holds: the module\'s own imports; the saves reader parses the rules and drops them (review N2)', () => {
    const header = readFileSync(new URL('./testroomContentImports.test.ts', import.meta.url), 'utf-8');
    expect(header).toContain('the module\'s own imports; rules are parsed by the saves reader and dropped');
    expect(importSpecifiers(SOURCE)).toContain('./forge/saves');   // the one route by which rules code is in the chunk
  });

  it('names none of the forbidden modules', () => {
    const names = importSpecifiers(SOURCE);
    for (const [what, re] of FORBIDDEN) expect(names.filter((n) => re.test(n)), what).toEqual([]);
  });

  it('the patterns catch what they name (the control: a forbidden import would be refused)', () => {
    const fake = "import { x } from './forge/rulesAuthoring';\nimport { y } from './forge/npcBrain';\nimport { playObjectives } from './forge/playObjectives';\n"
      + "import { z } from './zombies/round';\nimport { c } from './forge/composeLayout';\nconst m = await import('./forge/match');\n";
    const names = importSpecifiers(fake);
    for (const [what, re] of FORBIDDEN.slice(0, 6)) expect(names.some((n) => re.test(n)), what).toBe(true);
    expect(names.some((n) => /(^|\/)forge\/match(Rules|State)?$/.test(n))).toBe(true);
    expect(/(^|\/)forge\/match(Rules|State)?$/.test('./forge/matchMap')).toBe(false);   // the piece compose stays allowed
  });
});
