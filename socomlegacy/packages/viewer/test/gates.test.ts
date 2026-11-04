import { describe, expect, it } from 'vitest';
import { buildGrid, decodeEffectOp, ZCMD, type EffectOp, type EffectProgram, type GridParams, type WorldPoly } from '@s2u/scene';
import { PHASE_REST } from '../src/doors';
import { actionRayDetail, actionRayPick, aimPick } from '../src/equipment';
import { GATE_SHARED_LEAF_OVERLAP_PLACEHOLDER, GateSet, isGateLeaf, type GateSpec } from '../src/gates';
import { actionAtPick, type MapAction } from '../src/mapActions';
import { forkGround } from '../src/worldState';
import { groundPolygons, packGround, type GroundData } from '../src/mover';

/**
 * MAP-07 (research 174 §5, 175 §5.3, 95 §1.5): a lever gate's pose, the destroyed-gate guard, two levers on one leaf,
 * and the page following the room's wire. No disc: the programs are the shape the audits describe.
 */

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
/** Parent X along world +Z (research 175 §5.3): a parent-space (-20, 0, 0) is about 20 on world -Z. */
const PARENT_X_TO_Z = [0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1];

function move(to: [number, number, number]): EffectOp {
  return {
    op: 'fromTo', node: 1, flags: 9, seconds: 3, from: [1, 1, 1], to: [1, 1, 1],
    translation: { from: null, to, rate: [to[0] / 3, to[1] / 3, to[2] / 3] },
  };
}

/** Death Trap's shape: flip the lever, wait 0.24 s, slide only while `block` is 0. `also` is Enowapi's second valve. */
function gateProgram(nodeName: string, valve: string, delta: [number, number, number], block = 'set_access1', also: string[] = []): EffectProgram {
  const setAll = (operand: number): EffectOp[] => [valve, ...also].map((name) => (
    name === valve
      ? { op: 'valve' as const, valve: name, operation: 0x0b, operand, context: true as const }
      : { op: 'valve' as const, valve: name, operation: 0x0b, operand }
  ));
  const neg: [number, number, number] = [-delta[0], -delta[1], -delta[2]];
  return {
    name: 'gate_openclose1', root: 0, flags: 0, nodes: ['gatehand', nodeName],
    sequences: [
      { name: 'main', activation: 1, ops: [
        { op: 'if', conditions: [{ kind: 'valve', valve, operation: 2, operand: 0, context: true }] },
        // The lever handle's turn is in the disc program and is not run: a rotate here must not move the leaf.
        { op: 'rotate', node: 0, ref: -1, flags: 1, xyz: [0, 1, 0] },
        { op: 'fromTo', node: 0, flags: 9, seconds: 0.5, from: [1, 1, 1], to: [1, 1, 1], translation: { from: null, to: [0, 5, 0], rate: [0, 10, 0] } },
        ...setAll(1),
        { op: 'wait', seconds: 0.24, range: 0, frames: null },
        { op: 'if', conditions: [{ kind: 'valve', valve: block, operation: 2, operand: 0 }] },
        { op: 'callSequence', sequence: 'gateopen' },
        { op: 'endif' },
        { op: 'else' },
        ...setAll(0),
        { op: 'wait', seconds: 0.24, range: 0, frames: null },
        { op: 'if', conditions: [{ kind: 'valve', valve: block, operation: 2, operand: 0 }] },
        { op: 'callSequence', sequence: 'gateclose' },
        { op: 'endif' },
        { op: 'endif' },
      ] },
      { name: 'gateopen', activation: 2, ops: [move(delta)] },
      { name: 'gateclose', activation: 2, ops: [move(neg)] },
    ],
  };
}

