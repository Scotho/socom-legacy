import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RangedAssetSource } from '@s2u/archive';
import { frontEndSoundTable, roundStreamGains, soundHash, type RenderedSound } from '@s2u/sound';
import type { UiSoundPlay } from '@s2u/ui';
import { buildZar, type KeySpec } from '../../scene/test/syntheticZar';
import { GameAudio, WebAudioOut } from '../src/audio';
import { frontEndMatchSound } from '../src/frontEnd';
import { MATCH_RETURN_MUSIC_PLACEHOLDER, MenuMusic, VAGSTORE_PATH, type MusicOut, type MusicVoice } from '../src/menuMusic';
import type { SoundData } from '../src/soundData';
import { pageDeviceClass, resetPageRendererProbeForTest } from '../src/deviceClass';

/**
 * MATCH-SOUND (web research 222 §7): the front end's half of the match's sound. The match plays on a `GameAudio` of
 * its own over the menus' `AudioContext` (`new WebAudioOut(shared)`: one context, unlocked by the menus' activation,
 * no second gesture) -- never the menus' `GameAudio`, so its map data does not replace HUDUI nor stop the menus' music
 * slot; it is let go at the match's release and close. The menus' music stops when the match's loading screen comes up
 * and plays again at the return (`MATCH_RETURN_MUSIC_PLACEHOLDER`). A fake context and a fake music output; no browser.
 */

interface Src { stopped: boolean }
class Ctx {
  static made: Ctx[] = [];
  state = 'running'; sampleRate = 48_000; currentTime = 0; destination = {};
  readonly sources: Src[] = [];
  constructor() { Ctx.made.push(this); }
  private node() { return { gain: { value: 1, setTargetAtTime() {}, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, setValueCurveAtTime() {} }, connect() {}, disconnect() {} }; }
  createGain() { return this.node(); }
  createChannelSplitter() { return this.node(); }
  createChannelMerger() { return this.node(); }
  createBuffer(_c: number, n: number, rate: number) { return { numberOfChannels: 2, length: n, sampleRate: rate, copyToChannel() {} }; }
  createBufferSource() {
    const s: Src = { stopped: false };
    this.sources.push(s);
    return { ...this.node(), buffer: null, onended: null, start() {}, stop() { s.stopped = true; } };
  }
  addEventListener() {}
  removeEventListener() {}
  resume(): Promise<void> { return Promise.resolve(); }
}
/** A map's sound data with no banks (`test/audio.test.ts`'s shape). */
const mp2 = (): SoundData => ({
  archive: 'MP2', banks: [], materials: [], params: [], weapons: [], callbacks: [], defaultMaterial: 0,
  beds: { outside: [], inside: [] }, emitters: [], reverb: { preset: null, indoor: [], outdoor: [] }, missing: [], streams: [],
} as unknown as SoundData);
const g = globalThis as unknown as { AudioContext?: unknown };
const was = g.AudioContext;
afterEach(() => { g.AudioContext = was; Ctx.made = []; });
const tone = (): RenderedSound => { const left = new Float32Array(64).fill(0.1); return { left, right: left.slice(), sendLeft: null, sendRight: null, sampleRate: 48_000, voices: 2, samples: [], peak: 0.1 }; };

