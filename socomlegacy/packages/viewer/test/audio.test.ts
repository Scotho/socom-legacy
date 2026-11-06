import { describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FsAssetSource } from '@s2u/archive/node';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import { parseSceneGraph, worldCollision } from '@s2u/scene';
import { BANK_GROUP_READING, PAN_RESET, roundStreamGains, SLOT_FADE_TICKS, soundNameHash, TUNER_DEFAULTS, type RenderedSound, type ReverbImpulse, type StreamTuners, type StreamVoiceGains } from '@s2u/sound';
import {
  GameAudio, LISTENING_GAIN_PLACEHOLDER, LOOP_SECONDS_PLACEHOLDER, loopMasterGain, MUSIC_SLOT_HANDOVER_SECONDS, panGains, WebAudioOut,
  type AudioOut, type LoopHandle,
} from '../src/audio';
import { ambienceLoops, emitterPosition, LADDER_SLIDE_SOUND, loopKey, renderAmbienceLoops, SOUND_STREAMS_PATH, soundFromDisc, type SoundData } from '../src/soundData';
import { WalkSounds, type WalkSignals } from '../src/walkSounds';
import type { AnimStats } from '../src/animator';
import { footfallsHeard } from '../src/remotePlayers';
import { BodyFlag, type BodyState } from '../src/net/protocol';

const fixtures = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'));
const haveSound = existsSync(resolve(fixtures, 'RUN/SOUNDS/BNKSTORE.ZAR')) && existsSync(resolve(fixtures, 'RUN/MP2.ZDB'));

/** An output that records what it was handed. */
class Recorder implements AudioOut {
  unlocked = false;
  gain = -1;
  played: RenderedSound[] = [];
  reverb: ReverbImpulse | null = null;
  ramps: [number, number][] = [];
  loops: { sound: RenderedSound; gains: [number, number]; stopped: boolean }[] = [];
  get state(): string { return this.unlocked ? 'running' : 'locked'; }
  unlock(): void { this.unlocked = true; }
  setGain(gain: number): void { this.gain = gain; }
  play(sound: RenderedSound): void { this.played.push(sound); }
  setReverb(ir: ReverbImpulse | null): void { this.reverb = ir; }
  rampReverb(depth: number, seconds: number): void { this.ramps.push([depth, seconds]); }
  loop(sound: RenderedSound): LoopHandle {
    const l = { sound, gains: [0, 0] as [number, number], stopped: false };
    this.loops.push(l);
    return { setGains: (left, right) => { l.gains = [left, right]; }, stop: () => { l.stopped = true; } };
  }
  /** Research 124: the streams, the music slot's plays (with their handover) and its stops. */
  streams: RenderedSound[] = [];
  /** Each stream's and each slot cue's gains, in play order (research 186 §3.1: the group's level). */
  streamGains: StreamVoiceGains[] = [];
  musicGains: StreamVoiceGains[] = [];
  music: { sound: RenderedSound; handover: number }[] = [];
  musicStops = 0;
  playStream(sound: RenderedSound, gains?: StreamVoiceGains): void { this.streams.push(sound); if (gains) this.streamGains.push(gains); }
  playMusic(sound: RenderedSound, handover: number, gains?: StreamVoiceGains): void { this.music.push({ sound, handover }); if (gains) this.musicGains.push(gains); }
  stopMusic(): void { this.musicStops++; }
}

const seeded = (seed: number) => (): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x80000000; };
/** A camera at the origin looking down -z (three.js's identity world matrix). */
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const STONE = 7;

let data: SoundData | null | undefined;
async function mp2(): Promise<SoundData> {
  if (data === undefined) data = await soundFromDisc(new FsAssetSource(fixtures), 'RUN/MP2.ZDB', 'MP2');
  if (!data) throw new Error('no sound data');
  return data;
}

/**
 * PAR-89 (research 305, from Chris's PR #90): the dry trigger's `.GUN_EMPTY` (`FUN_005c0fd0` D:L476617-476620, the kit's
 * handle +0x88c set from ELF 0x65f8f8 by `FUN_005c7e00` D:L480569-480570) through the unplaced play (vtable +0xc,
 * research 122 R122.4); and the slide's `~LADDER_SLIDE` (ELF 0x65f558), one local placed handle held while the top action
 * is "Ladderslide" (`FUN_00550ef0` D:L418407-418422), stopped and released on its end (D:L418408-418413).
 */
describe("the empty click and the ladder slide's loop (PAR-89, research 305)", () => {
  const dry = { type: 'dry' as const, weapon: { name: 'M4A1', id: 61, fireAnim: '', sounds: { close: null, med: null, far: null, reload: null } } };
  const signals: WalkSignals = { feet: () => [20000, 0, 0], grid: () => null, walking: () => true, stance: () => 'stand', wish: () => ({ forward: 0, right: 0 }) };

  it.skipIf(!haveSound)("a dry trigger plays the map's own .GUN_EMPTY unplaced, once per dry event, and no round or reload", async () => {
    const out = new Recorder(), audio = new GameAudio(out);
    audio.setData(await mp2()); out.unlock(); audio.setListener(IDENTITY);
    const sounds = new WalkSounds(audio, signals);
    sounds.fireEvent(dry);
    expect(audio.stats().byName['.GUN_EMPTY']).toBe(1);
    // Unplaced: the bank's own pan (PAN_RESET), full volume -- heard though the feet are 20000 units off.
    expect(audio.stats().recent.at(-1)).toMatchObject({ name: '.GUN_EMPTY', pan: PAN_RESET, vol: 1024 });
    expect(out.played).toHaveLength(1);
    sounds.fireEvent(dry);
    expect(audio.stats().byName['.GUN_EMPTY']).toBe(2);
    expect(out.played).toHaveLength(2);
    expect(sounds.counts.rounds).toBe(0);
    expect(sounds.counts.reloads).toBe(0);
  });

  it.skipIf(!haveSound)('the slide is one placed loop: started once, following its place, stopped on null, stopTransient and setData', async () => {
    const out = new Recorder(), audio = new GameAudio(out);
    audio.setData(await mp2()); out.unlock(); audio.setListener(IDENTITY);
    audio.setLadderSlide([10, 0, -10]);
    expect(out.loops).toHaveLength(1);
    const loop = out.loops[0]!, first = [...loop.gains];
    expect(first[0]).toBeGreaterThan(0);
    expect(first[1]).toBeGreaterThan(first[0]!);                             // to the right: the right side louder
    audio.setLadderSlide([-10, 0, -10]);
    expect(out.loops).toHaveLength(1);                                       // the same handle, moved
    expect(loop.gains[0]).toBeGreaterThan(loop.gains[1]);
    audio.setLadderSlide([0, 0, -150]);                                      // past RANGE's 100: silent, still held
    expect(loop.gains.every((g) => g === 0)).toBe(true);
    expect(loop.stopped).toBe(false);
    expect(audio.stats().ladderSlide).toBe(true);
    audio.setLadderSlide(null);
    expect(loop.stopped).toBe(true);
    expect(audio.stats().ladderSlide).toBe(false);
    audio.setLadderSlide([0, 0, -10]);
    const next = out.loops.at(-1)!;
    expect(next).not.toBe(loop);
    audio.stopTransient(); expect(next.stopped).toBe(true);
    audio.setLadderSlide([0, 0, -10]);
    const last = out.loops.at(-1)!;
    audio.setData(null); expect(last.stopped).toBe(true);
    expect(audio.stats().ladderSlide).toBe(false);
  });

  it.skipIf(!haveSound)("the slide's end keys it off through its tone's release (StopSound); the tail finishes, a new slide leaves it, a teardown ends it", async () => {
    // Review F2 (2026-10-14): a new play (D:L418415-418418) does not touch the old voice, which StopSound left to its
    // release; the port frees a released loop once its release has run, not at the next slide.
    class Releasing extends Recorder {
      released: { curve: Float32Array; seconds: number }[] = [];
      override loop(sound: RenderedSound): LoopHandle {
        const h = super.loop(sound);
        return { ...h, release: (curve, seconds) => { this.released.push({ curve, seconds }); } };
      }
    }
    let t = 100;
    const out = new Releasing(), audio = new GameAudio(out, undefined, { now: () => t });
    audio.setData(await mp2()); out.unlock(); audio.setListener(IDENTITY);
    audio.setLadderSlide([0, 0, -10]);
    const first = out.loops[0]!;
    audio.setLadderSlide(null);
    expect(out.released).toHaveLength(1);
    const { curve, seconds } = out.released[0]!;
    expect(curve.length).toBeGreaterThan(0);
    expect(seconds).toBeGreaterThan(0);
    expect(first.stopped).toBe(false);                                       // still sounding its release
    expect(audio.stats().ladderSlide).toBe(false);
    audio.setLadderSlide([0, 0, -10]);                                       // a new slide at once
    expect(first.stopped).toBe(false);                                       // leaves the old tail to finish
    const second = out.loops.at(-1)!;
    expect(second).not.toBe(first);
    t += seconds / 2; audio.setListener(IDENTITY);
    expect(first.stopped).toBe(false);
    t += seconds; audio.setListener(IDENTITY);
    expect(first.stopped).toBe(true);                                        // freed once its release has run
    expect(second.stopped).toBe(false);                                      // the held slide is untouched
    audio.setLadderSlide(null);
    expect(second.stopped).toBe(false);
    audio.stopTransient();
    expect(second.stopped).toBe(true);                                       // a teardown ends a tail at once
  });

  it.skipIf(!haveSound)('a map whose banks lack ~LADDER_SLIDE gets no loop and no stand-in', async () => {
    const full = await mp2();
    // MP2 without its own _am bank (the one that holds ~LADDER_SLIDE): the other banks keep theirs.
    const lacking: SoundData = { ...full, banks: full.banks.filter((b) => !/_am\.bnk$/i.test(b.file)) };
    const out = new Recorder(), audio = new GameAudio(out);
    audio.setData(lacking); out.unlock(); audio.setListener(IDENTITY);
    audio.setLadderSlide([0, 0, -10]);
    expect(out.loops).toHaveLength(0);
    expect(audio.stats().ladderSlide).toBe(false);
    expect(audio.stats().played).toBe(0);
  });

  it.skipIf(!haveSound)("the worker renders the slide's loop with the beds; the page plays only that render", async () => {
    const full = await mp2();
    const bare: SoundData = { ...full, beds: { outside: [], inside: [] }, layers: { outside: [], inside: [] }, emitters: [] };
    expect(ambienceLoops(bare).map((l) => l.name)).toEqual([LADDER_SLIDE_SOUND]);
    const out = new Recorder(), audio = new GameAudio(out, () => 0.5, { inline: false });
    audio.setData(bare); out.unlock(); audio.setListener(IDENTITY);
    audio.setLadderSlide([0, 0, -10]);
    expect(audio.stats().ladderSlide).toBe(false);                           // no worker render yet: nothing on the page's thread
    audio.setLadderSlide(null);
    const loops = renderAmbienceLoops(bare, 1, 0.02);
    expect(loops.map((l) => l.name)).toContain(loopKey(LADDER_SLIDE_SOUND, 1));
    audio.setLoops(loops);
    expect(audio.stats().ladderSlide).toBe(false);                           // the slide ended before the render came
    audio.setLadderSlide([0, 0, -10]);
    expect(audio.stats().ladderSlide).toBe(true);
    audio.stopTransient(); expect(audio.stats().ladderSlide).toBe(false);
  });
});

