import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AssetSource, RangedAssetSource } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { FADE_ALL_TICKS, MUSIC_VOLUME_DEFAULT, frontEndSoundTable, soundHash, streamGroupMaster, streamVoiceGains, type StreamVoiceGains } from '@s2u/sound';
import { UiSoundCues, type UiSoundPlay } from '@s2u/ui';
import { buildZar, type KeySpec } from '../../scene/test/syntheticZar';
import {
  MENU_MUSIC_GESTURE_ADAPTATION, MENU_MUSIC_LEAD_SECONDS_ADAPTATION, MenuMusic, STREAM_OFF_PLAY_READING, VAGSTORE_PATH,
  type MusicOut, type MusicVoice,
} from '../src/menuMusic';
import { FrontEndSession, readFrontEndDisc } from '../src/frontEnd';
import { readUiSoundFiles, makeUiSoundHost, uiSoundOutput, type UiSoundAudio } from '../src/uiSoundHost';

/**
 * The page's music (MENU-MUSIC; web research 152 §4): a `MUS_` stream play opens its VPK member in VAGSTORE by range
 * through the page's `AssetSource`, decodes it a buffer at a time and schedules it on the front end's own output ahead
 * of the output's clock, at the 989snd level (the play's volume and pan through the music group's square law), looping
 * as flags 4 asks; one stream a name slot, all stopped by `StopAllSounds` or `VagStreaming(OFF)`, faded by
 * `FadeAllSounds`. The unit half uses a synthetic VAGSTORE and a fake output; the dev-disc half opens the disc's members
 * from a `FrontEndSession` running SOCOM II ONLINE's start (`SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`).
 */

/** A synthetic VPK: `channelBytes` of ADPCM a channel (no end flag) in `buffer`-byte buffers from 0x30. */
function vpk(channelBytes: number, buffer: number): Uint8Array {
  const head = 0x30, stride = buffer / 2, n = Math.ceil(channelBytes / stride);
  const b = new Uint8Array(head + n * buffer), v = new DataView(b.buffer);
  b.set([0x20, 0x4b, 0x50, 0x56]);
  v.setUint32(4, channelBytes, true); v.setUint32(8, head, true); v.setUint32(12, buffer, true);
  v.setUint32(16, 32000, true); v.setUint32(20, 2, true);
  v.setInt8(0x18, 127); v.setInt16(0x1a, 270, true); v.setInt8(0x1c, 127); v.setInt16(0x1e, 90, true);
  for (let i = head; i < b.length; i += 16) { b[i] = 0x12; for (let j = 2; j < 16; j++) b[i + j] = (i + j) & 0xff; }
  return b;
}
/** 28 samples a block, 2 blocks a channel a buffer: 56 samples (1.75 ms) a buffer; 10 buffers a pass. */
const MEMBER = vpk(16 * 20, 64);
const VAGSTORE = buildZar([{ name: 'MUUI0003.vpk', data: MEMBER }, { name: 'MUUI0001.vpk', data: vpk(16 * 4, 64) }] satisfies KeySpec[]);

/** A ranged source over the synthetic archive, every range kept. */
function source(): RangedAssetSource & { ranges: [string, number, number][] } {
  const ranges: [string, number, number][] = [];
  return {
    ranges,
    list: async () => [VAGSTORE_PATH],
    read: async (p) => { throw new Error(`read whole: ${p}`); },
    size: async () => VAGSTORE.length,
    readRange: async (p, at, n) => { ranges.push([p, at, n]); if (at + n > VAGSTORE.length) throw new Error('past the end'); return VAGSTORE.slice(at, at + n); },
  };
}

/** A fake output: a clock the test moves, and the pieces each voice was given. */
function out(running = true) {
  const voices: { pieces: { left: Float32Array; right: Float32Array; rate: number; when: number }[]; fades: [number, number][]; stopped: boolean }[] = [];
  const runs: (() => void)[] = [];
  const o = {
    running, currentTime: 0, voices,
    onRunning: (r: () => void) => { runs.push(r); },
    start: () => { o.running = true; for (const r of runs) r(); },
    voice: (): MusicVoice => {
      const v = { pieces: [] as { left: Float32Array; right: Float32Array; rate: number; when: number }[], fades: [] as [number, number][], stopped: false };
      voices.push(v);
      return {
        play: (left, right, rate, when) => { v.pieces.push({ left, right, rate, when }); },
        fade: (curve, seconds) => { v.fades.push([curve.length, seconds]); },
        stop: () => { v.stopped = true; },
      };
    },
  };
  return o satisfies MusicOut & Record<string, unknown>;
}

