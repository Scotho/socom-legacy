import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * FG-51 (PR #351's finish; the merge controller's rulings, 2026-10-22), held on the page's source as
 * `multiSelectLocks.test.ts` holds its locks, since `page.ts` mounts no unit. A browser adaptation (the forge); the rule
 * the page reads is `./objectives`' (`forgeTypeUnplayable`), whose behaviour `objectives.test.ts` holds.
 * - One rule for the room and the editor: the Play gate and the type picker ask `forgeTypeUnplayable`, nothing of their own.
 * - L1: "Map's own" writes no game type (no `inheritedType`, no fallback 5).
 * - A layout opened naming a type that cannot play keeps it (ruling 4b), shown as unplayable.
 * - The locked bomb marker (the merge controller's design call): saved with its lock; a new marker of the same kind
 *   beside a locked one is refused with a status line, before anything is removed.
 */
const page = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../src/forge/page.ts'), 'utf8');

/** The source of the arrow function `const <name> = ...` up to the next line at its own indent that closes it. */
function body(name: string): string {
  const at = page.indexOf(`const ${name} = `);
  expect(at, name).toBeGreaterThan(-1);
  const end = page.indexOf('\n  };', at);
  expect(end, name).toBeGreaterThan(at);
  return page.slice(at, end);
}

/** placeAll delegates to the shared staging path; inspect the actual loader without dropping that connection. */
function layoutLoader(): string {
  expect(body('placeAll')).toMatch(/const prepared = await prepareLayout\(l\);\s+try \{ prepared\.commit\(\); return prepared\.missing; \} finally \{ prepared\.dispose\(\); \}/);
  return body('prepareLayout');
}

describe('FG-51: the page reads the room\'s rule, keeps the author\'s type, and holds a locked marker', () => {
  it('the Play gate and the type picker both ask forgeTypeUnplayable; the page keeps no rule of its own', () => {
    // The Play gate's staging delegates to `./composeLayout` (FP-1b: the page's pure chain moved there), which runs
    // `./playObjectives`, which asks the same rule.
    expect(body('composeForMatch')).toMatch(/composeLayoutObjects\(/);
    const chain = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../src/forge/composeLayout.ts'), 'utf8');
    expect(chain).toMatch(/playObjectives\(/);
    const staged = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../src/forge/playObjectives.ts'), 'utf8');
    expect(staged).toMatch(/forgeTypeUnplayable\(/);
    expect(body('typeUnplayable')).toMatch(/forgeTypeUnplayable\(/);
    expect(body('refreshGameTypes')).toMatch(/typeUnplayable\(/);
    expect(page).not.toMatch(/forgeTypePlayable\(/);
    expect(page).not.toMatch(/hostageCount/);
    expect(page).not.toMatch(/Escort and Extraction need the base/);
  });

  // OT.R112 (the Forge's UI is its contributor's): his type picker has no "Map's own" row -- the type shown is the one
  // written, the base map's own (`ownTypeOf`) when none was picked; only while the disc's mission list is still read
  // (`typePending`) is none written. No fallback 5 and no `inheritedType` still.
  it('L1, as the contributor changed it: the type shown is written, none only while the base\'s own is still being read', () => {
    expect(page).not.toMatch(/inheritedType/);
    expect(page).not.toMatch(/authoredType \?\? [^;]*\?\? 5/);
    expect(body('layoutNow')).toMatch(/layoutObjectivesOf\(typePending \? null : authoredType, /);
  });

  it('ruling 4b: a layout opened naming a type it cannot play keeps that type; one naming none takes its base\'s own', () => {
    expect(layoutLoader()).toMatch(/authoredType = l\.objectives\?\.gameType \?\? ownTypeOf\(l\.base\);\s+typePending = authoredType === null;/);
    expect(layoutLoader()).not.toMatch(/authoredType = null/);
  });

  it('the locked bomb marker: saved and read back through ./bombMarkers (its behaviour: bombMarkers.test.ts), never removed by a new one', () => {
    // The two steps are the pure module's, so the behaviour test holds them; here only that the page calls them.
    const save = body('bombOfMarkers');
    expect(save).toMatch(/bombOfMarkerStates\(/);
    expect(save).toMatch(/locked: r\.userData\['forgeLock'\] === true/);
    expect(body('layoutNow')).toMatch(/layoutObjectivesOf\(/);
    const load = layoutLoader();
    expect(load).toMatch(/markersOfBomb\(/);
    expect(load).toMatch(/bombRest = bombRestOf\(/);
    expect(load).toMatch(/if \(m\.locked\) r\.userData\['forgeLock'\] = true;/);
    const act = body('act');
    const refuse = act.indexOf("if (prevs.some(lockedOf)) { notifier.refused(`the locked ${kind === 'start' ? 'start' : 'site'} stays: unlock it first`); return; }");
    const removal = act.indexOf('for (const p of prevs) removeRoot(p);');
    expect(refuse).toBeGreaterThan(-1);
    expect(removal).toBeGreaterThan(refuse);
    // One edit, so one undo step, for the whole replacement (the forge seat's word; bombUndo.test.ts holds the step).
    const branch = act.slice(act.lastIndexOf('const before = selectionIds();', removal), act.indexOf('return;', removal));
    expect(branch.match(/\bedit\(/g)).toEqual(['edit(']);
    expect(branch).toMatch(/edit\(before\);/);
  });
});
