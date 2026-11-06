import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CollisionOwner, GridParams, SpawnSlot, WeaponRecord, WorldPoly } from '@s2u/scene';
import type { Health } from '../../viewer/src/net/damage';
import { DEATH_CAUSE } from '../../viewer/src/net/deaths';
import {
  Button, cameraLook, centreClaim, encodeCommands, EYE_HEIGHT, faceToward, groundGrid, packGround, PROTOCOL_VERSION, ringFor, ShotCone, TICK_HZ,
  type Command, type ServerEvent, type SimMap,
} from '../../viewer/src/sim';
import { FIRE_ARRIVAL_JITTER_TICKS, Room, rewindCapTicks, tradeExpiryTicks, tradeWindowTicks, type Conn } from '../src/room';

/**
 * NCW-2 B-bound, an invariance pin (a test only; nothing in the room changes). On the box, `fire: stale` at lag 200 read
 * 4 before B-bound and 35 after. B-bound reads the seat's measure (`Player.pingExact`) in two places only: the rewind's
 * cap (`rewindCapTicks`, read by `fireAt` after every refusal it makes) and B-trade's window (`tradeFrame`, read by `fire`
 * for a dead shooter only). `decide`'s stale test (`p.sim.seq - ev.seq > FIRE_ARRIVAL_JITTER_TICKS`) runs before both,
 * and the rate, reload, muzzle and cone (eye) refusals run in `fireAt` before the cap is read. So one schedule of rounds,
 * run twice through the real room -- once with no measure (cap 200 ms, 12 ticks, no trade window) and once at
 * `pingExact` 400 (cap 400 ms, 24 ticks, trade window 24) -- must refuse the same rounds for the same reasons, in the
 * same order; only the scored hit or miss at the rewind and a dead shooter's trade (decided or refused under
 * `trade: <reason>`, against `not alive`) may differ. Unit-test evidence only: the real `Room` on a flat floor, its
 * private `decide` wrapped (the original called) to read each decision; no browser, no box. Expected to pass at once:
 * nothing is fixed here. A failure would be a real B-bound effect on the refusals.
 *
 * The harness is `refusalRepro.test.ts`'s (`room3`, `lateTrade`; the flat floor and the kit staged from the disc's
 * records, `scene/test/golden/weapon-records.json`), copied.
 */

const healthSum = (h: Health): number => [...h.hp, ...h.armour].reduce((a, b) => a + b, 0);
const PIN = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../scene/test/golden/weapon-records.json'), 'utf8')) as { records: Record<string, WeaponRecord> };
const byName = (name: string): WeaponRecord => Object.values(PIN.records).find((w) => w.name === name)!;
const M4A1 = byName('M4A1'), DE = PIN.records['7']!;
type V3 = [number, number, number];
const TICK_MS = 1000 / TICK_HZ;

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

/**
 * One round of the schedule. Alive: named at command `base + at`; dead: at the last command run alive plus `past`.
 * `late`: the commands the room has run past the named one when the round reaches it (0: it arrives with its command
 * run and waits for the next, `due`). `view`: its `viewTick` -- 'cross', the last tick the target stood on the shooter's
 * line (how deep the rewind must reach to score it); 'now', the room's tick. `eye`, `muzzle`, `empty`: staged refusals.
 */
interface Shot { name: string; at?: number; past?: number; late: number; view: 'cross' | 'now'; eye?: boolean; muzzle?: boolean; empty?: boolean }

