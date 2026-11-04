// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { CollisionOwner, GridParams, MotionClip, SpawnSlot, WorldPoly } from '@s2u/scene';
import { FlyCamera } from '../src/camera';
import { packGround, WalkMode } from '../src/walk';
import { NetClient } from '../src/net/client';
import { LoopbackMatch, simMapOfLoaded } from '../src/net/loopback';
import { lookContextOf } from '../src/net/lookGate';
import { BAKED_LOADOUT, kitRecords } from '../src/loadout';
import { PROTOCOL_VERSION } from '../src/net/protocol';
import { Play } from '../src/play';
import { VictoryPage } from '../src/victory';
import type { VictoryData } from '../src/victoryData';
import type { ActionEndReason, SwapProgress, Walker } from '../src/mover';
import { Kit, type Firearm } from '../src/kit';

/**
 * PAR-37 (research 251 section 9, the PARITY-1 close's owed item): the page's commands after the dance's `seq` are run
 * again under the dance once the page hears it, from the mover state kept at that command, through the room's own
 * `MoverSim` -- so the page and the room agree on the dance's life, the stance, the weapon and the position. Each case
 * is a pair: the page's real `WalkMode` and `VictoryPage` against the loopback room, both fed the same commands, the
 * request at S (the room's last command run when it takes it) and the room's answer held on the way down until the page
 * has sent more commands (the window), then heard. The dance is the synthetic `victory_funky` of `victoryNet.test.ts`.
 */

const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const FLOOR: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
};
const OWNERS: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
const ground = () => packGround(PARAMS, [FLOOR], OWNERS);
const slot = (side: 0 | 1, index: number, x: number, z: number): SpawnSlot => ({
  side, index, position: [x, 0, z], onFloor: true, step: 2, facing: [1, 0], loc: { map: 0, x: 0, z: 0 },
});

/** A synthetic dance (no disc): 85 keys whose root walks 0.4 units a key along X and swings along Z. */
function danceClip(): MotionClip {
  const n = 85, t = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { t[3 * i] = 0.4 * i; t[3 * i + 2] = 3 * Math.sin(i / 9); }
  return { name: 'victory_funky', version: 5, duration: n / 30, frameCount: n, rate: 30, unknown10: -1, unknown14: 1, parts: [{ name: 'skel_root', translations: t }] } as unknown as MotionClip;
}
const VICTORY: VictoryData = {
  missing: [],
  variants: [{ name: 'victory_funky', weight: 1, clip: danceClip(), motion: { playback: 2.5, looped: false, noFire: 1 } as VictoryData['variants'][number]['motion'] }],
};
const LOADED = () => ({ path: 'RUN/MP99.ZDB', name: 'FLAT', ground: ground(), slots: [slot(0, 0, -100, 0), slot(1, 0, 100, 0)], respawns: [slot(0, 0, -300, 0)], doors: [], victory: VICTORY });
const flush = async (): Promise<void> => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

class Seat {
  send(): void {}
  close(): void {}
}

type Message = { data: unknown };
type Listener = ((ev: Message) => void) | null;