function leaf(points: number[]): { spec: Omit<GateSpec, 'levers' | 'open' | 'seconds' | 'index'>; ground: GroundData } {
  const params: GridParams = { atomCount: 256, posts: 4, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -100, originZ: -100 };
  const poly: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/access1/gate_move1', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from(points),
  };
  const sweep = { minX: -40, maxX: 40, minZ: -40, maxZ: 80 };
  const ground = packGround(params, [poly], [{ modelName: 'worldmodel', path: poly.path, first: 0, count: 1, sweep }]);
  return {
    ground,
    spec: {
      node: 'gate_move1', path: poly.path, local: IDENTITY, parent: IDENTITY, owners: [0], sweep,
    },
  };
}

function oneGate(delta: [number, number, number], parent = IDENTITY, block = 'set_access1'): { gate: GateSpec; ground: GroundData } {
  const built = leaf([0, 0, 40, 0, 30, 40, 8, 30, 40, 8, 0, 40]);
  const gate: GateSpec = {
    ...built.spec, index: 0, parent, open: delta, seconds: 3,
    levers: [{ action: 0, node: 'epanel_di1', path: 'worldmodel/epanel_di1', valve: 'gate1', program: gateProgram('gate_move1', 'gate1', delta, block) }],
  };
  return { gate, ground: built.ground };
}

const xs = (ground: GroundData): number[] => {
  const pts = groundPolygons(ground)[0]!.points;
  return [pts[0]!, pts[3]!, pts[6]!, pts[9]!];
};
const zs = (ground: GroundData): number[] => {
  const pts = groundPolygons(ground)[0]!.points;
  return [pts[2]!, pts[5]!, pts[8]!, pts[11]!];
};