const h = (n: string): string => String(soundHash(n));
const TABLE = frontEndSoundTable(['SETS', ['SMUS', [
  [h('MUS_ONLINE_MENU'), 'ST', ['N1', ['MUUI0003'], 'LOOP', [], 'MUS', []]],
  [h('MUS_SUCCESS'), 'ST', ['N1', ['MUUI0001'], 'MUS', []]],
]]], new Map());
function streamPlay(name: string, slot: string | null = 'CallMusic\u0000' + name, vol = 0x400, pan = -1): Extract<UiSoundPlay, { kind: 'stream' }> {
  const r = TABLE.resolve(name);
  if (r.kind !== 'stream') throw new Error(name);
  return { kind: 'stream', source: 'zanim', resolution: r, vol, pan, slot };
}
/** Lets the music's reads and its pump run (each step a macrotask). */
const settle = async (n = 20): Promise<void> => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };

describe('the page\'s music: a MUS_ stream play (menuMusic.ts)', () => {
  it('changes scheduled stereo music to silence and back without restarting it',async()=>{
    let volume=MUSIC_VOLUME_DEFAULT;const matrices:StreamVoiceGains[]=[];const o=out();const make=o.voice;
    o.voice=()=>({...make(),setMix:g=>matrices.push(g)});
    const m=new MenuMusic({source:source(),out:()=>o,whenRunning:o.onRunning,musicVolume:()=>volume});
    m.streaming(true);m.play(streamPlay('MUS_ONLINE_MENU'));await settle();
    const before=o.voices[0]!.pieces.length;
    volume=0;m.refreshVolume();expect(matrices.at(-1)).toEqual(streamVoiceGains(0x400,-1,2,streamGroupMaster(0)));
    volume=.5;m.refreshVolume();expect(matrices.at(-1)).toEqual(streamVoiceGains(0x400,-1,2,streamGroupMaster(.5)));
    expect(o.voices).toHaveLength(1);expect(o.voices[0]!.pieces).toHaveLength(before);m.stop();
  });
  it('opens the member by range (the archive\'s index, then a buffer at a time; never the archive whole) and schedules it ahead of the clock', async () => {
    const src = source(), o = out();
    const m = new MenuMusic({ source: src, out: () => o, whenRunning: o.onRunning });
    m.streaming(true);
    expect(m.play(streamPlay('MUS_ONLINE_MENU'))).toBe(true);
    await settle();
    const s = m.stats().streams[0]!;
    expect([s.name, s.member, s.state, s.loop]).toEqual(['MUS_ONLINE_MENU', 'MUUI0003.VPK', 'playing', true]);
    expect(Math.max(...src.ranges.map(([, , n]) => n))).toBeLessThan(VAGSTORE.length);
    expect(src.ranges.every(([p]) => p === VAGSTORE_PATH)).toBe(true);
    // Scheduled back to back from the clock, at least the lead ahead (the clock stands at 0 here).
    const v = o.voices[0]!;
    expect(v.pieces[0]!.when).toBe(0);
    for (let i = 1; i < v.pieces.length; i++) expect(v.pieces[i]!.when).toBeCloseTo(v.pieces[i - 1]!.when + 56 / 32000, 9);
    expect(s.scheduledSeconds).toBeGreaterThanOrEqual(MENU_MUSIC_LEAD_SECONDS_ADAPTATION);
    // It loops (flags 4): past the 10 buffers of the pass, the wrap.
    expect(s.wraps).toBeGreaterThan(0);
    // The words: the member's place counted from VAGSTORE's first sector (its offset in the low half-word), 0x400, pan -1, group 1, loop.
    expect([s.words[1], s.words[2]! >>> 16, s.words[3], ...s.words.slice(4)]).toEqual([0, 0x400, 0xffff0000, 1, 0, 0, 4]);
    m.stop();
  });

  it('at the 989snd level: the left data hard left, the right hard right, through the music group\'s square law at MUSIC_VOLUME', async () => {
    const o = out();
    const m = new MenuMusic({ source: source(), out: () => o, whenRunning: o.onRunning, musicVolume: () => MUSIC_VOLUME_DEFAULT });
    m.streaming(true);
    m.play(streamPlay('MUS_ONLINE_MENU'));
    await settle();
    const g = streamVoiceGains(0x400, -1, 2, streamGroupMaster(MUSIC_VOLUME_DEFAULT));
    expect(m.stats().streams[0]!.gains).toEqual(g);
    const p = o.voices[0]!.pieces[0]!;
    expect(p.right.some((x) => x !== 0)).toBe(true);
    m.stop();
  });

  it('an unlooped member ends after its pass; a new play in the same name slot stops the slot\'s voice first (D:L112451-112455)', async () => {
    const o = out();
    const m = new MenuMusic({ source: source(), out: () => o, whenRunning: o.onRunning });
    m.streaming(true);
    m.play(streamPlay('MUS_SUCCESS'));
    await settle();
    expect(m.stats().streams[0]!.state).toBe('ended');
    expect(o.voices[0]!.pieces.length).toBe(2);
    m.play(streamPlay('MUS_ONLINE_MENU', 'A\u0000x'));
    await settle();
    m.play(streamPlay('MUS_ONLINE_MENU', 'A\u0000x'));
    await settle();
    expect(o.voices[1]!.stopped).toBe(true);
    expect(o.voices[2]!.stopped).toBe(false);
    expect(m.stats().streams.filter((s) => s.state === 'playing').length).toBe(1);
    m.stop();
  });

  it('StopAllSounds and VagStreaming(OFF) stop every stream; FadeAllSounds ramps them over 360 ticks (1.5 s) and leaves them playing', async () => {
    const o = out();
    const m = new MenuMusic({ source: source(), out: () => o, whenRunning: o.onRunning });
    m.streaming(true);
    m.play(streamPlay('MUS_ONLINE_MENU'));
    await settle();
    m.fadeAll();
    expect(o.voices[0]!.fades).toEqual([[FADE_ALL_TICKS + 1, 1.5]]);
    expect(m.stats().streams[0]!.state).toBe('playing');
    m.stopAll();
    expect(o.voices[0]!.stopped).toBe(true);
    m.play(streamPlay('MUS_ONLINE_MENU'));
    await settle();
    m.streaming(false);
    expect(o.voices[1]!.stopped).toBe(true);
    expect(m.stats().streams.every((s) => s.state === 'stopped')).toBe(true);
    m.stop();
  });

  it('a play while streaming is off is refused (STREAM_OFF_PLAY_READING); a source that can neither range nor stream is refused, never read whole', async () => {
    expect(STREAM_OFF_PLAY_READING).toBe('refused');
    const o = out();
    const m = new MenuMusic({ source: source(), out: () => o, whenRunning: o.onRunning });
    expect(m.play(streamPlay('MUS_ONLINE_MENU'))).toBe(false);
    expect(m.stats().refused.off).toBe(1);
    const whole: AssetSource = { list: async () => [], read: async () => { throw new Error('read whole'); } };
    const n = new MenuMusic({ source: whole, out: () => o, whenRunning: o.onRunning });
    n.streaming(true);
    n.play(streamPlay('MUS_ONLINE_MENU'));
    await settle();
    expect(n.stats().streams[0]!.state).toBe('failed');
    expect(n.stats().streams[0]!.error).toMatch(/range/);
  });

  it(`before the first gesture the stream waits, and starts from its top when the output runs (${MENU_MUSIC_GESTURE_ADAPTATION})`, async () => {
    const o = out(false);
    const m = new MenuMusic({ source: source(), out: () => o, whenRunning: o.onRunning });
    m.streaming(true);
    m.play(streamPlay('MUS_ONLINE_MENU'));
    await settle();
    expect(m.stats().streams[0]!.state).toBe('waiting');
    expect(o.voices.length).toBe(0);
    o.currentTime = 12;
    o.start();
    await settle();
    expect(m.stats().streams[0]!.state).toBe('playing');
    expect(o.voices[0]!.pieces[0]!.when).toBe(12);
    expect(m.stats().streams[0]!.startedAt).toBe(12);
    m.stop();
  });

  it('reads the lead before its first piece is scheduled: a slow read opens no gap at the start (no underrun)', async () => {
    const src = source(), o = out();
    let calls = 0;
    const slow: RangedAssetSource = { ...src, readRange: async (p, at, n) => { if (++calls <= 10) o.currentTime += 0.01; return src.readRange(p, at, n); } };   // a cold start: the first reads slow
    const m = new MenuMusic({ source: slow, out: () => o, whenRunning: o.onRunning, lead: 0.05 });
    m.streaming(true);
    m.play(streamPlay('MUS_ONLINE_MENU'));
    await settle();
    const s = m.stats().streams[0]!;
    expect(calls).toBeGreaterThan(20);
    expect(s.underruns).toBe(0);
    const v = o.voices[0]!;
    expect(v.pieces.length).toBeGreaterThan(20);
    for (let i = 1; i < v.pieces.length; i++) expect(v.pieces[i]!.when).toBeCloseTo(v.pieces[i - 1]!.when + 56 / 32000, 9);
    m.stop();
  });
});