async function rig() {
  const match = new LoopbackMatch(simMapOfLoaded(LOADED()), null, { auto: false, random: () => 0.5 });
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined; c.releasePointerCapture = () => undefined; c.hasPointerCapture = () => false;
  const fly = new FlyCamera(c);
  const walk = new WalkMode(fly);
  walk.setGround(ground(), [0, 0, 0]);
  fly.setPose({ x: -100, y: 40, z: 0, yaw: 0, pitch: 0 });
  const stick = { forward: 0, right: 0 };
  fly.groundWish = () => ({ forward: stick.forward, right: stick.right, boost: false });
  const records = kitRecords(null, BAKED_LOADOUT);
  walk.setLookContext((w) => lookContextOf(records[w]));
  // The down-link, held on demand: what the room sends from the request on waits, in order, until released. The up-link's
  // command frames likewise (`up`): the request, a JSON event, goes at once, so the room takes it behind the page.
  let sock: { onmessage: Listener } | null = null;
  const up = { holding: false, held: [] as Uint8Array[] };
  const socket = (url: string) => {
    const s = match.socket(url), send = s.send.bind(s);
    s.send = (data: string | Uint8Array) => { if (up.holding && typeof data !== 'string') up.held.push(data); else send(data); };
    sock = s as unknown as { onmessage: Listener };
    return s;
  };
  const upRelease = (): void => { up.holding = false; for (const d of up.held.splice(0)) match.room.binary(client.id, d); };
  const client = new NetClient({ url: 'loopback:', map: 'MP99', name: 'Solo', socket }, walk);
  const down = { holding: false, held: [] as Message[] };
  const victory = new VictoryPage({ client: () => client, map: () => ({ victory: VICTORY }), play: new Play(), walk, release: () => {} });
  client.on((ev) => victory.event(ev));
  await flush();
  const inner = sock!.onmessage!;
  sock!.onmessage = (ev) => { if (down.holding) down.held.push(ev); else inner(ev); };
  const run = async (n: number, each?: () => void): Promise<void> => {
    for (let i = 0; i < n; i++) { each?.(); fly.update(1 / 60); walk.frame(1 / 60); match.step(); await flush(); }
  };
  await run(60);
  const room = match.room;
  room.hello(99, new Seat(), { type: 'hello', version: PROTOCOL_VERSION, name: 'Other', map: 'MP99' });
  room.text(99, { type: 'ready' });
  await run(30);
  const player = room.player(client.id)!, other = room.player(99)! as unknown as { team: string; alive: boolean; diedAt: number; sim: typeof player.sim };
  other.team = player.team === 'seal' ? 'terrorist' : 'seal';       // the fixture's: the corpse an enemy's
  /** The corpse laid 20 units off the room's mover, where it stands now. */
  const corpseNear = (): void => {
    const at = player.sim.walker.state;
    Object.assign(other.sim.walker.state, { x: at.x, y: at.y, z: at.z + 20 });
    other.alive = false; other.diedAt = room.tick;
  };
  corpseNear();
  await run(2);
  const page = (): Walker => walk['walker']!;
  const ends = { page: [] as ActionEndReason[], room: [] as ActionEndReason[] };
  walk.onActionEnd((e) => { if (e.body?.source === 'victory') ends.page.push(e.reason); });
  player.sim.walker.onActionEnd((e) => { if (e.body?.source === 'victory') ends.room.push(e.reason); });
  /** The request at S: the room takes it now, after the last command it ran; its answer is held from here. */
  const ask = (): number => {
    expect(victory.state().offer).toBe('available');
    down.holding = true;
    expect(victory.fire()).toBe(true);
    expect(player.sim.walker.victoryMotion).not.toBeNull();            // the room's dance began after S
    return player.sim.seq;
  };
  /** The room's answer heard: the held messages delivered up to the dance's start (`victory` with a clip). */
  const hear = async (): Promise<void> => {
    down.holding = false;
    while (down.held.length) {
      const m = down.held.shift()!;
      inner(m);
      if (typeof m.data === 'string' && (JSON.parse(m.data) as { type: string; clip?: unknown }).type === 'victory') break;
    }
    await flush();
  };
  /** Everything held on the way down delivered at once: the dance's start and what followed it in one batch. */
  const hearAll = async (): Promise<void> => {
    down.holding = false;
    while (down.held.length) inner(down.held.shift()!);
    await flush();
  };
  /** The rest of what was held (the room's stop, the snapshots), delivered. */
  const rest = async (): Promise<void> => {
    while (down.held.length) inner(down.held.shift()!);
    await flush();
  };
  /** The page against the room, after the room ran the page's last command. */
  const agree = (): void => {
    const p = page(), r = player.sim.walker;
    expect(player.sim.seq).toBe(client.lastSeq());
    expect({ dancing: p.victoryMotion !== null, ends: ends.page }).toEqual({ dancing: r.victoryMotion !== null, ends: ends.room });
    expect({ stance: p.stance, pending: p.pendingStance }).toEqual({ stance: r.stance, pending: r.pendingStance });
    expect(walk.hand()).toBe(player.sim.weapon);
    expect(Math.hypot(p.state.x - r.state.x, p.state.y - r.state.y, p.state.z - r.state.z)).toBeLessThan(0.01);
  };
  return { down, fly, walk, match, client, player, run, victory, stick, ask, hear, hearAll, rest, agree, page, ends, corpseNear, up, upRelease };
}

