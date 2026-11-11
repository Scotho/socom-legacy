import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { RulesSpec } from '@s2u/creator-contracts';
import type { CollisionOwner, GridParams, WorldPoly } from '@s2u/scene';
import type { Conn } from '../../../match/src/room';
import { emptyLayout } from '../../src/forge/layout';
import { forgePlayNpcSeats, NPC_SEAT_BASE } from '../../src/forge/npcs';
import { NpcBrain } from '../../src/forge/npcBrain';
import { checkRulesScript, forgeRuleHost, RULES_TEST_NPC_SEAT, RULES_TEST_SEATS_ADAPTATION, runRulesTest, type RulesTestScript } from '../../src/forge/matchRules';
import type { ForgeLayout } from '../../src/forge/rulesAuthoring';
import { encodeCommands } from '../../src/net/codec';
import { LoopbackMatch } from '../../src/net/loopback';
import { EYE_HEIGHT } from '../../src/mover';
import { PROTOCOL_VERSION, TICK_HZ, type Command } from '../../src/net/protocol';
import { cameraLook, centreClaim, faceToward } from '../../src/net/shotCone';
import { groundGrid, packGround, type SimMap } from '../../src/sim';

/**
 * Issue #766 gap 1 (product track): Forge Play and `forge.rules.test` pass NPC seats, so `spawner.release` with
 * `behaviour.npc.patrol` seats that many, a shot is `npc.death`, and the last of the release is `spawner.empty`.
 * The seats are `forgePlayNpcSeats`, the row `startForgeMatch` gives the rule host. No chase brain.
 */

const N = 4;
const horde = { id: 'horde', source: 'npc' as const, at: [200, 0, 0] as [number, number, number], yaw: 0, radius: 15, side: 'terrorist' as const, type: 0 };
const spec = {
  schema: 's2u-rules', vocabulary: 0, id: 'npc-seats', name: 'NPC seats',
  variables: [
    { id: 'left', scope: 'match', type: 'int', start: 0, min: 0, max: 64 },
    { id: 'empty', scope: 'match', type: 'int', start: 0, min: 0, max: 1 },
  ],
  entities: { spawners: ['horde'] },
  capabilities: [{ slot: 'behaviour.npc', handler: 'behaviour.npc.patrol' }],
  rules: [
    { id: 'open', when: 'round.start', then: [
      { do: 'variable.set', var: 'left', value: N },
      { do: 'spawner.release', spawner: 'horde', count: N, brain: 'behaviour.npc.patrol' },
    ] },
    { id: 'down', when: { event: 'npc.death', spawner: 'horde' }, then: [{ do: 'variable.add', var: 'left', amount: -1 }] },
    { id: 'cleared', when: { event: 'spawner.empty', spawner: 'horde' }, then: [{ do: 'variable.set', var: 'empty', value: 1 }] },
  ],
};

function sizedSpec(count: number): RulesSpec {
  const copy = JSON.parse(JSON.stringify(spec)) as RulesSpec;
  return {
    ...copy,
    rules: [
      { id: 'open', when: 'round.start', then: [
        { do: 'variable.set', var: 'left', value: count },
        { do: 'spawner.release', spawner: 'horde', count, brain: 'behaviour.npc.patrol' },
      ] },
      ...copy.rules.slice(1),
    ],
  };
}

function layout(): ForgeLayout {
  const l = emptyLayout({ kind: 'blank', library: 'floor' }) as ForgeLayout;
  l.spawners = [horde];
  l.rules = { pack: { id: 'test.npc-seats', version: '1.0.0', hash: 'ab'.repeat(32) }, spec: spec as RulesSpec };
  l.mode = { id: 'npc-seats', version: '1.0.0', params: {} };
  return l;
}

function flat(): SimMap {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
  const floor: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
  };
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  const ground = packGround(params, [floor], owners);
  const slot = (side: 0 | 1, x: number) => ({
    side, index: 0, position: [x, 0, 0] as [number, number, number], onFloor: true, step: side === 0 ? 2 : 6,
    facing: [1, 0] as [number, number], loc: { map: 0, x: 0, z: 0 },
  });
  return { stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots: [slot(0, -400), slot(1, 400)], respawns: [], notes: [] };
}