describe('frontEndMatchSound: the match\'s own GameAudio on the menus\' output', () => {
  it('one AudioContext, already running: a GameAudio of the match\'s, not the menus\'', () => {
    g.AudioContext = Ctx;
    const out = new WebAudioOut(), menus = new GameAudio(out, undefined, { inline: false });
    out.prepare();
    const fe = frontEndMatchSound({ out, vars: () => null, music: null });
    const a = fe.audio()!;
    expect(a.game).not.toBe(menus);
    a.game.setData(mp2());
    expect(Ctx.made).toHaveLength(1);
    expect(a.game.stats().unlocked).toBe(true);                          // no second gesture
    expect(a.game.stats().map).toBe('MP2');
    expect(menus.stats().map).toBeNull();                                // the menus' data (HUDUI's) untouched
    a.release();
  });

  it('the menus\' music slot survives the match: its data, its end and its release stop only the match\'s', () => {
    g.AudioContext = Ctx;
    const out = new WebAudioOut();
    out.prepare();
    out.playMusic(tone(), 0, roundStreamGains(1, 2));                   // the menus' slot sounding
    const c = Ctx.made[0]!;
    const fe = frontEndMatchSound({ out, vars: () => null, music: null });
    const a = fe.audio()!;
    a.game.setData(mp2());
    a.game.setData(null);
    a.release();
    expect(c.sources[0]!.stopped).toBe(false);
  });

  it('no output of the page\'s own (the tests\' FrontEndAudio): no match audio, a silent match', () => {
    expect(frontEndMatchSound({ out: null, vars: () => null, music: null }).audio()).toBeUndefined();
  });

  it('the menus\' music held at the match\'s loading screen, let go at the return; settled after the returning dialog\'s start, replayed for the lobby only', () => {
    const calls: string[] = [];
    const music = { hold: (on: boolean) => { calls.push(`hold ${on}`); }, settleHeld: (replay: boolean) => { calls.push(`settle ${replay}`); } };
    const fe = frontEndMatchSound({ out: null, vars: () => null, music });
    fe.leave();
    fe.returned();
    fe.settled({ why: 'match-over', dialog: 'dlgGameLobby.rdr', client: null });
    fe.leave();
    fe.returned();
    fe.settled({ why: 'net-error', dialog: 'dlgNetError.rdr', client: null });
    expect(calls).toEqual(['hold true', 'hold false', 'settle true', 'hold true', 'hold false', 'settle false']);
  });

  it('a mount that throws: the match\'s output released, the error passed on', () => {
    g.AudioContext = Ctx;
    const out = new WebAudioOut();
    out.prepare();
    const fe = frontEndMatchSound({ out, vars: () => null, music: null });
    const release = vi.spyOn(WebAudioOut.prototype, 'dispose');
    expect(() => fe.start(() => { throw new Error('no canvas'); })).toThrow('no canvas');
    expect(release).toHaveBeenCalledTimes(1);
    release.mockRestore();
  });

  it('a mount that returns: the match\'s audio handed in, not released', () => {
    g.AudioContext = Ctx;
    const out = new WebAudioOut();
    out.prepare();
    const fe = frontEndMatchSound({ out, vars: () => null, music: null });
    const release = vi.spyOn(WebAudioOut.prototype, 'dispose');
    const got = fe.start((audio) => audio);
    expect(got?.game).toBeDefined();
    expect(release).not.toHaveBeenCalled();
    got!.release();
    release.mockRestore();
  });
});

/** A synthetic VPK (`test/menuMusic.test.ts`'s). */
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
const VAGSTORE = buildZar([{ name: 'MUUI0003.vpk', data: vpk(16 * 20, 64) }] satisfies KeySpec[]);
const source = (): RangedAssetSource => ({
  list: async () => [VAGSTORE_PATH], read: async (p) => { throw new Error(`read whole: ${p}`); },
  size: async () => VAGSTORE.length, readRange: async (_p, at, n) => VAGSTORE.slice(at, at + n),
});
function musicOut() {
  const voices: { stopped: boolean }[] = [];
  const o: MusicOut = {
    currentTime: 0, running: true,
    voice: (): MusicVoice => { const v = { stopped: false }; voices.push(v); return { play: () => {}, fade: () => {}, stop: () => { v.stopped = true; } }; },
  } as unknown as MusicOut;
  return { o, voices };
}
const h = (n: string): string => String(soundHash(n));
const TABLE = frontEndSoundTable(['SETS', ['SMUS', [[h('MUS_ONLINE_MENU'), 'ST', ['N1', ['MUUI0003'], 'LOOP', [], 'MUS', []]]]]], new Map());
const play = (): Extract<UiSoundPlay, { kind: 'stream' }> => {
  const r = TABLE.resolve('MUS_ONLINE_MENU');
  if (r.kind !== 'stream') throw new Error('MUS_ONLINE_MENU');
  return { kind: 'stream', source: 'zanim', resolution: r, vol: 0x400, pan: -1, slot: 'CallMusic' };
};
const settle = async (n = 20): Promise<void> => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };

