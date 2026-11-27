import { describe, expect, it } from 'vitest';
import type { ServerEvent } from '../../viewer/src/sim';
import { PROTOCOL_VERSION, SNAPSHOT_HZ, TICK_HZ } from '../../viewer/src/net/protocol';
import type { Room } from '../src/room';
import { decodeRecords, REPLAY_FORMAT_VERSION, type ReplayHeader } from '../src/replay/format';
import { FileRecorder } from '../src/replay/recorder';
import { NetClient, type NetWalk, type WebSocketLike } from '../../viewer/src/net/client';
import { Client, damageScript, isReport, isReportFrame, seatedRoom, six, tallies, type DamageReport, type Run } from './helpers/damageReportRoom';
import { dmgTrack } from './helpers/dmgTrack';

/** Intake item 2 (C): the DMG points of a wound of `raw` off an arm (every hand-made hit here: a limb, never a kill). */
const pt = (raw: number): number => dmgTrack().hit(1, raw);

/**
 * WM-DATA task 3b (the owner's amendment, through the lane seat; `DAMAGE_REPORT_ADAPTATION`, `match/src/room.ts`):
 * PRODUCT TRACK, a browser adaptation with no original -- the game gives a player no damage numbers -- changing nothing
 * the room simulates. In a room playing RESPAWN rules the damage report is also per life: at a death the victim alone
 * is sent (`send`, never broadcast) the report of the life that just ended -- what he took in it, by enemy, and what he
 * dealt, by enemy -- marked `life: true`, by `Room.kill`'s one line after the kill and the score are told. A classic
 * room tells nothing at a death (`roomDamageReport.test.ts`). And `takeOver` moves a seat's ledger rows to its new id
 * (task 3's review finding 1).
 */

const isLife = (e: ServerEvent): e is DamageReport => isReport(e) && (e as { life?: unknown }).life === true;
const isLifeFrame = (f: string): boolean => isReportFrame(f) && (JSON.parse(f) as { life?: unknown }).life === true;
const lifeReports = (run: Run, id: number): DamageReport[] => run.cs[id - 1]!.events().filter(isLife);
const norm = (r: DamageReport) => ({ ...r, taken: r.taken.map((t) => ({ ...t, health: six(t.health) })), dealt: r.dealt.map((t) => ({ ...t, health: six(t.health) })) });
type Kill = Extract<ServerEvent, { type: 'kill' }>;
type KillFn = (victim: unknown, killer: unknown, weapon: string | null, how: string, cause: number) => void;
type Body = { health: { hp: number[]; armour: number[] } };

let cached: { on: Run; off: Run } | null = null;
/** At each life report's arrival: the victim alive?, the killer's kills as the room holds them and as the last score told them, the last kill told. */
const atReport: { victim: number; alive: boolean; kills: number; told: number; killed: number }[] = [];
const runs = (): { on: Run; off: Run } => (cached ??= {
  on: damageScript(false, {
    ready: (room, cs) => cs.forEach((c, i) => {
      c.onText = (f) => {
        if (!isLifeFrame(f)) return;
        const ev = c.events(), score = ev.slice(0, -1).reverse().find((e) => e.type === 'score');
        const lastKill = ev.slice(0, -1).reverse().find((e) => e.type === 'kill');
        const told = score?.type === 'score' ? score.rows.find((r) => r.id === 1)?.kills ?? -1 : -1;
        atReport.push({ victim: i + 1, alive: room.player(i + 1)!.alive, kills: room.player(1)!.kills, told, killed: lastKill?.type === 'kill' ? lastKill.victim : -1 });
      };
    }),
  }),
  // the same room and script with the life report alone stubbed (the round report still sent)
  off: damageScript(false, { ready: (room) => { (room as unknown as Record<string, unknown>).reportLifeDamage = (): void => { /* off */ }; } }),
});

