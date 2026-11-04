import { describe, expect, it, vi } from 'vitest';
import type { CollisionOwner, GridParams, WorldPoly } from '@s2u/scene';
import { groundGrid, groundPolygons, packGround, Walker } from '../../viewer/src/mover';
import { Traversal } from '../../viewer/src/traversal';
import { MoverSim } from '../../viewer/src/net/moverSim';
import { BotLadderDrive } from '../src/bots/ladderDrive';
import { MatchBots } from '../src/bots/matchBots';
import { Room } from '../src/room';
import { PROTOCOL_VERSION, TICK_HZ } from '../../viewer/src/net/protocol';
import type { SimMap } from '../../viewer/src/simMap';
import { WalkingNavigation, type NavigationData } from '../src/bots/navigation';
import { BOT_BEHAVIOURS_OFF } from '../src/botGates';

/** P537-L3: Fuse's ladders (86d8be1b5) run behind their switch; his tests switch it on, and the off cases close the file. */
const LADDERS = { ladders: true } as const;
const LADDER_BEHAVIOURS = { ...BOT_BEHAVIOURS_OFF, ladders: true };

function ladderMap(blockedFoot = false): SimMap {
  const quad = (points: number[], ditype = 3, appflags = 0): WorldPoly => ({ modelName: 'worldmodel', path: 'test/ladder',
    region: 0, material: 25, ptcount: 4, cameratype: 0, ditype, appflags, points: Float32Array.from(points) });
  const polys = [
    quad([-100,0,0, 100,0,0, 100,0,100, -100,0,100]),
    quad([-100,40,-100, 100,40,-100, 100,40,0, -100,40,0]),
    quad([-100,0,0, 100,0,0, 100,40,0, -100,40,0], 2),
    quad([-3,0,0.2, 3,0,0.2, 3,40,0.2, -3,40,0.2], 2, 2),
    quad([3,40,0.2, -3,40,0.2, -3,50,0.2, 3,50,0.2], 2, 2),
  ];
  if (blockedFoot) polys.push(quad([-100,0,1.5, 100,0,1.5, 100,30,1.5, -100,30,1.5], 2));
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName:p.modelName, path:`test/${i}`, first:i, count:1 }));
  const ground = packGround(params, polys, owners);
  return { stem:'MP99', name:'LADDER TEST', ground, grid:groundGrid(ground), slots:[], respawns:[], spawns:null, notes:[] };
}
const graph: NavigationData = { version:2, map:'MP99', nodes:[
  {at:[0,0,20], edges:[1], component:0}, {at:[0,0,40], edges:[0], component:0},
  {at:[0,40,-20], edges:[3], component:2}, {at:[0,40,-40], edges:[2], component:2},
] };