describe('MenuMusic.hold: the menus\' music stopped for the match, played again at the lobby\'s return (MATCH_RETURN_MUSIC_PLACEHOLDER)', () => {
  const music = () => {
    const m = musicOut();
    const mm = new MenuMusic({ source: source(), out: () => m.o, whenRunning: () => {}, later: () => {} });
    mm.streaming(true);
    return { m, mm, playing: () => mm.stats().streams.filter((s) => s.state === 'playing' || s.state === 'opening') };
  };

  it('held: every stream stopped, no play taken; let go and settled for the lobby: the streams held started again, from their start', async () => {
    expect(MATCH_RETURN_MUSIC_PLACEHOLDER).toMatch(/start/);
    const { m, mm, playing } = music();
    mm.play(play());
    await settle();
    expect(playing()).toHaveLength(1);
    mm.hold(true);
    expect(m.voices[0]!.stopped).toBe(true);
    expect(playing()).toHaveLength(0);
    expect(mm.play(play())).toBe(false);                                 // the menus' scripts play nothing while the match runs
    mm.hold(false);
    expect(playing()).toHaveLength(0);                                   // nothing yet: the returning dialog's start comes first
    mm.settleHeld(true);
    await settle();
    expect(playing().map((s) => s.name)).toEqual(['MUS_ONLINE_MENU']);
    expect(m.voices).toHaveLength(2);
  });

  it('the returning dialog starts its own music: the held music is not played again (no double)', async () => {
    const { mm, playing } = music();
    mm.play({ ...play(), slot: null });
    await settle();
    mm.hold(true);
    mm.hold(false);
    mm.play({ ...play(), slot: null });                                  // the dialog's ONSTART, its own MUS_ stream
    mm.settleHeld(true);
    await settle();
    expect(playing()).toHaveLength(1);
  });

  it('a return that is not the lobby\'s (dlgNetError, its script silent): no held music', async () => {
    const { mm, playing } = music();
    mm.play(play());
    await settle();
    mm.hold(true);
    mm.hold(false);
    mm.settleHeld(false);
    await settle();
    expect(playing()).toHaveLength(0);
  });

  it('a faded stream (FadeAllSounds, a slot\'s fade) is silent: held, it is not started again audibly', async () => {
    for (const fade of ['all', 'slot'] as const) {
      const { mm, playing } = music();
      mm.play(play());
      await settle();
      if (fade === 'all') mm.fadeAll(); else mm.fadeSlot('CallMusic', 1);
      mm.hold(true);
      mm.hold(false);
      mm.settleHeld(true);
      await settle();
      expect(playing(), fade).toHaveLength(0);
    }
  });

  it("FE-SWEEP: a delayed binding's MUS_ after the replay (a slot of its own) stops the replayed stream first: one stream, the dialog's", async () => {
    const { m, mm, playing } = music();
    mm.play(play());                                                     // the lobby's MUS_ONLINE_MENU in CallMusic
    await settle();
    mm.hold(true);
    mm.hold(false);
    mm.settleHeld(true);                                                 // the 2-frame settle: no call yet, the held stream replayed
    await settle();
    expect(playing()).toHaveLength(1);
    const replayed = m.voices.at(-1)!;
    expect(mm.play({ ...play(), slot: 'LaterMusic' })).toBe(true);       // the dialog's own music, later, through another slot
    await settle();
    expect(replayed.stopped).toBe(true);
    expect(playing().map((s) => s.slot)).toEqual(['LaterMusic']);
    mm.play({ ...play(), slot: 'ThirdMusic' });                          // once the dialog has spoken, the guard is spent: slots as the original
    await settle();
    expect(playing()).toHaveLength(2);
  });

  it('FE-SWEEP: a StopAllSounds or FadeAllSounds after the replay ends the replayed stream; the guard ends with it', async () => {
    for (const call of ['stopAll', 'fadeAll'] as const) {
      const { mm, playing } = music();
      mm.play(play());
      await settle();
      mm.hold(true);
      mm.hold(false);
      mm.settleHeld(true);
      await settle();
      mm[call]();
      await settle();
      expect(playing(), call).toHaveLength(0);
    }
  });

  it('let go with nothing held, held twice, settled twice: nothing played twice', async () => {
    const { mm, playing } = music();
    mm.hold(false);
    mm.settleHeld(true);
    mm.play(play());
    await settle();
    mm.hold(true);
    mm.hold(true);
    mm.hold(false);
    mm.settleHeld(true);
    mm.settleHeld(true);
    await settle();
    expect(playing()).toHaveLength(1);
  });
});