/** The expected life report of `victim` from player 1's timeline between two indices. */
function expected(run: Run, victim: number, round: number, from: number, to: number): DamageReport {
  const taken: DamageReport['taken'] = [], dealt: DamageReport['dealt'] = [];
  for (const [k, v] of tallies(run.timeline, from, to)) {
    const [a, b] = k.split('>').map(Number) as [number, number];
    if (b === victim) taken.push({ from: a, hits: v.hits, health: six(v.health) });
    if (a === victim) dealt.push({ to: b, hits: v.hits, health: six(v.health) });
  }
  taken.sort((x, y) => y.health - x.health || x.from - y.from);
  dealt.sort((x, y) => y.health - x.health || x.to - y.to);
  return { type: 'damageReport', round, life: true, taken, dealt };
}

describe('WM-DATA task 3b: the life report at a death in a respawn room (DAMAGE_REPORT_ADAPTATION)', () => {
  it('goes to the victim alone, once a life: 2 twice in the first round, 3 once in the second; no one else, no watcher, no recording', () => {
    const { on } = runs();
    expect(on.timeline.filter((e) => e.type === 'kill').map((k) => (k as Kill).victim)).toEqual([2, 2, 3]);
    expect(lifeReports(on, 2)).toHaveLength(2);
    expect(lifeReports(on, 3)).toHaveLength(1);
    expect(lifeReports(on, 1)).toHaveLength(0);
    expect(lifeReports(on, 4)).toHaveLength(0);
    expect(on.watcher.events().some(isReport)).toBe(false);
    expect(on.recorded.some(isReport)).toBe(false);
  }, 60_000);                                                                  // the first test plays both scripts

  it('the order at a kill: the kill, then the score, then the report -- next in the victim\'s stream', () => {
    const { on } = runs();
    for (const id of [2, 3]) {
      const ev = on.cs[id - 1]!.events();
      const kills = ev.flatMap((e, i) => (e.type === 'kill' && e.victim === id ? [i] : []));
      expect(kills.length).toBeGreaterThan(0);
      for (const i of kills) {
        expect(ev[i + 1]!.type).toBe('score');
        expect(ev[i + 2]).toMatchObject({ type: 'damageReport', life: true });
      }
    }
  });

  it('every other recipient\'s stream is byte-identical with the life report off; the victim\'s too, less its life reports; the recording the same', () => {
    const { on, off } = runs();
    expect(off.cs.some((c) => c.frames.some(isLifeFrame))).toBe(false);       // the stubbed run sent none
    expect(on.watcher.frames).toEqual(off.watcher.frames);
    for (const id of [1, 4]) expect(on.cs[id - 1]!.frames).toEqual(off.cs[id - 1]!.frames);
    for (const id of [2, 3]) expect(on.cs[id - 1]!.frames.filter((f) => !isLifeFrame(f))).toEqual(off.cs[id - 1]!.frames);
    expect(JSON.stringify(on.recorded)).toBe(JSON.stringify(off.recorded));
    for (const id of [1, 2, 3, 4]) {
      const a = on.room.player(id)!, b = off.room.player(id)!;
      expect([a.alive, a.score, a.kills, a.deaths, [...a.health.hp], [...a.health.armour]]).toEqual([b.alive, b.score, b.kills, b.deaths, [...b.health.hp], [...b.health.armour]]);
    }
  });

  it('built after the kill is final: the victim dead, the killer\'s kill already counted and told', () => {
    runs();
    expect(atReport.map((a) => a.victim)).toEqual([2, 2, 3]);
    for (const a of atReport) {
      expect(a.alive).toBe(false);
      expect(a.killed).toBe(a.victim);
      expect(a.kills).toBe(a.told);
      expect(a.kills).toBeGreaterThan(0);
    }
  });

  it('each life\'s own: 2\'s second report holds only his second life\'s hits; 3\'s next-round report not the last round\'s hit', () => {
    const { on } = runs();
    const t = on.timeline;
    const kill2 = t.flatMap((e, i) => (e.type === 'kill' && (e as Kill).victim === 2 ? [i] : []));
    const r2 = t.findIndex((e) => e.type === 'roundOver');
    const kill3 = t.findIndex((e) => e.type === 'kill' && (e as Kill).victim === 3);
    expect(kill2).toHaveLength(2);
    const [first, second] = lifeReports(on, 2).map(norm);
    expect(first).toEqual(expected(on, 2, 1, 0, kill2[0]!));
    expect(second).toEqual(expected(on, 2, 1, kill2[0]!, kill2[1]!));
    expect(second!.taken).toEqual([expect.objectContaining({ from: 1 })]);
    expect(tallies(t, 0, r2).get('1>3')!.hits).toBe(1);                     // 3 took one hit in round 1 and lived
    expect(norm(lifeReports(on, 3)[0]!)).toEqual(expected(on, 3, 1, r2, kill3));
  });

  it('exact keys: type, round, life, taken and dealt; life is true; each entry only its id, hits and health', () => {
    const { on } = runs();
    const all = [...lifeReports(on, 2), ...lifeReports(on, 3)];
    expect(all).toHaveLength(3);
    for (const r of all) {
      expect(Object.keys(r).sort()).toEqual(['dealt', 'life', 'round', 'taken', 'type']);
      expect(r.life).toBe(true);
      for (const e of r.taken) expect(Object.keys(e).sort()).toEqual(['from', 'health', 'hits']);
      for (const e of r.dealt) expect(Object.keys(e).sort()).toEqual(['health', 'hits', 'to']);
      for (const e of [...r.taken, ...r.dealt]) for (const v of Object.values(e)) expect(typeof v).toBe('number');
    }
  });
});

