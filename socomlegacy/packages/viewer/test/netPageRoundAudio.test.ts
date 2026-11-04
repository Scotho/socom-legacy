// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { RenderedSound } from '@s2u/sound';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import { GameAudio, type AudioOut, type StreamPlay } from '../src/audio';
import { NetPage, type NetPageDeps } from '../src/netPage';
import type { WebSocketLike } from '../src/net/client';
import type { Rules, ServerEvent, Team } from '../src/net/protocol';
import type { RemotePlayers } from '../src/remotePlayers';
import { RoundAudioHost } from '../src/roundAudioHost';
import type { RoundCues } from '../src/roundCues';
import type { WalkMode } from '../src/walk';

/**
 * The round's cues wired into the page (INT.R7; research 124 §6 and §12): the room's `roundStart`, `eliminated`,
 * `timeExpired`, `roundOver` and `abandoned` reach `RoundAudioHost` through `NetPage`, which runs it once a frame. The
 * cues are two maps' scripts as the dev disc has them (research 124 §5, written by hand): Frostfire (MP2: the line and
 * the music at once) and Vigilance (MP51: the line, WAIT 2, the music); both WAIT 5 before the team intro. A fake
 * socket stands in for the room, a fake GameAudio (or the real one, muted) for the output, and the test drives the clock.
 */

const line = (sound: string) => ({ sound, slot: false });
const music = (sound: string) => ({ sound, slot: true });
const intro = { 0: [{ wait: 5 }, music('MUS_MP_SEAL_INTRO_4')], 8: [{ wait: 5 }, music('MUS_MP_TERR_INTRO_4')], 16: [{ wait: 5 }, music('MUS_MP_SEAL_INTRO_4')] };
const byTeam = <T>(steps: T) => ({ 0: steps, 8: steps, 16: steps });
const MP2: RoundCues = {
  map: 'MP2', intro, introRespawn: intro,
  elimination: {
    seal: byTeam([line('^PH_0014'), music('MUS_MP_SEAL_WIN_RUS')]),
    terrorist: byTeam([line('^PH_0002'), music('MUS_MP_TERR_WIN_RUS')]),
  },
  timeExpired: [music('MUS_MP_SEAL_WIN_RUS')], objective: {},
};
const MP51: RoundCues = {
  map: 'MP51', intro, introRespawn: intro,
  elimination: {
    seal: byTeam([line('^PH_0014'), { wait: 2 }, music('MUS_MP_SEAL_WIN_ALB')]),
    terrorist: byTeam([line('^PH_0002'), { wait: 2 }, music('MUS_MP_TERR_WIN_ALB')]),
  },
  timeExpired: [music('MUS_MP_SEAL_WIN_ALB')], objective: {},
};

const START = { type: 'roundStart', round: 1, seconds: 360, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: 1, startTick: 0 } as ServerEvent;
const OVER = (winner: Team | null) => ({ type: 'roundOver', round: 1, winner, wins: { seal: 0, terrorist: 0 }, matchOver: false, screens: [] }) as unknown as ServerEvent;

interface PageOpts { map?: string; rules?: Rules; role?: 'player' | 'spectator'; team?: Team; cues?: RoundCues | null; audio?: boolean }

