import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RenderedSound, ReverbImpulse } from '@s2u/sound';
import { GameplayAudioSource } from '../../../tools/gameplayAudioSource';
import { soundFromDisc, type SoundData } from '../src/soundData';
import { resetSoundDecodeRecordForTest } from '../src/soundDecodeRecord';

/**
 * SOUND_JIT_WARM_ADAPTATION (product track, a browser adaptation with no original; the same sounds at the same times):
 * a sound's first render on a page runs the synth cold (the JIT compiles `renderSound` and the envelope on it), so
 * `GameAudio.pump` renders each warm-set sound once, after its samples are decoded, with a throwaway generator and a
 * fresh grain memory, and drops the buffer. The shared generator and grain memory are left exactly as an unwarmed run
 * leaves them, every play still renders in its own call, and nothing is cached.
 */

const calls = vi.hoisted(() => ({ n: 0, ms: [] as number[], names: [] as number[] }));
vi.mock('@s2u/sound', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@s2u/sound')>();
  return {
    ...mod,
    renderSound: (...args: Parameters<typeof mod.renderSound>) => {
      const t0 = performance.now();
      const r = mod.renderSound(...args);
      calls.ms.push(performance.now() - t0);
      calls.names.push(args[1]);
      calls.n++;
      return r;
    },
  };
});

const { GameAudio, soundWarmSet } = await import('../src/audio');
type AudioOut = import('../src/audio').AudioOut;
type LoopHandle = import('../src/audio').LoopHandle;

class Recorder implements AudioOut {
  unlocked = false;
  played: RenderedSound[] = [];
  get state(): string { return this.unlocked ? 'running' : 'locked'; }
  unlock(): void { this.unlocked = true; }
  setGain(): void {}
  play(sound: RenderedSound): void { this.played.push(sound); }
  setReverb(_ir: ReverbImpulse | null): void {}
  rampReverb(): void {}
  loop(): LoopHandle | null { return null; }
}

/** A seeded generator that counts its draws: the shared one's state is its draw count. */
function seeded(seed: number): { next: () => number; draws: () => number } {
  let n = 0;
  return { next: (): number => { n++; seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x80000000; }, draws: () => n };
}
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const PROBES = ['.MARK_141_FLASH', '.RINGING_EARS', '.GREN_MED', '.M16A2'];

afterEach(() => resetSoundDecodeRecordForTest());

const disc = process.env.SOCOM_DISC;
const haveDisc = !!disc && existsSync(join(disc, 'RUN/SOUNDS/BNKSTORE.ZAR'));
let mp2: SoundData | undefined;
async function data(): Promise<SoundData> {
  mp2 ??= await soundFromDisc(new GameplayAudioSource(disc!), 'RUN/MP2.ZDB', 'MP2');
  return mp2;
}
const pcm = (s: RenderedSound): number[][] => [Array.from(s.left), Array.from(s.right), Array.from(s.sendLeft ?? []), Array.from(s.sendRight ?? [])];
function drain(audio: InstanceType<typeof GameAudio>): void {
  for (let i = 0; i < 1000 && audio.stats().decode.pending > 0; i++) audio.pump(1000);
}