/** A respawn room, played one step; `hit` lays an applied hit through `combat()`, `kill` the room's own kill, `sent` every `send` from now. */
function bare(): { room: Room; cs: Client[]; watcher: Client; hit: (a: number, t: number, change: (b: Body) => void) => void; kill: (victim: number, killer: number) => void; sent: () => [number, ServerEvent][] } {
  const { room, cs, watcher } = seatedRoom(false);
  room.step();
  const hit = (a: number, t: number, change: (b: Body) => void): void => {
    const target = room.player(t)! as unknown as Body;
    const healthBefore = [...target.health.hp], armourBefore = [...target.health.armour];
    change(target);
    (room as unknown as { combat(a: unknown, t: unknown, d: Record<string, unknown>): void }).combat(room.player(a), room.player(t), { status: 'applied', request: 'fire', healthBefore, armourBefore });
  };
  const kill = (victim: number, killer: number): void => (room as unknown as { kill: KillFn }).kill.call(room, room.player(victim), room.player(killer), null, 'weapon', 0);
  const log: [number, ServerEvent][] = [];
  const r = room as unknown as { send(id: number, ev: ServerEvent): void };
  const send = r.send.bind(room);
  r.send = (id, ev) => { log.push([id, ev]); send(id, ev); };
  return { room, cs, watcher, hit, kill, sent: () => log };
}

describe('WM-DATA task 3b: the life books (an enemy\'s health only; cleared at the death that sends them)', () => {
  it('taken and dealt in this life; a teammate\'s, armour-only and a self hit never count; the second death only the second life', () => {
    const { room, hit, kill, sent } = bare();
    hit(1, 2, (b) => { b.health.hp[1]! -= 5; });                               // T 1 -> S 2
    hit(4, 2, (b) => { b.health.hp[2]! -= 3; });                               // T 4 -> S 2
    hit(2, 1, (b) => { b.health.hp[1]! -= 6; });                               // 2 deals to 1
    hit(3, 2, (b) => { b.health.hp[1]! -= 2; });                               // his teammate (friendly fire): never
    hit(1, 2, (b) => { b.health.armour[1]! -= 9; });                           // armour only: never
    hit(2, 2, (b) => { b.health.hp[0]! -= 1; });                               // his own: never
    hit(2, 3, (b) => { b.health.hp[0]! -= 1; });                               // he hits his teammate: never
    kill(2, 1);
    const lives = (): [number, ServerEvent][] => sent().filter(([, ev]) => isLife(ev));
    expect(lives()).toEqual([[2, { type: 'damageReport', round: 1, life: true, taken: [{ from: 1, hits: 1, health: pt(5) }, { from: 4, hits: 1, health: pt(3) }], dealt: [{ to: 1, hits: 1, health: pt(6) }] }]]);
    hit(1, 2, (b) => { b.health.hp[1]! -= 7; });                               // the next life's
    kill(2, 4);
    expect(lives()[1]).toEqual([2, { type: 'damageReport', round: 1, life: true, taken: [{ from: 1, hits: 1, health: pt(7) }], dealt: [] }]);
    expect(sent().filter(([, ev]) => isReport(ev)).map(([id]) => id)).toEqual([2, 2]);   // no one else, nothing more
    // the round's book keeps both lives
    (room as unknown as { reportRoundDamage(): void }).reportRoundDamage();
    const round = sent().find(([id, ev]) => id === 2 && isReport(ev) && !isLife(ev))![1];
    expect(round).toEqual({ type: 'damageReport', round: 1, taken: [{ from: 1, hits: 2, health: pt(5) + pt(7) }, { from: 4, hits: 1, health: pt(3) }], dealt: [{ to: 1, hits: 1, health: pt(6) }] });
  });

  it('a death with nothing taken or dealt still sends the victim his (empty) life report', () => {
    const { kill, sent } = bare();
    kill(3, 1);
    expect(sent().filter(([, ev]) => isReport(ev))).toEqual([[3, { type: 'damageReport', round: 1, life: true, taken: [], dealt: [] }]]);
  });
});