describe('a name slot stopped or faded at its animation instance\'s end (PF-32; research 233 §3)', () => {
  it("the cues' stop and fade reach the music's name slot: StopSound at once; FadeOut(+4) over +4 x 240 ticks, the slot let go, the voice stopped at +4 s (FUN_0026fd20, FUN_00346dd0)", async () => {
    const o = out(), timers: [() => void, number][] = [];
    const m = new MenuMusic({ source: source(), out: () => o, whenRunning: o.onRunning, later: (run, seconds) => { timers.push([run, seconds]); } });
    m.streaming(true);
    m.play(streamPlay('MUS_ONLINE_MENU', 'ExitOnStart\u0000MUS_ONLINE_MENU'));
    m.play(streamPlay('MUS_ONLINE_MENU', 'Other\u0000MUS_ONLINE_MENU'));
    await settle();
    expect(o.voices.map((v) => v.stopped)).toEqual([false, false]);
    m.fadeSlot('ExitOnStart\u0000MUS_ONLINE_MENU', 1.5);
    expect(o.voices[0]!.fades).toEqual([[360 + 1, 1.5]]);           // 1.5 x 240 ticks (FUN_00346dd0's AutoVol)
    expect(timers.map(([, s]) => s)).toEqual([1.5]);
    expect(m.stats().streams[0]!.state).toBe('playing');
    m.stopSlot('ExitOnStart\u0000MUS_ONLINE_MENU');                 // let go of (FUN_00346d30): the slot holds it no more
    expect(o.voices[0]!.stopped).toBe(false);
    timers[0]![0]();                                                // the timer's end: StopSound (FUN_00346ea0)
    expect(o.voices[0]!.stopped).toBe(true);
    m.stopSlot('Other\u0000MUS_ONLINE_MENU');
    expect(o.voices[1]!.stopped).toBe(true);
    m.stopSlot('Nothing\u0000MUS_ONLINE_MENU');
    // An unmarked slot at its instance's end is let go (the handle zeroed, FUN_0026fd20 D:L118470): its loop plays on,
    // and the animation's next start in the same slot does not stop it (D:L112451-112455 find no handle).
    m.play(streamPlay('MUS_ONLINE_MENU', 'CallMusic\u0000MUS_ONLINE_MENU'));
    await settle();
    const first = o.voices.length - 1;
    m.releaseSlot('CallMusic\u0000MUS_ONLINE_MENU');
    m.play(streamPlay('MUS_ONLINE_MENU', 'CallMusic\u0000MUS_ONLINE_MENU'));
    await settle();
    expect(o.voices[first]!.stopped).toBe(false);
    expect(o.voices.length - 1).toBe(first + 1);
    // Through the page's output: the cues' stop and fade reach the music by slot.
    const calls: string[] = [];
    const music = {
      play: () => true, streaming: () => {}, stopAll: () => {}, fadeAll: () => {},
      stopSlot: (slot: string) => { calls.push(`stop ${slot}`); }, fadeSlot: (slot: string, sec: number) => { calls.push(`fade ${slot} ${sec}`); },
      releaseSlot: (slot: string) => { calls.push(`release ${slot}`); },
    };
    const ui = uiSoundOutput({ play: () => true, stopMusic: () => {} }, { music });
    ui.stop?.('a\u0000b'); ui.fade?.('c\u0000d', 2); ui.release?.('e\u0000f');
    expect(calls).toEqual(['stop a\u0000b', 'fade c\u0000d 2', 'release e\u0000f']);
    m.stop();
  });
});