describe("the footfall cap leaves the page's own steps alone (PF-25; FUN_00552850)", () => {
  it("the page's own footfalls are never capped (L418860)", () => {
    // Four others nearer than 500 u: the cap's three slots are spent on others (`footfallsHeard`), and the page's own
    // walk (`WalkSounds`, never ranked) still sounds every step -- FUN_00552850 sets the viewer's own bit always.
    const other = (id: number, x: number): BodyState => ({ id, feet: [x, 0, 0], flags: BodyFlag.Alive }) as BodyState;
    expect([...footfallsHeard([other(2, 10), other(3, 20), other(4, 30), other(5, 40)], [0, 0, 0])!].sort()).toEqual([2, 3, 4]);
    const steps: unknown[] = [];
    const audio = { setAmbience: () => {}, onFootstep: (...a: unknown[]) => { steps.push(a); return '.STEP'; } } as unknown as GameAudio;
    const sounds = new WalkSounds(audio, {
      walking: () => true, feet: () => [0, 0, 0], stance: () => 'stand', wish: () => ({ forward: 1, right: 0 }), grid: () => null,
    });
    for (let i = 0; i < 8; i++) sounds.playEvent({ kind: 'footfall', foot: i % 2 ? 'right' : 'left', clip: 'seal_run', position: [0, 0.5, 0] });
    expect(sounds.counts.footfalls).toBe(8);
    expect(steps).toHaveLength(8);
  });
});

describe('a tree with no sound archives', () => {
  it('says so in the stats and warns once', async () => {
    const empty = mkdtempSync(resolve(tmpdir(), 's2u-nosound-'));
    const d = await soundFromDisc(new FsAssetSource(empty), 'RUN/MP2.ZDB', 'MP2');
    expect(d.banks).toEqual([]);
    expect(d.missing[0]).toMatch(/^RUN\/SOUNDS\/BNKSTORE\.ZAR: /);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const audio = new GameAudio(new Recorder());
    audio.setData(d);
    audio.setData(d);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
    expect(audio.stats().missing[0]).toMatch(/BNKSTORE/);
    expect(audio.onFootstep(7, null)).toBeNull();
  });
});

describe('where an emitter sounds (SOUND, FUN_002659c0; research 90 item 26)', () => {
  it('takes its offset through its node, or, when the scene has no such node, as a world position', () => {
    // A node turned a quarter about y (column-major, as flattenScene gives it) at (100, 5, -40).
    const world = [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 100, 5, -40, 1];
    expect(emitterPosition(world, [0, -60, 30])).toEqual([130, -55, -40]);
    expect(emitterPosition(world, undefined)).toEqual([100, 5, -40]);
    // Vigilance's `pipe`: no node -- the game's flag 4 offset is the place (0, -60, 30).
    expect(emitterPosition(null, [0, -60, 30])).toEqual([0, -60, 30]);
    // No node and no offset: the game plays it without a place, which the emitters do not model.
    expect(emitterPosition(null, undefined)).toBeNull();
  });
});

