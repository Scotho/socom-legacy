// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { simMapFromBytes } from '../src/simMap';
import { ActionPage, type ActionPageDeps } from '../src/actionPage';
import { EYE_HEIGHT, TICK } from '../src/mover';
import { under } from '../src/mapMeta';
import { WorldState } from '../src/worldState';
import type { ClientEvent, Command, CraneWire, DoorWire } from '../src/net/protocol';
import type { Knock } from '../src/net/blast';
import { NetClient, type NetWalk } from '../src/net/client';
import { LoopbackMatch } from '../src/net/loopback';
import { GatePage } from '../src/gatePage';
import type { GateSpec } from '../src/gates';
import { CranePage } from '../src/cranePage';
import { chainReactionCraneSpecs } from '../src/cranes';
import { PHASE_REST } from '../src/doors';
import { NODE_CALLER, type EffectOp, type EffectProgram } from '@s2u/scene';
import type { SceneProgram } from '../src/sceneHealth';

/**
 * XR-04 on the page (`./actionPage`; research 213 s4): Crossroads' SEAL switch under the reticle -- the target and its
 * prompt within its 30 u, none beyond -- the press sent to the room, never run here, and the room's `action` event
 * played back as a presentation run (PF.R26): the program's sounds at their waits, the common set's effects through the
 * `call` hook, no node changed.
 */

const MP72 = fixture('RUN/MP72.ZDB');
type V3 = [number, number, number];
/** The SEAL switch's south face (research 213 s4: its two polygons, x 1084.5-1094.5 at z 1831.6). */
const FACE: V3 = [1089.5, 100.27, 1831.6];

