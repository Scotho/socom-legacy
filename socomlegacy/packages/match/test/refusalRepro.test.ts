import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GAME_FRAME_DT, type CollisionOwner, type GridParams, type SpawnSlot, type WeaponRecord, type WorldPoly } from '@s2u/scene';
import { fireScheduleTicks } from '../../viewer/src/net/fireGate';
import { Accuracy, perturb } from '../../viewer/src/accuracy';
import type { Health } from '../../viewer/src/net/damage';
import { DEATH_CAUSE } from '../../viewer/src/net/deaths';
import {
  Button, cameraLook, centreClaim, encodeCommands, EYE_HEIGHT, faceToward, groundGrid, packGround, PROTOCOL_VERSION, ringFor, ShotCone, TICK_HZ,
  type ClientEvent, type Command, type ServerEvent, type SimMap,
} from '../../viewer/src/sim';
import {
  BACKLOG_BOUND_PLACEHOLDER, CATCHUP_WINDOW_TICKS_PLACEHOLDER, CREDIT_MAX, FIRE_ARRIVAL_JITTER_TICKS, Room, TRADE_ARRIVAL_JITTER_MS_ADAPTATION, TRADE_WINDOW_CAP_MS_ADAPTATION,
  rewindCapMs, tradeExpiryTicks, tradeWindowTicks, type Conn,
} from '../src/room';

/**
 * NCW-5 (the netcode wave, `docs/plans/2026-11-05-netcode-wave.md` sections 2, 4 and 6): the two largest refusals of the
 * field's rounds -- `fire: stale` (1,656) and `fire: not alive` (1,626) over 5,335 seat-rounds -- reproduced at the room
 * and counted, as today's "before" (B-stale and B-trade are NCW-2's). A product-track instrument: it changes nothing the
 * room does; it reads the room's own decisions (its private `decide`, `dropStretch` and `kill` wrapped, each original
 * called) and its seats' tallies (`signals.refused`).
 *
 * The room's map is the flat floor of the room tests (`roomRifleJitterBloom.test.ts`'s pattern, copied); the kit staged
 * from the disc's records (`scene/test/golden/weapon-records.json`, `RUN/ZWEAPON.ZAR` through `readKitTable`), as there;
 * the page an honest automatic burst (the viewer's `Accuracy` at the console's cadence, each round claimed at its cone's
 * centre), its commands (the last three a frame, the page's redundancy) and its rounds over one ordered socket -- a TCP
 * line: a packet never passes the one before it.
 */

/** Every part's health and armour, summed: any hit that lays damage lowers it. */
const healthSum = (h: Health): number => [...h.hp, ...h.armour].reduce((a, b) => a + b, 0);
const PIN = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../scene/test/golden/weapon-records.json'), 'utf8')) as { records: Record<string, WeaponRecord> };
const byName = (name: string): WeaponRecord => Object.values(PIN.records).find((w) => w.name === name)!;
const M4A1 = byName('M4A1'), DE = PIN.records['7']!;
type V3 = [number, number, number];
type Fire = Extract<ClientEvent, { type: 'fire' }>;
type Timed = { type: string; seq: number };
const TICK_MS = 1000 / TICK_HZ;
const unitV = (a: readonly number[]): V3 => { const l = Math.hypot(a[0]!, a[1]!, a[2]!); return [a[0]! / l, a[1]! / l, a[2]! / l]; };
const STILL = { stance: 'stand' as const, rawStance: 'stand' as const, velocity: [0, 0, 0] as V3, airborne: false, yawRate: 0, pitchRate: 0, zoomState: 0, sticks: { forward: 0, right: 0, turn: 0, pitch: 0 } };

function flatMap(): SimMap {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
  const floor: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
  };
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  const ground = packGround(params, [floor], owners);
  const slot = (side: 0 | 1, index: number, x: number, z: number): SpawnSlot => ({
    side, index, position: [x, 0, z], onFloor: true, step: side === 0 ? 2 : 6, facing: side === 0 ? [1, 0] : [-1, 0], loc: { map: 0, x: 0, z: 0 },
  });
  const slots = [0, 1, 2, 3, 4, 5, 6, 7].flatMap((i) => [slot(0, i, -400, -200 + i * 50), slot(1, i, 400, -200 + i * 50)]);
  const respawns = [0, 1, 2].flatMap((i) => [slot(0, i, -600, -500 + i * 500), slot(1, i, 600, -500 + i * 500)]);
  return { stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots, respawns, notes: [] };
}

class Client implements Conn {
  readonly events: ServerEvent[] = [];
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(): void { /* not used */ }
}

/** One round's decision as the room took it: its command, the room's command when decided, and the outcome. */
interface Decision { seq: number; at: number; roomSeq: number; out: string; hp: Record<number, number> }

/**
 * `n` players on the flat floor on an injected clock (one tick a step) and a seeded draw, player 1's kit staged as the
 * M4A1 and the DE .50 (`roomRifleJitterBloom.test.ts`'s `seat`), placed at `at`. Observed: every fire decision of player
 * 1 (`decide`), every stretch of its commands the room dropped (`dropStretch`: a backlog, an intake cut), and each kill.
 */
function room3(at: readonly V3[], rules: 'respawn' | 'classic' = 'respawn') {
  let now = 0, s = 1;
  const room = new Room(flatMap(), null, { now: () => now, random: () => { s = (s * 16807) % 2147483647; return s / 2147483647; }, launchCountdownS: 0, rules }, null, null);
  const clients = new Map<number, Client>();
  at.forEach((_, i) => { const c = new Client(); clients.set(i + 1, c); room.hello(i + 1, c, { type: 'hello', version: PROTOCOL_VERSION, name: '', map: 'MP99' }, `10.0.0.${i + 1}`); });
  room.step();
  // Codex's P1 on PR #698: a classic room waits for both sides, then starts its round (every seat spawned at a start);
  // staged after it, so the round's spawn does not undo the kit and the places below.
  const phase = (): string => (room as unknown as { state: { phase: string } }).state.phase;
  for (let i = 0; rules === 'classic' && phase() !== 'play' && i < 10 * TICK_HZ; i++) { now += TICK_MS; room.step(); }
  if (rules === 'classic') expect(phase(), 'the classic round in play').toBe('play');
  const p = room.player(1)!;
  const P = p as unknown as { records: [WeaponRecord, WeaponRecord]; cone: ShotCone; mags: { rounds(): number }[] };
  P.records = [M4A1, DE]; P.cone = new ShotCone(M4A1); P.mags = [ringFor(M4A1), ringFor(DE)];
  at.forEach((v, i) => room.player(i + 1)!.sim.walker.place(v[0], v[1] + 20, v[2]));
  const R = room as unknown as {
    decide: (pp: unknown, ev: Timed, n?: number) => void;
    dropStretch: (pp: unknown, gone: Command[], why: string, reserve?: number) => void;
    kill: (victim: unknown, ...rest: unknown[]) => void;
    timed: (id: number, ev: Timed) => void;
  };
  const decisions: Decision[] = [];
  const droppedCmds = new Map<number, string>();               // seq -> 'backlog' | 'cut'
  const kills: { victim: number; tick: number; victimSeq: number; atMs: number }[] = [];
  const decide = R.decide.bind(room), dropStretch = R.dropStretch.bind(room), kill = R.kill.bind(room), timed = R.timed.bind(room);
  /** Player 1's rounds already past the stale bound at their arrival (`timed`'s `staleFires` measure), by seq. */
  const staleOnArrival = new Set<number>();
  R.timed = (id, ev) => {
    if (id === 1 && ev.type === 'fire' && (p as unknown as { synced: boolean }).synced && p.sim.seq - ev.seq > FIRE_ARRIVAL_JITTER_TICKS) staleOnArrival.add(ev.seq);
    return timed(id, ev);
  };
  R.decide = (pp, ev, n) => {
    if (pp !== p || ev.type !== 'fire') return decide(pp, ev, n);
    const roomSeq = p.sim.seq;
    room.takeDrops();
    decide(pp, ev, n);
    const d = room.takeDrops();
    const hp: Record<number, number> = {};
    for (let i = 1; i <= at.length; i++) hp[i] = healthSum(room.player(i)!.health);
    decisions.push({ seq: ev.seq, at: room.tick, roomSeq, out: d ? Object.keys(d).join('+') : 'decided', hp });
  };
  R.dropStretch = (pp, gone, why, reserve) => {
    if (pp === p) for (const c of gone) droppedCmds.set(c.seq, why);
    return dropStretch(pp, gone, why, reserve);
  };
  R.kill = (victim, ...rest) => {
    const v = victim as { id: number; sim: { seq: number } };
    kills.push({ victim: v.id, tick: room.tick, victimSeq: v.sim.seq, atMs: now });
    return kill(victim, ...rest);
  };
  return { room, p, P, clients, decisions, droppedCmds, kills, staleOnArrival, advance: (ms: number) => { now += ms; } };
}

/**
 * The page's ordered line: a packet leaves at its frame and arrives `lateness(leave)` ms later, never before the one sent
 * before it (TCP's head-of-line order). Delivered at the room tick whose wall time has passed its arrival.
 */