describe('the output controls', () => {
  it('sets the gain from the volume and the mute', () => {
    const out = new Recorder(), audio = new GameAudio(out);
    expect(out.gain).toBe(LISTENING_GAIN_PLACEHOLDER);
    audio.setVolume(0.5);
    expect(out.gain).toBe(LISTENING_GAIN_PLACEHOLDER / 2);
    audio.setMuted(true);
    expect(out.gain).toBe(0);
    expect(audio.stats()).toMatchObject({ muted: true, volume: 0.5, unlocked: false, state: 'locked', banks: [] });
    audio.setMuted(false);
    expect(out.gain).toBe(LISTENING_GAIN_PLACEHOLDER / 2);
  });
  it('unlocks on the first gesture', () => {
    const out = new Recorder(), audio = new GameAudio(out), target = new EventTarget();
    audio.unlockOn(target);
    target.dispatchEvent(new Event('keydown'));
    expect(audio.stats().unlocked).toBe(true);
  });
  it('a press a later key capture swallows still unlocks: the unlock listens first', () => {
    const out = new Recorder(), audio = new GameAudio(out), target = new EventTarget();
    audio.unlockOn(target);
    target.addEventListener('keydown', (e) => e.stopImmediatePropagation(), { capture: true });   // the loading screen's hold
    target.dispatchEvent(new Event('keydown'));
    expect(audio.stats().unlocked).toBe(true);
  });
  it('main.ts registers the unlock on the window before any key or pointer listener there that can swallow the press', () => {
    // The page's own window captures (the loading screen's hold, the ARMORY, WEAPON EXCHANGE) stop a key with
    // `stopImmediatePropagation`, which silences every listener on the window registered after them: an unlock behind
    // them never hears a key pressed while the loading screen holds the input, and the page stays silent until the next
    // press (remoteCombat.spec.ts's audio unlock, 2026-10-05). The unlock is a browser adaptation, no game input: first.
    const main = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/main.ts'), 'utf8');
    const unlock = main.search(/\baudio\.unlockOn\(globalThis\)|\bgameAudio\.unlockOn\(globalThis\)/);
    expect(unlock).toBeGreaterThan(-1);
    const listeners = [...main.matchAll(/globalThis\.addEventListener\??\.?\(\s*'(key|pointer|touch)\w*'/g)].map((m) => m.index!);
    expect(listeners.length).toBeGreaterThan(0);
    for (const at of listeners) expect(unlock, main.slice(at, at + 80)).toBeLessThan(at);
  });
  it('makes the output at page start, off the gesture, so a click before the banks only resumes it (90 item 27)', () => {
    vi.useFakeTimers();
    try {
      const calls: string[] = [];
      const out = new (class extends Recorder {
        ready = false;
        prepare(): void { calls.push('prepare'); this.ready = true; }
        override unlock(): void { calls.push(this.ready ? 'resume' : 'make'); super.unlock(); }
      })();
      const audio = new GameAudio(out), target = new EventTarget();
      audio.unlockOn(target);
      expect(calls).toEqual([]);                          // not inside the page's first synchronous work
      vi.runAllTimers();
      expect(calls).toEqual(['prepare']);                 // before any map's banks (no setData yet)
      target.dispatchEvent(new Event('pointerdown'));
      expect(calls).toEqual(['prepare', 'resume']);
      expect(audio.stats().unlocked).toBe(true);
    } finally { vi.useRealTimers(); }
  });

  /**
   * `unlocked` is "the context runs", not "a gesture was seen": a touch `pointerdown` or an Escape is no user activation
   * in Chromium, so its `resume()` stays pending until a later event; plays until then are counted as locked, and a
   * rejected resume is warned once and kept in the stats.
   */
  class StubContext {
    static last: StubContext | null = null;
    state = 'suspended';
    sampleRate = 48_000;
    currentTime = 0;
    destination = {};
    settle: { resolve: () => void; reject: (e: unknown) => void } | null = null;
    constructor() { StubContext.last = this; }
    private node() { return { gain: { value: 1, setTargetAtTime() {}, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
    createGain() { return this.node(); }
    resume(): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        this.settle = { resolve: () => { this.state = 'running'; resolve(); }, reject };
      });
    }
  }
  const withContext = async (run: () => Promise<void>): Promise<void> => {
    const g = globalThis as unknown as { AudioContext?: unknown };
    const was = g.AudioContext;
    g.AudioContext = StubContext;
    try { await run(); } finally { g.AudioContext = was; }
  };
  const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

  it('is unlocked only once the context runs: a pending resume leaves it locked (web platform; 81 section 8)', () => withContext(async () => {
    const out = new WebAudioOut(), audio = new GameAudio(out), target = new EventTarget();
    audio.unlockOn(target);
    target.dispatchEvent(new Event('pointerdown'));
    expect(audio.stats()).toMatchObject({ unlocked: false, state: 'suspended' });
    StubContext.last!.settle!.resolve();
    await tick();
    expect(audio.stats()).toMatchObject({ unlocked: true, state: 'running' });
  }));

  it('warns once when a resume is refused, keeps the reason in the stats and stays locked', () => withContext(async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const out = new WebAudioOut(), audio = new GameAudio(out), target = new EventTarget();
      audio.unlockOn(target);
      target.dispatchEvent(new Event('keydown'));
      StubContext.last!.settle!.reject(new Error('not allowed'));
      await tick();
      target.dispatchEvent(new Event('keydown'));
      StubContext.last!.settle!.reject(new Error('not allowed'));
      await tick();
      expect(audio.stats().unlocked).toBe(false);
      expect(audio.stats().resumeError).toMatch(/not allowed/);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally { warn.mockRestore(); }
  }));

  /**
   * A context as the browser's autoplay rules make it (research 81 section 8): `start` its state when made -- 'running'
   * once the page has had its activation (the disc page's click, OT.R14, in the same document), 'suspended' before --
   * and what a `resume()` does: 'statechange' runs it on the task after and says so by `onstatechange` alone (its
   * promise left pending, so only the event can unlock), 'never' leaves it pending (Chromium without an activation:
   * a console warning, no rejection), 'reject' refuses it.
   */
  class PolicyContext {
    static last: PolicyContext | null = null;
    static start = 'suspended';
    static allow: 'statechange' | 'never' | 'reject' = 'never';
    state: string;
    sampleRate = 48_000;
    currentTime = 0;
    destination = {};
    resumes = 0;
    onstatechange: (() => void) | null = null;
    constructor() { this.state = PolicyContext.start; PolicyContext.last = this; }
    private node() { return { gain: { value: 1, setTargetAtTime() {}, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
    createGain() { return this.node(); }
    resume(): Promise<void> {
      this.resumes++;
      if (PolicyContext.allow === 'reject') return Promise.reject(new Error('NotAllowedError'));
      if (PolicyContext.allow === 'statechange') setTimeout(() => { this.state = 'running'; this.onstatechange?.(); }, 0);
      return new Promise<void>(() => undefined);
    }
  }
  const withPolicy = async (start: string, allow: typeof PolicyContext.allow, run: () => Promise<void>): Promise<void> => {
    const g = globalThis as unknown as { AudioContext?: unknown };
    const was = g.AudioContext;
    g.AudioContext = PolicyContext;
    PolicyContext.start = start;
    PolicyContext.allow = allow;
    try { await run(); } finally { g.AudioContext = was; vi.unstubAllGlobals(); }
  };

  it('a context the browser makes running (the page already clicked) is unlocked with no gesture, and its runs fire', () => withPolicy('running', 'never', async () => {
    vi.stubGlobal('navigator', { userActivation: { hasBeenActive: true } });
    const out = new WebAudioOut(), audio = new GameAudio(out), target = new EventTarget();
    let runs = 0;
    out.onRunning(() => runs++);
    audio.unlockOn(target);
    await tick();                                                      // prepared on the task after: no event at all
    expect(audio.stats()).toMatchObject({ unlocked: true, state: 'running', activation: true });
    expect(runs).toBe(1);
    expect(PolicyContext.last!.resumes).toBe(0);                       // running already: nothing to ask
  }));

  it('a context the browser runs on its own after the resume asked at its making is unlocked by its statechange', () => withPolicy('suspended', 'statechange', async () => {
    vi.stubGlobal('navigator', { userActivation: { hasBeenActive: true } });
    const out = new WebAudioOut(), audio = new GameAudio(out), target = new EventTarget();
    let runs = 0;
    out.onRunning(() => runs++);
    audio.unlockOn(target);
    await tick();
    expect(PolicyContext.last!.resumes).toBe(1);                       // asked once, at its making
    expect(audio.stats()).toMatchObject({ unlocked: false, state: 'suspended' });
    await tick();
    expect(audio.stats()).toMatchObject({ unlocked: true, state: 'running', activation: true });
    expect(runs).toBe(1);
    target.dispatchEvent(new Event('keydown'));                        // a later gesture changes nothing, runs nothing again
    expect(runs).toBe(1);
  }));

  for (const allow of ['never', 'reject'] as const) {
    it(`a context the browser keeps suspended (${allow}) stays locked, throws nothing and warns nothing; the stats tell why`, () => withPolicy('suspended', allow, async () => {
      vi.stubGlobal('navigator', { userActivation: { hasBeenActive: false } });
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      try {
        const out = new WebAudioOut(), audio = new GameAudio(out), target = new EventTarget();
        audio.unlockOn(target);
        await tick();
        await tick();
        expect(PolicyContext.last!.resumes).toBe(1);
        // The context's own state, and no activation: the browser refused, not "allowed but waiting".
        expect(audio.stats()).toMatchObject({ unlocked: false, state: 'suspended', activation: false, resumeError: null });
        expect(warn).not.toHaveBeenCalled();
        target.dispatchEvent(new Event('gamepadconnected'));           // a pad is no activation: not asked again
        expect(PolicyContext.last!.resumes).toBe(1);
      } finally { warn.mockRestore(); }
    }));
  }

  it('reports no activation (null) where the browser has no userActivation', () => withPolicy('suspended', 'never', async () => {
    vi.stubGlobal('navigator', {});
    const audio = new GameAudio(new WebAudioOut());
    expect(audio.stats().activation).toBeNull();
  }));

  it('asks again once the page has its activation: a pad connected, or a frame of the match (controller only)', () => withPolicy('suspended', 'never', async () => {
    const activation = { hasBeenActive: false };
    vi.stubGlobal('navigator', { userActivation: activation });
    const out = new WebAudioOut(), audio = new GameAudio(out), target = new EventTarget();
    audio.unlockOn(target);
    await tick();
    expect(PolicyContext.last!.resumes).toBe(1);
    audio.setListener(IDENTITY);
    expect(PolicyContext.last!.resumes).toBe(1);                       // no activation: nothing asked
    activation.hasBeenActive = true;
    PolicyContext.allow = 'statechange';
    target.dispatchEvent(new Event('gamepadconnected'));
    expect(PolicyContext.last!.resumes).toBe(2);
    audio.setListener(IDENTITY);
    expect(PolicyContext.last!.resumes).toBe(2);                       // one ask at a time
    await tick();
    expect(audio.stats()).toMatchObject({ unlocked: true, state: 'running', activation: true });
    audio.setListener(IDENTITY);
    expect(PolicyContext.last!.resumes).toBe(2);
  }));

  it('backs off when the browser keeps refusing: 1 s, doubling to 16 s, not every frame (the review of d19a793c)', () => withPolicy('suspended', 'reject', async () => {
    vi.stubGlobal('navigator', { userActivation: { hasBeenActive: true } });
    let now = 0;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    try {
      const out = new WebAudioOut(), audio = new GameAudio(out);
      audio.unlockOn(new EventTarget());
      await tick();
      const asked = (): number => PolicyContext.last!.resumes;
      const first = asked();                                          // prepare()'s one ask
      audio.setListener(IDENTITY); await tick();
      expect(asked()).toBe(first + 1);                                  // the first retry, refused
      for (let i = 0; i < 60; i++) { audio.setListener(IDENTITY); await tick(); }
      expect(asked()).toBe(first + 1);                                  // a second of frames: nothing asked
      now = 1_001; audio.setListener(IDENTITY); await tick();
      expect(asked()).toBe(first + 2);                                  // after 1 s
      now = 2_000; audio.setListener(IDENTITY); await tick();
      expect(asked()).toBe(first + 2);                                  // the next wait is 2 s
      now = 3_002; audio.setListener(IDENTITY); await tick();
      expect(asked()).toBe(first + 3);
      for (let n = 0; n < 10; n++) { now += 16_001; audio.setListener(IDENTITY); await tick(); }
      expect(asked()).toBe(first + 13);                                 // capped at 16 s: one ask per wait
    } finally { clock.mockRestore(); }
  }));

  it('hears a pad connect on the window when its unlock listens on a document (the front end)', () => withPolicy('suspended', 'never', async () => {
    vi.stubGlobal('navigator', { userActivation: { hasBeenActive: true } });
    const win = new EventTarget();
    vi.stubGlobal('window', win);
    const out = new WebAudioOut(), audio = new GameAudio(out);
    audio.unlockOn(new EventTarget());                                 // the front end's `doc`
    await tick();
    const before = PolicyContext.last!.resumes;
    PolicyContext.allow = 'statechange';
    win.dispatchEvent(new Event('gamepadconnected'));
    expect(PolicyContext.last!.resumes).toBe(before + 1);
  }));
});

describe.skipIf(!haveSound)('Frostfire from the fixtures (81)', () => {
  it('reads the three banks, the script, the materials, the weapons and the callbacks', async () => {
    const d = await mp2();
    // The map's three and HUDUI, which the game loads with every map (FUN_00344450: HUDUI, SMUS, TCM_ECHO, then the
    // map's; only HUDUI is on the disc): the night vision's `.NV_GOGGLES_ON/_OFF` are its (research 90 item 24).
    expect(d.banks.filter((b) => !b.only).map((b) => b.file)).toEqual(['MP2_am.bnk', 'MP2_fx.bnk', 'MP2_vc.bnk', 'HUDUI.bnk']);
    // About 1.9 MB of the store's 67 for Frostfire (81 s1: 986,408 + 687,344 + 176,088 B, and HUDUI's): never the
    // "1.1-1.4 MB" an older summary said.
    expect(d.banks.filter((b) => !b.only).reduce((n, b) => n + b.bytes.byteLength, 0)).toBeGreaterThan(1_849_840);
    // Borrowed (PLACEHOLDER): the tin steps Frostfire's METAL_THIN floors ask for; no longer the metal bounce of a grenade.
    expect(d.banks.find((b) => b.only?.includes('.STEP_TIN'))).toBeDefined();
    expect(d.banks.some((b) => b.only?.includes('.GREN_METAL'))).toBe(false);   // research 304: a grenade's sounds the map's own banks' only
    // Nothing wanted is missing (research 90 item 18): the casing names go through the one name table (`@s2u/sound`) --
    // shell_eject's `.BUL_CASE_METAL` is the banks' `.BUL_CAS_METAL`, and the shotgun's `.SG_SHELL_TIN` (MP8's and
    // MP61's banks, past the borrowing's reach here) stands in as the map's `.SG_SHELL_METAL`. The one line: the round's
    // streams, which a directory source (no ranged reads) does not take out of VAGSTORE (research 124 §4).
    expect(d.missing).toEqual([`${SOUND_STREAMS_PATH}: not read by range; the round's streams are left out`]);
    expect(new Map(d.params).get('.STEP_STONE')?.range).toEqual([30, 200]);
    expect(d.materials[STONE]!.step).toBe('.STEP_STONE');
    expect(d.weapons.find((w) => w.name === 'M4A1 SD')).toMatchObject({ fireClose: '.M4A1_SIL', reload: '.M4A1_SIL_RLD' });
    expect(new Map(d.callbacks).get('jump_whoosh')).toEqual(['.JUMP_WHOOSH']);
    expect(new Map(d.callbacks).get('ladder_rung')).toEqual(['.STEP_LADDER']);
    expect(new Map(d.callbacks).get('RPG_impact')).toEqual(['.EXP_1', '.GREN_FAR']);
    // Load-bound, not logic-bound: the first `mp2()` reads Frostfire's ZDB and its three sound banks off the fixtures.
    // Solo 0.57 s (vitest --maxWorkers=2, 2026-09-29). It passed alone and timed out at the default 5 s in
    // full-suite runs on a loaded host: a slow-down past 8x, which solo x 6 (3.4 s) would not cover, so
    // the budget is solo x ~26 -- this test's alone; the suite keeps the default.
  }, 15_000);

  it('plays the game\'s sound for each event, once unlocked', async () => {
    const out = new Recorder(), audio = new GameAudio(out, seeded(3));
    audio.setData(await mp2());
    audio.setFallTable(235, [62, 91, 120]);
    audio.setListener(IDENTITY);
    expect(audio.onFootstep(STONE, [0, 0, -10])).toBeNull();          // locked: counted, not played
    expect(audio.stats().dropped.locked).toBe(1);
    out.unlock();
    expect(audio.onFootstep(STONE, [0, 0, -10])).toBe('.STEP_STONE');
    expect(audio.onFootstep(STONE, [0, 0, -10], { stick: 0.3 })).toBe('.STEALTH_STONE');
    expect(audio.onFootstep(STONE, [0, 0, -10], { stance: 2 })).toBe('.CRAWL_STONE');
    expect(audio.onFootstep(0, [0, 0, -10])).toBe('.STEP_METAL');      // 0: the map's DefaultMaterial, METAL_THICK
    expect(audio.onFootstep(3, [0, 0, -10])).toBeNull();               // INVISIBLE_DI: no step sound
    expect(audio.onFootstep(STONE, [0, 0, -500])).toBeNull();          // past the step's RANGE (200)
    expect(audio.onFire('M4A1 SD', [0, 0, -5])).toBe('.M4A1_SIL');
    expect(audio.onReload('M4A1 SD')).toBe('.M4A1_SIL_RLD');
    expect(audio.onJump([0, 0, -5])).toBe('.JUMP_WHOOSH');
    expect(audio.onLand(80, STONE, [0, 0, -5])).toEqual(['.STONE_JUMP']);
    expect(audio.onLand(220, STONE, [0, 0, -5])).toEqual(['.BONE_BRK_1']);   // no voice: the room's hurtVoice (PF-10)
    expect(audio.onLand(400, STONE, [0, 0, -5])).toEqual(['.STONE_JUMP', '.BONE_BRK_1']);
    expect(audio.onAnimCallback('shotgun_pump')).toBe('.SHOTGUN_COCK');
    const s = audio.stats();
    expect(s.map).toBe('MP2');
    expect(s.banks.filter((b) => !b.borrowed).map((b) => b.name)).toEqual(['MP2_AM', 'MP2_FX', 'MP2_VC', 'HUDUI']);
    expect(s.played).toBe(out.played.length);
    expect(s.byName['.STEP_STONE']).toBe(1);
    expect(s.dropped.range).toBe(1);
    expect(s.decoded).toBeGreaterThan(5);
    expect(out.played.every((r) => r.left.length > 0 && r.peak > 0)).toBe(true);
    // The goggles, played without a place as the game does (vtable+0xc, decomp 410944/410948).
    expect(audio.play('.NV_GOGGLES_ON')).toBe(true);
    expect(audio.play('.NV_GOGGLES_OFF')).toBe(true);
  });

  it('a restartable voice (the ARMORY\'s .TYPE tick): one voice a name, stopped and started again, rendered once', async () => {
    const stops: number[] = [];
    class Voices extends Recorder {
      override play(sound: RenderedSound): { stop(): void } { super.play(sound); const n = this.played.length; return { stop: () => { stops.push(n); } }; }
    }
    const out = new Voices(), audio = new GameAudio(out, seeded(7));
    audio.setData(await mp2());
    expect(audio.restart('.TYPE')).toBe(false);                        // locked
    out.unlock();
    expect([audio.restart('.TYPE'), audio.restart('.TYPE'), audio.restart('.TYPE')]).toEqual([true, true, true]);
    expect(out.played).toHaveLength(3);
    expect(new Set(out.played).size).toBe(1);                          // one render, played again
    expect(stops).toEqual([1, 2]);                                     // each play stops the last voice
    expect(audio.stats().byName['.TYPE']).toBe(3);
    expect(audio.restart('.NOT_A_SOUND')).toBe(false);
  });

  it('pans a source by its azimuth and fades it over its RANGE', async () => {
    const out = new Recorder(), audio = new GameAudio(out, seeded(5));
    audio.setData(await mp2());
    audio.setListener(IDENTITY);
    out.unlock();
    const energy = (a: Float32Array): number => a.reduce((n, v) => n + v * v, 0);
    audio.play('.M4A1_SIL', [10, 0, 0]);                                // to the right
    const right = out.played.at(-1)!;
    expect(energy(right.left)).toBe(0);
    expect(energy(right.right)).toBeGreaterThan(0);
    audio.play('.M4A1_SIL', [0, 0, -110]);                              // ahead, half way through 20-200
    const far = out.played.at(-1)!;
    audio.play('.M4A1_SIL', [0, 0, -10]);
    const near = out.played.at(-1)!;
    expect(audio.stats().recent.at(-2)).toMatchObject({ name: '.M4A1_SIL', vol: 512, pan: 0 });
    expect(far.peak / near.peak).toBeGreaterThan(0.2);                // half the volume is a quarter of the level
    expect(far.peak / near.peak).toBeLessThan(0.3);
    expect(audio.play('.NOT_IN_A_BANK')).toBe(false);
    expect(audio.stats().dropped.unknown).toBe(1);
  });

  it('turns the body events and the rifle events into footfalls, the whoosh, a landing, rounds and a reload', async () => {
    const out = new Recorder(), audio = new GameAudio(out, seeded(9));
    audio.setData(await mp2());
    audio.setFallTable(235, [62, 91, 120]);
    out.unlock();
    const signals: WalkSignals = {
      walking: () => true,
      feet: () => [0, 0, 0],
      stance: () => 'stand',
      wish: () => ({ forward: 1, right: 0 }),
      grid: () => null,                                                // no hull: material 0, silent steps
    };
    const sounds = new WalkSounds(audio, signals);
    sounds.material = () => STONE;                                     // stone under the feet
    for (let i = 0; i < 8; i++) sounds.playEvent({ kind: 'footfall', foot: i % 2 ? 'right' : 'left', clip: 'seal_run', position: [0, 0.5, 0] });
    sounds.playEvent({ kind: 'callback', clip: 'seal_jump', name: 'jump_whoosh', phase: 0.42 });
    sounds.playEvent({ kind: 'land', speed: 90, clip: 'land' });
    const weapon = { name: 'M4A1 SD', id: 62, fireAnim: 'muzzle_m4SD', sounds: { close: '.M4A1_SIL', med: null, far: null, reload: '.M4A1_SIL_RLD' } };
    for (let i = 0; i < 3; i++) sounds.fireEvent({ type: 'round', weapon, from: [0, 15, -3], to: [0, 15, -100], hit: false, rounds: 29 - i });
    sounds.fireEvent({ type: 'reloadStart', weapon, seconds: 1.6 });
    expect(sounds.counts).toEqual({ footfalls: 8, callbacks: 1, landings: 1, rounds: 3, reloads: 1 });
    const s = audio.stats();
    expect(s.byName['.STEP_STONE']).toBe(8);
    expect(s.byName['.JUMP_WHOOSH']).toBe(1);
    expect(s.byName['.STONE_JUMP']).toBe(1);
    expect(s.byName['.M4A1_SIL']).toBe(3);
    expect(s.byName['.M4A1_SIL_RLD']).toBe(1);
  });

  it('hears material 0 as the map DefaultMaterial, follows zAnim calls, and hurts on a hard landing', async () => {
    const d = await mp2();
    expect(d.materials[d.defaultMaterial]!.name).toBe('METAL_THICK');
    const out = new Recorder(), audio = new GameAudio(out, seeded(4));
    audio.setData(d);
    audio.setFallTable(235, [62, 91, 120]);
    out.unlock();
    expect(audio.onFootstep(0, null)).toBe('.STEP_METAL');
    expect(audio.stats().defaultMaterial).toBe('METAL_THICK');
    expect(new Map(d.callbacks).get('frag_grenade_stone')).toEqual(['.GREN_MED']);   // through frag_grenade
    expect(audio.onAnimCallback('frag_grenade_stone')).toBe('.GREN_MED');
    expect(d.characterVoices?.seal[0]?.damage).toBe('.SEAL_DAMAGE');           // the hurt voice: the room's hurtVoice (PF-10)
    expect(audio.onLand(100, 0)).toEqual(['.METAL_JUMP']);
    expect(audio.onLand(190, 0)).toEqual(['.METAL_JUMP']);
    expect(audio.onLand(220, 0)).toEqual(['.BONE_BRK_1']);
  });

  it('hears a grenade on asphalt: grenade_hit_asphalt calls .GREN_ASPHALT, which no bank holds, played as .GREN_STONE', async () => {
    const d72 = await soundFromDisc(new FsAssetSource(fixtures), 'RUN/MP72.ZDB', 'MP72');
    expect(new Map(d72.callbacks).get('grenade_hit_asphalt')).toEqual(['.GREN_ASPHALT']);
    const out = new Recorder(), audio = new GameAudio(out, seeded(2));
    audio.setData(d72);
    out.unlock();
    // The name played, through the one name table (`@s2u/sound`'s `soundFor`): the stone's bounce -- the owner's ruled
    // departure (catalog.ts, the playtest of 2026-09-29), kept; research 304's removal of it is the owner's question.
    expect(audio.onAnimCallback('grenade_hit_asphalt')).toBe('.GREN_STONE');
    expect(audio.has('.BUL_CASE_METAL')).toBe(true);                               // the misspelt casing, mended
    // Load-bound, not logic-bound: it reads Crossroads' ZDB (MP72) and its banks off the fixtures.
    // Solo 0.57 s (vitest --maxWorkers=2, 2026-09-29). It passed alone and timed out at the default 5 s in
    // full-suite runs on a loaded host: a slow-down past 8x, which solo x 6 (3.4 s) would not cover, so
    // the budget is solo x ~26 -- this test's alone; the suite keeps the default.
  }, 15_000);

  it('picks a remote round by WEAPON_GLOBAL distance: close to 90 units, medium to 500, far beyond (FUN_003d2c50)', async () => {
    const d = await mp2();
    expect(d.fireDistances).toEqual({ close: 0, med: 90, far: 500 });     // 0, 9, 50 m at 10 units a metre
    const out = new Recorder(), audio = new GameAudio(out, seeded(3));
    audio.setData(d);
    audio.setListener(IDENTITY);
    out.unlock();
    expect(audio.onFire('M4A1', [0, 0, -50])).toBe('.M4A1');
    expect(audio.onFire('M4A1', [0, 0, -100])).toBe('.M4A1_M');
    expect(audio.onFire('M4A1', [0, 0, -600])).toBe('.M4A1_F');
    const range = audio.stats().dropped.range;
    expect(audio.onFire('M4A1', [0, 0, -1800])).toBeNull();             // the far sound's own RANGE (85-1700)
    expect(audio.stats().dropped.range).toBe(range + 1);
    // The M4A1 SD has no FireSoundMed/Far: its slots are empty and an empty slot plays nothing -- no fall back to the
    // close sound. A reading: the missing name's lookup to a null handle (FUN_00344f30 -> FUN_00344bf0) is read to
    // the end in research 81 s5.1, which supersedes the earlier PLAUSIBLE.
    expect(audio.onFire('M4A1 SD', [0, 0, -80])).toBe('.M4A1_SIL');
    expect(audio.onFire('M4A1 SD', [0, 0, -150])).toBeNull();
  });

  it('plays a zAnim sound at its command volume (flag 0x10, FUN_002659c0): the app volume is 0x400 x volume', async () => {
    const d = await mp2();
    const out = new Recorder(), audio = new GameAudio(out, seeded(3));
    audio.setData(d);
    audio.setListener(IDENTITY);
    out.unlock();
    audio.play('.M4A1_SIL', [0, 0, -10], 'play', 0.5);
    expect(audio.stats().recent.at(-1)).toMatchObject({ name: '.M4A1_SIL', vol: 0x200 });
    // The flashbang's zAnim plays its bang at 2.0 (common set, every map).
    expect(new Map(d.callbackVolumes).get('flashcrash_grenade')?.[new Map(d.callbacks).get('flashcrash_grenade')!.indexOf('.MARK_141_FLASH')]).toBe(2);
    expect(new Map(d.callbackVolumes).get('jump_whoosh')).toEqual([1]);
    expect(audio.onAnimCallback('flashcrash_grenade')).toBe('.MARK_141_FLASH');     // played without a place: 0x400 x 2
    expect(audio.stats().recent.at(-1)).toMatchObject({ name: '.MARK_141_FLASH', vol: 0x800 });
  });

  it('walks Frostfire\'s camera-state scripts: the beds on PLAYER_INDOORS, the wind gusts on CAMERA_INDOORS after 8 s (81 s10)', async () => {
    const d = await mp2();
    const gust = (sound: string, volume: number, base: number, range: number) =>
      ({ anim: volume === 1 ? 'wind_outside' : 'wind_inside', sound, volume, kind: 'repeat', wait: { base, range }, test: 'camera', delay: 8 });
    // The mission's scripts in its order: check_camera_inside_state (the wind), then check_camera_inside_state1 (the beds).
    expect(d.layers!.outside).toEqual([
      gust('.OUTDR_WND_GST2', 1, 5, 15), gust('.OUTDR_WND_GST3', 1, 2, 14),
      { anim: 'outside_noise', sound: '~OUTDOOR_AMB', volume: 1, kind: 'loop', test: 'player', delay: 0 },
    ]);
    expect(d.layers!.inside).toEqual([
      gust('.OUTDR_WND_GST2', Math.fround(0.6), 5, 15), gust('.OUTDR_WND_GST3', Math.fround(0.6), 2, 14),
      { anim: 'inside_noise', sound: '~INDOOR_AMB', volume: 1, kind: 'loop', test: 'player', delay: 0 },
    ]);
    expect(d.emitters.some((e) => /OUTDR_WND/.test(e.sound))).toBe(false);
    // Played: nothing for 8 s, then each gust at once and again after its wait, at its volume, without a place.
    let now = 0;
    const out = new Recorder(), audio = new GameAudio(out, () => 0.5, { now: () => now });
    audio.setData(d);
    out.unlock();
    audio.setAmbience(true);
    audio.setEnvironment(false, 0);
    audio.pump(1e9);
    const gusts = (): { name: string; vol: number }[] => audio.stats().recent.filter((r) => r.event === 'ambience');
    now = 7.9; audio.setListener(IDENTITY);
    expect(gusts()).toEqual([]);
    now = 8; audio.setListener(IDENTITY);
    expect(gusts().map((g) => [g.name, g.vol])).toEqual([['.OUTDR_WND_GST2', 0x400], ['.OUTDR_WND_GST3', 0x400]]);
    now = 8 + 2 + 14 * 0.5; audio.setListener(IDENTITY);                  // GST3's wait at U = 0.5: 9 s
    expect(gusts().length).toBe(3);
    // Indoors the script stops wind_outside and starts wind_inside: its gusts at once, at 0.6.
    audio.setEnvironment(true, 0);
    audio.setListener(IDENTITY);
    expect(gusts().slice(3).map((g) => [g.name, g.vol])).toEqual([['.OUTDR_WND_GST2', Math.round(0x400 * Math.fround(0.6))], ['.OUTDR_WND_GST3', Math.round(0x400 * Math.fround(0.6))]]);
  });

  it('resolves Desert Glory\'s indoor bed in the mission set: ~OUTDOOR_AMB at 0.6, not the common ~INDOOR_AMB (FUN_0026a250)', async () => {
    const d6 = await soundFromDisc(new FsAssetSource(fixtures), 'RUN/MP6.ZDB', 'MP6');
    expect(d6.beds).toEqual({ outside: ['~OUTDOOR_AMB'], inside: ['~OUTDOOR_AMB'] });
    expect(d6.layers!.inside).toEqual([{ anim: 'inside_noise', sound: '~OUTDOOR_AMB', volume: Math.fround(0.6), kind: 'loop', test: 'player', delay: 0 }]);
    expect((await mp2()).beds.inside).toEqual(['~INDOOR_AMB']);
    // Its fires sound at the command's 3.0 (flag 0x10), rendered at that volume: one loop per sound and volume.
    expect(d6.emitters.filter((e) => e.anim === 'flame_in_rubble1').map((e) => [e.sound.trim(), e.volume])).toEqual([['~FIRE_SM', 3]]);
    const loops = renderAmbienceLoops(d6, 1, 0.1);
    const names = loops.map((l) => l.name);
    expect(names).toContain('~OUTDOOR_AMB');
    expect(names).toContain(loopKey('~OUTDOOR_AMB', Math.fround(0.6)));
    const peak = (n: string): number => loops.find((l) => l.name === n)!.sound.peak;
    expect(peak(loopKey('~OUTDOOR_AMB', Math.fround(0.6)))).toBeLessThan(peak('~OUTDOOR_AMB'));
  }, 30_000);

  it('plays .BUL_PASSING at the nearest point of another shooter round within 20 units', async () => {
    const out = new Recorder(), audio = new GameAudio(out, seeded(6));
    audio.setData(await mp2());
    audio.setListener(IDENTITY);
    out.unlock();
    expect(audio.onRoundPast([-100, 5, 0], [100, 5, 0], [0, 0, 0])).toBe('.BUL_PASSING');
    expect(audio.stats().recent.at(-1)).toMatchObject({ name: '.BUL_PASSING', event: 'passing' });
    expect(audio.onRoundPast([-100, 30, 0], [100, 30, 0], [0, 0, 0])).toBeNull();
  });

  it('ramps the reverb to the mission zone depth and crosses the beds as the camera goes in', async () => {
    const d = await mp2();
    expect(d.reverb.preset?.slice(0, 2)).toEqual([0xb1, 0x7f]);                // libsd mode 3, "Studio Medium"
    expect(d.reverb.indoor).toEqual([[0.45, 1], [0.2, 1]]);                    // the first of the two keys
    expect(d.reverb.outdoor).toEqual([[0.07, 1], [0.2, 1]]);
    expect(d.beds).toEqual({ outside: ['~OUTDOOR_AMB'], inside: ['~INDOOR_AMB'] });
    expect(d.emitters.map((e) => [e.sound.trim(), e.node])).toEqual([['~FAN_ROTATE', 'fan1']]);
    const out = new Recorder(), audio = new GameAudio(out, seeded(8));
    out.unlock();                                                                    // the reverb is built once unlocked
    audio.setData(d);
    audio.setListener(IDENTITY);
    audio.setAmbience(true);
    audio.setEnvironment(false, 0);
    expect(out.loops.length).toBe(0);                                              // queued, not built on the gesture
    audio.pump(1e9);
    expect(audio.stats().timing.pending).toBe(0);
    expect(out.reverb!.ll.length).toBeGreaterThan(24_000);
    expect(out.ramps.at(-1)).toEqual([0.07, 1]);
    audio.setEnvironment(true, 0);
    expect(out.ramps.at(-1)).toEqual([0.45, 1]);
    audio.setEnvironment(true, 5);                                                   // no such entry: off over a second
    expect(out.ramps.at(-1)).toEqual([0, 1]);
    const [outside, inside, fan] = out.loops;
    expect(out.loops.length).toBe(3);
    expect(outside!.sound.left.length).toBe(LOOP_SECONDS_PLACEHOLDER * 48_000);
    expect(inside!.gains).toEqual([1, 1]);
    expect(outside!.gains).toEqual([0, 0]);
    expect(audio.stats().ambience).toMatchObject({ on: true, bed: 'inside' });
    // The fan: heard by its RANGE from where it stands; far away, nothing.
    const fanAt = d.emitters[0]!.position;
    audio.setListener([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, fanAt[0], fanAt[1], fanAt[2] + 10, 1]);
    expect(fan!.gains[0]).toBeGreaterThan(0.5);
    audio.setListener(IDENTITY);
    expect(fan!.gains).toEqual([0, 0]);
    audio.setAmbience(false);
    expect(out.loops.every((l) => l.stopped)).toBe(true);
    expect(panGains(90)[0]).toBe(0);
    expect(panGains(0)).toEqual([1, 1]);
  });

  it("levels the ambience's loops by their group's master as the option moves -- the background wind followed no slider (the owner, 2026-10-29)", async () => {
    // 989snd's SetMasterVolume reaches the voices already playing (research 233 §1, GROUP_MASTER_READING): a bed or an
    // emitter is a bank sound of its VolGroup, so SOUND_VOLUME's master levels it through the square law, as it does a
    // one-shot. The loops are rendered at 0x400; a master m plays them at (m / 0x400)^2, from the next frame.
    const d = await mp2();
    let tuners: StreamTuners = { ...TUNER_DEFAULTS };
    const out = new Recorder(), audio = new GameAudio(out, seeded(8));
    out.unlock();
    audio.setData(d);
    audio.setTuners(() => tuners);
    audio.setListener(IDENTITY);
    audio.setAmbience(true);
    audio.setEnvironment(true, 0);
    audio.pump(1e9);
    const [outside, inside, fan] = out.loops;
    const fanAt = d.emitters[0]!.position;
    const near = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, fanAt[0], fanAt[1], fanAt[2] + 10, 1];
    audio.setListener(near);
    expect(inside!.gains).toEqual([1, 1]);                                   // the defaults change nothing
    const full = fan!.gains[0];
    expect(full).toBeGreaterThan(0.5);
    tuners = { ...TUNER_DEFAULTS, sound: 0.5 };                               // SOUND at half: trunc(0.5 x 1024) = 0x200
    audio.setListener(near);
    expect(inside!.gains).toEqual([0.25, 0.25]);
    expect(outside!.gains).toEqual([0, 0]);                                  // the bed that is down stays down
    expect(fan!.gains[0]).toBeCloseTo(full * 0.25, 9);
    tuners = { ...TUNER_DEFAULTS, sound: 0 };                                 // SOUND off: the wind and the fan silent
    audio.setListener(near);
    expect(inside!.gains).toEqual([0, 0]);
    expect(fan!.gains).toEqual([0, 0]);
    tuners = { ...TUNER_DEFAULTS, music: 0, dialog: 0, headset: 0 };          // the other options move none of it
    audio.setListener(near);
    expect(inside!.gains).toEqual([1, 1]);
    expect(fan!.gains[0]).toBeCloseTo(full, 9);
    audio.setEnvironment(false, 0);                                           // the crossing keeps the level: outside comes up at it
    tuners = { ...TUNER_DEFAULTS, sound: 0.5 };
    audio.setListener(near);
    expect(outside!.gains).toEqual([0.25, 0.25]);
    // the ladder's slide is a loop of its bank sound too: the same master
    tuners = { ...TUNER_DEFAULTS };
    audio.setListener(IDENTITY); audio.setLadderSlide([0, 0, -10]); audio.setListener(IDENTITY);
    const slide = out.loops.at(-1)!, slideFull = slide.gains[0];
    expect(slideFull).toBeGreaterThan(0);
    tuners = { ...TUNER_DEFAULTS, sound: 0.5 };
    audio.setListener(IDENTITY);
    expect(slide.gains[0]).toBeCloseTo(slideFull * 0.25, 9);
    expect([loopMasterGain(0x400), loopMasterGain(0x200), loopMasterGain(0), loopMasterGain(null)]).toEqual([1, 0.25, 0, 1]);
  });
});

/**
 * Every map's floors step (the feel-QA's Crossroads, research 81 §4): each polygon a SEAL stands on, its material (byte 0
 * the map's DefaultMaterial), has its step, stealth, crawl and landing sound in the map's banks or a borrowed one. The
 * three fixture maps always; all 22 when the served tree is extracted.
 */
const served = resolve(fixtures, '../public/maps');
const everyMap = [
  ...['MP2', 'MP6', 'MP72'].filter((m) => existsSync(resolve(fixtures, `RUN/${m}.ZDB`))).map((m) => ({ dir: fixtures, map: m })),
  ...(existsSync(resolve(served, 'RUN/SOUNDS/BNKSTORE.ZAR'))
    ? readdirSync(resolve(served, 'RUN')).filter((f) => /^MP\d+\.ZDB$/.test(f) && !['MP2.ZDB', 'MP6.ZDB', 'MP72.ZDB'].includes(f))
      .map((f) => ({ dir: served, map: f.replace('.ZDB', '') }))
    : []),
];
describe.skipIf(!haveSound)('every map steps on every floor', () => {
  it.each(everyMap)('$map', async ({ dir, map }) => {
    const source = new FsAssetSource(dir);
    const d = await soundFromDisc(source, `RUN/${map}.ZDB`, map);
    expect(d.banks.length).toBeGreaterThanOrEqual(3);
    const out = new Recorder(), audio = new GameAudio(out, seeded(1));
    audio.setData(d);
    out.unlock();
    const zdb = new Uint8Array(readFileSync(resolve(dir, `RUN/${map}.ZDB`)));
    const polys = worldCollision(parseSceneGraph(Zar.parse(zdbMember(zdb, parseZdb(zdb), `${map}_GEO.ZED`))));
    const silent = new Map<string, number>();
    for (const m of new Set(polys.filter((p) => p.ditype & 1).map((p) => p.material))) {
      const mat = audio.materialOf(m);
      if (!mat?.step) continue;                                    // INVISIBLE_DI, BARREL ...: no step sound in SOILS
      for (const stance of [0, 2] as const) {
        const got = audio.onFootstep(m, null, { stance });
        if (!got) silent.set(`${mat.name}/${stance}`, (silent.get(`${mat.name}/${stance}`) ?? 0) + 1);
      }
      if (audio.onLand(50, m).length === 0 && mat.land) silent.set(`${mat.name}/land`, 1);
    }
    expect([...silent.keys()]).toEqual([]);
    // No casing name is missing: the data's slip is mended and a shell no bank reached stands in (research 90 item 18).
    expect(d.missing.filter((x) => /no bank holds/.test(x))).toEqual([]);
    // Nothing is missing at all (research 90 item 26): an emitter whose node the scene lacks plays where the game plays
    // it, and a DefaultMaterial no SOILS entry spells is the game's UNKNOWN (FUN_002de9e0 answers 0), not an error.
    // But the round's streams: a directory source does not read by range, so VAGSTORE is left alone (research 124 §4).
    expect(d.missing).toEqual([`${SOUND_STREAMS_PATH}: not read by range; the round's streams are left out`]);
    // The goggles' sounds are HUDUI's, a bank the game loads with every map (FUN_00344450; research 90 item 24).
    expect(audio.has('.NV_GOGGLES_ON') && audio.has('.NV_GOGGLES_OFF')).toBe(true);
  }, 60_000);
});

/**
 * Research 124 §7 (an interim slice of PLAT-22; ported from Chris's browser-beta-v5 `audio.ts` 132-134, 297-301,
 * 433-438): the map's streamed cues, decoded in the worker, played whole -- the result line on a voice of its own, the
 * music in the one-voice slot SOUND's flag 0x800 hands it to (`FUN_00348dc0`, research 81 §6). Synthetic streams.
 */
describe('the streams: a voice of its own, and the one music slot (research 124 §7)', () => {
  const tone = (seconds: number, rate = 32000): RenderedSound => {
    const left = new Float32Array(Math.round(seconds * rate)).fill(0.25);
    return { left, right: left.slice(), sendLeft: null, sendRight: null, sampleRate: rate, voices: 2, samples: [], peak: 0.25 };
  };
  const data = (streams: SoundData['streams']): SoundData => ({
    archive: 'MP2', banks: [], materials: [], params: [], weapons: [], callbacks: [], defaultMaterial: 0,
    beds: { outside: [], inside: [] }, emitters: [], reverb: { preset: null, indoor: [], outdoor: [] }, missing: [],
    streams,
  });
  const quiet = (): (() => void) => { const w = vi.spyOn(console, 'warn').mockImplementation(() => undefined); return () => w.mockRestore(); };
  it('places a remote taunt stream through native range and pan without moving the sender echo or round cues', () => {
    const out = new Recorder(), audio = new GameAudio(out, seeded(1)), restore = quiet();
    audio.setData(data([{ name: '^TAUNT_TEST', file: 'TEST.VAG', sound: { ...tone(1), voices: 1 }, group: 2 }]));
    restore(); out.unlock(); audio.setListener(IDENTITY);
    audio.playStream('^TAUNT_TEST');
    const echo = out.streamGains[0]!;
    audio.playStream('^TAUNT_TEST', [100, 0, 0]);
    const right = out.streamGains[1]!;
    expect(right.left[1]).toBeGreaterThan(right.left[0]);
    audio.playStream('^TAUNT_TEST', [500, 0, 0]);
    expect(out.streamGains[2]!.left).toEqual([0, 0]);
    audio.playStream('^TAUNT_TEST');
    expect(out.streamGains[3]).toEqual(echo);
    expect(audio.stats().byName['^TAUNT_TEST']).toBe(4);
  });

  it('a tactical group (research 302 §7) plays its weighted member, placed as a stream; hasStream asks every member', () => {
    const out = new Recorder(), audio = new GameAudio(out, () => 0.25), restore = quiet();
    audio.setData({
      ...data([{ name: '^*PS_0007A', file: 'PS_0007A.VAG', sound: { ...tone(1), voices: 1 }, group: 2 }, { name: '^*PS_0007B', file: 'PS_0007B.VAG', sound: { ...tone(1), voices: 1 }, group: 2 }]),
      tacticalGroups: [
        { name: '^PS_0007', dynamic: Math.fround(0.05), members: [{ name: '^*PS_0007A', weight: 0 }, { name: '^*PS_0007B', weight: 0 }] },
        { name: '^PT_0263', dynamic: Math.fround(0.05), members: [{ name: '^*PS_0007A', weight: 0 }, { name: '^*PT_0263B', weight: 0 }] },
      ],
    });
    restore(); out.unlock(); audio.setListener(IDENTITY);
    expect([audio.hasStream('^PS_0007'), audio.hasStream('^PT_0263'), audio.hasStream('^*PS_0007B'), audio.hasStream('^NONE')]).toEqual([true, false, true, false]);
    expect(audio.playStream('^PS_0007', [100, 0, 0])).toBe('played');
    expect(audio.playStream('^PS_0007')).toBe('played');
    expect(audio.stats().byName).toMatchObject({ '^*PS_0007A': 1, '^*PS_0007B': 1 });   // the weights move after each pick (FUN_00348710)
    expect(out.streamGains[0]!.left[1]).toBeGreaterThan(out.streamGains[0]!.left[0]);   // placed to the right
  });

  it('plays a cue in the slot once unlocked; a second while one sounds hands over after the slot\'s 2 s fade', () => {
    const restore = quiet();
    let t = 100;
    const out = new Recorder(), audio = new GameAudio(out, seeded(1), { now: () => t });
    const intro = tone(30), win = tone(18), other = tone(1);
    audio.setData(data([{ name: 'MUS_MP_SEAL_INTRO_4', file: 'MUMP0004.VPK', sound: intro }, { name: 'MUS_MP_SEAL_WIN_RUS', file: 'MUMP0019.VPK', sound: win }, { name: 'MUS_X', file: 'X.VPK', sound: other }]));
    restore();
    expect(audio.playMusic('MUS_MP_SEAL_INTRO_4')).toBe('locked');       // locked: nothing sounds, counted
    expect(audio.stats().dropped.locked).toBe(1);
    out.unlock();
    expect(audio.playMusic('MUS_MP_SEAL_INTRO_4')).toBe('played');
    expect(out.music).toEqual([{ sound: intro, handover: 0 }]);
    t += 15;                                                             // the intro still sounds
    expect(audio.playMusic('MUS_MP_SEAL_WIN_RUS')).toBe('played');
    expect(out.music[1]).toEqual({ sound: win, handover: MUSIC_SLOT_HANDOVER_SECONDS });
    expect(MUSIC_SLOT_HANDOVER_SECONDS).toBe(2);
    t += MUSIC_SLOT_HANDOVER_SECONDS + 18 + 0.1;                          // the win cue has ended: the slot is free
    expect(audio.playMusic('MUS_X')).toBe('played');
    expect(out.music[2]).toEqual({ sound: other, handover: 0 });
    expect(audio.stats().streams).toEqual({ available: ['MUS_MP_SEAL_INTRO_4', 'MUS_MP_SEAL_WIN_RUS', 'MUS_X'], music: 'MUS_X', voice: null });
    expect(audio.stats().events.music).toBe(4);
    const stops = out.musicStops;                                       // setData stopped the slot once already
    audio.stopMusic();
    expect(out.musicStops).toBe(stops + 1);
    expect(audio.stats().streams.music).toBeNull();
    t += 0.1;
    expect(audio.playMusic('MUS_X')).toBe('played');
    expect(out.music[3]!.handover).toBe(0);                              // stopped: no fade to wait for
  });

  it('a cue while another waits for the slot replaces the waiting one: it starts at the same handover end (FUN_00348dc0)', () => {
    // FUN_00348dc0 (D:L245383-245446): with the slot fading, a cue of the pending one's priority or more overwrites the
    // pending DAT_0048e0b0 and starts no second fade (FUN_00346da0); FUN_003492b0 starts it when the slot frees.
    const restore = quiet();
    let t = 100;
    const out = new Recorder(), audio = new GameAudio(out, seeded(1), { now: () => t });
    const intro = tone(30), win = tone(18), other = tone(1);
    audio.setData(data([{ name: 'MUS_MP_SEAL_INTRO_4', file: 'MUMP0004.VPK', sound: intro }, { name: 'MUS_MP_SEAL_WIN_RUS', file: 'MUMP0019.VPK', sound: win }, { name: 'MUS_X', file: 'X.VPK', sound: other }]));
    restore();
    out.unlock();
    audio.playMusic('MUS_MP_SEAL_INTRO_4');
    t = 115;
    audio.playMusic('MUS_MP_SEAL_WIN_RUS');                              // waits for 117
    t = 116;
    expect(audio.playMusic('MUS_X')).toBe('played');
    expect(out.music[2]).toEqual({ sound: other, handover: 1 });         // the same 117, not 116 + 2
    t = 118.05;                                                          // 117 + 1 s of MUS_X: the slot is free
    audio.playMusic('MUS_X');
    expect(out.music[3]!.handover).toBe(0);
  });

  it('WebAudioOut: a replaced pending cue never sounds; a stop also stops the one fading (FUN_00348dc0)', () => {
    interface Node { started: number | null; stopped: number | null; buffer: unknown; onended: (() => void) | null; connect(): void; disconnect(): void; start(w?: number): void; stop(w?: number): void }
    const nodes: Node[] = [];
    const gains: { value: number }[] = [];
    const curves: { curve: Float32Array; at: number; seconds: number }[] = [];
    let ctx: { currentTime: number } = { currentTime: 0 };
    class Ctx {
      state = 'running'; sampleRate = 48_000; currentTime = 0; destination = {};
      constructor() { ctx = this; }
      createGain() {
        const g = { gain: { value: 1, setTargetAtTime() {}, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {},
          setValueCurveAtTime(curve: Float32Array, at: number, seconds: number) { curves.push({ curve, at, seconds }); } }, connect() {}, disconnect() {} };
        gains.push(g.gain);
        return g;
      }
      createChannelSplitter() { return { connect() {}, disconnect() {} }; }
      createChannelMerger() { return { connect() {}, disconnect() {} }; }
      createBuffer(_c: number, n: number, rate: number) { return { numberOfChannels: 2, length: n, sampleRate: rate, copyToChannel() {} }; }
      createBufferSource(): Node {
        const n: Node = { started: null, stopped: null, buffer: null, onended: null, connect() {}, disconnect() {},
          start(w = 0) { n.started = w; }, stop(w = ctx.currentTime) { n.stopped ??= w; n.stopped = Math.min(n.stopped, w); } };
        nodes.push(n);
        return n;
      }
      resume(): Promise<void> { return Promise.resolve(); }
    }
    const g = globalThis as unknown as { AudioContext?: unknown };
    const was = g.AudioContext;
    g.AudioContext = Ctx;
    try {
      const out = new WebAudioOut();
      out.prepare();
      const music = roundStreamGains(1, 2);
      out.playMusic(tone(30), 0, music);                                 // [0] the intro, at once
      // Its fade gain at 1, then the stereo pair at the music's level, each data channel on its own side.
      expect(gains.map((g) => Number(g.value.toFixed(5))).slice(-5)).toEqual([1, 0.27321, 0, 0, 0.27321]);
      ctx.currentTime = 15;
      out.playMusic(tone(18), 2, music);                                 // [1] the win cue, waiting for 17
      expect(nodes[0]!.stopped).toBe(17);
      expect(nodes[1]!.started).toBe(17);
      // The intro's fade: 989snd's AutoVol over the slot's 480 ticks (research 186 §3.1), silent from tick 381 (1.588 s);
      // the hard stop at the 2 s timer.
      expect(curves.length).toBe(1);
      expect(curves[0]!.at).toBe(15);
      expect(curves[0]!.seconds).toBe(2);
      expect(curves[0]!.curve.length).toBe(SLOT_FADE_TICKS + 1);
      expect(curves[0]!.curve[0]).toBe(1);
      expect(curves[0]!.curve[240]!).toBeGreaterThan(0);                 // the 7-bit volume 47 (its level squared)
      expect(curves[0]!.curve[381]).toBe(0);
      ctx.currentTime = 16;
      out.playMusic(tone(1), 1, music);                                  // [2] replaces [1] before it sounds
      expect(nodes[1]!.stopped).not.toBeNull();
      expect(nodes[1]!.stopped!).toBeLessThan(nodes[1]!.started!);      // stopped before its start: never heard
      expect(nodes[2]!.started).toBe(17);
      expect(nodes[0]!.stopped).toBe(17);                                // the fade goes on to its end
      out.stopMusic();                                                   // a map change mid-handover
      expect(nodes[0]!.stopped).toBe(16);                                // the fading intro goes now too
      expect(nodes[2]!.stopped).toBe(16);
    } finally { g.AudioContext = was; }
  });

  it('plays the result line on a voice of its own, at the disc\'s level (no gain of its own), and leaves the slot alone', () => {
    const restore = quiet();
    const out = new Recorder(), audio = new GameAudio(out, seeded(1));
    const line = tone(1.37, 22050);
    audio.setData(data([{ name: '^PH_0014', file: 'PH_0014.VAG', sound: line }]));
    restore();
    out.unlock();
    expect(audio.playStream('^PH_0014')).toBe('played');
    expect(out.streams).toEqual([line]);                                 // the decoded buffer itself: no copy scaled down
    expect(out.music).toEqual([]);
    expect(audio.stats().streams.voice).toBe('^PH_0014');
    expect(audio.stats().events.voice).toBe(1);
    expect(audio.playStream('^PH_9999')).toBe('unknown');
    expect(audio.stats().unknownNames['^PH_9999']).toBe(1);
    audio.setMuted(true);
    expect(audio.playStream('^PH_0014')).toBe('muted');
    expect(audio.stats().dropped.muted).toBe(1);
  });

  it('a new map stops the slot and drops the last map\'s streams; data without streams has none', () => {
    const restore = quiet();
    const out = new Recorder(), audio = new GameAudio(out, seeded(1));
    audio.setData(data([{ name: 'MUS_X', file: 'X.VPK', sound: tone(1) }]));
    out.unlock();
    audio.playMusic('MUS_X');
    audio.setData(data(undefined));
    restore();
    expect(out.musicStops).toBeGreaterThanOrEqual(1);
    expect(audio.stats().streams).toEqual({ available: [], music: null, voice: null });
    expect(audio.playMusic('MUS_X')).toBe('unknown');
  });

  it("plays a stream at its group's level: a line (group 2, mono) 0.24995 a side, the music (group 1, stereo) 0.27321 a channel", () => {
    // Research 186 §3.1 STREAM_LEVEL (STRONG): `streamVoiceGains(0x400, -1, channels, master(group))`, the group from
    // the entry's class (`vagStreamGroup`: MUS 1, any other ST 2), in place of one flat level.
    const restore = quiet();
    const out = new Recorder(), audio = new GameAudio(out, seeded(1));
    const line = { ...tone(1.37, 22050), voices: 1 }, win = tone(2);
    audio.setData(data([{ name: '^PH_0014', file: 'PH_0014.VAG', sound: line, group: 2 }, { name: 'MUS_MP_SEAL_WIN_RUS', file: 'MUMP0019.VPK', sound: win, group: 1 }]));
    restore();
    out.unlock();
    expect(audio.playStream('^PH_0014')).toBe('played');
    expect(audio.playMusic('MUS_MP_SEAL_WIN_RUS')).toBe('played');
    const [l] = out.streamGains, m = out.musicGains[0]!;
    expect(l!.left[0]).toBe(8190 / 0x7ffe);                                // 0.24995: 989SND.IRX's pan table, entry 90 = 11584
    expect(l!.left[1]).toBe(8190 / 0x7ffe);
    expect(l!.right).toEqual([0, 0]);
    expect(m.left[0]).toBeCloseTo(0.27321, 5);
    expect(m.left[1]).toBe(0);
    expect(m.right[1]).toBeCloseTo(0.27321, 5);
    expect(m.right[0]).toBe(0);
  });

  it('a stream with no group takes its class from its member: a VPK is the music (group 1), a VAG a line (group 2)', () => {
    const restore = quiet();
    const out = new Recorder(), audio = new GameAudio(out, seeded(1));
    audio.setData(data([{ name: '^PH_0014', file: 'PH_0014.VAG', sound: { ...tone(1), voices: 1 } }, { name: 'MUS_X', file: 'X.VPK', sound: tone(1) }]));
    restore();
    out.unlock();
    audio.playStream('^PH_0014');
    audio.playMusic('MUS_X');
    expect(out.streamGains).toEqual([roundStreamGains(2, 1)]);
    expect(out.musicGains).toEqual([roundStreamGains(1, 2)]);
  });
});

describe('the option masters reach the round (PF-32; research 233 §1)', () => {
  /**
   * A 989snd bank file holding `sounds`, each one TONE grain of one shared tone -- `audio.parity.test.ts`'s builder
   * (research 81 §2's layout), copied, not imported: each sound's `VolGroup` (SFX2 +1) is what 989snd plays it in.
   */
  function bankFile(sounds: readonly { name: string; volGroup: number }[]): Uint8Array {
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
      v.setInt8(o, 100); v.setInt8(o + 1, s.volGroup); v.setInt16(o + 2, 0, true); v.setInt8(o + 4, 1); v.setInt32(o + 8, 8 * i, true);
      v.setUint32(firstGrain + 8 * i, 1 << 24, true);
    });
    v.setInt8(pool + 1, 127); v.setInt8(pool + 2, -60); v.setInt8(pool + 7, 127); v.setUint16(pool + 10, 0x000f, true);
    for (let i = 0; i < 4; i++) b[names + i] = 'TEST'.charCodeAt(i);
    v.setUint32(names + 8, 0x58, true);
    let e = 0;
    for (let k = 0; k < 32; k++) {
      if (!buckets[k]!.length) { v.setInt16(names + 0x18 + 2 * k, -1, true); continue; }
      v.setInt16(names + 0x18 + 2 * k, e, true);
      for (const i of buckets[k]!) {
        const o = names + 0x58 + 20 * e++;
        for (let c = 0; c < sounds[i]!.name.length; c++) b[o + c] = sounds[i]!.name.charCodeAt(c);
        v.setInt16(o + 16, i, true);
      }
      e++;
    }
    const vag = new Uint8Array(16); vag[0] = 0x0c; vag[1] = 1; vag.fill(0x77, 2);
    const file = new Uint8Array(24 + size + 16), f = new DataView(file.buffer);
    f.setUint32(0, 3, true); f.setUint32(4, 2, true); f.setUint32(8, 24, true); f.setUint32(12, size, true); f.setUint32(16, 24 + size, true); f.setUint32(20, 16, true);
    file.set(b, 24); file.set(vag, 24 + size);
    return file;
  }
  const tone = (voices: number): RenderedSound => {
    const left = new Float32Array(100).fill(0.25);
    return { left, right: left.slice(), sendLeft: null, sendRight: null, sampleRate: 32000, voices, samples: [], peak: 0.25 };
  };
  const data = (): SoundData => ({
    archive: 'MP2', banks: [{ file: 'TEST.bnk', bytes: bankFile([{ name: '.STEP', volGroup: 3 }, { name: '.HUD', volGroup: 14 }, { name: '.VOICE', volGroup: 2 }, { name: '.NOGROUP', volGroup: 20 }]) }],
    materials: [], params: [], weapons: [], callbacks: [], defaultMaterial: 0, beds: { outside: [], inside: [] }, emitters: [],
    reverb: { preset: null, indoor: [], outdoor: [] }, missing: [],
    streams: [{ name: '^PH_0014', file: 'PH_0014.VAG', sound: tone(1), group: 2 }, { name: 'MUS_X', file: 'X.VPK', sound: tone(2), group: 1 }],
  });
  const peakOf = (s: RenderedSound): number => s.left.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
  function heard(tuners?: StreamTuners): { bank: Record<string, RenderedSound>; line: StreamVoiceGains; music: StreamVoiceGains } {
    const w = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const out = new Recorder(), audio = new GameAudio(out, seeded(1));
    audio.setData(data());
    w.mockRestore();
    out.unlock();
    if (tuners) audio.setTuners(tuners);
    const bank: Record<string, RenderedSound> = {};
    for (const name of ['.STEP', '.HUD', '.VOICE', '.NOGROUP']) { expect(audio.play(name), name).toBe(true); bank[name] = out.played.at(-1)!; }
    expect(audio.playStream('^PH_0014')).toBe('played');
    expect(audio.playMusic('MUS_X')).toBe('played');
    return { bank, line: out.streamGains.at(-1)!, music: out.musicGains.at(-1)! };
  }

  it("GameAudio.setTuners re-levels every round stream and every bank one-shot by its group's master (a stream's class, a bank sound's VolGroup; BANK_GROUP_READING, SOUND's 0, when none); the defaults change nothing", () => {
    // Research 233 §1: a stream's group by its class (FUN_00342240 D:L241878-241890), a bank sound's its VolGroup
    // (989snd blocksnd.c 161/520 -> valloc.c 304's snd_AdjustVolToGroup); BANK_GROUP_READING (SOUND's 0) when none.
    expect(BANK_GROUP_READING).toBe(0);
    const before = heard(), defaults = heard(TUNER_DEFAULTS);
    for (const name of ['.STEP', '.HUD', '.VOICE']) expect([...defaults.bank[name]!.left], name).toEqual([...before.bank[name]!.left]);
    expect(defaults.line).toEqual(before.line);
    expect(defaults.music).toEqual(before.music);
    expect(peakOf(before.bank['.STEP']!)).toBeGreaterThan(0);
    // SOUND 0.5: the step (group 3) and the HUD sound (group 14) to about a quarter (the square law); the voice (group 2)
    // and both streams unmoved.
    const sound = heard({ ...TUNER_DEFAULTS, sound: 0.5 });
    for (const name of ['.STEP', '.HUD']) expect(peakOf(sound.bank[name]!) / peakOf(before.bank[name]!), name).toBeCloseTo(0.25, 2);
    expect([...sound.bank['.VOICE']!.left]).toEqual([...before.bank['.VOICE']!.left]);
    expect(sound.line).toEqual(before.line);
    expect(sound.music).toEqual(before.music);
    // DIALOG 0.5: the voice and the line follow, the music not; MUSIC 0.37: the music alone.
    const dialog = heard({ ...TUNER_DEFAULTS, dialog: 0.5 });
    expect(peakOf(dialog.bank['.VOICE']!) / peakOf(before.bank['.VOICE']!)).toBeCloseTo(0.25, 2);
    expect([...dialog.bank['.STEP']!.left]).toEqual([...before.bank['.STEP']!.left]);
    expect(dialog.line).toEqual(roundStreamGains(2, 1, { ...TUNER_DEFAULTS, dialog: 0.5 }));
    expect(dialog.line.left[0]).toBe(2047 / 0x7ffe);
    expect(dialog.music).toEqual(before.music);
    const music = heard({ ...TUNER_DEFAULTS, music: 0.37 });
    expect(music.music).toEqual(roundStreamGains(1, 2, { ...TUNER_DEFAULTS, music: 0.37 }));
    expect(music.music.left[0]).toBeLessThan(before.music.left[0]);
    expect(music.line).toEqual(before.line);
  });

  it("a bank sound in a group past 989snd's 15 plays with no master and no square law, the same whatever the options (VOL_NUM_GROUPS; vol.c 439-441)", () => {
    const before = heard(), low = heard({ sound: 0.25, music: 0.25, dialog: 0.25, headset: 0.25 });
    expect([...low.bank['.NOGROUP']!.left]).toEqual([...before.bank['.NOGROUP']!.left]);
    // Its voice halved only, against the step's square at full master: louder, never quieter.
    expect(peakOf(before.bank['.NOGROUP']!)).toBeGreaterThan(peakOf(before.bank['.STEP']!));
  });

  // Product track, an instrument (Trello 7qgKjODV): a weapon name the map's kit table lacks is counted as a miss in
  // `dropped.unknown` (and named in `unknownNames`), apart from `dropped.silent`'s empty distance slot; nothing plays
  // differently -- both still return null.
  it('onFire counts an unknown weapon name in dropped.unknown, a known one not, and an empty distance slot as silent', () => {
    const w = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const out = new Recorder(), audio = new GameAudio(out, seeded(1));
    audio.setData({
      ...data(), fireDistances: { close: 0, med: 90, far: 500 },
      weapons: [{ name: 'KIT GUN', fireClose: '.STEP', fireMed: null, fireFar: '.HUD', reload: null, afterShot: null }],
    });
    w.mockRestore();
    audio.setListener(IDENTITY);
    out.unlock();
    const dropped = () => ({ ...audio.stats().dropped });
    const start = dropped();
    expect(audio.onFire('NOT A KIT GUN', [0, 0, -5])).toBeNull();
    expect(dropped()).toEqual({ ...start, unknown: start.unknown + 1 });
    expect(audio.stats().unknownNames['NOT A KIT GUN']).toBe(1);
    expect(audio.onFire('KIT GUN', [0, 0, -5])).toBe('.STEP');
    expect(dropped()).toEqual({ ...start, unknown: start.unknown + 1 });
    expect(audio.onFire('KIT GUN', [0, 0, -100])).toBeNull();          // the medium slot is empty: silent, not unknown
    expect(dropped()).toEqual({ ...start, unknown: start.unknown + 1, silent: start.silent + 1 });
  });
});

