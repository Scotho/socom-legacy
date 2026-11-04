// test/replayClient.test.ts -- PT-18: ReplayClient, NetPage's watcher path on a recording (W35.R4; research 244 §1)
import { describe, expect, it } from 'vitest';
import { decodeRecords } from '../../match/src/replay/format';
import type { ServerEvent } from '../src/net/protocol';
import type { ReplayPlayer, ReplayRecord } from '../../match/src/replay/format';
import { ReplayClient, REPLAY_WATCHER_ID, type LoadedSegment } from '../src/replay/replayClient';
import { ReplayLoadError } from '../src/replay/load';
import { ALPHA, BRAVO, cutBytes, fixtureBytes, fixtureRecords, msOf } from './replayFixture';
import { botDisplayName, plainBotText } from '../src/botPresentation';
import { layoutText } from '../src/hudFont';

function segment(bytes: Uint8Array = fixtureBytes()): LoadedSegment {
  const { records, truncated } = decodeRecords(bytes);
  const h = records[0];
  if (h?.kind !== 'header') throw new Error('no header');
  return { header: h.header, records, truncated };
}

async function open(seg: LoadedSegment | Promise<LoadedSegment> = segment()) {
  let now = 10_000;
  const c = new ReplayClient(Promise.resolve(seg), { name: 'Watcher', map: 'MP2', now: () => now });
  const events: ServerEvent[] = [];
  c.on((ev) => events.push(ev));
  await c.ready;
  return {
    c, events,
    /** The wall clock moved on by `ms`, and the client pumped there. */
    wait: (ms: number) => { now += ms; c.advance(); },
    now: () => now,
    votes: () => events.filter((e): e is Extract<ServerEvent, { type: 'votes' }> => e.type === 'votes').map((e) => e.count),
    clear: () => { events.length = 0; },
  };
}

