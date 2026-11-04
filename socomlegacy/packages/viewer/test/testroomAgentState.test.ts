import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Browser adaptation guard (the agent instruments): the host-state builders the agent targets read every rendered
 * frame -- with or without an agent connected -- must only READ the page. A press reached them once
 * (`traversal.action()` presses Action, and respawn while that input is active): the solo room's state read fired the
 * context action on every frame of every /testroom page, and the Forge Play port's on every frame of every private
 * Forge Play match. Both builders are inline, so this pins their source.
 */
const main = readFileSync(resolve(__dirname, '../src/main.ts'), 'utf8');
const mount = readFileSync(resolve(__dirname, '../src/matchMount.ts'), 'utf8');
const between = (text: string, from: string, to: string): string => {
  const start = text.indexOf(from);
  const end = text.indexOf(to, start);
  return start >= 0 && end > start ? text.slice(start, end) : '';
};
const builders = [
  { name: 'the solo room (main.ts)', block: between(main, 'soloAgent = createSoloTestroomTarget({', 'maps: () => mapList'), opening: 'state: () => {' },
  // LATER 426: the gate each frame and the rest behind `read()`
  { name: 'the Forge Play port (matchMount.ts)', block: between(mount, 'const gateFlags = normalInput && {', '}) : noInput();'), opening: 'local:' },
];
const forbidden = [/\.action\(\)/, /pressRespawn/, /\btrigger\(/, /\.press\(/, /\.fire\(/, /cancelAction\(/];

describe.each(builders)('the agent host state of $name is read-only', ({ block, opening }) => {
  it('finds the state builder', () => {
    expect(block).toContain(opening);
  });
  it('calls no press, trigger or action in the state builder', () => {
    for (const pattern of forbidden) expect(block, String(pattern)).not.toMatch(pattern);
  });
  it('reads the traversal through its stats accessor', () => {
    expect(block).toMatch(/traversal:\s*traversal\.stats\(\)/);
  });
});

describe('LATER 426: the Forge Play port reads its heavy state only behind read()', () => {
  const block = between(mount, 'const gateFlags = normalInput && {', '}) : noInput();');
  it('every heavy reader sits inside read(), none in the per-frame gate', () => {
    const lazy = block.indexOf('read: () =>');
    expect(lazy).toBeGreaterThan(0);
    for (const call of ['firearm.kit.state()', 'firearm.fire.state()', 'loadouts.loadout()', 'armoryPart.state()', 'traversal.stats()', 'acts.bomb.state()', 'fly.pose()']) {
      const at = block.indexOf(call);
      expect(at, call).toBeGreaterThan(lazy);
    }
  });
});