const L = [0, 2, 3, 4, 5, 8];
const ALIVE: Shot[] = [
  ...L.map((late, i): Shot => ({ name: `late ${late}, seen on the line`, at: 14 * i, late, view: 'cross' })),
  ...L.map((late, i): Shot => ({ name: `late ${late}, seen now`, at: 84 + 14 * i, late, view: 'now' })),
  { name: 'eye off its frame, late 2', at: 168, late: 2, view: 'cross', eye: true },
  { name: 'eye off its frame, late 5', at: 182, late: 5, view: 'cross', eye: true },
  { name: 'muzzle far, late 2', at: 196, late: 2, view: 'cross', muzzle: true },
  { name: 'magazine empty, late 3', at: 210, late: 3, view: 'cross', empty: true },
  { name: 'decided, late 2 (before the rate)', at: 224, late: 2, view: 'cross' },
  { name: 'two commands on: rate, late 2', at: 226, late: 2, view: 'cross' },
  ...L.map((late, i): Shot => ({ name: `late ${late}, seen on the line (2)`, at: 240 + 14 * i, late, view: 'cross' })),
];
const DEAD: Shot[] = [
  { name: 'named 2 before the death, late 2', past: -2, late: 2, view: 'cross' },
  { name: 'dead +0, late 2', past: 0, late: 2, view: 'cross' },
  { name: 'dead +6, late 0', past: 6, late: 0, view: 'cross' },
  { name: 'dead +12, late 3', past: 12, late: 3, view: 'cross' },
  { name: 'dead +14, late 5', past: 14, late: 5, view: 'cross' },
  { name: 'dead +18, late 2, eye off', past: 18, late: 2, view: 'cross', eye: true },
  { name: 'dead +20, late 4', past: 20, late: 4, view: 'cross' },
  { name: 'dead +24, late 2 (past the window)', past: 24, late: 2, view: 'cross' },
  { name: 'dead +30, late 8', past: 30, late: 8, view: 'cross' },
];

/** One decision of player 1's round, as the room took it. */
interface Decision { seq: number; tick: number; late: number; out: string; struck: boolean; depth: number | null }

/**
 * The schedule through the real room: player 1 (the shooter) at the origin, one command a tick, aimed at the point on
 * the line (0, 12, 300); player 2 (the target) carried along x across that line and back (4 units a tick, period 60), its
 * health restored after each round so it never dies. `rttMs`: the shooter's measured round trip (`noteRoundTrip`).
 */