describe('ReplayClient joins as a watcher', () => {
  it('holds recorded equipment metadata before listeners, restores it on seek, and defaults legacy/malformed metadata to zero', async () => {
    const recordedWelcome: Extract<ServerEvent, { type: 'welcome' }> = {
      type: 'welcome', id: 3, version: 11, map: 'MP2', tick: 0, role: 'spectator', team: null, queue: 0, name: 'Recorded',
      players: [], rules: 'classic', round: 1, rounds: 11, ghost: false, epoch: 0, env: { epoch: 0, revision: 0, states: [] }, eqLimit: 1,
    };
    const metadata: ReplayRecord[] = [
      { kind: 'event', tick: 0, event: recordedWelcome },
      { kind: 'event', tick: 10, event: { type: 'roundTime', seconds: 350 } },
      { kind: 'event', tick: 25, event: { type: 'gameLobby', seats: [], countdown: null, launched: false, eqLimit: 2 } },
      { kind: 'event', tick: 75, event: { type: 'gameLobby', seats: [], countdown: null, launched: false } },
      { kind: 'event', tick: 125, event: { type: 'gameLobby', seats: [], countdown: null, launched: false, eqLimit: 9 } },
      { kind: 'event', tick: 175, event: { ...recordedWelcome, tick: 175, eqLimit: 3 } },
    ];
    const records = fixtureRecords();
    for (const r of metadata) {
      if (r.kind === 'header') continue;
      const at = records.findIndex((x) => x.kind !== 'header' && x.tick > r.tick);
      records.splice(at, 0, r);
    }
    const r = await open(segment(fixtureBytes(records)));
    expect(r.c.eqLimit).toBe(1);
    expect(r.events[0]).toMatchObject({ type: 'welcome', eqLimit: 1 });
    const heard: number[] = [];
    r.c.on((ev) => { if (ev.type === 'welcome' || ev.type === 'gameLobby') heard.push(r.c.eqLimit); });
    r.wait(msOf(30));
    expect(heard).toEqual([1, 2]);
    expect(r.c.eqLimit).toBe(2);
    for (const [tick, expected] of [[60, 2], [100, 0], [150, 0], [200, 3], [0, 1]] as const) {
      r.c.seek(tick);
      expect(r.c.eqLimit, `seek ${tick}`).toBe(expected);
      expect(heard.at(-1)).toBe(expected);
    }
    expect((await open()).c.eqLimit).toBe(0);
  });
  it('the gold initial follows trusted replay identity through seeks and human seat reuse', async () => {
    const records = fixtureRecords().map((r): ReplayRecord => r.kind === 'players'
      ? { ...r, players: [{ ...ALPHA, name: 'Freq', ...(r.tick === 0 ? { bot: true as const } : {}) }] } : r);
    const { c, events } = await open(segment(fixtureBytes(records)));
    const check = (bot: boolean): void => {
      const row = events.flatMap((e) => e.type === 'welcome' ? e.players.filter((p) => p.id === ALPHA.id)
        : e.type === 'joined' && e.id === ALPHA.id ? [e] : []).at(-1)!;
      expect(row.name).toBe('Freq');
      const display = botDisplayName(row.name, row.bot === true);
      expect(plainBotText(display)).toBe('Freq');
      expect(layoutText(display, 0, 0, 1).glyphs.filter((g) => g.rgb).length).toBe(bot ? 1 : 0);   // the bot initial alone
    };
    check(true); c.seek(300); check(false); c.seek(0); check(true);
  });
  it('an old score cannot restore gold ink after a human reuses that replay seat', async () => {
    const records = fixtureRecords().map((r): ReplayRecord => r.kind === 'players'
      ? { ...r, players: r.tick === 0 ? [{ ...ALPHA, bot: true }, BRAVO] : [{ ...ALPHA, name: 'Human' }] } : r);
    records.splice(2, 0, { kind: 'event', tick: 0, event: { type: 'score', timeLeft: 60, spectators: [], wins: { seal: 0, terrorist: 0 }, rows: [
      { ...ALPHA, bot: true, kills: 1, deaths: 0, score: 3, alive: true, ping: 0, team: 'seal' },
    ] } });
    const { c, events } = await open(segment(fixtureBytes(records)));
    c.seek(300);
    expect(events.filter((e) => e.type === 'welcome').at(-1)?.players[0]).toMatchObject({ name: 'Human' });
    expect(events.filter((e) => e.type === 'score').at(-1)?.rows[0]?.bot).toBeUndefined();
  });

  it('restores optional regional bot appearances on open and seek, including a later lobby reset', async () => {
    const records = fixtureRecords().map((r): ReplayRecord => {
      if (r.kind === 'players' && r.tick === 0) return { ...r, players: [{ ...ALPHA, character: 'seal:scuba_B83', bot: true }, BRAVO] };
      if (r.kind === 'event' && r.tick === 100) return { ...r, event: { type: 'botCharacter', id: ALPHA.id, character: 'seal:scuba_A83' } };
      return r;
    });
    const { c, events } = await open(segment(fixtureBytes(records)));
    const profile = () => events.filter((e) => e.type === 'welcome').at(-1)?.players.find((p) => p.id === ALPHA.id)?.character;
    const marker = () => events.filter((e) => e.type === 'welcome').at(-1)?.players.find((p) => p.id === ALPHA.id)?.bot;
    expect(profile()).toBe('seal:scuba_B83');
    expect(marker()).toBe(true);
    c.seek(150);
    expect(profile()).toBe('seal:scuba_A83');
    expect(marker()).toBe(true);
    c.seek(400);
    expect(profile()).toBeUndefined();
    expect(marker()).toBeUndefined();
  });

  it('VRJ-1: the replay spectator has no own load-death arrival before opening, through a seek, or after close', async () => {
    const c = new ReplayClient(Promise.resolve(segment()), { name: 'Watcher', map: 'MP2' });
    expect(c.deadAtLoadAt()).toBeNull();
    await c.ready;
    expect(c.role).toBe('spectator');
    c.seek(200);
    expect(c.deadAtLoadAt()).toBeNull();
    c.close();
    expect(c.deadAtLoadAt()).toBeNull();
  });

  it('sprint 20 (SVC-20b-page): the voice surface is inert -- onVoice hands back an unsubscribe, sendVoice sends nothing (no voice is recorded)', async () => {
    const { c } = await open();
    const off = c.onVoice(() => { throw new Error('a replay plays no voice'); });
    expect(typeof off).toBe('function'); off();
    expect(() => c.sendVoice(new Uint8Array([1, 0, 0, 1, 0]))).not.toThrow();
  });
  it('AD-14: a replay holds no voice channel count (voiceMembers is sent to one page, never recorded): null', async () => {
    const { c } = await open();
    expect(c.voiceMembers).toBeNull();
  });
  it('opens on the recording: a spectator\'s welcome with the starting roster, no body of its own, send a no-op', async () => {
    const { c, events } = await open();
    expect([c.state, c.role, c.team, c.id]).toEqual(['open', 'spectator', null, REPLAY_WATCHER_ID]);
    const w = events[0] as Extract<ServerEvent, { type: 'welcome' }>;
    expect([w.type, w.role, w.id, w.map, w.rules]).toEqual(['welcome', 'spectator', REPLAY_WATCHER_ID, 'MP2', 'classic']);
    expect(w.players.map((p) => [p.id, p.name, p.team])).toEqual([[1, 'Alpha', 'seal'], [2, 'Bravo', 'terrorist']]);
    expect(c.bodies().map((b) => b.id)).toEqual([1, 2]);
    expect(c.bodies().some((b) => b.id === REPLAY_WATCHER_ID)).toBe(false);
    expect(() => c.send({ type: 'ping', t: 1 })).not.toThrow();
    expect([c.lastSeq(), c.loadReported()]).toEqual([0, false]);
  });
  it('plays the events on the clock, in order, each once', async () => {
    const r = await open();
    r.wait(msOf(150));
    expect(r.votes()).toEqual([100]);
    r.wait(msOf(400));
    expect(r.votes()).toEqual([100, 200, 400]);
    r.wait(msOf(400));
    expect(r.votes()).toEqual([100, 200, 400]);
    expect(r.c.ended()).toBe(true);
  });
});

