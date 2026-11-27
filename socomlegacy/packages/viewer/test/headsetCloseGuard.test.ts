import { describe, expect, it } from 'vitest';
import type { StreamPlay } from '../src/audio';
import { RoundAudio, type RoundAudioOut } from '../src/roundAudio';
import type { RoundCues } from '../src/roundCues';
import { uiSoundOutput, type UiSoundHostOptions } from '../src/uiSoundHost';
import type { UiSoundPlay } from '@s2u/ui';

/**
 * R4P-250 (atlas-parity r0004 row 64): at a mission's close r0004 drops the WAITING headset lines, r0001 keeps them to
 * play after, and a line already playing on the TV is not cut. Closed as "holds by construction today" (research 233
 * s2.4); this guard keeps it from regressing silently. Adaptation of nothing: a regression test over the port's code.
 *
 * LATER 1452: the headset `stream` sink is unwired (frontEnd.ts passes only `{ music }`). WHEN it is wired, R4P-250's
 * r0004 rule must be added (a mission's close drops the waiting lines; a playing line is not cut), and part 1 below
 * will need replacing by that rule's test.
 */

type Play = Extract<UiSoundPlay, { kind: 'headset' }>;
const line = (n: string): Play => ({
  kind: 'headset', source: n, vol: 1024, pan: -1,
  resolution: { kind: 'stream', name: n, object: { music: false } },
}) as unknown as Play;
const audio = { play: () => true, stopMusic: () => undefined };

describe('R4P-250: no headset line waits without a stream sink (LATER 1452)', () => {
  it('a sinkless output counts the lines and holds none: a stream added later never surfaces an old one', () => {
    const opts: UiSoundHostOptions = {};   // no `stream`: uiSoundHost.ts:80 refuses, headsetQueue.ts drain drops (:76)
    const out = uiSoundOutput(audio, opts);
    for (const n of ['HS_1', 'HS_2', 'HS_3', 'HS_4']) out.play(line(n));
    expect(out.stats().headset).toBe(4);
    const started: string[] = [];
    const ends: Array<(() => void) | undefined> = [];
    opts.stream = (p, ended) => { started.push(p.source as string); ends.push(ended); };   // the sink appears afterwards
    expect(started).toEqual([]);
    out.play(line('HS_5'));
    expect(started).toEqual(['HS_5']);   // only the new line; nothing old waits behind it
    ends[0]?.();
    expect(started).toEqual(['HS_5']);
  });
});

const CUES: RoundCues = {
  map: 'MP2',
  intro: { 0: [{ wait: 5 }, { sound: 'MUS_MP_SEAL_INTRO_4', slot: true }], 8: [], 16: [] },
  introRespawn: { 0: [{ wait: 5 }, { sound: 'MUS_MP_SEAL_INTRO_4', slot: true }], 8: [], 16: [] },
  elimination: { seal: {}, terrorist: {} },
  timeExpired: [], objective: {},
} as unknown as RoundCues;

describe('R4P-250: roundAudio.reset leaves nothing pending', () => {
  it('a pending cue (the intro music behind WAIT 5) never plays after a reset, however far time advances', () => {
    const calls: string[] = [];
    const out: RoundAudioOut = {
      voice: (n): StreamPlay => { calls.push(`voice ${n}`); return 'played'; },
      music: (n): StreamPlay => { calls.push(`music ${n}`); return 'played'; },
      stopMusic: () => { calls.push('stop'); },
    };
    const a = new RoundAudio(out);
    a.setCues(CUES);
    a.roundStart('seal', false, 0);   // the intro's music is pending behind WAIT 5
    calls.length = 0;
    a.reset();
    for (const t of [5, 5.5, 6, 60]) a.frame(t);
    expect(calls).toEqual(['stop']);
  });
});