function run(rttMs: number | undefined) {
  let now = 0, s = 1;
  const room = new Room(flatMap(), null, { now: () => now, random: () => { s = (s * 16807) % 2147483647; return s / 2147483647; }, launchCountdownS: 0, rules: 'respawn' }, null, null);
  [1, 2].forEach((id) => room.hello(id, new Client(), { type: 'hello', version: PROTOCOL_VERSION, name: '', map: 'MP99' }, `10.0.0.${id}`));
  room.step();
  const p = room.player(1)!, q = room.player(2)!;
  const P = p as unknown as { records: [WeaponRecord, WeaponRecord]; cone: ShotCone; mags: ReturnType<typeof ringFor>[]; signals: { refused: Record<string, number>; staleFires: number; trade?: { decided: number; refused: number } } };
  P.records = [M4A1, DE]; P.cone = new ShotCone(M4A1); P.mags = [ringFor(M4A1), ringFor(DE)];
  p.sim.walker.place(0, 20, 0);
  q.sim.walker.place(-60, 20, 300);
  if (rttMs !== undefined) room.noteRoundTrip(1, rttMs);
  const h0 = JSON.parse(JSON.stringify(q.health)) as Health;
  const restore = (): void => { q.health.hp.splice(0, q.health.hp.length, ...h0.hp); q.health.armour.splice(0, q.health.armour.length, ...h0.armour); };

  const R = room as unknown as { decide: (pp: unknown, ev: { type: string; seq: number }, n?: number) => void; rewoundBodies: (...a: unknown[]) => unknown; kill: (...a: unknown[]) => void };
  const decisions: Decision[] = [];
  const decide = R.decide.bind(room), rewound = R.rewoundBodies.bind(room);
  let rewindAt: number | null = null;
  R.rewoundBodies = (...a: unknown[]) => { if (rewindAt === null) rewindAt = a[4] as number; return rewound(...a); };
  R.decide = (pp, ev, n) => {
    if (pp !== p || ev.type !== 'fire') return decide(pp, ev, n);
    const late = p.sim.seq - ev.seq, hp = healthSum(q.health);
    rewindAt = null;
    room.takeDrops();
    decide(pp, ev, n);
    const d = room.takeDrops();
    decisions.push({ seq: ev.seq, tick: room.tick, late, out: d ? Object.keys(d).join('+') : 'decided', struck: healthSum(q.health) < hp, depth: rewindAt === null ? null : room.tick - rewindAt });
    restore();
  };

  // The target's own trail (the room's history of it, `Player.history`): the last tick it stood on the line, x = 0.
  const trail = (q as unknown as { history: { tick: number; feet: number[] }[] }).history;
  const crossTick = (): number => { for (let i = trail.length - 1; i >= 0; i--) if (Math.abs(trail[i]!.feet[0]!) < 0.5) return trail[i]!.tick; return room.tick; };

  let seq = p.sim.seq, look = { yaw: 0, pitch: 0 }, n = 0, aimY = 12;
  const step = (): void => {
    const phase = n++ % 60;
    q.sim.walker.state.x = phase < 30 ? -60 + 4 * phase : 60 - 4 * (phase - 30);
    if (P.mags[0]!.rounds() < 10) P.mags[0] = ringFor(M4A1);   // staged: a long run fires past one magazine
    now += TICK_MS; room.step();
  };
  const command = (): void => { room.binary(1, encodeCommands({ viewTick: room.tick, commands: [{ seq: ++seq, forward: 0, right: 0, ...look, turn: 0, buttons: 0, stance: 0, weapon: 0 } as Command] })); };
  const fire = (sh: Shot, named: number, frameSeq: number): void => {
    const f = p.cone.frame(frameSeq)!;
    expect(f, `${sh.name}: its frame`).toBeTruthy();
    const e = cameraLook(f).eye;
    const c = centreClaim(f, [f.feet[0], f.feet[1] + EYE_HEIGHT, f.feet[2]], Math.hypot(0 - e[0], aimY - e[1], 300 - e[2]));
    const eye: V3 = sh.eye ? [c.eye[0] + 20, c.eye[1], c.eye[2]] : [c.eye[0], c.eye[1], c.eye[2]];
    const from: V3 = sh.muzzle ? [c.from[0] + 100, c.from[1], c.from[2]] : [c.from[0], c.from[1], c.from[2]];
    if (sh.empty) { const r = ringFor(M4A1); r.restore({ slots: [0, 30, 30], current: 0 }); P.mags[0] = r; }
    room.text(1, { type: 'fire', seq: named, from, dir: c.dir, eye, aim: c.aim, weapon: 0, viewTick: sh.view === 'cross' ? crossTick() : room.tick });
    if (sh.empty) P.mags[0] = ringFor(M4A1);
  };

  // Warm: the shooter's look snapped to the line's point; the target's trail laid.
  for (let t = 0; t < 60; t++) {
    if (t === 2) {
      const st = p.sim.walker.state;
      aimY = q.sim.walker.state.y + 12;
      look = faceToward({ feet: [st.x, st.y, st.z], posture: p.sim.walker.posture }, [0, aimY, 300]);
      p.sim.allowSnap();
    }
    command(); step();
  }
  const base = seq + 1;
  const aliveSends = ALIVE.map((sh) => ({ sh, named: base + sh.at!, sendAt: base + sh.at! + sh.late }));
  const lastAlive = Math.max(...aliveSends.map((x) => x.sendAt)) + 2;
  while (p.sim.seq < lastAlive) {
    command(); step();
    for (const x of aliveSends) if (x.sendAt === p.sim.seq) fire(x.sh, x.named, x.named);
  }
  R.kill(p, null, null, 'fall', DEATH_CAUSE.FALL);
  const died = p.sim.seq;
  expect(p.alive, 'the shooter dead').toBe(false);
  const deadSends = DEAD.map((sh) => ({ sh, named: died + sh.past!, sendAt: died + sh.past! + sh.late }));
  const fireDead = (): void => {
    // A dead body's commands lay no frame: the page claims from its own last view, the last command run alive's.
    for (const x of deadSends) if (x.sendAt === p.sim.seq) fire(x.sh, x.named, Math.min(x.named, died));
  };
  fireDead();
  const lastDead = Math.max(...deadSends.map((x) => x.sendAt)) + 2;
  while (p.sim.seq < lastDead) { command(); step(); fireDead(); }
  expect(p.alive, 'still dead at the end (no respawn inside the schedule)').toBe(false);
  const rows = [...aliveSends, ...deadSends].map((x) => ({ name: x.sh.name, seq: x.named, dead: x.sh.past !== undefined, d: decisions.filter((y) => y.seq === x.named) }));
  return { rows, decisions, died, refused: { ...P.signals.refused }, staleFires: P.signals.staleFires, trade: P.signals.trade ? { ...P.signals.trade } : null, pingExact: (p as unknown as { pingExact: number }).pingExact };
}

