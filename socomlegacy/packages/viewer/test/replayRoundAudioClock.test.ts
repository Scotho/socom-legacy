// test/replayRoundAudioClock.test.ts -- LATER 161 (reading, pending review; REPLAY_ADAPTATION: SOCOM II plays no recording
// back): the replay page's round audio schedules on the replay's clock (`ReplayClient.pageClock`, RE-3, research 249 §4),
// as the page's round timer does: a pause holds a queued line, and the speed scales the script's waits. `./matchSound`
// reads that clock off the page's client (`roundAudioClock`); the live page's stays `performance.now`. Was: `mountSound`
// built the host on the wall clock, so a paused replay played its queued lines and 2x played them late. No browser is run.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReplayRecord } from '../../match/src/replay/format';
import { GameAudio, type StreamPlay } from '../src/audio';
import { mountSound, roundAudioClock, silentOut } from '../src/matchSound';
import { TICK_HZ, type ServerEvent } from '../src/net/protocol';
import { asNetClient, ReplayClient, type LoadedSegment } from '../src/replay/replayClient';
import { UNLOCK_RETRY_PLACEHOLDER } from '../src/roundAudio';
import type { RoundCues } from '../src/roundCues';
import { ALPHA, BRAVO, body, header } from './replayFixture';

afterEach(() => { vi.restoreAllMocks(); });

const HZ = TICK_HZ;
const FRAME_MS = 1000 / HZ;
const byTeam = <T>(steps: T) => ({ 0: steps, 8: steps, 16: steps });
/** An intro in small, by hand (`start`'s shape): the script's WAIT of 2 s, then one line. */
const CUES = {
  map: 'MP2', intro: byTeam([{ wait: 2 }, { sound: 'INTRO', slot: false }]), introRespawn: null,
  elimination: { seal: {}, terrorist: {} }, timeExpired: [], objective: {},
} as unknown as RoundCues;
const START_TICK = 60;                                       // the round's start, 1 s into the recording
const DUE_TICK = START_TICK + 2 * HZ;                        // the line's moment, in replay ticks
const start = (round: number, tick: number): ServerEvent =>
  ({ type: 'roundStart', round, seconds: 300, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: round, startTick: tick }) as unknown as ServerEvent;

function segment(end = 900): LoadedSegment {
  const h = header({ map: 'MP2' });
  const records: ReplayRecord[] = [{ kind: 'header', header: h }, { kind: 'players', tick: 0, players: [ALPHA, BRAVO] }];
  for (let tick = 0; tick <= end; tick++) {
    if (tick === START_TICK) records.push({ kind: 'event', tick, event: start(1, tick) });
    if (tick % 2 === 0) records.push({ kind: 'snap', tick, bodies: [body(1, tick), body(2, -tick)] });
  }
  records.push({ kind: 'end', tick: end, reason: 'closed' });
  return { header: h, records, truncated: false };
}

/**
 * The replay page in small: `mountSound` as both pages mount it, its `seat` the page's client (the replay's, or a live
 * client's with no `pageClock`); the recording's `roundStart` to the round audio (`NetPage`'s handler, in small); a seek
 * resetting it (LATER 160, `./matchActions`). `wall`: the wall clock (ms) -- the replay's and `performance.now`.
 */
async function rig(seat: 'replay' | 'live' = 'replay') {
  let wall = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => wall);
  const replay = new ReplayClient(Promise.resolve(segment()), { name: 'Watcher', map: 'MP2', now: () => wall });
  const audio = new GameAudio(silentOut(), () => 0.5, { inline: false });
  const heard: { sound: string; wall: number; tick: number }[] = [];
  let startedAt: number | null = null;
  vi.spyOn(audio, 'roundCues').mockReturnValue(CUES);
  vi.spyOn(audio, 'playStream').mockImplementation((n: string): StreamPlay => { heard.push({ sound: n, wall, tick: replay.serverTick() }); return 'played'; });
  const live = { id: 1, role: 'spectator', team: null };
  const s = mountSound({
    audio,
    walk: { mode: () => 'walk' as const, drawnFeet: (): [number, number, number] => [0, 0, 0], posture: () => 'stand' as const, grid: () => null },
    fly: { groundWish: () => ({ forward: 0, right: 0, boost: false }) },
    loadouts: { type: () => 1 }, side: () => 'seal' as const,
    seat: () => (seat === 'replay' ? asNetClient(replay) : live),
  });
  replay.on((ev) => { if (ev.type === 'roundStart') { startedAt = wall; s.roundAudio.roundStart(null, false); } });
  replay.onSeek(() => { s.roundAudio.reset(); });
  await replay.ready;
  const frame = (): void => { replay.advance(); s.roundAudio.frame(); };
  return {
    replay, heard, startedAt: () => startedAt,
    /** What the round audio holds queued (`RoundAudio`'s private queue, read for the seek's guard). */
    queued: (): number => (s.roundAudio.round as unknown as { queue: unknown[] }).queue.length,
    /** `ms` of wall time in frames of one 60 Hz frame. */
    step: (ms: number): void => { const end = wall + ms; while (wall < end) { wall = Math.min(end, wall + FRAME_MS); frame(); } },
  };
}

