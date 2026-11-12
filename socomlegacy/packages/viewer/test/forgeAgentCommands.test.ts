import { describe, expect, it } from 'vitest';
import { planForgeLayout } from '../src/forge/agent/commands';
import { emptyLayout, serializeLayout } from '../src/forge/layout';
import { History, recordEdit, decodeHistoryStep, encodeHistoryStep } from '../src/forge/history';

describe('Forge recipe plans use the existing layout and history', () => {
  it('placement.set changes one field a placement keeps, checked; a locked one, an unknown field or a bad value refused', () => {
    let l = planForgeLayout(emptyLayout({ kind: 'blank', library: 'floor' }), 'type.set', { type: 4 }, []);
    l = planForgeLayout(l, 'extraction.place', { at: [0, 0, 0] }, []);
    l = planForgeLayout(l, 'spawn.place', { team: 'A', at: [5, 0, 5] }, []);
    l = planForgeLayout(l, 'placement.set', { ref: 'xzone:0', field: 'width', value: 240 }, []);
    l = planForgeLayout(l, 'placement.set', { ref: 'xzone:0', field: 'name', value: 'Safety2' }, []);
    l = planForgeLayout(l, 'placement.set', { ref: 'spawn:0', field: 'team', value: 'B' }, []);
    expect(l.extractionZones![0]).toMatchObject({ name: 'Safety2', size: [240, 100] });
    expect(l.spawns[0]!.team).toBe('B');
    expect(() => planForgeLayout(l, 'placement.set', { ref: 'xzone:0', field: 'width', value: 0 }, [])).toThrow(/width/);
    expect(() => planForgeLayout(l, 'placement.set', { ref: 'xzone:0', field: 'name', value: 'bad/name' }, [])).toThrow(/name/);
    expect(() => planForgeLayout(l, 'placement.set', { ref: 'spawn:0', field: 'width', value: 1 }, [])).toThrow();
    let e = planForgeLayout(emptyLayout({ kind: 'blank', library: 'floor' }), 'type.set', { type: 4 }, []);
    e = planForgeLayout(e, 'hostage.place', { at: [1, 0, 1] }, []);
    e = planForgeLayout(e, 'placement.set', { ref: 'hostage:0', field: 'name', value: 'Doctor' }, []);
    e = planForgeLayout(e, 'placement.set', { ref: 'hostage:0', field: 'character', value: 'thai_wife' }, []);
    expect(e.hostages![0]).toMatchObject({ name: 'Doctor', character: 'thai_wife' });
    expect(() => planForgeLayout(e, 'placement.set', { ref: 'hostage:0', field: 'character', value: 'a b' }, [])).toThrow(/character/);
    // Another disc map's character: `<stem>:<character>` names its map (`source`); a bare one is the base's again.
    e = planForgeLayout(e, 'placement.set', { ref: 'hostage:0', field: 'character', value: 'MP6:mp_fem2' }, []);
    expect(e.hostages![0]).toMatchObject({ source: 'MP6', character: 'mp_fem2' });
    e = planForgeLayout(e, 'placement.set', { ref: 'hostage:0', field: 'character', value: 'thai_wife' }, []);
    expect(e.hostages![0]!.source).toBeUndefined();
    expect(() => planForgeLayout(e, 'placement.set', { ref: 'hostage:0', field: 'character', value: 'mp6:x' }, [])).toThrow(/character/);
    const locked = planForgeLayout(l, 'piece.lock', { refs: ['xzone:0'] }, []);
    expect(() => planForgeLayout(locked, 'placement.set', { ref: 'xzone:0', field: 'depth', value: 50 }, [])).toThrow(/locked/);
  });
  it("FP-1b (REVIEW-A 14): placed extraction zones are keyed xzone:<index>, a rules zone zone:<id> -- one key per kind", () => {
    let l = planForgeLayout(emptyLayout({ kind: 'blank', library: 'floor' }), 'type.set', { type: 4 }, []);
    l = planForgeLayout(l, 'extraction.place', { at: [0, 0, 0] }, []);
    // A rules zone whose authored id is "0" (`AUTHORED_ID` allows it): it no longer shares extraction zone 0's key.
    l = planForgeLayout(l, 'zone.place', { id: '0', shape: 'cylinder', at: [50, 0, 50], radius: 5, height: 3 }, []);
    l = planForgeLayout(l, 'piece.move', { refs: ['xzone:0'], delta: [1, 0, 0] }, []);
    expect(l.extractionZones![0]!.at).toEqual([1, 0, 0]);
    expect(l.zones![0]!.at).toEqual([50, 0, 50]);
    l = planForgeLayout(l, 'piece.move', { refs: ['zone:0'], delta: [0, 0, 1] }, []);
    expect(l.zones![0]!.at).toEqual([50, 0, 51]);
    expect(l.extractionZones![0]!.at).toEqual([1, 0, 0]);
    // A rules zone has no extraction zone's fields: refused by name, never a TypeError off a missing row.
    expect(() => planForgeLayout(l, 'placement.set', { ref: 'zone:0', field: 'width', value: 240 }, [])).toThrow(/zone:0 has no field to set/);
    expect(() => planForgeLayout(l, 'placement.set', { ref: 'zone:0', field: 'width', value: 240 }, [])).not.toThrow(TypeError);
  });
  it('a door is placed in any game type, Frostfire\'s bdoor_4 by default, its model set', () => {
    let l = planForgeLayout(emptyLayout({ kind: 'blank', library: 'floor' }), 'door.place', { at: [1, 0, 2], yaw: 0 }, []);
    expect(l.doors).toEqual([{ source: 'MP2', name: 'bdoor_4', at: [1, 0, 2], yaw: 0 }]);
    l = planForgeLayout(l, 'placement.set', { ref: 'door:0', field: 'model', value: 'MP2:wdoor_1' }, []);
    expect(l.doors![0]!.name).toBe('wdoor_1');
    // A gate and a C4 barrier: a disc map's access object copied (Death Trap's access1, Vigilance's access1 by default),
    // in any game type; moved, turned, its model set as a door's.
    let g = planForgeLayout(emptyLayout({ kind: 'blank', library: 'floor' }), 'gate.place', { at: [1, 2, 3], yaw: 0.5 }, []);
    g = planForgeLayout(g, 'barrier.place', { at: [4, 5, 6] }, []);
    expect([g.gates![0]!.source, g.gates![0]!.name, g.gates![0]!.at, g.gates![0]!.yaw]).toEqual(['MP11', 'access1', [1, 2, 3], 0.5]);
    expect([g.barriers![0]!.source, g.barriers![0]!.name]).toEqual(['MP51', 'access1']);
    g = planForgeLayout(g, 'placement.set', { ref: 'gate:0', field: 'model', value: 'MP62:access2' }, []);
    g = planForgeLayout(g, 'placement.set', { ref: 'barrier:0', field: 'model', value: 'MP61:access5' }, []);
    expect([g.gates![0]!.source, g.gates![0]!.name, g.barriers![0]!.source]).toEqual(['MP62', 'access2', 'MP61']);
    g = planForgeLayout(g, 'piece.move', { refs: ['gate:0'], delta: [1, 0, 0] }, []);
    expect(g.gates![0]!.at).toEqual([2, 2, 3]);
    // A piece's model (a ladder's Map and Ladder): its asset, `<archive>:<model>`; a pack's or a bad one refused.
    const p = planForgeLayout(planForgeLayout(emptyLayout({ kind: 'blank', library: 'floor' }), 'piece.place', { asset: 'MP73:ladder35', at: [0, 0, 0] }, []), 'placement.set', { ref: 'piece:0', field: 'model', value: 'MP82:ladder_guardtower1' }, []);
    expect(p.pieces[0]!.asset).toBe('MP82:ladder_guardtower1');
    expect(() => planForgeLayout(p, 'placement.set', { ref: 'piece:0', field: 'model', value: 'nope' }, [])).toThrow(/model/);
    expect(() => planForgeLayout(p, 'placement.set', { ref: 'piece:0', field: 'name', value: 'x' }, [])).toThrow(/piece/);
    const t = planForgeLayout(planForgeLayout(emptyLayout({ kind: 'blank', library: 'floor' }), 'turret.place', { at: [0, 0, 0] }, []), 'placement.set', { ref: 'turret:0', field: 'model', value: 'MP62:mp62MGLturret ' }, []);
    expect([t.turrets![0]!.source, t.turrets![0]!.name]).toEqual(['MP62', 'mp62MGLturret ']);   // the disc's spelling, its space kept
  });
  it('a turret is placed in any game type, Crossroads\' RMG by default, its model and lock set', () => {
    let l = planForgeLayout(emptyLayout({ kind: 'blank', library: 'floor' }), 'turret.place', { at: [1, 0, 2], yaw: 0.5 }, []);
    expect(l.turrets).toEqual([{ source: 'MP72', name: 'mp72_turret01', at: [1, 0, 2], yaw: 0.5 }]);
    l = planForgeLayout(l, 'placement.set', { ref: 'turret:0', field: 'model', value: 'MP72:mp72_turret02' }, []);
    expect(l.turrets![0]!.name).toBe('mp72_turret02');
    expect(() => planForgeLayout(l, 'placement.set', { ref: 'turret:0', field: 'model', value: 'bad' }, [])).toThrow(/model/);
  });
  it('a tactical point and a spectator view are placed in any game type, named Charlie and View1, their fields set', () => {
    let l = emptyLayout({ kind: 'blank', library: 'floor' });
    l = planForgeLayout(l, 'point.place', { at: [1, 0, 2] }, []);
    l = planForgeLayout(l, 'view.place', { at: [0, 50, 0], yaw: 90, pitch: -10 }, []);
    expect(l.tacPoints).toEqual([{ name: 'Charlie', kind: 1, at: [1, 0, 2] }]);
    expect(l.scenicViews).toEqual([{ name: 'View1', at: [0, 50, 0], yaw: 90, pitch: -10 }]);
    l = planForgeLayout(l, 'placement.set', { ref: 'point:0', field: 'name', value: 'Delta' }, []);
    l = planForgeLayout(l, 'placement.set', { ref: 'view:0', field: 'pitch', value: -30 }, []);
    expect([l.tacPoints![0]!.name, l.scenicViews![0]!.pitch]).toEqual(['Delta', -30]);
    expect(() => planForgeLayout(l, 'placement.set', { ref: 'point:0', field: 'kind', value: 40 }, [])).toThrow(/kind/);
  });
  it('an extraction zone is placed only on an Extraction layout, named Safety, then Safety2', () => {
    const blank = emptyLayout({ kind: 'blank', library: 'floor' });
    expect(() => planForgeLayout(blank, 'extraction.place', { at: [1, 0, 2] }, [])).toThrow(/Escort or Extraction/);
    expect(planForgeLayout(planForgeLayout(blank, 'type.set', { type: 3 }, []), 'extraction.place', { at: [0, 0, 0] }, []).extractionZones![0]!.name).toBe('Safety');
    let l = planForgeLayout(blank, 'type.set', { type: 4 }, []);
    l = planForgeLayout(l, 'extraction.place', { at: [1, 0, 2] }, []);
    l = planForgeLayout(l, 'extraction.place', { at: [50, 0, 2], size: [30, 40] }, []);
    expect(l.extractionZones).toEqual([{ name: 'Safety', at: [1, 0, 2], size: [100, 100] }, { name: 'Safety2', at: [50, 0, 2], size: [30, 40] }]);
  });
  it('a hostage is placed only on an Escort or Extraction layout', () => {
    const blank = emptyLayout({ kind: 'blank', library: 'floor' });
    expect(() => planForgeLayout(blank, 'hostage.place', { at: [1, 0, 2] }, [])).toThrow(/Escort or Extraction/);
    const extraction = planForgeLayout(blank, 'type.set', { type: 4 }, []);
    expect(planForgeLayout(extraction, 'hostage.place', { at: [1, 0, 2], yaw: 0 }, []).hostages).toEqual([{ p: [1, 0, 2], yaw: 0, name: 'Hostage1' }]);   // named as the disc names them
  });
  it('a bomb marker is placed only on a Demolition layout; any other type, or none, is refused', () => {
    const blank = emptyLayout({ kind: 'blank', library: 'floor' });
    expect(() => planForgeLayout(blank, 'bomb.place', { kind: 'start', at: [1, 0, 2] }, [])).toThrow(/Demolition/);
    const other = planForgeLayout(blank, 'type.set', { type: 5 }, []);
    expect(() => planForgeLayout(other, 'bomb.place', { kind: 'seal', at: [0, 0, 0] }, [])).toThrow(/Demolition/);
    const demolition = planForgeLayout(blank, 'type.set', { type: 2 }, []);
    expect(planForgeLayout(demolition, 'bomb.place', { kind: 'start', at: [1, 0, 2] }, []).objectives).toMatchObject({ gameType: 2, bomb: { start: [1, 0, 2] } });
  });
  it("Breach places the bomb start and the SEALs' site, as the page does; its Terrorists' site and Escort are refused", () => {
    const blank = emptyLayout({ kind: 'blank', library: 'floor' });
    const breach = planForgeLayout(blank, 'type.set', { type: 1 }, []);
    const started = planForgeLayout(breach, 'bomb.place', { kind: 'start', at: [1, 0, 2] }, []);
    expect(started.objectives).toMatchObject({ gameType: 1, bomb: { start: [1, 0, 2] } });
    expect(planForgeLayout(started, 'bomb.place', { kind: 'seal', at: [3, 0, 4] }, []).objectives?.bomb?.sites.map((s) => [s.team, s.at])).toEqual([[0, [3, 0, 4]]]);
    const code = (f: () => unknown): string | undefined => { try { f(); } catch (e) { return (e as { code?: string }).code; } return undefined; };
    expect(code(() => planForgeLayout(breach, 'bomb.place', { kind: 'terrorist', at: [0, 0, 0] }, []))).toBe('GAME_TYPE');
    expect(() => planForgeLayout(breach, 'bomb.place', { kind: 'terrorist', at: [0, 0, 0] }, [])).toThrow("The Terrorists' site plays no part in Breach; set the game type to Demolition to place it");
    const escort = planForgeLayout(blank, 'type.set', { type: 3 }, []);
    expect(code(() => planForgeLayout(escort, 'bomb.place', { kind: 'start', at: [0, 0, 0] }, []))).toBe('GAME_TYPE');
    const demolition = planForgeLayout(blank, 'type.set', { type: 2 }, []);
    expect(planForgeLayout(demolition, 'bomb.place', { kind: 'terrorist', at: [5, 0, 5] }, []).objectives?.bomb?.sites.map((s) => s.team)).toEqual([1]);
  });
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