/**
 * The brief's segment with its roster changes moved to odd ticks (the review's F1): the room writes `players` at any tick,
 * the snapshots fall on even ones -- Bravo leaves at 301 (not 300), Charlie joins at 351.
 */
const CHARLIE: ReplayPlayer = { id: 3, name: 'Charlie', team: 'seal', role: 'player', char: 0 };
function oddRoster(): LoadedSegment {
  const changes: [number, ReplayPlayer[]][] = [[301, [ALPHA]], [351, [ALPHA, CHARLIE]]];
  const out: ReplayRecord[] = fixtureRecords().filter((r) => !(r.kind === 'players' && r.tick === 300));
  for (const [tick, players] of changes) {
    const at = out.findIndex((r) => r.kind !== 'header' && r.tick > tick);
    out.splice(at, 0, { kind: 'players', tick, players });
  }
  return segment(fixtureBytes(out));
}

describe('seek (spec 4.1 "Seek"; review focus 1 and 2)', () => {
  it('seek to 350 after playing to 500: one player, no event of 100-350; playing on from 350 emits 400 only', async () => {
    const r = await open();
    r.wait(msOf(600));                                     // to the end, 500
    expect(r.votes()).toEqual([100, 200, 400]);
    expect(r.c.roster().map((p) => p.id)).toEqual([1]);
    r.clear();
    r.c.seek(350);
    expect(r.c.serverTick()).toBe(350);
    expect(r.c.roster()).toEqual([ALPHA]);
    expect(r.events).toEqual([]);                          // nothing replayed, the roster already the target's
    expect(r.c.bodies().map((b) => b.id)).toEqual([1]);
    r.wait(msOf(200));
    expect(r.votes()).toEqual([400]);
    expect(r.events.map((e) => e.type)).toEqual(['votes']);
  });
  it('a seek back across the roster change restores the roster in force there (the last players at or before the seek\'s snapshot)', async () => {
    const r = await open();
    r.wait(msOf(600));
    r.clear();
    r.c.seek(251);                                         // the snapshot 250: before Bravo left at 300
    expect(r.c.roster()).toEqual([ALPHA, BRAVO]);
    expect(r.events).toEqual([{ type: 'joined', id: 2, name: 'Bravo', team: 'terrorist' }]);
    expect(r.c.bodies().map((b) => b.id)).toEqual([1, 2]);
    r.clear();
    r.wait(msOf(300));                                     // past 300 and 400
    expect(r.events).toEqual([{ type: 'left', id: 2 }, { type: 'votes', count: 400 }]);
    expect(r.c.roster()).toEqual([ALPHA]);
  });
  it('the roster is state: a seek restores the last players at or before the TARGET, not the snapshot (F1: a leave at 301)', async () => {
    const r = await open(oddRoster());
    r.c.seek(301);                                         // the snapshot 300 still has Bravo; the roster at 301 does not
    expect(r.c.roster()).toEqual([ALPHA]);
    expect(r.events.slice(1)).toEqual([{ type: 'left', id: 2 }]);   // after the welcome
    r.clear();
    r.wait(msOf(100));                                     // to 401: Charlie joins at 351, Bravo stays gone
    expect(r.c.roster()).toEqual([ALPHA, CHARLIE]);
    r.wait(msOf(300));                                     // to the end
    expect(r.c.roster()).toEqual([ALPHA, CHARLIE]);
    expect(r.events).toEqual([{ type: 'joined', id: 3, name: 'Charlie', team: 'seal' }, { type: 'votes', count: 400 }]);
  });
  it('a join between the snapshot and the target is in the roster the seek restores; a seek before it takes it away', async () => {
    const r = await open(oddRoster());
    r.wait(msOf(100));
    r.clear();
    r.c.seek(351);                                         // the snapshot 350; Charlie joined at 351
    expect(r.c.roster()).toEqual([ALPHA, CHARLIE]);
    expect(r.events).toEqual([{ type: 'left', id: 2 }, { type: 'joined', id: 3, name: 'Charlie', team: 'seal' }]);
    r.clear();
    r.c.seek(350);
    expect(r.c.roster()).toEqual([ALPHA]);
    expect(r.events).toEqual([{ type: 'left', id: 3 }]);
    r.clear();
    r.wait(msOf(200));                                     // on from 350: the join at 351 comes, then the event at 400
    expect(r.events).toEqual([{ type: 'joined', id: 3, name: 'Charlie', team: 'seal' }, { type: 'votes', count: 400 }]);
  });
  it('the events between the snapshot and the target are skipped, never replayed', async () => {
    const r = await open();
    r.c.seek(101);                                         // the snapshot 100: the event at 100 lies at or before the target
    expect(r.c.serverTick()).toBe(101);
    r.wait(msOf(400));
    expect(r.votes()).toEqual([200, 400]);
    const s = await open();
    s.c.seek(99);
    s.wait(msOf(2));                                       // 99 -> 101: the event at 100 comes
    expect(s.votes()).toEqual([100]);
  });
  it('step: forward one snapshot plays what lies between; back one is a seek', async () => {
    const r = await open();
    r.c.pause();
    r.c.seek(198);
    expect(r.c.step(1)).toBe(200);
    expect(r.votes()).toEqual([200]);
    expect(r.c.step(-1)).toBe(198);
    r.clear();
    expect(r.c.step(1)).toBe(200);
    expect(r.votes()).toEqual([200]);                      // a step back and forward again hears it again: it is play
  });
});