describe.skipIf(!haveDisc)('the synth warmed at the load (SOUND_JIT_WARM_ADAPTATION, MP2)', () => {
  it('timing (a log, not a pin): the first real play before and after the warm', async () => {
    const d = await data();
    // Before: the samples decoded (LATER 730's warm), the synth cold -- this file's first renders.
    const cold = new GameAudio(new Recorder(), seeded(1).next);
    cold.setData(d);
    const coldOut = (cold as unknown as { out: Recorder }).out;
    for (const name of PROBES) (cold as unknown as { warmSound(n: string): void }).warmSound(name);
    coldOut.unlock();
    const before: string[] = [];
    for (const name of PROBES.slice(0, 2)) { calls.ms.length = 0; cold.play(name, null); before.push(`${name} ${calls.ms[0]!.toFixed(2)} ms`); }
    // After: a fresh page's audio, drained (decode and warm renders), then its first plays.
    const warm = new GameAudio(new Recorder(), seeded(1).next);
    warm.setData(d);
    calls.ms.length = 0;
    drain(warm);
    const warmCost = calls.ms.map((ms) => ms.toFixed(2));
    (warm as unknown as { out: Recorder }).out.unlock();
    const after: string[] = [];
    for (const name of PROBES.slice(0, 2)) { calls.ms.length = 0; warm.play(name, null); after.push(`${name} ${calls.ms[0]!.toFixed(2)} ms`); }
    console.log(`[jit-warm] before (cold synth): ${before.join(', ')}\n[jit-warm] warm renders (ms each, in pump order): ${warmCost.join(' ')}\n[jit-warm] after: ${after.join(', ')}`);
  });

  it('the warm leaves the shared generator and grain memory untouched: the first plays match an unwarmed audio, byte for byte', async () => {
    const d = await data();
    const warmRng = seeded(11), coldRng = seeded(11);
    const warmOut = new Recorder(), coldOut = new Recorder();
    const warm = new GameAudio(warmOut, warmRng.next), cold = new GameAudio(coldOut, coldRng.next);
    warm.setData(d); cold.setData(d);
    drain(warm);
    expect(warmRng.draws()).toBe(0);                            // the warm drew nothing from the shared generator
    warmOut.unlock(); coldOut.unlock(); warm.setListener(IDENTITY); cold.setListener(IDENTITY);
    for (const name of [...PROBES, ...PROBES]) { warm.play(name, [20, 0, -40]); cold.play(name, [20, 0, -40]); }
    expect(warmOut.played).toHaveLength(PROBES.length * 2);
    expect(warmOut.played.map(pcm)).toEqual(coldOut.played.map(pcm));
    expect(warmRng.draws()).toBe(coldRng.draws());
  });

  it('pump renders each warm-set sound once, at most one a pump; a play after renders once more (nothing cached)', async () => {
    const d = await data();
    const out = new Recorder(), audio = new GameAudio(out, seeded(5).next);
    audio.setData(d);
    const expected = soundWarmSet(d).filter((n) => audio.has(n)).length;
    expect(expected).toBeGreaterThan(4);
    calls.n = 0;
    let pumps = 0;
    for (; pumps < 1000 && audio.stats().decode.pending > 0; pumps++) {
      const n = calls.n;
      audio.pump(1000);
      expect(calls.n - n).toBeLessThanOrEqual(1);              // one warm render a frame slice, never more
    }
    expect(calls.n).toBe(expected);
    out.unlock();
    calls.n = 0;
    audio.play('.MARK_141_FLASH', null);
    expect(calls.n).toBe(1);
    audio.play('.MARK_141_FLASH', null);
    expect(calls.n).toBe(2);
  });

  it('a load (review F1): `warmDuringLoad` renders the whole set on its own callbacks, one each, before the first frame', async () => {
    const d = await data();
    const out = new Recorder(), audio = new GameAudio(out, seeded(5).next);
    audio.setData(d);
    const expected = soundWarmSet(d).filter((n) => audio.has(n)).length;
    const scheduled: (() => void)[] = [];
    calls.n = 0;
    audio.warmDuringLoad((run) => { scheduled.push(run); });
    for (let i = 0; i < 2000 && scheduled.length > 0; i++) {
      const n = calls.n;
      scheduled.shift()!();
      expect(calls.n - n).toBeLessThanOrEqual(1);              // one render a callback
    }
    expect(scheduled).toHaveLength(0);
    expect(calls.n).toBe(expected);                             // every warm-set render ran in the load
    expect(audio.stats().decode.pending).toBe(0);
    audio.endLoad();                                            // the first match frame
    calls.n = 0;
    audio.setListener(IDENTITY);                                // the frame's pump: nothing left to render
    expect(calls.n).toBe(0);
  });

  it('a load that ends before the set is done: the lane stops and the remainder continues under pump', async () => {
    const d = await data();
    const out = new Recorder(), audio = new GameAudio(out, seeded(5).next);
    audio.setData(d);
    const expected = soundWarmSet(d).filter((n) => audio.has(n)).length;
    const scheduled: (() => void)[] = [];
    calls.n = 0;
    audio.warmDuringLoad((run) => { scheduled.push(run); });
    for (let i = 0; i < 80 && scheduled.length > 0; i++) scheduled.shift()!();
    const inLoad = calls.n;
    expect(inLoad).toBeGreaterThan(0);
    expect(inLoad).toBeLessThan(expected);
    audio.endLoad();
    for (const run of scheduled.splice(0)) run();               // a callback already queued at the end does nothing
    expect(scheduled).toHaveLength(0);
    expect(calls.n).toBe(inLoad);
    for (let i = 0; i < 1000 && audio.stats().decode.pending > 0; i++) {
      const n = calls.n;
      audio.pump(1000);
      expect(calls.n - n).toBeLessThanOrEqual(1);
    }
    expect(calls.n).toBe(expected);
  });
});

