import { describe, expect, it, vi } from 'vitest';
import type { RenderedSound } from '@s2u/sound';
import { GameAudio, type AudioOut, type StreamPlay } from '../src/audio';
import { RoundAudioHost } from '../src/roundAudioHost';
import { FORGE_ESCORT_LINES_ADAPTATION, RoundAudio, UNLOCK_RETRY_PLACEHOLDER, type RoundAudioOut } from '../src/roundAudio';
import type { RoundCues } from '../src/roundCues';

/**
 * The round's announcement, win music and team intro (research 124 §6; ported from Chris's browser-beta-v5
 * `packages/viewer/test/roundAudio.test.ts`, chris/browser-beta-integration d578f347, adapted to the cues read off the
 * map's script): events in, plays out, on a clock the test drives. The cues are MP2's and MP51's as the dev disc has them
 * (research 124 §5), written by hand.
 */
const MP2: RoundCues = {
  map: 'MP2',
  intro: {
    0: [{ wait: 5 }, { sound: 'MUS_MP_SEAL_INTRO_4', slot: true }],
    8: [{ wait: 5 }, { sound: 'MUS_MP_TERR_INTRO_4', slot: true }],
    16: [{ wait: 5 }, { sound: 'MUS_MP_SEAL_INTRO_4', slot: true }],
  },
  introRespawn: {
    0: [{ wait: 5 }, { sound: 'MUS_MP_SEAL_INTRO_4', slot: true }],
    8: [{ wait: 5 }, { sound: 'MUS_MP_TERR_INTRO_4', slot: true }],
    16: [{ wait: 5 }, { sound: 'MUS_MP_SEAL_INTRO_4', slot: true }],
  },
  elimination: {
    seal: { 0: [{ sound: '^PH_0014', slot: false }, { sound: 'MUS_MP_SEAL_WIN_RUS', slot: true }], 8: [{ sound: '^PH_0014', slot: false }, { sound: 'MUS_MP_SEAL_WIN_RUS', slot: true }] },
    terrorist: { 0: [{ sound: '^PH_0002', slot: false }, { sound: 'MUS_MP_TERR_WIN_RUS', slot: true }], 8: [{ sound: '^PH_0002', slot: false }, { sound: 'MUS_MP_TERR_WIN_RUS', slot: true }] },
  },
  timeExpired: [{ sound: 'MUS_MP_SEAL_WIN_RUS', slot: true }], objective: {},
};
const MP51: RoundCues = {
  ...MP2, map: 'MP51',
  elimination: {
    seal: { 0: [{ sound: '^PH_0014', slot: false }, { wait: 2 }, { sound: 'MUS_MP_SEAL_WIN_ALB', slot: true }] },
    terrorist: { 8: [{ sound: '^PH_0002', slot: false }, { wait: 2 }, { sound: 'MUS_MP_TERR_WIN_ALB', slot: true }] },
  },
  timeExpired: [{ sound: 'MUS_MP_SEAL_WIN_ALB', slot: true }],
};

/** A fake pair of players: what was asked, when, and whether the output took it (`locked`: neither does). */
function players(): RoundAudioOut & { calls: string[]; locked: boolean; refused: boolean; at: number } {
  const p = {
    calls: [] as string[], locked: false, refused: false, at: 0,
    voice: (name: string): StreamPlay => { p.calls.push(`voice ${name}`); return p.refused ? 'unknown' : p.locked ? 'locked' : 'played'; },
    music: (name: string): StreamPlay => { p.calls.push(`music ${name}`); return p.refused ? 'unknown' : p.locked ? 'locked' : 'played'; },
    stopMusic: (): void => { p.calls.push('stop'); },
  };
  return p;
}