describe('WM-DATA task 3b: a replay recorded from a respawn room that sent life reports holds none', () => {
  function recorded(broadcast: boolean): { types: string[]; truncated: boolean } {
    const header: ReplayHeader = {
      format: REPLAY_FORMAT_VERSION, protocol: PROTOCOL_VERSION, build: { commit: 'abc1234', dirty: false, branch: null, branchCreated: null },
      map: 'MP99', rules: 'respawn', gameType: null, tickHz: TICK_HZ, snapshotHz: SNAPSHOT_HZ, kind: 'solo', serverName: null,
      startedAt: '2026-11-15T00:00:00.000Z', session: null,
    };
    const chunks: Uint8Array[] = [];
    let failure: unknown = null;
    const recorder = new FileRecorder(header, (b) => chunks.push(b), 30, (e) => { failure = e; });
    damageScript(false, {
      ready: (room) => {
        const r = room as unknown as { broadcast(ev: ServerEvent): void; round: number; reportLifeDamage(): void; reportRoundDamage(): void };
        r.reportRoundDamage = (): void => { /* the round's: its own test */ };
        if (broadcast) r.reportLifeDamage = (): void => { r.broadcast({ type: 'damageReport', round: r.round, life: true, taken: [], dealt: [] }); };
      },
    }, { recorder });
    recorder.close('test');
    expect(failure).toBeNull();
    const out = decodeRecords(Buffer.concat(chunks.map((c) => Buffer.from(c))));
    return { types: out.records.flatMap((r) => (r.kind === 'event' ? [r.event.type as string] : [])), truncated: out.truncated };
  }

  it('the decoded file holds the three kills and no damageReport', () => {
    const { types, truncated } = recorded(false);
    expect(truncated).toBe(false);
    expect(types.filter((t) => t === 'kill')).toHaveLength(3);
    expect(types.filter((t) => t === 'damageReport')).toEqual([]);
  });

  it('the control: a life report broadcast instead of sent is in the decoded file, so the check above can fail', () => {
    expect(recorded(true).types.filter((t) => t === 'damageReport')).toHaveLength(3);
  });
});