describe('issue #766: Forge Play seats a patrol release', () => {
  it('a release of N patrol NPCs seats N; killing one fires npc.death and lowers the count; the last is spawner.empty', () => {
    let loop!: LoopbackMatch;
    const seats = forgePlayNpcSeats({
      room: () => loop.room, stem: () => 'MP99', baseSide: (id) => (id === 1 ? 'seal' : undefined), brain: () => null,
    });
    const host = forgeRuleHost(
      { spec, seed: 5, params: {}, layout: { spawners: [horde] } },
      { doors: [], switches: [] },
      { npcs: seats.npcs },
    );
    loop = new LoopbackMatch(flat(), null, {
      auto: false, launchCountdownS: 0, soloSide: seats.sideOf, ruleHost: host,
      beforeStep: () => seats.flush(), beforeRoundStart: () => seats.beforeRound(),
    });
    const conn: Conn = { send() {}, close() {} };
    expect(loop.room.hello(1, conn, { type: 'hello', version: PROTOCOL_VERSION, name: 'FORGE', map: 'MP99' })).toBe(true);
    const room = loop.room;
    const look = new Map<number, { yaw: number; pitch: number }>();
    const feet = (id: number): [number, number, number] => {
      const s = room.player(id)!.sim.walker.state;
      return [s.x, s.y, s.z];
    };
    const tick = (): void => {
      for (const id of room.lobby.players().map((m) => m.id)) {
        const p = room.player(id);
        if (!p) continue;
        const l = look.get(id) ?? { yaw: p.sim.walker.state.yaw, pitch: 0 };
        const cmd: Command = { seq: p.sim.seq + 1, forward: 0, right: 0, yaw: l.yaw, pitch: l.pitch, turn: 0, buttons: 0, stance: 0, weapon: 0 };
        room.binary(id, encodeCommands({ viewTick: room.tick, commands: [cmd] }));
      }
      room.step();
    };
    const terrorists = (): number[] => room.lobby.players().filter((m) => m.team === 'terrorist').map((m) => m.id);
    for (let i = 0; i < 10 && terrorists().length < N; i++) tick();
    const seated = terrorists();
    expect(seated, 'the release seats one body a count').toHaveLength(N);
    expect(seated.every((id) => room.player(id)?.alive)).toBe(true);
    expect(host.snapshot().diagnostics.map((d) => d.code)).toEqual([]);
    expect(host.snapshot().variables['left']).toBe(N);

    const kill = (target: number): void => {
      // One round can pass through two bodies standing in the spawner's radius. Park the others off the shot.
      seated.forEach((id, i) => { if (id !== target && room.player(id)?.alive) room.player(id)!.sim.walker.place(-800, 20, -800 + i * 40); });
      const from = feet(target);
      room.player(1)!.sim.walker.place(from[0] - 70, from[1] + 20, from[2]);
      for (let i = 0; i < TICK_HZ * 8 && room.player(target)?.alive; i++) {
        const self = room.player(1)!;
        const at = feet(target);
        const body = { feet: feet(1), posture: self.sim.walker.posture, moveRoot: self.sim.moves?.rootY() ?? null, peek: self.sim.moves?.peek() ?? 0 };
        look.set(1, faceToward(body, [at[0], at[1] + 12, at[2]]));
        self.sim.allowSnap();
        const seq = self.sim.seq;
        const frame = self.cone.frame(seq);
        if (frame) {
          const point: [number, number, number] = [at[0], at[1] + 12, at[2]];
          const { eye } = cameraLook(frame);
          const claim = centreClaim(frame, [frame.feet[0], frame.feet[1] + EYE_HEIGHT, frame.feet[2]], Math.hypot(point[0] - eye[0], point[1] - eye[1], point[2] - eye[2]));
          room.text(1, { type: 'fire', seq, from: claim.from, dir: claim.dir, eye: claim.eye, aim: claim.aim, weapon: 0, viewTick: room.tick });
        }
        tick();
      }
    };

    kill(seated[0]!);
    expect(room.player(seated[0]!)?.alive ?? false, 'the shot is the room\'s, and the corpse frees its seat').toBe(false);
    const once = host.snapshot();
    expect(once.heard['npc.death']).toBe(1);
    expect(once.variables['left']).toBe(N - 1);
    expect(once.fired.map((f) => f.rule)).toContain('down');
    expect(once.variables['empty']).toBe(0);

    for (const id of seated.slice(1)) kill(id);
    const done = host.snapshot();
    expect(done.heard['npc.death']).toBe(N);
    expect(done.heard['spawner.empty']).toBe(1);
    expect(done.variables['left']).toBe(0);
    expect(done.variables['empty']).toBe(1);
    loop.stop();
  });
});

