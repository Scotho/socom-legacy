import { describe, expect, it } from 'vitest';
import { agentChangedRefs, agentStepCount, decodeHistoryStep, encodeHistoryStep, History, recordEdit, undoAgentRun, undoWhile, type HistoryActor } from '../../src/forge/history';

/**
 * AX-15 (a browser adaptation, FG.R2): the agent's run undone from the top of the history, stopping at the first step that
 * is not that agent's; and the placements the agent's steps still in the history touched.
 */
const agent = (sessionId: string | null = 's1'): HistoryActor => ({ kind: 'agent', sessionId });
const human: HistoryActor = { kind: 'human' };
/** A layout's text as the page records it (only the arrays the diff reads matter here). */
const layout = (pieces: unknown[], spawns: unknown[] = [], extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ forge: 1, base: { kind: 'blank', library: 'x' }, pieces, spawns, ...extra });
const piece = (asset: string, x: number) => ({ asset, p: [x, 0, 0], yaw: 0 });

function rig(): { h: History<string>; step(text: string, actor: HistoryActor, requestId?: string): void } {
  const h = new History<string>(encodeHistoryStep(layout([]), []));
  return { h, step(text, actor, requestId) {
    recordEdit(h, text, [], [], { label: 'Edit', actor, domain: 'layout', ...(requestId ? { requestId } : {}) });
  } };
}

describe('AX-15: undo the agent\'s run', () => {
  it('undoes every agent step on top and stops at the person\'s own edit beneath them', () => {
    const r = rig();
    r.step(layout([piece('a', 0)]), human);
    r.step(layout([piece('a', 0), piece('b', 1)]), agent());
    r.step(layout([piece('a', 0), piece('b', 1), piece('c', 2)]), agent());
    r.step(layout([piece('a', 0), piece('b', 1), piece('c', 2), piece('d', 3)]), agent());
    const out = undoAgentRun(r.h);
    expect(out.undone).toBe(3);
    expect(out.stopped).toBe('person');
    expect(out.message).toBe('Stopped at your own edit: 3 agent changes undone');
    expect(decodeHistoryStep(out.state!).text).toBe(layout([piece('a', 0)]));
    expect(r.h.current()).toBe(out.state);
    // One redo per undone step stays available; the person's step is still there to undo.
    expect(r.h.canUndo()).toBe(true);
    let redos = 0;
    while (r.h.redo() !== null) redos++;
    expect(redos).toBe(3);
  });

  it('never undoes a person\'s step: a person\'s edit on top undoes nothing', () => {
    const r = rig();
    r.step(layout([piece('b', 1)]), agent());
    r.step(layout([piece('b', 1), piece('a', 0)]), human);
    const before = r.h.current();
    const out = undoAgentRun(r.h);
    expect(out).toMatchObject({ undone: 0, stopped: 'person', state: null });
    expect(out.message).toBe('Stopped at your own edit: no agent changes undone');
    expect(r.h.current()).toBe(before);
    expect(r.h.canRedo()).toBe(false);
  });

  it('with a session named, stops at another session\'s step; with none, undoes any agent\'s', () => {
    const r = rig();
    r.step(layout([piece('a', 0)]), agent('s2'));
    r.step(layout([piece('a', 0), piece('b', 1)]), agent('s1'));
    r.step(layout([piece('a', 0), piece('b', 1), piece('c', 2)]), agent('s1'));
    expect([agentStepCount(r.h), agentStepCount(r.h, 's1'), agentStepCount(r.h, 's2')]).toEqual([3, 2, 1]);
    const mine = undoAgentRun(r.h, 's1');
    expect(mine).toMatchObject({ undone: 2, stopped: 'other-agent' });
    expect(mine.message).toBe('Stopped at another agent’s edit: 2 agent changes undone');
    const any = undoAgentRun(r.h);
    expect(any).toMatchObject({ undone: 1, stopped: 'start' });
    expect(any.message).toBe('Nothing older to undo: 1 agent change undone');
    expect(decodeHistoryStep(r.h.current()).text).toBe(layout([]));
  });

  it('on an empty history undoes nothing and says so', () => {
    const r = rig();
    const out = undoAgentRun(r.h);
    expect(out).toMatchObject({ undone: 0, stopped: 'start', state: null, message: 'No agent changes to undo' });
  });

  it('while the page is busy moves nothing (the pointer moves only with the scene)', () => {
    const r = rig();
    r.step(layout([piece('a', 0)]), agent());
    const before = r.h.current();
    const out = undoAgentRun(r.h, undefined, true);
    expect(out).toMatchObject({ undone: 0, stopped: 'busy', state: null });
    expect(r.h.current()).toBe(before);
  });

  it('undoWhile takes back the contiguous top steps of one request only', () => {
    const r = rig();
    r.step(layout([piece('a', 0)]), agent(), 's1:r1');
    r.step(layout([piece('a', 0), piece('b', 1)]), agent(), 's1:r2');
    r.step(layout([piece('a', 0), piece('b', 1), piece('c', 2)]), agent(), 's1:r2');
    const out = undoWhile(r.h, (m) => m.requestId === 's1:r2');
    expect(out.undone).toBe(2);
    expect(out.stoppedAt?.requestId).toBe('s1:r1');
    expect(decodeHistoryStep(r.h.current()).text).toBe(layout([piece('a', 0)]));
  });
});

describe('AX-15: the refs the agent changed', () => {
  it('names placed and moved rows by their identity, not a neighbour shifted by a delete', () => {
    const r = rig();
    r.step(layout([piece('a', 0), piece('b', 1), piece('c', 2)]), human);
    // The agent places d and a spawn, moves c, deletes a (b and c shift down an index; b is not the agent's change).
    r.step(layout([piece('a', 0), piece('b', 1), piece('c', 2), piece('d', 3)]), agent());
    r.step(layout([piece('a', 0), piece('b', 1), piece('c', 2), piece('d', 3)], [{ team: 0, p: [0, 0, 0], yaw: 0 }]), agent());
    r.step(layout([piece('a', 0), piece('b', 1), piece('c', 9), piece('d', 3)], [{ team: 0, p: [0, 0, 0], yaw: 0 }]), agent());
    r.step(layout([piece('b', 1), piece('c', 9), piece('d', 3)], [{ team: 0, p: [0, 0, 0], yaw: 0 }]), agent());
    expect(agentChangedRefs(r.h).sort()).toEqual(['piece:1', 'piece:2', 'spawn:0']);
  });

  it('drops a row the person changed since, and the steps an undo took back; filters by session', () => {
    const r = rig();
    r.step(layout([piece('a', 0)]), agent('s1'));
    r.step(layout([piece('a', 0)], [], { npcs: [{ side: 'seal', type: 1, p: [1, 0, 1], yaw: 0 }] }), agent('s2'));
    expect(agentChangedRefs(r.h).sort()).toEqual(['npc:0', 'piece:0']);
    expect(agentChangedRefs(r.h, 's1')).toEqual(['piece:0']);
    r.step(layout([piece('a', 5)], [], { npcs: [{ side: 'seal', type: 1, p: [1, 0, 1], yaw: 0 }] }), human);
    expect(agentChangedRefs(r.h)).toEqual(['npc:0']);
    r.h.undo(); r.h.undo();
    expect(agentChangedRefs(r.h)).toEqual(['piece:0']);
    r.h.undo();
    expect(agentChangedRefs(r.h)).toEqual([]);
  });
});