describe('WM-DATA task 3b: takeOver moves the seat\'s damage ledger to its new id (task 3 review finding 1)', () => {
  const NEW = 11;
  /** 1 deals 2 and takes from 3, his page reconnects as 11 (the same session: `takeOver`), then 11 deals 2 and takes from 2. */
  function takenOver(): ReturnType<typeof bare> & { again: Client } {
    const b = bare();
    b.hit(1, 2, (x) => { x.health.hp[1]! -= 5; });
    b.hit(3, 1, (x) => { x.health.hp[1]! -= 4; });
    const again = new Client();
    b.room.hello(NEW, again, { type: 'hello', version: PROTOCOL_VERSION, name: 'P1', map: 'MP99', session: 'tab1'.padEnd(22, '_') }, `10.0.0.${1}`);
    expect(b.room.player(1)).toBeUndefined();
    expect(b.room.player(NEW)).toBeDefined();
    b.hit(NEW, 2, (x) => { x.health.hp[1]! -= 3; });
    b.hit(2, NEW, (x) => { x.health.hp[1]! -= 2; });
    return { ...b, again };
  }

  it('at the round\'s end his report covers both halves, and his opponents\' name him once, under the new id', () => {
    const { room, cs, again } = takenOver();
    for (let i = 0; i < 60 * TICK_HZ && !again.events().some((e) => e.type === 'roundOver'); i++) room.step();
    const round = (c: Client): DamageReport[] => c.events().filter(isReport).filter((r) => !isLife(r));
    expect(round(again)).toEqual([{ type: 'damageReport', round: 1, taken: [{ from: 3, hits: 1, health: pt(4) }, { from: 2, hits: 1, health: pt(2) }], dealt: [{ to: 2, hits: 2, health: pt(5) + pt(3) }] }]);
    expect(round(cs[1]!)).toEqual([{ type: 'damageReport', round: 1, taken: [{ from: NEW, hits: 2, health: pt(5) + pt(3) }], dealt: [{ to: NEW, hits: 1, health: pt(2) }] }]);
    expect(round(cs[2]!)).toEqual([{ type: 'damageReport', round: 1, taken: [], dealt: [{ to: NEW, hits: 1, health: pt(4) }] }]);
    expect(round(cs[3]!)).toEqual([{ type: 'damageReport', round: 1, taken: [], dealt: [] }]);
  });

  it('his life report at a death after the reconnect covers both halves too', () => {
    const { kill, sent } = takenOver();
    kill(NEW, 2);
    expect(sent().filter(([, ev]) => isLife(ev))).toEqual([[NEW, { type: 'damageReport', round: 1, life: true, taken: [{ from: 3, hits: 1, health: pt(4) }, { from: 2, hits: 1, health: pt(2) }], dealt: [{ to: 2, hits: 2, health: pt(5) + pt(3) }] }]]);
  });

  it("the merge: when the new id already has rows (its own and inside another's), takeOver's rows are summed into them", () => {
    const b = bare();
    const took = (a: number, v: number, h: number): void => (b.room as unknown as { damageTook(a: number, v: number, h: number): void }).damageTook(a, v, h);
    b.hit(1, 2, (x) => { x.health.hp[1]! -= 5; });
    b.hit(3, 1, (x) => { x.health.hp[1]! -= 4; });
    took(NEW, 2, 1);                                                          // an entry of NEW already in 2's rows (1 DMG point)
    took(3, NEW, 2);                                                          // and a row of NEW's own
    b.room.hello(NEW, new Client(), { type: 'hello', version: PROTOCOL_VERSION, name: 'P1', map: 'MP99', session: 'tab1'.padEnd(22, '_') }, `10.0.0.${1}`);
    expect(b.room.player(1)).toBeUndefined();
    (b.room as unknown as { reportRoundDamage(): void }).reportRoundDamage();
    const round = (id: number): ServerEvent | undefined => b.sent().find(([to, ev]) => to === id && isReport(ev) && !isLife(ev))?.[1];
    expect(round(NEW)).toEqual({ type: 'damageReport', round: 1, taken: [{ from: 3, hits: 2, health: 2 + pt(4) }], dealt: [{ to: 2, hits: 2, health: 1 + pt(5) }] });
    expect(round(2)).toEqual({ type: 'damageReport', round: 1, taken: [{ from: NEW, hits: 2, health: 1 + pt(5) }], dealt: [] });
    expect(round(3)).toEqual({ type: 'damageReport', round: 1, taken: [], dealt: [{ to: NEW, hits: 2, health: 2 + pt(4) }] });
    b.kill(NEW, 2);
    expect(b.sent().filter(([, ev]) => isLife(ev))).toEqual([[NEW, { type: 'damageReport', round: 1, life: true, taken: [{ from: 3, hits: 2, health: 2 + pt(4) }], dealt: [{ to: 2, hits: 2, health: 1 + pt(5) }] }]]);
  });
});

