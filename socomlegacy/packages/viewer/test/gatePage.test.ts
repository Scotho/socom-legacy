import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EffectOp, EffectProgram, GridParams, WorldPoly } from '@s2u/scene';
import { ActionPage, type ActionPageDeps } from '../src/actionPage';
import { PHASE_REST } from '../src/doors';
import { GatePage } from '../src/gatePage';
import { GateSet, leadIns, type GateHandle, type GateSpec } from '../src/gates';
import { ACTION_TYPE_CODES, type MapAction } from '../src/mapActions';
import type { MapInstance, MapMeta } from '../src/mapMeta';
import { groundGrid, packGround } from '../src/mover';
import type { DoorWire } from '../src/net/protocol';
import type { SceneDestructible } from '../src/sceneHealth';
import { bareMeta, WorldState } from '../src/worldState';

/**
 * MAP-07 on the page (`../src/gatePage`): the hook's view of the lever gates (`__viewer.gates()`, a test instrument: the
 * e2e `enowapiGate.spec.ts` reads it) -- each gate's node, path and the offset the page draws, following the room's
 * door tail. No program runs here.
 */

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function rig(): { page: GatePage; wire: { doors: DoorWire[] } } {
  const params: GridParams = { atomCount: 256, posts: 4, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -100, originZ: -100 };
  const poly: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/access2/gate_move2', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([0, 0, 40, 0, 30, 40, 8, 30, 40, 8, 0, 40]),
  };
  const sweep = { minX: -40, maxX: 40, minZ: -40, maxZ: 80 };
  const ground = packGround(params, [poly], [{ modelName: 'worldmodel', path: poly.path, first: 0, count: 1, sweep }]);
  const gate: GateSpec = {
    index: 0, node: 'gate_move2', path: poly.path, local: IDENTITY, parent: IDENTITY, owners: [0], sweep,
    open: [0, 35, 0], seconds: 3, levers: [],
  };
  const wire = { doors: [] as DoorWire[] };
  const page = new GatePage({ move: () => {}, net: () => ({ doors: () => wire.doors }) });
  page.setMap([gate], ground, 1);
  return { page, wire };
}

describe("the page's lever gates (MAP-07)", () => {
  it('stats names each gate and the offset drawn, shut at first and at the open end once the room says so', () => {
    const { page, wire } = rig();
    expect(page.stats()).toEqual([{ node: 'gate_move2', path: 'worldmodel/access2/gate_move2', offset: [0, 0, 0] }]);
    wire.doors = [{ valve: 0, phase: 255 }, { valve: 1, phase: 255 }];   // a door ahead of the gate, then the gate open
    page.frame(1 / 60);
    expect(page.stats()[0]!.offset).toEqual([0, 35, 0]);
  });

  it('stats is empty on a map without gates', () => {
    const page = new GatePage({ move: () => {}, net: () => null });
    page.setMap(undefined, undefined, 0);
    expect(page.stats()).toEqual([]);
  });
});

/**
 * LATER 307 (research 174 s5.1, 175 s5.3; reading, pending review): the room broadcasts a taken lever pull as every
 * switch's `action`, and the page runs that lever's program as presentation (PF.R26) -- its sounds through the world's
 * run, its handles' turns here (`GatePage.present`) -- and never the leaf's translation: the leaf stays the room's pose.
 * A synthetic lever in Death Trap's and Enowapi's shape (the disc's, `gateLever.devdisc.test.ts`): flip, wait 0.24 s,
 * `.SWITCH_SMALL` at the handle, the related lever's handle turned (`relatedopen` / `relatedclose`), the handle's own
 * 0.5 s turn (flags 0x60), then the leaf's slide and its sound only while `set_access1` is 0.
 */