function orderedLine(lateness: (leaveMs: number) => number) {
  const wire: { at: number; deliver: () => void }[] = [];
  let lastAt = 0;
  return {
    put(sentAt: number, deliver: () => void): void {
      const leave = Math.ceil(sentAt / TICK_MS - 1e-9) * TICK_MS;
      lastAt = Math.max(lastAt, leave + lateness(leave));
      wire.push({ at: lastAt, deliver });
    },
    flush(now: number): void { while (wire.length && wire[0]!.at <= now) wire.shift()!.deliver(); },
  };
}

/**
 * An honest automatic burst of `rounds` (the page's `Accuracy` at the console's cadence: `fireScheduleTicks`, as LATER 588
 * (a)'s harness), from command `warm`, each round at its cone's centre toward `aimAt`, over `lateness`. The page stops
 * firing when it hears its own death (`kill` with it the victim, delivered `downMs` after the room sent it). `others`
 * runs before each room step (another seat's commands and rounds). Returns the rounds by seq, each with its decision.
 */
function burst(opts: {
  at: readonly V3[]; aimAt: V3; lateness: (leaveMs: number) => number; downMs: number; warm: number; rounds: number; ticks: number;
  others?: (t: number, h: ReturnType<typeof room3>) => void;
  /** Staged: the room's magazine refilled below 10 rounds (a long run fires past one magazine; no reload modelled). */
  refill?: boolean;
  /** NCW-2 B-trade: the shooter's heartbeat round trip as the room measured it (`noteRoundTrip`), ms; none, no sample. */
  rttMs?: number;
  /**
   * NCW-2 B-trade's review F1 (c): the page turns its look this many degrees a tick from the trigger on, each round
   * claimed from its own command's camera (`cameraLook` of the body with that command's look; the feet stand still).
   */
  turnDeg?: number;
  /**
   * F1 (c): each round claimed off its cone's centre -- `perturb` of the look in the page kit's cone before the round's
   * bloom, its draw this fixed value (`signedSquare` of it on both axes) -- the round's line down the claimed aim.
   */
  offCentre?: number;
  /**
   * The review's F3: a death staged inside the shooter's own run of the command after round `selfDeathAfterRound`'s
   * (where `fallDamage` kills: after the command's `aim`, before its `settle`), by `kill` as a fall.
   */
  selfDeathAfterRound?: number;
  /** Codex's P1 on PR #698: the room's rules (`room3`); respawn by default. */
  rules?: 'respawn' | 'classic';
}) {
  const h = room3(opts.at, opts.rules);
  const { room, p, clients } = h;
  if (opts.rttMs !== undefined) room.noteRoundTrip(1, opts.rttMs);
  const line = orderedLine(opts.lateness);
  let look = { yaw: 0, pitch: 0 }, seq = p.sim.seq;
  const history: Command[] = [];
  const kit = new Accuracy(M4A1);
  const interval = (fireScheduleTicks(M4A1) / 2) * GAME_FRAME_DT * TICK_HZ;
  const sent: { seq: number; round: number; sentTick: number }[] = [];
  let nextFire = Infinity, base: { eye: V3; look: V3; from: V3 } | null = null, heardDeath = Infinity;
  let baseFrame: Parameters<typeof cameraLook>[0] | null = null;
  if (opts.selfDeathAfterRound !== undefined) {
    const Rw = room as unknown as { watchCut: (pp: unknown) => void; kill: (...a: unknown[]) => void };
    const watchCut = Rw.watchCut.bind(room);
    Rw.watchCut = (pp) => {
      watchCut(pp);
      const r = sent[opts.selfDeathAfterRound! - 1];
      if (pp === p && p.alive && r && p.sim.seq === r.seq + 1) Rw.kill(p, null, null, 'fall', DEATH_CAUSE.FALL);
    };
  }
  for (let t = 0; t < opts.ticks; t++) {
    const now = t * TICK_MS;
    if (t === 2) {
      const st = p.sim.walker.state;
      look = faceToward({ feet: [st.x, st.y, st.z], posture: p.sim.walker.posture }, opts.aimAt);
      p.sim.allowSnap();                                           // staged: the facing, as the room would let it (OT.R38)
    }
    if (t === opts.warm - 4 && !base) {
      const f = p.cone.frame(p.sim.seq);
      if (f) { const c = cameraLook(f); base = { eye: c.eye, look: c.look, from: [f.feet[0], f.feet[1] + EYE_HEIGHT, f.feet[2]] }; baseFrame = f; }
    }
    if (opts.turnDeg && t >= opts.warm) look = { ...look, yaw: look.yaw + opts.turnDeg };
    // The page hears its own death on the downlink (`downMs` after the room's tick that sent it).
    if (heardDeath === Infinity) {
      const k = h.kills.find((x) => x.victim === 1);
      if (k && now >= k.atMs + opts.downMs) heardDeath = t;
    }
    const alive = t < heardDeath;
    const firing = alive && t >= opts.warm && sent.length < opts.rounds;
    if (t === opts.warm) { kit.trigger(); nextFire = t; }
    kit.update(1 / 60, STILL);
    const cmd: Command = { seq: ++seq, forward: 0, right: 0, ...look, turn: 0, buttons: firing ? Button.Trigger : 0, stance: 0, weapon: 0 };
    history.push(cmd);
    const batch = history.slice(-3);
    line.put(now, () => room.binary(1, encodeCommands({ viewTick: room.tick, commands: batch })));
    if (firing && t >= nextFire && base) {
      const cone = opts.offCentre !== undefined ? kit.cone(0, 1) : { offsetX: 0, offsetY: 0, radius: 0 };
      kit.round(0, 'stand');
      const { from } = base;
      const own = opts.turnDeg && baseFrame ? cameraLook({ ...baseFrame, yaw: look.yaw, pitch: look.pitch }) : null;
      const eye = own?.eye ?? base.eye, l = own?.look ?? base.look;
      const aim = opts.offCentre !== undefined ? unitV(perturb(l, cone, () => opts.offCentre!)) : l;
      const point = [eye[0] + aim[0] * 200, eye[1] + aim[1] * 200, eye[2] + aim[2] * 200];
      const ev = { type: 'fire', seq, from, dir: unitV([point[0]! - from[0], point[1]! - from[1], point[2]! - from[2]]), eye, aim: unitV(perturb(aim, { offsetX: 0, offsetY: 0, radius: 0 })), weapon: 0 } as const;
      sent.push({ seq, round: sent.length + 1, sentTick: t });
      line.put(now, () => room.text(1, { ...ev, viewTick: room.tick } as Fire));
      nextFire = (t - nextFire < 1 ? nextFire : t) + interval;
    }
    line.flush(now);
    if (opts.refill && h.P.mags[0]!.rounds() < 10) h.P.mags[0] = ringFor(M4A1);
    opts.others?.(t, h);
    h.advance(TICK_MS);
    room.step();
  }
  void clients;
  const rows = sent.map((r) => {
    const d = h.decisions.filter((x) => x.seq === r.seq);
    return { ...r, out: d.length ? d.map((x) => x.out).join('+') : 'undecided', roomSeq: d[0]?.roomSeq ?? NaN, hp: d[0]?.hp ?? null, dropped: h.droppedCmds.get(r.seq) ?? null, staleOnArrival: h.staleOnArrival.has(r.seq) };
  });
  const tally: Record<string, number> = {};
  for (const r of rows) tally[r.out] = (tally[r.out] ?? 0) + 1;
  const signals = (p as unknown as { signals: { refused: Record<string, number>; staleFires: number; trade?: { decided: number; refused: number }; rewind?: Record<string, number> } }).signals;
  return { h, rows, tally, refused: { ...signals.refused }, staleFires: signals.staleFires, heardDeath, trade: signals.trade ? { ...signals.trade } : null, rewind: { ...signals.rewind } };
}

/** A small table, printed: one line a row. */
function table(title: string, head: string[], rows: (string | number)[][]): void {
  const w = head.map((x, i) => Math.max(x.length, ...rows.map((r) => String(r[i]).length)));
  const line = (r: (string | number)[]): string => r.map((x, i) => String(x).padEnd(w[i]!)).join(' | ');
  console.log([title, line(head), w.map((n) => '-'.repeat(n)).join('-|-'), ...rows.map(line)].join('\n'));
}

