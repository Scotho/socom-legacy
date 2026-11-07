import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import type { EffectProgram } from '@s2u/scene';
import { renamedProgram } from '../../src/forge/placedAccess';

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
    const { accessTemplates } = await import('../../src/forge/placedAccess');
    const load = await disc();
    const mp51 = accessTemplates(await load('MP51'), 'MP51');
    expect(mp51.length).toBeGreaterThan(0);
    expect(mp51.every((t) => t.kind === 'barrier')).toBe(true);
    const mp11 = accessTemplates(await load('MP11'), 'MP11');
    expect(mp11.filter((t) => t.kind === 'gate').map((t) => t.name)).toEqual(['access1', 'access2']);
    // Only what a copy can show and C4 can take: drawn props of its own (Desert Glory's wall is the map's geometry),
    // and a health above 0 (a plank reading 0 is a hit trigger, never a C4 target: research 174).
    expect(accessTemplates(await load('MP6'), 'MP6')).toEqual([]);
    const mp71 = accessTemplates(await load('MP71'), 'MP71');
    expect(mp71.some((t) => /plank/.test(t.name))).toBe(false);
    for (const t of [...mp51, ...mp11, ...mp71]) {
      expect(t.pieces.length, t.name).toBeGreaterThan(0);
      expect(t.destructibles.some((d) => d.health > 0), t.name).toBe(true);
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

  it("a gate copied onto Frostfire slides on its lever; blown, its lever no longer moves it", async () => {
    const { accessTemplates, withPlacedAccess } = await import('../../src/forge/placedAccess');
    const { WorldState } = await import('../../src/worldState');
    const { GateSet } = await import('../../src/gates');
    const { groundGrid, groundPolygons } = await import('../../src/mover');
    const load = await disc();
    const [mp2, mp11] = [await load('MP2'), await load('MP11')];
    const t = accessTemplates(mp11, 'MP11').find((x) => x.kind === 'gate')!;
    const { map } = withPlacedAccess(mp2, [{ kind: 'gate', source: 'MP11', name: t.name, at: [600, 142, 1300], yaw: 0 }], () => t);
    const gate = map.gates![map.gates!.length - 1]!;
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