describe.skipIf(!MP72)(`Crossroads' switches on the page (XR-04)${MP72 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const setUp = (net: ReturnType<ActionPageDeps['net']> = null, feetAt: V3 = [1089.5, 90.3, 1851.6]) => {
    const map = simMapFromBytes(MP72!, 'RUN/MP72.ZDB');
    const sounds: { name: string; path: string | null; t: number }[] = [], calls: [string, string | null][] = [], shown: string[] = [];
    let t = 0;
    const world = new WorldState(map.meta!, map.ground, map.grid, {
      sound: (name, path) => sounds.push({ name, path, t }), call: (name, path) => calls.push([name, path]), visible: (p) => shown.push(p),
    });
    world.applyInitial();
    shown.length = 0;                                           // the opening state's hides
    let feet: V3 = feetAt;
    const aim = () => {
      const eye: V3 = [feet[0], feet[1] + EYE_HEIGHT, feet[2]];
      const d = FACE.map((v, k) => v - eye[k]!), l = Math.hypot(...d);
      return { eye, far: eye.map((v, k) => v + (d[k]! / l) * 200) };
    };
    const page = new ActionPage({ world: () => world, feet: () => feet, aim, net: () => net });
    const step = (seconds: number) => { for (let k = 0; k < Math.round(seconds * 60); k++) { t += 1 / 60; world.step(1 / 60); } };
    const index = map.meta!.actions.findIndex((a) => a.node === 'seal_callstrike_1');
    return { map, world, page, sounds, calls, shown, step, index, at: (f: V3) => { feet = f; } };
  };

  it('the switch under the reticle within 30 u is the target and the lever prompt (action_pull_lever.tif); 31 u none', () => {
    const { page, index, at } = setUp();
    const t = page.target()!;
    expect(t.action).toBe(index);
    expect(t.record.node).toBe('seal_callstrike_1');
    expect(t.surface.path).toBe('worldmodel/seal_callstrike_1');
    expect(Math.hypot(t.surface.point[0] - 1089.5, t.surface.point[2] - 1851.6)).toBeCloseTo(20, 0);
    expect(t.record.bitmap).toBe('action_pull_lever.tif');
    expect(page.prompt()).toBe('lever');
    at([1089.5, 90.3, 1831.6 + 31]);
    expect(page.target()).toBeNull();
    expect(page.prompt()).toBeNull();
    at([1089.5, 90.3, 1831.6 + 29.9]);
    expect(page.target()?.action).toBe(index);
  });

  // P8 (SWITCH_PREDICT_ADAPTATION): was "and never runs the world itself" -- the press is now presented here at once, as
  // the room's `action` event's presentation run (no node or valve changed), and the room's word settles it.
  it("the action sends {type:'action'} with the struck path and point and presents it here at once, changing no node (P8)", () => {
    const sent: ClientEvent[] = [];
    const { world, page, index, sounds } = setUp({ role: 'player', send: (ev) => sent.push(ev), lastSeq: () => 41 });
    const surface = page.target()!.surface;
    const before = { states: world.states(), revision: world.revision };
    expect(page.action()).toBe(true);
    // LATER 305: with the eye the pick's aim ray left (the room adds it to its own eyes once it reproduces it).
    expect(sent).toEqual([{ type: 'action', seq: 41, action: index, surface, eye: [1089.5, 90.3 + EYE_HEIGHT, 1851.6] }]);
    expect({ states: world.states(), revision: world.revision }).toEqual(before);
    expect(world.busy).toBe(true);                                          // the presentation run, predicted
    expect(sounds.map((x) => x.name)).toEqual(['.EXP_1']);
    // A spectator's press, and none with no match: nothing sent, the press not the switch's.
    const watcher = setUp({ role: 'spectator', send: (ev) => sent.push(ev), lastSeq: () => 1 });
    expect(watcher.page.action()).toBe(false);
    expect(setUp(null).page.action()).toBe(false);
    expect(sent).toHaveLength(1);
  });

  it('the release re-picks: with the prompt still showing and the live ray off the lever, nothing is sent (FUN_00592d50)', () => {
    // The original's release (`FUN_00594cf0`, Action state 3, D:L453221-453222) calls the controller's +0x78,
    // `FUN_00592d50`: on the switch context (`+0xed4` bit 0x2000, D:L452003) it takes the record from the actor's pick
    // now (`FUN_005aa240(actor, 1)` D:L452004, reading `+0x3fc` / `+0x3dc`, D:L463856-463858) and uses it only when that
    // names one (`FUN_002b44e0` D:L452018); a null pick jumps to the end (D:L452023, `LAB_005934a0` D:L452215) with
    // nothing used. No latched sample is sent.
    const sent: ClientEvent[] = [];
    const rig = setUp();
    const eye: V3 = [1089.5, 90.3 + EYE_HEIGHT, 1851.6];
    const at = (far: V3): { eye: V3; far: V3 } => ({ eye, far });
    const d = FACE.map((v, k) => v - eye[k]!), l = Math.hypot(...d) || 1;
    const hitRay = at([eye[0] + d[0]! / l * 200, eye[1] + d[1]! / l * 200, eye[2] + d[2]! / l * 200]);
    const miss = at([eye[0] + 200, eye[1], eye[2]]);
    let ray = hitRay;
    const page = new ActionPage({
      world: () => rig.world, feet: () => [1089.5, 90.3, 1851.6], aim: () => ray,
      net: () => ({ role: 'player', send: (ev) => sent.push(ev), lastSeq: () => 7 }),
    });
    expect(page.prompt()).toBe('lever');
    const surface = page.target()!.surface;
    ray = miss;
    expect(page.target(), 'the live ray has left the lever').toBeNull();
    expect(page.armed(), 'the prompt is still the sample').toBe(true);
    expect(page.action(), 'the re-pick misses: nothing taken').toBe(false);
    expect(sent).toEqual([]);
    // The next HUD sample is the miss: the prompt is gone, and a press still sends nothing.
    expect(page.prompt()).toBeNull();
    expect(page.action()).toBe(false);
    // Back on the lever, the re-pick names it and the press is sent.
    ray = hitRay;
    expect(page.action()).toBe(true);
    expect(sent).toEqual([{ type: 'action', seq: 7, action: rig.index, surface, eye }]);   // LATER 305: the eye its ray left
  });

  // LATER 305 (redone on main 2026-10-24): the press carries the eye the pick's aim ray left. The room adds it to its own
  // eyes only where it reproduces it (`room.ts` `pageEye`; match `roomBarriers.test.ts`, "only ever added"), as one more
  // first-hit candidate of `c4Line` -- never a relaxing of the head's line (A5, LATER 139; `roomGates.test.ts` "A5 4").
  // Was: "no eye, whatever ray the page holds", written while LATER 305 waited (the plan's Log, 2026-10-22T20:51Z).
  it('A5: the press names the switch, its surface and the eye its aim ray left (LATER 305) -- the room only adds it (LATER 139)', () => {
    const { world, index } = setUp();
    const feet: V3 = [1089.5, 90.3, 1851.6];
    const look: V3 = [feet[0], feet[1] + EYE_HEIGHT, feet[2]];
    const d = FACE.map((v, k) => v - look[k]!), l = Math.hypot(...d) || 1;
    const sent: ClientEvent[] = [];
    const page = new ActionPage({
      world: () => world, feet: () => feet, aim: () => ({ eye: look, far: look.map((v, k) => v + (d[k]! / l) * 200) as V3 }),
      net: () => ({ role: 'player', send: (ev) => sent.push(ev), lastSeq: () => 9 }),
    });
    expect(page.prompt()).toBe('lever');
    expect(page.action()).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ type: 'action', seq: 9, action: index });
    expect(sent[0]).toMatchObject({ eye: look });
  });

  it("an 'action' event runs the program as presentation: .EXP_1 twice then .EXP_DISTANT three times through the sound hook at the arch's place, with the script's waits; no node changes", () => {
    const { world, page, sounds, calls, shown, step, index } = setUp();
    const before = { states: world.states(), revision: world.revision };
    page.event({ type: 'action', action: index, by: 3 });
    step(3);
    expect(sounds.map((s) => s.name)).toEqual(['.EXP_1', '.EXP_1', '.EXP_DISTANT', '.EXP_DISTANT', '.EXP_DISTANT']);
    // The waits 0.15 / 0.5 / 0.7 / 0.9 (research 213 s2.1): at 0, 0.15, 0.65, 1.35 and 2.25 s, to a frame.
    const times = [0, 0.15, 0.65, 1.35, 2.25];
    sounds.forEach((s, k) => expect(Math.abs(s.t - times[k]!), s.name).toBeLessThanOrEqual(1 / 60 + 1e-6));
    for (const s of sounds) expect(under(s.path!, 'worldmodel/seal_demo_1'), String(s.path)).toBe(true);
    expect(world.placeOf('worldmodel/seal_demo_1')).not.toBeNull();
    expect(calls).toEqual([['fire_explode_med', 'worldmodel/seal_demo_1'], ['fire_explode_med', 'worldmodel/seal_demo_1'], ['dust_explode_long', 'worldmodel/seal_demo_1']]);
    expect({ states: world.states(), revision: world.revision }).toEqual(before);
    expect(shown).toEqual([]);
    expect(world.busy).toBe(false);
    // Not this page's: another event, an index the map lacks.
    page.event({ type: 'action', action: 99, by: 3 });
    page.event({ type: 'pong', t: 0, tick: 0 });
    expect(world.busy).toBe(false);
  });
});

/**
 * P8 (the online-parity sweep's DMA-3, class G; research 213 s4, SWITCH_PREDICT_ADAPTATION): the original runs a switch's
 * use on the pressing console -- the button's 0x2000 branch (`FUN_00592d50`, D:L452002-452022) calls `FUN_002b44e0`
 * (D:L156787-156865), which starts the program there and logs the use to the net (`FUN_002bb5b0`, D:L156852) -- the
 * door's path (research 92 s1, P7). The page runs its own press's presentation at once and the room's word settles it.
 * Driven against the room itself (`LoopbackMatch`) with a one-way delay each way (`LoopbackOptions.delayMs`), the page on
 * its own copy of Crossroads.
 */
describe.skipIf(!MP72)(`P8: the own switch press predicted against a delayed room${MP72 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const FEET: V3 = [1089.5, 90.3, 1851.6];
  const TICK_MS = 1000 / 60;
  const flush = async (): Promise<void> => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
  const ALL = ['.EXP_1', '.EXP_1', '.EXP_DISTANT', '.EXP_DISTANT', '.EXP_DISTANT'];

  /** The walk as the net client drives it: the stick at rest, the feet 20 u south of the SEAL switch. */
  class Walk implements NetWalk {
    tap: ((cmd: Omit<Command, 'seq'>, feet: [number, number, number]) => void) | null = null;
    feet: V3 = [...FEET];
    setNetTap(tap: Walk['tap']): void { this.tap = tap; }
    respawn(): boolean { return true; }
    nudge(): void { /* the page's feet stay at the switch */ }
    setLocked(): void { /* nothing */ }
    knock(_k: Knock): boolean { return true; }
    tick(): void { this.tap?.({ forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 }, this.feet); }
  }

  afterEach(() => { vi.useRealTimers(); });

  /** The room (`reach` false: its body left at its spawn, out of the switch's reach) and the page, joined over the delay. */
  async function rig(reach = true, delayMs = 600) {
    vi.useFakeTimers();
    const roomMap = simMapFromBytes(MP72!, 'RUN/MP72.ZDB'), pageMap = simMapFromBytes(MP72!, 'RUN/MP72.ZDB');
    const match = new LoopbackMatch(roomMap, null, { auto: false, delayMs });
    const walk = new Walk();
    const client = new NetClient({ url: 'loopback:', map: 'MP72', name: 'Solo', socket: match.socket }, walk);
    const sounds: string[] = [], calls: string[] = [];
    const world = new WorldState(pageMap.meta!, pageMap.ground, pageMap.grid, { sound: (name) => sounds.push(name), call: (name) => calls.push(name) });
    world.applyInitial();
    const aim = () => {
      const eye: V3 = [walk.feet[0], walk.feet[1] + EYE_HEIGHT, walk.feet[2]];
      const d = FACE.map((v, k) => v - eye[k]!), l = Math.hypot(...d);
      return { eye, far: eye.map((v, k) => v + (d[k]! / l) * 200) };
    };
    const page = new ActionPage({ world: () => world, feet: () => walk.feet, aim, net: () => (client.state === 'open' ? client : null) });
    const echoes: object[] = [];
    client.on((ev) => { if (ev.type === 'action') echoes.push(ev); page.event(ev); });
    const index = pageMap.meta!.actions.findIndex((a) => a.node === 'seal_callstrike_1');
    /** One page frame: the walk's command, the delay's clock, the room's tick, the page's world and HUD sample. */
    const frame = async (press?: () => void): Promise<void> => {
      walk.tick();
      press?.();
      vi.advanceTimersByTime(TICK_MS);
      match.step();
      if (reach) { const s = match.room.player(1)?.sim.walker.state; if (s) { s.x = FEET[0]; s.y = FEET[1]; s.z = FEET[2]; } }
      await flush();
      world.step(TICK);
      page.sample(true);
    };
    for (let k = 0; k < 240 && !(client.state === 'open' && client.role === 'player'); k++) await frame();
    for (let k = 0; k < 60; k++) await frame();                         // a round trip of snapshots past the welcome
    expect(client.state).toBe('open');
    expect(client.role).toBe('player');
    return { match, client, page, world, sounds, calls, echoes, index, frame };
  }

  // 150 ms: the room's echo while the predicted run still plays; 1200 ms: after it ended (2.25 s), where a second run
  // would start were the echo not this press's.
  it.each([150, 1200])("a one-way delay of %i ms: .EXP_1 and the call hook at the press; the room's own-id echo runs nothing again", async (delayMs) => {
    const r = await rig(true, delayMs);
    let taken = false;
    await r.frame(() => { taken = r.page.action(); });
    expect(taken).toBe(true);
    expect(r.sounds).toEqual(['.EXP_1']);                                  // the press's frame, not a round trip later
    expect(r.calls).toEqual(['fire_explode_med', 'fire_explode_med', 'dust_explode_long']);   // the program's timeless head
    expect(r.echoes).toEqual([]);
    for (let k = 0; k < 5 * 60; k++) await r.frame();
    expect(r.echoes).toEqual([{ type: 'action', action: r.index, by: r.client.id }]);
    expect(r.match.room.world.actionUsed(r.index)).toBe(true);           // the room took it
    expect(r.sounds).toEqual(ALL);                                          // one run
    expect(r.calls).toEqual(['fire_explode_med', 'fire_explode_med', 'dust_explode_long']);
  });

  it('a press the room refuses (its body out of reach) is run back silently: nothing more of the program after the word', async () => {
    const r = await rig(false, 200);
    await r.frame(() => { r.page.action(); });
    expect(r.sounds).toEqual(['.EXP_1']);
    for (let k = 0; k < 3 * 60; k++) await r.frame();
    expect(r.match.room.world.actionUsed(r.index)).toBe(false);
    expect(r.echoes).toEqual([]);
    // SWITCH_PREDICT_ADAPTATION's cost: the press's sounds up to the room's word (a 0.4 s round trip) were heard.
    expect(r.sounds).toEqual(['.EXP_1', '.EXP_1']);
    expect(r.world.running(r.world.meta.actions[r.index]!.anims[0]!)).toBe(false);
  });

  // P7's review F1, for the switch: the room sends no own body for a dead seat (no ack) and refuses a dead presser
  // (`Room.useAction`: 'not alive').
  it("F1: a press, then the presser's death before the room decides it -- run back, the room's switch unused", async () => {
    const r = await rig(true, 200);
    await r.frame(() => { r.page.action(); });
    expect(r.sounds).toEqual(['.EXP_1']);
    expect(r.match.room.devKill(1)).toBe(true);
    for (let k = 0; k < 3 * 60; k++) await r.frame();
    expect(r.client.acked()).toBeNull();
    expect(r.match.room.world.actionUsed(r.index)).toBe(false);
    expect(r.sounds).not.toContain('.EXP_DISTANT');
    expect(r.world.running(r.world.meta.actions[r.index]!.anims[0]!)).toBe(false);
  });
});

