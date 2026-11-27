import { describe, expect, it, vi } from 'vitest';
import { parseBankFile, renderSound, SampleCache, soundNameHash, type RenderedSound, type ReverbImpulse } from '@s2u/sound';
import { GameAudio, type AudioOut, type LoopHandle } from '../src/audio';
import { renderHost, workerRenderer, type OneShotRequest, type RenderHostMessage, type RenderWorker } from '../src/offThreadRender';
import type { SoundData } from '../src/soundData';

/**
 * OFF_THREAD_RENDER_ADAPTATION (`../src/offThreadRender`): the worker's mix is the page's mix, float for float; a play
 * through `GameAudio` with a renderer set hands the output the same sound the play at its call does, a little later;
 * and what is asked of banks since replaced, of a worker since failed, or while muted is not played.
 */

/** A 989snd bank file of one-TONE sounds over a one-block sample (`audio.parity.test.ts`'s builder). */
function bankFile(block: string, sounds: readonly { name: string; vol?: number; pan?: number }[], adsr: readonly [number, number] = [0x000f, 0]): Uint8Array {
  const n = sounds.length;
  const firstSound = 0x40, firstGrain = firstSound + 12 * n, pool = firstGrain + 8 * n, names = pool + 24;
  const buckets: number[][] = Array.from({ length: 32 }, () => []);
  sounds.forEach((s, i) => buckets[soundNameHash(s.name)]!.push(i));
  const entries = buckets.reduce((k, b) => k + (b.length ? b.length + 1 : 0), 0);
  const size = names + 0x58 + 20 * entries;
  const b = new Uint8Array(size), v = new DataView(b.buffer);
  b.set([0x53, 0x42, 0x6c, 0x6b]);
  v.setUint32(4, 3, true); v.setUint32(8, 0x104, true); b.set([0x54, 0x45, 0x53, 0x54], 0x0c);
  v.setInt16(0x16, n, true); v.setInt16(0x18, n, true); v.setInt16(0x1a, 1, true);
  v.setUint32(0x1c, firstSound, true); v.setUint32(0x20, firstGrain, true); v.setUint32(0x34, pool, true); v.setUint32(0x38, names, true);
  sounds.forEach((s, i) => {
    const o = firstSound + 12 * i;
    v.setInt8(o, s.vol ?? 100); v.setInt8(o + 1, 3); v.setInt16(o + 2, s.pan ?? 0, true); v.setInt8(o + 4, 1); v.setInt32(o + 8, 8 * i, true);
    v.setUint32(firstGrain + 8 * i, 1 << 24, true);
  });
  v.setInt8(pool + 1, 127); v.setInt8(pool + 2, -60); v.setInt8(pool + 7, 127); v.setUint16(pool + 10, adsr[0], true); v.setUint16(pool + 12, adsr[1], true);
  v.setUint16(pool + 14, 1, true);                                    // into the reverb: all four channels
  for (let i = 0; i < Math.min(8, block.length); i++) b[names + i] = block.charCodeAt(i);
  v.setUint32(names + 8, 0x58, true);
  let e = 0;
  for (let k = 0; k < 32; k++) {
    if (!buckets[k]!.length) { v.setInt16(names + 0x18 + 2 * k, -1, true); continue; }
    v.setInt16(names + 0x18 + 2 * k, e, true);
    for (const i of buckets[k]!) {
      const o = names + 0x58 + 20 * e++;
      for (let c = 0; c < Math.min(16, sounds[i]!.name.length); c++) b[o + c] = sounds[i]!.name.charCodeAt(c);
      v.setInt16(o + 16, i, true);
    }
    e++;
  }
  const vag = new Uint8Array(16); vag[0] = 0x0c; vag[1] = 1; vag.fill(0x11, 2);
  // Inside a larger buffer, as a disc member's bytes are: a posted view would carry all of it.
  const whole = new Uint8Array(64 + 24 + size + 16), file = whole.subarray(64), f = new DataView(whole.buffer, 64);
  f.setUint32(0, 3, true); f.setUint32(4, 2, true); f.setUint32(8, 24, true); f.setUint32(12, size, true); f.setUint32(16, 24 + size, true); f.setUint32(20, 16, true);
  file.set(b, 24); file.set(vag, 24 + size);
  return file;
}