/** A page in a room: `at(t)` sets the clock and runs a frame; `calls` what the audio was asked (the stops left out). */
function page(o: PageOpts = {}) {
  let socket: WebSocketLike | null = null;
  const clock = { t: 0, cues: o.cues === undefined ? MP2 : o.cues };
  const calls: string[] = [];
  const audio = {
    roundCues: () => clock.cues,
    playMusic: (n: string): StreamPlay => { calls.push(`${clock.t} music ${n}`); return 'played'; },
    playStream: (n: string): StreamPlay => { calls.push(`${clock.t} voice ${n}`); return 'played'; },
    stopMusic: () => undefined,
    stopTransient: vi.fn(),
  };
  const hud = { postMessage: () => undefined, setTimer: () => undefined, setHealth: () => undefined, setScoreRows: () => undefined, setRoundScreen: () => undefined, startRound: () => undefined };
  const walk = {
    setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined,
    setTrigger: () => undefined, setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true, mode: () => 'walk',
  } as unknown as WalkMode;
  const remote = { setTeam: () => undefined, forget: () => undefined, died: () => undefined, clear: () => undefined, frame: () => undefined } as unknown as RemotePlayers;
  const host = o.audio === false ? undefined : new RoundAudioHost(audio, () => clock.t);
  const deps: NetPageDeps = {
    walk, remote, hud, clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined, respawned: () => undefined,
    roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
    ...(host ? { roundAudio: host } : {}),
    socket: () => (socket = { binaryType: '', readyState: 1, send: () => undefined, close: () => undefined } as unknown as WebSocketLike),
  };
  const rules = o.rules ?? 'classic', role = o.role ?? 'player', map = o.map ?? 'MP2';
  const net = new NetPage(deps, 'ws://test/ws', map, 'Tester', undefined, role === 'spectator', rules);
  socket!.onopen?.({} as Event);
  const server = (ev: ServerEvent): void => { socket!.onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
  server({
    type: 'welcome', id: 1, version: 9, map, tick: 0, role, team: role === 'player' ? o.team ?? 'seal' : null, queue: 0, name: 'Tester',
    players: [], rules, round: 1, rounds: 11, ghost: false,
  } as unknown as ServerEvent);
  const at = (t: number): void => { clock.t = t; net.frame(1 / 60, {} as never, false); };
  /** Frames every 0.25 s from the clock to `t`. */
  const run = (t: number): void => { for (let s = clock.t; s <= t + 1e-9; s += 0.25) at(Math.round(s * 100) / 100); };
  return { net, server, calls, clock, at, run, host, audio, socket: () => socket! };
}

describe('the round\'s result on the page: the map\'s script, once a round (INT.R7, research 124 §5-§6)', () => {
  it('Frostfire (MP2): each side\'s win speaks its line and starts its music at once, to either team', () => {
    for (const team of ['seal', 'terrorist'] as const) {
      for (const [winner, ph, mus] of [['seal', '^PH_0014', 'MUS_MP_SEAL_WIN_RUS'], ['terrorist', '^PH_0002', 'MUS_MP_TERR_WIN_RUS']] as const) {
        const p = page({ team });
        p.server(START);
        p.run(20);
        p.calls.length = 0;
        p.server({ type: 'eliminated', winner } as ServerEvent);
        p.run(43);
        expect(p.calls).toEqual([`20 voice ${ph}`, `20 music ${mus}`]);
      }
    }
  });

  it('Vigilance (MP51): the line, then the music the script\'s WAIT 2 later', () => {
    for (const [winner, ph, mus] of [['seal', '^PH_0014', 'MUS_MP_SEAL_WIN_ALB'], ['terrorist', '^PH_0002', 'MUS_MP_TERR_WIN_ALB']] as const) {
      const p = page({ map: 'MP51', cues: MP51, team: 'terrorist' });
      p.server(START);
      p.run(20);
      p.calls.length = 0;
      p.server({ type: 'eliminated', winner } as ServerEvent);
      p.run(21.75);
      expect(p.calls).toEqual([`20 voice ${ph}`]);
      p.run(30);
      expect(p.calls).toEqual([`20 voice ${ph}`, `22 music ${mus}`]);
    }
  });

  it('once a round: a second elimination and the roundOver after it play nothing; the next round\'s result plays', () => {
    const p = page({ map: 'MP51', cues: MP51 });
    p.server(START);
    p.run(20);
    p.calls.length = 0;
    p.server({ type: 'eliminated', winner: 'seal' } as ServerEvent);
    p.server({ type: 'eliminated', winner: 'terrorist' } as ServerEvent);
    p.run(43);
    p.server(OVER('seal'));
    p.run(50);
    expect(p.calls).toEqual(['20 voice ^PH_0014', '22 music MUS_MP_SEAL_WIN_ALB']);
    p.server({ ...START, round: 2 } as ServerEvent);
    p.run(80);
    p.server({ type: 'eliminated', winner: 'terrorist' } as ServerEvent);
    p.run(85);
    expect(p.calls.slice(2)).toEqual(['55 music MUS_MP_SEAL_INTRO_4', '80 voice ^PH_0002', '82 music MUS_MP_TERR_WIN_ALB']);
  });

  it('a draw (classic\'s time-out: roundOver with no winner) and a respawn room\'s points result are silent', () => {
    const c = page();
    c.server(START);
    c.run(20);
    c.calls.length = 0;
    c.server(OVER(null));
    c.run(40);
    const r = page({ rules: 'respawn' });
    r.server(START);
    r.run(20);
    r.calls.length = 0;
    r.server(OVER('terrorist'));
    r.run(40);
    expect([...c.calls, ...r.calls]).toEqual([]);
  });

  it('TIME EXPIRED in a respawn room: the SEALs\' win music mission_timer2 names, whoever leads, and no line', () => {
    for (const [map, cues, mus] of [['MP2', MP2, 'MUS_MP_SEAL_WIN_RUS'], ['MP51', MP51, 'MUS_MP_SEAL_WIN_ALB']] as const) {
      const p = page({ map, cues, rules: 'respawn', team: 'terrorist' });
      p.server(START);
      p.run(20);
      p.calls.length = 0;
      p.server({ type: 'timeExpired' } as ServerEvent);
      p.run(35);
      p.server(OVER('terrorist'));
      p.run(40);
      expect(p.calls).toEqual([`20 music ${mus}`]);
    }
  });

  it('a spectator who joins after the elimination hears nothing of it, nor of the roundOver that follows', () => {
    // The room sends `eliminated` once, to the pages there (room.ts); the script does not replay it to a later page.
    const p = page({ role: 'spectator', cues: MP51, map: 'MP51' });
    p.run(10);
    p.server(OVER('seal'));
    p.run(30);
    expect(p.calls).toEqual([]);
  });

  it('a dropped socket stops transient audio and queued cues once per connection, including after recovery', () => {
    // Browser resource lifecycle (research 304 section 6), not a claim about original network recovery.
    let now = 0;
    const time = vi.spyOn(performance, 'now').mockImplementation(() => now);
    try {
      const p = page({ map: 'MP51', cues: MP51 });
      p.server(START);
      p.run(20);
      p.calls.length = 0;
      p.audio.stopTransient.mockClear();
      p.server({ type: 'eliminated', winner: 'seal' } as ServerEvent);
      expect(p.calls).toEqual(['20 voice ^PH_0014']);
      const first = p.socket();
      first.onclose?.({ code: 1006, reason: '' });
      now = 20_500;
      p.at(20.5);
      expect.soft(p.audio.stopTransient).toHaveBeenCalledTimes(1);
      p.at(21);
      p.at(22.5);
      expect.soft(p.audio.stopTransient).toHaveBeenCalledTimes(1);
      expect.soft(p.calls).toEqual(['20 voice ^PH_0014']);

      // The real retry path opens a new socket; a fresh welcome and round can play their cues once.
      now = 22_000;
      p.at(23);
      expect(p.socket()).not.toBe(first);
      p.socket().onopen?.({} as Event);
      p.server({
        type: 'welcome', id: 2, version: 9, map: 'MP51', tick: 0, role: 'player', team: 'seal', queue: 0,
        name: 'Tester', players: [], rules: 'classic', round: 1, rounds: 11, ghost: false,
      } as unknown as ServerEvent);
      p.calls.length = 0;
      p.server(START);
      p.run(30);
      p.server({ type: 'eliminated', winner: 'terrorist' } as ServerEvent);
      p.run(33);
      expect(p.calls).toEqual([
        '28 music MUS_MP_SEAL_INTRO_4', '30 voice ^PH_0002', '32 music MUS_MP_TERR_WIN_ALB',
      ]);
      p.audio.stopTransient.mockClear();
      p.socket().onclose?.({ code: 1006, reason: '' });
      now = 33_500;
      p.at(33.5);
      p.at(34);
      expect.soft(p.audio.stopTransient).toHaveBeenCalledTimes(1);
      expect(p.calls).toHaveLength(3);
    } finally {
      time.mockRestore();
    }
  });

  it('an abandoned round and a closed page drop what is pending', () => {
    const a = page({ map: 'MP51', cues: MP51 });
    a.server(START);
    a.run(20);
    a.server({ type: 'eliminated', winner: 'seal' } as ServerEvent);
    a.server({ type: 'abandoned' } as ServerEvent);
    a.run(30);
    const b = page({ map: 'MP51', cues: MP51 });
    b.server(START);
    b.run(20);
    b.server({ type: 'eliminated', winner: 'seal' } as ServerEvent);
    b.audio.stopTransient.mockClear();
    b.net.close();
    b.run(30);
    expect(b.audio.stopTransient).toHaveBeenCalledTimes(1);
    expect(a.calls).toEqual(['5 music MUS_MP_SEAL_INTRO_4', '20 voice ^PH_0014']);
    expect(b.calls).toEqual(['5 music MUS_MP_SEAL_INTRO_4', '20 voice ^PH_0014']);
  });
});

describe('the team intro on the page (INT.R7, research 124 §5: `start` WAIT 5, then by player_team)', () => {
  it('5 s after the round\'s start, the local side\'s; a spectator the SEALs\'; once a round', () => {
    for (const [o, mus] of [[{ team: 'seal' }, 'MUS_MP_SEAL_INTRO_4'], [{ team: 'terrorist' }, 'MUS_MP_TERR_INTRO_4'], [{ role: 'spectator' }, 'MUS_MP_SEAL_INTRO_4'], [{ team: 'terrorist', rules: 'respawn' }, 'MUS_MP_TERR_INTRO_4']] as const) {
      const p = page(o as PageOpts);
      p.server(START);
      p.run(4.75);
      expect(p.calls).toEqual([]);
      p.run(14);
      expect(p.calls).toEqual([`5 music ${mus}`]);
    }
  });

  it('a respawn room plays `start2`\'s intro, a classic room `start`\'s (where a map\'s two differ)', () => {
    // No dev-disc map has a `start2` that differs from its `start` (MP51's are equal); the cues here differ by hand so
    // that the page's `rules` argument is what picks one (review finding 1).
    const respawnIntro = { 0: [{ wait: 3 }, music('MUS_R_SEAL')], 8: [{ wait: 3 }, music('MUS_R_TERR')], 16: [{ wait: 3 }, music('MUS_R_SEAL')] };
    const cues: RoundCues = { ...MP51, introRespawn: respawnIntro };
    for (const [rules, team, want] of [
      ['classic', 'seal', '5 music MUS_MP_SEAL_INTRO_4'], ['classic', 'terrorist', '5 music MUS_MP_TERR_INTRO_4'],
      ['respawn', 'seal', '3 music MUS_R_SEAL'], ['respawn', 'terrorist', '3 music MUS_R_TERR'],
    ] as const) {
      const p = page({ map: 'MP51', cues, rules, team });
      p.server(START);
      p.run(10);
      expect(p.calls, `${rules} ${team}`).toEqual([want]);
    }
  });

  it('cancelled by an elimination before it is due: the result plays, the intro never', () => {
    const p = page({ map: 'MP51', cues: MP51 });
    p.server(START);
    p.run(2);
    p.server({ type: 'eliminated', winner: 'terrorist' } as ServerEvent);
    p.run(12);
    expect(p.calls).toEqual(['2 voice ^PH_0002', '4 music MUS_MP_TERR_WIN_ALB']);
  });
});

describe('the sound data after the round\'s start (LATE_STREAM_DATA_READING, research 124 §12)', () => {
  it('data in before the intro\'s moment: the intro plays at its moment', () => {
    const p = page({ cues: null });
    p.server(START);
    p.run(3);
    p.clock.cues = MP2;
    p.run(10);
    expect(p.calls).toEqual(['5 music MUS_MP_SEAL_INTRO_4']);
  });

  it('data in after the intro\'s moment: the intro is not played late', () => {
    const p = page({ cues: null });
    p.server(START);
    p.run(6);
    p.clock.cues = MP2;
    p.run(12);
    expect(p.calls).toEqual([]);
  });

  it('data in within a frame before the intro\'s moment: taken up as it lands, the intro plays at the next frame', () => {
    // main.ts tells the host when `GameAudio` takes new data (`dataChanged`), so the moment is compared with the data's
    // arrival, not with the first frame after it (review finding 3).
    const p = page({ cues: null });
    p.server(START);
    p.run(4.75);
    p.clock.t = 4.99;
    p.clock.cues = MP2;
    p.host!.dataChanged();
    p.at(5.01);
    expect(p.calls).toEqual(['5.01 music MUS_MP_SEAL_INTRO_4']);
  });

  it('a result asked for before the data: not played when the data comes', () => {
    const p = page({ cues: null, map: 'MP51' });
    p.server(START);
    p.run(20);
    p.server({ type: 'eliminated', winner: 'seal' } as ServerEvent);
    p.run(21);
    p.clock.cues = MP51;
    p.run(30);
    expect(p.calls).toEqual([]);
  });
});

describe('the page\'s audio off: no cue', () => {
  it('without the host (a page with no round audio) the round runs and nothing is asked', () => {
    const p = page({ audio: false });
    p.server(START);
    p.run(20);
    p.server({ type: 'eliminated', winner: 'seal' } as ServerEvent);
    p.run(30);
    expect(p.calls).toEqual([]);
  });

  it('GameAudio muted: the cues reach it and none sounds on the output', () => {
    const tone = (rate: number): RenderedSound => ({ left: new Float32Array(rate), right: new Float32Array(rate), sendLeft: null, sendRight: null, sampleRate: rate, voices: 1, samples: [], peak: 0 });
    const got: string[] = [];
    const out: AudioOut = {
      unlocked: true, state: 'running', unlock: () => undefined, setGain: () => undefined, play: () => { got.push('play'); }, setReverb: () => undefined,
      rampReverb: () => undefined, loop: () => null,
      playStream: () => { got.push('voice'); }, playMusic: () => { got.push('music'); }, stopMusic: () => undefined,
    };
    let t = 0;
    const audio = new GameAudio(out, () => 0.5, { now: () => t });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    audio.setData({
      archive: 'MP2', banks: [], materials: [], params: [], weapons: [], callbacks: [], defaultMaterial: 0, beds: { outside: [], inside: [] },
      emitters: [], reverb: { preset: null, indoor: [], outdoor: [] }, missing: [], roundCues: MP2,
      streams: [
        { name: '^PH_0014', file: 'PH_0014.VAG', sound: tone(22050) }, { name: 'MUS_MP_SEAL_WIN_RUS', file: 'MUMP0019.VPK', sound: tone(32000) },
        { name: 'MUS_MP_SEAL_INTRO_4', file: 'MUMP0004.VPK', sound: tone(32000) },
      ],
    });
    warn.mockRestore();
    audio.setMuted(true);
    const p = page();
    (p.net as unknown as { deps: NetPageDeps }).deps.roundAudio = new RoundAudioHost(audio, () => t);
    p.server(START);
    for (t = 0; t <= 20; t += 0.25) p.net.frame(1 / 60, {} as never, false);
    p.server({ type: 'eliminated', winner: 'seal' } as ServerEvent);
    for (; t <= 30; t += 0.25) p.net.frame(1 / 60, {} as never, false);
    expect(got).toEqual([]);
    expect(audio.stats().dropped.muted).toBe(3);   // the intro, the line, the music: each tried once, none retried
  });
});

/**
 * LATER 155 (reading, pending review): a page that joins or reconnects in a decided hold is told what decided it (the
 * welcome's additive `decided`) and marks its round audio decided by it -- nothing played (its lines sounded before the
 * page was there) -- so a plant or a defuse in the hold takes the hold's rule. An older room's welcome names none: unmarked.
 */
describe('LATER 155: a welcome into a decided hold marks the round audio', () => {
  const decidedWelcome = (decided?: unknown): ServerEvent => ({
    type: 'welcome', id: 1, version: 11, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Tester', players: [],
    rules: 'classic', round: 1, rounds: 11, ghost: false, phase: 'decided', ...(decided !== undefined ? { decided } : {}),
  } as unknown as ServerEvent);
  const marked = (p: ReturnType<typeof page>): [boolean, string | null] => {
    const r = p.host!.round as unknown as { decided: boolean; reason: string | null };
    return [r.decided, r.reason];
  };

  it("decided { 'terrorist', 'timeout' }: the round audio decided by 'timeout', nothing played", () => {
    const p = page({ map: 'MP2' });
    p.server(decidedWelcome({ winner: 'terrorist', reason: 'timeout' }));
    p.run(5);
    expect(marked(p)).toEqual([true, 'timeout']);
    expect(p.calls).toEqual([]);
  });

  it("decided { 'terrorist', 'elimination' }: by the Terrorists' elimination (the eliminated handler's mapping); a bomb's: 'other'", () => {
    const p = page({ map: 'MP2' });
    p.server(decidedWelcome({ winner: 'terrorist', reason: 'elimination' }));
    expect(marked(p)).toEqual([true, 'terroristElimination']);
    const q = page({ map: 'MP2' });
    q.server(decidedWelcome({ winner: 'seal', reason: 'bomb' }));
    expect(marked(q)).toEqual([true, 'other']);
  });

  /**
   * The fresh review's F3 (a guard): the reconnect's order -- the old client's close resets the round audio (`retry`, a
   * browser adaptation), then the new socket's welcome in the same hold marks it again with the reason.
   */
  it("a reconnect inside the hold: the close resets the round audio, the new welcome re-marks it by its reason, nothing played", () => {
    let now = 0;
    const time = vi.spyOn(performance, 'now').mockImplementation(() => now);
    try {
      const p = page({ map: 'MP2' });
      p.server(decidedWelcome({ winner: 'terrorist', reason: 'timeout' }));
      expect(marked(p)).toEqual([true, 'timeout']);
      const first = p.socket();
      first.onclose?.({ code: 1006, reason: '' });
      now = 500;
      p.at(0.5);
      expect(marked(p), 'reset at the close').toEqual([false, null]);
      now = 2_000;
      p.at(2);
      expect(p.socket()).not.toBe(first);
      p.socket().onopen?.({} as Event);
      p.server(decidedWelcome({ winner: 'terrorist', reason: 'timeout' }));
      p.run(5);
      expect(marked(p), 're-marked by the new welcome').toEqual([true, 'timeout']);
      expect(p.calls).toEqual([]);
    } finally {
      time.mockRestore();
    }
  });

  it("an older room's welcome in 'decided' (no decided): the round audio unmarked, as before", () => {
    const p = page({ map: 'MP2' });
    p.server(decidedWelcome());
    p.run(5);
    expect(marked(p)).toEqual([false, null]);
  });
});
