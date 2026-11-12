import { describe, expect, it } from 'vitest';
import { placeRefs } from '../../src/sceneHealth';
import { scriptPrograms } from '../../src/forge/placedAccess';

/**
 * A switch's script (the owner, 2026-11-08; a browser adaptation, FG.R2): its steps made one of the engine's own programs
 * (`@s2u/scene` `EffectProgram`), run by the world as the disc's are (`../../src/worldState`).
 */
describe('a script reference by path', () => {
  it("a reference holding a path ('/') is that path, the root's too; a disc name is looked up as before", () => {
    const meta = { instances: [{ id: 0, path: 'worldmodel/a', node: 'a', modelName: 'worldmodel', root: 'worldmodel/a' }] };
    expect(placeRefs(meta, ['NA', 'worldmodel/forge_switch_1', 'forge/piece_3', 'a'], [0, 0, 0, 0], 1, null)).toEqual([null, 'worldmodel/forge_switch_1', 'forge/piece_3', 'worldmodel/a']);
  });
});

describe('scriptPrograms', () => {
  const resolve = {
    target: (t: { map?: string; piece?: number; barrier?: number; gate?: number; object?: number }) => t.map ?? (t.piece !== undefined ? `forge/piece_${t.piece}` : t.barrier !== undefined ? `worldmodel/forge_barrier_${t.barrier + 1}` : null),
    barrierValve: (i: number) => `forge_barrier_${i + 1}_wreck`,
    action: (v: string) => (v === 'seal_strike1' ? 'seal_strike1' : null),
  };
  const ops = (p: { sequences: { ops: unknown[] }[] }) => p.sequences[0]!.ops;

  it('each step its command; the switch its root, so a sound or an effect with no place is at it', () => {
    const { main, extra } = scriptPrograms('forge_switch_1', 'worldmodel/forge_switch_1', {
      steps: [
        { do: 'message', text: 'INBOUND' }, { do: 'wait', seconds: 2 }, { do: 'run', action: 'seal_strike1' }, { do: 'run', barrier: 0 },
        { do: 'hide', target: { piece: 3 } }, { do: 'show', target: { map: 'worldmodel/x' } },
        { do: 'sound', name: '.EXP_1' }, { do: 'effect', name: 'fire_explode_med', at: { map: 'worldmodel/x' } },
        { do: 'set', flag: 'power', value: 1 }, { do: 'if', flag: 'power', equals: 1 }, { do: 'else' }, { do: 'end' },
      ],
    }, resolve);
    expect(main.nodes).toEqual(['NA', 'worldmodel/forge_switch_1', 'forge/piece_3', 'worldmodel/x']);
    expect(main.root).toBe(1);
    expect(ops(main)).toEqual([
      { op: 'message', text: 'INBOUND', locId: null, scale: 1 },
      { op: 'wait', seconds: 2, range: 0, frames: null },
      { op: 'executeAction', anim: 'seal_strike1' },
      { op: 'executeAction', anim: 'forge_barrier_1_wreck' },
      { op: 'active', node: 2, on: false },
      { op: 'active', node: 3, on: true },
      { op: 'sound', sound: '.EXP_1', node: 1, volume: 1, newPlay: true },
      { op: 'call', anim: 'forge_switch_1_fx1' },
      { op: 'valve', valve: 'forge_flag_power', operation: 0x0b, operand: 1 },
      { op: 'if', conditions: [{ kind: 'valve', valve: 'forge_flag_power', operation: 2, operand: 1 }] },
      { op: 'else' },
      { op: 'endif' },
    ]);
    // The effect at its own place: a program of its own rooted there, calling the common effect (`call` at the root).
    expect(extra).toHaveLength(1);
    expect(extra[0]).toMatchObject({ name: 'forge_switch_1_fx1', nodes: ['NA', 'worldmodel/x'], root: 1 });
    expect(ops(extra[0]!)).toEqual([{ op: 'call', anim: 'fire_explode_med' }]);
  });

  it("an explosion is MPBOMB's FIRE_WEAPON at its place, as Crossroads' bridges fire theirs: the round's fuse and second timer, no numbers of its own", () => {
    const { main } = scriptPrograms('forge_switch_1', 'worldmodel/forge_switch_1', { steps: [{ do: 'blast' }, { do: 'blast', at: { piece: 2 } }, { do: 'blast', at: { gate: 0 } }] }, resolve);
    expect(ops(main)).toEqual([
      { op: 'fireWeapon', weapon: 'MPBOMB', ammo: 'MPBOMB Ammo', node: 1, f1: 0.001, f2: 0.01, forge: true },
      { op: 'fireWeapon', weapon: 'MPBOMB', ammo: 'MPBOMB Ammo', node: 2, f1: 0.001, f2: 0.01, forge: true },
    ]);
    expect(main.nodes).toEqual(['NA', 'worldmodel/forge_switch_1', 'forge/piece_2']);
  });

  it("a message is the window's own, as the round start's", () => {
    const { main } = scriptPrograms('forge_switch_1', 'worldmodel/forge_switch_1', { steps: [{ do: 'message', text: 'PLAIN' }] }, resolve);
    expect(ops(main)).toEqual([{ op: 'message', text: 'PLAIN', locId: null, scale: 1 }]);
  });

  it('a step whose object or action is not here is left out', () => {
    const { main } = scriptPrograms('s', 'worldmodel/s', { steps: [{ do: 'run', action: 'nope' }, { do: 'hide', target: { gate: 0 } }] }, resolve);
    expect(ops(main)).toEqual([]);
  });
});

describe('withPieceInstances', () => {
  it("each piece's owner path a placed node after the map's, once; a map without metadata as it is", async () => {
    const { withPieceInstances } = await import('../../src/forge/placedAccess');
    const meta = { stem: 'x', actions: [], instances: [{ id: 0, path: 'worldmodel/a', node: 'a', modelName: 'worldmodel', root: 'worldmodel/a' }], instanceByPath: new Map([['worldmodel/a', 0]]), initial: [], diagnostics: [] };
    const map = { meta } as unknown as Parameters<typeof withPieceInstances>[0];
    const out = withPieceInstances(map, ['forge/piece_2', 'forge/piece_5', 'forge/piece_2']);
    expect(out.meta!.instances.map((i) => [i.id, i.path, i.node])).toEqual([[0, 'worldmodel/a', 'a'], [1, 'forge/piece_2', 'piece_2'], [2, 'forge/piece_5', 'piece_5']]);
    expect(out.meta!.instanceByPath.get('forge/piece_5')).toBe(2);
    expect(meta.instances).toHaveLength(1);                            // the map's own untouched
    const bare = {} as Parameters<typeof withPieceInstances>[0];
    expect(withPieceInstances(bare, ['forge/piece_0'])).toBe(bare);
  });
});