describe('a lever gate (MAP-07)', () => {
  it('names gate_move leaves and not the crane hook', () => {
    expect(isGateLeaf('gate_move1')).toBe(true);
    expect(isGateLeaf('gate_move2')).toBe(true);
    expect(isGateLeaf('GATE_MOVE')).toBe(true);
    expect(isGateLeaf('translate_hook')).toBe(false);
    expect(isGateLeaf('gatehand')).toBe(false);
  });

  it('slides the hull by the open delta after the lead-in, then closes, and a pull while it runs is refused', () => {
    const { gate, ground } = oneGate([-20, 0, 0]);
    const set = new GateSet([gate], ground);
    expect(xs(ground)).toEqual([0, 0, 8, 8]);
    expect(set.use(0)).toBe(true);
    set.step(0.2);
    expect(set.use(0)).toBe(false);                         // the lead-in is the same run (D:L156787)
    expect(set.wire()).toEqual([{ valve: 0, phase: PHASE_REST }]);
    expect(set.offset(0)).toEqual([0, 0, 0]);
    set.step(0.1);                                          // the wait ends on this step; the slide takes the rest of it
    set.step(1.5);
    expect(set.offset(0)[0]).toBeLessThan(-8);
    expect(set.offset(0)[0]).toBeGreaterThan(-12);
    const mid = set.wire()[0]!;
    expect(mid.valve).toBe(1);
    expect(mid.phase).toBeGreaterThan(0);
    expect(mid.phase).toBeLessThan(PHASE_REST);
    set.step(1.5);
    expect(set.offset(0)).toEqual([-20, 0, 0]);
    expect(xs(ground)).toEqual([-20, -20, -12, -12]);
    expect(set.wire()).toEqual([{ valve: 1, phase: PHASE_REST }]);
    expect(set.valve('gate1')).toBe(1);
    expect(set.use(0)).toBe(true);
    set.step(0.24);
    set.step(3);
    expect(set.offset(0)[0]).toBeCloseTo(0, 4);
    expect(xs(ground).map((x) => Math.round(x))).toEqual([0, 0, 8, 8]);
    expect(set.wire()).toEqual([{ valve: 0, phase: PHASE_REST }]);
    set.use(0);
    set.step(0.24);
    set.step(1.5);
    const opening = set.offset(0)[0]!;
    expect(opening).toBeLessThan(-8);
    // FUN_002b44e0 (D:L156787): an action is refused while its animation runs, and the called slide is part of that
    // run (`EffectRun`, research 89 §12). The leaf goes on to the open end; nothing reverses it.
    expect(set.busy(0)).toBe(true);
    expect(set.use(0)).toBe(false);
    set.step(1.6);
    expect(set.offset(0)).toEqual([-20, 0, 0]);
    set.step(0.1);
    expect(set.busy(0)).toBe(false);
    expect(set.use(0)).toBe(true);
  });

  it('a relative command adds its delta to the translation now, with no clamp to the travel (FUN_0025fe70)', () => {
    // Flags 9: from is the node's translation at the command's begin (D:L109101-109115, research 174 §5), and flag 1
    // adds the target onto it (D:L109234-109244). The disc's programs toggle their valves, so a lever never repeats
    // `gateopen` from the open end; a program that does rises again.
    const delta: [number, number, number] = [0, 35, 0];
    const built = leaf([0, 0, 40, 0, 30, 40, 8, 30, 40, 8, 0, 40]);
    const program: EffectProgram = {
      name: 'gate_openclose2', root: 0, flags: 0, nodes: ['gatehand', 'gate_move1'],
      sequences: [
        { name: 'main', activation: 1, ops: [
          { op: 'valve', valve: 'woodgate2', operation: 0x0b, operand: 1, context: true },
          { op: 'wait', seconds: 0.24, range: 0, frames: null },
          { op: 'callSequence', sequence: 'gateopen' },
        ] },
        { name: 'gateopen', activation: 2, ops: [move(delta)] },
      ],
    };
    const gate: GateSpec = {
      ...built.spec, index: 0, open: delta, seconds: 3,
      levers: [{ action: 4, node: 'epanel_di3', path: 'worldmodel/epanel_di3', valve: 'woodgate2', program }],
    };
    const set = new GateSet([gate], built.ground);
    const y = (): number => set.offset(0)[1]!;
    set.use(4);
    set.step(0.24);
    set.step(3);
    expect(y()).toBeCloseTo(35, 4);
    expect(set.use(4)).toBe(true);
    set.step(0.2);
    expect(y()).toBeCloseTo(35, 4);                        // the lead-in holds the leaf
    set.step(1.54);
    expect(y()).toBeGreaterThan(50);                       // from 35, toward 70
    set.step(2);
    expect(y()).toBeCloseTo(70, 4);
  });

  it('Death Trap: a parent whose X is world Z slides the leaf about 20 on world -Z', () => {
    const { gate, ground } = oneGate([-20, 0, 0], PARENT_X_TO_Z);
    const set = new GateSet([gate], ground);
    expect(zs(ground)).toEqual([40, 40, 40, 40]);
    set.use(0);
    set.step(0.24);
    set.step(3);
    expect(zs(ground).map((z) => Math.round(z * 1000) / 1000)).toEqual([20, 20, 20, 20]);
  });

  it('a destroyed gate (set_access 1) flips the lever and does not move', () => {
    const { gate, ground } = oneGate([-20, 0, 0]);
    const set = new GateSet([gate], ground, {}, (name) => (name === 'set_access1' ? 1 : 0));
    expect(set.use(0)).toBe(true);
    set.step(4);
    expect(set.offset(0)).toEqual([0, 0, 0]);
    expect(xs(ground)).toEqual([0, 0, 8, 8]);
    expect(set.valve('gate1')).toBe(1);
    expect(set.wire()).toEqual([{ valve: 0, phase: PHASE_REST }]);
  });

  it('Enowapi: two levers share one leaf, one busy flag, and both valves', () => {
    const built = leaf([0, 0, 40, 0, 30, 40, 8, 30, 40, 8, 0, 40]);
    const delta: [number, number, number] = [0, 35, 0];
    const gate: GateSpec = {
      ...built.spec, index: 0, open: delta, seconds: 3,
      levers: [
        { action: 3, node: 'epanel_di2', path: 'worldmodel/epanel_di2', valve: 'woodgate', program: gateProgram('gate_move1', 'woodgate', delta, 'set_access2', ['woodgate2']) },
        { action: 4, node: 'epanel_di3', path: 'worldmodel/epanel_di3', valve: 'woodgate2', program: gateProgram('gate_move1', 'woodgate2', delta, 'set_access2', ['woodgate']) },
      ],
    };
    const set = new GateSet([gate], built.ground);
    expect(set.use(3)).toBe(true);
    expect(set.busy(4)).toBe(true);
    // The other lever while the leaf's program runs: GATE_SHARED_LEAF_OVERLAP_PLACEHOLDER (refused; unread in the
    // original, where di3 is its own action and animation).
    expect(GATE_SHARED_LEAF_OVERLAP_PLACEHOLDER).toBe(true);
    set.step(0.24);
    set.step(1.5);
    expect(set.use(4)).toBe(false);
    expect(set.use(3)).toBe(false);                          // its own run (D:L156787)
    set.step(1.5);
    const ys = (): number[] => {
      const pts = groundPolygons(built.ground)[0]!.points;
      return [pts[1]!, pts[4]!, pts[7]!, pts[10]!];
    };
    expect(ys()).toEqual([35, 65, 65, 35]);
    expect(set.valve('woodgate')).toBe(1);
    expect(set.valve('woodgate2')).toBe(1);
    expect(set.use(4)).toBe(true);
    set.step(0.24);
    set.step(3);
    expect(ys().map((y) => Math.round(y))).toEqual([0, 30, 30, 0]);
    expect(set.valve('woodgate')).toBe(0);
    expect(set.valve('woodgate2')).toBe(0);
  });

  it('the page follows the wire, including the lead-in, and a door ahead of the gates is not a gate', () => {
    const { gate, ground } = oneGate([-20, 0, 0]);
    const server = new GateSet([gate], ground);
    const page = new GateSet([gate], forkGround(ground));
    server.use(0);
    server.step(0.2);
    page.applyWire([{ valve: 9, phase: 1 }, ...server.wire()], 1);
    expect(page.offset(0)).toEqual([0, 0, 0]);
    server.step(0.04);
    server.step(1.5);
    page.applyWire([{ valve: 9, phase: 1 }, ...server.wire()], 1);
    expect(Math.abs(page.offset(0)[0]! - server.offset(0)[0]!)).toBeLessThan(0.15);
    server.step(1.5);
    const mid = page.offset(0)[0]!;
    page.applyWire(server.wire(), 0);
    // The server has settled. The page was already sliding, so the settle is chased, not snapped.
    expect(page.offset(0)[0]).toBeCloseTo(mid, 4);
    for (let i = 0; i < 120; i++) page.step(1 / 60);
    expect(page.offset(0)).toEqual([-20, 0, 0]);
    expect(page.wire()).toEqual([{ valve: 1, phase: PHASE_REST }]);
    // Phase is where the leaf is. A reverse flips the valve and keeps the open phase, so the page stays put.
    // Phase 0 is shut, whichever way the slide will run.
    page.applyWire([{ valve: 0, phase: PHASE_REST - 1 }], 0);
    expect(page.offset(0)[0]).toBeCloseTo(-20, 4);
    // Already sliding: a later phase is chased, not snapped. 127 is halfway along a 20-unit slide.
    const openEnd = page.offset(0)[0]!;
    page.applyWire([{ valve: 0, phase: 127 }], 0);
    expect(page.offset(0)[0]).toBeCloseTo(openEnd, 4);
    for (let i = 0; i < 100; i++) page.step(1 / 60);
    expect(page.offset(0)[0]).toBeCloseTo(-20 * (127 / (PHASE_REST - 1)), 3);
    const halfway = page.offset(0)[0]!;
    page.applyWire([{ valve: 1, phase: 0 }], 0);
    expect(page.offset(0)[0]).toBeCloseTo(halfway, 3);
    for (let i = 0; i < 100; i++) page.step(1 / 60);
    expect(page.offset(0)).toEqual([0, 0, 0]);
  });

  it('a round reset shuts the leaf and clears the lever', () => {
    const { gate, ground } = oneGate([-20, 0, 0]);
    const set = new GateSet([gate], ground);
    set.use(0);
    set.step(0.24);
    set.step(3);
    set.reset();
    expect(set.offset(0)).toEqual([0, 0, 0]);
    expect(xs(ground)).toEqual([0, 0, 8, 8]);
    expect(set.valve('gate1')).toBe(0);
    expect(set.wire()).toEqual([{ valve: 0, phase: PHASE_REST }]);
    expect(set.busy(0)).toBe(false);
  });

  it('a plain close chases a phase gap at the slide speed, and a held lead-in does not creep', () => {
    const delta: [number, number, number] = [0, 35, 0];
    const { gate, ground } = oneGate(delta);
    const yOf = (phase: number): number => 35 * (phase >= PHASE_REST ? 1 : phase / (PHASE_REST - 1));
    const page = new GateSet([gate], forkGround(ground));
    page.applyWire([{ valve: 1, phase: 250 }], 0);
    expect(page.offset(0)[1]).toBeCloseTo(yOf(250), 4);
    const y0 = page.offset(0)[1]!;
    page.applyWire([{ valve: 0, phase: 220 }], 0);
    expect(page.offset(0)[1]).toBeCloseTo(y0, 4);
    page.step(0.1);
    const moved = y0 - page.offset(0)[1]!;
    expect(moved).toBeGreaterThan(1);
    expect(moved).toBeLessThan(1.6);
    page.applyWire([{ valve: 0, phase: 220 }], 0);
    page.step(0.1);
    const moved2 = y0 - page.offset(0)[1]!;
    expect(moved2).toBeGreaterThan(2);
    expect(moved2).toBeLessThan(3.2);

    const server = new GateSet([gate], ground);
    const view = new GateSet([gate], forkGround(ground));
    server.use(0);
    server.step(0.24);
    server.step(3);
    view.applyWire(server.wire(), 0);
    expect(view.offset(0)[1]).toBeCloseTo(35, 3);
    server.use(0);
    let prev = view.offset(0)[1]!;
    let window = 0;
    let worst = 0;
    for (let f = 0; f < 60 * 4; f++) {
      server.step(1 / 60);
      view.applyWire(server.wire(), 0);
      view.step(1 / 60);
      window += Math.abs(view.offset(0)[1]! - prev);
      prev = view.offset(0)[1]!;
      if ((f + 1) % 6 === 0) { worst = Math.max(worst, window); window = 0; }
    }
    expect(worst).toBeLessThanOrEqual(1.6);
    expect(view.offset(0)[1]).toBeCloseTo(0, 3);

    const held = new GateSet([gate], forkGround(ground));
    held.applyWire([{ valve: 1, phase: PHASE_REST }], 0);
    held.applyWire([{ valve: 0, phase: PHASE_REST - 1 }], 0);
    const hy = held.offset(0)[1]!;
    for (let i = 0; i < 12; i++) {
      held.applyWire([{ valve: 0, phase: PHASE_REST - 1 }], 0);
      held.step(1 / 60);
    }
    expect(Math.abs(held.offset(0)[1]! - hy)).toBeLessThan(0.25);
  });

  it('a settle while the slide is showing is chased, and a rest-to-rest wire still snaps', () => {
    const delta: [number, number, number] = [0, 35, 0];
    const { gate, ground } = oneGate(delta);
    const page = new GateSet([gate], forkGround(ground));
    page.applyWire([{ valve: 1, phase: 250 }], 0);
    page.applyWire([{ valve: 0, phase: 220 }], 0);
    const y = page.offset(0)[1]!;
    page.applyWire([{ valve: 0, phase: PHASE_REST }], 0);
    expect(page.offset(0)[1]).toBeCloseTo(y, 4);
    page.step(0.036);
    const moved = y - page.offset(0)[1]!;
    expect(moved).toBeGreaterThan(0.3);
    expect(moved).toBeLessThan(0.6);

    const ends = new GateSet([gate], forkGround(ground));
    ends.applyWire([{ valve: 1, phase: PHASE_REST }], 0);
    expect(ends.offset(0)[1]).toBeCloseTo(35, 4);
    ends.applyWire([{ valve: 0, phase: PHASE_REST }], 0);
    expect(ends.offset(0)[1]).toBeCloseTo(0, 4);
  });

  it('only a closing pull or a round reset shuts an open gate', () => {
    const { gate, ground } = oneGate([0, 35, 0]);
    const closes: string[] = [];
    const set = new GateSet([gate], ground, { closing: (spec, why) => closes.push(`${spec.node}:${why}`) });
    set.use(0);
    set.step(0.24);
    set.step(3);
    expect(closes).toEqual([]);
    expect(set.offset(0)[1]).toBeCloseTo(35, 3);
    set.step(60);
    expect(set.offset(0)[1]).toBeCloseTo(35, 3);
    expect(closes).toEqual([]);
    set.use(0);
    set.step(0.2);
    expect(closes).toEqual([]);
    set.step(0.1);
    expect(closes).toEqual(['gate_move1:use']);
    set.step(3);
    expect(set.offset(0)[1]).toBeCloseTo(0, 3);
    expect(closes).toEqual(['gate_move1:use']);
    set.use(0);
    set.step(0.24);
    set.step(3);
    expect(closes).toEqual(['gate_move1:use']);
    set.reset();
    expect(closes).toEqual(['gate_move1:use', 'gate_move1:reset']);
    set.reset();
    expect(closes).toEqual(['gate_move1:use', 'gate_move1:reset']);
  });

  it('a decoded flags-9 command lifts the leaf by (0, 35, 0)', () => {
    const bytes = new Uint8Array(100);
    const v = new DataView(bytes.buffer);
    v.setUint16(4, 9, true);
    v.setInt8(6, 1);
    v.setUint16(0xc, 0x38, true);
    v.setFloat32(0x34, 3, true);
    v.setFloat32(0x4c, 35, true);
    const slide = decodeEffectOp({ set: 0, cmd: ZCMD.OBJECT_MOTION_FROM_TO, bytes }, []);
    expect(slide).toMatchObject({ op: 'fromTo', translation: { to: [0, 35, 0] } });
    const built = leaf([0, 0, 40, 0, 30, 40, 8, 30, 40, 8, 0, 40]);
    const program: EffectProgram = {
      name: 'gate_openclose1', root: 0, flags: 0, nodes: ['gatehand', 'gate_move1'],
      sequences: [
        { name: 'main', activation: 1, ops: [
          { op: 'if', conditions: [{ kind: 'valve', valve: 'fusebox2', operation: 2, operand: 0, context: true }] },
          { op: 'valve', valve: 'fusebox2', operation: 0x0b, operand: 1, context: true },
          { op: 'callSequence', sequence: 'gateopen' },
          { op: 'endif' },
        ] },
        { name: 'gateopen', activation: 2, ops: [slide] },
      ],
    };
    const gate: GateSpec = {
      ...built.spec, index: 0, open: [0, 35, 0], seconds: 3,
      levers: [{ action: 0, node: 'epanel_di1', path: 'worldmodel/epanel_di1', valve: 'fusebox2', program }],
    };
    const set = new GateSet([gate], built.ground);
    expect(set.use(0)).toBe(true);
    set.step(3);
    const pts = groundPolygons(built.ground)[0]!.points;
    expect([pts[1], pts[4], pts[7], pts[10]]).toEqual([35, 65, 65, 35]);
  });
});