describe('issue #766: forge.rules.test passes NPC seats', () => {
  it('a release of N seats N, and a scripted death of one fires npc.death and lowers the count', () => {
    const out = runRulesTest(layout(), { doors: [], switches: [] }, {
      seed: 5,
      players: [{ id: 1, team: 'seal', at: [0, 0, 0] }],
      ticks: [{ events: [{ name: 'player.death', attacker: 1, victim: RULES_TEST_NPC_SEAT }] }],
    });
    expect(out).not.toBeNull();
    expect(out!.diagnostics).toEqual([]);
    expect(out!.fired).toEqual(['open', 'down']);
    expect(out!.variables['left']).toBe(N - 1);
    expect(out!.variables['empty']).toBe(0);
  });

  it('the review\'s F2: a script\'s own seat at or past RULES_TEST_SEATS_ADAPTATION is refused, so no seat is mistaken for a release', () => {
    expect(RULES_TEST_SEATS_ADAPTATION).toBeLessThanOrEqual(RULES_TEST_NPC_SEAT);
    const seat = (id: number): RulesTestScript => ({ players: [{ id: 1, team: 'seal' }, { id, team: 'terrorist' }] });
    expect(checkRulesScript(seat(RULES_TEST_SEATS_ADAPTATION - 1))).toBeNull();
    for (const id of [RULES_TEST_SEATS_ADAPTATION, RULES_TEST_NPC_SEAT, 200]) {
      const why = checkRulesScript(seat(id));
      expect(why, String(id)).toBe(`players[1].id is ${id}: a script's seats are 0 to ${RULES_TEST_SEATS_ADAPTATION - 1}; a release's ids start at ${RULES_TEST_NPC_SEAT}`);
    }
    // the script still tells a released NPC's death by its id
    expect(checkRulesScript({ ticks: [{ events: [{ name: 'player.death', attacker: 1, victim: RULES_TEST_NPC_SEAT }] }] })).toBeNull();
  });
});

const waves = JSON.parse(readFileSync(fileURLToPath(new URL('../../../creator-contracts/examples/zombie-waves/rules/waves.json', import.meta.url)), 'utf8')) as RulesSpec;

/** The zombie-wave pack on the same seats Forge Play gives the host. Kills go through the room, as a shot does. */
function openWaves() {
  let loop!: LoopbackMatch;
  const events: Record<string, unknown>[] = [];
  const seats = forgePlayNpcSeats({
    room: () => loop.room, stem: () => 'MP99', baseSide: (id) => (id === 1 ? 'seal' : undefined), brain: () => null,
  });
  const host = forgeRuleHost({ spec: waves, seed: 5, params: {}, layout: { spawners: [horde] } }, { doors: [], switches: [] }, { npcs: seats.npcs });
  loop = new LoopbackMatch(flat(), null, {
    auto: false, launchCountdownS: 0, roundSeconds: 360, soloSide: seats.sideOf, ruleHost: host,
    beforeStep: () => seats.flush(), beforeRoundStart: () => seats.beforeRound(),
  });
  const conn: Conn = {
    send: (frame) => { if (typeof frame === 'string') events.push(JSON.parse(frame) as Record<string, unknown>); },
    close: () => {},
  };
  const room = loop.room;
  expect(room.hello(1, conn, { type: 'hello', version: PROTOCOL_VERSION, name: 'FORGE', map: 'MP99' })).toBe(true);
  const living = (): number[] => room.lobby.players().filter((m) => m.team === 'terrorist' && room.player(m.id)?.alive).map((m) => m.id);
  const slay = (id: number): void => {
    room.devKill(id);
    room.step();
  };
  const until = (ok: () => boolean, cap: number): void => {
    for (let i = 0; i < cap && !ok(); i++) room.step();
  };
  return { loop, host, room, events, living, slay, until };
}

describe('issue #766: a later wave is not capped by the corpses of the last', () => {
  it('wave 2 seats 7 after wave 1 dies, past the classic elimination watch, and the side wipe does not end the round', () => {
    const { host, room, events, living, slay, until, loop } = openWaves();
    until(() => living().length === 4, 30);
    expect(living()).toHaveLength(4);
    for (const id of [...living()]) slay(id);
    expect(living()).toHaveLength(0);
    expect(host.snapshot().variables['left']).toBe(0);
    until(() => host.snapshot().phase === 'wave-2', 800);
    expect(host.snapshot().phase).toBe('wave-2');
    expect(living(), 'the release of 7 is seated, not cut to the slots the dead wave still held').toHaveLength(7);
    expect(host.snapshot().variables['left']).toBe(7);
    until(() => room.stats().tick >= 16 * TICK_HZ, 1200);
    expect(room.stats().tick).toBeGreaterThanOrEqual(16 * TICK_HZ);
    expect(events.some((e) => e['type'] === 'eliminated')).toBe(false);
    for (const id of [...living()]) slay(id);
    expect(living()).toHaveLength(0);
    expect(host.snapshot().variables['left']).toBe(0);
    expect(host.snapshot().phase).toBe('rest-2');
    expect(events.some((e) => e['type'] === 'eliminated')).toBe(false);
    expect(room.stats().round).toBe(1);
    loop.stop();
  });

  it('the pack plays three waves to All waves cleared and round.end seal, with no classic elimination', () => {
    const { host, room, events, living, slay, until, loop } = openWaves();
    const clear = (n: number): void => {
      until(() => living().length > 0 && host.snapshot().variables['left'] === n, 800);
      expect(host.snapshot().variables['left']).toBe(n);
      let guard = 0;
      while (host.snapshot().variables['left'] !== 0 && guard++ < 40) {
        const ids = living();
        expect(ids.length, `left ${String(host.snapshot().variables['left'])} with nobody to kill`).toBeGreaterThan(0);
        expect(ids.length).toBeLessThanOrEqual(8);
        slay(ids[0]!);
      }
      expect(host.snapshot().variables['left']).toBe(0);
      expect(living()).toHaveLength(0);
    };
    clear(4);
    until(() => host.snapshot().phase === 'wave-2', 800);
    clear(7);
    until(() => host.snapshot().phase === 'wave-3', 800);
    expect(living().length).toBe(8);
    clear(10);
    expect(host.snapshot().phase).toBe('cleared');
    expect(host.snapshot().heard['spawner.empty']).toBe(3);
    expect(host.snapshot().heard['npc.death']).toBe(4 + 7 + 10);
    const texts = events.flatMap((e) => e['type'] === 'rulesPresent' && Array.isArray(e['shows'])
      ? (e['shows'] as { kind?: string; text?: string }[]).filter((s) => s.kind === 'message').map((s) => s.text) : []);
    expect(texts).toContain('All waves cleared');
    const over = events.filter((e) => e['type'] === 'roundOver');
    expect(over.map((e) => e['winner'])).toEqual(['seal']);
    expect(events.some((e) => e['type'] === 'eliminated')).toBe(false);
    loop.stop();
  });
});