/** A refusal decided before the rewind: everything but a decided round and the dead shooter's trade-or-not. */
const tradeKey = (out: string): boolean => out === 'fire: not alive' || out.startsWith('fire: trade: ');
const tally = (rows: ReturnType<typeof run>['rows']): Record<string, number> => {
  const t: Record<string, number> = {};
  for (const r of rows) for (const d of r.d) if (d.out !== 'decided' && !tradeKey(d.out)) t[d.out] = (t[d.out] ?? 0) + 1;
  return t;
};
function table(title: string, head: string[], rows: (string | number)[][]): void {
  const w = head.map((x, i) => Math.max(x.length, ...rows.map((r) => String(r[i]).length)));
  const line = (r: (string | number)[]): string => r.map((x, i) => String(x).padEnd(w[i]!)).join(' | ');
  console.log([title, line(head), w.map((k) => '-'.repeat(k)).join('-|-'), ...rows.map(line)].join('\n'));
}
const show = (d: Decision | undefined): string => !d ? 'undecided' : d.out === 'decided' ? (d.struck ? 'decided: hit' : 'decided: miss') : d.out;

describe('NCW-2 B-bound: the per-seat cap moves no refusal decided before the rewind (an invariance pin)', () => {
  it('one schedule, no measure (cap 12 ticks, no trade) against pingExact 400 (cap 24, trade window 24): stale, eye, rate, reload, muzzle identical, in the same order', () => {
    expect(rewindCapTicks(0)).toBe(12);
    expect(tradeWindowTicks(0)).toBe(0);
    expect(rewindCapTicks(400)).toBe(24);
    expect(tradeWindowTicks(400)).toBe(24);
    expect(tradeExpiryTicks(400)).toBe(24 + FIRE_ARRIVAL_JITTER_TICKS);
    const a = run(undefined), b = run(400);
    expect(a.pingExact).toBe(0);
    expect(b.pingExact).toBe(400);
    expect(b.died).toBe(a.died);

    table(`NCW-2 B-bound invariance (died at command ${a.died}): cap 200 ms (no measure) against 400 ms (pingExact 400)`,
      ['round', 'seq', 'late at decision', 'cap 200: outcome', 'depth', 'cap 400: outcome', 'depth', 'differs'],
      a.rows.map((r, i) => {
        const x = r.d[0], y = b.rows[i]!.d[0];
        return [r.name, r.seq, x ? x.late : '-', show(x), x?.depth ?? '-', show(y), y?.depth ?? '-', show(x) === show(y) ? '' : 'yes'];
      }));
    console.log(`NCW-2 B-bound invariance tallies: cap 200 ${JSON.stringify(a.refused)} staleFires ${a.staleFires} trade ${JSON.stringify(a.trade)}; cap 400 ${JSON.stringify(b.refused)} staleFires ${b.staleFires} trade ${JSON.stringify(b.trade)}`);

    // Every round decided exactly once, at the same lateness, in both runs.
    for (const [x, y] of a.rows.map((r, i) => [r, b.rows[i]!] as const)) {
      expect(x.d.length, `${x.name}: decided once (cap 200)`).toBe(1);
      expect(y.d.length, `${y.name}: decided once (cap 400)`).toBe(1);
      expect(y.d[0]!.late, `${x.name}: the same lateness`).toBe(x.d[0]!.late);
    }
    // The order of the decisions, and their ticks: identical.
    expect(b.decisions.map((d) => [d.seq, d.tick, d.late])).toEqual(a.decisions.map((d) => [d.seq, d.tick, d.late]));
    // Round by round: a living shooter's every outcome but the scored hit identical; a dead one's stale identical, and
    // nothing but the trade (not alive against decided or `trade: <reason>`) differs.
    for (const [x, y] of a.rows.map((r, i) => [r, b.rows[i]!] as const)) {
      const ox = x.d[0]!.out, oy = y.d[0]!.out;
      if (!x.dead) { expect(oy, `${x.name} (alive)`).toBe(ox); continue; }
      if (ox === 'fire: stale' || oy === 'fire: stale') { expect(oy, `${x.name} (dead, stale)`).toBe(ox); continue; }
      expect(ox, `${x.name}: no measure, no trade`).toBe('fire: not alive');
      expect(oy === ox || oy === 'decided' || oy.startsWith('fire: trade: '), `${x.name}: ${oy}`).toBe(true);
    }
    // The tallies of every refusal decided before the rewind, and the arrival's stale measure.
    expect(tally(b.rows)).toEqual(tally(a.rows));
    const preRewind = (r: Record<string, number>): Record<string, number> => Object.fromEntries(Object.entries(r).filter(([k]) => !tradeKey(k)));
    expect(preRewind(b.refused)).toEqual(preRewind(a.refused));
    expect(b.staleFires).toBe(a.staleFires);

    // The schedule meets what it means to: stale at 4, 5, 8; `cone: eye`; the rate, the empty magazine and the muzzle.
    const t = tally(a.rows);
    expect(t['fire: stale']).toBe(a.rows.filter((r) => r.d[0]!.late > FIRE_ARRIVAL_JITTER_TICKS).length);
    expect(a.rows.filter((r) => r.d[0]!.late > FIRE_ARRIVAL_JITTER_TICKS).length).toBeGreaterThanOrEqual(9);
    expect(t['fire: cone: eye']).toBe(1);
    expect(t['fire: rate']).toBeGreaterThanOrEqual(1);
    expect(t['fire: reload or empty']).toBe(1);
    expect(t['fire: muzzle far']).toBe(1);
    // A round arriving with its command run (late 0) waits for the next: decided at 1.
    expect(a.rows.filter((r) => r.name.includes('late 0')).every((r) => r.d[0]!.late === 1)).toBe(true);

    // What may differ, shown: the scored hit at the rewind, and the trade.
    const diffs = a.rows.map((r, i) => ({ r, x: r.d[0]!, y: b.rows[i]!.d[0]! })).filter(({ x, y }) => show(x) !== show(y));
    table('NCW-2 B-bound: what differs (legitimately: past the rewind, or the trade)', ['round', 'seq', 'cap 200', 'depth', 'cap 400', 'depth'],
      diffs.map(({ r, x, y }) => [r.name, r.seq, show(x), x.depth ?? '-', show(y), y.depth ?? '-']));
    for (const { r, x, y } of diffs) {
      if (r.dead) continue;
      expect(x.out === 'decided' && y.out === 'decided', `${r.name}: only the scored hit differs`).toBe(true);
    }
    // The schedule exercises both: a hit only the deeper cap reaches, and a traded round.
    expect(diffs.some(({ r, x, y }) => !r.dead && !x.struck && y.struck), 'a hit only the 400 ms cap scores').toBe(true);
    expect(diffs.some(({ r, y }) => r.dead && y.out === 'decided'), 'a round traded at 400').toBe(true);
  });
});