describe('VS-10 F1 (the spec §4.4 item 2): the Xbox class releases the match\'s loop samples beside the saved pick', () => {
  /** A page the Xbox class by certain signals (VS.R1) with no pick saved (`test/frontEndSleep.test.ts`'s own). */
  const asXboxPage = (): (() => void) => {
    const gl = { getExtension: () => null, getParameter: () => 'ANGLE (AMD, AMD Custom GPU 0405 Direct3D11 vs_5_0 ps_5_0, D3D11)', RENDERER: 0x1f01 };
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; Xbox; Xbox One) Edg/130.0.2849.56' });
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => gl }) });
    resetPageRendererProbeForTest();
    return () => { vi.unstubAllGlobals(); resetPageRendererProbeForTest(); };
  };
  /** A loop warmed whole on the match's own output; true when its arrays were let go (LOOP_SAMPLES_RELEASE_ADAPTATION). */
  const released = (): boolean => {
    g.AudioContext = Ctx;
    const out = new WebAudioOut(null, { releaseLoopSamples: false });
    out.prepare();
    const a = frontEndMatchSound({ out, vars: () => null, music: null }).audio()!;
    const own = (a.game as unknown as { out: WebAudioOut }).out;
    const s = tone();
    while (!own.warm(s)) { /* whole */ }
    a.release();
    return s.left.length === 0;
  };

  it('the saved pick auto on a page classed xbox: released; the standard class: kept', () => {
    const undo = asXboxPage();
    try {
      expect(pageDeviceClass()).toBe('xbox');
      expect(released()).toBe(true);
    } finally { undo(); }
    expect(pageDeviceClass()).toBe('standard');
    expect(released()).toBe(false);
  });

  it('the menus\' output reads the class lazily: not at its construction (the front end\'s start probes no WebGL), once at its first loop let go', () => {
    g.AudioContext = Ctx;
    const decide = vi.fn(() => true);
    const out = new WebAudioOut(null, { releaseLoopSamples: decide });
    out.prepare();
    expect(decide).not.toHaveBeenCalled();
    const s = tone();
    while (!out.warm(s)) { /* whole */ }
    expect(decide).toHaveBeenCalledTimes(1);
    expect(s.left.length).toBe(0);
    const t = tone();
    while (!out.warm(t)) { /* whole */ }
    expect(decide).toHaveBeenCalledTimes(1);                                     // read once an output
  });

  it('the menus\' own output is built with the same decision', () => {
    const src = readFileSync(fileURLToPath(new URL('../src/frontEnd.ts', import.meta.url)), 'utf8');
    expect(src).toContain('const out = opts.audio ? null : new WebAudioOut(null, { releaseLoopSamples: xboxMemoryMeasures });');
    expect(src).toContain('const out = new WebAudioOut(o.out, { releaseLoopSamples: xboxMemoryMeasures() });');
  });
});