describe("WM-DATA task 3b: a leaver's rows move to a departed id; a joiner given his id (freeId) starts from nothing", () => {
  /**
   * 2 (a SEAL) deals 1 and takes from 1, alive; 2 leaves (`leave`, no park): his rows and the entries naming him move
   * to a departed id no seat can hold (negative). A new page joins under the freed id 2 and deals and takes from one
   * enemy, `foe` -- 4 or 3, never 1 -- so 1's rows hold only the leaver's.
   */
  function leftAndJoined(): ReturnType<typeof bare> & { joiner: Client; foe: number } {
    const b = bare();
    b.hit(2, 1, (x) => { x.health.hp[1]! -= 6; });
    b.hit(1, 2, (x) => { x.health.hp[1]! -= 5; });
    expect(b.room.player(2)!.alive).toBe(true);
    b.room.leave(2);
    expect(b.room.player(2)).toBeUndefined();
    const joiner = new Client();
    b.room.hello(2, joiner, { type: 'hello', version: PROTOCOL_VERSION, name: 'P5', map: 'MP99', session: 'tab5'.padEnd(22, '_') }, `10.0.0.${5}`);
    expect(b.room.player(2)).toBeDefined();
    const team = b.room.player(2)!.team;
    const foe = [4, 3].find((id) => b.room.player(id)!.team !== team)!;
    b.hit(2, foe, (x) => { x.health.hp[1]! -= 3; });
    b.hit(foe, 2, (x) => { x.health.hp[1]! -= 2; });
    return { ...b, joiner, foe };
  }
  const roundOf = (room: Room, c: Client): DamageReport[] => {
    for (let i = 0; i < 60 * TICK_HZ && !c.events().some((e) => e.type === 'roundOver'); i++) room.step();
    return c.events().filter(isReport).filter((r) => !isLife(r));
  };

  it("the joiner's round report takes only his own: nothing the leaver took", () => {
    const { room, joiner, foe } = leftAndJoined();
    expect(roundOf(room, joiner).map((r) => r.taken)).toEqual([[{ from: foe, hits: 1, health: pt(2) }]]);
  });

  it("the joiner's round report deals only his own: nothing the leaver dealt", () => {
    const { room, joiner, foe } = leftAndJoined();
    expect(roundOf(room, joiner).map((r) => r.dealt)).toEqual([[{ to: foe, hits: 1, health: pt(3) }]]);
  });

  it("the joiner's first life report holds only his own life", () => {
    const { kill, sent, foe } = leftAndJoined();
    kill(2, foe);
    expect(sent().filter(([, ev]) => isLife(ev))).toEqual([[2, { type: 'damageReport', round: 1, life: true, taken: [{ from: foe, hits: 1, health: pt(2) }], dealt: [{ to: foe, hits: 1, health: pt(3) }] }]]);
  });

  it("an opponent still names what the leaver did to him, under a departed (negative) id: 1's round and life reports, and what 1 did to him", () => {
    const { room, cs, kill, sent, foe } = leftAndJoined();
    expect(foe).not.toBe(1);
    kill(1, 3);
    const life = sent().find(([id, ev]) => id === 1 && isLife(ev))![1] as DamageReport;
    expect(life.taken).toHaveLength(1);
    const departed = life.taken[0]!.from;
    expect(departed).toBeLessThan(0);                                          // no seat can hold it
    expect(life.taken).toEqual([{ from: departed, hits: 1, health: pt(6) }]);
    expect(life.dealt).toEqual([{ to: departed, hits: 1, health: pt(5) }]);
    const round = roundOf(room, cs[0]!);
    expect(round.map((r) => r.taken)).toEqual([[{ from: departed, hits: 1, health: pt(6) }]]);
    expect(round.map((r) => r.dealt)).toEqual([[{ to: departed, hits: 1, health: pt(5) }]]);
    // the departed id is no recipient: no page is sent a report for it
    expect(sent().some(([id]) => id < 0)).toBe(false);
  });
});

