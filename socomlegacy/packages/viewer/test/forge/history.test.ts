import { describe, expect, it } from 'vitest';
import { amendEdit, decodeHistoryStep, encodeHistoryStep, History, HISTORY_EDIT_LABEL, historyCaption, historyMetaOf, HUMAN_ACTOR, recordEdit, redoMeta,
  undoMeta } from '../../src/forge/history';

/** FORGE (FG-15): undo and redo over the layout's states -- each a snapshot, the same state twice kept once. */
describe('FORGE: the history', () => {
  it('undoes and redoes through the states recorded, and a new state drops the redo branch', () => {
    const h = new History<string>('a');
    h.record('b');
    h.record('c');
    expect([h.canUndo(), h.canRedo()]).toEqual([true, false]);
    expect(h.undo()).toBe('b');
    expect(h.undo()).toBe('a');
    expect(h.undo()).toBeNull();
    expect(h.redo()).toBe('b');
    h.record('d');
    expect(h.redo()).toBeNull();
    expect(h.undo()).toBe('b');
    expect(h.current()).toBe('b');
  });

  it('keeps a state equal to the current one once, and at most `limit` behind it', () => {
    const h = new History<string>('a', 3);
    h.record('a');
    expect(h.canUndo()).toBe(false);
    for (const s of ['b', 'c', 'd', 'e']) h.record(s);
    expect([h.undo(), h.undo(), h.undo()]).toEqual(['d', 'c', 'b']);
    expect(h.undo()).toBeNull();
  });

  it('does not move while the page is busy (a restore, an open or a Play start under way): the pointer stays with the scene', () => {
    const h = new History<string>('a');
    h.record('b');
    h.record('c');
    expect(h.undo(true)).toBeNull();
    expect(h.current()).toBe('c');
    expect(h.undo()).toBe('b');
    expect(h.redo(true)).toBeNull();
    expect(h.current()).toBe('b');
  });

  it('starts again from a state with nothing to undo (a layout opened)', () => {
    const h = new History<string>('a');
    h.record('b');
    h.reset('x');
    expect([h.canUndo(), h.canRedo(), h.current()]).toEqual([false, false, 'x']);
  });

  it('carries a placement identity with a step, and reads a row index or a bare layout text as none selected', () => {
    expect(decodeHistoryStep(encodeHistoryStep('{"forge":1}', ['piece:0', 'spawn:2', 'row:1', 'piece:-1']))).toEqual({ text: '{"forge":1}', picked: ['piece:0', 'spawn:2'] });
    expect(decodeHistoryStep('{"forge":1,"pieces":[]}')).toEqual({ text: '{"forge":1,"pieces":[]}', picked: [] });
    expect(decodeHistoryStep(JSON.stringify({ text: 'x', picked: [0, 2] })).picked).toEqual([]);
  });

  it('undo of a duplicate selects what was selected before it, and redo selects the copy', () => {
    // The click that selected the original is not a step: the open step stored nothing.
    const h = new History<string>('');
    h.reset(encodeHistoryStep('one piece', []));
    recordEdit(h, 'two pieces', ['piece:0'], ['piece:1']);
    expect(decodeHistoryStep(h.undo()!)).toEqual({ text: 'one piece', picked: ['piece:0'] });
    expect(decodeHistoryStep(h.redo()!)).toEqual({ text: 'two pieces', picked: ['piece:1'] });
  });

  it('undo of a multi-delete selects every item it removed, and redo selects nothing', () => {
    // The step current before the delete was recorded with only the piece: the spawn was added to the selection by a click.
    const h = new History<string>('');
    h.reset(encodeHistoryStep('piece and spawns', ['piece:0']));
    recordEdit(h, 'deleted', ['piece:0', 'spawn:0'], []);
    expect(decodeHistoryStep(h.undo()!)).toEqual({ text: 'piece and spawns', picked: ['piece:0', 'spawn:0'] });
    expect(decodeHistoryStep(h.redo()!)).toEqual({ text: 'deleted', picked: [] });
  });

  it('keeps the same placements selected across a move', () => {
    const h = new History<string>('');
    h.reset(encodeHistoryStep('at 0', []));
    recordEdit(h, 'at 400', ['spawn:0', 'spawn:1'], ['spawn:0', 'spawn:1']);
    expect(decodeHistoryStep(h.undo()!).picked).toEqual(['spawn:0', 'spawn:1']);
    expect(decodeHistoryStep(h.redo()!).picked).toEqual(['spawn:0', 'spawn:1']);
  });
});

