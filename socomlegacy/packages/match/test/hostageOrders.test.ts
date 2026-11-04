import { describe, expect, it } from 'vitest';
import { materialTable, type AiLoc, type SurfaceMaterial } from '@s2u/scene';
import { HostageAi } from '../src/hostageAi';
import {
  aimPickBlocks, createOrderedHostage, crosshairPick, follow, hold, HostageLeaders, orderRefusal, releaseLeader, unitOfSeat, unitTick,
  CUE_YES, ESCORTEE_UNIT_ID, ORDER_RANGE_CELLS_READING, type OrderRequest, type OrderWorld, type OrderedHostage,
} from '../src/hostageOrders';

/**
 * HX-4a (web sprint 31; research 239 s1-s2; rulings HX.R3, HX.R4, HX.R5): the order's gates and the leader's
 * bookkeeping, pure -- no room. The cells are a synthetic 10-unit grid on sub-map 0 (`cellOf`); the pick is given as
 * the room's ray would find it (`crosshairPick` over the bodies and surfaces met).
 */

const SEAL = 0x40000001, TERRORIST = 0x80000100, HOSTAGE = 0xc0020000;
const cellOf = (feet: readonly number[]): AiLoc | null =>
  feet[0]! < 0 || feet[2]! < 0 ? null : { map: 0, x: Math.floor(feet[0]! / 10), z: Math.floor(feet[2]! / 10) };
/** The world as the room gives it: the cells, and a pick fixed per test. */
const world = (picked: number | null, blocked: number[] = []): OrderWorld => ({ cellOf, pick: () => ({ picked, blocked }) });
const issuer = (id: number, team: number, feet: [number, number, number], over: Partial<OrderRequest['issuer']> = {}): OrderRequest['issuer'] =>
  ({ id, alive: true, spectator: false, team, feet, ...over });
const target = (over: Partial<OrderRequest['hostage']> = {}): OrderRequest['hostage'] =>
  ({ id: 240, alive: true, team: HOSTAGE, feet: [5, 0, 5], unit: ESCORTEE_UNIT_ID, hidden: false, ...over });
const req = (cmd: 4 | 5, i: OrderRequest['issuer'], h: OrderRequest['hostage'] = target()): OrderRequest =>
  ({ cmd, issuer: i, hostage: h, eye: [i.feet[0]!, 60, i.feet[2]!], dir: [1, 0, 0] });
const mat = (name: string): SurfaceMaterial => materialTable().find((m) => m.name === name)!;
const random = (): number => 0.5;