describe.skipIf(!haveDisc)('a prepared match warms before its attach (re-review F1: `stageWarm`, MP2)', () => {
  /** Runs every scheduled callback (each may schedule the next) and returns how many ran. */
  function runAll(scheduled: (() => void)[]): number {
    let n = 0;
    for (; n < 4000 && scheduled.length > 0; n++) scheduled.shift()!();
    return n;
  }

  it('every warm-set render runs before the attach; nothing is installed; setData adopts the staged banks (no second decode)', async () => {
    const d = await data();
    const out = new Recorder(), audio = new GameAudio(out, seeded(21).next);
    const probe = new GameAudio(new Recorder(), seeded(0).next);
    probe.setData(d);
    const expected = soundWarmSet(d).filter((n) => probe.has(n)).length;
    const scheduled: (() => void)[] = [];
    calls.n = 0;
    audio.stageWarm(d, (run) => { scheduled.push(run); });
    expect(audio.has('.MARK_141_FLASH')).toBe(false);           // staged, not installed: nothing audible before the attach
    runAll(scheduled);
    expect(calls.n).toBe(expected);                             // the whole set rendered in the prepare
    const warmed = audio.stats().decode.warmed;
    expect(warmed).toBeGreaterThan(0);
    out.unlock();
    expect(audio.play('.MARK_141_FLASH', null)).toBe(false);    // still nothing heard before the attach
    audio.setData(d);                                           // the attach: the same object
    expect(audio.stats().decode.pending).toBe(0);
    expect(audio.stats().decode.warmed).toBe(warmed);           // adopted, not decoded again
    calls.n = 0;
    drain(audio);
    expect(calls.n).toBe(0);                                    // nothing left for the frames
    // The first plays: no decode in their call, and byte for byte an unwarmed audio's.
    const coldOut = new Recorder(), cold = new GameAudio(coldOut, seeded(21).next);
    cold.setData(d); coldOut.unlock();
    for (const name of PROBES) { audio.play(name, null); cold.play(name, null); }
    expect(audio.stats().decode.cold).toBe(0);
    expect(out.played.map(pcm)).toEqual(coldOut.played.map(pcm));
  });

  it('a prepare dropped before its attach (setData(null)) stops the lane: a queued callback does nothing and schedules nothing', async () => {
    const d = await data();
    const audio = new GameAudio(new Recorder(), seeded(3).next);
    const scheduled: (() => void)[] = [];
    calls.n = 0;
    audio.stageWarm(d, (run) => { scheduled.push(run); });
    for (let i = 0; i < 6; i++) scheduled.shift()!();
    const ran = calls.n;
    audio.setData(null);                                        // the prepare's teardown (`sound.dispose`)
    expect(runAll(scheduled)).toBe(1);                          // the one queued callback ran, and asked for no other
    expect(calls.n).toBe(ran);
    expect(audio.has('.MARK_141_FLASH')).toBe(false);
  });

  it('setData with other data drops the staged banks: the new data is built and warmed afresh', async () => {
    const d = await data();
    const audio = new GameAudio(new Recorder(), seeded(3).next);
    const scheduled: (() => void)[] = [];
    audio.stageWarm(d, (run) => { scheduled.push(run); });
    runAll(scheduled);
    const other = { ...d };
    audio.setData(other);
    expect(audio.stats().decode.pending).toBe(soundWarmSet(other).length);   // not adopted: its whole warm set ahead
  });
});

describe('the match starts the load lane at its sound lines and ends it at the first frame (review F1; source pin)', () => {
  it('matchMount: `warmDuringLoad` in `soundLines`, `endLoad` with the first world frame', () => {
    const src = readFileSync(new URL('../src/matchMount.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/const soundLines = \(a: MatchAssets\): void => \{(?:(?!\n {2}\};)[^])*sound\.audio\.warmDuringLoad\(/);
    expect(src).toMatch(/if \(firstWorldFrame\) \{[^}]*sound\.audio\.endLoad\(\)/);
    // Re-review F1: a prepare (not attached) stages the warm on its placed sound data, adopted at the attach.
    expect(src).toMatch(/if \(attached\) soundLines\(a\);[^\n]*\n\s*else if \(a\.sound\) sound\.audio\.stageWarm\(a\.sound\.data, /);
  });
});