describe('LATER 307: the lever program presented on the page', () => {
  type Q = [number, number, number, number];
  const Q0: Q = [0, 0, 0, 1];
  const Q1: Q = [-0.7660444378852844, 0, 0, 0.6427876353263855];   // -100 degrees about X
  const turn = (node: number, from: Q, to: Q): EffectOp => ({
    op: 'fromTo', node, flags: 0x60, seconds: 0.5, from: [0, 0, 0], to: [0, 0, 0], rotation: { from, to },
  });
  const slide = (y: number): EffectOp => ({
    op: 'fromTo', node: 4, flags: 9, seconds: 3, from: [0, 0, 0], to: [0, 0, y], translation: { from: null, to: [0, y, 0], rate: [0, y / 3, 0] },
  });
  const sound = (name: string, node: number): EffectOp => ({ op: 'sound', sound: name, node, volume: 1, flags: 130, newPlay: true });
  const set = (operand: number): EffectOp => ({ op: 'valve', valve: 'NA', operation: 0x0b, operand, context: true });
  const wait: EffectOp = { op: 'wait', seconds: 0.24, range: 0, frames: null };
  // LATER 1381: the presser's `ai::ANIMATE` (type 281, waits 0 / 0) heads each branch, as on the disc.
  const presser: EffectOp = { op: 'aiAnimate', type: 281, prewait: 0, postwait: 0, blocking: false, select: 0 };
  const free: EffectOp = { op: 'if', conditions: [{ kind: 'valve', valve: 'set_access1', operation: 2, operand: 0 }] };
  const program: EffectProgram = {
    name: 'gate_openclose1', root: 1, flags: 34, nodes: ['NA', 'lever_1', 'gatehand', 'access1', 'gate_move1', 'lever_2', 'gatehand'],
    sequences: [
      { name: 'NA', activation: 1, ops: [
        { op: 'if', conditions: [{ kind: 'valve', valve: 'NA', operation: 2, operand: 0, context: true }] },
        presser, set(1), wait, sound('.SWITCH_SMALL', 2), { op: 'callSequence', sequence: 'relatedopen' }, turn(2, Q0, Q1),
        free, { op: 'callSequence', sequence: 'gateopen' }, { op: 'endif' },
        { op: 'else' },
        presser, set(0), wait, sound('.SWITCH_SMALL', 2), { op: 'callSequence', sequence: 'relatedclose' }, turn(2, Q1, Q0),
        free, { op: 'callSequence', sequence: 'gateclose' }, { op: 'endif' },
        { op: 'endif' },
      ] },
      { name: 'gateopen', activation: 2, ops: [sound('.WOOD_DR_SLD_OP', 4), slide(35)] },
      { name: 'relatedopen', activation: 2, ops: [turn(6, Q0, Q1)] },
      { name: 'gateclose', activation: 2, ops: [sound('.WOOD_DR_SLD_CL', 4), slide(-35)] },
      { name: 'relatedclose', activation: 2, ops: [turn(6, Q1, Q0)] },
    ],
  };
  const HAND1 = 'worldmodel/lever_1/gateswitch=gateswitch/gatehand', HAND2 = 'worldmodel/lever_2/gateswitch=gateswitch/gatehand';
  const LEAF = 'worldmodel/access1/gate_move1';

  const rig2 = () => {
    const params: GridParams = { atomCount: 256, posts: 4, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -100, originZ: -100 };
    const poly: WorldPoly = {
      modelName: 'worldmodel', path: LEAF, region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
      points: Float32Array.from([0, 0, 40, 0, 30, 40, 8, 30, 40, 8, 0, 40]),
    };
    const sweep = { minX: -40, maxX: 40, minZ: -40, maxZ: 80 };
    const ground = packGround(params, [poly], [{ modelName: 'worldmodel', path: LEAF, first: 0, count: 1, sweep }]);
    const lever: MapAction = {
      node: 'epanel_di1', type: 'SWITCH', typeCode: ACTION_TYPE_CODES.SWITCH!, valve: 'gate1', anims: ['gate_openclose1'],
      team: null, range: 15, elevation: -1, points: 0, bitmap: '', path: 'worldmodel/epanel_di1', at: [0, 0, 0],
    };
    const paths = ['worldmodel/epanel_di1', 'worldmodel/lever_1', HAND1, 'worldmodel/lever_2', HAND2, 'worldmodel/access1', LEAF];
    const instances: MapInstance[] = paths.map((path, id) => ({ id, path, node: path.split('/').pop()!.split('=').pop()!, modelName: 'worldmodel', root: path }));
    // The destructible whose death executes `set_access1` (the disc's `access1`: EXECUTE_ACTION set_access1).
    const access: SceneDestructible = {
      id: 0, key: 'access1#0@worldmodel/access1', anim: 'access1', instance: 5, targetPath: LEAF, health: 1, armor: 0, shield: 17,
      program: { name: 'access1', root: 0, flags: 3, nodes: ['NA'], sequences: [{ name: 'NA', activation: 1, ops: [{ op: 'executeAction', anim: 'set_access1' }] }] },
      root: 'worldmodel/access1', nodes: [null],
    };
    const meta: MapMeta = {
      ...bareMeta('MP11'), actions: [lever], instances, instanceByPath: new Map(instances.map((i) => [i.path, i.id])),
      scene: { destructibles: [access], programs: [{ program, search: [0, 0, 1, 0, 0, 0, 0], parents: [0, 0, 0, 0, 3, 0, 5] }] },
    };
    const sounds: { name: string; path: string | null }[] = [];
    const world = new WorldState(meta, ground, groundGrid(ground), { sound: (name, path) => sounds.push({ name, path }) });
    world.applyInitial();
    const moved: { path: string; delta: Float32Array }[] = [];
    const wire = { doors: [{ valve: 0, phase: PHASE_REST }] as DoorWire[] };
    const gates = new GatePage({ move: (path, delta) => moved.push({ path, delta: Float32Array.from(delta) }), net: () => ({ doors: () => wire.doors }) });
    const handle = (path: string): GateHandle => ({ node: path === HAND1 ? 2 : 6, path, local: IDENTITY, parent: IDENTITY });
    const spec: GateSpec = {
      index: 0, node: 'gate_move1', path: LEAF, local: IDENTITY, parent: IDENTITY, owners: [0], sweep, open: [0, 35, 0], seconds: 3,
      levers: [{ action: 0, node: lever.node, path: lever.path, valve: 'gate1', program, handles: [handle(HAND1), handle(HAND2)] }],
    };
    gates.setMap([spec], ground, 0);
    gates.frame(1 / 60);
    moved.length = 0;
    const page = new ActionPage({
      world: () => world, feet: () => null, aim: () => null, net: () => null,
      gateLever: (action: number, read: (valve: string) => number) => gates.present(action, read),
    } as ActionPageDeps);
    const run = (seconds: number) => { for (let k = 0; k < Math.round(seconds * 60); k++) { world.step(1 / 60); gates.frame(1 / 60); } };
    /** The handle's last drawn turn about X, in degrees (its delta's rotation block, row vectors). */
    const angle = (path: string): number | null => {
      const m = moved.filter((x) => x.path === path).pop()?.delta;
      return m ? (Math.atan2(m[6]!, m[5]!) * 180) / Math.PI : null;
    };
    return { world, gates, page, sounds, moved, run, angle, spec };
  };

  it('an action on a lever: .SWITCH_SMALL at the handle after the 0.24 s lead-in, the leaf\'s own sound, both handles turned -100 degrees over 0.5 s, the leaf never moved', () => {
    const r = rig2();
    r.page.event({ type: 'action', action: 0, by: 2 });
    r.run(0.2);
    expect(r.sounds).toEqual([]);                                            // the lever's lead-in
    expect(r.moved).toEqual([]);
    r.run(0.3);
    expect(r.sounds.map((s) => [s.name, s.path])).toEqual([['.SWITCH_SMALL', HAND1]]);   // LATER 1381: the turn holds the leaf's
    const mid = r.angle(HAND1)!;
    expect(mid).toBeLessThan(-5);
    expect(mid).toBeGreaterThan(-95);                                        // mid-turn
    r.run(0.6);
    expect(r.sounds.map((s) => [s.name, s.path])).toEqual([['.SWITCH_SMALL', HAND1], ['.WOOD_DR_SLD_OP', LEAF]]);
    expect(r.angle(HAND1)).toBeCloseTo(-100, 3);
    expect(r.angle(HAND2)).toBeCloseTo(-100, 3);                             // relatedopen: the other lever's handle
    r.run(3);
    expect(r.moved.some((x) => x.path === LEAF)).toBe(false);               // no gate_move translation on the page
    expect(r.gates.stats()[0]!.offset).toEqual([0, 0, 0]);                  // the leaf is the room's pose (shut on the wire)
    expect(r.world.valve('gate1')).toBe(1);                                  // the lever's valve, as the room's run left it
  });

  it('the next action runs the close branch: the handles turned back to rest and the close sound; the action is never marked used', () => {
    const r = rig2();
    r.page.event({ type: 'action', action: 0, by: 2 });
    r.run(4);
    r.sounds.length = 0;
    r.page.event({ type: 'action', action: 0, by: 3 });
    r.run(1);
    expect(r.sounds.map((s) => s.name)).toEqual(['.SWITCH_SMALL', '.WOOD_DR_SLD_CL']);
    expect(r.angle(HAND1)).toBeCloseTo(0, 3);
    expect(r.angle(HAND2)).toBeCloseTo(0, 3);
    expect(r.world.valve('gate1')).toBe(0);
    expect(r.world.actionUsed(0)).toBe(false);                               // a lever toggles all round (points 0)
  });

  it('a destroyed gate (its destructible\'s death taken off the wire): the lever turns and clicks, the leaf\'s sound is not heard', () => {
    const r = rig2();
    expect(r.world.takeDeath(0, true)).toBe(true);
    r.sounds.length = 0;
    r.page.event({ type: 'action', action: 0, by: 2 });
    r.run(1);
    expect(r.sounds.map((s) => s.name)).toEqual(['.SWITCH_SMALL']);
    expect(r.angle(HAND1)).toBeCloseTo(-100, 3);
  });

  it("LATER 1381: the turn holds the run -- the page's leaf sound with the room's slide, both after the handle's 0.5 s turn", () => {
    const r = rig2();
    const lead = leadIns(r.spec, r.spec.levers[0]!)[0]!;                    // the room host's lead-in to the slide
    expect(lead).toBeGreaterThan(0.24 + 0.5);                                // after the turn, not at the 0.24 s wait
    expect(lead).toBeLessThanOrEqual(0.807 + 2 / 60 + 1e-9);                 // LEVER-1381-PC3b: ~0.807 s (the port's grid; LATER 1426)
    // The room's own run of the same pull (`GateSet.use`, the room's host): its slide's first moving step.
    const room = new GateSet([r.spec], null);
    expect(room.use(0)).toBe(true);
    let slid: number | null = null;
    for (let k = 1; k <= 120 && slid === null; k++) {
      room.step(1 / 60);
      if (room.offset(0)[1] !== 0) slid = k / 60;
    }
    // The page's world run (the sounds) of the room's `action` event.
    r.page.event({ type: 'action', action: 0, by: 2 });
    let heard: number | null = null;
    for (let k = 1; k <= 120 && heard === null; k++) {
      r.run(1 / 60);
      if (r.sounds.some((s) => s.name === '.WOOD_DR_SLD_OP')) heard = k / 60;
    }
    expect(slid).not.toBeNull();
    expect(heard).not.toBeNull();
    expect(Math.abs(heard! - slid!)).toBeLessThanOrEqual(1 / 60 + 1e-9);   // the leaf's sound with the room's slide
    expect(Math.abs(heard! - lead)).toBeLessThanOrEqual(1 / 60 + 1e-9);
    // The page's own presentation run (`present`): held on the turn, the handle turning 0.5 s from ~0.27-0.34 s.
    const turned: { path: string; delta: Float32Array }[] = [];
    const set = new GateSet([r.spec], null, { turned: (path, delta) => turned.push({ path, delta: Float32Array.from(delta) }) });
    const angle = (): number => { const m = turned.filter((x) => x.path === HAND1).pop()?.delta; return m ? (Math.atan2(m[6]!, m[5]!) * 180) / Math.PI : 0; };
    expect(set.present(0, () => 0)).toBe(true);
    let began: number | null = null, rested: number | null = null;
    for (let k = 1; k <= 120; k++) {
      set.step(1 / 60);
      if (began === null && angle() < -1e-6) began = k / 60;
      if (rested === null && Math.abs(angle() + 100) < 1e-3) rested = k / 60;
      if (k === 36) expect(set.presenting()).toBe(1);                      // 0.6 s: the run held on the turn
    }
    expect(began!).toBeGreaterThanOrEqual(0.27);
    expect(began!).toBeLessThanOrEqual(0.34 + 1e-9);
    expect(rested! - began!).toBeGreaterThanOrEqual(0.5 - 1 / 60 - 1e-9);
    expect(rested! - began!).toBeLessThanOrEqual(0.5 + 1 / 60 + 1e-9);
    expect(set.presenting()).toBe(0);                                        // run out after the turn: the slide is the room's
  });
});

describe('LATER 307: the mounts lend the gate page to the action page (the wiring)', () => {
  const read = (f: string): string => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
  it('matchActions forwards gateLever to the ActionPage as it forwards gatePress', () => {
    const ma = read('matchActions.ts');
    expect(ma).toMatch(/gateLever\?: \(action: number, read: \(valve: string\) => number\) => boolean;/);
    expect(ma).toMatch(/\.\.\.\(d\.gateLever \? \{ gateLever: d\.gateLever \} : \{\}\),/);
  });
  it('both mounts pass their gate page\'s present', () => {
    for (const f of ['main.ts', 'matchMount.ts']) expect(read(f)).toMatch(/gateLever: \(action, read\) => gates\.present\(action, read\),/);
  });
});