describe('native ladders connect bot walking layers', () => {
  it('routes up and down the ladder without claiming its vertical transition is walkable', () => {
    const nav = new WalkingNavigation(ladderMap(), graph, false, LADDERS);
    expect(nav.canWalk([0,0,20], [0,40,-20])).toBe(false);
    expect(nav.route([0,0,40], [0,40,-40]).length).toBeGreaterThan(0);
    expect(nav.route([0,40,-40], [0,0,40]).length).toBeGreaterThan(0);
    expect(graph.nodes.map(n => n.component)).toEqual([0,0,2,2]);
  });

  it('rejects a ladder approach when the native player mover cannot mount through the blocking wall', () => {
    const nav = new WalkingNavigation(ladderMap(true), graph, false, LADDERS);
    expect(nav.ladderLinks.some(l => l.up)).toBe(false);
    expect(nav.rejectedLadderLinks).toEqual(expect.arrayContaining([expect.objectContaining({up:true,reason:'native-mount-refused'})]));
    expect(nav.route([0,0,40],[0,40,-40])).toEqual([]);
  });

  it.each([true, false])('ordinary bot commands complete native ladder travel (up=%s)', up => {
    const map = ladderMap(), nav = new WalkingNavigation(map, graph, false, LADDERS);
    const link = nav.ladderLinks.find(l => l.up === up)!;
    expect(link).toBeDefined();
    const walker = new Walker(map.grid), moves = new Traversal(map.grid, groundPolygons(map.ground));
    const sim = new MoverSim(walker, moves), drive = new BotLadderDrive(link, 0, (at,destination) => nav.canWalk(at, destination));
    const events: string[] = [];
    moves.on(e => { if (e.type === 'ladderMount' || e.type === 'ladderDismount') events.push(e.type); });
    walker.place(...link.entry); walker.state.yaw = 90;
    let result: ReturnType<BotLadderDrive['step']> | undefined;
    for (let tick = 0; tick < 3000; tick++) {
      result = drive.step(sim, tick);
      if (result.command) sim.apply(result.command);
      if (result.done) break;
    }
    expect(result).toMatchObject({ done:true, failed:false });
    expect(events).toEqual(['ladderMount','ladderDismount']);
    expect(walker.state.y).toBeCloseTo(link.exit[1], 1);
    expect(nav.canWalk([walker.state.x, walker.state.y, walker.state.z], link.exit)).toBe(true);
  });

  it.each([true,false])('a traversal timeout retains native control until a safe return dismount (up=%s)', up => {
    const map = ladderMap(), nav = new WalkingNavigation(map, graph, false, LADDERS), link = nav.ladderLinks.find(l => l.up === up)!;
    const walker = new Walker(map.grid), moves = new Traversal(map.grid, groundPolygons(map.ground));
    const sim = new MoverSim(walker, moves);
    const clear = (at: [number,number,number], destination: [number,number,number]) => nav.canWalk(at, destination);
    const begin = new BotLadderDrive(link, 0, clear);
    walker.place(...link.entry); walker.state.yaw = 0;
    for (let tick = 0; tick < 1200 && !(moves.state().kind === 'ladder' && walker.state.y > 12 && walker.state.y < 28); tick++) {
      const r = begin.step(sim,tick); if (r.command) sim.apply(r.command);
    }
    expect(moves.state().kind).toBe('ladder');
    const recovery = new BotLadderDrive(link, -60 * TICK_HZ, clear);
    let result = recovery.step(sim,0);
    expect(result.done).toBe(false);
    expect(result.command?.buttons).toBe(0);
    for (let tick = 0; tick < 1800; tick++) {
      result = recovery.step(sim,tick); if (result.command) sim.apply(result.command);
      if (result.done) break;
    }
    expect(result).toMatchObject({done:true, failed:true});
    expect(moves.busy()).toBe(false);
    expect(walker.state.y).toBeCloseTo(link.entry[1],1);
  });

  it('a roster removal clears the old ladder driver before the CPU seat is reused', () => {
    const map = ladderMap(); map.spawns = {a:[0,0,40], b:[80,0,80]};
    let now = 0;
    const room = new Room(map, null, {rules:'respawn', heldLaunch:true, now:() => now});
    room.hello(1, {send:() => {}, close:() => {}}, {type:'hello', version:PROTOCOL_VERSION, name:'Reuse tester', map:map.stem}, '', {host:true, side:'terrorist'});
    const bots = new MatchBots(room, {navigation:graph, random:() => 0.5, behaviours:LADDER_BEHAVIOURS});
    try {
      bots.setRoster({seal:1,terrorist:0}); room.launch(0); room.text(1,{type:'loaded'});
      const tick = () => {now += 1000 / TICK_HZ; bots.step(); room.step();};
      for (let i = 0; i < 5 * TICK_HZ; i++) tick();
      const id = bots.botIds()[0]!, player = room.player(id)!, nav = new WalkingNavigation(room.map, graph, false, LADDERS), link = nav.ladderLinks.find(l => l.up)!;
      player.sim.walker.place(...link.entry);
      const state = bots as unknown as {actors:Map<number,{route:[number,number,number][]}>; ladderDrives:Map<number,unknown>};
      state.actors.get(id)!.route = [[...link.entry],[...link.exit]];
      tick(); expect(state.ladderDrives.has(id)).toBe(true);
      bots.setRoster({seal:0,terrorist:0});
      expect(state.ladderDrives.has(id)).toBe(false);
      bots.setRoster({seal:1,terrorist:0});
      expect(bots.botIds()[0]).toBe(id);
      expect(state.ladderDrives.has(id)).toBe(false);
    } finally {bots.dispose();}
  });

  it.each([true, false])('the full bot controller keeps the native ladder input through dismount (up=%s)', up => {
    const map = ladderMap(); map.spawns = {a:[0,0,40], b:[80,0,80]};
    let now = 0;
    const room = new Room(map, null, {rules:'respawn', heldLaunch:true, now:() => now});
    room.hello(1, {send:() => {}, close:() => {}}, {type:'hello', version:PROTOCOL_VERSION, name:'Ladder tester', map:map.stem}, '', {host:true, side:'terrorist'});
    const bots = new MatchBots(room, {navigation:graph, random:() => 0.5, behaviours:LADDER_BEHAVIOURS});
    try {
      bots.setRoster({seal:1, terrorist:0}); room.launch(0); room.text(1, {type:'loaded'});
      const tick = () => { now += 1000 / TICK_HZ; bots.step(); room.step(); };
      for (let i = 0; i < 5 * TICK_HZ; i++) tick();
      expect(room.roundRunning).toBe(true);
      const id = bots.botIds()[0]!, player = room.player(id)!;
      const nav = new WalkingNavigation(room.map, graph, false, LADDERS), link = nav.ladderLinks.find(l => l.up === up)!;
      player.sim.walker.place(...link.entry); player.sim.walker.state.yaw = 90;
      const actor = (bots as unknown as {actors:Map<number,{route: [number,number,number][]}>}).actors.get(id)!;
      actor.route = [[...link.entry], [...link.exit]];
      const events: string[] = [];
      (player.sim.moves as Traversal).on(e => { if (e.type === 'ladderMount' || e.type === 'ladderDismount') events.push(e.type); });
      for (let i = 0; i < 1200 && !events.includes('ladderDismount'); i++) tick();
      expect(events).toEqual(['ladderMount','ladderDismount']);
      expect(player.sim.walker.state.y).toBeCloseTo(link.exit[1], 1);
    } finally { bots.dispose(); }
  });
});