describe('the clock is the replay\'s, not the wall\'s (review focus 4)', () => {
  it('paused means still: two frames while paused give identical bodies', async () => {
    const r = await open();
    r.wait(msOf(151));                                     // between the snapshots 150 and 152
    r.c.pause();
    const a = r.c.bodies(r.now());
    const b = r.c.bodies(r.now() + 5000);
    expect(b).toEqual(a);
    expect(a[0]!.feet[0]).toBeCloseTo(151, 3);              // drawn between the two snapshots, on the replay's tick
  });
  it('at 4x the snapshot order holds and the bodies follow the replay\'s tick; at 0.25x a second is 15 ticks', async () => {
    const r = await open();
    r.c.speed(4);
    let last = -Infinity;
    for (let f = 0; f < 120; f++) {
      r.wait(16);
      const x = r.c.bodies(r.now()).find((b) => b.id === 1)!.feet[0];
      expect(x, `frame ${f}`).toBeGreaterThanOrEqual(last);
      expect(x).toBeCloseTo(r.c.viewTick(r.now()), 3);
      last = x;
    }
    expect(r.votes()).toEqual([100, 200, 400]);              // 120 frames at 4x: past 400, in order
    const s = await open();
    s.c.speed(0.25);
    s.wait(1000);
    expect(s.c.viewTick(s.now())).toBeCloseTo(15, 6);
    expect(s.c.bodies(s.now())[0]!.feet[0]).toBeCloseTo(15, 3);
  });
});