/** The page's renderer and the worker's host joined by queues: nothing is delivered until `flush`. */
function link() {
  const queue: (() => void)[] = [], posted: RenderHostMessage[] = [];
  const worker: RenderWorker = { onmessage: null, onerror: null, terminate: vi.fn(),
    postMessage(message) { posted.push(message); queue.push(() => host(message)); } };
  const host = renderHost(reply => { queue.push(() => worker.onmessage?.({ data: reply })); }, () => 0.5);
  let clock = 0;
  const renderer = workerRenderer(worker, () => clock);
  return { renderer, worker, posted, flush: (ms = 0) => { clock += ms; while (queue.length) queue.shift()!(); } };
}
const floats = (sound: RenderedSound) => ({ left: [...sound.left], right: [...sound.right], sendLeft: sound.sendLeft && [...sound.sendLeft], sendRight: sound.sendRight && [...sound.sendRight] });
const FILE = bankFile('TEST_AM', [{ name: '.SHOT' }, { name: '.STEP', vol: 60, pan: 40 }]);
const request = (over: Partial<OneShotRequest> = {}): OneShotRequest => ({ bank: 0, index: 0, vol: 0x400, pan: 0, globals: [], modifier: 0x400, ...over });
const here = (r: OneShotRequest): RenderedSound => { const bank = parseBankFile(FILE);
  return renderSound(bank, r.index, new SampleCache(bank.vag), { vol: r.vol, pan: r.pan, globals: r.globals, modifier: r.modifier, random: () => 0.5, state: new Map() }); };

