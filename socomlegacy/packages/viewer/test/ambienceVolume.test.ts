import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FsAssetSource } from '@s2u/archive/node';
import type { RenderedSound, ReverbImpulse } from '@s2u/sound';
import { Settings } from '@s2u/card';
import { GameAudio, type AudioOut, type LoopHandle } from '../src/audio';
import { soundFromDisc, type SoundData } from '../src/soundData';
import {
  AMBIENCE_VOLUME_DEFAULT_ADAPTATION, AMBIENCE_VOLUME_KEY, AMBIENCE_VOLUME_MIN_ADAPTATION, AMBIENCE_VOLUME_VALUES, ambienceGainOf, readAmbienceVolume, saveAmbienceVolume,
} from '../src/ambienceVolume';

/**
 * LATER 1177(b) (product track, a browser adaptation; the owner's word, INTAKE 180): the launcher's ambience-only volume --
 * a gain on the ambience the mission's scripts start (the beds, the emitters and the one-shot layers, the gusts: the
 * controller's ruling) and nothing else: weapons, steps, voice and the ladder slide stay as they are. Its default is the
 * original's mix (100%: gain 1), byte for byte. The original has no such option (FINDING-X9: every placed sound sits under
 * SOUND_VOLUME, `FUN_00342670` D:L241913-241955, nothing per category).
 */

const fixtures = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'));
const haveSound = existsSync(resolve(fixtures, 'RUN/SOUNDS/BNKSTORE.ZAR')) && existsSync(resolve(fixtures, 'RUN/MP2.ZDB'));
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** An output that records the loops' gains and each one-shot with the gain it was handed. */
class Recorder implements AudioOut {
  unlocked = false;
  played: { sound: RenderedSound; gain: number | undefined; args: number }[] = [];
  loops: { sound: RenderedSound; gains: [number, number] }[] = [];
  get state(): string { return this.unlocked ? 'running' : 'locked'; }
  unlock(): void { this.unlocked = true; }
  setGain(): void { /* the master: not the ambience's */ }
  play(...args: [sound: RenderedSound, group?: number, gain?: number]): void { this.played.push({ sound: args[0], gain: args[2], args: args.length }); }
  setReverb(_ir: ReverbImpulse | null): void { /* none */ }
  rampReverb(): void { /* none */ }
  loop(sound: RenderedSound): LoopHandle {
    const l = { sound, gains: [0, 0] as [number, number] };
    this.loops.push(l);
    return { setGains: (left, right) => { l.gains = [left, right]; }, stop: () => undefined };
  }
}

let data: SoundData | null | undefined;
async function mp2(): Promise<SoundData> {
  if (data === undefined) data = await soundFromDisc(new FsAssetSource(fixtures), 'RUN/MP2.ZDB', 'MP2');
  if (!data) throw new Error('no sound data');
  return data;
}

/** MP2 outdoors with its ambience up at `volume` (undefined: the setting left alone), 12 s on so the gusts have played. */
async function ambienceAt(volume: number | undefined) {
  let now = 0;
  const out = new Recorder();
  const audio = new GameAudio(out, () => 0.5, { now: () => now, ...(volume === undefined ? {} : { ambienceVolume: () => volume }) });
  audio.setData(await mp2());
  out.unlock();
  audio.setAmbience(true);
  audio.setEnvironment(false, 0);
  audio.pump(1e9);
  audio.setListener(IDENTITY);
  now = 12; audio.setListener(IDENTITY);
  const gusts = audio.stats().recent.filter((r) => r.event === 'ambience');
  return { audio, out, gusts };
}