describe('a live segment\'s prefix and a refused file (review focus 3)', () => {
  it('a cut tail plays to its last whole record and says partial, without an error', async () => {
    const records = fixtureRecords();
    const at = records.findIndex((x) => x.kind === 'event' && x.tick === 400);   // cut inside the event at 400
    const r = await open(segment(cutBytes(records, at)));
    expect([r.c.state, r.c.truncated, r.c.partial()]).toEqual(['open', true, true]);
    r.wait(msOf(1000));
    expect(r.c.serverTick()).toBe(398);                    // the last whole record's tick
    expect(r.votes()).toEqual([100, 200]);
    expect(r.c.bodies()[0]!.feet[0]).toBe(398);
  });
  it('a whole segment without its end record (a socket that closed) is partial too, not truncated', async () => {
    const records = fixtureRecords().filter((x) => x.kind !== 'end');
    const r = await open(segment(fixtureBytes(records)));
    expect([r.c.truncated, r.c.partial()]).toEqual([false, true]);
  });
  it('a file the load refused: the room is refused with the message (NetPage shows it), never a blank one', async () => {
    const c = new ReplayClient(Promise.reject(new ReplayLoadError('This recording was made with network protocol 999; this build plays protocols 10 and 11.')), { name: 'W', map: 'MP2' });
    const events: ServerEvent[] = [];
    c.on((ev) => events.push(ev));
    await c.ready;
    expect(c.state).toBe('refused');
    expect(events).toEqual([{ type: 'refused', reason: 'This recording was made with network protocol 999; this build plays protocols 10 and 11.' }]);
    expect(c.bodies()).toEqual([]);
  });
  it('a recording the page cannot show (its own check) is refused the same way', async () => {
    const c = new ReplayClient(Promise.resolve(segment()), { name: 'W', map: 'MP5', check: (seg) => (seg.header.map === 'MP5' ? null : `This recording is of ${seg.header.map}.`) });
    const events: ServerEvent[] = [];
    c.on((ev) => events.push(ev));
    await c.ready;
    expect([c.state, events]).toEqual(['refused', [{ type: 'refused', reason: 'This recording is of MP2.' }]]);
  });
  it('close stops it: closed, nothing more played', async () => {
    const r = await open();
    r.c.close();
    r.wait(msOf(600));
    expect([r.c.state, r.c.closeCode, r.votes()]).toEqual(['closed', 1000, []]);
  });
});