describe('issue #766: a new round does not keep the last wave', () => {
  it('a squad wipe mid-wave starts round 2 with exactly wave 1\'s 4 tracked NPCs', () => {
    const { host, room, living, slay, until, loop } = openWaves();
    until(() => living().length === 4, 30);
    expect(living()).toHaveLength(4);
    room.devKill(1);
    until(() => room.stats().round === 2 && living().length === 4 && host.snapshot().variables['left'] === 4, 4000);
    expect(room.stats().round).toBe(2);
    expect(host.snapshot().phase).toBe('wave-1');
    expect(living()).toHaveLength(4);
    expect(host.snapshot().variables['left']).toBe(4);
    const deaths = host.snapshot().heard['npc.death'] ?? 0;
    for (const id of [...living()]) slay(id);
    expect(living()).toHaveLength(0);
    expect(host.snapshot().variables['left']).toBe(0);
    expect(host.snapshot().heard['npc.death']).toBe(deaths + 4);
    loop.stop();
  });
});

/**
 * The review's F1 (maintainers' fix, product track): a new round's release reuses the last round's seat ids, so the
 * real patrol brain (`NpcBrain`, `MatchBots` over an empty graph) must forget a seat when it is vacated or cleared --
 * or round 2's wave stands still. Wired as `startForgeMatch` wires it: the seats' flush, then the brain's step.
 */
describe('the review\'s F1: a later round\'s released wave is driven by the real patrol brain', () => {
  it('round 2 reuses round 1\'s seat ids, and the brain adopts and drives each wave again', async () => {
    let loop!: LoopbackMatch;
    let brain: NpcBrain | null = null;
    const seats = forgePlayNpcSeats({
      room: () => loop.room, stem: () => 'MP99', baseSide: (id) => (id === 1 ? 'seal' : undefined), brain: () => brain,
    });
    const host = forgeRuleHost({ spec: waves, seed: 5, params: {}, layout: { spawners: [horde] } }, { doors: [], switches: [] }, { npcs: seats.npcs });
    loop = new LoopbackMatch(flat(), null, {
      auto: false, launchCountdownS: 0, roundSeconds: 360, soloSide: seats.sideOf, ruleHost: host,
      beforeStep: () => { seats.flush(); brain?.step(); }, beforeRoundStart: () => seats.beforeRound(),
    });
    brain = await NpcBrain.create(loop.room, [], { version: 2, map: 'MP99', nodes: [] }, () => 0.5);
    const room = loop.room;
    expect(room.hello(1, { send() {}, close() {} }, { type: 'hello', version: PROTOCOL_VERSION, name: 'FORGE', map: 'MP99' })).toBe(true);
    const living = (): number[] => room.lobby.players().filter((m) => m.team === 'terrorist' && room.player(m.id)?.alive).map((m) => m.id);
    const driven = (): number[] => brain!.stats().actors.map((a) => a.id).sort((a, b) => a - b);
    const until = (ok: () => boolean, cap: number): void => { for (let i = 0; i < cap && !ok(); i++) room.step(); };

    const slay = (id: number): void => { room.devKill(id); room.step(); };
    /** Wave 1 seated and driven, slain; wave 2 seated: its ids, once the brain has had its steps. */
    const throughWave2 = (round: number): number[] => {
      until(() => room.stats().round === round && host.snapshot().phase === 'wave-1' && living().length === 4, 4000);
      expect(room.stats().round).toBe(round);
      for (let i = 0; i < 3; i++) room.step();
      const wave1 = living().sort((a, b) => a - b);
      expect(wave1).toHaveLength(4);
      expect(driven(), `round ${round}: the brain drives wave 1`).toEqual(wave1);
      for (const id of [...living()]) slay(id);
      until(() => host.snapshot().phase === 'wave-2' && living().length === 7, 800);
      for (let i = 0; i < 3; i++) room.step();
      const wave2 = living().sort((a, b) => a - b);
      expect(wave2).toHaveLength(7);
      return wave2;
    };

    const first = throughWave2(1);
    expect(driven(), 'round 1: the brain drives wave 2').toEqual(first);
    expect(first.every((id) => room.player(id)!.sim.ai)).toBe(true);

    room.devKill(1);
    const second = throughWave2(2);
    expect(second, 'the new round reuses the seat ids').toEqual(first);
    expect(driven(), 'round 2: the brain adopts wave 2 again').toEqual(second);
    expect(second.every((id) => room.player(id)!.sim.ai), 'and drives it').toBe(true);
    brain.close();
    loop.stop();
  });
});

