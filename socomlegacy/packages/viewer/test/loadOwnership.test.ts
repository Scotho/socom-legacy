import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { joinVerdict, pageLanes, type PageFacts } from '../src/loadingJoin';
import { LaneRequest, markWarmed, ownedStale, sceneViewFor } from '../src/loadOwnership';

const main = readFileSync(resolve(__dirname, '../src/main.ts'), 'utf8');

// LATER 440 (simulation track with a product half: browser bookkeeping, no value, timing or rule of the game). `main.ts`
// cannot be mounted in isolation; the helpers it now calls are tested here, and their wiring is read in its source.
describe('LATER 440: a superseded map load\'s late replies answer for their own load only', () => {
  it('a lane reply answers for the load it was asked for, never the load wanted when it lands', () => {
    const sound = new LaneRequest();
    expect(sound.answers(7)).toBeNull();                 // nothing asked yet
    sound.ask(7, 3);                                     // map load 3 shown: its sound asked as request 7
    // Load 9 is asked (a new `wantedMap`); load 3's sound reply lands before load 9's map replaces the request.
    expect(sound.answers(7)).toBe(3);                    // load 3's, not 9's
    sound.ask(11, 9);                                    // load 9 shown: its own sound asked
    expect(sound.answers(7)).toBeNull();                 // load 3's late reply is dropped
    expect(sound.answers(11)).toBe(9);
  });

  it('the old load\'s answers never complete the new load\'s lanes, and its warmed scene is not the new load\'s', () => {
    const oldView = {};
    const facts: PageFacts = {
      load: 9, playOn: false, view: sceneViewFor(oldView, 3, 9), worldWarmed: oldView, worldWarmFailed: null,
      playAnswer: 'none', walkWarmed: true, noArmory: true, loadedArmory: -1, armoryReady: false,
      loadedEffects: 3, loadedSound: 3, url: false, netLoad: -1, status: null,
    };
    expect(joinVerdict(pageLanes(facts))).toEqual({ state: 'waiting', on: ['scene', 'effects', 'sound'] });
    // Once load 9 is shown and its own lanes answer, it releases.
    const newView = {};
    expect(joinVerdict(pageLanes({ ...facts, view: sceneViewFor(newView, 9, 9), worldWarmed: newView, loadedEffects: 9, loadedSound: 9 })))
      .toEqual({ state: 'ready' });
  });

  it('a reveal is stale once a newer load is asked, before that load\'s map replaces the view', () => {
    const built = {};
    let now = { wanted: 3, view: built as object | null };
    const stale = ownedStale(3, built, () => now);
    expect(stale()).toBe(false);
    now = { wanted: 9, view: built };                    // load 9 asked; its map not back yet
    expect(stale()).toBe(true);
    now = { wanted: 3, view: {} };                       // the view replaced
    expect(stale()).toBe(true);
  });

  it('main.ts asks each lane for the shown load and stamps a reply with its own load, not wantedMap', () => {
    expect(main).not.toMatch(/loaded(?:Sound|Effects|Armory) = wantedMap/);
    expect(main).toMatch(/soundLane\.ask\(\+\+requests, shownLoad\)/);
    expect(main).toMatch(/effectsLane\.ask\(\+\+requests, shownLoad\)/);
    expect(main).toMatch(/armoryLane\.ask\(\+\+requests, shownLoad\)/);
    expect(main).toMatch(/view: sceneViewFor\(view, shownLoad, wantedMap\)/);
    expect(main).toMatch(/const stale = ownedStale\(load0, built0, \(\) => \(\{ wanted: wantedMap, view \}\)\)/);
  });
});

// LATER 441 (simulation track with a product half, as 440): the walk's warm-up completion is owned by its load.
describe('LATER 441: an old warmWalk completion never writes into the successor load\'s warmedAt', () => {
  it('a completion marks its own load\'s record while that load is wanted, and nothing once it is superseded', () => {
    const first: Record<string, number> = {};
    expect(markWarmed(first, 'walk', 3, 3, 10)).toBe(true);
    expect(first).toEqual({ walk: 10 });
    const old: Record<string, number> = {}, successor: Record<string, number> = {};
    expect(markWarmed(old, 'walk', 3, 9, 12)).toBe(false);   // load 9 wanted when load 3's warm-up ends
    expect(old).toEqual({});
    expect(successor).toEqual({});                           // the successor's walk lane stays unwarmed
  });

  it('main.ts marks the walk lane through markWarmed with the load and record the warm-up began on', () => {
    expect(main).not.toMatch(/warmedAt\['walk'\] = /);
    expect(main).toMatch(/const walkLoad = shownLoad, walkWarmedAt: Record<string, number> = \{\};/);
    expect(main).toMatch(/if \(!markWarmed\(walkWarmedAt, 'walk', walkLoad, wantedMap, performance\.now\(\)\)\) return;/);
  });
});