describe('the worker\'s render is the page\'s render', () => {
  it('mixes every asked sound to the same floats, voices and peak, at each volume and pan', () => {
    const { renderer, flush } = link();
    renderer.setBanks([FILE]);
    for (const r of [request(), request({ vol: 0x123, pan: 90 }), request({ index: 1, vol: 0x3ff, pan: 270 }), request({ index: 1, modifier: null })]) {
      let got: RenderedSound | null | undefined;
      expect(renderer.render(r, sound => { got = sound && { ...sound, ...floats(sound) } as never; })).toBe(true);
      expect(got).toBeUndefined();
      flush();
      const control = here(r);
      expect(got).toMatchObject({ ...floats(control), sampleRate: control.sampleRate, voices: control.voices, peak: control.peak });
      expect(control.peak).toBeGreaterThan(0);
      expect(control.sendLeft).not.toBeNull();
    }
    expect(renderer.stats()).toMatchObject({ asked: 4, played: 4, failed: 0, waitingMax: 1 });
  });
  it('sends the banks as copies of their own bytes, and the mixes\' storage back for the next render, which is as exact', () => {
    const { renderer, posted, flush } = link();
    renderer.setBanks([FILE]);
    const sent = posted[0] as Extract<RenderHostMessage, { type: 'banks' }>;
    expect(sent.files[0]!.buffer).not.toBe(FILE.buffer);
    expect(sent.files[0]!.buffer.byteLength).toBe(FILE.byteLength);
    const buffers: ArrayBufferLike[] = [];
    renderer.render(request(), sound => { buffers.push(sound!.left.buffer); sound!.left.fill(9); });
    flush();
    expect(posted.at(-1)).toMatchObject({ type: 'recycle' });
    let again: ReturnType<typeof floats> | null = null;
    renderer.render(request({ vol: 0x200 }), sound => { buffers.push(sound!.left.buffer, sound!.right.buffer, sound!.sendLeft!.buffer, sound!.sendRight!.buffer); again = floats(sound!); });
    flush();
    expect(buffers.slice(1)).toContain(buffers[0]);
    expect(new Set(buffers.slice(1)).size).toBe(4);
    expect(again).toEqual(floats(here(request({ vol: 0x200 }))));
  });
  it('answers null for a bank it does not hold, and lets go of what was asked of banks since replaced', () => {
    const { renderer, flush } = link();
    renderer.setBanks([FILE]);
    const got: (RenderedSound | null)[] = [];
    renderer.render(request({ bank: 3 }), sound => got.push(sound));
    flush();
    expect(got).toEqual([null]);
    renderer.render(request(), sound => got.push(sound));
    renderer.setBanks([FILE]);
    expect(got).toEqual([null, null]);
    flush();
    expect(got).toEqual([null, null]);
    renderer.render(request(), sound => got.push(sound));
    flush(12);
    expect(got[2]).not.toBeNull();
    expect(renderer.stats()).toMatchObject({ asked: 3, played: 1, failed: 2, waitMeanMs: 12, waitMaxMs: 12 });
  });
  it('a worker that fails answers what waits with null, takes nothing more, and is stopped once', () => {
    const { renderer, worker, flush } = link();
    renderer.setBanks([FILE]);
    const got: (RenderedSound | null)[] = [];
    renderer.render(request(), sound => got.push(sound));
    worker.onerror?.(new Error('gone'));
    expect(got).toEqual([null]);
    expect(renderer.render(request(), sound => got.push(sound))).toBe(false);
    flush(); renderer.dispose();
    expect(got).toEqual([null]);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
});

class Recorder implements AudioOut {
  unlocked = true;
  played: ReturnType<typeof floats>[] = [];
  get state(): string { return 'running'; }
  unlock(): void { this.unlocked = true; }
  setGain(): void { /* the master */ }
  play(sound: RenderedSound): void { this.played.push(floats(sound)); }
  setReverb(_ir: ReverbImpulse | null): void { /* none */ }
  rampReverb(): void { /* none */ }
  loop(): LoopHandle | null { return null; }
}
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const data = (): SoundData => ({
  archive: 'TEST', banks: [{ file: 'TEST_am.bnk', bytes: FILE }], materials: [], params: [], weapons: [], callbacks: [], callbackVolumes: [],
  defaultMaterial: 0, beds: { outside: [], inside: [] }, emitters: [], reverb: { preset: null, indoor: [], outdoor: [] }, missing: [],
} as unknown as SoundData);
function game() {
  const out = new Recorder(), audio = new GameAudio(out, () => 0.5);
  audio.setData(data()); audio.setListener(IDENTITY);
  return { out, audio };
}

describe('GameAudio with a renderer set', () => {
  it('plays the same sound as the play at its call, when the worker\'s mix comes back; the play is counted at its call', () => {
    const control = game();
    expect(control.audio.play('.SHOT', [3, 0, -4])).toBe(true);
    expect(control.audio.play('.STEP', null, 'play', 0.5)).toBe(true);
    const { out, audio } = game(), { renderer, flush } = link();
    audio.setOffThreadRenderer(renderer);
    expect(audio.play('.SHOT', [3, 0, -4])).toBe(true);
    expect(audio.play('.STEP', null, 'play', 0.5)).toBe(true);
    expect(out.played).toHaveLength(0);
    expect(audio.stats().played).toBe(2);
    expect(audio.stats().recent.map(r => [r.name, r.vol, r.pan])).toEqual(control.audio.stats().recent.map(r => [r.name, r.vol, r.pan]));
    flush();
    expect(out.played).toEqual(control.out.played);
    expect(out.played[0]!.left.some(x => x !== 0)).toBe(true);
    expect(audio.stats().recent.map(r => [r.seconds, r.voices])).toEqual(control.audio.stats().recent.map(r => [r.seconds, r.voices]));
    expect(audio.stats().render).toMatchObject({ renders: 0, offThread: { asked: 2, played: 2, failed: 0 } });
    expect(control.audio.stats().render).toMatchObject({ renders: 2, offThread: null });
  });
  it('does not play a mix asked of the last map\'s banks, nor one that comes back to a muted page', () => {
    const { out, audio } = game(), { renderer, flush } = link();
    audio.setOffThreadRenderer(renderer);
    audio.play('.SHOT');
    audio.setData(data());
    flush();
    expect(out.played).toHaveLength(0);
    audio.play('.SHOT');
    audio.setMuted(true);
    flush();
    expect(out.played).toHaveLength(0);
    audio.setMuted(false);
    audio.play('.SHOT');
    flush();
    expect(out.played).toHaveLength(1);
  });
  it('renders at the call again once the renderer is let go, or when it takes nothing; an ambience layer\'s gain always does', () => {
    const { out, audio } = game(), { renderer, worker, flush } = link();
    audio.setOffThreadRenderer(renderer);
    audio.play('.SHOT', null, 'ambience', 1, 0.5);
    expect(out.played).toHaveLength(1);
    worker.onerror?.(new Error('gone'));
    audio.play('.SHOT');
    expect(out.played).toHaveLength(2);
    audio.setOffThreadRenderer(null);
    audio.play('.SHOT');
    flush();
    expect(out.played).toHaveLength(3);
    expect(out.played[2]).toEqual(out.played[1]);
  });
});

describe('the page\'s warm-up with a renderer set', () => {
  it('decodes no sample ahead on the page: the worker holds the one-shots\' samples', () => {
    const warmed = game();
    for (let i = 0; i < 50; i++) warmed.audio.pump();
    const { audio } = game(), { renderer } = link();
    audio.setOffThreadRenderer(renderer);
    audio.setData(data());
    for (let i = 0; i < 50; i++) audio.pump();
    expect(audio.stats().decode.pending).toBe(0);
    expect(audio.stats().decoded).toBe(0);
    expect(audio.stats().decoded).toBeLessThanOrEqual(warmed.audio.stats().decoded);
  });
});

describe('a round\'s reset with a mix still on its way', () => {
  it('does not play what was asked before `stopTransient`; what is asked after it plays', () => {
    const { out, audio } = game(), { renderer, flush } = link();
    audio.setOffThreadRenderer(renderer);
    audio.play('.SHOT');
    audio.stopTransient();
    flush();
    expect(out.played).toHaveLength(0);
    audio.play('.SHOT');
    flush();
    expect(out.played).toHaveLength(1);
  });
});

/**
 * XBOX-INTEGRATE review F1 (LATER 1220 (a)'s instance limit, `FUN_0000d3b0`, kept on the opt-in worker path): a play
 * stolen while its worker mix is still pending does not sound when the mix comes back -- the same one voice as the
 * page-thread path. The bank's one sound carries `.MOVING_THRU_FO`'s rule (instance limit 1, flags 0x18: a louder play
 * steals a quieter one).
 */
describe('XBOX-INTEGRATE review F1: an instance stolen while its worker mix is pending stays stopped', () => {
  class Voices implements AudioOut {
    unlocked = true; played = 0; stopped = 0;
    get state(): string { return 'running'; }
    unlock(): void { /* open */ }
    setGain(): void { /* the master */ }
    play(_s: RenderedSound) { this.played++; return { stop: () => { this.stopped++; } }; }
    setReverb(_ir: ReverbImpulse | null): void { /* none */ }
    rampReverb(): void { /* none */ }
    loop(): LoopHandle | null { return null; }
  }
  const LIMITED = bankFile('TEST_AM', [{ name: '.RUSTLE' }]);
  { const bnk = LIMITED.subarray(24); bnk[0x40 + 5] = 1; bnk[0x40 + 6] = 0x18; }
  const limited = (): SoundData => ({ ...data(), banks: [{ file: 'TEST_am.bnk', bytes: LIMITED }] } as unknown as SoundData);
  for (const offThread of [false, true]) {
    it(`a quieter play then a louder one: one voice sounding (${offThread ? 'the worker' : 'the page thread'})`, () => {
      expect(parseBankFile(LIMITED).sounds[0]).toMatchObject({ instanceLimit: 1, flags: 0x18 });
      const out = new Voices(), audio = new GameAudio(out, () => 0.5, { now: () => 0 });
      audio.setData(limited()); audio.setListener(IDENTITY);
      const { renderer, flush } = link();
      if (offThread) audio.setOffThreadRenderer(renderer);
      expect(audio.play('.RUSTLE', null, 'play', 0.3)).toBe(true);
      expect(audio.play('.RUSTLE', null, 'play', 1)).toBe(true);
      flush();
      expect(out.played - out.stopped).toBe(1);
    });
  }
});