describe('the page\'s UI sound output hands the music to the streamer (uiSoundHost.ts)', () => {
  it('a MUS_ stream play, VagStreaming, StopAllSounds and FadeAllSounds reach the music; a voice line stays counted', () => {
    const calls: string[] = [];
    const audio: UiSoundAudio = { play: () => true, stopMusic: () => { calls.push('stopMusic'); } };
    const music = {
      play: (p: Extract<UiSoundPlay, { kind: 'stream' }>) => { calls.push(`music ${p.resolution.name}`); return true; },
      streaming: (on: boolean) => { calls.push(`streaming ${on}`); }, stopAll: () => { calls.push('music stopAll'); }, fadeAll: () => { calls.push('music fadeAll'); },
    };
    const o = uiSoundOutput(audio, { music, stream: (p) => calls.push(`stream ${p.resolution.name}`) });
    const cues = new UiSoundCues(frontEndSoundTable(['SETS', ['SMUS', [[h('MUS_ONLINE_MENU'), 'ST', ['N1', ['MUUI0003'], 'MUS', []]]],
      'UIVOICE', [[h('^M51_140'), 'ST', ['N1', ['M51_140']]]]]], new Map()), { teletype: '', back: '', selection: '' }, [], o);
    cues.VagStreaming({ anim: 'A', sequence: 's', nodeIndex: 0, node: null, opcodeByte: 0, fn: 'VagStreaming', arg: 'ON', loc: 0, bytes: new Uint8Array(16) });
    cues.play('MUS_ONLINE_MENU', { volume: 1, pan: -1, pitchMod: 0 }, 'zanim');
    cues.play('^M51_140', { volume: 1, pan: -1, pitchMod: 0 }, 'zanim');
    cues.FadeAllSounds();
    cues.StopAllSounds();
    expect(calls).toEqual(['streaming true', 'music MUS_ONLINE_MENU', 'stream ^M51_140', 'music fadeAll', 'stopMusic', 'music stopAll']);
    expect(o.stats().streams).toBe(2);
  });
});

