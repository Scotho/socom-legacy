import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * LATER 76 (a development build's keys, OT.R29; product track): /testroom's round text line yields Enter to the ARMORY
 * only when the match's DEV keys would hand the ARMORY that key -- one predicate, `armoryTakesKeys` (Play mode, past the
 * loading hold, the ARMORY open), asked by both. Before, the line asked `armory.isOpen()` alone, so with the ARMORY open
 * outside Play or under the hold a closed line neither opened on Enter nor handed it on: the key reached no one.
 * A source pin: `main.ts` boots the page on import, so no unit test reaches its listeners.
 */
const main = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/main.ts'), 'utf-8');

describe('LATER 76: the round line and the DEV key path ask one ARMORY predicate', () => {
  it('armoryTakesKeys is Play mode, past the loading hold, with the ARMORY open', () => {
    expect(main).toMatch(/const armoryTakesKeys = \(\): boolean => playOn && !loadingJoin\.blocked && armory\.isOpen\(\);/);
  });

  it('the round text line\'s menu asks it, not the ARMORY\'s open alone', () => {
    const mount = main.split('\n').find((l) => l.startsWith('mountRoundTextLine({'))!;
    expect(mount).toMatch(/menu: \(\) => armoryTakesKeys\(\) \|\| exchange\.isOpen\(\)/);
    expect(mount).not.toMatch(/menu: \(\) => armory\.isOpen\(\)/);
  });

  it('the DEV match keys hand the ARMORY a key by the same predicate', () => {
    expect(main).toMatch(/\n {2}if \(armoryTakesKeys\(\)\) \{[^\n]*\n {4}if \(!e\.repeat\) armory\.key\(e\.code\);/);
  });
});