describe('P537-L3 ladders off (every public room, Frostfire and Vigilance): main\'s navigation and bots exactly', () => {
  it('no ladder overlay: no links, no cross-level route, the graph\'s components as held', () => {
    const nav = new WalkingNavigation(ladderMap(), graph);
    expect(nav.ladderLinks).toEqual([]);
    expect(nav.rejectedLadderLinks).toEqual([]);
    expect(nav.route([0,0,40], [0,40,-40])).toEqual([]);
    expect(nav.nodes.map(n => n.component)).toEqual([0,0,2,2]);
    expect(nav.nodes[0]!.edges).toBe(graph.nodes[0]!.edges);    // main's held edges, shared, not copied
  });

  it('MatchBots.prepare (RoomBots\' path) overlays the ladders only with the room\'s switch on', async () => {
    const map = ladderMap(); map.spawns = {a:[0,0,40], b:[80,0,80]};
    const room = new Room(map, null, {rules:'respawn', heldLaunch:true});
    const links = async (behaviours?: typeof LADDER_BEHAVIOURS) => {
      const bots = await MatchBots.prepare(room, {navigation:graph, random:() => 0.5, ...(behaviours ? {behaviours} : {})}, async () => {});
      try { return (bots as unknown as {navigation:WalkingNavigation}).navigation.ladderLinks.length; } finally { bots.dispose(); }
    };
    expect(await links()).toBe(0);
    expect(await links(LADDER_BEHAVIOURS)).toBeGreaterThan(0);
  });

  it('a bot whose route reaches a ladder\'s entry never builds a ladder drive (the switch\'s code path is not entered)', () => {
    const map = ladderMap(); map.spawns = {a:[0,0,40], b:[80,0,80]};
    let now = 0;
    const room = new Room(map, null, {rules:'respawn', heldLaunch:true, now:() => now});
    room.hello(1, {send:() => {}, close:() => {}}, {type:'hello', version:PROTOCOL_VERSION, name:'Ladder tester', map:map.stem}, '', {host:true, side:'terrorist'});
    const bots = new MatchBots(room, {navigation:graph, random:() => 0.5});
    try {
      expect(bots.behaviours.ladders).toBe(false);
      bots.setRoster({seal:1, terrorist:0}); room.launch(0); room.text(1, {type:'loaded'});
      const tick = () => { now += 1000 / TICK_HZ; bots.step(); room.step(); };
      for (let i = 0; i < 5 * TICK_HZ; i++) tick();
      const id = bots.botIds()[0]!, player = room.player(id)!;
      const link = new WalkingNavigation(room.map, graph, false, LADDERS).ladderLinks.find(l => l.up)!;
      player.sim.walker.place(...link.entry);
      const state = bots as unknown as {actors:Map<number,{route:[number,number,number][]}>; ladderDrives:Map<number,unknown>; navigation:WalkingNavigation};
      const asked = vi.spyOn(state.navigation, 'ladderLink');
      state.actors.get(id)!.route = [[...link.entry],[...link.exit]];
      for (let i = 0; i < 30; i++) tick();
      expect(asked).not.toHaveBeenCalled();
      expect(state.ladderDrives.size).toBe(0);
    } finally { bots.dispose(); }
  });
});