// The dev disc (W6.R8): `SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`; skipped without one.
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const HAVE_DISC = DISC !== '' && ['RUN/UI/READERC.ZAR', 'RUN/SOUNDRDR.ZAR', VAGSTORE_PATH].every((f) => existsSync(join(DISC, f)));

describe.skipIf(!HAVE_DISC)('the front end\'s music over the disc (SOCOM_DISC)', () => {
  it('a session on dlgWorldOfSOCOM.rdr: its start plays MUS_ONLINE_MENU, and the page\'s music opens MUUI0003.VPK from VAGSTORE and loops it; dlgMenu\'s opens none', async () => {
    const assets = new FsAssetSource(DISC);
    const disc = await readFrontEndDisc(assets);
    const { files } = await readUiSoundFiles(assets);
    const audio: UiSoundAudio = { play: () => true, stopMusic: () => {} };
    for (const [start, member] of [['dlgWorldOfSOCOM.rdr', 'MUUI0003.VPK'], ['dlgMenu.rdr', null]] as const) {
      const o = out();
      const music = new MenuMusic({ source: assets, out: () => o, whenRunning: o.onRunning, lead: 0.5 });
      const { cues } = makeUiSoundHost(files!, audio, { music });
      const s = new FrontEndSession({ disc, startDialog: start, loader: false, sounds: cues });
      let now = 0;
      for (let i = 0; i < 60; i++) s.advance(now += 1000 / 30);
      await settle(200);
      // A cold disc (a fresh volume on the box) can leave the stream still 'opening' at 200 ms: wait for 'playing', 2 s cap.
      for (let i = 0; i < 40 && music.stats().streams.some((x) => x.state !== 'playing'); i++) await settle(50);
      const live = music.stats().streams;
      if (member === null) { expect(live, start).toEqual([]); continue; }
      expect(live.map((x) => [x.name, x.member, x.state, x.loop]), start).toEqual([['MUS_ONLINE_MENU', member, 'playing', true]]);
      expect(live[0]!.buffers).toBeGreaterThan(0);
      expect(o.voices[0]!.pieces[0]!.left.length).toBe(0xb000 / 2 / 16 * 28);
      music.stop();
    }
  }, 120_000);
});
