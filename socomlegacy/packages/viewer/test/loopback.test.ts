import { describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { FsAssetSource } from '@s2u/archive/node';
import {
  arsenalOf, DEFAULT_RIFLE, HELD_RIFLE, HELD_SIDEARM, isShotSurface, launchGrenade, M67, segmentHits, stepGrenade,
  type CollisionOwner, type GrenadeEvent, type GridParams, type HullCast, type Loadout, type SpawnSlot, type V3, type WorldPoly,
} from '@s2u/scene';
import { Room } from '../../match/src/room';
import { NetClient, type NetWalk } from '../src/net/client';
import { LOOPBACK_WAKE_TICKS, LoopbackMatch, loopbackDue, simMapOfLoaded, type LoadedForMatch } from '../src/net/loopback';
import { PROTOCOL_VERSION } from '../src/net/protocol';
import { loadMap } from '../src/loadMap';
import { kitGameType } from '../src/loadout';
import { simMapFromBytes } from '../src/simMap';
import { Button, groundGrid, groundPolygons, packGround, RESPAWN_RULES_ENABLED, TICK_HZ, WorldState, type Command, type Knock, type MapMeta, type ServerEvent, type SimKits } from '../src/sim';

/**
 * The page's single-player match (owner, 2026-09-29: "let's make offline tick rounds etc too"): the server's own `Room`
 * run in the page behind a socket that never leaves it, so offline plays the same rounds, damage, deaths and respawns
 * as a match, through the same `NetClient` and `NetPage` (`./loopback`).
 */

const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };

function loaded() {
  const floor: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
  };
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  const slot = (side: 0 | 1, index: number, x: number, z: number): SpawnSlot => ({
    side, index, position: [x, 0, z], onFloor: true, step: 2, facing: [1, 0], loc: { map: 0, x: 0, z: 0 },
  });
  return {
    path: 'RUN/MP99.ZDB', name: 'FLAT', ground: packGround(PARAMS, [floor], owners),
    slots: [slot(0, 0, -100, 0), slot(1, 0, 100, 0)], respawns: [slot(0, 0, -300, 0)], doors: [],
  };
}

/** The walk as the net client drives it, recording. */
class Walk implements NetWalk {
  tap: ((cmd: Omit<Command, 'seq'>, feet: [number, number, number]) => void) | null = null;
  spawns: { at: readonly number[]; yaw: number }[] = [];
  knocks: Knock[] = [];
  locked = false;
  feet: [number, number, number] = [0, 0, 0];
  setNetTap(tap: Walk['tap']): void { this.tap = tap; }
  respawn(at: readonly [number, number, number], yaw: number): boolean { this.spawns.push({ at, yaw }); this.feet = [at[0], at[1], at[2]]; return true; }
  nudge(dx: number, dy: number, dz: number): void { this.feet = [this.feet[0] + dx, this.feet[1] + dy, this.feet[2] + dz]; }
  setLocked(on: boolean): void { this.locked = on; }
  knock(k: Knock): boolean { this.knocks.push(k); return true; }
  /** One page tick: the stick at rest. */
  tick(): void { this.tap?.({ forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 }, this.feet); }
}

const flush = async (): Promise<void> => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

/**
 * The room joined as the page does, asking for `rules` (respawn by default here, the room these tests pin; OT.R71 offers
 * it, and a page naming none plays classic). `respawnRules` false pins the classic-only path.
 */
async function join(rules: 'respawn' | 'classic' = 'respawn', respawnRules = true, map: LoadedForMatch = loaded()) {
  const match = new LoopbackMatch(simMapOfLoaded(map), null, { rules, auto: false, respawnRules });
  const walk = new Walk();
  const events: ServerEvent[] = [];
  const client = new NetClient({ url: 'loopback:', map: 'MP99', name: 'Solo', socket: match.socket }, walk);
  client.on((ev) => events.push(ev));
  await flush();
  return { match, walk, events, client };
}