/**
 * The review's F3 (maintainers' fix, product track): a dead release's seat is vacated inside `Room.kill`'s broadcast
 * (the room's clock must not read a seated, dead side that step), but its replacement is seated at the next flush, so
 * the victim's `player.death` is told before the replacement's `player.spawn`.
 */
describe('the review\'s F3: a replacement is seated after the victim\'s death is told', () => {
  it('player.death of the victim precedes the replacement\'s player.spawn, and the side is full again the next step', () => {
    const count = 10;
    let loop!: LoopbackMatch;
    const seats = forgePlayNpcSeats({
      room: () => loop.room, stem: () => 'MP99', baseSide: (id) => (id === 1 ? 'seal' : undefined), brain: () => null,
    });
    const host = forgeRuleHost({ spec: sizedSpec(count), seed: 5, params: {}, layout: { spawners: [horde] } }, { doors: [], switches: [] }, { npcs: seats.npcs });
    const told: { name: string; id: number | undefined }[] = [];
    const event = host.event.bind(host);
    host.event = (input) => {
      const f = input as { name: string; victim?: number; player?: number };
      told.push({ name: f.name, id: f.victim ?? f.player });
      event(input);
    };
    loop = new LoopbackMatch(flat(), null, {
      auto: false, launchCountdownS: 0, soloSide: seats.sideOf, ruleHost: host,
      beforeStep: () => seats.flush(), beforeRoundStart: () => seats.beforeRound(),
    });
    const room = loop.room;
    expect(room.hello(1, { send() {}, close() {} }, { type: 'hello', version: PROTOCOL_VERSION, name: 'FORGE', map: 'MP99' })).toBe(true);
    const living = (): number[] => room.lobby.players().filter((m) => m.team === 'terrorist' && room.player(m.id)?.alive).map((m) => m.id);
    for (let i = 0; i < 30 && living().length < 8; i++) room.step();
    expect(living()).toHaveLength(8);
    const before = new Set(living());
    const victim = living()[0]!;
    told.length = 0;
    expect(room.devKill(victim)).toBe(true);
    expect(room.lobby.member(victim), 'the corpse left its seat at once').toBeUndefined();
    room.step();
    const now = living();
    expect(now).toHaveLength(8);
    const fresh = now.filter((id) => !before.has(id));
    expect(fresh).toHaveLength(1);
    const death = told.findIndex((t) => t.name === 'player.death' && t.id === victim);
    const spawn = told.findIndex((t) => t.name === 'player.spawn' && t.id === fresh[0]);
    expect(death, JSON.stringify(told)).toBeGreaterThanOrEqual(0);
    expect(spawn, JSON.stringify(told)).toBeGreaterThan(death);
    expect(host.snapshot().variables['left']).toBe(count - 1);
    loop.stop();
  });
});

