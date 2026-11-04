import { describe, expect, it } from 'vitest';
import { ESCORT_UNREAD_MAP_PLACEHOLDER, escortScriptOf } from '../../../match/src/extraction';
import type { MapAction } from '../../src/mapActions';
import { plantSite } from '../../src/net/objective';
import { applyForgeObjectives, bombReady, forgeTypePlayable, forgeTypeUnplayable, type ObjectiveMap } from '../../src/forge/objectives';
import type { ForgeObjectives } from '../../src/forge/layout';

/**
 * FG-51: a layout's game type is applied only when the map can play it. Demolition needs a start and one site for
 * each team before the base's MPBOMB records and StartBomb are replaced. Escort and Extraction need escortees, Escort
 * a read escort script too; Breach the room's own bomb test (the merge controller's rulings, 2026-10-22).
 */

function tent(node: string, at: [number, number, number]): MapAction {
  return {
    node, type: 'MPBOMB', typeCode: 4, valve: '', anims: ['BombPlace'], team: null, range: 15, elevation: 15, points: 0,
    bitmap: '', path: `worldmodel/${node}`, at,
  };
}

function discMap(escortees: readonly unknown[] = []): ObjectiveMap {
  return {
    bombStart: [9, 8, 7],
    escortees,
    meta: { actions: [tent('terrorist_tent', [1, 0, 0]), tent('seal_tent', [2, 0, 0]), { ...tent('door_1', [0, 0, 0]), type: 'DOOR', typeCode: 1 }] },
  };
}

const READY: ForgeObjectives = {
  gameType: 2,
  bomb: {
    start: [10, 1, 20],
    sites: [
      { team: 0, at: [100, 0, 0], yaw: 0, range: 15, elevation: 15 },
      { team: 1, at: [-40, 2, 5], yaw: 0, range: 15, elevation: 15 },
    ],
  },
};