describe('WM-DATA task 3b: the departed id on the wire (protocol 17, no version change) and nowhere else', () => {
  /** Every key under which an event names a seat (a player id); a departed id under any of them outside damageReport is a leak. */
  const ID_KEYS = new Set(['id', 'ids', 'killer', 'victim', 'from', 'to', 'attacker', 'target', 'player', 'players', 'holder', 'carrier', 'leader', 'host', 'owner', 'occupant', 'seat', 'seats', 'by', 'issuer', 'speaker', 'talker', 'members', 'voter', 'subject']);
  function negativeIds(v: unknown, key: string | null, out: string[], path: string): void {
    if (typeof v === 'number') { if (key !== null && ID_KEYS.has(key) && v < 0) out.push(`${path}=${v}`); return; }
    if (Array.isArray(v)) { v.forEach((x, i) => negativeIds(x, key, out, `${path}[${i}]`)); return; }
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) negativeIds(x, k, out, `${path}.${k}`);
  }
  const departedId = (room: Room): number => (room as unknown as { departedDamageId: number }).departedDamageId;
  /** A leaver re-keyed (as `leftAndJoined`), a joiner on his id, then a kill and the round's end, every page listening. */
  function played(): { room: Room; pages: Client[]; joiner: Client } {
    const b = bare();
    b.hit(2, 1, (x) => { x.health.hp[1]! -= 6; });
    b.hit(1, 2, (x) => { x.health.hp[1]! -= 5; });
    b.room.leave(2);                                                          // the lobby's left, the roster's change
    const joiner = new Client();
    b.room.hello(2, joiner, { type: 'hello', version: PROTOCOL_VERSION, name: 'P5', map: 'MP99', session: 'tab5'.padEnd(22, '_') }, `10.0.0.${5}`);
    b.kill(1, 3);                                                             // a kill and its score
    for (let i = 0; i < 60 * TICK_HZ && !b.cs[0]!.events().some((e) => e.type === 'roundOver'); i++) b.room.step();   // the round's end
    return { room: b.room, pages: [...b.cs, b.watcher, joiner], joiner };
  }

  it('(b) after the re-key, no event but damageReport names an id below 0 -- through a roster change, a join, a kill, scores and the round end', () => {
    const { pages } = played();
    const types = new Set(pages.flatMap((c) => c.events().map((e) => e.type as string)));
    for (const t of ['score', 'kill', 'roundOver', 'damageReport']) expect(types.has(t), t).toBe(true);
    expect(types.has('lobby') || types.has('left') || types.has('roster') || types.has('joined'), [...types].join(',')).toBe(true);
    const leaks: string[] = [];
    for (const c of pages) for (const e of c.events()) if (!isReport(e)) negativeIds(e, null, leaks, e.type);
    expect(leaks).toEqual([]);
    // and the departed id did reach a damageReport (the check is not vacuous)
    const named: string[] = [];
    for (const e of pages[0]!.events()) if (isReport(e)) negativeIds(e, null, named, e.type);
    expect(named.length).toBeGreaterThan(0);
  });

  it("(a) a damageReport naming a departed id survives the page's real path unchanged: Room.send's JSON text frame into NetClient's receive and its listeners", () => {
    const { pages } = played();
    const frame = pages[0]!.frames.find((f) => isReportFrame(f) && JSON.parse(f).taken.some((t: { from: number }) => t.from < 0))!;
    expect(frame).toBeDefined();
    let onmessage: WebSocketLike['onmessage'] = null;
    const socket: WebSocketLike = {
      binaryType: 'arraybuffer', readyState: 1, send: () => undefined, close: () => undefined,
      onopen: null, onclose: null, onerror: null,
      get onmessage() { return onmessage; }, set onmessage(f: WebSocketLike['onmessage']) { onmessage = f; },
    };
    const client = new NetClient({ url: 'mem', map: 'MP99', name: 'W', socket: () => socket, watch: true }, {} as NetWalk);
    const heard: ServerEvent[] = [];
    client.on((ev) => heard.push(ev));
    socket.onmessage!({ data: frame });                                      // what the page's socket hands NetClient
    expect(heard).toEqual([JSON.parse(frame)]);
    const got = heard[0] as DamageReport;
    expect(got.taken.some((t) => t.from < 0)).toBe(true);
    expect(JSON.stringify(got)).toBe(frame);                                 // byte for byte
    expect(PROTOCOL_VERSION).toBe(19);                                       // rides protocol 17; 18 (LATER 1147) changed no frame; 19 (LATER 1141) the fire event's `at` only
  });

  it('(c) the departed counter resets with the ledger: back to -1 at the next round\'s start', () => {
    const { room, pages } = played();
    expect(departedId(room)).toBe(-2);                                       // one leaver taken -1
    const starts = pages[0]!.events().filter((e) => e.type === 'roundStart').length;
    for (let i = 0; i < 60 * TICK_HZ && pages[0]!.events().filter((e) => e.type === 'roundStart').length === starts; i++) room.step();
    expect(pages[0]!.events().filter((e) => e.type === 'roundStart').length).toBe(starts + 1);
    expect(departedId(room)).toBe(-1);
  });
});

