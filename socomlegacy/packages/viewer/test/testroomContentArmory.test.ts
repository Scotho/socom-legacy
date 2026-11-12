// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { mountArmory } from '../src/matchArmory';
import { contentLaneAnswers } from '../src/testroomContent';

/**
 * FP-6 item 5, PR #756's third-pass P2 (1) (product track, a test instrument): an authored map with no disc library, in
 * Play mode with the solo match and the ARMORY on. `show` seats the ARMORY (`./matchArmory` `seat`), which waits for its
 * data; the no-library answer (`contentLaneAnswers` 'none') must hand the ARMORY its empty data through the page's own
 * hand-off (`../src/main.ts` `armoryData(null)`), as well as mark the lane, so the waiting seat is released
 * (`openOrDone`) and the solo match starts (`soloAfterArmory`, the part's `done`). Before, the lane alone was marked: the
 * loading screen let go and the match never started. Here main.ts's own line runs against the real ARMORY part, its
 * deps faked.
 */

const MAIN = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/main.ts'), 'utf-8');

describe('PR #756 P2 (1): no library in Play mode releases the waiting ARMORY seat and starts the solo match', () => {
  it('the no-library answer hands armoryData(null), and the seat waiting on data reaches the solo start', () => {
    const log: string[] = [];
    const part = mountArmory({
      net: () => null, map: () => ({ path: 'content/x', archive: 'x', name: 'Yard' }) as never, side: () => 'seal',
      loadouts: { type: () => 0, pending: () => null, base: () => null } as never, answer: () => undefined,
      playing: () => true, online: () => false, audio: { play: () => true, restart: () => true }, device: () => 'pad',
      done: () => { log.push('solo match starts'); },
    });
    part.seat();                                             // show's seat: no data yet, so it waits
    expect(log).toEqual([]);
    const line = MAIN.match(/^\s*(else \{ loadedSound = a\.loadedSound;[^\n]*\})$/m)?.[1];
    expect(line).toBeDefined();
    const counters = { sound: -1, effects: -1, armory: -1 };
    const run = new Function('a', 'armoryData', 'counters', `let loadedSound, loadedEffects, loadedArmory; if (false) {} ${line!}; counters.sound = loadedSound; counters.effects = loadedEffects; counters.armory = loadedArmory;`);
    run(contentLaneAnswers(4, null), (d: unknown) => { log.push(`armoryData ${String(d)}`); part.setData(d as null); }, counters);
    expect(counters).toEqual({ sound: 4, effects: 4, armory: 4 });   // the lanes answered for the load, as before
    expect(log).toEqual(['armoryData null', 'solo match starts']);  // the empty data handed on, the seat released
    expect(part.isOpen()).toBe(false);
  });
});
