import { describe, expect, it } from 'vitest';
import type { ServerEvent } from '../../viewer/src/sim';
import { PROTOCOL_VERSION, SNAPSHOT_HZ, TICK_HZ } from '../../viewer/src/net/protocol';
import type { Room } from '../src/room';
import { decodeRecords, REPLAY_FORMAT_VERSION, type ReplayHeader } from '../src/replay/format';
import { FileRecorder } from '../src/replay/recorder';
import { dmgTrack } from './helpers/dmgTrack';
import { damageScript, isReport, isReportFrame, seatedRoom, six, tallies, type Client, type DamageReport, type Run } from './helpers/damageReportRoom';

/**
 * WM-DATA task 3 (WM.R10; the MATCH-DATA lane's design item (c)): the damage report's room-owned ledger
 * (`DAMAGE_REPORT_ADAPTATION`, `match/src/room.ts`) and its 'round' report. PRODUCT TRACK: a browser adaptation with no
 * original -- the game gives a player no damage numbers -- and nothing the room simulates changes (pinned below: every
 * stream but the report's own recipient's is byte-identical with the report on and off). Health only, never armour; an
 * enemy's hits only (the condition of `combat()`'s `onCombatApplied` observer); sent with `send` to each player's own
 * page at `roundOver`, never broadcast, never to a watcher, never in the recorder's stream; nothing at a hit (the owner's
 * ruling, 2026-11-15, through the lane seat). The script's room plays respawn rules, where a death also sends the
 * victim his life report (WM-DATA task 3b, `roomDamageReportLife.test.ts`): the round reports here are those without
 * `life`; a classic room tells nothing at a death (below).
 */

let cached: { on: Run; off: Run } | null = null;
/** At each report's arrival: the room's phase, and whether the page had been told this round's `roundOver` already. */
const atReport: { id: number; phase: string; told: boolean }[] = [];
const runs = (): { on: Run; off: Run } => (cached ??= {
  on: damageScript(false, {
    ready: (room, cs) => cs.forEach((c, i) => {
      c.onText = (f) => {
        if (!isReportFrame(f) || 'life' in (JSON.parse(f) as object)) return;   // the round's (3b: a life report is not)
        const r = JSON.parse(f) as DamageReport, ev = c.events();
        const over = ev.slice(0, -1).reverse().find((e) => e.type === 'roundOver' || e.type === 'roundStart' || e.type === 'kill');
        atReport.push({ id: i + 1, phase: (room as unknown as { state: { phase: string } }).state.phase, told: over?.type === 'roundOver' && over.round === r.round });
      };
    }),
  }),
  off: damageScript(true),
});

const roundReports = (run: Run, id: number): DamageReport[] => run.cs[id - 1]!.events().filter(isReport).filter((r) => !('life' in r));
const norm = (r: DamageReport) => ({
  ...r,
  taken: r.taken.map((t) => ({ ...t, health: six(t.health) })),
  ...(r.dealt ? { dealt: r.dealt.map((t) => ({ ...t, health: six(t.health) })) } : {}),
});

/** The expected round report for `id` from player 1's timeline, between two indices, ordered by health, then id. */
function expected(run: Run, id: number, round: number, from: number, to: number): DamageReport {
  const t = tallies(run.timeline, from, to);
  const taken: DamageReport['taken'] = [], dealt: NonNullable<DamageReport['dealt']> = [];
  for (const [k, v] of t) {
    const [a, b] = k.split('>').map(Number) as [number, number];
    if (b === id) taken.push({ from: a, hits: v.hits, health: six(v.health) });
    if (a === id) dealt.push({ to: b, hits: v.hits, health: six(v.health) });
  }
  taken.sort((x, y) => y.health - x.health || x.from - y.from);
  dealt.sort((x, y) => y.health - x.health || x.to - y.to);
  return { type: 'damageReport', round, taken, dealt };
}