describe('PAR-37: the page re-runs its commands after the dance\'s seq under the dance (research 251 section 9)', () => {
  it('no window: only idle commands after S -- the page stands where the room does (the control)', async () => {
    const r = await rig();
    r.ask();
    await r.run(6);
    await r.hear();
    r.agree();
    expect(r.page().victoryMotion).not.toBeNull();
    await r.rest();
    await r.run(10);
    r.agree();
  });

  it("the hold's position gap: a hold on S+4 -- the room ran the dance's root for S+1..S+3 before the hold replaced it", async () => {
    const r = await rig();
    const s = r.ask();
    await r.run(3);
    expect(r.walk.hold('seal_throwgrenade')).toBe(true);              // rides S+4
    await r.run(5);
    expect(r.player.sim.walker.holding?.clip).toBe('seal_throwgrenade');
    expect(r.ends.room).toEqual(['replaced']);
    expect(r.client.lastSeq()).toBe(s + 8);
    await r.hear();
    r.agree();
    await r.rest();
    await r.run(10);
    r.agree();
  });

  it('a standing reload after S: the room stops the dance once the reload is decided (after the command past it)', async () => {
    const r = await rig();
    r.ask();
    await r.run(2);
    // The page's reload (the firearm's `reloadStart`, as `./netPage` sends it and `./matchActions` tells the dance).
    r.client.send({ type: 'reload', seq: r.client.lastSeq() });
    r.victory.reloaded();
    await r.run(6);
    expect(r.player.sim.walker.victoryMotion).toBeNull();
    expect(r.ends.room).toEqual(['stopped']);
    await r.hear();
    r.agree();
    await r.rest();
    await r.run(10);
    r.agree();
  });

  it('a stance change whose transition finished before the dance is heard: the room holds it as the request', async () => {
    const r = await rig();
    r.ask();
    await r.run(2);
    expect(r.walk.setStance('crouch')).toBe(true);                      // rides S+3: the page's Stand -> Crouch plays
    await r.run(45);                                                    // 0.75 s: the transition (0.60 s) is over
    expect(r.page().action).toBeNull();
    expect(r.player.sim.walker.pendingStance).toBe('crouch');
    await r.hear();
    r.agree();
    await r.rest();
    await r.run(10);
    r.agree();
  });

  it('a stance change taken with no clip (moving past STANCE_MOVING): the room holds it as the request', async () => {
    const r = await rig();
    r.stick.forward = 1;
    await r.run(40);                                                    // a run
    r.corpseNear();
    await r.run(1);                                                     // the offer, at the run's end
    r.ask();                                                            // S: the last command with the stick
    r.stick.forward = 0;
    expect(Math.hypot(r.page().state.vx, r.page().state.vz)).toBeGreaterThan(10);
    expect(r.walk.setStance('crouch')).toBe(true);                      // rides S+1: no clip on the page, crouched at once
    expect(r.page().action).toBeNull();
    await r.run(6);
    expect(r.player.sim.walker.stance).toBe('stand');
    await r.hear();
    r.agree();
    await r.rest();
    await r.run(10);
    r.agree();
  });

  it('a swap after S: the room refuses it under the dance, so the weapon in hand stays', async () => {
    const r = await rig();
    r.ask();
    await r.run(2);
    expect(r.walk.swapWeapon('pistol')).not.toBeNull();                 // the page takes it (rides S+3)
    await r.run(5);
    expect(r.player.sim.weapon).toBe(0);
    await r.hear();
    r.agree();
    expect(r.walk.swapProgress()).toMatchObject({ undone: true });      // the kit hears its swap undone (`Kit.frame`)
    await r.rest();
    await r.run(10);
    r.agree();
  });

  it('the sticks: a stick past INTERRUPT_STICK on S+3 cut the room\'s dance there; the walk went on', async () => {
    const r = await rig();
    r.ask();
    await r.run(2);
    r.stick.forward = 1;
    await r.run(3);
    r.stick.forward = 0;
    await r.run(4);
    expect(r.player.sim.walker.victoryMotion).toBeNull();
    expect(r.ends.room).toEqual(['cut']);
    await r.hear();
    r.agree();
    await r.rest();
    await r.run(10);
    r.agree();
  });

  it('the turn: a look past the cut on S+3 cut the room\'s dance there', async () => {
    const r = await rig();
    r.ask();
    await r.run(2);
    const yaw = r.fly.pose().yaw;
    await r.run(1, () => { r.fly.setPose({ yaw: yaw + 60 }); });
    await r.run(4);
    expect(r.ends.room).toEqual(['cut']);
    await r.hear();
    r.agree();
    await r.rest();
    await r.run(10);
    r.agree();
  });

  it('a press taken after the last tick, before the dance is heard: the run waits for the tick that sends it', async () => {
    const r = await rig();
    r.ask();
    await r.run(4);
    expect(r.walk.setStance('crouch')).toBe(true);                      // rides the next command, not yet sent
    await r.hear();
    expect(r.page().victoryMotion).toBeNull();                          // the run waits for that tick
    await r.run(1);
    r.agree();
    expect(r.page().victoryMotion).not.toBeNull();
    expect(r.page().pendingStance).toBe('crouch');
    await r.rest();
    await r.run(10);
    r.agree();
  });

  it('the start and the stop heard in one batch while the run waits for a press: the run still runs, then the stop', async () => {
    const r = await rig();
    r.ask();
    await r.run(2);
    expect(r.walk.swapWeapon('pistol')).not.toBeNull();                 // rides S+3: the room refuses it under the dance
    await r.run(1);
    r.stick.forward = 1;
    await r.run(2);                                                     // S+4: the room's dance cut, its stop sent
    r.stick.forward = 0;
    await r.run(2);
    expect(r.ends.room).toEqual(['cut']);
    expect(r.walk.setStance('crouch')).toBe(true);                      // a press pending: the run waits for its tick
    await r.hearAll();                                                  // the start and the room's stop together
    await r.run(1);
    r.agree();
    expect(r.walk.hand()).toBe(0);
    await r.run(10);
    r.agree();
  });

  it('a room stop the run cannot see (a flinch, the clock) heard while the run waits: the dance ends before S+n+1', async () => {
    const r = await rig();
    r.ask();
    await r.run(3);                                                     // S+1..S+3 under the dance on the room
    // The room's own stop between its commands -- an accepted flinch (`room.ts` `stopVictory` at the flinch), the round's
    // end, its clock: nothing in the page's commands shows it.
    (r.match.room as unknown as { stopVictory(id: number): void }).stopVictory(r.client.id);
    expect(r.ends.room).toEqual(['stopped']);
    expect(r.walk.swapWeapon('pistol')).not.toBeNull();                 // rides S+4: no dance on the room, so it is taken
    await r.hearAll();                                                  // the start and the stop: the run waits for the press
    await r.run(1);
    expect(r.player.sim.weapon).toBe(1);
    r.agree();
    expect(r.walk.swapProgress()?.undone).toBeUndefined();          // no undo told to the kit
    await r.run(10);
    r.agree();
  });

  it('the answer within a tick (n = 0) with a swap pressed since the last tick: the room refuses it, so does the page', async () => {
    const r = await rig();
    expect(r.walk.swapWeapon('pistol')).not.toBeNull();                 // rides S+1, not yet sent
    r.ask();
    await r.hear();                                                     // at once: nothing sent past S
    await r.run(1);
    r.agree();
    expect(r.walk.hand()).toBe(0);
    expect(r.walk.swapProgress()).toMatchObject({ undone: true });
    await r.rest();
    await r.run(10);
    r.agree();
  });

  it("a crouched reload through the page's own path: the reload event at R, its hold riding R+1 replaces the dance", async () => {
    const r = await rig();
    expect(r.walk.setStance('crouch')).toBe(true);
    await r.run(45);                                                    // the transition over: crouched and free
    r.ask();
    await r.run(2);
    // As the firearm's `reloadStart` reaches them: `./netPage` sends the reload at the last command, `./matchActions`
    // tells the dance, and the firearm lays the crouched reload's hold on the walk (`holdReload`, the room's period).
    r.client.send({ type: 'reload', seq: r.client.lastSeq() });
    r.victory.reloaded();
    expect(r.walk.holdReload(r.player.sim.holdPeriod!('seal_crouch_reload', 0))).toBe(true);
    await r.run(5);
    expect(r.player.sim.walker.holding?.clip).toBe('seal_crouch_reload');
    expect(r.ends.room).toEqual(['replaced']);
    await r.hear();
    r.agree();
    await r.rest();
    await r.run(10);
    r.agree();
  });

  it("the up-link behind: the room takes the request before the page's last commands, and runs them under the dance", async () => {
    const r = await rig();
    r.up.holding = true;
    await r.run(2);
    expect(r.walk.swapWeapon('pistol')).not.toBeNull();                 // sent before the request, run after the dance began
    await r.run(2);
    const s = r.ask();
    expect(r.client.lastSeq() - s).toBe(4);                             // S is behind the page's last command at the request
    r.upRelease();
    await r.run(12);
    expect(r.player.sim.seq).toBe(r.client.lastSeq());
    expect(r.player.sim.weapon).toBe(0);
    await r.hear();
    r.agree();
    await r.rest();
    await r.run(10);
    r.agree();
  });

  it('a reload on the last command sent: the room stops the dance after the next one, and so does the page', async () => {
    const r = await rig();
    r.ask();
    await r.run(4);
    r.client.send({ type: 'reload', seq: r.client.lastSeq() });
    r.victory.reloaded();
    await r.hear();
    r.agree();
    expect(r.page().victoryMotion).not.toBeNull();
    await r.run(1);
    expect(r.ends.room).toEqual(['stopped']);
    r.agree();
    await r.rest();
    await r.run(10);
    r.agree();
  });

  it("PAR-49: the up-link behind, the room's stop at S+m below the page's S+n: the stop's seq lays it there; a swap on S+m+1 taken by both", async () => {
    // Research 251 section 9.1's named gap: a stop the run cannot see (`room.ts` `stopVictory` -- the accepted flinch, the
    // round's end, the room's clock) came after S+m, the room's last command run; the page had sent to S+n. Without the
    // stop's `seq` the page laid it after S+n and refused, under the dance, a swap the room then took.
    const r = await rig();
    const s = r.ask();
    await r.run(2);                                                     // S+1, S+2 run on the room under the dance
    expect(r.player.sim.seq).toBe(s + 2);
    r.up.holding = true;                                                // the up-link behind from here
    expect(r.walk.swapWeapon('pistol')).not.toBeNull();                 // rides S+3 = S+m+1
    await r.run(4);                                                     // S+3..S+6 sent, none run on the room
    expect(r.client.lastSeq()).toBe(s + 6);
    expect(r.player.sim.seq).toBe(s + 2);
    (r.match.room as unknown as { stopVictory(id: number): void }).stopVictory(r.client.id);   // the room's stop at S+m
    expect(r.ends.room).toEqual(['stopped']);
    expect(r.walk.setStance('crouch')).toBe(true);                      // a press pending: the run waits for its tick
    await r.hearAll();                                                  // the start (seq S) and the stop (seq S+2) together
    expect(r.page().victoryMotion).toBeNull();                          // the run waits
    await r.run(1);                                                     // the run: the dance stopped after S+2, S+3's swap taken
    expect(r.walk.hand()).toBe(1);
    expect(r.walk.swapProgress()?.undone).toBeUndefined();              // no undo told to the kit
    r.upRelease();
    await r.run(12);
    expect(r.player.sim.weapon).toBe(1);                                // the room took S+3's swap: no dance there
    r.agree();
    await r.run(10);
    r.agree();
  });

  /**
   * PAR-51 (research 251 section 9.1's remaining window): the start heard with no press pending runs S+1..S+n under the
   * dance at once; the room's stop, naming S+m below n, is heard after that run. The room ran S+m+1.. with no dance, so a
   * swap on S+j (m < j <= n) the first run undid is the room's: the page runs S+m+1.. again with no dance.
   */
  async function stopAfterRun(r: Awaited<ReturnType<typeof rig>>): Promise<number> {
    const s = r.ask();
    await r.run(2);                                                     // S+1, S+2 run on the room under the dance
    expect(r.player.sim.seq).toBe(s + 2);
    r.up.holding = true;                                                // the up-link behind from here
    await r.run(2);                                                     // S+3, S+4
    expect(r.walk.swapWeapon('pistol')).not.toBeNull();                 // rides S+5 = S+j
    await r.run(3);                                                     // S+5..S+7 sent, none run on the room
    expect(r.client.lastSeq()).toBe(s + 7);
    expect(r.player.sim.seq).toBe(s + 2);
    (r.match.room as unknown as { stopVictory(id: number): void }).stopVictory(r.client.id);   // the room's stop at S+m = S+2
    await flush();                                                      // its broadcast held on the way down, behind the start
    expect(r.ends.room).toEqual(['stopped']);
    return s;
  }

  it("PAR-51: the room's stop at S+m heard after the immediate run: S+m+1.. run again with no dance, S+j's swap redone", async () => {
    const r = await rig();
    await stopAfterRun(r);
    await r.hear();                                                     // the start alone, no press pending: the run at once
    expect(r.page().victoryMotion).not.toBeNull();
    expect(r.walk.hand()).toBe(0);                                      // S+5's swap refused under the dance
    expect(r.walk.swapProgress()).toMatchObject({ undone: true });      // the kit's frame hears the undo
    await r.rest();                                                     // the room's stop, seq S+2, after the run has run
    expect(r.page().victoryMotion).toBeNull();
    expect(r.ends.page).toEqual(['stopped']);
    expect(r.walk.hand()).toBe(1);                                      // S+5's swap taken again with no dance
    expect(r.walk.swapProgress()).toMatchObject({ redone: true });      // told once to the kit
    expect(r.walk.swapProgress()?.redone).toBeUndefined();
    r.upRelease();
    await r.run(12);
    expect(r.player.sim.weapon).toBe(1);                                // the room took S+5's swap: no dance there
    r.agree();
    await r.run(10);
    r.agree();
  });

  it("PAR-51: the room's stop naming S itself (m = 0) heard after the immediate run: S+1.. run again with no dance, the swap redone", async () => {
    // The room stopped the dance before it ran S+1 (a flinch, the round's end, the up-link's backlog): its stop names S, the
    // start's own `seq`. The state kept after S is the page's before the dance: the run lays the dance and the stop there.
    const r = await rig();
    const s = r.ask();
    r.up.holding = true;                                                // nothing past S reaches the room before its stop
    await r.run(2);                                                     // S+1, S+2
    expect(r.walk.swapWeapon('pistol')).not.toBeNull();                 // rides S+3 = S+j
    await r.run(3);                                                     // S+3..S+5
    expect(r.client.lastSeq()).toBe(s + 5);
    expect(r.player.sim.seq).toBe(s);
    (r.match.room as unknown as { stopVictory(id: number): void }).stopVictory(r.client.id);   // the room's stop naming S
    await flush();                                                      // its broadcast held on the way down, behind the start
    expect(r.ends.room).toEqual(['stopped']);
    await r.hear();                                                     // the start alone: the run at once, S+3's swap undone
    expect(r.page().victoryMotion).not.toBeNull();
    expect(r.walk.hand()).toBe(0);
    expect(r.walk.swapProgress()).toMatchObject({ undone: true });
    await r.rest();                                                     // the stop, seq S
    expect(r.page().victoryMotion).toBeNull();
    expect(r.ends.page).toEqual(['stopped']);                           // heard once, as the room's
    expect(r.walk.hand()).toBe(1);
    expect(r.walk.swapProgress()).toMatchObject({ redone: true });
    r.upRelease();
    await r.run(12);
    expect(r.player.sim.weapon).toBe(1);
    r.agree();
    await r.run(10);
    r.agree();
  });

  it("PAR-51: the page's live ticks went on under the dance past the room's stop at S+m: S+m+1.. run again with no dance", async () => {
    // Not the run's commands: the page heard the start, ran S+1, S+2 again under it, then ticked on under the dance live;
    // the room's stop names S+3, the last it ran, while the page has sent to S+6. The room stood still past S+3, the page's
    // dance root carried it on: the stop runs S+4..S+6 again with no dance.
    const r = await rig();
    const s = r.ask();
    await r.run(2);
    await r.hear();                                                     // no press pending: the run at once (n = 2)
    expect(r.page().victoryMotion).not.toBeNull();
    await r.run(1);                                                     // S+3, live under the dance on both
    expect(r.player.sim.seq).toBe(s + 3);
    r.up.holding = true;
    await r.run(3);                                                     // S+4..S+6: the page's dance root moves it on
    expect(r.client.lastSeq()).toBe(s + 6);
    expect(r.page().victoryMotion).not.toBeNull();
    (r.match.room as unknown as { stopVictory(id: number): void }).stopVictory(r.client.id);   // the room's stop naming S+3
    await r.rest();
    expect(r.page().victoryMotion).toBeNull();
    expect({ page: r.ends.page, room: r.ends.room }).toEqual({ page: ['stopped'], room: ['stopped'] });
    r.upRelease();
    await r.run(12);
    r.agree();
    await r.run(10);
    r.agree();
  });

  it("PAR-51: a facing correction replayed through the run's look steps gives what it gives through live ticks", async () => {
    // The run records each look step with the facing it steps from (`WalkMode.rerunFrom`, PTT-8's `ref`), as the walk's own
    // ticks do. A page that ran S+1..S+6 again under the dance and a page that ticked the same commands live, with no dance,
    // are corrected at S+3 to the same facing: the replayed facings and the mover's facing after agree.
    const turned = async (dance: boolean) => {
      const r = await rig();
      const s = r.client.lastSeq();
      if (dance) expect(r.ask()).toBe(s); else r.down.holding = true;   // the twin hears nothing from here either
      const yaw = r.fly.pose().yaw;
      for (let i = 1; i <= 6; i++) await r.run(1, () => { r.fly.setPose({ yaw: yaw + 1.5 * i }); });
      if (dance) {
        await r.hear();                                                 // the run at once: S+1..S+6 recorded by it
        expect(r.walk['lookLog'].after(s + 3)).not.toBeNull();          // a run's step keeps the facing it steps from
      }
      const facings = r.walk.reconcileFacing(s + 3, { yaw: yaw + 9, pitch: 0 });
      expect(facings).not.toBeNull();
      return { facings: [...facings!.entries()], yaw: r.page().state.yaw, pitch: r.page().state.pitch };
    };
    const run = await turned(true), live = await turned(false);
    expect(run.facings.length).toBe(3);                                 // S+4..S+6 replayed
    expect(run).toEqual(live);
  });

  it('PAR-51: the start and the stop at S+m in one batch, no press pending: the undo never reaches the kit, no redo told', async () => {
    const r = await rig();
    await stopAfterRun(r);
    await r.hearAll();                                                  // the run at once, then the stop
    expect(r.page().victoryMotion).toBeNull();
    expect(r.walk.hand()).toBe(1);
    const told = r.walk.swapProgress();                                 // the walker's own swap clip, nothing told
    expect({ undone: told?.undone, redone: told?.redone }).toEqual({ undone: undefined, redone: undefined });
    r.upRelease();
    await r.run(12);
    expect(r.player.sim.weapon).toBe(1);
    r.agree();
    await r.run(10);
    r.agree();
  });
});

