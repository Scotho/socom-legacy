import { describe, expect, it } from 'vitest';
import { emptyLayout, parseLayout, serializeLayout, type Layout } from '../../src/forge/layout';
import { bombOfMarkerStates, bombRestOf, layoutObjectivesOf, markersOfBomb, type BombMarkerState } from '../../src/forge/bombMarkers';
import { layoutOfRecord, readSaved, recordOfLayout } from '../../src/forge/record';

/**
 * FG-51's editor (a browser adaptation): the bomb markers as the page keeps them (`./bombMarkers`), between a layout's
 * bomb (`placeAll`) and the layout it saves (`layoutNow`). The page mounts no unit, so the page's own two steps are these
 * pure functions; `objectiveGate.test.ts` holds that the page calls them. The reviews of b46b88328: an unlocked start
 * stayed locked (the kept keys carried `startLocked`); a file's own range and elevation were overwritten; a block's own
 * keys were written only beside a type or a marker.
 */

/** The page's round trip: the layout's bomb placed as markers, the markers edited, saved, the save reopened. */
function save(markers: readonly BombMarkerState[], rest: Record<string, unknown>, type: 1 | 2 | 3 | 4 | 5 | null = 2, objectiveRest: Record<string, unknown> = {}): Layout {
  const objectives = layoutObjectivesOf(type, bombOfMarkerStates(markers, rest), objectiveRest);
  return { ...emptyLayout({ kind: 'map', archive: 'MP72' }), ...(objectives ? { objectives } : {}) };
}
/** Reopened from the saved text, as the autosave's v2 record reads it back. */
function reload(l: Layout): { markers: BombMarkerState[]; rest: Record<string, unknown>; layout: Layout } {
  const layout = layoutOfRecord(readSaved(JSON.stringify(recordOfLayout(parseLayout(serializeLayout(l)), 'Autosave')), 'Autosave'));
  return { markers: markersOfBomb(layout.objectives?.bomb), rest: bombRestOf(layout.objectives?.bomb), layout };
}

const START: BombMarkerState = { kind: 'start', at: [10, 0, 20], yaw: 0, locked: false };
const SEAL: BombMarkerState = { kind: 'seal', at: [100, 0, 0], yaw: 0.5, locked: false };

describe('FG-51: the bomb markers between the layout and the page', () => {
  it('a start locked, saved and reloaded is locked; unlocked, saved and reloaded it is unlocked', () => {
    let state = reload(save([{ ...START, locked: true }, SEAL], {}));
    expect(state.markers.find((m) => m.kind === 'start')!.locked).toBe(true);
    expect(state.rest).not.toHaveProperty('startLocked');           // the lock is the marker's, never a kept key
    state = reload(save(state.markers.map((m) => (m.kind === 'start' ? { ...m, locked: false } : m)), state.rest));
    expect(state.markers.find((m) => m.kind === 'start')!.locked).toBe(false);
    expect(state.layout.objectives!.bomb).not.toHaveProperty('startLocked');
    // A site's lock, the same way.
    state = reload(save(state.markers.map((m) => (m.kind === 'seal' ? { ...m, locked: true } : m)), state.rest));
    expect(state.markers.find((m) => m.kind === 'seal')!.locked).toBe(true);
    state = reload(save(state.markers.map((m) => ({ ...m, locked: false })), state.rest));
    expect(state.markers.every((m) => !m.locked)).toBe(true);
  });

  it('a locked start deleted leaves no stray startLocked', () => {
    const state = reload(save([{ ...START, locked: true }, SEAL], {}));
    const after = reload(save(state.markers.filter((m) => m.kind !== 'start'), state.rest));
    expect(after.layout.objectives!.bomb).not.toHaveProperty('start');
    expect(after.layout.objectives!.bomb).not.toHaveProperty('startLocked');
    expect(after.markers.map((m) => m.kind)).toEqual(['seal']);
  });

  it('keeps a file\'s own range and elevation, and a site\'s and a block\'s own keys, through the round trip', () => {
    const file: Layout = {
      ...emptyLayout({ kind: 'map', archive: 'MP72' }),
      objectives: {
        gameType: 2, bases: [1],
        bomb: { start: [1, 2, 3], sites: [{ team: 1, at: [4, 5, 6], yaw: 0, range: 12, elevation: -1, note: 'keep' }], wires: 2 },
      } as unknown as Layout['objectives'],
    };
    const markers = markersOfBomb(file.objectives!.bomb);
    expect(markers.find((m) => m.kind === 'terrorist')).toMatchObject({ range: 12, elevation: -1, rest: { note: 'keep' } });
    const again = reload(save(markers, bombRestOf(file.objectives!.bomb), 2, { bases: [1] }));
    expect(again.layout.objectives).toEqual(file.objectives);
    // A marker placed in the editor has no file values: the disc's reach (research 173 s2), 15 and 15.
    expect(bombOfMarkerStates([{ kind: 'seal', at: [0, 0, 0], yaw: 0, locked: false }], {})!.sites[0]).toMatchObject({ range: 15, elevation: 15 });
  });

  it('writes a block\'s own keys whenever there are some, with no type and no marker too (layout.ts: a save does not drop them)', () => {
    expect(layoutObjectivesOf(null, undefined, {})).toBeUndefined();
    expect(layoutObjectivesOf(null, undefined, { escortees: [{ name: 'Hostage' }] })).toEqual({ escortees: [{ name: 'Hostage' }] });
    expect(layoutObjectivesOf(3, undefined, {})).toEqual({ gameType: 3 });
    const kept = reload(save([], {}, null, { escortees: [{ name: 'Hostage' }] }));
    expect(kept.layout.objectives).toEqual({ escortees: [{ name: 'Hostage' }] });
  });
});