/**
 * RV-2 (web sprint 39; research 276 §1; W39.R2, additive): `onSeek` hands its listener `{ from, to, folded }` -- the tick
 * before the seek, the tick the clock landed on, and whether the target was reached by the snapshot and the fold (every
 * seek today). It is told before anything of the target (RE-4's order, research 249 §5); play and a step on tell nothing.
 */
describe('onSeek\'s argument (RV-2)', () => {
  it('every seek path tells from, to (the clock\'s landing, clamped) and folded; play and a step on tell nothing', async () => {
    const r = await open();
    r.wait(msOf(150));
    r.c.pause();
    const told: unknown[] = [];
    r.c.onSeek((seek) => { told.push(seek); });
    r.c.seek(350);
    r.c.seekStart();                                       // no roundStart in the fixture: Home is the segment's first tick
    r.c.seekEnd();
    r.c.step(-1);                                          // a step back is a seek: 500 -> the snapshot 498
    r.c.seek(9999);                                        // clamped to the recording's last tick
    expect(told).toEqual([
      { from: 150, to: 350, folded: true },
      { from: 350, to: 0, folded: true },
      { from: 0, to: 500, folded: true },
      { from: 500, to: 498, folded: true },
      { from: 498, to: 500, folded: true },
    ]);
    told.length = 0;
    r.c.seek(100);
    told.length = 0;
    r.c.step(1);                                           // a step on is play
    r.c.play();
    r.wait(msOf(50));
    expect(told).toEqual([]);
  });

  it('a zero-argument listener (matchActions\' followSeek) still works, and its removal holds', async () => {
    const r = await open();
    let n = 0;
    const off = r.c.onSeek(() => { n++; });
    r.c.seek(200);
    expect(n).toBe(1);
    off();
    r.c.seek(100);
    expect(n).toBe(1);
  });

  it('told before the target\'s roster and welcome (RE-4\'s order), with the target already known', async () => {
    // A stateful event at 50 (`roundTime`), so the seek tells a welcome (PTT-6's gate, research 244 §7).
    const records = fixtureRecords();
    records.splice(records.findIndex((x) => x.kind !== 'header' && x.tick === 50), 0, { kind: 'event', tick: 50, event: { type: 'roundTime', seconds: 600 } });
    const r = await open(segment(fixtureBytes(records)));
    r.wait(msOf(600));                                     // to the end: Bravo gone at 300
    const log: string[] = [];
    r.c.on((ev) => log.push(ev.type));
    r.c.onSeek(({ from, to, folded }) => { log.push(`seek ${from}->${to} ${folded}`); });
    r.c.seek(251);
    expect(log[0]).toBe('seek 500->251 true');
    expect(log.slice(1)).toEqual(['joined', 'welcome', 'score', 'seatTold']);   // SVC-07c tells the seats' pairs after the score
  });
});

describe("SVC-07c: the seats' told pairs on a seek (the fold's state; the re-review's B)", () => {
  it('a seek past a seatTold tells it; a seek back before any tells an empty one, so a board holds no later pairs', async () => {
    const recs = fixtureRecords();
    const told = { type: 'seatTold', seats: [{ id: 1, rating: 1003, medal: 5 }, { id: 2, rating: 997, medal: 5 }] } as ServerEvent;
    recs.splice(recs.findIndex((x) => x.kind === 'snap' && x.tick === 200), 0, { kind: 'event', tick: 200, event: told });
    const r = await open(segment(fixtureBytes(recs)));
    const toldOf = (): ServerEvent[] => r.events.filter((e) => e.type === 'seatTold');
    r.clear();
    r.c.seek(250);
    expect(toldOf()).toEqual([told]);
    // The replay's own board, as a live client's (`NetClient.told`): a replay's page reads the pairs where a live one does.
    expect([...r.c.told.all()]).toEqual([[1, { rating: 1003, medal: 5 }], [2, { rating: 997, medal: 5 }]]);
    r.clear();
    r.c.seek(150);
    expect(toldOf()).toEqual([{ type: 'seatTold', seats: [] }]);
    expect(r.c.told.all().size).toBe(0);
    r.wait(msOf(100));                                     // played on past 200: the playback's event fills it again
    expect(r.c.told.get(1)).toEqual({ rating: 1003, medal: 5 });
    r.c.close();
    expect(r.c.told.get(2)).toEqual({ rating: 997, medal: 5 });   // closed with the client; the last values stay readable
  });
});