describe('issue #766: a release starts after the marker seats', () => {
  it('one marker and a round-start release do not take the same id', () => {
    let loop!: LoopbackMatch;
    const seats = forgePlayNpcSeats({
      room: () => loop.room, stem: () => 'MP99', reserved: 1,
      baseSide: (id) => (id === 1 ? 'seal' : id === NPC_SEAT_BASE ? 'terrorist' : undefined),
      brain: () => null,
    });
    const host = forgeRuleHost({ spec, seed: 5, params: {}, layout: { spawners: [horde] } }, { doors: [], switches: [] }, { npcs: seats.npcs });
    loop = new LoopbackMatch(flat(), null, {
      auto: false, launchCountdownS: 0, soloSide: seats.sideOf, ruleHost: host,
      beforeStep: () => seats.flush(), beforeRoundStart: () => seats.beforeRound(),
    });
    const room = loop.room;
    expect(room.hello(1, { send() {}, close() {} }, { type: 'hello', version: PROTOCOL_VERSION, name: 'FORGE', map: 'MP99' })).toBe(true);
    const living = (): number[] => room.lobby.players().filter((m) => m.team === 'terrorist' && room.player(m.id)?.alive).map((m) => m.id);
    for (let i = 0; i < 20 && living().length < N; i++) room.step();
    expect(living()).toHaveLength(N);
    expect(living().every((id) => id >= NPC_SEAT_BASE + 1)).toBe(true);
    expect(room.hello(NPC_SEAT_BASE, { send() {}, close() {} }, {
      type: 'hello', version: PROTOCOL_VERSION, name: 'MARKER', map: 'MP99', types: { seal: 0, terrorist: 0 },
    })).toBe(true);
    expect(room.lobby.member(NPC_SEAT_BASE)?.team).toBe('terrorist');
    expect(host.snapshot().diagnostics.map((d) => d.code)).toEqual([]);
    loop.stop();
  });
});

describe('issue #766: a patrol brain adopts each released seat once', () => {
  it('flush adopts each released id once', () => {
    const adopted: number[] = [];
    let loop!: LoopbackMatch;
    const seats = forgePlayNpcSeats({
      room: () => loop.room, stem: () => 'MP99', baseSide: (id) => (id === 1 ? 'seal' : undefined),
      brain: () => ({ adoptSeat(id) { adopted.push(id); return () => {}; }, releaseSeat() {} }),
    });
    const host = forgeRuleHost({ spec, seed: 5, params: {}, layout: { spawners: [horde] } }, { doors: [], switches: [] }, { npcs: seats.npcs });
    loop = new LoopbackMatch(flat(), null, {
      auto: false, launchCountdownS: 0, soloSide: seats.sideOf, ruleHost: host,
      beforeStep: () => seats.flush(), beforeRoundStart: () => seats.beforeRound(),
    });
    const room = loop.room;
    expect(room.hello(1, { send() {}, close() {} }, { type: 'hello', version: PROTOCOL_VERSION, name: 'FORGE', map: 'MP99' })).toBe(true);
    const living = (): number[] => room.lobby.players().filter((m) => m.team === 'terrorist').map((m) => m.id);
    for (let i = 0; i < 20 && living().length < N; i++) room.step();
    expect(living()).toHaveLength(N);
    seats.flush();
    expect(adopted).toHaveLength(N);
    expect(new Set(adopted)).toEqual(new Set(living()));
    seats.flush();
    expect(adopted).toHaveLength(N);
    loop.stop();
  });
});

describe('issue #766: the room seats a rule release, and only while the round is in play', () => {
  it('a hello is unchanged, a release outside the round joins nobody, and one in play stands up', () => {
    const events: Record<string, unknown>[] = [];
    const conn: Conn = {
      send: (frame) => { if (typeof frame === 'string') events.push(JSON.parse(frame) as Record<string, unknown>); },
      close: () => {},
    };
    const room = new LoopbackMatch(flat(), null, {
      auto: false, launchCountdownS: 0, roundSeconds: 16,
      soloSide: (id) => (id === 1 ? 'seal' : 'terrorist'),
    }).room;
    const hello = { type: 'hello' as const, version: PROTOCOL_VERSION, name: 'HORDE', map: 'MP99', types: { seal: 0, terrorist: 0 } };
    expect(room.seatRuleRelease(9, { send() {}, close() {} }, hello, [20, 0, 20], 0, 'terrorist')).toBe(false);
    expect(room.lobby.member(9)).toBeUndefined();
    expect(room.hello(1, conn, { type: 'hello', version: PROTOCOL_VERSION, name: 'FORGE', map: 'MP99' })).toBe(true);
    expect(room.lobby.member(1)?.team).toBe('seal');
    for (let i = 0; i < 30 && !events.some((e) => e['type'] === 'roundStart'); i++) room.step();
    expect(events.some((e) => e['type'] === 'roundStart')).toBe(true);
    expect(room.player(1)?.alive).toBe(true);
    expect(room.seatRuleRelease(9, { send() {}, close() {} }, hello, [20, 0, 20], 0, 'terrorist')).toBe(true);
    expect(room.player(9)?.alive).toBe(true);
    for (let i = 0; i < 1500 && !events.some((e) => e['type'] === 'roundOver'); i++) room.step();
    expect(events.some((e) => e['type'] === 'roundOver')).toBe(true);
    expect(events.some((e) => e['type'] === 'eliminated')).toBe(false);
    expect(room.seatRuleRelease(10, { send() {}, close() {} }, { ...hello, name: 'LATE' }, [40, 0, 40], 0, 'terrorist')).toBe(false);
    expect(room.lobby.member(10)).toBeUndefined();
  });
});