describe('WM-DATA task 3: the damage report at the round\'s end (DAMAGE_REPORT_ADAPTATION)', () => {
  it('the script played as written: two rounds (respawn: two matches of one), 2 fell twice in the first, 3 in the second, a teammate was hit', () => {
    const { on } = runs();
    const kills = on.timeline.filter((e) => e.type === 'kill') as Extract<ServerEvent, { type: 'kill' }>[];
    expect(kills.map((k) => [k.killer, k.victim])).toEqual([[1, 2], [1, 2], [1, 3]]);
    expect(on.timeline.filter((e) => e.type === 'roundOver')).toHaveLength(2);
    expect(on.timeline.some((e) => e.type === 'combat' && e.friendlyFire && e.damageApplied > 0)).toBe(true);
  }, 60_000);                                                                  // the first test plays both scripts

  it('each player gets one round report per round, his own: taken and dealt with the exact hits, enemies only (no teammate)', () => {
    const { on } = runs();
    const r2 = on.timeline.findIndex((e) => e.type === 'roundOver');   // a respawn match is one round: the next is the next match's
    expect(r2).toBeGreaterThan(0);
    for (const id of [1, 2, 3, 4]) {
      const got = roundReports(on, id).map(norm);
      expect(got.map((r) => r.round)).toEqual([1, 1]);
      expect(got[0]).toEqual(expected(on, id, 1, 0, r2));
      expect(got[1]).toEqual(expected(on, id, 1, r2, on.timeline.length));   // the new round starts from nothing
    }
    // the numbers the script made: 1 dealt 2 two lives' hits and 3 one; 3 dealt 1 one; 4, hit by his teammate, took nothing
    const one = roundReports(on, 1)[0]!, four = roundReports(on, 4)[0]!;
    expect(one.dealt!.map((d) => d.to).sort()).toEqual([2, 3]);
    expect(one.dealt!.find((d) => d.to === 3)!.hits).toBe(1);
    expect(one.taken).toEqual([expect.objectContaining({ from: 3, hits: 1 })]);
    expect(four.taken).toEqual([]);
    expect(four.dealt).toEqual([]);
    expect(roundReports(on, 1)[1]!.dealt).toEqual([expect.objectContaining({ to: 3 })]);
    expect(roundReports(on, 2)[1]!.taken).toEqual([]);                      // round 1's damage gone at round 2
  });

  it('the round report follows the roundOver at once in each player\'s stream', () => {
    const { on } = runs();
    for (const c of on.cs) {
      const ev = c.events().map((e) => e.type as string);
      const overs = ev.flatMap((t, i) => (t === 'roundOver' ? [i] : []));
      expect(overs).toHaveLength(2);
      for (const i of overs) expect(ev[i + 1]).toBe('damageReport');
    }
  });

  it('built only once the round is over: the room in its "over" phase, the page told the round\'s roundOver first', () => {
    runs();
    expect(atReport.map((a) => a.id).sort()).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
    for (const a of atReport) expect([a.phase, a.told]).toEqual(['over', true]);
  });

  it('a round report only after a roundOver: every report without `life` follows one at once (respawn: a death sends its life report)', () => {
    const { on } = runs();
    expect(on.timeline.filter((e) => e.type === 'kill')).toHaveLength(3);
    for (const c of [...on.cs, on.watcher]) {
      const ev = c.events();
      ev.forEach((e, i) => { if (isReport(e) && !('life' in e)) expect(ev[i - 1]!.type).toBe('roundOver'); });
      expect(ev.filter(isReport).filter((r) => !('life' in r))).toHaveLength(c === on.watcher ? 0 : ev.filter((e) => e.type === 'roundOver').length);
    }
  });

  it('exact keys: a round report carries type, round, taken and dealt, and each entry only its id, hits and health', () => {
    const { on } = runs();
    expect([1, 2, 3, 4].flatMap((id) => roundReports(on, id))).toHaveLength(8);
    for (const id of [1, 2, 3, 4]) {
      for (const r of roundReports(on, id)) {
        expect(Object.keys(r).sort()).toEqual(['dealt', 'round', 'taken', 'type']);
        for (const t of r.taken) expect(Object.keys(t).sort()).toEqual(['from', 'health', 'hits']);
        for (const d of r.dealt!) expect(Object.keys(d).sort()).toEqual(['health', 'hits', 'to']);
        for (const e of [...r.taken, ...r.dealt!]) for (const v of Object.values(e)) expect(typeof v).toBe('number');
      }
    }
  });

  it('never broadcast: the watcher and the recorder get no report, and the recorder\'s stream is the same with it off', () => {
    const { on, off } = runs();
    expect(on.watcher.events().some(isReport)).toBe(false);
    expect(on.recorded.some(isReport)).toBe(false);
    expect(JSON.stringify(on.recorded)).toBe(JSON.stringify(off.recorded));
  });

  it('changes nothing else: every stream, less its own reports, is byte-identical with the report off; the room\'s state the same', () => {
    const { on, off } = runs();
    expect(off.cs.some((c) => c.frames.some(isReportFrame))).toBe(false);   // the silent run sent none
    expect(on.watcher.frames).toEqual(off.watcher.frames);
    on.cs.forEach((c, i) => expect(c.frames.filter((f) => !isReportFrame(f))).toEqual(off.cs[i]!.frames));
    expect(on.room.tick).toBe(off.room.tick);
    for (const id of [1, 2, 3, 4]) {
      const a = on.room.player(id)!, b = off.room.player(id)!;
      expect([a.alive, a.score, a.kills, a.deaths, [...a.health.hp], [...a.health.armour]]).toEqual([b.alive, b.score, b.kills, b.deaths, [...b.health.hp], [...b.health.armour]]);
    }
  });
});