/**
 * The lever under the reticle (`FUN_005aa6e0`, `FUN_005aa240`; research 179 §11.18, 92 §1). A bit-18 use volume in
 * front of an opaque wall is the action record when it is nearer. Reach is the record's ground-plane range at the
 * hit, strict, and there is no aim cone. `aimPick` still returns the wall: C4's point is the opaque hit.
 */
describe('a switch pick (MAP-07)', () => {
  const PARAMS: GridParams = { atomCount: 256, posts: 4, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -100, originZ: -100 };
  // `front` points the normal at the eye (z 0 looking toward +z). The hull keeps that side only
  // (`FUN_002d2890`, bit 1 clear). `back` is the same quad wound the other way.
  const quad = (path: string, z: number, cameratype: number, x0 = -20, x1 = 20, side: 'front' | 'back' = 'front'): WorldPoly => ({
    modelName: 'worldmodel', path, region: 0, ditype: 2, material: 25, ptcount: 4, cameratype,
    points: Float32Array.from(side === 'front'
      ? [x0, 0, z, x0, 20, z, x1, 20, z, x1, 0, z]
      : [x0, 0, z, x1, 0, z, x1, 20, z, x0, 20, z]),
  });
  const gridOf = (polys: WorldPoly[]) => buildGrid(PARAMS, [], [], polys, polys.map((p, i) => ({
    modelName: 'worldmodel', path: p.path, first: i, count: 1,
  })));
  const lever = (node: string, range = 15, elevation = -1): MapAction => ({
    node, path: `worldmodel/${node}`, type: 'SWITCH', typeCode: 2, valve: node, anims: [],
    team: null, range, elevation, points: 0, bitmap: '', at: [0, 0, 0],
  });
  const EYE = [0, 10, 0] as const;
  const FAR = [0, 10, 40] as const;
  const FEET = [0, 0, 0] as const;

  it('takes a nearer use volume and leaves the opaque aim on the wall', () => {
    const polys = [quad('worldmodel/epanel_di1', 6, 1), quad('worldmodel/wall', 20, 0)];
    const grid = gridOf(polys);
    const actions = [lever('epanel_di1')];
    const pick = actionRayPick(grid, EYE, FAR, actions);
    expect(pick?.path).toBe('worldmodel/epanel_di1');
    expect(aimPick(grid, EYE, FAR)?.path).toBe('worldmodel/wall');
    expect(actionAtPick(actions, pick!, FEET)?.node).toBe('epanel_di1');
    // Horizontal distance exactly the range is refused (strict). Elevation -1 ignores a large dy.
    const atRange = actionRayPick(gridOf([quad('worldmodel/epanel_di1', 15, 1), quad('worldmodel/wall', 30, 0)]), EYE, FAR, actions);
    expect(atRange?.point[2]).toBeCloseTo(15, 4);
    expect(actionAtPick(actions, atRange!, FEET)).toBeNull();
    expect(actionAtPick(actions, pick!, [0, -100, 0])?.node).toBe('epanel_di1');
    expect(actionAtPick([lever('epanel_di1', 15, 5)], pick!, [0, -100, 0])).toBeNull();
  });

  it('keeps a wide hit inside the range, and a use volume that is not nearer loses to the wall', () => {
    const actions = [lever('epanel_di1')];
    const grid = gridOf([quad('worldmodel/epanel_di1', 6, 1), quad('worldmodel/wall', 20, 0)]);
    // atan(7/6) is about 49 degrees off +Z. The hit stays on the quad and inside range 15.
    const wide = actionRayPick(grid, EYE, [70, 10, 60], actions);
    expect(wide?.path).toBe('worldmodel/epanel_di1');
    expect(wide?.point[0]).toBeCloseTo(7, 4);
    expect(wide?.point[2]).toBeCloseTo(6, 4);
    expect(actionAtPick(actions, wide!, FEET)?.node).toBe('epanel_di1');
    const behind = gridOf([quad('worldmodel/wall', 10, 0), quad('worldmodel/epanel_di1', 25, 1)]);
    expect(actionRayPick(behind, EYE, FAR, actions)?.path).toBe('worldmodel/wall');
    expect(actionRayDetail(behind, EYE, FAR, actions).why).toBe('behind');
    const tied = gridOf([quad('worldmodel/wall', 6, 0), quad('worldmodel/epanel_di1', 6, 1)]);
    const tie = actionRayDetail(tied, EYE, FAR, actions);
    expect(tie.why).toBe('tied');
    expect(tie.pick?.path).toBe('worldmodel/wall');
    expect(actionRayDetail(grid, EYE, FAR, actions).why).toBe('action');
    const plain = gridOf([quad('worldmodel/decal', 6, 1), quad('worldmodel/wall', 20, 0)]);
    expect(actionRayDetail(plain, EYE, FAR, actions).why).toBe('opaque');
  });

  it('a child of the panel selects the switch; a lever handle beside it does not (FUN_005aa470)', () => {
    const child = gridOf([quad('worldmodel/epanel_di1/handle', 6, 1), quad('worldmodel/wall', 20, 0)]);
    const panel = [lever('epanel_di1')];
    const hit = actionRayPick(child, EYE, FAR, panel);
    expect(hit?.path).toBe('worldmodel/epanel_di1/handle');
    expect(actionAtPick(panel, hit!, FEET)?.node).toBe('epanel_di1');
    // A descendant named like the disc's `look_di` already resolves: the walk is the parent path
    // (`FUN_005aa470`). A node that is not under the panel or the lever aim does not.
    const look = gridOf([quad('worldmodel/epanel_di3=panel/look_di', 6, 0)]);
    const di3 = [lever('epanel_di3')];
    expect(actionAtPick(di3, actionRayPick(look, EYE, FAR, di3)!, FEET)?.node).toBe('epanel_di3');
    const stray = actionRayPick(gridOf([quad('worldmodel/look_di', 6, 0)]), EYE, FAR, di3);
    expect(stray?.path).toBe('worldmodel/look_di');
    expect(actionAtPick(di3, stray!, FEET)).toBeNull();
    const handle = gridOf([quad('worldmodel/lever_1', 6, 0), quad('worldmodel/wall', 20, 0)]);
    expect(actionAtPick(panel, actionRayPick(handle, EYE, FAR, panel)!, FEET)).toBeNull();
  });

  it('ignores a back face, and a neighbour model later face, in front of the panel', () => {
    const actions = [lever('epanel_di1')];
    // `look_di` sits in front of the panel and faces away. The hull does not record it.
    const blocked = gridOf([
      quad('worldmodel/look_di', 4, 0, -20, 20, 'back'),
      quad('worldmodel/epanel_di1', 8, 1),
    ]);
    const through = actionRayDetail(blocked, EYE, FAR, actions);
    expect(through.pick?.path).toBe('worldmodel/epanel_di1');
    expect(through.why).toBe('action');
    // One owner, two front faces. The far face is first in the array; the near face would win a nearest-polygon
    // ray and hide the panel. The hull stops at the first face the ray meets from the front.
    // These quads are the rule, not MP11's measured polygons: the disc is not on this host.
    const far = quad('worldmodel/g342_1', 30, 0);
    const near = quad('worldmodel/g342_1', 4, 0);
    const panel = quad('worldmodel/epanel_di1', 8, 1);
    const polys = [far, near, panel];
    const grid = buildGrid(PARAMS, [], [], polys, [
      { modelName: 'worldmodel', path: 'worldmodel/g342_1', first: 0, count: 2 },
      { modelName: 'worldmodel', path: panel.path, first: 2, count: 1 },
    ]);
    const detail = actionRayDetail(grid, EYE, FAR, actions);
    expect(detail.opaquePath).toBe('worldmodel/g342_1');
    expect(detail.pick?.path).toBe('worldmodel/epanel_di1');
    expect(detail.why).toBe('action');
    expect(detail.pick && actionAtPick(actions, detail.pick, FEET)?.node).toBe('epanel_di1');
  });
});