describe('LATER 1177(b): the launcher\'s ambience volume (a browser adaptation)', () => {
  it("the setting: 50-100% in tens (the owner's floor), unset is 100% (the original's mix), kept in this browser", () => {
    expect(AMBIENCE_VOLUME_VALUES).toEqual([50, 60, 70, 80, 90, 100]);
    expect(AMBIENCE_VOLUME_MIN_ADAPTATION).toBe(50);
    expect(AMBIENCE_VOLUME_DEFAULT_ADAPTATION).toBe(100);
    // A real `Settings` over a string store, as the browser's localStorage is (the review's F1: it keeps strings).
    const kept = new Map<string, string>();
    const settings = new Settings(() => ({ getItem: (k) => kept.get(k) ?? null, setItem: (k, v) => { kept.set(k, String(v)); }, removeItem: (k) => { kept.delete(k); } }), () => undefined);
    expect(readAmbienceVolume(settings)).toBe(100);
    saveAmbienceVolume(50, settings);
    expect(kept.get(AMBIENCE_VOLUME_KEY)).toBe('50');
    expect(readAmbienceVolume(settings)).toBe(50);
    for (const bad of ['loud', '55', '', ' 50', '1e2', '-10', '110', ' 0', '05']) {
      kept.set(AMBIENCE_VOLUME_KEY, bad);
      expect(readAmbienceVolume(settings), `stored ${JSON.stringify(bad)}`).toBe(100);
    }
    expect([ambienceGainOf(100), ambienceGainOf(70), ambienceGainOf(50)]).toEqual([1, 0.7, 0.5]);
  });

  it("the owner's floor: a value v0.4.26 stored below 50% (its 0-40% tens) reads as 50%; the gain never falls below 0.5", () => {
    const kept = new Map<string, string>();
    const settings = new Settings(() => ({ getItem: (k) => kept.get(k) ?? null, setItem: (k, v) => { kept.set(k, String(v)); }, removeItem: (k) => { kept.delete(k); } }), () => undefined);
    for (const old of ['0', '10', '20', '30', '40']) {
      kept.set(AMBIENCE_VOLUME_KEY, old);
      expect(readAmbienceVolume(settings), `stored ${JSON.stringify(old)}`).toBe(50);
    }
    expect([ambienceGainOf(0), ambienceGainOf(30), ambienceGainOf(49)]).toEqual([0.5, 0.5, 0.5]);
  });

  it.skipIf(!haveSound)('at the default the mix is unchanged, byte for byte: every loop\'s gains and every one-shot as without the setting', async () => {
    const none = await ambienceAt(undefined), full = await ambienceAt(1);
    expect(none.out.loops.length).toBeGreaterThan(0);
    expect(full.out.loops.map((l) => l.gains)).toEqual(none.out.loops.map((l) => l.gains));
    expect(full.gusts.map((g) => [g.name, g.vol])).toEqual(none.gusts.map((g) => [g.name, g.vol]));
    expect(full.out.played.map((p) => p.gain ?? 1)).toEqual(none.out.played.map((p) => p.gain ?? 1));
  });

  it.skipIf(!haveSound)('at 0.5 the beds, the emitters and the gusts play at half gain; a weapon\'s sound is untouched', async () => {
    const full = await ambienceAt(1), half = await ambienceAt(0.5);
    const sounding = full.out.loops.map((l, i) => [l, half.out.loops[i]!] as const).filter(([l]) => l.gains[0] > 0 || l.gains[1] > 0);
    expect(sounding.length, 'harness: the outdoor bed (and any emitter in reach) sounding').toBeGreaterThan(0);
    for (const [f, h] of sounding) expect(h.gains).toEqual([f.gains[0] * 0.5, f.gains[1] * 0.5]);
    // The gusts: the same render (its 989snd volume unchanged), handed to the output at half gain.
    expect(half.gusts.length, 'harness: the gusts have played by 12 s').toBeGreaterThan(0);
    expect(half.gusts.map((g) => [g.name, g.vol])).toEqual(full.gusts.map((g) => [g.name, g.vol]));
    expect(half.out.played.slice(0, half.gusts.length).map((p) => p.gain)).toEqual(half.gusts.map(() => 0.5));
    // A weapon's report (not ambience): its render and its gain as at 100%.
    const marks = [full.out.played.length, half.out.played.length];
    expect(full.audio.play('.GUN_EMPTY')).toBe(true);
    expect(half.audio.play('.GUN_EMPTY')).toBe(true);
    const [f, h] = [full.out.played[marks[0]!]!, half.out.played[marks[1]!]!];
    // A play without a gain: the output called as before -- two arguments, no gain handed (not even `undefined`).
    expect([f.args, h.args, f.gain, h.gain]).toEqual([2, 2, undefined, undefined]);
    expect(Array.from(h.sound.left)).toEqual(Array.from(f.sound.left));
  });

  it.skipIf(!haveSound)('the setting moved while the ambience plays: the loops follow at once (setAmbienceVolume)', async () => {
    const run = await ambienceAt(1);
    const before = run.out.loops.map((l) => l.gains);
    run.audio.setAmbienceVolume(0.5);
    expect(run.out.loops.map((l) => l.gains)).toEqual(before.map(([a, b]) => [a * 0.5, b * 0.5]));
  });

  it.skipIf(!haveSound)('the mixer never applies below 0.5: a lower gain handed in, at the start or moved while playing, plays as 0.5', async () => {
    const half = await ambienceAt(0.5), zero = await ambienceAt(0);
    expect(zero.out.loops.map((l) => l.gains)).toEqual(half.out.loops.map((l) => l.gains));
    expect(zero.out.played.map((p) => p.gain)).toEqual(half.out.played.map((p) => p.gain));
    const run = await ambienceAt(1);
    const before = run.out.loops.map((l) => l.gains);
    run.audio.setAmbienceVolume(0.2);
    expect(run.out.loops.map((l) => l.gains)).toEqual(before.map(([a, b]) => [a * 0.5, b * 0.5]));
  });
});