describe("WM-DATA task 3b: a seat replaced by its page's watching reconnect (`replace`) moves its rows to a departed id too", () => {
  /**
   * 3 (a SEAL) deals 1 and takes from 1; the same page says hello again as a watcher (id 12): not a takeover (it watches
   * where it played), so `replace` frees id 3 with no `depart`. A new page joins under the freed id 3 and deals and takes
   * from one enemy, `foe` -- 4 or 2, never 1 -- so 1's rows hold only the replaced seat's.
   */
  function replacedAndJoined(): ReturnType<typeof bare> & { joiner: Client; foe: number } {
    const b = bare();
    b.hit(3, 1, (x) => { x.health.hp[1]! -= 4; });
    b.hit(1, 3, (x) => { x.health.hp[1]! -= 5; });
    b.room.hello(12, new Client(), { type: 'hello', version: PROTOCOL_VERSION, name: 'P3', map: 'MP99', session: 'tab3'.padEnd(22, '_'), watch: true }, `10.0.0.${3}`);
    expect(b.room.player(3)).toBeUndefined();
    const joiner = new Client();
    b.room.hello(3, joiner, { type: 'hello', version: PROTOCOL_VERSION, name: 'P6', map: 'MP99', session: 'tab6'.padEnd(22, '_') }, `10.0.0.${6}`);
    expect(b.room.player(3)).toBeDefined();
    const team = b.room.player(3)!.team;
    const foe = [4, 2].find((id) => b.room.player(id)!.team !== team)!;
    b.hit(3, foe, (x) => { x.health.hp[1]! -= 3; });
    b.hit(foe, 3, (x) => { x.health.hp[1]! -= 2; });
    return { ...b, joiner, foe };
  }
  const roundOf = (room: Room, c: Client): DamageReport[] => {
    for (let i = 0; i < 60 * TICK_HZ && !c.events().some((e) => e.type === 'roundOver'); i++) room.step();
    return c.events().filter(isReport).filter((r) => !isLife(r));
  };

  it("the joiner's round report holds only his own, taken and dealt", () => {
    const { room, joiner, foe } = replacedAndJoined();
    const round = roundOf(room, joiner);
    expect(round.map((r) => r.taken)).toEqual([[{ from: foe, hits: 1, health: pt(2) }]]);
    expect(round.map((r) => r.dealt)).toEqual([[{ to: foe, hits: 1, health: pt(3) }]]);
  });

  it("the joiner's first life report holds only his own life", () => {
    const { kill, sent, foe } = replacedAndJoined();
    kill(3, foe);
    expect(sent().filter(([, ev]) => isLife(ev))).toEqual([[3, { type: 'damageReport', round: 1, life: true, taken: [{ from: foe, hits: 1, health: pt(2) }], dealt: [{ to: foe, hits: 1, health: pt(3) }] }]]);
  });

  it("an opponent keeps the replaced seat's hits under a departed (negative) id", () => {
    const { room, cs, foe } = replacedAndJoined();
    expect(foe).not.toBe(1);
    const round = roundOf(room, cs[0]!);
    expect(round).toHaveLength(1);
    const departed = round[0]!.taken[0]?.from ?? 0;
    expect(departed).toBeLessThan(0);
    expect(round[0]!.taken).toEqual([{ from: departed, hits: 1, health: pt(4) }]);
    expect(round[0]!.dealt).toEqual([{ to: departed, hits: 1, health: pt(5) }]);
  });
});
