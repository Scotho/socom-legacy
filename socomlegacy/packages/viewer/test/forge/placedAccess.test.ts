import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import type { EffectProgram } from '@s2u/scene';
import { renamedProgram, worldPiecesUnder } from '../../src/forge/placedAccess';

/**
 * The layout's placed gates and C4 barriers (the owner, 2026-11-06; a browser adaptation, FG.R2): a copy of a disc map's
 * own access object -- its nodes, its collision, its intact parts and its wreck, its health and its death, the action
 * its death executes, and a gate's slide and lever -- moved and renamed whole, so a copy is its own object and never
 * the base map's (research 174 s3, 175 s5.3; `../../src/gates`, `../../src/sceneHealth`, `../../src/worldState`).
 */
describe('a copied program', () => {
  it('renames the nodes, valves, executed actions and called animations it names, and nothing else', () => {
    const p = {
      name: 'gate_openclose1', root: 3, flags: 0, nodes: ['NA', 'lever_1', 'gatehand', 'access1', 'gate_move1'],
      sequences: [{ name: 's', ops: [
        { op: 'if', conditions: [{ kind: 'valve', valve: 'set_access1', operation: 0, operand: 0 }, { kind: 'valve', valve: 'NA', operation: 0, operand: 0, context: true }] },
        { op: 'valve', valve: 'gate1', operation: 0, operand: 1 },
        { op: 'executeAction', anim: 'set_access1' },
        { op: 'call', anim: 'gateopen' },
        { op: 'call', anim: 'library_flash' },
        { op: 'endif' },
      ] }],
    } as unknown as EffectProgram;
    const q = renamedProgram(p, { nodes: { access1: 'forge_gate_1' }, valves: { set_access1: 'forge_gate_1_access1', gate1: 'forge_gate_1_lever1' }, anims: { gate_openclose1: 'forge_gate_1_gate_openclose1', gateopen: 'forge_gate_1_gateopen' } });
    expect(q.name).toBe('forge_gate_1_gate_openclose1');
    expect(q.nodes).toEqual(['NA', 'lever_1', 'gatehand', 'forge_gate_1', 'gate_move1']);
    const ops = q.sequences[0]!.ops as unknown as Record<string, unknown>[];
    expect((ops[0]!['conditions'] as { valve: string }[]).map((c) => c.valve)).toEqual(['forge_gate_1_access1', 'NA']);
    expect([ops[1]!['valve'], ops[2]!['anim'], ops[3]!['anim'], ops[4]!['anim']]).toEqual(['forge_gate_1_lever1', 'forge_gate_1_access1', 'forge_gate_1_gateopen', 'library_flash']);
    expect(p.nodes[3]).toBe('access1');                              // the disc's own untouched
  });
});