describe('HX-4a: the order, pure (research 239 s1-s2)', () => {
  it("the offer is the original's local test (FUN_00591dc0 D:L451386-451452; FUN_00590bc0 D:L450733-450735): a living player of EITHER side (ORDER_SIDE_READING 'none', V2 #24) aiming at a living hostage 19 cells away is offered FOLLOW on an unled one and HOLD on one in his unit; 20 cells is out of range (ORDER_RANGE_CELLS_READING); a dead issuer, a spectator (SPECTATOR_ORDER_READING), a dead hostage and one not under the crosshair are refused with their why", () => {
    expect(ORDER_RANGE_CELLS_READING).toBe(20);
    // 19 cells along x from the hostage's (0,0): both sides are offered FOLLOW on the unled hostage.
    const seal = issuer(1, SEAL, [195, 0, 5]), terrorist = issuer(2, TERRORIST, [5, 0, 195]);
    expect(orderRefusal(req(4, seal), world(240))).toBeNull();
    expect(orderRefusal(req(4, terrorist), world(240))).toBeNull();
    // HOLD on one in his own unit (the leader's: the seat's id + 0x20), either side.
    expect(orderRefusal(req(5, seal, target({ unit: unitOfSeat(1) })), world(240))).toBeNull();
    expect(orderRefusal(req(5, terrorist, target({ unit: unitOfSeat(2) })), world(240))).toBeNull();
    // 20 cells (Manhattan: 10 + 10) is out of range; so is a body off the grid.
    expect(orderRefusal(req(4, issuer(1, SEAL, [105, 0, 105])), world(240))).toBe('range');
    expect(orderRefusal(req(4, issuer(1, SEAL, [-5, 0, 5])), world(240))).toBe('range');
    // The sub-map is ignored: the same x,z on sub-map 2 is as near.
    const sub2: OrderWorld = { cellOf: (f) => ({ ...cellOf(f)!, map: f[0]! > 100 ? 2 : 0 }), pick: () => ({ picked: 240, blocked: [] }) };
    expect(orderRefusal(req(4, seal), sub2)).toBeNull();
    // Refused, with the why: a dead issuer, a spectator, a dead hostage, one not under the crosshair, no shared bit.
    expect(orderRefusal(req(4, issuer(1, SEAL, [195, 0, 5], { alive: false })), world(240))).toBe('not alive');
    expect(orderRefusal(req(4, issuer(1, SEAL, [195, 0, 5], { spectator: true })), world(240))).toBe('spectator');
    expect(orderRefusal(req(4, seal, target({ alive: false })), world(240))).toBe('hostage dead');
    expect(orderRefusal(req(4, seal), world(null))).toBe('not aimed');
    expect(orderRefusal(req(4, seal), world(3))).toBe('not aimed');            // a player in front is the pick
    expect(orderRefusal(req(4, issuer(1, 0x1, [195, 0, 5])), world(240))).toBe('team');
    // Past the fade the node is inactive: nothing to pick.
    expect(orderRefusal(req(5, seal, target({ unit: unitOfSeat(1), hidden: true })), world(240))).toBe('gone');
  });

  it("the crosshair pick stops at a surface whose penetration is under 0.98 and passes one at 1.0 or liquid (FUN_005aa6e0 D:L464148-464153; AIM_PICK_IGNORE_READING): through the shut cell door's METAL_GRATE bars no order; through the opened door's INVISIBLE_DI bars the order", () => {
    // The bars' two materials by the table's index (199 s12.7: 28 METAL_GRATE, 3 INVISIBLE_DI).
    expect(materialTable()[28]!.name).toBe('METAL_GRATE');
    expect(materialTable()[3]!.name).toBe('INVISIBLE_DI');
    expect(aimPickBlocks(mat('METAL_GRATE'))).toBe(true);                       // 0.4
    expect(aimPickBlocks(mat('INVISIBLE_DI'))).toBe(false);                     // 1.0
    expect(aimPickBlocks(mat('WATER'))).toBe(false);                            // liquid
    expect(aimPickBlocks(mat('GRASS_VOL'))).toBe(false);                        // volumetric
    expect(aimPickBlocks(mat('CAMO_NET'))).toBe(false);                         // 0.98
    expect(aimPickBlocks(mat('PERSON'))).toBe(true);                            // 0.97
    // +0x3c bit 4 is PICKUP (FUN_002dde40; desktop@be557831:docs/research/23-frostfire-ground-probe.md:142-143), on ITEM
    // alone of the disc's SOILS: ITEM (1.0, PICKUP) blocks where INVISIBLE_DI (1.0, no PICKUP) passes.
    expect(mat('ITEM')).toMatchObject({ penetration: 1, pickup: true });
    expect(aimPickBlocks(mat('ITEM'))).toBe(true);
    expect(mat('INVISIBLE_DI')).toMatchObject({ penetration: 1, pickup: false });
    const seal = issuer(1, SEAL, [195, 0, 5]);
    const at = (bars: string): OrderWorld => ({
      cellOf, pick: () => crosshairPick([{ id: 240, distance: 150 }], [{ distance: 60, material: mat(bars) }]),
    });
    const shut = crosshairPick([{ id: 240, distance: 150 }], [{ distance: 60, material: mat('METAL_GRATE') }]);
    expect(shut).toEqual({ picked: null, blocked: [240] });
    expect(orderRefusal(req(4, seal), at('METAL_GRATE'))).toBe('blocked');
    expect(orderRefusal(req(4, seal), at('INVISIBLE_DI'))).toBeNull();
    // A wall behind the hostage changes nothing; a nearer body is the pick.
    expect(crosshairPick([{ id: 240, distance: 50 }], [{ distance: 60, material: mat('STONE') }]).picked).toBe(240);
    expect(crosshairPick([{ id: 240, distance: 50 }, { id: 3, distance: 20 }], []).picked).toBe(3);
  });

  it("FOLLOW on a led hostage is refused 'led' and HOLD from outside its unit 'not yours' (FUN_00591ab0 D:L451275-451283, FUN_00591770 D:L451232-451240; HOLD_ISSUER_READING)", () => {
    const seal = issuer(1, SEAL, [195, 0, 5]), other = issuer(4, SEAL, [5, 0, 195]);
    const led = target({ unit: unitOfSeat(1) });
    expect(orderRefusal(req(4, other, led), world(240))).toBe('led');
    expect(orderRefusal(req(4, seal, led), world(240))).toBe('led');             // the leader too: FOLLOW only from 0x11
    expect(orderRefusal(req(5, other, led), world(240))).toBe('not yours');
    expect(orderRefusal(req(5, seal, target()), world(240))).toBe('not yours');   // an unled one: HOLD is nobody's
    expect(orderRefusal(req(5, seal, led), world(240))).toBeNull();
  });

  it('controlHostageAction (FUN_005fcf10 D:L509476-509527): the old leader\'s count -1, the new one\'s +1, lastLeader the new id; a null leader clears the leader and keeps lastLeader; a dead or self leader is refused', () => {
    const leaders = new HostageLeaders();
    const h = createOrderedHostage({ id: 240, random }, leaders);
    expect([h.leader, h.lastLeader, leaders.controlled(1)]).toEqual([null, null, 0]);
    expect(leaders.tryControlHostage(h, { id: 1, alive: true })).toBe(true);
    expect([h.leader, h.lastLeader, leaders.controlled(1)]).toEqual([1, 1, 1]);
    // A new leader: the old one's count down, the new one's up, lastLeader the new id.
    expect(leaders.controlHostageAction(h, { id: 2, alive: true })).toBe(true);
    expect([h.leader, h.lastLeader, leaders.controlled(1), leaders.controlled(2)]).toEqual([2, 2, 0, 1]);
    // Null: released, lastLeader kept (+0x5d8 is not cleared, 189 s14.8).
    expect(leaders.controlHostageAction(h, null)).toBe(true);
    expect([h.leader, h.lastLeader, leaders.controlled(2)]).toEqual([null, 2, 0]);
    // A dead leader is refused -- and the old one was released first (D:L509487-509493).
    leaders.tryControlHostage(h, { id: 1, alive: true });
    expect(leaders.controlHostageAction(h, { id: 5, alive: false })).toBe(false);
    expect([h.leader, h.lastLeader, leaders.controlled(1), leaders.controlled(5)]).toEqual([null, 1, 0, 0]);
    // Self (the hostage's own body) is refused.
    expect(leaders.controlHostageAction(h, { id: 240, alive: true })).toBe(false);
    expect(h.leader).toBeNull();
    // The count never falls below 0 (D:L509491: only when > 0).
    leaders.controlHostageAction(h, null);
    expect(leaders.controlled(1)).toBe(0);
    // With no leader the follow state's live bit is cleared: the driver pops 9 next frame (D:L509505-509514).
    const g = createOrderedHostage({ id: 241, random }, leaders);
    follow(g, { id: 1, alive: true }, leaders);
    expect([g.ai.state, g.leader, leaders.controlled(1)]).toEqual([9, 1, 1]);
    leaders.controlHostageAction(g, null);
    expect(g.ai.stack.find(9)!.live).toBe(false);
    g.ai.step(1 / 30, { feet: [0, 0, 0], bodies: [] });
    expect(g.ai.state).toBe(0x17);
  });

  it("unitTick (FUN_005e8060 D:L498341-498463; UNIT_TICK_HOLD_READING): a unit with no living member issues HOLD to each of its escortees, the issuer its last dead member or the host's player", () => {
    const leaders = new HostageLeaders();
    const a = createOrderedHostage({ id: 240, random }, leaders), b = createOrderedHostage({ id: 241, random }, leaders);
    const c = createOrderedHostage({ id: 242, random }, leaders);
    // FOLLOW (case 4): the leader's unit, YES, state 9, the bookkeeping.
    const seat1 = { id: 1, alive: true }, seat2 = { id: 2, alive: true };
    const out = follow(a, seat1, leaders);
    expect(out).toEqual({ yes: true, top: 9, unit: unitOfSeat(1) });
    expect(a.ai.cues.at(-1)).toBe(CUE_YES);
    follow(b, seat1, leaders);
    follow(c, seat2, leaders);
    expect(leaders.controlled(1)).toBe(2);
    const seats = new Map([[1, seat1], [2, seat2]]);
    const all: OrderedHostage[] = [a, b, c];
    // Everyone alive: nothing.
    expect(unitTick(all, (id) => seats.get(id))).toEqual([]);
    // Seat 1 dies: its followers released (leader null, lastLeader kept), then the tick's HOLD from the dead member.
    seat1.alive = false;
    expect(releaseLeader(all, 1, leaders).map((h) => h.id)).toEqual([240, 241]);
    expect([a.leader, a.lastLeader, leaders.controlled(1)]).toEqual([null, 1, 0]);
    const held = unitTick(all, (id) => seats.get(id));
    expect(held.map((x) => [x.hostage.id, x.issuer])).toEqual([[240, 1], [241, 1]]);
    for (const h of [a, b]) {
      expect([h.ai.unit, h.ai.state, h.ai.sub, h.ai.cues.at(-1)]).toEqual([ESCORTEE_UNIT_ID, 0x17, 2, CUE_YES]);
      expect(h.ai.owner).toBe(1);
    }
    expect(c.ai.unit).toBe(unitOfSeat(2));                                       // another leader's untouched
    // Seat 2 leaves: no seat left -- the issuer is the host's player, none in the port (null).
    seats.delete(2);
    releaseLeader(all, 2, leaders);
    expect(unitTick(all, (id) => seats.get(id)).map((x) => [x.hostage.id, x.issuer])).toEqual([[242, null]]);
    expect([c.ai.unit, c.ai.state, c.lastLeader]).toEqual([ESCORTEE_UNIT_ID, 0x17, 2]);
    // A dead escortee gets no HOLD (D:L498387-498412: the dead are taken off the list).
    const d = createOrderedHostage({ id: 243, random }, leaders);
    follow(d, { id: 3, alive: true }, leaders);
    d.ai.alive = false;
    expect(unitTick([d], () => undefined)).toEqual([]);
    // HOLD from the leader (case 5) unwinds 9 and drops the count through Follow's end (signal 1).
    const e = createOrderedHostage({ id: 244, random }, leaders);
    follow(e, { id: 6, alive: true }, leaders);
    expect(hold(e, 6)).toEqual({ yes: true, top: 0x17, unit: ESCORTEE_UNIT_ID });
    expect([leaders.controlled(6), e.leader, e.lastLeader]).toEqual([0, null, 6]);
    expect(e.ai).toBeInstanceOf(HostageAi);
  });
});