describe('NCW-5: fire: stale after a jump in the line\'s lateness (B-stale, the "before")', () => {
  // A 128 ms line (the steady player of section 6), then 1.9 s for two seconds from round 5 (FIORE's 276 -> 1,878 ms), then
  // 128 ms again: the packets of the late two seconds arrive 1.9 s after they left, those behind them held in order.
  const T0 = (360 + 24) * TICK_MS;                                   // round 5's frame (the trigger at 360, a round a ~6 ticks)
  const jump = (ms: number) => (leave: number): number => (leave >= T0 && leave < T0 + 2000 ? ms : 128);

  it('the steady 128 ms line: no round refused, no command dropped (the control)', () => {
    const got = burst({ at: [[0, 0, 0], [100, 0, 600]], aimAt: [100, 12, 300], lateness: () => 128, downMs: 128, warm: 360, rounds: 30, ticks: 360 + 600 });
    console.log(`NCW-5 stale control: ${JSON.stringify(got.tally)}; refused ${JSON.stringify(got.refused)}; dropped commands ${got.h.droppedCmds.size}`);
    expect(got.rows).toHaveLength(30);
    expect(got.tally).toEqual({ decided: 30 });
    expect(got.h.droppedCmds.size).toBe(0);
  });

  it("a jump to 1.9 s for two seconds (the brief's line): no command dropped and no round refused stale -- the slack covers it; the 5 rounds sent after the fall, run in its burst, refused 'rate' (the lane's reading CORRECTED)", () => {
    const got = burst({ at: [[0, 0, 0], [100, 0, 600]], aimAt: [100, 12, 300], lateness: jump(1900), downMs: 128, warm: 360, rounds: 30, ticks: 360 + 900 });
    table(
      `NCW-5 stale, 128 ms -> 1.9 s for 2 s -> 128 ms (CREDIT_MAX ${CREDIT_MAX}, BACKLOG_BOUND ${BACKLOG_BOUND_PLACEHOLDER}, CATCHUP_WINDOW ${CATCHUP_WINDOW_TICKS_PLACEHOLDER}, FIRE_ARRIVAL_JITTER_TICKS ${FIRE_ARRIVAL_JITTER_TICKS}): ${JSON.stringify(got.tally)}; commands dropped ${got.h.droppedCmds.size}; seat refused ${JSON.stringify(got.refused)}`,
      ['round', 'seq', 'sent tick', 'its command', 'room seq at decision', 'outcome'],
      got.rows.map((r) => [r.round, r.seq, r.sentTick, r.dropped ?? 'ran', Number.isNaN(r.roomSeq) ? '-' : r.roomSeq, r.out]),
    );
    expect(got.rows).toHaveLength(30);
    expect(got.h.droppedCmds.size, "no command dropped: the rise's silence left the window unspent time for the fall's burst").toBe(0);
    expect(got.tally).toEqual({ decided: 25, 'fire: rate': 5 });
    expect(got.refused).toEqual({ 'fire: rate': 5 });
    // The 'rate' rounds are the ones sent after the fall (the window ends at T0 + 2 s), which arrive in its held burst.
    const fallTick = (T0 + 2000) / TICK_MS;
    expect(got.rows.filter((r) => r.out === 'fire: rate').map((r) => r.round)).toEqual([26, 27, 28, 29, 30]);
    expect(got.rows.filter((r) => r.out === 'fire: rate').every((r) => r.sentTick >= fallTick)).toBe(true);
  });
});