describe('LATER 161: the replay page\'s round audio on the replay\'s clock', () => {
  it('a paused replay holds a queued line; it sounds at its moment on the replay once play resumes', async () => {
    const p = await rig();
    p.step((START_TICK + 30) * FRAME_MS);                    // past the round's start: the line queued 2 s on
    expect(p.heard).toEqual([]);
    p.replay.pause();
    p.step(5000);                                            // 5 s of wall, paused
    expect(p.heard).toEqual([]);                             // RED today: 'INTRO' at the wall's 2 s, paused
    p.replay.play();
    p.step(3000);
    expect(p.heard.map((h) => h.sound)).toEqual(['INTRO']);
    expect(p.heard[0]!.tick).toBeGreaterThanOrEqual(DUE_TICK);
    expect(p.heard[0]!.tick).toBeLessThanOrEqual(DUE_TICK + 2);
  });

  it('2x: the line comes half the wall wait after the round\'s start (1 s for the script\'s 2 s)', async () => {
    const p = await rig();
    p.replay.speed(2);
    p.step(4000);
    expect(p.heard.map((h) => h.sound)).toEqual(['INTRO']);
    const waited = p.heard[0]!.wall - p.startedAt()!;
    expect(waited).toBeGreaterThanOrEqual(1000 - FRAME_MS);
    expect(waited).toBeLessThanOrEqual(1000 + FRAME_MS);     // RED today: 2000, the wall's
  });

  it('the live page unchanged: a client without `pageClock` (or none) -- `performance.now`; a pause of an unrelated replay holds nothing', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(4321);
    expect(roundAudioClock(() => null)()).toBe(4.321);
    expect(roundAudioClock(() => ({}))()).toBe(4.321);
    expect(roundAudioClock(() => ({ pageClock: () => ({ now: () => 1500 }) }))()).toBe(1.5);
    vi.restoreAllMocks();
    const p = await rig('live');
    p.step((START_TICK + 30) * FRAME_MS);
    p.replay.pause();
    p.step(5000);
    expect(p.heard.map((h) => h.sound)).toEqual(['INTRO']);  // the wall's 2 s after the start, as today
    expect(p.heard[0]!.wall - p.startedAt()!).toBeGreaterThanOrEqual(2000 - FRAME_MS);
    expect(p.heard[0]!.wall - p.startedAt()!).toBeLessThanOrEqual(2000 + FRAME_MS);
  });

  // This guards the rig's own `onSeek` reset (LATER 160's, in small) on the replay's clock; the production listener
  // (`./matchActions`' seek listener) is held by `replayRoundAudio.test.ts`.
  it('a seek still clears the queue (LATER 160\'s reset); a seek back before the start plays the line once, at its moment', async () => {
    const p = await rig();
    p.step((START_TICK + 30) * FRAME_MS);                    // the line queued
    expect(p.queued()).toBe(1);
    // Past its moment but inside its retry window (`UNLOCK_RETRY_PLACEHOLDER.within`), where a line still queued would
    // play at the next frame: only the reset keeps it silent.
    p.replay.seek(DUE_TICK + Math.floor((UNLOCK_RETRY_PLACEHOLDER.within * HZ) / 2));
    expect(p.queued()).toBe(0);                              // cleared at the seek itself
    p.step(3000);
    expect(p.heard).toEqual([]);
    p.replay.seek(0);                                        // before the start: the start told again on play
    p.step((DUE_TICK + 10) * FRAME_MS);
    expect(p.heard.map((h) => h.sound)).toEqual(['INTRO']);
    expect(p.heard[0]!.tick).toBeGreaterThanOrEqual(DUE_TICK);
  });
});