/**
 * RV2-02 (RV2.R2, the replay viewer redesign; W39.R2, additive): the engine's hold -- a browser adaptation
 * (REPLAY_ADAPTATION), no game value. `autoplay: false` opens the recording paused and held: no tick advances until
 * `release()`, while a seek still lands (`tick=`, the report's embed). Absent, the client plays at open as before.
 */
describe('RV2-02: the hold (autoplay false; held, release)', () => {
  async function heldOpen() {
    let now = 10_000;
    const c = new ReplayClient(Promise.resolve(segment()), { name: 'Watcher', map: 'MP2', now: () => now, autoplay: false });
    const events: ServerEvent[] = [];
    c.on((ev) => events.push(ev));
    await c.ready;
    return { c, events, wait: (ms: number) => { now += ms; c.advance(); }, votes: () => events.filter((e) => e.type === 'votes').length };
  }

  it('opens paused and held: two seconds of wall time and advance() leave the tick at the start, no event played', async () => {
    const r = await heldOpen();
    expect(r.c.state).toBe('open');
    expect(r.events[0]?.type).toBe('welcome');               // the open's welcome is told, held or not
    expect([r.c.playing(), r.c.held()]).toEqual([false, true]);
    r.wait(2000);
    expect(r.c.serverTick()).toBe(0);
    expect(r.votes()).toBe(0);
    expect(r.c.dtScale()).toBe(0);
  });

  it('a seek lands while held, and the hold stands after it', async () => {
    const r = await heldOpen();
    expect(r.c.seek(250)).toBe(250);
    expect(r.c.serverTick()).toBe(250);
    r.wait(2000);
    expect(r.c.serverTick()).toBe(250);
    expect([r.c.playing(), r.c.held()]).toEqual([false, true]);
  });

  it('play and toggle do not start the clock under the hold; release() plays once and ends it', async () => {
    const r = await heldOpen();
    r.c.play();
    expect(r.c.toggle()).toBe(false);
    expect([r.c.playing(), r.c.held()]).toEqual([false, true]);
    r.c.release();
    expect([r.c.playing(), r.c.held()]).toEqual([true, false]);
    r.wait(msOf(150));
    expect(r.c.serverTick()).toBeCloseTo(150, 6);
    expect(r.votes()).toBe(1);
    r.c.pause();
    r.c.release();                                            // once: a second release plays nothing
    expect([r.c.playing(), r.c.held()]).toEqual([false, false]);
  });

  it('a release before the recording opens plays it at the open', async () => {
    const c = new ReplayClient(Promise.resolve(segment()), { name: 'Watcher', map: 'MP2', autoplay: false });
    expect(c.held()).toBe(true);
    c.release();
    await c.ready;
    expect([c.playing(), c.held()]).toEqual([true, false]);
  });

  it('the default (autoplay absent, or true) is as before: playing at open, never held', async () => {
    const { c } = await open();
    expect([c.playing(), c.held()]).toEqual([true, false]);
    const t = new ReplayClient(Promise.resolve(segment()), { name: 'Watcher', map: 'MP2', autoplay: true });
    await t.ready;
    expect([t.playing(), t.held()]).toEqual([true, false]);
    t.release();
    expect([t.playing(), t.held()]).toEqual([true, false]);
  });
});