describe('WM-DATA task 3: the ledger\'s condition is the observer\'s (health only, an enemy\'s only)', () => {
  type Combat = (attacker: unknown, target: unknown, data: Record<string, unknown>) => void;
  type Body = { health: { hp: number[]; armour: number[] } };
  function bare(): { room: Room; hit: (a: number, t: number, change: (b: Body) => void) => void; combat: Combat; reports: () => [number, ServerEvent][] } {
    const { room } = seatedRoom(false);
    room.step();
    const combat: Combat = (a, t, d) => (room as unknown as { combat: Combat }).combat.call(room, a, t, d);
    const hit = (a: number, t: number, change: (b: Body) => void): void => {
      const target = room.player(t)! as unknown as Body;
      const healthBefore = [...target.health.hp], armourBefore = [...target.health.armour];
      change(target);
      combat(room.player(a), room.player(t), { status: 'applied', request: 'fire', healthBefore, armourBefore });
    };
    const reports = (): [number, ServerEvent][] => {
      const sent: [number, ServerEvent][] = [];
      (room as unknown as { send(id: number, ev: ServerEvent): void }).send = (id, ev) => { sent.push([id, ev]); };
      (room as unknown as { reportRoundDamage(): void }).reportRoundDamage();
      return sent;
    };
    return { room, hit, combat, reports };
  }

  it('armour-only damage adds nothing; health adds its sum and one hit; a teammate\'s, a self hit and a refusal add nothing', () => {
    const { room, hit, combat, reports } = bare();
    hit(1, 2, (b) => { b.health.armour[1]! -= 10; });                          // armour only
    hit(1, 4, (b) => { b.health.hp[1]! -= 10; });                              // a teammate (friendly fire on)
    hit(2, 2, (b) => { b.health.hp[1]! -= 5; });                               // his own
    combat(room.player(1), room.player(2), { status: 'rejected', request: 'fire', reason: 'friendly fire' });
    combat(room.player(1), room.player(2), { status: 'miss', request: 'fire', reason: 'beyond range' });
    hit(1, 2, (b) => { b.health.hp[1]! -= 7; b.health.armour[1]! -= 3; });   // health and armour: the health counts
    hit(1, 2, (b) => { b.health.hp[0]! -= 2.5; });
    hit(3, 1, (b) => { b.health.hp[2]! -= 4; });
    const sent = reports();
    const of = (id: number): ServerEvent[] => sent.filter(([to, ev]) => to === id && isReport(ev)).map(([, ev]) => ev);
    // intake item 2 (C): each booked change in DMG points, on the body as the room holds it (2's own hit first)
    const two = dmgTrack(); two.hit(1, 5);
    const toTwo = two.hit(1, 7) + two.hit(0, 2.5), toOne = dmgTrack().hit(2, 4);
    expect(sent.map(([to]) => to).sort()).toEqual([1, 2, 3, 4]);              // one each, never the watcher
    expect(of(1)).toEqual([{ type: 'damageReport', round: 1, taken: [{ from: 3, hits: 1, health: toOne }], dealt: [{ to: 2, hits: 2, health: toTwo }] }]);
    expect(of(2)).toEqual([{ type: 'damageReport', round: 1, taken: [{ from: 1, hits: 2, health: toTwo }], dealt: [] }]);
    expect(of(3)).toEqual([{ type: 'damageReport', round: 1, taken: [], dealt: [{ to: 1, hits: 1, health: toOne }] }]);
    expect(of(4)).toEqual([{ type: 'damageReport', round: 1, taken: [], dealt: [] }]);
  });

  it('orders the entries by health, most first, then by id', () => {
    const { hit, reports } = bare();
    hit(3, 1, (b) => { b.health.hp[1]! -= 3; });
    hit(2, 1, (b) => { b.health.hp[1]! -= 3; });
    hit(3, 4, (b) => { b.health.hp[1]! -= 6; });
    hit(2, 4, (b) => { b.health.hp[2]! -= 1; });
    const sent = reports();
    const of = (id: number): DamageReport => sent.find(([to, ev]) => to === id && isReport(ev))![1] as DamageReport;
    expect(of(1).taken.map((t) => t.from)).toEqual([2, 3]);                    // level health: the lower id first
    expect(of(4).taken.map((t) => t.from)).toEqual([3, 2]);                    // 6 before 1
    expect(of(3).dealt!.map((t) => t.to)).toEqual([4, 1]);
  });
});

