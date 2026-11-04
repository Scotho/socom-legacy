import { describe, expect, it } from 'vitest';
import { emptyLayout, parseLayout, serializeLayout, type ForgeObjectives, type Layout } from '../../src/forge/layout';
import { bombOfMarkerStates, bombRestOf, layoutObjectivesOf, markersOfBomb, type BombMarkerState } from '../../src/forge/bombMarkers';
import { decodeHistoryStep, encodeHistoryStep, History, recordEdit } from '../../src/forge/history';

/**
 * FG-51 (the forge seat's word on the replace-all call, 2026-10-22): placing a new site replaces every site of its team,
 * and ONE undo brings every replaced site back, each with its file's range, elevation and own keys; the new one gone.
 *
 * The page's undo is page-bound (`page.ts` mounts no unit), so this runs the units it is built from, in the page's
 * order: a step is the layout's whole text (`./history`: `recordEdit` once per edit, `encodeHistoryStep` with the
 * selection's ids), the layout's bomb is `./bombMarkers`' (`markersOfBomb` at the open, `bombOfMarkerStates` and
 * `layoutObjectivesOf` at each save), and an undo reopens the text (`parseLayout`, `markersOfBomb`). That the placing
 * path records one edit after removing every marker of its kind is `objectiveGate.test.ts`' source pin.
 */

const FILE_OBJECTIVES = {
  gameType: 2,
  bomb: {
    start: [1, 0, 1],
    sites: [
      { team: 0, at: [100, 0, 0], yaw: 0.5, range: 12, elevation: -1, note: 'west' },
      { team: 0, at: [200, 0, 0], yaw: 1, range: 20, elevation: 30, note: 'east', depth: 3 },
      { team: 1, at: [-100, 0, 0], yaw: 0, range: 15, elevation: 15 },
    ],
  },
} as unknown as ForgeObjectives;

/** The page's `layoutNow` text for these markers (no camera: an undo must not jump the view). */
const textOf = (markers: readonly BombMarkerState[], rest: Record<string, unknown>): string => {
  const objectives = layoutObjectivesOf(2, bombOfMarkerStates(markers, rest), {});
  const l: Layout = { ...emptyLayout({ kind: 'map', archive: 'MP72' }), ...(objectives ? { objectives } : {}) };
  return serializeLayout(l);
};

describe('FG-51: one undo brings back every site a new placement replaced', () => {
  it('two SEAL sites from a file, a new SEAL site placed, one undo: both back with their own keys, the new one gone', () => {
    const opened: Layout = { ...emptyLayout({ kind: 'map', archive: 'MP72' }), objectives: FILE_OBJECTIVES };
    const markers = markersOfBomb(parseLayout(serializeLayout(opened)).objectives!.bomb);
    const rest = bombRestOf(opened.objectives!.bomb);
    const history = new History<string>('');
    history.reset(encodeHistoryStep(textOf(markers, rest), []));

    // The player had the second SEAL site selected (`bomb:seal:1`), then placed a new SEAL site: every SEAL site goes.
    const placed: BombMarkerState = { kind: 'seal', at: [300, 0, 50], yaw: 0, locked: false };
    const after = [...markers.filter((m) => m.kind !== 'seal'), placed];
    recordEdit(history, textOf(after, rest), ['bomb:seal:1'], ['bomb:seal:0']);
    expect(markersOfBomb(parseLayout(decodeHistoryStep(history.current()).text).objectives!.bomb).filter((m) => m.kind === 'seal')).toHaveLength(1);

    const undone = decodeHistoryStep(history.undo()!);
    expect(history.canUndo()).toBe(false);                            // one step, not one per replaced site
    const back = parseLayout(undone.text).objectives!;
    expect(back).toEqual(FILE_OBJECTIVES);                            // both sites, each with its range, elevation, keys
    expect(back.bomb!.sites.some((s) => s.at[0] === 300)).toBe(false); // the new one gone
    expect(undone.picked).toEqual(['bomb:seal:1']);                   // the selection from before the placement

    const redone = decodeHistoryStep(history.redo()!);
    const seals = parseLayout(redone.text).objectives!.bomb!.sites.filter((s) => s.team === 0);
    expect(seals).toEqual([{ team: 0, at: [300, 0, 50], yaw: 0, range: 15, elevation: 15 }]);
    expect(redone.picked).toEqual(['bomb:seal:0']);
  });

  it('a bomb marker\'s id rides an undo step, as a piece\'s does; an id of no kind does not', () => {
    const step = decodeHistoryStep(encodeHistoryStep('x', ['piece:0', 'bomb:start:0', 'bomb:seal:1', 'bomb:terrorist:0', 'bomb:seal', 'bomb:other:0']));
    expect(step.picked).toEqual(['piece:0', 'bomb:start:0', 'bomb:seal:1', 'bomb:terrorist:0']);
  });
});