/**
 * P8 with the room's word by hand (a net double: `acked`, `doors`, `cranes`): another's press of the same switch, and
 * the press on a gate lever and on a crane control routed from `ActionPage.action` to `GatePage.press` and
 * `CranePage.press`. Crossroads' switch stands in for the lever and the control (no gate or crane map is a fixture): its
 * action index and valve are given to a synthetic gate and hook.
 */
describe.skipIf(!MP72)(`P8: the press's prediction settled by hand${MP72 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const SEQ = 40;
  const setUp = (extra: Partial<ActionPageDeps> = {}) => {
    const map = simMapFromBytes(MP72!, 'RUN/MP72.ZDB');
    const sounds: string[] = [];
    const world = new WorldState(map.meta!, map.ground, map.grid, { sound: (name) => sounds.push(name) });
    world.applyInitial();
    const feet: V3 = [1089.5, 90.3, 1851.6];
    const eye: V3 = [feet[0], feet[1] + EYE_HEIGHT, feet[2]];
    const d = FACE.map((v, k) => v - eye[k]!), l = Math.hypot(...d);
    const room = { acked: SEQ as number | null, tick: 100, doors: [] as DoorWire[], cranes: [] as CraneWire[] };
    const sent: ClientEvent[] = [];
    const net = { role: 'player', id: 1, send: (ev: ClientEvent) => sent.push(ev), lastSeq: () => SEQ, acked: () => room.acked };
    const page = new ActionPage({
      world: () => world, feet: () => feet, aim: () => ({ eye, far: eye.map((v, k) => v + (d[k]! / l) * 200) }),
      net: () => net, ...extra,
    } as ActionPageDeps);
    const index = map.meta!.actions.findIndex((a) => a.node === 'seal_callstrike_1');
    const step = (seconds: number) => { for (let k = 0; k < Math.round(seconds * 60); k++) { world.step(TICK); page.sample(true); } };
    return { world, page, sounds, sent, room, step, index, record: map.meta!.actions[index]! };
  };

  it("another's press of the same switch while ours waits: its run is the one playing -- not doubled, not cut by our refusal", () => {
    const { page, sounds, room, step, index } = setUp();
    expect(page.action()).toBe(true);
    expect(sounds).toEqual(['.EXP_1']);
    page.event({ type: 'action', action: index, by: 2 });                 // the room ran seat 2's press first
    room.acked = SEQ + 1;                                                    // ours refused 'used'
    step(3);
    expect(sounds).toEqual(['.EXP_1', '.EXP_1', '.EXP_DISTANT', '.EXP_DISTANT', '.EXP_DISTANT']);
  });

  /** Death Trap's shape (gates.test.ts): flip the lever, wait 0.24 s, slide while `set_access1` is 0. */
  const gateProgram = (valve: string): EffectProgram => {
    const move = (to: [number, number, number]): EffectOp => ({
      op: 'fromTo', node: 1, flags: 9, seconds: 3, from: [1, 1, 1], to: [1, 1, 1], translation: { from: null, to, rate: [to[0] / 3, to[1] / 3, to[2] / 3] },
    });
    const set = (operand: number): EffectOp => ({ op: 'valve', valve, operation: 0x0b, operand, context: true });
    const wait: EffectOp = { op: 'wait', seconds: 0.24, range: 0, frames: null };
    const free: EffectOp = { op: 'if', conditions: [{ kind: 'valve', valve: 'set_access1', operation: 2, operand: 0 }] };
    return {
      name: 'gate_openclose1', root: 0, flags: 0, nodes: ['gatehand', 'gate_move1'],
      sequences: [
        { name: 'main', activation: 1, ops: [
          { op: 'if', conditions: [{ kind: 'valve', valve, operation: 2, operand: 0, context: true }] },
          set(1), wait, free, { op: 'callSequence', sequence: 'gateopen' }, { op: 'endif' },
          { op: 'else' },
          set(0), wait, free, { op: 'callSequence', sequence: 'gateclose' }, { op: 'endif' },
          { op: 'endif' },
        ] },
        { name: 'gateopen', activation: 2, ops: [move([0, 35, 0])] },
        { name: 'gateclose', activation: 2, ops: [move([0, -35, 0])] },
      ],
    };
  };
  const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const gateRig = () => {
    let rig!: ReturnType<typeof setUp>;
    const gates = new GatePage({ move: () => {}, net: () => ({ doors: () => rig.room.doors, acked: () => rig.room.acked, heardTick: () => rig.room.tick }) });
    rig = setUp({ gatePress: (action: number, seq: number) => gates.press(action, seq) } as Partial<ActionPageDeps>);
    const spec: GateSpec = {
      index: 0, node: 'gate_move1', path: 'worldmodel/access1/gate_move1', local: IDENTITY, parent: IDENTITY, owners: [],
      sweep: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 }, open: [0, 35, 0], seconds: 3,
      levers: [{ action: rig.index, node: rig.record.node, path: rig.record.path, valve: rig.record.valve, program: gateProgram(rig.record.valve) }],
    };
    gates.setMap([spec], undefined, 0);
    rig.room.doors = [{ valve: 0, phase: PHASE_REST }];
    gates.frame(TICK);
    const frames = (seconds: number) => { for (let k = 0; k < Math.max(1, Math.round(seconds * 60)); k++) { rig.step(TICK); gates.frame(TICK); } };
    const y = (): number => gates.stats()[0]!.offset[1];
    return { ...rig, gates, frames, y };
  };

  it("a gate lever: no world run (the room broadcasts none); the leaf chases the predicted pose after the lead-in, the room's slide taken as it", () => {
    const r = gateRig();
    expect(r.page.action()).toBe(true);
    expect(r.sent).toHaveLength(1);
    expect(r.sounds).toEqual([]);
    r.frames(0.2);
    expect(r.y()).toBe(0);                                                  // the lever's 0.24 s lead-in
    r.frames(1.04);                                                         // 1.24 s from the press: 1 s of the slide
    expect(r.y()).toBeGreaterThan(35 / 3 - 0.5);
    expect(r.y()).toBeLessThan(35 / 3 + 0.5);
    const before = r.y();
    r.room.doors = [{ valve: 1, phase: 40 }];                              // the room's slide, behind the page's
    r.room.acked = SEQ + 20;
    r.frames(TICK);
    expect(r.y()).toBeGreaterThan(before);                                  // not pulled back to the room's pose
    r.frames(1);
    r.room.doors = [{ valve: 1, phase: PHASE_REST }];
    r.frames(3);
    expect(r.y()).toBeCloseTo(35, 6);
  });

  it("a gate lever the room refuses: held through the room's lead-in, then run back at once; a dead seat's at once", () => {
    const r = gateRig();
    expect(r.page.action()).toBe(true);
    r.frames(1);
    expect(r.y()).toBeGreaterThan(0);
    r.room.acked = SEQ + 5;                                                 // the room may still be in its own lead-in
    r.frames(TICK);
    expect(r.y()).toBeGreaterThan(0);
    r.room.acked = SEQ + 30; r.room.tick += 30;                             // past it, and the leaf at rest shut: refused
    r.frames(TICK);
    expect(r.y()).toBe(0);
    const dead = gateRig();
    expect(dead.page.action()).toBe(true);
    dead.frames(1);
    dead.room.acked = null;                                                 // no own body: the room refuses a dead presser
    dead.frames(TICK);
    expect(dead.y()).toBe(0);
  });

  // The P8 review's F1: after a stall the room runs up to `CREDIT_MAX` (60) of a seat's commands in one tick, so the ack
  // can pass the press and its lead-in while the lever's program has run a tick. The refusal waits on the room's ticks.
  it("F1: a stall's burst of acks is no refusal -- held until the room's tick is the lead-in past the one whose ack passed the press", () => {
    const r = gateRig();
    expect(r.page.action()).toBe(true);
    r.frames(1);
    const y = r.y();
    expect(y).toBeGreaterThan(0);
    r.room.tick = 1000; r.room.acked = SEQ + 60;                            // the backlog run in one tick
    r.frames(TICK);
    expect(r.y()).toBeGreaterThan(y);                                        // held: the room's lead-in has had one tick
    r.room.tick = 1010;
    r.frames(TICK);
    expect(r.y()).toBeGreaterThan(0);
    r.room.tick = 1020;                                                      // 20 ticks on: its slide would show by now
    r.frames(TICK);
    expect(r.y()).toBe(0);
  });

  // The P8 review's F2: a refused press drops every run it started -- a program of the map's set it calls (a child run
  // under action -1) and an action it executes (another index) -- and a fade it wrote is put back.
  it('F2: a refusal drops the whole run tree of the press and puts its fade back', () => {
    const map = simMapFromBytes(MP72!, 'RUN/MP72.ZDB');
    const meta = map.meta!;
    const index = meta.actions.findIndex((a) => a.node === 'seal_callstrike_1');
    const other = meta.actions.findIndex((a) => a.node === 'terrorist_callstrike_1');
    const prog = (name: string, ops: EffectOp[]): SceneProgram => ({ program: { name, root: 0, flags: 0, nodes: ['NA'], sequences: [{ name: 'NA', activation: 1, ops }] }, search: [0] });
    const wait = (seconds: number): EffectOp => ({ op: 'wait', seconds, range: 0, frames: null });
    const sound = (name: string): EffectOp => ({ op: 'sound', sound: name, node: NODE_CALLER, volume: 1, newPlay: true });
    const programs = [
      prog('p8_switch', [
        { op: 'call', anim: 'p8_child' }, { op: 'executeAction', anim: meta.actions[other]!.valve },
        { op: 'opacity', node: NODE_CALLER, from: 1, to: 0, rate: -0.5, seconds: 2 }, wait(1), sound('.MAIN_LATE'),
      ]),
      prog('p8_child', [wait(1), sound('.CHILD_LATE')]),
      prog('p8_other', [wait(1), sound('.OTHER_LATE')]),
    ];
    const actions = meta.actions.map((a, i) => (i === index ? { ...a, anims: ['p8_switch'] } : i === other ? { ...a, anims: ['p8_other'] } : a));
    const sounds: string[] = [];
    const fades: [string, number][] = [];
    const world = new WorldState(
      { ...meta, actions, scene: { destructibles: meta.scene?.destructibles ?? [], programs: [...(meta.scene?.programs ?? []), ...programs] } },
      map.ground, map.grid, { sound: (name) => sounds.push(name), opacity: (path, f) => fades.push([path, f]) },
    );
    world.applyInitial();
    const feet: V3 = [1089.5, 90.3, 1851.6];
    const eye: V3 = [feet[0], feet[1] + EYE_HEIGHT, feet[2]];
    const d = FACE.map((v, k) => v - eye[k]!), l = Math.hypot(...d);
    let acked: number | null = SEQ;
    const page = new ActionPage({
      world: () => world, feet: () => feet, aim: () => ({ eye, far: eye.map((v, k) => v + (d[k]! / l) * 200) }),
      net: () => ({ role: 'player', id: 1, send: () => {}, lastSeq: () => SEQ, acked: () => acked }),
    });
    const step = (seconds: number) => { for (let k = 0; k < Math.round(seconds * 60); k++) { world.step(TICK); page.sample(true); } };
    expect(page.action()).toBe(true);
    for (const name of ['p8_switch', 'p8_child', 'p8_other']) expect(world.running(name), name).toBe(true);
    step(0.5);
    const caller = meta.actions[index]!.path;
    expect(fades.filter(([p]) => p === caller).at(-1)![1]).toBeLessThan(1);
    acked = SEQ + 1;                                                          // refused
    step(2);
    for (const name of ['p8_switch', 'p8_child', 'p8_other']) expect(world.running(name), name).toBe(false);
    expect(sounds.filter((n) => n.endsWith('_LATE'))).toEqual([]);
    expect(fades.filter(([p]) => p === caller).at(-1)![1]).toBe(1);        // the node's own opacity back
  });

  const craneRig = () => {
    let rig!: ReturnType<typeof setUp>;
    const cranes = new CranePage({
      move() {}, spin() {}, active() {},
      net: () => ({ cranes: () => rig.room.cranes, acked: () => rig.room.acked }),
    });
    rig = setUp({ cranePress: (valve: string, seq: number) => cranes.press(valve, seq) } as Partial<ActionPageDeps>);
    const [hook] = chainReactionCraneSpecs();
    cranes.setMap([{ ...hook!, control: { ...hook!.control, valve: rig.record.valve } }], undefined);
    rig.room.cranes = [{ valve: 0, leg: 0, ms: 1000, swingMs: 0, mesh: 1 }];
    cranes.frame(TICK);
    return { ...rig, cranes, state: () => cranes.hookState()[0]! };
  };

  it("a crane control: the meshes swap and the hook pauses at the press; the room's toggle settles it, a refusal puts the room's back", () => {
    const r = craneRig();
    expect(r.state()).toMatchObject({ paused: false, mesh: 'on' });
    expect(r.page.action()).toBe(true);
    expect(r.state()).toMatchObject({ paused: true, mesh: 'off' });        // the press, before any frame
    r.cranes.frame(TICK);
    expect(r.state()).toMatchObject({ paused: true, mesh: 'off' });        // the snapshot still the old one: held
    r.room.cranes = [{ valve: 1, leg: 0, ms: 1100, swingMs: 0, mesh: 2 }];
    r.room.acked = SEQ + 1;
    r.cranes.frame(TICK);
    expect(r.state()).toMatchObject({ paused: true, mesh: 'off' });
    const refused = craneRig();
    expect(refused.page.action()).toBe(true);
    expect(refused.state()).toMatchObject({ paused: true, mesh: 'off' });
    refused.room.acked = SEQ + 1;                                            // the room ran past the press; still moving
    refused.cranes.frame(TICK);
    expect(refused.state()).toMatchObject({ paused: false, mesh: 'on' });
  });
});
