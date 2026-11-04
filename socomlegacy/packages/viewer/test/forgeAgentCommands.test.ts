import { describe, expect, it } from 'vitest';
import { planForgeLayout } from '../src/forge/agent/commands';
import { emptyLayout, serializeLayout } from '../src/forge/layout';
import { History, recordEdit, decodeHistoryStep, encodeHistoryStep } from '../src/forge/history';

describe('Forge recipe plans use the existing layout and history', () => {
  it('five edits and five undos restore the initial exact bytes and selection', () => {
    let layout = emptyLayout({ kind: 'blank', library: 'floor' });
    const initial = serializeLayout(layout);
    const history = new History(encodeHistoryStep(initial, []));
    for (let i = 0; i < 5; i++) {
      layout = planForgeLayout(layout, 'spawn.place', { team: 'A', at: [i, 0, 0] }, []);
      recordEdit(history, serializeLayout(layout), [], [`spawn:${i}`]);
    }
    for (let i = 0; i < 5; i++) layout = JSON.parse(decodeHistoryStep(history.undo()!).text);
    expect(serializeLayout(layout)).toBe(initial);
    expect(decodeHistoryStep(history.current()).picked).toEqual([]);
    expect(history.canRedo()).toBe(true);
  });
  it('validates the complete recipe before staging and keeps the original on invalid import', () => {
    const layout = emptyLayout({ kind: 'blank', library: 'floor' });
    expect(() => planForgeLayout(layout, 'layout.import', { layout: { v: 2, pieces: [] } }, [])).toThrow();
    expect(layout.pieces).toEqual([]);
  });
  it('refuses locked and missing refs atomically', () => {
    let layout = emptyLayout({ kind: 'blank', library: 'floor' });
    layout = planForgeLayout(layout, 'spawn.place', { team: 'A', at: [1, 2, 3] }, []);
    layout = planForgeLayout(layout, 'piece.lock', { refs: ['spawn:0'] }, []);
    expect(() => planForgeLayout(layout, 'piece.move', { refs: ['spawn:0'], delta: [4, 0, 0] }, [])).toThrow(/locked/);
    expect(() => planForgeLayout(layout, 'piece.delete', { refs: ['spawn:9'] }, [])).toThrow(/reference/);
    expect(layout.spawns[0]!.p).toEqual([1, 2, 3]);
  });
  it('turns a group about its centre and makes one exact layout edit', () => {
    let l = emptyLayout({ kind: 'blank', library: 'floor' });
    l = planForgeLayout(l, 'spawn.place', { team: 'A', at: [-1, 0, 0] }, []);
    l = planForgeLayout(l, 'spawn.place', { team: 'B', at: [1, 0, 0] }, []);
    l = planForgeLayout(l, 'selection.rotate', { yaw: Math.PI }, ['spawn:0', 'spawn:1']);
    expect(l.spawns[0]!.p[0]).toBeCloseTo(1);
    expect(l.spawns[1]!.p[0]).toBeCloseTo(-1);
  });
  it('validates every batch member atomically and rejects refs after destructive reindexing', () => {
    const initial = emptyLayout({ kind: 'blank', library: 'floor' });
    expect(() => planForgeLayout(initial, 'layout.batch', { edits: [
      { operation: 'spawn.place', args: { team: 'A', at: [1, 2, 3] } },
      { operation: 'settings.set', args: { settings: { players: 99 } } },
    ] }, [])).toThrow();
    expect(initial.spawns).toEqual([]);
    const added = planForgeLayout(initial, 'spawn.place', { team: 'A', at: [0, 0, 0] }, []);
    expect(() => planForgeLayout(added, 'layout.batch', { edits: [
      { operation: 'piece.delete', args: { refs: ['spawn:0'] } },
      { operation: 'piece.move', args: { refs: ['spawn:0'], delta: [1, 0, 0] } },
    ] }, [])).toThrow(/reuse revision refs/);
  });
  it('refuses duplicate piece, spawn and NPC references before deleting any locked neighbour', () => {
    const l = emptyLayout({ kind: 'blank', library: 'floor' });
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    l.pieces = [{ asset: 'MP2:crate', m: [...identity] }, { asset: 'MP2:crate', m: [...identity], locked: true }];
    l.spawns = [{ team: 'A', p: [0, 0, 0], yaw: 0 }, { team: 'B', p: [1, 0, 0], yaw: 0, locked: true }];
    l.npcs = [{ side: 'seal', type: 0, p: [0, 0, 0], yaw: 0 }, { side: 'terrorist', type: 0, p: [1, 0, 0], yaw: 0, locked: true }];
    const before = serializeLayout(l);
    for (const kind of ['piece', 'spawn', 'npc']) {
      const args = { refs: [`${kind}:0`, `${kind}:0`] };
      expect(() => planForgeLayout(l, 'piece.delete', args, [])).toThrow(/unique|duplicate/);
      expect(() => planForgeLayout(l, 'layout.batch', { edits: [{ operation: 'piece.delete', args }] }, [])).toThrow(/unique|duplicate/);
      expect(serializeLayout(l)).toBe(before);
    }
  });
});