describe('NCW-5: fire: stale needs the late line held past the slack window (the mechanism, corrected)', () => {
  // The room's catch-up runs a backlog on the unspent time of the last `CATCHUP_WINDOW_TICKS_PLACEHOLDER` ticks (10 s): the
  // silence at the rise (the 1.9 s the first late packet takes) is that unspent time. Held late past the window less the
  // 1.9 s, the silence has left the window when the fall's burst arrives: past the credit (`CREDIT_MAX`) the burst is
  // dropped but its newest (`dropBacklog`), and the rounds named at the dropped commands find the room's command past them.
  it("a 1.9 s lateness held 2..15 s then back to 128 ms, 30 rounds from 0.5 s before the fall: none dropped at 2 and 5 s; past ~8 s the burst's backlog is dropped and its rounds refused stale (or 'no frame' within the bound)", () => {
    const rows: (string | number)[][] = [];
    const by = new Map<number, ReturnType<typeof burst>>();
    for (const holdS of [2, 5, 9, 11, 12, 15]) {
      const T0 = 360 * TICK_MS, fall = T0 + holdS * 1000;
      const got = burst({
        at: [[0, 0, 0], [100, 0, 600]], aimAt: [100, 12, 300], lateness: (leave) => (leave >= T0 && leave < fall ? 1900 : 128), downMs: 128,
        warm: Math.round(fall / TICK_MS) - 30, rounds: 30, ticks: Math.round(fall / TICK_MS) + 600,
      });
      by.set(holdS, got);
      const stale = got.rows.filter((r) => r.out === 'fire: stale');
      rows.push([holdS, got.h.droppedCmds.size, got.rows.filter((r) => r.dropped !== null).length, stale.length, stale.filter((r) => r.dropped === 'backlog').length, JSON.stringify(got.tally)]);
    }
    table('NCW-5 stale by hold (1.9 s lateness held, then 128 ms; 30 rounds from 0.5 s before the fall)', ['hold s', 'commands dropped', 'rounds on dropped', 'stale', 'stale on backlog', 'outcomes'], rows);
    const t12 = by.get(12)!;
    table('NCW-5 stale, the 12 s hold, round by round', ['round', 'seq', 'sent tick', 'its command', 'room seq at decision', 'outcome'],
      t12.rows.map((r) => [r.round, r.seq, r.sentTick, r.dropped ?? 'ran', Number.isNaN(r.roomSeq) ? '-' : r.roomSeq, r.out]));
    for (const holdS of [2, 5]) {
      const got = by.get(holdS)!;
      expect(got.h.droppedCmds.size, `${holdS} s: nothing dropped`).toBe(0);
      expect(got.tally['fire: stale'] ?? 0, `${holdS} s: no stale`).toBe(0);
    }
    for (const holdS of [9, 11, 12, 15]) {
      const got = by.get(holdS)!;
      const stale = got.rows.filter((r) => r.out === 'fire: stale');
      expect(stale.length, `${holdS} s: rounds refused stale`).toBeGreaterThan(0);
      expect(got.refused['fire: stale'], `${holdS} s: the seat's tally`).toBe(stale.length);
      expect([...got.h.droppedCmds.values()].every((w) => w === 'backlog'), `${holdS} s: dropped as a backlog`).toBe(true);
      expect(stale.every((r) => r.dropped === 'backlog'), `${holdS} s: every stale round names a dropped command`).toBe(true);
      // Every round on a dropped command is refused: stale past the bound, 'no frame' within it (a dropped command has no cone frame).
      for (const r of got.rows.filter((x) => x.dropped !== null)) {
        expect(r.out, `${holdS} s round ${r.round}`).toBe(r.roomSeq - r.seq > FIRE_ARRIVAL_JITTER_TICKS ? 'fire: stale' : 'fire: no frame');
      }
    }
    // The 12 s hold, the "before" pinned: rounds 7-15 run in the fall's burst on the credit, refused 'rate' on the room's
    // clock; 16-22 named at dropped commands, stale; 23 dropped within the bound, 'no frame'; the rest decided.
    expect(t12.tally).toEqual({ decided: 13, 'fire: rate': 9, 'fire: stale': 7, 'fire: no frame': 1 });
    expect(t12.rows.filter((r) => r.out === 'fire: rate').map((r) => r.round)).toEqual([7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(t12.rows.filter((r) => r.out === 'fire: stale').map((r) => r.round)).toEqual([16, 17, 18, 19, 20, 21, 22]);
    expect(t12.rows.filter((r) => r.out === 'fire: no frame').map((r) => r.round)).toEqual([23]);
  });
});

/**
 * Player 1 (T) the shooter at the origin, firing at a point beside player 2 (S), on a 150 ms line each way; player 3 (S)
 * at (0, 0, 100) on a 0 ms line fires the default kit's rounds at player 1's chest, one each 12 ticks from tick `start`,
 * until player 1 is dead.
 */
function tradeRun(start: number, opt: {
  rttMs?: number; aimAt?: V3; downMs?: number; lateMs?: number; rounds?: number; at2?: V3; warm?: number; turnDeg?: number; offCentre?: number;
  rules?: 'respawn' | 'classic';
  /** Run before each room step after the killer's own (a staged state for the review's F4). */
  extra?: (t: number, h: ReturnType<typeof room3>) => void;
} = {}) {
  let killerSeq = -1, killerLook: { yaw: number; pitch: number } | null = null, lastShot = -Infinity;
  const others = (t: number, h: ReturnType<typeof room3>): void => {
    const { room } = h;
    const q = room.player(3)!, victim = room.player(1)!;
    if (killerSeq < 0) killerSeq = q.sim.seq;
    if (t === 2) {
      const st = q.sim.walker.state, v = victim.sim.walker.state;
      killerLook = faceToward({ feet: [st.x, st.y, st.z], posture: q.sim.walker.posture }, [v.x, v.y + 12, v.z]);
      q.sim.allowSnap();
    }
    const l = killerLook ?? { yaw: q.sim.walker.state.yaw, pitch: 0 };
    const firing = t >= start && victim.alive;
    const cmd: Command = { seq: ++killerSeq, forward: 0, right: 0, ...l, turn: 0, buttons: firing ? Button.Trigger : 0, stance: 0, weapon: 0 };
    room.binary(3, encodeCommands({ viewTick: room.tick, commands: [cmd] }));
    if (firing && t - lastShot >= 12) {
      const f = q.cone.frame(q.sim.seq);
      if (f) {
        const v = victim.sim.walker.state, e = cameraLook(f).eye;
        const c = centreClaim(f, [f.feet[0], f.feet[1] + EYE_HEIGHT, f.feet[2]], Math.hypot(v.x - e[0], v.y + 12 - e[1], v.z - e[2]));
        room.text(3, { type: 'fire', seq: q.sim.seq, from: c.from, dir: c.dir, eye: c.eye, aim: c.aim, weapon: 0, viewTick: room.tick });
        lastShot = t;
      }
    }
  };
  const late = opt.lateMs ?? 150;
  const got = burst({
    at: [[0, 0, 0], opt.at2 ?? [100, 0, 600], [0, 0, 100]], aimAt: opt.aimAt ?? [100, 12, 300], lateness: () => late, downMs: opt.downMs ?? late,
    warm: opt.warm ?? 360, rounds: opt.rounds ?? 30, ticks: 360 + 300, others: (t, h) => { others(t, h); opt.extra?.(t, h); },
    ...(opt.rttMs !== undefined ? { rttMs: opt.rttMs } : {}), ...(opt.turnDeg !== undefined ? { turnDeg: opt.turnDeg } : {}),
    ...(opt.offCentre !== undefined ? { offCentre: opt.offCentre } : {}), ...(opt.rules !== undefined ? { rules: opt.rules } : {}),
  });
  const k = got.h.kills.find((x) => x.victim === 1);
  const notAlive = got.rows.filter((r) => r.out === 'fire: not alive');
  return { got, k, notAlive, ranAlive: k ? notAlive.filter((r) => r.seq <= k.victimSeq) : [] };
}

describe('NCW-5: fire: stale on a line whose lateness swings repeatedly (the field\'s likely source, a "before")', () => {
  /**
   * A line alternating 128 ms and a seeded 600-1900 ms, each phase a seeded 0.5-2 s, for 25 s, the trigger held from
   * the first swing (the room's magazine staged full: `refill`). One ordered line, as above. Each outcome counted; the
   * stale rounds split by the arrival's measure (`timed`'s `staleFires`: past the bound on arrival, against stale while
   * pending -- run past by a drop or a burst after it arrived).
   */
  function swing(seed: number) {
    let r = seed;
    const rand = (): number => { r = (r * 16807) % 2147483647; return r / 2147483647; };
    const T0 = 360 * TICK_MS, end = T0 + 25000;
    const phases: { from: number; ms: number }[] = [];
    for (let at = T0, high = true; at < end; high = !high) { phases.push({ from: at, ms: high ? 600 + rand() * 1300 : 128 }); at += 500 + rand() * 1500; }
    const lateness = (leave: number): number => {
      if (leave < T0 || leave >= end) return 128;
      let ms = 128;
      for (const ph of phases) { if (ph.from > leave) break; ms = ph.ms; }
      return ms;
    };
    const got = burst({ at: [[0, 0, 0], [100, 0, 600]], aimAt: [100, 12, 300], lateness, downMs: 128, warm: 360, rounds: 100000, ticks: Math.round(end / TICK_MS) + 600, refill: true });
    const stale = got.rows.filter((x) => x.out === 'fire: stale');
    return {
      got, phases: phases.length,
      count: {
        rounds: got.rows.length, decided: got.tally.decided ?? 0, stale: stale.length, rate: got.tally['fire: rate'] ?? 0, noFrame: got.tally['fire: no frame'] ?? 0,
        other: got.rows.filter((x) => !['decided', 'fire: stale', 'fire: rate', 'fire: no frame'].includes(x.out)).map((x) => x.out).join(','),
        staleOnArrival: stale.filter((x) => x.staleOnArrival).length, staleWhilePending: stale.filter((x) => !x.staleOnArrival).length,
        staleOnBacklog: stale.filter((x) => x.dropped === 'backlog').length,
        commandsDropped: got.h.droppedCmds.size, staleFires: got.staleFires,
      },
    };
  }

  it('128 ms <-> 600-1900 ms every 0.5-2 s for 25 s, seeds 1-3: the counts, pinned as today\'s before', () => {
    const runs = [1, 2, 3].map((seed) => ({ seed, ...swing(seed) }));
    table('NCW-5 stale on a swinging line (128 ms <-> 600-1900 ms, phases 0.5-2 s, 25 s)',
      ['seed', 'phases', 'rounds', 'decided', 'stale', 'on arrival', 'while pending', 'on backlog', 'rate', 'no frame', 'other', 'cmds dropped', 'staleFires'],
      runs.map((x) => [x.seed, x.phases, x.count.rounds, x.count.decided, x.count.stale, x.count.staleOnArrival, x.count.staleWhilePending, x.count.staleOnBacklog, x.count.rate, x.count.noFrame, x.count.other, x.count.commandsDropped, x.count.staleFires]));
    for (const x of runs) {
      // The instrument agrees with the per-round measure: `staleFires` counts the rounds past the bound on arrival.
      expect(x.count.staleFires, `seed ${x.seed}: staleFires`).toBe(x.got.rows.filter((y) => y.staleOnArrival).length);
      expect(x.got.refused['fire: stale'] ?? 0, `seed ${x.seed}: the seat's tally`).toBe(x.count.stale);
    }
    console.log(`NCW-5 swing counts: ${JSON.stringify(runs.map((x) => x.count))}`);
    expect(runs.map((x) => x.count)).toEqual(PINNED_SWING);
  });
});

/**
 * The swing's counts today (seeds 1-3), the "before". It does NOT reproduce the field's stale-heavy ratio (1,656 stale to
 * 114 rate, section 6): here 'rate' outnumbers 'stale' about 4 to 1. Every stale round was stale while pending (none on
 * arrival: `staleFires` 0) and named a command dropped as a backlog. 'undecided' = the last two rounds, still on the line
 * when the run stops.
 */
const PINNED_SWING: unknown[] = [
  { rounds: 350, decided: 273, stale: 16, rate: 56, noFrame: 3, other: 'undecided,undecided', staleOnArrival: 0, staleWhilePending: 16, staleOnBacklog: 16, commandsDropped: 106, staleFires: 0 },
  { rounds: 350, decided: 268, stale: 16, rate: 61, noFrame: 3, other: 'undecided,undecided', staleOnArrival: 0, staleWhilePending: 16, staleOnBacklog: 16, commandsDropped: 108, staleFires: 0 },
  { rounds: 350, decided: 263, stale: 11, rate: 72, noFrame: 2, other: 'undecided,undecided', staleOnArrival: 0, staleWhilePending: 11, staleOnBacklog: 11, commandsDropped: 70, staleFires: 0 },
];

describe('NCW-5: fire: not alive -- the trade after death (B-trade, the "before")', () => {
  it("a 150 ms shooter's burst while a 0 ms third player kills him: the 3 rounds still on the line refused not alive, every one named at a command the room ran after the kill (the lane's reading CORRECTED)", () => {
    const { got, k, notAlive, ranAlive } = tradeRun(380);
    expect(k, 'the third player killed the shooter').toBeDefined();
    table(
      `NCW-5 not alive, 150 ms each way: killed at room tick ${k!.tick} (${k!.atMs.toFixed(0)} ms) with his command ${k!.victimSeq} run, heard at page tick ${got.heardDeath}; ${JSON.stringify(got.tally)}; seat refused ${JSON.stringify(got.refused)}`,
      ['round', 'seq', 'sent tick', 'fired before the kill (wall)', 'before he heard it', 'its command ran', 'outcome'],
      got.rows.map((r) => [r.round, r.seq, r.sentTick, r.sentTick * TICK_MS < k!.atMs ? 'yes' : 'no', r.sentTick < got.heardDeath ? 'yes' : 'no', r.seq <= k!.victimSeq ? 'alive' : 'dead', r.out]),
    );
    expect(notAlive.length, 'some rounds refused not alive').toBeGreaterThan(0);
    expect(got.refused['fire: not alive']).toBe(notAlive.length);
    expect(notAlive.map((r) => r.round)).toEqual([7, 8, 9]);
    // All were fired before the page heard its death; two of them before the room's kill, in wall time.
    expect(notAlive.every((r) => r.sentTick < got.heardDeath)).toBe(true);
    expect(notAlive.filter((r) => r.sentTick * TICK_MS < k!.atMs).map((r) => r.round)).toEqual([7, 8]);
    // CORRECTED: in this run none names a command the room ran while he lived. The round and its command share one ordered
    // line, so a round in flight at the kill names a command in flight with it, which the room then runs on the dead body
    // (`run`'s dead branch). The exception is at most one round a death: one named at exactly the last command run alive,
    // which `due` (`p.sim.seq > ev.seq`) decides only once the next command has run -- on the dead body (the sweep below).
    expect(ranAlive.length, "B-trade's set as the plan words it ('a command the room ran while he lived'): at most one round a death").toBeLessThanOrEqual(1);
    expect(ranAlive.every((r) => r.seq === k!.victimSeq), 'and only one named at the last command run alive').toBe(true);
  });

  it("the killer's first shot swept over 12 ticks: a round named at exactly the last command run alive is refused not alive (at most one a death); every other not-alive round names a command run on the dead body", () => {
    const rows: (string | number)[][] = [];
    let staged = 0;
    for (let start = 380; start < 392; start++) {
      const { got, k, notAlive, ranAlive } = tradeRun(start);
      expect(k, `start ${start}: the shooter killed`).toBeDefined();
      rows.push([start, k!.tick, k!.victimSeq, notAlive.map((r) => r.seq).join(','), ranAlive.map((r) => r.seq).join(',') || '-', JSON.stringify(got.tally)]);
      expect(ranAlive.length, `start ${start}: at most one round a death`).toBeLessThanOrEqual(1);
      expect(ranAlive.every((r) => r.seq === k!.victimSeq), `start ${start}: only the last command run alive`).toBe(true);
      expect(notAlive.every((r) => r.sentTick < got.heardDeath), `start ${start}: every refused round fired before the page heard its death`).toBe(true);
      expect(got.rows.filter((r) => r.seq < k!.victimSeq).every((r) => r.out === 'decided'), `start ${start}: every round before the last command run alive decided`).toBe(true);
      staged += ranAlive.length;
    }
    table('NCW-5 not alive by the killer\'s first shot (150 ms shooter)', ['start', 'kill tick', 'last command alive', 'not-alive seqs', 'named at a command run alive', 'outcomes'], rows);
    expect(staged, 'the one-round case is staged in the sweep').toBeGreaterThan(0);
  });
});

/**
 * NCW-2 B-trade (simulation track; the plan's section 4 row, research 193 §12.11, research 223 §4
 * `TRADE_WINDOW_CAP_MS_ADAPTATION`): a round named at a command the shooter's page sent before it could have known of his
 * death -- fewer commands past his last command run alive than the room's measure of his round trip (`Player.pingExact`,
 * the heartbeat's) in ticks, never past the cap -- is decided on that last command's frame, as if he lived; the rest stay
 * `not alive`. The original's receiving console applies a dead attacker's `Hit` (`FUN_002bbbd0` D:L160819-160850;
 * `FUN_005a1b80` D:L459519 asks only that he resolves); the bound is the port's own.
 */
describe('NCW-2 B-trade: the trade after death (the "after")', () => {
  it('the window: the commands under the measured round trip, at most the cap; none without a measure', () => {
    // NCW-2 B-bound (OT.R105): the cap follows the seat's rewind cap (`rewindCapMs`), at most the 400 ms ceiling.
    expect(TRADE_WINDOW_CAP_MS_ADAPTATION).toBe(400);
    expect(tradeWindowTicks(0)).toBe(0);                          // no sample yet: today's rule
    expect(tradeWindowTicks(16)).toBe(1);                         // 0.96 of a command: the last alive one's own round only
    expect(tradeWindowTicks(100)).toBe(6);
    expect(tradeWindowTicks(300)).toBe(18);                       // was 12 (capped at 200 ms); the seat's cap is 400 ms
    expect(tradeWindowTicks(400)).toBe(24);
    expect(tradeWindowTicks(5000)).toBe(24);                      // capped: the ceiling, 400 ms
    for (let rtt = 1; rtt <= 1000; rtt += 7) expect(tradeWindowTicks(rtt) / TICK_HZ * 1000).toBeLessThanOrEqual(rewindCapMs(rtt) + 1000 / TICK_HZ);
  });

  it("the 150 ms shooter's last rounds, sent before his page could know of his death and inside the window, are decided; the rest still refused", () => {
    const before = tradeRun(380);                                 // no round trip measured: today's rule
    const after = tradeRun(380, { rttMs: 300 });
    const k = after.k!;
    const w = tradeWindowTicks(300);
    table(
      `NCW-2 B-trade, 150 ms each way, rtt 300 (window ${w} commands): killed at room tick ${k.tick} with his command ${k.victimSeq} run, heard at page tick ${after.got.heardDeath}; before ${JSON.stringify(before.got.tally)}, after ${JSON.stringify(after.got.tally)}`,
      ['round', 'seq', 'past his last alive', 'before he heard it', 'before', 'after'],
      after.got.rows.map((r, i) => [r.round, r.seq, r.seq - k.victimSeq, r.sentTick < after.got.heardDeath ? 'yes' : 'no', before.got.rows[i]!.out, r.out]),
    );
    console.log(`NCW-2 B-trade not alive: before ${before.notAlive.length}, after ${after.notAlive.length}`);
    expect(before.notAlive.map((r) => r.round)).toEqual([7, 8, 9]);
    // The same run but for the measure: the kill at the same tick and command.
    expect(before.k!.tick).toBe(k.tick);
    expect(before.k!.victimSeq).toBe(k.victimSeq);
    for (const r of after.got.rows) {
      if (r.seq < k.victimSeq) { expect(r.out, `round ${r.round}, named alive`).toBe('decided'); continue; }
      expect(r.out, `round ${r.round} (${r.seq - k.victimSeq} past)`).toBe(r.seq - k.victimSeq < w ? 'decided' : 'fire: not alive');
    }
    expect(after.notAlive.length).toBeLessThan(before.notAlive.length);
    // Pinned: rounds 7, 8 and 9 (2, 8 and 14 past his last command run alive) decided -- NCW-2 B-bound (OT.R105): the
    // window follows the seat's cap, 18 commands at rtt 300 (was 12, capped at 200 ms, which left round 9 refused).
    expect(after.notAlive.map((r) => r.round)).toEqual([]);
    expect(after.got.refused['fire: not alive'] ?? 0).toBe(after.notAlive.length);
  });

  it("the killer's first shot swept over 12 ticks (NCW-5's sweep), rtt 300: the not-alive count before and after; every round left refused is past the window", () => {
    const w = tradeWindowTicks(300);
    const rows: (string | number)[][] = [];
    let before = 0, after = 0;
    for (let start = 380; start < 392; start++) {
      const b0 = tradeRun(start), a0 = tradeRun(start, { rttMs: 300 });
      const k = a0.k!;
      before += b0.notAlive.length; after += a0.notAlive.length;
      rows.push([start, k.victimSeq, b0.notAlive.map((r) => r.seq - k.victimSeq).join(','), a0.notAlive.map((r) => r.seq - k.victimSeq).join(',') || '-']);
      expect(a0.notAlive.every((r) => r.seq - k.victimSeq >= w), `start ${start}: refused only past the window`).toBe(true);
      expect(a0.got.rows.filter((r) => r.seq - k.victimSeq < w).every((r) => r.out === 'decided'), `start ${start}: decided inside it`).toBe(true);
    }
    table(`NCW-2 B-trade by the killer's first shot (150 ms shooter, rtt 300, window ${w}): not alive before ${before}, after ${after}`,
      ['start', 'last command alive', 'not alive before (past)', 'not alive after (past)'], rows);
    console.log(`NCW-2 B-trade sweep not alive: before ${before}, after ${after}`);
    expect(after).toBeLessThan(before);
    // NCW-2 B-bound (OT.R105): 40 before, 4 after (was 16 with the window capped at 200 ms, 12 commands). The 4 left are
    // named 18 and 19 commands past his last alive one -- at or past the measured round trip (18 ticks), sent after the
    // page could have known of the death by the room's measure, so `not alive` stands.
    expect(before).toBe(40);
    expect(after).toBe(4);
  });

  it('a posthumous round that strikes damages its target; a kill it makes is credited to the dead shooter', () => {
    // Player 2 stood at (100, 0, 250), the shooter aiming at his chest from command 388 (three of his hits kill), so the
    // burst spans the kill; the room's damage rules unchanged.
    const before = tradeRun(380, { at2: [100, 0, 250], aimAt: [100, 12, 250], warm: 388 });
    const after = tradeRun(380, { at2: [100, 0, 250], aimAt: [100, 12, 250], warm: 388, rttMs: 300 });
    const k = after.k!;
    table(`NCW-2 B-trade, aimed at player 2: before ${JSON.stringify(before.got.tally)}, after ${JSON.stringify(after.got.tally)}`,
      ['round', 'seq', 'past his last alive', 'before', 'after', "player 2's health after"],
      after.got.rows.map((r, i) => [r.round, r.seq, r.seq - k.victimSeq, before.got.rows[i]!.out, r.out, r.hp?.[2] ?? '-']));
    const post = after.got.rows.filter((r) => r.seq > k.victimSeq && r.out === 'decided');
    expect(post.length, 'some posthumous rounds decided').toBeGreaterThan(0);
    // Player 2's health after the last round named alive, then after the last posthumous one: it fell.
    const prior = after.got.rows.filter((r) => r.seq <= k.victimSeq && r.hp).at(-1)!;
    expect(post.at(-1)!.hp![2]!, "player 2's health fell under the dead shooter's rounds").toBeLessThan(prior.hp![2]!);
    // Today's rule: nothing after the last round named alive touched player 2.
    const priorBefore = before.got.rows.filter((r) => r.seq <= before.k!.victimSeq && r.hp).at(-1)!;
    expect(healthSum(before.got.h.room.player(2)!.health)).toBe(priorBefore.hp![2]!);
    // Pinned: round 2 named at his last command run alive (0 past) and round 3 (6 past) decided and striking, round 3 the
    // kill; round 4 (12 past) decided inside the 18-command window (NCW-2 B-bound: the seat's cap; it struck nobody, player
    // 2 being dead); round 5 (18 past) outside it, refused as before.
    expect(after.got.rows.map((r) => r.out)).toEqual(['decided', 'decided', 'decided', 'decided', 'fire: not alive']);
    expect(before.got.rows.map((r) => r.out)).toEqual(['decided', 'fire: not alive', 'fire: not alive', 'fire: not alive', 'fire: not alive']);
    // The trade: player 2 killed by the dead shooter's round, the kill and its score his (`kill`'s ordinary credit).
    const kill2 = after.got.h.kills.find((x) => x.victim === 2);
    expect(kill2, 'player 2 killed by a posthumous round').toBeDefined();
    expect(after.got.h.room.player(2)!.alive).toBe(false);
    expect(before.got.h.room.player(2)!.alive, "today's rule: player 2 lives").toBe(true);
    const ev = after.got.h.clients.get(2)!.events.find((e) => e.type === 'kill' && (e as { victim: number }).victim === 2) as { killer: number | null } | undefined;
    expect(ev?.killer, 'the dead shooter credited').toBe(1);
    expect(after.got.h.room.player(1)!.kills).toBe(1);
    expect(after.got.h.room.player(1)!.alive, 'and he stays dead').toBe(false);
  });

  it('a page that never hears its death fires on: every round named past the window is still refused not alive (a corpse fires no further)', () => {
    const got = tradeRun(380, { rttMs: 300, downMs: 1e9 });
    const k = got.k!;
    const w = tradeWindowTicks(300);
    const post = got.got.rows.filter((r) => r.seq > k.victimSeq);
    const late = post.filter((r) => r.seq - k.victimSeq >= w);
    table(`NCW-2 B-trade, a page deaf to its death (window ${w}): ${JSON.stringify(got.got.tally)}`,
      ['round', 'seq', 'past his last alive', 'outcome'], post.map((r) => [r.round, r.seq, r.seq - k.victimSeq, r.out]));
    expect(late.length, 'rounds named well after the death').toBeGreaterThan(5);
    expect(got.got.tally).toEqual({ decided: 9, 'fire: not alive': 21 });   // NCW-2 B-bound: one more inside the 18-command window (was 8 / 22)
    expect(late.every((r) => r.out === 'fire: not alive' || r.out === 'undecided')).toBe(true);
    expect(late.filter((r) => r.out === 'fire: not alive').length).toBeGreaterThan(5);
    expect(post.filter((r) => r.out === 'decided').every((r) => r.seq - k.victimSeq < w)).toBe(true);
  });

  it('the low-ping control: an 8 ms line (rtt 16) decides as with no measure, but for a round named at the last command run alive', () => {
    const rows: (string | number)[][] = [];
    for (let start = 380; start < 392; start++) {
      const none = tradeRun(start, { lateMs: 8 });
      const low = tradeRun(start, { lateMs: 8, rttMs: 16 });
      expect(low.k!.tick, `start ${start}: the same kill`).toBe(none.k!.tick);
      const diff = low.got.rows.filter((r, i) => r.out !== none.got.rows[i]!.out);
      rows.push([start, JSON.stringify(none.got.tally), JSON.stringify(low.got.tally), diff.map((r) => r.seq - low.k!.victimSeq).join(',') || '-']);
      expect(diff.every((r) => r.seq === low.k!.victimSeq && r.out === 'decided'), `start ${start}: only the last alive command's round`).toBe(true);
    }
    table('NCW-2 B-trade low-ping control (8 ms each way)', ['start', 'no measure', 'rtt 16', 'differing rounds (past his last alive)'], rows);
  });
});

/**
 * NCW-2 B-trade, the review's fold (2026-11-05). F1: a traded round is judged on the last alive command's frame, which
 * takes neither the page's look since nor the bloom of the traded rounds before it, so a shooter who turned or fired
 * automatic in the window can be refused there -- under its own word (`fire: trade: <reason>`) and counted per seat
 * (`signals.trade`), so the field's `not alive` does not fall into the cone's buckets unseen. The cone is NOT loosened
 * (the lane's question). F3: a death inside the shooter's own command's run. F4: the victim's and the rewind's rules.
 * The bloom case is tried on the M4A1 only (at most 2 traded rounds in the window; `PINNED_F1C`): a faster weapon's
 * 3 rounds in 12 ticks is untested.
 */
describe("NCW-2 B-trade, the review's fold", () => {
  /** A run's rounds past his last command run alive, each with its offset and outcome. */
  const posthumous = (got: ReturnType<typeof tradeRun>): (string | number)[][] =>
    got.got.rows.filter((r) => r.seq > got.k!.victimSeq).map((r) => [r.round, r.seq, r.seq - got.k!.victimSeq, r.out]);

  it('F1 (a, b): a traded round refused is refused under `fire: trade: <reason>`, and the seat counts its traded rounds', () => {
    const got = tradeRun(380, { rttMs: 300, turnDeg: 0.5 });
    const w = tradeWindowTicks(300), k = got.k!;
    table(`NCW-2 fold F1, a shooter turning 0.5 degrees a tick (window ${w}): ${JSON.stringify(got.got.tally)}; trade ${JSON.stringify(got.got.trade)}`,
      ['round', 'seq', 'past his last alive', 'outcome'], posthumous(got));
    const inWindow = got.got.rows.filter((r) => r.seq >= k.victimSeq && r.seq - k.victimSeq < w);
    expect(inWindow.length).toBeGreaterThan(0);
    for (const r of inWindow) expect(r.out === 'decided' || r.out.startsWith('fire: trade: '), `round ${r.round}: ${r.out}`).toBe(true);
    const traded = inWindow.filter((r) => r.out === 'decided').length, tradeRefused = inWindow.length - traded;
    expect(got.got.trade).toEqual({ decided: traded, refused: tradeRefused });
    expect(Object.entries(got.got.refused).filter(([key]) => key.startsWith('fire: trade: ')).reduce((a, [, n]) => a + n, 0)).toBe(tradeRefused);
    // Past the window, as before: `not alive`.
    expect(got.got.rows.filter((r) => r.seq - k.victimSeq >= w).every((r) => r.out === 'fire: not alive')).toBe(true);
    expect(got.got.rows.filter((r) => r.out === 'fire: not alive' && r.seq - k.victimSeq < w)).toEqual([]);
  });

  it("the re-check's fold: a traded round refused at the cone is logged and recorded under the tally's own key (`fire: trade: cone: *`)", () => {
    const got = tradeRun(380, { rttMs: 300, turnDeg: 0.5 });
    const lines = (got.got.h.room.takeRefusals()?.lines ?? []).filter((l) => l.seat === 1);
    const tallied = Object.keys(got.got.refused).filter((k) => k.includes('cone: '));
    console.log(`NCW-2 re-check fold: lines ${JSON.stringify(lines.map((l) => l.why))}; tally ${JSON.stringify(got.got.refused)}`);
    expect(tallied).toEqual(['fire: trade: cone: cone']);
    // Two since NCW-2 B-bound: the round 14 past is inside the 18-command window now, and the frozen frame's look is 7
    // degrees behind the page's (F1's known cost), so it too is refused at the cone -- under the trade's own word.
    expect(lines.map((l) => l.why)).toEqual(['fire: trade: cone: cone', 'fire: trade: cone: cone']);
    expect(lines.length).toBe(got.got.refused['fire: trade: cone: cone']);
  });

  it('F1 (c): a turning shooter and an automatic one off the cone\'s centre -- what the trade decides and refuses, by reason (pinned)', () => {
    const rows: (string | number)[][] = [];
    const runs = {
      still: tradeRun(380, { rttMs: 300 }),
      'turn 0.25/tick': tradeRun(380, { rttMs: 300, turnDeg: 0.25 }),
      'turn 0.5/tick': tradeRun(380, { rttMs: 300, turnDeg: 0.5 }),
      'off centre 0.95': tradeRun(380, { rttMs: 300, offCentre: 0.95 }),
      'off centre 0.95, rounds from 388': tradeRun(380, { rttMs: 300, offCentre: 0.95, warm: 388 }),
      'off centre 0.999': tradeRun(380, { rttMs: 300, offCentre: 0.999 }),
      'off centre 0.999, rounds from 388': tradeRun(380, { rttMs: 300, offCentre: 0.999, warm: 388 }),
      'turn 0.5/tick, off centre 0.95': tradeRun(380, { rttMs: 300, turnDeg: 0.5, offCentre: 0.95 }),
    };
    const pinned: Record<string, string[]> = {};
    for (const [name, got] of Object.entries(runs)) {
      const k = got.k!;
      for (const r of got.got.rows.filter((x) => x.seq >= k.victimSeq)) rows.push([name, r.round, r.seq - k.victimSeq, r.out]);
      pinned[name] = got.got.rows.filter((x) => x.seq >= k.victimSeq).map((r) => `${r.seq - k.victimSeq}:${r.out}`);
      // Every round named alive and before the last alive command decided: the claims are honest.
      expect(got.got.rows.filter((r) => r.seq < k.victimSeq).every((r) => r.out === 'decided'), `${name}: the living rounds`).toBe(true);
    }
    table('NCW-2 fold F1 (c): the rounds named at or past his last command run alive (150 ms each way, rtt 300, window 12)',
      ['run', 'round', 'past his last alive', 'outcome'], rows);
    console.log(`NCW-2 fold F1 (c) pinned: ${JSON.stringify(pinned)}`);
    expect(pinned).toEqual(PINNED_F1C);
  });

  it('F3: a death inside the shooter\'s own command\'s run (a fall\'s place): the round named at the command before is his last alive one\'s, decided', () => {
    const got = burst({ at: [[0, 0, 0], [100, 0, 600]], aimAt: [100, 12, 300], lateness: () => 150, downMs: 150, warm: 360, rounds: 30, ticks: 360 + 300, rttMs: 300, selfDeathAfterRound: 4 });
    const k = got.h.kills.find((x) => x.victim === 1)!;
    expect(k, 'the staged fall').toBeDefined();
    const r4 = got.rows[3]!;
    table(`NCW-2 fold F3: killed in his own run of command ${k.victimSeq}: ${JSON.stringify(got.tally)}`, ['round', 'seq', 'past the command he died in', 'outcome'],
      got.rows.map((r) => [r.round, r.seq, r.seq - k.victimSeq, r.out]));
    expect(k.victimSeq, 'he died running the command after round 4\'s').toBe(r4.seq + 1);
    expect(r4.out, 'round 4, named while he lived').toBe('decided');
    expect(got.rows.slice(0, 4).every((r) => r.out === 'decided')).toBe(true);
  });

  it('F4: a traded round at a victim already dead is a miss -- decided, no damage, no kill', () => {
    let staged = false;
    const got = tradeRun(380, {
      at2: [100, 0, 250], aimAt: [100, 12, 250], warm: 388, rttMs: 300,
      extra: (_t, h) => {
        if (staged || !h.kills.some((x) => x.victim === 1)) return;
        staged = true;
        (h.room as unknown as { kill: (...a: unknown[]) => void }).kill(h.room.player(2)!, null, null, 'orphan', DEATH_CAUSE.FALL);
      },
    });
    const k = got.k!;
    const hp = healthSum(got.got.h.room.player(2)!.health);
    table(`NCW-2 fold F4, player 2 dead before the traded rounds: ${JSON.stringify(got.got.tally)}`, ['round', 'seq', 'past his last alive', 'outcome'], posthumous(got));
    const traded = got.got.rows.filter((r) => r.seq > k.victimSeq && r.out === 'decided');
    expect(traded.length).toBeGreaterThan(0);
    expect(traded.every((r) => r.hp![2] === hp), 'no damage').toBe(true);
    expect(got.got.h.room.player(1)!.kills).toBe(0);
  });

  it("F4: a traded round at a teammate is the team rule's (friendly fire off: no damage)", () => {
    const got = tradeRun(380, {
      at2: [100, 0, 250], aimAt: [100, 12, 250], warm: 388, rttMs: 300,
      extra: (t, h) => { if (t === 0) h.room.player(2)!.team = h.room.player(1)!.team; },
    });
    const k = got.k!;
    table(`NCW-2 fold F4, player 2 the shooter's teammate: ${JSON.stringify(got.got.tally)}`, ['round', 'seq', 'past his last alive', 'outcome'], posthumous(got));
    expect(got.got.rows.filter((r) => r.seq > k.victimSeq && r.out === 'decided').length).toBeGreaterThan(0);
    expect(got.got.rows.every((r) => r.hp === null || r.hp[2] === got.got.rows[0]!.hp![2])).toBe(true);
    expect(healthSum(got.got.h.room.player(2)!.health)).toBe(got.got.rows[0]!.hp![2]);
    expect(got.got.h.kills.some((x) => x.victim === 2)).toBe(false);
  });

  it('F4: a death mounted (his last alive frame on a turret) trades nothing', () => {
    let staged = false;
    const got = tradeRun(380, {
      rttMs: 300,
      extra: (_t, h) => {
        const k = h.kills.find((x) => x.victim === 1);
        if (staged || !k) return;
        staged = true;
        const f = h.p.cone.frame(k.victimSeq) as unknown as { turret: number | null };
        f.turret = 0;                                             // staged: the last command run alive was run mounted
      },
    });
    const k = got.k!;
    table(`NCW-2 fold F4, his last alive frame mounted: ${JSON.stringify(got.got.tally)}`, ['round', 'seq', 'past his last alive', 'outcome'], posthumous(got));
    expect(got.got.rows.filter((r) => r.seq >= k.victimSeq).every((r) => r.out === 'fire: not alive')).toBe(true);
    expect(got.got.trade ?? { decided: 0, refused: 0 }).toEqual({ decided: 0, refused: 0 });
  });

  it("F4: NCW-1's rewind class counts a traded round as any accepted round", () => {
    const got = tradeRun(380, { at2: [100, 0, 250], aimAt: [100, 12, 250], warm: 388, rttMs: 300 });
    const before = tradeRun(380, { at2: [100, 0, 250], aimAt: [100, 12, 250], warm: 388 });
    const n = (r: Record<string, number>): number => Object.values(r).reduce((a, b) => a + b, 0);
    console.log(`NCW-2 fold F4 rewind: after ${JSON.stringify(got.got.rewind)}, before ${JSON.stringify(before.got.rewind)}`);
    expect(n(got.got.rewind)).toBe(got.got.tally.decided);
    expect(n(before.got.rewind)).toBe(before.got.tally.decided);
    expect(n(got.got.rewind) - n(before.got.rewind)).toBe(got.got.trade!.decided);
  });
});

/**
 * F1 (c)'s outcomes, `past:outcome` for each round named at or past the last command run alive. The turn at 0.5 degrees a
 * tick refuses the round 8 commands on at the cone (`fire: trade: cone: cone`), its look 4 degrees past the last alive
 * frame's; the same turn claimed off centre lands that round inside it. Claims at 0.95 and 0.999 of the page kit's
 * cone (its bloom from the traded round before included) are all decided: in this harness the room's cone window and
 * slack cover the bloom the frozen frame does not take. Scope: tried on the M4A1 only. NCW-2 B-bound (OT.R105): the
 * window follows the seat's cap, 18 commands at rtt 300 (was 12), so the round 12 or 14 past is traded now -- decided
 * where the shooter stood still or claimed off centre, refused at the cone where he turned (0.25 and 0.5 degrees a tick:
 * 14 commands of turn put his look 3.5 and 7 degrees past the frozen frame's), each under the trade's own word, where it
 * was `not alive`. At most 3 traded rounds in the window here; a faster weapon's 4 in 18 ticks is untested, and any
 * refusal it causes is counted in `signals.trade` (and tallied `fire: trade: <reason>`).
 */
const PINNED_F1C: Record<string, string[]> = {
  still: ['2:decided', '8:decided', '14:decided'],
  'turn 0.25/tick': ['2:decided', '8:decided', '14:fire: trade: cone: cone'],
  'turn 0.5/tick': ['2:decided', '8:fire: trade: cone: cone', '14:fire: trade: cone: cone'],
  'off centre 0.95': ['2:decided', '8:decided', '14:decided'],
  'off centre 0.95, rounds from 388': ['0:decided', '6:decided', '12:decided', '18:fire: not alive'],
  'off centre 0.999': ['2:decided', '8:decided', '14:decided'],
  'off centre 0.999, rounds from 388': ['0:decided', '6:decided', '12:decided', '18:fire: not alive'],
  'turn 0.5/tick, off centre 0.95': ['2:decided', '8:decided', '14:fire: trade: cone: cone'],
};

/**
 * NCW-2 B-trade, Codex's review of PR #698 (2026-11-05; the controller ruled both blocking). P1 (a): in a classic round
 * `kill` lays the body's drops (`worldDrops.death` -> `dropsOf` -> `takeRing`, which empties every slot of both rings),
 * so a traded round judged on the rings after the drop met an empty magazine (`fire: trade: reload or empty`): no
 * firearm trade could be accepted in classic. Now the rounds in each weapon's magazine at the death are kept on the seat
 * (`Player.tradeRounds`, taken in `kill` before the drop) and a traded round spends from them, never from the rings. P1
 * (b): the window was bounded by command numbers only, so a page silent after its death could trade seconds later; now it
 * also expires on the room's clock (`tradeExpiryTicks`: the seat's measured line, capped, plus
 * `TRADE_ARRIVAL_JITTER_MS_ADAPTATION`).
 */
describe("NCW-2 B-trade, Codex's review of PR #698", () => {
  type Ring = ReturnType<typeof ringFor>;
  const rings = (h: ReturnType<typeof room3>): [Ring, Ring] => (h.p as unknown as { mags: [Ring, Ring] }).mags;
  /** The rifle's ring staged to `slots` (the magazine in the weapon the first) at the run's start. */
  const stageRifle = (slots: number[]) => (t: number, h: ReturnType<typeof room3>): void => {
    if (t !== 0) return;
    const r = ringFor(M4A1);
    r.restore({ slots, current: 0 });
    rings(h)[0] = r;
  };
  /** The drops told and lying, and the shooter's rings, 40 ticks after his death (every traded round decided by then). */
  const watch = () => {
    const seen = { told: [] as unknown[], lying: [] as unknown[], ringTotal: NaN, phase: '' };
    const hook = (_t: number, h: ReturnType<typeof room3>): void => {
      const k = h.kills.find((x) => x.victim === 1);
      if (!k || h.room.tick !== k.tick + 40) return;
      seen.told = JSON.parse(JSON.stringify(h.clients.get(2)!.events.filter((e) => e.type === 'drop'))) as unknown[];
      seen.lying = JSON.parse(JSON.stringify(h.room.joinWire().drops ?? [])) as unknown[];
      seen.ringTotal = rings(h)[0].total() + rings(h)[1].total();
      seen.phase = (h.room as unknown as { state: { phase: string } }).state.phase;
    };
    return { seen, hook };
  };
  const aimed = { at2: [100, 0, 250] as V3, aimAt: [100, 12, 250] as V3, warm: 388, rttMs: 300 };
  const ammoOf = (drops: unknown[]): unknown => (drops as { kind: string; entries?: unknown }[]).filter((d) => d.kind === 'ammo').map((d) => d.entries);

  it('P1 (a): in a CLASSIC round a dead shooter with rounds left at his death trades: his traded rounds are decided and strike, as in a respawn round', () => {
    const w = watch();
    const got = tradeRun(380, { ...aimed, rules: 'classic', extra: w.hook });
    const k = got.k!;
    table(`NCW-2 Codex P1 (a), classic: ${JSON.stringify(got.got.tally)}; trade ${JSON.stringify(got.got.trade)}`,
      ['round', 'seq', 'past his last alive', 'outcome', "player 2's health after"],
      got.got.rows.map((r) => [r.round, r.seq, r.seq - k.victimSeq, r.out, r.hp?.[2] ?? '-']));
    expect(w.seen.told.length, 'the classic death laid its drops (the path the finding names)').toBeGreaterThan(0);
    // The respawn round's pin ('a posthumous round that strikes'), now in classic too (NCW-2 B-bound: the round 12 past
    // inside the 18-command window, a third traded round).
    expect(got.got.rows.map((r) => r.out)).toEqual(['decided', 'decided', 'decided', 'decided', 'fire: not alive']);
    expect(got.got.trade).toEqual({ decided: 3, refused: 0 });
    expect(got.got.h.kills.some((x) => x.victim === 2), "player 2 killed by the dead shooter's traded round").toBe(true);
    expect(got.got.h.room.player(1)!.kills).toBe(1);
  });

  it('P1 (a): the magazine in the weapon empty at the death -- every traded round refused `trade: reload or empty` (its other magazines are no reload after death)', () => {
    const w = watch();
    const got = tradeRun(380, { ...aimed, rules: 'classic', extra: (t, h) => { stageRifle([1, 30, 30])(t, h); w.hook(t, h); } });
    expect(w.seen.told.length).toBeGreaterThan(0);
    expect(got.got.rows.map((r) => r.out)).toEqual(['decided', 'fire: trade: reload or empty', 'fire: trade: reload or empty', 'fire: trade: reload or empty', 'fire: not alive']);
    expect(got.got.trade).toEqual({ decided: 0, refused: 3 });   // NCW-2 B-bound: three in the 18-command window (was 2)
  });

  it("P1 (a): more traded rounds than the magazine held at the death -- the excess refused; the drop's bundle holds exactly the rounds at the death and the body none", () => {
    const w = watch();
    const got = tradeRun(380, { ...aimed, rules: 'classic', extra: (t, h) => { stageRifle([2, 30, 30])(t, h); w.hook(t, h); } });
    // Round 1, alive, spends one of the two: one left at the death, for round 2 (0 past); rounds 3 and 4 (6 and 12 past,
    // both inside B-bound's 18-command window) are the excess.
    // NCW-2 B-bound: round 4 (12 past) inside the 18-command window now, a second excess round refused alike.
    expect(got.got.rows.map((r) => r.out)).toEqual(['decided', 'decided', 'fire: trade: reload or empty', 'fire: trade: reload or empty', 'fire: not alive']);
    expect(got.got.trade).toEqual({ decided: 1, refused: 2 });
    // The bundle as the death laid it, nothing added since: the rifle's [1, 30, 30] and the sidearm's full ring.
    expect(ammoOf(w.seen.told)).toEqual([[{ item: M4A1.id, rounds: [1, 30, 30] }, { item: DE.id, rounds: ringFor(DE).entries() }]]);
    expect(ammoOf(w.seen.lying)).toEqual(ammoOf(w.seen.told));
    expect(w.seen.ringTotal, 'the body keeps no round: nothing given back to it').toBe(0);
    expect(['play', 'decided']).toContain(w.seen.phase);
  });

  it('P1 (a), the respawn path pinned: a respawn death drops nothing; the traded rounds spend the rounds kept at the death, the rings untouched, the excess refused alike', () => {
    const w = watch();
    const got = tradeRun(380, { ...aimed, extra: (t, h) => { stageRifle([2, 30, 30])(t, h); w.hook(t, h); } });
    expect(w.seen.told).toEqual([]);
    // NCW-2 B-bound: round 4 (12 past) inside the 18-command window now, a second excess round refused alike.
    expect(got.got.rows.map((r) => r.out)).toEqual(['decided', 'decided', 'fire: trade: reload or empty', 'fire: trade: reload or empty', 'fire: not alive']);
    // The rifle's 1 + 30 + 30 and the sidearm's ring as at the death (the spawn refills both).
    expect(w.seen.ringTotal).toBe(61 + ringFor(DE).total());
  });

  /**
   * A dead shooter whose page goes silent `silent` room ticks after the room's kill, then sends three commands and one
   * round named at the command after his last alive one (inside the command window) with a current `viewTick`, aimed
   * at player 2's chest. Returns the round's outcome, the room's ticks from the death to its decision, and whether
   * player 2 took damage.
   */
  function lateTrade(silent: number, rttMs = 300) {
    const h = room3([[0, 0, 0], [100, 0, 250]]);
    const { room, p } = h;
    room.noteRoundTrip(1, rttMs);
    let seq = p.sim.seq, look = { yaw: 0, pitch: 0 };
    const send = (n: number): void => {
      const cmds: Command[] = [];
      for (let i = 0; i < n; i++) cmds.push({ seq: ++seq, forward: 0, right: 0, ...look, turn: 0, buttons: 0, stance: 0, weapon: 0 });
      room.binary(1, encodeCommands({ viewTick: room.tick, commands: cmds }));
    };
    const step = (): void => { h.advance(TICK_MS); room.step(); };
    for (let t = 0; t < 30; t++) {
      if (t === 2) {
        const st = p.sim.walker.state;
        look = faceToward({ feet: [st.x, st.y, st.z], posture: p.sim.walker.posture }, [100, 12, 250]);
        p.sim.allowSnap();
      }
      send(1); step();
    }
    (room as unknown as { kill: (...a: unknown[]) => void }).kill(p, null, null, 'fall', DEATH_CAUSE.FALL);
    const k = h.kills.find((x) => x.victim === 1)!;
    const hp0 = healthSum(room.player(2)!.health);
    for (let t = 0; t < silent; t++) step();
    send(3);
    const f = p.cone.frame(k.victimSeq)!;
    const e = cameraLook(f).eye;
    const c = centreClaim(f, [f.feet[0], f.feet[1] + EYE_HEIGHT, f.feet[2]], Math.hypot(100 - e[0], 12 - e[1], 250 - e[2]));
    room.text(1, { type: 'fire', seq: k.victimSeq + 1, from: c.from, dir: c.dir, eye: c.eye, aim: c.aim, weapon: 0, viewTick: room.tick });
    for (let t = 0; t < 4; t++) step();
    const d = h.decisions.find((x) => x.seq === k.victimSeq + 1);
    return { silent, out: d?.out ?? 'undecided', elapsed: d ? d.at - k.tick : NaN, hit: healthSum(room.player(2)!.health) < hp0 };
  }

  it('P1 (b): a page silent for 3 s after its death, then a round inside the command window with a current viewTick -- refused `not alive`, no damage', () => {
    const control = lateTrade(0), silent = lateTrade(3 * TICK_HZ);
    console.log(`NCW-2 Codex P1 (b): control ${JSON.stringify(control)}; silent ${JSON.stringify(silent)}`);
    expect(control.out, 'the harness: the same round at once is traded').toBe('decided');
    expect(control.hit, 'and strikes').toBe(true);
    expect(silent.out).toBe('fire: not alive');
    expect(silent.hit).toBe(false);
  });

  it('P1 (b), the edge of TRADE_ARRIVAL_JITTER_MS_ADAPTATION: decided at the last tick of the expiry, refused `not alive` the tick after', () => {
    expect(TRADE_ARRIVAL_JITTER_MS_ADAPTATION).toBe((FIRE_ARRIVAL_JITTER_TICKS * 1000) / TICK_HZ);   // 50 ms, 3 ticks
    const bound = tradeExpiryTicks(300);
    expect(bound).toBe(tradeWindowTicks(300) + FIRE_ARRIVAL_JITTER_TICKS);                            // 18 + 3 (B-bound; was 12 + 3)
    expect(bound).toBe(21);
    expect(tradeExpiryTicks(0)).toBe(0);                                                               // no measure, no trade
    const runs = [];
    for (let s = bound - 4; s <= bound + 2; s++) runs.push(lateTrade(s));
    table(`NCW-2 Codex P1 (b), the expiry's edge (bound ${bound} ticks from the death)`, ['silent ticks', 'death to decision', 'outcome', 'struck'],
      runs.map((r) => [r.silent, r.elapsed, r.out, r.hit ? 'yes' : 'no']));
    for (const r of runs) {
      expect(r.out, `silent ${r.silent}, decided ${r.elapsed} ticks after the death`).toBe(r.elapsed <= bound ? 'decided' : 'fire: not alive');
      expect(r.hit).toBe(r.elapsed <= bound);
    }
    expect(runs.some((r) => r.elapsed === bound), 'a round just inside').toBe(true);
    expect(runs.some((r) => r.elapsed === bound + 1), 'a round just outside').toBe(true);
  });
});