describe('issue #766: a release reads the room\'s player limit', () => {
  it('a full room under 16 does not take another seat until one frees', () => {
    const count = 6;
    const wide = sizedSpec(count);
    let loop!: LoopbackMatch;
    const seats = forgePlayNpcSeats({
      room: () => loop.room, stem: () => 'MP99', baseSide: (id) => (id === 1 ? 'seal' : undefined), brain: () => null,
    });
    const host = forgeRuleHost({ spec: wide, seed: 5, params: {}, layout: { spawners: [horde] } }, { doors: [], switches: [] }, { npcs: seats.npcs });
    const notes: string[] = [];
    loop = new LoopbackMatch(flat(), null, {
      auto: false, launchCountdownS: 0, maxPlayers: 5, soloSide: seats.sideOf, ruleHost: host,
      beforeStep: () => seats.flush(), beforeRoundStart: () => seats.beforeRound(),
    });
    const room = loop.room;
    expect(room.hello(1, {
      send: (frame) => { if (typeof frame === 'string' && frame.includes('The game is full')) notes.push(frame); },
      close: () => {},
    }, { type: 'hello', version: PROTOCOL_VERSION, name: 'FORGE', map: 'MP99' })).toBe(true);
    const living = (): number[] => room.lobby.players().filter((m) => m.team === 'terrorist' && room.player(m.id)?.alive).map((m) => m.id);
    for (let i = 0; i < 40 && living().length < 4; i++) room.step();
    expect(living()).toHaveLength(4);
    expect(room.lobby.players()).toHaveLength(5);
    for (let i = 0; i < 20; i++) room.step();
    expect(living()).toHaveLength(4);
    expect(notes).toEqual([]);
    room.devKill(living()[0]!);
    room.step();
    expect(living()).toHaveLength(4);
    expect(room.lobby.players().length).toBeLessThanOrEqual(5);
    loop.stop();
  });
});

describe('issue #766: a kill seats the next queued NPC at the next step', () => {
  it('one shot, with the queue non-empty, frees the seat at once and refills the side at the next step\'s flush', () => {
    const count = 10;
    const wide = sizedSpec(count);
    let loop!: LoopbackMatch;
    const seats = forgePlayNpcSeats({
      room: () => loop.room, stem: () => 'MP99', baseSide: (id) => (id === 1 ? 'seal' : undefined), brain: () => null,
    });
    const host = forgeRuleHost({ spec: wide, seed: 5, params: {}, layout: { spawners: [horde] } }, { doors: [], switches: [] }, { npcs: seats.npcs });
    loop = new LoopbackMatch(flat(), null, {
      auto: false, launchCountdownS: 0, soloSide: seats.sideOf, ruleHost: host,
      beforeStep: () => seats.flush(), beforeRoundStart: () => seats.beforeRound(),
    });
    const room = loop.room;
    const look = new Map<number, { yaw: number; pitch: number }>();
    expect(room.hello(1, { send() {}, close() {} }, { type: 'hello', version: PROTOCOL_VERSION, name: 'FORGE', map: 'MP99' })).toBe(true);
    const living = (): number[] => room.lobby.players().filter((m) => m.team === 'terrorist' && room.player(m.id)?.alive).map((m) => m.id);
    const feet = (id: number): [number, number, number] => {
      const s = room.player(id)!.sim.walker.state;
      return [s.x, s.y, s.z];
    };
    const tick = (): void => {
      for (const id of room.lobby.players().map((m) => m.id)) {
        const p = room.player(id);
        if (!p) continue;
        const l = look.get(id) ?? { yaw: p.sim.walker.state.yaw, pitch: 0 };
        const cmd: Command = { seq: p.sim.seq + 1, forward: 0, right: 0, yaw: l.yaw, pitch: l.pitch, turn: 0, buttons: 0, stance: 0, weapon: 0 };
        room.binary(id, encodeCommands({ viewTick: room.tick, commands: [cmd] }));
      }
      room.step();
    };
    for (let i = 0; i < 30 && living().length < 8; i++) tick();
    expect(living()).toHaveLength(8);
    expect(host.snapshot().variables['left']).toBe(count);
    const target = living()[0]!;
    const before = new Set(living());
    let dead = false;
    for (let i = 0; i < TICK_HZ * 8 && room.player(target)?.alive; i++) {
      living().forEach((id, n) => { if (id !== target && room.player(id)?.alive) room.player(id)!.sim.walker.place(-800, 20, -800 + n * 40); });
      const at = feet(target);
      room.player(1)!.sim.walker.place(at[0] - 70, at[1] + 20, at[2]);
      const self = room.player(1)!;
      const body = { feet: feet(1), posture: self.sim.walker.posture, moveRoot: self.sim.moves?.rootY() ?? null, peek: self.sim.moves?.peek() ?? 0 };
      look.set(1, faceToward(body, [at[0], at[1] + 12, at[2]]));
      self.sim.allowSnap();
      const seq = self.sim.seq;
      const frame = self.cone.frame(seq);
      if (frame) {
        const point: [number, number, number] = [at[0], at[1] + 12, at[2]];
        const { eye } = cameraLook(frame);
        const claim = centreClaim(frame, [frame.feet[0], frame.feet[1] + EYE_HEIGHT, frame.feet[2]], Math.hypot(point[0] - eye[0], point[1] - eye[1], point[2] - eye[2]));
        room.text(1, { type: 'fire', seq, from: claim.from, dir: claim.dir, eye: claim.eye, aim: claim.aim, weapon: 0, viewTick: room.tick });
      }
      tick();
      if (!room.player(target)?.alive) { dead = true; break; }
    }
    expect(dead).toBe(true);
    expect(living(), 'the seat is free this step; the review\'s F3 seats its replacement at the next flush').toHaveLength(7);
    room.step();
    const now = living();
    expect(now).toHaveLength(8);
    expect(now).not.toContain(target);
    expect(now.some((id) => !before.has(id))).toBe(true);
    expect(host.snapshot().variables['left']).toBe(count - 1);
    loop.stop();
  });
});