describe('RoundAudio: the result, once a round, as the map\'s script plays it (research 124 §6)', () => {
  it('speaks the winner to both teams and starts the win music with it (MP2: no wait), once per round, across rounds', () => {
    for (const team of ['seal', 'terrorist'] as const) {
      const p = players(), a = new RoundAudio(p);
      a.setCues(MP2);
      a.roundStart(team, false, 0);
      p.calls.length = 0;
      a.eliminated('seal', team, 20);
      a.eliminated('seal', team, 20.1);
      a.eliminated('terrorist', team, 20.2);   // a second elimination in the same round: the round is decided
      a.roundOver(43);
      a.frame(44);
      expect(p.calls).toEqual(['voice ^PH_0014', 'music MUS_MP_SEAL_WIN_RUS']);
      a.roundStart(team, false, 50);
      a.eliminated('terrorist', team, 70);
      expect(p.calls.slice(-2)).toEqual(['voice ^PH_0002', 'music MUS_MP_TERR_WIN_RUS']);
    }
  });

  it('plays the music the script\'s WAIT after the line (MP51: WAIT 2)', () => {
    const p = players(), a = new RoundAudio(p);
    a.setCues(MP51);
    a.roundStart('seal', false, 0);
    p.calls.length = 0;
    a.eliminated('seal', 'seal', 20);
    expect(p.calls).toEqual(['voice ^PH_0014']);
    a.frame(21.9);
    expect(p.calls).toEqual(['voice ^PH_0014']);
    a.frame(22);
    expect(p.calls).toEqual(['voice ^PH_0014', 'music MUS_MP_SEAL_WIN_ALB']);
  });

  it('invents nothing: a draw (classic\'s time-out) and a respawn room\'s result are silent', () => {
    const p = players(), a = new RoundAudio(p);
    a.setCues(MP2);
    a.roundStart('seal', false, 0);
    a.frame(5);
    p.calls.length = 0;
    a.roundOver(360);
    a.frame(400);
    expect(p.calls).toEqual([]);
    // No branch for the local team: nothing (MP51's script above has a SEAL win only for player_team 0).
    const q = players(), b = new RoundAudio(q);
    b.setCues(MP51);
    b.eliminated('seal', 'terrorist', 20);
    b.frame(30);
    expect(q.calls).toEqual(['stop']);   // the map's cues set: the slot stopped, nothing more
  });

  it('TIME EXPIRED in a respawn room: the music mission_timer2 names, whoever leads, and no line', () => {
    const p = players(), a = new RoundAudio(p);
    a.setCues(MP2);
    a.roundStart('terrorist', true, 0);
    a.frame(5);
    p.calls.length = 0;
    a.timeExpired(360);
    a.timeExpired(360.5);
    a.roundOver(375);
    a.frame(380);
    expect(p.calls).toEqual(['music MUS_MP_SEAL_WIN_RUS']);
  });

  it('the team intro 5 s after the round\'s start by the local team, a spectator the SEALs\'; the respawn room\'s from start2', () => {
    const cases: [ 'seal' | 'terrorist' | null, boolean, string][] = [
      ['seal', false, 'MUS_MP_SEAL_INTRO_4'], ['terrorist', false, 'MUS_MP_TERR_INTRO_4'], [null, false, 'MUS_MP_SEAL_INTRO_4'],
      ['terrorist', true, 'MUS_MP_TERR_INTRO_4'],
    ];
    for (const [team, respawn, music] of cases) {
      const p = players(), a = new RoundAudio(p);
      a.setCues(MP2);
      a.roundStart(team, respawn, 100);
      expect(p.calls).toEqual(['stop', 'stop']);   // the map's cues set, then a new round: the last one's music goes
      a.frame(104.9);
      expect(p.calls).toEqual(['stop', 'stop']);
      a.frame(105);
      a.frame(106);
      expect(p.calls).toEqual(['stop', 'stop', `music ${music}`]);
    }
  });

  it('a reset, a close or a map change drops what is pending and stops the slot', () => {
    const p = players(), a = new RoundAudio(p);
    a.setCues(MP51);
    a.roundStart('seal', false, 0);
    a.reset();
    a.frame(6);
    expect(p.calls).toEqual(['stop', 'stop', 'stop']);   // set, start, reset: the intro never plays
    a.roundStart('seal', false, 10);
    a.eliminated('seal', 'seal', 30);
    a.setCues(MP2);                       // the map changes before MP51's WAIT 2 runs out
    a.frame(40);
    expect(p.calls).toEqual(['stop', 'stop', 'stop', 'stop', 'voice ^PH_0014', 'stop']);
    // No cues (a tree without VAGSTORE, a map with no objectives): every event is silent.
    const q = players(), b = new RoundAudio(q);
    b.roundStart('seal', false, 0);
    b.eliminated('seal', 'seal', 20);
    b.frame(30);
    expect(q.calls).toEqual(['stop']);
  });

  it('retries a play the locked page refused, every 0.25 s for 5 s (a browser adaptation), then lets it go', () => {
    expect(UNLOCK_RETRY_PLACEHOLDER).toEqual({ every: 0.25, within: 5 });
    const p = players(), a = new RoundAudio(p);
    a.setCues(MP2);
    a.roundStart('seal', false, 0);
    p.locked = true;
    p.calls.length = 0;
    a.eliminated('terrorist', 'seal', 20);
    expect(p.calls).toEqual(['voice ^PH_0002', 'music MUS_MP_TERR_WIN_RUS']);
    a.frame(20.2);
    expect(p.calls).toHaveLength(2);
    a.frame(20.25);
    expect(p.calls).toEqual(['voice ^PH_0002', 'music MUS_MP_TERR_WIN_RUS', 'voice ^PH_0002', 'music MUS_MP_TERR_WIN_RUS']);
    p.locked = false;                      // the gesture: both go on the next retry, and only once
    a.frame(20.5);
    a.frame(21);
    a.frame(30);
    expect(p.calls.slice(4)).toEqual(['voice ^PH_0002', 'music MUS_MP_TERR_WIN_RUS']);
    // Still locked past the window: dropped.
    const q = players(), b = new RoundAudio(q);
    b.setCues(MP2);
    q.locked = true;
    b.eliminated('seal', 'seal', 0);
    for (let t = 0; t <= 10; t += 0.25) b.frame(t);
    const tries = q.calls.filter((c) => c === 'voice ^PH_0014').length;
    expect(tries).toBe(1 + 5 / 0.25);
  });

  it('retries only the lock: a name the streams lack, a mute or no slot output is tried once (the counters count one drop)', () => {
    const p = players(), a = new RoundAudio(p);
    a.setCues(MP2);
    a.roundStart('seal', false, 0);
    p.refused = true;
    p.calls.length = 0;
    a.eliminated('terrorist', 'seal', 20);
    for (let t = 20; t <= 30; t += 0.25) a.frame(t);
    expect(p.calls).toEqual(['voice ^PH_0002', 'music MUS_MP_TERR_WIN_RUS']);
  });

  it('cues that come after the round\'s start still give that round its intro, on the round\'s own clock', () => {
    // The sound data (VAGSTORE's reads, the decode) can reach the page after the room's roundStart.
    const p = players(), a = new RoundAudio(p);
    a.roundStart('terrorist', false, 100);
    a.setCues(MP2, 102);
    a.frame(104.9);
    expect(p.calls.filter((c) => c.startsWith('music'))).toEqual([]);
    a.frame(105);
    a.frame(106);
    expect(p.calls.filter((c) => c.startsWith('music'))).toEqual(['music MUS_MP_TERR_INTRO_4']);
    // Too late for the cue's window (due 5 s after the start, `UNLOCK_RETRY_PLACEHOLDER.within` past it): not played late.
    const q = players(), b = new RoundAudio(q);
    b.roundStart('seal', false, 0);
    b.setCues(MP2, 20);
    b.frame(20);
    b.frame(21);
    expect(q.calls.filter((c) => c.startsWith('music'))).toEqual([]);
    // A round already decided takes no intro; a closed one (reset) neither.
    const r = players(), c = new RoundAudio(r);
    c.roundStart('seal', false, 0);
    c.roundOver(1);
    c.setCues(MP2, 2);
    c.frame(6);
    const s = players(), d = new RoundAudio(s);
    d.roundStart('seal', false, 0);
    d.reset();
    d.setCues(MP2, 2);
    d.frame(6);
    expect([...r.calls, ...s.calls].filter((x) => x.startsWith('music'))).toEqual([]);
    // A map change (cues replacing cues) in a round drops the old map's pending intro and schedules none of the new.
    const u = players(), e = new RoundAudio(u);
    e.setCues(MP2);
    e.roundStart('seal', false, 0);
    e.setCues(MP51, 1);
    e.frame(6);
    expect(u.calls.filter((x) => x.startsWith('music'))).toEqual([]);
  });

  it('the intro sounds once a round: cues that go and come back inside its window do not play it again', () => {
    // The round's own record, not the page's wiring: GameAudio's data nulled and set again (the same or new cues).
    for (const back of [MP2, MP51]) {
      const p = players(), a = new RoundAudio(p);
      a.setCues(MP2);
      a.roundStart('seal', false, 0);
      a.frame(5);                          // the intro plays
      a.setCues(null, 6);
      a.setCues(back, 7);                  // still inside the intro's 5 s window from t0+5
      for (let t = 7; t <= 12; t += 0.25) a.frame(t);
      expect(p.calls.filter((x) => x.startsWith('music'))).toEqual(['music MUS_MP_SEAL_INTRO_4']);
    }
    // Cues gone before the intro was due, back after: it had not sounded, so it plays -- once, on the round's clock.
    const q = players(), b = new RoundAudio(q);
    b.roundStart('seal', false, 0);
    b.setCues(MP2, 1);
    b.setCues(null, 2);
    b.setCues(MP2, 3);
    b.frame(4.9);
    expect(q.calls.filter((x) => x.startsWith('music'))).toEqual([]);
    for (let t = 5; t <= 12; t += 0.25) b.frame(t);
    b.setCues(null, 12);
    b.setCues(MP2, 12);                    // after it sounded, and past its window: nothing
    for (let t = 12; t <= 15; t += 0.25) b.frame(t);
    expect(q.calls.filter((x) => x.startsWith('music'))).toEqual(['music MUS_MP_SEAL_INTRO_4']);
    // The next round schedules its own.
    b.roundStart('seal', false, 20);
    b.frame(25);
    expect(q.calls.filter((x) => x.startsWith('music'))).toEqual(['music MUS_MP_SEAL_INTRO_4', 'music MUS_MP_SEAL_INTRO_4']);
  });
});