/**
 * FUI-6 (the review's AI-1; a browser adaptation, FG.R2): a step names the edit that made it -- its words, its actor (a
 * person, or an agent and its session) and its domain -- so Undo and Redo say what they take back and whose it was. A
 * step saved before FUI-6 still decodes, read as a person's layout edit.
 */
describe('FUI-6: a history step with its actor and domain', () => {
  const agent = { kind: 'agent', sessionId: 's1' } as const;

  it('loads an old step: a saved {text, picked} has no meta and reads as a person\'s layout edit', () => {
    const old = JSON.stringify({ text: '{"forge":1,"pieces":[]}', picked: ['spawn:0'] });
    const step = decodeHistoryStep(old);
    expect(step).toEqual({ text: '{"forge":1,"pieces":[]}', picked: ['spawn:0'] });
    expect(historyMetaOf(step)).toEqual({ label: HISTORY_EDIT_LABEL, actor: HUMAN_ACTOR, domain: 'layout' });
    expect(historyMetaOf(decodeHistoryStep('{"forge":1}'))).toEqual({ label: 'Edit', actor: { kind: 'human' }, domain: 'layout' });
  });

  it('carries the label, the actor, the domain and the request through encode and decode; drops a malformed field only', () => {
    const raw = encodeHistoryStep('{"forge":1}', ['piece:0'], { label: 'Place spawn A', actor: agent, domain: 'layout', requestId: 'r-7' });
    expect(decodeHistoryStep(raw)).toEqual({ text: '{"forge":1}', picked: ['piece:0'], label: 'Place spawn A', actor: agent, domain: 'layout', requestId: 'r-7' });
    const odd = JSON.stringify({ text: 'x', picked: [], label: 3, actor: { kind: 'robot' }, domain: 'world', requestId: '' });
    expect(decodeHistoryStep(odd)).toEqual({ text: 'x', picked: [] });
    expect(decodeHistoryStep(JSON.stringify({ text: 'x', picked: [], actor: { kind: 'agent' } })).actor).toEqual({ kind: 'agent', sessionId: null });
  });

  it('names the step an undo takes back and the step a redo makes again: "<label>", "<label> (agent)"', () => {
    const h = new History<string>('');
    h.reset(encodeHistoryStep('empty', []));
    expect([undoMeta(h), redoMeta(h)]).toEqual([null, null]);
    recordEdit(h, 'one spawn', [], ['spawn:0'], { label: 'Place spawn A', actor: agent, domain: 'layout' });
    recordEdit(h, 'deleted', ['spawn:0'], [], { label: 'Delete', actor: HUMAN_ACTOR, domain: 'layout' });
    expect(historyCaption(undoMeta(h)!)).toBe('Delete');
    h.undo();
    expect(historyCaption(undoMeta(h)!)).toBe('Place spawn A (agent)');
    expect(historyCaption(redoMeta(h)!)).toBe('Delete');
    h.undo();
    expect(undoMeta(h)).toBeNull();
    expect(historyCaption(redoMeta(h)!)).toBe('Place spawn A (agent)');
    // The selection a step restores is unchanged by its meta (the earlier tests' rule).
    expect(decodeHistoryStep(h.redo()!)).toMatchObject({ text: 'one spawn', picked: ['spawn:0'], actor: agent });
  });

  it('records no step for an edit that changed nothing, whatever its meta (as before FUI-6)', () => {
    const h = new History<string>('');
    h.reset(encodeHistoryStep('same', ['piece:0']));
    recordEdit(h, 'same', ['piece:0'], ['piece:0'], { label: 'Move', actor: agent, domain: 'layout' });
    expect(h.canUndo()).toBe(false);
  });

  it('amends the current step for a second edit of one operation: one undo goes back past both, its meta kept', () => {
    const h = new History<string>('');
    h.reset(encodeHistoryStep('a', []));
    recordEdit(h, 'b', [], ['piece:0'], { label: 'Batch of 2 edits', actor: agent, domain: 'layout' });
    amendEdit(h, 'c', ['piece:0', 'piece:1']);
    expect(decodeHistoryStep(h.current())).toMatchObject({ text: 'c', picked: ['piece:0', 'piece:1'], label: 'Batch of 2 edits' });
    expect(decodeHistoryStep(h.undo()!).text).toBe('a');
    expect(h.canUndo()).toBe(false);
  });
});