/**
 * M203-FIRE-SOUND (issue #285; research 94 §C4.5): the launchers' reports off MP2's own banks, as `FUN_003d2c50`
 * (D:L479449-479450 -> D:L325524-325535) picks them by the camera's distance -- the M203's (141) and the M79's (143)
 * `FireSoundClose` alone (no Med, no Far on the disc: nothing past 9 m), the LAW's and the RPG LAUNCHER's `.RPG_7` at all
 * three -- and the rounds' own FireAnimName zAnims, which name no sound (`m203he_start`, `law_trail`, `rpg_trail`).
 */
describe('M203-FIRE-SOUND: the launchers\' reports by distance on MP2 (research 94 §C4.5)', () => {
  it.skipIf(!haveSound)('.M203_GREN and .M79_GREN at Close only, .RPG_7 at Close and Far; the rounds\' zAnims silent', async () => {
    const out = new Recorder(), audio = new GameAudio(out);
    audio.setData(await mp2()); out.unlock(); audio.setListener(IDENTITY);
    // 0.2 m: Close; 10 m: Med, inside the M203's RANGE (20 200), so its silence is the empty slot; 60 m: Far.
    const near: [number, number, number] = [0, 0, -2], med: [number, number, number] = [0, 0, -100], far: [number, number, number] = [0, 0, -600];
    expect([audio.onFire('M203', near), audio.onFire('M203', med), audio.onFire('M203', far)]).toEqual(['.M203_GREN', null, null]);
    expect([audio.onFire('MGL', near), audio.onFire('M79', near), audio.onFire('M79', med)]).toEqual(['.M203_GREN', '.M79_GREN', null]);
    expect([audio.onFire('LAW', near), audio.onFire('LAW', med), audio.onFire('RPG LAUNCHER', far)]).toEqual(['.RPG_7', '.RPG_7', '.RPG_7']);
    for (const anim of ['m203he_start', 'law_trail', 'rpg_trail', 'muzzle_m203']) expect([anim, audio.onAnimCallback(anim, near)]).toEqual([anim, null]);
  });
});