describe("a destructible drawn as the map's own geometry", () => {
  it("is its world chunks under its root, a piece a node and state, in world space, by its node's path", () => {
    const mesh = (switchPath: string | undefined, alternate: boolean, order: number) => ({ switchPath, alternate, order, textureName: 't' });
    const world = [
      mesh('worldmodel/truck', false, 5), mesh('worldmodel/truck', false, 3), mesh('worldmodel/truck/whats_left', true, 9),
      mesh('worldmodel/trucker', false, 1), mesh(undefined, false, 2), mesh('worldmodel/wall', false, 4),
    ];
    const pieces = worldPiecesUnder({ world } as never, 'worldmodel/truck');
    expect(pieces.map(({ prop, index }) => [prop.paths, prop.parts.length, prop.alternate, prop.order, index, prop.modelName])).toEqual([
      [['worldmodel/truck'], 2, false, 3, 0, 'truck (map geometry)'],
      [['worldmodel/truck/whats_left'], 1, true, 9, 0, 'whats_left (map geometry)'],
    ]);
    expect(Array.from(pieces[0]!.prop.matrices)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    expect(worldPiecesUnder({ world } as never, 'worldmodel/none')).toEqual([]);
  });
});

const ISO = process.env['SOCOM_ISO'];
describe.skipIf(!ISO || !existsSync(ISO))('placed gates and barriers on the disc (SOCOM_ISO)', () => {
  const disc = async () => {
    const { IsoAssetSource } = await import('@s2u/archive');
    const { fsBlob } = await import('../../../../tools/fmv-spike');
    const { loadMap } = await import('../../src/loadMap');
    const source = new IsoAssetSource(fsBlob(ISO!));
    return (stem: string) => loadMap(source, `RUN/${stem}.ZDB`);
  };

  it("lists a map's access objects: Vigilance's barriers, Death Trap's two gates", async () => {
    const { accessTemplates, accessTriggerOf } = await import('../../src/forge/placedAccess');
    const load = await disc();
    const mp51 = accessTemplates(await load('MP51'), 'MP51');
    expect(mp51.length).toBeGreaterThan(0);
    expect(mp51.every((t) => t.kind === 'barrier')).toBe(true);
    const mp11 = accessTemplates(await load('MP11'), 'MP11');
    expect(mp11.filter((t) => t.kind === 'gate').map((t) => t.name)).toEqual(['access1', 'access2']);
    // Every destructible (the owner, 2026-11-10): Desert Glory's, drawn as the map's own geometry, now its world chunks
    // (was: none, only drawn props and only deaths that run an action were offered).
    const mp6 = accessTemplates(await load('MP6'), 'MP6');
    expect(mp6.length).toBeGreaterThan(0);
    expect(mp6.some((t) => t.pieces.some(({ prop }) => prop.modelName.endsWith('(map geometry)')))).toBe(true);
    // A plank reading health 0 is a hit trigger, never a C4 target (research 174, 175 s5.4): offered since the owner's
    // 2026-11-07 ruling as a damage trigger of its own kind (`accessTriggerOf`); the barriers are C4's.
    const mp71 = accessTemplates(await load('MP71'), 'MP71');
    const planks = mp71.filter((t) => /plank/.test(t.name));
    for (const t of planks) expect(accessTriggerOf(t), t.name).toBe('hit');
    for (const t of [...mp51, ...mp11, ...mp71]) {
      expect(t.pieces.length, t.name).toBeGreaterThan(0);
      if (!/plank/.test(t.name)) expect(accessTriggerOf(t), t.name).toBe('c4');
    }
  }, 180_000);

  it("a barrier copied onto Frostfire starts whole, its wreck off; a blast kills it: its parts off, its wreck on; Frostfire's own untouched", async () => {
    const { accessTemplates, withPlacedAccess } = await import('../../src/forge/placedAccess');
    const { WorldState } = await import('../../src/worldState');
    const { groundGrid } = await import('../../src/mover');
    const load = await disc();
    const [mp2, mp51] = [await load('MP2'), await load('MP51')];
    const t = accessTemplates(mp51, 'MP51')[0]!;
    const { map, unplaced } = withPlacedAccess(mp2, [{ kind: 'barrier', source: 'MP51', name: t.name, at: [600, 142, 1300], yaw: 0 }], () => t);
    expect(unplaced).toBe(0);
    const root = 'worldmodel/forge_barrier_1';
    expect(map.meta!.instances.some((i) => i.path === root)).toBe(true);
    const world = new WorldState(map.meta!, map.ground!, groundGrid(map.ground!));
    world.applyInitial();
    const wrecks = map.meta!.initial.filter((e) => e.deactivate && e.path.startsWith(`${root}`)).map((e) => e.path);
    expect(wrecks.length).toBeGreaterThan(0);
    for (const p of wrecks) expect(world.isActive(p), p).toBe(false);
    const mine = map.meta!.scene!.destructibles.filter((d) => d.root.startsWith(root));
    expect(mine.length).toBeGreaterThan(0);
    const owner = map.ground!.owners.find((o) => o.path.startsWith(mine[0]!.targetPath) && world.isActive(o.path))!;
    const hit = world.health.hitAt(owner.path, { kind: 'explosion', rating: 100000, modifier: 1, point: [600, 150, 1300] });
    expect(hit.died).toBe(true);
    for (let i = 0; i < 300; i++) world.step(1 / 30);
    expect(wrecks.some((p) => world.isActive(p)), 'the wreck shows').toBe(true);
    expect(world.valve(`forge_barrier_1_access1`)).not.toBe(0);
    expect(mp2.meta!.scene!.destructibles.every((d) => !world.health.isSpent(d.id))).toBe(true);
  }, 240_000);

  it("a gate's switch is its disc lever apart: Death Trap's epanel_di1 plate (one polygon) and lever_1's gateswitch base and hand (research 174 s5)", async () => {
    const { accessTemplates } = await import('../../src/forge/placedAccess');
    const load = await disc();
    const t = accessTemplates(await load('MP11'), 'MP11').find((x) => x.kind === 'gate' && x.name === 'access1')!;
    const part = t.gate!.switches[0]!;
    expect(part.action).toMatchObject({ node: 'epanel_di1', type: 'SWITCH', bitmap: 'action_pull_lever.tif' });
    expect(part.handle).toBe('worldmodel/lever_1');
    expect(part.plate.flatMap((o) => o.polys)).toHaveLength(1);
    expect(part.pieces.map((p) => p.prop.modelName)).toEqual(['gateswitch', 'gateswitch']);
    expect(part.anchor[0]).toBeCloseTo(1128.0, 0);
    expect(part.anchor[2]).toBeCloseTo(419.9, 0);
  }, 240_000);

  it("a gate copied onto Frostfire has no lever of its own; its placed switch slides it; blown, the switch no longer moves it", async () => {
    const { accessTemplates, withPlacedAccess } = await import('../../src/forge/placedAccess');
    const { WorldState } = await import('../../src/worldState');
    const { GateSet } = await import('../../src/gates');
    const { groundGrid, groundPolygons } = await import('../../src/mover');
    const load = await disc();
    const [mp2, mp11] = [await load('MP2'), await load('MP11')];
    const t = accessTemplates(mp11, 'MP11').find((x) => x.kind === 'gate')!;
    const marker = { kind: 'gate' as const, source: 'MP11', name: t.name, at: [600, 142, 1300], yaw: 0 };
    // Alone: no lever, no SWITCH record of its own (the original's gate has no prompt: its levers are panels apart).
    const alone = withPlacedAccess(mp2, [marker], () => t).map;
    expect(alone.gates![alone.gates!.length - 1]!.levers).toEqual([]);
    expect(alone.meta!.actions.some((a) => a.path.startsWith('worldmodel/forge_gate_1') && a.type === 'SWITCH')).toBe(false);
    // With its switch, placed apart: the switch's own SWITCH record on its own plate, the gate's lever.
    const { map } = withPlacedAccess(mp2, [marker], () => t, [{ gate: 0, at: [640, 150, 1300], yaw: 0 }]);
    const gate = map.gates![map.gates!.length - 1]!;
    expect(gate.levers).toHaveLength(1);
    const sw = map.meta!.actions[gate.levers[0]!.action]!;
    expect(sw).toMatchObject({ node: 'forge_switch_1', path: 'worldmodel/forge_switch_1', type: 'SWITCH', valve: 'forge_switch_1_valve' });
    // Its record's place is `epanel_di1`'s node origin, 5.1 from the lever's on the disc ((1133, -95, 420) against
    // (1128, -87.3, 419.9)); the pick takes the plate's hit, not this place.
    expect(Math.hypot(sw.at[0] - 640, sw.at[2] - 1300)).toBeLessThan(8);
    expect(map.ground!.owners.some((o) => o.path === 'worldmodel/forge_switch_1/panel_di')).toBe(true);
    expect(map.props.filter((p) => (p.paths ?? []).some((x) => x.startsWith('worldmodel/forge_switch_1'))).length).toBe(2);
    expect(gate.path.startsWith('worldmodel/forge_gate_1/')).toBe(true);
    const world = new WorldState(map.meta!, map.ground!, groundGrid(map.ground!));
    world.applyInitial();
    const gates = new GateSet(map.gates!, map.ground!, {}, (name) => world.valve(name));
    const leaf = () => gate.owners.flatMap((o) => { const w = map.ground!.owners[o]!; return groundPolygons(map.ground!).slice(w.first, w.first + w.count).flatMap((p) => Array.from(p.points)); });
    const before = leaf();
    expect(gates.use(gate.levers[0]!.action)).toBe(true);
    for (let i = 0; i < 150; i++) gates.step(1 / 30);
    const moved = leaf().map((v, i) => Math.abs(v - before[i]!));
    expect(Math.max(...moved)).toBeGreaterThan(15);                    // the slide, about 20
    // Blown: the copy's own access valve set, and the next pull does not slide it.
    const access = map.meta!.actions.find((a) => a.valve === 'forge_gate_1_access1')!;
    expect(access).toBeDefined();
    expect(world.executeAction(access.valve)).toBe(true);
    for (let i = 0; i < 300; i++) world.step(1 / 30);
    const open = leaf();
    gates.use(gate.levers[0]!.action);
    for (let i = 0; i < 150; i++) gates.step(1 / 30);
    leaf().forEach((v, i) => expect(v).toBeCloseTo(open[i]!, 3));
  }, 240_000);
});

describe.skipIf(!ISO || !existsSync(ISO))('a switch running a map action (SOCOM_ISO)', () => {
  it("on Crossroads, a placed switch running seal_strike1 brings the SEAL arch down as the disc's own switch does (research 171 s4, 213 s4)", async () => {
    const { IsoAssetSource } = await import('@s2u/archive');
    const { fsBlob } = await import('../../../../tools/fmv-spike');
    const { loadMap } = await import('../../src/loadMap');
    const { accessTemplates, withPlacedAccess } = await import('../../src/forge/placedAccess');
    const { WorldState } = await import('../../src/worldState');
    const { groundGrid } = await import('../../src/mover');
    const { under } = await import('../../src/mapMeta');
    const source = new IsoAssetSource(fsBlob(ISO!));
    const [mp72, mp11] = [await loadMap(source, 'RUN/MP72.ZDB'), await loadMap(source, 'RUN/MP11.ZDB')];
    const look = accessTemplates(mp11, 'MP11').find((x) => x.kind === 'gate')!;
    // What a switch may run here: the two call strikes; not the tents (MPBOMB, the bomb's own) nor the doors.
    const { mapActionTargets } = await import('../../src/forge/placedAccess');
    const targets = mapActionTargets(mp72).map((a) => a.valve);
    expect(targets).toEqual(expect.arrayContaining(['seal_strike1', 'terrorist_strike1']));
    expect(mapActionTargets(mp72).some((a) => a.typeCode === 4 || a.typeCode === 0)).toBe(false);
    // Death Trap's gate levers are the gates' own, never a map action's.
    expect(mapActionTargets(mp11).some((a) => /^epanel_di/.test(a.node))).toBe(false);
    const { leverLook } = await import('../../src/forge/placedAccess');
    const lever = leverLook(look.gate!.switches[0]!, look.lib);
    const looks = (id: string) => (id === 'lever' ? lever : null);
    const { map, unplaced } = withPlacedAccess(mp72, [], () => null, [{ action: 'seal_strike1', at: [1000, 100, 1800], yaw: 0 }], looks);
    expect(unplaced).toBe(0);
    const sw = map.meta!.actions.find((a) => a.node === 'forge_switch_1')!;
    expect(sw).toMatchObject({ type: 'SWITCH', path: 'worldmodel/forge_switch_1', valve: 'forge_switch_1_valve' });
    expect(map.ground!.owners.some((o) => o.path === 'worldmodel/forge_switch_1/panel_di')).toBe(true);
    // A map action that is no action of the base is not placed.
    expect(withPlacedAccess(mp72, [], () => null, [{ action: 'no_such_valve', at: [0, 0, 0], yaw: 0 }], looks).unplaced).toBe(1);
    // Its record's fields are the target's own: Crossroads' switch's prompt, reach 30 and 2 points (research 171 s3).
    expect(sw).toMatchObject({ bitmap: 'action_pull_lever.tif', range: 30, elevation: -1, points: 2 });
    const world = new WorldState(map.meta!, map.ground!, groundGrid(map.ground!));
    world.applyInitial();
    const root = map.meta!.instances.find((i) => i.node === 'seal_demo_1')!.path;
    const healthy = map.meta!.initial.find((e) => under(e.path, root) && e.path.split(/[/=]/).pop() === 'healthy')?.path
      ?? map.meta!.instances.find((i) => under(i.path, root) && i.node === 'healthy')!.path;
    const destroyed = map.meta!.initial.find((e) => under(e.path, root) && e.path.split(/[/=]/).pop() === 'destroyed')!.path;
    expect([world.isActive(healthy), world.isActive(destroyed)]).toEqual([true, false]);
    expect(world.executeAction(sw.valve)).toBe(true);
    for (let i = 0; i < 90; i++) world.step(1 / 30);
    expect([world.isActive(healthy), world.isActive(destroyed)]).toEqual([false, true]);
  }, 240_000);
});

describe.skipIf(!ISO || !existsSync(ISO))("a switch's looks (SOCOM_ISO)", () => {
  it("the radio is Sujo's radio_portable whole (its model, its body's and its two plates' collision); a switch wears it, or the lever's plate alone, and takes its own prompt and reach over its action's", async () => {
    const { IsoAssetSource } = await import('@s2u/archive');
    const { fsBlob } = await import('../../../../tools/fmv-spike');
    const { loadMap } = await import('../../src/loadMap');
    const { accessTemplates, leverLook, radioLook, withPlacedAccess } = await import('../../src/forge/placedAccess');
    const source = new IsoAssetSource(fsBlob(ISO!));
    const [mp72, mp11, mp61] = [await loadMap(source, 'RUN/MP72.ZDB'), await loadMap(source, 'RUN/MP11.ZDB'), await loadMap(source, 'RUN/MP61.ZDB')];
    const radio = radioLook(mp61)!;
    expect(radio.pieces.map((p) => p.prop.modelName)).toEqual(['radio_portable']);
    expect(radio.owners.flatMap((o) => o.polys)).toHaveLength(8);
    expect(radio.record).toMatchObject({ bitmap: 'action_helo.tif', range: 30 });
    const t = accessTemplates(mp11, 'MP11').find((x) => x.kind === 'gate')!;
    const lever = leverLook(t.gate!.switches[0]!, t.lib);
    const plate = leverLook(t.gate!.switches[0]!, t.lib, true);
    const looks = (id: string) => (id === 'radio' ? radio : id === 'plate' ? plate : lever);
    const { map } = withPlacedAccess(mp72, [], () => null, [
      { action: 'seal_strike1', look: 'radio', prompt: 'action_helo.tif', range: 25, at: [1000, 100, 1800], yaw: 0 },
      { action: 'terrorist_strike1', look: 'plate', points: 5, at: [1100, 100, 1800], yaw: 0 },
    ], looks);
    const propsUnder = (root: string) => map.props.filter((p) => (p.paths ?? []).some((x) => x === root || x.startsWith(`${root}/`) || x.startsWith(`${root}=`))).map((p) => p.modelName);
    expect(propsUnder('worldmodel/forge_switch_1')).toEqual(['radio_portable']);
    expect(propsUnder('worldmodel/forge_switch_2')).toEqual([]);
    expect(map.ground!.owners.filter((o) => o.path.startsWith('worldmodel/forge_switch_1')).reduce((n, o) => n + o.count, 0)).toBe(8);
    expect(map.ground!.owners.some((o) => o.path.startsWith('worldmodel/forge_switch_2'))).toBe(true);
    const [one, two] = ['forge_switch_1', 'forge_switch_2'].map((n) => map.meta!.actions.find((a) => a.node === n)!);
    expect(one).toMatchObject({ bitmap: 'action_helo.tif', range: 25, points: 2 });    // its own prompt and reach, its target's points
    expect(two).toMatchObject({ bitmap: 'action_pull_lever.tif', range: 30, points: 5 });
  }, 240_000);
});

describe.skipIf(!ISO || !existsSync(ISO))("a switch's script (SOCOM_ISO)", () => {
  it("on Crossroads: one pull wrecks the layout's own Vigilance barrier, hides a map node and sets a flag; a toggle hides then shows", async () => {
    const { IsoAssetSource } = await import('@s2u/archive');
    const { fsBlob } = await import('../../../../tools/fmv-spike');
    const { loadMap } = await import('../../src/loadMap');
    const { accessTemplates, leverLook, withPlacedAccess, scriptFlagValve } = await import('../../src/forge/placedAccess');
    const { WorldState } = await import('../../src/worldState');
    const { groundGrid } = await import('../../src/mover');
    const source = new IsoAssetSource(fsBlob(ISO!));
    const [mp72, mp11, mp51] = [await loadMap(source, 'RUN/MP72.ZDB'), await loadMap(source, 'RUN/MP11.ZDB'), await loadMap(source, 'RUN/MP51.ZDB')];
    const gate = accessTemplates(mp11, 'MP11').find((x) => x.kind === 'gate')!;
    const barrier = accessTemplates(mp51, 'MP51')[0]!;
    const lever = leverLook(gate.gate!.switches[0]!, gate.lib);
    const node = mp72.meta!.instances.find((i) => i.node === 'seal_callstrike_1')!.path;
    const { map, unplaced } = withPlacedAccess(mp72, [{ kind: 'barrier', source: 'MP51', name: barrier.name, at: [1000, 100, 1700], yaw: 0 }], () => barrier, [
      { script: { steps: [{ do: 'run', barrier: 0 }, { do: 'hide', target: { map: node } }, { do: 'set', flag: 'power', value: 1 }] }, at: [1000, 100, 1800], yaw: 0 },
      { script: { steps: [{ do: 'show', target: { map: node } }] }, at: [1100, 100, 1800], yaw: 0 },
    ], () => lever);
    expect(unplaced).toBe(0);
    const [one, two] = ['forge_switch_1', 'forge_switch_2'].map((n) => map.meta!.actions.find((a) => a.node === n)!);
    const world = new WorldState(map.meta!, map.ground!, groundGrid(map.ground!));
    world.applyInitial();
    const wrecks = map.meta!.initial.filter((e) => e.deactivate && e.path.startsWith('worldmodel/forge_barrier_1')).map((e) => e.path);
    expect(world.isActive(node)).toBe(true);
    expect(world.executeAction(one!.valve)).toBe(true);
    for (let i = 0; i < 300; i++) world.step(1 / 30);
    expect(wrecks.some((p) => world.isActive(p)), 'the barrier wrecked').toBe(true);
    // Its own death ran (FORGE_SCRIPT_WRECK_ADAPTATION): the record spent, so a later blast does not run it again.
    const mine = map.meta!.scene!.destructibles.filter((d) => d.root.startsWith('worldmodel/forge_barrier_1') && d.wreck);
    expect(mine.length).toBeGreaterThan(0);
    for (const d of mine) expect(world.health.isSpent(d.id)).toBe(true);
    expect(world.isActive(node)).toBe(false);
    expect(world.valve(scriptFlagValve('power'))).toBe(1);
    // The second switch shows it again.
    expect(world.executeAction(two!.valve)).toBe(true);
    for (let i = 0; i < 30; i++) world.step(1 / 30);
    expect(world.isActive(node)).toBe(true);
  }, 240_000);
});

describe.skipIf(!ISO || !existsSync(ISO))("a switch's wreck of a trigger from another map (SOCOM_ISO)", () => {
  it("Desert Glory's triggers copied onto Frostfire: a pull runs each one's own death -- spent, its parts changed -- with no map action of its own needed", async () => {
    const { IsoAssetSource } = await import('@s2u/archive');
    const { fsBlob } = await import('../../../../tools/fmv-spike');
    const { loadMap } = await import('../../src/loadMap');
    const { accessTemplates, leverLook, withPlacedAccess } = await import('../../src/forge/placedAccess');
    const { WorldState } = await import('../../src/worldState');
    const { groundGrid } = await import('../../src/mover');
    const source = new IsoAssetSource(fsBlob(ISO!));
    const [mp2, mp6, mp11] = [await loadMap(source, 'RUN/MP2.ZDB'), await loadMap(source, 'RUN/MP6.ZDB'), await loadMap(source, 'RUN/MP11.ZDB')];
    const gate = accessTemplates(mp11, 'MP11').find((x) => x.kind === 'gate')!;
    const triggers = accessTemplates(mp6, 'MP6').filter((t) => t.kind === 'barrier');
    expect(triggers.length).toBeGreaterThan(0);
    for (const t of triggers) {
      const { map, unplaced } = withPlacedAccess(mp2, [{ kind: 'barrier', source: 'MP6', name: t.name, at: [600, 142, 1300], yaw: 0 }], () => t,
        [{ script: { steps: [{ do: 'run', barrier: 0 }] }, at: [700, 142, 1300], yaw: 0 }], () => leverLook(gate.gate!.switches[0]!, gate.lib));
      expect(unplaced, t.name).toBe(0);
      const world = new WorldState(map.meta!, map.ground!, groundGrid(map.ground!));
      world.applyInitial();
      const sw = map.meta!.actions.find((a) => a.node === 'forge_switch_1')!;
      const mine = map.meta!.scene!.destructibles.filter((d) => d.wreck === 'forge_barrier_1_wreck');
      expect(mine.length, t.name).toBeGreaterThan(0);
      const paths = map.meta!.instances.filter((i) => i.path.startsWith('worldmodel/forge_barrier_1')).map((i) => i.path);
      const before = paths.map((p) => world.isActive(p));
      expect(world.executeAction(sw.valve), t.name).toBe(true);
      for (let i = 0; i < 300; i++) world.step(1 / 30);
      for (const d of mine) expect(world.health.isSpent(d.id), t.name).toBe(true);
      expect(paths.map((p) => world.isActive(p)), `${t.name}: its death changed its parts`).not.toEqual(before);
      // Its death's called programs are its own copies, not Frostfire's (`calledOf`).
      for (const p of map.meta!.scene!.programs) if (p.program.name.startsWith('forge_barrier_1_')) expect(mp2.meta!.scene!.programs.some((q) => q.program.name === p.program.name)).toBe(false);
    }
  }, 600_000);
});

describe.skipIf(!ISO || !existsSync(ISO))("a placed lever's prompt (SOCOM_ISO)", () => {
  it("stood on Frostfire's floor: its handle LEVER_MOUNT_HEIGHT_READING up, reach FORGE_SWITCH_REACH -- the prompt from 2 m in front; none from behind (front faces only)", async () => {
    const { IsoAssetSource } = await import('@s2u/archive');
    const { fsBlob } = await import('../../../../tools/fmv-spike');
    const { loadMap } = await import('../../src/loadMap');
    const { accessTemplates, leverLook, withPlacedAccess, FORGE_SWITCH_REACH, LEVER_MOUNT_HEIGHT_READING } = await import('../../src/forge/placedAccess');
    const { groundGrid } = await import('../../src/mover');
    const { actionRayDetail } = await import('../../src/equipment');
    const { actionReachNote } = await import('../../src/mapActions');
    const source = new IsoAssetSource(fsBlob(ISO!));
    const [mp2, mp11] = [await loadMap(source, 'RUN/MP2.ZDB'), await loadMap(source, 'RUN/MP11.ZDB')];
    const gate = accessTemplates(mp11, 'MP11').find((x) => x.kind === 'gate' && x.name === 'access1')!;
    const at = [...mp2.slots[0]!.position] as [number, number, number];
    const { map } = withPlacedAccess(mp2, [], () => null, [{ script: { steps: [] }, at, yaw: 0 }], () => leverLook(gate.gate!.switches[0]!, gate.lib));
    const grid = groundGrid(map.ground!);
    expect(map.meta!.actions.find((a) => a.node === 'forge_switch_1')!.range).toBe(FORGE_SWITCH_REACH);
    const handle = [at[0], at[1] + LEVER_MOUNT_HEIGHT_READING, at[2]];
    const from = (dz: number) => {
      const feet = [at[0], at[1], at[2] + dz], eye = [feet[0]!, feet[1]! + 17, feet[2]!];
      const d = actionRayDetail(grid, eye, eye.map((v, i) => v + (handle[i]! - v) * 3), map.meta!.actions);
      return d.pick ? actionReachNote(map.meta!.actions, d.pick, feet).why : 'none';
    };
    expect(from(20)).toBe('ok');
    expect(from(-20)).toBe('none');
  }, 240_000);
});

describe.skipIf(!ISO || !existsSync(ISO))("a switch on a prop (SOCOM_ISO)", () => {
  it("on Frostfire's deck_3: its record on the deck's own path, no look copied; aiming at the deck gives the prompt", async () => {
    const { IsoAssetSource } = await import('@s2u/archive');
    const { fsBlob } = await import('../../../../tools/fmv-spike');
    const { loadMap } = await import('../../src/loadMap');
    const { accessTemplates, leverLook, withPlacedAccess } = await import('../../src/forge/placedAccess');
    const { groundGrid, groundPolygons } = await import('../../src/mover');
    const { actionRayDetail } = await import('../../src/equipment');
    const { actionReachNote } = await import('../../src/mapActions');
    const source = new IsoAssetSource(fsBlob(ISO!));
    const [mp2, mp11] = [await loadMap(source, 'RUN/MP2.ZDB'), await loadMap(source, 'RUN/MP11.ZDB')];
    const gate = accessTemplates(mp11, 'MP11').find((x) => x.kind === 'gate' && x.name === 'access1')!;
    const node = 'worldmodel/deck_3';
    const { map, unplaced } = withPlacedAccess(mp2, [], () => null, [{ script: { steps: [] }, node, at: [0, 0, 0], yaw: 0 }], () => leverLook(gate.gate!.switches[0]!, gate.lib));
    expect(unplaced).toBe(0);
    expect(map.meta!.actions.find((a) => a.node === 'forge_switch_1')).toBeUndefined();   // no look copied
    expect(map.meta!.actions.find((a) => a.path === node)).toMatchObject({ type: 'SWITCH', node: 'deck_3' });
    const grid = groundGrid(map.ground!);
    let ok = 0;
    for (const q of groundPolygons(map.ground!).filter((p) => p.path.startsWith(node))) {
      const n = q.points.length / 3, c = [0, 1, 2].map((a) => { let s = 0; for (let k = 0; k < n; k++) s += q.points[k * 3 + a]!; return s / n; });
      for (const side of [1, -1]) for (const [dx, dz] of [[15, 0], [0, 15]]) {
        const eye = [c[0]! + side * dx!, c[1]! + 2, c[2]! + side * dz!], far = eye.map((v, i) => v + (c[i]! - v) * 3);
        const d = actionRayDetail(grid, eye, far, map.meta!.actions);
        if (d.pick && actionReachNote(map.meta!.actions, d.pick, [eye[0]!, eye[1]! - 17, eye[2]!]).why === 'ok') ok++;
      }
    }
    expect(ok).toBeGreaterThan(0);
  }, 240_000);
});

describe.skipIf(!ISO || !existsSync(ISO))("a prop made a damage trigger (SOCOM_ISO)", () => {
  it("with Vigilance access1's numbers: a satchel is taken at the prop (not one below its shield); a blast kills it, hides the prop and runs its script", async () => {
    const { IsoAssetSource } = await import('@s2u/archive');
    const { fsBlob } = await import('../../../../tools/fmv-spike');
    const { loadMap } = await import('../../src/loadMap');
    const { accessTemplates, withPlacedAccess } = await import('../../src/forge/placedAccess');
    const { WorldState } = await import('../../src/worldState');
    const { groundGrid } = await import('../../src/mover');
    const source = new IsoAssetSource(fsBlob(ISO!));
    const [mp2, mp51] = [await loadMap(source, 'RUN/MP2.ZDB'), await loadMap(source, 'RUN/MP51.ZDB')];
    const tpl = accessTemplates(mp51, 'MP51').find((t) => t.name === 'access1')!;
    const d = tpl.destructibles.find((x) => x.root === tpl.root && x.health > 0)!;
    // A Frostfire object's own collision stands in for a placed prop's (`forge/piece_N`): solid, no destructible of its own.
    const dest = mp2.meta!.scene!.destructibles.map((x) => x.targetPath);
    const prop = mp2.ground!.owners.find((o) => o.path.startsWith('worldmodel/') && o.count > 4 && !dest.some((p) => o.path.startsWith(p)))!.path;
    const { map, unplaced } = withPlacedAccess(mp2, [], () => null, [], () => null, () => prop,
      [{ piece: 0, health: d.health, armor: d.armor, shield: d.shield, script: { steps: [{ do: 'message', text: 'BOOM' }] } }]);
    expect(unplaced).toBe(0);
    const said: [string, number | undefined][] = [];
    const world = new WorldState(map.meta!, map.ground!, groundGrid(map.ground!), { message: (t, c) => said.push([t, c]) });
    world.applyInitial();
    expect(world.health.c4TargetAt(prop, d.shield)).not.toBeNull();
    expect(world.health.c4TargetAt(prop, d.shield - 1)).toBeNull();
    expect(world.health.hitAt(prop, { kind: 'explosion', rating: 100000, modifier: 1, point: [0, 0, 0] }).died).toBe(true);
    for (let i = 0; i < 60; i++) world.step(1 / 30);
    expect(world.isActive(prop)).toBe(false);
    expect(said).toEqual([['BOOM', undefined]]);
  }, 240_000);
});

describe.skipIf(!ISO || !existsSync(ISO))("a switch's message (SOCOM_ISO)", () => {
  it("a script's message reaches the world's message hook on a press, after its wait; a joiner's replay posts none", async () => {
    const { IsoAssetSource } = await import('@s2u/archive');
    const { fsBlob } = await import('../../../../tools/fmv-spike');
    const { loadMap } = await import('../../src/loadMap');
    const { accessTemplates, leverLook, withPlacedAccess } = await import('../../src/forge/placedAccess');
    const { WorldState } = await import('../../src/worldState');
    const { groundGrid } = await import('../../src/mover');
    const source = new IsoAssetSource(fsBlob(ISO!));
    const [mp72, mp11] = [await loadMap(source, 'RUN/MP72.ZDB'), await loadMap(source, 'RUN/MP11.ZDB')];
    const gate = accessTemplates(mp11, 'MP11').find((x) => x.kind === 'gate')!;
    const { map } = withPlacedAccess(mp72, [], () => null, [
      { script: { steps: [{ do: 'wait', seconds: 1 }, { do: 'message', text: 'AIRSTRIKE INBOUND' }] }, at: [1000, 100, 1800], yaw: 0 },
    ], () => leverLook(gate.gate!.switches[0]!, gate.lib));
    const said: string[] = [];
    const world = new WorldState(map.meta!, map.ground!, groundGrid(map.ground!), { message: (t) => said.push(t) });
    world.applyInitial();
    const sw = map.meta!.actions.find((a) => a.node === 'forge_switch_1')!;
    expect(world.executeAction(sw.valve, false, true)).toBe(true);
    for (let i = 0; i < 15; i++) world.step(1 / 30);
    expect(said).toEqual([]);                                          // still waiting
    for (let i = 0; i < 30; i++) world.step(1 / 30);
    expect(said).toEqual(['AIRSTRIKE INBOUND']);
    world.reset();
    expect(world.executeAction(sw.valve, true)).toBe(true);            // silent: a joiner's replay
    for (let i = 0; i < 60; i++) world.step(1 / 30);
    expect(said).toEqual(['AIRSTRIKE INBOUND']);
  }, 240_000);
});