describe('WM-DATA task 3: a replay recorded from a room that sent damage reports holds none', () => {
  /**
   * The room's own `FileRecorder` as its recorder (the real `.s2r` writer), the script played, the file closed and decoded
   * by `decodeRecords`: its event records, by type. `broadcast` replaces the room's report send with a broadcast of the
   * same event -- the control that shows the check would see a report that reached the recording.
   */
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
        if (!broadcast) return;
        const r = room as unknown as { broadcast(ev: ServerEvent): void; round: number; reportRoundDamage(): void };
        r.reportRoundDamage = (): void => { r.broadcast({ type: 'damageReport', round: r.round, taken: [], dealt: [] }); };
      },
    }, { recorder });
    recorder.close('test');
    expect(failure).toBeNull();
    const out = decodeRecords(Buffer.concat(chunks.map((c) => Buffer.from(c))));
    const types = out.records.flatMap((r) => (r.kind === 'event' ? [r.event.type as string] : []));
    return { types, truncated: out.truncated };
  }

  it('the decoded file holds the round\'s kills and roundOvers and no damageReport', () => {
    const { types, truncated } = recorded(false);
    expect(truncated).toBe(false);
    expect(types.filter((t) => t === 'kill')).toHaveLength(3);
    expect(types.filter((t) => t === 'roundOver')).toHaveLength(2);
    expect(types.filter((t) => t === 'damageReport')).toEqual([]);
  });

  it('the control: a report broadcast instead of sent is in the decoded file, so the check above can fail', () => {
    const { types } = recorded(true);
    expect(types.filter((t) => t === 'damageReport')).toHaveLength(2);
  });
});

