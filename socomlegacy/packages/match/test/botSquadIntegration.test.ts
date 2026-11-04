import { describe, expect, it } from 'vitest';
import { HELD_RIFLE, HELD_SIDEARM, type GridParams, type SpawnSlot, type WorldPoly } from '@s2u/scene';
import { groundGrid, packGround, PROTOCOL_VERSION, TICK_HZ, type ServerEvent, type SimMap } from '../../viewer/src/sim';
import type { SimKits } from '../../viewer/src/loadout';
import { Room } from '../src/room';
import { MatchBots } from '../src/bots/matchBots';
import type { NavigationData } from '../src/bots/navigation';
import { seatAtSlots } from './helpers/slotPoses';
import { BOT_BEHAVIOURS_OFF, type BotBehaviours } from '../src/botGates';

/** Synthetic cover exercises authored teamwork through real movement, magazines and accepted Room shots. */
function setup(options: { navWork?: number; behaviours?: BotBehaviours } = {}) {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 4, cellsZ: 4, originX: -400, originZ: -400 };
  const floor: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25,
    ptcount: 4, cameratype: 0, points: Float32Array.from([-400, 0, -400, 400, 0, -400, 400, 0, 400, -400, 0, 400]) };
  const wall = { ...floor, path: 'worldmodel/low-wall', ditype: 2,
    points: Float32Array.from([0, 0, -50, 0, 12, -50, 0, 12, 50, 0, 0, 50]) };
  const polys = [floor, wall], ground = packGround(params, polys, polys.map((p, i) => ({ modelName: 'worldmodel', path: p.path, first: i, count: 1 })));
  const slots: SpawnSlot[] = [0, 1].flatMap((side) => Array.from({ length: 8 }, (_, index) => ({ side, index,
    position: [side ? 120 : -100, 0, index * 60], onFloor: true, step: side ? 6 : 2,
    facing: side ? [-1, 0] : [1, 0], loc: { map: 0, x: 0, z: 0 } } as SpawnSlot)));
  const map: SimMap = { stem: 'MP99', name: 'SQUAD TEST', ground, grid: groundGrid(ground), slots, respawns: [], spawns: null, notes: [] };
  const rifle = { ...HELD_RIFLE, magazine: 30, mags: 3, impactDamage: 0.01 }, pistol = { ...HELD_SIDEARM, impactDamage: 0.01 };
  const loadout = [rifle.id, pistol.id, 255, 255, 255] as const;
  const kits: SimKits = { table: { arsenal: { items: new Map(), byName: new Map(), order: [] },
    records: new Map([[rifle.id, rifle], [pistol.id, pistol]]), rounds: new Map() },
  map: { valves: new Map(), selectable: { seal: [], terrorist: [] },
    kits: { seal: [{ type: 'S', character: 's', loadout }], terrorist: [{ type: 'T', character: 't', loadout }] } } };
  const nodes: NavigationData['nodes'] = [];
  for (let x = 0; x < 20; x++) for (let z = 0; z < 21; z++) nodes.push({ at: [10 + x * 10, 0, -100 + z * 10], component: 0,
    edges: [[x - 1, z], [x + 1, z], [x, z - 1], [x, z + 1]].filter(([a, b]) => a! >= 0 && a! < 20 && b! >= 0 && b! < 21).map(([a, b]) => a! * 21 + b!) });
  let now = 0;
  const events: ServerEvent[] = [];
  const room = new Room(map, null, { rules: 'respawn', heldLaunch: true, now: () => now, random: () => 0.5, combatReport: true }, null, kits);
  room.hello(1, { send: (f) => { if (typeof f === 'string') events.push(JSON.parse(f)); }, close: () => {} },
    { type: 'hello', version: PROTOCOL_VERSION, name: 'Tester', map: 'MP99' }, '', { host: true, side: 'seal' });
  const bots = new MatchBots(room, { random: () => 0.5, navigation: { version: 2, map: 'MP99', nodes }, kits,
    teamProfile: { seal: [], terrorist: [] }, ...options });
  bots.setRoster({ seal: 0, terrorist: 2 });
  const step = (ticks = 1) => { for (let i = 0; i < ticks; i++) { now += 1000 / TICK_HZ; bots.step(); room.step(); } };
  room.launch(0); step();
  seatAtSlots(room);                                           // H315: a respawn room; the scene's poses are the slots'
  const [mover, supporter] = bots.botIds() as [number, number];
  while (room.player(mover)!.mags[0].rounds() > 3) room.player(mover)!.mags[0].fire();
  return { room, bots, mover, supporter, events, step };
}