describe('PAR-37: the kit hears a swap the run under the dance undid (`SwapProgress.undone`)', () => {
  function kitRig() {
    const items: Firearm[] = [];
    let on: SwapProgress | null = null;
    const kit = new Kit({
      swapClip: (to) => ({ action: 'swapStand', overlay: false, reversed: to === 'rifle', seconds: 1 }),
      canSwap: () => true,
      item: (i) => items.push(i),
      swapProgress: () => on,
    });
    return { kit, items, set: (p: SwapProgress | null) => { on = p; } };
  }

  it('mid-swap: back to the firearm it left, the mounts as they were, m_item told again', () => {
    const r = kitRig();
    expect(r.kit.select('pistol')).toBe(true);
    r.set({ action: 'swapStand', overlay: false, progress: 0.2 });
    r.kit.frame(1 / 60);
    expect(r.kit.state()).toMatchObject({ item: 'pistol', mounts: { rifle: 'swap' } });
    r.set({ action: null, overlay: false, progress: 0, undone: true });
    r.kit.frame(1 / 60);
    expect(r.kit.state()).toEqual({ item: 'rifle', mounts: { rifle: 'hand', pistol: 'spawn' }, swap: null });
    expect(r.items).toEqual(['pistol', 'rifle']);
    expect(r.kit.swapping()).toBe(false);
  });

  it('a swap already finished: undone all the same; and nothing to undo after', () => {
    const r = kitRig();
    expect(r.kit.select('pistol')).toBe(true);
    r.set(null);
    r.kit.frame(1 / 60);                                                 // the clip over: the swap finished
    expect(r.kit.state()).toMatchObject({ item: 'pistol', mounts: { rifle: 'carry', pistol: 'hand' }, swap: null });
    r.set({ action: null, overlay: false, progress: 0, undone: true });
    r.kit.frame(1 / 60);
    expect(r.kit.state()).toEqual({ item: 'rifle', mounts: { rifle: 'hand', pistol: 'spawn' }, swap: null });
    r.kit.frame(1 / 60);
    expect(r.items).toEqual(['pistol', 'rifle']);
  });

  it('PAR-51: a swap undone, then redone (`SwapProgress.redone`): the swap taken again, finished on the walk\'s clock', () => {
    const r = kitRig();
    expect(r.kit.select('pistol')).toBe(true);
    r.set({ action: 'swapStand', overlay: false, progress: 0.2 });
    r.kit.frame(1 / 60);
    r.set({ action: null, overlay: false, progress: 0, undone: true });
    r.kit.frame(1 / 60);
    expect(r.kit.state().item).toBe('rifle');
    r.set({ action: null, overlay: false, progress: 0, redone: true });
    r.kit.frame(1 / 60);
    expect(r.kit.state()).toMatchObject({ item: 'pistol', mounts: { rifle: 'swap' }, swap: { to: 'pistol' } });
    expect(r.kit.swapping()).toBe(true);
    r.set({ action: 'swapStand', overlay: false, progress: 0.9 });     // the walker's clip, past the hand-off
    r.kit.frame(1 / 60);
    expect(r.kit.state().mounts.pistol).toBe('hand');
    r.set(null);                                                        // the clip over
    r.kit.frame(1 / 60);
    expect(r.kit.state()).toMatchObject({ item: 'pistol', mounts: { rifle: 'carry', pistol: 'hand' }, swap: null });
    expect(r.items).toEqual(['pistol', 'rifle', 'pistol']);
    r.set({ action: null, overlay: false, progress: 0, undone: true });  // and undone again, as the first
    r.kit.frame(1 / 60);
    expect(r.kit.state()).toEqual({ item: 'rifle', mounts: { rifle: 'hand', pistol: 'spawn' }, swap: null });
  });

  it('PAR-51: a redo with nothing undone does nothing', () => {
    const r = kitRig();
    r.set({ action: null, overlay: false, progress: 0, redone: true });
    r.kit.frame(1 / 60);
    expect(r.kit.state()).toEqual({ item: 'rifle', mounts: { rifle: 'hand', pistol: 'spawn' }, swap: null });
    expect(r.items).toEqual([]);
  });
});