describe('finding A: the shipped CTF example does not cancel a round', () => {
  const ctf = JSON.parse(readFileSync(fileURLToPath(new URL('../../../creator-contracts/examples/capture-the-flag/rules/ctf.json', import.meta.url)), 'utf8')) as RulesSpec;
  const ctfLayout = (JSON.parse(readFileSync(fileURLToPath(new URL('../../../creator-contracts/examples/capture-the-flag.run.json', import.meta.url)), 'utf8')) as { layout: NonNullable<Parameters<typeof forgeRuleHost>[0]['layout']> }).layout;

  function openCtf(roundSeconds: number, terrorist: boolean) {
    const events: Record<string, unknown>[] = [];
    const host = forgeRuleHost({ spec: ctf, seed: 34, params: {}, layout: ctfLayout }, { doors: [], switches: [] });
    const loop = new LoopbackMatch(flat(), null, {
      auto: false, launchCountdownS: 0, roundSeconds,
      soloSide: (id) => (id === 2 ? 'terrorist' : 'seal'),
      ruleHost: host,
    });
    const room = loop.room;
    const conn: Conn = {
      send: (frame) => { if (typeof frame === 'string') events.push(JSON.parse(frame) as Record<string, unknown>); },
      close: () => {},
    };
    expect(room.hello(1, conn, { type: 'hello', version: PROTOCOL_VERSION, name: 'FORGE', map: 'MP99' })).toBe(true);
    if (terrorist) expect(room.hello(2, { send() {}, close() {} }, { type: 'hello', version: PROTOCOL_VERSION, name: 'RED', map: 'MP99' })).toBe(true);
    for (let i = 0; i < 30 && !events.some((e) => e['type'] === 'roundStart'); i++) room.step();
    expect(events.some((e) => e['type'] === 'roundStart')).toBe(true);
    expect(room.player(1)?.alive).toBe(true);
    if (terrorist) expect(room.player(2)?.alive).toBe(true);
    const eliminated = (): Record<string, unknown>[] => events.filter((e) => e['type'] === 'eliminated');
    return { loop, room, events, eliminated };
  }

  it('a dead player is eliminated once, and the next ticks do not cancel that', () => {
    const { loop, room, eliminated } = openCtf(120, true);
    room.devKill(1);
    for (let i = 0; i < 20 * TICK_HZ && eliminated().length === 0; i++) room.step();
    expect(eliminated().map((e) => e['winner'])).toEqual(['terrorist']);
    for (let i = 0; i < 30; i++) room.step();
    expect(eliminated()).toHaveLength(1);
    loop.stop();
  });

  it('clearing the terrorists eliminates them once, and the next ticks do not cancel that', () => {
    const { loop, room, eliminated } = openCtf(120, true);
    room.devKill(2);
    for (let i = 0; i < 20 * TICK_HZ && eliminated().length === 0; i++) room.step();
    expect(eliminated().map((e) => e['winner'])).toEqual(['seal']);
    for (let i = 0; i < 30; i++) room.step();
    expect(eliminated()).toHaveLength(1);
    loop.stop();
  });

  it('with both sides still up, the round ends on the clock', () => {
    const { loop, room, events, eliminated } = openCtf(16, true);
    for (let i = 0; i < 25 * TICK_HZ && !events.some((e) => e['type'] === 'roundOver'); i++) room.step();
    expect(events.some((e) => e['type'] === 'roundOver')).toBe(true);
    expect(eliminated()).toHaveLength(0);
    loop.stop();
  });
});
