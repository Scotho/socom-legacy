import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// @vitest-environment jsdom
// test/replayThrowables.test.ts -- LATER 32 (web sprint 38 RE-1's owed half; research 249 §1): C4 and the PMN drawn in
// the replay mode. The page's thrower takes the disc's throwable records with the map (`MatchThrowables.setMap`, the
// map's own `KitTable.throwables`, the table a spawn's `spawnEquipment` reads), not only at the local seat's spawn,
// which a replay's watcher never has; and the replay mount hands the same records to the fold
// (`ReplayClientOptions.throwable`).
import { describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { CLAYMORE, ITEM, type ThrowableRecord } from '@s2u/scene';
import { mountThrowables, type MatchThrowDeps } from '../src/matchThrow';
import { PlayerLoadout } from '../src/loadout';
import type { LoadedMap } from '../src/loadMap';
import type { WorldView } from '../src/world';
import { replayClient } from '../src/replay/mount';
import type { ReplayClient } from '../src/replay/replayClient';
import { fakeFetch, fixtureBytes } from './replayFixture';

/** Synthetic records (not the disc's): C4's and the PMN's come off the disc only, so a test names its own. */
const { volatile: _volatile, ...NOT_VOLATILE } = CLAYMORE;
const C4_TEST: ThrowableRecord = { ...NOT_VOLATILE, name: 'C4', id: ITEM.C4, fuse: 6, removal: 7 };
const PMN_TEST: ThrowableRecord = { ...CLAYMORE, name: 'PMN Mine', id: ITEM.PMN, fuse: 8, removal: 20, proximity: 10 };

/** A map whose kit table holds the two disc-only records (`KitTable.throwables`, by item id), and no models. */
const mapWithDisc = { arsenal: { table: { throwables: new Map([[ITEM.C4, { record: C4_TEST, piercing: 0 }], [ITEM.PMN, { record: PMN_TEST, piercing: 0 }]]) }, map: null } } as unknown as LoadedMap;
const built = { grenades: {} } as unknown as WorldView;

/** The throwables part on fakes, as `matchThrow.test.ts` mounts it: no spawn ever runs (a replay's watcher). */
function watcher() {
  const firearm = {
    shotRumble: () => {},                              // CTL-2: the hands' fire step's motors
    fire: { release: () => {}, magazineOf: () => ({ rounds: 0, capacity: 0, spare: 0, reloading: false }) },
    zoom: { state: () => 1 }, kit: { swapping: () => false, item: () => 'rifle', state: () => ({ swap: null }) },
    setZoom: () => {}, showFireMode: () => {}, item: () => 'rifle', record: () => ({ name: 'M4A1' }), records: () => [{}, {}],
    icon: () => 'm4.tif', selectFirearm: () => true, shoulderGate: () => true, kitFree: () => true,
    effects: { play: () => false },
  };
  const deps: MatchThrowDeps = {
    scene: new Scene(),
    walk: {
      grid: () => null, snapshot: () => null, view: () => ({}) as never, fireAim: () => null, feet: () => null, drawnFeet: () => null,
      hold: () => {}, mode: () => 'walk', isDead: () => false, fireAllowed: () => true, swapGate: () => true, onActionEnd: () => () => {},
      onLauncherStickLower: () => () => {},                            // PAR-83: the part hears the walk's stick lower at its mount
    } as never,
    fly: { shakeScreen: () => {} },
    play: {
      partPoint: () => null, heldNode: () => null, itemNode: () => null, launcherNode: () => null, motionSource: () => null,
      setRifleStowed: () => {}, addPoseLayer: () => {},
    } as never,
    loadouts: new PlayerLoadout(),
    view: () => null, map: () => null, net: () => null,
    firearm: () => firearm as never,
    audio: { onAnimCallback: () => null, play: () => {} } as never,
  };
  return mountThrowables(deps);
}

describe('LATER 32: the page holds the disc\'s throwables with the map, so a replay draws C4 and the PMN', () => {
  it('without the map\'s records (the baked set only) a remote C4 and PMN are dropped -- the defect\'s control', () => {
    const t = watcher();
    t.netDeps().remoteGrenade('C4', [0, 50, 0], [0, 0, 1], 2, 7, undefined);
    t.netDeps().remoteGrenade('PMN Mine', [9, 50, 0], [1, 0, 0], 2, 8, undefined);
    expect(t.grenade.stats().live).toEqual([]);
    expect(t.throwable('C4')).toBeNull();
    t.dispose();
  });

  it('the map\'s records handed with the map, no spawn: a remote C4 and PMN are laid, in play and in a seek\'s envelope', () => {
    const t = watcher();
    t.setMap(built, mapWithDisc);
    t.netDeps().remoteGrenade('C4', [0, 50, 0], [0, 0, 1], 2, 7, undefined);                                  // in play
    t.netDeps().remoteGrenade('PMN Mine', [9, 50, 0], [1, 0, 0], 2, 8, { state: 'rest', age: 2.5, fuse: 3, removal: 10, bounces: 0, dud: false }); // a seek's envelope
    expect(t.grenade.stats().live.map((l) => [l.pid, l.owner, l.state])).toEqual([[7, 2, 'rest'], [8, 2, 'rest']]);
    expect(t.throwable('C4')).toBe(C4_TEST);
    expect(t.throwable('PMN Mine')).toBe(PMN_TEST);
    expect(t.throwable('Claymore')).toBe(CLAYMORE);                     // the baked ones stay
    expect(t.throwable('Satchel')).toBeNull();                          // not the hand's
    t.dispose();
  });
});

describe('LATER 32, the review\'s low: the legacy pouch (no kit yet) is the baked set, records at load or not', () => {
  it('with the map\'s records held and no kit, a refill carries no C4 and no PMN (as before the records came at load)', () => {
    const t = watcher();
    t.setMap(built, mapWithDisc);
    t.grenade.setKit(null);                                              // the legacy pouch: every baked record full
    const left = t.grenade.stats().leftByItem as Record<string, number | undefined>;
    expect(left['C4'] ?? 0).toBe(0);
    expect(left['PMN Mine'] ?? 0).toBe(0);
    expect(left['M67']).toBeGreaterThan(0);
    t.dispose();
  });
});

describe('LATER 32: the replay mount passes the page\'s throwables to the fold (ReplayClientOptions.throwable)', () => {
  it('the client\'s fold reads the page\'s lookup, at the read (records handed after the mount still reach it)', async () => {
    const search = '?devmode&replay=http://localhost:5303/segments/32.s2r';
    let held: ThrowableRecord | null = null;
    const make = replayClient(search, {
      document, location: { search, pathname: '/testroom', hash: '', replace: () => {} }, fetch: fakeFetch(fixtureBytes()),
    }, { throwable: (kind) => (kind === 'C4' ? held : null) });
    const c = make({ url: 'replay:', map: 'MP2', name: 'W', watch: true }, {} as never) as unknown as ReplayClient;
    await c.ready;
    const fold = (c as unknown as { throwable: (kind: string) => ThrowableRecord | null }).throwable;
    expect(fold('C4')).toBeNull();
    held = C4_TEST;
    expect(fold('C4')).toBe(C4_TEST);
    c.close();
  });

  it('without the page\'s lookup, the baked set (unchanged): no C4', async () => {
    const search = '?devmode&replay=http://localhost:5303/segments/33.s2r';
    const make = replayClient(search, { document, location: { search, pathname: '/testroom', hash: '', replace: () => {} }, fetch: fakeFetch(fixtureBytes()) });
    const c = make({ url: 'replay:', map: 'MP2', name: 'W', watch: true }, {} as never) as unknown as ReplayClient;
    await c.ready;
    const fold = (c as unknown as { throwable: (kind: string) => ThrowableRecord | null }).throwable;
    expect(fold('C4')).toBeNull();
    expect(fold('Claymore')).toBe(CLAYMORE);
    c.close();
  });
});

describe('/testroom hands its replay the thrower\'s records (LATER 32)', () => {
  it('main.ts passes throws.throwable to replayClient, so a seek\'s fold folds C4 and the PMN', () => {
    const main = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/main.ts'), 'utf8');
    expect(main).toMatch(/replayClient\(SEARCH, undefined, \{ throwable: \(k\) => throws\.throwable\(k\)(, hull: replayHull)?(, held: \(\) => loadingJoin\.blocked)? \}\)/);   // RV-7c-2 adds the hull (test/replayHull.test.ts); RV2-03 the page's loading hold
  });
});