/** `n` page ticks, each with the room stepped once (the page and the room at the same 60 Hz). */
async function run(ctx: Awaited<ReturnType<typeof join>>, n: number): Promise<void> {
  for (let i = 0; i < n; i++) { ctx.walk.tick(); ctx.match.step(); }
  await flush();
}

describe('the single-player match (./loopback)', () => {
  it('with 150 ms frame gaps the clock runs elapsed x 60 ticks and drops none; a stall over 1 s is dropped', () => {
    const period = 1000 / TICK_HZ;
    let next = 0;
    let steps = 0;
    const gaps = 20;
    const gap = 150;
    for (let i = 1; i <= gaps; i++) {
      const due = loopbackDue(next, i * gap, period);
      steps += due.steps;
      next = due.next;
    }
    expect(steps).toBe(gaps * gap / 1000 * TICK_HZ);
    expect(next).toBe(gaps * gap);
    expect(loopbackDue(0, 1000, period)).toEqual({ steps: TICK_HZ, next: 1000 });
    expect(loopbackDue(0, 1000 + period, period)).toEqual({ steps: 0, next: 1000 + period });
    // A wake with no C4 live uses the dedicated server's five-tick cap (research 209 §18).
    expect(loopbackDue(0, 150, period, LOOPBACK_WAKE_TICKS)).toEqual({ steps: LOOPBACK_WAKE_TICKS, next: LOOPBACK_WAKE_TICKS * period });
  });

  it('a wake with no C4 live catches up five ticks and publishes them before it returns', async () => {
    const ctx = await join();
    const t0 = 1_000_000;
    ctx.match.drain(t0);
    const tick = ctx.match.room.tick;
    const before = ctx.events.length;
    ctx.match.timerWake(t0 + 200);
    expect(ctx.match.room.tick - tick).toBe(LOOPBACK_WAKE_TICKS);
    expect(ctx.events.length).toBeGreaterThan(before);
  });

  // P7 (the online-parity sweep's class G guard, P34): the loopback's delay option -- a browser/network adaptation for the
  // tests (and a latency-injected run), no original. Each frame crosses `delayMs` after it was sent, each way, in order.
  it('delayMs: every frame crosses that many ms after it was sent, each way, in send order', async () => {
    vi.useFakeTimers();
    try {
      const match = new LoopbackMatch(simMapOfLoaded(loaded()), null, { rules: 'respawn', auto: false, delayMs: 100 });
      const sock = match.socket('loopback:');
      const got: string[] = [];
      sock.onmessage = (ev) => { const d = ev.data; got.push(typeof d === 'string' ? (JSON.parse(d) as { type: string }).type : 'binary'); };
      await flush();
      sock.send(JSON.stringify({ type: 'hello', version: PROTOCOL_VERSION, name: 'Solo', map: 'MP99' }));
      vi.advanceTimersByTime(99);
      await flush();
      expect(match.room.player(1), 'the hello not yet at the room').toBeUndefined();
      vi.advanceTimersByTime(1);
      await flush();
      expect(match.room.player(1), 'the hello at the room 100 ms on').toBeDefined();
      expect(got, 'the welcome not yet back').toEqual([]);
      vi.advanceTimersByTime(100);
      await flush();
      expect(got[0]).toBe('welcome');
      const n = got.length;
      sock.send(JSON.stringify({ type: 'ping', t: 1 }));
      sock.send(JSON.stringify({ type: 'ping', t: 2 }));
      vi.advanceTimersByTime(199);
      await flush();
      expect(got.slice(n).filter((t) => t === 'pong'), 'one round trip is 200 ms').toEqual([]);
      vi.advanceTimersByTime(1);
      await flush();
      expect(got.slice(n).filter((t) => t === 'pong')).toEqual(['pong', 'pong']);
      match.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a catch-up delivers the room\'s frames before it returns', async () => {
    const ctx = await join();
    const before = ctx.events.length;
    ctx.match.drain(performance.now() + 500);
    expect(ctx.events.length).toBeGreaterThan(before);
  });

  it("a direct reply sent after a visible timer wake crosses behind that wake's frames, none held without a C4 (#346's reviews: in order)", async () => {
    const match = new LoopbackMatch(simMapOfLoaded(loaded()), null, { rules: 'respawn', auto: false });
    const sock = match.socket('loopback:');
    const got: string[] = [];
    sock.onmessage = (ev) => {
      const data = ev.data;
      got.push(typeof data === 'string' ? (JSON.parse(data) as { type: string }).type : 'binary');
    };
    await flush();
    sock.send(JSON.stringify({ type: 'hello', version: PROTOCOL_VERSION, name: 'Solo', map: 'MP99' }));
    await flush();
    const t0 = performance.now();
    match.drain(t0);                                             // a visible page's frame: the next wake may hold a detonate
    await flush();
    const before = got.length;
    match.timerWake(t0 + 200);                                   // the in-page clock steps between frames; no C4 is live
    const atWake = got.length - before;
    expect(atWake, "the wake's frames publish before it returns (only a detonate is held)").toBeGreaterThan(1);
    sock.send(JSON.stringify({ type: 'ping', t: 1 }));           // the room answers at once (`pong`)
    await flush();
    const after = got.slice(before);
    expect(after.indexOf('pong'), `after every frame of the wake: ${after.join(',')}`).toBe(atWake);
    match.drain(t0 + 200);
    await flush();
    expect(got.slice(before).filter((t) => t === 'pong'), 'delivered once').toHaveLength(1);
    match.stop();
  });

  it("a reply the room sent before a frame's drain crosses ahead of that drain's ticks (#346's narrow review: in order)", async () => {
    const match = new LoopbackMatch(simMapOfLoaded(loaded()), null, { rules: 'respawn', auto: false });
    const sock = match.socket('loopback:');
    const got: string[] = [];
    sock.onmessage = (ev) => {
      const data = ev.data;
      got.push(typeof data === 'string' ? (JSON.parse(data) as { type: string }).type : 'binary');
    };
    await flush();
    sock.send(JSON.stringify({ type: 'hello', version: PROTOCOL_VERSION, name: 'Solo', map: 'MP99' }));
    await flush();
    const before = got.length;
    sock.send(JSON.stringify({ type: 'ping', t: 1 }));           // the page's ping from its walk, before `solo?.drain`
    match.drain(performance.now() + 200);                         // the same frame's drain: 12 ticks of the room's frames
    await flush();
    const after = got.slice(before);
    expect(after.length, 'the drain stepped').toBeGreaterThan(1);
    expect(after.indexOf('pong'), `first, as a socket's would: ${after.join(',')}`).toBe(0);
    match.stop();
  });

  it('builds the room\'s map from the loaded map: its own copy of the hull (the room\'s doors turn its own)', () => {
    const l = loaded();
    const m = simMapOfLoaded(l);
    expect(m.stem).toBe('MP99');
    expect(m.ground).not.toBe(l.ground);
    expect(m.ground.points).toEqual(l.ground.points);
    expect(m.respawns).toHaveLength(1);
    expect(groundGrid(m.ground)).toBeTruthy();
  });

  /** MAP-02: the flat map with an arch -- its healthy wall across x 10, its rubble zAnim turns off (research 171 s4). */
  const archMap = (): LoadedForMatch & { ground: NonNullable<LoadedForMatch['ground']>; meta: MapMeta } => {
    const l = loaded();
    const wall = (path: string, x: number): WorldPoly => ({
      modelName: 'worldmodel', path, region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
      points: Float32Array.from([x, 0, -100, x, 0, 100, x, 50, 100, x, 50, -100]),
    });
    const floor = groundPolygons(l.ground)[0]!;
    const owners: CollisionOwner[] = [
      { modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1, flags: 0x1001 },
      { modelName: 'worldmodel', path: 'worldmodel/arch/healthy', first: 1, count: 1, flags: 0x1001 },
      { modelName: 'worldmodel', path: 'worldmodel/arch/destroyed', first: 2, count: 1, flags: 0x1001 },
    ];
    const ground = packGround(PARAMS, [{ ...floor, points: Float32Array.from(floor.points) }, wall('worldmodel/arch/healthy', 10), wall('worldmodel/arch/destroyed', 30)], owners);
    const paths = ['worldmodel/floor0', 'worldmodel/arch', 'worldmodel/arch/healthy', 'worldmodel/arch/destroyed'];
    const instances = paths.map((path, id) => ({ id, path, node: path.split('/').pop()!, modelName: 'worldmodel', root: path }));
    const meta: MapMeta = {
      stem: 'MP99', actions: [], instances, instanceByPath: new Map(instances.map((i) => [i.path, i.id])), diagnostics: [], initial: [
        { path: 'worldmodel/arch/healthy', deactivate: false, saveActive: true, saveTransform: false, saveParent: false },
        { path: 'worldmodel/arch/destroyed', deactivate: true, saveActive: true, saveTransform: false, saveParent: false },
      ],
    };
    return { ...l, ground, meta };
  };

  it("the room's world state is its own: the page's view follows it, the parsed map stays pristine", () => {
    const map = archMap();
    const { ground, meta } = map;
    // The page's world on the page's own hull, its drawing recorded (`WorldView.setNodeActive`).
    const pageGrid = groundGrid(ground);
    const drawn: [string, boolean][] = [];
    const page = new WorldState(meta, ground, pageGrid, { visible: (path, on) => drawn.push([path, on]) });
    page.applyInitial();
    const pristine = JSON.stringify({ owners: ground.owners, initial: meta.initial });
    const pageStreet = (): number => segmentHits(pageGrid, [0, 25, 0], [40, 25, 0]).length;
    expect(pageStreet()).toBe(1);
    // Before the page's world follows anything, the room's own: its own owners, its own world, the parse untouched.
    const other = new LoopbackMatch(simMapOfLoaded(map), null, { auto: false });
    expect(other.room.map.ground.owners[1]).not.toBe(ground.owners[1]);
    expect(other.room.world).not.toBe(page);
    other.room.world.setActive('worldmodel/arch/healthy', false);
    expect(JSON.stringify({ owners: ground.owners, initial: meta.initial })).toBe(JSON.stringify(JSON.parse(pristine)));
    expect(drawn).toEqual([['worldmodel/arch/destroyed', false]]);
    other.stop();
    // The page's match: its view follows the room's world, through the page's own.
    const match = new LoopbackMatch(simMapOfLoaded(map), null, { auto: false, world: page });
    const room = match.room.world;
    expect(room.isActive('worldmodel/arch/healthy')).toBe(true);                            // not the other room's change
    expect(room.isActive('worldmodel/arch/destroyed')).toBe(false);
    room.setActive('worldmodel/arch/destroyed', true);
    room.setActive('worldmodel/arch/healthy', false);
    expect(page.isActive('worldmodel/arch/healthy')).toBe(false);
    expect(page.isActive('worldmodel/arch/destroyed')).toBe(true);
    expect(drawn.slice(1)).toEqual(expect.arrayContaining([['worldmodel/arch/healthy', false], ['worldmodel/arch/destroyed', true]]));
    expect(segmentHits(pageGrid, [0, 25, 0], [40, 25, 0]).map((h) => h.owner.path)).toEqual(['worldmodel/arch/destroyed']);
    room.reset();
    expect(page.isActive('worldmodel/arch/healthy')).toBe(true);
    expect(page.isActive('worldmodel/arch/destroyed')).toBe(false);
    expect(segmentHits(pageGrid, [0, 25, 0], [40, 25, 0]).map((h) => h.owner.path)).toEqual(['worldmodel/arch/healthy']);
    match.stop();
    room.setActive('worldmodel/arch/healthy', false);                                         // unhooked: the page keeps its own
    expect(page.isActive('worldmodel/arch/healthy')).toBe(true);
  });

  it("follows the room's world into a page world built AFTER the room (`?devmode&noarmory`: the room starts before `show` builds it)", () => {
    // The test room's offline binding (2026-10-19): `main.ts` starts the room in `connectNet`, before `pageWorld` exists
    // under NO_ARMORY, so a world read once at construction is null and the room's kills reached nothing on the page.
    // `world` is read at each change instead: null until the page's world exists, then that world.
    const map = archMap();
    const { ground, meta } = map;
    let pageWorld: WorldState | null = null;
    const match = new LoopbackMatch(simMapOfLoaded(map), null, { auto: false, world: () => pageWorld });
    const room = match.room.world;
    room.setActive('worldmodel/arch/healthy', false);          // killed before the page has a world: nothing to tell yet
    // The page's world arrives, built as `show` builds it; the room's state so far reaches it at the next step.
    const drawn: [string, boolean][] = [];
    const page = new WorldState(meta, ground, groundGrid(ground), { visible: (path, on) => drawn.push([path, on]) });
    page.applyInitial();
    expect(page.isActive('worldmodel/arch/healthy')).toBe(true);
    pageWorld = page;
    match.step();
    expect(page.isActive('worldmodel/arch/healthy')).toBe(false);                             // caught up with the room
    expect(drawn).toContainEqual(['worldmodel/arch/healthy', false]);
    // And every change after it reaches the page as it happens, as it does for a world given at construction.
    room.setActive('worldmodel/arch/destroyed', true);
    expect(page.isActive('worldmodel/arch/destroyed')).toBe(true);
    match.stop();
    room.setActive('worldmodel/arch/destroyed', false);
    expect(page.isActive('worldmodel/arch/destroyed')).toBe(true);                            // unhooked
  });

  it("follows the room's world when the page's world exists first (the default ARMORY-first order), through the same getter", () => {
    const map = archMap();
    const { ground, meta } = map;
    const page = new WorldState(meta, ground, groundGrid(ground), { visible: () => {} });
    page.applyInitial();
    const match = new LoopbackMatch(simMapOfLoaded(map), null, { auto: false, world: () => page });
    match.room.world.setActive('worldmodel/arch/healthy', false);
    expect(page.isActive('worldmodel/arch/healthy')).toBe(false);                             // at once, no step needed
    match.stop();
  });

  it('carries the page\'s kit tables: the SEAL\'s type\'s kit, or the page\'s developer kit (web sprint 4)', async () => {
    const kit = (...ids: number[]): Loadout => ids as unknown as Loadout;
    const kits: SimKits = {
      table: { arsenal: arsenalOf(['ZAMMO', [], 'ZWEAPON', []]), records: new Map([[54, DEFAULT_RIFLE], [15, HELD_SIDEARM], [62, HELD_RIFLE]]), rounds: new Map() },
      map: { valves: new Map(), selectable: { seal: [], terrorist: [] }, kits: { seal: [{ type: 'Seal1', character: 'mp99_seal1', loadout: kit(54, 15, 121, 126, 194) }], terrorist: [] } },
    };
    for (const [soloKit, want] of [[null, [['M4A1', 6], ['Mark 23', 6]]], [kit(62, 15, 121, 126, 255), [['M4A1 SD', 3], ['Mark 23', 3]]]] as const) {
      const match = new LoopbackMatch(simMapOfLoaded(loaded()), null, { auto: false, kits, soloKit: () => soloKit });
      const client = new NetClient({ url: 'loopback:', map: 'MP99', name: 'Solo', socket: match.socket }, new Walk());
      await flush();
      expect(match.room.player(client.id!)!.records.map((r) => [r.name, r.mags])).toEqual(want);
    }
  });

  it('joins through the same client as a match: welcomed as the host\'s SEAL, stood at a slot, the round on', async () => {
    const ctx = await join();
    expect(ctx.client.state).toBe('open');
    expect(ctx.client.role).toBe('player');
    expect(ctx.client.team).toBe('seal');
    expect(ctx.walk.spawns).toHaveLength(1);
    expect(ctx.walk.spawns[0]!.at[0]).toBe(-100);
    expect(ctx.walk.locked).toBe(false);
    await run(ctx, 2);
    const score = ctx.events.filter((e) => e.type === 'score').pop() as Extract<ServerEvent, { type: 'score' }>;
    expect(score.timeLeft).toBeGreaterThan(359);
  });

  it('runs the page\'s commands in the room', async () => {
    const ctx = await join();
    await run(ctx, 30);
    expect(ctx.match.room.player(ctx.client.id)!.sim.seq).toBeGreaterThanOrEqual(29);
  });

  it('a grenade at the player\'s own feet: the blast rings, hurts and kills it -- a suicide -- and locks the walk', async () => {
    const ctx = await join();
    await run(ctx, 2);
    ctx.client.send({ type: 'throw', seq: ctx.client.lastSeq(), kind: 'M67', from: [-100, 16.4, 0], velocity: [0, 0, 0] });
    await run(ctx, 3.3 * TICK_HZ);
    const types = ctx.events.map((e) => e.type);
    expect(types).toContain('blast');
    expect(types).toContain('hurt');
    const kill = ctx.events.find((e) => e.type === 'kill') as Extract<ServerEvent, { type: 'kill' }>;
    expect(kill).toMatchObject({ victim: ctx.client.id, how: 'suicide', weapon: 'M67' });
    expect(ctx.walk.locked).toBe(true);
  });

  it('respawns on the Action press once the body has faded (respawn rules, research 91 section 4.1)', async () => {
    const ctx = await join();
    await run(ctx, 2);
    ctx.client.send({ type: 'throw', seq: ctx.client.lastSeq(), kind: 'M67', from: [-100, 16.4, 0], velocity: [0, 0, 0] });
    await run(ctx, 3.3 * TICK_HZ + 10 * TICK_HZ);
    const tap = ctx.walk.tap!;
    tap({ forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons: Button.Action, stance: 0, weapon: 0 }, ctx.walk.feet);
    await run(ctx, 2);
    expect(ctx.walk.spawns.length).toBe(2);
    expect(ctx.walk.spawns[1]!.at[0]).toBe(-300);               // a respawn record, not a round-start slot
  });

  it('classic alone: the round starts with the one SEAL and runs to its clock', async () => {
    const ctx = await join('classic');
    await run(ctx, 2);
    expect(ctx.events.some((e) => e.type === 'roundStart')).toBe(true);
  });

  // OT.R71: respawn offered again; nothing asked is classic, the original's default (research 163 R163.2). Was: "plays
  // classic as the page ships (respawn off): a respawn ask and no ask both open a classic room".
  it('plays what is asked (OT.R71): no ask and a classic ask open a classic room, a respawn ask a respawn room; forced off, classic', async () => {
    expect(RESPAWN_RULES_ENABLED).toBe(true);
    for (const [rules, want] of [[undefined, 'classic'], ['classic', 'classic'], ['respawn', 'respawn']] as const) {
      const match = new LoopbackMatch(simMapOfLoaded(loaded()), null, { auto: false, ...(rules ? { rules } : {}) });
      expect(match.room.rules, String(rules)).toBe(want);
    }
    const ctx = await join('respawn', false);
    await run(ctx, 2);
    const welcome = ctx.events.find((e) => e.type === 'welcome') as Extract<ServerEvent, { type: 'welcome' }>;
    expect(welcome.rules).toBe('classic');
  });

  it('stops its clock when closed', async () => {
    const ctx = await join();
    ctx.client.close();
    await flush();
    expect(ctx.match.room.stats().players).toBe(0);
  });
});

/**
 * PF-40 (research 210 s4; research 192 s1, s2.1): the page's single-player room plays the map's own game type, read off
 * `READERC.ZAR/missionlist.rdr` as the server reads it (`gameTypeOf(stem, parseMissionList(readerc))`) through the
 * READERC the page's loader already holds (`../src/loadout` `loadKitSource`, the arsenal's) -- `LoadedMap.gameType`.
 * DEMOLITION's `start` waits 3 + 10 s before its elimination loop, SUPPRESSION's 5 + 10.
 */
const FIXTURES = resolve(process.env.S2U_TEST_FIXTURES || resolve(import.meta.dirname, '../../../test-fixtures'));
const noDisc = !['RUN/READERC.ZAR', 'RUN/ZWEAPON.ZAR', 'RUN/MP72.ZDB', 'RUN/MP2.ZDB'].every((f) => existsSync(resolve(FIXTURES, f)));

/** The solo SEAL killed by its own grenade at the round's start; the `eliminated` events at 12.9, 14 and 15.1 s. */
async function eliminationsOf(map: LoadedForMatch): Promise<number[]> {
  const ctx = await join('classic', false, map);
  await run(ctx, 2);
  ctx.client.send({ type: 'throw', seq: ctx.client.lastSeq(), kind: 'M67', from: [-100, 16.4, 0], velocity: [0, 0, 0] });
  const counts: number[] = [];
  for (const s of [12.9, 14, 15.1]) {
    await run(ctx, Math.round(s * TICK_HZ) - ctx.match.room.tick);
    counts.push(ctx.events.filter((e) => e.type === 'eliminated').length);
  }
  expect(ctx.events.find((e) => e.type === 'kill')).toMatchObject({ victim: ctx.client.id, how: 'suicide' });
  expect(ctx.events.find((e) => e.type === 'eliminated')).toMatchObject({ winner: 'terrorist' });
  ctx.match.stop();
  return counts;
}

describe(`the offline room's game type (PF-40)${noDisc ? ' (fixtures absent: run npm run extract-maps)' : ''}`, () => {
  it.skipIf(noDisc)("the offline room plays the map's own mode: Crossroads (MP72) counts an elimination at 14 s, Frostfire (MP2) not before 15 s (PF-40, research 192 s2.1)", async () => {
    const source = new FsAssetSource(FIXTURES);
    const want = { MP72: [0, 1, 1], MP2: [0, 0, 1] } as const;
    for (const stem of ['MP72', 'MP2'] as const) {
      const page = await loadMap(source, `RUN/${stem}.ZDB`);
      expect(page.gameType, stem).toBe(stem === 'MP72' ? 2 : 5);          // DEMOLITION, SUPPRESSION (research 192 s1)
      const map: LoadedForMatch = { ...loaded(), path: `RUN/${stem}.ZDB`, ...(page.gameType !== undefined ? { gameType: page.gameType } : {}) };
      expect(simMapOfLoaded(map).gameType, stem).toBe(page.gameType);
      expect(await eliminationsOf(map), stem).toEqual(want[stem]);
    }
  }, 120_000);

  it("a map built by hand with no mission list plays SUPPRESSION's rules", async () => {
    expect(kitGameType(null, 'MP72')).toBeUndefined();                    // no READERC: no type
    const map = loaded();
    expect(simMapOfLoaded(map).gameType).toBeUndefined();
    expect(await eliminationsOf(map)).toEqual([0, 0, 1]);
  });
});

/**
 * W0 addendum (HX-0b's review; research 237 §0): the page's offline room gets the hostage mode's ground as XR-05 gave it
 * the bomb -- `LoadedMap.ai` and `LoadedMap.escortees` read off the bytes as `simMapFromBytes` reads `SimMap.ai` and
 * `SimMap.escortees` (`@s2u/scene` `parseAiMaps`, `parseEscortees`, `placeEscortees`), carried by `LoadedForMatch` and
 * passed by `simMapOfLoaded`. Without them reCOM's offline room on Desert Glory would open with no hostages. MP6 fixture.
 */
const noMp6 = !existsSync(resolve(FIXTURES, 'RUN/MP6.ZDB'));
describe(`the offline room's hostage ground (W0)${noMp6 ? ' (fixtures absent: run npm run extract-maps)' : ''}`, () => {
  it.skipIf(noMp6)("an MP6 LoadedForMatch's sim map carries the AI maps (9 sub-maps) and the three escortee starts, as the bytes do", async () => {
    const source = new FsAssetSource(FIXTURES);
    const page = await loadMap(source, 'RUN/MP6.ZDB');
    const bytes = await source.read('RUN/MP6.ZDB');
    const server = simMapFromBytes(bytes, 'RUN/MP6.ZDB');
    const map: LoadedForMatch = page;
    const sim = simMapOfLoaded(map);
    expect(sim.ai?.maps).toHaveLength(9);
    expect(sim.ai).toEqual(server.ai);
    expect(sim.escortees?.map((e) => e.name)).toEqual(['Hostage', 'Hostage2', 'Hostage3']);
    expect(sim.escortees).toEqual(server.escortees);
    expect(sim.ai).toBe(page.ai);                                          // shared, read only, as the turrets are
    // A map built by hand carries neither.
    const bare = simMapOfLoaded(loaded());
    expect(bare.ai).toBeUndefined();
    expect(bare.escortees).toBeUndefined();
  }, 120_000);
});

/**
 * PAR-53 (PARITY-2; RV-7c-2's review): the offline room's map carries the world root's `DefaultMaterial` as the server's
 * does. Both are `parseWorldRoot(MP*.ZED).defaultMaterial` -- the page's through `./grenadeAssets` `loadGrenadeAssets`
 * (`LoadedMap.grenade.defaultMaterial`), the server's through `simMapFromBytes` -- the material a polygon's byte 0 stands
 * for (`FUN_002dc1d0`; `@s2u/scene` `surfaceMaterial`). Without it the offline room's `hullCast` reads byte 0 as
 * `UNKNOWN`, so a grenade off a byte-0 floor bounces differently offline. MP2 fixture: Frostfire's is METAL_THICK.
 */
const noMp2 = !existsSync(resolve(FIXTURES, 'RUN/MP2.ZDB'));
describe(`the offline room's default material (PAR-53)${noMp2 ? ' (fixtures absent: run npm run extract-maps)' : ''}`, () => {
  it.skipIf(noMp2)("MP2: the offline room's DefaultMaterial is the server's, and a drop onto a byte-0 floor flies the same in both rooms", async () => {
    const source = new FsAssetSource(FIXTURES);
    const page = await loadMap(source, 'RUN/MP2.ZDB');
    const server = simMapFromBytes(await source.read('RUN/MP2.ZDB'), 'RUN/MP2.ZDB');
    expect(server.defaultMaterial).toBe('METAL_THICK');
    expect(page.grenade?.defaultMaterial).toBe(server.defaultMaterial);    // the page's read, the same world root
    const offline = simMapOfLoaded(page);
    expect.soft(offline.defaultMaterial).toBe(server.defaultMaterial);                     // soft: the flight is checked too
    // A floor polygon of material byte 0, the first shot surface under a point 40 units above its centre.
    let drop: V3 | null = null;
    for (const p of groundPolygons(server.ground)) {
      if (p.material !== 0 || p.ptcount < 3) continue;
      const c: V3 = [0, 0, 0];
      for (let i = 0; i < p.ptcount; i++) for (let k = 0; k < 3; k++) c[k] = c[k]! + p.points[i * 3 + k]! / p.ptcount;
      const hit = segmentHits(server.grid, [c[0], c[1] + 40, c[2]], [c[0], c[1] - 1, c[2]], isShotSurface)[0];
      if (hit?.poly.material === 0 && Math.abs(hit.normal[1]) > 0.9) { drop = [c[0], c[1] + 40, c[2]]; break; }
    }
    expect(drop).not.toBeNull();
    // Each room's own cast (`Room.hullCast`, `gridCast(map.grid, map.defaultMaterial ?? '')`), the same M67 dropped.
    type Cast = { hullCast(): HullCast };
    const solo = new LoopbackMatch(offline, null, { auto: false });
    const room = new Room(server, null, { now: () => 0 });
    const fly = (cast: HullCast): GrenadeEvent[] => {
      const g = launchGrenade(drop!, [0, 0, 0], M67), events: GrenadeEvent[] = [];
      for (let i = 0; i < 120 && g.state === 'flight'; i++) events.push(...stepGrenade(g, 1 / 60, cast));
      return events;
    };
    const want = fly((room as unknown as Cast).hullCast());
    expect(want.find((e) => e.kind === 'bounce')).toMatchObject({ material: 'METAL_THICK' });
    expect(fly((solo.room as unknown as Cast).hullCast())).toEqual(want);
    solo.stop();
  }, 120_000);
});
