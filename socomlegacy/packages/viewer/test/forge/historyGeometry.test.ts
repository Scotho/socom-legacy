import { describe, expect, it } from 'vitest';
import {
  decodeHistoryStep, encodeHistoryStep, History, recordEdit, recordGeometryEdit, recordSelection, SELECT_LABEL, stampSelection, undoMeta,
} from '../../src/forge/history';

/**
 * Bug 20 (a browser adaptation, FG.R2): one history for the layout and the geometry, as Hammer's, Unreal's and Blender's
 * undo cover every mode. A step names the geometry's revision (`geo`); each geometry edit is a step of its own, tagged
 * `geometry`, so one undo takes back one geometry operation and a layout edit keeps the geometry as it stood.
 */
describe('the shared history', () => {
  const start = (): History<string> => new History<string>(encodeHistoryStep('L0', [], undefined, 0));
  const geoOf = (h: History<string>): number => decodeHistoryStep(h.current()).geo ?? 0;

  it('keeps the geometry revision through a step', () => {
    expect(decodeHistoryStep(encodeHistoryStep('L', ['piece:0'], undefined, 3)).geo).toBe(3);
    expect(decodeHistoryStep(encodeHistoryStep('L', [])).geo).toBeUndefined();
  });

  it('makes each geometry edit its own step, named and tagged', () => {
    const h = start();
    recordGeometryEdit(h, 1, 'Create box');
    recordGeometryEdit(h, 2, 'Extrude');
    recordGeometryEdit(h, 3, 'Move geometry');
    expect(undoMeta(h)).toMatchObject({ label: 'Move geometry', domain: 'geometry' });
    h.undo();
    expect(geoOf(h)).toBe(2);
    h.undo();
    expect(geoOf(h)).toBe(1);
    h.redo();
    expect(geoOf(h)).toBe(2);
  });

  it('keeps the layout text on a geometry step, and the geometry on a layout step', () => {
    const h = start();
    recordGeometryEdit(h, 1, 'Create box');
    expect(decodeHistoryStep(h.current()).text).toBe('L0');
    recordEdit(h, 'L1', [], []);
    expect(geoOf(h)).toBe(1);
    recordGeometryEdit(h, 2, 'Extrude');
    h.undo();                                                  // the extrude
    expect(geoOf(h)).toBe(1);
    expect(decodeHistoryStep(h.current()).text).toBe('L1');
    h.undo();                                                  // the layout edit
    expect(decodeHistoryStep(h.current()).text).toBe('L0');
    expect(geoOf(h)).toBe(1);
  });

  it('makes a selection a step of its own, and the same selection none', () => {
    const h = start();
    stampSelection(h, [], 'none');
    expect(recordSelection(h, ['piece:0'], 'piece0')).toBe(true);
    expect(recordSelection(h, ['piece:0'], 'piece0')).toBe(false);
    expect(undoMeta(h)).toMatchObject({ label: SELECT_LABEL });
    expect(decodeHistoryStep(h.current())).toMatchObject({ text: 'L0', sel: 'piece0', picked: ['piece:0'] });
    h.undo();
    expect(decodeHistoryStep(h.current()).sel).toBe('none');
  });

  it('keeps the selection through an edit until it is stamped, and the geometry through a selection', () => {
    const h = start();
    recordGeometryEdit(h, 1, 'Create box');
    recordSelection(h, [], 'box');
    expect(geoOf(h)).toBe(1);
    recordEdit(h, 'L1', [], []);
    stampSelection(h, [], 'after');
    expect(decodeHistoryStep(h.current()).sel).toBe('after');
    h.undo();
    expect(decodeHistoryStep(h.current()).sel).toBe('box');
  });

  it('lists every state, the redo branch included', () => {
    const h = start();
    recordGeometryEdit(h, 1, 'a');
    recordGeometryEdit(h, 2, 'b');
    h.undo();
    expect(h.allStates().map((s) => decodeHistoryStep(s).geo)).toEqual([0, 1, 2]);
  });
});