describe('RoundAudioHost: the page\'s GameAudio and clock (research 124 §6)', () => {
  it('takes the cues of the map GameAudio holds, plays the line as a stream and the music in the slot', () => {
    const tone = (rate: number): RenderedSound => ({ left: new Float32Array(rate), right: new Float32Array(rate), sendLeft: null, sendRight: null, sampleRate: rate, voices: 1, samples: [], peak: 0 });
    const got: string[] = [];
    let unlocked = false;
    const out: AudioOut = {
      get unlocked() { return unlocked; }, state: 'running', unlock: () => { unlocked = true; }, setGain: () => {}, play: () => {}, setReverb: () => {},
      rampReverb: () => {}, loop: () => null,
      playStream: (s) => { got.push(`voice ${s.sampleRate}`); }, playMusic: (s, h) => { got.push(`music ${s.sampleRate} ${h}`); }, stopMusic: () => { got.push('stop'); },
    };
    let t = 0;
    const audio = new GameAudio(out, () => 0.5, { now: () => t });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    audio.setData({
      archive: 'MP51', banks: [], materials: [], params: [], weapons: [], callbacks: [], defaultMaterial: 0, beds: { outside: [], inside: [] },
      emitters: [], reverb: { preset: null, indoor: [], outdoor: [] }, missing: [], roundCues: MP51,
      streams: [{ name: '^PH_0014', file: 'PH_0014.VAG', sound: tone(22050) }, { name: 'MUS_MP_SEAL_WIN_ALB', file: 'MUMP0013.VPK', sound: tone(32000) }],
    });
    warn.mockRestore();
    out.unlock();
    got.length = 0;
    const host = new RoundAudioHost(audio, () => t);
    host.roundStart('seal', false);
    host.eliminated('seal', 'seal');
    t = 2;
    host.frame();
    expect(got).toEqual(['stop', 'stop', 'voice 22050', 'music 32000 0']);
  });

  it('a roundStart before GameAudio holds the map\'s data: the intro still comes when the data does', () => {
    const calls: string[] = [];
    let cues: RoundCues | null = null, t = 0;
    const audio = {
      roundCues: () => cues,
      playMusic: (n: string): StreamPlay => { calls.push(`music ${n}`); return 'played'; },
      playStream: (n: string): StreamPlay => { calls.push(`voice ${n}`); return 'played'; },
      stopMusic: () => { calls.push('stop'); },
    };
    const host = new RoundAudioHost(audio, () => t);
    host.roundStart('seal', false);
    t = 3;
    cues = MP2;                            // the worker's sound data arrives
    host.frame();
    t = 5;
    host.frame();
    expect(calls.filter((c) => c.startsWith('music'))).toEqual(['music MUS_MP_SEAL_INTRO_4']);
  });
});