describe('WM-DATA task 3: a classic round\'s ghost gets no report', () => {
  it('a seat not seated at the round\'s start (ghostOf) is left out; a dead player of the round still gets his', () => {
    const { room } = seatedRoom(false, { rules: 'classic' });
    const phase = (): string => (room as unknown as { state: { phase: string } }).state.phase;
    for (let i = 0; i < 120 * 60 && phase() !== 'play'; i++) room.step();
    expect(phase()).toBe('play');
    type P = { playsRound: number; alive: boolean; health: { hp: number[]; armour: number[] } };
    const p = (id: number): P => room.player(id)! as unknown as P;
    p(4).playsRound = -1;                                                        // a ghost of this round (a late seat)
    p(2).alive = false;                                                          // dead, but he played the round
    const target = p(1), healthBefore = [...target.health.hp], armourBefore = [...target.health.armour];
    target.health.hp[1]! -= 4;
    (room as unknown as { combat(a: unknown, t: unknown, d: Record<string, unknown>): void }).combat(room.player(3), room.player(1), { status: 'applied', request: 'fire', healthBefore, armourBefore });
    const sent: [number, ServerEvent][] = [];
    (room as unknown as { send(id: number, ev: ServerEvent): void }).send = (id, ev) => { sent.push([id, ev]); };
    (room as unknown as { reportRoundDamage(): void }).reportRoundDamage();
    expect(sent.map(([id]) => id).sort()).toEqual([1, 2, 3]);
    expect(sent.find(([id]) => id === 1)![1]).toEqual({ type: 'damageReport', round: 1, taken: [{ from: 3, hits: 1, health: dmgTrack().hit(1, 4) }], dealt: [] });
  });
});

describe('WM-DATA task 3b: a CLASSIC room tells nothing at a kill (the life report is for respawn rooms only)', () => {
  type Kill = (victim: unknown, killer: unknown, weapon: string | null, how: string, cause: number) => void;
  /** A classic room in play; 1 hits 2 (health), then the room's own `kill` takes 2 and 3 (the SEAL side), and the round runs out. */
  function classic(spy: boolean): { cs: Client[]; watcher: Client; calls: number; kills: number[] } {
    const { room, cs, watcher } = seatedRoom(false, { rules: 'classic' });
    let calls = 0;
    if (spy) (room as unknown as Record<string, unknown>).reportLifeDamage = (): void => { calls++; };
    const phase = (): string => (room as unknown as { state: { phase: string } }).state.phase;
    for (let i = 0; i < 120 * 60 && phase() !== 'play'; i++) room.step();
    expect(phase()).toBe('play');
    const target = room.player(2)! as unknown as { health: { hp: number[]; armour: number[] } };
    const healthBefore = [...target.health.hp], armourBefore = [...target.health.armour];
    target.health.hp[1]! -= 4;
    (room as unknown as { combat(a: unknown, t: unknown, d: Record<string, unknown>): void }).combat(room.player(1), room.player(2), { status: 'applied', request: 'fire', healthBefore, armourBefore });
    const kill = (room as unknown as { kill: Kill }).kill;
    kill.call(room, room.player(2), room.player(1), null, 'weapon', 0);
    kill.call(room, room.player(3), room.player(1), null, 'weapon', 0);
    for (let i = 0; i < 60 * 60 && !cs[0]!.events().some((e) => e.type === 'roundOver'); i++) room.step();
    return { cs, watcher, calls, kills: cs[0]!.events().flatMap((e) => (e.type === 'kill' ? [e.victim] : [])) };
  }

  it('no report at either death: after each kill the victim hears the score and no report; every report follows a roundOver or the win', () => {
    const { cs, watcher, kills } = classic(false);
    expect(kills).toEqual([2, 3]);
    for (const id of [2, 3]) {
      const ev = cs[id - 1]!.events();
      const i = ev.findIndex((e) => e.type === 'kill' && e.victim === id);
      expect(ev[i + 1]!.type).toBe('score');
      expect(ev[i + 2]?.type).not.toBe('damageReport');
    }
    for (const c of [...cs, watcher]) {
      const ev = c.events();
      expect(ev.some((e) => isReport(e) && 'life' in e)).toBe(false);
      // WM-DATA-WIN (WM.R24): the second death is the SEALs' elimination -- its decision sends the round's report too,
      // right after `eliminated` (`roomDamageReportAtWin.test.ts`); no report at a death itself.
      ev.forEach((e, i) => { if (isReport(e)) expect(['roundOver', 'eliminated']).toContain(ev[i - 1]!.type); });
    }
  });

  it('kill never asks for a life report in a classic room', () => {
    expect(classic(true).calls).toBe(0);
  });
});
