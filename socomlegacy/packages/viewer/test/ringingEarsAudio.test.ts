import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FsAssetSource } from '@s2u/archive/node';
import { parseBankFile, renderSound, SampleCache, type RenderedSound, type ReverbImpulse } from '@s2u/sound';
import { GameAudio, type AudioOut, type LoopHandle } from '../src/audio';
import { RingingEars } from '../src/ringingEars';
import { soundFromDisc } from '../src/soundData';
import { blastGroupGain } from '../src/blastAudio';

/**
 * The ring through the real GameAudio (review 2, M-6): the game plays `.RINGING_EARS` straight from the banks
 * (`FUN_005a0e70` L459230-459233: `FUN_00344f30(0x65f160)`, the bank sound by name, then its `+0x1c` play), not through
 * a zAnim -- no zAnim carries that name, so a callback lookup is silent on every map.
 */

const fixtures = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'));
const haveSound = existsSync(resolve(fixtures, 'RUN/SOUNDS/BNKSTORE.ZAR')) && existsSync(resolve(fixtures, 'RUN/MP2.ZDB'));

class Recorder implements AudioOut {
  unlocked = true;
  played: RenderedSound[] = [];
  groups: number[] = [];
  gains = new Map<number, number>();
  setGroupGain(group: number, gain: number): void { this.gains.set(group, gain); }
  get state(): string { return 'running'; }
  unlock(): void { this.unlocked = true; }
  setGain(): void { /* recorded elsewhere */ }
  play(sound: RenderedSound, group = 0): void { this.played.push(sound); this.groups.push(group); }
  setReverb(_ir: ReverbImpulse | null): void { /* none */ }
  rampReverb(): void { /* none */ }
  loop(): LoopHandle | null { return null; }
}

afterEach(() => { vi.useRealTimers(); });

describe.skipIf(!haveSound)('the ringing ears on GameAudio (Frostfire from the fixtures)', () => {
  it('bounds the live PCM approximation against separately rendered original group masters on real sounds', async () => {
    const data = await soundFromDisc(new FsAssetSource(fixtures), 'RUN/MP2.ZDB', 'MP2');
    const banks = data.banks.filter(b => !b.only).map(b => parseBankFile(b.bytes));
    for (const name of ['.MARK_141_FLASH', '.M4A1_SIL']) {
      const bank = banks.find(b => b.names.has(name))!;
      expect(bank, name).toBeDefined();
      const index = bank.names.get(name)!, samples = new SampleCache(bank.vag);
      const base = renderSound(bank, index, samples, { modifier: 1024, random: () => 0.5 });
      let worst = 0;
      for (const progress of [0, 0.5, 1]) {
        const master = Math.trunc(358 + (1024 - 358) * progress);
        const exact = renderSound(bank, index, samples, { modifier: master, random: () => 0.5 });
        expect(exact.left.length).toBe(base.left.length);
        const ratio = blastGroupGain(1024, 358, progress);
        for (const channel of ['left', 'right'] as const) for (let i = 0; i < base[channel].length; i++) {
          worst = Math.max(worst, Math.abs(base[channel][i]! * ratio - exact[channel][i]!));
        }
      }
      console.log('BLAST REAL PCM MAX ABSOLUTE ERROR', name, worst);
      expect(worst).toBeLessThan(0.0002);
    }
  });
  it('ducks world groups through integer masters, leaves ring/UI and player volume alone, and recovers', async () => {
    vi.useFakeTimers();
    const d = await soundFromDisc(new FsAssetSource(fixtures), 'RUN/MP2.ZDB', 'MP2');
    const out = new Recorder(), audio = new GameAudio(out, () => 0.5);
    audio.setData(d); audio.setVolume(0.8);
    const ears = new RingingEars(audio);
    ears.start(5, 0.35);
    expect(audio.volume()).toBe(0.8);
    expect(out.groups.at(-1)).toBe(4);
    expect([...out.gains.keys()].sort()).toEqual([0, 1, 2, 3, 5, 6]);
    expect(out.gains.get(0)).toBeCloseTo((358 / 1024) ** 2, 9);
    audio.play('.MARK_141_FLASH');
    expect(out.groups.at(-1)).toBe(0);
    vi.advanceTimersByTime(7500);
    expect(out.gains.get(0)).toBeCloseTo((691 / 1024) ** 2, 2);
    audio.setVolume(0.6); audio.setMuted(true);
    vi.advanceTimersByTime(2600);
    expect(audio.volume()).toBe(0.6);
    expect(audio.muted()).toBe(true);
    expect([...out.gains.values()]).toEqual([1, 1, 1, 1, 1, 1]);
    expect(ears.ringing).toBe(false);
  });
  it('plays .RINGING_EARS once from the banks, with no zAnim callbacks at all', async () => {
    vi.useFakeTimers();
    const d = await soundFromDisc(new FsAssetSource(fixtures), 'RUN/MP2.ZDB', 'MP2');
    // Original Frostfire bank fields (research 202 §3.3/§10): different groups, not two names for the same cue.
    const banks = d.banks.filter(b => !b.only).map(b => parseBankFile(b.bytes));
    for (const expected of [
      { name: '.RINGING_EARS', volGroup: 4, vol: 35 },
      { name: '.MARK_141_FLASH', volGroup: 0, vol: 121 },
    ]) {
      const bank = banks.find(b => b.names.has(expected.name));
      expect(bank, expected.name).toBeDefined();
      expect(bank!.sounds[bank!.names.get(expected.name)!]).toMatchObject({ volGroup: expected.volGroup, vol: expected.vol });
    }
    const out = new Recorder(), audio = new GameAudio(out, () => 0.5);
    audio.setData({ ...d, callbacks: [], callbackVolumes: [] });
    expect(audio.has('.RINGING_EARS')).toBe(true);
    new RingingEars(audio).start(5, 0.35);
    expect(out.played).toHaveLength(1);
    expect(out.played[0]!.peak).toBeGreaterThan(0);
    const stats = audio.stats();
    expect(stats.byName['.RINGING_EARS']).toBe(1);
    expect(stats.dropped.silent).toBe(0);
    expect(stats.recent.at(-1)?.name).toBe('.RINGING_EARS');
  });
});