describe("FORGE_ESCORT_LINES_ADAPTATION: a Forge escort with no line of its own posts the script's words", () => {
  it("a staged or extracted VIP the map's cues do not name posts RescueN's / EndRescueN's text; an abort, nothing", () => {
    const a = new RoundAudio(players());
    const posted: [string, number][] = [];
    const post = (text: string, scale: number): void => { posted.push([text, scale]); };
    // A disc map (the switch off, the default): an unnamed VIP posts nothing, as the original.
    a.escort('staged', 'Hostage4', 'seal', 0, post);
    expect(posted).toEqual([]);
    a.forgeEscortLines = true;                                     // a Forge layout's match (`matchMount`)
    a.escort('staged', 'Hostage4', 'seal', 0, post);
    a.escort('extracted', 'Hostage4', 'seal', 0, post);
    a.escort('aborted', null, 'seal', 0, post);
    expect(posted).toEqual([
      [FORGE_ESCORT_LINES_ADAPTATION.staged.text, FORGE_ESCORT_LINES_ADAPTATION.staged.scale],
      [FORGE_ESCORT_LINES_ADAPTATION.extracted.text, FORGE_ESCORT_LINES_ADAPTATION.extracted.scale],
    ]);
    expect(FORGE_ESCORT_LINES_ADAPTATION.staged).toEqual({ text: 'A VIP IS IN THE EXTRACTION ZONE', scale: 0.7 });
  });
});