describe('squad actions through normal Room controls', () => {
  // P537-L3 pursuit (Fuse's 7a2b34909), behind its switch: on, a throw releases the promise; off, main's (it holds).
  it.each([true, false])('releases covering-fire promises while the supporter is committed to a throw (pursuit %s)', (pursuit) => {
    const r = setup({ behaviours: { ...BOT_BEHAVIOURS_OFF, pursuit } });
    for (let tick = 0; tick < 3 * TICK_HZ && r.bots.stats().actors.find(a => a.id === r.supporter)!.squad.role !== 'supporter'; tick++) r.step();
    expect(r.bots.stats().actors.find(a => a.id === r.supporter)!.squad.role).toBe('supporter');
    const actor = (r.bots as any).actors.get(r.supporter);
    actor.throwHoldUntil = r.room.tick + TICK_HZ;
    r.step();
    expect(r.bots.stats().actors.find(a => a.id === r.supporter)!.squad.role).toBe(pursuit ? 'independent' : 'supporter');
    if (pursuit) expect(r.bots.stats().actors.find(a => a.id === r.mover)!.squad.partner).toBeNull();
  });

  it('moves one CPU into reserved cover while its partner holds and fires accepted finite-ammunition suppression', () => {
    const r = setup();
    let witnessed = false, arrived = false;
    const total = r.room.player(r.supporter)!.mags[0].total();
    for (let tick = 0; tick < 12 * TICK_HZ; tick++) {
      const before = r.bots.stats().actors.find((a) => a.id === r.mover)!.feet;
      const count = r.events.length; r.step();
      const actors = r.bots.stats().actors, mover = actors.find((a) => a.id === r.mover)!, supporter = actors.find((a) => a.id === r.supporter)!;
      if (mover.squad.role === 'mover' && supporter.squad.role === 'supporter'
        && Math.hypot(mover.feet[0]! - before[0]!, mover.feet[2]! - before[2]!) > 0
        && r.events.slice(count).some((e) => e.type === 'shot' && e.id === r.supporter)) {
        witnessed = true;
        expect(supporter.planning.action).toBe('suppress');
        expect(Math.hypot(...supporter.velocity)).toBeLessThan(0.01);
        expect(mover.squad.reservation).not.toBeNull();
      }
      if (witnessed && mover.cover && mover.behaviour === 'reload') {
        arrived = true;
        expect(supporter.squad.partner).toBeNull();
        break;
      }
    }
    expect(witnessed, JSON.stringify(r.bots.stats().actors)).toBe(true);
    expect(arrived, JSON.stringify(r.bots.stats().actors)).toBe(true);
    expect(r.room.player(r.supporter)!.mags[0].total()).toBeLessThan(total);
    expect(r.events.some((e) => e.type === 'combat' && e.attacker?.id === r.supporter && e.status === 'applied')).toBe(true);
  });

  it('cancels the lease and suppression when an ally occupies the firing lane', () => {
    const r = setup();
    for (let tick = 0; tick < 3 * TICK_HZ && r.bots.stats().actors.find((a) => a.id === r.supporter)!.squad.role !== 'supporter'; tick++) r.step();
    const actor = r.bots.stats().actors.find((a) => a.id === r.supporter)!;
    expect(actor.squad.role).toBe('supporter');
    const from = actor.feet, enemy = r.room.player(1)!.sim.walker.state;
    r.room.player(r.mover)!.sim.walker.place((from[0]! + enemy.x) / 2, 0, (from[2]! + enemy.z) / 2);
    const count = r.events.length;
    r.step();
    expect(r.bots.stats().actors.find((a) => a.id === r.supporter)!.squad).toMatchObject({ role: 'independent', partner: null, reason: 'lane-blocked' });
    expect(r.events.slice(count).some((e) => e.type === 'shot' && e.id === r.supporter)).toBe(false);
  });
  it('cancels on lost visual contact and never follows the hidden actor location', () => {
    const r = setup();
    for (let tick = 0; tick < 3 * TICK_HZ && r.bots.stats().actors.find((a) => a.id === r.supporter)!.squad.role !== 'supporter'; tick++) r.step();
    const actor = r.bots.stats().actors.find((a) => a.id === r.supporter)!;
    expect(actor.squad.role).toBe('supporter');
    r.room.player(1)!.sim.walker.place(300, 0, 300);
    r.step(8);
    const lost = r.bots.stats().actors.find((a) => a.id === r.supporter)!;
    expect(lost).toMatchObject({ target: null, lastKnown: actor.lastKnown, squad: { role: 'independent', partner: null } });
    expect(lost.planning.action).not.toBe('suppress');
    const count = r.events.length; r.step();
    expect(r.events.slice(count).some((e) => e.type === 'shot' && e.id === r.supporter)).toBe(false);
  });
  it('BOP-S: a bot a hair off its hide point on the exposed side does not stand there for good', () => {
    // The deadlock traced on the measured budget (bf's next brief): the hide point at the low wall's end is protected,
    // a spot 0.1 unit off it is not. `arrived` read protection at the feet, the cover's `valid` at the hide point, and
    // the last 0.1 unit is under the steering's dead band: the bot stood there, never arriving, never giving up.
    // Inert budget: the case is the rule's, not the scheduler's.
    const r = setup({ navWork: Infinity });
    r.step(30);                                                  // the contact is seen; the mover is low on rounds
    const internals = r.bots as unknown as { actors: Map<number, { cover: unknown; coverPhase: string; coverPlanAt: number; route: number[][] }>;
      positions: { protected(at: number[], threat: number[], crouch: boolean): boolean }; squad: { reserve(id: number, c: unknown): boolean } };
    const hide = [20, 0, 60], exposed = [19.94, 0, 60.08], threat = [-100, 0, 0];
    expect(internals.positions.protected(hide, threat, true)).toBe(true);
    expect(internals.positions.protected(exposed, threat, true)).toBe(false);
    const cover = { hide, peek: hide, crouch: true, threat };
    const b = internals.actors.get(r.mover)!;
    expect(internals.squad.reserve(r.mover, cover)).toBe(true);
    Object.assign(b, { cover, coverPhase: 'hide', coverPlanAt: r.room.tick, route: [[...hide]] });
    r.room.player(r.mover)!.sim.walker.place(exposed[0]!, exposed[1]!, exposed[2]!);
    let resolved = -1;
    for (let tick = 0; tick < 240 && resolved < 0; tick++) {
      r.step();
      const s = r.room.player(r.mover)!.sim.walker.state;
      if (b.cover !== cover || internals.positions.protected([s.x, s.y, s.z], threat, true)) resolved = tick;
    }
    // Within the cover re-plan period (180 ticks) it is either protected at its feet or has given that cover up.
    expect(resolved, JSON.stringify(r.bots.stats().actors.find((a) => a.id === r.mover))).toBeGreaterThanOrEqual(0);
    expect(resolved).toBeLessThan(180);
  });

  it('BOP-S F3: a hide point given up as unreachable is not picked again at the next cover re-plan', () => {
    // bf's review F3, s11's bot 235 (1,686 ticks pinned on a re-picked hide point): a cover released because the bot
    // could not be protected at it was chosen again, deterministically, at the next re-plan. Here the bot is held 0.06
    // unit off the protected hide point (on its exposed side) until it gives the cover up; the re-plan is then let run
    // at once, and it must choose elsewhere.
    const r = setup({ navWork: Infinity });
    r.step(30);
    const internals = r.bots as unknown as { actors: Map<number, { cover: { hide: number[] } | null; coverPhase: string; coverPlanAt: number; route: number[][] }>;
      squad: { reserve(id: number, c: unknown): boolean } };
    const hide = [20, 0, 60], exposed = [19.94, 0, 60.08], threat = [-100, 0, 0];
    const cover = { hide, peek: hide, crouch: true, threat };
    const b = internals.actors.get(r.mover)!;
    expect(internals.squad.reserve(r.mover, cover)).toBe(true);
    Object.assign(b, { cover, coverPhase: 'hide', coverPlanAt: r.room.tick, route: [[...hide]] });
    let released = -1;
    for (let tick = 0; tick < 240 && released < 0; tick++) {
      r.room.player(r.mover)!.sim.walker.place(exposed[0]!, exposed[1]!, exposed[2]!);   // held off the hide point
      r.step();
      if (b.cover !== cover) released = tick;
    }
    expect(released, 'the cover is given up').toBeGreaterThanOrEqual(0);
    b.coverPlanAt = -1000;                                        // the next re-plan at the bot's next slot
    let next: { hide: number[] } | null = null;
    for (let tick = 0; tick < 60 && !next; tick++) { r.step(); next = b.cover; }
    expect(next, 'a new cover is chosen').not.toBeNull();
    expect(Math.hypot(next!.hide[0]! - hide[0]!, next!.hide[2]! - hide[2]!), JSON.stringify(next)).toBeGreaterThanOrEqual(24);   // RED: the same point
    // The re-look's R3: what a bot gave up is its life's; a death or a new round (resetCombat) forgets it.
    const kept = b as unknown as { givenUp?: unknown[] };
    expect(kept.givenUp?.length).toBeGreaterThan(0);
    (r.bots as unknown as { resetCombat(a: unknown): void }).resetCombat(b);
    expect(kept.givenUp ?? []).toEqual([]);                      // RED before R3: kept across the reset
  });

  it('BOP-S F1: the deadlock timer belongs to its cover -- a new cover near the bot is not given up at once', () => {
    // bf's review F1: the timer started near hide A and was left set when that cover went (a fight, a re-plan); a new
    // cover B within `waypoint`, its route not yet asked, inherited it and was released on its first tick. Here the
    // timer an earlier cover left is ~100 ticks old when cover B is granted 4 units from the bot.
    const r = setup({ navWork: Infinity });
    r.step(30);
    const internals = r.bots as unknown as { actors: Map<number, { cover: unknown; coverPhase: string; coverPlanAt: number; route: number[][]; coverStep?: unknown }>;
      squad: { reserve(id: number, c: unknown): boolean } };
    const hide = [20, 0, 60], threat = [-100, 0, 0];
    const cover = { hide, peek: hide, crouch: true, threat };
    const b = internals.actors.get(r.mover)!;
    expect(internals.squad.reserve(r.mover, cover)).toBe(true);
    r.room.player(r.mover)!.sim.walker.place(24, 0, 60);        // 4 units off, on the exposed side
    Object.assign(b, { cover, coverPhase: 'hide', coverPlanAt: r.room.tick, route: [],
      coverStep: { cover: { ...cover }, steered: 100, stretched: false } });   // an earlier cover's timer, run out
    for (let tick = 0; tick < 30; tick++) {
      r.step();
      expect(b.cover, `released on tick ${tick}`).toBe(cover);  // RED: released at once on the stale timer
    }
  });

  it('BOP-S batch 7: a cover whose route ends 14 short of its hide is given up, not stood at for good', () => {
    // s43 (36k, budget 16): bot 232 in take-cover 1,762 ticks at (925.8, 100, 1123.5). Its hide (935.7, 100, 1133.6) is
    // MP2 node 8993, which no body stands on (LATER 564): `nearest` attaches it to node 8918, 14.14 off, and every route
    // ends there. Not arrived (14 > 2, the cover's arrival), the last point never popped (only once arrived), no re-plan (only on an empty
    // route), the deadlock rule only within 6 of the hide: it stood for good. Here the route to the hide is made to end
    // 14.1 short (the s43 geometry, on the synthetic map), and the bot stands at that end.
    const r = setup({ navWork: Infinity });
    r.step(30);
    type Cover = { hide: number[]; peek: number[]; crouch: boolean; threat: number[] };
    const internals = r.bots as unknown as { actors: Map<number, { cover: Cover | null; coverPhase: string; coverPlanAt: number; route: number[][] }>;
      squad: { reserve(id: number, c: unknown): boolean }; navigation: { routeSteps(from: number[], to: number[]): Generator<void, number[][], void> } };
    const hide = [40, 0, 60], end = [30, 0, 50], threat = [-100, 0, 0];
    const nav = internals.navigation, routeSteps = nav.routeSteps.bind(nav);
    nav.routeSteps = function* (from: number[], to: number[]) {
      if (Math.hypot(to[0]! - hide[0]!, to[2]! - hide[2]!) < 0.01) return [[...end]];   // ends 14.1 short, as at s43
      return yield* routeSteps(from, to);
    };
    const cover: Cover = { hide, peek: hide, crouch: true, threat };
    const b = internals.actors.get(r.mover)!;
    expect(internals.squad.reserve(r.mover, cover)).toBe(true);
    r.room.player(r.mover)!.sim.walker.place(end[0]! + 0.1, 0, end[2]! - 0.1);   // where its route ends, as at s43
    Object.assign(b, { cover, coverPhase: 'hide', coverPlanAt: r.room.tick, route: [] });
    let released = -1;
    for (let tick = 0; tick < 6 * TICK_HZ && released < 0; tick++) { r.step(); if (b.cover !== cover) released = tick; }
    const s = r.room.player(r.mover)!.sim.walker.state;
    expect(released, `released (at ${s.x.toFixed(1)},${s.z.toFixed(1)}, route ${JSON.stringify(b.route)})`).toBeGreaterThanOrEqual(0);   // RED: never
    expect(released).toBeLessThan(60);                            // at the route's first answer (the stagger, 15 ticks)
    let next: Cover | null = null, moved = false;
    // Within the cover re-plan period (`coverPlanTicks`) after the give-up, and a slot: 8 s.
    for (let tick = 0; tick < 8 * TICK_HZ && !next && !moved; tick++) {
      r.step();
      next = b.cover && b.cover !== cover ? b.cover : null;
      const now = r.room.player(r.mover)!.sim.walker.state;
      moved = Math.hypot(now.x - s.x, now.z - s.z) > 4;
    }
    expect(next !== null || moved, 'a different cover is chosen, or the bot moves').toBe(true);
    if (next) expect(Math.hypot(next.hide[0]! - hide[0]!, next.hide[2]! - hide[2]!)).toBeGreaterThan(0.01);
  });

  it('BOP-S batch 7 review: a PEEK route ending short keeps its cover -- the rule is the hide phase\'s', () => {
    // The review's high: the short-route rule also fired for the peek point, giving the whole cover up where the bot
    // used to peek from its route's end. A peek is no permanent stall (it ends when the contact is lost past
    // `coverPhaseUntil`, or the action turns back to hide), so the rule is limited to the hide phase.
    const r = setup({ navWork: Infinity });
    r.step(30);
    type Cover = { hide: number[]; peek: number[]; crouch: boolean; threat: number[] };
    type Plan = { update(o: unknown): { action: string | null } };
    const internals = r.bots as unknown as { actors: Map<number, { cover: Cover | null; coverPhase: string; coverPhaseUntil: number;
      coverPlanAt: number; route: number[][]; planner: Plan }>; squad: { reserve(id: number, c: unknown): boolean };
      navigation: { routeSteps(from: number[], to: number[]): Generator<void, number[][], void> } };
    const hide = [20, 0, 60], peek = [20, 0, 80], end = [30, 0, 90], threat = [-100, 0, 0];
    const nav = internals.navigation, routeSteps = nav.routeSteps.bind(nav);
    let asked = 0;
    nav.routeSteps = function* (from: number[], to: number[]) {
      if (Math.hypot(to[0]! - peek[0]!, to[2]! - peek[2]!) < 0.01) { asked++; return [[...end]]; }   // 14.1 short of the peek
      return yield* routeSteps(from, to);
    };
    const cover: Cover = { hide, peek, crouch: true, threat };
    const b = internals.actors.get(r.mover)!, update = b.planner.update.bind(b.planner);
    b.planner.update = (o: unknown) => ({ ...update(o), action: 'peek' });   // the planner's answer forced to a peek
    expect(internals.squad.reserve(r.mover, cover)).toBe(true);
    r.room.player(r.mover)!.sim.walker.place(end[0]!, 0, end[2]!);
    Object.assign(b, { cover, coverPhase: 'peek', coverPhaseUntil: r.room.tick + 10_000, coverPlanAt: r.room.tick, route: [] });
    let kept = 0;
    for (let tick = 0; tick < 90; tick++) { r.step(); if (b.cover === cover) kept++; else break; }
    expect(asked, 'the peek route was asked').toBeGreaterThan(0);
    expect(kept, 'ticks the cover was kept after its peek route ended short').toBe(90);   // RED before: released at the answer
  });

  it('BOP-S batch 8: a late PEEK answer landing after the phase turned to hide is dropped, and a hide route asked', () => {
    // The batch 7 re-look's finding (pre-existing): the cover route callback's late guard checked only the cover, so a
    // peek route asked in the peek phase and landing after the action turned to take-cover (the phase set to hide, the
    // route emptied) filled the route with the peek route in the hide phase -- and a non-empty route asks nothing new,
    // so the bot walked to the peek route's end and, ending 10 or more from the hide, stood there (s43 by another road).
    // A small budget; the peek route made to cost 3 work units, so it lands two ticks after it is asked.
    const r = setup({ navWork: 1 });
    r.step(30);
    type Cover = { hide: number[]; peek: number[]; crouch: boolean; threat: number[] };
    type Plan = { update(o: unknown): { action: string | null } };
    const internals = r.bots as unknown as { actors: Map<number, { cover: Cover | null; coverPhase: string; coverPhaseUntil: number;
      coverPlanAt: number; route: number[][]; planner: Plan }>; squad: { reserve(id: number, c: unknown): boolean };
      jobs: { pending(bot: number, slot: string): boolean };
      navigation: { work: number; routeSteps(from: number[], to: number[]): Generator<void, number[][], void> } };
    const hide = [20, 0, 60], peek = [20, 0, 80], peekEnd = [30, 0, 90], threat = [-100, 0, 0];
    const nav = internals.navigation, routeSteps = nav.routeSteps.bind(nav);
    let hideAsked = 0;
    nav.routeSteps = function* (from: number[], to: number[]) {
      if (Math.hypot(to[0]! - peek[0]!, to[2]! - peek[2]!) < 0.01) {
        for (let i = 0; i < 3; i++) { nav.work += 1; yield; }
        return [[...peekEnd]];
      }
      if (Math.hypot(to[0]! - hide[0]!, to[2]! - hide[2]!) < 0.01) hideAsked++;
      return yield* routeSteps(from, to);
    };
    const cover: Cover = { hide, peek, crouch: true, threat };
    const b = internals.actors.get(r.mover)!, update = b.planner.update.bind(b.planner);
    let action = 'peek';
    b.planner.update = (o: unknown) => ({ ...update(o), action });
    expect(internals.squad.reserve(r.mover, cover)).toBe(true);
    r.room.player(r.mover)!.sim.walker.place(60, 0, 20);
    Object.assign(b, { cover, coverPhase: 'peek', coverPhaseUntil: r.room.tick + 10_000, coverPlanAt: r.room.tick, route: [] });
    let waited = 0;
    while (!internals.jobs.pending(r.mover, 'route') && waited++ < 30) r.step();
    expect(internals.jobs.pending(r.mover, 'route'), 'the peek route waits at budget 1').toBe(true);
    action = 'take-cover';                                        // the phase turns to hide before the peek answer lands
    for (let tick = 0; tick < 10 && internals.jobs.pending(r.mover, 'route'); tick++) r.step();
    expect(internals.jobs.pending(r.mover, 'route'), 'the peek answer landed').toBe(false);
    expect(b.cover, 'the cover is kept').toBe(cover);
    expect(b.coverPhase).toBe('hide');
    expect(b.route, 'the late peek route is dropped in the hide phase').not.toEqual([peekEnd]);   // RED: the peek route
    for (let tick = 0; tick < 30 && !hideAsked; tick++) r.step();
    expect(hideAsked, 'a hide route is asked').toBeGreaterThan(0);
  });

  it('BOP-S job instrument: a late cover choice applied after the threat moved counts as stale, for that bot alone', () => {
    // Product track (counters only). Batch 10 (the review of 55f205ca0): the case is a late COVER CHOICE, not a
    // `plan:contact` answer -- the first form of this test leaned on the unfixed contact case (Codex's P2 on #572,
    // Chris's fix) and would fail once that fix merges. The mover needs a magazine, so it asks a cover against its
    // contact; the choice is made to cost 3 work units at budget 1, so it is pending when the contact moves 250 units;
    // it lands late, still applied (no cover yet), against a target that has since moved: one stale answer, its bot's.
    const r = setup({ navWork: 1 });
    r.step(30);
    type Cover = { hide: number[]; peek: number[]; crouch: boolean; threat: number[] };
    const internals = r.bots as unknown as { actors: Map<number, { cover: Cover | null; search: unknown; target: number | null; coverPlanAt: number }>;
      remember(b: unknown, id: number | null, at: number[]): void; jobs: { pending(bot: number, slot: string): boolean; noteApplied(stale: boolean): void };
      positions: { chooseSteps(...a: unknown[]): Generator<number | void, Cover | null, void> }; navigation: { work: number } };
    const first = [-100, 0, 0], second = [-100, 0, 250];
    const answer: Cover = { hide: [20, 0, 60], peek: [20, 0, 60], crouch: true, threat: first };
    const nav = internals.navigation;
    internals.positions.chooseSteps = function* () { for (let i = 0; i < 3; i++) { nav.work += 1; yield; } return answer; };
    const quiet = r.bots as unknown as Record<string, unknown>;
    for (const name of ['perceive', 'listen', 'hear', 'threatened']) quiet[name] = () => {};   // the contact is the test's
    type Plan = { update(o: unknown): { action: string | null } };
    const b = internals.actors.get(r.mover)! as unknown as { cover: Cover | null; planner: Plan };
    // Its plan held to take-cover: no walking plan, so no `plan:contact` job -- the stale answer is the cover choice's.
    const update = b.planner.update.bind(b.planner);
    b.planner.update = (o: unknown) => ({ ...update(o), action: 'take-cover' });
    Object.assign(b, { cover: null, search: null, target: null, coverPlanAt: -1000 });
    internals.remember(b, null, first);
    // Which bot each applied late answer was for, and whether it was stale: the count is the scheduler's own.
    const noted: { bot: number; stale: boolean }[] = [];
    let landing: number | null = null;
    const note = internals.jobs.noteApplied.bind(internals.jobs);
    internals.jobs.noteApplied = (stale: boolean) => { noted.push({ bot: landing ?? -1, stale }); note(stale); };
    const lateApplied = (quiet.lateApplied as (...a: unknown[]) => void).bind(r.bots);
    let current = -1;
    quiet.lateApplied = (...a: unknown[]) => { landing = current; try { lateApplied(...a); } finally { landing = null; } };
    const steps = (r.bots as unknown as { jobs: { advance(e: { job: { bot: number } }, ...rest: unknown[]): unknown } }).jobs;
    const advance = steps.advance.bind(steps);
    steps.advance = (e: { job: { bot: number } }, ...rest: unknown[]) => { const outer = current; current = e.job.bot; try { return advance(e, ...rest); } finally { current = outer; } };
    let waited = 0;
    while (!internals.jobs.pending(r.mover, 'cover') && waited++ < 30) r.step();
    expect(internals.jobs.pending(r.mover, 'cover'), 'the cover choice waits at budget 1').toBe(true);
    const before = r.bots.navigationStats();
    internals.remember(b, null, second);                         // the threat moves 250 units before the choice lands
    for (let tick = 0; tick < 5 && internals.jobs.pending(r.mover, 'cover'); tick++) r.step();
    const after = r.bots.navigationStats();
    expect(b.cover, 'the late cover choice was applied').toBe(answer);
    expect(after.staleApplied - before.staleApplied, 'one stale late answer').toBe(1);
    expect(noted.filter((n) => n.stale).map((n) => n.bot), 'and it was the mover\'s').toEqual([r.mover]);
    expect(after.completed).toBeGreaterThan(before.completed);
    for (const key of ['starved', 'maxAge', 'p99Age', 'lateApplied']) expect(after).toHaveProperty(key);
  });

  it('BOP-S batch 10 (a pin): turning to peek mid-walk drops the hide route and asks the peek route', () => {
    // The batch 8 study's finding was that the hide-to-peek switch (`action === 'peek'`) keeps the hide route, so the bot
    // would walk on to the hide and never reach a peek 16-40 off. A misread: the planner's action changing (take-cover
    // to peek) empties the route before the cover code runs (matchBots.ts ~:1409, `action !== previousAction`), and the
    // timed switch empties it itself (~:1556). This pins that the peek route is asked within two of the bot's slots.
    const r = setup({ navWork: Infinity });
    r.step(30);
    type Cover = { hide: number[]; peek: number[]; crouch: boolean; threat: number[] };
    type Plan = { update(o: unknown): { action: string | null } };
    const internals = r.bots as unknown as { actors: Map<number, { cover: Cover | null; coverPhase: string; coverPhaseUntil: number;
      coverPlanAt: number; route: number[][]; planner: Plan }>; squad: { reserve(id: number, c: unknown): boolean };
      navigation: { routeSteps(from: number[], to: number[]): Generator<void, number[][], void> } };
    const hide = [20, 0, 60], peek = [20, 0, 80], threat = [-100, 0, 0];
    const nav = internals.navigation, routeSteps = nav.routeSteps.bind(nav);
    let peekAsked = -1, tick = 0;
    nav.routeSteps = function* (from: number[], to: number[]) {
      if (peekAsked < 0 && Math.hypot(to[0]! - peek[0]!, to[2]! - peek[2]!) < 0.01) peekAsked = tick;
      return yield* routeSteps(from, to);
    };
    const cover: Cover = { hide, peek, crouch: true, threat };
    const b = internals.actors.get(r.mover)!, update = b.planner.update.bind(b.planner);
    let action = 'take-cover';
    b.planner.update = (o: unknown) => ({ ...update(o), action });
    expect(internals.squad.reserve(r.mover, cover)).toBe(true);
    r.room.player(r.mover)!.sim.walker.place(120, 0, 20);
    Object.assign(b, { cover, coverPhase: 'hide', coverPhaseUntil: 0, coverPlanAt: r.room.tick, route: [] });
    for (let i = 0; i < 20 && !b.route.length; i++) r.step();
    expect(b.route.length, 'walking its hide route').toBeGreaterThan(0);
    action = 'peek';                                              // it turns to peek before it reaches the hide
    b.coverPhaseUntil = r.room.tick + 10_000;                     // the peek holds (no early end by a lost contact)
    for (tick = 0; tick < 5 * TICK_HZ && peekAsked < 0; tick++) r.step();
    expect(peekAsked, 'the peek route is asked').toBeGreaterThanOrEqual(0);
    expect(peekAsked).toBeLessThan(30);                           // within two of its slots (15 ticks)
  });

  it('BOP-S batch 10: a late cover route lands when the phase flipped but its destination is the same point', () => {
    // The review of 55f205ca0, item 1: the phase guard (batch 8) dropped a VALID late answer when the peek is the hide
    // point (the cover choice sets peek = hide when the hide can fire, positions.ts \`chooseSteps\`). Both phases ask the
    // same key \`goto:x,y,z\`, so a re-ask keeps the old job, whose phase is the old one, and its answer was dropped after
    // the flip -- the bot stood for a slot or more. The guard now compares the asked destination with the current
    // phase's. Budget 1; the route made to cost 8 work units, so it lands after the turn's own reset of the route.
    const r = setup({ navWork: 1 });
    r.step(30);
    type Cover = { hide: number[]; peek: number[]; crouch: boolean; threat: number[] };
    type Plan = { update(o: unknown): { action: string | null } };
    const internals = r.bots as unknown as { actors: Map<number, { cover: Cover | null; coverPhase: string; coverPhaseUntil: number;
      coverPlanAt: number; route: number[][]; planner: Plan }>; squad: { reserve(id: number, c: unknown): boolean };
      jobs: { pending(bot: number, slot: string): boolean };
      navigation: { work: number; routeSteps(from: number[], to: number[]): Generator<void, number[][], void> } };
    // The route ends 1.4 off the point, inside the cover's arrival radius (`TACTICS_ADAPTATION.arrival`, 2), so the
    // short-route rule does not touch it. Each landing is seen where it lands (the job's `done`).
    const hide = [20, 0, 60], end = [21, 0, 61], threat = [-100, 0, 0];
    const nav = internals.navigation, routeSteps = nav.routeSteps.bind(nav);
    nav.routeSteps = function* (from: number[], to: number[]) {
      if (Math.hypot(to[0]! - hide[0]!, to[2]! - hide[2]!) < 0.01) { for (let i = 0; i < 8; i++) { nav.work += 1; yield; } return [[...end]]; }
      return yield* routeSteps(from, to);
    };
    const cover: Cover = { hide, peek: [...hide], crouch: true, threat };   // the peek is the hide point
    const b = internals.actors.get(r.mover)!, update = b.planner.update.bind(b.planner);
    let action = 'take-cover', shown = action;
    // The forced plan changes action once, at the flip, as a planner would: the step reads the previous action from the
    // snapshot, so it shows what the last update returned (else every turn would read a change and reset the route).
    b.planner.update = (o: unknown) => { shown = action; return { ...update(o), action }; };
    const snapshot = (b.planner as unknown as { snapshot(): { action: string | null } }).snapshot.bind(b.planner);
    (b.planner as unknown as { snapshot(): unknown }).snapshot = () => ({ ...snapshot(), action: shown });
    // Every answer to the mover's route slot that lands, and whether it was applied (the route set to it) or dropped.
    const landed: boolean[] = [];
    const sched = internals.jobs as unknown as { submit(job: { bot: number; slot: string; done(v: unknown): void }): unknown };
    const submit = sched.submit.bind(sched);
    sched.submit = (job) => {
      if (job.bot === r.mover && job.slot === 'route') {
        const done = job.done;
        job.done = (route: unknown) => { done(route); landed.push(b.route === route); };
      }
      return submit(job);
    };
    expect(internals.squad.reserve(r.mover, cover)).toBe(true);
    r.room.player(r.mover)!.sim.walker.place(120, 0, 20);
    Object.assign(b, { cover, coverPhase: 'hide', coverPhaseUntil: 0, coverPlanAt: r.room.tick, route: [] });
    let waited = 0;
    while (!internals.jobs.pending(r.mover, 'route') && waited++ < 30) r.step();
    expect(internals.jobs.pending(r.mover, 'route'), 'the hide route waits at budget 1').toBe(true);
    action = 'peek';                                              // the phase flips before it lands
    b.coverPhaseUntil = r.room.tick + 10_000;
    // Under fire: a peek with its lane clear (or a contact lost) would leave the cover; pressure holds it.
    (b as unknown as { pressureUntil: number }).pressureUntil = r.room.tick + 10_000;
    const before = landed.length;
    r.step();                                                    // the turn: the action change empties the route
    expect(b.coverPhase).toBe('peek');
    // Batch 11 (F1): the outcome, not that the job is still pending -- PR #584 cancels the route job on an action change,
    // so the answer may come from the old job (late, here) or from a new ask on the bot's next slot; either way an answer
    // to the current phase's destination lands and none is dropped.
    for (let tick = 0; tick < 45 && landed.length === before; tick++) r.step();
    const after = landed.slice(before);
    expect(after.length, 'an answer to the current destination landed').toBeGreaterThan(0);
    expect(after.every((applied) => applied), 'and none was dropped').toBe(true);   // RED before 882c00804: dropped
  });

  it('BOP-S batch 11 (F2): a late hide route landing in the peek phase is not held to the hide-phase short-route rule', () => {
    // The review of 8db19d311, F2: since 882c00804 a late cover route answer applies in the other phase when the peek is
    // the hide point (same destination, same key), but batch 7's short-route rule read the phase at the ASK: a hide route
    // ending 2 or more short that landed in the peek phase still gave the whole cover up (and the mirror, a peek route
    // landing in the hide phase, slipped past the rule). The rule now reads the phase at landing. Asserted on the
    // outcome -- the cover is kept through the turn and the landing -- so it holds whether or not the action change
    // also cancels the pending job (PR #584).
    const r = setup({ navWork: 1 });
    r.step(30);
    type Cover = { hide: number[]; peek: number[]; crouch: boolean; threat: number[] };
    type Plan = { update(o: unknown): { action: string | null } };
    const internals = r.bots as unknown as { actors: Map<number, { cover: Cover | null; coverPhase: string; coverPhaseUntil: number;
      coverPlanAt: number; route: number[][]; planner: Plan; pressureUntil: number }>; squad: { reserve(id: number, c: unknown): boolean };
      jobs: { pending(bot: number, slot: string): boolean };
      navigation: { work: number; routeSteps(from: number[], to: number[]): Generator<void, number[][], void> } };
    const hide = [20, 0, 60], end = [24, 0, 60], threat = [-100, 0, 0];   // the route ends 4 off: short in the hide phase
    const nav = internals.navigation, routeSteps = nav.routeSteps.bind(nav);
    nav.routeSteps = function* (from: number[], to: number[]) {
      if (Math.hypot(to[0]! - hide[0]!, to[2]! - hide[2]!) < 0.01) { for (let i = 0; i < 8; i++) { nav.work += 1; yield; } return [[...end]]; }
      return yield* routeSteps(from, to);
    };
    const cover: Cover = { hide, peek: [...hide], crouch: true, threat };   // the peek is the hide point
    const b = internals.actors.get(r.mover)!, update = b.planner.update.bind(b.planner);
    let action = 'take-cover';
    b.planner.update = (o: unknown) => ({ ...update(o), action });
    expect(internals.squad.reserve(r.mover, cover)).toBe(true);
    r.room.player(r.mover)!.sim.walker.place(120, 0, 20);
    Object.assign(b, { cover, coverPhase: 'hide', coverPhaseUntil: 0, coverPlanAt: r.room.tick, route: [] });
    let waited = 0;
    while (!internals.jobs.pending(r.mover, 'route') && waited++ < 30) r.step();
    expect(internals.jobs.pending(r.mover, 'route'), 'the hide route waits at budget 1').toBe(true);
    action = 'peek';                                              // the phase flips before it lands
    b.coverPhaseUntil = r.room.tick + 10_000;
    b.pressureUntil = r.room.tick + 10_000;                       // under fire: the peek keeps the cover
    let lost = -1;
    for (let tick = 0; tick < 40 && lost < 0; tick++) { r.step(); if (b.cover !== cover) lost = tick; }
    expect(b.coverPhase).toBe('peek');
    expect(lost, 'the cover is kept through the late answer').toBe(-1);   // RED: given up when the hide route lands
  });

  it('BOP-S batch 11 review (5): F2 through the TIMED hide-to-peek switch under fire, with no action change', () => {
    // The review of d8a3dd390, item 5: F1's and F2's cases flip the phase through an action change, the path PR #584
    // cancels route jobs on. Here the phase flips on the cover's own timer (`coverPhaseUntil`, the hide-to-peek switch)
    // while the plan stays `fire`: no action change, so the late hide route lands whatever #584 does. It ends 4 off the
    // point (peek == hide), short in the hide phase only: landing in the peek phase it must not end the cover (F2).
    const r = setup({ navWork: 1 });
    r.step(30);
    type Cover = { hide: number[]; peek: number[]; crouch: boolean; threat: number[] };
    type Plan = { update(o: unknown): { action: string | null }; snapshot(): { action: string | null } };
    const internals = r.bots as unknown as { actors: Map<number, { cover: Cover | null; coverPhase: string; coverPhaseUntil: number;
      coverPlanAt: number; route: number[][]; planner: Plan; target: number | null; lastSeen: number; pressureUntil: number }>;
      squad: { reserve(id: number, c: unknown): boolean }; jobs: { pending(bot: number, slot: string): boolean };
      navigation: { work: number; routeSteps(from: number[], to: number[]): Generator<void, number[][], void> } };
    const hide = [20, 0, 60], end = [24, 0, 60], threat = [-100, 0, 0];
    const nav = internals.navigation, routeSteps = nav.routeSteps.bind(nav);
    let landed = false;
    nav.routeSteps = function* (from: number[], to: number[]) {
      if (Math.hypot(to[0]! - hide[0]!, to[2]! - hide[2]!) < 0.01) {
        for (let i = 0; i < 20; i++) { nav.work += 1; yield; }
        landed = true; return [[...end]];
      }
      return yield* routeSteps(from, to);
    };
    const quiet = r.bots as unknown as Record<string, unknown>;
    for (const name of ['perceive', 'listen', 'hear', 'threatened']) quiet[name] = () => {};
    const id = r.mover, b = internals.actors.get(id)!;
    (r.room.player(id)!.mags[0] as unknown as { refill(): void }).refill();   // full: the timed switch needs no reload
    const update = b.planner.update.bind(b.planner), snapshot = b.planner.snapshot.bind(b.planner);
    b.planner.update = (o: unknown) => ({ ...update(o), action: 'fire' });   // fire throughout: no action change
    b.planner.snapshot = () => ({ ...snapshot(), action: 'fire' });
    const cover: Cover = { hide, peek: [...hide], crouch: true, threat };
    expect(internals.squad.reserve(id, cover)).toBe(true);
    r.room.player(id)!.sim.walker.place(120, 0, 20);
    Object.assign(b, { cover, coverPhase: 'hide', coverPhaseUntil: 0, coverPlanAt: r.room.tick, route: [], target: null });
    let waited = 0;
    while (!internals.jobs.pending(id, 'route') && waited++ < 30) { b.lastSeen = r.room.tick; r.step(); }
    expect(internals.jobs.pending(id, 'route'), 'the hide route waits at budget 1').toBe(true);
    b.coverPhaseUntil = r.room.tick + 2;                          // the cover's own timer turns it to peek
    let lost = -1, peeked = false;
    for (let tick = 0; tick < 60 && lost < 0 && !(landed && peeked && tick > 30); tick++) {
      b.lastSeen = r.room.tick;                                   // the contact fresh: no lost-sight release
      r.step();
      peeked ||= b.coverPhase === 'peek';
      if (b.cover !== cover) lost = tick;
    }
    expect(peeked, 'the timer turned it to peek').toBe(true);
    expect(landed, 'the late hide route landed').toBe(true);
    expect(lost, 'the cover is kept through the landing').toBe(-1);
  });

  it('BOP-S LF2: a supporter holding for its partner is no stalled walker -- the stall recovery never ends the pairing', () => {
    // The ladder review's LF2: a supporter keeps its place for its moving partner (it never replans, by design); planned
    // to a walking action with no route it counted as stalled after stuckTicks, and the recovery released the squad and
    // walked it away. The pairing lasts while the squad's mover walks into its cover, past the stall window.
    const r = setup({ navWork: Infinity });
    let paired = -1;
    for (let tick = 0; tick < 3 * TICK_HZ && paired < 0; tick++) {
      r.step();
      if (r.bots.stats().actors.find((a) => a.id === r.supporter)!.squad.role === 'supporter') paired = tick;
    }
    expect(paired, 'a supporter is paired').toBeGreaterThanOrEqual(0);
    // The supporter's plan is the review's case: approach (a walking action -- the lane closed under it), its route
    // empty, a plan tried before the pairing (lastPlan set). The planner's answer is forced to it; the rest is the room's.
    // A pin, not a RED: after LF1 (0ff6dd772) the action's change clears lastPlan, so the clock already holds for a
    // supporter, which never replans; the explicit `!supporting` guard keeps it so whatever lastPlan holds.
    type Plan = { update(o: unknown): { action: string | null } };
    const internals = r.bots as unknown as { actors: Map<number, { recoverUntil: number; lastPlan: number; planner: Plan }> };
    const s = internals.actors.get(r.supporter)!, update = s.planner.update.bind(s.planner);
    s.planner.update = (o: unknown) => ({ ...update(o), action: 'approach' });
    s.lastPlan = r.room.tick;
    const actions = new Set<string>();
    for (let tick = 0; tick < 3 * TICK_HZ; tick++) {
      r.step();
      const supporter = r.bots.stats().actors.find((a) => a.id === r.supporter)!;
      actions.add(`${supporter.planning.action}/${supporter.route}`);
      // Checked before the pairing's end is read: the stall recovery is what ended it (squad.release 'path-invalid').
      expect(internals.actors.get(r.supporter)!.recoverUntil > r.room.tick,
        `recovered while supporting (${[...actions].join(' ')}, ${supporter.squad.reason})`).toBe(false);
      if (supporter.squad.role !== 'supporter') break;
    }
  });

  it('BOP-S F2: the deadlock timer counts only ticks the bot is steered -- a reload near the hide point keeps the cover', () => {
    // bf's review F2: the timer started within `waypoint` of the hide point and counted every tick, while later code
    // holds the bot still (the reload, a support, an equipment, a yield); a reload begun in the open with a cover granted
    // 4 units away lost the cover mid-reload. The mover empties its rifle, starts the reload in the open, and is then
    // granted the hide point at the low wall's end 4 units off.
    const r = setup({ navWork: Infinity });
    r.step(30);
    const p = r.room.player(r.mover)!;
    while (p.mags[0].rounds() > 0) p.mags[0].fire();
    let reloading = false;
    for (let tick = 0; tick < 120 && !reloading; tick++) { r.step(); reloading = p.ran < p.reloadUntil[p.sim.weapon]!; }
    expect(reloading, 'the reload is under way').toBe(true);
    const internals = r.bots as unknown as { actors: Map<number, { cover: unknown; coverPhase: string; coverPlanAt: number; route: number[][] }>;
      squad: { reserve(id: number, c: unknown): boolean } };
    const hide = [20, 0, 60], threat = [-100, 0, 0], cover = { hide, peek: hide, crouch: true, threat };
    const b = internals.actors.get(r.mover)!;
    expect(internals.squad.reserve(r.mover, cover)).toBe(true);
    p.sim.walker.place(24, 0, 60);
    Object.assign(b, { cover, coverPhase: 'hide', coverPlanAt: r.room.tick, route: [] });
    // The review's case: the plan is the reload itself, which holds the bot still (dx zeroed where the command is
    // built). The planner's answer is forced to it, so the stall detector (a bot pushing a leg it cannot walk) stays out.
    const planner = (b as unknown as { planner: { update(o: unknown): { action: string | null } } }).planner;
    const update = planner.update.bind(planner);
    planner.update = (o: unknown) => ({ ...update(o), action: 'reload' });
    let held = 0;
    for (; held < 240 && p.ran < p.reloadUntil[p.sim.weapon]!; held++) {
      r.step();
      if (p.ran >= p.reloadUntil[p.sim.weapon]!) break;            // the reload ended in this step: what follows is play
      expect(b.cover, `released mid-reload after ${held} ticks`).toBe(cover);   // RED: released after 60
    }
    expect(held, 'the reload outlasted the old 60-tick timer').toBeGreaterThan(60);
  });

  it('BOP-S R2 pin: a walking action never keeps a search -- approach, patrol and investigate each clear it', () => {
    // batch 2's R2 rests on this: with lastPlan -1000 a walking bot's plan wait (LF1's hold) ends in a slot, because the
    // plan block, which skips a bot that has a search, is never kept from it by a search under a walking action.
    for (const walking of ['approach', 'patrol', 'investigate']) {
      const r = setup({ navWork: Infinity });
      r.step(30);
      r.room.player(1)!.sim.walker.place(-1000, 0, 1000);          // out of sight: the contact is a memory, no target
      r.step(30);
      type Plan = { update(o: unknown): { action: string | null } };
      const b = (r.bots as unknown as { actors: Map<number, { search: unknown; memory: number[] | null; target: number | null; planner: Plan }> }).actors.get(r.mover)!;
      b.target = null;                                            // no target this tick (the contact clause stays out)
      expect(b.memory).not.toBeNull();
      const update = b.planner.update.bind(b.planner);
      b.planner.update = (o: unknown) => ({ ...update(o), action: walking });
      b.search = { contact: [...b.memory!], points: [[...b.memory!]], visited: [], lookUntil: 0, facing: 0 };   // the same contact
      r.step();
      expect(b.search, `${walking} kept the search`).toBeNull();
    }
  });

  for (const navWork of [Infinity, undefined]) it(`lets two low-ammo members reserve separate cover without waiting on each other (navWork ${navWork ?? 'default'})`, () => {
    const r = setup(navWork ? { navWork } : {});
    while (r.room.player(r.supporter)!.mags[0].rounds() > 3) r.room.player(r.supporter)!.mags[0].fire();
    let separate = false;
    const reloaded = new Set<number>();
    for (let tick = 0; tick < 10 * TICK_HZ; tick++) {
      r.step();
      const actors = r.bots.stats().actors;
      if (actors.every((a) => a.squad.reservation)) {
        separate = true;
        const [a, b] = actors.map((actor) => actor.squad.reservation!);
        for (const p of [a!.hide, a!.peek]) for (const q of [b!.hide, b!.peek])
          expect(Math.hypot(p[0] - q[0], p[2] - q[2])).toBeGreaterThanOrEqual(24);
      }
      for (const actor of actors) if (actor.behaviour === 'reload') reloaded.add(actor.id);
      if (reloaded.size === 2) break;
    }
    expect(separate).toBe(true);
    expect(reloaded.size, JSON.stringify(r.bots.stats().actors)).toBe(2);
    r.room.leave(r.mover); r.step();
    expect(r.bots.stats().actors).toHaveLength(1);
    expect(r.bots.stats().actors[0]!.squad.partner).toBeNull();
  });
});