describe('FG-51: a layout plays the type it names only when the map can', () => {
  it('demolition needs a start and one site of each team', () => {
    expect(bombReady(READY.bomb)).toBe(true);
    expect(bombReady({ sites: [{ team: 0, at: [1, 0, 0], yaw: 0, range: 15, elevation: 15 }] })).toBe(false);
    expect(bombReady({
      sites: [
        { team: 0, at: [1, 0, 0], yaw: 0, range: 15, elevation: 15 },
        { team: 1, at: [2, 0, 0], yaw: 0, range: 15, elevation: 15 },
      ],
    })).toBe(false);
    expect(forgeTypePlayable(2, READY, {})).toBe(true);
    expect(forgeTypePlayable(2, { gameType: 2, bomb: { sites: [{ team: 0, at: [1, 0, 0], yaw: 0, range: 15, elevation: 15 }] } }, {})).toBe(false);
    expect(forgeTypePlayable(5, { gameType: 5 }, {})).toBe(true);
    expect(forgeTypePlayable(3, { gameType: 3 }, { stem: 'MP53' })).toBe(false);          // no escortees
    expect(forgeTypePlayable(4, { gameType: 4 }, {})).toBe(false);
    expect(forgeTypePlayable(3, { gameType: 3 }, { stem: 'MP53', escortees: [{}, {}] })).toBe(true);
    expect(forgeTypePlayable(4, { gameType: 4 }, { escortees: [{}] })).toBe(true);
  });

  // M1 (the online seat's condition, the merge controller's ruling): BREACH is the room's own bomb test,
  // `BombAuthority.of` (match `bomb.ts`; LATER 149): StartBomb and the SEALs' site (`plantSite('seal')`).
  it('breach plays only where the room would build its bomb: StartBomb and terrorist_tent', () => {
    const blank: ObjectiveMap = { stem: 'MP2', meta: { actions: [] } };       // a blank floor on MP2: no tent, no StartBomb
    expect(forgeTypePlayable(1, { gameType: 1 }, blank)).toBe(false);
    expect(forgeTypeUnplayable(1, { gameType: 1 }, blank)).toMatch(/Breach/);
    expect(applyForgeObjectives(blank, { gameType: 1 })).toBe(blank);           // the base's own type stays
    const noStart: ObjectiveMap = { meta: { actions: [tent('terrorist_tent', [1, 0, 0])] } };
    expect(forgeTypePlayable(1, { gameType: 1 }, noStart)).toBe(false);
    const sealOnly: ObjectiveMap = { bombStart: [0, 0, 0], meta: { actions: [tent('seal_tent', [1, 0, 0])] } };
    expect(forgeTypePlayable(1, { gameType: 1 }, sealOnly)).toBe(false);       // seal_tent is the Terrorists' site
    const breach = applyForgeObjectives(discMap(), { gameType: 1 });
    expect(breach.gameType).toBe(1);
    expect(breach.meta!.actions.filter((a) => a.typeCode === 4).map((a) => a.node)).toEqual(['terrorist_tent', 'seal_tent']);
    expect(breach.bombStart).toEqual([9, 8, 7]);
  });

  // M2 (the merge controller's ruling 1): ESCORT plays only where the map's own escort script is read (MP52, MP53,
  // MP82: `ESCORT_ZONES_READING`, `ESCORT_COUNTDOWN_READING`) and escortees exist; elsewhere the room would play
  // `ESCORT_UNREAD_MAP_PLACEHOLDER`. EXTRACTION needs escortees alone, on any base.
  it('escort plays only on a map whose escort script is read; extraction on any map with escortees', () => {
    const hostages = [{ name: 'hostage' }];
    for (const stem of ['MP52', 'MP53', 'MP82']) expect(forgeTypePlayable(3, { gameType: 3 }, { stem, escortees: hostages }), stem).toBe(true);
    for (const stem of ['MP6', 'MP10', 'MP11', 'MP71']) {
      const extractionBase: ObjectiveMap = { stem, escortees: hostages, meta: { actions: [] } };
      expect(forgeTypePlayable(3, { gameType: 3 }, extractionBase), stem).toBe(false);
      expect(forgeTypeUnplayable(3, { gameType: 3 }, extractionBase)).toMatch(/Escort/);
      expect(applyForgeObjectives(extractionBase, { gameType: 3 })).toBe(extractionBase);
      expect(applyForgeObjectives(extractionBase, { gameType: 4 }).gameType).toBe(4);
    }
    // The page's map names its archive by path, as `simMapOfLoaded` reads the stem.
    expect(forgeTypePlayable(3, { gameType: 3 }, { path: 'RUN/MP52.ZDB', escortees: hostages })).toBe(true);
    expect(forgeTypePlayable(3, { gameType: 3 }, { path: 'RUN/MP6.ZDB', escortees: hostages })).toBe(false);
    expect(forgeTypePlayable(4, { gameType: 4 }, { stem: 'MP52', escortees: hostages })).toBe(true);    // 3 and 4 not tied to their own base
  });

  // The review's low 2: the gate is the room's own choice of script (`escortScriptOf`), not a copy of its condition.
  it('escort agrees with the room\'s escortScriptOf on every stem: playable exactly where the room plays a read script', () => {
    for (const stem of ['MP52', 'mp53', 'MP82', 'MP6', 'MP10', 'MP11', 'MP71', 'MP2', 'MP72', 'M51', 'floor', '']) {
      expect(forgeTypePlayable(3, { gameType: 3 }, { stem, escortees: [{}] }), stem).toBe(escortScriptOf(stem) !== ESCORT_UNREAD_MAP_PLACEHOLDER);
    }
  });

  // L1: "Map's own" names no type. Its bomb markers are kept in the file and played by nothing: the base as it is.
  it('a block with no game type leaves the map as it is, a ready bomb included', () => {
    const map = discMap();
    const { gameType: _type, ...untyped } = READY;
    expect(applyForgeObjectives(map, untyped)).toBe(map);
  });

  it('an incomplete demolition leaves the disc sites, StartBomb and game type', () => {
    const map = discMap();
    const oneSite = applyForgeObjectives(map, {
      gameType: 2,
      bomb: { sites: [{ team: 0, at: [4, 0, 0], yaw: 0, range: 15, elevation: 15 }] },
    });
    expect(oneSite).toBe(map);
    const noStart = applyForgeObjectives(map, {
      gameType: 2,
      bomb: {
        sites: [
          { team: 0, at: [4, 0, 0], yaw: 0, range: 15, elevation: 15 },
          { team: 1, at: [5, 0, 0], yaw: 0, range: 15, elevation: 15 },
        ],
      },
    });
    expect(noStart).toBe(map);
    expect(plantSite('seal', map.meta!.actions)?.node).toBe('terrorist_tent');
    expect(map.bombStart).toEqual([9, 8, 7]);
  });

  it('a ready demolition replaces the tents and StartBomb and sets game type 2', () => {
    const map = applyForgeObjectives(discMap(), READY);
    expect(map.gameType).toBe(2);
    expect(map.bombStart).toEqual([10, 1, 20]);
    expect(map.meta!.actions.filter((a) => a.typeCode === 4).map((a) => a.node)).toEqual(['forge_site_0', 'forge_site_1']);
    expect(plantSite('seal', map.meta!.actions)?.team).toBe(0);
    expect(plantSite('terrorist', map.meta!.actions)?.path).toBe('forge/site_1');
    expect(map.meta!.actions.some((a) => a.typeCode === 1)).toBe(true);
  });

  it('escort and extraction on a map with no escortees leave the disc bomb; with escortees they set the type and keep the bomb', () => {
    const bare = discMap();
    expect(applyForgeObjectives(bare, { gameType: 3 })).toBe(bare);
    expect(applyForgeObjectives(bare, { gameType: 4 })).toBe(bare);
    const hosted = applyForgeObjectives({ ...discMap([{ name: 'hostage' }]), stem: 'MP53' }, { gameType: 3 });
    expect(hosted.gameType).toBe(3);
    expect(hosted.bombStart).toEqual([9, 8, 7]);
    expect(plantSite('seal', hosted.meta!.actions)?.node).toBe('terrorist_tent');
    const extracted = applyForgeObjectives(discMap([{ name: 'hostage' }]), { gameType: 4 });
    expect(extracted.gameType).toBe(4);
    expect(extracted.meta!.actions.filter((a) => a.typeCode === 4).map((a) => a.node)).toEqual(['terrorist_tent', 'seal_tent']);
  });

  it('suppression with an incomplete bomb sets the type and keeps the disc sites', () => {
    const map = applyForgeObjectives(discMap(), {
      gameType: 5,
      bomb: { sites: [{ team: 0, at: [4, 0, 0], yaw: 0, range: 15, elevation: 15 }] },
    });
    expect(map.gameType).toBe(5);
    expect(map.bombStart).toEqual([9, 8, 7]);
    expect(plantSite('terrorist', map.meta!.actions)?.node).toBe('seal_tent');
  });
});
